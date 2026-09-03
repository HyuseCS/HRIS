---
phase: phase-09-login-email-first
date: 2026-09-04
status: COMPLETE_WITH_GAPS
feature: ui-ux-overhaul
plan: process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-09-login-email-first_PLAN_03-09-26.md
name: report:ui-ux-overhaul-phase-09-login-email-first
description: "Phase 9 execution report — login step 1 is email-first, the public tenant list is gone. Seven sections, seven commits, all seven mutations proven red. The e2e tier is unrun by instruction."
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: "09"
---

# Phase 9 — `login-email-first` — execution report

**TL;DR** — The login page no longer hands the customer list to anonymous visitors. Step 1 asks for
an email, the server resolves the account's org(s), and every email in the world gets the same
answer unless it belongs to two or more orgs. Seven sections, seven commits on
`feat/uiux-phase-9`. Full CI gate set green in CI order (214 files / 2461 tests). All seven mutation
checks M1-M7 turned their named gate red, with a green-again control on M4. **CODE DONE, not
VERIFIED** — the e2e suite was not run in this session by orchestrator instruction, so eight gates
stay unconfirmed, and the owner's browser pass is still owed.

**Status:** CODE DONE
**Branch:** `feat/uiux-phase-9`, off `feat/uiux-phase-8` (8365a24)
**Contract:** CONDITIONAL — all nine binding instructions E1-E9 applied, evidence pack written

---

## What Was Done

### Section 0 — entry checks and registry — commit `fbed3a2`

Items 1-2 skipped per contract E9: the branch already existed at 056f056 and `git switch -c` would
have errored. Confirmed `git branch --show-current` = `feat/uiux-phase-9`, tree clean.

Item 3 — line numbers re-read on disk. **No drift found** in any cited edit target: `load` +
`findMany` at `+page.server.ts:20-32`, membership check `:68-72`, `createSession` `:95`,
success-audit `organizationId` `:110`, the `loginSchema` Avipa comment `:13-16`, the tenant-button
block `+page.svelte:29-56`, `let selectedOrg = $state` `:13`, the `role="alert"` box `:73-85`,
`global-setup.ts:36-53`, `leave-balances.spec.ts:99`. Contract E6's four citation corrections all
re-verified independently and all four were right: `User.memberships` is `schema.prisma:415` (`:312`
is `Organization.memberships`), model `UserOrganization` `:351`, `@@unique([userId,
organizationId])` `:360`, `User.email @unique` `:403`, `tenancy-switch.spec.ts:15`. Applied to the
plan text, together with E4's strike of the absolute timing claim.

Item 4 — `## Phase 9` appended to `phase-blast-radius-registry.md`. Only overlap with an earlier
phase is `tests/unit/copy-invariants.test.ts` (phase 08's, already CODE DONE).

Item 5 — **NOT DONE.** See Plan Deviations.

Item 6 — baseline `pnpm test`: 213 files / 2453 tests green on the untouched branch.

### Section 1 — server, email-first resolution — commit `a49f88b`

`src/routes/(auth)/login/+page.server.ts`:

- `GENERIC = 'Invalid email or password'` used at all three failure sites; the literal is still in
  the file verbatim, with its single quotes, which is what both phase-08 pins grep for.
- `loginSchema` deleted. `resolveSchema` (email only) and `signinSchema` (email + password +
  **optional** `selectedOrg`) replace it. The Avipa comment went with `loginSchema`.
- `load` is now the redirect guard alone and returns nothing. `db.organization.findMany` is gone.
- New module-private `resolveLoginOrgs(email)`: one `findUnique` for every email, no early return
  before the read, union of the primary org and the membership orgs de-duplicated by id and sorted
  by name, `orgs` returned only when the set is ≥ 2, `soleOrgId` only when it is exactly 1.
- **Contract E1 applied:** `if (!user || !user.isActive) return { userId: null, orgs: [], soleOrgId:
  null }` before the union. This was the contract's top concern (C1) — without it a deactivated
  multi-org account would have had its full org list returned at `?/resolve` while being unable to
  sign in.
- **Contract E5 applied:** `?/resolve` does no DB read at all on the Zod-reject path and still
  returns the same object. A test asserts `user.findUnique` was never called for a malformed email.
- `?/signin` implements the plan's 10-step order verbatim. Every `fail()` carries `email` and
  `orgs`; the 429 path carries `orgs: []` with no DB read. `resolvedOrgId = selectedOrg ??
  r.soleOrgId` feeds both the session and the success audit, and `!resolvedOrgId` is in the failure
  condition, so a null session org is unreachable.
- The two `#5` "deliberately NOT transactional" comments carried across unchanged. The membership
  comment rewritten to say the check guards a **posted** value against forgery.

### Section 2 — client, the email-first page — commit `d45a2b8`

`src/routes/(auth)/login/+page.svelte`:

- `let selectedOrg = $state(...)` and the tenant-button block deleted. `data` prop dropped — `load`
  returns nothing now. The step is `{#if !form?.email}` / `{:else}`, derived from the server alone.
- Step 1: `Sign in` / `Enter your work email to continue`, the existing Email field carried across
  unchanged, `Continue` / `Checking…` on the existing button classes.
- Step 2: heading `Enter your password` — **generic**, the single easiest way to get this phase
  wrong. The submitted email is plain text below it, and "Change" is an `<a href="/login">`.
- The `role="alert"` error box carried across **verbatim**, comment included.
- Picker rendered only when `form.orgs.length > 1`: a `<fieldset><legend>Choose your company</legend>`
  radio group, first option `checked` so a no-JS submit always carries a value.
- Password focus via `bind:this` + `$effect`, not `autofocus` (a11y lint rule).
- `<svelte:head>`, the brand header, the footer and `<DevLoginSwitcher />` untouched.

### Section 3 — unit tests — commit `906ff1a`

New `tests/unit/login-resolution.test.ts` (7 tests):

- **U1** — unknown, malformed, single-org **and inactive multi-org** (AC8b) `?/resolve` results are
  `toEqual` except for the echoed email; a second test asserts no branch carries a `status` key; a
  third asserts no DB read on the malformed path.
- **U2** — four orgs in the table mock, two memberships, exactly those two returned name-sorted, and
  `organization.findMany` asserted never called.
- **U3** — valid email + valid password + a non-member `selectedOrg` → 401 generic, `LOGIN_FAILED`
  on `user.organizationId`, `createSession` never called.
- **U4** — single-org sign-in with no `selectedOrg` → `createSession('user-1', { currentOrgId:
  'org-a' })` and the `LOGIN` row on the same id.
- **U6** — an inactive account cannot sign in either.

Both `user.findUnique` and `userOrganization.findUnique` are keyed on the actual `where` clause, not
`mockResolvedValue`. That is what makes U1 able to fail.

`tests/unit/login-audit.test.ts` re-pointed at `actions.signin`, both assertions **unchanged**; mock
extended with the `organization` + `memberships` shape; `organization.findMany` mock dropped; its
`userOrganization` mock keyed on the compound id.

### Section 4 — copy/a11y invariant amendments — commit `4d22eb4`

- Amendment 1 applied: `ALLOWED_AVIPA` deleted, test renamed to `'leaves no Avipa string anywhere in
  src/'`, assertion `expect(offenders).toEqual([])`, docblock replaced. The gate **tightens**.
- Amendment 2 applied: the characterisation test deleted entirely.
- The three phase-08 login pins and the two `'Invalid email or password'` pins were run **unedited**
  and are green — the Section 2 carry-across was verbatim.
- **Contract E2 applied:** G1 is the `organization.findMany` half only. The `orgs`-key half was
  dropped, because `?/resolve` legitimately returns an `orgs` key and a file-level grep would be red
  forever. G2 (`no 'Sign in to {'`) added alongside it.

### Section 5 — e2e choke point — commit `a5f112b`

- `helpers.login()` rewritten to the plan's exact sequence. Signature `login(page, user, org =
  'Veent')` unchanged.
- `selectTenant` **deleted** with its docblock. Its 15-second `toPass` retry loop existed only
  because step 2 was revealed client-side.
- `global-setup.ts` warmup now fills Email, clicks Continue and waits for Password. Every
  `.catch(() => {})` kept; the stale comment about the client-side reveal rewritten.
- `leave-balances.spec.ts:99` stale `selectTenant` reference re-pointed.
- **Contract E3 applied:** the plan named 1 of 5 explicit-org call sites. The five are
  `tenancy-switch.spec.ts:15`, `branches.spec.ts:25/:62/:84`, `timesheet-punch-location.spec.ts:72`.
  None was edited. All five accounts are single-org, so the picker never renders and the argument is
  inert. **These five must be confirmed by name in the e2e run** — see Plan Deviations.

### Section 6 — auth.spec rewrites — commit `42534cb`

- `selectTenant` import dropped.
- `'invalid credentials are rejected'` rewritten, and now also asserts the Password field is still
  visible after the failure (AC6 — the failure must not collapse to step 1).
- `'valid credentials against the wrong tenant are rejected'` **deleted**, with a comment at the
  deletion point naming `tests/unit/login-resolution.test.ts` U3 as its replacement.
- Four new specs: the privacy assertion (E3), the multi-org CEO path (E6), non-enumeration (E4), and
  a no-JS describe (E7).
- **Contract E8 applied:** E7 is a real Fully-Automated spec —
  `test.describe('no-JS login', () => { test.use({ javaScriptEnabled: false }); ... })`. No
  downgrade. Confirmed by compile, not by memory: `pnpm exec tsc --listFiles` shows all 45
  `tests/e2e` files in the program and typechecks clean, so the installed playwright 1.61.1 accepts
  `javaScriptEnabled` in `test.use()`.

### Section 7 — backlog, umbrella, evidence pack — this commit

- `login-email-first-tenant-privacy_NOTE_03-09-26.md`: Status → `BUILT as phase 09 (PR #18).`,
  frontmatter `description` corrected, `## Follow-on: option D` appended. Rest of the note intact.
- `login-timing-parity_NOTE_03-09-26.md` written with D1-D4 plus **D5** (contract E4).
- Umbrella updated 8 → 9 phases: frontmatter, complexity, TL;DR, `/goal` block, Phase Ordering
  diagram, the Phased Delivery Plan heading and a new Phase 9 section, the Program Status Table, the
  Current Execution State and the Phase Loop Progress row.
- Evidence pack written to `harness/` (five files) and passes
  `validate-risk-artifacts.mjs` with 0 failures / 0 warnings.
- `validate-plan-artifact.mjs` on the phase plan: 0 failures / 0 warnings.

---

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| Baseline (Section 0) | `pnpm test` | GREEN — 213 files / 2453 tests |
| G4 — full CI gate set, CI order | `pnpm format:check && pnpm lint && pnpm check && pnpm test` | GREEN — format clean; lint 0 errors / 1 pre-existing warning (`CalculatorWindow.svelte:82`); svelte-check 1138 files 0 errors; 214 files / 2461 tests |
| G1, G2, G3 | `pnpm exec vitest run tests/unit/copy-invariants.test.ts tests/unit/a11y-invariants.test.ts` | GREEN — 69 tests |
| U1-U4, U6 | `pnpm exec vitest run tests/unit/login-resolution.test.ts` | GREEN — 7 tests |
| U5 | `pnpm exec vitest run tests/unit/login-audit.test.ts` | GREEN — 2 tests, assertions unchanged |
| e2e typecheck | `pnpm exec tsc -p tsconfig.json --noEmit` | GREEN — 45 `tests/e2e` files in the program |
| **G5 — full e2e** | `pnpm test:e2e` | **NOT RUN** — orchestrator owns it |
| **R2 — rate-limit lockout** | six wrong-password submits, running app | **NOT RUN** — hybrid, needs a server |
| **A1 — impeccable audit** | `impeccable` | **NOT RUN** — agent-probe |
| **M-1..M-4 — owner pass** | manual browser | **NOT RUN** — owner's |

### Mutation checks — all seven red, M4 with a green-again control

| # | Mutation | Gate | Result |
|---|---|---|---|
| M1 | Re-add `db.organization.findMany` to `load` | G1 | **RED** — `'the login server never reads the org table again'` failed (1 failed / 43 passed) |
| M2 | Step-2 heading → `Sign in to {form.orgs[0]?.name}` | G2 | **RED** — `'the password step never names the resolved org'` failed (1 / 43) |
| M3 | Drop the `>= 2` threshold in `resolveLoginOrgs` | U1 | **RED** — U1's deep-equal and U3 failed (2 failed / 5 passed) |
| M4 | Re-introduce `Avipa` in a comment in `+page.server.ts` | amended Avipa sweep | **RED** — `'leaves no Avipa string anywhere in src/'` failed (1 / 43). **Negative control:** reverted and re-ran immediately — 44/44 green. The gate tightened, it did not become permanently red |
| M5 | Delete `!isMember` from the `?/signin` failure condition | U3 | **RED** — U3 failed (1 failed / 6 passed) |
| M6 | Read `db.organization.findMany()` instead of memberships | U2 | **RED** — U1, U2, U3, U4 failed (4 failed / 3 passed). The 4-orgs/2-memberships fixture is what catches it |
| M7 | Delete the `isActive` guard (contract E1) | U1's AC8b case | **RED** — exactly the inactive-account case failed (1 failed / 6 passed) |

Every mutation was reverted from a scratchpad copy of the file, never with `git checkout`, and the
suite was re-run green after the last revert.

---

## Plan Deviations

Three. None is a hard-stop class; all three are within the blast radius or ordered by the
orchestrator.

**1. Section 0 item 5 — the pre-phase `pnpm test:e2e` baseline was NOT recorded.** The orchestrator's
launch instruction forbade running `pnpm test:e2e` or `npx playwright test` in this session and
reserved the e2e suite for the phase boundary. That instruction overrides the plan item, but it has a
real cost the plan called out: *"there is no way to recover the number later."* Section 5's exit
condition is a row-for-row comparison against a baseline that does not exist. **Impact:** when the
orchestrator runs the suite, a red spec cannot be attributed to this phase versus the known #287
flakiness by comparison — it must be read. The five explicit-org callers named under E3 should be
confirmed by name.

**2. `resolveLoginOrgs` also selects the primary org's `name`.** The plan's helper spec listed
`select: { id, isActive, organizationId, memberships: {...} }`, which yields the primary org's **id**
but not its name. The union is `{user.organizationId} ∪ membership org ids`, so an account whose
primary org has no `UserOrganization` row and which has memberships elsewhere would have needed a
name the query never fetched. Adding `organization: { select: { id, name } }` to the same
`findUnique` is one line, keeps it one query, and keeps the query shape identical for every email.
**Impact:** none on behaviour or on timing parity. The de-dup collapses it away for every seed
account, exactly as the plan predicted.

**3. Section gates ran in pairs, not one per section.** Section 1's gate (`pnpm check && pnpm lint`)
cannot pass while the page still reads `data.orgs`, and Section 3's full gate set cannot pass while
`copy-invariants` still expects the Avipa survivor Section 1 deleted. Sections 1+2 and 3+4 were
therefore gated together and then committed separately, in order. Both commits in each pair are
green at the pair boundary; the first commit of each pair is not independently green.

---

## Test Infra Gaps Found

- `src/lib/server/rate-limit.ts` still has **no unit test**, despite exporting `_resetForTests()` for
  one. It guards the front door of the whole app. This phase does not change it. **Backlog stub owed
  at UPDATE-PROCESS:** `login-rate-limit-untested_NOTE_{date}.md`. R2 covers it as a hybrid check for
  this phase only, and R2 is unrun.
- `process/context/tests/all-tests.md` still terminates at the router ("No deeper test docs yet").
  The Playwright + `_dev/login-as` + `psql` harness is prose-only, not routable. **Third phase to hit
  this** (05, 08, 09). Raise at UPDATE-PROCESS.
- `/login?error=account_disabled` (`hooks.server.ts:45`) is a redirect to a message the login page
  has never rendered. Out of scope here, and the rewrite does not start rendering it — `form?.error`
  is the only error source. Register as a backlog note at UPDATE-PROCESS.
- **Win, recorded as evidence not as a claim:** deleting `selectTenant` removes a 15-second `toPass`
  retry loop from every one of the ~40 specs that call `login()`. The before/after timing cannot be
  recorded here because the e2e suite was not run — the orchestrator should capture it.
- No component-render tier exists in this repo, so AC15 has no automated tier. Residual D.

---

## Closeout Packet

- **Selected plan:**
  `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-09-login-email-first_PLAN_03-09-26.md`
- **Finished:** checklist items 1-54 except item 5 (baseline) and items 49/50-partial (e2e, A1). All
  nine binding contract instructions E1-E9. All seven mutation checks. The evidence pack.
- **Verified:** every fully-automated unit and source-scan gate, green, each proven non-vacuous by a
  named red mutation. The CI gate set in CI order.
- **Still unverified:** the whole e2e tier (AC2, AC6, AC11, AC12 and gates E1/E3/E4/E5/E6/E7/R1), the
  hybrid rate-limit check R2, the `impeccable` pass A1, and the owner's browser pass AC15.
- **Cleanup remaining:** three backlog stubs owed at UPDATE-PROCESS (rate-limit untested,
  `account_disabled` unrendered, `all-tests.md` router dead end). PR #18 to be opened by the
  orchestrator, stacked on #17; **the owner merges**. Merge order for the chain stays #11 → #18.
- **Best next state:** `Keep in active/testing`. Not archivable — four verification tiers are unrun
  and phase completion rule 12 requires the owner's word.

---

## Forward Preview

### Test Infra Found

Unit tier is healthy and now has a good anti-vacuous pattern to copy: two different traps covered by
two different fixtures (`login-resolution.test.ts` — the unknown-email deep-equal kills a
where-ignoring `user.findUnique` mock, the 4-orgs/2-memberships fixture kills a read of the org
table). Reuse it anywhere a Prisma mock guards a boundary. The e2e tier remains the repo's weak
point: known flaky (#287), no routable harness doc, and no baseline was captured for this phase.

### Blast Radius Changes

`src/` is now **Avipa-free with no exceptions** — the one allowed survivor went with `loginSchema`.
`POST /login` with no action name no longer exists; callers use `?/resolve` or `?/signin`.
`PageData.orgs` is gone. `helpers.selectTenant` is gone. Anything written against those four facts
after 04-09-26 is wrong.

### Commands to Stay Green

```
pnpm format:check && pnpm lint && pnpm check && pnpm test
pnpm test:e2e                      # orchestrator, at the phase boundary
pnpm exec vitest run tests/unit/login-resolution.test.ts tests/unit/login-audit.test.ts
```

### Dependency Changes

None. No `package.json` change, no schema change, no migration, no new service, no capability change.

---

## Owner manual-test additions — for the PROGRAM CLOSE consolidated list

Copied verbatim from the plan. Appended to
`phase-08-copy-a11y-s4-s6_REPORT_03-09-26.md` as **Phase 09**.

| # | Check | Expect |
|---|---|---|
| **M-1** | **Multi-org login as the CEO.** Open `/login`, type `ceo@veent.ph`, press Continue. | Three companies listed as radio choices — Veent, JoJo Potato, Sweetleaf — and nothing else. Pick JoJo Potato, sign in. The app opens **in JoJo Potato**, not Veent |
| **M-2** | **No-JavaScript login.** Turn JavaScript off in the browser, open `/login`, sign in as `admin@veent.ph`. | Both steps work as normal page loads. You reach the dashboard |
| **M-3** | **Bookmarked `/login`.** Bookmark `/login`, close the tab, open the bookmark. Then sign in, and open the bookmark again while signed in. | Fresh visit shows step 1 (email) with no company list. While signed in it redirects to `/dashboard` |
| **M-4** | **Unknown email look-and-feel.** Type an email that belongs to nobody (e.g. `nobody@example.com`) and press Continue. | It asks for a password exactly like a real email does — no "no such account", no different wording, no different timing you can see. Then any password gives `Invalid email or password` |

**Note for M-1 (contract E7):** the picker's orgs are **name-sorted** and the first radio is
pre-selected, so the CEO's default selection is **JoJo Potato**, not Veent. That is deliberate.
Sorting the primary org first would disclose which org is primary and reopen the non-enumeration
ruling. Pick the company you want before pressing Sign In.

---

## Known Gaps

1. **The e2e tier is entirely unrun**, and no pre-phase baseline exists to compare against. Largest
   open item.
2. **R2** (rate-limit lockout through the renamed action) unrun — hybrid, needs a running app.
3. **A1** (`impeccable` audit) unrun — standing repo rule for UI work, still owed.
4. **AC15** (owner browser pass, M-1..M-4) unrun.
5. **The `?/resolve` enumeration channel is accepted, not closed** (contract C4, backlog D5). No gate
   measures wall-clock. Owner declined option D on 2026-09-03.
6. **The multi-org picker discloses membership** for a known 2+-org email. Inherent to option C,
   accepted by the owner (ruling 3).
7. **Unit gates prove branching against a mock**, not the real Postgres query, the real `@unique`
   behaviour, or that `memberships` actually joins.
8. `src/lib/server/rate-limit.ts` has no unit test; `/login?error=account_disabled` still renders
   nothing; `all-tests.md` is still a dead-end router. Three backlog stubs owed at UPDATE-PROCESS.
