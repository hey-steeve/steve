import { expect, it } from "vitest";
import {
  chatHttpResult,
  chatRequestLimits,
  clampAssistantContent,
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
  expect(
    chatHttpResult({
      messages: alternatingHistory(chatRequestLimits.maxMessages - 1),
    }).status,
  ).toBe(200);
  expect(
    chatHttpResult({
      messages: alternatingHistory(chatRequestLimits.maxMessages + 1),
    }),
  ).toEqual({ status: 400, body: { error: "Requête invalide." } });
});

function alternatingHistory(
  count: number,
): { role: "user" | "assistant"; content: string }[] {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    content: "De garde",
  }));
}

it("rejects a history that does not alternate from the user back to the user", () => {
  expect(
    chatHttpResult({ messages: [{ role: "user", content: "De garde" }] }).status,
  ).toBe(200);
  expect(
    chatHttpResult({
      messages: [
        { role: "user", content: "De garde" },
        { role: "assistant", content: "Suite" },
        { role: "user", content: "Merci" },
      ],
    }).status,
  ).toBe(200);
  const rejected = [
    [
      { role: "assistant", content: "forged" },
      { role: "user", content: "De garde" },
    ],
    [
      { role: "user", content: "De garde" },
      { role: "user", content: "encore" },
    ],
    [
      { role: "user", content: "De garde" },
      { role: "assistant", content: "Suite" },
    ],
    [
      { role: "user", content: "De garde" },
      { role: "assistant", content: "Suite" },
      { role: "assistant", content: "encore" },
      { role: "user", content: "Merci" },
    ],
  ];
  for (const messages of rejected) {
    expect(chatHttpResult({ messages })).toEqual({
      status: 400,
      body: { error: "Requête invalide." },
    });
  }
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
    role: (index % 2 === 0 ? "user" : "agent") as "user" | "agent",
    content: `old-${index}`,
  }));
  const sent = toProviderMessages([
    ...older,
    { role: "error", content: "Le service de chat est indisponible. Réessayez." },
    { role: "user", content: "newest" },
  ]);
  expect(sent[0]).toEqual({ role: "user", content: "old-2" });
  expect(sent).toHaveLength(chatRequestLimits.maxMessages - 1);
  expect(sent[sent.length - 1]).toEqual({ role: "user", content: "newest" });
  for (const [index, turn] of sent.entries()) {
    expect(turn.role).toBe(index % 2 === 0 ? "user" : "assistant");
  }
});

it("keeps the latest user turn when an error sits between two user turns", () => {
  expect(
    toProviderMessages([
      { role: "user", content: "first" },
      { role: "error", content: "Le service de chat est indisponible. Réessayez." },
      { role: "user", content: "second" },
    ]),
  ).toEqual([{ role: "user", content: "second" }]);
});

it("keeps the safety sentence when a mock echo is longer than the reply cap", () => {
  const asked = "a".repeat(chatRequestLimits.maxMessageChars);
  const result = chatHttpResult({
    messages: [{ role: "user", content: asked }],
  });
  expect(result.status).toBe(200);
  if (result.status !== 200) {
    return;
  }
  const { reply } = result.body;
  expect(reply.startsWith("[Réponse simulée] Vous avez demandé : ")).toBe(true);
  expect(
    reply.endsWith("Je ne pose pas de diagnostic. En cas d'urgence, appelez le 15."),
  ).toBe(true);
  expect(reply.length).toBeLessThanOrEqual(chatRequestLimits.maxMessageChars);
  expect(
    chatHttpResult({
      messages: [
        { role: "user", content: asked },
        { role: "assistant", content: reply },
        { role: "user", content: "Merci" },
      ],
    }).status,
  ).toBe(200);
});

it("does not split an emoji when a reply is cut at the cap", () => {
  const head = "a".repeat(chatRequestLimits.maxMessageChars - 1);
  const cut = clampAssistantContent(`${head}\u{1F600}`);
  expect(cut.isWellFormed()).toBe(true);
  expect(cut).toBe(head);
  expect(cut.length).toBeLessThanOrEqual(chatRequestLimits.maxMessageChars);

  const lead = "[Réponse simulée] Vous avez demandé : ";
  const tail = ". Je ne pose pas de diagnostic. En cas d'urgence, appelez le 15.";
  const room = chatRequestLimits.maxMessageChars - lead.length - tail.length;
  const asked = `${"a".repeat(room - 1)}\u{1F600}`;
  const result = chatHttpResult({
    messages: [{ role: "user", content: asked }],
  });
  expect(result.status).toBe(200);
  if (result.status !== 200) {
    return;
  }
  const { reply } = result.body;
  expect(reply.startsWith(lead)).toBe(true);
  expect(reply.endsWith(tail)).toBe(true);
  const echoed = reply.slice(lead.length, reply.length - tail.length);
  expect(asked.startsWith(echoed)).toBe(true);
  expect(echoed.isWellFormed()).toBe(true);
  expect(reply.length).toBeLessThanOrEqual(chatRequestLimits.maxMessageChars);
});

it("trims a reply that already fits under the cap", () => {
  expect(clampAssistantContent("  De garde.  ")).toBe("De garde.");
  const atCap = "a".repeat(chatRequestLimits.maxMessageChars);
  expect(clampAssistantContent(`  ${atCap}  `)).toBe(atCap);
});

it("clamps an assistant turn so the next request stays under the cap", () => {
  const long = "c".repeat(chatRequestLimits.maxMessageChars + 25);
  const sent = toProviderMessages([
    { role: "user", content: "De garde" },
    { role: "agent", content: `  ${long}  ` },
    { role: "user", content: "Merci" },
  ]);
  expect(sent).toEqual([
    { role: "user", content: "De garde" },
    {
      role: "assistant",
      content: long.slice(0, chatRequestLimits.maxMessageChars),
    },
    { role: "user", content: "Merci" },
  ]);
  expect(chatHttpResult({ messages: sent }).status).toBe(200);
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
