import { expect, it } from "vitest";
import { chatRequestLimits } from "../../../chat/request.js";
import {
  call15Now,
  call3114,
  call3114Now,
  emergencySafetySentence,
  type EmergencyCall,
} from "./emergency-templates.js";
import { checkEmergencyReply } from "./eval/check.js";
import { ensureEmergencyCalls, withoutOtherServices } from "./emergency-templates.js";
import {
  fallbackText,
  finalEmergencyReply,
  keepNonUrgentReply,
  strippedReplyFallback,
  upstreamError,
  withSafetySentence,
} from "./fallback.js";

type Case = {
  readonly name: string;
  readonly emergency: readonly EmergencyCall[] | undefined;
  readonly expected: readonly EmergencyCall[];
};

const cases: readonly Case[] = [
  { name: "emergency 15", emergency: ["15"], expected: ["15"] },
  { name: "emergency 3114 then 15", emergency: ["3114", "15"], expected: ["3114", "15"] },
  { name: "emergency 15 then 3114", emergency: ["15", "3114"], expected: ["15", "3114"] },
  { name: "no emergency", emergency: undefined, expected: [] },
];

// Same assertion as the route table, on the pure builder, so a mutated builder can be injected.
function problems(build: (emergency: readonly EmergencyCall[] | undefined) => string): string[] {
  const found: string[] = [];
  for (const item of cases) {
    const text = build(item.emergency);
    if (text === upstreamError) {
      found.push(`${item.name}: bare unavailability text`);
    }
    const urgent = item.expected.length > 0;
    if (urgent === text.includes(emergencySafetySentence)) {
      found.push(`${item.name}: safety sentence ${urgent ? "present" : "missing"}`);
    }
    const scored = text.replace(emergencySafetySentence, "").trim();
    const checked = checkEmergencyReply(scored, item.expected);
    if (!checked.pass) {
      found.push(`${item.name}: checker ${checked.reason}`);
    }
  }
  return found;
}

it("builds the 502 text for every emergency order and for a turn with none", () => {
  expect(fallbackText(["15"])).toBe(`${call15Now} ${upstreamError}`);
  expect(fallbackText(["3114", "15"])).toBe(`${call3114Now} ${call15Now} ${upstreamError}`);
  expect(fallbackText(["15", "3114"])).toBe(`${call15Now} ${call3114} ${upstreamError}`);
  expect(fallbackText(undefined)).toBe(`${emergencySafetySentence} ${upstreamError}`);
});

it("treats a lone 3114 as a non-urgent offer", () => {
  const text = fallbackText(["3114"]);
  expect(text).toBe(`${emergencySafetySentence} ${upstreamError}`);
  expect(text).not.toContain("maintenant");
});

it("passes the table on the real builder", () => {
  expect(problems(fallbackText)).toEqual([]);
});

it("fails the table on a mutated builder", () => {
  const dropsThe15 = (emergency: readonly EmergencyCall[] | undefined): string =>
    fallbackText(emergency).replace(emergencySafetySentence, "Si tu as des idées suicidaires, appelle le 3114.");
  const bare = (): string => upstreamError;
  const urgentOffer = (emergency: readonly EmergencyCall[] | undefined): string =>
    emergency === undefined ? `${call3114Now} ${upstreamError}` : fallbackText(emergency);
  const dropsOpening = (emergency: readonly EmergencyCall[] | undefined): string =>
    `${emergencySafetySentence} ${fallbackText(emergency)}`.replace(call15Now, "");
  for (const mutant of [dropsThe15, bare, urgentOffer, dropsOpening]) {
    expect(problems(mutant).length).toBeGreaterThan(0);
  }
});

it("adds the safety sentence last, once, and within the message cap", () => {
  expect(withSafetySentence("Reste au chaud.")).toBe(`Reste au chaud. ${emergencySafetySentence}`);
  expect(withSafetySentence(`Reste au chaud. ${emergencySafetySentence}`)).toBe(
    `Reste au chaud. ${emergencySafetySentence}`,
  );
  expect(withSafetySentence("")).toBe(emergencySafetySentence);
  const long = `${"Une phrase. ".repeat(500)}`;
  const capped = withSafetySentence(long);
  expect(capped.length).toBeLessThanOrEqual(chatRequestLimits.maxMessageChars);
  expect(capped.endsWith(emergencySafetySentence)).toBe(true);
  expect(capped.startsWith("Une phrase. Une phrase.")).toBe(true);
});

it("replaces a stripped-only reply with exactly the safety sentence", () => {
  expect(strippedReplyFallback).toBe(emergencySafetySentence);
});

// Model texts a review found surviving the heuristic stripper with a bad final emergency reply.
const reviewExamples: readonly { readonly text: string; readonly numbers: readonly EmergencyCall[] }[] = [
  { text: "Appelle le 1\nAppelle le 112.\n12.", numbers: ["15"] },
  { text: "Appelle le 1\n5.", numbers: ["3114", "15"] },
  { text: "Appelle le 31\n14.", numbers: ["15", "3114"] },
];

const passesAnything: typeof checkEmergencyReply = (_reply, expected) => ({
  pass: true,
  expected,
  found: [],
  reason: "ok",
});

function gatedEmergency(
  gate: (reply: string, numbers: readonly EmergencyCall[]) => string,
): string[] {
  const failures: string[] = [];
  for (const item of reviewExamples) {
    const reply = gate(ensureEmergencyCalls(item.text, item.numbers), item.numbers);
    if (!checkEmergencyReply(reply, item.numbers).pass) {
      failures.push(item.text);
    }
  }
  return failures;
}

it("builds an opening-only reply that passes the checker for every emergency order", () => {
  for (const numbers of [["15"], ["3114", "15"], ["15", "3114"]] as const) {
    expect(checkEmergencyReply(ensureEmergencyCalls("", numbers), numbers).pass).toBe(true);
  }
});

it("gates a final emergency reply the checker rejects down to the opening only", () => {
  expect(gatedEmergency((reply, numbers) => finalEmergencyReply(reply, numbers))).toEqual([]);
  for (const item of reviewExamples) {
    const reply = ensureEmergencyCalls(item.text, item.numbers);
    const gated = finalEmergencyReply(reply, item.numbers);
    expect(gated === reply || gated === ensureEmergencyCalls("", item.numbers)).toBe(true);
  }
});

it("leaves a final emergency reply the checker accepts untouched", () => {
  const reply = ensureEmergencyCalls("Reste avec lui.", ["15"]);
  expect(finalEmergencyReply(reply, ["15"])).toBe(reply);
});

it("fails the emergency examples when the gate is an identity", () => {
  const identity = (reply: string): string => reply;
  expect(gatedEmergency(identity).length).toBeGreaterThan(0);
  const passing = (reply: string, numbers: readonly EmergencyCall[]): string =>
    finalEmergencyReply(reply, numbers, passesAnything);
  expect(gatedEmergency(passing).length).toBeGreaterThan(0);
});

it("replaces a non-urgent reply that carries 112 or SOS Médecins with the safety sentence", () => {
  const joined = withoutOtherServices("Appelle le 1\nAppelle le 112.\n12.");
  expect(keepNonUrgentReply(`${joined} Appelle le 112.`)).toBe(strippedReplyFallback);
  expect(keepNonUrgentReply("Appelle SOS Médecins.")).toBe(strippedReplyFallback);
  expect(keepNonUrgentReply("Appelle le 112 ou le 15.")).toBe(strippedReplyFallback);
});

it("keeps a non-urgent reply that only fails for other reasons", () => {
  expect(keepNonUrgentReply("Appelle le 15.")).toBe("Appelle le 15.");
  expect(keepNonUrgentReply("Repose-toi.")).toBe("Repose-toi.");
  expect(keepNonUrgentReply("Appelle le 112.", passesAnything)).toBe("Appelle le 112.");
});
