# agenda

## Role

`agenda` is the patient calendar. It records only confirmed appointments.

## Does

- Records an appointment only if it is confirmed.
- Syncs Google Calendar.
- Syncs an `.ics` file.
- Is the source for `reminders`.

## Does not

- Records nothing without confirmation from the practice.
- Does not send reminders.

## Inputs and outputs

- The input is a confirmed appointment. The `Appointment` contract is to be defined.
- The output is the patient calendar. The contract is to be defined.
- `reminders` reads this source. The contract is to be defined.

## Depends on

`@steve/shared`. Google Calendar. The `.ics` format.

## Rules

- Nothing enters the agenda without confirmation from the practice.
- Never diagnose.

## Demo and production

To be defined.

## Check

`pnpm --filter @steve/agenda test`

The tests are to be defined.

## Status

To do. Owner:
