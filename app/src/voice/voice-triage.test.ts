import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchVoiceTriage, parseDecision } from "./voice-triage";

const current = { sessionId: "s", turnId: "t1", channel: "voice", text: "ça va mal" } as const;
const signal = new AbortController().signal;
const reply = (body: unknown, ok = true) =>
  vi.fn((_url: string, _init: RequestInit) =>
    Promise.resolve({ ok, json: () => Promise.resolve(body) }),
  );

afterEach(() => vi.unstubAllGlobals());

describe("fetchVoiceTriage", () => {
  it("posts current and previous, no-store, and reads the decision", async () => {
    const f = reply({ turnId: "t1", decision: { label: "self-care" } });
    vi.stubGlobal("fetch", f);
    const previous = [{ sessionId: "s", turnId: "h0", channel: "text", text: "avant" }] as const;
    expect(await fetchVoiceTriage(current, previous, signal)).toEqual({ label: "self-care" });
    const [url, init] = f.mock.calls[0] ?? [];
    expect(url).toBe("/api/voice/triage");
    expect(init?.method).toBe("POST");
    expect(init?.cache).toBe("no-store");
    expect(JSON.parse(String(init?.body))).toEqual({ current, previous });
  });

  it.each([
    ["non-OK", reply({}, false)],
    ["malformed body", reply("nope")],
    ["wrong turn", reply({ turnId: "other", decision: { label: "self-care" } })],
    ["bad label", reply({ turnId: "t1", decision: { label: "panic" } })],
    ["bad call order", reply({ turnId: "t1", decision: { label: "emergency", calls: [] } })],
    ["thrown fetch", vi.fn((_url: string, _init: RequestInit) => Promise.reject(new Error("net")))],
  ])("returns null on %s", async (_n, f) => {
    vi.stubGlobal("fetch", f);
    expect(await fetchVoiceTriage(current, [], signal)).toBeNull();
  });
});

describe("parseDecision", () => {
  const c15 = { type: "call", number: "15" };
  const c3114 = { type: "call", number: "3114" };
  it("accepts the four emergency orders", () => {
    for (const calls of [[c15], [c3114], [c15, c3114], [c3114, c15]]) {
      expect(parseDecision({ label: "emergency", calls })).not.toBeNull();
    }
    expect(parseDecision({ label: "emergency", calls: [c15, c15] })).toBeNull();
  });
  it("rejects a guidance text outside the closed set", () => {
    expect(parseDecision({ label: "need-info", guidance: { text: "invente" } })).toBeNull();
  });
});
