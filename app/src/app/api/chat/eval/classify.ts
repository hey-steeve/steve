export type RouteClass =
  | { readonly kind: "canned" }
  | { readonly kind: "reply"; readonly reply: string }
  | { readonly kind: "error"; readonly detail: string };

export type EvalCounts = {
  readonly passed: number;
  readonly failed: number;
  readonly errors: number;
  readonly total: number;
};

export type EvalStatus = {
  readonly scored: boolean;
  readonly failed: number;
  readonly errors: number;
};

export const firstCaseErrorMessage =
  "Stopped after the first case. The route returned an error, so this run did not score the model.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function classifyRouteResponse(status: number, body: unknown): RouteClass {
  if (!isRecord(body)) {
    return { kind: "error", detail: `http ${status}` };
  }
  if (body["mocked"] === true) {
    return { kind: "canned" };
  }
  const reply = body["reply"];
  if (typeof reply === "string" && reply.startsWith("[Réponse simulée]")) {
    return { kind: "canned" };
  }
  if (status === 200 && typeof reply === "string" && reply.length > 0) {
    return { kind: "reply", reply };
  }
  const error = body["error"];
  if (typeof error === "string" && error.length > 0) {
    return { kind: "error", detail: error };
  }
  return { kind: "error", detail: `http ${status}` };
}

export function formatEvalSummary(counts: EvalCounts): string {
  return `passed ${counts.passed}/${counts.total}, failed ${counts.failed}, errors ${counts.errors}`;
}

export function afterRouteError(caseIndex: number): "stop" | "continue" {
  if (caseIndex === 0) {
    return "stop";
  }
  return "continue";
}

export function evalExitCode(status: EvalStatus): 0 | 1 {
  if (!status.scored || status.failed > 0 || status.errors > 0) {
    return 1;
  }
  return 0;
}
