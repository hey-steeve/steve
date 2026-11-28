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
    reply: "Keep warm.",
    calls: ["15"],
    result: `${call15Now} Keep warm.`,
  },
  {
    reply: "Keep warm.",
    calls: ["3114", "15"],
    result:
      `${call3114Now} ${call15Now} Keep warm.`,
  },
  {
    reply: "Keep warm.",
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114} Keep warm.`,
  },
  {
    reply: `${call15Now} Keep warm.`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114} Keep warm.`,
  },
  {
    reply: `${call15Now}`,
    calls: ["3114", "15"],
    result: `${call3114Now} ${call15Now}`,
  },
  {
    reply: `${call15Now}\nStay calm.`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114}\nStay calm.`,
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
    reply: `${call15Now} ${call3114} Keep warm.`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114} Keep warm.`,
  },
  {
    reply: `${call15Now.toLowerCase()} Keep warm.`,
    calls: ["15"],
    result: `${call15Now.toLowerCase()} Keep warm.`,
  },
  {
    reply: `Stay calm. ${call15Now}`,
    calls: ["15"],
    result: `${call15Now} Stay calm.`,
  },
  {
    reply: "Keep warm.",
    calls: [],
    result: "Keep warm.",
  },
  {
    reply: "Keep warm.",
    calls: ["3114"],
    result: `${call3114Now} Keep warm.`,
  },
  {
    reply: `${call3114Now} Keep warm.`,
    calls: ["3114"],
    result: `${call3114Now} Keep warm.`,
  },
  {
    reply: `${call3114} Keep warm.`,
    calls: ["3114"],
    result: `${call3114Now} Keep warm.`,
  },
  {
    reply: "If the shortness of breath persists, call 15 now.",
    calls: ["15"],
    result:
      `${call15Now} If the shortness of breath persists, call 15 now.`,
  },
  {
    reply: `${call3114}`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114}`,
  },
  {
    reply: "Yes, call 15 now.",
    calls: ["15"],
    result: `${call15Now} Yes, call 15 now.`,
  },
  {
    reply: `« ${call15Now} »`,
    calls: ["15"],
    // The quoted 15 and closing sentences are lone block sentences and go.
    result: `${call15Now} « What you're describing could be serious, and I'd rather we take no risks. »`,
  },
  {
    reply: "",
    calls: ["15"],
    result: `${call15Now}`,
  },
  {
    reply: `${call15Now}\nStay calm.`,
    calls: ["15"],
    result: `${call15Now}\nStay calm.`,
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
    reply: `${call3114Now} ${call15Now} Keep warm.`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114} Keep warm.`,
  },
  {
    reply: `${call3114Now} Keep warm.`,
    calls: ["15"],
    result: `${call15Now} ${call3114Now} Keep warm.`,
  },
  {
    reply: `${call15Now} Keep warm. ${call3114Now}`,
    calls: ["15"],
    result: `${call15Now} ${call3114Now} Keep warm.`,
  },
  {
    reply: `${call3114} ${call15Now}`,
    calls: ["15"],
    result: `${call15Now} ${call3114}`,
  },
  {
    reply: `${call15Now} They'll listen. ${call3114}`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114}`,
  },
  {
    reply: `${call3114Now} They'll listen. ${call15Now}`,
    calls: ["15"],
    result: `${call15Now} ${call3114Now} They'll listen.`,
  },
  {
    reply: `${call3114Now} They'll listen`,
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
    reply: `${call15Now} They'll listen. ${call3114}`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114}`,
  },
  {
    reply: `${call3114Now} They'll listen. ${call15Now}`,
    calls: ["15"],
    result: `${call15Now} ${call3114Now} They'll listen.`,
  },
  {
    reply: `${call15Now} Keep warm.`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114} Keep warm.`,
  },
  {
    reply: `Stay calm. ${call3114Now} They'll listen day and night.`,
    calls: ["15", "3114"],
    result: `${call15Now} ${call3114} Stay calm.`,
  },
  {
    reply: `Stay calm. ${call3114Now} They'll listen day and night.`,
    calls: ["3114", "15"],
    result: `${call3114Now} ${call15Now} Stay calm.`,
  },
  {
    reply: `${call3114Now} They'll listen day and night. ${call15Now}`,
    calls: ["15"],
    result: `${call15Now} ${call3114Now} They'll listen day and night.`,
  },
  {
    reply: `Stay calm. ${call3114Now} They'll listen day and night.`,
    calls: ["15"],
    result:
      `${call15Now} ${call3114Now} They'll listen day and night. Stay calm.`,
  },
  {
    reply: `Keep warm. ${call3114Now} They'll listen`,
    calls: ["15"],
    result:
      `${call15Now} ${call3114Now} They'll listen. Keep warm.`,
  },
] as const;

function exactOnlyListeningTail(sentence: string): boolean {
  const normalized = normalizeEmergencyText(sentence);
  return (
    normalized === normalizeEmergencyText("They'll listen") ||
    normalized === normalizeEmergencyText("They'll listen.")
  );
}

const punctuationTail = `${call3114Now} ... They'll listen.`;

const punctuationTailRows = [
  {
    reply: punctuationTail,
    calls: ["15"],
    result: `${call15Now} ${call3114Now} They'll listen.`,
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
    expect(output, JSON.stringify(row.calls)).not.toContain("... They'll listen.");
  }
});

it("drops a listening tail with a removed call and keeps one on a kept 3114", () => {
  for (const row of listeningTailRows) {
    expect(ensureEmergencyCalls(row.reply, [...row.calls]), row.reply).toBe(row.result);
  }
  const jourEtNuit = "They'll listen day and night.";
  expect(exactOnlyListeningTail(jourEtNuit)).toBe(false);
  expect(exactOnlyListeningTail("They'll listen.")).toBe(true);
  expect(exactOnlyListeningTail("They'll listen")).toBe(true);
  expect(exactOnlyListeningTail("Stay calm.")).toBe(false);
  expect(exactOnlyListeningTail("Keep warm.")).toBe(false);
});

const breathingWarning =
  "They'll listen, and if you have trouble breathing, call 15 now.";
const painWarning =
  "They'll listen; if the pain gets worse, call 15 again now.";
const worsenWarning = "They'll listen: don't hesitate to call back if it gets worse.";
const tonightWarning = "They'll listen 24/7, but don't stay alone tonight.";

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
  normalizeEmergencyText("They'll listen"),
  normalizeEmergencyText("They'll listen."),
  normalizeEmergencyText("They'll listen day and night."),
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
    reply: "If it gets worse... Breathe slowly… Are you safe?!",
    calls: ["3114"],
  },
  {
    reply:
      `${call15Now} If it gets worse... Breathe slowly… Are you safe?!`,
    calls: ["15"],
  },
  {
    reply:
      `${call15Now} ${call3114} If it gets worse... Breathe slowly… Are you safe?!`,
    calls: ["15", "3114"],
  },
  {
    reply: "If it gets worse... Breathe slowly… Are you safe?!",
    calls: ["3114", "15"],
  },
  {
    reply: "If it gets worse... Breathe slowly… Are you safe?!",
    calls: ["15"],
  },
  {
    reply: "Keep warm. ... If it gets worse.",
    calls: ["15"],
  },
  {
    reply: "Keep warm. ?! If it gets worse.",
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
    reply: `${call3114Now} They'll listen...`,
    calls: ["15"],
  } as const;
  const guarded = [...rows, ...listeningTailRows, ...mustKeepRows, ellipsisTail];
  for (const row of guarded) {
    const output = ensureEmergencyCalls(row.reply, [...row.calls]);
    expect(output, output).not.toMatch(doubledPunctuation);
  }
  expect(ensureEmergencyCalls(ellipsisTail.reply, [...ellipsisTail.calls])).toBe(
    `${call15Now} ${call3114Now} They'll listen.`,
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
    [`Stay calm. ${call15Now}`, ["15"]],
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
  const reply = `${call15Now} ${call3114} Keep warm.`;
  expect(ensureEmergencyCalls(reply, ["15", "3114"])).toBe(reply);
  expect(ensureEmergencyCalls(`${call3114Now} ${call15Now}`, ["3114", "15"])).toBe(
    `${call3114Now} ${call15Now}`,
  );
});

it("does not treat a sentence taken from inside a block as a whole block", () => {
  const partial = "I'm staying with you.";
  expect(ensureEmergencyCalls(`${partial} Stay calm.`, ["15"])).toBe(
    `${call15Now} Stay calm.`,
  );
  const cut = "What you're describing could be serious, and I'd rather we take no risks.";
  expect(ensureEmergencyCalls(`${cut} Stay calm.`, ["15"])).toBe(
    `${call15Now} Stay calm.`,
  );
});

it("rebuilds a lone 15 that sits after a model 3114 block", () => {
  expect(ensureEmergencyCalls(`${call3114Now} ${call15Now}`, ["15"])).toBe(
    `${call15Now} ${call3114Now}`,
  );
  expect(ensureEmergencyCalls(`${call15Now} Stay calm. ${call3114}`, ["15"])).toBe(
    `${call15Now} ${call3114} Stay calm.`,
  );
});

const stretched15 = `${call15Now.slice(0, -1)}...`;

it("does not read a stretched final period as the end of a block", () => {
  expect(checkEmergencyReply(stretched15, ["15"]).pass).toBe(false);
  expect(checkEmergencyReply(`${call15Now.slice(0, -1)}!`, ["15"]).pass).toBe(false);
  const fixed = ensureEmergencyCalls(stretched15, ["15"]);
  expect(fixed).toBe(call15Now);
  expect(checkEmergencyReply(fixed, ["15"]).pass).toBe(true);
  const withBody = ensureEmergencyCalls(`${stretched15} Stay calm.`, ["15"]);
  expect(withBody).toBe(`${call15Now} Stay calm.`);
  expect(checkEmergencyReply(withBody, ["15"]).pass).toBe(true);
});

it("does not read a stretched final period as the end of a 3114 block", () => {
  const stretched = `${call3114.slice(0, -1)}...`;
  expect(checkEmergencyReply(`${call15Now} ${call3114}`, ["15", "3114"]).pass).toBe(true);
  expect(checkEmergencyReply(`${call15Now} ${stretched}`, ["15", "3114"]).pass).toBe(false);
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
  const loose3114 = call3114Now.replace("matters.", "matters...");
  const reply = `${call15Now} ${loose3114} I don't give out 112.`;
  const options = { optional3114Allowed: true };
  expect(checkEmergencyReply(reply, ["15"], options).pass).toBe(false);
  const fixed = ensureEmergencyCalls(reply, ["15"]);
  expect(fixed).toContain("matters... You don't have");
  expect(normalizeEmergencyText(fixed)).not.toContain(normalizeEmergencyText(call3114Now));
  expect(checkEmergencyReply(fixed, ["15"], options).pass).toBe(false);
});

it("does not join a 1 and a 12 around a removed block into a 112", () => {
  const reply = `Call 1\n${call15Now}\n12.`;
  expect(detectEmergencyNumbers(reply).spans.map((span) => span.kind)).toEqual(["15"]);
  const fixed = ensureEmergencyCalls(reply, ["15"]);
  expect(fixed.startsWith(call15Now)).toBe(true);
  expect(detectEmergencyNumbers(fixed).spans.some((span) => span.kind === "112")).toBe(false);
  expect(checkEmergencyReply(fixed, ["15"]).reason).not.toContain("112");
  expect(checkEmergencyReply("Call 1\n\n12.", ["15"]).reason).toContain("112");
});

it("replaces a cut opening block with the full block, once", () => {
  const cut = call15Now.slice(0, call15Now.indexOf("I'm staying with you.") + 11);
  expect(cut.endsWith("I'm staying")).toBe(true);
  const alone = ensureEmergencyCalls(cut, ["15"]);
  expect(alone).toBe(call15Now);
  const later = ensureEmergencyCalls(`${cut}\n${call15Now}`, ["15"]);
  expect(later).toBe(call15Now);
  expect(checkEmergencyReply(later, ["15"]).found).toEqual(["15"]);
  const inexact = ensureEmergencyCalls(`${cut}\nCall 15 quickly.`, ["15"]);
  expect(inexact.startsWith(call15Now)).toBe(true);
  expect(inexact.split("What you're describing").length).toBe(2);
  expect(checkEmergencyReply(inexact, ["15"]).pass).toBe(false);
  const both = ensureEmergencyCalls(cut, ["15", "3114"]);
  expect(both).toBe(`${call15Now} ${call3114}`);
});

const cut15 = `${call15Now.slice(0, call15Now.indexOf("now") + 2)}`;

it("replaces a cut 15 fragment instead of keeping it beside the full block", () => {
  const lead = ensureEmergencyCalls(cut15, ["3114", "15"]);
  expect(lead).toBe(`${call3114Now} ${call15Now}`);
  const after3114 = ensureEmergencyCalls(`${call3114Now} ${cut15}`, ["3114", "15"]);
  expect(after3114).toBe(`${call3114Now} ${call15Now}`);
  const physical = ensureEmergencyCalls(`${call3114Now} ${cut15}`, ["15"]);
  expect(physical.split("Call 15").length).toBe(2);
  expect(physical.startsWith(call15Now)).toBe(true);
  expect(checkEmergencyReply(physical, ["15"], { optional3114Allowed: true }).pass).toBe(true);
});

it("still refuses to build a 112 when a block is dropped between digits", () => {
  const fixed = ensureEmergencyCalls(`Call 1\n${call15Now}\n12.`, ["3114", "15"]);
  expect(detectEmergencyNumbers(fixed).spans.some((span) => span.kind === "112")).toBe(false);
});

it("does not add a second period after a moved block ending in a fullwidth period", () => {
  const wide = call3114Now.replace(/\.$/u, "．");
  const moved = ensureEmergencyCalls(`${wide} ${call15Now} Keep warm.`, ["15"]);
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

const keep = "Keep your phone close.";
const [call15First = "", call15Number = "", call15Last = ""] = splitSentences(call15Now);
const call3114NowSentences = splitSentences(call3114Now);

function splitSentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]/gu)?.map((sentence) => sentence.trim()) ?? [];
}

const loneRows = [
  { name: "number sentence leading", calls: ["15"], reply: `${call15Number} ${keep}`, result: `${call15Now} ${keep}` },
  { name: "short number sentence", calls: ["15"], reply: `Call 15 now. ${keep}`, result: `${call15Now} ${keep}` },
  { name: "short number sentence only", calls: ["15"], reply: "Call 15 now.", result: call15Now },
  { name: "first sentence at start", calls: ["15"], reply: `${call15First} ${keep}`, result: `${call15Now} ${keep}` },
  { name: "first sentence in middle", calls: ["15"], reply: `${keep} ${call15First} Stay calm.`, result: `${call15Now} ${keep} Stay calm.` },
  { name: "first sentence at end", calls: ["15"], reply: `${keep} ${call15First}`, result: `${call15Now} ${keep}` },
  { name: "last sentence at start", calls: ["15"], reply: `${call15Last} ${keep}`, result: `${call15Now} ${keep}` },
  { name: "last sentence in middle", calls: ["15"], reply: `${keep} ${call15Last} Stay calm.`, result: `${call15Now} ${keep} Stay calm.` },
  { name: "last sentence at end", calls: ["15"], reply: `${keep} ${call15Last}`, result: `${call15Now} ${keep}` },
  { name: "mid-reply number repeat", calls: ["15"], reply: `${keep} ${call15Number} Stay calm.`, result: `${call15Now} ${keep} Stay calm.` },
  { name: "3114 sentence at start", calls: ["15", "3114"], reply: `${call3114NowSentences[0]} ${keep}`, result: `${call15Now} ${call3114} ${keep}` },
  { name: "3114 number sentence in middle", calls: ["15", "3114"], reply: `${keep} ${call3114NowSentences[2]} Stay calm.`, result: `${call15Now} ${call3114} ${keep} Stay calm.` },
  { name: "3114 last sentence at end", calls: ["15", "3114"], reply: `${keep} ${call3114NowSentences[3]}`, result: `${call15Now} ${call3114} ${keep}` },
  { name: "3114 alone, short sentence", calls: ["3114"], reply: `${call3114} ${keep}`, result: `${call3114Now} ${keep}` },
  { name: "3114 alone, block sentence in middle", calls: ["3114"], reply: `${keep} ${call3114NowSentences[2]} Stay calm.`, result: `${call3114Now} ${keep} Stay calm.` },
  { name: "3114 alone, last sentence at end", calls: ["3114"], reply: `${keep} ${call3114NowSentences[3]}`, result: `${call3114Now} ${keep}` },
  { name: "3114 alone, correct block kept", calls: ["3114"], reply: `${call3114Now} ${keep}`, result: `${call3114Now} ${keep}` },
  { name: "cut 3114 sentence", calls: ["15", "3114"], reply: `You can call 3114. ${keep}`, result: `${call15Now} ${call3114} ${keep}` },
  { name: "15 sentence with 3114 listed", calls: ["15", "3114"], reply: `${keep} ${call15Number}`, result: `${call15Now} ${call3114} ${keep}` },
  { name: "ASCII-quoted number sentence", calls: ["15"], reply: `"${call15Number}" ${keep}`, result: `${call15Now} ${keep}` },
  { name: "guillemet-quoted number sentence", calls: ["15"], reply: `« ${call15Number} » ${keep}`, result: `${call15Now} ${keep}` },
  { name: "drop between digits", calls: ["15"], reply: `Call 1\n${call15Number}\n12.`, result: null },
] as const;

it("drops a lone block sentence when the opening is prefixed", () => {
  for (const row of loneRows) {
    const fixed = ensureEmergencyCalls(row.reply, row.calls);
    if (row.result === null) {
      expect(detectEmergencyNumbers(fixed).spans.some((span) => span.kind === "112"), row.name).toBe(false);
      expect(fixed.startsWith(call15Now), row.name).toBe(true);
    } else {
      expect(fixed, row.name).toBe(row.result);
    }
  }
});

it("does not join a hyphenated 1 and a 12 around a dropped block into a 112", () => {
  const cases = [
    { calls: ["15"], sentence: call15Number },
    { calls: ["15", "3114"], sentence: call15Number },
    { calls: ["3114"], sentence: call3114NowSentences[2] ?? "" },
  ] as const;
  for (const row of cases) {
    const reply = `Call 1-\n${row.sentence}\n12.`;
    const fixed = ensureEmergencyCalls(reply, row.calls);
    const label = row.calls.join();
    expect(row.sentence.length, label).toBeGreaterThan(0);
    expect(fixed.startsWith(row.calls[0] === "3114" ? call3114Now : call15Now), label).toBe(true);
    expect(detectEmergencyNumbers(fixed).spans.some((span) => span.kind === "112"), label).toBe(false);
    expect(checkEmergencyReply(fixed, row.calls).reason, label).not.toContain("112");
  }
});

function occurrences(text: string, part: string): number {
  return text.split(part).length - 1;
}

it("never repeats a lone sentence of any block after the required opening", () => {
  const callLists = [["15"], ["15", "3114"], ["3114"]] as const;
  const sentences = [call15Now, call3114Now, call3114].flatMap(splitSentences);
  for (const calls of callLists) {
    const opening =
      calls[0] === "3114" && calls.length === 1
        ? call3114Now
        : calls.map((call) => (call === "15" ? call15Now : call3114)).join(" ");
    for (const sentence of sentences) {
      const fixed = ensureEmergencyCalls(`${sentence} ${keep}`, calls);
      expect(fixed.startsWith(opening), `${calls.join()} ${sentence}`).toBe(true);
      // A [15]-only reply keeps the model's own 3114 wording, once.
      const is3114Only = calls[0] === "15" && calls.length === 1 && !call15Now.includes(sentence);
      const allowed = occurrences(opening, sentence) + (is3114Only ? 1 : 0);
      expect(occurrences(fixed, sentence), `${calls.join()} ${sentence}`).toBeLessThanOrEqual(allowed);
    }
  }
});

it("keeps the 112 when a fragment ends in a digit that would continue into a longer number", () => {
  const reply = "Keep your phone close. Call 1\n12.";
  const fixed = ensureEmergencyCalls(reply, ["15"]);
  expect(detectEmergencyNumbers(fixed).spans.some((hit) => hit.kind === "112")).toBe(true);
  expect(checkEmergencyReply(fixed, ["15"]).pass).toBe(false);
  expect(fixed.startsWith(call15Now)).toBe(true);
});
