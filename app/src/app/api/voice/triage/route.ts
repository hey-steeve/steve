import type { Handoff, Turn } from "@steve/shared";
import { JEV_TIMEOUT_MS, type TriageDecision } from "@steve/triage";
import { triageWithJev } from "../../jev";
import { readVoiceTriageRequest } from "./request";

export type VoiceTriageReply = {
  readonly turnId: Turn["turnId"];
  readonly decision: TriageDecision;
};

const noStore = { "Cache-Control": "no-store" } as const;
const failClosed: TriageDecision = { label: "need-info" };
const deadlineMs = JEV_TIMEOUT_MS + 500;
const errors = {
  400: "Requête invalide.",
  413: "Requête trop volumineuse.",
  415: "Type de contenu non pris en charge.",
} as const;

export async function POST(request: Request): Promise<Response> {
  const parsed = await readVoiceTriageRequest(request);
  if (!parsed.ok) {
    return Response.json({ error: errors[parsed.status] }, { status: parsed.status, headers: noStore });
  }
  const turnId = parsed.request.current.turnId;
  const decision = voiceLive() ? await triageClosed(parsed.handoff) : failClosed;
  const reply: VoiceTriageReply = { turnId, decision };
  return Response.json(reply, { status: 200, headers: noStore });
}

function voiceLive(): boolean {
  const value: unknown = Reflect.get(process.env, "STEVE_VOICE_LIVE");
  return value === "1";
}

async function triageClosed(handoff: Handoff<readonly Turn[]>): Promise<TriageDecision> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), deadlineMs);
  });
  try {
    const decision = await Promise.race([triageWithJev(handoff).catch(() => null), deadline]);
    return decision ?? failClosed;
  } finally {
    clearTimeout(timer);
  }
}
