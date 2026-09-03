---
name: context:all-cicd
description: "The three CI jobs, the populated-DB schema check, and the main-only GHCR deploy — the cicd group entrypoint/router"
keywords: ci, cd, github actions, pipeline, deploy, ghcr, playwright, e2e, gates, lint, typecheck, format, schema upgrade, droplet, ssh, staging, main
related: [context:all-container, context:all-database]
date: 17-08-26
---

# CI/CD Context

This file is the canonical CI/CD context entrypoint for Veent HRIS.

Use it after `process/context/all-context.md` when the task needs pipeline changes, gate debugging, or deployment reasoning.

---

## Scope

This group covers:

- The three CI jobs and exactly what each gate runs
- The deploy pipeline and its trigger condition
- Branch flow (`staging` vs `main`) and what it means for issue closing

It does not cover:

- Compose services and images — that is `process/context/container/all-container.md`
- Schema conventions — that is `process/context/database/all-database.md`

## Read When

Read this entrypoint when:

- a CI job fails and you need to know what it actually ran
- adding a gate, or changing what blocks a merge
- reasoning about why a merged PR did not deploy
- adding a migration or index that a `db push` must survive

## CI — `.github/workflows/ci.yml`

Three jobs, concurrency-grouped per ref with `cancel-in-progress`.

**1. `quality` — Format, lint, typecheck, unit**

```sh
pnpm install --frozen-lockfile
# note: prisma generate runs BEFORE the checks
pnpm exec prisma generate
pnpm format:check
pnpm lint
pnpm check
pnpm test
```

**2. `e2e` — API / E2E (Playwright)**

```sh
pnpm exec prisma generate
pnpm exec prisma db push --skip-generate
pnpm exec tsx prisma/seed-e2e.ts
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
```

**3. `schema-upgrade` — db push against a populated database**

Added by #236. This is the job that catches a schema change which is fine on an empty database and
destructive on a real one. Any new non-null column, unique constraint, or index on a populated
table must survive this. Create indexes in a pre-push step, not during the push (#200).

## Local Equivalents

Run these before pushing — they are the same gates:

| Gate | Command |
|---|---|
| Format | `pnpm format:check` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm check` |
| Unit | `pnpm test` |
| E2E | `pnpm test:e2e` |

`pnpm check` does **not** cover `prisma/**` or `scripts/**`.

## Deploy — `.github/workflows/deploy.yml`

- Trigger: `workflow_run` on CI completion, **branch `main` only**
- Builds and pushes `linux/amd64` to **GHCR**
- Then pulls and restarts on the droplet over SSH (`DROPLET_USER` and related secrets)

## Branch Flow — Consequences

**Merges go to `staging`, not `main`.** Two things follow, and both have caught this repo out:

1. **`Closes #N` never fires.** Every issue closed after a merge here was closed **by hand**.
   Do not rely on the trailer.
2. **Merging to `staging` does not deploy.** Only `main` triggers the deploy workflow.

## Known Flakiness

The local e2e suite is unreliable — random specs time out on `page.goto('/login')`. Tracked as
**#287**, still open. Do not treat a single red e2e run as proof of a regression; re-run and read
the actual error before concluding. "Flaky" has hidden at least three distinct real causes here.

## Source Paths

- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `playwright.config.ts`
- `prisma/seed-e2e.ts`

## Update Triggers

Update this group when:

- a CI job is added, removed, or its steps change
- the deploy trigger or registry changes
- the branch flow changes (e.g. `staging` starts deploying)
- #287 is fixed and the e2e suite becomes trustworthy

## Canonical Notes

- `prisma generate` runs before the checks in CI. Locally it does not — a stale client is the
  most common cause of a red `pnpm check` that does not match the code. Regenerate before
  believing it.
