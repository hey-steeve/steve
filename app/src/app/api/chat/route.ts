import type { Handoff, Turn } from "@steve/shared";
import {
  classify,
  triageTurn,
  type ClassifyResult,
  type EmergencyCalls,
  type TriageDecision,
} from "@steve/triage";
import { readCompletion } from "../../../chat/completion";
import {
  chatRequestLimits,
  mockChatResult,
  parseChatMessages,
  type ChatHttpResult,
  type ChatTurn,
} from "../../../chat/request";
import { systemPrompt } from "./system-prompt";
import { recordTriageLog } from "./triage-log";

const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
const defaultModel = "openai/gpt-6.1-terra";
const maxCompletionTokens = 1024;
const upstreamTimeoutMs = 30_000;
const openRouterReasoning = {
  effort: "low",
  exclude: true,
} as const;
const upstreamError = "Le service de chat est indisponible. Réessayez.";
const invalidJsonError = "JSON invalide.";
const tooLargeError = "Requête trop volumineuse.";
const unsupportedTypeError = "Type de contenu non pris en charge.";

export async function POST(request: Request): Promise<Response> {
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return Response.json({ error: unsupportedTypeError }, { status: 415 });
  }
  const read = await readChatBody(request);
  if (read.kind === "too-large") {
    return Response.json({ error: tooLargeError }, { status: 413 });
  }
  if (read.kind === "invalid") {
    return Response.json({ error: invalidJsonError }, { status: 400 });
  }
  const messages = parseChatMessages(read.body);
  if (messages === null) {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (!liveChatEnabled()) {
    const result = mockChatResult(messages);
    return Response.json(result.body, { status: result.status });
  }
  const apiKey = envString("OPENROUTER_API_KEY");
  if (apiKey === undefined) {
    const result = mockChatResult(messages);
    return Response.json(result.body, { status: result.status });
  }
  const triage = await triageLive(messages);
  const result = await completeWithOpenRouter(messages, apiKey, requestedModel(), triage);
  return Response.json(result.body, { status: result.status });
}

type LiveTriage = {
  readonly guidance?: string;
  readonly calls?: EmergencyCalls;
};

async function triageLive(messages: readonly ChatTurn[]): Promise<LiveTriage> {
  const jevKey = envString("JEV_API_KEY");
  if (jevKey === undefined) {
    recordTriageLog({ cause: "no-triage", reason: "missing-key" });
    return {};
  }
  const jevModel = envString("JEV_MODEL");
  const decision = await triageTurn({
    handoff: chatHandoff(messages),
    classify: async ({ state }) => {
      try {
        const result = await classify({
          state,
          fetch: fetchWithBearer(jevKey),
          ...(jevModel === undefined ? {} : { model: jevModel }),
        });
        logClosed(result);
        return result;
      } catch {
        recordTriageLog({ cause: "no-triage", reason: "throw" });
        throw new Error("triage");
      }
    },
  });
  return triageFields(decision);
}

function triageFields(decision: TriageDecision): LiveTriage {
  const guidance = "guidance" in decision ? decision.guidance?.text : undefined;
  const calls = decision.calls;
  if (guidance !== undefined && calls !== undefined) {
    return { guidance, calls };
  }
  if (guidance !== undefined) {
    return { guidance };
  }
  if (calls !== undefined) {
    return { calls };
  }
  return {};
}

function chatHandoff(messages: readonly ChatTurn[]): Handoff<readonly Turn[]> {
  const sessionId = "chat";
  const turns: Turn[] = [];
  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }
    turns.push({
      sessionId,
      turnId: `turn-${turns.length}`,
      channel: "text",
      text: message.content,
    });
  }
  const current = turns[turns.length - 1];
  return {
    sessionId,
    turnId: current === undefined ? "turn-empty" : current.turnId,
    target: "triage",
    intent: "care_request",
    data: turns,
  };
}

function fetchWithBearer(apiKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${apiKey}`);
    return fetch(input, { ...init, headers });
  };
}

function logClosed(result: ClassifyResult): void {
  if (result.label !== "need-info") {
    return;
  }
  switch (result.reason) {
    case "http":
    case "timeout":
    case "network":
    case "malformed":
      recordTriageLog({ cause: "no-triage", reason: result.reason });
      return;
    case "model":
    case "below-threshold":
    case "no-channel":
      return;
  }
}

async function completeWithOpenRouter(
  messages: readonly ChatTurn[],
  apiKey: string,
  model: string,
  triage: LiveTriage,
): Promise<ChatHttpResult> {
  try {
    const response = await fetch(openRouterUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Steve",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxCompletionTokens,
        reasoning: openRouterReasoning,
        messages: providerMessages(messages, triage.guidance),
      }),
      signal: AbortSignal.timeout(upstreamTimeoutMs),
    });
    if (!response.ok) {
      return modelFailure(triage);
    }
    const payload: unknown = await response.json();
    const completion = readCompletion(payload, model);
    if (completion === null) {
      return modelFailure(triage);
    }
    const body = {
      reply: completion.reply,
      mocked: false,
      model: completion.model,
    };
    if (triage.calls === undefined) {
      return { status: 200, body };
    }
    return { status: 200, body: { ...body, calls: triage.calls } };
  } catch {
    return modelFailure(triage);
  }
}

function modelFailure(triage: LiveTriage): ChatHttpResult {
  const calls = triage.calls;
  if (calls === undefined) {
    return { status: 502, body: { error: upstreamError } };
  }
  const spoken = calls.map((call) => `Appelle le ${call.number} maintenant.`).join(" ");
  return {
    status: 502,
    body: {
      error: `${spoken} ${upstreamError}`,
      calls,
    },
  };
}

function providerMessages(messages: readonly ChatTurn[], guidance: string | undefined) {
  const head: { role: "system"; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];
  if (guidance !== undefined) {
    head.push({ role: "system", content: guidance });
  }
  return [...head, ...messages];
}

type ChatBodyRead =
  | { readonly kind: "ok"; readonly body: unknown }
  | { readonly kind: "too-large" }
  | { readonly kind: "invalid" };

async function readChatBody(request: Request): Promise<ChatBodyRead> {
  const bytes = await readCappedBytes(request, chatRequestLimits.maxBodyBytes);
  if (bytes === "too-large") {
    return { kind: "too-large" };
  }
  if (bytes === "invalid") {
    return { kind: "invalid" };
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { kind: "invalid" };
  }
  try {
    return { kind: "ok", body: JSON.parse(text) };
  } catch {
    return { kind: "invalid" };
  }
}

async function readCappedBytes(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array | "too-large" | "invalid"> {
  const stream = request.body;
  if (stream === null) {
    return new Uint8Array();
  }
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      let next: ReadableStreamReadResult<Uint8Array>;
      try {
        next = await reader.read();
      } catch {
        return "invalid";
      }
      if (next.done) {
        break;
      }
      const value = next.value;
      if (value === undefined || value.byteLength === 0) {
        continue;
      }
      if (total + value.byteLength > maxBytes) {
        await reader.cancel();
        return "too-large";
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function requestedModel(): string {
  return envString("OPENROUTER_MODEL") ?? defaultModel;
}

function isJsonContentType(header: string | null): boolean {
  if (header === null) {
    return false;
  }
  const media = header.split(";")[0];
  if (media === undefined) {
    return false;
  }
  return media.trim().toLowerCase() === "application/json";
}

function liveChatEnabled(): boolean {
  const value: unknown = Reflect.get(process.env, "STEVE_CHAT_LIVE");
  return value === "1";
}

function envString(name: string): string | undefined {
  const value: unknown = Reflect.get(process.env, name);
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return trimmed;
}
