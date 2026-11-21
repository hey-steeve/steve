# inbox

## Role

`inbox` is Steve's email address.

## Does

- Receives confirmations.
- Receives reports.
- Files the confirmation or the report in `vault` or in `reminders`.
- Sends documents to practitioners.

## Does not

- Does not diagnose.
- Does not book.

## Inputs and outputs

- The input is a confirmation, or a report. The contracts are to be defined.
- Filing into `vault`, or into `reminders`. The contracts are to be defined.
- The output is a document sent to a practitioner. The contract is to be defined.

## Depends on

`@steve/shared`. The link with `vault` and with `reminders` goes through shared contracts, to be defined.

## Rules

- Never diagnose.
- Nothing enters the agenda without confirmation from the practice.
- Reminders cover only appointments that are in the agenda.

## Demo and production

To be defined.

## Check

`pnpm --filter @steve/inbox test`

The tests are to be defined.

## Status

To do. Owner:
