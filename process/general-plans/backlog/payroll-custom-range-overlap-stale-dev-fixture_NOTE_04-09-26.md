---
name: note:payroll-custom-range-overlap-stale-dev-fixture
description: "tests/e2e/payroll-custom-range-overlap.spec.ts fails on this dev DB because a stale APPROVED July 2026 payroll run overlaps its range; the spec's own header comment claiming July cannot collide with the seed is stale"
date: 04-09-26
feature: ui-ux-overhaul
---

# `payroll-custom-range-overlap.spec.ts` fails against a stale dev DB, not against the code

**Status**: BACKLOG — environmental, not a code defect.
**Raised by**: the full gate run on `feat/uiux-phase-1-2`, 04-09-26.

## What happened

`pnpm test:e2e` — 140 passed, 1 failed: `payroll-custom-range-overlap.spec.ts:36`.

**Resolved on the dev machine 04-09-26**: the stale run was deleted and the full suite then passed
141/141 in a single pass. The note stays open because the *spec* is still fragile — see
"What a fix has to include" below. Any other developer's database can still carry a colliding run.

## Root cause

An **APPROVED** payroll run for `2026-07-16` to `2026-07-31`, created on `2026-07-30`, already
sits in the dev database. The spec's own range (`2026-07-02` to `2026-07-20`) overlaps it, so the
spec's first "create" call is refused by the real overlap guard and the row the test expects never
appears.

The spec's header comment (lines 8-10) says:

> Dates live in July 2026 so this spec cannot collide with the seed or with the other new specs
> (there is no shared payroll-run fixture; every spec picks its own month).

That premise is **stale for this database** — a leftover run from an earlier manual/E2E session
now occupies part of July 2026.

## Fix options

1. Clear the stale run from the dev DB (same `clean-e2e-employees.ts`-style sweep already used for
   stale employees) and re-run.
2. Correct the spec's header comment — "cannot collide" is not true in general, only true against
   a clean seed; move the spec's range to a month with no plausible manual-test residue, or make
   the spec clean up any pre-existing run in its own range before asserting.
3. Longer term: the `afterAll` in this spec already deletes rows it created — add a `beforeAll`
   sweep for anything already occupying its target range, same pattern.

## E2E run hygiene learned in the same session (not specific to this spec)

- The suite runs parallel workers against **one shared dev database**.
  `scripts/clean-e2e-employees.ts`'s own header documents the resulting race: a concurrent spec's
  payroll compute can attach an entry to whatever employee is currently ACTIVE, and the FK is
  `RESTRICT`, so a teardown delete can legitimately lose that race. A first run today failed 5
  tests; sweeping 16 stale test employees (`--apply`) plus 17 leftover `E2E %` inventory rows
  cleared 3 of the 5.
- Chromium was missing from the Playwright browser cache (only Firefox was present at revision
  1228), so an entire run failed with `browserType.launch: Executable doesn't exist`.
  `pnpm exec playwright install chromium` fixed it. Purely environmental — do not misread a missing
  browser binary as a code failure.
- Commit `5a1d3b0` fixed three call sites (`timesheet-create-for-employee.spec.ts` ×2,
  `manager-org-wide-timesheets.spec.ts`) that clicked a dialog's now-removed "Whole month" button.
  Lesson: when a shared component's markup changes, grep the WHOLE `tests/e2e/` suite for every
  call site, not just the spec you happened to open.
