import { expect, it } from "vitest";
import {
  baseSteps,
  elapsedLabel,
  parseTriageOutcome,
  searchStep,
  traceSummary,
  triageStep,
} from "./thinking-trace.js";

const filters = { specialty: "Médecin généraliste", postalCode: "75011" };

it("accepts only the four triage labels from the header", () => {
  expect(parseTriageOutcome("consult")).toBe("consult");
  expect(parseTriageOutcome("emergency")).toBe("emergency");
  expect(parseTriageOutcome(null)).toBeUndefined();
  expect(parseTriageOutcome("diagnosis")).toBeUndefined();
});

it("adds the urgency step only when triage ran", () => {
  expect(baseSteps(undefined).map((step) => step.id)).toEqual(["read"]);
  expect(baseSteps("self-care").map((step) => step.id)).toEqual(["read", "triage"]);
});

it("words the urgency step without naming a condition or a number", () => {
  const details = (["emergency", "consult", "self-care", "need-info"] as const).map(
    (outcome) => triageStep(outcome).detail,
  );
  expect(details).toEqual([
    "Emergency sign spotted",
    "No emergency sign spotted",
    "No emergency sign spotted",
    undefined,
  ]);
  for (const outcome of ["emergency", "consult", "self-care", "need-info"] as const) {
    const step = triageStep(outcome);
    expect(`${step.title} ${step.detail ?? ""}`).not.toMatch(/\d/);
  }
});

it("reports the directory search as it runs and when it ends", () => {
  expect(searchStep(filters, { kind: "searching" })).toEqual({
    id: "search",
    title: "Searching: médecin généraliste near 75011",
    status: "doing",
    tag: "Annuaire Santé",
  });
  expect(searchStep(filters, { kind: "found", count: 3, demo: false }).detail).toBe(
    "3 practitioners found",
  );
  expect(searchStep(filters, { kind: "found", count: 1, demo: true })).toEqual({
    id: "search",
    title: "Searching: médecin généraliste near 75011",
    status: "done",
    detail: "1 practitioner found",
  });
  expect(searchStep(filters, { kind: "failed" }).status).toBe("failed");
});

it("summarizes the folded trace", () => {
  expect(elapsedLabel(200)).toBe("1 s");
  expect(elapsedLabel(6400)).toBe("6 s");
  expect(traceSummary({ steps: baseSteps("consult"), ms: 6400 })).toBe("Thought for 6 s · 2 steps");
  expect(traceSummary({ steps: baseSteps(undefined), ms: 900 })).toBe("Thought for 1 s · 1 step");
});
