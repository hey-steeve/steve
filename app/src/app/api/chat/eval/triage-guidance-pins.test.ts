import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as triage from "@steve/triage";
import { expect, it } from "vitest";
import { type GuidancePinRow, guidancePinRows } from "./triage-guidance-pin-rows.ts";
import {
  collectGuidanceTexts,
  guidancePinFailures,
  guidanceSourceFailures,
} from "./triage-guidance-pins.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const triageSrc = path.join(repoRoot, "features/triage/src");

type SourceFile = { readonly file: string; readonly text: string };

function liveSources(): readonly SourceFile[] {
  return readdirSync(triageSrc)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .sort()
    .map((name) => ({
      file: `features/triage/src/${name}`,
      text: readFileSync(path.join(triageSrc, name), "utf8"),
    }));
}

const liveTexts = collectGuidanceTexts(triage);
const needInfoText = triage.needInfoGuidance.text;
const consultText = triage.consultGuidance.text;

const stale = (text: string): string => `stale guidance row (0 matches): "${text}"`;
const duplicateText = (count: number, text: string): string =>
  `duplicate guidance text (${count} matches): "${text}"`;
const duplicateRow = (count: number, text: string): string =>
  `duplicate guidance row (${count} rows): "${text}"`;
const unpinned = (text: string): string => `unpinned guidance text: "${text}"`;
const mismatch = (
  row: readonly string[],
  detected: readonly string[],
  text: string,
): string =>
  `guidance numbers mismatch (row [${row.join(", ")}], detected [${detected.join(", ")}]): "${text}"`;
const sourceCount = (found: number, enumerated: number): string =>
  `triage source has ${found} after-system-prompt guidance literals, the package exports ${enumerated}`;

it("enumerates every guidance object the triage package exports", () => {
  expect([...liveTexts].sort()).toEqual([consultText, needInfoText].sort());
});

it("accepts the live guidance texts against the pinned rows", () => {
  expect(guidancePinFailures(liveTexts, guidancePinRows)).toEqual([]);
});

it("pins the guidance word for word, as route.ts sends it", () => {
  expect(guidancePinRows.map((row) => row.text).sort()).toEqual(
    [
      "la nuit ou le week-end, oriente vers le médecin traitant ou une pharmacie de garde",
      "pose une seule question courte",
    ].sort(),
  );
  expect(guidancePinRows.every((row) => row.numbers.length === 0)).toBe(true);
});

it("counts the same guidance literals in the non-test triage source as the package exports", () => {
  expect(guidanceSourceFailures(liveSources(), liveTexts.length)).toEqual([]);
});

it("reads the source files of the package, test files excluded", () => {
  const files = liveSources().map((source) => source.file);
  expect(files).toContain("features/triage/src/triage-turn.ts");
  expect(files.some((file) => file.endsWith(".test.ts"))).toBe(false);
});

type Mutation = {
  readonly name: string;
  readonly texts: readonly string[];
  readonly rows: readonly GuidancePinRow[];
  readonly failures: readonly string[];
};

const needInfoRow: GuidancePinRow = { text: needInfoText, numbers: [] };
const consultRow: GuidancePinRow = { text: consultText, numbers: [] };
const edited = `${needInfoText} et appelle le 15 maintenant`;

const mutations: readonly Mutation[] = [
  {
    name: "edited text",
    texts: [edited, consultText],
    rows: [needInfoRow, consultRow],
    failures: [stale(needInfoText), unpinned(edited)],
  },
  {
    name: "new text",
    texts: [needInfoText, consultText, "pose deux questions"],
    rows: [needInfoRow, consultRow],
    failures: [unpinned("pose deux questions")],
  },
  {
    name: "stale row",
    texts: [needInfoText],
    rows: [needInfoRow, consultRow],
    failures: [stale(consultText)],
  },
  {
    name: "duplicate text",
    texts: [needInfoText, consultText, needInfoText],
    rows: [needInfoRow, consultRow],
    failures: [duplicateText(2, needInfoText)],
  },
  {
    name: "duplicate row",
    texts: [needInfoText, consultText],
    rows: [needInfoRow, needInfoRow, consultRow],
    failures: [duplicateRow(2, needInfoText)],
  },
  {
    name: "numbers mismatch, the text names a number the row does not record",
    texts: ["pose une question sur le 15"],
    rows: [{ text: "pose une question sur le 15", numbers: [] }],
    failures: [mismatch([], ["15"], "pose une question sur le 15")],
  },
  {
    name: "numbers mismatch, the row records a number the text lacks",
    texts: [needInfoText],
    rows: [{ text: needInfoText, numbers: ["15"] }, consultRow],
    failures: [mismatch(["15"], [], needInfoText), stale(consultText)],
  },
];

it.each(mutations)("fails closed on $name", ({ texts, rows, failures }) => {
  expect(guidancePinFailures(texts, rows)).toEqual(failures);
});

it("fails closed on a guidance text that is not 1:1 under emergency normalization", () => {
  const text = "pose une question courte";
  expect(guidancePinFailures([text], [{ text, numbers: [] }])).toEqual([
    `guidance text "${text}" is not 1:1 under emergency normalization at index 17: "\\u00A0courte"`,
  ]);
});

it("picks up a new exported guidance object by its placement, whatever its name", () => {
  const extra = { placement: "after-system-prompt", text: "répète la question" };
  const texts = collectGuidanceTexts({ ...triage, extraGuidance: extra });
  expect(texts).toEqual([...liveTexts, "répète la question"]);
  expect(guidancePinFailures(texts, guidancePinRows)).toEqual([unpinned("répète la question")]);
});

it("ignores exports that are not guidance and counts an aliased object once", () => {
  expect(collectGuidanceTexts({ ...triage, alias: triage.needInfoGuidance })).toEqual(liveTexts);
  expect(
    collectGuidanceTexts({ one: 1, none: null, fn: () => 1, other: { placement: "before", text: "x" } }),
  ).toEqual([]);
});

it("fails when the source holds an inline unexported guidance literal", () => {
  const inline: SourceFile = {
    file: "features/triage/src/inline.ts",
    text: 'const hidden = { placement: "after-system-prompt", text: "cache" };\n',
  };
  expect(guidanceSourceFailures([...liveSources(), inline], liveTexts.length)).toEqual([
    sourceCount(3, 2),
  ]);
});

it("fails when the source holds an inline guidance literal with the placement last", () => {
  const inline: SourceFile = {
    file: "features/triage/src/inline.ts",
    text: 'const hidden = {\n  text: "cache",\n  placement: "after-system-prompt"\n};\n',
  };
  expect(guidanceSourceFailures([...liveSources(), inline], liveTexts.length)).toEqual([
    sourceCount(3, 2),
  ]);
});

it("fails when an exported guidance object has no literal in the source", () => {
  expect(guidanceSourceFailures(liveSources(), liveTexts.length + 1)).toEqual([sourceCount(2, 3)]);
});

it("does not count the placement type declaration as a guidance literal", () => {
  const typeOnly: SourceFile = {
    file: "features/triage/src/type.ts",
    text: 'export type G = {\n  readonly placement: "after-system-prompt";\n};\n',
  };
  expect(guidanceSourceFailures([typeOnly], 0)).toEqual([]);
});
