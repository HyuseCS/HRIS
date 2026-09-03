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
| C — UI and scripts | C9–C12 | full `pnpm test` + `pnpm build && pnpm test:e2e` green |
| D — Lock serialisation | C13 | `pnpm test:integration` green (needs `veent-db-5434`, which the owner starts) |
| Whole plan | C1–C13 | all six gate commands green + the Live Verification Checklist (D7) run with the owner |

**Green tree means green at EVERY tier, e2e included.** There is no commit at which the unit tier
is green and the e2e tier is red. This is why C9 carries the `period-picker-default-cutoff.spec.ts`
edits itself rather than deferring them to C10: C9.1 changes the inline refusal copy and C9.3 changes
the preview copy, and three assertions in that spec read those exact strings. Landing the component
change without its spec edits would leave `pnpm test:e2e` red for one commit. C9's gate is therefore
`pnpm check` + `pnpm lint` + `pnpm build && pnpm test:e2e`, not `check` and `lint` alone.

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
| **new** `tests/integration/payroll-run-serialisation.test.ts` | AC17 — C13, **mandatory** (owner ruling) |

**Path note.** The route-mount citations in this plan are written without the SvelteKit route group
for brevity. The real paths are `src/routes/(app)/payroll/+page.svelte`,
`src/routes/(app)/payroll/periods/+page.svelte`, `src/routes/(app)/payroll/periods/+page.server.ts`
and `src/lib/components/timesheets/NewTimesheetDialog.svelte` (NOT `components/ui/`).

## Public Contracts

- **`isSameMonthRange` is DELETED.** After C3–C9 it has zero production callers. Keeping an exported
  predicate that no longer expresses a rule is exactly the drift the SPEC's four-place duplicated
  copy came from. The SPEC's "may keep existing for other callers" is permission, not a requirement,
  and there are no other callers (verified by grep — see Contradictions, item 3).
- **`periodShareOf(start, end)` signature unchanged; behaviour changes for cross-month input only.**
  Same-month and standard input is byte-identical. It remains **non-throwing** — the picker calls it
  for display and `scripts/legacy-nonstandard-runs.ts` calls it for a read-only scan, and D6 needs
  over-cap legacy rows to keep returning `0.5`.
- **`periodShareOf` returns a value in `(0, 1]` for every possible input — the closed bound, with no
  tolerance.** This matters because `earnings.ts:71` multiplies basic pay by it with no downstream
  clamp (research F2). New ranges above 1 are refused at the three service gates; legacy over-cap and
  reversed rows return `0.5`; the standard shapes return 0.5 / 0.5 / 1 from the frozen branch. There
  is no route by which a value greater than 1 reaches the money path. C1.7's exhaustive sweep is what
  holds this property in place.
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
8 source files edited (one of them comment-only), 1 script, 9 test files edited, 5 test files added
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
	if (share > 1) return 0.5             // D6: an over-cap LEGACY row keeps its historical flat
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

### C1.4 The cap is exactly 1 — no constant, no tolerance

The cap is one month of pay, and the comparison is the bare `share > 1`. There is **no `SHARE_CAP`
constant and no epsilon.** Both were considered and both are unnecessary, which was settled
empirically rather than by argument:

- A tolerance would only be needed if some legitimate range's slices summed to exactly 1 in exact
  arithmetic but landed above 1 in IEEE-754. **No such range exists.** A cross-month range's slice
  tuple is fully described by a partial first month, zero or more whole middle months, and a partial
  last month, with every month length drawn from `{28, 29, 30, 31}` — so the space is finite and was
  enumerated exhaustively (69,876 tuples, which is all of them; any tuple with two whole middle
  months already exceeds 2). 116 tuples have an exact sum of 1. **All 116 land on float `1.0`
  exactly.** There were zero wrong refusals and zero wrong accepts in either direction.
- `26 Dec → 25 Jan` is the case that prompted the question: `6/31 + 25/31` evaluates to **exactly
  `1`** in IEEE-754, not to something near it. It is accepted by `share > 1` with no help.
- A named constant for the literal `1` would add a second place to express "one month" without
  adding meaning, and an epsilon would be a tolerance defending against a case that cannot occur —
  prose defending a constant, where deleting the constant is the shorter, truer answer.

The property this rests on is not a comment. It is a test: C1.7's exhaustive sweep re-derives the
whole tuple space and asserts no range's float sum crosses 1 while its exact sum does not. If a
future change to `summedMonthShare` alters the accumulation order and breaks that, the sweep goes
red — which is the point of writing it as a test rather than a paragraph.

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
3. `if (share > 1) return` the size-cap copy with `${Math.round(share * 100)}`
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
- `26 Dec 2026 → 25 Jan 2027` is **exactly `1`** — assert `toBe(1)`, not a tolerance. The exhaustive
  sweep below is what earns the right to assert equality here (AC7 boundary)
- `1 Feb → 3 Mar 2026` is `28/28 + 3/31` ≈ 1.0968 — 31 days long and over the cap (AC7)
- `31 Jan → 1 Mar 2026` is `1/31 + 28/28 + 1/31` ≈ 1.0645 (AC8)
- a reversed range returns `0`
- for every same-month range in May 2026, `summedMonthShare` equals `periodDays / 31` — the
  identity that keeps the goldens still

New `describe('the cap needs no tolerance')` — **the exhaustive sweep.** This is the test that
replaces the tolerance that was considered and rejected, and it must be written as an enumeration of the tuple
space, not a date sweep, so it is exhaustive by construction rather than by sampling:
- build every possible slice tuple: a partial first month `k1/n1`, zero or one whole middle month
  `nm/nm`, and a partial last month `k3/n3`, with `n ∈ {28, 29, 30, 31}` and `k` running the full
  range of each month. (Two whole middle months already exceed 2, so they cannot bear on the
  boundary and only need one spot check.)
- for each tuple compute the float sum the way `summedMonthShare` accumulates it (`acc = 0; acc +=
  k/n` in month order — the order matters, so replicate it) and the exact rational sum with `BigInt`
- assert **zero** tuples where the float sum exceeds 1 while the exact sum does not (a wrong refusal)
- assert **zero** tuples where the float sum is at most 1 while the exact sum exceeds 1 (a wrong
  accept — the dangerous direction, since it would let an over-cap range through the gate)
- assert that every tuple whose exact sum is 1 has a float sum of exactly `1`
- Expected counts at the time of writing, as a canary on the enumeration itself: **69,876 tuples,
  116 of them summing to exactly 1.** If those numbers move, the enumeration changed, not the
  arithmetic — check the loop bounds before touching the assertions.

New `describe('customRangeError')`:
- returns `null` for the standard shapes and for a valid cross-month range
- returns the reversed string for `21 May → 13 May`, checked **before** the cap (a reversed range
  has share 0 and would otherwise fall through as acceptable)
- returns the size-cap string with `110` for `1 Feb → 3 Mar 2026` — assert the **whole string**,
  not a substring, so a copy drift fails here rather than in a browser

Extend `describe('periodShareOf')`:
- a valid cross-month range now returns the summed fraction, not 0.5
- **the closed bound:** `periodShareOf` is `> 0` and `<= 1` for every input — sweep cross-month
  ranges either side of the cap, the five adversarial legacy pairs, and reversed ranges. Assert
  `toBeLessThanOrEqual(1)`, the bare 1, with no tolerance. This is the executable form of the
  Public Contracts claim that nothing above 1 can reach `earnings.ts:71`
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
exact `where` + `distinct` (`:47-65`). Keep that. Do **not** replace it with a blanket
`mockResolvedValue` — this repo has been burned by exactly that: a mock that ignores the `where`
clause cannot fail on a wrong filter, and a mock that returns the same value for every input passes
regardless of the code under test.

The guard derives months in code, not in the query, so the mock cannot discriminate on the month.
**The assertions must.** Every new case has to be one the old start-month-only code gets wrong:

- **`describe('cross-month, FIRST-only org')`** — `20 May → 5 Jun 2026` REFUSED, and the message
  contains `June 2026`, not `May 2026`. **Under the old code this passes through silently:** the old
  derivation reads the start month (May), whose FIRST window is 1–15, which this range does not
  touch. This is the one case that proves the loop reports the **clashing** window rather than the
  first month in the list, because here the two are different months. It is the regression rail for
  the whole F5 hole (AC11).
- same org, `28 Apr → 3 May 2026` REFUSED naming `May 2026` — again the clashing month is the end
  month, and again the old code allows it (April's FIRST window is 1–15) (AC11).
- **`describe('cross-month, SECOND-only org')`** — `20 May → 5 Jun 2026` REFUSED naming `May 2026`.
  Be precise about what this proves and what it does not. The old code **already refuses** this one,
  because May's 16–31 window is in the start month. It therefore proves nothing about the month
  loop. What it does prove is narrower and still worth having: **the message now names its month at
  all.** The old message carried no month, so `toContain('May 2026')` fails against the old code.
  Keep the case; do not describe it as proving the clashing-window property — the FIRST-only case
  above is what proves that.
- **`describe('exhaustive cross-month sweep')`** (AC12) — for start day 1…28 of May 2026 and end day
  1…5 of June 2026, assert refusal for a FIRST-only org, a SECOND-only org, and an org with both.
  No shape passes: for FIRST, every range either touches May 1–15 or June 1–5 ⊂ June 1–15; for
  SECOND, every range with a start in 1…28 May and an end in June covers May 28–31 ⊂ May 16–31.
  Assert the count of refusals equals the count of cases, so a swallowed rejection cannot read as a
  pass. Note for the reader: many of these ranges are also over the one-month cap and so are
  unreachable through `createPayrollRun` after C3 — this test calls
  `assertCustomRangeClearOfCutoff` directly, which has no cap check, so the sweep still exercises
  the loop. It proves the guard, not the reachable surface.
- **`describe('all-EVEN org')`** — `20 May → 5 Jun 2026` is allowed; `findMany` was still called
  with the right org id (the existing predicate mock proves the scoping) (AC13).
- **existing same-month cases at `:82`, `:117`, `:122`, `:133`, `:153` are re-run untouched** (AC14).
  They assert with `toContain('1–15')`, `toContain('First half')`, `toContain('16–31')` and
  `toContain('16–28')` — never the whole string — so appending `of {Month Year}` does not disturb
  them. Confirm that before assuming it; if any of them asserted the full message, this commit
  would be editing an AC14 rail.

**Two positive controls, and they prove different things.** Both are required:
1. The FIRST-only org still accepts its standard `1–15 June` period. This exits at
   `isValidStandardPeriod` (`payroll/index.ts:196`) **before the month loop runs**, so it proves the
   standard-shape bypass survives — it does NOT prove the loop is discriminating.
2. The FIRST-only org still accepts a same-month custom range clear of the window, `20 May →
   25 May 2026`. This one **enters the loop**, walks May, finds no overlap with 1–15, and returns.
   That is the control that proves the loop is not simply refusing everything. It already exists at
   `:82` — re-run it inside the sweep describe so the two controls sit together.

**Gate:** `pnpm test tests/unit/payroll-custom-range-cutoff-guard.test.ts` — new cases green,
existing cases green **unmodified**.
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

## C9 — `PeriodPicker.svelte`: retarget the native bound at the cap, and carry its own e2e edits

**Files:** `src/lib/components/ui/PeriodPicker.svelte`,
`tests/e2e/period-picker-default-cutoff.spec.ts`

C9 changes two user-visible strings and both date-input bounds. Three assertions in
`period-picker-default-cutoff.spec.ts` read exactly those strings and bounds, so they move **in this
commit**, not in C10. Deferring them would leave `pnpm test:e2e` red for one commit, and the green
tree rule in Phase Completion Rules admits no such window.

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

### C9.3 The import line

Deleting `startMonthEnd` orphans `daysInMonth`, and replacing `customError` orphans
`isSameMonthRange`. Both are in the `$lib/utils/pay-periods` import at `:2-9`. **Remove both; add
`customRangeError`.** `periodShareOf`, `periodOf`, `formatPeriodPreview` and `toPeriodInputValue`
all stay — `periodShareOf` is still used by the preview at `:132`. `pnpm lint` will catch a missed
one, but do not use the gate as the checklist.

### C9.4 Preview copy

`:133` — `prorated to ${share}% of the month` → `of a month`. "the month" was written when only one
month could exist.

Note, verified and worth not re-deriving: an over-cap range produces a `customError`, so
`validCustom` is null and the preview is not rendered at all. The D6 legacy `0.5` fallback inside
`periodShareOf` can therefore never surface in the picker as a misleading "50%".

### C9.5 Nothing else moves

No new component, no new prop, no layout change, no field-name change. The `w-40` inputs, the
`aria-invalid` / `aria-describedby` wiring, the single `text-destructive` line with id
`pp-custom-error`, and the `aria-live="polite"` preview all stay exactly as they are. The
`payroll/periods/+page.svelte:75` mount overrides `startName`/`endName` and nothing type-checks that
agreement — it is safe here only because no field name changes. Do not change one.

### C9.6 `period-picker-default-cutoff.spec.ts` — three assertions, exact literals

The file has exactly **two** `test()` blocks, at `:11` and `:69`. Both are edited here. Earlier
drafts of this plan said the first test was untouched; that was wrong — two of the three changed
assertions are inside it.

**First test (`:11`), two edits:**

1. `:47-49` — the cross-month refusal. `2026-06-20 → 2026-07-05` is `11/30 + 5/31` = 0.5280, under
   the cap, so it must now show **no error**. Replace the same-month message assertion with
   `await expect(page.locator('#pp-custom-error')).toHaveCount(0)`. Then add a genuinely over-cap
   range and assert the **size-cap** string: `2026-06-03 → 2026-07-05` is `28/30 + 5/31` = 1.0946,
   which rounds to **109%**. Two assertions replace one, and the second is the new rail.
   (Do not reuse the SPEC's `2026-07-05`-against-a-June-3-start as the *no error* case — it is over
   the cap, which is why it works as the *refusal* case instead.)

   **Read this before writing it.** Any over-cap end date is by definition past the `max` this
   commit computes for that start — with start `2026-06-03`, `max` is `2026-07-02` and the case
   above fills `2026-07-05`. That is intended and it works: `max` on `<input type="date">` is a
   *validation* constraint, not an input filter. Playwright's `fill()` sets the value, the browser
   marks the field `:out-of-range` but keeps the value, the `$derived` recomputes, and
   `#pp-custom-error` renders the 109% string. Verify that assumption on the first run rather than
   trusting it. **If the harness clamps or rejects the value**, do not fight it: assert the `max`
   attribute here instead, and let C1.7's `customRangeError` whole-string assertion carry the
   size-cap copy proof (it already does, on `1 Feb → 3 Mar` at 110%). Record which branch you took.
2. `:57` — the preview copy assertion, which no earlier draft mentioned. It currently reads
   `'Jun 3 – Jun 9, 2026 (7 days) · statutory and loans prorated to 23% of the month'`. C9.4 changes
   the last three words. New expected string: `…prorated to 23% of a month`. The 23% is unchanged —
   Jun 3–9 is 7 days of a 30-day June, `Math.round(7/30 × 100)` = 23.

**Second test (`:69`), the min/max block.** Three bounds change and one does not. Use these exact
literals; the arithmetic that produces each is given so no one re-derives them by eye:

| Assertion | Old | **New** | Why |
|---|---|---|---|
| start `2026-06-03` → end `max` | `2026-06-30` | **`2026-07-02`** | `28/30 + 2/31` = 0.99785 ✓; `28/30 + 3/31` = 1.03011 ✗ |
| start `2026-02-10` → end `max` | `2026-02-28` | **`2026-03-09`** | `19/28 + 9/31` = 0.96889 ✓; `19/28 + 10/31` = 1.00115 ✗ |
| end `2026-06-09`, no start → start `min` | `2026-06-01` | **`2026-05-11`** | `21/31 + 9/30` = 0.97742 ✓; `22/31 + 9/30` = 1.00968 ✗ |
| end `2026-06-09`, no start → start `max` | `2026-06-09` | `2026-06-09` | unchanged — still bounded by the end date |
| start `2026-06-03` → end `min` | `2026-06-03` | `2026-06-03` | unchanged — still bounded by the start date |

The February row keeps its purpose but not its value: it still proves the bound respects a 28-day
month through the shared function, it just now reaches into March. Do not read "keep the February
case" as "leave the assertion alone".

The "with nothing picked yet, neither input constrains the other" assertions at `:80-82` are
**unchanged** — both bounds return `undefined` when their opposite field is empty.

If your implementation yields a different bound from the table above, the walk is off by one.
**Stop and report. Do not adjust the assertion to match the code.**

**Gate:** `pnpm check`, `pnpm lint`, and `pnpm build && pnpm test:e2e`. Never run `pnpm check`
alongside a dev server or the e2e preview.

## C10 — E2E: the new cross-month spec across all three mounts

**File:** **new** `tests/e2e/period-picker-cross-month.spec.ts`

`period-picker-default-cutoff.spec.ts` was already brought green in C9. C10 adds the coverage that
does not exist at all yet.

E2E runs against **build + preview** (#287), not `vite dev`. `pnpm check` kills a running dev
server — do not run them concurrently.

New `period-picker-cross-month.spec.ts` (AC20), read-only where it can be, covering **all three
mounts**:
1. `/payroll` (`src/routes/(app)/payroll/+page.svelte:79`, default field names) — pick
   `26 Dec 2026 → 10 Jan 2027`, assert no inline error and the preview reads
   `…prorated to 52% of a month` (`6/31 + 10/31` = 0.51613 → 52%).
2. `/payroll/periods` (`src/routes/(app)/payroll/periods/+page.svelte:75`, **renamed to
   `start`/`end`**) — assert the two hidden inputs are named `start` and `end` and carry the two real
   dates. This is the only automated thing that will ever notice if the third mount breaks; the
   pairing with the zod schema in `+page.server.ts` is type-checked by nothing.
3. `/timesheets` `src/lib/components/timesheets/NewTimesheetDialog.svelte:128` (default names) —
   same range, no error.

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

## C13 (MANDATORY — owner ruling) — Automate the serialisation probe

**File:** **new** `tests/integration/payroll-run-serialisation.test.ts`

This change modifies **both** advisory lock keys (C7). Leaving the only proof that the lock
serialises anything as a one-off manual probe that nobody re-runs is not acceptable when the lock
itself is what is changing. Every payroll unit test mocks `$executeRaw`, so
`pg_advisory_xact_lock` has never executed once in CI. C13 is the cheapest possible fix and the
tier to write it in already exists.

Earlier drafts marked this optional and the PLAN brief claimed no real-Postgres concurrency tier
existed. Both are superseded: the tier is real (`vitest.integration.config.ts`, `pnpm
test:integration`, `tests/integration/audit-tx-harness.ts`, `fileParallelism: false`) and the owner
has ruled C13 in scope. It is a full commit in the ordered list, validated like any other.

### C13.1 Shape

Two **concurrent** `createPayrollRun` calls for **different but overlapping** ranges on one org —
the exact race the lock exists to stop, and the one `@@unique([organizationId, periodStart,
periodEnd])` cannot catch because the bounds differ. Assert exactly one run row exists afterwards
and the loser was refused.

Three corrections to the earlier sketch, each of which would otherwise cost a debugging cycle:

1. **Assert the OVERLAP 409, not the duplicate 409.** For different-but-overlapping ranges the loser
   never reaches the `findUnique` duplicate check — it is refused by `assertNoOverlappingRun`
   (`payroll/index.ts:129`), which is a different message. Assert that specific message. Asserting
   "a 409" alone would also pass if the ranges were accidentally identical, which would prove the
   unique constraint rather than the lock.
2. **Two `PrismaClient`s are not required, and the harness does not offer a second write client.**
   `tests/integration/audit-tx-harness.ts` exports `createOrgFixture`, `cleanupFixtures`, `verifyDb`
   and `disconnectAll`; `makeInjectedDb` is audit-specific and is the wrong tool here. Two
   concurrent `createPayrollRun(...)` calls against the real `$lib/server/db` singleton are
   sufficient — Prisma's connection pool hands the two transactions separate connections, so
   `pg_advisory_xact_lock` genuinely serialises them. **Do NOT `vi.mock('$lib/server/db')` in this
   file.** That is the whole point of the tier.
3. **The lock-removed negative control cannot be a committed test.** It requires editing
   `payroll/index.ts` to delete the `lockPayrollRuns` call, which no committed test can do. Drop it
   from the test file. It becomes a **manual mutation check, run once, at the end gate** — written
   out in full in the Live Verification Checklist below rather than left implied. Without it the
   test proves the two calls both completed; with it, it proves the lock is why only one row exists.

Use `createOrgFixture` for the org and `cleanupFixtures` in `afterAll`, matching
`tests/integration/audit-transaction.test.ts`.

**Gate:** `pnpm test:integration` — requires `veent-db-5434` running. **The owner starts the
container; never launch it.** C13 is therefore WRITTEN during EXECUTE and RUN at the end gate.

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
| new `tests/integration/payroll-run-serialisation.test.ts` — two concurrent overlapping-range creates, one row survives, loser gets the overlap 409 | **Hybrid** (`pnpm test:integration`, needs `veent-db-5434`) | AC17 |
| new `pay-periods-legacy-cross-month` cases in `pay-periods` — under cap day-counts, over cap keeps 0.5, reversed keeps 0.5 | Fully-Automated | AC18 |
| `legacy-nonstandard-runs-classify` old-vs-new share reporting | Fully-Automated | AC19 |
| `scripts/legacy-nonstandard-runs.ts` run against every real database | Hybrid | AC19 |
| `period-picker-default-cutoff.spec.ts` (both tests invert) + new `period-picker-cross-month.spec.ts` across all three mounts | Hybrid (build + preview) | AC20 |

### Test tier summary

- **Fully-Automated (vitest, `pnpm test`)** — all of Section A and B, C11's unit half, C12's unit
  half. 19 of the 20 acceptance criteria have at least one fully-automated gate.
- **Hybrid** — the two e2e specs (need `pnpm build` + preview per #287); C13 (needs
  `veent-db-5434` up); the legacy scan script run (needs each real database).
- **Agent-Probe** — the owner-present Live Verification Checklist (D7), including the C13 mutation
  check described there.
- **Known-Gap** — none. With C13 mandatory, AC17 moves from Agent-Probe to Hybrid and **no developed
  behaviour in this plan rests on a Known-Gap as its only proof.** There is no backlog stub to file,
  because there is no residual to defer.

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

One `// ponytail:` shortcut is deliberate and marked in code: the picker's linear cap-bound walk
(C9.2). The manual serialisation probe is no longer a shortcut — C13 automates it.

---

## Gate Commands (pnpm, never npm — CI runs format FIRST and skips the rest on failure)

```bash
pnpm format:check          # CI runs this first; a green `pnpm check` proves nothing about CI
pnpm lint
pnpm check                 # kills a running dev server — never run alongside e2e
pnpm test                  # full vitest unit tier
pnpm build && pnpm test:e2e
pnpm test:integration      # C13 is mandatory; needs veent-db-5434 up (the owner starts it)
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
9. **The C13 mutation check** — the negative control that cannot live in a committed test, because
   it needs a source edit. Run it ONCE, here, with the owner, and record the result in the phase
   report. Exact steps:
   a. Confirm `pnpm test:integration` is GREEN with `tests/integration/payroll-run-serialisation.test.ts`
      as committed. This is the positive control; without it the rest proves nothing.
   b. Comment out the `await lockPayrollRuns(tx, organizationId)` line in `createPayrollRun`
      (`src/lib/server/services/payroll/index.ts`). Change nothing else.
   c. Re-run `pnpm test:integration`. The serialisation test **must now FAIL** — two rows written,
      or no overlap 409. If it still passes, the test is not proving the lock and must be fixed
      before the PR; a test that passes with and without the lock is the exact failure mode this
      commit exists to prevent.
   d. Restore the line with `git checkout -p` on that hunk only, or by re-typing it. **Do NOT run
      `git checkout <file>`** — it silently reverts every uncommitted change in that file.
   e. Re-run `pnpm test:integration` and confirm GREEN again.
   f. Record in the phase report: green → red → green, with the exact failure message from step c.
   g. **Coverage boundary, read before signing this off.** The committed test races
      `createPayrollRun` only, so steps a–f prove `payrollRunLockKey` and nothing else. C7 changed
      **both** keys, and `timesheetLockKey` has no automated proof that it serialises anything —
      the unit tier asserts its string and its arity, and `$executeRaw` is mocked everywhere it is
      called. Racing two overlapping timesheets needs an Employee fixture the audit-tx harness does
      not build for this file. Treat the timesheet lock as UNPROVEN at this gate and decide with the
      owner whether to add the fixture now or carry it as a named residual.

The user starts the servers and the DB container — never launch `./start.sh`, vite or
`veent-db-5434` unasked. Driving an already-running app is fine.

---

## Implementation Checklist

1. **C0 pre-flight (no commit).** Clean tree. Run all six gate commands and record that they are
   green *before* any edit — a golden captured from post-edit code proves nothing.
2. **C1** `pay-periods.ts`: add `monthsTouched`.
3. **C1** add `summedMonthShare` (non-throwing, `0` for reversed).
4. **C1** no cap constant and no epsilon — the comparison is the bare `share > 1`. Write the C1.4
   note explaining that the tolerance was deleted, not forgotten, and that C1.7's sweep is what
   holds the property.
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
    comment; preview copy → `of a month`.
23. **C9** fix the `$lib/utils/pay-periods` import at `:2-9`: **remove `daysInMonth` and
    `isSameMonthRange`, add `customRangeError`**. Keep `periodShareOf` — the preview at `:132` still
    uses it.
24. **C9** edit `tests/e2e/period-picker-default-cutoff.spec.ts` in this same commit — both tests,
    three assertions: `:47-49` (under-cap no error + over-cap 109% size message), `:57` (`of the
    month` → `of a month`, 23% unchanged), and the `:69` bound table (`2026-07-02`, `2026-03-09`,
    `2026-05-11`, exact literals from C9.6 — do not re-derive). Run the impeccable detector.
    Commit; gate `pnpm check` + `pnpm lint` + `pnpm build && pnpm test:e2e`.
25. **C8** delete `isSameMonthRange` and its imports in three services; delete its describe in
    `pay-periods.test.ts` and re-home the reversed + different-year cases into `customRangeError`;
    rewrite `payroll-custom-period-statutory-proration.test.ts:90-91` and add the AC13 even-split
    cross-month case. Commit; gate = **full `pnpm test`**.
26. **C10** add `tests/e2e/period-picker-cross-month.spec.ts` covering `/payroll`,
    `/payroll/periods` (assert the `start`/`end` hidden-input names) and `/timesheets`.
    Commit; gate `pnpm build && pnpm test:e2e`.
27. **C11** `scripts/legacy-nonstandard-runs.ts`: drop the cross-month early return, add the
    over-cap branch, rewrite the header comment; invert
    `legacy-nonstandard-runs-classify.test.ts:31-36` and add the over-cap case. Commit; gate C11.
28. **C12** comment at `compensation.ts:114`; add `payroll-basic-pay-share-passthrough.test.ts`;
    re-run the five #170/#171 parity files **unmodified**. Commit; gate C12.
29. **C13 (mandatory)** `tests/integration/payroll-run-serialisation.test.ts`: two concurrent
    `createPayrollRun` calls, overlapping-but-different ranges, one row survives, loser gets the
    **overlap** 409 from `assertNoOverlappingRun`. Do NOT mock `$lib/server/db`. No lock-removed
    control inside the file — that is Live Verification item 9. Commit; gate `pnpm test:integration`
    (needs `veent-db-5434`, which the owner starts).
30. Run all six gate commands. `pnpm format:check` first.
31. Drive the Live Verification Checklist with the owner (D7), including the item 9 mutation check.
    Record item 1's counts in the plan's resume section — they are the one measurement nobody has
    taken.
    the issue by hand and name any gaps.

---

## Test Infra Improvement Notes

- **The repo DOES have a real-Postgres tier and this plan is the first payroll work to notice.**
  `tests/integration/**` + `pnpm test:integration` + `tests/integration/audit-tx-harness.ts` already
  give a real `PrismaClient`, an org fixture, cleanup and `fileParallelism: false`. Every payroll
  unit test mocks `$executeRaw`, so the advisory locks have never executed once in CI. C13 closes
  this and is mandatory per the owner ruling — there is no skip branch and no backlog stub.
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

**3. "No real-Postgres concurrency tier exists in this repo" — not correct, and the owner has now
ruled on it.** The task brief stated this and used it to classify AC17 as Known-Gap. The premise
that "every payroll unit test mocks `$executeRaw`" is true; the conclusion is not.
`vitest.integration.config.ts`, `pnpm test:integration` and `tests/integration/audit-tx-harness.ts`
are a working real-database tier with an org fixture, built during #5 for exactly this class of
problem ("mocked raw SQL is untested SQL"). **Resolved:** the owner has ruled C13 in scope and
mandatory, because this change modifies both advisory lock keys and the only alternative proof was a
manual probe nobody re-runs. AC17 is now Hybrid, not Agent-Probe. This does not touch D7 — D7 is
about owner-present live verification, not about test tiering, and the C13 mutation check is
scheduled there as item 9.

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
5. **Next step for a fresh agent:** VALIDATE has run; the contract is at the bottom of this file.
   Execute in commit order **C0 → C1 → C2 → C3 → C4 → C5 → C6 → C7 → C9 → C8 → C10 → C11 → C12 →
   C13**. Note C9 runs before C8 so the tree is green at every commit, and C9 now carries its own
   e2e spec edits for the same reason. **C2 must never land after C3** — see Phase Completion Rules.
   **C13 is mandatory** (owner ruling); there is no remaining open decision before Section C.
## Validate Contract

Status: PASS
Date: 02-09-26
date: 2026-09-02
generated-by: outer-pvl
supersedes: 2026-09-02 (outer-pvl) — cycle 1 CONDITIONAL superseded after one plan-validate-fix cycle; all 8 concerns resolved in the plan body

Parallel strategy: sequential (in-thread fan-out)
Rationale: 6/7 signals present (S1, S2, S4, S5, S6, S7). Strategy scores HIGH, but no Agent tool was available in this thread, so the Layer 1 + Layer 2 fan-out ran in-thread against source. Every finding is anchored to a re-read `file:line` or to an executed computation, never to a summary.

**Cycle 2 of 2.** Cycle 1 gated CONDITIONAL with 0 FAILs and 8 CONCERNs (C-1…C-8). One
plan-validate-fix cycle applied P1–P8 plus three owner directions. All eight are resolved in the
plan body; two low residuals remain, both with a written decision branch. See the resolution table.

**Owner rulings folded in, all three verified before applying:**
- **A — the epsilon is deleted, not documented.** Settled empirically, not by argument. See below.
- **B — C9 carries its own e2e edits.** Green tree now means green at every tier.
- **C — C13 is mandatory** and its sketch is corrected in three places.

### Direction A — the counterexample hunt, and what it found

The owner asked for a counterexample, not agreement: a range whose slices sum to exactly 1 in exact
arithmetic but land above 1 in IEEE-754, which would be the only justification for a tolerance.

**No such range exists.** Not "none found in a sample" — none exists. Two searches were run:

1. **Date sweep, 1995–2065, spans 1–75 days.** 1,944,975 ranges, 1,537,055 of them cross-month.
   4,260 have an exact sum of 1; all 4,260 land on float `1.0`. Zero wrong refusals, zero wrong
   accepts.
2. **Exhaustive enumeration of the tuple space** — the airtight version, complete by construction
   rather than by sampling. A cross-month range's slice tuple is fully described by a partial first
   month, zero or more whole middle months, and a partial last month, with every month length drawn
   from `{28, 29, 30, 31}`; any tuple with two whole middle months already exceeds 2 and cannot bear
   on the boundary. That makes the space finite and small: **69,876 tuples, which is all of them**
   (`118² = 13,924` two-month + `4 × 118² = 55,696` three-month + `4⁴ = 256` spot check).
   **116 tuples have an exact sum of exactly 1. All 116 land on float `1.0` exactly.**
   **Zero counterexamples in either direction** — no float sum crosses 1 while its exact sum does
   not (a wrong refusal), and no float sum stays at or below 1 while its exact sum exceeds 1 (a
   wrong accept, the dangerous direction).

`26 Dec → 25 Jan` — the case that prompted the epsilon — is `6/31 + 25/31`, which evaluates to
**exactly `1`**, difference `0`. The plan's original claim that it "lands within ~2e-16 of 1" was
simply wrong about its own worked example.

**Consequence:** the cap is the bare `share > 1`. No `SHARE_CAP` constant, no tolerance. C-5 and C-6
do not get documented — they cease to exist. V-10's bound becomes a clean, closed `(0, 1]`, and the
only route by which a value above 1 could have reached `earnings.ts:71` is removed rather than
quantified. The property is held by a test, not a comment: C1.7 now requires the enumeration as a
Fully-Automated sweep, with the tuple count derived in the plan so it is a canary and not a magic
number.

### C-1…C-8 resolution

| # | Cycle-1 concern | Status | Where it landed |
|---|---|---|---|
| C-1 | "Green tree" false at C9 for e2e | **RESOLVED** | `## Phase Completion Rules` now states green at EVERY tier and explains why; C9's gate is `pnpm check` + `pnpm lint` + `pnpm build && pnpm test:e2e`; the spec edits moved into C9 |
| C-2 | "First test untouched" is false; `:57` never mentioned | **RESOLVED** | C9.6 names both `test()` blocks (`:11`, `:69`) and all three assertions, including `:57` → `of a month` (23% unchanged) |
| C-3 | Exact e2e bounds demanded but not stated | **RESOLVED** | C9.6 carries a 5-row table with each literal and the arithmetic beside it: `2026-07-02`, `2026-03-09`, `2026-05-11`, plus the two bounds that do NOT move |
| C-4 | Orphaned `daysInMonth` / `isSameMonthRange` imports | **RESOLVED** | New C9.3 subsection + Implementation Checklist item 23 |
| C-5 | Money bound is `1 + 1e-9`, not `1` | **RESOLVED — by deletion** | Epsilon removed (Direction A). `## Public Contracts` states the closed `(0, 1]`; C1.7 asserts `toBeLessThanOrEqual(1)`, bare |
| C-6 | Float-dust comment wrong about its own example | **DISSOLVED** | There is no constant left to comment on. C1.4 now records why the tolerance was deleted, with the enumeration result |
| C-7 | Two overclaimed test rationales | **RESOLVED** | C2.3 states the narrower true property for the SECOND-only case ("the message now names its month at all"), names the FIRST-only case as the one that actually proves the clashing-window property, and adds a **second** positive control (`20 May → 25 May`) that enters the loop instead of exiting at `isValidStandardPeriod` |
| C-8 | C13 stale-optional + three technical errors | **RESOLVED** | C13 retitled MANDATORY and in the ordered list; overlap-409 vs duplicate-409 corrected; the "two PrismaClients" idea replaced with two concurrent calls on the real `db` singleton and an explicit "do NOT mock `$lib/server/db`"; the lock-removed control moved out of the committed test into Live Verification item 9, written out in six exact steps |

### Test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | cross-month accepted at `createPayrollRun` | Fully-Automated | `pnpm test tests/unit/payroll-period-sanity-gate.test.ts` — inverted case at `:114` | B |
| AC2 | cross-month accepted at `openPeriod` (form action + v1 API) | Fully-Automated | same file, inverted case at `:143` | B |
| AC3 | cross-month accepted at `createTimesheet`; the attendance path inherits it | Fully-Automated | `pnpm test tests/unit/payroll-period-sanity-gate.test.ts tests/unit/timesheet-selfservice.test.ts tests/unit/attendance-save-timesheet-cross-month.test.ts` | B |
| AC4 | reversed range still refused at all three entry points | Fully-Automated | `payroll-period-sanity-gate.test.ts:107,:136,:165` re-run unmodified | A |
| AC5 | summed month-slice fraction | Fully-Automated | `pnpm test tests/unit/pay-periods.test.ts` — new `summedMonthShare` describe | B |
| AC6 | the three standard shapes do not move, to the centavo | Fully-Automated | `pnpm test tests/unit/pay-periods.test.ts tests/unit/payroll-standard-period-golden.test.ts tests/unit/payroll-calculator.test.ts` — `:130-145`, `:43-44`, `:73-79` all **unmodified** | A |
| AC7 | cap boundary: 26 Dec→25 Jan accepted at exactly 1.0; 1 Feb→3 Mar refused at 110% | Fully-Automated | new `tests/unit/payroll-cross-month-share-cap.test.ts` — asserts `toBe(1)`, no tolerance | B |
| AC7b | **the cap needs no tolerance** — exhaustive tuple enumeration | Fully-Automated | `pnpm test tests/unit/pay-periods.test.ts` — the C1.7 sweep: 69,876 tuples, 116 exact-1, zero divergence either direction | B |
| AC8 | 31 Jan→1 Mar (1.064516) refused | Fully-Automated | new `tests/unit/payroll-cross-month-share-cap.test.ts` | B |
| AC9 | `salary × share` is unclamped downstream, so the refusal must live at creation | Fully-Automated | new `tests/unit/payroll-basic-pay-share-passthrough.test.ts` + C1.7's closed-bound assertion `periodShareOf(...) <= 1` | B |
| AC10 | the cutoff guard inspects EVERY touched month | Fully-Automated | `pnpm test tests/unit/payroll-custom-range-cutoff-guard.test.ts` | B |
| AC11 | FIRST-only org: 20 May→5 Jun refused naming **June 2026**; 28 Apr→3 May refused naming **May 2026** | Fully-Automated | same file — the F5 regression rail, and the only case proving the clashing-window property | B |
| AC12 | exhaustive cross-month sweep × FIRST / SECOND / both, with a refusal count | Fully-Automated | same file, plus two positive controls (one bypassing the loop, one entering it) | B |
| AC13 | all-EVEN org prorates a valid cross-month range by the summed fraction | Fully-Automated | `pnpm test tests/unit/payroll-custom-period-statutory-proration.test.ts` — new 20 May→5 Jun case | B |
| AC14 | existing same-month cutoff cases still pass unmodified | Fully-Automated | `payroll-custom-range-cutoff-guard.test.ts:82,:117,:122,:133,:153` re-run unmodified | A |
| AC15 | the D2 statutory anchor does not move | Fully-Automated | `pnpm test tests/unit/payroll-mid-period.test.ts tests/unit/compensation-resolver.test.ts tests/unit/payroll-statutory-basis.test.ts tests/unit/compensation-heal.test.ts tests/unit/employee-api-compensation.test.ts` — all **unmodified** | A |
| AC16 | one lock per org, one per employee; arity 1 on both helpers | Fully-Automated | `pnpm test tests/unit/payroll-month-lock-key.test.ts tests/unit/backup-plan.test.ts` | B |
| AC17 | the advisory lock actually serialises two concurrent overlapping-range creates | Hybrid | `pnpm test:integration` — new `tests/integration/payroll-run-serialisation.test.ts` (C13, mandatory). Precondition: `veent-db-5434` running, started by the owner | B |
| AC17b | the C13 test would FAIL without the lock (the negative control) | Agent-Probe | Live Verification item 9 — six exact steps: green, comment out `lockPayrollRuns`, red, restore without `git checkout <file>`, green, record | C — end gate, owner present |
| AC18 | legacy rows: under cap day-count, over cap keep 0.5, reversed keep 0.5 | Fully-Automated | `pay-periods.test.ts:178-192` re-run **unmodified** + new under-cap cases | A |
| AC19 | the legacy scan reports old-vs-new share for cross-month rows | Fully-Automated | `pnpm test tests/unit/legacy-nonstandard-runs-classify.test.ts` | B |
| AC19-live | the scan is run against every real database before any recompute | Hybrid | `pnpm dotenv -e .env.dev -- tsx scripts/legacy-nonstandard-runs.ts`. Precondition: each real DB reachable. Never run before | C — Live Verification item 8 |
| AC20 | the picker across all three mounts, bounds derived from the cap | Hybrid | `pnpm build && pnpm test:e2e` — `period-picker-default-cutoff.spec.ts` (edited in C9) + new `period-picker-cross-month.spec.ts` (C10). Precondition: production build + preview (#287) | B |
| D7-live | owner-present browser walkthrough, 9 items | Agent-Probe | Live Verification Checklist, driven with Playwright MCP + `/api/v1/_dev/login-as` | C — end of build, owner present |

gap-resolution legend: A — proven now · B — gate added by this plan · C — deferred to a named later step · D — backlog test-building stub.

C-4 reconciliation: the `strategy` column carries only the three proving strategies. **No Known-Gap rows exist in this plan.** With C13 mandatory, AC17 is Hybrid; its negative control is a named Agent-Probe with written steps, not a residual. Nothing developed here rests on a Known-Gap.

Legacy line form (for existing validate-contract consumers):
- pay-periods math + the no-tolerance sweep: Fully-automated: `pnpm test tests/unit/pay-periods.test.ts tests/unit/payroll-cross-month-share-cap.test.ts`
- frozen rails: Fully-automated: `pnpm test tests/unit/pay-periods.test.ts tests/unit/payroll-standard-period-golden.test.ts tests/unit/payroll-calculator.test.ts`
- cutoff guard: Fully-automated: `pnpm test tests/unit/payroll-custom-range-cutoff-guard.test.ts`
- service gates: Fully-automated: `pnpm test tests/unit/payroll-period-sanity-gate.test.ts tests/unit/timesheet-selfservice.test.ts tests/unit/attendance-save-timesheet-cross-month.test.ts`
- locks: Fully-automated: `pnpm test tests/unit/payroll-month-lock-key.test.ts tests/unit/backup-plan.test.ts`
- lock serialisation: hybrid: `pnpm test:integration` + precondition `veent-db-5434` up
- picker: hybrid: `pnpm build && pnpm test:e2e` + precondition production build/preview
- legacy scan on real data: hybrid: `pnpm dotenv -e .env.dev -- tsx scripts/legacy-nonstandard-runs.ts` + precondition each real DB reachable
- lock negative control + owner walkthrough: agent-probe: Live Verification Checklist items 1–9

#### Failing stubs (Fully-Automated rows only — red-first starting points for EXECUTE)

```
test("should return exactly 1 for 26 Dec 2026 -> 25 Jan 2027 and accept it", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: cap boundary is exactly one month, asserted with toBe(1)")
})
test("should find zero tuples where the float sum exceeds 1 while the exact sum does not", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: the cap needs no tolerance, wrong-refusal direction")
})
test("should find zero tuples where the float sum is at most 1 while the exact sum exceeds 1", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: the cap needs no tolerance, wrong-accept direction")
})
test("should enumerate 69876 tuples of which 116 sum to exactly 1", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: the enumeration canary")
})
test("should keep periodShareOf greater than 0 and at most 1 for every input", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: the closed money bound, no tolerance")
})
test("should refuse 1 Feb -> 3 Mar 2026 with the whole size-cap string naming 110%", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: 1.096774 is over the cap")
})
test("should refuse 31 Jan -> 1 Mar 2026 at 1.064516", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: three-month range over the cap")
})
test("should refuse 20 May -> 5 Jun 2026 for a FIRST-only org, naming June 2026", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: the F5 hole; old start-month-only code allows this")
})
test("should refuse 28 Apr -> 3 May 2026 for a FIRST-only org, naming May 2026", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: end-month cutoff window inspected")
})
test("should allow a FIRST-only org the same-month custom range 20 May -> 25 May 2026", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: the positive control that ENTERS the month loop")
})
test("should refuse every start day 1-28 May x end day 1-5 June for FIRST, SECOND and both", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: exhaustive cross-month sweep with a refusal count")
})
test("should give the same lock key to two dates in different months for one org", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: the month leaves the lock key")
})
test("should expose arity 1 on payrollRunLockKey and timesheetLockKey", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: a re-added date argument must fail loudly")
})
test("should create a timesheet from a cross-month attendance range and refuse an over-cap one", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: createTimesheetFromAttendance inherits the gate")
})
```

### Dimension findings

- Infra fit: PASS — every path in the Touchpoints table resolves on disk, and the route-group shorthand is now declared in a path note under Touchpoints (`src/routes/(app)/…`, and `NewTimesheetDialog.svelte` in `components/timesheets/`, not `ui/`). All six `pnpm` script names exist (`package.json:13-20`). The C9 orphaned imports are named in C9.3 and in checklist item 23.
- Test coverage: PASS — 20 of 20 criteria carry an automated gate, plus two added by this cycle (AC7b the no-tolerance sweep, AC17b the lock negative control). No Known-Gap rows. The cycle-1 sequencing defect is gone: C9 carries its own e2e edits, so there is no commit at which any tier is red.
- Breaking changes: PASS — the four contract changes each have a grep-verified consumer set. The one inaccurate claim from cycle 1 (the money bound) is resolved by deleting the epsilon rather than restating it; `## Public Contracts` now states a closed `(0, 1]` that is literally true and test-enforced.
- Security surface: PASS — no auth, no secrets, no role gates, no schema. Both refusals are positive restrictions. `describePeriod`'s explicit `sameMonth` guard at `pay-periods.ts:93` makes it impossible for a cross-month range to be classified as a standard shape, so `assertCustomRangeClearOfCutoff`'s `isValidStandardPeriod` early return at `payroll/index.ts:196` can never be used to skip the widened guard. C2-before-C3 holds across the whole sequence. Removing the epsilon *narrows* the accept set by up to 1e-9 and can only refuse more, never less — it cannot open a hole.
- Section A (C1–C2) feasibility: PASS — every edit target located and uniquely matchable. `Math.min(1, share)` at `pay-periods.ts:162`, `isSameMonthRange` at `:128-136`, the start-month derivation at `payroll/index.ts:206-208`. Same-month `summedMonthShare` is bit-identical to today's expression (a one-term accumulation from 0). C2.3's rationales are now narrow and true, with two distinct positive controls.
- Section B (C3–C8) feasibility: PASS — all three gate blocks located (`payroll/index.ts:232-238`, `periods.ts:58-61`, `timesheets.ts:158-161`). The sanity-gate describes are in the assumed order (createPayrollRun `:106`, openPeriod `:135`, createTimesheet `:164`). C7 and C8 are self-contained: no test outside `payroll-month-lock-key.test.ts` touches the three lock helpers, and no file outside the two named imports `isSameMonthRange`.
- Section C (C9–C12) feasibility: PASS with one residual — every cycle-1 defect is fixed and the three bounds are now exact literals with their arithmetic. Residual R-1 below.
- Section D (C13) feasibility: PASS — the tier is real and reachable, and all three sketch errors are corrected. The negative control is out of the committed test and written out as six steps at Live Verification item 9.

### Net gate derivation

| Layer 1 dimensions | Status |
|---|---|
| Infra fit | PASS |
| Test coverage | PASS |
| Breaking changes | PASS |
| Security surface | PASS |

| Layer 2 sections | Status |
|---|---|
| Section A — pure math and the widened guard | PASS |
| Section B — service gates, attendance path, locks | PASS |
| Section C — UI, scripts, documented limitation | PASS |
| Section D — C13 lock serialisation | PASS |

**Totals: 0 FAILs / 0 CONCERNs / 8 PASSes**

**→ Net Gate: PASS**

Why PASS and not CONDITIONAL, stated plainly so it can be overruled: the two items in Open Gaps below are **residuals with a written decision branch already in the plan**, not unresolved concerns. R-1 is a runtime assumption that resolves on its first execution and carries an explicit fallback plus an instruction to record which branch was taken; it cannot block and it cannot silently degrade coverage. R-2 is fully mitigated in-plan. Neither is a gap in the plan's instructions. If the owner reads R-1 as a concern rather than a residual, the correct gate is CONDITIONAL and nothing else changes — every fix is already written.

### Open gaps (residuals, each with a named branch)

- **R-1 — the e2e over-cap fill is an untested runtime assumption.** Any over-cap end date is by construction past the `max` this change computes for that start (start `2026-06-03` → `max` `2026-07-02`, the case fills `2026-07-05`). The expectation is that `max` on `<input type="date">` is a validation constraint, not an input filter, so Playwright's `fill()` sets the value, the browser marks it `:out-of-range`, and the inline message renders. This cannot be verified by reading source — it needs a run. **Branch written into C9.6:** if the harness clamps or rejects the value, assert the `max` attribute there instead and let C1.7's whole-string `customRangeError` assertion carry the size-cap copy proof (it already does, on `1 Feb → 3 Mar` at 110%). Record which branch was taken. Coverage loss under the fallback is nil — the unit assertion is the stronger proof of copy correctness, and C10's new spec still exercises rendering.
- **R-2 — the C1.7 sweep's canary count is coupled to the enumeration bounds.** Mitigated: the plan derives 69,876 arithmetically (`118² + 4×118² + 4⁴`) so a mismatch points at the loop bounds rather than at the arithmetic, and says so explicitly.
- **AC19 live scan** — `scripts/legacy-nonstandard-runs.ts` has never been run against a real database. Read-only, scheduled as Live Verification item 8. Until it runs, the size of the legacy-row movement is unmeasured. Cannot block: nothing recomputes without an operator action.
- **Live Verification item 1** — the per-database allocation census is a measurement nobody has taken. It determines how many orgs the D1 total refusal affects. Scheduled, not yet run.
- **No unit-level component test for `PeriodPicker.svelte`** — its only automated coverage is e2e, which needs `pnpm build` + preview and so never runs on a fast inner loop. Out of scope; recorded so it is not lost.
- **The `payroll/periods` field-name pairing is checked by nothing in the type system.** C10's new e2e assertion is the only guard. A typed prop contract is the real fix and is out of scope.

### What this coverage does NOT prove

- The C1.7 tuple sweep proves no float/exact divergence exists for the accumulation `summedMonthShare` performs. It does **not** prove it for a different accumulation — if a future change reorders the sum or introduces an intermediate rounding, the property must be re-derived. That is precisely why it is a test and not a comment, but the test only guards the order it replicates.
- `pnpm test tests/unit/pay-periods.test.ts` proves the arithmetic and the frozen shapes. It does **not** prove any stored row in any real database moves the way the arithmetic says — only the AC19 live scan shows that.
- `pnpm test tests/unit/payroll-custom-range-cutoff-guard.test.ts` proves the month loop and the message. It does **not** prove the Prisma `where` reaches Postgres correctly — the client is mocked, so a wrong column name or enum value would still pass. No test in this plan executes that query for real.
- `pnpm test tests/unit/payroll-period-sanity-gate.test.ts` proves the gate refuses before the transaction. It does **not** prove no audit row is written on refusal — `writeAuditLog` is mocked; that proof is structural (the gate sits above `db.$transaction`), not executed.
- `pnpm test tests/unit/payroll-month-lock-key.test.ts` proves the key STRING and its arity. It does **not** prove `pg_advisory_xact_lock` serialises anything.
- `pnpm test:integration` (C13) proves two concurrent overlapping-range creates leave exactly one row and the loser gets the overlap 409. On its own it does **not** prove the lock is *why* — a passing test with the lock removed would mean it proves nothing. Only Live Verification item 9's green→red→green mutation check closes that, and it is manual and run once.
- `pnpm build && pnpm test:e2e` proves the three mounts render, bound and refuse in a real browser. It does **not** prove any money figure — no payslip is computed or read in the e2e tier.
- `payroll-basic-pay-share-passthrough.test.ts` proves basic pay is unclamped at `earnings.ts:71`. It does **not** prove the same for allowances, incentives, benefit cost or loan amortisation — those share the value but have no passthrough assertion of their own.
- The Live Verification Checklist is owner-judged. It proves nothing mechanically and leaves no artefact unless the results are written back into this plan.

### Execute-agent instructions

| # | Instruction | Trigger |
|---|---|---|
| E1 | The cap is the bare `share > 1`. Do NOT reintroduce a constant or a tolerance "to be safe" — that was settled by exhaustive enumeration, and C1.7's sweep is the standing proof. If the sweep ever goes red, the accumulation changed; re-derive, do not add an epsilon. | C1 entry |
| E2 | Use the exact bounds in C9.6's table (`2026-07-02`, `2026-03-09`, `2026-05-11`). If your implementation yields a different bound, the walk is off by one — STOP and report. Do not adjust the assertion to match the code. | C9 entry |
| E3 | C9 is not done until `pnpm build && pnpm test:e2e` is green. Its spec edits are part of the commit, not deferred to C10. | C9 exit |
| E4 | C13 is MANDATORY. Do not mock `$lib/server/db` in the integration test. Assert the **overlap** 409 from `assertNoOverlappingRun` (`payroll/index.ts:129`), not the duplicate 409. No lock-removed control inside the file. | C13 entry |
| E5 | `pnpm check` kills a running dev server and e2e needs `pnpm build` + preview — never concurrent. `pnpm format:check` runs FIRST in CI and stops the rest, so run it first locally too. | every gate |
| E6 | The user starts `./start.sh` and `veent-db-5434`. Ask; never launch them. `pnpm test:integration` and the AC19 live scan both block on this. | C13 / Live Verification |
| E7 | If any of `pay-periods.test.ts:130-145`, `payroll-standard-period-golden.test.ts:43-44` or `payroll-calculator.test.ts:73-79` goes red, STOP. A short-circuit was reordered or `summedMonthShare` is not bit-identical for same-month input. Do not edit those lines to make them pass. | every Section A commit |
| E8 | At Live Verification item 9, restore the commented-out lock line with `git checkout -p` on that hunk or by re-typing. **Never `git checkout <file>`** — it silently reverts every uncommitted change in that file. | Live Verification |

Gate: PASS (0 FAILs, 0 CONCERNs after one plan-validate-fix cycle; all 8 cycle-1 concerns resolved in the plan body; two residuals carry written decision branches; no developed behaviour rests on a Known-Gap)
Accepted by: owner (explicit, this session) — directions A, B and C given and applied; direction A was verified against a request for a counterexample and none exists. Cycle-1 concerns C-1 through C-8 are resolved rather than accepted, so there is no outstanding accepted-concern list.

---

## Autonomous Goal Block

```
SESSION GOAL
Ship Veent HRIS issue #3 — cross-month custom payroll periods — on branch
feat/cross-month-periods-3, as one PR against staging.
Plan: process/features/flexible-periods/active/cross-month-periods-3_02-09-26/cross-month-periods-3_PLAN_02-09-26.md
Reference for latest state: the same plan file's Resume and Execution Handoff section.

CONTRACT SUMMARY
Validate gate: PASS, after one plan-validate-fix cycle. 0 FAILs, 0 CONCERNs.
The plan body is current — execute it as written, no pre-EXECUTE plan edits needed.
Owner rulings already folded in: the cap is the bare `share > 1` with NO epsilon and no
constant; C9 carries its own e2e spec edits; C13 is mandatory.

NEXT PHASE
EXECUTE. Commit order, exactly:
C0 -> C1 -> C2 -> C3 -> C4 -> C5 -> C6 -> C7 -> C9 -> C8 -> C10 -> C11 -> C12 -> C13
C2 must never land after C3 — that ordering is a security constraint, not a preference.
C9 runs before C8, and carries the period-picker-default-cutoff.spec.ts edits itself,
so every tier is green at every commit.

AUTONOMY RULES
- Each commit is its own gate. If a gate is red, fix the code, never the frozen assertion.
- Do NOT reintroduce a cap constant or an epsilon. The bare `share > 1` was settled by
  exhaustive enumeration (69,876 tuples, 116 exact-1, zero divergence). C1.7's sweep guards it.
- Use C9.6's exact bound literals: 2026-07-02, 2026-03-09, 2026-05-11. Do not re-derive by eye.
  A different bound means the walk is off by one — stop and report.
- pay-periods.test.ts:130-145, payroll-standard-period-golden.test.ts:43-44 and
  payroll-calculator.test.ts:73-79 are frozen rails. Red there means STOP and report.
- Blocked items go to process/features/flexible-periods/backlog/ as a NOTE. Always find a
  path to proceed with the remaining commits.
- Run all six gates: pnpm format:check (FIRST), pnpm lint, pnpm check, pnpm test,
  pnpm build && pnpm test:e2e, pnpm test:integration.
- No Co-Authored-By trailer. No AI attribution in any commit or PR body. pnpm, never npm.

HARD STOPS
- Do NOT start ./start.sh, vite, or the veent-db-5434 container. Ask the owner.
- Do NOT push or open the PR without the owner saying so.
- Do NOT run the Live Verification Checklist (D7) without the owner present.
- Do NOT run pnpm check while a dev server or the e2e preview is up.
- Never `git checkout <file>` to undo a temp edit — it reverts uncommitted work.
- Any schema change, migration, or db push is out of scope — stop and ask.

EXECUTE START COMMAND
ENTER EXECUTE MODE for process/features/flexible-periods/active/cross-month-periods-3_02-09-26/cross-month-periods-3_PLAN_02-09-26.md
Start at C0 pre-flight.
```
