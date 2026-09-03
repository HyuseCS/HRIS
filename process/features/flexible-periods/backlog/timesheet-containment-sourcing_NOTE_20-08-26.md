---
name: note:timesheet-containment-sourcing
description: "FIXED in #163 (PR #318) — computePayroll used to source timesheet hours by containment; it now sources them by intersection and sums only the entries dated inside the run"
date: 20-08-26
feature: flexible-periods
---

# Known gap — payroll sources timesheet hours by CONTAINMENT (#163 criterion 17)

**Status: FIXED in #163 (PR #318, review round 2).** This note is kept as the design record of
the defect and of why option 1 was chosen. It is no longer an open residual.

The query below is what the code USED to do. It now sources by intersection at both levels —
see `## The fix that shipped` at the bottom.

## The query

`src/lib/server/services/payroll/index.ts` (the per-employee loop in `computePayroll`):

```ts
const timesheets = await db.timesheet.findMany({
  where: {
    employeeId: emp.id,
    periodStart: { gte: run.periodStart },
    periodEnd: { lte: run.periodEnd },
    status: 'APPROVED'
  },
  include: { entries: true }
})
```

A timesheet counts only when it sits **entirely inside** the run's period.

## The failing scenario

1. An employee has an APPROVED timesheet for the standard period **May 1 – 15**.
2. #163 now allows a custom payroll run for **May 3 – 9**.
3. The run is shorter than the timesheet, so the containment filter matches nothing.
4. `approvedHours` is 0, so `regularHours` falls back to
   `scheduledHours = workingDays × dailyHours`.
5. The employee is paid for **full scheduled hours** that no timesheet supports. Money moves.

Exposure is limited to employees with **no** derived attendance — `buildAttendanceInput` is
preferred and covers anyone on the punch pipeline. It is real for orgs that are not.

The reverse case (a run LONGER than the timesheet, double-counting a shared day across two
timesheets) is unreachable: #163 added an employee-scoped timesheet overlap guard.

## What #163 shipped instead

A visible signal, not a fix. When a run's `periodKind === null` (a custom range) **and** an
employee falls back to `scheduledHours` with no derived attendance, its PayrollEntry is flagged:

> Hours estimated from schedule — no timesheet covers this custom period

Asserted in `tests/unit/payroll-custom-run-compute.test.ts`.

## The two options for a real fix

1. **Intersection query.** Replace containment with
   `periodStart <= run.periodEnd AND periodEnd >= run.periodStart`, then count only the
   `TimesheetEntry` rows whose `date` falls inside the run's period. Accurate, and it makes
   entry-level dates authoritative rather than the sheet's declared bounds.
2. **Pro-rate the sheet's hours.** Keep the sheet-level query but scale `totalHours` by
   `overlapDays ÷ timesheetDays`. Cheaper, but wrong whenever hours are unevenly distributed
   across the sheet — which is the normal case.

Option 1 is the correct one, and it is what shipped. It changes how **every** run sources hours,
including standard ones, so the golden-value guard
(`tests/unit/payroll-standard-period-golden.test.ts`) is what proves no standard period moved.

## The fix that shipped

Option 1, in the same PR. `computePayroll` now runs:

```ts
const timesheets = await db.timesheet.findMany({
  where: {
    employeeId: emp.id,
    status: 'APPROVED',
    periodStart: { lt: dayAfterRunEnd },
    periodEnd: { gte: runStartDay }
  },
  include: { entries: { where: { date: { gte: runStartDay, lt: dayAfterRunEnd } } } }
})
```

A sheet is a candidate when it shares any calendar day with the run, and only the `TimesheetEntry`
rows dated inside the run are summed. `approvedHours` is therefore exactly the in-period days, and
the `approvedHours > 0 ? approvedHours : scheduledHours` fallback is unchanged.

The schedule-fallback flag stays, and now means what it says: no APPROVED entry falls on any day of
the range. Asserted in `tests/unit/payroll-custom-run-compute.test.ts`.

## Why it was not a blocker for #163

The defect predates #163: a legacy off-cycle run created through the old
`allowNonStandardPeriod` escape hatch hits it identically. #163 makes it *reachable through the
UI*, which is why the signal ships in the same PR.
