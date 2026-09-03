---
name: note:login-email-first-tenant-privacy
description: "Owner ruled 2026-09-03 that login step 1 becomes email-first (option C) — a definite future build in a new auth-flow plan, NOT part of the UI/UX overhaul program."
date: 03-09-26
feature: ui-ux-overhaul
---

# Login step 1 stops listing every tenant — email-first

**Status:** NEW PLAN REQUIRED. Owner decision taken 2026-09-03. Not built in phase 08.

## What is wrong today

`src/routes/(auth)/login/+page.server.ts` `load` reads **every** `Organization` row and
`src/routes/(auth)/login/+page.svelte` renders them as buttons to any anonymous visitor. That is the
full customer list on a public, unauthenticated page.

## What the owner chose

**Option C — email-first.** Step 1 asks for the email address. The server resolves which org(s) that
email belongs to, then either goes straight to the password step (one org) or shows only that
person's orgs (more than one). The generic `'Invalid email or password'` response is kept for an
email that matches nothing, so removing the org list does not open a new enumeration oracle at the
account level.

The owner rejected: A (do nothing), B (per-tenant login URLs — needs URL distribution), and did not
ask for D (C plus a rate limit on the org-resolution step) at this time. D remains the obvious
follow-on hardening if the resolution step turns out to be a timing channel.

## Why it is not in phase 08

Phase 08 is copy and accessibility. This changes an **authentication flow**:

- `loginSchema` currently *requires* `selectedOrg`; email-first removes that requirement from step 1.
- The rate-limit key shape is `${ip}:${email}` and would now be read at a step where the password is
  not yet known.
- The audit rows written on login change shape.
- It re-opens the #135 two-step design the owner specified.
- Real usability cost: a person who cannot remember their workspace currently recovers by reading
  the list. Email-first has to answer that case.

Phase 08 therefore changed **only the comment wording** on that query
(`(auth)/login/+page.server.ts`). The query, `loginSchema` and the flow are byte-untouched, and
phase 08's AC5/AC20 assert that absence.

## Scope for the new plan

- Feature scope: **auth flow**, not `ui-ux-overhaul`.
- Files: `(auth)/login/+page.server.ts`, `(auth)/login/+page.svelte`, `loginSchema`, the login rate
  limiter, the login audit rows, `tests/e2e/auth.spec.ts` and any tenancy-switch spec that drives the
  two-step picker.
- Must preserve: the generic credential message (non-enumeration), the multi-org case, and the
  existing audit trail.
- Open question for that plan: what a person sees when their email belongs to no org — it must be
  indistinguishable from a wrong password.
