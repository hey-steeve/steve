import {
  callSentences,
  ensureEmergencyCalls,
  type EmergencyCall,
} from "../app/src/app/api/chat/emergency-templates.ts";
import { checkEmergencyReply } from "../app/src/app/api/chat/eval/check.ts";
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
const unquotedNumber = /(?<![\p{L}\d])(15|3114|112|samu|quinze)(?![\p{L}\d])/iu;

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

// The clause is its lead sentence plus the sentences that follow it in the same
// prompt line, up to the next sentence that starts another clause or another rule.
// A new sentence after the lead therefore belongs to the clause until the table
// names it as a separate rule, so an unknown quoted sentence fails closed.
export function clauseScope(
  prompt: string,
  lead: string,
  boundaries: readonly string[],
): string[] | undefined {
  for (const line of prompt.split("\n")) {
    const sentences = splitPromptLine(line);
    const at = sentences.findIndex((sentence) => sentence.startsWith(lead));
    if (at < 0) {
      continue;
    }
    const scope = [sentences[at] ?? ""];
    for (const sentence of sentences.slice(at + 1)) {
      if (boundaries.some((boundary) => sentence.startsWith(boundary))) {
        break;
      }
      scope.push(sentence);
    }
    return scope;
  }
  return undefined;
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
    if (unquotedNumber.test(bare)) {
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
