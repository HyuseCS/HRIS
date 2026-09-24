---
name: plan:hris-20-container-surfaces
description: "HRIS #20 — every bordered content box gets the canonical border bg-card surface through Container.svelte (tailored per use), with an explicit carve-out list and a source-scan guard"
date: 24-09-26
feature: none
---

# HRIS #20 — Container surfaces (COMPLEX plan, one PR)

**Date**: 24-09-26
**Status**: PLANNED (awaiting VALIDATE)
**Complexity**: COMPLEX (one plan, one PR, ~25 files; not a phase program)
**Branch**: `fix/20-container-surfaces` off updated local `staging`
**Wave**: 3. Starts only AFTER #23 (employees/[id] split into `src/lib/components/employees/*`) AND #27 (colour tokens) are merged to staging.

TL;DR: give `Container.svelte` two small props (`fill`, default true, and `bodyClass`) so it can be an
inline box with a height-capped scroll body. Then every bordered box that holds content directly
becomes a `tone="card"` Container (div boxes, and panel forms/details/ul wrapped with their tag kept) or gains `bg-card` (tiles, rows, labels and option controls: containers = content boxes; tiles, rows and option controls are not — sites 10-17).
Status tints, callouts, dashed empty states, segmented controls, kanban columns, map frames,
floating windows and toasts keep their look and are listed by name in a new source-scan unit test
that goes red on any new bare or grey box outside that list.

## Phase Record

| Phase | Status | Note |
|---|---|---|
| RESEARCH | DONE | scratchpad `research-20.md` (staging d773e1a), spot-re-verified by this plan |
| SPEC | SKIPPED | issue #20 body + 04-09-26 update + 15-09-26 progress comment + owner decisions D3 and round 2 are the spec |
| INNOVATE | SKIPPED | owner chose the approach: D3 canonical `border bg-card`, containers through `Container.svelte`, round-2 grey/tint rules |
| PLAN | DONE | this file |
| VALIDATE | PENDING | must check PD-1 .. PD-7 |

Intent restatement (Tier 0): make every bordered content box a visible `bg-card` surface through a
tailored `Container.svelte`, keep the owner's carve-outs, prove it in both themes, one PR.

## Overview and Scope

Defect: a bordered box with no background (or a faint grey/page-ground tint) disappears next to
`bg-card` siblings. The 15-09-26 pass fixed most sites. Remaining at d773e1a (research-20 §3, this
plan re-read the key ones):

- Group A (padded content panels, bare or plain-grey): dashboard award/announcement forms,
  employees/new "Complete later" `<details>`, applicant interview + offer boxes, departments create
  form, requests/[id] upload form, payroll/config cutoff box, statutory-rates pending proposal rows,
  employee leave-balance tiles, TimesheetModal 4 stat tiles, requests/[id] balance tile
  (`bg-background` branch), recruitment/[id] job-board row, settings/roles "Edit roles" entries,
  ReviewFormRender rating list.
- Group B (hand-rolled table wrappers, 13): leave-types, salary-grades ×2, pay-codes ×2, profile ×3,
  branches, employees/[id] ×3 (emergency contacts, benefits, documents), AggregatePanel.
- Group C/D carve-outs: listed below, unchanged.
- Shared: TableSkeleton header tint aligns with Table.

Out of scope: moving group B to `Table.svelte` (research §4 blockers: cell snippet rendered twice so
forms/ids duplicate, no colspan, no card-scroll, mobile layout changes to stacked cards — no site
found where it fits with no behaviour change); any token change (#27 owns tokens); any page
template; the 3 grey Container users; adjacent cleanup.

## PLAN-level decisions (VALIDATE must check)

- **PD-1 — `fill` prop, default `true`.** Container gets `fill?: boolean` (default `true`). `fill`
  true renders the outer class literal EXACTLY as today
  (`'flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border'`); `fill` false renders
  `'flex flex-col overflow-hidden rounded-lg border'`. Reason: inline boxes in flex-column parents
  must not stretch; default true keeps all 19 existing users byte-identical in their call sites and
  the outer class string identical.
- **PD-2 — `bodyClass` prop on the inner scroll body.** Container gets `bodyClass?: string`,
  appended to the inner body class string as ` {bodyClass ?? ''}` after the existing two
  interpolations (template string kept, no `cn` change). Height caps go here:
  `bodyClass="card-scroll"`. Reason: the cap goes on the element that scrolls — the inner body is
  the `overflow-y-auto` element; the outer box is `overflow-hidden` and does not scroll. The literal
  `card-scroll` stays in each page's source, so `container-bounds-scan.test.ts` counts hold without
  retargeting. Custom padding = `flush` + padding in `bodyClass`.
- **PD-3 — keep `tone = 'muted'` default.** Zero diff for the 3 grey users (approvals, timesheets,
  proposals); every new user passes `tone="card"` explicitly, like the other 16 existing card users.
  Flipping the default would touch 19 call sites for no visual change.
- **PD-4 — TableSkeleton follows Table.** `TableSkeleton.svelte` header row
  `border-b bg-muted/50` → `border-b border-border/60 bg-muted/40` (Table.svelte thead literal).
  One line; the loaded state is the reference. Group B theads (`bg-muted/50`) are NOT changed
  (not a Table; surgical).
- **PD-5 — tailoring rule (which boxes become Container vs class-only).**
  - R1 Container: root element is a `<div>` that holds content directly, is not a small tile, and
    contains no `DatePicker`/`TimePicker`/`HelpTip` (outer `overflow-hidden` would clip popovers).
  - R1b Container wrapping a semantic element (VALIDATE G1, owner intent): a bordered `form`,
    `details`, `fieldset` or `ul` panel becomes `<Container tone="card" fill={false} flush>` with the
    element INSIDE it keeping its tag, all attributes (`method`, `action`, `use:enhance`,
    `enctype`, `open`, …) and its padding/layout classes; only `border`, `rounded-*` and `bg-*` leave
    the element. `rounded-md` → `rounded-lg` (Container radius) is accepted.
  - R2 class-only `bg-card`: only `li`, `label`, `p`, list rows, checkbox options, and elements a
    test reads by attribute (e.g. site 15 `data-leave-type`) — or an R1 div that fails only on the
    popover check.
  - R3 class-only `bg-card`: small stat/summary tiles in a grid or flex row of identical tiles.
  - R4 keep: owner carve-outs (status tint, callout note, segmented/toggle group, dashed empty
    state/affordance, grey empty-state box, kanban column, map frame, floating window, toast,
    destructive Offboard box, form-control box with `border-input`).
  - The PR body states R1/R1b/R2/R3/R4 verbatim.
  - Class mapping for R1: sizing/placement classes (`w-*`, `min-w-*`, `max-w-*`, `col-span-*`,
    margins, `self-*`, `shrink-*`) → `class`; content padding/spacing/layout (`p*`, `space-*`,
    `gap-*`, `grid*`, `items-*`, `justify-*`) → `bodyClass`; if padding is exactly `p-4`, omit
    `flush` and put only the rest in `bodyClass`; else `flush` + old padding in `bodyClass`.
    `border`, `rounded-*`, `bg-*`, `overflow-*` are dropped (Container provides them). `card-scroll`
    goes to `bodyClass`.
- **PD-6 — class-only swaps.** Bare box: insert `bg-card` right after `border` in the literal.
  Grey box: replace the `bg-muted/NN` / `bg-background` token with `bg-card`. Ternary: only the
  plain-grey/page-ground branch changes; status branches untouched.
- **PD-7 — multi-role-sod locator.** `tests/e2e/multi-role-sod.spec.ts` lines 110 and 123:
  `locator('div.rounded-lg.border', …)` → `locator('li.rounded-lg.border', …)`. Today `div` matches
  the approvals Container's OUTER div (it contains every card's text), so `.first()` at :123 picks
  the whole list and `getByRole('button', { name: 'Approve' })` inside it can hit another card's
  button; the card is `<li class="flex flex-col rounded-lg border bg-card …">`
  (approvals/+page.svelte:236). The `li` locator scopes to one card; :123 stays the positive control.

## Per-site table (d773e1a lines; employee-page sites identified by content — they move in #23)

| # | Site (file · content anchor) | Grp | Target | Rule / why |
|---|---|---|---|---|
| 1 | `dashboard/+page.svelte` · `<form … action="?/giveAward"` `space-y-2 rounded-md border p-3` (~597) | A | `<Container tone="card" fill={false} flush>` around the form; form keeps `space-y-2 p-3`, loses `rounded-md border` | R1b form |
| 2 | `dashboard/+page.svelte` · `action="?/postAnnouncement"` same class (~631) | A | same as 1 | R1b form |
| 3 | `employees/new/+page.svelte` · `<details open={optionalHasError} class="rounded-md border">` (~457) | A | `<Container tone="card" fill={false} flush>` around `<details open={optionalHasError}>` (details loses its class) | R1b details |
| 4 | `recruitment/applicant/[applicantId]/+page.svelte` · interview `<div class="rounded-md border p-3">` in `{#each applicant.interviews}` (~143) | A | `<Container tone="card" fill={false} flush bodyClass="p-3">` | R1 (no picker inside; DatePicker at ~229 is outside) |
| 5 | same file · offer `<div class="rounded-md border p-4 space-y-3">` in `{#if offer}` (~301) | A | `<Container tone="card" fill={false} bodyClass="space-y-3">` | R1 (DatePicker ~435 outside) |
| 6 | `departments/+page.svelte` · create `<form … class="flex items-center gap-3 rounded-md border bg-muted/50 p-4">` (~118) | A grey | `<Container tone="card" fill={false} flush>` around the form; form keeps `flex items-center gap-3 p-4` | R1b form |
| 7 | `requests/[id]/+page.svelte` · upload `<form … class="space-y-2 rounded-lg border bg-muted/30 p-3">` (~270) | A grey | `<Container tone="card" fill={false} flush>` around the form; form keeps `space-y-2 p-3`, `enctype`, `use:enhance` | R1b form |
| 8 | `payroll/config/+page.svelte` · `<div class="rounded-md border bg-muted/50 p-4 space-y-4">` "Semi-Monthly Cutoff Days" (~112) | A grey | `<Container tone="card" fill={false} bodyClass="space-y-4">` | R1; owner-named |
| 9 | `payroll/statutory-rates/+page.svelte` · pending proposal `<div class="rounded-md border bg-muted/30 px-4 py-3">` (~279) | A grey | `<Container tone="card" fill={false} flush bodyClass="px-4 py-3">` | R1 (`{@const empty}` stays direct child of `{#each}`) |
| 10 | employee leave-balance tile `min-w-[150px] rounded-lg border bg-background p-4` (d773e1a employees/[id]:911; after #23 in the leave card component) | A | `bg-background` → `bg-card` | R3 tile |
| 11-14 | `TimesheetModal.svelte` · 4× `rounded-lg border bg-muted/30 px-4 py-2` summary tiles (~343/347/351/355) | A grey | `bg-muted/30` → `bg-card` (×4) | R3 tiles; owner-named |
| 15 | `requests/[id]/+page.svelte` · balance tile ternary, `bg-background` branch (~173) | D | `bg-background` → `bg-card` in that branch only; `bg-primary/5` branch kept | R2 (test reads `data-leave-type`), PD-6 |
| 16 | `recruitment/[id]/+page.svelte` · job-board row `flex justify-between rounded-md border px-4 py-2` (~324) | D | insert `bg-card` | R2 (row in list); issue-listed |
| 17 | `settings/roles/+page.svelte` · "Edit roles" checkbox entry `rounded-lg border px-3 py-2.5 … {on ? 'border-primary/50' : …}` (~349) | D | insert `bg-card` in the static part | R2 label entry; owner-named |
| 18 | `ReviewFormRender.svelte` · `<ul class="divide-y rounded-md border text-sm">` (~168) | D | `<Container tone="card" fill={false} flush>` around the `<ul class="divide-y text-sm">` | R1b ul |
| 19 | `settings/leave-types/+page.svelte` · `<div class="card-scroll overflow-x-auto rounded-md border">` (~133) | B | `<Container tone="card" fill={false} flush bodyClass="card-scroll">` | R1; card-scroll count kept |
| 20-21 | `payroll/salary-grades/+page.svelte` · 2 wrappers (~47, ~144) | B | same as 19 | R1 |
| 22-23 | `payroll/pay-codes/+page.svelte` · 2 wrappers (~47, ~130) | B | same | R1 |
| 24-26 | `profile/+page.svelte` · 3 wrappers (~242, ~280, ~323) | B | same | R1 (DatePicker ~199 is outside) |
| 27 | `branches/+page.svelte` · wrapper (~147) with `form="edit-{b.id}"` inputs | B | same | R1; forms stay inside table cells unchanged |
| 28 | employee emergency contacts `card-scroll rounded-md border` (no overflow-x) (d773e1a :946; after #23 in the personal/contacts card) | B | same as 19 | R1 |
| 29 | employee Benefits table wrapper `card-scroll overflow-x-auto rounded-md border` (d773e1a :1070) | B | same | R1 |
| 30 | employee Documents table wrapper, same class (d773e1a :1817) | B | same | R1 |
| 31 | `AggregatePanel.svelte` · `<div class="overflow-x-auto rounded-lg border bg-background">` (~155) | B | `<Container tone="card" fill={false} flush>` | R1 (no card-scroll today; none added) |
| 32 | `ui/TableSkeleton.svelte` header row | D | PD-4 | align with Table |

### Carve-out list (kept as-is; the guard test lists each by file + class substring)

| Site · anchor | Why kept |
|---|---|
| any class with `border-dashed` (recruitment/[id] ~196, settings/+page ~80, requests/[id] ~305, inquiries/[id] ~92, ApplicantKanban ~172, TimesheetModal add-row ~504, FileInput ~120, SectionList ~40) | C dashed affordance / empty state |
| `reports/[type]/+page.svelte` `flex h-40 rounded-lg border bg-muted/30` (~223) | grey empty-state box (not dashed) |
| any class with `border-input` (employee checklist box `max-h-48 … border-input p-2`) | form-control box |
| any class with `border-destructive` (employee Offboard box) | issue's named exception |
| `team/+page.svelte` `inline-flex rounded-md border p-0.5`; `inventory/+page.svelte` same; `AttendanceHrGrid.svelte` `inline-flex rounded-lg border p-1` ×2; `PeriodPicker.svelte` `rounded-md border bg-muted/40 p-1` | segmented/toggle group |
| `AttendanceHrGrid.svelte` role=status banners ×2 | status tint |
| `dashboard/+page.svelte` notification item ternary (`bg-primary/[0.04]` / `bg-muted/30`) | read/unread status tint |
| `employees` onboarding panel ternary (`bg-green-500/5` / `bg-amber-500/5`) | status tint |
| `requests/[id]` note `<p … rounded-lg border bg-muted/30 px-4 py-3>` (~201); `settings/roles` note `rounded-md border border-border bg-muted/50 px-3 py-2 text-xs` (~401) | callout note |
| `recruitment/[id]` column `flex min-h-[11rem] rounded-lg border bg-muted p-3` (~215) | kanban column |
| `PunchMapDialog.svelte` `h-72 rounded-md border border-border bg-muted` | map frame |
| `CalculatorWindow.svelte` `fixed z-50 rounded-lg border bg-background shadow-xl` | floating window |
| `Toaster.svelte` toast (`kindClass`) | toast |
| `ui/Container.svelte` (bg via `tone`), requests/approvals, requests/timesheets, requests/proposals default-muted Containers | primitive / owner kept grey |
| small controls by tag (`button`, `a`, `span`, `input`, `select`, `textarea`, `summary`, `kbd`, `code`, `img`): +layout nav, Pagination chips, pay-codes toggles, TimePicker button, BackButton | not panels |
| `LoadError.svelte` ~29 | error chip, excluded by research |

Already `bg-card`, no change: statutory-rates tab tiles, payroll/[id] and requests/[id] step items,
inquiries message bubble (every branch has a bg token).

## Touchpoints

Source (edit): `src/lib/components/ui/Container.svelte`, `src/lib/components/ui/TableSkeleton.svelte`,
`src/routes/(app)/dashboard/+page.svelte`, `src/routes/(app)/employees/new/+page.svelte`,
`src/routes/(app)/recruitment/applicant/[applicantId]/+page.svelte`,
`src/routes/(app)/recruitment/[id]/+page.svelte`, `src/routes/(app)/departments/+page.svelte`,
`src/routes/(app)/requests/[id]/+page.svelte`, `src/routes/(app)/payroll/config/+page.svelte`,
`src/routes/(app)/payroll/statutory-rates/+page.svelte`, `src/routes/(app)/settings/roles/+page.svelte`,
`src/routes/(app)/settings/leave-types/+page.svelte`, `src/routes/(app)/payroll/salary-grades/+page.svelte`,
`src/routes/(app)/payroll/pay-codes/+page.svelte`, `src/routes/(app)/profile/+page.svelte`,
`src/routes/(app)/branches/+page.svelte`, `src/lib/components/timesheets/TimesheetModal.svelte`,
`src/lib/components/timesheets/AggregatePanel.svelte`,
`src/lib/components/performance/ReviewFormRender.svelte`, and the post-#23 employee card
components (or `employees/[id]/+page.svelte` if a site stayed there) holding sites 10, 28, 29, 30.

Tests: new `tests/unit/surface-background-scan.test.ts`, new `tests/unit/container-props.test.ts`;
edit `tests/e2e/multi-role-sod.spec.ts` (:110, :123); edit `tests/unit/container-bounds-scan.test.ts`
ONLY if #23 moved employee card-scroll occurrences out of `employees/[id]/+page.svelte` (see step 3).

Read-only regression: `tests/unit/phone-table-header.test.ts`, `tests/e2e/backup-settings.spec.ts:82`,
`tests/unit/theme-token-contrast.test.ts`.

## Public Contracts

- `Container.svelte` props gain `fill?: boolean` (default `true`) and `bodyClass?: string`. Existing
  props and defaults unchanged (`tone = 'muted'`, `flush = false`). No server, API, schema or route
  contract changes.

## Blast Radius

~22 source files + 3-4 test files, UI-only (class strings and wrapper elements). Risk class: none of
the high-risk classes (no auth, billing, schema, API, secrets). Visual risk on every touched page;
behaviour risk only where a table wrapper becomes a Container (scroll body, sticky header, popovers).

## Data Flow

No data change. Render path only: page → Container (outer box: border, radius, bg; inner body:
scroll + padding + `bodyClass`) → unchanged children. Forms inside group-B tables keep their
`form="…"` ids and actions; the markup inside the wrapper is moved verbatim.

## Implementation Checklist

Rules for EXECUTE: no new comments (only `// ponytail:` if a shortcut is taken); existing comments
move verbatim; `bun run <script>` only; do not start servers; stage exact paths.

### Section 0 — preflight
1. Confirm #23 and #27 are merged: `git log --oneline staging -20` shows both PRs; `ls src/lib/components/employees/`.
2. `git switch staging && git pull` then `git switch -c fix/20-container-surfaces`.
3. Full re-scan (record full output, never `head`) — research-20 §3 commands (a)+(b), split-class
   -A3/-B3, `cn(` , (c) tints, (d) ring-1 — PLUS the same (a) and (c) greps with
   `rounded(\s|"|$)` and `rounded-2xl` in place of `rounded-(md|lg|xl)`. Map every hit to a row of the
   per-site table or the carve-out list by file + content anchor. A new hit is classified by PD-5
   R1-R4; if it fits none, STOP and report it (do not decide). Also run
   `grep -rn "card-scroll" src/lib/components/employees "src/routes/(app)/employees/[id]/+page.svelte"`
   and record the counts (feeds step 12).
4. BEFORE screenshots: run the screenshot script (step 20) against the owner's running server on
   the branch tip before any source edit; save to `…/scratchpad/shots/before/`.

### Section 1 — guard test first (red on today's code)
5. Create `tests/unit/surface-background-scan.test.ts` (port of VALIDATE's
   `scratchpad/validate20/scan.mjs`). Pure scanner over source text: find every `class="…"`
   attribute (read to the closing `"` while brace depth is 0, so ternaries are included); tag name
   from the nearest preceding `<`. Tokenise (G5): replace each of `{ } ? : ' \` ( )` with a space,
   split on whitespace; all matches below are whole-token. Flag when tokens include `border`, a
   token matching `^rounded(-(sm|md|lg|xl|2xl|3xl))?$`, the tag is not in
   `button a span input select textarea summary kbd code img`, no token is `border-dashed`,
   `border-input` or `border-destructive`, AND either (a) no token starts `bg-`, or (b) no
   `bg-card` token and a token matches `^bg-(muted|background|accent|secondary)(/\S+)?$`. Walk
   `src/routes` and `src/lib/components` `.svelte` files.
   Carve-outs (G4): array holds ONLY sites the scanner flags, as
   `{ file, anchor, count, why }` where `anchor` = the full static class text up to the first `{`
   (whole string if no `{`), `count` = number of flagged sites in that file with that anchor.
   Re-derive every anchor and count at EXECUTE start (after #23 and #27) by running the scanner
   and matching its output against the carve-out table; do not copy anchors from this plan.
   Tests:
   - fixture negative: `<div class="rounded-lg border p-4">`, `<div class="rounded-md border bg-muted/50 p-4">`, `<label class="rounded-lg border px-3 {on ? 'a' : 'b'}">` → flagged.
   - fixture positive: `<div class="rounded-lg border bg-card p-4">`, `<p class="rounded-lg border border-dashed p-8">`, `<button class="rounded-md border">`, the `<img … rounded-md border …>` from `settings/company/+page.svelte` (~104) → not flagged.
   - repo: flagged sites not covered by a carve-out is `[]` (message lists `file: class`).
   - each carve-out entry matches EXACTLY `count` flagged sites (stale or widened carve-outs fail).
6. Run `bun run test -- tests/unit/surface-background-scan.test.ts` → repo case RED listing sites
   1-31's pre-fix classes (and nothing from the carve-out list). Record the list in the PR body.
   That is the negative control: red for the right reason.
7. Create `tests/unit/container-props.test.ts` (source scan of `Container.svelte` and all `<Container`
   call sites): (a) source contains the literal `'flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border'`;
   (b) `tone = 'muted'` default; (c) `fill = true` default and `bodyClass` inserted into the inner
   body string; (d) the 19 pre-existing call sites (file list from research §1) contain no `fill=`
   and no `bodyClass`. Red on today's code for (c) only.

### Section 2 — Container + TableSkeleton
8. `Container.svelte`: add `fill = true` and `bodyClass` to the destructure and the type (`fill?: boolean`, `bodyClass?: string`). Outer `cn(` first argument becomes
   `fill ? 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border' : 'flex flex-col overflow-hidden rounded-lg border'`.
   Inner body class string: append ` {bodyClass ?? ''}` at the end. Nothing else.
9. `TableSkeleton.svelte`: header row `class="flex gap-4 border-b bg-muted/50 px-4 py-3"` →
   `class="flex gap-4 border-b border-border/60 bg-muted/40 px-4 py-3"`.
10. Gate: `bun run test -- tests/unit/container-props.test.ts` green; `bun run check` green.
    Commit `refactor(ui): let Container sit inline with a capped scroll body` — includes
    container-props.test.ts; its step-7 red output goes in the commit body.
    Commit `fix(ui): match the table skeleton header to the loaded table`.

### Section 3 — Group B wrappers (sites 19-31)
11. For each wrapper: add `import Container from '$lib/components/ui/Container.svelte'` if absent;
    replace the wrapper `<div …>` / `</div>` with the Container tag from the table; the `<table>`
    and everything inside move verbatim.
12. `container-bounds-scan.test.ts`: if step 3 showed #23 moved employee `card-scroll` occurrences
    into `src/lib/components/employees/*`, #23 must already have retargeted the `employees/[id]` 10
    count; verify it is green before and after. Only if it is not green because of a #20 move, change
    that entry to count across the files #23 created (same total). G14 files are untouched.
13. Gate: `bun run test -- tests/unit/container-bounds-scan.test.ts tests/unit/phone-table-header.test.ts` green; `bun run check` green.
    Commit `fix(ui): put the hand-rolled tables in card containers`.

### Section 4 — Group A/D panels (sites 1-18)
14. Apply the Container conversions (4, 5, 8, 9 per R1; 1, 2, 3, 6, 7, 18 per R1b) per PD-5 mapping, adding the import.
15. Apply the class-only swaps (10-17) exactly as in the table.
16. Gate: `bun run test -- tests/unit/surface-background-scan.test.ts` now GREEN;
    `bun run check` green. Commit `fix(ui): give the remaining bare and grey panels the card surface` —
    includes surface-background-scan.test.ts; its step-6 red list goes in the commit body.
17. Owner rule: commit on green only. No test-only red commit; red-first tests travel with the commit that makes them pass (steps 10, 16).

### Section 5 — e2e locator + full gates
18. `multi-role-sod.spec.ts` :110 and :123 per PD-7. Commit `test(e2e): scope the approvals card locator to one card` with body line "Repairs a gate this PR relies on: the div locator matched the whole approvals container."
19. Full CI order: `bun run format:check`, `bun run lint`, `bun run check`, `bun run test`. Fix
    anything red inside the blast radius. e2e (owner's server, ask first):
    `bun run test:e2e -- tests/e2e/multi-role-sod.spec.ts tests/e2e/backup-settings.spec.ts tests/e2e/leave-balances.spec.ts tests/e2e/employees-new-disclosure.spec.ts tests/e2e/employees-new-layout.spec.ts tests/e2e/settings-roles.spec.ts tests/e2e/admin.spec.ts`.

### Section 6 — visual proof
20. Screenshot script (scratchpad, not committed): Playwright, logs in as the seeded admin, for
    each theme sets `localStorage.setItem('theme', 'light'|'dark')` via `addInitScript`, widths 1280
    and 390, full page, crops tall pages. Pages: /dashboard (award + announcement forms open),
    /employees/new (details open), /recruitment/applicant/<id with interview+offer>,
    /recruitment/<id> (job boards), /departments (create open), /requests/<id with docs>,
    /payroll/config (SEMI_MONTHLY), /payroll/statutory-rates (a pending proposal),
    /settings/roles (edit roles open), /settings/leave-types, /payroll/salary-grades,
    /payroll/pay-codes, /profile, /branches, /employees/<id> (leave, personal, compensation,
    documents tabs), a timesheet with TimesheetModal open + AggregatePanel, a performance review
    form, /requests/approvals + /requests/timesheets + /requests/proposals (must look unchanged),
    /payslips (TableSkeleton while loading if catchable, else skip and say so).
21. AFTER screenshots to `…/scratchpad/shots/after/`. Agent-probe: every A/B site reads as a card in
    both themes; carve-outs and the 3 grey Container users unchanged; no double border; no clipped
    popover; group-B tables cap height (card-scroll); at 390 px the script ASSERTS the Container inner body has `scrollWidth > clientWidth` on /settings/leave-types, /payroll/salary-grades and /branches (fails the run otherwise).
22. Owner click-pass (hybrid): owner opens 3 pages in both themes (payroll/config, branches inline
    edit + save, employees/<id> documents) and confirms. Then PR (push only on owner's word).

## Test Plan (vc-test-coverage-plan)

Context loaded: research-20 §6 (existing tests), vitest `environment: 'node'` (no component render
tests; source-scan units are the repo pattern), Playwright e2e against the owner's server.

| Tier | Scenario | Command / Steps | Proves | Does NOT prove |
|---|---|---|---|---|
| Fully-automated | No bordered box without a card surface outside the carve-outs | `bun run test -- tests/unit/surface-background-scan.test.ts` | AC-1, AC-3; red on d773e1a (step 6) | how it looks |
| Fully-automated | Scanner flags planted bare/grey/ternary boxes, spares card/dashed/button | same file, fixture cases | the guard can fail (negative control) and does not refuse everything (positive control) | — |
| Fully-automated | Container defaults unchanged, new props wired, 19 old call sites untouched | `bun run test -- tests/unit/container-props.test.ts` | AC-2 | rendered DOM |
| Fully-automated | Height caps and phone headers kept | `bun run test -- tests/unit/container-bounds-scan.test.ts tests/unit/phone-table-header.test.ts` | AC-4 | real scroll |
| Fully-automated | Types/props valid | `bun run check` | Container props typed at every call | — |
| Hybrid | Approvals card locator scoped; barred user sees none, other approver sees one with Approve | `bun run test:e2e -- tests/e2e/multi-role-sod.spec.ts` (owner's server + seeded DB) | AC-5 | — |
| Hybrid | Settings card grid still bg-card; touched pages still work | `bun run test:e2e -- tests/e2e/backup-settings.spec.ts tests/e2e/leave-balances.spec.ts tests/e2e/employees-new-disclosure.spec.ts tests/e2e/employees-new-layout.spec.ts tests/e2e/settings-roles.spec.ts tests/e2e/admin.spec.ts` | regression | — |
| Hybrid | Group-B tables scroll sideways at 390 px | step 21 script: on /settings/leave-types, /payroll/salary-grades, /branches assert the Container body (`scrollWidth > clientWidth`) | AC-4 | — |
| Agent-Probe | Before/after screenshots both themes, 2 widths | step 20-21 | AC-6 | what the owner's eye catches |
| Hybrid | Owner click pass 3 pages both themes | step 22 | AC-6 | — |

Failing stubs (red-first): `test("repo has no bordered box without a card surface outside the carve-outs")`,
`test("scanner flags a planted bare box")`, `test("Container keeps fill default true and wires bodyClass")`.

## Acceptance Criteria

- AC-1: every site 1-31 renders a `bg-card` surface (Container `tone="card"` or class) — proven by: surface-background-scan repo case; strategy: Fully-Automated.
- AC-2: the 19 existing Container users are unchanged (props, outer class, grey default) — proven by: container-props test + screenshots of the 3 grey pages; strategy: Fully-Automated.
- AC-3: carve-outs are explicit and still live — proven by: surface-background-scan stale-carve-out case; strategy: Fully-Automated.
- AC-4: card-scroll caps and phone sticky headers kept — proven by: container-bounds-scan + phone-table-header; strategy: Fully-Automated.
- AC-5: multi-role-sod locator can fail and scopes to one card — proven by: multi-role-sod e2e; strategy: Hybrid.
- AC-6: correct in light AND dark — proven by: before/after screenshots + owner click pass; strategy: Agent-Probe.
- AC-7: one PR to staging.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| surface-background-scan (red at step 6, green at step 16) | Fully-Automated | AC-1, AC-3 |
| scanner fixture negatives/positives | Fully-Automated | AC-1 (guard can fail) |
| container-props | Fully-Automated | AC-2 |
| container-bounds-scan + phone-table-header | Fully-Automated | AC-4 |
| format:check, lint, check, test | Fully-Automated | all (CI parity) |
| multi-role-sod e2e | Hybrid | AC-5 |
| backup-settings, leave-balances, employees-new-disclosure, employees-new-layout, settings-roles, admin e2e | Hybrid | regression |
| 390 px body scrollWidth > clientWidth (leave-types, salary-grades, branches) | Hybrid | AC-4 |
| screenshots both themes, 1280 + 390 | Agent-Probe | AC-6 |
| owner click pass | Hybrid | AC-6 |

## Phase Completion Rules

CODE DONE when sections 0-5 gates are green. VERIFIED only with the e2e run, the screenshot probe and
the owner click pass recorded.

## Dependencies and Risks

- Depends on #23 and #27 merged. #23 moves sites 10, 28-30; identify by content.
- Risk: Container's `overflow-hidden` clips a popover → R1 popover check; screenshots.
- Risk: a table as a flex-column child behaves differently from a block child → body is
  `overflow-y-auto` (so x also scrolls); verify sideways scroll at 390px in step 21.
- Risk: `rounded-md` boxes become `rounded-lg` inside Container (Container fixes the radius) —
  accepted, canonical.
- Risk: a nested card inside a `bg-card` section (group B inside section cards) shows two same-colour
  surfaces; the border still separates them — accepted by D3.
- Rollback: one PR, revert the merge commit.

## Parallel lanes

Not recommended: Container change must land first, and the sweep is ~20 small edits. One execute
agent, sequential sections. If split: lane A = group B files (sites 19-31), lane B = group A/D files
(1-18); no shared file except `requests/[id]` and `recruitment/*` belong to lane B only; Container,
TableSkeleton and tests stay with the orchestrator.

## Commit and PR plan

Commits (no AI attribution, no Co-Authored-By): see steps 10, 13, 16, 17, 18. One PR
`fix(ui): one card surface for bordered containers (#20)` → `staging`. Body: re-scan output, red list
from step 6, carve-out table, screenshot links. Push only on the owner's word.

## Test Infra Improvement Notes

(none identified yet) — candidate: a shared class-attribute scanner if a second surface test appears.

## Resume and Execution Handoff

1. Selected plan: `process/general-plans/active/hris-20-container-surfaces_PLAN_24-09-26.md`
2. Last completed step: PLAN written; no execution.
3. Validate contract: pending.
4. Context loaded: scratchpad `CONTEXT.md`, `PLAN-BRIEF.md`, `research-20.md`; issue #20 body + comments; Container.svelte, TableSkeleton.svelte, Table.svelte thead, container-bounds-scan, phone-table-header, multi-role-sod, backup-settings.
5. Next: VALIDATE CONDITIONAL gaps G1-G8 folded into the body (24-09-26); EXECUTE from Section 0 after #23 and #27 merge.

## Validate Contract

Status: CONDITIONAL
Date: 24-09-26
date: 2026-09-24
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 1/7 signals (S7, more than 5 files). No high-risk class, no schema, API or auth surface. Container must land first, and the sweep is small edits. One execute agent.

Evidence base: staging d773e1a. The step-5 scanner was built as specified and run on today's source (scratchpad `validate20/scan.mjs`). It flags 46 sites. Sites 1-31 are all among them.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1 | No bordered box without a card surface outside the carve-outs | Fully-Automated | `bun run test -- tests/unit/surface-background-scan.test.ts` (red at step 6, green at step 16) | B |
| AC-1 | Scanner flags planted bare, grey and ternary boxes, and spares card, dashed, button and img | Fully-Automated | same file, fixture cases | B |
| AC-3 | Each carve-out entry matches exactly `count` flagged sites (no stale entries, no silent extras) | Fully-Automated | same file, carve-out drift case | B |
| AC-2 | Container defaults unchanged, new props wired, 19 old call sites untouched | Fully-Automated | `bun run test -- tests/unit/container-props.test.ts` | B |
| AC-4 | card-scroll counts and phone sticky headers kept | Fully-Automated | `bun run test -- tests/unit/container-bounds-scan.test.ts tests/unit/phone-table-header.test.ts` | A |
| all | CI parity | Fully-Automated | `bun run format:check` then `bun run lint` then `bun run check` then `bun run test` | A |
| AC-5 | Approvals locator scoped to one card; barred user sees none; other approver sees one with Approve | Hybrid | `bun run test:e2e -- tests/e2e/multi-role-sod.spec.ts` (owner's server, seeded DB) | B |
| regression | Edited R2/R3 sites keep their e2e hooks | Hybrid | `bun run test:e2e -- tests/e2e/backup-settings.spec.ts tests/e2e/leave-balances.spec.ts tests/e2e/employees-new-disclosure.spec.ts tests/e2e/employees-new-layout.spec.ts tests/e2e/settings-roles.spec.ts tests/e2e/admin.spec.ts` | B |
| AC-6 | Card surface in light and dark; tables still scroll sideways at 390 px; card-scroll caps height; no clipped popover | Agent-Probe | step 20-21 screenshots, plus a DOM check per group-B site at 390 px: the Container body has `scrollWidth > clientWidth` where the table is wider | A |
| AC-6 | Owner eye pass | Hybrid | step 22 owner click pass, 3 pages, both themes | A |

Failing stub (AC-1 repo case):
test("repo has no bordered box without a card surface outside the carve-outs", () => { throw new Error("NOT IMPLEMENTED — TDD stub: repo has no bordered box without a card surface outside the carve-outs") })
Failing stub (AC-1 fixtures):
test("scanner flags a planted bare box and spares card, dashed, button and img", () => { throw new Error("NOT IMPLEMENTED — TDD stub: scanner fixtures") })
Failing stub (AC-3):
test("every carve-out entry matches exactly its count of flagged sites", () => { throw new Error("NOT IMPLEMENTED — TDD stub: carve-out drift") })
Failing stub (AC-2):
test("Container keeps fill default true and wires bodyClass", () => { throw new Error("NOT IMPLEMENTED — TDD stub: Container props") })
(AC-4 and CI parity use existing suites. No stub.)

Legacy line form:
- surface scan: Fully-automated: `bun run test -- tests/unit/surface-background-scan.test.ts`
- Container props: Fully-automated: `bun run test -- tests/unit/container-props.test.ts`
- bounds + phone headers: Fully-automated: `bun run test -- tests/unit/container-bounds-scan.test.ts tests/unit/phone-table-header.test.ts`
- approvals locator: hybrid: `bun run test:e2e -- tests/e2e/multi-role-sod.spec.ts` + owner's server
- edited-site hooks: hybrid: e2e list above + owner's server
- visual: agent-probe: before/after screenshots both themes, 1280 + 390

Dimension findings:
- Infra fit: PASS — UI class strings and wrapper elements only. No server, runtime or DB change. Script names exist in `package.json` (`test`, `test:e2e`, `check`, `lint`, `format:check`).
- Test coverage: CONCERN — the guard as written cannot go green (F2, F3) and its stale check is undefined (F4). The e2e list misses 4 specs that touch edited sites (F7).
- Breaking changes: PASS — Container props are additive. `fill` default true keeps the outer literal (`Container.svelte:28`) and all 19 call sites. `tone = 'muted'` stays (`:11`).
- Security surface: PASS — no auth, data, secret or trust-boundary change.
- Section 0 preflight: PASS — the re-scan adds plain `rounded` and `rounded-2xl`. That scan finds F3's `<img>`, which step 3 would STOP on. F3 resolves it now.
- Section 1 guard test: CONCERN — F2, F3, F4, F5.
- Section 2 Container + TableSkeleton: PASS — PD-1 literal verified. PD-4 copies `Table.svelte:71` `border-b border-border/60 bg-muted/40`. PD-2's stated reason is wrong (F6), but the decision holds.
- Section 3 group B: PASS — `card-scroll` counts are a literal count (`container-bounds-scan.test.ts:155` `split('card-scroll')`), so `bodyClass="card-scroll"` keeps them. G14 files gain no card-scroll. Phone-header regex (`phone-table-header.test.ts:31`) targets files and wrappers #20 does not touch. Sideways scroll holds: the body has `overflow-y-auto`, so CSS computes `overflow-x` to `auto`, and `w-full min-w-max` tables overflow into it.
- Section 4 group A/D: CONCERN — owner-intent gap on the panel-type R2 sites (F1).
- Section 5 e2e: PASS for PD-7. CONCERN for the regression list (F7).
- Section 6 visual: PASS — `app.html:11` reads `localStorage.getItem('theme') || 'dark'`, so the `addInitScript` plan sets the theme correctly.

Findings (numbered, with severity):
- F1 CONCERN (owner intent). Five R2 sites are content panels, not controls: dashboard award and announcement forms (`dashboard/+page.svelte:597`, `:631`), employees/new `<details>` (`employees/new/+page.svelte:457`), departments create form (`departments/+page.svelte:118`) and requests upload form (`requests/[id]/+page.svelte:270`). A sixth, the ReviewFormRender rating `<ul>` (`ReviewFormRender.svelte:168`), is a bordered list box. The owner said containers must use Container. Container CAN host all six with no behaviour change. Put the semantic element INSIDE the Container; the element keeps its tag, action, `use:enhance`, `open` and padding. No popovers inside (checked). E2E hooks are descendant selectors: `employees-new-disclosure.spec.ts:99` `form[action="?/create"] details` and `:130` `details > summary` still match. Cost per site: one wrapper, one import, radius md→lg. The class-only split IS right for sites 10-17. They are tiles, a list row and a checkbox option, not containers by the owner's own definition (toolbar, content, footer, empty state, fill). Two sites prove the split. Site 15 is found by `leave-balances.spec.ts:151` `[data-leave-type=…]`, and Container does not pass extra attributes, so a wrapper would lose that hook. Site 17's border follows its checked state inside the Edit-roles dialog.
- F2 CONCERN. `reports/[type]/+page.svelte:223` `flex h-40 … rounded-lg border bg-muted/30` has NO `border-dashed`, but the carve-out table files it under the dashed rule. The scanner flags it, so the repo case stays red after step 16.
- F3 CONCERN (site N+1). `settings/company/+page.svelte:104` `<img class="mt-2 h-12 w-auto rounded border object-contain">` is flagged (plain `rounded`). It is in neither list. It is a logo preview, not a box.
- F4 CONCERN (rubber-stamp risk). Several carve-out table rows are never flagged by the scanner: onboarding panel (both branches tinted green/amber, `employees/[id]:293`), `AttendanceHrGrid.svelte:814` banner (both branches tinted), `LoadError.svelte:29` (a `<button>`), `Container.svelte` (`class={cn(…)}`, not `class="`), the 3 grey Container users (no class attribute). A stale check of "matches a flagged site" makes these entries red forever. A stale check of "anchor text is in the file" can never fail in practice. Short anchors such as `overflow-x-auto` would also wave through any new box in that file.
- F5 LOW. Tokenizing is unstated. Split on whitespace only, and ternary tokens keep quotes (`'bg-background'}`). Substring exclusion, and `border-destructive/20` (`AttendanceHrGrid.svelte:546`) silently exempts a banner.
- F6 LOW. PD-2 says twMerge would replace `overflow-hidden` with `card-scroll`. That is false: `cn` is plain `twMerge(clsx(…))` (`src/lib/utils/cn.ts:5`), and `card-scroll` is a custom `@layer components` class it does not know. `bodyClass` is still the right choice, because the cap belongs on the element that scrolls. Fix the sentence.
- F7 CONCERN. Step 19 e2e runs only multi-role-sod and backup-settings. Edited sites are also hit by `leave-balances.spec.ts:151-157` (site 15), `employees-new-disclosure.spec.ts` + `employees-new-layout.spec.ts:158` (site 3), `settings-roles.spec.ts:60` `label:has(input[value="EMPLOYEE"])` (site 17), and `admin.spec.ts:128` (site 3 summary click).
- F8 PASS (PD-7). Approvals cards are `<li class="flex flex-col rounded-lg border bg-card …">` (`approvals/+page.svelte:236-237`) and the reason `<p>` is inside the li (`:310`). Today `div.rounded-lg.border` hits the grey Container's outer div (`Container.svelte:28`), so `:123 .first()` is the whole list. With 2 or more pending cards, `getByRole('button',{name:'Approve'})` is a strict-mode violation. `li.rounded-lg.border` fails at `:111` if the barred card renders, and passes at `:125` only on the real card. Both directions are meaningful. Note: #20 does not change approvals markup. This is a gate-hygiene fix to a gate the plan relies on, not a #20 defect.
- F9 PASS (PD-1/PD-2 runtime). With `fill={false}` the outer box is `flex flex-col` with no height set. The body's `flex-1` (basis 0%) resolves to content height, so `max-h-[min(60vh,28rem)]` from `card-scroll` (`app.css:249-250`) caps it and `overflow-y-auto` scrolls. Outer `overflow-hidden` gives min-width 0 in grid and flex parents, like today's `overflow-x-auto`. Site 28 (`employees/[id]:946`, no overflow-x today) gains sideways scroll. That is harmless.
- F10 LOW. The PD-5 R1 popover rule is too strict for DatePicker. Its panels are `position: fixed` (`DatePicker.svelte:712`, `:791`, `:834`), so `overflow-hidden` cannot clip them. Only HelpTip (`absolute`, `HelpTip.svelte:42`) clips. No change is needed; R1 errs safe.
- F11 PASS. Commit messages carry no AI attribution. The plan says so (Commit and PR plan). Gate commands use `bun run <script>`.

Proposed plan updates (for the PVL supplement):
- P1 (F1) PD-5: move the panel-type semantic roots to R1-hosted. The Container wraps the element, and the element keeps tag, attributes and padding: sites 1, 2, 3, 6, 7, 18 → `<Container tone="card" fill={false} flush><form … class="space-y-2 p-3">…</form></Container>` (padding and layout stay on the element; `border`, `rounded-*`, `bg-*` dropped). R2 keeps only: `li`, `label`, `p`, list rows (16), and elements with an attribute a test or script reads (15). Drop the grid-of-siblings rule for panels: Container `tone="card"` renders the same `rounded-lg border bg-card` as its siblings. Update the per-site table rows 1, 2, 3, 6, 7, 18 and the TL;DR. PR body: state the rule "containers = content boxes; tiles, rows and option controls are not" with sites 10-17 named.
- P2 (F2) Carve-out table: move `reports/[type]` `flex h-40 items-center justify-center rounded-lg border bg-muted/30` out of the dashed row into its own row "grey empty-state box (not dashed)".
- P3 (F3) Step 5: add `img` to the small-control tag list, plus a fixture: `<img class="rounded border">` → not flagged.
- P4 (F4) Step 5: the carve-out array holds ONLY sites the scanner flags. Rule-based exclusions (tags, border-dashed/input/destructive) have no array entry. Each entry is `{ file, anchor, count, why }` with `anchor` = the full static class prefix up to the first `{`. The drift case asserts each entry matches EXACTLY `count` flagged sites. At d773e1a that gives 13 entries (14 sites): AttendanceHrGrid segmented (count 2) + :545 banner, CalculatorWindow:75, PunchMapDialog:140, PeriodPicker:190, Toaster:72, dashboard:549, inventory:248, recruitment/[id]:215, reports/[type]:223, requests/[id]:201, settings/roles:401, team:62. Re-derive the anchors after #27 merges (it edits Toaster `kindClass`).
- P5 (F5) Step 5: tokenize by replacing `{ } ? : ' \` ( )` with spaces, then split on whitespace. Match all exclusions as whole tokens.
- P6 (F6) PD-2: replace the twMerge sentence with "the cap goes on the element that scrolls; the outer box stays `overflow-hidden` for the rounded clip".
- P7 (F7) Step 19: add `tests/e2e/leave-balances.spec.ts tests/e2e/employees-new-disclosure.spec.ts tests/e2e/employees-new-layout.spec.ts tests/e2e/settings-roles.spec.ts tests/e2e/admin.spec.ts` to the e2e command.
- P8 Step 21: add the DOM check for group B at 390 px (body `scrollWidth > clientWidth` on a `min-w-max` table: leave-types, salary-grades, branches).

Execute-agent instructions:
- E1 Before step 6, run the scanner and confirm the red list is sites 1-31 only (plus nothing from the carve-out entries). If any other site shows, STOP and report it.
- E2 Site 15 stays class-only. Never move `data-leave-type` off the tile.
- E3 Sites 4, 5, 8, 9: `{@const}` stays a direct child of `{#each}` / `{#if}`, above the Container.
- E4 A one-line PR note: the approvals locator fix (PD-7) is a gate fix, not a #20 markup change.

Open gaps: none outside this plan. The 8 findings above go to the plan supplement.
What this coverage does NOT prove:
- surface-background-scan: only reads `class="…"` literals. It does not see `class={expr}`, `<Container class=…>`, one-sided radii (`rounded-b-lg`), `border-2`, or a ternary where one branch has a non-grey bg and the other has none (the token check sees a bg token). None of these has a live site today (checked by grep). It proves nothing about the rendered colour.
- container-props: proves strings in source, not the rendered DOM or that `fill` picks the right branch at runtime.
- container-bounds-scan / phone-table-header: prove a literal count, not that a cap applies or that a sticky header sticks.
- e2e: prove hooks and flows on the pages they visit, not the look.
- screenshots: prove the look only on the pages and data shown. The card-scroll cap is visible only if the seeded list is longer than the cap.
Gate: CONDITIONAL (0 FAILs, 5 CONCERNs, 3 LOW; supplement required before EXECUTE)
Accepted by: not yet accepted — first-pass CONDITIONAL, 0 PVL fix cycles recorded. Concerns open: F1 owner-intent panels, F2 reports empty-state carve-out, F3 img site N+1, F4 carve-out drift check, F7 e2e list. The orchestrator runs the supplement and then re-validates.

## Autonomous Goal Block

```
/goal HRIS #20 — one card surface for bordered containers, through Container.svelte, one PR to staging.
Plan: process/general-plans/active/hris-20-container-surfaces_PLAN_24-09-26.md (read ## Validate Contract first).
Start only after #23 and #27 are merged to staging.
Charter: Container gains fill (default true) and bodyClass; group B wrappers and content panels become tone="card" Containers; tiles, rows and option controls get bg-card by class; carve-outs keep their look and are listed in tests/unit/surface-background-scan.test.ts.
Autonomy: edit only the files in Touchpoints; bun run <script> only; commit per section, stage exact paths, no AI attribution, no Co-Authored-By; no new comments.
Hard stops: never start servers or the DB (owner does); never push; never edit .env*; a re-scan hit that fits no PD-5 rule -> stop and report; e2e only on the owner's server after asking.
Gates: bun run format:check -> lint -> check -> test; surface-background-scan red at step 6 for sites 1-31 only, green at step 16; e2e list from the contract; before/after screenshots both themes (localStorage theme), 1280 + 390; owner click pass.
Execute start: Section 0 step 1 (confirm #23 and #27 merged), then the branch fix/20-container-surfaces off updated staging.
```
