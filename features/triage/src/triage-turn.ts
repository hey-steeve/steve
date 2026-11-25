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
      readonly guidance?: TriageGuidance;
      readonly calls?: Offer3114;
    };

// The classifier state is every turn, oldest first, joined by a newline, within a character budget.
//
// Why not "the last N turns": a risk signal stated early ("j'ai des idées noires") dropped out of
// the state once N newer turns arrived, so the call opening and the buttons vanished later in the
// same conversation. Nothing in the repo caps how many turns reach this function, and a chat holds
// at most 20 user turns of 4000 characters (`chatRequestLimits`), so up to 80 000 characters.
// `jev.ts` sets no input limit, only a 1500 ms timeout. So the state is bounded here.
//
// 8 000 characters holds a whole usual conversation and stays a small request body. When the turns
// exceed it, the first turns and the latest turns each get half. The first turns are where a person
// states the reason they came, and the latest ones are what they say now. The middle is dropped as
// whole turns, and no turn is cut. The current turn is always kept whole, even alone over budget.
// No text is read to decide what stays. The rule is position and length only.
export const triageStateCharBudget = 8_000;

function stateText(turns: readonly Turn[]): string {
  const texts = turns.map((turn) => turn.text);
  const total = texts.reduce((sum, text) => sum + text.length, 0) + texts.length - 1;
  if (total <= triageStateCharBudget) {
    return texts.join("\n");
  }
  const half = Math.floor(triageStateCharBudget / 2);
  let tailStart = texts.length - 1;
  let tailUsed = texts[tailStart]?.length ?? 0;
  while (tailStart > 0) {
    const cost = (texts[tailStart - 1]?.length ?? 0) + 1;
    if (tailUsed + cost > half) {
      break;
    }
    tailUsed += cost;
    tailStart -= 1;
  }
  let headEnd = 0;
  let headUsed = 0;
  while (headEnd < tailStart) {
    const cost = (texts[headEnd]?.length ?? 0) + (headEnd === 0 ? 0 : 1);
    if (headUsed + cost > half) {
      break;
    }
    headUsed += cost;
    headEnd += 1;
  }
  return [...texts.slice(0, headEnd), ...texts.slice(tailStart)].join("\n");
}

export const needInfoGuidance = {
  placement: "after-system-prompt",
  text: "pose une seule question courte",
} as const satisfies TriageGuidance;

export const consultGuidance = {
  placement: "after-system-prompt",
  text: "la nuit ou le week-end, oriente vers le médecin traitant ou une pharmacie de garde",
} as const satisfies TriageGuidance;

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

  const state = stateText(input.handoff.data);
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
