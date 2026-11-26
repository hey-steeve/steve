import type { Turn } from "@steve/shared";
import { triageGuidances, type EmergencyCalls, type TriageDecision } from "@steve/triage";
import type { VoiceDecision, VoiceTurn } from "../app/api/voice/triage/request";

export type VoiceTriage = (
  current: VoiceTurn,
  previous: readonly Turn[],
  signal: AbortSignal,
  decisions?: readonly VoiceDecision[],
) => Promise<TriageDecision | null>;

const c15 = { type: "call", number: "15" } as const;
const c3114 = { type: "call", number: "3114" } as const;

function numbers(calls: unknown): string | undefined {
  if (!Array.isArray(calls)) return undefined;
  const list: readonly unknown[] = calls;
  return list
    .map((c) =>
      typeof c === "object" && c !== null && Reflect.get(c, "type") === "call"
        ? String(Reflect.get(c, "number"))
        : "",
    )
    .join(",");
}

function emergencyCalls(calls: unknown): EmergencyCalls | undefined {
  switch (numbers(calls)) {
    case "15":
      return [c15];
    case "3114":
      return [c3114];
    case "15,3114":
      return [c15, c3114];
    case "3114,15":
      return [c3114, c15];
    default:
      return undefined;
  }
}

// Shape guard for the route reply. Anything else is null: the call fails closed.
export function parseDecision(value: unknown): TriageDecision | null {
  if (typeof value !== "object" || value === null) return null;
  const label: unknown = Reflect.get(value, "label");
  const calls: unknown = Reflect.get(value, "calls");
  const raw: unknown = Reflect.get(value, "guidance");
  const text = typeof raw === "object" && raw !== null ? Reflect.get(raw, "text") : undefined;
  const guidance = triageGuidances.find((g) => g.text === text);
  if (raw !== undefined && guidance === undefined) return null;
  if (label === "emergency") {
    const emergency = emergencyCalls(calls);
    return emergency ? { label, calls: emergency } : null;
  }
  if (calls !== undefined && numbers(calls) !== "3114") return null;
  const offer = calls === undefined ? {} : { calls: [c3114] } as const;
  if (label === "consult") return guidance ? { label, guidance, ...offer } : null;
  if (label === "self-care") return { label, ...offer };
  if (label === "need-info") return { label, ...(guidance ? { guidance } : {}), ...offer };
  return null;
}

export const fetchVoiceTriage: VoiceTriage = async (current, previous, signal, decisions) => {
  try {
    const response = await fetch("/api/voice/triage", {
      method: "POST",
      cache: "no-store",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        decisions && decisions.length > 0 ? { current, previous, decisions } : { current, previous },
      ),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;
    if (Reflect.get(body, "turnId") !== current.turnId) return null;
    return parseDecision(Reflect.get(body, "decision"));
  } catch {
    return null;
  }
};
