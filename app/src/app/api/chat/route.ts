import {
  chatRequestLimits,
  mockChatResult,
  parseChatMessages,
  type ChatHttpResult,
  type ChatTurn,
} from "../../../chat/request";

const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
const defaultModel = "google/gemini-3.8-flash";
const maxCompletionTokens = 1024;
const upstreamTimeoutMs = 30_000;
const upstreamError = "Le service de chat est indisponible. Réessayez.";
const invalidJsonError = "JSON invalide.";
const tooLargeError = "Requête trop volumineuse.";
const unsupportedTypeError = "Type de contenu non pris en charge.";
const systemPrompt =
  "Tu es Steve, un assistant qui aide à organiser des démarches de santé. Tu n'es pas médecin, tu ne poses pas de diagnostic, et en cas d'urgence tu dis d'appeler le 15. Réponds brièvement en français.";

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
  if (envString("STEVE_CHAT_LIVE") !== "1") {
    const result = mockChatResult(messages);
    return Response.json(result.body, { status: result.status });
  }
  const apiKey = envString("OPENROUTER_API_KEY");
  if (apiKey === undefined) {
    const result = mockChatResult(messages);
    return Response.json(result.body, { status: result.status });
  }
  const result = await completeWithOpenRouter(messages, apiKey, requestedModel());
  return Response.json(result.body, { status: result.status });
}

async function completeWithOpenRouter(
  messages: readonly ChatTurn[],
  apiKey: string,
  model: string,
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
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
      signal: AbortSignal.timeout(upstreamTimeoutMs),
    });
    if (!response.ok) {
      return { status: 502, body: { error: upstreamError } };
    }
    const payload: unknown = await response.json();
    const completion = readCompletion(payload, model);
    if (completion === null) {
      return { status: 502, body: { error: upstreamError } };
    }
    return {
      status: 200,
      body: {
        reply: completion.reply,
        mocked: false,
        model: completion.model,
      },
    };
  } catch {
    return { status: 502, body: { error: upstreamError } };
  }
}

function readCompletion(
  payload: unknown,
  requested: string,
): { readonly reply: string; readonly model: string } | null {
  if (!isRecord(payload)) {
    return null;
  }
  const choices = field(payload, "choices");
  if (!Array.isArray(choices)) {
    return null;
  }
  const first: unknown = choices[0];
  if (!isRecord(first)) {
    return null;
  }
  const message = field(first, "message");
  if (!isRecord(message)) {
    return null;
  }
  const content = field(message, "content");
  if (typeof content !== "string" || content.trim().length === 0) {
    return null;
  }
  const modelField = field(payload, "model");
  const model =
    typeof modelField === "string" && modelField.length > 0
      ? modelField
      : requested;
  return { reply: content, model };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(record: Record<string, unknown>, key: string): unknown {
  if (!Object.hasOwn(record, key)) {
    return undefined;
  }
  return Reflect.get(record, key);
}
