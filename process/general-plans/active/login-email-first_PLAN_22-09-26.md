---
name: plan:login-email-first
description: "Remove the public tenant list from the login page (OWNER-DECISION-1). One-step credential login; the session lands in the user's home org and multi-org members use the existing switcher."
date: 22-09-26
metadata:
  node_type: memory
  type: plan
---

# Login stops listing every tenant — one-step credential login

**Date**: 22-09-26
**Status**: ACTIVE — planned, not started
**Complexity**: SIMPLE (one session, 2 source files + 5 test files, 1 commit)

**TL;DR** — `(auth)/login` renders every `Organization` row as a button to any anonymous visitor.
Delete the step. Login becomes one form (email + password); the session's `currentOrgId` is the
user's own `organizationId`; multi-org members switch with the sidebar switcher that already exists.

## Owner decision

OWNER-DECISION-1 in `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-08-copy-a11y_PLAN_03-09-26.md`.
Owner granted 2026-09-22: remove the list.

**Divergence from the recorded option C, orchestrator call 22-09-26.** Option C kept two steps and
resolved orgs from the email *before* the password. That creates a new account-enumeration oracle at
step 1 — the exact class of leak the change exists to close. This plan removes the org step outright
instead. It is strictly less code and has no pre-password resolution to leak. Superseded note:
`process/features/ui-ux-overhaul/backlog/login-email-first-tenant-privacy_NOTE_03-09-26.md`.

**Precondition verified (not assumed).** Every e2e `login()` call already targets the caller's own
home org — `jojoManager`/`benjie@jojo.ph` are seeded into `org_jojo`, and the only non-default CEO
call passes `'Veent'`, which is `ceo@veent.ph`'s `organizationId` (`prisma/seed-core.ts:463-478`).
No test, and no seeded account, ever logs in to an org that is not its primary. The picker was
selecting a value the server could already derive.

## Goals

1. An anonymous visitor to `/login` sees no organization name.
2. A valid credential signs in with no org choice.
3. A multi-org member lands in their home org and reaches the others through the sidebar switcher.
4. The generic `'Invalid email or password'` response is unchanged for every failure path.
5. The login audit trail keeps the same two rows with the same shape.

## Out of scope

- `DevLoginSwitcher` removal (OWNER-DECISION-2 — owner deferred it to last).
- Rate-limit changes. The key stays `${ip}:${email.toLowerCase()}`, read at the same step it is read
  today (the credential POST), so option D is neither needed nor opened by this plan.
- `src/lib/server/rate-limit.ts`, `src/lib/server/auth.ts`, `hooks.server.ts`, the org-switcher API.
- Prisma schema, seeds, RBAC.

## Steps

### S1 — server (`src/routes/(auth)/login/+page.server.ts`)

1. Drop `selectedOrg` from `loginSchema` and its comment block.
2. Delete the `db.organization.findMany` query in `load`; `load` returns nothing but its
   `locals.user` redirect.
3. Delete the `isMember` lookup (`db.userOrganization.findUnique`) and its comment. Membership is no
   longer a user-supplied claim — the org comes from the user row.
4. `if (!validPassword)` replaces `if (!validPassword || !isMember)`. The LOGIN_FAILED audit row and
   `recordFailure` are unchanged.
5. `lucia.createSession(user.id, { currentOrgId: user.organizationId })`. Update the comment to say
   a multi-org user starts in their home org and switches.
6. The LOGIN audit row's `organizationId` becomes `user.organizationId`.

**Preserve byte-for-byte:** the rate-limit block, both `#5 deliberately NOT transactional` comments,
the `Promise.all` pairing, the cookie `path: '.'` set, and every `'Invalid email or password'`
string.

### S2 — page (`src/routes/(auth)/login/+page.svelte`)

7. Delete the `{#if !selectedOrg}` step-1 branch, the `selectedOrg` state, the `Change` button, the
   `<input type="hidden" name="selectedOrg">`, and the two-step `#135` comment.
8. The card renders the credential form unconditionally. `<h1>` becomes `Sign in`; the sub-line
   becomes `Enter your work credentials to continue`. The brand block, the `role="alert"` error box
   (phase 08 item 40) and the footer are untouched.
9. `data`/`PageData` is no longer read — remove it from `$props()` if nothing else uses it.
10. `DevLoginSwitcher` stays (OWNER-DECISION-2).

### S3 — tests

11. `tests/e2e/helpers.ts`: delete `selectTenant` and its doc comment; `login(page, user)` loses the
    `org` parameter and the `selectTenant` call.
12. Drop the now-invalid third argument at every caller: `tests/e2e/tenancy-switch.spec.ts:15`,
    `tests/e2e/branches.spec.ts:25,62,84`, `tests/e2e/attendance-csv-import.spec.ts:63`,
    `tests/e2e/timesheet-punch-location.spec.ts:72`.
13. `tests/e2e/auth.spec.ts`: remove the `selectTenant` import and both calls. **Delete** the test
    `valid credentials against the wrong tenant are rejected` — the mechanism it guards no longer
    exists, so keeping it would be a test that cannot fail. Replace it with the gate in step 14.
14. **New gate, `tests/e2e/auth.spec.ts`:** on an anonymous `GET /login`, the Email field is visible
    with no interaction, and `JoJo Potato` and `Sweetleaf` each have count 0 on the page. Both
    seeded tenant names; neither is the brand word, so the assertion is not vacuous.
15. `tests/unit/login-audit.test.ts`: drop `body.set('selectedOrg', ORG)`. Add one assertion to the
    successful-login test that `dbMock.userOrganization.findUnique` was not called — the user's org
    is read from the user row, never from the form.
16. `tests/e2e/tenancy-switch.spec.ts`: update the `Land in Veent (the CEO picks a tenant…)` comment
    to say the CEO lands in their home org. The switcher assertions are unchanged — this spec is the
    proof that goal 3 holds.
17. Grep `selectTenant`, `selectedOrg`, `Choose your company`, `Select a workspace` repo-wide; zero
    matches outside this plan's own files and the superseded backlog note.

### S4 — the backlog note

18. Mark `process/features/ui-ux-overhaul/backlog/login-email-first-tenant-privacy_NOTE_03-09-26.md`
    **RESOLVED 22-09-26**, one line at the top naming this plan and the divergence. Do not rewrite
    the body — it is the record of what was decided on 03-09-26.

## Gates

Run in CI order.

| Gate | Command | Proves |
|---|---|---|
| G1 | `bun run format:check` | CI runs format first |
| G2 | `bun run lint` | |
| G3 | `bun run check` | `PageData` no longer carries `orgs`; no dead import |
| G4 | `bun run test` | login-audit units, step 15 |
| G5 | `bun run test:e2e tests/e2e/auth.spec.ts` | steps 13-14 |
| G6 | `bun run test:e2e tests/e2e/tenancy-switch.spec.ts` | goal 3 — multi-org still reachable |
| G7 | `bun run test:e2e tests/e2e/branches.spec.ts tests/e2e/attendance-csv-import.spec.ts` | the non-Veent tenant logins still land in the right org |

Select e2e specs **by file path**, never `-g` (phase 08 plan, §S2 section gate).

### Mutation checks (both must go RED, then be restored)

- **M1.** Re-add an `orgs` list render to the login page → G5's step-14 gate must fail. Without this
  the new gate could be passing because the names are simply absent from an unrelated page.
- **M2.** Change `currentOrgId: user.organizationId` to a hardcoded `'org_seed'` → G7 must fail on
  the JoJo specs. Proves the session actually follows the user's own org.

## Risks

| # | Risk | Handling |
|---|---|---|
| R1 | A user whose `organizationId` points at an org they were later removed from | Out of scope and pre-existing: `hooks.server.ts` already resolves the active org per request. This plan does not widen it. Note it, do not fix it here. |
| R2 | Deleting the wrong-tenant test lowers coverage | The behaviour it guarded is now structurally impossible (no user-supplied org). Step 14 replaces it with a gate on the actual new requirement. |
| R3 | A seeded account exists whose home org is not where its specs expect | Verified false against `prisma/seed-core.ts` before planning. Re-check if G7 reds. |
