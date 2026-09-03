---
name: note:complaint-filter-intersection-sql
description: "The employeeId + employeeIds AND-intersection in complaintWhere (#112 T9) is type-verified and object-verified only, never SQL-verified — revisit when filters.employeeId gets its first caller"
date: 24-08-26
feature: hr-complaints-112
---

# Known gap — AND intersection unreachable at runtime, unverified in Postgres

`complaintWhere` in `src/lib/server/services/complaints/index.ts` builds
`...(filters.employeeId && { employeeId: filters.employeeId })` and, separately,
`...(filters.employeeIds && { AND: [{ employeeId: { in: filters.employeeIds } }] })` so the
two predicates **intersect** rather than one overwriting the other on a collided key. This is
the first use of `AND: [...]` in this repo's Prisma queries (`grep -rn "AND: \[" src/` was
zero hits before #112).

Test N17 (`tests/unit/complaints-scoping.test.ts`) proves the built `where` **object** carries
both predicates correctly, and the shape was independently confirmed to type-check against
the real `Prisma.HrComplaintWhereInput` (`tsc --noEmit --strict`, exit 0). Neither proves
Postgres actually executes the intersection correctly, because `filters.employeeId` currently
has **zero callers** — no code path ever supplies both fields at once, so the query is never
actually run with this shape.

## Fix option

When `filters.employeeId` gets its first real caller (a route or service that filters the
complaints list to one specific employee AND scopes by `visibleIds` at the same time), add a
live/integration assertion — or at minimum a test against a real Postgres connection — proving
the two predicates genuinely intersect rather than the last one silently winning.

## Priority

Low — accepted residual. The path is unreachable today; this note exists so the gap is not
forgotten the day it becomes reachable.
