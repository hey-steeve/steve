import { expect, it } from "vitest";
import { consultGuidance, type TriageDecision, triageGuidances } from "./triage-turn.ts";

// Type-level proof that the guidance is a closed set. `pnpm typecheck` compiles this
// file, so an `@ts-expect-error` that stops erroring fails the typecheck.

export const editedConsult: TriageDecision = {
  label: "consult",
  // @ts-expect-error a computed text outside the closed set must not type-check
  guidance: { ...consultGuidance, text: "pose deux questions" },
};

export const newLiteral: TriageDecision = {
  label: "need-info",
  // @ts-expect-error a new literal text outside the closed set must not type-check
  guidance: { placement: "after-system-prompt", text: "répète la question" },
};

export const closedMember: TriageDecision = { label: "consult", guidance: consultGuidance };

it("keeps the closed set at two guidances", () => {
  expect(triageGuidances).toHaveLength(2);
});
