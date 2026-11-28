import { expect, it } from "vitest";
import {
  call15Now,
  call3114,
  call3114Now,
  type EmergencyCall,
  ensureEmergencyCalls,
} from "./emergency-templates.ts";
import { detectEmergencyNumbers } from "./eval/check.ts";
import { ensureEmergencyCallsSafe } from "./safe-emergency-calls.ts";

function kinds112(text: string): number {
  return detectEmergencyNumbers(text).spans.filter((span) => span.kind === "112").length;
}

function read112(text: string): string[] {
  const { normalized, spans } = detectEmergencyNumbers(text);
  return spans
    .filter((span) => span.kind === "112")
    .map((span) => normalized.slice(span.start, span.end))
    .sort();
}

type Row = {
  readonly name: string;
  readonly reply: string;
  readonly calls: readonly EmergencyCall[];
};

const creates112: Row[] = [
  { name: "cent-douze-newline", reply: "Call one hundred\nCall 15 now.\ntwelve.", calls: ["15"] },
  { name: "cent-douze-crlf", reply: "Call one hundred\r\nCall 15 now.\r\ntwelve.", calls: ["15"] },
  { name: "cent-douze-ls", reply: "Call one hundred\u2028Call 15 now.\u2028twelve.", calls: ["15"] },
  { name: "cent-douze-3114", reply: "Call one hundred\nYou can call 3114.\ntwelve.", calls: ["3114"] },
  { name: "cent-douze-both", reply: "Call one hundred\nCall 15 now.\ntwelve.", calls: ["15", "3114"] },
  { name: "one-twelve-around-block", reply: "Call 1\nCall 15 now.\n12 right away.", calls: ["15"] },
  { name: "cent-douze-quoted", reply: "Call one hundred\n\"Call 15 now.\"\ntwelve.", calls: ["15"] },
];
const erases112: Row[] = [
  { name: "one-twelve-newline", reply: "Keep your phone. Call 1\n12.", calls: ["15"] },
  { name: "one-twelve-crlf", reply: "Keep your phone. Call 1\r\n12.", calls: ["15"] },
  { name: "one-twelve-3114", reply: "Keep your phone. Call 1\n12.", calls: ["3114"] },
  { name: "one-twelve-both", reply: "Keep your phone. Call 1\n12.", calls: ["15", "3114"] },
];
const cuts: Row[] = [
  {
    name: "cut-newline",
    reply: "Keep your phone. Call 15 now\non your neighbor's phone.",
    calls: ["15"],
  },
  {
    name: "cut-crlf",
    reply: "Keep your phone. Call 15 now\r\non your neighbor's phone.",
    calls: ["15"],
  },
  {
    name: "cut-both",
    reply: "Keep your phone. Call 15 now\non your neighbor's phone.",
    calls: ["15", "3114"],
  },
  {
    name: "cut-blank-line",
    reply: "Keep your phone. Call 15 now\n\non your neighbor's phone.",
    calls: ["15"],
  },
  {
    name: "cut-blank-line-crlf",
    reply: "Keep your phone. Call 15 now\r\n\r\non your neighbor's phone.",
    calls: ["15"],
  },
  {
    name: "cut-tail-repeated-later",
    reply:
      "Keep your phone. Call 15 now\non your neighbor's phone. Don't forget: Call 15 now if it gets worse.",
    calls: ["15"],
  },
];

const probes: Row[] = [
  {
    name: "cut-with-trailing-sentence",
    reply:
      "Keep your phone. Call 15 now\non your neighbor's phone. I'm staying with you.",
    calls: ["15"],
  },
  {
    name: "swap-112-equal-count",
    reply: `${call15Now.split(". ")[0]}. Call 1\n12. I'm staying with you. Call one hundred\nCall 15 now.\ntwelve.`,
    calls: ["15"],
  },
  {
    name: "fullwidth-period",
    reply: "Keep your phone. Call 15 now．\nStay seated.",
    calls: ["15"],
  },
];

const table = [...probes, ...creates112, ...erases112, ...cuts];

const openings: Row[] = [
  { name: "open-15", reply: `${call15Now} Respire doucement.`, calls: ["15"] },
  { name: "open-3114", reply: `${call3114Now} Respire doucement.`, calls: ["3114"] },
  { name: "open-15-3114", reply: `${call15Now} ${call3114} Respire doucement.`, calls: ["15", "3114"] },
];

it("never introduces a 112 and keeps a real one", () => {
  for (const row of creates112) {
    expect(kinds112(row.reply), row.name).toBe(0);
    expect(kinds112(ensureEmergencyCallsSafe(row.reply, row.calls)), row.name).toBe(0);
  }
  for (const row of erases112) {
    expect(kinds112(row.reply), row.name).toBeGreaterThan(0);
    expect(kinds112(ensureEmergencyCallsSafe(row.reply, row.calls)), row.name).toBe(
      kinds112(row.reply),
    );
  }
});

it("keeps both halves of a line-broken sentence in order", () => {
  for (const row of cuts) {
    const out = ensureEmergencyCallsSafe(row.reply, row.calls);
    const first = out.indexOf("Call 15 now");
    const second = out.indexOf("on your neighbor's phone.");
    expect(first, row.name).toBeGreaterThanOrEqual(0);
    expect(second, row.name).toBeGreaterThan(first);
    expect(out, row.name).not.toContain("phone.on");
    expect(out.startsWith(ensureEmergencyCalls("", row.calls)), row.name).toBe(true);
  }
});

it("prefixes the required blocks and keeps the original reply on a rejected rewrite", () => {
  const row = creates112[0];
  if (row === undefined) {
    throw new Error("missing row");
  }
  expect(ensureEmergencyCallsSafe(row.reply, row.calls)).toBe(`${call15Now} ${row.reply}`);
});

it("leaves valid openings unchanged", () => {
  for (const row of openings) {
    expect(ensureEmergencyCallsSafe(row.reply, row.calls), row.name).toBe(row.reply);
  }
});

it("matches ensureEmergencyCalls when the rewrite is safe", () => {
  const safe: Row[] = [
    { name: "repeat-block", reply: `Respire. ${call15Now}`, calls: ["15"] },
    { name: "plain", reply: "Respire doucement.", calls: ["3114"] },
    { name: "none", reply: "Respire doucement.", calls: [] },
  ];
  for (const row of safe) {
    expect(ensureEmergencyCallsSafe(row.reply, row.calls), row.name).toBe(
      ensureEmergencyCalls(row.reply, row.calls),
    );
  }
});

it("reads the same 112 before and after, minus the prefixed blocks", () => {
  for (const row of table) {
    const out = ensureEmergencyCallsSafe(row.reply, row.calls);
    const opening = ensureEmergencyCalls("", row.calls);
    const body = out.startsWith(opening) ? out.slice(opening.length) : out;
    expect(kinds112(body), row.name).toBe(kinds112(row.reply));
    expect(read112(body), row.name).toEqual(read112(row.reply));
  }
});

it("keeps both halves when the cut line is followed by another sentence", () => {
  const out = ensureEmergencyCallsSafe(probes[0]?.reply ?? "", ["15"]);
  const first = out.indexOf("Call 15 now");
  const second = out.indexOf("on your neighbor's phone.");
  expect(first).toBeGreaterThanOrEqual(0);
  expect(second).toBeGreaterThan(first);
  expect(out).not.toContain("phone.on");
});

it("does not trade one 112 for another at equal count", () => {
  const row = probes[1];
  const out = ensureEmergencyCallsSafe(row?.reply ?? "", ["15"]);
  const opening = ensureEmergencyCalls("", ["15"]);
  expect(read112(out.startsWith(opening) ? out.slice(opening.length) : out)).toEqual(
    read112(row?.reply ?? ""),
  );
});

it("drops a finished fullwidth-period sentence instead of repeating it", () => {
  const row = probes[2];
  const out = ensureEmergencyCallsSafe(row?.reply ?? "", ["15"]);
  expect(out).toBe(ensureEmergencyCalls(row?.reply ?? "", ["15"]));
  expect(out.split("Call 15 now").length - 1).toBe(1);
});

it("does not put back a finished 15 sentence the call list does not ask for", () => {
  const reply =
    "Keep your phone. You can call 3114\nto talk about it. Call 15 now.";
  const out = ensureEmergencyCallsSafe(reply, ["3114"]);
  expect(out.startsWith(call3114Now)).toBe(true);
  expect(out.indexOf("You can call 3114")).toBeGreaterThanOrEqual(0);
  expect(out.indexOf("You can call 3114")).toBeLessThan(out.indexOf("to talk about it."));
  expect(out).not.toContain("phone.to");
  expect(out).not.toContain("Call 15 now");
});

it.each([
  { name: "call3114", model: call3114 },
  { name: "call3114Now", model: call3114Now },
])("keeps the model $name block on a [15]-only rejected rewrite", ({ model }) => {
  const reply = `${model} Keep your phone. Call 15 now\non your neighbor's phone.`;
  const out = ensureEmergencyCallsSafe(reply, ["15"]);
  expect(out.startsWith(call15Now)).toBe(true);
  expect(out).toContain(model);
  expect(out.indexOf("Call 15 now")).toBeGreaterThanOrEqual(0);
  expect(out.indexOf("Call 15 now")).toBeLessThan(
    out.indexOf("on your neighbor's phone."),
  );
  expect(out).not.toContain("phone.on");
});

it("does not let a later one-line copy of the sentence hide a cut", () => {
  const reply =
    "Keep your phone. Call 15 now\non your neighbor's phone. Later: Call 15 now on your neighbor's phone.";
  const out = ensureEmergencyCallsSafe(reply, ["15"]);
  expect(out.startsWith(call15Now)).toBe(true);
  expect(out).not.toContain("phone.on");
  expect(out.indexOf("Call 15 now")).toBeGreaterThanOrEqual(0);
  expect(out.indexOf("Call 15 now")).toBeLessThan(
    out.indexOf("on your neighbor's phone."),
  );
});

it("does not leave the first half hanging when the continuation is dropped", () => {
  const reply = "Stay close to him and\nCall 15 now.";
  const out = ensureEmergencyCallsSafe(reply, ["15"]);
  expect(out.startsWith(call15Now)).toBe(true);
  expect(out).toMatch(/Stay close to him and\s*Call 15 now/u);
  expect(out.trimEnd().endsWith("Stay close to him and")).toBe(false);
});

it("drops a finished 15 sentence after a markdown line that ends its period before **", () => {
  const out = ensureEmergencyCallsSafe(
    "**Keep your phone.**\n\nCall 15 now.",
    ["3114"],
  );
  expect(out.startsWith(call3114Now)).toBe(true);
  expect(out).not.toContain("Call 15 now");
  expect(out).toContain("**Keep your phone.**");
});

it("drops a finished 15 sentence after a label line ending with a colon", () => {
  const out = ensureEmergencyCallsSafe("To do now:\nCall 15 now.", ["3114"]);
  expect(out.startsWith(call3114Now)).toBe(true);
  expect(out).not.toContain("Call 15 now");
  expect(out).toContain("To do now:");
});

it("drops a finished 15 sentence after an ATX heading line", () => {
  const out = ensureEmergencyCallsSafe(
    "Keep your phone.\n\n### Next\n\nCall 15 now.",
    ["3114"],
  );
  expect(out.startsWith(call3114Now)).toBe(true);
  expect(out).not.toContain("Call 15 now");
  expect(out).toContain("### Next");
});

it("drops a finished 15 sentence after a line ending with a complete parenthetical", () => {
  const out = ensureEmergencyCallsSafe(
    "Keep your phone (to stay reachable)\n\nCall 15 now.",
    ["3114"],
  );
  expect(out.startsWith(call3114Now)).toBe(true);
  expect(out).not.toContain("Call 15 now");
  expect(out).toContain("Keep your phone (to stay reachable)");
});

it("drops a finished 15 sentence after a period then a parenthetical", () => {
  const out = ensureEmergencyCallsSafe(
    "Keep your phone. (to stay reachable)\n\nCall 15 now.",
    ["3114"],
  );
  expect(out.startsWith(call3114Now)).toBe(true);
  expect(out).not.toContain("Call 15 now");
  expect(out).toContain("Keep your phone. (to stay reachable)");
});

it("treats a line ending with nested parentheses as finished", () => {
  const out = ensureEmergencyCallsSafe(
    "Keep your phone (and the charger if you can (without getting up))\nCall 15 now.",
    ["3114"],
  );
  expect(out.startsWith(call3114Now)).toBe(true);
  expect(out).not.toContain("Call 15 now");
  expect(out).toContain("(without getting up))");
});

it("treats a line ending with a stray closing parenthesis as finished", () => {
  const out = ensureEmergencyCallsSafe("Keep your phone)\nCall 15 now.", ["3114"]);
  expect(out.startsWith(call3114Now)).toBe(true);
  expect(out).not.toContain("Call 15 now");
  expect(out).toContain("Keep your phone)");
});

it("keeps a real continuation but drops a later finished lone 15 sentence", () => {
  const out = ensureEmergencyCallsSafe(
    "Stay close to him and\nCall 15 now.\nKeep your phone. Call 15 now.",
    ["3114"],
  );
  expect(out).toMatch(/Stay close to him and\s*Call 15 now/u);
  const after = out.slice(out.indexOf("Keep your phone."));
  expect(after).not.toContain("Call 15 now");
});

it("treats a markdown list item as finished", () => {
  const out = ensureEmergencyCallsSafe(
    "For now:\n\n- Keep your phone\n\nCall 15 now.",
    ["3114"],
  );
  expect(out.startsWith(call3114Now)).toBe(true);
  expect(out).not.toContain("Call 15 now");
  expect(out).toContain("- Keep your phone");
});

it("keeps a wrapped markdown list item whose next line continues the sentence", () => {
  const out = ensureEmergencyCallsSafe(
    "Stay close to him and\nCall 15 now.\n\n1. Call 15 now. They'll listen\nif you want to talk about it.",
    ["3114"],
  );
  expect(out.startsWith(call3114Now)).toBe(true);
  expect(out.indexOf("They'll listen")).toBeGreaterThanOrEqual(0);
  expect(out.indexOf("They'll listen")).toBeLessThan(out.indexOf("if you want to talk about it."));
  expect(out).not.toContain("1.if you want to talk about it.");
  expect(out).toMatch(/Stay close to him and\s*Call 15 now/u);
});

it("drops the listening tail with a finished 3114 block but keeps the continuation", () => {
  const out = ensureEmergencyCallsSafe(
    `Stay close to him and\nCall 15 now.\n${call3114} They'll listen day and night.`,
    ["3114"],
  );
  expect(out).toMatch(/Stay close to him and\s*Call 15 now/u);
  // The opening already holds the 3114 sentences once; the reply's own block is gone.
  expect(out.split(call3114).length - 1).toBe(1);
  expect(out).not.toContain("They'll listen day and night.");
});

it("keeps a wrapped list item whose next line starts with markdown then lowercase", () => {
  const out = ensureEmergencyCallsSafe(
    "Stay close to him and\nCall 15 now.\n\n1. Call 15 now. They'll listen\n**if you want to talk about it.**",
    ["3114"],
  );
  expect(out.indexOf("They'll listen")).toBeGreaterThanOrEqual(0);
  expect(out.indexOf("They'll listen")).toBeLessThan(out.indexOf("if you want to talk about it."));
  expect(out).not.toContain("1.**if you want to talk about it.**");
  expect(out).not.toContain("1.if you want to talk about it.");
  expect(out).toMatch(/Stay close to him and\s*Call 15 now/u);
});

it("treats a blank line then a capital sentence as a new paragraph", () => {
  const out = ensureEmergencyCallsSafe("Keep your phone\n\nCall 15 now.", ["3114"]);
  expect(out.startsWith(call3114Now)).toBe(true);
  expect(out).not.toContain("Call 15 now");
  expect(out).toContain("Keep your phone");
});
