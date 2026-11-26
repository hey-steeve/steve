import { envString } from "../../env";
import { admitMint } from "../../../../voice/mint-cap";
import { mintVoiceSecret } from "../../../../voice/session-secret";

const noStore = { "Cache-Control": "no-store" } as const;
const tooManyError = "Trop de demandes. Réessayez.";
const unavailableError = "Le service vocal est indisponible. Réessayez.";

export async function POST(request?: Request): Promise<Response> {
  if (!admitMint(request, Date.now())) {
    return Response.json({ error: tooManyError }, { status: 429, headers: noStore });
  }
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
