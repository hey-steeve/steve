import type { Handoff, Turn } from "@steve/shared";
import type { ClassifyResult, EmergencyCalls } from "./types.ts";

type Offer3114 = NonNullable<
  Extract<ClassifyResult, { label: "consult" | "self-care" }>["calls"]
>;

export type TriageClassifier = (input: {
  readonly state: string;
}) => Promise<ClassifyResult>;

export type TriageTurnRequest = {
  readonly handoff: Handoff<readonly Turn[]>;
  readonly classify: TriageClassifier;
};

export type TriageGuidance = {
  readonly placement: "after-system-prompt";
  readonly text: string;
};

export type TriageDecision =
  | {
      readonly label: "emergency";
      readonly calls: EmergencyCalls;
    }
  | {
      readonly label: "consult";
      readonly guidance: TriageGuidance;
      readonly calls?: Offer3114;
    }
  | {
      readonly label: "self-care";
      readonly calls?: Offer3114;
    }
  | {
      readonly label: "need-info";
      readonly guidance: TriageGuidance;
      readonly calls?: Offer3114;
    };

const stateTurnLimit = 6;

const needInfoGuidance = {
  placement: "after-system-prompt",
  text: "pose une seule question courte, sans nommer le 15",
} as const satisfies TriageGuidance;

const consultGuidance = {
  placement: "after-system-prompt",
  text: "recommande une consultation chez le médecin traitant, en pharmacie de garde ou en téléconsultation",
} as const satisfies TriageGuidance;

function offeredCalls(result: Exclude<ClassifyResult, { label: "emergency" }>): Offer3114 | undefined {
  if (!("calls" in result)) {
    return undefined;
  }
  return result.calls;
}

function withCalls<Decision extends { readonly label: "consult" | "self-care" | "need-info" }>(
  decision: Decision,
  calls: Offer3114 | undefined,
): Decision | (Decision & { readonly calls: Offer3114 }) {
  if (calls === undefined) {
    return decision;
  }
  return { ...decision, calls };
}

export async function triageTurn(input: TriageTurnRequest): Promise<TriageDecision> {
  const state = input.handoff.data
    .slice(-stateTurnLimit)
    .map((turn) => turn.text)
    .join("\n");
  const result = await input.classify({ state });
  switch (result.label) {
    case "emergency":
      return { label: "emergency", calls: result.calls };
    case "consult":
      return withCalls({ label: "consult", guidance: consultGuidance }, offeredCalls(result));
    case "self-care":
      return withCalls({ label: "self-care" }, offeredCalls(result));
    case "need-info":
      return withCalls({ label: "need-info", guidance: needInfoGuidance }, offeredCalls(result));
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}
