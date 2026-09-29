---
name: note:employees-new-two-column-full-width
description: "Owner feedback 18-09-26 on /employees/new — the hire form is centered in a max-w-3xl column; make it full width and lay the fieldsets out in two columns."
date: 18-09-26
feature: ui-ux-overhaul
---

# employees/new — full width, two columns

Date: 2026-09-18
Source: owner, live on `/employees/new` after the phase 07 S7 split
Surface: `src/routes/(app)/employees/new/+page.svelte`
Status: NOTED, not built. Owner called the page itself good — this is layout only.

## What it is now

Line 78 wraps the whole page:

```
<div class="mx-auto max-w-3xl space-y-6">
```

So the form sits in a centered 48rem column with empty gutters on a wide screen. Inside it,
phase 07's S7 split put seven fieldsets in one vertical stack:

| Group | Fieldset | Inner grid |
|---|---|---|
| Required to hire | Personal Information | `sm:grid-cols-3` |
| | Contact Information | `sm:grid-cols-2` |
| | Account | `sm:grid-cols-2` |
| | Employment Details | `sm:grid-cols-2` |
| Complete later (`<details>`) | Government IDs | `sm:grid-cols-2` |
| | Emergency Contact | `sm:grid-cols-3` |
| | Bank / GCash Details | `sm:grid-cols-2` |

## The ask

Drop the centering, run the page full width, and put the fieldsets in **two columns** instead of
one stack.

## What to settle before building

1. **Which axis is two-column.** Either the fieldsets tile two-up in an outer grid, or each
   fieldset keeps its own inner grid and only the stack splits. The fieldsets already carry
   `sm:grid-cols-2` / `sm:grid-cols-3` inside them, so nesting a two-column outer grid halves
   their width and those inner grids will need their own breakpoint pass. Do not just add an
   outer `lg:grid-cols-2` and call it done.
2. **Where "Complete later" goes.** It is a `<details>` holding three fieldsets, and it opens on
   a server rejection inside it (`optionalHasError`, line 41). A two-column tile that grows on
   open will reflow the column beside it. It may want to stay full width under both columns.
3. **Reading order.** The four required fieldsets are ordered Personal → Contact → Account →
   Employment. A two-column grid fills across, so the visual order becomes Personal/Contact then
   Account/Employment. Tab order follows the DOM and stays correct either way, but confirm the
   owner wants the across-reading rather than two independent columns.
4. **The submit row.** `flex justify-end` with Cancel + Create, currently the width of the
   column. Full width pushes it to the far right edge of the viewport. Decide whether it stays
   full width or tracks the form's content width.

## Consistency

`mx-auto max-w-*` is the shared treatment on ten other routes, including
`recruitment/[id]/apply`, `requests/[id]`, and six `settings/*` pages. Changing only this page
makes it the odd one out. Either accept that — a hire form has far more fields than a settings
panel, which is a real reason — or raise it as a program-wide question about which pages are
centered and which are full width. Not a blocker, but it should be a decision, not a side effect.

## Scope

Markup and classes only. No field added or removed, no validation change, no server change.
`tests/e2e/admin.spec.ts` fills this form and phase 07 already taught it to open the
"Complete later" disclosure first (`545ff2e`), so the spec survives a pure layout change — but
re-run it, since a two-column reflow can move a control out from under its locator.
