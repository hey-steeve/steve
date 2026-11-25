import * as triage from "@steve/triage";
import { expect, it } from "vitest";
import { type GuidancePinRow, guidancePinRows } from "./triage-guidance-pin-rows.ts";
import { guidancePinFailures } from "./triage-guidance-pins.ts";

const liveTexts: readonly string[] = triage.triageGuidances.map((guidance) => guidance.text);
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

it("enumerates the closed guidance set the type allows", () => {
  expect(liveTexts).toEqual([needInfoText, consultText]);
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
