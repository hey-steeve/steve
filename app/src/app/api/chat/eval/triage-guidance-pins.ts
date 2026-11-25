import { detectEmergencyNumbers } from "./check.ts";
import { normalizationFailure } from "./prompt-number-pins.ts";
import type { GuidancePinRow } from "./triage-guidance-pin-rows.ts";

const placement = "after-system-prompt";

function isGuidance(value: unknown): value is { readonly text: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "placement" in value &&
    value.placement === placement &&
    "text" in value &&
    typeof value.text === "string"
  );
}

// Every exported value that is a guidance object, whatever its export name. An object
// exported under two names counts once. Order follows the export order given.
export function collectGuidanceTexts(
  exported: Readonly<Record<string, unknown>>,
): readonly string[] {
  const seen = new Set<object>();
  const texts: string[] = [];
  for (const value of Object.values(exported)) {
    if (isGuidance(value) && !seen.has(value)) {
      seen.add(value);
      texts.push(value.text);
    }
  }
  return texts;
}

// Counts the guidance literals in the non-test source of the triage package. The
// type declaration `placement: "after-system-prompt";` ends in a semicolon, so it is
// not a literal. A guidance object that no export reaches makes the counts differ.
// The count reads source text, so a placement written through a variable or a quoted
// key is not seen; the exported-values enumeration covers every exported object.
export function guidanceSourceFailures(
  sources: readonly { readonly file: string; readonly text: string }[],
  enumerated: number,
): readonly string[] {
  const literal = /placement:\s*"after-system-prompt"(?!\s*;)/gu;
  let found = 0;
  for (const source of sources) {
    found += source.text.match(literal)?.length ?? 0;
  }
  if (found === enumerated) {
    return [];
  }
  return [
    `triage source has ${found} after-system-prompt guidance literals, the package exports ${enumerated}`,
  ];
}

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
