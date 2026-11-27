import type { FeatureResult, Handoff, Turn, TurnChannel } from "@steve/shared";
import {
  markConversationEnded,
  markEmergencyReferred,
  patientTexts,
  recordAssistantReply,
  recordHandoff,
  recordPatientTurn,
  validateTurn,
} from "./state.ts";
import type { ConversationState, TurnValidationFailureReason } from "./state.ts";

export const FALLBACK_CLARIFY_REPLY =
  "Je n'ai pas pu traiter ta demande pour le moment. Peux-tu préciser ce dont tu as besoin ?" as const;

export const FALLBACK_HANDOFF_ERROR_REPLY =
  "Je n'ai pas pu finaliser cette étape pour le moment. Veux-tu que je réessaie ?" as const;

export type EmergencyCallNumber = "15" | "3114";

export type TriageGateInput = {
  readonly sessionId: string;
  readonly turnId: string;
  readonly channel: TurnChannel;
  readonly patientHistory: readonly string[];
};

export type TriageGateOutcome =
  | { readonly status: "continue" }
  | {
      readonly status: "emergency";
      readonly calls: readonly EmergencyCallNumber[];
      readonly reply: string;
    };

export type IntentDecision =
  | {
      readonly kind: "handoff";
      readonly target: string;
      readonly intent: string;
      readonly data: unknown;
    }
  | { readonly kind: "clarify"; readonly reply: string }
  | { readonly kind: "end"; readonly reply: string };

export type ConversationDeps = {
  readonly triageGate: (input: TriageGateInput) => Promise<TriageGateOutcome>;
  readonly resolveIntent: (input: {
    readonly turn: Turn;
    readonly patientHistory: readonly string[];
  }) => Promise<IntentDecision>;
  readonly dispatchHandoff: (handoff: Handoff) => Promise<FeatureResult>;
};

export type ConversationTurnOutcome =
  | { readonly kind: "invalid-turn"; readonly reason: TurnValidationFailureReason }
  | {
      readonly kind: "emergency-referral";
      readonly calls: readonly EmergencyCallNumber[];
      readonly reply: string;
    }
  | { readonly kind: "clarify"; readonly reply: string }
  | {
      readonly kind: "handoff-result";
      readonly handoff: Handoff;
      readonly result: FeatureResult;
    }
  | { readonly kind: "ended"; readonly reply: string };

export type HandleConversationTurnResult = {
  readonly state: ConversationState;
  readonly outcome: ConversationTurnOutcome;
};

function nonEmptyReply(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export async function handleConversationTurn(
  state: ConversationState,
  turn: Turn,
  deps: ConversationDeps,
): Promise<HandleConversationTurnResult> {
  const validated = validateTurn(turn, state);
  if (!validated.ok) {
    return {
      state,
      outcome: { kind: "invalid-turn", reason: validated.reason },
    };
  }

  const cleanTurn = validated.turn;
  const withPatient = recordPatientTurn(state, cleanTurn);
  const patientHistory = patientTexts(withPatient);

  let triageResult: TriageGateOutcome;
  try {
    triageResult = await deps.triageGate({
      sessionId: cleanTurn.sessionId,
      turnId: cleanTurn.turnId,
      channel: cleanTurn.channel,
      patientHistory,
    });
  } catch {
    const nextState = recordAssistantReply(
      withPatient,
      cleanTurn.turnId,
      FALLBACK_CLARIFY_REPLY,
      "listening",
    );
    return {
      state: nextState,
      outcome: { kind: "clarify", reply: FALLBACK_CLARIFY_REPLY },
    };
  }

  if (triageResult.status === "emergency") {
    const reply = triageResult.reply.trim();
    const nextState = markEmergencyReferred(withPatient, cleanTurn.turnId, reply);
    return {
      state: nextState,
      outcome: {
        kind: "emergency-referral",
        calls: triageResult.calls,
        reply,
      },
    };
  }

  let decision: IntentDecision;
  try {
    decision = await deps.resolveIntent({ turn: cleanTurn, patientHistory });
  } catch {
    const nextState = recordAssistantReply(
      withPatient,
      cleanTurn.turnId,
      FALLBACK_CLARIFY_REPLY,
      "listening",
    );
    return {
      state: nextState,
      outcome: { kind: "clarify", reply: FALLBACK_CLARIFY_REPLY },
    };
  }

  if (decision.kind === "clarify") {
    const reply = nonEmptyReply(decision.reply, FALLBACK_CLARIFY_REPLY);
    return {
      state: recordAssistantReply(withPatient, cleanTurn.turnId, reply, "listening"),
      outcome: { kind: "clarify", reply },
    };
  }

  if (decision.kind === "end") {
    const reply = nonEmptyReply(decision.reply, "À bientôt.");
    return {
      state: markConversationEnded(withPatient, cleanTurn.turnId, reply),
      outcome: { kind: "ended", reply },
    };
  }

  const target = decision.target.trim();
  const intent = decision.intent.trim();
  if (target.length === 0 || intent.length === 0) {
    return {
      state: recordAssistantReply(
        withPatient,
        cleanTurn.turnId,
        FALLBACK_CLARIFY_REPLY,
        "listening",
      ),
      outcome: { kind: "clarify", reply: FALLBACK_CLARIFY_REPLY },
    };
  }

  const handoff: Handoff = {
    sessionId: cleanTurn.sessionId,
    turnId: cleanTurn.turnId,
    target,
    intent,
    data: decision.data,
  };

  let featureResult: FeatureResult;
  try {
    const raw = await deps.dispatchHandoff(handoff);
    const trimmed = raw.reply.trim();
    if (raw.ok && trimmed.length > 0) {
      featureResult =
        raw.data !== undefined
          ? { ok: true, reply: trimmed, data: raw.data }
          : { ok: true, reply: trimmed };
    } else {
      featureResult = {
        ok: false,
        reply: trimmed.length > 0 ? trimmed : FALLBACK_HANDOFF_ERROR_REPLY,
      };
    }
  } catch {
    featureResult = { ok: false, reply: FALLBACK_HANDOFF_ERROR_REPLY };
  }

  const nextState = featureResult.ok
    ? recordAssistantReply(
        recordHandoff(withPatient, handoff),
        cleanTurn.turnId,
        featureResult.reply,
        "handed-off",
      )
    : recordAssistantReply(
        withPatient,
        cleanTurn.turnId,
        featureResult.reply,
        "listening",
      );

  return {
    state: nextState,
    outcome: {
      kind: "handoff-result",
      handoff,
      result: featureResult,
    },
  };
}
