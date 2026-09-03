---
name: plan:ui-ux-overhaul-phase-02-nav-ia
description: "Phase 02 of the UI/UX overhaul — sectioned sidebar, canonical labels, nav/guard parity table, count pill and nav a11y in (app)/+layout.svelte"
date: 03-09-26
feature: ui-ux-overhaul
phase: "02"
---

# Phase 02 — Navigation + Information Architecture

**Date**: 03-09-26
**Status**: ACTIVE — planned, not started
**Complexity**: COMPLEX (phase 02 of a phase program)
**Feature**: ui-ux-overhaul

## Overview

Context: the audit scored "recognition rather than recall" 2/10 — an HR_ADMIN meets ~20 ungrouped
top-level rows, duplicate labels, and a hand-maintained active-state exception list. This phase
fixes the shell's information architecture only: it resorts the existing nav array into labelled
sections, makes labels canonical, and hardens the nav/guard parity story. No server file, schema,
dependency, or route changes.

**TL;DR** — Resort the flat 20-item sidebar into six labelled sections, rename the approval rows by
task, drop the duplicate `/payroll` row, nest Eval Templates under Performance, replace the
active-state exception list with longest-prefix matching, and swap the red dot for a count pill.
The nav config moves into a testable `src/lib/nav.ts`. **The `ADMINISTER_HR_ORGWIDE` gate flip
lands on ZERO items this phase** — the guard audit below shows every admin route still guards on
`MANAGE_HR`, so flipping nav alone would make the sidebar lie about what the server allows. That
becomes a backlog item, not a silent change.

Upstream requirements: `docs/ui-ux-audit-2026-09-03.md` §T1 plus the shell findings in §4. No
separate SPEC file exists for this program; §T1 + the INNOVATE binding decisions are the locked
requirements, restated as acceptance criteria N1–N9 below.

---

## Goals

1. A user can find any destination by scanning six short labelled lists instead of one 20-row scroll.
2. One canonical label per destination — the sidebar label equals the page title.
3. Nav visibility and server guards keep reading the same capability table (the audit's #1 strength).
4. No role gains reach. `MANAGER` in particular gains nothing.
5. The active-state rule is one expression, not a hand-maintained exception list.

## Non-Goals (explicitly out of scope)

| Deferred to | Item |
|---|---|
| Phase 06 | Dashboard "awaiting you" aggregator and the summed cross-surface badge |
| Phase 07 | Settings hub grid regroup, settings sub-nav, payroll sub-nav, settings label reconciliation |
| Phase 08 | Mobile drawer focus trap, sidebar collapse control |
| Separate security plan | Any change to a route's `+page.server.ts` guard capability |

Also out of scope here: renaming `/complaints` → `/inquiries` (route change), the `/approvals`
308-redirect fix (P0-1, belongs with the routing phase), and the 24 inline SVGs → icon module
refactor (only 2 icon paths change here).

---

## Touchpoints

| File | Change |
|---|---|
| `src/routes/(app)/+layout.svelte` | Nav config extracted out; render loop rewritten for sections; group header label, count pill, `aria-current`, `aria-label` |
| `src/lib/nav.ts` | **NEW** — `buildNavSections(ctx)`, `isNavItemActive(pathname, href, allHrefs)`, exported types |
| `tests/unit/nav-sections.test.ts` | **NEW** — section/role/active-state/parity tests |
| `src/lib/rbac.ts` | **READ ONLY** — no edit. Capability table is the source both sides read. |
| `src/routes/(app)/**/+page.server.ts` | **READ ONLY** — guards audited below, none changed |

Read-only inputs already gathered: `src/lib/orgs.ts` (`isFoodServiceOrg`), `docs/ui-ux-audit-2026-09-03.md`.

---

## Nav array reorganization — exact before/after

### Before (order as rendered today, `+layout.svelte:113-262` + groups)

`Punch` → `Dashboard` → `Timesheets` → `Attendance` → `Leave` → `My Requests` (becomes the
`Requests/Approvals` group when `canApprove`) → `Payslips` → `Profile` → `Performance` →
`Eval Templates` → `Inquiries` → `Team|Branches` → `Employees` → `Departments` → `Stores` →
`Payroll` → `Separations` → `Recruitment` → `Reports` → `Benefits` → `Inventory` → `Settings` group.

### After — six sections

Section headers render as a non-interactive label row above their items. A section whose items all
filter out is not rendered at all (no empty header).

**Section 1 — "My Work"**

| # | Label | href | `show` condition | Change |
|---|---|---|---|---|
| 1 | Punch | `/punch` | `hasBranches` | unchanged (food-service preserved) |
| 2 | Dashboard | `/dashboard` | `true` | unchanged |
| 3 | My Requests | `/requests` | `true` **and NOT** `canApprove` | flat link only for non-approvers (existing behaviour, now explicit) |
| 4 | *Approvals group* | — | `canApprove` | header renamed from "Requests/Approvals" → **"Approvals"**; children below |
| 5 | Payslips | `/payslips` | `true` | unchanged |
| 6 | Inquiries | `/complaints` | `true` | unchanged label + badge (route rename deferred) |
| 7 | Profile | `/profile` | `true` | unchanged |

**Approvals group children** (collapsible group KEEPS its current code + toggle pattern):

| # | Before label | After label | href | `show` | badge |
|---|---|---|---|---|---|
| 1 | My Requests | **My Requests** | `/requests` | `true` | `0` |
| 2 | Timesheets | **Approve timesheets** | `/requests/timesheets` | `isManager` | `data.pendingApprovals.timesheets` |
| 3 | Requests | **Approve requests** | `/requests/approvals` | `canApprove` | `data.pendingApprovals.requests` |
| 4 | Pay changes | **Pay changes** | `/requests/proposals` | `canConfirmPayChanges` | `data.pendingApprovals.proposals` |
| 5 | Payroll runs | **Payroll runs** | `/payroll` | `canSignOff` | `data.pendingApprovals.payrollRuns` |

**Section 2 — "Time"**

| # | Label | href | `show` | Change |
|---|---|---|---|---|
| 1 | Timesheets | `/timesheets` | `true` | moved out of the top block |
| 2 | Attendance | `/attendance` | `true` | moved |
| 3 | Leave | `/leave` | `true` | moved |

**Section 3 — "People"**

| # | Label | href | `show` | Change |
|---|---|---|---|---|
| 1 | Team / Branches | `/team` | `isManager` | label stays tenant-conditional (`hasBranches ? 'Branches' : 'Team'`) |
| 2 | Employees | `/employees` | `isAdmin` | moved only |
| 3 | Departments | `/departments` | `isAdmin` | moved only |
| 4 | Recruitment | `/recruitment` | `isAdmin` | moved only |
| 5 | Separations | `/separations` | `isAdmin` | moved only |
| 6 | Benefits | `/benefits` | `isAdmin` | moved only |

**Section 4 — "Pay"**

| # | Label | href | `show` | Change |
|---|---|---|---|---|
| 1 | Payroll | `/payroll` | **`isPayroll`** (was `isPayroll \|\| canSignOff`) | **duplicate row dropped** for canSignOff-only roles; they keep "Payroll runs" inside Approvals |
| 2 | Reports | `/reports` | `canViewReports` | moved only |

**Section 5 — "Performance"**

| # | Label | href | `show` | Change |
|---|---|---|---|---|
| 1 | Performance | `/performance` | `true` | moved |
| 2 | ↳ Eval Templates | `/performance/templates` | `canAny(roles,'ADMINISTER_HR_ORGWIDE')` | **nested** — rendered as an indented child row (`ml-4 border-l pl-3`, no icon), same styling as group children. `show` condition UNCHANGED. |

**Section 6 — "Organization"**

| # | Label | href | `show` | Change |
|---|---|---|---|---|
| 1 | Stores | `/branches` | `isAdmin && hasBranches` | moved only; label stays "Stores" (#182 clash rule preserved) |
| 2 | Inventory | `/inventory` | `isAdmin` | moved only |
| 3 | *Settings group* | — | `showSettings` | collapsible group KEEPS its current code; only its render position moves into this section. Child labels untouched (phase 07 owns them). |

**Net capability deltas across the whole nav: exactly one** — `/payroll` top-level narrows from
`isPayroll || canSignOff` to `isPayroll`. Nothing widens.

---

## Per-route guard verification table (D2 — the gate flip)

Read from each route's own `+page.server.ts` on 03-09-26. `MANAGE_HR` holders =
MANAGER, HR_ADMIN, SUPER_ADMIN, CEO. `ADMINISTER_HR_ORGWIDE` holders = HR_ADMIN, SUPER_ADMIN, CEO.

| Nav item | Current nav gate | Route server guard (evidence) | Verdict |
|---|---|---|---|
| Employees | `isAdmin` (MANAGE_HR) | `VIEW_TEAM` at `employees/+page.server.ts:18`; `MANAGE_HR` on actions `:69` | **needs-guard-alignment** — nav is already NARROWER than the load guard. Do not touch. |
| Departments | `isAdmin` | `MANAGE_HR` `departments/+page.server.ts:18` | **needs-guard-alignment** — flipping nav alone hides a page MANAGER may still open |
| Stores (`/branches`) | `isAdmin && hasBranches` | `MANAGE_HR` + `requireFoodServiceOrg` `branches/+page.server.ts:18-19` | **needs-guard-alignment** |
| Separations | `isAdmin` | `MANAGE_HR` `separations/+page.server.ts:10` | **needs-guard-alignment** |
| Recruitment | `isAdmin` | `MANAGE_HR` `recruitment/+page.server.ts:17` | **needs-guard-alignment** |
| Benefits | `isAdmin` | `MANAGE_HR` `benefits/+page.server.ts:16` | **needs-guard-alignment** |
| Inventory | `isAdmin` | `MANAGE_HR` `inventory/+page.server.ts:17` | **needs-guard-alignment** |
| Settings (group + `/settings`) | `isAdmin` | `MANAGE_HR` `settings/+page.server.ts:6` | **needs-guard-alignment** |
| Settings → Company | `isAdmin` | `MANAGE_HR` `settings/company:9` | **needs-guard-alignment** |
| Settings → Earnings & Deductions | `isAdmin` | `MANAGE_HR` `settings/pay-codes:15` | **needs-guard-alignment** |
| Settings → Salary Grades | `isAdmin` | `MANAGE_HR` `settings/salary-grades:15` | **needs-guard-alignment** |
| Settings → Org Structure | `isAdmin` | `MANAGE_HR` `settings/org:17` | **needs-guard-alignment** |
| Settings → Schedules | `isAdmin` | `MANAGE_HR` `settings/schedules:20` | **needs-guard-alignment** |
| Settings → Holidays | `isAdmin` | `MANAGE_HR` `settings/holidays:9` | **needs-guard-alignment** |
| Settings → Roles | `isSuperAdmin \|\| canManageUserRoles` | `MANAGE_USER_ROLES \|\| ADMINISTER_SYSTEM` `settings/roles:14-16` | **already aligned** — no change |
| Eval Templates | `ADMINISTER_HR_ORGWIDE` | `ADMINISTER_HR_ORGWIDE` `performance/templates:28` | **already flipped** — no change |
| Team | `isManager` (VIEW_TEAM) | `VIEW_TEAM` `team/+page.server.ts:10` | **already aligned** |
| Reports | `canViewReports` | `MANAGE_HR \|\| VIEW_PAYROLL_REPORTS` `reports:14-16` | **already aligned** (nav narrower, deliberate) |
| Payroll | `isPayroll \|\| canSignOff` → `isPayroll` | `MANAGE_PAYROLL \|\| signOff` `payroll/+layout.server.ts:15-18` | **safe-to-flip** — the sign-off row still exists inside Approvals, so no destination is lost |
| Pay changes | `canConfirmPayChanges` | route gates on the same two capabilities (#243) | **already aligned** |

**Verdict for D2: flip nothing this phase.** Every candidate item is `needs-guard-alignment`.
Flipping nav to `ADMINISTER_HR_ORGWIDE` while the route still admits `MANAGE_HR` would break the
invariant the audit calls the system's #1 strength — nav and guard reading one table — in the
*other* direction: MANAGER would keep server access to a page the sidebar denies. That is a
discoverability lie, and the correct repair is a paired guard change, which is a security change
and needs its own SPEC and its own tests.

**Action:** write a backlog stub
`process/features/ui-ux-overhaul/backlog/manager-admin-nav-gate-alignment_NOTE_03-09-26.md`
recording the 14 `needs-guard-alignment` routes, and leave the nav gates exactly as they are.
Phase 02 delivers the audited table as its evidence, not a flip.

---

## Public Contracts

- **`src/lib/nav.ts` (new module).** Exports `buildNavSections(ctx: NavContext): NavSection[]` and
  `isNavItemActive(pathname: string, href: string, allHrefs: string[]): boolean`, plus the
  `NavContext` / `NavSection` / `NavItem` types. `NavContext` carries only plain values —
  `roles: Role[]`, `hasBranches: boolean`, `pendingApprovals`, `waitingInquiries` — so the module
  is pure and unit-testable with no Svelte or SvelteKit import.
- **No route, load-function, form-action, or API contract changes.** No server file is edited.
- **Rendered DOM contract changes** (things e2e/Playwright locators can see): the group header text
  `Requests/Approvals` → `Approvals`; child link names `Timesheets` → `Approve timesheets` and
  `Requests` → `Approve requests`; a new count `<span>` replaces the red dot `<span>`; new section
  header rows; `aria-current="page"` on the active link; `aria-label="Main"` on `<nav>`.

---

## Blast Radius

- **Files changed:** 2 edited (`+layout.svelte`, plus 1 new `src/lib/nav.ts`), 1 new test file. No
  server files, no schema, no migrations, no deps.
- **Packages:** single app (`src`). No workspace fan-out.
- **Surfaces reached:** every authenticated page renders this layout, so a compile error here is a
  total outage of `(app)`. Mitigated by `pnpm check` + a live load of `/dashboard`.
- **Risk class:** medium. It is *auth-adjacent* — nav visibility mirrors capabilities — but no
  guard, capability, or server file is modified, so no enforcement path changes. The single
  capability delta is a narrowing.
- **Known locator dependants:** `tests/e2e/settings-visibility.spec.ts` asserts settings card and
  `Holidays` child link names — all unchanged by this phase. `tests/e2e/dashboard.spec.ts` clicks
  dashboard card links, not sidebar links. No spec asserts the strings this phase renames; confirm
  with the grep in step 12 before calling done.

---

## Implementation Checklist

1. Create `src/lib/nav.ts`. Define `NavItem` (`href`, `label`, `show`, `icon?`, `badge?`,
   `child?: boolean`), `NavSection` (`label: string`, `items: NavItem[]`), and `NavContext`
   (`roles: Role[]`, `hasBranches: boolean`, `pendingApprovals: { timesheets; requests; proposals; payrollRuns; total }`,
   `waitingInquiries: number`).
2. In `src/lib/nav.ts`, port the capability derivations verbatim from `+layout.svelte:92-111`
   (`isManager`, `isAdmin`, `isSuperAdmin`, `canManageUserRoles`, `isPayroll`, `canViewReports`,
   `canSignOff`, `canApprove`, `canConfirmPayChanges`) as local consts inside `buildNavSections`,
   using `canAny` from `$lib/rbac`. Keep every explanatory comment — they carry issue numbers.
3. In `buildNavSections`, build the six sections in the exact order and membership of the
   "After — six sections" tables above. Each section filters its own items on `show`; sections with
   zero items are dropped from the returned array.
4. Copy every existing `icon` path string across unchanged EXCEPT the two below (audit §4, shell —
   three concepts share one clipboard path):
   - Approvals group icon → heroicons v2 outline **inbox**:
     `M2.25 13.5h3.86a2.25 2.25 0 012.012 1.244l.256.512a2.25 2.25 0 002.013 1.244h3.218a2.25 2.25 0 002.013-1.244l.256-.512a2.25 2.25 0 012.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 00-2.15-1.588H6.911a2.25 2.25 0 00-2.15 1.588L2.35 13.177a2.25 2.25 0 00-.1.661z`
   - Eval Templates → heroicons v2 outline **document-check**:
     `M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25h.375a9 9 0 019 9v.375M10.125 2.25A3.375 3.375 0 0113.5 5.625v1.5c0 .621.504 1.125 1.125 1.125h1.5a3.375 3.375 0 013.375 3.375M9 15l2.25 2.25L15 12`
     (Eval Templates renders as an indented child with no icon — keep the path exported but unused
     only if the child style keeps icons; otherwise drop it. Requirement is that the three
     concepts no longer share one glyph.)
   `My Requests` keeps the original clipboard path.
5. In `src/lib/nav.ts`, implement `isNavItemActive(pathname, href, allHrefs)`:
   returns `true` when (`pathname === href` or `pathname.startsWith(href + '/')`) **and** no other
   entry in `allHrefs` that also matches is longer than `href`. Longest-prefix-wins removes the
   `/dashboard` and `/performance` exception list at `+layout.svelte:587-590` and stops
   `/payroll` + `/performance` double-highlighting.
6. In `+layout.svelte`, replace the `navItems` `$derived` block with
   `const navSections = $derived(buildNavSections({ roles, hasBranches, pendingApprovals: data.pendingApprovals, waitingInquiries: data.waitingInquiries }))`
   and `const allNavHrefs = $derived(navSections.flatMap(s => s.items.map(i => i.href)))`.
   Delete the inlined capability consts that moved into `nav.ts`, keeping only those the rest of
   the layout still uses (`canApprove`, `showSettings`, `inSettings`, `inRequests`, toggles).
7. In `+layout.svelte`, rewrite the render loop: outer `{#each navSections as section (section.label)}`
   emitting `<div role="group" aria-labelledby={headerId}>` with a header
   `<div id={headerId} class="px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{section.label}</div>`
   then the existing inner `{#each section.items as item (item.href)}` body unchanged apart from
   steps 8–11. `headerId` = `nav-section-` + slugified label.
8. In the item body, replace the `{@const active = ...}` exception expression with
   `{@const active = isNavItemActive($page.url.pathname, item.href, allNavHrefs)}` and add
   `aria-current={active ? 'page' : undefined}` to the `<a>`.
   Constraint: `{@const}` must stay an immediate child of the `{#if}`/`{#each}` block tag.
9. In the item body, render an item with `child: true` using the group-child styling
   (`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm`, wrapped in
   `mt-0.5 space-y-0.5 border-l border-border pl-3 ml-4`) and no icon `<svg>`.
10. Keep the `{#if item.href === '/requests' && canApprove}` branch that renders the Approvals
    collapsible group, with its toggle, `requestsExpanded`, and child loop unchanged, and:
    - change the header text `Requests/Approvals` → `Approvals`;
    - replace the red dot at `+layout.svelte:539-543` with the numeric pill markup already used for
      top-level badges:
      `<span class="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-primary-foreground" aria-label="{data.pendingApprovals.total} awaiting your decision">{data.pendingApprovals.total}</span>`
      shown under the same condition (`total > 0 && !requestsExpanded`).
    - add `aria-current` to the active child link the same way as step 8 (child match stays exact).
11. Move the `{#if showSettings}` Settings group block from after the nav loop into the
    "Organization" section render position. Its internal markup, children array, toggle state, and
    labels are unchanged. Simplest mechanism: render it inside the section loop when
    `section.label === 'Organization'`, after that section's items.
12. Add `aria-label="Main"` to the sidebar `<nav>` element. Then run
    `grep -rn "Requests/Approvals\|name: 'Requests'\|name: 'Timesheets'" tests/` and update any
    locator the renames broke (expected: none).
13. Create `tests/unit/nav-sections.test.ts` per the Verification Evidence table below.
14. Create the backlog stub
    `process/features/ui-ux-overhaul/backlog/manager-admin-nav-gate-alignment_NOTE_03-09-26.md`
    listing the 14 `needs-guard-alignment` routes and why the flip was not made.
15. Run the full gate set (see Exit Criteria) and the role-matrix live check.

---

## Verification Evidence

TDD: write the step-13 tests first, red, then implement steps 1–12.

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm test tests/unit/nav-sections.test.ts` — section labels and order are exactly `My Work, Time, People, Pay, Performance, Organization` for HR_ADMIN | Fully-Automated | N1 sectioned nav |
| Same suite — EMPLOYEE sees only `My Work`, `Time`, `Performance` sections and zero `isAdmin` hrefs | Fully-Automated | N4 no reach gained |
| Same suite — MANAGER's item set is byte-identical to the pre-change MANAGER set minus nothing (fixture snapshot of hrefs) | Fully-Automated | N4 MANAGER unchanged |
| Same suite — a canSignOff-only role (VERIFIER) gets NO top-level `/payroll` item and DOES get the `Payroll runs` child | Fully-Automated | N5 duplicate row dropped |
| Same suite — parity: every item's gating capability is in a hand-written `ROUTE_GUARDS` fixture and each nav gate is equal-or-narrower than the route guard | Fully-Automated | N3 nav/guard parity |
| Same suite — `isNavItemActive('/performance/templates', '/performance', hrefs) === false` and `(…, '/performance/templates', hrefs) === true`; `('/dashboard/x', '/dashboard', hrefs)` behaves per longest-prefix | Fully-Automated | N6 no exception list |
| Same suite — non-food-service context yields no `/punch` and no `/branches`; food-service yields both and label `Branches` for `/team` | Fully-Automated | N8 tenant conditionals preserved |
| Same suite — child labels are `My Requests, Approve timesheets, Approve requests, Pay changes, Payroll runs` | Fully-Automated | N2 canonical labels |
| `pnpm test:e2e tests/e2e/settings-visibility.spec.ts` green (precondition: seeded DB + built preview per `all-tests.md`) | Hybrid | N9 no locator regression |
| Role-matrix live check: log in via `POST /api/v1/_dev/login-as` as HR_ADMIN, MANAGER, EMPLOYEE, CEO; screenshot the sidebar for each; assert section headers present, no empty header, `aria-current` on exactly one link, count pill shows a number not a dot | Agent-Probe | N1, N4, N7 |
| Live load of `/dashboard` and `/performance/templates` in a real browser after the change | Agent-Probe | layout compiles and renders (per uxui context: green tests never proved a page loads) |
| Sidebar collapse control, mobile drawer focus trap | Known-Gap → phase 08 backlog | not developed behaviour this phase; gate stays CONDITIONAL on phase 08 |

Failing stubs (red-first, for the fully-automated rows):

```
test("should return sections in order My Work, Time, People, Pay, Performance, Organization for HR_ADMIN", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: section labels and order")
})
test("should give a canSignOff-only role no top-level /payroll item", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: duplicate payroll row dropped")
})
test("should keep every nav gate equal-or-narrower than its route guard", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: nav/guard parity")
})
test("should mark only the longest matching href active", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: longest-prefix active matching")
})
```

### Acceptance criteria (N1–N9)

- **N1** Sidebar renders six labelled sections; no empty section header appears for any role.
  *proven by:* section-order + role-matrix probe. *strategy:* Fully-Automated + Agent-Probe.
- **N2** Approval rows read by task; group header reads "Approvals". *proven by:* child-label test.
  *strategy:* Fully-Automated.
- **N3** Every nav gate is equal to or narrower than its route's server guard; the 14
  `needs-guard-alignment` routes are recorded in a backlog stub. *proven by:* parity test + the
  guard table in this plan. *strategy:* Fully-Automated.
- **N4** No role gains a destination; MANAGER's set is unchanged. *proven by:* MANAGER href
  snapshot + EMPLOYEE test. *strategy:* Fully-Automated.
- **N5** Sign-off-only roles see `/payroll` once, inside Approvals. *proven by:* VERIFIER test.
  *strategy:* Fully-Automated.
- **N6** Active state is one expression; `/performance` and `/performance/templates` never both
  highlight. *proven by:* `isNavItemActive` tests. *strategy:* Fully-Automated.
- **N7** Approvals group shows a numeric count pill (not a dot), `<nav aria-label="Main">` exists,
  the active link carries `aria-current="page"`, and the three former clipboard-twins have distinct
  icons. *proven by:* role-matrix probe + DOM assertions in it. *strategy:* Agent-Probe.
- **N8** `Punch`, `Stores`, and the `Team`/`Branches` label stay tenant-conditional.
  *proven by:* food-service context test. *strategy:* Fully-Automated.
- **N9** No existing e2e locator breaks. *proven by:* `settings-visibility.spec.ts` + the step-12
  grep. *strategy:* Hybrid.

### Exit criteria

1. Full CI gate set green, in CI's order: `pnpm format:check` → `pnpm lint` → `pnpm check` →
   `pnpm test`. (CI runs format first and skips the rest on failure — a green `pnpm check` alone
   proves nothing.)
2. `impeccable` audit pass on the changed sidebar.
3. Role-matrix live check passed for HR_ADMIN / MANAGER / EMPLOYEE / CEO with screenshots attached
   to the phase report.
4. Backlog stub for the guard-alignment gap exists.

## Test Infra Improvement Notes

(none identified yet)

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| A compile error in `+layout.svelte` takes down every authenticated page | `pnpm check` plus a real browser load of `/dashboard` before calling done |
| `{@const}` moved outside a block tag → compile error | Step 8 states the constraint; it is a known repo trap |
| An e2e locator matched a renamed string | Step 12 grep, plus the `settings-visibility` run |
| Longest-prefix matching accidentally deactivates a legitimate row | Explicit unit cases for `/performance`, `/performance/templates`, `/payroll`, `/requests`, `/dashboard` |
| Nav narrower than guard is read as "MANAGER lost access" | It has not: no server file changes. Documented in the backlog stub. |

## Rollback

Single commit, two files plus one test file, no schema and no server change. `git revert` of the
phase commit restores the previous sidebar with zero data or migration impact.

## Dependencies

- Depends on: Phase 01 output only insofar as it must not have edited `(app)/+layout.svelte`;
  re-run `git log -1 --stat -- "src/routes/(app)/+layout.svelte"` at phase entry to confirm.
- Blocks: Phase 06 (dashboard aggregator reads `pendingApprovals` shape unchanged here) and
  Phase 07 (settings/payroll sub-nav sits inside the Organization / Pay sections this phase creates).

---

## Phase Completion Rules

- `CODE DONE` = checklist steps 1–14 applied and `pnpm check` green. Not `VERIFIED`.
- `VERIFIED` requires ALL of: the full CI gate set green in CI's order, the role-matrix live check
  passed for all four roles with screenshots in the phase report, the `impeccable` audit pass, the
  backlog stub written, and a validate-contract recorded for this phase.
- The Known-Gap row (sidebar collapse / mobile focus trap) keeps its gate CONDITIONAL and is
  carried to phase 08; it may never be used to declare this phase's nav behaviour proven.
- If any regression appears in `settings-visibility.spec.ts` or a live page fails to load, the
  phase stays on itself — do not advance.

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-02-nav-ia_PLAN_03-09-26.md`
2. **Last completed step:** none — plan written, execution not started.
3. **Validate-contract status:** pending (PVL has not run).
4. **Context files loaded:** `process/context/all-context.md`, `process/context/planning/all-planning.md`,
   `process/context/uxui/all-uxui.md`, `process/context/tests/all-tests.md`,
   `docs/ui-ux-audit-2026-09-03.md` §T1 + §4, `src/routes/(app)/+layout.svelte`, `src/lib/rbac.ts`,
   and the 20 `+page.server.ts` guards listed in the guard table.
5. **Next step for a fresh agent:** run PVL on this plan; then start at checklist step 13
   (write the failing tests) before step 1.
