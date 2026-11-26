import type { Handoff, Turn } from "@steve/shared";

export type VoiceTurn = Turn & { readonly channel: "voice" };

export type VoiceTriageRequest = {
  readonly current: VoiceTurn;
  readonly previous: readonly Turn[];
};

export type VoiceTriageRequestResult =
  | {
      readonly ok: true;
      readonly request: VoiceTriageRequest;
      readonly handoff: Handoff<readonly Turn[]>;
    }
  | { readonly ok: false; readonly status: 400 | 413 | 415 };

export const voiceTriageLimits = {
  maxBodyBytes: 65_536,
  maxPrevious: 12,
  maxTextChars: 2_000,
  maxIdChars: 128,
} as const;

const decoder = new TextDecoder("utf-8", { fatal: true });

export async function readVoiceTriageRequest(
  request: Request,
): Promise<VoiceTriageRequestResult> {
  const contentType = request.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    return { ok: false, status: 415 };
  }
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > voiceTriageLimits.maxBodyBytes) {
    return { ok: false, status: 413 };
  }
  const bytes = await readCapped(request);
  if (bytes === "too-large") {
    return { ok: false, status: 413 };
  }
  if (bytes === "unreadable") {
    return { ok: false, status: 400 };
  }
  let body: unknown;
  try {
    body = JSON.parse(decoder.decode(bytes));
  } catch {
    return { ok: false, status: 400 };
  }
  const parsed = parseVoiceTriageRequest(body);
  if (parsed === null) {
    return { ok: false, status: 400 };
  }
  return { ok: true, request: parsed, handoff: buildHandoff(parsed) };
}

export function buildHandoff(request: VoiceTriageRequest): Handoff<readonly Turn[]> {
  return {
    sessionId: request.current.sessionId,
    turnId: request.current.turnId,
    target: "triage",
    intent: "care_request",
    data: [...request.previous, request.current],
  };
}

export function parseVoiceTriageRequest(body: unknown): VoiceTriageRequest | null {
  if (!hasExactKeys(body, ["current", "previous"])) {
    return null;
  }
  const current = parseTurn(Reflect.get(body, "current"));
  if (current === null || current.channel !== "voice") {
    return null;
  }
  const previous: unknown = Reflect.get(body, "previous");
  if (!Array.isArray(previous) || previous.length > voiceTriageLimits.maxPrevious) {
    return null;
  }
  const turns: Turn[] = [];
  const items: readonly unknown[] = previous;
  for (const item of items) {
    const turn = parseTurn(item);
    if (turn === null || turn.sessionId !== current.sessionId) {
      return null;
    }
    turns.push(turn);
  }
  return { current: { ...current, channel: "voice" }, previous: turns };
}

async function readCapped(request: Request): Promise<Uint8Array | "too-large" | "unreadable"> {
  if (request.body === null) {
    return new Uint8Array();
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > voiceTriageLimits.maxBodyBytes) {
        try {
          await reader.cancel();
        } catch {
          // Cancellation failure must not change the 413.
        }
        return "too-large";
      }
      chunks.push(value);
    }
  } catch {
    return "unreadable";
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function parseTurn(value: unknown): Turn | null {
  if (!hasExactKeys(value, ["sessionId", "turnId", "channel", "text"])) {
    return null;
  }
  const sessionId: unknown = Reflect.get(value, "sessionId");
  const turnId: unknown = Reflect.get(value, "turnId");
  const channel: unknown = Reflect.get(value, "channel");
  const text: unknown = Reflect.get(value, "text");
  if (!isId(sessionId) || !isId(turnId)) {
    return null;
  }
  if (channel !== "voice" && channel !== "text") {
    return null;
  }
  if (
    typeof text !== "string" ||
    text.trim().length === 0 ||
    text.length > voiceTriageLimits.maxTextChars
  ) {
    return null;
  }
  return { sessionId, turnId, channel, text };
}

function isId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= voiceTriageLimits.maxIdChars
  );
}

function hasExactKeys(value: unknown, keys: readonly string[]): value is object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => own.includes(key));
}
