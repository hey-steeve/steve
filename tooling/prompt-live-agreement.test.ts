import { expect, it } from "vitest";
import { emergencyCases, type EmergencyCase } from "../app/src/app/api/chat/eval/cases.ts";
import {
  call15Now,
  call3114Now,
  warningSignExample,
  type EmergencyCall,
} from "../app/src/app/api/chat/emergency-templates.ts";
import { systemPrompt } from "../app/src/app/api/chat/system-prompt.ts";
import { classify } from "../features/triage/src/jev.ts";
import {
  checkClause,
  clauseScope,
  completenessFailures,
  constructedReply,
  openingSentences,
  quotedCalls,
  quotedStrings,
} from "./prompt-live-agreement-guard.ts";

const labelNames = ["emergency", "consult", "self-care", "need-info"] as const;
const channelNames = ["physical", "psychological", "both", "none"] as const;

type Harm = "yes" | "no" | "absent";
type FlagName = "optional15Allowed" | "conditional15Allowed";

type Situation = {
  readonly id: string;
  readonly channel: "physical" | "psychological" | "both";
  readonly harms: readonly Harm[];
  readonly chatIds: readonly string[];
  readonly clauses: readonly string[];
  readonly absentFlags?: readonly { readonly id: string; readonly flag: FlagName }[];
};

const situations: readonly Situation[] = [
  {
    id: "physical",
    channel: "physical",
    harms: ["yes", "no", "absent"],
    chatIds: [
      "stroke",
      "breathing",
      "unconscious",
      "child-fever-red-flags",
      "overdose-accident",
      "chest-pain",
      "stroke-asks-112",
      "context-recall",
      "late-danger",
      "pushback-reassure",
    ],
    clauses: [
      "S'il n'y a pas de pensées suicidaires ni de détresse psychologique, tu dis en première phrase :",
    ],
  },
  {
    id: "psychological",
    channel: "psychological",
    harms: ["yes", "no", "absent"],
    chatIds: ["suicidal-talk", "suicidal-now", "panic-breathless"],
    clauses: [
      "Pour des pensées suicidaires sans danger aigu, tu dis en première phrase :",
      "Pour un danger aigu, un acte en cours, une surdose, une blessure d'automutilation, un plan imminent ou des moyens à portée de main, tu dis aussi en première phrase :",
      "Pour une crise de panique dont le seul signe physique est un essoufflement,",
      "Si une crise de panique n'a comme signe physique qu'un essoufflement, tu dis en première phrase :",
    ],
    absentFlags: [
      { id: "suicidal-talk", flag: "optional15Allowed" },
      { id: "panic-breathless", flag: "conditional15Allowed" },
    ],
  },
  {
    id: "both-harm-yes",
    channel: "both",
    harms: ["yes"],
    chatIds: ["overdose-suicidal", "self-harm-distress", "pushback"],
    clauses: [
      "Si une surdose ou une automutilation s'accompagne de pensées suicidaires ou de la détresse psychologique, tu dis en première phrase :",
    ],
  },
  {
    id: "both-harm-no",
    channel: "both",
    harms: ["no"],
    chatIds: ["chest-pain-panic", "panic-fainting"],
    clauses: [
      "Une crise de panique compte comme une détresse : avec une douleur thoracique ou un évanouissement, tu dis en première phrase",
      "Si un signe de gravité physique autre qu'un simple essoufflement,",
    ],
  },
];

// Prompt sentences that follow a clause but state another rule. A sentence after a
// clause lead belongs to that clause until it starts with one of these or with
// another clause lead.
const otherRuleLeads = [
  "Si le message décrit déjà des signes de gravité",
  "Une forme adoucie",
  "Une angoisse intense",
  "Tu ne mets jamais le 15 et le 3114",
] as const;

const leads = situations.flatMap((situation) => situation.clauses);
const boundaries = [...leads, ...otherRuleLeads];

function casesFor(ids: readonly string[]): EmergencyCase[] {
  return emergencyCases.filter((item) => ids.includes(item.id));
}

it("keeps every boundary lead and clause lead in the prompt", () => {
  for (const lead of boundaries) {
    expect(clauseScope(systemPrompt, lead, []), lead).toBeDefined();
  }
});

it("maps exactly the chat cases that expect a number, each once", () => {
  expect(completenessFailures(situations, emergencyCases)).toEqual([]);
  const mapped = new Set(situations.flatMap((situation) => situation.chatIds));
  const expecting = new Set(
    emergencyCases.filter((item) => item.expected.length > 0).map((item) => item.id),
  );
  expect(mapped).toEqual(expecting);
});

it.each(situations)(
  "$id prompt clauses, chat cases, and the live opening agree",
  async (situation) => {
    const numberLists = await Promise.all(
      situation.harms.map((harm) => callsFor(situation.channel, harm)),
    );
    const numbers = numberLists[0];
    expect(numbers, situation.id).toBeDefined();
    for (const list of numberLists) {
      expect(list, situation.id).toEqual(numbers);
    }
    expect(openingSentences(numbers ?? []).length, situation.id).toBeGreaterThan(0);
    for (const lead of situation.clauses) {
      // The quoted call sentences equal the live opening exactly, and the opening
      // plus every other quoted sentence of the clause passes each mapped case.
      const failures = checkClause({
        prompt: systemPrompt,
        lead,
        boundaries: boundaries.filter((boundary) => boundary !== lead),
        calls: numbers ?? [],
        cases: casesFor(situation.chatIds),
      });
      expect(failures, `${situation.id} ${lead}`).toEqual([]);
    }
    for (const id of situation.chatIds) {
      const item = emergencyCases.find((entry) => entry.id === id);
      expect(item, id).toBeDefined();
      expect(item?.expected, id).toEqual(numbers);
    }
    for (const absent of situation.absentFlags ?? []) {
      const item = emergencyCases.find((entry) => entry.id === absent.id);
      expect(flagIsTrue(item, absent.flag), `${absent.id} ${absent.flag}`).toBe(false);
    }
  },
);

// Proofs on fake input: they show each check fails without touching the prompt.
const breathless = emergencyCases.find((item) => item.id === "panic-breathless");
const fakeLead = "Si une crise de panique n'a comme signe physique qu'un essoufflement, tu dis en première phrase :";
const fakeOpener = `${fakeLead} « ${call3114Now} », puis « ${call15Now} ».`;

function fakeCheck(line: string, calls: EmergencyCall[] = ["3114", "15"]) {
  return checkClause({
    prompt: line,
    lead: fakeLead,
    boundaries: ["Tu ne mets jamais"],
    calls,
    cases: breathless === undefined ? [] : [breathless],
  });
}

it("proof: the fake breathless opener alone passes", () => {
  expect(breathless?.expected).toEqual(["3114", "15"]);
  expect(fakeCheck(`${fakeOpener} Tu ne mets jamais le 15 et le 3114 dans la même phrase.`)).toEqual([]);
});

it("proof: a quoted warning sentence after the opener fails the constructed reply", () => {
  const failures = fakeCheck(
    `${fakeOpener} Si l'essoufflement persiste, tu peux ajouter une autre phrase, exactement « ${warningSignExample} ». Tu ne mets jamais le 15 et le 3114 dans la même phrase.`,
  );
  expect(failures.map((failure) => failure.kind)).toEqual(["reply"]);
  expect(failures[0]?.detail).toContain("numbers");
});

it("proof: an extra 15 call sentence after the opening fails the exact-opening check", () => {
  const failures = fakeCheck(
    `${fakeOpener} Puis redis « ${call15Now} ». Tu ne mets jamais le 15 et le 3114 dans la même phrase.`,
  );
  expect(failures.map((failure) => failure.kind)).toContain("opening");
});

it("proof: a subsequence with another 15 quote around the opening fails", () => {
  const around = `${fakeLead} « ${call15Now} » puis « ${call3114Now} » puis « ${call15Now} ».`;
  expect(fakeCheck(around).map((failure) => failure.kind)).toContain("opening");
  const wrapped = `${fakeLead} « ${call3114Now} », puis « ${call15Now} », puis « ${call15Now} ».`;
  expect(fakeCheck(wrapped).map((failure) => failure.kind)).toContain("opening");
});

it("proof: an unquoted number in the clause fails", () => {
  const failures = fakeCheck(`${fakeOpener} Le 15 n'est pas exigé. Tu ne mets jamais le 15.`);
  expect(failures.map((failure) => failure.kind)).toContain("unquoted-number");
});

it("proof: a missing lead fails", () => {
  expect(fakeCheck("Rien ici.").map((failure) => failure.kind)).toEqual(["missing"]);
});

it("proof: a sentence after a boundary is not part of the clause", () => {
  const scope = clauseScope(
    `${fakeOpener} Tu ne mets jamais le 15 et le 3114 dans la même phrase. Redis « ${call15Now} ».`,
    fakeLead,
    ["Tu ne mets jamais"],
  );
  expect(scope).toEqual([fakeOpener]);
});

it("proof: the constructed reply keeps extra call sentences", () => {
  const opening = openingSentences(["3114", "15"]);
  const quotes = quotedStrings([`${fakeOpener} Puis « ${call15Now} » et « Merci. ».`]);
  expect(quotedCalls(quotes)).toEqual([call3114Now, call15Now, call15Now]);
  expect(constructedReply(opening, quotes)).toBe(`${call3114Now} ${call15Now} ${call15Now} Merci.`);
});

it("proof: an unmapped case that expects a number fails completeness", () => {
  const extra: EmergencyCase = {
    id: "suicidal-talk-2",
    risk: "critical",
    safe: ["SAFE-15"],
    message: "Fake",
    expected: ["3114"],
    optional15Allowed: true,
  };
  expect(completenessFailures(situations, [...emergencyCases, extra])).toEqual([
    { kind: "unmapped", id: "suicidal-talk-2" },
  ]);
  expect(
    completenessFailures([{ id: "x", chatIds: ["ghost"] }], emergencyCases).some(
      (failure) => failure.kind === "unknown" && failure.id === "ghost",
    ),
  ).toBe(true);
  expect(
    completenessFailures(
      [
        { id: "a", chatIds: ["stroke"] },
        { id: "b", chatIds: ["stroke"] },
      ],
      emergencyCases.filter((item) => item.id === "stroke"),
    ),
  ).toEqual([{ kind: "duplicate", id: "stroke" }]);
});

function flagIsTrue(item: object | undefined, flag: FlagName): boolean {
  if (item === undefined) {
    return false;
  }
  const descriptor = Object.getOwnPropertyDescriptor(item, flag);
  return descriptor?.value === true;
}

function callsFor(channel: Situation["channel"], harm: Harm): Promise<EmergencyCall[]> {
  return classifyCalls(channel, harm === "absent" ? undefined : harm);
}

async function classifyCalls(
  channel: Situation["channel"],
  harm: "yes" | "no" | undefined,
): Promise<EmergencyCall[]> {
  const result = await classify({
    state: "prompt live agreement",
    timeoutMs: 50,
    fetch: async () => Response.json(jevPayload(channel, harm)),
  });
  if (result.label !== "emergency" || !("calls" in result) || result.calls === undefined) {
    throw new Error(`${channel} ${harm ?? "absent"} returned ${result.label}`);
  }
  return result.calls.map((call) => call.number);
}

function splitProbabilities(
  options: readonly string[],
  selected: string,
  selectedP: number,
): Record<string, number> {
  const rest = (1 - selectedP) / (options.length - 1);
  const probabilities: Record<string, number> = {};
  for (const option of options) {
    probabilities[option] = option === selected ? selectedP : rest;
  }
  return probabilities;
}

function choiceAnswer(choice: string, probabilities: Record<string, number>) {
  return { type: "choice" as const, choice, confidence: 0.2, probabilities };
}

function jevPayload(channel: string, harm: "yes" | "no" | undefined) {
  const answers: Record<string, unknown> = {
    label: choiceAnswer("emergency", splitProbabilities(labelNames, "emergency", 0.9)),
    channel: choiceAnswer(channel, splitProbabilities(channelNames, channel, 0.9)),
  };
  if (harm !== undefined) {
    answers["overdoseOrSelfHarm"] = choiceAnswer(
      harm,
      splitProbabilities(["yes", "no"], harm, 0.9),
    );
  }
  return { model: "jev-1.14.0", answers };
}
