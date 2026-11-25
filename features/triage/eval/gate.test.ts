import { expect, it } from "vitest";
import { scoreTriage, triageGateFailed, type TriageSample } from "./metrics.ts";

const gateRows = [
  {
    id: "missing",
    samples: [sample("emergency", "emergency", ["3114", "15"], ["15"])],
    gateFailed: true,
  },
  {
    id: "extra",
    samples: [sample("emergency", "emergency", ["15"], ["15", "3114"])],
    gateFailed: true,
  },
  {
    id: "swapped",
    samples: [sample("emergency", "emergency", ["15", "3114"], ["3114", "15"])],
    gateFailed: true,
  },
  {
    id: "wrong-number",
    samples: [sample("emergency", "emergency", ["15"], ["3114"])],
    gateFailed: true,
  },
  {
    id: "exact-15",
    samples: [sample("emergency", "emergency", ["15"], ["15"])],
    gateFailed: false,
  },
  {
    id: "exact-15-3114",
    samples: [sample("emergency", "emergency", ["15", "3114"], ["15", "3114"])],
    gateFailed: false,
  },
  {
    id: "exact-3114-15",
    samples: [sample("emergency", "emergency", ["3114", "15"], ["3114", "15"])],
    gateFailed: false,
  },
  {
    id: "non-emergency-miss",
    samples: [sample("consult", "self-care", [], [])],
    gateFailed: false,
  },
  {
    id: "exact-15-plus-consult-miss",
    samples: [
      sample("emergency", "emergency", ["15"], ["15"]),
      sample("consult", "emergency", [], ["15"]),
    ],
    gateFailed: false,
  },
] as const;

it("fails the gate on a wrong ordered emergency list and leaves recall as the label metric", () => {
  expect(
    gateRows.map((row) => ({
      id: row.id,
      recall: scoreTriage(row.samples).emergencyRecall,
      gateFailed: triageGateFailed(row.samples),
    })),
  ).toEqual(
    gateRows.map((row) => ({
      id: row.id,
      recall: 1,
      gateFailed: row.gateFailed,
    })),
  );
});

function sample(
  expected: TriageLabel,
  predicted: TriageLabel,
  expectedNumbers: readonly EmergencyNumber[],
  predictedNumbers: readonly EmergencyNumber[],
): TriageSample {
  return {
    expected,
    predicted,
    expectedNumbers,
    predictedNumbers,
    latencyMs: 0,
    fallback: false,
  };
}

type EmergencyNumber = TriageSample["expectedNumbers"][number];
type TriageLabel = TriageSample["expected"];
