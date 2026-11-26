import type { EmergencyCalls } from "@steve/triage";
import {
  call15Now,
  call3114,
  call3114Now,
} from "../app/api/chat/prompt-base.ts";

export type ForcedSentences = readonly [string, ...string[]];

// Same rule as templatesFor in emergency-templates.ts: a 3114 before the first
// 15 gets the "now" wording, a 3114 after a 15 gets the follow-up wording.
export function forcedSentences(calls: EmergencyCalls): ForcedSentences {
  const numbers = calls.map((c) => c.number);
  const first15 = numbers.indexOf("15");
  const sentences = numbers.map((number, index) => {
    if (number === "15") return call15Now;
    return first15 === -1 || index < first15 ? call3114Now : call3114;
  });
  const [first, ...rest] = sentences;
  if (first === undefined) {
    throw new Error("forcedSentences: EmergencyCalls must not be empty");
  }
  return [first, ...rest];
}
