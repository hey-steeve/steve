import { foldApostrophes, lineBreakChars } from "../emergency-templates.ts";
import { type DetectedKind, detectEmergencyNumbers } from "./check.ts";

export type PromptNumberRow = {
  readonly sentence: string;
  readonly numbers: readonly DetectedKind[];
};

export type Sentence = {
  readonly text: string;
  readonly start: number;
  readonly end: number;
};

const excerptLength = 20;

function escapeInvisible(text: string): string {
  return text.replace(/[\p{C}\p{Z}\p{M}]/gu, (char) => {
    if (char === " ") {
      return char;
    }
    if (char === "\n") {
      return "\\n";
    }
    if (char === "\r") {
      return "\\r";
    }
    const code = (char.codePointAt(0) ?? 0).toString(16).toUpperCase();
    return `\\u${code.padStart(4, "0")}`;
  });
}

// A short raw excerpt that starts at index, with invisible characters written as
// escapes so the failure message shows what a diff would hide.
function excerptAt(text: string, index: number): string {
  return escapeInvisible([...text.slice(index)].slice(0, excerptLength).join(""));
}

// The detector reads the normalized text, the sentences come from the raw text, and
// the guard maps one onto the other by offset. That is sound only when the
// normalization maps every code unit to one code unit: the apostrophe fold and lower
// case, nothing else. Anything that changes the length, or that changes a character
// outside that mapping, fails here, so a net-zero shift cannot hide a number.
// Returns undefined when the text is 1:1, otherwise the failure tail.
export function normalizationFailure(text: string): string | undefined {
  const normalized = detectEmergencyNumbers(text).normalized;
  const expected = foldApostrophes(text).toLowerCase();
  if (normalized !== expected) {
    let index = 0;
    while (index < normalized.length && normalized[index] === expected[index]) {
      index += 1;
    }
    return `is not 1:1 under emergency normalization at index ${index}: "${excerptAt(text, index)}"`;
  }
  if (expected.length !== text.length) {
    let index = 0;
    while (index < text.length && (text[index] ?? "").toLowerCase().length === 1) {
      index += 1;
    }
    return `is not 1:1 under emergency normalization at index ${index}: "${excerptAt(text, index)}"`;
  }
  return undefined;
}

export type SentenceSplit = {
  readonly sentences: readonly Sentence[];
  readonly problems: readonly string[];
};

// Sentence rule: a sentence ends at a line break, or at ".", "!" or "?" that is followed
// by whitespace or the end of the text. A mark inside « … » never ends a sentence, so
// a quoted template such as « Appelle le 15 maintenant. » stays in its sentence. A
// line break is any character of lineBreakChars, the set the normalization turns into
// "\n". It always ends a sentence and resets the quote depth. A « still open at a line
// break or at the end of the text, and a » with no open «, are reported as problems,
// because the quote rule then hides or invents sentence boundaries. Whitespace between
// sentences belongs to no sentence. Every character of a sentence sits in exactly one
// range, so a detected number is either inside one range or crosses a boundary.
export function splitSentences(text: string): SentenceSplit {
  const sentences: Sentence[] = [];
  const problems: string[] = [];
  let start = 0;
  const open: number[] = [];
  const push = (end: number): void => {
    const raw = text.slice(start, end);
    const trimmed = raw.trim();
    if (trimmed.length > 0) {
      const from = start + (raw.length - raw.trimStart().length);
      sentences.push({ text: trimmed, start: from, end: from + trimmed.length });
    }
  };
  const closeLine = (): void => {
    const [outermost] = open;
    if (outermost !== undefined) {
      problems.push(`unclosed « at index ${outermost}: "${excerptAt(text, outermost)}"`);
    }
    open.length = 0;
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? "";
    if (lineBreakChars.includes(char)) {
      push(index);
      start = index + 1;
      closeLine();
      continue;
    }
    if (char === "«") {
      open.push(index);
      continue;
    }
    if (char === "»") {
      if (open.length === 0) {
        problems.push(`stray » at index ${index}: "${excerptAt(text, index)}"`);
      }
      open.pop();
      continue;
    }
    if ((char === "." || char === "!" || char === "?") && open.length === 0) {
      const next = text[index + 1];
      if (next === undefined || /\s/u.test(next)) {
        push(index + 1);
        start = index + 1;
      }
    }
  }
  push(text.length);
  closeLine();
  return { sentences, problems };
}

function hasSentenceMark(text: string): boolean {
  return [...text].some((char) => /[.!?]/u.test(char) || lineBreakChars.includes(char));
}

// Failure order: split numbers, then entries per row in row order (stale, duplicate,
// numbers mismatch, then out of order), then unpinned sentences in prompt order.
// Order is checked only among rows that matched exactly once. Each such row must sit
// after the previous such row in the prompt, so the table reads like the prompt.
export function promptNumberPinFailures(
  promptText: string,
  rows: readonly PromptNumberRow[],
): readonly string[] {
  const notOneToOne = normalizationFailure(promptText);
  if (notOneToOne !== undefined) {
    return [`prompt ${notOneToOne}`];
  }
  const { sentences, problems } = splitSentences(promptText);
  if (problems.length > 0) {
    return problems;
  }
  const { spans } = detectEmergencyNumbers(promptText);
  const failures: string[] = [];
  const inside = new Map<Sentence, DetectedKind[]>();
  for (const span of spans) {
    const owner = sentences.find(
      (sentence) => span.start >= sentence.start && span.end <= sentence.end,
    );
    const raw = promptText.slice(span.start, span.end);
    // The reply checker splits at any mark or line break, with no quote or whitespace
    // rule, so a span holding one is split even when it sits inside one pinned sentence.
    if (owner === undefined || hasSentenceMark(raw)) {
      failures.push(
        `split across sentences: "${raw}" (${span.kind}) crosses a sentence boundary`,
      );
      continue;
    }
    inside.set(owner, [...(inside.get(owner) ?? []), span.kind]);
  }
  let previousStart = -1;
  for (const row of rows) {
    const matches = sentences.filter((sentence) => sentence.text === row.sentence);
    const [only] = matches;
    if (only === undefined) {
      failures.push(`stale row (0 matches): "${row.sentence}"`);
      continue;
    }
    if (matches.length > 1) {
      failures.push(`duplicate sentence (${matches.length} matches): "${row.sentence}"`);
      continue;
    }
    const detected = inside.get(only) ?? [];
    if (detected.join(",") !== row.numbers.join(",")) {
      failures.push(
        `numbers mismatch (row [${row.numbers.join(", ")}], detected [${detected.join(", ")}]): "${row.sentence}"`,
      );
    }
    if (only.start <= previousStart) {
      failures.push(
        `out of order: "${row.sentence}" appears before the previous row's sentence`,
      );
    }
    previousStart = only.start;
  }
  for (const sentence of sentences) {
    const detected = inside.get(sentence);
    if (detected === undefined || rows.some((row) => row.sentence === sentence.text)) {
      continue;
    }
    failures.push(
      `unpinned number sentence (detected [${detected.join(", ")}]): "${sentence.text}"`,
    );
  }
  return failures;
}
