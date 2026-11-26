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

// What the 112 detector reads: the sorted span texts, so a swap that keeps the
// count (one erased, one created) still shows.
function read112(text: string): string {
  const { normalized, spans } = detectEmergencyNumbers(text);
  return spans
    .filter((span) => span.kind === "112")
    .map((span) => normalized.slice(span.start, span.end))
    .sort()
    .join("\u0000");
}

function withoutOpening(text: string, opening: string): string {
  return text.startsWith(opening) ? text.slice(opening.length) : text;
}

// Sentence enders after normalization: NFKC folds fullwidth and small-form
// periods, marks and ellipsis characters to these.
const ender = /[.!?…]/u;
const trailing = /[.!?…]["'»”)\s]*$/u;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

// A line that stops without sentence punctuation continues on the next
// non-empty line. A cut is when the start of that continuation stays in the
// rewrite but no longer directly follows the line's last sentence.
function cutsSentence(original: string, rewritten: string): boolean {
  const lines = original
    .split(/\r\n|[\n\r\u2028\u2029]/u)
    .map((line) => normalizeEmergencyText(line))
    .filter((line) => line.trim().length > 0);
  const kept = normalizeEmergencyText(rewritten);
  for (let index = 0; index + 1 < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const next = lines[index + 1] ?? "";
    const tail = line.slice(line.search(/[^.!?…]*$/u)).trim();
    const nextEnd = next.search(ender);
    const head = nextEnd < 0 ? next.trim() : next.slice(0, nextEnd + 1).trim();
    if (trailing.test(line) || tail.length === 0 || head.length === 0) {
      continue;
    }
    const joined = new RegExp(`${escapeRegExp(tail)}\\s*${escapeRegExp(head)}`, "u");
    if (kept.includes(head) && !joined.test(kept)) {
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
  if (read112(body) === read112(reply) && !cutsSentence(reply, body)) {
    return rewritten;
  }
  return opensWithCallBlocks(reply, calls) ? reply : joinPrefix(opening, reply);
}
