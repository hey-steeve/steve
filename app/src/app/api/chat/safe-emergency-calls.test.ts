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
  { name: "cent-douze-newline", reply: "Appelle le cent\nAppelle le 15 maintenant.\ndouze.", calls: ["15"] },
  { name: "cent-douze-crlf", reply: "Appelle le cent\r\nAppelle le 15 maintenant.\r\ndouze.", calls: ["15"] },
  { name: "cent-douze-ls", reply: "Appelle le cent\u2028Appelle le 15 maintenant.\u2028douze.", calls: ["15"] },
  { name: "cent-douze-3114", reply: "Appelle le cent\nTu peux appeler le 3114.\ndouze.", calls: ["3114"] },
  { name: "cent-douze-both", reply: "Appelle le cent\nAppelle le 15 maintenant.\ndouze.", calls: ["15", "3114"] },
  { name: "one-twelve-around-block", reply: "Appelle le 1\nAppelle le 15 maintenant.\n12 tout de suite.", calls: ["15"] },
  { name: "cent-douze-quoted", reply: "Appelle le cent\n\"Appelle le 15 maintenant.\"\ndouze.", calls: ["15"] },
];
const erases112: Row[] = [
  { name: "one-twelve-newline", reply: "Garde ton téléphone. Appelle le 1\n12.", calls: ["15"] },
  { name: "one-twelve-crlf", reply: "Garde ton téléphone. Appelle le 1\r\n12.", calls: ["15"] },
  { name: "one-twelve-3114", reply: "Garde ton téléphone. Appelle le 1\n12.", calls: ["3114"] },
  { name: "one-twelve-both", reply: "Garde ton téléphone. Appelle le 1\n12.", calls: ["15", "3114"] },
];
const cuts: Row[] = [
  {
    name: "cut-newline",
    reply: "Garde ton téléphone. Appelle le 15 maintenant\nsur le téléphone de ton voisin.",
    calls: ["15"],
  },
  {
    name: "cut-crlf",
    reply: "Garde ton téléphone. Appelle le 15 maintenant\r\nsur le téléphone de ton voisin.",
    calls: ["15"],
  },
  {
    name: "cut-both",
    reply: "Garde ton téléphone. Appelle le 15 maintenant\nsur le téléphone de ton voisin.",
    calls: ["15", "3114"],
  },
  {
    name: "cut-blank-line",
    reply: "Garde ton téléphone. Appelle le 15 maintenant\n\nsur le téléphone de ton voisin.",
    calls: ["15"],
  },
  {
    name: "cut-blank-line-crlf",
    reply: "Garde ton téléphone. Appelle le 15 maintenant\r\n\r\nsur le téléphone de ton voisin.",
    calls: ["15"],
  },
  {
    name: "cut-tail-repeated-later",
    reply:
      "Garde ton téléphone. Appelle le 15 maintenant\nsur le téléphone de ton voisin. N'oublie pas: Appelle le 15 maintenant si ça s'aggrave.",
    calls: ["15"],
  },
];

const probes: Row[] = [
  {
    name: "cut-with-trailing-sentence",
    reply:
      "Garde ton téléphone. Appelle le 15 maintenant\nsur le téléphone de ton voisin. Je reste avec toi.",
    calls: ["15"],
  },
  {
    name: "swap-112-equal-count",
    reply: `${call15Now.split(". ")[0]}. Appelle le 1\n12. Je reste avec toi. Appelle le cent\nAppelle le 15 maintenant.\ndouze.`,
    calls: ["15"],
  },
  {
    name: "fullwidth-period",
    reply: "Garde ton téléphone. Appelle le 15 maintenant．\nReste assis.",
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
    const first = out.indexOf("Appelle le 15 maintenant");
    const second = out.indexOf("sur le téléphone de ton voisin.");
    expect(first, row.name).toBeGreaterThanOrEqual(0);
    expect(second, row.name).toBeGreaterThan(first);
    expect(out, row.name).not.toContain("téléphone.sur");
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
  const first = out.indexOf("Appelle le 15 maintenant");
  const second = out.indexOf("sur le téléphone de ton voisin.");
  expect(first).toBeGreaterThanOrEqual(0);
  expect(second).toBeGreaterThan(first);
  expect(out).not.toContain("téléphone.sur");
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
  expect(out.split("Appelle le 15 maintenant").length - 1).toBe(1);
});

it("does not put back a finished 15 sentence the call list does not ask for", () => {
  const reply =
    "Garde ton téléphone. Tu peux appeler le 3114\npour en parler. Appelle le 15 maintenant.";
  const out = ensureEmergencyCallsSafe(reply, ["3114"]);
  expect(out.startsWith(call3114Now)).toBe(true);
  expect(out.indexOf("Tu peux appeler le 3114")).toBeGreaterThanOrEqual(0);
  expect(out.indexOf("Tu peux appeler le 3114")).toBeLessThan(out.indexOf("pour en parler."));
  expect(out).not.toContain("téléphone.pour");
  expect(out).not.toContain("Appelle le 15 maintenant");
});

it.each([
  { name: "call3114", model: call3114 },
  { name: "call3114Now", model: call3114Now },
])("keeps the model $name block on a [15]-only rejected rewrite", ({ model }) => {
  const reply = `${model} Garde ton téléphone. Appelle le 15 maintenant\nsur le téléphone de ton voisin.`;
  const out = ensureEmergencyCallsSafe(reply, ["15"]);
  expect(out.startsWith(call15Now)).toBe(true);
  expect(out).toContain(model);
  expect(out.indexOf("Appelle le 15 maintenant")).toBeGreaterThanOrEqual(0);
  expect(out.indexOf("Appelle le 15 maintenant")).toBeLessThan(
    out.indexOf("sur le téléphone de ton voisin."),
  );
  expect(out).not.toContain("téléphone.sur");
});
