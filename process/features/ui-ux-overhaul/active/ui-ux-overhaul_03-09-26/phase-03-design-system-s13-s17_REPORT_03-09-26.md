---
name: report:phase-03-design-system-s13-s17
description: "Phase 03 sections S13-S17 — Banner and its sweep, both PageHeader sweeps, the EmptyState sweep, money-column alignment; plus the phase-level close for all 17 sections"
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

# Phase 03 — S13 to S17 execute report, and the phase close

**TL;DR.** Five sections, five commits, all four CI gates green before every one. All four of
the phase's exit greps now return nothing (or only the two allowed Dialog files). No page hit
the S14/S15 STOP rule — every one of the 39 headings converted and every relocated action found
a home. e2e is 141/141 at both the S15 and S17 boundaries, the recorded baseline, which is what
proves the 31 `getByRole('heading')` assertions survived the rewrites. **All 17 sections of
phase 03 are now CODE DONE.** The phase is NOT `VERIFIED`: every hybrid and agent-probe gate is
the owner's manual pass and is listed at the end.

## What Was Done

| Section | Commit | Files | Sites |
|---|---|---|---|
| S13 — `Banner.svelte` + banner sweep | `73c4f8f` | 36 (1 new + 35 swept) | 52 banners |
| S14 — PageHeader: people + time | `c487adc` | 14 | 14 headings |
| S15 — PageHeader: pay, cases, the rest + dead CSS | `1bb272f` | 27 (25 pages + `app.css` + `PageHeader.svelte`) | 25 headings |
| S16 — EmptyState sweep | `d9087c5` | 23 | 24 empty states |
| S17 — money-column alignment + backlog stub | `b2d22c5` | 10 + 1 stub | 22 columns |

Branch `feat/uiux-phase-3`, commits `73c4f8f`..`b2d22c5`. **Not pushed.**

### S13 — `src/lib/components/ui/Banner.svelte` (new) + 35 files

One feedback banner for the whole app, lifted from the recipe already correct at
`separations/[id]/+page.svelte:63-100`. 52 hand-rolled copies replaced.

`TONE` is a record of **complete, static** class strings per kind — never a fragment. Tailwind's
JIT scans literal strings and `tailwind.config` has no `safelist`, so an interpolated
`bg-{kind}-500/10` would compile to no CSS at all and the banner would render invisible. This is
the failure mode the plan called out explicitly and it is designed out, not tested around.

`role="alert"` for `error`/`warning`, `role="status"` for `success`/`info`, derived from `kind`.
`performance/reviews/[id]` had hand-written `role="alert"`; the component supplies it now.

**Colour drift closed.** 19 of the 52 swept sites had no theme pair at all — 13 dark-only
(`text-green-400` / `text-amber-400` / `text-amber-500` on a white card: `payroll/periods`,
`profile`, `dashboard` ×2, `employees/[id]` ×7, `complaints`, `complaints/[id]`) and 6 light-only
(`text-green-600` with no `dark:`: `attendance`, `leave`, `timesheets`, `requests/timesheets`,
`requests/approvals`, `requests/proposals`). All 19 are theme-paired now. This is the
success/warning half of the audit's T2 finding.

A `class` prop exists for outer placement only — three call sites need `mt-4` or a grid span
(`settings/backup`, `employees/[id]:1764`). It never carries colour.

**Deliberately NOT swept** (three `bg-*-500/5` boxes that are static data panels, not live
feedback, so `role="alert"`/`role="status"` would be wrong): `AggregatePanel`'s warnings preview,
`TimesheetModal`'s rejection-reason display, and the applicant page's "Converted to employee"
note.

No scroll-into-view, auto-clear, per-form scoping or toasts were added — all phase 07.

### S14 + S15 — PageHeader across all 39 pages

**Re-derivation done first, as instructed.** `grep -rl '<h1' 'src/routes/(app)'` returned exactly
39 files. Reconciled against the plan: S14's list is 14 (attendance, benefits, dashboard,
departments, employees ×3, leave ×3, profile, punch, team, timesheets) and S15's is 25. 14 + 25 =
39, file for file. **No plan defect** — the VALIDATE V2 correction that added `benefits` and
`departments` was right.

Every title string is verbatim. Renaming is phase 08.

**No page hit the STOP rule.** The 29 action-adjacent sites resolved into four patterns:

1. **Onto an existing toolbar** (`ml-auto` at the end of a filter/search row) — `employees`
   (Add Employee), `team` (Daily roster), `attendance` (Multi-day matrix, onto the view-toggle
   row).
2. **Into the `back` snippet**, where the thing on the title row really was a back action —
   `employees/new` and `leave/new` (their Cancel links), `leave/balances` (its bare "← Leave"
   anchor became a real `BackButton`), `complaints/[id]` (its "← Back to inquiries").
3. **A right-aligned row directly above the thing it acts on**, where the page had no stable
   section heading — `timesheets`, `benefits`, `departments`, `requests`, `complaints`,
   `separations`, `recruitment`, `payroll`, `payroll/[id]` (Recompute, above the totals and
   entries it rebuilds), `leave` (View all balances, above the balances grid).
4. **Inside the page's existing summary card** — `separations/[id]` and `recruitment/[id]`.
   Lifting their `<h1>` out of its card would have left a headless card, which is exactly the
   redesign the STOP rule forbids. Putting `PageHeader` inside the card is not a redesign, and
   both pages keep their card, their meta lines and their action cluster.

`timesheets` is worth naming: its New Timesheet button could NOT ride a section heading, because
`data.canCreate` is independent of which of the two sections (`My`/`Team`) render — a user who
can create but has no employee record and is not a manager would have lost the button entirely.
It got pattern 3.

**Title-row right edge.** The `back` snippet carries what already sat on that line: the
`BackButton`, plus the status `Badge` on `employees/[id]`, `requests/[id]`, `separations/[id]`,
`payroll/[id]`, `performance/reviews/[id]` and `complaints/[id]`; the stage pill on the applicant
page; the posting-status pill on `recruitment/[id]`; and the "N awaiting you" count on
`requests/approvals`.

**Dead CSS removed.** `profile` and `dashboard` were the last two users of `.page-header` /
`.page-title`. Both rules are deleted from `src/app.css`. `PageHeader.svelte`'s own comment was
reworded so it no longer contains those two strings — otherwise the exit grep would match its own
prose forever and never read clean.

### S16 — EmptyState across 22 files

24 sites: 19 bare `colspan` "no rows" cells, four bordered "nothing here" divs, one dashed
paragraph. Each had its own padding and wording; three ended in a period and the rest did not.

**Each site was judged, not swept.** Only three pages can actually filter their list, and only
those pass `variant="no-results"`:

- `employees` — search or branch filter, read from **the URL, not the bound input**, so typing
  cannot flip the copy to "no results" before the search is submitted.
- `leave/balances` — search or department filter.
- `attendance` — the exceptions-only toggle, on both of its tables.

Everywhere else nothing exists yet, so the default `empty` stands. Getting this backwards is the
exact failure the component's own comment warns about.

Two-sentence wordings split into title + description (`departments`, `settings/schedules`,
`complaints`, benefits plans). Titles lost their trailing periods; descriptions keep theirs.

No existing "Create" link sat inside any converted empty state, so no `action` snippet was
needed. Not converted, and why: `complaints/[id]`'s "This inquiry is resolved" and
`requests/[id]`'s dashed unverified-document row are state notices, not empty states.

Tables were NOT migrated to `Table.svelte`.

### S17 — money columns

`tabular-nums` paired with every money column in payroll (list, detail, periods), reports
(summary and the dynamic `[type]` report), benefits, inventory and leave balances — matching the
payslips list, which was already the only table doing it.

Two real alignment bugs fixed, not just class hygiene:

- **`timesheets` Total Hours** was left-aligned, header and cell, inside a `table-fixed` layout
  built specifically so that column would line up between the My and Team tables (audit §4).
- **`reports/[type]`** right-aligned its currency columns in the body but not in the header, so
  every money label floated left of its own column.

`benefits`' actions cell is also `text-right` and deliberately did NOT get `tabular-nums` — it
holds a form, not a number.

## What Was Skipped or Deferred

- **Every hybrid gate** (§8.3 light/dark computed-style spot-check with negative control, §8.5
  WCAG AA contrast measurement). Not run. No server was started, per the standing rule that the
  owner starts them.
- **Every agent-probe gate** (§8.6 route-family screenshot review, the `no-results` vs `empty`
  filter-applied judgement). Not run.
- **The Banner four-kind computed-background check** the plan asks for in S13 step 1 — load a
  page with each of the four kinds and confirm a non-transparent computed `background-color`.
  Not run; it needs a browser. The static-class-record design is what makes the failure it
  guards against structurally impossible, but that is an argument, not a measurement.
- **390px responsive verification.** Named Known-Gap. Backlog stub written:
  `process/features/ui-ux-overhaul/backlog/phase-03-responsive-sweep_NOTE_03-09-26.md`. Its gate
  stays CONDITIONAL.
- **`vc-code-reviewer` / `vc-code-simplifier` / `impeccable` sub-step review gates.** The Agent
  tool is not available in this session, so no specialist agent could be spawned. Self-review
  against the plan was done in-thread instead. Stated plainly rather than claimed.

## Test Gate Outcomes

Full CI gate set, in CI's order, before every one of the five commits:

| Gate | Result |
|---|---|
| `pnpm format:check` | PASS (all five) |
| `pnpm lint` | PASS — 0 errors, 1 warning, all five. The warning is pre-existing and untouched: `CalculatorWindow.svelte:82` `a11y_no_static_element_interactions` |
| `pnpm check` | PASS — 1101 files, 0 errors, 1 warning (the same one), all five |
| `pnpm test` | PASS — 199 files, 2273 tests, all five |

**e2e at both required boundaries:**

| Boundary | Result | Baseline |
|---|---|---|
| S15 | **141 passed (46.7s)** | 141/141 — unchanged |
| S17 | **141 passed (46.4s)** | 141/141 — unchanged |

No failure to read at either boundary, so no locator or casing fix was needed and no assertion
was touched. This is the gate that covers the 31 `getByRole('heading', …)` assertions riding on
the S14/S15 rewrites — they all still resolve, which is the automated half of AC-6.

## Plan Deviations

All within blast radius. None touches auth, schema, a public API, a container, or any server
file. **No server-side edit was needed at any point**, so the plan's mis-scoping tripwire never
fired.

1. **`Banner` has a `class` prop.** The plan's contract lists only `kind` / `message` /
   `children`. Three call sites need outer placement (`mt-4`, `lg:col-span-2`) that the fixed
   recipe cannot express. The prop is documented as placement-only and never carries colour.
2. **`dashboard`'s "Award given." banner is `kind="success"`, not `warning`.** It was amber, but
   it is a confirmation, and `warning` would have given it `role="alert"` — a screen-reader
   interruption for a success message. Colour changed to green as a consequence.
3. **Three `bg-*-500/5` panels excluded from the S13 sweep** (listed above). They are static data
   displays; giving them a live-region role would be wrong.
4. **`PageHeader` inside a card on two detail pages** (`separations/[id]`, `recruitment/[id]`) —
   see S15 pattern 4. This is the alternative to invoking the STOP rule, and it preserves both
   pages exactly.
5. **Four descriptions stayed as their own `<p>` under the title** — `leave`, `payroll/config`
   and `settings/onboarding` carry markup (a link, or emphasis) and `payroll/statutory-rates`
   branches on capability. `PageHeader`'s `description` is a `string` and cannot hold any of
   them. A `-mt-4` pulls each paragraph up into the header's own spacing so the pages read
   unchanged.
6. **`payroll/[id]`'s `<h1>` lost its inner `<span>`.** The day count was
   `<span class="text-base font-normal text-muted-foreground">(15 days)</span>` inside the
   heading; `PageHeader`'s title is a string, so the count is now plain text in the title. The
   accessible name is byte-identical, so no e2e assertion moved — only the muted styling of the
   parenthetical is gone.
7. **`leave/balances`' "← Leave" anchor became a real `BackButton`** and `complaints/[id]`'s
   "← Back to inquiries" moved into the `back` snippet verbatim. The plan says to move an
   existing Back link into the snippet; `leave/balances` got the upgrade because every other
   converted page uses the component.
8. **Commit-message drift, recorded for honesty.** `73c4f8f`'s subject says "54 hand-rolled
   feedback banners". The true count is **52** (`grep -rho '<Banner' src --include='*.svelte'`).
   The message is off by two; this report's number is the correct one. Not amended — the commit
   is on a branch with four commits on top of it and rewriting it is not worth the churn.

## Test Infra Gaps Found

None new. The standing one, restated because it bounds everything above: `vitest.config.ts` runs
`environment: 'node'`, so **nothing in this phase is unit-rendered at all**. `Banner`,
`PageHeader` and `EmptyState` have zero rendering tests and cannot have any without a DOM
environment. Every claim in this report about how something looks rests on either the e2e suite
or the deferred manual pass — never on `pnpm test`.

`CONTEXT_PARTIAL: hybrid verification` — no colour, contrast, theme or viewport claim in this
report is a measurement of the running app. No server was started.

## Phase-level close — all 17 sections

**Status: `CODE DONE`. Not `VERIFIED`.**

All 17 sections are committed and the full CI gate set is green at every section boundary, which
is the plan's own definition of `CODE DONE`. Promotion to `VERIFIED` additionally requires every
hybrid gate run against a live browser with its negative control, the AA contrast measurements
recorded, and the agent-probe screenshot review recorded. None of that is done.

### The four exit greps — final output, run on `b2d22c5`

```
$ grep -rl 'statusClass\|statusCls\|badgeClass\|pillClass' 'src/routes/(app)' src/lib/components
                                                                          (no output, exit 1)

$ grep -rl '<h1' 'src/routes/(app)'
                                                                          (no output, exit 1)

$ grep -rn 'page-header\|page-title' src --include='*.svelte'
                                                                          (no output, exit 1)

$ grep -rln 'fixed inset-0' src --include='*.svelte'
src/lib/components/ui/Dialog.svelte
src/routes/(app)/+layout.svelte
```

The third grep is fully clean, not partial: the only remaining match anywhere was
`PageHeader.svelte`'s own comment describing the classes it replaced, and that prose was reworded
in S15 so the gate reads honestly instead of matching itself.

The fourth returns exactly the two allowed files — the primitive and the layout's nav drawer,
which the plan excludes by name.

**AC-4** (zero hand-rolled status helpers), **AC-5** automated half (one modal implementation)
and **AC-6** (PageHeader adoption complete, no legacy classes) are all proven by these.

### Adoption, measured on `b2d22c5`

| Kit component | Before phase 03 | Now |
|---|---|---|
| `PageHeader` | 20 of 61 `(app)` pages | **59 files** (every page, plus nested users) |
| `EmptyState` | 5 files | **28 files** |
| `Banner` | did not exist | **52 sites in 35 files** |
| `Dialog` | did not exist | 7 consumers, and the only `fixed inset-0` modal left |
| `tabular-nums` | 9 files | **18 files** |

### Consolidated deferred-verification list for the owner

Everything below is unrun. It is gathered from all three section reports so there is one place to
work from. Precondition for every item: the **owner** starts `./start.sh` and the dev server —
never launch them. Drive with Playwright MCP + `POST /api/v1/_dev/login-as`.

**A. Colour and theme (§8.3) — from S1-S5, plus S13's new banners**

1. Light/dark computed-style spot-check on the five named pages: `/payroll/periods` (the
   `.badge-gray` white-on-white fix), `/timesheets`, `/requests/[id]` (approval-chain circles),
   `/separations/[id]`, `/employees`. Assert `getComputedStyle(el).color`, not a class string.
2. **Negative control on each:** assert one element the phase did NOT touch still has its
   original computed colour. If both change, the selector is wrong.
3. **New in S13:** load a page carrying each of the four `Banner` kinds and confirm a
   non-transparent computed `background-color`. A silently unstyled banner is the JIT failure
   mode the static class record is designed against. Suggested pages — error:
   `/settings/pay-codes` after a bad submit; success: `/profile` after a save; warning:
   `/performance` with a template backfill; info: no site uses `info` yet.

**B. WCAG AA contrast (§8.5) — from S1-S5**

4. Measure every changed pair against the **composited** background (a 15% tint over white is not
   white) and record the ratio in the phase report. Floor is 4.5:1 at the badge's 12px size.
   The pairs to re-measure are the S1 replacements the contract applied as OD-1 defaults:
   `text-green-800` on `bg-green-500/15`, and `text-foreground/70` on `bg-muted`. Both were
   chosen by arithmetic, not measurement.

**C. Modal focus behaviour (§8.4) — from S6-S12**

5. Per migrated modal (roles editor, `PunchMapDialog`, `TimesheetModal`, `NewTimesheetDialog`,
   `ApplicantKanban` stage-move, plus `ConfirmDialog` and `ReasonDialog`): focus lands inside the
   panel on open; Tab wraps from last to first; Shift+Tab wraps from first to last; Escape closes
   AND returns focus to the trigger; backdrop click closes.
6. **The S8 negative control is only reachable from commit `b6042c7`.** It had to be recorded
   against the untouched roles dialog before the S8 edit, and that edit is committed. Check out
   `b6042c7` to run the "before", or the "after" proves nothing on its own.
7. **§8.4.7 nested-dialog Escape:** open the `ReasonDialog` nested inside `TimesheetModal:522`,
   press Escape, assert only the inner one closed. This is what `stopPropagation` protects.
8. **Leaflet init:** open `/punch`'s `Punch location` dialog and screenshot the tile area. The
   dynamic import moved inside the primitive.

**D. Visual coherence and copy (agent-probe) — from S13-S17**

9. Screenshot review per swept route family: does each page still read as one coherent screen
   after 39 headings changed and 29 action clusters moved? Pay particular attention to the ten
   pages that got a bare right-aligned action row (pattern 3) — that is the least designed of the
   four patterns.
10. Apply a filter on `/employees`, `/leave/balances` and `/attendance` until the list is empty,
    and judge whether the `no-results` copy reads correctly. Then clear it and confirm the
    genuinely-empty pages read as `empty`.

**E. Responsive — Known-Gap, CONDITIONAL**

11. 390px pass. Full recipe in
    `process/features/ui-ux-overhaul/backlog/phase-03-responsive-sweep_NOTE_03-09-26.md`.

### Follow-up stubs created across the phase

- `process/features/ui-ux-overhaul/backlog/phase-03-residual-dark-only-colours_NOTE_03-09-26.md`
  — written in S1-S5. AC-7's named residual; the re-count corrected the plan to **24 dark-only
  occurrences across 6 files**, not 31 across 11.
- `process/features/ui-ux-overhaul/backlog/phase-03-responsive-sweep_NOTE_03-09-26.md` — written
  in S17 (this session). The 390px residual.

## Closeout Packet

- **Selected plan:**
  `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-03-design-system_PLAN_03-09-26.md`
- **Finished:** S13-S17, five commits `73c4f8f`..`b2d22c5` on `feat/uiux-phase-3`. With S1-S12
  already on the branch, **all 17 sections are committed.** Not pushed.
- **Verified:** the four automated CI gates at every one of the five section boundaries; all four
  phase exit greps; e2e 141/141 at both the S15 and S17 boundaries.
> **Superseded 04-09-26.** Items A, B and C below were run live and are recorded in
> `phase-03-design-system-hybrid-gates_REPORT_04-09-26.md`. They found two defects (Tailwind's
> `darkMode` was never set; three `.badge-*` classes were purged), both fixed. Item D is partly
> covered there; item E stays a filed Known-Gap.

- **Unverified:** items A through E above — every colour, contrast, focus, coherence and viewport
  claim the phase makes.
- **Remaining:** the owner's manual pass, then phase 04.
- **Single best next state:** `Keep in active/testing`. The code is complete and every automated
  gate is green, but AC-5's, AC-7's, AC-8's and AC-10's proving gates are all hybrid or
  agent-probe and all unrun. Archiving now would record the phase as proven when the majority of
  its acceptance criteria have only their automated half satisfied.
- **Next plan path when the manual pass clears:**
  `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-04-feedback-contract_PLAN_03-09-26.md`

## Forward Preview

**Test Infra Found.** `pnpm test:e2e` builds and previews itself — it needs no owner-started
server, only `veent-db-5434`. It is still the only automated tier that can see rendered UI at
all, and it now covers the heading text of every `(app)` page through the 31 `getByRole('heading')`
assertions. A later phase that renames a page title will break those; that is a feature.

**Blast Radius Changes.** Three shared files are now load-bearing across the app and a change to
any of them is a whole-app UI change, not a local edit:

- `src/lib/components/ui/Banner.svelte` — 52 call sites. **Phase 07 consumes this directly** and
  adds scroll-into-view, per-form scoping and toasts on top of it. Its `TONE` record is the only
  place a feedback colour is defined; there is no `info` consumer yet, so that row is untested
  by usage.
- `src/lib/components/ui/PageHeader.svelte` — every `(app)` page. It still takes **no actions
  prop**, and phase 06/07 must not add one: 29 pages now depend on the action living beside the
  thing it changes, and an actions prop would silently pull them all back onto the title row.
- `src/lib/components/ui/EmptyState.svelte` — 28 files, with the `variant` choice now encoding a
  real per-page judgement about whether a filter is active. A later filter feature on any list
  page must set that page's `filtered` flag or the copy goes stale.

`.page-header` and `.page-title` are gone from `src/app.css`. Any later work that assumed they
exist will silently render unstyled.

**Commands to Stay Green.**
`pnpm format:check && pnpm lint && pnpm check && pnpm test`, plus `pnpm test:e2e`. Run
`npx prettier --write 'src/**/*.svelte'` before `format:check` — CI runs format first and skips
everything else on failure. Baseline for the next phase: **1101 files / 0 errors**,
**199 files / 2273 tests**, **e2e 141/141**.

**Dependency Changes.** None. No package added or removed across all 17 sections.
