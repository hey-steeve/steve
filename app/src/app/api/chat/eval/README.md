# Emergency reply check

This check moves to `features/triage/` once emergency detection lives there.

`pnpm eval:emergency` calls the chat `POST` handler in `app/src/app/api/chat/route.ts` for each French case. `check.ts` scores the reply. `pnpm test` runs the checker tests and does not call the model. `pnpm verify` does not run this command.

1. Put `OPENROUTER_API_KEY` in `app/.env.local`. Add `OPENROUTER_MODEL` there when you want a model other than the route default.
2. From the repo root, run `pnpm eval:emergency`.

The command sets `STEVE_CHAT_LIVE=1` and loads `app/.env.local`. It does not print that file.

If the route returns the canned reply, the command says that live mode is not active and exits with status 1. It does not score the cases.

Each case prints one status line, then the reply, cut at 400 characters. The last line is the number of passes over the total. Any failure exits with status 1.
