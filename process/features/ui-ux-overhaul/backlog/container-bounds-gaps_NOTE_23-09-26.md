---
name: note:container-bounds-gaps
description: "Unbounded list surfaces found while porting phase 10 to staging 9cc3dcc — kept out of the port PR by owner decision D3"
date: 23-09-26
feature: ui-ux-overhaul
---

# Container-bounds gaps left out of the phase 10 port — NEW PLAN REQUIRED

Date: 2026-09-23
Source: phase 10 port research on `feat/uiux-phase-10-bounds` (staging `9cc3dcc`).
Plan: `active/ui-ux-overhaul_03-09-26/phase-10-container-bounds_PLAN_03-09-26.md` (P-11).

## Why these are not in the port

Owner decision D3: the port re-applies phase 10 only. New surfaces go here.

## The gaps (paths under `src/routes/(app)/`, staging line numbers)

| # | Surface | Where | What is unbounded |
|---|---|---|---|
| 1 | Payroll runs list | `payroll/+page.svelte:132` | `listPayrollRuns` (`src/lib/server/services/payroll/index.ts:846`) has no `take`; one row per run, forever |
| 2 | Payroll periods list | `payroll/periods/+page.svelte:67` | `listPeriods` (`periods.ts:37`) has no `take` |
| 3 | Attendance HR range table | `AttendanceHrGrid.svelte:836` | the range table grows with days × rows |
| 4 | Leave types | `settings/leave-types/+page.svelte:133` | config-scale, no ceiling |
| 5 | Job boards | `settings/job-boards/+page.svelte:74` | config-scale, no ceiling |
| 6 | Onboarding templates | `settings/onboarding/+page.svelte:93` | config-scale, no ceiling |
| 7 | Performance templates | `performance/templates/+page.svelte:112` | no ceiling |
| 8 | Org chart | `settings/org-chart/+page.svelte:87`, `:127`, `:143` | three lists, no ceiling |

Also:

- **Separations** `separations/+page.svelte:41` — paginated, so bounded in rows, but check the
  page at 390px when this note is picked up.
- **The lg-only-no-phone-ceiling sites** kept by owner decision D2: `leave/balances`,
  `settings/roles`, performance EMPLOYEE view (`performance/+page.svelte:215`, `:256`), `/team` +
  `TeamMatrix`. They are bounded at `lg` by the fill-window shape and have **no** ceiling below
  `lg`. On a phone they still grow with rows.

## Suggested fix

Plain sites (4–8): `.card-scroll` on the existing `overflow-x-auto` wrapper, same rule as the phase 10
plain sites, plus a `container-bounds-scan.test.ts` G13 entry each. Payroll runs and periods (1–2):
real pagination (`paginate()` + `Pagination.svelte`), not a cap — they are the view-all pages.
Attendance grid (3) and the D2 sites: a below-`lg` ceiling decision per page; ask the owner.

## Owner

Next UI/UX follow-up after the phase 10 port PR merges.
