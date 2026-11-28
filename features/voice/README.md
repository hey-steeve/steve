# voice

## Role

`@steve/voice` holds the pure in-app live-call primitives: session config, event parsing, the call-state reducer (including barge-in), and PCM16 helpers.
Planned: the app will own the routes, the hook, and the UI.
`voice` decides nothing.

## Does

- Builds the pinned `grok-voice-3.0` session config, with voice `eve` and an English language hint.
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
- The contracts live in this package. The public index exports them.

## Depends on

Nothing but the package itself, for the demo core. The public index exports the contracts. Planned: the app will import the public index.
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
