---
name: note:dev-seed-missing-finance-payroll-accounts
description: "DevLoginSwitcher offers Payroll Officer and Finance buttons that 404 because prisma/seed-core.ts never creates payroll@veent.ph or finance@veent.ph"
date: 04-09-26
feature: ui-ux-overhaul
---

# DevLoginSwitcher offers two accounts the seed never creates

**Status**: BACKLOG.
**Raised by**: the owner, during the phase 01 manual test pass on 04-09-26, checklist item 4
(FINANCE-only role must not see the Audit Log card).

## What this is

`src/lib/components/dev/DevLoginSwitcher.svelte:34-36` lists three quick-login buttons:

```
{ label: 'Payroll Officer', email: 'payroll@veent.ph' },
{ label: 'Finance', email: 'finance@veent.ph' },
{ label: 'Employee', email: 'employee@veent.ph' }
```

`prisma/seed-core.ts` creates `employee@veent.ph` (see the role-drift note filed alongside this
one) but never creates `payroll@veent.ph` or `finance@veent.ph`. Clicking either of the first two
buttons returns 404 `No such user`.

## What was done to unblock the check

Two accounts (`payroll@veent.ph` holding `PAYROLL_OFFICER`, `finance@veent.ph` holding `FINANCE`)
were inserted directly into the dev database by hand to run checklist item 4. **They are not in
the seed** — the next `pnpm db:seed` (or equivalent reseed) loses them and the same 404 returns.

## Fix

Add both accounts to `prisma/seed-core.ts`, following the same `upsert` pattern used for
`employee@veent.ph`, `manager@veent.ph`, etc. One-line-per-account addition; no schema change
needed.
