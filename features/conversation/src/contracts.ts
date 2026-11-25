import type { Handoff, Turn, TurnChannel } from "@steve/shared";

export const conversationLimits = {
  maxTextChars: 4_000,
  maxSummaryChars: 500,
  maxHistoryTurns: 40,
  maxIdChars: 128,
  understandingTimeoutMs: 30_000,
} as const;

export type ConversationChannel = TurnChannel;
export type ConversationRole = "user" | "assistant";
export type ConversationStatus = "active" | "awaiting_triage" | "completed";
export type ConversationNextAction =
  | "awaiting_user"
  | "handoff"
  | "completed";

export interface ConversationTurn {
  readonly id: string;
  readonly role: ConversationRole;
  readonly channel: ConversationChannel;
  readonly text: string;
  readonly createdAt: string;
}

export interface ConversationSession {
  readonly id: string;
  readonly status: ConversationStatus;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly turns: readonly ConversationTurn[];
  readonly seenTurnIds: readonly string[];
  readonly completionTurnId: string | null;
}

export interface StartConversationInput {
  readonly channel: ConversationChannel;
}

export type RequestIntent =
  | "care_request"
  | "document_request"
  | "general_question"
  | "unsupported"
  | "end_conversation";

export interface RequestUnderstanding {
  readonly intent: RequestIntent;
  readonly summary: string;
}

export type ConversationHandoffTarget = "triage";

export type ConversationHandoff = Handoff<readonly Turn[]> & {
  readonly target: ConversationHandoffTarget;
  readonly intent: RequestIntent;
  readonly completeAfterTriage: boolean;
};

export type ConversationTurnInput = Turn;

export type StartConversationResult =
  | {
      readonly outcome: "started";
      readonly session: ConversationSession;
      readonly response: ConversationTurn;
      readonly nextAction: "awaiting_user";
    }
  | {
      readonly outcome: "rejected";
      readonly code: "invalid_channel";
      readonly response: string;
      readonly nextAction: "awaiting_user";
    }
  | {
      readonly outcome: "failed";
      readonly code: "dependency_failure" | "storage_failure";
      readonly response: string;
      readonly nextAction: "completed";
    };

export type ConversationRejectionCode =
  | "invalid_channel"
  | "invalid_session_id"
  | "invalid_turn_id"
  | "invalid_text"
  | "text_too_long"
  | "session_not_found"
  | "session_awaiting_triage"
  | "session_completed"
  | "duplicate_turn";

export type ConversationFailureCode =
  | "dependency_failure"
  | "understanding_failure"
  | "understanding_timeout"
  | "storage_failure";

export type ConversationTurnResult =
  | {
      readonly outcome: "handled";
      readonly session: ConversationSession;
      readonly response: ConversationTurn;
      readonly understanding: RequestUnderstanding;
      readonly handoff: ConversationHandoff;
      readonly nextAction: ConversationNextAction;
    }
  | {
      readonly outcome: "rejected";
      readonly code: ConversationRejectionCode;
      readonly response: string;
      readonly nextAction: "awaiting_user" | "completed";
    }
  | {
      readonly outcome: "failed";
      readonly code: ConversationFailureCode;
      readonly response: string;
      readonly session: ConversationSession | null;
      readonly handoff: ConversationHandoff;
      readonly nextAction: "awaiting_user";
    };

export interface CompleteConversationInput {
  readonly sessionId: string;
  readonly turnId: string;
}

export type CompleteConversationResult =
  | {
      readonly outcome: "completed";
      readonly session: ConversationSession;
    }
  | {
      readonly outcome: "rejected";
      readonly code:
        | "invalid_session_id"
        | "invalid_turn_id"
        | "session_not_found"
        | "completion_not_pending"
        | "completion_turn_mismatch";
      readonly response: string;
    }
  | {
      readonly outcome: "failed";
      readonly code: "dependency_failure" | "storage_failure";
      readonly response: string;
      readonly session: ConversationSession | null;
    };

export interface Conversation {
  startSession(input: StartConversationInput): Promise<StartConversationResult>;
  handleTurn(input: ConversationTurnInput): Promise<ConversationTurnResult>;
  completeSession(
    input: CompleteConversationInput,
  ): Promise<CompleteConversationResult>;
}
