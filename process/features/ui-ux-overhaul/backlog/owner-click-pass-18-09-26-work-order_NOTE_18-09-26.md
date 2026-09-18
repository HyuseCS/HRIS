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

## OWNER DECISIONS 18-09-26 — grilling session

Every question in the table above is now answered. Recorded here so the notes stop reading as open.

| | Item | Decision |
|---|---|---|
| D1 | N7 method | `PageHeader` wraps `description` in a `HelpTip` itself. One file. All 33 call sites keep the prop they pass today and are not edited. The visible `<p>` goes. |
| D2 | N7 scope | All 33, no exceptions, no opt-out prop. The 28-vs-33 question is closed at 33. |
| D3 | N6 | `search` and `onlyUnassigned` move into the query string; the load filters the fetched array then `paginate()` + slice, with its own page param. Positions stays out — `data.positions` feeds the per-row assign select and cannot be paged. |
| D4 | N2 | Not a deletion. Redesign the settings nav bar. Constraint: `/settings` must stop reading as the same list twice; method is the designer's. |
| D5 | N2 search | Top-right of the Settings title line for now. Final placement decided once the redesigned bar exists. |
| D6 | N1 | The three-way toggle becomes a two-state switch, `Whole team` / `By employee`. An icon beside it flips Matrix <-> Per day in one click — a link, not a menu, no new component. Matrix stays the landing view. |
| D6b | N1 | Unchanged from the original note: on the Per day view the controls collapse to one row, Day picker right, bulk actions up into the row it vacates. |
| D7 | N3 | Design round. Boxes side by side is the starting direction, not the ceiling. |
| D8 | N5 | Delete lives inside the modal. The row is purely clickable. Two sibling forms in one Dialog are valid — the nested-form objection was wrong. |
| D9 | N5 | Design round, and it must also propose a grid view as an alternative. `/team` already ships a grid/list pair to copy from. |
| D10 | Order | Build N1/N4/N6/N7 now; design N2/N3/N5 in parallel; O1 last, unchanged. |

### Corrections to earlier claims in these notes

- **"5 of the 33 descriptions are record identity."** Only one is. Source check: `separations/[id]:97` titles `"{lastName}, {firstName}"`, `performance/reviews/[id]:96` titles the employee name, `recruitment/[id]/apply:19` titles `"Add applicant to {posting}"` and its description is a department name only, and `punch:201` passes `undefined` unless the user is linked. Only `complaints/[id]:42` titles the complaint subject while its description carries the employee — it is the single page where D2 removes something from view.
- **N4 is now layout only.** Its tooltip half is delivered by N7.
- **A vacuous test guards nothing here.** `tests/e2e/employee-view-only.spec.ts:170` asserts a link named `Whole team (day)` has count 0. That string exists nowhere in `src/`, so the assertion cannot fail. N1 rewrites those labels, so the correction and a negative control are folded into N1.

### Where the work lives

- Build lane SPEC and PLAN: `process/features/ui-ux-overhaul/active/owner-click-pass-build-lane_18-09-26/`
- Design round: `process/features/ui-ux-overhaul/active/owner-click-pass-design-round_18-09-26/`

## DESIGN ROUND OUTCOME 18-09-26

Reports: `process/features/ui-ux-overhaul/active/owner-click-pass-design-round_18-09-26/`

| | Item | Owner pick |
|---|---|---|
| D11 | N2 `/settings` | **Direction A, Context Rail.** The bar lists the 5 groups, not 17 destinations; a sub-page adds a second row of its own siblings only. On `/settings` there are no siblings, so that row never renders and the duplicate list resolves by construction. Hub cards stay. No new component. |
| D12 | N3 `/employees/new` | **Direction C, Companion Rail.** `mx-auto max-w-3xl` goes; a 256px sticky aside holds an error count, jump-to-first-error, section links and the single Create button. The form column ends up wider than today's 768px cap at every size. |
| D13 | N5 `/inventory` | **Both views**, list and card grid, with the `/team`-style toggle, defaulting to List. One shared edit modal. |
| D14 | N2 | Owner ACCEPTS that a cross-group jump from a sub-page becomes two clicks. The 17-link view stays on `/settings`, one click away. |
| D15 | N5 | The separate "Add an item" `<details>` form folds into the same modal. One modal for create and edit. Removes ~96 lines and the drift that already lost `notes` from one of the two forms. |

### Measured facts the design round corrected

- **Real content width is `viewport − 304` from `lg` up**, not the full viewport: the sidebar (`+layout.svelte:650`, `lg:pl-60`) arrives at the same breakpoint. At 1024 that is 720px, so a two-column gives 348px per column, not the ~512 assumed in the brief. A column only clears the 640px `sm` threshold at viewport ≈1608. Content also gets NARROWER going 768 -> 1024.
- **`/inventory` already overflows on a normal laptop.** The table needs ~1438px; available is 942px at 1280. That is also Playwright's default width, which is part of why no test caught it.
- **The settings bar has no visible focus style.** `settings/+layout.svelte:47-49` changes colour only.
- **`employees/new:101-102` uses a `float-left` legend** because `<legend>` and a grid sibling do not compose, and a grid container does not wrap a float.

### Build hazards found, to be guarded not just avoided

- `update()` defaults to `reset: true`. On a rejected save that blanks every field in the edit modal, and the existing e2e would still pass — for the wrong reason. Recorded before in [[sveltekit-update-resets-the-form]].
- After a delete, `Dialog`'s focus restore targets a removed node and focus falls to `<body>`.
- `tests/e2e/admin.spec.ts:49` is strict mode. If the Companion Rail adds a Create button and the old one stays, four onboarding tests fail. Exactly one may exist.
- `tests/e2e/settings-visibility.spec.ts:57-58` is an unscoped count-zero assertion that guards the very duplication being removed. It must survive. The comment at 32-34 goes stale under Context Rail.
