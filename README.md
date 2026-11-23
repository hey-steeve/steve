<h1 align="center">Steve</h1>

<p align="center">
  <em>The health agent that acts for you.</em>
</p>

<p align="center">
  <img src="shared/assets/mascot/body/lounge-call-page.png" alt="Steve on the phone in an armchair" width="200">
</p>

<p align="center">Steve guides and organizes your care pathway. He calls, books and reschedules for you.</p>

Built for [Alan x Qovery x AWS: AI Health Hack 2](https://luma.com/o1eopuwy), Paris, 28 November 2026.

## Run the app locally

Use Node 24, per `.nvmrc`.

Install pnpm 10.33.0. `package.json` sets `packageManager` to `pnpm@10.33.0`.

The dev server starts with no env file.

From the repo root, run:

```bash
pnpm install
pnpm --filter @steve/app dev
```

Open http://localhost:3000. `/` redirects to `/chat`.

Port 3000 is the Next.js default. To use another port, pass `-p` with the new port number.

```bash
pnpm --filter @steve/app dev -p 3001
```

The root `package.json` has no `dev` script. `app/package.json` sets `dev` to `next dev`.

Run `pnpm verify` to lint, typecheck, test, and build.

Agent rules live in [AGENTS.md](./AGENTS.md).

## License

[Apache-2.0](LICENSE). Copyright 2026 Steve.

### Third-party

Apache-2.0 covers only the code and Steve's own assets.

The [SIL Open Font License 1.1](app/src/fonts/OFL.txt) covers the Alan Sans font.

The Alan marmot in `shared/assets/mascot/duo/` belongs to Alan and is not covered by Apache-2.0.
