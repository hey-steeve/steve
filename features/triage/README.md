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
- The default timeout is 1500 ms (the `JEV_TIMEOUT_MS` constant). A timeout, a `timeoutMs` that `AbortSignal.timeout` rejects, an HTTP error, a thrown fetch, or a malformed body is `need-info`. None of those is `emergency`.
- The wording the patient hears stays in `app/src/app/api/chat/system-prompt.ts`. Triage carries the numbers only.

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
- The patient-facing sentences for 15 and 3114 stay in `app/src/app/api/chat/system-prompt.ts`. Never 112. Never SOS Médecins.
- Doubt does not default to 15. Below 0.8, or channel `none`, there is no 15.
- `app/src/app/api/chat/route.test.ts` rejects only the literals `Dans le doute, appelle le 15.` and `appelle le 116 117`.
- Steve does not book a 15 or 3114 referral.

## Demo and production

The classifier is the same. Langfuse evaluation is not in this repo yet. The triage eval will log Jev latency, and the 1500 ms default may change after that.

## Check

`pnpm --filter @steve/triage test`

## Status

The Jev client and its unit tests are in this package. The chat route does not call `classify` yet.
