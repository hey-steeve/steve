import { expect, it, vi } from "vitest";
import { JEV_URL } from "../src/jev.ts";
import { evaluateTriage, runTriageEval } from "./run.ts";
import type { TriageEvalCase } from "./cases.ts";

const emergency: TriageEvalCase = {
  id: "stroke",
  state: "Ma mère a la bouche qui tombe, là maintenant.",
  label: "emergency",
  numbers: ["15"],
};

const mild: TriageEvalCase = {
  id: "headache",
  state: "J'ai un peu mal à la tête depuis hier.",
  label: "consult",
  numbers: [],
};

it("skips when JEV_API_KEY is missing and does not call fetch", async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => {
    throw new Error("network");
  });
  const outcome = await runTriageEval({ key: undefined, fetchImpl });
  expect(outcome.exitCode).toBe(0);
  expect(outcome.report).toBe("JEV_API_KEY is not set. Skipping triage eval.\n");
  expect(fetchImpl).not.toHaveBeenCalled();
});

it("records clock latencies and passes the emergency recall gate", async () => {
  const stamps = [0, 10, 10, 50];
  let index = 0;
  const seen: string[] = [];
  const outcome = await evaluateTriage({
    cases: [emergency, mild],
    timeoutMs: 20,
    model: "jev-test",
    now: () => {
      const value = stamps[index] ?? 0;
      index += 1;
      return value;
    },
    fetch: async (input, init) => {
      seen.push(String(input));
      expect(readModel(init?.body)).toBe("jev-test");
      return Response.json(emergencyPhysical());
    },
  });
  expect(seen).toEqual([JEV_URL, JEV_URL]);
  expect(outcome.gateFailed).toBe(false);
  expect(outcome.exitCode).toBe(0);
  expect(outcome.report).toContain("emergency recall 1.000");
  expect(outcome.report).toContain("p50 10 ms");
  expect(outcome.report).toContain("p95 40 ms");
  expect(outcome.report).toContain("gate pass");
});

it("fails the gate when an emergency case is not classified emergency", async () => {
  const outcome = await evaluateTriage({
    cases: [emergency],
    timeoutMs: 20,
    fetch: async () => new Response("no", { status: 500 }),
  });
  expect(outcome.gateFailed).toBe(true);
  expect(outcome.exitCode).toBe(1);
  expect(outcome.report).toContain("fallback 1");
  expect(outcome.report).toContain("gate fail");
});

it("sends the key on the injected fetch and not to the report", async () => {
  const key = "test-jev-key";
  let authorization = "";
  const outcome = await runTriageEval({
    key,
    model: "jev-test",
    cases: [emergency],
    now: () => 0,
    fetchImpl: async (_input, init) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return Response.json(emergencyPhysical());
    },
  });
  expect(authorization).toBe(`Bearer ${key}`);
  expect(outcome.report).not.toContain(key);
  expect(outcome.exitCode).toBe(0);
});

function readModel(body: unknown): string | undefined {
  const parsed: unknown = JSON.parse(String(body));
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  const model: unknown = Reflect.get(parsed, "model");
  return typeof model === "string" ? model : undefined;
}

function emergencyPhysical(): unknown {
  return {
    answers: {
      label: {
        type: "choice",
        choice: "emergency",
        probabilities: {
          emergency: 0.9,
          consult: 0.04,
          "self-care": 0.03,
          "need-info": 0.03,
        },
      },
      channel: {
        type: "choice",
        choice: "physical",
        probabilities: {
          physical: 0.9,
          psychological: 0.04,
          both: 0.03,
          none: 0.03,
        },
      },
    },
  };
}
