# triage

## Role

`triage` classifies one turn as emergency, consult, self-care, or need-info, and carries 15 and 3114 as call data.

## Does

- `classify` posts one TypeSafe System One request to `https://api.typesafe.ai/v1/systemone` for model `jev-1.14.0`. The caller injects `fetch`. `classify` does not read `JEV_API_KEY` and does not send an `Authorization` header.
- The injected fetch adds `Authorization: Bearer JEV_API_KEY` and must forward `init.signal`.
- The questions are `label`, `channel`, and `overdoseOrSelfHarm`. `channel` is `physical`, `psychological`, `both`, or `none`. `overdoseOrSelfHarm` is `yes` or `no`.
- Hand-written guards check the response. This package does not use Zod.
- P(emergency) is applied first. When it is at least 0.8 and the channel is not `none`, the result is `emergency` with ordered call data. That result is not a confirmation question.
- When P(emergency) is at least 0.8 and the channel is `none`, the result is `need-info` with reason `no-channel` and no calls.
- When the chosen label is `emergency` and P(emergency) is below 0.8, the result is `need-info` with reason `below-threshold`.
- An emergency result orders the numbers from the channel. `overdoseOrSelfHarm` is required only to tell the two `both` orders apart. It is not used for a psychological emergency, and it is not used for `physical`.
  - A psychological emergency uses 3114, then 15. The 0.8 gate passed and the channel is `psychological`. That case is treated as immediate danger, whether the overdose answer is absent, `yes`, or `no`.
  - Channel `both` with `overdoseOrSelfHarm` `yes` uses 3114, then 15.
  - Channel `both` with `overdoseOrSelfHarm` `no` uses 15, then 3114.
  - A physical emergency uses 15. A `yes` on `overdoseOrSelfHarm` does not change a `physical` channel.
- Channel `both` on an emergency result, with the overdose answer missing, is `need-info` with reason `malformed`. `classify` does not guess the order.
- When the result is not `emergency` and the channel is `psychological` or `both`, the result carries 3114 only. That includes consult, self-care, model `need-info`, and below-threshold. It does not add 15. Reason `no-channel` has no calls. Timeout, HTTP, network, and malformed results have no calls.
- The chat eval in `app/src/app/api/chat/eval/cases.ts` uses the same split. `suicidal-talk` is suicidal thoughts without acute danger. It expects 3114 only. `optional15Allowed` lets that case add `Appelle le 15 maintenant.` and does not require it. `suicidal-now`, `overdose-suicidal`, and `self-harm-distress` are acute danger (an act in progress, an overdose, a self-harm injury, or means at hand). They expect 3114, then 15.
- The default timeout is 1500 ms (the `JEV_TIMEOUT_MS` constant). A timeout, a `timeoutMs` that `AbortSignal.timeout` rejects, an HTTP error, a thrown fetch, or a malformed body is `need-info`. None of those is `emergency`.
- The wording the patient hears stays in `app/src/app/api/chat/emergency-templates.ts`. The system prompt imports it. Triage carries the numbers only.

## Does not

- Does not diagnose.
- Does not prescribe.
- Does not use a keyword list.
- Does not book.
- Does not place a call. `CallAction` is the hook for a later one-tap call.
- Does not ask a confirmation question. Confirmation belongs to that later call, not to this result.

## Inputs and outputs

- The input is `ClassifyInput`. `state` is the conversation text. `fetch` is injected. `timeoutMs` and `model` are optional.
- The output is `ClassifyResult`. Emergency calls use `EmergencyCalls`, derived from `CallAction` and `EmergencyNumber` (`15` and `3114`).
- A practitioner type and a delay are not in this package yet.

## Depends on

The TypeSafe HTTP API. There is no `@steve/shared` LLM client in this repo. Langfuse datasets are not in this repo yet.

## Rules

- Never diagnose.
- Never prescribe.
- Do not use a keyword list.
- Invalid output, a timeout, an HTTP error, or a network failure is `need-info`.
- When P(emergency) is at least 0.8 and the channel is not `none`, the result is `emergency` with ordered numbers. It is not a confirmation question.
- The patient-facing sentences for 15 and 3114 stay in `app/src/app/api/chat/emergency-templates.ts`. The system prompt imports them. Never 112. Never SOS Médecins.
- Doubt does not default to 15. Below 0.8, or channel `none`, there is no 15.
- `app/src/app/api/chat/route.test.ts` rejects `Dans le doute, appelle le 15.` and `appelle le 116 117`. The same file checks the system prompt and each triage guidance string with one matcher. The matcher applies NFC, strips accents, turns Unicode spaces into a space, turns apostrophes into `'`, and lowercases. It then flags `ne`, `n'`, `pas`, `jamais`, `sans`, or a word starting with `evit` within 32 characters of `15`, `3114`, or `samu`. It also flags `ne pas appeler`. Approved sentences in the system prompt are allowlisted. The live prompt passes. Both guidance strings pass. An injected variant fails.
- Steve does not book a 15 or 3114 referral.

## triageTurn

`triageTurn` takes a `Handoff<readonly Turn[]>` from `@steve/shared` and an injected `classify` function.

`Handoff` fields are `sessionId`, `turnId`, `target`, `intent`, and `data`. `data` is the `Turn` list. The current turn is last.

`Turn` fields are `sessionId`, `turnId`, `channel`, and `text`. `channel` is `voice` or `text`.

`state` is `Turn.text` for the last 6 turns, oldest first, with the current turn last. `sessionId`, `turnId`, `target`, `intent`, and `channel` stay out of `state`.

Emergency copies `calls` in the order `ClassifyResult` gives. Consult, self-care, and genuine need-info copy `calls` when that result has them. Those decisions omit `calls` when the result has none.

Consult guidance is `la nuit ou le week-end, oriente vers le médecin traitant ou une pharmacie de garde`. Genuine need-info guidance is `pose une seule question courte`. Both use `placement: "after-system-prompt"`. Self-care has no guidance. Guidance does not restrict 15 or 3114.

`triageTurn` returns need-info with no guidance and no calls, and does not call `classify`, when `data` is empty or the last turn's `sessionId` or `turnId` does not match the handoff. A thrown `classify`, and reasons `timeout`, `network`, `http`, and `malformed`, take that same path. Reasons `model`, `below-threshold`, and `no-channel` keep guidance. `no-channel` has no calls. This path is never emergency.

## Demo and production

The classifier is the same. Langfuse evaluation is not in this repo yet. The triage eval will log Jev latency, and the 1500 ms default may change after that.

## Check

`pnpm --filter @steve/triage test`

## Status

The Jev client and its unit tests are in this package. The live path calls `triageLive` then the chat at `app/src/app/api/chat/route.ts:51-52`, and `triageTurn` is at `app/src/app/api/chat/route.ts:68`. The `classify` callback injects a fetch that adds `Authorization: Bearer` from `JEV_API_KEY` and forwards `init.signal`. `triageTurn` reads a shared `Handoff` whose `data` is a `Turn` list. Reasons `timeout`, `network`, `http`, and `malformed`, a thrown `classify`, or a missing `JEV_API_KEY` are no-triage. On that path the route calls the chat with the plain system prompt only. The no-triage result has no guidance. A handoff with no matching current turn is the same no-triage result. Genuine need-info keeps one short question. Consult guidance names the médecin traitant or a pharmacie de garde la nuit ou le week-end.
