---
name: report:void-semantics-and-sweep
description: "EXECUTE record for D10/D11/D12 — the voidRun amortization fix, the extraction, the clean sweep verdict, and all 11 mutation results. CODE DONE, not VERIFIED: the live L2-L7 pass and D12 are outstanding."
date: 18-08-26
status: CODE DONE
plan: process/general-plans/active/void-semantics-and-sweep_PLAN_18-08-26.md
---

# EXECUTE — D10 / D11 / D12, steps 3–11

**Status: `CODE DONE`, not `VERIFIED`.** All four automated gates are green and every mutation row
M1–M11 was run with its actual result recorded below. The plan's own Phase Completion Rules keep it
at `CODE DONE` until the live L2–L7 pass and D12 (steps 12b/12c/12e) run — those are a follow-up
pass and were deliberately not attempted here. Nothing is committed.

Step 1 (the D10 gate) and step 2 (the verdict) were already run and recorded in
`phase0-evidence_18-08-26.md`: **the divergence REPRODUCES**, so steps 3–8 were live, not cancelled.

## What was done

| Step | File | Change |
|---|---|---|
| 3 | `src/lib/server/services/payroll/amortization.ts` **(new)** | `reverseAmortization(tx, runId)` — the body of `if (run && wasLocked)` lifted verbatim out of `voidPeriod`. Opens no transaction, writes no status. Carries the moved `#119` and "reverse what was actually applied" comments, plus a new landmine comment naming the cash-advance over-credit and stating that this change makes it *worse* (reachable on a path that leaves the period `LOCKED`) |
| 4 + E2 | `payroll/periods.ts` | The lifted block is now `if (run && wasLocked) await reverseAmortization(tx, run.id)`. The two status flips below it did **not** move. `sum` dropped from the `./money` import (its only use moved); `D`/`q2` stay. Doc-pointer comment above `voidPeriod` |
| 5 + E5 | `api/v1/payroll/[id]/+server.ts` | The `voidRun` call is now wrapped, mapping 400/403/404 to `apiError` with `'Cannot void this run'`, mirroring the approve branch. The pre-existing try/catch around `requireAnyCapability` is untouched — E5's correction confirmed on read |
| 6 | `payroll/runs.ts` | `if (run.status === 'VOIDED') error(400, 'Payroll run is already voided')`. Only VOIDED; a comment says DRAFT/APPROVED stay allowed on purpose (AC-7.4) |
| 7 | `payroll/runs.ts` | `findFirst` gains `include: { period: true }`; `wasLocked` uses the optional chain `run.period?.status`, same two statuses as `periods.ts` |
| 8 | `payroll/runs.ts` | The bare `payrollRun.update` is now a `db.$transaction` doing the reversal then the status flip. `writeAuditLog` stays outside, untouched — #298's `PAYROLL_VOID` and the same-actor marker were not modified or duplicated |
| 8 / E1 | `tests/unit/override-finalized-guard.test.ts` | **One added line**: `$transaction: async (fn: (tx: unknown) => unknown) => fn(dbMock)`. No `period` key added, no assertion changed. 24/24 pass |
| 9 | `docs/payroll-void-semantics.md` **(new)** | AC-7.5. Table-first: precondition, what reverses, ending period status, how each is reached, `OVERRIDE_FINALIZED`, and the cash-advance over-credit stated under **both** void sections |
| — | `tests/unit/void-run-semantics.test.ts` **(new)** | 9 tests: reversal called on LOCKED and on RELEASED, skipped on GENERATED and on a NULL period, the 400 precondition, DRAFT/COMPUTED/APPROVED still void, the `amortization.ts` no-status grep, the doc content grep |
| — | `tests/e2e/payroll-void-run-amortization.spec.ts` **(new)** | Cloned from `payroll-lock-idempotency`. `TAG='e2e-void-d10'`, loan 10000/2500 **plus** a capped cash advance (balance 300, installment 500). Asserts named figures, `payroll_periods.status = LOCKED` after the run void, and the double-void 400. **Not run** — e2e is out of this pass's scope |

**E1 deviation, minor:** the contract's literal E1 line uses `(fn: any)`, which needs an
`eslint-disable` comment beside it and would have made the diff two lines. `(fn: (tx: unknown) =>
unknown)` is the same behaviour in one line with no lint suppression. `git diff` on that file shows
exactly one added line (plus the unavoidable trailing comma on the line above).

## Step 4 gate — all three parts

1. `grep -n "payrollPeriod.update\|payrollRun.update" .../amortization.ts` → **nothing** (exit 1).
2. Both status flips still present, unmoved, inside `voidPeriod`'s `$transaction`
   (`periods.ts:330-331`).
3. `pnpm test` green. **`pnpm test:e2e -- payroll-lock-idempotency` was NOT run** — e2e is owned by
   the follow-up live pass. This is a recorded substitution, not a silent skip: the extraction's
   no-regression proof is currently only the diff (the removed span is byte-identical to the new
   function apart from `run.id` → `runId`) and the unit suite. **The e2e must still be run before
   this plan can be promoted past `CODE DONE`.**

## Gates

| Gate | Result |
|---|---|
| `pnpm format:check` | green (2 files needed `--write`, applied) |
| `pnpm lint` | 0 errors, 1 pre-existing warning (`CalculatorWindow.svelte` a11y) |
| `pnpm check` | 938 files, **0 errors**, 1 pre-existing warning |
| `pnpm test` | **125 files, 1492 tests, all pass** |
| `git diff --name-only` | `separation.ts` and `prisma/schema.prisma` **untouched** |

## Mutation results — every row RUN

| # | Break | Expected | **Actual** |
|---|---|---|---|
| M1 | delete the already-VOIDED refusal | `void-run-status-precondition` red | **RED** — 1 failed / 8 passed |
| M2 | widen it to refuse DRAFT | `void-run-allows-draft-and-approved` red | **RED** — the DRAFT case failed |
| M3 | delete `reverseAmortization(tx, id)` | reversal test red | **RED** — 2 failed (LOCKED and RELEASED cases) |
| M4 | drop the `wasLocked` condition | `…skips-reversal-on-unlocked-period` red | **RED** — 2 failed (GENERATED and the NULL-period case) |
| M5 | `wasLocked` = LOCKED only | the RELEASED case red | **RED** — exactly the RELEASED case, 1 failed. The case added for this row is what makes it catchable |
| M6 | move `payrollRun.update` out of the transaction | **nothing red — by design** | **NOTHING RED** — full suite 1492/1492 still passed. The unit suite mocks `$transaction` and cannot see atomicity. Only crash injection would catch this; out of scope. Pre-declared and confirmed |
| M7 | put `approvedById: ctx.actorId` back into `lock()` | the fence red | **RED** — the sibling's `approver-record-unambiguous — an override lock still writes no approver` failed |
| M8 | weaken the fence to a null check | should still pass with the key absent | **PASSED, 6/6** — the weaker assertion is green on the correct code. **But** re-running M7 underneath it (M8b) still went **RED**, so on this particular mutation the weaker form is not actually weaker. It would be weaker against a mutation that writes an explicit `approvedById: null`. Observation recorded; reverted |
| M9 | delete `docs/payroll-void-semantics.md` | `void-semantics-documented` red | **RED** — 1 failed |
| M10 | no-op the CASH_ADVANCE arm of `reverseAmortization` | the e2e / L7 figures change | **NOTHING RED in the unit suite** — 1492/1492 still passed, as expected: no unit test reaches that arm. Its reachability proof is the new e2e spec's cash-advance seed and live **L7**, **neither of which has been run yet.** Until one of them runs, the cash-advance fence is *written* but not *demonstrated* |
| M11 | move the period status flip into `reverseAmortization` (re-commit F2) | the grep test red | **RED** — `run-void-leaves-period-untouched` failed. The cheapest gate in the plan and it works |

Every mutation was applied with a script and reverted from a scratchpad copy (`cp`, never
`git checkout`). A final `diff` against all five backups confirmed the tree was restored, and the
full suite is green after the last revert.

## D11 — the sweep (steps 10–11)

**Check A — the real gate. PASSES, and confirms D2 landed.** `grep -rn "approvedById:" src/ scripts/`
now returns three writers, not four:

```
src/lib/server/services/approvals.ts:673       the approver
src/lib/server/services/recruitment.ts:174     JobPosting — different model, out of scope
src/lib/server/services/payroll/index.ts:508   the approver
```

`periods.ts:252` — the `lock()` write — is **gone**, which is the confirmation that
`payroll-void-audit-298` step 8 landed. Two further hits are **not writers** and are both new since
the plan was written: `payroll/audit-markers.ts:12` (a type annotation in D1's marker helper) and
`scripts/count-ambiguous-approvedby.ts:17` (a read-only `where` filter in the sibling's count
script). No fifth writer. The plan's enumeration stands unchanged.

**Verdict (AC-8.1 / AC-8.3): exactly one ambiguous actor field, `PayrollRun.approvedById`, and D2
already fixed it.** The 22-row enumeration in the plan is the permanent record; nothing in it needed
a change.

**The field COUNT is a KNOWN GAP, reported as approximate, not as clean.** Three numbers disagree:
**22** enumerated in the plan, **23** reported by the original research sweep, **18** matched by the
schema grep re-run this session. The pattern structurally cannot match `ActionProposal.initiatorId`,
`ApprovalStep.actorId`, `PostingApprover.approverId` or `AuditLog.actorId`, none of which end in
`...ById`. The discrepancy is bookkeeping, not a known missing site, and **this plan's tooling cannot
close it.** The verdict above does not depend on the count.

**Step 11 — the AC-8.2 fence: VERIFIED PRESENT, SKIPPED as planned.** The sibling already shipped it
at `tests/unit/payroll-period-actors.test.ts:128-139` — `approver-record-unambiguous — an override
lock still writes no approver`, asserting `expect(call.data).not.toHaveProperty('approvedById')` and
the same for `approvedAt`, exactly the key-absence form the plan specifies. M7 proves it is live. No
second copy was written.

## Not done, and why

- **Every live step (L2–L7).** The dev server and DB are up but this pass was scoped to code and
  automated tests; the live/browser/curl work is a follow-up pass. **No `ZZ-` data was created and
  none was left behind — the database is untouched by this session.**
- **Both e2e specs** (`payroll-lock-idempotency` re-run and the new
  `payroll-void-run-amortization`). Consequence, stated plainly: the extraction's no-regression
  proof and the whole cash-advance fence (M10, L7) are currently **unrun**.
- **D12 entirely** (steps 12b / 12c / 12e — the "after" PAYDATE pair, the approved-run control, and
  **the Finance hand-off note, which is due before this ships**). 12a's "before" sample is already
  captured in `phase0-evidence_18-08-26.md`.

  > **CLOSED later the same day.** All of D12 ran, and the outcome is not what step 12 predicted:
  > HR ruled that **PAYDATE is the day the payslip was released**, so the shipped field reads
  > `run.releasedAt` and is blank when there is no release date — not the period end. Verified in a
  > rendered PDF on a period ending 15 Oct while the release happened 18 Aug, which is the one shape
  > that tells the release date apart from both the period end and any approval date. The Finance
  > note is `docs/finance-note-paydate-change.md`, and it is **closed, not pending** — the owner put
  > the question to HR and got a rule back. Nothing here is outstanding.

## The cash-advance over-credit — the honest statement

This change **converts a dormant defect into a live one.** The arithmetic is untouched — the block
was moved verbatim — but its reach is not. Today the over-credit fires only via `voidPeriod`, which
flips the period to `VOIDED` in the same transaction, so a wrong balance sits against a payroll that
is visibly dead. **After this change it also fires via `voidRun`, which deliberately leaves the
period `LOCKED`** — so an over-credited advance, or a `PAID` advance resurrected to `ACTIVE`, will
sit against a period that still looks live. `voidRun` moved zero money before this change; it moves
money now.

It is fenced, not fixed, exactly as the plan decided: named in the `amortization.ts` comment,
documented under **both** sections of `docs/payroll-void-semantics.md`, seeded in the new e2e spec
(capped 300/500, so the over-credit is +₱200 and the status flips PAID → ACTIVE), and covered by M10
and L7. **The measured peso figures do not exist yet** — L7 has not been run and the e2e has not been
run. Fixing it needs a cash-advance payment ledger plus a backfill decision the owner has not been
asked. No GitHub issue filed (SPEC constraint 11).
