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

const exactCallTemplates = new Set(
  [call15Now, call3114Now, call3114].map((template) => normalizeEmergencyText(template)),
);

export function ensureEmergencyCalls(
  reply: string,
  calls: readonly EmergencyCall[],
): string {
  if (!calls.includes("15")) {
    return reply;
  }
  const templates = templatesFor(calls);
  if (startsWithTemplates(reply, templates)) {
    return reply;
  }
  const prefix = templates.join(" ");
  const body = withoutExactCallTemplates(reply);
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return prefix;
  }
  if (/^\s*\n/.test(body)) {
    return `${prefix}${body.trimEnd()}`;
  }
  return `${prefix} ${trimmed}`;
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

function withoutExactCallTemplates(reply: string): string {
  let kept = "";
  let start = 0;
  for (let index = 0; index <= reply.length; index += 1) {
    const atEnd = index === reply.length;
    const char = atEnd ? "" : reply[index];
    const boundary = !atEnd && (char === "." || char === "!" || char === "?" || char === "\n");
    if (!atEnd && !boundary) {
      continue;
    }
    const raw = reply.slice(start, atEnd ? reply.length : index + 1);
    const sentence = raw.trim();
    const drop = sentence.length > 0 && exactCallTemplates.has(normalizeEmergencyText(sentence));
    if (!drop) {
      kept += raw;
    }
    if (atEnd) {
      break;
    }
    start = index + 1;
  }
  return kept;
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
