# conversation

## Role

`conversation` runs one conversation, by voice or by text, with the same flow.

## Does

- Greets the patient.
- Understands the request.
- Hands off.
- Voice goes through `voice`.
- Text is the app chat. SMS and email come later, through `inbox`.

## Does not

- Does not triage.
- Does not book.

## Inputs and outputs

These are the planned inputs and outputs. `@steve/shared` defines them. This package does not read them yet.

- The planned input is a `Turn`. `sessionId` identifies the session. `turnId` identifies the turn. `channel` is `"voice"` or `"text"`. Those two values are the members of `turnChannels`. `TurnChannel` is that union. `text` is what the patient said.
- The planned output is a `Handoff<Data>`. `sessionId` identifies the session. `turnId` identifies the turn. `target` and `intent` are strings. `data` is the payload. `Data` defaults to `unknown`.
- A feature returns a `FeatureResult<Data>`. `reply` is what the patient hears. `data` is optional on success. The failure branch has no `data`. A feature with no payload returns `{ ok: true, reply }`.

## Depends on

The planned dependency is `@steve/shared` only. `Turn`, `Handoff`, and `FeatureResult` are defined there. This package does not depend on `@steve/shared` yet. The link with `voice` and with `inbox` goes through shared contracts that are still to be defined.

## Rules

- Never diagnose.
- A 15 or 3114 referral uses the wording in `app/src/app/api/chat/system-prompt.ts`.
- Steve does not book a 15 or 3114 referral.
- Every conversation ends with the patient informed.

## Demo and production

The flow is the same by voice and by text. The difference between the demo and production is to be defined.

## Check

`pnpm --filter @steve/conversation test`

The tests are to be defined.

## Status

To do. Owner:
