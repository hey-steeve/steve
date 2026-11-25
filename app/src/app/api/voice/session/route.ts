import { mintVoiceSecret } from "../../../../voice/session-secret";

const noStore = { "Cache-Control": "no-store" } as const;
const unavailableError = "Le service vocal est indisponible. Réessayez.";

export async function POST(): Promise<Response> {
  const result = await mintVoiceSecret({
    live: liveVoiceEnabled(),
    apiKey: envString("XAI_API_KEY"),
    fetch: (input, init) => fetch(input, init),
    now: () => Date.now(),
  });
  switch (result.kind) {
    case "ok":
      return Response.json(result.secret, { status: 200, headers: noStore });
    case "missing-key":
      return Response.json({ error: unavailableError }, { status: 503, headers: noStore });
    case "upstream":
      return Response.json({ error: unavailableError }, { status: 502, headers: noStore });
  }
}

function liveVoiceEnabled(): boolean {
  const value: unknown = Reflect.get(process.env, "STEVE_VOICE_LIVE");
  return value === "1";
}

function envString(name: string): string | undefined {
  const value: unknown = Reflect.get(process.env, name);
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return trimmed;
}
