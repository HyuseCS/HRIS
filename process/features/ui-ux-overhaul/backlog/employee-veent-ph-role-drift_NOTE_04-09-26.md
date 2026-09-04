---
name: note:employee-veent-ph-role-drift
description: "prisma/seed-core.ts seeds employee@veent.ph with roles: ['EMPLOYEE'] but the dev DB copy holds PAYROLL_OFFICER; upsert's update: {} means a reseed never corrects it"
date: 04-09-26
feature: ui-ux-overhaul
---

# `employee@veent.ph` role drift between seed source and the dev DB

**Status**: BACKLOG.
**Raised by**: the owner, during the phase 02 manual test pass on 04-09-26 (per-role nav live
check). The plain-employee lane had to use `benjie@jojo.ph` instead of the intended
`employee@veent.ph`.

## What this is

`prisma/seed-core.ts:773-779` seeds `employee@veent.ph` with `roles: ['EMPLOYEE']`. The live dev
database copy of that same account currently holds `PAYROLL_OFFICER`, not `EMPLOYEE`.

## Likely root cause

The seed's upsert uses `update: {}`:

```ts
const employeeUser = await db.user.upsert({
	where: { email: 'employee@veent.ph' },
	update: {},
	create: { ... roles: ['EMPLOYEE'] }
})
```

`update: {}` means an **already-existing** row is left completely untouched on reseed — only a
brand-new row gets `roles: ['EMPLOYEE']`. If this account's role was ever changed by hand or by a
test run, a fresh `pnpm db:seed` will not correct it back. This is a general shape, not specific
to this account: any seeded user whose role drifted once will drift forever until someone patches
the row directly.

## Fix options (not decided here)

1. Add `roles: ['EMPLOYEE']` to the `update` object too, so a reseed is idempotent and
   self-healing.
2. One-off `UPDATE "User" SET roles = '{EMPLOYEE}' WHERE email = 'employee@veent.ph'` on the dev DB
   to fix this instance, without touching the seed's general upsert pattern.

Whichever is picked, note that fixing only this one account leaves the general `update: {}`
pattern in place for every other seeded user.
