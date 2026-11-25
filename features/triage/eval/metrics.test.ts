import { expect, it } from "vitest";
import { formatTriageReport, percentileMs, scoreTriage, type TriageSample } from "./metrics.ts";

it("computes p50 and p95 from the recorded millisecond latencies", () => {
  expect(percentileMs([], 50)).toBe(0);
  expect(percentileMs([], 95)).toBe(0);
  expect(percentileMs([8], 50)).toBe(8);
  expect(percentileMs([8], 95)).toBe(8);
  expect(percentileMs([10, 20, 30, 40, 100], 50)).toBe(30);
  expect(percentileMs([10, 20, 30, 40, 100], 95)).toBe(100);
  expect(percentileMs([100, 10, 50], 50)).toBe(50);
  expect(percentileMs([100, 10, 50], 95)).toBe(100);
});

it("scores emergency recall, channel order, false emergencies, need-info, and fallbacks", () => {
  const samples: readonly TriageSample[] = [
    sample("emergency", "emergency", ["15"], ["15"], 10, false),
    sample("emergency", "consult", ["15"], [], 20, false),
    sample("consult", "emergency", [], ["15"], 30, false),
    sample("consult", "consult", [], [], 40, false),
    sample("need-info", "need-info", [], [], 100, true),
    sample("self-care", "self-care", [], [], 50, false),
  ];
  const metrics = scoreTriage(samples);
  expect(metrics.emergencyRecall).toBe(0.5);
  expect(metrics.channelAccuracy).toBe(0.5);
  expect(metrics.falseEmergencyRate).toBe(0.25);
  expect(metrics.needInfoRecall).toBe(1);
  expect(metrics.macroF1).toBe(0.75);
  expect(metrics.fallbackCount).toBe(1);
  expect(metrics.p50Ms).toBe(30);
  expect(metrics.p95Ms).toBe(100);
  expect(metrics.confusion.emergency).toEqual({
    emergency: 1,
    consult: 1,
    "self-care": 0,
    "need-info": 0,
  });
  expect(metrics.confusion.consult.emergency).toBe(1);
  expect(metrics.confusion.consult.consult).toBe(1);
  expect(metrics.confusion["need-info"]["need-info"]).toBe(1);
  expect(metrics.confusion["self-care"]["self-care"]).toBe(1);
});

it("treats reversed 15 and 3114 as a channel miss", () => {
  const metrics = scoreTriage([
    sample("emergency", "emergency", ["3114", "15"], ["15", "3114"], 12, false),
  ]);
  expect(metrics.emergencyRecall).toBe(1);
  expect(metrics.channelAccuracy).toBe(0);
});

it("omits need-info recall when the set has no need-info case", () => {
  const metrics = scoreTriage([
    sample("self-care", "self-care", [], [], 5, false),
  ]);
  expect(metrics.needInfoRecall).toBeUndefined();
  expect(metrics.emergencyRecall).toBe(1);
  expect(metrics.channelAccuracy).toBe(1);
  expect(metrics.falseEmergencyRate).toBe(0);
  expect(metrics.macroF1).toBe(1);
});

it("prints p50 and p95 in the report", () => {
  const metrics = scoreTriage([
    sample("emergency", "emergency", ["15"], ["15"], 30, false),
    sample("emergency", "need-info", ["15"], [], 100, true),
  ]);
  const report = formatTriageReport(metrics, true);
  expect(report).toContain("p50 30 ms");
  expect(report).toContain("p95 100 ms");
  expect(report).toContain("fallback 1");
  expect(report).toContain("gate fail");
});

function sample(
  expected: TriageSample["expected"],
  predicted: TriageSample["predicted"],
  expectedNumbers: TriageSample["expectedNumbers"],
  predictedNumbers: TriageSample["predictedNumbers"],
  latencyMs: number,
  fallback: boolean,
): TriageSample {
  return { expected, predicted, expectedNumbers, predictedNumbers, latencyMs, fallback };
}
