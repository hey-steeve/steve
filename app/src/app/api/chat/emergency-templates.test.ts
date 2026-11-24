import { expect, it } from "vitest";
import { checkEmergencyReply } from "./eval/check.ts";
import { ensureEmergencyCalls } from "./emergency-templates.ts";

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

it("drops a listening tail with a removed call and keeps one on a kept 3114", () => {
  expect(
    ensureEmergencyCalls(
      "Appelle le 15 maintenant. Ils t'écoutent. Appelle le 3114.",
      ["15", "3114"],
    ),
  ).toBe("Appelle le 15 maintenant. Appelle le 3114.");
  expect(
    ensureEmergencyCalls(
      "Appelle le 3114 maintenant. Ils t'écoutent. Appelle le 15 maintenant.",
      ["15"],
    ),
  ).toBe("Appelle le 15 maintenant. Appelle le 3114 maintenant. Ils t'écoutent.");
  expect(
    ensureEmergencyCalls("Appelle le 15 maintenant. Reste au chaud.", ["15", "3114"]),
  ).toBe("Appelle le 15 maintenant. Appelle le 3114. Reste au chaud.");
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
