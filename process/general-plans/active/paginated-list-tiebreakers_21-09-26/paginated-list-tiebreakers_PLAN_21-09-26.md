---
name: plan:paginated-list-tiebreakers
description: "Give every remaining paginated list a total sort order by appending a unique id tiebreaker, with a guard per site that ties the sort key deliberately."
date: 21-09-26
metadata:
  node_type: memory
  type: plan
---

# Paginated list tiebreakers — the nine (now ten) remaining instances

**Date**: 21-09-26
**Status**: ACTIVE — planned, not started
**Complexity**: SIMPLE (one session, 22 atomic steps, 3 commits)

**TL;DR** — Ten paginated lists sort on a non-unique column and so have no total order; page 1 and
page 2 are separate queries that can disagree, losing rows. Fix is one appended `{ id: … }` term per
site. Three commits: payroll first, then the skip/take services, then the in-memory-slice loaders.
Guards: two real e2e page walks with deliberately tied fixtures (the only proof that Postgres
actually orders totally), plus one cheap `orderBy`-contract unit file covering the other eight.
**Two verification corrections below: F1's tie likelihood is overstated, and a tenth instance was
missed.**

---

## Overview

A paginated list that sorts on a single non-unique column has no total order. Page 1 and page 2 are
separate HTTP requests, each re-running the sort. Postgres may legally return tied rows in a
different relative order per request, so a row can render on both pages while another becomes
unreachable. Four sites are already fixed in `5cedf52`; this plan closes the rest.

The fix shape is settled and identical everywhere: append a unique column as the final `orderBy`
term. Every model in scope keys on `id String @id @default(cuid())`, so `id` is always available,
always unique, and (because cuid carries a creation-time prefix) is monotonic with creation order.

## Goals

1. Every paginated or sliced list in `src/` has a total sort order.
2. Every fix carries a test that goes red without it — and whose fixtures deliberately tie the sort
   key, because a fixture with distinct timestamps cannot see this defect at all.
3. No behaviour change for untied rows; no refactoring beyond the tiebreaker.

## Scope

**In scope.** The ten sites in the Per-Site Fix Table below, their guards, and the re-run list.

**Out of scope.** Converting `listAssignableEmployees` (F7) to `skip/take`; the fetch-everything
query cost already tracked as a backlog item; any other change to the touched files.

---

## Verification Findings (read before executing)

The nine claimed sites were checked individually against source — sort-key uniqueness **and**
whether the result is genuinely paged or sliced across requests. Eight held up exactly as stated.
Two corrections:

### Correction 1 — F1's tie likelihood is overstated (the fix still holds)

The brief states F1 is **Certain** because "every payslip in one run shares it". That is true of the
`PayrollEntry` table generally, but it is **not true of this query**. The `/payslips` loader is
self-scoped:

```
where = { employeeId: myEmployee.id, payrollRun: payslipVisibleRunFilter }
```

One employee has at most one entry per run, so two rows only tie when **two different payroll runs
share a `periodStart`**. `PayrollRun` carries `@@unique([organizationId, periodStart, periodEnd])`,
so that requires two runs with the same start and a different end — reachable through custom /
flexible period ranges (`#163`, `payroll-custom-range-overlap.spec.ts`) but not routine.

**Revised tie likelihood: Medium, precondition-gated — NOT Certain.** The site is still a genuine
instance and is still fixed, but it does not earn the premium e2e budget the "Certain" label would
have bought it. Its guard is downgraded to a unit contract test accordingly (see Guard Table).

### Correction 2 — a tenth instance the sweep missed

`listPendingRequestsForApprover` — `src/lib/server/services/approvals.ts:388` — sorts
`{ createdAt: 'asc' }` and is consumed by `/requests/approvals/+page.server.ts:41-42`, which filters
in JS (`canActOnStage`) and then slices in memory, re-querying on every request. Identical shape to
F8/F9. It is added to this plan as **F10**.

### Confirmed NOT instances (verified, do not touch)

| Site | Why it is safe |
|---|---|
| `attendance/index.ts:118` `listAttendanceDays` | Paged, sorts on `date` — but `AttendanceDay` has `@@unique([employeeId, date])` and the query filters to a single `employeeId`. `date` is already unique across the result set. A tiebreaker here would be dead code. |
| `settings/roles/+page.server.ts` | Slices in memory, but its source `listOrgUsers` sorts on `email`, which is unique. |
| `leave.ts:228` `listOrgLeaveBalances`, `team/+page.server.ts:86`, `attendance/+page.server.ts:85` | Already end in `{ id: 'asc' }`. |
| Nested `include` orderings (e.g. `entries: { orderBy: { date: 'asc' } }`) | Read whole inside one request. One request means one consistent sort. |

---

## Touchpoints

| File | Change |
|---|---|
| `src/routes/(app)/payslips/+page.server.ts` | F1 — `orderBy` object → array + `{ id: 'desc' }` |
| `src/lib/server/services/timesheets.ts` | F2 — `listTimesheets` orderBy |
| `src/lib/server/services/requests/index.ts` | F3 — `listRequests` orderBy |
| `src/routes/(app)/reports/audit-log/+page.server.ts` | F4 — orderBy |
| `src/lib/server/services/employees.ts` | F5 — `listEmployees` orderBy |
| `src/lib/server/services/recruitment.ts` | F6 — `listJobPostings` orderBy |
| `src/lib/server/services/settings/org.ts` | F7 — `listAssignableEmployees` orderBy |
| `src/lib/server/services/action-proposals.ts` | F8 — `listActionableProposals` orderBy |
| `src/routes/(app)/requests/timesheets/+page.server.ts` | F9 — orderBy |
| `src/lib/server/services/approvals.ts` | F10 — `listPendingRequestsForApprover` orderBy |
| `tests/unit/list-order-totality.test.ts` | NEW — orderBy-contract guard, 8 sites |
| `tests/e2e/pagination-lists.spec.ts` | EXTEND — two tied-fixture page walks (F2, F9) |

## Public Contracts

- **`orderBy` argument shape.** F1 changes `orderBy: { payrollRun: { periodStart: 'desc' } }` from an
  object into an array `[{ payrollRun: { periodStart: 'desc' } }, { id: 'desc' }]`. Prisma 5 accepts
  relation-nested entries inside an `orderBy` array; this is the only site where the edit is not a
  literal one-token append.
- **Returned row order.** Changes only among rows that tie on the primary sort key. Untied ordering
  is byte-identical. No function signature, no return type, no route contract changes.
- **API v1 endpoints** (`/api/v1/employees`, `/api/v1/requests`, `/api/v1/timesheets`,
  `/api/v1/recruitment`) share these services and inherit the new ordering. They are single-shot
  today, so the change is a no-op for them — but it is a contract change to their documented row
  order and is listed here deliberately.

## Blast Radius

- **Files changed:** 10 source files (one to three lines each), 1 new test file, 1 extended spec.
- **Risk class:** LOW for correctness, MEDIUM for test churn. No schema change, no migration, no new
  dependency, no new abstraction. The `id` column is indexed as the primary key on every model, so
  no query-plan risk.
- **Order-pinning assertions audited (all verified safe, all must still be re-run):**

| Test | Why it does not break |
|---|---|
| `tests/unit/org-scoping-divergence.test.ts` (F2/F3/F5) | Asserts `rows.map(r => r.id)` against a `findMany` mock that applies `where` via `.filter()` and ignores `orderBy` entirely. Result order is fixture order; an added `orderBy` term is invisible to it. |
| `tests/unit/settings-org-load.test.ts` (F7) | Mocks `listAssignableEmployees` wholesale. A service-level `orderBy` change cannot reach it. |
| `tests/unit/requests-read-scoping.test.ts` (F3) | Asserts `listRequests.mock.calls[0][1]` (the `pageArgs`), not the internal query. Service is mocked. |
| `tests/e2e/timesheet-queue-page-walk.spec.ts` (F9) | Depends on the target card sorting **last** under `submittedAt asc`. Its fixtures seed `now + i*1000` — strictly distinct — so the tiebreaker never engages and the target still sorts last. (This is also precisely why that spec **cannot** catch the defect; see Guard Table.) |
| `tests/e2e/pagination.spec.ts` (F5), `tests/e2e/settings-org-assignments.spec.ts` (F7) | Both seed a shared surname with a varying first name, so `[lastName, firstName]` is already total across their own fixtures. Unaffected, and likewise blind to the defect. |
| `tests/e2e/audit-log-reveal.spec.ts` (F4), `tests/e2e/inventory.spec.ts`, `action-buttons.spec.ts` | Row lookups are by content, not index. |
| `tests/unit/payslips-page-scoping.test.ts` (F1) — **added by VALIDATE** | Invokes the real F1 loader and asserts `payrollEntry.findMany` with `expect.objectContaining({ where: expect.objectContaining(…) })`. `orderBy` is never matched, so the object→array change is invisible. (It is also the exact precedent for the F1 unit-contract case.) |
| `tests/unit/timesheets-queue-load.test.ts` (F9) — **added by VALIDATE** | Asserts `res.pendingTimesheets.map(t => t.id)` against a `timesheet.findMany` mock using `mockResolvedValue` — result order is fixture order; `orderBy` is ignored. |
| `tests/unit/approval-queues.test.ts` (F3, F10) — **added by VALIDATE** | ~10 `rows.map(r => r.id)` order assertions; every `findMany` mock is a `mockImplementation` that projects fixtures and never reads `orderBy`. |
| `tests/unit/action-proposals.test.ts` (F8) — **added by VALIDATE** | `mockResolvedValue([SELF_ROW, ON_BEHALF_ROW])`; ids asserted in fixture order, `orderBy` ignored. |
| `tests/unit/audit-log-filters.test.ts` (F4) — **added by VALIDATE** | Reads `auditLog.findMany.mock.calls[0][0].where` only — never the sibling `orderBy` key. |

  **The original audit was correct in its conclusion but incomplete in its evidence** — five more
  files assert order or query shape on the touched surfaces and were not listed. All five were
  re-verified by VALIDATE and all five are safe.

  **Full suite re-run is required regardless** — "passes in isolation" proves order-independence,
  not innocence, and several e2e specs share seed data across files under `fullyParallel`.

---

## Per-Site Fix Table

`id` is the right tiebreaker at every site: it is the primary key, it is present on every model, and
as a cuid it sorts monotonically with creation time. Direction follows the primary key's direction
so the tie resolves the way a reader expects.

| # | File : symbol | Current `orderBy` | Becomes | Direction rationale |
|---|---|---|---|---|
| F1 | `payslips/+page.server.ts:41` | `{ payrollRun: { periodStart: 'desc' } }` | `[{ payrollRun: { periodStart: 'desc' } }, { id: 'desc' }]` | `desc` matches the newest-first primary sort; cuid `desc` = newest entry first within a shared period. **Object → array — the only non-append edit.** |
| F2 | `timesheets.ts:88` `listTimesheets` | `{ periodStart: 'desc' }` | `[{ periodStart: 'desc' }, { id: 'desc' }]` | Matches `desc`. |
| F3 | `requests/index.ts:152` `listRequests` | `{ createdAt: 'desc' }` | `[{ createdAt: 'desc' }, { id: 'desc' }]` | Matches `desc`; cuid order agrees with `createdAt`, so the tiebreak reads as "newest first" rather than arbitrary. |
| F4 | `reports/audit-log/+page.server.ts:51` | `{ createdAt: 'desc' }` | `[{ createdAt: 'desc' }, { id: 'desc' }]` | Same as F3. Matters most here: batch writes inside one transaction share the timestamp to the millisecond. |
| F5 | `employees.ts:210` `listEmployees` | `[{ lastName: 'asc' }, { firstName: 'asc' }]` | `+ { id: 'asc' }` | `asc` matches the alphabetic primary sort. The tiebreak is **semantically arbitrary** (creation order, not a name property) — that is acceptable and intended: it only has to be stable, and two people with identical first *and* last names have no meaningful order anyway. |
| F6 | `recruitment.ts:29` `listJobPostings` | `{ createdAt: 'desc' }` | `[{ createdAt: 'desc' }, { id: 'desc' }]` | Same as F3. |
| F7 | `settings/org.ts:407` `listAssignableEmployees` | `[{ lastName: 'asc' }, { firstName: 'asc' }]` | `+ { id: 'asc' }` | Same as F5. |
| F8 | `action-proposals.ts:342` `listActionableProposals` | `{ createdAt: 'desc' }` | `[{ createdAt: 'desc' }, { id: 'desc' }]` | Same as F3. |
| F9 | `requests/timesheets/+page.server.ts:49` | `{ submittedAt: 'asc' }` | `[{ submittedAt: 'asc' }, { id: 'asc' }]` | `asc` matches the oldest-first queue order; cuid `asc` = oldest submitted first within a tie, which is the queue's own fairness intent. |
| F10 | `approvals.ts:388` `listPendingRequestsForApprover` | `{ createdAt: 'asc' }` | `[{ createdAt: 'asc' }, { id: 'asc' }]` | Same as F9. **New — not in the original sweep.** |

### Why the in-memory-slice sites (F7, F8, F9, F10) need the identical fix

These four do not use `skip`/`take`. They fetch the whole matching set, filter it in JS, then
`.slice()` for the current page. It is tempting to think a single query protects them. It does not —
for exactly the reason skip/take does not:

1. **The slice is not the protection; the request boundary is the problem.** Page 1 and page 2 are
   still two separate HTTP requests. Each one re-runs `findMany` from scratch. The two requests can
   receive tied rows in different relative order, so `slice(0,20)` on request 1 and `slice(20,40)`
   on request 2 are slicing **two different arrays**. Identical defect, identical symptom.
2. **The JS layer cannot repair it.** `Array.prototype.filter` and `.slice` are order-preserving —
   they faithfully propagate whatever order the DB handed them, including an unstable one. Nothing
   between the query and the render re-sorts.
3. **Therefore the tiebreaker is sufficient here.** Making the DB order total makes the fetched array
   identical across requests; order-preserving filter and slice then make the rendered order total
   too. No JS-side sort is needed, and adding one would be a second source of truth.

The only thing that would make a tiebreaker *insufficient* is a filter whose outcome varies between
requests for the same row. All four filters are pure functions of row data plus the actor's fixed
role set, so none qualify.

---

## What NOT To Do

1. **Do not add a tiebreaker to `listAttendanceDays`.** `@@unique([employeeId, date])` plus a
   single-`employeeId` filter already makes `date` total. It would be dead code that looks like a
   fix and invites a future reader to believe the surface was at risk.
2. **Do not touch `listOrgUsers`, `team/+page.server.ts:86`, `leave.ts:228`, or
   `attendance/+page.server.ts:85`.** Verified already total.
3. **Do not convert F7 to `skip`/`take`.** The in-code comment already explains the fetch-everything
   cost is a tracked backlog item; changing a shared service's signature is a different change with
   a different blast radius. The tiebreaker fixes the correctness defect on its own.
4. **Do not add tiebreakers to nested `include` orderings.** They are read whole inside one request.
5. **Do not extract a shared `withTiebreak()` helper.** Ten one-line appends do not justify an
   abstraction, and a helper would hide the per-site direction decision that is the only judgment in
   this change.
6. **Do not sort in JS as a belt-and-braces second guard.** It creates a second ordering authority
   that can silently disagree with the DB's.
7. **Do not add explanatory comments at the fix sites.** The reason belongs in the commit message —
   the `5cedf52` message is the precedent and is already the durable record for this defect class.

---

## Batching and Ordering

Three commits, in this order. Each is independently green and independently revertible.

| Order | Commit | Sites | Why grouped |
|---|---|---|---|
| 1 | `fix(payroll): total sort order for the payslip and timesheet lists` | F1, F2 | **Yes — money and payroll earn their own commit.** A payslip that renders twice or vanishes is a pay dispute, not a UI glitch. Isolating them keeps the revert surface for the money path one commit wide, and keeps their guards (including the single real e2e walk) out of a 10-file blended diff. |
| 2 | `fix(lists): total sort order for the skip/take service lists` | F3, F4, F5, F6 | Same mechanism (`pageArgs` skip/take), same guard style, all four in the shared unit contract file. |
| 3 | `fix(lists): total sort order for the in-memory paged queues` | F7, F8, F9, F10 | Same mechanism (fetch-all → filter → slice), and they share the "the slice does not protect you" rationale that belongs in one commit message. F10 rides here because it is that shape. |

Rationale for the sequence: payroll first while attention is highest and the diff is smallest;
then the four low-risk service edits; then the slice group, which carries the one newly-found site
and the most explanation. Commit 3 last also means the new F10 finding is never buried inside an
otherwise-routine commit.

---

## Guards

Each fix gets a test that fails without it. Guard choice is per site, cheapest-that-can-actually-go-red.

### The fixture rule (applies to every guard below)

**A test that seeds rows with distinct sort-key values cannot catch this defect.** It is not a weak
test — it is a test of a different thing entirely: with distinct keys the sort is already total, the
tiebreaker never engages, and the assertion is green with or without the fix. Every guard in this
plan must seed rows that **deliberately tie** the primary sort key (identical `createdAt` /
`periodStart` / `submittedAt` / `lastName`+`firstName`), and each guard's acceptance criteria state
so explicitly.

Two existing specs prove the trap is live in this repo: `timesheet-queue-page-walk.spec.ts` seeds
`submittedAt: now + i*1000` and `pagination.spec.ts` varies the first name — both walk the exact
surfaces at risk, both are green today, and neither can see the defect.

### Guard table

| # | Guard | Why this one |
|---|---|---|
| F2 | **e2e page walk** — extend `tests/e2e/pagination-lists.spec.ts` with a `/timesheets` team-table walk: seed **20** timesheets for **20 distinct employees** **all sharing one `periodStart`**, walk page 1 → page 2, assert page 2 repeats no row from page 1 and that page1 ∪ page2 covers the seeded set. See *Guard fixture rules (added by VALIDATE)* below — the count, the sort dominance, the row-identity source and the streaming gate are all load-bearing and none of them are free. | The only site where the defect is both certain and cheap to reproduce realistically — every member of staff in one period shares `periodStart` by construction. This is the plan's one *behavioural* proof that Postgres actually orders totally; the contract tests below cannot prove that. Payroll surface, so it earns the cost. |
| F9 | **e2e page walk** — sibling test in the same spec against `/requests/timesheets`: seed **20** SUBMITTED timesheets for **20 distinct employees** with an **identical `submittedAt`**, walk the queue. Same fixture rules below apply. | The surface already has an e2e harness and a page-walk helper, so marginal cost is low; and the existing walk spec is the exact blind test described above, so replacing that blindness with a real one is high value. Also covers F10 by analogy at the same DB layer. |
| F1, F3, F4, F5, F6, F7, F8, F10 | **Unit `orderBy`-contract test** — one new file `tests/unit/list-order-totality.test.ts`. Per site: mock `db.<model>.findMany`, invoke the real service/loader, read `mock.calls[0][0].orderBy`, and assert it is an array whose **final term is `{ id: … }`**. | Cheap, targeted, and genuinely red without the fix (today every one of these passes a bare object or a non-`id`-terminated array). Pattern already established by `org-scoping-divergence.test.ts`, which calls the real service against a `db` mock. |

### Guard fixture rules (added by VALIDATE — all four are load-bearing)

Verified against source on 21-09-26. Each of these invalidates a premise the Guard table
originally rested on; a walk written without them is either impossible, flaky, or vacuous.

1. **Seed exactly 2 × pageSize, and read pageSize off the pager.** Both target surfaces use the
   shared `paginate()` default of **10** — `/timesheets` team table via
   `paginate(url, teamTotal, { param: 'teamPage' })` and the queue via `paginate(url, len)`.
   Neither uses `fitPageSize`, so the size is fixed, not viewport-derived. 20 seeded rows make
   "page1 ∪ page2 covers the seeded set" true; 25 make it unsatisfiable. Still read the number
   off the pager label (the `pagination-lists.spec.ts` convention) rather than hard-coding 10.

2. **The seeded rows must DOMINATE the sort — neither surface has a search filter to isolate
   them.** `pagination.spec.ts` gets away with a shared surname because `/employees` has a search
   box; `/timesheets` (team tab) and `/requests/timesheets` have none, and both list the whole
   org, so every pre-existing fixture row competes for pages 1–2. Therefore:
   - `/timesheets` sorts `periodStart desc` → seed a `periodStart` **later than every existing
     fixture**, including `timesheet-queue-page-walk.spec.ts`, which already occupies months
     +14…+24 from today. Use month +30 and beyond.
   - `/requests/timesheets` sorts `submittedAt asc` → seed a `submittedAt` **earlier than every
     existing SUBMITTED sheet** (e.g. a fixed date in 2000), so the 20 land on pages 1–2.
   Without this the union assertion fails for a reason that has nothing to do with the defect.

3. **20 distinct employees are REQUIRED, and this is not cheap.** `Timesheet` carries
   `@@unique([employeeId, periodStart])`, so one employee cannot hold 20 rows tied on
   `periodStart`. Each walk needs 20 opaque-coded employee fixtures, created in `beforeAll` and
   swept in **both** `beforeAll` and `afterAll` (CI retries leave residue). The Guard table's
   "marginal cost is low" for F9 was wrong: the harness is reusable, the fixture volume is not.

4. **Row identity comes from rendered TEXT, not an attribute.** The `rowKeys(selector, attr)`
   helper in `pagination-lists.spec.ts` reads `href` or `data-name`. Neither target surface has
   either: `TimesheetListTab.svelte` renders `<tr onclick=…>` with no id and no link, and
   `requests/timesheets/+page.svelte` renders `<li>` cards whose only stable discriminator is the
   `<h2>` employee name. Take identity from the employee-name cell / heading text, with
   `exact: true` opaque-coded fixture names (a fixture containing an English control word answers
   to that control's role query). **Do NOT add a `data-*` attribute to the source to make this
   easier** — that is a markup change outside this plan's blast radius and is banned by AC-10.

5. **`/timesheets` rows are STREAMED — the `goto` shortcut does not apply.** The loader returns
   `teamTimesheets` as an un-awaited promise and `TimesheetListTab.svelte` renders it inside
   `{#await rows}`. `pagination-lists.spec.ts` states in its header that each `page.goto` lands a
   fresh document "whose table is already server-rendered in the HTML that `domcontentloaded`
   waits for" — **that is false for this route**. Gate every navigation, `goto` included, on the
   retrying `expectRangeStart` assertion before reading any row. Copying the precedent verbatim
   produces a test that is flaky or reads an empty table.

### Cheaper behavioural proof available — the integration tier (VALIDATE recommendation)

The plan states that only the two e2e walks can prove Postgres actually returns a total order.
That is not true: `bun run test:integration` (`vitest.integration.config.ts`, `fileParallelism:
false`) runs a **real PrismaClient against real Postgres**, and `tests/integration/audit-tx-harness.ts`
already exports `createOrgFixture` / `createEmployeeFixture` / `cleanupFixtures`. A single file
there can seed N rows tied on the sort key, call the real service twice with
`{skip:0,take:10}` and `{skip:10,take:10}`, and assert the two pages are disjoint and cover the
set — the exact defect, at the exact layer where it lives, with no login, no DOM, no fixture
residue in the shared e2e database, and coverage for **all ten** sites rather than two.

Its one real weakness is why the e2e walks stay: **`test:integration` is NOT in CI**
(`.github/workflows/ci.yml` runs `format:check`, `lint`, `check`, `test`, `test:e2e` only), so an
integration-only guard can rot unnoticed. Recommended shape — keep both:
- the two e2e walks, for the CI-covered render-layer proof (F2, F9);
- one integration file covering the shared skip/take mechanism, which is the honest behavioural
  proof for the eight sites that otherwise have only a query-contract assertion.

### What the unit contract tests do NOT prove

Stated here so nobody mistakes eight green contract assertions for eight proven surfaces: they prove
the query **asks** for a total order. They do **not** prove Postgres returns a stable order, that the
route renders it, or that page 2 disagrees with page 1 in a browser. Only the two e2e walks prove
that, and they prove it for the underlying mechanism shared by all ten sites. This is a deliberate,
recorded residual — **not** a Known-Gap terminal state (see Verification Evidence).

### Negative control (mandatory before any guard is accepted)

No guard is accepted until it has been **seen failing for the right reason**. For each guard:
revert only that site's tiebreaker, run the guard, confirm red, confirm the failure message names
the ordering (not a fixture, a login, or a timeout), then restore. A guard that reddens for a
neighbouring reason is not a guard for this defect.

---

## Phase Completion Rules

This plan is a single phase delivered as three commits. The phase is complete only when all of the
following hold — code-only completion is `CODE DONE`, never `VERIFIED`:

| State | Meaning |
|---|---|
| `CODE DONE` | All ten `orderBy` edits are in place and the five gates are green. Not sufficient to close. |
| `VERIFIED` | `CODE DONE`, **plus** every guard in the Guard table has been observed red with its site's tiebreaker reverted and green with it restored (AC-5), **plus** the step-22 full-suite regression pass is green with `--workers=1`. |
| `BLOCKED` | Any gate red for a reason inside this plan's blast radius, or any guard that cannot be made to go red for the right reason. |

A commit may not be made until the gates are green for that commit's sites. The plan may not be
archived while any of AC-1 through AC-9 is unmet.


## Implementation Checklist

1. `src/routes/(app)/payslips/+page.server.ts:41` — change `orderBy` from an object to
   `[{ payrollRun: { periodStart: 'desc' } }, { id: 'desc' }]`.
2. `src/lib/server/services/timesheets.ts:88` — `listTimesheets` orderBy →
   `[{ periodStart: 'desc' }, { id: 'desc' }]`.
3. Create `tests/e2e/pagination-lists.spec.ts` addition: `/timesheets` team-table walk, **20** rows
   for **20 distinct opaque-coded employees** sharing one `periodStart` **at month +30 or later**,
   `beforeAll`/`afterAll` sweep of this block's own prefixes, row identity read from the
   employee-name cell text, and `expectRangeStart` gating **after every navigation including
   `goto`** (the rows are streamed). See *Guard fixture rules* in Guards.
4. Run the F2 negative control: revert step 2, confirm the new walk goes red naming the ordering,
   restore step 2, confirm green.
5. Create `tests/unit/list-order-totality.test.ts` with the F1 case (assert the payslips loader's
   `payrollEntry.findMany` orderBy is an array terminating in `{ id: 'desc' }`).
6. Run gates, then commit 1 (`fix(payroll): …`) staging exactly steps 1–5's paths.
7. `src/lib/server/services/requests/index.ts:152` — `[{ createdAt: 'desc' }, { id: 'desc' }]`.
8. `src/routes/(app)/reports/audit-log/+page.server.ts:51` —
   `[{ createdAt: 'desc' }, { id: 'desc' }]`.
9. `src/lib/server/services/employees.ts:210` — append `{ id: 'asc' }` to the existing array.
10. `src/lib/server/services/recruitment.ts:29` — `[{ createdAt: 'desc' }, { id: 'desc' }]`.
11. Add F3, F4, F5, F6 cases to `tests/unit/list-order-totality.test.ts`.
12. Run the negative control for each of F3–F6 (revert one, red, restore, green).
13. Run gates, then commit 2 (`fix(lists): … skip/take service lists`).
14. `src/lib/server/services/settings/org.ts:407` — append `{ id: 'asc' }`.
15. `src/lib/server/services/action-proposals.ts:342` — `[{ createdAt: 'desc' }, { id: 'desc' }]`.
16. `src/routes/(app)/requests/timesheets/+page.server.ts:49` —
    `[{ submittedAt: 'asc' }, { id: 'asc' }]`.
17. `src/lib/server/services/approvals.ts:388` — `[{ createdAt: 'asc' }, { id: 'asc' }]`.
18. Add F7, F8, F10 cases to `tests/unit/list-order-totality.test.ts`.
19. Add the `/requests/timesheets` tied-`submittedAt` walk to `tests/e2e/pagination-lists.spec.ts`
    (F9 guard): **20** SUBMITTED sheets for 20 distinct opaque-coded employees, identical
    `submittedAt` set **earlier than every existing fixture** (e.g. 2000-01-01) so they hold
    pages 1–2, no approval steps (legacy VIEW_TEAM branch), identity from the card `<h2>` text.
20. Run the negative control for F7, F8, F9, F10.
21. Run the full gate set, then commit 3 (`fix(lists): … in-memory paged queues`).
22. Re-run `bun run test`, `bun run test:integration`, and the full e2e suite end-to-end with
    `--workers=1` as the final regression pass.

---

## Context and Testing References

- `process/context/all-context.md` — routing entry point; loaded at plan time to pick the relevant
  context group for this change.
- `process/context/tests/all-tests.md` — test routing and runner split; the gate commands below are
  sourced from the repo's own gate set, not inferred.
- Post-phase testing: the step-22 full-suite regression pass with `--workers=1` is the post-phase
  testing gate for this plan and is required before the phase may be called `VERIFIED`.


## Gates

Run in CI order (format first — CI runs it first):

```
bun run format:check          # clean
bun run lint                  # 0 errors, 10 pre-existing warnings
bun run check                 # 0 errors / 1207 files, 9 pre-existing warnings
bun run test                  # 2727 passing, +8 new (list-order-totality)
bun run test:integration      # real-DB tier — LOCAL ONLY, not run by CI
bun run test:e2e --workers=1  # 268 passing, +2 new walks
```

`test:integration` was missing from the original gate list and is **in this plan's blast radius**:
`tests/integration/timesheet-serialisation.test.ts` imports `$lib/server/services/timesheets`
(the F2 file) and runs it against real Postgres. It is not in CI, so it must be run locally at
each of the three commits and again at step 22.

`--workers=1` is mandatory locally: the config only sets it under CI, and a multi-worker local run
produces cross-spec interference that is not a real failure.

`bun run <script>` only — never bare `bun test` or `bun build` (bun shadows both with builtins).

---

## Acceptance Criteria

| ID | Criterion |
|---|---|
| AC-1 | All ten sites in the Per-Site Fix Table end their `orderBy` in a unique column. |
| AC-2 | The `/timesheets` e2e walk seeds **exactly 20** rows (= 2 × the team table's pageSize of 10, read off the pager, never assumed) sharing **one** `periodStart`, and asserts page 2 repeats no row from page 1 and that page1 ∪ page2 covers every seeded row. **Corrected by VALIDATE:** the original "25 rows" made the union clause arithmetically impossible — two pages hold at most 20. |
| AC-3 | The `/requests/timesheets` e2e walk seeds **exactly 20** rows (= 2 × the queue's pageSize of 10) with an **identical** `submittedAt`, and makes the same two assertions. |
| AC-4 | `tests/unit/list-order-totality.test.ts` covers F1, F3, F4, F5, F6, F7, F8, F10 and asserts the final `orderBy` term is `{ id: … }` for each. |
| AC-5 | Every guard has been observed failing with its site's tiebreaker reverted, and the failure message names the ordering. |
| AC-6 | No guard in this plan relies on distinct sort-key fixtures. Any guard whose fixtures do not tie the sort key is rejected. |
| AC-7 | All **six** gates green at each of the three commits (`format:check`, `lint`, `check`, `test`, `test:integration`, `test:e2e --workers=1`). |
| AC-8 | The diff contains no new explanatory comments and no new abstraction. |
| AC-9 | `listAttendanceDays`, `listOrgUsers`, `team/+page.server.ts`, `leave.ts:228` and `attendance/+page.server.ts` are unchanged. |
| AC-10 | No `data-*` attribute, id, or any other markup is added to `TimesheetListTab.svelte` or `requests/timesheets/+page.svelte` to make the walks addressable. Row identity is taken from rendered text (see Guard fixture rules). |

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run test:e2e --workers=1` — `/timesheets` tied-`periodStart` page walk | Fully-Automated | AC-2, AC-5 (F2) — and is the plan's one behavioural proof that a total DB order survives to the rendered page |
| `bun run test:e2e --workers=1` — `/requests/timesheets` tied-`submittedAt` page walk | Fully-Automated | AC-3, AC-5 (F9), AC-6 |
| `bun run test` — `tests/unit/list-order-totality.test.ts`, 8 cases | Fully-Automated | AC-1, AC-4 (query asks for a total order; does not prove DB behaviour — see Guard table residual) |
| Negative control pass: revert one tiebreaker per guard, observe red, restore | Hybrid (requires a manual revert step per site) | AC-5 |
| `bun run format:check`, `bun run lint`, `bun run check` | Fully-Automated | AC-7, AC-8 (lint/format); comment check is a staged-diff scan, below |
| Staged-diff comment scan (`git diff --cached` for added `//` lines) | Agent-Probe | AC-8 |
| Full `bun run test` + `bun run test:e2e --workers=1` regression pass at step 22 | Fully-Automated | AC-7, AC-9, and the Blast Radius re-run list |

**Residual (recorded, not accepted as terminal):** eight sites are proven only at the query-contract
level. The DB-behaviour proof is carried by the two e2e walks against the shared mechanism. If any of
those eight later needs its own behavioural walk, the fixture recipe is already established by the
two walks in this plan. This gate stays CONDITIONAL rather than PASS for those eight.

## Test Infra Improvement Notes

Two live specs walk at-risk paginated surfaces with fixtures that make the defect invisible
(`timesheet-queue-page-walk.spec.ts` seeds `submittedAt: now + i*1000`; `pagination.spec.ts` and
`settings-org-assignments.spec.ts` vary the first name under a shared surname). They are correct for
what they test and must not be changed by this plan. The durable gap is that the repo has no shared
"tied-fixture page walk" helper, so each new walk re-implements the seeding and the
repeat/coverage assertions by hand. Candidate follow-up: extract the range-label gate and the
page1-vs-page2 disjointness assertion from `pagination-lists.spec.ts` into `tests/e2e/helpers`.

## Risks

| Risk | Mitigation |
|---|---|
| F1's object→array `orderBy` edit is rejected by Prisma 5's relation-orderBy typing | `bun run check` catches it at compile time before any test runs. Fallback is `[{ payrollRun: { periodStart: 'desc' } }, { id: 'desc' }]` written exactly as typed above, which Prisma 5 supports. |
| A new e2e walk's fixtures collide with `pagination.spec.ts` / `settings-org-assignments.spec.ts` seed data under `fullyParallel` | Follow the existing file's convention: opaque-coded fixture names, own-prefix sweep in both `beforeAll` and `afterAll` (CI retries leave residue). |
| A guard goes green for the wrong reason | AC-5 negative control is mandatory and must confirm the failure message names the ordering. |
| Full-suite order dependence surfaces only in the final pass | Step 22 is a dedicated full-suite regression run, not a per-commit one. |

## Rollback

Each commit is a self-contained set of one-to-three-line `orderBy` edits plus additive tests.
`git revert <sha>` of any one commit restores prior behaviour with no data, schema, or migration
implications. Reverting commit 1 alone is the money-path escape hatch and touches nothing else.

## Dependencies

None. No migration, no new package, no ordering dependency between the three commits beyond the
stated preference. Requires the dev DB running (`./start.sh`, owner-started) for the e2e gate.

---

## Resume and Execution Handoff

1. **Selected plan file path:**
   `process/general-plans/active/paginated-list-tiebreakers_21-09-26/paginated-list-tiebreakers_PLAN_21-09-26.md`
2. **Last completed phase or step:** PLAN written; no implementation started. Branch
   `feat/uiux-phase-7`, clean at `f4e871a`.
3. **Validate-contract status:** pending — VALIDATE has not run.
4. **Supporting context files loaded:** `process/development-protocols/plan-lifecycle.md`,
   `process/development-protocols/implementation-standards.md`, `CLAUDE.md` (bun, not pnpm —
   overrides the `pnpm` references in implementation-standards), commit `5cedf52` as the fix
   precedent, `tests/e2e/pagination-lists.spec.ts` as the guard precedent.
5. **Next step for a fresh agent:** run VALIDATE against this plan. Do not begin at checklist step 1
   until the validate-contract is written. When execution starts, begin at step 1 and commit at
   steps 6, 13, and 21 — do not batch the three commits.

## Validate Contract

Status: CONDITIONAL
Date: 21-09-26
date: 2026-09-21
generated-by: outer-pvl

Parallel strategy: sequential (in-session fan-out)
Rationale: 7-signal score 4/7 (S2 public-API surface, S5 user requested depth, S6 public-API
class named in Public Contracts, S7 12 files) → HIGH band, which recommends parallel subagents
for read-only dimension/section fan-out. The Agent/Task tool is NOT exposed to this agent in
this session, so the four Layer 1 dimension roles and the five Layer 2 section roles were
executed in-session against source, with independent Bash reads batched in parallel. Every
finding below is anchored to a file and line read during this session, not to plan prose.

Test gates (C3):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1, AC-4 | Each of the 8 low-likelihood sites ASKS the DB for a total order | Fully-Automated | `bun run test` — `tests/unit/list-order-totality.test.ts`, 8 cases, each asserting the final `orderBy` term is `{ id: … }` | B |
| AC-2, AC-5 (F2) | A tied-`periodStart` `/timesheets` team list renders page 2 disjoint from page 1 and covers the seeded set | Fully-Automated | `bun run test:e2e --workers=1` — `/timesheets` walk in `tests/e2e/pagination-lists.spec.ts` | B |
| AC-3, AC-5 (F9), AC-6 | A tied-`submittedAt` `/requests/timesheets` queue does the same | Fully-Automated | `bun run test:e2e --workers=1` — `/requests/timesheets` walk in the same spec | B |
| AC-5 | Every guard has been observed RED for the ordering reason with its site's tiebreaker reverted | Hybrid | Manual revert-one-site / run guard / confirm the failure names the ordering / restore — precondition: dev DB running (`./start.sh`, owner-started) | B |
| AC-7 (part) | No formatting, lint, or type regression; F1's object→array `orderBy` type-checks under Prisma 5 | Fully-Automated | `bun run format:check`; `bun run lint`; `bun run check` | A |
| AC-7 (part) | The real-DB tier still passes with the F2 service edited | Hybrid | `bun run test:integration` — precondition: dev DB running; NOT run by CI | B |
| AC-8 | The diff adds no explanatory comments and no abstraction | Agent-Probe | `git diff --cached` scan for added `//` lines before each of the three commits | B |
| AC-7, AC-9 | Full-suite order-independence after all ten edits | Fully-Automated | Step 22: `bun run test` + `bun run test:integration` + `bun run test:e2e --workers=1` end-to-end | B |
| — | The DB behaviourally returns a total order for the **eight contract-only** sites (F1, F3, F4, F5, F6, F7, F8, F10) | Known-Gap residual | Not proven per-site. Proven only for the shared mechanism, by the two e2e walks. An integration-tier file (see plan §"Cheaper behavioural proof available") would close it — recommended for F4 at minimum | D |

gap-resolution legend: A — proven now. B — gate added by this plan's checklist. C — deferred to a named later plan. D — backlog test-building stub (named residual; continue).

Legacy line form:
- Unit `orderBy` contract, 8 sites: [Fully-automated: `bun run test`]
- `/timesheets` + `/requests/timesheets` tied-fixture page walks: [Fully-automated: `bun run test:e2e --workers=1`]
- Negative control per guard: [hybrid: manual revert per site + guard run; precondition: dev DB up]
- Real-DB regression: [hybrid: `bun run test:integration`; precondition: dev DB up, not in CI]
- Comment/abstraction scan: [agent-probe: `git diff --cached` for added `//` lines]
- Per-site DB behaviour for the 8 contract-only sites: [known-gap: documented, mechanism-level proof only]

Failing stub (AC-1/AC-4 row):
```
test("should terminate every list orderBy in a unique id term", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: final orderBy term is { id: … } for F1,F3,F4,F5,F6,F7,F8,F10")
})
```
Failing stub (AC-2 row):
```
test("should render page 2 disjoint from page 1 on a tied-periodStart /timesheets team list", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: tied-periodStart /timesheets page walk")
})
```
Failing stub (AC-3 row):
```
test("should render page 2 disjoint from page 1 on a tied-submittedAt /requests/timesheets queue", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: tied-submittedAt /requests/timesheets page walk")
})
```

Dimension findings:
- Infra fit: PASS — all 10 source paths, both existing guard specs and the 5 audited test files resolve on disk; `bun` (not npm) confirmed; `--workers=1` confirmed necessary (playwright config sets single worker only under CI); cuid **v1** confirmed on all 7 in-scope models (74 `@default(cuid())`, zero `cuid(2)`), so the plan's "monotonic with creation order" rationale holds.
- Test coverage: CONCERN — the two e2e guards were specified with an impossible row count and on a false premise about row addressability (both corrected in the plan by this PVL); an existing real-DB gate in the blast radius was missing from the gate list (added); 8 of 10 sites remain proven at query-contract level only.
- Breaking changes: PASS — `orderBy` is an internal query argument; no signature, return type, or route contract changes. `/api/v1/{employees,requests,timesheets,recruitment}` were read: none of them paginate (no `skip`/`take`/`limit`), so the row-order change is a documented no-op for API consumers, exactly as the plan claims.
- Security surface: PASS with a severity note — no auth, secret, or trust-boundary code is touched and no data exposure changes. But the *impact* of the defect is higher than "LOW correctness" at three sites: F4 can make an **audit-log row unreachable** (audit integrity / compliance), F1 is the **money path**, and F9/F10 can hide an **approval from its approver** (queue starvation, SoD-adjacent). This raises the cost of leaving F4 and F10 on contract-only coverage; it does not change the fix.
- Section 1 — Per-Site Fix Table F1–F6 (skip/take): PASS. All six `orderBy` values read at source match the plan verbatim. Highest-risk edit: F1's object→array through a relation; `bun run check` catches a Prisma 5 typing rejection before any test runs.
- Section 2 — In-memory slices F7–F10: PASS. All four re-verified: fetch-all → JS filter → `.slice(pagination.skip, …)`, each filter a pure function of row data plus the actor's fixed role set. A repo-wide `.sort(` sweep of `src/routes` + `src/lib/server` found **no** post-query re-order of any of the four arrays (the only nearby `.sort` is `approvals.ts:46`, which orders a request's `steps`, not the list). The plan's "the tiebreaker is sufficient here" argument holds.
- Section 3 — Guards: CONCERN (two FAIL-grade defects found, both corrected in the plan by this PVL). See Open gaps.
- Section 4 — Blast radius / order-pinning audit: CONCERN — conclusion correct, evidence incomplete. Five further files assert order or query shape on the touched surfaces and were unlisted; all five re-verified safe and added to the plan's table.
- Section 5 — Sweep completeness: PASS. Independently re-swept every `skip`/`take` and `.slice(pagination` site in `src/`. Beyond the ten, five more paginated lists exist — `complaints` (both branches), `separations`, `inventory`, `listTeamDay` — and every one already ends in `{ id: … }` (the `5cedf52` fixes). The only other `orderBy` without a unique terminator is `separation.ts:726 generateSeparationReport`, which is a single-shot CSV/report query and correctly out of scope. **The ten-site list is complete.**

Open gaps:
- VG-1 (was FAIL, RESOLVED in plan): AC-2/AC-3 asserted "page1 ∪ page2 covers every seeded row" from a 25-row fixture. Both surfaces paginate at the shared `paginate()` default of **10** (`timesheets/+page.server.ts:81` `{ param: 'teamPage' }`; `requests/timesheets/+page.server.ts:76` bare `paginate(url, len)`); two pages hold at most 20, so the clause could never be satisfied. Corrected to 20 rows.
- VG-2 (was FAIL, RESOLVED in plan): the Guard table claimed the queue "already has an e2e harness and a page-walk helper, so marginal cost is low". The helper (`rowKeys(selector, attr)`) reads `href`/`data-name`; **neither target surface renders any row identity attribute** — `TimesheetListTab.svelte:134` is a bare `<tr onclick>` and `requests/timesheets/+page.svelte:204` is a bare `<li>`. Identity must come from rendered text, and AC-10 was added to forbid "fixing" this by adding markup to source (which would break the plan's own no-change-beyond-the-tiebreaker scope).
- VG-3 (CONCERN, RESOLVED in plan): `bun run test:integration` is a real gate in the blast radius (`tests/integration/timesheet-serialisation.test.ts` imports `$lib/server/services/timesheets`, the F2 file, and runs it against real Postgres) and was absent from the gate list. Added; AC-7 updated to six gates. Note it is **not** in CI.
- VG-4 (CONCERN, RESOLVED in plan): `/timesheets` team rows are **streamed** (`{#await rows}` in `TimesheetListTab.svelte:63`; the loader returns un-awaited promises). The precedent spec's header states each `goto` lands a fully server-rendered table — false for this route. Every navigation, `goto` included, must be gated on `expectRangeStart`.
- VG-5 (CONCERN, RESOLVED in plan): neither target surface has a search filter, so seeded rows cannot be isolated the way `pagination.spec.ts` isolates its 25 employees. Sort dominance is now specified (periodStart ≥ month +30; submittedAt in 2000).
- VG-6 (CONCERN, RESOLVED in plan): fixture cost understated. `@@unique([employeeId, periodStart])` forces **20 distinct employee fixtures per walk** — one employee cannot hold 20 rows tied on `periodStart`.
- VG-7 (residual, ACCEPTED — carried into EXECUTE): 8 of 10 sites are proven at query-contract level only. `known-gap: documented` — the DB-behaviour proof is mechanism-level (the two e2e walks) rather than per-site. Strongly recommended, not mandated: one `tests/integration/` file using the existing `audit-tx-harness` fixtures to prove page1/page2 disjointness against real Postgres for the shared skip/take shape — it closes this for all eight at a fraction of an e2e's cost. **F4 (audit log) is the site where this residual bites hardest**: batch writes inside one transaction share `createdAt` to the millisecond, so ties there are certain and high-volume, and the lost row is an audit record.

What this coverage does NOT prove:
- `tests/unit/list-order-totality.test.ts` proves only that the query **asks** for a total order. It does not prove `id` is unique (a human knows that from the schema), does not prove Postgres honours the order, does not prove the route renders it, and does not prove page 2 disagrees with page 1 in a browser. See the verdict below.
- The two e2e walks prove the full stack for **F2 and F9 only**. They prove the shared mechanism by analogy for the other eight; they do not prove any of those eight surfaces individually. F1 (payslips), F4 (audit log), F5/F7 (name sorts), F6 (recruitment), F8 (proposals) and F10 (approvals) are never walked.
- `bun run check` proves F1's array form type-checks; it does not prove Prisma emits the intended SQL for a relation-nested `orderBy` followed by a scalar term. Only a run against real Postgres does — which is what the F2/F9 walks (and the recommended integration file) supply.
- The negative control proves each guard CAN go red. It does not prove it reddens for the defect unless the failure message names the ordering — AC-5 requires that check and it must not be waived.
- `test:integration` does not run in CI. A regression it would catch will not be caught by a pull request.

**Verdict on the `orderBy`-contract unit test (the question asked):**
It is a **change-detector, not a behavioural guard** — but it is an honest one, and it is worth
keeping. Three points, in order of weight:
1. It cannot fail for any reason other than "someone edited this line". It asserts the literal
   argument the code under test just passed to a mock. It is one step above `expect(diff).toBe(diff)`.
2. What raises it above a pure restatement is that the assertion is **structural, not a snapshot**:
   "the final term is `{ id: … }`". That is a property — AC-1 written as code. It still fails if a
   future refactor reorders the terms, swaps `id` for a non-unique column, or collapses the array
   back into an object. A `toHaveBeenCalledWith(<the exact new orderBy>)` would NOT have this
   property, and the plan is right to have avoided it.
3. Its fatal limit is that the property is only *meaningful* because a human read the schema and
   knows `id` is unique. The test cannot check that. It proves intent, never behaviour.
**Is that acceptable?** Yes for the genuinely low-likelihood sites — F1 (precondition-gated,
needs two runs sharing a `periodStart`), F5 and F7 (identical first *and* last name), F6 (job
postings, low volume). No for **F4** and, more weakly, **F10**: F4's ties are certain (one
transaction, one millisecond, many rows), its page size is 50, and the row that goes missing is
an audit record. F4 deserves a real behavioural guard. The cheapest honest one is the
integration-tier test described above, not a third Playwright walk. This is recorded as VG-7 and
is a recommendation, not a blocker — hence CONDITIONAL rather than BLOCKED.

Gate: CONDITIONAL — 0 unresolved FAILs (both FAIL-grade defects were corrected in the plan text
during V6), 7 CONCERNs of which 6 are resolved in-plan and 1 (VG-7) is carried as a recorded,
non-terminal residual. Proceed to EXECUTE.
Accepted by: session — accepted concerns: VG-7 (8 of 10 sites proven at query-contract level
only; per-site DB-behaviour proof deferred, mechanism-level proof retained, integration-tier
closure recommended for F4).

## Autonomous Goal Block

```
SESSION GOAL
Give every remaining paginated list in Veent HRIS a total sort order by appending a unique
{ id: ... } term, and guard each fix with a test whose fixtures deliberately tie the sort key.
Plan: process/general-plans/active/paginated-list-tiebreakers_21-09-26/paginated-list-tiebreakers_PLAN_21-09-26.md
Branch: feat/uiux-phase-7. Package manager: bun (never npm, never bare `bun test`).

CONTRACT SUMMARY
Validate gate: CONDITIONAL (21-09-26). Ten sites F1-F10, three commits at checklist steps 6,
13 and 21. Six gates: format:check, lint, check, test, test:integration, test:e2e --workers=1.
One accepted residual: VG-7 — eight sites are proven at query-contract level only.

AUTONOMY RULES
- Work only the 22 numbered checklist steps, in order. Commit at 6, 13 and 21; never batch them.
- Stage exact paths. Never `git add -A`.
- No explanatory comments in the diff. No shared withTiebreak() helper. No JS-side sort.
- Do not add data-* attributes or any markup to make the e2e walks addressable (AC-10).
- Every guard must be seen RED with its site's tiebreaker reverted, and the failure message
  must name the ordering (AC-5). A guard that reddens for a neighbouring reason is rejected.
- Every guard fixture must TIE the sort key (AC-6). Distinct-key fixtures are rejected outright.
- Read the pager for the page size; do not hard-code 10.

HARD STOPS
- Do not push. Commit only.
- Do not start the dev DB or the dev server; the owner starts ./start.sh and vite.
- Do not touch listAttendanceDays, listOrgUsers, team/+page.server.ts, leave.ts:228 or
  attendance/+page.server.ts (AC-9).
- If a guard cannot be made to go red for the ordering reason, stop and report BLOCKED.

NEXT PHASE
EXECUTE. Start at checklist step 1.

EXECUTE START COMMAND
ENTER EXECUTE MODE for process/general-plans/active/paginated-list-tiebreakers_21-09-26/paginated-list-tiebreakers_PLAN_21-09-26.md — begin at step 1.
```

