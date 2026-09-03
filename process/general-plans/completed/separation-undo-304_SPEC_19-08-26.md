---
name: spec:separation-undo-304
description: "SPEC (scoping) for #304 — no way to undo a finalized separation. Fact base verified against staging @ 57a11ee; all five decisions answered and LOCKED in §4."
date: 19-08-26
status: SHIPPED — planned, built and verified live; PR #314 merged to staging and #304 closed 19-08-26
issue: 304
branch: spec/separation-undo-304
---

# SPEC — #304 Undo a finalized separation

**Status: SHIPPED.** All five decisions were answered by the owner on 19-08-26 and are locked in
§4. The plan that followed is `separation-undo-304_PLAN_19-08-26.md` in this same folder; it was
built, verified live 22/22, merged as PR #314 and #304 was closed by hand on 19-08-26.

## 1. The headline finding, and it changes the issue

**A pure undo is impossible for any separation already finalized.** The issue says per-loan detail
"survives only inside a JSON blob". Against the code that is optimistic: the blob is
**aggregate-only**.

`finalizeSeparation` zeroes the money with two blanket writes and no per-row read
(`src/lib/server/services/separation.ts:339-346`):

```ts
tx.loan.updateMany({ where: { employeeId, status: 'ACTIVE' }, data: { balance: 0, status: 'PAID' } })
tx.cashAdvance.updateMany({ … same … })
```

`SeparationRecord.finalPayBreakdown` (`prisma/schema.prisma:986`) holds a `FinalPayResult` —
`{ lines: {label, amount}[], total }` — and `computeFinalPay` emits exactly three lines
(`separation.ts:286-290`): leave conversion, `-loanBalance` **summed**, `-caBalance` **summed**.
No loan ids. No per-row amounts.

**Consequence:** with two active loans of ₱3,000 and ₱7,000, the record proves ₱10,000 was written
off and cannot say how to split it back. Restoring per-loan balances for an existing record needs a
human to re-key the figures from outside the system.

This splits the work in two, and the split is not optional:

- **(A) Make future finalizes reversible** — capture per-row state at finalize time.
- **(B) Undo a separation** — the flow itself, which can only be complete for records finalized
  after (A) ships.

Records finalized **before** (A) are a **backfill decision** (§4, D-4), not a code problem.

## 2. Verified fact base (staging @ `57a11ee`)

### What finalize writes — `separation.ts:297-366`

Guards, then one `$transaction` (`:312-356`):

| # | Write | Site |
|---|---|---|
| 1 | `SeparationRecord` → `FINALIZED`, `finalPayAmount`, `finalPayBreakdown`, `finalizedAt`, `finalizedById`, via compare-and-set `updateMany` + 409 on `count===0` | `:325-335` |
| 2 | every `ACTIVE` `Loan` → `balance: 0, status: 'PAID'` | `:339-342` |
| 3 | every `ACTIVE` `CashAdvance` → `balance: 0, status: 'PAID'` | `:343-346` |
| 4 | `Employee` → `employmentStatus: 'OFFBOARDED'`, `endDate` | `:348-351` |
| 5 | `User` → `isActive: false` | `:352-355` |

`computeFinalPay` runs **outside** the tx (`:310`). The audit entry is written **outside** it too
(`:358-363`) — payroll void writes its audit **inside** (`runs.ts:129-147`). That asymmetry is a
choice this work should settle.

### What has no reverse path anywhere

- **No `isActive: true` writer exists in `src/lib/server`.** Nothing can re-enable a login.
- **No rehire / reactivate / un-offboard function exists.** `OFFBOARDED` is written at
  `separation.ts:350` and `employees.ts:1223`, and never unwritten.
- The v1 employees API **refuses** `employmentStatus` edits with a 400
  (`src/routes/api/v1/employees/[id]/+server.ts:138-143`), and its comment at `:131-137` already
  names the reason: *"writing it back to ACTIVE leaves a reactivated one locked out."*
  **The gap is known and documented in the code.**
- `SeparationStatus` is `{ OPEN, CLEARED, FINALIZED }` (`schema.prisma:954-958`) — **no `VOIDED`**,
  where both `PayrollRunStatus` and `PayrollPeriodStatus` have one. `AuditAction`
  (`schema.prisma:194-207`) has `PAYROLL_VOID` and no separation equivalent.

### The prior art to copy — payroll void

`voidRun` (`payroll/runs.ts:95-152`) and `voidPeriod` (`periods.ts:335-373`) share one shape:

1. `requireAnyCapability(ctx.actorRoles, 'OVERRIDE_FINALIZED')` **in the service**, not the route.
2. 404 if absent; **precondition refusal** — already-`VOIDED` → 400.
3. One `$transaction` opening with a **compare-and-set claim**
   (`updateMany({ where: { id, status: { not: 'VOIDED' } } })` → 400 on `count===0`).
4. The reversal.
5. `writeAuditLog(..., tx)` **inside** the transaction, with `oldValue` and a detect-don't-block
   marker (`voidedOwnApproval`, `payroll/audit-markers.ts:10-17`).

`reverseAmortization` (`payroll/amortization.ts:22-94`) is the money half, and **its whole design
rests on a thing separations do not have**: it reverses from the **payment ledger rows**
(`LoanPayment`, `CashAdvancePayment`), never the frozen deduction line. It restores with a
conditional `updateMany({ where: { id, balance: <the value it read> } })` and 409s
*"…changed while voiding — nothing was reversed, retry"* on a mismatch; it only reopens to `ACTIVE`
if the restored balance `> 0`; then it deletes the payment rows.

**Those ledgers are written only at payroll period lock** (`periods.ts:206-208`, `:240-242`).
`finalizeSeparation` writes **no** payment rows. So the ledger holds nothing about a separation
write-off, and `reverseAmortization` cannot be reused as-is.

`docs/payroll-void-semantics.md` states plainly: **"No un-void."** Whatever is decided here should
not contradict that doc's stance without saying so.

### The guards as they stand

- `OVERRIDE_FINALIZED: ['SUPER_ADMIN']` — `src/lib/rbac.ts:73`. Ten call sites across payroll and
  attendance; **zero in separations** — the issue's claim is confirmed.
- Both separation routes gate on `MANAGE_HR` only (`(app)/separations/+page.server.ts:10,37`;
  `[id]/+page.server.ts:15,35,60`).
- #297 shipped `finalizeBarFor` (`separation.ts:142-163`): an actor may not finalize their **own**
  separation (`:155-157`) nor one where they **cleared any item** (`:159-161`), re-checked **inside**
  the transaction so it cannot be raced (`:317-321`), and mirrored in the UI
  (`[id]/+page.svelte:190`).
- **There is no `/api/v1/separations` endpoint.** The only finalize surface is the form action at
  `(app)/separations/[id]/+page.server.ts:58-77`. One door, not two — no twin-door risk here, and
  that is worth keeping.

### Test coverage that exists (PR #312)

Nine `tests/unit/separation-*.test.ts` files, including `separation-finalize-effects.test.ts`
(`:75` race refusal, `:91` the zeroing + offboard + deactivate) and `separation-finalize-sod.test.ts`
(the #297 guard suite). **`tests/e2e/separations.spec.ts` has no finalize test** — only list access
and an employee refusal.

## 3. Scope boundary

**In:** undoing or amending a finalized separation; restoring what it wrote; who may do it; the
audit trail for it; capturing enough state at finalize to make the restore honest.

**Out, unless a decision below pulls it in:** a general rehire/reactivate feature; editing
`employmentStatus` through the employees API (`+server.ts:138-143` stays refused); changing what
`computeFinalPay` computes; any change to the #297 separation-of-duties bars.

## 3b. CONSTRAINT — re-opening clearance must not launder the #297 bar

**Owner input, 19-08-26: the undo re-opens clearance only when needed — it is the operator's choice
at undo time, not a fixed behaviour.** Two different failures need two different undos:

| What went wrong | Clearance items | Why |
|---|---|---|
| Wrong figures, wrong date, wrong leaver | **keep CLEARED** | the clearance was correct; only the finalize was not |
| An item should never have been ticked | **re-open to PENDING** | the clearance itself is the error |

This is a per-undo choice made by the person undoing, **not** an org setting or a config file — the
right answer depends on the incident, so it cannot be decided once in advance.

**The risk it opens, and it is not optional to answer.** `clearedAnyItem` keys on
`status === 'CLEARED' && clearedById === actorId` (`separation.ts:128-130`), and the comment above it
states the property outright: *"Un-cleared items carry a null clearedById, so a re-opened item stops
barring its clearer."* That is deliberate, and #297/D8 keeps it safe — `setClearanceItem` 403s if the
item was cleared by somebody else (`separation.ts:190-194`), whose own comment names the two-step
defeat it closes: *"B un-ticks A's item, re-ticks it, becomes the clearer, and can wipe their own bar
the same way."*

**A bulk re-open during undo nulls every `clearedById` in one privileged call, and every #297 bar on
that case evaporates.** D8 guards the per-item door; it cannot guard a reset that goes around it.
Same laundering shape as #299 — a sign-off cleared, then laundered by a legitimate-looking action.

**So the re-open branch must preserve who cleared what**, and that needs a decision (D-5). Nulling
`clearedById` is exactly what must not happen here, even though it is what the ordinary un-clear
path does and should keep doing.

## 3c. NON-NEGOTIABLE — the undo writes `oldValue`, inside the transaction

**Owner decision, 19-08-26. Not a decision option; a requirement on whatever is built.**

Finalize's audit entry today records `newValue` only — `{ status: 'FINALIZED', finalPayAmount }` —
and is written **outside** the transaction (`separation.ts:358-363`). `writeAuditLog` already accepts
an `oldValue` and a transaction client (`audit.ts:21-42`); finalize simply does not pass either.
Payroll void does both (`runs.ts:129-147`).

So the state that finalize destroyed is not recoverable from the audit log either. The undo must not
repeat that.

**The undo's audit entry must:**

1. be written **inside** the same `$transaction` as the reversal, so the trail commits or rolls back
   with the money — the reason `writeAuditLog` takes a client argument at all (`audit.ts:19-21`);
2. carry an `oldValue` holding the pre-undo state: the clearance-item clearer set, the loan and
   cash-advance balances and statuses being restored, `finalizedById` / `finalizedAt`, and the
   employee's `employmentStatus` and `User.isActive`;
3. record whether the clearance items were re-opened (§3b), because that is the branch that changes
   who may finalize next;
4. carry a detect-don't-block marker when the undoer is the finalizer, in the shape of
   `voidedOwnApproval` (`payroll/audit-markers.ts:10-17`) — see D-3.

**This holds whichever way D-5 is answered.** The trail and the guard are separate concerns; D-5
only decides where the *guard* reads the clearer set from.

Open, and smaller: `AuditAction` has `PAYROLL_VOID` but no separation equivalent
(`schema.prisma:194-207`), and finalize itself uses the generic `UPDATE`. Whether the undo adds a
named action value is a plan-level call, not a decision here.

## 4. THE DECISIONS — all LOCKED 19-08-26

Answered by the owner. Each records the option chosen and what it rules out.

### D-1 Undo, or amend-and-recompute?

**LOCKED: (a) Undo — the record returns to `CLEARED`.**

Reverse all five finalize writes and put the record back in the clearance flow; HR corrects the
inputs and finalizes again. Copies the payroll-void shape (`runs.ts:95-152`), so it inherits the
compare-and-set status claim and the in-transaction audit rather than inventing a second undo idiom.

**Ruled out:** amend-in-place. It would have needed a correction-record model that does not exist and
would have left the loan balances zeroed.

### D-2 Who may undo?

**LOCKED: (a) `OVERRIDE_FINALIZED` — SUPER_ADMIN (`rbac.ts:73`).**

Checked **in the service**, not only the route, matching `voidRun` (`runs.ts:97`) and `voidPeriod`
(`periods.ts:338`). This is also the fix for the issue's own complaint that `OVERRIDE_FINALIZED` is
not wired to separations at all — it becomes its eleventh call site and its first outside
payroll/attendance.

**Ruled out:** a new capability. No new table entry, no new role-grant question (#282's lesson).

### D-3 Does the undo itself need a second person?

**LOCKED: (a) Allow, and stamp the audit entry — detect-don't-block.**

The undoer may be the finalizer. When they are, the audit entry carries a marker in the shape of
`voidedOwnApproval` (`payroll/audit-markers.ts:10-17`) — conditional-spread, so the key is absent on
an ordinary undo. Recorded by §3c item 4.

**Ruled out:** a hard bar. It would deadlock any tenant with one SUPER_ADMIN, which is the very
situation #304 is about. Note the asymmetry with #297, which *does* hard-bar the clearer from
finalizing: finalize has an alternative actor, an undo may not.

### D-4 What happens to separations finalized BEFORE the fix?

**LOCKED: (b) Restore what we can, and surface the aggregate.**

Status, offboard and login reverse normally. The money cannot: the per-loan split is gone (§1). So
the undo shows the aggregate written-off figure from `finalPayBreakdown` and marks the record
**partially restored**, for a human to re-key the split.

**Ruled out:** blocking undo on pre-fix records, which would leave the exact finalizes
that prompted #304 unfixable; and silent restoration, which would look like a full undo while the write-off
survived.

**This makes the "partially restored" state a first-class thing the UI must show**, not a footnote.

### D-5 If the undo re-opens clearance, how is the #297 bar preserved? (opened by owner input, §3b)

**LOCKED: (a) Keep `clearedById` on the re-opened item.**

The re-open branch flips `status` to `PENDING` and **leaves `clearedById` in place**;
`clearedAnyItem` (`separation.ts:128-130`) is widened to bar on `clearedById` regardless of status.
No schema change, one helper, one meaning — and the item keeps its own history ("cleared by Maria,
now re-opened") rather than moving it to the parent.

**Ruled out:** a new column on `SeparationRecord`. It would have left #297's helper untouched, but at
the cost of computing the bar in two places — the drift `finalizeBarFor` was written to prevent —
while still nulling the item's own `clearedById`.

**Consequences to carry into PLAN, both non-optional:**
1. `clearedAnyItem`'s meaning changes, so the #297 suite
   (`tests/unit/separation-finalize-sod.test.ts`) moves with it. The re-opened-item case must be
   re-pinned, not deleted.
2. The comment at `separation.ts:127` — *"a re-opened item stops barring its clearer"* — becomes
   false and must be rewritten, not left to rot.
3. The **ordinary** un-clear path (`setClearanceItem`) keeps nulling `clearedById` and keeps
   un-barring. Only the undo's re-open branch preserves it. If both paths converge on one helper,
   that difference has to be explicit.

## 5. What the answers add up to

A separation undo that is the **payroll-void shape applied to separations**: service-level
`OVERRIDE_FINALIZED`, a precondition refusal, one transaction opening with a compare-and-set claim
on `status`, the reversal, and the audit entry written inside it. Everything the repo already ships
for payroll void, reused rather than re-invented.

Two things are **not** inherited, because separations do not have them:
- **No payment ledger to reverse from.** `reverseAmortization` restores balances from `LoanPayment` /
  `CashAdvancePayment` rows (`amortization.ts:43-47`, `:70-74`). Finalize writes none. This is §1,
  and it is the biggest single piece of work.
- **No `VOIDED` status on `SeparationStatus`**, where payroll runs and periods both have one.

## 6. Open for PLAN — not decisions, but calls PLAN must make

1. ~~All five decisions answered.~~ **Done, 19-08-26.**
2. ~~**How finalize captures per-row loan/advance state**… the strongest candidate is the ledger,
   because it makes the existing reversal code the undo.~~
   **ANSWERED BY PLAN, 19-08-26 — and this SPEC's recommendation was WRONG. See
   `separation-undo-304_PLAN_19-08-26.md`.** The ledger cannot make `reverseAmortization` reusable:
   that function takes `(tx, runId)` and drives its entire loop off
   `tx.payrollEntry.findMany({ where: { payrollRunId: runId } })` → `entry.deductions`
   (`amortization.ts:22-31`, verified). A separation write-off has no run, no entry and no deduction
   line, so the loop would iterate nothing. Reuse would mean rewriting the driver — a new function
   wearing an old name.
   Worse, `LoanPayment.payrollEntryId` is nullable and NULL rows stay distinct by design, for
   **manual off-payroll payments** (`schema.prisma:1863-1875`). A write-off row would be
   indistinguishable from a real payment, so the undo's cleanup could delete genuine ones. Telling
   them apart needs a new `separationId` column on **both** ledger tables — so the ledger costs more
   schema, not less — and a forgiven debt is not a payment, so it corrupts a ledger the payroll void
   path trusts.
   **PLAN chose a `SeparationRecord.preFinalizeState Json?` snapshot instead**, which is also the
   only option that can hold `employmentStatus`, `endDate` and `User.isActive` — the ledger cannot
   carry those at all, so the ledger would have needed the snapshot as well. `preFinalizeState IS
   NULL` doubles as the D-4 pre-fix detector for free.
3. Whether `SeparationStatus` gains a value or the undo returns to `CLEARED` as-is (D-1 says
   `CLEARED`; PLAN confirms nothing else keys on it).
4. Whether `AuditAction` gains a separation-void value or the undo uses the generic `UPDATE`.
5. Whether `docs/payroll-void-semantics.md`'s "No un-void" line needs a companion statement, so the
   two undo stories in this repo do not read as contradictory.
6. The finalize E2E gap: `tests/e2e/separations.spec.ts` covers list access and an employee refusal
   only — there is no finalize test to extend.
