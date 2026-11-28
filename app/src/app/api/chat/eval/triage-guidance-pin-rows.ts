import type { DetectedKind } from "./check.ts";

export type GuidancePinRow = {
  readonly text: string;
  readonly numbers: readonly DetectedKind[];
};

// One row per triage guidance text. route.ts sends decision.guidance.text as a second
// system message, so each row holds that whole string, word for word. `numbers` lists
// what the number detector reads in it, in order. Today neither text names a number.
export const guidancePinRows: readonly GuidancePinRow[] = [
  {
    text: "at night or on the weekend, point the person to their GP or an on-duty pharmacy",
    numbers: [],
  },
  {
    text: "ask one short question",
    numbers: [],
  },
];
