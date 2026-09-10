---
title: /settings/roles renders every login with no limit
date: 10-09-26
found: phase 04 feedback-contract manual test pass, section 8 check 1
status: BACKLOG — no phase owns it
---

# `/settings/roles` has no pagination

## What was measured

Driving section 8 check 1 as `admin@veent.ph` on `feat/uiux-phase-4`, the Roles & Access
table rendered **196 `setActive` forms in one page load**. Every login in the organisation
is in the DOM at once. `listOrgUsers(user.organizationId)` in
`src/routes/(app)/settings/roles/+page.server.ts:17` takes no `skip`/`take` and the route
slices nothing.

Each row carries two forms (`setRole` and `setActive`), so the row count is roughly half
the form count and the DOM cost is about double what the user count suggests.

## Why no phase catches it

Phase 07 (`page-splits`) owns "paginate the unbounded lists", but its SC-4 enumerates
exactly three routes — `separations`, `inventory`, and the employee branch of
`complaints`. `/settings/roles` appears in that plan only once, at line 415, in the
settings destination array. It is named for its **IA**, never for its **row count**.

So the list is unbounded, a phase exists that would obviously own it, and that phase's
scope table does not include it. It falls through.

## What the fix looks like

The same shape phase 07 uses for the other three, and it stays out of
`src/lib/server/services/**`, which is out of bounds program-wide:

    const p = paginate(url, users.length, { param: 'upage', pageSize: 20 })
    return { users: users.slice(p.skip, p.skip + p.take), pagination: p, ... }

plus `<Pagination meta={data.pagination} />` under the table. `Pagination.svelte` is
server-fed and self-hides on a single page, so a small organisation sees no change.

A real `skip`/`take` in `listOrgUsers` belongs with the already-filed
`query-level-pagination-unbounded-lists` note, not here.

## Owner's call

Raised by the owner during the pass: "The table here has no limit for some reason. We will
have to add that unless it gets tackled on a future phase." It is not tackled on a future
phase. Either widen phase 07's SC-4 by one route, or take this note as its own change.
