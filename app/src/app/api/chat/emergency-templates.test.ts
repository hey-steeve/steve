import { expect, it } from "vitest";
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
    result: "Reste calme. Appelle le 15 maintenant.",
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
    result: "Appelle le 15 maintenant. Appelle le 3114. Appelle le 3114.",
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
] as const;

it("adds every missing immediate call in calls order", () => {
  for (const row of rows) {
    expect(ensureEmergencyCalls(row.reply, row.calls), row.reply).toBe(row.result);
  }
});
