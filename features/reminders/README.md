# reminders

## Role

`reminders` sends an appointment reminder or a medication reminder, by call or by SMS, only for an appointment in the agenda.

## Does

- Appointment reminder.
- Medication reminder.
- The channel is a call, or SMS.
- The appointment must be in `agenda`.

## Does not

- No reminder if the appointment is not in the agenda.
- Does not book.
- Does not diagnose.

## Inputs and outputs

- The input is an appointment that is in `agenda`. The contract is to be defined.
- The output is a reminder by call, or a reminder by SMS. The contracts are to be defined.

## Depends on

`@steve/shared`. The source is `agenda`, through a shared contract to be defined.

## Rules

- Reminders cover only appointments that are in the agenda.
- Never diagnose.

## Demo and production

To be defined.

## Check

`pnpm --filter @steve/reminders test`

The tests are to be defined.

## Status

To do. Owner:
