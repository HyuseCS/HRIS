---
name: plan:hris-21-posting-status-guard
description: "HRIS #21 — block job-posting status changes while PENDING_APPROVAL, audit every status change in one transaction, fix the success message"
date: 24-09-26
feature: none
---

# HRIS #21 — Job posting status guard (SIMPLE plan)

**Date**: 24-09-26
**Status**: PLANNED (awaiting VALIDATE)
**Complexity**: SIMPLE

TL;DR: move `updateStatus` logic into a new service function `setJobPostingStatus` in
`src/lib/server/services/recruitment.ts`. It refuses PENDING_APPROVAL and same-status posts,
writes status + audit row in one `db.$transaction`, and returns the old status so the route
can pick the right message. One route-level unit test goes red on today's code first.

## Phase Record

| Phase | Status | Note |
|---|---|---|
| RESEARCH | DONE | scratchpad `research-21.md` (staging d773e1a) |
| SPEC | SKIPPED | issue #21 body is the spec: defect, "Agreed fix" (owner, 04-09-26), "Test that must fail first" |
| INNOVATE | SKIPPED | owner already chose the approach (agreed fix + D2: keep DRAFT→OPEN Publish) |
| PLAN | DONE | this file |
| VALIDATE | PENDING | must check PLAN-level decision PD-1 below |

Intent restatement (Tier 0): plan the #21 fix exactly as the owner agreed; nothing more.

## Overview and Scope

In scope (owner's agreed fix):
1. `updateStatus` rejects any posting currently `PENDING_APPROVAL` (approval stays only in `decideJobPosting`).
2. Every status change (publish, close, reopen, unpublish) writes an audit row in the same transaction.
3. The success message branches on the requested status and the old status correctly.

Out of scope (Simplicity First, research open questions answered):
- Notifications on publish/close/reopen: **unchanged** (none today, none added).
- `postedAt`: **unchanged** (stamped on →OPEN only when null).
- `closedAt`: **unchanged** (set on every →CLOSED; CLOSED→CLOSED can no longer happen, see PD-1).
- →DRAFT clearing timestamps: **unchanged** (no timestamp touched).
- `approvedById` / `submittedById`: **unchanged** (not written by this path).
- No new AuditAction enum value; no schema change; no UI change.
- `isHttpError` note in `dashboard/+page.server.ts` from the issue: not in scope.

## Design choice (one line)

Service function, not inline route code: it matches `submitJobPostingForApproval` /
`decideJobPosting` (read → guard → `$transaction` + `writeAuditLog`) that sit next to it, and
keeps every JobPosting status writer in one file so guards cannot drift.

## PLAN-level decision PD-1 (VALIDATE must check)

Allowed transitions (from current → requested):

| From \ To | OPEN | CLOSED | DRAFT |
|---|---|---|---|
| DRAFT | ALLOW (UI "Publish", D2) | ALLOW (hand-posted; not in UI) | REJECT 400 same-status |
| OPEN | REJECT 400 same-status | ALLOW (UI "Close Posting") | ALLOW (hand-posted unpublish; owner named "unpublish" as an audited change) |
| CLOSED | ALLOW (UI "Reopen") | REJECT 400 same-status | ALLOW (hand-posted) |
| PENDING_APPROVAL | REJECT 400 | REJECT 400 | REJECT 400 |

Rules, in this order:
- R1: current `PENDING_APPROVAL` → `error(400, 'This posting is awaiting approval. Use the approval decision instead.')`
- R2: requested === current → `error(400, 'The posting is already in that status.')`
- everything else allowed.

Why R2: minimal one-line rule; no UI control sends a same-status post (UI sends DRAFT→OPEN,
OPEN→CLOSED, CLOSED→OPEN only), so it breaks nothing, and it stops no-op audit rows and a
CLOSED→CLOSED `closedAt` reset. Hand-posted →DRAFT stays allowed because the owner listed
"unpublish" as a change that must be audited, not blocked. DRAFT→CLOSED stays allowed (not
asked to block). VALIDATE: confirm R2 and the →DRAFT/→CLOSED allowances match owner intent.

## Messages (requested status × old status)

| Transition | Message |
|---|---|
| any → CLOSED (DRAFT, OPEN) | `Posting closed.` |
| DRAFT → OPEN | `Posting published.` |
| CLOSED → OPEN | `Posting reopened.` |
| OPEN/CLOSED → DRAFT | `Posting moved back to draft.` |

Route expression (exact): `status === 'CLOSED' ? 'Posting closed.' : status === 'DRAFT' ? 'Posting moved back to draft.' : previousStatus === 'DRAFT' ? 'Posting published.' : 'Posting reopened.'`
(With R1/R2 in place, the only OPEN origins are DRAFT and CLOSED.)

## Touchpoints

| File | Change |
|---|---|
| `src/lib/server/services/recruitment.ts` | ADD exported `setJobPostingStatus` after `submitJobPostingForApproval` |
| `src/routes/(app)/recruitment/[id]/+page.server.ts` | `updateStatus` calls the service; message fix; drop direct `db.jobPosting.findFirst`/`update` in that action only |
| `tests/unit/recruitment-update-status.test.ts` | NEW unit test (route action + service, db mocked) |
| read only | `src/lib/server/audit.ts`, `src/lib/server/form-fail.ts`, `recruitment/[id]/+page.svelte`, `tests/unit/recruitment-posting-sod.test.ts`, `tests/unit/audit-log-reveal.test.ts`, `tests/e2e/form-errors.spec.ts:77-92` |

## Public Contracts

- New export: `setJobPostingStatus(id: string, organizationId: string, status: 'OPEN' | 'CLOSED' | 'DRAFT', ctx: AuditContext): Promise<{ previousStatus: JobPostingStatus }>`.
- Form action `?/updateStatus`: same input (`status` form field). New failure responses: 400 on PENDING_APPROVAL, 400 on same-status (`{ error }` via `failFromError`, like `advanceStage`). 404 now comes from the service as `{ error: 'Job posting not found' }` via `failFromError`. The `Invalid status` branch (`fail(400, { action: 'updateStatus', error: 'Invalid status' })`) stays in the route unchanged so `tests/e2e/form-errors.spec.ts:81` keeps passing.
- Audit row: `action 'UPDATE'`, `entityType 'JobPosting'`, `entityId id`, `oldValue { status: <old> }`, `newValue { status: <new> }`. oldValue IS included (one field; siblings omit it, but for a free transition the "from" is the whole point of the row).

## Blast Radius

3 files (2 source, 1 new test). Risk class: permission/trust-boundary (approval bypass). No schema, no API route, no UI.

## Implementation Checklist

Branch: `git switch -c fix/21-posting-status-guard` off updated local `staging`.

Section A — red test first
1. Create `tests/unit/recruitment-update-status.test.ts`. Mock pattern from `recruitment-posting-sod.test.ts:30-44,95-97` and route-action pattern from `audit-log-reveal.test.ts:33-36,108-109`:
   - `vi.hoisted` → `dbMock = { jobPosting: { findFirst: vi.fn(), update: vi.fn() }, $transaction: vi.fn() }`, `txMock = { jobPosting: { update: vi.fn() } }`. `dbMock.jobPosting.update` exists ONLY so the red run can observe today's un-transacted write.
   - `vi.mock('$lib/server/db', () => ({ db: dbMock }))`; `vi.mock('$lib/server/audit', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))`; `vi.mock('$lib/server/services/notifications', () => ({ notify: vi.fn() }))`; `vi.mock('$lib/server/services/job-boards', () => ({ getPostingBoards: vi.fn(), liveChannels: vi.fn(), removeChannel: vi.fn(), setChannel: vi.fn() }))`.
   - `const { actions } = await import('../../src/routes/(app)/recruitment/[id]/+page.server')`.
   - Copy the `project()` helper verbatim from `recruitment-posting-sod.test.ts:59-66`; `findFirst.mockImplementation(async (args) => project(row, args))` so a later `select` cannot make assertions vacuous.
   - `$transaction.mockImplementation((fn) => fn(txMock))`; `txMock.jobPosting.update.mockImplementation(async ({ data }) => ({ ...row, ...data }))`.
   - `beforeEach(() => { vi.clearAllMocks(); dbMock.jobPosting.findFirst.mockImplementation(async (args) => project(row, args)); dbMock.$transaction.mockImplementation((fn) => fn(txMock)); txMock.jobPosting.update.mockImplementation(async ({ data }) => ({ ...row, ...data })) })` (shape of `recruitment-posting-sod.test.ts:93-98`); `row` is a `let` set per test before the action call.
   - Event helper: `{ request: Object.assign(new Request('http://localhost/recruitment/jp1?/updateStatus'), { formData: async () => fd }), locals: { user: { id: 'user-hr', organizationId: 'org1', roles: ['HR_ADMIN'] } }, params: { id: 'jp1' }, getClientAddress: () => '127.0.0.1' }`.
   - Row fixture: `{ id: 'jp1', organizationId: 'org1', status, postedAt: null, closedAt: null, approvedById: null, submittedById: 'user-hr' }` (submitter = actor, the self-approval case).
2. Test T1 (bypass): row PENDING_APPROVAL, post `status=OPEN`. Assert: result `status === 400` AND `result.data.error === 'This posting is awaiting approval. Use the approval decision instead.'` (exact R1 text); `dbMock.jobPosting.update` NOT called; `txMock.jobPosting.update` NOT called; `writeAuditLog` NOT called; so `approvedById` stays null and status stays PENDING_APPROVAL (no write reached the DB). Repeat for CLOSED and DRAFT with `it.each`.
3. Negative control: write T1-T5 first (steps 2, 6-9), then on unfixed d773e1a run the WHOLE file: `bun run test tests/unit/recruitment-update-status.test.ts`. Record per case why it reds: T1 = success result / `dbMock.jobPosting.update` called; T2 = no tx update / no audit; T3 = message `Posting reopened.`; T4 = success, not the R2 text; T5 404 text `Posting not found`. Import or mock errors are NOT an acceptable red — stop and fix the test. Save this output for the commit body. Do not commit a red test.

Section B — service
4. In `src/lib/server/services/recruitment.ts`, after `submitJobPostingForApproval`, add `setJobPostingStatus(id, organizationId, status, ctx)`:
   - `const jp = await db.jobPosting.findFirst({ where: { id, organizationId } })`; `if (!jp) error(404, 'Job posting not found')`.
   - R1, then R2 (exact messages above).
   - `await db.$transaction(async (tx) => { await tx.jobPosting.update({ where: { id }, data: { status, ...(status === 'OPEN' && !jp.postedAt ? { postedAt: new Date() } : {}), ...(status === 'CLOSED' ? { closedAt: new Date() } : {}) } }); await writeAuditLog(ctx, { action: 'UPDATE', entityType: 'JobPosting', entityId: id, oldValue: { status: jp.status }, newValue: { status } }, tx) })`.
   - `return { previousStatus: jp.status }`.
   - Existing imports already cover `db`, `writeAuditLog`, `error`, `AuditContext`, `JobPostingStatus`. No new imports. No new comments.

Section C — route
5. In `recruitment/[id]/+page.server.ts` `updateStatus`: add `getClientAddress` to the destructured args; keep the capability check and the `validStatuses` fail unchanged; delete the `findFirst`, the `!posting` fail and the `db.jobPosting.update` block; build `ctx` exactly like `advanceStage` (lines 86-91); `let previousStatus: JobPostingStatus` (add `import type { JobPostingStatus } from '@prisma/client'`) from `try { ({ previousStatus } = await setJobPostingStatus(params.id, user.organizationId, status as 'OPEN' | 'CLOSED' | 'DRAFT', ctx)) } catch (e) { return failFromError(e) }`; return `{ action: 'updateStatus', saved: <message expression above> }`. Keep the existing comment line above the return verbatim. Add `setJobPostingStatus` to the import on line 6. Leave `db` import (other actions use it — verify with grep; remove only if now unused).

Section D — green + positive controls (same test file)
6. T2 positive controls (the 3 UI transitions), each asserting result `saved` text, `txMock.jobPosting.update` called with `expect.objectContaining({ where: { id: 'jp1' }, data: expect.objectContaining({ status }) })`, and `writeAuditLog` called with `(expect.anything(), expect.objectContaining({ action: 'UPDATE', entityType: 'JobPosting', entityId: 'jp1', oldValue: { status: from }, newValue: { status: to } }), txMock)`:
   - DRAFT→OPEN → `Posting published.`, data has `postedAt` Date.
   - OPEN→CLOSED → `Posting closed.`, data has `closedAt` Date.
   - CLOSED→OPEN (row `postedAt` set) → `Posting reopened.`, data has NO `postedAt` key.
7. T3 hand-posted OPEN→DRAFT → `Posting moved back to draft.`, audited with txMock.
8. T4 same-status OPEN→OPEN → 400 AND `result.data.error === 'The posting is already in that status.'` (exact R2 text), no tx write, no audit.
9. T5 org scope: `findFirst` called with `where: { id: 'jp1', organizationId: 'org1' }`; `findFirst` → null gives 404.
10. Negative control for audit tx: temporarily pass `db` instead of `tx` to `writeAuditLog` → T2 must red on the third arg; revert. (Proves the tx assertion can fail.)
11. Run T1 again on the fixed code: green.

Section E — gates, then commit
12. Run all gates (below). All green.

## Test Plan (vc-test-coverage-plan)

Test context: `process/context/tests/all-tests.md` chain; unit = vitest `tests/unit`, e2e = playwright `tests/e2e` (needs DB, user-started).

| Tier | Scenario | Command | Proves | Does NOT prove |
|---|---|---|---|---|
| Fully-Automated | T1 PENDING_APPROVAL → OPEN/CLOSED/DRAFT refused, nothing written | `bun run test tests/unit/recruitment-update-status.test.ts` | AC1 | real Prisma behaviour |
| Fully-Automated | T2 three UI transitions still work + messages | same | AC2, AC4 | rendered toast |
| Fully-Automated | T2/T3 audit written with tx client, old+new status | same | AC3 | real rollback on audit failure |
| Fully-Automated | T4 same-status refused; T5 org scope/404 | same | AC5 | — |
| Hybrid | `Invalid status` toast + real-DB Close/Reopen | `bun run test:e2e tests/e2e/form-errors.spec.ts tests/e2e/job-board-tracking.spec.ts` — precondition: owner has veent-db-5434 and the dev server up (EXECUTE never starts them); else the CI e2e job | AC2, AC6 | new R1/R2 errors in a browser |
| Hybrid (optional) | none added | — | — | e2e for pending bypass skipped: no UI control reaches it; unit covers it |

## Acceptance Criteria

- AC1: a posting in PENDING_APPROVAL cannot change status via `updateStatus`; no update, no audit, `approvedById` null. proven by: T1. strategy: Fully-Automated.
- AC2: DRAFT→OPEN, OPEN→CLOSED, CLOSED→OPEN still work. proven by: T2. strategy: Fully-Automated.
- AC3: every successful change writes `UPDATE`/`JobPosting` audit with oldValue+newValue on the tx client. proven by: T2, T3, step 10. strategy: Fully-Automated.
- AC4: messages match the Messages table. proven by: T2, T3. strategy: Fully-Automated.
- AC5: same-status refused; org scope kept. proven by: T4, T5. strategy: Fully-Automated.
- AC6: invalid status still returns `Invalid status`. proven by: Hybrid e2e gate (form-errors + job-board-tracking). strategy: Hybrid.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| T1 red on unfixed code (step 3), green after (step 11) | Fully-Automated | AC1 |
| T2 | Fully-Automated | AC2, AC3, AC4 |
| T3 | Fully-Automated | AC3, AC4 |
| T4, T5 | Fully-Automated | AC5 |
| audit-tx negative control (step 10) | Fully-Automated | AC3 |
| `bun run test:e2e tests/e2e/form-errors.spec.ts tests/e2e/job-board-tracking.spec.ts` (owner's DB/server up, or CI) | Hybrid | AC2, AC6 |
| `bun run format:check && bun run lint && bun run check && bun run test` | Fully-Automated | all (regression) |

Gates (exact, CI order from `.github/workflows/ci.yml:38-47`): `bun run format:check`, `bun run lint`, `bun run check`, `bun run test`. (There is no `test:unit` script; `test` = `vitest run`.)

## Accepted residuals

- F3 race (posting read outside the tx; a concurrent submit could land between read and write): accepted, same pattern as `submitJobPostingForApproval` / `decideJobPosting`. No conditional update.

## Phase Completion Rules

CODE DONE = sections A-D done. VERIFIED = all four gates green + both negative controls seen red for the right reason + VALIDATE contract satisfied.

## Dependencies and Risks

- Wave 1 parallel with #22 and #24-part-1: no shared files.
- Risk: `failFromError` drops the `action` key, so the page may show the new 400/404 errors differently from `Invalid status`. Same as `advanceStage` today; acceptable. Only reachable by hand-posting.
- Risk: removing the route `findFirst` changes the 404 text from `Posting not found` to `Job posting not found`. grep `tests/` for `Posting not found` before commit; update nothing unless a test asserts it (then keep the service text and report).
- Rollback: revert the PR; no data or schema change.

## Commit and PR plan

Commits (no AI attribution, no Co-Authored-By):
1. ONE commit on green gates: `fix(recruitment): refuse status changes on pending postings and audit each change` — test file + service + route together (owner rule: commit on green). Body: the per-case red-run output from step 3 (run on d773e1a).
One PR, base `staging`, branch `fix/21-posting-status-guard`, body references #21 (note: `Closes` does not fire on staging PRs). Push only when the owner says.

Post-merge action (owner / orchestrator, NOT during EXECUTE): comment on #21: "DRAFT Publish (DRAFT→OPEN without approval) is intended, owner confirmed 24-09-26 (D2). The fix keeps it and audits it."

## Test Infra Improvement Notes

(none identified yet)

## Resume and Execution Handoff

1. Selected plan: `process/general-plans/active/hris-21-posting-status-guard_PLAN_24-09-26.md`
2. Last completed step: PLAN written; no code changed.
3. Validate-contract: pending (VALIDATE must check PD-1).
4. Context loaded: scratchpad `CONTEXT.md`, `research-21.md`, issue #21 body.
5. Next step: VALIDATE; then EXECUTE Section A step 1.

## Validate Contract

Status: CONDITIONAL
Date: 24-09-26
date: 2026-09-24
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: score 2/7 (S2 trust-boundary surface, S6 high-risk class present); 3 files, one concern, one lane. Wave 1 parallel with #22 / #24-part-1 (no shared files, confirmed).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | PENDING_APPROVAL → OPEN/CLOSED/DRAFT refused, no write, no audit | Fully-Automated | `bun run test tests/unit/recruitment-update-status.test.ts` (T1, must be seen red on d773e1a first) | B |
| AC2 | DRAFT→OPEN, OPEN→CLOSED, CLOSED→OPEN still succeed | Fully-Automated | same file, T2 | B |
| AC3 | every change writes UPDATE/JobPosting audit, oldValue+newValue, on the tx client | Fully-Automated | same file, T2/T3 + step-10 negative control | B |
| AC4 | success message per Messages table | Fully-Automated | same file, T2/T3 | B |
| AC5 | same-status refused; org scope; 404 | Fully-Automated | same file, T4/T5 | B |
| AC6 | `Invalid status` still toasts once | Hybrid | `bun run test:e2e tests/e2e/form-errors.spec.ts` (DB up; CI e2e job) | A |
| AC2+AC3 (real DB) | Close + Reopen through real Prisma `$transaction` + `auditLog.create` | Hybrid | `bun run test:e2e tests/e2e/job-board-tracking.spec.ts` (DB up; CI e2e job) | B (amendment P1) |

Failing stubs (Fully-Automated rows; red-first starting points, not on-disk files):
- AC1: `test("should refuse a status change on a PENDING_APPROVAL posting with 400 and write nothing", () => { throw new Error("NOT IMPLEMENTED — TDD stub: pending refused") })`
- AC2: `test("should keep DRAFT→OPEN, OPEN→CLOSED, CLOSED→OPEN working", () => { throw new Error("NOT IMPLEMENTED — TDD stub: UI transitions") })`
- AC3: `test("should write an UPDATE/JobPosting audit row with oldValue and newValue on the tx client", () => { throw new Error("NOT IMPLEMENTED — TDD stub: audit in tx") })`
- AC4: `test("should say published / closed / reopened / moved back to draft per transition", () => { throw new Error("NOT IMPLEMENTED — TDD stub: messages") })`
- AC5: `test("should refuse same-status posts and scope the lookup to the organization", () => { throw new Error("NOT IMPLEMENTED — TDD stub: same-status + org scope") })`

C-4 reconciliation: `strategy` carries only Fully-Automated / Hybrid / Agent-Probe. No Known-Gap row proves a behavior.

Legacy line form:
- recruitment updateStatus guard + audit + message: Fully-automated: `bun run test tests/unit/recruitment-update-status.test.ts`
- regression gates: Fully-automated: `bun run format:check && bun run lint && bun run check && bun run test` (CI order, `.github/workflows/ci.yml:38-47`, verified)
- real-DB path: hybrid: `bun run test:e2e tests/e2e/form-errors.spec.ts tests/e2e/job-board-tracking.spec.ts` + precondition: owner has veent-db-5434 and the dev server up (never started by an agent); otherwise the CI e2e job
- concurrent submit/publish race: known-gap: documented (finding F3)

Dimension findings:
- Infra fit: PASS — scripts exist as named (`package.json` "test": "vitest run", "test:e2e", "check", "lint", "format:check"); vitest `include: tests/unit/**` covers the new file; no server, schema or env touch.
- Test coverage: CONCERN — unit plan is sound and can go red for the right reason, but (a) T1/T4 do not assert the error TEXT, so a 400 from the route's `Invalid status` branch (mis-named form key) would pass; (b) the one existing real-DB test of Close/Reopen (`tests/e2e/job-board-tracking.spec.ts:43-46,82`) is not named as a gate; (c) no `beforeEach` reset is specified.
- Breaking changes: PASS — no caller, UI control or test relies on a same-status post; the three UI transitions stay allowed; the 404 text change (`Posting not found` → `Job posting not found`) has no reader (`grep -rn "Posting not found" src tests` → only `+page.server.ts:125`).
- Security surface: PASS — closes the PENDING_APPROVAL bypass; only other PENDING exit is `decideJobPosting`; no new writer reachable from a request. Residual race (F3) cannot reach a state the actor could not reach serially.
- Section A (red test): CONCERN — mechanically feasible (mock set matches route + service imports; `recruitment-posting-sod.test.ts:30-44,93-98` pattern works for the same service); gaps (a)(c) above.
- Section B (service): PASS — `db`, `writeAuditLog`, `error`, `AuditContext`, `JobPostingStatus` already imported (`recruitment.ts:1-12`); insertion point after line 128 is unique.
- Section C (route): PASS — edit targets `+page.server.ts:108-150` present; `db` stays used by `load` (`:34`, `:43`). Highest-risk edit: the `let previousStatus` destructuring assignment may not type under `svelte-check`; `bun run check` catches it.
- Section D (green + controls): PASS — step-10 control can fail (third arg `dbMock` ≠ `txMock`).
- Section E (gates + commits): CONCERN (low) — commit 1 is a test-only commit that is red at its own SHA; owner rule is "commit on scoped green gates" (memory `commit-as-we-go.md`).

Execute-agent instructions:
- E1: T1 and T4 assert `result.data.error` equals the exact R1 / R2 text, not only `status === 400`.
- E2: `beforeEach`: `vi.clearAllMocks()` then re-apply `findFirst`/`$transaction`/`txMock.update` implementations (copy `recruitment-posting-sod.test.ts:93-98` shape).
- E3: T2 `txMock.jobPosting.update` assertion includes `where: { id: 'jp1' }` (the mock ignores `where`).
- E4: Before the fix, run the WHOLE new file once on d773e1a and record which cases red and why (T1 on status/dbMock.update, T2 on missing tx/audit, T3 on "Posting reopened.", T4 on success). Import/mock errors are not an acceptable red.
- E5: If `bun run check` rejects the untyped `let previousStatus`, type it `JobPostingStatus` (type-only import from `@prisma/client`) — no other change.

Open gaps:
- F3 race (read outside tx): known residual, same pattern as `submitJobPostingForApproval` / `decideJobPosting`; no conditional update required. Optional 3-line tightening if the owner wants it: `tx.jobPosting.updateMany({ where: { id, status: jp.status } })` + `count === 0 → error(409)` (in-repo precedent `timesheets.ts:394`).
- Issue #21's "posting still pending, approvedById null" is proven by "no write was issued" against mocks, not by reading a real row. Accepted as unit-level proof; a hand-POST e2e was deliberately skipped (no UI control reaches the state).

What This Coverage Does NOT Prove:
- Unit file: real Prisma/Postgres behaviour; that a failed `auditLog.create` rolls back the status update (tx rollback is Prisma's, not asserted); the rendered toast; concurrency.
- form-errors e2e: only the `Invalid status` branch; nothing about the new R1/R2/404 errors.
- job-board-tracking e2e: only OPEN→CLOSED and CLOSED→OPEN on `jp_seed_demo`; it does not read the audit row back, and does not cover DRAFT→OPEN or →DRAFT.
- Gate chain (format/lint/check/test): regression only; proves no behaviour of the new guard by itself.
- Nothing proves the F3 race outcome.

Gate: CONDITIONAL (0 FAILs, 3 CONCERNs; all fixable in plan text or as E1-E5)
Accepted by: PENDING — orchestrator/owner to accept concerns C-TEST (a,b,c), C-SECTION-A, C-COMMIT, or apply amendments P1-P3 and re-run VALIDATE

### Autonomous Goal Block

```
/goal Fix HRIS #21 per process/general-plans/active/hris-21-posting-status-guard_PLAN_24-09-26.md (validate-contract CONDITIONAL 24-09-26).
SESSION GOAL: updateStatus refuses PENDING_APPROVAL and same-status posts; every status change writes an UPDATE/JobPosting audit row (oldValue+newValue) in one $transaction via new service setJobPostingStatus; success message fixed. DRAFT->OPEN Publish stays (D2).
Autonomy: follow Sections A-E in order; apply execute instructions E1-E5 from the contract; red-first test must be seen red for the right reason on d773e1a before the fix.
Hard stops: no git push; no server/DB start; no edit outside the 3 touchpoint files; no schema change; no AI attribution or Co-Authored-By in commits; stop if T1 reds for an import/mock reason.
Gates: bun run format:check && bun run lint && bun run check && bun run test; e2e (form-errors, job-board-tracking) only if owner has the DB up, else CI.
Next phase: EXECUTE Section A step 1 on branch fix/21-posting-status-guard off updated staging.
Reference for latest state: process/general-plans/active/hris-21-posting-status-guard_PLAN_24-09-26.md
```
