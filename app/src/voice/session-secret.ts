// Server only. Imported by app/src/app/api/voice/session/route.ts, never by client code.

export const clientSecretsUrl = "https://api.x.ai/v1/realtime/client_secrets";
// Token lifetime in seconds (the xAI docs example). Not the 600 second call cap.
export const clientSecretTtlSeconds = 300;
// Reserved value for mock mode. A client that sees it opens no xAI socket.
export const mockSecretValue = "steve-voice-mock-session";
const upstreamTimeoutMs = 10_000;

export type VoiceSecret = {
  readonly value: string;
  readonly expires_at: number;
};

export type VoiceSecretResult =
  | { readonly kind: "ok"; readonly secret: VoiceSecret }
  | { readonly kind: "missing-key" }
  | { readonly kind: "upstream" };

export type MintOptions = {
  readonly live: boolean;
  readonly apiKey: string | undefined;
  readonly fetch: typeof fetch;
  readonly now: () => number;
};

export async function mintVoiceSecret(options: MintOptions): Promise<VoiceSecretResult> {
  if (!options.live) {
    return { kind: "ok", secret: mockSecret(options.now) };
  }
  if (options.apiKey === undefined) {
    return { kind: "missing-key" };
  }
  try {
    const response = await options.fetch(clientSecretsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expires_after: { seconds: clientSecretTtlSeconds } }),
      signal: AbortSignal.timeout(upstreamTimeoutMs),
    });
    if (!response.ok) {
      return { kind: "upstream" };
    }
    const secret = readSecret(await response.json());
    return secret === null ? { kind: "upstream" } : { kind: "ok", secret };
  } catch {
    return { kind: "upstream" };
  }
}

export function mockSecret(now: () => number): VoiceSecret {
  return {
    value: mockSecretValue,
    expires_at: Math.floor(now() / 1000) + clientSecretTtlSeconds,
  };
}

function readSecret(payload: unknown): VoiceSecret | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const value: unknown = Reflect.get(payload, "value");
  const expiresAt: unknown = Reflect.get(payload, "expires_at");
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) {
    return null;
  }
  return { value, expires_at: Math.floor(expiresAt) };
}
