import {
  type EmergencyCall,
  countFinishedLoneSentences,
  ensureEmergencyCalls,
  joinPrefix,
  normalizeEmergencyText,
  opensWithCallBlocks,
  withoutFinishedLoneSentences,
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
// After trailing quotes, markdown wrappers and spaces, only a letter, a digit or
// a comma leaves the line open; a terminator or a colon (a label) finishes it.
const wrappers = /["'»”*_\s]+$/u;
const opensLine = /[\p{L}\p{N},]$/u;
const atxHeading = /^#{1,6}(?:\s|$)/u;

const listMarker = /^(?:[-*+]|\d+[.)])(?:\s|$)/u;

const lowercaseStart = /^\p{Ll}/u;

// An ATX heading, a markdown list item whose next line does not continue it
// mid-sentence (lowercase start), and a line ending with ")" (nested or stray)
// are finished.
function isOpenLine(line: string, next: string): boolean {
  const trimmed = line.trim();
  if (atxHeading.test(trimmed)) {
    return false;
  }
  if (listMarker.test(trimmed) && !lowercaseStart.test(next.trim())) {
    return false;
  }
  const stripped = line.replace(wrappers, "");
  return !stripped.endsWith(")") && opensLine.test(stripped);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function countMatches(pattern: RegExp, text: string): number {
  return [...text.matchAll(pattern)].length;
}

function countOccurrences(text: string, part: string): number {
  return countMatches(new RegExp(escapeRegExp(part), "gu"), text);
}

// A line that stops without sentence punctuation continues on the next
// non-empty line. A cut is when fewer tail+head adjacencies survive in the
// rewrite while the tail or the head still shows up more often than they do:
// the continuation was moved away from, or dropped after, the line's last sentence.
function cutsSentence(original: string, rewritten: string): boolean {
  const pairs = original
    .split(/\r\n|[\n\r\u2028\u2029]/u)
    .map((raw) => ({ raw, line: normalizeEmergencyText(raw) }))
    .filter(({ line }) => line.trim().length > 0);
  const lines = pairs.map(({ line }) => line);
  const source = normalizeEmergencyText(original);
  const kept = normalizeEmergencyText(rewritten);
  for (let index = 0; index + 1 < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const next = lines[index + 1] ?? "";
    // Normalization lowercases, so the continuation test reads the raw line.
    const rawNext = pairs[index + 1]?.raw ?? "";
    const tail = line.slice(line.search(/[^.!?…]*$/u)).trim();
    const nextEnd = next.search(ender);
    const head = nextEnd < 0 ? next.trim() : next.slice(0, nextEnd + 1).trim();
    if (!isOpenLine(line, rawNext) || tail.length === 0 || head.length === 0) {
      continue;
    }
    const joined = new RegExp(`${escapeRegExp(tail)}\\s*${escapeRegExp(head)}`, "gu");
    const adjacentBefore = countMatches(joined, source);
    const adjacentAfter = countMatches(joined, kept);
    if (
      adjacentAfter < adjacentBefore &&
      (countOccurrences(kept, tail) > adjacentAfter ||
        countOccurrences(kept, head) > adjacentAfter)
    ) {
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
  const keepsOpening = opensWithCallBlocks(reply, calls);
  const original = keepsOpening ? reply : joinPrefix(opening, reply);
  const render = (only: ReadonlySet<number>): string =>
    keepsOpening
      ? withoutFinishedLoneSentences(reply, calls, true, only)
      : joinPrefix(opening, withoutFinishedLoneSentences(reply, calls, false, only));
  // Drop each finished lone sentence on its own merit: one whose removal would
  // cut a sentence stays, the others still go.
  const total = countFinishedLoneSentences(reply, calls, keepsOpening);
  const accepted = new Set<number>();
  for (let ordinal = 0; ordinal < total; ordinal += 1) {
    const trial = new Set(accepted).add(ordinal);
    if (acceptsCleanup(reply, withoutOpening(render(trial), opening))) {
      accepted.add(ordinal);
    }
  }
  return accepted.size === 0 ? original : render(accepted);
}

// The finished-sentence cleanup must neither change the 112 reading nor cut a sentence.
function acceptsCleanup(reply: string, cleaned: string): boolean {
  return read112(cleaned) === read112(reply) && !cutsSentence(reply, cleaned);
}
