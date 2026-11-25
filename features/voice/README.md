# voice

## Role

Planned: `@steve/voice` will hold the pure in-app live-call logic: session config, event parsing, call-state reducer, and audio helpers. None of it is implemented yet.
Planned: the app will own the routes, the hook, and the UI.
`voice` decides nothing.

## Does

Planned, not implemented yet. `src/index.ts` is still `export {};`.

- Will build the pinned `grok-voice-3.0` session config, with voice `eve` and a French language hint.
- Will parse Realtime events.
- Will reduce call state, including barge-in.
- Will encode and decode PCM16.
- Twilio is out of scope for this demo. Phone calls come later.

## Does not

- Triage or diagnose.
- Mint tokens.
- Talk to xAI. The app does that.

## Inputs and outputs

Planned:

- The config input will be injected instructions and tuning.
- The events will be typed server events.
- The output will be call state and PCM16 helpers.
- The contracts will land in this package in the next PR.

## Depends on

Planned: nothing but the package itself, for the demo core. The app will import the public index.
`@steve/shared` will be allowed later, if a shared contract is added in its own PR.

## Rules

- `voice` decides nothing.
- Never diagnose.
- Planned: Jev will classify each user transcript. On an emergency that includes 15, Steve will say the exact sentences from `emergency-templates.ts` in Jev's order: `call15Now` for 15, `call3114Now` for a 3114 before 15, and `call3114` for a 3114 after 15. The call buttons will show.

## Demo and production

Planned: the Saturday 28 Nov demo will be an in-app browser call over xAI Realtime, in the same thread.
The browser will open a WebSocket to xAI with an ephemeral token minted server-side.
A call will last 10 minutes at most.
`STEVE_VOICE_LIVE=1` will enable a live token mint in the app. Any other value will keep a mock session.
`XAI_API_KEY` will be server-only. It will never reach the client.

## Glossary

- **Live call**: the in-app browser call with Steve.
- **Realtime session**: `wss://api.x.ai/v1/realtime?model=grok-voice-3.0`.
- **Ephemeral token**: a short-lived token minted server-side for the browser.
- **Server VAD**: the server detects when the user speaks.
- **Barge-in**: user speech stops Steve's playback.
- **TTFA**: time to first audio.
- **Forced sentence**: an exact sentence Steve must say.
- **Safety sidecar**: Jev on each user transcript.
- **Call bar**: planned. The floating bar with mute, hang-up, and transcript toggle.
- **Turn** with channel `"voice"`, **Handoff**: as in the [shared README](../../shared/README.md). **Jev** and **EmergencyCalls** belong to `@steve/triage` (see the [triage README](../triage/README.md)).

## Resources

- xAI Realtime
- xAI Speech to Speech

## Check

`pnpm --filter @steve/voice test`

## Status

In progress for the Saturday 28 Nov in-app demo. Twilio later.
