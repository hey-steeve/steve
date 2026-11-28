import type { Handoff, Turn } from "@steve/shared";
import type { EmergencyCalls, TriageDecision } from "@steve/triage";
import { readCompletion } from "../../../chat/completion";
import { triageTraceHeader } from "../../../chat/thinking-trace";
import {
  chatRequestLimits,
  mockChatResult,
  parseChatMessages,
  type ChatHttpResult,
  type ChatTurn,
} from "../../../chat/request";
import { envString } from "../env";
import { triageWithJev } from "../jev";
import { directoryIntent } from "./directory-intent";
import { call3114Now, ensureEmergencyCalls } from "./emergency-templates";
import { openRouterModel } from "./openrouter-model";
import { ensureEmergencyCallsSafe } from "./safe-emergency-calls";
import { systemPrompt } from "./system-prompt";

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
  const live = liveChatEnabled();
  if (!live) {
    const directory = directoryReply(messages);
    if (directory !== undefined) return directory;
  }
  const apiKey = live ? envString("OPENROUTER_API_KEY") : undefined;
  if (apiKey === undefined) {
    const result = mockChatResult(messages);
    return Response.json(result.body, { status: result.status });
  }
  const decision = await triageWithJev(chatHandoff(messages));
  const triage = decision === null ? {} : triageFields(decision);
  if (canSearchDirectory(decision)) {
    const directory = directoryReply(messages);
    if (directory !== undefined) return withTriageTrace(directory, decision);
  }
  const result = await completeWithOpenRouter(messages, apiKey, requestedModel(), triage);
  return withTriageTrace(Response.json(result.body, { status: result.status }), decision);
}

// Tells the app which triage label this turn got, so its thinking trace shows
// the urgency check only when that check really ran. Label only.
function withTriageTrace(response: Response, decision: TriageDecision | null): Response {
  if (decision !== null) {
    response.headers.set(triageTraceHeader, decision.label);
  }
  return response;
}

function directoryReply(messages: readonly ChatTurn[]): Response | undefined {
  const intent = directoryIntent(messages);
  if (intent === undefined) return;
  if (typeof intent === "string") {
    return Response.json({ reply: intent, model: "directory", mocked: false });
  }
  return Response.json({ directory: intent });
}

type LiveTriage = {
  readonly guidance?: string;
  readonly calls?: EmergencyCalls;
};

function canSearchDirectory(decision: TriageDecision | null): boolean {
  return (decision?.label === "consult" || decision?.label === "self-care") &&
    decision.calls === undefined;
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
    const calls = triage.calls;
    const reply =
      calls === undefined
        ? completion.reply
        : ensureEmergencyCallsSafe(
            completion.reply,
            calls.map((call) => call.number),
          );
    const body = {
      reply,
      mocked: false,
      model: completion.model,
    };
    if (calls === undefined) {
      return { status: 200, body };
    }
    return { status: 200, body: { ...body, calls } };
  } catch {
    return modelFailure(triage);
  }
}

function modelFailure(triage: LiveTriage): ChatHttpResult {
  const calls = triage.calls;
  if (calls === undefined) {
    return { status: 502, body: { error: upstreamError } };
  }
  const numbers = calls.map((call) => call.number);
  const spoken = numbers.includes("15") ? ensureEmergencyCalls("", numbers) : call3114Now;
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
  return openRouterModel(envString("OPENROUTER_MODEL"), defaultModel);
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
