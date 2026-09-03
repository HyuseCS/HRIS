---
name: spec:flexible-periods-163
description: "Allow custom date ranges for payroll runs, payroll periods, and Save-as-timesheet, while the every-15-days cutoff stays the default (#163)"
date: 20-08-26
feature: flexible-periods
---

# SPEC — Flexible calendar periods (#163)

## Summary

Today the system only accepts three pay-period shapes: day 1 to 15, day 16 to the end of the
month, or the whole month. If you want to pay for a different span — one week, ten days, a
special run before a holiday — the system says no. This work removes that block. You will be
able to pick any start day and any end day INSIDE ONE CALENDAR MONTH for a payroll run, for a
payroll period, and for "Save as timesheet" on the attendance page. A range that crosses two
months is refused with a plain message — see "Decisions Resolved — round 2", which is the
authoritative record for this rule and overrides any earlier wording in this document.

The 15-day cutoff stays the default. If you do not change anything, every screen behaves the
way it does now, and every number comes out the same as it does now. This is a hard rule, not
a wish.

A custom range also changes the money math. Government deductions (SSS, PhilHealth, Pag-IBIG,
tax) and loan payments are monthly amounts that get cut down to the size of the period. Today
a non-standard range silently takes half a month, no matter how long it is. A 7-day run and a
30-day run both deduct half a month. That is wrong. From now on a custom range is prorated by
how many days it covers, out of the days in its month. (The same-month rule caps a custom range
at 31 days, so no separate length cap is needed.)

This SPEC says WHAT must happen and WHY. It does not choose HOW. Data shapes, function names,
and validation code belong to INNOVATE and PLAN.

## User Stories / Jobs To Be Done

**HR admin**

- As an HR admin, I want to save a timesheet for a custom date range on `/attendance`, so that
  I can capture a short or unusual span (a project week, a holiday-shortened stretch) without
  bending it into a 1–15 shape it does not fit.
- As an HR admin, I want the system to stop me before I create a range that overlaps a range
  that already exists, so that attendance and hours are never counted and paid twice.
- As an HR admin, when a timesheet cannot be saved because one already starts on that day, I
  want a plain message telling me so, so that I can fix it instead of seeing a crash page.
- As an HR admin who only ever uses the 15-day cutoff, I want my screens and my clicks to stay
  exactly as they are today, so that this change costs me nothing.

**Payroll officer**

- As a payroll officer, I want to open a payroll period and run payroll for any start and end
  date inside one calendar month, so that off-cycle and special runs stop needing a workaround.
- As a payroll officer, I want government deductions on a custom run to match the length of the
  run, so that a 7-day run does not deduct a half month of SSS, PhilHealth, Pag-IBIG, and tax.
- As a payroll officer, I want a loan or cash-advance installment on a custom run to match the
  length of the run, so that four short runs in one month do not collect four full installments.
- As a payroll officer, I want my normal 1–15 and 16–EOM runs to produce exactly the same peso
  amounts they produce today, so that I can trust that nothing moved under me.
- As a payroll officer, I want the period picker to still open on the standard cutoff, with
  custom as an extra choice I have to pick, so that the safe path stays the easy path.

**Employee**

- As an employee, I want my payslip for a normal 1–15 or 16–EOM period to be identical to the
  one I got last month, so that nothing about my pay looks unexplained.
- As an employee paid for a custom range, I want my deductions to be in proportion to the days
  covered, so that a short period does not take a full period's deductions out of my pay.
- As an employee, I want my hours to be paid once, so that an overlapping run never double-pays
  or double-deducts against me.

**CEO / approver**

- As an approver, I want a custom-range run to show its exact start and end dates and its day
  count on screen, so that I know what I am approving before I approve it.
- As an approver, I want the existing approval rules and role gates to be unchanged, so that
  custom ranges do not open a new way around approval.
- As a CEO, I want no reduction in control: the same people who can create runs today are the
  same people who can create custom runs.

## What The User Wants (Behavioral Outcomes)

**The default does not move.**

- Every place that offers a pay period today still opens on the every-15-days cutoff. Custom is
  an extra option the user must deliberately choose.
- A user who never picks "custom" sees no change in screens, clicks, labels, or numbers.
- The standard shapes (1–15, 16–EOM, whole month) keep producing the exact numbers they produce
  today, to the centavo.

**Custom ranges become possible where they are blocked now.**

- A payroll run can be created for any start and end date inside one calendar month.
- A payroll period can be opened for any start and end date inside one calendar month.
- A range that starts and ends in different months is refused with a plain message. So is a
  range whose end falls before its start.
- "Save as timesheet" on `/attendance` accepts a custom range. (The CSV export on that page is
  already free-range and is untouched.)

**The money math follows the length of the period.**

- Government deductions on a custom range are cut down by day count: the share of a month is
  the number of days in the period divided by the number of days in that month.
- The standard shapes do NOT use day count. 1–15 and 16–EOM stay at exactly half a month; whole
  month stays at a full month. A 15-day first half must not become 15/31.
- A loan or cash-advance installment on a custom range is cut down the same way.
- Basic pay, hours, working-day counts, holidays, and attendance already follow real dates and
  keep working at any length.

**Overlaps are refused.**

- The system refuses to create a payroll run, a payroll period, or a timesheet whose date range
  overlaps a range that already exists for the same organization (and, for timesheets, the same
  employee).
- The refusal is a clear message naming the conflicting range, not a crash and not a silent
  success.
- Exactly-duplicate ranges keep being refused as they are today.

**Errors are readable.**

- A timesheet that cannot be created because another timesheet already starts on that day
  produces a plain, user-facing message. It never produces a 500 error page or a raw database
  error.

**Nothing else in the pay stack changes shape.**

- Payslips, reports, and the dashboard already read plain date ranges and keep working.
- 13th-month pay and year-to-date figures are not touched — there is no accrual engine and there
  are no YTD aggregates today, and this work does not add them.

## Flow / State Diagram

**Creating a payroll run or opening a payroll period**

```text
User opens the period picker
        |
        v
  Picker opens on the EVERY-15-DAYS DEFAULT (unchanged)
        |
        +-- user accepts default -----> standard shape (1-15 / 16-EOM / whole month)
        |                                        |
        |                                        v
        |                          share = 0.5 / 0.5 / 1  (EXACTLY as today)
        |                                        |
        +-- user chooses "custom" ---> free start + end date, SAME MONTH
                                                 |
                                     cross-month or reversed --> REFUSED
                                                 |
                                                 v
                                   share = period days / days in month
                                                 |
        +----------------------------------------+
        v
  [Does this range OVERLAP an existing run/period
   for the same organization?]
        |
   yes--+------------------> REFUSED. Clear message names the
        |                    conflicting range. Nothing is written.
        |
        no
        |
        v
  Run / period is created with its real start and end dates.
  Day count is shown on screen for the approver.
        |
        v
  Payroll computes:
    basic pay + hours    -> already length-honest, unchanged
    statutory deductions -> prorated by the share above
    loan installment     -> prorated by the share above
```

**Saving a timesheet from /attendance**

```text
HR admin picks a from-date and a to-date on /attendance
        |
        +--> "Export CSV"  -> already free-range today. UNCHANGED.
        |                     (62-day cap still applies)
        |
        +--> "Save as timesheet"
                    |
                    v
        [Is the range standard?] --yes--> saved (today's behaviour)
                    |
                    no
                    |
                    v
        NEW: custom range is accepted
                    |
                    v
        [Does an existing timesheet for this employee
         START on the same day?]
                    |
              yes --+--> REFUSED with a plain message:
                    |    "A timesheet for this employee already
                    |     starts on <date>."   (NOT a 500)
                    |
              no
                    |
                    v
        [Does the range OVERLAP an existing timesheet
         for this employee?]
                    |
              yes --+--> REFUSED with a plain message
                    |
              no
                    |
                    v
              Timesheet saved
```

## Acceptance Criteria (Testable Outcomes)

Each criterion names the test scenario that proves it (`proven by:`) and its verification
strategy (`strategy:`). Scenario names follow the existing suite convention. Existing files are
named where the coverage already has a home; new scenarios are authored during PLAN/EXECUTE.

**Default preserved**

1. Every surface that offers a pay period (payroll run creation, payroll period open, new
   timesheet dialog, attendance quick-picks) opens on the every-15-days cutoff. Custom is an
   option the user must actively select; it is never pre-selected.
   `proven by:` new e2e `period-picker-default-cutoff`, extending `timesheet-create-for-employee.spec.ts`.
   `strategy:` Fully-Automated

2. A user who takes the default path through payroll run creation performs the same number of
   steps, sees the same controls, and produces the same stored period as today.
   `proven by:` existing `timesheet-create-for-employee.spec.ts` and `manager-org-wide-timesheets.spec.ts`
   re-run unchanged as a regression gate.
   `strategy:` Fully-Automated

**Standard shapes are byte-identical**

3. The period share for a 1–15 range is exactly 0.5, for a 16–EOM range exactly 0.5, and for a
   whole-month range exactly 1 — in every month length (28, 29, 30, 31 days). A first half must
   never resolve to 15/31 or 15/28.
   `proven by:` existing `tests/unit/pay-periods.test.ts` share cases, extended with an
   explicit all-month-lengths table; plus `tests/unit/payroll-calculator.test.ts:73-76`.
   `strategy:` Fully-Automated

4. A full payroll run over a standard 1–15 period produces identical gross, identical SSS,
   PhilHealth, Pag-IBIG and withholding amounts, identical loan installment, and identical net
   pay before and after this change, for the same input data.
   `proven by:` new unit `payroll-standard-period-golden` — a golden-value snapshot captured
   from the pre-change code and asserted after.
   `strategy:` Fully-Automated

**Custom range money math**

5. A custom range produces statutory deductions prorated by day count: the share equals the
   number of days in the period divided by the number of days in that month. A 7-day range in a
   31-day month takes 7/31 of the monthly figure, not 0.5.
   `proven by:` new unit `payroll-custom-period-statutory-proration`, replacing the
   `periodShareOf` fallback cases in `tests/unit/pay-periods.test.ts:98-108`.
   `strategy:` Fully-Automated

6. A run whose range covers only part of a month deducts strictly less than a full month, and a
   run covering a full month deducts exactly a full month — the share is monotonic in length and
   never exceeds 1 for a single month.
   `proven by:` new unit `payroll-custom-period-statutory-proration` (bounds and monotonicity cases).
   `strategy:` Fully-Automated

7. A loan or cash-advance installment on a custom range is prorated by the same day-count share
   as statutory, and a full standard period still collects the full installment as today.
   `proven by:` new unit `payroll-custom-period-loan-proration`, extending the existing loan
   commit coverage around `payroll/periods.ts`.
   `strategy:` Fully-Automated

8. Two or more short custom runs inside one calendar month collect, in total, no more than one
   month's loan installment for the same loan.
   `proven by:` new unit `payroll-loan-no-double-amortization`.
   `strategy:` Fully-Automated

9. Basic pay, hours worked, working-day counts, and holiday handling are correct for a custom
   range of any length up to its whole month — they follow the real calendar days, not the
   period shape.
   `proven by:` existing `computeWorkingDays` coverage in `tests/unit/`, extended with
   custom-range cases in new unit `payroll-custom-period-basic-pay`.
   `strategy:` Fully-Automated

**Overlap refused**

10. Creating a payroll run whose range overlaps an existing run for the same organization is
    refused with a clear error that names the conflicting range. Nothing is written.
    `proven by:` new unit `payroll-run-overlap-guard` + new e2e `payroll-custom-range-overlap`.
    `strategy:` Fully-Automated

11. Opening a payroll period whose range overlaps an existing period for the same organization
    is refused with a clear error. Nothing is written.
    `proven by:` new unit `payroll-period-overlap-guard`.
    `strategy:` Fully-Automated

12. The overlap guard catches partial overlap, full containment, and identical ranges — not just
    identical ranges. A May 1–20 run and a May 10–31 run cannot both exist.
    `proven by:` new unit `payroll-run-overlap-guard` (partial / contained / identical / adjacent
    cases; adjacent non-overlapping ranges must be ALLOWED).
    `strategy:` Fully-Automated

13. Existing exact-duplicate refusal (the current 409 on an identical run range) still works
    unchanged.
    `proven by:` new unit `payroll-run-duplicate-409` — closes an existing test gap noted in
    RESEARCH.
    `strategy:` Fully-Automated

**Save as timesheet**

14. "Save as timesheet" on `/attendance` accepts a custom (non-standard) date range and stores a
    timesheet with those exact dates. The button is no longer disabled for custom ranges.
    `proven by:` new e2e `attendance-save-timesheet-custom-range`.
    `strategy:` Fully-Automated

15. Attempting to save a timesheet for an employee who already has a timesheet starting on the
    same day produces a plain, user-facing error message naming the conflict. It never produces a
    500 page, an unhandled exception, or a raw Prisma unique-constraint error.
    `proven by:` new unit `timesheet-duplicate-start-message` + e2e assertion in
    `attendance-save-timesheet-custom-range` on the visible message and the HTTP status.
    `strategy:` Fully-Automated

16. A timesheet whose range overlaps an existing timesheet for the same employee is refused with
    a clear message.
    `proven by:` new unit `timesheet-overlap-guard`.
    `strategy:` Fully-Automated

17. A payroll run picks up timesheet hours for a custom range correctly — it does not silently
    fall back to scheduled hours because an existing timesheet is not fully contained in the run
    window.
    `proven by:` new unit `payroll-timesheet-sourcing-custom-range`.
    `strategy:` Fully-Automated

**Visibility and access**

18. A custom-range run and period display their exact start date, end date, and inclusive day
    count on screen, so an approver can see what they are approving.
    `proven by:` new e2e `payroll-custom-range-labels`.
    `strategy:` Fully-Automated

19. Role gates are unchanged: exactly the roles that can create a run, open a period, or save a
    timesheet today can do so with a custom range — no more, no fewer.
    `proven by:` new unit `payroll-custom-range-rbac`, pattern-matched to the existing
    `requirePayrollManage` coverage.
    `strategy:` Fully-Automated

20. Payslips, detailed reports, and the dashboard render a custom-range run without error and
    with a readable range label.
    `proven by:` new unit `payslip-custom-range-label` + existing report suites re-run as a
    regression gate.
    `strategy:` Fully-Automated

## Decisions Resolved

Resolved by the user on **2026-08-20**. Binding on INNOVATE and PLAN. Do not re-open.

**Decision 1 — Statutory proration for a non-standard range: prorate by day count.**
The share of a monthly statutory figure that a custom period carries is
`period days ÷ days in that month`. This replaces today's flat 0.5 fallback.
*Rationale:* the current behaviour is a money bug that is invisible until someone runs a short
or long period. A 7-day run deducting half a month over-deducts the employee; a 45-day run
under-deducts the employer's remittance. Day count is the simplest rule a payroll officer can
explain to an employee and to an auditor.
*Non-negotiable constraint attached to this decision:* the three standard shapes must keep
producing exactly today's numbers. FIRST_HALF and SECOND_HALF must still resolve to 0.5;
WHOLE_MONTH must still resolve to 1. They must NOT be recomputed as 15/31 or 16/31. Day-count
proration applies only where the shape is non-standard. A cross-month range would make "days in
that month" ambiguous, which is why round 2 rejects cross-month ranges outright in v1 rather
than splitting per month.

**Decision 2 — `/attendance`: unlock "Save as timesheet" for custom ranges.**
The CSV export on that page already accepts a free `from`/`to` range and needs no work; it is
out of scope. The 62-day cap on the export stays as it is.
*Rationale:* the CSV half of #163's attendance ask is already satisfied. The only real block on
that page is the timesheet-save button, which is disabled client-side and rejected server-side.
That is the single thing to unlock. Keeping the 62-day cap keeps an existing safety limit that
this issue never asked to remove.

**Decision 3 — Loans and cash advances: prorate the flat installment the same way as statutory.**
*Rationale:* the installment is a flat per-run amount today, never scaled by length. With custom
ranges reachable, four short runs in a month would collect four full installments from one
employee. Using the same day-count share as statutory keeps one rule in the user's head instead
of two, and keeps a full standard period collecting the full installment exactly as today.

## Open Questions (Decisions Still Needed)

Questions for the user. Each carries a one-line recommendation. These must be answered before
PLAN locks, or recorded as backlog if the user chooses to defer.

**(a) #173 Feature-E EE-share allocation when the period kind is null for a custom range.**
Today the allocation policy branches on FIRST_HALF / SECOND_HALF and falls through to
"monthly EE share x period share" for anything else. A custom range always lands in that
fall-through, so the #173 allocation policy silently stops applying. What should a custom range
do?
*Recommendation:* use the plain day-count share (the current fall-through), and state it in the
UI as the expected behaviour for custom ranges — the #173 half-and-half allocation is a rule
about the two standard halves and does not have a meaning outside them.
**ANSWERED — and this recommendation was REVERSED.** See "Decisions Resolved — round 2", item 2:
a custom run takes ZERO under FIRST/SECOND, except when the designated cutoff run does not exist
in that month, in which case it prorates by day count so the month is still collected.

**(b) Are cross-month custom ranges in scope for v1, or should they be rejected?**
A range spanning two months breaks the month-anchored statutory basis (`firstDayOfMonth` on the
period start), so a mid-period raise in the second month never reaches statutory. It also makes
"days in that month" ambiguous without a per-month split.
*Recommendation:* reject cross-month ranges in v1 with a clear message, and make the per-month
split a follow-up issue — this removes the hardest piece of the money math while still
delivering everything #163 asks for inside a single month.
**ANSWERED — recommendation ACCEPTED.** See "Decisions Resolved — round 2", item 1. Every
earlier passage in this SPEC is to be read as same-month-only.

**(c) Should the dead `PayrollConfig.firstCutoff` / `secondCutoff` columns become the
configurable default cutoff, or stay dead?**
They are written by the config UI and the seeds, defaulted to 15 and 30, and read by nothing.
*Recommendation:* leave them dead in this issue and note them as a separate cleanup or a future
"configurable cutoff" issue — wiring them up is a new feature (per-org cutoff configuration)
that #163 did not ask for, and doing it here widens the money-affecting blast radius.

## Out Of Scope

- **The pre-existing MANAGER org-wide reach on `/attendance`.** `assertCanTouchEmployee` is not
  called anywhere in the attendance surface, so a MANAGER reaches every employee in the
  organization there. This is pre-existing behaviour, is asserted as intended by
  `tests/e2e/manager-org-wide-timesheets.spec.ts`, and is tracked separately under #133. It is
  recorded here, not fixed here.
- **The 62-day export cap on `/attendance`.** It stays exactly as it is (Decision 2).
- **CSV export streaming / performance work on the attendance export.** The export already
  accepts a free range; no change to how it is produced.
- **13th-month accrual.** There is no accrual engine today — 13th month is a display-only
  pass-through of an earning line. This work does not build one.
- **YTD aggregates.** None exist today. This work does not add them.
- **The CSV export's free-range behaviour on `/attendance`.** Already satisfied; no work.
- Wiring up the dead `firstCutoff` / `secondCutoff` columns, unless the user answers (c) the
  other way.
- Any change to who can create runs, open periods, or save timesheets. Role gates are reused
  as-is, not redesigned.
- Leave accrual, which has no period coupling (`LeaveBalance.year`).
- A redesign of the payroll period picker beyond adding a custom-range option next to the
  existing default.

## Constraints

- **The standard shapes must not move, at all.** 1–15, 16–EOM, and whole-month runs must produce
  the same peso amounts after this change as before it. FIRST_HALF and SECOND_HALF resolve to
  exactly 0.5; WHOLE_MONTH resolves to exactly 1. This is the single hardest constraint in the
  issue and criterion 4 is its gate.
- **The 15-day cutoff stays the default everywhere.** Custom is opt-in, never pre-selected.
- **Money-affecting change.** Statutory deductions and loan amortization are legally remitted
  amounts and directly change take-home pay. Every proration rule needs a test asserting the
  actual computed amount, not just the helper's return value — RESEARCH found the current tests
  only cover the helper, never a full run.
- **The data model already allows custom ranges.** `PayrollRun.periodStart/periodEnd`,
  `PayrollPeriod.startDate/endDate`, and `Timesheet.periodStart/periodEnd` are plain date
  columns. The block is a shape validator introduced by #129, plus the picker UI. No schema
  widening is needed to store a custom range.
- **`Timesheet.@@unique([employeeId, periodStart])` exists and stays.** Two timesheets for one
  employee cannot start on the same day. With custom ranges this becomes reachable by ordinary
  use, so the collision must surface as a plain message (criterion 15), not a 500.
- **No overlap guard exists anywhere today.** The only uniqueness in the period stack is
  `PayrollRun.@@unique([organizationId, periodStart, periodEnd])`, which catches identical
  ranges only. `PayrollPeriod` has no unique constraint and no index at all. There is no
  range-intersection query anywhere in the payroll surface. Overlap protection is new work, and
  it is what makes custom ranges safe.
- **`lockRange` is idempotent** — re-locking an overlapping attendance window neither throws nor
  warns, so it will not catch an overlap for us.
- **Existing tests encode the #129 constraint and will need to change.**
  `tests/unit/pay-periods.test.ts:79-96` explicitly asserts that 1–14, a partial second half,
  and cross-month ranges are rejected. The 1–14 and partial-second-half assertions are the thing
  being changed and must be replaced by assertions of the new rule, not deleted. The cross-month
  assertion STAYS — round 2 keeps cross-month ranges refused.
- **E2E tests drive the period picker by handle and by button label** (`#pp-month`, segmented
  control text). Changing the picker will move those handles; the affected specs are
  `timesheet-create-for-employee.spec.ts`, `manager-org-wide-timesheets.spec.ts`, and
  `multi-role-sod.spec.ts`.
- **No component-test infrastructure exists for `.svelte` files.** The client-side
  `rangeIsStandard` gate on `/attendance` is only reachable via e2e.
- Statutory tables produce monthly amounts by design; proration is a multiplication applied on
  top of them, never a change to the tables.

## Risks (ranked — money first)

1. **A standard period silently changes its numbers.** If the new day-count rule is applied to
   FIRST_HALF or SECOND_HALF, every employee's deductions move (15/31 instead of 0.5) with no
   visible cause. This is the single worst outcome of this issue. Gate: criteria 3 and 4, with a
   golden-value snapshot taken before the change.
2. **A custom range prorates statutory wrongly, and nobody notices.** Today's tests only assert
   the share helper, never a full run's peso output. A rounding rule or an off-by-one on the
   inclusive day count changes real remittances. Gate: criteria 5 and 6.
3. **Loan double-collection.** Two short runs in a month currently take two full installments.
   If proration is added to statutory but missed on loans, employees are over-collected on their
   loans. The existing `@@unique(loanId, payrollEntryId)` key does not protect against this — it
   guards replay of the same entry, not two entries in two runs. Gate: criteria 7 and 8.
4. **Overlapping ranges pay the same attendance twice.** With no overlap guard, a May 1–20 run
   and a May 10–31 run both insert cleanly; attendance is paid twice, timesheets double-count,
   and loans double-decrement. Custom ranges make this reachable by ordinary use rather than by
   accident. Gate: criteria 10, 11, 12, 16.
5. **Cross-month statutory anchoring is wrong.** The statutory basis is pinned to the first day
   of the period-start month, so a raise landing in the second month of a cross-month range never
   reaches statutory. This is the reason for open question (b).
6. **Timesheet hours silently vanish.** A run shorter than an existing timesheet picks up zero
   hours (the query requires containment) and falls back to scheduled hours without any warning.
   Gate: criterion 17.
7. **A unique-constraint collision reaches the user as a 500.** Two custom timesheets starting
   the same day is now an ordinary user action, not an edge case. Gate: criterion 15.
8. **E2E breakage from picker changes.** Three e2e specs drive the picker by handle and label. A
   picker change breaks them; a careless "fix" to make them green could hide a real regression.
9. **The #173 EE-share policy silently degrades** for every custom range because the period kind
   is null. No crash, no warning — the allocation policy just stops applying. This is open
   question (a).
10. **Scope creep into the dead cutoff columns.** Wiring `firstCutoff` / `secondCutoff` turns
    this issue into a per-org configuration feature. This is open question (c).

## Background / Research Findings

Full detail: `research-findings_REF_20-08-26.md` in this task folder. The facts that shaped
this SPEC:

- **The issue is half-satisfied already.** The `/attendance` CSV export accepts a free
  `from`/`to` range today, defaults to the last 14 days, and clamps at 62 days. What is actually
  locked on that page is the "Save as timesheet" button. `/payroll` is genuinely blocked at both
  run creation and period opening.
- **The block is a shape validator, not the data model.** All the relevant date columns are plain
  `DateTime`. `isValidStandardPeriod` (introduced by #129) is the gate, enforced at three service
  sites, each with an `allowNonStandardPeriod` escape hatch documented as "seeds / legacy imports
  only". One UI component (`PeriodPicker.svelte`) is the only picker and cannot express a custom
  range at all.
- **`periodShareOf` reads the shape, not the length.** That is the root of the money bug: a
  non-standard range takes the caller's fallback (0.5 for a semi-monthly org) regardless of
  whether it covers 7 days or 45. It multiplies SSS, PhilHealth, Pag-IBIG, withholding, recurring
  allowances and incentives, benefit enrollment costs, and recurring custom deductions.
- **`periodDays` already exists and is length-honest** (inclusive day count), as does
  `computeWorkingDays`, which iterates real PHT days. Basic pay and scheduled hours are already
  correct at any period length. The length-honest half of the system is in place.
- **Loans add a flat installment per run, never scaled.**
- **Mid-period segments (#170/#171) are arbitrary-range safe** — segment weights sum to the
  period share — but the total inherits that share, and the statutory basis is anchored to the
  first day of the period-start month, which a cross-month range breaks.
- **Timesheet sourcing uses containment**, so a run shorter than an existing timesheet reads zero
  hours and falls back to scheduled hours silently.
- **There is no range-intersection query anywhere in the payroll surface**, and `PayrollPeriod`
  has no unique constraint or index at all. `Timesheet` does have
  `@@unique([employeeId, periodStart])`.
- **`PayrollConfig.firstCutoff` / `secondCutoff` and `PayrollPeriod.cutoff` are write-only.** Four
  writers, zero readers across `src`, `scripts`, `prisma`, and `tests`. The config UI defaults
  them to 15 and 30.
- **13th month has no accrual engine** (display-only pass-through), there are **no YTD
  aggregates**, and leave accrual has no period coupling. None of them couple to this change.
- **Test gaps that matter here:** no test asserts the non-standard rejection at the service level,
  no test asserts the duplicate-run 409, no test at any level covers overlapping ranges (no guard
  exists to test), no test asserts what a non-standard run actually deducts in pesos, and there is
  no shared fixture for creating a payroll run — every e2e hand-rolls Prisma inserts with bespoke
  dates to dodge the unique constraint.
- **RBAC is unchanged by this work.** Run creation needs `MANAGE_PAYROLL`; voiding needs
  `OVERRIDE_FINALIZED`; payroll config needs `ADMINISTER_SYSTEM`; `/attendance` view needs only
  authentication, writes need `MANAGE_HR`. The standing #133 caveat — MANAGER reaching every
  employee on the attendance surface because `assertCanTouchEmployee` is never called there — is
  recorded and left alone.
- **User's issue text, verbatim:** "Allow custom date ranges wherever a pay period is currently
  fixed, while keeping the every-15-days cutoff as the default option. In `/attendance`, allow
  export to timesheet for custom date ranges. In `/payroll`, allow payroll runs for custom date
  ranges."

---

## Decisions Resolved — round 2 (2026-08-20)

The three questions SPEC left open, plus one re-opened by INNOVATE, are now answered by the user.

1. **Cross-month custom ranges — REJECTED in v1.** A custom period must start and end in the
   same calendar month. A clear inline message says so. This keeps the "days in month"
   denominator unambiguous and keeps the `firstDayOfMonth(periodStart)` statutory basis anchor
   valid. Per-month splitting is a follow-up, not v1. Side effect: the same-month rule caps a
   custom range at 31 days, so no separate length cap is needed.

2. **#173 Feature-E EE-share allocation — a custom run collects ZERO employee statutory share
   under a FIRST or SECOND policy.** This reverses the first answer given ("fall through to
   day-count"), on new evidence INNOVATE surfaced: under FIRST/SECOND the designated cutoff run
   already collects the *whole* month's EE share by itself (`calculator.ts:147-157`), so a
   day-count fall-through would let the month exceed 100% of the monthly contribution. Orgs on
   EVEN allocation are unaffected and keep day-count proration. **Guard rail:** `WHOLE_MONTH`
   must stay on the existing `times(share)` path — the early return at `calculator.ts:153`
   currently covers it, and moving it would regress a standard shape.

3. **`PayrollConfig.firstCutoff` / `secondCutoff` — left dead.** Wiring them up is a per-org
   configurable-cutoff feature #163 never asked for and would widen the money blast radius.
   They are recorded as pre-existing dead code on the issue, not deleted (project rule: do not
   remove pre-existing dead code unasked).

4. **Overlap guard scope — non-standard ranges only.** Not a user question; a correctness
   constraint INNOVATE surfaced. `pay-periods.ts:3-4` and `payroll/index.ts:218-221` document
   that a WHOLE_MONTH "benefits / adjustment" run coexisting with the two halves is a
   **supported workflow today**. An unconditional range-intersection guard would silently delete
   it. The guard must fire only when at least one side of the comparison is a non-standard range.

## UI/UX direction

Shaped separately under impeccable — see `design-brief_REF_20-08-26.md` in this folder. Summary:
a fourth `Custom range` segment in the existing picker (default stays First half), revealing two
native date inputs, with the preview line extended to state the prorated share before commit.
`/attendance` gets no new UI — the unlock is a deletion of the `rangeIsStandard` guard.
