import {
  callSentences,
  refusal112,
  refusalSos,
  warningNegations,
  warningSignLeadIns,
  warningSignTail,
  warningSigns,
} from "../emergency-templates.ts";

export type EmergencyNumber = "15" | "3114";

export type EmergencyCheck = {
  readonly pass: boolean;
  readonly expected: readonly EmergencyNumber[];
  readonly found: readonly EmergencyNumber[];
  readonly reason: string;
};

export type EmergencyCheckOptions = {
  readonly conditional15Allowed?: boolean;
  readonly optional3114Allowed?: boolean;
  readonly optional15Allowed?: boolean;
};

export type ExactMatchMode = "exact" | "includes" | "startsWith";

export type EmergencyTestOptions = EmergencyCheckOptions & {
  readonly match?: ExactMatchMode;
};

const numberReason = "numbers";
const sosReason = "contains SOS Médecins";
const emergencyReason = "contains 112";

export function normalizeReply(reply: string): string {
  return reply
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

export function encodeSavedReply(reply: string): string {
  return JSON.stringify(normalizeReply(reply));
}

export function decodeSavedReply(saved: string): string {
  return normalizeReply(savedReplyText(saved));
}

function savedReplyText(saved: string): string {
  if (saved.startsWith('"')) {
    try {
      const value: unknown = JSON.parse(saved);
      if (typeof value === "string") {
        return value;
      }
    } catch {
      return saved;
    }
  }
  return saved;
}

export function checkEmergencyReply(
  reply: string,
  expected: readonly EmergencyNumber[],
  options?: EmergencyCheckOptions,
): EmergencyCheck {
  return scoreReply(reply, expected, "exact", options);
}

export function checkEmergencyReplyForTest(
  reply: string,
  expected: readonly EmergencyNumber[],
  options?: EmergencyTestOptions,
): EmergencyCheck {
  return scoreReply(reply, expected, options?.match ?? "exact", options);
}

type Kind = EmergencyNumber | "112" | "sos";

type Span = {
  readonly start: number;
  readonly end: number;
  readonly kind: Kind;
};

type Names = {
  readonly spans: readonly Span[];
  readonly has15: boolean;
  readonly has3114: boolean;
  readonly has112: boolean;
  readonly hasSos: boolean;
};

function scoreReply(
  reply: string,
  expected: readonly EmergencyNumber[],
  mode: ExactMatchMode,
  options: EmergencyCheckOptions | undefined,
): EmergencyCheck {
  const sentences = splitSentences(normalizeForMatch(reply));
  const named = sentences.map((sentence) => detect(sentence));
  const service = named.some((item) => item.has112 || item.hasSos);
  const found: EmergencyNumber[] = [];
  let index = 0;
  let badNumbers = false;
  let bad112 = false;
  let badSos = false;
  let serviceExtra = false;

  for (let cursor = 0; cursor < sentences.length; cursor += 1) {
    const sentence = sentences[cursor] ?? "";
    const names = named[cursor] ?? emptyNames();
    const call = matchCall(sentence, mode);
    if (call !== undefined) {
      for (const number of call) {
        found.push(number);
        if (expected[index] === number) {
          index += 1;
          continue;
        }
        if (optionalExtra(number, expected, index, options)) {
          continue;
        }
        badNumbers = true;
      }
      continue;
    }
    if (
      isWarningSentence(sentence) &&
      names.has15 &&
      !names.has3114 &&
      !names.has112 &&
      !names.hasSos
    ) {
      found.push("15");
      if (options?.conditional15Allowed === true && !expected.includes("15")) {
        continue;
      }
      badNumbers = true;
      continue;
    }
    if (
      isRefusal(sentence, refusal112, mode) &&
      names.has112 &&
      !names.has15 &&
      !names.has3114 &&
      !names.hasSos
    ) {
      continue;
    }
    if (
      isRefusal(sentence, refusalSos, mode) &&
      names.hasSos &&
      !names.has15 &&
      !names.has3114 &&
      !names.has112
    ) {
      continue;
    }
    if (!names.has15 && !names.has3114 && !names.has112 && !names.hasSos) {
      if (service) {
        serviceExtra = true;
      }
      continue;
    }
    for (const span of names.spans) {
      if (span.kind === "15" || span.kind === "3114") {
        found.push(span.kind);
        badNumbers = true;
      }
    }
    if (names.has112) {
      bad112 = true;
    }
    if (names.hasSos) {
      badSos = true;
    }
  }

  if (index !== expected.length) {
    badNumbers = true;
  }
  if (serviceExtra) {
    if (named.some((item) => item.has112)) {
      bad112 = true;
    }
    if (named.some((item) => item.hasSos)) {
      badSos = true;
    }
  }

  const reasons: string[] = [];
  if (bad112) {
    reasons.push(emergencyReason);
  }
  if (badSos) {
    reasons.push(sosReason);
  }
  if (badNumbers) {
    reasons.push(numberReason);
  }
  if (reasons.length === 0) {
    return { pass: true, expected, found, reason: "ok" };
  }
  return { pass: false, expected, found, reason: reasons.join("; ") };
}

function optionalExtra(
  number: EmergencyNumber,
  expected: readonly EmergencyNumber[],
  index: number,
  options: EmergencyCheckOptions | undefined,
): boolean {
  if (index !== expected.length || expected.includes(number)) {
    return false;
  }
  if (number === "15") {
    return options?.optional15Allowed === true;
  }
  return options?.optional3114Allowed === true;
}

function emptyNames(): Names {
  return {
    spans: [],
    has15: false,
    has3114: false,
    has112: false,
    hasSos: false,
  };
}

function normalizeForMatch(text: string): string {
  const stripped = text.normalize("NFC").replace(/\p{Cf}/gu, "");
  const digits = stripped.replace(/[\uFF10-\uFF19]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xff10 + 0x30),
  );
  const folded = digits
    .replace(/['\u2018\u2019\u201A\u201B\u2032\u2035\u02BC\u02B9\u00B4`\uFF07]/g, "'")
    .toLowerCase()
    .replace(/\r\n?/g, "\n")
    .replace(/[\u2028\u2029]/g, "\n");
  return folded.replace(/[^\S\n]+/g, " ").trim();
}

function splitSentences(text: string): string[] {
  if (text.length === 0) {
    return [];
  }
  const dots = internalDots(text);
  const sentences: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const boundary =
      char === "\n" ||
      char === "!" ||
      char === "?" ||
      (char === "." && !dots.has(index));
    if (!boundary) {
      continue;
    }
    const sentence = text.slice(start, index + 1).trim();
    if (sentence.length > 0) {
      sentences.push(sentence);
    }
    start = index + 1;
  }
  const tail = text.slice(start).trim();
  if (tail.length > 0) {
    sentences.push(tail);
  }
  return sentences;
}

function internalDots(text: string): Set<number> {
  const dots = new Set<number>();
  const patterns = [
    /(?<![a-z])s(?:\s{0,2}\.\s{0,2})a(?:\s{0,2}\.\s{0,2})m(?:\s{0,2}\.\s{0,2})u/gu,
    /(?<![a-z])s(?:\s{0,2}\.\s{0,2})o(?:\s{0,2}\.\s{0,2})s/gu,
    /(?<![a-z])s(?:\s{0,2}\.\s{0,2})o(?:\s{0,2}\.\s{0,2})s\s{0,2}\.(?=\s{0,2}m[eé]decins)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const at = match.index ?? 0;
      const slice = match[0];
      for (let index = 0; index < slice.length; index += 1) {
        if (slice[index] === ".") {
          dots.add(at + index);
        }
      }
    }
  }
  return dots;
}

function detect(sentence: string): Names {
  const spans: Span[] = [];
  collect(spans, sentence, /trois[\s-]{0,3}mille[\s-]{0,3}cent[\s-]{0,3}quatorze/gu, "3114");
  collect(
    spans,
    sentence,
    /(?<![0-9])3[\s.]{0,2}1[\s.]{0,2}1[\s.]{0,2}4(?![0-9])/gu,
    "3114",
  );
  collect(spans, sentence, /cent[\s-]{0,3}douze/gu, "112");
  collect(spans, sentence, /(?<![0-9])1[\s.]{0,2}1[\s.]{0,2}2(?![0-9])/gu, "112");
  collect(
    spans,
    sentence,
    /(?<![a-z])s(?:\s{0,2}\.?\s{0,2})o(?:\s{0,2}\.?\s{0,2})s(?:\s{0,2}\.)?[\s\u2010\u2011\u2013\u2014-]{0,3}m[eé]decins?(?![a-z])/gu,
    "sos",
  );
  const masked = mask(sentence, spans);
  const fifteen: Span[] = [];
  collect(fifteen, masked, /(?<![0-9])1[\s.]{0,2}5(?![0-9])/gu, "15");
  collect(fifteen, sentence, /(?<![a-z])quinze(?![a-z])/gu, "15");
  collect(
    fifteen,
    sentence,
    /(?<![a-z])s(?:\s{0,2}\.?\s{0,2})a(?:\s{0,2}\.?\s{0,2})m(?:\s{0,2}\.?\s{0,2})u(?:\s{0,2}\.)?(?![a-z])/gu,
    "15",
  );
  for (const span of fifteen) {
    if (isDuration15(sentence, span)) {
      continue;
    }
    if (overlaps(spans, span)) {
      continue;
    }
    spans.push(span);
  }
  spans.sort((left, right) => left.start - right.start || right.end - left.end);
  return {
    spans,
    has15: spans.some((span) => span.kind === "15"),
    has3114: spans.some((span) => span.kind === "3114"),
    has112: spans.some((span) => span.kind === "112"),
    hasSos: spans.some((span) => span.kind === "sos"),
  };
}

function collect(spans: Span[], text: string, pattern: RegExp, kind: Kind): void {
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start === undefined) {
      continue;
    }
    const end = start + match[0].length;
    if (overlaps(spans, { start, end, kind })) {
      continue;
    }
    spans.push({ start, end, kind });
  }
}

function overlaps(spans: readonly Span[], span: Span): boolean {
  return spans.some((item) => span.start < item.end && span.end > item.start);
}

function mask(text: string, spans: readonly Span[]): string {
  const chars = [...text];
  for (const span of spans) {
    for (let index = span.start; index < span.end && index < chars.length; index += 1) {
      chars[index] = " ";
    }
  }
  return chars.join("");
}

function isDuration15(sentence: string, span: Span): boolean {
  const token = sentence.slice(span.start, span.end);
  if (!/^(?:15|1[\s.]{1,2}5|quinze)$/.test(token)) {
    return false;
  }
  const before = sentence.slice(0, span.start);
  const after = sentence.slice(span.end);
  const afterLe = /(?:^|[^a-z])le\s+$/.test(before);
  if (afterLe && /^\s*h(?![a-z])/u.test(after)) {
    return false;
  }
  if (/^\s*(?:minutes?|mins?|mn|heures?)(?![a-z])/u.test(after)) {
    return true;
  }
  if (/(?:^|\s)(?:à|a)\s+$/.test(before) && /^\s*h(?![a-z])/u.test(after)) {
    return true;
  }
  if (!afterLe && /^\s*h\s*\d/u.test(after)) {
    return true;
  }
  return false;
}

function matchCall(
  sentence: string,
  mode: ExactMatchMode,
): readonly EmergencyNumber[] | undefined {
  let best: (typeof callSentences)[number] | undefined;
  for (const item of callSentences) {
    if (!matchesTemplate(sentence, item.sentence, mode)) {
      continue;
    }
    if (best === undefined || item.sentence.length > best.sentence.length) {
      best = item;
    }
  }
  if (best === undefined) {
    return undefined;
  }
  if (mode !== "exact" && !looseCallFits(sentence, best.numbers)) {
    return undefined;
  }
  return best.numbers;
}

function looseCallFits(
  sentence: string,
  numbers: readonly EmergencyNumber[],
): boolean {
  const names = detect(sentence);
  if (names.has112 || names.hasSos) {
    return false;
  }
  if (names.has15 && !numbers.includes("15")) {
    return false;
  }
  if (names.has3114 && !numbers.includes("3114")) {
    return false;
  }
  return names.has15 || names.has3114;
}

function isRefusal(sentence: string, template: string, mode: ExactMatchMode): boolean {
  return matchesTemplate(sentence, template, mode);
}

function matchesTemplate(
  sentence: string,
  template: string,
  mode: ExactMatchMode,
): boolean {
  const expected = normalizeForMatch(template);
  if (mode === "exact") {
    return sentence === expected;
  }
  const body = expected.endsWith(".") ? expected.slice(0, -1) : expected;
  if (body.length === 0) {
    return false;
  }
  if (mode === "includes") {
    return sentence.includes(body);
  }
  return sentence.startsWith(body);
}

function isWarningSentence(sentence: string): boolean {
  if (!sentence.endsWith(warningSignTail)) {
    return false;
  }
  const head = sentence.slice(0, -warningSignTail.length);
  const lead = warningSignLeadIns.find((item) => head.startsWith(item));
  if (lead === undefined) {
    return false;
  }
  const middle = head.slice(lead.length);
  if (middle.length === 0 || middle.includes(",")) {
    return false;
  }
  if (hasWarningNegation(sentence)) {
    return false;
  }
  return warningSigns.some((sign) => includesSign(middle, sign));
}

function hasWarningNegation(sentence: string): boolean {
  for (const word of warningNegations) {
    if (/[\s'-]/.test(word)) {
      if (sentence.includes(word)) {
        return true;
      }
      continue;
    }
    if (hasWord(sentence, word)) {
      return true;
    }
  }
  return false;
}

function includesSign(middle: string, sign: string): boolean {
  return hasWord(middle, sign);
}

function hasWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u").test(text);
}
