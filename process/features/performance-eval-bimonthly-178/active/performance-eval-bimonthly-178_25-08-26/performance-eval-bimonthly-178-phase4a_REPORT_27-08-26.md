---
name: report:performance-eval-bimonthly-178-phase4-a
description: Phase 4 section A EXECUTE report — items 82, 84, 87 (template assignment action, load extension, and the SPEC AC2 test); items 83, 85, 86, 88 belong to other agents
date: 27-08-26
phase: phase-4-section-a
status: COMPLETE
feature: performance-eval-bimonthly-178
plan: process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_PLAN_25-08-26.md
metadata:
  node_type: memory
  type: report
  feature: performance-eval-bimonthly-178
  phase: phase-4-section-a
---

# Phase 4 section A — template assignment (items 82, 84, 87)

## What Was Done

Two files, no others.

### Item 82 — `assignTemplate` action

`src/routes/(app)/employees/[id]/+page.server.ts`. Guard order exactly as the plan states:

1. `requireAnyCapability(locals.user!.roles, 'ADMINISTER_HR_ORGWIDE')`
2. `await assertCanTouchEmployee(locals.user!, params.id)`
3. `assignTemplateSchema.safeParse(...)` — the form body is only read at this point.

Then a trust-boundary check the plan did not spell out but that the design requires: a non-empty
posted `assignedTemplateId` must name a template in the actor's own org
(`db.performanceTemplate.findFirst({ where: { id, organizationId } })`, direct column, no join —
#323). A stranger id is a 400, not a write.

The write is `employee.updateMany({ where: { id: params.id, organizationId }, data: {
assignedTemplateId } })` inside `db.$transaction`, with `writeAuditLog(ctx, { action: 'UPDATE',
entityType: 'Employee', entityId, newValue: { assignedTemplateId } }, tx)` — `tx` passed (#324).
`count !== 1` → `fail(404)` and no audit row.

The org filter is on the WRITE and not only on the guard because `canTouchEmployee` short-circuits
to `true` for `ADMINISTER_HR_ORGWIDE` **without ever checking the organization**. Guard alone would
let a foreign HR_ADMIN write this row.

### Item 84 — `load`

Added, gated on `canAny(roles, 'ADMINISTER_HR_ORGWIDE')` (not `canManage`, which holds MANAGER):

| Key | Type | Value |
|---|---|---|
| `canAssignTemplate` | `boolean` | actor holds `ADMINISTER_HR_ORGWIDE` |
| `performanceTemplates` | `{ id: string; name: string }[]` | ACTIVE templates in the org, from `listTemplates(organizationId)` filtered on `isActive`, already ordered active-then-name by the service. `[]` when `canAssignTemplate` is false — the service is not even called |
| `assignedTemplateId` | `string \| null` | echoed verbatim from the employee row |

### Item 87 — `tests/unit/performance-template-assignment.test.ts`

10 cases, all green, asserted against the real `load` / `actions` exports. The fixture employee is
in department "Sales" with position "Account Executive" while the org has an ACTIVE template named
"Account Executive" — so any future inference from department/position/role turns the first case
red. Cases: no-inference on load; stored id wins over a contradicting position; no template list
for a non-`ADMINISTER_HR_ORGWIDE` actor; exact posted id written + audit payload + audit receives
the `tx` client; blank clears to null and skips the template lookup; MANAGER refused a stranger;
MANAGER refused their own report; refusal happens before `formData()`; cross-org write 404s; a
foreign template id 400s.

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `pnpm vitest run tests/unit/performance-template-assignment.test.ts` | 10 passed |
| `pnpm test` | 162 files, 1882 tests, all passed |
| `pnpm check` | 1029 files, **0 errors**, 1 warning (pre-existing `CalculatorWindow.svelte` a11y) |
| `pnpm lint` | 0 errors, 1 warning (same pre-existing file) |
| `pnpm format:check` | my two files clean; repo-level fails only on three untracked `.tmp-*.mjs` scratch files owned by a concurrent agent — not touched |

## Mutation Checks

All three applied by editing the source, confirmed red, then reverted by re-editing (never
`git checkout`) and confirmed green again.

| # | Mutation | Red cases | After revert |
|---|---|---|---|
| 1 | `ADMINISTER_HR_ORGWIDE` → `MANAGE_HR` in the action | 2 (`MANAGER on their OWN report`, `refuses before the form body is read`) | 10/10 green |
| 2 | dropped `organizationId` from the `updateMany` where-clause | 3 (posted-id write, blank-clear, cross-org 404) | 10/10 green |
| 3 | added a `?? performanceTemplates.find(t => t.name === position.title)?.id` fallback in `load` | 1 (the no-inference case) | 10/10 green |

## Plan Deviations

None in behaviour. Two additions the plan did not name, both required by its own §6/§323 rules:
the org-scoped template-existence check, and the `organizationId` filter on the write.

## What the Plan Got Wrong / Drift

1. **Line numbers are stale**, as expected. Everything was located by content.
2. **`scopedToEmployee` already applies `assertCanTouchEmployee` to every action on this page**
   (the wrapper around `export const actions`). The plan's item 82 asks for the call as a literal
   line in the action; it is there, but it is now the second execution of the same check. It is
   defence-in-depth, not the only guard — so **removing that one line alone cannot be made to go
   red** through the action export. What can be mutation-checked is the observable behaviour, and
   mutations 1 and 2 above cover it.
3. **The whose-record guard is strictly weaker than the capability here.** Anyone who fails
   `assertCanTouchEmployee` for this route already fails `ADMINISTER_HR_ORGWIDE` first, and anyone
   who holds `ADMINISTER_HR_ORGWIDE` passes `canTouchEmployee` unconditionally. The real
   cross-tenant protection for this action is the `organizationId` filter on the write, which the
   plan does not mention. Recorded so a later reader does not delete it as redundant.

## Forward Preview

### Test Infra Found
Route-action unit tests here mock every service the route imports at module scope (`vi.mock`
replaces all exports, so every imported name must be supplied). The new test file carries a full
mock set for `/employees/[id]` — reuse it rather than rebuilding it.

### Blast Radius Changes
`src/routes/(app)/employees/[id]/+page.server.ts` now imports `$lib/server/audit`,
`$lib/server/services/performance-templates` and `$lib/server/performance/schemas`. Any existing
test that mocks `$lib/server/db` for this route must expose `performanceTemplate` and
`$transaction` if it exercises `assignTemplate` (existing ones do not, and stay green).

### Commands to Stay Green
`pnpm vitest run tests/unit/performance-template-assignment.test.ts`, `pnpm test`, `pnpm check`.

### Dependency Changes
None.

## Still Open in Phase 4

Items 83 (the `<select>` in `+page.svelte`), 85, 86 (`/performance` readiness line) and 88
(`performance-template-backfill-check.test.ts`) belong to other agents. Item 89 is satisfied for
this section's slice.
