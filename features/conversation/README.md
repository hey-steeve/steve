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

- The input is a voice turn, or a text turn. The contracts are to be defined.
- The output is a handoff. The contracts are to be defined.

## Depends on

`@steve/shared` only. The link with `voice` and with `inbox` goes through shared contracts, to be defined.

## Rules

- Never diagnose.
- A confirmed emergency goes to 15, with no booking.
- Every conversation ends with the patient informed.

## Demo and production

The flow is the same by voice and by text. The difference between the demo and production is to be defined.

## Check

`pnpm --filter @steve/conversation test`

The tests are to be defined.

## Status

To do. Owner:
