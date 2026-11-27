export {
  FALLBACK_CLARIFY_REPLY,
  FALLBACK_HANDOFF_ERROR_REPLY,
  handleConversationTurn,
} from "./orchestrator.ts";
export type {
  ConversationDeps,
  ConversationTurnOutcome,
  EmergencyCallNumber,
  HandleConversationTurnResult,
  IntentDecision,
  TriageGateInput,
  TriageGateOutcome,
} from "./orchestrator.ts";
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
