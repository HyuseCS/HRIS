---
name: note:settings-org-employee-assignments-pagination
description: "Owner feedback 18-09-26 on /settings/org — the Employee Assignments table renders every assignable employee unpaginated. Paginating it collides with its client-side search and only-unassigned filters."
date: 18-09-26
feature: ui-ux-overhaul
---

# settings/org — paginate Employee Assignments

Date: 2026-09-18
Source: owner, live click pass on 18-09-26
Surface: `src/routes/(app)/settings/org/+page.svelte` (356 lines), `+page.server.ts` (145)
Status: NOTED, not built.

Same pass, for the record: **`/complaints` needs no changes.** Owner called it good as is.

## W1 — the table is unbounded

`+page.server.ts` line 19-26 loads `listAssignableEmployees(user.organizationId)` with no
`skip`/`take`, and the page renders all of it:

```svelte
{#each filteredEmployees as emp (emp.id)}
```

Every row carries its own assignment form and a `<select>` over every position in the catalog, so
the cost per row is not small. Phase 07 paginated `separations`, `inventory` and employee-side
`complaints` but did not touch this table.

## W2 — the collision that has to be settled first

The two filters above the table are **client-side**, lines 38-45:

```ts
const filteredEmployees = $derived.by(() => {
    const q = search.trim().toLowerCase()
    return data.employees.filter(
        (e) =>
            (!onlyUnassigned || !e.positionId) &&
            (q === '' || e.name.toLowerCase().includes(q) || e.jobTitle.toLowerCase().includes(q))
    )
})
```

`paginate()` in `src/lib/server/pagination.ts` is server-side and takes a total. So the two cannot
simply be stacked: server pagination over an unfiltered query means page 2 holds employees the
filter would have excluded, and the "Showing N of M" counter stops meaning anything.

Three ways out:

| # | Approach | Cost |
|---|---|---|
| A1 | move `search` and `onlyUnassigned` into the query string and filter in the load, then paginate | filters become a GET round trip; loses the instant typing feel |
| A2 | keep both client-side and paginate the filtered array in the component | no server change, but the whole list still ships to the browser — it bounds the DOM, not the payload |
| A3 | `paginate()` server-side, keep the client filters as a within-page refinement | cheapest, and wrong: the filter would only ever search the current page |

A3 is a trap. A1 is what `separations` and `inventory` already do in spirit. A2 is the smallest
diff and honest about what it fixes. Owner picks — the question is whether the complaint is
"the page is too long to scroll" (A2 is enough) or "loading every employee is slow" (A1).

## W3 — reuse what exists

- `paginate(url, total, { param, pageSize })` — give it a distinct `param`, since this page may
  later paginate its Positions table too and `page` would then be ambiguous.
- `fitPageSize(cookies, { rowPx, chromePx })` sizes a page to the viewport from the `vp` cookie,
  which is what `complaints` uses.
- `src/lib/components/Pagination.svelte` renders the control. Note the path — it is in
  `components/`, not `components/ui/`.

## W4 — related open item

`query-level-pagination-unbounded-lists_NOTE_03-09-26.md` records that the three lists phase 07
paginated still fetch everything and slice in the load, because real `skip`/`take` needs service
signature changes the overhaul declared out of bounds. If this table goes the A1 route it inherits
that same limit against `listAssignableEmployees`. Settle both together or neither.

## Scope

A2 is markup only. A1 touches the route load and the service call, which is beyond what the
UI/UX overhaul allowed itself — it needs its own plan.
