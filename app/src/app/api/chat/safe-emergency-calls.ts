import {
  type EmergencyCall,
  ensureEmergencyCalls,
  joinPrefix,
  normalizeEmergencyText,
  opensWithCallBlocks,
} from "./emergency-templates";
import { detectEmergencyNumbers } from "./eval/check";

// Lives apart from emergency-templates.ts because check.ts already imports it:
// this module imports both, so the dependency stays one-way.

function count112(text: string): number {
  return detectEmergencyNumbers(text).spans.filter((span) => span.kind === "112").length;
}

function withoutOpening(text: string, opening: string): string {
  return text.startsWith(opening) ? text.slice(opening.length) : text;
}

// A line that stops without sentence punctuation continues on the next line.
// If its last sentence is gone from the rewrite while the next line stays, the
// rewrite cut a sentence in half.
function cutsSentence(original: string, rewritten: string): boolean {
  const lines = original.split(/\r\n|[\n\r\u2028\u2029]/u);
  const kept = normalizeEmergencyText(rewritten);
  for (let index = 0; index + 1 < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const next = normalizeEmergencyText(lines[index + 1] ?? "");
    const tail = normalizeEmergencyText(line.slice(line.search(/[^.!?…]*$/u)));
    const open = !/[.!?…]["'»”)\s]*$/u.test(line.trim());
    if (open && tail.length > 0 && next.length > 0 && !kept.includes(tail) && kept.includes(next)) {
      return true;
    }
  }
  return false;
}

export function ensureEmergencyCallsSafe(
  reply: string,
  calls: readonly EmergencyCall[],
): string {
  const rewritten = ensureEmergencyCalls(reply, calls);
  if (rewritten === reply) {
    return reply;
  }
  const opening = ensureEmergencyCalls("", calls);
  const body = withoutOpening(rewritten, opening);
  if (count112(body) === count112(reply) && !cutsSentence(reply, body)) {
    return rewritten;
  }
  return opensWithCallBlocks(reply, calls) ? reply : joinPrefix(opening, reply);
}
