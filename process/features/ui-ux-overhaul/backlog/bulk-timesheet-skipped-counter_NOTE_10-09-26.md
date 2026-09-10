---
name: note:bulk-timesheet-skipped-counter
description: "approveMany / rejectMany return a green success string even when every row failed — owner has not ruled"
date: 10-09-26
feature: ui-ux-overhaul
---

# Bulk timesheet `skipped` counter returns success for a total failure

Found while wiring the bulk actions onto `submitFeedback` (§2 of the B2/B3/B5 feedback plan).
**Not fixed. Out of scope. The owner has not ruled on it.**

`approveMany` (`src/routes/(app)/requests/timesheets/+page.server.ts:133`) and `rejectMany`
(`:165`) swallow every per-row exception into a `skipped` count and always return `saved`.

A batch where all five rows fail returns:

```
Approved 0 timesheets, 5 skipped.
```

That is a `saved` string, so it renders as a **green success** — a success surface for a total
failure. §2 wires the existing string to a toast verbatim, which makes the wrong colour more
visible but does not create it.

Fixing it means deciding what a partial batch *should* return (all-fail → `fail()`? partial →
warning kind? per-row detail?). That is a product decision, not a feedback-contract decision.

No GitHub issue filed — do not open one without asking.
