import { expect, it, vi } from "vitest";
import {
  conversationLimits,
  createConversation,
  createInMemoryConversationStore,
  type ConversationStore,
  type RequestUnderstandingProvider,
} from "./index.js";

function testDependencies(
  answers: readonly unknown[],
  store: ConversationStore = createInMemoryConversationStore(),
) {
  let session = 0;
  let assistant = 0;
  let tick = 0;
  const pending = [...answers];
  const understand = vi.fn<RequestUnderstandingProvider["understand"]>(async () => {
    const answer = pending.shift();
    if (answer instanceof Error) {
      throw answer;
    }
    return answer;
  });
  return {
    dependencies: {
      store,
      understanding: { understand },
      ids: {
        sessionId() {
          session += 1;
          return `session-${session}`;
        },
        assistantTurnId() {
          assistant += 1;
          return `assistant-${assistant}`;
        },
      },
      clock: {
        now() {
          tick += 1;
          return `2026-11-23T14:00:${String(tick).padStart(2, "0")}.000Z`;
        },
      },
    },
    understand,
  };
}

async function startedConversation(answers: readonly unknown[]) {
  const fixture = testDependencies(answers);
  const conversation = createConversation(fixture.dependencies);
  const started = await conversation.startSession({ channel: "text" });
  if (started.outcome !== "started") {
    throw new Error("Conversation did not start");
  }
  return { ...fixture, conversation, started };
}

it("creates a stable session with a French greeting", async () => {
  const { conversation, dependencies } = await startedConversation([]);
  const stored = await dependencies.store.get("session-1");

  expect(stored).toEqual({
    id: "session-1",
    status: "active",
    version: 0,
    createdAt: "2026-11-23T14:00:01.000Z",
    updatedAt: "2026-11-23T14:00:01.000Z",
    turns: [
      {
        id: "assistant-1",
        role: "assistant",
        channel: "text",
        text: "Bonjour, comment puis-je t'aider dans tes démarches de santé ?",
        createdAt: "2026-11-23T14:00:01.000Z",
      },
    ],
  });

  const second = await conversation.startSession({ channel: "voice" });
  expect(second.outcome).toBe("started");
  if (second.outcome === "started") {
    expect(second.session.id).toBe("session-2");
    expect(second.response.channel).toBe("voice");
  }
});

it("understands a care request and produces a non-medical triage handoff", async () => {
  const { conversation } = await startedConversation([
    { intent: "care_request", summary: "Recherche d'un rendez-vous généraliste" },
  ]);
  const result = await conversation.handleTurn({
    sessionId: "session-1",
    turnId: "text-turn-1",
    channel: "text",
    text: "  Je cherche un généraliste  ",
  });

  expect(result.outcome).toBe("handled");
  if (result.outcome !== "handled") {
    return;
  }
  expect(result.nextAction).toBe("handoff");
  expect(result.handoff).toEqual({
    target: "triage",
    sessionId: "session-1",
    turnId: "text-turn-1",
    channel: "text",
    intent: "care_request",
    summary: "Recherche d'un rendez-vous généraliste",
    sourceText: "Je cherche un généraliste",
  });
  expect(result.session.version).toBe(1);
  expect(result.session.turns.map((turn) => turn.id)).toEqual([
    "assistant-1",
    "text-turn-1",
    "assistant-2",
  ]);
  expect(result.response.text).toContain("orientation adaptée");
  expect(result.response.text).not.toMatch(/diagnostic|prescri/i);
});

it("uses the same core for a voice document request and a general question", async () => {
  const { conversation, understand } = await startedConversation([
    { intent: "document_request", summary: "Classement d'un document" },
    { intent: "general_question", summary: "Question sur la prochaine étape" },
  ]);
  const voice = await conversation.handleTurn({
    sessionId: "session-1",
    turnId: "voice-turn-1",
    channel: "voice",
    text: "Je veux ajouter un document",
  });
  const text = await conversation.handleTurn({
    sessionId: "session-1",
    turnId: "text-turn-2",
    channel: "text",
    text: "Quelle est la prochaine étape ?",
  });

  expect(voice.outcome).toBe("handled");
  expect(text.outcome).toBe("handled");
  if (voice.outcome === "handled" && text.outcome === "handled") {
    expect(voice.handoff?.target).toBe("triage");
    expect(voice.handoff?.channel).toBe("voice");
    expect(text.handoff?.target).toBe("triage");
    expect(text.session.turns).toHaveLength(5);
  }
  expect(understand).toHaveBeenCalledTimes(2);
  const secondInput = understand.mock.calls[1]?.[0];
  expect(secondInput?.history.map((turn) => turn.id)).toEqual([
    "assistant-1",
    "voice-turn-1",
    "assistant-2",
  ]);
});

it("asks for clarification on unsupported input and can continue the session", async () => {
  const { conversation } = await startedConversation([
    { intent: "unsupported", summary: "Demande trop vague" },
    { intent: "care_request", summary: "Demande de rendez-vous précisée" },
  ]);
  const unclear = await conversation.handleTurn({
    sessionId: "session-1",
    turnId: "turn-1",
    channel: "text",
    text: "Je ne sais pas",
  });
  const continued = await conversation.handleTurn({
    sessionId: "session-1",
    turnId: "turn-2",
    channel: "text",
    text: "Je veux prendre un rendez-vous",
  });

  expect(unclear).toMatchObject({
    outcome: "handled",
    handoff: null,
    nextAction: "awaiting_user",
  });
  expect(continued).toMatchObject({
    outcome: "handled",
    nextAction: "handoff",
    handoff: { target: "triage", turnId: "turn-2" },
  });
});

it("completes a conversation explicitly and rejects later turns", async () => {
  const { conversation, understand } = await startedConversation([
    { intent: "end_conversation", summary: "Fin demandée" },
  ]);
  const ended = await conversation.handleTurn({
    sessionId: "session-1",
    turnId: "turn-goodbye",
    channel: "text",
    text: "Merci, au revoir",
  });
  const later = await conversation.handleTurn({
    sessionId: "session-1",
    turnId: "turn-later",
    channel: "text",
    text: "Encore une demande",
  });

  expect(ended).toMatchObject({
    outcome: "handled",
    handoff: null,
    nextAction: "completed",
    session: { status: "completed" },
  });
  expect(later).toMatchObject({
    outcome: "rejected",
    code: "session_completed",
    nextAction: "completed",
  });
  expect(understand).toHaveBeenCalledTimes(1);
});

it("rejects malformed, empty and oversized input without calling the provider", async () => {
  const { conversation, understand } = await startedConversation([]);
  const cases = [
    {
      input: {
        sessionId: "session-1",
        turnId: "turn-channel",
        channel: "fax" as "text",
        text: "Bonjour",
      },
      code: "invalid_channel",
    },
    {
      input: {
        sessionId: " ",
        turnId: "turn-1",
        channel: "text" as const,
        text: "Bonjour",
      },
      code: "invalid_session_id",
    },
    {
      input: {
        sessionId: "session-1",
        turnId: "bad turn",
        channel: "text" as const,
        text: "Bonjour",
      },
      code: "invalid_turn_id",
    },
    {
      input: {
        sessionId: "session-1",
        turnId: "turn-2",
        channel: "text" as const,
        text: "   ",
      },
      code: "invalid_text",
    },
    {
      input: {
        sessionId: "session-1",
        turnId: "turn-3",
        channel: "text" as const,
        text: "a".repeat(conversationLimits.maxTextChars + 1),
      },
      code: "text_too_long",
    },
  ];
  for (const item of cases) {
    const result = await conversation.handleTurn(item.input);
    expect(result.outcome).toBe("rejected");
    if (result.outcome !== "rejected") {
      throw new Error("Malformed input was not rejected");
    }
    expect(result).toMatchObject({ code: item.code });
    expect(result.response.length).toBeGreaterThan(0);
  }
  expect(understand).not.toHaveBeenCalled();
});

it("rejects an unsupported channel before creating a session", async () => {
  const fixture = testDependencies([]);
  const conversation = createConversation(fixture.dependencies);
  const result = await conversation.startSession({ channel: "fax" as "text" });

  expect(result).toMatchObject({
    outcome: "rejected",
    code: "invalid_channel",
    nextAction: "completed",
  });
  expect(await fixture.dependencies.store.get("session-1")).toBeNull();
});

it("rejects missing and duplicate sessions or turns explicitly", async () => {
  const { conversation, understand } = await startedConversation([
    { intent: "unsupported", summary: "Demande vague" },
  ]);
  const missing = await conversation.handleTurn({
    sessionId: "session-missing",
    turnId: "turn-1",
    channel: "text",
    text: "Bonjour",
  });
  await conversation.handleTurn({
    sessionId: "session-1",
    turnId: "turn-1",
    channel: "text",
    text: "Bonjour",
  });
  const duplicate = await conversation.handleTurn({
    sessionId: "session-1",
    turnId: "turn-1",
    channel: "text",
    text: "Bonjour encore",
  });

  expect(missing).toMatchObject({
    outcome: "rejected",
    code: "session_not_found",
  });
  expect(duplicate).toMatchObject({
    outcome: "rejected",
    code: "duplicate_turn",
  });
  expect(understand).toHaveBeenCalledTimes(1);
});

it("persists an informative safe reply when understanding fails", async () => {
  for (const answer of [new Error("provider unavailable"), { unexpected: true }]) {
    const { conversation, dependencies } = await startedConversation([answer]);
    const result = await conversation.handleTurn({
      sessionId: "session-1",
      turnId: "turn-failed",
      channel: "text",
      text: "J'ai besoin d'aide",
    });

    expect(result).toMatchObject({
      outcome: "failed",
      code: "understanding_failure",
      nextAction: "awaiting_user",
    });
    expect(result.response).toContain("réessayer");
    expect(result.response).not.toMatch(/112|SOS Médecins/i);
    const stored = await dependencies.store.get("session-1");
    expect(stored?.version).toBe(1);
    expect(stored?.turns.map((turn) => turn.id)).toEqual([
      "assistant-1",
      "turn-failed",
      "assistant-2",
    ]);
  }
});

it("keeps only the bounded relevant history", async () => {
  const answers = Array.from(
    { length: 25 },
    (_, index) => ({ intent: "unsupported", summary: `Demande ${index}` }),
  );
  const { conversation } = await startedConversation(answers);
  let lastResult = await conversation.handleTurn({
    sessionId: "session-1",
    turnId: "turn-0",
    channel: "text",
    text: "Demande 0",
  });
  for (let index = 1; index < answers.length; index += 1) {
    lastResult = await conversation.handleTurn({
      sessionId: "session-1",
      turnId: `turn-${index}`,
      channel: "text",
      text: `Demande ${index}`,
    });
  }

  expect(lastResult.outcome).toBe("handled");
  if (lastResult.outcome === "handled") {
    expect(lastResult.session.turns).toHaveLength(
      conversationLimits.maxHistoryTurns,
    );
    expect(lastResult.session.turns.at(-2)?.id).toBe("turn-24");
    expect(lastResult.session.turns.at(-1)?.role).toBe("assistant");
  }
});

it("returns safe failures when creation or persistence dependencies fail", async () => {
  const failingStore: ConversationStore = {
    async get() {
      throw new Error("store unavailable");
    },
    async save() {
      throw new Error("store unavailable");
    },
  };
  const fixture = testDependencies([], failingStore);
  const conversation = createConversation(fixture.dependencies);
  const start = await conversation.startSession({ channel: "text" });
  const turn = await conversation.handleTurn({
    sessionId: "session-1",
    turnId: "turn-1",
    channel: "text",
    text: "Bonjour",
  });

  expect(start).toMatchObject({
    outcome: "failed",
    code: "storage_failure",
    nextAction: "completed",
  });
  expect(turn).toMatchObject({
    outcome: "failed",
    code: "storage_failure",
    nextAction: "awaiting_user",
  });
  expect(start.response).not.toBe("");
  expect(turn.response).not.toBe("");
});

it("does not expose an unpersisted result when an update conflicts", async () => {
  const inner = createInMemoryConversationStore();
  const conflictingStore: ConversationStore = {
    get(sessionId) {
      return inner.get(sessionId);
    },
    save(session, expectedVersion) {
      if (expectedVersion !== null) {
        throw new Error("concurrent update");
      }
      return inner.save(session, expectedVersion);
    },
  };
  const fixture = testDependencies(
    [{ intent: "care_request", summary: "Demande de rendez-vous" }],
    conflictingStore,
  );
  const conversation = createConversation(fixture.dependencies);
  await conversation.startSession({ channel: "text" });
  const result = await conversation.handleTurn({
    sessionId: "session-1",
    turnId: "turn-1",
    channel: "text",
    text: "Je veux un rendez-vous",
  });

  expect(result).toMatchObject({
    outcome: "failed",
    code: "storage_failure",
    nextAction: "awaiting_user",
  });
  expect((await inner.get("session-1"))?.version).toBe(0);
});
