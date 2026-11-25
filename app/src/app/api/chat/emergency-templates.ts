export const call15Now = "Appelle le 15 maintenant.";
export const call3114Now = "Appelle le 3114 maintenant.";
export const call3114 = "Appelle le 3114.";

export const callSentences = [
  { sentence: call15Now, numbers: ["15"] },
  { sentence: call3114Now, numbers: ["3114"] },
  { sentence: call3114, numbers: ["3114"] },
] as const;

export const refusal112 = "Je ne te donne pas le 112.";
export const refusalSos = "Je ne te donne pas SOS Médecins.";

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

export function ensureEmergencyCalls(
  reply: string,
  calls: readonly EmergencyCall[],
): string {
  if (!calls.includes("15")) {
    return reply;
  }
  if (keepsModel3114(calls)) {
    if (physical15OpeningSettled(reply)) {
      return reply;
    }
    return rebuildPhysical15(reply);
  }
  const templates = templatesFor(calls);
  if (startsWithTemplates(reply, templates)) {
    return reply;
  }
  return joinPrefix(templates.join(" "), withoutExactCallTemplates(reply));
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
    }
  }
  return joinPrefix(joinSentences([call15Now, ...moved]), keptRaw(pieces, dropped));
}

function withoutExactCallTemplates(reply: string): string {
  const pieces = rawPieces(reply);
  const dropped = new Set<number>();
  for (let index = 0; index < pieces.length; index += 1) {
    const sentence = pieces[index]?.sentence ?? "";
    if (sentence.length === 0 || !exactCallTemplates.has(normalizeEmergencyText(sentence))) {
      continue;
    }
    dropThroughTail(dropped, pieces, index);
  }
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

type RawPiece = {
  readonly raw: string;
  readonly sentence: string;
};

function rawPieces(reply: string): RawPiece[] {
  const pieces: RawPiece[] = [];
  let start = 0;
  let index = 0;
  while (index <= reply.length) {
    const atEnd = index === reply.length;
    const char = atEnd ? "" : (reply[index] ?? "");
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
