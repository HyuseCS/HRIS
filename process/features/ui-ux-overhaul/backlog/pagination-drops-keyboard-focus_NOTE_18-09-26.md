---
name: note:pagination-drops-keyboard-focus
description: "Paging any list sends keyboard focus back to the top of the document, because the shared Pagination component navigates without keepfocus. Affects every paginated route, not one."
date: 18-09-26
feature: ui-ux-overhaul
---

# Paging a list drops keyboard focus

Date: 2026-09-18
Found: while planning N6 (`/settings/org` Employee Assignments paging) on `feat/uiux-phase-7`
Status: filed, not built. Owner decision D16 — kept out of the N6 lane deliberately.

## What happens

Move keyboard focus to a page link, activate it, and focus is not where the reader left it. The
navigation completes, the new rows render, and focus falls to the document. A keyboard user has to
tab from the top of the page back to the table every time they turn a page.

## Why it is not an N6 bug

`src/lib/components/Pagination.svelte` is one component rendered by every paginated route. Its
`href()` (lines 21-25) copies the current `searchParams` and sets only `meta.param`, so paging is
an ordinary SvelteKit navigation — and SvelteKit resets focus on navigation unless told not to.

N6 adds a second paginated table to `/settings/org`. It does not introduce the behaviour; it
inherits it, along with every route below.

## Who is affected today

Every route that renders `Pagination.svelte` — **19 files across 16 routes**:

`complaints`, `employees`, `inventory`, `leave`, `leave/balances`, `payslips`, `recruitment`,
`reports/audit-log`, `requests`, `requests/approvals`, `requests/proposals`,
`requests/timesheets`, `separations`, `settings/roles`, `team`, plus `/attendance` (three
components) and `/timesheets`.

## The likely fix, and why it is its own item

`data-sveltekit-keepfocus` on the page links inside `Pagination.svelte` (`:33` and `:48`).

**On its own that is not enough.** On page 1 and on the last page the clicked control is not a
link at all — it is a `<span>` (`:40`, `:55`) with no anchor for focus to stay on. So the first
and last page of every list keep the bug after the obvious fix. Whoever takes this must handle
those two cases, not just add the attribute.

The reason it was kept out of the N6 lane is not the size of the change, it is the size of the
check. A shared component that 16 routes render cannot be altered inside a lane that was
reviewed for something else — every route that renders it needs verifying before the change is
done, and that work does not belong to a `/settings/org` ticket. The change also alters
screen-reader route announcements on all 16, which is a behaviour change, not a fix.

It also wants a moment's thought rather than a reflex: `keepfocus` keeps focus on the link that
was activated, which is right for a pager. Whether the same is right when the row count changes
under it is worth checking on a route where paging can empty the current page.

## Verify after

- Tab to a page link on `/employees`, activate it, and confirm focus is still on the pager.
- Repeat on `/timesheets`, which renders two independent pagers on one page.
- Confirm no route relies on the focus reset — a page whose first element steals focus on load
  would now behave differently.

## Related

- `a11y-component-test-harness_NOTE_03-09-26.md` — there is still no component test environment,
  so this can only be proven by an e2e focus walk today.
