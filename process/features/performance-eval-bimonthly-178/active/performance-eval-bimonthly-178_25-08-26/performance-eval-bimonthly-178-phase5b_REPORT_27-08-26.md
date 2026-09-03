---
phase: phase5b-pure-cycle-planner
date: 2026-08-27
status: COMPLETE
feature: performance-eval-bimonthly-178
plan: process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_PLAN_25-08-26.md
---

## What Was Done

Plan items 92 and 93 only. Two NEW files, no existing file touched.

- `src/lib/server/performance/cycle-plan.ts` — pure. No DB, fs, network, `Date.now()` or
  zero-argument `new Date()`. Only import is `$lib/utils/dates` (`addUTCMonths`, `manilaDayKey`).
  Exports `DEFAULT_INTERVAL_MONTHS = 2`, `isCycleDue`, `nextCyclePeriod`, `planReviewsForCycle`,
  plus the types `CyclePeriod`, `UnreviewableReason`, `PlannableEmployee`, `PlannedReview`,
  `UnreviewableEmployee`.
- `tests/unit/performance-cycle-plan.test.ts` — 32 tests, all green.

Period convention chosen and pinned: periods are CLOSED at both ends and never overlap
(Aug 1 – Sep 30, then Oct 1 – Nov 30). The first period of an organization is month-aligned
off the MANILA month of `now`, so every later period inherits that alignment and the generated
name is exactly the plan's example shape, `"Aug–Sep 2026"`.

## Bug Found And Fixed During The Beat

The first draft computed the due-boundary as `addUTCMonths(lastCycleEnd, intervalMonths)`. The
Manila-boundary test went RED and exposed a second, worse defect: `addUTCMonths` overflows short
months by design, so a Jul 31 close stepped to **Oct 1**, while a Sep 30 close stepped to Nov 30
— a day EARLY, before the period it covers has even ended. Every month-end cadence would have
been a day wrong, in an inconsistent direction.

Fix: `isCycleDue` now derives its boundary from `nextCyclePeriod(...).endDate` and returns
`manilaDayKey(now) > manilaDayKey(endDate)`. One definition of the boundary, shared by both
exports, so they cannot drift; overflow cannot enter because `nextCyclePeriod` steps from the
period START, not its end. Pinned by `is not thrown off by a month-end close date`.

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `pnpm test tests/unit/performance-cycle-plan.test.ts` | 32/32 pass |
| `pnpm test` | 164 files / 1919 tests pass (was 163/1887 before this section) |
| `pnpm check` | 1032 files, **0 errors**, 1 warning (pre-existing `CalculatorWindow.svelte` a11y) |
| `pnpm lint` | 0 errors, 1 warning (same pre-existing one) |
| `pnpm format:check` | clean |

**Mutation check (the tests are not vacuous).** Two mutations applied together and reverted:
`>` → `>=` in `isCycleDue`, and short-circuiting the `no-manager` reason on the first failure.
Result: **5 tests went red** — the three boundary cases and both both-reasons cases. Restored
from a scratchpad copy (never `git checkout`).

## Plan Deviations

1. **`reasons: UnreviewableReason[]`, not `reason:`.** Item 92 names a singular `reason` field
   yet also requires an employee missing both a template and a manager to report BOTH. A single
   field cannot. One entry per employee with an ordered reason array is the smallest shape that
   satisfies the requirement. Within blast radius: the only future consumers are items 94/95 in
   this same phase, not yet written.
2. **`PlannableEmployee.templateStructureValid?: boolean`** carries the `template-invalid` signal
   into the pure planner. The `templateStructureSchema.safeParse` itself stays in the service
   (item 94), which needs the parsed structure for `templateSnapshot` anyway; the planner must
   not re-parse. Defaults to `true`, read only when a template is assigned.
3. **`nextCyclePeriod` ignores `now` when `lastCycleEnd` is set.** The parameter is kept because
   the signature is fixed by the plan, and it is genuinely read for the seed period. Documented
   at the function — the independence from `now` is precisely what makes "no catch-up" true.

## Test Infra Gaps Found

None. `$lib` alias resolves in vitest (as `backup-plan.test.ts` already showed), and the module's
purity means the file needs no DB, no fake timers and no ambient TZ.

## Closeout Packet

- Finished: items 92, 93.
- Verified: all four gates plus a 5-red mutation check.
- Unverified: nothing in this section. The cron shell (item 98) that consumes these exports does
  not exist yet, so "the shell calls them correctly" remains untested, exactly as §11.1 predicted.
- Next: item 94 — rewrite `openReviewsForCycle` in `src/lib/server/services/performance.ts` to
  call `planReviewsForCycle`.
- State: **Keep in active/testing** — Phase 5 is not finished (items 94–103 remain).

## Forward Preview

**Test infra found.** Nothing new needed. Pure-module unit tests run under the default `pnpm test`.

**Blast radius changes.** Two new files, both listed in the plan's §Blast Radius already
(`src/lib/server/performance/{types,schemas,cycle-plan,...}.ts`). No existing file modified.

**Commands to stay green.** `pnpm test tests/unit/performance-cycle-plan.test.ts`, `pnpm check`,
`pnpm lint`, `pnpm format:check`.

**Dependency changes.** None.

**For item 94/95.** `planReviewsForCycle(employees, existingEmployeeIds)` expects
`{ id, reportsToId, assignedTemplateId, templateStructureValid? }` and returns
`toCreate: { employeeId, reviewerId, templateId }[]` plus
`unreviewable: { employeeId, reasons }[]`. The service must set `templateStructureValid` from
`templateStructureSchema.safeParse(...).success`. `openReviewsForCycle`'s return becomes
`{ opened, unreviewable }`.
