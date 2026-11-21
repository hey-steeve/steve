import { expect, it } from "vitest";
import {
  chatHttpResult,
  chatRequestLimits,
  parseChatReply,
  toProviderMessages,
} from "./request.js";

const echo =
  "[Réponse simulée] Vous avez demandé : De garde. Je ne pose pas de diagnostic. En cas d'urgence, appelez le 15.";

it("returns a simulated echo of the last user turn when building the mock reply", () => {
  expect(
    chatHttpResult({
      messages: [
        { role: "user", content: "  Premier  " },
        { role: "assistant", content: "Suite" },
        { role: "user", content: "De garde" },
      ],
    }),
  ).toEqual({
    status: 200,
    body: { reply: echo, mocked: true, model: "mock" },
  });
});

it("rejects a body that is not a chat request", () => {
  const bodies: readonly unknown[] = [
    null,
    [],
    {},
    { messages: [] },
    { messages: [{ role: "user", content: "   " }] },
    { messages: [{ role: "system", content: "x" }] },
    { messages: [{ role: "assistant", content: "seul" }] },
    { messages: [{ role: "user", content: 12 }] },
  ];
  expect(bodies.map((body) => chatHttpResult(body).status)).toEqual([
    400, 400, 400, 400, 400, 400, 400, 400,
  ]);
});

it("reads a chat reply and rejects any other shape", () => {
  expect(parseChatReply({ reply: "Bonjour", mocked: true, model: "mock" })).toEqual({
    kind: "ok",
    reply: "Bonjour",
    mocked: true,
    model: "mock",
  });
  expect(
    parseChatReply({
      reply: "Bonjour",
      mocked: false,
      model: "openrouter/auto",
    }),
  ).toEqual({
    kind: "ok",
    reply: "Bonjour",
    mocked: false,
    model: "openrouter/auto",
  });
  expect(parseChatReply({ reply: "Bonjour", mocked: true }).kind).toBe("invalid");
  expect(parseChatReply({ reply: "", mocked: true, model: "mock" }).kind).toBe(
    "invalid",
  );
  expect(parseChatReply({ reply: "Bonjour", mocked: false, model: "" }).kind).toBe(
    "invalid",
  );
  expect(parseChatReply({ error: "non" }).kind).toBe("invalid");
});

it("rejects a history longer than the message cap", () => {
  const atCap = Array.from({ length: chatRequestLimits.maxMessages }, () => ({
    role: "user" as const,
    content: "De garde",
  }));
  expect(chatHttpResult({ messages: atCap }).status).toBe(200);
  expect(
    chatHttpResult({
      messages: [...atCap, { role: "user", content: "encore" }],
    }),
  ).toEqual({ status: 400, body: { error: "Requête invalide." } });
});

it("rejects a message longer than the content cap", () => {
  const atCap = "a".repeat(chatRequestLimits.maxMessageChars);
  expect(
    chatHttpResult({ messages: [{ role: "user", content: atCap }] }).status,
  ).toBe(200);
  expect(
    chatHttpResult({
      messages: [{ role: "user", content: `${atCap}b` }],
    }),
  ).toEqual({ status: 400, body: { error: "Requête invalide." } });
  expect(
    chatHttpResult({ messages: [{ role: "user", content: ` ${atCap} ` }] }).status,
  ).toBe(200);
});

it("keeps the newest turns when the history is over the message cap", () => {
  const older = Array.from({ length: chatRequestLimits.maxMessages }, (_, index) => ({
    role: "user" as const,
    content: `old-${index}`,
  }));
  const sent = toProviderMessages([
    ...older,
    { role: "error", content: "Le service de chat est indisponible. Réessayez." },
    { role: "user", content: "newest" },
  ]);
  expect(sent).toHaveLength(chatRequestLimits.maxMessages);
  expect(sent[0]).toEqual({ role: "user", content: "old-1" });
  expect(sent[sent.length - 1]).toEqual({ role: "user", content: "newest" });
});

it("omits error cards from the provider history", () => {
  expect(
    toProviderMessages([
      { role: "user", content: "De garde" },
      { role: "error", content: "Le service de chat est indisponible. Réessayez." },
      { role: "agent", content: "Une pharmacie." },
    ]),
  ).toEqual([
    { role: "user", content: "De garde" },
    { role: "assistant", content: "Une pharmacie." },
  ]);
});
