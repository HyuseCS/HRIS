---
name: plan:ui-ux-overhaul-phase-09-login-email-first
description: "Phase 9 of the Veent HRIS UI/UX overhaul — replace the public tenant list on login step 1 with an email-first step that resolves a person's org(s) server-side, so an anonymous visitor can no longer read the whole customer list. Owner ruling: option C, 2026-09-03."
date: 03-09-26
feature: ui-ux-overhaul
phase: "09"
---

# Phase 9 — `login-email-first`

**TL;DR** — Today `(auth)/login/+page.server.ts` hands every `Organization` row to any anonymous
visitor. This phase deletes that query and makes step 1 ask for an email instead. The server resolves
which org(s) that email belongs to and returns **one response shape for every email in the world** —
zero-org, unknown, and single-org all look identical, and only a 2+-org email gets a picker. Two
server files, one page, four test files, one new unit test file. No schema change, no new dependency,
no new rate limit. The choke point is `tests/e2e/helpers.ts` `login()`, which ~40 specs call — it gets
its own section and a full-suite gate.

**Date**: 03-09-26
**Status**: PLANNED — PVL pending. No code changed.
**Complexity**: COMPLEX (phase of a now-9-phase program; auth flow, 3 source files, 5 test files)
**Feature**: ui-ux-overhaul
**Phase**: 9 of 9 — `login-email-first`

---

## Overview

Audit-adjacent finding, raised during phase 08 and ruled on by the owner the same day: the login
page's step 1 is a **public directory of every Veent customer**. `load` reads all `Organization` rows
with no session and the page renders one button per tenant, so anyone who can reach `/login` — a
crawler, a competitor, a former employee — reads the client list.

This phase replaces that step with an email box. The org resolution moves to the server, where it
belongs, and the answer never leaves the server for anyone who does not already belong to two or more
orgs. It is the ninth and last phase of the program, and the only one that touches an authentication
flow: phases 01-08 were presentation and copy, this one changes what the server does with a request.

It runs last because it must. Phase 08's AC5/AC20 made the *absence* of this change an automated
check, and the two files here carry six phase-08 pins that this plan preserves or explicitly amends.
Running it earlier would have meant writing those pins twice.

---

## Program-Membership Note (read first)

`process/features/ui-ux-overhaul/backlog/login-email-first-tenant-privacy_NOTE_03-09-26.md` says this
work is *"a definite future build in a new auth-flow plan, **NOT** part of the UI/UX overhaul
program."*

**That line is superseded.** The owner ruled on 2026-09-03 that this ships as **phase 09 of this
program**. The note stays on disk as the design record; only its Status line changes (Section 7).

The reasoning in the note that still binds:

- phase 08 deliberately left the flow byte-untouched and made that absence an automated check
  (AC5/AC20). Those checks were correct **for phase 08** and are not violated by a later phase.
- this is an **authentication flow** change, not a copy change. It gets its own phase, its own
  branch, and its own PR.

---

## Code of Record

Execution branches `feat/uiux-phase-9` off **`feat/uiux-phase-8`**, the tip of the stacked chain
(PRs #11–#17, none merged to `staging` yet). Everything in this plan was read at that tip. Where
`staging` differs, read via `git show feat/uiux-phase-8:<path>`.

| Difference vs `staging` | Matters here because |
|---|---|
| `login/+page.svelte` carries the Veent rebrand + the `role="alert"` error box | Both are phase-08 pins this plan must preserve (see Phase-08 Pins) |
| `login/+page.server.ts` differs in **comments only** | The `load` body, `loginSchema` and the action are the same code this plan rewrites |
| `(auth)/+layout.svelte` (Toaster) is new | Not touched. The login page does not use toasts; errors stay inline |
| `tests/unit/copy-invariants.test.ts`, `tests/unit/a11y-invariants.test.ts` are new | They pin login strings. Two assertions in `copy-invariants` must be amended (Section 4) |

**PR:** #18, stacked on #17. The orchestrator opens it; **the owner merges.** Merge order for the
whole chain stays strictly #11 → #18.

---

## Goal

Stop the login page from disclosing the customer list.

**What is wrong today.** `load` (`+page.server.ts:20-32`) runs
`db.organization.findMany({ select: { id, name }, orderBy: { name: 'asc' } })` with no `locals.user`
and returns it, and `+page.svelte:29-56` renders one button per row. Anyone who can reach `/login`
reads every tenant Veent has.

**What replaces it (owner ruling, option C).** Step 1 asks for the email address. The server resolves
which org(s) that email belongs to:

| Resolution | What the visitor gets |
|---|---|
| exactly one org | password step, **no picker**, org name never shown |
| zero orgs / unknown email / malformed email | **byte-identical** to the single-org case |
| two or more orgs | password step **plus** a picker listing only that person's orgs |

The generic `'Invalid email or password'` remains the only credential answer, so removing the org list
opens no account-level oracle.

## Non-Goals

- **Not** adding a rate limit to the resolution step. Owner declined option D. Section 7 records it as
  the named follow-on in the existing backlog note.
- **Not** fixing the pre-existing email-case mismatch (`findUnique({ where: { email } })` is not
  lowercased while the rate-limit key is). See "Pre-Existing Defects Left Alone".
- **Not** narrowing the pre-existing unknown-email timing gap (no `bcrypt.compare` runs for an unknown
  email). This plan must not **widen** it; a backlog note captures it.
- **Not** touching `DevLoginSwitcher.svelte` or `/api/v1/_dev/login-as`. The switcher's account list is
  hard-coded and never read `data.orgs`; the dev API never used `loginSchema`.
- **Not** rendering `/login?error=account_disabled` (`hooks.server.ts:45` redirects there and the page
  has never shown it). Out of scope, unchanged, recorded as a known gap.
- **Not** per-tenant login URLs (option B) or any URL/route change.
- **Not** a visual redesign of the login card. Brand, tokens, spacing, the logo and the footer are
  phase-08 output and are frozen.

---

## Binding Design Rulings (settled — do not reopen)

These came with the task and are not re-litigated during EXECUTE.

1. **Option C exactly.** Step 1 = email only. Server resolves. One org → straight to password. Two or
   more → password plus a picker of only that person's orgs.
2. **Non-enumeration at step 1.** A zero-match email advances to the password step exactly like a
   single-org email, in the same response shape. Step 1 never returns an error that distinguishes a
   known email from an unknown one.
3. **The multi-org picker discloses membership** for a known email. Inherent to option C. Owner
   accepted it. Recorded, not fought.
4. **No new rate limiting.** Step 1 adds one per-email DB read; option D is the recorded follow-on.
5. **The server-side membership check stays**, as defence against a forged `selectedOrg`.
6. **The unknown-email timing gap is out of scope** and must not widen.
7. **Session/audit:** single-org resolution sets `currentOrgId` and the success-audit
   `organizationId` to the resolved org; multi-org uses the picked org, validated by the membership
   check. **Never create a session with `currentOrgId` null.**
8. **`'Invalid email or password'`** survives verbatim at every credential-failure site.
9. Modular, reusable, secure; Svelte 5 runes; the `{@const}` placement rule; byte-minimal — no
   speculative features.

---

## The Chosen Mechanic (ruling 2 asked this to be decided — here it is)

**Decision: step 1 is a real server round-trip via a named form action, and the page holds no
client-side step state at all.**

Two named actions replace the single `default` action:

- `?/resolve` — takes `email` only.
- `?/signin` — takes `email`, `password`, and optionally `selectedOrg`.

The rendered step is derived **entirely from the action return value**:

```
step 1  ⟺  form?.email is absent
step 2  ⟺  form?.email is present
```

No `$state` step variable, no `selectedOrg` client state. The two-step behaviour is server-driven.

### Why this shape and not the alternatives

| Alternative | Rejected because |
|---|---|
| **Collect email + password together in one form, resolve on submit** | A 2+-org user cannot be shown a picker before authenticating without either re-rendering with the password retained (bad) or asking for the password twice (bad). It also contradicts ruling 1's "step 1 = email only". |
| **Keep one `default` action and branch on whether `password` is present** | One action with two payload shapes and two meanings. A future reader cannot tell which branch a request is in from the schema. Named actions give one Zod schema each. |
| **Resolve orgs from a `GET`/JSON endpoint on keystroke** | Creates a *new*, cheaply-scriptable membership endpoint and needs JS. Strictly worse attack surface for the same UX. |
| **Client-side step state (today's shape) with a server fetch** | Today's `selectTenant` e2e helper needs a hydration retry loop precisely because revealing step 2 is client-side. A native form POST works pre-hydration. |

### No-JS story (progressive enhancement, full)

- Step 1 is `<form method="POST" action="?/resolve">`. Without JS the browser posts it and SvelteKit
  re-renders the page with `form` populated → step 2 appears. With JS, `use:enhance` does the same
  without a full reload.
- Step 2 is `<form method="POST" action="?/signin">`. The picker is a server-rendered
  `<fieldset><legend>` radio group — no JS needed to choose.
- **"Change" is an `<a href="/login">`**, not a button with an `onclick`. It works with JS off, and
  it is one line instead of a state reset.

Net: the page works with JavaScript entirely disabled. That is strictly better than today, where step
2 is unreachable without hydration.

### The single-response-shape rule (the core security property)

`?/resolve` has **exactly one** possible response for every input, forever:

```
{ email: <the submitted string>, orgs: Org[] }
```

- `orgs` is `[]` whenever the resolution finds **fewer than two** orgs — that covers unknown email,
  inactive user, zero-membership user, and single-org user. All four are byte-identical.
- `orgs` is populated **only** when the count is ≥ 2.
- `?/resolve` **never returns `fail()`**. A malformed email (Zod reject) returns the same
  `{ email, orgs: [] }` and advances. The generic credential failure at `?/signin` is where every
  wrong thing lands.

**Single-org must not leak the org name.** Step 2's heading is generic
(`Enter your password`) — never `Sign in to {org}`. If the heading named the resolved org, single-org
and zero-org would be distinguishable and ruling 2 would be broken. This is the single easiest way to
get this phase wrong; it has its own gate (G2) and its own AC (AC3).

### Resolution helper (one function, three call sites)

`resolveLoginOrgs(email)` lives in `+page.server.ts` (module-private, not exported to `$lib` — one
consumer, per the no-speculative-abstraction rule) and returns:

```
{ userId: string | null, orgs: {id,name}[], soleOrgId: string | null }
```

- One query: `db.user.findUnique({ where: { email }, select: { id, isActive, organizationId,
  memberships: { select: { organization: { select: { id: true, name: true } } } } } })`.
  The relation is `User.memberships` → `UserOrganization` (`prisma/schema.prisma:312`, unique
  `[userId, organizationId]`).
- Org set = `{user.organizationId}` ∪ membership org ids, de-duplicated by id, sorted by name.
  (The seed backfills one membership per user, so for most accounts the union collapses to one row —
  the de-dup is load-bearing, not defensive.)
- `orgs` is returned to the caller **only when the set size is ≥ 2**; `soleOrgId` is set only when the
  size is exactly 1. Both are `[]` / `null` for an unknown user.
- The query shape is **identical for every email** — one `findUnique`, then branching in memory. No
  early return before the query. This is what keeps timing parity (ruling 6).
- `email` is passed through **exactly as submitted**, matching today's non-lowercased `findUnique`.
  Do not "fix" the case here (see Pre-Existing Defects Left Alone).

### Where `selectedOrg`'s three consumers land

Research confirmed exactly three consumers. All three survive:

| Consumer | Today | After |
|---|---|---|
| membership check (`:68-72`) | `selectedOrg` from the form | unchanged when `selectedOrg` is posted; **skipped** when it is absent, because the org came from the server's own resolution and cannot be forged |
| `lucia.createSession(user.id, { currentOrgId: selectedOrg })` (`:95`) | posted value | posted value when present, else `soleOrgId` |
| success-audit `organizationId` (`:106-118`) | posted value | the same value used for the session — one variable, `resolvedOrgId` |

`resolvedOrgId` is **never null** at session creation. If it would be null (no org resolves), the
request has already returned the generic 401 (see `?/signin` order of operations).

### `?/signin` order of operations (exact)

1. Parse with `signinSchema` = `{ email: z.string().email(), password: z.string().min(1),
   selectedOrg: z.string().min(1).optional() }`. On parse failure → `fail(400, { error: GENERIC,
   email: <raw email or ''>, orgs: [] })`.
2. `rateKey = \`${ip}:${email.toLowerCase()}\`` — **unchanged from today**, byte for byte.
3. `checkRateLimit(rateKey)`. On lockout → `fail(429, { error: <the minutes message>, email,
   orgs: [] })`. **No DB read on this path** — a locked-out account does no resolution work. A
   locked-out multi-org user loses their picker on that re-render; accepted, and it is the safer
   trade.
4. `const r = await resolveLoginOrgs(email)` — the same helper, the same single query.
5. `const user = await db.user.findUnique({ where: { email } })` — **kept as-is** so the password
   hash and roles are fetched exactly as today. (`resolveLoginOrgs` deliberately does not select
   `passwordHash`; keeping the secret out of the resolution path is worth the second read.)
6. `if (!user || !user.isActive)` → `recordFailure` + `fail(401, { error: GENERIC, email, orgs:
   r.orgs })`. **No audit row** — unchanged from today.
7. `bcrypt.compare`.
8. Resolve the org:
   - `selectedOrg` posted → `resolvedOrgId = selectedOrg`, and `isMember` is computed exactly as
     today (primary-org equality OR the `userOrganization` compound-unique lookup). **Ruling 5.**
   - `selectedOrg` absent → `resolvedOrgId = r.soleOrgId`, `isMember = r.soleOrgId !== null`.
     A 2+-org user who posts nothing fails here generically. (The rendered picker defaults its first
     radio to `checked`, so this is a forged/no-JS-tampered request, not a real user.)
9. `if (!validPassword || !isMember || !resolvedOrgId)` → `recordFailure`, write the `LOGIN_FAILED`
   audit row with `organizationId: user.organizationId` (**unchanged**), `fail(401, { error: GENERIC,
   email, orgs: r.orgs })`.
10. `recordSuccess`, `lucia.createSession(user.id, { currentOrgId: resolvedOrgId })`, cookie,
    `Promise.all([lastLoginAt update, LOGIN audit with organizationId: resolvedOrgId])`,
    `redirect(302, '/dashboard')`. **All unchanged except the variable name.**

**Every `fail()` from `?/signin` carries `email` and `orgs`.** Without that the page would collapse
back to step 1 on a wrong password and eat the typed email — a real usability regression, and the
easiest thing to miss. It has its own AC (AC6).

### Timing parity (ruling 6) — how this design keeps it at least as good as today

| Path | Today | After | Verdict |
|---|---|---|---|
| unknown email at credential submit | `findUnique` → 401, no bcrypt | `resolveLoginOrgs` + `findUnique` → 401, no bcrypt | **unchanged in kind** (one extra read on both the known and unknown branch, so the *difference* is unchanged) |
| known email, wrong password | `findUnique` → bcrypt → audit write → 401 | same, plus `resolveLoginOrgs` | unchanged in kind |
| step 1 | no DB read at all (the org list was a `load`) | one `findUnique` per email, **same query for every email**, single response shape | new surface, no new *branch*: the response cannot differ, only the wall-clock read time can |

The gap is not narrowed and not widened. Backlog note `login-timing-parity` (Section 7) records
D1–D4 so a later hardening pass has the facts.

---

## Phase-08 Pins — how each one survives

Phase 08 pinned six things on these two files. Four are untouched; two invariant assertions must be
amended. **State the exact amendment, do not silently let a test go red.**

| Pin | Location | How it survives |
|---|---|---|
| `<title>Sign In — Veent HRIS</title>` | `copy-invariants.test.ts:94` | Untouched — the `<svelte:head>` block is not edited |
| `src="/veent-logo.png"` + `alt="Veent"` | `copy-invariants.test.ts:89-90` | Untouched — the brand header above the card is not edited |
| `Veent HRIS · {new Date().getFullYear()}` | `copy-invariants.test.ts:95` | Untouched — the footer is not edited |
| Error box `role="alert"` + `text-red-600 dark:text-red-400` | `a11y-invariants.test.ts:203-208` | **Preserved verbatim**, moved into the step-2 branch. The whole `<div role="alert" class="mb-4 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">` node is carried across unchanged, including the explanatory comment |
| `'Invalid email or password'` present in `+page.server.ts` | `copy-invariants.test.ts:265-268`, `a11y-invariants.test.ts:216-220` | **Ruling 8.** The literal survives at all three failure sites. Extract it to a module constant `GENERIC = 'Invalid email or password'` **only if** the literal still appears verbatim in the file — it does, in the constant declaration. Both greps stay green |
| Avipa allow-list: exactly ONE `//`-prefixed "Avipa" line in `+page.server.ts` | `copy-invariants.test.ts:104-119` | **AMENDED.** See below |

### The two exact `copy-invariants.test.ts` amendments

The surviving Avipa comment lives **inside `loginSchema`** ("The tenant chosen on the Avipa login
(#135)…", `+page.server.ts:12-16`). `loginSchema` is deleted by this phase — it is replaced by
`resolveSchema` and `signinSchema`, and the comment describes a flow that no longer exists. The
comment goes with it. Phase 08's own test comment says exactly this: *"It goes with the email-first
login plan (see the backlog note.)"*

**Amendment 1** — `tests/unit/copy-invariants.test.ts`, the test named
`'leaves no Avipa string anywhere in src/ except the one AC5 protects'`:

- delete the `const ALLOWED_AVIPA = 'routes/(auth)/login/+page.server.ts'` declaration
- rename the test to `'leaves no Avipa string anywhere in src/'`
- new assertion, exactly: `expect(offenders).toEqual([])`
- replace the docblock above `ALLOWED_AVIPA` with a two-line note: *"The one documented survivor —
  a comment inside `loginSchema` — went with phase 09's email-first rewrite. `src/` is now Avipa-free
  with no exceptions."*

**Amendment 2** — same file, the test named
`'the surviving Avipa mention is a comment inside loginSchema, not rendered copy'`:

- **delete the whole `it(...)` block.** There is no surviving mention to characterise, and an
  amended version would assert on a file region that no longer exists.

Amendment 1 keeps the repo-wide sweep — the gate does not weaken, it tightens from
"zero except one" to "zero". Its mutation check (M4) proves it can still fail.

---

## Pre-Existing Defects Left Alone (recorded, not fixed)

Each of these was found while reading the flow. None is in scope. Recording them so a reviewer does
not read the omission as an oversight, and so nobody "fixes" one mid-execution.

| Defect | Evidence | Why not here |
|---|---|---|
| `user.findUnique({ where: { email } })` is **not** lowercased, while `rateKey` uses `email.toLowerCase()` | `+page.server.ts:44-45` vs `:55` | Changing it changes who can log in (a `User.email` stored with capitals becomes reachable by a different string). That is a behaviour change on an auth path with no owner ruling. `resolveLoginOrgs` matches the existing behaviour exactly so the two lookups agree. Backlog: fold into `login-timing-parity` as D4 |
| No `bcrypt.compare` runs for an unknown email → measurable timing difference | `:55-60` | Ruling 6, explicitly out of scope. Backlog note `login-timing-parity` |
| `hooks.server.ts:45` redirects to `/login?error=account_disabled`; the page never renders it | `hooks.server.ts:45` | Out of scope by the task brief. The rewrite must not accidentally start rendering it either — `form?.error` is the only error source |
| The login rate limiter has **no** unit test | `src/lib/server/rate-limit.ts`, `_resetForTests()` exists and is uncalled in `tests/` | Real gap, but writing one is not in this phase's blast radius and this phase does not change the limiter. Test Infra Improvement Notes |

---

## Implementation Checklist

Ordered. **Commit per section**, not per phase (repo convention). Run the section gate before moving
on. The full CI gate set is `pnpm format:check && pnpm lint && pnpm check && pnpm test` in that order
(CI runs format first and skips the rest on failure).

### Section 0 — entry checks and branch

1. Confirm the current branch tip is `feat/uiux-phase-8` and the working tree is clean.
2. `git switch -c feat/uiux-phase-9` off `feat/uiux-phase-8`. Do **not** branch off `staging`.
3. Re-read `src/routes/(auth)/login/+page.server.ts` and `+page.svelte` on disk and confirm the line
   numbers in this plan still hold. Record any drift in the phase report **before** editing.
4. Append this phase's claim to `phase-blast-radius-registry.md` in this folder (append-only; create
   the `## Phase 09` section, never overwrite an earlier one).
5. Record the pre-phase `pnpm test:e2e` baseline (pass/fail counts) — the suite is known flaky
   (#287) and Section 5 needs a number to compare against.
6. Gate: `pnpm test` green on the untouched branch (baseline).

### Section 1 — server: email-first resolution

7. In `src/routes/(auth)/login/+page.server.ts`, add `const GENERIC = 'Invalid email or password'` and
   use it at all three failure sites. The literal stays in the file (phase-08 pin).
8. Delete `loginSchema`. Add `resolveSchema = z.object({ email: z.string().email() })` and
   `signinSchema = z.object({ email: z.string().email(), password: z.string().min(1), selectedOrg:
   z.string().min(1).optional() })`.
9. Delete the `db.organization.findMany` call and the `orgs` return from `load`. `load` keeps only the
   `if (locals.user) redirect(302, '/dashboard')` guard and returns nothing.
10. Add the module-private `resolveLoginOrgs(email)` helper exactly as specified under "Resolution
    helper", including the de-dup and the `>= 2` / `=== 1` thresholds.
11. Replace `actions.default` with `actions.resolve` and `actions.signin`.
    - `resolve`: parse; on **either** outcome return `{ email: <submitted string>, orgs: r.orgs }`.
      Never `fail()`. Never return `soleOrgId` or any org name for a single-org email.
    - `signin`: implement the 10-step order of operations verbatim, including `email` + `orgs` on
      every `fail()`, and `orgs: []` on the 429 path with no DB read.
12. Carry the two `#5` "deliberately NOT transactional" comments across unchanged — they explain the
    audit-write class and are still true.
13. Rewrite the membership-check comment to say the check now guards a **posted** `selectedOrg`
    against forgery (ruling 5) and that a resolved-server-side org skips it because it cannot be
    forged. Keep the `#135` reference; the two-step design is still the owner's.
14. Gate: `pnpm check && pnpm lint`.

### Section 2 — client: the email-first page

15. In `src/routes/(auth)/login/+page.svelte`, delete `let selectedOrg = $state(...)` and the
    `{#if !selectedOrg}` tenant-button block (`:29-56`). Keep `loading`.
16. Branch on the server instead: `{#if !form?.email}` → step 1, `{:else}` → step 2.
17. **Step 1**: heading `Sign in`, sub-copy `Enter your work email to continue`, one
    `<form method="POST" action="?/resolve" use:enhance>` with the existing `<label for="email">Email`
    + `<input id="email" name="email" type="email" autocomplete="email" required
    placeholder="you@company.com" class="input">` carried across unchanged, and a submit button
    labelled **`Continue`** reusing the existing `btn-primary w-full h-10 disabled:opacity-60` classes
    and the `loading` label swap (`Continue` / `Checking…`).
18. **Step 2**: heading `Enter your password` — **generic, never the org name** (see the
    single-response-shape rule). Below it, show the submitted email as **plain text**, not an input
    (`<p class="text-xs text-muted-foreground">{form.email}</p>`), plus `<a href="/login"
    class="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground">Change</a>`
    reusing the existing Change-button classes.
19. Carry the `role="alert"` error box across **verbatim**, including its comment, inside step 2.
20. Step 2 form: `<form method="POST" action="?/signin" use:enhance>` with
    `<input type="hidden" name="email" value={form.email} />`, the existing Password field unchanged,
    and the existing `Sign In` / `Signing in…` submit button unchanged.
21. **Picker**, rendered only when `form.orgs.length > 1`: a `<fieldset>` with
    `<legend class="text-sm font-medium">Choose your company</legend>` and one radio per org —
    `<input type="radio" name="selectedOrg" value={org.id} checked={i === 0} id={...}>` +
    `<label for={...}>{org.name}</label>` inside `{#each form.orgs as org, i (org.id)}`. The first
    option is `checked` so a no-JS submit always carries a value. Any `{@const}` here must be an
    immediate child of the `{#each}`, never inside a `<div>`.
22. Focus the password field when step 2 renders: `let pwEl = $state<HTMLInputElement | null>(null)`
    + `bind:this={pwEl}` + `$effect(() => pwEl?.focus())`. Do **not** use the `autofocus` attribute —
    it trips the a11y lint rule. (Three lines; justified because a server round-trip re-renders the
    card and a keyboard/screen-reader user would otherwise land back at the top of the document.)
23. Do not touch `<svelte:head>`, the brand header, the footer, or `<DevLoginSwitcher />`.
24. Gate: `pnpm check && pnpm lint`.

### Section 3 — unit tests

25. Extend `tests/unit/login-audit.test.ts`:
    - update the `event()` helper to build a `?/signin` payload and call `actions.signin(...)` — the
      two existing audit tests (`LOGIN_FAILED` on a bad password; `LOGIN` survives a `lastLoginAt`
      failure) keep their assertions **unchanged**, only the entry point moves.
    - extend `dbMock` with the `memberships` shape `resolveLoginOrgs` selects. **Do not** use a bare
      `mockResolvedValue` for `userOrganization.findUnique` — key it on the actual `where` argument
      (see the mutation checks; a where-ignoring mock is the exact failure this repo has been burned
      by).
    - drop the now-unused `organization.findMany` mock.
26. New file `tests/unit/login-resolution.test.ts` with five cases:
    - **zero-org / unknown email** — `?/resolve` returns `{ email, orgs: [] }` and **not** `fail`.
    - **single-org** — `?/resolve` returns `{ email, orgs: [] }`, deep-equal to the zero-org result
      except `email`. Assert with a single `toEqual` against the unknown-email result object so a
      future field addition on one branch alone goes red.
    - **multi-org** — `?/resolve` returns exactly the user's orgs. The `organization` mock must offer
      **four** orgs while `memberships` returns **two**; assert the result is exactly those two.
    - **single-org signin with no `selectedOrg`** — session is created with
      `currentOrgId: <resolved id>` (never null) and the `LOGIN` audit row carries the same id.
    - **forged `selectedOrg`** — a valid email + valid password + an org id the user does not belong
      to returns 401 with `GENERIC`, writes a `LOGIN_FAILED` row whose `organizationId` is
      `user.organizationId` (not the forged id), and creates **no** session.
27. Gate: full CI gate set.

### Section 4 — copy/a11y invariant amendments

28. Apply Amendment 1 to `tests/unit/copy-invariants.test.ts` (assertion becomes
    `expect(offenders).toEqual([])`; delete `ALLOWED_AVIPA`; rename the test; replace the docblock).
29. Apply Amendment 2 — delete the `'the surviving Avipa mention is a comment inside loginSchema'`
    block entirely.
30. Run the two login pins in `a11y-invariants.test.ts` and the `'Invalid email or password'` pin in
    `copy-invariants.test.ts` **without editing them**. If any is red, the Section 2 carry-across was
    not verbatim — fix the source, not the test.
31. Add to `copy-invariants.test.ts` a new assertion in the login describe block: the login page
    source contains **no** `Sign in to {` heading pattern and `+page.server.ts` contains no
    `organization.findMany` (gate G1/G2, see Verification Evidence). Placing it here keeps all login
    copy pins in one file.
32. Gate: full CI gate set.

### Section 5 — e2e choke point (`helpers.ts`, `global-setup.ts`)

**This section is isolated because `login()` is called by ~40 specs.** It gets a full-suite gate of
its own before any spec rewrite lands.

33. Rewrite `tests/e2e/helpers.ts` `login()`:
    ```
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await page.getByLabel('Email').fill(user.email)
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByLabel('Password')).toBeVisible()
    const picker = page.getByRole('radio', { name: org, exact: true })
    if (await picker.count()) await picker.check()
    await page.getByLabel('Password').fill(user.password)
    await page.getByRole('button', { name: 'Sign In' }).click()
    await page.waitForURL('**/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    ```
    Keep the signature `login(page, user, org = 'Veent')` so `tenancy-switch.spec.ts:16` is
    **byte-unchanged**. For single-org accounts the picker does not exist, the `count()` is 0, and the
    `org` argument is inert.
34. **Delete `selectTenant`** and its docblock. Its only importer is `auth.spec.ts`, rewritten in
    Section 6. Its hydration-retry `toPass` loop exists only because step 2 was revealed client-side;
    a native form POST works pre-hydration, so the retry is obsolete. Record the flakiness win in the
    phase report.
35. Update the stale comment at `tests/e2e/leave-balances.spec.ts:99` that references `selectTenant`
    in `helpers.ts` — point it at `login()` instead. Comment only, no behaviour change.
36. Update `tests/e2e/global-setup.ts` `warmRoutes` browser warmup (`:36-53`) to match the **new first
    interactive element**: fill `getByLabel('Email')` with `admin@veent.ph`, click
    `getByRole('button', { name: 'Continue' })`, wait for `getByLabel('Password')`. Keep every
    `.catch(() => {})` — a warmup miss must never fail the suite. Rewrite the comment: it currently
    explains that the credential form is revealed client-side, which stops being true.
37. Gate: **full `pnpm test:e2e`**, compared row-for-row against the Section 0 baseline. No spec may
    be newly red. This is the section's exit condition and the one place the ~40-spec blast radius is
    actually proven.

### Section 6 — auth.spec rewrites and new coverage

38. `tests/e2e/auth.spec.ts` — drop the `selectTenant` import.
39. Rewrite `'invalid credentials are rejected'` (`:14-23`): fill Email → Continue → wrong password →
    Sign In → `'Invalid email or password'` visible, URL still `/login`.
40. **Delete** `'valid credentials against the wrong tenant are rejected'` (`:27-35`). It has no UI
    path under email-first — a single-org account is never offered another org. Replace it with the
    forged-`selectedOrg` **unit** test (Section 3, item 26 case 5). *Rationale for choosing unit over
    `page.request.post`: the assertion is purely server-side, and the unit test can additionally
    assert the `LOGIN_FAILED` audit row's `organizationId` and the absence of a session — neither is
    observable from a request-level e2e. Add a comment at the deletion point naming
    `tests/unit/login-resolution.test.ts` so the coverage is traceable.*
41. New spec — **the privacy assertion**: `page.goto('/login')`; assert `getByText('JoJo Potato')` and
    `getByText('Sweetleaf')` both have count 0, and no `Veent` tenant *button* exists (the brand
    `alt="Veent"` logo does, so scope the assertion to `getByRole('button')`). This is the finding
    the phase exists to fix.
42. New spec — **the multi-org path**, driven by `USERS.ceo` (`ceo@veent.ph`, the only multi-org seed
    account, member of Veent + JoJo Potato + Sweetleaf, `seed-core.ts:466-482`): fill the CEO email →
    Continue → assert three radios named Veent / JoJo Potato / Sweetleaf are visible → check `Veent`
    → password → Sign In → dashboard.
    **Honest limit, state it in the report:** the seed has exactly three orgs and the CEO belongs to
    all three, so this spec proves the picker *renders*, **not** that it is scoped to membership.
    Scoping is proven by item 41 (a single-org admin never sees `JoJo Potato`) and by the four-orgs
    /two-memberships unit case (item 26 case 3).
43. New spec — **non-enumeration**: fill `nobody-here@example.com` → Continue → assert the Password
    field is visible and no error box is present; submit any password → assert
    `'Invalid email or password'`. This is ruling 2's automated proof.
44. New spec — **no-JS**: a `test.use({ javaScriptEnabled: false })` block that logs
    `admin@veent.ph` in end to end through both form posts and reaches `/dashboard`. If the Playwright
    project config makes `javaScriptEnabled` unavailable per-describe, downgrade this to the
    Agent-Probe owner check (M-2) and record the downgrade — do not silently drop it.
45. Gate: `pnpm test:e2e tests/e2e/auth.spec.ts` green, then full `pnpm test:e2e` against the
    Section 0 baseline.

### Section 7 — backlog, verification, close

46. Amend `process/features/ui-ux-overhaul/backlog/login-email-first-tenant-privacy_NOTE_03-09-26.md`:
    - `**Status:**` line → `**Status:** BUILT as phase 09 (PR #18).`
    - `description:` frontmatter → replace the "NOT part of the UI/UX overhaul program" clause with
      "built as phase 09 of the UI/UX overhaul program".
    - append a short `## Follow-on: option D` section recording that the owner declined the
      resolution-step rate limit, that step 1 adds one per-email DB read, and that option D is the
      named next hardening step. **Do not write a new note for option D** — it belongs here.
    - leave the rest of the note intact as the design record.
47. Write `process/features/ui-ux-overhaul/backlog/login-timing-parity_NOTE_03-09-26.md` with the
    content specified under "New Backlog Note" below.
48. Run the full CI gate set in CI order: `pnpm format:check && pnpm lint && pnpm check && pnpm test`.
49. Run `pnpm test:e2e` (never bare `npx playwright test`) and compare to the Section 0 baseline.
50. Run every mutation check M1–M6 and record each red result in the phase report.
51. Run the `impeccable` audit pass on the two changed source files (standing repo rule: UI work goes
    through `impeccable`).
52. Run `node .claude/skills/vc-generate-plan/scripts/validate-plan-artifact.mjs <this plan>`.
53. Update the umbrella `ui-ux-overhaul-umbrella_PLAN_03-09-26.md`: add phase 09 to `## Phase
    Ordering`, `## Program Status Table`, `## Phased Delivery Plan`, and `## Current Execution State`;
    change every "8 phases" count to 9. **Process commit, separate from execution commits.**
54. Write `phase-09-login-email-first_REPORT_{date}.md` FLAT in this folder, including the owner
    manual-test additions verbatim for the PROGRAM CLOSE consolidated list in
    `phase-08-copy-a11y-s4-s6_REPORT_03-09-26.md`.
55. Commit via `vc-git-manager`. No `Co-Authored-By`. Open PR #18 stacked on #17 — **the orchestrator
    opens it, the owner merges.**

---

## Acceptance Criteria

Each criterion names its proving gate and strategy. Gate ids refer to the Verification Evidence table.

| # | Criterion | proven by | strategy |
|---|---|---|---|
| AC1 | An anonymous visitor to `/login` receives **no** organization data — `db.organization.findMany` is gone from the login server file and no tenant button renders | G1 source scan; E3 privacy spec | Fully-Automated |
| AC2 | Step 1 accepts an email and advances to a password step | E1, E4, E5 | Fully-Automated |
| AC3 | A zero-org / unknown / malformed email is **byte-indistinguishable** from a single-org email at step 1 — same response object, no org name in the step-2 heading | U1 (deep-equal of the two `?/resolve` results); G2 (no `Sign in to {` heading pattern); E4 | Fully-Automated |
| AC4 | `?/resolve` never returns `fail()` for any input | U1 — asserts the return has no `status` key on all three branches | Fully-Automated |
| AC5 | A 2+-org email gets a picker listing **only** that person's orgs | U2 (four orgs mocked, two memberships, exactly two returned); E6 (renders); E3 (a single-org admin never sees another tenant) | Fully-Automated |
| AC6 | A failed sign-in re-renders **step 2** with the email retained and the error announced — it never collapses back to step 1 | E1; a11y `role="alert"` pin | Fully-Automated |
| AC7 | A forged `selectedOrg` is rejected: 401 generic, `LOGIN_FAILED` audit row on `user.organizationId`, **no session created** | U3 | Fully-Automated |
| AC8 | A session is **never** created with `currentOrgId` null; single-org resolution sets it to the resolved org and the `LOGIN` audit row carries the same id | U4 | Fully-Automated |
| AC9 | `'Invalid email or password'` survives verbatim at all three failure sites | existing `copy-invariants` + `a11y-invariants` pins, unedited | Fully-Automated |
| AC10 | Every phase-08 login pin except the Avipa allow-list is untouched; the allow-list amendment tightens the gate rather than weakening it | Section 4 gates + M4 | Fully-Automated |
| AC11 | The ~40 specs that call `helpers.login()` are no worse than the pre-phase baseline | G5 full `pnpm test:e2e`, baseline-compared | Fully-Automated (flaky — read the error, do not re-run blindly, per #287) |
| AC12 | The login flow works with JavaScript **disabled**, both steps | E7 (or M-2 if downgraded) | Fully-Automated, else Agent-Probe |
| AC13 | No schema, service, capability, rate-limiter or dependency change | `git diff --stat` = 2 source files + 5 test files + 2 backlog notes + umbrella; G4 | Fully-Automated |
| AC14 | Full CI gate set green in CI order | G4 | Fully-Automated |
| AC15 | A real person can sign in on a real browser, single-org and multi-org, and a bookmarked `/login` behaves | M-1..M-4 owner manual pass | Agent-Probe |

**Residual (known gap, not a PASS state):** AC15 has no automated tier — the repo has no
component-interaction harness and visual/UX judgment is not mechanically assertable. AC12 downgrades
to Agent-Probe only if Playwright cannot scope `javaScriptEnabled` per-describe. Both stay
**CONDITIONAL** on the owner manual pass being recorded row by row in the phase report; the backlog
stub is named in Test Infra Improvement Notes. A phase report without the M-table filled in does not
satisfy them.

## Phase Completion Rules

This phase is `CODE DONE` when checklist items 1–52 are complete and the CI gate set is green.

This phase is `✅ VERIFIED` only when **all** of the following hold:

1. `pnpm format:check && pnpm lint && pnpm check && pnpm test` green, run in that order.
2. `pnpm test:e2e` no worse than the Section 0 baseline, with any red spec **read**, not re-run
   blindly (#287).
3. G1, G2, U1–U4 green **and** each proven non-vacuous by its mutation check (M1–M6), recorded.
4. The owner manual-test table (M-1..M-4) filled in with an outcome each.
5. R1 and R2 regressions recorded as PASS / FIXED / BLOCKED per the umbrella's evidence format.
6. The `impeccable` audit pass (A1) recorded.
7. Both backlog notes written / amended on disk.
8. The umbrella updated from 8 phases to 9.
9. `phase-09-login-email-first_REPORT_{date}.md` written FLAT in this folder with known gaps and the
   owner manual-test additions for PROGRAM CLOSE.
10. This plan's `Validate Contract` section filled by vc-validate-agent.
11. Execution changes committed via `vc-git-manager`, separate from process/plan commits; PR #18
    opened stacked on #17.
12. **User Confirmation** — the owner has signed in on a real browser and confirmed working. The
    EXECUTE approval gate is **not** standing-granted for this program and the same rule applies at
    the exit: `✅ VERIFIED` needs the owner's word, not the agent's judgment.

Code-only completion is `CODE DONE`, never `✅ VERIFIED`.

---

## Touchpoints

**Changed source (2 files):**

| File | Change |
|---|---|
| `src/routes/(auth)/login/+page.server.ts` | `load` loses the org query; `loginSchema` → `resolveSchema` + `signinSchema`; `actions.default` → `actions.resolve` + `actions.signin`; new `resolveLoginOrgs` helper; `GENERIC` constant |
| `src/routes/(auth)/login/+page.svelte` | tenant-button step 1 → email step 1; client `selectedOrg` state deleted; step derived from `form`; radio picker; `<a href="/login">Change</a>`; password focus effect |

**Changed tests (5 files):**

| File | Change |
|---|---|
| `tests/unit/login-audit.test.ts` | entry point `actions.default` → `actions.signin`; mock shape extended; `organization.findMany` mock dropped |
| `tests/unit/login-resolution.test.ts` | **new** — U1–U4 |
| `tests/unit/copy-invariants.test.ts` | Amendments 1 + 2; new G1/G2 assertions |
| `tests/e2e/helpers.ts` | `login()` rewritten; `selectTenant` deleted |
| `tests/e2e/global-setup.ts` | browser warmup matches the new first interactive element |
| `tests/e2e/auth.spec.ts` | two rewrites, one deletion, four new specs |
| `tests/e2e/leave-balances.spec.ts` | stale `selectTenant` comment at `:99` only |

**Changed process artifacts (3):** `backlog/login-email-first-tenant-privacy_NOTE_03-09-26.md`
(Status + follow-on), `backlog/login-timing-parity_NOTE_03-09-26.md` (new),
`ui-ux-overhaul-umbrella_PLAN_03-09-26.md` (8 → 9 phases).

**Read-only (verify, do not edit):** `src/lib/server/rate-limit.ts`, `src/lib/server/auth.ts`,
`src/lib/server/audit.ts`, `src/hooks.server.ts`, `src/lib/components/dev/DevLoginSwitcher.svelte`,
`src/routes/api/v1/_dev/login-as/**`, `src/routes/(auth)/+layout.svelte`,
`tests/unit/a11y-invariants.test.ts`, `tests/e2e/tenancy-switch.spec.ts`, `prisma/seed-core.ts`.

**Out of bounds:** `prisma/schema.prisma`, `src/lib/rbac.ts`, `src/lib/server/services/**`,
`src/lib/server/rate-limit.ts` (read-only), `package.json`, `src/app.css`, `static/*`,
`src/lib/components/ui/**`.

## Public Contracts

- **Form action names change — this is the one breaking contract.** `POST /login` with no action
  name (`default`) stops existing. Callers must use `?/resolve` or `?/signin`. Known callers: the
  login page itself and `tests/unit/login-audit.test.ts`. `/api/v1/_dev/login-as` is a separate route
  and never used `loginSchema` — **unaffected**.
- **`selectedOrg` becomes optional** on the sign-in payload. When absent, the server resolves it. When
  present, the membership check validates it exactly as today (ruling 5) — the tenant-isolation
  boundary does not move.
- **Session shape unchanged.** `lucia.createSession(user.id, { currentOrgId })` keeps the same
  attribute, always non-null. The org switcher in `(app)/+layout.svelte` reads it unchanged.
- **Audit rows unchanged in shape.** `LOGIN_FAILED` still carries `organizationId:
  user.organizationId`; `LOGIN` still carries the org the session lands in. Only the variable feeding
  the latter is renamed `selectedOrg` → `resolvedOrgId`.
- **Rate-limit key unchanged**: `` `${ip}:${email.toLowerCase()}` ``. No new bucket, no new limiter,
  no config change (ruling 4).
- **`load` returns nothing.** `PageData.orgs` disappears. Grep confirms `data.orgs` has exactly one
  consumer (the block being deleted).
- **No URL, route, redirect or capability change.** Nothing becomes reachable or unreachable. Role
  behaviour is untouched — the umbrella's "never widen what a role can DO" constraint holds trivially.
- **New public response surface:** `?/resolve` accepts an email from an anonymous caller and returns
  membership org names for a 2+-org email. That is the accepted cost of option C (ruling 3). It has
  exactly one response shape (see the single-response-shape rule) and no rate limit (ruling 4).

## Blast Radius

- **Files:** 2 source + 6 test + 3 process. No schema, no service, no capability, no CSS, no
  dependency.
- **Surfaces:** one page — `/login`. But it is the **front door**: every authenticated surface in the
  app is downstream of it, and every one of the ~40 e2e specs enters through `helpers.login()`.
- **Risk class:** **HIGH — auth/identity.** This is the only phase in the program that touches an
  authentication flow. Per `vc-test-coverage-plan`, a high-risk class requires at least a hybrid gate
  and no un-rationalised known-gap: AC1–AC9 are all Fully-Automated, and the two Agent-Probe residuals
  (AC12 fallback, AC15) are the owner's manual pass, not a silent gap.
- **The three ways this ships broken that a green `pnpm test` would not see:**
  1. **The step-2 heading names the resolved org.** Single-org and zero-org become distinguishable and
     ruling 2 is silently broken — the exact hole this phase exists to close, reopened one level down.
     Gated by G2 + AC3; it has its own mutation check (M2).
  2. **`?/signin`'s `fail()` drops `email`/`orgs`.** A wrong password collapses the page back to step 1
     and eats the typed email. Every test that only checks for the error *string* still passes.
     Gated by E1 asserting the Password field is still visible after the failure.
  3. **`helpers.login()` silently works for single-org accounts and hangs only for the CEO.**
     `tenancy-switch.spec.ts` is the one spec that would catch it. Gated by the Section 5 full-suite
     gate, which is why Section 5 is isolated.
- **Aggregate:** this phase overlaps nothing else in the program — phases 01–08 never touched
  `(auth)/login/+page.server.ts` beyond one comment. The only shared artifact is
  `tests/unit/copy-invariants.test.ts` (phase 08's), amended here with phase 08 already CODE DONE.
  Record both in the blast-radius registry.

## Verification Evidence

Tier assignments follow `process/context/tests/all-tests.md` and the existing test files in the blast
radius (`tests/unit/login-audit.test.ts`, `copy-invariants.test.ts`, `a11y-invariants.test.ts`,
`tests/e2e/auth.spec.ts`, `helpers.ts`, `global-setup.ts` — all read at `feat/uiux-phase-8`).

**The controlling fact, stated so nothing is over-read:** unlike phases 03–08, this phase's core
behaviour **is** server logic, so it is genuinely unit-testable. The Prisma client is mocked, which is
the repo's known vacuous-green trap — every unit gate below therefore names a mutation that must turn
it red, and the multi-org mock is built with **four** orgs against **two** memberships so a
where-ignoring mock cannot pass.

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| **G1** `copy-invariants.test.ts` — assert `src/routes/(auth)/login/+page.server.ts` contains no `organization.findMany` and no `orgs` key in the `load` return | Fully-Automated | AC1 — the public customer list is gone and cannot come back |
| **G2** Same file — assert `+page.svelte` contains no `Sign in to {` pattern (the org-naming heading) | Fully-Automated | AC3 — the single-org case cannot be distinguished by the heading |
| **G3** Existing pins, run unedited: `'Invalid email or password'` in `+page.server.ts` (copy + a11y), `role="alert"` + `text-red-600 dark:text-red-400`, title/logo/footer | Fully-Automated | AC9, AC10 — phase-08 output survives |
| **G4** `pnpm format:check && pnpm lint && pnpm check && pnpm test`, in that order | Fully-Automated | AC13, AC14 — CI runs format first and skips the rest, so this order is the only one that proves CI |
| **G5** Full `pnpm test:e2e`, compared row-for-row against the Section 0 baseline | Fully-Automated (flaky, #287) | AC11 — the ~40-spec choke point survived the `helpers.login()` rewrite |
| **U1** `login-resolution.test.ts` — `?/resolve` for unknown, malformed and single-org emails returns objects that are `toEqual` except `email`, and none has a `status` key | Fully-Automated | AC3, AC4 — the single-response-shape rule, mechanically |
| **U2** Same file — `?/resolve` for a user with 2 memberships while the org table holds 4 returns exactly those 2, name-sorted | Fully-Automated | AC5 — the picker is scoped to membership, not to the org table |
| **U3** Same file — valid email + valid password + a non-member `selectedOrg` → 401 `GENERIC`, `LOGIN_FAILED` on `user.organizationId`, `lucia.createSession` **not called** | Fully-Automated | AC7 — ruling 5's forgery defence, replacing the deleted wrong-tenant e2e |
| **U4** Same file — single-org sign-in with no `selectedOrg` → `createSession` called with `currentOrgId: <resolved id>` and the `LOGIN` audit row carries the same id | Fully-Automated | AC8 — ruling 7, and "never null" |
| **U5** `login-audit.test.ts` (existing two tests, re-pointed at `actions.signin`) | Fully-Automated | The `#5` class-D audit-write behaviour is unchanged by the rewrite |
| **E1** `auth.spec.ts` — wrong password → generic message visible **and the Password field is still visible** (step 2 retained) | Fully-Automated | AC2, AC6 — the failure re-render does not collapse to step 1 |
| **E3** `auth.spec.ts` — anonymous `/login` shows zero tenant buttons and neither `JoJo Potato` nor `Sweetleaf` anywhere | Fully-Automated | AC1, AC5 — the actual finding, and the only falsifiable scoping proof the 3-org seed allows |
| **E4** `auth.spec.ts` — `nobody-here@example.com` → Continue → Password visible, no error box; any password → generic message | Fully-Automated | AC3 — ruling 2's non-enumeration, end to end |
| **E5** `auth.spec.ts` — `USERS.admin` signs in and reaches the dashboard (existing test, via the rewritten helper) | Fully-Automated | AC2 — the happy path |
| **E6** `auth.spec.ts` — `USERS.ceo` → three radios (Veent / JoJo Potato / Sweetleaf) → check Veent → dashboard | Fully-Automated | AC5 — the multi-org path renders and submits. **Does not** prove scoping (see item 42's honest limit) |
| **E7** `auth.spec.ts` — `test.use({ javaScriptEnabled: false })` full login | Fully-Automated (downgrades to M-2 if per-describe scoping is unavailable) | AC12 — progressive enhancement |
| **R1** Regression: `pnpm test:e2e tests/e2e/tenancy-switch.spec.ts` — the CEO lands in Veent and can switch orgs | Fully-Automated | The org switcher still reads a valid `currentOrgId`; the one spec that passes `org` explicitly |
| **R2** Regression: rate limiting still locks out after 5 failures — six wrong-password submits on one email produce the "Try again in N minutes" message | Hybrid — precondition: running app; the limiter is in-memory so the app must not restart mid-check | The unchanged `rateKey` still keys correctly through the new action name |
| **A1** `impeccable` audit pass on the two changed source files | Agent-Probe | Design-quality bar the CI gates cannot express (standing repo rule) |
| **M-1..M-4** Owner manual pass (table below) | Agent-Probe | AC15 — a real browser, a real person |

### Mutation checks (do not skip — a gate that cannot fail is not a gate)

Every gate above is a hypothesis until it has been run red. Record all six results in the phase report.

| # | Mutation | Must turn red |
|---|---|---|
| **M1** | Re-add `db.organization.findMany` to `load` and return `orgs` | G1 |
| **M2** | Change the step-2 heading to `Sign in to {form.orgs[0]?.name}` | G2 |
| **M3** | Make `?/resolve` return `{ email, orgs }` for a **single**-org email (drop the `>= 2` threshold) | U1 |
| **M4** | Re-introduce the word `Avipa` in a comment in `+page.server.ts` | the amended `copy-invariants` allow-list test — **proves Amendment 1 tightened rather than deleted the gate** |
| **M5** | Delete the `isMember` clause from the `?/signin` failure condition | U3 |
| **M6** | Change `resolveLoginOrgs` to read `db.organization.findMany()` instead of the user's memberships | U2 (the 4-orgs / 2-memberships fixture makes this fail; a `mockResolvedValue`-style mock would not) |

### Owner manual-test additions (for the PROGRAM CLOSE consolidated list)

Copy these verbatim into the phase report and append them to the consolidated list in
`phase-08-copy-a11y-s4-s6_REPORT_03-09-26.md`.

| # | Check | Expect |
|---|---|---|
| **M-1** | **Multi-org login as the CEO.** Open `/login`, type `ceo@veent.ph`, press Continue. | Three companies listed as radio choices — Veent, JoJo Potato, Sweetleaf — and nothing else. Pick JoJo Potato, sign in. The app opens **in JoJo Potato**, not Veent |
| **M-2** | **No-JavaScript login.** Turn JavaScript off in the browser, open `/login`, sign in as `admin@veent.ph`. | Both steps work as normal page loads. You reach the dashboard |
| **M-3** | **Bookmarked `/login`.** Bookmark `/login`, close the tab, open the bookmark. Then sign in, and open the bookmark again while signed in. | Fresh visit shows step 1 (email) with no company list. While signed in it redirects to `/dashboard` |
| **M-4** | **Unknown email look-and-feel.** Type an email that belongs to nobody (e.g. `nobody@example.com`) and press Continue. | It asks for a password exactly like a real email does — no "no such account", no different wording, no different timing you can see. Then any password gives `Invalid email or password` |

## Test Infra Improvement Notes

- **Gap found at plan time:** `src/lib/server/rate-limit.ts` has **no unit test** despite exporting
  `_resetForTests()` for one. The limiter guards the front door of the whole app. This phase does not
  change it, so writing that test is outside the blast radius — **resolution: backlog stub**, register
  `login-rate-limit-untested_NOTE_{date}.md` in `process/features/ui-ux-overhaul/backlog/` at
  UPDATE-PROCESS and name it in the phase report's known gaps. R2 covers it as a Hybrid check for this
  phase only.
- **Gap found at plan time:** `process/context/tests/all-tests.md` still terminates at the router
  ("No deeper test docs yet") — the same finding phase 05 recorded and phase 08 did not clear. The
  Playwright + `_dev/login-as` + `psql` harness is prose-only, not routable. Flag again at
  UPDATE-PROCESS; two phases have now hit it.
- **Gap found at plan time:** `/login?error=account_disabled` (`hooks.server.ts:45`) is a redirect to a
  message the login page has never rendered. Out of scope here; register as a backlog note at
  UPDATE-PROCESS so it is not lost.
- **Win to record, not a gap:** deleting `selectTenant` removes a 15-second `toPass` retry loop that
  existed only because step 2 was revealed client-side. A server-rendered step 2 is testable
  pre-hydration. Expect the e2e suite to get slightly faster and slightly less flaky; record the
  before/after in the phase report as evidence, not as a claim.
- (Further notes added during EVL.)

## New Backlog Note — `login-timing-parity`

Write `process/features/ui-ux-overhaul/backlog/login-timing-parity_NOTE_03-09-26.md` with frontmatter
(`name: note:login-timing-parity`, `feature: ui-ux-overhaul`, `date: {date}`) and these four findings:

- **D1 — no bcrypt on an unknown email.** `?/signin` returns 401 before `bcrypt.compare` when
  `findUnique` yields null (and when `isActive` is false). A known email costs a bcrypt round; an
  unknown one does not. Measurable. **Pre-existing**; phase 09 did not widen it and did not narrow it.
  The standard fix is a dummy `bcrypt.compare` against a fixed hash on the miss path.
- **D2 — no audit row on the unknown/inactive path.** A `LOGIN_FAILED` row is written only when the
  user exists. Password-spraying a list of non-accounts leaves no audit trail; only the in-memory
  rate limiter sees it, and it resets on restart.
- **D3 — the step-1 resolution read.** Phase 09 adds one `findUnique` per submitted email at
  `?/resolve`. The **response** is provably identical for every email (one shape, gated by U1), but
  the wall-clock time is not: a hit loads memberships, a miss does not. Owner declined option D (a
  rate limit on the resolution step) on 2026-09-03; it stays the named follow-on.
- **D4 — the email-case mismatch.** `db.user.findUnique({ where: { email } })` uses the raw submitted
  string while `rateKey` uses `email.toLowerCase()`. A `User.email` stored with capitals is
  unreachable by its lowercase form, yet both spellings share one rate-limit bucket. `User.email` is
  `@unique` **globally** (`prisma/schema.prisma:403`), so a case-normalising fix is safe in principle
  but changes who can log in — it needs an owner ruling and a data check first.

Close the note with: *"Fixing D1 and D4 together is the natural next auth-hardening pass, alongside
option D from `login-email-first-tenant-privacy_NOTE_03-09-26.md`."*

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)

## Resume and Execution Handoff

1. **Selected plan file:**
   `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-09-login-email-first_PLAN_03-09-26.md`
2. **Last completed step:** plan written. No code changed. Checklist item 1 not started.
3. **Validate-contract status:** pending — PVL has not run on this phase plan.
4. **Supporting context files loaded:** `process/context/all-context.md`,
   `process/context/tests/all-tests.md`,
   `process/features/ui-ux-overhaul/backlog/login-email-first-tenant-privacy_NOTE_03-09-26.md`,
   `ui-ux-overhaul-umbrella_PLAN_03-09-26.md`, `phase-05-destructive-actions_PLAN_03-09-26.md`
   (format model), `phase-08-copy-a11y_PLAN_03-09-26.md` (§S2 login pins, AC5/AC20),
   `phase-blast-radius-registry.md`, and the 13 source/test files listed under Touchpoints, all read
   at `feat/uiux-phase-8`.
5. **Next step for a fresh agent:** run Section 0. Branch `feat/uiux-phase-9` off
   **`feat/uiux-phase-8`** — not `staging`, and not any merged tip; the seven earlier PRs are still
   open. Record the `pnpm test:e2e` baseline **before** touching anything: Section 5's exit condition
   is a row-for-row comparison against it and there is no way to recover the number later. Then start
   at Section 1 (server) — the page in Section 2 renders off the server's return shape, so writing the
   page first means writing it twice.
6. **Primary execute anchor:** this file is the single execute anchor. Pass exactly this path to
   EXECUTE — not the umbrella, and not a folder.
7. **Supporting phase files** (read-only inputs, never the execute target):
   `ui-ux-overhaul-umbrella_PLAN_03-09-26.md` (charter, hard stops, per-phase loop — note it still
   says 8 phases until Section 7 item 53 lands),
   `phase-08-copy-a11y_PLAN_03-09-26.md` + its two reports (the login pins this phase must preserve,
   and the AC5/AC20 boundary this phase is explicitly authorised to cross),
   `backlog/login-email-first-tenant-privacy_NOTE_03-09-26.md` (the design record; its "NOT part of
   the program" line is superseded by this plan), and `phase-blast-radius-registry.md` (append this
   phase's claim before editing).

---

## OPEN DECISIONS

**None.** Every fork encountered while writing this plan was closed by a binding ruling or by a
recorded decision inside the plan. Listed here so a reviewer can confirm nothing was chosen silently:

| Fork | Closed by |
|---|---|
| Server round-trip vs single combined form for step 1 | Decided in "The Chosen Mechanic" — named actions, with the four alternatives and their rejection reasons written out |
| What a single-org email sees at step 2 | Decided — a **generic** heading, because naming the org would break ruling 2. Gated by G2 + M2 |
| Whether `?/resolve` may `fail()` on a malformed email | Decided — no. One response shape, forever. Gated by U1/AC4 |
| Replace the wrong-tenant e2e with a request-level test or a unit test | Ruling 5 asked for a choice; **unit test** (`login-resolution.test.ts` U3), rationale recorded at checklist item 40 |
| Rate limit on the resolution step | Ruling 4 — declined; recorded as the follow-on in the existing backlog note |
| Email-case normalisation | Out of scope; recorded as D4, needs an owner ruling and a data check |
| One backlog note for option D or two | Decided — amend the existing note (the task brief says so); only `login-timing-parity` is new |
| Password-field focus via `autofocus` vs `$effect` | Decided — `$effect`, because `autofocus` trips the a11y lint rule |

---

Plan complete. Review carefully. Say **'ENTER VALIDATE MODE'** when ready to proceed to plan
validation (required before implementation).
