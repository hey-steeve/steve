import { type DetectedKind, detectEmergencyNumbers } from "./check.ts";

export type PromptNumberRow = {
  readonly sentence: string;
  readonly numbers: readonly DetectedKind[];
};

type Sentence = {
  readonly text: string;
  readonly start: number;
  readonly end: number;
};

// Sentence rule: a sentence ends at a newline, or at ".", "!" or "?" that is followed
// by whitespace or the end of the text. A mark inside « … » never ends a sentence, so
// a quoted template such as « Appelle le 15 maintenant. » stays in its sentence. A
// newline always ends a sentence and resets the quote depth. Whitespace between
// sentences belongs to no sentence. Every character of a sentence sits in exactly one
// range, so a detected number is either inside one range or crosses a boundary.
function splitSentences(text: string): Sentence[] {
  const sentences: Sentence[] = [];
  let start = 0;
  let depth = 0;
  const push = (end: number): void => {
    const raw = text.slice(start, end);
    const trimmed = raw.trim();
    if (trimmed.length > 0) {
      const from = start + (raw.length - raw.trimStart().length);
      sentences.push({ text: trimmed, start: from, end: from + trimmed.length });
    }
  };
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\n") {
      push(index);
      start = index + 1;
      depth = 0;
      continue;
    }
    if (char === "«") {
      depth += 1;
      continue;
    }
    if (char === "»") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if ((char === "." || char === "!" || char === "?") && depth === 0) {
      const next = text[index + 1];
      if (next === undefined || /\s/u.test(next)) {
        push(index + 1);
        start = index + 1;
      }
    }
  }
  push(text.length);
  return sentences;
}

// Failure order: split numbers, then entries per row in row order (stale, duplicate,
// numbers mismatch, then out of order), then unpinned sentences in prompt order.
// Order is checked only among rows that matched exactly once. Each such row must sit
// after the previous such row in the prompt, so the table reads like the prompt.
export function promptNumberPinFailures(
  promptText: string,
  rows: readonly PromptNumberRow[],
): readonly string[] {
  const { normalized, spans } = detectEmergencyNumbers(promptText);
  if (normalized.length !== promptText.length) {
    return [
      "prompt changes length under emergency normalization, so detected numbers cannot be mapped to sentences",
    ];
  }
  const sentences = splitSentences(promptText);
  const failures: string[] = [];
  const inside = new Map<Sentence, DetectedKind[]>();
  for (const span of spans) {
    const owner = sentences.find(
      (sentence) => span.start >= sentence.start && span.end <= sentence.end,
    );
    if (owner === undefined) {
      failures.push(
        `split across sentences: "${promptText.slice(span.start, span.end)}" (${span.kind}) crosses a sentence boundary`,
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
    if (only.start < previousStart) {
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
