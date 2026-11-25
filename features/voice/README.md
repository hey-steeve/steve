# voice

## Role

`@steve/voice` holds the pure in-app live-call logic: session config, event parsing, call-state reducer, and audio helpers.
The app owns the routes, the hook, and the UI.
`voice` decides nothing.

## Does

- Builds the pinned `grok-voice-3.0` session config, with voice `eve` and a French language hint.
- Parses Realtime events.
- Reduces call state, including barge-in.
- Encodes and decodes PCM16.
- Twilio is out of scope for this demo. Phone calls come later.

## Does not

- Triage or diagnose.
- Mint tokens.
- Talk to xAI. The app does that.

## Inputs and outputs

- The config input is injected instructions and tuning.
- The events are typed server events.
- The output is call state and PCM16 helpers.
- The contracts land in this package in the next PR.

## Depends on

Nothing but the package itself, for the demo core. The app imports the public index.
`@steve/shared` is allowed later, if a shared contract is added in its own PR.

## Rules

- `voice` decides nothing.
- Never diagnose.
- Safety: Jev classifies each user transcript. On an emergency, Steve says the exact 15 / 3114 sentences and the call buttons show. Follow Jev's call order; when 3114 follows 15, reuse `call3114` (no new sentence).

## Demo and production

The Friday demo is an in-app browser call over xAI Realtime, in the same thread.
The browser opens a WebSocket to xAI with an ephemeral token minted server-side.
A call lasts 10 minutes at most.
`STEVE_VOICE_LIVE=1` enables a live token mint in the app. Any other value keeps a mock session.
`XAI_API_KEY` is server-only. It never reaches the client.

## Glossary

- **Live call**: the in-app browser call with Steve.
- **Realtime session**: `wss://api.x.ai/v1/realtime?model=grok-voice-3.0`.
- **Ephemeral token**: a short-lived token minted server-side for the browser.
- **Server VAD**: the server detects when the user speaks.
- **Barge-in**: user speech stops Steve's playback.
- **TTFA**: time to first audio.
- **Forced sentence**: an exact sentence Steve must say.
- **Safety sidecar**: Jev on each user transcript.
- **Call bar**: the floating bar with mute, hang-up, and transcript toggle.
- **Turn** with channel `"voice"`, **Handoff**: as in the [shared README](../../shared/README.md). **Jev** and **EmergencyCalls** belong to `@steve/triage` (see the [triage README](../triage/README.md)).

## Resources

- xAI Realtime
- xAI Speech to Speech

## Check

`pnpm --filter @steve/voice test`

## Status

In progress for the Friday in-app demo. Twilio later.
