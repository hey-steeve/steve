import { expect, it } from "vitest";
import { call15Now, call3114, call3114Now } from "../emergency-templates.ts";
import { systemPrompt } from "../system-prompt.ts";
import { type DetectedKind, detectEmergencyNumbers } from "./check.ts";
import {
  promptNumberPinFailures,
  type PromptNumberRow,
  splitSentences,
} from "./prompt-number-pins.ts";
import { promptNumberPinRows } from "./prompt-number-pin-rows.ts";

const staleFailure = (sentence: string): string =>
  `stale row (0 matches): "${sentence}"`;
const duplicateFailure = (count: number, sentence: string): string =>
  `duplicate sentence (${count} matches): "${sentence}"`;
const mismatchFailure = (
  row: readonly string[],
  detected: readonly string[],
  sentence: string,
): string =>
  `numbers mismatch (row [${row.join(", ")}], detected [${detected.join(", ")}]): "${sentence}"`;
const unpinnedFailure = (detected: readonly string[], sentence: string): string =>
  `unpinned number sentence (detected [${detected.join(", ")}]): "${sentence}"`;
const outOfOrderFailure = (sentence: string): string =>
  `out of order: "${sentence}" appears before the previous row's sentence`;
const splitFailure = (span: string, kind: string): string =>
  `split across sentences: "${span}" (${kind}) crosses a sentence boundary`;

const pair3114Then15 =
  `Pour le 3114 puis le 15, tu écris « ${call3114Now} » puis « ${call15Now} ».`;
const pair15Then3114 =
  `Pour le 15 puis le 3114, tu écris « ${call15Now} » puis « ${call3114} ».`;

const refuse112Lead = "Tu ne donnes jamais le 112 ni SOS Médecins.";
const refuse112Follow =
  "Si tu les nommes, chaque phrase de ta réponse est une phrase d'appel autorisée ou exactement « Je ne te donne pas le 112. », « Je ne te donne pas SOS Médecins. », « Je ne peux pas te conseiller de médicament. » ou « Demande conseil à un pharmacien ou à un médecin. ».";
const lastRule =
  "Dans le doute, tu poses une seule question courte ou tu recommandes une consultation.";

const general15Head =
  "Tu ne donnes le 15 que pour une vraie urgence ou quand une règle ci-dessous l'exige, c'est-à-dire des signes de gravité, une surdose, une automutilation, un danger immédiat,";
const general15Tail = "des pensées suicidaires ou une crise de panique avec essoufflement.";
const general15Old = `${general15Head} ${general15Tail}`;
const general15New = `${general15Head} mais jamais pour des pensées suicidaires ni pour une crise de panique avec essoufflement.`;

const samePhrase = "Tu ne mets jamais le 15 et le 3114 dans la même phrase.";
const samePhraseLead = "Tu ne mets jamais le 15 et le 3114 dans la même phrase";
const samePhraseWidened = `${samePhraseLead}, et tu ne donnes pas le 15 pour des pensées suicidaires sans danger aigu.`;
const samePhraseEdited = "Tu ne mets jamais le 15 et le 3114 dans la même réponse.";

const redFlagHead =
  "Si le message décrit déjà des signes de gravité, par exemple un bébé qui a de la fièvre, qui est somnolent ou qui a du mal à respirer, la réponse s'ouvre exactement par ce bloc :";
const redFlagTail = `« ${call15Now} », jamais seulement une phrase conditionnelle.`;
const redFlagOld = `${redFlagHead} ${redFlagTail}`;
const redFlagNew = `${redFlagHead} jamais ${redFlagTail}`;

const anxietyTail =
  `peut citer le 3114, sans l'exiger en ouverture, et ce bloc est exactement « ${call3114} » ou « ${call3114Now} ».`;
const anxietyOld = `Une angoisse intense ou une crise de panique, sans pensée suicidaire et sans danger, ${anxietyTail}`;
const anxietyNew = `Une angoisse intense, des pensées suicidaires ou une crise de panique avec essoufflement, sans pensée suicidaire et sans danger, ${anxietyTail}`;

function replaceOnce(text: string, anchor: string, replacement: string): string {
  const first = text.indexOf(anchor);
  expect(first, `anchor not found: ${anchor}`).toBeGreaterThanOrEqual(0);
  expect(text.indexOf(anchor, first + 1), `anchor not unique: ${anchor}`).toBe(-1);
  return `${text.slice(0, first)}${replacement}${text.slice(first + anchor.length)}`;
}

it("accepts the live system prompt against the pinned table", () => {
  expect(promptNumberPinFailures(systemPrompt, promptNumberPinRows)).toEqual([]);
});

it("pins every row sentence to exactly one sentence of the live prompt", () => {
  expect(promptNumberPinRows.length).toBeGreaterThan(0);
  for (const row of promptNumberPinRows) {
    expect(systemPrompt.split(row.sentence).length - 1, row.sentence).toBeGreaterThanOrEqual(1);
    expect(row.numbers.length, row.sentence).toBeGreaterThan(0);
  }
});

type Mutation = {
  readonly name: string;
  readonly prompt: (live: string) => string;
  readonly rows?: (live: readonly PromptNumberRow[]) => readonly PromptNumberRow[];
  readonly failures: readonly string[];
};

const mutations: readonly Mutation[] = [
  {
    name: "N1 general 15 sentence adds a retraction for suicidal thoughts and panic",
    prompt: (live) => replaceOnce(live, general15Old, general15New),
    failures: [staleFailure(general15Old), unpinnedFailure(["15"], general15New)],
  },
  {
    name: "N2 second sentence with the same lead as a pinned sentence",
    prompt: (live) => replaceOnce(live, samePhrase, `${samePhrase} ${samePhraseWidened}`),
    failures: [unpinnedFailure(["15", "3114", "15"], samePhraseWidened)],
  },
  {
    name: "N3 red-flag opener negates the first sentence",
    prompt: (live) => replaceOnce(live, redFlagOld, redFlagNew),
    failures: [staleFailure(redFlagOld), unpinnedFailure(["15"], redFlagNew)],
  },
  {
    name: "N4 anxiety rule widened to suicidal thoughts and breathlessness",
    prompt: (live) => replaceOnce(live, anxietyOld, anxietyNew),
    failures: [staleFailure(anxietyOld), unpinnedFailure(["3114", "3114", "3114"], anxietyNew)],
  },
  {
    name: "unpinned new number sentence",
    prompt: (live) => replaceOnce(live, "Tu tutoies.", "Tu tutoies. Pour une brûlure grave, appelle le 15."),
    failures: [unpinnedFailure(["15"], "Pour une brûlure grave, appelle le 15.")],
  },
  {
    name: "one-word edit of a pinned sentence",
    prompt: (live) => replaceOnce(live, samePhrase, samePhraseEdited),
    failures: [staleFailure(samePhrase), unpinnedFailure(["15", "3114"], samePhraseEdited)],
  },
  {
    name: "duplicated pinned sentence",
    prompt: (live) => replaceOnce(live, samePhrase, `${samePhrase} ${samePhrase}`),
    failures: [duplicateFailure(2, samePhrase)],
  },
  {
    name: "stale row, pinned sentence removed from the prompt",
    prompt: (live) => replaceOnce(live, `${samePhrase} `, ""),
    failures: [staleFailure(samePhrase)],
  },
  {
    name: "stale row, extra row that the prompt never contained",
    prompt: (live) => live,
    rows: (live) => [...live, { sentence: "Appelle le 112.", numbers: ["112"] }],
    failures: [staleFailure("Appelle le 112.")],
  },
  {
    name: "numbers mismatch, row numbers differ from the detected numbers",
    prompt: (live) => live,
    rows: (live) =>
      live.map((row) => (row.sentence === samePhrase ? { ...row, numbers: ["15"] } : row)),
    failures: [mismatchFailure(["15"], ["15", "3114"], samePhrase)],
  },
  {
    name: "numbers mismatch, row numbers in the wrong order",
    prompt: (live) => live,
    rows: (live) =>
      live.map((row) =>
        row.sentence === samePhrase ? { ...row, numbers: ["3114", "15"] } : row,
      ),
    failures: [mismatchFailure(["3114", "15"], ["15", "3114"], samePhrase)],
  },
  {
    name: "order, two adjacent pinned sentences swapped",
    prompt: (live) =>
      replaceOnce(live, `${pair3114Then15} ${pair15Then3114}`, `${pair15Then3114} ${pair3114Then15}`),
    failures: [outOfOrderFailure(pair15Then3114)],
  },
  {
    name: "order, a pinned sentence moved to an earlier rule line",
    prompt: (live) =>
      replaceOnce(
        replaceOnce(live, `${samePhrase} `, ""),
        "Tu tutoies.",
        `Tu tutoies. ${samePhrase}`,
      ),
    failures: [outOfOrderFailure(samePhrase)],
  },
  {
    name: "order, a pinned sentence moved to a later rule line",
    prompt: (live) =>
      replaceOnce(
        replaceOnce(live, `${refuse112Lead} `, ""),
        lastRule,
        `${lastRule} ${refuse112Lead}`,
      ),
    failures: [outOfOrderFailure(refuse112Follow)],
  },
  {
    name: "N5 split 112 as 1. 1. 2.",
    prompt: (live) =>
      replaceOnce(live, "Tu tutoies.", "Tu tutoies. En dernier recours, appelle le 1. 1. 2."),
    failures: [splitFailure("1. 1. 2", "112")],
  },
  {
    name: "N5 split 15 as 1. 5.",
    prompt: (live) =>
      replaceOnce(live, "Tu tutoies.", "Tu tutoies. En dernier recours, appelle le 1. 5."),
    failures: [splitFailure("1. 5", "15")],
  },
  {
    name: "N5 split 3114 as 3. 1. 1. 4.",
    prompt: (live) =>
      replaceOnce(live, "Tu tutoies.", "Tu tutoies. En dernier recours, appelle le 3. 1. 1. 4."),
    failures: [splitFailure("3. 1. 1. 4", "3114")],
  },
];

it.each(mutations)("$name", ({ prompt, rows, failures }) => {
  const live = promptNumberPinRows;
  const mutated = prompt(systemPrompt);
  expect(mutated !== systemPrompt || rows !== undefined).toBe(true);
  expect(promptNumberPinFailures(mutated, rows === undefined ? live : rows(live))).toEqual(
    failures,
  );
});

type SplitCase = {
  readonly name: string;
  readonly text: string;
  readonly span: string;
  readonly kind: string;
};

const splitCases: readonly SplitCase[] = [
  { name: "1. 1. 2.", text: "Appelle le 1. 1. 2.", span: "1. 1. 2", kind: "112" },
  { name: "1. 5.", text: "Appelle le 1. 5.", span: "1. 5", kind: "15" },
  { name: "3. 114.", text: "Appelle le 3. 114.", span: "3. 114", kind: "3114" },
  { name: "1.\\n5.", text: "Appelle le 1.\n5.", span: "1.\n5", kind: "15" },
  { name: "1! 5?", text: "Appelle le 1! 5?", span: "1! 5", kind: "15" },
  { name: "2. after 1.", text: "Appelle le 1.\n1.\n2.", span: "1.\n1.\n2", kind: "112" },
];

it.each(splitCases)("fails closed when $name splits a number", ({ text, span, kind }) => {
  expect(promptNumberPinFailures(text, [])).toEqual([splitFailure(span, kind)]);
});

type MarkInSpanCase = {
  readonly text: string;
  readonly span: string;
  readonly kind: DetectedKind;
};

// The reply checker splits at these marks, so a span that holds one must fail even when
// the pin splitter keeps it inside one sentence and an exact row matches that sentence.
const markInSpanCases: readonly MarkInSpanCase[] = [
  { text: "Appelle le 1.5.", span: "1.5", kind: "15" },
  { text: "« Appelle le 1. 5. »", span: "1. 5", kind: "15" },
  { text: "« Appelle le 1.5. »", span: "1.5", kind: "15" },
  { text: "Appelle le 3.114.", span: "3.114", kind: "3114" },
  { text: "Appelle le 1!5.", span: "1!5", kind: "15" },
  // A decimal point is no exception: the reply checker splits there too.
  { text: "Bois 1.5 litre.", span: "1.5", kind: "15" },
];

it.each(markInSpanCases)(
  "fails closed when a sentence mark sits inside the number span of $text",
  ({ text, span, kind }) => {
    const failures = promptNumberPinFailures(text, [{ sentence: text, numbers: [kind] }]);
    expect(failures[0]).toBe(splitFailure(span, kind));
  },
);

type NoSplitCase = {
  readonly name: string;
  readonly text: string;
  readonly rows: readonly PromptNumberRow[];
  readonly failures: readonly string[];
};

const noSplitCases: readonly NoSplitCase[] = [
  { name: "plain sentences without numbers", text: "Étape 1. Étape 2. Fin.", rows: [], failures: [] },
  {
    name: "one pinned call sentence",
    text: "Appelle le 15 maintenant.",
    rows: [{ sentence: "Appelle le 15 maintenant.", numbers: ["15"] }],
    failures: [],
  },
  {
    name: "two pinned call sentences on two lines",
    text: "Appelle le 3114 maintenant.\nAppelle le 15 maintenant.",
    rows: [
      { sentence: "Appelle le 3114 maintenant.", numbers: ["3114"] },
      { sentence: "Appelle le 15 maintenant.", numbers: ["15"] },
    ],
    failures: [],
  },
  {
    name: "a quoted template keeps its inner full stop",
    text: "Tu dis : « Appelle le 15 maintenant. » puis tu attends.",
    rows: [
      {
        sentence: "Tu dis : « Appelle le 15 maintenant. » puis tu attends.",
        numbers: ["15"],
      },
    ],
    failures: [],
  },
  {
    name: "a quoted template that ends the sentence",
    text: "Tu dis : « Appelle le 15 maintenant. ». Puis tu attends.",
    rows: [{ sentence: "Tu dis : « Appelle le 15 maintenant. ».", numbers: ["15"] }],
    failures: [],
  },
  {
    name: "a number sentence with no row",
    text: "Appelle le 15.\nAppelle le 3114.",
    rows: [{ sentence: "Appelle le 15.", numbers: ["15"] }],
    failures: [unpinnedFailure(["3114"], "Appelle le 3114.")],
  },
  {
    name: "a 15 minute wait is not a number",
    text: "Attends dans 15 minutes.",
    rows: [],
    failures: [],
  },
];

it.each(noSplitCases)("does not report a split for $name", ({ text, rows, failures }) => {
  expect(promptNumberPinFailures(text, rows)).toEqual(failures);
});

const notOneToOne = (index: number, excerpt: string): string =>
  `prompt is not 1:1 under emergency normalization at index ${index}: "${excerpt}"`;

it("fails closed when normalization changes the prompt length", () => {
  expect(promptNumberPinFailures("Attends… Appelle le 15.", [])).toEqual([
    notOneToOne(7, "… Appelle le 15."),
  ]);
});

const romanRepro = [
  "Règles.",
  ...Array.from({ length: 10 }, (_, offset) => `  - règle ${offset + 1}.`),
  "Tu refuses les appels au SOS.",
  "Médecins… voir… voir… voir… voir…",
].join("\n");
const sosRow: PromptNumberRow = {
  sentence: "Tu refuses les appels au SOS.",
  numbers: ["sos"],
};

it("fails closed on the indentation plus ellipsis repro that shifted spans into a sentence", () => {
  expect(romanRepro.length).toBe(normalizedLengthOf(romanRepro));
  expect(promptNumberPinFailures(romanRepro, [sosRow])).toEqual([
    notOneToOne(9, " - règle 1.\\n  - règl"),
  ]);
});

it("fails closed on a zero-width space pair cancelled by a ligature", () => {
  const text = "\u200B\u200BTu refuses les appels au SOS.\nMédecinsﬃ";
  expect(text.length).toBe(normalizedLengthOf(text));
  expect(promptNumberPinFailures(text, [sosRow])).toEqual([
    notOneToOne(0, "\\u200B\\u200BTu refuses les app"),
  ]);
});

function normalizedLengthOf(text: string): number {
  return detectEmergencyNumbers(text).normalized.length;
}

type OneToOneCase = {
  readonly name: string;
  readonly text: string;
  readonly index: number;
  readonly excerpt: string;
  readonly sameLength: boolean;
};

const oneToOneCases: readonly OneToOneCase[] = [
  { name: "double space and a ligature", text: "Tu  dis ﬀ.", index: 3, excerpt: " dis ﬀ.", sameLength: true },
  { name: "indentation and an ellipsis", text: "a\n   b…", index: 3, excerpt: "  b…", sameLength: true },
  { name: "ZWSP and soft hyphen and an ellipsis", text: "a\u200B\u00ADb…", index: 1, excerpt: "\\u200B\\u00ADb…", sameLength: true },
  { name: "a composing mark pair and an ellipsis", text: "e\u0301e\u0301…", index: 0, excerpt: "e\\u0301e\\u0301…", sameLength: true },
  { name: "a stripped combining mark pair and an ellipsis", text: "x\u0301y\u0301…", index: 1, excerpt: "\\u0301y\\u0301…", sameLength: true },
  { name: "a no-break space", text: "Appelle\u00A0le 15.", index: 7, excerpt: "\\u00A0le 15.", sameLength: true },
  { name: "fullwidth digits", text: "Appelle le １５.", index: 11, excerpt: "１５.", sameLength: true },
  { name: "leading whitespace", text: " Appelle le 15.", index: 0, excerpt: " Appelle le 15.", sameLength: false },
  { name: "trailing whitespace", text: "Appelle le 15. ", index: 14, excerpt: " ", sameLength: false },
  { name: "a CRLF line break", text: "Appelle.\r\nOk.", index: 8, excerpt: "\\r\\nOk.", sameLength: false },
  { name: "a letter whose lower case is two code units", text: "Appelle İ 15.", index: 8, excerpt: "İ 15.", sameLength: false },
];

it.each(oneToOneCases)(
  "fails closed when $name breaks the 1:1 normalization",
  ({ text, index, excerpt, sameLength }) => {
    if (sameLength) {
      expect(text.length).toBe(normalizedLengthOf(text));
    }
    expect(promptNumberPinFailures(text, [])).toEqual([notOneToOne(index, excerpt)]);
  },
);

type LineBreakCase = {
  readonly name: string;
  readonly text: string;
  readonly failures: readonly string[];
};

const lineBreakCases: readonly LineBreakCase[] = [
  { name: "LS", text: "Appelle le 1\u20285.", failures: [notOneToOne(12, "\\u20285.")] },
  { name: "PS", text: "Appelle le 1\u20295.", failures: [notOneToOne(12, "\\u20295.")] },
  { name: "CR", text: "Appelle le 1\r5.", failures: [notOneToOne(12, "\\r5.")] },
  { name: "CRLF", text: "Appelle le 1\r\n5.", failures: [notOneToOne(12, "\\r\\n5.")] },
  {
    name: "an unclosed « that hides the full stop",
    text: "« Appelle le 1. 5.",
    failures: [`unclosed « at index 0: "« Appelle le 1. 5."`],
  },
  {
    name: "an unclosed « on a line that ends at a newline",
    text: "« Appelle le 15.\nOk.",
    failures: [`unclosed « at index 0: "« Appelle le 15.\\nOk."`],
  },
  {
    name: "a stray »",
    text: "Appelle » le 15.",
    failures: [`stray » at index 8: "» le 15."`],
  },
];

it.each(lineBreakCases)("fails closed on $name even with an exact row", ({ text, failures }) => {
  const row: PromptNumberRow = { sentence: text, numbers: ["15"] };
  expect(promptNumberPinFailures(text, [row])).toEqual(failures);
});

it("keeps failing the plain split control as a split", () => {
  expect(promptNumberPinFailures("Appelle le 1. 5.", [])).toEqual([splitFailure("1. 5", "15")]);
});

const splitterTexts = (text: string): readonly string[] =>
  splitSentences(text).sentences.map((sentence) => sentence.text);

it.each([
  { name: "LS", text: "Appelle le 1\u20285." },
  { name: "PS", text: "Appelle le 1\u20295." },
  { name: "CR", text: "Appelle le 1\r5." },
  { name: "CRLF", text: "Appelle le 1\r\n5." },
  { name: "LF", text: "Appelle le 1\n5." },
])("splits a sentence at every shared line break: $name", ({ text }) => {
  expect(splitterTexts(text)).toEqual(["Appelle le 1", "5."]);
  expect(splitSentences(text).problems).toEqual([]);
});

it.each([
  {
    name: "LS",
    text: "« Appelle\u2028le 15. » ok.",
    open: "« Appelle\\u2028le 15. » o",
    stray: 17,
  },
  {
    name: "PS",
    text: "« Appelle\u2029le 15. » ok.",
    open: "« Appelle\\u2029le 15. » o",
    stray: 17,
  },
  { name: "CR", text: "« Appelle\rle 15. » ok.", open: "« Appelle\\rle 15. » o", stray: 17 },
  {
    name: "CRLF",
    text: "« Appelle\r\nle 15. » ok.",
    open: "« Appelle\\r\\nle 15. » ",
    stray: 18,
  },
])("resets the quote depth at a line break: $name", ({ text, open, stray }) => {
  expect(splitterTexts(text)).toEqual(["« Appelle", "le 15.", "» ok."]);
  expect(splitSentences(text).problems).toEqual([
    `unclosed « at index 0: "${open}"`,
    `stray » at index ${stray}: "» ok."`,
  ]);
});

it("reports the outermost « that stays open at the end of the text", () => {
  expect(splitSentences("« a « b » c.").problems).toEqual([`unclosed « at index 0: "« a « b » c."`]);
});

it("fails when a duplicated row copies the first row", () => {
  const [first] = promptNumberPinRows;
  expect(first).toBeDefined();
  expect(promptNumberPinFailures(systemPrompt, [first ?? sosRow, ...promptNumberPinRows])).toEqual([
    outOfOrderFailure(first?.sentence ?? ""),
  ]);
});

it("keeps one row per sentence kind: 112, SOS Médecins, SAMU, and quinze", () => {
  const text = "Pas le 112 ni SOS Médecins. Le SAMU ou le quinze.";
  const rows: readonly PromptNumberRow[] = [
    { sentence: "Pas le 112 ni SOS Médecins.", numbers: ["112", "sos"] },
    { sentence: "Le SAMU ou le quinze.", numbers: ["15", "15"] },
  ];
  expect(promptNumberPinFailures(text, rows)).toEqual([]);
});

it("checks order only among rows that matched exactly once", () => {
  const text = "Appelle le 3114.\nAppelle le 15.\nAppelle le 15.\nAppelle le 112.";
  const row3114: PromptNumberRow = { sentence: "Appelle le 3114.", numbers: ["3114"] };
  const row15: PromptNumberRow = { sentence: "Appelle le 15.", numbers: ["15"] };
  const row112: PromptNumberRow = { sentence: "Appelle le 112.", numbers: ["112"] };
  const stale: PromptNumberRow = { sentence: "Appelle le SAMU.", numbers: ["15"] };
  expect(promptNumberPinFailures(text, [row3114, row15, row112])).toEqual([
    duplicateFailure(2, row15.sentence),
  ]);
  expect(promptNumberPinFailures(text, [row112, stale, row3114])).toEqual([
    staleFailure(stale.sentence),
    outOfOrderFailure(row3114.sentence),
    unpinnedFailure(["15"], row15.sentence),
    unpinnedFailure(["15"], row15.sentence),
  ]);
});
