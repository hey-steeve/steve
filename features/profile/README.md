# profile

## Role

`profile` stores patient memory, without interpreting it.

## Does

- Identity.
- Declared history.
- Preferences.
- Call history.

## Does not

- Does not interpret that memory.
- Does not diagnose.

## Inputs and outputs

- The input is the identity, the declared history, the preferences, and the call history.
- The output is that memory, read back through `loadDemoPatientMemory`.
- `@steve/shared` exports no patient-memory contract. `parsePatientMemory` checks the demo record in this package.

## Depends on

`@steve/shared`, once that package exports a patient-memory contract. It does not yet, so this fixture stays in the package.

## Rules

- No interpretation.
- Never diagnose.

## Demo and production

`loadDemoPatientMemory` returns the demo patient Peter Parker. He is 32 on `2026-11-22`. His child Lina is 4 on that date. The record has `demo: true`.

Practitioner names, practice names, and street names are invented. Identifiers follow `DEMO-RPPS-0001`, with a different four-digit suffix for each practitioner. They are placeholders, not RPPS numbers and not ADELI numbers. The record has no phone, no email, and no document. The knee X-ray is one sentence in the declared history.

The recorded waits are chosen delays for a non-urgent visit in Île-de-France. The GP waited 8 days. The knee X-ray waited 7 days. The dentist waited 35 days. The pediatrician waited 14 days. The ophthalmologist waited 141 days.

## Check

`pnpm --filter @steve/profile test`

## Status

Demo fixture only. Owner:
