import { expect, it } from "vitest";
import { emergencyCases } from "../app/src/app/api/chat/eval/cases.ts";
import {
  ensureEmergencyCalls,
  type EmergencyCall,
} from "../app/src/app/api/chat/emergency-templates.ts";
import { systemPrompt } from "../app/src/app/api/chat/system-prompt.ts";
import { classify } from "../features/triage/src/jev.ts";

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
  readonly promptExcludes?: readonly string[];
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
    promptExcludes: [
      "Le 15 n'est pas exigé",
      "pas le 15",
      "tu ne donnes pas le 15 en première phrase",
      "Si tu le nommes, la seule phrase est",
      "Tu réserves",
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
    const opening = openingSentences(numbers ?? []);
    expect(opening.length, situation.id).toBeGreaterThan(0);
    for (const lead of situation.clauses) {
      const sentence = sentenceStarting(systemPrompt, lead);
      expect(sentence, `${situation.id} missing ${lead}`).toBeDefined();
      expect(quotedInOrder(sentence ?? "", opening), `${situation.id} ${lead}`).toBe(
        true,
      );
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
    for (const phrase of situation.promptExcludes ?? []) {
      expect(systemPrompt, phrase).not.toContain(phrase);
    }
  },
);

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

function openingSentences(calls: readonly EmergencyCall[]): string[] {
  return ensureEmergencyCalls("", calls)
    .split(/(?<=\.)\s+/)
    .filter((sentence) => sentence.length > 0);
}

function sentenceStarting(prompt: string, lead: string): string | undefined {
  for (const line of prompt.split("\n")) {
    for (const sentence of splitPromptLine(line)) {
      if (sentence.startsWith(lead)) {
        return sentence;
      }
    }
  }
  return undefined;
}

function quotedInOrder(sentence: string, opening: readonly string[]): boolean {
  let cursor = 0;
  for (const line of opening) {
    const needle = `« ${line} »`;
    const at = sentence.indexOf(needle, cursor);
    if (at < 0) {
      return false;
    }
    cursor = at + needle.length;
  }
  return true;
}

function splitPromptLine(line: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  let quote = 0;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "«") {
      quote += 1;
      continue;
    }
    if (char === "»" && quote > 0) {
      quote -= 1;
      continue;
    }
    if (quote > 0 || (char !== "." && char !== "!" && char !== "?")) {
      continue;
    }
    const next = line[index + 1];
    if (next !== undefined && !/\s/.test(next)) {
      continue;
    }
    const sentence = line.slice(start, index + 1).trim();
    if (sentence.length > 0) {
      sentences.push(sentence);
    }
    let cursor = index + 1;
    while (cursor < line.length && /\s/.test(line[cursor] ?? "")) {
      cursor += 1;
    }
    start = cursor;
    index = cursor - 1;
  }
  const tail = line.slice(start).trim();
  if (tail.length > 0) {
    sentences.push(tail);
  }
  return sentences;
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
