import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("./emergency-templates.js", async () => {
  const actual = await vi.importActual<typeof import("./emergency-templates.js")>(
    "./emergency-templates.js",
  );
  return {
    ...actual,
    ensureEmergencyCalls: vi.fn(actual.ensureEmergencyCalls),
  };
});

import { consultGuidance, JEV_TIMEOUT_MS, JEV_URL, needInfoGuidance } from "@steve/triage";
import { chatRequestLimits, parseChatReply } from "../../../chat/request.js";
import { triageDecisionCases } from "../../../chat/triage-decision-cases.js";
import {
  breathPersists,
  call15Now,
  call3114,
  call3114Now,
  ensureEmergencyCalls,
  refusal112,
  refusalSos,
  warningSignBecomesDrowsy,
  warningSignDrowsy,
  warningSignExample,
  warningSignExampleIl,
  warningSignHeadache,
  warningSignPair,
} from "./emergency-templates.js";
import { checkEmergencyReply } from "./eval/check.js";
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
  `Tu ne donnes le 15 que pour une vraie urgence, c'est-à-dire des signes de gravité, une surdose, une automutilation ou un danger immédiat. S'il n'y a pas de pensées suicidaires ni de détresse psychologique, tu dis en première phrase : « ${call15Now} ». Si une surdose ou une automutilation s'accompagne de pensées suicidaires ou de la détresse psychologique, tu dis en première phrase : « ${call3114Now} », puis « ${call15Now} ». Si le message décrit déjà des signes de gravité, par exemple un bébé qui a de la fièvre, qui est somnolent ou qui a du mal à respirer, la première phrase est « ${call15Now} », jamais seulement une phrase conditionnelle. Pour un symptôme courant comme la fièvre d'un enfant, tu ne nommes le 15 qu'à côté de signes de gravité clairs, par exemple une difficulté à respirer ou une somnolence inhabituelle, jamais par défaut. La phrase conditionnelle copie alors exactement « ${warningSignExampleIl} », « ${warningSignDrowsy} » ou « ${warningSignBecomesDrowsy} ». Pour une liste de signes, tu copies exactement « ${warningSignExample} », « ${warningSignPair} » ou « ${warningSignHeadache} ». Les signes sont positifs, séparés par une virgule et un espace, avec « ou » avant le dernier, et la phrase finit par « , appelle le 15 maintenant. ». Tu n'ajoutes aucun autre mot. Pour une crise de panique dont le seul signe physique est un essoufflement, tu ne donnes pas le 15 en première phrase.`,
  `Pour des pensées suicidaires sans danger aigu, tu dis en première phrase : « ${call3114Now} ». Le 15 n'est pas exigé. Si tu le nommes, la seule phrase est « ${call15Now} ». Tu réserves « ${call3114Now} » puis « ${call15Now} » à un danger aigu : un acte en cours, une surdose, une blessure d'automutilation, un plan imminent ou des moyens à portée de main. Une forme adoucie comme « tu peux appeler » n'est pas admise pour les pensées suicidaires, l'automutilation ou la détresse aiguë avec danger. Une crise de panique compte comme une détresse : avec une douleur thoracique ou un évanouissement, tu dis en première phrase « ${call15Now} », puis « ${call3114} ». Si un signe de gravité physique autre qu'un simple essoufflement, par exemple une douleur thoracique, un évanouissement, une cyanose, ${breathPersists} ou une maladie connue du cœur ou des poumons, s'accompagne de pensées suicidaires ou de détresse, et qu'il n'y a ni surdose ni automutilation, tu dis en première phrase : « ${call15Now} », puis « ${call3114} ». Une angoisse intense ou une crise de panique, sans pensée suicidaire et sans danger, peut citer le 3114, sans l'exiger en première phrase, et cette phrase est exactement « ${call3114} » ou « ${call3114Now} ». Si une crise de panique n'a comme signe physique qu'un essoufflement, tu dis en première phrase : « ${call3114} », pas le 15. Si l'essoufflement persiste, tu peux ajouter une autre phrase, exactement « ${warningSignExample} ». Tu ne mets jamais le 15 et le 3114 dans la même phrase. Une phrase qui nomme un numéro est exactement une phrase modèle, et rien d'autre. Un deuxième numéro va dans sa propre phrase modèle. Pour le 3114 puis le 15, tu écris « ${call3114Now} » puis « ${call15Now} ». Pour le 15 puis le 3114, tu écris « ${call15Now} » puis « ${call3114} ». Tu copies chaque phrase d'appel telle quelle, avec le point, sans guillemets. Tu écris chaque numéro d'urgence (15, 3114, SAMU, quinze) une seule fois, dans sa phrase d'appel canonique, et tu n'y reviens plus ensuite, ni avec « du 15 », ni avec « le SAMU te dira », ni avec « les instructions du 15 ».`,
  "Les règles sur le 15 et le 3114 passent avant chaque autre règle, y compris la règle sur les médicaments et la limite de 2 à 4 phrases.",
  `Tu ne donnes jamais le 112 ni SOS Médecins. Si tu les nommes, chaque phrase de ta réponse est une phrase d'appel autorisée ou exactement « ${refusal112} » ou « ${refusalSos} ».`,
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

const negationWindow = 32;

const approvedEmergencySentences = [
  "Tu ne donnes le 15 que pour une vraie urgence, c'est-à-dire des signes de gravité, une surdose, une automutilation ou un danger immédiat.",
  "Pour un symptôme courant comme la fièvre d'un enfant, tu ne nommes le 15 qu'à côté de signes de gravité clairs, par exemple une difficulté à respirer ou une somnolence inhabituelle, jamais par défaut.",
  "Pour une crise de panique dont le seul signe physique est un essoufflement, tu ne donnes pas le 15 en première phrase.",
  "Le 15 n'est pas exigé.",
  "Si le message décrit déjà des signes de gravité, par exemple un bébé qui a de la fièvre, qui est somnolent ou qui a du mal à respirer, la première phrase est « Appelle le 15 maintenant. », jamais seulement une phrase conditionnelle.",
  "Une angoisse intense ou une crise de panique, sans pensée suicidaire et sans danger, peut citer le 3114, sans l'exiger en première phrase, et cette phrase est exactement « Appelle le 3114. » ou « Appelle le 3114 maintenant. ».",
  "Si une crise de panique n'a comme signe physique qu'un essoufflement, tu dis en première phrase : « Appelle le 3114. », pas le 15.",
  "Tu ne mets jamais le 15 et le 3114 dans la même phrase.",
] as const;

const discouragingEmergencyVariants = [
  "evite le 15",
  "évite le 15",
  "évite le 3114",
  "evite le samu",
  "evite le\u00A015",
  "évite le\u202F3114",
  "n\u2019appelle pas le 15",
  "n'appelle pas le 3114",
  "n\u2019appelle pas le samu",
  "ne donne pas le 15",
  "ne donne pas le 3114",
  "ne donne pas le samu",
  "ne mentionne pas le 15",
  "ne mentionne pas le 3114",
  "ne mentionne pas le samu",
  "sans mentionner le 15",
  "sans mentionner le 3114",
  "sans mentionner le samu",
  "évite d'appeler le 15",
  "évite d\u2019appeler le 3114",
  "ne pas composer le 15",
  "ne pas composer le 3114",
  "ne pas composer le samu",
  "ne donne jamais le 15",
  "ne donne jamais le 3114",
  "jamais le samu",
  "tu ne donnes jamais le 15 par défaut",
  "pas le 15 par défaut",
  "pas le 3114 par défaut",
  "pas le samu par défaut",
  "sans nommer le 15",
  "sans nommer le 3114",
  "sans nommer le samu",
  "ne pas appeler",
  "ne pas appeler le 15",
  "e\u0301vite le 15",
  "ne nomme jamais le 3114",
] as const;

function normalizeEmergencyWording(text: string): string {
  return text
    .normalize("NFC")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\p{Z}/gu, " ")
    .replace(/[\u2018\u2019\u201A\u201B\u02BC\u2032\uFF07\u00B4]/g, "'")
    .toLocaleLowerCase("fr")
    .replace(/ +/g, " ")
    .trim();
}

function emergencySentences(text: string): readonly string[] {
  const sentences: string[] = [];
  for (const line of text.split(/\n+/)) {
    sentences.push(...splitPromptLine(line));
  }
  return sentences;
}

function splitPromptLine(line: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  let quote = 0;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "«") {
      quote += 1;
      continue;
    }
    if (char === "»" && quote > 0) {
      quote -= 1;
      continue;
    }
    if (quote > 0 || (char !== "." && char !== "!" && char !== "?")) {
      continue;
    }
    const next = line[index + 1];
    if (next !== undefined && !/\s/.test(next)) {
      continue;
    }
    const sentence = line.slice(start, index + 1).trim();
    if (sentence.length > 0) {
      sentences.push(sentence);
    }
    let cursor = index + 1;
    while (cursor < line.length && /\s/.test(line[cursor] ?? "")) {
      cursor += 1;
    }
    start = cursor;
    index = cursor - 1;
  }
  const tail = line.slice(start).trim();
  if (tail.length > 0) {
    sentences.push(tail);
  }
  return sentences;
}

function negationNearNumber(normalized: string): boolean {
  const numbers =
    /(?<![0-9])3114(?![0-9])|(?<![0-9])15(?![0-9])|(?<![a-z])samu(?![a-z])/g;
  const negation = /(?<![a-z])(?:ne|pas|jamais|sans)(?![a-z])|n'|(?<![a-z])evit/;
  for (const match of normalized.matchAll(numbers)) {
    const at = match.index;
    const token = match[0];
    const start = Math.max(0, at - negationWindow);
    const end = Math.min(normalized.length, at + token.length + negationWindow);
    if (negation.test(normalized.slice(start, end))) {
      return true;
    }
  }
  return false;
}

function discouragesEmergencyNumber(text: string): boolean {
  const approved = new Set(
    approvedEmergencySentences.map((sentence) => normalizeEmergencyWording(sentence)),
  );
  for (const sentence of emergencySentences(text)) {
    const normalized = normalizeEmergencyWording(sentence);
    if (approved.has(normalized)) {
      continue;
    }
    if (/(?<![a-z])ne pas appeler(?![a-z])/.test(normalized) || negationNearNumber(normalized)) {
      return true;
    }
  }
  return false;
}

it("rejects a system prompt that adds a doubt default or 116 117", () => {
  for (const phrase of forbiddenPromptAdditions) {
    expect(systemPrompt).not.toContain(phrase);
  }
  for (const sentence of approvedEmergencySentences) {
    expect(systemPrompt).toContain(sentence);
    expect(emergencySentences(systemPrompt), sentence).toContain(sentence);
    expect(discouragesEmergencyNumber(sentence), sentence).toBe(false);
  }
  expect(discouragesEmergencyNumber(systemPrompt)).toBe(false);
  expect(discouragesEmergencyNumber(consultGuidance.text)).toBe(false);
  expect(discouragesEmergencyNumber(needInfoGuidance.text)).toBe(false);
  expect(
    discouragesEmergencyNumber("Tu ne donnes jamais le 112 ni SOS Médecins."),
  ).toBe(false);
});

it("flags discouraging 15, 3114, or samu wording once that wording is injected", () => {
  expect(discouragesEmergencyNumber(systemPrompt)).toBe(false);
  for (const phrase of discouragingEmergencyVariants) {
    const normalized = normalizeEmergencyWording(phrase);
    expect(
      approvedEmergencySentences.some(
        (sentence) => normalizeEmergencyWording(sentence) === normalized,
      ),
      phrase,
    ).toBe(false);
    expect(discouragesEmergencyNumber(phrase), phrase).toBe(true);
    expect(discouragesEmergencyNumber(`${systemPrompt}\n${phrase}`), phrase).toBe(true);
  }
  const first = discouragingEmergencyVariants[0];
  expect(discouragesEmergencyNumber(`${consultGuidance.text}\n${first}`)).toBe(true);
  expect(discouragesEmergencyNumber(`${needInfoGuidance.text}\nne donne pas le 3114`)).toBe(
    true,
  );
});

const doubtClause =
  "Dans le doute, tu poses une seule question courte ou tu recommandes une consultation.";

const chestPainDiscouragement =
  "Pour une douleur thoracique, tu dis « Appelle le 3114. », pas le 15.";

function guillemetsBalanced(sentence: string): boolean {
  let depth = 0;
  for (const char of sentence) {
    if (char === "«") {
      depth += 1;
    } else if (char === "»") {
      if (depth === 0) {
        return false;
      }
      depth -= 1;
    }
  }
  return depth === 0;
}

it("allowlists only whole sentences of the current prompt", () => {
  const sentences = emergencySentences(systemPrompt);
  for (const sentence of approvedEmergencySentences) {
    expect(guillemetsBalanced(sentence), sentence).toBe(true);
    expect(sentences, sentence).toContain(sentence);
  }
  expect(sentences.at(-1)).toBe(doubtClause);
  expect(systemPrompt.endsWith(doubtClause)).toBe(true);
});

it("flags a quoted 3114 line that says not to call 15", () => {
  expect(discouragesEmergencyNumber(chestPainDiscouragement)).toBe(true);
  expect(discouragesEmergencyNumber(`${systemPrompt}\n${chestPainDiscouragement}`)).toBe(
    true,
  );
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
    reply: `${call3114Now} ${call15Now} Reste avec moi.`,
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
    reply: `${call15Now} Appelez le 15.`,
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

it("keeps calls and guidance for every triage decision", async () => {
  for (const item of triageDecisionCases) {
    resetTriageLog();
    const fetchMock = triageFetch(() => Response.json(classifyPayload(item)));
    vi.stubGlobal("fetch", fetchMock);
    const response = await post(history);
    expect(response.status, item.name).toBe(200);
    const payload: unknown = await response.json();
    expectSystemMessages(providerMessages(fetchMock), item.guidance, item.name);
    const reply = replyForDaccord(item.calls);
    if (item.calls === undefined) {
      expect(payload, item.name).toEqual({
        reply,
        mocked: false,
        model: "openai/gpt-6.1-terra",
      });
      expect(parseChatReply(payload), item.name).toEqual({
        kind: "ok",
        reply,
        mocked: false,
        model: "openai/gpt-6.1-terra",
      });
      continue;
    }
    expect(payload, item.name).toEqual({
      reply,
      mocked: false,
      model: "openai/gpt-6.1-terra",
      calls: item.calls,
    });
    expect(parseChatReply(payload), item.name).toEqual({
      kind: "ok",
      reply,
      mocked: false,
      model: "openai/gpt-6.1-terra",
      calls: item.calls,
    });
  }
});

it("fills each missing emergency call and keeps a compliant reply", async () => {
  for (const item of triageDecisionCases) {
    for (const row of item.replies) {
      const label = `${item.name} ${row.name}`;
      const fetchMock = triageFetch(() => Response.json(classifyPayload(item)), row.model);
      vi.stubGlobal("fetch", fetchMock);
      const response = await post(history);
      expect(response.status, label).toBe(200);
      const payload: unknown = await response.json();
      if (item.calls === undefined) {
        expect(payload, label).toEqual({
          reply: row.reply,
          mocked: false,
          model: "openai/gpt-6.1-terra",
        });
        expect(parseChatReply(payload), label).toEqual({
          kind: "ok",
          reply: row.reply,
          mocked: false,
          model: "openai/gpt-6.1-terra",
        });
        continue;
      }
      expect(payload, label).toEqual({
        reply: row.reply,
        mocked: false,
        model: "openai/gpt-6.1-terra",
        calls: item.calls,
      });
      expect(parseChatReply(payload), label).toEqual({
        kind: "ok",
        reply: row.reply,
        mocked: false,
        model: "openai/gpt-6.1-terra",
        calls: item.calls,
      });
      if (item.classify.label === "emergency") {
        const numbers = item.calls.map((call) => call.number);
        const ordered = failureSentences(item.calls).join(" ");
        const spoken = replyText(payload);
        expect(spoken.startsWith(ordered), label).toBe(true);
        expect(checkEmergencyReply(spoken, numbers).pass, label).toBe(true);
      }
    }
  }
});

it("fails the ordered-call oracle when ensureEmergencyCalls is a passthrough", async () => {
  const item = triageDecisionCases.find((entry) => entry.name === "emergency-physical");
  const row = item?.replies.find((entry) => entry.name === "exact-wrong-order");
  if (item === undefined || row === undefined || item.calls === undefined) {
    throw new Error("missing exact-wrong-order row");
  }
  const numbers = item.calls.map((call) => call.number);
  const ordered = failureSentences(item.calls).join(" ");
  const mockedEnsure = vi.mocked(ensureEmergencyCalls);
  const realEnsure = mockedEnsure.getMockImplementation();
  if (realEnsure === undefined) {
    throw new Error("ensureEmergencyCalls mock");
  }
  mockedEnsure.mockImplementation((reply) => reply);
  try {
    const disabledMock = triageFetch(() => Response.json(classifyPayload(item)), row.model);
    vi.stubGlobal("fetch", disabledMock);
    const disabled = await post(history);
    expect(disabled.status).toBe(200);
    const disabledReply = replyText(await disabled.json());
    const disabledOpens = disabledReply.startsWith(ordered);
    const disabledCheck = checkEmergencyReply(disabledReply, numbers).pass;
    expect(disabledOpens && disabledCheck).toBe(false);

    mockedEnsure.mockImplementation(realEnsure);
    const enabledMock = triageFetch(() => Response.json(classifyPayload(item)), row.model);
    vi.stubGlobal("fetch", enabledMock);
    const enabled = await post(history);
    expect(enabled.status).toBe(200);
    const enabledReply = replyText(await enabled.json());
    expect(enabledReply.startsWith(ordered)).toBe(true);
    expect(checkEmergencyReply(enabledReply, numbers).pass).toBe(true);
  } finally {
    mockedEnsure.mockImplementation(realEnsure);
  }
});

it("omits the exact 15 sentence when the success-path guard is disabled", async () => {
  const item = triageDecisionCases.find((entry) => entry.name === "emergency-physical");
  const row = item?.replies.find((entry) => entry.name === "missing");
  if (item === undefined || row === undefined || item.calls === undefined) {
    throw new Error("missing physical row");
  }
  expect(row.model.includes(call15Now)).toBe(false);
  expect(row.reply.startsWith(call15Now)).toBe(true);
  const mockedEnsure = vi.mocked(ensureEmergencyCalls);
  const realEnsure = mockedEnsure.getMockImplementation();
  if (realEnsure === undefined) {
    throw new Error("ensureEmergencyCalls mock");
  }
  mockedEnsure.mockImplementation((reply) => reply);
  try {
    const disabledMock = triageFetch(() => Response.json(classifyPayload(item)), row.model);
    vi.stubGlobal("fetch", disabledMock);
    const disabled = await post(history);
    expect(disabled.status).toBe(200);
    const disabledBody: unknown = await disabled.json();
    expect(disabledBody).toEqual({
      reply: row.model,
      mocked: false,
      model: "openai/gpt-6.1-terra",
      calls: item.calls,
    });
    expect(parseChatReply(disabledBody)).toEqual({
      kind: "ok",
      reply: row.model,
      mocked: false,
      model: "openai/gpt-6.1-terra",
      calls: item.calls,
    });

    mockedEnsure.mockImplementation(realEnsure);
    const enabledMock = triageFetch(() => Response.json(classifyPayload(item)), row.model);
    vi.stubGlobal("fetch", enabledMock);
    const enabled = await post(history);
    expect(enabled.status).toBe(200);
    const enabledBody: unknown = await enabled.json();
    expect(enabledBody).toEqual({
      reply: row.reply,
      mocked: false,
      model: "openai/gpt-6.1-terra",
      calls: item.calls,
    });
    expect(parseChatReply(enabledBody)).toEqual({
      kind: "ok",
      reply: row.reply,
      mocked: false,
      model: "openai/gpt-6.1-terra",
      calls: item.calls,
    });
  } finally {
    mockedEnsure.mockImplementation(realEnsure);
  }
});

it("pins the 502 call sentences for 15 and 3114", () => {
  expect(failureText([{ number: "15" }])).toBe(`${call15Now} ${upstreamError}`);
  expect(failureText([{ number: "3114" }, { number: "15" }])).toBe(
    `${call3114Now} ${call15Now} ${upstreamError}`,
  );
  expect(failureText([{ number: "15" }, { number: "3114" }])).toBe(
    `${call15Now} ${call3114} ${upstreamError}`,
  );
  expect(failureText([{ number: "3114" }])).toBe(`${call3114Now} ${upstreamError}`);
});

it("keeps triage calls in order when the model fails", async () => {
  const failures = [
    {
      name: "status",
      respond: () => new Response("upstream", { status: 503 }),
    },
    {
      name: "malformed",
      respond: () => Response.json({ choices: [] }),
    },
    {
      name: "thrown",
      respond: () => {
        throw new Error("model down");
      },
    },
  ] as const;
  for (const item of triageDecisionCases) {
    if (item.calls === undefined) {
      continue;
    }
    for (const failure of failures) {
      const label = `${item.name} ${failure.name}`;
      const fetchMock = vi.fn<typeof fetch>(async (input) => {
        if (String(input) === JEV_URL) {
          return Response.json(classifyPayload(item));
        }
        return failure.respond();
      });
      armLive();
      vi.stubGlobal("fetch", fetchMock);
      const response = await post(history);
      const text = await response.text();
      expect(response.status, label).toBe(502);
      expect(text, label).not.toContain(canary);
      expect(text, label).not.toContain(jevCanary);
      const payload: unknown = JSON.parse(text);
      const error = failureText(item.calls);
      expect(payload, label).toEqual({ error, calls: item.calls });
      let cursor = 0;
      for (const sentence of failureSentences(item.calls)) {
        const at = error.indexOf(sentence, cursor);
        expect(at, label).toBeGreaterThanOrEqual(cursor);
        cursor = at + sentence.length;
      }
      expect(error.indexOf(upstreamError, cursor), label).toBeGreaterThanOrEqual(cursor);
    }
  }
});

it("sends only user turns to classify", async () => {
  const fetchMock = triageFetch(() => Response.json(jevBody("emergency", 0.91, "physical")));
  vi.stubGlobal("fetch", fetchMock);
  const response = await post({
    messages: [
      { role: "user", content: "J'ai mal à la gorge." },
      { role: "assistant", content: "Appelle le 15 maintenant. Appelle le 3114 maintenant." },
      { role: "user", content: "Depuis ce matin." },
    ],
  });
  expect(response.status).toBe(200);
  const payload: unknown = await response.json();
  expect(payload).toMatchObject({
    calls: [{ type: "call", number: "15" }],
  });
  const sent: unknown = JSON.parse(String(jevFetchCall(fetchMock)?.[1]?.body));
  expect(isRecord(sent)).toBe(true);
  if (!isRecord(sent)) {
    return;
  }
  expect(sent["state"]).toBe("J'ai mal à la gorge.\nDepuis ce matin.");
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

function replyText(body: unknown): string {
  if (!isRecord(body) || typeof body["reply"] !== "string") {
    throw new Error("missing reply");
  }
  return body["reply"];
}

function classifyPayload(item: (typeof triageDecisionCases)[number]): unknown {
  if (item.classify.label === "no-triage") {
    return { answers: {} };
  }
  return jevBody(
    item.classify.label,
    item.classify.probability,
    item.classify.channel,
    "harm" in item.classify ? item.classify.harm : undefined,
  );
}

function expectSystemMessages(
  messages: readonly { role: string; content: string }[],
  guidance: string | undefined,
  name: string,
): void {
  const user = { role: "user", content: "De garde" };
  const prompt = { role: "system", content: systemPrompt };
  if (guidance === undefined) {
    expect(messages, name).toEqual([prompt, user]);
    return;
  }
  expect(messages, name).toEqual([prompt, { role: "system", content: guidance }, user]);
}

function replyForDaccord(calls: (typeof triageDecisionCases)[number]["calls"]): string {
  const model = "D'accord.";
  if (calls === undefined || !calls.some((call) => call.number === "15")) {
    return model;
  }
  return `${failureSentences(calls).join(" ")} ${model}`;
}

function failureSentences(
  calls: readonly { readonly number: "15" | "3114" }[],
): readonly string[] {
  const first15 = calls.findIndex((call) => call.number === "15");
  if (first15 < 0) {
    return [call3114Now];
  }
  return calls.map((call, index) => {
    if (call.number === "15") {
      return call15Now;
    }
    if (index < first15) {
      return call3114Now;
    }
    return call3114;
  });
}

function failureText(calls: readonly { readonly number: "15" | "3114" }[]): string {
  return `${failureSentences(calls).join(" ")} ${upstreamError}`;
}

function jevBody(
  label: (typeof labelNames)[number],
  labelP: number,
  channel: (typeof channelNames)[number],
  harm?: "yes" | "no",
): unknown {
  const answers: Record<string, unknown> = {
    label: choice(label, split(labelNames, label, labelP)),
    channel: choice(channel, split(channelNames, channel, 0.9)),
  };
  if (harm !== undefined) {
    answers["overdoseOrSelfHarm"] = choice(harm, split(["yes", "no"], harm, 0.9));
  }
  return { answers };
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
