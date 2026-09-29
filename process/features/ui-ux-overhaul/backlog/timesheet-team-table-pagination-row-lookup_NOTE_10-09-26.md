---
name: note:timesheet-team-table-pagination-row-lookup
description: "The /timesheets team table is sorted periodStart desc and paginated at 10 (paginate(url, teamTotal, { param: 'teamPage' })). Four e2e specs still find their row on page 1 by name/hours. With the owner's demo data seeded, timesheet-punch.spec.ts fails for exactly this reason. NEW PLAN REQUIRED — apply the same page-walk fix findTimesheetCard already applies to /requests/timesheets."
date: 10-09-26
feature: ui-ux-overhaul
---

# `/timesheets` team table needs the same page-walk treatment — NEW PLAN REQUIRED

Date: 2026-09-10
Source: `process/general-plans/completed/timesheet-queue-approvals-parity_10-09-26/timesheet-queue-approvals-parity_PLAN_10-09-26.md`
(S4 closeout) — surfaced during the S4 execute pass, verified against the live dev DB, not reasoned.

## What is broken

The `/timesheets` page renders a team table sorted `periodStart desc`, paginated at 10 via
`paginate(url, teamTotal, { param: 'teamPage' })`. Four e2e call sites locate a row in that table by
filtering `tr` elements on whatever the DOM currently holds — all four assume the target row is on
page 1:

- `tests/e2e/timesheet-punch.spec.ts:104`
- `tests/e2e/timesheet-punch.spec.ts:128`
- `tests/e2e/timesheet-create-for-employee.spec.ts:116`
- `tests/e2e/manager-org-wide-timesheets.spec.ts:100`

With the owner's demo data present (~16 owner demo rows in this table), `timesheet-punch.spec.ts`
**FAILS** on both line 104 and 128 — verified live against the dev DB on 2026-09-10, not reasoned
from the code. This is the same class of defect `findTimesheetCard` (added in the
`timesheet-queue-approvals-parity` plan, S4) already fixed for the `/requests/timesheets` review
queue — a locator that only reads page 1 finds its row by luck, and demo/seed data volume is what
exposes it.

## Why this is environmental, not a code regression

Nothing in the `timesheet-queue-approvals-parity` plan touched the `/timesheets` team table, its
sort order, or its pagination — that pagination already existed before this plan. The plan's own S4
fix only covers the `/requests/timesheets` **review queue**, a different page and a different table.
This note exists because S4 execution incidentally proved the sibling page has the identical latent
bug, once real data volume is present.

## What a plan for this needs

- Reuse or adapt the `findTimesheetCard` page-walk pattern (`tests/e2e/helpers.ts`) for a table-row
  lookup rather than a card lookup — the walk mechanics (loop, `Next →` link, capped iterations) are
  the same; only the locator shape differs (`tr` vs `[role="button"]`).
- Route **all four** call sites above through the shared helper, not just the one that currently
  fails — `manager-org-wide-timesheets.spec.ts` and `timesheet-create-for-employee.spec.ts` are
  latent, not yet observed to fail, purely because they haven't been run against a demo-data-sized
  table yet.
- A negative control proving the walk is exercised, following the pattern in
  `tests/e2e/timesheet-queue-page-walk.spec.ts`.

## Interim state

Not fixed. `timesheet-punch.spec.ts` is currently RED against a DB holding the owner's demo data.
Scoped e2e runs that don't happen to hit page-2-only rows will not surface this until the fixture
volume crosses the pageSize-10 boundary — which owner demo data now does.
