# triage

## Role

`triage` classifies each turn, then orients toward a practitioner type and a delay.

## Does

- A small, scoped LLM classifier runs on every turn.
- The output is `urgent`, `watch`, or `not urgent`.
- Zod validates the output.
- If the output is invalid, or the time limit is exceeded, the result is `watch`, with a confirmation question.
- A possible 15 or 3114 case leads to a confirmation question.
- Doubt does not default to 15.
- The referral wording is `app/src/app/api/chat/system-prompt.ts`.
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
- 15 is only for a real emergency.
- A real emergency is physical warning signs, an overdose, self-harm, or immediate danger.
- For an ordinary symptom, Steve names 15 only beside physical warning signs.
- Doubt does not default to 15.
- 3114 is for psychological distress and for suicidal thoughts.
- An overdose or self-harm that includes suicidal thoughts starts with 3114 and then adds 15.
- With no overdose, no self-harm, and no physical warning sign, Steve gives 3114 first and adds 15 only for immediate danger.
- With no overdose and no self-harm, Steve gives 15 first, then 3114, when a physical warning sign comes with suicidal thoughts or psychological distress. Chest pain during a panic attack is an example.
- Steve never gives 112 or SOS Médecins.
- The wording is `app/src/app/api/chat/system-prompt.ts`.
- `app/src/app/api/chat/route.test.ts` rejects a doubt default to 15.
- Steve does not book a 15 or 3114 referral.

## Demo and production

The classifier is the same. The Langfuse dataset detail is to be defined.

## Check

Langfuse evaluations cover 50 to 100 tricky cases, with zero missed emergencies. The evaluation command is to be defined.

`pnpm --filter @steve/triage test`

The package tests are to be defined.

## Status

To do. Owner:
