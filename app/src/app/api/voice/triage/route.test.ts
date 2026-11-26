import type { EmergencyCalls } from "@steve/triage";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const classifyMock = vi.hoisted(() => vi.fn());

vi.mock("@steve/triage", async () => {
  const actual = await vi.importActual<typeof import("@steve/triage")>("@steve/triage");
  return { ...actual, classify: classifyMock };
});

import { readTriageLog, resetTriageLog } from "../../chat/triage-log.js";
import { POST } from "./route.js";

const jevCanary = "test-jev-key-canary";
const cur = { sessionId: "s", turnId: "t2", channel: "voice", text: "Douleur thoracique" };
const prev = [{ sessionId: "s", turnId: "t1", channel: "text", text: "Bonjour" }];

function post(body: unknown = { current: cur, previous: prev }): Promise<Response> {
  return POST(
    new Request("http://localhost/api/voice/triage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  classifyMock.mockReset();
  resetTriageLog();
  vi.stubEnv("STEVE_VOICE_LIVE", "1");
  vi.stubEnv("JEV_API_KEY", jevCanary);
  vi.stubEnv("JEV_MODEL", "");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetTriageLog();
});

it("passes the ordered handoff to classify and returns the decision", async () => {
  classifyMock.mockResolvedValue({ label: "self-care" });
  const response = await post();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ turnId: "t2", decision: { label: "self-care" } });
  const input: unknown = classifyMock.mock.calls[0]?.[0];
  expect(typeof input === "object" && input !== null ? Reflect.get(input, "state") : undefined).toBe("Bonjour\nDouleur thoracique");
});

it("rejects invalid requests without calling Jev", async () => {
  const bad = await post({ current: { ...cur, channel: "text" }, previous: [] });
  expect(bad.status).toBe(400);
  expect(bad.headers.get("Cache-Control")).toBe("no-store");
  const plain = await POST(
    new Request("http://localhost/api/voice/triage", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "x",
    }),
  );
  expect(plain.status).toBe(415);
  expect(classifyMock).not.toHaveBeenCalled();
});

it("does not call Jev in mock mode", async () => {
  vi.stubEnv("STEVE_VOICE_LIVE", "");
  const response = await post();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ turnId: "t2", decision: { label: "need-info" } });
  expect(classifyMock).not.toHaveBeenCalled();
});

it("fails closed and logs missing-key when the Jev key is blank", async () => {
  vi.stubEnv("JEV_API_KEY", "   ");
  const response = await post();
  expect(await response.json()).toEqual({ turnId: "t2", decision: { label: "need-info" } });
  expect(classifyMock).not.toHaveBeenCalled();
  expect(readTriageLog()).toEqual([{ cause: "no-triage", reason: "missing-key" }]);
});

it("fails closed on a classify timeout result", async () => {
  classifyMock.mockResolvedValue({ label: "need-info", reason: "timeout" });
  const text = await (await post()).text();
  expect(JSON.parse(text)).toEqual({ turnId: "t2", decision: { label: "need-info" } });
  expect(text.includes(jevCanary)).toBe(false);
});

it("fails closed when classify throws, without leaking the error", async () => {
  classifyMock.mockRejectedValue(new Error("upstream-body-detail"));
  const text = await (await post()).text();
  expect(JSON.parse(text)).toEqual({ turnId: "t2", decision: { label: "need-info" } });
  expect(text.includes("upstream-body-detail")).toBe(false);
});

it("does not hang when classify never settles", async () => {
  vi.useFakeTimers();
  classifyMock.mockReturnValue(new Promise(() => undefined));
  const pending = post();
  await vi.advanceTimersByTimeAsync(10_000);
  const response = await pending;
  expect(await response.json()).toEqual({ turnId: "t2", decision: { label: "need-info" } });
});

const jevOrders: readonly { readonly calls: EmergencyCalls }[] = [
  { calls: [{ type: "call", number: "15" }, { type: "call", number: "3114" }] },
  { calls: [{ type: "call", number: "3114" }, { type: "call", number: "15" }] },
];

it.each(jevOrders)("keeps emergency calls in Jev order %j", async ({ calls }) => {
  classifyMock.mockResolvedValue({ label: "emergency", probability: 0.99, calls });
  const body: unknown = await (await post()).json();
  const decision: unknown = typeof body === "object" && body !== null ? Reflect.get(body, "decision") : undefined;
  expect(decision).toEqual({ label: "emergency", calls });
  expect(JSON.stringify(decision)).toBe(JSON.stringify({ label: "emergency", calls }));
});

function streamPost(source: UnderlyingDefaultSource<Uint8Array>): Promise<Response> {
  return POST(
    new Request("http://localhost/api/voice/triage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new ReadableStream(source),
      duplex: "half",
    } as RequestInit),
  );
}

it("returns 400 without calling Jev when the body read rejects", async () => {
  const response = await streamPost({
    pull() {
      throw new Error("boom");
    },
  });
  expect(response.status).toBe(400);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: "Requête invalide." });
  expect(classifyMock).not.toHaveBeenCalled();
});

it("returns 413 without calling Jev when cancel rejects on an over-size body", async () => {
  const response = await streamPost({
    start(controller) {
      controller.enqueue(new Uint8Array(70_000));
    },
    cancel() {
      throw new Error("cancel-boom");
    },
  });
  expect(response.status).toBe(413);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({ error: "Requête trop volumineuse." });
  expect(classifyMock).not.toHaveBeenCalled();
});
