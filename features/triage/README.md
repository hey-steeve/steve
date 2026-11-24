# triage

## Role

`triage` classifies each turn, then orients toward a practitioner type and a delay.

## Does

- A small, scoped LLM classifier runs on every turn.
- The output is `urgent`, `watch`, or `not urgent`.
- Zod validates the output.
- If the output is invalid, or the time limit is exceeded, the result is `watch`, with a confirmation question.
- A possible 15 or 3114 case leads to a confirmation question.
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
- A possible 15 or 3114 case leads to a confirmation question.
- Emergency routing (15, 3114, never 112 or SOS Médecins) is defined only in `app/src/app/api/chat/system-prompt.ts`.
- Doubt does not default to 15: when in doubt, ask one short question or recommend a consultation, never 15 by default.
- `app/src/app/api/chat/route.test.ts` rejects only the literals `Dans le doute, appelle le 15.` and `appelle le 116 117`.
- Steve does not book a 15 or 3114 referral.

## Demo and production

The classifier is the same. The Langfuse dataset detail is to be defined.

## Check

Langfuse evaluations cover 50 to 100 tricky cases, with zero missed emergencies. The evaluation command is to be defined.

`pnpm --filter @steve/triage test`

The package tests are to be defined.

## Status

To do. Owner:
