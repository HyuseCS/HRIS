---
phase: ci-schema-upgrade-prestart
date: 2026-09-01
status: COMPLETE_WITH_GAPS
feature: performance-eval-bimonthly-178
plan: process/features/performance-eval-bimonthly-178/active/ci-schema-upgrade-prestart_01-09-26/ci-schema-upgrade-prestart_PLAN_01-09-26.md
---

# EXECUTE exit summary — prestart.sh pre-push migrations (#178 / PR #325)

## What Was Done
Checklist items 1–8 implemented in full.

- NEW `scripts/migrate-review-cycle-period-key.ts` — modelled on `migrate-timelog-dedup-key.ts`.
  Step 1 `to_regclass('public.review_cycles')` guard returns 0 on a fresh DB; step 2 groups by
  `(organizationId, startDate, endDate)` having `count(*) > 1`, `limit 20`, `array_agg(id)`, prints
  org/dates/count/ids plus a remedy and `process.exit(1)` BEFORE any index write; step 3
  `create unique index if not exists "review_cycles_organizationId_startDate_endDate_key"`.
  No DELETE, no UPDATE anywhere in the file.
- EDIT `scripts/prestart.sh` — two `pnpm exec tsx` lines added after the `migrate-timelog-dedup-key.ts`
  line and before `prisma db push --skip-generate`, each with a WHY comment (#178 reference, why
  push cannot express the change, idempotency note). No flags added; no `--accept-data-loss`.

## What Was Skipped or Deferred
Checklist item 9 (local verification against a running database, and the CI re-run on PR #325).
Every gate in Verification Evidence except `pnpm check` is Hybrid and needs `veent-db-5434` up.
Per validate-contract E3 the agent must not start the DB — handed back to the user.

## Test Gate Outcomes
| Gate | Tier | Result |
|---|---|---|
| `pnpm exec tsc --noEmit --strict scripts/migrate-review-cycle-period-key.ts` | Fully-automated | PASS (exit 0) |
| `sh -n scripts/prestart.sh` | Fully-automated | PASS |
| `grep 'accept-data-loss' scripts/prestart.sh` | Fully-automated | PASS — only in prose comments, never as a flag |
| `pnpm lint` | Fully-automated | PASS — 0 errors, 1 pre-existing a11y warning in `CalculatorWindow.svelte` (out of scope) |
| `pnpm format:check` | Fully-automated | FAIL on the pre-existing untracked `CODERABBIT_REVIEW_PR325.md` only; both changed files pass Prettier |
| Idempotency / index name / duplicate refusal / fresh-DB | Hybrid | NOT RUN — needs the DB, user must start it |
| CI `schema-upgrade` on PR #325 | Fully-automated | NOT RUN — needs a push |

## Plan Deviations
1. `scripts/migrate-review-cycle-period-key.ts:39-42` — the existence-guard column alias is
   `present`, not `exists`. `EXISTS` is a SQL reserved word; a non-reserved alias removes any parse
   risk on a guard that cannot be tested here without a database. Within blast radius, naming only.

## Test Infra Gaps Found
Nothing in the repo can exercise `scripts/**` without a live Postgres. `pnpm check` does not cover
`scripts/**` — type safety here came from a direct `tsc --noEmit` invocation.

## Closeout Packet
- Selected plan: the file above.
- Finished: code for items 1–8.
- Verified: type/syntax/lint/format/no-flag checks only.
- Unverified: every hybrid DB gate and CI.
- State: **Keep in active/testing** — CODE DONE, not VERIFIED.

## Forward Preview
- **Test Infra Found:** none new.
- **Blast Radius Changes:** 2 files (`scripts/prestart.sh`, `scripts/migrate-review-cycle-period-key.ts`). 0 src, 0 schema.
- **Commands to Stay Green:** `pnpm lint`, `pnpm exec prettier --check scripts/migrate-review-cycle-period-key.ts`, `sh -n scripts/prestart.sh`.
- **Dependency Changes:** none.
