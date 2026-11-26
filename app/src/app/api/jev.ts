import type { Handoff, Turn } from "@steve/shared";
import { classify, triageTurn, type ClassifyResult, type TriageDecision } from "@steve/triage";
import { recordTriageLog } from "./chat/triage-log";
import { envString } from "./env";

export async function triageWithJev(handoff: Handoff<readonly Turn[]>): Promise<TriageDecision | null> {
  const jevKey = envString("JEV_API_KEY");
  if (jevKey === undefined) {
    recordTriageLog({ cause: "no-triage", reason: "missing-key" });
    return null;
  }
  const jevModel = envString("JEV_MODEL");
  return triageTurn({
    handoff,
    classify: async ({ state }) => {
      try {
        const result = await classify({
          state,
          fetch: fetchWithBearer(jevKey),
          ...(jevModel === undefined ? {} : { model: jevModel }),
        });
        logClosed(result);
        return result;
      } catch {
        recordTriageLog({ cause: "no-triage", reason: "throw" });
        throw new Error("triage");
      }
    },
  });
}

function fetchWithBearer(apiKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${apiKey}`);
    return fetch(input, { ...init, headers });
  };
}

function logClosed(result: ClassifyResult): void {
  if (result.label !== "need-info") {
    return;
  }
  switch (result.reason) {
    case "http":
    case "timeout":
    case "network":
    case "malformed":
      recordTriageLog({ cause: "no-triage", reason: result.reason });
      return;
    case "model":
    case "below-threshold":
    case "no-channel":
      return;
  }
}
