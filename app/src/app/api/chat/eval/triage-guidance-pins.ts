import { detectEmergencyNumbers } from "./check.ts";
import { normalizationFailure } from "./prompt-number-pins.ts";
import type { GuidancePinRow } from "./triage-guidance-pin-rows.ts";

// The pinned texts are the `triageGuidances` of @steve/triage. `TriageGuidance` is that
// closed set, so no other text can reach route.ts; a type test in the triage package
// fails the typecheck if that closure is lost.
// Failure order: normalization failures (and stop), then per row in row order (stale,
// duplicate text, numbers mismatch), then duplicate rows, then unpinned texts in text
// order. A row matches a text only by full string equality. No meaning is parsed.
export function guidancePinFailures(
  texts: readonly string[],
  rows: readonly GuidancePinRow[],
): readonly string[] {
  const notOneToOne = texts.flatMap((text) => {
    const failure = normalizationFailure(text);
    return failure === undefined ? [] : [`guidance text "${text}" ${failure}`];
  });
  if (notOneToOne.length > 0) {
    return notOneToOne;
  }
  const failures: string[] = [];
  for (const row of rows) {
    const matches = texts.filter((text) => text === row.text).length;
    if (matches === 0) {
      failures.push(`stale guidance row (0 matches): "${row.text}"`);
      continue;
    }
    if (matches > 1) {
      failures.push(`duplicate guidance text (${matches} matches): "${row.text}"`);
      continue;
    }
    const detected = detectEmergencyNumbers(row.text).spans.map((span) => span.kind);
    if (detected.join(",") !== row.numbers.join(",")) {
      failures.push(
        `guidance numbers mismatch (row [${row.numbers.join(", ")}], detected [${detected.join(", ")}]): "${row.text}"`,
      );
    }
  }
  const reported = new Set<string>();
  for (const row of rows) {
    const copies = rows.filter((other) => other.text === row.text).length;
    if (copies > 1 && !reported.has(row.text)) {
      reported.add(row.text);
      failures.push(`duplicate guidance row (${copies} rows): "${row.text}"`);
    }
  }
  for (const text of texts) {
    if (!rows.some((row) => row.text === text)) {
      failures.push(`unpinned guidance text: "${text}"`);
    }
  }
  return failures;
}
