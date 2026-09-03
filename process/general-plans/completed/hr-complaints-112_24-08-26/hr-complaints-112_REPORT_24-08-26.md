---
phase: sections-a-b
date: 2026-08-24
status: COMPLETE
feature: hr-complaints-112
plan: process/general-plans/active/hr-complaints-112_24-08-26/hr-complaints-112_PLAN_24-08-26.md
---

# EXECUTE report — Sections A and B (#112)

Scope of this run: Implementation Checklist steps 1–12 only. Sections C, D, E, F not started.
No commit made (orchestrator owns the commit).

## What Was Done

### Section A — make it compile (steps 1–8)

| Step | File | Change |
|---|---|---|
| 1 | `src/lib/server/services/types.ts` | Read only. `actorRoles: Role[]` confirmed required. No change. |
| 2 | `src/routes/(app)/complaints/+page.server.ts` | Deleted the dead `const roles = user.roles?.length ? user.roles : [user.role]` in `load`; `isHr` now reads `canAny(user.roles, 'MANAGE_HR')`. **[T10, T11]** |
| 3 | same file, `open` action | Deleted the dead `roles` const; guard is `if (!canAny(user.roles, 'MANAGE_HR'))`. **[T16, T17]** |
| 4 | same file, `open` ctx literal | `actorRole: user.role` → `actorRoles: user.roles`. **[T18]** |
| 5 | `src/routes/(app)/complaints/[id]/+page.server.ts` | Deleted all three dead `roles` consts (`load`, `reply`, `resolve`); all three now use `user.roles` directly. **[T19, T22, T25]** |
| 6 | same file, `reply` + `resolve` ctx literals | `actorRole: user.role` → `actorRoles: user.roles` (both). **[T24, T26]** |
| 7 | `tests/unit/complaints.test.ts:28` | `actorRole: 'HR_ADMIN'` → `actorRoles: ['HR_ADMIN']`. **[T27]** |
| 7b | `src/routes/(app)/complaints/[id]/+page.svelte` | `pnpm prettier --write` on that one file. Diff inspected: 3 insertions / 2 deletions, a whitespace reflow of one `<p>` template expression. **No logic, markup or copy change.** **[T30]** |
| 7c | `src/routes/(app)/complaints/+page.server.ts`, `[id]/+page.server.ts` | `format:check` flagged both after my edits (my `if (!canAny(...))` line wrapping). Both are files I touched, so per **E7** I prettier-wrote exactly those two and re-ran. No blanket `pnpm format`. No untouched file was ever flagged. |

Semantics are unchanged in every case: `User.roles` is a non-optional `Role[]`, so the deleted
ternary was dead in both arms.

### Section B — close the org-scoping hole (steps 9–12)

| Step | File | Change |
|---|---|---|
| 9 | `src/lib/server/services/complaints/index.ts:180-182` | `listComplaintsForEmployee(employeeId: string, organizationId: string)`; `where: { employeeId, organizationId }`. `include` and `orderBy` untouched. **[T8]** |
| 10 | `src/routes/(app)/complaints/+page.server.ts:57` | Caller now passes `user.organizationId`. Prettier wrapped the ternary onto three lines. **[T15]** |
| 11 | `tests/unit/complaints-scoping.test.ts` | **New file.** Contains test **N1** only. |
| 12 | — | Mutation **M-N1** run — see below. |

**New test file mock strategy (per E2/E3):** the complaints service is **not** mocked. The file
mocks only `$lib/server/db`, `$lib/server/audit` (via a hoisted `writeAuditLogMock`, which N15 will
consume in Section D), and `$lib/server/services/notifications`. The db mock already carries
`hrComplaint.count: vi.fn()` and `beforeEach` `mockResolvedValue(0)`s it, so `paginate(url, total)`
will not receive `undefined` when N13 lands. `$lib/server/services/employee-access` is **not** yet
mocked here — nothing in Section B calls it; it is a Section C addition.

**Mock-discipline note (plan §"Mock discipline"):** N1 asserts on
`dbMock.hrComplaint.findMany.mock.calls[0][0].where` — the arguments the query was **built** with —
never on returned rows. The `project()` helper from `approval-queues.test.ts` is a returned-shape
tool and is deliberately not used here.

## Test Gate Outcomes

### Gate A (literal output)

`pnpm prisma generate && pnpm check`:
```
1787538173342 COMPLETED 984 FILES 0 ERRORS 1 WARNINGS 1 FILES_WITH_PROBLEMS
```
The 1 warning is the pre-existing a11y warning on `CalculatorWindow.svelte:82` — not mine, present
in the baseline. **0 errors** (baseline was 12, at exactly the lines Section A names).

`pnpm test`:
```
 Test Files  153 passed (153)
      Tests  1713 passed (1713)
```

`pnpm format:check`:
```
Checking formatting...
All matched files use Prettier code style!
```

**Gate A: GREEN.** Section B was not started until this was true.

### Gate B — mutation M-N1

Backup taken first: `cp src/lib/server/services/complaints/index.ts <scratchpad>/complaints-index.ts.bak`.
Restored with `cp` from that backup. **`git checkout` / `git restore` were never used.**

**M-N1 — mutated state (deleted `organizationId` from the `where` at `index.ts:182`): RED.**
```
AssertionError: expected { employeeId: 'emp1' } to deeply equal { employeeId: 'emp1', …(1) }

- Expected
+ Received

  Object {
    "employeeId": "emp1",
-   "organizationId": "org1",
  }

 ❯ tests/unit/complaints-scoping.test.ts:45:62

 Test Files  1 failed (1)
      Tests  1 failed (1)
```

**M-N1 — restored state: GREEN.**
```
 Test Files  154 passed (154)
      Tests  1714 passed (1714)
```
(153 baseline files + `complaints-scoping.test.ts`; 1713 + N1 = 1714.)

Post-restore `pnpm check`: `COMPLETED 985 FILES 0 ERRORS 1 WARNINGS`.
Post-restore `pnpm format:check`: `All matched files use Prettier code style!`

**Gate B: GREEN.** M-N1 recorded RED under mutation, GREEN restored — the test is not vacuous.

## What Was Skipped or Deferred

- Sections **C, D, E, F** — out of this run's scope by instruction. Mutations M-N2 … M-N17 (19 of
  the 20) are **not** run; only M-N1 is recorded.
- `src/routes/(app)/reports/audit-log/+page.server.ts` (T29, Section D) — **not touched**, as
  instructed.
- Gate E preconditions (`./start.sh`, `pnpm db:push`, `pnpm db:seed:e2e`, `pnpm dev`) — not run.
  Not needed for Gates A–B; the unit suite mocks Prisma.

## Plan Deviations

None material. One mechanical note:

- **Line wrapping.** Replacing `roles` with `user.roles` pushed two `if (!canAny(...)) return fail(...)`
  statements and one `listComplaintsForEmployee(...)` ternary past Prettier's print width, so
  Prettier rewrapped them onto multiple lines. This is formatting forced by the plan's own edits,
  applied via the E7 procedure (prettier-write a file **you touched**, then re-run). Within
  blast radius, no semantic change.

## Test Infra Gaps Found

None new. Recorded residuals carried forward for the EXECUTE report at the end of the program:

- **G6 (E9) — the `AND: [...]` intersection residual.** Not yet in play: T9 is a Section C step and
  `complaintWhere` is untouched in this run. The dead `filters.employeeId` field is **left alone**
  per E9 — deleting it is a scope change requiring a decision.
- N1 proves what the query **asked for**, not what Postgres **returns**. The DB is mocked
  (`all-tests.md:108`). Nothing in Sections A–B is live-verified.

## Closeout Packet

- **Selected plan:** `process/general-plans/active/hr-complaints-112_24-08-26/hr-complaints-112_PLAN_24-08-26.md`
- **Finished:** Section A (steps 1–8) VERIFIED via Gate A; Section B (steps 9–12) VERIFIED via Gate B.
- **Verified:** `pnpm check` 0 errors, `pnpm test` 154 files / 1714 tests, `pnpm format:check` 0,
  M-N1 RED-then-GREEN.
- **Still unverified:** everything from Section C onward — per-employee scoping, the 19 remaining
  mutations, the live Gate E, `pnpm lint` (not run this session; it was green at baseline and no
  lint-relevant construct was introduced).
- **Cleanup remaining:** none. Working tree holds only the intended edits; scratchpad backup can be
  discarded once Section C starts (or kept — it is the pre-Section-C state of the service file).
- **Next valid state:** `Keep in active/testing` — the plan is mid-flight, Sections C–F remain.

## Forward Preview

### Test Infra Found
`tests/unit/complaints-scoping.test.ts` now exists with the db/audit/notifications mock scaffold
already shaped for Sections C and D: hoisted `dbMock` (incl. `hrComplaint.count` +
`employee.findMany`), hoisted `writeAuditLogMock`, hoisted `notifyMock`. Section C must add
`vi.mock('$lib/server/services/employee-access', …)` with a hoisted `assertCanTouchEmployee` fn, and
must add the same mock to `tests/unit/complaints.test.ts` (T28) or its six existing tests break the
moment the service starts calling `assertCanTouchEmployee`.

### Blast Radius Changes
Files changed this run: 5 of the plan's 7 (+1 new). Untouched so far:
`src/routes/(app)/reports/audit-log/+page.server.ts`, `tests/unit/audit-log-reveal.test.ts`.

### Commands to Stay Green
```bash
pnpm check          # 0 errors
pnpm test           # 154 files / 1714 tests
pnpm format:check   # 0
```

### Dependency Changes
None. No package added, no schema touched, `prisma/schema.prisma` untouched, no `db:push` run.

---

# EXECUTE report — Section C (#112)

Scope of this run: Implementation Checklist steps 13–21 only, ending at Gate C. Sections D, E, F
not started (no T29, no N2–N17, no Gate E preconditions, no `db:push`, no seed, no dev server).
No commit made (orchestrator owns the commit).

## What Was Done

### Section C — per-employee scoping (steps 13–21)

| Step | File | Change |
|---|---|---|
| 13 | `src/lib/server/services/complaints/index.ts` | Added `import { canAny } from '$lib/rbac'` and `import { assertCanTouchEmployee } from '$lib/server/services/employee-access'`. **[T1]** |
| 14 | same file, `ComplaintFilters` | Added `employeeIds?: string[]` with a doc-comment saying `null` from `listVisibleEmployeeIds` means unrestricted so the caller omits the field. **[T2]** |
| 15 | same file, above `openComplaint` | Added exported `assertCanReachComplaint(ctx, complaintEmployeeId, actorEmployeeId)`. **Two arms**, exactly as Decision 1 specifies: `canAny(ctx.actorRoles,'MANAGE_HR')` → `assertCanTouchEmployee({id: ctx.actorId, roles: ctx.actorRoles, organizationId: ctx.organizationId}, complaintEmployeeId)`; otherwise `actorEmployeeId !== complaintEmployeeId` → `error(403,'You do not have access to this inquiry.')`. Doc-comment names #112/#228, cites `rbac.ts:29-36`, states why the `else` arm is not `assertCanTouchEmployee` (it admits `reportsToId` reports regardless of role, so a plain EMPLOYEE supervisor would reach their report's thread), and why the check lives in the service. **[T3]** |
| 16 | `openComplaint` | `await assertCanReachComplaint(ctx, employee.id, null)` placed **after** the org 404 and **before** `db.hrComplaint.create`. Comment records the ordering reason (out-of-org id stays 404, never 403) and why `null` is passed (opening is HR-only). **[T4]** |
| 16 | `postComplaintMessage` | `await assertCanReachComplaint(ctx, complaint.employeeId, actorEmployeeId)` after the 404 **and** after the 400 already-resolved check. **[T5]** |
| 16 | `resolveComplaint` | `await assertCanReachComplaint(ctx, complaint.employeeId, null)` after the 404 and **above** the `if (complaint.status === 'RESOLVED') return complaint` early return. Comment records why. **[T6]** |
| 16 | `getComplaint` | Signature is now `(id: string, ctx: AuditContext, actorEmployeeId: string \| null)`; `where` uses `ctx.organizationId`; the admission call sits after the 404 and before the return. **[T7]** |
| 17 | same file, `complaintWhere` | Kept `...(filters.employeeId && { employeeId: filters.employeeId })` **unchanged** and added a **separate** `...(filters.employeeIds && { AND: [{ employeeId: { in: filters.employeeIds } }] })`. Comment states narrow-vs-ceiling and that a scoping filter must never widen. The dead `filters.employeeId` field was **left in place** per E9. **[T9]** |
| 18 | `src/routes/(app)/complaints/+page.server.ts` | Imported `listVisibleEmployeeIds`; in the HR branch `const visibleIds = await listVisibleEmployeeIds(user)`; `const filters = { status, ...(visibleIds && { employeeIds: visibleIds }) }`, threaded into **both** `countComplaintsForOrg` and `listComplaintsForOrg` (they share the one `filters` variable); the employee-dropdown `where` gained `...(visibleIds && { id: { in: visibleIds } })`. Written with plain `visibleIds &&`, **never** `visibleIds?.length &&` — `[]` stays truthy and the filter stays emitted (fail-closed). **[T12, T13, T14]** |
| 19 | `src/routes/(app)/complaints/[id]/+page.server.ts` `load` | Reordered: `myEmployee` resolved first, then a `ctx` of `{organizationId, actorId, actorRoles}` (no `ipAddress` — `load` has no `getClientAddress` and `getComplaint` writes no audit row), then `getComplaint(params.id, ctx, myEmployee?.id ?? null)`. The redundant `isSubject`/403 block was deleted; `{ complaint, isHr, isSubject }` is still returned unchanged for `+page.svelte`. **[T20, T21]** |
| 20 | same file, `reply` | `ctx` moved above the fetch; `.catch(() => null)` **replaced** with a `try/catch` that does `if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })` and re-throws otherwise, so a 403 stays a 403. The redundant `isSubject`/403 block deleted. **[T23]** |
| — | `tests/unit/complaints.test.ts` | Added the mandatory half of **T28**: hoisted `assertCanTouchEmployeeMock` plus `vi.mock('$lib/server/services/employee-access', …)`. Without it the six existing tests 403 the moment the service starts calling it. The `writeAuditLog` mock was left as the bare `vi.fn()` it already was — the inspectable one lives in `complaints-scoping.test.ts` (E3). |

**Files changed this run: 4.** `services/complaints/index.ts`, `complaints/+page.server.ts`,
`complaints/[id]/+page.server.ts`, `tests/unit/complaints.test.ts`. No `.svelte` file touched
(E10). `reports/audit-log/+page.server.ts` untouched (T29 is Section D, per E6). No new test
written this run.

## Test Gate Outcomes

### Gate C (literal output)

`pnpm check`:
```
1787539034675 START "/home/hyuse/Desktop/VeentApps/veent_hris"
1787539034681 WARNING "src/lib/components/payroll/CalculatorWindow.svelte" 82:2 "`<div>` with a pointerdown, pointermove or pointerup handler must have an ARIA role
https://svelte.dev/e/a11y_no_static_element_interactions"
1787539034683 COMPLETED 985 FILES 0 ERRORS 1 WARNINGS 1 FILES_WITH_PROBLEMS
```
**0 errors.** The 1 warning is the pre-existing a11y warning on `CalculatorWindow.svelte:82`,
present in the baseline and not mine.

`pnpm test`:
```
 Test Files  154 passed (154)
      Tests  1714 passed (1714)
   Duration  32.05s
```
All 6 pre-existing tests in `tests/unit/complaints.test.ts` still pass, and N1 in
`tests/unit/complaints-scoping.test.ts` still passes.

`pnpm format:check`:
```
Checking formatting...
All matched files use Prettier code style!
```

**Gate C: GREEN.**

#### format:check intermediate run (E7 procedure, recorded)

The first `pnpm format:check` after the Section C edits flagged exactly one file:
```
[warn] src/lib/server/services/complaints/index.ts
[warn] Code style issues found in the above file. Run Prettier with --write to fix.
```
That is a file **I touched**, so per **E7** I ran
`pnpm prettier --write "src/lib/server/services/complaints/index.ts"` — that one file only, never a
blanket `pnpm format` — and re-ran all three gates from scratch. The prettier change was one line
join on the `error(403, …)` statement; no logic change. **No untouched file was ever flagged.**

## What Was Skipped or Deferred

- **Section D** — step 21b (`'HrComplaint'` into the audit-log `entityTypes`), tests N2–N17, N15,
  N16, and Gate D's 20 mutations. Out of this run's scope by instruction. Only M-N1 (Section B)
  is recorded to date; M-N2 … M-N17 are **not** run.
- **Gate E preconditions (step 24b)** — `./start.sh`, `pnpm db:push`, `pnpm prisma generate`,
  `pnpm db:seed:e2e`, `pnpm dev` — none run. Gates A–C need none of it; the unit suite mocks Prisma.
- **Gate E, Gate F** — not run. `pnpm lint` not run this session (Gate F item; green at baseline).
- No commit. No push. No PR.

## Plan Deviations

Three, all mechanical and inside the blast radius. Nothing was widened, nothing renamed.

1. **Two orphaned symbols removed in `[id]/+page.server.ts`.** T20 deletes `load`'s
   `error(403, …)` line and T23 deletes `reply`'s `isSubject`/403 line. That left the
   `error` import (its only use was in `load`) and `reply`'s `const isHr` (its only use was in the
   deleted line) unused, which is a `pnpm check` error. Both removed. This is cleaning up orphans my
   own changes created, not an adjacent improvement. `canAny` stays imported — `load` and `resolve`
   still use it.
2. **`reply`'s 404 copy shifted by one character.** It was `fail(404, { error: 'Inquiry not
   found.' })`, hand-written in the route; it is now `fail(404, { error: 'Inquiry not found' })`
   propagated from the service's own `error(404, 'Inquiry not found')`. That is a direct consequence
   of T23's specified replacement (the whole point is to stop the route inventing its own status and
   message), not a copy edit. No trailing period.
3. **Prettier reflow of `services/complaints/index.ts`.** Formatting forced by my own edits, fixed
   via the E7 procedure. See the intermediate run above.

Things the plan warned about and that were **not** done: the two arms were not collapsed; the
`employeeIds` allow-list was not merged onto the `employeeId` key; `visibleIds?.length` was not
used anywhere; the dead `filters.employeeId` field was not deleted (E9); no guard was added for a
CEO/SUPER_ADMIN with no Employee row (`canTouchEmployee` short-circuits at `employee-access.ts:39`
before the self lookup).

## Test Infra Gaps Found

None new. Carried forward:

- **G6 (E9) — the `AND: [...]` residual, now live in the code.** `complaintWhere` is the first use
  of `AND: [...]` in this repo (`grep -rn "AND: \[" src/` was zero hits before this edit). It
  type-checks against the real `Prisma.HrComplaintWhereInput` (`pnpm check` 0 errors), but nothing
  runs it: `filters.employeeId` still has zero callers, so the intersecting path is unreachable at
  runtime and no SQL is ever emitted for it. N17 (Section D) will prove the `where` object is
  **built** correctly, not that Postgres executes it. Accepted residual; backlog note
  `complaint-filter-intersection-sql_NOTE_24-08-26.md`.
- Section C added four object-level guards and two list filters, and **none of them is proven by a
  test yet** — N2–N14 and N17 are Section D work. `pnpm test` being green here means "nothing broke",
  not "the guards hold". The guards are currently **unproven**, which is exactly what Gate D and
  Gate E exist to fix.
- The DB is mocked throughout (`all-tests.md:108`), so nothing in Sections A–C is live-verified.

## Closeout Packet

- **Selected plan:** `process/general-plans/active/hr-complaints-112_24-08-26/hr-complaints-112_PLAN_24-08-26.md`
- **Finished:** Section C (steps 13–21) `CODE DONE` and `VERIFIED` against Gate C.
- **Verified:** `pnpm check` 0 errors, `pnpm test` 154 files / 1714 tests, `pnpm format:check` clean.
- **Still unverified:** every guard added in Section C — no mutation-checked test covers them yet.
  Also unrun: T29, tests N2–N17, Gate D's 20 mutations, `pnpm lint`, and the whole live Gate E.
- **Cleanup remaining:** none. Working tree holds exactly the 4 intended modified files.
- **Next valid state:** `Keep in active/testing` — Sections D, E, F remain.

## Forward Preview

### Test Infra Found
`tests/unit/complaints-scoping.test.ts` already has the db/audit/notifications mock scaffold
(hoisted `dbMock` with `hrComplaint.count` + `employee.findMany`, hoisted `writeAuditLogMock`,
hoisted `notifyMock`). Section D must still add
`vi.mock('$lib/server/services/employee-access', …)` with a hoisted `assertCanTouchEmployee` fn to
**that** file — N2/N3/N4/N12 drive it via `mockImplementation(() => error(403, …))`, never
`mockRejectedValue`. `tests/unit/complaints.test.ts` now has its own copy of that mock (T28 half
one), so the two files do not share it.

### Blast Radius Changes
6 of the plan's 7 files touched across Sections A–C (+1 new test file). Still untouched:
`src/routes/(app)/reports/audit-log/+page.server.ts` (T29, step 21b) and
`tests/unit/audit-log-reveal.test.ts` (N16, step 23b).

### Commands to Stay Green
```bash
pnpm check          # 0 errors
pnpm test           # 154 files / 1714 tests
pnpm format:check   # clean
```

### Dependency Changes
None. No package added, no schema touched, no `db:push` run, `prisma/schema.prisma` untouched.

---

# EXECUTE report — Section D (#112)

Scope of this run: Implementation Checklist steps 21b–24 only, ending at **Gate D**. Gate E
preconditions (`./start.sh`, `pnpm db:push`, seed, `pnpm dev`) and Gate F were **not** run, by
instruction. No commit made (orchestrator owns the commit).

## What Was Done

| Step | File | Change |
|---|---|---|
| 21b | `src/routes/(app)/reports/audit-log/+page.server.ts` | Added `'HrComplaint'` to the hand-maintained `entityTypes` array (one line, appended after `'Department'`). **[T29]** |
| 22 | `tests/unit/complaints-scoping.test.ts` | Wrote **N2–N14, N13-empty, N14-empty, N17** (N1 was already there from Section B). |
| 23 | `tests/unit/complaints-scoping.test.ts` | Wrote the route-level **N15**. T28's mock-block change to `tests/unit/complaints.test.ts` was already applied in Section C — no further edit needed there. |
| 23b | `tests/unit/audit-log-reveal.test.ts` | Wrote **N16** as one added assertion in the existing load suite (`expect(data.entityTypes).toContain('HrComplaint')`). |

**Files changed this run: 3.** `reports/audit-log/+page.server.ts`, `tests/unit/audit-log-reveal.test.ts`,
`tests/unit/complaints-scoping.test.ts`. Confirmed by `git diff --stat` after the last restore —
nothing else is modified.

### Mock strategy actually used (E2 / E3, and it held)

`$lib/server/services/complaints` is **never** mocked in `complaints-scoping.test.ts`. The file
mocks exactly four modules: `$lib/server/db`, `$lib/server/audit` (hoisted `writeAuditLogMock`,
consumed by N15), `$lib/server/services/notifications`, and
`$lib/server/services/employee-access`. The **fallback** `importOriginal` partial-mock
(`payroll-read-scoping.test.ts:47-48`) was **not** needed and was not used.

One detail the plan did not name: the employee-access mock must export **both**
`assertCanTouchEmployee` (the service calls it) **and** `listVisibleEmployeeIds` (the list route
calls it). `vi.mock` replaces the whole module, so exporting only the first leaves the route with
`listVisibleEmployeeIds is not a function`.

N13/N13-empty/N14/N14-empty assert on `dbMock.hrComplaint.count.mock.calls[0][0].where`,
`dbMock.hrComplaint.findMany.mock.calls[0][0].where` and
`dbMock.employee.findMany.mock.calls[0][0].where` — the db mock, never a service mock, exactly as
E2 requires. `hrComplaint.count` is `mockResolvedValue(0)`-ed in `beforeEach`, so
`paginate(url, total)` never receives `undefined`.

**Mock-discipline decision recorded (plan §"Mock discipline"):** every where-clause test asserts on
`mock.calls[0][0]` — the arguments the query was **built** with — never on returned rows. The
`project()` helper from `approval-queues.test.ts` is a returned-shape tool; none of these tests
needs it and reaching for it here would be cargo-culting.

Templates used, as the plan specified: `requests-read-scoping.test.ts:45` for the `load`-invoking
cases (N6, N10, N11, N12, N13, N13-empty, N14, N14-empty), and `employee-reveal-access.test.ts` for
the action cases (N2–N5, N7, N8, N15) — including its rule that `error()` is thrown from
`mockImplementation`, never handed to `mockRejectedValue`.

## Test Gate Outcomes

### Gate D — all 20 mutations, one at a time

Method: the five mutation targets were backed up with `cp` to the scratchpad
(`…/scratchpad/bak/`) before the first mutation. Each mutation restored **every** target from those
backups first, applied exactly one textual change (with an assertion that the pattern occurred
exactly once), ran the owning test file, then restored from the backups again.
**`git checkout` / `git restore` were never used at any point.**

| id | Mutation applied | Test | Result |
|---|---|---|---|
| M-N1 | `index.ts` — drop `organizationId` from `listComplaintsForEmployee`'s `where` | N1 | **RED** |
| M-N2 | test mock — `assertCanTouchEmployee` throws 403 for every actor incl. HR_ADMIN | N2 | **RED** |
| M-N3 | list route — `open` gate becomes `canAny(user.roles, 'ADMINISTER_HR_ORGWIDE')`, refusing MANAGER | N3 | **RED** |
| M-N4 | `index.ts` — delete `assertCanReachComplaint` from `openComplaint` (T4) | N4 | **RED** |
| M-N5 | `index.ts` — move the T4 call to **after** `db.hrComplaint.create` | N5 | **RED** |
| M-N6 | `index.ts` — delete `assertCanReachComplaint` from `getComplaint` (T7) | N6 | **RED** |
| M-N7 | `[id]` route — restore the swallowing `.catch(() => null)` + `fail(404, …)` in `reply` | N7 | **RED** |
| M-N8 | `index.ts` — delete `assertCanReachComplaint` from `resolveComplaint` (T6) | N8 | **RED** |
| M-N9 | `index.ts` — move the T6 call **below** `if (complaint.status === 'RESOLVED') return complaint` | N9 | **RED** |
| M-N10 | `index.ts` — the `else` arm always `error(403)` | N10 | **RED** |
| M-N11 | `index.ts` — the `else` arm becomes `if (actorEmployeeId == null) error(403, …)` | N11 | **RED** |
| M-N12 | `index.ts` — collapse `assertCanReachComplaint` to a single `assertCanTouchEmployee`, no `MANAGE_HR` arm | N12 | **RED** |
| M-N13a | list route — `const filters = { status }` (drop the allow-list spread, T13) | N13 | **RED** |
| M-N13b | list route — `countComplaintsForOrg(user.organizationId)` (drop `filters` from the counter half only) | N13 | **RED** |
| M-N13c | list route — `...(visibleIds?.length && { employeeIds: visibleIds })` | N13-empty | **RED** |
| M-N14a | list route — remove `...(visibleIds && { id: { in: visibleIds } })` from the dropdown `where` (T14) | N14 | **RED** |
| M-N14b | list route — `...(visibleIds?.length && { id: { in: visibleIds } })` | N14-empty | **RED** |
| M-N15 | list route — `open` ctx narrowed to `actorRoles: [user.roles[0]]` | N15 | **RED** (paired — see below) |
| M-N16 | `reports/audit-log/+page.server.ts` — remove `'HrComplaint'` from `entityTypes` (T29) | N16 | **RED** |
| M-N17 | `index.ts` — write the allow-list straight into `employeeId`, dropping the `AND` wrapper (the original T9 shape) | N17 | **RED** |

**20 / 20 RED. Zero GREEN mutations. No test had to be rewritten.**

#### M-N15 — both halves of the pair, recorded

Mutation: the list route's `open` ctx literal, `actorRoles: user.roles` → `actorRoles: [user.roles[0]]`.
The field is **narrowed, not deleted** — that is the point.

Half 1, the test — **RED**:
```
 × tests/unit/complaints-scoping.test.ts > complaints audit actorRoles carry-through (#112) >
   N15 — carries the actor’s full role set into every audit write from the route ctx
```

Half 2, the typecheck under the same mutation — **GREEN**:
```
1787539836777 COMPLETED 985 FILES 0 ERRORS 1 WARNINGS 1 FILES_WITH_PROBLEMS
```
**0 errors.** This is the whole point of the pairing: `pnpm check` proves `actorRoles` is
**present**, never that it is **complete**. A narrowed role set type-checks perfectly clean, and
only N15's two-role fixture catches it.

#### One mutation-harness correction (not a code or test change)

M-N15's first scripted attempt reported `APPLY-FAILED — pattern occurs 0x`: the driver's search
string carried four tabs of indentation and the list route's `open` ctx literal is indented with
three. That is a defect in my mutation script, not in the source or the test. Corrected and re-run
by hand; the result above is the corrected run. Recording it because a silently-skipped mutation is
exactly the failure mode Gate D exists to prevent.

### Post-restore gates (literal output)

`git diff --stat` — only the three intended files:
```
 src/routes/(app)/reports/audit-log/+page.server.ts |   3 +-
 tests/unit/audit-log-reveal.test.ts                |  11 +
 tests/unit/complaints-scoping.test.ts              | 298 ++++++++++++++++++++-
 3 files changed, 310 insertions(+), 2 deletions(-)
```

`pnpm check`:
```
1787539891142 WARNING "src/lib/components/payroll/CalculatorWindow.svelte" 82:2 "`<div>` with a pointerdown, pointermove or pointerup handler must have an ARIA role"
1787539891144 COMPLETED 985 FILES 0 ERRORS 1 WARNINGS 1 FILES_WITH_PROBLEMS
```
**0 errors.** The single warning is the pre-existing a11y warning on `CalculatorWindow.svelte:82`,
present in the baseline.

`pnpm test`:
```
 Test Files  154 passed (154)
      Tests  1732 passed (1732)
   Duration  32.39s
```
1714 before this run + 17 new in `complaints-scoping.test.ts` + 1 new in `audit-log-reveal.test.ts`
= 1732. File count stays 154 because no new test **file** was created this run.

`pnpm format:check`:
```
Checking formatting...
All matched files use Prettier code style!
```

**Gate D: GREEN.**

#### format:check intermediate run (E7 procedure, recorded)

The first `pnpm format:check` after writing the tests flagged exactly one file:
```
[warn] tests/unit/complaints-scoping.test.ts
```
That is a file **I touched**, so per **E7** I ran
`pnpm prettier --write tests/unit/complaints-scoping.test.ts` — that one file only, never a blanket
`pnpm format` — refreshed its scratchpad backup, and re-ran. Prettier's only change was joining the
`const { … } = await import(…)` destructures onto fewer lines. **No untouched file was ever
flagged.**

## What Was Skipped or Deferred

- **Gate E preconditions (step 24b)** — `./start.sh`, `pnpm db:push`, `pnpm prisma generate`,
  `pnpm db:seed:e2e`, `pnpm dev`: none run, by instruction. Gate D needs none of it; the unit suite
  mocks Prisma.
- **Gate E** — the live hybrid check for SPEC criterion 3. Not run. **This is still mandatory** and
  may not be downgraded to "the unit tests cover it" (plan hard rule; SPEC criterion 3 is tagged
  Hybrid on purpose).
- **Gate F** — not run as a gate, though three of its four commands are green above.
  **`pnpm lint` was not run this session** (green at baseline; no lint-relevant construct
  introduced, but that is an assumption, not evidence).
- No commit, no push, no PR.

## Plan Deviations

None material. Two mechanical notes:

1. **The employee-access mock needed a second export.** The plan's §5 mock list names
   `$lib/server/services/employee-access` but the touchpoints only ever discuss
   `assertCanTouchEmployee`. Because `vi.mock` replaces the whole module and the list route imports
   `listVisibleEmployeeIds` from it, the mock factory has to export both. Inside the blast radius,
   no design change.
2. **N14 covers both of its halves in one test.** The plan describes N14 as asserting the scoped
   case *and* the `null` case; written as a single `it` with two sequential `load` calls, reading
   `employee.findMany.mock.calls[0]` and `[1]`. Keeping it as one test is what makes M-N14a redden
   "N14" rather than an unnamed sibling.

Things the plan warned about and that were **not** done: no guard was weakened to make a test pass;
no source file outside the plan's 7 was touched; the dead `filters.employeeId` field was not deleted
(E9); the cherry-picked Svelte UI was not touched (E10); the stale comment at
`prisma/seed-core.ts:676` was left alone (E10).

## Test Infra Gaps Found

None new. Carried forward, unchanged:

- **G6 (E9) — the `AND: [...]` residual.** N17 now proves the `where` object is **built** with both
  predicates intersecting. It does **not** prove Postgres executes it: `complaintWhere` is the first
  use of `AND: [...]` in this repo, `filters.employeeId` still has zero callers, so the intersecting
  path is unreachable at runtime and no SQL is ever emitted for it. Type-verified, object-verified,
  never SQL-verified. Accepted residual — backlog note
  `complaint-filter-intersection-sql_NOTE_24-08-26.md`. The dead `filters.employeeId` field is
  **left in place**; deleting it is a scope change needing its own decision.
- **The DB is mocked throughout** (`all-tests.md:108`). Every one of the 19 new tests proves what a
  query **asked for**, never what Postgres **returned**. Nothing in Sections A–D is live-verified.
  Gate E is the only thing that closes this, and it has not run.
- **N16 proves `'HrComplaint'` is in the dropdown list**, not that the resulting filtered query
  returns complaint audit rows — that `load` is db-mocked too.
- **N4/N6/N7/N8 prove the status code** an action or `load` returns; they do not prove the `[id]`
  page renders a readable 403 rather than a blank one.
- **No e2e spec** for the complaints surface (backlog note `complaints-e2e-spec_NOTE_24-08-26.md`);
  the **branch-manager arm** of `canTouchEmployee` is not exercised here (stays pinned by
  `employee-access.test.ts`); `writeAuditLog`/`notify` remain outside the `$transaction` (SPEC
  out-of-scope).

## Closeout Packet

- **Selected plan:** `process/general-plans/active/hr-complaints-112_24-08-26/hr-complaints-112_PLAN_24-08-26.md`
- **Finished:** Section D (steps 21b–24) `CODE DONE` and `VERIFIED` against Gate D — all 20
  mutations run one at a time and every one recorded RED, M-N15 with both halves of its pair.
- **Verified:** `pnpm check` 0 errors; `pnpm test` 154 files / 1732 tests; `pnpm format:check`
  clean; 20/20 mutations RED.
- **Still unverified:** the live path. **Gate E has not run** — no container, no `db:push`, no seed,
  no dev server. `pnpm lint` also unrun this session. Until Gate E passes, the guards are proven
  only against a mocked Prisma, which is precisely the shape of green suite this repo has shipped a
  live-broken guard under before.
- **Cleanup remaining:** none in the working tree. Scratchpad holds the five pre-mutation backups
  and `mutate.py`; both are disposable.
- **Next valid state:** `Keep in active/testing` — Sections E and F remain.

## Forward Preview

### Test Infra Found
`tests/unit/complaints-scoping.test.ts` is complete at 18 tests (N1–N15, N17 plus the two `-empty`
cases) and needs no further scaffold. Its employee-access mock exports **both**
`assertCanTouchEmployee` and `listVisibleEmployeeIds` — a future test added there must keep both.
`tests/unit/audit-log-reveal.test.ts` is at 19 tests. The mutation driver
(`…/scratchpad/mutate.py`) plus the five `bak/` copies still exist if any mutation needs re-running.

### Blast Radius Changes
All 7 planned files plus the 1 new test file are now touched across Sections A–D. Nothing outside
the plan's blast radius was modified in this run.

### Commands to Stay Green
```bash
pnpm check          # 0 errors
pnpm test           # 154 files / 1732 tests
pnpm format:check   # clean
```

### Dependency Changes
None. No package added, no schema touched, no `db:push` run, `prisma/schema.prisma` untouched.

---

# EXECUTE — Section G: Inquiries sidebar count badge (scope addition, 24-08-26)

**Status:** COMPLETE_WITH_GAPS — all four gates green, 6/6 mutations RED; the badge *rendering* has
no automated test (no component harness exists for `+layout.svelte`).

## What Was Done

A **user-requested scope addition** after Gate E passed live. The SPEC listed "an unread-count badge
on the Inquiries nav tab" as **Out Of Scope**; the user then asked for it directly. Recorded in the
plan as `## ADDENDUM — Section G` (touchpoints T31–T33, tests N18–N22) rather than folded into the
original sections, so the record stays honest about when the requirement arrived.

### Files changed (4)

| File | Change |
|---|---|
| `src/lib/server/services/complaints/index.ts` | **T31** — new export `countWaitingInquiries`; import block extended with `listVisibleEmployeeIds` and the `EmployeeAccessActor` type. |
| `src/routes/(app)/+layout.server.ts` | **T32** — the call added to the existing `Promise.all` (position 3, not serialised after it) and returned as `waitingInquiries`. |
| `src/routes/(app)/+layout.svelte` | **T33** — `badge: data.waitingInquiries` on the Inquiries nav entry; label wrapped in `<span class="flex-1">` and a badge slot added in the FLAT item branch. The collapsible branch was **not** touched. |
| `tests/unit/complaints-scoping.test.ts` | **N18–N22** plus an `actor()` factory and `countWaitingInquiries` added to the existing `await import(...)` destructure. The complaints service stays unmocked, per the file's load-bearing G1 rule. |

### The count function's final shape

```ts
export async function countWaitingInquiries(actor: EmployeeAccessActor): Promise<number> {
	const self = await db.employee.findFirst({
		where: { userId: actor.id, organizationId: actor.organizationId },
		select: { id: true }
	})

	let total = 0
	if (canAny(actor.roles, 'MANAGE_HR')) {
		const visibleIds = await listVisibleEmployeeIds(actor)
		total += await db.hrComplaint.count({
			where: {
				organizationId: actor.organizationId,
				status: 'RESPONDED',
				...(visibleIds && { employeeId: { in: visibleIds } })
			}
		})
	}
	if (self) {
		total += await db.hrComplaint.count({
			where: { organizationId: actor.organizationId, status: 'OPEN', employeeId: self.id }
		})
	}
	return total
}
```

Design notes, all carried in the doc-comment on the function:

- **No new state.** The status already says whose turn it is — `RESPONDED` is owed by HR, `OPEN` is
  owed by the subject.
- **The two arms cannot double-count.** A row holds exactly one status, and the arms match on
  different statuses. They are summed because one actor can be owed on both at once (a manager who
  is also the subject of a thread) — N19 pins the sum with `2 + 3 = 5`.
- **Scoped through the same helper as the list** (`listVisibleEmployeeIds`), so the badge can never
  promise a thread the page then 403s. `null` unrestricted, `[]` fail-closed (`in: []` emitted, not
  dropped) — never `?.length &&`. N20 pins it.
- **The subject arm runs for everyone**, so a non-`MANAGE_HR` actor issues that one count and
  nothing org-wide. N21 pins it (one count call, `listVisibleEmployeeIds` never called).
- **`findFirst` with `{ userId, organizationId }`**, matching the complaints route's own
  `myEmployee` lookup — `Employee.userId` is globally unique, not per-org, so the org predicate is
  load-bearing.

### The badge markup

```svelte
<span class="flex-1">{item.label}</span>
{#if item.badge}
	<span
		class="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-primary-foreground"
		aria-label="{item.badge} waiting on you"
	>
		{item.badge}
	</span>
{/if}
```

Numeric pill (not a red dot — the dot means "hidden inside a collapsed group", and a flat item
hides nothing), `bg-primary` (red is reserved for the collapsed-group alert), existing child-badge
classes verbatim plus `shrink-0 tabular-nums`, rendered only when the count is above zero.

**`aria-label` placement, verified rather than assumed.** The pill sits inside an `<a>`, whose
accessible name is computed from content — and the accname traversal uses a descendant's own
`aria-label`. So the link announces "Inquiries 3 waiting on you" instead of "Inquiries 3". No
`role` attribute was needed and none was added.

**The label carries no noun — deliberately.** A first pass wrote
`aria-label="{item.badge} inquiries waiting on you"`, which was wrong twice: it announced
"1 **inquiries** waiting on you" at a count of one, and it hard-coded "inquiries" into a badge slot
that is **generic** — the slot lives in the flat-item branch, so any future flat nav item that gets
a `badge` would inherit the wrong noun. Dropping the noun fixes both at once, because the link's own
accessible name already supplies the subject: "Inquiries 1 waiting on you", "Inquiries 3 waiting on
you", and correct for whatever item is badged next. No pluralisation helper and no extra field on
the nav entry — the fix is the absence of a word.

**The `flex-1` label wrap — claim verified, not assumed.** Container is
`flex items-center gap-3`; the label was previously a bare text node, i.e. an anonymous flex item
at `flex: 0 1 auto`. Wrapping it as `flex-1` (`flex: 1 1 0%`) makes it stretch to the remaining
width, but text is left-aligned by default in an `<a>`, so the glyphs start at the same x and the
badge-less items are pixel-identical. The only theoretical risk of `flex-basis: 0` is eager
shrinking — checked against the real geometry: the sidebar is `w-60` (240px, `+layout.svelte:395`)
and the longest flat label is "Recruitment"; every flat label fits with room to spare. Verified
further by `pnpm check` (0 errors) and the full suite staying green.

### Type note (no plan deviation, worth recording)

`badge` was added to **one** entry in the 20-element `navItems` array literal. TypeScript normalises
array-literal object unions by making the missing property optional, so `item.badge` type-checks on
the other 19 entries with **no** `badge: 0` filler needed — confirmed by `pnpm check` reporting 0
errors. The collapsible `requestsChildren` array still carries `badge` on every entry; that
precedent was deliberately not copied here.

## Test Gate Outcomes — Section G

Five new tests (N18–N22). `pnpm vitest run tests/unit/complaints-scoping.test.ts` → **23 passed**
(18 pre-existing + 5 new).

### Mutations — all run, one at a time, all RED

Backups taken with `cp` to the scratchpad and restored with `cp` after every run. **`git checkout`
/ `git restore` were never used** — this repo has lost uncommitted work that way.

| Mutation | Change made to `services/complaints/index.ts` | Literal result |
|---|---|---|
| **M-N18** | Deleted `...(visibleIds && { employeeId: { in: visibleIds } })` from the HR arm's `where`. | **RED** — `Tests 2 failed \| 21 passed (23)`; `× N18 — the HR arm counts only RESPONDED, behind the visible-employee allow-list`, `× N20 — a MANAGE_HR actor who sees nobody stays fail-closed`. |
| **M-N19** | Subject arm `status: 'OPEN'` → `status: 'RESPONDED'`. | **RED** — `Tests 2 failed \| 21 passed (23)`; `× N19 — the subject arm counts the actor's own OPEN threads, and the two arms sum`, `× N21 — a non-MANAGE_HR actor runs the subject arm only`. |
| **M-N19b** | Subject arm `total += await …` → `total = await …`. | **RED** — `Tests 1 failed \| 22 passed (23)`; `× N19 — the subject arm counts the actor's own OPEN threads, and the two arms sum`. |
| **M-N20** | Allow-list guard `visibleIds &&` → `visibleIds?.length &&`. | **RED** — `Tests 1 failed \| 22 passed (23)`; `× N20 — a MANAGE_HR actor who sees nobody stays fail-closed`. |
| **M-N21** | `if (canAny(actor.roles, 'MANAGE_HR'))` → `if (true)` — the HR arm runs for everyone. | **RED** — `Tests 2 failed \| 21 passed (23)`; `× N21 — a non-MANAGE_HR actor runs the subject arm only`, `× N22 — an actor with no employee row counts no subject arm`. |
| **M-N22** | Deleted the `if (self)` guard; subject arm runs unconditionally with `employeeId: self?.id`. | **RED** — `Tests 1 failed \| 22 passed (23)`; `× N22 — an actor with no employee row counts no subject arm`. |

**6/6 RED. No mutation stayed green**, so no test in this section is vacuous. Restoration confirmed
by `git diff --stat` showing exactly the four intended files after the last restore.

The three mutations that turned **two** tests red each (M-N18, M-N19, M-N21) are the useful signal
that the arms are genuinely coupled: dropping the allow-list also breaks the `[]` fail-closed case,
and running the HR arm unconditionally also breaks the no-employee-row case.

### Four gates

| Gate | Command | Result |
|---|---|---|
| Typecheck | `pnpm check` | **0 errors**, 1 warning, 985 files. The one warning is pre-existing and untouched: `src/lib/components/payroll/CalculatorWindow.svelte:82` — `<div>` with a pointerdown handler must have an ARIA role. |
| Tests | `pnpm test` | **154 files / 1737 tests, all passed** (37.96s). Was 154 / 1732 — +5, exactly N18–N22. |
| Lint | `pnpm lint` | **0 errors**, 1 warning — the same pre-existing `CalculatorWindow.svelte:82` a11y warning. |
| Format | `pnpm format:check` | **Clean** after prettier-write. First run flagged two files, **both of them files I touched** — `src/routes/(app)/+layout.server.ts` and `tests/unit/complaints-scoping.test.ts`. Ran `pnpm prettier --write` on exactly those two paths (never a blanket `pnpm format`) and re-ran: *"All matched files use Prettier code style!"*. `pnpm check` and the scoping suite were re-run after the reformat and stayed green. |

## Plan Deviations — Section G

**None.** Every item of the requested scope addition was implemented as specified: numeric pill not
a dot, `bg-primary` not red, existing child-badge classes verbatim plus `shrink-0` and
`tabular-nums`, `aria-label`, `<span class="flex-1">` label wrap with the inertness claim verified
rather than assumed, render only above zero, count scoped through `listVisibleEmployeeIds` with the
`[]` case fail-closed, both arms summed, service function taking the `EmployeeAccessActor` shape,
added to the existing `Promise.all`, badge slot in the FLAT branch only, and all five named tests
with mutations run and recorded.

Two things worth flagging as *records*, not deviations:

1. The SPEC's "Out Of Scope" list and the plan's Non-Goals line still say "unread badge". They were
   deliberately **left as written** and the change is recorded in `## ADDENDUM — Section G`, so the
   history shows the requirement arrived after Gate E rather than pretending it was always planned.
2. `aria-label` on a bare `<span>` is normally ignored (generic role has no accessible name). It
   works here **only** because the pill is inside an `<a>`, whose name is computed from content and
   whose accname traversal reads descendant `aria-label`s. Anyone moving this pill outside a
   name-from-content ancestor must switch to `sr-only` text or an explicit role.

## Test Infra Gaps Found — Section G

- **The badge rendering is not automated.** N18–N22 prove the **number**; the `{#if item.badge}`
  block, the classes, and the `aria-label` are eyeball-verified only. There is no component-test
  harness for `+layout.svelte` in this repo, and `grep -rn "Inquiries\|complaints" tests/e2e/`
  returns **zero hits**, so no e2e spec covers the nav item either. Recorded as the Section G known
  gap in the plan. Not a blocker; it is the same class of gap the whole sidebar already carries.
- **The DB is still mocked.** Like every other test in this file, N18–N22 prove what the count
  queries **asked for**, never what Postgres **returned** (`all-tests.md:108`). No live check was
  run for the badge — the container is down and the user runs the dev server themselves.
- **No e2e name collision introduced**, checked rather than assumed: with a non-zero count the
  Inquiries link's accessible name becomes `"Inquiries 3 inquiries waiting on you"`, but no e2e
  spec asserts on that link at all.

## Closeout Packet — Section G

- **Selected plan:** `process/general-plans/active/hr-complaints-112_24-08-26/hr-complaints-112_PLAN_24-08-26.md` (now carrying `## ADDENDUM — Section G`)
- **Finished:** T31, T32, T33 and tests N18–N22, all four gates green, 6/6 mutations RED.
- **Verified:** `pnpm check` 0 errors; `pnpm test` 154 files / 1737 tests; `pnpm lint` 0 errors;
  `pnpm format:check` clean; every mutation run and recorded.
- **Still unverified:** the badge in a browser — no dev server was started (the user runs it) and
  the Postgres container stays down. Gate E for Sections A–F already passed live and is unaffected;
  nothing in Section G changes an admission guard, only a read count.
- **Not committed** — the orchestrator commits.
- **Next valid state:** `Keep in active/testing` — the pill wants one eyeball pass in the running
  app, then this plan is ready for UPDATE PROCESS archival.

## Forward Preview — Section G

### Test Infra Found
`tests/unit/complaints-scoping.test.ts` is now 23 tests. Its `beforeEach` already resolves
`dbMock.hrComplaint.count` to `0` and routes `dbMock.employee.findFirst` on `where.userId` to the
mutable `selfEmployee` — both are what the count tests lean on, so a future count test needs no new
scaffold. The employee-access mock must keep exporting **both** `assertCanTouchEmployee` and
`listVisibleEmployeeIds`. Pre-mutation backup lives at
`…/scratchpad/bak/complaints-index.ts`.

### Blast Radius Changes
Two files entered the blast radius that the original plan explicitly listed under **Not touched**:
`src/routes/(app)/+layout.svelte` and `src/routes/(app)/+layout.server.ts`. That is the scope
addition, recorded in the addendum. The plan's "Nav array … not modified" bullet under Blast Radius
is now stale for the Inquiries entry — its conclusion still holds, since no e2e spec asserts on
that link.

### Commands to Stay Green
```bash
pnpm check          # 0 errors
pnpm test           # 154 files / 1737 tests
pnpm lint           # 0 errors
pnpm format:check   # clean
```

### Dependency Changes
None. No package added, no schema touched, no migration, no `db:push`. `prisma/schema.prisma`
untouched.
