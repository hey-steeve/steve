# triage

## Role

`triage` classifies one conversation handoff. The label is `emergency`, `consult`, `self-care`, or `need-info`.

## Does

- `triageTurn` takes the handoff and an injected `classify` function.
- The output is `urgent`, `watch`, or `not urgent`.
- Zod validates the output.
- If the output is invalid, or the time limit is exceeded, the result is `watch`, with a confirmation question.
- The handoff fields are `target` (`triage`), `sessionId`, `turnId`, `channel` (`text`, `voice`, or `inbox`), `intent`, `summary`, and `sourceText`.
- `intent` is `care_request`, `document_request`, or `general_question`.
- `classify` receives `state`. With no earlier turns, `state` is `sourceText`. With `earlierTurns`, `state` is the last 6 turns, oldest first, and the current `sourceText` is last.
- `summary`, `sessionId`, and `turnId` stay out of `state`.
- `emergency` carries `calls` (`EmergencyCalls` in `src/types.ts`). It has no guidance line. The chat prompt owns the 15 and 3114 wording.

## Does not

- Does not diagnose.
- Does not prescribe.
- No keyword list.
- Does not book.

## Inputs and outputs

- `triageTurn` takes `TriageTurnRequest` from `features/triage/src/triage-turn.ts`. `handoff` is `ConversationHandoff`, or that same shape plus optional `earlierTurns`. `classify` maps `{ state }` to `ClassifyResult`.
- The output is `urgent`, `watch`, or `not urgent`, validated by Zod. The schema is to be defined.
- `triageTurn` returns `TriageDecision`. Only `emergency` has `calls`. Only `need-info` and `consult` have `guidance`.

## Depends on

This module does not import another feature. The caller injects `classify`. A shared handoff type, when it exists, comes from `@steve/shared` on its own branch.

## Rules

- Never diagnose.
- Never prescribe.
- No keyword list.
- If the output is invalid, or the time limit is exceeded, the result is `watch`, then a confirmation question.
- A `need-info` label stays `need-info`, with the need-info guidance line, and with no `calls`.
- Emergency routing (15, 3114, never 112 or SOS Médecins) is defined only in `app/src/app/api/chat/system-prompt.ts`.
- Doubt does not default to 15: when in doubt, ask one short question or recommend a consultation, never 15 by default.
- `app/src/app/api/chat/route.test.ts` rejects only the literals `Dans le doute, appelle le 15.` and `appelle le 116 117`.
- Steve does not book a 15 or 3114 referral.
- Does not read an environment variable or an API key.
- Does not call the network. The caller injects `classify`.
- Does not return a chat `messages` array.
- Does not put guidance before the system prompt, or inside it.

## Demo and production

Tests inject `classify` and do not call the network. A live classifier call stays in the caller, and it uses synthetic or demo text.

## Check

`pnpm --filter @steve/triage test`

## Status

`triageTurn` and the classifier client are in the package. The eval set is still to be defined.

## Guidance

- `need-info` carries one guidance line, `pose une seule question courte, sans nommer le 15`.
- `consult` carries one guidance line, `recommande une consultation chez le médecin traitant, en pharmacie de garde ou en téléconsultation`.
- Each guidance object has `placement: "after-system-prompt"`. The system prompt stays the first message of the chat call.
- `self-care` has no guidance line.
- The local `ConversationHandoff` copies the open PR 37 fields. When that contract is in `@steve/shared`, switch this module to the shared type. Do not import `@steve/conversation`.
