import { expect, it } from "vitest";
import { checkEmergencyReply } from "./eval/check.ts";
import {
  call15Now,
  call3114,
  call3114Now,
  ensureEmergencyCalls,
  normalizeEmergencyText,
} from "./emergency-templates.ts";

const rows = [
  {
    reply: "Reste au chaud.",
    calls: ["15"],
    result: "Appelle le 15 maintenant. Reste au chaud.",
  },
  {
    reply: "Reste au chaud.",
    calls: ["3114", "15"],
    result:
      "Appelle le 3114 maintenant. Appelle le 15 maintenant. Reste au chaud.",
  },
  {
    reply: "Reste au chaud.",
    calls: ["15", "3114"],
    result: "Appelle le 15 maintenant. Appelle le 3114. Reste au chaud.",
  },
  {
    reply: "Appelle le 15 maintenant. Reste au chaud.",
    calls: ["15", "3114"],
    result: "Appelle le 15 maintenant. Appelle le 3114. Reste au chaud.",
  },
  {
    reply: "Appelle le 15 maintenant.",
    calls: ["3114", "15"],
    result: "Appelle le 3114 maintenant. Appelle le 15 maintenant.",
  },
  {
    reply: "Appelle le 15 maintenant.\nReste calme.",
    calls: ["15", "3114"],
    result: "Appelle le 15 maintenant. Appelle le 3114.\nReste calme.",
  },
  {
    reply: "Appelle le 15 maintenant.\nAppelle le 3114.",
    calls: ["15", "3114"],
    result: "Appelle le 15 maintenant.\nAppelle le 3114.",
  },
  {
    reply: "Appelle le 3114 maintenant.\nAppelle le 15 maintenant.",
    calls: ["3114", "15"],
    result: "Appelle le 3114 maintenant.\nAppelle le 15 maintenant.",
  },
  {
    reply: "Appelle le 15 maintenant. Appelle le 3114. Reste au chaud.",
    calls: ["15", "3114"],
    result: "Appelle le 15 maintenant. Appelle le 3114. Reste au chaud.",
  },
  {
    reply: "appelle le 15 maintenant. Reste au chaud.",
    calls: ["15"],
    result: "appelle le 15 maintenant. Reste au chaud.",
  },
  {
    reply: "Reste calme. Appelle le 15 maintenant.",
    calls: ["15"],
    result: "Appelle le 15 maintenant. Reste calme.",
  },
  {
    reply: "Reste au chaud.",
    calls: [],
    result: "Reste au chaud.",
  },
  {
    reply: "Reste au chaud.",
    calls: ["3114"],
    result: "Reste au chaud.",
  },
  {
    reply: "Si l'essoufflement persiste, appelle le 15 maintenant.",
    calls: ["15"],
    result:
      "Appelle le 15 maintenant. Si l'essoufflement persiste, appelle le 15 maintenant.",
  },
  {
    reply: "Appelle le 3114.",
    calls: ["15", "3114"],
    result: "Appelle le 15 maintenant. Appelle le 3114.",
  },
  {
    reply: "Oui, appelle le 15 maintenant.",
    calls: ["15"],
    result: "Appelle le 15 maintenant. Oui, appelle le 15 maintenant.",
  },
  {
    reply: "« Appelle le 15 maintenant. »",
    calls: ["15"],
    result: "Appelle le 15 maintenant. « Appelle le 15 maintenant. »",
  },
  {
    reply: "",
    calls: ["15"],
    result: "Appelle le 15 maintenant.",
  },
  {
    reply: "Appelle le 15 maintenant.\nReste calme.",
    calls: ["15"],
    result: "Appelle le 15 maintenant.\nReste calme.",
  },
  {
    reply: "Appelle le 3114 maintenant. Appelle le 15 maintenant.",
    calls: ["15"],
    result: "Appelle le 15 maintenant. Appelle le 3114 maintenant.",
  },
  {
    reply: "Appelle le 15 maintenant. Appelle le 3114 maintenant.",
    calls: ["3114", "15"],
    result: "Appelle le 3114 maintenant. Appelle le 15 maintenant.",
  },
  {
    reply: "Appelle le 3114 maintenant. Appelle le 15 maintenant. Reste au chaud.",
    calls: ["15", "3114"],
    result: "Appelle le 15 maintenant. Appelle le 3114. Reste au chaud.",
  },
  {
    reply: "Appelle le 3114 maintenant. Reste au chaud.",
    calls: ["15"],
    result: "Appelle le 15 maintenant. Appelle le 3114 maintenant. Reste au chaud.",
  },
  {
    reply: "Appelle le 15 maintenant. Reste au chaud. Appelle le 3114 maintenant.",
    calls: ["15"],
    result: "Appelle le 15 maintenant. Appelle le 3114 maintenant. Reste au chaud.",
  },
  {
    reply: "Appelle le 3114. Appelle le 15 maintenant.",
    calls: ["15"],
    result: "Appelle le 15 maintenant. Appelle le 3114.",
  },
  {
    reply: "Appelle le 15 maintenant. Ils t'écoutent. Appelle le 3114.",
    calls: ["15", "3114"],
    result: "Appelle le 15 maintenant. Appelle le 3114.",
  },
  {
    reply: "Appelle le 3114 maintenant. Ils t'écoutent. Appelle le 15 maintenant.",
    calls: ["15"],
    result: "Appelle le 15 maintenant. Appelle le 3114 maintenant. Ils t'écoutent.",
  },
  {
    reply: "Appelle le 3114 maintenant. Ils t'écoutent",
    calls: ["15", "3114"],
    result: "Appelle le 15 maintenant. Appelle le 3114.",
  },
] as const;

it("adds every missing immediate call in calls order", () => {
  for (const row of rows) {
    expect(ensureEmergencyCalls(row.reply, row.calls), row.reply).toBe(row.result);
  }
});

const listeningTailRows = [
  {
    reply: "Appelle le 15 maintenant. Ils t'écoutent. Appelle le 3114.",
    calls: ["15", "3114"],
    result: "Appelle le 15 maintenant. Appelle le 3114.",
  },
  {
    reply: "Appelle le 3114 maintenant. Ils t'écoutent. Appelle le 15 maintenant.",
    calls: ["15"],
    result: "Appelle le 15 maintenant. Appelle le 3114 maintenant. Ils t'écoutent.",
  },
  {
    reply: "Appelle le 15 maintenant. Reste au chaud.",
    calls: ["15", "3114"],
    result: "Appelle le 15 maintenant. Appelle le 3114. Reste au chaud.",
  },
  {
    reply: "Reste calme. Appelle le 3114 maintenant. Ils t'écoutent jour et nuit.",
    calls: ["15", "3114"],
    result: "Appelle le 15 maintenant. Appelle le 3114. Reste calme.",
  },
  {
    reply: "Reste calme. Appelle le 3114 maintenant. Ils t'écoutent jour et nuit.",
    calls: ["3114", "15"],
    result: "Appelle le 3114 maintenant. Appelle le 15 maintenant. Reste calme.",
  },
  {
    reply: "Appelle le 3114 maintenant. Ils t'écoutent jour et nuit. Appelle le 15 maintenant.",
    calls: ["15"],
    result: "Appelle le 15 maintenant. Appelle le 3114 maintenant. Ils t'écoutent jour et nuit.",
  },
  {
    reply: "Reste calme. Appelle le 3114 maintenant. Ils t'écoutent jour et nuit.",
    calls: ["15"],
    result:
      "Appelle le 15 maintenant. Appelle le 3114 maintenant. Ils t'écoutent jour et nuit. Reste calme.",
  },
  {
    reply: "Reste au chaud. Appelle le 3114 maintenant. Ils t'écoutent",
    calls: ["15"],
    result:
      "Appelle le 15 maintenant. Appelle le 3114 maintenant. Ils t'écoutent. Reste au chaud.",
  },
] as const;

function exactOnlyListeningTail(sentence: string): boolean {
  const normalized = normalizeEmergencyText(sentence);
  return (
    normalized === normalizeEmergencyText("Ils t'écoutent") ||
    normalized === normalizeEmergencyText("Ils t'écoutent.")
  );
}

it("drops a listening tail with a removed call and keeps one on a kept 3114", () => {
  for (const row of listeningTailRows) {
    expect(ensureEmergencyCalls(row.reply, [...row.calls]), row.reply).toBe(row.result);
  }
  const jourEtNuit = "Ils t'écoutent jour et nuit.";
  expect(exactOnlyListeningTail(jourEtNuit)).toBe(false);
  expect(exactOnlyListeningTail("Ils t'écoutent.")).toBe(true);
  expect(exactOnlyListeningTail("Ils t'écoutent")).toBe(true);
  expect(exactOnlyListeningTail("Reste calme.")).toBe(false);
  expect(exactOnlyListeningTail("Reste au chaud.")).toBe(false);
});

const breathingWarning =
  "Ils t'écoutent, et si tu as du mal à respirer, appelle le 15 maintenant.";
const painWarning =
  "Ils t'écoutent ; si la douleur augmente, rappelle le 15 maintenant.";
const worsenWarning = "Ils t'écoutent : n'hésite pas à rappeler si ça empire.";
const tonightWarning = "Ils t'écoutent 24h/24, mais ne reste pas seul ce soir.";

const mustKeepRows = [
  {
    reply: `Appelle le 3114. ${breathingWarning}`,
    calls: ["15", "3114"],
    result: `Appelle le 15 maintenant. Appelle le 3114. ${breathingWarning}`,
  },
  {
    reply: `Appelle le 3114 maintenant. ${breathingWarning}`,
    calls: ["3114", "15"],
    result: `Appelle le 3114 maintenant. Appelle le 15 maintenant. ${breathingWarning}`,
  },
  {
    reply: `Appelle le 3114. ${breathingWarning}`,
    calls: ["15"],
    result: `Appelle le 15 maintenant. Appelle le 3114. ${breathingWarning}`,
  },
  {
    reply: `Appelle le 3114. ${painWarning}`,
    calls: ["15", "3114"],
    result: `Appelle le 15 maintenant. Appelle le 3114. ${painWarning}`,
  },
  {
    reply: `Appelle le 3114 maintenant. ${painWarning}`,
    calls: ["3114", "15"],
    result: `Appelle le 3114 maintenant. Appelle le 15 maintenant. ${painWarning}`,
  },
  {
    reply: `Appelle le 3114. ${painWarning}`,
    calls: ["15"],
    result: `Appelle le 15 maintenant. Appelle le 3114. ${painWarning}`,
  },
  {
    reply: `Appelle le 3114. ${worsenWarning}`,
    calls: ["15", "3114"],
    result: `Appelle le 15 maintenant. Appelle le 3114. ${worsenWarning}`,
  },
  {
    reply: `Appelle le 3114 maintenant. ${worsenWarning}`,
    calls: ["3114", "15"],
    result: `Appelle le 3114 maintenant. Appelle le 15 maintenant. ${worsenWarning}`,
  },
  {
    reply: `Appelle le 3114. ${worsenWarning}`,
    calls: ["15"],
    result: `Appelle le 15 maintenant. Appelle le 3114. ${worsenWarning}`,
  },
  {
    reply: `Appelle le 3114. ${tonightWarning}`,
    calls: ["15", "3114"],
    result: `Appelle le 15 maintenant. Appelle le 3114. ${tonightWarning}`,
  },
  {
    reply: `Appelle le 3114 maintenant. ${tonightWarning}`,
    calls: ["3114", "15"],
    result: `Appelle le 3114 maintenant. Appelle le 15 maintenant. ${tonightWarning}`,
  },
  {
    reply: `Appelle le 3114. ${tonightWarning}`,
    calls: ["15"],
    result: `Appelle le 15 maintenant. Appelle le 3114. ${tonightWarning}`,
  },
] as const;

it("keeps model advice that is not a whole-sentence listening tail", () => {
  for (const row of mustKeepRows) {
    expect(
      ensureEmergencyCalls(row.reply, [...row.calls]),
      `${JSON.stringify(row.calls)} ${row.reply}`,
    ).toBe(row.result);
  }
});

const closedListeningTails = new Set([
  normalizeEmergencyText("Ils t'écoutent"),
  normalizeEmergencyText("Ils t'écoutent."),
  normalizeEmergencyText("Ils t'écoutent jour et nuit."),
]);

const exactCallTemplateNorms = new Set([
  normalizeEmergencyText(call15Now),
  normalizeEmergencyText(call3114Now),
  normalizeEmergencyText(call3114),
]);

function helperSentences(reply: string): string[] {
  const sentences: string[] = [];
  let start = 0;
  for (let index = 0; index <= reply.length; index += 1) {
    const atEnd = index === reply.length;
    const char = atEnd ? "" : reply[index];
    const boundary = !atEnd && (char === "." || char === "!" || char === "?" || char === "\n");
    if (!atEnd && !boundary) {
      continue;
    }
    const sentence = reply.slice(start, atEnd ? reply.length : index + 1).trim();
    if (sentence.length > 0) {
      sentences.push(sentence);
    }
    if (atEnd) {
      break;
    }
    start = index + 1;
  }
  return sentences;
}

function keptBodySentence(sentence: string): boolean {
  const normalized = normalizeEmergencyText(sentence);
  return !exactCallTemplateNorms.has(normalized) && !closedListeningTails.has(normalized);
}

it("keeps every sentence that is not an exact call template or a closed listening tail", () => {
  const guarded = [...rows, ...listeningTailRows, ...mustKeepRows];
  for (const row of guarded) {
    const output = ensureEmergencyCalls(row.reply, [...row.calls]);
    const pool = helperSentences(output);
    for (const sentence of helperSentences(row.reply).filter(keptBodySentence)) {
      const at = pool.indexOf(sentence);
      expect(
        at,
        [
          `missing ${JSON.stringify(sentence)}`,
          `calls ${JSON.stringify(row.calls)}`,
          `input ${JSON.stringify(row.reply)}`,
          `output ${JSON.stringify(output)}`,
        ].join("\n"),
      ).toBeGreaterThanOrEqual(0);
      if (at >= 0) {
        pool.splice(at, 1);
      }
    }
  }
});

const doubledPunctuation = /[.!?]{2}/;

it("never emits doubled punctuation", () => {
  const ellipsisTail = {
    reply: "Appelle le 3114 maintenant. Ils t'écoutent...",
    calls: ["15"],
  } as const;
  const guarded = [...rows, ...listeningTailRows, ...mustKeepRows, ellipsisTail];
  for (const row of guarded) {
    const output = ensureEmergencyCalls(row.reply, [...row.calls]);
    expect(output, output).not.toMatch(doubledPunctuation);
  }
  expect(ensureEmergencyCalls(ellipsisTail.reply, [...ellipsisTail.calls])).toBe(
    "Appelle le 15 maintenant. Appelle le 3114 maintenant. Ils t'écoutent.",
  );
});

it("passes the emergency checker after it puts calls in order", () => {
  const kept = ensureEmergencyCalls(
    "Appelle le 3114 maintenant. Appelle le 15 maintenant.",
    ["15"],
  );
  expect(kept).toBe("Appelle le 15 maintenant. Appelle le 3114 maintenant.");
  expect(checkEmergencyReply(kept, ["15"]).pass).toBe(false);
  expect(checkEmergencyReply(kept, ["15"], { optional3114Allowed: true }).pass).toBe(true);
  const cases = [
    ["Appelle le 15 maintenant. Appelle le 3114 maintenant.", ["3114", "15"]],
    ["Appelle le 3114 maintenant. Appelle le 15 maintenant.", ["15", "3114"]],
    ["Reste calme. Appelle le 15 maintenant.", ["15"]],
  ] as const;
  for (const [reply, calls] of cases) {
    const result = ensureEmergencyCalls(reply, calls);
    expect(checkEmergencyReply(result, [...calls]).pass, result).toBe(true);
  }
});
