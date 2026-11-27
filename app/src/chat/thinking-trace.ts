// The thinking trace shows only steps that really ran for this turn. The
// server reports the triage label in a response header; the app knows the
// rest (it reads the message, runs the directory search, shows the reply).

export const triageTraceHeader = "x-steve-triage";

const triageOutcomes = ["emergency", "consult", "self-care", "need-info"] as const;
export type TriageOutcome = (typeof triageOutcomes)[number];

export type TraceStatus = "done" | "doing" | "failed";

export type TraceStep = {
  readonly id: "read" | "think" | "triage" | "search" | "answer";
  readonly title: string;
  readonly status: TraceStatus;
  readonly detail?: string;
  readonly tag?: string;
};

export type FinishedTrace = {
  readonly steps: readonly TraceStep[];
  readonly ms: number;
};

export function parseTriageOutcome(value: string | null): TriageOutcome | undefined {
  return triageOutcomes.find((outcome) => outcome === value);
}

export const readStep: TraceStep = { id: "read", title: "Je lis ta demande", status: "done" };

export const thinkStep: TraceStep = { id: "think", title: "Je réfléchis", status: "doing" };

export const answerStep: TraceStep = { id: "answer", title: "Je prépare ma réponse", status: "done" };

export function triageStep(outcome: TriageOutcome): TraceStep {
  const title = "Je vérifie s’il y a une urgence";
  if (outcome === "emergency") {
    return { id: "triage", title, status: "done", detail: "Signe d’urgence repéré" };
  }
  if (outcome === "need-info") {
    return { id: "triage", title, status: "done" };
  }
  return { id: "triage", title, status: "done", detail: "Pas de signe d’urgence repéré" };
}

export function searchStep(
  filters: { readonly specialty: string; readonly postalCode: string },
  result:
    | { readonly kind: "searching" }
    | { readonly kind: "failed" }
    | { readonly kind: "found"; readonly count: number; readonly demo: boolean },
): TraceStep {
  const title = `Je cherche : ${filters.specialty.toLowerCase()} près de ${filters.postalCode}`;
  if (result.kind === "searching") {
    return { id: "search", title, status: "doing", tag: "Annuaire Santé" };
  }
  if (result.kind === "failed") {
    return { id: "search", title, status: "failed", detail: "Annuaire indisponible" };
  }
  const detail =
    result.count === 0
      ? "Aucun praticien trouvé"
      : `${result.count} praticien${result.count === 1 ? "" : "s"} trouvé${result.count === 1 ? "" : "s"}`;
  return result.demo
    ? { id: "search", title, status: "done", detail }
    : { id: "search", title, status: "done", detail, tag: "Annuaire Santé" };
}

export function baseSteps(outcome: TriageOutcome | undefined): readonly TraceStep[] {
  return outcome === undefined ? [readStep] : [readStep, triageStep(outcome)];
}

export function elapsedLabel(ms: number): string {
  return `${Math.max(1, Math.round(ms / 1000))} s`;
}

export function traceSummary(trace: FinishedTrace): string {
  const count = trace.steps.length;
  return `Réfléchi ${elapsedLabel(trace.ms)} · ${count} étape${count === 1 ? "" : "s"}`;
}
