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

- `startSession({ channel })` creates a versioned session and returns the French
  greeting as the first assistant turn.
- `handleTurn({ sessionId, turnId, channel, text })` continues an existing
  session with a normalized text, voice, or future inbox turn.
- Every accepted turn has stable session and turn identifiers and is kept in a
  bounded conversation history.
- The result states whether the caller should await another turn, perform a
  handoff, or consider the conversation complete.
- A handoff contains correlation identifiers, the source channel and text, a
  non-medical summary, and a general request intent. It contains no urgency
  classification, diagnosis, practitioner result, or booking decision.
- Every understood request is handed toward `triage`; `conversation` never
  bypasses that safety boundary or chooses the downstream feature itself.
- Rejected and failed turns return a short French explanation so the patient is
  never left without an outcome.

## Depends on

No workspace package today. The future link with `voice`, `triage`, and `inbox`
must use separately reviewed contracts from `@steve/shared`.

The core receives four injected dependencies:

- a session store;
- a general request-understanding provider;
- an identifier generator;
- a clock.

The package includes an in-memory store for deterministic tests and local
integration. A production adapter can replace every non-deterministic or
persistent dependency without changing the conversation flow.

## Rules

- Never diagnose.
- A 15 or 3114 referral uses the wording in `app/src/app/api/chat/system-prompt.ts`.
- Steve does not book a 15 or 3114 referral.
- Every conversation ends with the patient informed.

## Demo and production

The domain flow and public result are the same for voice and text. Tests inject
deterministic providers and require no network. Production must inject a
validated understanding provider and a durable store.

## Check

```bash
pnpm --filter @steve/conversation test
pnpm --filter @steve/conversation typecheck
```

## Public entry point

Import `createConversation`, `createInMemoryConversationStore`, and the public
types from `@steve/conversation`. Consumers must not import files below `src/`.
