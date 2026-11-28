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
  redirectMedication,
  refusal112,
  refusalMedication,
  refusalSos,
  warningSignBecomesDrowsy,
  warningSignDrowsy,
  warningSignExample,
  warningSignExampleIl,
  warningSignHeadache,
  warningSignPair,
  warningSignTail,
} from "./emergency-templates.js";
import { checkEmergencyReply } from "./eval/check.js";
import { POST } from "./route.js";
import { systemPrompt } from "./system-prompt.js";
import { readTriageLog, resetTriageLog } from "./triage-log.js";

const canary = "test-openrouter-key-canary";
const hackathonCanary = "test-hackathon-key-canary";
const jevCanary = "test-jev-key-canary";
const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
const echo =
  "[Simulated reply] You asked: De garde. I don't diagnose. In an emergency, call 15.";
const upstreamError = "The chat service is unavailable. Try again.";

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
  "Your name is Stevie.",
  "You help people organize their healthcare.",
  "You are not a doctor and you never diagnose: you point the person in the right direction.",
  "You speak to the person informally, as a friend would.",
  "You are warm and calm, like a friend who knows about health.",
  "You reassure without downplaying: you never say “it's nothing”, you say “let's look at this together” instead.",
  "You never introduce yourself and you never greet.",
  `You give 15 only for a real emergency or when a rule below requires it, meaning warning signs, an overdose, self-harm, immediate danger, suicidal thoughts or a panic attack with shortness of breath. If there are no suicidal thoughts and no psychological distress, your reply opens with exactly this block: “${call15Now}”. If an overdose or self-harm comes with suicidal thoughts or psychological distress, your reply opens with exactly these two blocks, in this order: “${call3114Now}” then “${call15Now}”. If the message already describes warning signs, for example a baby who has a fever, who is drowsy or who has trouble breathing, the reply opens with exactly this block: “${call15Now}” and never with only a conditional sentence. For a common symptom like a child's fever, you name 15 only next to clear warning signs, for example trouble breathing or unusual drowsiness, never by default. The conditional sentence then copies exactly “${warningSignExampleIl}”, “${warningSignDrowsy}” or “${warningSignBecomesDrowsy}”. For a list of signs, you copy exactly “${warningSignExample}”, “${warningSignPair}” or “${warningSignHeadache}”. The signs are positive, separated by a comma and a space, with “or” before the last one, and the sentence ends with “${warningSignTail}”. You add no other word. For a panic attack whose only physical sign is shortness of breath, your reply opens with exactly these two blocks, in this order: “${call3114Now}” then “${call15Now}”.`,
  `For suicidal thoughts without acute danger, your reply opens with exactly these two blocks, in this order: “${call3114Now}” then “${call15Now}”. For acute danger, an act in progress, an overdose, a self-harm injury, an imminent plan or means within reach, your reply also opens with exactly these two blocks, in this order: “${call3114Now}” then “${call15Now}”. A panic attack counts as distress: with chest pain or fainting, your reply opens with exactly these two blocks, in this order: “${call15Now}” then “${call3114}”. If a physical warning sign other than simple shortness of breath, for example chest pain, fainting, cyanosis, ${breathPersists} or a known heart or lung disease, comes with suicidal thoughts or distress, and there is no overdose and no self-harm, your reply opens with exactly these two blocks, in this order: “${call15Now}” then “${call3114}”. Intense anxiety or a panic attack, with no suicidal thought and no danger, may mention 3114 without requiring it as the opening, and that block is exactly “${call3114}” or “${call3114Now}”. If a panic attack has shortness of breath as its only physical sign, your reply opens with exactly these two blocks, in this order: “${call3114Now}” then “${call15Now}”. You never put 15 and 3114 in the same sentence. A sentence that names a number is exactly a template sentence, and nothing else. A second number goes in its own template sentence. For 3114 then 15, you write “${call3114Now}” then “${call15Now}”. For 15 then 3114, you write “${call15Now}” then “${call3114}”. You copy each call sentence as is, with the period, without quotation marks. You write each emergency number (15, 3114, SAMU, fifteen) only once, in its canonical call sentence, and you never come back to it afterwards, not with “from 15”, not with “the SAMU will tell you”, not with “the instructions from 15”.`,
  "In an emergency, the tone stays gentle, but the number comes clearly and early.",
  "The rules about 15 and 3114 come before every other rule, including the medication rule and the 2 to 4 sentence limit.",
  `You never give 112 or SOS Médecins. If you name them, every sentence of your reply is an allowed call sentence or exactly “${refusal112}”, “${refusalSos}”, “${refusalMedication}” or “${redirectMedication}”.`,
  "You never name a medication, a class of medication, an active ingredient, a dose, a frequency or a duration.",
  "If the person names a medication, you do not confirm it, compare it or adjust it.",
  "For any question about a medication, you point the person to a pharmacist or their GP.",
  `If someone asks you for a medication, including an over-the-counter one, for example Doliprane for a fever, you say exactly “${refusalMedication}” then exactly “${redirectMedication}”. If the 15 or 3114 rules apply, you follow them before that sentence.`,
  "For a non-urgent question at night or on the weekend, you point the person to their GP or an on-duty pharmacy.",
  "You always reply in English, even when the person writes in another language, like in a conversation, in 2 to 4 short sentences, especially out loud.",
  "You ask only one question at a time.",
  "You use a short list only if steps are truly needed.",
  "No headings, no bold, no italics.",
  "When in doubt, you ask one short question or you recommend a consultation.",
] as const;

it("pins every system prompt rule as a full sentence", () => {
  expect(systemPrompt).toBe(systemPromptRules.join("\n"));
});

it("accepts the medication refusal after a 112 refusal", () => {
  const reply = `${call3114Now} ${call15Now} ${refusal112} ${refusalMedication}`;
  const result = checkEmergencyReply(reply, ["3114", "15"]);
  expect(result.pass).toBe(true);
  expect(result.reason).toBe("ok");
  expect(result.reason).not.toContain("contains 112");
});

const forbiddenPromptAdditions = [
  "When in doubt, call 15.",
  "call 116 117",
] as const;

const negationWindow = 32;

function suicidalThoughtsRule(prompt: string): string {
  const rule = prompt
    .split("\n")
    .find((line) =>
      line.startsWith(
        "For suicidal thoughts without acute danger, your reply opens with exactly these two blocks, in this order:",
      ),
    );
  if (rule === undefined) {
    throw new Error("suicidal-thoughts rule missing");
  }
  return rule;
}

const suicidalOpener = `For suicidal thoughts without acute danger, your reply opens with exactly these two blocks, in this order: “${call3114Now}” then “${call15Now}”.`;

function sentenceAfterSuicidalOpener(prompt: string): string {
  const sentences = splitPromptLine(suicidalThoughtsRule(prompt));
  const openerAt = sentences.indexOf(suicidalOpener);
  if (openerAt < 0) {
    throw new Error("suicidal-thoughts opener drifted");
  }
  const next = sentences[openerAt + 1];
  if (next === undefined) {
    throw new Error("sentence after suicidal opener missing");
  }
  return next;
}

// Prompt sentences that put a negation near 15 or 3114 on purpose. Each one was
// read by hand: it limits how a number is repeated or combined and never tells
// Stevie to withhold 15 or 3114.
const approvedEmergencySentences = [
  `If the message already describes warning signs, for example a baby who has a fever, who is drowsy or who has trouble breathing, the reply opens with exactly this block: “${call15Now}” and never with only a conditional sentence.`,
  `Intense anxiety or a panic attack, with no suicidal thought and no danger, may mention 3114 without requiring it as the opening, and that block is exactly “${call3114}” or “${call3114Now}”.`,
  "You never put 15 and 3114 in the same sentence.",
  "You write each emergency number (15, 3114, SAMU, fifteen) only once, in its canonical call sentence, and you never come back to it afterwards, not with “from 15”, not with “the SAMU will tell you”, not with “the instructions from 15”.",
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
  "avoid 15",
  "avoid 3114",
  "avoid the samu",
  "avoid\u00A015",
  "don\u2019t call 15",
  "don't call 3114",
  "do not call the samu",
  "don't give 15",
  "don't give 3114",
  "don't mention 15",
  "do not mention 3114",
  "without mentioning 15",
  "without mentioning the samu",
  "avoid calling 15",
  "avoid calling 3114",
  "do not dial 15",
  "never give 3114",
  "never the samu",
  "you never give 15 by default",
  "not 15 by default",
  "not 3114 by default",
  "without naming 15",
  "do not call",
  "never name 3114",
  "15 isn't needed",
  "no need for 3114",
] as const;

function normalizeEmergencyWording(text: string): string {
  return text
    .normalize("NFC")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\p{Z}/gu, " ")
    .replace(/[\u2018\u2019\u201A\u201B\u02BC\u2032\uFF07\u00B4]/g, "'")
    .toLocaleLowerCase("en")
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
    if (char === "«" || char === "“") {
      quote += 1;
      continue;
    }
    if ((char === "»" || char === "”") && quote > 0) {
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

// The approved call blocks are reviewed copy. "take no risks. Call 15 now" sits
// inside call15Now, so each block reads as its bare number before the scan.
function withCallBlocksAsNumbers(normalized: string): string {
  let text = normalized;
  for (const [block, number] of [
    [call3114Now, "3114"],
    [call15Now, "15"],
    [call3114, "3114"],
  ] as const) {
    text = text.replaceAll(normalizeEmergencyWording(block), number);
  }
  return text;
}

function negationNearNumber(wording: string): boolean {
  const normalized = withCallBlocksAsNumbers(wording);
  const numbers =
    /(?<![0-9])3114(?![0-9])|(?<![0-9])15(?![0-9])|(?<![a-z])samu(?![a-z])/g;
  const negation =
    /(?<![a-z])(?:ne|pas|jamais|sans|not|no|never|without|nor|neither)(?![a-z])|n'|n't(?![a-z])|(?<![a-z])(?:evit|avoid)/;
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

function discouragesEmergencyNumber(
  text: string,
  allowlist: readonly string[] = [],
): boolean {
  const ownerBySentence = new Map<string, string>();
  const promptLines = systemPrompt.split("\n");
  for (const sentence of allowlist) {
    const owners = promptLines.filter((line) => splitPromptLine(line).includes(sentence));
    if (owners.length === 1 && owners[0] !== undefined) {
      ownerBySentence.set(sentence, owners[0]);
    }
  }
  for (const line of text.split(/\n+/)) {
    for (const sentence of splitPromptLine(line)) {
      if (ownerBySentence.get(sentence) === line) {
        continue;
      }
      const normalized = normalizeEmergencyWording(sentence);
      if (/(?<![a-z])(?:ne pas appeler|do not call|don't call)(?![a-z])/.test(normalized) || negationNearNumber(normalized)) {
        return true;
      }
    }
  }
  return false;
}

function sentenceOnlyDiscouragesEmergencyNumber(
  text: string,
  allowlist: readonly string[] = [],
): boolean {
  const approved = new Set(allowlist.map((sentence) => normalizeEmergencyWording(sentence)));
  for (const sentence of emergencySentences(text)) {
    const normalized = normalizeEmergencyWording(sentence);
    if (approved.has(normalized)) {
      continue;
    }
    if (/(?<![a-z])(?:ne pas appeler|do not call|don't call)(?![a-z])/.test(normalized) || negationNearNumber(normalized)) {
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
    expect(
      emergencySentences(systemPrompt).filter((part) => part === sentence),
      sentence,
    ).toHaveLength(1);
    const owners = systemPrompt
      .split("\n")
      .filter((line) => splitPromptLine(line).includes(sentence));
    expect(owners, sentence).toHaveLength(1);
    expect(
      discouragesEmergencyNumber(owners[0] ?? "", approvedEmergencySentences),
      sentence,
    ).toBe(false);
  }
  expect(discouragesEmergencyNumber(systemPrompt, approvedEmergencySentences)).toBe(false);
  expect(discouragesEmergencyNumber(consultGuidance.text)).toBe(false);
  expect(discouragesEmergencyNumber(needInfoGuidance.text)).toBe(false);
  expect(
    discouragesEmergencyNumber("You never give 112 or SOS Médecins."),
  ).toBe(false);
});

it("flags discouraging 15, 3114, or samu wording once that wording is injected", () => {
  expect(discouragesEmergencyNumber(systemPrompt, approvedEmergencySentences)).toBe(false);
  for (const phrase of discouragingEmergencyVariants) {
    const normalized = normalizeEmergencyWording(phrase);
    expect(
      approvedEmergencySentences.some(
        (sentence) => normalizeEmergencyWording(sentence) === normalized,
      ),
      phrase,
    ).toBe(false);
    expect(discouragesEmergencyNumber(phrase), phrase).toBe(true);
    expect(
      discouragesEmergencyNumber(`${systemPrompt}\n${phrase}`, approvedEmergencySentences),
      phrase,
    ).toBe(true);
  }
  const first = discouragingEmergencyVariants[0];
  expect(discouragesEmergencyNumber(`${consultGuidance.text}\n${first}`)).toBe(true);
  expect(discouragesEmergencyNumber(`${needInfoGuidance.text}\nne donne pas le 3114`)).toBe(
    true,
  );
});

it("requires 15 in the sentence after suicidal thoughts without acute danger", () => {
  const next = sentenceAfterSuicidalOpener(systemPrompt);
  expect(next).toContain(`“${call3114Now}”`);
  expect(next).toContain(`“${call15Now}”`);
  expect(next).not.toContain("is not required");
  expect(systemPrompt).not.toContain("15 is not required.");
  const guidanceLike = "Ask one short question. 15 is not required.";
  expect(discouragesEmergencyNumber(guidanceLike)).toBe(true);
  expect(discouragesEmergencyNumber(consultGuidance.text)).toBe(false);
  expect(discouragesEmergencyNumber(needInfoGuidance.text)).toBe(false);
  expect(discouragesEmergencyNumber(systemPrompt, approvedEmergencySentences)).toBe(false);
});

const doubtClause =
  "When in doubt, you ask one short question or you recommend a consultation.";

const chestPainDiscouragement =
  "For chest pain, you say “Call 3114.”, not 15.";

function guillemetsBalanced(sentence: string): boolean {
  let depth = 0;
  for (const char of sentence) {
    if (char === "«" || char === "“") {
      depth += 1;
    } else if (char === "»" || char === "”") {
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
    expect(sentences.filter((part) => part === sentence), sentence).toHaveLength(1);
  }
  expect(sentences.at(-1)).toBe(doubtClause);
  expect(systemPrompt.endsWith(doubtClause)).toBe(true);
});

it("flags a quoted 3114 line that says not to call 15", () => {
  expect(discouragesEmergencyNumber(chestPainDiscouragement)).toBe(true);
  expect(
    discouragesEmergencyNumber(
      `${systemPrompt}\n${chestPainDiscouragement}`,
      approvedEmergencySentences,
    ),
  ).toBe(true);
});

const chestPainFifteenCopy =
  "For chest pain, reassure the person. 15 is not required.";

it("flags an allowed 15 sentence copied onto another rule line", () => {
  expect(discouragesEmergencyNumber(chestPainFifteenCopy, approvedEmergencySentences)).toBe(
    true,
  );
  expect(
    discouragesEmergencyNumber(
      `${systemPrompt}\n${chestPainFifteenCopy}`,
      approvedEmergencySentences,
    ),
  ).toBe(true);
  expect(
    discouragesEmergencyNumber(chestPainFifteenCopy, ["15 is not required."]),
  ).toBe(true);
  expect(
    discouragesEmergencyNumber(suicidalThoughtsRule(systemPrompt), approvedEmergencySentences),
  ).toBe(false);
  expect(
    sentenceOnlyDiscouragesEmergencyNumber(chestPainFifteenCopy, approvedEmergencySentences),
  ).toBe(true);
  expect(
    sentenceOnlyDiscouragesEmergencyNumber(chestPainFifteenCopy, ["15 is not required."]),
  ).toBe(false);
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
  expect(headers.get("x-title")).toBe("Stevie");
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

it("prefers the hackathon Claude gateway when its configuration is complete", async () => {
  vi.stubEnv("STEVE_CHAT_LIVE", "1");
  vi.stubEnv("HACKATHON_AI_KEY", `  ${hackathonCanary}  `);
  vi.stubEnv("HACKATHON_AI_BASE_URL", "  https://gateway.example.test  ");
  vi.stubEnv("OPENROUTER_API_KEY", canary);
  const fetchMock = vi.fn<typeof fetch>(async () =>
    Response.json({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-bedrock",
      content: [{ type: "text", text: "Une pharmacie de garde." }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 6 },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const response = await post(history);
  const text = await response.text();
  expect(response.status).toBe(200);
  expect(text).not.toContain(hackathonCanary);
  expect(JSON.parse(text)).toEqual({
    reply: "Une pharmacie de garde.",
    mocked: false,
    model: "claude-sonnet-bedrock",
  });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const call = fetchMock.mock.calls[0];
  expect(String(call?.[0])).toBe("https://gateway.example.test/v1/messages");
  const init = call?.[1];
  const headers = new Request(call?.[0] ?? "https://invalid.test", init).headers;
  expect(headers.get("authorization")).toBe(`Bearer ${hackathonCanary}`);
  const body = JSON.parse(String(init?.body));
  expect(body).toMatchObject({
    model: "claude-sonnet",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: "De garde" }],
  });
  expect(fetchMock.mock.calls.map((item) => String(item[0]))).not.toContain(openRouterUrl);
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

it("sends a valid OPENROUTER_MODEL and falls back when the format is wrong", async () => {
  const cases = [
    ["openai/gpt-6.1-terra", "openai/gpt-6.1-terra"],
    ["gpt-6.1-terra", "openai/gpt-6.1-terra"],
    ["openai/", "openai/gpt-6.1-terra"],
    ["/gpt-6.1-terra", "openai/gpt-6.1-terra"],
    ["openai/gpt 6.1", "openai/gpt-6.1-terra"],
  ] as const;
  for (const [configured, model] of cases) {
    vi.stubEnv("STEVE_CHAT_LIVE", "1");
    vi.stubEnv("OPENROUTER_API_KEY", canary);
    vi.stubEnv("OPENROUTER_MODEL", configured);
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json({
        choices: [{ message: { content: "D'accord." } }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = await post(history);
    expect(response.status).toBe(200);
    const call = fetchMock.mock.calls.find((item) => String(item[0]) === openRouterUrl);
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ model });
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
  expect(await response.json()).toEqual({ error: "Request too large." });
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
  expect(await response.json()).toEqual({ error: "Invalid JSON." });
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
    error: "Unsupported content type.",
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
    expect(await response.json()).toEqual({ error: "Invalid request." });
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
  expect(payload.reply.startsWith("[Simulated reply] ")).toBe(true);
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
  expect(await over.json()).toEqual({ error: "Invalid request." });
});

it("rejects an invalid message list", async () => {
  const response = await post({ messages: [] });
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Invalid request." });
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
  expect(await response.json()).toEqual({ error: "Invalid JSON." });
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
        const spoken = replyText(payload);
        if (physicalModelKeeps3114(numbers, row.model)) {
          const kept = row.model.includes(call3114Now) ? call3114Now : call3114;
          expect(spoken.startsWith(`${call15Now} ${kept}`), label).toBe(true);
          const rejected = checkEmergencyReply(spoken, numbers);
          expect(rejected.pass, label).toBe(false);
          expect(rejected.reason, label).toBe("numbers");
          expect(
            checkEmergencyReply(spoken, numbers, { optional3114Allowed: true }).pass,
            label,
          ).toBe(true);
        } else {
          const ordered = failureSentences(item.calls).join(" ");
          expect(spoken.startsWith(ordered), label).toBe(true);
          const checked = checkEmergencyReply(spoken, numbers);
          expect(checked.pass, label).toBe(true);
        }
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
    expect(enabledReply).toBe(`${call15Now} ${call3114Now}`);
    expect(enabledReply.startsWith(ordered)).toBe(true);
    expect(checkEmergencyReply(enabledReply, numbers).pass).toBe(false);
    expect(
      checkEmergencyReply(enabledReply, numbers, { optional3114Allowed: true }).pass,
    ).toBe(true);
  } finally {
    mockedEnsure.mockImplementation(realEnsure);
  }
});

it("fails when a physical 15 call drops a model 3114 sentence", async () => {
  const item = triageDecisionCases.find((entry) => entry.name === "emergency-physical");
  const row = item?.replies.find((entry) => entry.name === "keeps-model-3114");
  if (item === undefined || row === undefined || item.calls === undefined) {
    throw new Error("missing keeps-model-3114 row");
  }
  const numbers = item.calls.map((call) => call.number);
  const guarded = `${call15Now} ${call3114Now}`;
  const mockedEnsure = vi.mocked(ensureEmergencyCalls);
  const realEnsure = mockedEnsure.getMockImplementation();
  if (realEnsure === undefined) {
    throw new Error("ensureEmergencyCalls mock");
  }
  mockedEnsure.mockImplementation(() => call15Now);
  try {
    const droppedMock = triageFetch(() => Response.json(classifyPayload(item)), row.model);
    vi.stubGlobal("fetch", droppedMock);
    const dropped = await post(history);
    expect(dropped.status).toBe(200);
    expect(replyText(await dropped.json()).startsWith(guarded)).toBe(false);

    mockedEnsure.mockImplementation(realEnsure);
    const keptMock = triageFetch(() => Response.json(classifyPayload(item)), row.model);
    vi.stubGlobal("fetch", keptMock);
    const kept = await post(history);
    expect(kept.status).toBe(200);
    const keptReply = replyText(await kept.json());
    expect(keptReply).toBe(row.reply);
    expect(keptReply.startsWith(guarded)).toBe(true);
    expect(checkEmergencyReply(keptReply, numbers).pass).toBe(false);
    expect(
      checkEmergencyReply(keptReply, numbers, { optional3114Allowed: true }).pass,
    ).toBe(true);
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
      { role: "assistant", content: "Call 15 now. Call 3114 now." },
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

const mainStateRows: readonly { readonly label: string; readonly users: readonly string[] }[] = [
  { label: "short history", users: ["J'ai mal.", "Depuis ce matin."] },
  { label: "two 4000-character user turns", users: ["a".repeat(4000), "b".repeat(4000)] },
  {
    label: "earlier emergency signal, later turn long enough to drop it under a cap",
    users: ["J'ai une douleur thoracique intense.", "c".repeat(4000), "d".repeat(4000)],
  },
  {
    label: "emergency signal followed by a long turn",
    users: ["Je veux me suicider.", "e".repeat(4000)],
  },
  {
    label: "seven user turns, main drops the oldest via the 6-turn window",
    users: ["un", "deux", "trois", "quatre", "cinq", "six", "sept"],
  },
];

it.each(mainStateRows)("sends main's Jev state for $label", async ({ users }) => {
  const fetchMock = triageFetch(() => Response.json(jevBody("self-care", 0.7, "none")));
  vi.stubGlobal("fetch", fetchMock);
  const messages = users.flatMap((content) => [
    { role: "user", content },
    { role: "assistant", content: "Je vous écoute." },
  ]);
  messages.pop();
  const response = await post({ messages });
  expect(response.status).toBe(200);
  const sent: unknown = JSON.parse(String(jevFetchCall(fetchMock)?.[1]?.body));
  expect(isRecord(sent)).toBe(true);
  if (!isRecord(sent)) {
    return;
  }
  expect(sent["state"]).toBe(users.slice(-6).join("\n"));
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

it("keeps the specialty when the patient replies with a postal code and refines the sector", async () => {
  vi.stubEnv("STEVE_CHAT_LIVE", "");
  const messages = [
    { role: "user", content: "Tu peux me trouver un dermatologue près de chez moi ?" },
  ];
  const clarification = await post({ messages });
  expect(await clarification.json()).toMatchObject({ reply: "Dans quel code postal dois-je chercher ?" });
  messages.push(
    { role: "assistant", content: "Dans quel code postal dois-je chercher ?" },
    { role: "user", content: "75011" },
    { role: "assistant", content: "J’ai trouvé trois praticiens pour ces critères." },
    { role: "user", content: "Seulement en secteur 1" },
  );
  const refined = await post({ messages });
  expect(await refined.json()).toEqual({ directory: {
    specialty: "Dermatologie et vénéréologie", postalCode: "75011", conventionnement: "secteur-1",
  } });
});

it("keeps emergency call actions when a message also matches a directory search", async () => {
  const fetchMock = triageFetch(() => Response.json(jevBody("emergency", 0.99, "physical")));
  vi.stubGlobal("fetch", fetchMock);
  const response = await post({
    messages: [{ role: "user", content: "Trouve-moi un dermatologue près du 75011." }],
  });
  expect(await response.json()).toMatchObject({ calls: [{ type: "call", number: "15" }] });
});

const directoryAfterEmergency = {
  messages: [
    { role: "user", content: "J’ai une forte douleur dans la poitrine." },
    { role: "assistant", content: call15Now },
    { role: "user", content: "Trouve-moi un cardiologue près du 75011." },
  ],
};

it.each([
  { reason: "timeout", jev: () => { throw new DOMException("Timed out", "TimeoutError"); } },
  { reason: "http", jev: () => new Response(null, { status: 503 }) },
  { reason: "network", jev: () => { throw new TypeError("network down"); } },
  { reason: "malformed", jev: () => Response.json({ answers: {} }) },
  { reason: "missing-key", jev: undefined },
])("keeps the emergency history on a directory turn after Jev $reason", async ({ reason, jev }) => {
  const fetchMock = triageFetch(jev ?? (() => { throw new Error("unexpected Jev call"); }), call15Now);
  if (jev === undefined) vi.stubEnv("JEV_API_KEY", "");
  vi.stubGlobal("fetch", fetchMock);

  const response = await post(directoryAfterEmergency);

  expect(await response.json()).toEqual({
    reply: call15Now,
    mocked: false,
    model: "openai/gpt-6.1-terra",
  });
  expect(providerMessages(fetchMock)).toEqual([
    { role: "system", content: systemPrompt },
    ...directoryAfterEmergency.messages,
  ]);
  expect(readTriageLog()).toEqual([{ cause: "no-triage", reason }]);
});

it("keeps the existing chat fallback when live mode lacks an OpenRouter key", async () => {
  armLive();
  vi.stubEnv("OPENROUTER_API_KEY", "");
  const response = await post(directoryAfterEmergency);
  expect(await response.json()).toMatchObject({ model: "mock", mocked: true });
});

it.each(["consult", "self-care"] as const)("returns directory filters after live triage classifies %s", async (label) => {
  const fetchMock = triageFetch(() => Response.json(jevBody(label, 0.95, "none")));
  vi.stubGlobal("fetch", fetchMock);

  const response = await post({
    messages: [{ role: "user", content: "Trouve-moi un dermatologue près du 75011." }],
  });

  expect(await response.json()).toEqual({
    directory: { specialty: "Dermatologie et vénéréologie", postalCode: "75011" },
  });
  expect(jevFetchCall(fetchMock)).toBeDefined();
  expect(openRouterCall(fetchMock)).toBeUndefined();
});

it("lets the model ask for clarification when live triage needs more information", async () => {
  const clarification = "Depuis quand ressens-tu cette douleur ?";
  const fetchMock = triageFetch(() => Response.json(jevBody("need-info", 0.95, "none")), clarification);
  vi.stubGlobal("fetch", fetchMock);

  const response = await post(directoryAfterEmergency);

  expect(await response.json()).toEqual({
    reply: clarification,
    mocked: false,
    model: "openai/gpt-6.1-terra",
  });
  expect(providerMessages(fetchMock).slice(-3)).toEqual(directoryAfterEmergency.messages);
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
  if (calls === undefined) {
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

function physicalModelKeeps3114(
  numbers: readonly ("15" | "3114")[],
  model: string,
): boolean {
  return (
    numbers.length === 1 &&
    numbers[0] === "15" &&
    (model.includes(call3114Now) || model.includes(call3114))
  );
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
