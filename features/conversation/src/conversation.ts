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
      nextAction: "awaiting_user",
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
    seenTurnIds: [],
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

type UnderstandingAttempt =
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "failure" }
  | { readonly kind: "timeout" };

async function requestUnderstanding(
  dependencies: ConversationDependencies,
  session: ConversationSession,
  userTurn: ConversationTurn,
): Promise<UnderstandingAttempt> {
  const controller = new AbortController();
  let provider: Promise<UnderstandingAttempt>;
  try {
    provider = dependencies.understanding
      .understand({
        sessionId: session.id,
        turn: userTurn,
        history: session.turns,
        signal: controller.signal,
      })
      .then<UnderstandingAttempt, UnderstandingAttempt>(
        (value) => ({ kind: "value", value }),
        () => ({ kind: "failure" }),
      );
  } catch {
    return { kind: "failure" };
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<UnderstandingAttempt>((resolve) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      resolve({ kind: "timeout" });
    }, conversationLimits.understandingTimeoutMs);
  });
  try {
    return await Promise.race([provider, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
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
  if (session.seenTurnIds.includes(validation.turnId)) {
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
      return dependencyFailure(session);
    }
    userTurn = {
      id: validation.turnId,
      role: "user",
      channel: validation.channel,
      text: validation.text,
      createdAt: now,
    };
  } catch {
    return dependencyFailure(session);
  }

  const attempt = await requestUnderstanding(dependencies, session, userTurn);
  if (attempt.kind === "timeout") {
    return understandingTimeout(session);
  }
  if (attempt.kind === "failure") {
    return understandingFailure(session);
  }
  const understanding = parseUnderstanding(attempt.value);
  if (understanding === null) {
    return understandingFailure(session);
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
      return dependencyFailure(session);
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
      "active",
      now,
      userTurn.id,
    );
  } catch {
    return dependencyFailure(session);
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
    handoff: handoffFor(
      understanding,
      session.id,
      userTurn,
      reply.completeAfterTriage,
    ),
    nextAction: reply.nextAction,
  };
}

function updateSession(
  session: ConversationSession,
  turns: readonly ConversationTurn[],
  status: ConversationSession["status"],
  updatedAt: string,
  seenTurnId: string,
): ConversationSession {
  const history = [...session.turns, ...turns];
  return {
    ...session,
    status,
    version: session.version + 1,
    updatedAt,
    turns: history.slice(-conversationLimits.maxHistoryTurns),
    seenTurnIds: [...session.seenTurnIds, seenTurnId],
  };
}

function handoffFor(
  understanding: RequestUnderstanding,
  sessionId: string,
  turn: ConversationTurn,
  completeAfterTriage: boolean,
): ConversationHandoff {
  return handoff(
    understanding.intent,
    understanding.summary,
    sessionId,
    turn,
    completeAfterTriage,
  );
}

function handoff(
  intent: ConversationHandoff["intent"],
  summary: string,
  sessionId: string,
  turn: ConversationTurn,
  completeAfterTriage: boolean,
): ConversationHandoff {
  return {
    target: "triage",
    sessionId,
    turnId: turn.id,
    intent,
    data: {
      channel: turn.channel,
      summary,
      sourceText: turn.text,
      completeAfterTriage,
    },
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
        nextAction: "awaiting_user",
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

function understandingTimeout(
  session: ConversationSession,
): ConversationTurnResult {
  return {
    outcome: "failed",
    code: "understanding_timeout",
    response: conversationResponses.understandingTimeout,
    session,
    nextAction: "awaiting_user",
  };
}

function dependencyFailure(
  session: ConversationSession,
): ConversationTurnResult {
  return {
    outcome: "failed",
    code: "dependency_failure",
    response: conversationResponses.dependencyFailure,
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

function exhaustiveRejection(value: never): never {
  throw new Error(`Unsupported rejection: ${String(value)}`);
}
