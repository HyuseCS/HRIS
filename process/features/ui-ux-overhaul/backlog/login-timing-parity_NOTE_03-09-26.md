---
name: note:login-timing-parity
description: "Five pre-existing or newly-recorded facts about login timing, auditing and email casing, found while building phase 09. None is fixed by phase 09; each needs an owner ruling or its own plan."
date: 04-09-26
feature: ui-ux-overhaul
---

# Login timing and enumeration economics

**Status:** RECORDED, not built. Phase 09 was explicitly scoped away from all of this (binding
rulings 4 and 6). This note exists so a later auth-hardening pass has the facts instead of
rediscovering them.

## D1 — no bcrypt runs on an unknown email

`?/signin` returns 401 before `bcrypt.compare` when `findUnique` yields null, and likewise when
`isActive` is false. A known email costs a bcrypt round; an unknown one does not. That difference is
measurable from outside.

**Pre-existing.** Phase 09 did not widen it and did not narrow it: `resolveLoginOrgs` runs on both
the hit and the miss branch, before the user check, so the *difference* between the two is unchanged.

The standard fix is a dummy `bcrypt.compare` against a fixed hash on the miss path.

## D2 — no audit row on the unknown or inactive path

A `LOGIN_FAILED` row is written only when the user exists. Spraying passwords at a list of
non-accounts leaves no audit trail at all; only the in-memory rate limiter sees it, and that resets
on restart.

## D3 — the step-1 resolution read

Phase 09 adds one `findUnique` per submitted email at `?/resolve`. The **response** is provably
identical for every email — one shape, gated by `tests/unit/login-resolution.test.ts` U1 — but the
wall-clock time is not: a hit loads memberships, a miss does not.

The owner declined option D (a rate limit on the resolution step) on 2026-09-03. It stays the named
follow-on in `login-email-first-tenant-privacy_NOTE_03-09-26.md`.

## D4 — the email-case mismatch

`db.user.findUnique({ where: { email } })` uses the raw submitted string
(`(auth)/login/+page.server.ts:55` before phase 09) while `rateKey` uses `email.toLowerCase()`
(`:45`). A `User.email` stored with capitals is therefore unreachable by its lowercase form, yet both
spellings share one rate-limit bucket.

`User.email` is `@unique` **globally** (`prisma/schema.prisma:403`), so a case-normalising fix is
safe in principle — but it changes *who can log in*, so it needs an owner ruling and a data check
first. Phase 09's `resolveLoginOrgs` matches the existing behaviour exactly so the two lookups always
agree.

## D5 — the `?/resolve` probe channel is new and cheaper

Recorded as validate-contract concern C4, and it corrects an overclaim in the phase 09 plan.

`?/resolve` is a **new unauthenticated, un-rate-limited, un-audited per-email DB read**. The response
is provably identical for every email (U1), so no oracle exists in what the caller reads back — but
the probe itself is cheaper than it used to be. Before phase 09, an enumeration attempt had to POST a
password: it burned a rate-limit slot and, for a real account, wrote a `LOGIN_FAILED` row. Now it
does neither.

Option D remains the named follow-on; the owner declined it on 2026-09-03. This is an honest
description of a settled trade-off, not a request to revisit it.

---

Fixing D1 and D4 together is the natural next auth-hardening pass, alongside option D from
`login-email-first-tenant-privacy_NOTE_03-09-26.md`.
