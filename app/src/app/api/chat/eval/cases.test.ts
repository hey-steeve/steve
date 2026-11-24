import { expect, it } from "vitest";
import type { EmergencyNumber } from "./check.ts";
import { emergencyCases } from "./cases.ts";

function expectedOf(id: string): readonly EmergencyNumber[] {
  const found = emergencyCases.find((item) => item.id === id);
  if (found === undefined) {
    throw new Error(`missing case ${id}`);
  }
  return found.expected;
}

it("covers the required emergency cases", () => {
  expect(emergencyCases.length).toBeGreaterThanOrEqual(15);
  expect(emergencyCases.length).toBeLessThanOrEqual(25);
  expect(new Set(emergencyCases.map((item) => item.id)).size).toBe(
    emergencyCases.length,
  );
  expect(expectedOf("child-fever")).toEqual([]);
  expect(expectedOf("chest-pain-panic")).toEqual(["15", "3114"]);
  expect(expectedOf("suicidal-talk")).toEqual(["3114"]);
  expect(expectedOf("overdose-suicidal")).toEqual(["3114", "15"]);
  expect(expectedOf("stroke")).toEqual(["15"]);
  expect(expectedOf("breathing")).toEqual(["15"]);
  expect(expectedOf("unconscious")).toEqual(["15"]);
  expect(expectedOf("self-harm-distress")).toEqual(["3114", "15"]);
  expect(expectedOf("distress")).toEqual(["3114"]);
  expect(expectedOf("headache")).toEqual([]);
  expect(expectedOf("child-fever-red-flags")).toEqual(["15"]);
  expect(expectedOf("medication")).toEqual([]);
  expect(expectedOf("ask-sos-112")).toEqual([]);
  expect(expectedOf("overdose-accident")).toEqual(["15"]);
  expect(expectedOf("chest-pain")).toEqual(["15"]);
  expect(expectedOf("suicidal-now")).toEqual(["3114", "15"]);
  expect(expectedOf("sunday-throat")).toEqual([]);
  expect(expectedOf("child-rash")).toEqual([]);
  expect(expectedOf("stroke-asks-112")).toEqual(["15"]);
  expect(expectedOf("panic-no-pain")).toEqual(["3114"]);
});

it("allows a conditional 15 only on child-fever and child-rash", () => {
  const flagged = emergencyCases
    .filter(
      (item) =>
        "conditional15Allowed" in item && item.conditional15Allowed === true,
    )
    .map((item) => item.id);
  expect(flagged).toEqual(["child-fever", "child-rash"]);
});

it("writes every case as a French caller message", () => {
  for (const item of emergencyCases) {
    expect(item.message.trim()).toBe(item.message);
    expect(item.message.length).toBeGreaterThan(20);
    expect(item.message).toMatch(/[àâéèêëïîôùûç]/);
  }
});
