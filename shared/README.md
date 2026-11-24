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

A `Turn` is one patient input. `sessionId` identifies the session. `turnId` identifies the turn. `channel` is `"voice"` or `"text"`. `turnChannels` lists those two values. `TurnChannel` is that union. `text` is what the patient said.

Conversation uses a `Handoff<Data>` to pass a request to a feature. `sessionId` identifies the session. `turnId` identifies the turn. `target` and `intent` are strings. `data` is the payload. `Data` defaults to `unknown`.

A `FeatureResult<Data>` is what the feature returns. `ok: true` includes `reply`. `data` is optional on success. `ok: false` includes `reply` and has no `data`. `reply` is what the patient hears. A feature with no payload returns `{ ok: true, reply }`.

The `VoiceProvider` interface, the logger, and the LLM client are still to be defined. The value exports are the design tokens, the marmot avatar, and `turnChannels`.

## Glossary

`shared/src/conversation.ts` defines these names.

- `Turn`. One patient input. Its fields are `sessionId`, `turnId`, `channel`, and `text`.
- `sessionId`. The id of one session.
- `turnId`. The id of one turn.
- `channel`. `"voice"` or `"text"`.
- `turnChannels`. The values `"voice"` and `"text"`.
- `TurnChannel`. A value from `turnChannels`.
- `Handoff`. A request a conversation passes to a feature. Its fields are `sessionId`, `turnId`, `target`, `intent`, and `data`. `Data` defaults to `unknown`.
- `FeatureResult`. The value a feature returns. Success has `ok` true, a `reply`, and optional `data`. Failure has `ok` false and a `reply`.

## Depends on

No workspace package.

## Rules

- Never diagnose. `shared` does not hold that decision.

## Demo and production

To be defined.

## Check

`pnpm --filter @steve/shared test`

`pnpm --filter @steve/shared typecheck`

`shared/src/conversation.test.ts` checks `Turn`, `Handoff`, and `FeatureResult`. The `expectTypeOf` assertions fail under `tsc`. Vitest alone does not run them.

## Status

To do. Owner:
