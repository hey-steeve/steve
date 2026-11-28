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

// The guidance is a closed set: a text reaches route.ts only if it is a member of
// `triageGuidances`, so the guard in the app can pin every text the type allows.
export type TriageGuidance = (typeof triageGuidances)[number];

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
      readonly guidance?: TriageGuidance;
      readonly calls?: Offer3114;
    };

const stateTurnLimit = 6;

function buildState(turns: readonly Turn[]): string {
  return turns
    .slice(-stateTurnLimit)
    .map((turn) => turn.text)
    .join("\n");
}

export const needInfoGuidance = {
  placement: "after-system-prompt",
  text: "ask one short question",
} as const;

export const consultGuidance = {
  placement: "after-system-prompt",
  text: "at night or on the weekend, point the person to their GP or an on-duty pharmacy",
} as const;

export const triageGuidances = [needInfoGuidance, consultGuidance] as const;

function noTriage(): { readonly label: "need-info" } {
  return { label: "need-info" };
}

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
  const current = input.handoff.data.at(-1);
  if (
    current === undefined ||
    current.sessionId !== input.handoff.sessionId ||
    current.turnId !== input.handoff.turnId
  ) {
    return noTriage();
  }

  const state = buildState(input.handoff.data);
  let result: ClassifyResult;
  try {
    result = await input.classify({ state });
  } catch {
    return noTriage();
  }
  switch (result.label) {
    case "emergency":
      return { label: "emergency", calls: result.calls };
    case "consult":
      return withCalls({ label: "consult", guidance: consultGuidance }, offeredCalls(result));
    case "self-care":
      return withCalls({ label: "self-care" }, offeredCalls(result));
    case "need-info":
      switch (result.reason) {
        case "timeout":
        case "network":
        case "http":
        case "malformed":
          return noTriage();
        case "model":
        case "below-threshold":
        case "no-channel":
          return withCalls(
            { label: "need-info", guidance: needInfoGuidance },
            offeredCalls(result),
          );
        default: {
          const unreachableReason: never = result;
          void unreachableReason;
          return noTriage();
        }
      }
    default: {
      const unreachable: never = result;
      void unreachable;
      return noTriage();
    }
  }
}
