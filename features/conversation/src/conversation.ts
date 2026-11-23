import {
  conversationLimits,
  type Conversation,
  type ConversationHandoff,
  type ConversationSession,
  type ConversationTurn,
  type ConversationTurnInput,
  type ConversationTurnResult,
  type RequestUnderstanding,
  type StartConversationInput,
  type StartConversationResult,
} from "./contracts.js";
import type { ConversationDependencies } from "./dependencies.js";
import {
  conversationResponses,
  responseForUnderstanding,
} from "./responses.js";
import {
  isConversationChannel,
  normalizeGeneratedId,
  parseUnderstanding,
  validateTurnInput,
} from "./validation.js";

export function createConversation(
  dependencies: ConversationDependencies,
): Conversation {
  return {
    startSession(input) {
      return startSession(dependencies, input);
    },
    handleTurn(input) {
      return handleTurn(dependencies, input);
    },
  };
}

async function startSession(
  dependencies: ConversationDependencies,
  input: StartConversationInput,
): Promise<StartConversationResult> {
  if (!isConversationChannel(input.channel)) {
    return {
      outcome: "rejected",
      code: "invalid_channel",
      response: conversationResponses.invalidChannel,
      nextAction: "completed",
    };
  }
  let sessionId: string | null;
  let assistantTurnId: string | null;
  let now: string;
  try {
    sessionId = normalizeGeneratedId(dependencies.ids.sessionId());
    assistantTurnId = normalizeGeneratedId(dependencies.ids.assistantTurnId());
    now = dependencies.clock.now();
  } catch {
    return startDependencyFailure();
  }
  if (sessionId === null || assistantTurnId === null || !validTimestamp(now)) {
    return startDependencyFailure();
  }
  const greeting: ConversationTurn = {
    id: assistantTurnId,
    role: "assistant",
    channel: input.channel,
    text: conversationResponses.greeting,
    createdAt: now,
  };
  const session: ConversationSession = {
    id: sessionId,
    status: "active",
    version: 0,
    createdAt: now,
    updatedAt: now,
    turns: [greeting],
  };
  try {
    await dependencies.store.save(session, null);
  } catch {
    return {
      outcome: "failed",
      code: "storage_failure",
      response: conversationResponses.startFailure,
      nextAction: "completed",
    };
  }
  return {
    outcome: "started",
    session,
    response: greeting,
    nextAction: "awaiting_user",
  };
}

async function handleTurn(
  dependencies: ConversationDependencies,
  input: ConversationTurnInput,
): Promise<ConversationTurnResult> {
  const validation = validateTurnInput(input);
  if (!validation.valid) {
    return rejectionFor(validation.code);
  }

  let session: ConversationSession | null;
  try {
    session = await dependencies.store.get(validation.sessionId);
  } catch {
    return storageFailure(null);
  }
  if (session === null) {
    return {
      outcome: "rejected",
      code: "session_not_found",
      response: conversationResponses.sessionNotFound,
      nextAction: "completed",
    };
  }
  if (session.status === "completed") {
    return {
      outcome: "rejected",
      code: "session_completed",
      response: conversationResponses.sessionCompleted,
      nextAction: "completed",
    };
  }
  if (session.turns.some((turn) => turn.id === validation.turnId)) {
    return {
      outcome: "rejected",
      code: "duplicate_turn",
      response: conversationResponses.duplicate,
      nextAction: "awaiting_user",
    };
  }

  let userTurn: ConversationTurn;
  try {
    const now = dependencies.clock.now();
    if (!validTimestamp(now)) {
      return understandingFailure(session);
    }
    userTurn = {
      id: validation.turnId,
      role: "user",
      channel: validation.channel,
      text: validation.text,
      createdAt: now,
    };
  } catch {
    return understandingFailure(session);
  }

  let understanding: RequestUnderstanding | null;
  try {
    const raw = await dependencies.understanding.understand({
      sessionId: session.id,
      turn: userTurn,
      history: session.turns,
    });
    understanding = parseUnderstanding(raw);
  } catch {
    understanding = null;
  }
  if (understanding === null) {
    return persistFailureExchange(dependencies, session, userTurn);
  }

  const reply = responseForUnderstanding(understanding);
  let responseTurn: ConversationTurn;
  let updated: ConversationSession;
  try {
    const assistantTurnId = normalizeGeneratedId(
      dependencies.ids.assistantTurnId(),
    );
    const now = dependencies.clock.now();
    if (assistantTurnId === null || !validTimestamp(now)) {
      return understandingFailure(session);
    }
    responseTurn = {
      id: assistantTurnId,
      role: "assistant",
      channel: input.channel,
      text: reply.text,
      createdAt: now,
    };
    updated = updateSession(
      session,
      [userTurn, responseTurn],
      reply.nextAction === "completed" ? "completed" : "active",
      now,
    );
  } catch {
    return understandingFailure(session);
  }

  try {
    await dependencies.store.save(updated, session.version);
  } catch {
    return storageFailure(session);
  }

  return {
    outcome: "handled",
    session: updated,
    response: responseTurn,
    understanding,
    handoff: handoffFor(understanding, session.id, userTurn),
    nextAction: reply.nextAction,
  };
}

async function persistFailureExchange(
  dependencies: ConversationDependencies,
  session: ConversationSession,
  userTurn: ConversationTurn,
): Promise<ConversationTurnResult> {
  let responseTurn: ConversationTurn;
  let updated: ConversationSession;
  try {
    const assistantTurnId = normalizeGeneratedId(
      dependencies.ids.assistantTurnId(),
    );
    const now = dependencies.clock.now();
    if (assistantTurnId === null || !validTimestamp(now)) {
      return understandingFailure(session);
    }
    responseTurn = {
      id: assistantTurnId,
      role: "assistant",
      channel: userTurn.channel,
      text: conversationResponses.understandingFailure,
      createdAt: now,
    };
    updated = updateSession(session, [userTurn, responseTurn], "active", now);
  } catch {
    return understandingFailure(session);
  }
  try {
    await dependencies.store.save(updated, session.version);
  } catch {
    return storageFailure(session);
  }
  return {
    outcome: "failed",
    code: "understanding_failure",
    response: responseTurn.text,
    session: updated,
    nextAction: "awaiting_user",
  };
}

function updateSession(
  session: ConversationSession,
  turns: readonly ConversationTurn[],
  status: ConversationSession["status"],
  updatedAt: string,
): ConversationSession {
  const history = [...session.turns, ...turns];
  return {
    ...session,
    status,
    version: session.version + 1,
    updatedAt,
    turns: history.slice(-conversationLimits.maxHistoryTurns),
  };
}

function handoffFor(
  understanding: RequestUnderstanding,
  sessionId: string,
  turn: ConversationTurn,
): ConversationHandoff | null {
  switch (understanding.intent) {
    case "care_request":
      return handoff(
        "care_request",
        understanding.summary,
        sessionId,
        turn,
      );
    case "document_request":
      return handoff(
        "document_request",
        understanding.summary,
        sessionId,
        turn,
      );
    case "general_question":
      return handoff(
        "general_question",
        understanding.summary,
        sessionId,
        turn,
      );
    case "unsupported":
    case "end_conversation":
      return null;
    default:
      return exhaustiveIntent(understanding.intent);
  }
}

function handoff(
  intent: ConversationHandoff["intent"],
  summary: string,
  sessionId: string,
  turn: ConversationTurn,
): ConversationHandoff {
  return {
    target: "triage",
    sessionId,
    turnId: turn.id,
    channel: turn.channel,
    intent,
    summary,
    sourceText: turn.text,
  };
}

function rejectionFor(
  code:
    | "invalid_channel"
    | "invalid_session_id"
    | "invalid_turn_id"
    | "invalid_text"
    | "text_too_long",
): ConversationTurnResult {
  switch (code) {
    case "invalid_channel":
      return {
        outcome: "rejected",
        code,
        response: conversationResponses.invalidChannel,
        nextAction: "completed",
      };
    case "invalid_session_id":
      return {
        outcome: "rejected",
        code,
        response: conversationResponses.invalidSession,
        nextAction: "completed",
      };
    case "invalid_turn_id":
      return {
        outcome: "rejected",
        code,
        response: conversationResponses.invalidTurn,
        nextAction: "awaiting_user",
      };
    case "invalid_text":
      return {
        outcome: "rejected",
        code,
        response: conversationResponses.empty,
        nextAction: "awaiting_user",
      };
    case "text_too_long":
      return {
        outcome: "rejected",
        code,
        response: conversationResponses.tooLong,
        nextAction: "awaiting_user",
      };
    default:
      return exhaustiveRejection(code);
  }
}

function startDependencyFailure(): StartConversationResult {
  return {
    outcome: "failed",
    code: "dependency_failure",
    response: conversationResponses.startFailure,
    nextAction: "completed",
  };
}

function understandingFailure(
  session: ConversationSession,
): ConversationTurnResult {
  return {
    outcome: "failed",
    code: "understanding_failure",
    response: conversationResponses.understandingFailure,
    session,
    nextAction: "awaiting_user",
  };
}

function storageFailure(
  session: ConversationSession | null,
): ConversationTurnResult {
  return {
    outcome: "failed",
    code: "storage_failure",
    response: conversationResponses.storageFailure,
    session,
    nextAction: "awaiting_user",
  };
}

function validTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function exhaustiveIntent(value: never): never {
  throw new Error(`Unsupported request intent: ${String(value)}`);
}

function exhaustiveRejection(value: never): never {
  throw new Error(`Unsupported rejection: ${String(value)}`);
}
