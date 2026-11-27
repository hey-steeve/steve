import { turnChannels } from "@steve/shared";
import type { Handoff, Turn, TurnChannel } from "@steve/shared";

export const conversationPhases = [
  "greeting",
  "listening",
  "handed-off",
  "emergency-referred",
  "ended",
] as const;

export type ConversationPhase = (typeof conversationPhases)[number];

export const MAX_CONVERSATION_TURNS = 64 as const;
export const MAX_TURN_TEXT_CHARS = 4000 as const;

export const DEFAULT_GREETING =
  "Bonjour, je suis Steve. Comment puis-je t'aider aujourd'hui ?" as const;

export type ConversationMessage = {
  readonly role: "patient" | "assistant";
  readonly turnId: string;
  readonly text: string;
};

export type ConversationState = {
  readonly sessionId: string;
  readonly channel: TurnChannel;
  readonly phase: ConversationPhase;
  readonly messages: readonly ConversationMessage[];
  readonly activeHandoff?: Handoff;
  readonly endedReason?: "completed" | "emergency";
};

export type TurnValidationFailureReason =
  | "invalid-turn"
  | "session-mismatch"
  | "channel-mismatch"
  | "duplicate-turn"
  | "session-ended";

export type TurnValidationResult =
  | { readonly ok: true; readonly turn: Turn }
  | { readonly ok: false; readonly reason: TurnValidationFailureReason };

function isTurnChannel(value: unknown): value is TurnChannel {
  return typeof value === "string" && turnChannels.some((entry) => entry === value);
}

export function isTerminalPhase(phase: ConversationPhase): boolean {
  return phase === "ended";
}

export function greetingForChannel(_channel: TurnChannel): string {
  return DEFAULT_GREETING;
}

export function createConversation(
  sessionId: string,
  channel: TurnChannel,
): ConversationState {
  const trimmed = sessionId.trim();
  if (trimmed.length === 0) {
    throw new RangeError("sessionId must be non-empty");
  }
  if (!isTurnChannel(channel)) {
    throw new RangeError("channel must be voice or text");
  }
  return {
    sessionId: trimmed,
    channel,
    phase: "greeting",
    messages: [],
  };
}

export function validateTurn(turn: Turn, state: ConversationState): TurnValidationResult {
  if (isTerminalPhase(state.phase)) {
    return { ok: false, reason: "session-ended" };
  }

  const sessionId = typeof turn.sessionId === "string" ? turn.sessionId.trim() : "";
  const turnId = typeof turn.turnId === "string" ? turn.turnId.trim() : "";
  const text = typeof turn.text === "string" ? turn.text.trim() : "";

  if (
    sessionId.length === 0 ||
    turnId.length === 0 ||
    text.length === 0 ||
    text.length > MAX_TURN_TEXT_CHARS ||
    !isTurnChannel(turn.channel)
  ) {
    return { ok: false, reason: "invalid-turn" };
  }

  if (sessionId !== state.sessionId) {
    return { ok: false, reason: "session-mismatch" };
  }

  if (turn.channel !== state.channel) {
    return { ok: false, reason: "channel-mismatch" };
  }

  if (state.messages.some((entry) => entry.role === "patient" && entry.turnId === turnId)) {
    return { ok: false, reason: "duplicate-turn" };
  }

  return {
    ok: true,
    turn: {
      sessionId,
      turnId,
      channel: turn.channel,
      text,
    },
  };
}

function appendBoundedMessage(
  messages: readonly ConversationMessage[],
  entry: ConversationMessage,
): readonly ConversationMessage[] {
  const maxMessages = MAX_CONVERSATION_TURNS * 2;
  const next = [...messages, entry];
  return next.length > maxMessages ? next.slice(next.length - maxMessages) : next;
}

export function recordPatientTurn(
  state: ConversationState,
  turn: Turn,
): ConversationState {
  if (isTerminalPhase(state.phase)) {
    return state;
  }
  const nextPhase: ConversationPhase =
    state.phase === "greeting" ? "listening" : state.phase;
  return {
    ...state,
    phase: nextPhase,
    messages: appendBoundedMessage(state.messages, {
      role: "patient",
      turnId: turn.turnId,
      text: turn.text,
    }),
  };
}

export function recordAssistantReply(
  state: ConversationState,
  turnId: string,
  reply: string,
  nextPhase?: Exclude<ConversationPhase, "emergency-referred" | "ended">,
): ConversationState {
  if (isTerminalPhase(state.phase)) {
    return state;
  }
  const resolvedPhase: ConversationPhase =
    state.phase === "emergency-referred"
      ? "emergency-referred"
      : (nextPhase ?? state.phase);
  return {
    ...state,
    phase: resolvedPhase,
    messages: appendBoundedMessage(state.messages, {
      role: "assistant",
      turnId,
      text: reply,
    }),
  };
}

export function recordHandoff(
  state: ConversationState,
  handoff: Handoff,
): ConversationState {
  if (
    isTerminalPhase(state.phase) ||
    state.phase === "emergency-referred" ||
    handoff.sessionId !== state.sessionId
  ) {
    return state;
  }
  return {
    ...state,
    phase: "handed-off",
    activeHandoff: handoff,
  };
}

export function markEmergencyReferred(
  state: ConversationState,
  turnId: string,
  reply: string,
): ConversationState {
  if (isTerminalPhase(state.phase)) {
    return state;
  }
  const { activeHandoff: _cleared, ...rest } = state;
  return {
    ...rest,
    phase: "emergency-referred",
    endedReason: "emergency",
    messages: appendBoundedMessage(state.messages, {
      role: "assistant",
      turnId,
      text: reply,
    }),
  };
}

export function markConversationEnded(
  state: ConversationState,
  turnId: string,
  reply: string,
): ConversationState {
  if (isTerminalPhase(state.phase)) {
    return state;
  }
  const { activeHandoff: _cleared, ...rest } = state;
  return {
    ...rest,
    phase: "ended",
    endedReason: "completed",
    messages: appendBoundedMessage(state.messages, {
      role: "assistant",
      turnId,
      text: reply,
    }),
  };
}

export function patientTexts(state: ConversationState): readonly string[] {
  return state.messages
    .filter((entry) => entry.role === "patient")
    .map((entry) => entry.text);
}
