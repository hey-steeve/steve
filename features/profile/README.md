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

- The input is the identity, the declared history, the preferences, and the call history. The contracts are to be defined.
- The output is the memory, read back. The contracts are to be defined.

## Depends on

`@steve/shared`.

## Rules

- No interpretation.
- Never diagnose.

## Demo and production

To be defined.

## Check

`pnpm --filter @steve/profile test`

The tests are to be defined.

## Status

To do. Owner:
