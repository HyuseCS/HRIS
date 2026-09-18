---
name: note:owner-click-pass-18-09-26-work-order
description: "Index and running order for the six notes from the owner's 18-09-26 click pass on phase 07. Owner's sequencing: build the note changes first, extend the e2e suite last."
date: 18-09-26
feature: ui-ux-overhaul
---

# Owner click pass 18-09-26 — work order

Date: 2026-09-18
Source: owner, live click pass over the phase 07 surfaces on `feat/uiux-phase-7`
Status: index only. Every item below is filed, none is built.

## The owner's sequencing decision

> "we'll do this last after we finish implementing the changes from those notes"

So: **build the note changes first, extend the e2e suite last.** The e2e work is O1 below. It is
not dropped and it is not optional — it moves to the end of the queue.

## The notes

| # | Surface | Note | Blocked on the owner? |
|---|---|---|---|
| N1 | `/attendance?view=team` | `attendance-team-day-controls-row_NOTE_18-09-26.md` | yes — pick the toggle label |
| N2 | `/settings` | `settings-hub-duplicate-list-and-search_NOTE_18-09-26.md` | yes — R1 or R2, which list goes |
| N3 | `/employees/new` | `employees-new-two-column-full-width_NOTE_18-09-26.md` | yes — four layout questions |
| N4 | `/separations` | `separations-action-on-title-row_NOTE_18-09-26.md` | no |
| N5 | `/inventory` | `inventory-row-editing-to-modal_NOTE_18-09-26.md` | partly — where Delete lives |
| N6 | `/settings/org` | `settings-org-employee-assignments-pagination_NOTE_18-09-26.md` | yes — A1 or A2 |
| N7 | all 33 `PageHeader` descriptions | `page-header-bar-and-help-tooltip_NOTE_04-09-26.md` | yes — 28 pages or 33 |

Passed with no changes: **`/complaints`**, **`/employees/[id]`** (after the tab fix below).

## The one cross-cutting item

Three of the six notes ask for the same thing: move a page description behind a `?` hover
tooltip. `/settings`, `/separations`, `/inventory`, all on the same day.

The program-wide note is `page-header-bar-and-help-tooltip_NOTE_04-09-26.md`. It already holds
the measurements (34 pages carry a description, 10 over 120 characters, longest 290) and the
owner's ruling in favour of the `?`. `src/lib/components/ui/HelpTip.svelte` already renders the
control.

**SETTLED 18-09-26 — the `?` carries all of it.** No short description stays visible. The owner
also widened the ask: scan every `PageHeader` for a subtext and put it in the `?`, with no length
threshold, so all of them move rather than only the long ones.

The full measured inventory lives at the bottom of
`page-header-bar-and-help-tooltip_NOTE_04-09-26.md`: 59 files render `PageHeader`, **33** pass a
`description`, 9 of those run over 120 characters.

That note now carries the one remaining question, and it is small: **5 of the 33 are record
identity, not help text** — `complaints/[id]`, `separations/[id]`, `performance/reviews/[id]`,
`punch` and `recruitment/[id]/apply` build their subtitle from the record (who the complaint is
about, which employee is separating). Hiding those behind a `?` hides who the page is about.
Recommendation there: the `?` takes the 28 authored ones, the 5 generated ones stay visible.
Answering it decides whether the sweep is 28 pages or 33.

This becomes its own work item, **N7**, rather than three separate copy edits inside N2, N4 and
N5. Those three notes keep their layout items and drop their tooltip item.

## O1 — extend the e2e suite (LAST)

Phase 07 shipped five new surfaces and **no e2e touched any of them**. That is exactly how the
tab bug below reached a green PR. Cover, in this order:

| | Surface | What no machine currently checks |
|---|---|---|
| A1 | attendance HR grid | team vs employee view, both bulk bars, CSV import, per-row correct, reset day, reset all, sticky Save column |
| A2 | settings IA | hub, sub-nav and sidebar agree per role — 17 / 14 / 12 rows for SUPER_ADMIN / HR_ADMIN / MANAGER |
| A3 | `employees/new` | "Required to hire" alone submits; "Complete later" expands |
| A4 | pagination | `/separations`, `/inventory`, `/complaints` page 2 and back |
| A5 | `settings/org` | search and only-unassigned filters |

Run this **after** N1-N6 land, so the specs are written against the final markup rather than
rewritten twice. Several of these notes move controls the specs would otherwise locate — N5 in
particular breaks every `tr[data-name=...]` locator in `tests/e2e/inventory.spec.ts`.

## O2 — same bug class elsewhere: CLOSED

The employee tab strip was broken because `pushState` never assigns `page.url` — it only sets
`page.state`. Fixed in `e80e850`, guarded by `tests/e2e/employee-tabs.spec.ts` (reverting the fix
turns 2 of its 3 tests red).

Swept `src/` for the same pattern. Result:

- `EmployeeTabs.svelte` is the **only** `pushState` call in `src/`.
- `Tabs.svelte` uses `goto(url, { replaceState: true, noScroll: true, keepFocus: true })`.
  `goto` does update `page.url`, so it is not affected.

**No second instance of this bug exists.** Nothing to do.
