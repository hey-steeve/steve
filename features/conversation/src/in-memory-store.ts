import type {
  ConversationSession,
  ConversationTurn,
} from "./contracts.js";
import type { ConversationStore } from "./dependencies.js";

export function createInMemoryConversationStore(
  initialSessions: readonly ConversationSession[] = [],
): ConversationStore {
  const sessions = new Map<string, ConversationSession>();
  for (const session of initialSessions) {
    if (sessions.has(session.id)) {
      throw new Error(`Duplicate initial conversation session: ${session.id}`);
    }
    sessions.set(session.id, cloneSession(session));
  }

  return {
    async get(sessionId) {
      const session = sessions.get(sessionId);
      return session === undefined ? null : cloneSession(session);
    },
    async save(session, expectedVersion) {
      const current = sessions.get(session.id);
      if (expectedVersion === null) {
        if (current !== undefined || session.version !== 0) {
          throw new Error("Conversation session creation conflict");
        }
      } else if (
        current === undefined ||
        current.version !== expectedVersion ||
        session.version !== expectedVersion + 1
      ) {
        throw new Error("Conversation session update conflict");
      }
      sessions.set(session.id, cloneSession(session));
    },
  };
}

function cloneSession(session: ConversationSession): ConversationSession {
  return {
    ...session,
    turns: session.turns.map(cloneTurn),
  };
}

function cloneTurn(turn: ConversationTurn): ConversationTurn {
  return { ...turn };
}
