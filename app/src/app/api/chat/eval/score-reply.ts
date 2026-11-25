import { emergencySafetySentence, normalizeEmergencyText } from "../emergency-templates.ts";

// With no usable triage, the route appends `emergencySafetySentence` to a 200 reply. The checker
// has no expectation that accepts that sentence: it counts its 15 and 3114 as unexpected numbers.
// So the eval scores the reply the model wrote. This cuts exactly one trailing, exact copy of the
// sentence, set apart by whitespace or the start of the text, and nothing else. A reply that ends
// with another 15 sentence, or holds the safety sentence anywhere but last, is scored as written.
// The runner and the saved-run rescore both call it, so a live run and its rescore agree.
export function withoutSafetySentence(reply: string): string {
  const text = reply.trimEnd();
  if (!text.endsWith(emergencySafetySentence)) {
    return reply;
  }
  const head = text.slice(0, text.length - emergencySafetySentence.length);
  // A reply that is only the sentence is the route's fallback, not model text: keep it so the
  // checker fails it instead of passing an empty string.
  if (normalizeEmergencyText(head).replace(/[\p{Cf}\u2800\u3164\u115F\u1160\uFFA0]/gu, "").trim().length === 0 || !/\s$/u.test(head)) {
    return reply;
  }
  return head.trimEnd();
}

// One header line for the run file. Without JEV_API_KEY the route has no triage, so no emergency
// opening is added and a missing opening is not a model failure. The caller passes a boolean, so
// the key value is never read here or printed.
export function triageStatusLine(jevKeyPresent: boolean): string {
  if (jevKeyPresent) {
    return "triage: on (JEV_API_KEY present)";
  }
  return "triage: off (JEV_API_KEY missing), emergency openings are not expected to appear";
}
