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

---

## Update — phase 10 (`container-bounds`), 04-09-26

Phase 10 bounded roughly twenty containers that had no ceiling of any kind. It did **not** close
this note, and the split matters.

### What phase 10 absorbed

The umbrella's `src/lib/server/services/**` hard stop was lifted narrowly, for three functions:

| Function | What it gained | Where the cut lands |
|---|---|---|
| `listUpcomingEvents` (`dashboard.ts`) | optional `limit` | the merged sorted output, at the return |
| `listUpcomingRegularizations` (`dashboard.ts`) | optional `limit` + `orderBy: { startDate: 'asc' }` | **after the JS days-until sort** |
| `listPostingsAwaitingApprover` (`recruitment.ts`) | optional `limit` | after the approver filter |

**None of the three is a query cap.** Every one is a JS slice, so the database still returns every
row for all three. The query cost of the dashboard is unchanged.

`listUpcomingRegularizations` deserves a line of its own. The plan intended a query `take` on the
new `orderBy`, and validation proved that unsafe: `regularizationDate = addUTCMonths(startDate, 6)`
and `setUTCMonth` overflows rather than clamps, so `2025-08-31` regularizes on `2026-03-03` while
`2025-09-01` regularizes on `2026-03-01`. Start-date order is not days-until order across any
31-day-month → February boundary, and the 21-day notice window straddles exactly that. The `orderBy`
stayed for query determinism but nothing may be capped off it. `tests/unit/container-bounds.test.ts`
G3b is the negative control.

### What phase 10 did NOT absorb

- **Every other container is a render cap or a CSS ceiling.** `/employees/[id]` (eight panels),
  `/team`, `/benefits`, `/performance`, `/payroll/[id]`, `/profile`, `/settings/*` and the
  config-scale tables all still fetch every row. The page renders 25 or scrolls inside a box; the
  query is untouched.
- **`/leave/balances` is scroll-only, by ruling.** It is the view-all destination for `/leave`, so a
  cap there would drop rows nobody can otherwise reach. It still needs real `skip`/`take` + `count`
  — the honest fix — and that is the single most valuable item in this note.
- **`/benefits` enrolments would be `take`-safe.** `listAllEnrollments` (`benefits.ts:115-123`)
  already carries `orderBy: [{ status: 'asc' }, { effectiveDate: 'desc' }]`, so a `take` there
  would be order-correct. It was left to markup only because the phase-10 service lift named three
  dashboard functions and not this one.
- **The three phase-07 route loads** (`separations`, `inventory`, employee-side inquiries) are
  untouched by phase 10 and remain exactly as described above.

### Functions that must NOT gain a query cap

Recorded so a later pass does not undo phase 10's reasoning. Each is pinned by
`tests/unit/container-bounds-scan.test.ts`:

- `listEmployeeDocuments` as called from `employees/[id]/+page.server.ts:141` — the array is fed to
  `getEmployeeOnboarding` as `documents.map((d) => d.category)`; a cap makes the onboarding
  checklist claim a step is outstanding when its document exists.
- the `/team` members `findMany` — reused for the attendance fetch and the attendance map; a cap
  reads as missing attendance data, not as a cap.
- `getEmploymentHistory` — its events are DERIVED by diffing tracked fields per audit row, and a row
  that changed nothing yields no event, so `take: N` returns fewer than N events, unpredictably.
- `listStalledSignoffs` (`performance.ts:824-844`) — no `orderBy`, and it post-processes through
  `Promise.all` + a filter. The `listUpcomingRegularizations` trap again.
- every roster picker `<select>` — see `roster-select-typeahead_NOTE_04-09-26.md`.
