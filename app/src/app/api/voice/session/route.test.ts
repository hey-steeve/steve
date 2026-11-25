import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  clientSecretSkewSeconds,
  clientSecretTtlSeconds,
  clientSecretsUrl,
  mintVoiceSecret,
  mockSecretValue,
} from "../../../../voice/session-secret.js";
import { resetMintCapForTests } from "../../../../voice/mint-cap.js";
import { POST } from "./route.js";

const canary = "xai-test-canary-0123456789abcdef";
const upstreamToken = "ephemeral-token-value";
const rawUpstreamBody = "raw-upstream-detail";
const fixedNowMs = 1_800_000_000_500;
const nowSeconds = Math.floor(fixedNowMs / 1000);
const expiryCap = nowSeconds + clientSecretTtlSeconds + clientSecretSkewSeconds;

beforeEach(() => {
  resetMintCapForTests();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(fixedNowMs);
  vi.stubEnv("STEVE_VOICE_LIVE", "1");
  vi.stubEnv("XAI_API_KEY", canary);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubFetch(response: Response | Error): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) {
      throw response;
    }
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function upstreamJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

async function readObject(response: Response): Promise<Readonly<Record<string, unknown>>> {
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null) {
    throw new Error("expected a JSON object");
  }
  return Object.fromEntries(Object.entries(body));
}

function firstCall(fetchMock: ReturnType<typeof vi.fn>): { url: unknown; init: RequestInit } {
  const call: unknown[] = fetchMock.mock.calls[0] ?? [];
  const init = call[1];
  if (typeof init !== "object" || init === null) {
    throw new Error("expected a fetch init");
  }
  return { url: call[0], init };
}

async function expectNoLeak(response: Response): Promise<void> {
  const text = await response.text();
  expect(text.includes(canary)).toBe(false);
  expect(text.includes("Bearer")).toBe(false);
  expect(text.includes(rawUpstreamBody)).toBe(false);
}

it("returns the minted secret with exactly value and expires_at in live mode", async () => {
  const fetchMock = stubFetch(upstreamJson({ value: upstreamToken, expires_at: nowSeconds + clientSecretTtlSeconds + 0.7 }));
  const response = await POST();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const body = await readObject(response.clone());
  expect(body["value"] === upstreamToken).toBe(true);
  expect(body["expires_at"]).toBe(nowSeconds + clientSecretTtlSeconds);
  expect(Object.keys(body).sort()).toEqual(["expires_at", "value"]);
  expect((await response.text()).includes(canary)).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const call = firstCall(fetchMock);
  expect(call.url).toBe(clientSecretsUrl);
  expect(call.url).toBe("https://api.x.ai/v1/realtime/client_secrets");
  expect(call.init.method).toBe("POST");
  const headers: unknown = call.init.headers;
  const expectedHeaders = { Authorization: `Bearer ${canary}`, "Content-Type": "application/json" };
  expect(JSON.stringify(headers) === JSON.stringify(expectedHeaders)).toBe(true);
  expect(clientSecretTtlSeconds).toBe(300);
  const sent: unknown = JSON.parse(String(call.init.body));
  expect(sent).toEqual({ expires_after: { seconds: 300 } });
});

it("returns 503 without calling upstream when the key is missing in live mode", async () => {
  vi.stubEnv("XAI_API_KEY", "");
  const fetchMock = stubFetch(upstreamJson({ value: upstreamToken, expires_at: 1 }));
  const response = await POST();
  expect(response.status).toBe(503);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("returns 503 without calling upstream when the key is blank in live mode", async () => {
  vi.stubEnv("XAI_API_KEY", "   ");
  const fetchMock = stubFetch(upstreamJson({ value: upstreamToken, expires_at: 1 }));
  const response = await POST();
  expect(response.status).toBe(503);
  expect(fetchMock).not.toHaveBeenCalled();
});

for (const live of ["", "0", "true", "yes", "01", " 1", "1 ", "TRUE"]) {
  it(`stays on the mock without fetching when STEVE_VOICE_LIVE is ${JSON.stringify(live)}`, async () => {
    vi.stubEnv("STEVE_VOICE_LIVE", live);
    const fetchMock = stubFetch(upstreamJson({ value: upstreamToken, expires_at: 1 }));
    const response = await POST();
    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    const body = await readObject(response);
    expect(body["value"]).toBe(mockSecretValue);
  });
}

it("stays on the mock when STEVE_VOICE_LIVE is unset", async () => {
  vi.stubEnv("STEVE_VOICE_LIVE", undefined);
  const fetchMock = stubFetch(upstreamJson({ value: upstreamToken, expires_at: 1 }));
  const response = await POST();
  expect(response.status).toBe(200);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("returns the reserved mock value with a future expiry and no-store", async () => {
  vi.stubEnv("STEVE_VOICE_LIVE", "0");
  const before = Math.floor(Date.now() / 1000);
  const response = await POST();
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const body = await readObject(response);
  const expiresAt = body["expires_at"];
  expect(Object.keys(body).sort()).toEqual(["expires_at", "value"]);
  expect(body["value"]).toBe(mockSecretValue);
  expect(Number.isInteger(expiresAt)).toBe(true);
  expect(expiresAt).toBeGreaterThan(before);
});

it("derives the mock expiry from the injected clock", async () => {
  const fetchMock = vi.fn();
  const result = await mintVoiceSecret({
    live: false,
    apiKey: canary,
    fetch: fetchMock,
    now: () => 1_000_000_500,
  });
  expect(result).toEqual({
    kind: "ok",
    secret: { value: mockSecretValue, expires_at: 1_000_000 + clientSecretTtlSeconds },
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

const invalidPayloads: readonly (readonly [string, Response])[] = [
  ["a missing value", upstreamJson({ expires_at: nowSeconds + clientSecretTtlSeconds })],
  ["an empty value", upstreamJson({ value: "", expires_at: nowSeconds + clientSecretTtlSeconds })],
  ["a non-string value", upstreamJson({ value: 7, expires_at: nowSeconds + clientSecretTtlSeconds })],
  ["a non-numeric expires_at", upstreamJson({ value: upstreamToken, expires_at: "soon" })],
  ["a missing expires_at", upstreamJson({ value: upstreamToken })],
  ["a non-JSON body", new Response(`not json ${rawUpstreamBody}`, { status: 200 })],
  ["a JSON null", upstreamJson(null)],
  ["a whitespace-only value", upstreamJson({ value: "  \t ", expires_at: nowSeconds + clientSecretTtlSeconds })],
  ["an expired expires_at", upstreamJson({ value: upstreamToken, expires_at: 1_000 })],
  ["a non-finite expires_at", upstreamJson({ value: upstreamToken, expires_at: 1e999 })],
  ["the API key as value", upstreamJson({ value: canary, expires_at: nowSeconds + clientSecretTtlSeconds })],
  ["a value containing the API key", upstreamJson({ value: `pre-${canary}-post`, expires_at: nowSeconds + clientSecretTtlSeconds })],
];

const clampCases: readonly (readonly [string, number, number])[] = [
  ["one hour ahead", nowSeconds + 3600, expiryCap],
  ["just inside the cap", expiryCap - 1, expiryCap - 1],
  ["exactly at the cap", expiryCap, expiryCap],
  ["just above the cap", expiryCap + 1, expiryCap],
  ["a fractional value just above the cap", expiryCap + 0.5, expiryCap],
];

for (const [name, upstream, expected] of clampCases) {
  it(`returns the expiry capped at now plus ttl plus skew for ${name}`, async () => {
    const result = await mintVoiceSecret({
      live: true,
      apiKey: canary,
      fetch: async () => upstreamJson({ value: upstreamToken, expires_at: upstream }),
      now: () => fixedNowMs,
    });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.secret.expires_at).toBe(expected);
    }
  });
}

it("does not let Number.MAX_VALUE through as an expiry", async () => {
  const result = await mintVoiceSecret({
    live: true,
    apiKey: canary,
    fetch: async () => upstreamJson({ value: upstreamToken, expires_at: Number.MAX_VALUE }),
    now: () => fixedNowMs,
  });
  if (result.kind === "ok") {
    expect(Number.isSafeInteger(result.secret.expires_at)).toBe(true);
    expect(result.secret.expires_at).toBeLessThanOrEqual(expiryCap);
  } else {
    expect(result.kind).toBe("upstream");
  }
});

for (const [name, payload] of invalidPayloads) {
  it(`returns an error status for ${name} without leaking the key`, async () => {
    stubFetch(payload);
    const response = await POST();
    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expectNoLeak(response);
  });
}

it("returns an error status without leaking when upstream is unreachable", async () => {
  stubFetch(new Error(`connect failed ${canary}`));
  const response = await POST();
  expect([502, 503]).toContain(response.status);
  await expectNoLeak(response);
});

for (const status of [400, 401, 429, 500, 503]) {
  it(`returns an error status for upstream ${status} without forwarding its body`, async () => {
    stubFetch(new Response(`${rawUpstreamBody} ${canary}`, { status }));
    const response = await POST();
    expect([502, 503]).toContain(response.status);
    await expectNoLeak(response);
  });
}

function requestFrom(ip: string): Request {
  return new Request("http://localhost/api/voice/session", {
    method: "POST",
    headers: { "x-forwarded-for": `${ip}, 10.0.0.1` },
  });
}

async function mintTimes(ip: string, count: number): Promise<Response[]> {
  const responses: Response[] = [];
  for (let index = 0; index < count; index += 1) {
    responses.push(await POST(requestFrom(ip)));
  }
  return responses;
}

function stubFreshFetch(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => upstreamJson(liveBody));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const liveBody = { value: upstreamToken, expires_at: nowSeconds + clientSecretTtlSeconds };

it("allows the 10th request in a minute from the same IP", async () => {
  stubFreshFetch();
  const responses = await mintTimes("203.0.113.1", 10);
  expect(responses.every((response) => response.status === 200)).toBe(true);
});

it("returns 429 on the 11th request with no-store, no leak and zero upstream calls", async () => {
  const fetchMock = stubFreshFetch();
  await mintTimes("203.0.113.2", 10);
  expect(fetchMock).toHaveBeenCalledTimes(10);
  const response = await POST(requestFrom("203.0.113.2"));
  expect(response.status).toBe(429);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const text = await response.text();
  expect(text.includes(canary)).toBe(false);
  expect(text.includes(upstreamToken)).toBe(false);
  expect(JSON.parse(text)).toEqual({ error: "Trop de demandes. Réessayez." });
  expect(fetchMock).toHaveBeenCalledTimes(10);
});

it("does not call fetch for over-limit requests in live mode with a key set", async () => {
  const fetchMock = stubFreshFetch();
  await mintTimes("203.0.113.3", 10);
  fetchMock.mockClear();
  const responses = await mintTimes("203.0.113.3", 3);
  expect(responses.every((response) => response.status === 429)).toBe(true);
  expect(fetchMock.mock.calls.length === 0).toBe(true);
});

it("does not call fetch for over-limit requests in mock mode either", async () => {
  vi.stubEnv("STEVE_VOICE_LIVE", "0");
  const fetchMock = stubFreshFetch();
  await mintTimes("203.0.113.4", 10);
  const response = await POST(requestFrom("203.0.113.4"));
  expect(response.status).toBe(429);
  expect(fetchMock.mock.calls.length === 0).toBe(true);
});

it("keeps a separate counter for each IP", async () => {
  stubFreshFetch();
  await mintTimes("203.0.113.5", 10);
  expect((await POST(requestFrom("203.0.113.5"))).status).toBe(429);
  expect((await POST(requestFrom("203.0.113.6"))).status).toBe(200);
});

it("lets the same IP mint again once the window has slid", async () => {
  stubFreshFetch();
  await mintTimes("203.0.113.7", 10);
  expect((await POST(requestFrom("203.0.113.7"))).status).toBe(429);
  vi.setSystemTime(fixedNowMs + 60_001);
  expect((await POST(requestFrom("203.0.113.7"))).status).toBe(200);
});

it("falls back to x-real-ip, then a shared unknown bucket, and ignores blank values", async () => {
  stubFreshFetch();
  const real = (value: string): Request =>
    new Request("http://localhost/api/voice/session", { method: "POST", headers: { "x-real-ip": value } });
  for (let index = 0; index < 10; index += 1) {
    await POST(real("198.51.100.1"));
  }
  expect((await POST(real("198.51.100.1"))).status).toBe(429);
  expect((await POST(real("198.51.100.2"))).status).toBe(200);
  const blank = new Request("http://localhost/api/voice/session", {
    method: "POST",
    headers: { "x-forwarded-for": " , ", "x-real-ip": "  " },
  });
  for (let index = 0; index < 10; index += 1) {
    await POST(blank);
  }
  expect((await POST()).status).toBe(429);
});
