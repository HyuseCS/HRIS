---
name: note:login-auth-hardening
description: "Four pre-existing facts about the login path — timing, auditing, email casing and an unrendered redirect. None is fixed. Each needs an owner ruling or its own plan."
date: 22-09-26
feature: ui-ux-overhaul
---

# Login hardening follow-ons

**Status:** RECORDED, not built.

**Provenance.** D1, D2 and D4 were first written down in the phase 09 branch
(`feat/uiux-phase-9`, PR #18) while building the two-step email-first login. That design was
superseded by the one-step login shipped in `7ef541b`, and PR #18 was closed. These four facts do not
depend on which login design won — all four were re-verified against the shipped
`src/routes/(auth)/login/+page.server.ts` on 2026-09-22. The two phase-09-only items from that note
(the `?/resolve` step-1 read and its probe channel) are dropped: the action they described no longer
exists.

## D1 — no bcrypt runs on an unknown email

`+page.server.ts:42-47` returns 401 before `bcrypt.compare` when `findUnique` yields null, and
likewise when `isActive` is false. A known email costs a bcrypt round; an unknown one does not. That
difference is measurable from outside.

The standard fix is a dummy `bcrypt.compare` against a fixed hash on the miss path.

## D2 — no audit row on the unknown or inactive path

A `LOGIN_FAILED` row is written only when the user exists (`+page.server.ts:49-64`). Spraying
passwords at a list of non-accounts leaves no audit trail at all; only the in-memory rate limiter
sees it, and that resets on restart.

## D3 — the email-case mismatch

`db.user.findUnique({ where: { email } })` uses the raw submitted string (`+page.server.ts:40`)
while `rateKey` uses `email.toLowerCase()` (`:30`). A `User.email` stored with capitals is therefore
unreachable by its lowercase form, yet both spellings share one rate-limit bucket.

`User.email` is `@unique` **globally** (`prisma/schema.prisma:403`), so a case-normalising fix is
safe in principle — but it changes *who can log in*, so it needs an owner ruling and a data check
first.

## D4 — `/login?error=account_disabled` renders nothing

`src/hooks.server.ts:45` redirects a deactivated user to `/login?error=account_disabled`. The login
page reads `form?.error` only (`+page.svelte:30`) and never looks at the query string, so the person
lands on a blank login form with no explanation of why they were signed out.

---

Fixing D1 and D3 together is the natural next auth-hardening pass. D4 is independent and small.
