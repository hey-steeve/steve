import { expect, expectTypeOf, it } from "vitest";
import {
  triageTurn,
  type ClassifyResult,
  type ConversationChannel,
  type ConversationHandoff,
  type EmergencyCalls,
  type RequestIntent,
  type TriageDecision,
  type TriageGuidance,
  type TriageTurnInput,
} from "./index.ts";

const sourceText = "Je tousse un peu depuis hier, sans fièvre.";

const needInfoGuidance = {
  placement: "after-system-prompt",
  text: "pose une seule question courte, sans nommer le 15",
} as const satisfies TriageGuidance;

const consultGuidance = {
  placement: "after-system-prompt",
  text: "recommande une consultation chez le médecin traitant, en pharmacie de garde ou en téléconsultation",
} as const satisfies TriageGuidance;

function careHandoff(
  text: string,
  earlierTurns?: TriageTurnInput["earlierTurns"],
): TriageTurnInput {
  const handoff = {
    target: "triage",
    sessionId: "session-demo-1",
    turnId: "turn-demo-1",
    channel: "text",
    intent: "care_request",
    summary: "Résumé non médical: toux légère.",
    sourceText: text,
  } as const satisfies ConversationHandoff;
  if (earlierTurns === undefined) {
    return handoff;
  }
  return { ...handoff, earlierTurns };
}

it("accepts a care_request handoff and classifies its source text", async () => {
  const handoff = careHandoff(sourceText);
  const seen: string[] = [];
  const decision = await triageTurn({
    handoff,
    classify: async ({ state }) => {
      seen.push(state);
      return { label: "self-care", probability: 0.7 };
    },
  });

  expect(seen).toEqual([sourceText]);
  expect(decision).toEqual({ label: "self-care" });
});

it("classifies the last 6 turns when the handoff includes earlier turns", async () => {
  const earlierTurns = [
    { sourceText: "Hier matin, j'avais un peu mal à la gorge." },
    { sourceText: "À midi, la douleur était toujours légère." },
    { sourceText: "Le soir, je toussais sans fièvre." },
    { sourceText: "Cette nuit, j'ai peu dormi à cause de la toux." },
    { sourceText: "Ce matin, je me sens fatigué, sans gêne forte." },
    { sourceText: "À 10 h, la toux est restée sèche." },
    { sourceText: "À midi, je bois de l'eau et je me repose." },
    { sourceText: "Cet après-midi, rien de nouveau, juste la toux." },
  ] as const;
  const seen: string[] = [];
  await triageTurn({
    handoff: careHandoff(sourceText, earlierTurns),
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
      sourceText,
    ].join("\n"),
  ]);
});

it("keeps a short history and leaves the summary out of the classifier state", async () => {
  const earlierTurns = [
    { sourceText: "Hier, j'avais la gorge un peu serrée." },
    { sourceText: "Aujourd'hui, je tousse encore un peu." },
  ];
  const seen: string[] = [];
  await triageTurn({
    handoff: careHandoff(sourceText, earlierTurns),
    classify: async ({ state }) => {
      seen.push(state);
      return { label: "consult", probability: 0.62 };
    },
  });

  expect(seen).toEqual([
    ["Hier, j'avais la gorge un peu serrée.", "Aujourd'hui, je tousse encore un peu.", sourceText].join("\n"),
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
    handoff: careHandoff(sourceText),
    classify: async () => ({ label: "emergency", probability: 0.91, calls }),
  });

  expect(decision).toEqual({ label: "emergency", calls });
  expect(decision).not.toHaveProperty("guidance");
});

it("maps consult to one guidance line after the system prompt", async () => {
  const decision = await triageTurn({
    handoff: careHandoff(sourceText),
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

it("maps a need-info label to guidance and no calls", async () => {
  const result = {
    label: "need-info",
    reason: "model",
    probability: 0.41,
  } satisfies ClassifyResult;
  const decision = await triageTurn({
    handoff: careHandoff(sourceText),
    classify: async () => result,
  });

  expect(decision).toEqual({ label: "need-info", guidance: needInfoGuidance });
  expect(decision).not.toHaveProperty("calls");
  expect(decision).not.toHaveProperty("messages");
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

it("types the handoff, the decision, and guidance placed after the system prompt", () => {
  expectTypeOf<ConversationHandoff>().branded.toEqualTypeOf<{
    readonly target: "triage";
    readonly sessionId: string;
    readonly turnId: string;
    readonly channel: ConversationChannel;
    readonly intent: Exclude<RequestIntent, "unsupported" | "end_conversation">;
    readonly summary: string;
    readonly sourceText: string;
  }>();
  expectTypeOf<ConversationHandoff["intent"]>().toEqualTypeOf<
    "care_request" | "document_request" | "general_question"
  >();
  expectTypeOf<"unsupported">().not.toMatchTypeOf<ConversationHandoff["intent"]>();
  expectTypeOf<"end_conversation">().not.toMatchTypeOf<ConversationHandoff["intent"]>();
  expectTypeOf<ConversationChannel>().toEqualTypeOf<"text" | "voice" | "inbox">();
  expectTypeOf<"sms">().not.toMatchTypeOf<ConversationChannel>();
  expectTypeOf<ConversationHandoff["target"]>().toEqualTypeOf<"triage">();

  type FallbackDecision = Extract<TriageDecision, { label: "need-info" }>;
  expectTypeOf<FallbackDecision["label"]>().toEqualTypeOf<"need-info">();
  expectTypeOf<"emergency">().not.toMatchTypeOf<FallbackDecision["label"]>();
  expectTypeOf<FallbackDecision>().not.toHaveProperty("calls");
  expectTypeOf<FallbackDecision["guidance"]["placement"]>().toEqualTypeOf<"after-system-prompt">();
  expectTypeOf<Extract<TriageDecision, { label: "consult" }>["guidance"]["placement"]>().toEqualTypeOf<
    "after-system-prompt"
  >();
  expectTypeOf<"before-system-prompt">().not.toMatchTypeOf<TriageGuidance["placement"]>();
  expectTypeOf<"inside-system-prompt">().not.toMatchTypeOf<TriageGuidance["placement"]>();
  expectTypeOf<Extract<TriageDecision, { label: "emergency" }>>().not.toHaveProperty("guidance");
  expectTypeOf<Extract<TriageDecision, { label: "emergency" }>["calls"]>().toEqualTypeOf<EmergencyCalls>();
  expectTypeOf<Extract<TriageDecision, { label: "self-care" }>>().not.toHaveProperty("guidance");
  expectTypeOf<Extract<TriageDecision, { label: "self-care" }>>().not.toHaveProperty("calls");
  expectTypeOf<Extract<TriageDecision, { label: "consult" }>>().not.toHaveProperty("calls");
  expectTypeOf<TriageDecision>().not.toHaveProperty("reason");
  expectTypeOf<TriageDecision>().not.toHaveProperty("messages");
});
