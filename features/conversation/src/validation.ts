import {
  conversationLimits,
  type ConversationTurnInput,
  type RequestIntent,
  type RequestUnderstanding,
} from "./contracts.js";

const intents: ReadonlySet<string> = new Set([
  "care_request",
  "document_request",
  "general_question",
  "unsupported",
  "end_conversation",
]);
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export type TurnInputValidation =
  | {
      readonly valid: true;
      readonly sessionId: string;
      readonly turnId: string;
      readonly text: string;
      readonly channel: ConversationTurnInput["channel"];
    }
  | {
      readonly valid: false;
      readonly code:
        | "invalid_channel"
        | "invalid_session_id"
        | "invalid_turn_id"
        | "invalid_text"
        | "text_too_long";
    };

export function validateTurnInput(
  input: ConversationTurnInput,
): TurnInputValidation {
  if (!isConversationChannel(input.channel)) {
    return { valid: false, code: "invalid_channel" };
  }
  const sessionId = normalizeId(input.sessionId);
  if (sessionId === null) {
    return { valid: false, code: "invalid_session_id" };
  }
  const turnId = normalizeId(input.turnId);
  if (turnId === null) {
    return { valid: false, code: "invalid_turn_id" };
  }
  if (typeof input.text !== "string") {
    return { valid: false, code: "invalid_text" };
  }
  const text = input.text.trim();
  if (text.length === 0) {
    return { valid: false, code: "invalid_text" };
  }
  if (text.length > conversationLimits.maxTextChars) {
    return { valid: false, code: "text_too_long" };
  }
  return { valid: true, sessionId, turnId, text, channel: input.channel };
}

export function isConversationChannel(
  value: unknown,
): value is ConversationTurnInput["channel"] {
  return value === "text" || value === "voice" || value === "inbox";
}

export function normalizeGeneratedId(value: unknown): string | null {
  return normalizeId(value);
}

export function parseUnderstanding(value: unknown): RequestUnderstanding | null {
  if (!isRecord(value)) {
    return null;
  }
  const intent = field(value, "intent");
  const summary = field(value, "summary");
  if (
    typeof intent !== "string" ||
    !intents.has(intent) ||
    typeof summary !== "string"
  ) {
    return null;
  }
  const normalizedSummary = summary.trim();
  if (
    normalizedSummary.length === 0 ||
    normalizedSummary.length > conversationLimits.maxSummaryChars
  ) {
    return null;
  }
  return {
    intent: intent as RequestIntent,
    summary: normalizedSummary,
  };
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > conversationLimits.maxIdChars ||
    !idPattern.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(record: Record<string, unknown>, key: string): unknown {
  if (!Object.hasOwn(record, key)) {
    return undefined;
  }
  return Reflect.get(record, key);
}
