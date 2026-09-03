---
name: spec:cross-month-periods-3
description: "Allow a custom payroll period to cross a calendar-month boundary, capped at one month's worth of pay, with a total refusal for organisations that split statutory by half-month (#3)"
date: 02-09-26
feature: flexible-periods
---

# SPEC — Cross-month custom payroll periods (#3)

Follow-up to #163, which shipped custom date ranges but deliberately locked them inside one
calendar month. This document says what #3 changes and why. It does not say how to build it.

---

## Summary

Today a custom pay period must start and end in the same calendar month. If you try to pay
26 December to 10 January — a completely normal off-cycle shape in the Philippines — the system
refuses you with "A custom period must start and end in the same month."

This work removes that block. You will be able to pick a start date in one month and an end date
in the next month, for a payroll run, for a payroll period, and for "Save as timesheet" on the
attendance page.

Two safety rails come with it.

**Rail one — the size cap.** Pay is calculated as a fraction of a month. A range that crosses a
month gets its fraction by adding up the part of each month it touches. 26 December to 10 January
is 6 days of December plus 10 days of January, which is 6/31 + 10/31 = about 52% of a month. The
system refuses any range that adds up to more than 100% of a month. It never quietly shrinks the
range to fit — it stops you and tells you. A side effect of the cap: a range can never reach into a
third month, because even the shortest three-month range is already 106%.

**Rail two — the half-month cutoff refusal.** Some organisations tell the system "load this
employee's whole month of SSS, PhilHealth and Pag-IBIG onto the 1–15 run" (or onto the 16–end run).
If your organisation does that for even one active employee, you cannot use cross-month ranges at
all. Every cross-month range necessarily covers the end of one month and the start of the next, so
it always sits on top of one of those designated runs. You get a clear refusal that names the
cutoff. This is deliberate. A narrower rule can be built later if a real customer asks for it.

Everything else stays exactly as it is. Normal 1–15, 16–end and whole-month runs produce the same
peso amounts, to the centavo, as they do today.

---

## User Stories / Jobs To Be Done

**Payroll officer**

- As a payroll officer, I want to run an off-cycle payroll from 26 December to 10 January, so that
  the holiday run matches how we actually pay people instead of being forced into two runs.
- As a payroll officer, I want pay on a cross-month range to be in proportion to the days in each
  month, so that a 16-day range that straddles New Year pays about half a month, not half a month
  by luck.
- As a payroll officer, I want the system to stop me — loudly — if I pick a range that would pay
  more than one month, so that I never overpay a whole workforce by accident.
- As a payroll officer whose organisation splits statutory onto a specific half-month, I want a
  plain refusal that tells me why cross-month is not available to me, so that I stop trying and use
  the standard run instead.
- As a payroll officer, I want my existing 1–15 and 16–end runs to produce identical numbers after
  this change, so that I can trust nothing moved under me.

**HR admin**

- As an HR admin, I want to save a timesheet for a range that crosses a month, so that attendance
  captured across New Year does not have to be split into two timesheets.
- As an HR admin using "Save as timesheet" on the attendance page, I want that button to accept the
  same ranges the payroll screens accept, so that the two screens never disagree.
- As an HR admin, I want the date picker itself to let me pick into the next month, so that I do not
  have to fight a greyed-out calendar to find out whether a range is allowed.

**Finance / owner**

- As the owner, I want a written record of what this feature deliberately does NOT handle, so that a
  surprise later is a known limit and not a defect.
- As the owner, I want old payroll runs with odd date ranges to still open and recompute without
  errors, so that history stays readable.

**Employee**

- As an employee paid on a cross-month range, I want my basic pay, allowances and deductions to be
  in proportion to the days actually covered, so that a 16-day period does not take a full month of
  anything.
- As an employee, I want my payslip for a normal half-month period to look exactly like last
  month's, so that nothing about my pay looks unexplained.

---

## What The User Wants (Behavioral Outcomes)

**1. Cross-month ranges are accepted where custom ranges are accepted today.**
The four places that accept a custom range today all accept a cross-month one after this change:
creating a payroll run, opening a payroll period, creating a timesheet, and the "Save as timesheet"
button on the attendance page (which goes through timesheet creation and therefore changes too,
even though nobody edits it directly).

**2. Pay is a sum of month-slices.**
The fraction of a month a period represents is worked out per month and added up. For each calendar
month the range touches: days of the range inside that month, divided by the number of days in that
month. Those fractions are added together. 26 December to 10 January = 6/31 + 10/31 = 0.516…

**3. The three standard shapes never change.**
1–15 is exactly half a month. 16–end is exactly half a month. A whole month is exactly one month.
For every month length — 28, 29, 30 and 31 days. These are decided before any day counting happens
and this work must not move them by a single centavo.

**4. Too big is refused, never shrunk.**
If the added-up fraction is more than 1.0, the range is refused with a clear message and nothing is
written. The system does not silently cut it back to 1.0. Cutting it back would quietly underpay
people, which is worse than an error.
The boundary case is exact: 26 December to 25 January is 6/31 + 25/31 = exactly 1.0 and is
**allowed**. 1 February to 3 March is only 31 days long but is 28/28 + 3/31 = 1.097 and is
**refused** — which is why the rule is about the fraction, not about a day count.

**5. A three-month range can never be created.**
Not because of a separate rule, but because the cap makes it impossible: the shortest possible
three-month range (31 January to 1 March) already adds up to 1.065. So in practice an accepted
cross-month range always sits inside at most two calendar months.

**6. Organisations that split statutory by half-month cannot use cross-month ranges at all.**
If the organisation has even one active employee whose statutory allocation is set to the first half
or the second half, every cross-month range is refused with a message naming the cutoff it clashes
with. This must be a **total** refusal — there must be no cross-month shape that slips through.
Today's check only looks at the first month of the range, so a first-half organisation can currently
sneak a range like 20 May to 5 June past it, and that range then swallows all of June's 1–15 cutoff
window while paying zero employee statutory. That hole must be closed as part of this work.
Organisations where every employee is on the default even split are unaffected.

**7. Only one payroll run may be created at a time per organisation.**
The internal serialisation that stops two people creating overlapping runs at the same instant stops
being per-month and becomes per-organisation. For timesheets it becomes per-employee. The user sees
no difference; the behaviour it protects is the same as today.

**8. Old records keep working.**
Payroll runs already stored with a cross-month range (created before #163 locked the rule) still
open and still recompute. If such a row's fraction is at or below 1.0 it is now day-counted like any
other. If it is above 1.0 it keeps the historical flat half-month figure it has always used, and is
never quietly turned into a full month.

**9. The date picker stops fighting the user.**
The picker's calendar currently greys out every day outside the start month. That restriction
relaxes so the next month is reachable. Its inline warning text changes to match the new server
rules, and its preview line stops saying "of the month" (which was written assuming a single month).
Visual design is not part of this work.

**10. Known limitation, stated plainly.**
The basis used to look up statutory contribution brackets is taken from the first day of the FIRST
month of the range. If an employee gets a pay change that takes effect during the second month of a
cross-month period, that change does NOT move their SSS / PhilHealth / Pag-IBIG bracket for that
period. Their basic pay for the period is still correct. This is accepted and documented, not fixed.

---

## Flow / State Diagram

**Creating a payroll run, opening a period, or saving a timesheet with a custom range**

```text
          User picks a custom start date and end date
                              |
                              v
              [ Is the end date before the start date? ]
                              |
                  yes --------+-------- no
                   |                     |
                   v                     v
      REFUSED                 [ Do the dates sit in ONE calendar month? ]
  "End date must be                      |
   on or after the             yes ------+------ no  (NEW: no longer refused here)
   start date."                 |                 |
                                |                 v
                                |     [ Add up the month-slices:
                                |       SUM over each month m of
                                |       (days in m) / (days in month m) ]
                                |                 |
                                |         > 1.0 --+-- <= 1.0
                                |           |            |
                                |           v            |
                                |    REFUSED (NEW copy)  |
                                |    nothing written     |
                                |                        |
                                +------------+-----------+
                                             |
                                             v
                        [ Does the org have ANY active employee whose
                          statutory allocation is FIRST or SECOND? ]
                                             |
                                    no ------+------ yes
                                    |                 |
                                    |                 v
                                    |   [ Does the range overlap a designated
                                    |     cutoff window in ANY month it touches?
                                    |     <-- TODAY THIS ONLY CHECKS MONTH ONE.
                                    |         THAT IS THE BUG TO CLOSE. ]
                                    |                 |
                                    |         no -----+----- yes
                                    |          |              |
                                    |          |              v
                                    |          |    REFUSED, message names
                                    |          |    the cutoff and its month.
                                    |          |    (For a cross-month range
                                    |          |     this is ALWAYS the answer.)
                                    |          |
                                    +----------+
                                             |
                                             v
                          [ Overlap with an existing run / period /
                            timesheet?  (unchanged from #163) ]
                                             |
                                   yes ------+------ no
                                    |                 |
                                    v                 v
                              REFUSED            CREATED, with its real
                                                 start and end dates
                                                          |
                                                          v
                                        Payroll computes using the
                                        summed month-slice fraction
```

**What the picker offers, before and after**

```text
BEFORE                                  AFTER
start = 26 Dec                          start = 26 Dec
end   = [calendar greys out             end   = [calendar allows into January;
         everything after 31 Dec]                refusal, if any, comes from
                                                 the size cap or the cutoff rule]
```

---

## Acceptance Criteria (Testable Outcomes)

Each criterion names the scenario that proves it (`proven by:`) and the tier (`strategy:`).
Scenario names follow the existing suite convention. Existing test files are named where the
coverage already has a home; new scenario names are authored during PLAN.

**Cross-month ranges are accepted**

**AC1.** Creating a payroll run for 26 December 2026 to 10 January 2027 succeeds for an
organisation with no first/second statutory allocations. The stored run carries those exact dates.
`proven by:` `payroll-period-sanity-gate` (the `CROSS_MONTH` cases at `:114-118`, `:143-147`,
`:172-176` invert from refuse to accept).
`strategy:` Fully-Automated

**AC2.** Opening a payroll period for the same cross-month range succeeds, through both the form
action and the v1 API.
`proven by:` `payroll-period-sanity-gate` (`openPeriod` arm) + new unit `payroll-period-cross-month-open`.
`strategy:` Fully-Automated

**AC3.** Creating a timesheet for a cross-month range succeeds, and "Save as timesheet" on the
attendance page succeeds for the same range — the attendance path inherits the rule without its own
gate.
`proven by:` `timesheet-selfservice` (`:186-203` inverts from "no DB call at all" to a successful
create) + new unit `attendance-save-timesheet-cross-month` closing the gap that nothing today proves
the attendance path inherits the period gate.
`strategy:` Fully-Automated

**AC4.** A reversed range (end before start) is still refused at every entry point, with the copy
unchanged: `End date must be on or after the start date.`
`proven by:` `payroll-period-sanity-gate` reversed cases, re-run unchanged.
`strategy:` Fully-Automated

**The share math**

**AC5.** The fraction for a cross-month range equals the sum of its per-month fractions.
26 Dec 2026 – 10 Jan 2027 = 6/31 + 10/31. 20 May – 5 June = 12/31 + 5/30 = 0.55376…
`proven by:` `pay-periods` (`:178-192` — the adversarial rows that currently assert a flat 0.5
invert) + new unit `pay-periods-cross-month-share`.
`strategy:` Fully-Automated

**AC6.** The three standard shapes are unchanged and are decided BEFORE any day counting:
first half = 0.5, second half = 0.5, whole month = 1 — in 28, 29, 30 and 31 day months.
Peso goldens for a standard run are byte-identical before and after.
`proven by:` `pay-periods.test.ts:130-145` (the frozen table) + `payroll-standard-period-golden.test.ts:43-44`
+ `payroll-calculator.test.ts:73-79`, all re-run unchanged as the regression rail.
`strategy:` Fully-Automated

**AC7.** A range whose summed fraction is greater than 1.0 is refused at creation with a clear
message, and nothing is written. A range whose fraction is exactly 1.0 is accepted.
Required cases: 26 Dec 2026 → 25 Jan 2027 = exactly 1.0, ACCEPTED. 1 Feb → 3 Mar 2026 = 1.0968
(only 31 days long), REFUSED.
`proven by:` new unit `payroll-cross-month-share-cap` (boundary + the 31-day counter-example).
`strategy:` Fully-Automated

**AC8.** A range touching three or more calendar months is always refused, because its fraction
always exceeds 1.0. The tightest case, 31 Jan → 1 Mar 2026 = 1.0645, is refused.
`proven by:` new unit `payroll-cross-month-share-cap` (three-month cases).
`strategy:` Fully-Automated

**AC9.** No code path silently clamps an over-size fraction down to 1.0 for a NEWLY created range.
Feeding the pay engine a fraction above 1.0 must never happen because creation was refused first —
and if it somehow does, basic pay is not quietly reduced instead.
`proven by:` new unit `payroll-cross-month-share-cap` (a direct assertion that the refusal fires
before any write) + new unit `payroll-basic-pay-share-passthrough` covering the currently untested
`basicMonthlySalary × share` multiplication.
`strategy:` Fully-Automated

**The cutoff refusal — closing the hole**

**AC10.** The cutoff check considers the designated cutoff windows of EVERY calendar month the range
touches, not only the month the range starts in.
`proven by:` `payroll-custom-range-cutoff-guard`, extended with cross-month cases.
`strategy:` Fully-Automated

**AC11. (regression — this is a live hole the moment the gate is lifted.)** For an organisation whose
only non-even allocation is FIRST, the range 20 May 2026 → 5 June 2026 is REFUSED. Today's check lets
it through, and the resulting run would swallow all of June's 1–15 cutoff window while paying zero
employee statutory — June would collect nothing. Same for 28 April → 3 May 2026.
`proven by:` `payroll-custom-range-cutoff-guard` (new `first-allocation-end-month` cases).
`strategy:` Fully-Automated

**AC12.** For an organisation with ANY active employee allocated FIRST or SECOND, EVERY cross-month
range is refused. No cross-month shape passes. The message names the cutoff window and the month it
belongs to.
`proven by:` `payroll-custom-range-cutoff-guard` (an exhaustive sweep of cross-month start/end day
combinations against FIRST-only, SECOND-only and both-present organisations).
`strategy:` Fully-Automated

**AC13.** For an organisation where every active employee is on the default even split (or has no
statutory config rows at all), a cross-month range is accepted, and employee statutory is the
monthly amount multiplied by the summed fraction.
`proven by:` `payroll-custom-period-statutory-proration`, extended with a cross-month even-split case.
`strategy:` Fully-Automated

**AC14.** Same-month behaviour of the cutoff check is unchanged — every existing case in the guard's
suite passes untouched.
`proven by:` `payroll-custom-range-cutoff-guard` existing cases (`:84`, `:117`, `:122`, `:133`, `:154`),
re-run unchanged.
`strategy:` Fully-Automated

**Known limitation, made visible**

**AC15.** The statutory contribution basis for a cross-month period is taken from the first day of
the FIRST month, and this is written down where a user or a future maintainer will find it — in the
code comment at the anchor and in this SPEC. A pay change effective in month two does not move the
bracket. Existing pay-change-segment behaviour for same-month periods is unchanged.
`proven by:` `payroll-statutory-basis`, `payroll-mid-period`, `compensation-resolver`,
`compensation-heal`, `employee-api-compensation` — all re-run UNCHANGED. Any of them failing means
the anchor moved and the change is wrong.
`strategy:` Fully-Automated

**Serialisation**

**AC16.** The payroll-run serialisation key is per organisation and the timesheet key is per
employee. Neither carries a month any more. Two ranges in different months for the same organisation
now share a key.
`proven by:` `payroll-month-lock-key` (rewritten: the "different months, different keys" case at
`:30-34` inverts to "same key"; the per-organisation and per-employee separation cases survive; add
an arity assertion in the style of `backup-plan.test.ts:117`).
`strategy:` Fully-Automated

**AC17.** Two people submitting overlapping payroll runs for the same organisation at the same
instant still result in exactly one run being created, with the second refused by the overlap
message. No test today proves the serialisation actually works — only that the key string is right.
`proven by:` a two-connection probe against the live `veent-db-5434` database, run at the owner
verification gate.
`strategy:` Agent-Probe (Known-Gap for automation — needs two real database connections)

**Old records**

**AC18.** A payroll run already stored with a cross-month range still opens and still recomputes.
If its summed fraction is at or below 1.0 it is day-counted like any new range. If it is above 1.0
it keeps the historical flat half-month figure and is never turned into a full month. A stored
reversed range keeps the historical flat half-month figure.
`proven by:` new unit `pay-periods-legacy-cross-month` + `pay-periods` legacy cases extended.
`strategy:` Fully-Automated

**AC19.** The legacy scan script classifies a cross-month row by comparing its old fraction against
its new one, and reports it in the WILL MOVE or UNAFFECTED list accordingly. Its current
"crosses two months — keeps the historical flat 0.5" wording is replaced.
`proven by:` `legacy-nonstandard-runs-classify` (`:31-36` inverts) + the script run once against the
live database at the owner verification gate.
`strategy:` Hybrid

**The picker**

**AC20.** The period picker lets a user select an end date in the month after the start date. Its
inline warning no longer says a period must start and end in the same month; it says exactly what
the server says for an over-size range. Its preview line no longer describes the fraction as a
share "of the month". All three screens that host the picker keep working, including the payroll
periods screen which renames the two submitted fields.
`proven by:` `period-picker-default-cutoff.spec.ts` (`:43-49` and the `min`/`max` clamping assertions
at `:65-95` invert) + new e2e `period-picker-cross-month`, covering all three mount points.
`strategy:` Hybrid (e2e needs build + preview; the visual pass is separate)

---

## Error Copy (exact strings)

Today two strings are duplicated word-for-word across four files with nothing checking they agree.
This SPEC states the copy; PLAN decides where it lives.

**Unchanged, keep as is**

> `End date must be on or after the start date.`

**Deleted — no longer a rule**

> ~~`A custom period must start and end in the same month.`~~

**New — the size cap**

> `A custom period cannot cover more than one month of pay. This range covers {percent}% of a month. Shorten it.`

`{percent}` is the summed fraction as a whole number, rounded — e.g. `110` for 1 Feb – 3 Mar.

**Changed — the cutoff refusal now names the month**

Today:

> `A custom period cannot overlap the {label} cutoff, because that run collects the whole month's employee statutory share for some employees. Use a range outside it, or run the standard {standard} period.`

Becomes:

> `A custom period cannot overlap the {label} cutoff of {Month Year}, because that run collects the whole month's employee statutory share for some employees. Use a range outside it, or run the standard {standard} period.`

`{label}` stays `1–15` or `16–{last day}`. `{standard}` stays `First half` or `Second half`.
`{Month Year}` is the month the clashing window belongs to — e.g. `June 2026` — which is the only way
a user can tell WHICH month blocked them once two months are in play.

**Changed — the picker's preview line**

Today: `… · statutory and loans prorated to {n}% of the month`
Becomes: `… · statutory and loans prorated to {n}% of a month`

---

## Tests At Risk — expected new behaviour

Every test the research pass flagged, and what it must say after this change.

| Test | Today | After |
|---|---|---|
| `payroll-period-sanity-gate.test.ts:59,114-118,143-147,172-176` | 20 May → 5 Jun refused at all three entry points | Accepted for an even-split org; refused for a FIRST or SECOND org by the cutoff rule (AC11) |
| `timesheet-selfservice.test.ts:186-203` | 13 May → 2 Jun refused, asserts no DB call at all | Timesheet is created; the "no DB call" assertion is removed |
| `pay-periods.test.ts:102-124` | `isSameMonthRange` rejects cross-month and same-month-different-year | The function may keep existing for other callers, but it is no longer the creation gate; the cross-month rejection case moves to the cap suite. Same-month-different-year is still a cross-month range and is still governed by the cap |
| `period-picker-default-cutoff.spec.ts:43-49` | 5 July against a June start shows the same-month error | Shows no error (a 26-day two-month range is under the cap) |
| `period-picker-default-cutoff.spec.ts:65-95` | asserts `min`/`max` clamp the calendar to the start month | asserts the calendar reaches into the next month |
| `pay-periods.test.ts:178-192` | two adversarial cross-month rows return a flat 0.5 | Return the summed month-slice fraction (AC5) |
| `payroll-custom-period-statutory-proration.test.ts:90-91` | cross-month statutory uses the flat 0.5 | Uses the summed fraction for an even-split org (AC13) |
| `legacy-nonstandard-runs-classify.test.ts:31-36` | operator string `crosses two months — keeps the historical flat 0.5` | Reports old fraction vs new fraction; only over-cap rows keep 0.5 (AC19) |
| `payroll-month-lock-key.test.ts` (whole file) | different months → different keys; PHT-boundary bucketing | Same organisation → same key regardless of month; the bucketing cases go; add an arity assertion (AC16) |
| `payroll-custom-range-cutoff-guard.test.ts` | every case same-month; mock reimplements only the query | Same-month cases pass unchanged; new cross-month cases added; the mock must be able to express which month a window came from (AC10, AC11, AC14) |
| **Frozen — must NOT move** | | |
| `pay-periods.test.ts:130-145` | 0.5 / 0.5 / 1 across 28/29/30/31 | Unchanged. This is the regression rail |
| `payroll-standard-period-golden.test.ts:43-44` | byte-identical peso goldens | Unchanged |
| `payroll-calculator.test.ts:73-79` | standard shares | Unchanged |
| `payroll-mid-period`, `compensation-resolver`, `payroll-statutory-basis`, `compensation-heal`, `employee-api-compensation` | pay-change segment parity | Unchanged. They survive only while the month-one statutory anchor stays put (AC15) |

---

## Out Of Scope

- **Making cross-month work for organisations that split statutory by half-month.** They are refused
  outright. A narrower rule gets built when a real customer asks. (Owner decision D1.)
- **Extending the pay-change segment machinery to split on month boundaries.** The statutory basis
  stays anchored to the first month. (Owner decision D2.) The #170/#171 parity tests exist precisely
  to stop this and must not be modified.
- **Any day-count cap.** The cap is on the fraction only. A 31-day cap was considered and rejected:
  1 February – 3 March is exactly 31 days and is 110% of a month. (Owner decision D5.)
- **Clamping an over-size fraction.** Refusal only. (Owner decision D5.)
- **Visual design of the period picker.** Behaviour only here; the look-and-feel pass is separate.
- **Fixing the picker's local-vs-UTC default month** (`PeriodPicker.svelte:39`). Pre-existing, unrelated.
- **The pre-existing mismatch on very long legacy runs** where scheduled hours are billed over the
  real span but basic pay is half a month. Already shipped; not introduced or fixed here.
- **Backfilling or migrating any existing payroll run.** Nothing is rewritten. Old rows are read
  under the rules in AC18 only.
- **Changing overlap-guard behaviour, role gates, payslip layout, or the CSV export.**
- **Automating the two-connection serialisation probe** (AC17). It stays a live check.

---

## Constraints

**Owner decisions — settled, not open**

- **D1** — total refusal for organisations with any active FIRST or SECOND allocation. Closing the
  end-month blind spot is part of delivering that refusal, not a separate feature.
- **D2** — the statutory basis stays anchored to the first day of month one. Documented limitation.
- **D3** — one serialisation key per organisation for payroll runs, one per employee for timesheets.
  The month is dropped from both.
- **D4** — the fraction is the sum of per-month fractions; the three standard shapes short-circuit
  ahead of it and keep 0.5 / 0.5 / 1 exactly.
- **D5** — the cap is on the fraction at 1.0; over the cap is refused, never clamped, never a day cap.
- **D6** — old rows stay readable; over-cap old rows keep the historical flat 0.5 and are never
  clamped to 1.
- **D7** — live verification happens at the end with the owner present.

**Hard technical limits from research**

- The three standard fractions (0.5 / 0.5 / 1) are a frozen contract with byte-identical peso
  goldens behind them. Nothing in this work may move them.
- The fraction multiplies basic pay with no clamp anywhere downstream. That is why an over-size
  fraction must be refused at creation, before any write.
- The "Save as timesheet" attendance path has no gate of its own. Whatever timesheet creation
  accepts, it accepts. That change is automatic and must be tested, not assumed.
- The period picker is mounted in three places, and one of them renames the two submitted fields.
  Any field-name change breaks that third mount silently.
- The two serialisation-key helpers carry doc comments that argue FOR the month component and cite
  the same-month rule by name. Those comments become factually wrong and must be rewritten, not just
  trimmed.
- Old runs reach the pay engine on Recompute with no shape check at all — the engine gates on status
  only. Any change to the fraction function is therefore a change to how history recomputes.

**Process**

- Minimum code that solves the problem. No new abstraction, no configuration nobody asked for.
  Reuse the existing per-organisation key helper as the pattern for D3.
- Standard commit and CI rules apply: format check, lint, type check, full test suite.

---

## Live Verification Checklist (owner present, end of build — D7)

Not a build requirement. What must be seen in a real browser and a real database before this is
called done.

1. **Measure the unknown first.** Run, against each real database:
   `SELECT allocation, count(*) FROM employee_statutory_config c JOIN employees e ON e.id = c."employeeId" WHERE e."employmentStatus" = 'ACTIVE' GROUP BY allocation;`
   If every row is the even split, the cutoff refusal never fires in practice and its severity is
   zero. If any FIRST or SECOND rows exist, that organisation loses cross-month entirely and the
   owner must see that before ship.
2. Create a 26 December – 10 January payroll run in the browser, on an even-split organisation.
   Confirm it saves, shows the real dates and an inclusive day count, and computes.
3. Read one employee's payslip from that run. Confirm basic pay, allowances and deductions are about
   52% of a month, not 50% by coincidence — pick an employee whose salary makes the two visibly
   different.
4. Try 1 February – 3 March. Confirm the refusal names the percentage and that no run was created.
5. Try 26 December – 25 January (exactly 1.0). Confirm it is ACCEPTED — the boundary must not be
   off by one.
6. On an organisation with a FIRST allocation, try 20 May – 5 June. Confirm the refusal, and confirm
   the message names **June**. Negative control: the same organisation must still be able to create
   its standard 1–15 June run afterwards.
7. Drive "Save as timesheet" on the attendance page across a month boundary. Confirm it saves.
8. Run the legacy scan script against every database per its own instruction — it has never been run.
   Confirm the WILL MOVE list is what the owner expects before anything recomputes.
9. Run the two-connection serialisation probe (AC17).

---

## Open Questions

None. All product decisions (D1–D7) are settled by the owner.

The one measurement still outstanding — live statutory allocation counts — is a verification-gate
item, not a design question. It cannot change any decision above: the refusal behaviour is the same
whether the count is zero or a thousand. It is listed in the Live Verification Checklist.

---

## Background / Research Findings

Extracted from `research-findings_REF_02-09-26.md` (branch `feat/cross-month-periods-3`). Only the
facts that shaped these requirements.

**Where the block lives.** One function enforces the same-month rule, checked at three service entry
points — payroll run creation, period opening, timesheet creation — plus a client-side copy in the
picker. A fourth, indirect path (the attendance "Save as timesheet" button) calls timesheet creation
and therefore inherits the rule without having one of its own.

**Why a fraction above 1.0 is a money bug.** The single fraction the engine computes scales basic
pay, allowances, incentives, benefit costs, employer statutory, withholding tax, recurring
deductions and loan instalments. Basic pay is multiplied straight through with no clamp anywhere
downstream. There is one clamp, inside the fraction function itself, and it is dead code today
because the same-month rule guarantees it never fires. Lifting the rule would wake it up — and it
would silently underpay rather than error, which is why D5 refuses instead.

**The hole the research found.** The cutoff check builds its designated windows using only the month
the range STARTS in. A cross-month range always covers the end of month one (day 28 or later, so
always inside a 16–end window) and always covers day 1 of month two (always inside a 1–15 window).
So a SECOND-allocation organisation is already refused every cross-month range, but a FIRST-only
organisation is refused only when the range starts on or before the 15th. 20 May → 5 June sails
through, covers all of June's 1–15 cutoff window, and pays zero employee statutory because the
engine treats a custom range as unclassified. June collects nothing. This is latent today — the
same-month rule blocks the only ranges that could reach it — and goes live the instant that rule is
lifted.

**What the tests can and cannot see.** The cutoff guard's suite is entirely same-month, so it cannot
catch the above. The serialisation keys have a test file whose very name encodes the month
assumption. Nothing anywhere proves the serialisation actually serialises — only that the key string
is correct. Nothing feeds the pay engine a fraction above 1.0. Nothing proves the attendance path
inherits the period gate.

**Real-world driver, from the issue.** A 26 December – 10 January off-cycle run is a normal
Philippine payroll shape. That is the case worth building for.

**Correction the research forced on the original framing.** The issue described the cross-month
statutory basis as a choice between accepting the month-one anchor or extending the segment
machinery. Research confirmed that extending it would create pay-change segments where none exist
today, which is exactly the condition the #170/#171 parity tests were written to detect. D2 takes
the anchor.
