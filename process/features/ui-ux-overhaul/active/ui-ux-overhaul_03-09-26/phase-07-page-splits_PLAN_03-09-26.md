---
name: plan:ui-ux-overhaul-phase-07-page-splits
description: "Veent HRIS UI/UX Overhaul — Phase 07: split the monster pages (employees/[id] into URL-backed tabs, attendance by persona, employees/new by required-vs-later), rebuild settings IA on one shared destination array, and paginate the unbounded lists. Markup-first."
date: 03-09-26
feature: ui-ux-overhaul
phase: phase-07
metadata:
  node_type: memory
  type: plan
  feature: ui-ux-overhaul
  phase: phase-07
---

# Phase 07 — Page Splits and Settings IA

**Program:** ui-ux-overhaul
**Umbrella plan:** `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/ui-ux-overhaul-umbrella_PLAN_03-09-26.md`
**Phase status:** ⏳ PLANNED
**Report destination:** `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-07-page-splits_REPORT_{date}.md` (flat, same folder)
**Consumes:** audit §T6, the People and Settings/reports per-area findings in §4, addendum P0-7. Cross-check §5 item 10.
**Entry gate:** Phase 02 (nav) and Phase 03 (kit primitives) complete.

**Date**: 03-09-26
**Status**: PLANNED
**Complexity**: COMPLEX (phase 07 of an 8-phase program)
**Feature:** ui-ux-overhaul

---

**TL;DR** — Four pages get internal structure and one settings information-architecture bug gets
killed structurally. `employees/[id]` (1,812 lines, 22 actions) becomes five URL-backed tabs with
no server load or action-signature changes; the four People findings that live inside that page
(P0-7 error scoping, three emergency-contact surfaces, three overlapping edit forms, reveal-drops-
on-save) are fixed inside the same restructure. `attendance` splits by persona into two extracted
components. Settings grows a sub-nav and a grouped hub, **both rendered from one shared destination
array** so the "three names for one destination" bug cannot be re-introduced. Seven commits, one
per section. Markup-first: the only server edits are four named, scoped exceptions.

---

## Overview / Purpose

The audit's weakest heuristic is #4 Consistency at 1/10, and §T6 is where that lands on the pages HR
actually lives in. `employees/[id]` is HR's most-used page and finding "Documents" means scrolling
past loans, deductions and two salary forms every time. `attendance` serves three personas from one
904-line file. `/settings` has 17 hub cards, 8 sidebar children, and a third set of names on the
pages themselves — three names per destination, maintained by hand in three places.

This phase does not redesign anything. It adds navigation to structure that already exists, and it
replaces three hand-maintained lists with one. Phase 02 settled which pages exist under which shell
and Phase 03 built the primitives these pages will consume, so this is the first phase where the
splits can land on their final shape instead of being re-swept later.

---

## Binding Decisions (from INNOVATE — do not re-litigate)

| # | Decision | Rejected alternative | Why |
|---|---|---|---|
| D2 | `employees/[id]` → URL-backed tabs via `?tab=`, markup-only restructure | Sub-routes (`employees/[id]/documents/…`) | Sub-routes need the 940-line load and all 22 actions duplicated or hoisted to a layout. Query-param tabs are a wrapper diff with zero server change. |
| D2a | Tabs: Overview / Compensation & Payroll / Documents / History / Actions | Sticky anchor nav | Anchors keep the 1,812-line scroll; tabs remove it. |
| D2b | Danger zone (Offboard) isolated alone in Actions | Leave Offboard at page bottom | §T3/Phase 05 gives it a confirm; isolation makes reaching it deliberate. |
| A1 | Attendance: two extracted components, **one route** | New `/attendance/me` sub-route | A sub-route needs a second `+page.server.ts` with the same load, changes URLs the nav and `employee-view-only.spec.ts` already point at, and splits the `?view=` convention. Two components behind the existing `data.canManage` branch is the smallest safe diff. |
| D7 | Grouped hub + new `settings/+layout.svelte` sub-nav, both from ONE shared destination array | Keep two hand-maintained lists, just reconcile the labels | Reconciling by hand is what already failed. One array makes drift a compile-time impossibility. |
| S3 | `settings/org`: keep the positions catalog in place; add search + only-unassigned filter to the assignment wall | Move assignment to the employee record | Bigger diff, moves a working surface, and loses the bulk-assign workflow. Minimal diff wins. |
| S4 | `employees/new`: "Required to hire" group + collapsed "Complete later" group | Multi-step wizard | A wizard adds state, validation staging, and a back/forward contract for a form that submits once. |
| S5 | Pagination sliced in the route `load`, not pushed into the service | Add `skip`/`take` to `listSeparations` etc. | `src/lib/server/services/**` is **out of bounds** per the umbrella Touchpoints list. See the honesty note in §Known Gaps. |

---

## Server-Change Allow-List (exhaustive — anything else is scope creep)

This phase is markup-first. Exactly four server-side edits are authorized. An EXECUTE agent that
finds itself editing a fifth server file must stop and report.

| # | File | Change | Justification |
|---|---|---|---|
| SC-1 | `employees/[id]/+page.server.ts` | Add `action: '<name>'` to the return/`fail()` payload of every action that lacks it (19 of 22) | P0-7. The page's own `form?.action` disambiguation pattern already exists on 3 actions; the fix is applying it, not inventing it. No signature, guard, or service call changes. |
| SC-2 | `employees/[id]/+page.server.ts` — non-`reveal` actions | Thread `revealed`/`history` back through the action result when the caller was already revealed | People finding: "reveal drops on any save". **No new reveal, no second audit row** — see the hard constraint below. |
| SC-3 | `settings/+page.server.ts` | Delete the four now-orphaned capability flags (`isSuperAdmin`, `canRoles`, `canStatutory`, `canHrOrgwide`); keep `requireAnyCapability(user.roles, 'MANAGE_HR')` untouched | The shared array evaluates capabilities client-side from `data.user.roles` via `$lib/rbac.canAny` (the same table, the same function the sidebar already uses). Leaving the flags would be dead code my own change created. |
| SC-4 | `separations/+page.server.ts`, `inventory/+page.server.ts`, `complaints/+page.server.ts` (employee branch only) | Call `paginate(url, rows.length, { param, pageSize })` and slice the already-fetched array | `Pagination.svelte` is server-fed by design — its `meta` prop has no client-only path. Slicing in the load keeps `src/lib/server/services/**` untouched. |

### Hard constraints (phase failure if violated)

- **Never touch `src/lib/rbac.ts`.** Read-only across the whole program.
- **Never touch `prisma/schema.prisma` or `src/lib/server/services/**`.**
- **The masked-reveal flow is behavior-frozen (#111, #290, do-not-break item 3).** SC-2 threads an
  *already-obtained* `revealed` payload back through a subsequent action result. It must not call
  `revealEmployeeSensitive`, must not write a second audit row, and must not survive a page reload
  (the mask is re-applied by `load`, exactly as today).
- **No capability is added, removed, or re-scoped.** The settings array must reproduce the current
  visibility set exactly, role for role.
- **No new npm dependency.**
- **`{@const}` only as an immediate child of a block tag.**

---

## Touchpoints

**Modified**
- `src/routes/(app)/employees/[id]/+page.svelte` (1,812 lines — the main restructure)
- `src/routes/(app)/employees/[id]/+page.server.ts` (SC-1, SC-2)
- `src/routes/(app)/attendance/+page.svelte` (904 lines — extraction + bulk-bar grouping)
- `src/routes/(app)/settings/+page.svelte` (hub, rendered from the shared array)
- `src/routes/(app)/settings/+page.server.ts` (SC-3)
- `src/routes/(app)/settings/org/+page.svelte` (search + only-unassigned filter)
- `src/routes/(app)/employees/new/+page.svelte` (two fieldset groups)
- `src/routes/(app)/+layout.svelte` (**Settings children only** — swap the hand-written
  `settingsChildren` array for a derive off the shared array; Phase 02 owns the rest of this file)
- `src/routes/(app)/separations/+page.svelte`, `+page.server.ts` (Pagination)
- `src/routes/(app)/inventory/+page.svelte`, `+page.server.ts` (Pagination)
- `src/routes/(app)/complaints/+page.svelte`, `+page.server.ts` (Pagination, employee branch only)
- `tests/unit/settings-cards.test.ts` (pins the four flags with `toEqual` — must be rewritten, see B3)
- `tests/e2e/settings-visibility.spec.ts` (asserts both the old hub labels and the old sidebar
  label `'Holidays'` — canonical-label unification breaks it by design, see B4)

**Created**
- `src/lib/settings-destinations.ts` — the single shared destination array
- `src/routes/(app)/settings/+layout.svelte` — the settings sub-nav
- `src/lib/components/employees/EmployeeTabs.svelte` — the tab strip primitive (or the Phase 03
  equivalent if one exists; **check the kit before creating**)
- `src/lib/components/attendance/AttendanceSelfView.svelte`
- `src/lib/components/attendance/AttendanceHrGrid.svelte`
- `tests/unit/settings-destinations.test.ts`
- `tests/unit/employee-tab-resolve.test.ts`

**Read-only**
- `src/lib/rbac.ts`, `src/lib/components/Pagination.svelte`, `src/lib/server/pagination.ts`,
  `src/lib/components/ui/**`, `docs/ui-ux-audit-2026-09-03.md`

---

## Public Contracts

| Contract | Change | Consumers that must move with it |
|---|---|---|
| `employees/[id]` URL surface | Gains an optional `?tab=` param. Absent → Overview. Unknown value → Overview (no error). `?from=` is **preserved on every tab change**. | `BackButton` (reads `?from=`); any inbound deep link (all still valid). |
| `employees/[id]` action results | Every action result carries `action: '<name>'`. Existing keys (`error`, `success`, `notice`, `revealed`, `history`) keep their meaning. | The page template only. Phase 04 generalizes this shape program-wide; this phase must not pre-empt Phase 04's `{ action, error?, saved? }` naming — use the keys this page already uses. |
| `$lib/settings-destinations` | **New public contract.** Each entry: `{ href, label, group, capabilities: Capability[] }`. `label` is the ONE canonical name for that destination. `capabilities` is OR-combined via `canAny`. | The settings hub, the settings sub-nav, and the sidebar's Settings children. Three consumers, one source. Adding a settings page means adding one array entry. |
| `settings/+page.server.ts` load return | Loses four flags; keeps its `MANAGE_HR` guard | `tests/unit/settings-cards.test.ts` (`toEqual`, so it goes red — intentionally). |
| Settings groups | Organization / Time & Attendance / Payroll / Hiring & Separation / System | Group order is part of the contract; the sub-nav and hub render the same order. |
| Attendance route surface | **Unchanged.** Same URL, same `?view=` param, same 11 actions. | Nothing. This is why the component split was chosen over a sub-route. |

### Phase 06 coordination (payroll config pages)

`/payroll/config` and `/payroll/statutory-rates` are linked from **both** the payroll sub-nav
(Phase 02/06) and the settings Payroll group (this phase). **Both links stay.** The rule is one
canonical label per destination, not one link per destination:

- `/payroll/config` → canonical label **"Payroll Config"**
- `/payroll/statutory-rates` → canonical label **"Statutory Rates"**

Both already match the current hub card titles, so this phase changes no payroll label. If Phase 06
lands a different label for either, Phase 06 wins and `settings-destinations.ts` is updated to match
— the array is the reconciliation point, not a competing source.

---

## Blast Radius

| Metric | Value |
|---|---|
| Files modified | 14 (9 `.svelte`, 3 `+page.server.ts` loads, 2 test files) |
| Files created | 7 (1 lib module, 1 layout, 3 components, 2 test files) |
| Largest single-file diff | `employees/[id]/+page.svelte` — wrapper insertions around ~16 existing sections, plus ~19 scoped feedback blocks |
| Packages | one app, no workspace boundary crossed |
| Risk class | **Medium.** No schema, no service logic, no capability change, no auth-guard change. |

**Named risk surfaces (only three):**

1. **`?tab=` + `use:enhance` interaction.** A form POST re-runs `load`; the tab param must survive
   so the user is not thrown back to Overview after every save. Mechanism is pinned in A2.
2. **SC-2 reveal threading.** Touches do-not-break item 3. Mitigated by the "no new reveal, no
   second audit row" constraint and a dedicated live gate (G6).
3. **Settings visibility parity.** The array must reproduce the current per-role visible set
   exactly. Mitigated by B3's role→exact-href-list unit test, written from the existing
   `settings-cards.test.ts` table by hand (not derived from `CAPABILITIES` — recomputing the table
   from the table proves nothing).

**Blast-radius registry note:** `phase-blast-radius-registry.md` does not exist yet and this
planning task is scoped to exactly one file, so this section IS phase 07's claim. The first agent to
create the registry must transcribe the Touchpoints list above as `## Phase 7`. Known overlaps:
`employees/[id]/+page.svelte` (phases 01, 04, 05, 06, 08), `attendance/+page.svelte` (phases 04, 05),
`(app)/+layout.svelte` (phases 02, 05, 08). Phase 07 runs after 02/03 and before 08, so it inherits
02's nav shape and hands 08 a final structure to write copy onto.

---

## Implementation Checklist

Commit after each section (S1–S7). Run that section's test gate before the commit, never batched.

### S1 — `employees/[id]` tab shell (markup wrapper only, no content edits)

- [ ] A1. Check `src/lib/components/ui/` for a Phase 03 tab primitive. If one exists, use it. If
      not, create `src/lib/components/employees/EmployeeTabs.svelte`: a `<nav>` with
      `role="tablist"`, one `<button role="tab">` per tab, `aria-selected`, `aria-controls`, and
      roving `tabindex` per the ARIA tabs pattern. Sticky under the page header.
- [ ] A2. **Tab state mechanism (dirty-form safety — this is the load-bearing decision).**
      - Active tab is derived: `const activeTab = $derived(resolveTab($page.url.searchParams.get('tab')))`.
      - Tab switching calls SvelteKit shallow routing `pushState(hrefFor(tab), $page.state)` from
        `$app/navigation`. `pushState` updates `$page.url` **without re-running `load`**, so no
        network round trip and no data refetch on a tab change.
      - `hrefFor(tab)` mutates **only** the `tab` param on a clone of the current URL — the exact
        pattern `Pagination.svelte:22-26` already uses. This is what preserves `?from=` (and any
        future param) across tab switches.
      - **Panels are rendered ALWAYS and hidden with the `hidden` attribute — never `{#if}`.**
        `{#if}` destroys the DOM subtree, which would discard every character typed into an
        inactive tab's form. `hidden` keeps the nodes alive (input values intact, in-flight
        `use:enhance` guards intact) and removes them from the accessibility tree and tab order.
        This is also why S2–S4 are wrapper insertions rather than content moves.
      - After a form POST, `use:enhance` re-runs `load` but does not change the URL, so `?tab=`
        persists and the user stays on the tab they submitted from.
- [ ] A3. Add `resolveTab(raw: string | null): TabId` as a pure exported function (unknown/absent
      → `'overview'`). Export the `TABS` array (`id`, `label`) from the same module.
- [ ] A4. Wrap the ~16 existing sections in five panel `<div>`s **without editing their contents**.
      Assignment (by current line ranges, re-verify before editing — Phases 01/04/05/06 have moved
      lines since the audit):
      | Tab | Sections |
      |---|---|
      | Overview | Onboarding checklist, Profile, Government IDs, Bank/GCash, Supervisors, Evaluation Template, Emergency Contacts, Update Profile |
      | Compensation & Payroll | Change Salary/Pay Type, Promote, Loans & Cash Advances, Benefits, Recurring Allowances & Incentives, Recurring Deductions |
      | Documents | Documents section (upload + list + removed-documents audit panel) |
      | History | Employment History panel |
      | Actions | Offboard Employee — **alone**, visually isolated as the danger zone |
- [ ] A5. Keep `BackButton` and the page header **outside** the tab panels.
- [ ] A6. Gate: `pnpm check` green (svelte-check catches every broken reference the wrap could
      cause) + `pnpm test` green + the new `employee-tab-resolve` unit test green. Commit.

### S2 — Overview tab content fixes

- [ ] B1. **P0-7, part 1 (server).** In `employees/[id]/+page.server.ts`, add `action: '<name>'` to
      every success return and every `fail()` payload of the 19 actions that lack it. Do not rename
      or remove any existing key. `reveal` keeps returning `{ revealed, history }` and gains
      `action: 'reveal'`.
- [ ] B2. **P0-7, part 2 (markup).** Give each form in the Overview tab its own scoped feedback
      block, gated on `form?.action === '<name>'`, following the pattern the page already uses at
      the Evaluation Template and Change Salary sections. Errors get `role="alert"`; successes get
      `role="status"`. Delete the ungated `{#if form?.error}` inside Update Profile that is
      currently catching all 19.
      **Offboarded-employee case (the P0-7 tail):** the scoped blocks must sit with their own form,
      NOT inside the `canManage && employmentStatus === 'ACTIVE'` Update Profile card. Every
      document, reveal, and contact failure must render for an OFFBOARDED employee. This is gate G5.
- [ ] B3. **Emergency contacts — consolidate three surfaces into one.**
      - Canonical surface: the plural `Emergency Contacts` section (backed by the
        `employee.emergencyContacts` relation, with `?/addEmergencyContact` /
        `?/deleteEmergencyContact`).
      - Delete the read-only singular "Emergency Contact" card.
      - Delete the three legacy `emergencyContact*` inputs from the Update Profile form.
      - **Legacy-column display merge (do not lose data):** the singular
        `emergencyContactName/Relation/Phone` columns still hold values for employees created before
        the relation existed. When all three legacy columns are non-empty **and** no relation row
        matches that name, render one extra row in the Emergency Contacts table, labelled
        `Legacy record`, read-only, with copy: `On file from the old single-contact field. Add it as
        a contact above to make it editable.` **Do not migrate, do not write, do not delete the
        columns** — that is a schema/data change and is out of bounds.
      - `?/update` keeps accepting the legacy fields server-side (unchanged); it simply stops
        receiving them from this form.
- [ ] B4. **Supervisors: `<select multiple size=4>` → checkbox list.** Same `name="supervisorIds"`,
      same `?/setSupervisors` action, same submit guard. A scrollable `<fieldset>` with a
      `<legend>`, one checkbox + `<label>` per option, `max-h-48 overflow-y-auto`. Delete the
      "Ctrl/Cmd-click to select multiple" hint. Checkboxes are excluded from the 44px coarse-pointer
      floor on purpose (`app.css`) — do not add a size override.
- [ ] B5. **Reveal survives save (SC-2).** In the page component, replace
      `const revealed = $derived(form?.revealed ?? null)` with a `$state` holding the last revealed
      payload, updated by an `$effect` when `form?.revealed` arrives, and cleared on nothing else.
      In the server, non-`reveal` actions return the caller's already-known reveal state back
      untouched **only if the client sends it** — preferred implementation: keep it purely
      client-side (the `$state` above) so **no server change is needed at all** and no reveal data
      round-trips. **Try the client-only path first.** Only if a real gap is found (e.g. a
      redirecting action) fall back to SC-2's server threading, and record why in the phase report.
      Hard invariant either way: no second `revealEmployeeSensitive` call, no second audit row, and
      a full page reload still re-masks.
- [ ] B6. Gate: `pnpm check` + `pnpm test` + `pnpm test -- employee` green. Commit.

### S3 — Compensation & Payroll tab: disambiguate the three edit forms

- [ ] C1. The three overlapping forms are **Update Profile** (`?/update`), **Change Salary / Pay
      Type** (`?/changeCompensation`), and **Promote** (`?/promote`). Picking the wrong one silently
      bypasses the audited career event. Add a one-line purpose statement under each heading:
      | Form | Copy |
      |---|---|
      | Update Profile | `Corrects personal and contact details. Does not change pay or position — use Change Salary or Promote for those.` |
      | Change Salary / Pay Type | `Records a dated pay change in the employment history. Use Promote if the job title or position is also changing.` |
      | Promote | `Records a dated position or title change, with an optional pay change in the same event. Use Change Salary if only the pay is changing.` |
- [ ] C2. Cross-link each statement's named alternatives to the other form's tab and anchor
      (`?tab=compensation#change-salary` etc.). Add matching `id`s to the three form containers.
- [ ] C3. Do **not** merge, reorder, or change any of the three actions. §T5's consolidation of this
      trio is Phase 06's scope; this phase adds signposting only. If Phase 06 already consolidated
      them, skip C1–C2 and record the skip in the phase report.
- [ ] C4. Scoped feedback for every form in this tab, per B2's pattern.
- [ ] C5. Gate: `pnpm check` + `pnpm test`. Commit.

### S4 — Documents, History, Actions tabs

- [ ] D1. Scoped feedback for `?/uploadDocument`, `?/deleteDocument` (Documents) and `?/offboard`
      (Actions), per B2.
- [ ] D2. Actions tab: render only the Offboard form. Give it a `border-destructive` container, an
      `<h2>` reading `Danger zone`, and a one-line consequence statement above the form. **Do not**
      add or change a confirm dialog — that is Phase 05's `ConfirmButton` sweep. If Phase 05 already
      wrapped it, preserve the wrapper exactly.
- [ ] D3. History tab: move the Employment History panel unchanged. Its masked salary figures are
      released by the same `?/reveal` (#290, no second audit write) — verify that still holds after
      B5's `$state` change. This is gate G6.
- [ ] D4. Onboarding manual-step checkbox (People finding): the 16px `✓` text-glyph button is
      sub-24px. Replace with a real `<button>` carrying an accessible name
      (`aria-label="Mark {step} complete"`), letting the existing coarse-pointer 44px floor apply.
      Same `?/toggleOnboardingStep` action.
- [ ] D5. Gate: `pnpm check` + `pnpm test`. Commit.

### S5 — Attendance persona split

- [ ] E1. Extract the `data.canManage === false` render path into
      `src/lib/components/attendance/AttendanceSelfView.svelte` and the `true` path into
      `AttendanceHrGrid.svelte`. `+page.svelte` keeps the `<script>` shared setup it must (period
      state, `data`/`form` props) and reduces to a header plus a two-way branch. Pass `data` and
      `form` down as props. **No route, URL, action, or `?view=` change.**
- [ ] E2. **Preserve §5 item 10 exactly:** the team attendance matrix and the "Exceptions only"
      filter move into `AttendanceHrGrid` **byte-identical**. Do not restyle, do not re-key, do not
      change the filter's semantics. Damaging either is a phase failure.
- [ ] E3. Group the 5-button bulk bar. Two labelled clusters inside the existing bar:
      - `Recalculate` (read/derive): `Derive`, `Derive team`
      - `Lock & release` (destructive/irreversible): `Lock`, `Unlock`, `Lock team`, `Unlock team`
      Separate them with a visible divider and an `aria-label` per group (`role="group"`). Keep
      `Save timesheet` as its own primary action, visually apart from both. Every existing submit
      guard, in-flight label, and `#108` comment moves unchanged.
- [ ] E4. Put the CSV backlog import behind a disclosure (`<details>` / kit Disclosure if Phase 03
      built one), collapsed by default, summary `Import backlog CSV`. **The `importError` /
      `imported` result blocks must auto-expand the disclosure when present** — an import result
      that renders inside a collapsed container is a silent failure. Keep the `importError`-not-
      `error` gating comment and its reasoning intact.
- [ ] E5. **Sticky Save column** on the wide grid. The Save button sits at the far right of a
      12-column horizontal scroller and is off-screen on laptops in AM/PM tenants. Make the action
      `<td>`/`<th>` `sticky right-0` with a `bg-card` backdrop and a left border so it does not read
      as floating. Apply to both grid variants (AM/PM and standard). Verify at 1280px and 1440px
      widths — this is gate G7.
- [ ] E6. Gate: `pnpm check` + `pnpm test` + `pnpm test -- attendance` green. Commit.

### S6 — Settings shared array, hub, and sub-nav

- [ ] F1. Create `src/lib/settings-destinations.ts`:
      ```
      export type SettingsGroup =
        | 'Organization' | 'Time & Attendance' | 'Payroll' | 'Hiring & Separation' | 'System'
      export interface SettingsDestination {
        href: string
        label: string        // the ONE canonical name for this destination
        desc: string         // hub card subtitle
        group: SettingsGroup
        capabilities: Capability[]  // OR-combined; empty = the page's own MANAGE_HR guard suffices
      }
      export const SETTINGS_DESTINATIONS: SettingsDestination[]
      export function visibleSettings(roles: Role[]): SettingsDestination[]
      export const SETTINGS_GROUP_ORDER: SettingsGroup[]
      ```
      `visibleSettings` filters with `canAny` from `$lib/rbac` — the same table and the same
      function the sidebar already uses. `$lib/rbac` is imported, never edited.
- [ ] F2. Populate all 17 destinations. **Capability mapping must reproduce today's visibility
      exactly** (transcribed from `settings/+page.server.ts` and `settings/+page.svelte`):
      | Group | href | Canonical label | capabilities |
      |---|---|---|---|
      | Organization | `/settings/company` | Company Information | `[]` |
      | Organization | `/settings/org` | Org Structure | `[]` |
      | Organization | `/settings/org-chart` | Org Chart | `[]` |
      | Organization | `/settings/roles` | Roles & Access | `['MANAGE_USER_ROLES','ADMINISTER_SYSTEM']` |
      | Time & Attendance | `/settings/schedules` | Work Schedules | `[]` |
      | Time & Attendance | `/settings/holidays` | Holiday Calendar | `[]` |
      | Time & Attendance | `/settings/leave-types` | Leave Types | `[]` |
      | Payroll | `/payroll/config` | Payroll Config | `['ADMINISTER_SYSTEM']` |
      | Payroll | `/payroll/statutory-rates` | Statutory Rates | `['MANAGE_STATUTORY_RATES','PROPOSE_STATUTORY_RATES']` |
      | Payroll | `/settings/pay-codes` | Earnings & Deductions | `[]` |
      | Payroll | `/settings/salary-grades` | Salary Grades | `[]` |
      | Hiring & Separation | `/settings/onboarding` | Onboarding Checklist | `[]` |
      | Hiring & Separation | `/settings/offboarding` | Offboarding Checklist | `[]` |
      | Hiring & Separation | `/settings/posting-approvers` | Posting Approvers | `[]` |
      | Hiring & Separation | `/settings/job-boards` | Job Boards | `[]` |
      | System | `/settings/performance` | Review Schedule | `['ADMINISTER_HR_ORGWIDE']` |
      | System | `/settings/backup` | Document Backup | `['ADMINISTER_SYSTEM']` |
      **Comment-preservation rule:** the four gating comments in `settings/+page.server.ts`
      (#237/#248 on `canRoles`, #178/#133 on `canHrOrgwide`, the proposers note on `canStatutory`)
      explain *why* each gate is what it is. Move them verbatim onto the matching array entries
      before SC-3 deletes the flags. Losing them is losing the reasoning that prevented two bugs.
- [ ] F3. Rewrite `settings/+page.svelte` to render `visibleSettings(data.user.roles)` grouped by
      `SETTINGS_GROUP_ORDER`, one `<h2>` per non-empty group, cards under it. Delete the inline
      `cards` array and the `visible` derive. Card title = `label`, subtitle = `desc`.
- [ ] F4. Apply SC-3: delete the four orphaned flags from `settings/+page.server.ts`. Keep the
      `MANAGE_HR` guard.
- [ ] F5. Create `src/routes/(app)/settings/+layout.svelte`: a horizontal grouped sub-nav rendering
      the same `visibleSettings(...)`, plus an `All settings` link to `/settings`. Mark the current
      page with `aria-current="page"` (matching on `$page.url.pathname`). `<nav aria-label="Settings
      sections">`. `data.user.roles` reaches the layout from the root `(app)/+layout.server.ts`,
      which already returns `user.roles` — **no `settings/+layout.server.ts` is needed and none may
      be created.**
- [ ] F6. In `(app)/+layout.svelte`, replace the hand-written `settingsChildren` array with a derive
      off `visibleSettings(roles)`, keeping the `All settings` entry and the existing group
      header/toggle/`settingsToggled` behavior byte-for-byte. **Touch nothing else in this file** —
      Phase 02 owns it. The sidebar's labels now come from the array, so `Company` → `Company
      Information`, `Schedules` → `Work Schedules`, `Holidays` → `Holiday Calendar`, `Roles` →
      `Roles & Access`. That is the point.
- [ ] F7. Rewrite `tests/unit/settings-cards.test.ts` → assert `visibleSettings(roles)` returns the
      **exact ordered href list** per role, for `SUPER_ADMIN` / `CEO` / `HR_ADMIN` / `MANAGER`.
      Write the expected lists **longhand**, not derived from `CAPABILITIES` — the existing test's
      own comment says recomputing the table from the table proves nothing. Keep a `toEqual` so a
      silently-added destination goes red. Retain the file's `#237`/`#178` header comments.
- [ ] F8. Update `tests/e2e/settings-visibility.spec.ts` for the canonical labels: line ~29/60's
      `getByRole('link', { name: 'Holidays', exact: true })` becomes `'Holiday Calendar'`. The
      `Payroll Config` / `Roles & Access` count-0 assertions for non-super roles are **unchanged and
      are the parity gate** — if the array's capability mapping is wrong, this spec catches it.
- [ ] F9. Gate: `pnpm check` + `pnpm test` + the new `settings-destinations` test green. Commit.

### S7 — settings/org, employees/new, pagination

- [ ] G1. `settings/org`: add a client-side search input (`$state` filter over the assignment table's
      employee name / employee number) and an `Only unassigned` checkbox filter. Pure `$derived`
      filtering over `data.employees` — no load change, no query. Show the result count
      (`Showing N of M employees`) and a kit `EmptyState` when the filter matches nothing. The
      positions catalog above is untouched.
- [ ] G2. `employees/new`: regroup the six existing `<fieldset>`s into two visual groups without
      moving a single input, changing a name, or touching a `required` attribute:
      - **Required to hire** — Personal (firstName, lastName, middleName), Account (email, password,
        role, discordId), Employment (departmentId, jobTitle, employmentType, startDate, rateType,
        basicMonthlySalary, reportsToId, positionId, workScheduleId), Contact (contactPhone,
        contactAddress)
      - **Complete later** — Government IDs, Emergency Contact, Bank/GCash. One collapsed
        `<details>` with summary `Complete later — 12 optional fields` and helper copy: `You can
        save these now or add them to the 201 file after the employee is created.`
      - **Auto-expand on validation failure:** if any field inside the collapsed group has a server
        field error, the disclosure must open. A validation error inside a collapsed container is a
        silent failure. Same rule as E4.
- [ ] G3. Pagination (SC-4). For each of the three lists, in the route `load`: keep the existing
      fetch, then `const p = paginate(url, rows.length, { param, pageSize: 20 })` and return
      `rows.slice(p.skip, p.skip + p.take)` plus `pagination: p`. Distinct `param` per list so two
      tables on one page cannot collide (`separations` → `page`, `inventory` → `page`,
      complaints employee branch → `myPage`, matching the helper's own documented convention).
      Render `<Pagination meta={data.pagination} />` under each table. `Pagination.svelte` self-hides
      when `total <= pageSize`, so short lists are visually unchanged.
- [ ] G4. Complaints: paginate the **employee branch only**. The HR branch is already paginated with
      `param: 'page'` — do not touch it, and do not let the two params collide.
- [ ] G5. Separations: add the `overflow-x-auto` wrapper its sibling tables have (People/Requests
      finding, one class, adjacent to the Pagination edit).
- [ ] G6. Gate: full CI set. Commit.

---

## Verification Evidence

Tier assignments produced by `vc-test-coverage-plan` against `process/context/tests/all-tests.md`
and its routing chain, with the blast-radius test files enumerated
(`tests/e2e/employee.spec.ts`, `employee-view-only.spec.ts`, `settings-visibility.spec.ts`,
`tests/unit/settings-cards.test.ts`, the 14 `attendance-*.test.ts` files). Context chain loaded —
tier assignments are **not** blocked.

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| G1. `pnpm format:check && pnpm lint && pnpm check && pnpm test` in that order, green | Fully-Automated | Phase exit criterion: the CI gate set passes. `pnpm check` is the primary structural gate for the tab wrap — svelte-check catches every reference the restructure could break. Run `pnpm prisma generate` first before believing a red `check`. |
| G2. `resolveTab()` unit test: `null`→`overview`, `''`→`overview`, `'garbage'`→`overview`, each of the 5 ids→itself; `hrefFor()` preserves a pre-existing `?from=` and mutates only `tab` | Fully-Automated (`tests/unit/employee-tab-resolve.test.ts`) | D2 deep-linkability and the `?from=` convention survive tab changes |
| G3. `visibleSettings()` unit test: exact ordered href list per role for SUPER_ADMIN / CEO / HR_ADMIN / MANAGER, longhand, `toEqual` | Fully-Automated (`tests/unit/settings-destinations.test.ts`) | D7 parity — no capability widened or narrowed; MANAGER still cannot see Review Schedule, Payroll Config, Roles, Backup |
| G4. `tests/e2e/settings-visibility.spec.ts` green after the label update — hub shows Holiday Calendar for HR_ADMIN, hides Payroll Config and Roles & Access; sidebar shows the canonical label | Hybrid (needs seeded DB + `pnpm build` + preview; suite is flaky per #287 — read the error, do not re-run blind) | D7 hub + sub-nav + sidebar all render the same names from the same array |
| G5. **P0-7 live probe.** As HR_ADMIN, open an **OFFBOARDED** employee. Force a failure in a Documents-tab action (upload an over-size file) and in a reveal. Assert the error text renders **inside the Documents tab, attached to that form**, with `role="alert"`. Positive control: a successful upload shows its own `role="status"` in the same place. Negative control: the Update Profile card is absent (offboarded) and no error appears anywhere near where it used to. | Agent-Probe (Playwright + `POST /api/v1/_dev/login-as`) | Addendum P0-7 fully closed, including the offboarded tail that is the whole point of the finding |
| G6. **Reveal-survives-save + audit invariant.** Reveal salary. Save a gov-ID edit. Assert the figure is **still unmasked** after the save AND that the Employment History panel is still unmasked. Then `psql` the audit table: assert **exactly one** VIEW row for that employee in the window. Reload the page: assert everything re-masks. | Hybrid (running app + DB assertion) | People finding "reveal drops on any save"; do-not-break item 3 (#111/#290) unharmed |
| G7. **Live walk of `employees/[id]` as HR_ADMIN** on an ACTIVE employee: every one of the 22 actions submits from its new tab and renders its own result in that tab; no section is unreachable from any tab; typing into a Compensation form, switching to Documents and back **preserves the typed text**; `?tab=documents` deep-links; back-navigation via `?from=` still works | Agent-Probe (Playwright, screenshot each tab) | §T6 employees/[id] criterion + the dirty-form risk; "no section became unreachable" is the umbrella's stated phase-07 exit |
| G8. **Attendance persona walk.** As a view-only employee: `/attendance` renders the self view, `Export CSV` present, `Employee` selector absent (this is exactly what `employee-view-only.spec.ts:162-169` already asserts — run it). As HR_ADMIN: the matrix and "Exceptions only" filter behave identically to before; the Save column is visible without horizontal scrolling at 1280px and 1440px; the import disclosure auto-opens on an import result | Hybrid + Agent-Probe | §T6 attendance criterion; §5 item 10 preserved; the sticky-Save finding |
| G9. `pnpm test -- attendance` (14 unit files) green, unchanged | Fully-Automated | The component extraction changed markup only — no attendance logic moved |
| G10. Pagination probe: seed 25+ separations, assert page 1 shows 20 with a working "Next", page 2 shows the rest, and an out-of-range `?page=99` clamps to the last page (the helper's documented behavior) | Hybrid (needs seeded DB) | §T6 unbounded-list criterion |
| G11. **impeccable audit pass** on every changed `.svelte` file | Agent-Probe | Design-quality bar the CI gates cannot express (umbrella per-phase requirement) |
| G12. Regression: nav resolves for HR_ADMIN / MANAGER / employee; masked-reveal still masks, reveals once, writes its audit row | Hybrid | Umbrella regression rule, phases 2+ |

**TDD stubs** for the fully-automated rows (destined for the validate-contract Test Gates section,
not written to disk during PLAN):

```
Failing stub:
test("resolveTab returns overview for null, empty and unknown input", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: resolveTab fallback")
})
test("hrefFor preserves a pre-existing ?from= and mutates only tab", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: tab href param preservation")
})
test("visibleSettings returns the exact ordered href list per role", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: settings destination visibility parity")
})
```

### Known gaps (recorded, not silently dropped)

| Gap | Why untestable in this phase | Resolution |
|---|---|---|
| Query-level pagination for separations / inventory / employee complaints | SC-4 slices an already-fetched array because `src/lib/server/services/**` is out of bounds program-wide. This fixes the **UI wall**, not the query cost. At 10k rows the load still fetches all of them. | **Backlog stub required** (see below). The gate for this phase's criterion stays G10, which proves the affordance — it does **not** prove query efficiency, and the phase report must say so. |
| Rendered contrast / spacing of the new tab strip and sticky Save column | The audit was source-only and the repo has no visual-regression harness | Covered by G7/G8 screenshots + G11 impeccable audit. Agent-Probe, not Known-Gap. |
| Component-level tests for the extracted attendance components | This repo has no component-test harness and does not justify introducing one (the existing `settings-cards.test.ts` header states this precedent) | Covered by G8 (Hybrid) + G9. Agent-Probe/Hybrid, not Known-Gap. |

**Backlog stub to create at EXECUTE time** (vacuous-green ban — the residual is recorded, and this
criterion's gate stays CONDITIONAL until it exists):
`process/features/ui-ux-overhaul/backlog/query-level-pagination-unbounded-lists_NOTE_{date}.md` —
"separations, inventory and employee-side complaints paginate by slicing a full fetch in the route
load. Real `skip`/`take` requires signature changes in `listSeparations`, the inventory query, and
`listComplaintsForEmployee`, which the UI/UX overhaul declared out of bounds. Route through a
service-layer issue."

---

## Test Infra Improvement Notes

(none identified yet)

---

## Acceptance Criteria

Each criterion names the gate that proves it (REQ-TEST-LINK) and that gate's strategy.

| # | Criterion (observable, not subjective) | proven by | strategy |
|---|---|---|---|
| AC-1 | `employees/[id]` renders five tabs; every one of the ~16 sections is reachable from exactly one tab; no section is orphaned | G7 live walk + G1 `pnpm check` | Agent-Probe |
| AC-2 | `?tab=<id>` deep-links; an unknown or absent value falls back to Overview; `?from=` survives every tab change | G2 unit test | Fully-Automated |
| AC-3 | Text typed into one tab's form is still present after switching tabs and back | G7 live walk | Agent-Probe |
| AC-4 | All 22 actions submit from their new tab and render their own scoped result with `role="alert"` / `role="status"` in that tab | G7 live walk | Agent-Probe |
| AC-5 | On an OFFBOARDED employee, a failed document / reveal / contact action renders a visible error attached to its own form | G5 P0-7 probe | Agent-Probe |
| AC-6 | Exactly one emergency-contact surface remains; legacy single-contact column values still display, read-only, and no schema or data write occurs | G7 live walk + G1 | Agent-Probe |
| AC-7 | Update Profile, Change Salary and Promote each carry a purpose statement cross-linking the other two; all three actions are unchanged | G1 + G7 | Agent-Probe |
| AC-8 | Revealing salary then saving a gov-ID edit leaves the figure and the history panel unmasked, with exactly ONE audit VIEW row; a full reload re-masks | G6 | Hybrid |
| AC-9 | Supervisors is a checkbox list posting the same `supervisorIds` to the same action | G1 + G7 | Agent-Probe |
| AC-10 | A view-only employee sees the self view at `/attendance`; HR sees the correction grid; URL, `?view=` and all 11 actions unchanged | G8 + `employee-view-only.spec.ts` | Hybrid |
| AC-11 | The team matrix and "Exceptions only" filter behave identically to pre-phase (do-not-break item 10) | G8 + G9 | Hybrid |
| AC-12 | The bulk bar shows two labelled groups (read vs destructive); import is behind a disclosure that auto-opens on any import result | G8 | Agent-Probe |
| AC-13 | The Save column is reachable without horizontal scrolling at 1280px and 1440px | G8 | Agent-Probe |
| AC-14 | The settings hub, the settings sub-nav and the sidebar Settings children all render from `SETTINGS_DESTINATIONS`; each destination has exactly ONE label across all three | G3 + G4 | Fully-Automated |
| AC-15 | Per-role settings visibility is byte-identical to pre-phase: MANAGER still cannot see Review Schedule, Payroll Config, Roles & Access or Document Backup | G3 unit test (`toEqual`, longhand) + G4 e2e | Fully-Automated |
| AC-16 | `/payroll/config` and `/payroll/statutory-rates` remain linked from BOTH the payroll sub-nav and the settings Payroll group, under one label each | G4 + G7 | Hybrid |
| AC-17 | `settings/org` assignment table has search + only-unassigned filter with a result count and an empty state; the positions catalog is unchanged | G1 + G11 | Agent-Probe |
| AC-18 | `employees/new` shows a "Required to hire" group and a collapsed "Complete later" group; no field name or `required` attribute changed; the group auto-opens on a validation error inside it | G1 + G11 | Agent-Probe |
| AC-19 | Separations, inventory and employee-side complaints paginate at 20 rows with working next/previous and out-of-range clamping | G10 | Hybrid |
| AC-20 | Full CI gate set green, in CI order; e2e no worse than the recorded pre-phase baseline | G1 | Fully-Automated |
| AC-21 | No capability added, removed or re-scoped; `src/lib/rbac.ts`, `prisma/schema.prisma` and `src/lib/server/services/**` untouched | `git diff --stat` shows none of those paths + G3 | Fully-Automated |

**Vacuous-green note:** no criterion above is proved by Known-Gap. The one recorded residual —
query-level pagination — is a *performance* gap behind AC-19's affordance criterion, has a backlog
stub required at EXECUTE time, and does not make any criterion here PASS-able on nothing.

---

## Phase Completion Rules

- A section (S1–S7) is complete only when its own gate is green **and** it is committed. Gates run
  per section, never batched to the end.
- **CODE DONE** = all seven sections committed and the CI gate set green.
- **VERIFIED** = CODE DONE **plus** all of: G5 (offboarded P0-7 probe), G6 (reveal + single-audit
  row), G7 (HR_ADMIN employee-page walk), G8 (attendance persona walk), G11 (impeccable audit),
  G12 (regression), the phase report written, the backlog stub created, and the validate-contract
  recorded. Green CI alone is never VERIFIED.
- If a gate goes red: (1) fix inline if the cause is in this phase's blast radius; (2) if the fix
  would change a file outside the Touchpoints list, stop and route it — do not widen scope;
  (3) if there is no fix path, record it as a known gap in the phase report and continue.
- A failure that damages do-not-break item 3 (masked reveal) or item 10 (attendance matrix /
  Exceptions filter) is a **phase failure**, not a tradeoff. Revert and re-plan.
- **Primary execute anchor:** this file is the single execute anchor for phase 07. There are no
  supporting phase files for this phase; the umbrella plan is context, not an execution target.
  EXECUTE receives this one path.

---

## Exit Gate

```bash
pnpm prisma generate          # before believing any red `check`
pnpm format:check             # CI runs this FIRST and skips the rest on failure
pnpm lint
pnpm check
pnpm test
```

Plus, all required:
- `pnpm test:e2e` no worse than the pre-phase baseline (record the baseline before S1; #287 flake is
  expected, a **new** consistent failure is not)
- impeccable audit pass on every changed `.svelte` file (G11)
- **Live walk of `employees/[id]` as HR_ADMIN** (G7)
- **Live walk of an OFFBOARDED employee** — the P0-7 case (G5)
- Reveal + single-audit-row assertion (G6)
- Phase report written, backlog stub created, commit checkpoint taken

A phase without its report and validate-contract is **CODE DONE**, not VERIFIED.

**Owner gate:** the umbrella states the EXECUTE approval checkpoint is **not** standing-granted for
this program. Present drift, risks, and gates and wait for go-ahead before S1. Never start the dev
server or the DB container — ask the owner.

---

## Staleness Check (run before S1)

The audit is dated 03-09-26 and phases 01, 02, 03, 04, 05, 06 all run first and all touch these
files. Re-verify before editing and record every drift in the phase report:

- [ ] Does `employees/[id]/+page.svelte` still have ~16 sections and 22 actions? (Phase 06 may have
      consolidated the three edit forms — if so, skip C1–C3.)
- [ ] Did Phase 01 already add `action:` keys to some of the 19 actions? Do not duplicate.
- [ ] Did Phase 03 ship a tab primitive, a Disclosure, or an EmptyState? Consume, never fork.
- [ ] Did Phase 04 change the action return-key names on this page? If so, B2's scoped blocks must
      use Phase 04's names, not the current ones.
- [ ] Did Phase 05 wrap Offboard / attendance reset in `ConfirmButton`? Preserve exactly.
- [ ] Did Phase 02 restructure `(app)/+layout.svelte`'s Settings group? F6 rebases onto whatever
      Phase 02 left, changing only the array source.
- [ ] Did Phase 02 or 06 set a payroll label for `/payroll/config` or `/payroll/statutory-rates`
      that differs from the table in F2? Theirs wins.

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)

---

## Resume and Execution Handoff

1. **Selected plan file:**
   `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-07-page-splits_PLAN_03-09-26.md`
2. **Last completed step:** plan written. No code changed. Phases 01–06 not yet executed — this
   phase is blocked on its entry gate (Phase 02 and Phase 03 complete).
3. **Validate-contract status:** pending — PVL has not run on this phase plan.
4. **Context files loaded:** `process/context/all-context.md`,
   `process/context/uxui/all-uxui.md`, `process/context/planning/all-planning.md`,
   `process/context/tests/all-tests.md`, the umbrella plan,
   `docs/ui-ux-audit-2026-09-03.md` (§T6, §4 People + Settings, addendum §B P0-7), and the source
   files listed in Touchpoints.
5. **Next step for a fresh agent:** run the Staleness Check above against current HEAD, record drift
   in this plan, then run PVL. Do **not** start S1 until Phases 02 and 03 are VERIFIED and the owner
   has given the EXECUTE go-ahead. Start at **S1/A1** (check the kit for a Phase 03 tab primitive
   before creating one).
6. **Commit plan:** seven execution commits, S1–S7, in order. Process/plan commits stay separate.
   No `Co-Authored-By` trailer.

---

Plan complete. Review carefully. Say **'ENTER VALIDATE MODE'** when ready to proceed to plan
validation (required before implementation).
