---
name: note:query-level-pagination-unbounded-lists
description: "Separations, inventory and employee-side complaints paginate by slicing a full fetch in the route load. Real skip/take needs service-layer signature changes the UI/UX overhaul declared out of bounds."
date: 03-09-26
feature: ui-ux-overhaul
metadata:
  node_type: memory
  type: references
  feature: ui-ux-overhaul
  phase: phase-07
---

# Query-level pagination for the unbounded lists

**Raised by:** phase 07 (page splits), section S7 / SC-4. Recorded residual from the plan's
Known Gaps table — the vacuous-green ban requires it to exist, not to be silently dropped.

## What phase 07 shipped

`separations`, `inventory` and the employee branch of `complaints` now render a page at a time:

- `src/routes/(app)/separations/+page.server.ts` — `paginate(url, rows.length, { pageSize: 20 })`
- `src/routes/(app)/inventory/+page.server.ts` — `paginate(url, rows.length, { pageSize: 20 })`
- `src/routes/(app)/complaints/+page.server.ts` (employee branch) —
  `paginate(url, rows.length, { param: 'myPage', pageSize: 10 })`

Each one keeps the existing service call, then **slices the already-fetched array**.

## What is still open

This fixes the **UI wall** — an unbounded table that grows without a next/previous control. It does
**not** fix the **query cost**: the load still fetches every row before slicing. At 10k rows the
page renders 20 and the database still returns 10k.

## Why it was not fixed in phase 07

`src/lib/server/services/**` is out of bounds for the whole UI/UX overhaul program (umbrella
Touchpoints). Real `skip`/`take` needs signature changes in:

- `listSeparations`
- the inventory query (`listInventory`)
- `listComplaintsForEmployee`

…each of which needs a matching `count` call so an out-of-range `?page=` can clamp to the real last
page (the pattern `complaints`' HR branch already uses with `countComplaintsForOrg`).

## Resolution

Route through a service-layer issue. Not a UI phase.
