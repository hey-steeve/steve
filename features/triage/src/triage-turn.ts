import type { ClassifyResult, EmergencyCalls } from "./types.ts";

// TODO: switch to the ConversationHandoff contract from PR 37 when it merges, via @steve/shared.
export type ConversationChannel = "text" | "voice" | "inbox";

export type RequestIntent =
  | "care_request"
  | "document_request"
  | "general_question"
  | "unsupported"
  | "end_conversation";

export type ConversationHandoffTarget = "triage";

export interface ConversationHandoff {
  readonly target: ConversationHandoffTarget;
  readonly sessionId: string;
  readonly turnId: string;
  readonly channel: ConversationChannel;
  readonly intent: Exclude<RequestIntent, "unsupported" | "end_conversation">;
  readonly summary: string;
  readonly sourceText: string;
}

export type EarlierTurn = {
  readonly sourceText: string;
};

export type TriageTurnInput = ConversationHandoff & {
  readonly earlierTurns?: readonly EarlierTurn[];
};

export type TriageClassifier = (input: {
  readonly state: string;
}) => Promise<ClassifyResult>;

export type TriageTurnRequest = {
  readonly handoff: TriageTurnInput;
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
    }
  | {
      readonly label: "self-care";
    }
  | {
      readonly label: "need-info";
      readonly guidance: TriageGuidance;
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

export async function triageTurn(input: TriageTurnRequest): Promise<TriageDecision> {
  const earlier = input.handoff.earlierTurns ?? [];
  const prior = earlier.slice(-(stateTurnLimit - 1)).map((turn) => turn.sourceText);
  const state = [...prior, input.handoff.sourceText].join("\n");
  const result = await input.classify({ state });
  switch (result.label) {
    case "emergency":
      return { label: "emergency", calls: result.calls };
    case "consult":
      return { label: "consult", guidance: consultGuidance };
    case "self-care":
      return { label: "self-care" };
    case "need-info":
      return { label: "need-info", guidance: needInfoGuidance };
    default: {
      const unreachable: never = result;
      return unreachable;
    }
  }
}
