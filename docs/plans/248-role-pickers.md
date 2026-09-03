# PLAN — Issue #248: CEO, VERIFIER and APPROVER cannot be assigned through the app

**Repo:** `/home/hyuse/Desktop/VeentApps/veent_hris`
**Branch base:** `staging` @ `c524b49935b8e5df813d70f3290b584a6f7b666e`
**Mode history:** RIPER-5 PLAN → INNOVATE (self-critique) → this document is the finalized plan.
**Schema impact:** NONE. `prisma/schema.prisma` already defines all nine `Role` values. **No `db push`, no migration script, no seed change.**
**Estimated diff:** 7 source files, ~70 lines net; 2 test files, ~70 lines added.
**Status:** SHIPPED — merged to `staging` via PR #260 (`8463428`; CodeRabbit follow-up `160eb79`
scoped the last-holder guard to every affected org and made it atomic; merge commit `205bb63`).
Closed by hand — merging to `staging` doesn't auto-close.

---

## PART 0 — DECISION REGISTER

Every decision the issue and the validate pass asked to be surfaced rather than assumed. Each is
final for this plan; the reasoning is recorded so REVIEW (and a future reader) can audit it.

### D1 — Was the omission deliberate? **NO. It is an oversight. Add the values.**

The issue says "not obviously an oversight — confirm the intent". Four independent pieces of
evidence say it was not intent:

1. **The six-value list is a historical snapshot, not a policy.** At `338e5d4^` (the commit before
   the big squashed merge #152) `prisma/schema.prisma`'s `Role` enum contained exactly four values:
   `EMPLOYEE, MANAGER, HR_ADMIN, SUPER_ADMIN`. `PAYROLL_OFFICER`/`FINANCE` came next, then
   `CEO`/`VERIFIER`/`APPROVER` with #132/#133/#134. The pickers hold precisely
   `{4 original} ∪ {PAYROLL_OFFICER, FINANCE}` — the enum's state at the moment the picker was last
   edited. A deliberate exclusion policy does not coincidentally equal a point-in-time snapshot of
   the enum.
2. **There is a live broken control on the page right now** (validate finding (f)). `seed-core.ts`
   provisions VERIFIER/APPROVER users for every food-service tenant (`seed-core.ts:236-247`) and for
   the e2e org (`seed-core.ts:678-701`). A CEO opening Roles & Access today sees those rows with an
   editable `<select value={u.role}>` whose value matches **no** `<option>` — the browser silently
   shows the first option (`EMPLOYEE`) instead, so pressing Save on an untouched row **silently
   demotes a Verifier to Employee**. No deliberate design produces that.
3. **Both readings of "deliberate" contradict the codebase's own documented intent.**
   `src/lib/rbac.ts:102-105` describes VERIFIER/APPROVER as the middle and final gates of the
   maker→verifier→approver chain; `rbac.ts:91` makes CEO the sole holder of `MANAGE_USER_ROLES`.
   Excluding these three from assignment does not express a governance policy — it produces two
   governance _failures_: an approval chain that cannot be restaffed, and a single-point-of-failure
   role with no in-app succession.
4. **The one place CEO _is_ deliberately handled is a UI-only check.**
   `settings/roles/+page.svelte:99` (`u.role !== 'CEO'`) concerns the _target's current_ role, not
   the selectable set, and it is enforced **only in the page** — the v1 PATCH twin
   (`api/v1/settings/users/[id]/role/+server.ts`) has no equivalent check at all. A genuine policy
   in this codebase lives in the service (cf. the self-guard, moved into `setUserRole` in
   `e54ee65` for exactly this reason). A policy that only one of two twin routes enforces is a gap,
   not a policy.

**Therefore:** add the three missing values. Do **not** take the issue's alternative branch
("explicit comment on both enums"). _However_, that alternative is honoured in spirit for the
**hire form** — see D3, where the restriction genuinely is deliberate and is written down.

### D2 — Which hardcoded lists get touched? **The three role-management lists → 9 values, consolidated behind one exported const.**

The validate pass counted four; the true count is **five**. Full inventory:

| #   | Location                                                                               | Today | Action                                      |
| --- | -------------------------------------------------------------------------------------- | ----- | ------------------------------------------- |
| 1   | `src/routes/(app)/settings/roles/+page.server.ts:24` — zod enum                        | 6     | → `z.enum(ASSIGNABLE_ROLES)`                |
| 2   | `src/routes/api/v1/settings/users/[id]/role/+server.ts:8` — zod enum                   | 6     | → `z.enum(ASSIGNABLE_ROLES)`                |
| 3   | `src/routes/(app)/settings/roles/+page.svelte:23-30` — `roles` const → `<option>` list | 6     | → `{#each ASSIGNABLE_ROLES}`                |
| 4   | `src/routes/(app)/employees/new/+page.server.ts:66` — hire zod enum                    | 3     | → `z.enum(HIRE_ROLES)`, **stays 3** (D3)    |
| 5   | `src/routes/(app)/employees/new/+page.svelte:195-197` — three `<option>`s              | 3     | **unchanged**, gains a pointer comment (D3) |

Lists 1–3 are three copies of one fact and are what drifted. They collapse to a single exported
const `ASSIGNABLE_ROLES` in `src/lib/rbac.ts` — the module that already declares itself the "single
source of truth" for roles, is client-safe (it imports only `type Role`), and is already imported
directly by both server code and `.svelte` components (13 call sites, see `+layout.svelte:8`,
`payroll/+layout.server.ts:2`). This is a constant in an existing canonical module, not a new
abstraction: three live call sites today, no interface, no config, no factory.

### D3 — The hire form stays at three values. **This restriction is real, and now written down.**

The hire form is not a weaker copy of the role picker; it is a **different trust boundary**:

- `/employees/new` is gated on `requireCapability(user.role, 'MANAGE_HR')`
  (`employees/new/+page.server.ts:21` and `:122`). `MANAGE_HR` holders are
  `['MANAGER','HR_ADMIN','SUPER_ADMIN','CEO']` (`rbac.ts:55`).
- So **every role listed on that form is a role a MANAGER can mint outright**, creating a brand-new
  account at that authority with no CEO involved — completely bypassing `MANAGE_USER_ROLES: ['CEO']`.
- Widening it to nine would let any MANAGER create a `SUPER_ADMIN` (holder of `OVERRIDE_FINALIZED`),
  a second `CEO` (the exclusive role-changer), or a `VERIFIER`/`APPROVER` (sign-off authority the
  #134 chain depends on being independently held). That is a privilege-escalation path, and it is
  strictly worse than the problem #248 is fixing.
- The coherent provisioning story is two-step and preserves separation of duties: **hire as
  EMPLOYEE/MANAGER/HR_ADMIN → the CEO grants the governance/finance/sign-off role in Settings →
  Roles.** #248's "no path to create a user into one of these roles" is answered by making step two
  work, not by collapsing the two steps into one.

The 3-value list moves to `HIRE_ROLES` in `src/lib/rbac.ts` **for one reason only**: so the
restriction carries a written rationale next to the capability table it depends on, and so a unit
test can pin it (requirement 7). A route module cannot export it — SvelteKit's
`validate_page_server_exports` (`node_modules/@sveltejs/kit/src/utils/exports.js:73`) throws on any
`+page.server.ts` export outside `{load, prerender, csr, ssr, trailingSlash, config, actions,
entries}` or an `_`-prefixed name, and importing the route module into a test would drag
`$lib/server/db`, `$lib/server/notifications` and the employees service into the test graph. See
INNOVATE §I3 for the alternatives weighed.

The hire `.svelte`'s three `<option>`s keep their friendly labels ("HR Admin") and are **not**
driven off `HIRE_ROLES` — doing so would need a label map to avoid regressing "HR Admin" to
"HR ADMIN", which is more code than it saves. It gets a one-line comment pointing at `HIRE_ROLES`.

### D4 — Last-active-CEO guard: **extend the existing role-keyed guard; do NOT generalize to capabilities.**

`assertNotLastSuperAdmin` (`org.ts:174-190`) becomes `assertNotLastOfRole`, keyed off a small
`Partial<Record<Role, string>>` of roles an org must never be left without an active holder of:
`SUPER_ADMIN` (since #160) and `CEO` (new). Exact shape in Change 7.

**Rejected: generalize to "last active holder of `MANAGE_USER_ROLES`" (and/or `ADMINISTER_SYSTEM`).**
This is the option the issue floats, and it is actively unsafe here:

- If the super-admin half were re-expressed as "last holder of `ADMINISTER_SYSTEM`", that capability
  is `['SUPER_ADMIN','CEO']` since #224 — so the guard would **permit demoting an org's last
  SUPER_ADMIN whenever any CEO exists**, silently weakening #160. `OVERRIDE_FINALIZED` (voiding a
  payroll run/period, reopening locked attendance) is `['SUPER_ADMIN']` alone (`rbac.ts:89`), so the
  org would lose that authority entirely. Capability-derived guards inherit every future widening of
  the capability — the opposite of what a lockout guard wants.
- Expressing it as `OVERRIDE_FINALIZED` for supers and `MANAGE_USER_ROLES` for CEOs means two
  capability lookups, a `role: { in: CAPABILITIES[...] }` query, and a capability→label map, to
  produce exactly the same two-role behaviour as a two-entry literal. More machinery, zero benefit.
- `rbac.ts:47-51` already states the house rule this follows: membership is listed explicitly so a
  newly added Role "grants nothing until someone decides it should, rather than silently inheriting".

**One deliberate correctness addition inside the guard: count holders by membership as well as home
org.** Today's count is `where: { organizationId, role: 'SUPER_ADMIN', … }`. Left as-is, the new CEO
branch produces a **reachable false 409** the moment #248 ships:

> The seeded CEO (`ceo@veent.ph`) has `User.organizationId = org_seed` and `userOrganization` rows
> for all three tenants (`seed-core.ts:467-485`). Switching to JoJo Potato, they promote a JoJo user
> to CEO. To undo it, `assertNotLastOfRole('org_jojo', target)` counts other active CEOs **whose
> `User.organizationId` is org_jojo** → zero → 409. Deactivating them instead hits the same guard.
> The promotion is permanently unreversible in-app — precisely the trap #248 exists to remove.

The fix is one clause: `OR: [{ organizationId }, { memberships: { some: { organizationId } } }]`.
Membership _is_ the tenant boundary in this codebase — `api/v1/session/switch-org/+server.ts:21-24`
validates against `userOrganization` before letting `currentOrgId` change, and
`hooks.server.ts:34-38` resolves `locals.user.organizationId` from it. So "holders who can act in
this org" is exactly `home org ∪ members`. Applying it uniformly (not just to CEO) keeps one guard
with one meaning; it cannot weaken the SUPER_ADMIN case in the seed, where the CEO is the only
cross-org member.

### D5 — `u.role !== 'CEO'` at `+page.svelte:99`: **replace it with the self-guard the service actually enforces.**

Policy chosen: **a CEO's role IS editable, as long as one active CEO remains in the org.**

- The alternative policy ("CEOs are never editable, full stop") cannot be enforced where it is
  written. The v1 PATCH twin has no target-role check whatsoever, so the block is bypassable today
  by anyone who can reach it (a CEO). A UI-only rule that the API ignores is security theatre, and
  leaving it in place while the API has none is exactly the inconsistency that makes reviewers
  believe a policy is enforced when it isn't.
- Enforcing "never editable" properly would mean `if (existing.role === 'CEO') error(403)` in
  `setUserRole` — which re-creates #248's problem in mirror image: CEOs could be appointed but never
  revoked, accumulating permanently with removal only via direct DB access.
- The retained protections are stronger and are service-level, so both routes get them: nobody
  changes their own role (`org.ts:202`, 403), and the last active CEO cannot be demoted or
  deactivated (D4, 409). Note a structural consequence worth stating: because only a CEO can invoke
  `MANAGE_USER_ROLES` and self-change is blocked, **any single `setUserRole` call always leaves at
  least one CEO** (the actor). The guard's real bite is on `setUserActive`, where a SUPER_ADMIN
  (holder of `ADMINISTER_SYSTEM`) can deactivate the org's only CEO and freeze role management.

The replacement is `u.id !== data.user.id`, not a bare deletion. Deleting the condition outright
would leave the acting CEO staring at an editable `<select>` on **their own row** that always 403s
— the old `u.role !== 'CEO'` check was incidentally hiding it, since the only actor who can see
these controls is themselves a CEO. `data.user.id` is already available: `(app)/+layout.server.ts`
returns `user.id`, and the generated `PageData` for this route is
`Omit<PageParentData, keyof PageServerData> & PageServerData` (verified in
`.svelte-kit/types/src/routes/(app)/settings/roles/$types.d.ts:26`), so `user` survives from parent
layout data with full typing. **No `load` change required.**

### D6 — `MANAGE_USER_ROLES` stays CEO-exclusive. **No change to the capability table.**

The issue asks this to be decided separately. It stays as-is:

- #248's actual complaint is "exactly one CEO account exists with no way to create a second". That
  is fixed by making the _role_ assignable, not by handing the _capability_ to more roles. Fixing it
  twice, in two ways, in one change is how a scoped fix becomes a governance rewrite.
- Widening `MANAGE_USER_ROLES` reverses a documented #132 decision and would need its own
  separation-of-duties analysis (e.g. giving it to SUPER_ADMIN creates a mutual-promotion loop
  between the two top roles).
- `src/lib/rbac.ts` and `tests/unit/rbac.test.ts` are therefore **untouched by this decision** —
  `rbac.ts` changes only to gain the two role-list consts (D2/D3), and `rbac.test.ts`'s existing
  capability matrix (including `MANAGE_USER_ROLES: ['CEO']`) is unchanged.
- Residual risk, stated for the record: if the org's only CEO is deactivated, role management is
  frozen. It is recoverable — `setUserActive(…, true)` is `ADMINISTER_SYSTEM` (SUPER_ADMIN or CEO)
  and does not run the guard — so this is an outage, not a lockout. D4's guard now prevents the
  deactivation in the first place.

### D7 — Multi-role assignment UI: **OUT OF SCOPE. Documented limitation + user-visible warning + follow-up issue.**

This is validate finding (d), and it must not be silently picked. The tradeoff:

**What ships:** each of the nine roles becomes independently assignable **as a sole role**.
`setUserRole` continues to write `data: { role: newRole, roles: [newRole] }` (#255, `org.ts:219-222`)
— unchanged by this plan.

**The limitation this creates:** the codebase's own documented multi-role example is "MANAGER who is
also VERIFIER" (`scripts/migrate-user-roles-backfill.ts:11-12`, `rbac.test.ts` "multi-role" block).
Once VERIFIER appears in the picker, a CEO trying to make an existing Manager "also a Verifier" will
instead **replace** their MANAGER role. That is a real footgun this change makes reachable.

**Why a multi-role UI is not in scope:**

1. It is a different feature, not a picker widening: a multi-select control, a merge-vs-replace
   decision in `setUserRole` (or a second writer), and an audit-log shape change (`oldValue`/
   `newValue` are currently `{ role }`, `org.ts:228-229`).
2. **It requires a segregation-of-duties policy that does not exist yet.** Arbitrary role sets would
   let a CEO create a `[VERIFIER, APPROVER]` user who alone clears both sign-off stages of the #134
   chain — defeating the entire point of a two-stage chain. Deciding which combinations are legal is
   a governance decision deserving its own issue, not a rider on an enum fix.
3. Shipping the picker without the multi-role UI is strictly better than today: the roles are
   assignable at all, and the seeded VERIFIER/APPROVER rows stop being silently demotable (D1
   evidence 2).

**Mitigation that does ship (one line of UI copy, no logic):** the page's intro paragraph gains
"Assigning a role replaces the user's full role set." — see Change 4c.

**Follow-up issue to file:** _"Multi-role assignment UI for Settings → Roles"_, must include the
legal-combination question, naming VERIFIER+APPROVER as the case that must be forbidden.

### D8 — Cross-tenant CEO provisioning: **OUT OF SCOPE, explicitly.**

Validate finding (e). A CEO promoted through the app gets `User.organizationId = <acting org>` and
**no** `userOrganization` rows for other tenants, so they are single-tenant — unlike the seeded
`ceo@veent.ph`, which `seed-core.ts:479-485` gives membership in all three orgs. Making them
cross-tenant means creating `UserOrganization` rows, i.e. building org-membership management (#131
territory); Settings has no UI for it at all. A role-assignment fix must not also build multi-tenant
account provisioning.

What this plan _does_ handle is the **interaction**: `assertNotLastOfRole` checks every organization
the target is reachable from — their home org **and every org they hold a membership in** — not
just the org the write was issued through. Checking only the acting org is not safe: a target who
is only a _member_ of another tenant (the seeded cross-tenant CEO) can still be that other tenant's
only reachable holder, and a demotion issued from the target's home org would never look at it,
silently stranding that tenant. Note also that `setUserRole`'s
`db.user.findFirst({ where: { id, organizationId } })` (`org.ts:205-207`) means the seeded
cross-tenant CEO **cannot be targeted from a non-home tenant** (404) — correct and deliberate.

**Follow-up issue to file:** _"An app-promoted CEO is single-tenant; the seeded CEO is cross-tenant"_
— decide whether promotion to CEO should also grant memberships, or whether cross-tenant executive
access needs its own provisioning surface.

### D9 — The guard counts `role`, not `roles`. **Deliberate; documented; not exploitable.**

`assertNotLastOfRole` matches the target on `target.role` and counts on the `role` column, exactly as
#160 did — not on the `roles[]` set that capability checks actually read. Justification:

- No app path creates a user whose CEO authority lives only in `roles`: `setUserRole` writes both
  columns together (#255), the seed writes `role` only, and
  `scripts/migrate-user-roles-backfill.ts:25` writes `roles = ARRAY[role]`, explicitly skipping rows
  where `role = ANY(roles)`. A divergent user requires a direct DB write.
- Even if one existed, it cannot cause a CEO lockout via the role path: only a CEO can call
  `setUserRole`, self-change is blocked, so the actor always survives as a CEO (see D5).
- Matching #160's shape keeps one guard with one dialect. Widening it to
  `OR: [{ role }, { roles: { has: role } }]` (the shape `recruitment.ts:345` uses) is not strictly
  correct either, because `rolesOf` falls back to `[role]` only when `roles` is _empty_ — the
  faithful predicate needs an `isEmpty` branch, and that complexity buys nothing today.

This is the same territory as D7; both are resolved by the multi-role follow-up issue.

---

## PART 1 — VERIFIED MAP (re-read at HEAD `c524b49`)

Line numbers below are from a fresh `Read` of each file at HEAD. They match the validate pass except
where noted.

| File                                                    | Lines   | Fact                                                                                               |
| ------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                  | 27-37   | `enum Role` — all nine values. **Unchanged by this plan.**                                         |
| `prisma/schema.prisma`                                  | 383-387 | `role Role @default(EMPLOYEE)` + `roles Role[] @default([])`                                       |
| `src/lib/rbac.ts`                                       | 91      | `MANAGE_USER_ROLES: ['CEO']`                                                                       |
| `src/lib/rbac.ts`                                       | 77      | `ADMINISTER_SYSTEM: ['SUPER_ADMIN', 'CEO']`                                                        |
| `src/lib/rbac.ts`                                       | 89      | `OVERRIDE_FINALIZED: ['SUPER_ADMIN']`                                                              |
| `src/lib/rbac.ts`                                       | 137-152 | end of `CAPABILITIES`, `Capability`, `can`, `canAny` — file ends at 152                            |
| `src/lib/server/services/settings/org.ts`               | 171-190 | `assertNotLastSuperAdmin` (comment 171-173, fn 174-190)                                            |
| `src/lib/server/services/settings/org.ts`               | 192-233 | `setUserRole`; self-guard 202, org scope 205-208, guard call 210-213, write 219-222, audit 224-230 |
| `src/lib/server/services/settings/org.ts`               | 235-270 | `setUserActive`; guard call 251-254                                                                |
| `src/routes/(app)/settings/roles/+page.server.ts`       | 22-25   | six-value `roleSchema` (enum on 24)                                                                |
| `src/routes/(app)/settings/roles/+page.server.ts`       | 57-58   | comment naming only the last-super-admin guardrail                                                 |
| `src/routes/api/v1/settings/users/[id]/role/+server.ts` | 7-9     | six-value `roleSchema` (enum on 8)                                                                 |
| `src/routes/api/v1/settings/users/[id]/role/+server.ts` | 11-13   | comment naming only the last-super-admin guardrail                                                 |
| `src/routes/(app)/settings/roles/+page.svelte`          | 23-30   | local `roles` const (six values)                                                                   |
| `src/routes/(app)/settings/roles/+page.svelte`          | 42-45   | intro `<p>`                                                                                        |
| `src/routes/(app)/settings/roles/+page.svelte`          | 99      | `{#if canManageRoles && u.role !== 'CEO'}`                                                         |
| `src/routes/(app)/settings/roles/+page.svelte`          | 112-114 | `{#each roles as r (r)}` → `<option>`                                                              |
| `src/routes/(app)/employees/new/+page.server.ts`        | 66      | `role: z.enum(['EMPLOYEE','MANAGER','HR_ADMIN'])`                                                  |
| `src/routes/(app)/employees/new/+page.server.ts`        | 21, 122 | `requireCapability(…, 'MANAGE_HR')` on load and on `create`                                        |
| `src/routes/(app)/employees/new/+page.svelte`           | 195-197 | three `<option>`s with friendly labels                                                             |
| `src/routes/(app)/+layout.server.ts`                    | 41-47   | returns `user: { id, email, role, roles, organizationId }`                                         |
| `tests/unit/rbac.test.ts`                               | 1-22    | `import type { Role }`, `ALL_ROLES` literal (nine)                                                 |
| `tests/unit/user-admin-self-guard.test.ts`              | 13-38   | `dbMock` harness (`user.findFirst/update/count`), `CTX.actorRole: 'CEO'`                           |

Environment facts confirmed for the executor:

- **zod 3.25.76** — `createZodEnum` has the readonly overload
  (`node_modules/zod/v3/types.d.ts:760`), so `z.enum(SOME_CONST as const)` typechecks. ✔
- **prettier**: `useTabs`, `singleQuote`, `semi: false`, `trailingComma: "none"`, `printWidth: 100`.
- **eslint** has no import-ordering rule; place new imports adjacent to related ones.
- **CI** (`.github/workflows/ci.yml:38-47`) runs, in one fail-fast job:
  `format:check` → `lint` → `check` → `test`. Format check really is first.
- Server files import `$lib/rbac` **directly** in 13 places (e.g. `payroll/+layout.server.ts:2`), so
  there is no need to re-export the new consts from `$lib/server/rbac`.
- No e2e spec touches `/settings/roles` (grep: zero hits in `tests/`).

---

## PART 2 — CHANGE SET (apply in this order)

> Ordering rationale: the shared consts land first so every consumer compiles; the service guard
> lands before the UI that relies on its 409; tests last.

### Change 1 — `src/lib/rbac.ts` — add the two role lists

**Append at end of file (after `canAny`, currently line 151-152).** No other part of this file
changes; the capability table is untouched (D6).

```ts
// ─── Role assignment (#248) ───────────────────────────────────────────────────

/**
 * The roles Settings → Roles — and its v1 PATCH twin — may assign.
 *
 * Every value the schema defines. It was six of nine until #248: CEO, VERIFIER and APPROVER
 * existed as roles but no picker offered them, so the approval chain (#134) could not be
 * restaffed and the CEO — sole holder of MANAGE_USER_ROLES, and so the only role that can hand
 * out any role — had no in-app succession. Both were reachable only by seeding the database.
 *
 * Written out rather than derived from the Prisma enum on purpose, for the same reason
 * CAPABILITIES lists its holders longhand: a role added to the schema must be a deliberate
 * decision to hand out, not something that becomes assignable merely by existing.
 */
export const ASSIGNABLE_ROLES = [
	'EMPLOYEE',
	'MANAGER',
	'HR_ADMIN',
	'SUPER_ADMIN',
	'PAYROLL_OFFICER',
	'FINANCE',
	'CEO',
	'VERIFIER',
	'APPROVER'
] as const satisfies readonly Role[]

/**
 * The roles the hire form (/employees/new) may create — deliberately a strict subset (#248).
 *
 * That form is gated on MANAGE_HR, which MANAGER holds. Every role listed here is therefore one
 * a MANAGER can mint outright, as a brand-new account, with no CEO involved — bypassing
 * MANAGE_USER_ROLES entirely. So governance (CEO, SUPER_ADMIN), finance (PAYROLL_OFFICER,
 * FINANCE) and sign-off (VERIFIER, APPROVER) stay off it: those are granted after hire, in
 * Settings → Roles, which only the CEO can reach.
 */
export const HIRE_ROLES = ['EMPLOYEE', 'MANAGER', 'HR_ADMIN'] as const satisfies readonly Role[]
```

`Role` is already imported at line 1 (`import type { Role } from '@prisma/client'`) — no import
change. `as const satisfies …` mirrors the existing `CAPABILITIES` declaration at line 137.

### Change 2 — `src/routes/(app)/settings/roles/+page.server.ts`

**2a — import** (insert before line 3):

```diff
 import { fail, error } from '@sveltejs/kit'
 import { z } from 'zod'
+import { ASSIGNABLE_ROLES } from '$lib/rbac'
 import { can, requireCapability } from '$lib/server/rbac'
```

**2b — the enum** (lines 22-25):

```diff
 const roleSchema = z.object({
 	userId: z.string().min(1, 'User ID is required'),
-	role: z.enum(['EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'SUPER_ADMIN', 'PAYROLL_OFFICER', 'FINANCE'])
+	role: z.enum(ASSIGNABLE_ROLES)
 })
```

**2c — comment accuracy** (lines 57-58; the guardrail it names is widening):

```diff
-			// Surface the service's guardrails — last-super-admin (409) and self-role-change (403) —
-			// as inline errors rather than error pages.
+			// Surface the service's guardrails — last super admin / last CEO (409) and
+			// self-role-change (403) — as inline errors rather than error pages.
```

### Change 3 — `src/routes/api/v1/settings/users/[id]/role/+server.ts`

```diff
 import { json, error } from '@sveltejs/kit'
 import { z } from 'zod'
+import { ASSIGNABLE_ROLES } from '$lib/rbac'
 import { requireCapability } from '$lib/server/rbac'
 import { setUserRole } from '$lib/server/services/settings/org'
 import type { RequestHandler } from './$types'

 const roleSchema = z.object({
-	role: z.enum(['EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'SUPER_ADMIN', 'PAYROLL_OFFICER', 'FINANCE'])
+	role: z.enum(ASSIGNABLE_ROLES)
 })

 // PATCH /api/v1/settings/users/:id/role — set a user's role.
-// The last-active-super-admin (409) and self-role-change (403) guardrails both live in setUserRole,
-// so this handler and the roles form action enforce the same rules without restating them.
+// The last-active-super-admin / last-active-CEO (409) and self-role-change (403) guardrails all
+// live in setUserRole, so this handler and the roles form action enforce the same rules without
+// restating them. This route has never had a target-role check of its own and still does not:
+// the page's old `u.role !== 'CEO'` block was UI-only and never reached here (#248).
```

### Change 4 — `src/routes/(app)/settings/roles/+page.svelte`

**4a — import the shared list, delete the local one** (lines 1-31):

```diff
 <script lang="ts">
 	import { enhance } from '$app/forms'
 	import BackButton from '$lib/components/ui/BackButton.svelte'
+	import { ASSIGNABLE_ROLES } from '$lib/rbac'
 	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
 	import type { PageData, ActionData } from './$types'
```

```diff
-	const roles = [
-		'EMPLOYEE',
-		'MANAGER',
-		'HR_ADMIN',
-		'SUPER_ADMIN',
-		'PAYROLL_OFFICER',
-		'FINANCE'
-	] as const
 </script>
```

(Delete lines 23-30 entirely, including the blank line that precedes `</script>` handling —
prettier will settle the whitespace.)

**4b — the option loop** (line 112):

```diff
-										{#each roles as r (r)}
+										{#each ASSIGNABLE_ROLES as r (r)}
 											<option value={r}>{r.replace('_', ' ')}</option>
 										{/each}
```

**4c — intro copy** (lines 42-45) — the D7 mitigation:

```diff
 		<p class="text-sm text-muted-foreground">
 			Manage each user's access level and account status. You cannot change your own role or
-			deactivate yourself, and the last active super admin is protected.
+			deactivate yourself, and the last active super admin and CEO are protected. Assigning a role
+			replaces the user's full role set.
 		</p>
```

**4d — the editability condition** (line 99) — D5:

```diff
-							{#if canManageRoles && u.role !== 'CEO'}
+							<!-- #248: gate on the rule the service actually enforces (no self-role-change),
+							     not on the target being a CEO. The old CEO block was UI-only — the v1 PATCH
+							     twin never had it — and it made CEO a role that could be granted but never
+							     revoked. A CEO row is now editable; setUserRole refuses to remove the last
+							     active one (409). -->
+							{#if canManageRoles && u.id !== data.user.id}
```

`data.user.id` comes from `(app)/+layout.server.ts` via parent layout data — already in `PageData`,
no `load` change (verified against the generated `$types`). If `svelte-check` unexpectedly disagrees,
**stop and report** rather than adding a `currentUserId` to the page `load` unilaterally.

### Change 5 — `src/routes/(app)/employees/new/+page.server.ts`

```diff
 import { fail, redirect } from '@sveltejs/kit'
 import { z } from 'zod'
 import { db } from '$lib/server/db'
+import { HIRE_ROLES } from '$lib/rbac'
 import { requireCapability } from '$lib/server/rbac'
```

```diff
-		role: z.enum(['EMPLOYEE', 'MANAGER', 'HR_ADMIN']),
+		// #248: deliberately narrower than ASSIGNABLE_ROLES. This form runs under MANAGE_HR, which
+		// MANAGER holds, so anything listed here is an account a MANAGER can mint at that authority
+		// with no CEO involved. Governance, finance and sign-off roles are granted after hire, in
+		// Settings → Roles. See HIRE_ROLES in $lib/rbac.
+		role: z.enum(HIRE_ROLES),
```

### Change 6 — `src/routes/(app)/employees/new/+page.svelte`

Insert one comment above the `<option>` list (currently line 195). Options and labels unchanged:

```diff
 						>
+							<!-- Mirrors HIRE_ROLES in $lib/rbac — the server rejects anything else (#248). -->
 							<option value="EMPLOYEE">Employee</option>
 							<option value="MANAGER">Manager</option>
 							<option value="HR_ADMIN">HR Admin</option>
```

### Change 7 — `src/lib/server/services/settings/org.ts` — the guard (the security core)

**7a — replace `assertNotLastSuperAdmin` (lines 171-190) wholesale:**

```ts
// Roles an organization must never be left without an active holder of, because only a holder of
// that same role can grant it back. SUPER_ADMIN has been covered since #160; CEO joins it now that
// #248 makes the role assignable through the app — MANAGE_USER_ROLES is CEO-exclusive, so an org
// that loses its last CEO has no in-app way to appoint another. A label per role, not a bare list,
// so the 409 names the role the caller was actually looking at.
const IRREPLACEABLE_ROLES: Partial<Record<Role, string>> = {
	SUPER_ADMIN: 'super admin',
	CEO: 'CEO'
}

// Call before any write that strips `target` of their role or deactivates them.
//
// Holders are counted by membership as well as home org: the seeded CEO belongs to all three
// tenants (#131) while User.organizationId names only one, so an org-column-only count reports
// "no other CEO" in the other two and would refuse a demotion that is perfectly safe — trapping
// the promotion it just allowed. Membership is the tenant boundary everywhere else too
// (api/v1/session/switch-org validates against it before currentOrgId changes).
//
// Scope note: offboarding deactivates the user account directly (services/separation.ts,
// services/employees.ts) and does NOT pass through here. That is a pre-existing gap in #160's
// guard, inherited rather than introduced by #248, and recoverable by reactivation.
async function assertNotLastOfRole(
	organizationId: string,
	target: { id: string; role: Role; isActive: boolean }
) {
	const label = IRREPLACEABLE_ROLES[target.role]
	if (!label || !target.isActive) return
	const otherActiveHolders = await db.user.count({
		where: {
			role: target.role,
			isActive: true,
			id: { not: target.id },
			OR: [{ organizationId }, { memberships: { some: { organizationId } } }]
		}
	})
	if (otherActiveHolders === 0) {
		error(409, `Cannot remove the last active ${label} from the organization.`)
	}
}
```

The SUPER_ADMIN message is **byte-identical** to today's
(`Cannot remove the last active super admin from the organization.`).

**7b — `setUserRole` call site (lines 210-213):**

```diff
-	// GUARDRAIL: don't demote the last active super admin.
-	if (newRole !== 'SUPER_ADMIN') {
-		await assertNotLastSuperAdmin(organizationId, existing)
-	}
+	// GUARDRAIL: don't strip the last active super admin — or, since #248, the last active CEO.
+	// Keyed on the role being LOST rather than the one being set, so re-saving a user's existing
+	// role is never blocked (the select is prefilled with it, so that Save is one click away).
+	if (newRole !== existing.role) {
+		await assertNotLastOfRole(organizationId, existing)
+	}
```

Equivalence check for the SUPER_ADMIN case: old skipped iff `newRole === 'SUPER_ADMIN'`; new skips
iff `newRole === existing.role`. They differ only when `existing.role !== 'SUPER_ADMIN'`, where the
helper early-returns anyway. Behaviour for #160 is unchanged.

**7c — `setUserActive` call site (lines 251-254):**

```diff
-	// GUARDRAIL: don't deactivate the last active super admin.
+	// GUARDRAIL: don't deactivate the last active super admin or CEO (#248) — deactivating the only
+	// CEO freezes role management org-wide, since MANAGE_USER_ROLES is CEO-exclusive.
 	if (!isActive) {
-		await assertNotLastSuperAdmin(organizationId, existing)
+		await assertNotLastOfRole(organizationId, existing)
 	}
```

**No other change to `org.ts`.** In particular `setUserRole`'s `data: { role: newRole, roles:
[newRole] }` (#255) and the self-guard at line 202 are left exactly as they are.

---

## PART 3 — TESTS

Two existing files are extended; no new test file is created. Both use harnesses already present.

### Test A — `tests/unit/rbac.test.ts` (pins the assignment lists, D2/D3)

**A0 — value-import the Prisma enum** (line 10):

```diff
-import type { Role } from '@prisma/client'
+// Value import, not type-only: the generated enum object is the drift tripwire below.
+import { Role } from '@prisma/client'
```

`Role` remains usable as a type (Prisma 5 emits both a const object and a type alias), so
`const ALL_ROLES: Role[]` at line 12 still compiles. Value imports of `@prisma/client` already work
under this vitest config — see `tests/unit/proposal-queue.test.ts:2`.

**A1 — extend the import from `../../src/lib/rbac`** to add `ASSIGNABLE_ROLES, HIRE_ROLES`.

**A2 — new `describe` block, appended at end of file:**

```ts
// #248: CEO, VERIFIER and APPROVER existed in the schema but no role picker offered them, so they
// were assignable only by seeding the database. These pin both assignment lists.
describe('role assignment lists (#248)', () => {
	it('offers every role the schema defines', () => {
		expect([...ASSIGNABLE_ROLES].sort()).toEqual([...ALL_ROLES].sort())
	})

	// Tripwire. A role added to the schema lands here, forcing an explicit decision about whether it
	// may be assigned — the omission #248 fixed went unnoticed for three roles across two releases.
	// If a future role is deliberately NOT assignable, change this assertion and say why.
	it('keeps the picker in step with the Prisma enum', () => {
		expect(Object.values(Role).sort()).toEqual([...ALL_ROLES].sort())
	})

	// The hire form runs under MANAGE_HR, which MANAGER holds — so every role listed there is one a
	// MANAGER can mint outright, bypassing MANAGE_USER_ROLES (CEO-exclusive). It stays a strict
	// subset on purpose; governance, finance and sign-off roles are granted after hire.
	it('keeps privileged roles off the hire form', () => {
		const hire: string[] = [...HIRE_ROLES]
		const assignable: string[] = [...ASSIGNABLE_ROLES]
		expect(hire).toEqual(['EMPLOYEE', 'MANAGER', 'HR_ADMIN'])
		for (const r of hire) expect(assignable).toContain(r)
		for (const r of ['SUPER_ADMIN', 'CEO', 'PAYROLL_OFFICER', 'FINANCE', 'VERIFIER', 'APPROVER']) {
			expect(hire).not.toContain(r)
		}
	})

	// Sanity: every role the hire form can mint holds strictly less than the CEO exclusives.
	it('lets no hire-form role change other users’ roles', () => {
		for (const r of HIRE_ROLES) expect(can(r, 'MANAGE_USER_ROLES')).toBe(false)
	})
})
```

Note the `const hire: string[] = [...HIRE_ROLES]` widening — `toContain`/`not.toContain` against a
readonly literal tuple otherwise fails `pnpm check` on the element type.

### Test B — `tests/unit/user-admin-self-guard.test.ts` (pins the guard, D4/D5)

**B0 — amend the file header comment** (lines 4-11) with one sentence:

```
 * #248 widens the last-holder guardrail from SUPER_ADMIN to CEO, since the CEO is the only role
 * that can grant any role back; those cases live here beside it.
```

**B1 — additions inside `describe('setUserRole', …)`:**

```ts
// #248: the three roles no picker offered. The service always accepted them (it takes a Role);
// what was missing was any route that would pass them. Pinned end-to-end at the writer.
it.each(['CEO', 'VERIFIER', 'APPROVER'] as const)('promotes a user to %s (#248)', async (role) => {
	dbMock.user.update.mockResolvedValue({ id: 'user-other', role })
	await expect(setUserRole('user-other', 'org1', role, CTX)).resolves.toBeDefined()
	expect(dbMock.user.update).toHaveBeenCalledWith({
		where: { id: 'user-other' },
		data: { role, roles: [role] }
	})
})

it('blocks demoting the last active CEO (#248)', async () => {
	dbMock.user.findFirst.mockResolvedValue({ id: 'user-other', role: 'CEO', isActive: true })
	dbMock.user.count.mockResolvedValue(0)

	await expect(setUserRole('user-other', 'org1', 'HR_ADMIN', CTX)).rejects.toMatchObject({
		status: 409,
		body: { message: 'Cannot remove the last active CEO from the organization.' }
	})
	expect(dbMock.user.update).not.toHaveBeenCalled()
})

it('demotes a CEO while another active CEO remains', async () => {
	dbMock.user.findFirst.mockResolvedValue({ id: 'user-other', role: 'CEO', isActive: true })
	dbMock.user.count.mockResolvedValue(1)

	await expect(setUserRole('user-other', 'org1', 'HR_ADMIN', CTX)).resolves.toBeDefined()
})

// The seeded CEO belongs to all three tenants via userOrganization while User.organizationId
// names only one. Counting the org column alone would report "no other CEO" in the other two
// and trap a promotion the same actor had just made (#248).
it('counts holders who reach the org through a membership', async () => {
	dbMock.user.findFirst.mockResolvedValue({ id: 'user-other', role: 'CEO', isActive: true })
	await setUserRole('user-other', 'org1', 'HR_ADMIN', CTX)

	expect(dbMock.user.count).toHaveBeenCalledWith({
		where: {
			role: 'CEO',
			isActive: true,
			id: { not: 'user-other' },
			OR: [{ organizationId: 'org1' }, { memberships: { some: { organizationId: 'org1' } } }]
		}
	})
})

// The guard keys on the role being LOST, so re-saving a user's current role — one click, since
// the select is prefilled — is never mistaken for a demotion.
it('does not block re-saving the last super admin’s existing role', async () => {
	dbMock.user.findFirst.mockResolvedValue({
		id: 'user-other',
		role: 'SUPER_ADMIN',
		isActive: true
	})
	dbMock.user.count.mockResolvedValue(0)

	await expect(setUserRole('user-other', 'org1', 'SUPER_ADMIN', CTX)).resolves.toBeDefined()
	expect(dbMock.user.count).not.toHaveBeenCalled()
})
```

**B2 — addition inside `describe('setUserActive', …)`:**

```ts
// The guard's real bite: only a CEO can change roles and never their own, so a role change always
// leaves one CEO standing — but a SUPER_ADMIN holds ADMINISTER_SYSTEM and could deactivate the
// org's only CEO, freezing role management entirely (#248).
it('blocks deactivating the last active CEO (#248)', async () => {
	dbMock.user.findFirst.mockResolvedValue({ id: 'user-other', role: 'CEO', isActive: true })
	dbMock.user.count.mockResolvedValue(0)

	await expect(setUserActive('user-other', 'org1', false, CTX)).rejects.toMatchObject({
		status: 409
	})
	expect(dbMock.user.update).not.toHaveBeenCalled()
})
```

**Retained unchanged (do not touch):** the two self-guard tests at the top of `setUserRole`
(403 + no DB round trip) and both existing last-super-admin tests. Requirement 7's
"self-role-change is still blocked" is satisfied by those existing tests continuing to pass —
confirm in REVIEW that they were not edited.

### Tests deliberately NOT written

- **No e2e.** No existing spec touches `/settings/roles`, and the behaviours here are all
  service-level and covered by unit tests. Adding a Playwright spec for a select's option list is
  cost without signal.
- **No test of the zod schemas themselves.** They are `z.enum(ASSIGNABLE_ROLES)` / `z.enum(HIRE_ROLES)`
  — testing them would test zod. The lists they are built from are pinned in Test A.

---

## PART 4 — VALIDATION GATES

Run in this exact order; CI runs the same sequence fail-fast in one job, format check first
(`.github/workflows/ci.yml:38-47`). All commands from the repo root, `pnpm` (never `npm`).

```bash
# 0. Regenerate Prisma types if the client is stale (safe no-op otherwise).
pnpm exec prisma generate

# 1. FORMAT FIRST — CI aborts the whole quality job here, so never skip it.
pnpm format:check
#    On failure: pnpm format   (then re-run format:check and re-read the diff)

# 2. Lint
pnpm lint

# 3. Typecheck (svelte-kit sync + svelte-check) — the gate that catches the
#    z.enum(readonly tuple) inference and the data.user.id parent-data access.
pnpm check

# 4. Unit tests
pnpm test

# 5. Targeted re-run while iterating on the two touched suites
pnpm test rbac
pnpm test user-admin-self-guard
```

**Gate expectations**

| Gate           | Expected                                                                               | If it fails                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `format:check` | clean                                                                                  | run `pnpm format`, re-inspect the diff for unintended reflow                                                                             |
| `lint`         | clean                                                                                  | most likely an unused import left after deleting the local `roles` const in `+page.svelte`                                               |
| `check`        | 0 errors, 0 warnings                                                                   | if `data.user` is reported missing on `PageData`, **stop and report** (D5) rather than improvising a `load` change                       |
| `test`         | all suites pass, `rbac.test.ts` and `user-admin-self-guard.test.ts` gain the new cases | a failing existing `user-admin-self-guard` case means Change 7b changed #160 behaviour — treat as a plan violation, not a test to update |

**E2E** (`pnpm test:e2e`) is not required by this change and needs Postgres + a seeded DB. Run it only
if the local environment already has one; no spec touches the affected surfaces.

---

## PART 5 — MANUAL VERIFICATION (post-merge-gate, before PR)

Per the repo `verify` skill: Node 22 + corepack pnpm, `.env.dev`, `./start.sh`, dev server on a free
port, then `curl`/browser. `api/v1/_dev/login-as` (dev-only, `+server.ts:14`) gives one-click login
by email.

1. **The live bug from D1 evidence 2 is gone.** Log in as `ceo@veent.ph` / `Ceo@1234`. Open
   `/settings/roles`. Every row's `<select>` shows nine options and — critically — the seeded
   `verifier@…` / `approver@…` rows now display **VERIFIER / APPROVER** as the selected value
   instead of falling back to EMPLOYEE.
2. **Promote to each new role.** Change three different employees to CEO, VERIFIER and APPROVER in
   turn. Each saves without error. Verify in psql (`users` table, snake_case per the `@@map`) that
   **both** `role` and `roles` were written: `roles` must be exactly `{CEO}` etc. (#255 behaviour
   preserved).
3. **Self-role-change still blocked, and no longer offered.** The CEO's own row now renders the
   read-only role label, not a select (D5). Confirm via the API that the rule is still enforced
   server-side: `PATCH /api/v1/settings/users/<ceo-user-id>/role` as the CEO → **403**
   "You cannot change your own role."
4. **Last-active-CEO guard fires.** Log in as `admin@veent.ph` / `Admin@1234` (SUPER_ADMIN). On
   `/settings/roles`, click **Deactivate** on `ceo@veent.ph` while it is the org's only active CEO →
   inline **409** "Cannot remove the last active CEO from the organization." (After step 2 promoted
   a second CEO in the same org, demote them first, or expect this to succeed.)
5. **Cross-tenant round trip (the D4 membership clause).** As `ceo@veent.ph`, use the header switcher
   to move to JoJo Potato. Promote a JoJo user to CEO. Then **demote them back** — this must
   **succeed**. A 409 here means the `OR: [{ organizationId }, { memberships: … }]` clause is missing
   or malformed; without it this is a permanent trap.
6. **Hire form unchanged and still narrow.** `/employees/new` shows exactly Employee / Manager /
   HR Admin. POST the create action with `role=CEO` (curl, bypassing the select) → **400** with a
   `fieldErrors.role` entry, not a created user.
7. **Cleanup.** Restore every promoted user to their seeded role, or re-seed.

---

## PART 6 — INNOVATE PASS: alternatives considered and rejected

The self-critique leg. Each item is an option the first PLAN draft either assumed away or got wrong;
the resolution is recorded with its reason.

### I1 — Derive the picker from the Prisma enum (`z.nativeEnum(Role)` / `Object.values(Role)`) — **REJECTED**

Superficially the laziest possible fix: zero maintenance, a tenth role becomes assignable
automatically, and the drift class disappears permanently.

Rejected on two grounds. **Security:** auto-widening is the wrong default for an authorization
surface. `src/lib/rbac.ts:47-51` states the house rule explicitly — a newly added Role must grant
nothing "until someone decides it should, rather than silently inheriting". Applying that to
_capabilities_ but not to _assignability_ would be inconsistent, and the failure mode is worse
(a role becomes handable-out before anyone decides it should be). **Mechanical:** the `.svelte`
option list cannot use it — `Object.values(Role)` is a _runtime_ import of `@prisma/client`, which
would pull the Prisma client into the browser bundle; every client-side role import in this codebase
is `import type`. So the derivation would only cover two of the three lists, leaving the drift it was
meant to eliminate.

The maintenance benefit is recovered instead by the Test A tripwire, which fails when the schema
gains a role that `ASSIGNABLE_ROLES` does not — forcing the decision without pre-making it.

### I2 — Write the nine values out in all three places, no shared const — **REJECTED (close call)**

The strictest YAGNI reading: no new export, three literal edits, zero indirection. Genuinely fewer
concepts.

Rejected because the bug being fixed _is_ three copies of one fact drifting apart. Shipping a fix
that leaves the drift mechanism intact — and adds a fourth trigger for it, since any future role now
needs three synchronized edits plus a decision about the hire form — treats the symptom. The
consolidation is one exported const with three live call sites in a module that already exists and is
already imported by all three consumers. That clears the ponytail ladder at rung 4 (already-installed
dependency / existing module) without inventing anything.

### I3 — Where to put `HIRE_ROLES` (or whether it should exist) — **RESOLVED: `$lib/rbac.ts`**

Three options were weighed once requirement 7 demanded a test pinning the hire-form decision:

- **(a) Leave the literal inline, add only a comment, skip the test.** Cheapest, but the decision
  then rests on a comment nobody's tooling checks — and the issue's own framing ("if deliberate,
  make it explicit") argues for something durable. Rejected.
- **(b) `export const _HIRE_ROLES` from the route.** SvelteKit _does_ permit `_`-prefixed exports
  (`exports.js:16`), so this is legal and co-locates the list with its enforcement. Rejected because
  the test would then import the route module, which eagerly pulls in `$lib/server/db` (PrismaClient
  construction), `$lib/server/notifications`, and the employees service — a mock-heavy test graph for
  a three-string assertion, and a novel export idiom this codebase uses nowhere.
- **(c) `$lib/rbac.ts`.** One call site today, which is the ponytail objection — but the const is not
  there for reuse, it is there to be an _auditable, tested authorization statement_ sitting next to
  the capability table whose membership (`MANAGE_HR` ⊇ MANAGER) is exactly what makes the
  restriction necessary. That is a legitimate reason for a single-use named constant. **Chosen**, and
  flagged here so REVIEW sees it was a considered exception rather than reflex.

Also decided here: the hire `.svelte` keeps its hand-written `<option>` labels. Driving them off
`HIRE_ROLES` would need a label map to preserve "HR Admin", which is strictly more code than the
duplication it removes.

### I4 — The last-CEO guard's org scoping — **the first draft's real bug, now fixed**

The first PLAN draft copied `assertNotLastSuperAdmin`'s `where: { organizationId, role, … }` verbatim
and moved on. The INNOVATE pass traced the seeded cross-tenant CEO through it and found a reachable
false 409 that would permanently trap the very promotion #248 enables (D4, and manual step 5). The
one-clause membership fix landed as a result. **This is the single most important finding of the
second pass** — without it the feature ships with a one-way door.

Two narrower alternatives were considered and rejected: (i) apply the membership clause only to the
CEO branch — conditional complexity for one guard with one meaning; (ii) accept the false positive
and document it — unacceptable, since the documented workaround would be "edit the database", which
is the exact complaint #248 files.

### I5 — Is the last-CEO guard even reachable on the role path? — **surfaced, kept anyway**

The second pass established something the issue does not say: because `MANAGE_USER_ROLES` is
CEO-exclusive _and_ `setUserRole` blocks self-change, **every** role change leaves at least one CEO
standing. So the CEO branch of the guard can only fire from `setUserActive` (a SUPER_ADMIN
deactivating the sole CEO) or from the cross-tenant scoping case in I4.

Kept regardless. It is defence in depth against a future third caller of `setUserRole` (exactly the
scenario that motivated moving the self-guard into the service in `e54ee65`), it costs a two-entry
literal, and the `setUserActive` path is genuinely reachable today. But the finding is recorded here
so nobody later "discovers" the CEO branch is hard to hit and mistakes it for dead code.

### I6 — Should the guard read `roles[]` instead of `role`? — **surfaced, deferred (D9)**

Considered adding `OR: [{ role }, { roles: { has: role } }]` on the grounds that #255's own comment
calls `roles` "the set every capability check actually reads". Rejected for this change: no app path
produces a user whose CEO authority lives only in `roles`, the faithful predicate needs an `isEmpty`
branch to mirror `rolesOf`'s fallback, and I5 shows the role path cannot lose its last CEO anyway.
Folded into the D7 multi-role follow-up rather than half-solved here.

### I7 — Should this change also fix the offboarding bypass? — **NO, but it must be documented**

The second pass found that `services/separation.ts:267-270` and `services/employees.ts:1183-1186`
both set `user.isActive = false` directly, bypassing the last-holder guard entirely. The seeded CEO
_does_ have an Employee record (`EMP-900`, `seed-core.ts:487-494`), so offboarding it would
deactivate the org's only CEO with no 409.

Not fixed here: it is a **pre-existing** #160 gap (the same bypass exists for SUPER_ADMIN today),
fixing it means threading the guard through two transactions, and it is recoverable by reactivation.
But the new guard's comment must not overclaim, so Change 7a carries an explicit scope note, and a
follow-up issue is filed (Part 7).

### I8 — Deleting `u.role !== 'CEO'` outright vs. swapping it — **swap**

The first draft simply deleted the condition. The second pass noticed the condition was incidentally
doing UX work: since only a CEO can see these controls, "hide CEO rows" also hid the actor's own row,
whose Save can only ever 403. Deleting it would ship a control that is guaranteed to fail. Swapping
to `u.id !== data.user.id` costs the same one line and expresses the rule the service actually
enforces. Verified against the generated `$types` that this needs no `load` change.

### I9 — Over-build audit of the final plan

Line-by-line pass against "would a senior engineer call this overcomplicated?":

| Considered adding                                 | Verdict                                                      |
| ------------------------------------------------- | ------------------------------------------------------------ |
| A `roles.ts` module for the two lists             | **No** — `$lib/rbac.ts` exists and is exactly this           |
| Re-exporting the consts from `$lib/server/rbac`   | **No** — 13 server files already import `$lib/rbac` directly |
| A `Role → label` map for the roles-page select    | **No** — the existing `r.replace('_', ' ')` handles all nine |
| A capability-derived generic "last holder" helper | **No** — D4; actively unsafe and more code                   |
| A `currentUserId` field on the page `load`        | **No** — parent layout data already carries it               |
| An e2e spec for the picker                        | **No** — no signal a unit test doesn't give                  |
| A `setUserRoles` (plural) writer                  | **No** — D7, out of scope                                    |
| Touching `prisma/schema.prisma` or the seed       | **No** — all nine values already exist                       |
| Changing `MANAGE_USER_ROLES`                      | **No** — D6                                                  |

Net new abstractions: **zero**. Net new exported constants: **two**, both plain arrays in an existing
module, both tested. Net new functions: **zero** (one existing private function renamed and widened).

### I10 — Adjacent gaps noted, not fixed

- **Primary-role-only capability checks (validate finding (g)).** Both role routes call
  `requireCapability(user.role, 'MANAGE_USER_ROLES')` on the primary role, while `locals.user.roles`
  exists (`src/lib/server/auth.ts:20`) and `requireAnyCapability` is available
  (`src/lib/server/rbac.ts:37`). Moot post-#255 for single-role users, and #247 (merged) already swept
  the routes that mattered. **Not changed here** — it is an independent correctness question, and
  changing an authorization check as a drive-by on an RBAC fix is exactly the kind of unscoped edit
  this plan avoids. Worth its own issue if the multi-role work (D7) proceeds.
- **`createEmployee` writes `role` but not `roles`** (`services/employees.ts:455-461`), so every new
  hire has `roles: []` and relies on the `rolesOf`/Lucia fallback to `[role]`. Consistent with #255's
  documented fallback and unchanged by this plan (D3 keeps the hire roles as-is), but it is the same
  invariant #255 tightened elsewhere. Mention only.
- **The hire form already lets a MANAGER mint an HR_ADMIN.** A lesser instance of the escalation D3
  guards against, pre-existing. Not narrowed here — narrowing it would break onboarding flows this
  issue has no mandate over — but it belongs in the follow-up.

---

## PART 7 — OUT OF SCOPE / FOLLOW-UP ISSUES TO FILE

Nothing below is implemented by this plan. File them when the PR opens so the deferrals are tracked
rather than lost.

1. **Multi-role assignment UI for Settings → Roles** (D7, D9, I6). Single-select + #255's set-reset
   means "make this Manager also a Verifier" strips MANAGER. Must decide the legal-combination
   policy first — **VERIFIER + APPROVER on one user would let one person clear both stages of the
   #134 chain and must be forbidden.**
2. **Offboarding bypasses the last-holder guard** (I7). `services/separation.ts:267` and
   `services/employees.ts:1183` deactivate user accounts directly. Pre-existing since #160, now also
   applies to CEO.
3. **An app-promoted CEO is single-tenant; the seeded CEO is cross-tenant** (D8). Decide whether
   promotion to CEO should grant `UserOrganization` rows, or whether cross-tenant executive access
   needs its own provisioning surface (#131 territory).
4. **Role routes check the primary role, not the full set** (I10). `requireCapability(user.role, …)`
   vs. `requireAnyCapability(user.roles, …)` in both role-assignment routes.
5. _(Optional, low priority)_ **The hire form lets a MANAGER create an HR_ADMIN** (I10). Pre-existing;
   consider whether HR_ADMIN creation should require `ADMINISTER_HR_ORGWIDE`.

---

## PART 8 — EXECUTION CHECKLIST

Work top to bottom. Do not reorder — later steps depend on earlier ones compiling. Flag any deviation
rather than making it silently (RIPER-5 EXECUTE rule).

- [ ] **1.** Branch off an updated local `staging`: `git switch staging && git pull && git switch -c fix/assignable-roles-248`. (Never `checkout -b origin/staging`.)
- [ ] **2.** **Change 1** — append `ASSIGNABLE_ROLES` and `HIRE_ROLES` (with their doc comments) to the end of `src/lib/rbac.ts`. Do not touch `CAPABILITIES`, `ROLE_HIERARCHY`, or anything above.
      _Verify:_ `pnpm check` — both consts infer as readonly tuples of `Role`.
- [ ] **3.** **Change 2** — `settings/roles/+page.server.ts`: add the `$lib/rbac` import (2a), swap the enum (2b), correct the guardrail comment (2c).
- [ ] **4.** **Change 3** — `api/v1/settings/users/[id]/role/+server.ts`: add the import, swap the enum, replace the header comment.
      _Verify (3+4):_ `pnpm check` clean — `parsed.data.role` still assignable to `Role` at both `setUserRole` call sites.
- [ ] **5.** **Change 4** — `settings/roles/+page.svelte`: import `ASSIGNABLE_ROLES` (4a), delete the local `roles` const (4a), point `{#each}` at it (4b), update the intro copy (4c), swap line 99's condition to `u.id !== data.user.id` with its comment (4d).
      _Verify:_ `pnpm check` — no unused-import or missing-`data.user` error. **If `data.user` is not on `PageData`, STOP and report** (do not add a `currentUserId` to `load` on your own initiative).
- [ ] **6.** **Change 5** — `employees/new/+page.server.ts`: import `HIRE_ROLES`, swap the enum, add the rationale comment. The list stays three values.
- [ ] **7.** **Change 6** — `employees/new/+page.svelte`: add the one-line pointer comment above the three `<option>`s. Options and labels unchanged.
- [ ] **8.** **Change 7a** — replace `assertNotLastSuperAdmin` in `src/lib/server/services/settings/org.ts` with `IRREPLACEABLE_ROLES` + `assertNotLastOfRole`, comments included. Keep the SUPER_ADMIN 409 message byte-identical.
- [ ] **9.** **Change 7b** — `setUserRole` call site: `if (newRole !== existing.role) await assertNotLastOfRole(...)`.
- [ ] **10.** **Change 7c** — `setUserActive` call site: same helper, updated comment. Confirm **no other** line of `org.ts` changed (`git diff` — in particular `data: { role: newRole, roles: [newRole] }` and the self-guard at line 202 must be untouched).
      _Verify (8-10):_ `pnpm test user-admin-self-guard` — the **four existing** tests still pass before any new ones are added.
- [ ] **11.** **Test A** — `tests/unit/rbac.test.ts`: value-import `Role` (A0), extend the `$lib/rbac` import (A1), append the `role assignment lists (#248)` describe (A2).
      _Verify:_ `pnpm test rbac` — new block green, the entire pre-existing capability matrix untouched and still green.
- [ ] **12.** **Test B** — `tests/unit/user-admin-self-guard.test.ts`: amend the header comment (B0), add five cases to `setUserRole` (B1) and one to `setUserActive` (B2). **Edit no existing test.**
      _Verify:_ `pnpm test user-admin-self-guard` — all green; `git diff` on this file shows additions only.
- [ ] **13.** **Gate 1 — format:** `pnpm format:check`. If it fails, `pnpm format`, then re-read the diff for unintended reflow before re-running.
- [ ] **14.** **Gate 2 — lint:** `pnpm lint` clean.
- [ ] **15.** **Gate 3 — typecheck:** `pnpm check` — 0 errors, 0 warnings.
- [ ] **16.** **Gate 4 — unit:** `pnpm test` — full suite green (83 files).
- [ ] **17.** **Manual verification** — run Part 5 steps 1-7 against a local dev server. Step 5 (cross-tenant promote-then-demote) is mandatory; a 409 there means Change 7a's membership clause is wrong.
- [ ] **18.** **Self-review the diff** — confirm every changed line traces to D1-D9: 7 source files, 2 test files, **no** `prisma/` change, **no** seed change, **no** `CAPABILITIES` change, no `db push` required.
- [ ] **19.** **Commit** — subject `fix(settings): make all nine roles assignable and guard the last CEO (#248)`. Body: the D1 finding, the D3 hire-form decision, the D4 guard extension, and the D7/D8 out-of-scope notes. **No `Co-Authored-By` / `Co-Author` trailer of any kind** (project CLAUDE.md).
- [ ] **20.** **Open the PR against `staging`**, then file the Part 7 follow-up issues (at minimum #1 multi-role UI and #2 offboarding bypass) and cross-link them from the PR body. Remember: merging to `staging` does not auto-close the issue.
