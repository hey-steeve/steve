import { expect, it } from "vitest";
import { triageLabels } from "../src/types.ts";
import { triageCases } from "./cases.ts";

const gateIds = [
  "child-fever",
  "chest-pain-panic",
  "suicidal-talk",
  "overdose-suicidal",
  "stroke",
  "breathing",
  "unconscious",
  "self-harm-distress",
  "distress",
  "headache",
  "child-fever-red-flags",
  "medication",
  "ask-sos-112",
  "overdose-accident",
  "chest-pain",
  "suicidal-now",
  "sunday-throat",
  "child-rash",
  "stroke-asks-112",
  "panic-no-pain",
  "panic-breathless",
  "panic-fainting",
  "context-recall",
  "pushback",
] as const;

it("relabels the emergency-gate messages and adds original non-emergency cases", () => {
  expect(new Set(triageCases.map((item) => item.id)).size).toBe(triageCases.length);
  for (const id of gateIds) {
    expect(triageCases.some((item) => item.id === id)).toBe(true);
  }
  for (const label of triageLabels) {
    expect(triageCases.some((item) => item.label === label)).toBe(true);
  }
  for (const item of triageCases) {
    if (item.label === "emergency") {
      expect(item.numbers.length).toBeGreaterThan(0);
    } else {
      expect(item.numbers).toEqual([]);
    }
  }
});
