---
name: plan:separation-undo-304
description: "PLAN for #304 — undo a finalized separation. Payroll-void shape applied to separations, plus a pre-finalize state snapshot so future undos are honest. Both owner decisions LOCKED 19-08-26; VALIDATE findings B-1..B-5 closed in revision 2; N-1..N-3 closed in revision 3; B-6 corrected at EXECUTE."
date: 19-08-26
issue: 304
branch: spec/separation-undo-304
spec: process/general-plans/completed/separation-undo-304_SPEC_19-08-26.md
complexity: COMPLEX
status: SHIPPED — PR #314 merged to staging and #304 closed by hand on 19-08-26. Verified live 22/22 in a driven browser; a post-merge review pass added one more commit (the undo audit vs the login write).
---

# PLAN — #304 Undo a finalized separation

**Date**: 19-08-26
**Status**: SHIPPED (PR #314 merged, #304 closed 19-08-26; rev 3 + V3's B-6 correction) — both owner decisions LOCKED, B-1..B-5 and N-1..N-3 closed, V3 gated CONDITIONAL-GO. Executed in six commits C1..C6.
**Complexity**: COMPLEX
**Issue**: #304 · **SPEC:** `process/general-plans/completed/separation-undo-304_SPEC_19-08-26.md`
**Context loaded**: `process/context/all-context.md` routing table plus the SPEC's cited source files; testing context per `process/context/tests/all-tests.md` (its recorded vacuous-mock failure mode drives every projection assertion below). Post-phase testing runs the four gates in the DONE definition.


**TL;DR.** Six commits. Finalize starts writing a `preFinalizeState` JSON snapshot (one new
nullable column, additive, `db push`-safe); undo reads it back inside one transaction with a
compare-and-set claim, service-level `OVERRIDE_FINALIZED`, and an audit entry carrying `oldValue`
written inside the tx. Records finalized before the snapshot existed restore status/offboard/login
and show a "partially restored" banner with the aggregate write-off. **Both owner decisions are now
LOCKED (19-08-26): snapshot over ledger, and B-2 fix option (b) — a second additive nullable column
`ClearanceItem.previouslyClearedById`. Two new columns, both in C1, both `db push`-safe.**

---

## OWNER DECISIONS — BOTH LOCKED 19-08-26

### Decision 1 (LOCKED 19-08-26): reject the payment-ledger option; snapshot per-row state on `SeparationRecord`.

**Status: CONFIRMED by the owner on 19-08-26.** The payment-ledger option is REJECTED and CLOSED.
It is not an open question anywhere in this plan. The reasoning that produced the call is kept below
as the design record.

SPEC §6.2 named the payment ledger "the strongest candidate" because reusing `LoanPayment` /
`CashAdvancePayment` "would let `reverseAmortization` be reused nearly as-is."

**That premise is false, and I verified it.** `reverseAmortization`
(`src/lib/server/services/payroll/amortization.ts:22-94`) takes `(tx, runId)` and drives its whole
loop from `tx.payrollEntry.findMany({ where: { payrollRunId: runId } })` then
`entry.deductions` (`:27-31`). It finds payment rows by `{ loanId: d.refId, payrollEntryId: entry.id }`
(`:43-46`). A separation write-off has **no payroll run, no payroll entry and no deduction line**,
so there is nothing for that loop to iterate. Reuse would mean rewriting the function's entire
driver — that is a new function wearing an old name, not reuse. **This is a SPEC mismatch and I am
reporting it rather than adapting silently.**

Two further findings against the ledger, both verified:

| Finding | Evidence |
|---|---|
| The unique key is **not** the blocker the SPEC feared | `payrollEntryId String?` is nullable and the schema comment says so outright: *"NULL payrollEntryId stays distinct in Postgres, so manual off-payroll payments are unaffected"* (`prisma/schema.prisma:1863-1875`, `:1900-1912`). A null-keyed write-off row inserts fine. |
| But then we cannot tell our rows apart | With `payrollEntryId: null` and no other tag, a separation write-off row is indistinguishable from a genuine manual off-payroll payment. Undo's `deleteMany` would delete real payments. Fixing that needs a **new `separationId` column on both ledger tables** — so the ledger option costs *more* schema than the alternative, not less. |
| A write-off is not a payment | `loan_payments` is the record of money that actually moved (`amortization.ts:38-42` exists precisely to stop the code trusting anything else). Writing ₱10,000 of forgiven debt into it as a "payment" corrupts a ledger the payroll void path trusts. `scripts/prod-delete.ts:225` already counts these rows in its summary. |

**Decided instead:** one new nullable column, `SeparationRecord.preFinalizeState Json?`, written
inside finalize's existing transaction, holding every row finalize is about to overwrite.

| | Ledger option (a) | Snapshot option — CHOSEN |
|---|---|---|
| Schema change | 2 new columns + 2 indexes on payroll tables | 1 nullable column on `SeparationRecord` |
| Reuses `reverseAmortization` | **No** (driver is run/entry-keyed) | No — and does not claim to |
| Blast radius | payroll ledger semantics, `prod-delete.ts`, payroll void tests | separations only |
| Pre-fix record detector (D-4) | needs a separate query | falls out free: `preFinalizeState === null` |
| Captures employee status + `endDate` + `User.isActive` | **No** — ledger holds money only | Yes, all of it |

That last row is decisive on its own. Finalize also destroys `employee.employmentStatus` (it may
have been `ACTIVE` **or** `ON_LEAVE`), `employee.endDate`, and `user.isActive`
(`separation.ts:348-355`). The ledger cannot hold any of it, so option (a) would have needed the
snapshot **as well**.

**What we lose by not writing ledger rows:** a written-off loan still shows `balance: 0, status:
PAID` with no payment history row explaining it. That is a pre-existing reporting hole, it is
**out of scope** here (NON-GOALS, NG-6), and it is worth a separate issue.

### Decision 2 (LOCKED 19-08-26): B-2's fix is option (b) — a second additive nullable column.

VALIDATE's B-2 showed that a widened `clearedAnyItem` reading `ClearanceItem.clearedById` alone is
defeatable: `setClearanceItem` (`separation.ts:196-202`) NULLs that field on un-clear, and its
ownership guard (`:192`) only fires when `item.status === 'CLEARED'` — which a re-opened item is not.
So any `MANAGE_HR` holder could strip every preserved clearer, one ordinary call per item.

**Owner's call: option (b).** Add `ClearanceItem.previouslyClearedById String?` — written ONLY by the
undo's re-open branch, read by `clearedAnyItem` alongside `clearedById`, and **never written or
cleared by `setClearanceItem`**. That last part is the whole point of the option: the bar lives in a
field the laundering path cannot reach.

| Option | Verdict |
|---|---|
| (a) widen `setClearanceItem`'s ownership guard to `item.clearedById && item.clearedById !== ctx.actorId` | **REJECTED — it deadlocks.** After a re-open only actor A may touch A's item; A is simultaneously barred from finalizing by #297; and no other actor can re-clear it. The case cannot be moved forward by anybody. Recorded here so nobody re-proposes it. |
| (b) new nullable `ClearanceItem.previouslyClearedById`, undo-write-only | **CHOSEN.** No deadlock, ordinary path byte-for-byte untouched, AC-6 unaffected, and it rides in the same `db push`-safe C1 commit as `preFinalizeState`. |
| (c) keep D-5 as drafted, delete the guarantee and pin the residual | **REJECTED.** It leaves the laundering route open; (b) costs one nullable column to actually close it. |

**Consequence:** M3.3 (un-clear a re-opened item as a third actor, assert the bar survives) is now a
test that must **PASS**, not a residual that documents a hole.

---

## Overview

A separation undo shaped exactly like payroll void (`payroll/runs.ts:95-152`):
service-level capability, precondition refusal, one `$transaction` opening with a compare-and-set
claim, the reversal, the audit entry inside. Plus the capture step that makes the money half honest.

Locked decisions carried in: D-1 (**amended** — see below), D-2 (`OVERRIDE_FINALIZED` in the
service), D-3 (self-undo allowed, marked), D-4 (pre-fix records partially restored), D-5
(**extended** — the clearer is kept on re-opened items, in TWO fields).

**D-1 amendment (B-4).** D-1 says "undo returns the record to `CLEARED`". That is right only when
the clearance items are kept. When `reopenClearance` is chosen, every item goes back to `PENDING`,
so the case has **zero** cleared items and calling it `CLEARED` is false — the list badge
(`separations/+page.svelte:18`) and the detail page would both render a lie, and the next
`toggleClearance` would silently rewrite the status anyway. The rule, stated plainly:

> **`CLEARED` when the items are kept. `OPEN` when they are re-opened — a re-opened case has
> nothing cleared.**

Nothing about D-1's intent changes: the record leaves `FINALIZED` and becomes editable again. No new
`SeparationStatus` value is needed — `OPEN` already exists (`schema.prisma:954-958`).

**Who may finalize after an undo-with-re-open (N-2, stated because it is a real behaviour change).**
Take an item originally cleared by A, on a case undone with `reopenClearance: true`:

| Moment | Item row | Who may finalize the case |
|---|---|---|
| Right after the undo | `{ PENDING, clearedById: 'A', previouslyClearedById: 'A' }` | **Nobody** — items are `PENDING`, so `separation.ts:308` refuses everyone with a 409 |
| After a third actor C re-clears it | `{ CLEARED, clearedById: 'C', previouslyClearedById: 'A' }` | **Anyone except A, C, and the leaver's own user** |

A stays barred on that case **permanently**, even though the clearance that now stands is C's. That
is intended: A did clear an item on this case, and #297's whole point is that such a person does not
close the case out. Nothing clears `previouslyClearedById` — that is exactly what makes the bar
survive the ordinary un-clear (Owner Decision 2). The cost is recorded as a Risk (one-admin
deadlock) and pinned as intended by a C3 test, so nobody later "fixes" it as a bug.

**D-5 extension (B-2).** The re-open keeps `clearedById` **and** stamps the new
`previouslyClearedById`, because `clearedById` alone is NULLable by any `MANAGE_HR` holder through
the ordinary un-clear path. See Owner Decision 2.

### Answers to the remaining SPEC §6 calls

| SPEC §6 | Call | Answer |
|---|---|---|
| 6.3 | Does `SeparationStatus` gain a value? | **No.** Undo returns the record to `CLEARED` when the items are kept and to `OPEN` when they are re-opened (superseded by B-4 / the D-1 amendment; the conclusion is unchanged). Verified nothing else keys on a fourth value: the enum has three members (`schema.prisma:954-958`) and the only status reads are `=== 'FINALIZED'` / `{ not: 'FINALIZED' }` (`separation.ts:298`, `:326`, `:174`, `:41`; `[id]/+page.server.ts:21,28`). Adding a value would also be a Prisma enum change — additive is safe, but unnecessary is cheaper. |
| 6.4 | Does `AuditAction` gain a value? | **Yes — `SEPARATION_UNDO`.** Same argument #298 made for `PAYROLL_VOID` (`schema.prisma:200-206`): a generic `UPDATE` is unfindable in the audit action filter. **Adding** an enum value is safe under `db push` — only a *rename* forces a drop/recreate. No `scripts/migrate-*.ts` is needed. Stated explicitly per the repo rule. |
| 6.5 | `docs/payroll-void-semantics.md` "No un-void" | Gets a two-line companion note (C6) saying separations DO have an undo and why the two stories differ: a payroll void is terminal because a fresh run can be re-created; a separation finalize has no re-do path because it offboards a person. |
| 6.6 | Finalize E2E gap | `tests/e2e/separations.spec.ts` has only list access (`:16`) and an employee refusal (`:25`). C6 adds the first finalize→undo E2E to that same file, as its own header comment instructs ("future separation e2e work belongs in this file rather than a second spec"). |

---

## Touchpoints

| File | Change |
|---|---|
| `prisma/schema.prisma` | `SeparationRecord.preFinalizeState Json?`; `ClearanceItem.previouslyClearedById String?` (B-2 option (b)); `AuditAction.SEPARATION_UNDO` |
| `src/lib/server/services/separation.ts` | snapshot capture in finalize; audit moves inside tx + gains `oldValue`; `clearedAnyItem` widened to read `previouslyClearedById` too + comment rewritten; one new comment in `setClearanceItem` (no behaviour change); new `undoSeparation`; new `PreFinalizeState` type |
| `src/lib/server/services/separation-undo-markers.ts` **(new)** | `undidOwnFinalize` — mirrors `payroll/audit-markers.ts:10-17` |
| `src/routes/(app)/separations/[id]/+page.server.ts` | new `undo` action; strip `preFinalizeState` from the load payload |
| `src/routes/(app)/separations/[id]/+page.svelte` | undo control + re-open-clearance checkbox + "partially restored" banner |
| `tests/unit/separation-finalize-sod.test.ts` | re-pin the re-opened-item case under the widened helper |
| `tests/unit/separation-finalize-effects.test.ts` | snapshot capture + in-tx audit assertions |
| `tests/unit/separation-undo.test.ts` **(new)** | the undo suite |
| `tests/e2e/separations.spec.ts` | first finalize→undo E2E |
| `docs/payroll-void-semantics.md` | companion note |

**Read but not changed:** `payroll/runs.ts`, `payroll/amortization.ts`, `payroll/audit-markers.ts`,
`src/lib/server/audit.ts`, `src/lib/rbac.ts`, `scripts/prod-delete.ts`,
`src/lib/server/services/settings/org.ts` (`setUserActive`, see C4's login step).

**I-2 — two test files checked and confirmed NOT touched.** `tests/unit/separation-characterization.test.ts`
and `tests/unit/separation-clearance-reclear.test.ts` are deliberately absent from the table above.
Neither calls `clearedAnyItem`, and both stub `writeAuditLog` wholesale (`:30` and `:26` respectively),
so C2's audit move and C3's widening cannot break them. This check is recorded so EXECUTE does not
re-derive it — but if either file goes red, that is a real signal, not a stale expectation.

---

## Public Contracts

| Contract | Before | After |
|---|---|---|
| `clearedAnyItem(items, actorId)` (exported, `separation.ts:128`) | bars on `status==='CLEARED' && clearedById===actorId` | bars on `clearedById===actorId \|\| previouslyClearedById===actorId`, **regardless of status** (D-5 + B-2 option (b)). The item type it accepts gains one optional field. |
| `finalizeSeparation` | audit outside tx, `newValue` only | audit inside tx, with `oldValue`; writes `preFinalizeState` |
| `undoSeparation(id, organizationId, reopenClearance, ctx)` | — | new export; throws 404 / 403 / 400 / 409 |
| Form action `?/undo` on `/separations/[id]` | — | new. **The only door** — there is no `/api/v1/separations` endpoint (verified: `find src/routes/api/v1 -path '*separation*'` returns nothing), so no twin to build. |
| `AuditAction` enum | 10 values | 11 (`SEPARATION_UNDO`) — additive |
| `ClearanceItem` row shape | no `previouslyClearedById` | gains `previouslyClearedById String?`, additive. Written **only** by the undo's re-open branch; `setClearanceItem` never touches it |
| `SeparationStatus` observed after an undo | — | `CLEARED` when items are kept, **`OPEN`** when `reopenClearance` re-opens them (B-4). This is an observable state change, listed here as a contract change rather than left implicit. |
| Page `data.separation` | includes all scalars | `preFinalizeState` stripped server-side |

**Not changed:** `computeFinalPay` output, `FinalPayResult`, the employees v1 API refusal
(`api/v1/employees/[id]/+server.ts:138-143`), `setClearanceItem`'s null-on-unclear behaviour.

---

## Blast Radius

10 files (7 changed, 3 new), one package (the app). Risk class: **auth/permission** (a new
SUPER_ADMIN break-glass door), **schema migration** (two additive nullable columns + one additive
enum value), **destructive-write reversal** (money and login state). High-risk on three counts —
every guard below carries a hybrid or E2E gate, never a unit test alone.

**Security surface note (B-5, corrected).** The undo is **not** the only writer that can set
`User.isActive = true`. `setUserActive` (`src/lib/server/services/settings/org.ts:323-368`) already
does, exposed at `src/routes/(app)/settings/roles/+page.server.ts:38,92` behind the CEO-only
`MANAGE_USER_ROLES` capability (`rbac.ts:75`), with a self-guard at `org.ts:332` and a `User`-entity
audit row carrying `oldValue`/`newValue` (`org.ts:359-366`). A CEO can already re-enable an
offboarded employee's login without any separation undo. The break-glass framing is therefore about
**restoring money and `employmentStatus` atomically**, not about being the sole login door. The claim
that IS true: the undo would be the only writer moving `Employee.employmentStatus` away from
`OFFBOARDED` — the only two `employmentStatus` writers in `src/` are `separation.ts:350` and
`employees.ts:1223`, and the v1 API rejects it at `api/v1/employees/[id]/+server.ts:136-141`.

---

## Implementation Checklist (commit-by-commit)

Each commit is green on all four gates on its own.

### C1 — schema: the snapshot column and the audit action

**Files:** `prisma/schema.prisma`

- On `SeparationRecord`, after `finalizedById`, add `preFinalizeState Json?` with a comment: *"Everything finalize is about to overwrite, captured inside finalize's transaction so #304's undo can put it back. NULL = finalized before #304 shipped ⇒ the money cannot be restored (D-4, 'partially restored')."*
- On `ClearanceItem`, after `clearedById`, add `previouslyClearedById String?` with a comment:
  *"#304/B-2: the #297 separation-of-duties bar, parked where the ordinary un-clear path cannot reach
  it. WRITTEN ONLY by undoSeparation's re-open branch. setClearanceItem must never write or clear
  this field — that is the entire point: clearedById is NULLable by any MANAGE_HR holder, this is
  not."* No relation, no index — it is read only via the already-loaded item list in
  `clearedAnyItem`, never queried on.
- Add `SEPARATION_UNDO` to `AuditAction` (`schema.prisma:194-207`) with the #304 rationale comment.

**Why:** all three are additive. Two nullable columns need no backfill; adding an enum value is safe
under `prisma db push` — only a **rename** drops and recreates the type. No `scripts/migrate-*.ts` is
required — stated here explicitly because the repo rule demands the distinction be named. Both new
columns ride in this one commit.

**Apply:** `pnpm db:push` (which is `dotenv -e .env.dev -- prisma db push`), then restart the dev
server — this repo requires a restart after a push.

**Tests:** none of its own. Gate is `pnpm check` compiling against the regenerated client.

---

### C2 — finalize captures state, and its audit moves inside the transaction

**Files:** `src/lib/server/services/separation.ts`

1. Export the snapshot type:
   `export interface PreFinalizeState { loans: {id,balance,status}[]; cashAdvances: {id,balance,status}[]; employee: {employmentStatus,endDate}; userIds: string[]; userWasActive: boolean }`
   Balances stored as **strings** (`Decimal.toString()`), not `Number` — JSON has no decimal type
   and the repo's money rule forbids a `Number` round-trip on balances (`amortization.ts:33-35`).
2. Inside the existing `$transaction`, **before** the two blanket `updateMany`s
   (`separation.ts:339-346`), read the rows first:
   `tx.loan.findMany({ where: { employeeId, status: 'ACTIVE' }, select: { id, balance, status } })`
   and the `cashAdvance` mirror; plus the employee's current `employmentStatus`/`endDate` and
   `tx.user.findMany({ where: { employee: { id } }, select: { id, isActive } })`.
3. Add `preFinalizeState` to the compare-and-set `updateMany` at `:325-335`.
4. Move the `writeAuditLog` call (`:358-363`) **inside** the transaction, pass `tx` as the third
   argument (`audit.ts:22-26` already accepts it), and add
   `oldValue: { status: record.status, employmentStatus, endDate, activeLoanCount, activeAdvanceCount }`.

**Why:** SPEC §3c — the state finalize destroys must be recoverable from the trail too, and the
trail must commit or roll back with the money. `writeAuditLog` has always taken both; finalize
simply never passed them.

**Order note:** the reads must sit **after** the compare-and-set status claim at `:335`, so a losing
concurrent finalize never snapshots.

**Test-harness change first — a distinct `txMock` (B-3, required before any assertion below).**
`separation-finalize-effects.test.ts:46` currently makes `$transaction` a **passthrough that returns
the same `dbMock`**. That single fact makes three of this plan's assertions vacuous, so it is
replaced, in every separation unit file this plan touches:

```
const txMock = { loan: {...}, cashAdvance: {...}, employee: {...}, user: {...},
                 separationRecord: {...}, clearanceItem: {...} }   // its OWN vi.fn()s
dbMock.$transaction = vi.fn((cb) => cb(txMock))
```

Three things this buys, all of them B-3 fixes:
1. `computeFinalPay`'s `db.loan.findMany` and the snapshot's `tx.loan.findMany` stop being the same
   mock with the same flat return. Today they are — which is this repo's own #1 recorded failure mode
   reproduced *inside the plan's own test design*.
2. `tx !== db`, so U13's "3rd arg is the tx client" becomes a real assertion (`toBe(txMock)`), and a
   mutation that passes `db` explicitly now fails it.
3. Order assertions become meaningful, because the reads and the writes are distinguishable calls on
   one known object.

**Tests** (`tests/unit/separation-finalize-effects.test.ts`, extend):
- `finalize snapshots every ACTIVE loan and advance before zeroing them` — assert the
  `separationRecord.updateMany` data contains `preFinalizeState` with both loan ids and their
  **pre-zero** balances, **and** assert invocation order explicitly:
  `expect(Math.max(...txMock.loan.findMany.mock.invocationCallOrder)).toBeLessThan(txMock.loan.updateMany.mock.invocationCallOrder[0])`
  plus the `cashAdvance` mirror. Without the order assertion the value assertion passes either way,
  because a stateless mock does not let `updateMany` change what `findMany` resolves.
- `finalize writes its audit inside the transaction, with oldValue` — assert `writeAuditLog`'s 3rd
  arg `toBe(txMock)` (identity, not truthiness) and an `oldValue` naming the prior `employmentStatus`.

**Projection safety:** the loan/advance mocks must use a `project()`-style helper that honours the
`select` clause and returns **only** the selected keys. A flat `mockResolvedValue(wholeRow)` would
let a snapshot that captured the wrong fields still pass — this repo's #1 recorded test failure.
`project()` fixes row **shape**; the order assertion above fixes **sequence**. Both are needed; the
first was never a substitute for the second.

**Mutations that prove these bite:**
- M2.1 — move the snapshot reads *below* the `loan.updateMany`. **The order assertion fails.** (The
  value assertion alone would NOT have failed — that was B-3.) This is the mistake anyone would
  actually make: reads read naturally at the top of the money block.
- M2.2 — drop the third `tx` argument from `writeAuditLog`. The `toBe(txMock)` assertion fails.
- M2.3 — pass `db` instead of `tx` as the third argument. The `toBe(txMock)` assertion fails. This
  mutation was **unkillable** before the distinct `txMock`, and it is the more realistic of the two
  (a reader "tidies" the call to match every other `writeAuditLog` site in the file).

---

### C3 — `clearedAnyItem` widens; the false comment dies; #297 is re-pinned

**Files:** `src/lib/server/services/separation.ts`, `tests/unit/separation-finalize-sod.test.ts`

- `clearedAnyItem` (`:128-130`) becomes
  `items.some((i) => i.clearedById === actorId || i.previouslyClearedById === actorId)`.
  Keep it a pure function with zero db mocks — that is why #297 wrote it that way. Guard against a
  null-vs-null match the same way `undidOwnFinalize` does: `actorId` is non-null at every call site
  (`finalizeBarFor:159`, the in-tx re-check `:321`), but state the requirement so a future refactor
  cannot introduce `undefined === undefined`.
- **Rewrite the comment at `separation.ts:127`.** It currently reads *"Un-cleared items carry a null
  clearedById, so a re-opened item stops barring its clearer."* Under D-5 that is false. Replace
  with: *"#304/D-5: the bar keys on the two "cleared by" fields, not on status. The ordinary un-clear path
  (`setClearanceItem`, :199-201) still NULLs `clearedById`, so it still un-bars — that is
  deliberate and unchanged. The undo's re-open branch KEEPS `clearedById` and only flips `status`,
  so a bulk re-open cannot launder every #297 bar on the case in one privileged call. The re-open
  ALSO stamps `previouslyClearedById`, which this helper reads, and which `setClearanceItem` never
  writes or clears — that second field is what makes the bar survive an ordinary un-clear (B-2)."*
- In `setClearanceItem` (`:199-201`), add one comment marking the divergence explicitly so the two
  paths never look like an accident: *"NULLs clearedById on purpose — the opposite of the undo's
  re-open branch. See clearedAnyItem. And NEVER write or clear previouslyClearedById here: that
  field exists precisely because this path is reachable by any MANAGE_HR holder and clearedById is
  not a safe place to keep the #297 bar. Adding it to this data object re-opens the laundering
  route (#304/B-2)."* No behaviour change here — the comment is the guard's documentation, and M3.3
  below is its test.

- **Widen the in-transaction re-check's `select` at `separation.ts:319`** to
  `{ status: true, clearedById: true, previouslyClearedById: true }`. `clearedAnyItem` now reads a
  field this projection omits, and because the field is **optional** on `ClearanceActorRef`,
  `pnpm check` stays green while the second layer of the bar silently degrades to `clearedById`-only.
  The pre-flight bar is fine — it is fed `getSeparation`'s bare `clearanceItems` include
  (`separation.ts:111`), which carries the whole row. The re-check exists **only** for the race the
  pre-flight cannot cover (`:313-316` says so), so it is the one half that must not be narrower
  (N-1). Repo precedent: a widened guard with an un-widened projection, and #278's "type annotations
  do not strip runtime properties".
- **Projection sweep (N-1, done at plan time — result: this is the only site).** Every other
  `ClearanceItem` / `SeparationRecord` projection was checked against the two new columns:
  `listSeparations:388` and the report query `:91` select `{ status: true }` and only **count**
  cleared items — neither calls `clearedAnyItem`, so neither needs the field;
  `setClearanceItem:178` selects from `Separation`, not the item's actor fields;
  `getSeparation:101-111` uses a bare `clearanceItems` include, so it already carries both new
  columns (which is *why* C5 must strip `preFinalizeState` in `load`); `:151` is the scoped
  `userId` lookup. **`:319` is the only narrowing site.**

**Why:** SPEC §3b/D-5. This is the laundering guard, and it is the reason the widening is not
optional.

**Tests** (`separation-finalize-sod.test.ts`, re-pin — do **not** delete the existing case):
- `a re-opened item still bars its original clearer` — item `{ status: 'PENDING', clearedById: 'A' }`
  ⇒ `clearedAnyItem(items,'A') === true`. This is the case whose expectation **inverts**; keep the
  old assertion in the file as a commented one-line note saying #304 flipped it and why.
- `an ordinarily un-cleared item (clearedById null) still does NOT bar` ⇒ `false`. This is the
  negative control that stops the widening becoming "everyone is barred forever". The item in this
  case must have `previouslyClearedById` **absent/null** — an ordinary un-clear never sets it.
- `a re-opened item still bars its clearer after a third actor un-clears it` (M3.3's target) —
  item `{ status: 'PENDING', clearedById: null, previouslyClearedById: 'A' }` ⇒
  `clearedAnyItem(items,'A') === true`. This is the B-2 case: `clearedById` has been NULLed by the
  ordinary path and the bar survives anyway.
- `the bar on a re-opened item is permanent — a third actor re-clearing does not lift it` (N-2,
  pinned as **intended**) — item `{ status: 'CLEARED', clearedById: 'C', previouslyClearedById: 'A' }`
  ⇒ `clearedAnyItem(items,'A') === true` **and** `clearedAnyItem(items,'C') === true`. Comment it as
  deliberate permanence with a pointer to the Overview table and the Risks row, so a future reader
  does not "fix" it.
- **In `separation-finalize-effects.test.ts` (or wherever the in-tx re-check is exercised): assert
  the projection**, not just the outcome —
  `expect(txMock.clearanceItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ previouslyClearedById: true }) }))`.
  An outcome assertion cannot catch a narrowed select, because the mock returns whatever the test
  hands it regardless of the projection.
- Existing D3/D4 cases must stay green untouched.

**Mutations that prove these bite:**
- M3.1 — restore the `status === 'CLEARED' &&` clause. The re-opened-item test must fail. (The
  realistic mistake: a future reader "fixes" the helper back to matching its old comment.)
- M3.2 — make `setClearanceItem` keep `clearedById` on un-clear. The negative-control test must
  fail, proving the ordinary path really is still un-barring.
- **M3.3 — make `setClearanceItem`'s un-clear branch also write `previouslyClearedById: null`.** The
  new third-actor test must fail. This is exactly the realistic mistake: a reader sees two "cleared
  by" columns, one being NULLed, and "completes" the data object. With option (b) chosen this test
  **PASSES** as designed — it is a live guarantee, not a documented residual. The live half of the
  same proof is manual step 7b (a third HR actor un-clears a re-opened item; the bar holds).
- **M3.4 — remove `previouslyClearedById` from the in-tx re-check's `select` at `separation.ts:319`.**
  The new projection assertion must fail. `pnpm check` will stay green through this mutation — that
  is the whole point of the mutation, and the reason an outcome-only test is not enough (N-1).

---

### C4 — `undoSeparation`

**Files:** `src/lib/server/services/separation.ts`, `src/lib/server/services/separation-undo-markers.ts` (new)

Signature: `undoSeparation(id: string, organizationId: string, reopenClearance: boolean, ctx: AuditContext)`.

Shape, step for step, mirroring `voidRun` (`runs.ts:95-152`):

1. `requireAnyCapability(ctx.actorRoles, 'OVERRIDE_FINALIZED')` — **first line, in the service**
   (D-2; matches `runs.ts:97`). This becomes the capability's 11th call site and its first outside
   payroll/attendance.
2. Load the record scoped by `organizationId`; **404** if absent.
3. **Precondition refusal: `if (record.status !== 'FINALIZED') error(400, 'Separation is not finalized')`.**
   (`voidRun:105` is the mirror.)
4. `const partial = record.preFinalizeState === null` — the D-4 detector.
5. One `db.$transaction(async (tx) => {…})` containing, in order:
   - **compare-and-set claim:**
     `const nextStatus = reopenClearance ? 'OPEN' : 'CLEARED'`, then
     `tx.separationRecord.updateMany({ where: { id, status: 'FINALIZED' }, data: { status: nextStatus, finalPayAmount: null, finalizedAt: null, finalizedById: null } })`
     → `if (claimed.count === 0) error(400, 'Separation is not finalized')`.
     **`finalPayBreakdown` is deliberately KEPT** — on a pre-fix record it is the only surviving
     evidence of the aggregate write-off, which D-4 requires the UI to surface.
     **`preFinalizeState` is deliberately NOT nulled (B-1).** The earlier draft wrote
     `preFinalizeState: Prisma.DbNull` here. That destroyed the only thing distinguishing a
     fully-restored record from a pre-#304 one, so C5's banner would have called every restored
     record "partially restored" on reload — a money lie. Nulling also bought nothing: a later
     re-finalize overwrites the column anyway (C2 step 3 puts it in finalize's own claim `data`).
     Add a comment saying so, or a reader will "tidy up" the stale-looking column.
     **`status` is `'OPEN'` when `reopenClearance` (B-4).** A re-opened case has zero cleared items,
     so leaving it `CLEARED` would be a lie the list badge (`separations/+page.svelte:18`) and the
     detail page both render, and the next `toggleClearance` would silently rewrite it anyway
     (`setClearanceItem`'s roll-forward, `separation.ts:206-216`, which this transaction bypasses).
     The distinction, stated plainly: **`CLEARED` when the items are kept, `OPEN` when they are
     re-opened.** See the amendment to D-1 in the Overview.
   - **money, only when `!partial`:** for each snapshot loan, a conditional restore in the spirit of
     `amortization.ts:52-62` — **but deliberately stricter, and not the same idiom (I-1)**:
     amortization conditions on the balance it just READ in-tx (`where: { id, balance: loan.balance }`,
     `:54-56`); this conditions on the constant post-finalize state (`balance: 0, status: 'PAID'`),
     which additionally catches a row that was never zeroed at all. **Do not "correct" this back to
     the amortization form** — the difference is intentional and this note exists because a reviewer
     otherwise will. The concrete call —
     `tx.loan.updateMany({ where: { id, balance: 0, status: 'PAID' }, data: { balance: <snapshot>, status: <snapshot status> } })`, and
     `if (res.count === 0) error(409, 'A loan balance changed since finalizing — nothing was reversed, retry')`.
     Same for advances. Use `D()` from `./payroll/money` to parse the stored strings; never `Number`.
   - **employee:** restore `employmentStatus` and `endDate` from the snapshot when `!partial`; when
     `partial`, restore `employmentStatus: 'ACTIVE'` and `endDate: null` and say so in the audit
     entry (`restoredStatusAssumed: true`). `ACTIVE` is the honest default: `ON_LEAVE` is
     recoverable by a human, an `OFFBOARDED` ghost is not.
     **I-3 — the asymmetry is deliberate:** the employee restore is a blind `tx.employee.update`
     while the money writes are compare-and-set with a 409. Money can be moved by a dozen ordinary
     payroll paths between finalize and undo, so it must be guarded. `employmentStatus` cannot: the
     only two writers in `src/` are `separation.ts:350` (this file) and `employees.ts:1223`, and the
     v1 API refuses it (`api/v1/employees/[id]/+server.ts:136-141`). Guarding it would buy a failure
     mode without buying safety. Named here so the inconsistency does not read as an oversight.
   - **login:** `tx.user.updateMany({ where: { employee: { id } }, data: { isActive: true } })` —
     when `!partial`, only if `userWasActive`.

     **B-5 correction — this is NOT the only `isActive: true` writer.** `setUserActive`
     (`src/lib/server/services/settings/org.ts:323-368`) already writes `data: { isActive }` with
     `true` reachable, exposed at `settings/roles/+page.server.ts:38,92` behind the CEO-only
     `MANAGE_USER_ROLES` (`rbac.ts:75`). A CEO can re-enable an offboarded login today, with no undo.

     **Decision (recorded, not left open): the undo keeps its own `tx.user.updateMany` and does NOT
     call `setUserActive`.** The reason is atomicity, and it is decisive: `setUserActive` opens its
     **own** `db.$transaction` at serializable isolation (`org.ts:334-357`) and writes its audit row
     *outside* it (`org.ts:359-366`). Calling it from inside the undo's transaction would nest an
     independent transaction on a different connection — the login write would commit even if the
     money restore then rolled back, which is the exact failure this whole design exists to prevent.
     Its self-guard (`org.ts:332`) is **not** the obstacle: the account being re-enabled is always
     the leaver's, never the actor's, so it would never fire.

     **The cost, named rather than left silent:** the undo therefore writes **no `User`-entity audit
     row**, where `setUserActive` writes one with `oldValue`/`newValue`. Mitigation, and it is
     required not optional — fold the login state into the `SEPARATION_UNDO` payload:
     `oldValue.userIsActive = false` (from the snapshot's `userWasActive`, or the live read on a
     pre-fix record) and `newValue.userIsActive = true`. Anyone auditing `User.isActive` history must
     therefore search `SEPARATION_UNDO` rows as well as `UPDATE`/`User` rows. Recorded in
     "What This Plan CANNOT Prove Locally" as a known asymmetry (I-6).
   - **clearance, when `reopenClearance`:** two statements, in this order, because the second reads
     the field the first would otherwise have to preserve:
     1. `tx.clearanceItem.updateMany({ where: { separationId: id, clearedById: { not: null } }, data: { previouslyClearedById: <the item's clearedById> } })` — Prisma cannot copy a column to
        another column in one `updateMany`, so this is done as a small in-tx loop over the items
        already read for the audit `oldValue`:
        for each item with a non-null `clearedById`,
        `tx.clearanceItem.update({ where: { id: item.id }, data: { previouslyClearedById: item.clearedById } })`.
        **This is the ONLY place in the codebase that writes `previouslyClearedById` (B-2 option
        (b)).**
     2. `tx.clearanceItem.updateMany({ where: { separationId: id }, data: { status: 'PENDING' } })` —
        **`clearedById` is NOT in the `data` object.** That omission is D-5. Add a comment saying the
        omission is the guard, not an oversight, or the next reader will "complete" the object.

     Why both fields and not just the new one: `clearedById` surviving keeps the record readable
     ("A cleared this"), and `previouslyClearedById` keeps the #297 bar alive even after some other
     actor exercises the ordinary un-clear and NULLs `clearedById`. That second path is B-2, and one
     field alone cannot close it.
   - **audit last, inside the tx:** `writeAuditLog(ctx, { action: 'SEPARATION_UNDO', entityType: 'SeparationRecord', entityId: id, oldValue: {…}, newValue: {…} }, tx)`.
     `oldValue` carries the full SPEC §3c-2 payload: clearer set, loan/advance balances+statuses
     being restored, `finalizedById`/`finalizedAt`, employee `employmentStatus`, `User.isActive`.
     `oldValue` additionally carries `userIsActive: false` (B-5's mitigation above).
     `newValue` carries `{ status: nextStatus, userIsActive: true, reopenedClearance: reopenClearance, partiallyRestored: partial, ...(undidOwnFinalize(ctx.actorId, record) && { sameActorAsFinalizer: true }) }`
     — note `status` is the derived `nextStatus`, not a hardcoded `'CLEARED'` (B-4).
6. Return `{ partial, status: nextStatus, writeOff: partial ? <aggregate from finalPayBreakdown> : null }`.

**`separation-undo-markers.ts`** — one exported function, a near-copy of
`payroll/audit-markers.ts:10-17`:
`undidOwnFinalize(actorId, record: { finalizedById: string | null })` returns
`!!actorId && actorId === record.finalizedById`. Carry the null-vs-null warning verbatim: a record
with a null `finalizedById` must never match. **Conditional-spread at the call site** so the key is
absent on an ordinary undo, never present-and-false (D-3).

**Tests** (`tests/unit/separation-undo.test.ts`, new):

| # | Test | Asserts |
|---|---|---|
| U1 | non-SUPER_ADMIN is refused | throws before any db call — assert `db.separationRecord.findFirst` was **never** called |
| U2 | unknown id → 404 | |
| U3 | a `CLEARED` record → 400 | precondition refusal |
| U4 | concurrent undo → 400 | `updateMany` returns `{count:0}` ⇒ throws, and **no** loan write follows |
| U5 | snapshot restore | loan `{id:'l1'}` back to `3000`/`ACTIVE`, `{id:'l2'}` to `7000`/`ACTIVE` — the SPEC §1 two-loan case |
| U6 | a balance moved since finalize → 409 | conditional `updateMany` returns `{count:0}` |
| U7 | login re-enabled | `user.updateMany` called with `isActive: true` |
| U8 | `reopenClearance: true` keeps the clearer | assert the `clearanceItem.updateMany` `data` object has **no** `clearedById` key (`expect('clearedById' in data).toBe(false)`) — not merely that it is not null |
| U9 | `reopenClearance: false` leaves items alone | `clearanceItem.updateMany` never called |
| U10 | self-undo stamps the marker | `newValue.sameActorAsFinalizer === true` |
| U11 | ordinary undo omits the marker | `expect('sameActorAsFinalizer' in newValue).toBe(false)` |
| U12 | pre-fix record (`preFinalizeState: null`) | **no** loan/advance write at all; employee restored to `ACTIVE`; returns `partial: true` with the aggregate |
| U13 | audit is inside the tx | `writeAuditLog` 3rd arg `toBe(txMock)` — identity against the **distinct** tx mock (B-3), not merely truthy |
| U14 | a full undo leaves `preFinalizeState` populated (B-1) | the claim's `data` has **no** `preFinalizeState` key: `expect('preFinalizeState' in data).toBe(false)` — key absence, so a `Prisma.DbNull` regression cannot slip through as "not null" |
| U14b | `reopenClearance: true` ⇒ claim `data.status === 'OPEN'` (B-4) | and `reopenClearance: false` ⇒ `'CLEARED'`; also `newValue.status` matches the claim in both cases |
| U15 | the re-open stamps `previouslyClearedById` (B-2 option (b)) | for an item `{id:'c1', clearedById:'A'}`, assert `tx.clearanceItem.update` was called with `{ where:{id:'c1'}, data:{ previouslyClearedById:'A' } }`; and that the stamp call's `invocationCallOrder` precedes the `status: 'PENDING'` `updateMany` |
| U16 | the audit carries the login before/after (B-5) | `oldValue.userIsActive === false` and `newValue.userIsActive === true` |

**Mutations that prove these bite:**
- M4.1 — move `requireAnyCapability` from the service into the route only. U1 must fail. (The exact
  historical mistake this repo names: guards drifting to the route.)
- M4.2 — add `clearedById: null` to the re-open `data`. U8 must fail. (The realistic mistake: a
  reader mirrors `setClearanceItem`, whose un-clear path does exactly that.)
- M4.3 — change the loan restore `where` from `{ id, balance: 0, status: 'PAID' }` to `{ id }`. U6
  must fail. (The realistic mistake: "the conditional where is redundant, we're in a transaction.")
- M4.4 — drop the `partial` branch and let a pre-fix record restore from `null`. U12 must fail.
- M4.5 — change the conditional spread to `sameActorAsFinalizer: undidOwnFinalize(...)`. U11 must
  fail on the present-and-false key.
- M4.6 — put `preFinalizeState: Prisma.DbNull` back into the claim (the exact defect B-1 caught).
  U14 must fail, **and** C5's new "load does not flag partial for a fully restored record" route
  test must fail. Two tests, two layers — because this defect is invisible until a page reload.
- M4.7 — hardcode `status: 'CLEARED'` in the claim. U14b must fail on the `reopenClearance: true`
  case. (The realistic mistake: D-1 says `CLEARED`, so a reader writes the constant.)
- M4.8 — drop the `previouslyClearedById` stamp loop. U15 must fail, and the C3 third-actor test
  still passes on its own fixture — which is why U15 exists: C3 proves the **helper** reads the
  field, U15 proves the **undo** writes it. Neither alone closes B-2.
- M4.9 — swap the stamp loop to run *after* the `status: 'PENDING'` `updateMany`. U15's order
  assertion must fail. (Harmless today, but it encodes the read-before-write discipline that M2.1
  showed this plan needs stated, not assumed.)

**Projection safety and non-vacuity (B-3 sweep).** Every test above was re-checked for the same
vacuity that killed M2.1 and M4.3. Results, recorded so the check is not repeated blindly:
- U5/U12 mock `loan.findMany` through a `project()` helper honouring `select`.
- U8/U11/U14 assert on **key presence**, never on value — a flat mock cannot fake key absence.
- **U6 must assert the `where`, not only the `count` (B-3).** `loan.updateMany.mockResolvedValue({count:0})`
  makes a flat mock throw the 409 whether the `where` is `{ id, balance: 0, status: 'PAID' }` or a
  bare `{ id }`, so M4.3 was unkillable. Add:
  `expect(txMock.loan.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ balance: 0, status: 'PAID' }) }))`.
- **The whole undo suite runs against the distinct `txMock` from C2**, not a `$transaction`
  passthrough. Without that, U4/U7/U9/U13 are all assertions against `dbMock` that cannot tell an
  in-transaction write from an out-of-transaction one — U13 provably so, the others latently.
- U1 (`findFirst` never called), U9 (`clearanceItem.updateMany` never called) and U4 ("no loan write
  follows") are **negative** assertions on a distinct mock and are non-vacuous as written — checked,
  not assumed.
- U12's "no loan write at all" kills M4.4 as written: restoring from a `null` snapshot issues a call
  the assertion forbids. Checked, non-vacuous.

---

### C5 — route action and UI

**Files:** `src/routes/(app)/separations/[id]/+page.server.ts`, `+page.svelte`

- New `undo` action, copying the existing `finalize` action's exact `try`/`isHttpError`/`fail`
  shape (`+page.server.ts:58-77`). Route-level `requireAnyCapability(user.roles, 'MANAGE_HR')` stays
  as the coarse page gate; **`OVERRIDE_FINALIZED` is enforced in the service** — the route does not
  duplicate it. Read `reopenClearance` from the form data as `data.get('reopenClearance') === 'true'`.
  Return `{ undone: true, partial, status, writeOff }` — `status` is the derived `'CLEARED'`/`'OPEN'` (B-4), so the flash message can say which.
- In `load`, strip the new column before returning:
  `const { preFinalizeState: _drop, ...separation } = await getSeparation(...)`. `getSeparation`
  uses `include`, so every scalar ships to the client otherwise, and this one holds loan ids and
  balances. Two prior leaks (#111, #290) came from exactly this.
- Add `canUndo` to the returned data: `separation.status === 'FINALIZED' && user.roles.includes('SUPER_ADMIN')`
  — cosmetic affordance only, with the house-rule comment naming the service as the enforcement,
  matching the existing `finalizeBar` comment at `:24-25`.
- `+page.svelte`: in the finalized branch (`:196-200`), add an "Undo finalization" button behind
  `canUndo`, a labelled checkbox "Re-open clearance items" (default **off** — SPEC §3b says the
  common case is "the clearance was correct"), and a `confirm`-style second click, since this
  re-enables a login. Accessibility: the checkbox needs a real `<label for>`, and the button an
  `aria-describedby` pointing at the warning text, matching `:188-193`.
- **Partially-restored banner (D-4, first-class):** when `partial`, render a persistent amber panel
  on the record after undo: *"Partially restored. Loan and cash-advance balances totalling ₱X were
  written off when this was finalized and could not be restored automatically — re-enter them
  manually."* X comes from the surviving `finalPayBreakdown` lines (`Outstanding loan balances` +
  `Outstanding cash advances`, both negative — display the absolute sum). Money renders through the
  existing `peso()` helper.
  **Persistence note (corrected, B-1):** the banner must survive a page reload, so it cannot live
  only in the action return. Derive it in `load` from **three** conditions, all of them required:

  ```
  const partiallyRestored =
      separation.preFinalizeState === null &&      // pre-#304 record: nothing to restore from
      separation.finalPayBreakdown !== null &&     // it WAS finalized at some point
      separation.status !== 'FINALIZED'            // and it has since been undone
  ```

  The earlier draft used only the last two, which was correct **only because** the undo nulled
  `preFinalizeState`. It no longer does (B-1), and it must not — nulling it made a perfectly restored
  record render the amber "could not be restored automatically" panel on every reload. That is a
  money lie, and it made AC-4 unprovable through `load`. With `preFinalizeState` surviving, the first
  condition is the real D-4 detector and the derivation is exact:
  a fully restored record has `preFinalizeState` populated ⇒ no banner; a pre-#304 record has it
  `null` ⇒ banner. Compute this **before** the strip below (the strip removes the very field the
  test reads) and comment both facts.
  Note the status test is `!== 'FINALIZED'` rather than `=== 'CLEARED'`, because a re-opened case is
  now `OPEN` (B-4) and must still show the banner.
- `{@const}` rule: any const inside the banner must be an immediate child of the `{#if}`, never
  inside a `<div>`.

**Tests** (`tests/unit/separation-routes.test.ts`, extend, following its existing pattern):
- `the undo action maps a service 403 to fail(403)`.
- `the undo action forwards reopenClearance=true`.
- `load strips preFinalizeState` — `expect('preFinalizeState' in result.separation).toBe(false)`,
  with `getSeparation` mocked to return a row that **has** the key.
- **`load does NOT flag partial for a fully restored record` (B-1)** — `getSeparation` returns
  `{ preFinalizeState: {...}, finalPayBreakdown: {...}, status: 'CLEARED' }` ⇒
  `expect(result.partiallyRestored).toBe(false)`. This is the test AC-4 is proved through, and it is
  the one M4.6 kills.
- **`load DOES flag partial for a pre-#304 record`** — same row with `preFinalizeState: null` ⇒
  `true`. The positive control; without it the test above passes on a hardcoded `false`.
- **`load flags partial for a re-opened pre-#304 record`** — `status: 'OPEN'` ⇒ still `true` (B-4
  interaction; a `=== 'CLEARED'` derivation would silently drop the banner here).

**Mutations:**
- M5.1 — delete the destructuring strip in `load`. The strip test must fail.
- M5.2 — hardcode `reopenClearance: false` in the action. The forwarding test must fail.
- M5.3 — narrow the `load` derivation back to `finalPayBreakdown !== null && status === 'CLEARED'`
  (drop the `preFinalizeState === null` term). The "fully restored" test must fail. This is B-1's
  defect at the read side, and it is the mistake a reader makes by trusting the old comment.
- M5.4 — compute `partiallyRestored` **after** the destructuring strip. It reads `undefined`, the
  `=== null` term is false, and the banner never shows: the "pre-#304 record" positive control must
  fail. Ordering bug, realistic, and now caught.

---

### C6 — E2E and the docs companion

**Files:** `tests/e2e/separations.spec.ts`, `docs/payroll-void-semantics.md`

- **E2E (new, in the existing spec file per its own header instruction at `:9-11`):** a full
  finalize → undo cycle against the real DB, following the setup/teardown pattern of
  `tests/e2e/payroll-void-run-amortization.spec.ts` (tagged fixtures, `db.*.deleteMany` teardown by
  tag). Steps: seed an employee with two ACTIVE loans (₱3,000 / ₱7,000) + a CLEARED separation →
  log in as SUPER_ADMIN → finalize → assert in DB that both loans are `0`/`PAID`, the employee is
  `OFFBOARDED` and `user.isActive === false` → click Undo → assert **positively** that the loans
  are back at exactly `3000` and `7000` with `status ACTIVE`, the employee is `ACTIVE`,
  `user.isActive === true`, the record is `CLEARED`, and an `AuditLog` row with
  `action: 'SEPARATION_UNDO'` exists carrying a non-null `oldValue`.
- **E2E negative control, same file:** log in as `hr@veent.ph` (HR_ADMIN — `MANAGE_HR` without
  `OVERRIDE_FINALIZED`), POST the undo action directly, assert the record is **still** `FINALIZED`.
  Asserting only "the button is not visible" proves nothing — this repo has that recorded.
- **E2E rollback proof, same file (N-3):** the one path the design can be made to throw. Seed as
  above, finalize, then move one loan's balance in SQL between finalize and undo
  (`db.loan.update` on the tagged fixture — this is what `undoSeparation`'s conditional
  `updateMany` refuses on), then click Undo. Assert **both** halves: (a) the action fails with the
  **409** ("balance changed since finalize"), and (b) **nothing moved** — the record is still
  `FINALIZED`, `users.isActive` still `false`, the employee still `OFFBOARDED`, the *other* loan
  and **no** `AuditLog` row with `action: 'SEPARATION_UNDO'` written since this test's own undo
  began. **Corrected per V3/B-6:** the compare-and-set claim is the ONLY write that precedes the
  balance check, so the record row is what proves the rollback — assert all **four** columns the
  claim writes (`status` still `FINALIZED`, and `finalizedAt` / `finalizedById` / `finalPayAmount`
  all still non-null), not just `status`. The login, employee and audit-row assertions are kept but
  labelled in the test as **vacuous negative controls that pass whether or not the transaction
  rolled back** — those three writes come after the balance check and never ran. The "other loan
  untouched" assertion is DROPPED: the restore loop throws on the first failing loan and the
  snapshot has no `orderBy`, so it was a flaky proof. Same tagged-fixture/teardown shape this
  commit already copies from `payroll-void-run-amortization.spec.ts`.
- **Docs:** two lines under the "No un-void" statement in `docs/payroll-void-semantics.md` pointing
  at `undoSeparation` and stating the asymmetry, so the two undo stories do not read as
  contradictory (SPEC §6.5).

**Mutation:** M6.1 — delete the `requireAnyCapability` line in `undoSeparation`. The HR_ADMIN
negative-control E2E must fail. This is the one mutation that proves the guard works **in the
deployed app**, not just in a mock — and it is the only proof that matters for a break-glass door.

---

## Acceptance Criteria

| # | Criterion | Proven by |
|---|---|---|
| AC-1 | A SUPER_ADMIN can undo a finalized separation; the record leaves `FINALIZED` — to `CLEARED` when the items are kept, to `OPEN` when they are re-opened (D-1 as amended, B-4). | U3/U4 + **U14b** + E2E round trip |
| AC-2 | An actor without `OVERRIDE_FINALIZED` is refused **by the service**, not only the route (D-2). | U1 + M4.1 + the HR_ADMIN E2E negative control + M6.1 |
| AC-3 | The finalizer may undo their own finalize, and the audit entry carries a `sameActorAsFinalizer` marker that is ABSENT on ordinary undos (D-3). | U10, U11, M4.5 |
| AC-4 | A record finalized before the snapshot existed restores status/offboard/login, writes no loan rows, and shows a "partially restored" panel naming the aggregate write-off (D-4) — **and a fully restored record does NOT show it, on reload** (B-1). | U12 + M4.4 + **U14 + the three `load` derivation tests + M4.6/M5.3/M5.4** + manual step 8 |
| AC-5 | The undo's re-open branch flips `status` to `PENDING`, KEEPS `clearedById` and STAMPS `previouslyClearedById`; `clearedAnyItem` bars on either field regardless of status, so the bar survives a later ordinary un-clear by a third actor (D-5 + B-2 option (b)). | U8 (key absence) + **U15** + M4.2 + **M4.8** + C3 suite incl. the third-actor case + M3.1 + **M3.3** + manual steps 6, 7a, 7b |
| AC-6 | The ordinary un-clear path still NULLs `clearedById` and still un-bars — **on items the undo never stamped**. On an item a re-open stamped, the bar is deliberately **permanent for the life of the case** and no un-clear or third-actor re-clear lifts it (B-2 option (b), N-2). | C3 negative control + M3.2 (un-bars), **C3 permanence test** (does not un-bar once stamped) |
| AC-7 | The undo's audit entry is written INSIDE the transaction and carries a populated `oldValue`, **including the `User.isActive` before/after** the undo does not write a `User`-entity row for (SPEC §3c, B-5). | U13 (identity against `txMock`) + **U16** + M2.3 + E2E audit-row assertion |
| AC-8 | Finalize captures every row it is about to overwrite, **before** overwriting it. | C2 snapshot test **with the invocation-order assertion** + M2.1 (which only bites because of it) |
| AC-9 | Restoring a balance that moved since finalize refuses with a 409 rather than overwriting. | U6 + M4.3 |
| AC-10 | `preFinalizeState` never reaches the client. | C5 strip test + M5.1 |

## Phase Completion Rules

This plan is SIMPLE-shaped in delivery (one session, six commits) but COMPLEX in risk class, so the
per-commit bar is stricter than usual:

1. A commit is **CODE DONE** when its own tests pass and all four gates are green.
2. A commit is **VERIFIED** only when every mutation named in that commit's "Mutations that prove
   these bite" list has been applied, observed to fail the named test, and reverted (by `cp` from
   the scratchpad — never `git checkout <file>`).
3. C4 and C6 cannot reach VERIFIED without the hybrid E2E gate actually run against a live
   `veent-db-5434`. A green unit suite is not evidence a guard works.
4. The whole plan cannot reach VERIFIED without the Manual / Live Verification Script completed with
   every positive assertion observed.
5. Honest status only: code written with the E2E unrun is `CODE DONE`, never `VERIFIED`.


## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm format:check` | Fully-Automated | repo gate; CI runs it first, and it is separate from lint. `process/` is `.prettierignore`d so this plan file is exempt |
| `pnpm lint` | Fully-Automated | the only gate catching an orphaned import; the only gate covering `scripts/**` and `prisma/**` |
| `pnpm check` | Fully-Automated | types across `src/**` + `tests/**` only — see What This Plan CANNOT Prove Locally |
| `pnpm test` (U1–U16, C2, C3, C5 suites) | Fully-Automated | D-1 (amended), D-2, D-3, D-4, D-5 (extended), §3c-1/2/3/4 |
| U8 key-absence assertion + M4.2 | Fully-Automated | §3b — the re-open branch does not launder the #297 bar |
| U15 + M4.8/M4.9, and the C3 third-actor case + M3.3 | Fully-Automated | **B-2 closed** — AC-5's bar survives an ordinary un-clear by a third actor |
| U14 + the three `load` derivation tests + M4.6/M5.3/M5.4 | Fully-Automated | **B-1 closed** — AC-4's banner is honest on reload, for restored and pre-#304 records alike |
| U14b + M4.7 | Fully-Automated | **B-4 closed** — AC-1's `CLEARED`/`OPEN` distinction |
| C2 invocation-order assertion + M2.1, and `toBe(txMock)` + M2.2/M2.3 | Fully-Automated | **B-3 closed** — AC-8 and AC-7 are proved by assertions that can actually fail |
| U6 `where` assertion + M4.3 | Fully-Automated | **B-3 closed** — AC-9's conditional restore |
| U16 | Fully-Automated | **B-5 mitigation** — AC-7 carries the login before/after the undo writes no `User` row for |
| C3 negative control + M3.2 | Fully-Automated | D-5 consequence 3 — the ordinary un-clear path still un-bars |
| In-tx re-check projection assertion + **M3.4** | Fully-Automated | **N-1 closed** — the second half of the #297 bar reads `previouslyClearedById`; M3.4 stays `pnpm check`-green and must still go red |
| C3 permanence test (`{CLEARED, clearedById:'C', previouslyClearedById:'A'}` ⇒ A barred) | Fully-Automated | **N-2 closed** — AC-6 as qualified: the bar is permanent once the undo stamps an item |
| E2E rollback proof (balance moved mid-flight ⇒ 409 **and** nothing moved) | Hybrid (needs `veent-db-5434` + `pnpm db:seed:e2e`) | **N-3 closed** — AC-9 plus the atomicity that Owner Decision B-5 was justified by; the only gate that proves a real Postgres rollback |
| E2E finalize→undo round trip | Hybrid (needs `veent-db-5434` + `pnpm db:seed:e2e`) | D-1 and D-4 end-to-end; the only proof the money really returns |
| E2E HR_ADMIN refusal + M6.1 | Hybrid (same precondition) | D-2 — the capability is enforced in the deployed app |
| Manual script step 7b | Agent-Probe (live) | **B-2 closed live** — a third `MANAGE_HR` actor un-clears a re-opened item and the #297 bar holds |
| Manual script steps 8 + 8b | Agent-Probe (live) | D-4's "partially restored" UI state, which no assertion can judge for legibility, **plus the B-1 negative control that it is absent on a fully restored record** |
| Manual script step 3b (HR `curl`) | Agent-Probe (live) | D-2 — the service refuses, asserted on the DB row rather than on a missing button |
| `pnpm db:push` applies cleanly on a populated DB | Hybrid | C1 — additive column and enum value need no migration script |

**Failing stubs** (destined for the validate-contract, not for disk at PLAN time):

```
test("should keep clearedById on a re-opened item during undo", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: reopenClearance:true keeps the clearer")
})
test("should refuse undo for an actor without OVERRIDE_FINALIZED", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: non-SUPER_ADMIN is refused in the service")
})
test("should restore both loan balances from the pre-finalize snapshot", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: snapshot restore of 3000/7000")
})
test("should mark a pre-fix record partially restored and write no loan rows", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: preFinalizeState null ⇒ partial")
})
test("should write the undo audit entry inside the transaction with oldValue", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: in-tx audit asserted toBe(txMock), with oldValue")
})
test("should still bar the clearer after a third actor un-clears a re-opened item", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: B-2 / M3.3 / previouslyClearedById")
})
test("should stamp previouslyClearedById on every re-opened item", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: B-2 / U15 / the undo writes the field")
})
test("should leave preFinalizeState populated after a full undo", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: B-1 / U14 key absence in the claim data")
})
test("should not flag partiallyRestored in load for a fully restored record", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: B-1 / AC-4 through load")
})
test("should set the record to OPEN when clearance is re-opened", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: B-4 / U14b")
})
test("should read every loan before any loan is zeroed", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: B-3 / AC-8 invocation-order assertion")
})
test("should condition the loan restore on balance 0 and status PAID", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: B-3 / AC-9 U6 where-clause assertion")
})
test("should record the login before and after in the undo audit payload", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: B-5 / U16")
})
```

### DONE definition

All four gates green, in this order:

```bash
pnpm format:check   # CI runs this first
pnpm lint
pnpm check
pnpm test
pnpm test:e2e tests/e2e/separations.spec.ts   # requires ./start.sh + pnpm db:seed:e2e
```

Plus: the manual script completed with every positive assertion observed — **steps 3b, 7b and 8b are
not optional**, they are the live negative controls for D-2, B-2 and B-1. Both owner decisions are
already LOCKED (19-08-26), so nothing is blocked on the owner. No commit is DONE on unit tests alone — every guard in C3, C4 and C5 has a named
mutation above, and the mutation must have been observed to fail before the commit is called done.

---

## Manual / Live Verification Script

Preconditions: `./start.sh` running; `pnpm dev`; logged into the **Veent** tenant. psql is
`docker exec veent-db-5434 psql -U veent -d veent_hris -p 5434 -tAc "<sql>"`.
Dev login: `curl -c /tmp/c.txt -X POST localhost:5173/api/v1/_dev/login-as -H 'content-type: application/json' -d '{"email":"…"}'`
(dev-guarded, returns 404 in a built bundle — `_dev/login-as/+server.ts:14`).

**Plant the marker first.** Pick a live employee and tag their separation so it is findable:

```sql
-- find the target and record the ids
SELECT e.id, e."employmentStatus", u.id, u."isActive"
  FROM employees e JOIN users u ON u."employeeId" = e.id
 WHERE u.email = '<target>@veent.ph';
-- plant two findable loans
INSERT INTO loans (id,"employeeId",amount,balance,installment,status,"startDate","createdAt","updatedAt")
VALUES ('undo304a','<empId>',3000,3000,500,'ACTIVE',now(),now(),now()),
       ('undo304b','<empId>',7000,7000,500,'ACTIVE',now(),now(),now());
```

| # | Step | Control named | Assert POSITIVELY |
|---|---|---|---|
| 1 | Log in as `superadmin@veent.ph`. Create + fully clear a separation for the target. | — | record row `status = 'CLEARED'` in psql |
| 2 | Click **Finalize & offboard** (the red button, `+page.svelte:191-197`) | that button | `SELECT balance,status FROM loans WHERE id IN ('undo304a','undo304b')` returns exactly `0\|PAID` twice; employee `OFFBOARDED`; `users.isActive = false`; `preFinalizeState` is **non-null** and contains both loan ids |
| 3a | Reload the page as SUPER_ADMIN | the finalized panel | the panel shows the settled figure and the **Undo finalization** button is present and enabled |
| 3b | Log in as `hr@veent.ph` (HR_ADMIN: `MANAGE_HR`, no `OVERRIDE_FINALIZED`), open the same record, then **`curl` the undo action directly** — do not skip the curl: `curl -b /tmp/c.txt -X POST 'localhost:5173/separations/<id>?/undo' -H 'content-type: application/x-www-form-urlencoded' -d 'reopenClearance=false'` | the `?/undo` form action | the response is a 403-shaped failure **and** `SELECT status FROM separation_records WHERE id='<id>'` still returns `FINALIZED`, and no `SEPARATION_UNDO` audit row exists. The button being absent proves nothing — this repo has that recorded as a lesson. |
| 4 | Back as SUPER_ADMIN, click **Undo finalization** with "Re-open clearance items" **unchecked** | that button + that checkbox | loans read exactly `3000\|ACTIVE` and `7000\|ACTIVE`; employee `ACTIVE`; `users.isActive = true`; record `CLEARED`; `SELECT "oldValue" FROM audit_logs WHERE action='SEPARATION_UNDO' ORDER BY "createdAt" DESC LIMIT 1` returns a **non-null** JSON naming both loan ids; clearance items all still `CLEARED` with their original `clearedById` |
| 5 | Log in as the restored employee | the login form | the dashboard loads — the login really was re-enabled |
| 6 | Re-finalize as the **same** SUPER_ADMIN, then undo again with **"Re-open clearance items" checked** | that checkbox | every clearance item is `PENDING` **and** `clearedById` is still the original id (`SELECT status,"clearedById" FROM clearance_items WHERE "separationId"='<id>'`); the newest audit row's `newValue` contains `"sameActorAsFinalizer": true` and `"reopenedClearance": true` |
| 7a | As the original clearer, try to finalize | the Finalize button | the button is **disabled** and the amber `#finalize-bar` text names the clearer bar — the #297 bar survived the re-open (this is the whole of §3b). Record shows `OPEN`, not `CLEARED` (B-4): `SELECT status FROM separation_records WHERE id='<id>'` returns `OPEN` |
| 7b | **B-2 live proof.** As a THIRD actor holding `MANAGE_HR` (not the clearer, not the SUPER_ADMIN), un-clear one re-opened item via `?/toggleClearance` with `cleared=false`, then check the row: `SELECT status,"clearedById","previouslyClearedById" FROM clearance_items WHERE id='<itemId>'` | that toggle control | `clearedById` is now **NULL** (the ordinary path did its normal thing) **and `previouslyClearedById` is still the original clearer's id**. Then log in as the original clearer: the Finalize button is **still disabled** and `#finalize-bar` still names them. This is the laundering route B-2 found, closed by option (b), observed live. |
| 8 | **Pre-fix record, in this exact order** — (i) re-finalize the separation as SUPER_ADMIN; (ii) confirm `preFinalizeState` is non-null and the loans are `0\|PAID`; (iii) simulate a pre-#304 row: `UPDATE separation_records SET "preFinalizeState" = NULL WHERE id='<id>';`; (iv) reload the page; (v) click **Undo finalization** | the Undo button | the amber **"Partially restored"** panel is visible and names a peso figure equal to the aggregate write-off; loans stay `0\|PAID`; employee is `ACTIVE`; `users.isActive = true` |
| 8b | **B-1 control — the banner must NOT appear on a fully restored record.** Re-finalize once more (which repopulates `preFinalizeState`), undo normally, then **reload the page** | the same panel | the amber panel is **absent** after the reload, and the loans read `3000\|ACTIVE` / `7000\|ACTIVE`. Without this control, step 8 alone would pass even if every undone record claimed "partially restored" — which is exactly the defect B-1 caught. |
| 9 | Cleanup | — | `DELETE FROM loans WHERE id LIKE 'undo304%';` and remove the test separation |

Never `git checkout <file>` to revert any temporary edit made during this script — `cp` to the
scratchpad first.

---

## What This Plan CANNOT Prove Locally

1. **Postgres transaction isolation under real concurrency.** U4 and U6 prove the compare-and-set
   and conditional-restore *code paths* with mocked counts. Two genuinely simultaneous undos are not
   reproducible in vitest, and the E2E is serial. Same residual the payroll void carries; accepted.
2. **`pnpm check` does not cover `prisma/**` or `scripts/**`.** C1 edits `prisma/schema.prisma`;
   only `pnpm lint` and an actual `pnpm db:push` will catch a mistake there. #282 shipped a broken
   site on exactly this assumption.
3. **`pnpm db:push` against a large populated production DB.** Local is a seeded dev DB. Adding a
   nullable column and an enum value is safe in principle; the production timing is unproven.
4. **Whether every pre-#304 finalized record's `finalPayBreakdown` is well-formed.** D-4's banner
   reads it. Old rows are trusted, not verified. Mitigation: the banner must tolerate a missing or
   malformed breakdown by showing "amount unknown" rather than throwing — required, not optional.
5. **That `ACTIVE` is the right restore for a pre-fix record whose employee was `ON_LEAVE`.** It is
   an assumption, recorded in the audit as `restoredStatusAssumed: true` so a human can find it.
6. **Multi-tenant behaviour beyond the Veent tenant.** All manual steps are Veent-scoped.
7. **The undo writes no `User`-entity audit row (B-5, accepted asymmetry — not a gap in coverage).**
   `setUserActive` writes an `UPDATE`/`User` row with `oldValue`/`newValue`; the undo does not,
   because calling `setUserActive` would nest a second transaction and break atomicity (C4, login
   step). The login before/after is folded into the `SEPARATION_UNDO` payload instead (asserted by
   U16), so the information exists — but **anyone querying `User.isActive` history by entityType
   will not see it**. That is a documented consequence of the decision, not an untested behaviour.
8. **Two login-reactivation paths now exist** (`setUserActive` and the undo) and nothing proves they
   stay consistent with each other. Out of scope (NG-1); worth its own issue.

9. **That an org can always recover from the permanent bar (N-2).** After an undo-with-re-open the
   original clearer is barred on that case forever. In a one-HR-admin org that is a deadlock with no
   in-app exit — verified by reading the code paths (no second finalize route, `createSeparation`
   refuses a duplicate, no delete action), not by running it. Recovery is a SUPER_ADMIN DB edit. Not
   reproducible locally because it needs a single-admin tenant; accepted and recorded rather than
   worked around.

**No longer on this list — closed, not deferred:**
- ~~The B-2 laundering residual.~~ **Closed** by owner decision 2 (option (b)): the bar moved to
  `previouslyClearedById`, a field `setClearanceItem` never writes. Proved by the C3 third-actor
  test + M3.3 (unit) and manual step 7b (live). It is a passing gate now, not an accepted hole.

---

## NON-GOALS

Re-read this list if scope moves. A plan in this repo once shipped with non-goals that forbade its
own security fix.

- **NG-1** A general rehire / reactivate feature. `undoSeparation` sets `isActive: true` only as
  part of undoing a finalize — it is not, and must not become, a reactivate endpoint.
  **Corrected (B-5):** it is *not* the only `isActive: true` writer. `setUserActive`
  (`settings/org.ts:323-368`) already is one, CEO-only behind `MANAGE_USER_ROLES`. The claim that
  holds is narrower: the undo is the only writer that moves `Employee.employmentStatus` off
  `OFFBOARDED`. Reconciling the two login-reactivation paths into one audited service is out of
  scope and worth its own issue.
- **NG-2** Editing `employmentStatus` through the v1 employees API. `+server.ts:138-143` stays a 400.
- **NG-3** Changing what `computeFinalPay` computes, or the `FinalPayResult` shape.
- **NG-4** Weakening any #297 separation-of-duties bar. **C3 widens `clearedAnyItem`, which
  STRENGTHENS it — that is in scope and is the point.** Nothing here may make an actor able to
  finalize who could not before.
- **NG-5** A clearance history table (the owner declined it at #297/D8).
- **NG-6** Backfilling payment-ledger rows for historical write-offs, or fixing the pre-existing
  hole that a written-off loan has no payment history row. Worth its own issue.
- **NG-7** A `VOIDED` value on `SeparationStatus` (Overview, SPEC 6.3).
- **NG-8** Undoing a separation that was never finalized, or a second undo of the same finalize.
  Both are 400s by design.
- **NG-9** Any change to `reverseAmortization` or the payroll void path. Read-only reference.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `clearedAnyItem` widening bars someone who could finalize before | High | C3's negative control + M3.2; the ordinary un-clear path is untouched and explicitly commented |
| A bulk re-open launders the #297 bars (SPEC §3b) | High | D-5: `clearedById` never in the re-open `data`; U8 asserts key **absence**; manual step 7a proves it live |
| A *third actor* launders the bar afterwards through the ordinary un-clear (B-2) | High | **Closed by option (b)**, not merely mitigated: the bar is duplicated into `previouslyClearedById`, which `setClearanceItem` never writes or clears. C3 third-actor test + M3.3 + U15 + M4.8 + manual step 7b |
| A re-opened case **permanently** bars its original clearer (N-2) | Medium | **Intended, not mitigated** — it is the price of option (b). Written into the Overview table, AC-6 and the C3 permanence test. Failure shape: a one-HR-admin org whose admin cleared the items loses the old un-clear escape and the case cannot be finalized by anyone in-app (`createSeparation`'s duplicate guard blocks a fresh case; no delete action exists). Recovery is a SUPER_ADMIN DB edit. Recorded in CANNOT-Prove #9 |
| The in-tx re-check reads a narrower projection than the pre-flight bar (N-1) | High | `select` widened at `separation.ts:319`; a projection assertion (not an outcome assertion) plus M3.4, which stays `pnpm check`-green and must still go red |
| The undo's login write is unaudited at `User` level (B-5) | Low | Accepted with mitigation: the before/after is folded into the `SEPARATION_UNDO` payload (U16). Named in What This Plan CANNOT Prove Locally #7 rather than left silent |
| A re-opened case renders as `CLEARED` with nothing cleared (B-4) | Medium | status derived as `reopenClearance ? 'OPEN' : 'CLEARED'`; U14b + M4.7; manual step 7a checks the row |
| The "partially restored" banner fires on a fully restored record (B-1) | High (money lie) | `preFinalizeState` is no longer nulled by the undo; the `load` derivation carries all three terms; U14 + three route tests + M4.6/M5.3/M5.4 + manual step 8b |
| `preFinalizeState` leaks loan ids to the page | Medium | stripped in `load` (C5); asserted by a test with a mock that **has** the key |
| Restoring a balance that moved since finalize | Medium | conditional `updateMany` + 409, copied from `amortization.ts:56-62`; U6 |
| A snapshot read placed after the zeroing writes | Medium | M2.1 is exactly this mutation — **and it only bites because of the invocation-order assertion and the distinct `txMock` added for B-3**; the value assertion alone was vacuous |
| Break-glass door with no second person (D-3) | Medium | accepted by D-3; detect-don't-block marker + `SEPARATION_UNDO` action makes every use findable in the audit filter |
| Enum change mishandled | Low | **adding** a value is `db push`-safe; only renames need `scripts/migrate-*.ts`. Stated in C1 |
| A second nullable column widens C1 | Low | both columns are nullable, unindexed, additive and ride the same `db push`; `pnpm check` does not cover `prisma/**`, so `pnpm lint` plus an actual `pnpm db:push` is the gate (recorded in C1 and in CANNOT-Prove #2) |

---

## Test Infra Improvement Notes

- `tests/unit/separation-*.test.ts` builds its db mock by hand in each file (nine copies of the same
  `vi.hoisted` block). A shared `project()`-honouring mock factory would remove the vacuous-mock
  risk repo-wide. Out of scope here; noted.
- **`$transaction` is a passthrough returning the same `dbMock` in every separation unit file**
  (`separation-finalize-effects.test.ts:46` and siblings). That single line made three of this
  plan's assertions vacuous (B-3): it hides call ordering, makes `tx === db` so no test can prove a
  write happened *inside* the transaction, and merges `computeFinalPay`'s reads with the snapshot's.
  This plan introduces a distinct `txMock` in the files it touches; the other separation test files
  still carry the defect. Extracting a shared `makeTxMock()` and converting the rest is the obvious
  follow-up and is worth its own issue.
- **Rollback is now gated, at hybrid tier (N-3).** No *unit* test can prove it — a
  passthrough/`cb(txMock)` mock cannot roll anything back — so C6's third E2E carries it: move a
  loan balance in SQL mid-flight, assert the 409 **and** that the record/login/employee writes the
  undo already issued did not stick. That covers the one path this design can be made to throw on.
  A *general* fault-injection harness (throw at an arbitrary point inside any `$transaction`) still
  does not exist in this repo and is worth its own issue.
- `tests/e2e/separations.spec.ts` had no DB-fixture teardown pattern before this plan; C6 imports
  the tagged-fixture pattern from `payroll-void-run-amortization.spec.ts`. If that pattern is used a
  third time it should be extracted into `tests/e2e/helpers`.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/separation-undo-304_PLAN_19-08-26.md`
2. **Last completed step:** PLAN revised (**rev 3**) — VALIDATE pass 2 returned CONDITIONAL with
   B-1..B-5 confirmed closed and three new findings N-1/N-2/N-3; this revision closes all three.
   Nothing built. Branch `spec/separation-undo-304` @ `10aec65`, unpushed. `src/` untouched.
3. **Validate-contract status:** written twice (V1 BLOCKED, V2 CONDITIONAL); every finding now
   marked CLOSED with its fix, see the V3 note. The gate must be **re-run from V1** — **this plan
   does not un-block its own gate.**
4. **Context loaded:** the SPEC (in full); `separation.ts` (110-200, 255-370); `payroll/runs.ts`
   (90-152); `payroll/amortization.ts` (1-94); `payroll/audit-markers.ts`; `src/lib/server/audit.ts`;
   `prisma/schema.prisma` (194-207, 954-1000, 1850-1915); `rbac.ts:73`;
   `(app)/separations/[id]/+page.server.ts` and `+page.svelte:175-215`; `tests/e2e/separations.spec.ts`;
   `tests/unit/separation-finalize-sod.test.ts`; `package.json` scripts.
5. **Next step for a fresh agent:** re-run VALIDATE from V1 against rev 3. Both owner decisions are
   LOCKED (snapshot over ledger; B-2 option (b); `previouslyClearedById`) — do not re-open any of
   them, and do not re-litigate B-1..B-5, which V2 confirmed closed. If VALIDATE passes, start at
   C1, which carries **two** additive nullable columns plus the enum value. C3 now also carries the
   `separation.ts:319` `select` widening (N-1) and C6 a third E2E (N-3).

**Blocked on:** nothing external. Awaiting re-VALIDATE only.

---

## Validate Contract

Status: BLOCKED (V1 run, 19-08-26) → **all five findings CLOSED in plan rev 2, 19-08-26. Awaiting re-VALIDATE.**
Date: 19-08-26 (contract), 19-08-26 (revision)
date: 2026-08-19
generated-by: outer-pvl

Parallel strategy: sequential (single-plan, single-package, one reviewer; fan-out would have split
the one enumeration — every writer of `ClearanceItem.clearedById` — that the whole verdict turns on)
Rationale: 4/7 signals present (S2 schema+auth, S5 user asked for depth, S6 high-risk class, S7 10
files). Dominant signal S6. Threshold says HIGH, but the auto-skip-by-fit rule applies: the decisive
work was one cross-file writer trace that must stay in one head.

### Net gate derivation

| Layer 1 dimension | Status |
|---|---|
| Infra fit | PASS |
| Test coverage | FAIL |
| Breaking changes | CONCERN |
| Security surface | FAIL |

| Layer 2 section | Status |
|---|---|
| C1 — schema | PASS |
| C2 — finalize snapshot + in-tx audit | CONCERN |
| C3 — `clearedAnyItem` widening | FAIL |
| C4 — `undoSeparation` | FAIL |
| C5 — route + UI | FAIL |
| C6 — E2E + docs | PASS |
| Owner-confirmation section (ledger vs snapshot) | PASS — independently re-derived, sound |

Totals: 4 FAILs / 2 CONCERNs / 4 PASSes → **Net Gate: BLOCKED**

### Resolution status of the blocking findings (rev 2, 19-08-26)

| Finding | Status | How it was closed |
|---|---|---|
| B-1 | **CLOSED** | `preFinalizeState: Prisma.DbNull` deleted from C4's claim (a re-finalize overwrites it anyway per C2 step 3); C5's `load` detector is now the three-term `preFinalizeState === null && finalPayBreakdown !== null && status !== 'FINALIZED'`, computed before the strip; AC-4 is proved through `load` by U14 + three route tests + M4.6/M5.3/M5.4 + manual step 8b. |
| B-2 | **CLOSED** | Owner locked option (b): additive `ClearanceItem.previouslyClearedById String?`, written ONLY by the undo's re-open branch, read by `clearedAnyItem` alongside `clearedById`, and never written or cleared by `setClearanceItem` (stated in the C3 code comment). Options (a) — recorded with its deadlock — and (c) rejected. M3.3 now **PASSES** rather than documenting a residual; U15/M4.8 prove the write, manual step 7b proves it live. |
| B-3 | **CLOSED** | `$transaction` now gets a **distinct `txMock`** (not a passthrough returning `dbMock`), separating `computeFinalPay`'s `db.loan.findMany` from the snapshot's `tx.loan.findMany` and making U13's `toBe(txMock)` meaningful (plus new M2.3, previously unkillable). M2.1 backed by an explicit `invocationCallOrder` assertion; U6 asserts the `where` object, not just the count. Every other test in C2/C4/C5 was re-swept for the same vacuity — findings recorded under C4 "Projection safety and non-vacuity". |
| B-4 | **CLOSED** | The undo derives `nextStatus = reopenClearance ? 'OPEN' : 'CLEARED'`. D-1 amended in the Overview with the rule stated plainly: **`CLEARED` when the items are kept, `OPEN` when they are re-opened, because a re-opened case has nothing cleared.** Listed as a Public Contract change; U14b + M4.7; manual step 7a checks the live row. |
| B-5 | **CLOSED** | The false claim is corrected in C4, in NG-1 and in Blast Radius: `setUserActive` (`settings/org.ts:323-368`) is an existing `isActive: true` writer, CEO-only behind `MANAGE_USER_ROLES` at `settings/roles/+page.server.ts:38,92`, with a self-guard at `:332` and a `User` audit row. **Decision recorded: the undo keeps its own `tx.user.updateMany`** — `setUserActive` opens its own serializable `db.$transaction` and audits outside it, so calling it would nest a transaction and break atomicity. The self-guard is not an obstacle (the account is always the leaver's, never the actor's). The cost — no `User`-entity audit row — is mitigated by folding `userIsActive` before/after into the `SEPARATION_UNDO` payload (U16) and is named in CANNOT-Prove #7, not left silent. |

Improvements I-1 … I-6 all applied: I-1 the stricter-than-amortization idiom is now stated with a
"do not correct this back" note; I-2 the two unaffected test files are recorded in Touchpoints; I-3
the blind-employee-write asymmetry is explained in C4; I-4 manual step 8 rewritten as a clean
five-part sequence (plus the new 8b control); I-5 manual step 3 split into 3a/3b; I-6 the
CANNOT-Prove list rewritten — the B-2 residual is **removed** from it (closed, not accepted) and
replaced by the two B-5 consequences.

### Blocking findings (as originally raised — kept as the record)

**B-1 — the undo destroys the field the "partially restored" banner reads (FAIL).**
C4 step 5 writes `preFinalizeState: Prisma.DbNull` in the compare-and-set claim. C5's persistence
rule derives the banner in `load` from `finalPayBreakdown !== null && status === 'CLEARED'` and
says "that combination only occurs after an undo". True — but it occurs after *every* undo, and
after any undo `preFinalizeState` is also null, so nothing left on the row distinguishes a fully
restored record from a pre-#304 one. A record whose money was restored perfectly renders the amber
panel claiming balances "could not be restored automatically — re-enter them manually". That is a
money lie on a reload, and AC-4 is unprovable through `load` as written.
Evidence: plan C4 step 4, C4 step 5 bullet 1, C5 "Persistence note"; `[id]/+page.server.ts:17-22`.
Fix: delete `preFinalizeState: Prisma.DbNull` from the claim. A later re-finalize overwrites the
column anyway (C2 step 3 adds it to finalize's claim data), so nulling buys nothing. The load-time
detector then becomes `preFinalizeState === null && finalPayBreakdown !== null && status === 'CLEARED'`
and is correct. Add U14 "a full undo leaves preFinalizeState populated" and a route test "load does
not flag partial for a fully restored record".

**B-2 — D-5's guarantee is defeatable in one ordinary call by a non-privileged actor (FAIL).**
This is the documented repo failure mode exactly: the widened guard is correct, and a *different*
writer quietly NULLs the field it reads. `clearedAnyItem` will read `ClearanceItem.clearedById`.
`setClearanceItem` (`separation.ts:196-202`) NULLs that field on un-clear, and its ownership guard
(`:192`) fires only when `item.status === 'CLEARED'`. After the undo's re-open an item is
`{status:'PENDING', clearedById:'A'}` — the guard does not fire. The record is `CLEARED`, not
`FINALIZED`, so `:181` does not block edits either. So any `MANAGE_HR` holder can POST
`?/toggleClearance` with `cleared=false` once per item and strip every preserved clearer. No
`OVERRIDE_FINALIZED`, no break-glass. The plan's Risks table marks this risk mitigated and AC-5
claims the guarantee; both are false as written.
Evidence: `separation.ts:181`, `:192`, `:196-202`; `[id]/+page.server.ts:32-55`; plan C3 comment
text, C4 step 5 "clearance" bullet, AC-5, Risks row 2.
Fix — pick one and record it:
- (a) widen `setClearanceItem`'s guard the same way (`if (item.clearedById && item.clearedById !== ctx.actorId)`).
  Compatible with the existing suite (`separation-clearance-reclear.test.ts:110` uses a null
  `clearedById`), **but it deadlocks**: after a re-open only A may touch A's item, A stays barred
  from finalizing, and nobody else can re-clear it. (a) is only viable with an explicit escape —
  e.g. restrict only un-clear/re-clear of a CLEARED row, leave clearing a PENDING row open to all.
- (b) **recommended.** Carry the preserved clearer in a field `setClearanceItem` never writes: one
  more additive nullable column `ClearanceItem.previouslyClearedById String?`, written only by the
  undo's re-open branch, read by `clearedAnyItem` alongside `clearedById`. No deadlock, ordinary
  path untouched, AC-6 unaffected, same `db push`-safe C1 commit.
- (c) minimum acceptable: keep D-5 as designed and delete the claim. Restate AC-5 and the Risks row
  as "raises laundering from one privileged call to N individually-audited ordinary calls; does not
  eliminate it", pin the residual in a unit test, and add a manual step that performs the launder
  and records that it succeeds.
Either way add M3.3 — un-clear a re-opened item as a third actor, assert the bar survives.

**B-3 — two of the plan's named mutations cannot bite (FAIL, test coverage).**
- M2.1 ("move the snapshot reads below `loan.updateMany`; the test must fail with balances of 0")
  will pass. `separation-finalize-effects.test.ts:13-24` is a stateless `vi.hoisted` mock and `:46`
  makes `$transaction` a passthrough returning the same `dbMock`; `loan.updateMany` is a bare
  `vi.fn()` that does not mutate what `loan.findMany` resolves. Order is invisible. The plan's
  `project()` helper fixes row *shape*, not ordering.
  Fix: assert order — `expect(Math.max(...dbMock.loan.findMany.mock.invocationCallOrder)).toBeLessThan(dbMock.loan.updateMany.mock.invocationCallOrder[0])`, plus the cashAdvance mirror.
- M4.3 ("change the restore `where` to `{ id }`; U6 must fail") will pass. U6 works by
  `loan.updateMany.mockResolvedValue({count:0})`; a flat mock ignores `where` and returns `{count:0}`
  either way, so the 409 still throws.
  Fix: U6 must also assert the `where` —
  `expect(dbMock.loan.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ balance: 0, status: 'PAID' }) }))`.
- Related: U13/M2.2's "3rd arg is the tx client". Under the passthrough, `tx === db`, so the
  assertion cannot tell them apart. M2.2 (dropping the arg) bites; a mutation passing `db`
  explicitly does not.
  Fix that also cleans up M2.1: give `$transaction` a **distinct** `txMock` object with its own
  model fns and assert against `txMock`. This separates `computeFinalPay`'s `db.loan.findMany` from
  the snapshot's `tx.loan.findMany` — today they are the same mock with the same flat return, which
  is the plan's own #1 recorded failure mode reproduced inside its own test design.

**B-4 — a re-opened case is left claiming CLEARED with zero cleared items (FAIL).**
When `reopenClearance` is true, C4 sets `status: 'CLEARED'` and flips every item to PENDING.
`setClearanceItem`'s roll-forward (`separation.ts:206-216`) is what keeps those two in sync
everywhere else; the undo skips it. Not exploitable — `finalizeSeparation:302-303` still counts
pending items and refuses — but the list badge (`separations/+page.svelte:18`) and detail page show
a cleared case, and the next `toggleClearance` silently rewrites the status.
Fix: derive the claim's status in-tx (`remaining === 0 ? 'CLEARED' : 'OPEN'`), or simply set `'OPEN'`
when `reopenClearance`. Amend D-1's wording. Add U14b: `reopenClearance:true` ⇒ claim data status
`'OPEN'`; `false` ⇒ `'CLEARED'`.

**B-5 — a stated fact is wrong, twice (FAIL, security surface framing).**
C4 says the undo's `tx.user.updateMany` is "the first and only `isActive: true` writer in
`src/lib/server` (SPEC §2 verified none exists)", and NG-1 repeats it. `setUserActive`
(`src/lib/server/services/settings/org.ts:323-368`) already writes `data: { isActive }` with `true`
reachable, exposed at `src/routes/(app)/settings/roles/+page.server.ts:38,92` behind
`MANAGE_USER_ROLES` (CEO-only, `rbac.ts:75`). A CEO can re-enable an offboarded employee's login
today with no separation undo at all. Two consequences: the break-glass framing is overstated, and
the undo's blind `user.updateMany` bypasses `setUserActive`'s guardrails and writes **no
`User`-entity audit row**, where `setUserActive` writes one with `oldValue`/`newValue`
(`org.ts:359-366`).
Fix: correct both statements. The claim that IS true and independently re-derived here: undo would
be the only writer that moves `Employee.employmentStatus` away from `OFFBOARDED` — the only two
`employmentStatus` writers in `src/` are `separation.ts:350` and `employees.ts:1223`, and the v1 API
rejects it at `api/v1/employees/[id]/+server.ts:136-141`. Then either fold the `User.isActive`
before/after into the `SEPARATION_UNDO` audit payload (cheapest) or state why no separate `User`
audit row is written.

### Improvements (non-blocking)

- **I-1** C4 calls the loan restore "the conditional restore idiom from `amortization.ts:52-62`". It
  is a different idiom: amortization conditions on the balance it just READ in-tx
  (`where: { id, balance: loan.balance }`, `:54-56`); the plan conditions on the constant
  post-finalize state (`balance: 0, status: 'PAID'`). The plan's version is stricter and better —
  say so, or a reviewer will "correct" it back.
- **I-2** Touchpoints omits `tests/unit/separation-characterization.test.ts` and
  `separation-clearance-reclear.test.ts`. Both checked here: neither calls `clearedAnyItem`, both
  stub `writeAuditLog` wholesale (`:30` / `:26`), so C2 and C3 should not break them. Record the
  check so EXECUTE does not re-derive it.
- **I-3** The employee restore is a blind `tx.employee.update` while the money writes are
  compare-and-set. Exposure is small (see B-5's writer count) — but name the asymmetry rather than
  leaving it unexplained.
- **I-4** Manual script step 8 is garbled ("then re-finalize… no — instead finalize, then NULL the
  column, then undo"). Rewrite as a clean numbered sequence. This repo has a recorded lesson that
  manual steps must be exact.
- **I-5** Manual step 3 bundles two checks (HR sees no button; HR curl is refused). Split into 3a/3b
  so the negative control cannot be skipped.
- **I-6** Add to "What This Plan CANNOT Prove Locally": the B-2 residual, and (until B-5 is
  resolved) that the undo writes no `User`-entity audit row.

### Riskiest reasoning independently re-derived and found SOUND

- **No twin door.** `find src/routes -ipath '*separat*'` returns exactly 4 files. The only actions
  are `create` (`separations/+page.server.ts:35`) and `toggleClearance`/`finalize`
  (`[id]/+page.server.ts:32,58`). No `api/v1/separations`. The form action really is the only
  finalize surface, and will be the only undo surface.
- **`reverseAmortization` cannot be reused.** `amortization.ts:26-31` drives from
  `tx.payrollEntry.findMany({ where: { payrollRunId: runId } })` → `entry.deductions`; a separation
  write-off has no run, entry or deduction line. SPEC §6.2's premise is wrong; rejecting the ledger
  is correct, and the "we could insert a null-keyed row but could not tell it from a real manual
  payment" argument holds.
- **The widening is a genuine no-op on all existing data.** `setClearanceItem:198-202` is the ONLY
  writer of `ClearanceItem.status`/`clearedById` anywhere in `src/` or `scripts/` (creation at `:51`
  is a nested `create` that sets neither), and it can never produce
  `{status:'PENDING', clearedById: <non-null>}`. So the only rows the widened rule newly bars are
  undo-re-opened ones. Nobody is barred forever by the widening itself.
- **AC-6 holds.** The ordinary un-clear NULLs `clearedById`, so `items.some(i => i.clearedById === actorId)`
  is false and the clearer is un-barred. Correct — and it is the same mechanism that makes B-2 true.
- **Snapshot ordering is right.** Reads after the compare-and-set claim (`:325-335`) and before the
  two blanket `updateMany`s (`:339-346`); a losing concurrent finalize is excluded by `count === 0`.
- **Double undo is genuinely covered.** `where: { id, status: 'FINALIZED' }` makes the second undo
  `count === 0` → 400. The compare-and-set claim is sufficient.
- **The stale-money question is handled.** A loan created after the finalize is untouched (restore is
  by snapshot id); a snapshot loan whose balance moved is caught by the 409. The design is sound —
  only its test is vacuous (B-3).
- **Schema safety.** An additive enum value plus a nullable column are `db push`-safe; no
  `scripts/migrate-*.ts` needed. Correct per the repo rule.
- **`process/` is `.prettierignore`d** (`.prettierignore:17`), so the plan file is exempt from
  `format:check`. `pnpm check` is `svelte-check` on the tsconfig; `pnpm lint` is `eslint .`. The
  plan's coverage caveat is accurate.
- **The inverting test was identified correctly.** `separation-finalize-sod.test.ts:104-108` is
  exactly the case whose expectation flips, and the plan named it.

### Test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1 | undo leaves FINALIZED — CLEARED when items kept, OPEN when re-opened (B-4 closed) | Hybrid | `pnpm test:e2e tests/e2e/separations.spec.ts` — precondition `./start.sh` + `pnpm db:seed:e2e` | B |
| AC-2 | non-`OVERRIDE_FINALIZED` refused in the service | Hybrid | HR_ADMIN negative-control E2E + M6.1, same command | B |
| AC-3 | self-undo marker present / absent | Fully-Automated | `pnpm test` — U10, U11, M4.5 | A |
| AC-4 | pre-fix record partially restored, banner honest | Fully-Automated | `pnpm test` — U12, M4.4, **plus new U14 + load test (B-1)** | B |
| AC-5 | re-open keeps `clearedById`; bar keys on it alone | Fully-Automated | `pnpm test` — U8 key-absence, M4.2, C3 suite, M3.1, **plus new M3.3 (B-2)** | B |
| AC-6 | ordinary un-clear still un-bars | Fully-Automated | `pnpm test` — C3 negative control + M3.2 | A |
| AC-7 | undo audit inside the tx with `oldValue` | Fully-Automated | `pnpm test` — U13 **with a distinct txMock (B-3)** | B |
| AC-8 | finalize snapshots before overwriting | Fully-Automated | `pnpm test` — **invocation-order assertion (B-3), not the current M2.1** | B |
| AC-9 | a moved balance refuses with 409 | Fully-Automated | `pnpm test` — U6 **with a `where` assertion (B-3)** | B |
| AC-10 | `preFinalizeState` never reaches the client | Fully-Automated | `pnpm test` — strip test + M5.1 | A |
| AC-5 | B-2 **closed**: launder attempt via `?/toggleClearance` | Fully-Automated + Agent-Probe | `pnpm test` — C3 third-actor case, M3.3, U15, M4.8; live: manual step 7b — un-clear a re-opened item as a third HR actor and observe the bar **hold** | B |
| — | `pnpm db:push` on a populated DB | Hybrid | `pnpm db:push` against `veent-db-5434` | C |
| AC-4 | banner legibility and peso figure, and its **absence** on a fully restored record | Agent-Probe | manual script steps 8 and 8b (rewritten per I-4) | A |
| — | Postgres isolation under real concurrency | Fully-Automated (none exists) | — | C — named residual, same as the payroll void |

gap-resolution legend: A — proven now. B — gate added by this plan's checklist. C — deferred/accepted
residual. D — backlog test-building stub.

Legacy line form:
- separation service (undo + widened bar): [Fully-automated: `pnpm test`] + [hybrid: `pnpm test:e2e tests/e2e/separations.spec.ts` — precondition `./start.sh` + `pnpm db:seed:e2e`]
- schema: [hybrid: `pnpm db:push` — precondition `veent-db-5434` running]
- route/UI: [Fully-automated: `pnpm test`] + [agent-probe: manual script §7]
- repo gates: [Fully-automated: `pnpm format:check && pnpm lint && pnpm check`]
- concurrency isolation: [known-gap: documented — accepted residual, mirrors the payroll void]

Failing stubs (Fully-Automated rows only):

```
test("should keep clearedById on a re-opened item during undo", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: reopenClearance:true keeps the clearer")
})
test("should still bar the clearer after a third actor un-clears a re-opened item", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: B-2 residual / M3.3")
})
test("should read every loan before any loan is zeroed", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: invocation-order assertion for AC-8")
})
test("should condition the loan restore on balance 0 and status PAID", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: U6 where-clause assertion for AC-9")
})
test("should leave preFinalizeState populated after a full undo", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: B-1 / AC-4 detector")
})
test("should set the record to OPEN when clearance is re-opened", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: B-4")
})
test("should write the undo audit inside the transaction with oldValue", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: in-tx audit, asserted against a distinct txMock")
})
```

Dimension findings:
- Infra fit: PASS — every command in the DONE definition resolves against `package.json:10-20`;
  `process/` is `.prettierignore`d; additive schema change is `db push`-safe; no container or port
  surface is touched.
- Test coverage: FAIL — B-3. Two named mutations (M2.1, M4.3) cannot fail their tests under the
  existing stateless passthrough mock, and U13's tx assertion cannot distinguish `tx` from `db`.
- Breaking changes: CONCERN — the `clearedAnyItem` signature is unchanged and its only callers are
  `finalizeBarFor:159` and the in-tx re-check `:321`, both internal. But the semantic change plus
  B-4's status change alter observable record state (`SeparationStatus` after a re-open) and the
  plan does not list that as a contract change.
- Security surface: FAIL — B-2 (a claimed separation-of-duties guarantee is defeatable by a
  non-privileged actor via a second writer) and B-5 (a stated fact about the `isActive` write
  surface is wrong, and the undo's user write is unaudited at field level).
- C3 feasibility: FAIL — mechanically trivial (one `.some()` predicate, edit target unique at
  `separation.ts:129`), but the guard it creates is incomplete; highest-risk edit is the comment
  rewrite, which as drafted documents the laundering route as deliberate without noticing it is one.
- C4 feasibility: FAIL — edit targets and the `voidRun` mirror are all findable and correct; B-1 and
  B-4 are logic gaps in the transaction body; highest-risk edit is the compare-and-set claim's `data`
  object, which carries both defects.
- C5 feasibility: FAIL — the `load` strip and the action shape are mechanically sound; the banner's
  persistence rule is B-1. Highest-risk edit is the `load` derivation.
- C1/C2/C6 feasibility: PASS / CONCERN / PASS — C2's only issue is its test design (B-3), not its
  code.

Known Gaps (excluded from the gate count): none — no `## Known Gaps (Resolved via Backlog)` section
exists in this plan.

Open gaps:
- Postgres transaction isolation under genuine concurrency — accepted residual, identical to the one
  the payroll void already carries.
- `pnpm db:push` timing against a large populated production DB — unproven locally.
- Whether every pre-#304 `finalPayBreakdown` is well-formed — the plan's own mitigation (render
  "amount unknown" rather than throw) is required, not optional.
- Multi-tenant behaviour beyond the Veent tenant.
- B-2's residual laundering route, if resolution (c) is chosen.

What this coverage does NOT prove:
- `pnpm test` proves the writes are ISSUED, not that they are atomic. `$transaction` is a passthrough
  in every separation unit file (`separation-finalize-effects.test.ts:46`). Rollback on a mid-undo
  throw is proven nowhere; the E2E round trip is the happy path only.
- The E2E round trip does NOT prove the 409 stale-balance path, the concurrent-undo 400, or the
  pre-fix (`preFinalizeState IS NULL`) branch — all three are mock-only.
- The HR_ADMIN negative-control E2E proves `OVERRIDE_FINALIZED` is enforced for HR_ADMIN
  specifically. It does not prove enforcement for the other seven roles, nor that the capability
  table itself is right.
- `pnpm check` covers `src/**` and `tests/**` only. It does NOT type-check `prisma/**` or
  `scripts/**`; only `pnpm lint` and an actual `pnpm db:push` catch a mistake in C1.
- `pnpm db:push` on the seeded dev DB does not prove the same push on production data.
- **(superseded by rev 2)** The two bullets here previously read "no gate proves the B-2 residual is
  closed" and "no gate proves the banner shows for the right records". Both were consequences of
  B-2 and B-1 being open. Rev 2 closes both: the B-2 bar now lives in `previouslyClearedById` and is
  proved by the C3 third-actor test, M3.3, U15/M4.8 and manual step 7b; the banner detector is the
  three-term `load` derivation, proved by U14, three route tests, M4.6/M5.3/M5.4 and manual step 8b.
- What is still NOT proved by any gate: transaction **rollback** on a mid-undo throw (mock
  `$transaction` cannot roll back — the distinct `txMock` fixes ordering and identity only), and
  real concurrent-undo isolation.

Gate (V1, 19-08-26): **BLOCKED** — 5 unresolved FAILs, B-1 through B-5. Returned to PLAN.

Gate (restated after plan rev 2, 19-08-26): **all five findings are CLOSED**, and both owner
decisions are LOCKED, so nothing is blocked on the owner. The plan is ready for VALIDATE to run
again — it is **NOT** self-declared PASS. A plan does not un-block its own gate.

- **Next state: re-run VALIDATE from V1.** Do NOT route to EXECUTE on this section alone.
- The four failing Layer-1/Layer-2 statuses above (test coverage, security surface, C3, C4, C5)
  should all be re-derived against rev 2, not assumed to have flipped.
- **Honest residuals — carried forward, not closed:** (1) Postgres isolation under real concurrency
  is unproven at any tier (same residual the payroll void carries); (2) rollback on a mid-undo throw
  is proven nowhere, because every separation unit file mocks `$transaction` — the distinct `txMock`
  fixes ordering and identity, **not** atomicity; (3) the undo writes no `User`-entity audit row,
  accepted with the payload mitigation; (4) `pnpm db:push` against a large populated production DB
  is unproven. None of these is a B-finding; all four are recorded in "What This Plan CANNOT Prove
  Locally" and in Test Infra Improvement Notes.

Accepted by: n/a — the gate has not been re-run.

---

## Validate Contract — V2 (re-validate of plan rev 2)

Status: CONDITIONAL
Date: 19-08-26
date: 2026-08-19
generated-by: outer-pvl
supersedes: 2026-08-19 (outer-pvl) — V1 BLOCKED contract above; this V2 pass re-derives every finding against rev 2

Scope of this pass: NARROW — verify B-1..B-5 are actually closed, and hunt for defects the fixes
themselves introduced. Owner decisions (snapshot over ledger; B-2 option (b)) not re-opened.

Parallel strategy: sequential
Rationale: 4/7 signals (S2, S5, S6, S7); dominant S6. Same fit reason as V1 — the decisive work is
one cross-file writer/select trace that must stay in one head. Fan-out would have split it.

### B-1..B-5 verdicts

| # | Verdict | Evidence |
|---|---|---|
| B-1 | **CLOSED** | `preFinalizeState: Prisma.DbNull` is gone from C4's claim; the C5 `load` detector is the three-term form computed **before** the strip (plan C5, "Persistence note (corrected, B-1)"). Walked every path in source terms: finalized-after-fix ⇒ column populated by C2 step 3 ⇒ no banner; undone ⇒ column survives ⇒ no banner; **re-finalized ⇒ finalize's own claim `data` overwrites the column ⇒ still no banner**; pre-#304 + undone ⇒ null + breakdown + not-FINALIZED ⇒ banner; pre-#304 never undone ⇒ third term false ⇒ correctly silent; never finalized ⇒ second term false ⇒ silent. The detector is right in every path including finalize→undo→re-finalize. U14 (key absence), the three `load` tests, M4.6/M5.3/M5.4 and manual 8b all bite. |
| B-2 | **CLOSED (with N-1 attached)** | Writer trace re-run in source, not taken from the plan: `grep -rn clearedById src scripts prisma` returns exactly one writer — `separation.ts:196-202` (`setClearanceItem`). Creation at `:58` is a nested `create` that sets neither field. So no path other than the undo can write, and nothing at all can clear, `previouslyClearedById`. The bar genuinely survives an ordinary un-clear. **But see N-1: the in-tx re-check's `select` at `separation.ts:319` does not carry the new field, so the second layer of the bar is silently narrower than the first.** |
| B-3 | **CLOSED** | Re-checked in source rather than trusting the sweep. `separation-finalize-effects.test.ts:46` is confirmed `dbMock.$transaction.mockImplementation(fn => fn(dbMock))` — the passthrough B-3 named. The distinct `txMock` fixes it for real: `computeFinalPay` reads through `db.loan.findMany` (`separation.ts:261`, `select: { balance: true }`) while the snapshot reads `tx.loan.findMany` (`select: {id,balance,status}`) — different objects, so the shared-flat-mock vacuity is gone. Sampled six of the named tests: U1 (`db.separationRecord.findFirst` never called — throws first, non-vacuous), U4 (negative on `txMock.loan`), U9 (negative on `txMock.clearanceItem`), U12 (negative, kills M4.4), U13/M2.3 (`toBe(txMock)` — `db !== txMock`, so passing `db` now fails; previously unkillable), U15 (`invocationCallOrder` across two distinct `vi.fn()`s on one object — works). M2.3, M4.6–M4.9, M5.3, M5.4 all bite as claimed. No vacuity found in the sample. |
| B-4 | **CLOSED** | The distinction is stated plainly in three places (Overview "D-1 amendment", Public Contracts row, C4 claim bullet) — not hidden. Checked every status consumer: `setClearanceItem`'s roll-forward (`separation.ts:206-216`) computes `remaining === 0 ? 'CLEARED' : 'OPEN'` — after a re-open every item is `PENDING` ⇒ it re-derives `OPEN`, so the undo and the roll-forward now AGREE (under rev 1 they disagreed); after an undo without re-open all items are `CLEARED` ⇒ it re-derives `CLEARED`, also agreeing. List badge (`separations/+page.svelte:19-21`) maps non-CLEARED/non-FINALIZED to the yellow pending style — correct for a re-opened case. Finalize gate (`separation.ts:307`) counts items, not status — unaffected. `createSeparation`'s duplicate guard keys on `status: { not: 'FINALIZED' }` — an undone case still blocks a second case, which is the wanted behaviour. Nothing breaks. |
| B-5 | **CLOSED — reasoning verified in source** | `org.ts:334-357`: `setUserActive` does open its **own** `db.$transaction(..., { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })`, and `org.ts:359-366` writes its `User` audit row **outside** that transaction. The self-guard is at `org.ts:332`. So the nesting/atomicity argument is TRUE, not asserted — keeping the undo's own `tx.user.updateMany` is correct, and the named cost (no `User`-entity audit row, mitigated by `userIsActive` in the `SEPARATION_UNDO` payload, U16) is the honest write-up of it. |

### New findings

| # | Severity | Finding | Concrete fix |
|---|---|---|---|
| N-1 | **CONCERN (high)** — introduced by the B-2 fix | `clearedAnyItem` will read `previouslyClearedById`, but the **in-transaction re-check** feeds it a projection that does not contain the field: `separation.ts:317-320` selects `{ status: true, clearedById: true }`. Because `ClearanceActorRef` gains the field as *optional*, `pnpm check` stays green and the second bar silently degrades to `clearedById`-only. The pre-flight `finalizeBarFor` is unaffected (it is fed `getSeparation`'s full `clearanceItems` include, `separation.ts:111`), so the UI and the ordinary refusal still hold — but the re-check exists **only** to close the race the pre-flight cannot (`separation.ts:313-316` says so in as many words), and that is exactly the half that loses the new field. No gate in the plan catches it: C3's tests are pure-function, C2 mocks the re-read as `[]`, and manual step 7b observes the pre-flight (a disabled button), not the race. This is the repo's own recorded failure mode — a guard widened while a reader still projects the old shape. | Add to C3: *"widen the in-tx re-check's `select` at `separation.ts:319` to `{ status: true, clearedById: true, previouslyClearedById: true }` — `clearedAnyItem` now reads a field this projection omits, and the optional type will not catch the omission."* Add a C2/C3 test asserting the select: `expect(txMock.clearanceItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ previouslyClearedById: true }) }))`, and mutation **M3.4** — drop `previouslyClearedById` from the select; that test must fail. |
| N-2 | **CONCERN (medium)** — introduced by the B-2 fix | The bar is now **permanent for the life of the case**, and the plan does not say so. Nothing can clear `previouslyClearedById` (that is the point of option (b)). Walked the sequence: after undo-with-re-open the item is `{PENDING, clearedById:'A', previously:'A'}` — A barred; a third actor C re-clears it (`setClearanceItem`'s ownership guard at `:192` does not fire, the row is `PENDING`) leaving `{CLEARED, clearedById:'C', previously:'A'}` — **A is still barred, forever, on that case, even though A cleared nothing that now stands**; C is barred too. Who may finalize at each step: (i) right after the undo — nobody (items `PENDING`, `separation.ts:308` refuses); (ii) after C re-clears — anyone except A, C, and the leaver's own user. Usually fine. The failure shape: a one-HR-admin org where that admin cleared the items — before #304 they could un-clear to un-bar themselves; after #304 that escape is gone and the case cannot be finalized by anyone in-app (a new case is blocked by `createSeparation`'s duplicate guard, and no delete action exists). Recovery is a DB edit only. Related: **AC-6 as worded is now too strong** — "the ordinary un-clear path still un-bars" is true only on a case that was never undone. | No scope change needed — state it. (i) Amend AC-6 to *"…still un-bars **on items the undo never stamped**; on a re-opened item the bar is deliberately permanent (B-2)."* (ii) Add a Risks row: *"a re-opened case permanently bars its original clearer — deadlock possible in a one-admin org; recovery is a SUPER_ADMIN DB edit"*. (iii) Add a C3 test pinning it as intended: item `{CLEARED, clearedById:'C', previouslyClearedById:'A'}` ⇒ `clearedAnyItem(items,'A') === true`, commented as deliberate permanence. (iv) Add the deadlock to "What This Plan CANNOT Prove Locally". |
| N-3 | **CONCERN (medium)** — residual classification, not a defect | The four recorded residuals are stated honestly and in the right places (Test Infra Notes, CANNOT-Prove #1–#8, the contract's "What this coverage does NOT prove", and the carried-forward list). Three of them (concurrency isolation, prod `db:push` timing, no `User` audit row) are correctly accepted. The fourth — **no gate at any tier proves transaction rollback** — is *not* acceptable as a bare accept for this risk class: the blast radius is money reversal plus login re-enablement, and the whole B-5 decision was justified *by* atomicity. A hybrid gate is cheap and the pattern already exists: `tests/e2e/payroll-void-run-amortization.spec.ts` has the tagged-fixture/teardown shape C6 already copies. | Add to C6 a second E2E: finalize, then move one loan's balance in SQL, then undo ⇒ assert the 409 **and** that nothing moved — record still `FINALIZED`, `users.isActive` still false, employee still `OFFBOARDED`, the other loan still `0|PAID`, no `SEPARATION_UNDO` audit row. That is a real rollback proof on the one path the design can actually be made to throw. Re-tier the residual from `C` (accept) to `B` (gate added by this plan). Keep concurrency isolation as `C`. |

### Verified in source vs taken from the plan text

**Verified in source (read the file, not the plan's quote of it):** `clearedAnyItem` and its comment
(`separation.ts:127-130`); `setClearanceItem` in full incl. the `:192` ownership guard, the `:196-202`
write and the `:206-216` roll-forward; `finalizeSeparation` in full incl. the in-tx re-check select at
`:317-320`, the claim at `:325-335` and the cascade at `:339-355`; `getSeparation`'s full
`clearanceItems` include (`:111`); `computeFinalPay`'s `db.loan.findMany` at `:261`; `setUserActive`
(`org.ts:323-368`) — own serializable `$transaction`, audit outside, self-guard at `:332`; the repo-wide
writer trace for `clearedById` and `clearanceItem` across `src`, `scripts`, `prisma` (one writer);
`separation-finalize-effects.test.ts:13-46` (the passthrough `$transaction` and the flat model mocks);
`separation-finalize-sod.test.ts:103-108` (the inverting assertion — the plan named it correctly);
`separations/+page.svelte:18-24` (the status badge); `[id]/+page.server.ts:13-30` (the load and the
`finalizeBarFor` call); `tests/e2e/` inventory incl. `payroll-void-run-amortization.spec.ts`;
`validate-plan-artifact.mjs` on the plan (0 failures, 0 warnings).

**Taken from the plan text, not independently re-verified this pass:** the C1 schema wording; the
`prisma/schema.prisma` line numbers for the `AuditAction` enum and `SeparationStatus`; the manual
script's psql/curl invocations; `rbac.ts:75` `MANAGE_USER_ROLES` and the `settings/roles` exposure
(V1 verified these — not re-run); `payroll/runs.ts:95-152` as the `voidRun` mirror (V1 verified);
`api/v1/employees/[id]/+server.ts:136-141` (V1 verified); the "no `api/v1/separations` twin" finding
(V1 verified); the `.prettierignore` claim (V1 verified).

### Net gate derivation (V2)

| Layer 1 dimension | Status | One-liner |
|---|---|---|
| Infra fit | PASS | unchanged from V1; both new columns additive, `db push`-safe, no runtime surface touched |
| Test coverage | CONCERN | B-3 genuinely closed (distinct `txMock` verified against the real passthrough it replaces); remaining gaps are N-1 (no gate on the re-check select) and N-3 (rollback untiered) |
| Breaking changes | PASS | the `SeparationStatus`-after-undo change is now listed as a Public Contract (B-4); the `ClearanceItem` shape change is listed; `clearedAnyItem`'s signature is unchanged and both callers are internal |
| Security surface | CONCERN | B-2 and B-5 both closed and re-derived in source; N-1 leaves the in-tx half of the bar narrower than the pre-flight half; N-2's permanence is a real behaviour change that is not written down |

| Layer 2 section | Status |
|---|---|
| C1 — schema | PASS |
| C2 — finalize snapshot + in-tx audit | PASS — the test design defect B-3 named is actually fixed |
| C3 — `clearedAnyItem` widening | CONCERN — N-1 (select) and N-2 (permanence/AC-6 wording) both land here |
| C4 — `undoSeparation` | PASS — B-1 and B-4 fixed in the claim; B-5's decision verified sound |
| C5 — route + UI | PASS — the three-term detector is correct in every path, computed before the strip |
| C6 — E2E + docs | CONCERN — N-3: the one feasible rollback gate is not taken |
| Owner-confirmation section | PASS — not re-opened, as instructed |

Totals: 0 FAILs / 4 CONCERNs / 7 PASSes → **Net Gate: CONDITIONAL**

Dimension findings:
- Infra fit: PASS — no command, port or container surface changed since V1.
- Test coverage: CONCERN — N-1 and N-3; B-3's own fix verified real.
- Breaking changes: PASS — every observable contract change is now listed.
- Security surface: CONCERN — N-1 and N-2.
- C3 feasibility: CONCERN — edit target still unique at `separation.ts:129`; the widening is correct, but its second consumer's projection was not widened with it (N-1). Highest-risk edit: the `select` at `:319` that the plan does not currently touch.
- C4 feasibility: PASS — the claim `data` object now carries neither B-1's nor B-4's defect.
- C5 feasibility: PASS — highest-risk edit is still the `load` derivation; it is correct and the ordering trap is pinned by M5.4.
- C1/C2/C6 feasibility: PASS / PASS / CONCERN (N-3).

Known Gaps (excluded from the gate count): none — no `## Known Gaps (Resolved via Backlog)` section.

Open gaps (V2):
- Postgres transaction isolation under genuine concurrency — accepted residual (C), same as the payroll void.
- `pnpm db:push` timing on a large populated production DB — accepted residual (C).
- No `User`-entity audit row on the undo's login write — accepted with the payload mitigation (C).
- Transaction rollback on a mid-undo throw — **re-tiered to B by N-3**, no longer an accepted residual.

What this coverage does NOT prove (V2, additive to the V1 list which still stands):
- Nothing proves the in-transaction re-check reads `previouslyClearedById` (N-1). Every B-2 gate —
  the C3 third-actor unit test, U15/M4.8, manual step 7b — exercises the pre-flight bar or the helper
  in isolation. A green suite here would NOT mean the raced half of the bar works.
- Nothing proves what happens to a case after its original clearer is permanently barred (N-2). No
  gate covers the one-admin deadlock shape.
- With N-3 unaddressed, `pnpm test` still proves only that the undo's writes are ISSUED. A mocked
  `$transaction` — passthrough or distinct `txMock` — cannot roll anything back.

Gate (V2, 19-08-26): **CONDITIONAL** — 0 FAILs, 4 CONCERNs. B-1..B-5 are all genuinely closed and
were re-derived in source, not accepted on the plan's word. Three new findings, all introduced by or
adjacent to the fixes, all resolvable inside the existing blast radius with no scope growth: N-1 is a
one-line `select` plus one assertion, N-2 is documentation plus one pinning test, N-3 is one extra E2E
case reusing a pattern C6 already imports.

Accepted by: pending — first-pass CONDITIONAL, 0 fix cycles recorded. Not accepted, not routed to
EXECUTE. Next state: PVL supplement cycle for N-1/N-2/N-3, then re-run VALIDATE from V1.

---

## Autonomous Goal Block

```
SESSION GOAL
Re-run VALIDATE from V1 against plan rev 2 of
process/general-plans/active/separation-undo-304_PLAN_19-08-26.md.
The previous gate was BLOCKED on B-1..B-5. All five are now marked CLOSED in the plan, and both
owner decisions are LOCKED. Nothing in src/ may be built until VALIDATE returns PASS or CONDITIONAL.

WHAT CHANGED IN REV 2
- B-1 CLOSED: the undo no longer nulls preFinalizeState; the load detector is the three-term
  preFinalizeState === null && finalPayBreakdown !== null && status !== 'FINALIZED'.
- B-2 CLOSED by owner option (b): new additive nullable ClearanceItem.previouslyClearedById,
  written only by the undo's re-open branch, never by setClearanceItem. M3.3 must PASS.
- B-3 CLOSED: distinct txMock replaces the $transaction passthrough; invocation-order assertion for
  M2.1; U6 asserts the where object; whole suite re-swept for vacuity (new M2.3, M4.6-M4.9, M5.3-M5.4).
- B-4 CLOSED: status is 'OPEN' when clearance is re-opened, 'CLEARED' when items are kept. D-1 amended.
- B-5 CLOSED: setUserActive named correctly as an existing isActive:true writer; the undo keeps its
  own tx.user.updateMany (setUserActive nests its own serializable transaction and would break
  atomicity); the missing User audit row is mitigated in the SEPARATION_UNDO payload and named.
- I-1..I-6 applied.

AUTONOMY RULES
- VALIDATE re-derives every FAIL status independently. Do not accept "CLOSED" on the plan's word.
- Do not re-open either owner decision. Snapshot-over-ledger and option (b) are locked.
- Do not weaken any acceptance criterion to make the gate pass.

HARD STOPS
- Any commit, push or PR.
- Any edit to src/, prisma/, tests/ or scripts/.
- Emitting PASS while any B-finding is in fact still open.

NEXT PHASE
VALIDATE (re-run). Then, if it passes, EXECUTE starting at C1 (two nullable columns + one enum value).

CARRIED RESIDUALS (not findings, do not re-raise as FAILs)
Concurrency isolation; rollback-on-throw unproven under mocked $transaction; no User-entity audit
row for the undo's login write; db push against a large production DB.

START COMMAND
Re-read the plan in full, then run VALIDATE V1 with the four Layer-1 dimensions and the six
Layer-2 commit sections.
```


## Validate Contract — V3 note (revision pass 3, 19-08-26)

**Answer first: N-1, N-2 and N-3 are all CLOSED in the plan text. The gate is still CONDITIONAL
until VALIDATE re-runs — this plan does not un-block its own gate.**

| Finding | Status | Note |
|---|---|---|
| N-1 — in-tx re-check projection | **CLOSED** | C3 now widens the `select` at `separation.ts:319` to carry `previouslyClearedById`, adds a *projection* assertion (an outcome assertion cannot catch a narrowed select) and mutation **M3.4**, which stays `pnpm check`-green and must still go red. |
| N-1 sweep — other narrow projections | **CLOSED — none found** | Every other `ClearanceItem`/`SeparationRecord` projection was checked and recorded in C3: `:91` and `:388` select `status` only and merely count; `:178` selects from `Separation`; `getSeparation:101-111` uses a bare `include` so it already carries both new columns; `:151` is the scoped `userId` lookup. `:319` was the only narrowing site. |
| N-2 — permanent bar undocumented | **CLOSED** | AC-6 qualified ("on items the undo never stamped"); Overview gains the who-may-finalize table for both moments of the sequence; a Risks row names the permanence and the one-admin deadlock; C3 gains a test pinning the permanence as **intended**; CANNOT-Prove #9 records the deadlock. No behaviour change — it is documentation plus one pinning test. |
| N-3 — rollback untiered | **CLOSED (re-tiered C → B)** | C6 gains a third E2E: move a loan balance in SQL between finalize and undo, then undo ⇒ assert the 409 **and** that nothing moved (record still `FINALIZED`, login still off, employee still `OFFBOARDED`, other loan still `0`/`PAID`, no `SEPARATION_UNDO` audit row). Verification Evidence carries it as Hybrid; the Test Infra note is rewritten from "no rollback coverage, out of scope" to "gated at hybrid tier; only a *general* fault-injection harness remains out of scope". |

**Residuals kept as residuals** (honest, unchanged): concurrency isolation, prod `db:push` timing,
no `User`-entity audit row, the two login-reactivation paths — plus the newly recorded CANNOT-Prove
#9 (no in-app recovery from the permanent bar in a one-admin org), which is accepted by design, not
closed.

**Gate restated: CONDITIONAL.** Nothing here changes it. Rev 3 is the plan's answer to V2's three
concerns; only a fresh VALIDATE run from V1 may move the gate. No scope grew — every change lands
inside C3, C6 and the plan's own prose sections.

---

## Validate Contract — V3 (re-validate of plan rev 3)

Status: CONDITIONAL — **GO to EXECUTE**, with one mandatory correction scoped to C6 (below).
Date: 19-08-26
date: 2026-08-19
generated-by: outer-pvl
supersedes: 2026-08-19 (outer-pvl) — V2 CONDITIONAL contract above; this V3 pass checks only the three rev-3 changes

Scope of this pass: NARROW by instruction — spot-check N-1/N-2/N-3, check for contradictions with
the locked decisions / AC-1..AC-10 / the six-commit ordering, and check the N-3 gate can really
prove rollback. Owner decisions not re-opened; B-1..B-5 not re-derived.

Parallel strategy: sequential. Rationale: one ordering trace through C4 step 5 that must stay in one head.

### Verdicts on the three rev-3 changes

| Finding | Verdict | Evidence |
|---|---|---|
| N-1 — widened in-tx `select` | **CLOSED, verified in source** | `separation.ts:319` is confirmed `select: { status: true, clearedById: true }` — the narrowing N-1 named. The projection assertion (not an outcome assertion) plus M3.4 is the right gate: M3.4 stays `pnpm check`-green because the new field is optional on `ClearanceActorRef`, so only a projection assertion can go red. Sweep re-spot-checked: `:91` and `:388` are `select: { status: true }` count-only; `getSeparation:111` is a bare `clearanceItems` include. `:319` is indeed the only narrowing site. |
| N-2 — permanence documented | **CLOSED** | Documentation plus one pinning test; no behaviour change. The Overview table's "nobody may finalize right after the undo" is correct — `separation.ts:307-308` counts non-CLEARED items and refuses everyone. AC-6's qualification matches the Overview table and the Risks row. |
| N-3 — rollback E2E | **CLOSED IN INTENT, BUT ITS JUSTIFICATION IS FALSE — see B-6** | The gate does prove rollback, but through one assertion, not five. |

### B-6 (BLOCKING for C6 only) — the N-3 rollback proof rests on a false ordering claim

C6's rollback E2E says: *"the undo writes the record, the login and the employee **before** it
reaches the balance check, so if the transaction did not roll back, those three would have stuck."*

**That is wrong.** C4 step 5 fixes the in-transaction order as: (1) compare-and-set claim on
`separationRecord`, (2) **money restore + 409**, (3) employee, (4) login, (5) clearance, (6) audit.
Only the claim precedes the balance check. Consequence for the E2E's half (b):

| Assertion | Real rollback proof? |
|---|---|
| record still `FINALIZED` | **YES** — the claim already wrote `status`, `finalPayAmount: null`, `finalizedAt: null`, `finalizedById: null`. Deterministic. This one assertion carries the whole gate. |
| the *other* loan still `0`/`PAID` | **Only sometimes** — the restore is a per-loan loop that throws on the first `count === 0`. If the moved loan is processed first, no other loan write ever happened. Snapshot order is a `findMany` with no `orderBy`, so this is non-deterministic, i.e. a flaky proof. |
| `users.isActive` still `false` | **NO — vacuous.** The login write is step 4; it never ran. |
| employee still `OFFBOARDED` | **NO — vacuous.** Step 3; never ran. |
| no `SEPARATION_UNDO` audit row | **NO — vacuous.** Audit is step 6; never ran. |

**Required correction, in C6, before the test is written** (no scope change, no return to PLAN):
1. Delete the "record, login and employee" sentence. Replace with: *"the compare-and-set claim is
   the only write that precedes the balance check, so the record row is what proves the rollback."*
2. Assert the claim's **four** columns, not just `status`: `status = 'FINALIZED'` **and**
   `finalizedAt`, `finalizedById`, `finalPayAmount` all still non-null. Four rolled-back columns on
   one deterministic write beats five assertions of which three cannot fail.
3. Keep the login / employee / audit-row assertions if wanted, but label them in the test as
   **negative controls that pass vacuously on this path** — never as rollback evidence. This repo
   has "green tests are not a working guard" recorded; an unlabelled vacuous assertion is that
   failure mode being re-introduced by the fix for it.
4. Make the loan half deterministic or drop it: move the balance on the loan the snapshot restores
   **second**, or seed a single loan and drop the "other loan" assertion entirely.

Everything else in C6, and all of C1–C5, is unaffected.

### Cosmetic findings (do not gate EXECUTE; fix opportunistically)

- **C-1** Frontmatter (`description`, `status`), the rev line at `:15`, the Resume section's
  `@ 10aec65`, and the whole Autonomous Goal Block still describe **rev 2**. Rev 3 is `3d25f9e`.
- **C-2** SPEC §6 answer table, row 6.3, still reads *"Undo returns the record to `CLEARED`"* —
  superseded by B-4 / the D-1 amendment. Its conclusion (no new enum value) is still right.
- **C-3** The C3 comment text to be pasted into `separation.ts:127` opens with *"the bar keys on
  `clearedById` ALONE"* and then describes the second field. Self-contradictory as written; drop
  "ALONE" before pasting it into source.
- **C-4** C3 never names the `ClearanceActorRef` edit (`separation.ts:118`) that the widened helper
  needs. `pnpm check` fails loudly, so it is self-correcting — the field must be added as
  **optional**, which is what keeps M3.4 `check`-green.

### Net gate derivation (V3, narrow pass)

| Layer 1 dimension | Status | One-liner |
|---|---|---|
| Infra fit | PASS | unchanged; no new command, port or runtime surface in rev 3 |
| Test coverage | CONCERN | B-6 — three of the N-3 gate's five assertions cannot fail; the gate survives on one |
| Breaking changes | PASS | rev 3 added no contract change; N-1 strengthens an existing guard (NG-4 allows it) |
| Security surface | PASS | N-1's widening closes the raced half of the #297 bar; N-2 is documentation |

| Layer 2 section | Status |
|---|---|
| C1 — schema | PASS (unchanged in rev 3) |
| C2 — finalize snapshot + in-tx audit | PASS (unchanged in rev 3) |
| C3 — `clearedAnyItem` widening + `:319` select | PASS |
| C4 — `undoSeparation` | PASS (unchanged in rev 3) |
| C5 — route + UI | PASS (unchanged in rev 3) |
| C6 — E2E + docs | CONCERN — B-6 |

Totals: 0 FAILs / 2 CONCERNs / 8 PASSes → **Net Gate: CONDITIONAL**

Dimension findings:
- Infra fit: PASS — no infra surface moved in rev 3.
- Test coverage: CONCERN — B-6, correctable inside C6.
- Breaking changes: PASS — no new observable contract in rev 3.
- Security surface: PASS — N-1 closed the one asymmetry V2 found.
- C3 feasibility: PASS — `:319` edit target verified unique in source; C-4 is the only unnamed edit.
- C6 feasibility: CONCERN — B-6; mechanically feasible, but the assertion set must be corrected first.

Known Gaps (excluded from the gate count): none.

Open gaps (V3): unchanged from V2 — concurrency isolation (C), prod `db:push` timing (C), no
`User`-entity audit row (C), one-admin deadlock recovery (CANNOT-Prove #9, accepted by design).
Rollback stays tier **B**, but proven by the claim row only, not by five assertions.

What this coverage does NOT prove (V3, additive):
- Rollback of the login, employee, clearance and audit writes is proven **nowhere**, at any tier.
  The one gate that could reach them would need a throw injected after step 4, and no fault-injection
  harness exists in this repo (already recorded in Test Infra Improvement Notes).
- Nothing proves the per-loan restore loop's ordering, so the "other loan" assertion in C6's
  rollback E2E is not a dependable proof.

Gate (V3, 19-08-26): **CONDITIONAL — proceed to EXECUTE.** 0 FAILs, 2 CONCERNs. The three rev-3
changes do what they claim; nothing they touch contradicts a locked owner decision, an acceptance
criterion, or the six-commit ordering. B-6 is carried as an execute-agent instruction against C6,
not as a return to PLAN.

Execute-agent instructions:
- **E1 (C6, mandatory)** — apply B-6's four-point correction before writing the rollback E2E. Do not
  write an assertion that cannot fail without labelling it as such.
- **E2 (C3)** — add `previouslyClearedById?: string | null` to `ClearanceActorRef` as **optional**;
  a required field would make M3.4 fail `pnpm check` and destroy the mutation's whole point.
- **E3 (C4)** — the `previouslyClearedById` stamp loop needs a read the ordered step list never
  names. Add an explicit `tx.clearanceItem.findMany({ where: { separationId: id }, select: { id: true, clearedById: true } })`
  before the loop, and reuse its rows for the audit `oldValue`. Do **not** write the `updateMany`
  form shown first in that bullet — the prose rejects it two lines later.

Accepted by: user / session — owner pre-authorised EXECUTE on a clean pass (19-08-26) and accepted
the two CONCERNs (B-6 as an in-flight C6 correction; the four carried residuals unchanged).
