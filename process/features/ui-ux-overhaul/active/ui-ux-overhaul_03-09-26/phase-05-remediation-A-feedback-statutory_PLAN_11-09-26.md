---
name: plan:phase-05-remediation-A-feedback-statutory
description: "Phase 05 owner-pass remediation, plan A — feedback placement (F1/F2/F4/F6/F9), the payroll/config reset trap (F3), the BIR 2023 tax table + truthful statutory diff (D1/F5), the pending-proposal card density (F7), the login re-activation confirm (F8), a one-success-surface source gate, and the phase-06 bell amendment. Attendance (F10/F11) is plan B."
date: 11-09-26
feature: ui-ux-overhaul
phase: "05-remediation-A"
---

# Phase 05 Remediation — Plan A: Feedback Placement + Statutory Truth

**TL;DR** — Eleven sections, eleven commits, in dependency order. Restore the drifted dev data
first. Then replace the expired 2018 BIR tax table with the 2023 one (which kills the silent
re-derive drift by construction). Then build one shared `<FormFeedback>` component and sweep the
feedback sites onto it. Then fix the statutory page's lying diff, swap its four banners to toasts,
and shrink the pending-proposal card — all in one section because they are all in the same two
files. Then the re-activation confirm, the separations card, a new source-scanning gate that
proves exactly one success surface per action, and a documentation amendment handing the bell to
phase 06.

- **Date**: 11-09-26
- **Status**: PLANNED
- **Complexity**: COMPLEX (11 sections, 11 commits, ~18 source files + 4 test/doc files)
- **Feature**: ui-ux-overhaul
- **Branch**: `feat/uiux-phase-5`
- **Upstream**: `phase-05-owner-pass_FINDINGS_11-09-26.md` (committed at `afe28b3`)
- **Sibling**: plan B owns F10 + F11 and every file under `src/routes/(app)/attendance/**` and
  `src/lib/server/services/attendance/**`. This plan must not edit those paths.
- **Shared file**: `tests/unit/destructive-confirms.test.ts` is owned by THIS plan. Plan B has been
  told so. Its `COPY` array and the `COPY.length === 17` assertion at `:219` change here.

---

## Overview

The phase 05 owner click-through produced 11 findings. Four are real bugs; the rest are placement
and density calls the owner has already decided. This plan takes nine of them (F1–F9) plus the two
owner decisions that unblock them (D1 the tax table, D3 the bell hand-off), and orders them so that
nothing is built on top of a surface that is about to move or a number that is about to change.

Three facts drive the whole ordering:

1. **The seeded BIR table is wrong, and that is why F5 looks like two bugs.** The table at
   `src/lib/server/services/payroll/ph-statutory.ts:289-296` is the expired 2018–2022 table
   (rates `0/0.20/0.25/0.30/0.32/0.35`). The server's `deriveTaxBrackets` accumulator recomputes
   `baseTax` from the integer floors on every save, and against the 2018 table that produces
   `10833.50` where the row holds the published `10833.33`. Put the 2023 table in and the accumulator
   reproduces the published figures exactly (arithmetic proved below), so the silent rewrite stops
   existing rather than being suppressed.
2. **F5, F6 and F7 land in the same two files.** They are one section with one owner, not three.
   F5's fix and F6's fix touch the same four `return` statements.
3. **The shared feedback component must exist before the per-site sweeps**, or F1, F2, F6 and F9b
   each hand-roll their own slot and get redone.

### Owner decisions carried in (fixed — do not re-open)

| Id | Decision |
|---|---|
| D1 | Replace the seeded BIR table with the table in force since 1 Jan 2023. Migrate existing dev rows with a `scripts/migrate-*.ts`. |
| D3 | The bell + notification count belongs to **phase 06**. This plan only shrinks the pending-proposal entries and writes the requirement into the phase 06 plan. |
| D5 | Feedback placement rule: **inline if the container survives, toast if it dies.** Decidable test below. Build a shared `<FormFeedback>` by extraction. |
| D7 | Pending-proposal card = one summary line (proposer, date, change count) with the change list behind a native `<details>`; Confirm/Reject on the summary row. Three content states: 0 / 1 / 2+ real changes. |
| F6 | All four statutory paths become toasts. Settled for the whole page. |
| F8 | Add a confirm to login re-activation, AND amend the plan/report/test-script text that argued against it. |
| F9b | Fold the muted standalone settled line into the `Final pay (settled)` card and emphasize it. |

### The D5 placement rule, stated so it can be applied mechanically

> Find the `{#if}` that wraps the button. **If the action flips that condition, the container dies →
> toast (or a page-level banner outside the dying block). Otherwise → an inline `<FormFeedback>`
> slot inside the card.**

Applied:

| Site | Wrapping condition | Flipped by the action? | Surface |
|---|---|---|---|
| `employees/[id]` offboard | `{#if canManage && employee.employmentStatus === 'ACTIVE'}` (`:1821`) | **Yes** → `OFFBOARDED` | Page Banner at `:1814` survives. Keep it, drop the toast (F1). |
| `payroll/[id]` override | override panel `{#if overrideEntryId === entry.id}` (`:311`); the panel closes on success | **Yes** | Toast (F2) — and the owner asked for a toast by name. |
| `payroll/config` both cards | none; both cards always render | No | Inline `<FormFeedback>` per card (F4). |
| `payroll/statutory-rates` all four | the editor card always renders; the pending card is re-queried | No (editor) / list shrinks (proposals) | Toast for all four (F6, owner-settled). |
| `separations/[id]` settled line | `{#if !isFinalized}` / `{:else}` | Yes — but the `Final pay` card above survives both states | Fold into the surviving card (F9b). |

---

## Goal

Close F1–F9 and D1 on the non-attendance surfaces, leaving: one success surface per action, a
statutory change summary that only names things that really changed, a tax table that stops
rewriting itself, and a machine gate that catches the next feedback regression.

## Scope

**In scope (11 sections / 11 commits):**

| S | Finding | Commit subject |
|---|---|---|
| S1 | live-data restore | *(no commit — runbook + verification query)* |
| S2 | D1 | `fix(payroll): seed the BIR withholding table in force since 2023` |
| S3 | F3 | `fix(payroll): stop the config save blanking the multiplier inputs` |
| S4 | F4 | `feat(ui): add a FormFeedback slot and give each payroll config card its own` |
| S5 | F1 | `fix(employees): report an offboard once, on the surface that survives it` |
| S6 | F2 | `fix(payroll): report a net-pay override` |
| S7 | F5+F6+F7 | three commits, listed in the section |
| S8 | F8 | `feat(settings): confirm login re-activation` |
| S9 | F9a+F9b | `fix(separations): give the finalize card a fixed height and fold the settled line in` |
| S10 | trap gate | `test(ui): assert exactly one success surface per action per page` |
| S11 | D3 | `docs(plan): hand the notification bell and its data gap to phase 06` |

**Explicitly OUT of scope (binding):**

- **F10 and F11.** Every file under `src/routes/(app)/attendance/**` and
  `src/lib/server/services/attendance/**` belongs to plan B. This plan does not open them.
  The one exception is read-only: S10's gate scans those files; it must not edit them.
- **Building the bell, a `/notifications` route, or any counted badge.** D3 hands that to phase 06.
  S11 is a documentation change only.
- **Changing `deriveTaxBrackets` or `deriveSssTotals`.** D1 makes the accumulator correct by
  fixing its input. Touching the accumulator would be solving the wrong problem.
- **Re-asking the owner anything settled in D1/D3/D5/D7/F6/F8/F9b.**
- **A visual restyle of the proposal card beyond D7's shape.** The owner expects a later
  `impeccable` / `ui-ux-pro-max` pass; S7c is built for restyle-survivability, not for beauty.
- **Any `.env` edit, any `./start.sh` invocation, any server start.** The owner starts servers.

---

## Ordering Constraints (binding)

```
S1 restore ──► S2 D1 tax table ──► S7a F5 diff ──► S7c F7 card content
                     │
S3 F3 (independent)  │
                     ▼
S4 F4 FormFeedback ──┬──► S5 F1 offboard
                     ├──► S6 F2 override
                     ├──► S7b F6 toasts
                     └──► S9 F9b separations
                                   │
S8 F8 ─────────────────────────────┤
                                   ▼
                            S10 one-surface gate  (must run LAST of the code sections:
                                                   it asserts the end state)
S11 phase-06 doc amendment (independent, any time)
```

- You cannot prove "no false changed lines" (F5) while the seed still drifts → **S2 before S7a**.
- F7's 0/1/many content rule is undefined until the diff tells the truth → **S7a before S7c**.
- F5's fix and F6's fix touch the same four `return` statements → **do not touch them twice**;
  S7a and S7b are separate commits but a single edit pass over those four returns.
- `<FormFeedback>` before the sweeps → **S4 before S5, S6, S7b, S9**.
- S10's gate asserts the finished state, so it goes red until S5–S9 land → **S10 last**.

---

## Implementation Checklist

> **Repo rule inherited by EXECUTE: no explanatory comments in shipped code.** The why goes in the
> commit message. Do not narrate a diff in a comment. The existing comments in these files stay —
> this is not licence to delete them (surgical changes rule). The `// ponytail:` marker is exempt.

---

### S1 — Restore the drifted `org_seed` statutory row (live data, no commit)

**Why first.** The P1 pass applied a test proposal to the live dev DB. `org_seed` currently holds a
₱99,999-era Pag-IBIG cap, a hand-edited SSS bracket, and the drifted tax `baseTax` figures. S2's
migration is guarded on the *stock* table shape, and S7's diff work is unverifiable against a row
nobody can predict. Fix the data before writing code against it.

**Verified live state (11-09-26, `docker exec -i veent-db-5434 psql -p 5434 -U veent -d veent_hris`):**

| Org | `pagibigCap` | `sssBrackets[0].eeShare` | `taxBrackets[3..5].baseTax` |
|---|---|---|---|
| `org_seed` | **88888.00** | **188** (total 578) | **10833.5 / 40833.5 / 200833.5** |
| `org_jojo` | 200.00 | 180 (total 570) | 10833.33 / 40833.33 / 200833.33 |
| `org_sweetleaf` | 200.00 | 180 (total 570) | 10833.33 / 40833.33 / 200833.33 |

Proposal rows: 2 `APPLIED`, 1 `REJECTED`, **0 `PENDING`**. The findings doc's
`WHERE status='PENDING'` query is not reproducible — do not try to reproduce it.

**The backup is partial.** `phase-05-owner-pass_statutory-backup-org_seed.json` holds exactly four
keys: `pagibigCap` (200.0), `pagibigRate` (0.02), `sssBrackets`, `taxBrackets`. It has **no
PhilHealth columns**. Those three are currently at seed values, so nothing is lost — but this is
not a full-row restore and must not be described as one. Its `taxBrackets` are the **2018** table;
S2 supersedes them, which is why restore runs before migrate, not after.

**This cannot be done through the UI.** The statutory editor submits the whole form and would
re-derive on save. Restore by SQL.

**Steps.**

1. Snapshot the current row first, so the restore itself is reversible:
   ```
   docker exec -i veent-db-5434 psql -p 5434 -U veent -d veent_hris -tAc \
     "select row_to_json(c) from statutory_rate_configs c where c.\"organizationId\"='org_seed';" \
     > /tmp/org_seed_before_restore.json
   ```
2. Restore the three drifted values from the backup file, `org_seed` only:
   - `pagibigCap` → `200.00`
   - `sssBrackets` → the backup array (bracket 0 back to `eeShare 180`, `totalContribution 570`)
   - `taxBrackets` → the backup array (`10833.33 / 40833.33 / 200833.33`)
   Use a single `UPDATE ... WHERE "organizationId"='org_seed'` with the JSON read from the backup
   file. **Never** run it without the `WHERE` — `org_jojo` and `org_sweetleaf` are clean.
3. Leave `philhealthRate/Floor/Ceiling` and `pagibigRate` alone. They were never touched.

**Acceptance criteria (each can FAIL).**

- `AC-S1.1` — `select "pagibigCap" from statutory_rate_configs where "organizationId"='org_seed'`
  returns `200.00`.
- `AC-S1.2` — `"sssBrackets"->0->>'eeShare'` = `180` and `->>'totalContribution'` = `570`.
- `AC-S1.3` — `jsonb_path_query_array("taxBrackets",'$[*].baseTax')` for `org_seed` equals the
  value for `org_jojo`, byte for byte.
- `AC-S1.4` — `org_jojo` and `org_sweetleaf` rows are **unchanged** (compare `row_to_json` before
  and after; must be identical).

**Gate.** The four queries above, run and pasted into the phase report. No code gate — nothing is
committed in this section.

---

### S2 — D1: seed the 2023 BIR withholding table + migrate existing rows

**File:** `src/lib/server/services/payroll/ph-statutory.ts:289-296`
**New file:** `scripts/migrate-bir-tax-table-2023.ts`

**The change.** Replace `BIR_MONTHLY_TAX_TABLE` with the table in force since 1 Jan 2023:

| floor | ceiling | baseTax | rate | excessOver |
|---|---|---|---|---|
| 0 | 20833 | 0 | 0 | 0 |
| 20833 | 33332 | 0 | 0.15 | 20833 |
| 33333 | 66666 | 1875 | 0.20 | 33333 |
| 66667 | 166666 | 8541.80 | 0.25 | 66667 |
| 166667 | 666666 | 33541.80 | 0.30 | 166667 |
| 666667 | Infinity | 183541.80 | 0.35 | 666667 |

**Arithmetic verified in this plan session** against `deriveTaxBrackets`
(`statutory-rates.ts:221-235`), whose rule is `baseTax[0]=0`,
`baseTax[n]=baseTax[n-1] + (floor[n]-floor[n-1]) * rate[n-1]`:

```
baseTax[1] = 0        + (20833  - 0     ) * 0.00 = 0            ✔ matches published 0
baseTax[2] = 0        + (33333  - 20833 ) * 0.15 = 1875.00      ✔ matches published 1,875
baseTax[3] = 1875     + (66667  - 33333 ) * 0.20 = 8541.80      ✔ matches published 8,541.80
baseTax[4] = 8541.80  + (166667 - 66667 ) * 0.25 = 33541.80     ✔ matches published 33,541.80
baseTax[5] = 33541.80 + (666667 - 166667) * 0.30 = 183541.80    ✔ matches published 183,541.80
```

**This is the whole point of D1.** The 2018 table was built from exact-thirds boundaries
(33,333.33) while the rows store integer floors (33,333), which is the only reason derive and seed
disagreed. With the 2023 table, **derive == published**, so F5's "silent rewrite" stops existing —
it is not suppressed, it is made impossible. `AC-S2.2` below is the assertion that proves it.

**Note the comment at `:307` is already right.** It names the 2023 rates
`(0.15/0.20/0.25/0.30/0.35)` while the table above it is the 2018 one. The comment stays; the data
moves to meet it. Do not edit the comment.

**The migration script.** Follow `scripts/migrate-employment-type-regular.ts` and
`scripts/migrate-pagibig-cap-200.ts` conventions exactly: a header comment giving the one-line
`pnpm tsx scripts/...` invocation and the *why*, a `PrismaClient`, an idempotent guarded update, a
`✔` console line with the affected count, and the `main().then(disconnect).catch(...)` tail.

- **Guard on the rate vector, not on `baseTax`.** All three live orgs hold rates
  `[0, 0.2, 0.25, 0.3, 0.32, 0.35]`; `org_seed`'s `baseTax` is drifted, so a full-table equality
  guard would skip exactly the row that most needs migrating. Match rows whose
  `taxBrackets` rate vector equals the 2018 vector and whose floor vector equals
  `[0, 20833, 33333, 66667, 166667, 666667]`, then write the 2023 table.
- Any org whose rates differ from the 2018 vector is deliberately customized → leave it alone and
  report it by id.
- Idempotent: a second run reports `0 config row(s)`.
- `pnpm check` does **not** cover `scripts/**` (context: all-tests). Run the script for real against
  the dev DB and read the row back; do not rely on a type-check.

**The golden-test churn — the largest single risk in this plan.** Changing the engine default
changes every absolute tax figure in the unit suite. Verified touch points (35 `withholdingTax`
mentions across 17 test files):

| File | What must be recomputed |
|---|---|
| `tests/unit/ph-statutory.test.ts:71,75` | `computeWithholdingTax(20000)` stays `0`; `(25000)` moves `833.40 → 625.05` |
| `tests/unit/payroll-statutory-config.test.ts:117,134,325,348,360` | table-driven `exp.tax` rows + the `30000 → '1463.4'` baseline + the two hand-built-table cases at `:348`/`:360` (those pass their **own** table and should be unaffected — confirm, do not assume) |
| `tests/unit/payroll-calculator.test.ts:40` | `731.7` |
| `tests/unit/payroll-standard-period-golden.test.ts:116,166,216,266,316,366,423,473` | eight inline-snapshot `withholdingTax` values (`731.7` ×6, `1463.4` ×2) **and** every `netPay`/`totalDeductions` figure in the same snapshots |
| `tests/unit/payroll-custom-period-statutory-proration.test.ts:32,52,116` | the `MONTHLY.withholdingTax = 1463.4` constant; the two proration assertions derive from it |
| `tests/unit/payroll-custom-period-ee-share.test.ts:59,88` | `1463.4 * CUSTOM_SHARE` ×2 |
| `tests/unit/payroll-statutory-exemption.test.ts:61,80,120` | relative to `base` — should hold; confirm |
| `tests/unit/payroll-statutory-allocation.test.ts:125` | relative equality — should hold; confirm |
| `tests/unit/payroll-deductions.test.ts:57`, `payslip-*.test.ts`, `report-scoping.test.ts` | hand-fed literals, not engine output — should hold; confirm |

**Method, mandatory:** run `pnpm test`, take the actual failure list, and **recompute each new
expected value by hand from the 2023 table** before writing it in. Do **not** paste vitest's
"received" value into the expectation — that is a test that can no longer fail. Record the
hand-computation for at least the golden file in the phase report.

E2E: `payroll-lock-idempotency`, `payroll-void-run-amortization`, `payslip-draft-visibility`,
`payslip-tenancy` reference tax; check whether any assert an absolute peso figure.

**Acceptance criteria (each can FAIL).**

- `AC-S2.1` — `BIR_MONTHLY_TAX_TABLE` carries rates `0/0.15/0.20/0.25/0.30/0.35` and baseTax
  `0/0/1875/8541.8/33541.8/183541.8`.
- `AC-S2.2` (**the D1 proof**) — a new unit test asserts
  `deriveTaxBrackets(BIR_MONTHLY_TAX_TABLE.map(({floor,rate}) => ({floor,rate})))` returns
  `baseTax` values **identical** to `BIR_MONTHLY_TAX_TABLE`'s own. This test must be written to
  fail against the 2018 table — verify that by stashing the new table and watching it go red
  (negative control).
- `AC-S2.3` — `pnpm tsx scripts/migrate-bir-tax-table-2023.ts` reports `3 config row(s)` on the
  first run and `0 config row(s)` on the second.
- `AC-S2.4` — after the migration, all three orgs' `taxBrackets` read
  `[0,0,1875,8541.8,33541.8,183541.8]` with rates `[0,0.15,0.2,0.25,0.3,0.35]`.
- `AC-S2.5` — `pnpm test` is green, and every changed expectation has a hand-derived figure
  recorded in the phase report.

**Gate.** `pnpm format:check && pnpm lint && pnpm check && pnpm test`, plus the two script runs and
the read-back query.

---

### S3 — F3: `payroll/config` save blanks the six multiplier inputs

**File:** `src/routes/(app)/payroll/config/+page.svelte:15-18`
(verified: `await update()` at `:16`, baseline re-seed at `:17`)

**The change.** `await update()` → `await update({ reset: false })`.

`update()` defaults to `reset: true`, which does a native form reset. The six inputs
(`:184-197`) are `<input type="number" bind:value={rateValues[f.name]}>` with no `value`
attribute, so the reset blanks them and an empty number input binds back as `null`. `:17` then
copies those nulls into `baselineRates`, which is what the next confirm dialog prints as the "was".

**Precedents (do not invent a new pattern):** `performance/reviews/[id]:71-73` (carries the
explanatory comment), `timesheets/AggregatePanel.svelte:58,66`,
`timesheets/TimesheetModal.svelte:255,262`, `performance/templates/[id]:137`, `settings/org:21`.

**Audit, do not blanket-fix.** These files have a bare `update()` **and** use `bind:value`. Each
needs its own per-form confirmation that a reset would actually blank a bound input before it is
touched. If a form's inputs carry a `value` attribute or are not bound, leave it alone and say so:

- `src/routes/(app)/departments/+page.svelte:18,23,54,72`
- `src/routes/(app)/requests/+page.svelte:63`
- `src/routes/(app)/settings/backup/+page.svelte:25`

Fix in this commit only the ones that reproduce the blanking. Record the verdict for each of the
six in the phase report.

**Acceptance criteria.**

- `AC-S3.1` — after Save Multipliers, the six inputs still show their saved values (live browser).
- `AC-S3.2` — edit two fields and save again without reloading: the dialog reads
  `Overtime: 1.25 → 1.4`, not `null → 1.4`.
- `AC-S3.3` — save with no edits: no dialog fires and the fields keep their values.
- `AC-S3.4` — each of the six audited `update()` sites has a written verdict (fixed / not
  applicable + why).

**Gate.** Full gate set + a live browser pass (see Live Passes below — this one is
step-at-a-time).

---

### S4 — F4: the shared `<FormFeedback>` component + `payroll/config` split

**New file:** `src/lib/components/ui/FormFeedback.svelte`
**Files:** `src/routes/(app)/payroll/config/+page.svelte:84-86`,
`src/routes/(app)/payroll/config/+page.server.ts:104,154`

**This is an extraction, not an invention.** The pattern is hand-rolled at
`employees/[id]:493, 559, 1537-1539, 1631-1633, 1813-1814` and on the dashboard at `:341, :375,
:633`. `<FormFeedback>` wraps the existing kit `Banner` with the action-gating those sites all
hand-roll. **Do not re-implement Banner's colour logic** — `Banner.svelte` documents that its class
strings must stay complete and static for Tailwind's JIT, and there is no safelist.

Shape (contract, not code): the component takes the page's `form` object, the action name(s) it
answers for, and renders the success/error/notice banner **only** when `form.action` matches. It
renders nothing otherwise. It must not introduce a new colour, padding or text size — it composes
`Banner`.

**The `payroll/config` fix — the only page in the sweep with a shared banner AND a shared string.**
Verified: both `?/update` (`+page.server.ts:104`) and `?/updateRates` (`:154`) return a bare
`{ success: true }`, and the string is hard-coded client-side at `+page.svelte:84-85`
(`Payroll configuration saved successfully.`). Measured gap: banner at page-y 32, Save Multipliers
button at page-y 919 — 887px.

1. Server: `:104` → `{ action: 'update', saved: 'Payroll configuration saved.' }`;
   `:154` → `{ action: 'updateRates', saved: 'Multipliers saved.' }`.
2. Client: delete the shared `{#if form?.success}` Banner at `:84-86`. Put a `<FormFeedback>` inside
   the configuration card (action `update`) and another inside the multipliers card (action
   `updateRates`), each next to its own Save button.
3. Leave the shared `{#if form?.error}` block at `:88-94` in place for now unless the error path is
   equally ambiguous — if it is, split it the same way in this commit and say so.

**Do not widen the sweep.** Verified corrections to the findings doc's site list:

- **`/attendance` is NOT in the F4 sweep.** It has no page-level banner; `form?.importError`
  (`:479`) and `form?.imported` (`:487`) are both scoped inside the import card, and the M-9
  comment at `:474` is stale. It is also plan B's file. Do not open it.
- `statutory-rates` and `employees/[id]` share a banner but each action carries its own string, so
  they are not the F4 defect — they are handled by S7 and S5 on their own terms.
  `employees/[id]:207` serves 15 actions via the `DONE` map at `:149-165`; that map is correct and
  stays.

**Acceptance criteria.**

- `AC-S4.1` — `FormFeedback.svelte` exists, composes `Banner`, and adds no new colour/spacing token.
- `AC-S4.2` — pressing **Save Multipliers** shows `Multipliers saved.` inside the multipliers card;
  the configuration card shows nothing.
- `AC-S4.3` — pressing **Save Configuration** shows `Payroll configuration saved.` inside the
  configuration card; the multipliers card shows nothing.
- `AC-S4.4` — the vertical distance between the acted-on button and its message is under one
  viewport height at 903px (measure it, do not assert it by eye).

**Gate.** Full gate set + live browser pass.

---

### S5 — F1: report an offboard once

**File:** `src/routes/(app)/employees/[id]/+page.svelte:115`

**The change.** `const offboard = submitFeedback({ error: null })` →
`submitFeedback({ error: null, success: null })`.

**Why this direction.** The page Banner at `:1813-1814` is deliberately rendered **outside** the
`{#if canManage && employee.employmentStatus === 'ACTIVE'}` block (`:1821`) because a successful
offboard flips `employmentStatus` to `OFFBOARDED` and unmounts that block. Per D5 the container
dies, so the surviving surface stays and the duplicate goes. `success: null` suppresses the toast
without deleting the Banner — the surviving-surface guarantee is preserved.

**F1 is a one-site problem — verified.** `offboard` is the **only** action on this page that returns
a `saved` string, so it is the only one that toasts today. Dropping that toast silences nothing
else. Corrected count: there are **20** `submitFeedback({ error: null })` calls on this page
(`:113-130`, `:144`, `:146`), not 16, but 19 of them return `{ action, success: true }` and have
never toasted. **Do not** add `success: null` to the other 19 — it would be a no-op diff.

**Do not delete the `error: null` argument.** `:112` explains it: each card renders its own failure,
so an error toast would repeat it.

**Acceptance criteria.**

- `AC-S5.1` — confirming an offboard shows `Employee offboarded.` in exactly one place: the page
  Banner. No toast fires (sample the toast region for ≥4s from the click).
- `AC-S5.2` — the Banner is still rendered after the card unmounts, i.e. it is readable on the
  post-offboard page.
- `AC-S5.3` — the other 19 actions on the page are unchanged (diff shows one changed line).
- `AC-S5.4` — `tests/e2e/timesheet-punch.spec.ts:94`'s scoped-to-`<main>` workaround still passes
  (it was written around this exact double-surface shape).

**Gate.** Full gate set + live browser pass. This one destroys a record — use a disposable employee.

---

### S6 — F2: report a net-pay override

**Files:** `src/routes/(app)/payroll/[id]/+page.server.ts:121-144`,
`src/routes/(app)/payroll/[id]/+page.svelte:8, 72-79, 318, 358-360`

**Two independent gaps, both must close.**

1. **Server.** `?/override` returns `fail(...)` on the error paths and then falls off the end on
   success (verified: the action ends at `:144` after `await overridePayrollEntry(...)` with no
   return). Add `return { action: 'override', saved: 'Net pay overridden.' }`. Precedent for the
   exact shape: `payroll/periods/+page.server.ts:121`
   (`{ action: 'void', saved: 'Period voided.' }`).
2. **Client.** The per-entry guard factory `overrideGuard(entryId)` (`:72-79`) memoises
   `createSubmitGuard()` in a `Map`. Swap the factory's body to `submitFeedback()`. **The
   double-submit guard is not lost**: `submit-feedback.svelte.ts:55` builds on `createSubmitGuard`
   and re-exposes `busy` at `:98-101`. Verified reads that must still resolve: `overrideG.busy` at
   `:358` and `:360`; `use:enhance={overrideG.enhance}` at `:318`.

**Keep the per-entry memoisation.** The form is inside an `{#each}`; a shared guard would lock every
row. The `Map` stays exactly as it is — only the constructor changes.

**Do not add a banner to this page.** The override panel closes on success (container dies, D5) and
the owner asked for a toast by name.

**ConfirmDialog-direct inventory — corrected.** The findings doc's list is wrong. Verified
mutating-action direct mounts: `payroll/[id]:525`, `payroll/config:212`,
`payroll/statutory-rates:630`, `employees/[id]:1855`, `separations/[id]:277`. Non-action navigation
guards (not in scope): `statutory-rates:638`, `performance/templates/[id]:473` and `:482`.
**`performance/reviews/[id]` is NOT a direct-mount site** — it uses `ConfirmButton` at `:153`. Of
the five mutating direct mounts, exactly **one** (this one) reports nothing. No further sweep is
needed; record that finding rather than re-deriving it.

**Acceptance criteria.**

- `AC-S6.1` — confirming `Override this net pay?` fires a success toast reading
  `Net pay overridden.` within 1s (sample the polite live region).
- `AC-S6.2` — the row still re-renders with the new figure and the run header still gains its
  **Has overrides** badge.
- `AC-S6.3` — the Save button still disables while in flight (`overrideG.busy` resolves), and a
  fast double-click produces exactly one `PayrollEntry` audit row.
- `AC-S6.4` — a validation failure (blank note) still renders the existing `form?.error` block at
  `:161-167` **and** now toasts the error once — confirm it does not double-report; if it does,
  pass `error: null` and say so.

**Gate.** Full gate set + live browser pass + a `psql` read-back of `payroll_entries.netPay`.

---

### S7 — F5 + F6 + F7: `/payroll/statutory-rates` (ONE section, three commits)

**Files (both, all three commits):**
`src/routes/(app)/payroll/statutory-rates/+page.server.ts`,
`src/routes/(app)/payroll/statutory-rates/+page.svelte`
**New file:** `src/lib/server/services/payroll/statutory-change-summary.ts` (+ its unit test)

> **Single edit pass over the four `return` statements.** S7a and S7b both change
> `+page.server.ts:203, 218, 229, 240`. Make one pass, split the commits by content. Do not open
> those four lines twice.

#### S7a — F5: the change summary must only name what really changed

**The real cause is NOT SSS-specific — verified.** `summarizeChanges`
(`+page.server.ts:40-63`) already compares payload vs live. The bug is that `:52-56` and `:57-61`
compare with key-order-sensitive `JSON.stringify`. Postgres `jsonb` normalises key order (length,
then alphabetical) while the derive helpers build objects in declaration order:

| | key order |
|---|---|
| stored SSS (jsonb) | `eeShare, erShare, salaryFloor, salaryCeiling, totalContribution` |
| payload SSS (`deriveSssTotals`, `statutory-rates.ts:238-242`) | `salaryFloor, salaryCeiling, eeShare, erShare, totalContribution` |

Same shape for `taxBrackets`. So **the SSS line and the BIR line fire on every proposal
unconditionally**, regardless of what the user edited. That is the whole of symptom 2 in F5.

**Changes.**

1. Extract `summarizeChanges` (it is currently unexported inside a `+page.server.ts` and has **zero**
   test coverage) into `src/lib/server/services/payroll/statutory-change-summary.ts`, exported, with
   the `WireConfig`/`StatutoryRateInput` types it needs. `+page.server.ts` imports it.
2. Replace the two `JSON.stringify` comparisons with a **key-order-insensitive deep value
   comparison** of the bracket arrays: compare element-by-element on the named numeric fields
   (`salaryFloor, salaryCeiling, eeShare, erShare, totalContribution` /
   `floor, ceiling, baseTax, rate, excessOver`), plus array length. Do not sort keys via a
   stringify-with-replacer trick and call it done — compare the fields you mean, so a future added
   field fails loudly rather than silently.
3. Keep the scalar comparisons at `:44-51` exactly as they are. They are correct.
4. The `'No effective change vs the live rates.'` fallback at `:62` becomes **reachable for the
   first time**. That is intended and S7c renders it.

**Why S2 must land first:** with the 2018 table, `deriveTaxBrackets` genuinely changes `baseTax` on
every save, so the BIR line would still be "true" and the fix would be unprovable. After S2, derive
== published, so an untouched tax table compares equal and the line correctly disappears.

**Tests (new file, `tests/unit/statutory-change-summary.test.ts`).**

- SSS payload built in derive order vs a live config built in jsonb order, values identical →
  **no** `SSS contribution table changed` line. *(This test fails against today's code — that is
  the point. Confirm it goes red before the fix.)*
- Same for `taxBrackets`.
- A genuinely changed SSS `eeShare` → the line **is** produced.
- A genuinely changed tax `rate` → the line **is** produced.
- A bracket-count change (34 vs 33 rows) → the line **is** produced.
- Pag-IBIG cap only → exactly one line, `Pag-IBIG cap: ₱200 → ₱99,999`.
- Nothing changed → exactly `['No effective change vs the live rates.']`.

**Do not touch** `touchedServices` or the confirm-dialog sentence. P1-9a proved the dialog is
already correct ("You are changing: SSS, Pag-IBIG…"); it is the highest-value message in the phase.
Fixing the dialog would be fixing the wrong end.

**Acceptance criteria.**

- `AC-S7a.1` — the seven unit cases above pass; the first two are proven to fail against the
  pre-fix code (negative control, recorded).
- `AC-S7a.2` — live: as `hr@veent.ph`, change only the Pag-IBIG cap and submit. As `ceo@veent.ph`
  the pending proposal lists **exactly one** line, the Pag-IBIG one.
- `AC-S7a.3` — `summarizeChanges` is exported from a module outside `+page.server.ts` and is
  covered by tests.

**Commit:** `fix(payroll): compare statutory payloads by value, not by JSON key order`

#### S7b — F6: all four statutory paths become toasts

**F6's wiring is half what the findings doc says — verified.** Only submit and save use
`createSubmitGuard` (`+page.svelte:15`). **Confirm and reject already use `ConfirmButton`**
(`:272` and `:283`), which wires `submitFeedback` internally
(`ConfirmButton.svelte:50-53`) — they still stay silent because all four server actions return
`success:` while `submitFeedback` only reads `saved:`
(`submit-feedback.svelte.ts:39-41`, `savedMessage`). The page Banner at `:240-241` reads
`form.success`.

**Both ends move together.** Server (`+page.server.ts`):

| Line | Action | `{ success: '…' }` → `{ action: '…', saved: '…' }` |
|---|---|---|
| `:203` | `saveStatutoryRates` | `Statutory rates saved.` |
| `:218` | `proposeStatutoryRates` | `Change submitted for CEO approval.` |
| `:229` | `confirmProposal` | `Proposal applied to the live rates.` |
| `:240` | `rejectProposal` | `Proposal rejected.` |

Client (`+page.svelte`):

1. Delete the `{#if form?.success}` Banner block at `:240-242`.
2. Swap `saveGuard` (`:15-19`) from `createSubmitGuard` to `submitFeedback`, keeping the existing
   inner handler intact — the baseline re-seed at `:17-18`
   (`if (result.type === 'success') baselineStatutory = serviceState()`) is what stops the dirty
   guard re-reporting committed edits, and it must survive. `submitFeedback` takes it via `inner`.
   **Read the `inner` contract before wiring**: when the wrapped handler returns its own callback it
   owns the response, including whether to call `update()` (`submit-feedback.svelte.ts:70-78`). The
   current handler calls `await update()` itself, so it keeps doing so.
3. Confirm/Reject need **no client change** — they inherit the toast the moment the server returns
   `saved`.
4. `saveGuard.busy` reads (`:620`) must still resolve.
5. Leave the `{#if form?.error}` block at `:243-249` alone; the error path is unchanged.
6. If the `Banner` import becomes unused after step 1, remove it — that orphan is created by this
   change (surgical-changes rule). **Check first**: a stray import removal has silently broken
   `use:enhance` in this repo before.

**Acceptance criteria.**

- `AC-S7b.1` — each of the four actions fires exactly one success toast with its own string, and
  **no** green Banner renders anywhere on the page.
- `AC-S7b.2` — the dirty/leave guard still works: edit a field, save, then navigate — no
  "Leave without saving?" dialog (the baseline re-seed survived the swap).
- `AC-S7b.3` — the double-submit guard still holds: a fast double-click on Save produces one audit
  row.
- `AC-S7b.4` — the error path still renders the red block AND does not double-report.

**Commit:** `fix(payroll): toast the four statutory-rate outcomes instead of banner-ing them`

#### S7c — F7: shrink the pending-proposal entry (card density only)

**File:** `src/routes/(app)/payroll/statutory-rates/+page.svelte:251-299`
(card opens `:253`, per-proposal block `:257`, the `<ul>` of changes `:264-268`, the
ConfirmButton pair `:270-293`)

**D7 shape.** One summary row: proposer, date, change count, Confirm, Reject. Change list behind a
native `<details>`/`<summary>` disclosure. Native on purpose — the owner expects a later visual
pass, and a hand-rolled disclosure is one more thing that pass has to unpick.

**Three content states, mandatory.** F5's fix makes the first one reachable for the first time:

| `p.changes` | Render |
|---|---|
| exactly `['No effective change vs the live rates.']` (0 real changes) | Say so plainly on the summary row and mark it a reject candidate. **No** disclosure — there is nothing to disclose. |
| 1 real change | Render the single line inline on the summary row. **No** disclosure — do not hide one short line behind a click. |
| 2+ real changes | `N changes` on the summary row; the list inside `<details>`. |

**Do not change** the two `ConfirmButton` messages. `destructive-confirms.test.ts` pins
`These rates become the live tax and contribution tables for the whole organization` (site 7) and
`there is no draft to return to` (site 8), and the confirm message interpolates `p.changes.join()`
— that interpolation must survive the restructure so the dialog keeps naming the consequence.

**Restyle-survivability requirement.** Keep the existing kit classes (`rounded-md border bg-card`,
`bg-muted/30`) and the existing `#108` comments on the ConfirmButtons. Add no new colour token.

**Acceptance criteria.**

- `AC-S7c.1` — a proposal with one change renders its line inline, with no `<details>` element.
- `AC-S7c.2` — a proposal with 3 changes renders `3 changes` and a collapsed `<details>`; expanding
  it shows all three.
- `AC-S7c.3` — an empty proposal renders the plain "no effective change" wording and is visibly a
  reject candidate.
- `AC-S7c.4` — the rendered height of one pending entry is measurably smaller than today's for the
  3-change case (measure both, record both numbers).
- `AC-S7c.5` — `destructive-confirms.test.ts` sites 7 and 8 still pass unchanged.
- `AC-S7c.6` — the Confirm dialog still lists the changes in its message.

**Commit:** `refactor(payroll): collapse each pending rate proposal to one summary row`

**Fixture note.** There are currently **0 PENDING proposals** in the dev DB. To test S7a/S7c you
must create them as `hr@veent.ph` through the UI. Create three: a Pag-IBIG-cap-only one (1 change),
a multi-tab one (2+ changes), and — after S7a — a submit with no edits at all if the form allows it,
to reach the empty state. If the form refuses a no-change submit, say so and reach the empty state
via a crafted row instead.

---

### S8 — F8: confirm login re-activation, and amend the text that argued against it

**File:** `src/routes/(app)/settings/roles/+page.svelte:214-223` (the `{:else}` activate branch)

**The change.** Route the activate branch through `ConfirmButton`, exactly like the deactivate
branch at `:202-212`. Keep the per-row `setActiveGuard(u.id)` (`:30-31`, `:186`) — it is the #108
double-submit guard and `ConfirmButton` has its own internal `submitFeedback`; make sure the row
does not end up with two competing guards. If `ConfirmButton`'s internal guard is sufficient for
this row (it is for the deactivate branch), drop the row's own guard **for this branch only** and
say so; the `{#if u.isActive}` branch is unaffected.

Keep `<input type="hidden" name="isActive" value="true" />`.

**The message must name a real consequence, not restate the action.** Approved draft:

> `{u.email} can sign in again immediately and regains access to everything their roles allow.`

**The test fear is unfounded — verified.** Nothing in `destructive-confirms.test.ts` pins the
activate branch as unconfirmed. G1 (`:35-48` WIRING, the `settings/roles` row) requires only a
`Confirm*` import plus the `?/setActive` string — both already true. G3's site-12 needle
(`:190-194`) is `Their employee record, payroll history and documents are untouched`, the
**deactivate** message. Adding the confirm turns nothing red.

**The one deliberate bump.** Adding this message to the `COPY` array means the
`expect(COPY.length).toBe(17)` assertion at `:219` must go to **18**, and the header comment at
`:185-187` ("17 messages across 16 sites") must be updated to say 18 across 16 sites, with site 12
now carrying two. Add the new entry as `site: '12b re-activate login'` with a non-interpolated
needle — `can sign in again immediately and regains access to everything their roles allow` (the
`{u.email}` prefix is interpolated and cannot be part of the needle).

**Documentation amendments — all five, in this commit.** Otherwise the next reader hits a plan that
argues against the shipped code:

| File | Line | What to change |
|---|---|---|
| `phase-05-destructive-actions_PLAN_03-09-26.md` | `:472` | Remove the "Login re-activation" row from the *Deliberately Not Confirmed (and why)* table; add a note that owner decision 11-09-26 reversed it. |
| same | `:385-387` | Rewrite the "Asymmetric by design" paragraph — the asymmetry is gone; both directions confirm, with different consequences named. |
| same | `:389-392` | Update the site 12 wiring instruction to cover both branches. |
| `phase-05-destructive-actions_REPORT_03-09-26.md` | `:64` | Same correction, marked as a post-pass amendment. |
| `phase-05-destructive-actions_TEST-SCRIPT_11-09-26.md` | `:619`, `:1150` | Update the P1-12b steps: a dialog now appears on activate; assert its copy instead of asserting its absence. |

**Do not delete the original reasoning.** Amend it with the date and the owner's call, so the
record shows a decision was reversed, not that it never existed.

**Acceptance criteria.**

- `AC-S8.1` — clicking **Activate** opens a dialog whose message names the access consequence.
- `AC-S8.2` — confirming it still fires the `Login activated.` toast and flips the row badge.
- `AC-S8.3` — cancelling it leaves `isActive` false (read back via `psql`).
- `AC-S8.4` — the row's double-submit protection still holds (fast double-click → one audit row).
- `AC-S8.5` — `COPY.length === 18`, the header comment says 18, and all 18 needles pass.
- `AC-S8.6` — all five documentation anchors are amended; `grep -n "Deliberately Not Confirmed" -A20`
  no longer shows a re-activation row.

**Gate.** Full gate set + live browser pass.

---

### S9 — F9: the finalize card's height, and the orphaned settled line

**File:** `src/routes/(app)/separations/[id]/+page.svelte`
(verified: `Final pay (settled)` card opens `:166`, heading `:169`; finalize card `:193-224`,
heading `:195`, `#finalize-bar` `:211-215`; `{:else}` `:225`; muted settled block `:226-231`;
`Undo finalization` card `:233`)

#### S9a — uniform min/max height on the finalize card

Give the card at `:194` a `min-h-*` and a `max-h-*` so it holds one size whether or not the amber
`#finalize-bar` refusal text and the `pendingCount` warning are present, and so the finalized
`{:else}` state does not shrink the column. Measured spread today: Clearance checklist 416px,
Final pay (settled) 206px, Undo finalization 242px.

Pick the floor from the tallest realistic case (bar present + pending count present), not from the
current page. If the max-height would clip the refusal text at a narrow width, the max is wrong —
the refusal text is the thing a user must read.

#### S9b — fold the settled line into the `Final pay (settled)` card

Today `:226-231` renders a standalone `bg-muted/30 ... text-muted-foreground` block, a direct child
of the page's `space-y-6` stack — so the single most important fact on a finalized separation is in
the page's lowest-emphasis style, in a card with no heading, while `Final pay (settled)` sits right
above it as its own titled card.

**Owner-approved shape.** Move it into the `Final pay` card (`:166-190`), which already owns this
information and already switches its own heading on `isFinalized`. Drop
`text-muted-foreground`; keep `font-mono` on the peso figure and emphasize the amount; treat the
date as secondary. Delete the now-empty standalone block. If that leaves the `{:else}` branch
holding only the `{#if data.canUndo}` undo card, simplify it — that orphan is created by this
change.

**F9 breaks no test — verified.** `tests/e2e/separations.spec.ts` has **zero** assertions on
`settled`, `Finalized on` or `Final pay`. The site-13 needle in `destructive-confirms.test.ts:196-199`
is the **dialog** string at `+page.svelte:85`, unaffected. No count needs bumping in this section.

**Acceptance criteria.**

- `AC-S9.1` — the finalize card's rendered height is identical (±2px) with and without the
  `#finalize-bar` text present. Measure both.
- `AC-S9.2` — the refusal text is fully visible at 903px and at a narrow viewport; nothing is
  clipped by the max-height.
- `AC-S9.3` — on a finalized separation the settled date and amount render **inside** the
  `Final pay (settled)` card, and the standalone muted block no longer exists in the DOM.
- `AC-S9.4` — the amount's computed colour is not `--muted-foreground`.
- `AC-S9.5` — `tests/e2e/separations.spec.ts` still passes.

**Gate.** Full gate set + live browser pass (needs a finalized separation —
`scripts/seed-separation-demo.ts` exists; check it produces one, else finalize a disposable case).

---

### S10 — The trap gate: exactly one success surface per action per page

**New file:** `tests/unit/success-surfaces.test.ts`

**Why this exists.** The uxui context records the rule: *before suppressing a toast, prove the
replacement surface exists* — **two feedback defects shipped in PR #13 from exactly this move**, and
F1 is a third instance of the same shape going the other way. This gate would have caught all three.

**Shape.** Model it on `tests/unit/destructive-confirms.test.ts`: a source scan, a per-site table,
one `it()` per site, and an explicit statement of what it does **not** prove.

Per `(page, action)` pair, assert exactly one of these is wired:

- a toast — the action returns `saved: '<string>'` **and** the client form's handler is
  `submitFeedback`/`ConfirmButton` without `success: null`; or
- an inline/page surface — a `<FormFeedback>` or `Banner` gated on `form.action === '<action>'`,
  **and** the toast is suppressed (`success: null`) or the action returns no `saved` string.

Two ⇒ fail (the F1 shape). Zero ⇒ fail (the F2 shape).

**The table must cover, at minimum:** `employees/[id]` offboard (banner, toast suppressed),
`payroll/config` update + updateRates (inline FormFeedback each), `payroll/[id]` override (toast),
`payroll/statutory-rates` ×4 (toast), `payroll/periods` void + release (existing), `settings/roles`
setActive (existing toast), `separations/[id]` finalize + undo (existing).
`attendance` is **read-only** in this scan — assert its current state, do not change the file.

**Honesty requirements, non-negotiable.**

1. A header block stating this is a source scan: it proves text co-occurs in a file, not that a
   surface renders, is reachable, or is read before it dismisses. Same limitation
   `destructive-confirms.test.ts` already states at `:11-18`.
2. **A non-vacuity assertion**, like G2's `sourceFiles().length > 100`: assert the site table is
   non-empty and that every listed file was actually read.
3. **A proven negative control.** Before the commit lands: remove one wired surface (e.g. delete the
   `payroll/config` multipliers `<FormFeedback>`), run the gate, **watch it go red**, restore, run
   again, watch it go green. Paste both runs into the phase report. A check that cannot fail is not
   a check.

**Acceptance criteria.**

- `AC-S10.1` — the gate is green against the end state of S2–S9.
- `AC-S10.2` — the negative control is recorded: one removal → red, restore → green, both outputs
  in the report.
- `AC-S10.3` — the gate fails on a *second* surface too, not just on zero. Prove it: add a
  duplicate banner to one page, watch it go red, remove it.
- `AC-S10.4` — the file states its own limits and carries a non-vacuity assertion.

**Gate.** Full gate set.

---

### S11 — D3: hand the bell and its data gap to phase 06 (documentation only)

**File:** `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-06-surface-consolidation_PLAN_03-09-26.md`
(status `PLANNED`, unexecuted — verified; S1 at `:128` already owns "Awaiting-you block + summed nav
badge", which is the right home)

**No source files change in this section.**

Write into the phase 06 plan:

1. **Into S1's scope (`:128-170`)** — a notification bell in the app shell carrying a dot with the
   count of outstanding items, as the persistent-trace surface. Cite the existing justification
   already in the codebase: `approvals.ts:466-468` says *"Notifications are one-shot toasts marked
   read on the next page load, so without this badge a proposal filed while the confirmer was away
   leaves no standing trace anywhere in the UI."* A bell with a persistent count is the general
   answer to the problem that comment works around one badge at a time.
2. **The data gap, stated as a verified fact** — `countPendingApprovals` → `listActionableProposals`
   reads `db.actionProposal` (`action-proposals.ts:324`), a **different model** from the
   `statutoryRateProposal` rows the statutory page creates. So a pending statutory-rate proposal is
   **invisible** to the sidebar count today. Whatever the bell counts must include it. **This is a
   data question to settle before any visual work**, and it must be listed as a phase 06 entry
   condition, not discovered during its execution.
3. **The scope warning** — a bell opening a dedicated proposals page is a *fifth* inbox unless it is
   folded into phase 06's combined "awaiting me" view. Phase 06's own binding decision D3 says the
   four pages stay. The bell must route through the aggregator, not around it.
4. **Update the phase 06 `Blast Radius` and `Verification Evidence` sections** to include the bell
   and the `statutoryRateProposal` count fix, so its exit gate covers them.
5. Note the owner's expectation that the visual design is refined later by `impeccable` /
   `ui-ux-pro-max`.

**Explicitly state in the phase 06 plan that F7's card-density half was done in this plan (S7c)**, so
phase 06 does not redo it.

**Acceptance criteria.**

- `AC-S11.1` — the phase 06 plan names the bell inside S1's scope, not as a new section.
- `AC-S11.2` — the `db.actionProposal` vs `statutoryRateProposal` gap is written down with both
  file:line citations and is listed as an entry condition.
- `AC-S11.3` — phase 06's Blast Radius and Verification Evidence sections mention the bell.
- `AC-S11.4` — no file under `src/` changes in this commit.

**Gate.** `pnpm format:check` (prettier covers markdown) + a read-back of the amended sections.

---

## Touchpoints

**Changed — source:**

| File | Sections |
|---|---|
| `src/lib/server/services/payroll/ph-statutory.ts` | S2 |
| `scripts/migrate-bir-tax-table-2023.ts` *(new)* | S2 |
| `src/routes/(app)/payroll/config/+page.svelte` | S3, S4 |
| `src/routes/(app)/payroll/config/+page.server.ts` | S4 |
| `src/lib/components/ui/FormFeedback.svelte` *(new)* | S4 |
| `src/routes/(app)/employees/[id]/+page.svelte` | S5 |
| `src/routes/(app)/payroll/[id]/+page.server.ts` | S6 |
| `src/routes/(app)/payroll/[id]/+page.svelte` | S6 |
| `src/lib/server/services/payroll/statutory-change-summary.ts` *(new)* | S7a |
| `src/routes/(app)/payroll/statutory-rates/+page.server.ts` | S7a, S7b |
| `src/routes/(app)/payroll/statutory-rates/+page.svelte` | S7b, S7c |
| `src/routes/(app)/settings/roles/+page.svelte` | S8 |
| `src/routes/(app)/separations/[id]/+page.svelte` | S9 |
| possibly `departments/+page.svelte`, `requests/+page.svelte`, `settings/backup/+page.svelte` | S3 (only if the audit proves the blanking reproduces) |

**Changed — tests:**
`tests/unit/destructive-confirms.test.ts` (S8, count bump),
`tests/unit/statutory-change-summary.test.ts` *(new, S7a)*,
`tests/unit/success-surfaces.test.ts` *(new, S10)*,
plus the golden/tax expectation files listed in S2.

**Changed — docs:** the three phase 05 artefacts (S8), the phase 06 plan (S11).

**Read-only (must not be edited by this plan):** every file under
`src/routes/(app)/attendance/**` and `src/lib/server/services/attendance/**` — plan B owns them.

---

## Public Contracts

| Contract | Change | Who is affected |
|---|---|---|
| `BIR_MONTHLY_TAX_TABLE` | Rates and baseTax change (2018 → 2023). | `computeWithholdingTax`, every payroll computation, every payslip, every report — **this is the single widest-blast change in the plan**. |
| `statutory_rate_configs.taxBrackets` (DB) | Migrated for all three dev orgs. | Any org still on the 2018 table. Customized orgs are guarded out. |
| `?/override` action return (`payroll/[id]`) | `undefined` → `{ action, saved }`. | Only its own page. The `form?.error` branch at `:161` is unchanged. |
| `?/update` / `?/updateRates` returns (`payroll/config`) | `{ success: true }` → `{ action, saved }`. | Only its own page; the client's hard-coded string at `:84-85` is deleted with it. |
| Four statutory action returns | `{ success }` → `{ action, saved }`. | Only its own page; the page Banner reading `form.success` is deleted with them. |
| `summarizeChanges` | Becomes an exported module function. | New import in `+page.server.ts`; no behaviour change for callers other than correctness. |
| `<FormFeedback>` | New kit component. | Additive. Nothing else is required to adopt it in this plan. |
| `destructive-confirms.test.ts` `COPY` | 17 → 18 entries. | Plan B has been told this file is ours. |

**No schema change. No capability change. No new route. No new dependency.**

---

## Blast Radius

| Class | Present? | Where |
|---|---|---|
| money / payroll computation | **YES** | S2 — the withholding-tax engine default |
| schema / data migration | **YES** (data only, no schema) | S2 migration script, S1 restore |
| auth / identity / permission | **YES** | S8 — re-activating a login grants access |
| public API / external contract | no | — |
| deploy / container / proxy | no | — |
| secrets / trust boundary | no | — |

- **Files:** ~13 source + 4 test + 4 doc.
- **Risk class:** HIGH, concentrated in S2 (money) and S8 (access). S3–S7c and S9–S11 are
  presentation and copy over data the app already loads.
- **Worst realistic failure:** S2 lands with a mis-recomputed golden expectation, so the suite is
  green against a wrong tax figure. Mitigated by the hand-computation rule and `AC-S2.2`'s negative
  control.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm format:check` (runs FIRST in CI; short-circuits the rest) | Fully-Automated | every AC — a red baseline makes all later gates unprovable |
| `pnpm lint` | Fully-Automated | every AC |
| `pnpm check` (`svelte-kit sync && svelte-check`) — does **not** cover `prisma/**` or `scripts/**` | Fully-Automated | AC-S4.1, AC-S6.*, AC-S7b.* |
| `pnpm test` | Fully-Automated | AC-S2.1, AC-S2.2, AC-S2.5, AC-S7a.1, AC-S8.5, AC-S9.5, AC-S10.1 |
| `tests/unit/statutory-change-summary.test.ts` — 7 cases, first two proven red pre-fix | Fully-Automated | AC-S7a.1, AC-S7a.3 |
| `tests/unit/success-surfaces.test.ts` + its removal/duplication negative controls | Fully-Automated | AC-S10.1–AC-S10.4 |
| `tests/unit/destructive-confirms.test.ts` at `COPY.length === 18` | Fully-Automated | AC-S8.5 |
| derive-equals-published assertion on the 2023 table | Fully-Automated | AC-S2.2 (the D1 proof) |
| `CI=1 pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/separations.spec.ts tests/e2e/timesheet-punch.spec.ts` | Hybrid — needs the dev DB up | AC-S5.4, AC-S9.5 |
| `pnpm tsx scripts/migrate-bir-tax-table-2023.ts` run twice + `psql` read-back | Hybrid — needs `veent-db-5434` | AC-S2.3, AC-S2.4 |
| `psql` restore verification queries (4) | Hybrid — needs `veent-db-5434` | AC-S1.1–AC-S1.4 |
| Live browser pass: config save keeps values + truthful was→now | Agent-Probe | AC-S3.1–AC-S3.3 |
| Live browser pass: per-card feedback placement + measured button↔message distance | Agent-Probe | AC-S4.2–AC-S4.4 |
| Live browser pass: offboard reports once (sample the toast region ≥4s) | Agent-Probe | AC-S5.1, AC-S5.2 |
| Live browser pass: override toasts + `psql` netPay read-back | Agent-Probe | AC-S6.1–AC-S6.4 |
| Live browser pass: 1-change / 3-change / empty proposal states + measured heights | Agent-Probe | AC-S7a.2, AC-S7c.1–AC-S7c.4 |
| Live browser pass: re-activation dialog + cancel leaves `isActive` false | Agent-Probe | AC-S8.1–AC-S8.4 |
| Live browser pass: finalize-card height with/without the refusal bar; settled line emphasis | Agent-Probe | AC-S9.1–AC-S9.4 |
| S3's six-site `update()` audit verdicts | Agent-Probe | AC-S3.4 |
| Phase-06 plan read-back | Agent-Probe | AC-S11.1–AC-S11.4 |

**Known gaps (residual, each with a backlog stub — NOT a terminal PASS):**

| Gap | Why | Backlog stub to write |
|---|---|---|
| No component-interaction harness — no gate proves a dialog opens, traps focus, or that its confirm submits | The repo has none; `destructive-confirms.test.ts:11-18` already states this | already open: `backlog/a11y-component-test-harness_NOTE_03-09-26.md` and `backlog/component-test-dom-environment_NOTE_03-09-26.md` — reference them, do not duplicate |
| No automated proof that a toast is readable before it dismisses | Needs a real browser + timing | `toast-readability-gate_NOTE_11-09-26.md` |
| No e2e covers the statutory proposal lifecycle end-to-end | No fixture exists; 0 PENDING rows in dev | `statutory-proposal-e2e-fixture_NOTE_11-09-26.md` |
| Card-height (S9a) has no automated gate | Layout measurement is browser-only | `separation-card-height-gate_NOTE_11-09-26.md` |

Each of these keeps its behaviour's gate **CONDITIONAL**. None of them is a reason to mark a
section PASS on a Known-Gap alone.

---

## Test Infra Improvement Notes

(none identified yet — populate during EXECUTE/EVL. Expected candidates: a reusable
"sample the polite live region for N ms" probe helper, and a pending-statutory-proposal seed
fixture, both of which are currently hand-rolled per session.)

---

## Risks and Mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | S2's golden churn is "fixed" by pasting vitest's received values → a suite that can no longer fail | Hand-compute every changed expectation from the 2023 table and record the working. `AC-S2.2` plus its negative control. |
| R2 | The migration runs on a customized org and overwrites a deliberate table | Guard on the 2018 rate+floor vectors; report skipped org ids by name. |
| R3 | Removing the statutory page Banner silences the error path too | The error block at `:243-249` is explicitly out of scope for S7b; `AC-S7b.4` asserts it. Precedent: *Removing a banner can silence errors* — grep every form on the page for its helper before deleting a shared surface. |
| R4 | Dropping the now-unused `Banner` import breaks something (`use:enhance` has been silently broken this way before) | Grep for every use of the import before removing it; `pnpm check` after. |
| R5 | Swapping `saveGuard` to `submitFeedback` loses the baseline re-seed, so the leave guard nags forever | `AC-S7b.2`. Pass the existing handler through `inner` and read `submit-feedback.svelte.ts:70-78` first. |
| R6 | S5 removes the toast and the Banner turns out not to be visible after the unmount | `AC-S5.2` asserts the post-offboard page, not the pre-offboard one. This is the exact PR #13 defect shape. |
| R7 | S8 leaves the row with two guards (`ConfirmButton`'s internal one plus `setActiveGuard`) and wedges | `AC-S8.4`. Mirror the deactivate branch exactly. |
| R8 | S10's gate is written to match the code and can never go red | `AC-S10.2` and `AC-S10.3` require BOTH a removal control and a duplication control, with output pasted. |
| R9 | Plan A and plan B both edit `destructive-confirms.test.ts` and conflict | Ownership is assigned: plan A owns the file; plan B has been told. S8 is the only section that touches it. |
| R10 | S7's fixtures cannot be made because the form refuses a no-change submit | Documented fallback in S7c: reach the empty state via a crafted row and say so in the report. |
| R11 | `pnpm check` stops the owner's dev server mid-live-pass | Use `pnpm exec svelte-check --tsconfig ./tsconfig.json` while the server must stay up; run the full `pnpm check` at section end when it can be stopped. |

---

## Rollback

Each section is one commit (S7 is three), so rollback is per-commit `git revert`. Two exceptions:

- **S1 is data, not code.** Roll back from `/tmp/org_seed_before_restore.json`, which S1 writes
  before touching anything.
- **S2's migration is data.** It is idempotent forward but has no reverse script. If it must be
  undone, restore the three orgs' `taxBrackets` from a pre-run `row_to_json` snapshot — **take that
  snapshot as the first step of S2**, the same way S1 does.

No production environment exists for this repo; do not reason about production impact.

---

## Acceptance Criteria (plan level)

- `AC-P1` — Every action listed in S10's table has **exactly one** success surface, proven by a gate
  that has been shown to go red both when a surface is removed and when a second one is added.
- `AC-P2` — `deriveTaxBrackets` applied to the shipped `BIR_MONTHLY_TAX_TABLE` reproduces its own
  `baseTax` column exactly, so a statutory save no longer rewrites the published figures.
- `AC-P3` — A Pag-IBIG-cap-only proposal lists exactly one change line to the approver.
- `AC-P4` — All three dev orgs hold the 2023 table; `org_seed` holds no test residue.
- `AC-P5` — Full gate set green in CI order: `pnpm format:check`, `pnpm lint`, `pnpm check`,
  `pnpm test`.
- `AC-P6` — No file under `src/routes/(app)/attendance/**` or
  `src/lib/server/services/attendance/**` appears in any commit from this plan.
- `AC-P7` — No explanatory comments were added to shipped code (`git diff` grepped for added
  comment lines before each commit).
- `AC-P8` — The phase 05 plan/report/test-script no longer argue against the shipped re-activation
  confirm, and the phase 06 plan owns the bell plus its data gap.

---

## Deliberate Count / Needle Bumps (call out every one)

| Where | From | To | Section |
|---|---|---|---|
| `tests/unit/destructive-confirms.test.ts:219` `expect(COPY.length).toBe(17)` | 17 | **18** | S8 |
| same file, header comment `:185-187` "17 messages across 16 sites" | 17/16 | **18 messages across 16 sites**, site 12 now has two | S8 |
| `COPY` array — new entry `12b re-activate login` | — | added | S8 |
| every absolute `withholdingTax` / `netPay` / `totalDeductions` expectation listed in S2 | 2018 figures | hand-recomputed 2023 figures | S2 |

Nothing else in the suite has a hard count. `G2`'s `sourceFiles().length > 100` is a floor and is
unaffected. S10's new gate introduces its own non-vacuity floor — record its initial value.

---

## Live Browser Passes (owner rule: ONE step at a time)

Sections needing a live pass: **S3, S4, S5, S6, S7 (all three), S8, S9.**

**The rule, applied without exception:** announce the single step, run it, report the result, then
**wait**. Never chain browser actions, especially writes. Every write step names a disposable target
before it runs.

Preconditions: the owner starts the dev server and `veent-db-5434` — **never launch `./start.sh`,
vite or the container yourself; ask.** Driving an already-running app is fine. Logins via
`POST /api/v1/_dev/login-as`. Assert on the DOM node, keep a positive control, and remember
`pnpm check` kills the dev server.

Detector note carried from the findings doc: **a toast is `[role=status][aria-live=polite]`; a page
Banner is `role="status"` with NO `aria-live`** (`Banner.svelte` sets `role` only). Check for both
and screenshot before recording anything as silent — a broken detector produced two wrong findings
in the owner pass.

Destructive steps needing a disposable fixture: S5 (offboard), S8 (deactivate/re-activate), S9
(finalize). Do not use a seeded demo account the owner is watching.

---

## Phase Completion Rules

- A section is `CODE DONE` when its commit lands with the full gate set green.
- A section is `VERIFIED` only when its Agent-Probe rows in Verification Evidence have recorded
  outcomes — commands run, values read back, screenshots where the DOM cannot say it.
- S2 cannot be `VERIFIED` without the hand-computed golden working in the report.
- S10 cannot be `VERIFIED` without both negative controls pasted.
- The plan cannot be archived while any developed behaviour's only gate is a Known-Gap.

---

## Validate Contract

Status: CONDITIONAL
Date: 11-09-26
date: 2026-09-11
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 7-signal score 5/7 (S2 schema/auth surface, S4 phase program, S5 depth requested, S6 high-risk class, S7 5+ files) → HIGH tier, which normally recommends agent-team or workflow. Overridden to sequential because this harness exposes no Agent/Task/TeamCreate tool — the two-layer fan-out was executed in-thread as batched read-only probes (psql, grep, sed, one throwaway vitest run). Fan-out coverage was not reduced; only the execution method changed. Agent count: 1.

### Test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-S1.1–AC-S1.4 | `org_seed` statutory row restored; the two clean orgs untouched | Hybrid | `docker exec -i veent-db-5434 psql -p 5434 -U veent -d veent_hris -tAc "select \"pagibigCap\", \"sssBrackets\"->0->>'eeShare', jsonb_path_query_array(\"taxBrackets\",'$[*].baseTax') from statutory_rate_configs where \"organizationId\"='org_seed';"` + `row_to_json` before/after diff for `org_jojo`/`org_sweetleaf` — precondition: `veent-db-5434` up | A |
| AC-S2.1 | `BIR_MONTHLY_TAX_TABLE` carries the 2023 rates and baseTax | Fully-Automated | `pnpm vitest run tests/unit/ph-statutory.test.ts` exits 0 | B |
| AC-S2.2 | `deriveTaxBrackets` on the shipped table reproduces its own `baseTax` — the D1 proof | Fully-Automated | new case in `tests/unit/ph-statutory.test.ts`: `expect(deriveTaxBrackets(BIR_MONTHLY_TAX_TABLE.map(({floor,rate})=>({floor,rate}))).map(b=>b.baseTax)).toEqual(BIR_MONTHLY_TAX_TABLE.map(b=>b.baseTax))`, plus the 2018 vector as an explicit negative-control case in the same file | B |
| AC-S2.3, AC-S2.4 | Migration is idempotent and lands the 2023 table on all three dev orgs | Hybrid | `pnpm tsx scripts/migrate-bir-tax-table-2023.ts` twice (`3 config row(s)` then `0 config row(s)`) + psql rate/floor/baseTax vector read-back — precondition: `veent-db-5434` up | B |
| AC-S2.5 | The whole unit suite is green against hand-computed 2023 figures | Fully-Automated | `pnpm test` exits 0 AND the phase report carries the hand-derivation for every changed literal | B |
| AC-S3.1–AC-S3.4 | Config save no longer blanks the six bound multiplier inputs | Agent-Probe | Live browser, one step at a time: save multipliers → read the six input values → edit two → save → read the dialog's was→now strings | A |
| AC-S4.1–AC-S4.4 | Each payroll-config card answers for its own action within one viewport | Agent-Probe | Live browser: press each Save, assert the message renders inside that card only, measure button↔message distance with `getBoundingClientRect` at 903px | A |
| AC-S5.1–AC-S5.3 | Offboard reports exactly once, on the surviving page Banner | Agent-Probe | Live browser on a disposable employee: sample `[role=status][aria-live=polite]` for ≥4s from the click (must stay empty), assert the `role="status"` Banner without `aria-live` is present after the card unmounts | A |
| AC-S5.4 | The existing e2e workaround for this double-surface still passes | Hybrid | `CI=1 pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/timesheet-punch.spec.ts` — precondition: dev DB + build/preview | A |
| AC-S6.1–AC-S6.4 | Net-pay override reports once, keeps its per-row double-submit guard | Agent-Probe | Live browser + `psql` read-back of `payroll_entries."netPay"` and an audit-row count after a fast double-click | A |
| AC-S7a.1, AC-S7a.3 | The change summary names only what really changed; the fallback line is reachable | Fully-Automated | new `tests/unit/statutory-change-summary.test.ts`, 7+ cases; the first two proven RED against pre-fix code (negative control pasted into the report) | B |
| AC-S7a.2 | A Pag-IBIG-cap-only proposal lists exactly one line to the approver | Agent-Probe | Live browser: propose as `hr@veent.ph`, read the pending card as `ceo@veent.ph` | A |
| AC-S7b.1–AC-S7b.4 | Four statutory outcomes toast; no green Banner; leave guard and error path survive | Agent-Probe | Live browser: four actions, sample the polite live region each time; then edit→save→navigate (no leave dialog); then a validation failure | A |
| AC-S7c.1–AC-S7c.6 | Three proposal content states render per D7; both confirm needles survive | Agent-Probe + Fully-Automated | Live browser for the three states and the height measurement; `pnpm vitest run tests/unit/destructive-confirms.test.ts` for sites 7 and 8 | A |
| AC-S8.1–AC-S8.4 | Re-activation confirms, and the row keeps exactly one submit guard | Agent-Probe | Live browser on a disposable login: dialog copy, cancel → `psql` shows `isActive` still false, fast double-click → one audit row | A |
| AC-S8.5 | `COPY.length === 18` with all 18 needles green | Fully-Automated | `pnpm vitest run tests/unit/destructive-confirms.test.ts` exits 0 | B |
| AC-S9.1–AC-S9.4 | The finalize card holds one height; the settled fact is emphasised inside its own card | Agent-Probe | Live browser: measure the card with and without `#finalize-bar`, assert the standalone muted block is gone from the DOM, read the amount's computed colour | A |
| AC-S9.5 | Separations e2e unaffected | Hybrid | `CI=1 pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/separations.spec.ts` — precondition: dev DB + build/preview | A |
| AC-S10.1–AC-S10.4 | Exactly one success surface per action per page, proven by a gate that can go red both ways | Fully-Automated | new `tests/unit/success-surfaces.test.ts` + BOTH negative controls (remove one surface → red; add a duplicate → red), outputs pasted in the report | B |
| AC-S11.1–AC-S11.4 | Phase 06 owns the bell and its `actionProposal` vs `statutoryRateProposal` data gap | Agent-Probe | Read-back of the amended phase-06 plan sections + `git show --stat` proving no `src/` file in the commit | A |
| AC-P5 | CI gate set green in CI order | Fully-Automated | `pnpm format:check && pnpm lint && pnpm check && pnpm test` — run in this order; CI runs `format:check` FIRST and short-circuits, so a green `pnpm check` alone proves nothing | A |
| AC-P6 | No attendance file touched | Fully-Automated | `git log --format=%H feat/uiux-phase-5 -- 'src/routes/(app)/attendance/**' 'src/lib/server/services/attendance/**'` shows no commit from this plan | A |
| AC-P7 | No explanatory comments added | Fully-Automated | `git diff --cached -U0 \| grep -E '^\+\s*(//\|/\*\|<!--)'` returns only `// ponytail:` lines, run before each commit | A |

gap-resolution legend: A — proven now; B — gate added by this plan's checklist; C — deferred to a named later phase; D — backlog test-building stub (named residual).

Failing stub (AC-S2.2, the D1 proof):
```
test("should derive baseTax identical to the shipped BIR_MONTHLY_TAX_TABLE", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: derive-equals-published on the 2023 table")
})
test("should NOT derive the published baseTax from the 2018 rate vector (negative control)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: 2018 vector derives [0,0,2500,10833.5,40833.5,200833.5]")
})
```

Failing stub (AC-S7a.1):
```
test("should not report an SSS change when only the key order differs", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: jsonb key order vs derive declaration order")
})
test("should return the no-effective-change fallback when nothing changed", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: reachable fallback at summarizeChanges")
})
```

Failing stub (AC-S10.1/AC-S10.3):
```
test("should fail when a page action has zero success surfaces", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: zero-surface negative control")
})
test("should fail when a page action has two success surfaces", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: duplicate-surface negative control")
})
```

Legacy line form (for existing validate-contract consumers):
- S2 tax engine: Fully-automated: `pnpm test` | Hybrid: `pnpm tsx scripts/migrate-bir-tax-table-2023.ts` + psql read-back
- S1 data restore: Hybrid: four psql verification queries
- S7a change summary: Fully-automated: `pnpm vitest run tests/unit/statutory-change-summary.test.ts`
- S8 confirm copy: Fully-automated: `pnpm vitest run tests/unit/destructive-confirms.test.ts`
- S10 surface gate: Fully-automated: `pnpm vitest run tests/unit/success-surfaces.test.ts` + two negative controls
- S3/S4/S5/S6/S7b/S7c/S9 placement and density: Agent-probe: live browser, one step at a time
- Card height, toast readability, statutory proposal lifecycle, component interaction: known-gap: documented, backlog stubs named in Verification Evidence

### Dimension findings

- Infra fit: PASS — every command in the plan is real and matches the loaded test context (`pnpm format:check`/`lint`/`check`/`test`, `pnpm tsx`, `docker exec -i veent-db-5434 psql -p 5434`, `CI=1 pnpm exec dotenv -e .env.dev -- playwright test`). Live DB state re-verified this session and matches the plan's table byte for byte. No server start, no `.env` edit, no schema change.
- Test coverage: CONCERN — the churn map misses the `#220` derived-parity block and miscounts the file set; see C-1, C-2, C-3.
- Breaking changes: CONCERN — the Public Contracts table covers all six return-shape changes and no external consumer exists, but two change-created orphans are not declared; see C-5.
- Security surface: CONCERN — three high-risk classes are present (money engine, data migration, login re-activation) and the plan has no `harness/` evidence pack; see C-6. The S8 change itself strictly tightens access (adds a confirm), no capability or auth logic moves, and the migration is org-scoped with a verified-correct guard.
- Section S1 (data restore): PASS — mechanical feasibility confirmed against the live DB; `org_seed` holds `pagibigCap 88888.00`, `eeShare 188`/`total 578`, `baseTax [0,0,2500,10833.5,40833.5,200833.5]`; the two other orgs are clean. Zero PENDING proposals confirmed. Highest-risk edit: an `UPDATE` without the `WHERE` — the plan names it.
- Section S2 (D1 tax table): CONCERN — the arithmetic is independently proven (below) and the migration guard is proven correct, but the golden-churn map has a hole; see C-1/C-2/C-3. Highest-risk edit: pasting vitest "received" values; mitigated by the hand-computation rule plus AC-S2.2's negative control.
- Section S3 (F3 reset): PASS — `createSubmitGuard` at `:15`, `await update()` at `:16`, baseline re-seed at `:17` all confirmed; six-site audit list is correctly framed as per-form, not blanket.
- Section S4 (FormFeedback): PASS — shared Banner at `:84-86` with a client-side hard-coded string confirmed; both server returns are bare `{ success: true }` at `:104`/`:154` confirmed; `?/update` uses `saveConfig = createSubmitGuard()` (no toast), so no double surface is created.
- Section S5 (F1 offboard): PASS — fully verified. The Banner at `:1813-1814` is gated on `form?.action === 'offboard' && form?.saved`, the server returns `{ action: 'offboard', saved: 'Employee offboarded.' }` at `:676`, and `offboard` is deliberately absent from the `DONE` map, so `savedNotice` never double-fires. `submitFeedback({ success: null })` suppresses the toast while still calling `update()`, so the Banner still renders — the mechanism is correct.
- Section S6 (F2 override): PASS — `?/override` confirmed to fall off the end at `:143` after `overridePayrollEntry`; `{ action: 'void', saved: 'Period voided.' }` at `payroll/periods/+page.server.ts:121` is a real precedent; `submitFeedback` re-exposes `busy`, so the per-row memoised guard survives the swap.
- Section S7a (F5 key order): CONCERN — root cause fully confirmed, one edge case unhandled; see C-4.
- Section S7b (F6 toasts): PASS — all four `{ success: '…' }` returns confirmed at `:203/:218/:229/:240`; `Banner` is imported at `:4` and used at exactly one place (`:241`), so the orphaned-import risk R4 is real and correctly flagged. `ConfirmButton` does read the server's `saved` string (`ConfirmButton.svelte:50-53`), so Confirm/Reject genuinely need no client change.
- Section S7c (F7 density): PASS — both pinned confirm needles and the `p.changes.join()` interpolation confirmed in place; anchors drift ~2 lines (see C-7).
- Section S8 (F8 re-activate): CONCERN — the test-fear analysis is correct (nothing pins the activate branch as unconfirmed; `COPY.length === 17` confirmed), but two things are missing; see C-5 and C-8.
- Section S9 (F9 height + settled line): PASS — all anchors present with ~2 lines of drift; `separations.spec.ts` confirmed to hold zero assertions on `settled`/`Finalized on`/`Final pay`.
- Section S10 (surface gate): CONCERN — the gate's matching rule does not fit two of the sites its own table requires; see C-9.
- Section S11 (phase-06 handoff): PASS — phase 06 plan is `PLANNED` and unexecuted; S1 at `:128` is the right home.

**Totals: 0 FAILs / 9 CONCERNs / 12 PASSes → Net Gate: CONDITIONAL**

### Independently re-proven in this VALIDATE pass

Ran the repo's real `deriveTaxBrackets` against both vectors:

```
2023 rates [0,.15,.20,.25,.30,.35] → baseTax [0, 0, 1875, 8541.8, 33541.8, 183541.8]   = published BIR
2018 rates [0,.20,.25,.30,.32,.35] → baseTax [0, 0, 2500, 10833.5, 40833.5, 200833.5]  = the live drift
```

Live DB (read-only, 11-09-26) — all three orgs share the 2018 rate vector `[0,0.2,0.25,0.3,0.32,0.35]` and the floor vector `[0,20833,33333,66667,166667,666667]`, while only `org_seed` has drifted `baseTax`. **The plan's rule is therefore correct and load-bearing: guard on rate+floor, never on `baseTax` — a `baseTax` guard would skip `org_seed`, the one row that most needs the fix.** S1-before-S2 is also confirmed necessary: the backup JSON carries the 2018 `taxBrackets`.

Test-file sweep: `withholdingTax` appears **35 times across 16 files** (10 unit + 4 e2e specs + 2 payslip unit). All six e2e occurrences are fixture **inputs** (`withholdingTax: 0`), not assertions on engine output — the plan's open question "check whether any assert an absolute peso figure" is hereby **closed: none do.**

### Concerns (each with what clears it)

| # | Concern | Severity | What clears it |
|---|---|---|---|
| C-1 | **The `#220` derived-parity block is missing from S2's churn map.** `tests/unit/payroll-statutory-config.test.ts:301-316` builds `SEEDED_DERIVED = deriveTaxBrackets(DEFAULT_STATUTORY_RATE_CONFIG.taxBrackets)` and `DERIVED_PARITY = { ...PARITY, '250000': { tax: '66348.06', total: '69948.06', net: '180051.94' } }` — an override that exists **only** because derive ≠ seed today. Its comment names the exact drift D1 removes (`10833.33→10833.5, 40833.33→40833.5, 200833.33→200833.5`). After D1 the override must be **deleted** (not renumbered) and the comment rewritten, and `DERIVED_PARITY` collapses to `PARITY`. That collapse is the best unit-level proof D1 worked; patching the number instead would hide it and leave a comment describing a fixed bug. | CONCERN | Add to S2: delete the `'250000'` override, assert `DERIVED_PARITY` is identical to `PARITY` (or drop the alias entirely), rewrite the `:301-305` comment, and record the collapse in the phase report as the second D1 proof. |
| C-2 | **The file count is wrong and two anchors do not exist.** S2 says "35 `withholdingTax` mentions across 17 test files" — it is **16** files. And `payroll-statutory-config.test.ts:348` / `:360` (cited as the hand-built-table cases) hold no `withholdingTax`; the real mentions there are `:117, :134, :135, :325`, plus the `tax:` literals in the `PARITY` data table at `:43-104`, which S2 never cites by line. The hand-built-table cases are real but live at `:332-364` and are correctly assessed as unaffected (they pass their own table). | CONCERN | Correct the count to 16, repoint the two anchors to `:332-364`, and add `PARITY` (`:43-104`) to the churn map as the primary table-driven surface. |
| C-3 | **`ph-statutory.test.ts:75` is a formula, not a literal.** The assertion is `toBeCloseTo((20 * (25000 - 20833)) / 100, 0)` — the 2018 rate `20` is embedded in the *expression*. S2 describes only the value move `833.40 → 625.05`. An execute-agent looking for a literal will not find one. | CONCERN | State in S2 that the rate inside the expression changes `20 → 15`, which is itself the hand-computation. |
| C-4 | **S7a's comparison spec has no rule for `ceiling: Infinity` / `null`.** The shipped top bracket is `ceiling: Infinity`; JSON/jsonb cannot hold `Infinity` (it serialises to `null`), and `parseRates` uses `nn()` which yields `null` for an empty input. A field-by-field numeric comparison of `ceiling` will compare `Infinity` against `null` whenever `DEFAULT_STATUTORY_RATE_CONFIG` is the `live` side (the no-row branch of `toWireConfig`), producing a false "changed" line — the same class of bug S7a is fixing. The seven listed test cases do not cover it. | CONCERN | Add an explicit normalisation rule (treat `null` and `Infinity` as the same open ceiling) and an eighth test case: an unsaved org whose live config is the default, payload identical → `['No effective change vs the live rates.']`. |
| C-5 | **S8 creates an undeclared orphan.** After both branches route through `ConfirmButton`, the whole per-row guard becomes dead: `setActiveGuards` (`:30`), `setActiveGuard` (`:31`), and the `{@const setActive = setActiveGuard(u.id)}` at `:186` have no remaining reader (`:214/:219/:222` are the branch being replaced). The plan says only "drop the row's own guard for this branch"; it does not say the map and the `{@const}` die with it. `pnpm lint` will flag the unused binding. | CONCERN | Name the three dead bindings in S8 and require their removal in the same commit (surgical rule: this orphan is created by this change). |
| C-6 | **No evidence pack for three high-risk classes.** The Blast Radius table itself marks money/payroll computation, data migration, and permission as present, but nothing in the plan requires the `harness/` artefact set before finalize. | CONCERN | Add a `harness/` folder under the task folder with `risk-gate.json`, `context-snippets.json`, `verification.json`, `review-decision.json` for S2 and S8, written before either section is called done. |
| C-7 | **Line anchors run ~2 lines ahead of the working tree throughout.** Verified drift: statutory pending card opens `:251` (plan says `:253`), per-proposal block `:255` (says `:257`), separations `#finalize-bar` `:209` (says `:211-215`), muted settled block `:227-231` (says `:226-231`), `summarizeChanges` body `:40-64` with `JSON.stringify` at `:53-56`/`:58-61` and the fallback at `:63` (says `:52-56`/`:57-61`/`:62`). Everything named is present; only the numbers slip. | CONCERN | Already mitigated by the plan's own "re-grep every line anchor before editing" instruction — accepted as a known residual, not re-anchored. |
| C-8 | **S8 amends five markdown files but not the source comment that argues against the change.** `src/routes/(app)/settings/roles/+page.svelte:199-201` reads: *"Deactivating locks a person out, so it confirms first; re-activating is neither destructive nor irreversible and deliberately stays one click."* S8 makes that comment false in shipped code. This repo has a standing lesson that a comment describing a reversed decision reads identically to one describing live behaviour. | CONCERN | Add the in-source comment as a sixth S8 amendment: rewrite it (do not delete it) to state that both directions now confirm and that the 11-09-26 owner pass reversed the one-click call. |
| C-9 | **S10's matching rule does not fit two sites its own required table names.** The rule is "a `<FormFeedback>` or `Banner` gated on `form.action === '<action>'`". Verified exceptions: `separations/[id]` finalize/undo are gated on `form?.finalized` (`:82`) and `form?.undone` (`:58`) — the server returns `{ finalized: true }` / `{ undone: true }` with no `action` and no `saved`; and `employees/[id]`'s other 15 actions render through the `DONE[form.action]` map (`:148-169`, banner at `:206-207`), an indirection the literal rule cannot see. `payroll/periods` release/void return `{ action, saved }` with `ConfirmButton` and no banner — those do match. | CONCERN | Widen S10's rule to accept a per-site surface *needle* (the exact gating expression, like `destructive-confirms.test.ts` does for copy) instead of one hard-coded `form.action ===` pattern, and record `separations` and the `DONE`-map sites as explicitly-shaped entries. Do **not** expand scope to re-wire those sites — S9 is height-and-placement only. |

### Open gaps

- Card height (S9a) has no automated gate — known-gap: documented, backlog stub `separation-card-height-gate_NOTE_11-09-26.md`.
- Toast readability before dismissal has no automated gate — known-gap: documented, backlog stub `toast-readability-gate_NOTE_11-09-26.md`.
- Statutory proposal lifecycle has no e2e and no fixture (0 PENDING rows confirmed live) — known-gap: documented, backlog stub `statutory-proposal-e2e-fixture_NOTE_11-09-26.md`.
- No component-interaction harness (dialog opens / traps focus / confirm submits) — known-gap: documented, already tracked at `process/features/ui-ux-overhaul/backlog/a11y-component-test-harness_NOTE_03-09-26.md` and `component-test-dom-environment_NOTE_03-09-26.md` (both verified to exist — reference them, do not duplicate).

### What this coverage does NOT prove

- `pnpm test` green after S2 does **not** prove the new tax expectations are right. It proves the suite agrees with itself. Only the hand-derivation recorded in the phase report, plus AC-S2.2's 2018 negative control, separate a correct table from a self-consistent wrong one. This is the single place in the plan where green means nothing on its own.
- `tests/unit/success-surfaces.test.ts` is a **source scan**. It proves strings co-occur in a file. It does not prove a surface mounts, is inside the viewport, is reachable by a keyboard user, or is read before it dismisses. Both negative controls prove the scan can go red; they do not upgrade it to a render test.
- `tests/unit/destructive-confirms.test.ts` at `COPY.length === 18` proves 18 needles exist in source. It does not prove any dialog opens, that Cancel aborts the POST, or that the message is visible.
- `tests/unit/statutory-change-summary.test.ts` proves the comparison function is key-order-insensitive on synthetic fixtures. It does **not** prove Postgres' actual jsonb round-trip matches those fixtures — no test in the plan reads a real `statutory_rate_configs` row. The live AC-S7a.2 probe is the only thing that closes that loop, and it is agent-judged.
- The migration script's two runs prove idempotency on **three dev org rows**. They prove nothing about an org with a customised table, because none exists to test the skip path against — the skip branch ships unexercised.
- Every Agent-Probe row is one human-driven browser pass on one machine. It proves the behaviour once, at one viewport, in one theme. It is not a regression guard.
- `pnpm check` does not cover `scripts/**` or `prisma/**`, so the migration script is type-checked by nothing but its own run.
- No gate anywhere proves AC-P6 continuously — the attendance-file exclusion is checked once, by hand, at the end.

Gate: CONDITIONAL (0 FAILs; 9 CONCERNs, all with named remedies; developed behaviour exists whose only coverage is a Known-Gap, so a terminal PASS is banned)
Accepted by: session — pending owner confirmation. Concerns carried as accepted-with-remedy: C-1 derived-parity block, C-2 file count and anchors, C-3 embedded rate expression, C-4 Infinity/null ceiling, C-5 orphaned setActive guard, C-6 missing evidence pack, C-7 line-anchor drift, C-8 lying source comment, C-9 S10 matching rule.

### Execute-agent instructions

| # | Instruction | Trigger |
|---|---|---|
| E1 | Re-grep every line anchor immediately before editing. Anchors in this plan run ~2 lines ahead of the working tree, and earlier sections move later sections' anchors. | Every section |
| E2 | S2: after `pnpm test` fails, recompute each expectation by hand from the 2023 table and write the arithmetic into the phase report **before** editing the file. Never paste a vitest "received" value. A reviewer tells the difference by the presence of that written derivation — no derivation, no accepted expectation. | S2 entry |
| E3 | S2: handle `payroll-statutory-config.test.ts:301-316` by **deleting** the `'250000'` override and rewriting its comment, not by patching the number. Record the collapse as the second D1 proof. | S2 entry |
| E4 | S2: run the migration against the dev DB for real and read the row back. `pnpm check` covers neither `scripts/**` nor `prisma/**`. | S2 entry |
| E5 | S7a: normalise `ceiling` — `null` and `Infinity` mean the same open ceiling. Add the default-config test case. | S7a entry |
| E6 | S7b: before removing the `Banner` import, grep every use. It is imported at `:4` and used only at `:241`, so removal is correct here — but confirm it, because a stray import removal has silently broken `use:enhance` in this repo. | S7b step 6 |
| E7 | S8: amend `settings/roles/+page.svelte:199-201` in the same commit. Rewrite the comment, do not delete it. | S8 entry |
| E8 | S8: remove `setActiveGuards`, `setActiveGuard` and the `{@const setActive = …}` at `:186` once both branches use `ConfirmButton` — they become dead in this commit. | S8 entry |
| E9 | S10: use per-site gating needles, not one hard-coded `form.action ===` pattern. `separations/[id]` uses `form?.finalized`/`form?.undone`; `employees/[id]`'s 15 non-offboard actions use the `DONE[form.action]` map. Assert their current shape; do not re-wire them. | S10 entry |
| E10 | Write the `harness/` evidence pack for S2 and S8 before either is reported done. | S2 and S8 exit |
| E11 | Run the gate set in CI order every time: `pnpm format:check` → `pnpm lint` → `pnpm check` → `pnpm test`. CI runs `format:check` first and short-circuits. | Every commit |
| E12 | Before each commit: `git diff --cached -U0 \| grep -E '^\+\s*(//\|/\*\|<!--)'` and confirm only `// ponytail:` lines appear. Stage explicit paths, never `git add -A`. | Every commit |
| E13 | Live passes: ONE step at a time — announce, run, report, wait. Never chain browser writes. Never start the dev server or the container; ask the owner. | S3–S9 |

### Backlog artifacts to create

| Artifact | Location | Tracks |
|---|---|---|
| `toast-readability-gate_NOTE_11-09-26.md` | `process/features/ui-ux-overhaul/backlog/` | No automated proof a toast is readable before it dismisses |
| `statutory-proposal-e2e-fixture_NOTE_11-09-26.md` | same | No e2e or seed fixture for the statutory proposal lifecycle |
| `separation-card-height-gate_NOTE_11-09-26.md` | same | S9a card height has browser-only verification |

---

## Autonomous Goal Block

```
SESSION GOAL
Execute plan A of the phase 05 owner-pass remediation:
process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-05-remediation-A-feedback-statutory_PLAN_11-09-26.md
Eleven sections, eleven commits, in the plan's dependency order: S1 data restore (no commit),
S2 the 2023 BIR tax table, S3 the config reset trap, S4 the shared FormFeedback, S5 offboard,
S6 override, S7a/b/c the statutory page, S8 the re-activation confirm, S9 separations,
S10 the one-success-surface gate, S11 the phase-06 handoff.
Branch feat/uiux-phase-5. Repo /home/hyuse/Desktop/VeentApps/hris.

CONTRACT SUMMARY
Gate: CONDITIONAL. 0 FAILs, 9 CONCERNs (C-1..C-9), each with a named remedy in the
validate-contract's Concerns table and a matching execute-agent instruction E1..E13.
Apply E1..E13 as written — they are the conditions the gate was granted on.

AUTONOMY RULES
- Commit per section as its gates go green. Stage explicit paths. Never `git add -A`.
- Full gate set in CI order every commit: pnpm format:check, pnpm lint, pnpm check, pnpm test.
- No explanatory comments in shipped code. The why goes in the commit message.
- Reversible and cheap: just do it. Report after.
- Blocked on one section: finish the others, name the blocker in one sentence.

HARD STOPS
- Never start ./start.sh, vite, or the veent-db-5434 container. The owner starts servers.
- Never edit .env or .env.dev.
- Never push. Commit freely; push only when the owner says push.
- Never touch src/routes/(app)/attendance/** or src/lib/server/services/attendance/** — plan B owns them.
- Live browser passes: ONE step at a time. Announce, run, report, WAIT. Never chain writes.
- Every destructive live step names a disposable target before it runs.
- Do not start S7 until S2 is green. Do not start S10 until S5-S9 have landed.

NEXT PHASE
EXECUTE, starting at S1 (data restore, no commit). Take the /tmp snapshot first.

EXECUTE START COMMAND
Read the plan file above, then begin S1.
```

---

## Resume and Execution Handoff

1. **Selected plan file path:**
   `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-05-remediation-A-feedback-statutory_PLAN_11-09-26.md`
2. **Last completed phase or step:** VALIDATE complete — validate-contract written (CONDITIONAL). No section started. Branch `feat/uiux-phase-5`,
   which is rebased onto staging and pushed at `47252f9`; the findings doc is committed at `afe28b3`.
3. **Validate-contract status:** CONDITIONAL, written 11-09-26. 0 FAILs, 9 CONCERNs (C-1..C-9) each with a named remedy, carried into execute-agent instructions E1..E13.
4. **Supporting context files loaded:** `process/context/tests/all-tests.md` (runner commands, the
   CI gate order, the e2e spec-filter trap, the "green is not evidence" discipline);
   `phase-05-owner-pass_FINDINGS_11-09-26.md`; `phase-05-destructive-actions_PLAN_/REPORT_03-09-26.md`;
   `phase-06-surface-consolidation_PLAN_03-09-26.md`; live `psql` state of
   `statutory_rate_configs` and `statutory_rate_proposals`.
5. **Next step for a fresh agent:** enter EXECUTE. Apply E1..E13 from the validate-contract as written — they are the conditions the CONDITIONAL gate was granted on. Start at **S1**
   (data restore — no commit), and do not start S7 until S2 is green. Re-grep every line anchor
   before editing: they are from the working tree at `47252f9` plus the uncommitted findings docs,
   and earlier sections in this plan will move later sections' anchors. Confirm plan B has not
   touched `tests/unit/destructive-confirms.test.ts`.

---

## Open Questions

1. **S3 audit** — whether `departments`, `requests` and `settings/backup` actually reproduce the
   blanking cannot be settled from the `update()` call alone; it depends on whether each form's
   bound inputs carry a `value` attribute. Resolved by per-form inspection inside S3, not by a
   decision. No owner input needed.
2. **S8 guard shape** — whether the activate row keeps `setActiveGuard` alongside `ConfirmButton`'s
   internal guard, or drops it for that branch. Decidable from the deactivate branch's behaviour
   during EXECUTE. No owner input needed.
3. **S7c empty-state fixture** — whether the statutory form permits a no-change submit is not
   determinable from the source without running it; the fallback is written into S7c. No owner
   input needed.

**Nothing in this plan is blocked on an owner decision.**

---

**Next:** Say **'ENTER VALIDATE MODE'** to validate this plan before implementation.
