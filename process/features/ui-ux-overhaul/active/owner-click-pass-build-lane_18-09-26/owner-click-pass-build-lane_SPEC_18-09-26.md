---
name: spec:owner-click-pass-build-lane
description: "Requirements for the four settled items from the owner's 18-09-26 click pass — N1 attendance view switch, N4 separations title-row action, N6 settings/org assignments pagination, N7 PageHeader description behind a ? tooltip."
date: 18-09-26
feature: ui-ux-overhaul
---

# Owner click-pass build lane — SPEC

Task folder: `process/features/ui-ux-overhaul/active/owner-click-pass-build-lane_18-09-26/`
Branch: `feat/uiux-phase-7`
Scope: **N1, N4, N6, N7 only.** N2, N3 and N5 are in a parallel design round and are not in this doc.

---

## Summary

Four things the owner asked for after clicking through the app on 18-09-26.

1. **N1 — Attendance views are confusing.** Three buttons today: `Whole team`, `Team day`, `By employee`. The middle label reads wrong and "Team" in two of three labels carries no signal. It becomes **two** buttons — `Whole team` and `By employee` — and, when you are on Whole team, one small icon button beside them flips between the week grid and the single-day view in one click. On the single-day view the controls box also drops from two rows to one.
2. **N4 — Separations wastes a row.** The `New Separation` button sits alone on its own row under the header. It moves up beside the page title, which is what our own title-row rule already says to do.
3. **N6 — Settings › Organization lists every employee at once.** The Employee Assignments table has no paging, so a big company gets one very long page. It gets paging, and its search and "only unassigned" filters move into the web address so paging and filtering agree with each other.
4. **N7 — Page descriptions move behind a `?`.** Every page today prints a grey sentence under its title. All 33 of them move into a `?` hover/focus tooltip beside the title. Nothing is rewritten — one shared component changes and all 33 pages keep their text exactly as it is.

Nothing here changes what the app *does*. No data changes, no permissions change, no money changes. These are layout, wording and reachability changes.

---

## The owner's own words

**N1** (`attendance-team-day-controls-row_NOTE_18-09-26.md`):

> "Team day in the filter is weird. Another name could better suite it."

and, on the controls box:

> Owner's ask: move the date to the **right** side, and pull the action buttons **up** into the space the date vacates. Two rows become one.

**N4** (`separations-action-on-title-row_NOTE_18-09-26.md`):

> Owner wants `New Separation` moved up to the top right of the header line.

**N6** (`settings-org-employee-assignments-pagination_NOTE_18-09-26.md`):

> `+page.server.ts` line 19-26 loads `listAssignableEmployees(user.organizationId)` with no `skip`/`take`, and the page renders all of it.

**N7** (`page-header-bar-and-help-tooltip_NOTE_04-09-26.md`, owner decision 18-09-26):

> "the ? carries all of it. Also since we are doing a lot of tooltips. Scan page header for subtexts and if there are any then put them in ?"

**Work order** (`owner-click-pass-18-09-26-work-order_NOTE_18-09-26.md`):

> "we'll do this last after we finish implementing the changes from those notes"

— so the e2e suite expansion (O1) stays at the end of the queue and is out of this doc.

---

## Settled decisions carried into these requirements

These are the owner's, already made. They are inputs, not choices to revisit.

| ID | Decision |
|---|---|
| D1 | N7 is done inside `PageHeader` itself. One file changes. All 33 call sites keep passing `description` unedited. `PageHeader` builds the tooltip's required label itself (e.g. `About {title}`). The visible grey `<p>` goes away. |
| D2 | N7 covers **all 33**, no exceptions, no opt-out prop. The owner accepted that `/complaints/[id]` loses its visible "For {employee}" line — its title is the complaint subject. |
| D3 | N6 moves `search` and `onlyUnassigned` into the web address. The load reads the address and the viewport cookie, filters the already-fetched array, then pages it. Employee Assignments gets its **own** page parameter, distinct from any other paging on that page. Positions is explicitly out of scope. |
| D6 | N1's switch becomes two states: `Whole team` \| `By employee`. On Whole team, an icon button beside the switch flips Matrix ↔ Per day in one click. It is a plain link — not a menu, not a popover, no new component. Its icon and its accessible name say where it takes you. Landing on Whole team shows Matrix first. The `?view=` values keep their current meanings. |
| D6b | In the Per day view the controls box collapses to ONE row: the Day picker moves to the right, the bulk action buttons move up into the row it vacated. |
| A1 | `tests/e2e/employee-view-only.spec.ts:170` is corrected to assert labels that actually exist. It is today a **vacuous assertion** — it checks for `'Whole team (day)'`, a string that exists nowhere in `src/`, so it cannot fail. |
| A2 | N4 is now only "move the button onto the title row". Its tooltip half is delivered by N7. |

---

## Item N1 — Attendance view switch and the Per day controls row

Surface: `src/lib/components/attendance/AttendanceHrGrid.svelte`

### User stories

- As an HR user, I want the view switch to name the real difference between views, so that I do not have to click each one to find out what it shows.
- As an HR user, I want to move between the week grid and the single-day list in one click, so that switching time scale is not a separate mental step.
- As an HR user on the single-day view, I want the filter and the bulk actions on one row, so that the table starts higher on the screen.
- As a keyboard user, I want every control in the switch reachable by Tab with a visible focus ring, so that I can use the page without a mouse.

### What the user wants (behaviour)

The switch shows exactly two choices: `Whole team` and `By employee`. Beside the switch, and only while `Whole team` is the active choice, sits one small icon button. Pressing it takes you to the other Whole-team layout: from the week grid to the single-day list, or back. Its accessible name states the destination. Arriving at Whole team from `By employee` lands on the week grid.

On the single-day layout, the controls box shows one row: the bulk action buttons on the left, the Day picker on the right. The horizontal divider that separated the two rows is gone with them.

The week-grid layout, the `By employee` layout, and every action's behaviour are unchanged.

### Flow / state diagram

```
                       +--------------------------------------+
                       |     [ Whole team ] [ By employee ]   |   two-state switch
                       +--------------------------------------+
                                  |                    |
            active: Whole team    |                    |  active: By employee
                                  v                    v
        +--------------------------------------+   +-----------------------------+
        |  switch  +  [icon] flip layout       |   |  switch (no icon button)    |
        +--------------------------------------+   +-----------------------------+
                  |                  ^                        |
     ?view=matrix |                  | ?view=matrix           | ?view=employee
   (landing state)v                  |                        v
   +------------------------+  icon  |            +--------------------------------+
   | WEEK GRID              |------->+            | Employee + From + To + quick   |
   | week x all employees   |        |            | picks + range-cap line         |
   +------------------------+        |            | (two rows, UNCHANGED)          |
                  |                  |            +--------------------------------+
             icon | ?view=team&date= |
                  v                  |
   +--------------------------------------+
   | PER DAY  — one day x all employees   |
   | controls box, ONE row:               |
   |  [bulk actions ............] [Day v] |
   +--------------------------------------+
```

### Acceptance criteria

**N1-AC1** — The view switch renders exactly two links, with accessible names `Whole team` and `By employee`. No link named `Team day` exists anywhere on the page.
*proven by:* e2e `attendance-view-switch.spec.ts` › "switch shows two states"; `strategy:` Fully-Automated

**N1-AC2** — While the week grid is showing, exactly one additional control sits beside the switch, it is a link, and its accessible name names the single-day destination. Activating it loads the single-day layout.
*proven by:* e2e `attendance-view-switch.spec.ts` › "flip to per day in one click"; `strategy:` Fully-Automated

**N1-AC3** — While the single-day layout is showing, that same control's accessible name names the week-grid destination, and activating it returns to the week grid. Round trip is two clicks total and ends on the layout it started from.
*proven by:* e2e `attendance-view-switch.spec.ts` › "flip round trip"; `strategy:` Fully-Automated

**N1-AC4** — Choosing `By employee` and then choosing `Whole team` lands on the week grid, not on the single-day layout.
*proven by:* e2e `attendance-view-switch.spec.ts` › "Whole team lands on the grid"; `strategy:` Fully-Automated

**N1-AC5** — The address values are unchanged: week grid is `?view=matrix`, single day is `?view=team&date=…`, per-employee is `?view=employee&…`. A saved link to any of the three still opens the same layout it opened before this change.
*proven by:* e2e `attendance-view-switch.spec.ts` › "url contract unchanged"; `strategy:` Fully-Automated

**N1-AC6** — On the single-day layout, the Day picker and at least one bulk action button share one row: their rendered vertical mid-points are within 24 px of each other, and the Day picker's left edge is to the right of that button's right edge. No `border-t` divider sits between them.
*proven by:* e2e `attendance-view-switch.spec.ts` › "per day controls are one row" (bounding-box assertion); `strategy:` Fully-Automated

**N1-AC7** — The `By employee` controls form is unchanged: Employee, From, To, the quick-pick strip and the range-cap line all still render, on that view only.
*proven by:* e2e `attendance-view-switch.spec.ts` › "employee view controls untouched"; `strategy:` Fully-Automated

**N1-AC8 (a11y)** — Tabbing from the page title reaches, in DOM order, `Whole team`, `By employee`, then the flip control (when present); each shows a visible focus ring; the flip control has a non-empty accessible name and is not an icon with no name. Verified in both light and dark themes.
*proven by:* e2e `attendance-view-switch.spec.ts` › "keyboard order and names" + an accessible-name assertion on the flip control; `strategy:` Hybrid (automated names/order; owner confirms the focus ring is visible in both themes)

**N1-AC9** — `tests/e2e/employee-view-only.spec.ts:170` no longer asserts a string absent from `src/`. It asserts the post-change labels, and it fails when the guard it claims to prove is removed. See the Test Expectations section for the required negative control.
*proven by:* corrected `employee-view-only.spec.ts` + its named negative control; `strategy:` Fully-Automated

---

## Item N4 — `New Separation` on the title row

Surface: `src/routes/(app)/separations/+page.svelte`

### User stories

- As an HR user, I want the only action on Separations to sit beside the page title, so that a whole screen row is not spent on one button.
- As a keyboard user, I want that button to keep its name, its focus ring and its dialog behaviour after it moves.

### What the user wants (behaviour)

`New Separation` renders on the same visual line as the `Separations` title, on the right. The standalone row that held it is gone. Pressing it still opens the create dialog exactly as before.

### Flow / state diagram

```
BEFORE                                  AFTER
+-----------------------------------+   +-----------------------------------+
| Separations                       |   | Separations      [ New Separation]|
| Record resignations and ...       |   |                                   |
+-----------------------------------+   +-----------------------------------+
|                 [New Separation]  |   | (table starts here — one row up)  |
+-----------------------------------+   +-----------------------------------+
| table                             |
+-----------------------------------+
```
(The description line disappears here because of N7, not N4.)

### Acceptance criteria

**N4-AC1** — The `New Separation` button and the `Separations` heading share one visual row: their rendered vertical mid-points are within 24 px of each other, and the button's left edge is to the right of the heading's right edge.
*proven by:* e2e `separations.spec.ts` › "action sits on the title row" (bounding-box assertion); `strategy:` Fully-Automated

**N4-AC2** — No element matching the old standalone `flex justify-end` action row remains between the header and the table; the table's top edge moves up relative to the viewport compared with the previous markup.
*proven by:* e2e `separations.spec.ts` › "no standalone action row"; `strategy:` Fully-Automated

**N4-AC3** — Pressing `New Separation` still opens the create dialog and the existing create flow still completes. Every existing assertion in `tests/e2e/separations.spec.ts` passes.
*proven by:* full existing `separations.spec.ts` run; `strategy:` Fully-Automated

**N4-AC4** — `PageHeader` still exposes no `actions` prop. The button is laid out by the page beside `PageHeader`, and the `back` snippet is not repurposed for it.
*proven by:* unit/source assertion in the PLAN gate (`PageHeader.svelte` props unchanged except for the N7 change); `strategy:` Fully-Automated

**N4-AC5 (a11y)** — The button keeps the accessible name `New Separation`, remains reachable by Tab, shows a visible focus ring, and the page still renders exactly one `<h1>`.
*proven by:* e2e `separations.spec.ts` › "title row a11y" (role+name, single h1 count); `strategy:` Hybrid (automated name/role/h1; owner confirms focus ring in both themes)

---

## Item N6 — Paging the Employee Assignments table

Surfaces: `src/routes/(app)/settings/org/+page.server.ts`, `src/routes/(app)/settings/org/+page.svelte`

### User stories

- As an HR admin with hundreds of employees, I want the Employee Assignments table to show one page at a time, so that the screen is not thousands of rows long.
- As an HR admin, I want the search box and the "only unassigned" switch to agree with paging, so that page 2 never shows someone the filter should have excluded.
- As an HR admin, I want to share or bookmark a filtered page and get the same rows back.
- As an HR admin, I want to still assign any position to any employee from a row, including positions that are not on the current page of the catalog.

### What the user wants (behaviour)

The Employee Assignments table shows one page of employees. A paging control sits under it. Typing in the search box or ticking "only unassigned" narrows the list, resets to page 1, and is reflected in the web address, so the link can be copied and reopened. The "Showing N of M" counter tells the truth: N is what the filter matched, M is the whole assignable list.

The per-row position dropdown still lists **every** position. The Positions catalog table above is untouched.

### Flow / state diagram

```
 /settings/org?<empSearch>&<empUnassigned>&<empPage>
            |
            v
 load: read address + viewport cookie
            |
            v
 fetch all assignable employees      <-- still one unbounded service call (see Risks)
            |
            v
 filter by search + onlyUnassigned  --> filteredTotal (N)
            |
            v
 paginate(url, N, { param: <own page param>, pageSize })
            |
            v
 slice --> one page of rows
            |
            +--> table (one page)          "Showing N of M"
            +--> Pagination control  (renders nothing when N <= pageSize)

 change search / tick unassigned  --> new address, page resets to 1
 change page                      --> other filters survive (href copies searchParams)
```

### Acceptance criteria

**N6-AC1** — With more assignable employees than one page holds, the Employee Assignments table renders at most one page of rows, and a paging control is visible under it.
*proven by:* e2e `settings-org-assignments.spec.ts` › "table is bounded"; `strategy:` Fully-Automated

**N6-AC2** — Moving to page 2 shows a different, non-overlapping set of employees, and returning to page 1 shows the original set.
*proven by:* e2e `settings-org-assignments.spec.ts` › "page 2 and back"; `strategy:` Fully-Automated

**N6-AC3** — Search and "only unassigned" appear in the web address. Reloading that address, or opening it in a fresh tab, reproduces the same filtered rows and the same page.
*proven by:* e2e `settings-org-assignments.spec.ts` › "filters survive reload"; `strategy:` Fully-Automated

**N6-AC4** — Every row on every page satisfies the active filter. With "only unassigned" ticked, no row on any page shows an assigned position.
*proven by:* e2e `settings-org-assignments.spec.ts` › "filter applies across pages" (walks all pages); `strategy:` Fully-Automated

**N6-AC5** — Changing a filter returns the user to page 1; changing the page preserves the active filters in the address.
*proven by:* e2e `settings-org-assignments.spec.ts` › "filter resets page, paging keeps filter"; `strategy:` Fully-Automated

**N6-AC6** — The Employee Assignments page parameter is distinct from any other page parameter used on `/settings/org`, so a future Positions paging cannot collide with it.
*proven by:* unit test on the load — two distinct param names asserted; `strategy:` Fully-Automated

**N6-AC7** — The per-row position dropdown still offers every position in the catalog, including positions that would fall outside any page of the Positions table. Assigning a position from a row still succeeds and the row shows the new position after save.
*proven by:* e2e `settings-org-assignments.spec.ts` › "assign from a row still works"; `strategy:` Fully-Automated

**N6-AC8** — "Showing N of M employees" reports the filtered match count as N and the full assignable count as M, on every page. With no filter, N equals M.
*proven by:* e2e `settings-org-assignments.spec.ts` › "counter tells the truth"; `strategy:` Fully-Automated

**N6-AC9** — When the filtered total fits on one page, no paging control renders.
*proven by:* e2e `settings-org-assignments.spec.ts` › "no control when it fits"; `strategy:` Fully-Automated

**N6-AC10 (a11y)** — The search field keeps a programmatic label, the "only unassigned" control keeps its label and is operable by keyboard, the paging control's links have accessible names, and the result count change is announced or is at minimum reachable in reading order right after the filters. Focus is not lost to `<body>` after a filter or a page change.
*proven by:* e2e `settings-org-assignments.spec.ts` › "filters and paging a11y" (label + role + focus-after-navigation assertions); `strategy:` Hybrid (automated labels/roles/focus; owner confirms the announcement reads sensibly with a screen reader)

---

## Item N7 — Page descriptions move into a `?` tooltip

Surface: `src/lib/components/ui/PageHeader.svelte` (one file)

### User stories

- As any user, I want the page title row to be short, so that the page's real content starts higher on the screen.
- As a user who needs the explanation, I want a `?` beside the title that shows it, so that nothing is lost.
- As a keyboard or screen-reader user, I want that explanation reachable without a mouse, so that hiding it visually does not hide it from me.

### What the user wants (behaviour)

Every page that today prints a grey sentence under its title instead shows a small `?` next to the title. Hovering it, or moving keyboard focus to it, reveals the same sentence, word for word. The grey sentence no longer occupies a line of its own.

No page's text is rewritten. No page file is edited. All 33 pages get this at once.

### Flow / state diagram

```
BEFORE                             AFTER (idle)            AFTER (hover OR focus)
+---------------------------+      +----------------+      +-----------------------------+
| Settings                  |      | Settings  (?)  |      | Settings  (?)               |
| Master data and config... |      +----------------+      |          +-----------------+|
+---------------------------+      | content starts |      |          | Master data and ||
| content starts one line   |      | one line higher|      |          | configuration...||
| lower                     |      +----------------+      |          +-----------------+|
+---------------------------+                              +-----------------------------+

 keyboard:  Tab --> (?) has focus --> tooltip visible (group-focus-within)
 screen reader: button's aria-describedby points at the tooltip, visible or not
```

### Acceptance criteria

**N7-AC1** — On a page that passes a `description`, no standalone paragraph of that text renders under the title. The text is present in the document as the tooltip body.
*proven by:* unit test on `PageHeader` (renders with a `description`, asserts no visible `<p>` sibling, asserts tooltip body text); `strategy:` Fully-Automated

**N7-AC2** — That page renders exactly one `?` control beside its title, and it is a `<button>` with an accessible name derived from the title.
*proven by:* unit test on `PageHeader` › "one help control, named"; `strategy:` Fully-Automated

**N7-AC3** — A page that passes **no** `description` renders **no** `?` control from the description path.
*proven by:* unit test on `PageHeader` › "no description, no control"; `strategy:` Fully-Automated

**N7-AC4** — All 33 call sites compile and render unchanged — none of the 30 files is edited. The change is confined to `PageHeader.svelte`.
*proven by:* `bun run check` + a diff-scope gate in PLAN (only `PageHeader.svelte` in the N7 commit); `strategy:` Fully-Automated

**N7-AC5** — Hovering the `?` reveals the text; moving keyboard focus to the `?` also reveals it. Both paths are proven, not just hover.
*proven by:* e2e `page-header-helptip.spec.ts` › "hover reveals" and › "focus reveals"; `strategy:` Fully-Automated

**N7-AC6** — The tooltip stays anchored under the title row: its rendered box overlaps the title row horizontally and sits below it, and it does not spill outside the viewport at 1280 px, 768 px and 375 px widths.
*proven by:* e2e `page-header-helptip.spec.ts` › "anchoring and overflow at three widths" (bounding-box assertions); `strategy:` Fully-Automated

**N7-AC7** — On the four pages that already pass a `HelpTip` through the `badge` snippet (`settings/roles`, `leave/balances`, `attendance` grid, `dashboard`) exactly **one** `?` renders, not two.
*proven by:* e2e `page-header-helptip.spec.ts` › "no double question mark on the four badge pages"; `strategy:` Fully-Automated

**N7-AC8** — Tooltip text and the `?` control both meet the contrast floor against their actual composited backgrounds in **both** light and dark themes.
*proven by:* contrast measurement with composited alpha, both themes, recorded in the phase report; `strategy:` Agent-Probe (no automated contrast gate exists in this repo; the measurement is scripted and the numbers are recorded)

**N7-AC9 (a11y)** — The `?` is reachable by Tab, shows a visible focus ring, and its `aria-describedby` resolves to a real element id containing the description text — whether or not the tooltip is visually shown. Removing the focus-reveal rule makes the keyboard check go red (negative control required).
*proven by:* e2e `page-header-helptip.spec.ts` › "keyboard reach + aria-describedby resolves" + its named negative control; `strategy:` Fully-Automated

**N7-AC10** — On `/complaints/[id]` the record identity line is gone from view by design (D2) but is still present in the tooltip, and the page title remains the complaint subject so the page is still identifiable without hovering.
*proven by:* e2e `page-header-helptip.spec.ts` › "complaints detail keeps an identifying title"; `strategy:` Fully-Automated

---

## Out of scope

Named explicitly, so nothing here is picked up by accident.

| Item | Why it is out |
|---|---|
| **N2** — `/settings` hub duplicate list and search | In the parallel design round. Owner ruling D4: redesign the nav bar; the redesign must stop /settings reading as one list twice, method is the designer's. D5: search sits top-right of the title line for now, final placement decided after the bar is seen. |
| **N3** — `/employees/new` two-column / full-width | In the parallel design round. Owner ruling D7: goes to the design skills, with boxes-side-by-side as the starting direction, not the ceiling. |
| **N5** — `/inventory` row editing → modal | In the parallel design round. Owner ruling D8: Delete lives inside the modal, the row is purely clickable. D9: the designer must also propose a grid view as an alternative. N5 also breaks every `tr[data-name=…]` locator in `tests/e2e/inventory.spec.ts` — a reason to keep it apart from this lane. |
| **O1** — e2e suite expansion (A1–A5 in the work order) | Owner sequenced it last: "we'll do this last after we finish implementing the changes from those notes". Only the per-item tests named in this SPEC are in scope. |
| **Positions table pagination** | Per D3. `data.positions` feeds the per-row assign dropdown and cannot be paged without breaking assignment. |
| **The `services/**` query-level fix** | Real `skip`/`take` on `listAssignableEmployees` needs a service signature change. Already tracked in `query-level-pagination-unbounded-lists_NOTE_03-09-26.md`. Out of bounds for the overhaul. |
| **The PageHeader "bar" (own background + rule)** | Parts 3 and 4 of the 04-09-26 note. Blocked on issue #20's canonical-surface ruling. N7 is the tooltip half only. |
| **Renaming or removing the `description` prop** | D1 keeps the prop name so no call site is edited. |

### Sequencing dependency worth stating

N4's own note asked for two things; its tooltip half is now delivered by N7 (A2). So **N7 must land before N4 is judged visually complete** — otherwise `/separations` still shows its grey description line and the title row looks unchanged in height. The two can be built in either order; the owner's visual sign-off on N4 should happen after N7.

---

## Constraints

**Hard "never touch" list**
- Never edit `src/lib/rbac.ts`.
- Never edit `prisma/schema.prisma`.
- Never edit anything under `src/lib/server/services/**`.

**Code style**
- No explanatory comments in code. The why goes in the commit message.
- Existing comments are carried across verbatim. Never deleted, never reworded — including `PageHeader.svelte`'s title-row rule comment and `AttendanceHrGrid.svelte`'s E3 bulk-actions comment.

**Toolchain**
- bun 1.4. `bun run <script>` only — never bare `bun test` or `bun build` (bun shadows them with builtins).
- Svelte 5 runes only (`$state`, `$derived`, `$effect`, `$props`). SvelteKit 2.
- `{@const}` must be an immediate child of a block tag — never inside a plain HTML element. `settings/org/+page.svelte` already uses `{@const assign = assignGuard(emp.id)}` directly inside `{#each}`; paging must not move it inside an element.
- Tailwind v3 with the HSL design tokens in `src/app.css`. Both light and dark must work.

**Environment**
- The owner starts dev servers and the database. Do not run `./start.sh`, `vite`, or `docker`.
- Do not edit `.env` / `.env.dev`.

**Accessibility (not optional)**
- Keyboard reachability, correct aria, visible focus on every control touched.
- N7 in particular moves 33 descriptions from always-visible text to a hover/focus tooltip. The content MUST stay reachable by keyboard **and** by screen reader — `group-focus-within` alongside `group-hover`, and `aria-describedby` resolving to a real id, are both mandatory and both need a negative control.

**Structural facts that bind the design**
- `HelpTip`'s tooltip span is `absolute` with no `relative` on its own wrapper. It anchors to the `relative` div at `PageHeader.svelte:35`. Moving it out of that div breaks its anchoring.
- `PageHeader` takes no `actions` prop, deliberately. N4's button is laid out by the page beside the component.
- `Pagination.svelte` takes one prop, `meta`, and renders nothing when `meta.total <= meta.pageSize`. Its `href()` copies the current search params and sets only `meta.param`, so other filters survive paging.
- `paginate(url, total, { param, pageSize })` is server-side and needs the filtered total, not the raw total.

**CI gate order** (the job stops at the first failure):
`bun install --frozen-lockfile` → `bunx prisma generate` → `bun run format:check` → `bun run lint` → `bun run check` → `bun run test`; then the e2e job: `bunx prisma db push --skip-generate` → `bunx tsx prisma/seed-e2e.ts` → `bun run test:e2e`.

---

## Risks

| # | Risk | Why it matters | What the requirement does about it |
|---|---|---|---|
| R1 | **Double `?`.** Four pages already pass a `HelpTip` through the `badge` snippet and pass no `description`. If any page ever passes both, two `?` controls render side by side. | Confusing, and two tooltips can overlap. | N7-AC7 asserts exactly one `?` on those four pages. PLAN must decide what happens if a future page passes both — the SPEC requires the outcome be deterministic, not accidental. |
| R2 | **`/complaints/[id]` loses its visible identity line.** Its description is generated (category · employee · opened date). After D2 it is hidden until hover. | A user landing on a complaint detail cannot see who it is about without hovering. | Accepted by the owner (D2). N7-AC10 requires the title to remain the complaint subject, so the page is still identifiable. The same shape applies to `separations/[id]`, `performance/reviews/[id]`, `punch` and `recruitment/[id]/apply` — all accepted. |
| R3 | **N6 bounds the table, not the query.** `listAssignableEmployees(organizationId)` still fetches every row; the load filters and slices in memory. | The screen gets shorter, the database work does not get smaller. A very large tenant still pays the full query and the full payload. | Stated openly. The query-level fix is out of scope and already tracked in `query-level-pagination-unbounded-lists_NOTE_03-09-26.md`. N6 must not be reported as a performance fix. |
| R4 | **`HelpTip` depends on a `relative` ancestor it does not own.** It anchors to `PageHeader.svelte:35`. | Any refactor of the title row that drops `relative`, or that renders the `?` outside that div, silently mis-positions every tooltip in the app — with no compile error and no failing unit test. | N7-AC6 asserts anchoring by bounding box at three widths, so a broken anchor fails a gate rather than shipping. |
| R5 | **N1 changes link labels the e2e suite locates by name.** `employee-view-only.spec.ts` and any future attendance spec find controls by accessible name. | Renaming `Team day` and collapsing the switch can silently turn an assertion vacuous — exactly how line 170 got into its current state. | A1 / N1-AC9 require the corrected assertion plus a real negative control. |
| R6 | **N4 moves a button the separations spec locates.** | The existing spec may pass for the wrong reason, or break. | N4-AC3 requires the whole existing `separations.spec.ts` to pass, and N4-AC1 adds a position assertion that the old markup would fail. |
| R7 | **N6 moves client-side state into the address**, so filtering stops being instant typing and becomes a round trip. | A noticeable feel change the owner has accepted (D3), but it is a real behaviour change, not just layout. | Called out here for the owner's sign-off. N6-AC3 and N6-AC5 lock the new behaviour. |
| R8 | **Bounding-box assertions can pass for the wrong reason** — two elements can report "one row" while overlapping. | This repo has already been burned: size measurements cannot see overlap. | N1-AC6 and N4-AC1 assert both vertical alignment **and** horizontal separation (left edge right of the other's right edge), which overlap cannot satisfy. |

---

## Test expectations

What a new or corrected test must assert, per item. Scenario names below are the `proven by:` targets used in the acceptance criteria.

### N1 — `tests/e2e/attendance-view-switch.spec.ts` (new)

- "switch shows two states" — exactly two links, named `Whole team` and `By employee`; `getByRole('link', { name: 'Team day' })` has count 0.
- "flip to per day in one click" — on `?view=matrix`, one extra control exists, is a link, has a non-empty accessible name naming the per-day destination; clicking it lands on `?view=team`.
- "flip round trip" — per day → click → `?view=matrix`; two clicks total returns to start.
- "Whole team lands on the grid" — from `?view=employee`, clicking `Whole team` lands on `?view=matrix`.
- "url contract unchanged" — direct navigation to each of the three `?view=` values renders the layout it rendered before.
- "per day controls are one row" — bounding boxes: Day picker and a bulk action button, vertical mid-points within 24 px, Day picker `x` greater than the button's `x + width`. Assert the `border-t` divider between the two old rows is gone.
- "employee view controls untouched" — Employee, From, To, quick picks, range-cap line all present on `?view=employee`.
- "keyboard order and names" — Tab order, visible focus, accessible name on the flip control.

### N1 / A1 — `tests/e2e/employee-view-only.spec.ts:170` (corrected)

Today: `await expect(page.getByRole('link', { name: 'Whole team (day)' })).toHaveCount(0)`.
That string exists **nowhere in `src/`**, so the assertion cannot fail — it is vacuous green. Line 171 (`'By employee'`) is a real match.

Required:
- Replace it with assertions against the labels that exist after D6: a link named exactly `Whole team` has count 0, and the flip control's accessible name has count 0, for an employee-role user.
- **Negative control (mandatory).** Temporarily render the `Whole team` link (and the flip control) for an employee-role user, re-run the spec, and record that the corrected assertions go **red**. Revert. A test that stays green through this mutation has not been fixed — it has been rewritten into a new vacuous assertion.

### N4 — `tests/e2e/separations.spec.ts` (extended)

- "action sits on the title row" — bounding boxes, both vertical alignment and horizontal separation (see R8).
- "no standalone action row" — the old `flex justify-end` wrapper between header and table is absent.
- "title row a11y" — button role + name `New Separation`; exactly one `<h1>` on the page.
- The full existing spec must pass unchanged — it currently locates the button, and nothing else about the flow may shift.

### N6 — `tests/e2e/settings-org-assignments.spec.ts` (new — nothing targets `/settings/org` today, neither e2e nor unit)

- "table is bounded" — row count on page 1 is at most the page size, with a seeded set larger than one page.
- "page 2 and back" — non-overlapping employee sets; returning to page 1 restores the original set.
- "filters survive reload" — filter state present in the address; reload reproduces rows and page.
- "filter applies across pages" — walk every page with "only unassigned" ticked; assert no assigned row anywhere. This is the assertion that would catch the A3 trap (filtering only within the current page).
- "filter resets page, paging keeps filter" — set page 2, change filter, assert page 1; then page forward and assert the filter is still in the address.
- "counter tells the truth" — N equals the filtered match count, M equals the full assignable count; unfiltered N equals M.
- "no control when it fits" — with a filter that matches fewer rows than one page, no paging control renders.
- "assign from a row still works" — the row dropdown lists every position; saving changes the row's position.
- "filters and paging a11y" — labels resolve, keyboard operable, focus not dropped to `<body>` after filter or page change.
- Unit: the load returns two distinct pagination param names, and the Employee Assignments param is not `page`.

### N7 — unit on `PageHeader` + `tests/e2e/page-header-helptip.spec.ts` (new)

Unit (`PageHeader.svelte`):
- renders with `description` → no visible standalone description paragraph; tooltip body carries the exact string.
- renders with `description` → exactly one `?` button, accessible name derived from `title`.
- renders without `description` → no `?` from the description path.

E2E:
- "hover reveals" and "focus reveals" — **both** paths asserted separately. Hover-only is the exact failure mode the 04-09-26 note warned about.
- "anchoring and overflow at three widths" — 1280 / 768 / 375 px; tooltip below the title row, horizontally overlapping it, not spilling outside the viewport.
- "no double question mark on the four badge pages" — `settings/roles`, `leave/balances`, `/attendance`, `/dashboard`: `?` control count is exactly 1.
- "keyboard reach + aria-describedby resolves" — Tab reaches the `?`; `aria-describedby` points at an element that exists and contains the description text.
  **Negative control (mandatory):** remove `group-focus-within` from `HelpTip`, re-run, record the keyboard check going red, revert.
- "complaints detail keeps an identifying title" — the `<h1>` is the complaint subject; the identity line is present in the tooltip body.

Contrast (N7-AC8) is an agent probe, not an automated gate: measure the `?` control and the tooltip text against their **composited** backgrounds in both themes and record the numbers. There is no automated contrast gate in this repo, and an uncomposited check returns a meaningless ratio.

**Blast-radius note:** no test anywhere asserts any `description` string. N7 has zero existing-test blast radius. No e2e covers the attendance controls card or either bulk bar. No e2e or unit test targets `/settings/org` at all. No spec locates the separations `New Separation` button.

---

## Open questions

**None.** Every question these notes carried has been answered:

- N1's toggle label — answered by D6 (two-state switch plus a flip control; `Team day` is gone entirely, so no replacement wording is needed).
- N6's A1/A2/A3 choice — answered by D3 (A1, with Positions out of scope).
- N7's 28-vs-33 question — answered by D2 (all 33, including the five generated identity lines).
- N7's implementation shape — answered by D1 (inside `PageHeader`, one file, prop name kept).
- N4's tooltip half — answered by A2 (delivered by N7).
- Sequencing of the e2e expansion — answered by the work order (O1 is last, out of this lane).

---

## Background / research findings

Established facts measured before this SPEC. Treated as given.

**PageHeader / HelpTip**
- `src/lib/components/ui/PageHeader.svelte:39-41` renders `description` as `<p class="max-w-2xl text-sm text-muted-foreground">`. Props: `title`, `description?`, `badge?`, `back?`. No `actions` prop, deliberate (comment at line 30).
- Its title-row rule (lines 25-32) allows a page with no `back` snippet to place ONE page-level action on the title row, laid out by the page beside its `PageHeader`. This is what makes N4 rule-compliant rather than an exception.
- `HelpTip.svelte` props are exactly `label: string` (required) and `children: Snippet`. It self-generates its id via `$props.id()`, sets `aria-describedby` and `role="tooltip"`, and reveals on `group-hover` **and** `group-focus-within`, so it is keyboard reachable today. Its tooltip span is `absolute` with no `relative` on its own wrapper — it anchors to `PageHeader.svelte:35`, which IS `relative`.
- Four pages already pass a `HelpTip` through the `badge` snippet and pass no `description`: `settings/roles:166-177`, `leave/balances:32-36`, `attendance/TeamMatrix:75-78`, `dashboard:253-255`. None collides today; a page passing both would render two `?`.
- 33 `description` values exist across 30 files. Full inventory at the bottom of `page-header-bar-and-help-tooltip_NOTE_04-09-26.md`. **No test anywhere asserts any description string.**

**Attendance**
- `AttendanceHrGrid.svelte`: header + toggle at 207-237; the three-way toggle is a segmented pill of three `<a>` at 211-237 labelled `Whole team` (`?view=matrix`), `Team day` (`?view=team&date=`), `By employee` (`?view=employee&…`). Controls card at 240. The team-view GET form with the single Day DatePicker is 243-260. Bulk actions at ~320-322 behind `border-t pt-4`.
- What each view does: matrix = week grid × all employees; team = ONE day × all employees; employee = date range × ONE employee.
- The employee view's form carries Employee + From + To + quick picks + the range-cap line, so it genuinely fills its row — D6b applies to the per-day view only.

**Separations**
- `src/routes/(app)/separations/+page.svelte:22-35`: `PageHeader` at 23-26 with **no** `back` snippet, then `<div class="flex justify-end">` at 28 holding only the `New Separation` button. Exactly the shape the title-row rule covers.
- Measured across every `PageHeader` route: this `PageHeader`-then-`justify-end` shape occurs once. `payroll/+page.svelte` has a `justify-end` row near its header but may hold more than one control — not in scope here.

**settings/org**
- `+page.server.ts:15` destructures only `{ locals }` — not `url`, not `cookies`. `listAssignableEmployees(organizationId)` at `src/lib/server/services/settings/org.ts:394` takes ONE argument, is an unbounded `findMany`, and lives in the banned `services/**` tree.
- `+page.svelte`: `search` / `onlyUnassigned` `$state` at 36-46; `filteredEmployees = $derived.by`; Employee Assignments section at 269; filter row 273-291 using a **raw** `<input type="search">`, not `SearchInput`; "Showing N of M" counter at 288-290; `{#each filteredEmployees}` at 304; per-row assign form 311-334 whose `<select>` at 318-327 needs EVERY position. `data.positions` is rendered twice — the catalog at 145 and that row select at 324.

**Pagination machinery**
- `src/lib/server/pagination.ts`: `paginate(url, total, { param = 'page', pageSize = 10 })` returns `{page, pageSize, total, totalPages, skip, take, start, end, param, label}`. `fitPageSize(cookies, { rowPx, chromePx, fallback = 10, min = 5, max = 50, cols })`.
- Two-tables-one-page param precedent: `timesheets/+page.server.ts:62,79` (`myPage` / `teamPage`).
- Fetch-then-slice precedent (required here, since the service cannot take `skip`/`take`): `separations/+page.server.ts:29-30`, `inventory/+page.server.ts:37-41`, `complaints/+page.server.ts:51-55`.
- `src/lib/components/Pagination.svelte`: one prop, `meta`. Its `href()` copies current search params and sets only `meta.param`, so other filters survive paging. Renders nothing when `meta.total <= meta.pageSize`. Note the path — `components/`, not `components/ui/`.

**Test surface today**
- `tests/e2e/employee-view-only.spec.ts:170` asserts `getByRole('link', { name: 'Whole team (day)' }).toHaveCount(0)`. That label exists NOWHERE in `src/`. The assertion cannot fail. Line 171 (`'By employee'`) is a real match.
- No e2e covers the attendance controls card or either bulk bar.
- No e2e or unit test targets `/settings/org` at all.
- No spec locates the separations `New Separation` button.
