---
name: plan:cross-month-periods-3
description: "Cross-month custom payroll periods: summed month-slice fraction, a refusal above one month of pay, a total cutoff refusal that inspects every month touched, per-org/per-employee advisory locks, and a picker bounded by the cap (#3)"
date: 02-09-26
feature: flexible-periods
---

# PLAN — Cross-month custom payroll periods (#3)

**Date**: 02-09-26 · **Status**: PLANNED (not started) · **Complexity**: COMPLEX (single plan, single PR, 12 commits) · **Issue**: #3 · **Branch**: `feat/cross-month-periods-3`

## Overview

**TL;DR** — Twelve ordered commits on one branch, one PR. The same-month rule is replaced by a
fraction cap; the cutoff refusal is widened from the start month to every month the range touches;
two advisory-lock keys drop their month; the picker's native calendar bound is retargeted at the cap
and derived from the same function the server refuses with. Net effect on the three standard
shapes: **nothing moves, to the centavo.**

Upstream, locked, not re-litigated here:
- `research-findings_REF_02-09-26.md` (RESEARCH, file:line for every claim)
- `cross-month-periods-3_SPEC_02-09-26.md` (SPEC, AC1–AC20, exact copy, tests-at-risk)
- `design-brief_REF_02-09-26.md` (impeccable, D-A…D-D)
- Owner decisions **D1–D7** in the SPEC's Constraints section.

**Three corrections this plan makes to the input documents** — see `## Contradictions Found` at the
bottom. Two are SPEC tests-at-risk rows that will NOT in fact change, one is a factual claim in the
PLAN brief about the repo's test tiers. None of them touches a settled decision.

---

## Goals

- A payroll run, a payroll period, a timesheet and the attendance "Save as timesheet" button all
  accept a range that crosses one calendar-month boundary.
- The fraction of a month is the **sum of per-month slices** (D4); the three standard shapes
  short-circuit ahead of it and stay exactly 0.5 / 0.5 / 1.
- A range whose summed fraction exceeds 1.0 is **refused at the service gate** (D5). Never clamped,
  never a day cap, and the fraction function itself stays **non-throwing**.
- The cutoff refusal becomes **total** for any org with an active FIRST or SECOND allocation, by
  inspecting the designated window of **every** month the range touches (D1). This closes a live
  hole, not just a strictness question.
- Old rows keep working: at or under the cap they day-count, over the cap they keep the historical
  flat 0.5 and are never turned into 1 (D6).
- One serialisation key per organisation, one per employee (D3).

## Non-Goals

Everything in the SPEC's Out Of Scope section. In particular: no change to the #170/#171 compensation
segment machinery, no move of the `firstDayOfMonth(start)` statutory anchor (D2), no day cap, no
clamp, no client-side cutoff check, no visual restyle, no backfill or migration of any stored run.

## Context Loaded

- `process/context/all-context.md` (router) → `process/context/tests/all-tests.md` (vitest unit tier
  `tests/unit/**` via `vitest.config.ts`; Playwright e2e against **build + preview** per #287; a
  real-Postgres integration tier `tests/integration/**` via `vitest.integration.config.ts`).
- Feature folder: the three upstream documents above, plus
  `flexible-periods-163_20-08-26/flexible-periods-163_PLAN_20-08-26.md` for plan shape and for the
  `Validate Supplement` decisions S1–S10 that shipped with #163 and must not be undone.
- `CLAUDE.md` — pnpm not npm; no `Co-Authored-By`; `{@const}` placement; **no schema change here**,
  so none of the Prisma enum traps apply.

## Phase Completion Rules

One plan, twelve commits, three logical sections. A commit is **CODE DONE** when its edits are
applied; it is **VERIFIED** only when its own gate is green **and the tree is green**. Every commit
leaves the tree green — that is the acceptance rule for the commit itself.

| Section | Commits | VERIFIED when |
|---|---|---|
| A — Pure math and the guard | C1–C2 | `pnpm test tests/unit/pay-periods.test.ts tests/unit/payroll-standard-period-golden.test.ts tests/unit/payroll-calculator.test.ts tests/unit/payroll-custom-range-cutoff-guard.test.ts` green, the frozen files **unmodified** |
| B — Service gates and locks | C3–C8 | full `pnpm test` green |
| C — UI and scripts | C9–C12 | full `pnpm test` + `pnpm test:e2e` green |
| Whole plan | C1–C12 | all five gate commands green + the Live Verification Checklist (D7) run with the owner |

**Ordering is a security constraint, not a preference.** C2 (the widened cutoff guard) MUST land
before C3 (the first lifted gate). Landing them the other way round ships a window in which a
FIRST-allocation org can create a `20 May → 5 June` run that swallows June's whole 1–15 cutoff
window and pays zero employee statutory. That is research F5 / SPEC AC11, and it is a live money
hole the instant the gate is lifted.

---

## Touchpoints

| File | What changes |
|---|---|
| `src/lib/utils/pay-periods.ts` | **+** `monthsTouched`, `summedMonthShare`, `monthYearLabel`, `customRangeError`; **rewrite** `periodShareOf` (`:153-162`); **delete** `isSameMonthRange` (`:120-136`) and the `Math.min(1, share)` clamp (`:161`); rewrite the doc block `:138-152` |
| `src/lib/server/services/payroll/index.ts` | `payrollRunLockKey` (`:96-98`) loses its date arg; `lockPayrollMonth` (`:104-111`) renamed `lockPayrollRuns` and loses its date arg; doc comment `:82-95` rewritten; `assertCustomRangeClearOfCutoff` (`:206-221`) loops every touched month, message gains `{Month Year}`; `createPayrollRun` gate (`:232-238`) replaced |
| `src/lib/server/services/payroll/periods.ts` | `openPeriod` gate (`:55-61`) replaced; lock call (`:67`) loses its date arg |
| `src/lib/server/services/timesheets.ts` | `timesheetLockKey` (`:144-146`) loses its date arg; doc comment `:135-143` rewritten; `createTimesheet` gate (`:154-161`) replaced; lock call (`:184`) |
| `src/lib/server/services/attendance/index.ts` | **no edit.** `createTimesheetFromAttendance` (`:531-554`) inherits the new rule through its `createTimesheet` call at `:547`. Covered by a new test, not by an assumption |
| `src/lib/server/services/payroll/compensation.ts` | `:114` — comment only: name the D2 limitation at the anchor (AC15) |
| `src/lib/components/ui/PeriodPicker.svelte` | `customError` (`:83-89`) delegates to `customRangeError`; `startMonthEnd`/`startMonthStart` (`:97-116`) **deleted**, replaced by cap-derived bounds; preview copy `:133` |
| `scripts/legacy-nonstandard-runs.ts` | `classifyLegacyRun` (`:35-56`) drops the cross-month early return, gains an over-cap branch; header comment `:1-13` rewritten |
| `tests/unit/pay-periods.test.ts` | `isSameMonthRange` describe (`:102-124`) deleted, its cases re-homed; new cross-month + cap describes. **`:130-145` frozen table untouched** |
| `tests/unit/payroll-custom-range-cutoff-guard.test.ts` | existing same-month cases untouched; new cross-month describes |
| `tests/unit/payroll-period-sanity-gate.test.ts` | the three `CROSS_MONTH` cases invert; `CROSS_MONTH` const removed |
| `tests/unit/timesheet-selfservice.test.ts` | `:190-203` inverts from "no DB call at all" to a successful create |
| `tests/unit/payroll-month-lock-key.test.ts` | rewritten (file name keeps its path; its premise inverts) |
| `tests/unit/payroll-custom-period-statutory-proration.test.ts` | `:90-91` rewritten; new even-split cross-month case |
| `tests/unit/legacy-nonstandard-runs-classify.test.ts` | `:31-36` inverts; new over-cap case |
| `tests/e2e/period-picker-default-cutoff.spec.ts` | `:43-49` and `:65-95` invert |
| **new** `tests/unit/payroll-cross-month-share-cap.test.ts` | AC7, AC8, AC9 |
| **new** `tests/unit/payroll-basic-pay-share-passthrough.test.ts` | AC9 second half |
| **new** `tests/unit/attendance-save-timesheet-cross-month.test.ts` | AC3, research gap 6 |
| **new** `tests/e2e/period-picker-cross-month.spec.ts` | AC20, all three mounts |
| **new, optional** `tests/integration/payroll-run-serialisation.test.ts` | AC17 — see C12 and the contradiction note |

## Public Contracts

- **`isSameMonthRange` is DELETED.** After C3–C9 it has zero production callers. Keeping an exported
  predicate that no longer expresses a rule is exactly the drift the SPEC's four-place duplicated
  copy came from. The SPEC's "may keep existing for other callers" is permission, not a requirement,
  and there are no other callers (verified by grep — see Contradictions, item 3).
- **`periodShareOf(start, end)` signature unchanged; behaviour changes for cross-month input only.**
  Same-month and standard input is byte-identical. It remains **non-throwing** — the picker calls it
  for display and `scripts/legacy-nonstandard-runs.ts` calls it for a read-only scan, and D6 needs
  over-cap legacy rows to keep returning `0.5`.
- **New exports from `pay-periods.ts`:**
  - `monthsTouched(start, end): { year: number; month0: number }[]`
  - `summedMonthShare(start, end): number` — non-throwing; `0` for a reversed range
  - `monthYearLabel(year, month0): string` — e.g. `June 2026`
  - `customRangeError(start, end): string | null` — the **single** source of both refusal strings
- **`payrollRunLockKey(organizationId)`** — arity 2 → 1. **`timesheetLockKey(employeeId)`** — arity
  2 → 1. **`lockPayrollMonth` → `lockPayrollRuns(tx, organizationId)`** — the old name asserts the
  month that is being removed.
- **HTTP:** the 400 `A custom period must start and end in the same month.` is **gone**. A new 400
  carries the size-cap copy. The existing cutoff 400 gains `{Month Year}`. No new status codes.
- **`PeriodPicker` hidden-input contract unchanged** — same two fields, same `startName`/`endName`
  props, same defaults. The `payroll/periods/+page.svelte:75` mount that renames them to
  `start`/`end` (matched at `payroll/periods/+page.server.ts:55`, type-checked by nothing) is
  therefore untouched by construction. A new e2e assertion pins it anyway.
- **`#pp-month`, `#pp-custom-start`, `#pp-custom-end`, `#pp-custom-error`, the four button labels and
  the `aria-live` preview node are byte-frozen** — they are e2e selectors in three specs.
- **No schema change. No migration. No `prisma db push`. No backfill.**

## Blast Radius

8 source files edited (one of them comment-only), 1 script, 9 test files edited, 4 test files added
(+1 optional). Risk class: **money-affecting** (the fraction multiplies basic pay, allowances,
incentives, benefit cost, employer statutory, withholding tax, recurring deductions and loan
amortisation) and **write-path guard** (a refusal is being widened and another removed). No schema,
no auth, no secrets, no role gates.

Second-order: `computePayroll` gates on run **status** only (`payroll/index.ts:300-306`), so every
stored DRAFT/COMPUTED run reaches the rewritten `periodShareOf` on the next Recompute. Under D6 an
over-cap legacy row keeps 0.5, so the only legacy rows that move are ones already moving under
#163's rules. C11's script run is the pre-flight that proves it per database.

## Security Posture

- Every new refusal is a **positive restriction**: "accept only if the summed fraction is at or
  below one month" and "accept only if no touched month's designated cutoff window is overlapped".
  Neither is a negative exclusion list, so a shape nobody thought of is refused by default rather
  than allowed by default. This is the failure mode that produced the F5 hole: the old guard
  enumerated the start month and implicitly allowed everything it did not enumerate.
- **No path skips the gate.** There are exactly four write paths. Three call `customRangeError`
  directly (C3, C4, C5). The fourth, `createTimesheetFromAttendance`, reaches `createTimesheet` at
  `attendance/index.ts:547` and inherits it — asserted by a test (C6), never assumed.
- The cap refusal lives at the **service entry point**, before the transaction and before any write,
  so a refused range writes nothing at all — including no audit row.
- The picker's native `min`/`max` is a convenience, never the guard (design brief D-A/D-C). The
  inline message and the server 400 come from the same function, so a client that is out of date,
  scripted, or simply bypassed still meets the same refusal.

---

# Section A — Pure math and the widened guard

## C1 — `pay-periods.ts`: summed month-slice fraction, the cap message, and the death of the clamp

**Files:** `src/lib/utils/pay-periods.ts`, `tests/unit/pay-periods.test.ts`

### C1.1 Add the month walker

```ts
/**
 * Every calendar month the inclusive range touches, in order. Empty for a reversed range.
 * One walker, two consumers (`summedMonthShare` and the cutoff guard) — month arithmetic
 * written twice is month arithmetic that drifts once.
 */
export function monthsTouched(start: Date, end: Date): { year: number; month0: number }[]
```
Walk from `utcMidnight(start)`'s month to `utcMidnight(end)`'s month inclusive, stepping
`Date.UTC(y, m0 + 1, 1)`. Return `[]` when `end < start`.

### C1.2 Add the fraction

```ts
export function summedMonthShare(start: Date, end: Date): number
```
For each entry from `monthsTouched`, add `periodDays(sliceStart, sliceEnd) / daysInMonth(y, m0)`
where `sliceStart = max(start, first of month)` and `sliceEnd = min(end, last of month)`. Returns
`0` for a reversed range. **Non-throwing, always** (D5 / AC9 / AC18).

For a same-month range this is arithmetically identical to today's `periodDays / daysInMonth` —
same numerator, same divisor. That identity is what keeps `pay-periods.test.ts:147-176` and the
peso goldens still green without editing them.

### C1.3 Rewrite `periodShareOf` — the clamp goes

```ts
export function periodShareOf(start: Date, end: Date): number {
	const kind = describePeriod(start, end).kind
	if (kind === 'WHOLE_MONTH') return 1                       // FROZEN
	if (kind === 'FIRST_HALF' || kind === 'SECOND_HALF') return 0.5 // FROZEN
	const share = summedMonthShare(start, end)
	if (!(share > 0)) return 0.5          // reversed / NaN — legacy rows only
	if (share > SHARE_CAP) return 0.5     // D6: an over-cap LEGACY row keeps its historical flat
	                                      // half-month. Never clamped to 1 — that would silently
	                                      // turn a stored 92-day row into a full month's pay.
	return share
}
```
`Math.min(1, share)` at `:161` is **deleted**. It is dead today (research F2) and under cross-month
it would silently cap instead of erroring — and `earnings.ts:71` multiplies basic pay by the share
with no second clamp anywhere downstream (research F2), so a silent cap is an underpayment. A NEW
range can never reach this function above the cap, because C3–C5 refuse it first.

The three standard short-circuits stay physically **above** the day counting (D4). Do not reorder
them, do not merge them into the sum, do not "simplify".

### C1.4 The cap constant and the float-dust note

```ts
// The cap is one month of pay. `26 Dec → 25 Jan` is 6/31 + 25/31, which in IEEE-754 lands within
// ~2e-16 of 1 and must be ACCEPTED (SPEC AC7 calls the boundary out by name). The tolerance is
// nine orders of magnitude below the smallest real difference this function can produce (1/31).
const SHARE_CAP = 1 + 1e-9
```
Module-private, one constant, used by `periodShareOf` and `customRangeError`. It is not exported
and not configurable — nobody asked for a configurable cap and a second value would be a second
truth. A share of `1.0000000000000002` is returned unmodified rather than clamped: that is 2e-16 of
a peso, and clamping it is exactly the behaviour D5 forbids.

### C1.5 Add `monthYearLabel` and `customRangeError`

```ts
/** e.g. "June 2026" — the month the cutoff refusal must name once two months are in play. */
export function monthYearLabel(year: number, month0: number): string

/**
 * The refusal for a custom range, or null when it is acceptable. NON-THROWING by contract: the
 * PeriodPicker calls it for its inline message and cannot call SvelteKit's `error()`. The three
 * service gates wrap it in `error(400, …)`. One function, so the browser copy and the 400 body
 * are the same string by construction — before this, both strings were duplicated verbatim across
 * four files with nothing checking they agreed (research F7).
 */
export function customRangeError(start: Date, end: Date): string | null
```
Body, in order:
1. `if (utcMidnight(end) < utcMidnight(start)) return 'End date must be on or after the start date.'`
2. `const share = summedMonthShare(start, end)`
3. `if (share > SHARE_CAP) return` the size-cap copy with `${Math.round(share * 100)}`
4. `return null`

Exact copy, from the SPEC's Error Copy section, byte for byte:
> `A custom period cannot cover more than one month of pay. This range covers {percent}% of a month. Shorten it.`

`Math.round(1.0968 * 100)` is `110`, which is the SPEC's own worked example for 1 Feb → 3 Mar.

### C1.6 Rewrite the `periodShareOf` doc block (`:138-152`)

It currently states "A custom same-month range (#163) prorates by inclusive day count ÷ days in the
month" and "the day-count branch is clamped to (0, 1]". Both become false. Rewrite — do not trim —
naming: the frozen shapes, the summed slices, the cap living at the service gate and NOT here, and
why over-cap legacy rows keep 0.5 rather than being clamped.

### C1.7 Tests (all Fully-Automated, `tests/unit/pay-periods.test.ts`)

Do **not** touch `:130-145` (the frozen 0.5/0.5/1 table across 28/29/30/31-day months). It is the
regression rail. If it goes red, stop: something reordered the short-circuits.

New `describe('summedMonthShare')`:
- `26 Dec 2026 → 10 Jan 2027` is `6/31 + 10/31` (AC5)
- `20 May → 5 Jun 2026` is `12/31 + 5/30` = 0.55376… (AC5)
- `26 Dec 2026 → 25 Jan 2027` is within `1e-9` of exactly 1 (AC7 boundary)
- `1 Feb → 3 Mar 2026` is `28/28 + 3/31` ≈ 1.0968 — 31 days long and over the cap (AC7)
- `31 Jan → 1 Mar 2026` is `1/31 + 28/28 + 1/31` ≈ 1.0645 (AC8)
- a reversed range returns `0`
- for every same-month range in May 2026, `summedMonthShare` equals `periodDays / 31` — the
  identity that keeps the goldens still

New `describe('customRangeError')`:
- returns `null` for the standard shapes and for a valid cross-month range
- returns the reversed string for `21 May → 13 May`, checked **before** the cap (a reversed range
  has share 0 and would otherwise fall through as acceptable)
- returns the size-cap string with `110` for `1 Feb → 3 Mar 2026` — assert the **whole string**,
  not a substring, so a copy drift fails here rather than in a browser

Extend `describe('periodShareOf')`:
- a valid cross-month range now returns the summed fraction, not 0.5
- the existing adversarial legacy block at `:178-192` stays **unchanged and still green** — all five
  of its rows are reversed or over the cap and so still return 0.5 under D6. See Contradictions
  item 1: the SPEC expected this block to invert, and it does not.

Delete nothing from this file in C1. The `isSameMonthRange` describe (`:102-124`) dies in C8, after
its last caller.

**Gate:** `pnpm test tests/unit/pay-periods.test.ts tests/unit/payroll-standard-period-golden.test.ts tests/unit/payroll-calculator.test.ts tests/unit/payroll-custom-period-statutory-proration.test.ts`
— the last three must pass **without being edited**.

---

## C2 — The cutoff guard inspects every month the range touches (closes the F5 hole)

**Files:** `src/lib/server/services/payroll/index.ts`,
`tests/unit/payroll-custom-range-cutoff-guard.test.ts`

**This commit lands before any gate is lifted.** On its own it changes nothing a user can reach —
cross-month ranges are still refused by C3–C5's predecessor — so it is a safe, independently
committable, fully testable hardening step. That is the point: the hole is closed before the door
is opened.

### C2.1 Replace the start-month derivation (`:206-221`)

Delete:
```ts
const key = manilaDayKey(periodStart)
const year = Number(key.slice(0, 4))
const month0 = Number(key.slice(5, 7)) - 1
```
Replace the single loop with a nested one over `monthsTouched(new Date(manilaDayKey(periodStart)),
new Date(manilaDayKey(periodEnd)))` × `allocations`. Stay on the Manila calendar — the same
calendar `rangesOverlapInManila` decides on. `new Date('2026-05-20')` parses to UTC midnight, which
is the convention `monthsTouched` works in and the same idiom `createTimesheetFromAttendance` already
uses at `attendance/index.ts:548-549`.

Message gains the month, exactly as the SPEC's Error Copy section states:
> `A custom period cannot overlap the {label} cutoff of {Month Year}, because that run collects the whole month's employee statutory share for some employees. Use a range outside it, or run the standard {standard} period.`

`{Month Year}` is `monthYearLabel(year, month0)` **of the window that clashed**, not of the range
start. That distinction is the whole user-facing value of this commit: with two months in play, the
month name is the only way an HR admin can tell which one blocked them.

`{label}` still reads `1–15` or `16–{last day}` and `{last day}` comes from that window's own
`periodEnd.getUTCDate()` — so a February window says `16–28`, not `16–31`.

### C2.2 Rewrite the guard's doc comment (`:174-183`)

It currently claims a custom range can never reach a cutoff run's days. That claim was false for a
FIRST-only org even before this change. Rewrite it to state what is now true: every month the range
touches is inspected, a cross-month range always covers month one's 16–EOM window and month two's
1–15 window, and therefore any org with an active FIRST or SECOND allocation is refused every
cross-month range (D1, AC12). Name the consequence for `resolveEE`'s ZERO at
`calculator.ts:158-169`, which depends on this guard being total.

### C2.3 Tests — mock discipline (Fully-Automated)

`tests/unit/payroll-custom-range-cutoff-guard.test.ts` already mocks
`employeeStatutoryConfig.findMany` with a **real predicate over an in-memory row set** applying the
exact `where` + `distinct` (`:50-64`). Keep that. Do **not** replace it with a blanket
`mockResolvedValue` — this repo has been burned by exactly that: a mock that ignores the `where`
clause cannot fail on a wrong filter, and a mock that returns the same value for every input passes
regardless of the code under test.

The guard derives months in code, not in the query, so the mock cannot discriminate on the month.
**The assertions must.** Every new case has to be one the old start-month-only code gets wrong:

- **`describe('cross-month, FIRST-only org')`** — `20 May → 5 Jun 2026` REFUSED, and the message
  contains `June 2026`, not `May 2026`. **Under the old code this passes through silently.** This
  single case is the regression rail for the whole F5 hole (AC11).
- same org, `28 Apr → 3 May 2026` REFUSED naming `May 2026` (AC11).
- **`describe('cross-month, SECOND-only org')`** — `20 May → 5 Jun 2026` REFUSED naming `May 2026`
  (it is month one's 16–31 window that clashes first). Asserting the month here proves the loop
  reports the *clashing* window and not merely the first month in the list.
- **`describe('exhaustive cross-month sweep')`** (AC12) — for start day 1…28 of May 2026 and end day
  1…5 of June 2026, assert refusal for a FIRST-only org, a SECOND-only org, and an org with both.
  No shape passes. Assert the count of refusals equals the count of cases, so a swallowed rejection
  cannot read as a pass.
- **`describe('all-EVEN org')`** — `20 May → 5 Jun 2026` is allowed; `findMany` was still called
  with the right org id (the existing predicate mock proves the scoping) (AC13).
- **existing same-month cases at `:84`, `:117`, `:122`, `:133`, `:154` are re-run untouched** (AC14).

Positive control for the sweep: the same FIRST-only org must still accept its standard `1–15 June`
period, proving the sweep is not refusing everything for an unrelated reason.

**Gate:** `pnpm test tests/unit/payroll-custom-range-cutoff-guard.test.ts` — new cases green,
existing cases green **unmodified**.

---

# Section B — Service gates, the attendance path, and the locks

## C3 — `createPayrollRun`: the size cap replaces the same-month rule

**Files:** `src/lib/server/services/payroll/index.ts`,
`tests/unit/payroll-period-sanity-gate.test.ts`

Replace `:232-238`:
```ts
	const invalid = customRangeError(periodStart, periodEnd)
	if (invalid) error(400, invalid)
```
Two lines replace seven, and they delete the third copy of the reversed-range literal and the third
copy of the same-month literal. The comment above them is rewritten to say what is now true: the
gate stops a reversed range and a range that would pay more than one month, and it runs before the
transaction so a refusal writes nothing — not even an audit row.

Order inside the transaction is unchanged: `lock → findUnique 409 → assertNoOverlappingRun →
assertCustomRangeClearOfCutoff → create`. Do not reorder; S1 of the #163 validate supplement
explains why the `findUnique` 409 sits ahead of the overlap guard.

**Tests** (Fully-Automated): in `payroll-period-sanity-gate.test.ts`, the `createPayrollRun` describe's
cross-month case (`:113-119`) inverts — `20 May → 5 Jun` now **creates** for the all-EVEN mock org
(`employeeStatutoryConfig.findMany` already resolves `[]` in this file's `beforeEach`). Add a case
asserting an over-cap range (`1 Feb → 3 Mar 2026`) is refused with the exact size-cap string and
`payrollRun.create` was **not** called. The reversed case (`:106-112`) is re-run unchanged (AC4).
Leave the `openPeriod` and `createTimesheet` describes alone — they invert in C4 and C5. Keep the
`CROSS_MONTH` const until C5 removes its last use.

**Gate:** `pnpm test tests/unit/payroll-period-sanity-gate.test.ts`

## C4 — `openPeriod`: same replacement

**Files:** `src/lib/server/services/payroll/periods.ts`, `tests/unit/payroll-period-sanity-gate.test.ts`

Identical two-line replacement at `:55-61`. This covers both the form action
(`payroll/periods/+page.server.ts:55`) and the v1 API twin
(`routes/api/v1/payroll/periods/+server.ts:49`) — one service, two callers, no second gate to keep in
sync (AC2).

**Tests:** the `openPeriod` describe's cross-month case inverts; add the over-cap refusal case
asserting `$transaction` was not called. Add a new unit file only if the API twin needs its own
proof — it does not; it has no logic of its own. Skip it (SPEC names a
`payroll-period-cross-month-open` file; the coverage belongs in the existing sanity-gate file and a
second file would duplicate its 40-line mock. Recorded as a deliberate deviation).

**Gate:** `pnpm test tests/unit/payroll-period-sanity-gate.test.ts`

## C5 — `createTimesheet`: same replacement

**Files:** `src/lib/server/services/timesheets.ts`, `tests/unit/payroll-period-sanity-gate.test.ts`,
`tests/unit/timesheet-selfservice.test.ts`

Identical two-line replacement at `:154-161`. The overlap guard below it is Manila-day based and
month-agnostic (research F1b), so it needs no change.

**Tests:**
- sanity-gate file: the `createTimesheet` describe's cross-month case inverts; over-cap case added;
  the now-unused `CROSS_MONTH` const is deleted here.
- `timesheet-selfservice.test.ts:190-203`: the test named `rejects a cross-month period before
  touching the DB` inverts. Rename it, drop the three `not.toHaveBeenCalled` assertions, and assert
  `timesheet.create` **was** called once. The reversed case immediately below it stays untouched as
  the positive control that the gate still exists at all.

**Gate:** `pnpm test tests/unit/payroll-period-sanity-gate.test.ts tests/unit/timesheet-selfservice.test.ts`

## C6 — Prove the attendance path inherits the gate (no source change)

**Files:** **new** `tests/unit/attendance-save-timesheet-cross-month.test.ts`

`createTimesheetFromAttendance` (`attendance/index.ts:531-554`) has no gate of its own. It calls
`createTimesheet` at `:547` and therefore silently changed in C5. Research gap 6: **nothing today
proves it inherits the period gate.** Do not add a gate to it — adding one would be a second truth
that can drift. Add the missing proof instead.

New unit test, real `createTimesheetFromAttendance` against a db mock:
- a cross-month attendance range (`26 Dec 2026 → 10 Jan 2027`) with entries **creates** a timesheet,
  with `periodStart`/`periodEnd` equal to the Manila day keys of the range bounds (AC3)
- an **over-cap** range (`1 Feb → 3 Mar 2026`) is refused with the exact size-cap string, and
  `timesheet.create` was not called — this is the assertion that proves inheritance rather than
  coincidence, because nothing in the attendance file mentions a cap
- the existing `No attendance in this range to save as a timesheet.` 400 still fires first for an
  empty range

Mock discipline: `employee.findFirst` must discriminate on `{ id, organizationId }` and return
`null` for a wrong org, with an assertion that a wrong-org call gets 404. A blanket resolve here
would make the whole file unable to fail.

**Gate:** `pnpm test tests/unit/attendance-save-timesheet-cross-month.test.ts`

## C7 — One lock per organisation, one per employee (D3)

**Files:** `src/lib/server/services/payroll/index.ts`, `src/lib/server/services/payroll/periods.ts`,
`src/lib/server/services/timesheets.ts`, `tests/unit/payroll-month-lock-key.test.ts`

- `payrollRunLockKey(organizationId: string): string` → `` `payroll-run:${organizationId}` ``.
  The `periodStart` parameter is deleted, not ignored.
- `lockPayrollMonth` → **`lockPayrollRuns(tx, organizationId)`**. The old name asserts the very
  thing being removed; renaming is one edit across three lines and prevents a comment-free lie.
- Call sites: `payroll/index.ts:245`, `payroll/periods.ts:67` (and its import at `periods.ts:9`).
- `timesheetLockKey(employeeId: string): string` → `` `timesheet:${employeeId}` ``; call site
  `timesheets.ts:184`.
- The in-repo precedent is `backupLockKey` at `server/backup/plan.ts:35`
  (`` `document-backup:${organizationId}` ``) — a one-arg per-org key. Match its shape exactly; do
  not invent a third convention.
- `scripts/backup-documents.ts:150` cross-references the two payroll locks in a comment — check and
  update it if it names the month.

**Doc comments must be rewritten, not trimmed.** `payroll/index.ts:82-95` and `timesheets.ts:135-143`
both **argue for** the month component and both cite `isSameMonthRange` by name. The replacement
states: one key per organisation (per employee for timesheets), because a range may now touch two
months and two overlapping ranges either side of a boundary must take the same lock or they
serialise against nothing. Keep the transaction-scoped note (Postgres releases on commit or
rollback, nothing to leak) — that is still true and still worth having.

**Tests** — `tests/unit/payroll-month-lock-key.test.ts`, modelled on
`tests/unit/backup-plan.test.ts:110-121`:
- same org → same key, for two dates in **different months** (this is the `:30-34` case inverting)
- different org → different key (survives unchanged)
- different employee → different key (survives unchanged)
- **arity**: `expect(payrollRunLockKey.length).toBe(1)` and `expect(timesheetLockKey.length).toBe(1)`
  — copied from `backup-plan.test.ts:117`. This is what makes a re-added date argument fail loudly
  instead of being silently ignored.
- the two PHT-boundary bucketing cases (`:44-48`, `:70-73`) are **deleted** — with no date in the
  key there is nothing to bucket. Deleting them is correct; leaving them as trivially-true
  assertions would be a test that cannot fail.
- the file's doc block is rewritten; its premise inverts entirely.

The file keeps its path. Renaming it would churn no behaviour and lose its git history; a note at
the top explains that "month" in the filename is now historical.

**Gate:** `pnpm test tests/unit/payroll-month-lock-key.test.ts tests/unit/backup-plan.test.ts`

## C8 — Delete `isSameMonthRange` and re-home its tests

**Files:** `src/lib/utils/pay-periods.ts`,
`src/lib/server/services/payroll/index.ts` (import), `timesheets.ts` (import),
`periods.ts` (import), `tests/unit/pay-periods.test.ts`,
`tests/unit/payroll-custom-period-statutory-proration.test.ts`

By this point the function has zero production callers (the picker's last use dies in C9 —
**run C8 after C9 if you prefer strictly-green intermediate states; the recommended order is to do
C9 first and C8 last in this section**. As written, C8 removes the server imports and C9 removes the
picker import; do C9 immediately before C8 and the tree is green at both points).

Delete the function (`:120-136`) and its doc block. Deletion is the point: an exported predicate
that no longer expresses any rule is precisely how the four-place duplicated copy in F7 came to
exist.

- `pay-periods.test.ts:102-124`: delete the `isSameMonthRange` describe. Two of its cases carry real
  value and move to the `customRangeError` describe from C1.7: a reversed range is refused, and
  `1 May 2026 → 1 May 2027` (same month number, different year) is refused — by the **cap**, at
  1200% of a month, which is the SPEC's own reading of that row.
- `payroll-custom-period-statutory-proration.test.ts:90-91`: rewrite. `1 May → 14 Jun 2026` is
  `31/31 + 14/30` = 1.4667, so it is refused by the cap and `periodShareOf` still returns 0.5 for it
  as a legacy row. Assert both: `customRangeError(...)` is the size-cap string, and
  `periodShareOf(...)` is still `0.5`. The test's intent survives; only the mechanism changes.
  Add the AC13 case: an all-EVEN org's valid cross-month range prorates employee statutory by the
  **summed** fraction (`20 May → 5 Jun` → `12/31 + 5/30`), not by 0.5.

**Gate:** `pnpm test` (full suite) — this is the first commit where the whole suite must be green.

---

# Section C — UI, scripts, and the documented limitation

## C9 — `PeriodPicker.svelte`: retarget the native bound at the cap (design brief D-A…D-D)

**File:** `src/lib/components/ui/PeriodPicker.svelte`

Run the mechanical detector after the edit, before anything else:
```
node /home/hyuse/.claude/skills/impeccable/scripts/detect.mjs --json src/lib/components/ui/PeriodPicker.svelte
```

### C9.1 The inline message becomes one call

Replace `customError` (`:83-89`) with `customRangeError(customRange.s, customRange.e)`. This deletes
the fourth and last duplicated copy of both literals (F7 layer 2). Update the comment above it: the
inline message and the 400 are now literally the same function, not merely the same wording.

### C9.2 Delete `startMonthEnd` / `startMonthStart`, derive the bound from the cap

Both helpers (`:97-116`) go. They hard-code the one-month rule into the browser calendar (F3h) and
that rule no longer exists. Replace with a bound derived from the **same** function the server
refuses with (design brief D-B — a second, hand-rolled date rule in the browser is the exact
divergence the component's own comment at `:80-82` exists to prevent):

```ts
	// ponytail: linear probe, ceiling ~40 iterations per keystroke. The cap is one month of pay,
	// so no acceptable range can be longer than 31 days and the loop always breaks early. Upgrade
	// path if it ever gets hot: a closed-form bound from daysInMonth, which would be a second
	// expression of the cap rule and is exactly what D-B says not to write until it is needed.
	const capBoundEnd = $derived.by(() => { … walk forward from customStart while
		customRangeError(s, candidate) === null … })
```
- end input: `min={customStart || undefined}` (unchanged), `max={capBoundEnd}`
- start input: `max={customEnd || undefined}` (unchanged), `min=` the same walk read backwards from
  a filled end date

Both walks call `customRangeError`. Neither re-derives a month.

**No client-side cutoff check** (D-C). The picker does not have the organisation's allocation rows
and must not fetch them; a guess that greys out a legal day is worse than a refusal that explains
itself.

### C9.3 Preview copy

`:133` — `prorated to ${share}% of the month` → `of a month`. "the month" was written when only one
month could exist.

### C9.4 Nothing else moves

No new component, no new prop, no layout change, no field-name change. The `w-40` inputs, the
`aria-invalid` / `aria-describedby` wiring, the single `text-destructive` line with id
`pp-custom-error`, and the `aria-live="polite"` preview all stay exactly as they are. The
`payroll/periods/+page.svelte:75` mount overrides `startName`/`endName` and nothing type-checks that
agreement — it is safe here only because no field name changes. Do not change one.

**Gate:** `pnpm check` and `pnpm lint`. Behaviour is proven in C10.

## C10 — E2E: both existing specs invert, one new spec added

**Files:** `tests/e2e/period-picker-default-cutoff.spec.ts`, **new**
`tests/e2e/period-picker-cross-month.spec.ts`

E2E runs against **build + preview** (#287), not `vite dev`. `pnpm check` kills a running dev
server — do not run them concurrently.

`period-picker-default-cutoff.spec.ts`:
- `:43-49` — after filling `2026-07-05` against a June start, assert `#pp-custom-error` has count
  **0**. A 26-day two-month range is `28/30 + 5/31` = 1.09… — wait, that is **over** the cap.
  Use the SPEC's own reading: the assertion is that the *same-month* message is gone. Fill
  `2026-06-20` → `2026-07-05` (`11/30 + 5/31` = 0.528, under the cap) and assert no error. Then fill
  a genuinely over-cap range and assert the **size-cap** string. Two assertions replace one, and the
  second one is the new rail.
- `:65-95` — the `min`/`max` block inverts. A `2026-06-03` start now yields an end `max` inside
  **July**, not `2026-06-30`. Assert the exact computed bound rather than "some July date", so an
  off-by-one in the walk fails here. Keep the "with nothing picked, neither input constrains the
  other" assertions unchanged, and keep the February case — it now proves the bound still respects
  a 28-day month through the shared function.
- The first test in the file (the default-cutoff / `Custom range` unselected spec) is **untouched**.

New `period-picker-cross-month.spec.ts` (AC20), read-only where it can be, covering **all three
mounts**:
1. `/payroll` (`payroll/+page.svelte:79`, default field names) — pick `26 Dec 2026 → 10 Jan 2027`,
   assert no inline error and the preview reads `…prorated to 52% of a month`.
2. `/payroll/periods` (`payroll/periods/+page.svelte:75`, **renamed to `start`/`end`**) — assert the
   two hidden inputs are named `start` and `end` and carry the two real dates. This is the only
   automated thing that will ever notice if the third mount breaks; nothing type-checks it.
3. `/timesheets` `NewTimesheetDialog.svelte:128` (default names) — same range, no error.

**Gate:** `pnpm build && pnpm test:e2e`

## C11 — The legacy scan script tells the truth about cross-month rows (D6)

**Files:** `scripts/legacy-nonstandard-runs.ts`, `tests/unit/legacy-nonstandard-runs-classify.test.ts`

`classifyLegacyRun` (`:35-56`): delete the `!isSameMonthRange` early return at `:45-47`. New order:

1. standard shape → frozen (unchanged)
2. reversed → `'reversed range — keeps the historical flat 0.5'` (unchanged)
3. **new:** `summedMonthShare(start, end) > 1` → `'over the one-month cap — keeps the historical flat 0.5'`
4. `newShare === 0.5` → unchanged wording
5. otherwise `{ moves: true, oldShare: 0.5, newShare }`

A cross-month row under the cap now correctly reports **old share vs new share** and lands in the
WILL MOVE list, which is the whole point of the operator running it before a recompute. The header
comment `:1-13` currently states cross-month rows are unaffected; rewrite it.

**Tests** (Fully-Automated):
- `:31-36` inverts: `20 May → 5 Jun 2026` now reports `{ moves: true, oldShare: 0.5, newShare: 12/31 + 5/30 }`
- **new** over-cap case: `1 May → 14 Jun 2026` reports `moves: false` with the over-cap reason
- the reversed, coincidental-0.5 and standard cases are re-run unchanged as the rails

**Also a Hybrid gate (AC19):** the script must be run once against every real database per its own
instruction at `:12-13` — `pnpm dotenv -e .env.dev -- tsx scripts/legacy-nonstandard-runs.ts`.
Research records it has **never been run**. It is read-only. Owner sees the WILL MOVE list before
anything recomputes. Scheduled in the Live Verification Checklist, item 8.

**Gate:** `pnpm test tests/unit/legacy-nonstandard-runs-classify.test.ts`

## C12 — Write the D2 limitation down where a maintainer will hit it (AC15)

**Files:** `src/lib/server/services/payroll/compensation.ts` (comment only),
**new** `tests/unit/payroll-basic-pay-share-passthrough.test.ts`

`compensation.ts:114` (`const statutoryBasis = compOn(firstDayOfMonth(start))`) — **do not move it.**
Add a comment naming the accepted limitation: for a cross-month period the statutory bracket basis
comes from the first day of month ONE, so a pay change effective in month two does not move the
employee's SSS / PhilHealth / Pag-IBIG bracket for that period. Their basic pay is still correct.
Point at the SPEC. The #170/#171 parity suites — `payroll-mid-period`, `compensation-resolver`,
`payroll-statutory-basis`, `compensation-heal`, `employee-api-compensation` — are the detector: if
any of them goes red, the anchor moved and the change is wrong. Re-run them **unmodified**.

New `payroll-basic-pay-share-passthrough.test.ts` (AC9, closing the research gap that nothing feeds
`earnings.ts:71` a share above 1):
- `computeEmployeeResult` with `periodShare: 1.5` on a FIXED-salary employee returns basic pay of
  `salary × 1.5` — **unclamped**. This documents, in an executable form, why the refusal must live
  at creation: nothing downstream will save you.
- the same call with `periodShare: 0.55376…` returns `salary × 0.55376…`
- pair it with an assertion that `createPayrollRun` refuses the range that would have produced 1.5,
  so the two halves of AC9 are provably joined.

**Gate:** `pnpm test tests/unit/payroll-basic-pay-share-passthrough.test.ts tests/unit/payroll-mid-period.test.ts tests/unit/compensation-resolver.test.ts tests/unit/payroll-statutory-basis.test.ts tests/unit/compensation-heal.test.ts tests/unit/employee-api-compensation.test.ts`

## C13 (OPTIONAL — decide before starting Section C) — Automate the serialisation probe

**File:** **new** `tests/integration/payroll-run-serialisation.test.ts`

The PLAN brief states no real-Postgres concurrency tier exists in this repo. **That is not correct**
— see Contradictions item 3. `tests/integration/**` runs a real `PrismaClient` against
`veent-db-5434` via `pnpm test:integration`, with `fileParallelism: false` and an org-fixture
harness at `tests/integration/audit-tx-harness.ts`. Two clients, two concurrent
`createPayrollRun` calls for **different but overlapping** ranges, assert exactly one run exists and
the loser got the 409 overlap message. Negative control: the same test with the advisory lock
removed must fail — otherwise it proves nothing.

This is offered, not assumed. AC17 is written as Agent-Probe / Known-Gap and D7 puts live
verification at the end with the owner. **Recommendation: build it.** It is roughly 60 lines against
an existing harness, and without it the ONLY proof the lock works is a one-off manual probe that
nobody will re-run when the key shape changes again. If the owner declines, the live probe in the
checklist stands and the gap is recorded below.

**Gate:** `pnpm test:integration` (requires the DB container — the user starts it).

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `payroll-period-sanity-gate` — cross-month accepted at `createPayrollRun` | Fully-Automated | AC1 |
| `payroll-period-sanity-gate` — cross-month accepted at `openPeriod` (covers form action + v1 API) | Fully-Automated | AC2 |
| `timesheet-selfservice` cross-month create + new `attendance-save-timesheet-cross-month` | Fully-Automated | AC3 |
| `payroll-period-sanity-gate` reversed cases, re-run unchanged at all three entry points | Fully-Automated | AC4 |
| `pay-periods` — new `summedMonthShare` describe (26 Dec–10 Jan, 20 May–5 Jun) | Fully-Automated | AC5 |
| `pay-periods.test.ts:130-145` + `payroll-standard-period-golden.test.ts:43-44` + `payroll-calculator.test.ts:73-79`, **unmodified** | Fully-Automated | AC6 |
| new `payroll-cross-month-share-cap` — 26 Dec→25 Jan accepted (exactly 1.0), 1 Feb→3 Mar refused at 110% | Fully-Automated | AC7 |
| new `payroll-cross-month-share-cap` — 31 Jan→1 Mar (1.0645) refused | Fully-Automated | AC8 |
| new `payroll-basic-pay-share-passthrough` (unclamped `salary × share`) + refusal-before-write assertion | Fully-Automated | AC9 |
| `payroll-custom-range-cutoff-guard` — every touched month inspected | Fully-Automated | AC10 |
| `payroll-custom-range-cutoff-guard` — FIRST-only org, 20 May→5 Jun REFUSED naming **June 2026**; 28 Apr→3 May REFUSED naming **May 2026** | Fully-Automated | AC11 |
| `payroll-custom-range-cutoff-guard` — exhaustive cross-month sweep × FIRST / SECOND / both | Fully-Automated | AC12 |
| `payroll-custom-period-statutory-proration` — all-EVEN org, cross-month, summed fraction | Fully-Automated | AC13 |
| `payroll-custom-range-cutoff-guard` existing same-month cases `:84,:117,:122,:133,:154`, **unmodified** | Fully-Automated | AC14 |
| `payroll-statutory-basis`, `payroll-mid-period`, `compensation-resolver`, `compensation-heal`, `employee-api-compensation` — all **unmodified** | Fully-Automated | AC15 |
| `payroll-month-lock-key` rewritten — same org/different months = same key; arity 1 on both helpers | Fully-Automated | AC16 |
| Two-connection serialisation probe against `veent-db-5434`, with the lock-removed negative control | Agent-Probe (Known-Gap for automation as written) — **or Hybrid if C13 is built** | AC17 |
| new `pay-periods-legacy-cross-month` cases in `pay-periods` — under cap day-counts, over cap keeps 0.5, reversed keeps 0.5 | Fully-Automated | AC18 |
| `legacy-nonstandard-runs-classify` old-vs-new share reporting | Fully-Automated | AC19 |
| `scripts/legacy-nonstandard-runs.ts` run against every real database | Hybrid | AC19 |
| `period-picker-default-cutoff.spec.ts` (both tests invert) + new `period-picker-cross-month.spec.ts` across all three mounts | Hybrid (build + preview) | AC20 |

### Test tier summary

- **Fully-Automated (vitest, `pnpm test`)** — all of Section A and B, C11's unit half, C12's unit
  half. 19 of the 20 acceptance criteria have at least one fully-automated gate.
- **Hybrid** — the two e2e specs (need `pnpm build` + preview per #287); the legacy scan script run
  (needs each real database); C13 if built (needs `veent-db-5434` up).
- **Agent-Probe / Known-Gap** — AC17's serialisation probe **as currently scoped**. It is a
  known-gap for automation only in the sense that nobody has written it; the tier to write it in
  exists. Recorded as a backlog item below regardless of the C13 decision, so the residual is never
  silently dropped.
- **No developed behaviour in this plan is left with Known-Gap as its only proof.** AC17's gate stays
  CONDITIONAL until either C13 lands or the live probe is signed off by the owner.

### Mock discipline — the standing trap in this repo

Three of the test files this plan touches mock Prisma. Every one of them must **discriminate on the
arguments**:

- `payroll-custom-range-cutoff-guard.test.ts` already runs a real predicate over an in-memory row
  set applying the exact `where` + `distinct` (`:50-64`). **Keep it.** A `mockResolvedValue` here
  cannot fail on a missing `organizationId` filter, a missing `employmentStatus: 'ACTIVE'` filter,
  or a missing `allocation: { not: 'EVEN' }` filter — and the guard's whole job is those three
  filters plus the month loop.
- Because the guard derives months in code rather than in the query, the mock **cannot** discriminate
  on the month. The assertions carry that load instead: every new case is one the old start-month
  code gets wrong, and each asserts the **month name in the message**, not just that something
  threw.
- `attendance-save-timesheet-cross-month.test.ts`: `employee.findFirst` must return `null` for a
  wrong org, with a 404 assertion proving it.
- Blanket `mockResolvedValue` anywhere in the new files is a review blocker. A mock that returns the
  same value for every input makes the test pass regardless of the code under test.

---

## What This Change Lets Us DELETE

Deletion is the measure of this plan. Net source lines should go **down** outside the new tests.

| Deleted | Where | Why it can go |
|---|---|---|
| `isSameMonthRange` (17 lines incl. doc) | `pay-periods.ts:120-136` | Zero callers after C3–C5 and C9 |
| `Math.min(1, share)` | `pay-periods.ts:161` | Dead today; under cross-month it would silently cap and underpay |
| `!isSameMonthRange(...) return 0.5` branch | `pay-periods.ts:157` | Subsumed by the over-cap branch, which is truer |
| The same-month 400, ×3 | `payroll/index.ts:236-238`, `timesheets.ts:159-161`, `periods.ts:59-61` | The rule is gone |
| The reversed-range literal, ×4 | the three services + `PeriodPicker.svelte:85` | One `customRangeError` now owns both strings |
| The same-month literal, ×4 | same four files | Same |
| `startMonthEnd` + `startMonthStart` (20 lines) | `PeriodPicker.svelte:97-116` | The hard-coded one-month calendar rule |
| The month component of two lock keys | `payroll/index.ts:98`, `timesheets.ts:145` | D3 |
| The `periodStart` parameter, ×3 | `payrollRunLockKey`, `lockPayrollMonth`, `timesheetLockKey` | D3 |
| The start-month derivation (3 lines) | `payroll/index.ts:206-208` | Replaced by `monthsTouched` |
| The cross-month early return | `scripts/legacy-nonstandard-runs.ts:45-47` | D6 |
| Two PHT-bucketing tests | `payroll-month-lock-key.test.ts:44-48,:70-73` | Nothing left to bucket; they would become tests that cannot fail |

Two `// ponytail:` shortcuts are deliberate and marked in code: the picker's linear cap-bound walk
(C9.2) and, if C13 is skipped, the manual serialisation probe.

---

## Gate Commands (pnpm, never npm — CI runs format FIRST and skips the rest on failure)

```bash
pnpm format:check          # CI runs this first; a green `pnpm check` proves nothing about CI
pnpm lint
pnpm check                 # kills a running dev server — never run alongside e2e
pnpm test                  # full vitest unit tier
pnpm build && pnpm test:e2e
pnpm test:integration      # only if C13 is built; needs veent-db-5434 up
```

Run **all** of them before opening the PR. The repo's own memory: `pnpm check` green proves nothing
about CI, because CI runs `format:check` first and stops there.

## Rollback

Every commit is independently revertable and the branch has no schema change, no migration and no
data backfill, so `git revert` is the whole rollback story. The two ordering constraints:

- Reverting **C2 alone** while C3–C5 are still in re-opens the F5 hole. Revert C3–C5 first, or
  revert the whole branch.
- Reverting **C1 alone** while C3–C5 are in leaves the services calling a function that no longer
  exists — a build failure, not a silent one. Acceptable.

Stored rows are unaffected either way: nothing is written differently, only accepted differently.

## Live Verification Checklist (owner present, end of build — D7)

Verbatim from the SPEC, in order. Item 1 first, because it is a measurement nobody has taken.

1. Against **each** real database:
   `SELECT allocation, count(*) FROM employee_statutory_config c JOIN employees e ON e.id = c."employeeId" WHERE e."employmentStatus" = 'ACTIVE' GROUP BY allocation;`
2. Create a 26 Dec – 10 Jan run in the browser on an even-split org. Confirm it saves, shows the real
   dates and an inclusive day count, and computes.
3. Read one payslip from it. Pick an employee whose salary makes 52% and 50% **visibly different**.
4. Try 1 Feb – 3 Mar. Confirm the refusal names **110%** and that no run was created.
5. Try 26 Dec – 25 Jan. Confirm ACCEPTED — the boundary must not be off by one.
6. On a FIRST-allocation org, try 20 May – 5 Jun. Confirm the refusal names **June**. Negative
   control: the same org must still create its standard 1–15 June run afterwards.
7. Drive "Save as timesheet" on `/attendance` across a month boundary. Confirm it saves.
8. Run `pnpm dotenv -e .env.dev -- tsx scripts/legacy-nonstandard-runs.ts` against every database.
   Confirm the WILL MOVE list before anything recomputes.
9. The two-connection serialisation probe (AC17), unless C13 replaced it.

The user starts the servers and the DB container — never launch `./start.sh`, vite or
`veent-db-5434` unasked. Driving an already-running app is fine.

---

## Implementation Checklist

1. **C0 pre-flight (no commit).** Clean tree. Run all five gate commands and record that they are
   green *before* any edit — a golden captured from post-edit code proves nothing.
2. **C1** `pay-periods.ts`: add `monthsTouched`.
3. **C1** add `summedMonthShare` (non-throwing, `0` for reversed).
4. **C1** add the private `SHARE_CAP = 1 + 1e-9` with the float-dust comment.
5. **C1** rewrite `periodShareOf`: keep the three frozen short-circuits on top, use
   `summedMonthShare`, add the over-cap → `0.5` branch, **delete `Math.min(1, share)`** and the
   `!isSameMonthRange` branch.
6. **C1** add `monthYearLabel` and `customRangeError` (reversed check first, then cap).
7. **C1** rewrite the `periodShareOf` doc block `:138-152`.
8. **C1** `pay-periods.test.ts`: add the `summedMonthShare`, `customRangeError` and cross-month
   `periodShareOf` describes. Do not touch `:130-145`. Commit; gate C1.
9. **C2** `payroll/index.ts`: replace the start-month derivation at `:206-208` with a loop over
   `monthsTouched`, nested with the allocations loop.
10. **C2** add `{Month Year}` to the cutoff message using the **clashing window's** month.
11. **C2** rewrite the guard doc comment `:174-183`.
12. **C2** `payroll-custom-range-cutoff-guard.test.ts`: add the FIRST-only end-month cases, the
    SECOND-only case, the exhaustive sweep with its refusal count, the all-EVEN accept, and the
    standard-period positive control. Keep the predicate mock. Commit; gate C2.
13. **C3** `createPayrollRun`: replace `:232-238` with the two-line `customRangeError` gate; rewrite
    the comment above it.
14. **C3** `payroll-period-sanity-gate.test.ts`: invert the `createPayrollRun` cross-month case; add
    the over-cap refusal case. Commit; gate C3.
15. **C4** `openPeriod`: same replacement at `:55-61`; invert its describe; add the over-cap case.
    Commit; gate C4.
16. **C5** `createTimesheet`: same replacement at `:154-161`; invert its describe; delete the
    `CROSS_MONTH` const; rewrite `timesheet-selfservice.test.ts:190-203`. Commit; gate C5.
17. **C6** add `tests/unit/attendance-save-timesheet-cross-month.test.ts` (accept, over-cap refuse,
    empty-range 400, wrong-org 404). No source edit. Commit; gate C6.
18. **C7** `payrollRunLockKey(organizationId)`; `lockPayrollMonth` → `lockPayrollRuns(tx, orgId)`;
    update `payroll/index.ts:245`, `periods.ts:9,:67`.
19. **C7** `timesheetLockKey(employeeId)`; update `timesheets.ts:184`.
20. **C7** rewrite both doc comments (`payroll/index.ts:82-95`, `timesheets.ts:135-143`); check
    `scripts/backup-documents.ts:150`.
21. **C7** rewrite `payroll-month-lock-key.test.ts`: same-org-different-month = same key, org and
    employee separation, **arity 1 assertions**, delete the two bucketing tests. Commit; gate C7.
22. **C9** `PeriodPicker.svelte`: `customError` → `customRangeError`; delete `startMonthEnd` /
    `startMonthStart`; add the cap-derived `capBoundEnd` and its mirror, with the `// ponytail:`
    comment; preview copy → `of a month`. Run the impeccable detector. Commit; `pnpm check` + `pnpm lint`.
23. **C8** delete `isSameMonthRange` and its imports in three services; delete its describe in
    `pay-periods.test.ts` and re-home the reversed + different-year cases into `customRangeError`;
    rewrite `payroll-custom-period-statutory-proration.test.ts:90-91` and add the AC13 even-split
    cross-month case. Commit; gate = **full `pnpm test`**.
24. **C10** invert `period-picker-default-cutoff.spec.ts:43-49` (under-cap no error + over-cap size
    message) and `:65-95` (bound reaches into the next month, exact value asserted).
25. **C10** add `tests/e2e/period-picker-cross-month.spec.ts` covering `/payroll`,
    `/payroll/periods` (assert the `start`/`end` hidden-input names) and `/timesheets`.
    Commit; gate `pnpm build && pnpm test:e2e`.
26. **C11** `scripts/legacy-nonstandard-runs.ts`: drop the cross-month early return, add the
    over-cap branch, rewrite the header comment; invert
    `legacy-nonstandard-runs-classify.test.ts:31-36` and add the over-cap case. Commit; gate C11.
27. **C12** comment at `compensation.ts:114`; add `payroll-basic-pay-share-passthrough.test.ts`;
    re-run the five #170/#171 parity files **unmodified**. Commit; gate C12.
28. **C13 (optional, decide first)** `tests/integration/payroll-run-serialisation.test.ts` with its
    lock-removed negative control. Commit; gate `pnpm test:integration`.
29. Run all five gate commands. `pnpm format:check` first.
30. Drive the Live Verification Checklist with the owner (D7). Record item 1's counts in the plan's
    resume section — they are the one measurement nobody has taken.
31. Open the PR against `staging`. `Closes #3` will not autoclose on a staging-targeted PR — close
    the issue by hand and name any gaps.

---

## Test Infra Improvement Notes

- **The repo DOES have a real-Postgres tier and this plan is the first payroll work to notice.**
  `tests/integration/**` + `pnpm test:integration` + `tests/integration/audit-tx-harness.ts` already
  give a real `PrismaClient`, an org fixture, cleanup and `fileParallelism: false`. Every payroll
  unit test mocks `$executeRaw`, so the advisory locks have never executed once in CI. C13 is the
  cheapest possible fix. If C13 is skipped, file a backlog stub:
  `payroll-lock-serialisation-untested_NOTE_02-09-26.md` in
  `process/features/flexible-periods/backlog/`.
- No unit-level component test exists for `PeriodPicker.svelte` — its only automated coverage is
  e2e, which needs `pnpm build` + preview and therefore never runs on a fast inner loop. Out of
  scope here; worth a note.
- The `payroll/periods/+page.svelte:75` ↔ `+page.server.ts:55` field-name agreement is checked by
  nothing in the type system. C10's new e2e assertion is the only guard. A typed prop contract would
  be the real fix and is out of scope.
- `payroll-month-lock-key.test.ts` keeps a filename that names an assumption this change removes.
  Left deliberately, to preserve git history; noted so a future reader is not misled.

---

## Contradictions Found In The Input Documents

Three. None reopens a settled decision; two are the SPEC predicting a test change that will not
happen, one is a factual claim in the task brief.

**1. `pay-periods.test.ts:178-192` will NOT invert.** The SPEC's tests-at-risk table says its "two
adversarial cross-month rows return a flat 0.5 → Return the summed month-slice fraction (AC5)". They
will not. Both rows are over the cap under D4+D6: `1 May → 15 Jun` is `31/31 + 15/30` = **1.5**, and
`1 May → 31 Jul` is **3.0**. D6 says an over-cap legacy row keeps the historical flat 0.5. So all
five adversarial rows still return 0.5 and **the block passes unmodified**. Keeping it unmodified is
better — it becomes the D6 regression rail. AC5 gets brand-new under-cap cases instead.

**2. `payroll-custom-period-statutory-proration.test.ts:90-91` inverts for a different reason than
the SPEC states.** The SPEC says "cross-month statutory uses the flat 0.5 → Uses the summed fraction
for an even-split org". Its actual assertion is on `1 May → 14 Jun 2026`, which is `31/31 + 14/30` =
**1.4667** — over the cap, so `periodShareOf` still returns 0.5 for it. The line changes only because
`isSameMonthRange` is being deleted; its *value* assertion stays true. The AC13 summed-fraction
coverage has to be a **new** case on an under-cap range (`20 May → 5 Jun`), which C8 adds.

**3. "No real-Postgres concurrency tier exists in this repo" — not correct.** The task brief states
this and uses it to classify AC17 as Known-Gap. The premise that "every payroll unit test mocks
`$executeRaw`" is true; the conclusion is not. `vitest.integration.config.ts`, `pnpm test:integration`
and `tests/integration/audit-tx-harness.ts` are a working real-database tier with an org fixture,
built during #5 for exactly this class of problem ("mocked raw SQL is untested SQL"). Two
`PrismaClient`s and two concurrent `createPayrollRun` calls are ~60 lines against that harness. I
have kept AC17 as an Agent-Probe live check per the brief and D7, and added **C13 as an optional
commit** with a recommendation to build it. This does not touch D7 — D7 is about owner-present live
verification, not about test tiering.

One thing that is **not** a contradiction but is worth stating: the SPEC names a new unit file
`payroll-period-cross-month-open` for AC2. C4 deliberately puts that coverage in the existing
`payroll-period-sanity-gate.test.ts` instead, because a second file would duplicate its 40-line
Prisma mock for two assertions. Recorded as a deviation, not a gap.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/flexible-periods/active/cross-month-periods-3_02-09-26/cross-month-periods-3_PLAN_02-09-26.md`
2. **Last completed phase or step:** PLAN written. No code written. Nothing committed on
   `feat/cross-month-periods-3` for #3 yet.
3. **Validate-contract status:** pending — VALIDATE has not run.
4. **Supporting context files loaded:** `research-findings_REF_02-09-26.md`,
   `cross-month-periods-3_SPEC_02-09-26.md`, `design-brief_REF_02-09-26.md`,
   `flexible-periods-163_20-08-26/flexible-periods-163_PLAN_20-08-26.md` (format + its S1–S10
   supplement, which must not be undone), `CLAUDE.md`, `process/context/tests/all-tests.md`.
5. **Next step for a fresh agent:** run VALIDATE against this plan. After VALIDATE, execute in
   commit order **C0 → C1 → C2 → C3 → C4 → C5 → C6 → C7 → C9 → C8 → C10 → C11 → C12 (→ C13)**. Note
   C9 runs before C8 so the tree is green at every commit. **C2 must never land after C3** — see
   Phase Completion Rules. One open decision for the owner before Section C: build C13 or not.

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
