import type { ConversationSession, ConversationTurn } from "./contracts.js";

export interface RequestUnderstandingInput {
  readonly sessionId: string;
  readonly turn: ConversationTurn;
  readonly history: readonly ConversationTurn[];
  readonly signal: AbortSignal;
}

export interface RequestUnderstandingProvider {
  understand(input: RequestUnderstandingInput): Promise<unknown>;
}

export interface ConversationStore {
  get(sessionId: string): Promise<ConversationSession | null>;
  save(
    session: ConversationSession,
    expectedVersion: number | null,
  ): Promise<void>;
}

export interface ConversationIdGenerator {
  sessionId(): string;
  assistantTurnId(): string;
}

export interface ConversationClock {
  now(): string;
}

export interface ConversationDependencies {
  readonly store: ConversationStore;
  readonly understanding: RequestUnderstandingProvider;
  readonly ids: ConversationIdGenerator;
  readonly clock: ConversationClock;
}
