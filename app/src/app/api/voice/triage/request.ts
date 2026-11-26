import type { Handoff, Turn } from "@steve/shared";

export type VoiceTurn = Turn & { readonly channel: "voice" };

export type VoiceDecision = {
  readonly turnId: string;
  readonly label: "emergency" | "consult" | "self-care" | "need-info";
};

export type VoiceTriageRequest = {
  readonly current: VoiceTurn;
  readonly previous: readonly Turn[];
  // App-only: Jev labels the client recorded for earlier turns, by turnId.
  readonly decisions?: readonly VoiceDecision[];
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
  maxStateChars: 8_000,
  stateTurns: 6,
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
    data: fitStateBudget([...request.previous, request.current], request.decisions ?? []),
  };
}

// Voice-only budget. The returned turns are exactly what triageTurn reads: at most
// 6 turns whose texts joined with "\n" stay within the character cap. The current
// turn is kept whole. Earlier turns with a recorded emergency label are kept (their
// text compacted when needed); when they cannot all fit in 6 slots, the earliest ones
// and the most recent ones win. The immediate predecessor is preferred, compacted if
// it must be, but only in slots left after every recorded emergency. Other turns fill the rest, newest first, only while whole. Order is kept.
function fitStateBudget(
  turns: readonly Turn[],
  decisions: readonly VoiceDecision[],
): readonly Turn[] {
  const { stateTurns, maxStateChars } = voiceTriageLimits;
  const emergencies = new Set(
    decisions.filter((d) => d.label === "emergency").map((d) => d.turnId),
  );
  const last = turns.length - 1;
  const predecessor = last - 1;
  const protectedIdx: number[] = [];
  for (let index = 0; index < last; index += 1) {
    if (emergencies.has(turns[index]?.turnId ?? "")) protectedIdx.push(index);
  }
  const kept = new Set<number>([last]);
  const compactable = new Set<number>();
  const slots = stateTurns - 1;
  let chosen = protectedIdx;
  if (protectedIdx.length > slots) {
    const earliest = Math.ceil(slots / 2);
    chosen = [
      ...protectedIdx.slice(0, earliest),
      ...protectedIdx.slice(protectedIdx.length - (slots - earliest)),
    ];
  }
  for (const index of chosen) {
    kept.add(index);
    compactable.add(index);
  }
  const size = (index: number): number => turns[index]?.text.length ?? 0;
  let length = 0;
  for (const index of kept) length += size(index);
  length += kept.size - 1;
  for (let index = last - 1; index >= 0; index -= 1) {
    if (kept.has(index)) continue;
    const cost = size(index) + 1;
    if (kept.size >= stateTurns) break;
    if (length + cost > maxStateChars) {
      if (index === predecessor) {
        kept.add(index);
        compactable.add(index);
        length += cost;
      }
      break;
    }
    length += cost;
    kept.add(index);
  }
  const caps = new Map<number, number>();
  if (length > maxStateChars) {
    let fixed = kept.size - 1;
    for (const index of kept) if (!compactable.has(index)) fixed += size(index);
    let remaining = Math.max(0, maxStateChars - fixed);
    const order = [...compactable].sort((x, y) => size(x) - size(y));
    order.forEach((index, position) => {
      const cap = Math.min(size(index), Math.floor(remaining / (order.length - position)));
      caps.set(index, cap);
      remaining -= cap;
    });
  }
  return turns.flatMap((turn, index) => {
    if (!kept.has(index)) return [];
    const cap = caps.get(index);
    return [cap === undefined || cap >= turn.text.length ? turn : { ...turn, text: turn.text.slice(0, cap) }];
  });
}

export function parseVoiceTriageRequest(body: unknown): VoiceTriageRequest | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const hasDecisions = Object.keys(body).includes("decisions");
  if (!hasExactKeys(body, hasDecisions ? ["current", "previous", "decisions"] : ["current", "previous"])) {
    return null;
  }
  let decisions: VoiceDecision[] | undefined;
  if (hasDecisions) {
    const parsed = parseDecisions(Reflect.get(body, "decisions"));
    if (parsed === null) {
      return null;
    }
    decisions = parsed;
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
  return {
    current: { ...current, channel: "voice" },
    previous: turns,
    ...(decisions ? { decisions } : {}),
  };
}

function isLabel(value: unknown): value is VoiceDecision["label"] {
  return (
    value === "emergency" || value === "consult" || value === "self-care" || value === "need-info"
  );
}

function parseDecisions(value: unknown): VoiceDecision[] | null {
  if (!Array.isArray(value) || value.length > voiceTriageLimits.maxPrevious) {
    return null;
  }
  const out: VoiceDecision[] = [];
  const items: readonly unknown[] = value;
  for (const item of items) {
    if (!hasExactKeys(item, ["turnId", "label"])) {
      return null;
    }
    const turnId: unknown = Reflect.get(item, "turnId");
    const label: unknown = Reflect.get(item, "label");
    if (!isId(turnId) || !isLabel(label)) {
      return null;
    }
    out.push({ turnId, label });
  }
  return out;
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
