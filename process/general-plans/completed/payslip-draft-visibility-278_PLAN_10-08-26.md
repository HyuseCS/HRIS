# PLAN — #278 Draft-payslip visibility: make every door strict

**Date**: 10-08-26
**Status**: COMPLETE — 8 commits on the branch, all gates green (`format:check`, `lint`, `check`, `test`, `test:e2e` 12/12, mutation sweep M1–M4, manual probe). Pushed; PR #288 open against `staging`. Remaining work: merge only.
**Complexity**: SIMPLE
**Issue**: #278
**Branch**: `fix/payslip-draft-visibility-278` (planned off `af10325`; now 8 commits ahead, pushed)

## Overview

**TL;DR:** Delete the two `VIEW_PAYROLL_REPORTS` escapes from the payslip draft gate so all three
single-payslip doors match the strict JSON door: nobody sees a payslip until its run is `APPROVED`
or its period is `RELEASED`. ~15 source lines across 5 files, plus the first tests the draft gate has
ever had. Complexity: **SIMPLE** (8 checklist steps, one session).

Branch: `fix/payslip-draft-visibility-278`, planned off `af10325` (clean at PLAN time; the executed
work is the 8 commits recorded in *Execution Record*). INNOVATE deliberately skipped — the policy is settled; this plan is the *how*.

---

## Policy (settled — do not relitigate)

Visibility begins at filing. `isPayslipVisible(run)` = `run.status === 'APPROVED' || run.period?.status === 'RELEASED'`
is the whole rule, for every actor including HR_ADMIN, CEO, FINANCE, PAYROLL_OFFICER, SUPER_ADMIN and
MANAGER. Finance keeps its pre-approval reconciliation path through the payroll CSV exports and the
`/payroll/[id]` inline table — both explicitly out of scope below.

---

## The four doors (proven exhaustive)

| | Door | File | Draft gate today | After |
|---|---|---|---|---|
| A | PDF | `src/lib/server/services/payroll/payslip-fetch.ts:117-126` (sole caller `src/routes/api/v1/payroll/payslips/[id]/pdf/+server.ts:9`) | escape | strict |
| B | Page | `src/routes/(app)/payslips/[id]/+page.server.ts:49-52` | escape | strict |
| C | JSON | `src/routes/api/v1/payroll/payslips/[id]/+server.ts:52-54` | **strict — the reference** | unchanged |
| D | List | `src/routes/(app)/payslips/+page.server.ts:20-23` | strict at the query, self-only | unchanged |

Plus one UI consequence: `src/routes/(app)/payroll/[id]/+page.svelte:186` renders the "Payslip" link
unconditionally at every run status. After the fix that link is a guaranteed 403 whenever the run is
not visible — i.e. DRAFT/COMPUTED *and* the period is not RELEASED. A RELEASED period still opens a
DRAFT or COMPUTED run, so those statuses are not 403 on their own.

---

## Fail-CLOSED discipline (read before touching any gate)

Every guard here is `if (BAD) 403`. The dangerous inverse is deleting `isPayslipVisible(...)` instead
of the privileged escape — that fails **OPEN** and silently ships drafts to everyone. Two structural
defences, both mandatory:

1. **Two sentinels, and they catch different mistakes** (VALIDATE correction — the earlier draft
   named only U5, which is not sufficient):
   - **U5, owner-on-DRAFT → 403.** Catches the guard being deleted *outright* (mutation M1). It does
     NOT catch the escape being kept, because an owner is not privileged either way.
   - **U7, owner-on-APPROVED → `ok: true`.** This is the row that catches the plan's named inverse —
     `isPayslipVisible(...)` deleted while `!isPrivileged` is kept, leaving `if (!isPrivileged) 403`.
     Under that edit U5 still passes and only U7 goes red.
   Keep **both**. Dropping U7 as "just an anti-lockout row" reopens the exact mistake this section warns about.
2. **Assert the message string, never just the status.** Both guards at every door answer 403 —
   the access guard says `'Access denied'`, the draft guard says `'Payslip not yet available'`.
   A status-only assertion passes even when the wrong guard was deleted.
3. **Door B is the exception, and it is a known residual.** `src/routes/+error.svelte` renders a
   hardcoded "You don't have permission to view this page." for *every* 403 and never prints
   `$page.error.message` — so neither guard's message reaches the rendered HTML. Try
   `page.request.get(url, { headers: { accept: 'application/json' } })` first: SvelteKit may answer a
   page-load `error()` with a JSON body carrying the message. If it does, assert the message on E3/E4.
   If it does not, fall back to status-only and accept the residual — a Door-B e2e that pins the
   access guard by behaviour is out of scope by USER DECISION. Doors A and C keep full message
   assertions (U1–U8, E5, E6), so this residual is Door B only.

The correct edit at Doors A and B is: delete the `isPrivileged` / `canAny(...)` conjunct, keep
`!isPayslipVisible(entry.payrollRun)` exactly as written.

---

## Touchpoints

Changed (5 files):

- `src/lib/server/services/payroll/payslip-fetch.ts` — Door A gate + comment
- `src/routes/(app)/payslips/[id]/+page.server.ts` — Door B gate + comment + orphaned import
- `src/routes/api/v1/payroll/payslips/[id]/+server.ts` — comment only (behaviour already correct)
- `src/lib/server/services/payroll/index.ts` — `getPayrollRun` include gains `period: { select: { status: true } }`
- `src/routes/(app)/payroll/[id]/+page.server.ts` + `.../+page.svelte` — `payslipVisible` flag and the `{#if}` on the link

New tests (2 files):

- `tests/unit/payslip-draft-visibility.test.ts`
- `tests/e2e/payslip-draft-visibility.spec.ts`

Read-only references: `src/lib/server/services/payroll/runs.ts:17-22`, `src/lib/rbac.ts:136`,
`prisma/schema.prisma:131-150,1072-1077`, `tests/unit/payslip-access.test.ts:19-53` (mock idiom),
`tests/e2e/payslip-tenancy.spec.ts` (seed/teardown idiom), `tests/e2e/helpers.ts` (`login`, `USERS`).

## Public Contracts

| Contract | Change |
|---|---|
| `fetchPayslipDocument(entryId, ctx)` | Signature unchanged. Behaviour narrows: returns `{ ok: false, status: 403, message: 'Payslip not yet available' }` for privileged callers on a non-visible run where it previously returned `{ ok: true, document }`. |
| `GET /api/v1/payroll/payslips/[id]/pdf` | 200 → 403 for VIEW_PAYROLL_REPORTS holders on a DRAFT/COMPUTED run whose period is not RELEASED. |
| `GET /payslips/[id]` | 200 → 403, same population. |
| `GET /api/v1/payroll/payslips/[id]` | Unchanged. |
| `getPayrollRun(...)` return shape | Gains `period: { status } \| null`. Additive. |
| `/payroll/[id]` load data | Gains `payslipVisible: boolean`. Additive. |
| `isPayslipVisible`, `canReadPayslip`, `CAPABILITIES` | Unchanged. No RBAC change is needed or permitted here. |

No schema change, no migration, no `db push`.

---

## Commit sequence (test-first)

Five commits, adopted from the prior sketch with two adjustments, both justified:

- **Commit 1 gets an APPROVED positive control alongside the RED cases**, so the same commit proves
  the gate is not simply always-403. A red-only commit cannot distinguish a fix from a lockout.
- **Commit 4 routes the template gate through `isPayslipVisible` on the server** (a `payslipVisible`
  boolean in the load's return) instead of re-writing the status test inline in the `.svelte`.
  Duplicating the rule in a fourth place is the exact defect #278 is filed about; a client component
  also cannot import `$lib/server/*`.

The two escape deletions stay in **one** commit so the doors never disagree mid-history.

### Commit 1 — RED: unit-test Door A's draft gate

`test: pin draft-payslip visibility at the PDF door (#278)`

New file `tests/unit/payslip-draft-visibility.test.ts`. Copy the mock idiom from
`tests/unit/payslip-access.test.ts:19-53`:

- `vi.hoisted` a `dbMock` with `payrollEntry.findUnique`, `organization.findUnique`,
  `attendanceDay.findMany`; `vi.mock('$lib/server/db', () => ({ db: dbMock }))`.
- `vi.mock('$lib/server/services/employee-access', () => ({ canTouchEmployee: vi.fn() }))` — the
  MANAGER arm of `canReadPayslip` is the only consumer and this keeps the file off the supervisors
  module. **VALIDATE correction:** `payslip-access.test.ts:19-53` mocks a *different* module
  (`$lib/server/services/supervisors` → `listReportIdsFor`). Borrow its *shape* — `vi.hoisted` +
  `vi.mock` + top-level `await import` — not its mock targets. `fetchPayslipDocument` touches exactly
  three db methods (`payrollEntry.findUnique`:70, `organization.findUnique`:128,
  `attendanceDay.findMany`:137) and nothing else, so that dbMock is complete.
- Only U4 needs `canTouchEmployee` mocked `true`. U1/U2/U3 never reach it: CEO, HR_ADMIN and FINANCE
  all hold `VIEW_PAY_ORGWIDE` (`src/lib/rbac.ts:150`) and return early. U8's EMPLOYEE returns `false`
  at the `VIEW_PAYROLL_REPORTS` arm before `canTouchEmployee` is consulted at all.
- `const { fetchPayslipDocument } = await import('$lib/server/services/payroll/payslip-fetch')`.
- One fixture factory `entryFor(runStatus, periodStatus)` returning a **complete** entry (Date
  `periodStart`/`periodEnd`, numeric money fields, `earnings: []`, `deductions: []`, `employee`
  with `userId`, `payrollRun.organizationId: 'org1'`, and — required — `payrollRun.period` as
  `{ status: periodStatus }` or `null`, because Door A's include selects it at
  `payslip-fetch.ts:94` and `isPayslipVisible` reads `run.period?.status`) so the APPROVED rows reach
  `ok: true` through the real assembler. `organization.findUnique` → `{ name, address, logoUrl }`;
  `attendanceDay.findMany` → `[]`.
- Every negative assertion checks **both** `status: 403` and `message: 'Payslip not yet available'`.

Expected at this commit: the four privileged rows FAIL (they return `ok: true` today); the two owner
rows and the two visible rows PASS. Record the failure output in the commit body — a RED commit that
was never observed red proves nothing.

### Commit 2 — the fix (both escapes, both comments, the orphan, in one commit)

`fix: no payslip is readable while its run is a draft (#278)`

**2a. `src/lib/server/services/payroll/payslip-fetch.ts`** — replace lines 117-126 (the six-line
rationale comment, the `isPrivileged` const, and the guard) with a comment stating the strict rule
and the guard alone:

- delete line 123 `const isPrivileged = canAny(ctx.roles, 'VIEW_PAYROLL_REPORTS')`
- line 124 becomes `if (!isPayslipVisible(entry.payrollRun)) {`
- lines 125 (`return { ok: false, status: 403, message: 'Payslip not yet available' }`) and 126 unchanged
- rewrite the 117-122 comment: visibility begins at filing; no capability opens a draft; Finance
  reconciles pre-approval through the payroll exports and `/payroll/[id]`, not through payslips; cite #278.
- **Keep the `canAny` import at line 8** — still used at lines 41 and 46 inside `canReadPayslip`.

**2b. `src/routes/(app)/payslips/[id]/+page.server.ts`**

- line 50 becomes `if (!isPayslipVisible(entry.payrollRun)) {` … `error(403, 'Payslip not yet available')`
- rewrite the line-49 comment to say the same rule as Door A/C, one sentence, citing #278
- **delete line 5** `import { canAny } from '$lib/server/rbac'` — after the conjunct goes it is
  orphaned, and `eslint.config.js` sets `@typescript-eslint/no-unused-vars: 'error'`, so `pnpm lint`
  fails if it stays. `pnpm test` will NOT catch this.

**2c. `src/routes/api/v1/payroll/payslips/[id]/+server.ts`** — comment only. The claim at lines 45-47
("Shared with the PDF and the /payslips page so no door is a way around another") describes the access
gate and was false of the draft gate eight lines below. It becomes true of both; move/extend the
sentence so it covers the draft gate too, and cite #278.

Expected: all of commit 1's tests green. No pre-existing test changes state — verified across
`tests/unit/**` and `tests/e2e/**`; `'Payslip not yet available'` appears at exactly three source
sites and in no test before this plan.

### Commit 3 — e2e across the doors with a seeded DRAFT run

`test: e2e draft-payslip 403 at every payslip door (#278)`

New `tests/e2e/payslip-draft-visibility.spec.ts`, modelled on `payslip-tenancy.spec.ts`:
`test.describe.configure({ mode: 'serial' })`, a `beforeAll` PrismaClient seed and an `afterAll`
teardown that deletes entries before runs.

Seed inside the seeded org (`employee@veent.ph`'s org):

- DRAFT run, period `2025-04-01 .. 2025-04-15` (free — no other spec or seed uses it; PayrollRun is
  unique on `(organizationId, periodStart, periodEnd)`), no `PayrollPeriod` attached (`period` is
  optional). One entry for `employee@veent.ph` with **`grossPay: 133713`, `netPay: 133713`** — a
  distinctive figure so a leak is greppable.
- APPROVED control run, period `2025-04-16 .. 2025-04-30`, one entry for the same employee,
  `grossPay: 30000`.

Assertions (each via `page.request` after `login`): see the matrix below. Every 403 body is also
asserted **not** to contain `'133713'` — a 403 that still ships the payload is not a fix.

### Commit 4 — stop rendering a link that is now a guaranteed 403

`fix: hide the Payslip link on a run whose payslips are not yet visible (#278)`

- `src/lib/server/services/payroll/index.ts` — inside `getPayrollRun`'s `include:` (opens at line 620,
  currently `entries` + `approvalSteps`), add `period: { select: { status: true } }`.
  **Verified safe:** the only production caller is `src/routes/(app)/payroll/[id]/+page.server.ts:54`;
  the only test is `tests/unit/payroll-run-scoping.test.ts:164-211`, which asserts on
  `include.entries.where` and recomputed totals only, never on the include object's shape, and whose
  mocked `RUN` literal has no `period` key.
- `src/routes/(app)/payroll/[id]/+page.server.ts` — import `isPayslipVisible` from
  `$lib/server/services/payroll/runs` and add `payslipVisible: isPayslipVisible(run)` to the object
  returned at lines 75-81.
- `src/routes/(app)/payroll/[id]/+page.svelte:186` — wrap the anchor:
  `{#if data.payslipVisible}` … `{/if}`. Match the status-conditional idiom of its sibling at line 191
  (`{#if data.canManage && run.status !== 'APPROVED'}`). **USER DECISION: suppress the anchor — do
  NOT render it disabled with a tooltip.** No `{@const}` is introduced; if one ever is, it must be an
  immediate child of the block tag.

E2E additions in the commit-3 spec: as `admin`, `/payroll/<draft-run-id>` shows no `Payslip` link;
`/payroll/<approved-run-id>` shows one. **Assert on the role, not on raw HTML** — use
`page.goto(...)` then `expect(page.getByRole('link', { name: 'Payslip' })).toHaveCount(0 | 1)`. A
substring search for `Payslip` over the response body is unreliable: the word appears elsewhere in
the run-detail markup, so a raw-text assertion is vacuous in one direction and flaky in the other.

### Commit 5 — mutation sweep (verification only, no source change)

No production diff. For each of the three now-strict gates, prove the new tests actually bite:

1. Copy the file to the scratchpad first (`cp`). **Never** `git checkout <file>` to revert — it
   silently discards uncommitted work.
2. Mutation M1: delete `isPayslipVisible(...)` and keep nothing (gate always passes) → the
   privileged DRAFT rows must go red.
3. Mutation M2: invert to `if (isPayslipVisible(...))` → owner-on-APPROVED rows must go red.
4. Mutation M3 (the fail-OPEN inverse, most important): restore the old escape → the privileged
   DRAFT rows must go red.
5. Mutation M4 (**added at VALIDATE** — the plan's named "inverse mistake", and the one M1–M3 miss):
   delete `isPayslipVisible(...)` but keep the escape, i.e. `if (!isPrivileged) { 403 }` → **U7 must
   go red** (owner-on-APPROVED now 403s). U5 stays green under M4; if U7 is the only red, that is the
   expected and correct result. If nothing goes red, U7 is missing or wrong.
6. Restore from the scratchpad copy; confirm `git status` clean and the suite green.

Commit only the sweep record (in the PR body or the commit message of commit 4 amended) — no file
changes. If any mutation leaves the suite green, the corresponding test is vacuous: fix it before
proceeding.

---

## Test matrix

Enum values are the real ones: `PayrollRunStatus` ∈ {DRAFT, COMPUTED, APPROVED, VOIDED};
`PayrollPeriodStatus` ∈ {OPEN, IMPORTED, GENERATED, LOCKED, RELEASED, VOIDED}.

### Unit — `tests/unit/payslip-draft-visibility.test.ts` (Door A, `fetchPayslipDocument`)

| # | Actor | Target | Run status | Period status | Expected |
|---|---|---|---|---|---|
| U1 | CEO | stranger | DRAFT | none (`null`) | 403 `'Payslip not yet available'` — **RED today** |
| U2 | HR_ADMIN | stranger | COMPUTED | LOCKED | 403 `'Payslip not yet available'` — **RED today** |
| U3 | FINANCE | stranger | COMPUTED | GENERATED | 403 `'Payslip not yet available'` — **RED today** |
| U4 | MANAGER (`canTouchEmployee` → true) | direct report | DRAFT | OPEN | 403 `'Payslip not yet available'` — **RED today** |
| U5 | EMPLOYEE (owner) | self | DRAFT | OPEN | 403 `'Payslip not yet available'` — **fail-OPEN sentinel** |
| U6 | CEO | stranger | DRAFT | RELEASED | `ok: true` — the period arm still opens it |
| U7 | EMPLOYEE (owner) | self | APPROVED | LOCKED | `ok: true` — the run arm still opens it |
| U8 | EMPLOYEE | stranger | DRAFT | OPEN | 403 **`'Access denied'`** — access gate answers first; pins gate ORDER |

U8 is why every row asserts the message: it is the only row that distinguishes "the draft gate fired"
from "the access gate fired".

### E2E — `tests/e2e/payslip-draft-visibility.spec.ts`

`D` = the DRAFT entry (`grossPay 133713`, `employee@veent.ph`), `A` = the APPROVED control entry.

| # | Door | Login | Entry | Expected |
|---|---|---|---|---|
| E1 | A `GET /api/v1/payroll/payslips/{D}/pdf` | ceo | D | 403; body has no `133713` |
| E2 | A `GET /api/v1/payroll/payslips/{D}/pdf` | admin | D | 403; body has no `133713` |
| E3 | B `GET /payslips/{D}` | ceo | D | 403; body has no `133713` |
| E4 | B `GET /payslips/{D}` | employee (owner) | D | 403; body has no `133713` — owner sentinel |
| E5 | C `GET /api/v1/payroll/payslips/{D}` | ceo | D | 403, JSON `error === 'Payslip not yet available'`; no `133713` |
| E6 | C `GET /api/v1/payroll/payslips/{D}` | manager | D | 403 `'Payslip not yet available'` (employee is their direct report, so the access gate passes and the draft gate is what answers) |
| E7 | A `GET /api/v1/payroll/payslips/{A}/pdf` | ceo | A | 200 — not over-blocked |
| E8 | B `GET /payslips/{A}` | employee (owner) | A | 200 |
| E9 | C `GET /api/v1/payroll/payslips/{A}` | ceo | A | 200 |
| E10 | D `GET /payslips` (list) | employee (owner) | — | page contains no `133713`; the APPROVED row is present |
| E11 | UI `GET /payroll/{draft run}` | admin | — | no `Payslip` link in the entries table (commit 4) |
| E12 | UI `GET /payroll/{approved run}` | admin | — | `Payslip` link present (commit 4) |

E7–E9 and E12 are the anti-lockout half of the matrix. Without them a change that 403s everything
would pass.

Roles used are the seeded accounts in `tests/e2e/helpers.ts`: `admin`, `ceo`, `manager`, `employee`.
`finance@veent.ph` / `payroll@veent.ph` exist in the seed but are not in `USERS`; their behaviour is
covered by U2/U3 at the unit level — do not add them to `helpers.ts` for this fix.

---

## Verification Evidence

CI order matters: `format:check` runs FIRST and everything after it is skipped on failure. Run in
exactly this order; the unit script is `pnpm test` — there is no `test:unit`.

```bash
pnpm format:check
pnpm lint          # the only gate that catches the orphaned canAny import
pnpm check
pnpm test
pnpm test:e2e
```

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| U1–U4 (privileged, non-visible run → 403 + message) | Fully-Automated | AC-1 no capability opens a draft payslip |
| U5, E4 (owner on DRAFT → 403) | Fully-Automated | AC-2 fail-CLOSED: the guard was not deleted outright (M1/M3). They do **not** discriminate M4 — under `if (!isPrivileged)` an owner is still not privileged, so both stay green; U7 is M4's sentinel |
| U6, U7, E7–E9 (APPROVED run / RELEASED period → 200) | Fully-Automated | AC-3 the fix does not over-block |
| U8, E6 (`'Access denied'` vs `'Payslip not yet available'`) | Fully-Automated | AC-4 gate order and identity preserved |
| E1–E3, E5 (all three doors 403 on the same DRAFT entry) | Fully-Automated | AC-5 the three doors agree |
| E1–E6 body grep for `133713` | Fully-Automated | AC-6 no payload ships inside a 403 |
| E10 (list door still self-only + visible-only) | Fully-Automated | AC-7 Door D unregressed |
| E11–E12 (`Payslip` link suppressed on a non-visible run) | Fully-Automated | AC-8 no UI affordance leads to a guaranteed 403 |
| `pnpm lint` after the import deletion | Fully-Automated | AC-9 no orphaned symbol |
| Commit-5 mutation sweep M1/M2/M3/M4 | Hybrid (agent-driven, asserted by the suite) | AC-10 the new tests are not vacuous |
| Which guard fires at **Door B** | Known-Gap (named residual) | no gate — `+error.svelte` hides both messages; Door-B access-guard e2e is out of scope by USER DECISION |
| Manual probe (below) | Agent-Probe | AC-11 real DB, real session, before/after 200→403 |

Acceptance criteria, each with its proving gate:

- **AC-1** — no `VIEW_PAYROLL_REPORTS` holder reads a payslip whose run is not visible.
  *proven by:* U1–U4 + E1/E2/E3/E5. *strategy:* Fully-Automated.
- **AC-2** — an owner still cannot read their own non-visible payslip.
  *proven by:* U5, E4. *strategy:* Fully-Automated.
- **AC-3** — every actor who could read a VISIBLE payslip before still can.
  *proven by:* U6, U7, E7, E8, E9. *strategy:* Fully-Automated.
- **AC-4** — the access gate and the draft gate remain distinct and ordered.
  *proven by:* U8, E6. *strategy:* Fully-Automated.
- **AC-5** — Doors A, B and C return the identical **status** for the same entry, and the identical
  **message** wherever the response exposes one. Doors A and C expose it and are asserted on it;
  Door B's 403 body is fixed by `src/routes/+error.svelte` and carries no message, so E3/E4 assert
  status and payload-absence only (RESIDUAL-1).
  *proven by:* E1, E3, E5. *strategy:* Fully-Automated.
- **AC-6** — no 403 response body contains payslip figures.
  *proven by:* E1–E6 `133713` grep. *strategy:* Fully-Automated.
- **AC-7** — Door D (list) behaviour unchanged. *proven by:* E10. *strategy:* Fully-Automated.
- **AC-8** — the run-detail page renders no Payslip link for a non-visible run.
  *proven by:* E11, E12. *strategy:* Fully-Automated.
- **AC-9** — repo lints clean. *proven by:* `pnpm lint`. *strategy:* Fully-Automated.
- **AC-10** — the new tests fail under each of the four mutations (M1–M4).
  *proven by:* commit-5 sweep. *strategy:* Hybrid.
- **AC-11** — the change is observable against a real database and real sessions.
  *proven by:* the manual probe. *strategy:* Agent-Probe.

One residual is assigned Known-Gap: **which of Door B's two 403 guards fired**. Doors A and C pin
gate order by message (U8, E6); Door B cannot, because `src/routes/+error.svelte` renders a fixed
403 body. Adding a Door-B access-guard e2e is out of scope by USER DECISION. Accepted — see the
validate-contract.

CI note: `format:check → lint → check → test` are sequential *steps of the `quality` job*
(`.github/workflows/ci.yml:36-46`), so a format failure really does skip the rest of them. `test:e2e`
is a **separate job** (`ci.yml:105`) that does not depend on `quality` and runs regardless. Run the
five commands in the order above locally anyway — it is still the cheapest failure ordering.

---

## Manual verification (Agent-Probe)

**The seed ships no payroll runs at all**, so any manual check without seeding is vacuous — the
"before" would 404, not 200, and prove nothing.

Setup (see `.claude/skills/verify/SKILL.md`; Postgres must be up, env is `.env.dev`):

1. **Do not run `pnpm db:push`.** This change has no schema component (see *Public Contracts*: "No
   schema change, no migration, no `db push`") and the Autonomous Goal Block's hard stops forbid it.
   Use an already-provisioned local dev database; if it is empty, run `pnpm db:seed` alone.
2. Seed the fixtures with a one-off script (scratchpad, `node --input-type=module -e` or `tsx`, using
   `@prisma/client`): in `employee@veent.ph`'s org create
   - DRAFT run `2026-01-01 .. 2026-01-15`, one entry for that employee, `grossPay`/`netPay` **133713**
   - APPROVED run `2026-01-16 .. 2026-01-31`, one entry for the same employee, `grossPay` 30000
   Print both entry ids.
3. `pnpm dev --port 5434` in the background; poll `curl http://localhost:5434/login` until 200.

Probe, run **before** the commit-2 fix and again **after** (log in through the real two-step login
form to get a session cookie — there is no `_dev/login-as` route in this repo; a Playwright script
per the verify skill, or `curl` with a saved cookie jar, both work):

| Actor | Request | Before (expected) | After (required) |
|---|---|---|---|
| ceo | `GET /api/v1/payroll/payslips/<draft-entry>/pdf` | 200, real PDF bytes | 403 |
| admin | `GET /api/v1/payroll/payslips/<draft-entry>/pdf` | 200, real PDF | 403 |
| finance@veent.ph | `GET /api/v1/payroll/payslips/<draft-entry>/pdf` | 200, real PDF | 403 |
| ceo | `GET /payslips/<draft-entry>` | 200 HTML with 133,713 | 403 |
| ceo | `GET /api/v1/payroll/payslips/<draft-entry>` | 403 (already strict) | 403 |
| ceo | `GET /api/v1/payroll/payslips/<approved-entry>/pdf` | 200 | 200 |
| admin | `GET /payroll/<draft-run-id>` | Payslip link present | link absent |

For every 403, grep the full response body for `133713` **and** `133,713` (the page formats with
separators). A 403 that still ships the figure is not a fix.

Teardown: delete the two entries then the two runs by their period dates.

---

## Blast Radius

- **Files changed:** 6 source (5 behavioural + 1 comment-only) + 2 new test files.
- **Packages/services:** one SvelteKit app; payroll services + two routes + one component. No schema,
  no migration, no `db push`, no RBAC table change, no dependency change.
- **Risk class:** MEDIUM. The change is small and fails closed, but it *removes* access that six
  roles currently have. The realistic failure is organisational, not technical: someone who used the
  PDF door to proof a draft run loses that path. Mitigated by design — the payroll CSV exports and
  the `/payroll/[id]` entry table and Breakdown are untouched and remain the pre-approval
  reconciliation surface.
- **Data risk:** none. Read-path only; nothing is written, deleted or migrated.
- **Cross-tenant risk:** none introduced; the org scoping at each door is untouched.

## Rollback

Revert **both** commit 2 (`058e673`, the gates) and commit 4 (`a841024`, the `payslipVisible` flag and
the `{#if}` on the link) together — `git revert a841024 058e673` — and the prior behaviour is restored
exactly. No state to unwind, no data written, no schema to reverse.

Neither commit is safe to revert alone:

- Commit 2 alone reopens direct access at Doors A and B, but commit 4's `payslipVisible` still hides
  the Payslip link on a non-visible run, so the run-detail page offers no route to a payslip that is
  once again readable.
- Commit 4 alone re-shows a link that the still-strict gates answer with 403 — i.e. today's bug.

If a partial revert is unavoidable, document which of those two inconsistent states was chosen and why.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Guard deleted outright (fails OPEN) | U5 + E4 owner-on-draft sentinels; mutations M1/M3 in commit 5 |
| Fail-OPEN inverse: `isPayslipVisible` deleted while the escape is kept (`if (!isPrivileged)`) | **U7** owner-on-APPROVED sentinel; mutation M4. U5 and E4 stay green under M4 — an owner is not privileged either way — so they are not mitigations for this row |
| Wrong guard deleted (access instead of draft) | Every assertion checks the message string; U8 + E6 |
| Orphaned `canAny` import breaks CI at `lint`, after `test` was already green | Called out explicitly in commit 2b; `pnpm lint` is step 2 of the verification order |
| `getPayrollRun` include change breaking a caller | Verified: one production caller, one test that never asserts include shape |
| E2E period collision on `@@unique([organizationId, periodStart, periodEnd])` | 2025-04-01/15 and 2025-04-16/30 confirmed unused by any spec or seed; spec is `mode: 'serial'` with its own teardown |
| Over-blocking (403 for everyone) passing as a fix | E7–E9, U6, U7, E12 are the anti-lockout half of the matrix |

## Notes (record only — explicitly NOT fixed here)

- `isPayslipVisible` admits a **VOIDED** run whose period is RELEASED. Pre-existing, identical at all
  four doors, unchanged by this fix. The status matrix surfaces it; do not fix it here and do not add
  a test that locks the behaviour in either direction.
- The three payroll CSV generators (`reports.ts:338/518/579`) filter on date range only, not run
  status. **Deliberate** — it is Finance's pre-approval reconciliation path and the reason this fix is
  painless for them. Do not touch, do not file.
- The `/payroll/[id]` inline entry table and Breakdown keep showing draft figures. Intended.
- Door B has no e2e coverage beyond the draft-gate cases this fix adds. **USER DECISION: out of scope.**
- No RBAC or capability change is needed. `VIEW_PAYROLL_REPORTS` keeps its six roles (`src/lib/rbac.ts:136`).

## Test Infra Improvement Notes

- The draft gate had **zero** test coverage before this plan: `'Payslip not yet available'` appeared
  at three source sites and in no test file. Commit 1 closes that for Door A and commit 3 for all
  three doors — but the general lesson is that a guard whose message appears in no test is
  deletable without CI noticing. Worth a repo-wide sweep for other message strings with no test
  reference; **not in this fix's scope.**
- `tests/e2e/helpers.ts` `USERS` omits `finance@veent.ph` and `payroll@veent.ph` despite both being
  seeded, which is why U2/U3 stay at the unit level. Adding them would broaden several existing
  specs' reach cheaply. Noted, not done here.

## Implementation Checklist

1. [x] Create `tests/unit/payslip-draft-visibility.test.ts` with rows U1–U8 (mock idiom from
   `tests/unit/payslip-access.test.ts:19-53`); run `pnpm test` and record U1–U4 failing. Commit 1.
   — Done: `a07718d`. Observed RED (U1–U4 failing, 4 rows passed as positive controls).
2. [x] `src/lib/server/services/payroll/payslip-fetch.ts`: delete line 123 (`isPrivileged`), drop the
   conjunct at line 124, rewrite the 117-122 comment. Keep the `canAny` import at line 8.
   — Done: `058e673`.
3. [x] `src/routes/(app)/payslips/[id]/+page.server.ts`: drop the `canAny(...)` conjunct at line 50,
   rewrite the line-49 comment, delete the now-orphaned import at line 5.
   — Done: `058e673`.
4. [x] `src/routes/api/v1/payroll/payslips/[id]/+server.ts`: correct the lines 45-47 comment so its
   "no door is a way around another" claim covers the draft gate too. Run `pnpm test` (green) and
   `pnpm lint` (green). Commit 2.
   — Done: `058e673`. Doors A + B fix and comment landed in one commit as planned.
5. [x] Create `tests/e2e/payslip-draft-visibility.spec.ts` with the seed/teardown and rows E1–E10;
   `pnpm test:e2e`. Commit 3.
   — Done: `083f663` (206-line spec). **`pnpm test:e2e` confirmed GREEN: 12/12 passed in 52.8s**, run
   in isolation against a clean server.
6. [x] `src/lib/server/services/payroll/index.ts`: add `period: { select: { status: true } }` to
   `getPayrollRun`'s include (opens line 620).
   — Done: `a841024`.
7. [x] `src/routes/(app)/payroll/[id]/+page.server.ts`: import `isPayslipVisible` and return
   `payslipVisible: isPayslipVisible(run)`; `src/routes/(app)/payroll/[id]/+page.svelte`: wrap the
   line-186 anchor in `{#if data.payslipVisible}`. Add E11–E12 to the spec. Full CI order. Commit 4.
   — Done: `a841024`. E11/E12 added inside the commit-3 spec file per plan.
8. [x] Run the commit-5 mutation sweep (M1/M2/M3, scratchpad `cp` for restore — never `git checkout`),
   then the manual probe. Record both in the PR body.
   — Done: `3edbff6`. Mutation sweep ran **M1–M4** (M4 added at VALIDATE, see Fail-CLOSED discipline);
   all four bit — M1 5 failed, M2 7 failed, M3 4 failed, M4 5 failed. No mutation left the suite
   green. Manual probe run against real DB/sessions — see Execution Record below.

Additional commit made outside the original 5-commit sequence:

- `e7d02f4` `test(e2e): raise the per-test timeout to 120s so CI does not flake` — `playwright.config.ts`
  only. Not anticipated by the plan; added because the real two-step login costs ~60s cold against a
  30s Playwright default, which was flaking the pre-existing `payslip-tenancy` spec too. Suite-wide
  timeout bump, not scoped to this fix's own spec.

## Phase Completion Rules

This is a single-phase SIMPLE plan; each commit is its own gate.

- A commit is **CODE DONE** when its edits are in place and `pnpm test` passes.
- A commit is **VERIFIED** only when the full CI order passes in sequence
  (`format:check` → `lint` → `check` → `test` → `test:e2e`) — `lint` is not optional here, it is the
  only gate that catches the orphaned import in commit 2.
- The plan is **COMPLETE** only when every AC-1…AC-11 row in Verification Evidence has a green
  proving gate, the commit-5 mutation sweep has been run and recorded, and the manual probe's
  before/after table has been filled in with observed status codes.
- No step may be marked done on the strength of a passing suite alone if its proving gate is the
  mutation sweep or the manual probe.
- Testing context: `process/context/all-context.md` and `process/context/tests/all-tests.md` do not
  exist in this repo (vc-setup was never run) — the test routing used here is the repo's own
  `vitest.config.ts` (`tests/unit/**`) and `playwright.config` (`tests/e2e/**`).

## Execution Record (added by UPDATE PROCESS, 10-08-26)

**Commits, in order** (8 on top of `af10325`, all pushed; PR #288 open against `staging`):

1. `a07718d` test: pin draft-payslip visibility at the PDF door
2. `058e673` fix: no payslip is readable while its run is a draft
3. `083f663` test: e2e draft-payslip 403 at every payslip door
4. `a841024` fix: hide the Payslip link on a run whose payslips are not yet visible
5. `3edbff6` chore: record the #278 mutation sweep and real-DB probe
6. `e7d02f4` test(e2e): raise the per-test timeout to 120s so CI does not flake
7. `16f2c05` docs(plans): record the #278 draft-payslip visibility plan
8. `07615f3` docs(plans): reconcile #278 execution against plan; add backlog notes

**Deviations from the plan text — both anticipated, both already justified inline (see "Commit
sequence (test-first)" above), confirmed as executed exactly as written:**

1. Commit 1 added an APPROVED positive control alongside the RED unit rows, so the same commit
   proves the gate isn't simply always-403. Executed as planned.
2. Commit 4 routed the run-detail template gate through a server-side `payslipVisible: boolean`
   computed by `isPayslipVisible(run)` in the load, rather than re-testing run/period status inline
   in the `.svelte` file. Executed as planned — avoids a fourth place the visibility rule could drift.

No unplanned deviations in the gate logic itself. One unplanned *addition* (not a deviation from the
fix): the `e7d02f4` Playwright timeout bump, see checklist item 8's note above.

**Gate results, as verified — do not re-run, use these:**

| Gate | Result |
|---|---|
| `pnpm format:check` | clean |
| `pnpm lint` | 0 errors; 1 pre-existing `CalculatorWindow.svelte:82` a11y warning, unrelated to this fix |
| `pnpm check` | 885 files, 0 errors |
| `pnpm test` | 94 files / 1178 tests passed (baseline at af10325 was 93 files / 1170 tests) |
| `pnpm test:e2e` | **12/12 passed in 52.8s**, run in isolation against a clean server |
| Mutation sweep M1–M4 | M1 deleted → 5 failed; M2 inverted → 7 failed; M3 escape restored → 4 failed; M4 escape kept, visibility test deleted → 5 failed. No mutation left the suite green — AC-10 holds |
| Real-DB probe (AC-11) | `ceo`/`admin` both 200 → 403 on `GET /api/v1/payroll/payslips/<draft>/pdf`; page door 200 with `133,713` in body → 403; APPROVED control stayed 200/200; Payslip link count on the draft run went 1 → 0, stayed 1 → 1 on the approved run |

**Durable learnings from this task:**

1. VALIDATE caught a real defect in the plan's own sentinel attribution: U5 (owner on DRAFT → 403)
   was credited as the fail-OPEN catch-all, but it does not catch the inverse mistake of deleting
   `isPayslipVisible(...)` while keeping the privileged escape — under that mutation the guard becomes
   `if (!isPrivileged)`, an owner is not privileged, so U5 stays green. U7 (owner on APPROVED →
   `ok: true`) is the row that actually dies under that mutation. Mutation M4 was added at VALIDATE to
   close the gap. **General lesson: a sentinel test's claimed coverage must be traced through the
   specific mutation it is supposed to catch, not assigned by intuition.**
2. RESIDUAL-1 (Door B's guard identity is unpinned) is accepted, not closed — `+error.svelte` renders
   a fixed 403 body and never surfaces `$page.error.message`, and `accept: application/json` did not
   change that. Doors A and C pin gate order by message (U8, E6); Door B cannot.
3. This is the **6th occurrence** in this repo of the twin-door pattern (guard one door, its twin
   stays open). The RESEARCH phase proving the four-door list exhaustive — grepping
   `isPayslipVisible`, `payslipVisibleRunFilter`, `canReadPayslip`, `fetchPayslipDocument`, and every
   `db.payrollEntry.find*` call site — is what made this fix trustworthy. Worth grepping for a guard's
   call sites exhaustively before considering any RBAC/visibility fix complete.
4. `pnpm lint` was the *only* gate that caught the orphaned `canAny` import at Door B; `pnpm test`
   stayed green with it still present. `pnpm check` also did not catch it (unused imports are a lint
   rule, not a type error).
5. Test-infra gap, recorded not fixed: `finance@veent.ph` and `payroll@veent.ph` are seeded but absent
   from `tests/e2e/helpers.ts`'s `USERS`, so FINANCE and PAYROLL_OFFICER coverage of this fix rests on
   unit rows U2/U3 only, never at the HTTP layer.
6. The real two-step login form costs ~60s cold against Playwright's 30s default timeout, and was
   flaking the pre-existing `payslip-tenancy` spec for the same reason this fix's new spec would have
   flaked. Fixed suite-wide via `playwright.config.ts` rather than per-spec.

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/payslip-draft-visibility-278_PLAN_10-08-26.md`
2. **Last completed step:** all of them — checklist items 1–8 are done. Branch
   `fix/payslip-draft-visibility-278`, 8 commits on top of `af10325`, pushed.
3. **Validate-contract status:** CONDITIONAL, accepted; see *Validate Contract* below. One named
   residual (RESIDUAL-1) carried deliberately.
4. **Gate status:** all green — `format:check` clean, `lint` 0 errors (1 pre-existing
   `CalculatorWindow.svelte:82` a11y warning), `check` 885 files / 0 errors, `test` 94 files / 1178
   passed, `test:e2e` 12/12 in 52.8s. Mutation sweep M1–M4 and the real-DB probe both recorded above.
5. **Next step:** **merge only.** PR #288 is open against `staging`. There is no implementation work
   left — do NOT re-run the checklist or re-apply any commit. Anything further is review feedback on
   the existing diff.
6. **Known unrelated issue:** **#287** — the full local e2e suite fails non-deterministically on
   `page.goto('/login')` timeouts, caused by Vite dev compiling routes on demand. Unrelated to this
   change; run this spec in isolation to reproduce the 12/12.

## Validate Contract

Status: CONDITIONAL
Date: 10-08-26
date: 2026-08-10
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 3/7 signals (S2 auth surface, S6 high-risk class permission/trust-boundary, S7 borderline —
8 files incl. tests). Nominally MEDIUM, but the auto-skip/fit rule dominates: ~15 source lines on one
tightly-coupled authorization path where every finding depends on every other. Fan-out was run as
depth-first sequential verification against source at af10325 rather than breadth-first subagents,
per the caller's explicit instruction to weight the auth/correctness dimension over infra breadth.
Cost guard: not triggered (1 agent).

### Test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1 | No `VIEW_PAYROLL_REPORTS` holder reads a payslip whose run is not visible | Fully-Automated | `pnpm test` — U1–U4 in `tests/unit/payslip-draft-visibility.test.ts`; `pnpm test:e2e` — E1, E2, E3, E5 | B |
| AC-2 | An owner still cannot read their own non-visible payslip | Fully-Automated | `pnpm test` — U5; `pnpm test:e2e` — E4 | B |
| AC-3 | Every actor who could read a VISIBLE payslip before still can (anti-lockout) | Fully-Automated | `pnpm test` — U6 (period arm, RELEASED), U7 (run arm, APPROVED); `pnpm test:e2e` — E7, E8, E9 | B |
| AC-4 | Access gate and draft gate remain distinct and ordered at Doors A and C | Fully-Automated | `pnpm test` — U8 asserts `'Access denied'`; `pnpm test:e2e` — E6 asserts `'Payslip not yet available'` | B |
| AC-5 | Doors A, B and C return identical status for the same DRAFT entry | Fully-Automated | `pnpm test:e2e` — E1, E3, E5 | B |
| AC-6 | No 403 response body contains payslip figures | Fully-Automated | `pnpm test:e2e` — E1–E6 assert body excludes `133713` | B |
| AC-7 | Door D (list) behaviour unchanged | Fully-Automated | `pnpm test:e2e` — E10 | B |
| AC-8 | Run-detail page renders no Payslip link for a non-visible run | Fully-Automated | `pnpm test:e2e` — E11/E12 via `getByRole('link', { name: 'Payslip' })` count 0/1 | B |
| AC-9 | Repo lints clean after the orphaned `canAny` import is deleted | Fully-Automated | `pnpm lint` exits 0 | B |
| AC-10 | The new tests are not vacuous | Hybrid | Commit-5 mutation sweep M1/M2/M3/**M4**; precondition: scratchpad `cp` of each gate file, never `git checkout` | B |
| AC-11 | Change is observable against a real DB and real sessions | Agent-Probe | Manual before/after probe table; precondition: Postgres up, `.env.dev`, an already-provisioned local dev DB (`pnpm db:seed` alone if empty — **never `db:push`**), fixture seed script, `pnpm dev --port 5434` | B |
| RESIDUAL-1 | *Which* of Door B's two 403 guards fired | — | none — `src/routes/+error.svelte` renders a fixed 403 body for both guards; a Door-B access-guard e2e is out of scope by USER DECISION | D |

gap-resolution legend: A — proven now. B — gate added by this plan's checklist. C — deferred to a named later phase. D — backlog test-building stub (named residual; keep-active; continue).

Failing stubs (Fully-Automated rows — red-first starting points for EXECUTE):

```ts
test("should 403 'Payslip not yet available' for a VIEW_PAYROLL_REPORTS holder on a non-visible run", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC-1 U1-U4")
})
test("should 403 an owner reading their own DRAFT payslip", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC-2 U5")
})
test("should still return ok:true on an APPROVED run and on a RELEASED period", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC-3 U6/U7")
})
test("should answer 'Access denied' from the access gate before the draft gate is reached", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: AC-4 U8")
})
```

Legacy line form (retained for existing validate-contract consumers):

- Door A unit gate: Fully-automated: `pnpm test`
- Doors A/B/C/D e2e: Fully-automated: `pnpm test:e2e`
- Orphaned-import gate: Fully-automated: `pnpm lint`
- Format/type gates: Fully-automated: `pnpm format:check`, `pnpm check`
- Mutation sweep: hybrid: M1–M4 by hand + `pnpm test` — precondition: scratchpad file copies for restore
- Real-DB probe: agent-probe: before/after 200→403 across the seven rows in *Manual verification*
- Door B guard identity: known-gap: documented as named residual RESIDUAL-1

Dimension findings:

- Infra fit: PASS — every command in *Verification Evidence* exists verbatim in `package.json` (`test` = `vitest run`; there is no `test:unit`) and in `.github/workflows/ci.yml:36-46,105`. `.prettierignore` lists `process/`, so this plan file itself cannot trip `format:check`. One correction applied to the plan: `test:e2e` is a separate CI job, not a step after `test`.
- Test coverage: CONCERN (mitigated) — draft-gate coverage is currently zero, and the plan's own sentinel attribution was wrong (U5 does not catch the inverse it was credited with; U7 does). Corrected in *Fail-CLOSED discipline* and a fourth mutation M4 added to the commit-5 sweep. One residual remains: RESIDUAL-1.
- Breaking changes: PASS — the Public Contracts table is accurate. `getPayrollRun`'s include change verified additive and safe: one production caller (`src/routes/(app)/payroll/[id]/+page.server.ts:54`) and one test (`tests/unit/payroll-run-scoping.test.ts:164-211`) that asserts only `include.entries.where` and recomputed totals, over a `RUN` literal with no `period` key. `isPayslipVisible`'s parameter type (`{ status: string; period?: { status: string } | null }`, `runs.ts:17-22`) accepts the Prisma enum unions, so `pnpm check` is unaffected.
- Security surface: PASS — this is a fail-closed narrowing of an authorization read path. STRIDE: information disclosure strictly decreases; no new trust boundary, no elevation path, no write path, no schema change, no RBAC change. The only introduced risk class is over-denial (availability), and it is covered — U6, U7, E7, E8, E9, E12 all go red under an always-403 edit, and U6 specifically pins the `period.status === 'RELEASED'` arm that a naive "simplify to APPROVED" edit would silently drop.
- Section — Commit 1 (unit RED): CONCERN (mitigated) — mechanically feasible; `fetchPayslipDocument` touches exactly three db methods, all three named in the plan. Two gaps fixed: the cited mock idiom (`payslip-access.test.ts:19-53`) mocks `$lib/server/services/supervisors`, a different module from the `employee-access` mock this file needs; and the fixture must carry `payrollRun.period`, which Door A's include selects at `payslip-fetch.ts:94`.
- Section — Commit 2 (the fix): PASS — every citation exact at af10325. `payslip-fetch.ts`: comment 117-122, `isPrivileged` 123, guard 124-126; `canAny` imported at line 8 from `$lib/rbac` and still used at 41 and 46, correctly kept. Door B: the orphan is line 5, `import { canAny } from '$lib/server/rbac'` — a *different* module from Door A's, so the two import instructions do not conflict; guard 50-52, comment 49, access guard 46-48. Door C comment 45-47, strict gate 52-54.
- Section — Commit 3 (e2e): CONCERN (mitigated) — the period-collision claim is independently confirmed: the string `2025-04` appears **nowhere** in `tests/`, `prisma/` or `src/`, and the only three `payrollRun.create` sites use 2025-02-01/15, 2025-03-01/15 and 2026-01-01/15. Two gaps fixed: E11/E12 must assert on `getByRole('link')`, not a raw-HTML substring; and E3/E4 cannot assert the guard message (see RESIDUAL-1).
- Section — Commit 4 (UI link): PASS — `getPayrollRun`'s include opens at `index.ts:620`, currently `entries` + `approvalSteps`; the load returns at 75-81; the anchor is `+page.svelte:186` and the sibling status-conditional idiom is at 191. `admin` is unscoped (`HR_ADMIN` holds `VIEW_PAY_ORGWIDE`), so E11/E12 see the full entries table.
- Section — Commit 5 (mutation sweep): CONCERN (mitigated) — M1/M2/M3 as written do not cover the plan's own named "inverse mistake". M4 added.

Open gaps:

- RESIDUAL-1 — Door B's guard identity is unpinned: `src/routes/+error.svelte` renders a hardcoded "You don't have permission to view this page." for every 403 and never prints `$page.error.message`, so no e2e can distinguish Door B's `'Access denied'` from its `'Payslip not yet available'` off the rendered HTML. Concretely uncovered: an edit that removes Door B's access guard (lines 46-48) instead of the draft-gate conjunct would leave E3, E4 and E8 all green. Judged LOW likelihood — the checklist touches only lines 5, 49 and 50 — and the compensating control is that Doors A and C, which share `canReadPayslip`, both pin gate order by message (U8, E6). Closing it properly needs a Door-B access-guard e2e, which is **out of scope by explicit USER DECISION**. Accepted as a named residual with an execute-agent instruction to attempt the cheap version first (`accept: application/json` on `page.request`).
- Not a gap, recorded: `isPayslipVisible` admits a VOIDED run whose period is RELEASED. Pre-existing, identical at all four doors, unchanged, and deliberately not tested in either direction per the plan's Notes.

Execute-agent instructions:

1. Read *Fail-CLOSED discipline* before editing either gate. Keep **both** U5 and U7 — they catch different mutations.
2. Door A keeps its `canAny` import (line 8, `$lib/rbac`). Door B deletes its `canAny` import (line 5, `$lib/server/rbac`). These are different modules; do not generalise one to the other.
3. At Door B, edit only lines 5, 49 and 50. **Do not touch lines 46-48** — the access guard has no test that would notice its removal (RESIDUAL-1).
4. For E3/E4, first try `page.request.get(url, { headers: { accept: 'application/json' } })` and assert the message. If SvelteKit returns the HTML error page instead, drop to status-only, note the observed behaviour in the PR body, and leave RESIDUAL-1 standing. Do not weaken any other row to compensate.
5. Run the five gates in the documented order locally. `pnpm lint` is the only gate that catches the orphaned import — `pnpm test` will be green with it still present.
6. Record the observed RED output from commit 1 and the full M1–M4 sweep results in the PR body. A commit-5 mutation that leaves the suite green means the corresponding test is vacuous — fix it before proceeding.
7. Baseline recorded at validate time: `pnpm test` = 93 files / 1170 tests, all passing, at af10325. Any pre-existing failure appearing later is yours.

What this coverage does NOT prove:

- `pnpm test` (U1–U8) proves Door A's `fetchPayslipDocument` in isolation against a mocked Prisma. It does not prove the route wrapper at `src/routes/api/v1/payroll/payslips/[id]/pdf/+server.ts:9` passes the caller's full role set, nor that the real query returns the `period` relation — E1/E2/E7 cover that.
- `pnpm test:e2e` proves the four doors against the seeded org and the four accounts in `tests/e2e/helpers.ts`. It does **not** cover `finance@veent.ph` or `payroll@veent.ph` (seeded but absent from `USERS`) at the HTTP layer — those roles are covered only at the unit layer by U2/U3.
- No gate proves which of Door B's two guards fired (RESIDUAL-1).
- No gate covers a VOIDED run with a RELEASED period, at any door, deliberately.
- `pnpm lint` proves no unused symbol remains. It does not prove the rewritten comments are accurate; that is reviewer judgment.
- The mutation sweep (AC-10) proves the tests bite for the four mutations enumerated. It does not prove they bite for an unenumerated mutation.
- The manual probe (AC-11) is a single-session observation against a dev database. It does not prove production behaviour, concurrency, or caching interactions.
- Nothing here covers the three payroll CSV generators, the `/payroll/[id]` inline table or Breakdown — all explicitly out of scope and intentionally still showing draft figures.

Gate: CONDITIONAL — 0 FAILs, 5 CONCERNs, all 5 fixed in the plan text during V6; 1 named residual (RESIDUAL-1) carried with written justification. Classified CONDITIONAL rather than PASS because RESIDUAL-1 is developed behavior (Door B's gate order) with no Fully-Automated or Hybrid gate proving it, and a terminal PASS resting on a Known-Gap is not permitted.

Accepted by: session (autonomous run — user granted full autonomy for this validate pass and was not available for the V4 menu). Accepted concerns, by name: (1) U5/U7 sentinel misattribution — fixed in plan; (2) mutation sweep missing M4 — fixed in plan; (3) mock-idiom citation drift and missing `period` key in the unit fixture — fixed in plan; (4) E11/E12 raw-HTML link assertion — fixed in plan; (5) RESIDUAL-1 Door B guard identity — accepted as a named residual, closure is out of scope by prior USER DECISION.

## Autonomous Goal Block — SPENT (execution finished; kept as a record, not as instructions)

**Do not act on this block.** It was written before EXECUTE and its directives are all discharged.
The authoritative state is the *Status* header, the *Execution Record* and *Resume and Execution
Handoff* above: work complete, 8 commits, all gates green, PR #288 open, remaining work is merge only.

```text
SESSION GOAL (achieved)
Fix GitHub issue #278 in veent_hris: delete the two VIEW_PAYROLL_REPORTS escapes from the payslip
draft gate so all four payslip doors are strict — nobody reads a payslip whose run is not visible
(run not APPROVED and period not RELEASED). Follow
process/general-plans/active/payslip-draft-visibility-278_PLAN_10-08-26.md exactly, commits 1
through 5, test-first.

Branch: fix/payslip-draft-visibility-278 (off af10325). Package manager: pnpm, never npm.

AUTONOMY RULES (all discharged)
- Work commit by commit. Do not start commit N+1 until commit N's gates are green.
- Commit 1 must be observed RED before commit 2 is written. Record the failure output.
- Apply the seven execute-agent instructions in the plan's Validate Contract verbatim.
- Blocked items go to a backlog note; keep going with the rest.
- Do not relitigate the visibility policy. Do not touch the CSV generators, the /payroll/[id] inline
  table, the VOIDED+RELEASED case, or anything RBAC.

HARD STOPS (as they stood during EXECUTE)
- Do not push, open a PR, or merge. Local commits only.
  [superseded after EXECUTE completed: the branch is now pushed and PR #288 is open.]
- Never 'git checkout <file>' to undo a temp edit — copy to the scratchpad and restore from there.
- Do not run pnpm db:push or any migration; this change has no schema component. [still binding]
- Escalate if any pre-existing test outside the blast radius fails.

NEXT PHASE
Merge PR #288. No implementation work remains — the Implementation Checklist is fully done.

CONTRACT SUMMARY
Gate CONDITIONAL. 0 FAILs. 5 concerns, all fixed in the plan text. One named residual: Door B's
403 body is identical for both of its guards (src/routes/+error.svelte hides the message), so no
test pins which guard fired at Door B — accepted, closure out of scope by user decision.
Gates, in CI order: pnpm format:check -> pnpm lint -> pnpm check -> pnpm test -> pnpm test:e2e.
All five ran green; e2e was 12/12 in 52.8s.
pnpm lint is the only gate that catches the orphaned canAny import at Door B line 5.
Baseline at af10325: 93 test files, 1170 tests, all green; after the fix, 94 files / 1178 tests.
```

