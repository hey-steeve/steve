import {
  consultGuidance,
  needInfoGuidance,
  type EmergencyCalls,
} from "@steve/triage";

type Call = { readonly type: "call"; readonly number: "15" | "3114" };

const call15 = { type: "call", number: "15" } as const satisfies Call;
const call3114 = { type: "call", number: "3114" } as const satisfies Call;

export type TriageDecisionCase = {
  readonly name: string;
  readonly guidance?: string;
  readonly calls?: EmergencyCalls;
  readonly classify:
    | {
        readonly label: "emergency";
        readonly channel: "psychological" | "physical";
        readonly probability: number;
      }
    | {
        readonly label: "emergency";
        readonly channel: "both";
        readonly harm: "yes" | "no";
        readonly probability: number;
      }
    | {
        readonly label: "consult" | "self-care" | "need-info";
        readonly channel: "psychological" | "none";
        readonly probability: number;
      }
    | { readonly label: "no-triage" };
};

export const triageDecisionCases: readonly TriageDecisionCase[] = [
  {
    name: "emergency-psychological",
    classify: { label: "emergency", channel: "psychological", probability: 0.91 },
    calls: [call3114, call15] satisfies EmergencyCalls,
  },
  {
    name: "emergency-both-yes",
    classify: { label: "emergency", channel: "both", harm: "yes", probability: 0.91 },
    calls: [call3114, call15] satisfies EmergencyCalls,
  },
  {
    name: "emergency-both-no",
    classify: { label: "emergency", channel: "both", harm: "no", probability: 0.91 },
    calls: [call15, call3114] satisfies EmergencyCalls,
  },
  {
    name: "emergency-physical",
    classify: { label: "emergency", channel: "physical", probability: 0.91 },
    calls: [call15] satisfies EmergencyCalls,
  },
  {
    name: "consult-3114",
    classify: { label: "consult", channel: "psychological", probability: 0.74 },
    calls: [call3114] satisfies EmergencyCalls,
    guidance: consultGuidance.text,
  },
  {
    name: "consult",
    classify: { label: "consult", channel: "none", probability: 0.74 },
    guidance: consultGuidance.text,
  },
  {
    name: "self-care-3114",
    classify: { label: "self-care", channel: "psychological", probability: 0.7 },
    calls: [call3114] satisfies EmergencyCalls,
  },
  {
    name: "self-care",
    classify: { label: "self-care", channel: "none", probability: 0.7 },
  },
  {
    name: "need-info-3114",
    classify: { label: "need-info", channel: "psychological", probability: 0.55 },
    calls: [call3114] satisfies EmergencyCalls,
    guidance: needInfoGuidance.text,
  },
  {
    name: "need-info",
    classify: { label: "need-info", channel: "none", probability: 0.55 },
    guidance: needInfoGuidance.text,
  },
  {
    name: "no-triage",
    classify: { label: "no-triage" },
  },
];
