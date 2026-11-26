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

This change provides the reusable booking core and an injectable adapter contract. It does not provide a Twilio adapter, telephony configuration, credentials, call scripts, persistence, or a real outbound call. A later integration can implement `PracticeCaller`; demo integrations must still use synthetic data and must never contact a real practice.

## Check

`pnpm --filter @steve/booking test`

`pnpm --filter @steve/booking typecheck`

## Status

Core implemented. Twilio and application integration remain to be done separately.
