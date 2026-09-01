---
name: plan:hris-6-self-lookup-org-scoping
description: "PLAN for HRIS #6 — 43 employee self-lookups by userId ignore the active organization. Count re-derived on HEAD 3ce7d37 and confirmed at 43 sites / 26 files. Nine commits on one branch."
date: 01-09-26
issue: 6
branch: fix/self-lookup-org-scoping-6
complexity: MEDIUM
status: VALIDATED (CONDITIONAL, no FAILs) — all four validate concerns folded in. Awaiting owner go-ahead for EXECUTE.
---

# PLAN — HRIS #6: scope employee self-lookups to the active org

**Date**: 01-09-26 · **Branch**: `fix/self-lookup-org-scoping-6` (off `staging` @ `3ce7d37`)
**Predecessor**: PR #7 (`#4` + `#5`). That plan's **D6** deferred exactly this work here.

**TL;DR.** 43 sites, 26 files, nine commits. Forty of them are the mechanical edit the issue
describes. **Three are not**, and one of those three makes the codebase *worse* if the mechanical
edit is applied to it alone.

---

## Phase decisions (RIPER-5)

| Phase | Decision | Reason |
|---|---|---|
| RESEARCH | **RUN — done** | 43 sites needed individual reading. Three parallel agents, one per non-overlapping file group, plus a brace-balanced source scan run by the orchestrator. |
| SPEC | **SKIP** | The issue body *is* the spec: the defect, the exact fix shape, the file list and the test precondition are all stated. One product question remained (the empty-state behavior) and the owner answered it — see D1. Nothing else to discover. |
| INNOVATE | **SKIP** | One approach. The repo already fixed this pattern four times (`punch`, `profile`, `complaints`, `complaints/[id]`); the fix is to match them. The only alternative — a Prisma client extension that scopes every `employee` read implicitly — is rejected: many employee reads are legitimately org-wide or by explicit id, and an invisible global filter would break them silently. Rejected in one line, not explored for a phase. |
| PLAN | **RUN — this document** | 43 sites with three exceptions and a commit order that matters. |
| VALIDATE | **RUN, narrow** | Earned, not ceremonial: F1 below proves the naive fix is unsafe at one site, so the question "is any *other* site shaped like that one" must be answered before EXECUTE. Scoped to two questions (V1, V2), not a full four-dimension fan-out. |
| EXECUTE | **RUN — parallel** | Four agents on strictly non-overlapping file groups. Orchestrator holds git; agents run no git commands. |
| UPDATE PROCESS | **RUN, light** | Memory update + plan reconciliation only. |

---

## Owner decisions — LOCKED

| # | Decision |
|---|---|
| **D1** | **Empty state, not a redirect.** A page whose self-lookup now returns null renders normally and shows a short note ("You have no employee record in this organization"). Owner-selected. This matches `complaints/+page.server.ts:63` (empty list + `hasEmployee` flag) and `punch/+page.server.ts:52` (`linked: false` UI state). Sites that already redirect (`leave/new:13`) keep their redirect — they were already correct. |
| **D2** | **No new shared org-scope helper across files.** File-local helpers only, where a file repeats the identical lookup 3+ times. This mirrors PR #7's D1 and the `punch/+page.server.ts:40` precedent. The cross-file invariant is enforced by a **source sweep test**, not by a shared function. |
| **D3** | **`findUnique` → `findFirst` at every site.** `userId` is `@unique`, so `findFirst` returns the same single row; no ordering ambiguity is introduced. The method change is unavoidable — Prisma will not take a non-unique compound filter on `findUnique`. |
| **D4** | **The stale seed comment is fixed in this branch.** `prisma/seed-core.ts:465` still says the CEO has "no Employee record"; `:487` creates `EMP-900`. The issue asks for this and it is one line. |
| **D5** | **ATOMICITY, not ordering.** Where a null actor currently *widens* a query, the org filter and the fail-closed branch MUST be in the **same commit**. Ordering is the wrong invariant and validate caught this: "C1 first" can be satisfied while still splitting `/team` into filter-then-guard, which ships the regression in the intermediate commit — whereas an atomic `/team` commit is safe in any position. This matters because EXECUTE is four parallel agents with the orchestrator holding git, and the exact failure mode is "A1 wrote half of `/team`, orchestrator staged the file". The orchestrator verifies both halves are present before staging `team/+page.server.ts`. |

---

## Findings that change the plan

### F1 — `/team` widens to the whole org on null. CONFIRMED against source.

`src/routes/(app)/team/+page.server.ts:12`

```ts
const myEmployee = await db.employee.findUnique({ where: { userId: user.id } })
const isAdmin = canAny(user.roles, 'ADMINISTER_HR_RECORDS')
...
let memberScope: { id?: { in: string[] } } = {}
if (!isAdmin && myEmployee) {
    memberScope = { id: { in: await listReportIdsFor(myEmployee.id) } }
}
const members = await db.employee.findMany({
    where: { organizationId: user.organizationId, user: { isActive: true }, ...memberScope }
})
```

Verified in `src/lib/rbac.ts`:
- `:48` `VIEW_TEAM: ['MANAGER', 'HR_ADMIN', 'SUPER_ADMIN', 'CEO']` — the CEO passes the gate on `:10`.
- `:46` `ADMINISTER_HR_RECORDS: ['HR_ADMIN', 'SUPER_ADMIN']` — **the CEO is not in it**, so `isAdmin` is `false`.

So for the cross-org CEO in `org_jojo`, adding the org filter alone flips `myEmployee` to null, drops
`memberScope`, and returns **every active employee in `org_jojo`** — plus `autoDeriveFromPunches`
runs org-wide over the range regardless. The mechanical fix is a regression at this one site.

**Required shape** (both halves, one commit):

```ts
const myEmployee = await db.employee.findFirst({
    where: { userId: user.id, organizationId: user.organizationId },
    select: { id: true }
})
const isAdmin = canAny(user.roles, 'ADMINISTER_HR_RECORDS')
...
// #6: `{}` here means "no filter", which returns the whole org. A non-admin with no employee row
// in the ACTIVE org has no reports, so the answer is the empty list — never the unfiltered one.
// Same `[]`-not-`undefined` discipline as leave/+page.server.ts:38.
if (!isAdmin) {
    memberScope = { id: { in: myEmployee ? await listReportIdsFor(myEmployee.id) : [] } }
}
```

**Severity, corrected by validate. This is not a CEO policy question.** An earlier draft of this
plan softened F1 by noting the CEO holds `ADMINISTER_HR_ORGWIDE` (`rbac.ts:36`), so an org-wide
roster is arguably within their authority. That mitigation does not hold, because the reachable set
is not just the CEO:

- `switch-org/+server.ts:22-25` gates on **membership alone** — `db.userOrganization.findUnique(...)`,
  `if (!membership) error(403)`. There is no role condition.
- `model UserOrganization` (`prisma/schema.prisma:351-364`) has **no role column**. Verified.
- `rbac.ts:48` — `VIEW_TEAM` includes `MANAGER`. `rbac.ts:46` — `ADMINISTER_HR_RECORDS` does not.
  `rbac.ts:36` — `ADMINISTER_HR_ORGWIDE` does not either.

So the naive fix hands **any multi-org MANAGER** the entire other-org roster plus everyone's
attendance grid, in place of their own direct reports, with no authority argument available. That is
a privilege escalation, not a policy debate.

**Latent today, not live:** only the CEO is seeded multi-org (`prisma/seed-core.ts:477-483`). But
nothing in the code prevents a second membership for a manager, and the mitigation evaporates the
moment one exists. The fail-closed branch is required because the shape is wrong for **any**
non-admin actor.

Widening `/team`'s `isAdmin` to `ADMINISTER_HR_ORGWIDE` remains out of scope — `/team` deliberately
gates on `ADMINISTER_HR_RECORDS`, and changing that is a separate decision.

**Line-number correction:** the `if` is `team/+page.server.ts:35`, not `:34`.

### F2 — `/payslips` is a live cross-tenant money read. CONFIRMED against source.

`src/routes/(app)/payslips/+page.server.ts:9` is already `findFirst` and still has no org filter.
`user.organizationId` is bound on `:7` and never used. The entry query on `:21` scopes on
`employeeId` alone, and `payslipVisibleRunFilter` (`services/payroll/runs.ts:16`) is
`{ OR: [{status:'APPROVED'}, {period:{status:'RELEASED'}}] }` — **no org clause**.

So the CEO sitting in `org_jojo` is served their `org_seed` gross pay, deductions and net pay today.
It is their own money, so this is a session-context leak rather than a foreign-data leak, but it
crosses the tenant boundary. The org filter on `:9` closes it: the `org_seed` row does not resolve
in `org_jojo`, and the already-correct `!myEmployee` branch on `:16` renders the empty state.

### F3 — `reviews/[id]` coerces null to `''` for four write actions.

`src/routes/(app)/performance/reviews/[id]/+page.server.ts:147` — `myEmployeeId()` returns
`me?.id ?? ''`. Four actions (`saveSelf`, `submitScores`, `saveEmployeeComments`, `acknowledge`)
pass that empty string on as an employee id. Only `submitScores` has a local guard that happens to
reject it. An empty string type-checks as a valid id and defeats every downstream null guard.

**Fix:** the helper takes the user object, returns `string | null`, and all four callers
`return fail(400, { error: 'No employee profile found.' })` — the `profile/+page.server.ts:98`
precedent, already used verbatim at `leave/new/+page.server.ts:53`.

**Severity DOWNGRADED by validate, and the earlier claim was wrong.** An earlier draft said the
empty string "defeats every downstream null guard". It does not. All four services reject it:
`performance.ts:109` (`saveSelfAssessment`), `:157` (`submitScores`), `:215`
(`saveEmployeeComments`), `:325` (`acknowledgeReview`) — each compares the id against the review's
own and throws 409. `''` is never a cuid, so every path already fails closed.

F3 is therefore a **message-quality and hygiene** fix, not a security fix: today the user gets
*"Only the review subject can submit a self-assessment"* where the truthful answer is *"No employee
profile found."* Still worth doing, and cheap. Recorded as a downgrade rather than quietly softened,
because an overstated finding is what makes the next reader distrust the accurate ones.

### F4 — two sites cannot see the org and need a signature change.

| Site | Now | After |
|---|---|---|
| `services/dashboard.ts:110` | `getMyStatus(userId, asOf = new Date())` | `getMyStatus(userId, organizationId, asOf = new Date())`. **One caller**, `dashboard/+page.server.ts:84`, which already has `orgId` in scope and never passes `asOf`. |
| `routes/(app)/requests/[id]/+page.server.ts:112` | `myEmployeeId(userId: string)` | `myEmployeeId(user)` taking `{ id, organizationId }`, matching `findSelfEmployee(user)` at `punch/+page.server.ts:40`. |

### F5 — sites where a null actor is a DESIGNED input. Do not add a guard.

A blanket "null-guard everything" rule breaks these. Named so no reviewer or agent adds one:

- `dashboard/+page.server.ts:107/:182` — `?? null` feeds `canApprovePosting`, which has an
  intentional HR fallback for unmapped departments (`services/recruitment.ts:229`). An early return
  removes HR's posting-approval card.
- `services/performance.ts:281` — `releasedByEmployeeId: releaser?.id ?? null` is deliberate; the FK
  is `ON DELETE SET NULL` and the function's own doc block says an HR user with no employee row must
  still be able to release.
- `services/employee-access.ts:41/:86` — already `return false` / `return []`. `[]` never
  `undefined`: an undefined allow-list is dropped by Prisma and leaks the org.
- `api/v1/requests/+server.ts:15` — `[]` not `undefined`, for the same reason, with the rationale
  already in a comment at `:27`.

### F6 — the separation-of-duties guards go structurally inert, and that is acceptable.

At `services/timesheets.ts:442`, `services/leave.ts:100`, `services/approvals.ts:442` and
`routes/(app)/requests/timesheets/+page.server.ts:34`, a null actor **skips** the "you cannot review
your own" check rather than failing it. Safe today because the target row is independently
org-scoped before the check runs, so a cross-org actor can never be the owner. **Keep the existing
shape**; add a one-line comment naming the invariant so the next reader does not have to re-derive
it. Restructuring four SoD guards is not this issue.

**Validate corrected two citations here.** `approvals.ts:442` is not itself a "cannot review your
own" check — it is the self-lookup inside `countPendingApprovals`, a sidebar badge counter that
feeds `canActOnStage`. And at `requests/timesheets/+page.server.ts` the lookup is `:24`; `:34` is
the exclusion filter and the SoD call is `:50-56`. The conclusion is unchanged; the descriptions
were wrong.

**The target row really is org-scoped before each check.** Validate named the line for all four:
`timesheets.ts:434-435` (`employee: { organizationId }`, 404 at `:438`), `approvals.ts:208-209`
(for the `leave.ts:100` path, 404 at `:225`), `approvals.ts:373` and `:533` (for the two queues fed
by `approvals.ts:442`), and `requests/timesheets/+page.server.ts:35`. All sound.

**Put this in the comment too:** the *second* SoD bar at `approvals.ts:119` compares **User** ids
(`sod.actorId` / `decidedActorIds`), not Employee ids, so it keeps working across orgs and #6 does
not touch it. That is why the separation-of-duties story is not weakened overall.

### F6b — three more sites share F1's shape but do NOT widen. Comment them.

Validate swept all 43 and found **no second site that genuinely widens**. Three carry the same
syntax and are neutralised by an independent org filter on the target:

| Site | Mechanism | Neutralised by |
|---|---|---|
| `routes/(app)/requests/timesheets/+page.server.ts:34` | `...(myEmployee ? { employeeId: { not: myEmployee.id } } : {})` | `employee: { organizationId }` at `:35` |
| `services/approvals.ts:532` | same shape in `countActionableTimesheets` | `:533` |
| `routes/(app)/timesheets/+page.server.ts:56` → `services/timesheets.ts:70` | `excludeEmployeeId: myEmployee?.id` → `undefined` → spread dropped | `:68` |

**The rule that separates them from `/team`, and it is the thing to write down:** `/team` drops a
**positive restriction** ("only my reports"), and removing a positive restriction leaves no filter —
the result widens from a subset to everything. These three drop a **negative self-exclusion**
("everyone except me"), and removing that re-admits exactly one person's rows: the actor's own,
which the independent org filter has already excluded. The result is byte-identical.

Each of the three gets that invariant as a comment. No code change.

---

## The 43 sites

Re-derived on `3ce7d37` by a brace-balanced multiline scan (`findUnique|findFirst` on `employee`,
`where` containing `userId`, no `organizationId`). **43 unscoped, 7 already scoped, 50 total.** The
issue's count is exact. The 01-09-26 hand-off's doubt ("~15") was a grep artefact and is wrong.

| Group | Files | Sites |
|---|---|---|
| G1 services | employee-access(2) dashboard(4) timesheets(2) approvals(1) leave(1) requests/index(1) performance(1) | 12 |
| G2 requests+timesheets routes | requests(4) requests/approvals(3) requests/[id](2) requests/timesheets(1) timesheets(3) api/v1/requests(2) api/v1/requests/[id]/documents(1) | 16 |
| G3 remaining routes | attendance(1) attendance/export(1) dashboard(2) employees/[id](1) leave(1) leave/new(2) payslips(1) performance(1) performance/reviews/[id](2) team(1) api/v1/employees/../documents(1) api/v1/performance/reviews(1) | 15 |

Org value in scope at **every one of the 43** except the two in F4.
Behavior for a single-org user is **unchanged at all 43**: their only Employee row is in their only
org, and `session.currentOrgId` is null so hooks falls back to `user.organizationId`.

---

## Commits

Ordered. C1 first because it is the one that regresses if shipped half-done.

| # | Commit | Contents |
|---|---|---|
| **C1** | `fix(team): scope the self lookup and fail closed on no employee row (#6)` | `team/+page.server.ts` — org filter **and** the `memberScope` fail-closed branch together (F1, D5). |
| **C2** | `fix(payslips,leave): scope employee self-lookups to the active org (#6)` | `payslips`(1) `leave`(1) `leave/new`(2) `attendance`(1) `attendance/export`(1). F2 lands here. |
| **C3** | `fix(services): scope employee self-lookups to the active org (#6)` | All 12 G1 sites, including the `getMyStatus` signature change and its one caller (F4). |
| **C4** | `fix(requests,timesheets): scope employee self-lookups to the active org (#6)` | All 16 G2 sites, including `myEmployeeId(user)` (F4) and the four file-local helpers. |
| **C5** | `fix(performance,employees): scope employee self-lookups to the active org (#6)` | `performance`(1) `performance/reviews/[id]`(2) `employees/[id]`(1) `api/v1/performance/reviews`(1) `api/v1/employees/../documents`(1). F3 lands here. |
| **C6** | `fix(seed): correct the CEO no-employee-record comment (#6)` | `prisma/seed-core.ts:465`. D4. |
| **C7a** | `test: make employee mocks discriminate on the where clause (#6)` | The 9 HARD files below — their mocks have no `findFirst` at all. |
| **C7b** | `test: make employee mocks discriminate on the where clause (#6)` | The 12 COLLISION/SILENT files below. |
| **C8** | `test(scoping): assert the active-org self lookup at the sites that can widen (#6)` | New assertions for `/team`, `/payslips`, `myEmployeeId`, using a where-applying mock. |
| **C9** | `test(scoping): sweep every employee self-lookup for the org filter (#6)` | New source sweep. |

### C7 — existing tests that break. VERIFIED, and larger than the issue implies.

**21 test files, not 10.** An adversarial pass re-derived this from source and corrected an earlier
estimate: 11 files were missed and 3 severities were wrong. The corrected set is below.

**The root cause, verified by direct read.** `canTouchEmployee` holds BOTH shapes in one function:

- `services/employee-access.ts:41` — `findUnique`, the **self** lookup (one of the 43).
- `services/employee-access.ts:65` — `findFirst`, the **target** lookup (already correct, not ours).

After the fix both are `findFirst`, so they collide on a single `vi.fn()`. In
`tests/unit/employee-access.test.ts` the two are stubbed with different fixtures (`:44`
`findUnique → { id: 'mgr-emp' }`, `:47` `findFirst → { branchId: null }`). Post-fix the self lookup
receives `{ branchId: null }`, `self.id` is `undefined`, the self-access path silently stops
working, and the two fail-closed cases at `:131`/`:181` become no-ops that still report green.

`canTouchEmployee` is used across the app, so this collision reaches every scoping test — which is
why the count is 21 and not 10.

| Mode | Files |
|---|---|
| **HARD** (mock has no `findFirst`; TypeError) | `employee-reveal-access`, `requests-read-scoping`, `performance-release` (two mocks: `txMock:23` **and** `dbMock:30`), `performance-capture`, `performance-api-redaction`, `approval-queues`, `approval-api-role-context`, `timesheet-selfservice`, `payroll-read-scoping` |
| **COLLISION** (both stubbed, different fixtures, merge onto one) | `employee-access`, `review-privacy` (a **three**-way merge: route `:38` + `canTouch` self + `canTouch` target), `attendance-export-am-pm`, `payslip-access`, `payroll-run-scoping`, `punch-access`, `loan-write-scoping`, `loan-api-role-context`, `employee-patch-authorization` |
| **SILENT** (green, proves nothing new) | `pay-write-role-context`, `request-filing-role-context` (benign — both fixtures share an `id`), `proposal-queue` |
| **NONE** | `dashboard-org-scoping` — unaffected, but **not** for the reason first given. It imports only `getManagerMetrics`, and neither changing dashboard site (`:111` `getMyStatus`, `:459` `listUpcomingEvents`) is in that call path. It flips to affected the moment it imports `getMyStatus`. |
| **NONE, fragile** | `attendance-backlog-rbac`, `override-finalized-guard` — they import the attendance page's `actions` only, never `load`, and their mocks lack `findFirst`. Adding a `load` case during this issue turns them red instantly. |

**The finding that matters more than the count: 21 of 21 affected tests are blind to the `where`
clause.** They stub with `mockResolvedValue`, which discards the argument entirely, so they cannot
fail on a missing or wrong `organizationId` — green before the fix, green after, green if the fix
filters on the wrong column. (`punch-access` looks like an exception because it uses
`mockImplementation`, but `:55-58` says it discriminates on `select.branchId`, not on `where`. After
the change its self lookup falls into the wrong branch and returns `{ id: undefined }`.)

**So C7 is not a rename.** Each affected stub becomes a `where`-discriminating implementation:

```ts
dbMock.employee.findFirst.mockImplementation(({ where }) =>
    Promise.resolve(where.userId ? SELF : TARGET)
)
```

Three lines, inline, per file. **No shared test helper** — `tests/unit` has no helper module
convention (only `setup.ts`), every file is self-contained, and D2's reasoning applies to tests too.
The side benefit is the point: this converts the affected suite from `where`-blind to `where`-aware,
which is the property whose absence let 43 unscoped lookups ship green in the first place.

Because C7 touches 21 files, it splits into **C7a** (the 9 HARD files) and **C7b** (the 12 others),
so a failure is bisectable.

### C8 — the new tests, and why the obvious ones are worthless

Every existing mock uses `mockResolvedValue`, which **ignores the `where` clause entirely**. That is
precisely why 43 unscoped lookups shipped green. A test written that way cannot fail on this bug.
C8 uses the `mockImplementation(({ where }) => …)` shape from `dashboard-org-scoping.test.ts:113`,
returning the fixture row only when `where.organizationId` matches it.

Three assertions, each a defect that exists today:

1. **`/team`** — non-admin `VIEW_TEAM` holder whose employee row is in another org: assert the
   `findMany` receives `where.id === { in: [] }`. Positive control: same actor with a row in the
   active org still gets their reports. **Fails today** (the query goes out unfiltered).
2. **`/payslips`** — actor whose row is in another org: assert `payrollEntry.findMany` is never
   called and the load returns `payslips: []`. **Fails today** (it returns the home-org payslips).
3. **`myEmployeeId`** — assert it returns `null`, not `''`, and that each of the four actions
   returns `fail(400)`. **Fails today** (it returns `''`).

Per the repo's standing rule: each new guard is driven red before it is accepted green, and restored
by `cp` from scratchpad — never `git checkout`.

### C9 — the sweep

`tests/unit/self-lookup-org-sweep.test.ts`, modelled on `tests/unit/audit-client-sweep.test.ts`
(brace-balanced argument parsing, exact per-site allow-list, no wildcards). Walks `src/**`, finds
every `employee.findUnique|findFirst` whose `where` names `userId`, and **fails if the `where` does
not also name `organizationId`**. Expected result after C1-C5: **50 sites, 0 unscoped, allow-list
empty.** Following PR #7's lesson, the sweep fails loudly if a call site cannot be parsed rather
than skipping it — a skipped site is a silent hole.

**What C9 cannot do, named rather than left implicit.** The sweep checks that a `where` naming
`userId` also names `organizationId`. It has **zero** ability to detect the F1 class: a site can be
perfectly org-scoped and still widen when the actor is null, because the widening happens in a
*different* clause. The only cover for F1 is the hand-written `/team` assertion in C8.

Validate proposed a second sweep — flag any conditional spread into a Prisma `where` whose guard is
a self-lookup result, with an allow-list starting at the four known sites. **Not built.** Detecting
"this spread's guard variable came from a self-lookup" needs dataflow analysis, not the
brace-balanced text scan the existing sweeps use, and PR #7's own lesson is that a sweep which
cannot parse a site and skips it is worse than no sweep. The set has four known members, all four
now carry the invariant comment (F1, F6b), and the fifth would be introduced by someone writing a
new self-lookup — which C9 *does* catch, at the lookup. Revisit if a fifth ever appears.

---

## Verification gates

| Gate | Command | Expected |
|---|---|---|
| Types + lint | `pnpm check` | 0 errors. 1 pre-existing a11y warning on `CalculatorWindow.svelte` is the known baseline. |
| Unit | `pnpm test` | 2117 baseline + C8/C9 additions, all green. |
| Integration | `pnpm test:integration` | 4, unchanged. |
| Sweep | included in unit | 0 unscoped sites, allow-list empty. |
| Red-first | manual, per new guard | Each C8 assertion observed failing before the fix, restored by `cp`. |
| E2E manual gate | Playwright, driven by the orchestrator | Below. |

### The manual gate

`tests/e2e/tenancy-switch.spec.ts` already drives the CEO's org switch and `USERS.ceo` is seeded.
The precondition #6 needs is exactly the CEO plus `EMP-900`.

Steps, with the positive control that makes the negative meaningful:

1. Log in as `ceo@veent.ph`, tenant **Veent** (`org_seed`). Open `/payslips`, `/team`, `/profile`.
   Record what each shows. **This is the positive control** — the CEO has `EMP-900` here, so these
   pages must keep working after the fix.
2. Switch to **JoJo Potato** via the header switcher, waiting on the `switch-org` response as the
   existing spec does.
3. `/payslips` — must show the "No payslips yet" empty state, **not** the `org_seed` payslips.
4. `/team` — must show an **empty** roster, not JoJo Potato's staff.
5. Switch back to Veent and re-check step 1's pages still render the same. A guard that simply broke
   everything would otherwise look like a pass.

`pnpm dotenv -e .env.dev -- tsx scripts/seed-punches-demo.ts --clear` before any e2e run.

---

## Execution split — four agents, non-overlapping

| Agent | Files | Commit |
|---|---|---|
| A1 | `team`, `payslips`, `leave`, `leave/new`, `attendance`, `attendance/export` | C1, C2 |
| A2 | the seven G1 service files + `dashboard/+page.server.ts` (for the `getMyStatus` caller) | C3 |
| A3 | the seven G2 request/timesheet files | C4 |
| A4 | `performance`, `performance/reviews/[id]`, `employees/[id]`, the two `api/v1` files, `prisma/seed-core.ts` | C5, C6 |

`dashboard/+page.server.ts` belongs to **A2 only** — it holds both the `getMyStatus` caller and two
of the 43 sites, and must not be split across agents.

**A2 is told in advance that `src/routes/api/v1/dashboard/+server.ts` exists** and needs **no
edit**. It calls `getEmployeeMetrics` and `getManagerMetrics` at `:25`/`:27`; both already take
`organizationId` as a parameter, so only their internal `where` changes. Naming it up front stops
A2 "discovering" it mid-task and going out of scope.
Agents run **no git commands**. The orchestrator stages explicit paths and writes every message.
Every agent prompt carries the `[PONYTAIL]` directive.

---

## Out of scope, deliberately

- Restructuring the four SoD guards in F6.
- The `?? ''` sentinel anywhere outside `reviews/[id]:147`.
- Widening `/team`'s `isAdmin` to `ADMINISTER_HR_ORGWIDE`.
- The `'No employee profile found.'` / `'No employee profile found'` punctuation split.
- Adding an org clause to `payslipVisibleRunFilter` itself. F2 is closed by the employee lookup; the
  filter is used elsewhere and changing it is a wider blast radius than this issue.
