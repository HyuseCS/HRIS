---
name: report:clearance-signoff-297-execute
description: "EXECUTE report for #297 — D3/D4/D8 guards built, 21 unit tests, all eight mutations RED; live steps L0–L6 deferred to a follow-up pass"
date: 18-08-26
feature: general-plans
plan: process/general-plans/active/clearance-signoff-297_PLAN_17-08-26.md
status: COMPLETE_WITH_GAPS
---

# #297 clearance sign-off — EXECUTE report

Date: 18-08-26 · Branch `feat/separation-of-duties-298-297` · Nothing committed, tree left dirty.

**TL;DR** — Checklist steps 1–14 are done. `pnpm test` 122 files / 1467 tests green, `pnpm check`
0 errors, `pnpm lint` 0 errors, `pnpm format:check` clean. All eight mutations M1–M8 were RUN and
every one went RED on its named target. Step 15 (live L0–L6) is NOT done — it is the follow-up
pass. One plan discrepancy found in live step L2e, described below.

## What was done

| File | Change |
|---|---|
| `src/lib/server/services/separation.ts` | +66 lines. `ClearanceActorRef` + pure `clearedAnyItem` after `getSeparation`; `finalizeBarFor` (scoped `employee.findUnique({select:{userId:true}})`, self bar then clearer bar); D8 precondition in `setClearanceItem` after the FINALIZED check; the `bar` block in `finalizeSeparation` above the pending-items check. |
| `src/routes/(app)/separations/[id]/+page.server.ts` | `finalizeBarFor` imported; `load` returns `finalizeBar: string \| null` (null when FINALIZED). |
| `src/routes/(app)/separations/[id]/+page.svelte` | `const finalizeBar = $derived(data.finalizeBar)`; amber pre-tick warning in the checklist header; bar message under the Finalize card; `disabled={pendingCount > 0 \|\| !!finalizeBar \|\| finalize.busy}`. The checklist header row was wrapped in an inner flex div so the warning sits below it and does not fight `justify-between`. |
| `tests/unit/separation-characterization.test.ts` | NEW, 4 tests — the step-3 hard gate. |
| `tests/unit/separation-finalize-sod.test.ts` | NEW, 12 tests. |
| `tests/unit/separation-clearance-reclear.test.ts` | NEW, 5 tests. |
| `clearance-signoff-297_PLAN_17-08-26.md` | E2 only — a §6.2 pointer recording why the self bar is 403. E1 needed no edit; the Phase Completion Rules already read `M1-M8`. |

`git status` shows exactly 3 modified source files and 3 new test files. No schema, no payroll, no
audit-log page touched.

## Ordering actually followed (TDD)

1. `pnpm prisma generate`.
2. Characterization file written against UNMODIFIED code → **4/4 GREEN** (step-3 hard gate passed).
3. All 17 named tests written as throwing stubs → **17/17 RED**, recorded.
4. Guards implemented.
5. Stubs replaced with real assertions → 21/21 green, characterization still green.

## Mutation results — all eight RUN

Each mutation was applied to a pristine copy, the three separation files re-run, then reverted.

| # | Mutation | Named target | Result |
|---|---|---|---|
| M1 | `clearedAnyItem` drops the `clearedById` comparison | `finalize-allows-clean-actor` | **RED** — target red, plus `clearedAnyItem: only others cleared`, `finalize-allows-other-for-self-case`, `existing-cases-unaffected`, and the characterization happy path (5 failed / 16 passed) |
| M2 | `clearedAnyItem` inverted to `!==` | `finalize-refuses-clearer` | **RED** — target red, plus 7 others (8 failed / 13 passed) |
| M3 | self check moved BELOW the clearer check | `finalize-guards-independent` | **RED** — exactly that one test (1 failed / 20 passed) |
| M4 | `bar` block moved BELOW pending-items | `finalize-bar-above-pending` | **RED** — exactly that one test (1 failed / 20 passed) |
| M5 | D8 drops `item.clearedById !== ctx.actorId` | `reclear-allowed-for-original-clearer` | **RED** — exactly that one test (1 failed / 20 passed) |
| M6 | D8 gated on `cleared === true` only | `unclear-refused-for-other-actor` + `d3-not-defeatable-by-reclear` | **RED** — both named targets (2 failed / 19 passed) |
| **M7 — DELETE** | the whole `if (employee?.userId === actorId) { return … }` block removed | `finalize-refuses-self` | **RED** — target red, plus `finalize-guards-independent` and `self-guard-consistent-with-offboard` (3 failed / 18 passed) |
| **M8 — DELETE** | the whole `if (bar) error(403, bar)` line removed | `finalize-refuses-clearer` AND `finalize-refuses-self` AND `d3-not-defeatable-by-reclear` | **RED** — all three named targets, plus `finalize-guards-independent` and `finalize-bar-above-pending` (5 failed / 16 passed) |

M1 and M2 also turn the characterization happy path red. That is honest, not a defect: both
mutations make the baseline's uninvolved actor wrongly barred, which is exactly what the
characterization file exists to detect.

## Gate results

- `pnpm test` — 122 files, 1467 tests, all passing (~18s).
- `pnpm check` — 0 errors, 1 pre-existing a11y warning in `CalculatorWindow.svelte` (untouched).
- `pnpm lint` — 0 errors, the same 1 pre-existing warning.
- `pnpm format:check` — clean.

## Plan deviations

1. **`d3-not-defeatable-by-reclear` fixture — two items, not one.** The plan's step-3 assertion
   ("finally `finalizeSeparation` as B still refuses") cannot hold if B is uninvolved: with steps 1
   and 2 correctly refused, B never becomes a clearer, so B is not barred and would legitimately
   finalize — that is L3. The test therefore uses a case with `ci1` cleared by A and `ci2` cleared
   by B, so B has both a bar and a motive to launder ownership. Every assertion the plan names
   still holds literally: 403 at both `setClearanceItem` steps, `clearanceItem.update` never
   called, `clearedById` still A, and a 403 at finalize with nothing written.
2. **Checklist header markup.** §6.6 says place the warning "as its own block below the header
   row, not inside the flex row". Achieved by wrapping the existing `h2` + counter in an inner
   `div.flex`, since the outer `div` itself carried `flex justify-between`. Same rendered result,
   one extra wrapper.
3. **`clearedAnyItem` pure-test literals carry no `id`.** TypeScript excess-property checking
   rejects `id` on a `ClearanceActorRef` object literal passed directly. Dropped from those three
   literals only.

## Live steps still outstanding (step 15) — NONE were run

All live verification is deferred to the follow-up pass, per the execute handoff.

| Step | What it needs |
|---|---|
| L0, L0b | Dev server up. Create case `SOD297-CASE-1` by hand as admin A — `separation_records` is empty. |
| L1 | A real browser. Screenshot the amber warning before the first tick. An assertion cannot tell a hidden element from a missing one. |
| L2 | Browser tick-all as A, then a curl-forced finalize POST + psql assertion that the record is still not FINALIZED. |
| L2b, L2c | curl POSTs as B (un-tick / re-tick A's item) + psql on `clearance_items.clearedById`. |
| L2d | The success side — A un-ticks and re-ticks their own item; both must succeed. |
| L2e | Three curl POSTs as B end to end. **See the discrepancy below.** |
| L3 | B finalizes; assert the DB row — FINALIZED, `finalPayAmount` non-null, employee OFFBOARDED, user `isActive` false. |
| L4 | Case `SOD297-SELF` for A's own employee record; A refused, B succeeds. |
| L5 | Case `SOD297-LEGACY` opened and ticked BEFORE the guards, re-checked after. This one is already partly unrunnable as written — the guards are now in the working tree, so the "before" half needs a stash or a null-`clearedById` row planted by psql. |
| L6 | CEO `ceo@veent.ph` switches into `org_jojo` and `org_sweetleaf` and finalizes in each. The no-carve-out decision rests on this. |
| Before-and-after | The whole L1–L4 + L2b–L2e "before" pass was never taken — the tree already carries the guards. To honour `verify-live-before-and-after.md`, run the "before" half from a stashed tree first. |

**L2e — RESOLVED, and the resolution is a two-item case** (plan fixed in `9981781`; this paragraph
previously carried the open question and is superseded).

L2e needs a case with **two** clearance items, set up so that **A clears `ci1` and B clears `ci2`**
_before_ B starts the ownership-laundering sequence. Only then is B a clearer in their own right, so
B's finalize must return **403** — which is the assertion, and it stays. The earlier reading that
would have weakened it to "assert the record is unchanged" was wrong for a one-item case and is
moot for a two-item one: on `SOD297-CASE-1` A had cleared everything and B nothing, so B was never
barred and the step could not have failed.

This matches the unit-test state exactly — `separation-finalize-sod.test.ts` builds the same
two-clearer shape for the D8 defeat route (AC-9.4). Nothing here is left to interpret live.

## Known gaps carried forward (unchanged from the contract)

- G6 D8 stranding: once A clears an item, only A may change it. Recorded for the owner, not built,
  no issue filed. No test covers it.
- Nothing stops the SUBJECT of a separation clearing their own clearance items.
- `computeFinalPay` arithmetic, `createSeparation`, `listSeparations`, `generateSeparationReport`
  and all three routes stay untested (#305).
- `offboardEmployee` keeps its outlier 400. Deliberate.
- The unit suite mocks the DB. It cannot prove a 403 reaches a real HTTP client, nor that
  `clearedById` matches a real session's user id. Only the live steps can.

## Closeout

- Selected plan: `process/general-plans/active/clearance-signoff-297_PLAN_17-08-26.md`
- `CODE DONE` — yes (steps 1–13).
- `TESTED` — yes (M1–M8 all run, all RED on target, all reverted).
- `✅ VERIFIED` — **no.** Live L0–L6 not run; no user confirmation.
- State: **Keep in active/testing.** Nothing committed.
