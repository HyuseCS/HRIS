---
name: report:performance-eval-bimonthly-178-phase5-a
description: "Phase 5 section A EXECUTE report — items 90 and 91 only (addUTCMonths + regularizationDate refactor + the new date test); items 92+ belong to other agents"
date: 27-08-26
phase: phase-5-section-a
status: COMPLETE
feature: performance-eval-bimonthly-178
plan: process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_PLAN_25-08-26.md
metadata:
  node_type: memory
  type: report
  feature: performance-eval-bimonthly-178
  phase: phase-5-section-a
---

# Phase 5 section A — dates first (items 90, 91)

**TL;DR** — `addUTCMonths` added, `regularizationDate` now one line calling it, new test file
pins the Jan-31 overflow. All four gates green. Two files changed, nothing else touched.

## What Was Done

- **Item 90** — `src/lib/utils/dates.ts`: new `addUTCMonths(date: Date, months: number): Date`
  in a new `// ─── Month stepping ───` block placed directly above the Regularization block.
  Doc comment names the UTC basis, gives the PHT-drift reason, cross-references
  `regularizationDate`, and states explicitly that `monthsOfService` is Manila-based by design
  and must not be harmonised.
- **Item 90 (refactor)** — `regularizationDate` body reduced to
  `return addUTCMonths(startDate, REGULARIZATION_MONTHS)`. Doc comment updated to point at the
  helper. Behaviour-preserving; proven by the existing `tests/unit/regularization.test.ts`,
  which was NOT modified (`git diff --name-only` on it is empty) and passes 8/8.
- **Item 91** — new `tests/unit/dates-add-utc-months.test.ts`, 5 tests: Jan 31 + 1 month
  (both a common and a leap year), Dec + 2 months across the year boundary, UTC-midnight
  in/UTC-midnight out plus a no-input-mutation assert, a negative step, and one test tying
  `regularizationDate` to `addUTCMonths(start, 6)`.

## Jan 31 + 1 month — the decision

`addUTCMonths(2026-01-31Z, 1)` returns **2026-03-03**, and `2028-01-31Z` returns **2028-03-02**.
`setUTCMonth` constructs Feb 31 and the Date rolls it forward; it does not clamp to Feb 28.

**This is correct for this codebase.** It is the behaviour `regularizationDate` has always had —
`regularization.test.ts` already pins Mar 31 + 6 months = Oct 1 with the comment
"deterministic, not a day off". Clamping would have been a silent behaviour change to a shipped
6-month regularization gate. The test comment marks the overflow INTENDED so a later reader
cannot flip it quietly.

## What Was Skipped or Deferred

Nothing in scope. Items 92+ (cycle-plan, service, routes) belong to other agents.

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `pnpm check` | 1030 files, **0 errors**, 1 warning (pre-existing `CalculatorWindow.svelte` a11y, untouched) |
| `pnpm test` | **163 files / 1887 tests passed** |
| `pnpm lint` | **0 errors**, 1 warning (same pre-existing one) |
| `pnpm format:check` | **All matched files use Prettier code style** |

Targeted run: `dates-add-utc-months` 5/5, `regularization` 8/8, `tenure` 8/8.

## Plan Deviations

None. Two files, exactly as item 90/91 specify.

Two additions inside the item-91 test file, both within its stated "at minimum" scope:
a leap-year variant of the Jan-31 case, and a `regularizationDate === addUTCMonths(.., 6)`
equivalence test that pins the refactor's contract.

## Out-of-scope confirmations

- `monthsOfService` — untouched, still Manila-based.
- `manilaDayKey` and every other `dates.ts` export — untouched.
- `src/lib/server/services/reports.ts` — **not opened, not edited.** Its month math near
  lines 122 and 149 remains as-is, report-only per the plan.

## Test Infra Gaps Found

None.

## Closeout Packet

- **Plan:** `process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_PLAN_25-08-26.md`
- **Finished:** items 90, 91.
- **Verified:** all four gates green; the untouched regularization suite is the refactor proof.
- **Unverified:** nothing — this section is pure and needs no DB or browser.
- **Not committed** (per instruction).
- **Next:** item 92, `src/lib/server/performance/cycle-plan.ts`, which consumes `addUTCMonths`.

## Forward Preview

- **Test Infra Found:** vitest unit tests live in `tests/unit/`, plain
  `describe`/`it`/`expect`, imports via relative `../../src/lib/...`. Date tests assert on
  `.toISOString()` strings, not Date objects.
- **Blast Radius Changes:** `src/lib/utils/dates.ts` gains one export, `addUTCMonths`.
  Item 92 should import it rather than repeating month math.
- **Commands to Stay Green:** `pnpm check`, `pnpm test`, `pnpm lint`, `pnpm format:check`.
- **Dependency Changes:** none.

## Plan accuracy note

Every line reference in the Phase 5 preamble is still exact after four phases:
`monthsOfService:113`, `regularizationDate:166`, `manilaDayKey` at `dates.ts:62`. No drift.

**New drift introduced by this section:** the 25-line `addUTCMonths` block sits above the
Regularization section, so from now on `regularizationDate` is at `dates.ts:191` (was 166) and
`REGULARIZATION_MONTHS` at `:184`. `monthsOfService:113` and `manilaDayKey:62` are unmoved.
Later Phase 5+ items citing `regularizationDate:166` should locate by content.
