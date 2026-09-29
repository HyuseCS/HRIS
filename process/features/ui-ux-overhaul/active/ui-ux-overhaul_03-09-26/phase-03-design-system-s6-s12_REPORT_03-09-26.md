---
name: report:phase-03-design-system-s6-s12
description: "Phase 03 sections S6-S12 — the Dialog primitive, ConfirmDialog/ReasonDialog as consumers, and the five modal migrations"
date: 03-09-26
phase: "03"
status: COMPLETE
feature: ui-ux-overhaul
plan: process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-03-design-system_PLAN_03-09-26.md
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: "03"
---

# Phase 03 — S6 to S12 execute report

**TL;DR.** Seven sections, seven commits, all gates green at every one. The audit's "five modal
implementations, one correct" is now one implementation: `grep -rln 'fixed inset-0'` returns only
`ui/Dialog.svelte` and the `(app)` layout's nav drawer, exactly as the exit condition demands. e2e
is 141/141 — the recorded baseline, unchanged. The live-browser focus-trap checks (§8.4) are the
owner's manual pass and are NOT run here.

## What Was Done

| Section | Commit | Files |
|---|---|---|
| S6 — `Dialog.svelte` primitive | `24a664a` | `src/lib/components/ui/Dialog.svelte` (new) |
| S7 — ConfirmDialog + ReasonDialog become consumers | `b6042c7` | `src/lib/components/ui/ConfirmDialog.svelte`, `src/lib/components/ui/ReasonDialog.svelte` |
| S8 — roles page dialog | `934f775` | `src/routes/(app)/settings/roles/+page.svelte` |
| S9 — `PunchMapDialog` | `4bb05a1` | `src/lib/components/timesheets/PunchMapDialog.svelte` |
| S10 — `TimesheetModal` | `04dce6e` | `src/lib/components/timesheets/TimesheetModal.svelte` |
| S11 — `NewTimesheetDialog` | `75d88c1` | `src/lib/components/timesheets/NewTimesheetDialog.svelte` |
| S12 — `ApplicantKanban` stage-move dialog | `9c406eb` | `src/lib/components/recruitment/ApplicantKanban.svelte` |

`ConfirmButton.svelte` was NOT edited. It is the compile canary and `pnpm check` stayed at 0 errors
through S7, which is AC-1's automated half.

**The API as built** (the VALIDATE-corrected one, no additions):
`open` (bindable) - `title?` - `labelledBy?` - `size?: 'sm'|'md'|'lg'|'wide'|'full'` -
`padding?: 'none'|'sm'|'md'|'lg'` (default `md`) - `scroll?: boolean` - `zIndex?: number`
(default 60) - `role?: 'dialog'|'alertdialog'` - `initialFocus?: 'panel'|'none'` -
`onclose?` - `children`. No `panelClass` escape hatch exists.

**Measured zIndex, passed explicitly by every consumer, none taking the default silently:**
ConfirmDialog 60, ApplicantKanban 60, PunchMapDialog 60, ReasonDialog 70, NewTimesheetDialog 70,
roles editor 70, TimesheetModal 50.

**Accessible names preserved byte-for-byte:** `Timesheet review`, `New timesheet`, `Edit roles`
(via `aria-labelledby` on the page's own `<h2>`), `Punch location`, `Confirm stage move`. `title`
renders nothing — every consumer still owns its `<h2>`.

**Behaviour gained where there was none:** `NewTimesheetDialog` and `ApplicantKanban` had no trap at
all; `ReasonDialog` had none either. `ApplicantKanban`'s own Escape handler was dead on open because
the panel never took focus — it works now. `TimesheetModal` had only half a trap (focus + a
`svelte:window` Escape, no Tab containment); the window handler is gone and Escape is handled on the
focused panel, which is what keeps the nested `ReasonDialog`'s `stopPropagation` meaningful.

## What Was Skipped or Deferred

- **§8.4 modal before/after focus-trap checks in a live browser (Hybrid).** Deferred to the owner's
  manual pass, per the execute brief. Not run, not claimed.
- **The S8 "before" negative control cannot be run any more.** It had to be recorded against the
  UNTOUCHED roles dialog before the S8 edit; that edit is committed. When the owner runs the §8.4
  pass, the roles dialog's "before" is only recoverable by checking out `b6042c7` (the commit before
  S8). Stated plainly so the "after" is never read as proof on its own.
- **§8.4.7 nested-dialog Escape control (Hybrid).** Same manual pass. The `stopPropagation` is in
  `Dialog.svelte` and is exercised by the `ReasonDialog` nested inside `TimesheetModal:522`.
- **Leaflet-still-initialises check (Hybrid).** Same manual pass. The automated proxy that DID run:
  `timesheet-punch-location.spec.ts` opens the `Punch location` dialog and drives it by keyboard —
  green.
- S13-S17 are a later agent's. Untouched.

## Test Gate Outcomes

Full CI gate set, in CI's order, before every one of the seven commits:

| Gate | Result |
|---|---|
| `pnpm format:check` | PASS (all seven) |
| `pnpm lint` | PASS — 0 errors, 1 warning, all seven. The warning is pre-existing and untouched: `CalculatorWindow.svelte:82` a11y_no_static_element_interactions |
| `pnpm check` | PASS — 1100 files, 0 errors, 1 warning (the same one), all seven |
| `pnpm test` | PASS — 199 files, 2273 tests, all seven |

**S12 boundary e2e:** `pnpm test:e2e` → **141 passed (46.4s)**. Baseline is 141/141. No worse than
baseline; no failures to read. `approval-chain.spec.ts:86` (the unverified casing fix `3143112`)
passed, so that commit is now confirmed good.

**S8-S12 exit condition — met exactly:**

```
$ grep -rln 'fixed inset-0' src --include='*.svelte'
src/lib/components/ui/Dialog.svelte
src/routes/(app)/+layout.svelte
```

## Plan Deviations

All within blast radius. None touches auth, schema, a public API, a container, or any server file.

1. **`Dialog.close()` routes through `onclose` when given, else writes `open`.** Four of the seven
   consumers hold derived open state (`ts != null`, `punch != null`, `editing`, `pending`) and cannot
   `bind:open`. The one-line fork lets the plan's bindable `open` and its `onclose` coexist without a
   consumer having to mirror its state into a second `$state`.
2. **Roles page: the rejected-save focus target moved from the panel to the refusal message.**
   `panelEl` belongs to `Dialog` now, so the page cannot focus it. It focuses the `role="alert"` div
   instead (`bind:this={errorEl}` + `tabindex="-1"`, after `await tick()` so the element exists).
   Same intent — pull the keyboard back inside the modal after the 409 — landing somewhere better.
3. **`TimesheetModal` panel height 92vh → 90vh** and **its transitions 120/150ms → Dialog's
   100/120ms.** One `scroll` boolean cannot express two heights, and the plan's API says no escape
   hatch. Cosmetic.
4. **`Dialog`'s FOCUSABLE sweep filters `offsetParent !== null`.** Taken from `PunchMapDialog`'s
   version rather than the roles page's, since it is the superset — it is what finds Leaflet's
   late-added attribution links and skips hidden controls. The roles page loses nothing.
5. **`ApplicantKanban` gained a real focus trap**, which is a behaviour change the plan asked for
   explicitly (S12: "`Dialog` fixes both").

No hard-stop-class deviation occurred. No server-side edit was needed at any point.

## Test Infra Gaps Found

None new. Noting the standing one for the record: `vitest.config.ts` runs `environment: 'node'`, so
nothing in `Dialog.svelte` is unit-rendered anywhere. Every claim about focus, Tab or Escape in this
report rests on either the e2e suite or the deferred manual pass — never on `pnpm test`.

## Closeout Packet

- **Selected plan:** `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-03-design-system_PLAN_03-09-26.md`
- **Finished:** S6-S12, seven commits, `24a664a`..`9c406eb` on `feat/uiux-phase-3`. Not pushed.
- **Verified:** the four automated gates at every section boundary; the `fixed inset-0` exit grep;
  e2e 141/141 at the S12 boundary, covering all 13 `getByRole('dialog', { name })` assertions.
- **Unverified:** every §8.4 hybrid check (focus-in, Tab wrap, Shift+Tab wrap, Escape + restore,
  backdrop close, nested-dialog Escape, Leaflet init). The S8 "before" control is now only reachable
  from `b6042c7`.
- **Remaining:** S13-S17; then the phase-level hybrid and agent-probe gates.
- **State:** `Keep in active/testing`. The code is done and the automated gates are green, but
  AC-5's hybrid half is unrun, so this is `CODE DONE`, not `VERIFIED`.

## Forward Preview

**Test Infra Found.** `pnpm test:e2e` builds and previews itself — it needs no owner-started server,
only `veent-db-5434`. It is the only automated gate in this phase that can see a dialog at all.

**Blast Radius Changes.** One new shared file every later modal must go through:
`src/lib/components/ui/Dialog.svelte`. Phase 05 (applying confirms to the §T3 table) and phase 04
(the `ConfirmButton` rebuild) both consume it; its props are now fixed by seven live consumers, so
adding one is a real API change, not a local edit.

**Commands to Stay Green.**
`pnpm format:check && pnpm lint && pnpm check && pnpm test`, plus `pnpm test:e2e` at the S15 and S17
boundaries. The S13-S17 agent inherits the same 141/141 baseline.

**Dependency Changes.** None. No package added or removed.
