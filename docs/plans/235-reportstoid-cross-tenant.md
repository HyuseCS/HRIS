# Issue #235 — cross-tenant `reportsToId` at write time

**Repo:** `/home/hyuse/Desktop/VeentApps/veent_hris` · **Branch:** `staging` · **HEAD:** `c524b49935b8e5df813d70f3290b584a6f7b666e`
**Modes run:** PLAN → INNOVATE (per `.claude/skills/riper5/SKILL.md`). No repository file was modified; every line/quote below was re-read at this HEAD.

---

## 0. Ground truth re-verified at HEAD (do not trust the issue text)

The issue's premise is stale. Confirmed by fresh reads:

| Claim                                                  | Verified state at `c524b49`                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `createEmployee` writes `reportsToId` unchecked        | **True.** Signature `employees.ts:393`; write at `employees.ts:494` inside `allocateAndCreate` (called `:405`, inside `db.$transaction` at `:454`). No org lookup anywhere in either function.                                                                                                                                                                                                                                                                                 |
| `updateEmployee` validates it (issue cites `:819-826`) | **FALSE.** `updateEmployee` is `employees.ts:548-621`. It validates **only** `branchId` (`:573-580`) and then writes `data: input` wholesale at `:582-586`. It has no `reportsToId` handling at all.                                                                                                                                                                                                                                                                           |
| Where the guard actually lives                         | `promoteEmployee`, `employees.ts:924-932` (moved there by #222 / `f9fd383`). Error shape: **400** `'An employee cannot report to themselves.'` for self-report, **404** `'Manager not found'` for cross-org. Not a uniform 400.                                                                                                                                                                                                                                                |
| A second live unguarded writer                         | **Confirmed.** `UpdateEmployeeInput.reportsToId?: string` (`employees.ts:95`) → `PATCH /api/v1/employees/[id]` schema `+server.ts:38` (`reportsToId: z.string().optional()`) → only `basicMonthlySalary/rateType/employmentType` are split out of `rest` at `:102` → `:154` `updateEmployee(params.id, organizationId, rest, ctx)` → unchecked `db.employee.update({ data: input })`. The `canTouchEmployee` gate at `:84` scopes the **target**, never the posted manager id. |
| `setAdditionalSupervisors` is correct                  | **True.** `supervisors.ts:58-62` org-scoped subject lookup, `:67-73` count check → 400 `'A selected supervisor is not in this organization'`.                                                                                                                                                                                                                                                                                                                                  |
| No other creation path                                 | **True.** `tx.employee.create` appears exactly once repo-wide (`employees.ts:465`). Other `createEmployee` caller is `recruitment.ts:591` (applicant→hire) and it passes **no** `reportsToId` (verified: the call's object literal has `email/password/role/firstName/lastName/departmentId/jobTitle/employmentType/startDate/basicMonthlySalary/contactPhone` only). `src/routes/api/v1/employees/+server.ts` exports **GET only**.                                           |
| UI cannot reach the hole                               | **True.** The 201 page's `updateSchema` has no `reportsToId`; reporting-line changes go through `promoteEmployee` (`(app)/employees/[id]/+page.server.ts:360` schema, `:517` action). The onboarding `<select>` is populated from an org-scoped query (`employees/new/+page.server.ts:29-36`).                                                                                                                                                                                 |

### 0.1 One correction to the issue's impact assessment — found during this pass

The issue says "not exploitable for data access today, because `canTouchEmployee` and `listVisibleEmployeeIds` independently re-scope by org". That is true of **those two**, but they are not the only consumers.

**`getManagerMetrics` (`src/lib/server/services/dashboard.ts:254-292`) does NOT re-scope by org:**

```ts
const directReports = await db.employee.findMany({
    where: { reportsToId: employee.id },      // ← no organizationId / user.organizationId filter
    select: { id: true }
})
...
db.timesheet.count({ where: { employeeId: { in: directReportIds }, status: 'SUBMITTED' } }),
db.request.count({ where: { employeeId: { in: directReportIds }, type: 'LEAVE', status: 'PENDING' } }),
db.employee.count({ where: { reportsToId: employee.id, employmentStatus: 'ACTIVE' } }),
```

Reachable via `GET /api/v1/dashboard` (`src/routes/api/v1/dashboard/+server.ts:25`). So an org-A actor who plants `reportsToId = <org-B employee id>` inflates that org-B manager's `teamHeadcount` and leaks **aggregate counts** of another tenant's pending timesheets and leave requests into their dashboard. Low-fidelity (counts, no names or records) and it requires knowing a cuid in the victim org, but it is a real cross-tenant read that the write guard is the precondition for.

**Handling:** flagged, **not** folded into this change — see §5 (Step 6, optional) and §7. The write guard removes the precondition for all new rows; the dashboard scoping is a separate defect in a separate service and deserves its own issue.

---

# [MODE: PLAN] — first-pass draft

_(Recorded as drafted, before the INNOVATE critique. The critique in §4 changes one decision; §5 is the final version to implement.)_

Draft consisted of:

1. **`createEmployee`** — inline org-scoped manager lookup copied from `promoteEmployee:926-930`, placed after the 409 email check, before the bcrypt hash. 404 `'Manager not found'`. No self-report check.
2. **`updateEmployee`** — inline copy of the same lookup plus a self-report 400, placed after the `branchId` block. (Option **(ii)** over option **(i)**; reasoning in §3.)
3. **`promoteEmployee`** — untouched (it already works).
4. Stale comments in `employee-access.ts` corrected.
5. New unit test file; full validation gate run.

That draft leaves **three hand-written copies** of one security invariant in one file. §4 revisits it.

---

## 1. Why `createEmployee` needs no self-report check (reasoning confirmed, not assumed)

`Employee.id` is `String @id @default(cuid())` (`prisma/schema.prisma`, `model Employee`). The id is generated **by Prisma at insert time**; `CreateEmployeeInput` (`employees.ts:30-64`) has no `id` field and no caller supplies one. Therefore at create time the row's own id does not exist yet, is unknowable to the caller, and `reportsToId === <new id>` is unreachable by construction. A self-report check there would be dead code guarding an impossible state — exactly the "no error handling for impossible scenarios" case. **Confirmed: create-time guard is cross-org only.**

## 2. Why the guard goes _before_ the bcrypt hash

`createEmployee:403` is `await bcrypt.hash(input.password, 12)` — cost 12, ~250-400ms, deliberately hoisted outside the retry loop by an existing comment. Placing a single indexed `findFirst` behind that means a request that can never succeed still burns the hash. Inserting immediately after the existing `409 Email already in use` check (`:398-399`) keeps the current error precedence (409 first) and fails fast. The check must **not** go inside `allocateAndCreate`'s retry loop: it is input validation, invariant across retries, and would re-query on every attempt.

## 3. The `updateEmployee` / PATCH decision — (i) vs (ii)

### Option (i): strip `reportsToId` from the v1 PATCH schema (`+server.ts:38`)

**For:** less code; centralises reporting-line changes on `promoteEmployee`, matching what the UI already does; as a bonus it closes an authorization asymmetry (below).

**Against — three findings that sank it:**

1. **Silent no-op on a write.** `updateSchema` is a plain `z.object(...)`, not `.strict()`. Zod's default is to **strip** unknown keys. A caller PATCHing `{ reportsToId: "x" }` would get **200 OK** with the field silently discarded and the response showing the old manager. Silent data loss on a write request is a worse failure mode than the 404 it replaces. Making it loud requires adding an explicit rejection — which spends most of the code the option was supposed to save.
2. **It fixes the instance, not the class.** `UpdateEmployeeInput.reportsToId` (`employees.ts:95`) and `db.employee.update({ data: input })` (`:582-586`) stay unguarded. The next route or form action that passes the field through re-opens the hole with zero friction — precisely the hazard the issue names ("every future consumer inherits an org-safety assumption that isn't enforced at write time").
3. **Deleting the field from the interface does _not_ give a compile-time guarantee.** I checked the shape: the route calls `updateEmployee(params.id, org, rest, ctx)` where `rest` is a **destructured variable**, not a fresh object literal. TypeScript's excess-property check fires only on fresh literals, so a `rest` carrying `reportsToId` would still typecheck against an interface without it, and Prisma's `update({ data })` accepts `EmployeeUncheckedUpdateInput`, so the extra key is written at runtime. Type-level removal is documentation, not enforcement.

### Option (ii): guard inside `updateEmployee` — **CHOSEN**

**For:**

- It is the **write boundary**. All five current callers are covered by construction: `(app)/employees/[id]/+page.server.ts:462`, `(app)/profile/+page.server.ts:122`, `(app)/departments/+page.server.ts:103`, `api/v1/employees/[id]/+server.ts:154`, plus any future one.
- **The precedent is ten lines above it.** `updateEmployee:573-580` already does exactly this for `branchId`, with a comment that generalises verbatim: _"Postgres can't express 'the branch belongs to the same org', so verify it here — a forged id from another tenant must not cross over."_ Same for `positionId` in `promoteEmployee:909-918`. This is the repo's established idiom for an org-scoped FK.
- No external API behavior change for legitimate callers; a forged id was never legitimate.
- No data-integrity reason exists to remove `reportsToId` from `updateEmployee`. The `UpdateEmployeeInput` comments carve out pay (`:83-85`) and employment type (`:76-79`) because those are **effective-dated** and a bare row write desyncs history. `reportsToId` is a plain column — `promoteEmployee` treats it as one too (`columns.reportsToId`, `:908/:931`) and explicitly excludes it from `HISTORY_FIELDS` (`:1050-1052`). Routing it through `promoteEmployee` is an architecture preference, not a correctness requirement.

**Against:** duplicates validation logic. → resolved by §4 (extract a helper).

### Adjacent finding, deliberately out of scope

The PATCH route gates on `requireCapability('MANAGE_HR')` (`+server.ts:77`), which **MANAGER** holds (#133), while the UI's reporting-line path (`promote`) gates on `requireMinRole('HR_ADMIN')` and routes through the #224/#243 proposal machinery. So today a MANAGER can re-point a report's reporting line via the API with no HR_ADMIN gate and no separation-of-duties routing. That is an **authorization** asymmetry, distinct from #235's cross-tenant hole, and option (i) would have closed it as a side effect. Folding it in here would be scope creep and a genuine behavior change. **Flag in the PR description; file separately.** (§7)

---

# [MODE: INNOVATE] — critique of the draft above

## 4.1 The draft's central mistake: it miscounts the call sites

The task framing — and my own first pass — treated this as "two unguarded writers, so two call sites, so a helper is premature." That undercounts by one, because it treats the **existing** guard in `promoteEmployee` as untouchable furniture rather than as instance #3 of the same check.

After the fix there are **three** call sites of one invariant, all in **one file** (`employees.ts`): create (`~:400`), update (`~:581`), promote (`:924`). That is the rule of three, not two.

More damning: **the failure mode this issue documents _is_ guard-duplication drift.** The check was written once, #222 relocated it into `promoteEmployee`, the issue reporter still believed it lived in `updateEmployee`, and two other writers never got it. Adding a third and fourth hand-written copy is knowingly repeating the exact mechanism that produced the bug. A security invariant with one definition can be audited by one `grep`; three copies cannot.

**Revised decision: extract a module-local helper and route all three sites through it.**

Counter-argument I weighed and rejected: _"the repo's idiom is inline duplication — `branchId` and `positionId` are already two hand-written copies of 'org-scoped FK lookup → 404', so extracting only the manager one is inconsistent."_ True, but the manager FK is the one with (a) three call sites rather than one each, and (b) a demonstrated drift history. Consistency with a pattern that just failed is not a virtue. `branchId` and `positionId` stay inline — they have one writer each and no drift.

Second counter-argument weighed: _"'Surgical changes: touch only what you must' — refactoring `promoteEmployee` isn't required to fix #235."_ Real, and it is the one place this plan edits working code. It is justified because **equivalence is provable from the existing suite**: `tests/unit/promotion.test.ts:144-148` pins the self-report 400 and `:150-156` pins the cross-org 404, with the mock sequence `mockResolvedValueOnce(PART_TIMER).mockResolvedValueOnce(null)` — the helper preserves both the call count (one `db.employee.findFirst`) and the check order (self-check before any query), so both tests pass unchanged. If they don't, the refactor is wrong and I'll know immediately.

### The helper must not be over-built

- **Module-local, not exported.** All three call sites are in `employees.ts`. Exporting it (or parking it in `employee-access.ts`) invites speculative reuse and widens the surface for nothing.
- **One optional parameter, no options object.** `selfId?: string` — present for the two update-shaped writers, absent at create (§1). An options bag for one optional argument would be the over-engineering the guidelines warn about.
- **It does not absorb the "unchanged" comparison.** `promoteEmployee` needs `!== employee.reportsToId` to decide whether to populate `columns`; `updateEmployee` needs it for a different reason (see §5 Step 3); `createEmployee` has nothing to compare. Pulling that into the helper would need a fourth parameter and a return value, for one line each. Left at the call sites.

## 4.2 Alternatives brainstormed and rejected

| #   | Alternative                                                                                                                 | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | **Database-level enforcement** — composite FK `(reportsToId, organizationId) → (id, organizationId)`, or a `CHECK`/trigger. | **Rejected.** Genuinely the strongest fix and it would end this bug class permanently. But: Prisma cannot express a composite FK to a non-PK pair without a `@@unique([id, organizationId])` companion index and raw-SQL migration; the repo has **no migrations directory** — it uses `prisma db push` (`pnpm db:push`), and the CLAUDE.md constraints show schema surgery here already needs bespoke `scripts/migrate-*.ts`. The schema comment on `branchId` explicitly concedes this: _"Postgres cannot express … so every write path to this column must verify it in the service layer."_ Out of proportion to #235. Worth its own issue if the pattern recurs a fourth time. |
| B   | **Zod `superRefine` with an async org lookup** in each route schema.                                                        | **Rejected.** Moves a security check from one service into N routes (validation at the perimeter instead of the boundary) — strictly more places to forget. Also makes the schemas async-parse-only, changing every call site's shape.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| C   | **Guard inside the `$transaction`** in `allocateAndCreate` to close the TOCTOU window.                                      | **Rejected.** The window requires an employee's `User.organizationId` to change between check and insert; there is no "move employee to another org" operation in the codebase (`UpdateEmployeeInput` has no `organizationId`, and cross-org membership #131 works through `session.currentOrgId`, not by rewriting the column). `promoteEmployee` accepts the identical window today. Moving it inside would also re-run the query on every retry attempt.                                                                                                                                                                                                                         |
| D   | **A Prisma client extension / middleware** intercepting every `employee` write carrying `reportsToId`.                      | **Rejected.** Invisible action-at-a-distance for a three-call-site invariant, needs org context threaded into the extension, and would fire on seeds and scripts that legitimately write direct. Textbook speculative abstraction.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| E   | **Also constrain the onboarding route schema** (`employees/new/+page.server.ts:92-95`).                                     | **Rejected.** A zod schema cannot do an org lookup without going async; the service guard covers this route and every other. Adding a second check there is redundant, not defence-in-depth.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| F   | **Make `updateEmployee` reject `reportsToId` and route callers to `promoteEmployee`** (option (i), strong form).            | **Rejected** — §3, three reasons. Not precluded later as an API-design cleanup; the guard chosen here does not block it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| G   | **Unify `setAdditionalSupervisors`' 400 with the new 404.**                                                                 | **Rejected** — §5 Step 5. Different semantics, gratuitous behavior change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| H   | **Backfill/repair script for existing cross-tenant rows.**                                                                  | **Rejected as code**, kept as a read-only detection query (§6.4). Nulling a production reporting line unattended is more destructive than the row it fixes; if the query returns rows, that is an operator decision, not a migration.                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## 4.3 Two further gaps the draft missed

1. **The stale claim also lives in a test comment.** `tests/unit/employee-access.test.ts:111` says _"createEmployee takes reportsToId as given, so a cross-tenant report row is writable."_ Same falsehood as `employee-access.ts:64-68`, one directory over. The task's item (d) named only the service file. Fix both. (The **test itself stays** — the org re-scope is still correct defence-in-depth for rows written before this fix.)
2. **The 404 surfaces as an error page, not a form `fail()`, on the onboarding route** — and that is already the established behavior. `employees/new/+page.server.ts:156-186` catches only the email-409 and P2002 cases and re-throws everything else, so a SvelteKit `error(404)` renders the error page. Identical to what `updateEmployee`'s existing `error(404, 'Branch not found')` does through the 201 page's action (`employees/[id]/+page.server.ts:452-467`, catches P2002 only). Since the reports-to `<select>` is org-scoped at load, only a **forged** POST can reach it. **Deliberate: no `fail()` mapping added.** Matching the branch precedent is worth more than a nicer error page for a request that shouldn't exist.

---

# 5. FINAL PLAN — exact changes, in order

Every "before" block below is the verbatim current text at `c524b49`. Style: tabs, single quotes, no semicolons (prettier config).

### Step 1 — `src/lib/server/services/employees.ts`: add the helper

Insert between `isEmployeeNumberConflict` (ends `:391`) and `export async function createEmployee` (`:393`). No new imports — `db` (`:1`) and `error` (`:4`) are already imported.

```ts
/**
 * A reporting line must not cross tenants. Postgres cannot express "reportsTo belongs to the same
 * organization" — the same limitation `branchId` and `positionId` carry — so every writer of
 * `reportsToId` verifies it here (#235, where the check lived on one writer and two others took a
 * forged id as given).
 *
 * `selfId` is the employee being written. Omitted at create time: Prisma generates the row's id at
 * insert, so a new hire cannot be named as its own manager.
 */
async function assertManagerInOrg(reportsToId: string, organizationId: string, selfId?: string) {
	if (reportsToId === selfId) error(400, 'An employee cannot report to themselves.')
	const manager = await db.employee.findFirst({
		where: { id: reportsToId, user: { organizationId } },
		select: { id: true }
	})
	if (!manager) error(404, 'Manager not found')
}
```

Note the `where` clause is `user: { organizationId }`, **not** `organizationId` — byte-identical to `promoteEmployee:927`, and the shape used by `getEmployee:221`, `requireEmployee:149`, `setAdditionalSupervisors:59`. (`Employee` carries both an `organizationId` column and the `user` relation; the codebase scopes on the relation.)

### Step 2 — `createEmployee`: guard the hire path

`employees.ts:398-403`.

**Before**

```ts
const existingUser = await db.user.findUnique({ where: { email: input.email } })
if (existingUser) error(409, 'Email already in use')

// Hashed once, outside the retry loop — bcrypt at cost 12 is by far the expensive part and
// the password does not change between attempts.
const passwordHash = await bcrypt.hash(input.password, 12)
```

**After**

```ts
const existingUser = await db.user.findUnique({ where: { email: input.email } })
if (existingUser) error(409, 'Email already in use')

// #235: the reporting line comes straight off the request, so verify the manager is in this org
// before anything is written. Ahead of the hash — a single indexed lookup should not sit behind
// 300ms of bcrypt on a hire that cannot succeed.
if (input.reportsToId) await assertManagerInOrg(input.reportsToId, organizationId)

// Hashed once, outside the retry loop — bcrypt at cost 12 is by far the expensive part and
// the password does not change between attempts.
const passwordHash = await bcrypt.hash(input.password, 12)
```

Truthiness (`if (input.reportsToId)`) rather than `!== undefined`, matching the adjacent `if (input.branchId && …)` idiom. `''` is already normalised to `undefined` by the only UI caller (`employees/new/+page.server.ts:143`), and an `''` that somehow arrived would still fail the FK exactly as it does today — no security consequence either way.

### Step 3 — `updateEmployee`: guard the second writer

`employees.ts:580-582`, immediately after the `branchId` block and before the write.

**Before**

```ts
		if (!branch) error(404, 'Branch not found')
		if (branch.status === 'CLOSED') error(400, 'That branch is closed — choose an open branch.')
	}

	const updated = await db.employee.update({
```

**After**

```ts
		if (!branch) error(404, 'Branch not found')
		if (branch.status === 'CLOSED') error(400, 'That branch is closed — choose an open branch.')
	}

	// #235: same reason as the branch above — a reporting line must stay inside the tenant, and
	// `data: input` writes this column straight through (the v1 PATCH accepts it). Skipped when
	// unchanged, for the same reason the branch check is: re-saving a 201 file whose manager
	// predates this check must not fail every unrelated edit on it.
	if (input.reportsToId && input.reportsToId !== existing.reportsToId) {
		await assertManagerInOrg(input.reportsToId, organizationId, id)
	}

	const updated = await db.employee.update({
```

Clearing the reporting line is not a case to preserve: `UpdateEmployeeInput.reportsToId` is `?: string` (not nullable) and the v1 schema is `z.string().optional()`, so `null` is unreachable today.

### Step 4 — `promoteEmployee`: route the existing guard through the helper

`employees.ts:924-932`.

**Before**

```ts
if (input.reportsToId !== undefined && input.reportsToId !== employee.reportsToId) {
	if (input.reportsToId === id) error(400, 'An employee cannot report to themselves.')
	const manager = await db.employee.findFirst({
		where: { id: input.reportsToId, user: { organizationId } },
		select: { id: true }
	})
	if (!manager) error(404, 'Manager not found')
	columns.reportsToId = input.reportsToId
}
```

**After**

```ts
if (input.reportsToId !== undefined && input.reportsToId !== employee.reportsToId) {
	await assertManagerInOrg(input.reportsToId, organizationId, id)
	columns.reportsToId = input.reportsToId
}
```

Behaviour-identical: same order (self-check before the query), same single `db.employee.findFirst`, same statuses and messages. Pinned by `tests/unit/promotion.test.ts:144-156`. The function's doc comment (`:863`, _"position and manager are re-checked to be in this org"_) stays accurate — no edit. The proposal-confirm path (`applyProposedChange:1118-1121` → `promoteEmployee(..., { confirmTx })`) re-enters this writer, so a PROMOTION proposal carrying `reportsToId` is re-validated on confirm; unchanged by this refactor.

### Step 5 — `setAdditionalSupervisors`: verified, **no change**

`supervisors.ts:52-73` already validates correctly: org-scoped subject lookup (`:58-62`), `sanitizeSupervisorIds` strips self and the primary manager (`:64`), and a **single** `findMany` + count comparison rejects the whole set (`:67-73`) with 400 `'A selected supervisor is not in this organization'`.

**Do not route it through `assertManagerInOrg`.** Its shape is genuinely different: it validates a _set_ in one query, where the helper is per-id — forcing it through would turn one query into N. The differing status (400 vs 404) is correct too: a bad member of a submitted set is a malformed request; a single required FK that resolves to nothing is a not-found. Changing it would be a gratuitous behavior change to code that works.

_(Noted gap, not fixed: `tests/unit/supervisors.test.ts` covers only the pure `sanitizeSupervisorIds`; the org guard at `:67-73` has no unit test. Mention in the PR; adding one needs a fresh db-mock harness for `supervisors.ts` and belongs in its own change.)_

### Step 6 — stale comments

**6a. `src/lib/server/services/employee-access.ts:64-68`**

Before

```ts
// Org-scoped for BOTH paths, not just the branch one. `listReportIdsFor` matches on
// `reportsToId`/`EmployeeSupervisor` alone, and while `updateEmployee` validates a new
// `reportsToId` against the org, `createEmployee` does not — a hire POST takes the id as given.
// So a report row can point across tenants, and without this it would become a reach into
// another organization. An employee outside the actor's org is unreachable however they relate.
```

After

```ts
// Org-scoped for BOTH paths, not just the branch one. `listReportIdsFor` matches on
// `reportsToId`/`EmployeeSupervisor` alone, with no org filter of its own. Every writer of
// `reportsToId` validates the manager's org since #235, but a row written before that can still
// point across tenants, so this stays as the fail-closed backstop: an employee outside the
// actor's org is unreachable however they relate.
```

**6b. `src/lib/server/services/employee-access.ts:115-116`**

Before

```ts
// Org-scoped: a report row can point across tenants (createEmployee takes reportsToId as
// given), and the roster must not surface an employee from another organization.
```

After

```ts
// Org-scoped: a report row written before #235 can still point across tenants, and the roster
// must not surface an employee from another organization.
```

**6c. `tests/unit/employee-access.test.ts:111`** (same stale claim, one directory over — §4.3)

Before

```ts
// createEmployee takes reportsToId as given, so a cross-tenant report row is writable.
// The relationship must not survive the org filter.
```

After

```ts
// Rows written before #235 can still point across tenants (every writer validates now).
// The relationship must not survive the org filter.
```

**6d. OPTIONAL — `prisma/schema.prisma`, above `reportsToId String?` in `model Employee`.** Comment only; no `db push`, no `generate` semantics change. Mirrors the existing `branchId` comment three lines below, which is the reason that column never grew this bug.

```prisma
  // Primary manager. Postgres cannot express "reportsTo.organizationId == this employee's", so
  // every service-layer writer verifies it (#235) — `assertManagerInOrg` in services/employees.ts.
  reportsToId              String?
```

_Include it._ It targets the issue's stated hazard (future consumers inheriting an unenforced assumption) at the one file every future writer reads first.

### Step 7 — OPTIONAL, recommend **separate issue**: `dashboard.ts` org scoping

Per §0.1, `getManagerMetrics` is the one `reportsToId` consumer that does not re-scope. The fix is two `where` clauses:

```ts
	const directReports = await db.employee.findMany({
		where: { reportsToId: employee.id, user: { organizationId } },
		select: { id: true }
	})
	...
		db.employee.count({
			where: { reportsToId: employee.id, employmentStatus: 'ACTIVE', user: { organizationId } }
		}),
```

**Recommendation: file it as its own issue, do not include it in the #235 PR.** It is a different defect (a read that trusts an unscoped relation) in a different service, it needs its own regression test, and #235's write guard removes its precondition for every new row. If the reviewer prefers defence-in-depth in one PR, it is a clean two-line add — but it should be an explicit decision, not a silent rider.

---

## 6. Tests

### 6.1 New file: `tests/unit/reports-to-scoping.test.ts`

Naming follows the repo's focused-scoping convention (`loan-write-scoping.test.ts`, `payroll-run-scoping.test.ts`, `report-scoping.test.ts`). Harness is the union of `tests/unit/employee-number.test.ts` (create path) and `tests/unit/employee-api-compensation.test.ts` (route path).

Hoisted `dbMock` must provide: `user.{findUnique,create}`, `employee.{findFirst,findMany,create,update}`, `organization.{findUniqueOrThrow,findUnique}`, `leaveType.findMany`, `leaveBalance.{findMany,createMany}`, `employeeCompensation.{create,findMany}`, `employeeEmploymentType.{create,findMany}`, `payrollRun.findFirst`, `$transaction`. Module mocks: `$lib/server/db`, `$lib/server/audit`, `bcrypt`, and `$lib/server/services/action-proposals` (factory mocks replace the whole module, so both `createProposal` and `assertMayConfirmProposal` must be present — see `employee-api-compensation.test.ts:35-40`).

`db.employee.findFirst` call ordering per path — the thing to get right in the mocks:

- **create:** only the manager lookup. (`nextEmployeeNumber` uses `tx.employee.findMany`.)
- **update:** #1 `getEmployee` subject → #2 manager lookup.
- **PATCH (non-pay body):** #1 `getEmployee` inside `updateEmployee` → #2 manager lookup → #3 `getEmployee` re-fetch for the masked response.

| #   | describe / it                                                              | Asserts                                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `createEmployee` — **refuses a manager from another tenant**               | `findFirst → null`; rejects `{ status: 404 }`; `user.create`, `employee.create` and `$transaction` **never called**                                                                                                                                                                               |
| 2   | `createEmployee` — accepts a same-org manager and writes the line          | `findFirst → { id: 'mgr1' }`; `employee.create` called with `data.reportsToId === 'mgr1'`                                                                                                                                                                                                         |
| 3   | `createEmployee` — no lookup when the hire has no reporting line           | input without `reportsToId`; `employee.findFirst` **not called**; create still happens _(this is also what keeps `employee-number.test.ts` green — its `dbMock.employee` has no `findFirst`)_                                                                                                     |
| 4   | `createEmployee` — manager validation runs before password hashing         | `user.findUnique → null` (no duplicate email); manager lookup `findFirst → null`; asserts the manager lookup is called, and is called **before** `bcrypt.hash`; `bcrypt.hash` **not called** _(proves the guard runs first, not only that hashing was skipped — pins the Step 2 insertion point)_ |
| 5   | `updateEmployee` — **refuses a manager from another tenant**               | `findFirst`: EMP then `null`; rejects `{ status: 404 }`; `employee.update` **not called**                                                                                                                                                                                                         |
| 6   | `updateEmployee` — accepts a same-org manager                              | `findFirst`: EMP then `{ id: 'mgr1' }`; `employee.update` called with `data.reportsToId`                                                                                                                                                                                                          |
| 7   | `updateEmployee` — refuses self-report                                     | `reportsToId === id`; rejects `{ status: 400 }`; only ONE `findFirst` (no manager query); no update                                                                                                                                                                                               |
| 8   | `updateEmployee` — skips the check when the line is unchanged              | `existing.reportsToId === input.reportsToId`; exactly ONE `findFirst`; update still happens                                                                                                                                                                                                       |
| 9   | `PATCH /api/v1/employees/[id]` — **cross-tenant `reportsToId` is refused** | `patch({ reportsToId: 'emp-other-org' })` → `res.status === 404`; `employee.update` **not called**                                                                                                                                                                                                |
| 10  | `PATCH /api/v1/employees/[id]` — same-org `reportsToId` still applies      | `res.status === 200`; `employee.update` data carries `reportsToId`                                                                                                                                                                                                                                |

Test 9 note: the route's catch (`+server.ts:169`) flattens **any** 404 to `'Employee not found'`, so assert on **status**, not message. That flattening is pre-existing and arguably desirable (a forged id learns nothing) — **do not change it**.

`EMP` fixture needs at minimum `{ id, userId, reportsToId, branchId, basicMonthlySalary, rateType, employmentType, startDate }` — `updateEmployee` reads `existing.reportsToId` (Step 3), `existing.branchId` (`:573`) and `existing.userId` (via `assertNotSelf`), and `getEmployee`'s heal-on-read (`:241-271`) reads the comp/type histories.

### 6.2 Existing tests that must stay green **unmodified**

- `tests/unit/promotion.test.ts:136-156` — proves the Step 4 refactor is behaviour-preserving (self 400, cross-org 404, mock call-count unchanged). **The single most important signal in this change.**
- `tests/unit/employee-number.test.ts` — all 10 cases; its `input` carries no `reportsToId`, so the new guard is skipped and its `dbMock.employee` (no `findFirst`) is still sufficient.
- `tests/unit/employee-api-compensation.test.ts` — the PATCH pay paths; no `reportsToId` in any body.
- `tests/unit/self-action-guards.test.ts:104-121, 228` — `updateEmployee`'s self-action guards and the self-service contact edit.
- `tests/unit/employee-access.test.ts` — behaviour unchanged; only the comment at `:111` is edited (Step 6c).
- `tests/unit/recruitment-convert.test.ts` — `createEmployee` is mocked there; unaffected.

### 6.3 Validation gates — exact commands, in CI order

CI (`.github/workflows/ci.yml`, `quality` job) runs: install → `prisma generate` → `format:check` → `lint` → `check` → `test`. Format gates everything after it. Reproduce locally in the same order:

```bash
cd /home/hyuse/Desktop/VeentApps/veent_hris

# 0. once, if deps/Prisma client are stale (Node 22 + corepack pnpm per local-dev notes)
corepack pnpm install --frozen-lockfile
pnpm exec prisma generate            # required only if Step 6d touched schema.prisma; harmless otherwise

# 1. FORMAT — gates the rest in CI, so run it first
pnpm format:check
#    if it fails, format only what you touched (pnpm format rewrites the whole repo):
#    pnpm exec prettier --write src/lib/server/services/employees.ts \
#      src/lib/server/services/employee-access.ts \
#      tests/unit/reports-to-scoping.test.ts tests/unit/employee-access.test.ts prisma/schema.prisma

# 2. LINT
pnpm lint

# 3. TYPECHECK
pnpm check

# 4. UNIT — full suite
pnpm test

# fast inner loop while developing (vitest include = tests/unit/**):
pnpm exec vitest run tests/unit/reports-to-scoping.test.ts tests/unit/promotion.test.ts \
  tests/unit/employee-number.test.ts tests/unit/employee-api-compensation.test.ts \
  tests/unit/employee-access.test.ts tests/unit/self-action-guards.test.ts
```

Unit tests need **no** database (`vitest.config.ts`: `environment: 'node'`, all db access mocked). The Playwright `e2e` job is unaffected — no e2e spec or seed sets `reportsToId` through `createEmployee`/`updateEmployee` (`prisma/seed-core.ts:268,281,764,777` writes it **direct via Prisma**, same-org, bypassing the service).

### 6.4 Optional live verification (not a gate)

Only if end-to-end proof is wanted, using the same harness that verified PR #254 (`src/routes/api/v1/_dev/login-as/+server.ts` + curl, app on port 5434 via `./start.sh` with `.env.dev`):

1. As an HR actor in org A, `PATCH /api/v1/employees/<orgA-emp>` with `{"reportsToId": "<orgB-emp-id>"}` → expect **404** (was: 200 with the row written).
2. Same PATCH with an org-A manager id → expect **200**, row updated.
3. `POST` the onboarding form action with a forged cross-org `reportsToId` → expect a 404 response, and **no** `users`/`employees` row created.
4. Read-only check for pre-existing damage (psql; `Employee` maps to `employees`, columns are quoted camelCase):
   ```sql
   SELECT e.id, e."organizationId", m.id AS manager_id, m."organizationId" AS manager_org
   FROM employees e
   JOIN employees m ON m.id = e."reportsToId"
   WHERE m."organizationId" <> e."organizationId";
   ```
   Expect 0 rows. If not: report the ids — **do not** write a repair script (§4.2 H); the `employee-access.ts` backstop already prevents those rows from granting access.

---

## 7. PR description — points that must be carried across

1. **The issue text is wrong** and the PR must say so: the cited "correct" validation is in `promoteEmployee` (post-#222), not `updateEmployee`; `updateEmployee` never had one.
2. **Two holes closed, not one:** `createEmployee` (the issue's) and `updateEmployee` / `PATCH /api/v1/employees/[id]` (found during validation, live and reachable with plain JSON today).
3. **Error shape** is `promoteEmployee`'s, deliberately: **404 `Manager not found`** cross-org, **400** self-report (update/promote only). Not the uniform 400 the issue assumed.
4. **Flagged, not fixed — `dashboard.ts` `getManagerMetrics` is unscoped** (§0.1). This is the one consumer that makes a bad row actually leak (aggregate cross-tenant timesheet/leave counts). Needs its own issue.
5. **Flagged, not fixed — authorization asymmetry**: the v1 PATCH lets a MANAGER change a reporting line with no HR_ADMIN gate and no #224/#243 proposal routing, unlike the UI's `promote` path. Own issue.
6. **Noted gap:** `setAdditionalSupervisors`' org guard (`supervisors.ts:67-73`) is correct but has no unit test.
7. Per repo CLAUDE.md: **no `Co-Authored-By` / co-author trailer** on the commit. Branch per the local convention: `git switch -c fix/reports-to-org-scoping-235` off an **updated local `staging`**. Issues do not auto-close on merge here (merges land on `staging`, not the default branch) — close #235 by hand after verification.

---

## 8. Numbered checklist

1. `git switch staging && git pull` (fast-forward), then `git switch -c fix/reports-to-org-scoping-235`. **Never** `checkout -b origin/staging`.
2. `employees.ts` — add module-local `assertManagerInOrg(reportsToId, organizationId, selfId?)` between `:391` and `:393`. No new imports. _(Step 1)_
3. `employees.ts` `createEmployee` — insert `if (input.reportsToId) await assertManagerInOrg(input.reportsToId, organizationId)` after the 409 email check, **before** `bcrypt.hash`. _(Step 2)_
4. `employees.ts` `updateEmployee` — insert the guarded `assertManagerInOrg(input.reportsToId, organizationId, id)` after the `branchId` block, before `db.employee.update`. _(Step 3)_
5. `employees.ts` `promoteEmployee:924-932` — collapse the inline check to `await assertManagerInOrg(input.reportsToId, organizationId, id)`, keeping the surrounding `!== undefined && !== employee.reportsToId` condition and `columns.reportsToId = …`. _(Step 4)_
6. `supervisors.ts` — **verify only, no edit.** Confirm `:52-73` reads as described. _(Step 5)_
7. `employee-access.ts:64-68` and `:115-116` — replace the stale comments. _(Steps 6a, 6b)_
8. `tests/unit/employee-access.test.ts:111` — replace the stale comment; leave the test body alone. _(Step 6c)_
9. `prisma/schema.prisma` — add the two-line comment above `reportsToId String?` in `model Employee`. Comment only; no `db push`. _(Step 6d)_
10. Create `tests/unit/reports-to-scoping.test.ts` with cases 1-10 from §6.1.
11. `pnpm exec vitest run` on the six files in §6.3's inner loop. **`promotion.test.ts` must pass untouched** — if it does not, the Step 5 refactor changed behaviour: stop and re-derive.
12. `pnpm format:check` → `pnpm lint` → `pnpm check` → `pnpm test`, in that order, all green.
13. _(Optional)_ live verification §6.4, including the cross-tenant detection query.
14. Commit — concise subject + body, **no co-author trailer**. Suggested: `fix(employees): scope reportsToId to the actor's org on every writer (#235)`.
15. Open the PR against `staging` carrying all seven points from §7. File the two follow-up issues (dashboard scoping; PATCH reporting-line authorization) and link them.
16. **Do not** fold Step 7 (`dashboard.ts`) into this PR without an explicit decision from the reviewer.
