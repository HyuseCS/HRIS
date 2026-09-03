---
name: plan:ci-schema-upgrade-prestart
description: "Turn the RED schema-upgrade CI job green on PR #325 by wiring the existing ReviewStatus rename into prestart.sh and hand-creating the new review_cycles unique index before db push"
date: 01-09-26
feature: performance-eval-bimonthly-178
---

# CI `schema-upgrade` green — prestart.sh pre-push migrations (#178 / PR #325)

**TL;DR** — Two lines in `scripts/prestart.sh` and one new script. The existing
`scripts/migrate-review-status-scored.ts` is never called, and nothing creates the new
`review_cycles` unique index by hand, so `prisma db push` (correctly, no `--accept-data-loss`)
refuses. Fix = call the enum script + add `scripts/migrate-review-cycle-period-key.ts` that
REFUSES loudly on duplicate periods. Nothing else is needed.

**Date**: 01-09-26
**Status**: PLANNED (not started)
**Complexity**: SIMPLE

## Overview / Context

PR #325 (issue #178) is blocked by the CI job `schema-upgrade` (`.github/workflows/ci.yml:117`),
which provisions `origin/main`'s schema, seeds it, then runs `sh scripts/prestart.sh` — the same
file compose runs on deploy. `prisma db push` refuses because of two changes on this branch: the
`ReviewStatus` value `MANAGER_REVIEW` was renamed to `SCORED`, and `ReviewCycle` gained
`@@unique([organizationId, startDate, endDate])`. `prestart.sh` passes no `--accept-data-loss` by
design (#236), so this is a real production-deploy blocker. Context routing was taken from
`process/context/all-context.md` and the deeper test chain (`process/context/tests/all-tests.md`).

## Acceptance Criteria

1. CI job `schema-upgrade` is green on PR #325, with its self-test step still failing-as-designed.
2. `scripts/prestart.sh` still contains no `--accept-data-loss` flag.
3. Running `prestart.sh` twice in a row on the same database is a no-op the second time.
4. Running the new script against an empty database exits 0 (no `set -e` abort on a fresh droplet).
5. Duplicate `(organizationId, startDate, endDate)` rows cause a loud non-zero exit naming the rows,
   and leave every row untouched.
6. No file outside `scripts/prestart.sh` and `scripts/migrate-review-cycle-period-key.ts` changes.

## Phase Completion Rules

Single-phase plan. It is `CODE DONE` when checklist items 1–8 are implemented and `pnpm exec tsx`
runs the new script cleanly locally. It is `VERIFIED` only when every hybrid gate in Verification
Evidence has been run against a real database AND the `schema-upgrade` job is green on PR #325.
Post-phase testing per `process/context/tests/all-tests.md` applies; a green `pnpm check` is not
sufficient evidence because it does not cover `scripts/**`.

## SPEC (requirements locked)

**Goal:** `.github/workflows/ci.yml` job `schema-upgrade` passes on PR #325, and a real deploy
(`prestart.sh && node build`) applies this branch's schema to a populated production database
without data loss and without crash-looping.

**Use cases**
1. CI: main's schema + main's seed, then `sh scripts/prestart.sh` → exit 0, self-test still fails-as-designed.
2. Deploy to the live droplet (populated DB, one `review_cycles` row per org, no `MANAGER_REVIEW` rows expected but not proven).
3. Fresh droplet / recreated volume (empty DB, no tables) → every pre-push script is a no-op, the `set -e` chain survives.
4. Re-run of prestart on an already-migrated DB → no-op.

**Out of scope:** refactoring the three existing migrate scripts, other CI jobs, the pre-existing
a11y warning, #323/#324, adopting real Prisma migrations, any `--accept-data-loss` flag.

**Constraints:** pnpm; Prisma 5; Postgres 18 local / 16 CI; idempotent; never silently delete rows;
no `Co-Authored-By` trailer.

## Premise verification (all four premises HELD)

| Premise | Verdict | Evidence |
|---|---|---|
| `scripts/migrate-review-status-scored.ts` exists, idempotent, unreferenced by prestart | TRUE | File read; handles type-absent / already-renamed / both-present / rename paths; `grep` shows prestart.sh calls only the other three |
| `@@unique([organizationId, startDate, endDate])` on `ReviewCycle` is new on this branch, no script | TRUE | `prisma/schema.prisma` ~L1669; `git show origin/main:prisma/schema.prisma` has no `@@unique` on that model |
| `migrate-timelog-dedup-key.ts` is the create-index-first pattern | TRUE | File read; names the index exactly as Prisma would, refuses on duplicates with row detail |
| prestart runs 3 scripts then `db push --skip-generate`, each with a WHY comment | TRUE | File read |
| Enum rename cannot be done by `db push` | TRUE | `origin/main` enum has `MANAGER_REVIEW`; branch has `SCORED` + `SIGNING` |

## Decision Summary

### Chosen approach
**Minimal wiring + one new guard script.** Add two `pnpm exec tsx` lines to `scripts/prestart.sh`
before the push: the already-committed `migrate-review-status-scored.ts`, and a new
`scripts/migrate-review-cycle-period-key.ts` modelled line-for-line on
`migrate-timelog-dedup-key.ts`. No other change turns the job green, and no other change is in scope.

### Why this over alternatives
| Alternative | Why rejected |
|---|---|
| Add `--accept-data-loss` to prestart | Destroys the #236 guard permanently; every future destructive change ships silently. Explicitly forbidden. |
| Drop the `@@unique` from the schema and rely on the script's `--force`/P2002 logic | The constraint IS the idempotency guarantee for `generate-review-cycles.ts` (documented in both the schema comment and `createCycleAndOpenReviews`). Removing it re-opens the double-create it was added to close. |
| Auto-de-duplicate `review_cycles` rows in the new script | Duplicate cycles own `PerformanceReview` children with employee-authored text (`answers`, employee comments). Merging or deleting them is unrecoverable and needs a human decision. |
| Adopt `prisma migrate deploy` now | Correct long-term, far outside this PR's scope, and would have to be sequenced against a live droplet. |

### Risk predictions
- **Deploy crash-loop (highest):** if production holds duplicate `(organizationId, startDate, endDate)` rows, `CREATE UNIQUE INDEX` fails, `set -e` aborts prestart, the container never starts. Mitigated by failing FIRST with the offending rows printed — a named, five-minute human fix instead of a bare Postgres error.
- **Wrong index name:** push would then try to add its own and CI stays red. Mitigated by taking the name from Prisma itself (below), not from memory.
- **Fresh-DB abort:** the new script must not throw when `review_cycles` does not exist yet. Mitigated by a `to_regclass` existence check that returns early.
- **Enum script on a populated CI DB:** the CI DB is seeded from main's seed, which writes one `ACTIVE` cycle per org and no `MANAGER_REVIEW` reviews — the rename path runs and prints `0`.
- **Ordering:** neither new script depends on the other; both must simply precede the push.

### Duplicate-row decision (asked for explicitly)
**REFUSE LOUDLY. Do not de-duplicate.**

Duplicates are *possible* in shipped data. On `origin/main`, `createReviewCycle`
(`src/lib/server/services/performance.ts:16`) is reached from the HR form at
`src/routes/(app)/performance/+page.server.ts` and takes free-form `name/startDate/endDate` with
**no uniqueness check of any kind**. Two HR submissions with the same dates produce two rows today.
The seed writes one fixed row per org (`prisma/seed-core.ts:630`, upsert by id), and this branch's
`createCycleAndOpenReviews` relies on the new constraint — so duplicates can only come from the
shipped manual form, and cannot be ruled out for the live database.

The script therefore: SELECTs duplicate groups first, prints org id + dates + count + the row ids,
prints the remedy, and `process.exit(1)` — before touching the index. Justification: a duplicate
cycle carries `PerformanceReview` children holding employee-authored evaluation content; picking a
survivor and re-parenting or deleting the rest is a business decision with no safe default, and the
project rule is never to silently delete rows. Loud refusal converts an opaque outage into a named
one-command fix.

### Exact index name (asked for explicitly)
`review_cycles_organizationId_startDate_endDate_key`

Verified two ways:
1. **Empirically, from Prisma itself** — `pnpm exec prisma migrate diff --from-empty
   --to-schema-datamodel prisma/schema.prisma --script` emits verbatim:
   `CREATE UNIQUE INDEX "review_cycles_organizationId_startDate_endDate_key" ON "review_cycles"("organizationId", "startDate", "endDate");`
2. **Against the in-repo precedent** — `time_logs` + `@@unique([dedupKey, employeeId])` →
   `time_logs_dedupKey_employeeId_key`: `{mapped table}_{col}_{col}…_key`, columns in declaration
   order, Prisma field names (camelCase) not snake_case.

### Key constraints accepted
- prestart stays flag-free; the guard keeps biting.
- A production DB with duplicate cycles will FAIL the deploy on purpose. That is the intended behaviour, and it is the reason the check runs before the index.
- `MANAGER_REVIEW` may survive as an orphaned, unused enum label in the both-present branch of the existing script; removing it needs a type rebuild and is out of scope.

## Touchpoints

| File | Change |
|---|---|
| `scripts/prestart.sh` | ADD two `pnpm exec tsx` lines before the `db push`, each with a WHY comment matching the file's existing standard |
| `scripts/migrate-review-cycle-period-key.ts` | NEW — duplicate check + `create unique index if not exists` |
| `scripts/migrate-review-status-scored.ts` | UNCHANGED — only newly referenced |

## Public Contracts
No application API, route, schema or type changes. The only contract touched is the deploy/CI
contract: `prestart.sh` gains two steps and two new failure exits (duplicate cycles; enum in an
impossible state). `prisma/schema.prisma` is not edited.

## Blast Radius
2 files (1 new, 1 edited), 0 packages, 0 src changes. Risk class: **schema/data migration + deploy
runtime** (high-risk class — hybrid gate mandatory). No writes to any table; the new script only
`CREATE UNIQUE INDEX`es and reads.

## Implementation checklist

1. Create `scripts/migrate-review-cycle-period-key.ts`, header comment in the house style of
   `migrate-timelog-dedup-key.ts` — state that push refuses a unique constraint on a populated
   table, that prestart passes no `--accept-data-loss` by design (#236), that the index is created
   here so push finds it present, and that idempotency keeps a fresh droplet alive.
2. In that script: `const INDEX = 'review_cycles_organizationId_startDate_endDate_key'`.
3. Step 1 of `main()` — existence guard: `select to_regclass('public.review_cycles') is not null`.
   If the table does not exist, log "table not created yet — db push will create it with the index"
   and return 0. (Fresh-droplet path; must not throw.)
4. Step 2 — duplicate check: group `review_cycles` by `("organizationId","startDate","endDate")`
   having `count(*) > 1`, `limit 20`, also selecting `array_agg(id)`. On any hit: `console.error`
   each group (org, dates, count, ids) plus a one-line remedy, then `process.exit(1)`.
   **Do not delete or modify any row.**
5. Step 3 — `create unique index if not exists "<INDEX>" on "review_cycles"
   ("organizationId", "startDate", "endDate")`.
6. Success log naming the index; `.finally(() => db.$disconnect())`, `catch → exit 1` — same shape
   as the timelog script.
7. Edit `scripts/prestart.sh`: after the existing `migrate-timelog-dedup-key.ts` line and before
   `prisma db push`, add — in this order, each preceded by a WHY comment:
   a. `pnpm exec tsx scripts/migrate-review-status-scored.ts` — comment: rename
      `MANAGER_REVIEW → SCORED` must lead the push (#178); push cannot express a rename, so it sees
      one value dropped and another added and refuses / recreates the type; idempotent, no-op on a
      fresh DB.
   b. `pnpm exec tsx scripts/migrate-review-cycle-period-key.ts` — comment: creates the
      `review_cycles` composite unique index before the push (#178), same reason as the `time_logs`
      line above; refuses loudly if duplicate periods exist rather than deleting rows.
8. Leave the `db push --skip-generate` line and the "swap for `prisma migrate deploy`" comment
   untouched. Add no flags.
9. Verify locally (see Verification Evidence) then re-run CI on PR #325.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm exec dotenv -e .env.dev -- tsx scripts/migrate-review-cycle-period-key.ts` twice against the running local DB (`veent-db-5434`) — second run identical, exit 0 | Hybrid (precondition: `./start.sh` DB running; **ask the user to start it**) | Idempotency (use case 4) |
| `psql -p 5434 -c "\d review_cycles"` shows `review_cycles_organizationId_startDate_endDate_key` | Hybrid | Index name is the one Prisma expects |
| `pnpm db:push` after the script: output contains no unique-constraint warning and no enum warning | Hybrid | The two CI warnings are gone at their source |
| Duplicate refusal: in a scratch DB insert two `review_cycles` rows with identical org+dates, run the script → exit 1, both ids printed, both rows still present afterwards | Hybrid | Loud refusal, no silent deletion |
| Fresh/empty DB: `createdb` a scratch DB with no tables, run the script → exit 0 with the "not created yet" message | Hybrid | Fresh-droplet `set -e` survival (use case 3) |
| CI job `schema-upgrade` on PR #325 goes green, and its "Self-test — prove this job can still fail" step still fails-as-designed | Fully-automated (`gh pr checks` / GitHub Actions) | The actual acceptance criterion (use case 1 + 2) |
| `pnpm check` | Fully-automated | New script type-checks — **note: `pnpm check` does NOT cover `scripts/**`; run `pnpm exec tsc --noEmit` on the file or execute it, do not assume** |

Known gap: nothing here exercises the *live production* dataset. Whether the droplet holds
duplicate cycles is unknown and unknowable from CI — which is precisely why step 4 refuses instead
of guessing.

## Test Infra Improvement Notes
(none identified yet)

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/performance-eval-bimonthly-178/active/ci-schema-upgrade-prestart_01-09-26/ci-schema-upgrade-prestart_PLAN_01-09-26.md`
2. **Last completed phase:** VALIDATE (contract written). Nothing implemented.
3. **Validate-contract status:** written (below).
4. **Context loaded:** `scripts/prestart.sh`, `scripts/migrate-review-status-scored.ts`,
   `scripts/migrate-timelog-dedup-key.ts`, `prisma/schema.prisma` (ReviewCycle, ReviewStatus),
   `prisma/seed-core.ts`, `src/lib/server/services/performance.ts`,
   `scripts/generate-review-cycles.ts`, `.github/workflows/ci.yml` (schema-upgrade job),
   `origin/main` versions of the schema, seed and performance service.
5. **Next step for a fresh agent:** implement checklist items 1–8 in order; do not start the DB
   yourself — ask the user; do not commit unless asked.

## Validate Contract

- `generated-by: outer-pvl`
- `date: 01-09-26`
- `plan: process/features/performance-eval-bimonthly-178/active/ci-schema-upgrade-prestart_01-09-26/ci-schema-upgrade-prestart_PLAN_01-09-26.md`
- `gate: CONDITIONAL`

**Layer 1**

| Dimension | Status | Finding |
|---|---|---|
| Infra fit | PASS | `prestart.sh` is the single file compose and CI both run; the two added lines sit before the push exactly like the three existing ones. Index name confirmed against Prisma's own `migrate diff` output. |
| Test coverage | CONCERN | Every meaningful gate is hybrid (needs a running Postgres). CI itself is the only fully-automated proof and it only covers the CI dataset, never production's. |
| Breaking changes | PASS | No app contract changes. Deploy contract gains two intentional fail-fast exits. |
| Security surface | PASS | No auth, secrets or trust boundary touched. Raw SQL uses no interpolated user input; the index name is a module constant. |

**Layer 2**

| Section | Status | Note |
|---|---|---|
| New script | CONCERN | Must include the `to_regclass` existence guard, or a fresh droplet aborts on `set -e` before the schema is ever created. Captured as checklist item 3. |
| prestart.sh edit | PASS | Edit targets unique and matchable; both new lines are additive. |
| Duplicate policy | CONCERN | Accepted by design: a production DB with duplicate cycles WILL block the deploy until a human resolves it. This is the chosen behaviour, not a defect. |

**Totals: 0 FAILs / 3 CONCERNs → Net gate: CONDITIONAL.**

**Execute-agent instructions**
- E1: Never add `--accept-data-loss` to `prestart.sh`, in any form.
- E2: The duplicate branch must `process.exit(1)` BEFORE any `CREATE INDEX` and must not issue a
  single `DELETE` or `UPDATE`.
- E3: Do not start `./start.sh`, vite, or `veent-db-5434` yourself — ask the user.
- E4: `pnpm check` does not cover `scripts/**`; verify the new script by executing it, not by a
  green `pnpm check`.
- E5: Do not edit `prisma/schema.prisma`, other migrate scripts, or `ci.yml`.

**Known gaps carried:** production dataset duplicate status unknown (mitigated by loud refusal);
`MANAGER_REVIEW` may persist as an orphaned enum label in the both-present path (out of scope).
