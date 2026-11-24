# shared

## Role

`shared` holds the typed contracts for the workspace, with no business logic.

## Does

- Typed contracts.
- `VoiceProvider` interface.
- Logger.
- LLM client.
- Design tokens.
- Mascot images, in `shared/assets/mascot/`.

## Does not

- No business logic.

## Inputs and outputs

Features import `@steve/shared`.

`Turn`, `Handoff`, and `FeatureResult` are the conversation contracts. They live in `shared/src/conversation.ts`.

A `Turn` is one patient input. `sessionId` identifies the session. `source` is `"voice"` or `"text"`. `turnSources` lists those two values. `text` is what the patient said.

Conversation uses a `Handoff<Data>` to pass a request to a feature. `target` and `intent` are strings. `data` is the payload. `Data` defaults to `unknown`.

A `FeatureResult<Data>` is what the feature returns. `ok: true` includes `reply`. `data` is optional on success. `ok: false` includes `reply` and has no `data`. `reply` is what the patient hears. A feature with no payload returns `{ ok: true, reply }`.

The `VoiceProvider` interface, the logger, and the LLM client are still to be defined. Design tokens and the marmot avatar are exported.

## Depends on

No workspace package.

## Rules

- Never diagnose. `shared` does not hold that decision.

## Demo and production

To be defined.

## Check

`pnpm --filter @steve/shared test`

`shared/src/conversation.test.ts` checks `Turn`, `Handoff`, and `FeatureResult`.

## Status

To do. Owner:
