# PLAN — Collapse four authorization mechanisms to two (#282, then `User.role`)

Date: 2026-08-10
Branch: `refactor/rbac-simplification-282` (off `staging` @ `d0e5c33`)
Mode: RIPER-5 — PLAN complete, VALIDATE pending, EXECUTE not authorised.

---

## Problem

The authorization layer has FOUR overlapping mechanisms. Two answer "WHAT may you do",
two answer "WHO are you":

| # | Mechanism | Question | Live sites in `src/` |
|---|---|---|---|
| 1 | `ROLE_HIERARCHY` + `hasMinRole`/`hasAnyMinRole`/`requireAnyMinRole` (`src/lib/rbac.ts:16-39`) | "is your rank >= X?" | **66** (28 files) |
| 2 | `CAPABILITIES` + `can`/`canAny` (`src/lib/rbac.ts:53-175`) | "does your role hold capability X?" | ~88 |
| 3 | `User.role` (scalar) | identity | ~107 reads |
| 4 | `User.roles` (`Role[]`) | identity | ~174 reads — **dormant**, every writer sets one element |

Zero hardcoded role-list checks remain in `src/` (#279 cleaned those up).

Object-level access control already exists and is the answer to "WHOSE data":
`assertCanTouchEmployee` / `canTouchEmployee` (`src/lib/server/services/employee-access.ts`),
plus the `scopedToEmployee` actions wrapper (`src/routes/(app)/employees/[id]/+page.server.ts:390-401`).

### Target design

```
can(user, 'SOME_CAPABILITY')        // WHAT may you do
canTouchEmployee(user, employeeId)  // WHOSE data may you do it to
```

**Part 1 (#282)** — delete `ROLE_HIERARCHY` and the rank helpers; each of the 66 sites becomes a
capability check, an object-scope check, or both.
**Part 2** — delete the scalar `User.role`, keeping `User.roles: Role[]` as the single source of truth.

### Industry validation (research, 2026-08-10)

- Cerbos's **action-led** policy modelling ("focus on an action, list all roles that can perform
  it") is recommended exactly when actions are high-risk and roles have heavily overlapping
  capabilities. Both hold here. The existing `CAPABILITIES` table is already that shape — the
  comment at `rbac.ts:44-52` restates the same rationale, arrived at independently.
- Role hierarchy is NIST Hierarchical RBAC (RBAC1), designed for permission inheritance along org
  lines. This codebase does not use it that way: 4 of 9 roles sit at rank 0 off the ladder entirely
  and draw everything from the capability table (`rbac.ts:12-15` says so).
- The "WHOSE" check is industry-named a **derived role** (Cerbos) / **ReBAC**. Decision: keep the
  hand-rolled implementation — 9 roles, one relationship, one app; a policy engine
  (Cerbos/OpenFGA/Oso) earns its keep at 50+ roles and multi-service policy sharing. Adopt the
  vocabulary in doc comments only.
- The textbook `user_roles` junction table is **not** warranted: `Role` is a compile-time
  enum with no per-role metadata. A Postgres array column is correct.
- **Role explosion** is the named failure mode arguing against tenant-editable custom roles.
  Out of scope; see #283.

---

## Corrections to the original framing

**(a) The helper is `requireAnyMinRole`, not `requireMinRole`.** `requireMinRole` exists nowhere in
`src/` as code — only in doc comments (e.g. `src/lib/rbac.ts:23`,
`src/routes/(app)/employees/+page.server.ts:14`).

**(b) 66 live call sites, not ~20.** Verified: 61 `requireAnyMinRole(` + 5 `hasAnyMinRole(`,
excluding imports, comments, and `src/lib/rbac.ts` / `src/lib/server/rbac.ts` themselves.
28 files. This matches #282's own count. The earlier "~20" came from a grep for `requireMinRole`,
which does not match `requireAnyMinRole`.

**(c) THE KEY FINDING — every rank floor is set-identical to an existing capability.**

Only two floor values are ever passed: `'HR_ADMIN'` (54x) and `'MANAGER'` (13x). Per
`src/lib/rbac.ts:16-30`, `MANAGER = HR_ADMIN = CEO = 2`, `SUPER_ADMIN = 3`, all else `0`. Therefore:

```
clears 'MANAGER'  = {MANAGER, HR_ADMIN, CEO, SUPER_ADMIN}
clears 'HR_ADMIN' = {MANAGER, HR_ADMIN, CEO, SUPER_ADMIN}   <- identical
CAPABILITIES.MANAGE_HR (rbac.ts:55)  = ['MANAGER','HR_ADMIN','SUPER_ADMIN','CEO']  <- identical
CAPABILITIES.VIEW_TEAM (rbac.ts:77)  = ['MANAGER','HR_ADMIN','SUPER_ADMIN','CEO']  <- identical
```

`tests/unit/employee-access.test.ts:60-67` already asserts this equality live.

**Consequence:** the mechanical conversion of all 66 sites is **provably zero behaviour change**,
and **no new capability is required**. The four genuine policy questions isolate into small,
individually-approvable commits instead of being smeared across 66 sites.

---

## 1. What gets deleted

| File | Lines | What |
|---|---|---|
| `src/lib/rbac.ts` | 12-39 | `ROLE_HIERARCHY`, `hasMinRole`, `hasAnyMinRole` (~28 lines) |
| `src/lib/server/rbac.ts` | 10, 14, 15 | three re-exports |
| `src/lib/server/rbac.ts` | 36-39 | `requireAnyMinRole` |

Net ~35 lines deleted from `$lib`; 66 call sites rewritten in place (same arity, same argument,
different function name). `requireAnyCapability` (`src/lib/server/rbac.ts:32`) and `canAny`
(`src/lib/rbac.ts:162`) already exist with matching signatures.

**No new helper layer, no `Scope` enum, no new abstraction, no new dependency.**

---

## 2. Every call site, classified

Legend: **W** = WHAT only; **O** = WHOSE already answered downstream (converts as WHAT, object
scope untouched); **!** = the rank floor is the *only* object gate (see §3).

### 2a. Pure WHAT — org-level configuration. `-> requireAnyCapability(..., 'MANAGE_HR')`. Exactly equivalent.

| file:line | floor | note |
|---|---|---|
| `src/routes/(app)/attendance/+page.server.ts:167,184,203,214,265,288,303` | HR_ADMIN | W. Same file already computes `canManage = canAny(user.roles,'MANAGE_HR')` at `:36` and gates the load on it. `unlock`/`unlockTeam` (`:232,:249`) already use `OVERRIDE_FINALIZED` — leave alone. |
| `src/routes/(app)/settings/schedules/+page.server.ts:13,31,67,79` | HR_ADMIN | W |
| `src/routes/(app)/settings/org/+page.server.ts:17,61,91,124` | HR_ADMIN | W (positions, org chart, salary grades) |
| `src/routes/(app)/settings/org-chart/+page.server.ts:7` | HR_ADMIN | W |
| `src/routes/api/v1/settings/org-chart/+server.ts:8` | HR_ADMIN | W — v1 twin |
| `src/routes/api/v1/settings/positions/+server.ts:9,23` | HR_ADMIN | W |
| `src/routes/api/v1/settings/positions/[id]/+server.ts:9,24` | HR_ADMIN | W |
| `src/routes/(app)/recruitment/+page.server.ts:17,46,68,89,119` | HR_ADMIN | W — job postings are org-level |
| `src/routes/(app)/benefits/+page.server.ts:16,51,76,106` | HR_ADMIN | W (plan CRUD + enrollment status). `:76` added per VALIDATE C1 — the original table listed three of four, leaving commit 7 deleting the helper with a live caller standing. `:76` converts to `MANAGE_HR` only; adding `canTouchEmployee` there is the separate out-of-scope item (§9-R10). |
| `src/routes/(app)/separations/+page.server.ts:10,37` | HR_ADMIN | W — see §9-R10 |
| `src/routes/(app)/separations/[id]/+page.server.ts:14,30,54` | HR_ADMIN | W |
| `src/routes/(app)/reports/+page.server.ts:14` | MANAGER | W -> `MANAGE_HR`. `:22` already narrows the *pay* report to `VIEW_PAY_ORGWIDE` (#249); HR reports stay org-wide for MANAGER deliberately. |

### 2b. WHAT, with WHOSE already enforced downstream. Convert as WHAT; do not touch the object check.

| file:line | floor | object check already running |
|---|---|---|
| `src/routes/(app)/employees/+page.server.ts:18` | MANAGER | `listVisibleEmployeeIds` `:35` -> `VIEW_TEAM` |
| `src/routes/(app)/employees/+page.server.ts:69` | MANAGER | `assertCanTouchEmployee` `:79` -> `MANAGE_HR` |
| `src/routes/(app)/employees/[id]/+page.server.ts:88` | MANAGER | `assertCanTouchEmployee` `:101` -> `VIEW_TEAM` |
| `src/routes/(app)/employees/[id]/+page.server.ts:421,483,509,558,579,597,615,633,652,671` | HR_ADMIN | all ten wrapped by `scopedToEmployee` (`:390-401`) -> `MANAGE_HR`. See §3-D. |
| `src/routes/api/v1/employees/+server.ts:12` | MANAGER | `listVisibleEmployeeIds` `:23` -> `VIEW_TEAM` |
| `src/routes/api/v1/employees/[id]/+server.ts:65` | MANAGER | `canTouchEmployee` `:78` -> `VIEW_TEAM`. Siblings at `:93,:230` already use `requireAnyCapability(...,'MANAGE_HR')`. |
| `src/routes/api/v1/requests/+server.ts:14` | MANAGER | `listVisibleEmployeeIds` + explicit id check `:27-34` (#275) -> `VIEW_TEAM` |
| `src/routes/(app)/team/+page.server.ts:10` | MANAGER | `listReportIdsFor` `:35-37`, gated on `ADMINISTER_HR_RECORDS` `:13` -> `VIEW_TEAM` |
| `src/routes/(app)/performance/+page.server.ts:24` | MANAGER | `listGoalsForManager(myEmployee.id)` `:46` self-scoped -> `VIEW_TEAM` |
| `src/lib/server/services/employees.ts:282` | HR_ADMIN | field-masking gate -> `canAny(opts.viewerRoles,'MANAGE_HR')`. Comment `:277-280` documents MANAGER is deliberately above this line. |

### 2c. WHAT, org-wide-for-MANAGER by deliberate prior decision. Convert as-is; do NOT narrow.

| file:line | floor | -> |
|---|---|---|
| `src/routes/(app)/timesheets/+page.server.ts:173,192,218` | HR_ADMIN | `MANAGE_HR` (matches `isHrAdmin` `:27`) |
| `src/routes/(app)/timesheets/+page.server.ts:317` | MANAGER | `VIEW_TEAM` (matches `isManager` `:26`) |
| `src/routes/api/v1/timesheets/+server.ts:11` | MANAGER | `VIEW_TEAM` |
| `src/routes/api/v1/timesheets/[id]/+server.ts:17` | MANAGER | `VIEW_TEAM`; per-record authority is the approval chain's |
| `src/routes/api/v1/timesheets/aggregate/+server.ts:24` | HR_ADMIN | `MANAGE_HR`; see §3-E |
| `src/routes/api/v1/leave/[id]/+server.ts:17` | MANAGER | `VIEW_TEAM`; stage authority is `decide()`'s |

> **`src/lib/server/services/timesheets.ts:100-116` is load-bearing.** It records a *deliberate
> reversal*: MANAGER was once narrowed to direct reports on timesheets and that was dropped on
> purpose, because it "failed outright for the many employees with no `reportsTo` set at all".
> Narrowing any timesheet site regresses that decision. Most likely place for a well-meaning
> reviewer to break something.

### 2d. ! The rank floor IS the object gate — three genuine leaks

| file:line | floor | what leaks today |
|---|---|---|
| `src/routes/api/v1/timesheets/[id]/punches/+server.ts:28` | HR_ADMIN | any MANAGER reads **any** employee's raw punches org-wide |
| `src/routes/(app)/performance/reviews/[id]/+page.server.ts:26` | HR_ADMIN | any MANAGER reads **any** employee's private review |
| `src/routes/api/v1/leave/[id]/+server.ts:38` | HR_ADMIN | any MANAGER may `override-approve` a leave request |

---

## 3. The decisions that change behaviour — each needs explicit user approval

> ### ✅ ALL FIVE DECIDED — 2026-08-11. EXECUTE is unblocked on decisions.
>
> | # | decision | resolution |
> |---|---|---|
> | 1 | `AuditLog.actorRole` (§5b) | **B3** — array-ify to `actorRoles Role[]`. **Plus:** tighten `employees.ts:1268`'s bare `include` to an explicit `select`, in the same commit. |
> | 2 | §3-A punches | **Fix** — replace the 12 hand-rolled lines with `canTouchEmployee`. |
> | 3 | §3-B review privacy | **B3** — `assertCanTouchEmployee(user, review.employee.id)`. Narrow-and-widen accepted knowingly (see C3 note in §3-B). |
> | 4 | §3-C leave override | **Narrow** to `ADMINISTER_HR_ORGWIDE`. |
> | 5 | §5c role picker | **(i)** `value={u.roles[0]}` + comment scoping it to the single-valued picker, revisit at #283. |
>
> **Re-verification done 2026-08-11 before these were taken** (method: enumerate every *read of the
> table*, inspect each projection — a name-grep cannot see a bare `include`):
> - `AuditLog` has **exactly four** production readers: `dashboard.ts:304`, `employees.ts:1268`,
>   `audit-log/+page.server.ts:36` and `:125`. Three use an explicit `select`; none selects
>   `actorRole`.
> - **`employees.ts:1268` uses a bare `include`**, so `actorRole` (plus `ipAddress`/`userAgent`) *is*
>   loaded into memory. It does not escape — the loop hand-builds `EmploymentHistoryEvent` objects
>   with no `...log` spread — but it is one careless refactor from becoming the #242 leak verbatim.
>   That is why the `select` fix is folded into decision 1 rather than filed.
> - Every other `actorRole` mention in `src/` (4 of them) is a **comment**. No `where`, no `orderBy`,
>   no raw SQL against `audit_logs`, no `/api/v1` audit route. **Write-only confirmed on evidence.**
> - `audit-log/+page.svelte:176` renders `{log.actor.role}` through the User *relation* — it shows
>   today's role on a year-old entry. B3 fixes this as a side effect; switch it to `actorRoles`.
> - **Write-site count corrected: 165, not ~120** — 103 in `src/`, 58 in `tests/`, 4 in `scripts/`,
>   0 in `prisma/`. All funnel through `AuditContext.actorRole` (`audit.ts:7`) → the single `create`
>   at `:31`. `ServiceContext` already carries `actorRoles?: Role[]` (`types.ts:9`, from #247), so
>   B3 finishes a half-done conversion rather than starting a new one.
> - **66 call sites re-confirmed:** 68 raw matches − 1 comment (`benefits.ts:138`) − 1 definition
>   (`src/lib/rbac.ts:37`). Note commit 7 spans **two** files: `ROLE_HIERARCHY`/`hasMinRole`/
>   `hasAnyMinRole` live in `src/lib/rbac.ts` (shared, client-reachable); `requireAnyMinRole` lives
>   in `src/lib/server/rbac.ts`.

Everything in §2 outside 2d is exactly equivalent. These are not.

### A. `punches/+server.ts:28` — CONFIRMED leak, recommend fixing

Current (`:26-37`) computes `isHrOrAbove = hasAnyMinRole(user.roles,'HR_ADMIN')` — which admits
MANAGER — and only falls through to a hand-rolled `isOwner || target.reportsToId === requester.id`
check when it is false. The route's own doc comment at `:10` says *"Access: the owner, the owner's
manager, HR_ADMIN, or SUPER_ADMIN."* The code admits every MANAGER to everyone.

**Proposed:** delete all twelve lines, replace with
```ts
if (!(await canTouchEmployee(user, employeeId))) return apiError(403, 'Insufficient permissions')
```

Behaviour delta:
- **Narrows** for MANAGER: no longer reaches a stranger's punches. <- the fix
- **Widens** for MANAGER: now reaches additional supervisees (#176) and branch staff, matching
  `/employees/[id]`. Consistency win.
- CEO/SUPER_ADMIN/HR_ADMIN unchanged (`ADMINISTER_HR_ORGWIDE` short-circuit, `employee-access.ts:43`).
- Plain EMPLOYEE with reports unchanged (`listReportIdsFor` covers it).

Net **-12 lines**, one existing helper.

### B. `performance/reviews/[id]/+page.server.ts:26` — CONFIRMED leak, three options

Comment `:22-24`: *"A review is private to its two participants... HR may read any review in the
org."* Any MANAGER currently clears that floor.

| option | effect | net |
|---|---|---|
| B1 `requireAnyCapability(user.roles,'MANAGE_HR')` | status quo, leak preserved | 0 |
| B2 `requireAnyCapability(user.roles,'ADMINISTER_HR_ORGWIDE')` | narrows; matches the comment exactly | 0 |
| **B3** `await assertCanTouchEmployee(user, review.employee.id)` | narrows to strangers, keeps a manager's own team | +1 import |

**DECIDED 2026-08-11: B3.** It is the object-level answer and preserves a real use case (a
department head reading their own report's review when someone else was the reviewer).

**VALIDATE C3 — disclosed before the decision was taken:** B3 is a narrow *and* a widen. Because
`canTouchEmployee` resolves supervisor and branch relationships, it admits EMPLOYEE-role supervisors
and branch managers who are 403'd today. B2 would have widened nothing. The widening is accepted
knowingly, on the grounds that it matches how `/employees/[id]` already scopes the same people.

### C. `api/v1/leave/[id]/+server.ts:38` — the error message contradicts the code

`requireAnyMinRole(user.roles,'HR_ADMIN')` with `catch { return apiError(403, 'override-approve
requires HR_ADMIN or higher') }`. The message is false: MANAGER clears it, and `override-approve`
bypasses the approval chain outright.

**Proposed:** `requireAnyCapability(user.roles,'ADMINISTER_HR_ORGWIDE')`. Narrows for MANAGER;
HR_ADMIN/CEO/SUPER_ADMIN unchanged. This is a WHAT question, not WHOSE — overriding a chain is an
authority level, not a data scope. No new capability needed.

Alternative if MANAGER should keep it: use `MANAGE_HR` and **fix the message**. Do not leave the
message as-is either way.

### D. `employees/[id]/+page.server.ts:481, 507` — comment-only; code must NOT change

```
:481  // #170: ... HR_ADMIN and up (a MANAGER may edit their reports' profile but must not move pay).
:507  // #222: ... Same HR_ADMIN+ gate as changeCompensation: it moves pay, so a MANAGER must not reach it.
```

Both statements are false as written — MANAGER clears both floors. **The system is nonetheless
correct**, because `proposeIfRequired` (`src/lib/server/services/employees.ts:691-712`) routes a
MANAGER's pay change through propose->confirm instead of writing it (#243).

**Action: convert both to `MANAGE_HR`, rewrite the two comments to name `proposeIfRequired` as the
actual control. Do NOT convert to `ADMINISTER_HR_ORGWIDE`** — that would 403 the MANAGER before
they can file a proposal, breaking maker-checker (#243) and killing
`tests/unit/pay-proposal-routing.test.ts`.

### E. `api/v1/timesheets/aggregate/+server.ts:17` — stale doc comment, no code change

`// Roles: HR_ADMIN, SUPER_ADMIN.` — actually admits MANAGER and CEO. Per §2c, narrowing regresses
`timesheets.ts:104-111`. **Fix the comment, convert to `MANAGE_HR`, change nothing else.**

---

## 4. `MANAGE_HR` vs `VIEW_TEAM` — naming, not behaviour

The lists are byte-identical today. Assigned above by *meaning* (read-a-team -> `VIEW_TEAM`;
administer-HR -> `MANAGE_HR`), which makes a future divergence a one-line edit rather than an audit.
`tests/unit/rbac.test.ts` pins both lists longhand and independently, so they cannot drift silently.

Collapsing `VIEW_TEAM` into `MANAGE_HR` would delete a further ~15 lines but destroys the ability to
express "sees a team but doesn't administer HR". **Recommend keeping both.**

---

## 5. Part 2 — the `User.role` -> `User.roles` collapse

### 5a. Where the scalar is read, by purpose

**Group 1 — authorization (~11 sites).** After Part 1 there are **zero** direct authorization reads
of `user.role`. What remains is the `AuditContext` fallback idiom, written identically in eleven
places:

```ts
const roles = ctx.actorRoles?.length ? ctx.actorRoles : [ctx.actorRole]
```

`action-proposals.ts:85` · `approvals.ts:31` · `attendance/index.ts:588` · `employees.ts:703` ·
`payroll/index.ts:547` · `payroll/loans.ts:42` · `payroll/periods.ts:308` · `payroll/runs.ts:94` ·
`requests/index.ts:18` · `settings/org.ts:242` · plus `employee-access.ts:36` (`rolesOf`, on
`EmployeeAccessActor.role`).

**Replacement:** make `AuditContext.actorRoles: Role[]` **required**
(`src/lib/server/services/types.ts:6-9`), delete `actorRole` from the interface, delete all eleven
fallbacks, delete `EmployeeAccessActor.role` (`employee-access.ts:29`) and `rolesOf` (`:36`).

This is the largest genuine deletion in the project and it turns an entire bug class (#247, #272,
#275 — "the route forgot `actorRoles`") into a **type error** rather than a silent narrowing.
Strongest argument for doing Part 2 at all.

**Group 2 — audit-log actor (~120 assignments).** `actorRole: user.role` feeding
`AuditLog.actorRole` (`prisma/schema.prisma:1361`, written at `src/lib/server/audit.ts:31`).

> **Critical finding: `AuditLog.actorRole` is WRITE-ONLY.** Nothing in `src/`, `tests/`, `scripts/`
> or `prisma/` ever reads it. The audit-log UI (`src/routes/(app)/reports/audit-log/+page.svelte:176`)
> renders `log.actor.role` — the User relation's *current* role, not the historical column. The
> historical value has never been surfaced.

This is the one and only place that would force a "primary role" ranking. See §5b.

**Group 3 — display labels (5 sites).**
- `src/routes/(app)/employees/[id]/+page.svelte:283` `{employee.user.role}` -> `roles.join(', ')`
- `src/routes/(app)/settings/roles/+page.svelte:123` `{u.role.replace('_',' ')}` -> map over `u.roles`
- `src/routes/(app)/settings/roles/+page.svelte:107` `value={u.role}` — **danger spot, §5c**
- `src/routes/(app)/reports/audit-log/+page.svelte:176` `{log.actor.role}` — depends on §5b
- `src/routes/(app)/+layout.svelte:92` `const role = $derived(data.user.role)` — no other use of
  `role` found in that file; everything below uses `roles`. **Verify, then delete the line.**

**Group 4 — role assignment (the real design work).** `src/lib/server/services/settings/org.ts`:
`listOrgUsers` `:153,:166`; `IRREPLACEABLE_ROLES` lookup `:202`; `assertNotLastOfRole` count `:217`;
`setUserRole` `:268,:279,:291`. Plus `src/routes/(app)/settings/roles/+page.server.ts:57` and
`src/routes/api/v1/settings/users/[id]/role/+server.ts:26,33`.

- `setUserRole:279` `data: { role: newRole, roles: [newRole] }` -> `data: { roles: [newRole] }`.
  **Keep the single-valued API** — widening it to a set is #283, not this.
- `assertNotLastOfRole` (`:198-226`) is the one place with genuine set semantics: it must check
  *each irreplaceable role being lost*, not `target.role`. Signature takes `roles: Role[]`; loop
  `for (const r of target.roles) if (IRREPLACEABLE_ROLES[r] && !newRoles.includes(r))`; the count at
  `:217` becomes `roles: { has: r }`. **Not a ranking** — per-role, which is why it is safe.
- Guard `:268` `if (newRole !== existing.role)` -> `if (!existing.roles.includes(newRole) || existing.roles.length > 1)`.
- Audit payload `:291` `oldValue: { role: existing.role }` -> `{ roles: existing.roles }`.

**Group 5 — seeding & scripts.** `prisma/seed-core.ts` (`backfillMembershipsAndRoles` `:13-27` —
**delete the `roles` half entirely**; `role:` writes at
`:208,213,264,446,472,477,510,515,524,529,683,688,694,699,728,759` -> `roles: ['X']`),
`src/lib/server/services/employees.ts:480-481` (hire flow — drop the `role:` line, keep
`roles: [input.role]`), `scripts/promote-probationary.ts:39,133`, `scripts/prod-delete.ts:110`,
`scripts/seed-payslip-demo.ts:86`, `scripts/seed-separation-demo.ts:37,42`,
`scripts/seed-issues-demo.ts:60`. Queries become `roles: { has: 'X' }` / `roles: { hasSome: [...] }`.
**Delete `scripts/migrate-user-roles-backfill.ts`** — it repairs a desync that can no longer exist.

> `scripts/migrate-leave-to-request.ts:63,71` and `seed-issues-demo.ts:227,229` are
> `ApprovalStep.role` (schema `:837`), a different column. **Leave alone.**

**Group 6 — type plumbing.** `src/lib/server/auth.ts:17` (`role: attributes.role`), `:20` (the
`roles?.length ? ... : [attributes.role]` fallback — delete), `:37`
(`DatabaseUserAttributes.role` — delete). Then `src/routes/(app)/+layout.server.ts:17,42` and
`src/routes/(app)/dashboard/+page.server.ts:53` drop `role:` from the `countPendingApprovals`
argument and the returned user shape.

**Group 7 — dual-read queries that collapse.** Real simplification, two sites:
- `src/lib/server/services/action-proposals.ts:122-123`
  `OR: [{roles:{hasSome}}, {roles:{isEmpty}, role:{in}}]` -> `roles: { hasSome: [...roles] }`
- `src/lib/server/services/recruitment.ts:345`
  `OR: [{role:'HR_ADMIN'}, {roles:{has:'HR_ADMIN'}}]` -> `roles: { has: 'HR_ADMIN' }`

**Group 8 — tests.** 58 `actorRole:` occurrences and ~25 files constructing `{ role: ... }` mocks.
See §8c for why the compiler will NOT catch these.

### 5b. The one forced decision: `AuditLog.actorRole`

You cannot delete `User.role` without answering what feeds this non-nullable scalar column.

| | approach | verdict |
|---|---|---|
| B1 | `actorRole: user.roles[0]` | **Reject.** The back-door primary-role pick. Array order is not a policy. |
| B2 | Drop `AuditLog.actorRole` entirely | Shortest diff (~120 lines deleted, no column added). Destroys the role-held-at-the-time record. For a PH HRIS handling payroll and 201 files, compliance-relevant even though the UI never showed it. |
| **B3** | `actorRole Role` -> `actorRoles Role[]` | **Recommend.** Same ~120-site diff as B2, preserves history, more accurate than today for multi-role users. |

Under B3, `audit-log/+page.svelte:176` should switch from the relation (`log.actor.role`, which
shows *today's* role for a year-old event — arguably a latent bug) to `log.actorRoles.join(', ')`.

**DECIDED 2026-08-11: B3**, plus tightening `employees.ts:1268`'s bare `include` to an explicit
`select` in the same commit (fields the loop actually uses: `id`, `createdAt`, `action`, `oldValue`,
`newValue`, `actor.email` — six, so timeline output is unchanged). See the resolution block in §3.

### 5c. Ranking danger spots — where `ROLE_HIERARCHY` could return through the back door

1. **`AuditLog.actorRole`** — the primary one. Neutralised by B3.
2. **`src/routes/(app)/settings/roles/+page.svelte:107`** `<select value={u.role}>`. A single-valued
   `<select>` prefilled from a set requires picking one. **DECIDED 2026-08-11: (i)**
   `value={u.roles[0]}` with a comment that this holds *only* while the picker is single-valued
   (#283). Today `roles.length` is always 1, so (i) is behaviourally identical and the rejected
   alternative (leave unprefilled when `roles.length > 1`) is dead code.
3. **Any "show the user's role" label.** Must render the whole set, never "the highest". The
   `route-guard-multirole.test.ts` scan will not catch this.

---

## 6. Schema + migration

### 6a. Repo constraints (verified)

- No `prisma/migrations/` directory. `pnpm db:push` only.
- `scripts/prestart.sh` is the deploy sequence, run by `docker-compose.yml:57` and CI's
  `schema-upgrade` job. It runs `migrate-employment-type-regular.ts` then
  `prisma db push --skip-generate`. Established pattern: **destructive change -> idempotent raw-SQL
  script -> push.**
- `prisma db push` refuses/warns on dropping a populated `NOT NULL` column without
  `--accept-data-loss`. `prestart.sh:18` passes no such flag. **A naive push halts the deploy.**

### 6b. Proposed `scripts/migrate-user-role-to-roles.ts`

Follows `scripts/migrate-employment-type-regular.ts` exactly: existence-guarded, idempotent, no-op
on a fresh database, safe to run before every push forever.

```
1. if information_schema has no users.role column -> log "already migrated", return
     (idempotency + fresh-DB guard)

2. UPDATE "users" SET roles = ARRAY[role]::"Role"[]
     WHERE cardinality(roles) = 0 OR NOT (role = ANY(roles));
   -- superset of migrate-user-roles-backfill.ts's guard; runs #255's repair one last time

3. SELECT count(*) FROM "users" WHERE cardinality(roles) = 0;  -> if > 0, THROW
   -- never drop live authority; an empty roles set after the drop is an unrecoverable lockout,
   -- because assertNotLastOfRole cannot be satisfied

4. [only if AuditLog decision = B3]
   ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actorRoles" "Role"[] NOT NULL DEFAULT '{}';
   UPDATE "audit_logs" SET "actorRoles" = ARRAY["actorRole"]::"Role"[] WHERE cardinality("actorRoles") = 0;
   SELECT count(*) FROM "audit_logs" WHERE cardinality("actorRoles") = 0;  -> if > 0, THROW

5. ALTER TABLE "users"      DROP COLUMN IF EXISTS "role";
   ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "actorRole";
```

**Why step 5 lives in the script rather than being left to push:** the drop here means `db push` sees
nothing to drop, emits no data-loss warning, and `prestart.sh` needs no `--accept-data-loss`. That
flag, once added, silently permits *every future* destructive change — a permanent widening of blast
radius for a one-time need.

**Why step 4 must create the column itself:** the backfill must happen before the drop, and
`db push` does add-and-drop in one pass. Raw SQL is the only ordering that works — same reasoning as
`migrate-employment-type-regular.ts:53-54`.

### 6c. Wiring

Insert into `scripts/prestart.sh` **between** the employment-type rename and the push. Same comment
style, same idempotency rationale.

### 6d. Schema edits

- `prisma/schema.prisma:383-387` — delete the `role` line; rewrite the comment (`roles` is now simply
  *the* role set; the #133 backfill note is historical).
- `:1361` — `actorRole Role` -> `actorRoles Role[]` (or delete under B2).
- `:1502-1504` — the "role management edits `User.role`" comment needs correcting.

### 6e. Session invalidation

`src/lib/server/auth.ts` uses `PrismaAdapter(db.session, db.user)`; Lucia re-reads the user row on
every `validateSession`, so nothing role-shaped is cached in the session. Dropping the column should
not require a session flush. **Confidence high, but verify on staging before prod.**

---

## 7. Sequencing

**#282 first, then the `role` -> `roles` collapse.** Confirmed — but *not* for the originally
assumed reason. The assumption was "with rank gone, nothing forces a primary-role ranking"; in fact
all 66 rank floors already take `user.roles` (a set), so the rank helpers never force a primary role
either way. The real reasons:

1. **Diff hygiene.** 66 of the sites Part 2 must touch are in files Part 1 already rewrites. Part 1
   first means Part 2's diff contains only `.role` changes, so a reviewer of the far riskier half
   isn't reading 66 unrelated guard rewrites.
2. **The finish-line guard.** #282's "zero callers" scan test (§8b T1) is trivial to verify on a tree
   whose `.role` reads are untouched. Interleaving makes it a moving target.
3. **Part 1's classification is the audit trail Part 2 depends on.** Once §2 is committed, "does
   anything still authorize on a scalar?" is provably *no* — which is what licenses deleting the
   eleven `?? [actorRole]` fallbacks without re-deriving each one.

Commit sequence — **one PR, many commits** (house rule: do not split):

```
 1  rbac: convert org-config rank floors to MANAGE_HR (§2a - 30 sites, no-op)
 2  rbac: convert object-scoped rank floors (§2b - 20 sites, no-op)
 3  rbac: convert timesheet/leave rank floors (§2c - 6 sites, no-op) + fix stale comments (§3-C,E)
 4  fix: scope raw punch reads to the actor's team (§3-A)              <- behaviour change
 5  fix: keep performance reviews to participants and HR (§3-B)        <- behaviour change
 6  fix: restrict leave override-approve to org-wide HR (§3-C)         <- behaviour change [if approved]
 7  rbac: delete ROLE_HIERARCHY and the three rank helpers + guard test
 --- #282 complete, suite green, deployable ---
 8  schema: add AuditLog.actorRoles, migration script, prestart wiring
 9  refactor: AuditContext.actorRoles becomes required; delete 11 fallbacks
10  refactor: role assignment, seeds, scripts, display labels read roles
11  schema: drop User.role and AuditLog.actorRole
```

Commits 1-3 and 7 are green by construction (set-identical). 4-6 each carry their own new test.
8-11 must land together to stay green; 11 is schema-only and follows the script.

---

## 8. Test strategy

### 8a. Tests that must change

| file:line | change | why |
|---|---|---|
| `tests/unit/rbac.test.ts:8-10` | drop `hasMinRole`, `hasAnyMinRole`, `ROLE_HIERARCHY` imports | deleted |
| `tests/unit/rbac.test.ts:162-190` | **delete** the whole `describe('hasMinRole')` block | tests a deleted function |
| `tests/unit/rbac.test.ts:255-264` | delete the floor half of the one-element-equivalence loop; **keep the capability half** | that loop is #256's no-op proof, still load-bearing for `canAny` |
| `tests/unit/rbac.test.ts:232,242` | drop the two `hasAnyMinRole` assertions | |
| `tests/unit/employee-access.test.ts:3,60-67` | **rewrite, do not delete** — see below | encodes the whole trap |
| `tests/unit/route-guard-multirole.test.ts:77` | fixture string `hasAnyMinRole(user.roles,'HR_ADMIN')` -> `requireAnyCapability(user.roles,'MANAGE_HR')` | string literal; no compile error, but the doc would lie |
| `tests/unit/route-guard-multirole.test.ts:37,65,81` | **keep** the `ROLE_HIERARCHY[...]` pattern and fixtures | now guards against *reintroduction*. Cheap. |
| `tests/e2e/auth.spec.ts:44`, `tests/e2e/manager-org-wide-timesheets.spec.ts:11` | comment-only | |
| prose in `action-proposals.test.ts:102`, `employee-patch-authorization.test.ts:11-12`, `pay-proposal-routing.test.ts:15`, `self-action-guards.test.ts:9`, `requests-read-scoping.test.ts:7`, `benefits-enroll-scoping.test.ts:12` | comment-only; keep the history, note the mechanism is gone | **rewrite, never delete** — hard-won context |

**`employee-access.test.ts:60-67` rewrite.** It currently proves the empty set by computing
`clearsManagerFloor` from `ROLE_HIERARCHY`; after deletion that is unwriteable. State the claim
directly instead:
```ts
expect([...CAPABILITIES.MANAGE_HR].sort()).toEqual(['CEO','HR_ADMIN','MANAGER','SUPER_ADMIN'])
expect(CAPABILITIES.ADMINISTER_HR_ORGWIDE).not.toContain('MANAGER')
```
*Mutation it must kill:* adding `'MANAGER'` to `ADMINISTER_HR_ORGWIDE` (`rbac.ts:65`), which would
silently re-open the entire #228 hole via `employee-access.ts:43,88,180`.

### 8b. New tests

**T1 — the finish-line guard (#282 asks for this explicitly).** A `readdirSync` scan over `src/`,
modelled on `route-guard-multirole.test.ts:93-103`, asserting zero occurrences of
`ROLE_HIERARCHY|hasMinRole|hasAnyMinRole|requireAnyMinRole` outside whole-line comments. ~20 lines.
*Mutation killed:* reintroducing any of the four names anywhere in `src/`.

**T2 — punch access (§3-A).** New `tests/unit/punch-access.test.ts`, mocking `$lib/server/db` and
`listReportIdsFor` in the style of `employee-access.test.ts:14-22`. Assert: MANAGER **denied** a
stranger's punches; MANAGER **allowed** a report's; MANAGER **allowed** branch staff; owner allowed;
HR_ADMIN allowed without a team lookup.
*Mutations killed:* reverting the guard to `canAny(roles,'MANAGE_HR')` (stranger case fails);
deleting the guard entirely; swapping `canTouchEmployee` for `listVisibleEmployeeIds` truthiness
(`null` is falsy — a classic slip that would deny HR).

**T3 — review privacy (§3-B).** Extend `tests/unit/performance-redact.test.ts` or add a sibling: a
MANAGER who is neither subject nor reviewer gets 403 on a stranger's review; HR_ADMIN gets it; under
B3 the manager gets their own report's.
*Mutation killed:* `ADMINISTER_HR_ORGWIDE` -> `MANAGE_HR` at that line.

**T4 — leave override (§3-C, if approved).** MANAGER gets 403 on `override-approve`, 200 on plain
`approve`. The plain-approve half pins that the fix did not over-narrow.
*Mutation killed:* moving the override check outside the `action === 'override-approve'` branch.

**T5 — `setUserRole` writes only `roles` (Part 2).** Extend
`tests/unit/user-admin-self-guard.test.ts`. Assert the `tx.user.update` payload has no `role` key,
and that `assertNotLastOfRole` still 409s when the last active CEO's set would lose `CEO`.
*Mutations killed:* `roles: { has: r }` -> `roles: { hasSome: [r] }` in the holder count (counts the
wrong users); dropping the `!newRoles.includes(r)` guard (would 409 on a no-op re-save, which
`:262-266` exists to prevent).

**T6 — the scan gets stronger for free.** `route-guard-multirole.test.ts:26-27` currently carves out
`actorRole: user.role` as "not an authority decision". After Part 2 that carve-out is unnecessary —
**remove it and line 79's fixture**, and the scan then catches *any* singular `.role` read anywhere
in `src/lib` and `src/routes`. Strongest available pin on Part 2's completeness, and it costs a
deletion.

### 8c. Two coverage gaps

**~~The compiler will NOT find the test-side `.role` mocks.~~ FALSE — corrected by VALIDATE C2.**
`.svelte-kit/tsconfig.json` lists `../tests/**/*.{js,ts,svelte}` at **lines 43-45**, and
`tsc --listFiles` resolves 129 files under `/tests/`. **`pnpm check` DOES typecheck the suite**, so
making `actorRoles` required hard-errors at every one of the 58 `tests/` sites that still passes
`actorRole:`. The compiler is a safety net for Part 2, not a blind spot. Still sweep by grep as a
cross-check, but this is no longer the top risk — see §9.8, demoted.

**No e2e evidence.** Per #287 (`page.goto('/login')` 120s timeouts) nothing above depends on the e2e
suite. `tests/e2e/manager-org-wide-timesheets.spec.ts` is the only spec that directly exercises the
trap, and its value here is its comment, not its run.

**Migration script has no test precedent.** None of the seven existing `scripts/migrate-*.ts` has a
test. Recommend matching that precedent — the script's own step-3/step-4 count-and-throw assertions
are its verification. **Uncertain** whether to break precedent here.

---

## 9. Risks, unknowns, decisions

**Decisions needed before coding — ALL FIVE RESOLVED 2026-08-11 (see the block in §3):**
1. **`AuditLog.actorRole`** — **B3, array-ify**, + the `employees.ts:1268` `include`→`select` fold-in.
2. **§3-A punches fix** — **yes**, narrow for MANAGER.
3. **§3-B review privacy** — **B3**, object-scoped.
4. **§3-C leave override** — **narrow** to `ADMINISTER_HR_ORGWIDE`.
5. **§5c `settings/roles` `<select>` prefill** — **(i)** `roles[0]` + comment.

**Will fight you:**
6. **`--accept-data-loss`.** Mitigated by putting the DROP in the script (§6b step 5). Adding the flag
   to `prestart.sh:18` instead leaves it there forever, permitting every future destructive push.
7. **`timesheets.ts:104-116`.** Several sites *look* like they should be narrowed to a manager's
   reports; that was tried and reverted. Point any reviewer suggesting it at this comment.
8. ~~**Untypechecked tests** (§8c) — most likely source of a silently-wrong Part 2.~~ **DEMOTED —
   the premise was false (VALIDATE C2).** `pnpm check` does typecheck `tests/**`; the 58 stale
   `actorRole:` mocks will hard-error rather than silently pass.

**Adjacent, OUT OF SCOPE, file separately:**
9. `employees/[id]/+page.server.ts:597` (`endEarning`) and `:652` (`endDeduction`) take an
   *earning/deduction* id, not `params.id`. `scopedToEmployee` (`:390-401`) checks `params.id`, so it
   guards the wrong object; `endEmployeeEarning`/`endEmployeeDeduction` scope by `organizationId`
   only. IDOR-shaped gap. **Pre-existing; neither Part touches it.**
10. `benefits/+page.server.ts:76` (`enroll`) and `separations/+page.server.ts:37` (`create`) take an
    `employeeId` from the form with no `canTouchEmployee`. `benefits.ts:136-139` documents that the
    org check was deliberately put in the service; team-scoping was never added. Same shape as #275.
    Pre-existing.
11. `api/v1/leave/[id]` and `api/v1/timesheets/[id]` gate on `VIEW_TEAM`, which excludes
    `VERIFIER`/`APPROVER` — the sign-off roles cannot use the v1 twins of surfaces they can use in the
    UI. #247-family gap. `APPROVE_REQUESTS` would fix it but **widens access**, so `VIEW_TEAM` is kept
    for the no-op.

**Uncertain:**
12. Whether Lucia sessions survive the column drop cleanly (§6e) — high confidence yes, verify on staging.
13. Whether `+layout.svelte:92`'s `role` binding is genuinely unused. Grep says yes; confirm before deleting.
14. Exact size of the Part-2 `actorRole:` sweep — ~160 raw occurrences in `src/`, of which ~30 are
    `actorRoles` and 11 are the fallbacks; true assignment count near 120. Mechanical either way.

---

## Validate Contract

Status: CONDITIONAL
Date: 10-08-26
date: 2026-08-10
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 4/7 signals present (S2 auth surface, S6 high-risk class, S7 5+ files, S3 3+ decision branches) would normally recommend agent-team, but the validating agent had no Agent/Task tool available in this session — fan-out was structurally impossible. All Layer 1 dimensions and Layer 2 sections were executed sequentially in one context by direct source reads. Every finding below is backed by a file:line the validator personally read; no finding is inferred.

### Verdict on the central claim (§0c set-identity) — CONFIRMED

Independently re-derived, not taken from the plan:

- `grep -rhoE '(requireAnyMinRole|hasAnyMinRole|hasMinRole)\([^)]*\)' src/` yields exactly two floor literals across the whole tree: `'HR_ADMIN'` x54, `'MANAGER'` x13 (one of the 54 is the comment at `src/lib/server/services/benefits.ts:138`, giving 66 live sites). No third floor value exists. No multi-line call evades the regex (verified: zero matches for an unclosed call).
- `src/lib/rbac.ts:16-30` — `MANAGER: 2`, `HR_ADMIN: 2`, `CEO: 2`, `SUPER_ADMIN: 3`, all other five roles `0`. Therefore `clears('MANAGER')` = `clears('HR_ADMIN')` = `{MANAGER, HR_ADMIN, CEO, SUPER_ADMIN}`.
- `src/lib/rbac.ts:55` `MANAGE_HR = ['MANAGER','HR_ADMIN','SUPER_ADMIN','CEO']` — set-identical.
- `src/lib/rbac.ts:77` `VIEW_TEAM = ['MANAGER','HR_ADMIN','SUPER_ADMIN','CEO']` — set-identical.

**The claim holds exactly.** The mechanical conversion is zero behaviour change, and no new capability is required. §7's "commits 1-3 and 7 are green by construction" rests on solid ground.

### Test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| G1 | Every rank-helper name is gone from `src/` | Fully-Automated | new `tests/unit/rbac-no-rank-helpers.test.ts` (§8b T1 scan), `pnpm test` exits 0 | B |
| G2 | All 66 conversions compile and the suite still typechecks (src AND tests) | Fully-Automated | `pnpm check` exits 0 — baseline verified green today: 889 files, 0 errors | A |
| G3 | Converted guards preserve the exact admitted set | Fully-Automated | `pnpm test` — `tests/unit/rbac.test.ts` one-element-equivalence loop (capability half retained) + `tests/unit/employee-access.test.ts` rewritten §8a assertion | B |
| G4 | MANAGER cannot read a stranger's raw punches; can read a report's and branch staff's; HR unaffected | Fully-Automated | new `tests/unit/punch-access.test.ts` (§8b T2), `pnpm test` exits 0 | B |
| G5 | MANAGER cannot read a stranger's performance review; HR can | Fully-Automated | `tests/unit/performance-redact.test.ts` extension (§8b T3), `pnpm test` exits 0 | B |
| G6 | MANAGER gets 403 on `override-approve`, 200 on plain `approve` | Fully-Automated | new leave-override test (§8b T4), `pnpm test` exits 0 | B |
| G7 | Maker-checker survives: a MANAGER's pay change still routes to propose→confirm | Fully-Automated | existing `tests/unit/pay-proposal-routing.test.ts`, `pnpm test` exits 0 | A |
| G8 | `setUserRole` writes only `roles`; `assertNotLastOfRole` still 409s per-role | Fully-Automated | `tests/unit/user-admin-self-guard.test.ts` extension (§8b T5), `pnpm test` exits 0 | B |
| G9 | No site judges authority on a singular `.role` | Fully-Automated | `tests/unit/route-guard-multirole.test.ts` (carve-out removed per §8b T6), `pnpm test` exits 0 | B |
| G10 | Migration script is idempotent, no-ops on a fresh DB, and leaves no empty `roles` set | Hybrid | **✅ RUN AND PASSED 2026-08-11** — run twice at commit 8 (1405 audit rows backfilled, then a clean no-op) and twice again at commit 11 (both columns dropped, then a clean no-op). | B |
| G11 | `prestart.sh` completes without `--accept-data-loss` on a populated DB | Hybrid | **✅ RUN AND PASSED 2026-08-11** — run at commit 8 and again at commit 11; both ended "The database is already in sync with the Prisma schema", no data-loss warning, no flag added. | B |
| G12 | The three behaviour changes look right in the running app | Agent-Probe | **✅ RUN AND PASSED 2026-08-11** — 9 checks, each narrowing plus its negative control. See the G12 result block below. | C |
| G13 | Production migration against real audit-log volume | — | — | D |
| G14 | End-to-end browser coverage of the converted guards | — | — | D |

### G12 result — RUN 2026-08-11, PASSED (9/9)

Dev server on :5199, `_dev/login-as`, seeded probe rows marked `G12-PROBE`.

| probe | expect | got |
|---|---|---|
| MANAGER → stranger's punches | 403 | 403 `Insufficient permissions` |
| MANAGER → own report's punches | 200 | 200, rows carry `employeeId cms5ps4qs…`, ts `:01` |
| SUPER_ADMIN → stranger's punches | 200 | 200, rows carry `employeeId cms5ps3q7…`, ts `:47` |
| MANAGER → stranger's review | 403 | 403 (confirmed in-browser) |
| MANAGER → own report's review | 200 | 200, renders (confirmed in-browser) |
| SUPER_ADMIN → stranger's review | 200 | 200 (confirmed in-browser) |
| MANAGER → `override-approve` | 403 | 403 `override-approve requires org-wide HR (HR_ADMIN, CEO or SUPER_ADMIN)` |
| MANAGER → plain `approve` (own report) | 200 | 200 `{status: PENDING, currentStage: 1}` |
| HR_ADMIN → `override-approve` (stage 0) | 200 | 200 |

**Three traps hit while running it, all recorded so the next run doesn't repeat them:**

1. **`performance_reviews`, `requests` and `time_logs` were ALL empty for the probe targets.** The
   first punch run returned `200 {"data":[],"count":0}` — a pass that proves only "not refused". Rows
   were seeded with *distinguishable* values (Elena's punches at `:01`, Hannah's at `:47`) so the
   response identifies **whose** data came back, not merely that some did. This is the #275 vacuous-
   control lesson; assert the returned rows, never the status alone.
2. **The leave route is `PATCH`, and its `[id]` is a `Request` id, not a `LeaveRequest` id** — it
   routes through `decide()` on the unified requests table. A `POST` gives 405 and a `LeaveRequest`
   id gives 404 from inside the service; neither is an authorization verdict.
3. **A filer who holds the stage-0 role auto-clears it.** Hannah is HR_ADMIN, so her own filings land
   at `currentStage: 1` (VERIFIER) immediately, and any HR/admin probe against them returns
   `You cannot act on this stage` — a 403 from `decide()`, NOT from the #282 gate. Positive controls
   need a **fresh stage-0 request filed by a non-HR employee**.

**A plan premise falsified, out of scope, NOT acted on.** §3-C says `override-approve` "bypasses the
approval chain outright". It does not: the route maps both `approve` and `override-approve` to the
same `reviewLeaveRequest(..., approved: true, ...)` → `decide()` call, so the two actions are
identical apart from the capability gate. Proven by SUPER_ADMIN receiving `You cannot act on this
stage` on a stage-1 request. Pre-existing, unchanged by #282, and it does not affect the decision —
narrowing who may call the action is still right. Worth filing separately.

Failing stub (G1):
test("should find zero occurrences of ROLE_HIERARCHY|hasMinRole|hasAnyMinRole|requireAnyMinRole in src/", () => { throw new Error("NOT IMPLEMENTED — TDD stub: rank-helper finish-line scan") })

Failing stub (G4):
test("should deny a MANAGER a stranger's punches and allow a report's", () => { throw new Error("NOT IMPLEMENTED — TDD stub: punch access object-scoping") })

Failing stub (G5):
test("should deny a MANAGER a stranger's performance review", () => { throw new Error("NOT IMPLEMENTED — TDD stub: review privacy") })

Failing stub (G6):
test("should return 403 for a MANAGER on override-approve and 200 on approve", () => { throw new Error("NOT IMPLEMENTED — TDD stub: leave override narrowing") })

Failing stub (G8):
test("should write only roles in setUserRole and 409 on losing the last irreplaceable role", () => { throw new Error("NOT IMPLEMENTED — TDD stub: setUserRole roles-only write") })

Legacy line form (retained for existing validate-contract consumers):
- rbac conversion: Fully-automated: `pnpm check && pnpm test`
- punch / review / leave-override narrowing: Fully-automated: `pnpm test` (new T2/T3/T4)
- migration script: hybrid: `pnpm exec tsx scripts/migrate-user-role-to-roles.ts` run twice — precondition: local Postgres on 5434 up via `./start.sh`, seeded
- deploy sequence: hybrid: `sh scripts/prestart.sh` — precondition: populated local DB
- behaviour-change smoke: agent-probe: `_dev/login-as` MANAGER, three 403 probes
- production audit-log migration volume: known-gap: documented
- e2e browser coverage: known-gap: documented (#287 — `page.goto('/login')` 120s timeouts make e2e unusable as evidence)

### Dimension findings

- Infra fit: CONCERN — `scripts/prestart.sh:18` runs `prisma db push --skip-generate` with no `--accept-data-loss`, exactly as §6a claims (verified by reading the file). `scripts/migrate-employment-type-regular.ts` is a faithful precedent for §6b's shape (existence-guarded, idempotent, fresh-DB no-op, raw SQL to bypass the regenerated client). Two operational concerns remain: the unconditional `audit_logs` backfill (C8) and the single-column idempotency guard (C9).
- Test coverage: CONCERN — the plan's stated coverage gap (§8c) is factually WRONG in the plan's favour (C2): the suite IS typechecked. All §8a test line references verified accurate. Residual gaps are the migration script (no precedent test) and e2e (unusable per #287).
- Breaking changes: CONCERN — one public v1 API response shape changes without a stated decision (C5); one live call site is unenumerated and would break the build at commit 7 (C1).
- Security surface: CONCERN — all three claimed leaks CONFIRMED as real. One proposed fix (§3-B B3) carries an undisclosed widening (C3). No new hole is opened by any proposed change; §9.9/§9.10/§9.11 are neither broken nor worsened (verified).
- Section §1 (what gets deleted): PASS — `src/lib/server/rbac.ts:9-17` re-exports and `:36-39` `requireAnyMinRole` confirmed at the stated lines. Highest-risk edit: none; pure deletion.
- Section §2 (call-site classification): CONCERN — 65 of 66 sites enumerated; `benefits/+page.server.ts:76` missing (C1). Every spot-checked §2b downstream object check exists where claimed. Highest-risk edit: none once C1 is added.
- Section §3 (behaviour changes): CONCERN — A, C, D, E all confirmed correct. B carries an undisclosed widening (C3). Highest-risk edit: §3-B; mitigate by choosing B2 or by disclosing the widening before choosing B3.
- Section §5 (Part 2 enumeration): CONCERN — Groups 1-8 are directionally right but miss ~10 sites (C4, C5). Highest-risk edit: deleting `EmployeeAccessActor.role`; mitigated because the compiler catches every consequence.
- Section §6 (schema + migration): CONCERN — design sound and precedent-faithful; C8/C9/C10 are refinements, not redesigns. Highest-risk edit: §6b step 5's DROP; mitigate by running G10/G11 twice locally before any deploy.
- Section §7 (sequencing): CONCERN — the argument for #282-first is sound and the "green by construction" claim is verified. Two mechanical issues: C6 (commit-site counts contradict §2) and C7 (commit 7 is not atomic as written).
- Section §8 (test strategy): CONCERN — §8a verified accurate line-by-line; §8c's premise is false (C2).

### Findings

| # | Finding | Confidence | Severity | Proposed fix |
|---|---|---|---|---|
| C1 | `src/routes/(app)/benefits/+page.server.ts:76` (`enroll`) is a live `requireAnyMinRole(locals.user!.roles,'HR_ADMIN')` that appears in NO §2 conversion table. §2a lists benefits `:16,51,106` only. Enumerated total is 65, actual is 66. Commit 7 would delete the helper while this caller survives — build break. | CONFIRMED | CONCERN | Add `:76` to the §2a table as `-> MANAGE_HR` (set-identical no-op). Do NOT add `canTouchEmployee` here — that is §9.10, out of scope. |
| C2 | §8c's premise is FALSE. `.svelte-kit/tsconfig.json` `include` contains BOTH `../test/**/*.ts` AND `../tests/**/*.ts`. `tsc -p tsconfig.json --listFiles` resolves 129 files under `/tests/` — the exact count of test `.ts` files. `pnpm check` is green today (889 files, 0 errors) and CI runs it at `.github/workflows/ci.yml:43`. The compiler DOES typecheck the suite. | CONFIRMED | CONCERN | Rewrite §8c's first paragraph and demote §9.8. Making `AuditContext.actorRoles` required + deleting `actorRole` produces a hard compile error at every test that omits `actorRoles`. The grep sweep remains worth doing for cosmetic dead `actorRole:` keys sitting beside a correct `actorRoles:` in non-fresh object literals, but it is a tidy-up, not the safety net. |
| C3 | §3-B option B3 is presented as narrowing only. It also WIDENS: `assertCanTouchEmployee` admits any actor whose `listReportIdsFor`/managed-branch set contains the review subject — including an EMPLOYEE-role supervisor or branch manager, who is 403'd today by `requireAnyMinRole(user.roles,'HR_ADMIN')` at `src/routes/(app)/performance/reviews/[id]/+page.server.ts:26`. Private performance reviews are more sensitive than the punches in §3-A, where the plan did disclose the equivalent widening. | CONFIRMED | CONCERN | Disclose the widening in §3-B's option table before the user chooses. If an EMPLOYEE-role supervisor reading their report's private review is not wanted, B2 (`ADMINISTER_HR_ORGWIDE`) is the option that matches the code comment at `:22-24` exactly and widens nothing. |
| C4 | Nine `role: user.role` literals construct an `EmployeeAccessActor` for `canTouchEmployee`/`listVisiblePayEmployeeIds` and appear in no §5 group: `(app)/payroll/[id]/+page.server.ts:48`, `(app)/payroll/calculator/+page.server.ts:39`, `(app)/reports/[type]/+page.server.ts:59`, `api/v1/payroll/loans/+server.ts:32`, `api/v1/payroll/[id]/+server.ts:23`, `api/v1/payroll/calculator/+server.ts:54`, `api/v1/payroll/cash-advances/+server.ts:30`, `api/v1/payroll/payslips/[id]/pdf/+server.ts:11`, `api/v1/reports/[type]/+server.ts:65`. §5a deletes `EmployeeAccessActor.role` (`employee-access.ts:29`), which makes all nine excess properties. | CONFIRMED | CONCERN | Add a "Group 6b — EmployeeAccessActor literals" entry listing all nine. Not a correctness risk: these are fresh object literals passed directly as arguments, so TypeScript excess-property checking errors on every one and `pnpm check` catches them. It is a scope-estimate correction. |
| C5 | `src/routes/api/v1/settings/users/[id]/role/+server.ts:33` returns `json({ data: { id: updated.id, role: updated.role } })` — a PUBLIC v1 API response shape. §5 Group 4 lists the line number but states no decision for it. | CONFIRMED | CONCERN | Decide explicitly and record it: either return `roles: updated.roles` (breaking, honest) or keep a `role` key derived as `updated.roles[0]` (non-breaking, but reintroduces the primary-role pick §5c exists to forbid). Recommend `roles` + note the v1 break, since the same PATCH already takes a single `role` in its body. |
| C6 | §7's per-commit site counts contradict §2. §7 says commits 1/2/3 cover 30/20/6 sites; §2a/2b/2c actually enumerate 35/19/8. 30+20+6+3 = 59, not 66. | CONFIRMED | CONCERN | Correct §7 to 35/19/8 (+1 for C1 = 36/19/8), so 36+19+8+3 = 66. The "provably 66" audit trail is the plan's main asset; the arithmetic must close. |
| C7 | Commit 7 as written ("delete ROLE_HIERARCHY and the three rank helpers + guard test") is NOT green alone. `tests/unit/rbac.test.ts` imports all three names at `:8-10`; `tests/unit/employee-access.test.ts:3` imports `ROLE_HIERARCHY`; `route-guard-multirole.test.ts:77` carries the `hasAnyMinRole` fixture string. CI runs both `pnpm check` (:43) and `pnpm test` (:46). | CONFIRMED | CONCERN | Restate commit 7 as atomic with every §8a test edit. Note the five prose-only files (`employee-patch-authorization.test.ts:12`, `benefits-enroll-scoping.test.ts:12`, `requests-read-scoping.test.ts:7`, `self-action-guards.test.ts:9`, `pay-proposal-routing.test.ts:15`) are genuinely comment-only — verified — and do not gate the commit. |
| C8 | §6b step 4's `UPDATE "audit_logs" SET "actorRoles" = ARRAY["actorRole"]::"Role"[] WHERE cardinality("actorRoles") = 0` rewrites every row of the audit table inside `prestart.sh`, which gates app startup. On a PH HRIS retaining payroll and 201-file audit history this is an unbounded full-table rewrite holding a lock during deploy. The plan does not mention volume. | PLAUSIBLE (cannot size the production table from here) | CONCERN | Keep `ADD COLUMN ... DEFAULT '{}'` (metadata-only on PG11+, so it is already cheap), but batch the backfill with a bounded loop (`WHERE ctid IN (SELECT ctid ... LIMIT 10000)`) and log progress. Or measure `SELECT count(*) FROM audit_logs` on production first and accept a one-off stall if the count is small. |
| C9 | §6b step 1's guard keys on `users.role` alone, but step 5 drops two columns. If the process dies between the two `ALTER TABLE` statements, the next run early-returns at step 1 and `audit_logs.actorRole` is never dropped — after which `prisma db push` sees a populated NOT NULL column to drop and halts the deploy for want of `--accept-data-loss`, which is the exact outcome §6b exists to prevent. | PLAUSIBLE (narrow crash window; no evidence it has occurred) | CONCERN | Make step 1's guard the union: early-return only when NEITHER `users.role` NOR `audit_logs.actorRole` exists in `information_schema.columns`. One-line change, removes the window entirely. |
| C10 | §6b step 2 `SET roles = ARRAY[role]::"Role"[] WHERE cardinality(roles) = 0 OR NOT (role = ANY(roles))` REPLACES the whole set. A genuine multi-role user whose scalar `role` drifted outside their set (e.g. `roles = [VERIFIER, APPROVER]`, `role = EMPLOYEE`) would be flattened to `['EMPLOYEE']` — silent authority loss. | PLAUSIBLE (unreachable today: every writer — `settings/org.ts:279`, `employees.ts:480-481`, `seed-core.ts:24` — keeps `role` inside `roles`) | CONCERN | Inherited verbatim from the shipped `scripts/migrate-user-roles-backfill.ts`, where REPLACE is deliberate (it repairs the #255 desync, and appending would retain stale authority). Keep REPLACE, but add step 2a: `SELECT count(*) FROM "users" WHERE cardinality(roles) > 1 AND NOT (role = ANY(roles))` and THROW if non-zero. Cheap, and turns a silent flatten into a loud stop. |
| C11 | Minor line-number drift, all cosmetic: §2b cites `performance/+page.server.ts:46` (actual `listGoalsForManager` call is `:43`); §2c cites `timesheets.ts:100-116` (comment starts `:99`); §8a cites `route-guard-multirole.test.ts:37,65,81` (offender fixture is `:64`); §3-D's heading cites `481,507` (those are the comment lines; the guards are `:483,:509`, which §2b lists correctly). | CONFIRMED | CONCERN | Correct on the next plan edit. No execution impact. |
| C12 | `node .claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs` reports 7 FAILs against the plan file (missing Status/Complexity metadata, Blast Radius, Touchpoints, Public Contracts, Verification Evidence, Acceptance Criteria, Phase Completion Rules sections). | CONFIRMED | CONCERN | Template-shape only — this is a hand-written prose plan, not a vc-template plan. Blast Radius was INFERRED from §1 and §2's file tables (28 files in `src/`, plus `prisma/schema.prisma`, `scripts/prestart.sh`, 8 seed/migration scripts, ~10 test files). Stated explicitly here per the deviation-handling rule. Not worth restructuring the plan for; execution is unaffected. |
| — | §0c set-identity claim | CONFIRMED CORRECT | PASS | — |
| — | §2b downstream object checks (all spot-checked sites) | CONFIRMED CORRECT | PASS | — |
| — | §2c timesheets deliberate-reversal reading | CONFIRMED CORRECT | PASS | — |
| — | §3-A / §3-C leaks | CONFIRMED REAL | PASS | — |
| — | §3-D `proposeIfRequired` maker-checker claim | CONFIRMED CORRECT | PASS | — |
| — | §5b `AuditLog.actorRole` is write-only | CONFIRMED CORRECT | PASS | — |
| — | §9.9 / §9.10 / §9.11 not worsened by this plan | CONFIRMED | PASS | — |

### Verified-correct claims (evidence)

- **§2c timesheets non-narrowing** — `src/lib/server/services/timesheets.ts:99-116` says verbatim: *"MANAGER used to be narrowed further, to its direct reports only. That was dropped… it failed outright for the many employees with no `reportsTo` set at all."* The plan's reading is exactly right, and §9.7's warning is justified.
- **§3-A punches leak** — `src/routes/api/v1/timesheets/[id]/punches/+server.ts:28` `hasAnyMinRole(user.roles,'HR_ADMIN')` is true for MANAGER, short-circuiting the owner/direct-manager check at `:29-37`. The doc comment at `:10` ("the owner, the owner's manager, HR_ADMIN, or SUPER_ADMIN") is contradicted by the code. Real leak.
- **§3-C leave override** — `src/routes/api/v1/leave/[id]/+server.ts:38` gates on the `'HR_ADMIN'` floor while `:40` returns *"override-approve requires HR_ADMIN or higher"*. MANAGER clears the floor. The message is false as the plan states.
- **§3-D maker-checker** — `src/lib/server/services/employees.ts:704` `if (employee.userId !== ctx.actorId && canAny(roles,'ADMINISTER_HR_ORGWIDE')) return null` — a MANAGER lacks that capability and falls to `createProposal`. Confirmed reached from both writers: `recordCompensationChange` calls `proposeIfRequired` at `:786`, `promoteEmployee` at `:1038`. Narrowing the routes to `ADMINISTER_HR_ORGWIDE` would 403 the MANAGER before the proposal is filed. **The plan is right; do not narrow.**
- **`scopedToEmployee` wrapper** — `src/routes/(app)/employees/[id]/+page.server.ts:390-401`, and there is exactly ONE `export const actions` in the file (`:402`), wrapped. All ten actions are guarded by `assertCanTouchEmployee(event.locals.user!, event.params.id)` before their handler body runs. Verified by reading the export, not the handlers — this is the specific trap a prior review fell into.
- **§5b write-only** — the only `AuditLog.actorRole` appearances are the schema (`prisma/schema.prisma:1361`), the write interface (`src/lib/server/audit.ts:7`), and assignments. The audit-log page selects `actor: { select: { email: true, role: true } }` (`src/routes/(app)/reports/audit-log/+page.server.ts:53`) — the User relation's CURRENT role, never the historical column. Confirmed: nothing reads it.
- **§9.9 / §9.10 / §9.11 not worsened** — every conversion at those sites (`employees/[id]:597,652`; `benefits:76`; `separations:37`; `api/v1/leave/[id]:17`, `api/v1/timesheets/[id]:17`) is set-identical, so the pre-existing gaps are preserved exactly, neither widened nor deepened. §3-C's narrowing does not touch §9.11: VERIFIER/APPROVER are already excluded at `api/v1/leave/[id]/+server.ts:17` before the override branch is reached.

### Open gaps

- Production audit-log volume for §6b step 4 — cannot be measured from this environment. Carried as C8.
- Migration-script test precedent — none of the seven existing `scripts/migrate-*.ts` has a test. Matching that precedent is reasonable; G10/G11 (run the script twice locally against the seeded DB on 5434) is the substitute evidence and is stronger than the precedent offers.
- e2e coverage: known-gap: documented — #287's `page.goto('/login')` 120s timeouts make the suite unusable as evidence. Nothing in this contract depends on it.
- The five §9 decisions (AuditLog B2/B3, §3-A approval, §3-B option, §3-C option, §5c `<select>` prefill) remain open and are the user's to make. C3 changes the information available for the §3-B decision.

### What this coverage does NOT prove

- `pnpm check` proves the tree typechecks; it does NOT prove any guard admits the right set. Type-identical guards with different capability arguments both compile.
- `pnpm test` (G1-G9) proves unit-level behaviour against mocked `$lib/server/db`; it does NOT prove the real Prisma queries in `listReportIdsFor`/`canTouchEmployee` return the same ids against real rows, nor that `reportsToId`/`EmployeeSupervisor` data in production has the shape the tests assume.
- G3's equivalence loop proves `canAny([role], cap) === can(role, cap)` for one-element sets; it does NOT prove the 66 sites were each given the *correct* capability — only that whichever capability was chosen behaves consistently. C1's missed site is exactly the class of error this gate cannot catch; only the enumeration audit catches it.
- G4/G5/G6 prove the three narrowings at the unit level; they do NOT prove no OTHER surface exposes the same data by a different route (e.g. a punch visible through an aggregate endpoint, a review's text via a performance export).
- G10/G11 prove the migration is idempotent against a locally seeded DB; they do NOT prove behaviour against production row counts, production lock contention, or a DB whose `users.roles` was hand-edited. C8 and C10 are unproven by any gate here.
- G12 (agent probe) proves the three 403s render; it does NOT prove the negative space — that nothing a MANAGER legitimately needs newly 403s. Only the passing halves of T4 and the untouched §2a/2b/2c sites speak to that, and they speak by construction, not by observation.
- Nothing here proves session behaviour across the `User.role` column drop (§6e). That is stated as high-confidence-unverified in the plan and remains so; it needs a staging run.
- No gate covers §9.9/§9.10/§9.11. They are confirmed not-worsened by reading, not by test.

Gate: CONDITIONAL (12 concerns; C1 is a build-breaker that must be applied to the plan before EXECUTE, C2/C3/C5 change decisions the user is about to make, the rest are refinements)

Accepted by: PENDING USER — this contract is presented at the V5 gate and is not yet accepted. Concerns requiring explicit acceptance: C1 (missed call site), C2 (§8c premise false), C3 (undisclosed widening in §3-B), C4 (Part 2 enumeration gap), C5 (v1 API response shape), C6 (commit-count arithmetic), C7 (commit 7 atomicity), C8 (audit-log backfill volume), C9 (migration idempotency window), C10 (multi-role flatten), C11 (line drift), C12 (plan template shape).

### Execute-agent instructions

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | Before commit 1, re-run `grep -rn "requireAnyMinRole\|hasAnyMinRole\|hasMinRole" src/` and reconcile against §2's tables. The count must be 66 live sites. Do not begin converting until the enumeration closes. | Commit 1 entry |
| E2 | `benefits/+page.server.ts:76` converts to `requireAnyCapability(locals.user!.roles,'MANAGE_HR')`. Do NOT add `canTouchEmployee` there — that is §9.10, explicitly out of scope. | Commit 1 |
| E3 | Do NOT narrow any timesheet site to a manager's direct reports. `src/lib/server/services/timesheets.ts:99-116` records a deliberate reversal. If a review comment suggests it, point at that comment. | Commit 3 |
| E4 | Do NOT convert `employees/[id]/+page.server.ts:483,509` to `ADMINISTER_HR_ORGWIDE`. `MANAGE_HR` only. `ADMINISTER_HR_ORGWIDE` would 403 the MANAGER before `proposeIfRequired` (`employees.ts:704`) can file the proposal, breaking maker-checker and `tests/unit/pay-proposal-routing.test.ts`. | Commit 2 |
| E5 | Commit 7 is atomic: delete the helpers AND apply every §8a test edit AND add T1 in the same commit. Verify with `pnpm check && pnpm test` before committing. Partial commit 7 fails CI. | Commit 7 |
| E6 | For §3-B, use whichever option the user selects at V5. If B3, add a one-line comment at the guard naming the widening (EMPLOYEE-role supervisors gain access) so the next reader is not surprised. | Commit 5 |
| E7 | Run the migration script TWICE against the local DB on 5434 before wiring it into `prestart.sh`. The second run must be a clean no-op. Then run `sh scripts/prestart.sh` end-to-end and confirm `db push` emits no data-loss warning. | Commit 8 |
| E8 | Do NOT add `--accept-data-loss` to `scripts/prestart.sh:18` under any circumstance. If the push warns about data loss, the migration script is incomplete — fix the script. | Commit 8, 11 |
| E9 | Part 2: after deleting `EmployeeAccessActor.role`, run `pnpm check` and fix every reported site. Expect ~9 additional `role:` literals beyond §5's Groups (C4). Trust the compiler here — it does typecheck `tests/**`. | Commit 9-10 |
| E10 | `scripts/migrate-leave-to-request.ts:63,71` and `seed-issues-demo.ts:227,229` are `ApprovalStep.role`, a different column. Leave alone. Same for `approvals.ts:406` and `requests/approvals/+page.svelte:101`. | Commit 10 |

## Autonomous Goal Block

SESSION GOAL: Execute the RBAC four-mechanism collapse (#282 Part 1, then the User.role -> User.roles collapse) on branch refactor/rbac-simplification-282, per process/general-plans/active/rbac-simplification-282_PLAN_10-08-26.md and its Validate Contract.

CHARTER: Convert all 66 rank-floor call sites to capability checks (set-identical, zero behaviour change), fix the three confirmed leaks, delete ROLE_HIERARCHY and the three rank helpers, then collapse the scalar User.role into User.roles behind an idempotent migration script.

AUTONOMY RULES:
- One issue, one PR, many commits. Do not split into multiple PRs.
- Follow the 11-commit sequence in section 7, corrected per C6 (36/19/8 sites for commits 1/2/3).
- Bias to deletion. No new abstractions, no Scope enum, no policy engine, no new dependencies.
- Run `pnpm check && pnpm test` before every commit. Both must be green.
- Use pnpm, never npm.
- Never add a Co-Authored-By or Co-Author trailer to any commit.

HARD STOPS (require the user):
- The five open decisions in section 9 (AuditLog B2/B3, sections 3-A, 3-B, 3-C options, and the 5c select prefill). Do not pick one autonomously.
- Any push to a remote, any PR creation, any deploy.
- Adding `--accept-data-loss` to scripts/prestart.sh — forbidden outright.
- Running the migration script against anything other than the local DB on 5434.

NEXT PHASE: EXECUTE, after the V5 gate is accepted and the five section-9 decisions are made.

CONTRACT SUMMARY: Gate CONDITIONAL. Set-identity claim CONFIRMED — all 66 conversions are provably no-ops. 12 concerns; C1 (missed call site benefits/+page.server.ts:76) must be applied to the plan first or commit 7 breaks the build. C2 means the test suite IS typechecked, which lowers Part 2 risk materially. C3 means section 3-B option B3 widens as well as narrows — disclose before deciding.

EXECUTE START COMMAND: Read process/general-plans/active/rbac-simplification-282_PLAN_10-08-26.md in full including the Validate Contract, apply plan corrections C1/C6/C7 first, then begin commit 1.

---

## Part 2 execution record — 2026-08-11, COMPLETE

Commits 8-11 landed as `b030a0e`, `5b26da8`, `fb5107d`, `7bd346e`, plus a follow-up fix `2c2b9ab`.
Sixteen commits on `refactor/rbac-simplification-282`, 163 files, +1966/-736 against `staging`.
Final state: lint 0 errors, `pnpm check` 893 files / 0 errors, `pnpm test` 1225 passing / 101 files.

### Deviations from the plan, and why

1. **The DROPs were deferred out of commit 8.** §6b's script sketch ends with step 5, and §7's
   commit sequence puts "add the column" at 8 and "drop the scalars" at 11 — those two readings
   conflict. Commit 8 shipped steps 1-4 only; commit 11 appended step 5. Writing the drops at
   commit 8 would have broken the build for three commits, because `audit.ts` still wrote
   `actorRole` until commit 9.

2. **Each DROP is guarded by `columnExists()` as well as `IF EXISTS`.** `IF EXISTS` covers the
   second run; it does not cover a *fresh* database, where the tables do not exist yet — the
   script runs before `db push`, and `prestart.sh` is a `set -e` chain, so a bare `ALTER` there
   would stop the app from ever starting. Guarded per-column, so the C9 crash window between the
   two drops stays closed.

3. **`@default([])` on `AuditLog.actorRoles`**, which §6d does not specify. It mirrors
   `User.roles` and makes the schema's DDL match the script's `DEFAULT '{}'`, so the subsequent
   push sees no default to remove.

4. **T5 needed no new test.** Commit 10 already added both assertions §8b asks for
   (`.not.toHaveProperty('role')` on the update payload, and the per-role `roles: { has: 'CEO' }`
   count) in `tests/unit/user-admin-self-guard.test.ts`. Test count held at the 1225 baseline.

### What the plan's enumeration missed

§5a undercounted materially. Found and fixed during execution:

- **A twelfth fallback** — `services/payroll/payslip-fetch.ts`'s `canReadPayslip` carried its own
  `roles?.length ? roles : [role]`, and `FetchPayslipContext.role` fed it. §5a Group 1 lists eleven.
- **Eleven more `roles ?? [role]` idioms on `locals.user`**, not the one the plan names in
  `payroll/[id]`: `dashboard/+page.server.ts` (x2), `payroll/+layout.server.ts`,
  `payroll/+page.server.ts`, `api/v1/payroll/[id]/+server.ts`, `requests/approvals/+page.server.ts`
  (x3), `requests/timesheets/+page.server.ts` (x4), `requests/proposals/+page.server.ts`,
  `approvals.ts:252`.
- **Five Prisma `user: { select: { role: true } }` display projections** — four in `employees.ts`,
  one in `dashboard.ts` — in no §5 Group. They compiled fine until commit 11.
- **`services/timelog.ts`** selected `role: true` to build its audit ctx, so it had no set to pass.
- **§5a Group 3 is wrong about `(app)/+layout.svelte`.** The plan says "no other use of `role`
  found in that file; verify, then delete the line." False — the sidebar user card renders it.
  Converted to render the whole set per §5c point 3 rather than deleted.

### The one real bug this shipped and then fixed

`prisma/seed-core.ts:242` still wrote the dropped `User.role` when creating the sign-off accounts.
`pnpm check` passed anyway: **`prisma/**` and `scripts/**` are outside
`.svelte-kit/tsconfig.json`'s `include`**, so the compiler never sees them. `pnpm db:seed` would
have thrown at runtime. Fixed in `2c2b9ab`, after which every file in both directories was
typechecked individually — that was the only one.

This is the sharp edge of C2's good news. The contract established that `tests/**` IS typechecked,
which is true and did lower Part 2's risk. It does not extend to `prisma/**` or `scripts/**`, and
Groups 5 and 6 of §5a live largely in those directories. **A future schema-wide refactor must
typecheck those two directories explicitly; `pnpm check` is not evidence about them.**

### Also found: `as any` fixtures escape the type gate

`tests/unit/proposal-queue.test.ts` builds its route event `as any`, so seven tests broke at
runtime with `Cannot read properties of undefined` after commit 9 — invisible to `pnpm check`.
`pnpm test` remains mandatory, not a formality, on typed refactors.

### Deliberately not done

- **`getManagerMetrics`'s `recentActivity[].actor.roles` still follows the `actor` relation**, so
  it reports the actor's roles *today*, not at the time of the action — exactly the flaw B3 fixed
  on the audit-log page. Confirmed live: a LOGIN entry written while the user was EMPLOYEE renders
  `PAYROLL_OFFICER` after a role change. `/api/v1/dashboard` is a public response shape and
  changing its meaning is beyond #282. Worth its own issue.
- **`override-approve` does not bypass the approval chain.** §3-C assumed it did. Both actions map
  to the same `decide()` call and differ only by the capability gate. Pre-existing, unrelated to
  this issue, worth filing separately.
- The role-assignment API stays single-valued (#283).

---

## Review record — CodeRabbit CLI, 2026-08-11

Reviewed on PR #293 (`refactor/rbac-simplification-282` → `staging`) with
`coderabbit review --agent --base staging`. 163 files is over the free-plan 150-file cap, so the
review was split by directory: `src` 107 files / 0 findings, `tests` 45 / 2, `scripts` 8 / 1.
**`prisma` (2 files) was never reviewed** — the free tier ran out first. That is the one scope with
no third-party read, and it is also where this PR's only real bug lived (`seed-core.ts`, fixed in
`2c2b9ab`). Worth a look by hand before any similar refactor.

Nothing in the entire service and route layer drew a finding.

### Applied — stale `role` in route-event fixtures (`b032012`)

CodeRabbit flagged two (`review-privacy.test.ts:46`, `punch-access.test.ts:43`). Grepping the
pattern found **eleven**: also `requests-read-scoping` (x2), `leave-override-scoping`,
`employee-reveal-access`, `employee-patch-authorization`, `audit-log-reveal` (x2), and
`payroll-read-scoping`. All removed.

Its reasoning is the finding worth keeping: every one sits inside an `as any` cast, so a fixture
supplying a field production no longer has can green-light a read that would 403 in prod, and the
compiler cannot see it. Same blind spot as `proposal-queue.test.ts` breaking at runtime after
commit 9, and the same class as the `seed-core.ts` bug. **Three separate manifestations of one gap
in this PR alone.**

Left alone: `role: 'EMPLOYEE'` in `employee-number.test.ts`, `reports-to-scoping.test.ts` and
`admin.spec.ts` — that is `CreateEmployeeInput.role`, the single-valued hire form field, not the
dropped column.

### Declined — `scripts/seed-separation-demo.ts:37`

Flagged as "the upsert's `update` branch clobbers `roles` on rerun". It did exactly that before
this PR too (`update: { isActive: true, role: 'EMPLOYEE' }`), so the conversion is faithful and the
behaviour is pre-existing. It is a demo seed for one dedicated account, `departing@veent.ph`, whose
purpose is to be reset to a known state — the same line also forces `isActive: true`. Dropping
`roles` from the `update` branch would make reruns less deterministic, not more.

### Not proven by anything here

**G13 — production migration against real audit-log volume.** The backfill was measured against
1405 local rows. `prestart.sh` runs it automatically on deploy and it gates app startup. Batched at
10k so it will not hold one long lock, but the first deploy after this merge will take as long as
the production table needs.
