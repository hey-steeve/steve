import {
  conversationLimits,
  type CompleteConversationInput,
  type CompleteConversationResult,
  type Conversation,
  type ConversationHandoff,
  type ConversationSession,
  type ConversationTurn,
  type ConversationTurnInput,
  type ConversationTurnResult,
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
    completeSession(input) {
      return completeSession(dependencies, input);
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
    completionTurnId: null,
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

  const sharedTurn: ConversationTurnInput = {
    sessionId: validation.sessionId,
    turnId: validation.turnId,
    channel: validation.channel,
    text: validation.text,
  };
  let turnHandoff = handoff(
    "unsupported",
    [sharedTurn],
    false,
  );

  let session: ConversationSession | null;
  try {
    session = await dependencies.store.get(validation.sessionId);
  } catch {
    return storageFailure(null, turnHandoff);
  }
  if (session === null) {
    return {
      outcome: "rejected",
      code: "session_not_found",
      response: conversationResponses.sessionNotFound,
      handoff: turnHandoff,
      nextAction: "completed",
    };
  }
  turnHandoff = handoff(
    "unsupported",
    triageTurns(session, sharedTurn),
    false,
  );
  if (session.status === "completed") {
    return {
      outcome: "rejected",
      code: "session_completed",
      response: conversationResponses.sessionCompleted,
      handoff: turnHandoff,
      nextAction: "completed",
    };
  }
  if (session.status === "awaiting_triage") {
    return {
      outcome: "rejected",
      code: "session_awaiting_triage",
      response: conversationResponses.sessionAwaitingTriage,
      handoff: turnHandoff,
      nextAction: "awaiting_user",
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
      return dependencyFailure(session, turnHandoff);
    }
    userTurn = {
      id: validation.turnId,
      role: "user",
      channel: validation.channel,
      text: validation.text,
      createdAt: now,
    };
  } catch {
    return dependencyFailure(session, turnHandoff);
  }

  const attempt = await requestUnderstanding(dependencies, session, userTurn);
  if (attempt.kind === "timeout") {
    return understandingTimeout(session, turnHandoff);
  }
  if (attempt.kind === "failure") {
    return understandingFailure(session, turnHandoff);
  }
  const understanding = parseUnderstanding(attempt.value);
  if (understanding === null) {
    return understandingFailure(session, turnHandoff);
  }

  const reply = responseForUnderstanding(understanding);
  turnHandoff = handoff(
    understanding.intent,
    triageTurns(session, sharedTurn),
    false,
  );
  let responseTurn: ConversationTurn;
  let updated: ConversationSession;
  try {
    const assistantTurnId = normalizeGeneratedId(
      dependencies.ids.assistantTurnId(),
    );
    const now = dependencies.clock.now();
    if (assistantTurnId === null || !validTimestamp(now)) {
      return dependencyFailure(session, turnHandoff);
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
      reply.completeAfterTriage ? "awaiting_triage" : "active",
      now,
      userTurn.id,
      reply.completeAfterTriage ? userTurn.id : null,
    );
  } catch {
    return dependencyFailure(session, turnHandoff);
  }

  try {
    await dependencies.store.save(updated, session.version);
  } catch {
    return storageFailure(session, turnHandoff);
  }

  return {
    outcome: "handled",
    session: updated,
    response: responseTurn,
    understanding,
    handoff: handoff(
      understanding.intent,
      turnHandoff.data,
      reply.completeAfterTriage,
    ),
    nextAction: reply.nextAction,
  };
}

async function completeSession(
  dependencies: ConversationDependencies,
  input: CompleteConversationInput,
): Promise<CompleteConversationResult> {
  const sessionId = normalizeGeneratedId(input.sessionId);
  if (sessionId === null) {
    return {
      outcome: "rejected",
      code: "invalid_session_id",
      response: conversationResponses.invalidSession,
    };
  }
  const turnId = normalizeGeneratedId(input.turnId);
  if (turnId === null) {
    return {
      outcome: "rejected",
      code: "invalid_turn_id",
      response: conversationResponses.invalidTurn,
    };
  }

  let session: ConversationSession | null;
  try {
    session = await dependencies.store.get(sessionId);
  } catch {
    return completionStorageFailure(null);
  }
  if (session === null) {
    return {
      outcome: "rejected",
      code: "session_not_found",
      response: conversationResponses.sessionNotFound,
    };
  }
  if (session.status === "completed" && session.completionTurnId === turnId) {
    return { outcome: "completed", session };
  }
  if (session.status !== "awaiting_triage") {
    return {
      outcome: "rejected",
      code: "completion_not_pending",
      response: conversationResponses.completionNotPending,
    };
  }
  if (session.completionTurnId !== turnId) {
    return {
      outcome: "rejected",
      code: "completion_turn_mismatch",
      response: conversationResponses.completionTurnMismatch,
    };
  }

  let completed: ConversationSession;
  try {
    const now = dependencies.clock.now();
    if (!validTimestamp(now)) {
      return completionDependencyFailure(session);
    }
    completed = {
      ...session,
      status: "completed",
      version: session.version + 1,
      updatedAt: now,
    };
  } catch {
    return completionDependencyFailure(session);
  }
  try {
    await dependencies.store.save(completed, session.version);
  } catch {
    return completionStorageFailure(session);
  }
  return { outcome: "completed", session: completed };
}

function updateSession(
  session: ConversationSession,
  turns: readonly ConversationTurn[],
  status: ConversationSession["status"],
  updatedAt: string,
  seenTurnId: string,
  completionTurnId: string | null,
): ConversationSession {
  const history = [...session.turns, ...turns];
  return {
    ...session,
    status,
    version: session.version + 1,
    updatedAt,
    turns: history.slice(-conversationLimits.maxHistoryTurns),
    seenTurnIds: [...session.seenTurnIds, seenTurnId],
    completionTurnId,
  };
}

function handoff(
  intent: ConversationHandoff["intent"],
  data: readonly ConversationTurnInput[],
  completeAfterTriage: boolean,
): ConversationHandoff {
  const current = data.at(-1);
  if (current === undefined) {
    throw new Error("Conversation handoff requires a current turn");
  }
  return {
    target: "triage",
    sessionId: current.sessionId,
    turnId: current.turnId,
    intent,
    data,
    completeAfterTriage,
  };
}

function triageTurns(
  session: ConversationSession,
  current: ConversationTurnInput,
): readonly ConversationTurnInput[] {
  const previous = session.turns
    .filter((turn) => turn.role === "user")
    .map((turn) => ({
      sessionId: session.id,
      turnId: turn.id,
      channel: turn.channel,
      text: turn.text,
    }));
  return [...previous, current];
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
  handoff: ConversationHandoff,
): ConversationTurnResult {
  return {
    outcome: "failed",
    code: "understanding_failure",
    response: conversationResponses.understandingFailure,
    session,
    handoff,
    nextAction: "awaiting_user",
  };
}

function understandingTimeout(
  session: ConversationSession,
  handoff: ConversationHandoff,
): ConversationTurnResult {
  return {
    outcome: "failed",
    code: "understanding_timeout",
    response: conversationResponses.understandingTimeout,
    session,
    handoff,
    nextAction: "awaiting_user",
  };
}

function dependencyFailure(
  session: ConversationSession,
  handoff: ConversationHandoff,
): ConversationTurnResult {
  return {
    outcome: "failed",
    code: "dependency_failure",
    response: conversationResponses.dependencyFailure,
    session,
    handoff,
    nextAction: "awaiting_user",
  };
}

function storageFailure(
  session: ConversationSession | null,
  handoff: ConversationHandoff,
): ConversationTurnResult {
  return {
    outcome: "failed",
    code: "storage_failure",
    response: conversationResponses.storageFailure,
    session,
    handoff,
    nextAction: "awaiting_user",
  };
}

function completionDependencyFailure(
  session: ConversationSession,
): CompleteConversationResult {
  return {
    outcome: "failed",
    code: "dependency_failure",
    response: conversationResponses.dependencyFailure,
    session,
  };
}

function completionStorageFailure(
  session: ConversationSession | null,
): CompleteConversationResult {
  return {
    outcome: "failed",
    code: "storage_failure",
    response: conversationResponses.storageFailure,
    session,
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
