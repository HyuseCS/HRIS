---
name: note:bulk-timesheet-skipped-counter
description: "approveMany / rejectMany returned a green success string even when every row failed — RESOLVED in bb7eb28"
date: 10-09-26
feature: ui-ux-overhaul
status: RESOLVED — shipped in bb7eb28, 10-09-26
---

# Bulk timesheet `skipped` counter returns success for a total failure

Found while wiring the bulk actions onto `submitFeedback` (§2 of the B2/B3/B5 feedback plan).
**Was: not fixed, out of scope, unruled. RESOLVED 10-09-26 — see `## Resolution` below.**

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

No GitHub issue filed, then or now.

## Resolution

Shipped 10-09-26 in `bb7eb28`, `fix(timesheets): report a failed bulk review as a failure`, under
`process/general-plans/completed/roles-pagination-and-bulk-allfail_10-09-26/`. The owner's ruling:

- **All-fail → `fail(400)`.** The gate shipped as the plain `if (done === 0)`. An
  "attempted > 0" clause was planned and then dropped: the `!ids.length` guard already returns
  before the loop, so it could never be false.
- **Any success → the existing green string, unchanged**, skipped count included. A partial batch
  stays green — this note's "warning kind" idea for partials was not built.
- **No new toast kind.** `ToastKind` gained no member; `--warning` is still unmapped in
  `tailwind.config.ts` — that gap is GitHub issue #27, explicitly not this change.
- **No per-row detail** in the failure message.
- The identical pattern at `src/routes/(app)/leave/+page.server.ts:107-118` was **deliberately
  left alone** — an owner ruling, not an oversight. No issue filed for it either.
