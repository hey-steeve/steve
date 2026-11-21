import {
  mockChatResult,
  parseChatMessages,
  type ChatHttpResult,
  type ChatTurn,
} from "../../../chat/request";

const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
const defaultModel = "openrouter/auto";
const upstreamError = "Le service de chat est indisponible. Réessayez.";
const systemPrompt =
  "Tu es Steve, un assistant qui aide à organiser des démarches de santé. Tu n'es pas médecin, tu ne poses pas de diagnostic, et en cas d'urgence tu dis d'appeler le 15. Réponds brièvement en français.";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON invalide." }, { status: 400 });
  }
  const messages = parseChatMessages(body);
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
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
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

function requestedModel(): string {
  const value = envString("OPENROUTER_MODEL");
  if (value === undefined) {
    return defaultModel;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return defaultModel;
  }
  return trimmed;
}

function envString(name: string): string | undefined {
  const value: unknown = Reflect.get(process.env, name);
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  return value;
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
