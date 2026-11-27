# Booking

## Role

`booking` receives an appointment request and an ordered list of selected practitioners. It asks an injected `PracticeCaller` adapter to contact at most two practices and returns the first explicitly confirmed slot.

## Does

- Preserves the order of selected practitioners.
- Tries at most two practitioners and stops after the first valid confirmation.
- Continues after a refusal, unavailability, invalid response, or adapter error.
- Returns an explicit `confirmed` or `not-confirmed` result with the attempts made.
- Contains adapter exceptions without exposing their internal details.

## Does not

- Does not provide medical advice, triage, diagnosis, or prescriptions.
- Does not record the appointment. `agenda` does that, and only after the practice confirms.
- Does not make a real phone call. The outbound channel belongs in an adapter.

## Public API

The package exports its public API only from `src/index.ts`:

- `bookAppointment(request, candidates, caller)` runs the bounded booking flow.
- `AppointmentRequest` carries a request identifier and requested time window.
- `PractitionerCandidate` identifies a selected practitioner.
- `PracticeCaller` is the injected outbound-call boundary.
- `PracticeCallResponse` is an explicit `confirmed`, `refused`, or `unavailable` adapter response.
- `BookingAttempt` records a safe outcome for each attempted practitioner.
- `ConfirmedSlot` is the validated slot returned with a confirmation.
- `BookingResult` is a discriminated `confirmed` or `not-confirmed` result.
- `ScriptedPracticeCaller` runs deterministic in-memory scenarios for tests, demos, and local integrations.
- `ScriptedPracticeScenario` assigns an ordered step sequence to a practitioner identifier.
- `ScriptedPracticeStep` is a discriminated `confirmed`, `refused`, `unavailable`, or simulated `failure` step.

Identifiers must be non-empty. Time windows must contain parseable ISO timestamps with an explicit timezone and end after they start. Invalid boundary values throw a `TypeError` before any call is attempted.

## Depends on

No workspace package. An implementation of `PracticeCaller` is injected by the consumer.

## Rules

- At most two practitioners are called, in input order.
- A slot is confirmed only when the adapter explicitly returns `kind: "confirmed"`, a non-empty confirmation identifier, and a valid slot.
- Ambiguous or incomplete adapter responses are never promoted to confirmations.
- Adapter exceptions become `caller-error` attempts; exception details are not returned.
- Inputs and adapter values are defensively copied.
- Steve does not book emergency referrals.
- Nothing enters the agenda without confirmation from the practice.
- Only synthetic data may be used in demos and tests.

## Demo and production

`ScriptedPracticeCaller` is reserved for tests, demos, and local integrations. It is entirely in memory and never makes a phone call or network request. Each call consumes one configured step for that practitioner. An unknown practitioner or a practitioner whose sequence is exhausted deterministically returns `unavailable`. A `failure` step throws a generic error so `bookAppointment` can record a safe `caller-error` attempt.

```ts
import {
  bookAppointment,
  ScriptedPracticeCaller,
  type AppointmentRequest,
  type PractitionerCandidate,
} from "@steve/booking";

const request: AppointmentRequest = {
  requestId: "synthetic-request-001",
  requestedWindow: {
    startsAt: "2026-12-02T09:00:00+01:00",
    endsAt: "2026-12-02T18:00:00+01:00",
  },
};

const practitioners: readonly PractitionerCandidate[] = [
  {
    practitionerId: "synthetic-practitioner-a",
    displayName: "Synthetic Practice A",
  },
  {
    practitionerId: "synthetic-practitioner-b",
    displayName: "Synthetic Practice B",
  },
];

const caller = new ScriptedPracticeCaller([
  {
    practitionerId: "synthetic-practitioner-a",
    steps: [{ kind: "refused" }],
  },
  {
    practitionerId: "synthetic-practitioner-b",
    steps: [
      {
        kind: "confirmed",
        confirmationId: "synthetic-confirmation-001",
        slot: {
          startsAt: "2026-12-02T10:00:00+01:00",
          endsAt: "2026-12-02T10:30:00+01:00",
        },
      },
    ],
  },
]);

const result = await bookAppointment(request, practitioners, caller);
```

### Scripted caller limits

- At most `MAX_SCRIPTED_PRACTITIONERS` (50) practitioners may be configured.
- At most `MAX_SCRIPTED_STEPS_PER_PRACTITIONER` (20) steps may be configured per practitioner.
- The call history retains at most `MAX_SCRIPTED_HISTORY_ENTRIES` (100) entries.
- `historyLimit` may reduce the retained history size but cannot exceed the package maximum.
- Duplicate practitioner identifiers and invalid steps are rejected at construction time.
- `getHistory()` returns defensive copies of validated call input snapshots in call order.

Production still requires a separate `PracticeCaller` implementation. This package does not provide a Twilio adapter, telephony configuration, credentials, call scripts, persistence, or a real outbound call. Demo integrations must use synthetic data and must never contact a real practice.

## Check

`pnpm --filter @steve/booking test`

`pnpm --filter @steve/booking typecheck`

## Status

Core and deterministic scripted adapter implemented. Twilio and application integration remain to be done separately.
