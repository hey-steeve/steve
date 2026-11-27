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

- Input: `Turn` (`sessionId`, `turnId`, `channel`, `text`) from `@steve/shared` and `ConversationState`.
- Output: `HandleConversationTurnResult` (`state`, `outcome`), dispatching `Handoff<Data>` and returning `FeatureResult<Data>` replies.

## Depends on

`@steve/shared` only. `Turn`, `Handoff`, `FeatureResult`, and `TurnChannel` are imported from `@steve/shared`. Triage, intent resolution, and feature dispatch are injected via `ConversationDeps`.

## Rules

- Never diagnose.
- A 15 or 3114 referral uses the wording in `app/src/app/api/chat/emergency-templates.ts` (supplied by the injected `triageGate`).
- Steve does not book a 15 or 3114 referral.
- Every conversation ends with the patient informed.

## Demo and production

The flow is identical for `"voice"` and `"text"` channels. Callers supply the channel-specific adapters through `ConversationDeps`.

## Check

`pnpm --filter @steve/conversation test`

`pnpm --filter @steve/conversation typecheck`

## Status

Done (state machine and turn orchestrator). Owner:
