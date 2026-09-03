---
name: report:performance-eval-bimonthly-178-phase-1
description: "Phase 1 (Goals removal) EXECUTE report — items 1-42, 44, 44a done; 43 and 49 deferred (need the DB); item 48's grep gate is unsatisfiable as written"
phase: phase-1-goals-removal
date: 2026-08-27
status: COMPLETE_WITH_GAPS
feature: performance-eval-bimonthly-178
plan: process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_PLAN_25-08-26.md
metadata:
  node_type: memory
  type: report
  feature: performance-eval-bimonthly-178
  phase: phase-1-goals-removal
---

# Phase 1 — Goals removal — EXECUTE report

**TL;DR** — Items 1-42, 44 and 44a are done. `pnpm check`, `pnpm test` and `pnpm lint` are
green. `pnpm format:check` fails only on three files that were already failing before this
phase. Item 48's grep gate cannot pass as written: items 42 and 44a themselves create files
under `scripts/` and `tests/` that must contain the word "goals". Nothing is committed.

## What Was Done

| Items | Files | Note |
|---|---|---|
| 1-3 | `prisma/schema.prisma` | `enum GoalStatus`, `model Goal`, `Employee.goals` back-relation removed |
| 4-9 | `src/lib/server/services/performance.ts` | 4 goal functions + section header + orphaned `listReportIdsFor` import removed; `services/supervisors.ts` untouched |
| 10-24 | `src/routes/(app)/performance/+page.server.ts` | imports, `GOAL_STATUS`, both early-return keys, `Promise.all` 4→2, both return keys, both zod schemas, both actions |
| 17 | same | `isManager` DELETED — see decision below |
| 25-34 | `src/routes/(app)/performance/+page.svelte` | goal state/guard/class/button/form/2 sections removed; `role="alert"` banner, `rowGuards`/`rowGuard` and the `createSubmitGuard` import KEPT |
| 35-36 | `src/routes/api/v1/performance/goals/` | route + directory deleted; generated `.svelte-kit` dir removed |
| 37-41 | `scripts/prod-delete.ts`, `scripts/clean-e2e-employees.ts` | positional pair removed as one edit; arrays now 21 / 21 |
| 42 | `scripts/migrate-drop-goals.ts` | CREATED, NOT RUN |
| 44, 44a | `tests/e2e/form-errors.spec.ts` | stale goal-form premise removed; positive 404 assertion added via the `request` fixture |

## What Was Skipped or Deferred

- **Item 43** (run the migration + `pnpm db:push`) — the DB is not running and the user starts
  it. Script created only.
- **Item 49** (live `audit_logs` count before/after) — needs the running DB; blocked by 43.
- **`tests/e2e` execution** — `pnpm test:e2e` needs a DB + build. The new 404 assertion is
  written but UNRUN. Known gap, must be run once the DB is up.

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `pnpm prisma generate` | PASS — `Generated Prisma Client (v5.22.0)` |
| `pnpm check` | PASS — `997 FILES 0 ERRORS 1 WARNINGS`; the warning is pre-existing (`CalculatorWindow.svelte:82`) |
| `pnpm test` | PASS — `158 passed (158)` files, `1845 passed (1845)` tests |
| `pnpm lint` | PASS — `0 errors, 1 warning` (same pre-existing warning) |
| `pnpm format:check` | FAIL, pre-existing only — 3 files, all from commit `4fc11d0`, none touched here. Proved by stashing this phase's diff and re-running: same 3 files fail on a clean tree |
| Item 48 grep gate | Unsatisfiable as written — see Plan Deviations. `src/` and `prisma/` are ZERO. `scripts/` + `tests/` are zero excluding the two files items 42 and 44a mandate |
| `pnpm test:e2e` | NOT RUN — needs the DB |

## Plan Deviations

1. **Item 48 is self-contradictory (plan defect, not a code deviation).** It demands
   `rg -in "\bgoal" src/ prisma/ scripts/ tests/` return zero hits, but item 42 creates
   `scripts/migrate-drop-goals.ts` (whose whole job is `DROP TABLE goals`) and item 44a adds
   an assertion on the literal URL `/api/v1/performance/goals` in `tests/`. Both are under the
   grepped roots. The gate was run in its literal form and in a corrected form; all 20
   remaining hits are comments or SQL strings inside those two mandated files. Zero live Goal
   code remains anywhere.
2. **Item 17's cross-reference is off by one.** It says the `+page.svelte:398` reader of
   `isManager` is deleted by "item 27"; item 27 is `goalStatusClass` — the Team Goals section
   is item 32. Harmless mislabel; the intent was followed.
3. **Item 36 is not permanent.** `svelte-kit sync` (run by `pnpm check`) recreates the
   `.svelte-kit/types/.../goals/` directory as an EMPTY dir with no `$types.d.ts`. It was
   removed again. `.svelte-kit/` is gitignored, so this has no tracked effect.
4. **One extra whitespace fix inside the blast radius.** Removing `tx.goal.deleteMany` from
   `prod-delete.ts` left one stray tab on the following line; prettier caught it and it was
   corrected. Within-blast-radius, no behaviour change.

5. **Item 29 — comment replaced, not merely deleted.** The plan says delete the stale
   create-goal comment lines above the banner. They were deleted, and one short line was put in
   their place (`page-wide error banner for createCycle / setCycleStatus / openReviews`) so the
   banner keeps a stated purpose and the `#106` provenance is not lost. Comment-only, within
   blast radius. Revert if the plan wants a bare `{#if form?.error}`.

## Item 17 decision — DELETE

`isManager` was deleted from `+page.server.ts` (`:24`, `:36`, `:56`). After item 32 removed the
Team Goals section, `grep -n isManager src/routes/(app)/performance/+page.svelte` returns
nothing. The plan text was searched for any Phase 5 reuse of `isManager` — the only three hits
are inside item 17 and item 18 themselves. Other pages define their own local `isManager`; none
read this page's copy.

## prod-delete.ts array counts (§7.0 trap)

- names array (`:190`) — **21**
- queries array (`:213`) — **21**

Both were re-derived programmatically after the edit and each name was printed next to its
positional query to confirm the pairing did not shift: `reviewsGiven` still binds to
`performanceReview.count({ reviewerId })` and `cashAdvances` still binds to
`cashAdvance.count`, i.e. no off-by-one was introduced.

## Test Infra Gaps Found

- `pnpm check` does not cover `scripts/**`, so `scripts/migrate-drop-goals.ts` was typechecked
  separately with `tsc --noEmit --strict` (exit 0). This matches the `#282` warning in §3.6.
- `pnpm format:check` is red on `main`-inherited files. Any phase that treats it as a gate will
  report a false failure until `PRODUCT.md` and the two `docs/references/*.md` files are
  formatted. Not fixed here — out of Phase 1 scope.

## Closeout Packet

- **Selected plan:** `process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_PLAN_25-08-26.md`
- **Finished:** items 1-42, 44, 44a.
- **Verified:** typecheck, unit suite, lint — green. Structural removal — proven for `src/` and
  `prisma/` by a zero-hit grep.
- **Unverified:** the new e2e 404 assertion (unrun), the migration script (unrun), the
  `audit_logs` survival check (item 49).
- **Remaining:** items 43, 45 (e2e half) and 49 need the user's DB. Then commit.
- **Next valid state:** `Keep in active/testing` — Phase 1 is CODE DONE, not `VERIFIED`; the
  plan's own gate 8 requires user confirmation for an irreversible `DROP TABLE`.

## Forward Preview

- **Test Infra Found:** vitest is the only DB-free gate. E2E and both migration scripts need
  `veent-db-5434`, which the user starts. Phase 2 will hit the same wall at item 62.
- **Blast Radius Changes:** `src/routes/api/v1/performance/` now holds `cycles/` and `reviews/`
  only. `performance.ts` ends at `openReviewsForCycle` (236 lines). `prod-delete.ts` count
  arrays are 21 wide — Phase 2 adds models, so anything adding a count there must add to BOTH
  arrays at the same position.
- **Commands to Stay Green:** `pnpm prisma generate && pnpm check && pnpm test && pnpm lint`.
- **Dependency Changes:** none.
