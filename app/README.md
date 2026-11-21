# App

`app/` is the Next.js front. `/` shows the marmot. `/chat` is the chat page.

## POST /api/chat

The request body is JSON. `messages` is a non-empty array. Each item has `role` and `content`. `role` is `user` or `assistant`. `content` is a non-empty string after trim. Turns alternate between `user` and `assistant`. The first turn is `user`. The last turn is `user`.

A valid request returns HTTP 200 and the canned reply below when `STEVE_CHAT_LIVE` is not `1`, and also when `STEVE_CHAT_LIVE` is `1` but `OPENROUTER_API_KEY` is missing or empty.

```json
{
  "reply": "[Réponse simulée] Vous avez demandé : De garde. Je ne pose pas de diagnostic. En cas d'urgence, appelez le 15.",
  "mocked": true,
  "model": "mock"
}
```

`reply` starts with `[Réponse simulée] ` and repeats the last user turn. `mocked` is `true`. `model` is `mock`.

An invalid body returns HTTP 400 and `{ "error": "Requête invalide." }`. A body that is not JSON returns HTTP 400 and `{ "error": "JSON invalide." }`.

The route accepts at most 40 messages. Each message is at most 4000 characters after trim. That limit applies to an assistant turn and to a user turn. A longer history returns HTTP 400 and `{ "error": "Requête invalide." }`. A longer message returns that same response. A history that does not alternate returns that same response.

The route reads at most 1048576 bytes, then parses JSON. A larger body returns HTTP 413 and `{ "error": "Requête trop volumineuse." }`. The chat page sends only the newest 40 messages, so a long chat still fits. If that slice would start on an assistant turn, the page drops that turn. The request still starts with a user turn.

A request whose `Content-Type` media type is not `application/json` returns HTTP 415 and `{ "error": "Type de contenu non pris en charge." }`. The route accepts `application/json` with parameters, such as `charset=utf-8`.

## OpenRouter

The names are in the root `.env.example`. There is no `app/.env.example`.

Next.js reads env files from `app/`, the directory that contains `next.config.ts`. Put real values in `app/.env.local`. That file stays untracked.

`OPENROUTER_API_KEY` is the OpenRouter API key. The route reads it on the server and trims it. Whitespace alone counts as empty.

`OPENROUTER_MODEL` is the model id sent to OpenRouter. The route trims it. When the value is missing or empty, the route sends `google/gemini-3.8-flash`.

`STEVE_CHAT_LIVE` must be exactly `1`, and `OPENROUTER_API_KEY` must be set, before the route calls OpenRouter. Any other value keeps the canned reply, even when the key is set. `true`, `0`, and ` 1 ` keep the canned reply.

When the route calls OpenRouter, it sends a short French system prompt, then the validated history, to `POST https://openrouter.ai/api/v1/chat/completions`. The JSON includes `max_tokens` set to 1024. HTTP 200 looks like this.

```json
{
  "reply": "Une pharmacie de garde.",
  "mocked": false,
  "model": "google/gemini-3.8-flash"
}
```

`model` is the `model` field from the OpenRouter JSON. That field names the model that ran. When that field is missing, `model` is the id the route sent.

The route aborts the OpenRouter call after 30 seconds. A non-2xx response, a network failure, or that timeout returns HTTP 502 and `{ "error": "Le service de chat est indisponible. Réessayez." }`. The route does not return the upstream body. Do not print the key.

The chat page shows **Mode démo : réponses simulées** after a reply with `mocked` set to `true`. It shows the model id under each agent reply when the reply is not mocked. It shows a failed reply on an error card.

## Access

Live mode stays on the tailnet only, so the route has no auth and no rate limit. It caps the request body, the message count, and each message, as `POST /api/chat` describes.

## Mascot WebP files

`shared/assets/mascot/` is the source. `app/src/sync-mascot-webps.ts` encodes WebP files into `app/public/mascot/`. `app/next.config.ts` calls `syncBrandIcons()` and then `syncMascotWebps()` on `next dev`, `next build`, and `next start`.

`app/public/mascot/` is gitignored. Commit the PNG sources. Do not commit the WebP files.

The encoder is sharp 0.35.5, a dependency of `@steve/app`. Next.js lists the same version as an optional dependency. The script resizes each PNG, then encodes WebP at quality 80 and alpha quality 80.

The chat page loads two files.

- `shrug.webp` comes from `body/shrug.png`, scaled to a height of 640. The current PNG becomes 514 by 640, which matches the `width` and `height` on the hero image.
- `pfp-lavender.webp` comes from `avatar/pfp-lavender.png`, scaled to 192 by 192.

`app/src/chat/faces.ts` names five more files for `faceFor`. The chat page does not call `faceFor`. The generator still writes them so those URLs resolve.

- `state-listening.webp` comes from `states/listening.png`.
- `state-thinking.webp` comes from `states/thinking.png`.
- `state-calling.webp` comes from `states/calling.png`.
- `state-done.webp` comes from `states/done.png`.
- `state-urgent.webp` comes from `states/urgent.png`.

Each state file is 256 by 256.

The generator does not write `hello.webp` or `pfp-indigo.webp`. No app code references `body/hello.png` or `avatar/pfp-indigo.png`.

`app/src/sync-mascot-webps.test.ts` runs the generator twice and checks the file set, the WebP bytes, and that the PNG sources are unchanged.
