import { expect, it } from "vitest";
import {
  chatHttpResult,
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
