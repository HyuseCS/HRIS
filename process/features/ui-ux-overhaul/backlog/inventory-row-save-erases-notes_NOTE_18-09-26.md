---
name: note:inventory-row-save-erases-notes
description: "Saving any /inventory row erases that item's notes. The row form posts ten fields, notes is not one of them, and the server writes null for what is absent. N5's single-modal merge fixes it."
date: 18-09-26
feature: ui-ux-overhaul
---

# Saving an inventory row erases its notes

Date: 2026-09-18
Found: during VALIDATE of the N5 design lane, while diffing the field lists of the two
inventory forms
Status: filed. Fixed incidentally by N5 (D15, the single create/edit modal), and N5 now carries
an explicit criterion and fixture proving it rather than assuming it.

## The chain, verified end to end

1. `/inventory` has **two** forms over the same nine fields: the "Add an item" `<details>`
   (`src/routes/(app)/inventory/+page.svelte:84-179`) and the per-row edit form
   (`:213-321`).
2. The add form has a notes input at `:168`. **The row form has none.** Its ten posted names are
   `id`, `name`, `category`, `quantity`, `unit`, `location`, `status`, `assignedToId`,
   `serialNumber`, `value`.
3. `itemSchema` declares `notes: z.string().max(2000).optional()`
   (`src/routes/(app)/inventory/+page.server.ts:60`). An absent field parses to `undefined`.
4. The `update` action calls `inputOf(parsed.data)` (`:122`).
5. `inputOf` sets `notes: d.notes ?? null` (`:74`).
6. `updateInventoryItem` writes the whole input.

So every row save writes `notes = null`. Not a merge, a full overwrite. Silent, every time.

## Why nothing caught it

`tests/unit/inventory.test.ts` covers `resolveAssignedTo` in the service only.
`tests/e2e/inventory.spec.ts` exercises the row save twice (status at `:43-44`, assignee at
`:48-49`) and asserts neither notes nor any field it did not itself change. A test that only
checks the field it edited cannot see a field being erased beside it.

The drift is invisible by reading either form alone. It shows only when the two field lists are
put side by side, which is what the single-modal merge forced.

## Scope of the damage

None outside development. This app has never been deployed — see
[[no-production-environment]]. What has been erased is dev and seed data.

There is also nothing to restore from: no prior-value audit exists for inventory notes, so any
value already overwritten is gone. Recovering them is not in scope and is not possible.

## The fix

D15 folds both forms into one modal posting all ten fields including `notes`, so the absent-field
path disappears. **N5-AC9** proves it: a fixture item carrying a non-empty notes sentinel, open
the modal, change a *different* field, save, reopen, assert the notes are byte-identical.

**Reverting N5's modal commit reinstates this defect.** That is recorded in the design lane
plan's rollback table, not only here.

## The general lesson

A form that posts a subset of a schema silently nulls the rest when the server rebuilds the whole
input object. Anywhere this app has two forms over one schema, the narrower one is erasing what
it does not send. Worth a sweep — the same shape may exist elsewhere.
