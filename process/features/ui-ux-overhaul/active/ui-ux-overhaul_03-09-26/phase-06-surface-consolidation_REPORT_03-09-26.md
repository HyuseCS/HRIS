---
name: report:phase-06-surface-consolidation
description: "Execute report for phase 06 of the Veent HRIS UI/UX overhaul — four duplicate surfaces resolved to one canonical door each: awaiting-you aggregator, /leave/new retired to a redirect, one timesheet-creation entry, and a capability-filtered payroll tab bar."
date: 03-09-26
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: "06"
---

# Phase 06 — Surface Consolidation — Execute Report

- **Phase**: 06 — surface-consolidation
- **Date**: 03-09-26
- **Status**: **CODE DONE — NOT VERIFIED.** All four sections implemented, all four mutation
  checks red as predicted, full CI gate set green. Every Hybrid and Agent-Probe row in the plan's
  Verification Evidence table is still UNRUN — see *Deferred to the owner's pass*.
- **Branch**: `feat/uiux-phase-6`
- **Plan**: `phase-06-surface-consolidation_PLAN_03-09-26.md`
- **Commits**: `c9f77c6` (S1), `9b5eb74` (S2), `c437b53` (S3), `1efdfcd` (S4)

---

## Research-refresh drift log

Every line anchor in the plan came from HEAD `5e5cdfe`. Phases 01–05 moved most of them. Each was
re-grepped before the edit.

### S1 / S2 (prior agent, summarized)

| Anchor | Drift |
|---|---|
| `src/lib/nav.ts` (item 4 forward reference) | **The file now EXISTS** — phase 02 extracted the nav there, so the plan's "check which anchor is real" caveat resolved to the forward one. The summed Approvals badge was already shipped by phase 02 item 10, reading `data.pendingApprovals.total`. S1 item 4 was therefore **verify-only, no edit** — verified at `(app)/+layout.svelte:386-393`. CONCERN-10 does not fire: the pill is present and numeric. |
| dashboard `+page.server.ts:138-141` | forwarding block moved; `pendingProposals` added there. |
| dashboard quick action `:758` | line moved (phases 01/04 edits above it); repointed to `/requests?new=leave`. |
| `requests/index.ts:37` comment | moved; "three filing paths" corrected to two. |
| `/leave/new` redirect mutation check | run at UNIT level via a new `tests/unit/leave-new-redirect.test.ts` rather than e2e (the e2e suite is not run in this environment — no servers started). |

### S3 (this agent)

| Plan anchor | Reality at execution | Effect |
|---|---|---|
| `timesheets/+page.svelte:198-209` — an `<h1>` header row with the New-Timesheet button inside it | Phase 03 replaced the whole header row with `<PageHeader title="Timesheets" />` at `:197`. The New-Timesheet button is already its OWN block at `:201-210`, not inside a header row. | Item 15's "the header row collapses to the bare `<h1>`" is moot — there is no header row left to collapse. The button simply moved into the new section. |
| `timesheets/+page.svelte:211-217` — `{#if form?.saved}` saved-banner | Phase 04 replaced it with the shared `Banner` component, and added a second `Banner kind="error"` above it. | Left exactly as phase 04 left them, per item 15. Both banners now sit ABOVE the new section (previously the saved-banner sat between the button and the panel), which is where the plan requires them. |
| `timesheets/+page.svelte:219-221` — `AggregatePanel` | At `:223-225`. | Moved inside the new section, `data.isHrAdmin` gate unchanged. |
| `AggregatePanel.svelte` `<h2>` | Unmoved. | Re-labelled. **Deviation D-1 below**: the tag became `<h3>`. |
| `attendance/+page.svelte:383-393` — Save-as-timesheet form | At `:368-378`. | `title` attribute removed, visible copy + `/timesheets` cross-link added below the button row. |

### S4 (this agent)

| Plan anchor | Reality at execution | Effect |
|---|---|---|
| `payroll/+layout.server.ts:14-16` | Unmoved (`:15-17`). | Four booleans added — see deviation D-2 for where they live. |
| `payroll/+layout.svelte` "renders only `{@render children()}` plus the FAB" | **Still true.** Phase 03/05 did not touch it. | Tab bar added above `{@render children()}`; FAB and `onCalculatorPage` untouched. |
| `payroll/periods/+page.svelte` heading | Phase 03 replaced the heading with `<PageHeader>`, which already accepts a `description` prop. | Item 25's copy went in as `description=` rather than a hand-rolled `<p>` — smaller diff, and it is the kit's own slot for exactly this. |
| `payroll/periods/+page.svelte:193` `Detail` link | At `:199`. | → `View run` + `title`. |
| `payroll/+page.svelte:162-168` — inline 4-way `badge-*` ternary | **GONE.** Phase 03's kit sweep replaced it with `<Badge status={run.status} domain="payrollRun" />`. | Items 27/29 already satisfied. |
| `payroll/[id]/+page.svelte:91` — 2-way `APPROVED ? green : blue` | **GONE.** Phase 03 replaced it with the same `<Badge>` at `:135`. | **Item 28's bug is already fixed.** `badge.ts` tones `VOIDED: 'red'` for every domain, so a voided run already reads red on both pages. This phase pins that contract instead of re-fixing it — see deviation D-3. |
| `$lib/labels.ts` | Exists (25 enum maps, phase 03). The run-status *tone* map is NOT in it — phase 03 put tone resolution in `$lib/components/ui/badge.ts` (`toneFor` / `badgeFor`), the module `Badge.svelte` reads. | Deviation D-3. |
| `tests/unit/destructive-confirms.test.ts` WIRING/COPY pins | Checked against every file this phase touched. **No pinned control or message moved.** The attendance `?/resetDay` ConfirmButtons and the periods `?/void` / `?/release` wrappers were not opened. No update needed; the file is unchanged and green. |

---

## Per-section outcomes

### S3 — one timesheet-creation entry (`c437b53`, 3 files, +45/−18)

- `/timesheets` now has one `<section>` titled **"Create a timesheet"**, rendered when
  `data.canCreate || data.isHrAdmin`. It holds the New-Timesheet button (still gated on
  `canCreate`, still bound to `showCreate`, still opening `NewTimesheetDialog` which stays mounted
  at the page foot) and `AggregatePanel` (still gated on `isHrAdmin`).
- The shape-choice line sits under the heading with the `/attendance` link inline, verbatim intent:
  pay period → New Timesheet; one week of Discord punches → Aggregate from time logs; custom
  same-month range → correct it on Attendance and use Save as timesheet there.
- Both `Banner`s stay outside and above the section, with a comment naming why (they report ANY
  action on the page, so gating them on `canCreate` would hide a result from a user who can act but
  cannot create).
- `AggregatePanel`'s heading now reads **"Aggregate from time logs — one week"**; its sub-copy names
  the week shape explicitly (Monday to Sunday, Manila time — verified against
  `manilaWeekStart` in `src/lib/utils/dates.ts:87-95`, which is Mon-anchored).
- `/attendance`'s Save-as-timesheet lost its hover-only `title` and gained a visible
  `text-xs text-muted-foreground` line plus an **All timesheets** cross-link.
- `?/saveTimesheet`, its cross-month guard and `AggregatePanel`'s preview/commit matching are
  byte-for-byte untouched.

### S4 — payroll sub-nav and runs↔periods linking (`1efdfcd`, 7 files, +258/−10)

- New `src/lib/payroll-tabs.ts`: `payrollTabCapabilities(roles)` (the four predicates),
  `payrollTabs(caps)` (the filtered tab list) and `activePayrollTab(tabs, pathname)`.
- `payroll/+layout.server.ts` calls `payrollTabCapabilities` once, keeps its existing
  `!canManage && !canSignOff → error(403)` gate unchanged, and spreads the four booleans onto
  **both** branches of the `canManage ? … : …` return.
- `payroll/+layout.svelte` renders the tab bar above `{@render children()}`. The calculator FAB and
  the `onCalculatorPage` suppression are untouched.
- **CONCERN-8 applied.** Runs is shown on `canManage || canSignOff`, mirroring the LOAD guard
  `payroll/+page.server.ts:21`. The new test's VERIFIER row expects **Runs only**, never an empty
  list.
- **Item-21 correction applied.** Statutory Rates filters on
  `MANAGE_STATUTORY_RATES || PROPOSE_STATUTORY_RATES`, the route's real gate, so HR_ADMIN keeps it.
- **OD-3 applied.** Tabs hide. No disabled variant, no tooltip stub.
- **CONCERN-11 applied.** The `{#if tabs.length}` branch is kept as a safety net with a comment
  saying it is unreachable for any role that passes the 403 gate. No test asserts an empty bar.
- Active tab: longest-prefix match, so `/payroll/periods` lights Periods only, and a run detail page
  `/payroll/{id}` lights Runs. `aria-current="page"` on the winner.
- `/payroll/periods` carries the one-sentence period→run copy, and its row link reads **View run**
  with `title="Opens the payroll run for this period"`.
- The 6-value period status map at `periods/+page.svelte:26-33` was **not** touched.

---

## Test gate outcomes

Full CI gate set, in CI order, run at the end of each section:

| Gate | S3 | S4 |
|---|---|---|
| `pnpm format:check` | PASS | PASS |
| `pnpm lint` | PASS — 0 errors, 1 pre-existing warning (`CalculatorWindow.svelte:82`, untouched) | PASS — same |
| `pnpm check` | PASS — 1113 files, 0 errors | PASS — 1116 files, 0 errors |
| `pnpm test` | PASS — 207 files / 2350 tests | PASS — 209 files / 2365 tests |

Plan-named extras, all passing **unmodified**: `attendance-save-timesheet-cross-month.test.ts`,
`payroll-run-void-action.test.ts`, `payroll-period-actors.test.ts`, `pay-periods.test.ts`,
`destructive-confirms.test.ts`.

New gates added this session:

- `tests/unit/payroll-tabs-capability.test.ts` — 10 tests. Six per-role cases from the item-23
  table (SUPER_ADMIN, CEO, PAYROLL_OFFICER, HR_ADMIN, VERIFIER = Runs only, EMPLOYEE = empty with
  the layout's own 403 condition asserted alongside), a multi-role union case, and three
  `activePayrollTab` cases (which close the contract's "does not prove `aria-current`" gap at the
  builder level, not at the render level).
- `tests/unit/payroll-status-badge.test.ts` — 5 tests. The 4-way run-status contract on the shared
  helper, an exhaustiveness check against `PAYROLL_RUN_STATUS_LABELS` (so a new
  `PayrollRunStatus` enum value fails the gate rather than silently defaulting to gray), and a
  source scan proving neither payroll page kept a local `badge-*` colour expression.

E2E was NOT run (no servers started, per instruction). Playwright baseline comparison is deferred.

---

## Mutation-check evidence (all four)

| # | Mutation | Result |
|---|---|---|
| 1 | Break the `APPROVE_REQUESTS` short-circuit in `countPendingApprovals` | **RED** — `approval-queues.test.ts` failed at the `not.toHaveBeenCalled()` assertions. Recorded by the S1/S2 agent, with the finding that the **zeros-only assertion was VACUOUS under mutation**: a non-approver still got zeros because the underlying queries returned nothing for them. The not-called assertions are what bite. |
| 2 | Flip `VOIDED → green` in `badge.ts` `BASE_TONES` | **RED** — `payroll-status-badge.test.ts` 2 failed / 3 passed: `expected 'green' to be 'red'` and `expected { tone: 'green', label: 'Voided' } to deeply equal { tone: 'red', … }`. Restored; `git diff` on `badge.ts` empty. |
| 3 | Point the `/leave/new` redirect at the wrong target | **RED** — `tests/unit/leave-new-redirect.test.ts` failed. Recorded by the S1/S2 agent. |
| 4 | Swap the Statutory Rates predicate to `MANAGE_STATUTORY_RATES` alone | **RED** — `payroll-tabs-capability.test.ts` 2 failed / 8 passed: HR_ADMIN got `['Runs','Periods','Calculator']`, expected `['Runs','Periods','Statutory Rates','Calculator']`; the multi-role union case failed with it. This is exactly the regression the item-21 correction prevents. Restored; tree clean, full suite re-run green. |

Note on check 4: it only bites because the predicate lives in ONE place that both the layout and the
test read (deviation D-2). Had the test re-declared the predicate, mutating the layout would have
left it green.

---

## Deviations from the plan

All four are within blast-radius (naming / file location / already-done), none touches auth,
schema, capabilities or a public contract.

**D-1 — `AggregatePanel`'s heading is an `<h3>`, not an `<h2>` (item 18).** The panel is now nested
inside the "Create a timesheet" `<section>`, whose heading is the `<h2>`. Keeping a second `<h2>`
inside it would break the heading outline for screen-reader users. Text is exactly as the plan
specifies.

**D-2 — the four tab predicates live in `$lib/payroll-tabs.ts`, not inline in
`payroll/+layout.server.ts` (item 21).** The plan wanted them computed in the layout; the unit gate
(item 23) then needed the same four predicates, and re-declaring them in the test would have made
mutation check 4 unable to fail. One exported `payrollTabCapabilities(roles)` serves both. The
layout's 403 gate, its condition and its two return branches are otherwise unchanged, and no new
capability is introduced.

*Consequence:* `tests/unit/nav-sections.test.ts` (phase 02's fixture-staleness canary) greps the
guard FILE for the literal capability names. Moving the predicates made it fail. The `/payroll`
fixture's `file` field now points at `src/lib/payroll-tabs.ts` with a comment saying why. The
capability list and the parity assertion are unchanged — only the file the canary reads moved. This
is the one phase-02 test edited by this phase, in the same commit as the change that required it.

**D-3 — the run-status helper is `toneFor(status, 'payrollRun')` in
`$lib/components/ui/badge.ts`, not a new map in `$lib/labels.ts` (items 27–30).** Phase 03 already
built exactly this helper and already swept BOTH payroll call sites onto `<Badge>`. Its map is the
plan's contract verbatim: `APPROVED→green`, `COMPUTED→blue`, `VOIDED→red`, `DRAFT→gray`. Adding a
second copy in `$lib/labels.ts` would fork the very helper the plan's Public Contracts section
forbids phases 07/08 from forking. **The item-28 VOIDED-reads-blue bug was therefore already fixed
by phase 03, not by this phase.** What this phase adds is the gate that keeps it fixed
(`payroll-status-badge.test.ts`, including a source scan proving no page-local colour map came
back).

**D-4 — item 25's copy went into `PageHeader`'s existing `description` prop** rather than a new
`<p>` under the heading. Same rendered result, kit-native, smaller diff.

---

## Test infra gaps found

- **A source-scan canary breaks on a legitimate refactor.** `nav-sections.test.ts`'s staleness
  canary asserts a capability *string* appears in a *named file*. Extracting a predicate to a shared
  module is a false positive for it. It is still worth keeping (it is the only thing stopping the
  nav fixture rotting into a self-fulfilling assertion), but any phase that moves a guard must
  expect to move its fixture pointer too.
- **No component-interaction harness.** `vitest.config.ts` is `environment: 'node'`, so nothing
  here can mount a Svelte component. `payroll-tabs-capability.test.ts` proves the BUILDER; it cannot
  prove the layout calls it, that the bar renders, or that `aria-current` lands on the DOM node.
  Same limitation the phase 05 report recorded. That half rests on the owner's live walk.

---

## Deferred to the owner's pass (phase is CODE DONE, not VERIFIED)

Nothing below was run. All of it is exit-blocking per the plan's Phase Completion Rules.

1. **Hybrid role walk** — HR_ADMIN, MANAGER, PAYROLL_OFFICER, a sign-off-only VERIFIER and a plain
   employee. Every payroll tab shown must resolve without a 403; every aggregator row shown must
   resolve; MANAGER must reach nothing new. This is the program's hard safety constraint and the
   only real proof of S4.
2. **Agent-Probe live walk of the four consolidated flows** — file leave from the dashboard link;
   create a timesheet by each of the three doors; open a period's run via **View run**; watch the
   nav badge and the Awaiting-you counts move after one approval.
3. **Both themes** — light and dark check of the Awaiting-you block, the group badge, the payroll
   tab bar (active vs inactive tab contrast) and both run-status badges.
4. **`impeccable` audit pass** over the four changed surfaces.
5. **Masked-reveal regression** (program do-not-break item 3): mask holds, reveal once, audit row
   written.
6. **Playwright suite vs the pre-phase baseline** (#287). The e2e specs S2 repointed
   (`back-navigation`, `employee`, `leave-balances`) have not been executed.

---

## Closeout packet

- **Selected plan:** `phase-06-surface-consolidation_PLAN_03-09-26.md`
- **Finished:** all four sections, all 31 checklist items, four commits, two new unit gates, four
  mutation checks red as predicted.
- **Verified:** the fully-automated tier only (CI gate set green in CI order after each section).
- **Unverified:** every Hybrid and Agent-Probe row above.
- **Best next state:** **Keep in active/testing.** Not archivable until the role walk and the live
  walk run.

---

## Forward Preview — for phase 07 (`page-splits`)

**Test infra found.** `vitest` `environment: 'node'`, no component harness — assert on exported
plain modules (`badge.ts`, `payroll-tabs.ts`, `table.ts`) or on source text, never on a render.
`destructive-confirms.test.ts` and `nav-sections.test.ts` are both source scans that will fail on a
legitimate move: phase 07 splits `employees/[id]/+page.svelte` and `attendance/+page.svelte`, and
**both are pinned** — `destructive-confirms.test.ts` WIRING pins `attendance/+page.svelte`'s
`?/resetDay` and the employees offboard form, and its COPY block pins 17 message substrings. Moving
a confirm into a new child component means updating that fixture in the same commit.

**Blast-radius changes.** New file `src/lib/payroll-tabs.ts` — phase 07 must not fork its
predicates. `$lib/components/ui/badge.ts` now carries the run-status contract that this phase's
`payroll-status-badge.test.ts` pins; do not add a page-local `badge-*` class to a payroll page, the
scan will catch it. `payroll/+layout.svelte` now renders a nav bar above every payroll page — a
phase 07 page split under `/payroll` inherits it for free and must not hand-roll its own.

**Commands to stay green.** `pnpm format:check && pnpm lint && pnpm check && pnpm test`, in that
order (CI runs format FIRST and skips the rest on failure). 209 files / 2365 tests, ~8s.

**Dependency changes.** None. No package added, no schema change, no capability change.

**What `employees/[id]` still owes — deliberately untouched here.** Phase 06's scope explicitly
deferred T5 items 5 and 6 to phase 07, and **no file under
`src/routes/(app)/employees/[id]/` was opened by this phase.** Phase 07 therefore inherits both,
intact and unsignposted:

- **The emergency-contact triplication** (T5 item 5) — still three places, no cross-links, no
  canonical door named.
- **The three overlapping edit forms** (T5 item 6) — **NOT consolidated.** Phase 07's C1-C2
  signposting work proceeds exactly as planned; nothing about that page changed under it.
- The audited career-event path was not touched at all, so phase 07 inherits it at its phase-05
  state.
