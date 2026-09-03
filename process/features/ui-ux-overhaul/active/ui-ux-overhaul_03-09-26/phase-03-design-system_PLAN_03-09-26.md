---
name: plan:phase-03-design-system
description: "Phase 03 of the UI/UX overhaul — design-system convergence: theme-paired badge tokens, a Badge primitive + $lib/labels, a Dialog base carrying the focus trap, and a kit-adoption sweep across the (app) routes"
date: 03-09-26
feature: ui-ux-overhaul
phase: "03"
---

# Phase 03 — Design-System Convergence

**TL;DR.** Light mode is broken wherever status is shown, and the UI kit that was built to stop
that drift is used by almost nobody. This phase fixes the colours at the token layer, adds three
small shared modules (`Badge.svelte`, `$lib/labels.ts`, `Dialog.svelte`), and then does a
mechanical sweep replacing hand-rolled copies across the `(app)` routes. Nothing here changes
behaviour or server code. 17 committable sections, each with its own gate.

---

## Overview

**Date**: 03-09-26
**Status**: ACTIVE — planned, not started
**Complexity**: COMPLEX (phase 03 of the ui-ux-overhaul phase program)
**Feature**: ui-ux-overhaul
**Branch**: cut from `staging`

Phase 03 is the design-system convergence step of the UI/UX overhaul. The audit
(`docs/ui-ux-audit-2026-09-03.md`) found two coupled defects: theme T2, light mode is broken
wherever status is shown (135 dark-only colour occurrences, and `.badge-gray` rendering
white-on-white), and theme T4, the UI kit built to prevent exactly that drift is adopted by almost
nobody (PageHeader in 20 of 61 pages, EmptyState in 5, Table in 2, five modal implementations of
which one is correct).

This phase fixes the colours at the token layer, adds four small shared modules, and then sweeps
the `(app)` routes to use them. It is deliberately mechanical: no server code, no behaviour
changes, no new dependencies, and every public component API stays backward-compatible so the other
phases' pages keep compiling.

## Goal

Make one visual answer exist for each of: a status pill, a modal, a page title, an empty table, a
money column, and an error/success banner — and make the light theme correct at every one of them.

Success is observable: on a light-theme page, every status pill is readable at WCAG AA; every modal
traps Tab; and the count of hand-rolled `statusClass` copies is zero.

## Scope

### In scope

| Item | Decision ref |
|---|---|
| Fix `.badge-*` classes in `src/app.css` to theme-paired colours | D5(a) |
| New `src/lib/components/ui/Badge.svelte` (status + domain props) | D5(b) |
| New `src/lib/labels.ts` — enum→human-label maps | D5(c) |
| New `src/lib/components/ui/Dialog.svelte` base with the lifted focus trap | D6 |
| Rewrite `ConfirmDialog` + `ReasonDialog` as thin consumers, APIs unchanged | D6 |
| Migrate 5 remaining modals one at a time, each with its own check | D6 |
| Kit adoption sweep: `PageHeader`, `EmptyState`, banner recipe, `tabular-nums` | Kit sweep |
| Fix hardcoded scrollbar hover colour (`app.css:141`) | T2 |
| Fix dark-only approval-chain step circles (`requests/[id]:405-411`) | T2 |

### Explicitly out of scope

| Deferred item | Goes to |
|---|---|
| `ConfirmButton` behaviour rebuild (silent-on-success, no busy state) | Phase 04 |
| Applying confirms to new sites (the §T3 table) | Phase 05 |
| Enum-label adoption sweep in body copy | Phase 08 — this phase only CREATES `$lib/labels.ts` and uses it inside `Badge` |
| Nav / IA restructure (T1) | Phase 02 |
| Server action shape, toasts, flash messages (the Addendum §H feedback contract) | Phase 07 |
| Full `Table.svelte` migration of all 37 raw tables | This phase does the **minimum**: `tabular-nums` on money columns. Full migration is a later phase. |

## Binding Decisions (from INNOVATE)

**D5 — both-layers badge system.** Fixing only the `.badge-*` classes leaves 135 inline
`text-*-400` sites untouched; adding only a component leaves the 32 existing `.badge-*` usages
broken. Do both.

- (a) `.badge-*` classes become theme-paired (`text-green-700 dark:text-green-400`). `.badge-gray`
  gets real muted tokens — today it is `bg-white/10 text-white/50`, literally white-on-white in
  light mode.
- (b) `Badge.svelte` is thin: it maps a `status` string (+ optional `domain`) to one `.badge-*`
  class and one label. It does not invent new colours.
- (c) `$lib/labels.ts` holds the enum→human maps so `Badge` and plain-copy sites share one source.

**REJECTED:** a `StatusPill` per domain (5+ near-identical components); a `cva`-style variant
library (new dependency, banned).

**D6 — one `Dialog.svelte` base.** Five modal implementations exist and only the roles page is
correct. Lift that trap into a primitive rather than copy it four more times.

- `ConfirmDialog` and `ReasonDialog` keep their **exact current public props and events** so no
  call site changes.
- The other five modals migrate **one per section**, each with its own before/after check. Batching
  them is what makes a focus-trap regression invisible.

**REJECTED:** native `<dialog>` — the house pattern is hand-rolled, `showModal()` changes stacking
and transition behaviour across 8 files, and the audit's §5 list says the overhaul must not
destroy working behaviour. Not worth the blast radius in a convergence phase.

## Touchpoints

**Modified — shared:**

- `src/app.css` (badge classes, scrollbar hover)
- `src/lib/components/ui/ConfirmDialog.svelte`
- `src/lib/components/ui/ReasonDialog.svelte`

**Created:**

- `src/lib/labels.ts`
- `src/lib/components/ui/Badge.svelte`
- `src/lib/components/ui/Dialog.svelte`
- `src/lib/components/ui/Banner.svelte`

**Modified — modals:**

- `src/routes/(app)/settings/roles/+page.svelte`
- `src/lib/components/timesheets/PunchMapDialog.svelte`
- `src/lib/components/timesheets/TimesheetModal.svelte`
- `src/lib/components/timesheets/NewTimesheetDialog.svelte`
- `src/lib/components/recruitment/ApplicantKanban.svelte`

**Modified — sweep (mechanical, call-site inventory in §6).** Files under `src/routes/(app)/` plus
`src/lib/components/employees/EmployeeCard.svelte`, `src/lib/components/leave/BalanceSummary.svelte`.

**Read only:** `src/lib/rbac.ts`, `prisma/schema.prisma` (enum value lists for `labels.ts`),
`docs/ui-ux-audit-2026-09-03.md`.

**Not touched:** anything under `src/lib/server/`, `src/routes/api/`, `prisma/schema.prisma`,
`+page.server.ts` files. **If a section needs a server-side edit, the section is mis-scoped — stop
and flag it.**

## Public Contracts

| Contract | Shape | Compatibility rule |
|---|---|---|
| `ConfirmDialog` props | `open` (bindable), `title`, `message`, `confirmText`, `cancelText`, `onconfirm` | **Unchanged.** No prop added, removed, renamed, or made required. `ConfirmButton.svelte` consumes it and must keep compiling untouched. |
| `ReasonDialog` props | `open` (bindable), `title`, `message`, `placeholder`, `confirmText`, `cancelText`, `confirmClass`, `onconfirm(reason)` | **Unchanged.** Same rule. |
| `Dialog.svelte` (new) | `open` (bindable), `title`, `labelledBy?`, `size?: 'sm'\|'md'\|'lg'`, `zIndex?: number`, `onclose?`, `children` snippet | New surface. Consumed only inside this phase. |
| `Badge.svelte` (new) | `status: string`, `domain?: string`, `label?: string` (override), `tone?: 'green'\|'red'\|'yellow'\|'blue'\|'gray'` (override) | New surface. `tone` override exists so a caller with a status the maps do not know is never blocked. |
| `Banner.svelte` (new) | `kind: 'error'\|'success'\|'warning'\|'info'`, `message?: string`, `children?` snippet | Renders `role="alert"` for error/warning, `role="status"` for success/info. |
| `$lib/labels.ts` (new) | Named `const` record exports + `labelFor(map, value)` helper that falls back to the raw enum value | Fallback is mandatory: an unmapped enum must render its raw value, never blank. |
| `.badge-*` CSS classes | Same 5 class names | **Class names unchanged.** Only the colour declarations change, so all 32 existing usages keep working. |

**Contract test (S3 gate):** a Svelte compile of the whole app (`pnpm check`) is the proof that no
consumer broke. This is why `ConfirmButton.svelte` is deliberately NOT edited in this phase — it is
the canary.

## Blast Radius

**Risk class:** presentation-only. No auth, no money computation, no schema, no public API, no
container. Money **display** is touched (`tabular-nums`) — alignment only, never a value.

**Counts** (grep-derived on `staging` @ `5e5cdfe`, 03-09-26):

| Measure | Count | Command |
|---|---|---|
| `(app)` `+page.svelte` files total | 61 | `find 'src/routes/(app)' -name '+page.svelte' \| wc -l` |
| Files using `.badge-*` classes | 9 (32 usages) | `grep -rl 'badge-green\|badge-red\|badge-yellow\|badge-blue\|badge-gray' src --include='*.svelte'` |
| Files using `.badge-gray` (the white-on-white bug) | 6 | `grep -rl 'badge-gray' src --include='*.svelte'` |
| Inline dark-only status colours (`text-{green,yellow,gray,blue}-400`) | 135 occurrences | `grep -rn 'text-green-400\|text-yellow-400\|text-gray-400\|text-blue-400' src --include='*.svelte' \| wc -l` |
| Files defining a hand-rolled `statusClass`-family helper | 12 | `grep -rl 'statusClass\|statusCls\|badgeClass\|pillClass' 'src/routes/(app)' src/lib/components` |
| Files importing `PageHeader` | 20 | `grep -rl 'PageHeader.svelte' 'src/routes/(app)' \| wc -l` |
| Files with a hand-rolled `<h1>` | 39 | `grep -rl '<h1' 'src/routes/(app)' \| wc -l` |
| Files importing `EmptyState` | 5 | `grep -rl 'EmptyState.svelte' 'src/routes/(app)' src/lib/components \| wc -l` |
| Files importing `ui/Table.svelte` | 2 | `grep -rl 'ui/Table.svelte' 'src/routes/(app)' src/lib/components \| wc -l` |
| Files with a raw `<table>` | 37 | `grep -rl '<table' 'src/routes/(app)' src/lib/components \| wc -l` |
| Files using `tabular-nums` | 9 | `grep -rl 'tabular-nums' src --include='*.svelte' \| wc -l` |
| Files using `text-red-400` (banner drift) | 36 | `grep -rl 'text-red-400' 'src/routes/(app)' \| wc -l` |
| Files with any `role="alert"` | 11 | `grep -rl 'role="alert"' 'src/routes/(app)' \| wc -l` |
| Modal implementations (`fixed inset-0`) | 8 files (6 real modals + layout + the 2 kit dialogs) | `grep -rln 'fixed inset-0' src --include='*.svelte'` |

**PageHeader gap by route family** (`pages / hand-rolled h1 / already using PageHeader`):

| Family | Pages | `<h1>` | PageHeader |
|---|---|---|---|
| dashboard | 1 | 1 | 0 |
| employees | 3 | 3 | 0 |
| team | 1 | 1 | 0 |
| profile | 1 | 1 | 0 |
| attendance | 1 | 1 | 0 |
| timesheets | 1 | 1 | 0 |
| punch | 1 | 1 | 0 |
| leave | 3 | 3 | 0 |
| requests | 5 | 4 | 1 |
| complaints | 2 | 2 | 0 |
| separations | 2 | 2 | 0 |
| payroll | 6 | 5 | 1 |
| performance | 4 | 2 | 2 |
| recruitment | 4 | 4 | 0 |
| settings | 16 | 2 | 14 |
| reports | 3 | 2 | 1 |
| inventory | 1 | 1 | 0 |
| branches | 1 | 1 | 0 |

Settings is already converged; it is the model. People, time and pay are the gap.

**Files expected to change:** roughly 55–65 `.svelte` files across 17 commits. Every one is a
presentation-layer diff.

## Implementation Checklist

Repo convention: **one commit per section.** Every section ends with its own gate (§8) before the
next one starts. Do not batch.

### S1 — `src/app.css`: theme-paired badge tokens + colour fixes

1. Rewrite `.badge-green` → `bg-green-500/15 text-green-700 dark:text-green-400`.
2. Rewrite `.badge-red` → `bg-red-500/15 text-red-700 dark:text-red-400`.
3. Rewrite `.badge-yellow` → `bg-yellow-500/20 text-yellow-800 dark:text-yellow-400`.
   (Yellow needs the darker light-mode step and slightly stronger tint — 700 on 15% yellow is the
   weakest pair in the set; verify with the contrast check in §8 before accepting.)
4. Rewrite `.badge-blue` → `bg-blue-500/15 text-blue-700 dark:text-blue-400`.
5. Rewrite `.badge-gray` → `bg-muted text-muted-foreground` (real tokens, not `white/10`). This is
   the white-on-white fix.
6. Replace `::-webkit-scrollbar-thumb:hover { background: hsl(0 0% 28%) }` (`app.css:141`) with a
   token-based rule — `@apply bg-muted-foreground/50`.
7. Add a short comment above the badge block recording that each variant is theme-paired and why
   (`text-*-400` alone is below AA on white).

**Constraint:** no new class names, no new tokens in `:root`/`.dark` unless step 3 proves a pair
cannot meet AA with the existing palette. If a new token is needed, add it to BOTH themes.

### S2 — `src/lib/labels.ts`

1. Create `src/lib/labels.ts`.
2. Export `const` records for the enums this phase's badges render, sourced from
   `prisma/schema.prisma`: `TimesheetStatus`, `LeaveRequestStatus`, `RequestStatus`, `RequestType`,
   `ApprovalDecision`, `PayrollRunStatus`, `PayrollPeriodStatus`, `SeparationType`,
   `SeparationStatus`, `ClearanceStatus`, `ReviewStatus`, `ReviewCycleStatus`, `ApplicantStage`,
   `ComplaintStatus`, `ComplaintCategory`, `InventoryStatus`, `BranchStatus`,
   `EmploymentStatus`, `EmploymentType`.
3. Export `labelFor(map: Record<string, string>, value: string): string` returning
   `map[value] ?? value`. **The raw-value fallback is required** — an unmapped enum must never
   render blank.
4. Labels are Sentence case human copy ("On leave", "Part time"), not SCREAMING_CASE.
5. Add a file comment stating this module is copy-only: it must import nothing from `$lib/server`
   and must not be used for logic branching.
6. Add `tests/unit/labels.test.ts`: for every exported map, assert every Prisma enum member of the
   matching enum has a key (import the enum from `@prisma/client`), and assert `labelFor` returns
   the raw value for an unknown key.

**This section does not change any existing file.** It is additive only.

### S3 — `Badge.svelte`

1. Create `src/lib/components/ui/Badge.svelte`.
2. Props per §5. Internally: a `domain`+`status` → tone lookup table and a `domain` → label-map
   lookup, both defined in the component (tone) and imported from `$lib/labels` (label).
3. Render `<span class="badge-{tone}">{label}</span>`. Nothing else — no size prop, no icon prop,
   no click handling. (YAGNI: only add a prop when a real call site in S4/S5 needs it.)
4. Unknown `status` with no `tone` override → `gray` + raw value. Never throw, never render blank.
5. `tone` and `label` props override the lookups.
6. Add `tests/unit/badge-tone.test.ts` covering the tone lookup as a plain exported function
   (export the map/function from a sibling `badge.ts` so it is unit-testable without rendering,
   mirroring the existing `Table.svelte` + `table.ts` split).

### S4 — Badge adoption: people + time

Replace hand-rolled status pills with `<Badge>` in:
`employees/+page.svelte`, `employees/[id]/+page.svelte`, `team/+page.svelte`,
`profile/+page.svelte`, `attendance/+page.svelte`, `timesheets/+page.svelte`,
`leave/+page.svelte`, `src/lib/components/employees/EmployeeCard.svelte`,
`src/lib/components/leave/BalanceSummary.svelte`, `src/lib/components/timesheets/TimesheetModal.svelte`.

1. Delete the local `statusClass` / inline ternary in each file.
2. Import `Badge` and pass `status` + `domain`.
3. If a status the file renders has no map entry, add it to `$lib/labels.ts` in this commit — do
   not add an inline label.
4. **Minimal diff rule:** touch only the pill markup and the now-dead helper. Do not reformat
   surrounding code, do not rename variables, do not "improve" adjacent classes.
5. `EmployeeCard.svelte` colours non-existent statuses (`PROBATIONARY`/`RESIGNED` as
   `EmploymentStatus`). Map them correctly: they are `EmploymentType` values. Record this as a
   real defect fixed, in the section commit message.

### S5 — Badge adoption: pay, cases, performance, recruitment, settings, reports

Same mechanics as S4, in:
`payroll/+page.svelte`, `payroll/periods/+page.svelte`, `payroll/[id]/+page.svelte`,
`requests/+page.svelte`, `requests/[id]/+page.svelte`, `complaints/+page.svelte`,
`complaints/[id]/+page.svelte`, `separations/+page.svelte`, `separations/[id]/+page.svelte`,
`performance/+page.svelte`, `performance/reviews/[id]/+page.svelte`,
`recruitment/+page.svelte`, `recruitment/applicant/[applicantId]/+page.svelte`,
`inventory/+page.svelte`, `branches/+page.svelte`, `settings/roles/+page.svelte`,
`settings/org/+page.svelte`, `settings/schedules/+page.svelte`, `settings/backup/+page.svelte`,
`reports/audit-log/+page.svelte`.

Plus, in this section:

6. Fix the approval-chain step circles at `requests/[id]/+page.svelte:405-411` — the
   `text-green-400` / `text-red-400` / `text-orange-400` branches get light-mode pairs
   (`text-green-700 dark:text-green-400` etc.). These are sized circles, not badges, so they do NOT
   become `<Badge>`; they get the paired colours only.
7. Same fix for the `bg-green-500/15 text-green-500` circle at `requests/[id]/+page.svelte:374`.

**Exit condition for S4+S5 together:**
`grep -rl 'statusClass\|statusCls\|badgeClass\|pillClass' 'src/routes/(app)' src/lib/components`
returns nothing.

### S6 — `Dialog.svelte` primitive

1. Create `src/lib/components/ui/Dialog.svelte`.
2. Lift, verbatim where possible, from `settings/roles/+page.svelte`:
   - the `FOCUSABLE` selector constant (lines 136-137)
   - the `onKeydown` Tab-cycling logic (lines 139-158)
   - focus-the-panel-on-open (`panelEl?.focus()`, lines 52 / 125)
   - focus restore to the trigger on close (the `openEditor(id, trigger)` / `closeEditor()` pair,
     lines 109-118) — generalise it to "capture `document.activeElement` on open, restore on close".
3. Backdrop: `fixed inset-0 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm`,
   `role="presentation"`, click-to-close, `transition:fade`. Panel: `bg-card`, ring, shadow,
   `role="dialog"`, `aria-modal="true"`, `tabindex="-1"`, `transition:scale`.
4. Keep the existing `e.stopPropagation()` on Escape — the current dialogs rely on it so a nested
   dialog does not close its parent. Losing this is a silent regression.
5. `zIndex` prop defaults to 60; `ReasonDialog` currently uses 70 and must keep it.
6. `role` is fixed as `dialog`; `ConfirmDialog` needs `alertdialog`, so expose a `role` prop with
   `'dialog'` default.
7. Add a file comment naming the roles page as the source and the audit line ("Five modal
   implementations, one correct") as the reason.

**Nothing consumes `Dialog` in this section.** It is additive only.

### S7 — `ConfirmDialog` + `ReasonDialog` become consumers

1. Rewrite `ConfirmDialog.svelte` to render its heading/message/buttons inside `<Dialog>`
   (`role="alertdialog"`, `size="sm"`, `zIndex=60`). Props and behaviour identical.
2. Rewrite `ReasonDialog.svelte` the same way (`size="md"`, `zIndex=70`), keeping: reason reset on
   open, textarea autofocus, Confirm disabled while the reason is blank.
3. **Do not touch `ConfirmButton.svelte`.** It is the compile canary and its rebuild is phase 04.
4. Verify by diff review that no prop name, default, or emitted callback changed.

### S8 — Migrate the roles page dialog

1. Replace the hand-rolled panel in `settings/roles/+page.svelte` with `<Dialog>`.
2. Delete the now-duplicated `FOCUSABLE`, `onKeydown` Tab logic, and focus-restore code.
3. Keep `openEditor`'s trigger argument only if `Dialog`'s generic restore does not cover it; prefer
   deleting it.
4. Before/after check per §8.4 — this is the reference implementation, so a regression here
   invalidates S6.

### S9 — Migrate `PunchMapDialog.svelte`

Replace its own trap with `<Dialog>`. Leaflet is dynamically imported inside an effect — confirm
the map still initialises after the DOM node moves inside the primitive. Before/after check.

### S10 — Migrate `TimesheetModal.svelte`

Replace its partial trap with `<Dialog>`. Note the audit finding that this modal renders the
`saveEntries` banner *behind* itself (`TimesheetModal.svelte:253`) — **that is phase 07, do not fix
it here.** Before/after check.

### S11 — Migrate `NewTimesheetDialog.svelte`

Has no trap today. Adding one is the behaviour change. Its enhance callback handles all three
result types (audit §G.4) — preserve it exactly. Before/after check.

### S12 — Migrate the `ApplicantKanban.svelte` stage-move dialog

Has no trap and, per the audit (`ApplicantKanban.svelte:127-196`), never receives focus, so its own
Escape handler is dead on open. `Dialog` fixes both. Before/after check, explicitly asserting
Escape now closes it.

**Exit condition for S8–S12:** `grep -rln 'fixed inset-0' src --include='*.svelte'` returns only
`ui/Dialog.svelte` and `(app)/+layout.svelte` (the layout's is a nav drawer, out of scope).

### S13 — `Banner.svelte` + banner recipe sweep

1. Create `src/lib/components/ui/Banner.svelte`. Copy the class recipe already correct in
   `separations/[id]/+page.svelte:65-100` — `rounded-md border border-{c}-500/20 bg-{c}-500/10
   px-4 py-2 text-sm text-{c}-600 dark:text-{c}-400`, with amber using `700/400`.
2. `role="alert"` for `error`/`warning`; `role="status"` for `success`/`info` (the split the punch
   page already gets right, audit §G.1).
3. Replace `text-red-400`-only banners across the 36 files that carry them, plus the success/warning
   equivalents, with `<Banner>`.
4. **Do not** add scroll-into-view, auto-clear, per-row scoping, or toasts — all phase 07.

### S14 — PageHeader sweep: people + time

Convert hand-rolled `<h1>` to `<PageHeader>` in: `dashboard`, `employees` (×3), `team`, `profile`,
`attendance`, `timesheets`, `punch`, `leave` (×3). `profile` also uses the legacy `.page-header` /
`.page-title` CSS classes — remove those usages.

Rules: keep the existing title string verbatim (renaming is phase 08). Add `description` only where
one already exists in the markup. Move an existing Back link into the `back` snippet.

### S15 — PageHeader sweep: pay, cases, performance, recruitment, reports, misc

Same conversion in: `requests` (×4), `complaints` (×2), `separations` (×2), `payroll` (×5),
`performance` (×2), `recruitment` (×4), `reports` (×2), `settings` (×2), `inventory`, `branches`.

**Exit condition for S14+S15:** `grep -rl '<h1' 'src/routes/(app)'` returns 0 files, and
`grep -rn 'page-header\|page-title' src --include='*.svelte'` returns 0.
Then delete the now-dead `.page-header` / `.page-title` rules from `src/app.css`.

### S16 — EmptyState sweep

1. Replace bare `colspan` "no rows" cells, dashed paragraphs, and bordered empty divs with
   `<EmptyState>` across the `(app)` routes.
2. Where the page has an active filter or search, pass `variant="no-results"` and a description
   that names the filter. Where nothing exists yet, leave the default `empty`. Getting this
   backwards is the exact failure the component's own comment warns about — check each site.
3. Where the empty state already offers a way forward (a "Create" link), move it into the `action`
   snippet rather than dropping it.

### S17 — Money-column alignment

1. Add `tabular-nums` (and `text-right`) to money columns in the raw tables that lack it — payroll,
   payslips, benefits, reports, inventory, leave balances.
2. Fix the timesheets "Total Hours" column, left-aligned while every sibling numeric column is
   right-aligned (audit §4, Time & attendance).
3. **Minimum bar only.** Do not migrate these tables to `Table.svelte` in this phase.

## Phase Completion Rules

- A **section** is complete when its diff is committed AND its gate (§Verification — per-section
  gate) passed on that commit. Code written but ungated is not a completed section.
- The **phase** is `CODE DONE` when all 17 sections are committed and the full CI gate set is green.
- The phase is `VERIFIED` only when, in addition: every Hybrid gate in §Verification Evidence has
  been run against a live browser with its negative control, the AA contrast measurements are
  recorded in the phase report, and the Agent-Probe screenshot review is recorded. A green `pnpm
  test` alone never promotes this phase to VERIFIED — this repo has five recorded cases of a green
  suite coexisting with a live defect.
- A section whose gate goes red is **not** carried forward. Fix it in place if the fix is inside
  this phase's blast radius; if the fix would require a server-side or behavioural change, stop,
  write a backlog stub in this task folder, and keep the section open.
- Honest status only: `CODE DONE` is not `VERIFIED`.

## Verification — per-section gate

Every section runs the same gate before its commit. No section is done on a partial gate.

### 8.1 Full CI gate set (in CI's order — CI runs format FIRST and skips the rest on failure)

```bash
pnpm format:check
pnpm lint
pnpm check
pnpm test
```

`pnpm prisma generate` first if `pnpm check` goes red — a stale client produces phantom errors.

### 8.2 Baseline confirmation (do this ONCE, before S1)

Run the four commands above on the untouched tree and record the result. A pre-existing red gate
must be known before it is blamed on this phase. (This is the #112 VALIDATE lesson from
`process/context/planning/all-planning.md`.)

### 8.3 Light/dark visual spot-check (S1, S4, S5, S13 — mandatory)

Servers are started by the owner; ask, do not launch. Drive the running app with Playwright MCP +
`POST /api/v1/_dev/login-as`.

1. Load the section's changed page in **light** theme, screenshot, and **look at it**.
2. Toggle `html.dark`, screenshot, look again.
3. **Assert the computed style, not the rendered box** — `getComputedStyle(el).color` on the pill,
   not a colour name in the class attribute. A class string can be right while the cascade wins
   elsewhere.
4. **Negative control:** on the same page, assert one element that this section did NOT touch still
   has its original computed colour. If both change, the selector is wrong.

Named must-check pages: `/payroll/periods` (DRAFT/OPEN — the `.badge-gray` bug),
`/timesheets`, `/requests/[id]` (approval chain circles), `/separations/[id]`, `/employees`.

### 8.4 Modal before/after check (S8–S12, one per section)

Per migrated modal, on the running app:

1. Open it. Assert `document.activeElement` is inside the panel.
2. Press Tab past the last focusable control → assert focus wrapped to the first.
3. Press Shift+Tab on the first → assert focus wrapped to the last.
4. Press Escape → assert the modal closed AND focus returned to the trigger element.
5. Click the backdrop → assert closed.
6. **Negative control (S8 only):** before the S8 edit, run steps 1-5 against the roles dialog and
   record it passing. If the "after" also passes but the "before" was never run, the check proves
   nothing.
7. **Nested-dialog control (S7):** open a `ConfirmDialog` from inside another modal, press Escape,
   assert only the inner one closed. This is what `e.stopPropagation()` protects.

### 8.5 WCAG AA contrast — the floor, not the target

Every text/background pair introduced or changed in S1, S5(6-7) and S13 must measure **≥ 4.5:1**
for body-size text and **≥ 3:1** for the ≥14px-bold badge text. Measure the *computed* foreground
against the *composited* background (the badge tint sits over the card, so compute the blend — a
15% tint over white is not white).

Record the measured ratio per pair in the phase report. A pair that cannot reach AA with the
existing palette gets a darker step (e.g. `-800`) — never a waiver.

### 8.6 Impeccable audit

Run the `impeccable` skill's audit pass over each section's diff before committing. UI work in this
repo goes through `impeccable` on both sides: a planning pass before the edit and an audit after.

## Acceptance Criteria

Each criterion names its proving scenario and strategy (REQ-TEST-LINK). The gates are defined in
§Verification Evidence.

| ID | Criterion | proven by | strategy |
|---|---|---|---|
| AC-1 | `ConfirmDialog` and `ReasonDialog` public props, defaults and callbacks are byte-for-byte compatible; `ConfirmButton.svelte` compiles untouched, and nested-dialog Escape still closes only the inner dialog | `pnpm check` green after S7 with `ConfirmButton.svelte` unedited; nested-dialog Escape control (§Verification — 8.4.7) | Fully-Automated + Hybrid |
| AC-2 | `Badge` renders a `gray` badge with the raw status text for an unknown status, and honours the `tone`/`label` overrides | `tests/unit/badge-tone.test.ts` | Fully-Automated |
| AC-3 | `$lib/labels.ts` has a label for every member of each mapped Prisma enum, and `labelFor` returns the raw value for anything unmapped — never blank | `tests/unit/labels.test.ts` (exhaustiveness against `@prisma/client`) | Fully-Automated |
| AC-4 | Zero hand-rolled status-class helpers remain in `src/routes/(app)` or `src/lib/components` | `grep -rl 'statusClass\|statusCls\|badgeClass\|pillClass'` returns nothing | Fully-Automated |
| AC-5 | Exactly one modal implementation remains, and every migrated modal takes focus on open, wraps Tab and Shift+Tab, closes on Escape and backdrop, and restores focus to its trigger | `fixed inset-0` grep exit condition + the per-modal before/after check (§Verification — 8.4), with the S8 "before" run as the negative control | Fully-Automated + Hybrid |
| AC-6 | Every `(app)` page uses `PageHeader`; no hand-rolled `<h1>` and no legacy `.page-header`/`.page-title` usage survives | `<h1>` grep and `page-header`/`page-title` grep both return nothing | Fully-Automated |
| AC-7 | No dark-only status colour survives: every `text-{green,yellow,gray,blue}-400` occurrence carries a light-mode pair, and the named badge pages render correctly in BOTH themes | dark-pair grep + light/dark computed-style spot-check with a negative control on 5 named pages (§Verification — 8.3) | Fully-Automated + Hybrid |
| AC-8 | Every colour pair this phase introduces or changes meets WCAG AA — ≥4.5:1 for body text, ≥3:1 for large/bold badge text — measured against the composited background | contrast measurement per changed pair, recorded in the phase report (§Verification — 8.5) | Hybrid |
| AC-9 | The full CI gate set is green at every one of the 17 section boundaries, relative to the recorded pre-phase baseline | `pnpm format:check && pnpm lint && pnpm check && pnpm test` per section, plus the §Verification 8.2 baseline record | Fully-Automated |
| AC-10 | Each swept route family still reads as one coherent screen, and every `EmptyState` uses `no-results` when a filter is active and `empty` when nothing exists | screenshot review per route family + filter-applied empty-state judgement (Agent-Probe rows in §Verification Evidence) | Agent-Probe |

**Residual (not a proving strategy):** responsive verification at 390px across the sweep is a
Known-Gap. It gets a backlog stub during EXECUTE and its gate stays CONDITIONAL. No criterion above
is satisfied by a Known-Gap.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm check` green after S7 with `ConfirmButton.svelte` untouched | Fully-Automated | AC-1: `ConfirmDialog`/`ReasonDialog` public APIs are backward compatible |
| `pnpm format:check && pnpm lint && pnpm check && pnpm test` green at every section boundary | Fully-Automated | AC-9: no phase section regresses the repo baseline |
| `tests/unit/labels.test.ts` — every Prisma enum member has a label; `labelFor` falls back to the raw value | Fully-Automated | AC-3: `$lib/labels.ts` covers the rendered enums and never renders blank |
| `tests/unit/badge-tone.test.ts` — tone lookup returns `gray` for an unknown status, honours `tone` override | Fully-Automated | AC-2: `Badge` degrades safely |
| `grep -rl 'statusClass\|statusCls\|badgeClass\|pillClass' 'src/routes/(app)' src/lib/components` returns nothing | Fully-Automated | AC-4: the 12 hand-rolled status helpers are collapsed |
| `grep -rl '<h1' 'src/routes/(app)'` returns nothing; `page-header`/`page-title` grep returns nothing | Fully-Automated | AC-6: PageHeader adoption is complete |
| `grep -rln 'fixed inset-0' src --include='*.svelte'` returns only `ui/Dialog.svelte` + `(app)/+layout.svelte` | Fully-Automated | AC-5: one dialog implementation remains |
| `grep -rn 'text-green-400\|text-yellow-400\|text-gray-400' src --include='*.svelte'` has no occurrence lacking a `dark:` pair | Fully-Automated | AC-7: no dark-only status colour survives |
| Light/dark computed-style spot-check with negative control on `/payroll/periods`, `/timesheets`, `/requests/[id]`, `/separations/[id]`, `/employees` (§8.3) | Hybrid — precondition: dev server + DB container running (owner-started), `_dev/login-as` reachable | AC-7: badges are readable and correctly toned in BOTH themes |
| WCAG AA contrast measurement of every changed pair, composited over the card background (§8.5) | Hybrid — same precondition | AC-8: every changed colour pair meets the AA floor |
| Modal before/after: focus-in, Tab wrap, Shift+Tab wrap, Escape + focus restore, backdrop close — run per migrated modal, with the S8 "before" recorded as the negative control (§8.4) | Hybrid — same precondition | AC-5: every migrated modal traps focus and restores it |
| Nested-dialog Escape control: inner `ConfirmDialog` closes, outer modal stays open (§8.4.7) | Hybrid — same precondition | AC-1: the `stopPropagation` behaviour survives the rewrite |
| Leaflet map still initialises inside the migrated `PunchMapDialog` — open `/punch`, screenshot the map tile area | Hybrid — same precondition | AC-5: no dynamic-import regression from moving the DOM node |
| Screenshot review of each swept route family: does the page still read as one coherent screen? | Agent-Probe — agent judges visual coherence, spacing rhythm, and whether an empty state now reads correctly for the filter case | AC-10: the sweep improves the page, not just the grep count |
| `variant="no-results"` vs `variant="empty"` chosen correctly per site (S16) | Agent-Probe — agent applies a filter on each swept page and judges whether the copy matches the situation | AC-10 |
| Responsive check at 390px on 3 swept pages | Known-Gap → backlog stub `phase-03-responsive-sweep_NOTE_03-09-26.md`; gate stays CONDITIONAL | (residual — not a proving strategy) |

**Known-gap note.** Responsive/breakpoint verification of the full sweep is not achievable inside
this phase's budget. Per the vacuous-green ban, this residual gets a backlog stub written during
EXECUTE and the associated gate stays **CONDITIONAL** — it does not make the phase un-shippable,
and it does not count as proof.

## Test Infra Improvement Notes

(none identified yet)

## Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | A `.badge-*` colour change silently alters an unrelated pill, because 32 usages sit across 9 files | The class names do not change; the visual check names each of the 6 `.badge-gray` files explicitly and uses a negative control |
| R2 | The `Dialog` rewrite breaks nested-dialog Escape (a `ConfirmDialog` inside another modal closes both) | §8.4.7 is a dedicated control; `stopPropagation` is called out in S6 step 4 as must-keep |
| R3 | `pnpm check` goes green while a page 500s at runtime — this repo's #2 false-green class | Every visual/modal gate loads a real page in a real browser; the Leaflet check in S9 exists for exactly this |
| R4 | The sweep grows into behaviour changes (fixing banners, adding toasts, adding confirms) | §2's out-of-scope table is explicit; S10 and S13 name specific findings as "do not fix here" |
| R5 | 17 sections is a long run; a mid-phase compaction loses the thread | §13 resume block; one commit per section means the tree is always a clean resume point |
| R6 | Yellow cannot reach AA at `text-yellow-800` on a 20% tint | S1 step 3 requires measuring before accepting; a new token added to BOTH themes is the sanctioned escape |
| R7 | An enum missing from `labels.ts` renders blank in a `Badge` | `labelFor` raw-value fallback (S2.3) plus the exhaustiveness unit test against `@prisma/client` |

## Dependencies

**Upstream:** Phase 02 (nav/IA) touches `(app)/+layout.svelte`. This phase does NOT touch that
file — the layout's `fixed inset-0` drawer is explicitly excluded from the S8-S12 exit condition,
so the two phases do not collide. If phase 02 is still open, coordinate only on the fact that both
may edit `src/app.css`; this phase's `app.css` edits are confined to the badge block, the scrollbar
rule, and (in S15) deleting the dead `.page-header`/`.page-title` rules.

**Downstream:**
- Phase 04 rebuilds `ConfirmButton` on top of the `ConfirmDialog` this phase leaves API-stable.
- Phase 05 applies confirms to the §T3 table, consuming `Dialog`.
- Phase 07 (feedback contract) consumes `Banner.svelte` and adds scroll-into-view, toasts, and
  per-form scoping on top of it.
- Phase 08 (copy pass) consumes `$lib/labels.ts` for body copy.

**Blocking:** none. The DB container and dev server must be running for the hybrid gates — the
**owner starts them**; ask, never launch `./start.sh` or vite directly.

## Resume and Execution Handoff

1. **Selected plan file (primary execute anchor):**
   `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-03-design-system_PLAN_03-09-26.md`
2. **Last completed phase/step:** none — plan written, EXECUTE not started.
3. **Validate-contract status:** pending (placeholder at §14).
4. **Supporting context loaded:** `process/context/all-context.md`,
   `process/context/planning/all-planning.md`, `process/context/uxui/all-uxui.md`,
   `process/context/tests/all-tests.md`, `docs/ui-ux-audit-2026-09-03.md` (§T2, §T4, §4, §7,
   Addendum §E–§H), `src/app.css`, `src/lib/components/ui/**`,
   `src/routes/(app)/settings/roles/+page.svelte`.
5. **Next step for a fresh agent:** run §8.2 (baseline gate confirmation) on the current tree,
   record the result, then start S1. To find the resume point mid-phase, read `git log --oneline`
   — each section is one commit whose subject names its section id (e.g. `S4`).

**Branch**: cut from an updated local `staging` with `git switch -c`. One issue, one PR, many
commits. Merges go to `staging`, so `Closes #N` never fires — close the issue by hand.

**Commit style:** subject + optional body, no `Co-Authored-By`, no attribution footer.

**Primary execute anchor:** this file. There are no supporting phase files for phase 03 — the whole
phase is contained in this one plan, and EXECUTE should be handed this exact path and nothing else.
Sibling phase files (phases 01-08 of the ui-ux-overhaul program) are NOT inputs to this phase.

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)

---

**Plan complete. Review carefully. Say 'ENTER VALIDATE MODE' when ready to proceed to plan
validation (required before implementation).**
