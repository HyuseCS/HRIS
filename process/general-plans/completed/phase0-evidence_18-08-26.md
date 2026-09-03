---
name: evidence:phase0-298-297
description: "Phase 0 live captures for #298/#297 — the AC-7.1 D10 gate result and the AC-10.1 PAYDATE before-sample, both taken before lock() was touched"
date: 18-08-26
feature: general-plans
spec: process/general-plans/active/separation-of-duties-298-297_SPEC_17-08-26.md
---

# Phase 0 evidence — taken 18-08-26, at `73fd0fd`

Two captures that could only be taken **before** #298 changes what `lock()` writes.
Both are recorded results, not intentions.

---

## AC-7.1 — the D10 gate: **REPRODUCES**

**Steps 3–8 of `void-semantics-and-sweep_PLAN_18-08-26.md` are LIVE, not cancelled.**

Until now the D10 divergence was confirmed by reading the code and had never been run.
It has now been run, through the real service path over HTTP, with a negative control.

Harness: `scripts/probe-d10-void-divergence.ts` (seed / report / cleanup). Lock and void
happen over HTTP between `seed` and `report`, so the real `lock()` and `voidRun()` execute —
the script never re-implements them.

**Why the probe seeds rather than using import → generate.** The first attempt went through
the normal flow and proved nothing: the seeded employees have no attendance, so every entry
lands fully absent, net pay goes negative (an `UNRECOVERED` line of -148,092.50 across 34
entries), and **no amortization line is ever scheduled**. Balances did not move at lock, so
there was nothing for the void to fail to reverse. That is an INCONCLUSIVE probe, not a
passing one, and it must not be read as "the divergence does not reproduce". The e2e spec
`tests/e2e/payroll-lock-idempotency.spec.ts` seeds directly for exactly this reason.

### The result

Same seed, same lock, two different voids:

| | after lock | **void the RUN** | **void the PERIOD** (control) |
|---|---|---|---|
| `payroll_periods.status` | LOCKED | **LOCKED** | VOIDED |
| `payroll_runs.status` | COMPUTED | VOIDED | VOIDED |
| `loans.balance` | 750 | **750** | 1000 |
| `loan_payments` rows | 1 | **1** | 0 |
| `cash_advances.balance` | 500 | **500** | 800 |

Loan principal 1000 / installment 250. Cash advance 800 / installment 300.

**Voiding a run leaves ₱250 of loan and ₱300 of cash advance deducted from an employee for a
payroll that no longer exists, against a period that still reads LOCKED — so nothing on screen
says the payroll is dead.** Voiding the period reverses all of it. Both voids need the same
capability and the same person can do either.

The control is what makes this a finding rather than an observation: the reversal logic exists
and works. It is simply never reached by the run path.

### One more thing the probe settled

**A run void has no UI button.** It is API-only — `POST /api/v1/payroll/[id]?action=void`.
Every step in any plan that says "click void" on a *run* is wrong; the period void is the one
with a button.

---

## AC-10.1 — the PAYDATE before-sample: **CAPTURED**

This was the one-way window. Once #298 step 8 stops `lock()` writing `approvedAt`, this sample
becomes unrecoverable.

Period `ZZ-D12-PROBE`, 2026-08-01 → 2026-08-15. Opened, imported, generated, **locked, and
never approved**, then released so the payslip renders.

```
period.status = RELEASED      run.status = COMPUTED   ← never approved
run.approvedById = admin@veent.ph's user id
run.approvedAt   = 2026-08-18 02:11:17     ← this is the LOCK time
```

That row is the D2 ambiguity caught in the act: the run was never approved, yet it carries an
`approvedById` and an `approvedAt`, because `lock()` wrote them.

**Rendered payslip PDF, 3,927 bytes:**

```
PAYDATE:

8/18/26
```

**8/18/26 is the lock date.**

> **Correction, later the same day.** The forecast that once stood here — "falls through to the
> period end, so it will print 8/15/26" — describes a state that never shipped. HR then ruled that
> **PAYDATE is the day the payslip was released**, so `assemblePayslipDocument()` reads
> `run.releasedAt` and prints **blank** when there is none. The 8/15/26 after-sample recorded lower
> down was taken against the interim behaviour and is history, not the contract. Do not quote
> either number as current. Authority: `docs/finance-note-paydate-change.md`.

The PDF is at `phase0-evidence/d12-payslip-BEFORE.pdf` in the session scratchpad. Re-take the
after-sample on an identically shaped period once #298 lands (AC-10.2 also needs an *approved*
run to show its PAYDATE does **not** move).

**AC-10.3 is still outstanding**: Finance has not yet been told the printed date moves on
locked-but-never-approved payslips. That is due before the change ships.

---

## AC-10.3 — the note for Finance

> **SUPERSEDED, and it was never sent.** The draft below describes PAYDATE moving to the **period
> end**, which is not what shipped. HR's rule — PAYDATE is the day the payslip was released —
> replaced it hours later, and the owner took the question to HR rather than Finance, which
> satisfied AC-10.3 by a different route. The live note of record is
> `docs/finance-note-paydate-change.md`; **that** one is closed, not pending. The draft is kept only
> as a record of what was believed at the time. Do not send it.

> **Heads-up: one date on some payslips will change.**
>
> **What changes.** On a payslip for a payroll that was **locked but never formally approved**,
> the `PAYDATE:` line currently shows the date somebody locked the payroll. After this update it
> shows the **last day of the pay period** instead.
>
> **A real example from our test system.** The same payslip, for the 1–15 August period:
> before, `PAYDATE: 8/18/26` (the day it was locked). After, `PAYDATE: 8/15/26` (the period end).
>
> **What does NOT change.** Payslips for payrolls that *were* approved are untouched. No amount,
> no deduction, no net pay changes anywhere. Nothing is recalculated, and no payslip already
> issued is altered — this affects how the date is worked out from now on.
>
> **Why we are doing it.** That date field was being filled in by two different steps, so it
> meant two different things depending on how the payroll was processed. It now means one thing.
> The same fix is what lets us record who locked and who released a payroll, which we could not
> tell apart before.
>
> **What we need from you.** Tell us if any external filing, remittance or report keys off that
> date for unapproved payrolls. If it does, say so before this goes live.

Evidence for the example: `d12-payslip-BEFORE.pdf` in this directory, and the AC-10.1 section
above.

---

## #298 before-state — the negative control

Three facts recorded before anything changed. Each is the "before" half that makes the
matching "after" assertion mean something.

**1. `PayrollPeriod` records no actor at all.**

```
lockedAt     timestamp   ← when
releasedAt   timestamp   ← when
                         ← there is no lockedById, no releasedById, no actor column of any kind
```

This is the schema's only timestamp pair with no companion actor, and it is why `lock()`
borrowed the neighbouring model's `approvedById` — it had nowhere else to write. D2 closes it.

**2. A payroll void is invisible in the audit log today.**

| action | entityType | rows |
|---|---|---|
| CREATE | PayrollPeriod | 3 |
| UPDATE | PayrollPeriod | 26 |
| PAYROLL_OVERRIDE | PayrollPeriod | 4 |
| CREATE | PayrollRun | 20 |
| **UPDATE** | **PayrollRun** | **56** |

The run void fired during this Phase 0 is in that bottom row — logged as a plain `UPDATE`,
indistinguishable from 55 other ordinary edits. A reviewer filtering the audit screen for
overrides cannot find it, which is precisely the hole D1 exists to close.

**3. The `AuditAction` enum has eight values and `PAYROLL_VOID` is not among them.**

```
CREATE  UPDATE  DELETE  VIEW  LOGIN  LOGIN_FAILED  PAYROLL_OVERRIDE  LEAVE_OVERRIDE
```

`PAYROLL_OVERRIDE` and `LEAVE_OVERRIDE` are the in-repo precedent D1 follows. Note this is an
enum **addition**, not a rename — `db push` handles it, and the `ALTER TYPE … RENAME VALUE`
migration dance the repo needs for renames does not apply here.

---

## Housekeeping

All probe data removed: 0 `ZZ-%` periods remain, and the seeded loans and cash advances are
back at their original balances. The `#297` live pass earlier the same day was cleaned up
separately — 0 separation records, both HR logins re-activated, no employee left offboarded.

---

# AFTER-STATE PASS — 18-08-26, at `adfa1ca` + the marker fix

Run after the dev server was restarted. (The server had loaded `@prisma/client` at boot, before
the #298 schema push regenerated it, so every lock and void returned Internal Error until it was
restarted. Not a code defect — the DB had the columns, the generated client had 39 references to
`lockedById`, and a fresh process ran the identical `updateMany` successfully. Worth knowing:
`pnpm test` was 1492 green throughout.)

## AC-7.2 — a run void now reverses the amortization

The exact scenario that proved the bug, re-run against the fix:

| | after lock | **void the RUN — before the fix** | **void the RUN — after** |
|---|---|---|---|
| period status | LOCKED | LOCKED | LOCKED |
| run status | COMPUTED | VOIDED | VOIDED |
| loan balance | 750 | **750** | **1000** |
| loan_payments | 1 | **1** | **0** |
| cash advance | 500 | **500** | **800** |

The period stays LOCKED by design — a run void is not a period void.

## AC-7.3 — an already-voided run is refused

`{"error":"Payroll run is already voided"}`, HTTP 400. Before the change it voided again silently,
which would have credited the amortization back a second time.

## L7 — the cash-advance over-credit, MEASURED

The fence the plan chose to keep rather than fix. To make it fire, the live balance must sit below
the frozen deduction line so `lock()` has to cap the payment:

```
frozen deduction line = 300
CA before lock : 100.00 / ACTIVE
CA after lock  :   0.00 / PAID      ← lock applied min(300, 100) = 100
CA after void  : 300.00 / ACTIVE    ← void credited back the raw frozen 300
```

**Over-credit = ₱200.** The employee owed 100, repaid it in full, and the void left them owing 300.
The loan branch does not do this — it reverses the real `loan_payments` rows. Cash advances have no
payment ledger to reverse, which is why fixing it is a schema decision nobody has been asked for.

**This commit widens the defect's reach**: it previously fired only via `voidPeriod`, which also
flips the period to VOIDED so the payroll is visibly dead. It now also fires via `voidRun`, which
deliberately leaves the period LOCKED. Documented, measured, not fixed.

## AC-10.2 / D12 — the PAYDATE after-sample

Same shape as the before-sample: locked, never approved, released.

| | period | rendered `PAYDATE:` | what it is |
|---|---|---|---|
| BEFORE (`ZZ-D12-PROBE`) | 1–15 Aug | **8/18/26** | the lock date |
| AFTER (`ZZ-D12-PROBE-2`) | 1–15 Nov | **11/15/26** | the period end |

The after-run also shows D2 working: `lockedById` recorded, `approvedById` and `approvedAt` both
NULL on a run that was never approved. Before this work that row carried the locker's id and the
lock timestamp in the approver's field.

## L6 — the audit-log dropdowns (M10 and M11's only gate)

M10 and M11 were pre-declared as catching nothing: a DB-mocking suite cannot see a hardcoded array.
Checked in a real browser as Super Admin at `/reports/audit-log`:

- `select[name=action]` → `… PAYROLL_OVERRIDE, LEAVE_OVERRIDE, **PAYROLL_VOID**`
- `select[name=entity]` → `… PayrollRun, **PayrollPeriod**, JobPosting, …`

Filtering on `PAYROLL_VOID` returns only void rows, each naming the actor:

```
Aug 18, 2026, 11:02 | admin@veent.ph SUPER_ADMIN | PAYROLL_VOID | PayrollRun
Aug 18, 2026, 10:56 | admin@veent.ph SUPER_ADMIN | PAYROLL_VOID | PayrollPeriod
Aug 18, 2026, 10:55 | admin@veent.ph SUPER_ADMIN | PAYROLL_VOID | PayrollRun
Aug 18, 2026, 10:54 | admin@veent.ph SUPER_ADMIN | PAYROLL_VOID | PayrollRun
```

That is AC-1.1 proven live: a void is now findable by someone who does not already know what to
look for. Before this work it was a plain `UPDATE`, one of 56.

## A defect this pass found — the same-actor marker missed its commonest case

Voiding a run marked `sameActorAsApprover` **absent** even when the voider had locked the period
themselves. `voidRun` called `voidedOwnApproval(ctx.actorId, run)` without the period, and since
#298 stopped `lock()` writing `approvedById`, a locked-but-never-approved run has a null approver —
so checking the run alone can never match. The unit tests covered the locker arm for `voidPeriod`
and never for `voidRun`, which is precisely how it slipped through.

Fixed by passing `run.period`, which was already loaded. Mutation-checked: reverting the fix
reddens exactly the new test and nothing else. Confirmed live — the same admin locking then voiding
now records `sameActorAsApprover = t`.

## Housekeeping

0 `ZZ-%` periods, 0 separation records, seeded loan and cash-advance balances back at their
original values.
