# booking

## Role

`booking` receives a chosen practitioner, calls the practice by voice, and returns a confirmed or refused slot.

## Does

- Receives a chosen practitioner.
- Places the outbound voice call to the practice.
- Returns a confirmed slot, or a refused slot.
- Tries at most 2 practitioners.

## Does not

- No medical advice.
- Does not diagnose.
- Does not record the appointment. `agenda` does that, and only after the practice confirms.

## Inputs and outputs

- The input is a chosen practitioner. The contract is to be defined.
- The output is a confirmed slot, or a refused slot. The contract is to be defined.

## Depends on

`@steve/shared`. Outbound voice call. The channel detail is to be defined.

## Rules

- At most 2 practitioners.
- No medical advice.
- Never diagnose.
- A confirmed emergency goes to 15, with no booking.
- Nothing enters the agenda without confirmation from the practice.
- In the demo, never call a real practice.

## Demo and production

`booking` calls the practice. In the demo, an environment variable replaces the practice number with a teammate's number. The demo does not call a real practice.

## Check

`pnpm --filter @steve/booking test`

The tests are to be defined.

## Status

To do. Owner:
