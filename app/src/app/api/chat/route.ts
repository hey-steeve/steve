import {
  chatRequestLimits,
  clampAssistantContent,
  mockChatResult,
  parseChatMessages,
  type ChatHttpResult,
  type ChatTurn,
} from "../../../chat/request";
import { systemPrompt } from "./system-prompt";

const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
const defaultModel = "google/gemini-3.8-flash";
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
        reasoning: openRouterReasoning,
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

export function readCompletion(
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
  const finish = field(first, "finish_reason");
  if (finish === "content_filter" || finish === "error") {
    return null;
  }
  const reply =
    finish === "length" ? lengthReply(content) : clampAssistantContent(content);
  if (reply === null) {
    return null;
  }
  const modelField = field(payload, "model");
  const model =
    typeof modelField === "string" && modelField.length > 0
      ? modelField
      : requested;
  return { reply, model };
}

function lengthReply(content: string): string | null {
  const sentence = completeSentences(content);
  if (sentence === null) {
    return null;
  }
  const bounded = clampAssistantContent(sentence);
  if (bounded === sentence) {
    return bounded;
  }
  return completeSentences(bounded);
}

function completeSentences(content: string): string | null {
  const text = content.trim();
  let end = -1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (char !== "." && char !== "!" && char !== "?") {
      continue;
    }
    if (char === "." && isListMarkerDot(text, index)) {
      continue;
    }
    const closer = closingGuillemet(text, index + 1);
    if (closer !== null) {
      end = closer;
      continue;
    }
    const next = text.charAt(index + 1);
    if (next.length === 0 || next.trim() === "") {
      end = index + 1;
    }
  }
  if (end < 0) {
    return null;
  }
  const sentence = text.slice(0, end).trim();
  if (sentence.length === 0) {
    return null;
  }
  return sentence;
}

function isListMarkerDot(text: string, dotIndex: number): boolean {
  const lineStart = lineStartAt(text, dotIndex);
  const digits = listMarkerDigits(text, lineStart);
  if (digits === null || lineStart + digits.length !== dotIndex) {
    return false;
  }
  return isListItemAt(text, lineStart);
}

function isListItemAt(text: string, lineStart: number): boolean {
  let start: number | null = lineStart;
  let expected: number | null = null;
  while (start !== null) {
    const digits = listMarkerDigits(text, start);
    if (digits === null) {
      return false;
    }
    const value = Number.parseInt(digits, 10);
    if (expected !== null && value !== expected) {
      return false;
    }
    if (value === 1) {
      return true;
    }
    expected = value - 1;
    start = previousNonEmptyLineStart(text, start);
  }
  return false;
}

function listMarkerDigits(text: string, lineStart: number): string | null {
  const line = text.slice(lineStart, lineEndAt(text, lineStart));
  const digits = /^(\d+)\.(?=[^\S\n\r])/.exec(line)?.[1];
  if (digits === undefined) {
    return null;
  }
  return digits;
}

function lineStartAt(text: string, index: number): number {
  let cursor = index;
  while (cursor > 0) {
    const prev = text.charAt(cursor - 1);
    if (prev === "\n" || prev === "\r") {
      break;
    }
    cursor -= 1;
  }
  return cursor;
}

function lineEndAt(text: string, lineStart: number): number {
  let cursor = lineStart;
  while (cursor < text.length) {
    const char = text.charAt(cursor);
    if (char === "\n" || char === "\r") {
      break;
    }
    cursor += 1;
  }
  return cursor;
}

function previousNonEmptyLineStart(text: string, lineStart: number): number | null {
  let start = previousLineStart(text, lineStart);
  while (start !== null) {
    if (text.slice(start, lineEndAt(text, start)).trim().length > 0) {
      return start;
    }
    start = previousLineStart(text, start);
  }
  return null;
}

function previousLineStart(text: string, lineStart: number): number | null {
  if (lineStart === 0) {
    return null;
  }
  let cursor = lineStart - 1;
  if (text.charAt(cursor) === "\n") {
    cursor -= 1;
  }
  if (cursor >= 0 && text.charAt(cursor) === "\r") {
    cursor -= 1;
  }
  if (cursor < 0) {
    return null;
  }
  const char = text.charAt(cursor);
  if (char === "\n" || char === "\r") {
    return cursor + 1;
  }
  return lineStartAt(text, cursor);
}

function closingGuillemet(text: string, from: number): number | null {
  let cursor = from;
  while (cursor < text.length && text.charAt(cursor).trim() === "") {
    cursor += 1;
  }
  if (text.charAt(cursor) !== "»") {
    return null;
  }
  return cursor + 1;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(record: Record<string, unknown>, key: string): unknown {
  if (!Object.hasOwn(record, key)) {
    return undefined;
  }
  return Reflect.get(record, key);
}
