---
name: report:phase-05-remediation-A-S2
description: "S2 — D1: the 2023 BIR withholding table, its migration script, and every hand-derived expectation the change moves"
date: 11-09-26
phase: phase-05-remediation-A-S2
status: COMPLETE
feature: ui-ux-overhaul
plan: process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-05-remediation-A-feedback-statutory_PLAN_11-09-26.md
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: phase-05-remediation-A-S2
---

# S2 — the 2023 BIR withholding table

Section S2 only. S1 (the live data restore) was done before this session started; no row was
written here except by the migration script this section adds.

## The table in force from 1 Jan 2023

| floor | ceiling | baseTax | rate | excessOver |
|---|---|---|---|---|
| 0 | 20833 | 0 | 0 | 0 |
| 20833 | 33332 | 0 | 0.15 | 20833 |
| 33333 | 66666 | 1875 | 0.20 | 33333 |
| 66667 | 166666 | 8541.80 | 0.25 | 66667 |
| 166667 | 666666 | 33541.80 | 0.30 | 166667 |
| 666667 | ∞ | 183541.80 | 0.35 | 666667 |

The tax rule, used by every derivation below:

```
t ≤ 20833                 → 0
20833 < t ≤ 33332         → (t − 20833) × 0.15
33333 ≤ t ≤ 66666         → 1875     + (t − 33333) × 0.20
66667 ≤ t ≤ 166666        → 8541.80  + (t − 66667) × 0.25
166667 ≤ t ≤ 666666       → 33541.80 + (t − 166667) × 0.30
t ≥ 666667                → 183541.80 + (t − 666667) × 0.35
```

`taxable = gross − (sssEe + philhealthEe + pagibigEe)`. The statutory engine returns EXACT,
unquantized decimals; the calculator prorates by `periodShare` and quantizes once with
`q2n` = `toDecimalPlaces(2, ROUND_HALF_UP)` (`money.ts:47`).

## Hand derivations — every changed literal

Not one figure below was read off a vitest "received" line. Each was computed from the table
above, then the suite was run to confirm it agreed.

### D-1 — monthly tax at ₱30,000 gross (the figure the whole suite echoes)

```
contributions = sssEe 900 + philhealthEe 750 + pagibigEe 200 = 1,850
taxable       = 30,000 − 1,850 = 28,150          → bracket 2 (20,833 … 33,332)
tax           = (28,150 − 20,833) × 0.15 = 7,317 × 0.15 = 1,097.55
total         = 1,850 + 1,097.55 = 2,947.55
net           = 30,000 − 2,947.55 = 27,052.45
```
was `1463.4 / 3313.4 / 26686.6` — 2018: 7,317 × 0.20 = 1,463.40.

**Lands in:** `payroll-statutory-config.test.ts` `PARITY['30000']`; the exemption baseline at
`:134`; the `MONTHLY` constant in `payroll-custom-period-statutory-proration.test.ts:32`; the
`1463.4 * CUSTOM_SHARE` expressions in `payroll-custom-period-ee-share.test.ts:59,88`; the
`// 30000 gross → default tax …` figure in the comment at `:133`.

### D-2 — monthly tax at ₱50,000 gross

```
contributions = 900 + 1,250 + 200 = 2,350
taxable       = 50,000 − 2,350 = 47,650          → bracket 3 (33,333 … 66,666)
tax           = 1,875 + (47,650 − 33,333) × 0.20 = 1,875 + 14,317 × 0.20
              = 1,875 + 2,863.40 = 4,738.40
total         = 2,350 + 4,738.40 = 7,088.40
net           = 50,000 − 7,088.40 = 42,911.60
```
was `6079.25 / 8429.25 / 41570.75` — 2018: 2,500 + 14,317 × 0.25 = 6,079.25.
Decimal `toString()` drops the trailing zero, so the literals are `'4738.4' / '7088.4' / '42911.6'`.

**Lands in:** `payroll-statutory-config.test.ts` `PARITY['50000']`.

### D-3 — monthly tax at ₱250,000 gross

```
contributions = 900 + 2,500 + 200 = 3,600
taxable       = 250,000 − 3,600 = 246,400        → bracket 5 (166,667 … 666,666)
tax           = 33,541.80 + (246,400 − 166,667) × 0.30 = 33,541.80 + 79,733 × 0.30
              = 33,541.80 + 23,919.90 = 57,461.70
total         = 3,600 + 57,461.70 = 61,061.70
net           = 250,000 − 61,061.70 = 188,938.30
```
was `66347.89 / 69947.89 / 180052.11` — 2018: 40,833.33 + 79,733 × 0.32 = 66,347.89.
Literals: `'57461.7' / '61061.7' / '188938.3'`.

**Lands in:** `payroll-statutory-config.test.ts` `PARITY['250000']` — and this is the row whose
`DERIVED_PARITY` override disappears (see the collapse proof below).

### D-4 — the three ₱0 rows are unmoved, confirmed not assumed

```
3000     : taxable  3,000 − 490     =  2,510.000 ≤ 20,833 → 0
15000    : taxable 15,000 − 1,250   = 13,750.000 ≤ 20,833 → 0
10000.20 : taxable 10,000.20 − 900.005 = 9,100.195 ≤ 20,833 → 0
```
Bracket 1 has rate 0 in both tables, so these rows keep every literal. No edit.

### D-5 — `ph-statutory.test.ts:76`, the in-expression rate

The assertion is a formula, not a literal: `toBeCloseTo((20 * (25000 - 20833)) / 100, 0)`.
The 2018 rate `20` is changed **inside the expression** to `15`, which keeps the expression
itself the hand-computation (AC-S2.7):

```
expression: (15 × (25,000 − 20,833)) / 100 = (15 × 4,167) / 100 = 62,505 / 100 = 625.05
engine    : 25,000 has no contributions subtracted here — computeWithholdingTax is called
            directly on 25,000 → bracket 2 → (25,000 − 20,833) × 0.15 = 4,167 × 0.15 = 625.05
```
was `833.40`.

### D-6 — the half-period figure, where quantization actually bites

```
monthly tax          = 1,097.55                 (D-1)
× periodShare 0.5    =   548.775                 EXACT, three decimals
q2n, ROUND_HALF_UP   =   548.78                  the 5 rounds up
```
The 2018 figure needed no rounding (1,463.40 × 0.5 = 731.70 exactly), so this is a new
quantization event. The delta the half-period totals move by is `731.70 − 548.78 = 182.92`.

`payroll-calculator.test.ts`:
```
statutory.withholdingTax = 548.78
totalDeductions = sssEe 450 + philhealthEe 375 + pagibigEe 100 + tax 548.78 = 1,473.78
```
was `731.7 / 1656.7`. The loan case at `:64` is `1473.78 + 1000` and stays an expression.

### D-7 — the eight golden inline snapshots

Same fixture throughout: ₱30,000 MONTHLY, one ₱1,000 loan installment.

**Half period (`periodShare` 0.5, six snapshots — TAX line and `withholdingTax`):** `548.78`
```
totalDeductions = 450 + 375 + 100 + 548.78 + 1,000 = 2,473.78     (was 2,656.70)
netPay          = 15,000 − 2,473.78 = 12,526.22                   (was 12,343.30)
```

**Whole month (`periodShare` 1, two snapshots):** `1097.55`
```
totalDeductions = 900 + 750 + 200 + 1,097.55 + 1,000 = 3,947.55   (was 4,313.40)
netPay          = 30,000 − 3,947.55 = 26,052.45                   (was 25,686.60)
```

**FIRST_HALF with SSS allocated to the FIRST cutoff** — the whole monthly SSS lands here:
```
totalDeductions = 900 + 375 + 100 + 548.78 + 1,000 = 2,923.78     (was 3,106.70)
netPay          = 15,000 − 2,923.78 = 12,076.22                   (was 11,893.30)
```

**SECOND_HALF with SSS allocated to the FIRST cutoff** — SSS EE is zero here:
```
totalDeductions =   0 + 375 + 100 + 548.78 + 1,000 = 2,023.78     (was 2,206.70)
netPay          = 15,000 − 2,023.78 = 12,976.22                   (was 12,793.30)
```

Every one of these is `old − 182.92` (half) or `old − 365.85` (whole) on the deduction side and
the same amount **added** to net, which is the arithmetic cross-check.

The file's own header bans `-u`. It was not used; each snapshot was edited by hand to the
figures above.

### D-8 — confirmed unaffected (verified, not assumed)

| File | Why it does not move |
|---|---|
| `payroll-statutory-exemption.test.ts:61,80,120` | asserts against a `base` captured from the same engine in the same run |
| `payroll-statutory-allocation.test.ts:125` | relative equality between two engine outputs |
| `payroll-deductions.test.ts` (`withholdingTax: 1290`) | hand-fed input to `deductions.ts`, never engine output |
| `payslip-document.test.ts`, `payslip-draft-visibility.test.ts` (`withholdingTax: 0`) | fixture inputs |
| `report-scoping.test.ts` (`900`, `90_000`) | fixture inputs |
| `payroll-statutory-config.test.ts:231-269` | hand-built validation fixtures passing their own tables |
| `payroll-statutory-config.test.ts:332-364` | the two hand-built-table cases derive from literal rows they supply themselves |
| six e2e `withholdingTax: 0` occurrences | fixture inputs; none asserts an engine-computed peso figure |

All confirmed green with no edit.

## AC-S2.2 — the D1 proof, and its negative controls

Two permanent cases now live in `tests/unit/ph-statutory.test.ts`, beside the
`computeWithholdingTax` coverage:

1. `deriveTaxBrackets(BIR_MONTHLY_TAX_TABLE.map(({floor, rate}) => ({floor, rate})))` reproduces
   the shipped table's own `baseTax` **and** the literal published vector
   `[0, 0, 1875, 8541.8, 33541.8, 183541.8]`, plus its `excessOver`. Asserting both the shipped
   table and the literal means the case cannot go vacuous if someone edits the table: the two
   assertions have to move together or the test goes red.
2. The **permanent 2018 negative control**: the rate vector `[0, 0.2, 0.25, 0.3, 0.32, 0.35]` over
   the same floors derives `[0, 0, 2500, 10833.5, 40833.5, 200833.5]` — the drift, asserted as a
   fact, and asserted `not.toEqual` the shipped baseTax.

**Red run against the 2018 table** (the table was stashed, the test run, the table restored):

```
 FAIL  tests/unit/ph-statutory.test.ts > BIR table — derived baseTax equals the shipped baseTax
       > derives the shipped table's own baseTax from its floors and rates alone
AssertionError: expected [ Array(6) ] to deeply equal [ +0, +0, 2500, 10833.33, …(2) ]

  Array [
    0,
    0,
    2500,
-   10833.33,
-   40833.33,
-   200833.33,
+   10833.5,
+   40833.5,
+   200833.5,
  ]
```

That is exactly the drift the 2018 table could not shed: integer floors cannot re-derive
exact-thirds baseTax. Against the 2023 table the same case is green.

## AC-S2.6 — `DERIVED_PARITY` COLLAPSED, it was not repointed

The `DERIVED_PARITY` identifier **no longer exists**. `git diff` on
`tests/unit/payroll-statutory-config.test.ts` removes:

```
const DERIVED_PARITY = {
	...PARITY,
	'250000': { ...PARITY['250000'], tax: '66348.06', total: '69948.06', net: '180051.94' }
}
```

and the loop below it now iterates `PARITY` directly. `grep -n "DERIVED_PARITY\|66348" tests/`
returns nothing. No new drifted figure was written anywhere — the ₱250k row in the derived
describe is now the same `'57461.7' / '61061.7' / '188938.3'` the seeded path asserts.

The block also gained a **stronger** assertion than the loop it replaces:

```
expect(seededDerivedRow.taxBrackets).toEqual(seededRow.taxBrackets)
```

That compares the whole derived table against the whole seeded table, not just the pesos six
salaries happen to produce. It is the machine-checked form of "derive == published".

The stale `:301-305` comment — the one naming the `10833.33→10833.5` drift — was rewritten, not
deleted. It now records that deriving reproduces the shipped baseTax exactly and that the old ₱250k
exception existed only because of the 2018 table's exact-thirds boundaries. Leaving it would have
been the repo's standing *"a comment about a FIXED bug reads identically to one about a live bug"*
trap.

## AC-S2.3 / AC-S2.4 — the migration, run for real

`scripts/migrate-bir-tax-table-2023.ts`. Guarded on the **rate + floor** vectors, never on
`baseTax` — a drifted `baseTax` is the symptom the migration exists to clear, so a full-table
equality guard would have skipped `org_seed`, the row that most needed moving.

**Before** (all three orgs identical after S1's restore):
```
org_jojo      | [0, 0.2, 0.25, 0.3, 0.32, 0.35] | [0, 20833, 33333, 66667, 166667, 666667] | [0, 0, 2500, 10833.33, 40833.33, 200833.33]
org_seed      | [0, 0.2, 0.25, 0.3, 0.32, 0.35] | [0, 20833, 33333, 66667, 166667, 666667] | [0, 0, 2500, 10833.33, 40833.33, 200833.33]
org_sweetleaf | [0, 0.2, 0.25, 0.3, 0.32, 0.35] | [0, 20833, 33333, 66667, 166667, 666667] | [0, 0, 2500, 10833.33, 40833.33, 200833.33]
```

**Run 1:** `✔ Moved the BIR table 2018 → 2023 on 3 config row(s).`
**Run 2:** `✔ Moved the BIR table 2018 → 2023 on 0 config row(s).` — idempotent.

**Read-back** (`rate` / `floor` / `baseTax` / `ceiling` vectors):
```
org_jojo      | [0, 0.15, 0.2, 0.25, 0.3, 0.35] | [0, 20833, 33333, 66667, 166667, 666667] | [0, 0, 1875, 8541.8, 33541.8, 183541.8] | [20833, 33332, 66666, 166666, 666666, null]
org_seed      | [0, 0.15, 0.2, 0.25, 0.3, 0.35] | [0, 20833, 33333, 66667, 166667, 666667] | [0, 0, 1875, 8541.8, 33541.8, 183541.8] | [20833, 33332, 66666, 166666, 666666, null]
org_sweetleaf | [0, 0.15, 0.2, 0.25, 0.3, 0.35] | [0, 20833, 33333, 66667, 166667, 666667] | [0, 0, 1875, 8541.8, 33541.8, 183541.8] | [20833, 33332, 66666, 166666, 666666, null]
```
The open top ceiling persists as `null`, which is the wire shape the resolver revives to `Infinity`
— the script writes through `taxBracketsToWire(BIR_MONTHLY_TAX_TABLE)` rather than repeating the
table, so the script and the engine cannot diverge.

### The skip branch was exercised, not shipped blind

The validate-contract recorded that the "deliberately customized org" branch would ship
unexercised because no such org exists. It was exercised here, reversibly: `org_sweetleaf`'s
`taxBrackets` were snapshotted, bracket 1's rate bent to `0.18` with `jsonb_set`, the script run,
then the snapshot restored byte for byte.

```
✔ Moved the BIR table 2018 → 2023 on 0 config row(s).
  • skipped org_sweetleaf (cmszfa155002a117498gtdzso) — rates are not the 2018 vector.
```

Restored, and the final read-back above is the post-restore state. A last run reports
`0 config row(s)` with no skip lines.

**One correction to the plan here.** The first version of the script reported every
already-migrated row as "skipped … not the 2018 vector" on the second run. That is true but
misleading — a row already on 2023 is not deliberately customized, and a migration whose idempotent
run prints three scary lines will be misread. The guard now recognises the 2023 vector too and
stays silent on it, so only a genuinely customized org is ever named.

## Gate results

| Gate | Baseline | After |
|---|---|---|
| `pnpm format:check` | clean | clean |
| `pnpm lint` | 0 errors / 1 warning (`CalculatorWindow.svelte:82`, `a11y_no_static_element_interactions`) | 0 errors / 1 warning, same file and rule |
| `pnpm check` | 0 errors / 1 warning | 1127 files, 0 errors, 1 warning — same one |
| `pnpm test` | 2468 passed / 211 files | 2474 passed / 212 files |

### The test-count delta, accounted for exactly

The plan says an unexplained file-count change is itself a finding, so here is the whole of it.

`+1 file, +6 tests`, of which **only +3 tests are S2's**:

| Source | Files | Tests |
|---|---|---|
| `ph-statutory.test.ts` — derive-equals-published + the 2018 negative control | 0 | +2 |
| `payroll-statutory-config.test.ts` — the whole-table `seededDerivedRow` equality | 0 | +1 |
| `tests/unit/attendance-correct-hours-ignored.test.ts` — **not this section's**, see below | +1 | +3 |

The `DERIVED_PARITY` collapse is test-count neutral: the describe looped six `DERIVED_PARITY`
entries before and loops six `PARITY` entries now.

## A finding the plan did not have: the working tree was not clean

The handoff stated the tree was clean at `267efc7`. It was not. The git index already held
**staged** work belonging to plan B (attendance), which this section is forbidden to touch:

```
M  process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-05-destructive-actions_TEST-SCRIPT_11-09-26.md
M  src/routes/(app)/attendance/+page.server.ts
M  src/routes/(app)/attendance/+page.svelte
A  tests/unit/attendance-correct-hours-ignored.test.ts
```

That staged `A` is the extra test file and the extra 3 tests in the totals above. Nothing was done
to any of it. The commit was made with a **path-limited** `git commit -- <paths>`, which commits
the named paths from the working tree and leaves every other index entry exactly as it was, so
plan B's staged work is neither swept into this commit nor disturbed. Mid-session that owner
committed it themselves as `5905669` (`fix(attendance): make Reg/OT read-only …`); this section's
commit sits on top of it and shares no file with it.

Consequence for the numbers: the `2474 / 212` figure includes three tests that are not S2's. S2's
own contribution to the suite is `2468 → 2471` on 211 files.

## Plan deviations

| # | Deviation | Why |
|---|---|---|
| 1 | The script's header names `pnpm exec dotenv -e .env.dev -- tsx …`, not the sibling scripts' `pnpm tsx …` | The sibling form does not carry `DATABASE_URL`. The convention was followed in every other respect; an invocation line that does not run is a defect, not a convention. |
| 2 | The migration recognises the 2023 vector as well as the 2018 one | Without it the idempotent second run misreports all three migrated orgs as "customized". Within the section's blast radius; see the migration section above. |
| 3 | The `'250000'` row now asserts the full derived-table equality in addition to the six-salary loop | The plan offered two ways to collapse `DERIVED_PARITY`; this is the stronger of them and is what AC-S2.6 is for. |

No hard-stop-class deviation. No file outside S2's scope was touched.

## Things the plan got right that are worth recording

- The churn map was accurate. The 35 mentions across 16 files held; every file the plan marked
  "confirmed unaffected" was in fact unaffected, and both corrected anchors (`:71,76`, and the
  `:332-364` hand-built cases) were right.
- The six e2e `withholdingTax: 0` occurrences are fixture inputs, exactly as VALIDATE concluded.
  No e2e spec needed an edit.
- The worked ₱30,000 derivation in the plan (`1,097.55`) matched the hand computation here, and the
  plan was right to refuse to round the half-period figure by eye — `548.775` quantizes UP to
  `548.78` under `ROUND_HALF_UP`, and that one centavo moves eight golden snapshots.

## What this does NOT prove

- Green tests prove the suite agrees with itself. The derivations above, the permanent 2018
  negative control and the `DERIVED_PARITY` collapse are what separate a correct table from a
  self-consistent wrong one.
- Nothing here checks the 2023 figures against the BIR's published document. That rests on the
  transcription in the plan's table.
- The migration was proven on three dev org rows. The skip branch was proven by a synthetic
  customized row, not a real one.
- `pnpm check` does not cover `scripts/**`. The script is type-checked by nothing but its own run.

## Closeout packet

- **Selected plan:** `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-05-remediation-A-feedback-statutory_PLAN_11-09-26.md`, section **S2 only**.
- **Finished:** AC-S2.1 through AC-S2.7, all seven.
- **Verified:** all four CI gates in CI order; migration run three times against the dev DB with a
  read-back each time; the skip branch exercised and reverted; the D1 proof's red run captured.
- **Unverified:** nothing in S2.
- **Remaining in plan A:** S1 was already done. S3 onward are untouched and belong to later
  sessions. Next plan step is **S3** — `src/routes/(app)/payroll/config/+page.svelte:15-18`,
  `await update()` → `await update({ reset: false })`.
- **State:** keep the plan in `active/` — ten of its eleven sections are still open.
