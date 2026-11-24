import { expect, expectTypeOf, it } from "vitest";
import type { Handoff, Turn, TurnChannel } from "@steve/shared";
import {
  triageTurn,
  type ClassifyResult,
  type EmergencyCalls,
  type TriageDecision,
  type TriageGuidance,
  type TriageTurnRequest,
} from "./index.ts";

const currentText = "Je tousse un peu depuis hier, sans fièvre.";

const needInfoGuidance = {
  placement: "after-system-prompt",
  text: "pose une seule question courte, sans nommer le 15",
} as const satisfies TriageGuidance;

const consultGuidance = {
  placement: "after-system-prompt",
  text: "recommande une consultation chez le médecin traitant, en pharmacie de garde ou en téléconsultation",
} as const satisfies TriageGuidance;

const offer3114 = [{ type: "call", number: "3114" }] as const satisfies NonNullable<
  Extract<ClassifyResult, { label: "consult" | "self-care" }>["calls"]
>;

function demoTurn(text: string, turnId: string, channel: TurnChannel = "text"): Turn {
  return {
    sessionId: "session-demo-1",
    turnId,
    channel,
    text,
  } satisfies Turn;
}

function careHandoff(
  text: string,
  earlierTurns: readonly Turn[] = [],
  channel: TurnChannel = "text",
): Handoff<readonly Turn[]> {
  const current = demoTurn(text, "turn-demo-1", channel);
  return {
    sessionId: current.sessionId,
    turnId: current.turnId,
    target: "triage",
    intent: "care_request",
    data: [...earlierTurns, current],
  } satisfies Handoff<readonly Turn[]>;
}

it("accepts a care_request handoff and classifies its current turn text", async () => {
  const handoff = careHandoff(currentText);
  const seen: string[] = [];
  const decision = await triageTurn({
    handoff,
    classify: async ({ state }) => {
      seen.push(state);
      return { label: "self-care", probability: 0.7 };
    },
  });

  expect(seen).toEqual([currentText]);
  expect(decision).toEqual({ label: "self-care" });
});

it("classifies the last 6 turns when the handoff includes earlier turns", async () => {
  const earlierTexts = [
    "Hier matin, j'avais un peu mal à la gorge.",
    "À midi, la douleur était toujours légère.",
    "Le soir, je toussais sans fièvre.",
    "Cette nuit, j'ai peu dormi à cause de la toux.",
    "Ce matin, je me sens fatigué, sans gêne forte.",
    "À 10 h, la toux est restée sèche.",
    "À midi, je bois de l'eau et je me repose.",
    "Cet après-midi, rien de nouveau, juste la toux.",
  ] as const;
  const earlierTurns = earlierTexts.map((text, index) => demoTurn(text, `turn-earlier-${index + 1}`));
  const seen: string[] = [];
  await triageTurn({
    handoff: careHandoff(currentText, earlierTurns),
    classify: async ({ state }) => {
      seen.push(state);
      return { label: "self-care", probability: 0.7 };
    },
  });

  expect(seen).toEqual([
    [
      "Cette nuit, j'ai peu dormi à cause de la toux.",
      "Ce matin, je me sens fatigué, sans gêne forte.",
      "À 10 h, la toux est restée sèche.",
      "À midi, je bois de l'eau et je me repose.",
      "Cet après-midi, rien de nouveau, juste la toux.",
      currentText,
    ].join("\n"),
  ]);
});

it("keeps a short history and leaves the summary out of the classifier state", async () => {
  const summary = "Résumé non médical: toux légère.";
  const earlierTurns = [
    demoTurn("Hier, j'avais la gorge un peu serrée.", "turn-earlier-1"),
    demoTurn("Aujourd'hui, je tousse encore un peu.", "turn-earlier-2"),
  ];
  const seen: string[] = [];
  await triageTurn({
    handoff: {
      ...careHandoff(currentText, earlierTurns),
      intent: summary,
    } satisfies Handoff<readonly Turn[]>,
    classify: async ({ state }) => {
      seen.push(state);
      return { label: "consult", probability: 0.62 };
    },
  });

  expect(seen).toEqual([
    ["Hier, j'avais la gorge un peu serrée.", "Aujourd'hui, je tousse encore un peu.", currentText].join(
      "\n",
    ),
  ]);
  const state = seen[0];
  expect(state).toBeDefined();
  if (state === undefined) {
    return;
  }
  expect(state).not.toContain("Résumé non médical");
  expect(state).not.toContain("session-demo-1");
});

it("maps emergency to the calls from classify and adds no guidance", async () => {
  const calls = [
    { type: "call", number: "15" },
    { type: "call", number: "3114" },
  ] as const satisfies EmergencyCalls;
  const decision = await triageTurn({
    handoff: careHandoff(currentText),
    classify: async () => ({ label: "emergency", probability: 0.91, calls }),
  });

  expect(decision).toEqual({ label: "emergency", calls });
  expect(decision).not.toHaveProperty("guidance");
});

it("keeps emergency call order 3114 then 15", async () => {
  const calls = [
    { type: "call", number: "3114" },
    { type: "call", number: "15" },
  ] as const satisfies EmergencyCalls;
  const decision = await triageTurn({
    handoff: careHandoff(currentText),
    classify: async () => ({ label: "emergency", probability: 0.93, calls }),
  });

  expect(decision).toEqual({ label: "emergency", calls });
  expect(decision).not.toHaveProperty("guidance");
  if (decision.label !== "emergency") {
    return;
  }
  expect(decision.calls.map((call) => call.number)).toEqual(["3114", "15"]);
});

it("maps consult to one guidance line after the system prompt", async () => {
  const decision = await triageTurn({
    handoff: careHandoff(currentText),
    classify: async () => ({ label: "consult", probability: 0.74 }),
  });

  expect(decision).toEqual({ label: "consult", guidance: consultGuidance });
  expect(decision).not.toHaveProperty("calls");
  if (decision.label !== "consult") {
    return;
  }
  expect(decision.guidance.text).not.toContain("15");
  expect(decision.guidance.text).not.toContain("3114");
  expect(decision.guidance.placement).toBe("after-system-prompt");
});

it("passes through 3114 calls on a consult result and keeps guidance after the system prompt", async () => {
  const text = "Je me sens très angoissé depuis ce matin.";
  const seen: string[] = [];
  const decision = await triageTurn({
    handoff: careHandoff(text, [], "voice"),
    classify: async ({ state }) => {
      seen.push(state);
      return { label: "consult", probability: 0.74, calls: offer3114 };
    },
  });

  expect(seen).toEqual([text]);
  expect(decision).toEqual({ label: "consult", guidance: consultGuidance, calls: offer3114 });
  if (decision.label !== "consult") {
    return;
  }
  expect(decision.guidance.placement).toBe("after-system-prompt");
  expect(decision.guidance.text).not.toContain("15");
  expect(decision.guidance.text).not.toContain("3114");
});

it("maps a need-info label to guidance and no calls", async () => {
  const result = {
    label: "need-info",
    reason: "model",
    probability: 0.41,
  } satisfies ClassifyResult;
  const decision = await triageTurn({
    handoff: careHandoff(currentText),
    classify: async () => result,
  });

  expect(decision).toEqual({ label: "need-info", guidance: needInfoGuidance });
  expect(decision).not.toHaveProperty("calls");
  expect(decision).not.toHaveProperty("messages");
  expect(decision).not.toHaveProperty("reason");
});

it("passes through 3114 calls on a model need-info result", async () => {
  const result = {
    label: "need-info",
    reason: "model",
    probability: 0.41,
    calls: offer3114,
  } satisfies ClassifyResult;
  const decision = await triageTurn({
    handoff: careHandoff(currentText),
    classify: async () => result,
  });

  expect(decision).toEqual({
    label: "need-info",
    guidance: needInfoGuidance,
    calls: offer3114,
  });
  expect(decision).not.toHaveProperty("reason");
});

it("keeps a network failure as need-info with guidance and no calls", async () => {
  const result = {
    label: "need-info",
    reason: "network",
  } satisfies ClassifyResult;
  const decision = await triageTurn({
    handoff: careHandoff(currentText),
    classify: async () => result,
  });

  expect(decision.label).not.toBe("emergency");
  expect(decision).toEqual({ label: "need-info", guidance: needInfoGuidance });
  expect(decision).not.toHaveProperty("calls");
  expect(decision).not.toHaveProperty("reason");
});

it("maps self-care to the label alone", async () => {
  const decision = await triageTurn({
    handoff: careHandoff("Je me sens un peu fatigué, et ça va mieux qu'hier."),
    classify: async () => ({ label: "self-care", probability: 0.66 }),
  });

  expect(decision).toEqual({ label: "self-care" });
  expect(decision).not.toHaveProperty("guidance");
  expect(decision).not.toHaveProperty("calls");
});

it("passes through 3114 calls on a self-care result", async () => {
  const decision = await triageTurn({
    handoff: careHandoff("Je me sens un peu fatigué, et ça va mieux qu'hier."),
    classify: async () => ({ label: "self-care", probability: 0.66, calls: offer3114 }),
  });

  expect(decision).toEqual({ label: "self-care", calls: offer3114 });
  expect(decision).not.toHaveProperty("guidance");
});

it("types the shared handoff, the decision, and guidance placed after the system prompt", () => {
  expectTypeOf<Handoff<readonly Turn[]>>().branded.toEqualTypeOf<{
    readonly sessionId: string;
    readonly turnId: string;
    readonly target: string;
    readonly intent: string;
    readonly data: readonly Turn[];
  }>();
  expectTypeOf<Turn>().branded.toEqualTypeOf<{
    readonly sessionId: string;
    readonly turnId: string;
    readonly channel: TurnChannel;
    readonly text: string;
  }>();
  expectTypeOf<TriageTurnRequest["handoff"]>().toEqualTypeOf<Handoff<readonly Turn[]>>();
  expectTypeOf<Turn["channel"]>().toEqualTypeOf<"voice" | "text">();
  expectTypeOf<"inbox">().not.toMatchTypeOf<Turn["channel"]>();
  expectTypeOf<"sms">().not.toMatchTypeOf<Turn["channel"]>();

  type Passed3114 = readonly [{ readonly type: "call"; readonly number: "3114" }];
  type FallbackDecision = Extract<TriageDecision, { label: "need-info" }>;
  expectTypeOf<FallbackDecision["label"]>().toEqualTypeOf<"need-info">();
  expectTypeOf<"emergency">().not.toMatchTypeOf<FallbackDecision["label"]>();
  expectTypeOf<FallbackDecision["calls"]>().toEqualTypeOf<Passed3114 | undefined>();
  expectTypeOf<FallbackDecision["guidance"]["placement"]>().toEqualTypeOf<"after-system-prompt">();
  expectTypeOf<Extract<TriageDecision, { label: "consult" }>["guidance"]["placement"]>().toEqualTypeOf<
    "after-system-prompt"
  >();
  expectTypeOf<"before-system-prompt">().not.toMatchTypeOf<TriageGuidance["placement"]>();
  expectTypeOf<"inside-system-prompt">().not.toMatchTypeOf<TriageGuidance["placement"]>();
  expectTypeOf<Extract<TriageDecision, { label: "emergency" }>>().not.toHaveProperty("guidance");
  expectTypeOf<Extract<TriageDecision, { label: "emergency" }>["calls"]>().toEqualTypeOf<EmergencyCalls>();
  expectTypeOf<Extract<TriageDecision, { label: "self-care" }>>().not.toHaveProperty("guidance");
  expectTypeOf<Extract<TriageDecision, { label: "self-care" }>["calls"]>().toEqualTypeOf<
    Passed3114 | undefined
  >();
  expectTypeOf<Extract<TriageDecision, { label: "consult" }>["calls"]>().toEqualTypeOf<
    Passed3114 | undefined
  >();
  expectTypeOf<TriageDecision>().not.toHaveProperty("reason");
  expectTypeOf<TriageDecision>().not.toHaveProperty("messages");
});
