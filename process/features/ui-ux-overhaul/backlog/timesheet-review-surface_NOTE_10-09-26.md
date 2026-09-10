---
title: Timesheet review — duplicate message, off-system Approve button, Reject ellipsis
date: 10-09-26
found: phase 04 feedback-contract manual test pass, section 8 check 2
status: BACKLOG — three owner rulings recorded, none built
---

# Three findings on `/requests/timesheets` and its review modal

## T1 — a review outcome is reported twice

`src/routes/(app)/requests/timesheets/+page.svelte:66-72` renders a `<Banner>` for
`form?.error` and another for `form?.saved`. The modal's guard is a `submitFeedback`, and
`?/review` returns `saved: 'Timesheet approved.' | 'Timesheet rejected.'`, so the toast
fires for the same outcome. Two messages, one action.

**Owner ruling: remove the banner, keep the toast.** Same call as F3 on the recruitment
posting page (`661719d`) and the same call as the `/settings/roles` note filed alongside
this one.

**Check before deleting** — this page has bulk actions (`approveMany`, and a bulk reject)
as well as the modal. Confirm every one of them routes through a toast helper before the
banner goes, or they lose their only voice. That exact mistake has been made here before;
see the `removing-a-banner-can-silence-errors` lesson.

## T2 — the modal's Approve button is not on the design system

`src/lib/components/timesheets/TimesheetModal.svelte:566`

    class="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 …"

A solid saturated fill with white text. Nothing in `app.css` produces that. The system's
action styles are `.btn-primary` / `.btn-secondary` / `.btn-ghost` (token-driven) and the
`.btn-row-*` family (bordered, tinted, theme-aware). Its own sibling, Reject, is a
bordered tint — so the two buttons in one footer come from two different visual languages.

The owner's words: "it looks kinda nice but it doesn't match."

It is a hand-rolled cluster of four, not a one-off, and they should move together:

| File | Line |
|---|---|
| `src/lib/components/timesheets/TimesheetModal.svelte` | 566 |
| `src/routes/(app)/requests/timesheets/+page.svelte` | 105 |
| `src/routes/(app)/requests/proposals/+page.svelte` | 201 |
| `src/routes/(app)/recruitment/applicant/[applicantId]/+page.svelte` | 320 |

`.btn-row-positive` is the existing token for an affirmative action and is already used
this way on the recruitment board tiles. Note it is `text-xs` at row scale — a modal
footer button may want a larger sibling token rather than a size override at the call
site.

## T3 — drop the ellipsis from "Reject…"

`TimesheetModal.svelte:559`. Owner: remove the "…".

For the record, the ellipsis is the platform convention for a control that opens a further
prompt, and this one does open `ReasonDialog`. The owner has made the call anyway, so it
is a label change, not a behaviour change. `ReasonDialog`'s own confirm button already
reads plain "Reject".
