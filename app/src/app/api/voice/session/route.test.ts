import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  clientSecretTtlSeconds,
  clientSecretsUrl,
  mintVoiceSecret,
  mockSecretValue,
} from "../../../../voice/session-secret.js";
import { POST } from "./route.js";

const canary = "xai-test-canary-0123456789abcdef";
const upstreamToken = "ephemeral-token-value";
const rawUpstreamBody = "raw-upstream-detail";

beforeEach(() => {
  vi.stubEnv("STEVE_VOICE_LIVE", "1");
  vi.stubEnv("XAI_API_KEY", canary);
});

afterEach(() => {
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
  const fetchMock = stubFetch(upstreamJson({ value: upstreamToken, expires_at: 1_900_000_000.7 }));
  const response = await POST();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const body = await readObject(response.clone());
  expect(body["value"] === upstreamToken).toBe(true);
  expect(body["expires_at"]).toBe(1_900_000_000);
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
  ["a missing value", upstreamJson({ expires_at: 1_900_000_000 })],
  ["an empty value", upstreamJson({ value: "", expires_at: 1_900_000_000 })],
  ["a non-string value", upstreamJson({ value: 7, expires_at: 1_900_000_000 })],
  ["a non-numeric expires_at", upstreamJson({ value: upstreamToken, expires_at: "soon" })],
  ["a missing expires_at", upstreamJson({ value: upstreamToken })],
  ["a non-JSON body", new Response(`not json ${rawUpstreamBody}`, { status: 200 })],
  ["a JSON null", upstreamJson(null)],
  ["a whitespace-only value", upstreamJson({ value: "  \t ", expires_at: 1_900_000_000 })],
  ["an expired expires_at", upstreamJson({ value: upstreamToken, expires_at: 1_000 })],
  ["a non-finite expires_at", upstreamJson({ value: upstreamToken, expires_at: 1e999 })],
  ["the API key as value", upstreamJson({ value: canary, expires_at: 1_900_000_000 })],
  ["a value containing the API key", upstreamJson({ value: `pre-${canary}-post`, expires_at: 1_900_000_000 })],
];

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
