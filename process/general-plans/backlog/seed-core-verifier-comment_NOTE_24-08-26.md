---
name: note:seed-core-verifier-comment
description: "Stale comment at prisma/seed-core.ts:676 claims sign-off accounts have no Employee record; ensureEmployeeProfile actually creates one (#112 finding, cosmetic)"
date: 24-08-26
feature: hr-complaints-112
---

# Known gap — stale comment in prisma/seed-core.ts

A comment near `prisma/seed-core.ts:676` claims the sign-off accounts (e.g.
`verifier@veent.ph`) have no `Employee` record. That is no longer true:
`ensureEmployeeProfile` at `:701-714` creates one for each of them (e.g. Vince Verifier,
`EMP-901`, `employmentStatus` defaults `ACTIVE`) — which is precisely why
`verifier@veent.ph` was usable as the Gate E out-of-scope target for #112.

## Fix option

Update or delete the stale comment to reflect that `ensureEmployeeProfile` runs for these
accounts.

## Priority

Cosmetic. Found during #112's Gate E research; explicitly left alone in that PR per scope
discipline (do not touch adjacent code).
