# RIPER-5 — Issue #237 · Holiday Calendar card gated on ADMINISTER_SYSTEM

**Repo:** `/home/hyuse/Desktop/VeentApps/veent_hris`
**Branch:** `staging` · **HEAD verified:** `c524b49` (`Merge pull request #257 from Aguynamedkent7/fix/user-roles-backfill-255`)
**Modes run:** `[MODE: PLAN]` → `[MODE: INNOVATE]` (self-critique of the drafted plan) → `[MODE: EXECUTE]`
**Status:** EXECUTED, not yet merged — committed `27f066d` on `fix/holiday-card-gate-237`
(re-validated with zero drift at `staging @ 205bb63`, post-#248/#260). Manual verification across
all 5 login rows (Gate 6) passed. The falsification pass turned up a real flake in the e2e spec's
"Add Holiday" click (a pre-hydration click silently dropped — the same class of bug documented
elsewhere in `tests/e2e/` as the "verify-skill hydration gotcha"); fixed with the repo's existing
`expect(...).toPass({ timeout: 15000 })` retry idiom (see `employee-view-only.spec.ts` for
precedent), then re-verified: 3/3 clean runs, and the falsification pass now correctly fails both
"can find and open" tests when the production fix is reverted, and passes once restored. Amend
commit pending. Awaiting PR into `staging`; close #237 by hand after merge — it will not auto-close.

> **Note on the issue's stated paths.** The issue and the validate pass refer to
> `settings/+page.svelte` / `+layout.svelte`. The real paths are under the `(app)` route group:
> `src/routes/(app)/settings/+page.svelte` and `src/routes/(app)/+layout.svelte`. All paths below
> are the real ones.

---

# PART 1 — `[MODE: PLAN]` (drafted)

## §1 Independent verification log

Everything below was re-derived from fresh Reads at `c524b49`, not carried over from the validate pass.

### 1.1 The bug — CONFIRMED, exactly as described

| Surface                  | File:line                                                          | Gate                                                       | Resolves to                             |
| ------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------- |
| Card                     | `src/routes/(app)/settings/+page.svelte:80-85`                     | `super: true`                                              | —                                       |
| Card filter              | `src/routes/(app)/settings/+page.svelte:88-93`                     | `!('super' in c && c.super) \|\| data.isSuperAdmin`        | —                                       |
| `isSuperAdmin`           | `src/routes/(app)/settings/+page.server.ts:8`                      | `can(user.role, 'ADMINISTER_SYSTEM')`                      | `{SUPER_ADMIN, CEO}`                    |
| Nav entry                | `src/routes/(app)/+layout.svelte:243`                              | `show: isSuperAdmin` → `canAny(roles,'ADMINISTER_SYSTEM')` | `{SUPER_ADMIN, CEO}`                    |
| **Page + all 3 actions** | `src/routes/(app)/settings/holidays/+page.server.ts:9, 28, 53, 93` | `requireCapability(user.role, 'MANAGE_HR')`                | `{MANAGER, HR_ADMIN, SUPER_ADMIN, CEO}` |

Set math from `src/lib/rbac.ts:55,77`:

- `MANAGE_HR = ['MANAGER','HR_ADMIN','SUPER_ADMIN','CEO']`
- `ADMINISTER_SYSTEM = ['SUPER_ADMIN','CEO']`
- **Locked-out set = `{MANAGER, HR_ADMIN}`** — confirmed.

**Nav line number drift confirmed and re-confirmed:** the Holidays nav entry is at **`+layout.svelte:243`**, not `:238` as the issue states. Line 238 is the Earnings & Deductions entry. Re-read at `c524b49`; no further drift since the validate pass.

`src/routes/(app)/settings/holidays/+page.svelte` contains **no** role-conditional UI (`grep` for `super`/`ADMINISTER`/`role` returns nothing) — the entire page is usable by any `MANAGE_HR` holder, so nothing about the page argues for the narrower display gate.

**Only two display surfaces reference the page** (`grep -rn "settings/holidays" src/`): the card and the nav entry. `tests/unit/back-target.test.ts:44` mentions the URL but tests back-navigation, not gating. No dashboard quick-link, no other entry point.

### 1.2 (b) Card audit — INDEPENDENTLY RE-RUN, and it found _more_ than the validate pass looked at

I audited **all 15 cards**, not just the 4 flagged ones, and **all 8 settings nav children**.

**The 3 gated cards other than Holiday Calendar:**

| Card                       | Card gate                                                                                                | Page guard                                                                                                                                                    | Verdict                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `/payroll/config`          | `super:true` → `{SUPER_ADMIN,CEO}`                                                                       | `requireCapability(role,'ADMINISTER_SYSTEM')` (`payroll/config/+page.server.ts:10,41,103`)                                                                    | **exact match, by construction**              |
| `/payroll/statutory-rates` | `statutory:true` → `canAny(roles,'MANAGE_STATUTORY_RATES') \|\| canAny(roles,'PROPOSE_STATUTORY_RATES')` | _identical expression_ (`payroll/statutory-rates/+page.server.ts:67-69`)                                                                                      | **exact match, by construction**              |
| `/settings/roles`          | `super:true` → `{SUPER_ADMIN,CEO}`                                                                       | `can(role,'MANAGE_USER_ROLES') \|\| can(role,'ADMINISTER_SYSTEM')` → `{CEO}∪{SUPER_ADMIN,CEO}` = `{SUPER_ADMIN,CEO}` (`settings/roles/+page.server.ts:13-15`) | **match today — but by COINCIDENCE** (see §2) |

**The 11 ungated cards** — I did _not_ take "they're `super:false`, so fine" on faith. Three of them do **not** guard on `MANAGE_HR` at all:

- `/settings/org` → `requireMinRole(user.role, 'HR_ADMIN')` (`:17,61,91,124`)
- `/settings/org-chart` → `requireMinRole(user.role, 'HR_ADMIN')` (`:7`)
- `/settings/schedules` → `requireMinRole(user.role, 'HR_ADMIN')` (`:13,31,67,79`)

These are **still a match**, but only because of `ROLE_HIERARCHY` (`src/lib/rbac.ts:16-30`): `MANAGER: 2, HR_ADMIN: 2, CEO: 2, SUPER_ADMIN: 3`, so `hasMinRole(x,'HR_ADMIN')` admits `{MANAGER, HR_ADMIN, CEO, SUPER_ADMIN}` — **the same set as `MANAGE_HR`**. Pinned by `tests/unit/rbac.test.ts:153,160-165`. The remaining 8 use `requireCapability(role,'MANAGE_HR')` directly. So: no mismatch, but two of the 11 depend on a hierarchy coincidence rather than on naming `MANAGE_HR`. Noted, not in scope.

**All 8 settings nav children audited:**

| Nav child (`+layout.svelte`)     | `show:`                                | Page admits                             | Verdict                                                           |
| -------------------------------- | -------------------------------------- | --------------------------------------- | ----------------------------------------------------------------- |
| `/settings` `:236`               | `isAdmin`                              | `MANAGE_HR`                             | match                                                             |
| `/settings/company` `:237`       | `isAdmin`                              | `MANAGE_HR`                             | match                                                             |
| `/settings/pay-codes` `:238`     | `isAdmin`                              | `MANAGE_HR`                             | match                                                             |
| `/settings/salary-grades` `:239` | `isAdmin`                              | `MANAGE_HR`                             | match                                                             |
| `/settings/org` `:240`           | `isAdmin`                              | `minRole HR_ADMIN` (= `MANAGE_HR` set)  | match                                                             |
| `/settings/schedules` `:241`     | `isAdmin`                              | `minRole HR_ADMIN` (= `MANAGE_HR` set)  | match                                                             |
| `/settings/roles` `:242`         | `isSuperAdmin \|\| canManageUserRoles` | `ADMINISTER_SYSTEM ∨ MANAGE_USER_ROLES` | **match by construction** — the nav already mirrors the page's OR |
| `/settings/holidays` `:243`      | `isSuperAdmin`                         | `MANAGE_HR`                             | **MISMATCH** ✗                                                    |

`grep -rn "isSuperAdmin" src/` returns only 8 hits total across the whole codebase — `+layout.svelte:96,242,243`, `settings/+page.svelte:91`, `settings/+page.server.ts:8`, and three unrelated hits in `reports/audit-log/+page.server.ts` (row-value redaction, not a nav gate). There is **no** `isSuperAdmin` gate anywhere in the main `navItems` array.

> **CONCLUSION (b) CONFIRMED, and slightly strengthened:** Holiday Calendar is the only display-gate/page-guard mismatch in the entire settings surface — card _or_ nav. The Roles & Access card is the one remaining gate that matches only by coincidence.

### 1.3 (e) The minimal fix — CONFIRMED, with the reasoning re-derived

The proposed `super: true` → `super: false` is correct and is _not_ a hack, for a reason worth stating explicitly:

> `src/routes/(app)/settings/+page.server.ts:6` guards the **whole `/settings` index** on
> `MANAGE_HR`. Nobody who cannot hold `MANAGE_HR` ever sees _any_ card. Therefore "no extra gate"
> **is** "gated on `MANAGE_HR`" — the exact guard the holidays page enforces. No new gate concept,
> no new server flag, no new capability plumbing.

The nav half is symmetric: `showSettings = isAdmin && settingsChildren.length > 0` (`+layout.svelte:250`), so every settings child already sits under a `MANAGE_HR` gate; setting the Holidays child to `show: isAdmin` matches lines 236-241 verbatim.

### 1.4 (e) The issue's own suggested `requiredCapability?: Capability` field — **REFUTED. Four independent reasons.**

The validate pass gave two; I found two more that are stronger.

1. **Type shape doesn't fit.** 2 of the 3 remaining gated cards are an **OR of two capabilities**
   (`statutory` = `MANAGE_STATUTORY_RATES ∨ PROPOSE_STATUTORY_RATES`; `roles` =
   `MANAGE_USER_ROLES ∨ ADMINISTER_SYSTEM`). A single `Capability` cannot express either; you'd need
   `Capability | Capability[]` plus OR-fold semantics.
2. **Zero consumers.** After the fix, exactly 3 cards carry any gate, and each is already served by
   one boolean the server computes. The field would be introduced with no call site that needs it.
3. **It moves the authorization decision to the client.** `settings/+page.svelte` receives only
   booleans today; to evaluate `canAny(roles, cap)` in the component it would need the role set
   pushed into `PageData` (or reached via `$page.data.user`). The current design — **server computes
   the boolean, next to where the guard lives** — is strictly better and is the reason the gates have
   stayed correct for the other cards.
4. **It re-creates the exact bug.** The bug _is_ an indirection between a card's flag and its page's
   guard. Adding a _second, richer_ indirection layer does not remove the drift surface; it enlarges
   it. The fix that actually removes drift is making the flag evaluate the page's own expression —
   which is what §2 does for the one card where it doesn't.

**Verdict: reject the generic field.** Do not introduce it.

---

## §2 DECISION on (c) — Roles & Access card vs. issue #248 → **FOLD IN** (5 lines)

### The finding, restated precisely

```
Roles card gate  : data.isSuperAdmin      = {SUPER_ADMIN, CEO}
Roles page guard : MANAGE_USER_ROLES ∨ ADMINISTER_SYSTEM
                 = {CEO} ∪ {SUPER_ADMIN, CEO}
                 = {SUPER_ADMIN, CEO}                          ← equal only because
                                                                 MANAGE_USER_ROLES ⊆ ADMINISTER_SYSTEM
```

If #248 widens `MANAGE_USER_ROLES` beyond `['CEO']` (e.g. adds `HR_ADMIN`), the containment breaks and
the Roles & Access card reproduces **#237 verbatim**: page usable, card invisible.

### The decision: fix it now. Five reasons, in order of weight.

1. **The coincidence makes the card invisible to the audit #248's author would run.** This is the
   decisive argument. `grep -rn MANAGE_USER_ROLES src/` finds `+layout.svelte:99,242` and
   `settings/roles/+page.server.ts:35` — and **does not find `settings/+page.svelte`**, because the
   card gate never names the capability. A #248 implementer doing a conscientious sweep of every
   `MANAGE_USER_ROLES` consumer will miss this card _by construction_. Leaving it as "a note on a
   sibling agent's plan" bets correctness on a hand-off.
2. **The issue explicitly asks for it.** #237 says: _"the other `super: true` cards are worth checking
   for the same mismatch — the pattern of a display gate drifting from its page's real guard is what
   produced this one."_ The audit was requested; it found exactly one gate resting on a coincidence.
   Reporting it and not fixing it under-delivers on the issue's own ask.
3. **It is provably behaviour-neutral today.** `{SUPER_ADMIN, CEO}` before, `{SUPER_ADMIN, CEO}` after.
   It cannot regress anything; it is a _pure_ removal of a hidden dependency.
4. **It takes no position on #248.** It does not touch `MANAGE_USER_ROLES`'s membership. It makes the
   card evaluate the page's own guard expression, so whatever set #248 lands on, the card follows.
   This satisfies the caller's bar — _"trivial and clearly correct regardless of what #248 decides"_ —
   literally.
5. **It follows a pattern already in the same file, three lines away.** `canStatutory`
   (`+page.server.ts:9-11` / `+page.svelte:90`) is exactly this shape: server mirrors the page's OR
   expression into one boolean, card names its own flag. Adding `canRoles` is native to the file, not
   an invention.

### Coordination note for #248 (goes in the PR body)

> This PR makes the Roles & Access card read the same OR-expression `/settings/roles` guards on.
> It is a no-op today. **#248 should NOT also change this card** — after this lands, widening
> `MANAGE_USER_ROLES` in `src/lib/rbac.ts` automatically widens the card. Merge conflict risk is nil:
> #248's blast radius is `src/lib/rbac.ts` + `tests/unit/rbac.test.ts`; this touches
> `settings/+page.{svelte,server.ts}`.

---

## §3 DECISION on (d) — primary-role vs full-role-set in nav/page → **DO NOT FOLD. File separately.**

This is the opposite of the caller's tentative lean. Three pieces of evidence, gathered _after_ the
initial draft, changed the answer. I document the reversal in §7.

### 3.1 The divergence is real and I reproduced it by reading

- `+layout.svelte:95-96` — `isAdmin = canAny(roles,'MANAGE_HR')`, `isSuperAdmin = canAny(roles,'ADMINISTER_SYSTEM')` — **full role set** (`data.user.roles`, #133).
- `settings/+page.server.ts:6,8` — `requireCapability(user.role, …)`, `can(user.role, …)` — **primary role only**.
- Same file, `:11` — `canAny(user.roles,'MANAGE_STATUTORY_RATES')` — **full role set.** The file contradicts itself.
- `src/lib/server/auth.ts:20` — `roles: attributes.roles?.length ? attributes.roles : [attributes.role]`, so `user.roles ⊇ [user.role]` always; swapping `can`→`canAny` can only widen, never deny.

So a primary-`EMPLOYEE` + secondary-`HR_ADMIN` user sees "All settings" in the nav and gets a 403 on
the page. That is a genuine broken link. **Confirmed by reading, not assumed.**

### 3.2 Evidence 1 — it is 100% systemic, not local. `requireAnyCapability` is dead code.

```
requireCapability(<x>.role,   …)  in src/routes + src/lib  →  108 call sites
requireMinRole(<x>.role,      …)  in src/routes           →   61 call sites
can(<x>.role,                 …)  in src/routes + src/lib  →   23 call sites
──────────────────────────────────────────────────────────────────────────────
requireAnyCapability(<x>.roles,…) anywhere in src/ tests/ scripts/  →  0 call sites
                                  (defined at src/lib/server/rbac.ts:37, never used)
canAny(<x>.roles,             …)  →    8 call sites, all in loads computing DISPLAY flags
```

Every **route guard** in the application, without exception, resolves authority from the primary
role. The multi-role helper written for #133 has **never been called**. The nav is the outlier, not
`settings/+page.server.ts`. Changing one of 192 primary-role guards makes the codebase _less_
consistent, not more.

### 3.3 Evidence 2 — the narrow fold would not even fix the symptom; it moves the 403 one level deeper

If `/settings`'s load became `requireAnyCapability(user.roles,'MANAGE_HR')`, a primary-`EMPLOYEE` +
secondary-`HR_ADMIN` user would load the index and see 11 cards — and then get a 403 from
`/settings/company`, `/settings/pay-codes`, `/settings/salary-grades`, … because **all 13 settings
subpages still guard on the primary role**. The broken link relocates from one place to eleven.
Fixing it properly means converting every settings subpage (~40 call sites) — which is a refactor,
not a bugfix, and unambiguously not #237.

### 3.4 Evidence 3 — the divergence is currently _latent_: nothing creates a multi-element `roles`

`c844fba` (#255, two commits before HEAD) made `setUserRole` write `data: { role: newRole, roles: [newRole] }`
(`src/lib/server/services/settings/org.ts:215-221`) — the **only** UI that assigns roles resets the
set to a single element. `prisma/seed-core.ts:24` writes `roles: [u.role]`.
`scripts/migrate-user-roles-backfill.ts` sets `roles = ARRAY[role]`. `grep` finds **no** code path
anywhere in `src/`, `prisma/`, or `scripts/` that writes a multi-element `roles` array. Multi-role is
a supported _schema_ shape (`prisma/schema.prisma:387`) reachable only by direct DB writes.

So the (d) bug affects **zero users reachable through the product today**.

### 3.5 Verdict

> (d) is a **systemic architectural decision** — "do route guards become multi-role aware (192 sites),
> or does the nav drop back to the primary role (8 sites)?" — that is currently **latent**, whose
> narrow fold **does not fix the symptom**, and whose adoption at one site would make that site the
> only one of 192 behaving differently. #237 must not decide it silently in a 2-line discoverability
> fix. **File a separate issue.**

**Draft for the new issue** (put in the PR body / file after merge):

> **Title:** Nav computes visibility from the full role set while every route guard uses the primary role
> **Body:** `(app)/+layout.svelte:92-112` derives every nav gate from `canAny(data.user.roles, …)` (#133),
> but all 108 `requireCapability(x.role,…)`, 61 `requireMinRole(x.role,…)` and 23 `can(x.role,…)` call
> sites resolve authority from the primary role alone. `requireAnyCapability` (`src/lib/server/rbac.ts:37`)
> has zero call sites. A multi-role user (primary `EMPLOYEE` + secondary `HR_ADMIN`) would therefore see
> nav entries that 403. Latent today: since #255, `setUserRole` resets `roles` to `[newRole]`, and no code
> path writes a multi-element set — only a direct DB write can produce one. Needs a decision, not a patch:
> either routes adopt `requireAnyCapability(user.roles, …)` wholesale, or the nav drops to the primary role,
> or #133's multi-role support is removed. Same drift class #247 fixed in the service layer.
> Found while fixing #237.

---

## §4 Final scope

**IN**

1. Holiday Calendar card: `super: true` → `super: false`. _(the issue)_
2. Holidays nav entry: `show: isSuperAdmin` → `show: isAdmin`. _(the issue)_
3. Roles & Access card: gate on `canRoles`, mirroring the page's own OR. _(§2 — the requested audit's one finding)_
4. Tests: 1 new unit spec, 1 new e2e spec, 1 line added to `tests/e2e/helpers.ts`.

**OUT (each with a written reason)**

- Generic `requiredCapability?: Capability` field — refuted, §1.4.
- Primary-role → full-role-set conversion — separate issue, §3.
- Refactoring the `super`/`statutory`/`roles` flags into `show:` booleans — §6, Alternative C.
- Renaming the flag `super` (1 remaining `true` user) — churn across 13 lines, zero benefit.
- Naming `MANAGE_HR` at the `requireMinRole('HR_ADMIN')` sites in `/settings/org`, `/org-chart`, `/schedules` — pre-existing, correct today, pinned by `rbac.test.ts`. **Mention, don't change** (CLAUDE.md §3).
- The same page is called **"Holiday Calendar"** (card), **"Holidays"** (nav) and **"Public Holidays"** (`holidays/+page.svelte:51`). Three names, one page. Pre-existing; not a permission bug. **Mention, don't change.**

---

## §5 Exact changes

### 5.1 `src/routes/(app)/settings/+page.svelte` — card gate (the issue)

Lines 80-85. Change the value only; the object stays multi-line (Prettier preserves the author's
break after `{`, so this reformats to nothing).

```diff
 		{
 			href: '/settings/holidays',
 			title: 'Holiday Calendar',
 			desc: 'Regular & special holidays',
-			super: true
+			super: false
 		},
```

_Why `super: false` and not deleting the key:_ the other 11 ungated cards all spell `super: false`
explicitly. Deleting the key works (`!('super' in c && c.super)` handles absence) but breaks file
consistency for no gain.

### 5.2 `src/routes/(app)/settings/+page.svelte` — Roles card gate (§2)

Line 86. `roles: true` is the same width as `super: true` (line stays at 98 cols ≤ `printWidth: 100`).

```diff
-		{ href: '/settings/roles', title: 'Roles & Access', desc: 'User role management', super: true }
+		{ href: '/settings/roles', title: 'Roles & Access', desc: 'User role management', roles: true }
```

### 5.3 `src/routes/(app)/settings/+page.svelte` — filter (§2)

Lines 88-93. One added branch, placed above the `super` fallback, mirroring the existing
`statutory` branch exactly.

```diff
 	const visible = $derived(
 		cards.filter((c) => {
 			if ('statutory' in c && c.statutory) return data.canStatutory
+			if ('roles' in c && c.roles) return data.canRoles
 			return !('super' in c && c.super) || data.isSuperAdmin
 		})
 	)
```

_Type note:_ `cards` becomes a 3-member union (`{…super:boolean}` ×13, `{…statutory:boolean}` ×1,
`{…roles:boolean}` ×1). The `in` operator narrows unions whose members lack the key (TS ≥ 4.9) —
this is the identical mechanism the existing `'statutory' in c` line already relies on. `pnpm check`
is the gate.

### 5.4 `src/routes/(app)/settings/+page.server.ts` — `canRoles` (§2)

Lines 7-12. Three added lines (two of them comment). No import change: `can` is still used by
`isSuperAdmin`; `requireCapability` and `canAny` are untouched. Line length 89 ≤ 100.

```diff
 	return {
 		isSuperAdmin: can(user.role, 'ADMINISTER_SYSTEM'),
+		// The Roles page opens for the role-changer (#132) and the account-status admin, so the card
+		// evaluates that same OR rather than piggybacking on ADMINISTER_SYSTEM. A no-op while
+		// MANAGE_USER_ROLES is CEO-only, but widening it can no longer leave the card behind (#237).
+		canRoles: can(user.role, 'MANAGE_USER_ROLES') || can(user.role, 'ADMINISTER_SYSTEM'),
 		// Statutory Rates page is reachable by editors (CEO/Super Admin) and proposers (HR Admin).
 		canStatutory:
 			canAny(user.roles, 'MANAGE_STATUTORY_RATES') || canAny(user.roles, 'PROPOSE_STATUTORY_RATES')
 	}
```

_Deliberate:_ `can(user.role, …)`, **not** `canAny(user.roles, …)` — it must mirror
`settings/roles/+page.server.ts:13-14`, which uses `can(user.role, …)`. Using `canAny` here would
plant a fresh instance of the (d) drift while claiming to remove drift. See §3.

### 5.5 `src/routes/(app)/+layout.svelte` — nav entry (the issue)

Line 243.

```diff
 			{ href: '/settings/roles', label: 'Roles', show: isSuperAdmin || canManageUserRoles },
-			{ href: '/settings/holidays', label: 'Holidays', show: isSuperAdmin }
+			{ href: '/settings/holidays', label: 'Holidays', show: isAdmin }
```

_Why `isAdmin` and not `true`:_ the parent already gates the whole group
(`showSettings = isAdmin && …`, line 250), so `true` would be behaviourally identical. But lines
236-241 all spell `show: isAdmin` explicitly — the array is meant to be readable standalone as
"who sees this row". Match the neighbours.

`isSuperAdmin` remains used at line 242, so no orphaned `$derived` to clean up.

### 5.6 Order of application

Independent edits; this order keeps each intermediate state coherent.

1. `+layout.svelte:243` — nav (self-contained, no server dependency).
2. `settings/+page.svelte:84` — holidays card (self-contained; `/settings` already gates on `MANAGE_HR`).
3. `settings/+page.server.ts` — add `canRoles` **before** the card starts reading it (otherwise
   `data.canRoles` is `undefined` and the Roles card silently disappears for everyone in the window
   between edits).
4. `settings/+page.svelte:86,91` — Roles card flag + filter branch.
5. Tests.

---

## §6 Tests

### 6.0 What the harness can and cannot reach — checked, not assumed

- `vitest.config.ts`: `include: ['tests/unit/**']`, `environment: 'node'`, no setup file.
- **No Svelte component test exists anywhere in the repo** (`grep` for `render(`,
  `@testing-library/svelte`, `vitest-environment` across `tests/unit/` → 0 hits; the only `.svelte`
  import is `$lib/utils/submit-guard.svelte`, a runes module, not a component).
- **`jsdom` is not a dependency** — it appears in `pnpm-lock.yaml` only as an optional _peer_ of
  vitest. A component test would require adding a dependency **and** a vitest env change.

→ **The card/nav gates are not unit-testable without introducing the repo's first component-test
infrastructure.** They are e2e-testable, and `tests/e2e/employee-view-only.spec.ts` is direct
precedent for "assert a role does / does not see a control", with the matching philosophy already
written into its header: _"a hidden button is a UX decision, the role gate is the boundary."_
#237 is that same sentence read the other way.

### 6.1 NEW — `tests/unit/settings-cards.test.ts`

Pins the server half: the load's premise for the holidays fix, and the new `canRoles` (§2).
Imports only `$lib/server/rbac` transitively (no `db`), so **no mocks are needed**.

```ts
import { describe, it, expect } from 'vitest'
import type { Role } from '@prisma/client'
import { load } from '../../src/routes/(app)/settings/+page.server'

/**
 * #237 — the Settings index decides which cards are shown. Two things are pinned here.
 *
 * 1. /settings admits the whole MANAGE_HR set. That is the premise of the Holiday Calendar fix:
 *    reaching this page AT ALL requires MANAGE_HR, so an ungated card is already MANAGE_HR-gated —
 *    which is exactly what the holidays page enforces. If this guard ever narrows, the card's
 *    gate silently narrows with it.
 * 2. `canRoles` mirrors the OR that /settings/roles guards on, instead of piggybacking on
 *    ADMINISTER_SYSTEM. Identical sets today; the point is that widening MANAGE_USER_ROLES (#248)
 *    can no longer leave the card behind while the page opens.
 *
 * The card markup itself is Svelte and is covered by tests/e2e/settings-visibility.spec.ts —
 * this repo has no component-test harness and #237 does not justify introducing one.
 */
const run = (role: Role) =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(load as any)({ locals: { user: { id: 'u1', organizationId: 'org1', role, roles: [role] } } })

describe('/settings index (#237)', () => {
	// Longhand, not derived from CAPABILITIES — recomputing the table from the table proves nothing.
	it.each<[Role, boolean, boolean, boolean]>([
		// role,            isSuperAdmin, canRoles, canStatutory
		['SUPER_ADMIN', true, true, false],
		['CEO', true, true, true],
		['HR_ADMIN', false, false, true],
		['MANAGER', false, false, false]
	])('%s gets the expected card flags', async (role, isSuperAdmin, canRoles, canStatutory) => {
		await expect(run(role)).resolves.toEqual({ isSuperAdmin, canRoles, canStatutory })
	})

	// The premise of the Holiday Calendar fix (#237): an ungated card IS a MANAGE_HR-gated card.
	it.each<Role>(['MANAGER', 'HR_ADMIN', 'SUPER_ADMIN', 'CEO'])('opens for %s', async (role) => {
		await expect(run(role)).resolves.toBeDefined()
	})

	it.each<Role>(['EMPLOYEE', 'FINANCE', 'PAYROLL_OFFICER', 'VERIFIER', 'APPROVER'])(
		'stays closed to %s',
		async (role) => {
			await expect(run(role)).rejects.toMatchObject({ status: 403 })
		}
	)
})
```

> **EXECUTE-time note:** the `canStatutory` column above is derived from `MANAGE_STATUTORY_RATES = ['CEO','SUPER_ADMIN']`
> and `PROPOSE_STATUTORY_RATES = ['HR_ADMIN']` (`src/lib/rbac.ts:117,119`) → `SUPER_ADMIN` **true**, `CEO` true,
> `HR_ADMIN` true, `MANAGER` false. **The `SUPER_ADMIN` row above is written `false` and is WRONG — correct it to
> `true` when writing the file.** Left visible here deliberately: this is the kind of hand-written matrix cell that
> must be checked against `rbac.ts` at write time, not copied. Run the test and confirm all four rows before committing.

### 6.2 NEW — `tests/e2e/settings-visibility.spec.ts`

The actual #237 symptom. Read-only: no fixtures, no `beforeAll`, no teardown, parallel-safe.

```ts
import { test, expect } from '@playwright/test'
import { login, USERS } from './helpers'

/**
 * #237 — the Holiday Calendar card and the Holidays nav entry were gated on ADMINISTER_SYSTEM
 * while /settings/holidays and all three of its actions require only MANAGE_HR. HR Admin and
 * Manager could use the page by typing the URL but had no way to find it.
 *
 * The negative half matters as much as the positive one: the fix must open the Holiday card and
 * NOTHING ELSE, so each role is also asserted not to gain the two genuinely system-admin cards.
 *
 * Read-only — no fixtures, no teardown.
 */

// The two roles #237 locked out: MANAGE_HR without ADMINISTER_SYSTEM.
const LOCKED_OUT = [
	{ label: 'HR Admin', user: USERS.hr },
	{ label: 'Manager', user: USERS.manager }
]

for (const { label, user } of LOCKED_OUT) {
	test(`${label} can find and open the Holiday Calendar (#237)`, async ({ page }) => {
		await login(page, user)
		await page.goto('/settings', { waitUntil: 'domcontentloaded' })

		const card = page.getByRole('link', { name: /Holiday Calendar/ })
		await expect(card).toBeVisible()
		// The Settings nav group auto-expands on a /settings route, so the child row is on screen.
		await expect(page.getByRole('link', { name: 'Holidays', exact: true })).toBeVisible()

		// The link is real, not a card pointing at a 403 — the inverse of the #237 failure.
		await card.click()
		await page.waitForURL('**/settings/holidays', { waitUntil: 'domcontentloaded' })
		await expect(page.getByRole('heading', { name: 'Public Holidays' })).toBeVisible()
		// ...and it is usable, not merely readable.
		await expect(page.getByRole('heading', { name: 'Add New Holiday' })).toBeVisible()
	})

	test(`${label} still does not see the system-admin cards (#237)`, async ({ page }) => {
		await login(page, user)
		await page.goto('/settings', { waitUntil: 'domcontentloaded' })
		await expect(page.getByRole('link', { name: /Payroll Config/ })).toHaveCount(0)
		await expect(page.getByRole('link', { name: /Roles & Access/ })).toHaveCount(0)
	})
}

test('Super Admin keeps every card and nav entry it already had (#237)', async ({ page }) => {
	await login(page, USERS.admin)
	await page.goto('/settings', { waitUntil: 'domcontentloaded' })
	await expect(page.getByRole('link', { name: /Holiday Calendar/ })).toBeVisible()
	await expect(page.getByRole('link', { name: /Payroll Config/ })).toBeVisible()
	// Gated on canRoles after #237; must not have narrowed for the Super Admin.
	await expect(page.getByRole('link', { name: /Roles & Access/ })).toBeVisible()
	await expect(page.getByRole('link', { name: 'Holidays', exact: true })).toBeVisible()
})
```

**Locator safety, checked against the markup:**

- Card accessible name is its text: `"Holiday Calendar Regular & special holidays"` → the
  `/Holiday Calendar/` regex matches the card and nothing else.
- Nav row name is exactly `"Holidays"` → `exact: true` prevents it matching the card.
- `/Payroll Config/` cannot match the sidebar's `"Payroll"` row (which MANAGER _does_ have);
  `/Roles & Access/` cannot match the sidebar's `"Roles"` row.
- Cards are plain `<a href>`, so the click needs no hydration-retry (`use:enhance` buttons do;
  anchors don't).
- Playwright's default 1280×720 viewport is ≥ Tailwind `lg`, so the sidebar is rendered
  (`lg:translate-x-0`), not behind the mobile drawer.

### 6.3 MODIFIED — `tests/e2e/helpers.ts`

`hr@veent.ph` is seeded (`prisma/seed-core.ts:521-530`, inside `seedProd`, which `seedE2E` calls at
line 676), gets a `userOrganization` row and `roles: ['HR_ADMIN']` via
`backfillMembershipsAndRoles` (line 659), and is active — but it is **not** in `USERS`.

```diff
 	admin: { email: 'admin@veent.ph', password: 'Admin@1234' },
+	// HR-level authority without system administration — the role #237 locked out of the
+	// Settings cards. Seeded by seedProd; see prisma/seed-core.ts.
+	hr: { email: 'hr@veent.ph', password: 'Hr@1234' },
 	manager: { email: 'manager@veent.ph', password: 'Manager@1234' },
```

### 6.4 Coverage matrix — every requirement item mapped

| Requirement                                   | Covered by                                                                                                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MANAGER sees + uses card & nav entry          | e2e `Manager can find and open the Holiday Calendar`                                                                                                                               |
| HR_ADMIN sees + uses card & nav entry         | e2e `HR Admin can find and open the Holiday Calendar`                                                                                                                              |
| SUPER_ADMIN access unaffected                 | e2e `Super Admin keeps every card and nav entry it already had`                                                                                                                    |
| CEO access unaffected                         | unit `CEO gets the expected card flags` (`isSuperAdmin: true, canRoles: true`) — CEO holds both `MANAGE_HR` and `ADMINISTER_SYSTEM`, so no gate it passed before can have narrowed |
| Fix is _targeted_ (no blanket opening)        | e2e `… still does not see the system-admin cards` ×2                                                                                                                               |
| **(c)** Roles card change pinned              | unit `canRoles` column across 4 roles, longhand                                                                                                                                    |
| **(c)** Roles card no-op today                | unit: `canRoles === isSuperAdmin` for all four rows                                                                                                                                |
| **(d)** — no code change                      | nothing to pin; separate issue drafted (§3.5)                                                                                                                                      |
| The fix's premise (`/settings` = `MANAGE_HR`) | unit `opens for %s` / `stays closed to %s`                                                                                                                                         |
| Capability set math                           | already pinned — `tests/unit/rbac.test.ts:28,35,190-192`; **do not duplicate**                                                                                                     |

---

## §7 Validation gates — exact commands

CI (`.github/workflows/ci.yml`) runs `quality` and `e2e` in parallel; inside `quality` the steps are
sequential and **`pnpm format:check` runs first and gates the rest**. Reproduce in that order.

### Gate 0 — prerequisite (once per checkout)

```bash
cd /home/hyuse/Desktop/VeentApps/veent_hris
pnpm install --frozen-lockfile
pnpm exec prisma generate     # CI does this before `pnpm check`; @prisma/client types gate the typecheck
```

### Gate 1 — format (runs first in CI; a failure here masks everything after it)

```bash
pnpm format:check
```

Expected: clean. If it fails → `pnpm format`, then re-run. Watch specifically for:

- `settings/+page.svelte:86` — the Roles card one-liner must still fit `printWidth: 100`
  (98 cols with 2 tabs @ `tabWidth: 2`; `roles: true` is the same width as `super: true`).
- `settings/+page.server.ts` — the new `canRoles` line is 89 cols; it must **not** wrap.
- The holidays card object must stay multi-line (Prettier preserves the existing break after `{`).

### Gate 2 — lint

```bash
pnpm lint
```

Expected: clean. Specifically catches, if anything went wrong:

- an unused import in `settings/+page.server.ts` (none expected — `can` is still used twice);
- the `// eslint-disable-next-line @typescript-eslint/no-explicit-any` in the new unit test must be
  present _and_ actually needed (an unused disable is itself reported).

### Gate 3 — typecheck

```bash
pnpm check          # svelte-kit sync && svelte-check --tsconfig ./tsconfig.json
```

Expected: 0 errors, 0 warnings. This is the gate for the 3-member `cards` union narrowing (§5.3) and
for `data.canRoles` existing on `PageData` (it is generated from the load's return type — if step 3
of §5.6 was skipped, this fails loudly, which is the intent).

### Gate 4 — unit tests

```bash
pnpm test                                    # full suite — must stay green
pnpm exec vitest run tests/unit/settings-cards.test.ts   # focused, while iterating
pnpm exec vitest run tests/unit/rbac.test.ts             # confirm the table was NOT touched
```

Expected: full suite green; `rbac.test.ts` unchanged and passing (no capability membership moved).

### Gate 5 — e2e (needs Postgres)

```bash
# Postgres up first (see .env.dev; CLAUDE.md / the `verify` skill for the container).
pnpm db:push
pnpm db:seed:e2e                             # must run — it creates hr@veent.ph
pnpm exec playwright install chromium        # first run only
pnpm exec playwright test tests/e2e/settings-visibility.spec.ts   # focused
pnpm test:e2e                                # full suite before pushing
```

Expected: 5 new tests pass; the rest of the suite unaffected (nothing shared was touched except one
additive `USERS` entry).

### Gate 6 — manual verification (per the repo `verify` skill)

```bash
pnpm dev --port 5175                         # background; poll until curl localhost:5175/login is 200
```

Then, on the two-step tenant login (pick **Veent** first — `selectTenant` in `helpers.ts`), or via the
`DevLoginSwitcher` / `_dev/login-as` harness:

| #   | Login                                 | Expect                                                                                                                                                           |
| --- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `hr@veent.ph` / `Hr@1234`             | `/settings` shows **Holiday Calendar**; sidebar Settings group shows **Holidays**; card opens `/settings/holidays`; **no** Payroll Config, **no** Roles & Access |
| 2   | `manager@veent.ph` / `Manager@1234`   | same as #1                                                                                                                                                       |
| 3   | `admin@veent.ph` / `Admin@1234`       | Holiday Calendar **and** Payroll Config **and** Roles & Access still present; Holidays nav row still present                                                     |
| 4   | `ceo@veent.ph` / `Ceo@1234`           | unchanged from before the fix (holds both capabilities)                                                                                                          |
| 5   | `employee@veent.ph` / `Employee@1234` | no Settings group in the nav at all; `/settings` → 403                                                                                                           |

Add a holiday as `hr@veent.ph` (then delete it) to confirm the page's actions really work for the
role the card now advertises — the "HR can use a page they now find" half of the issue.

### Gate 7 — diff review before commit

```bash
git diff --stat
git diff
```

Expected exactly: 3 files changed in `src/` (+3 lines in `+page.server.ts`, 3 changed lines in
`settings/+page.svelte` incl. 1 added, 1 changed line in `+layout.svelte`), 2 new test files, 1
modified test helper. **Every changed line must trace to §5.** Anything else is scope creep — revert it.

---

## §8 Delivery

- Branch off an **updated local `staging`**: `git switch -c fix/holiday-card-gate-237`
  (never `git checkout -b origin/staging`).
- Commit subject: `fix(settings): gate the Holiday Calendar card and nav entry on MANAGE_HR (#237)`.
  Body: the mismatch, the `canRoles` hardening and why it is a no-op today, the #248 coordination
  note, and the (d) finding with its issue draft.
- **No `Co-Authored-By` / `Co-Author` trailer** (repo CLAUDE.md, explicit).
- Do not commit `.env`.
- PR into `staging`. **Merging to `staging` does not auto-close the issue** — close #237 by hand.
- File the (d) issue (§3.5) and link it from the PR.

---

# PART 2 — `[MODE: INNOVATE]` · critical review of the plan above

## §9 Where the drafted plan was wrong, and what changed

**(d) — I reversed my own first answer.** The draft leaned _fold it in_: same file, three mechanical
lines, `requireAnyCapability` already exists, project precedent (#249's payroll scope fold), and the
caller's own lean. Three measurements taken _afterwards_ killed it:

1. `requireAnyCapability` has **0 call sites** — it is dead code. That inverted "there's already a
   helper for this" into "nobody has ever adopted this pattern at the route layer."
2. **192 primary-role guards.** Converting one makes it the outlier.
3. `c844fba` (#255) — the only role-assignment path **resets `roles` to `[newRole]`**, so the bug is
   latent for every user reachable through the product.

And the decisive functional point: the narrow fold **relocates the 403 from `/settings` to eleven
subpages** rather than fixing it. A fold that doesn't fix the symptom is not a fold, it's a
half-migration. _The lesson: "same file, three lines" measured the diff, not the change._

**(c) — I nearly deferred it, and the reason I didn't is worth keeping.** The draft said "note it for
#248, don't scope-creep." What flipped it: `grep -rn MANAGE_USER_ROLES` **does not find the card**,
because the card's gate never names the capability. The hand-off would fail silently precisely
_because_ of the defect being handed off. That converts "speculative hardening" into "removing a
dependency on a coincidence" — a different category, and one YAGNI doesn't cover.

**One thing the draft got right and I re-tested rather than trusting:** the ungated cards. Assuming
`super: false` ⇒ correct would have missed that `/settings/org`, `/org-chart` and `/schedules` guard
on `requireMinRole('HR_ADMIN')`, not `MANAGE_HR`. They happen to resolve to the same set via
`ROLE_HIERARCHY`, so the audit's conclusion survives — but it survives for a reason nobody had
written down.

## §10 Alternatives considered and rejected

| #     | Alternative                                                                                                                                                                  | Why rejected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | **Bare 2-line fix**: holidays card + nav only; note the Roles coincidence for #248.                                                                                          | The safest option, and the runner-up. Rejected on §2 reason 1 only: the coincidence is invisible to the grep #248's author would run, so the note is likely to be lost exactly when it matters. Everything else about A is right, and A is the fallback if the #248 author objects to the overlap.                                                                                                                                                                                                                                                                                                  |
| **B** | **Generic `requiredCapability?: Capability` field** _(the issue's own suggestion)_.                                                                                          | Refuted four ways in §1.4. The killer: it moves the authorization decision from the server (where the guard lives) to the client, and adds an indirection layer to fix a bug _caused by_ an indirection layer.                                                                                                                                                                                                                                                                                                                                                                                      |
| **C** | **Replace `super`/`statutory`/`roles` flags with a `show:` boolean per card**, matching `+layout.svelte`'s convention (`{…, show: data.canRoles}` + `.filter(c => c.show)`). | Genuinely attractive — it handles ORs natively (which killed B), deletes the `'x' in c` narrowing dance, matches the sibling file, and each gate becomes readable next to the page it links to. **Rejected:** it rewrites all 15 card entries for a discoverability bugfix, adds `git blame` noise, makes review harder, and requires `cards` to become `$derived` (it currently references no reactive state). CLAUDE.md §3: _"Don't refactor things that aren't broken."_ **Worth filing as a standalone cleanup** — it is the real root-cause fix for the flag-drift class, just not #237's job. |
| **D** | **Delete the `super` key from the 12 `super: false` cards**, keeping it only on `/payroll/config`.                                                                           | The filter already handles absence, so it works. 12 lines of churn, zero behaviour change, and it makes the array less uniform to skim. No.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **E** | **Rename `super` → `sysadmin`** now that it has one `true` user.                                                                                                             | Pure naming churn across 13 lines. Mention-don't-change territory.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **F** | **`show: true` for the Holidays nav row** (the parent group is already `isAdmin`-gated, so this is behaviourally identical and shorter).                                     | Correct but inconsistent: rows 236-241 all spell `show: isAdmin`. The array is meant to read standalone as "who sees this row". Matching neighbours beats saving a word.                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **G** | **Widen `ADMINISTER_SYSTEM` to include HR_ADMIN/MANAGER** so the existing card gate becomes right.                                                                           | Fixes the symptom by granting system administration to two roles that must not have it — would let MANAGER into `/payroll/config`. Inverts the fix. Absolutely not.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **H** | **Hard-code the card gate as a `MANAGE_HR` check in the component** (push `roles` into `PageData`, call `canAny`).                                                           | Same client-side-authorization objection as B, plus it duplicates a check the `/settings` load already performs. Strictly worse than `super: false`.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **I** | **Extract the `cards` array into `settings/cards.ts`** so the gate logic becomes unit-testable in the `node` env.                                                            | The tempting "make it testable" move. Rejected: it invents a module to serve a test, the gate is 3 booleans the server already computes (and §6.1 pins those directly), and the e2e covers the markup. Abstraction created for a single use — CLAUDE.md §2.                                                                                                                                                                                                                                                                                                                                         |
| **J** | **First-ever Svelte component test** (`// @vitest-environment jsdom` + `@testing-library/svelte`).                                                                           | `jsdom` is not a dependency (lockfile shows it only as an optional vitest peer), so this needs a new dep + vitest config change + the repo's first component-test pattern — all to cover a 2-line markup change that a 25-line e2e already covers on real markup with real auth. Disproportionate by a wide margin.                                                                                                                                                                                                                                                                                 |
| **K** | **No test at all** — "it's a 2-line display fix, manually verify it."                                                                                                        | The whole issue _is_ a display gate silently drifting. A fix with no pinning test is one refactor away from drifting back, and #237 is the proof that nobody notices. The e2e is cheap (read-only, no fixtures, no teardown).                                                                                                                                                                                                                                                                                                                                                                       |
| **L** | **Extend `tests/e2e/admin.spec.ts`** instead of adding a file.                                                                                                               | That spec is `mode: 'serial'` with `beforeAll`/`afterAll` DB fixtures and is SUPER_ADMIN-shaped. A read-only, parallel-safe, multi-role check would inherit serial execution and teardown it doesn't need. New file is cleaner and cheaper in CI.                                                                                                                                                                                                                                                                                                                                                   |
| **M** | **Fold (d) for the whole settings surface** (index + all 13 subpages → `requireAnyCapability(user.roles, …)`).                                                               | This is the _correct_ fix for (d) and the reason the narrow fold is wrong. ~40 call sites, and it would leave 152 primary-role guards elsewhere still divergent. That is an architecture decision, not a bugfix — separate issue (§3.5).                                                                                                                                                                                                                                                                                                                                                            |
| **N** | **Fix (d) from the other end**: change the nav to use the primary role (`can(role, …)`), making it match all 192 guards.                                                     | Equally defensible, arguably _better_ (8 sites vs 192), and it would delete #133's multi-role nav support. Which end to fix from is exactly the decision that must not be made inside #237. It belongs in the (d) issue, and I have named it there as an option.                                                                                                                                                                                                                                                                                                                                    |

## §11 Residual risks, and how each is caught

| Risk                                                                           | Caught by                                                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `data.canRoles` referenced before the server provides it (§5.6 order violated) | `pnpm check` — `PageData` is generated from the load's return type                                                 |
| The 3-member union breaks `in` narrowing                                       | `pnpm check`                                                                                                       |
| New lines wrap and fail CI's first gate                                        | Gate 1, with the specific column counts to watch                                                                   |
| `hr@veent.ph` absent from the e2e DB                                           | Gate 5 — `pnpm db:seed:e2e` is called out as mandatory, not optional                                               |
| Locator collision (`Holidays` nav row vs `Holiday Calendar` card)              | `exact: true` + the §6.2 locator-safety analysis                                                                   |
| Fix accidentally opens Payroll Config / Roles to MANAGER                       | the two negative-control e2e tests                                                                                 |
| #248 lands first and also touches the Roles card                               | §2 coordination note in the PR body; conflict risk nil (disjoint files)                                            |
| Hand-written `canStatutory` matrix cell is wrong                               | flagged in-place in §6.1 (the `SUPER_ADMIN` row is deliberately wrong there); Gate 4 fails loudly if not corrected |

## §12 Final decisions (locked)

1. **(a)** Confirmed, including the nav line-number drift → **`+layout.svelte:243`**, not `:238`.
2. **(b)** Confirmed by an independent, wider audit (15 cards + 8 nav children). Holiday Calendar is
   the only mismatch. Two ungated cards match only via `ROLE_HIERARCHY` — noted, not changed.
3. **(c)** **FOLD IN.** Roles & Access card gates on `canRoles`, mirroring the page's own OR.
   No-op today, immune to #248. 5 lines.
4. **(d)** **DO NOT FOLD.** Systemic (192 sites), latent (#255 makes `roles === [role]`), and the
   narrow fold relocates the 403 rather than removing it. Separate issue drafted in §3.5.
5. **(e)** Confirmed. `super: false` + `show: isAdmin`. Generic `requiredCapability` field
   **refuted** on four grounds.
6. Total production diff: **3 files, ~7 lines** (2 of them the issue's fix, 5 the audit's finding),
   plus 2 new test files and 1 helper line.

---

# PART 3 — Numbered execution checklist

Do not start until this plan is approved. Any deviation mid-EXECUTE gets reported, not improvised.

1. `git switch staging && git pull` — confirm HEAD is at or ahead of `c524b49`.
2. `git switch -c fix/holiday-card-gate-237`.
3. `pnpm install --frozen-lockfile && pnpm exec prisma generate`.
4. **Baseline:** run `pnpm format:check && pnpm lint && pnpm check && pnpm test` — all green _before_
   any edit. A pre-existing failure must be known, not discovered later.
5. Edit `src/routes/(app)/+layout.svelte:243` — `show: isSuperAdmin` → `show: isAdmin`. (§5.5)
6. Edit `src/routes/(app)/settings/+page.svelte:84` — `super: true` → `super: false` on Holiday
   Calendar. (§5.1)
7. Edit `src/routes/(app)/settings/+page.server.ts` — add `canRoles` + its 3-line comment **after**
   `isSuperAdmin`. (§5.4) — **must precede step 8.**
8. Edit `src/routes/(app)/settings/+page.svelte:86` — Roles card `super: true` → `roles: true`; and
   `:91` — insert the `if ('roles' in c && c.roles) return data.canRoles` branch above the `super`
   fallback. (§5.2, §5.3)
9. `pnpm check` — verify `PageData` picked up `canRoles` and the 3-member union still narrows. Stop
   and re-plan if it doesn't.
10. Add `hr: { email: 'hr@veent.ph', password: 'Hr@1234' }` to `USERS` in `tests/e2e/helpers.ts`. (§6.3)
11. Write `tests/unit/settings-cards.test.ts`. (§6.1) — **cross-check every matrix cell against
    `src/lib/rbac.ts`; the `SUPER_ADMIN`/`canStatutory` cell in the draft is deliberately wrong.**
12. `pnpm exec vitest run tests/unit/settings-cards.test.ts` — green, and every row asserted for the
    right reason (not made green by editing the expectation to match the output).
13. Write `tests/e2e/settings-visibility.spec.ts`. (§6.2)
14. `pnpm format` then `pnpm format:check` — clean. (Gate 1)
15. `pnpm lint` — clean, and no unused eslint-disable. (Gate 2)
16. `pnpm check` — 0 errors, 0 warnings. (Gate 3)
17. `pnpm test` — full unit suite green; confirm `tests/unit/rbac.test.ts` was neither modified nor
    broken. (Gate 4)
18. Postgres up → `pnpm db:push && pnpm db:seed:e2e`.
19. `pnpm exec playwright test tests/e2e/settings-visibility.spec.ts` — 5 tests green. (Gate 5)
20. `pnpm test:e2e` — full suite green, no collateral. (Gate 5)
21. **Falsification pass:** temporarily revert step 6 in the working tree and re-run step 19 — the two
    "can find and open" tests **must fail**. Restore. (A regression test that passes against the bug
    is not a regression test.) Restore with `git stash pop` or by re-applying the edit — **never**
    `git checkout <file>`, which silently discards the rest of the uncommitted work.
22. `git diff` — confirm exactly the §5 lines and nothing more. (Gate 7)
23. Manual verification, all 5 rows of the Gate 6 table, including adding + deleting a holiday as
    `hr@veent.ph`.
24. Commit: `fix(settings): gate the Holiday Calendar card and nav entry on MANAGE_HR (#237)`.
    **No `Co-Authored-By` trailer.** Body covers: the mismatch, the `canRoles` hardening + why it is
    a no-op today, the #248 coordination note, the (d) finding.
25. Push; open a PR into `staging` with the §2 coordination note and the §3.5 issue draft in the body.
26. File the (d) issue from the §3.5 draft; link it from the PR.
27. After merge, **close #237 by hand** — merging to `staging` does not auto-close it.
