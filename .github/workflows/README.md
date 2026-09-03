# CI

[`ci.yml`](./ci.yml) runs on every push to `main` and on every pull request. Two jobs run in parallel:

## `quality` (fast, no services)

Runs the cheap checks with no database:

| Step         | Command             | What it enforces                           |
| ------------ | ------------------- | ------------------------------------------ |
| Format check | `pnpm format:check` | `prettier --check .` (style is consistent) |
| Lint         | `pnpm lint`         | `eslint .` (no unused code, no undefined)  |
| Typecheck    | `pnpm check`        | `svelte-kit sync && svelte-check`          |
| Unit tests   | `pnpm test`         | `vitest run` (DB-free unit suite)          |

## `e2e` (Postgres service + Playwright)

Spins up an ephemeral `postgres:16` service, provisions + seeds it, then runs the Playwright
suite (which boots the app itself via `playwright.config.ts`'s `webServer`):

```
prisma generate → prisma db push → pnpm db:seed → playwright install chromium → pnpm test:e2e
```

No repository secrets are required — the DB is throwaway and the app secrets are fixed CI dummies
(`LUCIA_SECRET`, `TIMELOG_API_SECRET`). On failure the Playwright HTML report is uploaded as an artifact.

## Reproduce e2e locally

```bash
# with the local Postgres running (see CLAUDE.md / .env.example)
pnpm db:push        # provision schema
pnpm db:seed        # seed the demo org + users (global-setup needs employee@veent.ph)
pnpm test:e2e       # Playwright runs `pnpm build` + `pnpm preview`, then the suite (#287)
```

`test:e2e` runs Playwright under `dotenv -e .env.dev`, because `global-setup.ts` opens its own
`PrismaClient` in Playwright's process — the dev server's env does not reach it, so without this
the local run dies on `Environment variable not found: DATABASE_URL` before a single test starts.
It stays correct in CI: `dotenv -e` on a missing file is a no-op, and it never overrides a variable
the environment already set, so the workflow's own env still wins.

## Branch protection (manual, one-time)

Mark **`quality`** and **`e2e`** as required status checks on `main`
(Settings → Branches → branch protection) so the Constitution's "no merge without passing tests"
rule is enforced by the platform, not by convention.
