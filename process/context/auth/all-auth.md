---
name: context:all-auth
description: "Lucia sessions, the multi-role capability table, tenant scoping, and the separation-of-duties precedents — the auth group entrypoint/router"
keywords: auth, lucia, session, rbac, capability, role, permission, guard, separation of duties, maker checker, two-person, multi-role, tenant, organizationId, audit, propose confirm, carve-out, 403
related: [context:all-database]
date: 24-08-26
---

# Auth Context

This file is the canonical auth context entrypoint for Veent HRIS.

Use it after `process/context/all-context.md` when the task needs authentication, authorization, role/capability changes, or any two-person control.

---

## Scope

This group covers:

- Lucia v3 session auth and the shape of `locals.user`
- The capability table (`src/lib/rbac.ts`) — the single source of "which roles may do what"
- The throwing server guards (`src/lib/server/rbac.ts`)
- Multi-role semantics: a user holds a SET of roles, never one
- Tenant scoping and org switching
- The established precedents for separation of duties, and where they deliberately stop

It does not cover:

- Which columns a model has — that is `process/context/database/all-database.md`
- UI affordances that merely mirror a guard — that is `process/context/uxui/all-uxui.md`

## Read When

Read this entrypoint when:

- adding or changing a capability, or moving a role into/out of one
- writing any guard, especially one that compares two actors
- working on a two-person / maker-checker / propose-confirm control
- deciding whether a privileged role should be *prevented* or merely *detected*
- debugging a 403, or a user seeing something they should not

## The Two Mechanisms (and only two)

Issue `#282` collapsed four auth mechanisms into two. Do not add a third.

1. **`CAPABILITIES` in `src/lib/rbac.ts`** — the declarative table. `can(role, cap)` and
   `canAny(roles, cap)` read it. Used by UI to decide what to render.
2. **`requireAnyCapability(roles, cap)` in `src/lib/server/rbac.ts`** — the throwing guard. This
   is the enforcement. A UI check is never enforcement.

Roles (`Role` enum, 9): `EMPLOYEE`, `MANAGER`, `HR_ADMIN`, `SUPER_ADMIN`, `PAYROLL_OFFICER`,
`FINANCE`, `CEO`, `VERIFIER`, `APPROVER`.

## Capability Table — Current Holders

| Capability | Holders |
|---|---|
| `MANAGE_HR` | MANAGER, HR_ADMIN, SUPER_ADMIN, CEO |
| `ADMINISTER_HR_ORGWIDE` | HR_ADMIN, SUPER_ADMIN, CEO |
| `ADMINISTER_HR_RECORDS` | HR_ADMIN, SUPER_ADMIN |
| `VIEW_TEAM` | MANAGER, HR_ADMIN, SUPER_ADMIN, CEO |
| `ADMINISTER_SYSTEM` | SUPER_ADMIN, CEO |
| `OVERRIDE_FINALIZED` | **SUPER_ADMIN only** |
| `MANAGE_USER_ROLES` | **CEO only** |
| `APPROVE_REQUESTS` | MANAGER, HR_ADMIN, SUPER_ADMIN, PAYROLL_OFFICER, CEO, VERIFIER, APPROVER |
| `VERIFY_REQUESTS` | **VERIFIER only** |
| `APPROVE_SIGNOFF` | **APPROVER only** |
| `APPROVE_FINANCE` | CEO, SUPER_ADMIN |
| `MANAGE_STATUTORY_RATES` | CEO, SUPER_ADMIN |
| `PROPOSE_STATUTORY_RATES` | **HR_ADMIN only** |
| `MANAGE_PAYROLL` | MANAGER, SUPER_ADMIN, HR_ADMIN, PAYROLL_OFFICER, CEO |
| `VIEW_PAYROLL_REPORTS` | MANAGER, SUPER_ADMIN, HR_ADMIN, PAYROLL_OFFICER, FINANCE, CEO |
| `VIEW_PAY_ORGWIDE` | HR_ADMIN, SUPER_ADMIN, PAYROLL_OFFICER, FINANCE, CEO |

## The Trap That Keeps Recurring

**Capabilities say WHAT, never WHOSE.** #133 made `MANAGER` an on-branch HR role, so `MANAGE_HR`
and `VIEW_PAYROLL_REPORTS` both include MANAGER. Any check shaped
`requireMinRole('MANAGER') + if (!can(role,'MANAGE_HR'))` describes an **empty set** and silently
never runs.

Scope questions need the narrower capability plus an object-level check:

- **"may reach any employee record"** → `ADMINISTER_HR_ORGWIDE`, enforced by
  `assertCanTouchEmployee`. Never `MANAGE_HR`.
- **"may read a stranger's payslip"** → `VIEW_PAY_ORGWIDE`, then `canTouchEmployee`.
  `VIEW_PAY_ORGWIDE` is deliberately a **superset** of `ADMINISTER_HR_ORGWIDE`;
  `payslip-access.test.ts` pins that containment.

## Separation-of-Duties Precedents

Three shapes exist in this codebase. Pick the one that matches, do not invent a fourth.

1. **Same-actor comparison (#283).** Stage N's actor is compared against stage N−1's actor at
   decision time; the second attempt hard-403s. Used across the request approval chain
   (maker → verifier → approver). Requires a stored actor id on the earlier stage.
2. **Propose → confirm (#224, #220).** The proposer writes a proposal row; a different capability
   holder confirms it. `ActionProposal` and `StatutoryRateProposal` are the models. Used for
   compensation and statutory rates. Chosen where a hard block would strand the only holder.
3. **Detection, not prevention (#283 F3 carve-out).** A privileged holder may bypass a bar, and
   the audit entry is stamped when they do. The guarantee is that it is *visible*, not that it is
   *impossible*.

**Where this stops, deliberately:** `OVERRIDE_FINALIZED` is a **narrowness** control, not a
separation one — and the comment at `src/lib/rbac.ts:59-72` says so. `SUPER_ADMIN` holds
`MANAGE_PAYROLL`, `APPROVE_FINANCE` **and** `OVERRIDE_FINALIZED`, so one Super Admin can run,
approve and void the same payroll. This is open as **#298**.

The reason shape 1 is a poor fit here is a **policy** one — the same capability set legitimately
grants all three, so there is no rule being *collapsed*. Do not overstate it as a mechanical
impossibility: `PayrollRun.approvedById` and `ApprovalStep.actorId` both exist, so an
approve-vs-void comparison **is** implementable today. What is genuinely impossible without new
columns is a comparison against whoever **locked or released the period** — `PayrollPeriod` stores
no actor field at all. (Corrected 2026-08-17 after #298 RESEARCH.)

**Two traps in the payroll chain, found during #298 RESEARCH:**

- **"Approve" is not one operation.** `decidePayrollRun` (`services/approvals.ts:609`, final stage
  needs `APPROVE_FINANCE`) is separate from `lock` (`services/payroll/periods.ts:138`). **`lock` is
  what actually moves money** (commits loan/cash-advance amortization) and `release` is what makes
  payslips visible — and **both require only `MANAGE_PAYROLL`, which includes `MANAGER`.**
- **`PayrollRun.approvedById` has two writers with different meanings**: the final approver
  (`approvals.ts:673`) and whoever locked the period (`periods.ts:256`, which deliberately leaves
  the run status at `COMPUTED`). It currently means "approver **or** locker, whichever wrote last".
  Disambiguate before any rule reads it.

Clearance sign-off has **no** second-person control at all: `setClearanceItem` and
`finalizeSeparation` are both gated on `MANAGE_HR` and nothing compares their actors. Open as
**#297**. It is a checklist, not a collapsed control — there is no existing rule being defeated.

## Session and Tenancy

- Lucia v3 + `@lucia-auth/adapter-prisma`, configured in `src/lib/server/auth.ts`.
- `getUserAttributes` exposes `email`, `roles` (the full set — the only identity the app reads
  since #282), `organizationId`, `isActive`.
- `getSessionAttributes` exposes `currentOrgId` — the **active** org, which can differ from the
  user's home org.
- Org switching: `POST /api/v1/session/switch-org`. A CEO is cross-org; a control scoped to one
  tenant will not render until they switch into it.
- `requireFoodServiceOrg(organizationId)` gates JoJo Potato / Sweetleaf-only features
  (`FOOD_SERVICE_ORG_IDS` in `src/lib/orgs.ts`).
- Dev only: `POST /api/v1/_dev/login-as` with `{ email }` — the harness used for every live
  auth verification in this repo.

## Source Paths

- `src/lib/rbac.ts` — capability table, `can`, `canAny`, role labels/groups
- `src/lib/server/rbac.ts` — `requireAnyCapability`, `requireFoodServiceOrg`, payroll helpers
- `src/lib/server/auth.ts` — Lucia config
- `src/lib/server/access-guard.ts` — object-level employee checks
- `src/lib/orgs.ts` — tenant-shape constants
- `src/lib/server/audit.ts` — audit stamping

## Update Triggers

Update this group when:

- a capability is added, removed, or its holder list changes
- a new separation-of-duties shape is introduced
- session attributes or org-switching semantics change
- #298 or #297 is decided — both change this file directly

## Canonical Notes

- **A green test suite is not evidence a guard holds.** Mutation checks in #283 showed a `where`
  filter could be added to a decision query with all 1273 tests still green. Grep every *writer*
  of the state a guard reads.
- **Verify a guard live, before AND after**, with negative controls on both sides. Unit tests here
  mock the DB, so they cannot prove a query-level hole.
- Read the `actions` export, not just the handler body — a #290 review called an auth hole that
  did not exist because the guard was on the export.
- **`pnpm check` proves `actorRoles` is PRESENT on an `AuditContext`, never that it is COMPLETE.**
  `actorRoles: [user.roles[0]]` type-checks perfectly clean — it is a valid `Role[]`. Only a test
  with a genuinely multi-role fixture (e.g. a `['HR_ADMIN','MANAGER']` actor) catches a narrowed
  role set. This is the #247/#272/#275/#112 failure class and applies to **every** `AuditContext`
  writer in the codebase, not just the one it was most recently found in.
- **The audit-log report's `entityTypes` array is hand-maintained and nothing type-checks it.**
  (`src/routes/(app)/reports/audit-log/+page.server.ts`.) A feature can write correct
  `AuditLog` rows for a new entity and still have those rows be unfilterable in the report because
  no one added the entity's name to this array. Missed twice now — `PayrollPeriod` until #298,
  `HrComplaint` until #112. Any new entity type that starts being audited must add itself here.
