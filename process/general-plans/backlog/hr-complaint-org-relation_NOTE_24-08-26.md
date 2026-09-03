---
name: note:hr-complaint-org-relation
description: "HrComplaint.organizationId is a bare scalar with no Prisma relation, unlike ~25 other org-scoped models (#112 SPEC out-of-scope)"
date: 24-08-26
feature: hr-complaints-112
---

# Known gap — HrComplaint.organizationId has no relation

`HrComplaint.organizationId` (added by the #112 cherry-pick, commit `0223acf`) is a bare
`String` scalar field, not a Prisma relation to `Organization`. Roughly 25 other org-scoped
models in `prisma/schema.prisma` declare a real `@relation` for the equivalent field.

This is not a correctness bug today — every query against `HrComplaint` already filters on
`organizationId` explicitly (that scoping is what #112 closed). It is an inconsistency: no
`onDelete` behavior is declared, and Prisma cannot validate the foreign key at the type level
the way it does for the ~25 relation-backed models.

## Fix option

Add `organization Organization @relation(fields: [organizationId], references: [id])` to
`HrComplaint`, plus the back-relation on `Organization`. Additive, no data migration needed
since the scalar column already exists and is already populated correctly. Decide the
`onDelete` policy (likely `Cascade`, matching sibling org-scoped models) before shipping.

## Priority

Low. SPEC #112 explicitly listed this as out of scope — "every current query already filters
on it correctly once the employee-scoped list bug is fixed."
