import { afterEach, expect, it, vi } from "vitest";
import { chatRequestLimits } from "../../../chat/request.js";
import { POST } from "./route.js";

const canary = "test-openrouter-key-canary";
const systemPrompt =
  "Tu es Steve, un assistant qui aide à organiser des démarches de santé. Tu n'es pas médecin, tu ne poses pas de diagnostic, et en cas d'urgence tu dis d'appeler le 15. Réponds brièvement en français.";
const echo =
  "[Réponse simulée] Vous avez demandé : De garde. Je ne pose pas de diagnostic. En cas d'urgence, appelez le 15.";
const upstreamError = "Le service de chat est indisponible. Réessayez.";
const history = {
  messages: [{ role: "user", content: "De garde" }],
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("asks OpenRouter for low-effort reasoning and excludes it from the reply", async () => {
  vi.stubEnv("STEVE_CHAT_LIVE", "1");
  vi.stubEnv("OPENROUTER_API_KEY", canary);
  delete process.env["OPENROUTER_MODEL"];
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json({
      model: "google/gemini-3.8-flash",
      choices: [
        {
          finish_reason: "stop",
          message: { content: "Une pharmacie de garde." },
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const response = await post(history);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    reply: "Une pharmacie de garde.",
    mocked: false,
    model: "google/gemini-3.8-flash",
  });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const init = fetchMock.mock.calls[0]?.[1];
  expect(JSON.parse(String(init?.body))).toEqual({
    model: "google/gemini-3.8-flash",
    max_tokens: 1024,
    reasoning: { effort: "low", exclude: true },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: "De garde" },
    ],
  });
});

it("trims a length-capped reply back to the last complete sentence", async () => {
  const cases = [
    {
      content:
        "Une pharmacie est ouverte ce soir. Vous pouvez y aller avec cette souff",
      reply: "Une pharmacie est ouverte ce soir.",
    },
    {
      content: "Appelez le 15 ! Le reste est cou",
      reply: "Appelez le 15 !",
    },
    {
      content: "C'est urgent ? La suite est cou",
      reply: "C'est urgent ?",
    },
    {
      content: "Il a répondu « oui. » mais la suite est cou",
      reply: "Il a répondu « oui. »",
    },
    {
      content:
        "Le rendez-vous est à 14. Appelez demain. Le reste est 2.5 souff",
      reply: "Le rendez-vous est à 14. Appelez demain.",
    },
    {
      content: "  Une pharmacie de garde.  ",
      reply: "Une pharmacie de garde.",
    },
    {
      content: `Début. ${"a".repeat(chatRequestLimits.maxMessageChars)} fin.`,
      reply: "Début.",
    },
  ];
  for (const item of cases) {
    const response = await liveReply({
      finish_reason: "length",
      content: item.content,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reply: item.reply,
      mocked: false,
      model: "google/gemini-3.8-flash",
    });
  }
});

it("returns the upstream error when a length-capped reply has no complete sentence", async () => {
  for (const content of [
    "avec cette souff",
    "Le reste est 2.5 souff",
    `${"a".repeat(chatRequestLimits.maxMessageChars)}.`,
  ]) {
    const response = await liveReply({ finish_reason: "length", content });
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(text).not.toContain(content);
    expect(text).not.toContain(canary);
    expect(JSON.parse(text)).toEqual({ error: upstreamError });
  }
});

it("returns a stop reply unchanged, including a trailing fragment", async () => {
  const content =
    "Une pharmacie est ouverte ce soir. Vous pouvez y aller avec cette souff";
  const response = await liveReply({ finish_reason: "stop", content });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    reply: content,
    mocked: false,
    model: "google/gemini-3.8-flash",
  });
});

it("keeps the mock and does not call fetch when live chat is off", async () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("OPENROUTER_API_KEY", canary);
  vi.stubEnv("STEVE_CHAT_LIVE", "");

  const response = await post(history);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    reply: echo,
    mocked: true,
    model: "mock",
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

function liveReply(choice: {
  readonly finish_reason: string;
  readonly content: string;
}): Promise<Response> {
  vi.stubEnv("STEVE_CHAT_LIVE", "1");
  vi.stubEnv("OPENROUTER_API_KEY", canary);
  delete process.env["OPENROUTER_MODEL"];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({
        model: "google/gemini-3.8-flash",
        choices: [
          {
            finish_reason: choice.finish_reason,
            message: { content: choice.content },
          },
        ],
      }),
    ),
  );
  return post(history);
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
