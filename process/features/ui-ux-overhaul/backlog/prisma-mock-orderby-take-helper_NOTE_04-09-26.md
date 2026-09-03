---
name: note:prisma-mock-orderby-take-helper
description: "The repo's Prisma mock applies `where` and ignores `orderBy` and `take`, which makes any cap assertion written on it vacuous. Phase 10 built a where -> orderBy -> take -> project client locally; promote it to a shared helper."
date: 04-09-26
feature: ui-ux-overhaul
metadata:
  node_type: memory
  type: references
  feature: ui-ux-overhaul
  phase: phase-10
---

# Promote the where → orderBy → take Prisma mock to a shared helper

**Raised by:** phase 10 (`container-bounds`), test-infra gap found at plan time and confirmed at
execution time.

## The gap

`tests/unit/dashboard-org-scoping.test.ts:110-130` mocks the client as:

```ts
dbMock.employee.findMany.mockImplementation(async ({ where }) => EMPLOYEES.filter((e) => matches(e, where)))
```

`orderBy` and `take` are destructured away and never read. That is correct for what that file
tests — org scoping — but any **cap** or **ordering** assertion written on the same shape passes
whether or not the service caps or orders anything. It is the vacuous-green shape, one level down:
the mock cannot fail.

## What phase 10 built

`tests/unit/container-bounds.test.ts` carries a local client that applies, in this order:

1. `where` (equality, `in`, and `gte`/`lte` on dates)
2. `orderBy` (single key, asc/desc)
3. `take`
4. `select` projection, unwrapping a relation's nested `select`

Order is the point: filter, sort, cut, narrow — the order Postgres applies them. Its fixtures are
declared deliberately out of the expected output order, so a service that drops its ordering
returns the wrong rows and the test goes red. Four RED mutations were run against it and all four
behaved as designed.

## The ask

Move that client to a shared test helper (e.g. `tests/unit/helpers/prisma-mock.ts`) and have the
next service-cap test import it rather than re-deriving a `where`-only mock. Two things it still
does not do, and a helper should say so in its own header:

- one `orderBy` key only, no arrays and no nested relation ordering
- nothing about SQL — it proves the service's logic given a client that honours the arguments, not
  that Postgres orders identically or that `take` is pushed down

Not done in phase 10 because a shared test helper is test infrastructure outside a bounding phase's
blast radius.
