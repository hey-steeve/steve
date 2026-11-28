// The thinking trace shows only steps that really ran for this turn. The
// server reports the triage label in a response header; the app knows the
// rest (it reads the message, runs the directory search, shows the reply).

export const triageTraceHeader = "x-steve-triage";

const triageOutcomes = ["emergency", "consult", "self-care", "need-info"] as const;
export type TriageOutcome = (typeof triageOutcomes)[number];

export type TraceStatus = "done" | "doing" | "failed";

export type TraceStep = {
  readonly id: "read" | "triage" | "search" | "answer";
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

export const readStep: TraceStep = { id: "read", title: "Reading your request", status: "done" };

export const answerStep: TraceStep = { id: "answer", title: "Preparing my answer", status: "done" };

export function triageStep(outcome: TriageOutcome): TraceStep {
  const title = "Checking for an emergency";
  if (outcome === "emergency") {
    return { id: "triage", title, status: "done", detail: "Emergency sign spotted" };
  }
  if (outcome === "need-info") {
    return { id: "triage", title, status: "done" };
  }
  return { id: "triage", title, status: "done", detail: "No emergency sign spotted" };
}

export function searchStep(
  filters: { readonly specialty: string; readonly postalCode: string },
  result:
    | { readonly kind: "searching" }
    | { readonly kind: "failed" }
    | { readonly kind: "found"; readonly count: number; readonly demo: boolean },
): TraceStep {
  const title = `Searching: ${filters.specialty.toLowerCase()} near ${filters.postalCode}`;
  if (result.kind === "searching") {
    return { id: "search", title, status: "doing", tag: "Annuaire Santé" };
  }
  if (result.kind === "failed") {
    return { id: "search", title, status: "failed", detail: "Directory unavailable" };
  }
  const detail =
    result.count === 0
      ? "No practitioner found"
      : `${result.count} practitioner${result.count === 1 ? "" : "s"} found`;
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
  return `Thought for ${elapsedLabel(trace.ms)} · ${count} step${count === 1 ? "" : "s"}`;
}
