---
name: note:manager-admin-nav-gate-alignment
description: "14 routes where the sidebar gate and the route's own load guard would diverge if nav flipped to ADMINISTER_HR_ORGWIDE — a paired server-guard change, not a nav change"
date: 03-09-26
feature: ui-ux-overhaul
---

# MANAGER / `ADMINISTER_HR_ORGWIDE` nav-gate alignment

**Status**: BACKLOG — needs its own SPEC, its own tests, and an owner ruling (umbrella
OWNER-DECISION O1).
**Raised by**: phase 02 (Navigation + IA), checklist step 14.

## What this is

Phase 02 audited every nav item against the guard in its own `+page.server.ts` and flipped
**zero** gates. This note records why, and the exact list a future change has to move.

The audit's #1 named strength is that the sidebar and the server read one capability table
(`src/lib/rbac.ts`). Flipping a nav row from `MANAGE_HR` to `ADMINISTER_HR_ORGWIDE` while the
route still admits `MANAGE_HR` breaks that invariant in the quieter direction: MANAGER keeps
server access to a page the sidebar denies them. The page is then reachable by URL, by an old
bookmark, and by any in-app link — it is just undiscoverable. That is a worse state than today,
and the repair is a **paired** change: nav gate and route guard move together, in one commit,
with a per-role test.

A guard change is a security change. It does not belong inside an information-architecture
phase.

## The 14 routes

Each row's guard was read from source on 03-09-26; the line number is the guard call site.

| # | Route | Nav gate today | Route load guard | File:line |
|---|---|---|---|---|
| 1 | `/employees` | `MANAGE_HR` | `VIEW_TEAM` | `src/routes/(app)/employees/+page.server.ts:14` |
| 2 | `/departments` | `MANAGE_HR` | `MANAGE_HR` | `src/routes/(app)/departments/+page.server.ts:18` |
| 3 | `/branches` (Stores) | `MANAGE_HR` + food-service | `MANAGE_HR` + `requireFoodServiceOrg` | `src/routes/(app)/branches/+page.server.ts:18-19` |
| 4 | `/separations` | `MANAGE_HR` | `MANAGE_HR` | `src/routes/(app)/separations/+page.server.ts:10` |
| 5 | `/recruitment` | `MANAGE_HR` | `MANAGE_HR` | `src/routes/(app)/recruitment/+page.server.ts:17` |
| 6 | `/benefits` | `MANAGE_HR` | `MANAGE_HR` | `src/routes/(app)/benefits/+page.server.ts:16` |
| 7 | `/inventory` | `MANAGE_HR` | `MANAGE_HR` | `src/routes/(app)/inventory/+page.server.ts:17` |
| 8 | `/settings` (group + index) | `MANAGE_HR` | `MANAGE_HR` | `src/routes/(app)/settings/+page.server.ts:6` |
| 9 | `/settings/company` | `MANAGE_HR` | `MANAGE_HR` | `src/routes/(app)/settings/company/+page.server.ts:9` |
| 10 | `/settings/pay-codes` | `MANAGE_HR` | `MANAGE_HR` | `src/routes/(app)/settings/pay-codes/+page.server.ts:15` |
| 11 | `/settings/salary-grades` | `MANAGE_HR` | `MANAGE_HR` | `src/routes/(app)/settings/salary-grades/+page.server.ts:15` |
| 12 | `/settings/org` | `MANAGE_HR` | `MANAGE_HR` | `src/routes/(app)/settings/org/+page.server.ts:17` |
| 13 | `/settings/schedules` | `MANAGE_HR` | `MANAGE_HR` | `src/routes/(app)/settings/schedules/+page.server.ts:20` |
| 14 | `/settings/holidays` | `MANAGE_HR` | `MANAGE_HR` | `src/routes/(app)/settings/holidays/+page.server.ts:9` |

`MANAGE_HR` holders = MANAGER, HR_ADMIN, SUPER_ADMIN, CEO.
`ADMINISTER_HR_ORGWIDE` holders = HR_ADMIN, SUPER_ADMIN, CEO. **MANAGER is the whole delta.**

Row 1 is a special case worth keeping separate: `/employees` nav is ALREADY narrower than its
load guard (`MANAGE_HR` vs `VIEW_TEAM`), a deliberate pre-existing choice. Its page-level
actions carry `MANAGE_HR` at `:69`. Moving it needs a decision about the read view, not just
the gate.

## Not on this list (already correct — do not touch)

- `/settings/roles` — nav `ADMINISTER_SYSTEM || MANAGE_USER_ROLES`, guard the same (`roles:14-16`).
- `/performance/templates` — both sides already `ADMINISTER_HR_ORGWIDE` (`templates:28`).
- `/team` — both sides `VIEW_TEAM` (`team:10`).
- `/reports` — nav `VIEW_PAYROLL_REPORTS`, guard `MANAGE_HR || VIEW_PAYROLL_REPORTS`; nav is
  narrower on purpose.
- `/reports/audit-log` — both sides `MANAGE_HR`.
- `/payroll` — phase 02 narrowed the top-level nav row to `MANAGE_PAYROLL`. No destination was
  lost: sign-off roles still reach it through "Payroll runs" inside Approvals.

## What a fix has to include

1. An owner ruling on the actual question: **should a MANAGER reach org settings and the org-wide
   HR pages at all?** The capability names already answer it (`ADMINISTER_HR_ORGWIDE` exists
   precisely because `MANAGE_HR` swallowed MANAGER in #133) — but flipping 14 routes changes what
   a live role can do, so it is the owner's call, not a refactor.
2. Nav gate and `requireAnyCapability` moved in the **same** commit, per route.
3. A per-role test proving MANAGER gets a 403 and HR_ADMIN does not, for each moved route.
   `tests/unit/nav-sections.test.ts` already pins the nav half and its `ROUTE_GUARDS` fixture
   (with a `readFileSync` staleness canary) will fail loudly if only one side moves.
4. A sweep for in-app links into these pages that a MANAGER can still see — dashboard cards, the
   settings index grid, employee-detail links. Hiding the sidebar row is not hiding the page.
