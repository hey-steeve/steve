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
  return jevBody("emergency", "physical", "no");
}

const gateRows = [
  {
    id: "missing",
    item: emergencyItem("missing", ["3114", "15"]),
    body: jevBody("emergency", "physical", "no"),
    gateFailed: true,
    exitCode: 1 as const,
  },
  {
    id: "extra",
    item: emergencyItem("extra", ["15"]),
    body: jevBody("emergency", "both", "no"),
    gateFailed: true,
    exitCode: 1 as const,
  },
  {
    id: "swapped",
    item: emergencyItem("swapped", ["15", "3114"]),
    body: jevBody("emergency", "psychological", "no"),
    gateFailed: true,
    exitCode: 1 as const,
  },
  {
    id: "wrong-number",
    item: emergencyItem("wrong-number", ["15"]),
    body: jevBody("emergency", "psychological", "yes"),
    gateFailed: true,
    exitCode: 1 as const,
  },
  {
    id: "exact-15",
    item: emergencyItem("exact-15", ["15"]),
    body: jevBody("emergency", "physical", "no"),
    gateFailed: false,
    exitCode: 0 as const,
  },
  {
    id: "exact-15-3114",
    item: emergencyItem("exact-15-3114", ["15", "3114"]),
    body: jevBody("emergency", "both", "no"),
    gateFailed: false,
    exitCode: 0 as const,
  },
  {
    id: "exact-3114-15",
    item: emergencyItem("exact-3114-15", ["3114", "15"]),
    body: jevBody("emergency", "psychological", "no"),
    gateFailed: false,
    exitCode: 0 as const,
  },
  {
    id: "non-emergency-miss",
    item: {
      id: "non-emergency-miss",
      state: "synthetic",
      label: "consult",
      numbers: [],
    },
    body: jevBody("self-care", "none", "no"),
    gateFailed: false,
    exitCode: 0 as const,
  },
] as const satisfies readonly {
  readonly id: string;
  readonly item: TriageEvalCase;
  readonly body: unknown;
  readonly gateFailed: boolean;
  readonly exitCode: 0 | 1;
}[];

it("fails the gate unless every emergency case matches the ordered calls list", async () => {
  const received = [];
  for (const row of gateRows) {
    const outcome = await evaluateTriage({
      cases: [row.item],
      timeoutMs: 20,
      fetch: async () => Response.json(row.body),
    });
    received.push({
      id: row.id,
      recall: reportLine(outcome.report, "emergency recall"),
      gateFailed: outcome.gateFailed,
      exitCode: outcome.exitCode,
    });
  }
  expect(received).toEqual(
    gateRows.map((row) => ({
      id: row.id,
      recall: "emergency recall 1.000",
      gateFailed: row.gateFailed,
      exitCode: row.exitCode,
    })),
  );
});

function reportLine(report: string, prefix: string): string {
  const line = report.split("\n").find((item) => item.startsWith(prefix));
  return line ?? "";
}

function emergencyItem(
  id: string,
  numbers: readonly ["15"] | readonly ["3114", "15"] | readonly ["15", "3114"],
): TriageEvalCase {
  return { id, state: "synthetic", label: "emergency", numbers };
}

function jevBody(
  label: "emergency" | "consult" | "self-care" | "need-info",
  channel: "physical" | "psychological" | "both" | "none",
  harm: "yes" | "no",
): unknown {
  return {
    answers: {
      label: choice(label, ["emergency", "consult", "self-care", "need-info"]),
      channel: choice(channel, ["physical", "psychological", "both", "none"]),
      overdoseOrSelfHarm: choice(harm, ["yes", "no"]),
    },
  };
}

function choice(selected: string, options: readonly string[]): unknown {
  const probabilities: Record<string, number> = {};
  for (const option of options) {
    probabilities[option] = option === selected ? 0.91 : 0.03;
  }
  return { type: "choice", choice: selected, probabilities };
}
