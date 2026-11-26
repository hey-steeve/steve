export const call15Now =
  "Ce que tu décris peut être grave, et je préfère qu'on ne prenne aucun risque. Appelle le 15 maintenant, ils sont là pour ça, jour et nuit. Je reste avec toi.";
export const call3114Now =
  "Merci de m'en parler, ça compte. Tu n'as pas à traverser ça seul. Tu peux appeler le 3114, c'est gratuit, 24 h/24, et quelqu'un t'écoutera. Je suis là aussi.";
export const call3114 =
  "Tu peux appeler le 3114, c'est gratuit, 24 h/24, et quelqu'un t'écoutera.";

export const callSentences = [
  { sentence: call15Now, numbers: ["15"] },
  { sentence: call3114Now, numbers: ["3114"] },
  { sentence: call3114, numbers: ["3114"] },
] as const;

export const refusal112 = "Je ne te donne pas le 112.";
export const refusalSos = "Je ne te donne pas SOS Médecins.";
export const refusalMedication = "Je ne peux pas te conseiller de médicament.";
export const redirectMedication = "Demande conseil à un pharmacien ou à un médecin.";

export const warningSignLeadIns = ["si ", "s'il "] as const;
export const warningSignTail = ", appelle le 15 maintenant.";

export const breathPersists = "l'essoufflement persiste";
export const breathWorsens = "l'essoufflement s'aggrave";
export const breathEmpire = "l'essoufflement empire";

export const headacheBrutal = "douleur brutale et très intense";
export const headacheWeakness = "faiblesse d'un côté";
export const headacheSpeech = "difficultés à parler";
export const headacheSigns = [headacheBrutal, headacheWeakness, headacheSpeech] as const;

export const silBreath = "a du mal à respirer";
export const silDrowsy = "est somnolent";
export const silBecomesDrowsy = "devient somnolent";
export const warningSignsIl = [silBreath, silDrowsy, silBecomesDrowsy] as const;

export const warningSigns = [
  "mal à respirer",
  "respire mal",
  "respire difficilement",
  "difficulté à respirer",
  "difficulté respiratoire",
  "souffle court",
  "somnolence",
  "somnolent",
  "somnolente",
  "inconscience",
  "inconscient",
  "inconsciente",
  "convulsion",
  "convulse",
  "malaise",
  "cyanose",
  "bleuâtre",
  "bleuâtres",
  "lèvres bleues",
  "lèvre bleue",
  "raideur de la nuque",
  "coup de tonnerre",
  "mal de tête brutal",
  "mal de tête soudain",
  "mal de tête sévère",
  "mal de tête violent",
  "mal à la tête brutal",
  "mal à la tête soudain",
  "douleur thoracique",
  "douleur dans la poitrine",
  "évanouissement",
  "évanoui",
  "difficulté à parler",
  headacheSpeech,
  headacheWeakness,
  "faiblesse du côté",
  "paralysie faciale",
  "bouche qui tombe",
  "visage qui tombe",
  "confusion",
  "confus",
  "perte de connaissance",
  "perte de conscience",
  "essoufflement qui persiste",
  "essoufflement qui s'aggrave",
  "essoufflement qui empire",
  breathPersists,
  breathWorsens,
  breathEmpire,
  "surdose",
  "dépassé la dose",
  "pris trop de comprimés",
  "avalé trop",
  "les taches persistent",
  headacheBrutal,
] as const;

export const warningNegations = [
  "ne",
  "n'",
  "pas",
  "jamais",
  "sans",
  "aucun",
  "aucune",
  "plus",
  "plus tard",
  "si ça",
  "si ca",
  "attends",
  "attend",
  "peut-être",
  "peut-etre",
  "peut être",
  "peut etre",
  "veux",
  "avis",
  "sûrement",
  "surement",
  "rien",
  "quand même",
  "quand meme",
  "inutile",
  "d'abord",
  "demain",
  "seulement",
] as const;

export const warningSignExample = `Si ${breathPersists}${warningSignTail}`;
export const warningSignPair = `Si ${breathPersists} ou ${breathWorsens}${warningSignTail}`;
export const warningSignHeadache = `Si ${headacheBrutal}, ${headacheWeakness} ou ${headacheSpeech}${warningSignTail}`;
export const warningSignExampleIl = `S'il ${silBreath}${warningSignTail}`;
export const warningSignDrowsy = `S'il ${silDrowsy}${warningSignTail}`;
export const warningSignBecomesDrowsy = `S'il ${silBecomesDrowsy}${warningSignTail}`;

export type EmergencyCall = "15" | "3114";

const digitSymbol = new Map<string, string>();

function mapDigitBlock(start: number, count: number): void {
  for (let offset = 0; offset < count; offset += 1) {
    digitSymbol.set(String.fromCodePoint(start + offset), String(offset + 1));
  }
}

mapDigitBlock(0x2776, 9);
mapDigitBlock(0x2780, 9);
mapDigitBlock(0x278a, 9);
mapDigitBlock(0x24f5, 9);

function foldDigitSymbols(text: string): string {
  let folded = "";
  for (const char of text) {
    folded += digitSymbol.get(char) ?? char;
  }
  return folded;
}

function mapDecimalDigits(text: string): string {
  return text.replace(/\p{Nd}/gu, (digit) => {
    const folded = digit.normalize("NFKC");
    if (folded >= "0" && folded <= "9") {
      return folded;
    }
    const code = digit.codePointAt(0) ?? 0;
    let back = 0;
    while (back < 200 && /\p{Nd}/u.test(String.fromCodePoint(code - back - 1))) {
      back += 1;
    }
    return String(back % 10);
  });
}

// One definition each for the apostrophe variants and the line breaks that the
// normalization folds. The prompt number pins read these too, so they cannot drift.
export const apostropheChars = "'\u2018\u2019\u201A\u201B\u2032\u2035\u02BC\u02B9\u00B4`\uFF07";
export const lineBreakChars = "\n\r\u2028\u2029";

const apostrophePattern = new RegExp(`[${apostropheChars}]`, "g");
const lineBreakPattern = new RegExp(`\r\n|[${lineBreakChars}]`, "g");

export function foldApostrophes(text: string): string {
  return text.replace(apostrophePattern, "'");
}

export function normalizeEmergencyText(text: string): string {
  const compat = foldDigitSymbols(text.normalize("NFKC"));
  const stripped = compat.replace(/\p{M}/gu, "").replace(/\p{Cf}/gu, "");
  return foldApostrophes(mapDecimalDigits(stripped))
    .replace(/\u00A0/g, " ")
    .toLowerCase()
    .replace(lineBreakPattern, "\n")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

type CallBlock = {
  readonly text: string;
  readonly sentences: readonly string[];
  readonly is3114: boolean;
};

function callBlock(text: string, is3114: boolean): CallBlock {
  return { text, sentences: splitExact(normalizeEmergencyText(text)), is3114 };
}

const block15Now = callBlock(call15Now, false);
const block3114Now = callBlock(call3114Now, true);
const block3114 = callBlock(call3114, true);
const callBlocks = [block15Now, block3114Now, block3114] as const;
const closedListeningTails = new Set([
  normalizeEmergencyText("Ils t'écoutent"),
  normalizeEmergencyText("Ils t'écoutent."),
  normalizeEmergencyText("Ils t'écoutent jour et nuit."),
]);

// Whole-block match at pieces[start]: each block sentence must equal the next
// non-empty normalized piece, and the last one must end its punctuation run
// ("..." after a block is not the block's "."). Returns the last piece used.
function blockEnd(
  pieces: readonly RawPiece[],
  start: number,
  block: CallBlock,
): number | undefined {
  let cursor = start;
  let last = start;
  for (const expected of block.sentences) {
    while (cursor < pieces.length && pieces[cursor]?.norm === "") {
      cursor += 1;
    }
    if (pieces[cursor]?.norm !== expected) {
      return undefined;
    }
    last = cursor;
    cursor += 1;
  }
  if (pieces[last + 1]?.continuesRun === true) {
    return undefined;
  }
  return last;
}

type BlockMatch = { readonly block: CallBlock; readonly last: number };

function callBlockAt(pieces: readonly RawPiece[], start: number): BlockMatch | undefined {
  for (const block of callBlocks) {
    const last = blockEnd(pieces, start, block);
    if (last !== undefined) {
      return { block, last };
    }
  }
  return undefined;
}

type PieceRange = { readonly first: number; readonly last: number };

// A reply that opens with an exact prefix of a required block that never
// completes (a cut sentence, a missing sentence, a stretched final period).
// The full block is prefixed, so this fragment must go or the number repeats.
function leadingFragment(
  pieces: readonly RawPiece[],
  blocks: readonly CallBlock[],
): PieceRange | undefined {
  let cursor = 0;
  for (const block of blocks) {
    const end = blockEnd(pieces, cursor, block);
    if (end === undefined) {
      return firstIncomplete(pieces, cursor, blocks.slice(blocks.indexOf(block)));
    }
    cursor = end + 1;
  }
  return undefined;
}

function firstIncomplete(
  pieces: readonly RawPiece[],
  from: number,
  blocks: readonly CallBlock[],
): PieceRange | undefined {
  for (const block of blocks) {
    const range = incompleteFragment(pieces, from, block);
    if (range !== undefined) {
      return range;
    }
  }
  return undefined;
}

function incompleteFragment(
  pieces: readonly RawPiece[],
  from: number,
  block: CallBlock,
): PieceRange | undefined {
  let cursor = from;
  let first: number | undefined;
  let last = from;
  let repeatsNumber = false;
  let matched = 0;
  let cut = false;
  for (const expected of block.sentences) {
    while (cursor < pieces.length && pieces[cursor]?.norm === "") {
      cursor += 1;
    }
    const norm = pieces[cursor]?.norm ?? "";
    if (norm.length === 0 || !expected.startsWith(norm)) {
      break;
    }
    first ??= cursor;
    last = cursor;
    cursor += 1;
    matched += 1;
    repeatsNumber ||= /\d/u.test(norm);
    if (norm !== expected) {
      cut = true;
      break;
    }
  }
  // A number-free sentence taken from the block is just a sentence; keep it.
  const stretched = matched === block.sentences.length;
  if (first === undefined || !(cut || stretched || repeatsNumber)) {
    return undefined;
  }
  while (pieces[last + 1]?.continuesRun === true) {
    last += 1;
  }
  return { first, last };
}

function dropFragment(
  dropped: Set<number>,
  pieces: readonly RawPiece[],
  blocks: readonly CallBlock[],
): void {
  const fragment = leadingFragment(pieces, blocks);
  if (fragment === undefined) {
    return;
  }
  for (let cursor = fragment.first; cursor <= fragment.last; cursor += 1) {
    dropped.add(cursor);
  }
}

export function ensureEmergencyCalls(
  reply: string,
  calls: readonly EmergencyCall[],
): string {
  if (!calls.includes("15") && !is3114Only(calls)) {
    return reply;
  }
  if (keepsModel3114(calls)) {
    if (physical15OpeningSettled(reply)) {
      return reply;
    }
    return rebuildPhysical15(reply);
  }
  const templates = templatesFor(calls);
  const blocks = templates.map(blockFor);
  if (startsWithBlocks(rawPieces(reply), blocks)) {
    return reply;
  }
  return joinPrefix(templates.join(" "), withoutExactCallTemplates(reply, blocks));
}

// True when the reply already opens with the exact required blocks for these calls.
export function opensWithCallBlocks(reply: string, calls: readonly EmergencyCall[]): boolean {
  return startsWithBlocks(rawPieces(reply), templatesFor(calls).map(blockFor));
}

function templatesFor(calls: readonly EmergencyCall[]): string[] {
  const first15 = calls.indexOf("15");
  return calls.map((call, index) => {
    if (call === "15") {
      return call15Now;
    }
    return first15 === -1 || index < first15 ? call3114Now : call3114;
  });
}

function blockFor(template: string): CallBlock {
  return callBlocks.find((block) => block.text === template) ?? callBlock(template, false);
}

function startsWithBlocks(pieces: readonly RawPiece[], blocks: readonly CallBlock[]): boolean {
  let at = 0;
  for (const block of blocks) {
    const end = blockEnd(pieces, at, block);
    if (end === undefined) {
      return false;
    }
    at = end + 1;
  }
  return true;
}

function is3114Only(calls: readonly EmergencyCall[]): boolean {
  return calls.length === 1 && calls[0] === "3114";
}

function keepsModel3114(calls: readonly EmergencyCall[]): boolean {
  return calls.length === 1 && calls[0] === "15";
}

function physical15OpeningSettled(reply: string): boolean {
  const pieces = rawPieces(reply);
  const opening = blockEnd(pieces, 0, block15Now);
  if (opening === undefined) {
    return false;
  }
  let index = opening + 1;
  for (;;) {
    const match = callBlockAt(pieces, index);
    if (match === undefined || !match.block.is3114) {
      break;
    }
    index = match.last + 1;
    const tailAt = nextNonBlank(pieces, index);
    if (isListeningTailText(pieces[tailAt]?.norm ?? "")) {
      index = tailAt + 1;
    }
  }
  for (let cursor = index; cursor < pieces.length; cursor += 1) {
    const match = callBlockAt(pieces, cursor);
    if (match?.block.is3114) {
      return false;
    }
  }
  return true;
}

function nextNonBlank(pieces: readonly RawPiece[], from: number): number {
  let cursor = from;
  while (cursor < pieces.length && pieces[cursor]?.norm === "") {
    cursor += 1;
  }
  return cursor;
}

function rebuildPhysical15(reply: string): string {
  const pieces = rawPieces(reply);
  const moved: string[] = [];
  const dropped = new Set<number>();
  dropFragment(dropped, pieces, [block15Now]);
  dropFragmentAfterLeadingCalls(dropped, pieces);
  let index = 0;
  while (index < pieces.length) {
    const match = callBlockAt(pieces, index);
    if (match === undefined) {
      index += 1;
      continue;
    }
    if (match.block.is3114) {
      moved.push(blockText(pieces, index, match.last));
      const tailAt = listeningTailAfter(pieces, match.last);
      if (tailAt !== undefined) {
        moved.push(pieces[tailAt]?.sentence ?? "");
      }
    }
    dropThroughTail(dropped, pieces, index, match.last);
    index = match.last + 1;
  }
  // A [15]-only reply keeps the model's own 3114 wording, so only the 15 block is repeated.
  dropLoneBlockSentences(dropped, pieces, lone15);
  return joinPrefix(joinSentences([call15Now, ...moved]), keptRaw(pieces, dropped));
}

// A cut 15 right behind complete leading call blocks is moved out with them,
// so the rebuilt reply must not keep it next to the full 15 block.
function dropFragmentAfterLeadingCalls(dropped: Set<number>, pieces: readonly RawPiece[]): void {
  let cursor = 0;
  for (;;) {
    const at = nextNonBlank(pieces, cursor);
    const match = callBlockAt(pieces, at);
    if (match === undefined) {
      cursor = at;
      break;
    }
    cursor = match.last + 1;
  }
  const range = incompleteFragment(pieces, cursor, block15Now);
  if (range === undefined) {
    return;
  }
  for (let index = range.first; index <= range.last; index += 1) {
    dropped.add(index);
  }
}

function blockText(pieces: readonly RawPiece[], start: number, last: number): string {
  const sentences: string[] = [];
  for (let index = start; index <= last; index += 1) {
    const sentence = pieces[index]?.sentence ?? "";
    if (sentence.length > 0) {
      sentences.push(sentence);
    }
  }
  return sentences.join(" ");
}

function withoutExactCallTemplates(reply: string, opening: readonly CallBlock[]): string {
  const pieces = rawPieces(reply);
  const dropped = new Set<number>();
  dropFragment(dropped, pieces, opening);
  let index = 0;
  while (index < pieces.length) {
    const match = callBlockAt(pieces, index);
    if (match === undefined) {
      index += 1;
      continue;
    }
    dropThroughTail(dropped, pieces, index, match.last);
    index = match.last + 1;
  }
  dropLoneBlockSentences(dropped, pieces, loneAll);
  return keptRaw(pieces, dropped);
}

type LoneSentences = {
  readonly all: ReadonlySet<string>;
  readonly withNumber: readonly string[];
  // Only sentences closed by their own punctuation count; an unpunctuated cut prefix stays.
  readonly finishedOnly?: boolean;
};

function loneSentencesOf(blocks: readonly CallBlock[]): LoneSentences {
  const all = new Set(blocks.flatMap((block) => block.sentences));
  return { all, withNumber: [...all].filter((sentence) => /\d/u.test(sentence)) };
}

const loneAll = loneSentencesOf(callBlocks);
const lone15 = loneSentencesOf([block15Now]);

// A single block sentence written alone (any position) would repeat what the
// prefixed block already says. So does a cut prefix of one that still names the
// number, even with its own full stop ("Appelle le 15 maintenant.").
function isLoneBlockSentence(norm: string, lone: LoneSentences): boolean {
  if (lone.all.has(norm)) {
    return true;
  }
  if (lone.finishedOnly === true && !/[.!?…]["'»”)\s]*$/u.test(norm)) {
    return false;
  }
  const bare = norm.replace(/[.!?\s]+$/u, "");
  return (
    bare.length > 0 &&
    /\d/u.test(bare) &&
    lone.withNumber.some(
      (sentence) =>
        sentence.startsWith(bare) && !/[\p{L}\p{N}]/u.test(sentence.charAt(bare.length)),
    )
  );
}

// A cut prefix with no closing punctuation, such as "Tu peux appeler le 3114", stays.
const finishedAll: LoneSentences = { ...loneAll, finishedOnly: true };

// Drops finished lone block sentences (quoted ones too) without touching cut
// prefixes. With keepOpening, the leading required blocks of `calls` stay.
export function withoutFinishedLoneSentences(
  text: string,
  calls: readonly EmergencyCall[],
  keepOpening: boolean,
): string {
  const pieces = rawPieces(text);
  let from = 0;
  if (keepOpening) {
    for (const template of templatesFor(calls)) {
      const end = blockEnd(pieces, from, blockFor(template));
      if (end === undefined) {
        break;
      }
      from = end + 1;
    }
  }
  const dropped = new Set<number>();
  dropLoneBlockSentences(dropped, pieces, finishedAll);
  for (let index = 0; index < from; index += 1) {
    dropped.delete(index);
  }
  return keptRaw(pieces, dropped);
}

// The sentence boundary ends a piece before its closing quote, so a quoted
// sentence is the opening-quote piece plus a closing quote that starts the next piece.
const quotePairs = [
  { open: '"', close: '"' },
  { open: "\u201C", close: "\u201D" },
  { open: "\u00AB", close: "\u00BB" },
] as const;

function unquotedLone(
  pieces: readonly RawPiece[],
  index: number,
  lone: LoneSentences,
): { readonly close: string } | undefined {
  const norm = pieces[index]?.norm ?? "";
  const next = pieces[index + 1]?.raw ?? "";
  for (const pair of quotePairs) {
    if (!norm.startsWith(pair.open)) {
      continue;
    }
    const inner = norm.slice(pair.open.length).trim();
    const nextNorm = normalizeEmergencyText(next);
    if (inner.length > 0 && nextNorm.startsWith(pair.close) && isLoneBlockSentence(inner, lone)) {
      return { close: pair.close };
    }
  }
  return undefined;
}

function withoutLeadingClose(raw: string, close: string): string {
  const at = raw.indexOf(close);
  return at < 0 ? raw : raw.slice(0, at) + raw.slice(at + close.length);
}

function dropLoneBlockSentences(
  dropped: Set<number>,
  pieces: RawPiece[],
  lone: LoneSentences,
): void {
  for (let index = 0; index < pieces.length; index += 1) {
    if (dropped.has(index)) {
      continue;
    }
    const quoted = unquotedLone(pieces, index, lone);
    const next = pieces[index + 1];
    if (quoted !== undefined && next !== undefined) {
      const raw = withoutLeadingClose(next.raw, quoted.close);
      pieces[index + 1] = { ...next, raw, sentence: raw.trim(), norm: normalizeEmergencyText(raw) };
      dropped.add(index);
      continue;
    }
    if (!isLoneBlockSentence(pieces[index]?.norm ?? "", lone)) {
      continue;
    }
    let through = index;
    while (pieces[through + 1]?.continuesRun === true) {
      through += 1;
    }
    for (let cursor = index; cursor <= through; cursor += 1) {
      dropped.add(cursor);
    }
    index = through;
  }
}

function dropThroughTail(
  dropped: Set<number>,
  pieces: readonly RawPiece[],
  first: number,
  last: number,
): void {
  const tailAt = listeningTailAfter(pieces, last);
  let through = tailAt ?? last;
  while (pieces[through + 1]?.continuesRun === true) {
    through += 1;
  }
  for (let cursor = first; cursor <= through; cursor += 1) {
    dropped.add(cursor);
  }
}

// Dropping a block must not butt two kept pieces together into a new number:
// "1" + "12" around a removed block would read as 112. Then the block stays.
function keptRaw(pieces: readonly RawPiece[], dropped: ReadonlySet<number>): string {
  let kept = "";
  let gap = "";
  let gapAt = 0;
  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index];
    const raw = piece?.raw ?? "";
    if (dropped.has(index)) {
      if (gap.length === 0) {
        gapAt = kept.length;
      }
      gap += raw;
      continue;
    }
    if (piece?.norm !== "") {
      if (gap.length > 0 && joinsDigits(kept.slice(0, gapAt), kept.slice(gapAt) + raw)) {
        kept = kept.slice(0, gapAt) + gap + kept.slice(gapAt);
      }
      gap = "";
    }
    kept += raw;
  }
  return kept;
}

function joinsDigits(before: string, after: string): boolean {
  // Same view as the 112 detector: any run of non-letter, non-digit separators
  // between two digits still lets "1-" and "12" read as one number.
  return (
    /\d[^\p{L}\p{N}]*$/u.test(normalizeEmergencyText(before)) &&
    /^[^\p{L}\p{N}]*\d/u.test(normalizeEmergencyText(after))
  );
}

function joinSentences(sentences: readonly string[]): string {
  let joined = "";
  for (const sentence of sentences) {
    if (sentence.length === 0) {
      continue;
    }
    if (joined.length === 0) {
      joined = sentence;
      continue;
    }
    joined += `${sentenceGap(joined)}${sentence}`;
  }
  return joined;
}

function sentenceGap(previous: string): string {
  return /[.!?]$/u.test(normalizeEmergencyText(previous)) ? " " : ". ";
}

export function joinPrefix(prefix: string, body: string): string {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return prefix;
  }
  if (/^\s*\n/.test(body)) {
    return `${prefix}${body.trimEnd()}`;
  }
  return `${prefix}${sentenceGap(prefix)}${trimmed}`;
}

function isListeningTailText(normalized: string): boolean {
  return closedListeningTails.has(normalized);
}

function listeningTailAfter(pieces: readonly RawPiece[], index: number): number | undefined {
  for (let cursor = index + 1; cursor < pieces.length; cursor += 1) {
    const piece = pieces[cursor];
    const sentence = piece?.sentence ?? "";
    if (sentence.length === 0 || isPunctuationOnlyPiece(piece)) {
      continue;
    }
    if (isListeningTailText(piece?.norm ?? "")) {
      return cursor;
    }
    return undefined;
  }
  return undefined;
}

function isPunctuationOnlyPiece(piece: RawPiece | undefined): boolean {
  if (piece === undefined) {
    return false;
  }
  return /^[.!?]+$/u.test(piece.norm);
}

type RawPiece = {
  readonly raw: string;
  readonly sentence: string;
  readonly norm: string;
  // Punctuation glued to the piece before it, so "..." is one run, not "." plus more.
  readonly continuesRun: boolean;
};

// Same boundaries as the checker, read on the normalized text: a fullwidth
// period or an ellipsis character ends a sentence there too. One piece per
// boundary character, so a run of dots stays visible as extra pieces.
function foldsToBoundary(char: string): boolean {
  const folded = char.normalize("NFKC").replace(lineBreakPattern, "\n");
  return /[.!?\n]/u.test(folded);
}

function rawPieces(reply: string): RawPiece[] {
  const pieces: RawPiece[] = [];
  let start = 0;
  let index = 0;
  for (const char of reply) {
    index += char.length;
    if (foldsToBoundary(char)) {
      pushRawPiece(pieces, reply.slice(start, index));
      start = index;
    }
  }
  pushRawPiece(pieces, reply.slice(start));
  return pieces;
}

function pushRawPiece(pieces: RawPiece[], raw: string): void {
  if (raw.length === 0) {
    return;
  }
  const norm = normalizeEmergencyText(raw);
  const previous = pieces[pieces.length - 1];
  const continuesRun =
    previous !== undefined &&
    /[.!?]$/u.test(previous.norm) &&
    /^[.!?]+$/u.test(norm) &&
    !/^\s/u.test(raw.replace(/\p{Cf}/gu, ""));
  pieces.push({ raw, sentence: raw.trim(), norm, continuesRun });
}

function splitExact(text: string): string[] {
  if (text.length === 0) {
    return [];
  }
  const sentences: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const boundary = char === "\n" || char === "!" || char === "?" || char === ".";
    if (!boundary) {
      continue;
    }
    const sentence = text.slice(start, index + 1).trim();
    if (sentence.length > 0) {
      sentences.push(sentence);
    }
    start = index + 1;
  }
  const tail = text.slice(start).trim();
  if (tail.length > 0) {
    sentences.push(tail);
  }
  return sentences;
}
