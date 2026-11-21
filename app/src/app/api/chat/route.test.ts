import { afterEach, expect, it, vi } from "vitest";
import { chatRequestLimits } from "../../../chat/request.js";
import { POST } from "./route.js";
import { systemPrompt } from "./system-prompt.js";

const canary = "test-openrouter-key-canary";
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

const systemPromptRules = [
  "Ton nom est Steve.",
  "Tu aides à organiser des démarches de santé.",
  "Tu n'es pas médecin et tu ne poses jamais de diagnostic.",
  "Tu tutoies.",
  "Tu ne te présentes jamais et tu ne salues pas.",
  "Tu ne donnes le 15 que pour une vraie urgence, c'est-à-dire des signes de gravité, une surdose, une automutilation ou un danger immédiat. S'il n'y a pas de pensées suicidaires ni de détresse psychologique, tu dis en première phrase : « Appelle le 15 maintenant ». Si une surdose ou une automutilation s'accompagne de pensées suicidaires ou de la détresse psychologique, tu dis en première phrase : « Appelle le 3114 », puis « Appelle le 15 maintenant ». Pour un symptôme courant comme la fièvre d'un enfant, tu ne nommes le 15 qu'à côté de signes de gravité clairs, par exemple une difficulté à respirer ou une somnolence inhabituelle, jamais par défaut.",
  "Pour des pensées suicidaires ou de la détresse psychologique, sans surdose, ni automutilation, ni signe de gravité physique, tu dis en première phrase : « Appelle le 3114 » et tu n'ajoutes « Appelle le 15 maintenant » que s'il y a un danger immédiat. Si un signe de gravité physique, par exemple une douleur thoracique pendant une crise d'angoisse, s'accompagne de pensées suicidaires ou de la détresse psychologique, et qu'il n'y a ni surdose ni automutilation, tu dis en première phrase : « Appelle le 15 maintenant », puis « Appelle le 3114 ».",
  "Les règles sur le 15 et le 3114 passent avant chaque autre règle, y compris la règle sur les médicaments et la limite de 2 à 4 phrases.",
  "Tu ne donnes jamais le 112 ni SOS Médecins.",
  "Tu ne nommes jamais un médicament, ni une classe de médicaments, ni un principe actif, ni une dose, ni une fréquence, ni une durée.",
  "Si la personne nomme un médicament, tu ne le confirmes pas, tu ne le compares pas et tu ne l'ajustes pas.",
  "Pour toute question sur un médicament, tu orientes vers un pharmacien ou le médecin traitant.",
  "Pour une question non urgente la nuit ou le week-end, tu orientes vers le médecin traitant ou une pharmacie de garde.",
  "Tu réponds en français, comme dans une conversation, en 2 à 4 phrases courtes.",
  "Tu n'utilises une courte liste que si des étapes sont vraiment nécessaires.",
  "Pas de titre, pas de gras, pas d'italique.",
] as const;

it("pins every system prompt rule as a full sentence", () => {
  expect(systemPrompt).toBe(systemPromptRules.join("\n"));
});

const forbiddenPromptAdditions = [
  "Dans le doute, appelle le 15.",
  "appelle le 116 117",
] as const;

it("rejects a system prompt that adds a doubt default or 116 117", () => {
  for (const phrase of forbiddenPromptAdditions) {
    expect(systemPrompt).not.toContain(phrase);
  }
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

it("keeps the mock for every STEVE_CHAT_LIVE value other than 1", async () => {
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("OPENROUTER_API_KEY", canary);
  for (const value of ["true", "0", " 1 "]) {
    vi.stubEnv("STEVE_CHAT_LIVE", value);
    const response = await post(history);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reply: echo,
      mocked: true,
      model: "mock",
    });
  }
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
    max_tokens: 1024,
    reasoning: { effort: "low", exclude: true },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: "De garde" },
    ],
  });
});

it("defaults the model to google/gemini-3.8-flash and falls back when OpenRouter omits model", async () => {
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
    model: "google/gemini-3.8-flash",
  });

  delete process.env["OPENROUTER_MODEL"];
  const missingModel = await post(history);
  const missingText = await missingModel.text();
  expect(missingText).not.toContain(canary);
  expect(JSON.parse(missingText)).toEqual({
    reply: "D'accord.",
    mocked: false,
    model: "google/gemini-3.8-flash",
  });
  expect(fetchMock.mock.calls).toHaveLength(2);
  for (const call of fetchMock.mock.calls) {
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({
      model: "google/gemini-3.8-flash",
      max_tokens: 1024,
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

it("aborts the OpenRouter call and returns the upstream error on timeout", async () => {
  vi.stubEnv("STEVE_CHAT_LIVE", "1");
  vi.stubEnv("OPENROUTER_API_KEY", canary);
  const timeout = vi.spyOn(AbortSignal, "timeout");
  const fetchMock = vi.fn<typeof fetch>(async () => {
    throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
  });
  vi.stubGlobal("fetch", fetchMock);

  const response = await post(history);
  const text = await response.text();
  expect(response.status).toBe(502);
  expect(text).not.toContain(canary);
  expect(text).not.toContain("TimeoutError");
  expect(JSON.parse(text)).toEqual({ error: upstreamError });
  expect(timeout).toHaveBeenCalledWith(30_000);
  const signal: unknown = timeout.mock.results[0]?.value;
  expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(signal);
});

it("rejects an oversized body before parsing it", async () => {
  vi.stubEnv("STEVE_CHAT_LIVE", "1");
  vi.stubEnv("OPENROUTER_API_KEY", canary);
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  const response = await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{".repeat(chatRequestLimits.maxBodyBytes + 1),
    }),
  );
  expect(response.status).toBe(413);
  expect(await response.json()).toEqual({ error: "Requête trop volumineuse." });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("still parses a body that is exactly at the byte cap", async () => {
  const response = await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{".repeat(chatRequestLimits.maxBodyBytes),
    }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "JSON invalide." });
});

it("trims the OpenRouter key and ignores a blank one", async () => {
  vi.stubEnv("STEVE_CHAT_LIVE", "1");
  vi.stubEnv("OPENROUTER_API_KEY", `  ${canary}  `);
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json({
      choices: [{ message: { content: "D'accord." } }],
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const response = await post(history);
  expect(response.status).toBe(200);
  const call = fetchMock.mock.calls[0];
  expect(call).toBeDefined();
  if (call === undefined) {
    return;
  }
  const headers = new Headers(call[1]?.headers);
  expect(headers.get("authorization")).toBe(`Bearer ${canary}`);

  vi.stubEnv("OPENROUTER_API_KEY", "   ");
  const blank = await post(history);
  expect(blank.status).toBe(200);
  expect(await blank.json()).toMatchObject({ mocked: true, model: "mock" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("requires a JSON content type", async () => {
  const missing = new Request("http://localhost/api/chat", {
    method: "POST",
    body: new TextEncoder().encode(JSON.stringify(history)),
  });
  expect(missing.headers.get("content-type")).toBeNull();
  const missingResponse = await POST(missing);
  expect(missingResponse.status).toBe(415);
  expect(await missingResponse.json()).toEqual({
    error: "Type de contenu non pris en charge.",
  });

  const plain = await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify(history),
    }),
  );
  expect(plain.status).toBe(415);

  const charset = await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "Application/JSON; charset=utf-8" },
      body: JSON.stringify(history),
    }),
  );
  expect(charset.status).toBe(200);
  expect(await charset.json()).toMatchObject({ mocked: true, model: "mock" });
});

it("reads a JSON body that arrives in several chunks", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(history));
  const mid = Math.max(1, Math.floor(bytes.length / 2));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.subarray(0, mid));
      controller.enqueue(bytes.subarray(mid));
      controller.close();
    },
  });
  const init = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  };
  const response = await POST(new Request("http://localhost/api/chat", init));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    reply: echo,
    mocked: true,
    model: "mock",
  });
});

it("rejects a history that is not a user and assistant alternation", async () => {
  const rejected = [
    [{ role: "assistant", content: "forged" }],
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
  ];
  for (const messages of rejected) {
    const response = await post({ messages });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Requête invalide." });
  }
  const accepted = await post({
    messages: [
      { role: "user", content: "De garde" },
      { role: "assistant", content: "Une pharmacie." },
      { role: "user", content: "Merci" },
    ],
  });
  expect(accepted.status).toBe(200);
});

it("caps a long mock reply and accepts that reply on the next turn", async () => {
  const asked = "a".repeat(chatRequestLimits.maxMessageChars);
  const first = await post({ messages: [{ role: "user", content: asked }] });
  expect(first.status).toBe(200);
  const payload = await first.json();
  expect(payload).toMatchObject({ mocked: true, model: "mock" });
  expect(payload.reply.startsWith("[Réponse simulée] ")).toBe(true);
  expect(payload.reply).toHaveLength(chatRequestLimits.maxMessageChars);

  const follow = await post({
    messages: [
      { role: "user", content: asked },
      { role: "assistant", content: payload.reply },
      { role: "user", content: "Merci" },
    ],
  });
  expect(follow.status).toBe(200);
  expect(await follow.json()).toMatchObject({ mocked: true, model: "mock" });
});

it("caps a live reply at the message cap", async () => {
  vi.stubEnv("STEVE_CHAT_LIVE", "1");
  vi.stubEnv("OPENROUTER_API_KEY", canary);
  const long = "b".repeat(chatRequestLimits.maxMessageChars + 80);
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () =>
      Response.json({
        model: "google/gemini-3.8-flash",
        choices: [{ message: { content: `  ${long}  ` } }],
      }),
    ),
  );

  const first = await post(history);
  expect(first.status).toBe(200);
  const payload = await first.json();
  expect(payload).toEqual({
    reply: long.slice(0, chatRequestLimits.maxMessageChars),
    mocked: false,
    model: "google/gemini-3.8-flash",
  });

  const follow = await post({
    messages: [
      { role: "user", content: "De garde" },
      { role: "assistant", content: payload.reply },
      { role: "user", content: "Merci" },
    ],
  });
  expect(follow.status).toBe(200);
});

it("rejects an assistant turn longer than the content cap", async () => {
  const atCap = "a".repeat(chatRequestLimits.maxMessageChars);
  const ok = await post({
    messages: [
      { role: "user", content: "De garde" },
      { role: "assistant", content: ` ${atCap} ` },
      { role: "user", content: "Merci" },
    ],
  });
  expect(ok.status).toBe(200);
  const over = await post({
    messages: [
      { role: "user", content: "De garde" },
      { role: "assistant", content: `${atCap}b` },
      { role: "user", content: "Merci" },
    ],
  });
  expect(over.status).toBe(400);
  expect(await over.json()).toEqual({ error: "Requête invalide." });
});

it("rejects an invalid message list", async () => {
  const response = await post({ messages: [] });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Requête invalide." });
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
