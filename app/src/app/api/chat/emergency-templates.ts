export const call15Now = "Appelle le 15 maintenant.";
export const call3114Now = "Appelle le 3114 maintenant.";
export const call3114 = "Appelle le 3114.";

// The one safety line for every turn with no emergency opening: a failed model, or a failed Jev.
export const emergencySafetySentence =
  "En cas d'urgence, appelle le 15. Si tu as des idées suicidaires, appelle le 3114.";

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

export function normalizeEmergencyText(text: string): string {
  const compat = foldDigitSymbols(text.normalize("NFKC"));
  const stripped = compat.replace(/\p{M}/gu, "").replace(/\p{Cf}/gu, "");
  return mapDecimalDigits(stripped)
    .replace(/['\u2018\u2019\u201A\u201B\u2032\u2035\u02BC\u02B9\u00B4`\uFF07]/g, "'")
    .replace(/\u00A0/g, " ")
    .toLowerCase()
    .replace(/\r\n?/g, "\n")
    .replace(/[\u2028\u2029]/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

const norm15Now = normalizeEmergencyText(call15Now);
const norm3114Now = normalizeEmergencyText(call3114Now);
const norm3114 = normalizeEmergencyText(call3114);
const closedListeningTails = new Set([
  normalizeEmergencyText("Ils t'écoutent"),
  normalizeEmergencyText("Ils t'écoutent."),
  normalizeEmergencyText("Ils t'écoutent jour et nuit."),
]);

const exactCallTemplates = new Set([norm15Now, norm3114Now, norm3114]);

// The live path owns the numbers of a turn flagged by Jev. It keeps the model text only when that
// text adds no number of its own. So the output starts with Jev's opening and every other sentence
// that names 112, SOS Médecins, 15 or 3114 is removed whole, the two refusal sentences included:
// the checker fails a reply that names 112 or SOS Médecins next to any other free text, so a
// refusal could not stay beside the rest of the model text. The output passes `checkEmergencyReply`.
// A call list without 15 (a 3114 offer) only loses the 112 and SOS Médecins sentences.
export function ensureEmergencyCalls(
  reply: string,
  calls: readonly EmergencyCall[],
): string {
  if (!calls.includes("15")) {
    return withoutOtherServices(reply);
  }
  if (keepsModel3114(calls)) {
    if (physical15OpeningSettled(reply) && !physicalBodyNamesNumbers(reply)) {
      return reply;
    }
    return rebuildPhysical15(reply);
  }
  const templates = templatesFor(calls);
  if (startsWithTemplates(reply, templates) && !bodyNamesNumbers(reply, templates.length)) {
    return reply;
  }
  return joinPrefix(templates.join(" "), withoutExactCallTemplates(reply));
}

// For a turn Jev did not flag, the model text stays as written except sentences that name 112
// or SOS Médecins. Steve never routes there. A 15 or 3114 in the model text stays: on a turn Jev
// under-triaged, the model is the second net.
export function withoutOtherServices(reply: string): string {
  const pieces = rawPieces(reply);
  const dropped = new Set<number>();
  for (let index = 0; index < pieces.length; index += 1) {
    const sentence = pieces[index]?.sentence ?? "";
    const names = namedServices(sentence);
    if (names.has112 || names.hasSos) {
      dropped.add(index);
    }
  }
  if (dropped.size === 0) {
    return reply;
  }
  dropOrphans(pieces, dropped);
  return keptRaw(pieces, dropped).trim();
}

function templatesFor(calls: readonly EmergencyCall[]): string[] {
  const first15 = calls.indexOf("15");
  return calls.map((call, index) => {
    if (call === "15") {
      return call15Now;
    }
    return index < first15 ? call3114Now : call3114;
  });
}

function startsWithTemplates(reply: string, templates: readonly string[]): boolean {
  const sentences = splitExact(normalizeEmergencyText(reply));
  return templates.every(
    (template, index) => sentences[index] === normalizeEmergencyText(template),
  );
}

function keepsModel3114(calls: readonly EmergencyCall[]): boolean {
  return calls.length === 1 && calls[0] === "15";
}

function physical15OpeningSettled(reply: string): boolean {
  const sentences = splitExact(normalizeEmergencyText(reply));
  if (sentences[0] !== norm15Now) {
    return false;
  }
  let index = 1;
  while (index < sentences.length && isExact3114Text(sentences[index] ?? "")) {
    index += 1;
    if (isListeningTailText(sentences[index] ?? "")) {
      index += 1;
    }
  }
  for (let cursor = index; cursor < sentences.length; cursor += 1) {
    if (isExact3114Text(sentences[cursor] ?? "")) {
      return false;
    }
  }
  return true;
}

function rebuildPhysical15(reply: string): string {
  const pieces = rawPieces(reply);
  const moved: string[] = [];
  const dropped = new Set<number>();
  for (let index = 0; index < pieces.length; index += 1) {
    const sentence = pieces[index]?.sentence ?? "";
    if (sentence.length === 0) {
      continue;
    }
    if (isExact3114(sentence)) {
      moved.push(sentence);
      const tailAt = listeningTailAfter(pieces, index);
      if (tailAt !== undefined) {
        moved.push(pieces[tailAt]?.sentence ?? "");
      }
      dropThroughTail(dropped, pieces, index);
      continue;
    }
    if (exactCallTemplates.has(normalizeEmergencyText(sentence))) {
      dropThroughTail(dropped, pieces, index);
      continue;
    }
    if (namesNumber(sentence)) {
      dropped.add(index);
    }
  }
  dropOrphans(pieces, dropped);
  return joinPrefix(joinSentences([call15Now, ...moved]), keptRaw(pieces, dropped));
}

function physicalBodyNamesNumbers(reply: string): boolean {
  let fifteens = 0;
  for (const piece of rawPieces(reply)) {
    const normalized = normalizeEmergencyText(piece.sentence);
    if (normalized.length === 0 || isListeningTailText(normalized) || isExact3114Text(normalized)) {
      continue;
    }
    if (normalized === norm15Now) {
      fifteens += 1;
      continue;
    }
    if (namesNumber(piece.sentence)) {
      return true;
    }
  }
  return fifteens > 1;
}

function bodyNamesNumbers(reply: string, openingSentences: number): boolean {
  let seen = 0;
  for (const piece of rawPieces(reply)) {
    if (piece.sentence.length === 0) {
      continue;
    }
    seen += 1;
    if (seen <= openingSentences) {
      continue;
    }
    const normalized = normalizeEmergencyText(piece.sentence);
    if (exactCallTemplates.has(normalized) || namesNumber(piece.sentence)) {
      return true;
    }
  }
  return false;
}

function withoutExactCallTemplates(reply: string): string {
  const pieces = rawPieces(reply);
  const dropped = new Set<number>();
  for (let index = 0; index < pieces.length; index += 1) {
    const sentence = pieces[index]?.sentence ?? "";
    if (sentence.length === 0) {
      continue;
    }
    if (exactCallTemplates.has(normalizeEmergencyText(sentence))) {
      dropThroughTail(dropped, pieces, index);
      continue;
    }
    if (namesNumber(sentence)) {
      dropped.add(index);
    }
  }
  dropOrphans(pieces, dropped);
  return keptRaw(pieces, dropped);
}

function dropThroughTail(
  dropped: Set<number>,
  pieces: readonly RawPiece[],
  index: number,
): void {
  dropped.add(index);
  const tailAt = listeningTailAfter(pieces, index);
  if (tailAt === undefined) {
    return;
  }
  for (let cursor = index + 1; cursor <= tailAt; cursor += 1) {
    dropped.add(cursor);
  }
}

function keptRaw(pieces: readonly RawPiece[], dropped: ReadonlySet<number>): string {
  let kept = "";
  for (let index = 0; index < pieces.length; index += 1) {
    if (!dropped.has(index)) {
      kept += pieces[index]?.raw ?? "";
    }
  }
  return kept;
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
  return /[.!?]$/.test(previous) ? " " : ". ";
}

function joinPrefix(prefix: string, body: string): string {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return prefix;
  }
  if (/^\s*\n/.test(body)) {
    return `${prefix}${body.trimEnd()}`;
  }
  return `${prefix}${sentenceGap(prefix)}${trimmed}`;
}

function isExact3114(sentence: string): boolean {
  return isExact3114Text(normalizeEmergencyText(sentence));
}

function isExact3114Text(normalized: string): boolean {
  return normalized === norm3114Now || normalized === norm3114;
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
    if (isListeningTailText(normalizeEmergencyText(sentence))) {
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
  return /^[.!?]+$/u.test(piece.raw.trim());
}

type Named = {
  readonly has15: boolean;
  readonly has3114: boolean;
  readonly has112: boolean;
  readonly hasSos: boolean;
};

const gap = "[^\\p{L}\\p{N}]*";

function pattern(source: string): RegExp {
  return new RegExp(source, "u");
}

function masked(text: string, patterns: readonly RegExp[]): string {
  return patterns.reduce(
    (rest, item) => rest.replace(new RegExp(item.source, "gu"), " "),
    text,
  );
}

const patterns3114 = [
  pattern(`(?<!\\p{L})trois${gap}mille${gap}cent${gap}quatorze(?!\\p{L})`),
  pattern(`(?<![0-9])3${gap}1${gap}1${gap}4(?![0-9])`),
];
const patterns112 = [
  pattern(`(?<!\\p{L})cent${gap}douze(?!\\p{L})`),
  pattern(`(?<![0-9])1${gap}1${gap}2(?![0-9])`),
];
const patternsSos = [pattern(`(?<!\\p{L})s${gap}o${gap}s(?!\\p{L})`)];
const patterns15 = [
  pattern(`(?<![0-9])1${gap}5(?![0-9])`),
  pattern("(?<!\\p{L})quinze(?!\\p{L})"),
  pattern(`(?<!\\p{L})s${gap}a${gap}m${gap}u(?!\\p{L})`),
];

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((item) => item.test(text));
}

// The same spellings the eval checker scans for, so a sentence this file keeps cannot trip it.
function namedServices(sentence: string): Named {
  const text = normalizeEmergencyText(sentence);
  const rest = masked(text, [...patterns3114, ...patterns112, ...patternsSos]);
  return {
    has3114: matchesAny(text, patterns3114),
    has112: matchesAny(text, patterns112),
    hasSos: matchesAny(text, patternsSos),
    has15: matchesAny(rest, patterns15),
  };
}

function namesNumber(sentence: string): boolean {
  const names = namedServices(sentence);
  return names.has15 || names.has3114 || names.has112 || names.hasSos;
}

// A closing quote or a stray mark left after a removed sentence goes with it.
function dropOrphans(pieces: readonly RawPiece[], dropped: Set<number>): void {
  for (let index = 1; index < pieces.length; index += 1) {
    const sentence = pieces[index]?.sentence ?? "";
    if (dropped.has(index - 1) && sentence.length > 0 && !/[\p{L}\p{N}]/u.test(sentence)) {
      dropped.add(index);
    }
  }
}

type RawPiece = {
  readonly raw: string;
  readonly sentence: string;
};

// A dot inside "S.O.S", "S.A.M.U" or a decimal such as "1.5" does not end a sentence.
const dottedNames = [
  /(?<![a-z])s\s{0,2}\.\s{0,2}o\s{0,2}\.\s{0,2}s/giu,
  /(?<![a-z])s\s{0,2}\.\s{0,2}a\s{0,2}\.\s{0,2}m\s{0,2}\.\s{0,2}u/giu,
];

function protectedDots(reply: string): Set<number> {
  const dots = new Set<number>();
  for (const item of dottedNames) {
    for (const match of reply.matchAll(item)) {
      const at = match.index ?? 0;
      for (let offset = 0; offset < match[0].length; offset += 1) {
        if (match[0][offset] === ".") {
          dots.add(at + offset);
        }
      }
    }
  }
  return dots;
}

function insideWord(reply: string, index: number, dots: ReadonlySet<number>): boolean {
  if (dots.has(index)) {
    return true;
  }
  return /[0-9]/.test(reply[index - 1] ?? "") && /[0-9]/.test(reply[index + 1] ?? "");
}

function rawPieces(reply: string): RawPiece[] {
  const dots = protectedDots(reply);
  const pieces: RawPiece[] = [];
  let start = 0;
  let index = 0;
  while (index <= reply.length) {
    const atEnd = index === reply.length;
    const char = atEnd ? "" : (reply[index] ?? "");
    if (char === "." && insideWord(reply, index, dots)) {
      index += 1;
      continue;
    }
    const punct = char === "." || char === "!" || char === "?";
    const boundary = !atEnd && (punct || char === "\n");
    if (!atEnd && !boundary) {
      index += 1;
      continue;
    }
    let end = index;
    if (punct) {
      while (end + 1 < reply.length) {
        const next = reply[end + 1];
        if (next !== "." && next !== "!" && next !== "?") {
          break;
        }
        end += 1;
      }
    }
    const slice = reply.slice(start, atEnd ? reply.length : end + 1);
    const sentence = slice.trim().replace(/[.!?]+$/u, (run) => run[0] ?? ".");
    const bare = slice.trim();
    const punctuationOnly = /^[.!?]+$/u.test(sentence);
    if (!punctuationOnly || bare.length > 1) {
      pieces.push({ raw: slice, sentence });
    }
    if (atEnd) {
      break;
    }
    start = end + 1;
    index = start;
  }
  return pieces;
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
