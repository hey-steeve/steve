import type { Handoff, Turn } from "@steve/shared";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const classifyMock = vi.hoisted(() => vi.fn());

vi.mock("@steve/triage", async () => {
  const actual = await vi.importActual<typeof import("@steve/triage")>("@steve/triage");
  return { ...actual, classify: classifyMock };
});

import { triageWithJev } from "./jev.js";
import { readTriageLog, resetTriageLog } from "./chat/triage-log.js";

const jevCanary = "test-jev-key-canary";

function handoff(): Handoff<readonly Turn[]> {
  const turn: Turn = { sessionId: "s", turnId: "turn-0", channel: "text", text: "Mal de gorge" };
  return {
    sessionId: "s",
    turnId: "turn-0",
    target: "triage",
    intent: "care_request",
    data: [turn],
  };
}

function readInput(): { fetch: typeof fetch; model?: string } {
  const input: unknown = classifyMock.mock.calls[0]?.[0];
  if (typeof input !== "object" || input === null) {
    throw new Error("classify not called");
  }
  const fetchFn: unknown = Reflect.get(input, "fetch");
  const model: unknown = Reflect.get(input, "model");
  if (typeof fetchFn !== "function") {
    throw new Error("missing fetch");
  }
  return {
    fetch: (url, init) => fetchFn(url, init),
    ...("model" in input && typeof model === "string" ? { model } : {}),
  };
}

beforeEach(() => {
  classifyMock.mockReset();
  resetTriageLog();
  vi.stubEnv("JEV_API_KEY", "");
  vi.stubEnv("JEV_MODEL", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetTriageLog();
});

it("logs missing-key and skips classify when the key is absent", async () => {
  expect(await triageWithJev(handoff())).toBeNull();
  expect(classifyMock).not.toHaveBeenCalled();
  expect(readTriageLog()).toEqual([{ cause: "no-triage", reason: "missing-key" }]);
});

it("treats a blank key as missing", async () => {
  vi.stubEnv("JEV_API_KEY", "   ");
  expect(await triageWithJev(handoff())).toBeNull();
  expect(classifyMock).not.toHaveBeenCalled();
  expect(readTriageLog()).toEqual([{ cause: "no-triage", reason: "missing-key" }]);
});

it("classifies with a bearer fetch and the configured model", async () => {
  vi.stubEnv("JEV_API_KEY", `  ${jevCanary}  `);
  vi.stubEnv("JEV_MODEL", " jev-test-model ");
  classifyMock.mockResolvedValue({ label: "need-info", reason: "model" });
  const upstream = vi.fn<typeof fetch>(async () => new Response("{}"));
  vi.stubGlobal("fetch", upstream);

  const decision = await triageWithJev(handoff());

  expect(decision).not.toBeNull();
  expect(classifyMock).toHaveBeenCalledTimes(1);
  const input = readInput();
  expect(input.model).toBe("jev-test-model");
  await input.fetch("https://jev.invalid/x", { headers: { "X-Test": "1" } });
  const headers = new Headers(upstream.mock.calls[0]?.[1]?.headers);
  expect(headers.get("Authorization") === `Bearer ${jevCanary}`).toBe(true);
  expect(headers.get("X-Test")).toBe("1");
  expect(readTriageLog()).toEqual([]);
});

it("omits the model when JEV_MODEL is unset", async () => {
  vi.stubEnv("JEV_API_KEY", jevCanary);
  classifyMock.mockResolvedValue({ label: "need-info", reason: "model" });
  await triageWithJev(handoff());
  expect("model" in readInput()).toBe(false);
});

it("logs throw and rethrows a generic error", async () => {
  vi.stubEnv("JEV_API_KEY", jevCanary);
  classifyMock.mockRejectedValue(new Error(`boom ${jevCanary}`));
  const outcome = await triageWithJev(handoff()).then(
    (decision) => ({ decision }),
    (error: unknown) => ({ error }),
  );
  if ("error" in outcome) {
    expect(outcome.error instanceof Error && outcome.error.message === "triage").toBe(true);
  } else {
    expect(outcome.decision).not.toBeNull();
  }
  expect(readTriageLog()).toEqual([{ cause: "no-triage", reason: "throw" }]);
});

it.each(["http", "timeout", "network", "malformed"] as const)(
  "logs a closed %s result",
  async (reason) => {
    vi.stubEnv("JEV_API_KEY", jevCanary);
    classifyMock.mockResolvedValue({ label: "need-info", reason });
    await triageWithJev(handoff());
    expect(readTriageLog()).toEqual([{ cause: "no-triage", reason }]);
  },
);

it.each(["model", "below-threshold"] as const)("does not log a %s need-info", async (reason) => {
  vi.stubEnv("JEV_API_KEY", jevCanary);
  classifyMock.mockResolvedValue({ label: "need-info", reason });
  await triageWithJev(handoff());
  expect(readTriageLog()).toEqual([]);
});
