---
name: report:ui-ux-overhaul-phase-02-nav-ia
description: "EXECUTE report for phase 02 (nav + IA) — six-section sidebar, src/lib/nav.ts, 23 new unit tests; CODE DONE, live verification deferred"
date: 03-09-26
phase: "02"
status: COMPLETE_WITH_GAPS
feature: ui-ux-overhaul
plan: process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-02-nav-ia_PLAN_03-09-26.md
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: "02"
---

# Phase 02 — Navigation + Information Architecture — EXECUTE report

**Date**: 03-09-26
**Branch**: `feat/uiux-phase-1-2`
**Status**: **CODE DONE**, not VERIFIED. Checklist steps 1–14 applied and the full CI gate set is
green. The three Agent-Probe / Hybrid rows (role-matrix live check, live page loads, e2e) and the
`impeccable` audit are deferred to the owner's manual pass, per the execute handoff.

**TL;DR** — The 20-row flat sidebar is now six labelled sections built by a pure, unit-tested
`src/lib/nav.ts`. 23 new tests pin section order, per-role membership, nav/guard parity (with a
`readFileSync` staleness canary), and longest-prefix active matching. Zero gate flips, one
narrowing (`/payroll` top-level). All four CI gates green, 2208 tests.

---

## What was done

Checklist steps 1–14, all applied.

| Step | Outcome |
|---|---|
| 1–2 | `src/lib/nav.ts` created: `NavItem` / `NavSection` / `NavContext` types, capability derivations ported verbatim with their issue-number comments. Pure — imports only `canAny` from `$lib/rbac` and the `Role` type. No Svelte, no `$app/*`. |
| 3 | `buildNavSections` returns the six sections in plan order; each filters its own items on `show`; empty sections are dropped from the array. |
| 4 | Icon paths copied across unchanged. Approvals moved to the heroicons inbox glyph (exported as `APPROVALS_ICON`). Eval Templates' clipboard path **deleted**, not replaced (E5). `My Requests` keeps the clipboard — a test now asserts no two items share a glyph. |
| 5 | `isNavItemActive(pathname, href, allHrefs)` — segment-boundary match, longest matching href wins. The `/dashboard` + `/performance` exception list is gone. |
| 6 | Layout's `navItems` block replaced by `navSections` + `allNavHrefs`. Five capability consts moved out (`isManager`, `isPayroll`, `canViewReports`, `canSignOff`, `canConfirmPayChanges`); four stay because the layout still renders with them (`isAdmin`, `isSuperAdmin`, `canManageUserRoles`, `canApprove`). |
| 7 | Render loop rewritten: outer `{#each navSections}`, `<div role="group" aria-labelledby={headerId}>`, header row with the plan's exact classes, `headerId` = `nav-section-` + slugified label. |
| 8 | `{@const active = isNavItemActive(...)}` + `aria-current={active ? 'page' : undefined}` on every `<a>` — top-level, child rows, and both collapsible groups' children. `{@const}` kept as an immediate child of its block tag. |
| 9 | `child: true` items render in the group-child style (`border-l pl-3 ml-4`, `px-3 py-1.5`) with no icon. |
| 10 | Approvals group kept with its toggle and `requestsExpanded`. Header text → `Approvals`. Red dot → the numeric count pill with `aria-label="{n} awaiting your decision"`, same condition (`total > 0 && !requestsExpanded`). Children now come from the `/requests` nav item. |
| 11 | Settings group moved inside the Organization section render position; its markup, children, toggle and labels untouched. |
| 12 | `aria-label="Main"` added to `<nav>`. Locator grep run — see below. |
| 13 | `tests/unit/nav-sections.test.ts` — 23 tests. |
| 14 | Backlog stub written with all 14 routes, guard file:line verified against source. |

Net line change for the phase: **+760 / −401** across 3 files. `+layout.svelte` goes 806 → 602
lines; the removed bulk is the inline nav array and the bespoke Reports render arm.

---

## Commits

| # | Hash | Subject | Files |
|---|---|---|---|
| a | `00da6c4` | `feat(nav): extract the sidebar IA into a testable src/lib/nav.ts` | `src/lib/nav.ts` (new, 255), `tests/unit/nav-sections.test.ts` (new, 308) |
| b | `0bace4a` | `feat(ui): group the sidebar into six labelled sections` | `src/routes/(app)/+layout.svelte` |
| c | *(this commit)* | `docs(ui-ux): record the phase 02 backlog stub and execute report` | the backlog stub + this report |

No push. No `git add -A` — explicit paths only. No attribution trailers.

---

## Test gate outcomes

CI order, all run at the end of the phase:

| Gate | Result |
|---|---|
| `pnpm format:check` | **PASS** — "All matched files use Prettier code style!" |
| `pnpm lint` | **PASS** — 0 errors, 1 warning (pre-existing, `CalculatorWindow.svelte:82`, untouched by this phase) |
| `pnpm check` | **PASS** — 1094 files, **0 errors**, same 1 pre-existing warning |
| `pnpm test` | **PASS** — 197 files, **2208 tests**, 0 failures (was 2185 before this phase) |
| `pnpm test tests/unit/nav-sections.test.ts` | **PASS** — 23/23 |

TDD order was honoured: the four plan stubs were written first and confirmed **RED 4/4** before
`src/lib/nav.ts` existed, then replaced with the real suite.

Per-criterion coverage delivered:

| Criterion | Proving test | Result |
|---|---|---|
| N1 | section order for HR_ADMIN; "never emits an empty section" swept across all 9 roles × both tenant shapes; EMPLOYEE gets exactly `My Work, Time, Performance` | PASS |
| N2 | child labels `My Requests, Approve timesheets, Approve requests, Pay changes, Payroll runs` | PASS |
| N3 | parity sweep — for all 9 roles × 12 guarded hrefs, a role that sees the row is admitted by the route's guard capability set | PASS |
| N3 | **staleness canary** — `readFileSync` each of the 12 guard files, assert the recorded capability string is present (E4) | PASS |
| N4 | MANAGER href snapshot (21 destinations) byte-identical; EMPLOYEE sees none of 12 admin hrefs | PASS |
| N5 | VERIFIER: no top-level `/payroll`, still gets the `Payroll runs` child | PASS |
| N5 | CEO duplicate `/payroll` pinned — both rows asserted present, on record not accidental | PASS |
| N6 | `/performance` vs `/performance/templates`, `/reports` vs `/reports/audit-log`, `/performance/reviews`, `/payroll/periods`, `/requests/approvals`, and a `/reports-archive` non-boundary negative | PASS |
| N8 | non-food-service: no `/punch`, no `/branches`, roster reads `Team`; food-service: both present, roster reads `Branches` | PASS |
| N7 (partial) | glyph uniqueness across all rendered icons; Eval Templates and Audit Log have no icon and `child: true` | PASS (the DOM half stays Agent-Probe) |
| C-1 | Audit Log reachable for `MANAGE_HR`, absent for FINANCE (negative control) | PASS |

---

## E2 — phase 01 carry-forward (explicit confirmation)

**Mechanism chosen: the `child: true` nav item.** `grep -c reportsChildren "src/routes/(app)/+layout.svelte"` returns **0**, and the audit-log row exists as
`{ href: '/reports/audit-log', label: 'Audit Log', show: isAdmin, child: true }` in the Pay
section of `src/lib/nav.ts:208-216`. One mechanism, not both, not neither — as the plan's step 7
allows ("express the audit-log row as a `child: true` item in the Pay section").

Why this side of the OR: the plan's own Pay-section table lists Audit Log as a `child: true` row,
step 9 exists to render exactly that, and the N6 gate requires
`isNavItemActive('/reports/audit-log', …)` cases — which need the href inside `allNavHrefs`, i.e.
inside the sections array. Keeping the bespoke `{:else if}` arm would have left the row outside
the href inventory and kept `/reports` lit while on the audit log.

**Note for the orchestrator:** the validate-contract's literal C-1 gate text is
`grep -q reportsChildren`, which now fails by construction. The plan body's OR clause and the
execute handoff both authorise this choice; the substituted proof is the unit test
`phase 01 carry-forward (C-1) › keeps the Audit Log reachable for MANAGE_HR holders, as an
indented child` plus its FINANCE negative control. **No phase-01 behaviour was lost** — the same
`MANAGE_HR` gate, the same href, the same indented styling.

Phase 01's other deviation (its `{@const active}` simplified to a bare `startsWith`) is moot: that
arm is gone and every row now uses `isNavItemActive`.

---

## Step 12 — locator grep

```
grep -rn "Requests/Approvals\|name: 'Requests'\|name: 'Timesheets'" tests/
→ tests/e2e/timesheet-create-for-employee.spec.ts:166
   await expect(page.getByRole('heading', { name: 'Timesheets', level: 1 })).toBeVisible()
```

One hit, the known one: an `<h1>` on the timesheets page, not a sidebar link. **Zero sidebar
locator breaks.** Left untouched, as instructed.

---

## MANAGER href snapshot — result

**Unchanged.** The snapshot pins 21 destinations for `[MANAGER]`:

`/attendance, /benefits, /complaints, /dashboard, /departments, /employees, /inventory, /leave,
/payroll, /payslips, /performance, /profile, /recruitment, /reports, /reports/audit-log,
/requests, /requests/approvals, /requests/timesheets, /separations, /team, /timesheets`

MANAGER holds `MANAGE_PAYROLL`, so the `/payroll` narrowing does not touch them. They do not hold
`ADMINISTER_HR_ORGWIDE` or `APPROVE_FINANCE`, so no Pay-changes row and no Payroll-runs child —
same as before. **No role gains a destination anywhere in this phase.**

## CEO duplicate `/payroll` pin — result

**PASS, and the duplicate is still there by design.** The test asserts CEO gets BOTH the top-level
`Payroll` row (they hold `MANAGE_PAYROLL`) and the `Payroll runs` child (they hold
`APPROVE_FINANCE`). Removing it would edit a nav gate for two admin roles, outside this phase's
stated single-delta budget. It is now on record instead of accidental.

---

## Plan deviations

Three, all within blast radius, none touching a guard, a server file, or a capability.

1. **`NavItem` gained a `children?: NavItem[]` field.** The plan's Public Contracts named only
   `buildNavSections` and `isNavItemActive`, and step 10 said the Approvals group keeps its child
   loop "unchanged". But gates N2 and N5 are Fully-Automated and demand the child labels and the
   `Payroll runs` row be unit-testable — impossible while `requestsChildren` lived in the
   component. Putting the children on the `/requests` item satisfies both without adding a second
   exported function. The layout now reads `item.children ?? []`; the group's toggle, state,
   styling and condition are otherwise untouched.
2. **The audit-log carry-forward uses the `child: true` mechanism**, so `reportsChildren` and the
   `{:else if item.href === '/reports'}` arm were deleted. Explicitly permitted by step 7's OR;
   full rationale in the E2 section above.
3. **Child rows do not render a badge.** Step 9 specified styling only; neither child item (Audit
   Log, Eval Templates) has a badge, so the markup was left out rather than written dead.

Rejected under E6: nothing was proposed that would touch `src/lib/rbac.ts`, any `+page.server.ts`,
`ConfirmButton.svelte`, or `src/lib/settings-destinations.ts`. Those files are byte-identical.

---

## Line drift vs the plan

The plan's line citations were written against the pre-phase-01 file and had already drifted +52
lines when this phase started. Recorded so phases 06 and 07 rebase on real numbers, not the plan's:

| Plan citation | Reality at phase-02 entry | Now |
|---|---|---|
| nav array `+layout.svelte:113-262` | 113–262 (accurate) | **gone** — `src/lib/nav.ts:92-243` |
| capability consts `:92-111` | 92–111 (accurate) | `:90-114`, four consts left |
| active-state exception list `:587-590` | 639–642 | **gone** — `src/lib/nav.ts:251-255` |
| red dot `:539-543` | 544–548 | count pill, `+layout.svelte:365-370` |
| phase 01's reports arm `~585-614` | 591–637 | **removed** (see E2) |
| `+layout.svelte` total | 806 lines | **602 lines** |

---

## Deferred verification (why this is CODE DONE, not VERIFIED)

Not run, by explicit instruction — no server, browser, or database was started this session.

| Item | Strategy | Owner action needed |
|---|---|---|
| Role-matrix live check (HR_ADMIN / MANAGER / EMPLOYEE / CEO): section headers present, zero empty headers, exactly one `aria-current="page"`, count pill shows a number, audit-log child present for HR_ADMIN and absent for EMPLOYEE | Agent-Probe | Start the app, run `POST /api/v1/_dev/login-as` per role, screenshot the sidebar, attach here |
| Live load of `/dashboard`, `/performance/reviews`, `/reports/audit-log` | Agent-Probe | The layout compiles (`pnpm check`, 0 errors) but green unit tests never proved a page renders |
| `pnpm test:e2e tests/e2e/settings-visibility.spec.ts` (N9) | Hybrid | Needs seeded DB + built preview |
| `impeccable` audit of the changed sidebar | manual | Standing rule for UI work |
| Sidebar collapse control, mobile drawer focus trap | Known-Gap | Carried to phase 08 — **may not be used to declare this phase's nav behaviour proven** |

Nothing in this phase's unit suite proves the sidebar *renders*: `buildNavSections` is pure and
the component is never mounted (vitest env is `node`, no svelte-testing-library in this repo).
`pnpm check` plus the live probe are the only cover for the render, and only the first has run.

---

## Open owner decisions

- **O2 — Stores / Branches noun ruling: STILL OPEN.** This phase preserved the current split
  (registry = "Stores", roster = "Branches" for food-service tenants, per #182) and pinned it with
  a test, but that is the *status quo*, not a ruling. **Blocks phase 08 section S2**, not this
  phase. Surface to the owner before phase 08 starts.
- **O1 — MANAGER / `ADMINISTER_HR_ORGWIDE` guard alignment.** Not blocking. Backlog stub written:
  `process/features/ui-ux-overhaul/backlog/manager-admin-nav-gate-alignment_NOTE_03-09-26.md`,
  14 routes with guard file:line re-verified against source today.

## Umbrella correction still owed (orchestrator-owned, not applied here)

The umbrella's "Shared-file ordering" lists phases 02, 06, 07 as touching
`src/routes/(app)/+layout.svelte`. **Phase 01 touches it too.** The list should read
01 → 02 → 06 → 07. Different file, orchestrator's to fix.

---

## Forward preview

**Test infra found.** `vitest.config.ts` is `environment: 'node'` with the `sveltekit()` plugin, so
`$lib` aliases resolve and `node:fs` is available in unit tests — that combination is what makes
the staleness canary possible. There is **no component-render test tier** in this repo (no
svelte-testing-library, no jsdom env), so any future phase asserting rendered DOM has only e2e or
a live probe. That is the single biggest gap for phases 06–08.

**Blast radius changes.** `src/lib/nav.ts` is now a shared module: phases 06 and 07 must edit
nav membership *there*, not in `+layout.svelte`. The layout keeps only render concerns plus four
capability consts. `allNavHrefs` is section items only — it is NOT a full href inventory; group
children are deliberately absent so they cannot steal a parent's active state.

**Commands to stay green.** `pnpm format:check` → `pnpm lint` → `pnpm check` → `pnpm test`, in
that order. `pnpm test tests/unit/nav-sections.test.ts` is the fast loop while editing nav.
The parity canary means a `+page.server.ts` guard rename now breaks this suite on purpose — that
is the drift alarm working, not a flake.

**Dependency changes.** None. No package, schema, migration, route, load function, form action or
API contract changed. Phase 06 can still read `data.pendingApprovals` in its current shape;
phase 07's settings/payroll sub-nav slots into the Organization and Pay sections this phase
created.

**Next plan path:** `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-03-*_PLAN_03-09-26.md`

---

## Closeout packet

- **Selected plan:** `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-02-nav-ia_PLAN_03-09-26.md`
- **Finished:** checklist steps 1–14, three commits, four CI gates green, 23 new tests.
- **Verified:** every Fully-Automated gate in the validate contract.
- **Still unverified:** all Agent-Probe and Hybrid gates (role-matrix, live loads, e2e) and the
  `impeccable` audit. No screenshots exist.
- **Remaining cleanup:** none in code. O2 needs an owner answer before phase 08.
- **Best next state:** **Keep in active/testing.** The plan's own Phase Completion Rules make
  VERIFIED require the live role-matrix pass with screenshots; until the owner's manual pass runs,
  this phase is CODE DONE and the plan stays active.
