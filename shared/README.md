# shared

## Role

`shared` holds the typed contracts for the workspace, with no business logic.

## Does

- Typed contracts.
- `VoiceProvider` interface.
- Logger.
- LLM client.
- Design tokens.
- Mascot images, in `shared/assets/mascot/`.

## Does not

- No business logic.

## Inputs and outputs

Features import `@steve/shared`. The planned contracts are the `VoiceProvider` interface, the logger, the LLM client, and the design tokens. The other names are to be defined.

## Depends on

No workspace package.

## Rules

- Never diagnose. `shared` does not hold that decision.

## Demo and production

To be defined.

## Check

`pnpm --filter @steve/shared test`

The tests are to be defined.

## Status

To do. Owner:
