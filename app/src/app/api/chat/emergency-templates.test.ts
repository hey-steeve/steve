import { expect, it } from "vitest";
import { checkEmergencyReply, detectEmergencyNumbers } from "./eval/check.ts";
import {
  apostropheChars,
  call15Now,
  call3114,
  call3114Now,
  ensureEmergencyCalls,
  foldApostrophes,
  lineBreakChars,
  normalizeEmergencyText,
} from "./emergency-templates.ts";

const rows = [
  {
    reply: "Reste au chaud.",
    calls: ["15"],
    result: `${call15Now} Reste au chaud.`,
  },
  {
    reply: "Reste au chaud.",
    calls: ["3114", "15"],
    result:
      `${call3114Now} ${call15Now} Reste au chaud.`,
  },
  {
    reply: "Reste au chaud.",
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114} Reste au chaud.`,
  },
  {
    reply: `${call15Now} Reste au chaud.`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114} Reste au chaud.`,
  },
  {
    reply: `${call15Now}`,
    calls: ["3114", "15"],
    result: `${call3114Now} ${call15Now}`,
  },
  {
    reply: `${call15Now}\nReste calme.`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114}\nReste calme.`,
  },
  {
    reply: `${call15Now}\n${call3114}`,
    calls: ["15", "3114"],
    result: `${call15Now}\n${call3114}`,
  },
  {
    reply: `${call3114Now}\n${call15Now}`,
    calls: ["3114", "15"],
    result: `${call3114Now}\n${call15Now}`,
  },
  {
    reply: `${call15Now} ${call3114} Reste au chaud.`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114} Reste au chaud.`,
  },
  {
    reply: `${call15Now.toLowerCase()} Reste au chaud.`,
    calls: ["15"],
    result: `${call15Now.toLowerCase()} Reste au chaud.`,
  },
  {
    reply: `Reste calme. ${call15Now}`,
    calls: ["15"],
    result: `${call15Now} Reste calme.`,
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
      `${call15Now} Si l'essoufflement persiste, appelle le 15 maintenant.`,
  },
  {
    reply: `${call3114}`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114}`,
  },
  {
    reply: "Oui, appelle le 15 maintenant.",
    calls: ["15"],
    result: `${call15Now} Oui, appelle le 15 maintenant.`,
  },
  {
    reply: `« ${call15Now} »`,
    calls: ["15"],
    result: `${call15Now} « ${call15Now} »`,
  },
  {
    reply: "",
    calls: ["15"],
    result: `${call15Now}`,
  },
  {
    reply: `${call15Now}\nReste calme.`,
    calls: ["15"],
    result: `${call15Now}\nReste calme.`,
  },
  {
    reply: `${call3114Now} ${call15Now}`,
    calls: ["15"],
    result: `${call15Now} ${call3114Now}`,
  },
  {
    reply: `${call15Now} ${call3114Now}`,
    calls: ["3114", "15"],
    result: `${call3114Now} ${call15Now}`,
  },
  {
    reply: `${call3114Now} ${call15Now} Reste au chaud.`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114} Reste au chaud.`,
  },
  {
    reply: `${call3114Now} Reste au chaud.`,
    calls: ["15"],
    result: `${call15Now} ${call3114Now} Reste au chaud.`,
  },
  {
    reply: `${call15Now} Reste au chaud. ${call3114Now}`,
    calls: ["15"],
    result: `${call15Now} ${call3114Now} Reste au chaud.`,
  },
  {
    reply: `${call3114} ${call15Now}`,
    calls: ["15"],
    result: `${call15Now} ${call3114}`,
  },
  {
    reply: `${call15Now} Ils t'écoutent. ${call3114}`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114}`,
  },
  {
    reply: `${call3114Now} Ils t'écoutent. ${call15Now}`,
    calls: ["15"],
    result: `${call15Now} ${call3114Now} Ils t'écoutent.`,
  },
  {
    reply: `${call3114Now} Ils t'écoutent`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114}`,
  },
] as const;

it("adds every missing immediate call in calls order", () => {
  for (const row of rows) {
    expect(ensureEmergencyCalls(row.reply, row.calls), row.reply).toBe(row.result);
  }
});

const listeningTailRows = [
  {
    reply: `${call15Now} Ils t'écoutent. ${call3114}`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114}`,
  },
  {
    reply: `${call3114Now} Ils t'écoutent. ${call15Now}`,
    calls: ["15"],
    result: `${call15Now} ${call3114Now} Ils t'écoutent.`,
  },
  {
    reply: `${call15Now} Reste au chaud.`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114} Reste au chaud.`,
  },
  {
    reply: `Reste calme. ${call3114Now} Ils t'écoutent jour et nuit.`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114} Reste calme.`,
  },
  {
    reply: `Reste calme. ${call3114Now} Ils t'écoutent jour et nuit.`,
    calls: ["3114", "15"],
    result: `${call3114Now} ${call15Now} Reste calme.`,
  },
  {
    reply: `${call3114Now} Ils t'écoutent jour et nuit. ${call15Now}`,
    calls: ["15"],
    result: `${call15Now} ${call3114Now} Ils t'écoutent jour et nuit.`,
  },
  {
    reply: `Reste calme. ${call3114Now} Ils t'écoutent jour et nuit.`,
    calls: ["15"],
    result:
      `${call15Now} ${call3114Now} Ils t'écoutent jour et nuit. Reste calme.`,
  },
  {
    reply: `Reste au chaud. ${call3114Now} Ils t'écoutent`,
    calls: ["15"],
    result:
      `${call15Now} ${call3114Now} Ils t'écoutent. Reste au chaud.`,
  },
] as const;

function exactOnlyListeningTail(sentence: string): boolean {
  const normalized = normalizeEmergencyText(sentence);
  return (
    normalized === normalizeEmergencyText("Ils t'écoutent") ||
    normalized === normalizeEmergencyText("Ils t'écoutent.")
  );
}

const punctuationTail = `${call3114Now} ... Ils t'écoutent.`;

const punctuationTailRows = [
  {
    reply: punctuationTail,
    calls: ["15"],
    result: `${call15Now} ${call3114Now} Ils t'écoutent.`,
  },
  {
    reply: punctuationTail,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114}`,
  },
  {
    reply: punctuationTail,
    calls: ["3114", "15"],
    result: `${call3114Now} ${call15Now}`,
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
    reply: `${call3114} ${breathingWarning}`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114} ${breathingWarning}`,
  },
  {
    reply: `${call3114Now} ${breathingWarning}`,
    calls: ["3114", "15"],
    result: `${call3114Now} ${call15Now} ${breathingWarning}`,
  },
  {
    reply: `${call3114} ${breathingWarning}`,
    calls: ["15"],
    result: `${call15Now} ${call3114} ${breathingWarning}`,
  },
  {
    reply: `${call3114} ${painWarning}`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114} ${painWarning}`,
  },
  {
    reply: `${call3114Now} ${painWarning}`,
    calls: ["3114", "15"],
    result: `${call3114Now} ${call15Now} ${painWarning}`,
  },
  {
    reply: `${call3114} ${painWarning}`,
    calls: ["15"],
    result: `${call15Now} ${call3114} ${painWarning}`,
  },
  {
    reply: `${call3114} ${worsenWarning}`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114} ${worsenWarning}`,
  },
  {
    reply: `${call3114Now} ${worsenWarning}`,
    calls: ["3114", "15"],
    result: `${call3114Now} ${call15Now} ${worsenWarning}`,
  },
  {
    reply: `${call3114} ${worsenWarning}`,
    calls: ["15"],
    result: `${call15Now} ${call3114} ${worsenWarning}`,
  },
  {
    reply: `${call3114} ${tonightWarning}`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114} ${tonightWarning}`,
  },
  {
    reply: `${call3114Now} ${tonightWarning}`,
    calls: ["3114", "15"],
    result: `${call3114Now} ${call15Now} ${tonightWarning}`,
  },
  {
    reply: `${call3114} ${tonightWarning}`,
    calls: ["15"],
    result: `${call15Now} ${call3114} ${tonightWarning}`,
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

const exactCallTemplateNorms = new Set(
  [call15Now, call3114Now, call3114].flatMap((block) =>
    helperSentences(block).map(normalizeEmergencyText),
  ),
);

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
      `${call15Now} Si ça empire... Respire lentement… Tu es en sécurité ?!`,
    calls: ["15"],
  },
  {
    reply:
      `${call15Now} ${call3114} Si ça empire... Respire lentement… Tu es en sécurité ?!`,
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

function keptBodySentence(sentence: string): boolean {
  const normalized = normalizeEmergencyText(sentence);
  return !exactCallTemplateNorms.has(normalized) && !closedListeningTails.has(normalized);
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
    reply: `${call3114Now} Ils t'écoutent...`,
    calls: ["15"],
  } as const;
  const guarded = [...rows, ...listeningTailRows, ...mustKeepRows, ellipsisTail];
  for (const row of guarded) {
    const output = ensureEmergencyCalls(row.reply, [...row.calls]);
    expect(output, output).not.toMatch(doubledPunctuation);
  }
  expect(ensureEmergencyCalls(ellipsisTail.reply, [...ellipsisTail.calls])).toBe(
    `${call15Now} ${call3114Now} Ils t'écoutent.`,
  );
});

it("passes the emergency checker after it puts calls in order", () => {
  const kept = ensureEmergencyCalls(
    `${call3114Now} ${call15Now}`,
    ["15"],
  );
  expect(kept).toBe(`${call15Now} ${call3114Now}`);
  expect(checkEmergencyReply(kept, ["15"]).pass).toBe(false);
  expect(checkEmergencyReply(kept, ["15"], { optional3114Allowed: true }).pass).toBe(true);
  const cases = [
    [`${call15Now} ${call3114Now}`, ["3114", "15"]],
    [`${call3114Now} ${call15Now}`, ["15", "3114"]],
    [`Reste calme. ${call15Now}`, ["15"]],
  ] as const;
  for (const [reply, calls] of cases) {
    const result = ensureEmergencyCalls(reply, calls);
    expect(checkEmergencyReply(result, [...calls]).pass, result).toBe(true);
  }
});

it("normalizes every shared apostrophe variant to a plain apostrophe", () => {
  expect([...apostropheChars]).toHaveLength(12);
  for (const char of apostropheChars) {
    expect(foldApostrophes(`a${char}b`), char).toBe("a'b");
    // NFKC turns U+00B4 into a space before the fold runs, so it never reaches it.
    const expected = char === "\u00B4" ? "a b" : "a'b";
    expect(normalizeEmergencyText(`a${char}b`), char).toBe(expected);
  }
});

it("normalizes every shared line break to a newline and CRLF to one", () => {
  expect([...lineBreakChars]).toHaveLength(4);
  for (const char of lineBreakChars) {
    expect(normalizeEmergencyText(`a${char}b`), JSON.stringify(char)).toBe("a\nb");
  }
  expect(normalizeEmergencyText("a\r\nb")).toBe("a\nb");
});

it("opens with a full multi-sentence block and keeps a correct opening in place", () => {
  const reply = `${call15Now} ${call3114} Reste au chaud.`;
  expect(ensureEmergencyCalls(reply, ["15", "3114"])).toBe(reply);
  expect(ensureEmergencyCalls(`${call3114Now} ${call15Now}`, ["3114", "15"])).toBe(
    `${call3114Now} ${call15Now}`,
  );
});

it("does not treat a sentence taken from inside a block as a whole block", () => {
  const partial = "Je reste avec toi.";
  expect(ensureEmergencyCalls(`${partial} Reste calme.`, ["15"])).toBe(
    `${call15Now} ${partial} Reste calme.`,
  );
  const cut = "Ce que tu décris peut être grave, et je préfère qu'on ne prenne aucun risque.";
  expect(ensureEmergencyCalls(`${cut} Reste calme.`, ["15"])).toBe(
    `${call15Now} ${cut} Reste calme.`,
  );
});

it("rebuilds a lone 15 that sits after a model 3114 block", () => {
  expect(ensureEmergencyCalls(`${call3114Now} ${call15Now}`, ["15"])).toBe(
    `${call15Now} ${call3114Now}`,
  );
  expect(ensureEmergencyCalls(`${call15Now} Reste calme. ${call3114}`, ["15"])).toBe(
    `${call15Now} ${call3114} Reste calme.`,
  );
});

const stretched15 = `${call15Now.slice(0, -1)}...`;

it("does not read a stretched final period as the end of a block", () => {
  expect(checkEmergencyReply(stretched15, ["15"]).pass).toBe(false);
  expect(checkEmergencyReply(`${call15Now.slice(0, -1)}!`, ["15"]).pass).toBe(false);
  const fixed = ensureEmergencyCalls(stretched15, ["15"]);
  expect(fixed).toBe(call15Now);
  expect(checkEmergencyReply(fixed, ["15"]).pass).toBe(true);
  const withBody = ensureEmergencyCalls(`${stretched15} Reste calme.`, ["15"]);
  expect(withBody).toBe(`${call15Now} Reste calme.`);
  expect(checkEmergencyReply(withBody, ["15"]).pass).toBe(true);
});

it("does not read a stretched final period as the end of a 3114 block", () => {
  const stretched = `${call3114.slice(0, -1)}...`;
  expect(checkEmergencyReply(call3114, ["3114"]).pass).toBe(true);
  expect(checkEmergencyReply(stretched, ["3114"]).pass).toBe(false);
});

it("splits on a fullwidth period like the checker, so a reversed 15 stays single", () => {
  const wide15 = call15Now.replace("risque.", "risque．");
  const reply = `${call3114Now} ${wide15}`;
  const fixed = ensureEmergencyCalls(reply, ["15"]);
  const check = checkEmergencyReply(fixed, ["15"], { optional3114Allowed: true });
  expect(check.found).toEqual(["15", "3114"]);
  expect(check.pass).toBe(true);
});

it("never rewrites a non-exact 3114 block into an exact one", () => {
  const loose3114 = call3114Now.replace("compte.", "compte...");
  const reply = `${call15Now} ${loose3114} Je ne te donne pas le 112.`;
  const options = { optional3114Allowed: true };
  expect(checkEmergencyReply(reply, ["15"], options).pass).toBe(false);
  const fixed = ensureEmergencyCalls(reply, ["15"]);
  expect(fixed).toContain("compte... Tu n'as pas");
  expect(normalizeEmergencyText(fixed)).not.toContain(normalizeEmergencyText(call3114Now));
  expect(checkEmergencyReply(fixed, ["15"], options).pass).toBe(false);
});

it("does not join a 1 and a 12 around a removed block into a 112", () => {
  const reply = `Appelle le 1\n${call15Now}\n12.`;
  expect(detectEmergencyNumbers(reply).spans.map((span) => span.kind)).toEqual(["15"]);
  const fixed = ensureEmergencyCalls(reply, ["15"]);
  expect(fixed.startsWith(call15Now)).toBe(true);
  expect(detectEmergencyNumbers(fixed).spans.some((span) => span.kind === "112")).toBe(false);
  expect(checkEmergencyReply(fixed, ["15"]).reason).not.toContain("112");
  expect(checkEmergencyReply("Appelle le 1\n\n12.", ["15"]).reason).toContain("112");
});

it("replaces a cut opening block with the full block, once", () => {
  const cut = call15Now.slice(0, call15Now.indexOf("Je reste avec toi.") + 8);
  expect(cut.endsWith("Je reste")).toBe(true);
  const alone = ensureEmergencyCalls(cut, ["15"]);
  expect(alone).toBe(call15Now);
  const later = ensureEmergencyCalls(`${cut}\n${call15Now}`, ["15"]);
  expect(later).toBe(call15Now);
  expect(checkEmergencyReply(later, ["15"]).found).toEqual(["15"]);
  const inexact = ensureEmergencyCalls(`${cut}\nAppelle le 15 vite.`, ["15"]);
  expect(inexact.startsWith(call15Now)).toBe(true);
  expect(inexact.split("Ce que tu décris").length).toBe(2);
  expect(checkEmergencyReply(inexact, ["15"]).pass).toBe(false);
  const both = ensureEmergencyCalls(cut, ["15", "3114"]);
  expect(both).toBe(`${call15Now} ${call3114}`);
});

const cut15 = `${call15Now.slice(0, call15Now.indexOf("maintenant") + 4)}`;

it("replaces a cut 15 fragment instead of keeping it beside the full block", () => {
  const lead = ensureEmergencyCalls(cut15, ["3114", "15"]);
  expect(lead).toBe(`${call3114Now} ${call15Now}`);
  const after3114 = ensureEmergencyCalls(`${call3114Now} ${cut15}`, ["3114", "15"]);
  expect(after3114).toBe(`${call3114Now} ${call15Now}`);
  const physical = ensureEmergencyCalls(`${call3114Now} ${cut15}`, ["15"]);
  expect(physical.split("Appelle le 15").length).toBe(2);
  expect(physical.startsWith(call15Now)).toBe(true);
  expect(checkEmergencyReply(physical, ["15"], { optional3114Allowed: true }).pass).toBe(true);
});

it("still refuses to build a 112 when a block is dropped between digits", () => {
  const fixed = ensureEmergencyCalls(`Appelle le 1\n${call15Now}\n12.`, ["3114", "15"]);
  expect(detectEmergencyNumbers(fixed).spans.some((span) => span.kind === "112")).toBe(false);
});

it("does not add a second period after a moved block ending in a fullwidth period", () => {
  const wide = call3114Now.replace(/\.$/u, "．");
  const moved = ensureEmergencyCalls(`${wide} ${call15Now} Reste au chaud.`, ["15"]);
  expect(moved).not.toContain("．.");
  expect(moved.startsWith(call15Now)).toBe(true);
  expect(checkEmergencyReply(moved, ["15"], { optional3114Allowed: true }).pass).toBe(true);
});

it("does not treat a U+FEFF-split ellipsis as a complete 3114 opening", () => {
  const split = call3114Now.replace(/\.$/u, ".﻿.");
  expect(checkEmergencyReply(`${split} ${call15Now}`, ["3114", "15"]).pass).toBe(false);
  const fixed = ensureEmergencyCalls(`${split} ${call15Now}`, ["3114", "15"]);
  expect(fixed.startsWith(`${call3114Now} ${call15Now}`)).toBe(true);
  expect(checkEmergencyReply(fixed, ["3114", "15"]).found).toEqual(["3114", "15"]);
});
