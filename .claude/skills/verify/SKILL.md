---
name: verify
description: How to build, launch, and drive Veent HRIS locally to verify a change end-to-end.
---

# Verifying Veent HRIS changes

## Launch

- Postgres must be up (Docker container `veent_wifiportal-db-1`, reachable at `localhost:5433`, db `veent_hris` per `.env`). `bun run prisma db push` syncs the schema (repo uses db push, no migration files).
- Dev server: `bun run dev --port <port>` (run in background, poll `curl http://localhost:<port>/login` until 200; takes a few seconds).
- Seeded logins (also in `tests/e2e/helpers.ts`): `admin@veent.ph`/`Admin@1234` (Super Admin), `manager@veent.ph`/`Manager@1234`, `employee@veent.ph`/`Employee@1234`, plus `payroll@veent.ph`, `finance@veent.ph`.

## Drive

- Use Playwright from the repo's node_modules: `import { chromium } from '@playwright/test'`. If the script lives outside the repo, symlink `node_modules` next to it (ESM resolves from the script's dir, not cwd).
- Login flow: fill `Email`/`Password` labels on `/login`, click `Sign In`, wait for `**/dashboard`.
- **Hydration gotcha:** buttons that toggle client `$state` (e.g. "New Request" on `/requests`) do nothing if clicked before Svelte hydrates. Retry the click until the target element appears.
- Form-success gotcha: after a `use:enhance` submit succeeds, toggled forms stay open (button now reads "Close") but fields reset.

## Clean up

- Delete driver-created rows with a one-off `node --input-type=module -e` script using `@prisma/client` (give test records a distinctive `reason`/label to target them).
- File uploads land in the store configured by `UPLOAD_DIR` (default `uploads/`, gitignored) keyed by entity id — remove the matching entity-id subdirs wherever that points.
