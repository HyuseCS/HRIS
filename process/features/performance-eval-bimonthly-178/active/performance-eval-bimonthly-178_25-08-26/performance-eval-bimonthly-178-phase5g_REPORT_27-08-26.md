---
name: report:performance-eval-bimonthly-178-phase5-g
description: "Phase 5 section G EXECUTE report — items 117, 119, 120: the #106 banner guard moved from the deleted /performance cycle form to the /settings/performance cadence form"
date: 27-08-26
phase: phase-5-section-g
status: COMPLETE
feature: performance-eval-bimonthly-178
plan: process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_PLAN_25-08-26.md
metadata:
  node_type: memory
  type: report
  feature: performance-eval-bimonthly-178
  phase: phase-5-section-g
---

# Phase 5 §G EXECUTE report — items 117, 119, 120

**TL;DR** — item 117 done: the dead `/performance` cycle-banner test is replaced, not deleted,
by a `/settings/performance` equivalent that asserts both halves (#106 guard survives). Gates
119 and 120 green. e2e is 8 failed — the two known local-data ones plus six #287
parallel-run login flakes that pass at `--workers=1`; none is mine.

## What Was Done

- **117** — `tests/e2e/form-errors.spec.ts`. Replaced the test
  `performance surfaces cycle errors in the page-level banner` (premise destroyed by
  `82eb7fc`, which deleted every action on `/performance`) with
  `the review schedule surfaces a rejected cadence in the page-level banner`.
  It posts `intervalMonths=99` to `?/saveConfig` and asserts, verbatim:
  - `await expect(page.getByRole('alert')).toBeVisible()`
  - `await expect(page.getByRole('alert')).not.toContainText('[object Object]')`
- The `max="24"` attribute is stripped in an `evaluate()` on the input before the value is
  set — the same move the benefits case above it uses for `required`. Without it the browser
  refuses the submit and the server is never reached.
- Also updated the stale file-header sentence ("Each test clears a required field") — the new
  test strips `max`, not `required`. Comment-only; my change made it stale.

## What Was Skipped or Deferred

Nothing in scope. Item 118 (`tests/unit/performance-config.test.ts`) and item 121 (live DB run)
belong to other agents/sessions.

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `pnpm test` | 165 files, **1937 passed**, 0 failed |
| `pnpm check` | 1037 files, **0 errors**, 1 warning (pre-existing `CalculatorWindow.svelte` a11y) |
| `pnpm lint` | **0 errors**, 1 warning (same pre-existing one) |
| `pnpm test:e2e` | 123 passed / 8 failed / 7 did not run — **0 failures are mine** (see below) |
| `form-errors.spec.ts` in isolation | **3/3 passed** |

### e2e failure verdicts

| Spec | Verdict |
|---|---|
| `inventory.spec.ts:32` | **pre-existing** — 13 leftover "E2E Monitor" rows in this dev DB; reproduces at `--workers=1` |
| `payroll-custom-range-overlap.spec.ts:36` | **pre-existing** — hand-made Jul 16–31 2026 run collides with the spec's assumed-free dates; reproduces at `--workers=1` |
| `posting-approver-sod.spec.ts` | **parallel-run flake** — `selectTenant` login timeout; passes at `--workers=1` |
| `request-documents.spec.ts:44` | **parallel-run flake** — same; passes at `--workers=1` |
| `separations.spec.ts:26` | **parallel-run flake** — same; passed on re-run |
| `settings-roles.spec.ts:18` | **parallel-run flake** — same; passes at `--workers=1` |
| `timesheet-approval.spec.ts:99` | **parallel-run flake** — same; passed on re-run |
| `timesheet-create-for-employee.spec.ts:82` | **parallel-run flake** — same; passed on re-run |

Every flake fails at `helpers.ts:40` waiting for `getByLabel('Email')` after the tenant click —
the known #287 login-contention flake, not a product defect. A single-file spec edit cannot
reach the login page.

## Plan Deviations

None. Item 117 was executed as written.

## Test Infra Gaps Found

- The six login flakes above are worth a fix (a shared storage-state login would remove the
  per-test tenant click entirely), but that is out of this phase's scope.

## Closeout Packet

- Selected plan: `…/performance-eval-bimonthly-178_PLAN_25-08-26.md`
- Finished: items 117, 119, 120 — Phase 5 section G, the last section of Phase 5
- Verified: all four gates run and read; the replacement test proven green in isolation and
  in the full parallel run
- Not verified: item 121 (live cycle generation) — needs the user's DB and is another session
- Not committed, per instruction
- Next valid state: `Keep in active/testing` — Phase 5 items 118 and 121 are still open

## Forward Preview

- **Test infra found:** `tests/e2e/form-errors.spec.ts` now guards `/settings/performance`;
  any future change to that banner or to the `saveConfig` error shape must keep the alert a
  string.
- **Blast radius changes:** none — one spec file touched.
- **Commands to stay green:** `pnpm test`, `pnpm check`, `pnpm lint`,
  `pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/form-errors.spec.ts`
- **Dependency changes:** none.
