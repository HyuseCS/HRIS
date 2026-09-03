# RESEARCH — #3 cross-month payroll periods

Phase: RESEARCH (RIPER-5) · Branch: `feat/cross-month-periods-3` · Date: 2026-09-02
Supersedes the lost #320 research (unpushed branch, did not survive the repo migration).

Every claim below was verified against source with a file:line citation.

---

## F1 — The gate: `isSameMonthRange` and its call sites

Definition: `src/lib/utils/pay-periods.ts:128-136`. True only when `end >= start` AND same UTC year
AND same UTC month. It folds two rules into one function, but every caller checks the
reversed-range rule separately first.

| # | Call site | Guards | Error copy |
|---|---|---|---|
| F1a | `payroll/index.ts:236-238` (`createPayrollRun`) | run creation, before the transaction and any write | 400 `A custom period must start and end in the same month.` |
| F1b | `timesheets.ts:159-161` (`createTimesheet`) | timesheet creation, before any DB read | same copy, 400 |
| F1c | `payroll/periods.ts:59-61` (`openPeriod`) | period + run creation, before the transaction | same copy, 400 |
| F1d | `PeriodPicker.svelte:86-87` | client-side inline message only | same string, duplicated literally |
| F1e | `pay-periods.ts:157` (inside `periodShareOf`) | **not a gate** — the fallback giving a cross-month pair a flat `0.5` | none |
| F1f | `scripts/legacy-nonstandard-runs.ts:45-47` | read-only classifier | none |

**Fifth, indirect write path:** `createTimesheetFromAttendance`
(`attendance/index.ts:531-554`) does no gating of its own; it calls `createTimesheet` at `:547`,
so it inherits F1b. Any change to F1b silently changes the "Save attendance range as timesheet"
button too.

`openPeriod` has an API twin at `routes/api/v1/payroll/periods/+server.ts:49`, so F1c covers both
the form action (`payroll/periods/+page.server.ts:55`) and the v1 API.

**Downstream if the gate is lifted:**
- F1a/F1c — the row is created spanning two months, reaches `computePayroll`, and `periodShareOf`
  returns the flat `0.5` (F1e), not a day count. Everything in F2 then runs on a wrong 0.5.
- F1b — the overlap guard (`timesheets.ts:195-209`) is Manila-day based and month-agnostic, so it
  still works. The advisory lock does not (F4).
- F1d — lifting the server gate alone leaves the form emitting empty strings (`:122-127`) and the
  server returning a `z.coerce.date()` 400: a silent dead end.

## F2 — The share math, and what it really drives

`periodShareOf` (`pay-periods.ts:153-162`) short-circuit order:

1. `:155` `WHOLE_MONTH` → literal `1`
2. `:156` `FIRST_HALF` / `SECOND_HALF` → literal `0.5`
3. `:157` not same-month → literal `0.5` (legacy fallback)
4. `:158-159` day count ÷ `daysInMonth(start's year, start's month)`
5. `:160` `!(share > 0)` → `0.5` (catches NaN and ≤ 0)
6. `:161` `return Math.min(1, share)`

`kind` comes from `describePeriod` (`:84-110`), which computes `sameMonth` at `:95` before
pattern-matching day 1/15/16/EOM. `daysInMonth` `:35-38`, `periodDays` `:63-66` (inclusive UTC-midnight
day diff), `periodOf` `:46-60`.

**The `Math.min(1, share)` clamp at `:161` is dead code today.** Steps 3 and 4 together guarantee a
same-month range, so `periodDays <= daysInMonth` always. `tests/unit/pay-periods.test.ts:158-164`
only ever probes same-month ranges.

**Every consumer of `periodShareOf`:** `payroll/index.ts:403` (the single production caller, in
`computePayroll`), `PeriodPicker.svelte:132` (display only),
`scripts/legacy-nonstandard-runs.ts:48`, plus tests.

**What that one `periodShare` feeds — the reason a share > 1 is a money bug, not a rounding nit:**

| Consumer | Line | What it scales |
|---|---|---|
| `compensationForPeriod` | `index.ts:462`, def `compensation.ts:102,108,133,145-146` | per-segment `weight`, with `Σ weight == periodShare` |
| **basic pay** | **`earnings.ts:71`** — `D(comp.basicMonthlySalary).times(periodShare)` | **BASIC gross pay for every FIXED/MONTHLY employee** |
| basic pay, segmented | `earnings.ts:63,70` | same, via `weight` |
| `expectedHoursOf` | `types.ts:181-184`, used `calculator.ts:233` | expected hours → tardiness / absence charges |
| statutory ER + tax | `calculator.ts:219,223,225,226` | `m.sssEr.times(share)` etc. |
| statutory EE | `calculator.ts:164,168` via `resolveEE` | `× share` for EVEN and WHOLE_MONTH |
| recurring deductions | `employee-deductions.ts:107,112` | `monthlyAmount × periodShare` |
| allowances / incentives | `index.ts:548-549` | `monthlyOf('ALLOWANCE').times(periodShare)` |
| benefit employee cost | `index.ts:559` | `plan.employeeCost × periodShare` |
| loan / cash-advance amortization | `index.ts:411,528,534` via `amortShare` | `amortShare = periodKind === null ? periodShare : 1` |

**Basic pay is UNCLAMPED downstream.** There is no second clamp anywhere. `earnings.ts:41` does
`D(opts.periodShare ?? 1)` and `:71` multiplies straight through; `line(…)` quantizes but does not
bound. So `Math.min(1, share)` at `pay-periods.ts:161` is the **only** thing standing between a
share > 1 and over-paid basic salary, allowances, incentives, benefits, ER statutory and tax. Dead
today; under a cross-month design it becomes load-bearing and would silently **cap** rather than
error.

2026-05-20 → 2026-06-05 sums to `12/31 + 5/30 = 0.553763…`. No code computes this today.

## F3 — Every single-month derivation

- **F3a `payrollRunLockKey`** `payroll/index.ts:96-98` — `YYYY-MM` of the **start** only. Doc comment
  `:82-95` states "A run never spans two months (`isSameMonthRange`), so the month is the smallest
  key that covers every range the check can read."
- **F3b `timesheetLockKey`** `timesheets.ts:144-146` — identical shape, employee-scoped.
- **F3c `assertCustomRangeClearOfCutoff`** `payroll/index.ts:206-208` — start month only. See F5.
- **F3d statutory basis anchor** `compensation.ts:114` — `compOn(firstDayOfMonth(start))`
  (`firstDayOfMonth` at `pay-periods.ts:69-71`). Month B never gets a basis.
- **F3e `describePeriod` returns start-derived `year`/`month0`** `pay-periods.ts:90-91`. Its
  `sameMonth` check `:95` means a cross-month pair always returns `kind: null` and a raw range label
  `:109`. That `null` is consumed at `index.ts:407` and drives `amortShare` (`:411`) and `periodKind`.
- **F3f `resolveEE`** `calculator.ts:158-169`. With `kind === null` and `mode === 'FIRST' | 'SECOND'`,
  `:166` returns **ZERO** — a cross-month run collects no employee statutory share at all while
  spanning two months of contributions. The comment `:152-156` justifies that ZERO by pointing at
  `assertCustomRangeClearOfCutoff`, which per F5 does not actually cover the end month.
- **F3g `periodShareOf`'s divisor** `pay-periods.ts:159` — the **start** month's length.
- **F3h `PeriodPicker` `min`/`max`** `PeriodPicker.svelte:97-116` — `startMonthEnd` pins the end to the
  start month's EOM, `startMonthStart` pins the start to the end month's day 1. The one-month rule is
  hard-coded into the browser calendar.
- **F3i `PeriodPicker` default month** `:39` `month0 = now.getMonth()` — local, not UTC. Pre-existing
  PHT/UTC nit, out of scope.

**Ruled out** (derive a month, are not period gates): `dashboard.ts:20,431,545`; `reports.ts:118-149`
(a month-bucket loop that already handles multi-month correctly); `cycle-plan.ts:106,129-130`;
`payslip-document.ts:159`; `dates.ts:41,92,174,197-198`; `employment.ts:24-25`;
`attendance/+page.svelte:65-70`; `reports/[type]/+page.svelte:24-29`;
`timesheets/+page.server.ts:146`.

## F4 — The locks

`lockPayrollMonth` (`payroll/index.ts:104-111`) runs `SELECT pg_advisory_xact_lock(hashtext(${key})::bigint)`
on the caller's `tx`. Transaction-scoped — Postgres releases on commit or rollback, nothing to leak.

Callers: `payroll/index.ts:245` (first statement of `createPayrollRun`'s transaction) and
`payroll/periods.ts:67` (first statement of `openPeriod`'s).

**Race prevented:** check-then-act on the overlap guard. Two concurrent requests for different but
**overlapping** ranges each read an empty conflict set from `assertNoOverlappingRun` (`:129-166`) and
each insert. `@@unique([organizationId, periodStart, periodEnd])` cannot catch it because the bounds
differ (`:86-90`, `:240-243`). Both guards are called with `tx` (`:256-257`, `:83-84`), so the reads
happen inside the lock.

Timesheets: inlined, not extracted — `timesheets.ts:184-185`. Same race, employee-scoped.

**Moving to one lock per organisation / per employee requires:**
1. `payroll/index.ts:96-98` — key becomes `payroll-run:${organizationId}`; `periodStart` param unused.
2. `payroll/index.ts:104-111` — `lockPayrollMonth` loses its `periodStart` argument.
3. Call sites `payroll/index.ts:245`, `payroll/periods.ts:67`.
4. `timesheets.ts:144-146` — key becomes `timesheet:${employeeId}`; call site `:184`.
5. The doc comments at `payroll/index.ts:82-95` and `timesheets.ts:135-143` both **argue for** the
   month component and both cite `isSameMonthRange`. They become factually wrong and must be
   rewritten, not trimmed.
6. **Precedent already in the repo:** `backupLockKey` (`server/backup/plan.ts:35`) is
   `document-backup:${organizationId}` — a one-arg per-org key. `scripts/backup-documents.ts:150`
   cross-references the two payroll locks.

**Tests asserting the current key shape** — `tests/unit/payroll-month-lock-key.test.ts`, whole file
(the filename encodes the assumption): `:24-28` same month same key; `:30-34` **different months,
different keys — inverts**; `:36-40` different orgs different keys (survives); `:44-48` PHT-boundary
bucketing (becomes meaningless); `:51-73` the same four for `timesheetLockKey`.
`tests/unit/backup-plan.test.ts:110-121` asserts the per-org shape and is the model to copy,
including `:117` `expect(backupLockKey.length).toBe(1)` — an arity assertion worth adding here.

## F5 — The cutoff guard has a HOLE, not just an over-strict refusal

Source: `payroll/index.ts:185-222`.

Query `:195-202` — `employeeStatutoryConfig.findMany({ where: { employee: { organizationId,
employmentStatus: 'ACTIVE' }, allocation: { not: 'EVEN' } }, distinct: ['allocation'], select: {
allocation: true } })`. `distinct` over a non-EVEN filter returns **at most two rows**: `FIRST`
and/or `SECOND`. Early return `:193` for standard periods, `:203` when the org is all-EVEN.

The loop `:210-221` builds `periodOf(kind, year, month0)` where `year`/`month0` come **only** from
`manilaDayKey(periodStart)` (`:206-208`). **It never builds a window from the end month.**

**True:** a cross-month range necessarily contains the last day of month A, which is ≥ 28 and
therefore ≥ 16, so it always overlaps month A's `SECOND_HALF` window (16–EOM). For any org with an
ACTIVE `SECOND` employee, every cross-month range is refused.

**False:** the `FIRST` half does not follow. Month A's `FIRST_HALF` window is 1–15. A cross-month
range starting on the 16th or later does **not** overlap it, so a `FIRST`-only org passes it through —
and it overlaps month B's 1–15 window, which the loop never constructs.

- `FIRST`-only org, `2026-05-20 → 2026-06-05`: **allowed**, yet covers all of June's designated 1–15
  cutoff window. June's `FIRST_HALF` run then becomes uncreatable by the overlap guard, and
  `resolveEE` (`calculator.ts:166`) hands the cross-month run **ZERO** because its `kind` is `null`.
  **June collects nothing.** Exactly the failure the guard's own doc comment `:174-183` claims is
  impossible.
- `FIRST`-only org, `2026-04-28 → 2026-05-03`: **allowed**, clips May 1–15. Same hole.
- `SECOND`-only org, `2026-04-28 → 2026-05-03`: refused, but for the start-month reason only.

Accurate statement: *the guard refuses every cross-month range for an org with a `SECOND` employee,
refuses cross-month ranges beginning on or before the 15th for an org with a `FIRST` employee, and
never inspects the end month's window at all.* **Lifting F1 without fixing `:206-212` ships that
hole.**

`tests/unit/payroll-custom-range-cutoff-guard.test.ts` cannot catch it — every case is same-month
(`:84,117,122,133,154`), and its mock (`:50-60`) reimplements the `where` + `distinct` but says
nothing about the loop's month source.

Schema: table `employee_statutory_config` (`prisma/schema.prisma:638`), one row per
`(employeeId, contribution)` (`:637`), `allocation StatutoryAllocation @default(EVEN)` (`:632`),
values `EVEN | FIRST | SECOND` (`:617-621`). An org with no rows is the default and is unaffected
(`:203`). **Live row counts unmeasured — see Open Questions.**

## F6 — Tests at risk

**Assert the cross-month refusal:**
`payroll-period-sanity-gate.test.ts:59` (the `CROSS_MONTH` constant), `:114-118`, `:143-147`,
`:172-176` — all three use `2026-05-20 → 2026-06-05`.
`timesheet-selfservice.test.ts:186-203` — `2026-05-13 → 2026-06-02`, asserts **no DB call at all**.
`pay-periods.test.ts:102-124` — the `isSameMonthRange` describe; `:112-114` rejects cross-month,
`:115-117` rejects same-month-number-different-year.
`tests/e2e/period-picker-default-cutoff.spec.ts:43-49` — fills `2026-07-05` against a June start and
asserts the exact inline copy; `:65-95` asserts the `min`/`max` clamping.

**Assert the flat-0.5 cross-month share:**
`pay-periods.test.ts:178-192` (two of five adversarial rows),
`payroll-custom-period-statutory-proration.test.ts:90-91`,
`legacy-nonstandard-runs-classify.test.ts:31-36` (the operator string
`crosses two months — keeps the historical flat 0.5`).

**Assert the lock keys:** `payroll-month-lock-key.test.ts`, full file.

**Frozen shares — must NOT move:** `pay-periods.test.ts:130-145` (the 0.5/0.5/1 table across
28/29/30/31-day months — the regression rail), `payroll-standard-period-golden.test.ts:43-44`
(byte-identical peso goldens), `payroll-calculator.test.ts:73-79`.

**#170/#171 compensation-segment parity tests:** `payroll-mid-period.test.ts`,
`compensation-resolver.test.ts`, `payroll-statutory-basis.test.ts`, `compensation-heal.test.ts`,
`employee-api-compensation.test.ts`. They consume `periodShare` as an **input** and assert
`Σ weight == periodShare`; they do not assert how the share was derived, so they survive a
cross-month share change **provided `compensation.ts:114`'s `firstDayOfMonth(start)` anchor is not
moved.** Moving it breaks `payroll-statutory-basis.test.ts` directly.

## F7 — The UI

`PeriodPicker.svelte` emits two hidden inputs (`:141-142`) named by `startName`/`endName` props
(`:23-24`, defaults `periodStart`/`periodEnd`). Four segments (`:58-63`); `CUSTOM` is never
pre-selected (`:27` defaults `FIRST_HALF`).

Three validation layers:
1. **Native `min`/`max`** `:97-116` → applied `:201-202`, `:214-215`. Where the one-month rule is
   baked into the browser calendar.
2. **Inline message** `:83-89`. Two literal strings **duplicated verbatim** from the server. The copy
   lives in four places: `:85/:87`, `payroll/index.ts:234/237`, `timesheets.ts:157/160`,
   `periods.ts:57/60`. No shared constant; nothing type-checks their agreement.
3. **Emission gate** `:91` `validCustom`, used `:122-127` — an invalid range emits `''`.

Preview `:129-134` calls `periodShareOf` and prints `prorated to N% of the month` — copy that
hard-codes the single-month framing.

**Every mount:** `timesheets/NewTimesheetDialog.svelte:128` (default names),
`payroll/+page.svelte:79` (default names), `payroll/periods/+page.svelte:75` — **overridden**
`startName="start" endName="end"`, matched by `payroll/periods/+page.server.ts:55`. That third mount
is a trap for any field-name change.

## F8 — Legacy rows

Standing contract `pay-periods.ts:10-11`: legacy off-cycle rows with arbitrary dates stay readable.
Restated with the why at `:148-151`.

`computePayroll` gates on **status only** — `payroll/index.ts:300-306`:
`if (run.status !== 'DRAFT' && run.status !== 'COMPUTED') error(400, …)`. No period-shape check
anywhere. It reads `run.periodStart`/`periodEnd` straight into `periodShareOf` at `:403`.

A legacy cross-month or reversed row today: flat `0.5` share; `kind === null` → `periodKind = null`
(`:407`) → `amortShare = 0.5` (`:411`), loans collect half an installment; `resolveEE` gives
FIRST/SECOND employees **ZERO**, EVEN gets `× 0.5`; basic pay `salary × 0.5` (`earnings.ts:71`)
regardless of span. Working days and expected hours are computed over the **real** range
(`index.ts:425-428`, `calculator.ts:233`), so a 92-day legacy row bills 92 days of scheduled hours
at half a month's salary — a mismatch that already exists in shipped code. Flagged at
`index.ts:613-627`.

`scripts/legacy-nonstandard-runs.ts` (123 lines, read-only) scans every `DRAFT`/`COMPUTED`
`PayrollRun` (`:63-74`), filters non-standard shapes (`:77`), classifies with the exported
`classifyLegacyRun` (`:35-56`) into standard / reversed / **cross-month (flat 0.5, `:45-47`)** /
same-month-share-exactly-0.5 / `moves: true` with old→new shares, and prints a WILL MOVE vs
UNAFFECTED split (`:97-110`). Invocation at `:10`:
`pnpm dotenv -e .env.dev -- tsx scripts/legacy-nonstandard-runs.ts`, with an instruction at `:12-13`
to run it against every database. Its cross-month branch and its unit test both become wrong the
moment cross-month rows get a day-count share.

---

## Test gap analysis

Blast-radius files with no direct coverage:
- `PeriodPicker.svelte` — no unit test, only e2e (which needs build + preview). Tier: **Hybrid**.
- `earnings.ts:71` — the unclamped `basicMonthlySalary × periodShare` is exercised only indirectly
  through goldens. No test feeds it a share > 1. Tier: **Fully-Automated**.

Behaviours with no asserting test:
1. `Math.min(1, share)` at `pay-periods.ts:161` is never exercised — every input is same-month.
2. `assertCustomRangeClearOfCutoff` is never tested with a cross-month range.
3. Nothing asserts the end month's cutoff window is checked, because it is not.
4. **Nothing asserts the advisory lock actually serialises two overlapping concurrent writers.**
   `payroll-month-lock-key.test.ts` asserts only the key string;
   `payroll-period-sanity-gate.test.ts:41-43` mocks `$executeRaw` to a no-op. Tier: **Known-Gap** —
   needs two real connections against `veent-db-5434`.
5. Nothing asserts a cross-month run's `resolveEE` ZERO outcome (F3f).
6. `createTimesheetFromAttendance` has no test proving it inherits the period gate.

---

## Open questions

1. **Live `employee_statutory_config` row counts are unmeasured** — the DB container was down and the
   user starts it. Query to run at the live gate:
   `SELECT allocation, count(*) FROM employee_statutory_config c JOIN employees e ON e.id = c."employeeId" WHERE e."employmentStatus" = 'ACTIVE' GROUP BY allocation;`
   F5's severity is zero for an all-EVEN database and material otherwise.
2. The FIRST-allocation hole in F5 is **latent today** — `isSameMonthRange` blocks the only ranges
   that could reach it. It becomes live the instant the gate is lifted, and is squarely inside #3's
   blast radius.
3. `scripts/legacy-nonstandard-runs.ts` has never been run per its own instruction at `:12-13`; there
   is no record in the feature folder that it was.
