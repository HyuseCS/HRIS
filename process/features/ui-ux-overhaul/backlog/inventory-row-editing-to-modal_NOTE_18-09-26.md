---
name: note:inventory-row-editing-to-modal
description: "Owner feedback 18-09-26 on /inventory — the 11-column always-editable table overflows sideways; make it a list whose entries open an edit modal on click. Plus the third request today for the ? description tooltip."
date: 18-09-26
feature: ui-ux-overhaul
---

# Inventory — list plus edit modal instead of an overflowing edit grid

Date: 2026-09-18
Source: owner, live on `/inventory`
Surface: `src/routes/(app)/inventory/+page.svelte` (346 lines)
Status: NOTED, not built. Owner called the page good — this is structure and copy.

## V1 — the table overflows because every row is a live form

Line 193-194:

```svelte
<div class="overflow-x-auto rounded-md border">
  <table class="w-full min-w-max text-sm">
```

`min-w-max` tells the table to be as wide as its widest content and never compress, so the
horizontal scrollbar is designed in, not incidental. Eleven columns: Name, Category, Qty, Unit,
Location, Status, Assigned to, Serial, Value, Save, Delete.

The width comes from what the cells hold. Every row renders **nine editable controls** at once,
each with a fixed width:

| Field | Control | Width |
|---|---|---|
| Name | input | `w-40` |
| Category | input + datalist | `w-32` |
| Qty | number input | `w-20` |
| Unit | input | `w-16` |
| Location | input | `w-32` |
| Status | select | `w-28` |
| Assigned to | select over every employee | `w-40` |
| Serial | input | `w-28` |
| Value | number input | `w-24` |

That is ~17rem of fixed control width before padding, times nine columns. No amount of responsive
work fixes it while every row stays an open form.

## V2 — the ask

Owner: make the entries a list, not an edit grid. Clicking an entry opens a modal, and the
editing happens there.

This removes the cause rather than the symptom: a read-only list row can show Name, Status badge,
Assigned to and Qty and fit any width, because nothing in it is a sized input.

### What has to be unpicked

1. **The `form=` attribute trick.** Every control carries `form="edit-{item.id}"`, pointing at a
   `<form id="edit-{item.id}">` that lives in the Save cell at the end of the row. That indirection
   exists only because HTML forbids a `<form>` spanning `<td>`s. Inside a modal the fields and the
   form are in one place, so the whole `form=` scheme goes away — do not carry it across.
2. **`?/update` stays as is.** It reads `id` plus the nine field names from the POST body. A modal
   form posting the same names needs no server change. Keep the action signature identical.
3. **Delete.** `ConfirmButton action="?/remove"` is the last cell today. Decide whether it moves
   into the modal or stays on the list row. In the modal it is one less control per row; on the row
   it is one fewer click for the common case.
4. **The inactive-assignee option.** The Assigned-to select re-adds an offboarded assignee as a
   selected option so a save cannot silently drop the assignment. That guard must survive into the
   modal — it is correctness, not layout.
5. **`Dialog.svelte` / `ConfirmDialog.svelte` already exist** in `src/lib/components/ui/`. Use one.
   Do not write a new modal.
6. **The footer hint** at the bottom ("Edit a row's fields and press Save…") describes the grid and
   must be rewritten or dropped.

### Watch the tests

`tests/e2e/inventory.spec.ts` finds rows with `tr[data-name="${name}"]` and drives the inline
inputs directly. Every one of those locators breaks when the row stops being a form. The spec
needs rewriting alongside, not after.

## V3 — the description behind a `?`

`description="Track company assets, equipment, and supplies — quantity, location, status, and who
holds each item."` — 100 characters.

**This is the third page today** the owner has asked this for: `/settings`, `/separations`, now
`/inventory`. The program-wide note is `page-header-bar-and-help-tooltip_NOTE_04-09-26.md`
(34 pages carry a description, 10 over 120 characters, longest 290, owner already ruled in favour
of the `?`). `src/lib/components/ui/HelpTip.svelte` renders the control.

Three separate requests in one session is the signal to stop filing this per page and run the
04-09-26 note as one pass. Its single open question — short description visible beside the `?`, or
the `?` carrying all of it — is the only thing blocking it.

## Scope

V1/V2 are markup plus one modal; `?/update` and `?/remove` keep their signatures and the load is
untouched. V3 is copy plus an existing component.
