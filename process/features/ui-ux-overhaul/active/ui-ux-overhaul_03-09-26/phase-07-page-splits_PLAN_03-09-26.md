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
| SC-2 | `employees/[id]/+page.server.ts` — non-`reveal` actions | Thread `revealed`/`history` back through the action result when the caller was already revealed | People finding: "reveal drops on any save". **No new reveal, no second audit row** — see the hard constraint below. **VALIDATE 03-09-26: authorized but expected to be UNUSED.** `grep -n redirect` on this file returns nothing — no action here redirects, so B5's stated fallback trigger cannot occur and the client-only path suffices. Taking SC-2 anyway requires recording the reason in the phase report. |
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
      - **VALIDATE hardening 03-09-26 — Tailwind defeats the bare `hidden` attribute.**
        `[hidden] { display: none }` is a UA rule; any Tailwind display utility on the panel
        element (`grid`, `flex`, `block`, `inline-flex`) wins the cascade and the "hidden" panel
        stays visible. Set BOTH: the attribute (for the accessibility tree and tab order) **and**
        Tailwind's `hidden` class — `hidden={!active} class:hidden={!active}` — or carry no display
        utility on the panel wrapper at all. Gate G14 asserts this.
      - **VALIDATE hardening 03-09-26 — tabs must be anchors, not bare buttons.** A `<button>` +
        `pushState` tab strip is inert before hydration and with JS off, which makes four of the
        five tabs unreachable in exactly the window this repo has already been bitten in (the
        pre-hydration click-drop idiom documented in `tests/e2e/employee-view-only.spec.ts` and
        reused in `settings-visibility.spec.ts`). Render each tab as
        `<a role="tab" href={hrefFor(id)}>` and `preventDefault()` + `pushState` in the click
        handler. Deep links, middle-click and G7's walk all keep working; the ARIA tabs keyboard
        pattern is unchanged.
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
      every success return and every `fail()` payload of the 18 actions that lack it.
      **VALIDATE count correction 03-09-26:** the page has **21** actions, not 22. Three already
      carry the key (`assignTemplate`, `changeCompensation`, `promote`, each via a local
      `const action = '<name>'`), so **18** need it. Read "22 actions" as "21" everywhere in this
      plan, AC-4 and G7 included. Do not rename
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
- [ ] **B5a. HARD GATE (VALIDATE 03-09-26 — cross-employee reveal leak). The `$state` cache MUST be
      keyed to the employee and cleared whenever `data.employee.id` changes.**
      SvelteKit reuses the same component instance across `employees/A` → `employees/B` (same
      route, new `data`). A plain `$state` survives that navigation; the `$derived(form?.revealed)`
      it replaces does not. Without a reset, employee A's unmasked SSS / PhilHealth / Pag-IBIG /
      TIN, bank account, GCash and basic monthly salary render on employee B's page — and because
      those values **pre-fill editable inputs** (`+page.svelte:632-662`, `730-740`, `1551`, `1685`)
      inside `?/update`, `?/changeCompensation` and `?/promote`, a save on B would **write A's data
      onto B**. That is a PII disclosure plus a data-corruption path: a phase failure, not a
      tradeoff. Required shape (either is acceptable; both must survive `pnpm check`):
      - hold `let cache = $state<{ id: string; revealed: R; history: H } | null>(null)` and read it
        through `const revealed = $derived(cache?.id === data.employee.id ? cache.revealed : null)`;
        or
      - wrap the reveal-consuming subtree in `{#key data.employee.id}` so the state is recreated.
      Also required: the cache holds ONLY what `?/reveal` returned for the currently-loaded
      employee; it is never written from any other action's payload; and it is never persisted to
      `sessionStorage`, `localStorage` or `$page.state` — shallow-routing state is serialized into
      the history entry, so putting revealed values there would leave plaintext PII in browser
      history. Proven by gate G13.
      **OWNER-DECISION required before S2:** B5 deliberately changes behavior that
      `+page.svelte:38-42` documents as intentional under #111 ("any other action result (e.g. a
      save) drops back to the masked display"). Holding a reveal across saves widens the
      client-side exposure window even with no extra audit row. The owner must accept the new
      posture — or rule that reveal SHOULD keep dropping on save, which deletes B5, B5a and SC-2
      entirely.
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
      filter move into `AttendanceHrGrid` **behavior-identical**. Do not restyle, do not re-key, do
      not change the filter's semantics. Damaging either is a phase failure.
      **VALIDATE clarification 03-09-26:** "byte-identical" is literally impossible for an
      extraction — every `data.*` reference becomes a prop and the parent's local state must be
      threaded. The bar is behavior-identical markup, and the following MUST be passed down (not
      duplicated, not re-created inside the child): the `exceptionsOnly` filter state, the period /
      date state, and every `createSubmitGuard` instance the moved markup calls. Re-creating a
      guard inside the child gives each component its own in-flight flag and silently re-opens the
      double-submit hole the guards exist to close.
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
      **OWNER-DECISION required (VALIDATE 03-09-26 — this is more than a label swap).** Today
      `settingsChildren` has **8** entries (`All settings`, Company, Earnings & Deductions, Salary
      Grades, Org Structure, Schedules, Roles, Holidays). `visibleSettings()` returns **17**, so a
      straight derive grows the sidebar Settings group to **18** rows for a Super Admin and pulls
      `/payroll/config` and `/payroll/statutory-rates` — two payroll pages — into the Settings nav
      group. That is a navigation IA change, and `(app)/+layout.svelte` IA belongs to Phase 02 per
      the umbrella's shared-file ordering. Pick one before F6:
      (a) sidebar shows the full 17 — accept the growth and get Phase 02's ruling on the two
      payroll rows; or (b) sidebar keeps a curated subset, selected from the array via an explicit
      `inSidebar: boolean` field on `SettingsDestination` — still one source, still one canonical
      label per destination, no IA change. **Recommended default: (b).**
      Parity note either way: keep the outer `isAdmin` (MANAGE_HR) gate on the group. Destinations
      with `capabilities: []` are gated only by that outer check; dropping it would widen the
      sidebar to every role that reaches the layout.
- [ ] F7. Rewrite `tests/unit/settings-cards.test.ts` → assert `visibleSettings(roles)` returns the
      **exact ordered href list** per role, for `SUPER_ADMIN` / `CEO` / `HR_ADMIN` / `MANAGER`.
      Write the expected lists **longhand**, not derived from `CAPABILITIES` — the existing test's
      own comment says recomputing the table from the table proves nothing. Keep a `toEqual` so a
      silently-added destination goes red. Retain the file's `#237`/`#178` header comments.
- [ ] F8. Update `tests/e2e/settings-visibility.spec.ts` for the canonical labels: line ~29/60's
      `getByRole('link', { name: 'Holidays', exact: true })` becomes `'Holiday Calendar'`. The
      `Payroll Config` / `Roles & Access` count-0 assertions for non-super roles are **unchanged and
      are the parity gate** — if the array's capability mapping is wrong, this spec catches it.
      **VALIDATE addition 03-09-26 — the rename is not the only breakage.** The spec's positive
      locators are page-wide (`page.getByRole('link', { name: /Holiday Calendar/ })` at line 26,
      `/Payroll Config/` and `/Roles & Access/` at lines 56-59). Once the sidebar renders the same
      canonical labels, each of those matches **two** links (hub card + sidebar child) and
      Playwright strict mode throws on `toBeVisible()` / `.click()`. Scope every positive locator
      before asserting — e.g. `page.getByRole('main').getByRole('link', { name: ... })` for the hub
      card and `page.getByRole('navigation').getByRole('link', { name: ... })` for the sidebar row.
      The `toHaveCount(0)` negative assertions are unaffected (0 stays 0) and stay exactly as they
      are — they are the parity gate.
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
      **VALIDATE addition 03-09-26:** the HR branch also returns its meta under the key
      `pagination` (`complaints/+page.server.ts:34,56`) and uses the helper's **default pageSize of
      10**, not 20. Return the employee branch's meta under a distinct key (`myPagination`) so the
      template cannot confuse the two, and either match the HR branch at `pageSize: 10` or state in
      the phase report why one feature paginates at two sizes. **Recommended default: `pageSize: 10`
      for the complaints employee branch** (match its sibling); 20 for separations and inventory.
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
| G6. **Reveal-survives-save + audit invariant.** Reveal salary. Save a gov-ID edit. Assert the figure is **still unmasked** after the save AND that the Employment History panel is still unmasked. Then `psql` the audit table: assert **exactly one** VIEW row for that employee in the window. Reload the page: assert everything re-masks. **The probe MUST use an employee that is NOT the logged-in HR user's own 201 file** — `+page.server.ts:617-620` exempts a self-reveal from the audit log, so a self-reveal makes "exactly one row" vacuously true (0 = 0). Name the exact table and predicate in the phase report before running. | Hybrid (running app + DB assertion) | People finding "reveal drops on any save"; do-not-break item 3 (#111/#290) unharmed |
| G7. **Live walk of `employees/[id]` as HR_ADMIN** on an ACTIVE employee: every one of the 22 actions submits from its new tab and renders its own result in that tab; no section is unreachable from any tab; typing into a Compensation form, switching to Documents and back **preserves the typed text**; `?tab=documents` deep-links; back-navigation via `?from=` still works | Agent-Probe (Playwright, screenshot each tab) | §T6 employees/[id] criterion + the dirty-form risk; "no section became unreachable" is the umbrella's stated phase-07 exit |
| G8. **Attendance persona walk.** As a view-only employee: `/attendance` renders the self view, `Export CSV` present, `Employee` selector absent (this is exactly what `employee-view-only.spec.ts:162-169` already asserts — run it). As HR_ADMIN: the matrix and "Exceptions only" filter behave identically to before; the Save column is visible without horizontal scrolling at 1280px and 1440px; the import disclosure auto-opens on an import result | Hybrid + Agent-Probe | §T6 attendance criterion; §5 item 10 preserved; the sticky-Save finding |
| G9. `pnpm test -- attendance` (14 unit files) green, unchanged | Fully-Automated | The component extraction changed markup only — no attendance logic moved |
| G10. Pagination probe: seed 25+ separations, assert page 1 shows 20 with a working "Next", page 2 shows the rest, and an out-of-range `?page=99` clamps to the last page (the helper's documented behavior) | Hybrid (needs seeded DB) | §T6 unbounded-list criterion |
| G11. **impeccable audit pass** on every changed `.svelte` file | Agent-Probe | Design-quality bar the CI gates cannot express (umbrella per-phase requirement) |
| G13. **Cross-employee reveal-cache probe (B5a).** As HR_ADMIN: reveal employee A's gov IDs and salary, then navigate client-side (in-app link, NOT a reload) to employee B. Assert every sensitive field on B renders **masked**, and that the Update Profile / Change Salary / Promote inputs on B are empty or hold B's own masked values — never A's plaintext. Positive control: revealing on B unmasks B. Then assert `$page.state`, `sessionStorage` and `localStorage` hold no plaintext sensitive value. | Agent-Probe (Playwright + `POST /api/v1/_dev/login-as`) | B5a hard gate — the cross-employee leak and the write-A-onto-B path |
| G14. **Hidden-panel render probe.** For each of the five panels: assert `getComputedStyle(panel).display === 'none'` while inactive (catches a Tailwind display utility beating `[hidden]`), that its form controls are out of the tab order, and that a pre-hydration / JS-disabled load of `?tab=documents` still shows the Documents panel (anchor-based tabs). | Agent-Probe (Playwright) | A2's hidden-not-`{#if}` decision actually holds in a Tailwind build |
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
| AC-22 | Revealing employee A then navigating to employee B leaves every sensitive field on B masked, and no editable input on B is pre-filled with A's plaintext | G13 | Agent-Probe |
| AC-23 | Each inactive tab panel computes to `display: none` in the built CSS and its controls are out of the tab order; `?tab=` deep links resolve without JS | G14 | Agent-Probe |
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
  row), **G13 (cross-employee reveal-cache probe — hard gate)**, **G14 (hidden-panel render probe)**, G7 (HR_ADMIN employee-page walk), G8 (attendance persona walk), G11 (impeccable audit),
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

Status: CONDITIONAL
Date: 03-09-26
date: 2026-09-03
generated-by: outer-pvl

Parallel strategy: sequential (capability-constrained deviation — see note)
Rationale: 5/7 signals present (S2 schema/API/auth surface, S4 phase program, S5 depth requested,
S6 high-risk class, S7 5+ files) → HIGH, which recommends parallel subagents or an agent team for
the two-layer fan-out. The validating agent had no Agent/Task tool in this invocation, so both
layers were executed inline against source with Bash/Grep evidence. Every Layer 1 dimension and
every Layer 2 section was covered; the deviation cost wall-clock time, not coverage. Recorded as a
CONCERN, not a gap.

Test gates:

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-2 | `?tab=` resolves, unknown/absent falls back to Overview, `?from=` survives | Fully-Automated | `pnpm test` → `tests/unit/employee-tab-resolve.test.ts` | B |
| AC-14, AC-15 | Per-role settings visibility byte-identical; one label per destination | Fully-Automated | `pnpm test` → `tests/unit/settings-destinations.test.ts` (longhand `toEqual`) | B |
| AC-20, AC-21 | CI gate set green in CI order; no out-of-bounds path touched | Fully-Automated | `pnpm format:check && pnpm lint && pnpm check && pnpm test`, then `git diff --stat` shows no `src/lib/rbac.ts`, `prisma/schema.prisma`, `src/lib/server/services/**` | A |
| AC-11 | Attendance logic unmoved by the component extraction | Fully-Automated | `pnpm test -- attendance` (14 unit files) green, unchanged | A |
| AC-8 | Reveal survives save; exactly ONE audit VIEW row; reload re-masks | Hybrid | G6 — running app + `psql` audit assertion, precondition: app + `veent-db-5434` running (owner starts them), non-self employee | B |
| AC-22 | Reveal cache never crosses employees; no plaintext in `$page.state`/web storage | Agent-Probe | G13 — Playwright + `POST /api/v1/_dev/login-as`, A→B client-side navigation | B |
| AC-23 | Inactive panels compute to `display: none`; `?tab=` works without JS | Agent-Probe | G14 — Playwright computed-style + JS-disabled load | B |
| AC-5 | Offboarded employee still sees scoped action errors | Agent-Probe | G5 — Playwright, OFFBOARDED employee, forced upload + reveal failure, positive and negative controls | B |
| AC-1, AC-3, AC-4, AC-6, AC-7, AC-9 | All 21 actions submit from their tab; typed text survives a tab switch; one emergency-contact surface | Agent-Probe | G7 — HR_ADMIN live walk, screenshot per tab | B |
| AC-10, AC-12, AC-13 | Attendance persona split, bulk-bar grouping, sticky Save at 1280/1440px | Hybrid + Agent-Probe | G8 + `tests/e2e/employee-view-only.spec.ts` | B |
| AC-16 | Payroll pages linked from both nav surfaces, one label each | Hybrid | G4 — `tests/e2e/settings-visibility.spec.ts` (after the F8 locator scoping) | B |
| AC-19 | Three lists paginate at their page size with working next/prev and out-of-range clamping | Hybrid | G10 — seeded DB, 25+ separations, `?page=99` clamps | B |
| AC-17, AC-18 | settings/org filters; employees/new grouping with auto-expand on error | Agent-Probe | G11 impeccable audit + G1 | B |
| — (residual) | Query-level pagination for separations / inventory / employee complaints | — | none — backlog stub required at EXECUTE time | D |

gap-resolution legend: A — proven now. B — gate added by this plan's checklist. C — deferred to a
named later phase. D — backlog test-building stub (named residual; keep-active; continue).

C-4 reconciliation: `strategy` carries only the three proving strategies. The one Known-Gap is
carried as a named residual (row above, gap-resolution D), never as the reason a criterion passes.

Legacy line form:
- `employees/[id]` tabs: [Fully-automated: `pnpm test` + `pnpm check`] | [agent-probe: G7, G13, G14]
- Settings IA: [Fully-automated: `pnpm test` → settings-destinations.test.ts] | [hybrid: `pnpm test:e2e tests/e2e/settings-visibility.spec.ts` — precondition: seeded DB + `pnpm build` + preview]
- Reveal / audit surface: [hybrid: G6 — running app + psql, non-self employee] | [agent-probe: G13]
- Attendance split: [Fully-automated: `pnpm test -- attendance`] | [hybrid: G8 + employee-view-only.spec.ts]
- Pagination: [hybrid: G10 — seeded DB] | [known-gap: query-level pagination, backlog stub required]

Dimension findings:
- Infra fit: PASS — every one of the 21 Touchpoint paths resolves on disk; all 17 settings routes
  exist; `paginate()`, `Pagination.svelte` (`meta` prop, self-hide at `total <= pageSize`) and the
  `myPage` convention are exactly as the plan describes; all named commands exist in `package.json`.
- Test coverage: CONCERN — the two red-by-design tests exist exactly as claimed
  (`settings-cards.test.ts` pins the four flags with `toEqual`; `settings-visibility.spec.ts`
  asserts `'Holidays', exact: true` at lines 29 and 60). But the label unification also makes three
  page-wide positive locators match two links each, which is a Playwright strict-mode failure the
  plan's F8 did not anticipate. Fixed in-plan.
- Breaking changes: CONCERN — F6 as written grows the sidebar Settings group from 8 rows to 18 and
  pulls two `/payroll/*` pages into it. That is a nav-IA change inside a Phase 02-owned file, not
  the label swap the plan describes. Raised as an OWNER-DECISION with a recommended default.
- Security surface: CONCERN (was FAIL, resolved in-plan) — B5's `$state` reveal cache survives an
  `employees/A` → `employees/B` client-side navigation because SvelteKit reuses the component
  instance, and the cached plaintext pre-fills editable inputs that `?/update` /
  `?/changeCompensation` / `?/promote` would then write onto B. Now blocked by the B5a hard gate
  and gate G13, and gated on an owner ruling about the #111 posture change.
- Section S1 (tab shell): CONCERN — mechanically feasible (no duplicate element IDs across panels;
  the page-level `form` prop is unaffected by always-rendered panels because each form sits wholly
  inside one panel; no action on this page redirects, so `use:enhance` never navigates away from
  the pushed `?tab=`). Two real gaps found and fixed in-plan: Tailwind display utilities defeat the
  bare `hidden` attribute, and `<button>`-only tabs are inert before hydration. Highest-risk edit:
  wrapping ~16 sections without editing them — sequence it as wrapper-only, `pnpm check` after each
  panel, no content moves.
- Section S2 (Overview fixes): CONCERN — SC-1's premise verified true (`assignTemplate`,
  `changeCompensation`, `promote` already return `action` via a local `const action`), but the page
  has 21 actions, not 22, so 18 need the key, not 19. B5 carries the security finding above.
  Highest-risk edit: B5; do it last in S2, behind G13.
- Section S3 (compensation signposting): PASS — copy-only plus three container `id`s; all three
  actions verified present and untouched; the Phase 06 skip condition is stated.
- Section S4 (Documents/History/Actions): PASS — all named actions exist; the Phase 05
  `ConfirmButton` preserve-exactly rule matches the umbrella's shared-primitive contract.
- Section S5 (attendance split): CONCERN — `data.canManage` branches at ~15 sites and the
  `?view=employee|team` axis lives inside the `canManage === true` path, so "one two-way branch" is
  an under-description of the extraction. "Byte-identical" is impossible for a component
  extraction; restated as behavior-identical with the `exceptionsOnly` state, the period state and
  the `createSubmitGuard` instances explicitly threaded down. Highest-risk edit: E2 — move the
  matrix first, run `pnpm test -- attendance`, commit, then do E3–E5.
- Section S6 (settings array/hub/sub-nav): CONCERN — the 17-destination capability mapping is
  faithful to the current hub gating, role for role (`super`→ADMINISTER_SYSTEM,
  `roles`→MANAGE_USER_ROLES|ADMINISTER_SYSTEM, `hrOrgwide`→ADMINISTER_HR_ORGWIDE,
  `statutory`→MANAGE_STATUTORY_RATES|PROPOSE_STATUTORY_RATES). The `canAny` client-safe claim is
  VERIFIED: `$lib/rbac.ts` imports only `import type { Role }`, and `(app)/+layout.svelte:8`
  already imports `canAny` from it. The "no `settings/+layout.server.ts` needed" claim is VERIFIED:
  `(app)/+layout.server.ts` returns `user.roles` and child layouts inherit parent layout data.
  Concerns are the sidebar growth (breaking-changes row) and the e2e strict-mode breakage.
- Section S7 (org/new/pagination): CONCERN — the complaints HR branch already returns its meta
  under the key `pagination` at `pageSize: 10`; the employee branch needs a distinct key and a
  page-size ruling. Everything else verified against the helper.

Server-change allow-list audit (special-scrutiny item 2): PASS with one correction. SC-1, SC-3 and
SC-4 are each verified necessary and correctly scoped against source. SC-2 is verified UNNEEDED —
`employees/[id]/+page.server.ts` contains no `redirect(`, so B5's stated fallback trigger cannot
occur. Nothing else in the plan implies a fifth server file: S1–S4 are markup, E1–E5 are markup,
G1 and G2 are client-side `$derived` filtering and fieldset regrouping, and F5's no-new-layout-load
claim holds. Effective server surface: 3 files.

Open gaps:
- Query-level pagination for separations / inventory / employee complaints: known-gap: documented
  as NEW PLAN REQUIRED — backlog stub `query-level-pagination-unbounded-lists_NOTE_{date}.md` must
  be created at EXECUTE time (this phase's own Known Gaps table already requires it).
- Parallel fan-out executed inline rather than as spawned subagents (tooling constraint). Coverage
  is complete; the deviation is recorded for the phase report.

What this coverage does NOT prove:
- `pnpm check` / `pnpm test`: prove no broken reference and no unit regression. They do NOT prove
  any panel is visible, that the tab strip is reachable, or that the reveal cache resets — nothing
  in the unit tier renders this page.
- `tests/unit/settings-destinations.test.ts`: proves the array's per-role href list. It does NOT
  prove the hub, the sub-nav and the sidebar all consume it, nor that the rendered labels match.
- `tests/unit/employee-tab-resolve.test.ts`: proves two pure functions. It does NOT prove
  `pushState` fires, that `?from=` survives a real click, or that an inactive panel is hidden.
- `pnpm test -- attendance`: proves the 14 attendance unit files still pass. It does NOT prove the
  extracted components render, that the matrix is unchanged, or that the submit guards survived —
  this repo has no component-test harness.
- G4 e2e: proves label parity for four roles on two surfaces. It does NOT prove the other 13
  destinations' labels, nor the sub-nav's `aria-current`.
- G6: proves one audit row for one reveal-then-save sequence on one employee. It does NOT prove the
  cache is per-employee — that is G13's job alone.
- G10: proves the pagination affordance. It does NOT prove query cost; the load still fetches every
  row (the recorded residual).
- G7/G8/G11/G13/G14 are Agent-Probe: they prove what an agent observed in one session on one seed.
  They do NOT prove behavior across tenants, viewports beyond 1280/1440px, or browsers beyond the
  Playwright default.

Gate: CONDITIONAL (concerns noted; the one FAIL-severity finding was resolved by amending this plan
before the contract was written, and is now held by the B5a hard gate + G13)
Accepted by: session (autonomous, outer PVL, no user present at V5) — accepted concerns:
sidebar-growth IA change (OWNER-DECISION, recommended default (b)), #111 reveal-posture change
(OWNER-DECISION, blocks S2), e2e strict-mode locator scoping, attendance extraction wording and
threaded state, complaints pagination key/page-size, 21-vs-22 action count, SC-2 unused,
inline-executed fan-out.

### OWNER-DECISION gates (must be answered before the named section runs)

| # | Decision | Blocks | Recommended default |
|---|---|---|---|
| OD-1 | Accept holding a reveal across saves (a real widening of the client-side exposure window under #111), or rule that reveal keeps dropping on save and delete B5/B5a/SC-2? | S2 (B5) | Accept, with B5a's per-employee key + G13 as the price of admission |
| OD-2 | Sidebar Settings group: show all 17 destinations (and rule on the two `/payroll/*` rows, which is Phase 02's IA), or keep a curated subset via an `inSidebar` field on the shared array? | S6 (F6) | (b) curated subset — same single source, zero Phase 02 overlap |
| OD-3 | Complaints employee-branch page size: 10 (match its HR sibling) or 20 (match separations/inventory)? | S7 (G3/G4) | 10 |
| OD-4 | Owner EXECUTE go-ahead for this phase, per the umbrella (not standing-granted), after Phases 02 and 03 are VERIFIED | S1 | — owner's call |

### REJECTED-ROUTED (cross-phase-owned files)

| Finding | Owner | Routing |
|---|---|---|
| The three overlapping edit forms (`?/update` / `?/changeCompensation` / `?/promote`) should be consolidated, not merely signposted | Phase 06 (§T5) | REJECTED-ROUTED — this phase adds signposting only (C3 already states the skip condition). Do not consolidate here. |
| `(app)/+layout.svelte` nav shape beyond the Settings children | Phase 02 | REJECTED-ROUTED — F6 may change only the Settings children's source; OD-2 exists so the row *count* change is ruled on by Phase 02, not decided inside this phase. |
| `ConfirmButton` around Offboard / attendance reset | Phase 04 owns the rebuild, Phase 05 consumes it | REJECTED-ROUTED — D2 preserves any Phase 05 wrapper exactly and adds none. Per the umbrella's shared-primitive contract, any finding proposing a `ConfirmButton` edit here is a contract violation, not a gap. |
| `MANAGER` / `ADMINISTER_HR_ORGWIDE` guard alignment | Umbrella owner-decision registry (raised by Phase 02) | REJECTED-ROUTED — F2 reproduces today's visibility exactly and must not "fix" the guard. |
| Real `skip`/`take` in `listSeparations`, the inventory query and `listComplaintsForEmployee` | `src/lib/server/services/**` — out of bounds program-wide | REJECTED-ROUTED to backlog: `query-level-pagination-unbounded-lists_NOTE_{date}.md` |

Autonomous goal block: BRANCH B — the umbrella
(`ui-ux-overhaul-umbrella_PLAN_03-09-26.md`, `## Stable Program Goal` at line 79) governs. No
`## Autonomous Goal Block` is written into this phase plan. Reference for latest state:
`process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/ui-ux-overhaul-umbrella_PLAN_03-09-26.md`

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
