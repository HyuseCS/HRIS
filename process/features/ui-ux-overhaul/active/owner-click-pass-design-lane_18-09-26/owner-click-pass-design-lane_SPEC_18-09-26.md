---
name: spec:owner-click-pass-design-lane
description: "Requirements for the three design-round items the owner chose on 18-09-26 — N2 settings Context Rail, N3 hire-form Companion Rail, N5 inventory list+grid with one shared edit modal."
date: 18-09-26
feature: ui-ux-overhaul
---

# Owner click-pass design lane — SPEC

Task folder: `process/features/ui-ux-overhaul/active/owner-click-pass-design-lane_18-09-26/`
Branch: `feat/uiux-phase-7`
Scope: **N2, N3, N5 only.** N1, N4, N6 and N7 are in the parallel build lane
(`process/features/ui-ux-overhaul/active/owner-click-pass-build-lane_18-09-26/`) and are not in this doc.

The design round is over. The owner picked one direction per item. This doc turns those picks into
requirements a person or a test can check. **It does not re-open any choice and does not propose
alternatives.**

---

## Summary

Three pages the owner clicked through on 18-09-26 and asked to be rebuilt.

1. **N2 — `/settings` shows the same list of settings twice.** A strip of links at the top repeats
   every card on the page below it. The strip stops listing 17 destinations and starts listing the
   5 **groups**. On a settings sub-page it adds a second short row with only that page's siblings.
   On `/settings` there are no siblings, so that second row never appears — which is how the
   double list goes away. The cards stay. A search box goes on the far right of the `Settings`
   title line and filters the cards only.
2. **N3 — the hire form sits in a narrow centred column.** The 768px cap goes and the form fills
   the width. On a very wide screen (1536px and up) a 256px column pins itself to the right of the
   form and holds a count of what is wrong, a link that jumps to the first bad field, links to each
   section, and the single `Create Employee` button. On anything narrower those same four things sit
   in a normal full-width block under the form, so the form keeps the whole width and never gets
   narrower than it is today. The second `Cancel` at the bottom of the page is deleted — the one in
   the header stays.
3. **N5 — `/inventory` scrolls sideways because every row is nine live editors.** The row becomes
   read-only and clickable. Clicking it opens one modal that does the editing, and Delete lives in
   that modal. The same modal also does "Add an item", so the separate add form goes away. The page
   ships two shapes — a list and a card grid — with the same toggle `/team` already uses, opening
   on List.

Nothing here changes data, permissions, money or any server action. These are layout,
interaction and reachability changes.

---

## The owner's own words

**N2** (`settings-hub-duplicate-list-and-search_NOTE_18-09-26.md`):

> "the things in 'All Settings' container is redundant when we already have the page itself."

and, on the search:

> a settings search, placed on the far right of the same line as the `Settings` title.

Ruling **D4**: *"Not a deletion. Redesign the settings nav bar. Constraint: `/settings` must stop
reading as the same list twice."*

**N3** (`employees-new-two-column-full-width_NOTE_18-09-26.md`):

> Drop the centering, run the page full width, and put the fieldsets in **two columns** instead of
> one stack.

Ruling **D7**: *"Boxes side by side is the starting direction, not the ceiling."*

**N5** (`inventory-row-editing-to-modal_NOTE_18-09-26.md`):

> make the entries a list, not an edit grid. Clicking an entry opens a modal, and the editing
> happens there.

Ruling **D8**: *"Delete lives inside the modal. The row is purely clickable."*

---

## Settled decisions — inputs, not choices

These are the owner's picks from the 18-09-26 design round. They are the input to this doc.

| ID | Decision |
|---|---|
| **D4 / D11** | **N2 = Direction A, Context Rail.** The bar lists the **5 groups**, not the 17 destinations. On a sub-page a second row shows **only that page's siblings**. On `/settings` there are no siblings, so that row does not render — the duplicate is resolved **by construction**, not by hiding anything. The hub card grid stays. |
| **D5** | **N2 search sits top-right on the `Settings` title row.** `/settings` passes no `back` snippet, so `PageHeader`'s own title-row rule permits one filter-like control there. It filters **destinations only** — not settings content, not the sidebar. The owner has reserved the right to move it after seeing it live; top-right is the requirement today. |
| **D14** | The owner **accepts** that a cross-group jump from a sub-page becomes two clicks instead of one. No criterion may demand one-click access to all 17 from every page. |
| **D7 / D12** | **N3 = Direction C, Companion Rail.** `mx-auto max-w-3xl` goes. A **256px sticky aside** on the right holds an error count, a jump-to-first-error control, section jump links, and the **single** `Create` button. |
| **D17** | **N3: the aside renders as a sticky right-hand rail only from `2xl` (1536px) up.** Below `2xl` the form takes the full content width and the rail's four contents become a normal full-width block under the form. Stock Tailwind `2xl`; **no custom breakpoint**. This makes the form wider than today's 768px cap at every width above 1024 and never narrower — which is the owner's original requirement, met without changing the chosen direction. The four contents must be **one** set of elements that CSS repositions, never two sets shown and hidden at a breakpoint. |
| **D13 / D9** | **N5 ships BOTH views** — list and card grid — with a `/team`-style toggle, **defaulting to List**. **One shared edit modal** serves both. |
| **D8** | **N5 Delete lives inside the modal.** The row carries no buttons of its own beyond the one that opens the modal. |
| **D15** | **N5 folds the separate "Add an item" `<details>` form into the same modal.** One modal serves create and edit. This removes the existing drift between the two forms — `notes` exists in one and not the other. |

---

## Item N2 — `/settings` Context Rail + destinations search

Surfaces: `src/routes/(app)/settings/+layout.svelte`, `src/routes/(app)/settings/+page.svelte`,
`src/lib/settings-destinations.ts` (one appended helper).

### User stories

- As an HR admin landing on `/settings`, I want to see the list of settings **once**, so that I am
  not reading the same 17 names twice in two type sizes.
- As an HR admin on a settings sub-page, I want to move between the pages **in the same group** in
  one click, so that lateral movement inside a topic stays cheap.
- As an HR admin, I want to narrow the settings list by typing, so that I can reach a named page
  without scanning five groups.
- As an HR admin, I want the bar to be the **same height on every settings page and for every
  role**, so that the page below it starts in the same place each time.
- As a keyboard user, I want every link in the bar to show where my focus is, so that I can use the
  bar without a mouse. (Today the bar has **no** visible focus style at all.)

### What the user wants (behavioural outcomes)

The strip at the top of every settings page lists `All settings` plus the **five groups**. It is one
line tall on every settings page and for every role, because it counts groups, not destinations.

Choosing a group from `/settings` narrows the cards below to that group. Choosing it from a
sub-page takes you to the hub, showing that group.

On a settings **sub-page** a second short row appears under the group row, listing only the other
pages **in the same group**, with the current page marked. On `/settings` that row is not rendered
at all, so the hub shows the full list exactly **once**.

On the `Settings` title line, on the far right, sits a search box. Typing filters the cards. It does
not change the group row, does not change the sidebar, and does not change any settings content. The
number of matches is announced.

Nothing scrolls sideways at any width; at 390px the group row scrolls **inside itself**.

### Flow / state diagram

```
 /settings                                  /settings/holidays  (a sub-page)
 ┌──────────────────────────────────────┐   ┌──────────────────────────────────────┐
 │ (All settings) │ (Org)(Time)(Pay)... │   │ (All settings) │ (Org)(Time)(Pay)... │  row 1: 5 GROUPS
 └──────────────────────────────────────┘   ├──────────────────────────────────────┤
   ▲ no second row — no siblings exist      │ Work Schedules [Holiday Cal.] Leave…│  row 2: SIBLINGS only
   │                                        └──────────────────────────────────────┘
   │
 ┌──────────────────────────────────────┐          the page's own content
 │ Settings            [⌕ search…]      │  ← one filter-like control, title row right
 ├──────────────────────────────────────┤
 │ ORGANIZATION                         │
 │ [card][card][card]                   │  ← the ONLY list of destinations on this page
 │ TIME & ATTENDANCE                    │
 │ [card][card][card]   …               │
 └──────────────────────────────────────┘

 chip click  → /settings?g=<group>   → cards narrowed to that group   (navigation, URL changes)
 typing      → cards narrowed by text                                  (view filter, URL unchanged)
 both at once → may match nothing → empty state names the typed text
 sub-page → other group = 2 clicks (group chip, then card)  ← ACCEPTED by the owner (D14)
```

### Acceptance criteria

**N2-AC1 — The bar lists groups, not destinations.**
On `/settings` and on every settings sub-page, the navigation landmark named `Settings sections`
contains `All settings` plus exactly one link per group visible to the signed-in role, and **no
link whose accessible name is a destination label** in the group row.
*proven by:* e2e `settings-context-rail.spec.ts` › "bar lists groups only"; `strategy:` Fully-Automated

**N2-AC2 — `/settings` renders each destination exactly once, countably.**
On `/settings`, for every destination visible to the role, the count of links carrying that
accessible name **inside the settings navigation landmark** is **0**, and the count inside the
`Settings destinations` region is exactly **1**. For a role that must not see a destination
(`Payroll Config`, `Roles & Access` for HR Admin and Manager) the **unscoped** page-wide count stays
**0**. The existing unscoped count-zero assertions at
`tests/e2e/settings-visibility.spec.ts:57-58` must survive unchanged and still pass.
*proven by:* e2e `settings-context-rail.spec.ts` › "no destination is listed twice on the hub" + the unchanged `settings-visibility.spec.ts` run; `strategy:` Fully-Automated

**N2-AC3 — Sibling row appears only on sub-pages, and holds only siblings.**
On `/settings` no second row renders inside the settings navigation. On a sub-page a second row
renders, every link in it belongs to the current page's group, the current page is marked as the
current one, and **no link to another group's destination appears in it**. Reaching a destination in
a different group from a sub-page takes two steps and is accepted (D14).
*proven by:* e2e `settings-context-rail.spec.ts` › "siblings only, sub-page only"; `strategy:` Fully-Automated

**N2-AC4 — Search sits top-right on the title row and filters destinations only.**
On `/settings` a labelled search control renders on the same visual line as the `Settings` heading,
to the right of it (vertical mid-points within 24px; its left edge right of the heading's right
edge). Typing a string that matches a subset reduces the number of cards to that subset, leaves the
group row's link count unchanged, and leaves the `Main` sidebar's link count unchanged. Clearing it
restores the full set. A string matching nothing shows an empty state that names the typed text.
Below the `sm` breakpoint the control drops to its own full-width row and the heading is not
squeezed. *Reservation on record:* the owner may move this control after seeing it live; top-right
is the requirement being built today.
*proven by:* e2e `settings-context-rail.spec.ts` › "search filters the cards only" (bounding-box + count assertions); `strategy:` Fully-Automated

**N2-AC5 — One line, no sideways scroll, every role, every width.**
The group row occupies **one** rendered line at 390px, 1280px and 1920px, for SUPER_ADMIN (17
destinations), HR_ADMIN (14) and MANAGER (12) — its rendered height does not change between those
three roles. At each of those widths, on `/settings` and on one sub-page,
`documentElement.scrollWidth − documentElement.clientWidth === 0`.
*proven by:* e2e `settings-context-rail.spec.ts` › "one line at three widths and three roles" + "no sideways scroll"; `strategy:` Fully-Automated

**N2-AC6 (a11y) — Landmark, current-state, focus, announcement.**
The navigation landmark keeps the accessible name `Settings sections`. The active group link is
marked current, and on a sub-page the current destination link is marked as the current **page**.
**Every** link in both rows shows a visible focus ring — this is a fix, the bar has none today
(`settings/+layout.svelte:47-49` changes colour only). Tab order on `/settings` runs
`All settings` → group links → search → cards in group order, and visual order equals DOM order at
390px, 1280px and 1920px. The match count is announced politely when the filter changes. Verified in
**both** light and dark themes.
*proven by:* e2e `settings-context-rail.spec.ts` › "keyboard order, current-state and focus rings" + a live-status assertion; `strategy:` Hybrid (automated roles/names/order/focus-ring presence; owner confirms the ring is visible in both themes)

---

## Item N3 — `/employees/new` Companion Rail

Surface: `src/routes/(app)/employees/new/+page.svelte` (one file).

### User stories

- As an HR user hiring someone on a wide screen, I want the form to use the screen instead of a
  narrow centred column, so that I see more fields at once.
- As an HR user whose save was rejected, I want to be told **how many** fields are wrong and be
  taken straight to the first one, so that I stop hunting through 29 fields and a collapsed
  disclosure.
- As an HR user, I want the `Create` button always in reach while I fill a long form, so that I do
  not scroll to the bottom to submit.
- As an HR user, I want **one** way out of the page, so that two `Cancel` controls stop asking me
  which one is real.
- As a keyboard user, I want the tab order through the form to be exactly what it is today.

### What the user wants (behavioural outcomes)

The page fills the available width. The form column is **wider than it is today at every width above
1024px, and never narrower**.

On a very wide screen — 1536px and up — a 256px column sits to the right of the form and stays
pinned in view while you scroll. On anything narrower, that column is not a column: its four things
become a normal full-width block directly under the form. Either way it carries the same four
things, in the same order: how many fields need attention (only after a rejected save), a link that
takes you to the first one, a link per section, and the one `Create Employee` button.

`Create Employee` exists **once**. `Cancel` exists **once**, in the page header.

The `Complete later` disclosure stays full width under the form with nothing beside it. Opening it
does not move the pinned column by a pixel. Its summary text is unchanged, and it still opens itself
when a rejected save is inside it.

The jump-to-first-error control is reachable at **every** width, including a phone. It is the reason
this direction was chosen — the page's existing auto-open behaviour
(`employees/new/+page.svelte:56`) exists precisely because a rejected field is hard to find among 29
fields and a collapsed disclosure.

### Flow / state diagram

```
 2xl and up (viewport >= 1536)                          below 2xl (incl. 1280, 1440, 390)
 +-------------------------------+--------------+       +-----------------------------------+
 | Required to hire              | +----------+ |       | Required to hire                  |
 | +---------------------------+ | |2 fields  | | only  | +-------------------------------+ |
 | | Personal Information      | | |need      | | after | | fieldsets - FULL content width | |
 | | Contact Information       | | |attention | | a     | +-------------------------------+ |
 | | Account                   | | |-> first  | | rejec | | > Complete later - 12 optional | |
 | | Employment Details        | | +----------+ | -tion | +-------------------------------+ |
 | +---------------------------+ | +----------+ |       | +-------------------------------+ |
 | +---------------------------+ | | Personal | |       | | 2 fields need attention       | |
 | | v Complete later - 12 ... | | | Contact  | |       | | -> go to the first one        | |
 | |   (opens, pushes only     | | | Account  | |       | | Personal / Contact / Account  | |
 | |    itself downward)       | | | Employm. | |       | | / Employment  (section links) | |
 | +---------------------------+ | +----------+ |       | | [    Create Employee        ] | |
 |                               | [  Create  ] |       | +-------------------------------+ |
 +-------------------------------+--------------+       +-----------------------------------+
   ^ STICKY: does not move when the                       ^ SAME elements, repositioned by CSS.
     disclosure opens                                       NOT a second copy. Exactly one
                                                            Create Employee button exists.

 form column width = content            (below 2xl)
                   = content - 256 - 32 (2xl and up)
 content           = viewport - 304     (lg and up)  |  viewport - 32 (below lg)

 submit -> server rejects -> banner + count N + "go to the first one"
        -> activate -> FOCUS lands on the first invalid field
                       (the disclosure opens itself if that field is inside it)
 submit -> accepted -> redirect to the new employee's detail page  (UNCHANGED)
```

### Acceptance criteria

**N3-AC1 — Full bleed, measured, and never narrower than today.**
No `mx-auto max-w-3xl` (or any replacement max-width) wraps the page. The rendered width of the form
column is, within 8px:

| Viewport | Content | Rail beside the form? | Form column | Form today |
|---|---|---|---|---|
| 390 | 358 | no | **358** | 358 |
| 1024 | 720 | no | **720** | 720 |
| 1280 | 976 | no | **976** | 768 |
| 1440 | 1136 | no | **1136** | 768 |
| 1536 | 1232 | yes | **944** | 768 |
| 1920 | 1616 | yes | **1328** | 768 |

Content is `viewport − 304` from `lg` up (`+layout.svelte:650` `lg:pl-60` = 240px, `:651` `lg:p-8` =
32px per side) and `viewport − 32` below `lg` (`p-4`). The rail is 256px plus a 32px gap, so the form
loses 288px only at `2xl` and above. **The form column is wider than today at every width above 1024
and equal at or below it — never narrower.** No horizontal page scroll at any of those six widths:
`documentElement.scrollWidth − documentElement.clientWidth === 0`.
*proven by:* e2e `employees-new-layout.spec.ts` › "form column widths at six viewports" + "no sideways scroll"; `strategy:` Fully-Automated

**N3-AC2 — The rail is a sticky aside at `2xl` and up.**
At 1536 and 1920, the four contents render to the right of the form, their container's rendered width
is 256px ±4, and it stays in view while the page scrolls (its viewport-relative top does not change
by more than 8px after scrolling the form 600px). The gate is the **stock** `2xl` breakpoint —
1536px. No custom breakpoint is introduced, and the layout does not switch at 1280 or 1440.
*proven by:* e2e `employees-new-layout.spec.ts` › "rail is a sticky aside at 1536 and 1920" + › "no rail at 1440" (the breakpoint boundary is asserted from both sides); `strategy:` Fully-Automated

**N3-AC3 — Below `2xl` the same four things have a stated home, and the jump control survives.**
At 390, 1024, 1280 and 1440, the error count, the jump-to-first-error control, the section links and
the `Create Employee` button render as a **full-width block directly under the form**, in that order,
with `Create Employee` last. The block is not pinned. The **jump-to-first-error control is present
and operable at every one of those widths**, including 390 — it may not be hidden below a
breakpoint. After a rejected save at 390, activating it moves focus to the first invalid field.
(Section links may be presented compactly at narrow widths but must remain in the document and
reachable by keyboard.)
*proven by:* e2e `employees-new-layout.spec.ts` › "rail contents stack under the form below 2xl" and › "jump to first error works at 390"; `strategy:` Fully-Automated

**N3-AC4 — Exactly one `Create Employee` button and exactly one `Cancel`, at every width.**
At 390, 1024, 1280, 1440, 1536 and 1920, a **DOM-level** count (`document.querySelectorAll`, which
does not skip hidden nodes) of buttons named `Create Employee` returns **exactly 1**, and of controls
named `Cancel` returns **exactly 1** — the one in the page header. The rail's contents are therefore
**one** set of elements repositioned by CSS, **not** two sets shown and hidden at a breakpoint. The
old bottom submit row (`/employees/new:579`) no longer renders. The four existing onboarding tests in
`tests/e2e/admin.spec.ts` — which locate that button in **strict mode** at line 49 — pass unchanged.
*proven by:* e2e `employees-new-layout.spec.ts` › "exactly one Create Employee and one Cancel at six widths" (DOM-level counts) + the unchanged `admin.spec.ts` run; `strategy:` Fully-Automated

**N3-AC5 — The disclosure is unchanged in text and behaviour, and does not move the rail.**
The summary string is byte-for-byte `Complete later — 12 optional fields`. The disclosure spans the
full width of the form column with no sibling beside it. At 1920, opening it changes the aside's
viewport-relative top by **0px**. A rejected save on a field inside it still opens it automatically.
*proven by:* e2e `employees-new-layout.spec.ts` › "disclosure text frozen" (exact string), › "opening the disclosure does not move the rail" (bounding boxes before/after, at 1920), and the existing `admin.spec.ts:128,159` clicks; `strategy:` Fully-Automated

**N3-AC6 (a11y) — Tab order, jump behaviour, focus.**
Tab order through the form fields is identical to today's, in this order: First → Last → Middle →
Phone → Address → Email → Password → Role → Discord → Department → Job Title → Employment Type →
Start Date → Rate Basis → Salary → Reports To → Position → Work Schedule → disclosure summary →
(when open) the optional fields in place → **then** the rail contents: error link (when present) →
section links → `Create Employee`. That order is the same above and below `2xl`, because the elements
are the same elements. Activating the "go to the first one" control moves **focus** onto the first
field carrying an error (not merely scrolls to it), and if that field is inside the disclosure, the
disclosure is open when focus lands. Every rail control shows a visible focus ring, in both light and
dark themes. The page renders exactly one `<h1>`.
*proven by:* e2e `employees-new-layout.spec.ts` › "tab order unchanged above and below 2xl", › "jump moves focus to the first invalid field", › "one h1"; `strategy:` Hybrid (automated order/focus target/h1 count; owner confirms the focus ring in both themes)

---

## Item N5 — `/inventory` list + grid, one shared modal

Surfaces: `src/routes/(app)/inventory/+page.svelte`,
`src/routes/(app)/inventory/+page.server.ts` (**read of a `view` parameter only** — actions and
`itemSchema` untouched), `tests/e2e/inventory.spec.ts`.

### User stories

- As an HR user on a laptop, I want the inventory to fit the screen, so that I stop dragging a
  horizontal scrollbar to see who holds an item.
- As an HR user, I want to click an item and edit it in one place, so that I am not tabbing through
  nine editors sitting in a table row.
- As an HR user, I want adding an item and editing an item to be **the same form**, so that the two
  never disagree about which fields exist.
- As an HR user, I want to choose between a dense list and a card grid, so that the page suits both
  a registry scan and a phone.
- As an HR user, I want Delete where the item's details are, behind a confirm, so that I cannot
  remove a row by mis-clicking in a list.
- As a keyboard user, I want the row to behave like a button — Enter and Space both open it, and
  Space does not scroll the page — and I want focus to come back somewhere sensible when the modal
  closes, including after a delete.

### What the user wants (behavioural outcomes)

The item list fits the width at every size. Nothing on a row is editable. Clicking or keyboard-
activating an item opens one modal holding all ten fields; the same modal, opened from `Add item`,
creates a new one. Delete sits in that modal behind the usual confirm step.

A toggle switches between the list and the card grid — the same control `/team` already uses. The
page opens on **List**. Both shapes open the same modal.

A save that the server rejects leaves the modal open **with the user's edits still in it**. A save
that succeeds closes the modal and shows the new values in the list.

The separate "Add an item" form no longer exists.

### Flow / state diagram

```
 /inventory[?view=list|grid]      default = list
 ┌───────────────────────────────────────────────────────────────┐
 │ filters (GET form — UNCHANGED)                                │
 ├───────────────────────────────────────────────────────────────┤
 │ Items  47 items                  [ Grid | List ]  [+ Add item]│
 ├───────────────────────────────────────────────────────────────┤
 │ ≥sm & view=list → fixed-width table, every cell truncates      │
 │ <sm  OR view=grid → cards                                      │
 │ each row/card = ONE <button>, name "Edit <item>", no other     │
 │ control anywhere in the row                                    │
 └───────────────────────────────────────────────────────────────┘
        │ click / Enter / Space              │ "Add item"
        v                                    v
 ┌──────────────────────────────┐    ┌──────────────────────────────┐
 │ Edit <item>        [Delete]  │    │ Add an item                  │
 │ ───────────────────────────  │    │ ───────────────────────────  │
 │ the SAME ten fields          │    │ the SAME ten fields (blank)  │
 │ (only this part scrolls)     │    │                              │
 │ ───────────────────────────  │    │ ───────────────────────────  │
 │        [Cancel] [Save]       │    │    [Cancel] [Create item]    │
 └──────────────────────────────┘    └──────────────────────────────┘
        │ save rejected                │ save accepted        │ Delete → confirm → yes
        v                              v                      v
  modal STAYS OPEN,               modal closes,          row removed, modal closes,
  edits PRESERVED                 list shows new values  focus → the list, never <body>
```

### Acceptance criteria

**N5-AC1 — Nothing overflows: not the page, not the modal.**
(a) At 390, 1280 and 1920, in **both** list and grid views,
`documentElement.scrollWidth − documentElement.clientWidth === 0`, and no descendant of the items
panel has a rendered width greater than the panel's own width.
(b) The edit modal does not overflow at any size. At 390×844, at 1280×720 and at a deliberately
short 1280×360 viewport: the modal panel's rendered height is ≤ 90% of the viewport height; the
title, the Delete control and the Save/Cancel row are all inside the viewport; only the field area
scrolls.
*proven by:* e2e `inventory.spec.ts` › "no sideways scroll at three widths in both views" and › "modal fits three viewports including a short one"; `strategy:` Fully-Automated

**N5-AC2 — The row is purely clickable; nothing on it edits.**
In both views, a row/card contains **exactly one** focusable element. No `input`, `select`,
`textarea`, `Save` control or `Delete` control exists anywhere inside a row or card. The page
renders no per-row form.
*proven by:* e2e `inventory.spec.ts` › "rows carry no controls" (element counts inside a row locator, both views); `strategy:` Fully-Automated

**N5-AC3 — Two views, `/team`-style toggle, List by default.**
Visiting `/inventory` with no view parameter shows the list. A toggle offers exactly two choices,
List and Grid, marks the active one, and is reflected in the web address so the choice can be
bookmarked and reloaded. Switching to Grid renders cards for the same items; switching back renders
the table. Below `sm` the list view renders cards regardless. Opening an item from **either** view
opens the same modal, identified by the same accessible name.
*proven by:* e2e `inventory.spec.ts` › "view toggle defaults to list and survives reload" and › "both views open the same modal"; `strategy:` Fully-Automated

**N5-AC4 — One modal for create and edit; the old add form is gone.**
No `Add an item` disclosure/`<details>` form exists on the page. Pressing `Add item` opens a dialog
whose submit control is named `Create item` (not `Add item`). Pressing a row opens the same dialog
shape with the submit named `Save`. Both carry the identical set of ten field names —
`name, category, quantity, unit, location, status, assignedToId, serialNumber, value, notes` —
including `notes`, which the row-edit form does not have today. Creating an item this way adds it to
the list; the `?/create`, `?/update` and `?/remove` server actions and `itemSchema` are unchanged.
*proven by:* e2e `inventory.spec.ts` › "add item uses the shared modal" + a field-name comparison assertion between the two modal modes; `strategy:` Fully-Automated

**N5-AC5 — Delete lives in the modal, behind a confirm, and the assign invariant still holds.**
`Delete` appears only inside the modal. Activating it raises the existing confirm step; confirming
removes the item from the list and closes the modal. Setting status to `Assigned` with no employee
chosen is still rejected with the existing message; choosing an employee then saves. An item held by
an employee who is no longer active still offers that holder as the selected option (labelled so it
reads as inactive), and saving without touching the field does **not** drop the assignment.
*proven by:* e2e `inventory.spec.ts` › "delete from the modal", › "assign invariant enforced", › "inactive holder is preserved on save"; `strategy:` Fully-Automated

**N5-AC6 (hazard) — A rejected save keeps the modal open AND keeps the user's edits.**
Open an item, change Status to `Assigned`, save, and see the rejection. The modal is still open and
the Status control still reads `Assigned`. Then choose an employee, save, and the modal closes and
the list shows the new status. **Negative control (mandatory):** with the form-reset suppression
removed (`update()` left at its default `reset: true`), the "still reads `Assigned`" assertion must
go **red**. Record that it does. A test that stays green through that mutation has not proven
anything — this repo has lost time to exactly this failure twice
(`sveltekit-update-resets-the-form`).
*proven by:* e2e `inventory.spec.ts` › "failed save preserves the edit" + its named negative control; `strategy:` Fully-Automated

**N5-AC7 (hazard) — Focus after a delete never falls to `<body>`.**
After deleting an item from the modal, `document.activeElement` is the items list container (or a
control inside it) and is **not** `document.body` and not a detached node. Assert it by identity,
not by "something is focused". **Negative control (mandatory):** remove the explicit post-delete
focus handling and confirm the assertion goes red.
*proven by:* e2e `inventory.spec.ts` › "focus after delete lands on the list" + its named negative control; `strategy:` Fully-Automated

**N5-AC8 (a11y) — The row is a real button, named, keyboard-complete, with a defined focus path.**
All of the following, in both views and in both themes:
- The interactive element is a `<button type="button">`. Its role is `button`. **No `<tr>` carries
  `role="button"`.**
- Its accessible name begins with `Edit ` and contains the item's name (e.g. `Edit MacBook Pro 14`).
- **Enter activates it. Space also activates it, and pressing Space does not scroll the page** —
  `window.scrollY` is unchanged across the Space press.
- The focus indicator is drawn on the whole row/card, not only on the text.
- **On open**, focus moves into the dialog and Tab is trapped inside it; the dialog is announced by
  its title.
- **On close** (Escape, Cancel, backdrop, or a successful save), focus returns to the exact row
  button that opened it.
- **After a delete**, focus goes to the items list container (N5-AC7), because the row button no
  longer exists.
- The table exposes a caption/description telling a screen-reader user that selecting an item edits
  it, and the status field's constraint ("Assigned needs an employee; any other status clears the
  holder") is attached to the status control itself, not stated at the bottom of the page.
*proven by:* e2e `inventory.spec.ts` › "row is a button with a name", › "Enter and Space both open, Space does not scroll", › "focus on open, on close, and after delete"; `strategy:` Hybrid (automated role/name/keys/scroll/focus identity; owner confirms the focus indicator reads correctly in both themes)

---

## Out of scope

Named explicitly, so nothing here is picked up by accident.

| Item | Why it is out |
|---|---|
| **N1** — attendance view switch | Build lane. `owner-click-pass-build-lane_18-09-26/`. |
| **N4** — `New Separation` on the title row | Build lane. |
| **N6** — `/settings/org` Employee Assignments paging | Build lane. |
| **N7** — `PageHeader` `description` → `HelpTip` | Build lane. **It changes `/settings` and `/inventory` headers underneath this lane** — both pass a `description`. This lane must not re-specify, re-implement or undo that. See Risk R4. |
| **O1** — e2e suite expansion (A1–A5 in the work order) | Owner sequenced it last. Only the per-item tests named in this doc are in scope. |
| **Positions table pagination** (`/settings/org`) | Per D3. `data.positions` feeds the per-row assign dropdown and cannot be paged without breaking assignment. |
| **The `services/**` query-level pagination fix** | Needs a service signature change inside the banned tree. Tracked in `query-level-pagination-unbounded-lists_NOTE_03-09-26.md`. |
| Bulk editing of inventory items | Explicitly not built. Editing 20 items becomes 20 modals. If that turns out to be a real workflow it wants row checkboxes and a bulk action — a separate, larger piece of work. |
| Rewriting any page description copy | N7 moves the text; nobody rewrites it. |
| A new component for the inventory modal, the settings search, or the hire-form rail | All three directions were chosen on the basis that they add **no** new component. |
| Changing `settings-destinations.ts`'s 17 entries | The single source stays as it is; N2 appends one helper only. |
| Changing `/inventory`'s GET filter form, its load's filtering, or its page size | Untouched. |

---

## Constraints

**Hard "never touch" list**
- Never edit `src/lib/rbac.ts`.
- Never edit `prisma/schema.prisma`.
- Never edit anything under `src/lib/server/services/**`.

**Server surface for N5**
- The `/inventory` server actions (`?/create`, `?/update`, `?/remove`) and `itemSchema` **must not
  change**. A modal posting the identical field names needs zero server change; keep it that way.
  The only permitted server-side change is reading a `view` parameter for the toggle.

**Code style**
- **No explanatory comments in code.** The why goes in the commit message.
- Existing comments are carried across **verbatim** — never deleted, never reworded. This includes
  `PageHeader.svelte`'s title-row rule comment and `inventory.spec.ts`'s `#114` header comment.

**Toolchain**
- bun 1.4. `bun run <script>` only — never bare `bun test` or `bun build` (bun shadows them).
- Svelte 5 runes only (`$state`, `$derived`, `$effect`, `$props`). SvelteKit 2.
- `{@const}` must be an **immediate child of a block tag** — never inside a plain HTML element.
- Tailwind v3 with the HSL design tokens in `src/app.css`. **Light and dark both.** No raw hex.

**Layout and responsiveness**
- **No sideways scroll at any width.** Must work at 390px.
- **Modals must not overflow at any size** — a standing owner rule. The owner's own measured
  `innerHeight` has been as low as 314px with docked DevTools.
- Breakpoint decisions are made on **content width**, not viewport width: content is
  `viewport − 304` from `lg` up, because the sidebar arrives at the same breakpoint.

**Accessibility (not optional)**
- Keyboard reachability, correct roles and names, and a visible focus indicator on every control
  touched, in both themes.
- A clickable row must be a real `<button>`; `role="button"` on a `<tr>` is banned.

**Environment**
- The owner starts dev servers and the database. Do not run `./start.sh`, `vite` or `docker`.
- Never edit `.env` / `.env.dev`.

**CI gate order** (stops at the first failure):
`bun install --frozen-lockfile` → `bunx prisma generate` → `bun run format:check` → `bun run lint` →
`bun run check` → `bun run test`; then e2e: `bunx prisma db push --skip-generate` →
`bunx tsx prisma/seed-e2e.ts` → `bunx playwright install --with-deps chromium` →
`bun run test:e2e`.

---

## Risks

| # | Risk | Why it matters | What the requirements do about it |
|---|---|---|---|
| **R1** | **Strict-mode `Create Employee`.** `tests/e2e/admin.spec.ts:49` locates `getByRole('button', { name: 'Create Employee' })` in strict mode. If the rail adds a Create button and the old submit row stays, the locator matches two elements and **all four onboarding tests fail**. Hiding one with `hidden xl:block` "probably" resolves — do not rely on it. | Four tests, silently, on the busiest create flow in the app. | **N3-AC4** requires a DOM-level count of exactly 1 at six widths (hidden nodes counted), plus the unchanged `admin.spec.ts` run. **D17 makes this structural:** the rail's contents are ONE set of elements repositioned by CSS, so a duplicate cannot exist to be hidden. |
| **R2** | **The frozen summary string.** `Complete later — 12 optional fields` is depended on byte-for-byte by `admin.spec.ts:128,159`. (`OPTIONAL_FIELDS` actually holds 11 entries — a known discrepancy, explicitly **out of scope**; do not "fix" the count.) | A one-character edit turns two tests red for a reason nobody will connect to layout work. | **N3-AC5** asserts the exact string. |
| **R3** | **The stale comment at `settings-visibility.spec.ts:32-34`** says an unscoped locator matches three links (hub card, sub-nav row, sidebar row). Under Context Rail it matches two. | The comment will be wrong the moment N2 lands, and the next reader will trust it. | Correct the comment in the same commit as N2. The assertions it sits above are unchanged; **N2-AC2** requires `lines 57-58` to survive and still pass. |
| **R4** | **N7 changes both `/settings` and `/inventory` headers underneath this lane.** Both pass a `description`, so after N7 the grey line becomes a `?` beside the title. | Two lanes editing the same title rows. A design built against the pre-N7 header can fight it, and `HelpTip` anchors to the `relative` div at `PageHeader.svelte:35` — anything that drops that `relative` mis-positions every tooltip in the app with no compile error. | Do **not** re-specify or re-implement N7 here. The N2 search control is laid out by the page **beside** `PageHeader`, never inside it, and nothing in this lane removes `relative` from the title row. Owner sign-off on N2's title row happens after N7 lands. |
| **R5** | **The `float-left` legend does not compose with a grid.** `/employees/new:101-102` floats the legend because `<legend>` and a grid sibling do not compose, and a grid container does **not** wrap a float. | Any legend-beside-fields layout needs an explicit matching margin, and the two numbers can silently drift apart with no compiler check. | Direction C keeps the legend **above** its fields, so no matching margin is introduced. **N3-AC6** pins the reading order the float already produces. Nothing here may convert a fieldset into a grid container without keeping the float's clearing intact. |
| **R6** | **`update()` defaults to `reset: true`.** On a rejected save it blanks every field in the inventory modal — and the existing e2e would still pass, for the wrong reason. Recorded twice before. | A green test proving nothing about the exact scenario it was written for. | **N5-AC6** with a **mandatory negative control**. |
| **R7** | **Post-delete focus falls to `<body>`.** `Dialog`'s focus restore targets the row button, which no longer exists after a delete. | A keyboard or screen-reader user is dumped at the top of the document. This is the one bit of the N5 design not inherited from an existing component, so it is the bit that can silently rot. | **N5-AC7** asserts the focus target by identity, with a **mandatory negative control**. |
| **R8** | **`inventory.spec.ts` row locators all break.** Line 10's `tr[data-name="…"]` helper plus lines 43, 44, 48, 49, 53, 54 are row-scoped. With cards and rows both carrying `data-name` and CSS hiding one, an element-name selector double-counts. | The spec must be rewritten **alongside** the change, not after it. A half-rewritten spec is how a passing suite hides a broken page. | The Test Expectations section names every line and what it becomes. |
| **R9** | **`/settings/org` and the settings sub-nav have no test coverage at all** today — neither e2e nor unit. | N2 changes a surface nothing currently guards. | N2's new spec is required, not optional. `tests/unit/settings-cards.test.ts` asserts the per-role href list off the **load**, not the markup, so it is unaffected — but it must still be run and seen green. |
| **R10** | **Bounding-box assertions can pass for the wrong reason.** Two elements can report "one row" while overlapping. This repo has been burned: size measurements cannot see overlap. | A green position assertion on a broken layout. | Every position criterion here (N2-AC4) asserts vertical alignment **and** horizontal separation — which overlap cannot satisfy. |
| **R12** | **The `2xl` gate (D17) is a single number in a class string.** If it is written as `xl:` by mistake, the form column at 1280 silently drops from 976px to 688px — narrower than today — and every width assertion below `2xl` still passes because they are asserted at the wrong breakpoint. | The exact failure the owner's ruling exists to prevent, reintroduced by one character. | **N3-AC1** asserts six measured widths including 1280 and 1440, and **N3-AC2** asserts the boundary from **both** sides — rail present at 1536, absent at 1440. |
| **R11** | **`table-fixed` truncates.** A long location or surname gets an ellipsis instead of wrapping. | Deliberate trade for never scrolling sideways, but users will notice. | Accepted. Out of scope to mitigate beyond what the design specifies. |

---

## Test expectations

Scenario names below are the `proven by:` targets used in the acceptance criteria. Grouped by the
three strategies the repo's test context defines.

### N2 — `tests/e2e/settings-context-rail.spec.ts` (new)

Nothing today targets `/settings/org` or the settings sub-nav, so this spec is new surface.

- "bar lists groups only" — inside `getByRole('navigation', { name: 'Settings sections' })`: one
  link per visible group plus `All settings`; count of links named with a destination label in the
  group row is 0.
- "no destination is listed twice on the hub" — for each visible destination label: count inside
  the settings navigation landmark is 0; count inside
  `getByRole('region', { name: 'Settings destinations' })` is 1.
- "siblings only, sub-page only" — on `/settings` the landmark holds one row; on
  `/settings/holidays` it holds two, the second contains only that group's destinations, and the
  current page is marked current.
- "search filters the cards only" — bounding boxes for title-row placement (mid-points within 24px,
  left edge right of the heading's right edge); typing reduces the card count, leaves the group-row
  link count and the `Main` navigation link count unchanged; a no-match string shows an empty state
  containing the typed text.
- "one line at three widths and three roles" — group-row rendered height equal for SUPER_ADMIN,
  HR_ADMIN and MANAGER at 390, 1280, 1920.
- "no sideways scroll" — `scrollWidth − clientWidth === 0` on `/settings` and one sub-page at 390,
  1280, 1920.
- "keyboard order, current-state and focus rings" — Tab order on `/settings`; `aria-current` on the
  active group chip and on the current sub-page link; a computed non-`none` focus indicator on every
  bar link (assert the **computed style**, not the box); the match count announced politely.

**Existing specs that must pass unchanged:** `tests/e2e/settings-visibility.spec.ts` in full — in
particular the unscoped `toHaveCount(0)` assertions at lines 57-58, which are a regression guard on
the very duplication being removed. Its comment at lines 32-34 is corrected in the same commit (it
will no longer be three links). `tests/unit/settings-cards.test.ts` and
`tests/unit/settings-destinations.test.ts` must stay green.

### N3 — `tests/e2e/employees-new-layout.spec.ts` (new)

- "form column widths at six viewports" — 390 / 1024 / 1280 / 1440 / 1536 / 1920, ±8px against the
  table in N3-AC1. Assert explicitly that 1280 and 1440 are **wider** than 768.
- "no sideways scroll" — at the same six viewports.
- "rail is a sticky aside at 1536 and 1920" — 256px ±4; viewport-relative top stable after a 600px
  scroll; the four contents present; error count and jump link present only after a rejected submit.
- "no rail at 1440" — the boundary asserted from the other side: at 1440 the contents are not a
  256px sticky aside, and the form column is the full 1136px.
- "rail contents stack under the form below 2xl" — at 390, 1024, 1280 and 1440: full-width block
  directly under the form, contents in order, `Create Employee` last, not pinned.
- "jump to first error works at 390" — submit incomplete at 390, the jump control is present and
  operable, activating it puts `document.activeElement` on the first invalid field.
- "exactly one Create Employee and one Cancel at six widths" — `document.querySelectorAll` counts, so
  hidden nodes are counted too. A `toHaveCount(1)` on the visible-role locator alone is **not**
  sufficient — it would pass with a hidden duplicate that still breaks `admin.spec.ts:49`.
- "disclosure text frozen" — exact string `Complete later — 12 optional fields`.
- "opening the disclosure does not move the rail" — aside bounding box identical before and after
  toggling, at 1920.
- "tab order unchanged above and below 2xl" — the sequence in N3-AC6, asserted at 1920 and at 1280.
- "jump moves focus to the first invalid field" — by element id; when the field is inside the
  disclosure, assert the disclosure is open.
- "one h1".

**Existing spec that must pass unchanged:** `tests/e2e/admin.spec.ts` in full — its `getByLabel`
locators, `select[name=…]` locators, the frozen summary string at 128/159, and the strict-mode
`Create Employee` button at line 49.

### N5 — `tests/e2e/inventory.spec.ts` (rewritten alongside, not after)

Line-by-line, what each existing assertion becomes:

| Line today | Today | Becomes |
|---|---|---|
| 10 | `page.locator('tr[data-name="${name}"]')` | a helper that matches the **visible** item element in either view (both the row and the card carry `data-name`, and CSS hides one — an element-name selector double-counts) |
| 18, 19, 25, 26, 29 | row visibility / filter assertions | unchanged against the new helper (Playwright's default 1280 renders the table branch) |
| 38-39 | `getByText('Add an item').click()` → `#a-name` → `Add item` | press `Add item`, work inside the create dialog, submit via `Create item` |
| 43, 44 | inline `select[name="status"]` on the row → row `Save` | open the row, set status inside the dialog, press `Save` in the dialog |
| 48, 49 | inline `select[name="assignedToId"]` on the row → row `Save` | **add** `expect(status).toHaveValue('ASSIGNED')` first — the `reset:false` guard (N5-AC6) — then choose the employee, save, and assert the dialog closes |
| 53, 54 | row `Delete` → `alertdialog` `Delete` | open the row, press `Delete` inside the edit dialog, then the `alertdialog` confirm (line 54's disambiguation still works — `ConfirmDialog` is `role="alertdialog"`) |

New scenarios: "no sideways scroll at three widths in both views"; "modal fits three viewports
including a short one"; "rows carry no controls"; "view toggle defaults to list and survives
reload"; "both views open the same modal"; "add item uses the shared modal" (+ the field-name
comparison); "assign invariant enforced"; "inactive holder is preserved on save"; "delete from the
modal"; "failed save preserves the edit"; "focus after delete lands on the list"; "row is a button
with a name"; "Enter and Space both open, Space does not scroll"; "focus on open, on close, and
after delete".

### Strategy split

- **Fully-Automated (the default, and the bar):** every criterion above except the two named
  Hybrid halves. Vacuous green is not an acceptable end state on any of these three surfaces.
- **Hybrid:** N2-AC6 and N3-AC6 and N5-AC8 — roles, names, order, focus targets, key handling and
  scroll position are automated; the **owner confirms the focus indicator reads correctly in both
  themes**, because this repo has no automated contrast or focus-visibility gate.
- **Agent-Probe:** none required in this lane. (N7's contrast probe belongs to the build lane.)

### Mandatory negative controls

Two, both in N5, both recorded with the mutation and the red result:

1. **N5-AC6** — restore `update()`'s default reset and confirm the "edits preserved" assertion goes
   red. Revert.
2. **N5-AC7** — remove the explicit post-delete focus handling and confirm the focus assertion goes
   red. Revert.

A criterion that stays green through its own mutation has not been proven.

### Running the gates

`bun run test:e2e -- <spec>` **does not filter** — it silently runs everything. The working form is
`CI=1 bun run exec dotenv -e .env.dev -- playwright test <specs>` (the repo's tests context records
the exact incantation and why `CI=1` matters). Run `bunx prisma generate` before believing a red
`bun run check`.

---

## Open questions

**None.**

OQ-1 — whether the hire form could be "wider than today at every width from `lg` up" — is closed by
**D17**: the Companion Rail renders as a sticky aside only from the stock `2xl` breakpoint (1536px)
up, and below that the form takes the full content width. The arithmetic was re-verified against
source (`+layout.svelte:650` `lg:pl-60` = 240px; `:651` `lg:p-8` = 32px per side; `tailwind.config.ts`
declares **no** custom `screens`, so `2xl` is the stock 1536px; the rail is 256px with a 32px gap):

| Viewport | Content | Rail? | Form column | Today | Verdict |
|---|---|---|---|---|---|
| 1024 | 720 | no | 720 | 720 | same (today is content-capped, not 768-capped) |
| 1280 | 976 | no | **976** | 768 | wider |
| 1440 | 1136 | no | **1136** | 768 | wider |
| 1536 | 1232 | yes | **944** | 768 | wider |
| 1920 | 1616 | yes | **1328** | 768 | wider |

**One correction to the figures supplied with the ruling:** the 1536 case is **944px**, not ~952 —
the gap is `gap-8` (32px), so the form loses 288px, not 280. Every other number checks out. The
verdict is unchanged: wider than today at every width above 1024, never narrower.

Everything else the notes carried was already closed: N2's R1-vs-R2 by D4/D11, N2's search home by
D5, the cross-group click cost by D14, N3's layout questions by D7/D12, N5's Delete placement by D8,
N5's list-vs-grid by D13/D9, and N5's add-form merge by D15.

---

## Background / research findings

Measured before this doc and treated as given. Do not re-derive.

**Shell geometry (binds all three items)**
- Real content width is `viewport − 304` from `lg` up: the sidebar (`+layout.svelte:650`,
  `lg:pl-60`) arrives at the same breakpoint. At 1024 that is 720px, so each half of a naive
  two-column is 348px — a column only clears the 640px `sm` breakpoint at viewport ≈1608. Content
  gets **narrower** going 768 → 1024.

**N2 — settings**
- `settings/+layout.svelte:25-58` renders `<nav aria-label="Settings sections">` with every visible
  destination, grouped, in a wrapping flex. `settings/+page.svelte:32-49` renders the same
  destinations as cards inside `role="region" aria-label="Settings destinations"`. On `/settings`
  both render — the duplicate.
- The sidebar carries a curated **7** of the 17 (`+layout.svelte:147`, `inSidebar`). The
  destination list is 17 / 14 / 12 for SUPER_ADMIN / HR_ADMIN / MANAGER.
- `src/lib/settings-destinations.ts` is the single source and stays so.
- The bar has **no visible focus style** today — `+layout.svelte:47-49` changes colour only.
- `tests/e2e/settings-visibility.spec.ts`: line 6 locates hub cards via the `role="region"`
  landmark; lines 36, 65, 66, 68 use it; **lines 57-58 are an unscoped
  `getByRole('link').toHaveCount(0)`** acting as a regression guard on the very duplication being
  removed — it must survive. The comment at 32-34 ("matches three links") goes stale.
- No e2e or unit test targets `/settings/org` or the settings sub-nav.

**N3 — `/employees/new`**
- Line 78 wraps the page in `mx-auto max-w-3xl`. 29 fields across 7 fieldsets, 10 required, 11 more
  behind a `<details>`.
- `:101-102` uses a `float-left` legend because `<legend>` and a grid sibling do not compose. A grid
  container does **not** wrap a float, so any legend-beside-fields layout needs an explicit matching
  margin.
- There are **two** Cancel controls today: `PageHeader`'s `back()` snippet at 80-82 and the submit
  row at 579. The chosen direction deletes the bottom one.
- `Complete later — 12 optional fields` (line 413) is depended on byte-for-byte by
  `tests/e2e/admin.spec.ts:128,159`. The underlying `OPTIONAL_FIELDS` array holds **11** entries —
  a known, out-of-scope discrepancy.
- `admin.spec.ts` locators: `getByLabel`, `select[name=…]`, that frozen string, and
  `getByRole('button', { name: 'Create Employee' })` at line 49 — **strict mode**.
- `optionalHasError` (line 56) opens the disclosure when a rejected field is inside it. That hack is
  the evidence that errors are hard to find on this page today, and it is why the jump-to-first-error
  control must survive at every width (N3-AC3).
- `tailwind.config.ts` declares **no** custom `screens`, so the breakpoints are stock: `sm` 640,
  `md` 768, `lg` 1024, `xl` 1280, **`2xl` 1536**. D17's gate is the stock `2xl`.
- Shell padding read from source: `+layout.svelte:650` `lg:pl-60` (240px sidebar offset) and `:651`
  `p-4 pt-20 lg:p-8 lg:pt-8` (16px per side below `lg`, 32px per side at `lg`+).

**N5 — `/inventory`**
- The table needs ~1438px; available is 1582px at 1920, **942px at 1280**, 324px at 390. It already
  overflows by 496px at 1280, which is also Playwright's default width — part of why no test caught
  it. `min-w-max` at `:193-194` makes the scrollbar designed in, not incidental.
- Nine editable controls per row at fixed widths; `form="edit-{id}"` indirection exists only because
  a `<form>` cannot span `<td>`s.
- `itemSchema` (`+page.server.ts:46-61`) reads exactly
  `name category quantity unit location status assignedToId serialNumber value notes`; `update` also
  reads `id`. A modal posting the same names needs **no server change**.
- `notes` is in the schema and in the Add form but has **no table column** — the exact drift D15
  removes.
- `Dialog.svelte:149`: `scroll` is what adds `flex max-h-[90vh] flex-col overflow-hidden`. Without
  it a Dialog has **no** max-height. The nine-field form measures ~1008px at 390.
- `ConfirmDialog` is hard-wired to `zIndex 60`, so a dialog containing one must sit below that —
  `TimesheetModal.svelte:305` uses 50 for the same reason.
- `Dialog` focus restore (`:83-88`) captures `document.activeElement` on open and calls
  `trigger?.focus()` on close. **After a delete that target is detached and focus falls to
  `<body>`.**
- `Table.svelte`'s `onRowClick` puts `role="button"` on a `<tr>`, destroying row semantics, and its
  Space handler does not `preventDefault`, so Space also scrolls the page. The chosen direction
  rejects it in favour of a real `<button>` stretched with `after:absolute after:inset-0`, copying
  `EmployeeTable.svelte:29,35`.
- SvelteKit's `update()` defaults to `reset: true`. On a rejected save that wipes every field in the
  modal, and the existing e2e would still pass — for the wrong reason
  (`sveltekit-update-resets-the-form`, twice).
- `tests/e2e/inventory.spec.ts`: line 10 is the `tr[data-name="…"]` helper; lines 43, 44, 48, 49,
  53, 54 are row-scoped and all change.
- `Items ({data.items.length})` at line 187 counts the page slice (max 20), not the registry — an
  adjacent one-line correction the design report flagged.

**CI gate order**, stops at the first failure: `bun install --frozen-lockfile`;
`bunx prisma generate`; `bun run format:check`; `bun run lint`; `bun run check`; `bun run test`.
Then e2e: `bunx prisma db push --skip-generate`; `bunx tsx prisma/seed-e2e.ts`;
`bunx playwright install --with-deps chromium`; `bun run test:e2e`.
