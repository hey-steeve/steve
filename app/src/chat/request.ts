export const chatRequestLimits = {
  maxBodyBytes: 1_048_576,
  maxMessages: 40,
  maxMessageChars: 4_000,
} as const;

export interface ChatTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

export type ChatHttpResult =
  | {
      readonly status: 200;
      readonly body: {
        readonly reply: string;
        readonly mocked: boolean;
        readonly model: string;
      };
    }
  | {
      readonly status: 400;
      readonly body: { readonly error: string };
    }
  | {
      readonly status: 502;
      readonly body: { readonly error: string };
    };

export type ChatReply =
  | {
      readonly kind: "ok";
      readonly reply: string;
      readonly mocked: boolean;
      readonly model: string;
    }
  | { readonly kind: "invalid" };

const mockPrefix = "[Réponse simulée] ";
const mockModel = "mock";

export function parseChatMessages(body: unknown): readonly ChatTurn[] | null {
  if (!isRecord(body)) {
    return null;
  }
  const messages = field(body, "messages");
  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > chatRequestLimits.maxMessages
  ) {
    return null;
  }
  const turns: ChatTurn[] = [];
  for (const item of messages) {
    const turn = parseTurn(item);
    if (turn === null) {
      return null;
    }
    turns.push(turn);
  }
  if (!turns.some((turn) => turn.role === "user")) {
    return null;
  }
  return turns;
}

export function mockChatResult(messages: readonly ChatTurn[]): ChatHttpResult {
  return {
    status: 200,
    body: { reply: mockReply(messages), mocked: true, model: mockModel },
  };
}

export function chatHttpResult(body: unknown): ChatHttpResult {
  const messages = parseChatMessages(body);
  if (messages === null) {
    return { status: 400, body: { error: "Requête invalide." } };
  }
  return mockChatResult(messages);
}

export function toProviderMessages(
  messages: readonly {
    readonly role: "user" | "agent" | "error";
    readonly content: string;
  }[],
): readonly ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const message of messages) {
    if (message.role === "error") {
      continue;
    }
    turns.push({
      role: message.role === "user" ? "user" : "assistant",
      content: message.content,
    });
  }
  if (turns.length <= chatRequestLimits.maxMessages) {
    return turns;
  }
  return turns.slice(turns.length - chatRequestLimits.maxMessages);
}

export function parseChatReply(body: unknown): ChatReply {
  if (!isRecord(body)) {
    return { kind: "invalid" };
  }
  const reply = field(body, "reply");
  const mocked = field(body, "mocked");
  const model = field(body, "model");
  if (
    typeof reply !== "string" ||
    reply.length === 0 ||
    typeof mocked !== "boolean" ||
    typeof model !== "string" ||
    model.length === 0
  ) {
    return { kind: "invalid" };
  }
  return { kind: "ok", reply, mocked, model };
}

function parseTurn(item: unknown): ChatTurn | null {
  if (!isRecord(item)) {
    return null;
  }
  const role = field(item, "role");
  const content = field(item, "content");
  if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
    return null;
  }
  const trimmed = content.trim();
  if (trimmed.length === 0 || trimmed.length > chatRequestLimits.maxMessageChars) {
    return null;
  }
  return { role, content: trimmed };
}

function mockReply(messages: readonly ChatTurn[]): string {
  let asked = "";
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const turn = messages[index];
    if (turn !== undefined && turn.role === "user") {
      asked = turn.content;
      break;
    }
  }
  return `${mockPrefix}Vous avez demandé : ${asked}. Je ne pose pas de diagnostic. En cas d'urgence, appelez le 15.`;
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
