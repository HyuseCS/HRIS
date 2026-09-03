---
phase: phase-1-162-am-pm-split
date: 2026-08-17
status: COMPLETE
feature: timesheet-capture
plan: process/features/timesheet-capture/active/timesheet-capture-162-177-200_17-08-26/timesheet-capture-162-177-200_PLAN_17-08-26.md
---

# EXECUTE report — Phase 1 (#162 AM/PM split + Amendment 1 per-org threshold)

Phase 1 only. Stopped at the §1.9 gate. Nothing committed. Phases 2 and 3 not started.

## What Was Done

All 15 Phase 1 checklist items plus all 13 Amendment 1 suffixed items (1a, 3a, 3b, 5a, 6a, 7a,
8a, 8b, 9a, 10a, 12a, 14a, 15a).

| File | Change | Lines (± vs HEAD) |
|---|---|---|
| `prisma/schema.prisma` | 4 nullable `AttendanceDay` columns + `Organization.amPmMinGapMinutes Int?` | +16 |
| `src/lib/server/services/attendance/derive.ts` | 4 result fields, `splitAmPm`/`amPmMinGapMs` inputs, `splitAmPmBlocks`, default + bounds + `isValidAmPmMinGap` | +122 |
| `src/lib/server/services/attendance/index.ts` | `isFoodServiceOrg` import; both org `select`s widened; `deriveRange` + `correctDay` pass the flag and persist 4 fields | +37 −4 |
| `src/lib/server/services/attendance/schedules.ts` | `setOrgAmPmMinGap` | +30 |
| `src/routes/(app)/attendance/+page.server.ts` | `showAmPm` | +4 −1 |
| `src/routes/(app)/attendance/+page.svelte` | 4 headers + 4 read-only cells × 2 tables, 2 colspans | +30 −2 |
| `src/routes/(app)/attendance/export/+server.ts` | `amPmCols()` spread into every row, both branches | +27 |
| `src/routes/(app)/settings/schedules/+page.server.ts` | `load` widened + 3 values; `setAmPmMinGap` action | +55 −5 |
| `src/routes/(app)/settings/schedules/+page.svelte` | threshold card | +31 |
| `tests/unit/reports-csv.test.ts` | E2 header-set case (2 tests appended; no existing case touched) | +21 |
| `tests/unit/attendance-am-pm-split.test.ts` | **new** — A1–A13 | +235 |
| `tests/unit/attendance-ampm-gap-setting.test.ts` | **new** — A14–A21 + the `load` spec | +235 |
| `tests/unit/attendance-ampm-threshold-wiring.test.ts` | **new** — `deriveRange` gating + threshold read | +176 |
| `tests/unit/payroll-am-pm-days-of-work.test.ts` | **new** — criterion 3 + the E1 seam | +145 |
| `tests/unit/hours-engine-parity-am-pm.test.ts` | **new** — criterion 4 | +81 |
| `tests/unit/attendance-export-am-pm.test.ts` | **new** — E2 at the route | +105 |
| the PLAN file | corrections P1, P7, E6, A-P1…A-P5 + 3 defects found live | +64 −24 |

Schema: `pnpm db:push` then `pnpm prisma generate`, both run; the five new columns are present in
`veent-db-5434`. No enum change, no `scripts/migrate-*.ts`, no data migration.

## Contract items, one by one

### Execute-agent instructions E1–E9

| # | Verdict |
|---|---|
| **E1** | **Applied.** `payroll-am-pm-days-of-work.test.ts` runs two rows differing only in the four AM/PM columns through the REAL `buildAttendanceInput` and deep-equals the results, plus a "poisoned" variant whose AM/PM values contradict the day entirely. |
| **E2** | **Applied, twice.** A case in `reports-csv.test.ts` pins the `Object.keys(rows[0])` rule; `attendance-export-am-pm.test.ts` pins the actual route (headers present/absent, day-less rows first AND last, uniform field count on every line, both view branches). |
| **E3** | **Not applicable — Phase 3** (`/punch` route org scoping). |
| **E4** | **Not applicable — Phase 2** (import caps). |
| **E5** | **Row 8 applied** (the `amPmCols` uniform spread — mutation M20, RED). Rows 1–7 are Phase 2/3 (62-day span, NUL byte, BOM, `.csv` extension, `toFail` widening, `recordPunch` exactly-one-of, accuracy qualifier). |
| **E6** | **Applied** to the plan text: M2 step 2 now asserts **9** `<th>`s for a Veent HR user (the `{#if data.canManage}` actions column) and names the four headers that must be absent. |
| **E7** | **Applied.** A2 is now "deep-equal after deleting the four AM/PM keys from both results". |
| **E8** | **Not applicable — Phase 2** (B6/B10/B11/B12 mocks). |
| **E9** | **Not applicable — Phase 3** (`listPunches` call-site gate). |

### Plan corrections P1–P8

| # | Verdict |
|---|---|
| **P1** | **Applied.** Resolution taken: the non-`editingTimes` branch deliberately PRESERVES the stored split, stated in both the code comment and §1.3c. Rationale: that branch already preserves `timeIn`/`timeOut`, so the split still describes the punches it came from; clearing it would make a note edit erase a correct split. R11 folded into the same resolution. |
| **P2, P3, P4, P5, P6** | **Not applicable — Phase 2/3.** |
| **P7** | **Applied** to §1.3c: `scripts/seed-attendance-demo.ts:101` and `scripts/seed-payslip-demo.ts:58` recorded as `AttendanceDay` writers that bypass AM/PM (harmless — nullable — but the upsert leaves stale values on re-seed, and `pnpm check` covers neither path). |
| **P8** | **Not applicable — Phase 2** (`time_logs` unique index + `BODY_SIZE_LIMIT`). |

### Amendment instructions A-E1 – A-E7

| # | Verdict |
|---|---|
| **A-E1** | **Applied and then beaten.** The plan's mutation row 1 was doubly broken as diagnosed. A-E1's replacement ("delete the `amPmMinGapMs` key; accept that nothing goes red") is **no longer the best available**: `tests/unit/attendance-ampm-threshold-wiring.test.ts` mocks `db` the way `attendance-autoderive.test.ts` already does — which §1.11.7 explicitly permits — and runs `deriveRange` end-to-end with the REAL derive engine. A-E1's mutation (M8) now goes **RED**, and so does the org-gating mutation (M1) that §1.7 row 1 also mis-targeted. The NULL→default fallback has real automated coverage; it is no longer a residual. |
| **A-E2** | **Applied, option (a).** Regex kept, its justification rewritten (§1.11.5) to say plainly that `Number.isInteger` is the actual gate, and spec **A16a** now pins the regex's three genuinely unique cases — `'1e2'`, `'0x1E'`, `'+45'`, each of which coerces to a valid IN-RANGE integer (100, 30, 45). Deleting the regex turns A16a **RED** (M15). The mutation row is real now. |
| **A-E3** | **Applied with one deviation.** A16 split into A16a (whole-number message) and A16b (bounds message), both asserting `organization.update` was never called. **Deviation:** A-E3 puts `'-30'` in the bounds group; against the §1.11.5 parse the sign is rejected before any bound is consulted, so `'-30'` belongs in the whole-number group. A-E3 as written would go red against correct code. `' '` also moved out: `.trim()` runs first, so whitespace takes the empty-clears branch. |
| **A-E4** | **Applied and strengthened.** A-E4 says `Number.isFinite` is unprovable; it is provable. A12 now uses **two** punch sets: a 2-hour gap that DOES split under the default (so `NaN`/`Infinity` falling through would stop the split — proves `Number.isFinite`) and a 20-minute gap that does NOT (so `-1`/`0` falling through would create one — proves `> 0`). Mutation M11 (whole guard) and M11b (`Number.isFinite` alone) both go **RED**. `Number.isFinite` is no longer a known gap. |
| **A-E5** | **Applied.** Only `$lib/server/db` and `$lib/server/audit` are mocked; `attendance/schedules` is real; the constraint is written at the top of the file. A15 asserts `organization.update` with `data: { amPmMinGapMinutes: null }`, not a service spy. |
| **A-E6** | **Applied.** New spec **A21** calls `setOrgAmPmMinGap` directly with 241 / 4 / 12.5 and asserts a 400 with no `update` and no audit write. Deleting the in-service check turns it RED (M17). |
| **A-E7** | **Applied** (not deferred). Two `load` specs: `showAmPmGap` true + stored 15 + default 30 for `org_jojo`; false + null for `org_veent`. This is the one place the where/select-keyed `findUnique` mock is load-bearing. |

### Amendment corrections A-P1 – A-P5

| # | Verdict |
|---|---|
| **A-P1** | **Applied.** §1.11.8 row 2 now records `correctDay`'s wiring as behaviourally dead — kept for symmetry, NOT counted as a covered twin door. No test claims it. |
| **A-P2** | **Applied** to R10, and mirrored in the `splitAmPmBlocks` doc comment: the longest-gap rule means the threshold can only turn a boundary ON or OFF, never move one; the dangling-IN case is the only exception. |
| **A-P3** | **Applied** to R10: the CSV export carries AM/PM out of the application, so a fake split can reach a payroll processor's spreadsheet even though D2 keeps it out of `payroll/calculator.ts`. |
| **A-P4** | **Applied** to §1.11.5 and to the bounds comment in `derive.ts`: 240 stops 600, it does not stop the "silently off" mode. Recorded as an accepted residual. |
| **A-P5** | **Applied.** R11 now names **locking** as the real dead end (`resetDay` recovers a `manuallyEdited` day; `resetDayToDerived` refuses a locked one with 409). §1.11.5's regex justification and §1.11.7's mock-discipline rationale both corrected (the keyed mock protects `load`, not A19; A19 is proved by the `update` `where.id`). |

## Test Gate Outcomes

Four CI gates, in CI's order, run after the mutation runs were reverted:

| Gate | Result |
|---|---|
| `pnpm format:check` | **PASS** — "All matched files use Prettier code style!" (needed one `pnpm format` write pass mid-implementation) |
| `pnpm lint` | **PASS** — 0 errors, 1 warning (pre-existing: `CalculatorWindow.svelte:82` a11y static-element-interaction) |
| `pnpm check` | **PASS** — 913 files, **0 errors**, 1 warning (the same pre-existing one) |
| `pnpm test` | **PASS** — **113 files / 1350 tests**, 0 failures (baseline at `b2e1b42`: 107 files / 1304 tests) |

+6 test files, +46 tests. **No pre-existing test was edited to make anything pass** — the only
change to an existing test file is two appended cases in `reports-csv.test.ts`, required by E2.

## Mutation Table — actual results

21 mutations, each applied by script, targeted specs run, then reverted and re-run green.
**21 RED / 0 stayed green.**

| # | Mutation | Target spec(s) | Result |
|---|---|---|---|
| M1 | `index.ts`: `isFoodServiceOrg(organizationId)` → `true` | wiring "four nulls for a non-food-service tenant" | **RED** |
| M2 | `splitAmPmBlocks`: take the first gap, not the widest | A3 | **RED** |
| M3 | `DEFAULT_AM_PM_MIN_GAP_MINUTES = 0` | A4, A9, wiring | **RED** |
| M4 | tie scan `>` → `>=` | A7 | **RED** |
| M5 | display-only: subtract the AM/PM gap from `netWorkedMs` under `splitAmPm` | A1, A2, payroll ×2 | **RED** |
| M6 | `emptyResult` stops clearing the four fields | A6 | **RED** |
| M7 | `result.timeIn = amIn` | A8 | **RED** |
| M8 | `deriveRange` stops passing `amPmMinGapMs` (**A-E1's replacement row**) | wiring 15-splits | **RED** |
| M9 | `splitAmPmBlocks` ignores `minGapMs`, uses the default | A10, wiring | **RED** |
| M10 | compare against `minGapMs / 2` | A11 | **RED** |
| M11 | finite/positive fallback deleted entirely | A12 | **RED** |
| M11b | **only** `Number.isFinite` deleted | A12 | **RED** |
| M12 | threshold cached in module-level state | A13 | **RED** |
| M13 | `AM_PM_MIN_GAP_FLOOR = 0` | A14, A16b | **RED** |
| M14 | `AM_PM_MIN_GAP_CEILING = 100000` | A14, A16b | **RED** |
| M15 | strict `/^\d+$/` parse deleted (**A-E2's replacement row**) | A16a | **RED** |
| M16 | empty field rejected instead of clearing | A15 | **RED** |
| M17 | service-layer bounds check deleted (**A-E6**) | A21 | **RED** |
| M18 | `requireFoodServiceOrg` deleted from the action, render gate left | A18 | **RED** |
| M19 | action reads `organizationId` from the form | A19 | **RED** |
| M20 | `amPmCols` spread onto rows with a day only (**E5 row 8**) | export field-count | **RED** |

First attempt at M5 stayed green because the mutation was applied outside the `splitAmPm` branch,
so it moved both sides of the on/off comparison equally. Re-applied inside the branch — RED. That
is recorded because it is the honest history, not a clean result.

Two of the plan's own mutation rows were replaced, both because the stated mutation could not go
red: §1.7 row 1 and §1.11.7 rows 1, 8 and 10. All four replacements are RED above.

## Plan Deviations

1. **A-E3's `'-30'` grouping** — moved to the whole-number message group (see A-E3 above). The
   plan's grouping goes red against correct code.
2. **A-E1 and A-E4 exceeded, not merely followed.** Both told me to accept a residual; both
   residuals turned out to be coverable, so I covered them and the corresponding mutations go RED.
   Recording this as a deviation because the contract text says "record it as a named residual".
3. **One extra test file** beyond the plan's four: `attendance-ampm-threshold-wiring.test.ts`. It
   is what makes A-E1's and §1.7 row 1's mutations able to fail. §1.11.7 permits exactly this
   ("only if that file already mocks the org `findUnique`" — `attendance-autoderive.test.ts` does,
   at `:56`), and it is a NEW file, so no pre-existing test was touched.
4. **`attendance-export-am-pm.test.ts`** is a second E2 file. E2 names only `reports-csv.test.ts`;
   `amPmCols()` is a route-local closure, so a `reports-csv` case alone would test a copy of the
   helper, not the helper. Both were written.
5. **Bounds comparison in the action** is inline (`minutes < FLOOR || minutes > CEILING`) rather
   than a second `isValidAmPmMinGap` call, so the two 400s carry different messages as A-E3
   requires. `isValidAmPmMinGap` remains the service-layer gate and the A14 subject.

## Plan claims found WRONG against live code

1. **§1.7 test 3 (engine parity) claimed the two engines "must agree to within 0.01 h".** They do
   not. Measured: engine B pays **8.00 h**, engine A pays **7.00 h** on the same split shift with a
   12:00–13:00 gap. Engine A deducts the schedule's 60-minute break a second time, because the
   unpunched inter-block gap is already outside the work segments and a schedule stores a duration,
   never a position. The test pins **A = B − scheduleBreak** and states why. **This predates #162**
   — it applies to any two-segment day — and is NOT fixed here: changing either engine moves real
   pesos. Flagged for the backlog.
2. **Every psql snippet in M1b used snake_case column names.** Only TABLE names are `@@map`'d in
   this schema; the COLUMNS are camelCase and must be double-quoted (`"amTimeIn"`,
   `"amPmMinGapMinutes"`, `"employeeId"`, `"entityType"`, …). Every M1b query and both rollback
   `ALTER TABLE`/`UPDATE` statements would have errored as written. Corrected in the plan.
3. **§1.11.5 claimed `/^\d+$/` rejects `' '`.** It never sees it — `.trim()` runs first and a
   whitespace-only field takes the empty-clears branch. Corrected; spec A15b pins the behaviour.
4. **§1.7 row 1 and §1.11.7 row 1 both named pure specs for mutations in `index.ts`.** Same defect
   the second validation pass found in the amendment table, present in the base table too.

## Test Infra Gaps Found

- `pnpm test` (vitest, `environment: node`) does **not** typecheck, and `svelte-check` covers
  neither `scripts/**` nor `prisma/**` (#282). The two seed scripts in P7 are invisible to all
  four gates.
- No gate proves the two `colspan` fixes; a wrong colspan misaligns only the "no rows" placeholder.
  Agent-probe only (M1/M2).

## Known gaps carried forward (unchanged from the contract)

- `correctDay`'s threshold wiring: structurally unprovable (A-P1). Not counted as covered.
- Whether an operator's chosen threshold suits their tenant: unproven by design (R10).
- The "silently off" mode at 240: no gate detects it (A-P4).
- A locked `AttendanceDay` never picks up a new threshold: accepted; unlock first.
- Nothing prevents a raw-SQL out-of-bounds write; `derive.ts` layer 3 rejects only non-finite and
  non-positive values.

## What I could NOT verify locally

- **Manual script M1 and M1b were not run.** They need a dev server, a browser session and seeded
  tenants; this session did not start `vite dev`. Every M1b psql query in the plan is now
  syntactically correct for this database, but no operator has executed the flow. Criterion
  "changing the setting changes a real derive, and `worked_hours` does not move" is therefore still
  Agent-Probe-pending. The automated wiring test covers the same causal chain up to the Prisma
  boundary (org row → `deriveRange` → upserted columns, hours unchanged).
- **The settings card rendering** — no gate proves SvelteKit routes the POST to `setAmPmMinGap`
  or that the card renders; the action-export specs prove the guard chain only.
- **Nothing was committed and nothing was pushed**, per instruction.

## Closeout Packet

- Plan: `process/features/timesheet-capture/active/timesheet-capture-162-177-200_17-08-26/timesheet-capture-162-177-200_PLAN_17-08-26.md`
- Finished: all Phase 1 + Amendment 1 code, schema, tests, mutation proofs, and every in-scope
  contract instruction and correction.
- Verified: the four CI gates (real numbers above) and 21/21 mutations RED.
- Unverified: manual scripts M1/M1b (browser + dev server), card rendering.
- Remaining: user review, then the commit; then Phase 2.
- Classification: **Keep in active/testing** — code complete and CI-green, but Phase 1 is
  `CODE DONE`, not `VERIFIED`, because §Phase Completion Rules condition 5's manual step M1b has
  not been executed and the phase is deliberately uncommitted pending review.
