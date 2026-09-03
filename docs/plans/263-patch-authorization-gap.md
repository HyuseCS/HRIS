# Issue #263 — the v1 PATCH writes a reporting line (and an employment status) with no separation of duties

**Repo:** `veent_hris` (all paths below are repository-relative) · **Branch:** `fix/reports-to-org-scoping-235` · **HEAD:** `98ea3df4873bf487123f465279fdcdef82c1cc39`
**Baseline is NOT plain `staging`.** #235's fix is already committed on this branch (`98ea3df`, on top of `9e39689`). Every line/quote below was re-read at `98ea3df`, on disk, after the #235 diff — not at `staging`.
**Modes run:** PLAN → INNOVATE (per `.claude/skills/riper5/SKILL.md`). No repository file was modified by this pass.
**Delivery:** no new branch, no separate PR — see §9.

---

## 0. Ground truth re-verified at `98ea3df` (the RESEARCH pass was run against plain `staging`; its `employees.ts` line numbers are stale)

The RESEARCH report is substantively correct. Its `employees.ts` citations are all shifted by #235's `+25` lines, and two of its statements need sharpening. Re-verified table:

| Claim (RESEARCH §)                                                                 | Verified state at `98ea3df`                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PATCH guard chain (§1a)                                                            | **Confirmed, line-for-line.** `+server.ts:74` auth → `:77` `requireCapability(locals.user.role, 'MANAGE_HR')` → `:84` `canTouchEmployee(locals.user, params.id)` → `:88-93` `updateSchema.safeParse`. Unchanged by #235.                                                                                                                                                                           |
| `updateSchema` shape (§1a)                                                         | **Confirmed.** `+server.ts:20-39`. `employmentStatus: z.enum(['ACTIVE','ON_LEAVE','OFFBOARDED']).optional()` at `:29`; `reportsToId: z.string().optional()` at `:38` — still no `.min(1)`.                                                                                                                                                                                                         |
| Only pay/type split out of `rest`                                                  | **Confirmed.** `+server.ts:102` `const { basicMonthlySalary, rateType, employmentType, ...rest } = parsed.data`; `:153-155` `if (Object.keys(rest).length > 0) await updateEmployee(params.id, …, rest, ctx)`. `reportsToId` and `employmentStatus` both ride `rest`.                                                                                                                              |
| `updateEmployee` has **no** `proposeIfRequired` call                               | **Confirmed at this HEAD.** `updateEmployee` is now `employees.ts:571-652` (was `:548-621` on staging). `grep -n proposeIfRequired` → definition `:699`, call sites `:816` (`recordCompensationChange`) and `:1021` (`promoteEmployee`). **Exactly two, both pay writers.** Nothing in `updateEmployee`.                                                                                           |
| `assertNotSelf` field list excludes `reportsToId`                                  | **Confirmed.** `employees.ts:582-589` guards `jobTitle`, `departmentId`, `employmentStatus`, `endDate`. `reportsToId` absent. Pinned by `tests/unit/self-action-guards.test.ts:104-114`.                                                                                                                                                                                                           |
| `canTouchEmployee` returns true for one's own record                               | **Confirmed.** `employee-access.ts:52` `if (self.id === employeeId) return true`. So a `MANAGE_HR` holder reaches their own 201 file through the PATCH.                                                                                                                                                                                                                                            |
| `promoteEmployee` already has org-scope + self-report + proposal, all in one place | **Confirmed, and #235 made it tighter.** `employees.ts:955-958` is now `await assertManagerInOrg(input.reportsToId, organizationId, id)` (shared helper at `:402-409`); proposal at `:1020-1023`.                                                                                                                                                                                                  |
| `proposalPayloadSchema` already includes `reportsToId`                             | **Confirmed.** `employees.ts:1099-1110`, `.strict()`, `reportsToId: z.string().optional()` at `:1107`.                                                                                                                                                                                                                                                                                             |
| `applyProposedChange` routes `PROMOTION` → `promoteEmployee`                       | **Confirmed.** `employees.ts:1144-1147`, with `{ confirmTx: tx }`. The `else` at `:1148-1153` throws for an unknown domain rather than defaulting.                                                                                                                                                                                                                                                 |
| `ROLE_HIERARCHY` ranks MANAGER == HR_ADMIN                                         | **Confirmed verbatim.** `src/lib/rbac.ts:22-28`, comment: _"MANAGER is on-branch HR for JoJo/Sweetleaf (#133), so it ranks level with HR_ADMIN and clears every `requireMinRole('HR_ADMIN')` gate."_ So RESEARCH §2 stands: **the issue's option 1 is a no-op.**                                                                                                                                   |
| Nothing in the product calls this PATCH                                            | **Confirmed.** `grep -rn "api/v1/employees" src` returns route files and no `fetch`. `grep -rn "request.patch\|api/v1/employees" tests/e2e` → three e2e files touch `reportsToId` **direct via Prisma**, none PATCH. Only consumers are three unit tests importing `PATCH` directly: `employee-api-compensation.test.ts:41`, `pay-write-role-context.test.ts:63`, `reports-to-scoping.test.ts:47`. |

### 0.1 Two RESEARCH statements that need correcting

**(a) The `""` FK edge case is _half_ closed at this HEAD, not open and not closed.**
`updateEmployee`'s new guard is `if (input.reportsToId && input.reportsToId !== existing.reportsToId)` (`employees.ts:609`). `''` is **falsy**, so the guard is skipped and `data: input` still hands Prisma `reportsToId: ''` → `P2003` → the route's catch (`:167-174`) maps only 404/400/409 → **500**. `promoteEmployee`'s guard is `input.reportsToId !== undefined && …` (`:955`), so `''` there **does** reach `assertManagerInOrg('')` → `findFirst` returns `null` → clean **404**. Consequence for this plan: §5's routing change closes the edge on the live route as a by-product, without a schema change. See §6.5.

**(b) The `employmentStatus` gap is worse than "no `endDate`, no deactivation" — it is session-relevant.**
`src/lib/server/access-guard.ts:1-9` is explicit: _"offboarding deactivates the employee's login (`User.isActive = false` — set by `offboardEmployee` and `finalizeSeparation`). The auth hook must then block any session the offboarded employee still holds."_ `isSessionBlocked` keys on `User.isActive` **only**. `PATCH { employmentStatus: 'OFFBOARDED' }` writes the Employee column and never touches `User.isActive`, so the roster, payroll (`payroll/index.ts:146`, `payroll/calculator.ts:282`), attendance (`attendance/index.ts:114,535`) and clock-in (`timelog.ts:41`) all treat the person as gone while their **session and login stay live**. That is an authorization outcome, not a data-integrity nit, and it is what moves item (3) from "nice to have" to in-scope.

### 0.2 Three facts established by fresh greps that the plan below leans on

1. **`employmentStatus` reaches `updateEmployee` from exactly one caller: this PATCH.** `grep -rn "updateEmployee" src` → 5 call sites (`(app)/employees/[id]/+page.server.ts:462`, `(app)/profile/+page.server.ts:122`, `(app)/departments/+page.server.ts:103`, `api/v1/employees/[id]/+server.ts:154`). Neither the 201 page's `updateSchema` (`+page.server.ts:~250-320`) nor `/profile`'s nor `/departments`' carries `employmentStatus` or `endDate` — `grep -n "employmentStatus\|endDate"` across those three files returns only unrelated `where` clauses and the `offboard` action's `endDate`. **`UpdateEmployeeInput.endDate` has no caller at all.**
2. **Nothing in the product ever sets `ON_LEAVE` on the Employee row.** `grep -rn "ON_LEAVE" src` → attendance day-status enums and badge colours only. Leave approval does not touch `Employee.employmentStatus`. So `ON_LEAVE` is reachable _only_ through this PATCH, and setting it silently drops the employee from every `employmentStatus: 'ACTIVE'` payroll/attendance query.
3. **The proposals queue already renders a reporting-line change.** `(app)/requests/proposals/+page.server.ts:144-151` reads `d.reportsToId` off the parsed payload and emits `add('Reports to', <old manager name>, <new manager name>)`, resolving both through a `managerName` map built at `:108`. `+page.svelte:14-16` labels domain `PROMOTION` as "Promotion". **A `reportsToId`-only `PROMOTION` proposal is already a first-class, fully-rendered row today** — the UI's `?/promote` action produces exactly one whenever a MANAGER re-points a report. Zero UI work is needed by this change.

---

# [MODE: PLAN] — first-pass draft

_Recorded as drafted. The INNOVATE critique in §4 **reverses decision D3** and adds two consequences to D1 that this draft missed. §5 is the version to implement._

Draft consisted of:

1. **D1** — split `reportsToId` out of `rest` in the PATCH and fold it into the existing `promoteEmployee` call, rather than teaching `updateEmployee` to propose. (§1)
2. **D2** — the self-action gap is covered by `proposeIfRequired`'s self branch, which D1 puts in the path. **Do not** add `reportsToId` to `assertNotSelf`. (§2)
3. **D3** — reject an `employmentStatus` change **inside `updateEmployee`**, at the service write boundary, matching the placement doctrine `assertNotSelf` and `proposeIfRequired` are documented with. (§3) ← **reversed in §4.1**
4. **D4** — correct `specs/001-hris-platform/contracts/employees.md` for the two endpoints this change touches, and only those. (§4 of the draft, kept as §5 Step 4)
5. **D5** — `""` needs no new code. (§6.5)
6. One new unit test file; full validation gate; commits land on the #235 branch.

---

## 1. D1 — how `reportsToId` gets proposal routing

Two live options. Both close the gap; they differ in how much machinery they build.

### Option A — route the PATCH's `reportsToId` to `promoteEmployee` (**chosen**)

Destructure `reportsToId` out of `rest` alongside the pay fields and add it to the **existing** `promoteEmployee` invocation at `+server.ts:137-142`, widening the trigger condition at `:131-135`.

**For:**

- **`promoteEmployee` already is the whole fix.** In one function, already written and already tested: the org-scope + self-report guard (`:955-958`, shared `assertManagerInOrg` since #235), the `proposeIfRequired` call (`:1020-1023`), the audit entry that names `reportsToId` (`:1076-1078`), and the no-change rejection the route already knows how to swallow (`NO_CHANGE_MESSAGE`/`NO_CHANGE_STATUS`, `:867-868`, swallowed at `+server.ts:143-151`).
- **It makes the two doors identical rather than merely similar.** #263's complaint is that the API twin diverges from `?/promote`. After this, both doors call the same function with the same input shape. That is a stronger guarantee than "two implementations that agree today".
- **The precedent is in this exact file, seven lines up.** `+server.ts:95-102` already splits a field subset out of `updateSchema` and sends it to a stricter writer, for the same structural reason ("this column has a proper writer"). The 202 contract that a filed change needs (`:130`, `:163-165`) also already lives here, pay-only. Widening it is a two-token change.
- **Zero schema, enum, migration or UI work.** §0.2(3): the queue renders it already.
- **It closes the `''` edge for free.** §0.1(a).

**Against:** it inherits `promoteEmployee`'s _other_ guards, one of which is a behaviour delta. See §4.2 — the critique found it, the draft did not.

### Option B — give `updateEmployee` its own `proposeIfRequired` call

Mirror `recordCompensationChange`'s shape inside `updateEmployee`, gated on `input.reportsToId`.

**Against — four findings, in order of how hard they are to work around:**

1. **`updateEmployee` has no `confirmTx` support.** `ProposalWriteOpts` (`employees.ts:680-682`) is threaded through `recordCompensationChange` and `promoteEmployee` only, and its doc (`:667-679`) is emphatic that `confirmTx`'s presence carries _both_ "write on this client" and "skip the propose branch", deliberately as one field so they cannot drift. Option B has to add the parameter, thread the client through `db.employee.update` and `writeAuditLog`, and re-derive that invariant a third time.
2. **The payload does not fit.** `proposeIfRequired` stores the writer's input verbatim (`action-proposals.ts:118-119, 150`) and `proposalPayloadSchema` is `.strict()` (`employees.ts:1110`) precisely so a drifted payload fails loudly. `UpdateEmployeeInput` has ~30 fields, almost none of which are in that schema. So Option B must either file a _synthetic_ `{ reportsToId }` payload (a payload that is not the writer's input — breaking the one property the confirm path depends on) or widen `proposalPayloadSchema` to the union of two unrelated interfaces.
3. **`applyProposedChange` has nowhere to send it.** `:1135-1153` dispatches `COMPENSATION` → `recordCompensationChange`, `PROMOTION` → `promoteEmployee`, else throw. A proposal filed by `updateEmployee` must be applied by `updateEmployee`, which means a third branch and a third `ProposalDomain` value — see §1.1.
4. **It splits one PATCH across two authorization outcomes inside one writer.** A body of `{ reportsToId, contactPhone }` would have `updateEmployee` file half of itself and write the other half, from inside a single function, with a single audit diff loop (`:622-649`) that would have to learn which keys it actually wrote. Option A gets the same split for free because the two halves are already two separate writers with two separate audit entries.

**Verdict: Option A.** Option B is roughly 60 lines of new proposal plumbing plus an enum value, to reach a state Option A reaches by moving one identifier across a destructuring pattern.

### 1.1 `ProposalDomain` — reuse `PROMOTION`, do not add a value

`enum ProposalDomain { COMPENSATION, PROMOTION }` (`prisma/schema.prisma`, near `model ActionProposal`). Reuse `PROMOTION`. Four independent reasons, each verified:

1. **`proposalPayloadSchema` already carries `reportsToId`** (`employees.ts:1107`) — it was added for exactly this payload shape, because `?/promote` has always been able to file a reporting-line-only proposal.
2. **The apply path already re-validates it.** `PROMOTION` → `promoteEmployee(..., { confirmTx })` → `assertManagerInOrg` re-runs at confirm time (`:955-958`). A new domain would need its own apply branch and its own re-validation, i.e. a second place to get the org check wrong — the precise failure mode #235 was.
3. **The domain is semantically right, not a squeeze.** `promoteEmployee`'s own doc (`:882-884`) reads _"one atomic career event covering position, title, **reporting line**, employment type and pay"_. The reporting line is already inside `PROMOTION`'s definition in this codebase.
4. **The queue renders it today** (§0.2(3)) and the confirmer rule is already correct for it: `confirmerCapabilityFor` (`action-proposals.ts:31-33`) keys on self-vs-other, not on domain, so a reporting-line proposal gets `APPROVE_FINANCE` when self-filed and `ADMINISTER_HR_ORGWIDE` otherwise — which is exactly the rule #243 chose.

A new value (`REPORTING_LINE`) would additionally require a `db push` on every environment, a `domainLabels` entry, an `applyProposedChange` branch, and would **split the queue's history** so that a reporting-line change filed through the UI and one filed through the API carry different domains for the same edit — reintroducing the asymmetry #263 exists to remove.

### 1.2 One-call, not two

The trigger widens to a single `promoteEmployee` call carrying pay + type + `reportsToId`, **not** a second call. A PATCH carrying both must file **one** proposal, and `promoteEmployee` is already built to take all of them in one input (`PromoteEmployeeInput`, `:870-879`). Two calls would file two proposals for one request, each independently confirmable, and would defeat the "one atomic career event" property the writer exists for.

---

## 2. D2 — the self-action gap: one mechanism, not two

Once D1 lands, a `MANAGE_HR` holder PATCHing **their own** record's `reportsToId` reaches `promoteEmployee` → `proposeIfRequired` (`:699-715`), whose first condition is `employee.userId !== ctx.actorId` (`:707`). Self ⇒ a proposal is filed, `isSelfAction` is re-derived by `createProposal` (`action-proposals.ts:135`), and the confirmer must hold `APPROVE_FINANCE` (CEO / SUPER_ADMIN). The route returns **202**.

**Therefore: do NOT add `reportsToId` to `assertNotSelf`'s field list at `employees.ts:582-589`.** Three reasons:

1. **It would be a second guard for one gap** — the thing the task explicitly forbids. And it would win, because `assertNotSelf` runs at `:588` and the routed field never reaches `updateEmployee` at all after D1, so the added entry would be dead code on the live path and a hard 403 on any hypothetical future one.
2. **403 is the _wrong_ answer here, per a decision this repo already made.** #224 Part 2 / #243 deliberately converted self-actions on pay from `assertNotSelf`'s hard 403 to propose→confirm; `pay-proposal-routing.test.ts:11-13` records why — _"a CEO with no one above them could never record their own contractual raise"_. The reporting line sits in the same writer as pay, behind the same routing. Making it a 403 would be the only field in `promoteEmployee` that hard-fails on self.
3. **It matches the UI exactly, which is the point of #263.** `?/promote` on your own record files a proposal today (`pay-proposal-routing.test.ts:147-158` pins it for `jobTitle`; the same branch covers `reportsToId`). After D1 the API does the same thing.

The existing dual shape is precedent, not an inconsistency: `jobTitle` is **403 on self** through `updateEmployee` (`:583`) and **proposal-routed on self** through `promoteEmployee` — the split turns on which writer owns the field, not on the field. `reportsToId` is owned by `promoteEmployee`.

`assertNotSelf`'s current four entries stay untouched, and `self-action-guards.test.ts:104-114` must stay green **unmodified**.

---

## 3. D3 (as drafted — reversed in §4.1) — `employmentStatus`

### 3.1 What "symmetric" actually means here — read before deciding

`offboardEmployee` (`employees.ts:1188-1223`) does four things, in one transaction:

```ts
if (target.userId === ctx.actorId)
	error(400, 'You cannot offboard your own employee record — ask another admin to do it.')
const [employee] = await db.$transaction([
	db.employee.update({ where: { id }, data: { employmentStatus: 'OFFBOARDED', endDate } }),
	db.user.updateMany({ where: { employee: { id } }, data: { isActive: false } })
])
await writeAuditLog(ctx, {
	action: 'UPDATE',
	entityType: 'Employee',
	entityId: id,
	newValue: { employmentStatus: 'OFFBOARDED', endDate }
})
```

`finalizeSeparation` (`separation.ts:228-281`) does the same two writes (`:263-270`) **plus** a status-guarded `SeparationRecord` claim, a final-pay snapshot, and settling every ACTIVE loan and cash advance to `PAID`.

So the column is one of a **pair** (`employmentStatus` + `endDate`) and one of a **triple** with `User.isActive`, and in the separation flow one of a set of six. There is no coherent "symmetric" single-column write. And the reverse transition has no writer anywhere: nothing in the codebase turns `OFFBOARDED` back into `ACTIVE`, and nothing turns `isActive` back on.

### 3.2 Options

**(a) Reject `employmentStatus` on this path** — the change of behaviour is: `PATCH { employmentStatus }` becomes a 400 instead of a partial, session-leaking write.

**(b) Give `updateEmployee` the missing side effects** — set `endDate` and flip `User.isActive` when `employmentStatus` changes. **Rejected:**

- It makes `updateEmployee` the **third** hand-written copy of the offboard semantics (after `offboardEmployee` and `finalizeSeparation`) — the exact drift mechanism #235's own INNOVATE section (`docs/plans/235-reportstoid-cross-tenant.md:100-108`) identified as the cause of that bug.
- It cannot express reactivation coherently: clear `endDate` to what? Re-activate the login of someone with a **FINALIZED** `SeparationRecord` whose loans were force-settled to `PAID` and whose final pay was snapshotted? There is no product decision behind any of those answers, and inventing one in a security fix is exactly the speculative scope CLAUDE.md §2 forbids.
- It cannot express `ON_LEAVE` at all — §0.2(2): no writer sets it, and setting it silently removes the employee from payroll.
- No consumer is asking for it (§0, last row: nothing in the product calls this route).

**Chosen: (a), reject.** Reject **all three** values, not just `OFFBOARDED`:

- `OFFBOARDED` → `POST ?action=offboard` exists and does it correctly, self-guard included.
- `ACTIVE` (un-offboarding) → no writer exists; doing it through here produces an employee the roster calls active and the auth hook still locks out.
- `ON_LEAVE` → no writer, no reader that distinguishes it from ACTIVE on the roster (`offboardedFilter`, `:147-166`, groups them), and three readers that treat it as "not ACTIVE" and silently exclude the person from payroll and clock-in.

**It must be a loud 400, not a schema removal.** This is #235's own lesson, recorded at `docs/plans/235-reportstoid-cross-tenant.md:77`: `updateSchema` is a plain `z.object`, so Zod **strips** unknown keys — deleting `employmentStatus` from `:29` yields a **200 with the field silently discarded**. Silent data loss on a write is a worse failure than the thing it replaces. So the field stays in the schema, and the handler rejects it explicitly.

### 3.3 Placement (as drafted)

Put the rejection **in `updateEmployee`**, not the route — the placement doctrine this repo states twice: `proposeIfRequired`'s doc, _"in the service rather than the route, so the form action and its v1 API twin are covered by one check"_ (`employees.ts:696-697`), and `assertNotSelf`'s, _"Enforced in the service, not the route, so the form action and the v1 API twin are covered by one check"_ (`employee-access.ts:135-137`).

_(→ §4.1 reverses this.)_

---

# [MODE: INNOVATE] — critique of the draft above

## 4.1 The draft's outright mistake: D3's placement breaks an existing test, and the doctrine it cites does not apply

I applied the "guard in the service" doctrine mechanically. Tracing it against the actual code shows it produces a worse result, for two independent reasons.

**(a) It collides with `assertNotSelf`, and the collision is invisible until the suite runs.**
`updateEmployee`'s guards run in source order: `assertNotSelf` at `:582-589` (which lists `employmentStatus`), then the branch check, then the reportsTo check, then the write. A service-level `employmentStatus` rejection has to be placed relative to that:

- **Before `assertNotSelf`** → `{ employmentStatus: 'OFFBOARDED' }` on one's own record now returns **400**, not the **403 `SELF_ACTION_DENIED`** that `tests/unit/self-action-guards.test.ts:104-114` asserts (the loop at `:106-112` calls `refusesSelf`, which matches on the message constant). **That test goes red**, and the fix would be to edit a self-action regression test in a PR about authorization — precisely the kind of edit that should never be routine.
- **After `assertNotSelf`** → the test stays green, but the code now depends on an _ordering_ between two guards for its observable behaviour, with nothing in either guard's comment saying so. A future reorder silently converts a self-dealing 403 into a generic 400.

Neither is acceptable in a security change. The route-level placement has neither problem: `updateEmployee` is untouched, `assertNotSelf` keeps all four entries and all four behaviours, and `self-action-guards.test.ts` passes byte-identically.

**(b) The doctrine's own justification is absent here.** Both quoted comments give the _same_ reason — "so the form action and its v1 API twin are covered by one check". That reason presupposes **two doors**. §0.2(1) establishes there is exactly one: no form action, no other service caller, and no product code anywhere sends `employmentStatus` to `updateEmployee`. Guarding the single door at the door is not a doctrine violation; it is the doctrine's premise not being met. And the route already owns a field-subset split for exactly this reason (`+server.ts:95-102`).

**Reversed: the `employmentStatus` rejection goes in the route handler,** immediately after the destructure, before `ctx` is built and before any query.

**What is deliberately _not_ done, and why:** `UpdateEmployeeInput.employmentStatus` (`:80`) and `.endDate` (`:81`) stay in the interface, and `assertNotSelf`'s four-field list stays as-is, even though after this change no caller reaches either. That mirrors #235's own decision to keep `assertManagerInOrg` inside `updateEmployee` after the field stopped arriving there: a fail-closed backstop at the write boundary costs nothing and covers the next caller. It is also what CLAUDE.md §3 requires — my change orphans them, but they are guards, not dead helpers, and deleting a guard because the current caller set does not trip it is how #228 happened.

## 4.2 Two consequences of D1 the draft did not trace

**(a) `promoteEmployee` has a hire-date floor that `updateEmployee` does not — this is a real behaviour delta.** _(⚠ **REVERSED by §13.** The delta was filed as #266 and is now being fixed inside this PR rather than accepted. The analysis below is correct about the mechanism and kept for that reason; its conclusion — "accepted, not worked around" — no longer holds, and §6.1 case 7 is deleted with it.)_
`employees.ts:908-910`:

```ts
if (eff.getTime() < utcMidnight(employee.startDate).getTime()) {
	error(400, 'Effective date cannot be before the hire date.')
}
```

The route passes `effectiveDate: new Date()`. So for an employee whose `startDate` is in the **future** (a pre-boarded hire), `PATCH { reportsToId }` will now return **400 'Effective date cannot be before the hire date.'** where today it returns 200.

**Accepted, not worked around.** Three reasons: (i) the UI's `?/promote` has always behaved this way, and #263 is a request to make the API match the UI — carving an exception back out would rebuild the asymmetry in a new place; (ii) it fails **loudly and early**, before any write and before any proposal is filed (`:908` precedes `:1020`), so nothing half-applies; (iii) the reporting line for a pre-start hire is set at creation, by `createEmployee` from the onboarding form's org-scoped `<select>` — this is a genuinely narrow edge. **Flag it in the PR** as the one behaviour delta for a legitimate caller, and note that "a future-dated hire's reporting line cannot be edited before their start date" is arguably a pre-existing UI defect worth its own issue. Pinned by a test (§6.1 case 7) so it is a documented contract rather than a surprise.

**(b) `reportsToId` MUST be removed from `rest`, not merely added to the promote call.** If it is added to the `promoteEmployee` input and left in `rest`, `updateEmployee` writes the column immediately **while the proposal is pending** — a change that reads as "filed for confirmation" (202) but has already landed. That is strictly worse than the bug being fixed. The destructure is not cosmetic; it is the fix. Pinned by §6.1 case 4's `expect(dbMock.employee.update).not.toHaveBeenCalled()`.

## 4.3 Three smaller things found on the second pass

1. **The `NO_CHANGE` swallow now covers reporting lines too, and that is correct.** `+server.ts:143-151` swallows exactly `NO_CHANGE_STATUS`/`NO_CHANGE_MESSAGE`. A PATCH resending the **current** `reportsToId` makes `columns` empty with no pay change → `promoteEmployee` throws `NO_CHANGE` at `:960-962` → swallowed → 200, nothing written, **no proposal filed** (`:960` precedes `:1020`). That reproduces #235's own "skips the check when the reporting line is unchanged" semantics (`reports-to-scoping.test.ts:187-195`) through a different mechanism. Worth a test (§6.1 case 6) because the mechanism changed even though the behaviour did not. The route's comment at `:144-146` enumerates "salary/pay type/employment type" and must gain the reporting line, or the next reader will think the swallow is pay-only.
2. **The audit shape changes slightly, and the 201 timeline does not.** Today: `updateEmployee` writes `newValue: { _otherFields: ['reportsToId'] }` (`:641`). After: `promoteEmployee` writes `newValue: { effectiveDate, _otherFields: ['reportsToId'] }` (`:1057`, `:1078`). `getEmploymentHistory` (`:1300-1319`) only emits an event when a **`HISTORY_FIELDS`** entry changed, and `reportsToId` is deliberately not one (`:108-118`, and the comment at `:1076-1077`). Both shapes produce **zero** timeline events, before and after. **No timeline regression.** Verified by reading the loop, not assumed.
3. **`createProposal`'s notification says "A pay change is waiting for your confirmation."** (`action-proposals.ts:170-174`), and `confirmProposal`/`rejectProposal` say the same (`:224`, `:264`). Already inaccurate for the `jobTitle`-only and `reportsToId`-only `PROMOTION` proposals the UI files today; this change makes that shape reachable from a second door. **Out of scope — flag only.** It is a copy fix in a file this change does not otherwise touch, it affects three strings and their assertions, and CLAUDE.md §3 says mention, don't rewrite. Note it in the PR as a candidate follow-up.

## 4.4 The doc drift (task item 4) — corrected here, and here is the argument

`specs/001-hris-platform/contracts/employees.md:83-90` documents `PATCH /api/v1/employees/:id` as **`Roles: HR_ADMIN, SUPER_ADMIN`**. Verified wrong since #133 (the gate is `MANAGE_HR`, which holds MANAGER and CEO). Reading further, the same block is wrong in three more ways, and this change makes two of them worse:

- `**Request body**: Any subset of employee fields (partial update)` — already false (pay/type have routed to `promoteEmployee` since #170/#222) and about to be false in two new ways.
- No mention of the **202** response, which has existed since #224 Part 2.
- The next block documents `POST /api/v1/employees/:id/offboard` — the route is `POST /api/v1/employees/:id?action=offboard` (`+server.ts:180-182`) — with a body of `{ endDate, reason }`; `offboardSchema` (`:41-43`) takes `endDate` only.

**Decision: correct it, scoped to these two endpoint blocks only.** Argument: (i) it is the contract document for the exact endpoint this change alters, so it is inside the blast radius, not adjacent to it; (ii) the new 400 message points the caller at the offboard action, and shipping a pointer to a documented URL that does not exist is a defect I would be introducing; (iii) it is ~14 lines of markdown with no code risk. **Not** a doc sweep — every other endpoint in that file, and every other file under `specs/`, stays untouched and unread. If the reviewer prefers the drift as its own issue, dropping §5 Step 4 removes it cleanly with no dependency in either direction.

## 4.5 Alternatives brainstormed and rejected

| #   | Alternative                                                                                                                                           | Verdict                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | **Gate `reportsToId` on `requireMinRole('HR_ADMIN')`** (the issue's option 1).                                                                        | **Rejected — it is a no-op.** `ROLE_HIERARCHY` ranks `MANAGER: 2` and `HR_ADMIN: 2` (`rbac.ts:22-28`), `hasMinRole` is `>=` (`:32-34`), pinned by `tests/unit/rbac.test.ts` (`hasMinRole('MANAGER','HR_ADMIN') === true`). The check would admit exactly the actor it was written to exclude, and would read as protection to every future reader. `action-proposals.ts:40-43` warns about this shape by name. |
| B   | **Strip `reportsToId` from `updateSchema`** (the issue's option 2).                                                                                   | **Rejected**, same three reasons #235 rejected it (`docs/plans/235-reportstoid-cross-tenant.md:77-79`), the first of which is fatal: Zod strips unknown keys, so it is a **silent 200 no-op** on a write. Making it loud costs the code the option was meant to save — and then you still have no proposal routing, so it does not even fix #263.                                                              |
| C   | **Option B of §1 — `proposeIfRequired` inside `updateEmployee`.**                                                                                     | **Rejected** — §1, four findings. Needs `confirmTx` plumbing, a synthetic payload or a widened `.strict()` schema, a third `applyProposedChange` branch and a new `ProposalDomain`. ~60 lines to reach where Option A gets by moving one identifier.                                                                                                                                                           |
| D   | **New `ProposalDomain.REPORTING_LINE`.**                                                                                                              | **Rejected** — §1.1. Needs a `db push` everywhere, a new apply branch (a second place to get the org re-check wrong), a `domainLabels` entry, and it would give the same edit two different domains depending on which door filed it — rebuilding #263's asymmetry inside the queue. `PROMOTION` already carries `reportsToId` in `proposalPayloadSchema:1107` and renders it in the queue.                    |
| E   | **Add `reportsToId` to `assertNotSelf`.**                                                                                                             | **Rejected** — §2. A second guard for one gap; dead on the live path after D1; and 403 is the answer #224/#243 deliberately replaced with propose→confirm for every other field this writer owns.                                                                                                                                                                                                              |
| F   | **Give `updateEmployee` the `endDate` + `User.isActive` side effects.**                                                                               | **Rejected** — §3.2(b). A third copy of the offboard semantics after `offboardEmployee` and `finalizeSeparation`; no coherent reactivation semantics; no consumer asking.                                                                                                                                                                                                                                      |
| G   | **Add a `POST ?action=reactivate` while we are here.**                                                                                                | **Rejected — pure scope creep.** Nothing in the product reactivates an employee today, through any door. If it is wanted it needs a product decision about `endDate`, the `SeparationRecord`, and the settled loans — its own issue.                                                                                                                                                                           |
| H   | **`.min(1)` on `reportsToId` in `updateSchema`.**                                                                                                     | **Rejected as unnecessary** — §6.5. After D1 the field reaches `promoteEmployee`, whose `!== undefined` condition sends `''` into `assertManagerInOrg('')` → clean 404. Adding it would be a second, redundant validation.                                                                                                                                                                                     |
| I   | **Tighten `updateEmployee:609` from `if (input.reportsToId &&` to `!== undefined`** to close the residual `''` → 500 for hypothetical future callers. | **Rejected — do not touch #235's just-landed code for a hypothetical.** No caller reaches it after D1; the outcome is a 500 on a forged empty FK, i.e. robustness, not authorization. Documented in §6.5 and the PR instead.                                                                                                                                                                                   |
| J   | **Make `updateSchema` `.strict()`** so unknown keys 400 instead of being stripped.                                                                    | ~~Rejected — right idea, wrong PR.~~ **⚠ REVERSED — filed as #264 and folded in; see §12.** The rejection turned on "no test coverage over the callers"; §12.2 supplies that coverage by auditing every caller in the repo (there are six bodies, all in unit tests, all subsets of the schema) and finds the blast radius empty.                                                                              |
| K   | **Fix the "A pay change is waiting" notification copy.**                                                                                              | ~~Rejected — flag only.~~ **⚠ REVERSED — filed as #265 and folded in; see §14.** The rejection assumed "three strings **plus assertions**"; §14.2 finds **zero** test assertions on any of the three, so the change is three template literals and one lookup const, in a file nothing else in this PR opens.                                                                                                  |
| L   | **Fold #263 into `reports-to-scoping.test.ts`** rather than a new test file.                                                                          | **Rejected.** That file's docblock (`:4-12`) is a #235 narrative about cross-tenant writes, and its `dbMock` lacks `position`, `branch`, `employee.findUnique` and a tx client — everything `promoteEmployee` and a MANAGER-actor `canTouchEmployee` need. Extending it would blur two issues in one file's story. New file, §6.1.                                                                             |

---

# 5. FINAL PLAN — exact changes, in order

> **⚠ EXTENDED by §16.** #264, #265 and #266 were folded into this PR after this section was
> written. §16 is the authoritative step order. Steps 1–5 below are unchanged in content; §16 adds
> Steps 0a, 0b and 6 around them and renumbers. Nothing in Steps 1–4's diffs changes.

Every "before" block is the verbatim current text at `98ea3df`. Style: tabs, single quotes, no semicolons (prettier).

## Step 1 — `src/routes/api/v1/employees/[id]/+server.ts`: split the two fields out and reject `employmentStatus`

Replace `:95-108`.

**Before**

```ts
// #170/#222: pay and employment type must never be written straight onto the Employee row — both
// are effective-dated, so a bare Employee write would desync the history the payroll run reads.
// Split them out: everything else still goes through updateEmployee, while pay and type go to
// promoteEmployee, which records both as effective-today snapshots in ONE transaction. It has to
// be one call rather than two writers: the rate-basis pairing (#189) can only be validated on the
// resulting state, and a PART_TIME/HOURLY → REGULAR/MONTHLY change is invalid at every
// intermediate step. Resending the same values is a no-op, not an error.
const { basicMonthlySalary, rateType, employmentType, ...rest } = parsed.data
const ctx = {
	organizationId: locals.user.organizationId,
	actorId: locals.user.id,
	actorRole: locals.user.role,
	actorRoles: locals.user.roles
}
```

**After**

```ts
// #170/#222: pay and employment type must never be written straight onto the Employee row — both
// are effective-dated, so a bare Employee write would desync the history the payroll run reads.
// Split them out: everything else still goes through updateEmployee, while pay and type go to
// promoteEmployee, which records both as effective-today snapshots in ONE transaction. It has to
// be one call rather than two writers: the rate-basis pairing (#189) can only be validated on the
// resulting state, and a PART_TIME/HOURLY → REGULAR/MONTHLY change is invalid at every
// intermediate step. Resending the same values is a no-op, not an error.
//
// #263 puts `reportsToId` in the same split, for an authorization reason rather than a history
// one: promoteEmployee is the writer that routes a change through propose→confirm (#224 Part 2 /
// #243), and it is the only reporting-line path the UI has. Left in `rest` it reached
// updateEmployee, which has no proposal call at all — so a MANAGER re-pointed a reporting line
// unilaterally through the API while the same edit in the UI needed a second person. It must be
// destructured OUT, not merely added to the call below: written by both writers, the column would
// land immediately while the proposal it just filed is still pending.
const { basicMonthlySalary, rateType, employmentType, employmentStatus, reportsToId, ...rest } =
	parsed.data

// #263: employment status is not a plain column. `offboardEmployee` sets it together with
// `endDate` AND `User.isActive = false` — the flag `isSessionBlocked` reads (access-guard.ts) —
// so writing the column alone leaves an OFFBOARDED employee holding a live session, and writing
// it back to ACTIVE leaves a reactivated one locked out. ON_LEAVE has no writer anywhere and
// silently drops the employee from every `employmentStatus: 'ACTIVE'` payroll and attendance
// query. Rejected loudly rather than dropped from `updateSchema`: zod strips unknown keys, so a
// removal would make this a silent 200 that discards the field.
if (employmentStatus !== undefined) {
	return apiError(
		400,
		'Employment status is not editable here — offboarding goes through POST ?action=offboard, which also records the end date and deactivates the login.'
	)
}

const ctx = {
	organizationId: locals.user.organizationId,
	actorId: locals.user.id,
	actorRole: locals.user.role,
	actorRoles: locals.user.roles
}
```

`apiError` is already imported (`:13`). No new imports.

## Step 2 — same file: widen the `promoteEmployee` call

Replace `:123-146` (comment + condition + input + the head of the swallow comment).

**Before**

```ts
		// #224 Part 2 / #243: set when the pay change was filed for confirmation instead of applied.
		//
		// Runs BEFORE updateEmployee for the same reason as the pairing pre-check above, which the
		// pre-check alone no longer covers: promoteEmployee can now refuse for reasons that have
		// nothing to do with the values (a 409 when no one in the org could confirm the proposal).
		// Committing `rest` first would leave those rejections half-applied. Neither writer reads the
		// other's fields, so the order is free.
		let proposalId: string | undefined
		if (
			basicMonthlySalary !== undefined ||
			rateType !== undefined ||
			employmentType !== undefined
		) {
			try {
				;({ proposalId } = await promoteEmployee(
					params.id,
					locals.user.organizationId,
					{ basicMonthlySalary, rateType, employmentType, effectiveDate: new Date() },
					ctx
				))
			} catch (e: unknown) {
				// A PATCH resending the current salary/pay type/employment type is a no-op, not a failure —
				// swallow only the writer's "no change" 400 and let the (unchanged) record be returned. Any
				// other 400 (e.g. an invalid rate/type pairing) still propagates to the client below.
```

**After**

```ts
		// #224 Part 2 / #243 / #263: set when the change was filed for confirmation instead of applied.
		//
		// Runs BEFORE updateEmployee for the same reason as the pairing pre-check above, which the
		// pre-check alone no longer covers: promoteEmployee can now refuse for reasons that have
		// nothing to do with the values (a 409 when no one in the org could confirm the proposal).
		// Committing `rest` first would leave those rejections half-applied. Neither writer reads the
		// other's fields, so the order is free.
		//
		// ONE call, never one per field: a PATCH carrying pay AND a reporting line is one career event
		// and must file ONE proposal, or the two halves become independently confirmable.
		let proposalId: string | undefined
		if (
			basicMonthlySalary !== undefined ||
			rateType !== undefined ||
			employmentType !== undefined ||
			reportsToId !== undefined
		) {
			try {
				;({ proposalId } = await promoteEmployee(
					params.id,
					locals.user.organizationId,
					{ basicMonthlySalary, rateType, employmentType, reportsToId, effectiveDate: new Date() },
					ctx
				))
			} catch (e: unknown) {
				// A PATCH resending the current salary/pay type/employment type/reporting line is a no-op,
				// not a failure — swallow only the writer's "no change" 400 and let the (unchanged) record be
				// returned. Any other 400 (an invalid rate/type pairing, a manager outside the org, a
				// self-report) still propagates to the client below.
```

Nothing else in the `catch` changes: the match is still on `NO_CHANGE_STATUS` + `NO_CHANGE_MESSAGE` (`:148`).

## Step 3 — same file: the 202 comment

Replace `:160-162`.

**Before**

```ts
// 202, not 200: the pay change is on file awaiting a second authorized person, so `data` does
// NOT yet reflect it. Returning 200 would tell the caller their raise landed when it has not.
// Any non-pay fields in the same PATCH did apply — they are not routed through proposals.
```

**After**

```ts
// 202, not 200: the pay and/or reporting-line change is on file awaiting a second authorized
// person, so `data` does NOT yet reflect it. Returning 200 would tell the caller their raise or
// their re-org landed when it has not. Any other fields in the same PATCH did apply — they are
// not routed through proposals.
```

Comment only. The `if (proposalId)` branch (`:163-165`) is unchanged: `AWAITING_CONFIRMATION` (`employees.ts:664-665`) is already domain-neutral wording.

## Step 4 — `specs/001-hris-platform/contracts/employees.md`: the two endpoint blocks this change touches

Replace `:83-105` (the `PATCH` block through the end of the offboard block). Markdown only.

**Before**

```md
### PATCH /api/v1/employees/:id

Update employee fields.

**Roles**: `HR_ADMIN`, `SUPER_ADMIN`

**Request body**: Any subset of employee fields (partial update).

**Response 200**: Updated employee object.
**Side effect**: AuditLog `UPDATE` entry with `oldValue` / `newValue`.

---

### POST /api/v1/employees/:id/offboard

Mark employee as offboarded.

**Roles**: `HR_ADMIN`, `SUPER_ADMIN`

**Request body**: `{ "endDate": "2025-12-31", "reason": "string" }`

**Response 200**: `{ "status": "OFFBOARDED", "endDate": "..." }`
**Side effect**: User `isActive` set to `false`; AuditLog entry.
```

**After**

```md
### PATCH /api/v1/employees/:id

Update employee fields.

**Roles**: every `MANAGE_HR` holder — `MANAGER`, `HR_ADMIN`, `CEO`, `SUPER_ADMIN` (#133). A `MANAGER`
is additionally scoped to their own team and the branches they manage (#228).

**Request body**: Any subset of employee fields (partial update), with three carve-outs:

- `basicMonthlySalary`, `rateType`, `employmentType` — effective-dated; recorded as snapshots by the
  promotion writer, never written onto the employee row (#170 / #222).
- `reportsToId` — routed through the same writer, so a change filed by a `MANAGER`, or by anyone on
  their own record, needs a second authorized person to confirm it (#224 / #243 / #263).
- `employmentStatus` — **rejected with 400.** Offboarding goes through the action below, which also
  records the end date and deactivates the login.

**Response 200**: Updated employee object.
**Response 202**: `{ "data": …, "proposalId": "uuid", "notice": "…" }` — the change was filed for
confirmation and `data` does not yet reflect it.
**Side effect**: AuditLog `UPDATE` entry with `oldValue` / `newValue`.

---

### POST /api/v1/employees/:id?action=offboard

Mark employee as offboarded.

**Roles**: every `MANAGE_HR` holder, scoped as above. Nobody may offboard their own record.

**Request body**: `{ "endDate": "2025-12-31" }`

**Response 200**: `{ "data": { "employmentStatus": "OFFBOARDED", "endDate": "..." } }`
**Side effect**: User `isActive` set to `false`; AuditLog entry.
```

_Droppable without any code dependency if the reviewer prefers the drift as its own issue._

## Step 5 — service layer: **verify only, no edit**

Re-read and confirm, do not change:

- `employees.ts:402-409` `assertManagerInOrg` — reached from `promoteEmployee:956` on the new path.
- `employees.ts:582-589` `assertNotSelf`'s four-field list — **unchanged** (§2, §4.1).
- `employees.ts:605-611` `updateEmployee`'s `reportsToId` guard — **unchanged**; it stays as the write-boundary backstop for any future caller, exactly as #235 intended.
- `employees.ts:1099-1110` `proposalPayloadSchema` — already carries `reportsToId`; **no edit**.
- `prisma/schema.prisma` `enum ProposalDomain` — **no new value** (§1.1). No `db push`, no migration script.
- `(app)/requests/proposals/+page.server.ts:144-151` — already renders "Reports to: from → to"; **no edit**.

If any of these needs an edit to make the tests in §6 pass, the design in §1 is wrong — stop and re-derive rather than widening the diff.

---

## 6. Tests

> **⚠ REVISED by §17.** Case 7 below is **deleted and replaced** (#266 inverts its outcome), the
> table is renumbered, and three more files gain cases. §17 is the authoritative test spec.
> §6.2–§6.6 are amended in §17.5–§17.7.

### 6.1 New file: `tests/unit/employee-patch-authorization.test.ts`

Naming: the file pins what the **route** admits, matching `employee-api-compensation.test.ts` and `pay-write-role-context.test.ts` (subject + door), not the service-scoping convention of `reports-to-scoping.test.ts`. Harness is `pay-write-role-context.test.ts`'s (a MANAGER actor reaching the PATCH through `canTouchEmployee`) plus `pay-proposal-routing.test.ts`'s `position`/tx mocks.

Docblock must state the three things this file exists to catch, in the style of `pay-proposal-routing.test.ts:4-27`:

> #263 — the v1 PATCH wrote two privilege-relevant columns with none of the routing its UI twin has.
> `reportsToId` re-parents a reporting line, which decides who approves that employee's timesheets and
> leave; it reached `updateEmployee`, which has no `proposeIfRequired` call at all, so a MANAGER made
> the change alone while `?/promote` needed a second person. `employmentStatus` reached the same
> writer as a bare column, with none of `offboardEmployee`'s `endDate` or `User.isActive = false` —
> so an "offboarded" employee kept a live session. The plausible-looking wrong fix for the first is a
> `requireMinRole('HR_ADMIN')` gate, which admits MANAGER (`ROLE_HIERARCHY` ranks them level) and so
> describes an empty set.

**Mocks:** `$lib/server/db`, `$lib/server/audit`, `$lib/server/services/notifications` (`notify`), `$lib/server/services/supervisors` (`listReportIdsFor` + the other exports — a factory mock replaces the whole module), `$lib/server/services/action-proposals` (`createProposal` **and** `assertMayConfirmProposal`). `dbMock` needs `employee.{findFirst,findUnique,update}`, `employeeCompensation.{findMany,findFirst,create}`, `employeeEmploymentType.{findMany,findFirst,create}`, `payrollRun.findFirst`, `position.findFirst`, `branch.findMany`, `$transaction`.

**`db.employee.findFirst` call order — the thing to get right:**

- **HR_ADMIN actor:** `canTouchEmployee` short-circuits at `employee-access.ts:43` (`ADMINISTER_HR_ORGWIDE`), so #1 = `getEmployee` inside `promoteEmployee`, #2 = `assertManagerInOrg`, #3 = the route's masked re-fetch (only reached when nothing was filed).
- **MANAGER actor:** `canTouchEmployee` runs first — `employee.findUnique` (self) → `listReportIdsFor` (mocked) → `branch.findMany` → **`findFirst` #1** (target/branch check at `employee-access.ts:69`). Then #2 = `getEmployee`, #3 = `assertManagerInOrg`.
- Blanket `mockResolvedValue(EMP)` is fine wherever `assertManagerInOrg` should **pass** (it only checks truthiness); use `mockResolvedValueOnce` chains only where a specific lookup must return `null`.

| #                                                  | describe / it                                                                             | Asserts                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`reportsToId` is proposal-routed (#263)**        |                                                                                           |                                                                                                                                                                                                                                                                                                                                                                                 |
| 1                                                  | a bare `[MANAGER]` PATCHing a report's `reportsToId` **files a proposal, does not write** | `res.status === 202`; body has `proposalId: 'prop-1'` and `notice === AWAITING_CONFIRMATION`; `createProposal` called with `expect.objectContaining({ domain: 'PROMOTION', targetUserId: <target user>, payload: expect.objectContaining({ reportsToId: 'mgr2' }) })`; `dbMock.employee.update` **not called**; `dbMock.$transaction` **not called**                            |
| 2                                                  | a `[MANAGER, HR_ADMIN]` user writes directly — **200**                                    | `res.status === 200`; `createProposal` **not** called; `employee.update` called with `data.reportsToId === 'mgr2'`. _(#247's full-role-set rule, on the new field.)_                                                                                                                                                                                                            |
| 3                                                  | an actor re-pointing **their own** reporting line files a self-action proposal            | actor's `userId === EMP.userId`; `res.status === 202`; `createProposal` called with `targetUserId === <actor user id>` — the id `createProposal:135` derives `isSelfAction` from, and therefore the `APPROVE_FINANCE` confirmer. Uses an **HR_ADMIN** actor, so the routing is provably the _self_ branch and not the missing-capability branch (`employees.ts:707`). No write. |
| 4                                                  | **the field does not reach `updateEmployee` in the same request**                         | body `{ reportsToId: 'mgr2', contactPhone: '0917' }` as a bare `[MANAGER]` → 202; `employee.update` **not called** (so the reporting line did NOT land while its proposal is pending); `createProposal` called once. _(§4.2(b) — the single most important case in the file.)_                                                                                                  |
| 5                                                  | an HR_ADMIN acting on someone else still writes directly                                  | `res.status === 200`; `createProposal` not called; `employee.update` `data.reportsToId === 'mgr2'`. _(The 95%-of-usage path, unchanged.)_                                                                                                                                                                                                                                       |
| 6                                                  | resending the **current** reporting line is a no-op, not a 400                            | `EMP.reportsToId === 'mgr2'`, body `{ reportsToId: 'mgr2' }`, HR_ADMIN → `res.status === 200`; `createProposal` not called; `employee.update` not called. _(§4.3(1): the `NO_CHANGE` swallow now covers this path.)_                                                                                                                                                            |
| ~~7~~                                              | ~~a **future-dated hire's** reporting line is refused with the hire-date message~~        | **❌ DELETED — see §17.2.** #266 fixes the floor, so the expected outcome inverts from 400 to success. Replaced by two cases (§17.2 rows 7 and 8) that pin the new contract in both directions. The docblock reasoning in §4.2(a) is rewritten by §13.6, not silently dropped.                                                                                                  |
| 8                                                  | a **cross-tenant** manager id is still refused, and nothing is filed                      | `assertManagerInOrg`'s lookup → `null`; `res.status === 404`; `createProposal` **not** called; no write. _(Validation before filing, the rule `pay-proposal-routing.test.ts:270-309` pins for pay. Assert on **status**, not message — the route flattens every 404 to 'Employee not found' at `:169`.)_                                                                        |
| 9                                                  | an **empty-string** `reportsToId` is a clean 404, not a 500                               | body `{ reportsToId: '' }`; manager lookup → `null`; `res.status === 404`. _(§6.5 — pins that the field now takes the `!== undefined` path.)_                                                                                                                                                                                                                                   |
| **`employmentStatus` is not editable here (#263)** |                                                                                           |                                                                                                                                                                                                                                                                                                                                                                                 |
| 10                                                 | `OFFBOARDED` is refused                                                                   | `res.status === 400`; message mentions `?action=offboard`; `employee.update` **not called**; `dbMock.employee.findFirst` **not called** — the rejection precedes every query                                                                                                                                                                                                    |
| 11                                                 | `ACTIVE` and `ON_LEAVE` are refused too                                                   | loop both values → 400 each; no write. _(Not just the destructive value: `OFFBOARDED → ACTIVE` is the un-offboard that leaves `User.isActive` false.)_                                                                                                                                                                                                                          |
| 12                                                 | it does not take the rest of the PATCH down with it silently                              | body `{ employmentStatus: 'OFFBOARDED', contactPhone: '0917' }` → 400, and `employee.update` **not called**. _(The whole request is refused; the caller resubmits without the field. Pins that we did not build a partial-apply.)_                                                                                                                                              |
| 13                                                 | a PATCH with no `employmentStatus` is untouched by the guard                              | `{ contactPhone: '0917' }` → 200; `employee.update` called with `data.contactPhone`                                                                                                                                                                                                                                                                                             |

### 6.2 Existing tests that must stay green **unmodified**

| File                                                | Why it is the signal it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/self-action-guards.test.ts:104-121`     | **The single most important untouched test.** `:104-114` asserts `updateEmployee` returns 403 `SELF_ACTION_DENIED` for `{ employmentStatus: 'OFFBOARDED' }` and `{ endDate }` on one's own record. It is green **only** because the rejection went in the route, not the service (§4.1(a)). If it goes red, D3's placement was reverted by mistake.                                                                                                                                                                                                                                                                                                                 |
| `tests/unit/reports-to-scoping.test.ts` (all 10)    | #235's own file, on this branch. `:203-225`'s two **route** cases both send `reportsToId` through the PATCH: `:204-212` expects **404** for a cross-tenant id (still 404, now from `promoteEmployee`'s `assertManagerInOrg` — same helper, same status) and `:214-225` expects **200** with `employee.update` carrying `data.reportsToId`. ⚠️ **`:214-225` will need its mock chain re-sequenced**, because after Step 1 the write comes from `promoteEmployee`'s transaction rather than `updateEmployee`'s. See §6.3 — this is the one existing file this change is expected to touch, and touching it must be a deliberate, explained edit, never a convenience. |
| `tests/unit/pay-write-role-context.test.ts:148-162` | The MANAGER-actor PATCH pair. Body is `{ basicMonthlySalary: 50000 }` — no `reportsToId`, no `employmentStatus` — so the widened condition and the new rejection are both inert. Proves the pay path is byte-unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `tests/unit/employee-api-compensation.test.ts`      | Every PATCH body is pay-only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `tests/unit/promotion.test.ts`                      | ⚠ **AMENDED by §17.3.** `promoteEmployee`'s own guards, including `:144-157` (self-report 400, cross-org 404) — those stay green unmodified. #266 edits `promoteEmployee`, so this file **gains two cases**. Critically, its existing `:158-167` (`'refuses an effective date before the hire date'`) also stays green **unmodified** under the §13.4 design — see §13.5, which is the single finding that chose that design over the one #266 proposed.                                                                                                                                                                                                            |
| `tests/unit/pay-proposal-routing.test.ts`           | The routing decision itself. Untouched.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `tests/unit/rbac.test.ts`                           | `hasMinRole('MANAGER','HR_ADMIN') === true` — the fact that makes alternative A a no-op.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

### 6.3 The one existing test that needs a deliberate edit

`tests/unit/reports-to-scoping.test.ts:214-225` (`'still applies a same-org reportsToId'`). Today its mock chain is commented `// #1 getEmployee → #2 manager lookup → #3 getEmployee re-fetch` and it asserts `dbMock.employee.update.mock.calls[0][0].data.reportsToId === 'mgr1'`.

After Step 1, an HR_ADMIN's `{ reportsToId: 'mgr1' }` runs `promoteEmployee` → `getEmployee` (#1) → `assertManagerInOrg` (#2) → `db.$transaction(write)` → `tx.employee.update({ where, data: { reportsToId } })` → then the route's masked re-fetch (#3). The `dbMock` in that file has **no `$transaction` implementation returning a tx client with `employee.update`** other than the identity implementation set at `:94` (`fn(dbMock)`), so `tx.employee.update` **is** `dbMock.employee.update` — the assertion may well still pass unchanged. **Do not assume it.** Run the file first; if it passes, change only the stale ordering comment; if it fails, re-sequence the mock and update the comment to name `promoteEmployee` as the writer.

Either way the `:204-212` cross-tenant case keeps asserting **404** with **no write**, which is the contract that matters. **Do not weaken either assertion.** If closing #263 requires relaxing a #235 assertion, the design is wrong.

### 6.4 Validation gates — exact commands, in CI order

CI (`.github/workflows/ci.yml`, `quality` job): install → `prisma generate` → `format:check` → `lint` → `check` → `test`. Format gates everything after it.

```bash
cd <repo-root>

# 0. only if deps are stale (Node 22 + corepack pnpm, per the local-dev notes)
corepack pnpm install --frozen-lockfile

# fast inner loop first (vitest include = tests/unit/**)
pnpm exec vitest run \
  tests/unit/employee-patch-authorization.test.ts \
  tests/unit/reports-to-scoping.test.ts \
  tests/unit/self-action-guards.test.ts \
  tests/unit/pay-write-role-context.test.ts \
  tests/unit/employee-api-compensation.test.ts \
  tests/unit/pay-proposal-routing.test.ts \
  tests/unit/promotion.test.ts

# 1. FORMAT — gates the rest in CI, so run it before lint/check
pnpm format:check
#    on failure, format only what you touched (pnpm format rewrites the whole repo):
#    pnpm exec prettier --write \
#      src/routes/api/v1/employees/\[id\]/+server.ts \
#      tests/unit/employee-patch-authorization.test.ts \
#      specs/001-hris-platform/contracts/employees.md

# 2. LINT
pnpm lint

# 3. TYPECHECK
pnpm check

# 4. UNIT — full suite (this runs #235's tests too; the PR is both changes)
pnpm test
```

**No `prisma generate` is needed** — no `schema.prisma` change (§5 Step 5), no new enum value, no `db push`. Unit tests need no database (`vitest.config.ts`: `environment: 'node'`, all db access mocked). The Playwright `e2e` job is unaffected: no spec issues a PATCH to this route, and the three specs that touch `reportsToId` write it direct via Prisma.

### 6.5 The `""` FK edge case — **no code, and here is the proof**

Re-verified at `98ea3df`, against the actual branch, not the RESEARCH text:

- **On the branch today:** `updateEmployee:609` is `if (input.reportsToId && …)`. `''` is falsy ⇒ guard skipped ⇒ `data: input` ⇒ Prisma `P2003` ⇒ the route's catch (`:167-174`) matches only 404/400/409 ⇒ **500**. So it is **not** closed by `assertManagerInOrg` on that path.
- **After Step 1:** the field goes to `promoteEmployee:955`, whose condition is `input.reportsToId !== undefined && input.reportsToId !== employee.reportsToId`. `'' !== undefined` and `'' !== null` ⇒ `assertManagerInOrg('', org, id)` ⇒ `'' !== selfId` ⇒ `db.employee.findFirst({ where: { id: '', … } })` ⇒ Prisma returns `null` for a non-matching id (it does not throw) ⇒ `error(404, 'Manager not found')` ⇒ clean **404**.

**Closed on every reachable path, by the routing change, with no schema change and no `.min(1)`.** Test case 9 pins it. The residual falsy-skip inside `updateEmployee` is documented in the PR and **not** edited (§4.5 alternative I): after Step 1 nothing reaches it, the outcome is a 500 on a forged empty FK rather than an authorization failure, and #235's code was committed hours ago.

> **Superseded in review (PR #268).** CodeRabbit flagged the truthiness guards anyway, so both
> falsy-skips were closed after all: `createEmployee` and `updateEmployee` now test
> `input.reportsToId !== undefined`, matching `promoteEmployee`. The routing argument above still
> holds — this is defence in depth for the non-PATCH callers, not a fix for a reachable 500.

### 6.6 Optional live verification (not a gate)

Only if end-to-end proof is wanted, using the harness that verified PR #254 (`src/routes/api/v1/_dev/login-as/+server.ts` + curl, app on port 5434 via `./start.sh` with `.env.dev`). Run **after** #235's own §6.4 checks, since both ship together:

1. As a bare **MANAGER**, `PATCH /api/v1/employees/<a report>` with `{"reportsToId":"<another org-A manager>"}` → expect **202** with a `proposalId`; `SELECT "reportsToId" FROM employees WHERE id=…` unchanged; a `PENDING` row in `action_proposals` with `domain='PROMOTION'`.
2. Open `/requests/proposals` as an **HR_ADMIN** → the row renders "Reports to: <old> → <new>" (§0.2(3)). Confirm it → the column now moves.
3. As an **HR_ADMIN**, the same PATCH on someone else → expect **200**, applied immediately, no proposal row.
4. As an **HR_ADMIN**, PATCH **their own** record's `reportsToId` → expect **202**, `is_self_action` shape (initiator == target user) so only a CEO/SUPER_ADMIN can confirm.
5. `PATCH … {"employmentStatus":"OFFBOARDED"}` → expect **400**, and `SELECT "employmentStatus", "endDate" FROM employees WHERE id=…` unchanged. Then `POST …?action=offboard` with an `endDate` → 200, and `SELECT "isActive" FROM users WHERE …` is `false`.
6. `PATCH … {"reportsToId":""}` → expect **404**, not 500.

Table names are snake_case plural; camelCase columns need double quotes (per the #254 notes).

---

## 7. What this change deliberately does NOT do

> **⚠ REVISED by §18.** Points 2, 5 and 6 are now false — #264, #265 and #266 were folded in.
> §18 is the authoritative list.

1. **Does not add `reportsToId` to `assertNotSelf`** — §2. One mechanism per gap.
2. **Does not touch `updateEmployee`, `promoteEmployee`, `proposeIfRequired`, `proposalPayloadSchema`, `action-proposals.ts`, `schema.prisma`, or any `.svelte` file.** The whole service-layer fix is code that already exists; this change routes to it.
3. **Does not add a `ProposalDomain` value** — §1.1.
4. **Does not build reactivation** — §4.5(G).
5. **Does not make `updateSchema` `.strict()`** — §4.5(J). Own issue.
6. **Does not fix the "A pay change is waiting for your confirmation" notification copy** — §4.3(3). Own issue.
7. **Does not touch `updateEmployee:609`'s falsy check** — §6.5.

---

## 8. PR description — points that must be carried across (in addition to #235's own seven)

> **⚠ AMENDED by §19.** Point 5 is rewritten (the behaviour delta it describes is now fixed, not
> accepted) and point 10 is rewritten (the copy is now fixed, not flagged). §19 adds four more.

1. **The issue's option 1 is a dead check.** `ROLE_HIERARCHY` ranks `MANAGER` level with `HR_ADMIN` (`rbac.ts:22-28`), so `requireMinRole('HR_ADMIN')` admits the exact actor #263 is about. The real asymmetry is **proposal routing**, and that is what this closes.
2. **Two gaps closed, not one.** The reporting line (#263 as filed) and `employmentStatus` (found during research, in scope by explicit request): a bare column write with none of `offboardEmployee`'s `endDate` or `User.isActive = false`, so an "offboarded" employee kept a **live session** (`access-guard.ts:1-9`).
3. **How:** `reportsToId` and `employmentStatus` are split out of `rest` in the PATCH. `reportsToId` joins the existing `promoteEmployee` call — the writer that already holds the org-scope guard (#235), the self-report guard and the propose→confirm routing (#224/#243). `employmentStatus` is rejected with a 400 pointing at `?action=offboard`. **No service-layer code was changed.**
4. **Domain is `PROMOTION`, reused deliberately.** `proposalPayloadSchema` already carries `reportsToId` (`employees.ts:1107`), `applyProposedChange` already re-enters `promoteEmployee` (so the org check re-runs at confirm time), and `/requests/proposals` already renders "Reports to: from → to". A new domain would give the same edit two domains depending on which door filed it.
5. **One behaviour delta for a legitimate caller:** a **future-dated hire's** reporting line can no longer be changed through the PATCH before their start date — `promoteEmployee`'s hire-date floor (`:908-910`), which the UI's `?/promote` has always enforced. Fails loudly, before any write or filing. Pinned by a test. Arguably a pre-existing UI defect worth its own issue.
6. **Behaviour delta for an illegitimate one:** `PATCH { employmentStatus }` is now a 400 for all three values. **Nothing in the product calls this route** (`grep -rn "api/v1/employees" src` finds no `fetch`; zero e2e specs PATCH it), so the blast radius is external API callers only.
7. **`assertNotSelf` was NOT extended.** A self re-point files a self-action proposal (confirmer must hold `APPROVE_FINANCE`) rather than 403ing — matching what `?/promote` does today, and matching #224/#243's deliberate replacement of the hard self-block on this writer.
8. **The `''` → 500 edge is closed as a by-product** (§6.5). The residual falsy-skip in `updateEmployee:609` is unreachable from any caller and was left alone.
9. **Spec doc corrected** for the two endpoints touched (`specs/001-hris-platform/contracts/employees.md`): the PATCH's roles were documented as `HR_ADMIN`/`SUPER_ADMIN` (wrong since #133), the 202 was undocumented, and the offboard endpoint was documented at a URL that does not exist with a `reason` field that does not exist.
10. **Flagged, not fixed:** the proposal notification copy says "A pay change is waiting for your confirmation" for every domain (`action-proposals.ts:170-174`, `:224`, `:264`) — already inaccurate for `jobTitle`-only promotions today. Own issue.
11. Per repo CLAUDE.md: **no `Co-Authored-By` / co-author trailer.** Issues do not auto-close here (merges land on `staging`, not the default branch) — close **#235 and #263 by hand** after verification.

---

## 9. Delivery — no branch, no separate PR

> **⚠ REVISED by §20.** The branch decision is unchanged and still correct; the commit breakdown
> grows from "one or two" to five. §20 is authoritative.

**Execute directly on `fix/reports-to-org-scoping-235`, on top of `98ea3df`.** Do **not** `git switch -c` anything, and do **not** open a second PR.

- The branch is already checked out and already carries #235's committed fix.
- #263 is a formal GitHub sub-issue of #235 (`gh issue view 263` → `parent: Aguynamedkent7/Veent_HRIS#235`), it edits the same route and the same field, and it depends on #235's `assertManagerInOrg` being in place inside `promoteEmployee`.
- Add **one or two commits** on that branch. Suggested subjects (no trailers):
  - `fix(employees): route the v1 PATCH's reporting-line change through propose→confirm (#263)`
  - `fix(employees): refuse employmentStatus edits on the v1 PATCH (#263)`
  - (docs/spec correction may ride the first, or be a third: `docs(contracts): correct the v1 employee PATCH/offboard contract (#263)`)
- The two issues are **validated together and merged as ONE PR into `staging`**, whose description carries #235's seven points **and** the eleven above.
- Because both land in one PR, `pnpm test` in §6.4 is the gate for **both** changes — #235's `reports-to-scoping.test.ts` must be green at every commit, not only at the tip.

---

## 10. Numbered execution checklist

> **⚠ SUPERSEDED by §21.** Do not execute this list — it omits #264/#265/#266 entirely, and its
> step 16 files them as follow-ups instead of building them. **§21 is the list to run.**

1. Confirm the working tree: `git status` on `fix/reports-to-org-scoping-235`, `git rev-parse HEAD` == `98ea3df…`, clean tree. **Do not create a branch. Do not touch `staging`.**
2. Re-read `src/routes/api/v1/employees/[id]/+server.ts:95-165` on disk and confirm it matches §5's "before" blocks verbatim before editing.
3. `+server.ts` — add `employmentStatus` and `reportsToId` to the destructure at `:102`, extend the block comment above it, and insert the `employmentStatus` 400 immediately after, **before** `const ctx = {`. _(Step 1)_
4. `+server.ts` — widen the promote trigger at `:131-135` with `reportsToId !== undefined ||`, add `reportsToId` to the input object at `:140`, and extend the two comments (`:123`, `:144-146`). _(Step 2)_
5. `+server.ts` — reword the 202 comment at `:160-162`. Comment only; the branch below it is unchanged. _(Step 3)_
6. `specs/001-hris-platform/contracts/employees.md:83-105` — replace the PATCH and offboard blocks per Step 4. Markdown only. _(Droppable; if dropped, drop PR point 9 too.)_
7. **Verify-only pass, no edits:** `employees.ts:402-409`, `:582-589`, `:605-611`, `:1099-1110`; `enum ProposalDomain`; `(app)/requests/proposals/+page.server.ts:144-151`. If any of these seems to need an edit, **stop** — the design in §1 is wrong. _(Step 5)_
8. `pnpm exec vitest run tests/unit/reports-to-scoping.test.ts` **on its own, first.** If `:214-225` fails, re-sequence its mock chain and update the ordering comment per §6.3. **Do not weaken `:204-212`'s 404/no-write assertions.**
9. `pnpm exec vitest run tests/unit/self-action-guards.test.ts` — must pass **completely unmodified**. A red `:104-114` means the `employmentStatus` rejection landed in `updateEmployee` instead of the route (§4.1). Fix the placement, not the test.
10. Create `tests/unit/employee-patch-authorization.test.ts` with the docblock and all 13 cases from §6.1.
11. Run the §6.4 inner loop over all seven files. Cases 1, 3, 4 and 10 are the ones that would still pass against a subtly wrong fix — read their assertions, do not just watch them go green.
12. `pnpm format:check` → `pnpm lint` → `pnpm check` → `pnpm test`, in that order, all green. No `prisma generate` needed (no schema change).
13. _(Optional)_ live verification §6.6, all six steps, after #235's own live checks.
14. Commit onto the same branch — concise subject + optional body, **no co-author trailer**, no `.env`. Suggested subjects in §9.
15. Push the branch and open **one** PR against `staging` covering #235 **and** #263, carrying #235's seven points plus the eleven in §8.
16. File the three flagged follow-ups and link them: (a) `updateSchema` `.strict()` (§4.5 J); (b) the domain-agnostic proposal notification copy (§4.3(3)); (c) a future-dated hire's reporting line being uneditable before their start date (§4.2(a)). **Do not** fold any of them into this PR.
17. After merge, close **#235 and #263 by hand** — issues do not auto-close on a merge to `staging`.

---

---

# EXTENSION — folding #264, #265 and #266 into the same PR

**Written after §1–§10 were complete and before any of it was executed.** Nothing has been
committed for #263: `git status` is clean at `98ea3df`, so every "before" block below is still the
current text on disk and every diff in §5 still applies unchanged.

**Modes run for this extension:** PLAN (§11–§14) → INNOVATE (§15). §16–§21 are the revised
deliverables that supersede §5/§6/§7/§8/§9/§10.

---

# 11. [MODE: PLAN] — scope, collisions, and the order to build in

## 11.1 What the three issues are, and where they came from

They are **§10 step 16's own three follow-ups**, filed and then pulled back in:

| Issue    | §10 step 16 called it                                                       | Origin in this document                                    |
| -------- | --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **#264** | (a) `updateSchema` `.strict()`                                              | §4.5 alternative **J**, rejected as "right idea, wrong PR" |
| **#265** | (b) domain-agnostic proposal notification copy                              | §4.3(3) / §4.5 alternative **K**, "flag only"              |
| **#266** | (c) a future-dated hire's reporting line uneditable before their start date | §4.2(a), "accepted, not worked around"                     |

That matters for the review argument: none of the three is new scope discovered mid-build. Each
was found _by_ this plan's own research, argued in writing, and deferred on a stated reason. Folding
them in means **reversing three recorded rejections**, so each one below re-opens its original
argument and says what changed. Two reverse because the stated reason turned out to be factually
wrong (§12.2, §14.2); one reverses because the user decided the delta is a bug worth fixing rather
than a contract worth pinning (§13).

## 11.2 Collision matrix — measured, not assumed

`#263 core` = §5 Steps 1–3 (`+server.ts:95-165`) + Step 4 (`contracts/employees.md:83-105`).

| Item                   | Files / ranges it touches                                                                    | Textual overlap with #263 core                                                                                                                                                                                                                                                                                  | Behavioural coupling to #263 core                                                                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#264**               | `+server.ts:20-39` (`updateSchema`) — **one file, one range**                                | **None.** Same file, lines 20-39 vs 95-165. No shared hunk.                                                                                                                                                                                                                                                     | **Yes, one-directional and upstream.** `.strict()` fires inside `safeParse` at `:89`, which is _before_ the destructure at `:102`. #263's two carve-outs sit downstream of it. Traced in full in §12.1. |
| **#265**               | `action-proposals.ts` — one new const + three template literals (`:170-174`, `:224`, `:264`) | **None.** #263 core never opens this file, and §5 Step 5 lists it as verify-only.                                                                                                                                                                                                                               | **None.** No route, no writer, no guard. The only link is motivational: #263 makes a `reportsToId`-only `PROMOTION` reachable from a second door, which is _why_ the copy is worth fixing now.          |
| **#266**               | `employees.ts` `promoteEmployee` — the floor at `:906-910` moves to `:963`                   | **None.** #263 core edits no service file. `employees.ts` appears in §5 only as Step 5's verify-only list, and the floor is **not** on that list (`:402-409`, `:582-589`, `:605-611`, `:1099-1110`) — re-checked line by line, confirming #266 does not contradict any "do not edit" instruction already given. | **Yes, and it is destructive if ordered wrong.** #263's §6.1 case 7 asserts the floor's _current_ behaviour through the route. #266 inverts that assertion's expected outcome.                          |
| **#264 ↔ #265 ↔ #266** | —                                                                                            | **None between any pair.** Three different files, three different mechanisms.                                                                                                                                                                                                                                   | **None between any pair.**                                                                                                                                                                              |

Nothing in the matrix is a conflict. **All three are safe to fold in.** The one hazard is ordering,
and it is entirely #266's (a test written against the wrong floor semantics), which §11.3 removes.

## 11.3 The order — and why "first" and "last" are what they are

```text
1.  #264   .strict() on updateSchema                    (+server.ts:20-39)
2.  #266   the conditional hire-date floor              (employees.ts, promoteEmployee)
3.  #263   the core fix — Steps 1-3 + the new test file (+server.ts:95-165)
4.  #263   Step 4, the spec doc                         (contracts/employees.md)
5.  #265   domain-aware notification copy               (action-proposals.ts)
```

**#264 first.** It changes the _parse gate every later test in this PR runs through_. Written last
instead, every one of the 13+ route cases authored in step 3 would need re-verifying against a
changed `safeParse` outcome — including case 10's `dbMock.employee.findFirst` **not called**
assertion, which is a claim about how far a request gets before any query. Written first, the
route's admission rules are settled before a single route test exists. It is also the smallest and
most reversible of the three (one `.strict()`), so it validates the harness cheaply.

**#266 second, and specifically _before_ #263 core.** This is the ordering decision that actually
matters. Two properties make it the right way round:

- **#266 is independently observable and independently testable before #263 lands.** Today
  `reportsToId` reaches `updateEmployee`, not `promoteEmployee`, so the floor is unreachable _from
  the API route_. But it is fully reachable from `?/promote`, where its own regression test already
  lives (`promotion.test.ts:158-167`). So #266 can be built and proven at the service level in its
  own commit, with `promotion.test.ts` and `pay-proposal-routing.test.ts` as the gate, while
  #263 core has not moved a line.
- **The reverse order creates the exact failure the task forbids.** #263 core first ⇒ case 7 is
  authored asserting `400 'Effective date cannot be before the hire date.'` and goes green ⇒ #266
  then turns it red ⇒ the person holding the diff is now editing an assertion inside an
  authorization PR to make a later commit pass. That is the precise pattern §4.1(a) rejected for
  `self-action-guards.test.ts` and §6.3 hedged for `reports-to-scoping.test.ts`. Ordering #266
  first makes case 7 never get written wrong in the first place.

**#263 core third — untouched, in the middle, still the PR's subject.** Its diffs (§5 Steps 1–3)
are byte-identical to what §5 already specifies. It lands on a settled parse gate and a settled
floor, so its test file is authored **once**.

**#265 last, and deliberately detached.** It is the only one of the three with _zero_ coupling in
either direction — different file, different layer, no shared test. Putting it last means: the two
riskiest reviews (#266's service change, #263's route change) are read against an unmodified
notification module; and if a reviewer wants it out, dropping the final commit removes it with no
rebase and no dependency in either direction — the same droppability property §5 Step 4 has.

**What is NOT claimed:** that this order is the only safe one. #264 and #265 could each go anywhere.
The only hard constraint in the whole set is **#266 before #263 core**. Everything else is chosen
for review ergonomics and per-commit greenness, and says so.

## 11.4 The hard constraint, checked explicitly

> "none of #264/#265/#266 may weaken, regress, or complicate the core #263 fix"

| #263 core property                                                     | #264                                                                                                                                               | #265                                                                                                                                        | #266                                                                                                                                                 |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reportsToId` is destructured OUT of `rest` (§4.2(b) — the fix itself) | untouched                                                                                                                                          | untouched                                                                                                                                   | untouched                                                                                                                                            |
| `reportsToId` reaches `promoteEmployee` in ONE call (§1.2)             | untouched                                                                                                                                          | untouched                                                                                                                                   | untouched                                                                                                                                            |
| a MANAGER's re-point files a `PROMOTION` proposal, no write            | untouched                                                                                                                                          | changes only the **notification text** the confirmer sees; `createProposal`'s row, domain, payload, confirmer set and 409 are all untouched | untouched — #266 sits ~50 lines above `proposeIfRequired` and cannot reach a call that already returned                                              |
| a self re-point files a self-action proposal (§2)                      | untouched                                                                                                                                          | as above                                                                                                                                    | untouched                                                                                                                                            |
| `employmentStatus` is rejected with an actionable 400 (§4.1)           | **must be checked** — see §12.1. Answer: unaffected, because `employmentStatus` is a **known** key and `.strict()` only ever rejects unknown ones. | untouched                                                                                                                                   | untouched                                                                                                                                            |
| `assertNotSelf`'s four entries stay as they are (§2)                   | untouched                                                                                                                                          | untouched                                                                                                                                   | untouched                                                                                                                                            |
| `''` → clean 404, not 500 (§6.5)                                       | untouched — `''` is a _value_, not an unknown key, so `.strict()` never sees it                                                                    | untouched                                                                                                                                   | untouched — the floor is gated on what changed, and `''` still reaches `assertManagerInOrg`                                                          |
| the `NO_CHANGE` swallow covers reporting lines (§4.3(1))               | untouched                                                                                                                                          | untouched                                                                                                                                   | **narrow interaction, benign** — see §13.7(c): a no-change call has nothing in the floor's gate, so `NO_CHANGE` fires either way, at the same status |

**No row is weakened.** One row (#264 × `employmentStatus`) needed a real trace rather than an
assertion; §12.1 does it.

---

# 12. #264 — `updateSchema` is not `.strict()`

## 12.1 The timing question, traced — not guessed

The route, verbatim at `98ea3df` (`+server.ts:84-108`):

```ts
if (!(await canTouchEmployee(locals.user, params.id))) {
	// :84
	return apiError(403, 'You can only edit your own team members.')
}

const body = await request.json() // :88
const parsed = updateSchema.safeParse(body) // :89   ← .strict() fires HERE

if (!parsed.success) {
	return apiError(400, 'Invalid request body') // :92
}

// …
const { basicMonthlySalary, rateType, employmentType, ...rest } = parsed.data // :102
//                                                    ↑ #263 Step 1 adds employmentStatus, reportsToId here
//                                                    ↑ #263 Step 1's 400 lands immediately after
```

**Zod's `.strict()` is a parse-time check.** It is evaluated inside `safeParse` while walking the
object's keys, and an unrecognized key produces a `ZodIssue` of code `unrecognized_keys`, which
makes `parsed.success === false`. There is no deferred/lazy path: `safeParse` returns a discriminated
result, and `.data` does not exist on the failure branch.

**Answers to the two questions asked, precisely:**

1. **Does the order of `.strict()` vs. the `employmentStatus`/`reportsToId` destructure matter?**
   Yes, and it is fixed by the language, not by anything this plan chooses: `.strict()` at `:89`
   strictly precedes the destructure at `:102`, which strictly precedes #263's `employmentStatus` 400. There is no way to reorder them without moving the `safeParse` call.
2. **Does a body with BOTH an unknown field AND a valid `employmentStatus` now 400 at parse time
   with a Zod message instead of #263's friendlier one?** It 400s **at parse time**, yes — but
   **not with a Zod message**. The route already collapses every parse failure to a fixed literal:
   `return apiError(400, 'Invalid request body')` at `:92`. The `ZodError` is discarded, never
   serialized, and never reaches the client. So the observable difference is:

   | Body                                                | Before #264                                       | After #264                        |
   | --------------------------------------------------- | ------------------------------------------------- | --------------------------------- |
   | `{ employmentStatus: 'OFFBOARDED' }`                | 400 + the `?action=offboard` pointer              | **identical** — 400 + the pointer |
   | `{ employmentStatus: 'OFFBOARDED', nickname: 'x' }` | 200, `nickname` silently stripped, status written | 400 `'Invalid request body'`      |
   | `{ nickname: 'x' }`                                 | 200, nothing written, caller believes it worked   | 400 `'Invalid request body'`      |

   The only case that loses the friendly pointer is a body that was **malformed on independent
   grounds** and, before #264, was answered with a _silent partial write_. Trading a silent partial
   write for a generic 400 is not a regression of #263's message — #263's message was never
   reachable for that body, because that body used to succeed.

**Verdict: no bad interaction. `.strict()` only ever rejects keys the schema does not name.
`employmentStatus` and `reportsToId` are both named in it (`:29`, `:38`), so strict never sees
either, and both carve-outs behave exactly as §5 Steps 1–2 specify.**

## 12.2 The caller audit — the thing #264 explicitly asks for

> "Needs its own test coverage confirming no currently-legitimate caller sends an extra field that
> would newly 400."

`updateSchema`'s exact field list at `98ea3df` (`+server.ts:20-39`), 15 keys:

```text
firstName · lastName · middleName · contactPhone · contactAddress · departmentId · jobTitle
employmentType · employmentStatus · basicMonthlySalary · rateType
sssNumber · philhealthNumber · pagibigNumber · tinNumber · reportsToId
```

Every caller in the repository, found by exhaustive grep and checked body-by-body:

| Caller                                  | Body                                                                                                                                             | Subset of the list? |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| product code (`src/**`)                 | **none** — `grep -rn "api/v1/employees" src` returns only the route files themselves; no `fetch` anywhere                                        | n/a                 |
| `tests/e2e/**`                          | **none PATCH it.** `pii.spec.ts:121` and `:181` are both `page.request.get`. The three specs that touch `reportsToId` write it direct via Prisma | n/a                 |
| `employee-api-compensation.test.ts:92`  | `{ basicMonthlySalary: 50000 }`                                                                                                                  | ✅                  |
| `employee-api-compensation.test.ts:113` | `{ basicMonthlySalary: 30000 }`                                                                                                                  | ✅                  |
| `employee-api-compensation.test.ts:125` | `{ rateType: 'DAILY' }`                                                                                                                          | ✅                  |
| `employee-api-compensation.test.ts:149` | `{ basicMonthlySalary: 50000 }`                                                                                                                  | ✅                  |
| `employee-api-compensation.test.ts:173` | `{ basicMonthlySalary: 50000, jobTitle: 'Team Lead' }`                                                                                           | ✅                  |
| `pay-write-role-context.test.ts:96`     | `{ basicMonthlySalary: 50000 }`                                                                                                                  | ✅                  |
| `reports-to-scoping.test.ts:208`        | `{ reportsToId: 'emp-other-org' }`                                                                                                               | ✅                  |
| `reports-to-scoping.test.ts:221`        | `{ reportsToId: 'mgr1' }`                                                                                                                        | ✅                  |
| the 13 new cases in §17.2               | all built from the list above                                                                                                                    | ✅                  |

**Zero bodies would newly 400. The behavioural blast radius of #264 inside this repository is
empty** — it is reachable only by an external API caller sending a field this API has never
supported, which is the population it exists to inform.

## 12.3 Exact diff

`src/routes/api/v1/employees/[id]/+server.ts`, replacing `:20-39`.

**Before** (verbatim, on disk now)

```ts
const updateSchema = z.object({
	firstName: z.string().min(1).optional(),
	lastName: z.string().min(1).optional(),
	middleName: z.string().optional(),
	contactPhone: z.string().optional(),
	contactAddress: z.string().optional(),
	departmentId: z.string().optional(),
	jobTitle: z.string().optional(),
	employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
	employmentStatus: z.enum(['ACTIVE', 'ON_LEAVE', 'OFFBOARDED']).optional(),
	basicMonthlySalary: z.coerce.number().positive().optional(),
	rateType: z.enum(['MONTHLY', 'DAILY', 'HOURLY']).optional(),
	// #191: a PATCH only carries the fields the caller intends to change, so anything sent
	// here is by definition new and is format-checked and stored canonically.
	sssNumber: govIdSchema('sssNumber'),
	philhealthNumber: govIdSchema('philhealthNumber'),
	pagibigNumber: govIdSchema('pagibigNumber'),
	tinNumber: govIdSchema('tinNumber'),
	reportsToId: z.string().optional()
})
```

**After**

```ts
// #264: `.strict()`, not a plain `z.object`. Zod strips unknown keys by default, so a PATCH naming
// a field this schema does not know — a typo, a stale client, a column that used to exist — was a
// 200 that silently discarded it. Silent data loss on a write is the same trap #235 and #263 each
// refused for one specific field (`docs/plans/235-reportstoid-cross-tenant.md:77`, §3.2 here); this
// applies the same rule to the whole body. Every caller was audited first: nothing in `src` fetches
// this route, no e2e spec PATCHes it, and all eight bodies in the unit suites are subsets of the
// fields below, so nothing legitimate newly 400s.
//
// It does NOT subsume the handler's `employmentStatus` rejection, and must not be read as licence
// to delete that field from this schema. `employmentStatus` is a KNOWN key, so strict never sees
// it — and only the handler's own 400 names `POST ?action=offboard`. Deleting the field would swap
// an actionable message for a bare 'Invalid request body'.
const updateSchema = z
	.object({
		firstName: z.string().min(1).optional(),
		lastName: z.string().min(1).optional(),
		middleName: z.string().optional(),
		contactPhone: z.string().optional(),
		contactAddress: z.string().optional(),
		departmentId: z.string().optional(),
		jobTitle: z.string().optional(),
		employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
		employmentStatus: z.enum(['ACTIVE', 'ON_LEAVE', 'OFFBOARDED']).optional(),
		basicMonthlySalary: z.coerce.number().positive().optional(),
		rateType: z.enum(['MONTHLY', 'DAILY', 'HOURLY']).optional(),
		// #191: a PATCH only carries the fields the caller intends to change, so anything sent
		// here is by definition new and is format-checked and stored canonically.
		sssNumber: govIdSchema('sssNumber'),
		philhealthNumber: govIdSchema('philhealthNumber'),
		pagibigNumber: govIdSchema('pagibigNumber'),
		tinNumber: govIdSchema('tinNumber'),
		reportsToId: z.string().optional()
	})
	.strict()
```

Field bodies are byte-identical; only the wrapper, the indentation and the comment change. No new
imports. Prettier will confirm the re-indent — run `format:check` before reading the diff, or the
whole block looks changed.

## 12.4 Deliberately NOT done under #264

- **`offboardSchema` (`:41-43`) is left a plain `z.object`.** #264 names `updateSchema` only. And
  there is a live reason to be careful: §4.4 established that
  `specs/001-hris-platform/contracts/employees.md` documents the offboard body as
  `{ endDate, reason }` while `offboardSchema` takes `endDate` only. A caller following the shipped
  docs sends `reason` today and has it silently stripped; `.strict()` there would 400 them. #263
  Step 4 corrects the doc, but the two changes landing together in one PR is more coupling than
  either needs. **Mention in the PR, do not fix.**
- **The generic `'Invalid request body'` message is left as it is.** Surfacing `parsed.error`'s
  field names would be a real improvement and is a different change; the route's other parse failure
  (`:197`) is equally terse. Out of scope.

---

# 13. #266 — the hire-date floor blocks plain-column changes for pre-boarded hires

## 13.1 The current code, re-read fresh on disk (not from §4.2(a)'s cache)

`employees.ts:897-910`, verbatim:

```ts
export async function promoteEmployee(
	id: string,
	organizationId: string,
	input: PromoteEmployeeInput,
	ctx: AuditContext,
	opts?: ProposalWriteOpts
): Promise<PayWriteResult> {
	const employee = await getEmployee(id, organizationId)

	const eff = utcMidnight(input.effectiveDate)
	const today = utcMidnight(new Date())
	if (eff.getTime() < utcMidnight(employee.startDate).getTime()) {
		error(400, 'Effective date cannot be before the hire date.')
	}
```

Line numbers are as the issue text predicted (`:908-910`) and **have not shifted** — confirmed by
`grep -n`, and confirmed by the fact that nothing has been committed since `98ea3df`.

Confirming the issue's other premise: **#263's Step 2 edits `+server.ts`, not this file.** §5 Step 5
lists `employees.ts` as verify-only at four ranges — `:402-409`, `:582-589`, `:605-611`,
`:1099-1110` — and **the floor at `:906-910` is on none of them**. So #266 does not contradict any
"do not edit" instruction §5 already issued. It does contradict **§7 point 2**'s blanket "does not
touch … `promoteEmployee`", which §18 rewrites.

The function's execution order today, which the rest of this section depends on:

```text
:904  getEmployee
:906  eff / today
:908  ── the floor ──────────────────────── unconditional
:913  employeeCompensation.findMany   (read)
:923  employeeEmploymentType.findMany (read)
:928  basicMonthlySalary / rateType / employmentType resolved
:931  payChanged
:932  typeChanged
:936  rate-basis pairing check
:939  columns {} ← positionId (position.findFirst), jobTitle, reportsToId (assertManagerInOrg)
:960  NO_CHANGE check
:964  ── the future-date guard ────────────  gated on Object.keys(columns).length > 0
:976  band-status notice   (read)
:993  frozen-run notice    (read, gated on payChanged)
:1020 proposeIfRequired  ← the propose→confirm branch #263 depends on
:1025 write (transaction)
```

## 13.2 Verifying the reasoning — where it holds

> "the floor exists to protect effective-dated pay/type snapshots from predating employment"

**Confirmed, and there is a written statement of it in this repo.** `recordCompensationChange`
carries the identical floor at `:764-767`, and unlike `promoteEmployee`'s copy it has a comment
(`:761-763`):

```ts
// Lower bound only: effectiveDate ≥ hire date (UTC-midnight). Future-dating is allowed (#170 Stage
// 1.5) — no scheduler needed: the insert below leaves the current cache untouched (its re-derivation
// is "max effectiveDate ≤ today"), and getEmployee heals the cache the first time it is read on or
// after the effective date.
```

Every clause is about the **snapshot** and the **cache-healing** rule. `promoteEmployee`'s copy has
**no comment at all** — consistent with it having been carried across when #222 built the promotion
writer on `recordCompensationChange`'s shape, rather than re-derived for a function that also writes
plain columns. That supports the issue's framing: the unconditional placement is inherited, not
argued.

> "Plain columns apply IMMEDIATELY regardless of `effectiveDate` — the function's OWN second guard
> says so explicitly (`:964-972`)"

**Confirmed verbatim** — `'…Position, job title and reporting line apply immediately — record those
on or after the effective date.'`

> "backdating-relative-to-hire-date doesn't constrain a plain-column-only change in any way that
> matters"

**Confirmed for `reportsToId`. Not confirmed for `positionId` and `jobTitle`** — see §13.3.

## 13.3 The hole in the reasoning: two of the three plain columns _do_ surface the effective date

`promoteEmployee`'s audit block writes `newValue: { effectiveDate: eff }` **unconditionally**
(`:1057`), for every promotion including a column-only one. What reads it back:

```ts
// employees.ts:1300-1319, getEmploymentHistory
for (const field of HISTORY_FIELDS) {
	if (!(field in newValue)) continue
	…
	changes.push({ label: HISTORY_LABELS[field], from, to })
}
if (changes.length > 0) {
	const eff = newValue.effectiveDate
	events.push({ …, type: 'CHANGE', changes, ...(eff ? { effectiveDate: String(eff) } : {}) })
}
```

and `HISTORY_FIELDS` (`:108-118`):

```text
jobTitle · departmentId · positionId · basicMonthlySalary · rateType · employmentType
employmentStatus · workScheduleId · branchId
```

So, of `promoteEmployee`'s three plain columns:

| Column        | In `HISTORY_FIELDS`?                                                                                                                                                                                                 | Does a change to it alone emit a timeline event carrying `effectiveDate`?                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `positionId`  | **yes**                                                                                                                                                                                                              | **yes**                                                                                     |
| `jobTitle`    | **yes**                                                                                                                                                                                                              | **yes**                                                                                     |
| `reportsToId` | **no** — deliberately, per the comment at `:1052-1053`: _"reportsToId is not a HISTORY_FIELD (the timeline shows employment terms, not the org chart)"_ — it rides `newValue._otherFields = ['reportsToId']` instead | **no.** `changes.length === 0`, so no event is pushed at all and the date is never rendered |

**Consequence:** gating the floor on `payChanged \|\| typeChanged` alone — exactly as #266 proposes —
would also unlock backdating a `jobTitle` or `positionId` change below the hire date, and those two
**do** record the effective date somewhere a human reads it. A 201 timeline could then render
_"Job title: Crew → Shift Lead · effective from \<a date before the employee was hired\>"_. Not
corruption (events are ordered by `createdAt`, so the ordering stays sane) but a visibly nonsense
date, produced by a change whose stated justification was that the date "doesn't matter".

**So: the reasoning is correct for `reportsToId` — the field #263 routes, and the only plain column
the v1 PATCH ever sends to `promoteEmployee` — and incomplete for the other two.**

## 13.4 Two designs, and the one chosen

### Option A — gate on `payChanged || typeChanged` (as #266 proposes)

```ts
if ((payChanged || typeChanged) && eff.getTime() < utcMidnight(employee.startDate).getTime())
```

**For:** two terms, reads cleanly, is literally what the issue asks for, and the floor can sit
immediately after `:932` so almost nothing reorders.

**Against, two findings:**

1. **It breaks an existing regression test named after the behaviour it changes** — §13.5.
2. **It widens behaviour for two fields neither #263 nor #266 mentions by name**, in the one way
   §13.3 shows actually has a visible effect. CLAUDE.md §2/§3 both cut against that.

### Option B — gate on "does this change record an effective date anyone reads?" (**chosen**)

```ts
if (
	(payChanged ||
		typeChanged ||
		columns.positionId !== undefined ||
		columns.jobTitle !== undefined) &&
	eff.getTime() < utcMidnight(employee.startDate).getTime()
) {
	error(400, 'Effective date cannot be before the hire date.')
}
```

i.e. **the floor fires for everything except a reporting-line-only change.** The line is not
arbitrary: it is exactly "the change writes an effective-dated snapshot, or it writes a
`HISTORY_FIELD` that the timeline renders the effective date against". `reportsToId` is the single
field in `PromoteEmployeeInput` that is neither, and it is neither _by an explicit decision already
recorded in this file_ (`:1052-1053`).

**For:**

- **Fixes #266's actual complaint in full.** A pre-boarded hire's reporting line becomes editable
  through `?/promote` and, after #263, through the v1 PATCH. That is the case the issue is about,
  and the only plain-column case #263 can reach.
- **`promotion.test.ts:158-167` stays green, byte-identical** (§13.5). No guard regression test is
  edited inside an authorization PR — the doctrine §4.1(a) argued for and §6.3 hedged around.
- **Zero timeline effect.** No `HISTORY_FIELD` is unlocked, so no event anywhere can newly carry a
  pre-hire effective date.
- **It is the narrower change.** Same benefit to `?/promote`, strictly less behaviour moved.

**Against:** four terms instead of two, and the floor has to move below the `columns` block (§13.7).
Both are addressed there. The honest cost is one extra sentence of comment explaining why
`reportsToId` is the exception — and that sentence is a pointer to a decision the file already made.

**Verdict: Option B.** If a reviewer prefers Option A's simpler condition, it is a live choice — but
it _requires_ re-pointing `promotion.test.ts:158-167` at a pay change and adding a fresh
column-backdating case, and it should be argued against §13.3, not adopted by default.

## 13.5 What `promotion.test.ts` says about the floor — the deciding finding

**Exactly one test pins it.** `tests/unit/promotion.test.ts:158-167`:

```ts
it('refuses an effective date before the hire date', async () => {
	await expect(
		promoteEmployee(
			'emp1',
			'org1',
			{ jobTitle: 'Shift Lead', effectiveDate: new Date(Date.now() - 500 * DAY) },
			CTX
		)
	).rejects.toMatchObject({ status: 400 })
})
```

against the fixture at `:46-55` (`PART_TIMER`, `startDate: Date.now() - 400 * DAY`,
`jobTitle: 'Crew'`).

So the one existing test of the floor is **a plain-column-only change dated below the hire date** —
precisely the shape #266 proposes to unblock. Not a pre-boarded hire (the employee started 400 days
ago); a _backdated_ effective date. The gating change affects both shapes identically.

| Design                                   | `promotion.test.ts:158-167`                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Option A (`payChanged \|\| typeChanged`) | **RED.** `jobTitle` only ⇒ `payChanged=false`, `typeChanged=false` ⇒ floor skipped ⇒ `columns={jobTitle:'Shift Lead'}` (≠ `'Crew'`) ⇒ `NO_CHANGE` does not fire ⇒ future-date guard does not fire (`eff` is in the past) ⇒ the promotion **succeeds**. The test would have to be re-pointed at a pay change and its title rewritten. |
| Option B (chosen)                        | **GREEN, unmodified.** `columns.jobTitle !== undefined` ⇒ gate true ⇒ `eff (−500d) < startDate (−400d)` ⇒ 400.                                                                                                                                                                                                                       |

Traced by hand against the fixture, not assumed. **This is the finding that chose Option B.** Flagged
here with the same weight §6.3 gives `reports-to-scoping.test.ts:214-225`: under the chosen design
**no existing test needs an edit**, and if one goes red during execution, the design is wrong — stop
and re-derive rather than editing the assertion.

Checked for completeness against every other `promoteEmployee` test in the repo, since the floor's
_position_ moves (§13.7):

| Test                                                                  | `effectiveDate` | Fixture `startDate` | Reaches the floor?                    |
| --------------------------------------------------------------------- | --------------- | ------------------- | ------------------------------------- |
| `promotion.test.ts:72,79,100,129,137,144,150,169`                     | `TODAY`         | −400d               | no — `eff > startDate`                |
| `promotion.test.ts:194,202`                                           | `NEXT_WEEK`     | −400d               | no                                    |
| `promotion.test.ts:158`                                               | −500d           | −400d               | **yes** — analysed above, stays green |
| `pay-proposal-routing.test.ts:147,195,247,258,294,306,354`            | `TODAY`         | `2020-01-01`        | no                                    |
| `reports-to-scoping.test.ts:214-225` (route, after #263)              | today           | `2024-01-01`        | no                                    |
| `employee-api-compensation.test.ts`, `pay-write-role-context.test.ts` | today           | `2024-01-01`        | no                                    |

## 13.6 Rewriting §4.2(a)'s reasoning rather than deleting it

§4.2(a) concluded: _"Accepted, not worked around … **Flag it in the PR** as the one behaviour delta
for a legitimate caller, and note that 'a future-dated hire's reporting line cannot be edited before
their start date' is arguably a pre-existing UI defect worth its own issue."_

That parenthetical is #266. The issue got filed, the user decided to fix it here, and the conclusion
inverts. The replacement reasoning, which §19 point 5 and the new test docblocks carry:

> **There is no behaviour delta for a legitimate caller.** The one that §4.2(a) identified —
> `promoteEmployee`'s hire-date floor refusing a pre-boarded hire's reporting-line change — was a
> bug in the floor, not a contract to inherit, and is fixed in this PR as #266. The floor was
> written for `recordCompensationChange`, where every input is an effective-dated snapshot
> (`employees.ts:761-767` says so), and carried into `promoteEmployee` unchanged even though that
> writer also sets plain columns that apply immediately and, in `reportsToId`'s case, never record
> the effective date anywhere. Gating it means the v1 PATCH and `?/promote` now agree on this too —
> which is #263's whole objective — and `?/promote` gets the fix as a genuine bug fix in its own
> right, not as a side effect.

§4.2(a)'s reasons (i)/(ii)/(iii) do not survive, and here is why each fails rather than being
dropped: **(i)** "the UI has always behaved this way, and #263 is about matching the UI" — matching
the UI is the goal only where the UI is _right_; #266 establishes it is not, so this fix moves both
doors instead of one, which serves the same objective better. **(ii)** "it fails loudly and early,
before any write or filing" — still true, and still true after the change for the case that keeps
the floor (§13.7(b) confirms the floor still precedes `proposeIfRequired` and the transaction); it
was an argument that the delta was _survivable_, never that it was _correct_. **(iii)** "the
reporting line for a pre-start hire is set at creation, so this is a narrow edge" — accurate and
still accurate; it argued the delta was cheap to accept, but the fix is 4 lines and 2 tests, which
is cheaper than documenting the edge.

## 13.7 Exact diff

`src/lib/server/services/employees.ts`. **Two hunks: a deletion and an insertion.** The floor is
_moved_, not duplicated — the design fails closed only if exactly one copy exists.

### Hunk 1 — remove the unconditional floor (`:906-910`)

**Before**

```ts
const eff = utcMidnight(input.effectiveDate)
const today = utcMidnight(new Date())
if (eff.getTime() < utcMidnight(employee.startDate).getTime()) {
	error(400, 'Effective date cannot be before the hire date.')
}
```

**After**

```ts
const eff = utcMidnight(input.effectiveDate)
const today = utcMidnight(new Date())
```

`eff` and `today` both stay — they are used at `:917`, `:929`, `:967`, `:994`, `:1035` and in the
audit block. Only the `if` moves.

### Hunk 2 — re-insert it, gated, immediately above the future-date guard (`:964`)

**Before**

```ts
if (!payChanged && !typeChanged && Object.keys(columns).length === 0) {
	error(NO_CHANGE_STATUS, NO_CHANGE_MESSAGE)
}

// Only pay and employment type are effective-dated; position, title and the reporting line are
// plain columns that would apply the moment this is saved. Rather than quietly applying half a
// promotion early, a future-dated one must be pay/type-only.
if (eff.getTime() > today.getTime() && Object.keys(columns).length > 0) {
	error(
		400,
		'A future-dated promotion can only change pay and employment type. Position, job title and reporting line apply immediately — record those on or after the effective date.'
	)
}
```

**After**

```ts
if (!payChanged && !typeChanged && Object.keys(columns).length === 0) {
	error(NO_CHANGE_STATUS, NO_CHANGE_MESSAGE)
}

// Two bounds on the effective date. They bind different subsets of the promotion, so they are
// kept together and each says which.
//
// LOWER (#266) — a date below the hire date is nonsense for anything that RECORDS it: pay and
// employment type are effective-dated snapshots by construction (`recordCompensationChange`
// applies the same floor for that reason, :761-767), and positionId/jobTitle are HISTORY_FIELDS,
// so `getEmploymentHistory` renders the date back on the 201 timeline (:1310-1319). It binds
// nothing about the reporting line: `reportsToId` is deliberately NOT a HISTORY_FIELD (see the
// audit block below), so a reporting-line-only change emits no timeline event and surfaces the
// date nowhere, and as a plain column it applies the moment this saves regardless of the date.
// Running unconditionally, the floor therefore refused a legitimate edit outright — a hire whose
// startDate is still in the future could not be re-pointed at a different manager through
// `?/promote`, or (after #263) through the v1 PATCH, since both pass today's date.
if (
	(payChanged ||
		typeChanged ||
		columns.positionId !== undefined ||
		columns.jobTitle !== undefined) &&
	eff.getTime() < utcMidnight(employee.startDate).getTime()
) {
	error(400, 'Effective date cannot be before the hire date.')
}

// UPPER — only pay and employment type are effective-dated; position, title and the reporting
// line are plain columns that would apply the moment this is saved. Rather than quietly applying
// half a promotion early, a future-dated one must be pay/type-only.
if (eff.getTime() > today.getTime() && Object.keys(columns).length > 0) {
	error(
		400,
		'A future-dated promotion can only change pay and employment type. Position, job title and reporting line apply immediately — record those on or after the effective date.'
	)
}
```

The upper guard's own comment gains the `UPPER —` prefix and is otherwise unchanged. The message
string, the `error()` status and the floor's message string are all byte-identical to today's — a
reworded message would be a silent contract change for anyone matching on it.

### Precedence consequences of the move, enumerated

The floor now runs **after** three things it used to precede. Each checked against every existing
test in §13.5's table; **none is reached by any of them**, because every test that reaches the floor
uses a below-hire date with no other failure, and every test with another failure uses `TODAY`.

| Now runs before the floor                                                               | Effect on a below-hire-date call that also trips it                                                                                                                                                           | Reachable by an existing test? |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| (a) the two history `findMany` reads (`:913`, `:923`) and the rate-basis check (`:936`) | an invalid rate/type pairing now answers `RATE_BASIS_MISMATCH` instead of the hire-date message. Both 400, both before any write                                                                              | no                             |
| (b) the `columns` block (`:939-958`) — `position.findFirst`, `assertManagerInOrg`       | a cross-tenant `positionId`/`reportsToId` now answers 404 instead of the hire-date 400. Arguably better ordering: the id is validated before the date                                                         | no                             |
| (c) the `NO_CHANGE` check (`:960`)                                                      | **no observable change.** A no-change call has `payChanged=false`, `typeChanged=false` and `columns` empty, so the floor's gate is false either way; `NO_CHANGE` wins in both the old and the new arrangement | no                             |

**What has NOT moved, and must not:** the floor still sits **before** `proposeIfRequired` (`:1020`)
and before the write transaction (`:1025`). So §4.2(a)(ii)'s property survives verbatim — a refused
promotion still fails with nothing written and **no proposal filed**. That is the property #263's
202-vs-400 contract rests on, and it is the one thing in this hunk that would be a real regression
if the insertion point drifted lower. Pinned by §17.3's second case.

## 13.8 Deliberately NOT done under #266

- **`recordCompensationChange`'s floor (`:764-767`) is not touched.** Every input to that writer is
  an effective-dated snapshot, so the floor is unconditionally right there. Gating it would be
  changing a correct guard for symmetry.
- **`newValue.effectiveDate` is still written for a `reportsToId`-only promotion** (`:1057`), even
  though it can now be a pre-hire date and even though nothing renders it. It is inert in
  `getEmploymentHistory` (no `HISTORY_FIELD` changed ⇒ no event), visible only in
  `/reports/audit-log`'s raw `newValue`. Making it conditional is a second, unrelated behaviour
  change to the audit shape §4.3(2) verified as unchanged. **Mention, do not fix.**
- **The floor's message is not reworded** to say which fields it applies to. It is matched on in
  no test and no route, but rewording it is copy work #266 did not ask for and would need its own
  read of the UI's error rendering.

---

# 14. #265 — proposal notifications always say "pay"

## 14.1 No enum change is needed — confirmed

> "does making the copy domain-aware require touching `ProposalDomain`'s enum, or can it be a lookup
> keyed on the EXISTING two values?"

**A lookup on the existing two values. No enum change, no `db push`, no migration script.**

```prisma
// prisma/schema.prisma:1747-1750
enum ProposalDomain {
  COMPENSATION
  PROMOTION
}
```

§1.1 already decided #263 adds no third value, and #265 needs none either — it is describing the
domains that exist, not creating one. Both facts are re-verified on disk: the enum has exactly two
members, and `applyProposedChange` (`employees.ts:1144-1153`) dispatches exactly those two with a
throw for anything else.

The type plumbing is already in place: `action-proposals.ts:2` imports
`type ProposalDomain` from `@prisma/client`, and both consumers of the lookup already hold a value
of that type — `createProposal`'s `input.domain` (`:130`), and `pending.domain` from
`requirePending` (`:314-320`), which does a bare `db.actionProposal.findFirst` with **no `select`**
and therefore returns the whole row, `domain` included. Verified by reading, and independently
proven by `confirmProposal:206` already passing `pending.domain` into its `apply` callback.

## 14.2 The three call sites and their test exposure

Exact current strings (`grep -n "pay change" src/lib/server/services/action-proposals.ts`):

| Line   | Function          | String                                                  |
| ------ | ----------------- | ------------------------------------------------------- |
| `:172` | `createProposal`  | `'A pay change is waiting for your confirmation.'`      |
| `:224` | `confirmProposal` | `'Your proposed pay change was confirmed and applied.'` |
| `:264` | `rejectProposal`  | `` `Your proposed pay change was rejected: ${note}` ``  |

**Test assertions against any of them: none.** Established by grepping `pay change` and `notifyMany`
across `src` and `tests`:

- `tests/unit/action-proposals.test.ts:35-38` mocks the whole `notifications` module
  (`notifyMany: vi.fn()`) and **never imports the mock into scope**, so it cannot and does not
  assert on a message.
- `tests/unit/proposal-queue.test.ts:45` does the same.
- No other test file imports `notifyMany` or matches on any of the three strings.
- No `.toContain` / `.toBe` anywhere in `tests/` matches "waiting for your confirmation",
  "confirmed and applied" or "was rejected:".

**So §4.5 alternative K's stated reason for deferring — "three strings plus assertions" — was
wrong on the second half.** There are three strings and zero assertions. That is what reverses it.

## 14.3 Exact diff

`src/lib/server/services/action-proposals.ts`. One new const plus three one-line edits.

### Hunk 1 — the lookup, inserted after `confirmerCapabilityFor` (`:29-33`)

**Before**

```ts
/** Which capability a confirmer must hold, given whether the initiator is also the target. */
export function confirmerCapabilityFor(isSelfAction: boolean): Capability {
	return isSelfAction ? 'APPROVE_FINANCE' : 'ADMINISTER_HR_ORGWIDE'
}
```

**After**

```ts
/** Which capability a confirmer must hold, given whether the initiator is also the target. */
export function confirmerCapabilityFor(isSelfAction: boolean): Capability {
	return isSelfAction ? 'APPROVE_FINANCE' : 'ADMINISTER_HR_ORGWIDE'
}

/**
 * What each domain's notifications call the thing (#265). All three messages below said "pay
 * change" regardless of domain, which has been wrong since #222 for a PROMOTION carrying only a job
 * title or a reporting line — and #263 makes that shape reachable from the v1 PATCH as well, so a
 * confirmer is told to approve a raise that is actually a re-org.
 *
 * `Record<ProposalDomain, string>` rather than a lookup with a fallback: a third domain must fail
 * the typecheck, not quietly inherit the wrong noun. Phrased to read after both "A …" and
 * "Your proposed …".
 */
const DOMAIN_NOUN: Record<ProposalDomain, string> = {
	COMPENSATION: 'pay change',
	PROMOTION: 'promotion'
}
```

### Hunk 2 — `createProposal` (`:170-174`)

**Before**

```ts
await notifyMany(
	confirmers,
	'A pay change is waiting for your confirmation.',
	'/requests/proposals'
)
```

**After**

```ts
await notifyMany(
	confirmers,
	`A ${DOMAIN_NOUN[input.domain]} is waiting for your confirmation.`,
	'/requests/proposals'
)
```

### Hunk 3 — `confirmProposal` (`:224`)

**Before**

```ts
await notifyMany([pending.initiatorId], 'Your proposed pay change was confirmed and applied.')
```

**After**

```ts
await notifyMany(
	[pending.initiatorId],
	`Your proposed ${DOMAIN_NOUN[pending.domain]} was confirmed and applied.`
)
```

### Hunk 4 — `rejectProposal` (`:262-264`)

**Before**

```ts
// "rejected", matching the REJECTED status the row actually carries — there is no RETURNED
// state here, and the old wording read as one to anyone comparing the audit log to the message.
await notifyMany([pending.initiatorId], `Your proposed pay change was rejected: ${note}`)
```

**After**

```ts
// "rejected", matching the REJECTED status the row actually carries — there is no RETURNED
// state here, and the old wording read as one to anyone comparing the audit log to the message.
await notifyMany(
	[pending.initiatorId],
	`Your proposed ${DOMAIN_NOUN[pending.domain]} was rejected: ${note}`
)
```

Resulting copy, all six combinations:

|           | `COMPENSATION`                                      | `PROMOTION`                                        |
| --------- | --------------------------------------------------- | -------------------------------------------------- |
| filed     | A pay change is waiting for your confirmation.      | A promotion is waiting for your confirmation.      |
| confirmed | Your proposed pay change was confirmed and applied. | Your proposed promotion was confirmed and applied. |
| rejected  | Your proposed pay change was rejected: …            | Your proposed promotion was rejected: …            |

The `COMPENSATION` column is **byte-identical to today's copy**, which is the property that makes
this a strictly additive change.

## 14.4 Deliberately NOT done under #265

Two user-visible strings in `src/routes/(app)/requests/proposals/+page.svelte` have the same defect
and are **flagged, not fixed** — #265 names `action-proposals.ts` only, and both are static markup
with no domain in scope at the point they render:

- `:97` `title="No pay changes are waiting for you."` — the queue's empty state, wrong whenever the
  queue would have held a promotion.
- `:241` `title="Reject pay change"` — the reject dialog's heading; `p.domain` _is_ in scope in that
  block, so this one is genuinely a one-liner, and it is left alone only because it is a `.svelte`
  file that §7 point 2 keeps out of this PR entirely and that no part of this change otherwise
  opens.

Worth one sentence in the PR and a follow-up issue. Not worth widening the diff into the UI layer
for a change whose whole safety argument is "different file, different layer, zero coupling".

---

# 15. [MODE: INNOVATE] — critique of the extension

Genuine second pass over §11–§14, hunting for the ways each integration could be wrong rather than
confirming it is right. Four findings that changed the plan, three that did not, and one honest
statement of residual risk.

## 15.1 Findings that changed the plan

**(a) #266 as filed breaks a test, and I nearly missed which one.**
My first pass checked `promotion.test.ts` for a _pre-boarded hire_ fixture — the shape the issue
describes — found none (`PART_TIMER.startDate` is 400 days in the past), and was about to record
"no existing test pins this". That would have been wrong. The floor does not care whether the hire
date is in the future; it cares whether `effectiveDate < startDate`, and `:158-167` reaches that
condition from the other direction, with a **backdated** effective date on a long-tenured employee.
Reading the fixture rather than the test title is what caught it. **Recorded because the failure
mode generalizes: "no test has this fixture" is not the same claim as "no test reaches this branch".**

**(b) The issue's justification for #266 is right about the mechanism and wrong about the scope.**
"Plain columns apply immediately regardless of `effectiveDate`" is true of the _write_, and is
exactly what the function's second guard says. But `jobTitle` and `positionId` also feed
`getEmploymentHistory`, which renders `newValue.effectiveDate` back to the user (`:1310-1319`). So
for two of the three plain columns the effective date is not inert. §13.3. This is the finding that
produced Option B, and it is the one thing in this extension I would most want a reviewer to check
independently, because the whole design choice rests on it.

**(c) `.strict()`'s "friendlier message" concern dissolves once the route is read.**
The question assumed a Zod error message might reach the client and displace #263's `?action=offboard`
pointer. It cannot: `:92` returns a fixed literal and discards `parsed.error` entirely. So the
comparison is not "friendly message vs. Zod message" but "friendly message vs. generic message, for
a body that used to succeed with a silent partial write". §12.1. **The concern was real and worth
tracing; the answer is that the route's existing error handling already contains it.**

**(d) The ordering hazard is asymmetric, and only #266 has one.**
My first instinct was to order all three relative to #263 core. Two of them do not need it: #264
touches a disjoint range of the same file and #265 touches a file nothing else in the PR opens.
Manufacturing an order for those would have implied a coupling that does not exist — the task
explicitly warns against that ("independent work doesn't need to be ordered relative to dependent
work, it needs to not collide with it"). §11.3 now states one hard constraint and calls the rest
ergonomics.

## 15.2 Findings that did NOT change the plan, recorded so they are not re-litigated

**(e) Should #266 have been its own PR after all?** It is the only one of the three that touches a
shared service reached by three callers (`?/promote`, `applyProposedChange`, and — after #263 — the
v1 PATCH), and it is the only one that can regress a path this PR does not otherwise touch. That is
a real argument for splitting it. It loses on two counts: #263's §6.1 case 7 would have to be
written pinning behaviour the team has already decided is a bug (shipping a test that documents a
defect as a contract, then deleting it a week later), and the fix is 4 lines and 2 tests against a
function this PR is already routing new traffic into. **Fold in, ordered first, with its own commit
so it can be reverted alone.**

**(f) Could #264 be folded into #263 Step 1's commit, since it is the same file?** Yes, and it would
be defensible. Kept separate because the two changes answer to different issues with different
blast radii (one changes the route's admission rules for _every_ field; the other carves out two),
and because a `.strict()` regression — if one ever surfaces from an external caller — should be
revertable without touching the authorization fix. A reviewer who prefers fewer commits can squash
commits 1 and 3 with no design change.

**(g) Does #265 want `domainLabels` from `+page.svelte:14-16` extracted and shared instead?** The
queue already has `{ COMPENSATION: …, PROMOTION: 'Promotion' }` for its badge. Sharing one map
across a Svelte component and a server service means a new export, a new import in the UI, and a
map that has to satisfy two different grammatical contexts ("Promotion" as a badge vs. "a promotion"
mid-sentence). **Two four-line objects that read differently are not duplication worth removing** —
CLAUDE.md §2. Not done.

## 15.3 Residual risk, stated plainly

**One.** §13.4's Option B draws its line at "does this change surface an effective date to a human",
which is a _derived_ property — it holds because `reportsToId` is absent from `HISTORY_FIELDS`
today. If someone later adds `reportsToId` to `HISTORY_FIELDS`, the gate silently becomes wrong (the
timeline would render pre-hire dates again) and nothing fails. Mitigations chosen: the comment in
§13.7 names the dependency explicitly and points at the audit block that records the decision, and
`HISTORY_FIELDS` sits 800 lines above with its own comment about what belongs in it. **Not mitigated
by a test**, because a test asserting "reportsToId is not in HISTORY_FIELDS" pins an implementation
detail rather than a behaviour, and the behaviour it protects (no pre-hire timeline date) has no
cheap assertion at this layer. Recorded as a known, accepted coupling rather than hidden.

## 15.4 Is any of the three unsafe to fold in as designed?

**No.** All three integrate cleanly, and the answer is not a shrug — each was given a specific way
it could have failed and each survived it:

- **#264** could have collided with #263's destructure-then-reject pattern. It does not, because
  `.strict()` rejects only _unknown_ keys and both carved-out fields are known. Traced, not assumed
  (§12.1). The audit that #264 itself demanded found an empty blast radius (§12.2).
- **#265** could have needed a `ProposalDomain` value, or broken a test asserting on copy. It needs
  neither: the enum already has both values it describes, and zero tests assert on any of the three
  strings (§14.1, §14.2).
- **#266** could have been a bad idea outright, or could have needed an existing regression test
  edited. Under the design as filed it would have needed exactly that (§13.5). **Under Option B it
  needs no test edited at all** — which is the strongest available evidence that the narrower gate
  is the right line, not a compromise.

The one thing that would have made this unsafe — #263's case 7 being authored against the old floor
and then edited — is removed by ordering, not by argument.

---

# 16. REVISED §5 — the full step order

Replaces §5's step list. **The diffs in §5 Steps 1–4 are unchanged** — do not re-derive them; they
are still verbatim-correct against the working tree.

| Step   | What                                                                                       | File                                                                                                                                    | Source of the diff                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **0a** | `.strict()` on `updateSchema`                                                              | `src/routes/api/v1/employees/[id]/+server.ts:20-39`                                                                                     | **§12.3**                                                                                                                     |
| **0b** | move the hire-date floor below `columns` and gate it (2 hunks)                             | `src/lib/server/services/employees.ts:906-910` → `:963`                                                                                 | **§13.7**                                                                                                                     |
| **1**  | split `employmentStatus` + `reportsToId` out of `rest`; reject `employmentStatus` with 400 | `+server.ts:95-108`                                                                                                                     | §5 Step 1 — **unchanged**                                                                                                     |
| **2**  | widen the `promoteEmployee` trigger and input with `reportsToId`                           | `+server.ts:123-146`                                                                                                                    | §5 Step 2 — **unchanged**                                                                                                     |
| **3**  | reword the 202 comment                                                                     | `+server.ts:160-162`                                                                                                                    | §5 Step 3 — **unchanged**                                                                                                     |
| **4**  | correct the PATCH + offboard contract blocks                                               | `specs/001-hris-platform/contracts/employees.md:83-105`                                                                                 | §5 Step 4 — **unchanged**; still droppable                                                                                    |
| **5**  | verify-only pass, no edits                                                                 | `employees.ts:402-409`, `:582-589`, `:605-611`, `:1099-1110`; `enum ProposalDomain`; `(app)/requests/proposals/+page.server.ts:144-151` | §5 Step 5 — **unchanged**. Re-confirmed in §13.1 that the floor is on none of these ranges, so Step 0b does not contradict it |
| **6**  | domain-aware notification copy (4 hunks)                                                   | `src/lib/server/services/action-proposals.ts:29-33, 170-174, 224, 262-264`                                                              | **§14.3**                                                                                                                     |

**Files touched by the whole PR, complete list:** `+server.ts`, `employees.ts`,
`action-proposals.ts`, `contracts/employees.md`, plus tests. **No `.svelte` file, no
`schema.prisma`, no migration, no `prisma generate`.**

---

# 17. REVISED §6 — tests

## 17.1 New file: `tests/unit/employee-patch-authorization.test.ts`

Created at **commit 1** (Step 0a) with §17.2's `.strict()` block only, then extended at **commit 3**
with the `reportsToId` and `employmentStatus` blocks. Harness, mocks and `findFirst` call-order
notes are exactly as §6.1 specifies — **that section is unchanged and still the reference for the
scaffold.** The `.strict()` block needs the same scaffold as the rest (importing the route pulls in
`employees.ts` → `db`), which is why the file is created up front rather than the case being parked
somewhere else.

Its docblock gains a third paragraph after §6.1's two:

> A fourth thing this file pins is what the route will not even parse. `updateSchema` was a plain
> `z.object`, so zod stripped unknown keys and a PATCH naming a field it did not know was a 200 that
> silently discarded it — the same silent-strip trap the two gaps above were each fixed loudly to
> avoid (#264). Note the ordering the cases below depend on: `.strict()` is evaluated inside
> `safeParse`, so an unknown key is refused before the handler destructures anything, and a body
> carrying both an unknown key and `employmentStatus` gets the generic parse 400 rather than the
> offboard pointer. That is intended — such a body used to succeed with a silent partial write.

## 17.2 Case table — renumbered, 16 cases

Changes from §6.1: old case 7 is **deleted** (§13.6); new cases **7** and **8** replace it; cases
8–13 shift to 9–14; cases **15** and **16** are new for #264. Cases 1–6 and 9–14 are **byte-identical
in intent to §6.1's 1–6 and 8–13** — only their numbers move.

| #                                                      | describe / it                                                                             | Asserts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Commit |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **`reportsToId` is proposal-routed (#263)**            |                                                                                           |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |        |
| 1                                                      | a bare `[MANAGER]` PATCHing a report's `reportsToId` **files a proposal, does not write** | as §6.1 case 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 3      |
| 2                                                      | a `[MANAGER, HR_ADMIN]` user writes directly — **200**                                    | as §6.1 case 2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 3      |
| 3                                                      | an actor re-pointing **their own** reporting line files a self-action proposal            | as §6.1 case 3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 3      |
| 4                                                      | **the field does not reach `updateEmployee` in the same request**                         | as §6.1 case 4. _(Still the single most important case in the file — §4.2(b).)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 3      |
| 5                                                      | an HR_ADMIN acting on someone else still writes directly                                  | as §6.1 case 5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 3      |
| 6                                                      | resending the **current** reporting line is a no-op, not a 400                            | as §6.1 case 6                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 3      |
| **the hire-date floor, at the door #263 opens (#266)** |                                                                                           |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |        |
| 7                                                      | **a pre-boarded hire's reporting line now goes through**                                  | `EMP.startDate` = today + 30d, body `{ reportsToId: 'mgr2' }`, HR_ADMIN → `res.status === 200`; `employee.update` called with `data.reportsToId === 'mgr2'`; `createProposal` not called. _(The route twin of §17.3's first case. **Replaces §6.1 case 7, whose expected outcome was the opposite 400** — see §13.6 for why the contract inverted rather than the test being deleted quietly.)_                                                                                                                                                                           | 3      |
| 8                                                      | **a pre-boarded hire's PAY change is still refused by the floor**                         | `EMP.startDate` = today + 30d, body `{ basicMonthlySalary: 50000 }`, HR_ADMIN → `res.status === 400`; body message `'Effective date cannot be before the hire date.'`; `employee.update` **not called**; `createProposal` **not called**. _(The floor must still bite for the case it exists to protect, and must still bite BEFORE anything is filed — §13.7's "what has NOT moved". If this goes green while case 7 also goes green, the gate is drawn in the right place; if both 400, Step 0b was not applied; if both 200, the floor was removed instead of gated.)_ | 3      |
| **the rest of the reporting-line contract (#263)**     |                                                                                           |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |        |
| 9                                                      | a **cross-tenant** manager id is still refused, and nothing is filed                      | as §6.1 case 8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 3      |
| 10                                                     | an **empty-string** `reportsToId` is a clean 404, not a 500                               | as §6.1 case 9                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 3      |
| **`employmentStatus` is not editable here (#263)**     |                                                                                           |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |        |
| 11                                                     | `OFFBOARDED` is refused                                                                   | as §6.1 case 10                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 3      |
| 12                                                     | `ACTIVE` and `ON_LEAVE` are refused too                                                   | as §6.1 case 11                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 3      |
| 13                                                     | it does not take the rest of the PATCH down with it silently                              | as §6.1 case 12                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 3      |
| 14                                                     | a PATCH with no `employmentStatus` is untouched by the guard                              | as §6.1 case 13                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 3      |
| **unknown fields are refused, not stripped (#264)**    |                                                                                           |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |        |
| 15                                                     | **an unrecognized key is a 400, not a silent 200**                                        | body `{ nickname: 'Bibo' }` as HR_ADMIN → `res.status === 400`; `employee.update` **not called**; `dbMock.employee.findFirst` **not called** — the parse gate precedes every query, exactly as case 11's rejection does. _(The whole point of #264: before it, this body was a 200 that wrote nothing and told the caller it had worked.)_                                                                                                                                                                                                                                | **1**  |
| 16                                                     | **an unknown key alongside a known one refuses the whole body**                           | body `{ contactPhone: '0917', nickname: 'Bibo' }` → 400; `employee.update` **not called**. _(Pins that `.strict()` is not a partial-apply: the known half does not land. Same property case 13 pins for `employmentStatus`, reached by a different mechanism.)_                                                                                                                                                                                                                                                                                                           | **1**  |

**Not written, deliberately:** a case asserting that a body with an unknown key _and_ a valid
`employmentStatus` returns the generic message rather than the offboard pointer. It is true (§12.1)
and it is documented in the docblock, but asserting it would pin the _relative precedence of two
error messages_ as a contract, which is exactly the ordering-dependence §4.1(a) refused to build
into the `employmentStatus` guard. Cases 11 and 15 each pin their own path; their intersection needs
no third.

## 17.3 `tests/unit/promotion.test.ts` — two new cases, nothing modified

Added at **commit 2**, in a new `describe` after `promoteEmployee future dating (#222)`:

```ts
describe('promoteEmployee hire-date floor (#266)', () => {
	/**
	 * The floor guards records that CARRY the effective date — the pay/type snapshots, and the
	 * HISTORY_FIELDS the timeline renders it against. It ran unconditionally, so it also refused a
	 * reporting-line change, which is neither: `reportsToId` is not a HISTORY_FIELD, and as a plain
	 * column it applies the moment the promotion saves whatever date it carries. The visible cost
	 * was that a hire who had not started yet could not be re-pointed at a different manager at all,
	 * through `?/promote` or (after #263) through the v1 PATCH — both pass today's date.
	 *
	 * `:158-167` above is the companion case and stays UNMODIFIED: it sends a jobTitle, which IS a
	 * HISTORY_FIELD, so the floor must still refuse it. The two together pin both edges of the gate.
	 */
	const PRE_BOARDED = { ...PART_TIMER, startDate: new Date(Date.now() + 30 * DAY) }

	it('lets a reporting-line change through for a hire who has not started yet', …)
	it('still refuses a pay change dated before the hire date', …)
})
```

| #   | it                                                                      | Setup                                                                                                                                                                                                 | Asserts                                                                                                                                                                                      |
| --- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | lets a reporting-line change through for a hire who has not started yet | `dbMock.employee.findFirst.mockResolvedValueOnce(PRE_BOARDED).mockResolvedValueOnce({ id: 'mgr9' })`; `promoteEmployee('emp1','org1',{ reportsToId: 'mgr9', effectiveDate: TODAY }, CTX)`             | resolves; `txMock.employee.update` called with `data.reportsToId === 'mgr9'`; `writeAuditLog` called once                                                                                    |
| B   | still refuses a pay change dated before the hire date                   | `dbMock.employee.findFirst.mockResolvedValue(PRE_BOARDED)`; `promoteEmployee('emp1','org1',{ basicMonthlySalary: 30000, rateType: 'MONTHLY', employmentType: 'REGULAR', effectiveDate: TODAY }, CTX)` | rejects `{ status: 400, body: { message: 'Effective date cannot be before the hire date.' } }`; `txMock.employee.update` **not called**; `txMock.employeeCompensation.create` **not called** |

Case B asserts on the **message**, not just the status, because three different 400s are reachable
from that input shape (the pairing check, `NO_CHANGE`, and the floor) and only one of them proves the
floor still fires. Case A's inputs were traced by hand through the whole function against the
`PART_TIMER` fixture — `payChanged=false` (no history ⇒ `atEff` = the row's own 120/HOURLY),
`typeChanged=false`, pairing HOURLY+PART_TIME allowed, band check skipped (not MONTHLY),
`proposeIfRequired` returns null (HR_ADMIN acting on a different user) — so it reaches the write with
no mock beyond the two `findFirst` values. **`position.findFirst` is not needed** and is not added.

**Nothing in this file is modified.** If `:158-167` goes red, the gate was implemented as §13.4
Option A rather than Option B — fix the gate, not the test.

## 17.4 `tests/unit/action-proposals.test.ts` — four new cases (#265)

Added at **commit 5**. Needs one new import line, since the module is mocked but never pulled into
scope: `const { notifyMany } = await import('$lib/server/services/notifications')`.

| #   | it                                              | Asserts                                                                                                                                                                                                  |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | names a promotion a promotion when one is filed | `createProposal('org1', { …, domain: 'PROMOTION', payload: { reportsToId: 'mgr2' } }, ctxOf())` → `notifyMany` called with `[…], 'A promotion is waiting for your confirmation.', '/requests/proposals'` |
| B   | still calls a pay change a pay change           | same with `domain: 'COMPENSATION'` → `'A pay change is waiting for your confirmation.'`. _(The regression half: the existing copy must not move.)_                                                       |
| C   | names the domain when a proposal is confirmed   | `pendOnBehalf()` with `domain: 'PROMOTION'` → `confirmProposal(…)` → `notifyMany` called with `[initiator], 'Your proposed promotion was confirmed and applied.'`                                        |
| D   | names the domain when a proposal is rejected    | same fixture → `rejectProposal('org1','p1','wrong manager', …)` → message is `'Your proposed promotion was rejected: wrong manager'`                                                                     |

C and D reuse the file's existing `onBehalfProposal` fixture (`:78`) with `domain` overridden —
`requirePending` returns the whole row, so `pending.domain` is whatever the mock says. One case per
call site plus one regression case; no more, because all four exercise the same one-line lookup.

## 17.5 Existing tests that must stay green **unmodified** — revised

§6.2's table stands, with two rows changed and one added:

| File                                                | Status                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/self-action-guards.test.ts:104-121`     | **Unchanged from §6.2.** Still the single most important untouched test, and none of the three new items goes near it.                                                                                                                                                                                                                                              |
| `tests/unit/reports-to-scoping.test.ts` (all 10)    | **Unchanged from §6.2 / §6.3** — `:214-225` may still need its stale ordering comment fixed, for #263's reason alone. #266 does not affect it: its `EMP.startDate` is `2024-01-01`, so the floor never fired for it before or after. #264 does not affect it: both its bodies are single known fields.                                                              |
| `tests/unit/promotion.test.ts`                      | **⚠ row rewritten.** Gains two cases (§17.3) and **modifies none**, including `:158-167`, which the chosen design keeps green. See §13.5.                                                                                                                                                                                                                           |
| `tests/unit/pay-proposal-routing.test.ts`           | **⚠ row rewritten.** §6.2 said "untouched"; still true — no case is added or changed. But it is now a **gate for #266**, not a bystander: all seven of its `promoteEmployee` calls run through the moved floor. Its fixture's `startDate` is `2020-01-01` and every call passes `TODAY`, so none reaches the floor's condition (§13.5's table). Run it at commit 2. |
| `tests/unit/action-proposals.test.ts`               | **⚠ new row.** Gains four cases (§17.4), modifies none. Its 25+ existing cases never assert on notification copy (§14.2), so they are unaffected by #265.                                                                                                                                                                                                           |
| `tests/unit/proposal-queue.test.ts`                 | **new row.** Mocks `notifyMany` and asserts nothing about it; unaffected by #265. Listed so the grep behind that claim is on the record.                                                                                                                                                                                                                            |
| `tests/unit/pay-write-role-context.test.ts:148-162` | Unchanged from §6.2. Its body `{ basicMonthlySalary: 50000 }` is a known key (#264 inert), no `reportsToId`/`employmentStatus` (#263 inert), `startDate: 2024-01-01` with today's date (#266 inert). Proves the pay path is byte-unchanged across all four changes.                                                                                                 |
| `tests/unit/employee-api-compensation.test.ts`      | Unchanged from §6.2. All five bodies are subsets of `updateSchema` (#264 inert) and all are pay-only.                                                                                                                                                                                                                                                               |
| `tests/unit/rbac.test.ts`                           | Unchanged from §6.2.                                                                                                                                                                                                                                                                                                                                                |

## 17.6 Validation gates — revised

§6.4's commands stand; the inner-loop file list grows by two, and there are now per-commit gates.

```bash
cd <repo-root>

# ── after commit 1 (#264) ────────────────────────────────────────────────
pnpm exec vitest run \
  tests/unit/employee-patch-authorization.test.ts \
  tests/unit/employee-api-compensation.test.ts \
  tests/unit/pay-write-role-context.test.ts \
  tests/unit/reports-to-scoping.test.ts

# ── after commit 2 (#266) ────────────────────────────────────────────────
#    promotion.test.ts FIRST and alone: :158-167 must be green UNMODIFIED (§13.5).
pnpm exec vitest run tests/unit/promotion.test.ts
pnpm exec vitest run tests/unit/pay-proposal-routing.test.ts

# ── after commit 3 (#263 core) ───────────────────────────────────────────
pnpm exec vitest run tests/unit/reports-to-scoping.test.ts    # alone first, per §6.3
pnpm exec vitest run tests/unit/self-action-guards.test.ts    # must pass UNMODIFIED, per §4.1
pnpm exec vitest run \
  tests/unit/employee-patch-authorization.test.ts \
  tests/unit/pay-write-role-context.test.ts \
  tests/unit/employee-api-compensation.test.ts \
  tests/unit/pay-proposal-routing.test.ts \
  tests/unit/promotion.test.ts

# ── after commit 5 (#265) ────────────────────────────────────────────────
pnpm exec vitest run \
  tests/unit/action-proposals.test.ts \
  tests/unit/proposal-queue.test.ts

# ── the full gate, at the tip, in CI order ───────────────────────────────
pnpm format:check   # gates everything after it in CI; re-indenting updateSchema WILL trip it
pnpm lint
pnpm check
pnpm test
```

If `format:check` fails, format only what was touched (`pnpm format` rewrites the whole repo):

```bash
pnpm exec prettier --write \
  src/routes/api/v1/employees/\[id\]/+server.ts \
  src/lib/server/services/employees.ts \
  src/lib/server/services/action-proposals.ts \
  tests/unit/employee-patch-authorization.test.ts \
  tests/unit/promotion.test.ts \
  tests/unit/action-proposals.test.ts \
  specs/001-hris-platform/contracts/employees.md
```

**Still no `prisma generate`, no `db push`, no database.** §12.1/§13.1/§14.1 each confirm no schema
change: `.strict()` is a zod wrapper, the floor is a control-flow move, and `ProposalDomain` keeps
its two values. The Playwright `e2e` job is unaffected — no spec PATCHes this route (§12.2).

## 17.7 §6.5 and §6.6 — amendments

**§6.5 (the `""` FK edge) stands unchanged.** `''` is a _value_ of a known key, so `.strict()` never
sees it; the floor is not on its path (it is refused by `assertManagerInOrg` at `:956`, seven lines
before the floor's new position); #265 is a different file. The proof and the "no `.min(1)`" verdict
are both still valid.

**§6.6 (optional live verification) gains three steps**, after its existing six:

7. As **HR_ADMIN**, `PATCH /api/v1/employees/<id>` with `{"nickname":"x"}` → expect **400**
   `'Invalid request body'`, and `SELECT` the row to confirm nothing changed. Before #264 this was a 200. _(#264)_
8. Pick or create an employee whose `start_date` is in the future. As **HR_ADMIN**,
   `PATCH … {"reportsToId":"<an org-A manager>"}` → expect **200** and the column moves. Then
   `PATCH … {"basicMonthlySalary": 60000}` on the same employee → expect **400 'Effective date
   cannot be before the hire date.'** and `SELECT "basicMonthlySalary"` unchanged. _(#266 — both
   edges in one employee.)_
9. As a bare **MANAGER**, file a reporting-line proposal (step 1), then check the confirmer's
   notification row: `SELECT message FROM notifications WHERE …` → **"A promotion is waiting for
   your confirmation."**, not "A pay change …". Confirm it and check the initiator's notification →
   **"Your proposed promotion was confirmed and applied."** _(#265, end to end through #263's new
   door — the exact scenario that motivated the issue.)_

---

# 18. REVISED §7 — what this change deliberately does NOT do

Replaces §7 entirely. Points 1, 3, 4 and 7 are carried over verbatim; 2, 5 and 6 are rewritten.

1. **Does not add `reportsToId` to `assertNotSelf`** — §2. One mechanism per gap. _(unchanged)_
2. **Does not touch `updateEmployee`, `proposeIfRequired`, `proposalPayloadSchema`, `schema.prisma`,
   or any `.svelte` file.** _(rewritten — `promoteEmployee` and `action-proposals.ts` have come off
   this list.)_ It **does** touch `promoteEmployee` (one guard moved and gated, §13.7) and
   `action-proposals.ts` (one lookup const, three template literals, §14.3). Neither is part of
   #263's own fix: #263 still routes to service code that already exists and changes none of it.
3. **Does not add a `ProposalDomain` value** — §1.1, re-confirmed for #265 in §14.1.
4. **Does not build reactivation** — §4.5(G).
5. **Does not accept the hire-date behaviour delta** — _(rewritten; §4.2(a) said the opposite.)_ It
   is fixed as #266, and the fix is deliberately narrow: the floor still fires for pay, employment
   type, `positionId` and `jobTitle`, and is skipped only for a reporting-line-only change (§13.4).
   It does **not** touch `recordCompensationChange`'s identical floor, where the unconditional form
   is correct (§13.8).
6. **Does not leave the notification copy wrong** — _(rewritten; §4.3(3) deferred it.)_ It is fixed
   as #265, scoped to `action-proposals.ts`. The two matching strings in
   `(app)/requests/proposals/+page.svelte:97,241` are **flagged, not fixed** (§14.4).
7. **Does not touch `updateEmployee:609`'s falsy check** — §6.5, still unreachable after Step 1.
8. **Does not `.strict()` `offboardSchema`** — §12.4. #264 names `updateSchema`; and a caller
   following the shipped docs sends a `reason` field that schema does not have.
9. **Does not surface zod's field-level errors** in place of `'Invalid request body'` — §12.4.
10. **Does not stop writing `newValue.effectiveDate` for a reporting-line-only promotion**, even
    though it can now be a pre-hire date — §13.8. Inert in the timeline; mention, don't fix.

---

# 19. REVISED §8 — PR description points

§8's eleven stand, with **5** and **10** replaced and four added. Total: 15.

**5. (replaced)** ~~One behaviour delta for a legitimate caller~~ → **No behaviour delta for a
legitimate caller — the one that existed was a bug and is fixed here (#266).**
`promoteEmployee`'s hire-date floor ran before it knew what the promotion changed, so it refused
_any_ call dated below the hire date — including a reporting-line change, which is a plain column
that applies immediately and records the effective date nowhere. A hire whose start date is still in
the future therefore could not be re-pointed at a different manager **at all**, through `?/promote`
or through the v1 PATCH. The floor is now evaluated after `payChanged`/`typeChanged` and the
`columns` set, and fires for pay, employment type, `positionId` and `jobTitle` — everything that
either writes an effective-dated snapshot or feeds the 201 timeline, which renders the date back
(`getEmploymentHistory:1310-1319`). `reportsToId` is neither, by an explicit decision already in the
file. **This fixes `?/promote` too, and no existing test needed editing** — `promotion.test.ts:158`
still refuses a backdated `jobTitle`, which is exactly the gate's upper edge.

**10. (replaced)** ~~Flagged, not fixed: the notification copy~~ → **The proposal notification copy
is domain-aware now (#265).** All three messages said "pay change" regardless of domain — already
wrong for the `jobTitle`-only promotions `?/promote` has filed since #222, and about to be wrong for
the `reportsToId`-only ones this PR makes reachable from the API. One `Record<ProposalDomain,
string>` and three template literals; the `COMPENSATION` copy is byte-identical to before. No enum
value, no migration. The two matching strings in `/requests/proposals/+page.svelte` (`:97`, `:241`)
are flagged for a follow-up.

**12. (new)** **`updateSchema` is `.strict()` now (#264).** It was a plain `z.object`, so zod
stripped unknown keys: a PATCH naming a field the API does not have was a **200 that silently
discarded it**. That is the exact trap #235 and #263 each refused for one specific field; this
applies the rule to the whole body. Audited before changing: nothing in `src` fetches this route, no
e2e spec PATCHes it, and all eight bodies across the unit suites are subsets of the schema — **zero
existing callers newly 400.** Note the ordering: `.strict()` is evaluated inside `safeParse`, so a
body with an unknown key **and** an `employmentStatus` gets the generic parse 400 rather than the
offboard pointer. Intended — that body used to succeed with a silent partial write.

**13. (new)** **Four issues, one PR, in this order:** #264 (`.strict()`) → #266 (the floor) → #263
(the two gaps, the PR's subject) → #265 (the copy). The only hard ordering constraint is #266 before
#263: #263's test for a pre-boarded hire's reporting line asserts the _opposite_ outcome depending
on which lands first, and writing it against the old floor would have meant editing a fresh
assertion to make a later commit pass. #264 is first because it changes the parse gate every later
route test runs through. #265 is last because it is fully independent — different file, different
layer — and can be dropped without a rebase.

**14. (new)** **What each item did NOT need.** No `ProposalDomain` value, no `schema.prisma` change,
no `db push`, no migration script, no `prisma generate`, no `.svelte` file, no `updateEmployee`
change, no `assertNotSelf` change. The service-layer fix #263 routes to is still entirely code that
already existed.

**15. (new)** **Follow-ups flagged, not fixed** (three, all recorded with their reasoning in the
plan): `offboardSchema` is still not `.strict()` and the contract doc's `reason` field is why
(§12.4); `/requests/proposals/+page.svelte:97,241` still say "pay change" (§14.4); a
reporting-line-only promotion still records a `newValue.effectiveDate` that can now predate the hire
date, inert in the timeline but visible in the raw audit log (§13.8).

---

# 20. REVISED §9 — delivery and commit breakdown

**The branch decision in §9 is unchanged and still correct:** execute directly on
`fix/reports-to-org-scoping-235` on top of `98ea3df`; no `git switch -c`, no second PR; #235 and
#263 validated together and merged as **one** PR into `staging`. #264/#265/#266 are formal GitHub
sub-issues of #263, which is itself a sub-issue of #235 — the whole set is one tree and belongs in
one PR.

**What changes: five commits instead of one or two,** one per item, ordered per §11.3. Each is
independently green (§17.6 gives the per-commit gate) and each is independently revertable, which is
the property that makes folding three extra issues in defensible.

| #   | Subject (no trailers, per repo CLAUDE.md)                                                   | Contents                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `fix(employees): reject unknown fields on the v1 employee PATCH (#264)`                     | §16 Step 0a + `employee-patch-authorization.test.ts` created with cases 15–16                                                                                                                                                                                       |
| 2   | `fix(employees): apply the hire-date floor only to effective-dated changes (#266)`          | §16 Step 0b + `promotion.test.ts` cases A–B                                                                                                                                                                                                                         |
| 3   | `fix(employees): route the v1 PATCH's reporting-line change through propose→confirm (#263)` | §16 Steps 1–3 + `employee-patch-authorization.test.ts` cases 1–14 + `reports-to-scoping.test.ts`'s comment, if §6.3 finds it needs one. May be split in two, with `refuse employmentStatus edits on the v1 PATCH (#263)` as its own commit, exactly as §9 suggested |
| 4   | `docs(contracts): correct the v1 employee PATCH/offboard contract (#263)`                   | §16 Step 4. **Droppable** — no code dependency in either direction; drop PR point 9 with it                                                                                                                                                                         |
| 5   | `fix(notifications): name the domain in proposal notices instead of always "pay" (#265)`    | §16 Step 6 + `action-proposals.test.ts` cases A–D. **Droppable** — nothing else in the PR opens that file                                                                                                                                                           |

`pnpm test` at the tip is the gate for all five changes plus #235's. Per §9's own rule, #235's
`reports-to-scoping.test.ts` must be green **at every commit**, not only at the tip — which is now
five checkpoints rather than two, and is why §17.6 lists it in commit 1's inner loop even though
#264 cannot affect it.

**After merge, close #235, #263, #264, #265 and #266 by hand** — issues do not auto-close here
(merges land on `staging`, not the default branch). Five issues, not two.

---

# 21. REVISED §10 — execution checklist, end to end

**This supersedes §10.** 28 steps. Run in order; the numbered commits are §20's.

## Setup

1. Confirm the working tree: `git status` clean on `fix/reports-to-org-scoping-235`,
   `git rev-parse HEAD` == `98ea3df…`. **Do not create a branch. Do not touch `staging`.** Nothing
   from #263 has been committed, so every "before" block in §5, §12.3, §13.7 and §14.3 is still the
   text on disk.
2. Re-read all four target files and confirm they match the "before" blocks verbatim before editing
   anything: `+server.ts:20-39` and `:95-165`; `employees.ts:906-910` and `:960-972`;
   `action-proposals.ts:29-33`, `:170-174`, `:224`, `:262-264`. If any has drifted, **stop** — the
   line numbers came from a clean tree and a drifted one means something else has landed.

## Commit 1 — #264

3. `+server.ts` — wrap `updateSchema`'s object in `z.object({…}).strict()` and add the two-paragraph
   comment above it, per **§12.3**. Field definitions are byte-identical; only the wrapper, the
   indent and the comment change.
4. Create `tests/unit/employee-patch-authorization.test.ts` with the full mock scaffold from **§6.1**
   (unchanged), the docblock from §6.1 **plus** §17.1's fourth paragraph, and **only** the
   `unknown fields are refused, not stripped (#264)` describe block — cases **15** and **16** of
   §17.2.
5. Run commit 1's gate (§17.6). Case 15's `dbMock.employee.findFirst` **not called** assertion is
   the one that proves the parse gate precedes every query — read it, don't just watch it go green.
6. **Commit 1.**

## Commit 2 — #266

7. `employees.ts` — **Hunk 1**: delete the `if` at `:908-910`, keeping `const eff` and `const today`
   (both are used five more times). **Hunk 2**: insert the gated floor immediately above the
   future-date guard at `:964`, with the `LOWER —` comment, and prefix the existing guard's comment
   with `UPPER —`. Per **§13.7**.
8. **Verify exactly one copy of the floor exists:**
   `grep -c "Effective date cannot be before the hire date" src/lib/server/services/employees.ts`
   → **2** (one in `recordCompensationChange:767`, one in `promoteEmployee`). If it returns 3, Hunk 1
   was not applied and the change is a no-op that will still pass every test in §17.3.
9. `pnpm exec vitest run tests/unit/promotion.test.ts` — **before** adding anything to it. All 13
   existing cases must be green **unmodified**, `:158-167` included. **If `:158-167` is red, the gate
   was implemented as §13.4 Option A (two terms) instead of Option B (four). Fix the gate, not the
   test** (§13.5).
10. Add the `promoteEmployee hire-date floor (#266)` describe block with cases A and B, per
    **§17.3**. Case B must assert on the **message**, not just `status: 400` — three different 400s
    are reachable from that input and only one proves the floor fired.
11. `pnpm exec vitest run tests/unit/promotion.test.ts tests/unit/pay-proposal-routing.test.ts`.
    `pay-proposal-routing.test.ts` is a gate here, not a bystander: all seven of its
    `promoteEmployee` calls now run through the moved floor.
12. **Commit 2.**

## Commit 3 — #263 core

13. `+server.ts` — add `employmentStatus` and `reportsToId` to the destructure at `:102`, extend the
    block comment, and insert the `employmentStatus` 400 immediately after, **before**
    `const ctx = {`. _(§5 Step 1, unchanged.)_
14. `+server.ts` — widen the promote trigger at `:131-135` with `reportsToId !== undefined ||`, add
    `reportsToId` to the input object at `:140`, extend the two comments. _(§5 Step 2, unchanged.)_
15. `+server.ts` — reword the 202 comment at `:160-162`. Comment only. _(§5 Step 3, unchanged.)_
16. **Verify-only pass, no edits:** `employees.ts:402-409`, `:582-589`, `:605-611`, `:1099-1110`;
    `enum ProposalDomain`; `(app)/requests/proposals/+page.server.ts:144-151`. If any seems to need
    an edit, **stop** — the design in §1 is wrong. _(§5 Step 5, unchanged. Note these ranges are
    disjoint from step 7's — §13.1.)_
17. `pnpm exec vitest run tests/unit/reports-to-scoping.test.ts` **on its own, first.** If
    `:214-225` fails, re-sequence its mock chain and update the ordering comment per **§6.3**. **Do
    not weaken `:204-212`'s 404/no-write assertions.**
18. `pnpm exec vitest run tests/unit/self-action-guards.test.ts` — must pass **completely
    unmodified**. A red `:104-114` means the `employmentStatus` rejection landed in `updateEmployee`
    instead of the route (§4.1).
19. Extend `employee-patch-authorization.test.ts` with cases **1–14** of §17.2. Cases **7 and 8 are
    the pair that proves #266 landed at the right granularity**: 7 green and 8 green means the gate
    is drawn correctly; both 400 means step 7 was not applied; both 200 means the floor was removed
    rather than gated.
20. Run commit 3's gate (§17.6). Cases **1, 3, 4, 8** and **11** are the ones that would still pass
    against a subtly wrong fix — read their assertions.
21. **Commit 3.**

## Commit 4 — the spec doc

22. `specs/001-hris-platform/contracts/employees.md:83-105` — replace the PATCH and offboard blocks
    per **§5 Step 4**. Markdown only. _(Droppable; if dropped, drop PR point 9 too.)_ **Commit 4.**

## Commit 5 — #265

23. `action-proposals.ts` — add `DOMAIN_NOUN` after `confirmerCapabilityFor`, and convert the three
    messages to template literals, per **§14.3**. `pending.domain` is available at both consumer
    sites because `requirePending` returns the whole row (§14.1).
24. Add cases A–D to `tests/unit/action-proposals.test.ts` per **§17.4**, plus the
    `const { notifyMany } = await import('$lib/server/services/notifications')` line. Case B is the
    regression half — the `COMPENSATION` copy must not move. Run commit 5's gate. **Commit 5.**

## Ship

25. Full gate at the tip, in CI order: `pnpm format:check` → `pnpm lint` → `pnpm check` →
    `pnpm test`, all green. `format:check` **will** flag the re-indented `updateSchema` if prettier
    was not run — use the scoped `prettier --write` in §17.6, not `pnpm format`.
26. _(Optional)_ live verification: §6.6's six steps **plus** §17.7's steps 7–9, after #235's own
    live checks.
27. Push the branch and open **one** PR against `staging` covering **#235, #263, #264, #265 and
    #266**, carrying #235's seven points plus §8/§19's fifteen. No `Co-Authored-By`, no co-author
    trailer of any kind, no `.env`.
28. After merge, close **#235, #263, #264, #265 and #266 by hand** — issues do not auto-close on a
    merge to `staging`.
