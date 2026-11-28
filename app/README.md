# App

`app/` is the Next.js front. `/` redirects to `/chat`, the home.

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

The route shortens a mock reply and a live reply to 4000 characters and keeps the start of the text. The chat page shortens an assistant turn to 4000 characters before it sends the history. The next request can include that shortened turn.

The route reads at most 1048576 bytes, then parses JSON. A larger body returns HTTP 413 and `{ "error": "Requête trop volumineuse." }`. The chat page sends only the newest 40 messages, so a long chat still fits. If that slice would start on an assistant turn, the page drops that turn. The request still starts with a user turn.

A request whose `Content-Type` media type is not `application/json` returns HTTP 415 and `{ "error": "Type de contenu non pris en charge." }`. The route accepts `application/json` with parameters, such as `charset=utf-8`.

## OpenRouter

The names are in the root `.env.example`. There is no `app/.env.example`.

For the hackathon deployment, set `HACKATHON_AI_BASE_URL` and the secret
`HACKATHON_AI_KEY`. When both values are present and `STEVE_CHAT_LIVE=1`, the
route uses the Anthropic SDK with model `claude-sonnet` through the hackathon
gateway. This takes priority over OpenRouter. If either hackathon value is
missing, the route keeps the OpenRouter behavior documented below.

Next.js reads env files from `app/`, the directory that contains `next.config.ts`. Put real values in `app/.env.local`. That file stays untracked.

`OPENROUTER_API_KEY` is the OpenRouter API key. The route reads it on the server and trims it. Whitespace alone counts as empty.

`OPENROUTER_MODEL` is the model id sent to OpenRouter. The route trims it. When the value is missing or empty, the route sends the pinned default, `openai/gpt-6.1-terra`.

`JEV_API_KEY` is the TypeSafe key. The route reads it on the server and trims it. The classify request sends it as `Authorization: Bearer`. A missing or empty value skips classify, and the route sends only the system prompt.

`JEV_MODEL` is the optional classify model id. The route trims it. A missing or empty value omits the model, and classify uses its own default.

`STEVE_CHAT_LIVE` must be exactly `1`, and `OPENROUTER_API_KEY` must be set, before the route calls OpenRouter. Any other value keeps the canned reply, even when the key is set. `true`, `0`, and ` 1 ` keep the canned reply.

When the route calls OpenRouter, it sends the French system prompt in `system-prompt.ts`, then the validated history, to `POST https://openrouter.ai/api/v1/chat/completions`. The prompt states the 15 and 3114 rules, the medication ban, and the reply limits. The JSON includes `max_tokens` set to 1024 and `reasoning` set to `{ "effort": "low", "exclude": true }`. HTTP 200 looks like this.

```json
{
  "reply": "Une pharmacie de garde.",
  "mocked": false,
  "model": "openai/gpt-6.1-terra"
}
```

The response `model` is the `model` string from the OpenRouter JSON, the id of the model that ran. When that string is missing or empty, the response `model` is the id the route sent.

The route aborts the OpenRouter call after 30 seconds. Each case below returns HTTP 502. With no triage calls, the body is `{ "error": "Le service de chat est indisponible. Réessayez." }`. With triage calls, the body also includes `calls` in that order. The `error` string starts with the exact required block for each call, in that same order, then the unavailable sentence. The block for 15 is `call15Now`. The block for a 3114 before that 15, and for a 3114 when the list has no 15, is `call3114Now`. The block for a 3114 after that 15 is `call3114`. The constants live in `src/app/api/chat/emergency-templates.ts`.

- OpenRouter responds with a status outside 2xx.
- The call throws a network error.
- The call exceeds 30 seconds and aborts.
- The 2xx body is not JSON.
- The JSON has no assistant text, including a missing `choices` array, an empty `choices` array, a missing `message`, or blank `content`.
- Blank `content` is `""` or whitespace. A `stop` finish and a `length` finish both return this 502.
- `finish_reason` is `length`, and the assistant text has no complete sentence.
- `finish_reason` is `content_filter`.
- `finish_reason` is `error`. The provider failed during the reply, so the route drops any partial text.

A complete sentence ends in `.`, `!`, or `?`. A closing `»` after that mark stays with the sentence. A `.` inside a token, such as `2.5`, is not an ending. A `.` after a number at the start of a line is not an ending when that line is a list item. A list item has no leading space. It starts with `N.` and then non-newline whitespace. That whitespace includes a space, a tab, and a no-break space. `N` is 1, or one greater than the number on the previous list item. The previous item is the previous non-empty line. Any other line-start `N.` is an ending, including `15.` and `3114.`. A line that starts `15. Sinon` outside a list still ends at `15.`. A line that is only `15.` or `3114.` is an ending. A cut inside a later list item drops that marker when the items are consecutive and the list starts at 1. A cut can leave a dangling marker in these cases.

- The list starts at 3.
- A bullet comes before `2.`.
- The markers mix `1)` and `2.`.
- The marker is indented, as in `  10.`.

When `finish_reason` is `length` and a complete sentence remains, the route returns the text through the last one. The trimmed reply still ends on a sentence. The route drops any cut-off sentence after that ending. The 4000-character cap still applies. If the cap cuts off the ending, the route trims to the last sentence inside the cap. When that trim finds nothing, the route returns the 502 above. When `finish_reason` is `stop`, the route returns the assistant text after the same cap. A missing `finish_reason` does the same. Any other `finish_reason` returns the assistant text after that cap.

The route does not return the upstream body. Do not print the key.

The chat page shows **Mode démo : réponses simulées** after a reply with `mocked` set to `true`. It shows a failed reply on an error card.

## Access

Deploy live mode on the tailnet. The route does not enforce that placement. The route has no auth and no rate limit. In live mode, every valid request spends the OpenRouter key. Live mode sends the message text to OpenRouter. The route caps the request body, the message count, and each message, as `POST /api/chat` describes.

### Voice session Access

For the Saturday 28 Nov demo, serve live voice on the tailnet only. Use `tailscale serve`. Do not use Funnel. The route does not enforce that placement and has no auth. It caps minting at 10 requests per minute per IP. It returns HTTP 429 above that cap, with no upstream call.

## Mascot WebP files

`shared/assets/mascot/` is the source. `app/src/sync-mascot-webps.ts` encodes WebP files into `app/public/mascot/`. `app/next.config.ts` calls `syncBrandIcons()` and then `syncMascotWebps()` on `next dev`, `next build`, and `next start`.

`app/public/mascot/` is gitignored. Commit the PNG sources. Do not commit the WebP files.

A later run replaces the files inside `app/public/mascot/` and leaves that folder in place. `app/public/icons/` works the same way. The run deletes its own staging directory. It also deletes a staging directory whose age is at least 15 minutes.

The encoder is sharp 0.35.5, a dependency of `@steve/app`. Next.js lists the same version as an optional dependency. The script resizes each sized PNG, then encodes WebP at quality 80 and alpha quality 80. `bubbles.webp` is not resized. It is a lossless WebP at the PNG size.

The chat page loads two files.

- `bubbles.webp` comes from `body/bubbles.png` with no resize. The file stays 1137 by 840, which matches the `width` and `height` on the hero image. The encode is lossless. The hero draws it at 284px.
- `pfp-lavender-profile.webp` comes from `avatar/pfp-lavender-profile.png`, scaled to 192 by 192. The source background is `#daddfe`. The WebP encode stays at quality 80.

`app/src/chat/faces.ts` names five more files for `faceFor`. The chat page does not call `faceFor`. The generator still writes them so those URLs resolve.

- `state-listening.webp` comes from `states/listening.png`.
- `state-thinking.webp` comes from `states/thinking.png`.
- `state-calling.webp` comes from `states/calling.png`.
- `state-done.webp` comes from `states/done.png`.
- `state-urgent.webp` comes from `states/urgent.png`.

Each state file is 256 by 256.

The generator does not write `hello.webp` or `pfp-indigo.webp`. No app code references `body/hello.png` or `avatar/pfp-indigo.png`.

`app/src/sync-mascot-webps.test.ts` runs the generator twice and checks the file set, the WebP bytes, and that the PNG sources are unchanged.
