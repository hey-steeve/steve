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

Conversation reads and returns the contracts from `@steve/shared`.

- The input is a `Turn`. `source` is `"voice"` or `"text"`, the members of `turnSources`.
- The output is a `Handoff<Data>`. `target` and `intent` are strings. `data` is the payload. `Data` defaults to `unknown`.
- A feature returns a `FeatureResult<Data>`. `reply` is what the patient hears. `data` is present only when `ok` is `true`.

## Depends on

`@steve/shared` only. `Turn`, `Handoff`, and `FeatureResult` are defined there. The link with `voice` and with `inbox` goes through shared contracts that are still to be defined.

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
