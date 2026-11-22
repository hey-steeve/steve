# Steve

Steve is a health agent that people phone. The agent handles orientation and care management. It never gives a diagnosis. 15 is only for a real emergency. A real emergency is physical warning signs, an overdose, self-harm, or immediate danger. For an ordinary symptom, the agent names 15 only beside physical warning signs. Doubt does not default to 15. 3114 is for psychological distress and for suicidal thoughts. An overdose or self-harm that includes suicidal thoughts or psychological distress starts with 3114 and then adds 15. For suicidal thoughts or psychological distress, with no overdose, no self-harm and no physical warning sign, the agent gives 3114 first and adds 15 only for immediate danger. With no overdose and no self-harm, the agent gives 15 first, then 3114, when a physical warning sign comes with suicidal thoughts or psychological distress. Chest pain during a panic attack is an example. The agent never gives 112 or SOS Médecins. The wording is `app/src/app/api/chat/system-prompt.ts`.

The project is Alan AI Health Hack #2 on 28 Nov 2026.

Feature scopes live in `features/README.md` and in each feature README. The repo holds only the skeleton. Domain types and feature behavior are not here yet.

## Layout

`shared/` is the workspace package `@steve/shared`. A feature may import this package and no other workspace package. `shared/` holds typed contracts, the `VoiceProvider` interface, the logger, the LLM client, design tokens, and the marmot avatar definition. It holds no business logic. The `@steve/shared` entry imports its modules with a `.ts` extension so `app/` can bundle that source.

Mascot images live in `shared/assets/mascot/`.

The demo core is `@steve/shared`, `@steve/voice`, `@steve/conversation`, `@steve/triage`, and `@steve/booking`.

Each directory under `features/` is one package. The packages, in order, are `@steve/voice`, `@steve/conversation`, `@steve/triage`, `@steve/directory`, `@steve/booking`, `@steve/agenda`, `@steve/profile`, `@steve/vault`, `@steve/reminders`, and `@steve/inbox`.

`@steve/voice` connects Twilio to the voice provider. Grok is first. An env variable swaps the provider. Audio goes both ways. Voice decides nothing.

`@steve/conversation` runs one conversation, by voice or by text. Text means the app chat. SMS and email come later, through inbox. The flow stays the same. Conversation greets, understands, and hands off. It does not triage. It does not book.

`@steve/triage` runs a small scoped LLM classifier on every turn. The result is urgent, watch, or not urgent. Triage orients toward a practitioner type and a delay. It never diagnoses or prescribes.

`@steve/directory` finds practitioners by specialty, distance, and conventionnement in the public Annuaire Santé. It does not book.

`@steve/booking` receives a chosen practitioner, places the outbound voice call to the practice, and returns a confirmed or refused slot. It tries at most 2 practitioners.

`@steve/agenda` is the patient calendar. It records a confirmed appointment only. It syncs Google Calendar and `.ics`. Reminders read the agenda.

`@steve/profile` stores patient memory: identity, declared history, preferences, and call history. It does not interpret that memory.

`@steve/vault` stores, retrieves, and summarizes documents. It does not interpret them medically.

`@steve/reminders` sends appointment reminders and medication reminders, by call or by SMS, and only for appointments in the agenda.

`@steve/inbox` handles email in and email out. Each user gets a Steve email address. Inbox ingests appointment confirmations and lab or practice reports into reminders and the vault. Documents to practitioners go out from inbox.

`app/` is the workspace package `@steve/app`. It is the user app, the front. `/` redirects to `/chat`, the home. `app/` may import `@steve/shared`. It may import a feature only as `@steve/<feature>`, the package public index. It must not import a path into `features/*/src`. A feature must not import `app/`. `shared/` must not import `app/`.

Design tokens live in `shared/src/design-tokens.ts`. The set is Soft Companion, grouped into color, radius, space, shadow, and font. The primary color is `designTokens.color.primary`, `#5c59f3`. The marmot definition is `shared/src/mascot/marmot.json`, exported as `marmot` from `@steve/shared`. Its color is the primary token.

## Commands

Run `pnpm install` to install dependencies.

Run `pnpm verify` to lint, typecheck, test, and build. The command fails when any step fails.

Run `pnpm --filter @steve/voice test` to test one package. Put the package you changed in place of `@steve/voice`.

Run `pnpm --filter @steve/voice typecheck` to typecheck one package.

Use Node 24. The version is pinned in `.nvmrc`. CI uses that file.

## Rules

Import `@steve/shared` from a feature when you need a shared type or helper. Any other workspace import is an error. A relative import must stay inside that feature. `require()` follows the same limits.

When two features need the same type or helper, add it under `shared/` in its own pull request. Then import it from `@steve/shared`.

Do not import a feature from `shared/` by package name or by a relative path. `require()` follows the same limit.

Do not import `app/` from a feature or from `shared/`. From `app/`, import `@steve/shared` or a feature public index `@steve/<feature>`. Do not import a deep path into `features/*/src`. `require()` follows the same limits.

Do not call `console` in `shared/`, in a feature, or in `app/`. Call `log()` from `@steve/shared/logger`. The logger is not in the repo yet. It lands with the shared contracts.

Use only synthetic data. Never put real health data in the repo.

Use one feature per branch. Change `shared/` on its own branch. The cross-boundary check flags a pull request that changes both `app/` and `shared/`. It blocks the merge once `Cross-boundary / app-shared-boundary` is a required status check in branch protection. Add the `cross-boundary` label when that mix is intentional.

Write docs, pull request text, and code comments in English. Keep user-facing strings in the app in French.

## Git rules

Do not force-push.

Do not rebase.

From your branch, run `git fetch origin` and then `git merge origin/main`. Keep the merge commit.

On a contributor pull request, Spidey's reviewer agent must approve the exact head commit. That approval adds to the CODEOWNERS review by @spideystreet. `.github/CODEOWNERS` names @spideystreet.

The reviewer agent approval does not replace the CODEOWNERS review.

Merge only after both approvals and green CI on that commit.

## Stack

The skeleton uses TypeScript, pnpm, ESLint, and Vitest. The user app in `app/` uses Next.js. Node with Fastify, Zod, Postgres with Prisma, Twilio, and Langfuse are chosen and are not installed yet.
