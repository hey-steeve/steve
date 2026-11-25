import { chatRequestLimits, clampText } from "../../../chat/request.ts";
import {
  emergencySafetySentence,
  ensureEmergencyCalls,
  normalizeEmergencyText,
  type EmergencyCall,
} from "./emergency-templates.ts";
import { checkEmergencyReply } from "./eval/check.ts";

export const upstreamError = "Le service de chat est indisponible. Réessayez.";

// The 502 text. There is no local emergency detector: the only signal is what Jev returned.
// - Jev flagged an emergency: the full opening for Jev's order, then the unavailability text.
// - Anything else (a 3114 offer, a routine turn, or no triage at all): the safety sentence, then
//   the unavailability text. An offer stays non-urgent here. It never gets "maintenant".
// The text is never the bare unavailability line.
export function fallbackText(emergency: readonly EmergencyCall[] | undefined): string {
  if (emergency !== undefined && emergency.includes("15")) {
    return `${ensureEmergencyCalls("", emergency)} ${upstreamError}`;
  }
  return `${emergencySafetySentence} ${upstreamError}`;
}

// The 200 reply of a non-urgent turn whose model text is only 112 or SOS sentences. Those are
// stripped, nothing is left, and the turn is not a model failure: the person gets the safety
// sentence and keeps the turn's call buttons.
export const strippedReplyFallback = emergencySafetySentence;

// Final gate on an emergency reply. The heuristic stripper can still join or split digits into a
// 112 or lose the order of the numbers. The eval checker is the judge: a reply it rejects is
// replaced by the deterministic opening alone, which the checker accepts for every order.
// An optional 3114 is allowed: a physical 15 turn may keep the model's own 3114 sentence.
export function finalEmergencyReply(
  reply: string,
  numbers: readonly EmergencyCall[],
  check: typeof checkEmergencyReply = checkEmergencyReply,
): string {
  return check(reply, numbers, { optional3114Allowed: true }).pass ? reply : ensureEmergencyCalls("", numbers);
}

// Final gate on a non-urgent reply, after the strip. Only 112 and SOS Médecins are gated here.
// A model's own 15 or 3114 is left to the prompt and the checker, which stay the second net.
export function keepNonUrgentReply(
  kept: string,
  check: typeof checkEmergencyReply = checkEmergencyReply,
): string {
  const { reason } = check(kept, []);
  return reason.includes("112") || reason.includes("SOS") ? strippedReplyFallback : kept;
}

// A 200 reply on a turn with no usable triage (missing key, throw, http, timeout, network, or a
// malformed body). Nobody classified the message, so the reply must carry the safety sentence.
// It goes last: the prompt wants a call sentence from the model first, and a generic line in
// front would push that sentence down. A reply that already holds the sentence is left alone.
// The result stays within the message cap, so the client can send it back as a turn.
export function withSafetySentence(reply: string): string {
  const wanted = normalizeEmergencyText(emergencySafetySentence);
  if (normalizeEmergencyText(reply).includes(wanted)) {
    return reply;
  }
  const room = chatRequestLimits.maxMessageChars - emergencySafetySentence.length - 1;
  const body = fitInto(reply.trim(), room);
  return body.length === 0 ? emergencySafetySentence : `${body} ${emergencySafetySentence}`;
}

function fitInto(text: string, room: number): string {
  if (text.length <= room) {
    return text;
  }
  const cut = clampText(text, room);
  const end = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
  return (end > 0 ? cut.slice(0, end + 1) : cut).trimEnd();
}
