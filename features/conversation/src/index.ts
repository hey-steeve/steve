export {
  DEFAULT_GREETING,
  MAX_CONVERSATION_TURNS,
  MAX_TURN_TEXT_CHARS,
  conversationPhases,
  createConversation,
  greetingForChannel,
  isTerminalPhase,
  markConversationEnded,
  markEmergencyReferred,
  patientTexts,
  recordAssistantReply,
  recordHandoff,
  recordPatientTurn,
  validateTurn,
} from "./state.ts";
export type {
  ConversationMessage,
  ConversationPhase,
  ConversationState,
  TurnValidationFailureReason,
  TurnValidationResult,
} from "./state.ts";
