import { afterEach, expect, it, vi } from "vitest";
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
});

it("returns the labelled mock unless STEVE_CHAT_LIVE is 1", async () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);

  vi.stubEnv("OPENROUTER_API_KEY", canary);
  vi.stubEnv("STEVE_CHAT_LIVE", "");
  const liveOff = await post(history);
  expect(liveOff.status).toBe(200);
  expect(await liveOff.json()).toEqual({
    reply: echo,
    mocked: true,
    model: "mock",
  });

  vi.stubEnv("OPENROUTER_API_KEY", "");
  vi.stubEnv("STEVE_CHAT_LIVE", "1");
  const emptyKey = await post(history);
  expect(emptyKey.status).toBe(200);
  expect(await emptyKey.json()).toEqual({
    reply: echo,
    mocked: true,
    model: "mock",
  });

  delete process.env["OPENROUTER_API_KEY"];
  const missingKey = await post(history);
  expect(missingKey.status).toBe(200);
  expect(await missingKey.json()).toEqual({
    reply: echo,
    mocked: true,
    model: "mock",
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("calls OpenRouter when STEVE_CHAT_LIVE is 1 and the key is set", async () => {
  vi.stubEnv("STEVE_CHAT_LIVE", "1");
  vi.stubEnv("OPENROUTER_API_KEY", canary);
  vi.stubEnv("OPENROUTER_MODEL", "  google/gemini-flash  ");
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json({
      model: "google/gemini-flash-001",
      choices: [{ message: { content: "Une pharmacie de garde." } }],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const response = await post(history);
  const text = await response.text();
  expect(response.status).toBe(200);
  expect(text).not.toContain(canary);
  expect(JSON.parse(text)).toEqual({
    reply: "Une pharmacie de garde.",
    mocked: false,
    model: "google/gemini-flash-001",
  });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const call = fetchMock.mock.calls[0];
  expect(call).toBeDefined();
  if (call === undefined) {
    return;
  }
  expect(call[0]).toBe("https://openrouter.ai/api/v1/chat/completions");
  const init = call[1];
  expect(init?.method).toBe("POST");
  const headers = new Headers(init?.headers);
  expect(headers.get("authorization")).toBe(`Bearer ${canary}`);
  expect(headers.get("content-type")).toBe("application/json");
  expect(headers.get("x-title")).toBe("Steve");
  expect(JSON.parse(String(init?.body))).toEqual({
    model: "google/gemini-flash",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: "De garde" },
    ],
  });
});

it("defaults the model to openrouter/auto and falls back when OpenRouter omits model", async () => {
  vi.stubEnv("STEVE_CHAT_LIVE", "1");
  vi.stubEnv("OPENROUTER_API_KEY", canary);
  vi.stubEnv("OPENROUTER_MODEL", "   ");
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json({
      choices: [{ message: { content: "D'accord." } }],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const blankModel = await post(history);
  const blankText = await blankModel.text();
  expect(blankText).not.toContain(canary);
  expect(JSON.parse(blankText)).toEqual({
    reply: "D'accord.",
    mocked: false,
    model: "openrouter/auto",
  });

  delete process.env["OPENROUTER_MODEL"];
  const missingModel = await post(history);
  const missingText = await missingModel.text();
  expect(missingText).not.toContain(canary);
  expect(JSON.parse(missingText)).toEqual({
    reply: "D'accord.",
    mocked: false,
    model: "openrouter/auto",
  });
  expect(fetchMock.mock.calls).toHaveLength(2);
  for (const call of fetchMock.mock.calls) {
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({
      model: "openrouter/auto",
    });
  }
});

it("returns 502 and drops the upstream body when OpenRouter fails", async () => {
  const replies = [
    () => new Response(`upstream ${canary} secret-fragment`, { status: 503 }),
    () => {
      throw new Error(`network down ${canary}`);
    },
    () => new Response(`{${canary}`, { status: 200 }),
    () => Response.json({ error: canary, choices: [] }),
  ];
  for (const reply of replies) {
    vi.stubEnv("STEVE_CHAT_LIVE", "1");
    vi.stubEnv("OPENROUTER_API_KEY", canary);
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => reply()));
    const response = await post(history);
    const text = await response.text();
    expect(response.status).toBe(502);
    expect(text).not.toContain(canary);
    expect(text).not.toContain("secret-fragment");
    expect(JSON.parse(text)).toEqual({ error: upstreamError });
  }
});

it("rejects a body that is not JSON", async () => {
  vi.stubEnv("OPENROUTER_API_KEY", "");
  const response = await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "JSON invalide." });
});

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
