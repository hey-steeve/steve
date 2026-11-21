# triage

## Role

`triage` classifies each turn, then orients toward a practitioner type and a delay.

## Does

- A small, scoped LLM classifier runs on every turn.
- The output is `urgent`, `watch`, or `not urgent`.
- Zod validates the output.
- If the output is invalid, or the time limit is exceeded, the result is `watch`, with a confirmation question.
- An emergency or a doubt leads to a confirmation question, then a referral to 15.
- Orients toward a practitioner type and a delay.
- Evaluations cover 50 to 100 tricky cases. Example: "mon père a fait un AVC il y a 5 ans".
- No missed emergency is accepted.
- The datasets are in Langfuse.

## Does not

- Does not diagnose.
- Does not prescribe.
- No keyword list.
- Does not book.

## Inputs and outputs

- The input is the turn. The contract is to be defined.
- The output is `urgent`, `watch`, or `not urgent`, validated by Zod. The schema is to be defined.
- The orientation is a practitioner type and a delay. The contracts are to be defined.

## Depends on

`@steve/shared`, for the LLM client. Zod. Langfuse.

## Rules

- Never diagnose.
- Never prescribe.
- No keyword list.
- If the output is invalid, or the time limit is exceeded, the result is `watch`, then a confirmation question.
- An emergency or a doubt leads to a confirmation question, then a referral to 15.
- A confirmed emergency goes to 15, with no booking.

## Demo and production

The classifier is the same. The Langfuse dataset detail is to be defined.

## Check

Langfuse evaluations cover 50 to 100 tricky cases, with zero missed emergencies. The evaluation command is to be defined.

`pnpm --filter @steve/triage test`

The package tests are to be defined.

## Status

To do. Owner:
