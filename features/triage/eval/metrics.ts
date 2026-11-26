import { triageLabels, type EmergencyNumber, type TriageLabel } from "../src/types.ts";

export type TriageSample = {
  readonly id?: string;
  readonly expected: TriageLabel;
  readonly predicted: TriageLabel;
  readonly expectedNumbers: readonly EmergencyNumber[];
  readonly predictedNumbers: readonly EmergencyNumber[];
  readonly latencyMs: number;
  readonly fallback: boolean;
};

export type Confusion = {
  readonly [Expected in TriageLabel]: { readonly [Predicted in TriageLabel]: number };
};

export type TriageMetrics = {
  readonly emergencyRecall: number;
  readonly channelAccuracy: number;
  readonly falseEmergencyRate: number;
  readonly needInfoRecall: number | undefined;
  readonly macroF1: number;
  readonly confusion: Confusion;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly fallbackCount: number;
};

type Counts = Record<TriageLabel, number>;

export function percentileMs(latencies: readonly number[], percentile: number): number {
  if (latencies.length === 0) {
    return 0;
  }
  const sorted = [...latencies].sort((left, right) => left - right);
  const rank = Math.ceil((percentile / 100) * sorted.length);
  const index = Math.min(sorted.length, Math.max(rank, 1)) - 1;
  return sorted[index] ?? 0;
}

export function triageGateFailed(samples: readonly TriageSample[]): boolean {
  for (const sample of samples) {
    if (sample.expected !== "emergency") {
      continue;
    }
    if (
      sample.predicted !== "emergency" ||
      !sameNumbers(sample.expectedNumbers, sample.predictedNumbers)
    ) {
      return true;
    }
  }
  return false;
}

export function scoreTriage(samples: readonly TriageSample[]): TriageMetrics {
  const confusion = emptyConfusion();
  let emergencyCount = 0;
  let emergencyHits = 0;
  let channelHits = 0;
  let nonEmergency = 0;
  let falseEmergency = 0;
  let needInfoCount = 0;
  let needInfoHits = 0;
  let fallbackCount = 0;
  const latencies: number[] = [];
  for (const sample of samples) {
    confusion[sample.expected][sample.predicted] += 1;
    latencies.push(sample.latencyMs);
    if (sample.fallback) {
      fallbackCount += 1;
    }
    if (sample.expected === "emergency") {
      emergencyCount += 1;
      if (sample.predicted === "emergency") {
        emergencyHits += 1;
      }
      if (sameNumbers(sample.expectedNumbers, sample.predictedNumbers)) {
        channelHits += 1;
      }
    } else {
      nonEmergency += 1;
      if (sample.predicted === "emergency") {
        falseEmergency += 1;
      }
    }
    if (sample.expected === "need-info") {
      needInfoCount += 1;
      if (sample.predicted === "need-info") {
        needInfoHits += 1;
      }
    }
  }
  return {
    emergencyRecall: emergencyCount === 0 ? 1 : emergencyHits / emergencyCount,
    channelAccuracy: emergencyCount === 0 ? 1 : channelHits / emergencyCount,
    falseEmergencyRate: nonEmergency === 0 ? 0 : falseEmergency / nonEmergency,
    needInfoRecall: needInfoCount === 0 ? undefined : needInfoHits / needInfoCount,
    macroF1: macroF1(confusion),
    confusion,
    p50Ms: percentileMs(latencies, 50),
    p95Ms: percentileMs(latencies, 95),
    fallbackCount,
  };
}

export function formatTriageReport(
  metrics: TriageMetrics,
  gateFailed: boolean,
  samples: readonly TriageSample[] = [],
): string {
  const lines = [
    `emergency recall ${formatRate(metrics.emergencyRecall)}`,
    `channel accuracy ${formatRate(metrics.channelAccuracy)}`,
    `false emergency ${formatRate(metrics.falseEmergencyRate)}`,
    `need-info recall ${metrics.needInfoRecall === undefined ? "n/a" : formatRate(metrics.needInfoRecall)}`,
    `macro F1 ${formatRate(metrics.macroF1)}`,
    `fallback ${metrics.fallbackCount}`,
    `p50 ${metrics.p50Ms} ms`,
    `p95 ${metrics.p95Ms} ms`,
    "confusion expected predicted emergency consult self-care need-info",
  ];
  for (const expected of triageLabels) {
    const row = triageLabels.map((predicted) => String(metrics.confusion[expected][predicted]));
    lines.push(`${expected} ${row.join(" ")}`);
  }
  lines.push(gateFailed ? "gate fail" : "gate pass");
  if (samples.length > 0) {
    lines.push("cases id expected got expected_calls got_calls");
    for (const sample of samples) {
      lines.push(formatCaseLine(sample));
    }
  }
  return `${lines.join("\n")}\n`;
}

function formatCaseLine(sample: TriageSample): string {
  const id = (sample.id ?? "-").replace(/\s+/g, "_");
  return [
    `case id=${id}`,
    `expected=${sample.expected}`,
    `got=${sample.predicted}`,
    `expected_calls=${formatCalls(sample.expectedNumbers)}`,
    `got_calls=${formatCalls(sample.predictedNumbers)}`,
  ].join(" ");
}

function formatCalls(numbers: readonly EmergencyNumber[]): string {
  return numbers.length === 0 ? "none" : numbers.join(",");
}

function formatRate(value: number): string {
  return value.toFixed(3);
}

function sameNumbers(
  left: readonly EmergencyNumber[],
  right: readonly EmergencyNumber[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((number, index) => number === right[index]);
}

function macroF1(confusion: Confusion): number {
  const scores: number[] = [];
  for (const label of triageLabels) {
    const score = labelF1(confusion, label);
    if (score !== undefined) {
      scores.push(score);
    }
  }
  if (scores.length === 0) {
    return 0;
  }
  let total = 0;
  for (const score of scores) {
    total += score;
  }
  return total / scores.length;
}

function labelF1(confusion: Confusion, label: TriageLabel): number | undefined {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  for (const expected of triageLabels) {
    for (const predicted of triageLabels) {
      const count = confusion[expected][predicted];
      if (expected === label && predicted === label) {
        truePositive += count;
      } else if (predicted === label) {
        falsePositive += count;
      } else if (expected === label) {
        falseNegative += count;
      }
    }
  }
  if (truePositive + falseNegative === 0) {
    return undefined;
  }
  const precision =
    truePositive + falsePositive === 0 ? 0 : truePositive / (truePositive + falsePositive);
  const recall = truePositive / (truePositive + falseNegative);
  if (precision + recall === 0) {
    return 0;
  }
  return (2 * precision * recall) / (precision + recall);
}

function emptyConfusion(): { [Expected in TriageLabel]: Counts } {
  return {
    emergency: zeroCounts(),
    consult: zeroCounts(),
    "self-care": zeroCounts(),
    "need-info": zeroCounts(),
  };
}

function zeroCounts(): Counts {
  return { emergency: 0, consult: 0, "self-care": 0, "need-info": 0 };
}
