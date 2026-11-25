import { expect, it } from "vitest";
import { systemPrompt } from "../system-prompt.ts";
import { promptNumberPinFailures, type PromptNumberRow } from "./prompt-number-pins.ts";
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
const splitFailure = (span: string, kind: string): string =>
  `split across sentences: "${span}" (${kind}) crosses a sentence boundary`;

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
  "Si le message décrit déjà des signes de gravité, par exemple un bébé qui a de la fièvre, qui est somnolent ou qui a du mal à respirer, la première phrase";
const redFlagTail = "« Appelle le 15 maintenant. », jamais seulement une phrase conditionnelle.";
const redFlagOld = `${redFlagHead} est ${redFlagTail}`;
const redFlagNew = `${redFlagHead} n'est jamais ${redFlagTail}`;

const anxietyTail =
  "peut citer le 3114, sans l'exiger en première phrase, et cette phrase est exactement « Appelle le 3114. » ou « Appelle le 3114 maintenant. ».";
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
    name: "a decimal point is not a boundary",
    text: "Bois 1.5 litre.",
    rows: [],
    failures: [unpinnedFailure(["15"], "Bois 1.5 litre.")],
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

it("fails closed when normalization changes the prompt length", () => {
  expect(promptNumberPinFailures("Attends… Appelle le 15.", [])).toEqual([
    "prompt changes length under emergency normalization, so detected numbers cannot be mapped to sentences",
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
