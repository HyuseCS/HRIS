---
name: plan:payroll-void-audit-298
description: "#298 payroll side only — a dedicated PAYROLL_VOID audit action, a same-actor marker, lockedById/releasedById on PayrollPeriod, and approvedById disambiguated"
date: 17-08-26
feature: general-plans
---

# #298 — Payroll void made visible, lock/release actors recorded

**TL;DR.** Four changes, in one strict order. (1) Add three schema things: a new
`PAYROLL_VOID` audit action, and two nullable columns `lockedById` / `releasedById` on
`PayrollPeriod`. (2) Write those two columns from `lock()` and `release()`. (3) Stop `lock()`
writing `PayrollRun.approvedById` — that field now means the approver and nothing else.
(4) Add the same-actor void marker, extracted once, conditional-spread so it is absent on
ordinary voids. Nothing is blocked. No new 403 anywhere. No backfill.

**Date**: 17-08-26
**Status**: PLANNED — not validated, not executed, nothing committed
**Complexity**: SIMPLE (one session, 13 numbered steps, one plan file)

Risk class: money-adjacent + schema change, so the test bar is high even though the code is small.

## Overview

Issue #298 asks for the payroll half of the separation-of-duties work: make a payroll void
unmistakable in the history, and start recording who locked and who released a payroll period.
Nothing is blocked and nobody is newly refused — the control is **detection**, because the Super
Admin account is deliberately break-glass. The work is four small code changes plus a three-part
schema addition, all inside `payroll/periods.ts`, `payroll/runs.ts`, the audit-log page, and
`prisma/schema.prisma`.

Upstream SPEC: `process/general-plans/active/separation-of-duties-298-297_SPEC_17-08-26.md`
(LOCKED 17-08-26). This plan carries **only** the payroll half — SPEC decisions D1 and D2,
acceptance criteria AC-1.1 … AC-1.5 and AC-2.1 … AC-2.5.

> **Hard boundary.** #297 / `separation.ts` / the offboarding half (AC-3.x, AC-4.x, AC-5.1) is
> owned by a parallel agent. This plan must not read, edit, or test `separation.ts`.

---

## Goals

| # | Goal | SPEC criterion |
|---|---|---|
| G1 | Every payroll void carries a distinct, filterable audit action naming the actor | AC-1.1 |
| G2 | The same-actor marker is present only on real same-actor voids, never present-and-false | AC-1.2, AC-1.3 |
| G3 | Nobody is newly blocked from voiding, locking or releasing | AC-1.4, AC-2.4 |
| G4 | No external alert fires on void | AC-1.5 |
| G5 | Who locked and who released a period is a readable fact | AC-2.1, AC-2.2 |
| G6 | `PayrollRun.approvedById` means the approver and only the approver | AC-2.3 |
| G7 | Four actors (approver / locker / releaser / voider) readable as four separate names | AC-2.5 |

---

## Owner decisions carried in (locked — do not re-open)

1. **Detect, don't block.** Super Admin stays break-glass. No new guard, no new 403.
2. **Mark voids BOTH ways.** (a) a new always-on dedicated `AuditAction` value so every void is
   findable from the audit-log dropdown; (b) an *additional* same-actor key on `newValue` when the
   voider also approved or locked it.
3. **Record who locked and who released** a payroll period.
4. **Disambiguate `PayrollRun.approvedById`. No backfill of historical rows.**

### Why the enum value is the load-bearing half

`src/routes/(app)/reports/audit-log/+page.server.ts` returns `oldValue: null, newValue: null` for
**every** caller (the #242 mask, lines ~66–83). A marker inside `newValue` is therefore **invisible
on the audit screen**, and `reveal` is one row at a time, Super-Admin-only — i.e. in the worst case
revealed only by the same person who did the void.

So: the **new `AuditAction` value is the control**. The `newValue` key is supplementary metadata
for a DB-level or post-incident read. Do not invert this priority during EXECUTE.

---

## Verified facts EXECUTE may rely on (already confirmed by reading the code)

| Fact | Location |
|---|---|
| `AuditAction` = CREATE, UPDATE, DELETE, VIEW, LOGIN, LOGIN_FAILED, PAYROLL_OVERRIDE, LEAVE_OVERRIDE | `prisma/schema.prisma:194-203` |
| `PAYROLL_OVERRIDE` / `LEAVE_OVERRIDE` are the in-repo precedent for a dedicated action value | same |
| `AuditLog` model has **no `@@index` at all** | `prisma/schema.prisma:1382-1403` |
| `PayrollPeriod` has `lockedAt` / `releasedAt` but **no actor field** | `prisma/schema.prisma:1613-1614` |
| `PayrollRun.approvedById` / `approvedAt` | `prisma/schema.prisma:1091-1092` |
| `lock()` — status precondition, flagged-entry note, `$transaction` | `periods.ts:138` |
| `lockedAt` is set inside the atomic `updateMany` claim | `periods.ts:169-172` |
| `lock()` writes `approvedById: ctx.actorId` with a comment saying it deliberately leaves run status COMPUTED | `periods.ts:248-258` |
| `release()` | `periods.ts:268` |
| `voidPeriod()` — guard at :307, refuses an already-VOIDED period, reverses amortization | `periods.ts:304` |
| `voidRun()` — guard at :93, **no status precondition**, does **not** reverse amortization, does not touch the period | `runs.ts:91` |
| Hardcoded `entityTypes` array — **no `PayrollPeriod`** | `+page.server.ts:93-102` |
| Hardcoded `ACTIONS` array in the page | `+page.svelte:21-30` |
| `writeAuditLog(ctx, payload, client?)` — accepts a tx client | `src/lib/server/audit.ts:22-25` |
| Conditional-spread precedent (`selfVerifiedEvidence`) | `src/lib/server/services/approvals.ts:297-312` |
| Predicate-extraction precedent (`usedDocVerifierCarveOut`) | `src/lib/server/services/approvals.ts:157-163` |

---

## Every reader of `approvedById` / `approvedAt` (grep result, complete)

Required by the owner before step 8 removes the `lock()` write.

**Writers (3, not 2):**

| # | Site | Meaning today | After this plan |
|---|---|---|---|
| W1 | `src/lib/server/services/approvals.ts:673` | the real finance approver (`decidePayrollRun`, final APPROVE) | unchanged — this becomes the *only* payroll-run meaning |
| W2 | `src/lib/server/services/payroll/periods.ts:252-253` | whoever **locked** the period | **REMOVED** in step 8 |
| W3 | `src/lib/server/services/payroll/index.ts:508` | `approvePayroll()` — a separate approve path also writing `status: 'APPROVED'` | unchanged, out of scope, but **note it in the schema comment** |

> W3 was not named in the brief. It is a third writer, it writes the approver meaning (consistent
> with W1), and it is **out of scope** — do not touch it. It matters only because the schema comment
> must be honest about there being two approver writers, not one.

`recruitment.ts:174` also writes `approvedById`, but on **`JobPosting`** (`schema.prisma:1147`), a
different model. Irrelevant. Do not touch it.

**Readers (4 source sites, all payslip rendering):**

| # | Site | Uses |
|---|---|---|
| R1 | `payslip-document.ts:88, 282` | `payDate: run.approvedAt ? shortDate(run.approvedAt) : shortDate(run.periodEnd)` |
| R2 | `payslip-fetch.ts:91, 194` | selects `approvedAt`, passes it to R1 as `run.approvedAt` |
| R3 | `src/routes/(app)/payslips/[id]/+page.server.ts:29` | selects `approvedAt` for the payslip page |
| R4 | `src/routes/api/v1/payroll/payslips/[id]/+server.ts:36` | same, for the v1 API |

**No Svelte component renders `approvedAt` directly.** The only rendering path is the payslip
PDF: `payslip-pdf.ts:156` prints `labelValue(doc, 'PAYDATE:', d.period.payDate, …)`.

**Test readers:** `tests/unit/payslip-document.test.ts:40`, `payslip-draft-visibility.test.ts:83`,
`approval-self-guard.test.ts:557` (payroll, W1 path), `recruitment-posting-sod.test.ts:129/150/210`
(JobPosting, unrelated).

### The second-order effect — name it, do not hide it

**What renders it: the payslip PDF `PAYDATE:` field, via `payslip-document.ts:282`.**

> **SUPERSEDED 18-08-26.** HR ruled after this plan was written: **PAYDATE is the day the payslip
> was released** (`run.releasedAt`), and **blank** when there is no release date. There is no
> period-end fallback. The paragraph below records what step 8 alone would have done; it is not
> what shipped. See `docs/finance-note-paydate-change.md`.

Today a period that is **locked but never approved through the #134 chain** has `approvedAt` set by
the lock, so the payslip prints the **lock date** as PAYDATE. After step 8, `approvedAt` stays
`null` for that run and the payslip falls back to `shortDate(run.periodEnd)` — it prints the
**period end date** instead.

This is **more correct** (a run nobody approved should not claim an approval date) but it is a
**visible change to a printed document**. It is accepted, not a bug. It must be:

- called out in the EXECUTE commit message,
- shown in the live check (step L7 below), which prints the same payslip before and after,
- flagged to the owner in the handoff, because Finance may recognise the PAYDATE value changing.

There is no separate "approval date" column anywhere in the payroll UI, so nothing else moves.

---

## Touchpoints

| File | Change |
|---|---|
| `prisma/schema.prisma` | `+ PAYROLL_VOID` in `AuditAction`; `+ lockedById String?` / `+ releasedById String?` on `PayrollPeriod`; landmine comment on `PayrollRun.approvedById` |
| `src/lib/server/services/payroll/audit-markers.ts` | **NEW** — the extracted same-actor predicate |
| `src/lib/server/services/payroll/periods.ts` | `lock()` writes `lockedById`; `release()` writes `releasedById`; `lock()` stops writing `approvedById`/`approvedAt`; `voidPeriod()` uses the new action + marker |
| `src/lib/server/services/payroll/runs.ts` | `voidRun()` uses the new action + marker |
| `src/routes/(app)/reports/audit-log/+page.server.ts` | add `PayrollPeriod` to `entityTypes` |
| `src/routes/(app)/reports/audit-log/+page.svelte` | add `PAYROLL_VOID` to `ACTIONS` |
| `scripts/count-ambiguous-approvedby.ts` | **NEW**, read-only count script |
| `tests/unit/payroll-void-audit.test.ts` | **NEW** |
| `tests/unit/payroll-period-actors.test.ts` | **NEW** |

Read-only (do not edit): `approvals.ts`, `payroll/index.ts`, `payslip-document.ts`,
`payslip-fetch.ts`, `audit.ts`, `separation.ts`.

## Public Contracts

- **`AuditAction` enum gains `PAYROLL_VOID`.** Additive. Any exhaustive `switch` over `AuditAction`
  would break — grep confirms there is none; the audit page uses a hardcoded string array, which
  step 10 updates.
- **`PayrollPeriod` gains two nullable string columns.** No relation is added (see Design Note 2),
  so no `User` back-relation and no cascade behaviour changes.
- **`PayrollRun.approvedById` narrows in meaning** from "approver *or* locker, last write wins" to
  "approver". The column type and nullability are unchanged. Historical rows are untouched and
  therefore remain ambiguous — that is the documented, accepted state.
- **Audit `newValue` gains an optional `sameActorAsApprover` key** on void entries only.
- No route signature, no form action name, and no capability check changes.

## Blast Radius

- **9 files** (4 edited source, 2 new source, 1 schema, 2 new tests) + 2 UI array edits.
- **Risk class: schema/data migration + money-adjacent + audit/trust-boundary.** No auth change.
- **Auth surface: untouched.** The two mechanisms #282 left (`requireAnyCapability` in the service,
  capability table in `rbac.ts`) are not modified, extended, or bypassed. **No new auth mechanism.**
- Rollback: revert the commits; the two new columns can be left in place (nullable, unread by the
  reverted code) — no data is destroyed at any point.

---

## Design Notes (decided — EXECUTE does not re-derive these)

**1. Enum value addition under `db push`.** Adding a value to a Postgres enum is
`ALTER TYPE … ADD VALUE` — **additive and non-destructive**, unlike the *rename* trap documented in
`all-database.md` rule 2 and `scripts/migrate-employment-type-regular.ts`. **No `scripts/migrate-*.ts`
is needed.** Do not write one. Postgres 18 permits `ADD VALUE` outside a transaction block, which is
how `db push` issues it.

**2. Nullable columns, not relations.** `lockedById` / `releasedById` are bare `String?`, **not**
`@relation` to `User`. Reasons: a nullable add is metadata-only under `db push` (no table rewrite,
survives the populated-DB CI job); adding a relation would add an FK constraint that must validate
every existing row and would force a back-relation on `User`. `AuditLog.actorId` is the precedent
for actor-by-id, and the audit row is the authoritative record anyway. `NULL` honestly means
"this period predates the column" — it never means "nobody locked it".

**3. `lockedById` goes inside the atomic claim.** It is set in the same
`tx.payrollPeriod.updateMany({ where: { id, status: 'GENERATED' }, … })` as `lockedAt`
(`periods.ts:169-172`), so who-and-when are written by the single caller that wins the concurrency
race. Writing it in a second statement would let the loser of the race stamp its name.

**4. No rename, no backfill, no discriminator column** for `approvedById`. Historical ambiguity is
documented in a schema comment (house style — see the existing landmine comments at
`schema.prisma:1386-1388` and `periods.ts:248-252`) and counted by a read-only script.

**5. Marker shape.** Conditional spread — `...(pred && { sameActorAsApprover: true })`. The key is
**absent** on an ordinary void, never `false`. Precedent: `approvals.ts:310-311`. This is the SPEC's
explicit AC-1.2 requirement.

---

## Implementation Checklist

Order is load-bearing. Step 8 is only safe after step 6 has given the lock actor a new home; the
step 11 marker is only meaningful after step 8 has made `approvedById` mean one thing.

### Phase A — schema (steps 1–3)

**1. Add the audit action.** `prisma/schema.prisma`, inside `enum AuditAction` (line 194-203),
after `LEAVE_OVERRIDE`:

```
  PAYROLL_VOID
```

Add a one-line comment above it in house style, naming #298 and saying it exists so a void is
findable from the audit-log action filter without revealing any payload.

**2. Add the two period actor columns.** `prisma/schema.prisma`, `model PayrollPeriod`, immediately
after `releasedAt` (line 1614):

```
  lockedById     String?
  releasedById   String?
```

Above them, a comment stating: nullable because it records only what happened after #298 —
`NULL` means the period predates the column, never "nobody"; bare id, not a relation, so the
column add stays metadata-only on a populated database.

**3. Document the `approvedById` ambiguity.** `prisma/schema.prisma`, above
`approvedById` (line 1091), a landmine comment saying: before #298 this field was written by
**three** call sites — the finance approver (`services/approvals.ts` `decidePayrollRun`),
`approvePayroll` in `services/payroll/index.ts`, and *also* by whoever locked the period
(`services/payroll/periods.ts` `lock`). Rows written before #298 therefore mean "approver **or**
locker, whichever wrote last" and were deliberately **not** backfilled. From #298 the lock no
longer writes it; the lock actor lives on `PayrollPeriod.lockedById`.

**4. Regenerate and push.**

```bash
pnpm prisma generate
pnpm db:push
```

Do **not** believe a red `pnpm check` until `prisma generate` has run (this repo has
misdiagnosed that three times).

### Phase B — record the lock/release actors (steps 5–7)

**5. Write `lockedById` inside the atomic claim.** `periods.ts:169-172` — add to the `data` of the
existing `updateMany`, next to `lockedAt`:

```
data: { status: 'LOCKED', lockedAt: new Date(), lockedById: ctx.actorId }
```

Do not add a second statement. Do not move `lockedAt`.

**6. Write `releasedById`.** `periods.ts:272-275` — add to the existing `db.payrollPeriod.update`
data, next to `releasedAt`: `releasedById: ctx.actorId`.

**7. Surface both in the audit `newValue`.** In `lock()`'s `writeAuditLog` (`periods.ts:260-265`)
add `lockedById: ctx.actorId`; in `release()`'s (`periods.ts:276-281`) add
`releasedById: ctx.actorId`. This is the fact a reveal can read back even if a row is later edited
by hand. It is a plain fact key, **not** a marker — it is always present on those two entries, and
that is correct because these entries are not "overrides".

### Phase C — disambiguate `approvedById` (step 8)

**8. Remove the lock's approver write.** `periods.ts:248-258`. Delete `approvedById: ctx.actorId`
and `approvedAt: new Date()` from the `tx.payrollRun.update` data.

The `overrideNote` branch **stays**: the statement becomes

```ts
if (overrideNote) {
  await tx.payrollRun.update({
    where: { id: run.id },
    data: { hasOverride: true, overrideNote }
  })
}
```

i.e. the whole update is now conditional, because with the approver fields gone there is nothing to
write when there is no override note. Rewrite the block comment above it: it currently says "Record
who/when locked + any override, but DO NOT flip run.status to APPROVED". It must now say the lock
records **no** approver — who locked lives on `PayrollPeriod.lockedById` (#298) — and keep the
existing, still-true explanation of why run status stays `COMPUTED`.

**Do not** touch `approvals.ts:673` or `payroll/index.ts:508`. Both write the approver meaning and
are correct.

### Phase D — the void marker (steps 9–11)

**9. Extract the predicate once.** New file
`src/lib/server/services/payroll/audit-markers.ts`:

- export `voidedOwnApproval(actorId: string, run: { approvedById: string | null } | null | undefined, period?: { lockedById: string | null } | null): boolean`
- returns `true` when `actorId` is non-empty **and** equals `run?.approvedById` **or**
  `period?.lockedById`; `false` otherwise (including when both are `null` — a null-vs-null match
  must never count as same-actor).
- doc comment in the shape of `usedDocVerifierCarveOut` (`approvals.ts:155-163`): says this is the
  #298 detect-don't-block marker, that it is stamped onto the void's audit entry, and that the
  caller must conditional-spread it so a search for it returns only real same-actor voids.

Both `runs.ts` and `periods.ts` import it. **Do not duplicate the condition in two files.**

**10. `voidRun`.** `runs.ts:91-111`. The existing `db.payrollRun.findFirst` already returns the
whole row, so `run.approvedById` is available with no extra query. Change the `writeAuditLog` call:

```ts
await writeAuditLog(ctx, {
  action: 'PAYROLL_VOID',
  entityType: 'PayrollRun',
  entityId: id,
  oldValue: { status: run.status },
  newValue: {
    status: 'VOIDED',
    ...(voidedOwnApproval(ctx.actorId, run) && { sameActorAsApprover: true })
  }
})
```

The `requireAnyCapability(ctx.actorRoles, 'OVERRIDE_FINALIZED')` guard at :93 is **unchanged**.

**11. `voidPeriod`.** `periods.ts:304+`. `requirePeriod` returns the period with `runs` included;
the period now carries `lockedById` and `run` carries `approvedById`. Change its `writeAuditLog`
call the same way — `action: 'PAYROLL_VOID'`, `entityType: 'PayrollPeriod'`, and
`...(voidedOwnApproval(ctx.actorId, run, period) && { sameActorAsApprover: true })`. The guard at
:307 and the already-VOIDED refusal are **unchanged**.

If `voidPeriod`'s audit write happens after the amortization-reversal `$transaction`, leave it
there — do not move it into the transaction (that is a behaviour change).

### Phase E — make it filterable (step 12)

**12a.** `src/routes/(app)/reports/audit-log/+page.server.ts:93-102` — add `'PayrollPeriod'` to the
returned `entityTypes` array, after `'PayrollRun'`. Without this a period void cannot be filtered
for at all.

**12b.** `src/routes/(app)/reports/audit-log/+page.svelte:21-30` — add `'PAYROLL_VOID'` to the
`ACTIONS` array, after `'LEAVE_OVERRIDE'`.

Add a short comment in **both** places: this array is hand-maintained and must be extended whenever
`AuditAction` or an audited `entityType` gains a value, or the new value is unfilterable.

### Phase F — the read-only count (step 13)

**13.** New `scripts/count-ambiguous-approvedby.ts`, modelled on the existing `scripts/migrate-*.ts`
shape but **read-only — it must contain no `update`, `updateMany`, `$executeRaw` or `create`**.
It prints, per organization:

- total `payroll_runs` with `approvedById NOT NULL`
- of those, how many have `status <> 'APPROVED'` — the strong signal of a lock-written row, since
  the lock deliberately leaves the run `COMPUTED`
- how many have `approvedAt` within one second of their period's `lockedAt` — the corroborating
  signal

Run it with `pnpm exec tsx scripts/count-ambiguous-approvedby.ts`, print the numbers into the
EXECUTE report, and change nothing. Note in its header comment that `pnpm check` does **not**
typecheck `scripts/**`, so the file must be run once to prove it compiles.

---

## Explicitly OUT OF SCOPE

| Item | One-line reason |
|---|---|
| Adding a status precondition to `voidRun` | It is a real divergence from `voidPeriod`, but changing it is an undecided behaviour change and the SPEC says nobody is newly blocked. |
| Unifying `voidRun` / `voidPeriod` behaviour | Same reason — `voidPeriod` reverses amortization and `voidRun` does not; reconciling them is a money-moving decision the owner has not made. |
| `separation.ts` and everything in #297 | Owned by a parallel agent this session. |
| Backfilling historical `approvedById` rows | Owner decision 4: no backfill. |
| Renaming `approvedById` or adding a discriminator column | Owner decision: no rename, no new column. |
| External alerting on void | SPEC D1b: rejected. AC-1.5 requires the opposite. |
| Any new guard, refusal, or capability | SPEC D1/D2: detect, don't block. |
| `payroll/index.ts:508` `approvePayroll` | Writes the approver meaning; already correct. |

### Known limitation, stated on the record

`PAYROLL_VOID` will fire **identically** for `voidRun` and `voidPeriod`, which have **different
consequences** — `voidPeriod` reverses loan and cash-advance amortization, `voidRun` does not touch
balances or the period at all. The `entityType` column (`PayrollRun` vs `PayrollPeriod`) is the only
thing that distinguishes them on the audit screen. A reviewer must read `entityType`, not just the
action, to know whether money moved back. This is accepted for now; unifying the two is out of scope
above.

### FLAG — DO NOT BUILD (follow-up)

An index `@@index([organizationId, action, createdAt])` on `AuditLog` would help, because **this
change is what makes people actually use the action filter**, and `AuditLog` has **no indexes today**
(`schema.prisma:1382-1403`). Per #200 and `all-database.md` rule 6, an index on a large populated
table is its own pre-push work item and must be created in a pre-push step, never during the push.
**Do not add it in this plan.** Record it as a follow-up for the owner. Do not file a GitHub issue.

---

## CI — what `schema-upgrade` exercises here

`.github/workflows/ci.yml` job 3 runs `prisma db push` against a **populated** database. For this
change it specifically proves:

- **`ALTER TYPE "AuditAction" ADD VALUE 'PAYROLL_VOID'` succeeds on a type that is already in use**
  by existing `audit_logs` rows — i.e. that this is genuinely additive and does not drop/recreate the
  enum the way a *rename* would.
- **Adding `lockedById` / `releasedById` to a populated `payroll_periods`** is metadata-only: both
  are nullable with no default and no FK, so Postgres does not rewrite the table, does not need to
  validate existing rows, and no `NOT NULL` violation is possible.
- It does **not** exercise the index question — because no index is being added (see the FLAG).
- It does **not** typecheck `scripts/**`, so it will not catch a broken
  `count-ambiguous-approvedby.ts`. That is why step 13 requires running the script once by hand.

The `quality` job (`format:check` → `lint` → `check` → `test`) runs `prisma generate` first, so the
two new columns and the new enum value will be in the generated client for the typecheck.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `void-override-marked` — `voidRun` writes `action: 'PAYROLL_VOID'` with the actor's id on the row | Hybrid (unit + L2 live) | AC-1.1 |
| `void-period-override-marked` — `voidPeriod` writes `action: 'PAYROLL_VOID'`, `entityType: 'PayrollPeriod'` | Hybrid (unit + L2 live) | AC-1.1 |
| `override-marker-absent-on-ordinary` — a void by a *different* actor has **no** `sameActorAsApprover` key at all (`expect(newValue).not.toHaveProperty(...)`, not `toBe(false)`) | Fully-Automated | AC-1.2 |
| `override-search-returns-only-real` — lock + release + generate write actions other than `PAYROLL_VOID`, so filtering by `PAYROLL_VOID` returns only voids | Fully-Automated | AC-1.2 |
| `void-same-actor-visible` — when the voider equals `run.approvedById`, `sameActorAsApprover: true` is present; and when the voider equals `period.lockedById` | Hybrid (unit + L3 live) | AC-1.3 |
| `void-capability-unchanged` — `tests/unit/override-finalized-guard.test.ts` stays green unmodified | Fully-Automated | AC-1.4 |
| `void-no-external-alert` — `notifyMany` is mocked and asserted `not.toHaveBeenCalled()` across both void paths | Fully-Automated | AC-1.5 |
| `period-locker-recorded` — `lock()`'s `updateMany` data contains `lockedById: ctx.actorId` **in the same call** as `lockedAt` | Hybrid (unit + L4 live psql) | AC-2.1 |
| `period-releaser-recorded` — `release()` sets `releasedById`, distinct from `lockedById` | Hybrid (unit + L4 live psql) | AC-2.2 |
| `approver-record-unambiguous` — user A approves, user **B** locks; the run's `approvedById` is still A and the lock's `payrollRun.update` is either absent or carries no approver key | Fully-Automated | AC-2.3 |
| `lock-release-capability-unchanged` — existing payroll permission suites stay green unmodified | Fully-Automated | AC-2.4 |
| `payroll-four-actors-readable` — approver / locker / releaser / voider read back as four different ids | Hybrid (unit + L5 live) | AC-2.5 |
| `guard-mutation-check` — the mutation table below, **run and its result recorded** | Fully-Automated | AC-5.3 |
| Live L1–L6 (below) | Agent-Probe | AC-1.1, AC-1.3, AC-2.1, AC-2.2, AC-2.5 |

### Test files

- `tests/unit/payroll-void-audit.test.ts` — the void half (AC-1.x). Mock `$lib/server/db`,
  `$lib/server/audit` (`writeAuditLog` as a spy), and the notifier. Assert on the **argument object
  passed to `writeAuditLog`**, not on a return value.
- `tests/unit/payroll-period-actors.test.ts` — lock/release/approver half (AC-2.x). Mock the
  `$transaction` so the `tx` client's `payrollPeriod.updateMany` and `payrollRun.update` calls are
  capturable.

Do **not** modify `tests/unit/override-finalized-guard.test.ts`. Its value is that it stays green
untouched (AC-1.4).

### What `override-finalized-guard.test.ts` does and does not prove

**Does prove** (24 `it()` blocks, ~28 cases): that `voidRun`, `voidPeriod` and `unlockRange` each
name `OVERRIDE_FINALIZED` — not `ADMINISTER_SYSTEM` — so the CEO cannot void payroll they approved;
that the whole role set is judged (#256), so a multi-role actor whose authority comes from a
secondary role is admitted; that an **empty** role set refuses (closed, never open); and that the
write actually happened, so a silently no-opping guard cannot pass. `voidRun` runs **real**
throughout; `voidPeriod` and `unlockRange` are mocked at the route level and pulled in real
separately.

**Does not prove** anything about **this** plan: it never inspects the audit entry, never touches
`newValue`, and knows nothing about `PAYROLL_VOID` or `sameActorAsApprover`. It also mocks the DB,
so it cannot prove a query-level or tenant-scoping hole. **Do not duplicate its WHO-may-void cases.**
Its only role here is the AC-1.4 negative control: it must stay green with zero edits.

---

## Mutation checks (AC-5.3 — must be RUN, not just intended)

Each row: break it on purpose, run `pnpm test`, confirm the named test goes **red**, then revert.
A change whose removal leaves the suite green is not proven. Record the actual result of each row in
the EXECUTE report — an unrun mutation table is a hypothesis, not evidence.

| # | Break this | Must go red |
|---|---|---|
| M1 | Change `action: 'PAYROLL_VOID'` back to `'UPDATE'` in `voidRun` | `void-override-marked` |
| M2 | Same in `voidPeriod` | `void-period-override-marked` |
| M3 | In `voidedOwnApproval`, replace the conditional spread with `sameActorAsApprover: pred` (present-and-false) | `override-marker-absent-on-ordinary` |
| M4 | In `voidedOwnApproval`, drop the `actorId != null` / non-empty check so `null === null` matches | `override-marker-absent-on-ordinary` (a void with a never-approved run must not be marked) |
| M5 | Drop the `\|\| period?.lockedById` arm | the locker-arm case of `void-same-actor-visible` |
| M6 | Remove `lockedById` from the `updateMany` data | `period-locker-recorded` |
| M7 | Move `lockedById` out of the `updateMany` into a separate `tx.payrollPeriod.update` after it | `period-locker-recorded` (the test asserts it is in the **same** call as `lockedAt` — this is the atomicity assertion, and it is the one a naive test misses) |
| M8 | Remove `releasedById` from `release()` | `period-releaser-recorded` |
| M9 | Put `approvedById: ctx.actorId` back into `lock()` | `approver-record-unambiguous` |
| M10 | Remove `'PAYROLL_VOID'` from the `ACTIONS` array in `+page.svelte` | **Nothing goes red — by design.** This is the gap the unit suite cannot close; it is why L6 exists. Record "no test caught it" as the recorded result. |
| M11 | Remove `'PayrollPeriod'` from `entityTypes` | **Nothing goes red — by design.** Same; covered by L6. |

M10 and M11 are the honest finding this repo's history demands: two of the twelve changes are
**not unit-provable at all**. That is the whole reason the live pass below is mandatory, not optional.

---

## Live verification (mandatory — not optional)

No unit test in this repo can prove three things, because the suite mocks the database and never
renders a page: **(a)** that the two hardcoded dropdown arrays were actually updated, **(b)** that the
new action survives the #242 mask and is genuinely filterable at `/reports/audit-log`, and **(c)**
that `lockedById` really reached Postgres from inside a `$transaction` + `updateMany`.

**Harness.** The **user starts the dev server themselves — the agent never starts it.** Then:

```bash
# log in as a chosen user (keep the cookie jar)
curl -s -c /tmp/j.txt -X POST http://localhost:5173/api/v1/_dev/login-as \
  -H 'content-type: application/json' -d '{"email":"EMAIL_HERE"}'

# assert against the database row, never against a value you injected
docker exec veent-db-5434 psql -U veent -d veent_hris -p 5434 -tAc "SQL_HERE"
```

Table names are snake_case plural: `payroll_periods`, `payroll_runs`, `audit_logs`, `users`.
**Plant a marker** — name the test period something unmistakable, e.g. `ZZ-298-PROBE`, and find every
row by that name. Run the whole script **before** the change and **again after**, keeping the negative
controls on both sides.

| # | Step | Assert |
|---|---|---|
| **L1** | Create period `ZZ-298-PROBE`, import attendance, generate | `select status from payroll_periods where name='ZZ-298-PROBE'` → `GENERATED` |
| **L2** | Approve the run as user **A** (finance approver), then **lock** as a *different* user **B** | `select "approvedById", "approvedAt", status from payroll_runs where "periodId"=…` → **`approvedById` = A's id, NOT B's**; `status` = `COMPUTED`. **Negative control, both sides:** before the change this query returns **B**; after, it returns **A**. |
| **L3** | Same lock, period side | `select "lockedById","lockedAt","releasedById" from payroll_periods where name='ZZ-298-PROBE'` → `lockedById` = **B**, `lockedAt` non-null, `releasedById` **NULL**. This is the (c) proof — it came out of the `$transaction`+`updateMany`. |
| **L4** | Release as user **C** | `releasedById` = **C**, and **≠ `lockedById`**. Assert both ids positively; "not null" alone proves nothing. |
| **L5** | Void the period as user **B** (who locked it) | `select action, "entityType", "newValue"->>'sameActorAsApprover' from audit_logs where "entityId"=… order by "createdAt" desc limit 1` → `PAYROLL_VOID`, `PayrollPeriod`, `true`. Then repeat the whole cycle voiding as a **fourth** user D and assert the JSON key is **absent**: `select ("newValue" ? 'sameActorAsApprover') from audit_logs …` → `f`. That `?` operator distinguishes absent from false — `->>` cannot. |
| **L6** | Open `/reports/audit-log` in a real browser as Super Admin | The **Action** dropdown contains a `PAYROLL_VOID` option and the **Entity** dropdown contains `PayrollPeriod`. Select `PAYROLL_VOID`, submit, and confirm the result list contains the probe rows and **nothing else**. Name the controls exactly (`select#action`, `select#entity`) and assert something **positive** — a missing option and a wrong selector look identical. **Take a screenshot**; assertions do not see layout. |
| **L7** | Payslip PAYDATE second-order effect | Open the payslip PDF for an entry in a **locked-but-never-approved** run before and after the change. Before: PAYDATE = the lock date. After: PAYDATE = the period end date. Record both values. This is expected, not a regression — but it must be seen, not assumed. |

**Negative controls that must appear on BOTH sides of the change:** L2's `approvedById` query
(returns B before, A after) and L5's absent-key query (must be `f` for a different-actor void both
before *and* after — before the change there is simply no key at all, which is also `f`).

**Cleanup:** delete the `ZZ-298-PROBE` period and its rows after the run, or note explicitly in the
report that it was left behind and why.

---

## Test Infra Improvement Notes

- The two hardcoded arrays (`entityTypes` in `+page.server.ts`, `ACTIONS` in `+page.svelte`) are
  **structurally untestable by the unit suite** and will silently drift from the `AuditAction` enum
  again. A cheap fix exists — a unit test that imports `AuditAction` from `@prisma/client` and
  asserts the page's `ACTIONS` array equals `Object.values(AuditAction)`. **Not built in this plan**
  (it needs the array exported from the Svelte module, a small refactor outside this blast radius).
  Recorded here so it is not lost.
- `pnpm check` does not typecheck `scripts/**`, so `count-ambiguous-approvedby.ts` has no gate. Run
  it once by hand (step 13). A repo-wide fix is out of scope.
- There is no existing unit test file covering the `periods.ts` lock/release **service** at all —
  `tests/unit/pay-periods.test.ts` covers the unrelated `src/lib/utils/pay-periods.ts` date helpers.
  This plan creates the first one.

---

## Commands (exact)

```bash
pnpm prisma generate            # ALWAYS before believing a red check
pnpm db:push                    # prisma db push — no migration files in this repo
pnpm exec tsx scripts/count-ambiguous-approvedby.ts

pnpm format:check
pnpm lint
pnpm check
pnpm test                       # vitest run — there is no test:unit script
pnpm test -- payroll-void-audit payroll-period-actors override-finalized-guard
```

`pnpm test:e2e` is **not** a gate for this change — it is flaky (#287) and no e2e spec covers the
audit log. Do not chase a red e2e run here.

---

## Risks

| Risk | Mitigation |
|---|---|
| A future `switch` over `AuditAction` breaks on the new value | Grep confirms none exists today; the two hardcoded arrays are updated in step 12 |
| The payslip PAYDATE change surprises Finance | Named explicitly above, proven in L7, called out in the commit message and the handoff |
| A `null === null` false match marks an ordinary void as same-actor | Mutation check M4 exists precisely for this |
| `lockedById` written outside the atomic claim by a later refactor | Mutation check M7 asserts it is in the **same** call as `lockedAt` |
| Vacuous mock green (this repo's #1 historical false-green) | The mutation table is mandatory and its **results** must be recorded; M10/M11 are pre-declared as uncatchable and covered by L6 |
| Historical rows keep the old ambiguity | Accepted by owner decision 4; documented in the schema comment; quantified by the step-13 script |

---

## Acceptance Criteria (done means)

1. All 13 steps applied, in order.
2. `pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test` all green.
3. `tests/unit/override-finalized-guard.test.ts` green **with zero edits**.
4. Every row of the mutation table **run**, with its actual result recorded (including M10/M11's
   "nothing went red — by design").
5. L1–L7 run live, before and after, with the negative controls on both sides and a screenshot from
   L6.
6. The step-13 count printed into the report.
7. No new 403, no new guard, no capability change anywhere in the diff.
8. `separation.ts` untouched — confirm with `git diff --name-only`.
9. Nothing committed by this plan's author without explicit owner approval; **no `Co-Authored-By`
   trailer**; merges go to `staging`, so `Closes #298` never fires — the issue is closed by hand.
   **Do not file any GitHub issue.**

---

## Phase Completion Rules

This plan is a single phase. It is `CODE DONE` when steps 1–13 are applied and the four automated
gates are green. It is only `VERIFIED` when, in addition:

- every mutation-check row M1–M11 has been **run** and its actual result recorded (an unrun
  mutation table is a hypothesis, not evidence — see `process/context/tests/all-tests.md`), and
- L1–L7 have been run live before **and** after the change, with the negative controls on both
  sides and the L6 screenshot attached.

Code-only completion is `CODE DONE`, never `VERIFIED`. A green unit suite alone does not promote
this plan, because M10 and M11 are pre-declared as uncatchable by the unit suite.

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/payroll-void-audit-298_PLAN_17-08-26.md`
2. **Last completed step:** PLAN written. No code written. Nothing committed. Working tree clean on
   `feat/timesheet-capture-162-177-200`.
3. **Validate-contract status:** pending — VALIDATE has not run.
4. **Context loaded:** `process/context/all-context.md`, `auth/all-auth.md` (routing only),
   `database/all-database.md`, `cicd/all-cicd.md`, `tests/all-tests.md`, and the locked SPEC
   `separation-of-duties-298-297_SPEC_17-08-26.md`.
5. **Next step for a fresh agent:** run VALIDATE against this file. Then EXECUTE **step 1**
   (`prisma/schema.prisma` enum value). Do not start at step 8 — the order in Phase A → F is
   load-bearing. Before touching anything, re-run
   `grep -rn "approvedById\|approvedAt" src prisma tests scripts` and confirm the reader list above
   still matches; the parallel #297 agent must not have changed it.

## Validate Contract

Status: CONDITIONAL
Date: 18-08-26
date: 2026-08-18
generated-by: outer-pvl
supersedes: 2026-08-18 (outer-pvl) — re-validated from V1; this plan was NOT edited in the repair pass, so its six concerns were re-judged rather than re-checked-off

Parallel strategy: sequential
Rationale: 6/7 signals present (S2 schema/API surface, S3 3+ directions, S4 3-plan program, S5 depth
requested, S6 high-risk class, S7 5+ files) — normally HIGH → parallel subagents. But this plan
cannot be parallelised with `void-semantics-and-sweep` under any strategy: both edit `voidRun`'s
body and the same region of `periods.ts`. Sequential is the only safe execution for the payroll
track. Both fan-out layers ran inline against the live source and the live database (read-only).

### Re-judgement — are G1 and G2 blocking?

**Both are COSMETIC. Neither blocks EXECUTE.** Asked directly, answered directly.

**G1 — the schema anchors are off by one, and it does not matter.** Confirmed live:
`prisma/schema.prisma:1613` is `lockedAt`, `:1614` is `releasedAt`, `:1615` is `createdAt`. The
plan's fact table says `1614-1615` and step 2 says "immediately after `releasedAt` (line 1615)".
Why it is cosmetic:

- The instruction's real anchor is the **field name** — "immediately after `releasedAt`" — and that
  is unambiguous and correct. The parenthesised number is decoration.
- Even followed literally, inserting at line 1615 puts `lockedById` / `releasedById` after
  `createdAt` instead of after `releasedAt`. Both positions are inside `model PayrollPeriod`, both
  are valid Prisma, and **field order in a Prisma model has no semantic effect** — the generated
  client, the migration DDL and the column set are identical. The only cost is a slightly untidy
  model.
- The Autonomous Goal Block already carries the mitigation verbatim: "Locate every edit target by
  FIELD NAME or by the quoted code, never by the line numbers in the plan: the schema anchors are
  off by one (lockedAt/releasedAt are at schema.prisma:1613-1614)."

Fix it in passing; do not gate on it. `AuditAction` at `194-203` and `PayrollRun.approvedById` /
`approvedAt` at `1091-1092` are exact.

**G2 — the L5-vs-L7 cross-reference is wrong, and it does not matter.** The "second-order effect"
section says the PAYDATE change "must be shown in the live check (step **L5** below)". The PAYDATE
step is **L7**; L5 is the period-void marker check. Why it is cosmetic:

- L7 exists, is unambiguous, and says exactly what to do ("Open the payslip PDF … before and after
  … Record both values").
- Done-means item 5 already requires **L1–L7** run before and after, so L7 cannot be skipped by
  following the bad pointer.
- A reader who follows the pointer to L5 lands on a psql query about `audit_logs` and
  `sameActorAsApprover` and will see within one line that it is not the PAYDATE check.

Fix the "L5" to "L7" in passing; do not gate on it.

Neither concern touches behaviour, coverage or ordering. The plan's gate stays CONDITIONAL because
of the cross-plan items below, not because of these two.

### Re-verified facts (read again this pass)

- `approvedById` writers in `src/` and `scripts/`: exactly **four** — `approvals.ts:673`,
  `payroll/index.ts:508`, `periods.ts:252`, `recruitment.ts:174` (JobPosting, different model).
  W1/W2/W3 as the plan states.
- `requirePeriod` (`periods.ts:21-28`) includes `runs`, so `voidPeriod` has both marker arms.
- `voidRun`'s `findFirst` (`runs.ts:95`) returns the whole row, so `run.approvedById` is available
  with no extra query.
- `entityTypes` in `+page.server.ts` has 8 entries and **no `PayrollPeriod`**; `ACTIONS` in
  `+page.svelte:21-30` has 8 entries and **no `PAYROLL_VOID`**. Both edits are findable and unique.
- `payslip-document.ts:282` is the `payDate: run.approvedAt ? … : shortDate(run.periodEnd)` line and
  `payslip-pdf.ts:156` is the `labelValue(doc, 'PAYDATE:', …)` line — both exact, both under
  `src/lib/server/services/payroll/`.
- `runs.ts` does not import `$lib/server/notifications`; only `periods.ts:9` does. G5 stands.
- Live database: **zero** `payroll_periods`, and both existing `payroll_runs` have a NULL
  `periodId`. Every live step must build its own period.

### NEW findings from this pass

**N1 — the AC-1.4 "zero edits" criterion is time-boxed, and the hard stop will misfire if it is
not.** `void-semantics-and-sweep` now declares one permitted edit (E1) to
`tests/unit/override-finalized-guard.test.ts` — adding `$transaction: async (fn) => fn(dbMock)` —
because its step 8 wraps `voidRun`'s update in a transaction. That edit lands in **PHASE 2**, after
this plan's PHASE 1. So:

- **Within Phase 1, this plan's "green with zero edits" claim is TRUE** and its own changes keep it
  true: step 10 only rewrites `voidRun`'s `writeAuditLog` payload, `writeAuditLog` is mocked in that
  file, and `voidedOwnApproval(ctx.actorId, run)` reads `run.approvedById`, which is `undefined` on
  the mock → predicate false → the key is simply absent. Nothing throws.
- **From Phase 2 onward the file carries one added line.** This plan's hard stop ("If
  `override-finalized-guard.test.ts` goes red, STOP") and done-means item 3 ("green **with zero
  edits**") must be read as **scoped to Phase 1**, or the Phase 6 re-run reads as a violation of a
  criterion that a sibling plan was contractually authorised to change. Severity: CONCERN
  (cross-plan). Execute-agent instruction E1 below.

**N2 — L5's negative control needs a concrete user mapping, and only ONE account in the whole
database can void.** `OVERRIDE_FINALIZED: ['SUPER_ADMIN']` (`rbac.ts:73`), and the live `users`
table holds exactly one active SUPER_ADMIN: `admin@veent.ph`. L5 says "repeat the whole cycle
voiding as a **fourth** user D" — there is no fourth voider. The step is still executable, but only
with this mapping, which the plan does not give:

| Cycle | approver A | locker B | releaser C | voider | expected |
|---|---|---|---|---|---|
| positive arm | `admin@veent.ph` | `admin@veent.ph` | — | `admin@veent.ph` | `sameActorAsApprover: true` present |
| absent-key arm | `ceo@veent.ph` | `hr@veent.ph` | `manager@veent.ph` | `admin@veent.ph` | key **absent** (`("newValue" ? 'sameActorAsApprover')` → `f`) |

L2's "approve as A, lock as a different user B" maps to `ceo@veent.ph` / `hr@veent.ph`; L4's
releaser C is `manager@veent.ph`. All four are active org_seed users with the required capabilities
(`APPROVE_FINANCE: ['CEO','SUPER_ADMIN']`, `MANAGE_PAYROLL: ['MANAGER','SUPER_ADMIN','HR_ADMIN',
'PAYROLL_OFFICER','CEO']`). Severity: CONCERN (live-step precision). E2 below.

**N3 — L7's "before" sample cannot be taken on `ZZ-298-PROBE`.** L7 needs a **locked-but-never-
approved** run. `ZZ-298-PROBE`'s run is **approved** at L2 as part of this plan's own negative
control, so its PAYDATE is the approval date, not the lock date, and it will not show the change at
all. The shared capture — which the sibling plan's step 12a owns and which is genuinely the SAME
artifact, one literal `PAYDATE:` string from one rendered PDF on a pre-step-8 tree — must be taken
on **`ZZ-D12-PROBE`**. Neither plan named the period. Severity: CONCERN (cross-plan). E3 below.

**N4 — L7's "after" half duplicates the sibling's step 12b.** Both capture the post-step-8 PAYDATE
on a locked-but-never-approved run. Assign it to **step 12b** (`ZZ-D12-PROBE-2`, PHASE 5) and cite
the single result here, exactly as L7-before cites step 12a. Two independent captures of the same
figure are wasted work and can disagree. Severity: CONCERN (cross-plan). E4 below.

### Test gates (5-column)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1.1 | `voidRun` and `voidPeriod` write `action: 'PAYROLL_VOID'` naming the actor | Hybrid | `pnpm test -- payroll-void-audit` + live L5 psql on `audit_logs` | A |
| AC-1.2 | the same-actor key is ABSENT on an ordinary void, never present-and-false | Fully-Automated | `pnpm test -- payroll-void-audit` asserting `expect(newValue).not.toHaveProperty('sameActorAsApprover')` | A |
| AC-1.2 | filtering by `PAYROLL_VOID` returns only voids | Fully-Automated | `pnpm test -- payroll-void-audit` (`override-search-returns-only-real`) | A |
| AC-1.3 | a same-actor void carries `sameActorAsApprover: true` (approver arm AND locker arm) | Hybrid | `pnpm test -- payroll-void-audit` + L5's `("newValue" ? 'sameActorAsApprover')` psql check, run with the two-cycle user mapping in N2 | A |
| AC-1.4 | nobody is newly blocked from voiding | Fully-Automated | `pnpm test -- override-finalized-guard` green with ZERO edits **as measured at the end of PHASE 1** — the sibling's E1 edit lands in PHASE 2 and is authorised | A |
| AC-1.5 | no external alert fires on void | Fully-Automated | `notifyMany` spy `not.toHaveBeenCalled()` — meaningful for `voidPeriod` only; **vacuous for `voidRun`**, which imports no notifier | C |
| AC-2.1 | `lock()` writes `lockedById` in the SAME `updateMany` as `lockedAt` | Hybrid | `pnpm test -- payroll-period-actors` + live L3 psql on `payroll_periods`; mutation M7 is the atomicity check | A |
| AC-2.2 | `release()` writes `releasedById`, distinct from `lockedById` | Hybrid | `pnpm test -- payroll-period-actors` + live L4 psql (both ids asserted positively: B = `hr@veent.ph`, C = `manager@veent.ph`) | A |
| AC-2.3 | `PayrollRun.approvedById` means the approver and only the approver | Fully-Automated | `pnpm test -- payroll-period-actors` (`approver-record-unambiguous`, A approves / B locks) + two-sided live L2. **This plan owns this gate**; the sibling's step 11 verifies and skips | A |
| AC-2.4 | nobody is newly blocked from lock or release | Fully-Automated | existing payroll permission suites green, unmodified (`pnpm test`) | A |
| AC-2.5 | approver / locker / releaser / voider read back as four separate names | Hybrid | `pnpm test -- payroll-period-actors` + live L1–L5 with the N2 mapping. Note the voider can only ever be `admin@veent.ph` in this database | A |
| AC-5.3 | every guard and marker is mutation-checked | Fully-Automated | mutation rows **M1–M11** RUN, each actual result recorded, including M10/M11's "nothing went red — by design" | A |
| AC-1.1 (UI half) | `PAYROLL_VOID` and `PayrollPeriod` are actually selectable at `/reports/audit-log` | Agent-Probe | live L6 — name `select#action` and `select#entity`, assert the option is PRESENT, screenshot. The ONLY gate on M10/M11 | D |
| AC-10.1 ("before" half) | the pre-change `PAYDATE:` string on a locked-but-never-approved run | Agent-Probe | live L7 "before" — **SHARED with `void-semantics-and-sweep` step 12a, captured ONCE on `ZZ-D12-PROBE` in the Phase-0 window**, never on `ZZ-298-PROBE` | C |
| AC-10.1 ("after" half) | the post-change `PAYDATE:` string | Agent-Probe | **owned by the sibling's step 12b** (`ZZ-D12-PROBE-2`, PHASE 5); L7-after cites that one result | C |

Failing stubs (Fully-Automated rows only — red-first starting points for EXECUTE):

```
test("should mark an ordinary void with no sameActorAsApprover key at all", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: the same-actor key is ABSENT on an ordinary void, never present-and-false")
})
test("should return only voids when filtering by PAYROLL_VOID", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: filtering by PAYROLL_VOID returns only voids")
})
test("should keep every existing voider admitted", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: nobody is newly blocked from voiding")
})
test("should send no external alert on void", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: no external alert fires on voidPeriod. NOTE: the voidRun half is vacuous — that module imports no notifier.")
})
test("should leave approvedById as the approver when a different user locks", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: PayrollRun.approvedById means the approver and only the approver")
})
test("should write lockedById in the same updateMany call as lockedAt", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: the atomic-claim assertion M7 exists to break")
})
test("should keep every existing locker and releaser admitted", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: nobody is newly blocked from lock or release")
})
```

Legacy line form (for existing validate-contract consumers):

- audit action + marker: `Fully-automated: pnpm test -- payroll-void-audit`
- lock/release actor columns: `hybrid: pnpm test -- payroll-period-actors` + precondition: dev server and `veent-db-5434` started BY THE USER (both currently up), then the L1–L5 psql script with the N2 user mapping
- audit-log dropdown arrays: `agent-probe: open /reports/audit-log as admin@veent.ph, assert select#action contains PAYROLL_VOID and select#entity contains PayrollPeriod, screenshot`
- schema push on a populated DB: `hybrid: pnpm db:push` + CI job 3 `schema-upgrade` — precondition: the user confirms the database is up
- payslip PAYDATE control + Finance note: `known-gap: documented — AC-10.2 and AC-10.3 are owned by void-semantics-and-sweep steps 12c/12e, NOT by this plan`

### Dimension findings

- Infra fit: PASS — `pnpm test` (vitest, no `test:unit`), `pnpm db:push`, `pnpm prisma generate` all exist and match the Commands block. Enum `ADD VALUE` is genuinely additive; no `scripts/migrate-*.ts` needed — correct call. `pnpm check` does not typecheck `scripts/**`; step 13 already requires a manual run. The database is UP, which removes the blocker the first pass recorded — but it holds **zero** payroll periods and two runs with NULL `periodId`, so L1 must build everything from scratch.
- Test coverage: CONCERN — M1–M11 is a strong table and M10/M11 are honestly pre-declared as uncatchable. Residuals: `void-no-external-alert` stays vacuous on the `voidRun` half (G5), and the live L5 negative control needs the N2 user mapping to be executable at all.
- Breaking changes: PASS — `AuditAction` gains a value; no exhaustive switch over `AuditAction` exists. The two hand-maintained arrays are correctly identified as the real break surface and both were re-read this pass. `lockedById`/`releasedById` as bare `String?` with no relation is the right call for a populated-DB push.
- Security surface: PASS — no capability check is touched. `requireAnyCapability(ctx.actorRoles, 'OVERRIDE_FINALIZED')` at `runs.ts:93` and `periods.ts:307` verified unchanged by this plan. `OVERRIDE_FINALIZED: ['SUPER_ADMIN']` at `rbac.ts:73`. #242 masks `newValue` at the read page only; the row is written intact, so the L5 psql assertions are valid.
- Section feasibility (Phase A, schema): CONCERN — G1, cosmetic. `lockedAt`/`releasedAt` are at `1613-1614`, not `1614-1615`. Locate by field name; the insertion point is valid either way because Prisma field order carries no meaning.
- Section feasibility (Phase B/C, periods.ts): PASS — `lock()` at `:138`, the atomic claim at `:171`, `release()` at `:268`, the `approvedById: ctx.actorId` write at `:252` inside the `tx.payrollRun.update` at `:246-258` — all confirmed. Step 8's "the whole update becomes conditional on `overrideNote`" is correct.
- Section feasibility (Phase D, void marker): PASS — both marker arms are reachable with no extra query. Step 10's rewrite of `voidRun`'s `writeAuditLog` keeps the guard test green (see N1).
- Section feasibility (Phase E, filter arrays): PASS — both arrays re-read this pass; both edits mechanically findable and unique.
- Section feasibility (Phase F, count script): PASS — read-only, correctly flagged as outside `pnpm check`'s reach.

### Open gaps

- **G1 — schema line anchors off by one (`1614-1615` vs `1613-1614`). COSMETIC, non-blocking.** Locate by field name. gap-resolution B.
- **G2 — internal cross-reference error: the PAYDATE step is L7, not L5. COSMETIC, non-blocking.** Done-means item 5 already requires L1–L7. gap-resolution B.
- **G3 — payslip module paths are abbreviated.** Real paths are `src/lib/server/services/payroll/payslip-document.ts` and `.../payroll/payslip-pdf.ts`; line numbers verified exact. Cosmetic. gap-resolution B.
- **G4 — `approver-record-unambiguous` / M9 duplicate the sibling's `lock-writes-no-approver` / M7.** Ownership is **THIS plan** (it creates `tests/unit/payroll-period-actors.test.ts`); the sibling verifies and skips. Resolved by ownership, no work. gap-resolution C.
- **G5 — `void-no-external-alert` is vacuous on the `voidRun` half.** `runs.ts` imports no notifier, so the spy can never fail there. Keep it for `voidPeriod`; state the vacuity rather than claiming AC-1.5 is proven on both paths. gap-resolution C.
- **G6 — AC-10.2 and AC-10.3 are NOT covered here.** L7 has no approved-run control and no Finance hand-off gate; those are the sibling's steps 12c and 12e. Do not mark this plan VERIFIED on the assumption that it discharged D12. gap-resolution C.
- **N1 — the AC-1.4 zero-edit criterion is scoped to PHASE 1** and must not be read as violated once the sibling's authorised E1 edit lands in PHASE 2. gap-resolution B.
- **N2 — L5's "fourth user D" does not exist.** Only `admin@veent.ph` holds `OVERRIDE_FINALIZED`. Use the two-cycle mapping above. gap-resolution B.
- **N3 — L7-before must be taken on `ZZ-D12-PROBE`,** not on `ZZ-298-PROBE`, whose run is approved. gap-resolution B.
- **N4 — L7-after is the sibling's step 12b.** Capture once, cite here. gap-resolution C.
- known-gap: the two hand-maintained dropdown arrays are structurally unprovable by the unit suite (M10/M11). Live L6 with a screenshot is the only gate. Documented, accepted. gap-resolution D.
- known-gap: `PAYROLL_VOID` fires identically for `voidRun` and `voidPeriod`, which have different money consequences. Only `entityType` distinguishes them on the audit screen. Accepted; unifying the two voids is out of scope. gap-resolution C.
- known-gap: historical `approvedById` rows stay ambiguous by owner decision 4. Only the step-13 count script quantifies them, and it asserts nothing. gap-resolution C.

### Execute-agent instructions

| # | Instruction | Trigger |
|---|---|---|
| E1 | Done-means item 3 and the "if `override-finalized-guard.test.ts` goes red, STOP" hard stop are **scoped to PHASE 1**. Measure the zero-edit criterion at the end of this plan's step 13. From PHASE 2 the file legitimately carries `void-semantics-and-sweep`'s edit E1 (one added `$transaction` mock key), which is contractually authorised. Do not treat that as a violation in PHASE 6. | Done-means item 3 |
| E2 | L5 has no "fourth user D" — `admin@veent.ph` is the only `OVERRIDE_FINALIZED` holder in the database. Run two cycles: (positive) `admin@veent.ph` approves, locks and voids → key present; (absent-key) `ceo@veent.ph` approves, `hr@veent.ph` locks, `manager@veent.ph` releases, `admin@veent.ph` voids → key absent. Those are also L2's A/B and L4's C. | Live L2–L5 |
| E3 | L7-before is the SAME capture as `void-semantics-and-sweep` step 12a and must be taken on **`ZZ-D12-PROBE`**, the never-approved period, ONCE, in the Phase-0 window. Do NOT attempt it on `ZZ-298-PROBE` — that period's run is approved at your own L2, so its PAYDATE is the approval date and it cannot show the change. | Phase 0 |
| E4 | L7-after is owned by the sibling's step 12b (`ZZ-D12-PROBE-2`, PHASE 5). Cite that result; do not capture it a second time. | Phase 6 |
| E5 | Fix G1 and G2 in passing: schema anchors are `1613-1614` (locate by field name regardless), and the "second-order effect" section's pointer to "step L5" should read "step L7". Neither is a gate. | Steps 1–2 |
| E6 | Every live step must build its own period: the database has **zero** `payroll_periods` and both existing `payroll_runs` have a NULL `periodId`. No existing run is reusable for L2–L5 or L7. | Live L1 |

### Execution order (binding — this plan's slot in the global sequence)

This plan is **PHASE 1** of six. It must land in full, in step order 1→13, BEFORE
`void-semantics-and-sweep` steps 3–8, because both edit `voidRun`'s body and `voidPeriod`'s region
of `periods.ts`. The full order is authored in the sibling plan's contract and repeated here:

`PHASE 0 (clean tree, live, ONE dev-server session)` — the sibling's step 1 probe + step 2 verdict,
then its step 12a on `ZZ-D12-PROBE`, then **this plan's L1–L5 "before" pass on `ZZ-298-PROBE`** (its
L7-before is step 12a's result CITED, not re-run), then `clearance-signoff-297`'s L0–L4 before →
`PHASE 1 (this plan, steps 1–13)` → `PHASE 2 (sibling steps 3–8, only if the probe reproduced;
sibling edit E1 lands here)` → `PHASE 3 (sibling step 9, the doc)` → `PHASE 4 (sibling steps 10–11)`
→ `PHASE 5 (sibling steps 12b/12c/12e)` → `PHASE 6 (both "after" live passes + every mutation row)`.
`clearance-signoff-297` runs on an independent track and may proceed in parallel at any time — its
file set is disjoint.

### What this coverage does NOT prove

- `pnpm test -- payroll-void-audit payroll-period-actors` mocks `$lib/server/db`. It does NOT prove that `lockedById` reached Postgres, that the `updateMany` atomic claim behaved under concurrency, that tenant scoping holds, or that the audit row was actually persisted. Only L3/L4 psql do.
- `pnpm test -- override-finalized-guard` staying green proves that no CAPABILITY changed. It does NOT prove the audit payload is correct — that file never inspects `newValue` and knows nothing about `PAYROLL_VOID` or `sameActorAsApprover`.
- No unit test proves the two dropdown arrays were updated (M10/M11 pre-declared uncatchable). Only L6 does, and only with a screenshot — an assertion cannot tell a missing `<option>` from a wrong selector.
- `void-no-external-alert` does NOT prove AC-1.5 for `voidRun`; that module has no notifier import to suppress. It proves it for `voidPeriod` only.
- The `db:push` gate does NOT prove the enum add is safe on a PRODUCTION-sized `audit_logs` table. CI job 3 pushes against a populated dev-shaped DB only.
- Live L1–L7 do NOT prove anything about historical rows. Pre-#298 `approvedById` values stay ambiguous by owner decision 4; only the step-13 count script quantifies them, and it asserts nothing.
- The live pass proves the marker for the ONE account that can void. It proves nothing about a tenant with several Super Admins, where the same-actor marker's discriminating power is what actually matters.
- Nothing here proves AC-10.2 (an approved run's PAYDATE is unmoved) or AC-10.3 (Finance was told). Those live in the sibling plan.
- `PAYROLL_VOID` firing identically for a run void and a period void means the audit action alone does NOT tell a reviewer whether money moved back. Only `entityType` does, and nothing tests that a reviewer reads it.

Gate: CONDITIONAL — 0 FAILs, 10 CONCERNs (G1/G2/G3 cosmetic plan-text; G4/G5/G6 cross-plan ownership statements; N1–N4 new cross-plan and live-step precision items), 3 known-gaps. **G1 and G2 are cosmetic and do NOT block EXECUTE** — the schema instruction anchors on a field name and Prisma field order is semantically inert, and done-means item 5 already forces L7 to run regardless of the bad pointer. All ten are covered by execute-agent instructions E1–E6. This plan is PHASE 1 and may start as soon as the Phase 0 live pass is recorded.
Accepted by: session — accepted concerns, by name: G1 schema line anchors off by one (cosmetic, E5); G2 the L5/L7 cross-reference error (cosmetic, E5); G3 abbreviated payslip module paths (cosmetic); G4 duplicate `lock-writes-no-approver` deliverable, ownership assigned to this plan; G5 vacuous `void-no-external-alert` on the `voidRun` half; G6 AC-10.2/AC-10.3 not covered here; N1 the AC-1.4 zero-edit criterion is scoped to PHASE 1 because the sibling's authorised E1 edit lands in PHASE 2 (E1); N2 L5 has no fourth voider — `admin@veent.ph` is the only OVERRIDE_FINALIZED holder, use the two-cycle mapping (E2); N3 L7-before must be taken on `ZZ-D12-PROBE`, not on the approved `ZZ-298-PROBE` (E3); N4 L7-after duplicates the sibling's step 12b (E4). Plus known-gaps: the dropdown arrays are unprovable by the unit suite and gated only by live L6; `PAYROLL_VOID` does not distinguish a run void from a period void; historical `approvedById` rows stay ambiguous by owner decision.

## Autonomous Goal Block

```
SESSION GOAL
Execute process/general-plans/active/payroll-void-audit-298_PLAN_17-08-26.md — the #298 payroll
half: add the PAYROLL_VOID AuditAction, add nullable lockedById/releasedById to PayrollPeriod,
write both from lock() and release(), stop lock() writing PayrollRun.approvedById, and stamp a
conditional-spread same-actor marker on void audit entries. 13 steps, order load-bearing. This is
PHASE 1 of the three-plan sequence. Gate is CONDITIONAL; nothing blocks.

AUTONOMY RULES
- Apply steps 1-13 in order. Do not start at step 8.
- Locate every edit target by FIELD NAME or by the quoted code, never by the line numbers in the
  plan: the schema anchors are off by one (lockedAt/releasedAt are at schema.prisma:1613-1614).
  This is cosmetic — Prisma field order carries no meaning — but fix it in passing (E5), along with
  the "second-order effect" section's pointer to "step L5", which should read "step L7".
- Apply these execute-agent instructions from the contract:
  E1 done-means item 3 ("override-finalized-guard.test.ts green with ZERO edits") and the matching
     hard stop are SCOPED TO PHASE 1. Measure them at the end of step 13. From PHASE 2 that file
     legitimately carries void-semantics-and-sweep's authorised edit E1 (one $transaction mock key).
     Do not read that as a violation in PHASE 6.
  E2 L5 has no "fourth user D": admin@veent.ph is the ONLY OVERRIDE_FINALIZED holder in the
     database. Run two cycles — positive: admin approves+locks+voids, key present; absent-key:
     ceo@veent.ph approves, hr@veent.ph locks, manager@veent.ph releases, admin voids, key absent.
     Those same users are L2's A/B and L4's C.
  E3 L7-before is the SAME capture as the sibling's step 12a and must be taken ONCE on
     ZZ-D12-PROBE, the never-approved period. NOT on ZZ-298-PROBE, whose run you approve at L2.
  E4 L7-after belongs to the sibling's step 12b. Cite it; do not repeat it.
  E6 build your own period at L1 — the database has zero payroll_periods and both existing
     payroll_runs have a NULL periodId.
- Do not touch separation.ts, approvals.ts:673, or payroll/index.ts:508.
- Do not add an index to AuditLog. Do not file any GitHub issue. No Co-Authored-By trailer.
- Run pnpm prisma generate before believing a red pnpm check.
- Record the ACTUAL result of every mutation row M1-M11, including M10/M11's "nothing went red".

HARD STOPS
- Ask the user to start the dev server and the veent-db-5434 container. Never start either
  yourself. Both are currently UP.
- Do not run pnpm db:push until the user confirms the database is up and has approved the push.
- Do not mutate the database outside the ZZ-298-PROBE marker rows.
- Commit nothing without explicit owner approval.

NEXT PHASE
EXECUTE. This plan is PHASE 1 of six. The Phase-0 clean-tree live pass — the sibling's step 1 probe
and step 12a, this plan's L1-L5 before, and clearance-signoff-297's L0-L4 before — must be captured
BEFORE step 1 is applied. void-semantics-and-sweep steps 3-8 are PHASE 2 and must not start until
this plan has landed in full.

CONTRACT SUMMARY
Gate CONDITIONAL. 0 FAILs, 10 CONCERNs, 3 known-gaps. The two flagged plan-text errors are COSMETIC
and non-blocking: the schema instruction anchors on a field name and Prisma field order is inert, and
done-means item 5 already forces L1-L7 to run regardless of the bad L5/L7 pointer. The four new
concerns are cross-plan and live-step precision items, all covered by E1-E4.

EXECUTE START COMMAND
ENTER EXECUTE MODE for process/general-plans/active/payroll-void-audit-298_PLAN_17-08-26.md
```
