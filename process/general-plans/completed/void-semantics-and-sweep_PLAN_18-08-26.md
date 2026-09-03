---
name: plan:void-semantics-and-sweep
description: "#298 follow-ons D10/D11/D12 — a live probe gating the void-run/void-period divergence fix, the clean 'who approved' sweep recorded as a permanent enumeration, and the payslip PAYDATE before/after sample"
date: 18-08-26
feature: general-plans
---

# D10 / D11 / D12 — void semantics, the approver sweep, and the payslip PAYDATE record

**TL;DR.** Three separate jobs, one plan, one strict order. **(1)** Run a live probe first
(step 1) that proves — or disproves — that voiding a payroll *run* leaves loan and
cash-advance balances reduced. Nothing in D10 may be built until that probe has a recorded
result. **(2)** If it reproduces, give `voidRun` the missing status precondition and the
missing amortization reversal, both reusing `voidPeriod`'s existing code. If it does **not**
reproduce, steps 3–8 are cancelled and only the doc (step 9) survives from D10. **(3)** D11 is
already done as research: the sweep came back **clean**, so the only deliverable is the
written enumeration below — no code. **(4)** D12 is a recorded before/after sample of a
real payslip PDF plus a hand-off note to Finance. No new refusal is added on any path a
user can reach today except the already-voided run, which was never meaningful to void.

**Date**: 18-08-26
**Status**: PLANNED — not validated, not executed, nothing committed
**Complexity**: SIMPLE (one session, 12 numbered steps, one plan file)

Risk class: **money-moving** (step 6 credits balances back) + audit/trust-boundary. The code
is small; the test bar is the highest in this SPEC because a wrong reversal moves real money.

## Overview

Upstream SPEC: `process/general-plans/active/separation-of-duties-298-297_SPEC_17-08-26.md`
(LOCKED 17-08-26, AMENDED 18-08-26). This plan carries **only** SPEC decisions **D10, D11 and
D12** — acceptance criteria **AC-7.1 … AC-7.5**, **AC-8.1 … AC-8.3**, **AC-10.1 … AC-10.3**.

> **Hard boundary — three parallel owners.**
> - `payroll-void-audit-298_PLAN_17-08-26.md` owns D1/D2 — the `PAYROLL_VOID` audit action,
>   `lockedById`/`releasedById`, and removing the `lock()` write of `approvedById`. **This plan
>   must not make those edits.** It depends on them (see Dependencies) and tests around them.
> - `clearance-signoff-297_PLAN_17-08-26.md` owns #297 / `separation.ts`. **Do not read, edit
>   or test `separation.ts` from this plan.**
> - This plan owns `runs.ts`, the `voidPeriod` cash-advance branch of `periods.ts`, one new
>   doc file, and its own tests.

### D9 — deliberately not planned here (placeholder)

**D9 (final pay understated) was DROPPED from the SPEC on 18-08-26, and AC-6.1 – AC-6.5 were
withdrawn with it.** Its premise — that final pay is understated by a large factor — was
**disproved** during research: the finding it rested on did not survive a direct read of the
code. The owner's decision was to drop it outright, not to re-scope it. This is no longer an open
question and no longer a placeholder.

Nothing in this plan touches final-pay arithmetic, `separation.ts`, or AC-6.x, and no gate
anywhere in this file references an AC-6 criterion — that drift check was re-run at repair time
and comes back clean. Do not plan, build, or test D9 from this file, and do not reopen it.

---

## Goals

| # | Goal | SPEC criterion |
|---|---|---|
| G1 | The void-run divergence is **proven or disproven live** before any fix exists | AC-7.1 |
| G2 | Voiding a run no longer leaves loan/cash-advance repayments applied to a dead payroll | AC-7.2 |
| G3 | Voiding an already-voided run is refused, with the reason stated | AC-7.3 |
| G4 | Nobody who can void a run in a real state is newly blocked | AC-7.4 |
| G5 | Run void vs period void is described in exactly one place a reader can find | AC-7.5 |
| G6 | Every "approved by" style writer is enumerated with a verdict, on the record | AC-8.1, AC-8.3 |
| G7 | Any genuinely ambiguous record is fixed the way D2 fixes the payroll period | AC-8.2 |
| G8 | The payslip PAYDATE move is captured as a real rendered sample and told to Finance | AC-10.1, AC-10.2, AC-10.3 |

---

## Dependencies (ordering against the two sibling plans)

| Dependency | Why | What happens if ignored |
|---|---|---|
| **D2 step 8** (`payroll-void-audit-298`) removes `approvedById: ctx.actorId` from `lock()` | AC-10.1's "after" sample only exists once that write is gone | The PAYDATE before/after sample would show no difference and prove nothing |
| **D1 step 9–11** adds `voidedOwnApproval` + `action: 'PAYROLL_VOID'` to `voidRun` | This plan edits the **same function body** in `runs.ts` | Two agents editing `voidRun` concurrently will conflict |
| **D11's verdict** (below) is what D2 step 8 implements | The sweep found exactly one ambiguous field and D2 already fixes it | Somebody "fixes" `JobPosting.approvedById`, which is a different model and correct |

**Sequencing rule.** Three hard constraints, not one:

1. **Step 1 (the live probe) runs first and independently.** It needs no sibling plan and it gates
   steps 3–8 completely.
2. **Steps 5–8 (`runs.ts` edits) land AFTER `payroll-void-audit-298` steps 9–11**, or in the same
   worktree — never in parallel. Two agents in one function body will collide.
3. **Steps 10–12 are NOT unordered.** Correcting an earlier claim in this plan:
   - **Step 12a is a PHASE 0 action.** The "before" `PAYDATE:` sample can only be captured on a
     tree where `lock()` still writes `approvedById` — i.e. **before** `payroll-void-audit-298`
     step 8 lands. Once that ships the sample is **unrecoverable**; there is no way to re-create
     it short of reverting. 12a is therefore the second-most time-critical action in the whole
     programme, after step 1.
   - **Step 12a is the SAME capture as `payroll-void-audit-298`'s L7-before.** Do it **once**, on
     one period, and cite the one result from both plans. Do not run it twice.
   - **Steps 12b / 12c run AFTER** that same step 8 — they are the "after" half.
   - **Step 11's fence is only true after** that same step 8. Run earlier it goes red for the
     right reason but against the wrong plan's code.
   - Step 10 (the greps) genuinely has no ordering constraint.

---

## Verified facts EXECUTE may rely on (each read from the code 18-08-26)

| Fact | Location |
|---|---|
| `voidRun` writes exactly **one** column — `payroll_runs.status` — plus one audit row. No `$transaction`. No period write, no loan write, no cash-advance write, no `LoanPayment` write. | `src/lib/server/services/payroll/runs.ts:92-112` |
| `voidRun` has **no status precondition**. Only a 404 if the run is missing. DRAFT, COMPUTED, APPROVED and already-VOIDED all void alike, writing `VOIDED` again plus a fresh audit row. | `runs.ts:95-101` |
| `voidPeriod` reverses balances, gated on `wasLocked` | `periods.ts:304-374`, gate at `:312` (`LOCKED` or `RELEASED` only) |
| `voidPeriod` refuses an already-voided period | `periods.ts:310` |
| Amortization is applied at **LOCK only** | `periods.ts:138-266` — loans `:214-217`, cash advances `:232-235`, `LoanPayment` rows `:201-203` |
| Both voids require `OVERRIDE_FINALIZED` | `runs.ts:93`, `periods.ts:307` |
| `OVERRIDE_FINALIZED` is held by `SUPER_ADMIN` only | `src/lib/rbac.ts:73` |
| **A run void has NO UI button.** Its only caller is the v1 API. | `src/routes/api/v1/payroll/[id]/+server.ts:66-79` — `POST /api/v1/payroll/[id]?action=void`. `grep -rn voidRun src/` returns the service, that route, and one comment. Nothing else. |
| The run detail page exports only `override`, `compute`, `decide` — no `void` action | `src/routes/(app)/payroll/[id]/+page.server.ts` |
| `PayrollPeriod` has `lockedAt` / `releasedAt` and **no actor column at all** | `prisma/schema.prisma:1613-1614` |
| Every `@map` in the schema is table-level `@@map`; there are **zero** field-level `@map`s | `prisma/schema.prisma` — so table names are snake_case, column names are camelCase and must be double-quoted in psql |
| `tests/e2e/payroll-lock-idempotency.spec.ts` seeds a **live** loan against a real period with a real `PrismaClient` and drives the real lock route | that file, `seed()` at the top, `TAG = 'e2e-lock-102'` |
| `tests/unit/override-finalized-guard.test.ts` runs `voidRun` **real** against a mocked db | that file, `:65` imports the real module; `:131-153` call it |

### The consequence the SPEC does not carry: a run void is API-only

AC-7.1 says "void a run on a locked period". There is **no button for that anywhere in the
product.** The live reproduction is a `curl` call with a session cookie, not a click. The
manual-test script in step 1 is written that way. This also bounds the blast radius of AC-7.3:
adding a status precondition to `voidRun` can break no UI, because no UI reaches it.

### The bug inside the fix site — `voidPeriod` is not a true inverse for cash advances

Read `periods.ts:229` against `periods.ts:352-360`:

- **Lock** applies `min(d.amount, liveBalance)` and records nothing about what it applied
  (cash advances have no payment ledger — the code says so at `:224-226`).
- **Void** credits back the raw frozen `d.amount` (`:356`), because there is no ledger to
  consult, and forces `status: 'ACTIVE'` **unconditionally**.
- The **loan** branch is a true inverse: it reads the actual `loan_payments` rows (`:333-337`),
  reverses exactly that sum, sets `ACTIVE` only when the restored balance is `> 0` (`:345`),
  then deletes the payment rows (`:348-350`).

So when lock capped a cash-advance payment — the borrower had less outstanding than the
installment — **void over-credits the difference**, and it can resurrect a `PAID` advance that
some other payment settled.

**Decision for this plan: fence it off, do not fix it — but say plainly that this plan makes the
defect WORSE.** Reasons and the honest cost, on the record:

1. It is **not D10**. D10 is "a run void and a period void do different things". This is "the
   period void's cash-advance arm is wrong", which is true today with or without D10.
2. Fixing it needs a **new payment ledger for cash advances** (the loan branch only works
   because `LoanPayment` exists). That is a schema addition with a backfill question, which is
   a decision the owner has not been asked.
3. **This plan widens the defect's reach, and an earlier draft of this section was wrong to claim
   otherwise.** Step 8 calls the existing reversal rather than rewriting it, so the *arithmetic* is
   untouched — but the *reachability* is not:
   - **Today** the over-credit fires only through `voidPeriod`, which in the same transaction flips
     the period to `VOIDED` (`periods.ts:364`). An over-credited or resurrected advance therefore
     sits against a payroll that is **visibly dead**, and any reader who finds it can see why.
   - **After this plan** it fires through `voidRun`, which **deliberately leaves the period
     `LOCKED`** (Design Note, step 8's note, and the out-of-scope table all require this). So an
     over-credited cash advance — and a `PAID` advance resurrected to `ACTIVE` — will sit against a
     period that still **looks live**. That is a new failure mode, not the same one twice.
   - **`voidRun` moves zero money today.** After this plan it moves money on a path that never did.
   So: this plan converts a dormant defect into a live one. It is fenced, measured (**L7** and
   **M10**), commented in the code (step 3), documented for readers (step 9), and reported to the
   owner — but it is not neutral, and nothing here should be read as claiming it is.

**Recorded as a follow-up for the owner, not built, and no GitHub issue filed** (SPEC constraint
11 — the 18-08-26 approval covered #304–#308 only and does not carry). Step 6's doc comment must
name it so the next reader of that code finds it.

---

## Touchpoints

| File | Change |
|---|---|
| `src/lib/server/services/payroll/runs.ts` | `voidRun` gains a status precondition and calls the extracted reversal |
| `src/lib/server/services/payroll/periods.ts` | **extract only** — the amortization-reversal block, **`:316-361` (the body of `if (run && wasLocked)`)**, moves to a shared function; behaviour unchanged, cash-advance bug preserved verbatim and commented. The status flips at `:363-364` **do not move** |
| `src/lib/server/services/payroll/amortization.ts` | **NEW** — `reverseAmortization(tx, runId)`, the block lifted out of `voidPeriod` |
| `docs/payroll-void-semantics.md` | **NEW** — AC-7.5, the one place both voids are described |
| `tests/unit/void-run-semantics.test.ts` | **NEW** — AC-7.3, AC-7.4, and the "reversal WAS called" assertion |
| `tests/e2e/payroll-void-run-amortization.spec.ts` | **NEW** — AC-7.2, cloned from `payroll-lock-idempotency.spec.ts` |
| `tests/unit/override-finalized-guard.test.ts` | **EDITED — scaffolding only.** One itemised change: add `$transaction` to `dbMock`. Every existing assertion is preserved verbatim. See "The one permitted edit to the guard test" below |
| `process/general-plans/active/void-semantics-and-sweep_PLAN_18-08-26.md` | this file — the D11 enumeration below **is** the AC-8.1/AC-8.3 deliverable |

Read-only (do not edit): `separation.ts`, `approvals.ts`, `payroll/index.ts`,
`recruitment.ts`, `src/lib/server/services/payroll/payslip-document.ts`,
`src/lib/server/services/payroll/payslip-pdf.ts`, `prisma/schema.prisma`,
`tests/e2e/payroll-lock-idempotency.spec.ts`.

### The one permitted edit to the guard test (this replaces the old "zero edits" promise)

`tests/unit/override-finalized-guard.test.ts` imports the **real** `voidRun` (`:65`) and drives it
against a hand-built `dbMock`. Read at repair time, that mock is
`{ payrollRun: { findFirst, update }, employee: {...}, payrollPeriod: { findFirst }, attendanceDay: {...} }`
— there is **no `$transaction` key anywhere in the file** — and its `beforeEach` sets
`payrollRun.findFirst.mockResolvedValue({ id: 'x1', status: 'APPROVED' })`, with **no `period`
property**. Step 8 introduces `db.$transaction(...)` into `voidRun`, which on that mock calls
`undefined`; three tests that get past the guard ("still allows the Super Admin", "admits an actor
holding SUPER_ADMIN as a secondary role, and voids (#256)", "still allows a single-role Super Admin
through the v1 API twin") would throw. **"Green with zero edits" was therefore impossible and has
been withdrawn from this plan.**

**Chosen resolution: option (a) — extend the mock in place, as a single declared, itemised edit,
with every existing assertion preserved verbatim.** The alternative (move AC-7.4's proof to a new
file and demote this one) was rejected because this file's whole value is that it runs the *real*
`voidRun` through the *real* v1 API twin with multi-role actors (#256) — a proof no new
mock-and-spy file reproduces. Re-proving AC-7.4 somewhere thinner would weaken the exact guard
#256 was written to hold, to protect a "zero edits" slogan rather than a behaviour. Extending a
mock so it can host a function that grew a transaction is scaffolding, not a weakening of the
assertions, and the diff makes that checkable.

**The permitted edit, in full — nothing else in this file may change:**

| # | Edit | Rationale |
|---|---|---|
| E1 | Add one key to `dbMock`: `$transaction: async (fn: any) => fn(dbMock)` | Lets the real `voidRun` run its new transaction against the same mock object. Passing `dbMock` itself as `tx` is deliberate: the mock's `payrollRun.update` is what the existing `expect(dbMock.payrollRun.update).toHaveBeenCalled()` assertion reads |

**Not required, and therefore not permitted:** adding a `period` to the `findFirst` mock. Step 7
uses `run.period?.status` (see F3 below), so an absent period resolves to `undefined`, `wasLocked`
is `false`, and no reversal is attempted — which is the correct behaviour for a period-less run and
is exactly what this file should exercise by default.

**How AC-7.4 is proven now** (the replacement for the withdrawn "zero edits" gate): after E1, every
existing `403` / admit / `update`-was-called assertion in that file **passes unchanged**, and
`git diff tests/unit/override-finalized-guard.test.ts` shows **only** the E1 line added. The gate is
"the assertions are untouched and green, and the diff proves it", not "the file is untouched".

## Public Contracts

- **`voidRun` gains one refusal**: `error(400, …)` when the run is already `VOIDED`. Its only
  caller is `POST /api/v1/payroll/[id]?action=void`, whose catch block already maps `400` to
  `apiError` (`+server.ts:59-61` does exactly this for the approve branch — **confirm the void
  branch does too before step 5; today it has no try/catch at all**, so an un-caught `error(400)`
  would surface as a raw SvelteKit error). Step 5 covers this.
- **`voidRun` becomes money-moving.** Callers that previously assumed a status-only flip now
  cause loan and cash-advance balances to change. The only caller is the API route.
- **`voidRun`'s return value is unchanged** — the updated run.
- **No capability check changes.** `OVERRIDE_FINALIZED` at `runs.ts:93` and `periods.ts:307`
  are untouched. No new mechanism.
- **`voidPeriod`'s observable behaviour is unchanged** — step 3 is a pure extraction.
- **No schema change.** Nothing in this plan touches `prisma/schema.prisma`.

## Blast Radius

- **8 files**: 3 edited source/route (`runs.ts`, `periods.ts`, `api/v1/payroll/[id]/+server.ts`),
  2 new (`amortization.ts`, `docs/payroll-void-semantics.md`), 2 new tests, and **1 edited test**
  (`tests/unit/override-finalized-guard.test.ts`, scaffolding edit E1 only). Plus this plan file.
- **Risk class: money-moving + audit/trust-boundary.** No schema, no auth, no migration.
- **Auth surface: untouched.** The two mechanisms #282 left standing are not modified,
  extended or bypassed.
- Rollback: revert the commits. No data is destroyed at any point, but note that **any run
  voided between deploy and revert will have had its balances credited back** — that is the
  intended effect and is not undone by a code revert. Say so in the commit message.

---

## Design Notes (decided — EXECUTE does not re-derive these)

**1. Extract, do not re-implement.** The reversal in `voidPeriod` is subtle (it reverses what
was *actually applied* via `loan_payments`, not the frozen deduction line — see the comment at
`periods.ts:328-331`). Writing a second copy for `voidRun` would drift. Step 3 lifts it into
`amortization.ts` and both call it. Behaviour must be byte-identical after the extraction; the
existing e2e lock-idempotency spec is the proof (step 3's gate).

**2. `reverseAmortization` takes the transaction client.** Signature:
`reverseAmortization(tx: Prisma.TransactionClient, runId: string): Promise<void>`. It must not
open its own transaction — the caller owns the transaction boundary, exactly as the block does
inside `voidPeriod` today.

**3. `voidRun` must gain a `$transaction`.** It has none today. The status flip and the reversal
must commit or fail together, or a crash mid-reversal leaves a `VOIDED` run with half its
balances credited back. Wrap the `payrollRun.update` and the `reverseAmortization` call in one
`db.$transaction`, matching `voidPeriod`'s shape.

**4. The reversal is conditional on the period, not the run — and the period is OPTIONAL.**
Amortization is applied at **lock**, which is a period operation. So `voidRun` reverses only when
the run's period is `LOCKED` or `RELEASED` — the same `wasLocked` test as `periods.ts:312`. A run
on a `GENERATED` period never had amortization applied and must not be credited. `voidRun`'s
current `findFirst` does **not** include the period; step 7 adds `include: { period: true }`.

**A run may have no period at all.** `prisma/schema.prisma:1082` declares `periodId String?` and
`:1097` declares `period PayrollPeriod? @relation(...)`. This is not theoretical: read live at
repair time, the dev database holds **two** payroll runs and **both** have a NULL `periodId`. So
`run.period.status` is both a `pnpm check` type error and a runtime crash on real rows.

**Defined behaviour for a period-less run:** amortization is only ever applied at a period lock, so
a run with no period **cannot have any amortization to reverse**. It voids normally — status flips
to `VOIDED`, audit row written — and **no reversal is attempted**. Access must be null-safe:
`run.period?.status`, so an absent period yields `undefined`, `wasLocked` is `false`, and the
reversal is skipped. Do **not** add a refusal for a period-less run: that would newly block a void
that works today and fail AC-7.4.

**5. The status precondition is `VOIDED`-only.** AC-7.4 says nobody is newly blocked from
voiding a run in a valid state. DRAFT and COMPUTED voids may be pointless but they are not
harmful and somebody may rely on them. **Refuse only an already-`VOIDED` run** — the one state
that was never meaningful to void, and the one `voidPeriod` already refuses (`periods.ts:310`).
Do not add a DRAFT or APPROVED refusal; that would fail AC-7.4.

**6. AC-7.5 is a doc file, not a code comment.** "One place a reader can see what each does and
does not reverse" means a reader who is not already in the file. `docs/payroll-void-semantics.md`
is that place; both service functions get a one-line comment pointing at it.

**7. D11 requires no code.** See the enumeration. The sweep is clean; the one ambiguous field
is already D2's. AC-8.2's deliverable in this plan is a **regression fence**, not a fix.

---

## Implementation Checklist

Order is load-bearing. **Step 1 gates steps 3–8 completely** — step 9, the doc, runs either way.
Step 3 must be green before step 8 uses it. **Steps 10–12 are NOT free-floating:** step 10 is the
only one with no constraint; **step 12a must run in PHASE 0, before `payroll-void-audit-298` step 8
removes the `lock()` approver write** (its window closes permanently after that, and it is the same
capture as that plan's L7-before — do it once); steps 12b/12c and step 11 must run **after** that
same step 8. See the corrected Sequencing rule above.

### Phase A — the gate (steps 1–2)

**1. Run the live probe. AC-7.1. Nothing else in D10 may start until this has a recorded
result.**

The user starts the dev server; **the agent never starts it, and never starts the database.**
Then, from a clean tree with no code changes:

```bash
# 1a. session cookie for the Super Admin (the only holder of OVERRIDE_FINALIZED)
curl -s -c /tmp/void-probe.txt -X POST http://localhost:5173/api/v1/_dev/login-as \
  -H 'content-type: application/json' -d '{"email":"SUPERADMIN_EMAIL_HERE"}'
```

Then, in the browser as that user, build the marker state — **name it `ZZ-D10-PROBE`** so every
row is findable:

1. Give an employee an ACTIVE loan with a balance well above one installment.
2. Open a period named **`ZZ-D10-PROBE`**, import attendance, generate.
3. Note the run id from the URL. Note the loan id.

**Before lock** — record the baseline:

```bash
docker exec veent-db-5434 psql -U veent -d veent_hris -p 5434 -tAc \
"select p.id, p.name, p.status, r.id, r.status
   from payroll_periods p join payroll_runs r on r.\"periodId\" = p.id
  where p.name = 'ZZ-D10-PROBE';"

docker exec veent-db-5434 psql -U veent -d veent_hris -p 5434 -tAc \
"select id, balance, status from loans where id = 'LOAN_ID_HERE';"

docker exec veent-db-5434 psql -U veent -d veent_hris -p 5434 -tAc \
"select count(*) from loan_payments where \"loanId\" = 'LOAN_ID_HERE';"
```

Expect: period `GENERATED`, run `COMPUTED`, loan balance = the full principal, **0** payment rows.

**Lock the period** in the browser. Re-run all three queries.
Expect: period `LOCKED`, loan balance **reduced by the installment**, **1** payment row.
*If the balance did not move, the probe is invalid — the deduction was not generated. Fix the
seed and start again; do not record a result from a run where lock did nothing.*

**Void the RUN — via curl, there is no button:**

```bash
curl -s -b /tmp/void-probe.txt -X POST \
  'http://localhost:5173/api/v1/payroll/RUN_ID_HERE?action=void'
```

Expect HTTP 200 and the run back with `status: "VOIDED"`. Re-run all three queries.

**The recorded result of AC-7.1 is these three numbers after the void:**

| Query | Reproduces (the SPEC's claim) | Does NOT reproduce |
|---|---|---|
| `payroll_runs.status` | `VOIDED` | `VOIDED` either way — this is not the signal |
| `payroll_periods.status` | still **`LOCKED`** | anything else |
| `loans.balance` | still **reduced** | back at the full principal |
| `count(loan_payments)` | still **1** | 0 |

Then, as the **negative control on the same data**, void the **period** through the UI on a
fresh `ZZ-D10-PROBE-2` cycle and confirm the balance **does** return and the payment row **is**
deleted. Without this control, "the balance stayed reduced" could equally mean the reversal is
broken everywhere.

**Cleanup:** delete both probe periods, their runs, entries, deductions, payment rows and the
seeded loan — or state explicitly in the report that they were left and why.

**2. Record the result and branch.**

Write the four post-void numbers, the negative control, and a one-line verdict into the EXECUTE
report **before writing any code**.

- **Reproduces** → continue to step 3.
- **Does not reproduce** → **the D10 code drops out entirely. Steps 3–8 are cancelled — 3 to 8, not
  3 to 9.** Step 9 (the doc, AC-7.5) **still runs**, and must then describe the behaviour as the
  probe actually found it. Nothing downstream depends on steps 3–8: step 10's greps are
  independent, step 11's fence depends on `payroll-void-audit-298` step 8 rather than on anything
  here, and step 12 is independent. Record the disproof with the exact queries and numbers, mark
  AC-7.2/7.3/7.4 as `NOT APPLICABLE — premise disproved live`, then go to step 9. Do not build a
  fix for a defect that did not reproduce — SPEC constraint 12.

**If step 1 disproves, these are cancelled with steps 3–8** and must not be attempted against code
that was never written: Verification Evidence rows `void-run-reverses-amortization`,
`void-run-skips-reversal-on-unlocked-period`, `void-run-status-precondition`,
`void-run-allows-draft-and-approved`, `void-run-no-period`, `void-run-reverses-cash-advance`,
`void-period-unchanged-after-extract`; mutation rows **M1–M6** and **M10**; live rows **L2–L5** and
**L7**. Rows tied to D11 and D12 (`lock-writes-no-approver`, the enumeration, all PAYDATE rows,
M7–M9, L1, L6) are unaffected and still run.

### Phase B — extract the reversal (steps 3–4)

**3. Lift the reversal out of `voidPeriod`.** New file
`src/lib/server/services/payroll/amortization.ts`:

- Export exactly this signature:
  `export async function reverseAmortization(tx: Prisma.TransactionClient, runId: string): Promise<void>`.
  The `tx` parameter is the **caller's** transaction client — the function **must not open a
  transaction of its own** (Design Note 2). `runId` replaces the closed-over `run.id` the block
  reads today; every `payrollRunId: run.id` becomes `payrollRunId: runId`. Nothing else changes.
- **The exact span to lift is `periods.ts:316-361` — the BODY of the `if (run && wasLocked) {`
  block, and nothing else.** Read at repair time, that region is:

  | Line | Content | Moves? |
  |---|---|---|
  | `:314` | `await db.$transaction(async (tx: Prisma.TransactionClient) => {` | **NO** — the transaction opener. The caller owns it |
  | `:315` | `if (run && wasLocked) {` | **NO** — the caller keeps the condition |
  | `:316` | `// Reverse the amortization committed at lock.` | yes |
  | `:317-320` | `const entries = await tx.payrollEntry.findMany({ ... include: { deductions: true } })` | yes |
  | `:321-361` | the `for (const entry of entries)` loop — the LOAN arm and the CASH_ADVANCE arm — up to and including its closing brace | yes |
  | `:362` | `}` closing `if (run && wasLocked)` | **NO** |
  | `:363` | `if (run) await tx.payrollRun.update({ ... status: 'VOIDED' })` | **NO — the RUN status flip** |
  | `:364` | `await tx.payrollPeriod.update({ ... status: 'VOIDED' })` | **NO — the PERIOD status flip** |
  | `:365` | `})` closing the transaction | **NO** |

- **`reverseAmortization` does NOT flip any status — the caller owns that.** It contains the
  `findMany` and the loop only. An earlier draft of this plan gave the span as `314-370`, which is
  not brace-balanced and, read literally, sweeps `:363` and `:364` into the extracted function.
  That would make `voidRun` **void the period**, contradicting this plan's Design Note, its step-9
  documentation spec, and its "Making a run void also unlock or void the period" out-of-scope row.
  The span above is the corrected one; do not widen it.
- Move the loop **verbatim**. Do not change the loan branch. Do not change the cash-advance branch.
  Do not "tidy" the decimal handling.
- Move the existing comments with it (the `#119` decimal note and the "reverse what was actually
  applied" note). They explain non-obvious code and must not be lost in the move.
- **Add one new doc comment** naming the known bug, in the shape of this repo's landmine
  comments: the cash-advance arm credits back the frozen `d.amount` while lock applied
  `min(d.amount, liveBalance)` and forced `status: 'ACTIVE'` unconditionally, so a capped payment
  over-credits and a separately-settled advance can be resurrected. State that the loan arm is a
  true inverse because `loan_payments` exists and the cash advance has no ledger; that fixing it
  needs a cash-advance payment ledger; and that it is **pre-existing, out of scope for #298, and
  recorded for the owner**.

**4. Point `voidPeriod` at it.** `periods.ts` — replace the lifted block with
`await reverseAmortization(tx, run.id)` inside the existing `if (run && wasLocked)`. The
`$transaction`, the guard at `:307`, the already-voided refusal at `:310`, the `wasLocked`
computation and the two `tx.…update` calls that follow all stay exactly where they are.

**Gate before step 5 — three parts:**

1. `grep -n "payrollPeriod.update\|payrollRun.update" src/lib/server/services/payroll/amortization.ts`
   returns **nothing**. The extracted function writes no status of any kind. This is the direct
   proof that F2's error was not re-introduced, and it is cheap enough to run every time.
2. `periods.ts:363-364` (the two status flips) are still present, unmoved, inside `voidPeriod`'s
   `$transaction`.
3. `pnpm test` green **and** `pnpm test:e2e -- payroll-lock-idempotency`
run once. That spec exercises the real lock→void balance cycle and is the only thing that proves
the extraction changed no behaviour. If e2e is too flaky to land (#287), record that and re-run
the step-1 probe queries instead as a manual substitute — but do not skip the check entirely.

### Phase C — fix `voidRun` (steps 5–8)

**5. Give the void route a try/catch.** `src/routes/api/v1/payroll/[id]/+server.ts:66-79`. The
approve branch above it already wraps its service call and maps `400/403/404` to `apiError`
(`:57-63`). The void branch does not. Add the same wrapper, with the message
`'Cannot void this run'`. Do this **before** step 7 introduces the `400`, so the refusal never
exists without a handler.

**6. Add the status precondition.** `runs.ts`, immediately after the 404:

```ts
if (run.status === 'VOIDED') error(400, 'Payroll run is already voided')
```

Only `VOIDED`. See Design Note 5. Add a one-line comment saying DRAFT and APPROVED voids stay
allowed deliberately, because SPEC AC-7.4 forbids blocking anybody who can act today.

**7. Fetch the period — null-safely.** `runs.ts:95` — change the `findFirst` to
`{ where: { id, organizationId }, include: { period: true } }`, then:

```ts
// `period` is optional on PayrollRun (schema: `periodId String?`, `period PayrollPeriod?`), and
// period-less runs exist in real data. Amortization is only ever applied at a period lock, so a
// run with no period has nothing to reverse: `wasLocked` is false and the reversal is skipped.
// The void itself still succeeds — refusing it would newly block a caller (AC-7.4).
const wasLocked = run.period?.status === 'LOCKED' || run.period?.status === 'RELEASED'
```

Use the optional chain — `run.period.status` does **not** typecheck under `pnpm check` and throws
at runtime on a period-less run. Use the same two statuses as `periods.ts:312` — not a different
list. Do not add a refusal or an early return for a missing period.

**8. Reverse, transactionally.** Replace the bare `db.payrollRun.update` with:

```ts
const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
  if (wasLocked) await reverseAmortization(tx, id)
  return tx.payrollRun.update({ where: { id }, data: { status: 'VOIDED' } })
})
```

**This step is why `tests/unit/override-finalized-guard.test.ts` needs edit E1** (see Touchpoints):
that file runs `voidRun` real against a mock with no `$transaction` key. Apply E1 in the same
commit as this step, or three tests in that file throw.

Leave the `writeAuditLog` call **outside** the transaction, where it is today — `voidPeriod`
does the same and moving it is a behaviour change. Do not touch the `action:`/`newValue:` of
that call: `payroll-void-audit-298` owns it and will have already set `PAYROLL_VOID` and the
same-actor marker.

**Note the period is deliberately left alone.** A run void still does not unlock the period.
Making it do so is a bigger, undecided behaviour change and is out of scope below.

### Phase D — the documentation (step 9)

**9. Write `docs/payroll-void-semantics.md`.** AC-7.5. Short, table-first, ~40 lines. It must
state, for a reader who has never opened these files:

- **What a run void does**: refuses an already-voided run; reverses loan and cash-advance
  amortization *when the period was locked or released*; flips the run to `VOIDED`; leaves the
  **period status untouched**; is reachable **only** via `POST /api/v1/payroll/[id]?action=void`,
  with no UI button.
- **What a period void does**: refuses an already-voided period; reverses the same amortization
  on the same condition; flips **both** the run and the period to `VOIDED`.
- **What neither does**: no backfill, no un-void, no notification, no re-generation of payslips.
- **The single remaining difference**: the period status. Say plainly that voiding a run leaves
  the period `LOCKED`, so the period must be voided separately if the intent was to reopen it.
- **The known cash-advance over-credit — stated under the RUN-VOID section itself, not only as a
  shared footnote.** A reader who only reads "what a run void does" must be told that voiding a run
  can over-credit a capped cash-advance payment and can flip a `PAID` advance back to `ACTIVE`,
  **against a period that stays `LOCKED` and therefore still looks live**. Cross-reference the
  comment in `amortization.ts`. Repeat it under the period-void section too.
- The `OVERRIDE_FINALIZED` requirement and that `SUPER_ADMIN` is its only holder today.

Add a one-line pointer comment to this file above both `voidRun` and `voidPeriod`.

### Phase E — D11, the sweep (steps 10–11)

**10. The enumeration below IS the deliverable for AC-8.1 and AC-8.3.** It is already written.
EXECUTE's only job is to **re-run the greps and confirm it still holds** before the report is
written, because the two sibling plans are editing the same area concurrently:

```bash
grep -nE "(approved|reviewed|verified|processed|confirmed|decided|cleared|finalized|changed|completed|awarded|uploaded|submitted|posted|proposed)By(Id)? +String" prisma/schema.prisma
grep -rn "approvedById:" src/ scripts/
```

**The first grep cannot confirm the table, and the plan must stop pretending it can.** Run at
repair time, that pattern returns **18** sites — not 22 and not 23. Four rows of the enumeration —
`ActionProposal.initiatorId`, `ApprovalStep.actorId`, `PostingApprover.approverId`,
`AuditLog.actorId` — do not end in `...ById` and so can never match it. A check that structurally
cannot fail is not a check, and the old instruction ("if either grep returns a site not in the
table, the sweep is not clean") was a **guaranteed pass**. It is replaced by the two checks below.

**Check A — the one that can actually fail (this is the real gate).** The second grep must return
**exactly four** writers of `approvedById`, and exactly these four:

```
src/lib/server/services/payroll/approvals.ts:673
src/lib/server/services/recruitment.ts:174
src/lib/server/services/payroll/index.ts:508
src/lib/server/services/payroll/periods.ts:252     # removed by payroll-void-audit-298 step 8
```

This **can** fail: a fifth writer, or a different file, means a new ambiguity the enumeration does
not carry — record it and stop for the owner. Run after `payroll-void-audit-298` step 8 the
`periods.ts:252` line must be **gone**, leaving three; that absence is itself the confirmation that
D2's fix landed. Verified at repair time: the grep returns those four and nothing else, which is
what independently confirms the row-11 verdict.

**Check B — the count, recorded as a KNOWN GAP, in plain words.** The enumeration claims 22 fields;
the research sweep said 23; this plan's own grep returns 18. **The count is unsettled and this
plan's tooling cannot settle it** — the pattern misses every actor field that does not end in
`...ById`, and no realistic pattern catches all of them without also catching unrelated columns.
Write exactly that in the report: *"the field COUNT is approximate — 22 enumerated, 23 reported by
research, 18 matched by the grep; the discrepancy is bookkeeping, not a missing site, and the
tooling cannot close it."* Do **not** report the count as clean and do not report it as a finding.

**What IS settled, and is the actual AC-8.1/AC-8.3 deliverable:** the **verdict** — exactly one
ambiguous actor field, `PayrollRun.approvedById`, fixed by D2 step 8. That verdict is independently
confirmed by Check A and does not depend on the count at all. Copy the table into the report
verbatim, state the verdict as the result, and attach the count gap beside it.

**11. Build the AC-8.2 regression fence.** The sweep found nothing to fix, so there is no fix to
test. What is missing is a test that would **notice if D2's fix were reverted**. Add to
`tests/unit/void-run-semantics.test.ts` (or to `payroll-period-actors.test.ts` if the sibling
plan created it first — check before duplicating):

> `lock-writes-no-approver` — call `lock()` real against the mocked db and assert that **no**
> `tx.payrollRun.update` call carries an `approvedById` or `approvedAt` key. Assert on the
> **absence of the key** (`expect(data).not.toHaveProperty('approvedById')`), not on its value.

I checked the suite: **no test today asserts anything about the lock-path `approvedById`**, so
D2 breaks no existing expectation and nothing would go red if D2 were later reverted. That is
the gap this fence closes. If the sibling plan already added an equivalent assertion, say so and
skip — do not write a second copy.

### Phase F — D12, the payslip PAYDATE record (step 12)

**12. Capture the before/after sample and write the Finance note.** AC-10.1, AC-10.2, AC-10.3.

> **SUPERSEDED 18-08-26 — read this before quoting anything below.** HR ruled after this plan was
> written: **PAYDATE is the day the payslip was released.** `assemblePayslipDocument()` now reads
> `run.releasedAt` and prints **blank** when there is no release date. Every "period end date" and
> "approval date" prediction in steps 12b and 12c below is a **dead forecast** — the shipped
> behaviour is neither. The captured samples are still valid as history; the predictions are not.
> Authority: `docs/finance-note-paydate-change.md` and `phase0-evidence_18-08-26.md`.

This is a **document sample, not a code assertion.** The chain is `payslip-document.ts:282`
(`payDate: run.approvedAt ? shortDate(run.approvedAt) : shortDate(run.periodEnd)`) →
`payslip-pdf.ts:156` (`labelValue(doc, 'PAYDATE:', …)`). **No Svelte component renders
`approvedAt` at all** — the PDF is the only render, which is exactly why a code-path assertion
would not satisfy AC-10.1.

- **12a. Before — this is a PHASE 0 action, and it is the ONLY window in which it can ever run.**
  It must happen on a clean tree **before `payroll-void-audit-298` step 8 lands**; once that write
  is gone the "before" sample is unrecoverable. **It is also the SAME capture as that plan's
  L7-before — run it ONCE, on one period, and cite the single result from both plans.** On a tree
  **without** D2 step 8: create period `ZZ-D12-PROBE`, generate, and
  **lock it without ever approving the run through the #134 chain**. Download the payslip PDF
  for one entry. Record the literal `PAYDATE:` string. It will be the **lock date**.
- **12b. After.** With D2 step 8 applied, repeat on a fresh `ZZ-D12-PROBE-2`. Record the literal
  `PAYDATE:` string. It will be the **period end date**.
- **12c. The control (AC-10.2).** On the same "after" tree, run a period whose run **was**
  approved through the real approve path, and confirm its `PAYDATE:` is the **approval date**,
  unchanged from before. Without this, 12b could equally mean "PAYDATE is broken for everyone".
- **12d.** Paste both literal strings, the two period names and the control result into the
  EXECUTE report. Attach or transcribe the PDF field — do not paraphrase it.
- **12e (AC-10.3).** Write a short hand-off note to the owner, in the report and in the closeout
  message, in plain words: *"On payslips for a payroll that was locked but never formally
  approved, the printed PAYDATE changes from the lock date to the period end date. Approved
  payrolls are unaffected. Please tell Finance before this ships."* This is due **before** the
  change ships, not after.

---

## Explicitly OUT OF SCOPE

| Item | One-line reason |
|---|---|
| **D9 / final-pay arithmetic / AC-6.x** | Premise disproved; the owner is deciding its fate separately. See the placeholder above. |
| Fixing the cash-advance over-credit in the reversal | Pre-existing, needs a new payment ledger and a backfill decision the owner has not been asked. Named in the code comment (step 3) and reported. |
| Making a run void also unlock or void the period | A bigger, undecided behaviour change. The doc (step 9) states the difference instead. |
| A DRAFT or APPROVED status refusal on `voidRun` | Would newly block somebody who can act today — fails AC-7.4. |
| Any change to `voidPeriod`'s observable behaviour | Step 3/4 is a pure extraction. |
| `separation.ts` and everything in #297 | Owned by a parallel agent. |
| The D1/D2 edits — `PAYROLL_VOID`, `lockedById`, `releasedById`, removing the `lock()` approver write | Owned by `payroll-void-audit-298_PLAN_17-08-26.md`. |
| Touching `JobPosting.approvedById` | Different model, single writer, unambiguous. See the sweep. |
| Backfilling or retro-fixing any historical void | SPEC out-of-scope 12. |
| Filing any GitHub issue | SPEC constraint 11 — the 18-08-26 approval covered #304–#308 only. |

---

## AC-8.1 / AC-8.3 — the "who approved" enumeration (the permanent record)

**Verdict: exactly one ambiguous actor field — `PayrollRun.approvedById` — and D2 already fixes
it.** No other site needs a change, and that "nothing else to fix" result is itself the deliverable
(AC-8.3). The verdict is independently confirmed by step 10's **Check A**: `approvedById` has
exactly four writers in `src/` and `scripts/`, at four named sites, one of which is the `lock()`
write D2 removes.

> **The field COUNT is a KNOWN GAP, not a clean result.** Three numbers disagree: the research
> sweep reported **23** fields, this table enumerates **22**, and the plan's own schema grep matches
> **18** (it cannot match `ActionProposal.initiatorId`, `ApprovalStep.actorId`,
> `PostingApprover.approverId` or `AuditLog.actorId`, none of which end in `...ById`). The
> discrepancy is bookkeeping, not a known missing site — but **this plan's tooling cannot close it**
> and must not claim to. Report the count as approximate with all three numbers named. The verdict
> above does not depend on the count.

| # | Model . field | Writer(s) | Verdict |
|---|---|---|---|
| 1 | `EmployeeCompensation.changedById` | `employees.ts:541,552` (`'system'` sentinel), `:833/:848` (param) | **Correct** — one meaning: who changed it. Note the literal `'system'` sentinel; it is a documented shape here, not an ambiguity. |
| 2 | `EmployeeEmploymentType.changedById` | `employees.ts` (same helper pair) | **Correct** |
| 3 | `Timesheet.reviewedById` | `timesheets.ts:348`, `:401` | **Correct** — both writes mean "the reviewer"; `:401` is conditional on `settled`. |
| 4 | `OnboardingCompletion.completedById` | `onboarding.ts:414` | **Correct** — single writer |
| 5 | `Award.awardedById` | `awards.ts:32` | **Correct** — single writer |
| 6 | `LeaveRequest.reviewedById` (+ `reviewedAt`) | **none** | **Out of scope — dead columns.** Zero writers anywhere. Not ambiguous; unused. Do not "fix". |
| 7 | `RequestDocument.verifiedById` | `requests/documents.ts:186` | **Correct** — single writer, one meaning |
| 8 | `EmployeeDocument.uploadedById` | `documents.ts:74` | **Correct** — single writer |
| 9 | `SeparationRecord.finalizedById` | `separation.ts:247` | **Correct** — single writer. #297's territory; do not touch. |
| 10 | `ClearanceItem.clearedById` | `separation.ts:135` | **Correct** — single writer (nulled on un-clear). #297's territory. |
| 11 | **`PayrollRun.approvedById`** | `approvals.ts:673` (the approver), `payroll/index.ts:508` (the approver), **`periods.ts:252` inside `lock()` (whoever locked)** | **AMBIGUOUS — the only one.** Three writers, two meanings. **Fixed by D2 step 8**, which removes the `lock()` write. Nothing further is needed here. |
| 12 | `JobPosting.submittedById` | `recruitment.ts:81` | **Correct** — single writer |
| 13 | `JobPosting.approvedById` | `recruitment.ts:174` | **Out of scope — explicitly.** Different model, single writer, unambiguous. Named out of scope by SPEC AC-8.1 itself. |
| 14 | `JobPostingChannel.postedById` | `job-boards.ts:227,233` | **Correct** — both mean "who posted it" |
| 15 | `ApplicantStageHistory.changedById` | `recruitment.ts:285,354,423,462` | **Correct** — four writers, all "who moved the applicant" |
| 16 | `StatutoryRateProposal.proposedById` | `payroll/statutory-rates.ts:337` | **Correct** — single writer |
| 17 | `StatutoryRateProposal.decidedById` | `statutory-rates.ts:363` (apply), `:412` (reject) | **Correct** — two writers, one meaning: the decider. Apply/reject are both decisions. |
| 18 | `ActionProposal.decidedById` | `action-proposals.ts:212` (apply), `:257` (reject) | **Correct** — same shape as 17 |
| 19 | `ActionProposal.initiatorId` | `action-proposals.ts` (create path) | **Correct** — distinct field for a distinct actor. This is the *right* pattern: proposer and decider have separate columns. |
| 20 | `ApprovalStep.actorId` | approvals chain (#134) | **Correct** — the per-step actor, one meaning |
| 21 | `PostingApprover.approverId` | recruitment config | **Correct** — configuration, not an event record |
| 22 | `AuditLog.actorId` | `audit.ts` — the audit mechanism itself | **Out of scope** — this is the mechanism that records everything else, not a domain field. |

### The structural cause, recorded because it explains the whole bug

**`PayrollPeriod` has `lockedAt` (schema `:1613`) and `releasedAt` (`:1614`) with no actor
column at all.** It is the **only timestamp-without-actor pair in the schema** — every other
`*At` above sits beside its `*ById`. `lock()` borrowed the neighbouring model's field because it
had nowhere else to write the actor. D2 closes this by adding `lockedById` / `releasedById`.

**The design rule this yields, worth keeping:** an actor field is ambiguous when two *different
roles* write it, not when two *code paths* do. Rows 17 and 18 have two writers each and are
fine, because apply and reject are both "the decider". Row 11 was broken because "approver" and
"locker" are different people doing different jobs. Row 19 shows the correct fix shape: a second
column, which is exactly what D2 does.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `void-run-divergence-live-probe` — step 1's four post-void numbers plus the period-void negative control, **recorded either way** | Agent-Probe | **AC-7.1 (gate)** |
| `void-run-reverses-amortization` — live-seeded loan, real lock via the real route, real run void via curl; loan balance returns to principal and the `loan_payments` row is deleted | Hybrid (new e2e spec + step-1 psql re-run) | AC-7.2 |
| `void-run-skips-reversal-on-unlocked-period` — a run on a `GENERATED` period is voided; balances **do not** move | Fully-Automated | AC-7.2 (the negative half) |
| `void-run-status-precondition` — voiding an already-`VOIDED` run rejects with `status: 400` and a message naming "already voided" | Fully-Automated | AC-7.3 |
| `void-run-capability-unchanged` — after edit **E1 only**, every existing assertion in `tests/unit/override-finalized-guard.test.ts` passes **unchanged**, and `git diff` on that file shows only the E1 mock line added. **The old "zero edits" form of this gate is withdrawn — it was impossible (see Touchpoints).** | Fully-Automated (`pnpm test -- override-finalized-guard` + the diff check) | AC-7.4 |
| `void-run-no-period` — a run whose `periodId` is NULL voids successfully and `reverseAmortization` is **not** called | Fully-Automated | AC-7.4 (period-less runs are not newly blocked), AC-7.2 (nothing is credited) |
| `void-run-reverses-cash-advance` — a cash advance whose live balance is **below** the installment: lock, then void the RUN; record `cash_advances.balance` and `status` as **positive measured numbers**. This gate **measures the known over-credit; it does not assert the correct value** | Hybrid (live **L7**) | AC-7.2 (the cash-advance arm — measured, not proven correct) |
| `void-run-allows-draft-and-approved` — a `COMPUTED` and an `APPROVED` run both still void successfully | Fully-Automated | AC-7.4 |
| `void-period-unchanged-after-extract` — `pnpm test:e2e -- payroll-lock-idempotency` still passes after step 4 | Hybrid | AC-7.2 (no-regression) |
| `run-void-leaves-period-untouched` — two parts: (a) `grep` finds **no** `payrollPeriod.update` and no `payrollRun.update` in `amortization.ts` (proves F2's error is not re-introduced); (b) live **L2** records `payroll_periods.status` as still **`LOCKED`** after a run void | Fully-Automated (a) + Hybrid (b) | AC-7.5 (the single remaining difference is real and preserved) |
| `void-semantics-documented` — `docs/payroll-void-semantics.md` exists and names, for both voids: the status precondition, what is reversed, what the period status ends as, and how each is reached | Fully-Automated (file + content grep) | AC-7.5 |
| **The enumeration table above**, re-confirmed by step 10's two greps | Fully-Automated | **AC-8.1, AC-8.3** |
| `lock-writes-no-approver` — `lock()`'s `payrollRun.update` data has **no** `approvedById` key (`not.toHaveProperty`, not `toBe(null)`) | Fully-Automated | AC-8.2 |
| `payslip-paydate-before-after` — the literal `PAYDATE:` string from a real rendered PDF, before and after, on a locked-but-never-approved run | Agent-Probe | AC-10.1 |
| `payslip-paydate-unchanged-when-approved` — the step-12c control: an approved run's `PAYDATE:` does not move | Hybrid | AC-10.2 |
| The Finance hand-off note, written in the report **and** the closeout | Agent-Probe | AC-10.3 |
| `guard-mutation-check` — the mutation table below, **run and its results recorded** | Fully-Automated | AC-5.3 |

### Test files

- **`tests/unit/void-run-semantics.test.ts` — NEW.** Clone the mock setup from
  `tests/unit/override-finalized-guard.test.ts:28-65`, which already runs `voidRun` **real**
  against a mocked `$lib/server/db`. That file is the working template and needs almost no new
  infrastructure. Mock `$lib/server/audit` (`writeAuditLog` as a spy) and
  `payroll/amortization` (`reverseAmortization` as a spy) so the assertions are
  *"was the reversal called / not called"* — which is cheap here and catchable.
- **`tests/e2e/payroll-void-run-amortization.spec.ts` — NEW.** Clone
  `tests/e2e/payroll-lock-idempotency.spec.ts` wholesale. Its `seed()` already creates a live
  `ACTIVE` loan, a period, a run and drives the real lock route with a real `PrismaClient`.
  Change: `TAG = 'e2e-void-d10'`, and after the lock, `POST /api/v1/payroll/[runId]?action=void`
  instead of a second lock. **Also seed one `CASH_ADVANCE` deduction alongside the loan**, with a
  live advance balance **below** the installment, so the run-void path exercises the cash-advance
  arm at all. Record its post-void `balance` and `status` as measured numbers — do not assert a
  "correct" value, because the arm is known-wrong and deliberately unfixed. Assert positively: `loan.balance` equals the original principal
  **as a number you name**, and `loan_payments` for that entry is **0 rows**. "Balance is not
  reduced" proves nothing — assert the exact figure.

**`tests/e2e/payroll-lock-idempotency.spec.ts` must not be modified** — its value is that it stays
green untouched after the step-3 extraction.

**`tests/unit/override-finalized-guard.test.ts` gets exactly one edit, E1** (add `$transaction` to
`dbMock`), and nothing else. Its assertions are the AC-7.4 proof and must be preserved verbatim;
the `git diff` on that file is part of the gate. See "The one permitted edit to the guard test".

---

## Mutation checks (AC-5.3 — must be RUN, not just intended)

Each row: break it on purpose, run `pnpm test`, confirm the named test goes **red**, then revert.
Record the **actual** result of every row in the EXECUTE report. An unrun mutation table is a
hypothesis, not evidence — this repo has shipped five false greens off a mocked db.

| # | Break this | Must go red |
|---|---|---|
| M1 | Delete the `if (run.status === 'VOIDED')` refusal in `voidRun` | `void-run-status-precondition` |
| M2 | Widen it to also refuse `DRAFT` | `void-run-allows-draft-and-approved` |
| M3 | Delete the `await reverseAmortization(tx, id)` call in `voidRun` | `void-run-reverses-amortization` (unit spy half) |
| M4 | Drop the `wasLocked` condition so the reversal runs unconditionally | `void-run-skips-reversal-on-unlocked-period` |
| M5 | Change `wasLocked` to `LOCKED` only, dropping `RELEASED` | `void-run-reverses-amortization` — **add a `RELEASED`-period case to the unit test specifically so this row is catchable** |
| M6 | Move the `payrollRun.update` out of the `$transaction`, leaving the reversal inside | **Expected: nothing goes red.** The unit suite mocks `$transaction` and cannot see atomicity. Record "no test caught it — by design" and note that only a crash-injection test would, which is out of scope. |
| M7 | Put `approvedById: ctx.actorId` back into `lock()` | `lock-writes-no-approver` |
| M8 | In `lock-writes-no-approver`, change the assertion to `toBe(null)` instead of `not.toHaveProperty` | Should **still** pass with the key absent — which is the point: it proves the weaker assertion is weaker. Record the observation; revert. |
| M9 | Delete `docs/payroll-void-semantics.md` | `void-semantics-documented` |
| M10 | Make the `CASH_ADVANCE` branch inside `reverseAmortization` a no-op (`continue` before it) | The e2e / **L7** cash-advance figures change — proving the cash-advance arm is reached at all from `voidRun`. This row proves **reachability**, not correctness; the arm's arithmetic is known-wrong and out of scope |
| M11 | Move `tx.payrollPeriod.update(... 'VOIDED')` from `voidPeriod` into `reverseAmortization` (i.e. re-commit F2's error) | `run-void-leaves-period-untouched` part (a) — the `amortization.ts` grep — and live **L2**'s `payroll_periods.status` |

M10 is the row that stops the cash-advance fence from being a paragraph nobody tested. M11 exists
because F2's error was made once already, in this very plan, and a grep is the cheapest thing that
would have caught it.

M6 is the honest finding this repo's history demands: one of the changes is **not unit-provable
at all**. That is why step 1's live probe and the e2e spec are mandatory, not optional.

---

## Live verification (mandatory — not optional)

The unit suite mocks the database, so it cannot prove: **(a)** that a run void actually moves a
loan balance in Postgres, **(b)** that the reversal is transactional, or **(c)** what a payslip
PDF literally prints.

**Harness.** The **user starts the dev server themselves — the agent never starts it, and never
starts the database.** Cookie + psql, exactly as in step 1. Table names are snake_case
(`payroll_periods`, `payroll_runs`, `payroll_entries`, `loans`, `loan_payments`, `cash_advances`,
`audit_logs`, `users`); **column names are camelCase and must be double-quoted** — every `@map`
in this schema is table-level, there are zero field-level ones.

**Plant a marker.** Every probe period is named `ZZ-D10-PROBE`, `ZZ-D10-PROBE-2`,
`ZZ-D12-PROBE`, `ZZ-D12-PROBE-2`. Find every row by that name. Never assert "the row is absent"
— assert a positive value you can name in advance.

| # | Step | Assert |
|---|---|---|
| **L1** | Step 1's probe, **before the change** | The four post-void numbers. This is AC-7.1 and gates everything. |
| **L2** | The same probe, **after** steps 5–8 | `loans.balance` back at the **exact principal** you seeded; `select count(*) from loan_payments where "loanId"=…` → **0**; `payroll_runs.status` → `VOIDED`; `payroll_periods.status` → still **`LOCKED`** (deliberately — say so in the report). |
| **L3** | Void the **same run twice** via curl after the change | Second call returns HTTP **400** with a body naming "already voided". Then confirm the balance did **not** move a second time: `loans.balance` is still the principal, not principal + installment. This is the real risk of AC-7.3 — a double reversal double-credits. |
| **L4** | Void a run whose period is still `GENERATED` | HTTP 200, `payroll_runs.status` = `VOIDED`, and `loans.balance` **unchanged from before the call** (record both numbers). Nothing was ever applied, so nothing may be credited. |
| **L5** | Void a run on a **`RELEASED`** period | Balance returns to principal. This is the `wasLocked` second arm (M5) and no other step covers it. |
| **L7** | **Cash advance, capped.** Seed an employee a `CASH_ADVANCE` whose live balance is **below** one installment (e.g. balance `300.00`, installment `500.00`). Lock the period — record `cash_advances.balance` and `status` immediately after the lock. Then void the **RUN** via curl. | Record **positive measured numbers**, not an absence: the post-void `cash_advances.balance` and `status`. Expect the balance to come back **higher than the pre-lock balance** by the capped difference (the over-credit), and `status` forced to `ACTIVE` regardless of what it was. Write the three figures — pre-lock, post-lock, post-void — into the report, and name the over-credit as a peso figure. Also record `payroll_periods.status` as still **`LOCKED`**: that is the new part, an over-credited advance sitting against a period that still looks live. **This row measures a known defect; it is not a pass/fail gate and must not be "fixed".** |
| **L6** | Step 12a/12b/12c — the payslip PDFs | Three literal `PAYDATE:` strings recorded: locked-never-approved **before** (= lock date), the same **after** (= period end date), and an **approved** run after (= approval date, unmoved). Transcribe the literal strings; do not paraphrase. |

**Negative controls that must appear on BOTH sides of the change:** L4 (an unlocked period must
never credit, before or after) and L6's approved-run control (its PAYDATE must be identical
before and after).

**Cleanup:** delete every `ZZ-` period and its runs, entries, deductions, loan payments, seeded
loans **and seeded cash advances**, or state in the report that they were left and why.

---

## Test Infra Improvement Notes

- **There is no unit test anywhere for `voidPeriod`'s reversal arithmetic.** `voidPeriod` is
  mocked at the route level in `override-finalized-guard.test.ts` and pulled in real only to pin
  the capability guard — nothing exercises the loan or cash-advance math. Step 3's extraction
  into `amortization.ts` makes such a test cheap for the first time (a pure function taking a
  `tx`). **Not built in this plan** — it is a new test surface for existing untested behaviour,
  outside this blast radius. Recorded so it is not lost.
- **The cash-advance over-credit has no test and cannot get one** until a cash-advance payment
  ledger exists. Recorded as a follow-up for the owner, not built, no issue filed.
- **`pnpm test:e2e` is flaky (#287).** Steps 4 and the new e2e spec both depend on it. If it
  cannot be landed green, the step-1 psql script is the manual substitute — but the substitution
  must be recorded, not silent.
- **`pnpm check` does not cover `prisma/**` or `scripts/**`.** Nothing in this plan lands in
  either directory, so this is a note, not a gate.
- **`tests/unit/override-finalized-guard.test.ts`'s `dbMock` is hand-built and brittle.** It has no
  `$transaction` and no relation data, so any service it runs *real* breaks the moment that service
  grows a transaction or an `include` — which is exactly what happened here (edit E1). A shared
  db-mock factory that ships `$transaction` by default would remove this whole class of breakage.
  **Not built in this plan**; recorded.
- The `_dev/login-as` curl harness is the only way to reach `voidRun` at all. It is worth a line
  in the test context docs — a whole service function with no UI path is easy to forget exists.

---

## Commands (exact)

```bash
pnpm prisma generate            # ALWAYS before believing a red check
pnpm format:check
pnpm lint
pnpm check
pnpm test                       # vitest run — there is no test:unit script
pnpm test -- void-run-semantics override-finalized-guard
pnpm test:e2e -- payroll-lock-idempotency
pnpm test:e2e -- payroll-void-run-amortization
```

No `pnpm db:push` — this plan makes no schema change.

---

## Risks

| Risk | Mitigation |
|---|---|
| **A double void double-credits a balance** — the worst outcome here, and the reason AC-7.3 exists | L3 asserts the second call is refused **and** that the balance did not move twice |
| The step-3 extraction silently changes `voidPeriod` behaviour | The block is moved verbatim; the existing lock-idempotency e2e spec is the gate before step 5 |
| A run on an unlocked period is credited money it never paid | Design Note 4 + the `void-run-skips-reversal-on-unlocked-period` test + L4 + mutation M4 |
| **The cash-advance over-credit becomes reachable on a path that leaves the period `LOCKED`** — a dormant defect turned live, which is strictly worse than today | Cannot be fixed here (needs a cash-advance payment ledger + an owner decision). Fenced instead: **measured** as numbers by live **L7**, reachability proved by mutation **M10**, exercised by the new e2e seed, commented in `amortization.ts` (step 3), documented under the run-void section of the doc (step 9), and stated as a worsening — not as neutral — in the report |
| Re-committing F2 — the extraction sweeping in the period status flip, so a run void voids the period | Step 3's line-by-line move/don't-move table, step 4's `amortization.ts` grep gate, mutation **M11**, and live **L2**'s `payroll_periods.status` check |
| `run.period` is NULL on a real run and `voidRun` crashes | Design Note 4's optional chain, the `void-run-no-period` unit case, and the guard test's own period-less mock exercising the same path |
| A crash mid-reversal leaves a half-credited void | The `$transaction` in Design Note 3 — but M6 pre-declares this as unit-unprovable |
| Editing `voidRun` collides with the sibling #298 plan | Dependencies section: steps 5–8 land after that plan's steps 9–11, never in parallel |
| Building a D10 fix for a defect that never reproduced | Step 2 is a hard branch; SPEC constraint 12 |
| Vacuous mock green (this repo's #1 historical false-green) | The mutation table is mandatory and its **results** must be recorded; M6 and M8 are pre-declared as uncatchable |
| Finance sees a changed PAYDATE without warning | Step 12e, due **before** ship |

---

## Acceptance Criteria (done means)

1. **Step 1 run and its result recorded, before any code was written.** If it did not reproduce,
   steps **3–8** are correctly **absent** from the diff — and **step 9, the doc, is still present**,
   describing the behaviour the probe actually found.
2. All applicable steps applied, in order.
3. `pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test` all green.
4. `tests/e2e/payroll-lock-idempotency.spec.ts` green **with zero edits**, and
   `tests/unit/override-finalized-guard.test.ts` green with **exactly one** edit — E1, the
   `$transaction` mock key — proven by `git diff tests/unit/override-finalized-guard.test.ts`
   showing that single added line and no assertion changed. (The former "zero edits" wording for
   this file was impossible and has been withdrawn; see Touchpoints.)
5. Every mutation row M1–M11 **run**, with its actual result recorded (including M6's and M8's
   "nothing went red — by design").
6. L1–L7 run live, with the negative controls on both sides. **L7's three cash-advance figures are
   recorded as numbers**, and the report states plainly that this plan widens the reach of that
   defect from one void path to two, onto a path that leaves the period `LOCKED`.
7. The D11 enumeration copied into the report with the **verdict** "exactly one ambiguous field,
   `PayrollRun.approvedById`, fixed by D2" — confirmed by step 10's **Check A** (exactly four
   `approvedById` writers, at the four named sites) — **and** the field-count gap recorded beside
   it in plain words (22 enumerated / 23 reported by research / 18 matched by the grep; the tooling
   cannot settle it). Reporting the count as "clean" is a failed criterion.
8. The three literal `PAYDATE:` strings recorded, and the Finance hand-off note written.
9. No new 403 anywhere. Exactly **one** new 400, on an already-voided run only.
10. `separation.ts` untouched — confirm with `git diff --name-only`.
11. `prisma/schema.prisma` untouched — confirm the same way.
12. Nothing committed without explicit owner approval; **no `Co-Authored-By` trailer**; merges go
    to `staging`, so `Closes #298` never fires — the issue is closed by hand. **Do not file any
    GitHub issue** (SPEC constraint 11).

---

## Phase Completion Rules

This plan is a single phase. It is `CODE DONE` when the applicable steps are applied and the four
automated gates are green. It is only `VERIFIED` when, in addition:

- **step 1's live probe has a recorded result** (AC-7.1 is a gate, not a test — an unrun probe
  means D10 is not started, let alone done),
- every mutation row M1–M11 has been **run** with its actual result recorded, and
- L1–L7 have been run live with the negative controls on both sides.

Code-only completion is `CODE DONE`, never `VERIFIED`. A green unit suite alone does not promote
this plan: M6 is pre-declared as uncatchable by the unit suite, and AC-7.1, AC-10.1 and AC-10.3
have no automated form at all.

## Resume and Execution Handoff

1. **Selected plan file:**
   `process/general-plans/active/void-semantics-and-sweep_PLAN_18-08-26.md`
2. **Last completed step:** PLAN written. No code written. Nothing committed. Branch
   `feat/separation-of-duties-298-297`.
3. **Validate-contract status:** VALIDATE ran 18-08-26 and gated this plan **BLOCKED** on three
   FAILs (F1 the guard test broken by steps 7–8, F2 the wrong extraction range, F3 the optional
   `run.period`). **All three, plus CONCERNs F4, F5, F6, F7 and the stale D9 placeholder, were
   repaired in this file on 18-08-26.** Every FAIL was a plan-text error; the D10 design is
   unchanged. The `## Validate Contract` section below is the pre-repair record — VALIDATE must be
   re-run from V1 and will rewrite it.
4. **Context loaded:** the locked SPEC `separation-of-duties-298-297_SPEC_17-08-26.md`, both
   sibling plans (read-only), `runs.ts`, `periods.ts`, `prisma/schema.prisma`,
   `api/v1/payroll/[id]/+server.ts`, `tests/unit/override-finalized-guard.test.ts`,
   `tests/e2e/payroll-lock-idempotency.spec.ts`.
5. **Next step for a fresh agent:** run VALIDATE against this file. Then **step 1 — the live
   probe — first, and nothing else.** It needs no sibling plan, no code change, and it decides
   whether steps 3–8 exist at all (step 9, the doc, runs either way). Do not start at step 6. Before touching `runs.ts`, confirm
   with `git log --oneline` and `git diff` that `payroll-void-audit-298`'s steps 9–11 have
   already landed, or you will collide with the parallel agent in the same function body.
6. **If context was compacted mid-run:** the single most important thing to re-read is the
   "recorded result" line for step 1 in the EXECUTE report. If it is not there, D10 has not
   started.

## Validate Contract

Status: CONDITIONAL
Date: 18-08-26
date: 2026-08-18
generated-by: outer-pvl
supersedes: 2026-08-18 (outer-pvl) — re-validated from V1 after the F1/F2/F3 repair pass; all three FAILs verified fixed against the live source

Parallel strategy: sequential
Rationale: 6/7 signals present, but this plan CANNOT be parallelised with `payroll-void-audit-298`
under any strategy — both edit the body of `voidRun` and the same region of `periods.ts`. Sequential
is the only safe execution for the payroll track. Both fan-out layers ran inline against the live
source and the live database (read-only).

### Re-validation result — the three FAILs are RESOLVED

Each was re-checked against the code, not against the plan's description of itself.

**F1 — RESOLVED, and edit E1 is sufficient.** Traced the post-step-8 `voidRun` against the real
mock at `tests/unit/override-finalized-guard.test.ts:28-58` and its `beforeEach` at `:119-127`:

- `dbMock.payrollRun.findFirst` resolves `{ id: 'x1', status: 'APPROVED' }` — no `period` key, so
  `run.period?.status` is `undefined`, `wasLocked` is `false`, and `reverseAmortization` is never
  called. The mock therefore needs **no** `payrollEntry`, `loan`, `loanPayment` or `cashAdvance`
  keys — this was the specific risk in accepting E1 and it does not materialise.
- `$transaction: async (fn: any) => fn(dbMock)` passes `dbMock` as `tx`, so `tx.payrollRun.update`
  IS `dbMock.payrollRun.update`, which `beforeEach` already resolves to
  `{ id: 'x1', status: 'VOIDED' }`. `resolves.toMatchObject({ status: 'VOIDED' })` (`:136`, `:146`)
  and `expect(dbMock.payrollRun.update).toHaveBeenCalled()` (`:149`, `:161`, `:166`) all hold.
- `run.status === 'VOIDED'` is false (`APPROVED`), so step 6's new 400 does not fire.
- `writeAuditLog` is already mocked (`:61`).
- The arrow closes over the module-scope `dbMock` const lazily, so the self-reference inside the
  `vi.hoisted` object literal is evaluated at call time and is safe. `vi.clearAllMocks()` clears
  calls, not implementations, so a plain arrow (or a `vi.fn`) both survive it.

Verdict: every existing assertion in that file passes after E1 alone. The AC-7.4 replacement gate
("assertions untouched and green, and `git diff` shows only the E1 line") is achievable as written.

**F2 — RESOLVED, and `:316-361` is exact and brace-balanced.** Read live:

- `:314` `await db.$transaction(async (tx) => {` — stays
- `:315` `if (run && wasLocked) {` — stays
- `:316` the `// Reverse the amortization committed at lock.` comment — moves
- `:317-320` `tx.payrollEntry.findMany({ … include: { deductions: true } })` — moves
- `:321-361` the `for (const entry of entries)` loop, both arms, `:360` closes the inner `for`,
  `:361` closes the outer `for` — moves
- `:362` `}` closes `if (run && wasLocked)` — stays
- `:363` `if (run) await tx.payrollRun.update(… 'VOIDED')` — stays
- `:364` `await tx.payrollPeriod.update(… 'VOIDED')` — stays
- `:365` `})` — stays

316-361 is exactly the if-body and is balanced. The only `run.id` inside the span is `:318`, which
step 3's `payrollRunId: runId` rename covers. No status write is inside the span, so the extracted
function cannot void the period. The step-4 grep gate and mutation M11 both remain meaningful.

**F3 — RESOLVED and it typechecks.** `prisma/schema.prisma:1082` `periodId String?` and `:1097`
`period PayrollPeriod? @relation(...)` confirmed. With `include: { period: true }` the field is
`PayrollPeriod | null`; `run.period?.status` yields `PayrollPeriodStatus | undefined`, which
compares to the `'LOCKED'` / `'RELEASED'` literals without error. Confirmed live in the database:
`select count(*) from payroll_periods` → **0**, and both existing `payroll_runs` rows have a
**NULL `periodId`** — the period-less shape is real data, not theoretical.

**F4–F10 — RESOLVED.** Cancel branch is now 3–8 with step 9 surviving; step 12a is a Phase 0 action
and is the same capture as the sibling's L7-before; the cash-advance fence now states plainly that
this plan converts a dormant over-credit into a live one, measured by L7 in pesos and reached by
M10; step 10's guaranteed-pass check is replaced with Check A, which returns exactly the four
`approvedById` writers (re-run in this session: `approvals.ts:673`, `payroll/index.ts:508`,
`periods.ts:252`, `recruitment.ts:174` — four, nothing else); the schema grep returns **18**,
recorded as a known gap; the D9 placeholder cites the 18-08-26 drop.

### Stale-promise sweep (greps, not summaries)

Every removed claim was grepped for in the plan body. All remaining hits are the deliberate
withdrawal statements or the historical FAIL text inside the superseded contract:

- "zero edits" — only the withdrawal prose and the `payroll-lock-idempotency` gate (which is
  genuinely zero-edit). No live promise remains.
- `314-370` / `313-370` — only in the "an earlier draft said" correction at `:433`.
- `run.period.status` without the optional chain — only in the "does not typecheck" warnings.
- "steps 3–9 are cancelled" — gone from the body.
- "no ordering constraint at all" — only the true residue, "step 10 genuinely has no ordering
  constraint", which is correct.
- "Do not modify `override-finalized-guard.test.ts`" — gone.
- `M1–M9` — gone from the body's mutation and completion rules; both now say M1–M11.

### NEW findings from this pass

**N1 — the extraction breaks `pnpm lint`, and the plan does not say so.** `sum` is imported in
`periods.ts:6` (`import { D, q2, sum } from './money'`) and is used at **exactly one place in the
whole file — `:337`**, which is INSIDE the extracted span. After step 3, `sum` is an unused import
and lint goes red. Also unstated: the new `src/lib/server/services/payroll/amortization.ts` needs
`import { D, sum } from './money'` and `import type { Prisma } from '@prisma/client'`. `D` stays
used in `periods.ts` (`:183`, `:193`, `:228`) so its import stays. Execute-agent instruction E2
below. Severity: CONCERN.

**N2 — step 5's premise is factually wrong in one detail.** The plan says the void branch "today it
has no try/catch at all". `src/routes/api/v1/payroll/[id]/+server.ts:67-71` DOES have a try/catch —
around `requireAnyCapability` only. The `voidRun` call at `:73-77` is genuinely unwrapped, so the
instruction (wrap the service call, map 400/403/404 to `apiError`, message `'Cannot void this
run'`) is correct and step 5 still must run before step 6. Severity: CONCERN (plan text).

**N3 — one user in the entire dev database can void anything.** `OVERRIDE_FINALIZED` is
`['SUPER_ADMIN']` (`src/lib/rbac.ts:73`) and the live `users` table holds exactly one active
SUPER_ADMIN: **`admin@veent.ph`** (org_seed). Step 1's `SUPERADMIN_EMAIL_HERE` placeholder resolves
to that address and nothing else. Severity: CONCERN (live-step precision).

**N4 — the "same capture, done once" claim is TRUE for the artifact but the period is unnamed, and
the obvious period cannot be used.** Step 12a and `payroll-void-audit-298`'s L7-before both want the
literal `PAYDATE:` string from a rendered payslip PDF for an entry on a **locked-but-never-approved**
run, on a tree where `lock()` still writes `approvedById`. That is genuinely one artifact, not two
similar ones. But the sibling's own probe period `ZZ-298-PROBE` **cannot serve as it**: its L2 step
approves the run as user A before locking. So the shared capture MUST be taken on
**`ZZ-D12-PROBE`**, the never-approved period step 12a creates. Neither plan says this. Severity:
CONCERN — execute-agent instruction E4 below.

### Test gates (5-column)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-7.1 | the void-run divergence is proven or disproven LIVE before any fix exists | Agent-Probe | step 1 — four post-void psql numbers + the `ZZ-D10-PROBE-2` period-void negative control, recorded either way; cookie for `admin@veent.ph` | A |
| AC-7.2 | voiding a run reverses LOAN amortization when the period was locked | Hybrid | `pnpm test:e2e -- payroll-void-run-amortization` (loan balance back at the NAMED principal, `loan_payments` = 0 rows) + live L2 | B |
| AC-7.2 | voiding a run on an unlocked period moves NO balance | Fully-Automated | `pnpm test -- void-run-semantics` (`void-run-skips-reversal-on-unlocked-period`) + live L4 both sides | B |
| AC-7.2 | voiding a run on a RELEASED period DOES reverse | Fully-Automated | `pnpm test -- void-run-semantics` — a RELEASED-period case added so M5 is catchable + live L5 | B |
| AC-7.2 | the CASH-ADVANCE arm of the new `voidRun` path is REACHED and its over-credit is measured | Hybrid | live **L7** (three peso figures: pre-lock, post-lock, post-void) + mutation **M10** + the cash-advance seed in the new e2e. Measures a known defect; does NOT prove correctness | D |
| AC-7.3 | an already-VOIDED run is refused with a message naming "already voided" | Fully-Automated | `pnpm test -- void-run-semantics` (`void-run-status-precondition`, status 400) + live L3 | B |
| AC-7.3 | a double void does not double-credit | Hybrid | live L3 second half — balance still equals the principal, NOT principal + installment | A |
| AC-7.4 | nobody who can void a run in a real state is newly blocked | Fully-Automated | `pnpm test -- override-finalized-guard` green after **E1 only**, plus `git diff tests/unit/override-finalized-guard.test.ts` showing that single added line and no assertion changed. **VERIFIED FEASIBLE this pass** | A |
| AC-7.4 | a period-less run (`periodId` NULL) still voids, with no reversal attempted | Fully-Automated | `pnpm test -- void-run-semantics` (`void-run-no-period`) + the guard test's own period-less mock | A |
| AC-7.4 | a COMPUTED and an APPROVED run both still void | Fully-Automated | `pnpm test -- void-run-semantics` (`void-run-allows-draft-and-approved`) | B |
| AC-7.5 | run void vs period void described in one findable place | Fully-Automated | `docs/payroll-void-semantics.md` exists and greps for: the status precondition, what is reversed, the ending period status, and how each void is reached | B |
| AC-7.5 | a run void leaves the period status untouched | Fully-Automated + Hybrid | (a) `grep -n "payrollPeriod.update\|payrollRun.update" src/lib/server/services/payroll/amortization.ts` returns NOTHING; (b) live L2's `payroll_periods.status` still `LOCKED`; mutation **M11** | A |
| AC-8.1, AC-8.3 | every actor-attribution writer enumerated with a verdict | Fully-Automated | the in-plan enumeration + step 10 **Check A** (exactly four `approvedById` writers at the four named sites — re-confirmed this pass). The COUNT is a known gap | D |
| AC-8.2 | a regression fence notices if D2's fix is reverted | Fully-Automated | `lock-writes-no-approver` — **owned by `payroll-void-audit-298`** (`approver-record-unambiguous` / its M9). Step 11 verifies and skips | C |
| AC-10.1 | the PAYDATE move captured as a real rendered PDF sample, before and after | Agent-Probe | step 12a on **`ZZ-D12-PROBE`** (Phase 0, clean tree — the only window) + step 12b on `ZZ-D12-PROBE-2` (Phase 5); literal strings transcribed | A |
| AC-10.2 | an APPROVED run's PAYDATE is unchanged | Hybrid | step 12c — the control on the same "after" tree | A |
| AC-10.3 | Finance is told BEFORE the change ships | Agent-Probe | step 12e — the hand-off note in the report AND the closeout | A |
| AC-5.3 | every guard is mutation-checked | Fully-Automated | **M1–M11** RUN with actual results recorded, including M6's and M8's "nothing went red — by design" | B |

Failing stubs (Fully-Automated rows only — red-first starting points for EXECUTE, applicable only
if step 1 reproduces):

```
test("should not move any balance when voiding a run on an unlocked period", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: voiding a run on an unlocked period moves NO balance")
})
test("should reverse amortization when voiding a run on a RELEASED period", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: voiding a run on a RELEASED period DOES reverse")
})
test("void-run-status-precondition", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: an already-VOIDED run is refused with 400 naming 'already voided'")
})
test("void-run-no-period", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: a run with a NULL periodId voids and reverseAmortization is NOT called")
})
test("void-run-allows-draft-and-approved", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: a COMPUTED and an APPROVED run both still void")
})
test("void-semantics-documented", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: docs/payroll-void-semantics.md names the precondition, what is reversed, the ending period status, and how each void is reached")
})
test("run-void-leaves-period-untouched", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: amortization.ts contains no payrollPeriod.update and no payrollRun.update")
})
```

Legacy line form (for existing validate-contract consumers):

- D10 gate probe: `agent-probe: curl -s -b /tmp/void-probe.txt -X POST 'http://localhost:5173/api/v1/payroll/RUN_ID?action=void'` + the three psql queries — precondition: the USER starts the dev server and `veent-db-5434`; the cookie must be for `admin@veent.ph`, the only OVERRIDE_FINALIZED holder. There is NO UI button for a run void.
- voidRun unit gates: `Fully-automated: pnpm test -- void-run-semantics`
- guard-test scaffolding gate: `Fully-automated: pnpm test -- override-finalized-guard` + `git diff tests/unit/override-finalized-guard.test.ts` showing only the E1 line
- extraction no-regression: `hybrid: pnpm test:e2e -- payroll-lock-idempotency` — precondition: a working e2e environment; flaky per #287, with the step-1 psql script as the recorded manual substitute
- new reversal e2e: `hybrid: pnpm test:e2e -- payroll-void-run-amortization`
- the sweep: `Fully-automated: step 10 Check A` — exactly four `approvedById` writers; the schema-grep COUNT cannot be settled by this tooling
- cash-advance arm of the new voidRun path: `known-gap: documented as NEW PLAN REQUIRED — no test exists and none can exist until a cash-advance payment ledger does; measured in pesos by L7`

### Dimension findings

- Infra fit: CONCERN — commands correct (`pnpm test` = vitest, `pnpm test:e2e` = playwright, no `test:unit`). Nothing lands in `prisma/**` or `scripts/**`. `tests/e2e/payroll-lock-idempotency.spec.ts` and `tests/unit/override-finalized-guard.test.ts` both exist and are the right templates; `docs/payroll-void-semantics.md` and `src/lib/server/services/payroll/amortization.ts` do not exist, so neither create collides. **The database and app are now UP** — but zero payroll periods exist and both payroll runs have a NULL `periodId`, so every live step must build its own period (open → import → generate → lock). Residual: the e2e dependency is doubled on a suite the plan itself calls flaky, and N1's import fallout is unstated.
- Test coverage: CONCERN — F1's gate is now feasible and F6's cash-advance arm has L7 + M10 + an e2e seed, so the two things that failed last pass are closed. M1–M11 is a strong and honest table (M6 and M8 pre-declared as uncatchable is exactly right). Residual: the cash-advance arm is measured, never proven correct — a named, permanent residual.
- Breaking changes: PASS — `grep -rn "voidRun" src/ tests/` returns the service, `api/v1/payroll/[id]/+server.ts:73`, one comment in `periods.ts:306`, and `override-finalized-guard.test.ts`. Nothing else. The run detail page exports no `void` action. `voidRun` becoming money-moving is correctly identified as the real contract change.
- Security surface: PASS — `requireAnyCapability(ctx.actorRoles, 'OVERRIDE_FINALIZED')` at `runs.ts:93` and `periods.ts:307` untouched. `OVERRIDE_FINALIZED: ['SUPER_ADMIN']` confirmed at `rbac.ts:73`. One new 400, on a state that was never meaningful to void. No new 403.
- Section feasibility (Phase A, the gate): PASS — the best-built section in any of the three plans. Named marker, positive assertions, a period-void negative control on fresh data, and a self-invalidation clause if the lock did not move the balance. Only addition needed is the `admin@veent.ph` identity (N3).
- Section feasibility (Phase B, the extraction): CONCERN — the span is now correct and balanced (F2 resolved). Residual is N1 only: the `sum` import move is unstated and lint will go red.
- Section feasibility (Phase C, voidRun): PASS — F1 and F3 both resolved and re-verified. `findFirst` is at `runs.ts:95` as stated. Step 5's ordering is right; its premise wording is off by one detail (N2).
- Section feasibility (Phase D, the doc): PASS — no collision, content spec is concrete and greppable.
- Section feasibility (Phase E, the sweep): PASS — Check A re-run this session returns exactly the four named writers; the schema grep returns 18, recorded honestly as unsettled. Ownership of the fence is correctly deferred to the sibling.
- Section feasibility (Phase F, PAYDATE): CONCERN — 12a's Phase 0 placement is right and the shared-capture claim is TRUE for the artifact, but the period is unnamed and the sibling's period cannot serve (N4).

### Open gaps

- Cash-advance over-credit propagated to a second void path, onto a period that stays `LOCKED`: **known-gap: documented as NEW PLAN REQUIRED** — needs a cash-advance payment ledger plus a backfill decision the owner has not been asked. Measured in pesos by L7 before it ships. No GitHub issue filed (SPEC constraint 11).
- The actor-field COUNT (22 enumerated / 23 reported by research / 18 matched by the grep): **known-gap: documented** — this plan's tooling cannot settle it. The VERDICT is independently confirmed by Check A.
- `voidPeriod`'s reversal arithmetic has no unit test at all. The step-3 extraction makes one cheap for the first time. Not built here. Recorded.
- Atomicity of the new `$transaction` is unprovable by the unit suite (M6). Only a crash-injection test would catch it; out of scope. Accepted, named.
- The `_dev/login-as` curl harness is the ONLY way to reach `voidRun`, and `admin@veent.ph` is the only account that can. Worth a line in the test context docs.

### Execute-agent instructions

| # | Instruction | Trigger |
|---|---|---|
| E1 | Apply the `$transaction` mock key to `tests/unit/override-finalized-guard.test.ts` **in the same commit as step 8**. Add nothing else — no `period` key, no new assertions. Then run `git diff` on that file and paste it into the report; it must show one added line. | Step 8 |
| E2 | Step 3/4 import fallout, unstated in the plan: create `amortization.ts` with `import { D, sum } from './money'` and `import type { Prisma } from '@prisma/client'`, and **remove `sum` from `periods.ts:6`** — `:337` is its only use in that file and it sits inside the extracted span. `D` stays (`:183`, `:193`, `:228`). Skipping this turns `pnpm lint` red. | Step 3, before step 4's gate |
| E3 | Step 1's `SUPERADMIN_EMAIL_HERE` is `admin@veent.ph` — the only active `SUPER_ADMIN` and therefore the only `OVERRIDE_FINALIZED` holder in the whole dev database. Any run void, by anyone else, is a 403 and not a probe result. | Step 1 |
| E4 | The shared 12a / sibling-L7-before capture MUST be taken on **`ZZ-D12-PROBE`**, the never-approved period. Do NOT try to take it on the sibling's `ZZ-298-PROBE` — that period's run is approved at its L2, so it is not a "locked but never approved" run and its PAYDATE is the approval date. | Phase 0 item 3 |
| E5 | Step 5's plan text says the void branch has "no try/catch at all". It has one, around `requireAnyCapability` (`+server.ts:67-71`). The `voidRun` call at `:73-77` is the unwrapped part — wrap that, mapping 400/403/404 to `apiError` with `'Cannot void this run'`, mirroring `:57-63`. | Step 5 |
| E6 | Every live probe must build its own period. The database has **zero** `payroll_periods` and both existing `payroll_runs` have a NULL `periodId` — no existing run can be reused for L2/L4/L5/L7. | All live steps |

### What this coverage does NOT prove

- Step 1's probe proves the divergence on ONE seeded loan in ONE dev database. It does NOT prove it for cash advances, for multi-entry runs, or for a run with several deduction lines.
- `pnpm test -- void-run-semantics` mocks `$lib/server/db` and spies on `reverseAmortization`. It proves the reversal WAS or WAS NOT CALLED. It proves nothing about whether the reversal is arithmetically correct — that is only ever proven by the e2e spec and the live L2/L5 psql numbers, and only for LOANS.
- Nothing anywhere proves the cash-advance arm of the new `voidRun` path is correct. It is known to be incorrect (over-credit on a capped payment, unconditional `ACTIVE`) and is deliberately unfixed. L7 measures it; measuring is not proving.
- `pnpm test:e2e -- payroll-lock-idempotency` staying green after step 4 proves the extraction did not change the LOAN path of `voidPeriod`. It does not exercise the cash-advance branch, so a mistake in moving that branch would pass unnoticed. Only the new spec's cash-advance seed reaches it.
- The unit suite mocks `$transaction`, so it cannot see atomicity. M6 is pre-declared as catching nothing — a crash mid-reversal leaving a half-credited void is untested by design.
- Passing `dbMock` as `tx` in E1 means the unit suite cannot distinguish a transactional write from a non-transactional one. The E1 gate proves the guard assertions survived; it proves nothing about the transaction boundary.
- Step 10's Check A proves there is no FIFTH `approvedById` writer. It does NOT prove the 22-row enumeration is complete — the schema grep returns 18 and can never surface a 23rd field of a shape the pattern misses.
- The PAYDATE evidence is a rendered-document sample. It proves what one PDF printed on one run. It does not prove the behaviour for every payslip shape.
- Nothing proves the period is SAFE to leave `LOCKED` after a run void. That is an accepted, documented divergence, not a verified-harmless one.
- The live steps prove behaviour in `org_seed` dev seed data with one Super Admin. They prove nothing about production, about a tenant with several Super Admins, or about concurrent voids.

Gate: CONDITIONAL — 0 FAILs (F1, F2 and F3 all verified resolved against the live source), 4 new CONCERNs (N1 the `sum` import breaks lint; N2 step 5's premise wording; N3 the single OVERRIDE_FINALIZED account; N4 the shared-capture period is unnamed and the sibling's cannot serve), 5 known-gaps. All four new CONCERNs are handled by execute-agent instructions E2–E5; none is a design change. EXECUTE may proceed in its assigned slot.
Accepted by: session — accepted concerns, by name: N1 `sum` becomes an unused import in `periods.ts` after the extraction and lint goes red (fixed by E2); N2 step 5 says "no try/catch at all" when a partial one exists (fixed by E5); N3 only `admin@veent.ph` holds OVERRIDE_FINALIZED in the dev database (fixed by E3); N4 the shared 12a/L7-before capture has no named period and the sibling's `ZZ-298-PROBE` cannot serve it (fixed by E4). Plus known-gaps: the cash-advance over-credit reaching a second void path; the unsettled actor-field count; `voidPeriod`'s untested reversal arithmetic; the unprovable `$transaction` atomicity; the API-only reach of `voidRun`.

---

## THE GLOBAL EXECUTION ORDER (binding, all three plans)

Unchanged by this re-validation, with the N3/N4 identities filled in. Deviating from it either
destroys evidence that can only be captured once, or puts two agents in the same function body.

**PHASE 0 — clean tree, live, ONE dev-server session, no code written.**
The user starts the dev server and `veent-db-5434` (both are up as of 18-08-26). Then, in order:
1. This plan's **step 1** — the D10 live probe (`ZZ-D10-PROBE`) and its period-void negative control
   (`ZZ-D10-PROBE-2`). Void as `admin@veent.ph`. Record the four post-void numbers.
2. This plan's **step 2** — write the verdict into the report. THIS BRANCHES EVERYTHING BELOW.
3. This plan's **step 12a** — the "before" `PAYDATE:` capture on **`ZZ-D12-PROBE`** (locked, never
   approved). **This is the ONLY window in which 12a can ever be executed**, and this period is the
   ONLY one that can carry it.
4. `payroll-void-audit-298`'s **L1–L5 "before" pass** on `ZZ-298-PROBE`, and its **L7-before**,
   which is item 3's result CITED, not re-run. `ZZ-298-PROBE` cannot serve as the L7 sample — its
   run is approved at L2.
5. `clearance-signoff-297`'s **L0–L4 "before" pass** including L2b–L2e (its L2 and L4 must SUCCEED
   here — that is what proves its harness can observe the difference).

**PHASE 1 — `payroll-void-audit-298`, steps 1–13, in order.** Owns `prisma/schema.prisma`,
`periods.ts` (lock / release / voidPeriod's audit call), `runs.ts` (voidRun's audit call), both
audit-log page arrays, the count script. Nothing from this plan may run concurrently.

**PHASE 2 — this plan, steps 3–8, ONLY IF step 1 reproduced.** Both touch files Phase 1 just
edited. Verify with `git log --oneline` that Phase 1 landed before starting. Edit E1 to
`override-finalized-guard.test.ts` lands here, in the same commit as step 8.

**PHASE 3 — this plan, step 9 (the doc).** Runs whether or not step 1 reproduced.

**PHASE 4 — this plan, steps 10–11 (the sweep and the regression fence).** Step 11 is only
meaningful AFTER Phase 1 step 8 removed the `lock()` approver write, and defers to the sibling's
`tests/unit/payroll-period-actors.test.ts` if that assertion is already there.

**PHASE 5 — this plan, steps 12b / 12c / 12e.** The "after" PAYDATE pair, the approved-run control,
and the Finance hand-off note. Must be after Phase 1 step 8. This phase owns the PAYDATE "after"
capture; `payroll-void-audit-298`'s L7-after cites it rather than repeating it.

**PHASE 6 — the "after" live passes and every mutation row** for both payroll plans. Note that
`override-finalized-guard.test.ts` now carries edit E1: `payroll-void-audit-298`'s "green with zero
edits" criterion is scoped to Phase 1 and must NOT be read as violated here.

**INDEPENDENT TRACK — `clearance-signoff-297`.** Disjoint file set (`separation.ts`, both
`/separations/[id]` route files, three new `separation-*` test files). No shared file with either
payroll plan and no schema overlap. It may run in parallel with any phase above.

## Autonomous Goal Block

```
SESSION GOAL
Execute process/general-plans/active/void-semantics-and-sweep_PLAN_18-08-26.md in its assigned
slot. It carries SPEC D10 (the void-run / void-period divergence, gated on a live probe), D11 (the
who-approved sweep, already clean — enumeration only, no code), and D12 (the payslip PAYDATE
before/after sample plus the Finance note). Gate is CONDITIONAL; the three FAILs from the first
VALIDATE pass are verified fixed.

AUTONOMY RULES
- Follow the Implementation Checklist in order. Step 1 gates steps 3-8 completely; step 9 (the doc)
  runs either way.
- Apply these six execute-agent instructions from the contract:
  E1 apply the $transaction mock key to override-finalized-guard.test.ts in the same commit as
     step 8; add nothing else; paste the git diff of that file into the report.
  E2 create amortization.ts with `import { D, sum } from './money'` and
     `import type { Prisma } from '@prisma/client'`, and REMOVE `sum` from periods.ts:6 — :337 is
     its only use and it moves. Skipping this turns pnpm lint red. Keep the `D` import.
  E3 the Super Admin in step 1 is admin@veent.ph — the only OVERRIDE_FINALIZED holder in the
     database. Nobody else can void anything.
  E4 the shared 12a / sibling-L7-before capture is taken on ZZ-D12-PROBE only. The sibling's
     ZZ-298-PROBE has an APPROVED run and cannot carry it.
  E5 step 5: the void branch DOES have a try/catch (around requireAnyCapability, +server.ts:67-71).
     The unwrapped part is the voidRun call at :73-77. Wrap that one.
  E6 every live probe builds its own period. Zero payroll_periods exist and both payroll_runs have
     a NULL periodId — no existing run is reusable.
- Record the ACTUAL result of every mutation row M1-M11, including M6's and M8's "nothing went red".
- Record L7's three cash-advance figures as pesos, and state in the report that this plan widens the
  over-credit's reach onto a path that leaves the period LOCKED.

EXECUTION ORDER — binding, do not deviate:
PHASE 0 clean tree, live, one dev-server session: this plan's step 1 probe + step 2 verdict, then
  step 12a on ZZ-D12-PROBE (the ONLY window), then payroll-void-audit-298's L1-L5 before (L7-before
  is 12a's result cited, not re-run), then clearance-signoff-297's L0-L4 before.
PHASE 1 payroll-void-audit-298 steps 1-13 in order.
PHASE 2 this plan steps 3-8, ONLY if step 1 reproduced. E1 lands here.
PHASE 3 this plan step 9 (the doc) — runs either way.
PHASE 4 this plan steps 10-11.
PHASE 5 this plan steps 12b/12c/12e.
PHASE 6 both "after" live passes and every mutation row. override-finalized-guard.test.ts now
  carries E1 — the sibling's "zero edits" criterion was scoped to Phase 1.
clearance-signoff-297 runs on an independent track and may go in parallel at any time.

HARD STOPS
- Ask the user to start the dev server and the veent-db-5434 container. Never start either
  yourself. Both are currently UP.
- Do not mutate the database outside the ZZ- marker periods, and clean them up or say why not.
- Step 1 is an absolute gate. If it does not reproduce, steps 3-8 are cancelled — do NOT build a
  fix for a defect that did not reproduce (SPEC constraint 12). Step 9 still runs.
- Do NOT touch separation.ts or prisma/schema.prisma. Confirm with git diff --name-only.
- Do NOT fix the cash-advance over-credit. Measure it, comment it, report it.
- Do not file any GitHub issue. No Co-Authored-By trailer. Commit nothing without owner approval.

NEXT PHASE
EXECUTE, in the PHASE 0 / PHASE 2-5 slots above.

CONTRACT SUMMARY
Gate CONDITIONAL. 0 FAILs, 4 new CONCERNs (all covered by E2-E5), 5 known-gaps. F1, F2 and F3 were
each re-verified against the live source: E1 alone makes the guard test pass, periods.ts:316-361 is
exactly the if-body and is brace-balanced, and run.period?.status typechecks against
`period PayrollPeriod?`. The D10 design is unchanged and sound.

EXECUTE START COMMAND
ENTER EXECUTE MODE for process/general-plans/active/void-semantics-and-sweep_PLAN_18-08-26.md
```
