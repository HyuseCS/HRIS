---
name: note:phase-03-responsive-sweep
description: "Backlog stub — responsive verification at 390px across the phase-03 design-system sweep was never run; the gate stays CONDITIONAL"
date: 03-09-26
feature: ui-ux-overhaul
phase: "03"
---

# Phase 03 residual — responsive verification at 390px

**TL;DR.** Phase 03 changed the layout of roughly 90 files. Nothing checked how any of them
look on a phone. This is a named Known-Gap, written during EXECUTE per the plan's
`Verification Evidence` table. It proves nothing and it is not a strategy — it records what
is unverified so nobody reads phase 03's green gates as covering it.

## What is not verified

Responsive behaviour at 390px viewport width across every file phase 03 touched:

- **S13** — `Banner.svelte` and its ~52 call sites. The banner is a single full-width block,
  so the risk is low, but the amber "Partially restored" banner on `separations/[id]` wraps
  a multi-paragraph body and was never measured narrow.
- **S14/S15** — all 39 `PageHeader` conversions. This is the real exposure. `PageHeader`
  gives the Back cluster `basis-full` below `sm`, so it takes a row of its own — that path
  now runs on 39 pages instead of 20, and on eight of them the cluster carries a status
  Badge or a count pill as well as the Back button.
- **S14/S15 action relocations, pattern 1 — `ml-auto` onto an existing toolbar. Three pages:
  `employees`, `team`, `attendance`.** 29 pages in total moved an action cluster off the title
  row, but only these three landed at the right-hand end of an existing filter/view-toggle
  toolbar. Below `sm` those toolbars wrap, and `ml-auto` on a wrapped flex line behaves
  differently from what the desktop layout implies. **The wrapped-`ml-auto` risk this note warns
  about applies only to these three** — look at them first. Unmeasured.
- **S14/S15 action relocations, pattern 3 — a new bare right-aligned row. Ten pages:**
  `timesheets`, `benefits`, `departments`, `requests`, `complaints`, `separations`,
  `recruitment`, `payroll`, `payroll/[id]`, `leave`. These sit above the thing they act on
  rather than on an existing toolbar, so there is no wrapping toolbar to fight. A separate and
  lower-risk shape than pattern 1. Unmeasured.
- **S16** — 24 `EmptyState` sites. Most sit inside a `<td colspan=…>` in a table that is
  itself inside `overflow-x-auto`, so the empty state can end up wider than the viewport and
  centre itself off-screen. Unmeasured.
- **S17** — the money columns. `whitespace-nowrap` plus `tabular-nums` on a right-aligned
  column makes it harder to shrink, which is exactly the condition that pushes a table past
  the viewport.

## Why it was not done

Out of budget for the phase. Driving 90 files through a 390px browser pass is a
multi-session job on its own, and the plan classified it as a Known-Gap up front
(`Verification Evidence`, last row) rather than pretending a grep covered it.

## What would close it

A Playwright MCP pass at 390×844 over at least these pages, screenshotting each and looking
at it — not asserting a class string:

1. `/employees` — the relocated **Add Employee** action on a wrapped search toolbar
2. `/attendance?view=team` — the relocated **Multi-day matrix** link on the view-toggle row
3. `/timesheets` — a table with `min-w-[44rem] table-fixed` and a right-aligned Total Hours
4. `/payroll/[id]` — the widest money table in the app, seven numeric columns
5. `/separations/[id]` — `PageHeader` nested inside a card, plus the multi-paragraph banner
6. `/leave/balances` — column count grows with the number of leave types
7. Any list page with zero rows, to see an `EmptyState` inside a scrolling table

Precondition: the owner starts `./start.sh` and the dev server. Do not launch them.

## Status

CONDITIONAL. This residual does not make phase 03 un-shippable and does not count as proof
of anything. Phase 03 is `CODE DONE`, not `VERIFIED`.
