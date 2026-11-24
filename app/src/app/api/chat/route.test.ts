import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { JEV_TIMEOUT_MS, JEV_URL } from "@steve/triage";
import { chatRequestLimits } from "../../../chat/request.js";
import { POST } from "./route.js";
import { systemPrompt } from "./system-prompt.js";
import { readTriageLog, resetTriageLog } from "./triage-log.js";

const canary = "test-openrouter-key-canary";
const jevCanary = "test-jev-key-canary";
const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
const echo =
  "[Réponse simulée] Vous avez demandé : De garde. Je ne pose pas de diagnostic. En cas d'urgence, appelez le 15.";
const upstreamError = "Le service de chat est indisponible. Réessayez.";

const history = {
  messages: [{ role: "user", content: "De garde" }],
};

beforeEach(() => {
  vi.stubEnv("JEV_API_KEY", "");
  resetTriageLog();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetTriageLog();
});

const systemPromptRules = [
  "Ton nom est Steve.",
  "Tu aides à organiser des démarches de santé.",
  "Tu n'es pas médecin et tu ne poses jamais de diagnostic.",
  "Tu tutoies.",
  "Tu ne te présentes jamais et tu ne salues pas.",
  "Tu ne donnes le 15 que pour une vraie urgence, c'est-à-dire des signes de gravité, une surdose, une automutilation ou un danger immédiat. S'il n'y a pas de pensées suicidaires ni de détresse psychologique, tu dis en première phrase : « Appelle le 15 maintenant ». Si une surdose ou une automutilation s'accompagne de pensées suicidaires ou de la détresse psychologique, tu dis en première phrase : « Appelle le 3114 maintenant », puis « Appelle le 15 maintenant ». Pour un symptôme courant comme la fièvre d'un enfant, tu ne nommes le 15 qu'à côté de signes de gravité clairs, par exemple une difficulté à respirer ou une somnolence inhabituelle, jamais par défaut. Pour une crise de panique dont le seul signe physique est un essoufflement, tu ne donnes pas le 15.",
  "Pour des pensées suicidaires ou une détresse aiguë avec danger, sans surdose, ni automutilation, ni signe de gravité physique, tu dis en première phrase : « Appelle le 3114 maintenant », puis « Appelle le 15 maintenant ». Une forme adoucie comme « tu peux appeler » n'est pas admise pour les pensées suicidaires, l'automutilation ou la détresse aiguë avec danger. Une crise de panique compte comme une détresse : avec une douleur thoracique ou un évanouissement, tu dis en première phrase « Appelle le 15 maintenant », puis « Appelle le 3114 ». Si un signe de gravité physique autre qu'un simple essoufflement, par exemple une douleur thoracique, un évanouissement, une cyanose, un essoufflement qui ne cède pas ou une maladie connue du cœur ou des poumons, s'accompagne de pensées suicidaires ou de détresse, et qu'il n'y a ni surdose ni automutilation, tu dis en première phrase : « Appelle le 15 maintenant », puis « Appelle le 3114 ». Une angoisse intense ou une crise de panique, sans pensée suicidaire et sans danger, peut citer le 3114 comme ressource, sans l'exiger en première phrase. Si une crise de panique n'a comme signe physique qu'un essoufflement, tu dis en première phrase : « Appelle le 3114 », pas le 15.",
  "Les règles sur le 15 et le 3114 passent avant chaque autre règle, y compris la règle sur les médicaments et la limite de 2 à 4 phrases.",
  "Tu ne donnes jamais le 112 ni SOS Médecins.",
  "Tu ne nommes jamais un médicament, ni une classe de médicaments, ni un principe actif, ni une dose, ni une fréquence, ni une durée.",
  "Si la personne nomme un médicament, tu ne le confirmes pas, tu ne le compares pas et tu ne l'ajustes pas.",
  "Pour toute question sur un médicament, tu orientes vers un pharmacien ou le médecin traitant.",
  "Pour une question non urgente la nuit ou le week-end, tu orientes vers le médecin traitant ou une pharmacie de garde.",
  "Tu réponds en français, comme dans une conversation, en 2 à 4 phrases courtes.",
  "Tu n'utilises une courte liste que si des étapes sont vraiment nécessaires.",
  "Pas de titre, pas de gras, pas d'italique.",
  "Dans le doute, tu poses une seule question courte ou tu recommandes une consultation.",
] as const;

it("pins every system prompt rule as a full sentence", () => {
  expect(systemPrompt).toBe(systemPromptRules.join("\n"));
});

const forbiddenPromptAdditions = [
  "Dans le doute, appelle le 15.",
  "appelle le 116 117",
] as const;

const discouragingEmergencyPhrases = [
  "ne donne jamais le 15",
  "ne donne jamais le 3114",
  "tu ne donnes jamais le 15 par défaut",
  "évite le 3114",
  "évite le 15",
  "pas le 15 par défaut",
  "pas le 3114 par défaut",
  "sans nommer le 15",
  "sans nommer le 3114",
  "ne pas appeler",
] as const;

const childFeverNeverByDefault =
  "tu ne nommes le 15 qu'à côté de signes de gravité clairs, par exemple une difficulté à respirer ou une somnolence inhabituelle, jamais par défaut.";

const discouragingEmergencyPatterns = [
  /ne donnes? jamais le (?:15|3114)/iu,
  /évite le (?:15|3114)/iu,
  /pas le (?:15|3114) par défaut/iu,
  /sans nommer le (?:15|3114)/iu,
  /ne pas appeler/iu,
] as const;

function discouragesEmergencyByDefault(prompt: string): boolean {
  return discouragingEmergencyPatterns.some((pattern) => pattern.test(prompt));
}

it("rejects a system prompt that adds a doubt default or 116 117", () => {
  for (const phrase of forbiddenPromptAdditions) {
    expect(systemPrompt).not.toContain(phrase);
  }
  expect(systemPrompt).toContain(childFeverNeverByDefault);
  expect(discouragesEmergencyByDefault(childFeverNeverByDefault)).toBe(false);
  expect(discouragesEmergencyByDefault(systemPrompt)).toBe(false);
  for (const phrase of discouragingEmergencyPhrases) {
    expect(systemPrompt.toLocaleLowerCase("fr").includes(phrase)).toBe(false);
  }
});

it("flags a system prompt that discourages 15 or 3114 once that wording is injected", () => {
  expect(discouragesEmergencyByDefault(systemPrompt)).toBe(false);
  for (const phrase of discouragingEmergencyPhrases) {
    const injected = `${systemPrompt}\n${phrase}`;
    expect(injected).toContain(childFeverNeverByDefault);
    expect(discouragesEmergencyByDefault(injected), phrase).toBe(true);
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

  expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([openRouterUrl]);
  const call = openRouterCall(fetchMock);
  expect(call).toBeDefined();
  if (call === undefined) {
    return;
  }
  expect(call[0]).toBe(openRouterUrl);
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

it("defaults the model to openai/gpt-6.1-terra and falls back when OpenRouter omits model", async () => {
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
    model: "openai/gpt-6.1-terra",
  });

  delete process.env["OPENROUTER_MODEL"];
  const missingModel = await post(history);
  const missingText = await missingModel.text();
  expect(missingText).not.toContain(canary);
  expect(JSON.parse(missingText)).toEqual({
    reply: "D'accord.",
    mocked: false,
    model: "openai/gpt-6.1-terra",
  });
  const openRouterCalls = fetchMock.mock.calls.filter(
    (call) => String(call[0]) === openRouterUrl,
  );
  expect(openRouterCalls).toHaveLength(2);
  for (const call of openRouterCalls) {
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({
      model: "openai/gpt-6.1-terra",
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
  const timeoutIndex = timeout.mock.calls.findIndex((args) => args[0] === 30_000);
  const signal: unknown = timeout.mock.results[timeoutIndex]?.value;
  expect(openRouterCall(fetchMock)?.[1]?.signal).toBe(signal);
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
  const call = openRouterCall(fetchMock);
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
        model: "openai/gpt-6.1-terra",
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
    model: "openai/gpt-6.1-terra",
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

const consultGuidance =
  "la nuit ou le week-end, oriente vers le médecin traitant ou une pharmacie de garde";
const needInfoGuidance = "pose une seule question courte";

const labelNames = ["emergency", "consult", "self-care", "need-info"] as const;
const channelNames = ["physical", "psychological", "both", "none"] as const;

it("forwards the Jev bearer canary and the classify signal", async () => {
  vi.stubEnv("STEVE_CHAT_LIVE", "1");
  vi.stubEnv("OPENROUTER_API_KEY", canary);
  vi.stubEnv("JEV_API_KEY", jevCanary);
  const timeout = vi.spyOn(AbortSignal, "timeout");
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    if (String(input) === JEV_URL) {
      return Response.json(jevBody("emergency", 0.91, "psychological"));
    }
    return Response.json({
      model: "openai/gpt-6.1-terra",
      choices: [{ message: { content: "Reste avec moi." } }],
    });
  });
  vi.stubGlobal("fetch", fetchMock);

  const response = await post(history);
  const jevCall = jevFetchCall(fetchMock);
  expect(jevCall).toBeDefined();
  if (jevCall === undefined) {
    return;
  }
  const headers = new Headers(jevCall[1]?.headers);
  expect(headers.get("authorization")).toBe(`Bearer ${jevCanary}`);
  const timeoutIndex = timeout.mock.calls.findIndex((args) => args[0] === JEV_TIMEOUT_MS);
  expect(timeoutIndex).toBeGreaterThanOrEqual(0);
  expect(jevCall[1]?.signal).toBe(timeout.mock.results[timeoutIndex]?.value);
  expect(openRouterCall(fetchMock)).toBeDefined();

  const text = await response.text();
  expect(text).not.toContain(canary);
  expect(text).not.toContain(jevCanary);
  expect(JSON.parse(text)).toEqual({
    reply: "Reste avec moi.",
    mocked: false,
    model: "openai/gpt-6.1-terra",
    calls: [
      { type: "call", number: "3114" },
      { type: "call", number: "15" },
    ],
  });
});

it("puts emergency calls on the reply and still calls the chat model", async () => {
  const { body, fetchMock } = await liveTriage(
    jevBody("emergency", 0.91, "physical"),
    "Appelez le 15.",
  );
  expect(body).toEqual({
    reply: "Appelez le 15.",
    mocked: false,
    model: "openai/gpt-6.1-terra",
    calls: [{ type: "call", number: "15" }],
  });
  expect(jevFetchCall(fetchMock)).toBeDefined();
  expect(openRouterCall(fetchMock)).toBeDefined();
  expect(readTriageLog()).toEqual([]);
});

it("sends the plain system prompt when triage does not close", async () => {
  const cases = [
    {
      reason: "http",
      jev: () => new Response("upstream", { status: 503 }),
    },
    {
      reason: "timeout",
      jev: () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      },
    },
    {
      reason: "network",
      jev: () => {
        throw new TypeError("network down");
      },
    },
    {
      reason: "malformed",
      jev: () => Response.json({ answers: {} }),
    },
  ] as const;
  for (const item of cases) {
    resetTriageLog();
    const fetchMock = triageFetch(item.jev);
    vi.stubGlobal("fetch", fetchMock);
    const response = await post(history);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      reply: "D'accord.",
      mocked: false,
      model: "openai/gpt-6.1-terra",
    });
    expect(providerMessages(fetchMock)).toEqual([
      { role: "system", content: systemPrompt },
      { role: "user", content: "De garde" },
    ]);
    expect(readTriageLog()).toEqual([{ cause: "no-triage", reason: item.reason }]);
  }
});

it("takes the no-triage path when the Jev key is missing or blank", async () => {
  for (const key of ["", "   "]) {
    resetTriageLog();
    const fetchMock = triageFetch(() => {
      throw new Error("Jev must not be called");
    });
    vi.stubEnv("JEV_API_KEY", key);
    vi.stubGlobal("fetch", fetchMock);
    const response = await post(history);
    expect(response.status).toBe(200);
    expect(providerMessages(fetchMock)).toEqual([
      { role: "system", content: systemPrompt },
      { role: "user", content: "De garde" },
    ]);
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([openRouterUrl]);
    expect(readTriageLog()).toEqual([{ cause: "no-triage", reason: "missing-key" }]);
  }

  resetTriageLog();
  const fetchMock = triageFetch(() => Response.json(jevBody("consult", 0.7, "none")));
  delete process.env["JEV_API_KEY"];
  vi.stubGlobal("fetch", fetchMock);
  await post(history);
  expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([openRouterUrl]);
  expect(readTriageLog()).toEqual([{ cause: "no-triage", reason: "missing-key" }]);
});

it("keeps the system prompt at index 0 for every live triage outcome", async () => {
  const cases = [
    {
      name: "emergency",
      payload: jevBody("emergency", 0.91, "psychological"),
      guidance: undefined,
    },
    {
      name: "consult",
      payload: jevBody("consult", 0.74, "none"),
      guidance: consultGuidance,
    },
    {
      name: "need-info",
      payload: jevBody("need-info", 0.55, "none"),
      guidance: needInfoGuidance,
    },
    {
      name: "self-care",
      payload: jevBody("self-care", 0.7, "none"),
      guidance: undefined,
    },
    {
      name: "no-triage",
      payload: { answers: {} },
      guidance: undefined,
    },
  ] as const;
  for (const item of cases) {
    resetTriageLog();
    const fetchMock = triageFetch(() => Response.json(item.payload));
    vi.stubGlobal("fetch", fetchMock);
    const response = await post(history);
    expect(response.status, item.name).toBe(200);
    const messages = providerMessages(fetchMock);
    expect(messages[0], item.name).toEqual({ role: "system", content: systemPrompt });
    if (item.guidance === undefined) {
      expect(messages[1], item.name).toEqual({ role: "user", content: "De garde" });
      expect(messages, item.name).toHaveLength(2);
    } else {
      expect(messages[1], item.name).toEqual({ role: "system", content: item.guidance });
      expect(messages[2], item.name).toEqual({ role: "user", content: "De garde" });
    }
  }
});

it("passes JEV_MODEL through to the classifier request", async () => {
  vi.stubEnv("JEV_MODEL", "  jev-test-model  ");
  const fetchMock = triageFetch(() => Response.json(jevBody("self-care", 0.7, "none")));
  vi.stubGlobal("fetch", fetchMock);
  const response = await post(history);
  expect(response.status).toBe(200);
  const jevCall = jevFetchCall(fetchMock);
  expect(jevCall).toBeDefined();
  if (jevCall === undefined) {
    return;
  }
  expect(JSON.parse(String(jevCall[1]?.body))).toMatchObject({ model: "jev-test-model" });
  expect(providerMessages(fetchMock)[0]).toEqual({ role: "system", content: systemPrompt });
  expect(readTriageLog()).toEqual([]);
});

it("does not call Jev on the mock path", async () => {
  vi.stubEnv("JEV_API_KEY", jevCanary);
  vi.stubEnv("STEVE_CHAT_LIVE", "");
  vi.stubEnv("OPENROUTER_API_KEY", canary);
  const fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
  const response = await post(history);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ mocked: true, model: "mock" });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(readTriageLog()).toEqual([]);
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

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function armLive(): void {
  vi.stubEnv("STEVE_CHAT_LIVE", "1");
  vi.stubEnv("OPENROUTER_API_KEY", canary);
  vi.stubEnv("JEV_API_KEY", jevCanary);
  delete process.env["OPENROUTER_MODEL"];
}

function triageFetch(jev: () => Response | Promise<Response>, reply = "D'accord."): FetchMock {
  armLive();
  return vi.fn<typeof fetch>(async (input) => {
    if (String(input) === JEV_URL) {
      return jev();
    }
    return Response.json({
      model: "openai/gpt-6.1-terra",
      choices: [{ message: { content: reply } }],
    });
  });
}

async function liveTriage(
  payload: unknown,
  reply: string,
): Promise<{ readonly body: unknown; readonly fetchMock: FetchMock }> {
  const fetchMock = triageFetch(() => Response.json(payload), reply);
  vi.stubGlobal("fetch", fetchMock);
  const response = await post(history);
  return { body: await response.json(), fetchMock };
}

function openRouterCall(fetchMock: FetchMock) {
  return fetchMock.mock.calls.find((call) => String(call[0]) === openRouterUrl);
}

function jevFetchCall(fetchMock: FetchMock) {
  return fetchMock.mock.calls.find((call) => String(call[0]) === JEV_URL);
}

function providerMessages(fetchMock: FetchMock): readonly { role: string; content: string }[] {
  const call = openRouterCall(fetchMock);
  const sent: unknown = JSON.parse(String(call?.[1]?.body));
  if (!isRecord(sent) || !Array.isArray(sent["messages"])) {
    return [];
  }
  const messages: { role: string; content: string }[] = [];
  for (const item of sent["messages"]) {
    if (!isRecord(item)) {
      continue;
    }
    const role = item["role"];
    const content = item["content"];
    if (typeof role !== "string" || typeof content !== "string") {
      continue;
    }
    messages.push({ role, content });
  }
  return messages;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function jevBody(
  label: (typeof labelNames)[number],
  labelP: number,
  channel: (typeof channelNames)[number],
): unknown {
  return {
    answers: {
      label: choice(label, split(labelNames, label, labelP)),
      channel: choice(channel, split(channelNames, channel, 0.9)),
    },
  };
}

function choice(selected: string, probabilities: Record<string, number>): unknown {
  return { type: "choice", choice: selected, probabilities };
}

function split(
  options: readonly string[],
  selected: string,
  selectedP: number,
): Record<string, number> {
  const rest = (1 - selectedP) / (options.length - 1);
  const probabilities: Record<string, number> = {};
  for (const option of options) {
    probabilities[option] = option === selected ? selectedP : rest;
  }
  return probabilities;
}
