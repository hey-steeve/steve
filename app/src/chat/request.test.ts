import { expect, it } from "vitest";
import { triageDecisionCases } from "./triage-decision-cases.js";
import {
  chatHttpResult,
  chatRequestLimits,
  clampAssistantContent,
  parseChatMessages,
  parseChatReply,
  toProviderMessages,
} from "./request.js";

const echo =
  "[Simulated reply] You asked: De garde. I don't diagnose. In an emergency, call 15.";

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

it("keeps call order for every triage decision", () => {
  for (const item of triageDecisionCases) {
    if (item.calls === undefined) {
      const parsed = parseChatReply({
        reply: "Bonjour",
        mocked: false,
        model: "openai/gpt-6.1-terra",
      });
      expect(parsed, item.name).toEqual({
        kind: "ok",
        reply: "Bonjour",
        mocked: false,
        model: "openai/gpt-6.1-terra",
      });
      continue;
    }
    expect(
      parseChatReply({
        reply: "Bonjour",
        mocked: false,
        model: "openai/gpt-6.1-terra",
        calls: item.calls,
      }),
      item.name,
    ).toEqual({
      kind: "ok",
      reply: "Bonjour",
      mocked: false,
      model: "openai/gpt-6.1-terra",
      calls: item.calls,
    });
  }
});

it("keeps emergency calls on a chat reply", () => {
  expect(
    parseChatReply({
      reply: "Bonjour",
      mocked: false,
      model: "openai/gpt-6.1-terra",
      calls: [
        { type: "call", number: "3114" },
        { type: "call", number: "15" },
      ],
    }),
  ).toEqual({
    kind: "ok",
    reply: "Bonjour",
    mocked: false,
    model: "openai/gpt-6.1-terra",
    calls: [
      { type: "call", number: "3114" },
      { type: "call", number: "15" },
    ],
  });
  expect(
    parseChatReply({
      reply: "Bonjour",
      mocked: false,
      model: "openai/gpt-6.1-terra",
      calls: [{ type: "call", number: "15" }],
    }),
  ).toEqual({
    kind: "ok",
    reply: "Bonjour",
    mocked: false,
    model: "openai/gpt-6.1-terra",
    calls: [{ type: "call", number: "15" }],
  });
  expect(
    parseChatReply({
      reply: "Bonjour",
      mocked: false,
      model: "openai/gpt-6.1-terra",
      calls: [{ type: "call", number: "112" }],
    }),
  ).toEqual({
    kind: "ok",
    reply: "Bonjour",
    mocked: false,
    model: "openai/gpt-6.1-terra",
  });
  expect(
    parseChatReply({
      reply: "Bonjour",
      mocked: false,
      model: "openai/gpt-6.1-terra",
      calls: [
        { type: "call", number: "15" },
        { type: "call", number: "15" },
      ],
    }),
  ).toEqual({
    kind: "ok",
    reply: "Bonjour",
    mocked: false,
    model: "openai/gpt-6.1-terra",
  });
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
  ).toEqual({ status: 400, body: { error: "Invalid request." } });
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
      body: { error: "Invalid request." },
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
  ).toEqual({ status: 400, body: { error: "Invalid request." } });
  expect(
    chatHttpResult({ messages: [{ role: "user", content: ` ${atCap} ` }] }).status,
  ).toBe(200);
});

function historyRole(index: number): "user" | "agent" {
  if (index % 2 === 0) {
    return "user";
  }
  return "agent";
}

it("keeps the newest turns when the history is over the message cap", () => {
  const older = Array.from({ length: chatRequestLimits.maxMessages }, (_, index) => ({
    role: historyRole(index),
    content: `old-${index}`,
  }));
  const sent = toProviderMessages([
    ...older,
    { role: "error", content: "The chat service is unavailable. Try again." },
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
      { role: "error", content: "The chat service is unavailable. Try again." },
      { role: "user", content: "second" },
    ]),
  ).toEqual([{ role: "user", content: "second" }]);
});

it("preserves consecutive voice turns when continuing a mixed thread in text", () => {
  const messages = toProviderMessages([
    { role: "user", content: "Bonjour.", voice: true },
    { role: "user", content: "Je cherche le numéro du cabinet.", voice: true },
    { role: "agent", content: "Quel cabinet ?", voice: true },
    { role: "agent", content: "Dans quelle ville ?", voice: true },
    { role: "user", content: "À Lyon.", voice: true },
    { role: "user", content: "Près de la gare." },
  ]);
  expect(messages).toEqual([
    { role: "user", content: "Bonjour.", voice: true },
    { role: "user", content: "Je cherche le numéro du cabinet.", voice: true },
    { role: "assistant", content: "Quel cabinet ?", voice: true },
    { role: "assistant", content: "Dans quelle ville ?", voice: true },
    { role: "user", content: "À Lyon.", voice: true },
    { role: "user", content: "Près de la gare." },
  ]);
  expect(parseChatMessages({ messages })).toEqual([
    { role: "user", content: "Bonjour." },
    { role: "user", content: "Je cherche le numéro du cabinet." },
    { role: "assistant", content: "Quel cabinet ?" },
    { role: "assistant", content: "Dans quelle ville ?" },
    { role: "user", content: "À Lyon." },
    { role: "user", content: "Près de la gare." },
  ]);
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
  expect(reply.startsWith("[Simulated reply] You asked: ")).toBe(true);
  expect(
    reply.endsWith("I don't diagnose. In an emergency, call 15."),
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
  expect(cut).toBe(head);
  expect(cut.length).toBeLessThanOrEqual(chatRequestLimits.maxMessageChars);

  const lead = "[Simulated reply] You asked: ";
  const tail = ". I don't diagnose. In an emergency, call 15.";
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
  expect(echoed).toBe(asked.slice(0, room - 1));
  expect(reply.length).toBeLessThanOrEqual(chatRequestLimits.maxMessageChars);
});

it("trims a mock echo that is cut after a space", () => {
  const lead = "[Simulated reply] You asked: ";
  const tail = ". I don't diagnose. In an emergency, call 15.";
  const room = chatRequestLimits.maxMessageChars - lead.length - tail.length;
  const asked = `${"x".repeat(room - 4)}mot ${"y".repeat(8)}`;
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
  expect(reply).toContain("mot. I don't diagnose.");
  expect(reply).not.toContain("mot . I don't");
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
      { role: "error", content: "The chat service is unavailable. Try again." },
      { role: "agent", content: "Une pharmacie." },
    ]),
  ).toEqual([
    { role: "user", content: "De garde" },
    { role: "assistant", content: "Une pharmacie." },
  ]);
});
