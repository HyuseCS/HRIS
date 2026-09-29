---
name: report:ui-ux-overhaul-phase-07-s6-s7
description: "Phase 07 sections S6 (settings shared destination array, hub, sub-nav, sidebar) and S7 (settings/org filters, employees/new grouping, pagination), plus the phase 07 close."
phase: phase-07-page-splits
date: 2026-09-03
status: COMPLETE_WITH_GAPS
feature: ui-ux-overhaul
plan: process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-07-page-splits_PLAN_03-09-26.md
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: phase-07
---

# Phase 07 — S6, S7, and the phase close

**Branch:** `feat/uiux-phase-7` · **Commits:** `621685d` (S6), `a7b76ae` (S7)
**Status:** CODE DONE, **not VERIFIED**. Nothing was run against a browser or a database.

**TL;DR** — The settings hub, the new settings sub-nav and the sidebar's Settings group now all
render from one array, `src/lib/settings-destinations.ts`, so a destination cannot carry three
names again. `settings/org` gained search + only-unassigned filters, `employees/new` split into
"Required to hire" and a collapsed "Complete later", and separations / inventory / employee-side
complaints paginate. Full CI gate set green. Every live gate the plan names is still unrun.

---

## What Was Done

### S6 — settings shared array, hub, sub-nav (commit `621685d`)

- **F1/F2.** Created `src/lib/settings-destinations.ts`: `SettingsGroup`, `SettingsDestination`,
  `SETTINGS_DESTINATIONS` (17 entries), `SETTINGS_GROUP_ORDER`, `visibleSettings(roles)`.
  `visibleSettings` OR-combines `capabilities` through `canAny` from `$lib/rbac` — the same table
  the server enforces. All four gating comments (#237/#248 on Roles & Access, #178/#133 on Review
  Schedule, the proposers note on Statutory Rates, #258 on the full-role-set read) were moved
  verbatim onto the matching array entries **before** SC-3 deleted the flags.
- **OD-2 applied.** `SettingsDestination` carries `inSidebar: boolean`. The seven of today's
  sidebar rows are `true`, the other ten `false`. No navigation-IA change; no `/payroll/*` row
  entered the Settings group.
- **F3.** `settings/+page.svelte` renders `visibleSettings(data.user.roles)` grouped by
  `SETTINGS_GROUP_ORDER`, one `<h2>` per non-empty group. The inline 17-card array and the
  `visible` derive are gone.
- **F4 (SC-3).** `settings/+page.server.ts` is now the `MANAGE_HR` guard and nothing else. The four
  orphaned flags are deleted.
- **F5.** Created `src/routes/(app)/settings/+layout.svelte` — `<nav aria-label="Settings
  sections">`, grouped, with an `All settings` link and `aria-current="page"` on the active row.
  **No `settings/+layout.server.ts` was created**; roles come from the root `(app)` layout data.
- **F6.** `(app)/+layout.svelte`'s `settingsChildren` now derives from
  `visibleSettings(roles).filter(d => d.inSidebar)`, keeping the `All settings` entry and the
  group's toggle behaviour. The outer `isAdmin` (MANAGE_HR) gate is intact — the ten
  `capabilities: []` destinations depend on it. Nothing else in the file was touched.
- **F7.** `tests/unit/settings-cards.test.ts` rewritten: exact ordered href list per role for
  SUPER_ADMIN (17) / CEO (17) / HR_ADMIN (14) / MANAGER (12), written longhand, `toEqual`. The
  #237/#178 header reasoning is retained; the route-guard open/closed matrix is retained.
- New `tests/unit/settings-destinations.test.ts`: unique href, **unique label** (AC-14's "one name
  per destination", which the per-role list cannot prove), every group present in the render order,
  and the curated `inSidebar` seven.
- **F8.** `tests/e2e/settings-visibility.spec.ts` — `'Holidays'` → `'Holiday Calendar'` at both
  sites, and every positive locator scoped through two helpers (`hubCard`, `sidebarRow`). The
  `toHaveCount(0)` negatives are byte-identical; they remain the parity gate.

### S7 — settings/org, employees/new, pagination (commit `a7b76ae`)

- **G1.** `settings/org` assignment wall: a `$state` search box + `Only unassigned` checkbox, a
  pure `$derived` filter over `data.employees`, a `Showing N of M employees` count, and a
  `no-results` `EmptyState` when the filter empties the table. The positions catalog is untouched.
- **G2.** `employees/new`: an `h2` "Required to hire" over the four existing fieldsets, and the
  last three (Government IDs, Emergency Contact, Bank/GCash) wrapped in a collapsed
  `<details>` — summary `Complete later — 12 optional fields`, with the plan's helper copy. No
  input moved, no `name` changed, no `required` attribute changed. `open={optionalHasError}`
  auto-expands it when the server rejects any of the 11 named optional fields.
- **G3/G4 (SC-4).** `paginate(url, rows.length, …)` in the route load, then a slice:
  separations 20 (`page`), inventory 20 (`page`, applied **after** the existing filter so paging
  follows the filtered set), complaints employee branch 10 under `myPagination` / `myPage`
  (**OD-3**, matching the HR sibling's page size). The complaints HR branch is untouched.
  `<Pagination meta={…} />` renders under each table and self-hides below its page size.
- **G5.** Separations table got the `overflow-x-auto` wrapper its siblings have.
- Backlog stub created:
  `process/features/ui-ux-overhaul/backlog/query-level-pagination-unbounded-lists_NOTE_03-09-26.md`.

---

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| S6 gate | `pnpm check` | 0 errors, 1 pre-existing warning (`CalculatorWindow.svelte:82`) |
| S6 gate | `npx vitest run tests/unit/settings-cards.test.ts tests/unit/settings-destinations.test.ts` | 17 passed |
| S6 gate | `pnpm test` | 211 files / 2375 tests passed |
| S7 + close | `pnpm format:check && pnpm lint && pnpm check && pnpm test` | all green (lint: 0 errors, the same 1 pre-existing warning) |
| AC-21 | `git diff --name-only` over the phase | `src/lib/rbac.ts`, `prisma/schema.prisma`, `src/lib/server/services/**`, `src/lib/components/ui/**` — none touched |

### Mutation check (RED evidence)

Flipped `/settings/performance`'s `capabilities: ['ADMINISTER_HR_ORGWIDE']` to `[]`, then ran
`npx vitest run tests/unit/settings-cards.test.ts`:

```
 ❯ tests/unit/settings-cards.test.ts:125:28
    125|  expect(hrefs('MANAGER')).toEqual(MANAGER_HREFS)
  Array diff:
    "/settings/job-boards",
 +  "/settings/performance",
  ]
 Test Files  1 failed (1)
      Tests  1 failed | 12 passed (13)
```

The #178 row is the one that fired, exactly as intended. Restored, re-ran: 17 passed.

---

## Plan Deviations

All three are within the phase blast radius. None touches an out-of-bounds path, a capability, or
a guard.

| # | Deviation | Why | Impact |
|---|---|---|---|
| D-1 | The e2e hub-card locator is scoped to `getByRole('region', { name: 'Settings destinations' })`, not `getByRole('main')`, and `settings/+page.svelte` gained one `role="region"` wrapper to make that landmark exist. | The settings sub-nav (F5) renders **inside** `<main>`, so `getByRole('main')` still matches two links per canonical label and strict mode would still throw. `getByRole('navigation')` alone is equally ambiguous (sidebar + sub-nav), so the sidebar helper names its landmark: `getByRole('navigation', { name: 'Main' })`. | Test-only plus one wrapper element. The `toHaveCount(0)` negatives are unchanged. |
| D-2 | `settings/org` search matches employee **name or job title**, not "name or employee number". | `listAssignableEmployees` does not select `employeeNumber`, and `src/lib/server/services/**` is out of bounds program-wide. | The affordance is the same; the searchable field set is one column different. Adding employee number is a service change — route it if the owner wants it. |
| D-3 | The per-role longhand `toEqual` lists live in `tests/unit/settings-cards.test.ts` (as F7 instructs), not in `tests/unit/settings-destinations.test.ts` (as the validate contract's AC-14/AC-15 row names). `settings-destinations.test.ts` covers the label-uniqueness and curated-sidebar invariants instead. | Writing the 60-line list in both files would duplicate the one assertion that must stay hand-maintained. F7 is the more specific instruction and the #237/#178 reasoning already lives in `settings-cards.test.ts`. | None — both files run under `pnpm test`, so AC-14 and AC-15 are both proven; only the file name in the contract row differs. |
| D-4 | Two orphaned derives (`isSuperAdmin`, `canManageUserRoles`) were deleted from `(app)/+layout.svelte`. | F6 removed their only consumer. Leaving them is dead code my own change created (the same reasoning SC-3 gives). | Nothing else in that file changed. |

**SC-2 was NOT taken** (recorded here because the plan asks for a reason either way): S2 used the
client-only reveal path, so no server threading was needed. See the S1-S4 report.

---

## Test Infra Gaps Found

- **CONTEXT_PARTIAL: component rendering.** No component-test harness exists, so nothing in the
  unit tier proves the hub, the sub-nav and the sidebar actually consume the array, that the sub-nav
  marks `aria-current`, that the `<details>` auto-expands, or that the org filter renders. Those are
  e2e/agent-probe only. `settings-visibility.spec.ts` covers four roles on two surfaces and no more.
- **Contract-vs-plan drift on file names** (D-3 above): the validate contract names a proving test
  file that F7 assigns different content to. Worth reconciling when the contract is next written.

---

## What Was Skipped or Deferred

- **Every live gate.** G5, G6, G7, G8, G10, G11, G12, G13, G14 and the five-role settings walk are
  all unrun across all seven sections. No dev server and no database were started — the standing
  rule is that the owner starts them. `pnpm test:e2e` was not run either; the orchestrator owns
  that run, and the `settings-visibility.spec.ts` edits above are what it will exercise first.
- **Query-level pagination** — the recorded residual, now a backlog note. Slicing fixes the UI
  wall, not the query cost: at 10k rows the load still fetches 10k. `AC-19` is proven only as an
  affordance.
- **Employee-number search** on `settings/org` (D-2).

---

## Phase 07 close

All seven sections are committed on `feat/uiux-phase-7` and the full CI gate set is green in CI
order. `phase-blast-radius-registry.md` now carries the `## Phase 7` section, transcribed from the
plan's Touchpoints (prior agents left it to this one).

**Phase state: CODE DONE, not VERIFIED.** Per the plan's own completion rules, VERIFIED needs
G5, G6, G13, G14, G7, G8, G11, G12, the reports and the backlog stub. The last two exist; the nine
gates do not.

**Owner decisions applied:** OD-2 (curated sidebar subset via `inSidebar` — no IA change, no
`/payroll/*` row in the Settings group) and OD-3 (complaints employee branch at pageSize 10 under
`myPage`). OD-1 was applied in S2 by the earlier agent.

---

## Closeout Packet

- **Selected plan:** `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-07-page-splits_PLAN_03-09-26.md`
- **Finished:** S6 and S7 in full; the registry `## Phase 7` section; the backlog stub; this report.
- **Verified:** `pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test` (2375 tests), the
  mutation RED, and the out-of-bounds path audit.
- **Unverified:** every browser- and database-backed gate (see above).
- **Best next state:** `Keep in active/testing` — the plan stays active until the owner's live pass
  and the e2e run clear. It is not ready for UPDATE PROCESS archival.
- **Next plan path:**
  `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-08-copy-a11y_PLAN_03-09-26.md`

---

## Forward Preview

### Test infra found
No component-test harness; unit tier cannot see any of phase 07's markup. `pnpm test` is 211 files
/ 2375 tests and runs in ~7s. `settings-visibility.spec.ts` is the only e2e that asserts settings
labels — its positive locators are now landmark-scoped and its negatives are untouched.

### Blast radius changes for phase 08
- **Skip audit item 34.** The onboarding manual-step control is already compliant — S4 replaced the
  16px glyph with a real `<button>` carrying `aria-label="Mark {step} complete"`.
- **Three new attendance components to sweep:** `src/lib/components/attendance/AttendanceSelfView.svelte`,
  `AttendanceHrGrid.svelte`, `shared.ts` (plus `Icon.svelte`). The 904-line page they came from no
  longer holds that copy.
- **Two new settings surfaces:** `src/routes/(app)/settings/+layout.svelte` (the sub-nav) and the
  regrouped `settings/+page.svelte` with five group `<h2>`s.
- **Canonical labels landed.** `Company` → `Company Information`, `Schedules` → `Work Schedules`,
  `Holidays` → `Holiday Calendar`, `Roles` → `Roles & Access`. Any phase-08 copy edit to a settings
  label must be made in `src/lib/settings-destinations.ts`, never on a page — and it changes three
  surfaces plus an e2e assertion at once.
- **New collapsed containers** that copy work must not hide errors behind: the `employees/new`
  "Complete later" `<details>` and the attendance CSV-import disclosure. Both auto-expand on a
  server error today; keep that.

### Commands to stay green
`pnpm prisma generate` (before believing a red check) → `pnpm format:check` → `pnpm lint` →
`pnpm check` → `pnpm test`. Prettier reformats `.svelte` aggressively — run
`npx prettier --write` on touched files before `format:check`, since CI runs format FIRST.

### Dependency changes
None. No new npm dependency; no schema change; no migration.
