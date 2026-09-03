---
name: plan:hr-complaints-112
description: "HR complaints/inquiries (#112) — make the cherry-picked code compile, add per-employee scoping on four surfaces, close the org-scoping hole in listComplaintsForEmployee, pass actorRoles, and cover every guard with a mutation-checked test"
date: 24-08-26
feature: hr-complaints-112
complexity: complex (single plan, single PR)
issue: "#112"
branch: feat/hr-complaints-112
---

# PLAN — HR Complaints / Inquiries (#112)

**Date**: 24-08-26
**Status**: PLANNED (not started) — supplement P1-P7 applied 24-08-26 after VALIDATE returned BLOCKED; awaiting VALIDATE re-run from V1
**Complexity**: COMPLEX (single plan, single PR)
**Issue**: #112
**Branch**: `feat/hr-complaints-112`
**SPEC**: `process/general-plans/active/hr-complaints-112_24-08-26/hr-complaints-112_SPEC_24-08-26.md`
**Context loaded**: routed via `process/context/all-context.md` → `process/context/tests/all-tests.md`, `process/context/auth/all-auth.md`, `process/context/database/all-database.md`

**TL;DR** — Fix-forward on cherry-pick `0223acf`. Edits across four source files (one a single line, one prettier-only) plus three
test files. Kill the 12 `pnpm check` errors by deleting a dead `user.role` fallback and adding
`actorRoles`; add per-employee scoping to the complaints **service** (object admission) and the
**route** (list filtering), using the existing `assertCanTouchEmployee` / `listVisibleEmployeeIds`
helpers; add `organizationId` to `listComplaintsForEmployee`; register `HrComplaint` in the
audit-log report's hand-maintained filter list; then prove all of it with 19 new
tests, each with a named mutation that must turn it red. No UI logic changes, no schema changes.

---

## Overview

The cherry-picked commit `0223acf` (from closed PR #161) ships a working two-way HR inquiry thread
but has three defects and does not type-check:

1. It does not compile — 12 `pnpm check` errors (dead `user.role` reads, missing `actorRoles`).
2. Access is gated on `MANAGE_HR` alone, which **includes MANAGER**. `src/lib/rbac.ts:26-36` says
   in so many words: never use `MANAGE_HR` to decide "may reach any employee record". Today a
   MANAGER can open, read, reply to, and resolve an inquiry about **any** employee in the org.
3. `listComplaintsForEmployee` filters on `employeeId` alone — no `organizationId` predicate.

This plan closes all three and adds the guard tests that do not exist yet.

## Goals

- `pnpm check` reaches **0 errors**.
- MANAGER reach is limited to self + reports + branches they manage, on all four surfaces.
- Every complaints query carries an organization predicate.
- Every audit write carries `actorRoles`.
- Every guard has a test, and every test has a named mutation that turns it red.

## Non-Goals (from SPEC "Out Of Scope" — do not touch)

Attachments; employee-initiated complaints; unread badge; SLA/escalation; email; new categories;
adding an `organization` relation to `HrComplaint`; moving `writeAuditLog`/`notify` inside the
`$transaction`. Do not "improve" the cherry-picked Svelte UI. Do not refactor adjacent code.

---

## Decision 1 — ROUTE or SERVICE? (required by the brief)

**Object-level admission goes in the SERVICE. List filtering stays in the ROUTE.**

That is not a compromise — it is the split this repo already uses everywhere:

| Concern | Where it lives today | Evidence |
|---|---|---|
| "may this actor touch this one record" | service | `overridePayrollEntry` — `payroll/index.ts:748-762`, comment: *"In the service, not the action, because it is reachable from the run page and any future API twin alike — the same rule #243 settled for the pay writers."* Also `loans.ts:38-48`, `assertNotSelf` (`employee-access.ts:126-134`). |
| "which rows may this actor see in a list" | route computes ids → service filters | `employees/+page.server.ts:35`, `leave/+page.server.ts:35`, `payroll/calculator/+page.server.ts:37`, `api/v1/requests/+server.ts:28`. In every case the ROUTE calls `listVisibleEmployeeIds` and threads the result into the service as a filter. |

There is **no** `/api/v1/complaints` twin — confirmed by listing `src/routes/api/v1/`
(benefits, dashboard, _dev, employees, leave, notifications, payroll, performance, recruitment,
reports, requests, session, settings, timesheets). So the "one check covers both twins" argument is
about the *future* twin, not a present one. Two concrete present-tense reasons still make SERVICE
the right home:

- `resolveComplaint` currently never loads the complaint in the route. A route-level check would
  need a **duplicate** `db.hrComplaint.findFirst` just to learn `employeeId`. The service already
  has the row in hand.
- `getComplaint` is called from **two** places in the `[id]` route (`load:17` and `reply:41`). One
  service-level check covers both; a route-level check must be written twice and can drift.

`AuditContext` already carries exactly the three fields `EmployeeAccessActor` needs
(`actorId`/`id`, `actorRoles`/`roles`, `organizationId`) — so the service can construct the actor
with no new parameter, precisely as `loans.ts:44-46` does.

### The admission rule (one shared helper)

```
assertCanReachComplaint(ctx, complaintEmployeeId, actorEmployeeId):
  if canAny(ctx.actorRoles, 'MANAGE_HR')   -> await assertCanTouchEmployee({id: ctx.actorId, roles: ctx.actorRoles, organizationId: ctx.organizationId}, complaintEmployeeId)
  else                                      -> if actorEmployeeId !== complaintEmployeeId -> error(403, 'You do not have access to this inquiry.')
```

Two arms, not one, on purpose. Collapsing to `assertCanTouchEmployee` alone would **widen** access:
`canTouchEmployee` admits an actor's reports via `listReportIdsFor`, which matches on
`Employee.reportsToId` with no regard for role. A plain EMPLOYEE who happens to be someone's
`reportsToId` would then see their report's inquiry — SPEC user story 9 forbids exactly that. The
`else` arm keeps a non-`MANAGE_HR` actor pinned to their own record and nothing else.

`ADMINISTER_HR_ORGWIDE` holders (HR_ADMIN / SUPER_ADMIN / CEO) short-circuit to `true` inside
`canTouchEmployee`, so they keep org-wide reach for free. A MANAGER who *is* the subject passes via
the self clause. Both are intended.

## Decision 2 — SPEC acceptance criterion 3 carries two `strategy:` tags

SPEC criterion 3 (`hr-complaints-112_SPEC:144-156`) declares both `Fully-Automated` and `Hybrid`.

**Resolution: `Hybrid`.** Reason: `process/context/tests/all-tests.md:108` states plainly *"Unit
tests mock the DB, so they cannot prove a query-level or tenant-scoping hole"*, and the same doc
lists five occasions where a green suite coexisted with a live defect — including #283, a scoping
guard exactly like this one. Criterion 3 is the negative control on a privileged object-level
guard, which `all-tests.md:71` says must be *"verified live, with the negative case proven too"*.
The four unit/route tests still run and are still required; `Hybrid` means they are the automated
half of a gate whose second half is a live check.

**The exact live check** (precondition: dev server on the seeded `veent_hris` DB):

- Actor: `manager@veent.ph` (Maria Manager, `EMP-003`) via `POST /api/v1/_dev/login-as`.
  Her only report in the seed is Elena Employee `EMP-004` (`prisma/seed-core.ts:781-798`); Veent is
  not a food-service org so she manages no branches. Every other Veent employee is out of scope.
- Target: the employee record behind `verifier@veent.ph` — out of Maria's scope by construction.
- Steps: log in as `admin@veent.ph`, open an inquiry against the verifier's employee with the
  marker subject `SCOPE-PROBE-112`; read back its id with
  `docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c "select id, employee_id, status from hr_complaints where subject = 'SCOPE-PROBE-112';"`;
  log in as `manager@veent.ph`; `GET /complaints/<id>` must render 403, and a direct
  `POST /complaints/<id>?/reply` and `POST /complaints/<id>?/resolve` must each return 403.
  Then assert the positive control on the same session: Maria opens `SCOPE-PROBE-112-OK` against
  Elena and it succeeds, and the row appears in `hr_complaints` with Maria's `opened_by_id`.
- Full click-by-click version is in **Manual Verification Script** below.

---

## Touchpoints

Every file, every function, every change. Nothing else is touched.

### 1. `src/lib/server/services/complaints/index.ts`

| # | Location | Change |
|---|---|---|
| T1 | imports (top of file, after line 6) | Add `import { canAny } from '$lib/rbac'` and `import { assertCanTouchEmployee } from '$lib/server/services/employee-access'`. |
| T2 | `ComplaintFilters` interface, lines 37-40 | Add optional `employeeIds?: string[]`. This is the list allow-list; `null` from `listVisibleEmployeeIds` means "unrestricted" and the route simply omits the field. |
| T3 | new exported function, place directly above `openComplaint` (after line 41) | Add `assertCanReachComplaint(ctx: AuditContext, complaintEmployeeId: string, actorEmployeeId: string \| null): Promise<void>` implementing the two-arm rule from Decision 1. Doc-comment must name #228, `rbac.ts:29-36`, and why the `else` arm is not `assertCanTouchEmployee`. |
| T4 | `openComplaint`, between the 404 on line 48 and the `create` on line 50 | `await assertCanReachComplaint(ctx, employee.id, null)`. Order matters: the org 404 first (an out-of-org id must stay 404, not 403 — SPEC criterion 5 and the existing passing test at `complaints.test.ts:74-80`), then the scope 403. Pass `null` for `actorEmployeeId`: opening is HR-only, the `else` arm must never admit here. |
| T5 | `postComplaintMessage`, after the RESOLVED check on line 95-96 | `await assertCanReachComplaint(ctx, complaint.employeeId, actorEmployeeId)`. After the 404 and after the 400-resolved check so a resolved thread still reports 400 to someone who may see it, and an out-of-scope actor gets 403 either way. |
| T6 | `resolveComplaint`, after the 404 on line 135 (before the early-return on line 136) | `await assertCanReachComplaint(ctx, complaint.employeeId, null)`. Before the `status === 'RESOLVED'` early return — otherwise an out-of-scope MANAGER re-resolving an already-resolved thread gets a silent 200 and a confirmation of its existence. |
| T7 | `getComplaint`, lines 193-215 | Change signature from `getComplaint(id: string, organizationId: string)` to `getComplaint(id: string, ctx: AuditContext, actorEmployeeId: string \| null)`. Use `ctx.organizationId` in the `where`. After the 404 on line 213, `await assertCanReachComplaint(ctx, complaint.employeeId, actorEmployeeId)`, then return. |
| T8 | `listComplaintsForEmployee`, lines 180-191 | Change signature to `listComplaintsForEmployee(employeeId: string, organizationId: string)` and change `where: { employeeId }` to `where: { employeeId, organizationId }`. This is the org-scoping hole. Keep the existing `include` and `orderBy` exactly as-is — the comment on lines 183-184 explains why `employee` is included and stays true. |
| T9 | `complaintWhere`, lines 217-223 | Keep `...(filters.employeeId && { employeeId: filters.employeeId })` **unchanged**, and add a **separate, non-colliding** key: `...(filters.employeeIds && { AND: [{ employeeId: { in: filters.employeeIds } }] })`. The two predicates then **intersect** — both apply. **Do not** write both into the same `employeeId` key. Add a one-line comment saying why (below). |
| T9-note | rationale for T9's shape | `employeeId` **narrows** (one employee); `employeeIds` is a **ceiling** (the actor's whole visible set). If they collide on one key the allow-list overwrites the narrower filter and the query returns **more** rows than the caller asked for — a widening, not a restriction. A scoping filter must never widen. Latent today (`filters.employeeId` has zero callers — the only `employeeId` in the route is the Zod field at `+page.server.ts:63` and the `isSubject` comparisons at `[id]:23,44`), but wrong, so fix it now. Test **N17** pins it. |

**Why `organizationId` is worth closing properly (T8):** `Employee.userId` is `@unique` **globally**
(`prisma/schema.prisma:424`), not per-org, while `locals.user.organizationId` is rewritten to the
active org on every org switch (`src/hooks.server.ts:36-39`). So `myEmployee` resolved from
`userId` can legitimately be an employee whose complaints belong to a different org than the one
the session is currently viewing. Filtering on `employeeId` alone leaks across that boundary.

### 2. `src/routes/(app)/complaints/+page.server.ts`

| # | Location | Change |
|---|---|---|
| T10 | line 20 | Delete `const roles = user.roles?.length ? user.roles : [user.role]`; use `user.roles` directly. `User.roles` is non-optional `Role[]`, so the whole ternary is dead — remove it, not just the `[user.role]` half. |
| T11 | line 21 | `const isHr = canAny(user.roles, 'MANAGE_HR')` — unchanged semantics, new source. |
| T12 | HR branch, before line 28 | `const visibleIds = await listVisibleEmployeeIds(user)` (import from `$lib/server/services/employee-access`). |
| T13 | line 28 | `const filters = { status, ...(visibleIds && { employeeIds: visibleIds }) }`. Threaded into **both** `countComplaintsForOrg` (line 30) and `listComplaintsForOrg` (line 33) so the pagination total describes what the actor can see, matching `employees/+page.server.ts:33-43`. |
| T14 | employee dropdown, lines 37-41 | Add `...(visibleIds && { id: { in: visibleIds } })` to the `where`. This is the fourth surface and the one the brief flags as easy to miss: today the "open an inquiry against…" `<select>` lists **every ACTIVE employee in the org**, so a MANAGER can read the whole roster off the form even before the 403 fires. |
| T15 | line 58 | `listComplaintsForEmployee(myEmployee.id, user.organizationId)`. |
| T16 | line 72 | Delete the dead `roles` line (same as T10). |
| T17 | line 73 | `if (!canAny(user.roles, 'MANAGE_HR'))` — unchanged semantics. Keep this coarse check: it is the capability gate, and the per-employee gate now lives in the service (T4). |
| T18 | lines 85-90, the `ctx` literal | Replace `actorRole: user.role` with `actorRoles: user.roles`. |

No change to the `open` action's error handling: `openComplaint` throws `error(403, …)` from
`assertCanTouchEmployee`, and the existing `isHttpError(e)` catch on line 94 already converts that
to `fail(403, { error: … })`. Confirmed the DENIED message ("You can only manage your own team or
a branch you manage.") is what surfaces.

### 3. `src/routes/(app)/complaints/[id]/+page.server.ts`

| # | Location | Change |
|---|---|---|
| T19 | line 14 | Delete the dead `roles` line. |
| T20 | `load`, lines 15-26 | Reorder: resolve `myEmployee` **first** (currently lines 19-22, after the fetch), build `ctx`, then `const complaint = await getComplaint(params.id, ctx, myEmployee?.id ?? null)`. Delete the now-redundant `isSubject`/403 block at lines 23-24 — the service owns admission. Keep returning `{ complaint, isHr, isSubject }`; `isHr` and `isSubject` are still needed by `+page.svelte:109,113,136` to decide which reply box and whether the Resolve button renders. Compute `isSubject` from `myEmployee?.id === complaint.employeeId` as before. |
| T21 | `load` | Needs an `AuditContext`-shaped object. `load` has no `getClientAddress` — build `{ organizationId: user.organizationId, actorId: user.id, actorRoles: user.roles }`; `ipAddress` is optional on `AuditContext` and `getComplaint` writes no audit row, so omitting it is correct. |
| T22 | `reply`, line 34 | Delete the dead `roles` line; use `user.roles`. |
| T23 | `reply`, lines 37-45 | Build `ctx` before the fetch (move lines 50-55 up), call `getComplaint(params.id, ctx, myEmployee?.id ?? null)`. The existing `.catch(() => null)` on line 41 must be **narrowed** — as written it would swallow the new 403 into a 404. Replace with a `try/catch` that re-throws to `failFromError`-style handling: on `isHttpError(e)` return `fail(e.status, { error: String(e.body.message) })`. Delete the now-redundant `isSubject`/403 at lines 44-45. |
| T24 | `reply`, ctx literal (lines 50-55) | `actorRoles: user.roles` instead of `actorRole: user.role`. |
| T25 | `resolve`, line 67 | Delete the dead `roles` line; `if (!canAny(user.roles, 'MANAGE_HR'))` on line 68. |
| T26 | `resolve`, ctx literal (lines 70-75) | `actorRoles: user.roles`. The per-employee gate arrives via `resolveComplaint` (T6); the existing `isHttpError` catch on line 79 already turns it into `fail(403, …)`. |

### 4. `tests/unit/complaints.test.ts`

| # | Location | Change |
|---|---|---|
| T27 | line 28 | `const CTX: AuditContext = { organizationId: 'org1', actorId: 'u-hr', actorRoles: ['HR_ADMIN'] }`. Fixes the 12th `pnpm check` error. |
| T28 | mock block, lines 10-23 | Add `vi.mock('$lib/server/services/employee-access', () => ({ assertCanTouchEmployee: vi.fn() }))` and hoist the mock fn, matching the shape `employee-reveal-access.test.ts:20-25` uses. **This mock half is not optional:** once the service starts calling `assertCanTouchEmployee` (T4-T7), the six existing tests in this file break without it. Leave `writeAuditLog` here as the bare `vi.fn()` it already is — N15 moved to `complaints-scoping.test.ts` (P4), so the **hoisted, inspectable `writeAuditLogMock` belongs in THAT file**, not this one. (An earlier draft cited a "T33" consumer here; no such touchpoint exists — touchpoints stop at T30.) |

### 5. `tests/unit/complaints-scoping.test.ts` — **new file**

All new tests except N16. Two templates, use both:

- **Route *actions* (N2-N5, N7, N8, N15):** copy `tests/unit/employee-reveal-access.test.ts` —
  route action under test, `employee-access` mocked, `error()` thrown from `mockImplementation`
  (never `mockRejectedValue`, because SvelteKit 2's `error()` throws rather than returns).
- **Route *`load`* functions (N6, N10, N11, N13, N13-empty, N14, N14-empty):** copy
  `tests/unit/requests-read-scoping.test.ts:45` — it imports `load` from
  `(app)/leave/+page.server` and invokes it ten times with a fake event, and it is itself a
  `listVisibleEmployeeIds` scoping test. That is a near-exact template. (`./$types` is a
  **type-only** import in both complaints route files, so it is erased at runtime and does not
  need to resolve.)
- **Actor factory:** `tests/unit/employee-access.test.ts`.

**Mock strategy — one rule, and it is load-bearing (G1).** Do **NOT** call
`vi.mock('$lib/server/services/complaints')` in this file. `vi.mock` is **file-scoped**: mocking the
service would break N2-N12, N15 and N17, which all need the **real** `openComplaint` /
`getComplaint` / `resolveComplaint` / `listComplaintsForOrg`. So this file mocks only
`$lib/server/db`, `$lib/server/audit`, `$lib/server/services/notifications`, and
`$lib/server/services/employee-access` — never the complaints service itself.

Consequence: **N13 / N13-empty assert on the db mock, not on service mocks.** That is strictly
better, not a workaround — asserting `dbMock.hrComplaint.findMany.mock.calls[0][0].where` proves the
filter reached the **query**; asserting a service mock would only prove the route handed an object
to a function, leaving `complaintWhere` free to drop it on the floor.

This file also needs its own hoisted `writeAuditLogMock` plus `vi.mock('$lib/server/audit', …)` —
N15 asserts on it (see T28).

**Db-mock requirement:** the `hrComplaint` mock must include `count: vi.fn()` and `beforeEach` must
`mockResolvedValue(0)` it. Without that, `countComplaintsForOrg` resolves `undefined` and
`paginate(url, total)` is handed `undefined`.

**Fallback only (do not reach for it first):** if some future test genuinely cannot use the real
service, partial-mock via `importOriginal` — precedent `tests/unit/payroll-read-scoping.test.ts:47-48`.

Full test matrix below.

### 6. `src/routes/(app)/reports/audit-log/+page.server.ts` — **one line**

| # | Location | Change |
|---|---|---|
| T29 | `entityTypes` array, lines 96-106 | Add `'HrComplaint'` to the list. This array is **hand-maintained** and its own comment (lines 94-95) says to extend it *"whenever a new entityType starts being audited, or that entity's rows cannot be filtered for at all — `PayrollPeriod` was missing until #298."* The complaints service writes three `entityType: 'HrComplaint'` audit rows (`index.ts:64, 109, 146`), so without this line SPEC criterion 8's audit rows exist but can never be filtered for in the report. **Nothing type-checks this** — `pnpm check` is green on that file today. Test **N16** pins it. |

### 7. `src/routes/(app)/complaints/[id]/+page.svelte` — **formatting only, no logic change**

| # | Location | Change |
|---|---|---|
| T30 | whole file | `pnpm prettier --write "src/routes/(app)/complaints/[id]/+page.svelte"`. This file is committed at `0223acf` and **already fails `pnpm format:check`** — it is the only failing file in the repo. It is a changed file of this branch, so Gate F cannot be scoped around it. **Formatting only**: no logic, markup, or copy change. Do not touch anything else in the file. |

### Not touched

`prisma/schema.prisma` (additive, already cherry-picked and `prisma generate` already run),
`src/routes/(app)/complaints/+page.svelte`, `src/routes/(app)/+layout.svelte`.

---

## Public Contracts

Three exported signatures change. All three are consumed **only** by the two complaints routes and
the two test files — grepped, no other importer exists.

| Symbol | Before | After | Callers to update |
|---|---|---|---|
| `getComplaint` | `(id: string, organizationId: string)` | `(id: string, ctx: AuditContext, actorEmployeeId: string \| null)` | `[id]/+page.server.ts:17`, `[id]/+page.server.ts:41` |
| `listComplaintsForEmployee` | `(employeeId: string)` | `(employeeId: string, organizationId: string)` | `+page.server.ts:58` |
| `ComplaintFilters` | `{ status?, employeeId? }` | `+ employeeIds?: string[]` | `+page.server.ts:28` — **internal type, not exported** (`index.ts:37` declares `interface ComplaintFilters` with no `export`). Listed for completeness only; no downstream risk, and the route passes an object literal via a variable so no excess-property check fires either way. |
| `assertCanReachComplaint` | — | new export | complaints service internals + new tests |

No HTTP contract changes: no new route, no new query param, no changed response shape. The only
observable behavior change for an out-of-scope MANAGER is 200 → 403.

## Blast Radius

- **Files changed: 7** (1 service, 2 route servers, 1 audit-log route server [one line], 1 Svelte file [formatting only], 2 test files) **+ 1 new test file**.
- **Risk class: auth / object-level permission.** High-risk per `vc-test-coverage-plan` — a hybrid
  gate is mandatory, which is what Decision 2 settles.
- **Packages: 1** (single SvelteKit app; no workspace fan-out).
- **Readers of the changed files:** none beyond the callers listed in Public Contracts. Verified by
  `grep -rn "services/complaints" src/ tests/` — exactly three importers, all inside
  `src/routes/(app)/complaints/` and `tests/unit/`. Nothing in `scripts/` or `prisma/` touches the
  service, so the "`pnpm check` does not cover `prisma/**` or `scripts/**`" hazard does not apply.
- **Unlisted reader, now listed (T29):** `src/routes/(app)/reports/audit-log/+page.server.ts` reads
  the audit rows this feature writes, through a **hand-maintained** `entityTypes` allow-list that no
  type-checker validates. `grep -rln "HrComplaint\|hrComplaint" src/` otherwise returns only the
  complaints service — this is the single cross-feature reader.
- **Formatting (T30):** `src/routes/(app)/complaints/[id]/+page.svelte` fails `pnpm format:check`
  as committed. Prettier-write only.
- **Nav array (`src/routes/(app)/+layout.svelte:178`): not modified**, and no e2e spec asserts nav
  contents by snapshot. Checked every `getByRole('link', …)` assertion in `tests/e2e/`: the asserted
  names are `Stores`, `Clear`, `1`, `Next →`, `Back` (exact), `Back to Employees`,
  `Back to Reports`, `Payslip` (exact), `Punch`, `View all balances`, `Whole team (day)`,
  `By employee`, `/New Timesheet/`, `/Export CSV/`, `/Multi-day matrix/`, plus
  `dashboard.spec.ts:20`'s case-insensitive regex over `Active Employees` / `Pending Approvals` /
  `Last Payroll`. **"Inquiries" is a substring of none of them and contains none of them** — no
  collision of the kind `payslip-draft-visibility.spec.ts:213-215` documents. No change required.
- **Rendered UI: unchanged.** Both `.svelte` files already branch on `data.isHr` / `data.isSubject`
  / `data.employees` and those keys keep their names and types.

---

## Implementation Checklist

Execute in this order. Sections 1-4 each end in a test gate.

**Section A — make it compile (mechanical)**

1. `src/lib/server/services/types.ts` — read only, no change. Confirm `actorRoles: Role[]` is
   required (it is, line 6-8).
2. `src/routes/(app)/complaints/+page.server.ts:20` — delete the `roles` const; replace its two
   uses (`:21`, and `:73` via step 4) with `user.roles`. **[T10, T11]**
3. `src/routes/(app)/complaints/+page.server.ts:72` — delete the `roles` const; line 73 becomes
   `if (!canAny(user.roles, 'MANAGE_HR'))`. **[T16, T17]**
4. `src/routes/(app)/complaints/+page.server.ts:88` — `actorRole: user.role` → `actorRoles: user.roles`. **[T18]**
5. `src/routes/(app)/complaints/[id]/+page.server.ts:14,34,67` — delete all three `roles` consts;
   use `user.roles` at `:15`, `:35`, `:68`. **[T19, T22, T25]**
6. `src/routes/(app)/complaints/[id]/+page.server.ts:53,73` — `actorRole` → `actorRoles: user.roles`. **[T24, T26]**
7. `tests/unit/complaints.test.ts:28` — `actorRole: 'HR_ADMIN'` → `actorRoles: ['HR_ADMIN']`. **[T27]**
7b. `pnpm prettier --write "src/routes/(app)/complaints/[id]/+page.svelte"` — the cherry-picked
   file is not prettier-clean and is the **only** file in the repo failing `pnpm format:check`
   right now. Formatting only; inspect the diff and confirm it contains no logic change. Without
   this, Gate F can never go green. **[T30]**
7c. `pnpm format:check` → exits 0. If it flags a file **you touched**, prettier-write that file and
   re-run. If it flags a file **you did not touch**, **stop and report**. Never blanket-run
   `pnpm format`. **[T30]**
8. **Gate A:** `pnpm prisma generate && pnpm check` → **0 errors** AND `pnpm test` → still 153 files
   pass AND `pnpm format:check` → exits 0. (Identical to the Section A row in Phase Completion Rules.)

**Section B — close the org-scoping hole**

9. `services/complaints/index.ts:180` — `listComplaintsForEmployee(employeeId, organizationId)`,
   `where: { employeeId, organizationId }`. **[T8]**
10. `complaints/+page.server.ts:58` — pass `user.organizationId`. **[T15]**
11. Add test **N1** (below) to `tests/unit/complaints-scoping.test.ts`.
12. **Gate B:** run mutation **M-N1** — delete `organizationId` from the `where` on line 182;
    N1 must go RED. Restore. `pnpm test` green.

**Section C — per-employee scoping**

13. `services/complaints/index.ts` — add the two imports. **[T1]**
14. `services/complaints/index.ts` — add `employeeIds?: string[]` to `ComplaintFilters`. **[T2]**
15. `services/complaints/index.ts` — add the exported `assertCanReachComplaint` helper with its
    doc-comment. **[T3]**
16. `services/complaints/index.ts` — wire it into `openComplaint` **[T4]**, `postComplaintMessage`
    **[T5]**, `resolveComplaint` **[T6]**, `getComplaint` (with the signature change) **[T7]**.
17. `services/complaints/index.ts:217` — extend `complaintWhere` with the `employeeIds` allow-list. **[T9]**
18. `complaints/+page.server.ts` — `listVisibleEmployeeIds` import, `visibleIds`, thread into
    `filters`, thread into the employee dropdown `where`. **[T12, T13, T14]**
19. `complaints/[id]/+page.server.ts` `load` — reorder `myEmployee` before the fetch, build `ctx`,
    new `getComplaint` call, delete the redundant 403. **[T20, T21]**
20. `complaints/[id]/+page.server.ts` `reply` — move `ctx` up, new `getComplaint` call, replace the
    swallowing `.catch(() => null)` with an `isHttpError`-preserving `try/catch`, delete the
    redundant 403. **[T23]**
21. **Gate C:** `pnpm check` → 0 errors. `pnpm test` → green.

**Section D — prove the guards**

21b. `src/routes/(app)/reports/audit-log/+page.server.ts:96-106` — add `'HrComplaint'` to
    `entityTypes`. One line. **This is the FIRST step of Section D**, not part of Section C — Gate C
    must not wait on it. It must land before N16 is written at step 23b. **[T29]**
22. Write tests **N2-N14** and **N17** in `tests/unit/complaints-scoping.test.ts`.
23. Write the **route-level** test **N15** in `tests/unit/complaints-scoping.test.ts` (it invokes
    route actions, so it belongs with the other route tests, not in the service-level file), and
    apply the mock-block change **[T28]** to `tests/unit/complaints.test.ts`.
23b. Write test **N16** in the existing `tests/unit/audit-log-reveal.test.ts` — that file already
    imports and invokes this `load` (`:37`, `:102`), so N16 is an added assertion, not a new file.
24. **Gate D:** run **all 20 mutations** in the matrix below by id — M-N1 … M-N12, M-N13a/b/c,
    M-N14a/b, M-N15, M-N16, M-N17 — one at a time, restoring between each with `cp` from the
    scratchpad (**never** `git checkout <file>`).
    Record the RED/GREEN result per mutation in the EXECUTE report. **Any mutation that stays
    GREEN means the test is vacuous and must be rewritten before this section closes.**
24b. **Gate E preconditions** — owned by the executing agent, run in this exact order, after
    Gate C. Gates A-D need **none** of this (unit tests mock the DB), so a stopped container never
    blocks the code work:
    1. `./start.sh` — the Postgres container `veent-db-5434` is currently **stopped**. Wait for it
       to accept connections on 5434.
    2. `pnpm db:push` — the cherry-picked schema has **never been applied locally**;
       `hr_complaints` and `hr_complaint_messages` do not exist yet. **If Prisma proposes any
       `DROP`, abort** and report drift (see Rollback).
    3. `pnpm prisma generate` — re-run after the push.
    4. `pnpm db:seed:e2e` — **not** `pnpm db:seed`. `prisma/seed.ts` calls `seedProd` only, and all
       three accounts the script uses live in `seedE2E`: `manager@veent.ph` (`seed-core.ts:742`),
       `employee@veent.ph` (`:773`), `verifier@veent.ph` (`:679`).
    5. `pnpm dev` — the `_dev/login-as` harness is guarded `if (!dev) error(404)`
       (`login-as/+server.ts:14`), so it works under `pnpm dev` and 404s in preview/prod.
25. **Gate E:** the live hybrid check for SPEC criterion 3 — Manual Verification Script below.
26. **Gate F:** `pnpm check` (0) + `pnpm test` (153 files + the new file, all pass) +
    `pnpm lint` + `pnpm format:check`.

---

## ADDENDUM — Section G: Inquiries sidebar count badge (scope addition, 24-08-26)

**This was NOT in the original plan.** The SPEC lists *"an unread-count badge on the Inquiries nav
tab"* under **Out Of Scope**, and the Non-Goals section above still says "unread badge". After Gate
E passed live, the user asked for it directly — *"the inquiries of the sidebar should have
indicators that there are new messages."* It is therefore in scope from 24-08-26 onward. Recorded
as an addendum rather than folded into the sections above, so the record stays honest about when
the requirement arrived.

Touchpoints continue the existing numbering at **T31**; tests continue at **N18**.

### Semantics — the status already encodes whose turn it is

No new state is needed. `RESPONDED` = the employee answered and HR owes a reply, so it counts for
an HR-side actor. `OPEN` = HR spoke last, so it counts for the subject employee. Both arms are
summed because one actor can be owed on both at once (a manager who is also the subject of a
thread); they can never double-count one row, because a row holds exactly one status and the two
arms match on different statuses.

**The count is scoped exactly like the list it links to** — `listVisibleEmployeeIds` for the HR
arm, the actor's own employee id for the subject arm, always org-scoped. A count that promises a
thread the page then 403s is the failure this scoping exists to prevent. `null` is unrestricted;
`[]` matches nothing and stays fail-closed — never `?.length &&`.

### Design decision (settled via the project's UI skill — implement, do not redesign)

- **A numeric pill, not a red dot.** The red dot on the collapsible *Requests/Approvals* parent
  means "something is hidden inside this collapsed group". Inquiries is a **flat** item, so nothing
  is hidden and the honest signal is *how many*.
- **Reuses the existing child-badge classes verbatim** (`+layout.svelte:560-565`) so the sidebar
  keeps one badge language, plus `shrink-0` and `tabular-nums`.
- **`bg-primary`, not red.** Red is reserved here for the collapsed-group alert; a waiting count is
  not an error.
- **Accessible name required.** The existing pills have none — a screen reader announces just "3".
  This one carries an `aria-label` naming what the number means.
- Flat nav items render `{item.label}` bare, so the label is wrapped in `<span class="flex-1">` to
  push the badge right. That wrap must be **verified** visually inert for the badge-less items, not
  assumed.
- Render only when the count is greater than zero.

### Touchpoints

| # | Location | Change |
|---|---|---|
| T31 | `src/lib/server/services/complaints/index.ts` — new export, placed above `getComplaint` | `countWaitingInquiries(actor: EmployeeAccessActor): Promise<number>` — the two arms above, summed. Imports `listVisibleEmployeeIds` and the `EmployeeAccessActor` type from `$lib/server/services/employee-access`. Doc-comment must state why the two arms cannot double-count and why it is scoped through the same helper as the list. |
| T32 | `src/routes/(app)/+layout.server.ts` | Add the call to the existing `Promise.all` (**not** serialised after the other awaits) and return it as `waitingInquiries`. |
| T33 | `src/routes/(app)/+layout.svelte` | `badge: data.waitingInquiries` on the Inquiries nav entry (nav array, ~line 178), plus the badge slot in the **FLAT** item branch (~line 594). The collapsible branch already has its own badge slot and must not be touched. |

### Test matrix — Section G

All in `tests/unit/complaints-scoping.test.ts`. The complaints service stays **unmocked** in that
file (`vi.mock` is file-scoped and the other tests need the real one), so these assert on
`dbMock.hrComplaint.count.mock.calls[n][0].where`.

| id | Tier | Test | Mutation that MUST turn it red |
|---|---|---|---|
| N18 | Fully-Automated | The HR arm counts only `RESPONDED` and carries `employeeId: { in: visibleIds }`. | **M-N18:** delete the `...(visibleIds && …)` spread from the HR arm's `where`. |
| N19 | Fully-Automated | The subject arm counts the actor's own `OPEN` threads, org-scoped, and the two arms **sum**. | **M-N19:** change the subject arm's status to `'RESPONDED'`. **M-N19b:** change `total +=` to `total =` in the subject arm. |
| N20 | Fully-Automated | A `MANAGE_HR` actor with `[]` visible ids stays fail-closed — `in: []` present, not absent. | **M-N20:** change the guard to `...(visibleIds?.length && …)`. |
| N21 | Fully-Automated | A non-`MANAGE_HR` actor runs the subject arm **only** — exactly one count, and `listVisibleEmployeeIds` is never called. | **M-N21:** run the HR arm unconditionally (drop the `canAny(actor.roles, 'MANAGE_HR')` guard). |
| N22 | Fully-Automated | An actor with no employee row does not crash and counts no subject arm (returns 0, zero count queries). | **M-N22:** delete the `if (self)` guard on the subject arm. |

### Gates — Section G

Same four as Gate F: `pnpm check` (0 errors), `pnpm test` (all green), `pnpm lint` (0 errors),
`pnpm format:check` (clean). A flagged file **you touched** → prettier-write it and re-run; a file
**you did not touch** → stop and report. Never blanket-run `pnpm format`.

### Known gap — Section G

The badge **rendering** (the `{#if item.badge}` block and its `aria-label`) has no automated test:
this repo has no component-test harness for `+layout.svelte`, and the e2e suite asserts no nav
contents for this item (`grep -rn "Inquiries\|complaints" tests/e2e/` → zero hits). N18–N22 prove
the **number**; the pill itself is eyeball-verified only.

---

## Test Matrix — every test with its falsifying mutation

Tier assignments follow `vc-test-coverage-plan`; the mutation column is the anti-vacuity
requirement. `all-tests.md:94` — *"A mutation check written into a plan is a hypothesis — only
running it makes it evidence."*

### New file: `tests/unit/complaints-scoping.test.ts`

| id | Tier | Test | Mutation that MUST turn it red |
|---|---|---|---|
| N1 | Fully-Automated | `listComplaintsForEmployee` passes `organizationId` into the Prisma `where`. Assert on `dbMock.hrComplaint.findMany.mock.calls[0][0].where` deep-equalling `{ employeeId: 'emp1', organizationId: 'org1' }`. | **M-N1:** remove `organizationId` from the `where` object at `index.ts:182`. |
| N2 | Fully-Automated | HR_ADMIN `open` succeeds against any employee (positive control, SPEC 1). `assertCanTouchEmployee` mock resolves; assert `hrComplaint.create` called. | **M-N2:** make `assertCanTouchEmployee` throw for HR_ADMIN in the mock — if the test still passes, `openComplaint` is not calling it at all. |
| N3 | Fully-Automated | MANAGER `open` against a report succeeds (positive control, SPEC 2). Actor `roles:['MANAGER']`, `assertCanTouchEmployee` resolves. Assert the created row carries `employeeId: 'emp-report'` and `status: 'OPEN'`. | Change `openComplaint` to always pass `null` instead of `employee.id` to `assertCanReachComplaint` — the positive still passes but N4 goes red; so **M-N3** is: make the route's `canAny(user.roles,'MANAGE_HR')` at `:73` reject MANAGER. |
| N4 | Fully-Automated | MANAGER `open` against an out-of-scope employee → 403 (SPEC 3a). `assertCanTouchEmployee.mockImplementation(() => error(403, DENIED))`; assert `actions.open(...)` resolves to `{ status: 403 }` **and** `hrComplaint.create` was **not** called. | **M-N4:** delete the `assertCanReachComplaint` call from `openComplaint` (T4). |
| N5 | Fully-Automated | `assertCanReachComplaint` is called **before** the write in `openComplaint`. Assert call-order via `mock.invocationCallOrder`. | **M-N5:** move the T4 line to after `db.hrComplaint.create`. (Same trap `employee-reveal-access.test.ts:79-83` pins for `?/reveal`.) |
| N6 | Fully-Automated | MANAGER `load` of an out-of-scope thread by known id → 403 (SPEC 3b). `getComplaint` throws 403; assert `load(event)` rejects with `{ status: 403 }`. | **M-N6:** delete the `assertCanReachComplaint` call from `getComplaint` (T7). |
| N7 | Fully-Automated | MANAGER `reply` on an out-of-scope thread → 403, **not** 404 (SPEC 3c). Assert the returned `fail` carries `status: 403`. | **M-N7:** restore the old `.catch(() => null)` in `reply` — the 403 collapses to `fail(404)` and this test goes red. This is the single most important mutation in the matrix: it is the exact way a correct service guard gets silently downgraded by a route. |
| N8 | Fully-Automated | MANAGER `resolve` on an out-of-scope thread → 403 (SPEC 3d). | **M-N8:** delete the `assertCanReachComplaint` call from `resolveComplaint` (T6). |
| N9 | Fully-Automated | `resolveComplaint` checks scope **before** the `status === 'RESOLVED'` early return. Set the fixture to `status:'RESOLVED'` and an out-of-scope actor; assert it still throws 403 rather than returning the complaint. | **M-N9:** move the T6 line below the `if (complaint.status === 'RESOLVED') return complaint` on line 136. |
| N10 | Fully-Automated | Subject employee (`roles:['EMPLOYEE']`) `load` of **their own** thread succeeds (SPEC 4 positive). Assert the returned `complaint.id` and `isSubject === true`. | **M-N10:** change the `else` arm of `assertCanReachComplaint` to always `error(403)`. |
| N11 | Fully-Automated | Subject employee `load` of a **co-worker's** thread by known id → 403 with the message `'You do not have access to this inquiry.'` (SPEC 4 negative). Assert both status and message. | **M-N11:** change the `else` arm to `if (actorEmployeeId == null) error(...)` — i.e. admit any actor who has an employee record. |
| N12 | Fully-Automated | A non-`MANAGE_HR` actor who is the subject's **supervisor** still gets 403 (the widening guarded against in Decision 1). Actor `roles:['EMPLOYEE']`, `actorEmployeeId:'emp-boss'`, complaint `employeeId:'emp-report'`, `canTouchEmployee` mocked to resolve TRUE. Assert 403. | **M-N12:** collapse `assertCanReachComplaint` to a single `assertCanTouchEmployee` call with no `MANAGE_HR` arm. |
| N13 | Fully-Automated | HR list load threads `visibleIds` through **both** the count query and the rows query, **asserted on the db mock** (see the mock-strategy rule above — the service is NOT mocked). `listVisibleEmployeeIds` mocked to `['emp-a']`; assert `dbMock.hrComplaint.count.mock.calls[0][0].where` **and** `dbMock.hrComplaint.findMany.mock.calls[0][0].where` each carry `AND: [{ employeeId: { in: ['emp-a'] } }]`. This proves the filter reached the QUERY, not merely that the route handed an object to a service. | **M-N13a:** remove `...(visibleIds && …)` from the `filters` literal (T13). **M-N13b (counter half):** remove `filters` from only the `countComplaintsForOrg` call — if the test still passes it is checking one of the two, not both. |
| N13-empty | Fully-Automated | **The `[]` case.** `listVisibleEmployeeIds` mocked to `[]` (a manager with no reports and no branches — `employee-access.ts:90`, `:113-117`). Assert the built `where` on **both** `dbMock.hrComplaint.count` and `dbMock.hrComplaint.findMany` carries `AND: [{ employeeId: { in: [] } }]` — present, not absent. `[]` is truthy in JS, so `employeeId: { in: [] }` matches nothing — **fail-closed**, which is the documented intent (`tests/unit/requests-read-scoping.test.ts:11-14`, "`[]` closes it"). | **M-N13c:** change the guard to `...(visibleIds?.length && { employeeIds: visibleIds })`. The `[]` case then silently drops the filter and the manager sees the whole org. Must go RED. |
| N14 | Fully-Automated | HR list load scopes the **employee dropdown**. Assert `dbMock.employee.findMany.mock.calls[0][0].where` contains `id: { in: ['emp-a'] }` when `listVisibleEmployeeIds` returns `['emp-a']`, and contains **no** `id` key when it returns `null`. | **M-N14a:** remove the `...(visibleIds && { id: { in: visibleIds } })` spread (T14). |
| N14-empty | Fully-Automated | **The `[]` case for the dropdown.** `listVisibleEmployeeIds` → `[]`; assert the `where` carries `id: { in: [] }` — present, not absent. This is the roster-leak surface: dropping the filter here lists every ACTIVE employee in the org. | **M-N14b:** change the guard to `visibleIds?.length &&`. Must go RED. |
| N17 | Fully-Automated | **Filter intersection (T9).** Calls the **real** `listComplaintsForOrg` (the service is not mocked in this file). Call `listComplaintsForOrg('org1', { employeeId: 'emp-x', employeeIds: ['emp-a','emp-x'] })`; assert the built `where` carries **both** predicates — `employeeId: 'emp-x'` **and** `AND: [{ employeeId: { in: ['emp-a','emp-x'] } }]`. | **M-N17:** drop the `AND` wrapper and write the allow-list straight into `employeeId` (the original T9 shape). The narrower filter is overwritten, the query widens, and N17 must go RED. |

### Route-level: N15 (in `tests/unit/complaints-scoping.test.ts`)

| id | Tier | Test | Mutation that MUST turn it red |
|---|---|---|---|
| N15 | Fully-Automated | **Route-level `actorRoles` carry-through (SPEC 8).** Invoke `actions.open` (list route) and `actions.reply` / `actions.resolve` (`[id]` route) with `locals.user.roles = ['HR_ADMIN','MANAGER']` — a **multi-role** actor, deliberately. For each, assert `writeAuditLogMock.mock.calls[0][0].actorRoles` **deep-equals** `['HR_ADMIN','MANAGER']`. | **M-N15 (paired):** change one route ctx literal to `actorRoles: [user.roles[0]]`. N15 must go **RED** *while `pnpm check` stays **GREEN***. Record **both halves** in the EXECUTE report — the pairing is the whole point. If `pnpm check` goes red, you deleted the field instead of narrowing it; narrow, do not delete. |

**Why N15 moved and changed shape (was: service-level `objectContaining`).** The old version handed
the service a `CTX` constant that already contained `actorRoles` and asserted it survived — but the
service passes `ctx` **by reference** (`index.ts:62, 106, 143`), so that assertion is near-tautological.
The real regression lives in the **route**, and `pnpm check` does not catch it: a **missing**
`actorRoles` is a compile error (that is 3 of today's 12 errors), but a **narrowed** one —
`actorRoles: [user.roles[0]]` — type-checks perfectly clean. Narrowing is exactly the #247/#272/#275
failure class that `types.ts:5-7` exists to prevent, and a single-role actor would hide it, hence the
two-role fixture.

### Extended: `tests/unit/audit-log-reveal.test.ts`

| id | Tier | Test | Mutation that MUST turn it red |
|---|---|---|---|
| N16 | Fully-Automated | **`HrComplaint` is filterable in the audit-log report.** That file already imports and invokes this `load` (`:37`, `:102`), so this is an added assertion in the existing suite: assert the returned `entityTypes` array **contains** `'HrComplaint'`. | **M-N16:** remove `'HrComplaint'` from the array (T29). Must go RED. This is the only guard on a hand-maintained list that no type-checker validates — the same list that was missing `PayrollPeriod` until #298. |

### Mock discipline (mandatory — the vacuous-mock trap)

Tests N1, N13, N13-empty, N14, N14-empty, and N17 all assert **what a query asked for**. `all-tests.md:76-80` and
`approval-queues.test.ts:40-60` document that a flat `mockResolvedValue` hands back the whole
fixture whatever the `select`/`where` said, which makes those assertions vacuous in one direction.

Rule for this file: N1/N13/N13-empty/N14/N14-empty/N17 must assert against **`mock.calls[0][0]`** (the arguments the query
was built with), never against the returned rows. That sidesteps the projection problem entirely
and is the correct shape for a *where-clause* assertion. The `project()` helper in
`approval-queues.test.ts` is the tool for *returned-shape* assertions; none of these tests need
it, and reaching for it here would be cargo-culting. Note this decision in the EXECUTE report.

### What these tests do NOT prove

- They do not prove the Prisma query the mock stands in for actually filters correctly at the SQL
  level — the DB is mocked (`all-tests.md:108`). Gate E (live) covers this for the highest-risk
  path.
- They do not prove the `[id]` page renders a 403 page rather than a blank one. Not asserted;
  SvelteKit's `error()` handling is framework behavior and out of scope.
- They do not cover the branch-manager arm of `canTouchEmployee` (branch staff) — that arm is
  already pinned by `tests/unit/employee-access.test.ts` and is not re-proven here.

### Known gaps (recorded, not silently dropped)

| Gap | Why it is not closed here | Resolution |
|---|---|---|
| No e2e spec for the complaints surface | The e2e suite is a known-flaky gate (#287) and SPEC adds no e2e requirement; Gate E covers the live path with a driven check instead. | Backlog note only — not a blocker. Gates remain CONDITIONAL on Gate E passing, per the vacuous-green ban. |
| `writeAuditLog`/`notify` outside the `$transaction` | SPEC "Out Of Scope" line 229-231 excludes it explicitly. | Backlog note in the EXECUTE report. |
| Stale comment at `prisma/seed-core.ts:676` claiming the sign-off accounts have no Employee record | Cosmetic, outside this PR's scope. `ensureEmployeeProfile` at `:701-714` DOES create one (Vince Verifier, EMP-901, `employmentStatus` defaults ACTIVE) — which is precisely why he is a usable Gate E target. Do **not** fix the comment in this PR. | Backlog note. |
| T9's `AND: [...]` is the **first use of that Prisma construct in this codebase** (`grep -rn "AND: \[" src/` → zero hits) and no gate exercises it live | It type-checks against the real `Prisma.HrComplaintWhereInput` (verified), but `filters.employeeId` has zero callers, so the intersecting path is unreachable at runtime today and no SQL is ever emitted for it. N17 proves the `where` object is **built** correctly, not that Postgres executes it. | Accepted residual. Record it in the EXECUTE report. **EXECUTE must NOT "simplify" by deleting the dead `filters.employeeId` field** — that is a scope change requiring its own decision. |
| The branch-manager arm of `canTouchEmployee` is not exercised live | Veent is not a food-service org (`orgs.ts:20` — `FOOD_SERVICE_ORG_IDS = ['org_jojo','org_sweetleaf']`), so Maria manages no branches and Gate E cannot reach that arm. It stays pinned by `tests/unit/employee-access.test.ts` against a mocked DB. | Recorded gap; not a blocker. |
| `HrComplaint.organizationId` is a bare scalar with no relation | SPEC "Out Of Scope" line 226-228. | Backlog note. |

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| N2 + existing `complaints.test.ts` open test | Fully-Automated | 1 — org-wide role can open against any employee |
| N3 | Fully-Automated | 2 — MANAGER positive control against a report |
| N4, N6, N7, N8 (+ N5, N9 ordering) | Hybrid (automated half) | 3 — MANAGER refused on all four actions, each asserting a status code |
| Gate E live browser + psql negative control | Hybrid (live half) | 3 — the guard holds in a real request, not just a mocked one |
| N10 (positive), N11 (negative), N12 (no supervisor widening) | Fully-Automated | 4 — subject sees only their own |
| N1 + existing 404 test at `complaints.test.ts:74-80` | Fully-Automated | 5 — nothing crosses organizations |
| Existing tests "employee reply → RESPONDED…", "HR reply → OPEN…" | Fully-Automated | 6 — status ping-pong + notify |
| Existing tests "a resolved inquiry rejects further replies", "resolveComplaint sets RESOLVED…" | Fully-Automated | 7 — resolved is terminal |
| N15 (route-level, multi-role actor) + `pnpm check` | Fully-Automated | 8 — `actorRoles` on every audit write, complete not narrowed |
| N16 | Fully-Automated | supports 8 — the `HrComplaint` audit rows are actually filterable in the audit-log report |
| `pnpm check` → 0 errors | Fully-Automated | 9 — clean typecheck |
| `pnpm test` → 153 files + `complaints-scoping.test.ts`, all pass | Fully-Automated | 10 — suite stays green |
| Existing `notify()` assertions in `complaints.test.ts` | Fully-Automated | 11 — toast/recent-activity pipeline unchanged |
| N13, N13-empty, N14, N14-empty | Fully-Automated | supports 3 and 5 — list + dropdown scoping including the fail-closed `[]` case (no criterion of its own; the roster leak the dropdown causes is covered by criterion 3's spirit) |
| N17 | Fully-Automated | supports 3 and 5 — the two employee filters intersect instead of the allow-list widening the query |
| `pnpm format:check` exits 0 | Fully-Automated | supports 9/10 — Gate F is only achievable after T30 |

**Gate commands, verbatim:**

```bash
pnpm prisma generate            # after any schema touch; a stale client fakes check errors
pnpm check                      # MUST print 0 errors
pnpm test                       # MUST be 153 files + 1 new file, all pass
pnpm lint
pnpm format:check       # currently FAILS on complaints/[id]/+page.svelte until step 7b runs
```

Gate E preconditions (executing agent, after Gate C — Gates A-D need none of it):

```bash
./start.sh                      # veent-db-5434 is currently STOPPED
pnpm db:push                    # hr_complaints does not exist yet; ABORT if any DROP is proposed
pnpm prisma generate
pnpm db:seed:e2e                # NOT pnpm db:seed — seed.ts runs seedProd only
pnpm dev
```

---

## Manual Verification Script (Gate E)

**Preconditions — run Implementation Checklist step 24b first, in order:** `./start.sh` →
`pnpm db:push` → `pnpm prisma generate` → **`pnpm db:seed:e2e`** (not `pnpm db:seed`) → `pnpm dev`
on `http://localhost:5173`. None of the three accounts below exist under `pnpm db:seed`, and the
`hr_complaints` table does not exist until the push runs.

Every step asserts something **positive**; "the card is absent" is never the assertion.

**Setup — plant the marker**

1. Open `http://localhost:5173`. Use the dev login switcher, account **Super Admin**
   (`admin@veent.ph`).
2. Click the sidebar link named exactly **Inquiries**. Assert the page heading reads
   **HR Inquiries** and a button labelled **Open an inquiry** (or the form toggle) is present.
3. Open the form. In the employee `<select>`, assert the option list **contains** an entry for
   `Vince Verifier` — the out-of-scope target. (Positive assertion that admin's dropdown is
   org-wide.)
4. Select that verifier employee. Subject: `SCOPE-PROBE-112`. Category: **Other**. Message:
   `probe`. Submit. Assert the flash message reads **Inquiry opened.** and a row with subject
   `SCOPE-PROBE-112` now appears in the table at status **Open**.
5. Read the id back from the DB:

   ```bash
   docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris \
     -c "select id, employee_id, status from hr_complaints where subject = 'SCOPE-PROBE-112';"
   ```

   Assert exactly **one** row is returned and note its `id` as `$PROBE_ID`.

**Negative control — MANAGER refused on all four actions**

6. Switch account to **Manager (HR)** (`manager@veent.ph`, Maria Manager). Click **Inquiries**.
7. Assert the table **does** contain nothing with subject `SCOPE-PROBE-112`, *and* — the positive
   half — assert the page still renders the **HR Inquiries** heading and the **Open an inquiry**
   control (so you are proving a filter, not a broken page).
8. Open the form's employee `<select>`. Assert the option list contains exactly one selectable
   employee, **Elena Employee**, and that it does **not** contain `Vince Verifier`. Assert Elena's
   presence positively — that is what proves the dropdown rendered at all.
9. Navigate directly to `http://localhost:5173/complaints/$PROBE_ID`. Assert the page shows an
   error containing **"You can only manage your own team or a branch you manage."** and the HTTP
   status is **403** (check the Network tab's document request).
10. From the browser console on any app page, POST the reply action directly:

    ```js
    await fetch(`/complaints/${PROBE_ID}?/reply`, {
      method: 'POST',
      body: new URLSearchParams({ body: 'should not land' })
    }).then((r) => r.text())
    ```

    Assert the returned payload carries **403** and the DENIED message.
11. Same for resolve:

    ```js
    await fetch(`/complaints/${PROBE_ID}?/resolve`, { method: 'POST', body: new URLSearchParams() })
      .then((r) => r.text())
    ```

    Assert **403**.
12. Assert the database did **not** move:

    ```bash
    docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris \
      -c "select c.status, count(m.id) as msgs from hr_complaints c
          left join hr_complaint_messages m on m.complaint_id = c.id
          where c.subject = 'SCOPE-PROBE-112' group by c.status;"
    ```

    Assert the row reads `status = OPEN` and `msgs = 1` — the original seeded message only.

**Positive control — the same MANAGER, in scope**

13. Still as Maria, open the form, pick **Elena Employee**, subject `SCOPE-PROBE-112-OK`,
    category **Attendance**, message `in scope`. Submit. Assert the flash reads **Inquiry opened.**
    and the row appears in her table at status **Open**.
14. Click into that row. Assert the thread page shows the message body `in scope` and a **Resolve**
    button is present. Post a reply `manager reply`; assert it appears in the thread.
15. Confirm in the DB:

    ```bash
    docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris \
      -c "select c.subject, c.status, u.email as opened_by, count(m.id) as msgs
          from hr_complaints c join users u on u.id = c.opened_by_id
          left join hr_complaint_messages m on m.complaint_id = c.id
          where c.subject like 'SCOPE-PROBE-112%' group by c.subject, c.status, u.email;"
    ```

    Assert `SCOPE-PROBE-112-OK` has `opened_by = manager@veent.ph` and `msgs = 2`.

**Subject control**

16. Switch to **Employee** (`employee@veent.ph`, Elena). Click **Inquiries**. Assert the heading
    reads **HR Inquiries about you** and the `SCOPE-PROBE-112-OK` row is present.
17. Open it, post a reply `employee reply`, assert it appears and the status badge now reads
    **Responded**.
18. Navigate to `/complaints/$PROBE_ID` (the verifier's thread). Assert **403** with
    **"You do not have access to this inquiry."**

**Cleanup**

19. ```bash
    docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris \
      -c "delete from hr_complaints where subject like 'SCOPE-PROBE-112%';"
    ```
    Assert `DELETE 2`.

---

## Dependencies and Sequencing

- Section A must land before B and C — the file does not compile until the `actorRoles` /
  `user.role` errors are gone, so `pnpm check` cannot be used as a gate on later work.
- Section C step 16 (`getComplaint` signature) must land in the same edit as steps 19-20 (the two
  route callers) or `pnpm check` breaks between them.
- Section D depends on all of C.
- **Gate E depends on infrastructure that does not exist yet.** The container `veent-db-5434` has
  been stopped for days, so the cherry-picked schema was never pushed and `hr_complaints` does not
  exist locally; and `prisma/seed.ts` calls `seedProd` only, so `manager@veent.ph`,
  `employee@veent.ph` and `verifier@veent.ph` are absent under `pnpm db:seed`. The executing agent
  owns Implementation Checklist step 24b (`./start.sh` → `pnpm db:push` → `pnpm prisma generate` →
  `pnpm db:seed:e2e` → `pnpm dev`), run after Gate C. **Gates A-D need none of it** — the unit
  suite mocks Prisma — so a stopped container never blocks the code work.
- Step 7b (prettier on `complaints/[id]/+page.svelte`) must land in Section A. Gate F is
  unachievable without it.
- Step 21b (`'HrComplaint'` into `entityTypes`) is the **first step of Section D**, not the last of
  Section C. Gate C does not wait on it; it must land before N16 is written at step 23b.
- **`pnpm prisma generate` has already been run for the cherry-picked schema**, which is why
  `pnpm check` reports exactly 12 errors and none of them mention the new models. If it ever
  reports errors mentioning `hrComplaint` or `HrComplaint`, re-run generate before believing them
  (`all-tests.md:62-64` — this has been misdiagnosed three times). Re-run it again after
  `pnpm db:push` in step 24b.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| The `reply` action's `.catch(() => null)` silently downgrades the new 403 to a 404 | **High** — it is in the code right now | T23 rewrites it; test N7 is the specific tripwire and its mutation is "restore the old catch" |
| Collapsing the two-arm rule into `assertCanTouchEmployee` widens access to non-HR supervisors | Medium — it looks like a simplification | Test N12 exists solely to catch it; Decision 1 documents why |
| `resolveComplaint`'s early return leaks existence of an already-resolved out-of-scope thread | Medium | T6 places the check above the early return; test N9 pins the order |
| List filter hides the row but the form action still accepts the id | Medium — this is the #234 pattern | The service check (T4/T5/T6) is the enforcement; N4/N7/N8 prove it independently of the list |
| `pnpm check` passes while `actorRoles` is silently narrowed to one role | Medium — it type-checks clean, and this is the #247/#272/#275 failure class | Route-level N15 with a two-role fixture; its mutation is paired (test RED **and** `pnpm check` GREEN) |
| The allow-list overwrites the narrower `employeeId` filter and the query returns MORE rows | Low today (zero callers), certain the day one appears | T9 intersects via `AND` instead of colliding on one key; N17 pins it |
| A manager with no reports and no branches gets `[]`, a later refactor to `?.length` drops the filter, and both surfaces open org-wide | Medium — `?.length` looks like a harmless tidy-up | N13-empty and N14-empty pin the `[]` case explicitly; the refactor IS the mutation |
| The new `HrComplaint` audit rows are written but unfilterable in the report | **Certain as written** — the allow-list is hand-maintained and untyped | T29 + N16; the same list was missing `PayrollPeriod` until #298 |
| Gate F is declared mandatory but cannot pass | **Certain as previously written** — `format:check` already fails on a committed file | Step 7b prettier-writes it in Section A; step 7c re-checks |
| A mutation is written into the plan but never actually run | Medium — the repo has been burnt by this | Gate D requires each mutation's RED/GREEN result recorded in the EXECUTE report; a GREEN mutation blocks the section |
| Scoped `count` and scoped `list` disagree → wrong pagination | Low | T13 threads `filters` into both; N13's mutation explicitly checks the counter half |

## Rollback

- **Code:** every change is confined to the 7 files named in Blast Radius, on
  `feat/hr-complaints-112`, which is unpushed and
  has no PR. `git restore <file>` per file, or `git reset --hard 0223acf` to return to the
  as-cherry-picked state. **Never** use `git checkout <file>` to undo a temp edit — copy to the
  scratchpad instead (this repo has lost uncommitted work that way).
- **Schema:** no schema change is made by this plan. The cherry-picked additive schema is applied
  with `pnpm db:push` (`dotenv -e .env.dev -- prisma db push`). If the push misbehaves:
  1. The change is **additive only** — two new models, two new enums, three back-relations. Nothing
     is dropped or renamed, so there is no enum-rename hazard (the class of problem
     `scripts/migrate-employment-type-regular.ts` exists for).
  2. On failure, read the error before retrying. If Prisma proposes any `DROP`, **abort** — that
     means the local DB has drifted, not that the schema is wrong.
  3. To recover a clean local DB: `docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c "drop table if exists hr_complaint_messages, hr_complaints cascade; drop type if exists \"ComplaintStatus\", \"ComplaintCategory\";"` then `pnpm db:push` and `pnpm prisma generate` again.
  4. Nothing outside these two tables and two enums is touched, so no other feature's data is at
     risk.

## Acceptance Criteria

Mirrors the SPEC's 11 criteria; each is testable and each maps to a row in **Verification
Evidence** above. This plan is done when **all eleven** hold:

1. `pnpm check` prints **0 errors** (SPEC 9).
2. `pnpm test` passes: 153 existing files + the new `tests/unit/complaints-scoping.test.ts`, with
   the 6 pre-existing complaints tests still green (SPEC 10).
3. HR_ADMIN / SUPER_ADMIN / CEO can open an inquiry against **any** employee in their org and the
   thread lands at status `OPEN` (SPEC 1) — test N2.
4. A MANAGER can open, view, reply to, and resolve an inquiry about a **direct report** (SPEC 2) —
   test N3 + Manual script steps 13-15.
5. A MANAGER is refused with **403** on each of the four actions independently — `open`, `load`,
   `reply`, `resolve` — against an out-of-scope employee, each asserting the status code and not
   merely list absence (SPEC 3) — tests N4/N6/N7/N8 + Manual script steps 9-12.
6. The subject employee sees their own thread (positive) and is refused **403** with
   "You do not have access to this inquiry." on a co-worker's thread by known id (SPEC 4) — tests
   N10/N11 + Manual script steps 16-18.
7. `listComplaintsForEmployee` carries an `organizationId` predicate, and an out-of-org employee id
   still yields 404 from `openComplaint` (SPEC 5) — test N1 + the existing 404 test.
8. Status ping-pong and its notifications are unchanged (SPEC 6) — existing tests still green.
9. A resolved thread still rejects further replies, and resolving still notifies the employee
   (SPEC 7) — existing tests still green.
10. `writeAuditLog` receives `actorRoles` on `openComplaint`, `postComplaintMessage`, and
    `resolveComplaint` (SPEC 8) — test N15.
11. No new notification surface is introduced; the existing `notify()` assertions still pass
    (SPEC 11).

Plus three plan-level bars not in the SPEC:

12. `'HrComplaint'` appears in the audit-log report's `entityTypes` allow-list, and
    `pnpm format:check` exits 0.
13. **Every mutation in the Test Matrix has been run and recorded RED.** A mutation left unrun, or
    recorded GREEN, blocks completion.
14. **Gate E (live) has been run** with both its negative and positive controls, and its output is
    pasted into the EXECUTE report.

## Phase Completion Rules

This is a single-phase plan with six internal gates. A section is `CODE DONE` when its edits are
written; it is only `VERIFIED` when its gate is green **and the evidence is recorded**.

| Section | `CODE DONE` when | `VERIFIED` when |
|---|---|---|
| A — make it compile | steps 1-7c written (incl. the prettier write) | **Gate A**: `pnpm prisma generate && pnpm check` prints 0 errors AND `pnpm test` is 153 files green AND `pnpm format:check` exits 0 |
| B — org-scoping hole | steps 9-11 written | **Gate B**: mutation M-N1 recorded RED, restored, `pnpm test` green |
| C — per-employee scoping | steps 13-21 written | **Gate C**: `pnpm check` 0 errors AND `pnpm test` green |
| D — guard tests | steps 21b-23b written | **Gate D**: all **20** mutations (M-N1 … M-N12, M-N13a/b/c, M-N14a/b, M-N15, M-N16, M-N17) run one at a time, each recorded RED by id, each restored. M-N15 is **paired**: N15 RED **and** `pnpm check` GREEN, both recorded |
| E — live proof | step 24b preconditions applied | **Gate E**: Manual Verification Script run end to end, all positive assertions confirmed, psql output pasted into the report |
| F — full suite | n/a | **Gate F**: `pnpm check` + `pnpm test` + `pnpm lint` + `pnpm format:check` all green |

Hard rules:

- **Never mark a section `VERIFIED` on code alone.** Code-only completion is `CODE DONE`.
- **A GREEN mutation is a failure, not a pass.** It means the test is vacuous; rewrite the test
  before the section closes.
- **Sections run in order.** Section B may not start before Gate A is green, because `pnpm check`
  is unusable as a signal until the 12 compile errors are gone.
- **Restore mutations with `cp` from the scratchpad, never `git checkout <file>`** — this repo has
  lost uncommitted work that way.
- **`pnpm format:check` runs in Gate A and LAST in Gate F.** If it flags a file **you touched**,
  prettier-write that one file and re-run. If it flags a file **you did not touch**, stop and
  report. Never blanket-run `pnpm format`.
- **Gate E may not be skipped or downgraded to "the unit tests cover it".** SPEC criterion 3 is
  tagged Hybrid precisely because this repo has shipped a live-broken guard under a green suite.
- The plan is complete only when Gates A-F are all green and all 14 acceptance criteria hold.

## Test Infra Improvement Notes

(none identified yet)

## Validate Contract

Status: CONDITIONAL
Date: 24-08-26
date: 2026-08-24
generated-by: outer-pvl
supersedes: 2026-08-24 (outer-pvl) — pass 2 after the P1-P7 supplement; all seven pass-1 findings verified closed

Parallel strategy: sequential
Rationale: 4/7 signals (S2 auth surface, S6 high-risk class, S7 5+ files). Score says HIGH, but the fit rule wins: `services/complaints/index.ts` and the two route servers must change in one edit or `pnpm check` breaks between them (Dependencies and Sequencing). Parallel execution would create the overlapping-file conflict the strategy rules forbid. EXECUTE runs sequentially, one section at a time, on **opus**.

### Pass-1 findings — all seven verified CLOSED

| Pass-1 finding | Landed as | Verdict |
|---|---|---|
| F1 — Gate F unachievable (`format:check` fails on a "Not touched" file) | T30 (Touchpoints §7), steps 7b/7c, Gate A row in Phase Completion, Risks row, Verification Evidence row; file removed from "Not touched" (line 230 now lists only `complaints/+page.svelte` and `+layout.svelte`) | **CLOSED.** `pnpm prettier --version` → 3.9.4, so the binary resolves through pnpm; `pnpm prettier --check "src/routes/(app)/complaints/[id]/+page.svelte"` still reports that one file, confirming it is the only blocker and step 7b targets exactly it. |
| F2 — Gate E preconditions absent, wrong seed named | Step 24b (5 ordered commands), Verification Evidence precondition block, Manual Verification Script preamble, Dependencies and Sequencing bullet | **CLOSED.** Order is correct (`./start.sh` → `db:push` → `prisma generate` → `db:seed:e2e` → `dev`). `pnpm db:seed:e2e` is genuinely the right script: `prisma/seed.ts` imports and calls `seedProd` only; `prisma/seed-e2e.ts` is the `db:seed:e2e` entry and `seedE2E` (`seed-core.ts:672`) creates `verifier@veent.ph` (`:679`), `manager@veent.ph` (`:742`) and `employee@veent.ph` (`:773`). The DROP-abort rule is carried into 24b step 2. |
| F3 — `HrComplaint` missing from the audit-log `entityTypes` allow-list | T29 (Touchpoints §6), step 21b, test N16, Verification Evidence row, Risks row, Acceptance criterion 12, Blast Radius "unlisted reader, now listed" bullet | **CLOSED.** `tests/unit/audit-log-reveal.test.ts:37` really does `await import('../../src/routes/(app)/reports/audit-log/+page.server')` and destructure `{ load, actions }`; `:102` is the `loadData` helper. N16 is writable there as one added assertion. |
| F4 — N15 proved nothing about the route | N15 moved to `complaints-scoping.test.ts`, route-level, two-role actor `['HR_ADMIN','MANAGER']`, deep-equal assertion, paired mutation, plus a "Why N15 moved" rationale block and a Risks row | **CLOSED.** The pairing is stated as two recorded results ("N15 must go RED *while `pnpm check` stays GREEN*. Record **both halves**"), and Phase Completion's Gate D row repeats it. A two-role actor is a valid shape: `User.roles` is `Role[]` and `verifier.approver@veent.ph` (`seed-core.ts:721-730`) is a real two-hat account, so multi-role is not a synthetic fixture. |
| F5 — T9 precedence widened instead of intersecting | T9 rewritten to keep `employeeId` and add a separate `AND: [{ employeeId: { in: … } }]`, plus a T9-note rationale row, test N17, Risks row, Verification Evidence row | **CLOSED — and the Prisma shape is VALID.** Verified by typechecking the exact T9 shape against the real `Prisma.HrComplaintWhereInput` (`tsc --noEmit --strict`, exit 0, scratch file deleted, tree clean). Top-level keys are implicitly ANDed and `AND` is the documented explicit combinator, so the same field in both positions intersects rather than merging or being rejected. Residual noted as G6. |
| F6 — `[]` allow-list case unpinned | N13-empty and N14-empty added, each with the `?.length` refactor as its mutation (M-N13c, M-N14b), plus a Risks row and a Verification Evidence row | **CLOSED.** The `[]`-is-truthy reasoning and the `requests-read-scoping.test.ts:11-14` citation are both carried into the matrix. |
| F7 — `ComplaintFilters` mislabelled public | Public Contracts row annotated "internal type, not exported" with the `index.ts:37` citation | **CLOSED.** |

### Net gate derivation

| Layer 1 dimension | Status |
|---|---|
| Infra fit | PASS — Gate E preconditions now correct, ordered and owned |
| Test coverage | **CONCERN** — G1 (mock conflict), G5 (mutation ids), G6 (residual) |
| Breaking changes | PASS |
| Security surface | PASS — the two-arm rule, the intersection fix and the audit-log reader are all now covered |

| Layer 2 section | Status |
|---|---|
| Decision 1 — two-arm admission rule | PASS (unchanged from pass 1, re-verified) |
| Decision 2 — Hybrid tier | PASS |
| Touchpoints 1 — service (T1-T9) | PASS |
| Touchpoints 2 — list route (T10-T18) | PASS |
| Touchpoints 3 — `[id]` route (T19-T26) | PASS |
| Touchpoints 4 — `complaints.test.ts` (T27, T28) | **CONCERN** — G3 |
| Touchpoints 5 — new test file (N1-N17) | **CONCERN** — G1 |
| Touchpoints 6 — audit-log route (T29) | PASS |
| Touchpoints 7 — prettier (T30) | PASS |
| Implementation Checklist ordering | **CONCERN** — G2, G7 |
| Blast Radius / counts | **CONCERN** — G4 |
| Gate A-F definitions | **CONCERN** — G7 |

**Totals: 0 FAILs / 7 CONCERNs / 12 PASSes**

**→ Net Gate: CONDITIONAL**

Every pass-1 blocker is closed. The seven remaining items are all mechanical: one is a real
feasibility conflict inside the new test file (G1) with two in-repo precedents for the fix, and
six are bookkeeping defects that would each cost EXECUTE a stall. None changes a design decision.
Proceed to EXECUTE with the conditions below on record.

---

### Pass-2 findings, in priority order

| # | Finding | Severity | Evidence | Exact remediation, and where EXECUTE applies it |
|---|---|---|---|---|
| G1 | **N13 / N13-empty contradict N17 inside the same test file.** N13 and N13-empty assert on the `countComplaintsForOrg` / `listComplaintsForOrg` **service mocks** ("assert both mocks received `filters.employeeIds === ['emp-a']`"), which requires `vi.mock('$lib/server/services/complaints', …)`. But N17 calls the **real** `listComplaintsForOrg('org1', {…})` to inspect the built `where`, and N2-N12 all need the real `openComplaint` / `getComplaint` / `resolveComplaint`. `vi.mock` is file-scoped and hoisted — a whole-module mock breaks fourteen tests, no mock breaks two. As written the file cannot be authored. | **CONCERN (highest)** | Plan Test Matrix N13 (line 385), N13-empty (386) vs N17 (389); all three are assigned to `tests/unit/complaints-scoping.test.ts`. `grep -rn "vi.mock('\$lib/server/services/complaints'" tests/` → no existing file does this. | **Preferred (Option A):** do NOT mock the complaints service at all. Re-target N13 and N13-empty at the **db mock** — assert `dbMock.hrComplaint.findMany.mock.calls[0][0].where` and `dbMock.hrComplaint.count.mock.calls[0][0].where` both carry `AND: [{ employeeId: { in: ['emp-a'] } }]` (and, for N13-empty, `in: []`). This proves strictly more than the plan's version — it proves the filter reaches the query, not merely that the route handed it over — and it obeys the plan's own Mock-discipline rule. Two consequences EXECUTE must handle: the new file's `dbMock` needs `hrComplaint: { …, count: vi.fn() }`, and `count` must `mockResolvedValue(0)` in `beforeEach` or `paginate(url, total)` receives `undefined`. **Fallback (Option B):** partial-mock via `vi.mock(mod, async (importOriginal) => ({ ...(await importOriginal()), listComplaintsForOrg: vi.fn(), countComplaintsForOrg: vi.fn() }))` — exact in-repo precedent at `tests/unit/payroll-read-scoping.test.ts:47-48` (itself a scoping test) and `tests/unit/attendance-backlog-rbac.test.ts:30-31`. **Applies at: Implementation Checklist step 22.** |
| G2 | **Step 21b is assigned to two different sections.** The Implementation Checklist places 21b under the **Section D** heading and after **Gate C** (step 21); Phase Completion Rules says Section **C** is "steps 13-**21b** written" and Section D is "steps 22-23b". So 21b is inside C per one table and inside D per the other, and it cannot be part of C while sitting after C's gate. | **CONCERN** | Plan lines 328 (Gate C = step 21), 332-333 (21b under "Section D — prove the guards"), 700-701 (Phase Completion: C = "steps 13-21b", D = "steps 22-23b"). | Pick one. Simplest: change the Phase Completion Section C row to "steps 13-**21**" and the Section D row to "steps **21b**-23b". Alternatively renumber 21b → 20b and move it above Gate C. Either is fine; leaving both is not. **Applies at: before Section C closes.** |
| G3 | **T28 cites a touchpoint that does not exist and its stated purpose is now stale.** T28 says the `writeAuditLog` mock must become "a hoisted, inspectable `writeAuditLogMock` **so T33 can assert on its arguments**". Touchpoints run T1-T30 — **there is no T33**. The consumer it meant is N15, which P4 moved out of `complaints.test.ts` into `complaints-scoping.test.ts`. So the inspectable mock is now needed in the **new** file, and the plan never says to create it there. | **CONCERN** | Plan line 196 (T28, "T33"); line 335 (N15 relocated); line 395 (N15 asserts `writeAuditLogMock.mock.calls[0][0].actorRoles`); §5 template list (200-211) never mentions a `writeAuditLog` mock. | Two edits. (a) In T28, delete "so T33 can assert on its arguments" — the `writeAuditLog` half is now optional in `complaints.test.ts`; the `employee-access` half is **still mandatory** there, because the service will call `assertCanTouchEmployee` and the six existing tests in that file break without the mock. Keep that half and say so. (b) Add to §5's template list: `complaints-scoping.test.ts` must hoist `writeAuditLogMock` and `vi.mock('$lib/server/audit', () => ({ writeAuditLog: writeAuditLogMock }))` — N15 depends on it. **Applies at: Implementation Checklist steps 22 and 23.** |
| G4 | **Two stale counts survive the supplement.** Rollback still says "every change is confined to **5 files**"; Blast Radius correctly says **7**. And the TL;DR says "**18** new tests"; the matrix has **19**. | **CONCERN** | Plan line 639 ("confined to 5 files") vs line 251 ("Files changed: 7"). Test count: N1-N17 = 17, plus N13-empty and N14-empty = **19**; TL;DR line 26 says 18. | Rollback → "confined to 7 files (5 source, 2 test) plus 1 new test file". TL;DR → "19 new tests". Cosmetic but the Rollback number is the one an agent reads under pressure. **Applies at: plan text only, no EXECUTE action.** |
| G5 | **The mutation-id scheme is not exhaustive, but Gate D requires recording each mutation by name.** N14's primary mutation has no id while its sibling is "M-N14b" (so there is a M-N14b with no M-N14a). N2-N12 and N16 mutations are described in prose with no id at all. Gate D says "every mutation **M-N1 … M-N17**", a range that does not obviously enumerate M-N13a / M-N13b / M-N13c / M-N14b / M-N16. | **CONCERN** | Plan lines 385-389 (M-N13a/b/c, M-N14b, M-N17 have ids; N14's primary does not), 374-384 and 410 (no ids), 340-342 and 701 (Gate D wording). | Give every mutation an id: M-N1 … M-N12, M-N13a/b/c, M-N14a/b, M-N15, M-N16, M-N17 — **20 mutations**. Change Gate D and the Phase Completion Section D row to "all **20** mutations, each recorded RED by id". A named list is what makes "a mutation left unrun blocks completion" enforceable. **Applies at: Gate D.** |
| G6 | **T9's `AND` idiom has no precedent in this repo and no gate proves its SQL.** It is correct and it type-checks, but every proof of it is object-level. | **CONCERN (named residual)** | `grep -rn "AND: \[" src/lib/server/ src/routes/` → **zero hits**; this is the first use in the codebase. Type validity confirmed: the exact T9 shape assigns cleanly to `Prisma.HrComplaintWhereInput` under `tsc --strict` (exit 0). N17 asserts the **built `where` object**, per the plan's own Mock-discipline rule — not the emitted SQL. Gate E never reaches it because `filters.employeeId` has zero callers. | Accept as a documented residual — the path is unreachable in production today, so there is nothing live to break. Record it in the EXECUTE report under "What this coverage does NOT prove". Do **not** add a DB integration test for it. Note the alternative EXECUTE may NOT take unasked: deleting the dead `filters.employeeId` field would remove the collision entirely with less code, but that is a scope change and needs a decision, not a silent edit. **Applies at: EXECUTE report only.** |
| G7 | **Gate A is defined twice with different contents, and step 7c's stop-rule has a hole.** Checklist step 8 defines Gate A as `prisma generate && check` + `test`; the Phase Completion Section A row defines it as those **plus `format:check`**. Separately, 7c says "if it now flags a file you did **not** touch, stop and report" and never says what to do when it flags a file you **did** touch. | **CONCERN** | Plan line 301 (step 8) vs line 698 (Phase Completion Section A row); lines 299-300 (7c) and 714-715 (the Gate F restatement). | Add `pnpm format:check` to checklist step 8 so both definitions match. Add to 7c and to the hard rule at 714: "if it flags a file you **did** touch, prettier-write that file and re-run; only an untouched file is a stop-and-report." **Applies at: Gate A and Gate F.** |

### Straight answers to the four pass-2 questions

**1. Collisions, duplication, and wiring — mostly coherent; three defects (G2, G3, G5).**
No new item duplicates or contradicts an existing one. Numbering is unique: touchpoints run T1-T30
with no gaps or reuse, tests run N1-N17 plus the two `-empty` suffixes. T29 (audit-log) and T30
(prettier) each get their own Touchpoints subsection, their own checklist step, their own Risks row
and their own Acceptance-Criteria clause (12). Wiring audit, per item:

| New item | Touchpoints | Impl. Checklist | Test Matrix | Verification Evidence | Phase Completion | Risks |
|---|---|---|---|---|---|---|
| T29 (`HrComplaint` in `entityTypes`) | §6 | 21b | via N16 | via N16 row | Gate D (as 21b — see G2) | yes |
| T30 (prettier) | §7 | 7b, 7c | n/a | `format:check` row | Section A row + Gate A + Gate F | yes |
| N16 | §5 exclusion noted | 23b | own table | own row | Gate D | via T29 row |
| N17 | — | 22 | own row | own row | Gate D | yes |
| N13-empty | — | 22 | own row | shared row with N13/N14 | Gate D | yes |
| N14-empty | — | 22 | own row | shared row with N13/N14 | Gate D | yes |

The three defects: step 21b belongs to two sections at once (**G2**); T28 points at a non-existent
T33 and its consumer has moved (**G3**); the mutation ids Gate D demands by name are not exhaustive
(**G5**).

**2. Gate A order — achievable, and yes a later section can reintroduce a formatting failure, but the plan already handles it.**
Section A ends with 7b (prettier-write the one offending file) then 7c (`format:check` → 0), and
`pnpm prettier --version` → 3.9.4 confirms the command resolves. Sections B-D then write a brand-new
test file and edit four more files, any of which can be non-prettier-clean — so Gate A's green is not
durable. The plan covers this: Gate F re-runs `format:check`, and the hard rule at line 714 states
"`pnpm format:check` **runs LAST** in Gate F". That is the correct placement and it is stated. The
only gap is G7 — Gate A's two definitions disagree about whether `format:check` is part of it, and
7c's stop-rule does not say to simply fix a file you did touch.

**3. Adding `'HrComplaint'` to `entityTypes` — PASS, no unconsidered effect.**
The array has exactly one consumer: `src/routes/(app)/reports/audit-log/+page.svelte:75`,
`{#each data.entityTypes as et (et)}`, which renders filter-dropdown `<option>`s. It drives **no
query**: the actual filter at `+page.server.ts:25` is `...(entityType && { entityType })` where
`entityType` comes straight from `url.searchParams.get('entity')` (`:15`) and is never validated
against the array — so `?entity=HrComplaint` already works today, unlisted. It drives **no
authorization**: the only auth on that page is `canReveal: isSuperAdmin` (`:91`) and the `reveal`
action's own re-check. Adding one string adds one dropdown option and nothing else. Confirmed by
`grep -rn "entityTypes" src/ tests/` — two hits total, the definition and the `{#each}`.

**4. File count — Blast Radius is correct at 7; one stale "5" survives (G4).**
7 = `services/complaints/index.ts`, `complaints/+page.server.ts`, `complaints/[id]/+page.server.ts`,
`reports/audit-log/+page.server.ts`, `complaints/[id]/+page.svelte`, `tests/unit/complaints.test.ts`,
`tests/unit/audit-log-reveal.test.ts` — plus the new `tests/unit/complaints-scoping.test.ts`. The
TL;DR ("four source files … plus three test files") agrees. **Rollback line 639 still says "confined
to 5 files"** — the only surviving stale count, plus the TL;DR's "18 new tests" against an actual 19.

### Re-verified from pass 1 (unchanged, still PASS)

- **Two-arm admission rule.** `employee-access.ts:39` org-wide short-circuit, `:48` self, `:50-57`+`:70` reports regardless of role, `:52-56`+`:70` branch staff. `rbac.ts:26` vs `:36` makes MANAGER the only role in the constrained arm. No over-restriction: a MANAGER who is the subject passes the self clause; a CEO/SUPER_ADMIN with no `Employee` row short-circuits at `:39` before the fail-closed `:47`.
- **`listVisibleEmployeeIds`.** `null` = unrestricted (`:84`); array = exact allow-list, possibly `[]` (`:90`, `:117`). `[]` is truthy, so the filter is emitted and matches nothing — fail-closed, now pinned by N13-empty/N14-empty.
- **The `.catch(() => null)` at `[id]:41` is the only swallow.** `load` has no catch; the other three catches preserve `isHttpError(e).status`.
- **Callers.** Exactly three importers of the complaints service, all under `src/routes/(app)/complaints/` and `tests/unit/`. Nothing in `scripts/` or `prisma/`.
- **`load`-testing precedent.** `requests-read-scoping.test.ts:45` (a `listVisibleEmployeeIds` scoping test invoking a route `load` ten times) plus five other files. `./$types` is type-only and erased.
- **Baselines.** `pnpm test` = 153 files / 1713 tests green. `pnpm check` = 12 errors, at exactly the line numbers Section A names. `pnpm lint` = 0 errors, 1 pre-existing a11y warning. `pnpm format:check` = 1 failing file, the one T30 targets.

### Execute-agent instructions (mandatory)

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | Run sequentially, one section at a time. `services/complaints/index.ts` and both route servers must change in one edit within Section C — `pnpm check` breaks between them. | Section C entry |
| E2 | **G1 — do not mock `$lib/server/services/complaints` in `complaints-scoping.test.ts`.** Re-target N13/N13-empty at `dbMock.hrComplaint.findMany.mock.calls[0][0].where` and `dbMock.hrComplaint.count.mock.calls[0][0].where`. Add `count: vi.fn()` to the `hrComplaint` db mock and `mockResolvedValue(0)` it in `beforeEach`, or `paginate(url, total)` gets `undefined`. If you must mock, partial-mock via `importOriginal` per `tests/unit/payroll-read-scoping.test.ts:47-48`. | Step 22 |
| E3 | **G3 — the new file needs its own hoisted `writeAuditLogMock`** plus `vi.mock('$lib/server/audit', …)`; N15 asserts on it. Keep T28's `employee-access` mock in `complaints.test.ts` — the six existing tests there break without it once the service calls `assertCanTouchEmployee`. Ignore T28's reference to "T33"; no such touchpoint exists. | Steps 22, 23 |
| E4 | **G5 — enumerate all 20 mutations by id** (M-N1…M-N12, M-N13a/b/c, M-N14a/b, M-N15, M-N16, M-N17) and record RED/GREEN for each in the EXECUTE report. A GREEN mutation blocks the section. Restore with `cp` from the scratchpad — **never** `git checkout <file>`. | Gate B, Gate D |
| E5 | **M-N15 is paired**: N15 RED **and** `pnpm check` GREEN under the same mutation. Record both. If `pnpm check` goes red you deleted the field instead of narrowing it — narrow, do not delete. | Gate D |
| E6 | **G2 — resolve step 21b's section before closing Section C.** Treat 21b as the first step of Section D (do it, then write N16 at 23b). Do not let Gate C wait on it. | Gate C → Section D |
| E7 | **G7 — `pnpm format:check` in Gate A too.** If it flags a file you touched, prettier-write that file and re-run. Only an **untouched** file is stop-and-report. Never blanket-run `pnpm format`. | Gate A, Gate F |
| E8 | **Gate E preconditions (step 24b) run after Gate C, in order.** `./start.sh` → `pnpm db:push` (**abort on any proposed `DROP`**) → `pnpm prisma generate` → `pnpm db:seed:e2e` (**not** `pnpm db:seed`) → `pnpm dev`. Gates A-D need none of it. | Gate E entry |
| E9 | **G6 — record the `AND` residual** in the EXECUTE report: first use of `AND: [...]` in this repo, type-verified but not SQL-verified, path unreachable today. Do **not** delete the dead `filters.employeeId` field to simplify it — that is a scope change requiring a decision. | EXECUTE report |
| E10 | Do not "improve" the cherry-picked Svelte UI beyond T30's prettier write. No logic, markup or copy changes. Do not fix the stale comment at `prisma/seed-core.ts:676`. | Throughout |

### Backlog artifacts

| Artifact | Location | What it tracks |
|---|---|---|
| `complaints-e2e-spec_NOTE_24-08-26.md` | `process/general-plans/backlog/` | No Playwright spec for the complaints surface; Gate E covers it manually |
| `hr-complaint-org-relation_NOTE_24-08-26.md` | `process/general-plans/backlog/` | `HrComplaint.organizationId` is a bare scalar with no relation (SPEC out-of-scope) |
| `complaints-audit-in-transaction_NOTE_24-08-26.md` | `process/general-plans/backlog/` | `writeAuditLog`/`notify` outside the `$transaction` (SPEC out-of-scope) |
| `seed-core-verifier-comment_NOTE_24-08-26.md` | `process/general-plans/backlog/` | Stale comment at `prisma/seed-core.ts:676` |
| `complaint-filter-intersection-sql_NOTE_24-08-26.md` | `process/general-plans/backlog/` | G6 — the `AND` intersection is type-verified but never SQL-verified; revisit when `filters.employeeId` gets its first caller |

---

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| SPEC 1 | org-wide role opens against any employee | Fully-Automated | `pnpm test` — N2 + existing open test | B |
| SPEC 2 | MANAGER opens against a direct report | Fully-Automated | `pnpm test` — N3 | B |
| SPEC 3 (a-d) | MANAGER refused 403 on open / load / reply / resolve | Hybrid | `pnpm test` — N4, N6, N7, N8 (+ N5, N9 ordering); live half: step 24b preconditions then Manual Verification Script steps 6-12 | B |
| SPEC 4 | subject sees own thread only; no supervisor widening | Fully-Automated | `pnpm test` — N10, N11, N12 | B |
| SPEC 5 | nothing crosses organizations | Fully-Automated | `pnpm test` — N1 + existing 404 test at `complaints.test.ts:74-80` | B |
| SPEC 6 | status ping-pong + notify | Fully-Automated | `pnpm test` — existing transition tests | A |
| SPEC 7 | resolved thread is terminal | Fully-Automated | `pnpm test` — existing resolved-reply test | A |
| SPEC 8 | `actorRoles` complete, not narrowed, on all three audit writes | Fully-Automated | `pnpm test` — route-level N15 (two-role actor, paired mutation) + `pnpm check` | B |
| SPEC 8 (support) | `HrComplaint` audit rows are filterable in the report | Fully-Automated | `pnpm test` — N16 in `tests/unit/audit-log-reveal.test.ts` | B |
| SPEC 9 | clean typecheck | Fully-Automated | `pnpm check` → 0 errors (currently 12) | B |
| SPEC 10 | suite stays green | Fully-Automated | `pnpm test` → 153 files + `complaints-scoping.test.ts` | B |
| SPEC 11 | no new notification surface | Fully-Automated | `pnpm test` — existing `notify()` assertions | A |
| list + dropdown scoping | both surfaces scoped to `visibleIds`, incl. fail-closed `[]` | Fully-Automated | `pnpm test` — N13, N13-empty, N14, N14-empty (**assert on the db mock — see E2**) | B |
| filter intersection | `employeeId` + `employeeIds` both apply | Fully-Automated | `pnpm test` — N17 | B |
| formatting | repo is prettier-clean | Fully-Automated | `pnpm format:check` exits 0 after step 7b | B |
| lint | eslint clean | Fully-Automated | `pnpm lint` exits 0 | A |
| `AND` intersection at SQL level | the two predicates really intersect in Postgres | — | none | **D — named residual (G6)** |

gap-resolution legend: A — proven now; B — fixed in this plan; C — deferred to a named later phase; D — backlog test-building stub.

C-4 reconciliation: `strategy:` carries only the 3 proving strategies. Known-Gap is a named residual row, never a strategy.

Legacy line form:
- complaints service (object admission): `Hybrid: pnpm test + live Gate E — precondition: ./start.sh, pnpm db:push, pnpm prisma generate, pnpm db:seed:e2e, pnpm dev`
- complaints routes (list + dropdown filtering, incl. `[]`): `Fully-automated: pnpm test`
- audit `actorRoles` carry-through: `Fully-automated: pnpm test (route-level N15) + pnpm check`
- audit-log report filterability: `Fully-automated: pnpm test (N16)`
- filter intersection (object level): `Fully-automated: pnpm test (N17)`
- typecheck / lint / format: `Fully-automated: pnpm check && pnpm lint && pnpm format:check`
- `AND` intersection at SQL level: `known-gap: documented — unreachable path, zero callers; revisit on first caller`
- e2e coverage of the complaints surface: `known-gap: documented — no Playwright spec; backlog note`

Failing stub (list scoping, N13-empty):
```
test("should keep the employeeIds filter present and empty when the actor sees nobody", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: fail-closed [] allow-list")
})
```

Failing stub (filter intersection, N17):
```
test("should apply both employeeId and the employeeIds allow-list", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: complaintWhere filter intersection")
})
```

Failing stub (audit-log filterability, N16):
```
test("should list HrComplaint among the audit-log filterable entityTypes", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: HrComplaint in entityTypes")
})
```

Failing stub (route-level actorRoles, N15):
```
test("should carry the actor's full role set into writeAuditLog from the route ctx", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: route-level actorRoles carry-through")
})
```

Dimension findings:
- Infra fit: **PASS** — step 24b now names the container start, the never-applied `db:push`, the DROP-abort rule, the correct `pnpm db:seed:e2e` (verified: `seed.ts` calls `seedProd` only; all three accounts are in `seedE2E`), and `pnpm dev`, in the right order, owned by the executing agent, with Gates A-D declared independent.
- Test coverage: **CONCERN** — the new file as specified cannot be authored, because N13/N13-empty want the complaints service mocked while N17 and N2-N12 need it real (G1); the mutation ids Gate D demands by name are not exhaustive (G5); the `AND` intersection is object-verified only (G6).
- Breaking changes: **PASS** — three importers, all in-tree; the one cross-feature reader (the audit-log `entityTypes` allow-list) is now listed as T29 and pinned by N16; adding to that array drives no query and no authorization.
- Security surface: **PASS** — the two-arm rule matches the SPEC clause for clause; the widening in the old T9 is fixed by an intersection that type-checks against the real Prisma input; the roster-leak surface (dropdown) is pinned including its fail-closed `[]` case.
- Implementation Checklist / gate definitions: **CONCERN** — step 21b belongs to two sections at once (G2), Gate A is defined twice with different contents and 7c's stop-rule has a hole (G7).
- Plan bookkeeping: **CONCERN** — Rollback still says 5 files against a Blast Radius of 7; the TL;DR says 18 new tests against 19 (G4); T28 cites a non-existent T33 (G3).

Open gaps:
- `AND` intersection at the SQL level: known-gap: documented — zero callers today, object-level proof only; see `process/general-plans/backlog/complaint-filter-intersection-sql_NOTE_24-08-26.md`
- No Playwright e2e spec for the complaints surface: known-gap: documented as NEW PLAN REQUIRED — see `process/general-plans/backlog/complaints-e2e-spec_NOTE_24-08-26.md`
- `HrComplaint.organizationId` has no relation: known-gap: documented as NEW PLAN REQUIRED — SPEC out-of-scope
- `writeAuditLog`/`notify` outside the `$transaction`: known-gap: documented as NEW PLAN REQUIRED — SPEC out-of-scope
- Branch-manager arm of `canTouchEmployee` unreachable live (Veent has no branches): known-gap: documented — stays pinned by `tests/unit/employee-access.test.ts` against a mocked DB
- Stale comment at `prisma/seed-core.ts:676`: known-gap: documented — cosmetic, explicitly out of this PR

What this coverage does NOT prove:
- `pnpm test` mocks Prisma, so **no unit test proves the SQL actually filters**. A wrong `where` faithfully recorded by the mock still passes. Only Gate E, on a real DB, proves the org and per-employee predicates reach Postgres — and Gate E only exercises the object-admission path, never the list `AND` intersection.
- **The `AND` intersection is proven only as an object.** N17 asserts the built `where`; nothing runs it. It is the first `AND: [...]` in this repo (`grep -rn "AND: \[" src/` → zero hits). It type-checks against `Prisma.HrComplaintWhereInput`, and the colliding shape type-checks too — so the type system is not what catches the widening; N17 is the only thing that does, and only at object level.
- `pnpm check` proves `actorRoles` is **present**, never that it is **complete**. `actorRoles: [user.roles[0]]` type-checks clean. Only route-level N15 with a two-role fixture closes that, and only for the three ctx literals it invokes.
- N4/N6/N7/N8 prove the status code an action or `load` returns; they do **not** prove the `[id]` page renders a readable 403 rather than a blank one.
- N13/N13-empty/N14/N14-empty prove what the query **asked for**, not what Postgres **returned**.
- N16 proves `'HrComplaint'` is in the dropdown list; it does **not** prove the resulting filtered query returns the complaint audit rows, because the audit-log `load` is db-mocked too.
- Gate E exercises exactly one out-of-scope target (Vince Verifier, EMP-901) and one in-scope target (Elena, EMP-004). It does **not** exercise the branch-manager arm — Veent is not a food-service org — nor the food-service tenants where a MANAGER's reach includes branch staff.
- Nothing covers concurrent replies to one thread, or a complaint whose employee is offboarded mid-thread.

Gate: **CONDITIONAL** (0 FAILs; 7 CONCERNs, all with exact remediations; G1/G2/G3/G5/G7 carried as mandatory execute-agent instructions E2/E6/E3/E4/E7, G4 as a plan-text correction, G6 as a named residual with a backlog note). Proceed to EXECUTE with these on record.

Accepted by: session (VALIDATE pass 2, after 1 plan-supplement cycle). Concerns accepted, each by name: G1 test-file mock conflict (mitigated by E2); G2 step-21b section ambiguity (E6); G3 stale T28 reference and relocated audit mock (E3); G4 stale file/test counts (plan text); G5 non-exhaustive mutation ids (E4); G6 `AND` intersection SQL-unverified (named residual + backlog note); G7 duplicate Gate A definition and 7c stop-rule hole (E7).

## Autonomous Goal Block

```
SESSION GOAL
Ship issue #112 (HR complaints / inquiries) on branch feat/hr-complaints-112: make the
cherry-picked commit 0223acf compile, add per-employee scoping on four surfaces, close the
org-scoping hole in listComplaintsForEmployee, carry a complete actorRoles into every audit
write, register HrComplaint in the audit-log filter list, and prove every guard with a
mutation-checked test.

CURRENT STATE
VALIDATE pass 2 returned CONDITIONAL. All seven pass-1 blockers are closed. EXECUTE may start.
Seven conditions ride along as execute-agent instructions E1-E10 in the Validate Contract.

WHAT MUST BE TRUE BEFORE EXECUTE MAY START
1. Working tree clean apart from the task folder; branch feat/hr-complaints-112 at 0223acf
2. Read the Validate Contract's execute-agent instruction table first - E2, E3, E4, E6 and E7
   change how the plan is carried out and the plan text still contradicts itself in those spots
3. Baselines confirmed this session: pnpm test 153 files / 1713 tests green; pnpm check 12
   errors; pnpm lint 0 errors; pnpm format:check 1 failing file
4. For Gate E only (not needed for Gates A-D): step 24b preconditions applied

AUTONOMY RULES
- Reversible and inside the 7 blast-radius files: act, then report.
- Apply the E1-E10 instructions without asking; they are documented remediations, not new design.
- Fix the plan-text bookkeeping (G4) in passing; it is stale, not contested.
- Never edit a file outside the blast radius without recording it as a touchpoint first.
- Never use git checkout <file> to undo a temp edit; copy to the scratchpad instead.
- Never add a Co-Authored-By trailer to a commit.

HARD STOPS
- pnpm db:push proposing any DROP -> abort, report drift.
- Any mutation that stays GREEN -> the test is vacuous; stop and rewrite it.
- format:check flagging a file you did NOT touch -> stop and report; never blanket-run format.
- Deleting the dead filters.employeeId field to simplify T9 -> scope change, ask first.
- Pushing the branch or opening a PR -> ask first.
- Skipping or downgrading Gate E -> forbidden; SPEC criterion 3 is Hybrid on purpose.

NEXT PHASE
EXECUTE -> EVL.

CONTRACT SUMMARY
Net gate CONDITIONAL. 0 FAILs / 7 CONCERNs / 12 PASSes, after 1 plan-validate-fix cycle.
Pass-1 F1-F7 all verified closed. New: G1 the new test file cannot be authored as written
(N13 wants the complaints service mocked, N17 needs it real - assert on the db mock instead);
G2 step 21b is in two sections; G3 T28 cites a non-existent T33; G4 stale counts; G5 mutation
ids not exhaustive; G6 the AND intersection is type-verified but never SQL-verified; G7 Gate A
defined twice.

EXECUTE START COMMAND (Gate A first)
Start at Implementation Checklist step 1 (Section A). Do not touch Section B before Gate A is
green, and Gate A now includes pnpm format:check.
```

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/hr-complaints-112_24-08-26/hr-complaints-112_PLAN_24-08-26.md`
2. **Last completed step:** PLAN written, VALIDATE run (BLOCKED), PLAN supplement P1-P7 applied.
   No code changed. Branch `feat/hr-complaints-112` at
   `0223acf`; the only working-tree change is this untracked task folder.
3. **Validate-contract status:** written, verdict **BLOCKED** (3 FAIL / 5 CONCERN / 7 PASS). This
   supplement applies remediations P1-P7. VALIDATE must be re-run from V1 before EXECUTE.
4. **Supporting context loaded:** `process/general-plans/active/hr-complaints-112_24-08-26/hr-complaints-112_SPEC_24-08-26.md`;
   `process/context/tests/all-tests.md`; `process/context/auth/all-auth.md` (via SPEC research);
   `CLAUDE.md`; and directly read: `src/lib/server/services/complaints/index.ts`,
   `src/routes/(app)/complaints/+page.server.ts`,
   `src/routes/(app)/complaints/[id]/+page.server.ts`,
   `src/lib/server/services/employee-access.ts`, `src/lib/server/services/types.ts`,
   `src/lib/rbac.ts`, `src/routes/(app)/+layout.svelte:165-195`,
   `tests/unit/complaints.test.ts`, `tests/unit/employee-reveal-access.test.ts`,
   `tests/unit/employee-access.test.ts`, `tests/unit/approval-queues.test.ts:30-70`,
   `prisma/seed-core.ts:735-800`, `src/routes/api/v1/_dev/login-as/+server.ts`,
   all `getByRole('link')` assertions under `tests/e2e/`.
5. **Next step for a fresh agent:** re-run VALIDATE from V1 against this plan. After VALIDATE, EXECUTE starts
   at Implementation Checklist step 1 (Section A) and must not skip Gate A before touching
   Section B.
