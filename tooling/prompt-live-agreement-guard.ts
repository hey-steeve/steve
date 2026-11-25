import {
  call15Now,
  callSentences,
  ensureEmergencyCalls,
  type EmergencyCall,
} from "../app/src/app/api/chat/emergency-templates.ts";
import {
  checkEmergencyReply,
  namedNumbers,
  type NamedNumber,
} from "../app/src/app/api/chat/eval/check.ts";
import type { EmergencyCase } from "../app/src/app/api/chat/eval/cases.ts";

export type GuardSituation = {
  readonly id: string;
  readonly chatIds: readonly string[];
};

export type ClauseFailure = {
  readonly kind: "missing" | "opening" | "unquoted-number" | "reply";
  readonly lead: string;
  readonly detail: string;
};

const quotePattern = /«\s*([^»]*?)\s*»/g;

export function splitPromptLine(line: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  let quote = 0;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "«") {
      quote += 1;
      continue;
    }
    if (char === "»" && quote > 0) {
      quote -= 1;
      continue;
    }
    if (quote > 0 || (char !== "." && char !== "!" && char !== "?")) {
      continue;
    }
    const next = line[index + 1];
    if (next !== undefined && !/\s/.test(next)) {
      continue;
    }
    const sentence = line.slice(start, index + 1).trim();
    if (sentence.length > 0) {
      sentences.push(sentence);
    }
    let cursor = index + 1;
    while (cursor < line.length && /\s/.test(line[cursor] ?? "")) {
      cursor += 1;
    }
    start = cursor;
    index = cursor - 1;
  }
  const tail = line.slice(start).trim();
  if (tail.length > 0) {
    sentences.push(tail);
  }
  return sentences;
}

export function openingSentences(calls: readonly EmergencyCall[]): string[] {
  return ensureEmergencyCalls("", calls)
    .split(/(?<=\.)\s+/)
    .filter((sentence) => sentence.length > 0);
}

type SentenceRange = {
  readonly line: number;
  readonly from: number;
  readonly to: number;
};

// The clause is its lead sentence plus the sentences that follow it in the same
// prompt line, up to the next sentence that starts another clause or another rule.
// A new sentence after the lead therefore belongs to the clause until the table
// names it as a separate rule, so an unknown quoted sentence fails closed.
function clauseRange(
  lines: readonly (readonly string[])[],
  lead: string,
  boundaries: readonly string[],
): SentenceRange | undefined {
  for (const [line, sentences] of lines.entries()) {
    const at = sentences.findIndex((sentence) => sentence.startsWith(lead));
    if (at < 0) {
      continue;
    }
    let to = at + 1;
    while (to < sentences.length) {
      const sentence = sentences[to] ?? "";
      if (boundaries.some((boundary) => sentence.startsWith(boundary))) {
        break;
      }
      to += 1;
    }
    return { line, from: at, to };
  }
  return undefined;
}

function promptSentences(prompt: string): string[][] {
  return prompt.split("\n").map(splitPromptLine);
}

export function clauseScope(
  prompt: string,
  lead: string,
  boundaries: readonly string[],
): string[] | undefined {
  const lines = promptSentences(prompt);
  const range = clauseRange(lines, lead, boundaries);
  if (range === undefined) {
    return undefined;
  }
  return (lines[range.line] ?? []).slice(range.from, range.to);
}

export function quotedStrings(sentences: readonly string[]): string[] {
  const quotes: string[] = [];
  for (const sentence of sentences) {
    for (const match of sentence.matchAll(quotePattern)) {
      quotes.push(match[1] ?? "");
    }
  }
  return quotes;
}

const callTemplates: readonly string[] = callSentences.map((entry) => entry.sentence);

export function isCallTemplate(quote: string): boolean {
  return callTemplates.includes(quote);
}

export function quotedCalls(quotes: readonly string[]): string[] {
  return quotes.filter(isCallTemplate);
}

// Live opening, then every quoted sentence of the clause that the opening does not
// already account for. Extra call sentences stay in the reply on purpose.
export function constructedReply(
  opening: readonly string[],
  quotes: readonly string[],
): string {
  let skip = opening.length;
  const extras: string[] = [];
  for (const quote of quotes) {
    if (skip > 0 && isCallTemplate(quote)) {
      skip -= 1;
      continue;
    }
    extras.push(quote);
  }
  return [...opening, ...extras].join(" ");
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export function checkClause(input: {
  readonly prompt: string;
  readonly lead: string;
  readonly boundaries: readonly string[];
  readonly calls: readonly EmergencyCall[];
  readonly cases: readonly EmergencyCase[];
}): ClauseFailure[] {
  const { prompt, lead, boundaries, calls, cases } = input;
  const scope = clauseScope(prompt, lead, boundaries);
  if (scope === undefined) {
    return [{ kind: "missing", lead, detail: "lead sentence not found in the prompt" }];
  }
  const failures: ClauseFailure[] = [];
  const opening = openingSentences(calls);
  const quotes = quotedStrings(scope);
  const quoted = quotedCalls(quotes);
  if (!sameList(quoted, opening)) {
    failures.push({
      kind: "opening",
      lead,
      detail: `quoted calls [${quoted.join(" | ")}] differ from the live opening [${opening.join(" | ")}]`,
    });
  }
  for (const sentence of scope) {
    const bare = sentence.replace(quotePattern, " ");
    if (namedNumbers(bare).length > 0) {
      failures.push({
        kind: "unquoted-number",
        lead,
        detail: `a number outside a quoted call sentence: ${sentence}`,
      });
    }
  }
  const reply = constructedReply(opening, quotes);
  for (const item of cases) {
    const result = checkEmergencyReply(reply, item.expected, {
      conditional15Allowed: item.conditional15Allowed ?? false,
      optional3114Allowed: item.optional3114Allowed ?? false,
      optional15Allowed: item.optional15Allowed ?? false,
      forbidMedication: item.forbidMedication ?? false,
    });
    if (!result.pass) {
      failures.push({
        kind: "reply",
        lead,
        detail: `${item.id}: ${result.reason} (found ${result.found.join(",")}) for "${reply}"`,
      });
    }
  }
  return failures;
}

export type CompletenessFailure = {
  readonly kind: "unmapped" | "unknown" | "duplicate";
  readonly id: string;
};

// The table's chatIds must equal the cases that expect a number, and no case may
// sit in two situations.
export function completenessFailures(
  situations: readonly GuardSituation[],
  cases: readonly EmergencyCase[],
): CompletenessFailure[] {
  const failures: CompletenessFailure[] = [];
  const mapped = new Set<string>();
  for (const situation of situations) {
    for (const id of situation.chatIds) {
      if (mapped.has(id)) {
        failures.push({ kind: "duplicate", id });
      }
      mapped.add(id);
    }
  }
  const expecting = new Set(
    cases.filter((item) => item.expected.length > 0).map((item) => item.id),
  );
  for (const id of expecting) {
    if (!mapped.has(id)) {
      failures.push({ kind: "unmapped", id });
    }
  }
  for (const id of mapped) {
    if (!expecting.has(id)) {
      failures.push({ kind: "unknown", id });
    }
  }
  return failures;
}

export type NumberPolarity = "required" | "forbidden" | "conditional";

export type NumberSentenceRule = {
  readonly lead: string;
  readonly numbers: readonly NamedNumber[];
  readonly polarity: NumberPolarity;
  readonly quotes: readonly string[];
  readonly includes?: readonly string[];
};

export type NumberSentenceFailure = {
  readonly kind: "unclassified" | "stale-rule" | "numbers" | "quotes" | "polarity" | "includes";
  readonly sentence: string;
  readonly detail: string;
};

// Every sentence that ends a clause scope: the mapped leads, the leads of other
// rules, and the leads of the number-sentence table.
export function scopeBoundaries(input: {
  readonly leads: readonly string[];
  readonly others: readonly string[];
  readonly rules: readonly NumberSentenceRule[];
}): string[] {
  return [...new Set([...input.leads, ...input.others, ...input.rules.map((rule) => rule.lead)])];
}

// A sentence that retracts a call inside a sentence that is not a ban.
const retraction =
  /pas exig|pas obligatoire|pas nécessaire|pas requis|pas besoin|suffit|facultatif|optionnel|inutile/u;

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item) => right.includes(item));
}

function polarityDetail(rule: NumberSentenceRule, sentence: string): string | undefined {
  const quotes = quotedStrings([sentence]);
  if (rule.polarity === "forbidden") {
    return quotes.some(isCallTemplate)
      ? "a forbidden sentence quotes a call sentence"
      : undefined;
  }
  if (retraction.test(sentence)) {
    return "a sentence that is not a ban retracts a call";
  }
  if (rule.polarity === "required") {
    return quotes.every(isCallTemplate)
      ? undefined
      : "a required sentence quotes something that is not a call sentence";
  }
  return quotes.includes(call15Now)
    ? "a conditional sentence quotes the unconditional 15 call"
    : undefined;
}

function ruleFailures(rule: NumberSentenceRule, sentence: string): NumberSentenceFailure[] {
  const failures: NumberSentenceFailure[] = [];
  const named = namedNumbers(sentence);
  if (!sameSet(named, rule.numbers)) {
    failures.push({
      kind: "numbers",
      sentence,
      detail: `names [${named.join(",")}], expected [${rule.numbers.join(",")}]: ${sentence}`,
    });
  }
  const quotes = quotedStrings([sentence]);
  if (!sameList(quotes, rule.quotes)) {
    failures.push({
      kind: "quotes",
      sentence,
      detail: `quotes [${quotes.join(" | ")}], expected [${rule.quotes.join(" | ")}]: ${sentence}`,
    });
  }
  for (const phrase of rule.includes ?? []) {
    if (!sentence.includes(phrase)) {
      failures.push({
        kind: "includes",
        sentence,
        detail: `missing "${phrase}": ${sentence}`,
      });
    }
  }
  const polarity = polarityDetail(rule, sentence);
  if (polarity !== undefined) {
    failures.push({ kind: "polarity", sentence, detail: `${polarity}: ${sentence}` });
  }
  return failures;
}

// Fail closed over the whole prompt. A sentence that names a number, in any form
// the shared detector reads, must sit inside a mapped clause (checkClause scores
// it) or match a table rule by its lead and pass that rule. Anything else fails.
export function numberSentenceFailures(input: {
  readonly prompt: string;
  readonly leads: readonly string[];
  readonly others: readonly string[];
  readonly rules: readonly NumberSentenceRule[];
}): NumberSentenceFailure[] {
  const { prompt, leads, others, rules } = input;
  const boundaries = scopeBoundaries({ leads, others, rules });
  const lines = promptSentences(prompt);
  const covered = new Set<string>();
  for (const lead of leads) {
    const range = clauseRange(
      lines,
      lead,
      boundaries.filter((boundary) => boundary !== lead),
    );
    if (range === undefined) {
      continue;
    }
    for (let at = range.from; at < range.to; at += 1) {
      covered.add(`${range.line}:${at}`);
    }
  }
  const failures: NumberSentenceFailure[] = [];
  const used = new Set<NumberSentenceRule>();
  for (const [line, sentences] of lines.entries()) {
    for (const [at, sentence] of sentences.entries()) {
      if (namedNumbers(sentence).length === 0 || covered.has(`${line}:${at}`)) {
        continue;
      }
      const rule = rules.find((candidate) => sentence.startsWith(candidate.lead));
      if (rule === undefined) {
        failures.push({
          kind: "unclassified",
          sentence,
          detail: `a number sentence outside every mapped clause and the table: ${sentence}`,
        });
        continue;
      }
      used.add(rule);
      failures.push(...ruleFailures(rule, sentence));
    }
  }
  for (const rule of rules) {
    if (!used.has(rule)) {
      failures.push({
        kind: "stale-rule",
        sentence: rule.lead,
        detail: `no number sentence starts with the table lead: ${rule.lead}`,
      });
    }
  }
  return failures;
}
