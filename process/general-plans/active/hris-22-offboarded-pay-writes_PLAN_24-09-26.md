---
name: plan:hris-22-offboarded-pay-writes
description: "#22 — refuse NEW loans, cash advances, recurring allowances and recurring deductions for OFFBOARDED employees (409); map 409 to apiError on the two v1 create routes"
date: 24-09-26
feature: general
---

# #22 — No new pay items for OFFBOARDED employees

**Date**: 24-09-26
**Status**: PLANNED
**Complexity**: SIMPLE

TL;DR: Add `employmentStatus` to the shared `requireEmployee` select. Add one exported guard, `assertAcceptsNewPay`, in `employee-access.ts`. Call it in the 4 CREATE functions only, after the existing self/scope checks. It throws `error(409, OFFBOARDED_NO_NEW_PAY)`. Add 409 to the two v1 create routes' apiError list. No UI change. Red-first unit tests.

## Phase Table

| Phase | Status | Note |
|---|---|---|
| SPEC | SKIPPED | Issue #22 body + owner decisions D1 and round-2 (CONTEXT.md) are the spec |
| INNOVATE | SKIPPED | Owner chose the approach (D1 + round 2) |
| Intent-clarify | DONE | "Block NEW loans/CA/recurring allowances/recurring deductions for OFFBOARDED only; updates/ends and ON_LEAVE stay allowed" — auto-proceed |
| PLAN | DONE | this file |
| VALIDATE | pending | |
| EXECUTE | pending | branch `fix/22-offboarded-pay-writes` |

## Overview / Goals / Scope

- SPEC criteria (from owner decisions):
  - C1: `createLoan` refuses an OFFBOARDED employee; no row written.
  - C2: `createCashAdvance` refuses an OFFBOARDED employee; no row written.
  - C3: `createEmployeeEarning` refuses an OFFBOARDED employee; no row written.
  - C4: `createEmployeeDeduction` refuses an OFFBOARDED employee; no row written.
  - C5: ACTIVE and ON_LEAVE employees are still accepted by all 4 creates.
  - C6: Updates/ends on an OFFBOARDED employee's existing records stay allowed (`updateLoan`, `updateCashAdvance`; earnings/deduction end functions are untouched).
  - C7: A v1 API client gets the refusal as `409` in the apiError shape `{ error: <msg> }`.
- Out of scope: `offboardEmployee` side finding (post-merge comment only), UI gating (PD-4), #24 files, recruitment files, `employee-statutory.ts` (own local `requireEmployee`, not in the owner decision).

## Verified source facts (staging d773e1a, re-read 24-09-26)

- `src/lib/server/services/employee-access.ts:143-150` `requireEmployee` → `select: { id: true, userId: true }`, `error(404, 'Employee not found')`.
- 4 `requireEmployee` call sites of the shared function (`grep -rn "requireEmployee(" src`): `benefits.ts:154` (return value ignored), `payroll/loans.ts:38`, `payroll/employee-deductions.ts:31`, `payroll/employee-earnings.ts:24`. `employee-statutory.ts:21` defines its OWN local copy — not affected.
- `payroll/loans.ts:33-49` `assertMayWriteLoan(...): Promise<void>` — used by `createLoan` :71, `updateLoan` :110, `createCashAdvance` :136, `updateCashAdvance` :176.
- `payroll/employee-earnings.ts:24` `assertNotSelf(ctx.actorId, await requireEmployee(employeeId, organizationId))`.
- `payroll/employee-deductions.ts:31` same line.
- `src/routes/api/v1/payroll/loans/+server.ts:72` and `src/routes/api/v1/payroll/cash-advances/+server.ts:70` (edit by matching the text, not the line): `if (err?.status && [400, 404].includes(err.status))`.
- `src/lib/server/api-error.ts:3` `apiError(status, message, details?)` → `json({ error: message, details }, { status })`.
- addLoan/addCashAdvance/addEarning use `failFromError`; addDeduction uses an inline `isHttpError → fail(e.status, { action, error })` check (+page.server.ts:774-776). Same effect: a 409 a 409 already renders through `actionError(['addLoan','addCashAdvance'])`, `actionError(['addEarning','endEarning'])` and the deduction slot. No page-server change needed.
- No test asserts the `select` argument of `requireEmployee` (`grep -rn "userId: true }" tests/unit` → no hits).

## Plan Decisions (PD — VALIDATE must check)

- **PD-1 Where the check lives.** Widen the shared `requireEmployee` select to `{ id: true, userId: true, employmentStatus: true }` and add a separate exported guard `assertAcceptsNewPay(target: { employmentStatus: EmploymentStatus })`. Called ONLY in the 4 create functions. Why: the update paths call `assertMayWriteLoan` too, so the check cannot go inside it; a flag parameter is worse than a caller-side call. Widening is one additive column: `benefits.ts:154` ignores the return value; the 3 pay writers pass it to `assertNotSelf`, which reads only `userId`. No second DB query. `assertMayWriteLoan` changes its return from `Promise<void>` to the employee row so `createLoan`/`createCashAdvance` can pass it on; the two update callers ignore the return.
- **PD-2 Guard form `=== 'OFFBOARDED'`.** Why: owner said ON_LEAVE is not blocked, so `!== 'ACTIVE'` would be wrong; and existing mock fixtures (`loan-write-scoping.test.ts`, `loan-api-role-context.test.ts:59`, earnings/deductions audit tests) carry no `employmentStatus`, so `undefined` must pass.
- **PD-3 Order.** The guard runs AFTER the self check (and after the scope check in loans). Why: an actor who may not touch the employee must get 403/404 and learn nothing about status; the existing self-refusal tests (`self-action-guards.test.ts`) stay unchanged. It runs BEFORE the 400 amount validation so the business rule wins regardless of form input.
- **PD-4 No UI change.** The Add forms stay visible for OFFBOARDED. Why: the server guard is the fix; the 409 message already shows in each card's `actionError` slot; `employees/[id]/+page.svelte` is split by #23 in Wave 2 and the deduction form sits inside an `{#if data.deductionTypes.length}` / `{:else}`, so a gate there is not a one-line change. Zero page diff keeps #23 conflict-free. Can be revisited in #23/#24-part-2.
- **PD-5 API mapping.** Change `[400, 404]` → `[400, 404, 409]` in the two v1 CREATE routes only. Why: minimal; the PATCH twins never raise the new 409. The 403 rethrow at `loan-api-role-context.test.ts:101` stays as is (not widened to 403 — out of scope).
- **PD-6 Message text.** `export const OFFBOARDED_NO_NEW_PAY = 'Employee is offboarded — new loans, advances, allowances and deductions cannot be added'` in `employee-access.ts`, next to `SELF_ACTION_DENIED`. Why: one constant so tests assert the exact text; mirrors the `SELF_ACTION_DENIED` pattern.

## Acceptance Criteria

- C1-C7 above, each green in the Verification Evidence table.
- Negative controls (steps 11, 13) recorded red for the right reason.
- format:check, lint, check, full unit suite green.

## Phase Completion Rules

- CODE DONE when Sections A-C are written and gates 14-17 pass.
- VERIFIED only after VALIDATE contract gates and negative controls are recorded.

## Implementation Checklist

### Section A — service guard (lane: single)

1. `src/lib/server/services/employee-access.ts`
   - Import `EmploymentStatus` type from `@prisma/client` (type-only; add to the existing import if one exists, else new `import type` line).
   - Add `export const OFFBOARDED_NO_NEW_PAY = '<PD-6 text>'` directly after the `SELF_ACTION_DENIED` declaration.
   - In `requireEmployee`, change `select: { id: true, userId: true }` → `select: { id: true, userId: true, employmentStatus: true }`. In its doc comment, edit only the words that become false: "returning just what `assertNotSelf` needs" → "returning what `assertNotSelf` and `assertAcceptsNewPay` need". No other comment edits.
   - Add after `requireEmployee`:
     `export function assertAcceptsNewPay(target: { employmentStatus: EmploymentStatus }): void { if (target.employmentStatus === 'OFFBOARDED') error(409, OFFBOARDED_NO_NEW_PAY) }` (formatted per prettier). No doc comment.
2. `src/lib/server/services/payroll/loans.ts`
   - Import `assertAcceptsNewPay` from `'../employee-access'` (extend the existing import line).
   - `assertMayWriteLoan`: body becomes `const employee = await requireEmployee(employeeId, organizationId)`, `assertNotSelf(ctx.actorId, employee)`, the `if (!canAny…)` block with its `// ponytail:` comment verbatim, then `return employee`. Return annotation `Promise<void>` becomes `Promise<Awaited<ReturnType<typeof requireEmployee>>>`. Doc comment verbatim.
   - `createLoan` :71: `await assertMayWriteLoan(employeeId, organizationId, ctx)` → `assertAcceptsNewPay(await assertMayWriteLoan(employeeId, organizationId, ctx))`.
   - `createCashAdvance` :136: same change.
   - `updateLoan` / `updateCashAdvance`: NO change.
3. `src/lib/server/services/payroll/employee-earnings.ts:24`
   - Replace the single line with: `const employee = await requireEmployee(employeeId, organizationId)`, `assertNotSelf(ctx.actorId, employee)`, `assertAcceptsNewPay(employee)`. Extend the import.
4. `src/lib/server/services/payroll/employee-deductions.ts:31` — same three-line replacement, same import extension.
5. Section A gate: `bun run test -- tests/unit/offboarded-pay-writes.test.ts tests/unit/loan-write-scoping.test.ts tests/unit/self-action-guards.test.ts tests/unit/employee-earnings-audit-tx.test.ts tests/unit/employee-deductions-audit-tx.test.ts tests/unit/loan-api-role-context.test.ts` all green.

### Section B — v1 create routes (lane: single)

6. `src/routes/api/v1/payroll/loans/+server.ts:72` (match the text) `[400, 404]` → `[400, 404, 409]`.
7. `src/routes/api/v1/payroll/cash-advances/+server.ts:70` same (match the text).
8. Do NOT touch the `[id]/+server.ts` PATCH routes.

### Section C — tests (written FIRST, before A and B; see TDD order)

9. New file `tests/unit/offboarded-pay-writes.test.ts`, following the hoisted-mock pattern of `tests/unit/self-action-guards.test.ts:23-37` and `$transaction.mockImplementation(fn => fn(tx))` from `loan-write-scoping.test.ts`.
   - `dbMock.employee.findFirst` MUST honour `select`: implement as `({ where, select }) => { const row = ROWS[where.id]; if (!row) return null; return select ? Object.fromEntries(Object.keys(select).filter(k => select[k]).map(k => [k, row[k]])) : row }`. Why: a mock that returns `employmentStatus` regardless of `select` would stay green if step 1's select widening were forgotten (vacuous-mock ban). Also return the actor's own row when `where.userId` is set (copy `loan-write-scoping.test.ts` shape; needed by T6).
   - Actor for T1-T5: roles `['HR_ADMIN']`; actor userId differs from every target. HR_ADMIN holds `VIEW_PAY_ORGWIDE`, so T1-T5 do NOT reach `assertCanTouchEmployee`; the scope arm is covered only by T6.
   - Mocks (E1): `tx.loan.create`, `tx.cashAdvance.create`, `tx.employeeEarning.create`, `tx.employeeDeduction.create`, `tx.loan.update`, `tx.cashAdvance.update` all `mockResolvedValue({ id: '<model>-new' })`; `vi.mock('$lib/server/audit')` (`writeAuditLog` → resolved) and mock the supervisors module the same way `loan-write-scoping.test.ts` does; `dbMock.branch.findMany` → `[]`.
   - ROWS: `emp-off` OFFBOARDED, `emp-active` ACTIVE, `emp-leave` ON_LEAVE; each `{ id, userId, branchId: null, employmentStatus }`.
   - `deductionType.findFirst` resolves `{ id: 'dt1', isActive: true, isStatutory: false }`.
   - Tests (describe.each over the 4 creates):
     - T1 "refuses OFFBOARDED with 409 and writes nothing" — `rejects.toMatchObject({ status: 409, body: { message: OFFBOARDED_NO_NEW_PAY } })`; the matching `tx.<model>.create` and `tx.auditLog`/`writeAuditLog` not called. (C1-C4)
     - T2 "accepts ACTIVE" — resolves; `tx.<model>.create` called once. (C5)
     - T3 "accepts ON_LEAVE" — same. (C5)
   - T4 "updateLoan on an OFFBOARDED employee's loan still succeeds" — `dbMock.loan.findFirst` → `{ id: 'loan1', employeeId: 'emp-off' }`; `updateLoan('loan1','org1',{ status: 'PAID' }, CTX)` resolves; `tx.loan.update` called. Same for `updateCashAdvance`. (C6)
   - T5 (describe.each over all 4 creates) "self check still wins over the offboarded check" — actor's own row is OFFBOARDED; each create rejects with 403 `SELF_ACTION_DENIED`, not 409. (PD-3)
   - T6 "scope check wins over the offboarded check" — actor roles `['MANAGER']` with no reporting line to `emp-off` (supervisors mock returns no reports); `createLoan` and `createCashAdvance` on `emp-off` reject with 403 and the scope DENIED text (import the constant used by `loan-write-scoping.test.ts`), not 409; no create called. (PD-3)
10. `tests/unit/loan-api-role-context.test.ts` — append two tests (one in the loans POST describe, one in the cash-advances POST describe): actor `['MANAGER','FINANCE']`, `dbMock.employee.findFirst` for the stranger returns `{ ...STRANGER, employmentStatus: 'OFFBOARDED' }` (override via `mockImplementation` keeping the `where.userId` branch). Assert `res.status === 409` and `await res.json()` equals `{ error: OFFBOARDED_NO_NEW_PAY }` (`details` is undefined, so it is dropped by JSON). Import `OFFBOARDED_NO_NEW_PAY` from `$lib/server/services/employee-access` (E6). Assert `tx.loan.create` / `tx.cashAdvance.create` not called. (C7) Existing `:101` 403-rethrow test stays unchanged. In the header comment at :19, edit only "re-map only 400/404" → "re-map only 400/404/409".
    - `tests/unit/employee-earnings-audit-tx.test.ts:47` comment: edit only "selects id + userId" → "selects id + userId + employmentStatus". No other comments anywhere.

### TDD order and negative control

11. On a clean branch off staging, write step 9 and 10 FIRST. Run `bun run test -- tests/unit/offboarded-pay-writes.test.ts tests/unit/loan-api-role-context.test.ts`. Expected RED, and record why:
    - T1 (all 4): resolves instead of rejecting — the write happens (right reason: no guard).
    - The step-10 API tests: 201 instead of 409.
    - T2-T6 green already (positive controls; T5/T6 green because the self and scope checks exist).
    - E1 check: each of the 4 T1 cases must fail with the "promise resolved … instead of rejecting" message, NOT a TypeError. If any shows a TypeError, fix the mock first.
    - If T1 fails at import (missing `OFFBOARDED_NO_NEW_PAY` export), that is the wrong reason: first add ONLY the constant (step 1, bullet 2), re-run, confirm T1 reds on "promise resolved".
12. Then implement A and B; re-run → green.
13. Second negative control: temporarily revert only the `select` widening in step 1 → T1 must go red (mock returns no `employmentStatus`). Restore. Records that the mock is not vacuous.

### Existing tests that need changes

- Comment-only edits: `loan-api-role-context.test.ts:19`, `employee-earnings-audit-tx.test.ts:47` (see step 10). No assertion edits. Fixtures without `employmentStatus` pass under PD-2. `self-action-guards.test.ts` self fixtures refuse at 403 before the new guard. `payroll-read-scoping.test.ts:41` and `performance-template-assignment.test.ts:86` mock the functions away. EXECUTE must still run them all (Section D).

### Section D — gates (CI order, from package.json)

14. `bun run format:check`
15. `bun run lint`
16. `bun run check`
17. `bun run test` (full vitest)
18. No e2e: no e2e spec adds a loan/advance (research §7) and no UI change.

### Git

- Branch: `git switch -c fix/22-offboarded-pay-writes` off updated local staging.
- Commits (no AI attribution, no Co-Authored-By):
  1. `fix(payroll): refuse new loans, advances, allowances and deductions for offboarded employees` — Section A + step 9 + the earnings-audit comment fix. Body: paste the step-11/13 negative-control red output.
  2. `fix(api): return 409 refusals from the loan and cash-advance create routes as apiError` — Section B + step 10. Body: paste the step-11 red output for the API tests.
- Owner rule: commit only on green gates. No red, test-only commit.
- One PR to `staging`, title `fix(payroll): no new pay items for offboarded employees (#22)`. Push only on the owner's word.

### Post-merge (NOT EXECUTE) — comment on #22

Draft:

> Side finding while fixing this (not changed in this PR): `offboardEmployee` in `src/lib/server/services/employees.ts` (~line 1243) checks neither for an open separation case nor whether the employee is already OFFBOARDED. `createSeparation` refuses both (`separation.ts:42` "Employee is already offboarded", `:44-48` "An open separation case already exists"). So the direct Offboard action (employees/[id] page action, and the API `POST ?action=offboard` in `api/v1/employees/[id]/+server.ts:226-250`) can offboard someone who has an open separation case (the case stays open and no longer matches the employee record) and can re-offboard an already OFFBOARDED employee, overwriting endDate. Suggest a follow-up issue.

## Touchpoints

- Edit: `src/lib/server/services/employee-access.ts`, `src/lib/server/services/payroll/loans.ts`, `src/lib/server/services/payroll/employee-earnings.ts`, `src/lib/server/services/payroll/employee-deductions.ts`, `src/routes/api/v1/payroll/loans/+server.ts`, `src/routes/api/v1/payroll/cash-advances/+server.ts`, `tests/unit/loan-api-role-context.test.ts`, `tests/unit/employee-earnings-audit-tx.test.ts` (one comment phrase).
- New: `tests/unit/offboarded-pay-writes.test.ts`.
- Read only: `benefits.ts`, `self-action-guards.test.ts`, `loan-write-scoping.test.ts`, `employees/[id]/+page.server.ts`.
- MUST NOT touch (Wave 1 lanes): `src/routes/(app)/recruitment/**` (#21), `src/routes/(app)/employees/new/**` (#24-1), `src/routes/(app)/employees/[id]/**` (#23 later), `employee-statutory.ts`, `employees.ts`.

## Public Contracts

- New exports from `employee-access.ts`: `OFFBOARDED_NO_NEW_PAY`, `assertAcceptsNewPay`.
- `requireEmployee` return type gains `employmentStatus` (additive).
- Behaviour: the 4 creates throw `HttpError 409` for OFFBOARDED. Page actions surface it as a form failure. `POST /api/v1/payroll/loans` and `POST /api/v1/payroll/cash-advances` return `409 { "error": "<msg>" }`.

## Blast Radius

- 6 source files + 2 test files, one package. Risk class: payroll/money writes (high-risk: billing-like) and public API (v1 status code added). No schema change, no migration.
- Rollback: revert the PR; no data changes.

## Data Flow

Request → page action (`scopedToEmployee` → service) or v1 route → service create → `requireEmployee` (org-scoped read incl. status) → `assertNotSelf` → (loans: scope check) → `assertAcceptsNewPay` → 400 validation → transaction create + audit. Refusal exits as HttpError 409 → `failFromError` (page) or `apiError` (API).

## Risk Predictions

- R1: A fixture somewhere sets `employmentStatus: 'OFFBOARDED'` and expects a create to succeed → full `bun run test` catches it.
- R2: svelte-check type on `assertMayWriteLoan` return → gate 16.
- R3: Race — employee offboarded between read and insert. Accepted: same window exists for every other guard; finalize snapshot only covers ACTIVE loans at finalize time.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| T1 createLoan OFFBOARDED → 409, no write | Fully-Automated | C1 |
| T1 createCashAdvance OFFBOARDED → 409, no write | Fully-Automated | C2 |
| T1 createEmployeeEarning OFFBOARDED → 409, no write | Fully-Automated | C3 |
| T1 createEmployeeDeduction OFFBOARDED → 409, no write | Fully-Automated | C4 |
| T2/T3 ACTIVE and ON_LEAVE accepted (all 4) | Fully-Automated | C5 |
| T4 updateLoan/updateCashAdvance on OFFBOARDED allowed | Fully-Automated | C6 |
| T5 self check before offboarded check (all 4) | Fully-Automated | PD-3 |
| T6 MANAGER scope 403 before 409 (loan, CA) | Fully-Automated | PD-3 |
| loan-api-role-context 409 apiError (loans + CA POST) | Fully-Automated | C7 |
| Negative controls (step 11, 13) | Fully-Automated | C1-C4 non-vacuous |
| Full `bun run test` + format/lint/check | Fully-Automated | regression |

- Criterion links: C1-C4 proven by: T1 (strategy: Fully-Automated). C5 proven by: T2/T3 (strategy: Fully-Automated). C6 proven by: T4 (strategy: Fully-Automated). C7 proven by: loan-api-role-context 409 tests (strategy: Fully-Automated).
- Known gap: no live browser pass of the 409 banner. Low value: `failFromError` rendering is already covered for other 409s; optional owner click on an offboarded employee's Add Loan.

## Test Infra Improvement Notes

(none identified yet)

## Validate Contract

Status: CONDITIONAL
Date: 24-09-26
date: 2026-09-24
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 2/7 signals (S6 high-risk money write + public API status; S7 8 files). One package, tight coupling, one lane. Validation itself ran sequential in one agent (read-only, small blast radius).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| C1 | createLoan refuses OFFBOARDED, 409, no row, no audit | Fully-Automated | `bun run test -- tests/unit/offboarded-pay-writes.test.ts` T1[createLoan] | B |
| C2 | createCashAdvance refuses OFFBOARDED, 409, no row | Fully-Automated | same file, T1[createCashAdvance] | B |
| C3 | createEmployeeEarning refuses OFFBOARDED, 409, no row | Fully-Automated | same file, T1[createEmployeeEarning] | B |
| C4 | createEmployeeDeduction refuses OFFBOARDED, 409, no row | Fully-Automated | same file, T1[createEmployeeDeduction] | B |
| C5 | ACTIVE and ON_LEAVE still accepted by all 4 | Fully-Automated | same file, T2/T3 | B |
| C6 | updateLoan/updateCashAdvance on OFFBOARDED still allowed | Fully-Automated | same file, T4 | B |
| PD-3 | self 403 beats 409 on all 4; scope 403 beats 409 on loans/CA | Fully-Automated | same file, T5 (all 4) + T6 (MANAGER, out-of-line OFFBOARDED stranger) | B |
| C7 | v1 POST loans / cash-advances return 409 `{ error }` | Fully-Automated | `bun run test -- tests/unit/loan-api-role-context.test.ts` new 409 cases | B |
| non-vacuous | select widening is load-bearing | Fully-Automated | negative control step 13 (revert select → T1 red) | B |
| regression | no other suite breaks | Fully-Automated | `bun run format:check && bun run lint && bun run check && bun run test` | A |

Failing stub:
test("should refuse createLoan for an OFFBOARDED employee with 409 and write nothing", () => { throw new Error("NOT IMPLEMENTED — TDD stub: createLoan OFFBOARDED 409") })
test("should refuse createCashAdvance for an OFFBOARDED employee with 409 and write nothing", () => { throw new Error("NOT IMPLEMENTED — TDD stub: createCashAdvance OFFBOARDED 409") })
test("should refuse createEmployeeEarning for an OFFBOARDED employee with 409 and write nothing", () => { throw new Error("NOT IMPLEMENTED — TDD stub: createEmployeeEarning OFFBOARDED 409") })
test("should refuse createEmployeeDeduction for an OFFBOARDED employee with 409 and write nothing", () => { throw new Error("NOT IMPLEMENTED — TDD stub: createEmployeeDeduction OFFBOARDED 409") })
test("should accept ACTIVE and ON_LEAVE on all 4 creates", () => { throw new Error("NOT IMPLEMENTED — TDD stub: C5") })
test("should still allow updateLoan/updateCashAdvance on an OFFBOARDED employee", () => { throw new Error("NOT IMPLEMENTED — TDD stub: C6") })
test("should answer 403 (self, scope) before 409", () => { throw new Error("NOT IMPLEMENTED — TDD stub: PD-3") })
test("should return 409 { error } from POST loans and POST cash-advances", () => { throw new Error("NOT IMPLEMENTED — TDD stub: C7") })

Legacy line form:
- services (4 creates): Fully-automated: `bun run test -- tests/unit/offboarded-pay-writes.test.ts`
- v1 create routes: Fully-automated: `bun run test -- tests/unit/loan-api-role-context.test.ts`
- regression: Fully-automated: `bun run format:check && bun run lint && bun run check && bun run test`
- 409 banner in the browser: known-gap: documented (optional owner click; render path shared with existing 400/403 failures)

Dimension findings:
- Infra fit: PASS — no schema, no migration, no server; scripts exist (package.json:13 test, :17 lint, :19 format:check, :20 check). Baseline: the 7 blast-radius suites run green today (60/60).
- Test coverage: CONCERN — T1 reds for the right reason and the select-honouring mock + control 13 are real, but (a) the new file's HR_ADMIN actor skips the scope arm, so "scope 403 before 409" is untested; (b) T5 covers createLoan only; (c) the tx create mocks must return `{ id }` or T1 on unfixed earnings/deductions rejects with a TypeError (wrong reason). Fixed by E1-E3.
- Breaking changes: PASS — `requireEmployee` has 4 call sites, not 7 (benefits.ts:154, loans.ts:38, employee-deductions.ts:31, employee-earnings.ts:24; 7 is the count of service functions behind them). No test asserts its `select` (only `objectContaining({ where })`: benefits-enroll-scoping.test.ts:59, employee-access.test.ts:153,205). No caller returns the row to a client. employee-statutory.ts:21 has its own copy — untouched.
- Security surface: PASS — server-side guard, runs after org 404, self 403 and scope 403 on every path (page: scopedToEmployee +page.server.ts:414-423 runs before every action; loans: assertMayWriteLoan loans.ts:33-49; earnings/deductions have no v1 route). An out-of-scope actor never sees the 409, so no status leak.
- Section A (service guard): PASS — edit targets unique; typing `Promise<Awaited<ReturnType<typeof requireEmployee>>>` is non-null because `error()` returns never. Two doc comments go stale (E4).
- Section B (v1 routes): CONCERN (low) — the loans route line is :72, not :70 (cash-advances is :70); edit by string. PATCH routes need nothing: updateLoan/updateCashAdvance never raise the new 409. Header comment loan-api-role-context.test.ts:19-21 "the routes re-map only 400/404" goes stale (E4).
- Section C (tests): CONCERN — see Test coverage (E1-E3).
- Section D (gates): PASS.
- Coverage hunt (5th create): PASS — none. `grep -rnE "\.(loan|cashAdvance|employeeEarning|employeeDeduction)\.(create|createMany|upsert)\b" src prisma` → only loans.ts:78, :143, employee-earnings.ts:30, employee-deductions.ts:44 (scripts/*.ts seeds and a probe write via `db` directly, not via services — unaffected). payroll/index.ts:699 nested `earnings: { create }` is PayrollEarning/PayrollDeduction (schema.prisma:1280-1281), a different model. No proposal, import or separation path creates these rows; separation only runs `updateMany` (separation.ts:455, 459, 593, 603), so final pay and write-off keep working for OFFBOARDED.
- PD-4 (no UI change): PASS — 409 renders: slots at +page.svelte:1110 (addLoan, addCashAdvance), :1251 (addEarning), :1338-1344 (addDeduction); errorFor :190-193 matches form.action. addLoan/addCashAdvance/addEarning use failFromError; addDeduction uses an inline `isHttpError → fail(e.status, { action, error })` (+page.server.ts:774-776) — plan says "failFromError" for all, same effect.
- Post-merge comment draft: CONCERN — two claims are wrong (E5).

Execute-agent instructions:
- E1: In tests/unit/offboarded-pay-writes.test.ts set `tx.loan.create`, `tx.cashAdvance.create`, `tx.employeeEarning.create`, `tx.employeeDeduction.create` to `mockResolvedValue({ id: '<model>-new' })`, and `tx.loan.update`/`tx.cashAdvance.update` for T4. Mock `$lib/server/audit` and `$lib/server/services/supervisors` (listReportIdsFor), `dbMock.branch.findMany → []`. Before implementing, confirm each T1 reds with "promise resolved instead of rejecting", not a TypeError.
- E2: Add T6: actor roles `['MANAGER']`, reporting line excludes `emp-off`; `createLoan` and `createCashAdvance` on `emp-off` reject with 403 and the scope DENIED text, not 409. (HR_ADMIN holds VIEW_PAY_ORGWIDE, so T1-T3 never reach assertCanTouchEmployee.)
- E3: Run T5 over all 4 creates (describe.each), so a mis-ordered three-line split in employee-earnings.ts/employee-deductions.ts goes red.
- E4: Stale comments — carry them across, changing only the false words: employee-access.ts `requireEmployee` doc ("just what `assertNotSelf` needs" → mention the status for `assertAcceptsNewPay`); tests/unit/loan-api-role-context.test.ts:19 "re-map only 400/404" → "400/404/409"; tests/unit/employee-earnings-audit-tx.test.ts:47 "selects id + userId" (read-only file per plan — leave it and note it, or add to touchpoints). No other new comments.
- E5: Fix the #22 comment draft before posting: the API path is `POST /api/v1/employees/[id]?action=offboard` (api/v1/employees/[id]/+server.ts:226-250); PATCH refuses employmentStatus with 400 (:139-144) and there is no DELETE export. Replace "skipping final pay and the loan write-off" — finalizeSeparation (separation.ts:366+) does not refuse an OFFBOARDED employee, so the case stays open and can still be finalized later. Accurate: "can offboard someone who has an open separation case (the case is left open and out of step with the employee record) and can re-offboard an OFFBOARDED employee, overwriting endDate." employees.ts:1243 and separation.ts:42, :44-48 are correct.
- E6: Import `OFFBOARDED_NO_NEW_PAY` in loan-api-role-context.test.ts. Note that its step-10 mock ignores `select`, so control 13 proves non-vacuity only through the new file — expected.
- E7: Optional: specs/001-hris-platform/contracts/payroll-v2.md:82-83 lists no error codes for these routes; add "Error 409: employee is OFFBOARDED" only if the owner wants the contract doc current.

Open gaps: none blocking. Known-gap: no live browser click of the 409 banner (optional owner click on an OFFBOARDED employee's Add Loan).
What this coverage does NOT prove:
- offboarded-pay-writes.test.ts: real Prisma `select` behaviour and a real DB row (mocked db); the race where an employee is offboarded between read and insert (R3, accepted).
- loan-api-role-context.test.ts: SvelteKit's production rendering of a thrown error (handler called directly); the apiError path with a real Request.
- full gates: the browser banner render and scroll-to-error for the 409; e2e not run (no UI change).
Gate: CONDITIONAL (0 FAIL, 4 CONCERN — all closed by E1-E5 as execute-agent instructions; no design change)
Accepted by: session (orchestrator-directed VALIDATE, no user menu) — concerns: test-scope-arm gap (E2), T5 breadth (E3), tx create mock shape (E1), stale comments (E4), comment-draft accuracy (E5), loans route line :72 (Section B)

### Autonomous Goal Block

/goal Fix HRIS #22 on branch fix/22-offboarded-pay-writes off staging: the 4 create functions (createLoan, createCashAdvance, createEmployeeEarning, createEmployeeDeduction) refuse OFFBOARDED employees with 409 OFFBOARDED_NO_NEW_PAY; updates/ends and ON_LEAVE stay allowed; v1 POST loans/cash-advances map 409 to apiError. Plan: process/general-plans/active/hris-22-offboarded-pay-writes_PLAN_24-09-26.md (Validate Contract CONDITIONAL, apply E1-E6). Order: tests first (red, right reason), then Section A, B, gates format:check, lint, check, test. Autonomy: edit only the plan's touchpoints; no new comments except the E4 word fixes. Hard stops: no push, no PR without owner word, no servers, no .env, no AI attribution in commits, do not touch employees/[id]/**, recruitment/**, employees/new/**, employee-statutory.ts, employees.ts. Next phase: EXECUTE. Start: git switch -c fix/22-offboarded-pay-writes, then write tests/unit/offboarded-pay-writes.test.ts.

## Resume and Execution Handoff

1. Selected plan: `process/general-plans/active/hris-22-offboarded-pay-writes_PLAN_24-09-26.md`
2. Last completed: PLAN.
3. Validate-contract: pending.
4. Context loaded: scratchpad `CONTEXT.md`, `PLAN-BRIEF.md`, `research-22.md` Part A; source re-read at d773e1a.
5. Next: VALIDATE this plan, then EXECUTE Section C (red) → A → B → D on `fix/22-offboarded-pay-writes`. Single lane; parallel split not useful (8 files, tight coupling).
