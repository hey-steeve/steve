import { expect, it } from "vitest";
import { checkEmergencyReply } from "./eval/check.ts";
import {
  call15Now,
  call3114,
  call3114Now,
  emergencySafetySentence,
  ensureEmergencyCalls,
  normalizeEmergencyText,
  refusal112,
  refusalSos,
  withoutOtherServices,
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
    result: "Appelle le 15 maintenant.",
  },
  {
    reply: "Appelle le 3114.",
    calls: ["15", "3114"],
    result: "Appelle le 15 maintenant. Appelle le 3114.",
  },
  {
    reply: "Oui, appelle le 15 maintenant.",
    calls: ["15"],
    result: "Appelle le 15 maintenant.",
  },
  {
    reply: "« Appelle le 15 maintenant. »",
    calls: ["15"],
    result: "Appelle le 15 maintenant.",
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

const punctuationTail = "Appelle le 3114 maintenant. ... Ils t'écoutent.";

const punctuationTailRows = [
  {
    reply: punctuationTail,
    calls: ["15"],
    result: "Appelle le 15 maintenant. Appelle le 3114 maintenant. Ils t'écoutent.",
  },
  {
    reply: punctuationTail,
    calls: ["15", "3114"],
    result: "Appelle le 15 maintenant. Appelle le 3114.",
  },
  {
    reply: punctuationTail,
    calls: ["3114", "15"],
    result: "Appelle le 3114 maintenant. Appelle le 15 maintenant.",
  },
] as const;

it("moves a listening tail past a punctuation-only piece and drops that piece with the tail", () => {
  for (const row of punctuationTailRows) {
    const output = ensureEmergencyCalls(row.reply, [...row.calls]);
    expect(output, JSON.stringify(row.calls)).toBe(row.result);
    expect(output, JSON.stringify(row.calls)).not.toContain("... Ils t'écoutent.");
  }
});

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
    const sentence = reply.slice(start, atEnd ? reply.length : end + 1).trim();
    if (sentence.length > 0) {
      sentences.push(sentence);
    }
    if (atEnd) {
      break;
    }
    start = end + 1;
    index = start;
  }
  return sentences;
}

const modelPunctuationRows = [
  {
    reply: "Si ça empire... Respire lentement… Tu es en sécurité ?!",
    calls: ["3114"],
  },
  {
    reply:
      "Appelle le 15 maintenant. Si ça empire... Respire lentement… Tu es en sécurité ?!",
    calls: ["15"],
  },
  {
    reply:
      "Appelle le 15 maintenant. Appelle le 3114. Si ça empire... Respire lentement… Tu es en sécurité ?!",
    calls: ["15", "3114"],
  },
  {
    reply: "Si ça empire... Respire lentement… Tu es en sécurité ?!",
    calls: ["3114", "15"],
  },
  {
    reply: "Si ça empire... Respire lentement… Tu es en sécurité ?!",
    calls: ["15"],
  },
  {
    reply: "Reste au chaud. ... Si ça empire.",
    calls: ["15"],
  },
  {
    reply: "Reste au chaud. ?! Si ça empire.",
    calls: ["15"],
  },
] as const;

const namesANumber = /(?<![0-9])(?:15|3114|112)(?![0-9])|sos|samu|quinze/;

function keptBodySentence(sentence: string): boolean {
  const normalized = normalizeEmergencyText(sentence);
  return (
    !exactCallTemplateNorms.has(normalized) &&
    !closedListeningTails.has(normalized) &&
    !namesANumber.test(normalized) &&
    /[\p{L}\p{N}]/u.test(normalized)
  );
}

it("keeps every sentence that is not an exact call template or a closed listening tail", () => {
  const guarded = [
    ...rows,
    ...listeningTailRows,
    ...mustKeepRows,
    ...modelPunctuationRows,
  ];
  const missing: string[] = [];
  for (const row of guarded) {
    const output = ensureEmergencyCalls(row.reply, [...row.calls]);
    const pool = helperSentences(output);
    for (const sentence of helperSentences(row.reply).filter(keptBodySentence)) {
      const at = pool.indexOf(sentence);
      if (at < 0) {
        missing.push(
          [
            `missing ${JSON.stringify(sentence)}`,
            `calls ${JSON.stringify(row.calls)}`,
            `input ${JSON.stringify(row.reply)}`,
            `output ${JSON.stringify(output)}`,
          ].join("\n"),
        );
        continue;
      }
      pool.splice(at, 1);
    }
  }
  expect(missing).toEqual([]);
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

// The live path owns the numbers of a flagged turn. These rows are what the old path let through.
const strippedRows = [
  { reply: "Appelle plutôt le 112.", calls: ["15"], result: call15Now },
  { reply: "Appelle SOS Médecins.", calls: ["15"], result: call15Now },
  { reply: "Appelle S.O.S Médecins. Reste calme.", calls: ["15"], result: `${call15Now} Reste calme.` },
  { reply: "Appelez le cent douze. Reste calme.", calls: ["15"], result: `${call15Now} Reste calme.` },
  { reply: "Appelle le 1 1 2. Reste calme.", calls: ["15"], result: `${call15Now} Reste calme.` },
  { reply: "Appelez le 15.", calls: ["15"], result: call15Now },
  { reply: "Appelle le SAMU. Reste calme.", calls: ["15"], result: `${call15Now} Reste calme.` },
  { reply: "Appelle le quinze. Reste calme.", calls: ["15"], result: `${call15Now} Reste calme.` },
  { reply: `${call15Now} Appelle le 15. Reste calme.`, calls: ["15"], result: `${call15Now} Reste calme.` },
  {
    reply: `${call15Now} ${call15Now} Reste calme.`,
    calls: ["15"],
    result: `${call15Now} Reste calme.`,
  },
  {
    reply: "Le 3114 est gratuit. Reste calme.",
    calls: ["15"],
    result: `${call15Now} Reste calme.`,
  },
  {
    reply: "Appelle le 112. Appelle SOS Médecins. Appelle le 15.",
    calls: ["3114", "15"],
    result: `${call3114Now} ${call15Now}`,
  },
  {
    reply: `${call3114Now} ${call15Now} Appelle le 15. Reste calme.`,
    calls: ["3114", "15"],
    result: `${call3114Now} ${call15Now} Reste calme.`,
  },
  {
    reply: `${call15Now} ${call3114} Appelez le 15, ou le 112. Reste calme.`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114} Reste calme.`,
  },
  { reply: "Bois 1.5 litre d'eau. Reste calme.", calls: ["15"], result: `${call15Now} Reste calme.` },
  { reply: "Appelle le 112. Reste calme.", calls: ["3114"], result: "Reste calme." },
  { reply: "Appelle SOS Médecins.", calls: ["3114"], result: "" },
  { reply: "Reste calme. Appelle le 15.", calls: ["3114"], result: "Reste calme. Appelle le 15." },
] as const;

it("strips every other sentence that names 112, SOS Médecins or a second 15", () => {
  for (const row of strippedRows) {
    expect(ensureEmergencyCalls(row.reply, [...row.calls]), row.reply).toBe(row.result);
  }
});

it("drops advice that names the 15 again, even after a listening tail", () => {
  for (const warning of [breathingWarning, painWarning]) {
    expect(ensureEmergencyCalls(`Appelle le 3114. ${warning}`, ["15", "3114"]), warning).toBe(
      `${call15Now} ${call3114}`,
    );
    expect(ensureEmergencyCalls(`Appelle le 3114. ${warning}`, ["3114", "15"]), warning).toBe(
      `${call3114Now} ${call15Now}`,
    );
  }
});

it("makes every live output pass the emergency checker", () => {
  const modelTexts = [
    "Reste calme.",
    "Appelle plutôt le 112. Reste calme.",
    "Appelle SOS Médecins. Reste calme.",
    "S.O.S Médecins peut venir. Reste calme.",
    "Appelle le cent douze.",
    "Appelle le 1-1-2.",
    "Appelle le SAMU. Reste calme.",
    "Appelle le quinze.",
    "Si ça empire, appelle le 15 maintenant. Reste calme.",
    "Appelle le 15. Appelle le 15. Reste calme.",
    `${call15Now} ${call15Now}`,
    "Le 15 est joignable. Le 3114 aussi. Reste calme.",
    "Appelle le 3114, puis le 15.",
    "Bois 1.5 litre d'eau. Reste calme.",
    "Reste calme.\nAppelle le 112.\nRespire lentement.",
    "",
  ];
  const orders = [["15"], ["3114", "15"], ["15", "3114"]] as const;
  for (const calls of orders) {
    for (const text of modelTexts) {
      const output = ensureEmergencyCalls(text, [...calls]);
      const checked = checkEmergencyReply(output, [...calls]);
      expect(checked.pass, `${calls.join(",")} ${JSON.stringify(text)} -> ${JSON.stringify(output)} ${checked.reason}`).toBe(true);
    }
  }
});

it("removes the refusal sentences too, since the checker fails them beside other text", () => {
  const reply = `${refusal112} ${refusalSos} Reste calme.`;
  expect(checkEmergencyReply(`${call15Now} ${reply}`, ["15"]).pass).toBe(false);
  const output = ensureEmergencyCalls(reply, ["15"]);
  expect(output).toBe(`${call15Now} Reste calme.`);
  expect(checkEmergencyReply(output, ["15"]).pass).toBe(true);
  // Without an emergency opening the exact refusals stay. See the test below.
  expect(withoutOtherServices(reply)).toBe(reply);
});

it("keeps the exact refusal sentences on a turn without an emergency opening", () => {
  const refusals = `${refusal112} ${refusalSos}`;
  expect(withoutOtherServices(refusals)).toBe(refusals);
  expect(withoutOtherServices(refusal112)).toBe(refusal112);
  expect(withoutOtherServices(refusalSos)).toBe(refusalSos);
  expect(withoutOtherServices(refusals.toUpperCase())).toBe(refusals.toUpperCase());
  expect(withoutOtherServices(refusal112.replace("'", "\u2019"))).toBe(
    refusal112.replace("'", "\u2019"),
  );
  expect(withoutOtherServices(`${refusal112} Appelle SOS Médecins. Reste calme.`)).toBe(
    `${refusal112} Reste calme.`,
  );
  expect(withoutOtherServices("Je ne te donne pas le 112, mais appelle-le.")).toBe("");
  expect(ensureEmergencyCalls(refusals, ["3114"])).toBe(refusals);
  expect(checkEmergencyReply(refusals, []).pass).toBe(true);
});

it("still strips the refusal sentences when the opening carries the 15", () => {
  const refusals = `${refusal112} ${refusalSos}`;
  expect(ensureEmergencyCalls(refusals, ["15"])).toBe(call15Now);
  expect(ensureEmergencyCalls(refusals, ["3114", "15"])).toBe(`${call3114Now} ${call15Now}`);
});

it("keeps a sentence whose only 15 is a duration or a clock time that the checker accepts", () => {
  const sentences = [
    "Reste près de lui pendant 15 minutes.",
    "Attends 15 minutes avant de bouger.",
    "Le médecin passe dans 15 minutes.",
    "Il est sorti à 15 h.",
    "Il dort depuis quinze minutes.",
  ];
  for (const sentence of sentences) {
    for (const calls of [["15"], ["3114", "15"], ["15", "3114"]] as const) {
      const output = ensureEmergencyCalls(`${sentence} Reste calme.`, [...calls]);
      expect(output, `${calls.join(",")} ${sentence}`).toContain(sentence);
      const checked = checkEmergencyReply(output, [...calls]);
      expect(checked.pass, `${calls.join(",")} ${output} ${checked.reason}`).toBe(true);
    }
  }
});

it("still strips a sentence whose 15 is a call, even beside a duration", () => {
  const calls = ["15"] as const;
  for (const sentence of [
    "Appelle le 15 pendant 15 minutes.",
    "Pendant 15 minutes, appelle le 15.",
    "Rappelle le 15 dans 15 minutes.",
    "Appelle le SAMU dans 15 minutes.",
    "Reste 1,5 minute près de lui.",
    "Reste près de lui pendant le 15 minutes.",
  ]) {
    const output = ensureEmergencyCalls(`${sentence} Reste calme.`, [...calls]);
    expect(output, sentence).toBe(`${call15Now} Reste calme.`);
  }
});

it("only removes 112 and SOS Médecins sentences on a turn without an emergency opening", () => {
  expect(withoutOtherServices("Reste calme.")).toBe("Reste calme.");
  expect(withoutOtherServices("Appelle le 112. Reste calme.")).toBe("Reste calme.");
  expect(withoutOtherServices("Reste calme. Appelle SOS Médecins.")).toBe("Reste calme.");
  expect(withoutOtherServices("Appelle le 112.")).toBe("");
  expect(withoutOtherServices("Si ça empire, appelle le 15 maintenant.")).toBe(
    "Si ça empire, appelle le 15 maintenant.",
  );
  expect(withoutOtherServices("Le rendez-vous est à 11 h 2.")).toBe("Le rendez-vous est à 11 h 2.");
});

it("states the safety sentence once, with the 15 and then the 3114", () => {
  expect(emergencySafetySentence).toBe(
    "En cas d'urgence, appelle le 15. Si tu as des idées suicidaires, appelle le 3114.",
  );
});
