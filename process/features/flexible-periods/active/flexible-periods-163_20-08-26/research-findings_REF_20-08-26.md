---
name: ref:flexible-periods-163-research
description: "RESEARCH findings for #163 — how payroll periods and attendance/timesheet periods are defined, created, and consumed today"
date: 20-08-26
feature: flexible-periods
phase: RESEARCH
---

# RESEARCH — Flexible calendar periods (#163)

Issue #163: "Allow custom date ranges wherever a pay period is currently fixed, while keeping
the every-15-days cutoff as the default option. In `/attendance`, allow export to timesheet for
custom date ranges. In `/payroll`, allow payroll runs for custom date ranges."

## Validity check against the code

The issue is **half already satisfied**:

- `/attendance` **CSV export already accepts a free `from`/`to` range** — `src/routes/(app)/attendance/export/+server.ts:94-98`, default "last 14 days", clamped to `MAX_RANGE_DAYS = 62`. The two `<input type="date">` controls are free-form (`+page.svelte:311-330`).
- What IS locked on `/attendance` is the **"Save as timesheet"** button, which writes a `Timesheet` row: `src/lib/server/services/timesheets.ts:138-140` rejects anything non-standard; the button is disabled client-side via `rangeIsStandard` (`+page.svelte:54-59`, `:399`).
- `/payroll` is genuinely blocked at `src/lib/server/services/payroll/index.ts:80-82` (`createPayrollRun`) and `src/lib/server/services/payroll/periods.ts:52-54` (`openPeriod`).

The **data model does not block custom ranges** — `PayrollRun.periodStart/periodEnd`, `PayrollPeriod.startDate/endDate` and `Timesheet.periodStart/periodEnd` are plain `DateTime`. The block is a *shape validator* introduced by #129.

## The constraint layer

`src/lib/utils/pay-periods.ts` is the single source of the shape:

- `periodOf(kind, year, month0)` — `:44-58`. Day 15/16 are hard-coded literals.
- `describePeriod(start, end)` — `:82-108`. Requires `sameMonth`; returns `kind: null` otherwise.
- `isValidStandardPeriod(start, end)` — `:115-117`. `describePeriod(...).kind !== null`.
- `periodShareOf(start, end, fallback = 0.5)` — `:125-130`. **Reads the shape, not the length.**
- `periodDays(start, end)` — `:61-64`, inclusive day count. Already length-honest.
- `firstDayOfMonth(d)` — `:67-69`. The statutory basis anchor for #170/#171.

Three enforcement sites, all with the same `allowNonStandardPeriod` escape hatch documented as
"seeds / legacy imports only (#129)":

| Site | Line | Escape hatch |
|---|---|---|
| `createPayrollRun` | `payroll/index.ts:80-82` | `opts.allowNonStandardPeriod` (`:78`) |
| `openPeriod` | `payroll/periods.ts:52-54` | `input.allowNonStandardPeriod` (`:48`) |
| `createTimesheet` | `timesheets.ts:138-140` | `opts.allowNonStandardPeriod` (`:136`) |

One UI site: `src/lib/components/ui/PeriodPicker.svelte` — month + year selects and a three-way
First-half / Second-half / Whole-month segmented control, emitting hidden `periodStart`/`periodEnd`
inputs (`:67-68`). It **cannot express a custom range**. Used at:

- `src/routes/(app)/payroll/+page.svelte:76` (create run)
- `src/routes/(app)/payroll/periods/+page.svelte:81` (open period, `startName="start" endName="end"`)
- `src/lib/components/timesheets/NewTimesheetDialog.svelte:128`

`/attendance` does NOT use PeriodPicker — it has raw date inputs plus its own quick-pick row
(`+page.svelte:70-86`) that snaps to `periodOf()`.

`src/routes/(app)/reports/[type]/+page.svelte:28` also calls `periodOf` for its range presets.

## What breaks under a custom range

### Statutory proration — the money bug
`payroll/index.ts:222-223` computes `periodShare = periodShareOf(run.periodStart, run.periodEnd, frequencyShare)`
where `frequencyShare` is 0.5 for a `SEMI_MONTHLY` org. A non-standard range therefore silently
takes the **0.5 fallback** regardless of length. It multiplies:

- SSS / PhilHealth / Pag-IBIG / withholding — `payroll/index.ts:217-223` → `calculator.ts:186-208`.
  `ph-statutory.ts:234-312` produces *monthly* amounts by design.
- Recurring allowances / incentives (#65) — `payroll/index.ts:334-339`.
- Benefit enrollment costs (T148) — `payroll/index.ts:344-351`.
- Recurring custom deductions (#66) — `payroll/index.ts:385`.

Net effect today: a 7-day run deducts a half month; a 45-day run also deducts a half month.

### #173 Feature-E EE-share allocation
`payroll/index.ts:227` derives `periodKind = describePeriod(...).kind`; `calculator.ts:141-157`
`resolveEE()` branches `if (kind !== 'FIRST_HALF' && kind !== 'SECOND_HALF') return monthlyEE.times(share)`.
A custom range yields `kind: null`, silently degrading the allocation policy — no crash.

### Loans / cash advances
`payroll/index.ts:314-325` adds a **flat** `installment` per run, never scaled. Committed at
`payroll/periods.ts:182-261`. Four short runs in a month collect 4× the intended amortization.
The `@@unique(loanId, payrollEntryId)` key (`periods.ts:205-212`) guards replay of the *same*
entry, not two entries in two different runs.

### Mid-period segments (#170/#171)
`payroll/compensation.ts:98-151` weights segments as `share × wd_i / totalWd`, so `Σ weight === periodShare`
— the split is arbitrary-range safe, but the total inherits `periodShare`. The statutory basis is
pinned to `firstDayOfMonth(periodStart)` (`compensation.ts:113`) — a month-anchored assumption that a
cross-month range breaks (a raise in month 2 never reaches statutory).

### Timesheet sourcing
`payroll/index.ts:297-305` reads timesheets with `periodStart: { gte: run.periodStart }, periodEnd: { lte: run.periodEnd }`
— containment. A run shorter than an existing timesheet picks up **zero** hours and silently falls
back to `scheduledHours` (`index.ts:312`).

### Length-honest already (no change needed)
`computeWorkingDays(start, end, holidays)` (`src/lib/utils/dates.ts:19-37`) iterates real PHT days;
basic pay and `scheduledHours` are correct at any length (`payroll/index.ts:241-245, 311-312`).
Holidays (`:201-207`), attendance derivation (`:328`), payslip labels (`payslip-document.ts:283`),
reports (`reports.ts:163-189` etc.) and the dashboard all use plain range filters.

### Not coupled at all
13th month has **no accrual engine** — it is a display-only pass-through of a `THIRTEENTH` earning
line (`payslip-document.ts:301`, `separation.ts:266-267`). There are **no YTD aggregates**. Leave
accrual has no period coupling (`LeaveBalance.year`).

## Overlap: no guard exists

The only uniqueness in the whole period stack is `PayrollRun.@@unique([organizationId, periodStart, periodEnd])`
(`prisma/schema.prisma:1139`), read by the 409 checks at `payroll/index.ts:84-87` and `payroll/periods.ts:56-65`.
`PayrollPeriod` has **no unique constraint and no index at all**. There is **no range-intersection query
anywhere** in the payroll surface.

So `(May 1 – May 20)` and `(May 10 – May 31)` both insert cleanly, and then:
- attendance is paid twice (`payroll/index.ts:328` has no "already consumed" marker),
- timesheets double-count (`index.ts:297-305`),
- loan amortization double-decrements.

`lockRange` (`attendance/index.ts:588-610`) is an `updateMany` setting `isLocked: true` — **idempotent**,
so re-locking an overlapping window neither throws nor warns. Confirmed by reading the function.

`Timesheet` has `@@unique([employeeId, periodStart])` (`schema.prisma`), so two custom timesheets
starting the same day collide with a 409 (`timesheets.ts:142-145`).

## Dead / decorative columns

`PayrollConfig.firstCutoff` / `secondCutoff` (`schema.prisma:1097-1098`) and `PayrollPeriod.cutoff`
(`:1649`) are **write-only**. Writers: `payroll/config/+page.server.ts:60-93`, `prisma/seed-core.ts:552-553`,
`payroll/periods.ts:74`, `api/v1/payroll/periods/+server.ts:55`. A full grep of `src`, `scripts`, `prisma`
and `tests` finds **no reader**. The config UI defaults them to 15 and 30 (`config/+page.svelte:17-18`).

## RBAC

- Payroll run creation: `MANAGE_PAYROLL` (`src/lib/rbac.ts:105` = MANAGER, SUPER_ADMIN, HR_ADMIN, PAYROLL_OFFICER, CEO)
  via `requirePayrollManage` (`src/lib/server/rbac.ts:33-35`). Enforced at `payroll/+page.server.ts:37,60`,
  `payroll/periods/+page.server.ts:51,71,81,91,103`, `api/v1/payroll/periods/+server.ts:29`.
- Voiding a period additionally needs `OVERRIDE_FINALIZED` (`periods.ts:338`).
- Payroll config needs `ADMINISTER_SYSTEM` (`payroll/config/+page.server.ts:43`).
- `/attendance` view: **any authenticated user** (`attendance/+page.server.ts:41`, no capability check);
  writes need `MANAGE_HR`, unlock needs `OVERRIDE_FINALIZED`.
- Known standing caveat (#133): `MANAGE_HR` and `MANAGE_PAYROLL` both include `MANAGER`.
  `assertCanTouchEmployee` is **not called anywhere in the attendance surface** — a MANAGER reaches
  every employee in the org there. Pre-existing, org-wide behaviour is asserted as intended for
  timesheets by `tests/e2e/manager-org-wide-timesheets.spec.ts`. **Out of scope for #163** — recorded, not fixed.

## Existing tests

- `tests/unit/pay-periods.test.ts` — the dedicated suite. `:79-96` explicitly asserts that 1–14,
  16–30-in-a-31-day-month, and cross-month ranges are **rejected**. `:98-108` covers the `periodShareOf`
  fallback. **These tests encode the #129 constraint and will need to change.**
- `tests/unit/payroll-calculator.test.ts:73-76` — asserts `periodShareOf` is 0.5 / 1.
- `tests/unit/payroll-mid-period.test.ts` — #170/#171 segments.
- `tests/unit/payroll-statutory-basis.test.ts`, `compensation-resolver.test.ts` — import `periodDays`.
- `tests/unit/timesheet-selfservice.test.ts:203` — the only test using `allowNonStandardPeriod: true`.
- `tests/unit/attendance-export-am-pm.test.ts` — the only test of `GET /attendance/export`.
- E2E driving the picker: `timesheet-create-for-employee.spec.ts:105,107,196,198`,
  `manager-org-wide-timesheets.spec.ts:91,93` (handles are `#pp-month` and button label text),
  `multi-role-sod.spec.ts:139` (posts periodStart/periodEnd directly).

## Test gaps relevant to this change

- No test asserts `createPayrollRun` / `openPeriod` reject a non-standard range.
- No test asserts the 409 duplicate-run guard.
- No test at any level for overlapping ranges (no guard exists to test).
- No test asserts what a non-standard *run* actually deducts (only the helper's fallback is tested).
- No test asserts the 62-day export clamp or the export's default range.
- No component-test infra for `.svelte` — `rangeIsStandard` is only reachable via e2e.
- No shared fixture for creating a payroll run in a test; every e2e hand-rolls Prisma inserts with
  bespoke dates to dodge the unique constraint.

## Product decisions taken by the user (2026-08-20)

1. **Statutory proration:** prorate by **day count** — `share = periodDays ÷ daysInMonth` — replacing the
   flat 0.5 for non-standard ranges. The 15-day default must keep landing on today's numbers.
   Cross-month ranges need a per-month split.
2. **Attendance:** unlock **"Save as timesheet"** for custom ranges. The CSV is already free-range and
   needs no work. The 62-day cap stays.
3. **Loans / cash advances:** prorate the installment the same way as statutory.

## Open items for SPEC/PLAN

- `Timesheet.@@unique([employeeId, periodStart])` blocks two custom timesheets sharing a start day.
- Overlap prevention has no implementation today and no test; a custom-range feature makes it reachable.
- `periodKind` (#173 Feature E) is `null` for every custom range — the allocation policy needs a stated answer.
- `firstDayOfMonth(periodStart)` statutory anchoring breaks for cross-month ranges.
- The dead `firstCutoff`/`secondCutoff` columns are the natural home for a configurable default cutoff,
  but nothing reads them today.
