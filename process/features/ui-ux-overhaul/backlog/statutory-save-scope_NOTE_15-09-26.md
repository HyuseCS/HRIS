---
name: note:statutory-save-scope
description: "Owner P3 walk 15-09-26: the statutory Save confirm names only which tabs changed, never the edits; owner direction is per-tab save plus an unsaved-changes prompt on tab switch"
date: 15-09-26
feature: ui-ux-overhaul
---

# Statutory save confirm does not show the edits it will save

Owner, during P3 (keyboard walk), 15-09-26, on `http://localhost:5173/payroll/statutory-rates`:

> "You are changing: . Edits on tabs you are not looking at are included." This is an issue on the
> modal. It is not actually listing what edits on the other tabs are going to be saved. [...] If we
> can't display the other edits we should just make the save button save the data on what section the
> user is in and when they switch sections, a warning modal will prompt that there are unsaved changes.

## What it does now (checked live 15-09-26)

- All four tabs submit together through hidden inputs at the bottom of the one form
  (`src/routes/(app)/payroll/statutory-rates/+page.svelte`, `serviceState` / `touchedServices` ~line 101).
- The confirm message lists only the **names** of tabs that changed. Pag-IBIG share cap 200 -> 250, then
  Save from the SSS tab: `You are changing: Pag-IBIG.` No field, no old or new value.
- With no edits, **Save changes is still enabled** and the confirm reads `You are changing: .` That is
  the blank the owner saw. Value put back to 200, nothing saved.
- Same copy on the propose path (`You are submitting: ...`).

## Owner direction

1. Preferred if feasible: the confirm lists the actual edits on every tab (field, was, now).
2. Otherwise: **Save saves only the current tab**, and switching tabs with unsaved edits opens a
   warning dialog (unsaved changes). The page already has a leave guard (`confirmLeaveOpen`) to reuse.

Open question for the fix: the save action and the CEO proposal flow take all four services in one
payload; a per-tab save must send the other three unchanged.

**DONE 15-09-26** in `d3ef7b5`: owner picked "show real edits". The confirm lists every edit (`SSS row 3 EE share: ₱225 → ₱230`), rows by position; Save is off with no edits. Checked live, no rates saved.
