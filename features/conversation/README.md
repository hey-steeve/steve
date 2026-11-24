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

`startSession({ channel })` creates a versioned session and returns a French greeting. `channel` is `"voice"` or `"text"`.

`handleTurn(turn)` accepts the shared `Turn` contract. `sessionId` identifies the session, `turnId` identifies one patient turn, `channel` identifies its transport, and `text` is the normalized patient input.

Every successfully understood turn returns a shared `Handoff<Data>` whose target is `triage`. This includes unsupported requests and requests to end the conversation. The caller must process that handoff before honoring `completeAfterTriage`. Conversation never classifies urgency itself.

The handoff carries the shared `sessionId` and `turnId`. Its data contains the source `channel`, the source text, a non-medical summary, and `completeAfterTriage`.

Sessions keep a bounded 40-turn history for provider context and a separate set of every accepted `turnId` for replay protection. A failed or timed-out understanding is not accepted or persisted, so the same turn can be retried.

## Depends on

`@steve/shared` provides `Turn`, `TurnChannel`, and `Handoff`. Conversation imports no other workspace package.

The core also receives four injected dependencies: a session store, a general request-understanding provider, an identifier generator, and a clock. The package includes an optimistic in-memory store for deterministic tests and local integration.

## Rules

- Never diagnose.
- A 15 or 3114 referral uses the wording in `app/src/app/api/chat/system-prompt.ts`.
- Steve does not book a 15 or 3114 referral.
- Every conversation ends with the patient informed.

## Demo and production

The domain flow and public result are the same for voice and text. Tests inject deterministic providers and require no network. Production must inject a validated understanding provider and a durable store. Understanding is bounded to 30 seconds and receives an abort signal.

## Check

```bash
pnpm --filter @steve/conversation test
pnpm --filter @steve/conversation typecheck
```

## Status

In progress. Owner: @idris404
