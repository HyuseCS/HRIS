# PLAN — #290 Salary-history masking: make the 201 file give one answer

**Date**: 10-08-26
**Status**: PLANNED — VALIDATE run (CONDITIONAL, 0 FAILs); all four open concerns now resolved by
user decision and applied below. Not started; no branch cut, nothing executed.
**Complexity**: SIMPLE
**Issue**: #290 (labels `bug`, `area:auth`, `area:employee`)
**Branch (to cut)**: `fix/salary-history-masking-290`, off an updated local `staging` (`5641987`, clean)

## Overview

**TL;DR:** The 201 file masks today's salary behind an audited reveal and prints every past salary
in cleartext a few centimetres below. Mask the salary cells in the Employment History panel too, and
release them through the reveal that already exists. ~22 source lines across 3 files plus two new
unit-test files, in **4 commits**. The whole risk of this change is one line of ordering: masking must
happen **after** the diff loop's `from === to` equality check, or every salary change silently
vanishes from the timeline. Complexity: **SIMPLE** (12 checklist steps, one session).

VALIDATE (CONDITIONAL, 0 FAILs) added one commit that is not about masking at all: the `?/reveal`
action has no object-level access check, and this change would widen what that gap leaks. See
*Design decision 3*. It lands **before** the payload widens.

INNOVATE deliberately skipped — the user has locked the approach (Option 1 of the issue). This plan
is the *how*.

---

## Policy (settled — do not relitigate)

Salary figures on the 201 file are masked by default and released only through the audited
`?/reveal` action, **on both surfaces**: the current basic monthly salary and every historical
figure in the Employment History panel.

Three things stay **visible** in the history panel, unmasked and unaudited:

- the date of each event (recorded-on and effective-from)
- the actor's email
- the *fact* that a compensation change occurred, and its `Basic salary` label

Rejected and closed:

- **Option 2** (unmask the current figure to match history) — rejected by the user.
- **Option 3** (document the split as intentional) — rejected by the user.
- **#285** (audit the page load / audit reads) — closed not-planned by the user's decision. Log the
  changes, not the reads. Auditing page loads is out of scope forever. #290 is *only* about the two
  surfaces disagreeing.

---

## Verified findings

Every fact in the brief was re-checked against the working tree at `5641987`. Results:

| # | Claim | Verdict | Evidence |
|---|---|---|---|
| 1 | `getEmploymentHistory` has exactly one caller, in a `Promise.all`, gated `canManage ? … : Promise.resolve([])` | **TRUE** | `grep -rn getEmploymentHistory src/ tests/` → 2 hits only: the definition at `employees.ts:1260` and `src/routes/(app)/employees/[id]/+page.server.ts:141`. No test references it today. |
| 2 | `canManage` and `canReveal` are the same capability; `?/reveal` requires `MANAGE_HR`, computes `isSelf`, passes `{ audit: !isSelf }` | **TRUE** | `+page.server.ts:90` `canAny(…, 'MANAGE_HR')`; `:169` identical expression; `:531-548` the action, `requireAnyCapability(…, 'MANAGE_HR')` then `revealEmployeeSensitive(…, { audit: !isSelf })`. |
| 3 | The UI renders `c.from` / `c.to` as opaque strings, no per-field branching | **TRUE** | `+page.svelte:1703-1712` — `{c.from} → {c.to}` inside `{#each ev.changes as c (c.label)}`. Service-side masking is sufficient; no field-aware UI logic needed. |
| 4 | `MASKED_SALARY = '••••••'` exists in `src/lib/utils/format.ts` | **TRUE** | `format.ts:45` (comment at `:44`), with the comment "Salary is masked whole, never last-4". |
| 5 | The bare-`include` trap is **benign here** | **TRUE — confirmed, do not "fix"** | `employees.ts:1272` uses `include: { actor: { select: { email: true } } }`, which does return every `AuditLog` scalar server-side. But the loop at `:1305-1334` constructs each `EmploymentHistoryEvent` field-by-field (`id`, `date`, `actorEmail`, `type`, `changes`, `effectiveDate`) with **no `...log` spread anywhere**. `ipAddress`, `userAgent`, raw `oldValue`, raw `newValue` therefore never cross to the client. This is structurally different from the dashboard (#242) and the audit-log list, which *did* spread. **No projection change is in scope.** |

Nothing in the brief turned out to be wrong. Four additional facts found during verification, all of
which change the plan:

- **F6 — the drop is worse than "the row disappears".** The event is only pushed at `:1324` under
  `if (changes.length > 0)`. So when the surviving change set would be empty, masking before the
  equality check does not merely blank a cell: it deletes the **entire timeline entry**, date, actor
  and all. This is the single highest-consequence failure mode in the change.
  **Corrected reasoning (VALIDATE C-4):** the draft said this happens because `recordCompensationChange`
  writes salary as the *only* changed field. That is wrong. `employees.ts:806-812` writes
  `oldValue: { basicMonthlySalary, rateType }` and
  `newValue: { basicMonthlySalary, rateType, effectiveDate }` — **two** diffed fields, not one. The
  conclusion survives for a different reason: on an ordinary raise `rateType` is **equal on both
  sides**, so the equality check at `:1321` drops it, leaving salary as the only *surviving* change.
  Mask salary before that check and the survivor count reaches zero anyway. `effectiveDate` is not in
  `HISTORY_FIELDS`, so it is never diffed — it is read separately at `:1326`.
- **F7 — no Prisma `Decimal` is involved.** The history figures come out of `AuditLog.oldValue` /
  `newValue`, which are `Json?` columns (`prisma/schema.prisma`), so `raw` is a plain JSON number,
  and `display()` already returns a `string` via `money.format(Number(raw))`. Nothing here touches
  the `src/hooks.ts` transport hook. (The *current*-salary reveal at `:307` does return a Decimal —
  that path is unchanged by this plan.)
- **F8 — no existing test covers `getEmploymentHistory`.** `tests/unit/employment.test.ts` is about
  `src/lib/utils/employment.ts` (`employmentTypeLabel`, `contractRenewalStatus`) and is unrelated.
  This change ships the first test this function has ever had, so there is no pre-existing suite to
  keep green and no fixture to reuse.
- **F9 — the `'—'` placeholder is load-bearing.** `display()` returns `'—'` for null/empty
  (`:1289`). A first-ever salary being set reads `— → ₱25,000.00`. See the design decision below.

---

## Design decision 1 — shared reveal, not a second control

**RECOMMENDED: extend the existing `?/reveal`. One button, one audit row, both surfaces.**

Why:

1. **A separate control buys no access granularity.** The stated benefit is "HR could read history
   without unmasking the current figure." But `canManage` (which gates the whole history panel) and
   `canReveal` (which gates the button) are the *same* `canAny(roles, 'MANAGE_HR')` expression —
   fact 2. There is no population that can see the history panel and cannot press the reveal button.
   The separation would restrict nobody.
2. **The #242 precedent does not transfer.** The audit-log page ships a *per-entry* reveal because
   each row is a **different subject employee** — per-entry there is about *whose* data is being
   released, and one control would over-release across subjects. On the 201 file every history row
   is the *same* employee, who is already the subject of the existing reveal. The dimension #242
   splits on does not exist here.
3. **Two controls make the audit trail worse, not better.** `revealEmployeeSensitive` writes
   `newValue: { fields: [...SENSITIVE_FIELDS] }` (`employees.ts:331-336`). A second reveal calling
   the same service would emit a **second, byte-identical `VIEW` row** that no auditor could
   distinguish from the first. Making it legible would require inventing a new field token
   (`basicMonthlySalary.history`) and a second service entry point — real cost, for a distinction
   nobody can act on.

**Stakes, stated for both options:**

| | Shared reveal (recommended) | Separate history reveal |
|---|---|---|
| Audit trail after one HR reveal | exactly **one** `VIEW` row, `fields = SENSITIVE_FIELDS` (all 7) | **two** `VIEW` rows, identical unless a new field token is invented |
| Audit trail on a **self**-reveal | **zero** rows (audit-exempt, #111 decision #2) — unchanged | zero rows, or one if the new path forgets the `isSelf` exemption — a new way to get it wrong |
| Cost | HR wanting only history also unmasks today's figure — a strictly *wider* read that **is** recorded | HR can read history alone; nobody can currently benefit |
| Code | +1 return field, +1 `$derived` | +1 form action, +1 service entry point, +1 button, +1 field token, +1 `isSelf` duplication |

Accepted residual: the shared reveal over-releases (the current figure comes along). This is safe
because the release is *recorded* — the failure mode of an audit system is under-recording, and this
errs the other way.

## Design decision 2 — `'—'` stays visible; only real figures are masked

**RECOMMENDED: mask a salary cell only when the underlying raw value is non-null.** A cell that
`display()` rendered as `'—'` stays `'—'`.

Why: `'—'` *is* the absence of a figure. Replacing it with `••••••` hides nothing, and actively
destroys information — it makes "no salary was recorded" indistinguishable from "a salary was
recorded and you may not see it". Concretely, the first-ever salary set would render
`•••••• → ••••••`, which is both meaningless to the reader and the exact shape the equality-check
trap produces, making a real bug and correct behaviour look identical on screen.

Cost: a reader learns that a salary went from *unset* to *something*, without learning the amount.
That is the same information the visible `Basic salary` label already discloses.

---

## Design decision 3 — fix the reveal action's missing access check, in its own commit

**USER DECISION: fix it.** VALIDATE's concern C-1, accepted and folded in as a new commit that lands
**before** the payload widens.

**The hole, verified independently.** The `?/reveal` action (`+page.server.ts:532`) gates on
`requireAnyCapability(locals.user!.roles, 'MANAGE_HR')` and nothing else. `load` calls
`await assertCanTouchEmployee(locals.user!, employee.id)` at `:100`; the action does not. A SvelteKit
form action runs **independently of `load`**, so a direct `POST /employees/<any-id>?/reveal` never
executes the object-level check. `MANAGE_HR` includes `MANAGER` (`src/lib/rbac.ts:55`), and
`revealEmployeeSensitive` scopes by organization only (`employees.ts:313-314`). So any MANAGER can
today reveal the salary, government IDs and bank details of **any** employee in their tenant, not
just their own team. `src/lib/rbac.ts:59-63` states the violated rule verbatim: *"use it, never
MANAGE_HR, to decide 'may reach any employee record' — `assertCanTouchEmployee` is the enforcement
point."*

**Why this is in scope, stated plainly.** This hole **pre-exists #290** and was not found by going
looking for bugs. It is folded in because commit 4a widens its payload: today a bypass leaks the
current sensitive fields; after commit 4a the same bypass would also leak **the entire historical
salary trail**. Shipping the widening while knowingly leaving the door open is the objectionable act;
fixing the door first is the cheapest way not to commit it. Sequencing matters more than the fix
itself — hence its own commit, before commit 4.

**The fix.** One line at the top of the action body, before `revealEmployeeSensitive` is reached:

```
await assertCanTouchEmployee(locals.user!, params.id)
```

`assertCanTouchEmployee` is already imported at `+page.server.ts:4` — **no import change**. Verified
signature: `(user: EmployeeAccessActor, employeeId: string): Promise<void>`, throwing
`error(403, 'You can only manage your own team or a branch you manage.')`. `locals.user!` is the same
object `load` passes at `:100`. The action has no `employee` object in scope, so it must pass
`params.id`; that is the same value `load` resolves to `employee.id`, since `getEmployee(params.id)`
looks up by that id.

**Self-reveal reconciliation — checked, not assumed.** An HR user opening their own 201 file still
passes, by two independent routes in `canTouchEmployee` (`employee-access.ts`):

| Actor | Path through `canTouchEmployee` | Result |
|---|---|---|
| HR_ADMIN / CEO / SUPER_ADMIN (own file or anyone's) | holds `ADMINISTER_HR_ORGWIDE` → `return true` on the first line | passes |
| MANAGER on their **own** file | `self.id === employeeId` → `return true` | passes |
| MANAGER on a **report** or a branch they manage | `isReport` / `managedBranches` clause | passes |
| MANAGER on an unrelated employee | falls through → `false` | **403 — the case being closed** |
| `MANAGE_HR` holder with **no employee record** | `if (!self) return false` | 403 |

The last row is the only behaviour change for a non-malicious actor, and it cannot affect a
self-reveal: a user with no employee record has no own 201 file to open. **Stronger still:** the
Reveal button is only reachable from a page whose `load` already ran this exact check at `:100`, so
by construction nobody who can currently see the button can be locked out by adding it to the action.
The change is unreachable from the UI and only closes the direct-POST path. No doubt remains on this
point.

**What is NOT being done:** no capability is added, removed or redefined; `CAPABILITIES`,
`MANAGE_HR` and `ADMINISTER_HR_ORGWIDE` are untouched. This is an object-level check at one call
site, using the enforcement point the codebase already designates.

---

## The trap this plan exists to dodge

The diff loop, verbatim (`employees.ts:1317-1323`):

```
for (const field of HISTORY_FIELDS) {
    if (!(field in newValue)) continue
    const from = display(field, oldValue[field])
    const to = display(field, newValue[field])
    if (from === to) continue                      // ← compares FORMATTED strings
    changes.push({ label: HISTORY_LABELS[field], from, to })
}
if (changes.length > 0) { events.push(...) }       // ← :1324, and this is why it is fatal
```

If the mask is applied inside `display()` — the obvious place, and the wrong one — then for every
salary change `from` and `to` both become `'••••••'`, `from === to` is **true**, and `continue`
drops the change.

For a real `changeCompensation` write the payload is `{ basicMonthlySalary, rateType }` →
`{ basicMonthlySalary, rateType, effectiveDate }`. `rateType` is unchanged on an ordinary raise, so
the equality check already drops it; salary is the **only surviving** change. Mask salary before the
check and `changes.length` reaches 0, so `:1324` drops the **whole event**. The panel would then
claim no compensation change ever happened — the precise opposite of what Option 1 promises, and a
silent, green-tests failure.

**The rule: mask after the equality check, never inside `display()`.** Test T3 exists solely to pin
this, and mutation M2 exists solely to prove T3 works.

---

## Touchpoints

Changed (3 files):

- `src/lib/server/services/employees.ts` — `getEmploymentHistory` gains an `opts` parameter and a
  post-equality-check mask; doc comment updated
- `src/routes/(app)/employees/[id]/+page.server.ts` — `?/reveal` additionally returns unmasked history
- `src/routes/(app)/employees/[id]/+page.svelte` — history panel reads a `$derived` source instead of
  `data.history` directly

- `src/routes/(app)/employees/[id]/+page.server.ts` — `?/reveal` also gains the object-level access
  check (design decision 3); same file as above, different commit

New (2 files):

- `tests/unit/employment-history-masking.test.ts` (T1–T7, the masking rows)
- `tests/unit/employee-reveal-access.test.ts` (T8–T9, the reveal action)

Read-only references: `src/lib/utils/format.ts:44-45` (`MASKED_SALARY`),
`tests/unit/employee-masking.test.ts:1-48` (the `vi.hoisted` + `vi.mock('$lib/server/db')` +
top-level `import` idiom to copy), `tests/unit/audit-log-reveal.test.ts:37` (the
`const { load, actions } = await import('…/+page.server')` idiom for testing a form action),
`src/lib/server/services/employee-access.ts` (`canTouchEmployee` / `assertCanTouchEmployee`),
`src/lib/rbac.ts:53-63` (`MANAGE_HR` vs `ADMINISTER_HR_ORGWIDE`),
`src/lib/server/services/employees.ts:108-131`
(`HISTORY_FIELDS` / `HISTORY_LABELS`), `prisma/schema.prisma` (`model AuditLog`, `@@map("audit_logs")`).

**Explicitly NOT touched:** the `include` at `:1272` (fact 5 — benign), `revealEmployeeSensitive`,
`maskEmployee`, `SENSITIVE_FIELDS`, `getEmployee`, `src/hooks.ts`, `src/lib/rbac.ts`,
`src/lib/server/services/employee-access.ts`, `prisma/schema.prisma`. No capability is added, removed
or redefined — design decision 3 *calls* an existing enforcement point, it does not change one. No
schema change, no migration, no `db push`.

## Public Contracts

| Contract | Change |
|---|---|
| `getEmploymentHistory(employeeId, organizationId)` | Gains a third parameter `opts: { unmask?: boolean } = {}`. **Additive and defaulted**, so the existing call site compiles unchanged — but its *behaviour* narrows: by default, `changes[].from` / `.to` for the `Basic salary` label now return `'••••••'` (or `'—'`) instead of `'₱25,000.00'`. Every other label is byte-identical. |
| `EmploymentHistoryChange` / `EmploymentHistoryEvent` | Unchanged. `from` / `to` are already `string`; the sentinel is a string. No type change, and therefore no compile-time protection — which is why the mutation table below carries the weight. |
| `?/reveal` action return | `{ revealed }` → `{ revealed, history }`. Additive. |
| `?/reveal` action authorization | **Narrows.** Adds `assertCanTouchEmployee`, so a `MANAGE_HR` holder without object-level access to the target now gets `403 'You can only manage your own team or a branch you manage.'` where they previously got the payload. Unreachable from the UI (`load` already enforces the same check), so only the direct-POST path changes. See design decision 3. |
| `/employees/[id]` load data | Unchanged (`history` still present, now masked). |
| `MASKED_SALARY`, `SENSITIVE_FIELDS`, `maskEmployee`, `revealEmployeeSensitive` | Unchanged. |
| Audit behaviour | Unchanged. One `VIEW` row per non-self reveal; zero on self-reveal. No new audit write anywhere. A 403 from the new guard writes nothing, because it throws before `revealEmployeeSensitive` is reached. |
| `assertCanTouchEmployee`, `canTouchEmployee`, `CAPABILITIES`, `MANAGE_HR`, `ADMINISTER_HR_ORGWIDE` | Unchanged. Called, not modified. |

## Blast Radius

- **3 source files changed, 2 test files added.** ~22 changed source lines (one of them is the
  design-decision-3 guard).
- **1 package** (single SvelteKit app; no workspace fan-out).
- **Risk class: permission / trust-boundary logic** (high-risk per the test-tier rules → a hybrid or
  probe gate is mandatory, satisfied by the manual verification script below).
- **Reachable surfaces:** exactly one route, `/employees/[id]`, for `MANAGE_HR` holders. No API
  endpoint, no PDF, no export, no report reads this function (fact 1). The design-decision-3 guard
  additionally closes the direct-`POST ?/reveal` path on that same route.
- **Reversibility:** trivial — revert the commits. No data written, no schema touched.

---

## Commit sequence (test-first)

**Four commits.** The service change and its test are separate so the RED state is recorded, and the
design-decision-3 access guard lands at commit 3 — **before** commit 4 widens the payload that guard
protects. That ordering is the whole point of splitting it out; do not merge commits 3 and 4.

### Commit 1 — RED: pin the history panel's salary behaviour

`test: pin salary masking in the employment-history panel (#290)`

New file `tests/unit/employment-history-masking.test.ts`. Copy the idiom from
`tests/unit/employee-masking.test.ts:1-48` — `vi.hoisted` for the mock fns, `vi.mock('$lib/server/db')`,
then a top-level `import { getEmploymentHistory } from '../../src/lib/server/services/employees'`
and `import { MASKED_SALARY } from '../../src/lib/utils/format'`.

Mock surface — `getEmploymentHistory` touches exactly five db methods and nothing else
(`auditLog.findMany`:1264, and the four lookups at `:1277-1280`), so this mock is complete:

```
db: {
  auditLog:     { findMany },
  department:   { findMany },
  position:     { findMany },
  workSchedule: { findMany },
  branch:       { findMany }
}
```

Do **not** mock `$lib/server/audit` — this function never writes an audit row, and mocking a sink it
does not use would disguise it if one were ever added.

Fixture factory `logFor(oldValue, newValue)` returning
`{ id, createdAt: new Date(...), action: 'UPDATE', actor: { email: 'hr@veent.ph' } }` plus the two
JSON blobs. The four lookup mocks resolve to `[]` by default (only T6 needs a department row; T4
changes `jobTitle`, which needs no lookup).

**T3's fixture must be the real one.** VALIDATE (C-4) established that `recordCompensationChange`
(`employees.ts:806-812`) writes two diffed fields, not one. Using the real shape keeps T3 pinning the
trap *and* additionally pins that the `effectiveDate` passthrough at `:1326` survives masking. It
also makes T3 a second detector for mutation M6 — see the mutation table.

Test rows:

| ID | Scenario | Asserts |
|---|---|---|
| T1 | default call, salary 25000 → 30000 | the event exists; its single change has `label: 'Basic salary'`, `from === MASKED_SALARY`, `to === MASKED_SALARY`; and **neither string contains `'25'` or `'30'`** (a substring assertion, so a partial mask cannot pass) |
| T2 | same log, `{ unmask: true }` | `from` / `to` are the real `money.format` strings (`₱25,000.00` / `₱30,000.00`) |
| T3 | **the trap** — the **real** `recordCompensationChange` payload (VALIDATE C-4): `oldValue: { basicMonthlySalary: 25000, rateType: 'MONTHLY' }` → `newValue: { basicMonthlySalary: 30000, rateType: 'MONTHLY', effectiveDate: '2026-09-01' }`, default call | `events.length === 1`; `events[0].changes.length === 1` (only `Basic salary` survives — `rateType` is equal on both sides and the equality check drops it); `changes[0].label === 'Basic salary'`; the event still carries its `date`, `actorEmail` **and** `effectiveDate === '2026-09-01'`. Asserts structure only, never a mask value — that is what makes it independent of T1 |
| T4 | salary **and** `jobTitle` change in one log, default call | two changes; `Job title` is cleartext (`'Cashier' → 'Supervisor'`); `Basic salary` is masked |
| T5 | first-ever salary, `null → 25000`, default call | the change is present; `from === '—'`; `to === MASKED_SALARY` |
| T6 | a log changing `departmentId`, `employmentType` and `rateType` only, default call | all three render cleartext exactly as today (`'Operations'`, `'PART TIME'`, `'Hourly rate'`) — pins that nothing else got swept into the mask |
| T7 | salary present on both sides with the **same** value (25000 → 25000), default call | `events.length === 0` — the equality check still drops no-op writes, i.e. we did not "fix" the trap by deleting the check |

Expected at this commit: **T1 and T5 FAIL** — and only those two. Today's output is cleartext, which
is exactly what T1/T5 reject. **T2 PASSES at RED**, and this is not a mistake: `pnpm test` is
`vitest run` with no `test.typecheck`, so esbuild strips the types and the not-yet-existing third
argument is silently ignored — the call returns cleartext, which is what T2 asserts. Do not contort
T2 to force it red. T2, T3, T4, T6, T7 PASS today — they are the regression floor, and their passing
now is the point. Record the observed failure
output in the commit body; a RED commit never seen red proves nothing.

### Commit 2 — the service change

`fix: mask historical salary figures behind the audited reveal (#290)`

`src/lib/server/services/employees.ts`:

1. **`:1260-1263`** — signature becomes
   `getEmploymentHistory(employeeId: string, organizationId: string, opts: { unmask?: boolean } = {})`.
   The default makes the existing call site at `+page.server.ts:141` compile untouched.
2. **`:1288-1299`** — `display()` is left **completely alone.** Write a one-line comment above it
   saying so and why: masking here would collapse `from === to` at `:1321` and delete the event at
   `:1324`. This comment is the durable defence against a future reader "simplifying" the change.
3. **`:1317-1323`** — insert the mask between the equality check and the push:

   ```
   for (const field of HISTORY_FIELDS) {
       if (!(field in newValue)) continue
       const from = display(field, oldValue[field])
       const to = display(field, newValue[field])
       if (from === to) continue
       // #290: mask AFTER the equality check — masking inside display() makes every salary
       // change compare equal, dropping the change and (when salary is the only field) the
       // whole event. '—' passes through: absence hides nothing.
       const mask = (s: string) =>
           field === 'basicMonthlySalary' && !opts.unmask && s !== '—' ? MASKED_SALARY : s
       changes.push({ label: HISTORY_LABELS[field], from: mask(from), to: mask(to) })
   }
   ```

4. Add `MASKED_SALARY` to the **existing** `$lib/utils/format` import, which is `employees.ts:11`
   and today reads `import { maskEmployee, SENSITIVE_FIELDS } from '$lib/utils/format'`. Edit that
   line in place. **No gate catches a duplicate import** — `eslint.config.js` configures neither
   `no-duplicate-imports` nor `import/no-duplicates`, and a second import line passes `format:check`,
   `lint`, `check` and `test` silently. (An *orphaned* import is still caught, by
   `@typescript-eslint/no-unused-vars`.)
5. **`:1257-1259`** — extend the function's doc comment: salary figures are masked by default and
   released only through the audited `?/reveal`, matching the current figure (#111/#290).

Expected: all seven rows green. No other test changes state — no existing test references
`getEmploymentHistory` (fact 8).

### Commit 3 — close the reveal action's object-level access hole (design decision 3)

`fix: enforce object-level access on the 201 reveal action (#290)`

This commit contains **no masking logic**. It lands before commit 4 so the door is shut before the
payload behind it widens. See design decision 3 for the full rationale and the self-reveal
reconciliation.

**3a. New file `tests/unit/employee-reveal-access.test.ts` (written first, RED).** Use the
form-action idiom proven at `tests/unit/audit-log-reveal.test.ts:37`:

```
const { actions } = await import('../../src/routes/(app)/employees/[id]/+page.server')
```

Mocks (keep the surface tight — the route's import graph is large, but every module in it only
defines functions at module scope, so mocking the leaves is enough):

- `vi.mock('$lib/server/db', …)` — `employee.findUnique` for the `isSelf` lookup at `:536-539`
- `vi.mock('$lib/server/services/employee-access', () => ({ assertCanTouchEmployee }))` — the
  spy under test
- `vi.mock('$lib/server/services/employees', …)` — stub `revealEmployeeSensitive` and
  `getEmploymentHistory` so the test observes *whether* and *how* they are called

Event factory `revealEvent(roles, employeeId)` returning
`{ locals: { user: { id, roles, organizationId } }, params: { id: employeeId }, getClientAddress: () => '::1' }`.

| ID | Scenario | Asserts |
|---|---|---|
| T8 | the guard rejects (mock `assertCanTouchEmployee` throws `error(403, …)`) | `actions.reveal(event)` rejects with `{ status: 403 }`, **and** `revealEmployeeSensitive` was **not called** — proving the guard runs *before* the payload is fetched, not after |
| T9 | the guard passes | the action resolves to an object with both `revealed` and `history`, and `getEmploymentHistory` was called with a third argument of `{ unmask: true }` |

T9 belongs to commit 4 (it asserts the widened payload) — write it in commit 4, not here. Commit 3
ships T8 only.

**Buildability risk, stated honestly.** This is the first test to import
`(app)/employees/[id]/+page.server`, whose import graph pulls in roughly a dozen service modules.
The `audit-log-reveal.test.ts:37` precedent proves the idiom works for a route action on this repo,
and `employee-masking.test.ts:23` proves `services/employees` loads fine under vitest — but neither
proves *this* module's graph loads. If the import fails, add mocks for the offending leaf modules
until it resolves; do **not** abandon the test and fall back to asserting on `canTouchEmployee`
directly, because the whole point is to pin that *the action calls it*. If it proves genuinely
unbuildable, stop and report rather than silently downgrading — the probe alone (step 9b) would
leave AC-12 with no automated gate.

**3b. `src/routes/(app)/employees/[id]/+page.server.ts`** — add one line as the first statement of
the `reveal` action body, immediately after the existing
`requireAnyCapability(locals.user!.roles, 'MANAGE_HR')` at `:533`:

```
await assertCanTouchEmployee(locals.user!, params.id)
```

`assertCanTouchEmployee` is already imported at `:4` — **do not add an import**. Add a short comment
citing #228/#290: a form action runs independently of `load`, so the object-level check `load`
performs at `:100` must be repeated here; `MANAGE_HR` includes MANAGER, and this is the enforcement
point `rbac.ts:59-63` designates.

Expected: T8 green; all seven commit-1 rows still green; full gate order green.

### Commit 4 — route and UI wiring

`fix: release historical salary through the existing 201 reveal (#290)`

**4a. `src/routes/(app)/employees/[id]/+page.server.ts:531-548`** — inside the `reveal` action,
after `revealEmployeeSensitive(...)` resolves, also fetch the unmasked history and return both:

```
const history = await getEmploymentHistory(params.id, locals.user!.organizationId, { unmask: true })
return { revealed, history }
```

`getEmploymentHistory` is already imported at `:10`. Note in a comment that this deliberately adds
**no** second audit write — the single `VIEW` row from `revealEmployeeSensitive` covers both
surfaces, per design decision 1. Leave the `load` at `:141` exactly as it is; its default-masked
call is now the correct behaviour.

**4b. `src/routes/(app)/employees/[id]/+page.svelte`** —

- near `:39` (`const revealed = $derived(form?.revealed ?? null)`) add
  `const history = $derived(form?.history ?? data.history)`
- `:1682` `{#if data.history.length}` → `{#if history.length}`
- `:1684` `{#each data.history as ev (ev.id)}` → `{#each history as ev (ev.id)}`
- no other change; `c.from` / `c.to` stay opaque (fact 3), and no `{@const}` is introduced

**4c. Add T9 to `tests/unit/employee-reveal-access.test.ts`** (the row defined in commit 3's table):
the action resolves with both `revealed` and `history`, and `getEmploymentHistory` was called with
`{ unmask: true }`. This converts the former M7 residual from probe-only into an automated gate.

Expected: gates green; T8 and T9 green; the reveal button now unmasks both panels in one submit.

---

## Acceptance Criteria

Every criterion is testable and is proved by a named gate in Verification Evidence below.

| ID | Criterion | Proven by |
|---|---|---|
| AC-1 | On the 201 file, a past `Basic salary` figure renders as `••••••` for a `MANAGE_HR` viewer who has not pressed Reveal | T1, probe step 4 |
| AC-2 | After pressing Reveal, the same figures render as real `₱` amounts | T2, probe step 5 |
| AC-3 | A compensation change still appears in the timeline when masked — event, date, actor and `Basic salary` label all present | T3, probe step 4 |
| AC-4 | Non-salary changes (job title, department, employment type, rate basis, status, schedule, branch, position) render exactly as they do today | T4, T6 |
| AC-5 | A first-ever salary (`null → value`) renders `— → ••••••`; the `—` is not masked | T5 |
| AC-6 | A no-op salary write still produces no timeline event | T7 |
| AC-7 | Revealing writes exactly **one** `VIEW` audit row, not two | probe step 6 |
| AC-8 | A self-reveal still writes **zero** audit rows | probe step 7 |
| AC-9 | No new audit row is written by loading the page — read auditing remains out of scope (#285) | probe steps 3–4 (count unchanged before Reveal) |
| AC-10 | `getEmploymentHistory`'s existing call site compiles unchanged; no other caller exists | `pnpm check`, fact 1 |
| AC-11 | Every mask in the change dies under its named mutation, including the asymmetric one | mutation sweep M1–M6, **M8** (M9 covers the guard, under AC-12) |
| AC-12 | `?/reveal` refuses a target the actor has no object-level access to, **before** fetching any payload | T8, probe step 9b, mutation M9 |
| AC-13 | `?/reveal` actually passes `{ unmask: true }` — the widened payload is really widened | T9 (was probe-only as the "M7 residual"; now automated) |

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| T1 — default masks both sides of a salary change | Fully-Automated (`pnpm test`) | AC-1 — past salaries are no longer cleartext (the issue's core defect) |
| T2 — `{ unmask: true }` returns real figures | Fully-Automated | AC-2 — the reveal path still yields the data HR is entitled to |
| T3 — a salary-only change still appears as an event | Fully-Automated | AC-3 — "the fact that a compensation change occurred stays visible" |
| T4 — salary masked, job title cleartext, same log | Fully-Automated | AC-4 — only salary cells are covered |
| T5 — `null → value` renders `— → ••••••` | Fully-Automated | AC-5 — design decision 2 |
| T6 — department / employment type / rate basis untouched | Fully-Automated | AC-4 — no collateral masking |
| T7 — a no-op salary write still produces no event | Fully-Automated | AC-6 — the equality check is intact |
| T8 — reveal action rejects 403 and never reaches `revealEmployeeSensitive` when object-level access fails | Fully-Automated | AC-12 — design decision 3's guard runs, and runs first |
| T9 — reveal action returns `history` and passes `{ unmask: true }` | Fully-Automated | AC-13 — the route wiring is real, not just the service |
| Manual probe steps 4–6 — HR sees `••••••`, reveals, sees figures; exactly one `VIEW` row | Agent-Probe (script below) | AC-1, AC-2, AC-3, AC-7, AC-9 — route + UI wiring, and that the audit contract is unchanged |
| Manual probe step 9b — MANAGER direct-POSTs `?/reveal` for a non-report | Agent-Probe (script below) | AC-12 — the guard holds against a real HTTP request, not just a mocked one |
| Manual probe step 7 — self-reveal writes **zero** rows | Agent-Probe (script below) | AC-8 — the #111 decision-#2 exemption survives |
| Mutation sweep M1–M6, M8, M9 | Fully-Automated (applied by hand, `pnpm test` per mutation) | AC-11, AC-12 — each mask and the new guard are load-bearing |
| `pnpm format:check` / `lint` / `check` / `test` | Fully-Automated | AC-10 — no orphaned import, no type break, no formatting drift |

Route and UI wiring is now proved by **T9 (automated)** as well as the probe — an upgrade over the
first draft, where it was probe-only. Nothing here is left as a Known-Gap: this change ships
zero Known-Gap gates.

**`project()` helper — NOT needed here, and this is a deliberate call.** That helper exists to stop a
vacuous assertion when a test claims a field is *absent from a query result*. This change asserts on
*values inside* the returned objects, and makes no projection change at all (fact 5). Emulating
Prisma's projection would add machinery no assertion depends on. If a future change ever narrows the
`include` at `:1272`, that is when to import the helper from
`tests/unit/audit-log-reveal.test.ts:70`.

## Mutation table

Every mutation is applied to the committed code, `pnpm test` is run, and the named row must go red.
A row that does not die is a row that was not earning its place.

| ID | Mutation | Row that MUST die | Trace |
|---|---|---|---|
| M1 | Delete the mask entirely — `changes.push({ label, from, to })` as it is today | **T1** | T1 asserts `from === MASKED_SALARY`; raw `'₱25,000.00'` fails, and the substring assertion fails independently. T5 also dies (`to`). T3/T4/T6/T7 survive — they never assert a mask value. |
| M2 | **The trap.** Move the mask inside `display()` (`if (field === 'basicMonthlySalary') return opts.unmask ? money.format(...) : MASKED_SALARY`) | **T3** | Under M2 both salary sides become `'••••••'`, `:1321` `continue`s, the salary change is dropped, and — since `rateType` was already equal and dropped — `changes.length === 0`, so `:1324` drops the event. T3's `events.length === 1` fails. **T3 is uniquely M2-sensitive:** under M1 (no mask at all) T3 passes, so it is not a duplicate of T1. **Collateral (VALIDATE correction): T1 AND T4 also die** — T1's event is gone, and T4's salary change is dropped so its `changes.length` is 1, not 2. The earlier draft named only T1. T3 is still the row that *names* the failure. |
| M3 | Invert the flag — `opts.unmask` → `!opts.unmask` | **T1** | The fail-OPEN direction: the default call returns cleartext. T1 dies first. T2 also dies (the reveal returns masked — a lockout, not a leak). **Keep both**: T1 catches the leak, T2 catches the lockout, and a fix that only satisfies one is wrong. T3 survives (structure unchanged). |
| M4 | Drop the `s !== '—'` guard, so `'—'` is masked too | **T5** | T5 asserts `from === '—'`; it becomes `'••••••'`. No other row has a null side, so T5 is the sole detector. T3 survives — its fixture has no null. |
| M5 | Drop the `field === 'basicMonthlySalary'` condition — mask every field | **T4** | T4's `Job title` becomes `'••••••'`. T6 dies too (all three of its labels). T1 survives, which is exactly why T4/T6 exist. **T3 survives:** its `rateType` pair is equal, so the equality check drops it *before* the mask is reached — masking every field cannot resurrect it. |
| M6 | Delete `if (from === to) continue` at `:1321` (the "fix the trap by removing the check" mistake) | **T7 and T3** | T7's no-op 25000 → 25000 write starts producing an event → `events.length === 0` fails. **T3 now dies too** (VALIDATE C-4): with the real `changeCompensation` fixture, `rateType` is equal on both sides, so removing the check makes it a second change → T3's `changes.length === 1` fails. The earlier draft claimed T7 was the *sole* detector; that was true only of the old, unrealistic T3 fixture. Two independent detectors is strictly better here — M6 is the mutation most likely to be reached for by someone "fixing" the trap. |
| M7 | In `?/reveal`, drop `{ unmask: true }` (return the masked history) | **T9** | **Upgraded from probe-only.** T9 asserts `getEmploymentHistory` was called with a third argument of `{ unmask: true }`; under M7 the call is `(id, org)` and the assertion fails. Probe step 5 remains as a second, end-to-end detector. No masking row dies — this mutation is invisible to T1–T7, which is why T9 had to exist. |
| M8 | **The asymmetric mask** (VALIDATE C-3) — `changes.push({ label, from: mask(from), to })`, masking the OLD figure and leaking the NEW one | **T1** | The most dangerous single-character-class slip in the change: the new salary is the more sensitive of the pair, and a reader glancing at `•••••• → ₱30,000.00` may well read it as intended behaviour. T1 dies on two independent assertions — `to === MASKED_SALARY` fails outright, and the substring check (`to` must not contain `'30'`) fails as well, so a future edit that weakens one assertion does not silently reopen this. T5 also dies (`to === MASKED_SALARY`). T3/T4/T6/T7 survive — none reads a mask value. The mirrored slip (`from` leaked, `to` masked) is caught by the same T1 assertions on `from` plus the `'25'` substring check. |
| M9 | **Delete the design-decision-3 guard** — remove `await assertCanTouchEmployee(locals.user!, params.id)` from the `reveal` action | **T8** | T8's mocked `assertCanTouchEmployee` throws 403, but with the call removed nothing invokes it: the action proceeds and resolves instead of rejecting, so `expect(...).rejects.toMatchObject({ status: 403 })` fails. **T8 is the sole detector** — T9's guard passes either way, so T9 survives; T1–T7 never touch the route. A weaker variant (moving the guard to *after* `revealEmployeeSensitive`) is also caught, because T8 additionally asserts `revealEmployeeSensitive` was **not called**. |

## Gates

Run in this order — CI runs Format check first, and each gate catches something the others do not:

```bash
pnpm format:check   # separate script; `pnpm lint` does NOT run it
pnpm lint           # the ONLY gate that catches an orphaned import (third recurrence on this repo)
pnpm check
pnpm test           # the unit script; there is no `test:unit`
```

Plus the mutation sweep **M1–M9** (each: `cp` the file to the scratchpad, apply the mutation,
`pnpm test`, confirm the named row red, restore from the copy) and the manual verification script
below.

**No e2e commit.** Justification, since the default position needs one: the entire behaviour change
is a pure function of `getEmploymentHistory`'s inputs and is fully pinned at the unit tier by
T1–T7, with the route wiring and the access guard pinned by T8/T9. The only thing e2e would add over
the manual probe is an end-to-end rendering check of three non-branching lines, bought at the cost of
a spec exposed to #287's
non-deterministic 120s `page.goto('/login')` timeouts and "N did not run" reporting, on a run whose
red result would say nothing. If this position is overridden, the required shape is one spec, run as
`E2E_PORT=<spare> pnpm test:e2e tests/e2e/salary-history-masking.spec.ts --workers=1`.

---

## Manual verification script

**Seeding prerequisite — read this first.** Every assertion below is vacuous against an empty table:
"no `VIEW` row for this employee" passes trivially if the employee has no audit rows at all, and
"the history panel masks salaries" passes trivially if the panel is empty. Steps 1–2 exist to make
the later steps mean something. Do not skip them and do not substitute an employee you have not
checked.

Setup: `pnpm dev` (uses `.env.dev`), app on `http://localhost:5173` (vite's default — `PORT=3000`
in `.env.dev` is not read by `vite dev`).

**DB target — corrected by VALIDATE (F-1).** CLAUDE.md's tech-stack line naming
`veent_wifiportal-db-1` / `root` / `local` is **stale**: that container has no `audit_logs` table at
all (`select to_regclass('public.audit_logs')` → NULL), so every query below would have errored. The
live target is the one `.env.dev` points at —
`postgresql://veent:veent@localhost:5434/veent_hris`, container `veent-db-5434`, whose postgres
listens on **5434 inside** the container (hence the `-p 5434`, matching `start.sh`).

In psql the table is snake_case (`audit_logs`, via `@@map`) but the **columns are camelCase and must
be double-quoted** — there is no per-column `@map` in the schema. `action` and `id` are lowercase and
need no quoting. Verified live by VALIDATE against this DB (1391 audit rows, 18 `Employee`/`VIEW`
rows, 4 employees carrying real `basicMonthlySalary` UPDATE logs), so the negative controls below can
genuinely fail.

```bash
psql() { docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434 -c "$1"; }
```

1. **Pick a target and confirm it is unseeded.** Log in as `hr@veent.ph` / `Hr@1234`, open an
   employee's 201 file, note the employee id from the URL as `<EMP>`. Then:

   ```sql
   SELECT count(*) FROM audit_logs
   WHERE "entityType" = 'Employee' AND "entityId" = '<EMP>' AND action = 'UPDATE';
   ```

2. **Seed at least one real salary change.** If step 1 returned 0, use the *Change Compensation*
   form on the 201 file to record a raise (this writes a genuine `UPDATE` log with
   `basicMonthlySalary` in `newValue`, which is exactly the shape the panel diffs). Re-run the count
   and confirm it is now ≥ 1. **Nothing below is meaningful until this passes.**

3. **Baseline the audit table** for the reveal assertions:

   ```sql
   SELECT count(*) FROM audit_logs
   WHERE "entityType" = 'Employee' AND "entityId" = '<EMP>' AND action = 'VIEW';
   ```

   Record this number as `N`.

4. **Before the reveal.** Reload the 201 file as `hr@veent.ph`. In the Employment History panel the
   `Basic salary:` row must read `•••••• → ••••••`. In the same view confirm all four of:
   the event date is visible, the `· effective …` date is visible if present, `by <actor email>` is
   visible, and the `Basic salary` label itself is visible. Any other label present in the same event
   (Job title, Department, Status…) must still be cleartext.

5. **Press Reveal.** Both panels must change in one submit: the current basic monthly salary shows
   its figure **and** the history `Basic salary` row shows real `₱` amounts. If the history stays
   masked, that is mutation M7 shipped — stop.

6. **Confirm exactly one audit row was written:**

   ```sql
   SELECT id, action, "actorId", "createdAt" FROM audit_logs
   WHERE "entityType" = 'Employee' AND "entityId" = '<EMP>' AND action = 'VIEW'
   ORDER BY "createdAt" DESC LIMIT 5;
   ```

   The count must now be exactly `N + 1`, not `N + 2`. Two rows means a second reveal path was
   introduced — the outcome design decision 1 rejects.

7. **Self-reveal writes nothing.** Log in as a user who *is* an employee and holds `MANAGE_HR`
   (`admin@veent.ph` / `Admin@1234`, or use `POST /api/v1/_dev/login-as` with
   `{"email":"…"}` — dev-only, 404s outside `dev`). Open **their own** 201 file, baseline the `VIEW`
   count for their own employee id, press Reveal, confirm the history unmasks, and confirm the count
   is **unchanged**. This is #111 decision #2 and it must survive.

8. **Manager positive control (cannot fail — that is the point).** Log in as `manager@veent.ph` /
   `Manager@1234` and open a **direct report's** 201 file. MANAGER holds `MANAGE_HR` (see the
   `why-manager-scope-bugs-recur` note), so the expected result is the *same* as HR — masked by
   default, revealable, audited. This step is a **lockout check**, not a security check: it proves
   design decision 3's guard did not break the allowed case. VALIDATE (C-2) correctly noted that as
   written it can never fail, so it no longer stands alone — step 9b is the one that can.

9. **Manager negative control — the step that can actually fail (VALIDATE C-2, and the acceptance
   test for design decision 3).**

   **Seeding prerequisite, and it is strict.** You need an employee `<OUT>` who is *all four* of:
   (a) in the same organization as `manager@veent.ph`; (b) **not** a report of that manager, primary
   or additional (`Employee.reportsToId` and the `EmployeeSupervisor` rows both clear); (c) **not**
   in any branch whose `Branch.managerId` is that manager's employee id; and (d) has at least one
   `basicMonthlySalary` UPDATE audit row, so the history panel is non-empty. Confirm (b), (c) and
   (d) before running anything — an employee who fails (b) or (c) makes the test vacuously pass by
   being *allowed*, and one who fails (d) makes the masking assertion vacuous by being empty.
   VALIDATE confirmed the dev DB holds 4 employees with real salary-change logs; pick from those,
   then verify the reporting line:

   ```sql
   SELECT e.id, e."reportsToId", e."branchId"
   FROM employees e WHERE e.id = '<OUT>';
   SELECT id, "managerId" FROM branches WHERE "managerId" = '<MANAGER_EMP_ID>';
   SELECT "employeeId", "supervisorId" FROM employee_supervisors WHERE "employeeId" = '<OUT>';
   ```

   (Table and column names verified against `prisma/schema.prisma`: `@@map("employees")`,
   `@@map("branches")`, `@@map("employee_supervisors")`; `reportsToId`, `branchId`, `managerId`,
   `employeeId`, `supervisorId` are all camelCase and need double quotes in psql.)

   **9a — the page.** As `manager@veent.ph`, open `/employees/<OUT>`. Expect **403** from `load`'s
   existing `assertCanTouchEmployee` at `:100`. This is today's behaviour and must not change.

   **9b — the direct POST, which is the actual bypass.** Still as `manager@veent.ph`, submit the
   form action directly, bypassing `load` entirely:

   ```bash
   curl -i -X POST 'http://localhost:5173/employees/<OUT>?/reveal' \
     -H 'x-sveltekit-action: true' \
     -H 'content-type: application/x-www-form-urlencoded' \
     -b 'auth_session=<MANAGER_SESSION_COOKIE>' --data ''
   ```

   - **Before commit 3**: expect a **200** carrying the sensitive payload — this is the pre-existing
     hole, and seeing it confirms the test is wired correctly and not silently failing for some other
     reason. Record the response.
   - **After commit 3**: expect **403** with `You can only manage your own team or a branch you
     manage.` Nothing sensitive in the body.

   Run 9b at **both** points. A 403 observed only after the fix, with no "before" reading, cannot
   distinguish a working guard from a broken request.

   **9c — no audit row on the refusal.** Re-run the `VIEW` count for `<OUT>`; it must be unchanged.
   The guard throws before `revealEmployeeSensitive` is reached, so a denied reveal must leave no
   trace of a successful read.

---

## Rollback

Revert commits 4, 2 and 1 together — `git revert <c4> <c2> <c1>` — and the masking behaviour is
restored exactly. No state written, no schema touched, no migration to reverse, no audit rows created
by the change itself.

**Commit 3 (the design-decision-3 access guard) should be kept, not reverted.** It is independent of
the masking work, it closes a hole that pre-exists #290, and reverting it reopens direct-POST access
to every employee's sensitive fields for any MANAGER. If #290 has to be backed out entirely, back out
1, 2 and 4 and leave 3 in place.

Partial reverts, and why each is a worse state than either endpoint:

- **Commit 2 alone reverted** (service un-masks, route still passes `{ unmask: true }`): harmless but
  pointless — the bug is fully reopened and the route carries a dead flag.
- **Commit 4 alone reverted** (service masks, route no longer unmasks): a **lockout**. The history
  panel masks salary and nothing can release it — HR loses read access it is entitled to. This is the
  more likely partial revert and the more damaging one; prefer reverting 1, 2 and 4 together.
- **Commit 3 alone reverted**: silently reopens the object-level hole while the widened payload
  (commit 4) is still live — the single worst state reachable from this plan. Never do this.
- **Commit 1 alone reverted**: deletes the only coverage this function has ever had while leaving the
  behaviour change in place. Never do this.

If a partial revert is unavoidable, record which inconsistent state was chosen and why.

## Implementation Checklist

1. [ ] `git switch -c fix/salary-history-masking-290` off an updated local `staging` (never
   `checkout -b origin/staging`). Confirm the tree is clean.
2. [ ] Create `tests/unit/employment-history-masking.test.ts` with rows T1–T7 (mock idiom from
   `tests/unit/employee-masking.test.ts:1-48`; mock the five db methods listed in Commit 1). Run
   `pnpm test` and **record the observed failure output** — T1 and T5 must fail; T2, T3, T4, T6, T7
   must pass (T2 passes at RED because vitest does not type-check — see Commit 1). Commit 1.
3. [ ] `src/lib/server/services/employees.ts:1260-1263`: add the third parameter
   `opts: { unmask?: boolean } = {}` to `getEmploymentHistory`.
4. [ ] `src/lib/server/services/employees.ts:1288`: add the comment above `display()` forbidding the
   mask from being moved inside it, citing the `:1321` equality check and the `:1324` event drop.
   Do **not** change `display()` itself.
5. [ ] `src/lib/server/services/employees.ts:1317-1323`: insert the `mask` helper between
   `if (from === to) continue` and `changes.push(...)`, exactly as written in Commit 2. Add
   `MASKED_SALARY` to the existing `$lib/utils/format` import at `employees.ts:11`, in place — a
   duplicate import line is caught by NO gate on this repo. Update the `:1257-1259` doc comment. Run `pnpm test`
   (all seven green) and `pnpm lint`. Commit 2.
6. [ ] **Record the "before" reading for probe step 9b now, while the hole is still open** — run the
   `curl` direct-POST as `manager@veent.ph` against a non-report `<OUT>` and confirm it returns 200
   with the payload. This reading is unobtainable after step 8 and without it the guard's proof is
   one-sided.
7. [ ] Create `tests/unit/employee-reveal-access.test.ts` with row **T8** (form-action idiom from
   `tests/unit/audit-log-reveal.test.ts:37`; mocks listed in Commit 3). Run `pnpm test` and confirm
   T8 is RED. If the route module's import graph will not load, add leaf mocks until it does — do
   **not** downgrade the test to asserting on `canTouchEmployee` directly, and stop and report if it
   proves unbuildable.
8. [ ] `src/routes/(app)/employees/[id]/+page.server.ts`: add
   `await assertCanTouchEmployee(locals.user!, params.id)` as the first statement of the `reveal`
   action body, right after `requireAnyCapability(...)` at `:533`, plus the #228/#290 comment. The
   helper is already imported at `:4` — **add no import**. Run the full gate order. Commit 3.
9. [ ] `src/routes/(app)/employees/[id]/+page.server.ts:531-548`: in the `reveal` action, fetch
   `getEmploymentHistory(params.id, locals.user!.organizationId, { unmask: true })` and return
   `{ revealed, history }`. Add the comment recording that no second audit write is made. Leave the
   `load` at `:141` untouched.
10. [ ] `src/routes/(app)/employees/[id]/+page.svelte`: add
    `const history = $derived(form?.history ?? data.history)` near `:39`; change `:1682` and `:1684`
    from `data.history` to `history`. Add row **T9** to `tests/unit/employee-reveal-access.test.ts`.
    Run the full gate order (`format:check` → `lint` → `check` → `test`). Commit 4.
11. [ ] Run the mutation sweep **M1–M9**. For each: copy the file to the scratchpad first (`cp` —
    **never** `git checkout <file>` to restore, it silently reverts uncommitted work), apply the
    mutation, `pnpm test`, confirm the named row is red, restore from the copy. Record every result,
    including which rows died as collateral (M2 should take T1, T3 and T4; M6 should take T7 and T3).
12. [ ] Run the manual verification script end to end, including the seeding prerequisites in steps
    1–2 and step 9. Fill in the observed before/after values, the `VIEW` counts, and both the
    before-fix and after-fix readings for step 9b.
13. [ ] Push, open a PR against `staging` with the mutation sweep and probe results in the body.
    Flag design decision 3 explicitly in the PR description — a reviewer must not discover a
    security guard by reading the diff. Close #290 by hand after merge — issues never auto-close on
    this repo.

## Phase Completion Rules

This is a single-phase SIMPLE plan; each commit is its own gate.

- A commit is **CODE DONE** when its edits are in place and `pnpm test` passes.
- A commit is **VERIFIED** only when the full CI order passes in sequence
  (`format:check` → `lint` → `check` → `test`). `lint` is not optional — it is the only gate that
  catches an orphaned import from checklist step 5, and both `test` and `check` stay green through
  one. (A *duplicate* import is caught by no gate at all — VALIDATE C-5.)
- **Commit 3 must land before commit 4.** A history built in the other order ships a payload
  widening ahead of the guard that protects it, even if the final tree is identical. If the commits
  are reordered or squashed together, the plan is not COMPLETE.
- The plan is **COMPLETE** only when every AC-1…AC-13 row has a green proving gate, the **M1–M9**
  mutation sweep has been run and recorded with the row that died under each, and the manual script
  has been run against a **seeded** employee with its `VIEW` counts filled in and both the
  before-fix and after-fix readings for step 9b recorded.
- No step may be marked done on a passing suite alone if its proving gate is the mutation sweep or
  the manual probe. AC-7, AC-8 and AC-9 have **no** automated gate — they are probe-only by design,
  and an unrun probe leaves the plan incomplete regardless of a green suite. AC-12 has both (T8 and
  probe step 9b) and needs both: T8 proves the action calls the guard, step 9b proves it holds
  against a real HTTP request.
- Testing context: `process/context/all-context.md` and `process/context/tests/all-tests.md` do not
  exist in this repo (`vc-setup` was deliberately never run). The test routing used here is the
  repo's own `vitest.config.ts` (`tests/unit/**`) and `playwright.config` (`tests/e2e/**`, not used
  by this plan). Post-phase testing is the gate order above plus the mutation sweep and manual probe.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Mask applied inside `display()` during execution "for tidiness", silently deleting compensation events | **High** — it is the obvious place | The step-2 comment forbidding it, test T3, and mutation M2. This is the one thing a reviewer must check. |
| A future narrowing of the `:1272` `include` reintroduces a projection leak | Low | Fact 5 records *why* the bare `include` is safe today (no `...log` spread). If a spread is ever added, the `project()` helper becomes mandatory. |
| The mask is typed `string` on both sides, so TypeScript cannot protect the contract | Certain (structural) | Accepted; the mutation table is the compensating control. Widening `EmploymentHistoryChange` to a masked type is a larger refactor and out of scope. |
| Orphaned import after editing the `format` import line | Medium | `pnpm lint` — and only `pnpm lint`. `pnpm test` and `pnpm check` both stay green through it. |
| **Duplicate** import line added instead of editing `:11` in place | Medium | **No gate catches this** (VALIDATE C-5: `no-duplicate-imports` is not configured). Edit `employees.ts:11` in place; confirm by eye that only one `$lib/utils/format` import exists. |
| Manual verification run against an employee with no salary history, proving nothing | Medium | Steps 1–2 are gating and explicitly say so. |
| Probe step 9 run against an employee who is secretly a report or in a managed branch — the guard test passes vacuously by being *allowed* | **High** — reporting lines are not visible from the UI | Step 9's four-part seeding prerequisite, with the three SQL checks that must be run *before* the request. |
| Commits 3 and 4 squashed or reordered, so the payload widening lands before the guard | Medium — they touch the same file and squashing feels tidy | Phase Completion Rules make the order a completion condition; the commit-sequence section says do not merge them. |
| `tests/unit/employee-reveal-access.test.ts` cannot import the route module (large import graph) | Medium — no precedent for *this* module | Named as a buildability risk in Commit 3 with an explicit instruction: add leaf mocks, never downgrade the assertion, stop and report if genuinely unbuildable. |
| Design decision 3 read as scope creep by a reviewer | Medium | Its own commit, its own rationale section stating the hole pre-exists #290 and is folded in only because commit 4 widens its payload; PR description must flag it (checklist step 13). |
| GitHub issue not auto-closed on merge | High (recurring on this repo) | Close #290 by hand after merge. |

## Out of scope (explicit)

- **#285 / auditing reads or page loads.** Closed not-planned. Do not reopen.
- **Option 2** (unmasking the current figure) and **Option 3** (documenting the split). Rejected.
- Changing the `include` at `employees.ts:1272`, or any projection anywhere — fact 5 proves it is
  benign; a speculative "fix" is exactly the out-of-scope work CLAUDE.md §5 forbids.
- Any RBAC change. `canManage` / `canReveal` / `MANAGE_HR` / `ADMINISTER_HR_ORGWIDE` and the whole
  of `src/lib/rbac.ts` are untouched; whether MANAGER *should* reach this panel is a separate, older
  question (#133 lineage) and is not #290. Design decision 3 **calls** the existing enforcement point
  `assertCanTouchEmployee`; it does not add, remove or redefine a capability.
- Auditing the object-level *refusals* added by design decision 3. A denied reveal writes no audit
  row and none is being added — that would be read-auditing by another name (#285, closed).
- Sweeping the other form actions on this route (and elsewhere) for the same missing
  `assertCanTouchEmployee`. Design decision 3 fixes the **one** action whose payload this plan
  widens. A systematic audit of form-action object-level checks is real work and deserves its own
  issue — record it, do not start it here.
- The propose→confirm compensation flow (`src/lib/server/services/action-proposals.ts:175`), which
  has its own reveal-shaped path. Not a #290 surface; note only.
- Masking salary in payroll exports, payslips, reports, or the audit-log page. Different surfaces,
  different issues.
- e2e coverage — argued above.
- Any `prisma db push`, migration, or schema edit.

## Test Infra Improvement Notes

- `getEmploymentHistory` had **zero** test coverage before this change (fact 8) despite being the
  read path for the entire employment timeline. This plan adds the first file; the coverage it adds
  is scoped to masking only. The remaining untested behaviour of that function — FK resolution to
  names, `(removed)` / `Default schedule` fallbacks, `HIRED` event shaping, `effectiveDate`
  passthrough — is a real gap worth a follow-up test file, but is not a #290 change and must not be
  smuggled into these commits.
- **`CLAUDE.md`'s tech-stack line names the wrong database.** It states the Docker container is
  `veent_wifiportal-db-1` with `root`/`mysecretpassword` and db `local`. VALIDATE established live
  that this container has **no `audit_logs` table** (`to_regclass` → NULL), so every query in the
  first draft of this plan's probe would have errored. The live target per `.env.dev` is container
  `veent-db-5434`, user `veent`, db `veent_hris`, internal port 5434. This stale line is what
  misled the probe. **Not fixed here** — editing `CLAUDE.md` is outside this plan's blast radius and
  deserves a deliberate change; recorded so it gets corrected on purpose rather than as a drive-by.
- **No precedent existed for unit-testing a form action on the 201 route.** `tests/unit/audit-log-reveal.test.ts:37`
  proves the `const { load, actions } = await import('…/+page.server')` idiom works for a route with
  a modest import graph. If `tests/unit/employee-reveal-access.test.ts` needs a pile of leaf mocks to
  load `(app)/employees/[id]/+page.server`, that mock scaffold is reusable and worth extracting to a
  shared helper — note what was needed, and propose the helper as follow-up rather than building it
  inside these commits.

## Resume and Execution Handoff

1. **Selected plan file**: `process/general-plans/active/salary-history-masking-290_PLAN_10-08-26.md`
2. **Last completed step**: none executed. PLAN written; VALIDATE run (CONDITIONAL, 0 FAILs);
   VALIDATE's own factual corrections applied by VALIDATE; all four open concerns (C-1..C-4) resolved
   by user decision and applied to this file. No branch cut. Tree clean at `5641987` on `staging`.
3. **Validate-contract status**: written — see `## Validate Contract` below. Gate CONDITIONAL; the
   conditions are now discharged in the plan body:
   - **C-1** → fixed, as new **commit 3** (design decision 3, the `assertCanTouchEmployee` guard)
   - **C-2** → probe step 8 split into 8 (positive/lockout control) and 9 (the negative control that
     can actually fail), with a four-part seeding prerequisite
   - **C-3** → mutation **M8** added (asymmetric mask), plus **M9** for the new guard
   - **C-4** → T3's fixture upgraded to the real `changeCompensation` payload; the trap section's
     reasoning corrected; mutation claim (b) now reads "T7 and T3"
4. **Supporting context loaded**: `src/lib/server/services/employees.ts` (`:108-131`, `:307-340`,
   `:806-812`, `:1242-1338`), `src/routes/(app)/employees/[id]/+page.server.ts` (`:1-45`, `:87-175`,
   `:531-548`), `src/routes/(app)/employees/[id]/+page.svelte` (`:39`, `:1673-1725`),
   `src/lib/server/services/employee-access.ts` (`canTouchEmployee` / `assertCanTouchEmployee`),
   `src/lib/rbac.ts:50-70`, `src/lib/utils/format.ts`, `src/hooks.ts`, `prisma/schema.prisma`
   (`model AuditLog`, `model EmployeeSupervisor`, `model Branch`, `@@map` names),
   `tests/unit/employee-masking.test.ts`, `tests/unit/audit-log-reveal.test.ts` (form-action idiom at
   `:37`; `project()` idiom deliberately not used), `tests/unit/employee-access.test.ts`,
   `tests/unit/offboard-self-guard.test.ts`, `tests/e2e/helpers.ts` (`USERS`),
   `src/routes/api/v1/_dev/login-as/+server.ts`.
5. **Next step for a fresh agent**: EXECUTE. Read `## Validate Contract` (including the
   Execute-agent instructions table E1–E6) and the *Commit sequence* section in full, then start at
   Implementation Checklist step 1 (cut the branch). Three things a fresh agent will get wrong
   without reading first: **(a)** commit 1's RED set is T1 and T5 only — T2 passing is correct,
   vitest does not type-check; **(b)** commit 3 must land before commit 4, never squashed; **(c)**
   probe step 9b's "before" reading must be taken at checklist step 6, while the hole is still open,
   because it is unobtainable afterwards. Commit messages carry **no** `Co-Authored-By` and no
   attribution footer of any kind.

## Validate Contract

Status: CONDITIONAL
Date: 10-08-26
date: 2026-08-10
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 7-signal score 2/7 (S2 auth/permission surface, S6 high-risk class = permission/trust-boundary). Blast radius is 3 files + 1 test file in a single package, so S1/S3/S4/S5/S7 are all absent. The MEDIUM threshold would nominate parallel subagents, but the acting validate-agent had no Agent tool available in this session, so the two-layer fan-out (4 Layer-1 dimensions + 5 Layer-2 sections) was executed sequentially in one context. Every finding below is backed by a live read or a live command, not by inference.

### Test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1 | Past `Basic salary` renders `••••••` by default | Fully-Automated | `pnpm test` — T1 in `tests/unit/employment-history-masking.test.ts` | B |
| AC-2 | `{ unmask: true }` returns real `₱` figures | Fully-Automated | `pnpm test` — T2 | B |
| AC-3 | A salary-only change still yields an event with date + actor | Fully-Automated | `pnpm test` — T3 | B |
| AC-4 | Non-salary labels render exactly as today | Fully-Automated | `pnpm test` — T4, T6 | B |
| AC-5 | `null → value` renders `— → ••••••` | Fully-Automated | `pnpm test` — T5 | B |
| AC-6 | A no-op salary write yields no event | Fully-Automated | `pnpm test` — T7 | B |
| AC-7 | One `VIEW` audit row per reveal, not two | Agent-Probe | Manual script step 6 (`psql` count is exactly `N + 1`) | B |
| AC-8 | Self-reveal writes zero audit rows | Agent-Probe | Manual script step 7 | B |
| AC-9 | Page load writes no audit row (#285 stays closed) | Agent-Probe | Manual script steps 3–4 (count unchanged before Reveal) | B |
| AC-10 | Existing call site compiles unchanged; no other caller | Fully-Automated | `pnpm check` exits 0; `grep -rn getEmploymentHistory src/ tests/` returns exactly 3 hits | A |
| AC-11 | Every mask dies under its named mutation | Hybrid | Mutation sweep M1–M6: apply by hand, `pnpm test`, confirm the named row red, restore from a scratchpad `cp`. Precondition: working tree clean and file backed up before each mutation. | B |
| AC-11 (residual) | The asymmetric mask (`from` masked, `to` not) is load-bearing | Fully-Automated | T1 detects it (asserts BOTH sides + the `'25'`/`'30'` substring check), but no mutation row isolates it — see CONCERN C-3 | D |
| M7 residual | `?/reveal` actually passes `{ unmask: true }` | Agent-Probe | Manual script step 5 — both panels change in one submit | B |
| gate order | No format drift, no orphaned import, no type break, suite green | Fully-Automated | `pnpm format:check` → `pnpm lint` → `pnpm check` → `pnpm test`, in that order, each exiting 0 | A |

gap-resolution legend: A — proven now. B — gate added by this plan's checklist. C — deferred to a named later phase. D — backlog test-building stub (named residual; continue).

Failing stub (T1):
```
test("should mask both sides of a salary change on a default call", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: default call, salary 25000 → 30000, from and to both MASKED_SALARY, neither containing '25' or '30'")
})
```

Failing stub (T2):
```
test("should return real money strings when called with { unmask: true }", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: same log with { unmask: true } yields ₱25,000.00 → ₱30,000.00")
})
```

Failing stub (T3):
```
test("should still emit the event when salary is the only changed field", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: events.length === 1, changes.length === 1, label 'Basic salary', date and actorEmail present")
})
```

Failing stub (T4):
```
test("should mask salary while leaving job title cleartext in the same log", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: two changes; Job title 'Cashier' → 'Supervisor'; Basic salary masked")
})
```

Failing stub (T5):
```
test("should leave the em-dash placeholder unmasked on a first-ever salary", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: null → 25000 renders from === '—', to === MASKED_SALARY")
})
```

Failing stub (T6):
```
test("should leave department, employment type and rate basis cleartext", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: 'Operations', 'PART TIME', 'Hourly rate' all render exactly as today")
})
```

Failing stub (T7):
```
test("should produce no event for a no-op salary write", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: 25000 → 25000 default call yields events.length === 0")
})
```

Legacy line form (retained so existing validate-contract consumers still parse):
- Service masking (`getEmploymentHistory`): Fully-automated: `pnpm test`
- Mutation load-bearing-ness (M1–M6): hybrid: apply mutation by hand + `pnpm test` — precondition: file backed up to scratchpad via `cp`, never restored with `git checkout`
- Route + UI wiring, audit-row count, self-reveal exemption (M7, AC-7/8/9): agent-probe: the corrected manual verification script against `veent-db-5434`
- Gate order: Fully-automated: `pnpm format:check` → `pnpm lint` → `pnpm check` → `pnpm test`

### Dimension findings

- Infra fit: **CONCERN** — the plan's code, imports, line numbers and gate order all check out against the live tree, but the manual script pointed at the wrong Postgres container (F-1, corrected in place: `veent_wifiportal-db-1`/`root`/`local` has no `audit_logs` table; the live target per `.env.dev` is `veent-db-5434`/`veent`/`veent_hris` on internal port 5434).
- Test coverage: **CONCERN** — T1–T7 are buildable exactly as specified (mock surface verified complete at five db methods; the `vi.hoisted` idiom is proven on this exact module by `tests/unit/employee-masking.test.ts:23`), but the commit-1 expected-RED set was wrong (F-2, corrected: T2 passes at RED because `vitest run` does not type-check) and the mutation table is missing the asymmetric-mask row (C-3).
- Breaking changes: **PASS** — `getEmploymentHistory` has exactly one caller (`+page.server.ts:141`), the third parameter is additive and defaulted, and the twin-door sweep found no second reader: the only three `auditLog.findMany` sites repo-wide are this function, `dashboard.ts:304` (explicit `select`, no payload columns) and `reports/audit-log/+page.server.ts` (payload nulled for everyone, per-entry audited reveal, #242). No API, PDF, export or report path reaches historical salary.
- Security surface: **CONCERN** — the change itself leaks nothing new and fact 5 is independently confirmed (no `...log` spread anywhere in the function; `ipAddress`/`userAgent`/raw payloads never cross to the client, so forbidding a speculative projection fix is correct). But commit 3a widens the payload of an action that has no object-level access check (C-1).
- Section A (Verified findings F1–F9): **PASS** — every claim re-verified against the live tree; three off-by-one line citations corrected in place.
- Section B (Commit 1 — the seven tests): **CONCERN** — buildable, but the RED expectation was wrong (F-2) and T3's fixture does not match the real `changeCompensation` payload shape (C-4).
- Section C (Commit 2 — the service change): **PASS** — the code block compiles and behaves; `field` and `opts` close correctly, `HISTORY_FIELDS`/`HISTORY_LABELS` match every assertion, and the import target line is confirmed. The duplicate-import lint claim was wrong and is corrected (C-5).
- Section D (Commit 3 — route + UI): **CONCERN** — `form?.history` is legal, there is no name collision, and nothing else in the 1755-line component reads `data.history`; the concern is C-1, not the wiring.
- Section E (Manual verification script): **CONCERN** — SQL bodies and column quoting verified correct live; the connection was wrong (F-1, fixed) and the MANAGER negative control cannot fail as written (C-2).

**Totals: 0 FAILs / 5 CONCERNs / 4 PASSes → Net Gate: CONDITIONAL**

### Mutation-trace verdicts (the three checkable claims)

- **(a) "T3 is uniquely M2-sensitive — it PASSES under M1" — HOLDS.** T3 asserts only structure (`events.length === 1`, `changes.length === 1`, `label === 'Basic salary'`, date and actorEmail present) and never reads a mask value, so deleting the mask entirely leaves it green. Under M2 both formatted sides collapse to `'••••••'`, `:1321` continues, `changes.length === 0`, and `:1324` drops the event. Completeness note: **T4 also dies under M2** (its salary change is dropped, so `changes.length` is 1 not 2); the plan names only T1 as collateral.
- **(b) "T7 is the sole detector of M6" — HOLDS as the fixtures are specified.** No other row has an equal-valued pair. Conditional on C-4: if T3's fixture is upgraded to the real `changeCompensation` shape (rateType equal on both sides), T3 dies under M6 too and the wording must become "T7 and T3".
- **(c) "T5 is the sole detector of M4" — HOLDS.** Only T5 has a null side; dropping the `s !== '—'` guard turns its `from` into `'••••••'` and fails `from === '—'`. Every other row is untouched.
- Also spot-checked and correct: M1 (T1 and T5 die; T2/T3/T4/T6/T7 survive — the plan's "T5 also dies" is right), M3 (T1 catches the leak, T2 catches the lockout, both needed), M5 (T4 and T6 die, T1 survives — exactly why T4/T6 exist), M7 (no unit row dies; correctly routed to the probe).

### Findings

| # | Finding | Severity | Resolution |
|---|---|---|---|
| F-1 | Manual script connected to the wrong Postgres. `veent_wifiportal-db-1`/`root`/`local` has **no `audit_logs` table** (`to_regclass` → NULL), so every query would have errored. Live target per `.env.dev` is `veent-db-5434`/`veent`/`veent_hris`, internal port 5434. The probe is the SOLE gate for AC-7/8/9 and M7, so as written those four were unprovable. | CONCERN (was blocking) | **FIXED IN PLAN** by VALIDATE — helper corrected and verified live (1391 audit rows, 18 `Employee`/`VIEW` rows, 4 employees with real salary-change logs). |
| F-2 | Commit-1 expected-RED set was wrong: **T2 passes at RED.** `pnpm test` is `vitest run` with no `test.typecheck`, so esbuild strips types and the not-yet-existing third argument is ignored; the function returns cleartext, which is what T2 asserts. Correct set: T1 and T5 fail; T2/T3/T4/T6/T7 pass. | CONCERN (was blocking) | **FIXED IN PLAN** by VALIDATE — Commit 1 section and checklist step 2 both corrected, with the reason recorded so nobody contorts T2 to force a red. |
| C-1 | `?/reveal` (`+page.server.ts:531`) gates on `requireAnyCapability(…, 'MANAGE_HR')` only. `MANAGE_HR` includes `MANAGER` (`src/lib/rbac.ts:55`) and `revealEmployeeSensitive` scopes by org alone (`:313-314`) — **no `assertCanTouchEmployee`**, which `load` does call (`:100`). A SvelteKit form action runs independently of `load`, so an `x-sveltekit-action` POST returns the payload directly. `src/lib/rbac.ts:59-63` states the violated rule verbatim. The hole **pre-exists #290**, but commit 3a widens its payload from "current sensitive fields" to "current sensitive fields **plus the entire historical salary trail**". | CONCERN | **USER DECISION REQUIRED.** (a) add one line — `await assertCanTouchEmployee(locals.user!, params.id)` at the top of the reveal action; the helper is already imported at `:4`; or (b) name it as an accepted, documented residual in Out of scope. Not applied by VALIDATE — structural, and the `scope-discipline-no-bug-hunting` ruling makes it the user's call. |
| C-2 | Probe step 8's "MANAGER negative control" **cannot fail** — it opens a *direct report's* 201 file, the allowed case. Given C-1 the meaningful control is a MANAGER opening a **non-report's** file. | CONCERN | Add step 8b: as `manager@veent.ph`, open a non-report's 201 file (expect 403 from `load`) and then POST `?/reveal` for that id. Record what comes back. This is the assertion that can actually fail. |
| C-3 | The change introduces **two** masks (`from` and `to`) but no mutation row isolates them, so AC-11 ("every mask dies under its named mutation") is not fully discharged. The asymmetric mutation — `changes.push({ label, from: mask(from), to })` — leaks the NEW salary, the most sensitive figure. | CONCERN | Add **M8** (asymmetric mask, row that must die: T1). Coverage already exists — T1 asserts both sides plus the substring check — so this is table completeness, ~2 minutes. |
| C-4 | F6's stated reason is imprecise. `recordCompensationChange` (`employees.ts:806-812`) writes `oldValue: { basicMonthlySalary, rateType }` and `newValue: { basicMonthlySalary, rateType, effectiveDate }` — **not salary alone**. The conclusion still holds (rateType is equal on both sides, so the equality check drops it, leaving one change) but for a different reason than stated. | CONCERN | Recommend T3's fixture use the **real** shape (both fields present, rateType equal, `effectiveDate` in `newValue`). It still pins the trap and additionally pins that `effectiveDate` passthrough survives masking. Adopting this changes claim (b) to "T7 and T3 detect M6". |
| C-5 | "a duplicate import fails `pnpm lint`" is **false**. `eslint.config.js` configures `js.configs.recommended` + `ts.configs.recommended` + `prettier`; neither `no-duplicate-imports` nor `import/no-duplicates` is present. A second `import { MASKED_SALARY } from '$lib/utils/format'` passes all four gates silently. The *orphaned*-import half of the claim is true (`@typescript-eslint/no-unused-vars` is `error`). | CONCERN | **FIXED IN PLAN** by VALIDATE — checklist step 5 and Commit 2 step 4 now name `employees.ts:11` explicitly (`import { maskEmployee, SENSITIVE_FIELDS } from '$lib/utils/format'`) and say to edit it in place; Risks table split into two rows. |
| N-1..N-4 | Off-by-one citations: `MASKED_SALARY` is `format.ts:45` (comment `:44`), not `:44`/`:43-44`; the bare `include` is `employees.ts:1272` (`:1271` is `orderBy`); the four FK lookups are `:1277-1280`. Plan also says "only T4/T6 need a department row" — T4 (salary + jobTitle) does not. | CONCERN (cosmetic) | **FIXED IN PLAN** by VALIDATE (T4/T6 note left as-is — harmless). |

### Verified-correct (independent re-check, plan is right)

- **Fact 1 — exactly one caller, no twin door.** `getEmploymentHistory` appears at `employees.ts:1260` (def), `+page.server.ts:10` (import) and `:141` (call), and nowhere else in `src/` or `tests/`. Repo-wide there are only three `auditLog.findMany` readers and the other two are already closed by #242.
- **Fact 2** — `rbac.ts:55`, `+page.server.ts:90`/`:169`, action `:532`/`:544`. Confirmed identical capability; design decision 1's decisive argument stands.
- **Fact 3** — `+page.svelte:1703-1712` renders `{c.from} → {c.to}` opaquely, keyed by `c.label`. No field-aware UI logic needed.
- **Fact 5 — independently re-verified, plan is right to forbid a projection fix.** The bare `include` does return every `AuditLog` scalar server-side, but `:1305-1311` and `:1328-1335` build each event field-by-field and there is **no `...log` spread anywhere in the function**. `ipAddress`, `userAgent` and the raw payloads never cross to the client. Structurally unlike the dashboard and audit-log-list leaks. `project()` is correctly judged unnecessary (this test asserts on values, not absence).
- **Fact 7** — `oldValue`/`newValue` are `Json?` (`schema.prisma:1365-1366`). No Decimal, `src/hooks.ts` untouched.
- **Fact 8** — `tests/unit/employment.test.ts` imports `src/lib/utils/employment`. Unrelated. `getEmploymentHistory` genuinely has zero coverage.
- **Test buildability** — the mock surface is exactly complete: `auditLog.findMany` (`:1264`) plus `department`/`position`/`workSchedule`/`branch.findMany` (`:1277-1280`), and nothing else. The `vi.hoisted` + `vi.mock('$lib/server/db')` + top-level-import idiom is **proven on this exact module** — `employee-masking.test.ts:23` already top-level-imports from `../../src/lib/server/services/employees`, so its heavy import graph loads fine under vitest. Not mocking `$lib/server/audit` is safe: `audit.ts` has no top-level side effects. `money.format(25000)` returns exactly `₱25,000.00` on this machine (full ICU verified), so T2/T6's exact-string assertions hold.
- **Commit-2 code block** — compiles and behaves. `field` is a per-iteration `const` from `for…of` and `opts` a function parameter, so both close correctly; `field === 'basicMonthlySalary'` narrows fine against the `as const` tuple; eslint has no `no-loop-func`. `HISTORY_FIELDS` contains `basicMonthlySalary` (`:112`) and `HISTORY_LABELS.basicMonthlySalary === 'Basic salary'` (`:124`), matching every test assertion.
- **Commit-3 Svelte wiring** — `form` exists as `ActionData` (`:20`). `form?.history` is legal: SvelteKit's `AwaitedActions` union adds `?: never` for keys absent from a branch, the same mechanism that makes the existing `form?.revealed` (`:39`) and `form?.action` (`:1438`) compile. **No name collision** — `history` appears nowhere else in the 1755-line component; shadowing the `window.history` global in module scope is inert since the global is never used. **No other consumer of `data.history`**, so nothing can diverge from the revealed copy. Lines `:1682`/`:1684` exact. The reveal form already uses `use:enhance` with the shared submit guard, so `form` is populated the same way `revealed` is today.
- **Gate order** — `format:check`, `lint`, `check`, `test` all exist as separate scripts; `lint` is `eslint .` and does not run prettier; there is no `test:unit`.
- **psql column quoting** — verified live: `"entityType"`, `"entityId"`, `"createdAt"`, `"actorId"` are camelCase and need quotes; `action` and `id` are lowercase and do not. Every SQL body in the plan executes correctly once pointed at the right DB.
- **Negative controls can genuinely fail** — the target DB holds 1391 audit rows, 18 `Employee`/`VIEW` rows and 4 employees with real `basicMonthlySalary` UPDATE logs (one with 5). The seeding prerequisite is live and meaningful, not theatre.
- **`_dev/login-as`** exists, is POST, takes `{email}`, and 404s outside `dev` — exactly as described. Seeded credentials match `tests/e2e/helpers.ts:3-18`.
- **Commit messages** carry no `Co-Authored-By` and no attribution footer; `:599-600` explicitly forbids them.
- **Zero Known-Gap gates** — the route/UI wiring is genuinely covered by the Agent-Probe row, as the plan claims.

### Execute-agent instructions

| # | Instruction | Trigger |
|---|---|---|
| E1 | Commit 1 RED expectation is **T1 and T5 fail, T2/T3/T4/T6/T7 pass**. T2 passing at RED is correct and expected — vitest does not type-check. Do NOT modify T2 to force it red. | Checklist step 2 |
| E2 | Add `MASKED_SALARY` by editing `employees.ts:11` **in place**. No gate on this repo catches a duplicate import line — verify by eye that exactly one `$lib/utils/format` import exists. | Checklist step 5 |
| E3 | Manual script: use `docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434`. If a query returns "relation audit_logs does not exist", you are on the wrong container — stop, do not record the result as a pass. | Checklist step 9 |
| E4 | Before each mutation, `cp` the file to the scratchpad. **Never** `git checkout <file>` to restore — it silently reverts uncommitted work. | Checklist step 8 |
| E5 | Do not move the mask inside `display()` "for tidiness" under any circumstance. Write the forbidding comment first (checklist step 4), before writing the mask. | Checklist step 4 |
| E6 | **SUPERSEDED — C-1 was accepted; the guard IS in scope.** Add `await assertCanTouchEmployee(locals.user!, params.id)` as the first statement of the `reveal` action body, as its **own commit 3**, before commit 4 widens the payload. The helper is already imported at `+page.server.ts:4`. Do not squash commits 3 and 4. Flag the guard in the PR description. | Checklist steps 6–8 |
| E7 | Take probe step 9b's **before-fix** `curl` reading at checklist step 6, while the hole is still open. It is unobtainable once commit 3 lands, and without it a 403 cannot be distinguished from a malformed request. | Checklist step 6 |
| E8 | Probe step 9 is vacuous unless `<OUT>` is verified **not** a report and **not** in a managed branch, and has real salary-change audit rows. Run the three SQL checks first. | Checklist step 12 |

Open gaps: **NONE — all four resolved by user decision on 10-08-26 and applied to the plan body.**
The findings above are retained as the VALIDATE record; the resolutions are authoritative.

| Was | Resolution applied to the plan |
|---|---|
| C-1 — `?/reveal` object-level access check | **FIXED, not accepted as residual.** New **commit 3** adds `await assertCanTouchEmployee(locals.user!, params.id)`, landing *before* commit 4 widens the payload. Rationale, self-reveal reconciliation and the "why this is in scope" statement are in *Design decision 3*. New gates: T8, mutation M9, probe step 9b. New criterion AC-12. |
| C-2 — probe step 8 cannot fail | **FIXED.** Old step 8 is retained but relabelled a *positive/lockout* control; new **step 9** is the negative control (MANAGER vs a non-report), with a four-part seeding prerequisite and before/after `curl` readings at step 9b. |
| C-3 — no mutation isolates the asymmetric mask | **FIXED.** **M8** added (`from` masked, `to` leaked — the more sensitive figure); dies on T1 via two independent assertions. **M9** added for the new guard. AC-11 now fully discharged. |
| C-4 — T3's fixture is not the real payload | **FIXED.** T3 now uses `{ basicMonthlySalary, rateType }` → `{ basicMonthlySalary, rateType, effectiveDate }`. F6 and the trap section's reasoning corrected (`rateType` is equal on both sides, so the equality check drops it). Mutation claim (b) now reads **"T7 and T3"**; M2's collateral now correctly lists **T1, T3 and T4**; M5's non-collateral on T3 traced and recorded. |

Superseded by the above (do not act on the older wording): the C-1 row's "user decision required",
the E6 instruction's "do not add it unasked", and the goal block's C-1 hard stop.

What this coverage does NOT prove:
- `pnpm test` (T1–T7) proves the masking logic as a pure function of `getEmploymentHistory`'s inputs. It does **not** prove: that `?/reveal` passes `{ unmask: true }` (M7 — probe step 5 only); that the Svelte template actually reads the `$derived` `history` at both `:1682` and `:1684` (a half-applied edit renders masked after reveal — probe step 5 only); that exactly one audit row is written (AC-7 — probe step 6 only); that the self-reveal exemption survives (AC-8 — probe step 7 only); that page load writes no audit row (AC-9 — probe steps 3–4 only); or that the Prisma projection is safe (the mock returns the fixture verbatim, so no projection regression is detectable at the unit tier — this is deliberate, per fact 5).
- The mutation sweep **M1–M9** proves each named mask branch, the `from`/`to` symmetry (M8, added for C-3) and the new access guard (M9) are load-bearing. It does **not** prove the Svelte template renders the revealed copy — that is probe step 5 only.
- `pnpm check` proves the existing call site compiles. It does **not** protect the contract semantically — `from`/`to` are `string` on both sides of the change, so no type error can catch a masking regression. The mutation table is the only compensating control.
- `pnpm lint` catches an orphaned import. It does **not** catch a duplicate import (C-5).
- The manual probe proves behavior for `hr@veent.ph` and `manager@veent.ph` on seeded employees in the dev DB. It does **not** prove behavior for other roles, other orgs, employees with no history, or production data volumes. The C-1 bypass path **is** now exercised, by step 9b, at both the before-fix and after-fix points.

Gate: CONDITIONAL (5 concerns; F-1, F-2, C-5 and N-1..N-4 corrected in the plan by VALIDATE; C-1, C-2, C-3, C-4 recorded as open and routed to the user)
Accepted by: pending user acceptance — C-1 (reveal-action access check) requires an explicit decision before EXECUTE; C-2, C-3, C-4 are cheap plan edits the user may accept, apply, or waive.

## Autonomous Goal Block

```
SESSION GOAL
Ship GitHub issue #290 on veent_hris: mask historical salary figures in the Employment History
panel of the 201 file (/employees/[id]) and release them through the SAME existing audited
?/reveal action that already covers the current salary. Option 1 of the issue; options 2 and 3
are rejected and closed. #285 (auditing reads/page loads) is permanently out of scope.

PLAN
process/general-plans/active/salary-history-masking-290_PLAN_10-08-26.md
Validate-contract: CONDITIONAL, written 10-08-26, generated-by outer-pvl.

CONTRACT SUMMARY
3 source files changed (~22 lines) + 2 new unit test files (7 masking rows + 2 action rows), in
4 commits:
  1. RED  — tests/unit/employment-history-masking.test.ts, rows T1-T7.
           Expected RED: T1 and T5 fail; T2/T3/T4/T6/T7 PASS (vitest does not type-check).
  2. FIX  — src/lib/server/services/employees.ts: getEmploymentHistory gains
           `opts: { unmask?: boolean } = {}`; mask applied AFTER the `from === to` equality
           check at :1321, never inside display(). '—' passes through unmasked.
  3. GUARD— +page.server.ts ?/reveal gains `await assertCanTouchEmployee(locals.user!, params.id)`
           as its first statement (helper already imported at :4). Its own commit, and it MUST
           land before commit 4 — it shuts the door before commit 4 widens what leaks through it.
           Test T8 in tests/unit/employee-reveal-access.test.ts; mutation M9.
  4. WIRE — +page.server.ts ?/reveal returns { revealed, history } with { unmask: true };
           +page.svelte adds `const history = $derived(form?.history ?? data.history)` and
           swaps data.history at :1682 and :1684. Test T9 asserts the { unmask: true } argument.

THE ONE FATAL MISTAKE
Masking inside display() makes both sides of every salary change compare equal, so the change
is dropped and — because changeCompensation's only *changed* field is salary — the whole
timeline event vanishes at :1324. Test T3 and mutation M2 exist solely to pin this.

AUTONOMY RULES
- Branch: `git switch -c fix/salary-history-masking-290` off an updated local staging.
  Never `checkout -b origin/staging`.
- Gate order, every time: pnpm format:check -> pnpm lint -> pnpm check -> pnpm test.
- Before any mutation, `cp` the file to the scratchpad. NEVER `git checkout <file>` to restore.
- Commit messages: no Co-Authored-By, no attribution footer of any kind.
- Do not touch the `include` at employees.ts:1272, revealEmployeeSensitive, maskEmployee,
  SENSITIVE_FIELDS, any RBAC definition, or prisma/schema.prisma.
- Manual probe DB: docker exec -i veent-db-5434 psql -U veent -d veent_hris -p 5434
  (NOT veent_wifiportal-db-1 — that container has no audit_logs table).

HARD STOPS (stop and ask; do not decide alone)
- C-1 is RESOLVED: the user chose to fix it. It is commit 3 above. This is no longer a stop.
- Squashing or reordering commits 3 and 4. The order is a completion condition.
- If tests/unit/employee-reveal-access.test.ts cannot import the route module even after adding
  leaf mocks: stop and report. Do NOT downgrade it to asserting on canTouchEmployee directly.
- Any push, PR, or merge.
- Any prisma db push, migration, or schema edit.
- Any change that reopens #285, option 2, or option 3.

NEXT PHASE
EXECUTE. Start at checklist step 1 (cut the branch), then step 2 (write T1-T7 and record the
observed RED output) before touching employees.ts.

START COMMAND
Read the plan file above in full, then execute the Implementation Checklist steps 1-13 in order.
Note step 6 captures a one-shot "before" reading that cannot be recovered later.
```
