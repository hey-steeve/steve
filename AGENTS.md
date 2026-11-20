# Steve

Steve is a health agent that people phone. The agent handles orientation and care management. It never gives a diagnosis. For an emergency, the agent refers the caller to 15, the SAMU emergency line.

The project is Alan AI Health Hack #2 on 28 Nov 2026.

Planned work covers memory and profile, a document vault, booking by an outbound call to a medical practice, and reminders. The repo holds only the skeleton. Domain types and feature behavior are not here yet.

## Layout

`shared/` is the workspace package `@steve/shared`. A feature may import this package and no other workspace package.

The demo core is `@steve/shared`, `@steve/voice`, `@steve/call`, `@steve/triage`, and `@steve/booking`.

Each directory under `features/` is one package. The packages, in order, are `@steve/voice`, `@steve/call`, `@steve/triage`, `@steve/booking`, `@steve/inbox`, `@steve/profile`, `@steve/vault`, and `@steve/reminders`.

`@steve/inbox` handles email in and email out. Each user gets a Steve email address. Inbox ingests appointment confirmations and lab or practice reports into reminders and the vault. Documents to practitioners go out from inbox.

The front is a later user app in `app/`. The app uses the `@steve/shared` contracts. Keep `app/` out of `features/`.

Design tokens live in `shared/src/design-tokens.ts`. The primary color is `#5c59f3`. Every other token is the string `placeholder`.

## Commands

Run `pnpm install` to install dependencies.

Run `pnpm verify` to lint, typecheck, and test. The command fails when any step fails.

Run `pnpm --filter @steve/voice test` to test one package. Put the package you changed in place of `@steve/voice`.

Run `pnpm --filter @steve/voice typecheck` to typecheck one package.

Use Node 24. The version is pinned in `.nvmrc`. CI uses that file.

## Rules

Import `@steve/shared` from a feature when you need a shared type or helper. Any other workspace import is an error. A relative import must stay inside that feature. `require()` follows the same limits.

When two features need the same type or helper, add it under `shared/` in its own pull request. Then import it from `@steve/shared`.

Do not import a feature from `shared/` by package name or by a relative path. `require()` follows the same limit.

Do not call `console` in `shared/` or in a feature. Call `log()` from `@steve/shared/logger`. The logger is not in the repo yet. It lands with the shared contracts.

Use only synthetic data. Never put real health data in the repo.

Use one feature per branch. Change `shared/` on its own branch.

## Stack

The skeleton uses TypeScript, pnpm, ESLint, and Vitest. Node with Fastify, Zod, Postgres with Prisma, Twilio, and Langfuse are chosen and are not installed yet.
