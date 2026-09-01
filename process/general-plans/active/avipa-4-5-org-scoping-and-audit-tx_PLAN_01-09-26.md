---
name: plan:avipa-4-5-org-scoping-and-audit-tx
description: "PLAN rev 2 for AVIPA #4 (82 employee queries join through user.organizationId) + #5 (114 audit rows written outside the enclosing transaction). One branch, two sequenced workstreams, 23 commits. Counts measured on HEAD 8880660 and re-measured by four adversarial validators."
date: 01-09-26
issue: 4, 5
branch: fix/org-scoping-audit-tx-4-5
research: process/general-plans/active/avipa-4-5-research-digest.md
complexity: COMPLEX
status: REVISED rev 2 — VALIDATE returned BLOCKED; B1-B7 resolved, D8-D12 locked, M1-M8 corrected. Awaiting re-validate.
---

# PLAN — AVIPA #4 + #5 on one branch (revision 2)

**Date**: 01-09-26 · **Complexity**: COMPLEX · **Branch**: `fix/org-scoping-audit-tx-4-5` (off `staging` @ `8880660`)
**Status**: REVISED rev 2. Rev 1 was gated **BLOCKED** by four adversarial validators. Every blocker was something rev 1 did not LOOK at; none was something it got wrong. B1-B7 are resolved below, D8-D12 are locked, M1-M8 are corrected in place.
**Context loaded**: `process/context/all-context.md` routing table; testing context per `process/context/tests/all-tests.md` (its recorded vacuous-mock failure mode is the whole reason for the integration tier and the per-section unit pattern below). Post-phase testing runs the gates in the Verification Evidence table.
**Research input**: `process/general-plans/active/avipa-4-5-research-digest.md` — read it in full before any section. Its counts supersede the issue bodies; this plan's corrections supersede the digest where they disagree.

**TL;DR.** Twenty-three commits, in two blocks that must never overlap. Block 1 (#4) is seven
mechanical commits S1..S7 that move the org filter from `employee.user.organizationId` to
`employee.organizationId`, plus T1 for tests. Block 2 (#5) is I1 (integration tier), A5a (the
`deriveRange` restructure), A1..A12, and Z1 (drop `= db`) last. **Block 2 cannot start until Block 1
is fully committed** — 21 files overlap.

**The single most load-bearing safety fact for all of #4, and it belongs in the PR body:**
`Employee.userId` is `String @unique`, **NOT nullable**, and the `user` relation is **required**
(`prisma/schema.prisma:435`). Every Employee therefore has exactly one User. That is why dropping
the join cannot widen any of the 82 result sets — it can only correct which org they are compared
against.

---

## Owner decisions — LOCKED, do not re-litigate

| # | Decision |
|---|---|
| D1 | #4: convert all 82 sites. The four shared `where` builders are converted **in place**. **No new shared org-scope helper.** |
| D2 | #5: convert all 114 sites, sectioned. Side-effect-hoisting sites included. |
| D3 | Build a real-Postgres integration tier. **Slimmed by D10.** |
| D4 | `approvals.ts:317` → wrap it (class B), overriding its own comment. `LOGIN` / `LOGIN_FAILED` stay outside a transaction (class D). |
| D5 | `writeAuditLog`'s third parameter becomes **required**. Lands LAST. Class-D sites pass `db` explicitly. |
| D6 | The ~43 unscoped `employee.findUnique({ where: { userId } })` self-lookups are **AVIPA #6, out of scope**. |
| D7 | **#4 lands completely before #5 begins.** Never run the two workstreams concurrently. |
| **D8** | **`attendance/index.ts:312` (`deriveRange`): restructure the loop, then wrap.** Chosen over excluding it. Own section (**A5a**), own commit, lands before A5's other sites. Spec below. |
| **D9** | **`requests/index.ts:223` and `requests/documents.ts:296`: wrap mutation + audit in a transaction, move `evictTombstonedBytes` to AFTER the transaction closes.** Overrides the "none should be added" comment at `requests/index.ts:216` — that comment's reason ("wrapping it would be speculative structure") is obsolete, #5 supplies a concrete reason. **Rewrite the comment.** |
| **D10** | **Slim I1 to TWO real-Postgres scenarios** (one money path, one simple class C), fix the injection per B4, **and** mandate the existing `#324` unit pattern in EVERY A-section. |
| **D11** | **Two static sweeps become gates.** (a) At Z1: exactly 4 sites pass `db` as the third argument, each named. (b) Per Block-2 section: zero bare `db.` calls inside any new `tx` closure. |
| **D12** | **`updateStatutoryRateConfig`'s own `client: Prisma.TransactionClient = db` default is removed too**, forcing its route caller to open a transaction. Same fix as Z1, same reason, no new pattern. |

---

## Overview

### #4 — the conversion

```ts
- where: { employee: { user: { organizationId: X } } }
+ where: { employee: { organizationId: X } }
```

`Employee.organizationId` exists and is indexed (`@@unique([organizationId, employeeNumber])`,
`@@index([organizationId, branchId])`). Reference shape already in the repo:
`services/complaints/index.ts`, `routes/(app)/profile/+page.server.ts:30`,
`routes/(app)/punch/+page.server.ts:42`, `routes/(app)/complaints/[id]/+page.server.ts:20`.

All 82 sites were individually read during RESEARCH and the inventory was independently re-derived
during VALIDATE with a brace-balanced multiline scan. **There is no site 83 and no primary-org
counterexample.** Every one is a tenant boundary. The defect is latent today only because
`prisma/seed-core.ts:70` hardcodes `organizationId: user.organizationId` when creating an Employee.

**Scope of the "unconstructible" claim, worded accurately:** divergence is unconstructible through
any **application write path**. Two dev scripts can produce it — `scripts/seed-issues-demo.ts:53`
and `scripts/seed-separation-demo.ts:35` both `upsert` and would attach an existing email's user to
a new org. Dev-only. No action; just do not overstate the claim in the PR.

### #5 — the conversion

```ts
- const row = await db.thing.create({ … })
- await writeAuditLog(ctx, { … })
+ return await db.$transaction(async (tx) => {
+   const row = await tx.thing.create({ … })
+   await writeAuditLog(ctx, { … }, tx)
+   return row
+ })
```

**Correct the failure-mode framing in the PR body.** `writeAuditLog` **throws** — it does not
swallow. The real failure mode is **committed change + no audit row + a 500 shown to the user**, not
a silent loss. The issue body is wrong on this point.

**Also note in the PR body, as a real behaviour change:** a wrapped function that mutates and then
throws `error(4xx)` before reaching its audit previously left the mutation committed; it now rolls
back. That is the intended direction, but it IS a change to shipped behaviour.

The reference implementation, which fixes the write side and the `oldValue` race in one move, is
`src/lib/server/services/settings/backup.ts:108-143`. Read it first. Do not invent a wrapper, a
retry utility, or an audit facade.

---

## Touchpoints

- **#4**: 35 source files — 24 under `src/lib/server/services/**`, 11 `+page.server.ts` loaders, plus `src/lib/server/backup/run.ts`. Zero `.svelte`.
- **#4 tests**: 5 existing `tests/unit/**` files converted, 1 new file.
- **#5**: **44** files contain `writeAuditLog` calls; **41** need edits. (`settings/backup.ts`, `attendance/import.ts:338` and `routes/(app)/employees/[id]/+page.server.ts:542` are class-A-only and owned by no section — correct, and harmless.)
- **#5 tests**: ~58 unit test files need mock updates (M6), plus one `#324`-pattern assertion per A-section, plus `tests/integration/**`.
- **#5 infra**: new `vitest.integration.config.ts`, `package.json` script.
- **#5 final**: `src/lib/server/audit.ts`, `payroll/statutory-rates.ts` (D12), `routes/(app)/payroll/statutory-rates/+page.server.ts` (D12).
- **Read-only**: `prisma/schema.prisma`, `src/hooks.server.ts`.

## Public Contracts

| Contract | Change |
|---|---|
| `writeAuditLog(ctx, payload, client)` | Third parameter becomes **required** in Z1. **`AuditContext` is ALREADY exported** from `src/lib/server/services/types.ts:3` and imported by 40+ services; `audit.ts`'s private copies are duplicates. **Z1 must NOT add a second export.** |
| `updateStatutoryRateConfig(...)` | **D12**: its own `client` default is removed, so `routes/(app)/payroll/statutory-rates/+page.server.ts:192` must open a transaction and pass one. |
| Query result shape | **Unchanged.** Guaranteed by the required non-nullable `Employee.userId` relation. |
| Service return values | **Unchanged.** `writeAuditLog` returns `Promise<void>`; no call site reads a return value. |
| HTTP status codes | **Unchanged** — and now *verified*, not just asserted. See the banked findings on `timelog.ts:141` and SvelteKit `error()`. |
| `package.json` | One new script, `test:integration`. |

## Blast Radius

| | #4 | #5 |
|---|---|---|
| Source files | 35 | 41 edited (44 contain calls) |
| Sites | 82 (81 Prisma `where` + 1 raw SQL) | 114 of 155 |
| Test files | 5 converted + 1 new | ~58 mock updates + 12 `#324` assertions + 2 integration |
| Commits | 8 (S1..S7 + T1) | 15 (I1 + A5a + A1..A12 + Z1) |
| Overlapping files between blocks | **21** — the reason for D7 | |
| Risk class | tenant trust boundary | audit trail integrity / money paths / transaction semantics |
| UI/UX | **None.** Zero `.svelte`. `impeccable` NOT warranted. | |

---

## Execution rules — read before dispatching any section

1. **The orchestrator does not implement.** Every source edit goes to `vc-execute-agent`. Assume the agent has read the research digest and nothing else.
2. **Gates are FORBIDDEN inside execute agents.** No `pnpm check`, no `pnpm test`, no `pnpm build`, no `pnpm lint`. The orchestrator runs gates **once per section** in the main thread and makes the commit.
3. **One section = one commit.**
4. **Sections are independently REVIEWABLE, not independently revertible.** Reverting any A-section after Z1 breaks compilation; reverting S1 after T1 fails `pnpm test`. The revertible units are `Z1 + section` and `T1 + section`. Do not promise otherwise in the PR.
5. **D6 fence.** `db.employee.findUnique({ where: { userId } })` with no `organizationId` is AVIPA #6. **Leave it exactly as it is** — no scope, no comment, no touch.
6. **Scope discipline.** No adjacent refactoring, no "improving" nearby code, no deleting pre-existing dead code, no reformatting, no renaming. Every changed line traces to #4 or #5.
7. **Files already MIXED** (the other shape is already correct — do NOT "tidy" it): `payroll/index.ts`, `payroll/calculator.ts`, `dashboard.ts`.
8. **Verify, do not assume.** Where this plan says *verify*, re-read the site. Report a mismatch; never adapt silently.
9. **`pnpm check` kills a running dev server.** Only the orchestrator runs it, and only knowingly.

### Parallelism

- **Block 1**: S1..S7 have no file overlap. **S6 must be committed before S4 is dispatched** (`payroll/calculator.ts:304` consumes `listVisiblePayEmployeeIds` from `employee-access.ts`). Waves: **1 = S1, S2, S3, S5, S6, S7**; **2 = S4**; then **T1** alone.
- **Block 2**: `I1` → `A5a` → then the A waves. **Wave 1 = A2, A3, A4, A5, A6, A7, A10, A11, A12**; **wave 2 = A1**; **wave 3 = A8, A9**. Three files are split by line range across A1 / A8 / A9 — the split is exact (VALIDATE confirmed no line falls in both or neither), but the waves must keep them apart.
- **Fallback**, decided **once before wave 1** and never mid-flight: fold A1's three line-range sites into A8/A9 and keep A1 as `supervisors.ts` + `complaints/index.ts` only.
- **Z1 runs alone, last.**

---

## Phase Completion Rules

- A section is `CODE DONE` when its edits are made and reported. That is **not** complete.
- A section is `COMMITTED` only after the orchestrator has run that section's gate table and made the commit.
- **Block 1 is complete** only when S1..S7 and T1 are committed AND the Block 1 exit gate passes, including the mandatory red-proof. Block 2 must not start before this.
- **Block 2 is complete** only when I1, A5a, A1..A12 and Z1 are committed AND the Block 2 exit gate passes.
- A section that hits an unresolved trap (A5a's write count, A11's 404 guard, a tenth `oldValue` site, a class-B/C misclassification) stays `BLOCKED` and is escalated. Never marked done.
- **No #5 section may be marked `VERIFIED` on a green `pnpm test` alone.**

## Implementation checklist — section table

### Block 1 — issue #4

| S | Name | Files | Sites | Commit subject | Depends on |
|---|---|---|---|---|---|
| S1 | Reports | `services/reports.ts` | 9 | `fix(reports): scope employee reads on Employee.organizationId (#4)` | — |
| S2 | Dashboard | `services/dashboard.ts` (7 + 1 raw SQL), `routes/(app)/dashboard/+page.server.ts` (4) | 12 | `fix(dashboard): scope employee reads on Employee.organizationId (#4)` | — |
| S3 | Attendance | `attendance/index.ts` (7), `attendance/import.ts` (1), `attendance/schedules.ts` (1), `routes/(app)/attendance/+page.server.ts` (1) | 10 | `fix(attendance): scope employee reads on Employee.organizationId (#4)` | — |
| S4 | Payroll | `payroll/loans.ts` (4), `calculator.ts` (2), `index.ts` (1), `employee-earnings.ts` (1), `employee-deductions.ts` (1), `employee-statutory.ts` (1) | 10 | `fix(payroll): scope employee reads on Employee.organizationId (#4)` | **S6 committed** |
| S5 | Requests / approvals / timesheets / leave | `requests/index.ts` (4), `requests/documents.ts` (2), `approvals.ts` (3), `timesheets.ts` (3), `leave.ts` (2), 3 route loaders (1 each) | 17 | `fix(requests): scope employee reads on Employee.organizationId (#4)` | — |
| S6 | Employees & access | `employees.ts` (4), `employee-access.ts` (4), `supervisors.ts` (2), 3 route loaders (1 each) | 13 | `fix(employees): scope employee reads on Employee.organizationId (#4)` | — |
| S7 | HR misc & backup | `documents.ts` (2), `emergencyContacts.ts` (2), `lib/server/backup/run.ts` (2), `awards.ts` (1), `posting-approvers.ts` (1), 3 route loaders (1 each) | 11 | `fix(hr): scope employee reads on Employee.organizationId (#4)` | — |
| T1 | Tests | 5 existing + 1 new | — | `test(scoping): convert org-scope assertions and cover divergent orgs (#4)` | S1..S7 |

### Block 2 — issue #5

| A | Name | Files | Commit subject | Wave |
|---|---|---|---|---|
| I1 | Integration tier | `vitest.integration.config.ts`, `tests/integration/**`, `package.json` | `test(integration): real-Postgres audit atomicity tier (#5)` | 0 |
| A5a | **`deriveRange` restructure (D8)** | `attendance/index.ts` (all 5 sites: `:312, :536, :578, :603, :632`) | `refactor(attendance): batch deriveRange writes and wrap the audit (#5)` | 0.5 |
| A1 | Array-form conversions | `supervisors.ts`, `complaints/index.ts`, `employees.ts:1220/1231`, `onboarding.ts:357/362`, `offboarding.ts:211/216` | `refactor(audit): convert array-form transactions to interactive (#5)` | 2 |
| A2 | Payroll — money | `payroll/loans.ts`, `employee-earnings.ts`, `employee-deductions.ts`, `employee-statutory.ts` | `fix(payroll): write audit rows inside the money transactions (#5)` | 1 |
| A3 | Payroll — runs & periods **+ D12** | `payroll/index.ts`, `periods.ts`, `runs.ts`, `statutory-rates.ts`, `routes/(app)/payroll/statutory-rates/+page.server.ts` | `fix(payroll): write run and period audit rows inside their transactions (#5)` | 1 |
| A4 | Settings & master data | `settings/master.ts`, `settings/org.ts`, `departments.ts`, `posting-approvers.ts`, `routes/(app)/payroll/config/+page.server.ts` | `fix(settings): write audit rows inside the enclosing transaction (#5)` | 1 |
| A5 | Schedules, timesheets, timelog | `attendance/schedules.ts`, `timesheets.ts`, `timelog.ts` | `fix(timesheets): write audit rows inside the enclosing transaction (#5)` | 1 |
| A6 | Requests & approvals **+ D9** | `requests/index.ts`, `requests/documents.ts`, `approvals.ts` | `fix(requests): write audit rows inside the enclosing transaction (#5)` | 1 |
| A7 | Recruitment & job boards | `recruitment.ts`, `job-boards.ts` | `fix(recruitment): write audit rows inside the enclosing transaction (#5)` | 1 |
| A8 | People records | `employees.ts` (332/426/638/803), `emergencyContacts.ts`, `documents.ts`, `benefits.ts` | `fix(employees): write audit rows inside the enclosing transaction (#5)` | 3 |
| A9 | Separation & lifecycle | `separation.ts`, `offboarding.ts` (rest), `onboarding.ts` (rest), `action-proposals.ts` | `fix(separation): write audit rows inside the enclosing transaction (#5)` | 3 |
| A10 | Performance | `performance.ts`, `performance-templates.ts` | `fix(performance): write audit rows inside the enclosing transaction (#5)` | 1 |
| A11 | Misc | `announcements.ts`, `awards.ts`, `inventory.ts`, `branches.ts` | `fix(audit): write remaining audit rows inside their transactions (#5)` | 1 |
| A12 | Auth & session | `routes/(auth)/login/+page.server.ts`, `routes/api/v1/session/switch-org/+server.ts`, `routes/(app)/reports/audit-log/+page.server.ts` | `fix(auth): wrap the session audit write and pin the class-D exemptions (#5)` | 1 |
| Z1 | Required client parameter | `src/lib/server/audit.ts` | `refactor(audit): make the transaction client a required parameter (#5)` | last, alone |

**Counts (M3).** Section site counts in rev 1 summed to 118 against a total of 114. VALIDATE
re-measured: **A3 = 11** (not 13), **A4 = 19** (not 20), **A5+A5a = 18-19** (not 19 for A5 alone),
**A9 = 6** (not 8), **A1 = 7 audit calls across 5 array-form conversions** — rev 1's "5" mixed two
units. **Every section must reconcile its own count by grep before editing and report any
mismatch.** Do not treat a plan number as authoritative over a fresh `grep -nE -A40`.

**The 23 sites rev 1 never named by line, now enumerated** so a mismatch can be reconciled:
`attendance/schedules.ts:159` · `timesheets.ts:323, :420` · `settings/org.ts:58, :98` ·
`payroll/periods.ts:125, :149, :322` · `benefits.ts:159, :194` · `recruitment.ts:58, :84, :178` ·
`requests/index.ts:78, :223` · `action-proposals.ts:164, :264` · `complaints/index.ts:105, :190` ·
`attendance/index.ts:536, :578, :603, :632`.

---

# Block 1 — per-section execution brief (#4)

## Shared brief for S1..S7

**Task.** In the listed files only, change every employee org filter from the `user` relation to the
Employee column.

```ts
- where: { employee: { user: { organizationId: X } } }
+ where: { employee: { organizationId: X } }
// and the bare form, where the query subject is already Employee:
- where: { user: { organizationId: X }, … }
+ where: { organizationId: X, … }
```

**Why this is safe:** `Employee.userId` is `String @unique`, **not nullable**, and the `user`
relation is **required** (`prisma/schema.prisma:435`). Every Employee has exactly one User, so
dropping the join cannot widen a result set.

**Find your sites:** `grep -nP 'user\s*:\s*\{[^{}]*organizationId' <file>`

**DO NOT EDIT — four confirmed grep false positives:**

| Site | Why |
|---|---|
| `services/performance.ts:329` | doc comment |
| `services/departments.ts:74` | doc comment |
| `services/payroll/payslip-fetch.ts:34` | TS parameter type |
| `routes/(app)/punch/+page.server.ts:40` | TS parameter type — the query at `:42` is already correct |

**Do NOT touch** `locals: { user: { … } }` request stubs, session / `hooks.server.ts` code, or
`User`-table queries. Only queries whose subject is an `Employee` row.

**If the `user` object has keys other than `organizationId`, keep the wrapper.** Move only
`organizationId` out. Exactly one such site exists repo-wide; it is in S6.

**D6 fence** applies. **No new helper** (D1). **Do not run any command.**

---

### S1 — Reports · `reports.ts` · 9 sites

- One of the nine is `reports.ts:99`, an **inline `const where` inside `generateHeadcount`** — a
  high-fan-out builder that is **unannotated, so TypeScript will not catch a bad edit.** Re-read it
  before and after; confirm by eye that every key survived and only the org filter moved.

### S2 — Dashboard · 12 sites

- **The only raw-SQL site is in `listTodaysBirthdays`.** Rev 1 gave the wrong line. Correct
  references: the `SELECT` is at **`dashboard.ts:61`**, the **`JOIN users u ON u.id = e."userId"` is
  at `:64`**, and the **`WHERE u."organizationId" = ${organizationId}` is at `:65`.
  Change `:65` to `e."organizationId" = ${organizationId}` and **delete the JOIN at `:64`**.
  **Confirm no remaining reference to alias `u` before deleting.** Keep the tagged-template
  parameter binding; never inline the value.
- **`dashboard.ts` is MIXED.** `:346` is wrong; `:490` is already correct. Do not touch `:490`.

### S3 — Attendance · 10 sites

- One of the 7 in `attendance/index.ts` is `:150`, inside `deriveRange` — a plain conversion here.
  A5a later restructures that same function for #5; that is Block 2's problem, not S3's.
- **Stale comment to correct:** `attendance/import.ts:221-222` says *"Org-scoped through the `user`
  relation, matching every other org-scoped employee read in this service"*. Your edit makes that
  false. Update it. **This is the only comment edit authorised in Block 1.**
- Do **not** touch `prisma/seed-core.ts:465`'s stale comment — already false today, belongs to #6.

### S4 — Payroll · 10 sites · dispatch only after S6 is committed

- **CORRECTED (M1). Rev 1 would have left #4 at 81 of 82.** In `payroll/calculator.ts` the two real
  sites are **`:309`** (`loadCalculatorData`) and **`:347`** (`previewPayroll`,
  `where: { id: employeeId, user: { organizationId } }`). **Convert both.**
  **`:317` is `employee: { organizationId }` inside a `groupBy` — an already-correct example, not a
  second employee query. Do NOT touch `:317`.**
- **`payroll/index.ts` is MIXED**: `:314` is wrong, 10 others already correct. Touch `:314` only.
- Do not edit `employee-access.ts` from this section — that is S6.

### S5 — Requests / approvals / timesheets / leave · 17 sites

- Two high-fan-out builders live here: `requests/index.ts:99` (`requestListWhere`) and
  `timesheets.ts:68` (`timesheetListWhere`). Both typed. Confirm no caller spreads a second `user`
  key in.
- Highest file count in Block 1. Split the dispatch by file if context is tight; keep **one commit**.

### S6 — Employees & access · 13 sites

- `employees.ts:160` (`employeeListWhere`) is the fourth high-fan-out builder.
- **`routes/(app)/team/+page.server.ts:40` is the one special site in all of #4** — the only one with
  a second key inside the user filter:
  ```ts
  where: {
  -   user: { organizationId: user.organizationId, isActive: true },
  +   organizationId: user.organizationId,
  +   user: { isActive: true },
      ...memberScope
  }
  ```
  **Keep `user: { isActive: true }`.** `isActive` is a `User` column and cannot move up. Do not
  rename the local `user.organizationId` — `hooks.server.ts:38` already resolves it to the context org.
- `employee-access.ts:145` (`requireEmployee`) is in this section and is what
  `benefits-enroll-scoping.test.ts` actually pins — see T1.

### S7 — HR misc & backup · 11 sites

- Eight files, one or two sites each. `src/lib/server/backup/run.ts` is the backup **runner**, not
  `services/settings/backup.ts`. Do not confuse them. No traps.

---

## T1 — Tests for #4 · after S1..S7

### Part A — convert the five test files that encode the buggy shape

They assert or fixture the old shape and **will fail** once the sections land. That is the tripwire.
**Convert the assertions. Do not delete or `skip` them.**

| File:line | Currently | Convert to | Breaks from |
|---|---|---|---|
| `tests/unit/report-scoping.test.ts:171` | `expect(where.employee).toEqual({ user: { organizationId: 'org1' } })` | `toEqual({ organizationId: 'org1' })` | S1 |
| `tests/unit/benefits-enroll-scoping.test.ts:56` | `where: { id: EMPLOYEE, user: { organizationId: ORG } }` | `where: { id: EMPLOYEE, organizationId: ORG }` | **S6** — it pins `requireEmployee` in `employee-access.ts:145`, not anything benefits-shaped. Rev 1 mislabelled this. |
| `tests/unit/backup-run.test.ts:369,372` | the buggy shape, twice | new shape, both | S7 |
| `tests/unit/dashboard-org-scoping.test.ts:35,40,42,154` | fixtures carry `user: { organizationId }` and no own `organizationId` | see the caveat below | S2 |
| `tests/unit/attendance-backlog-import.test.ts:83,262` | comment + matching fixture | update both | S3 |

**`dashboard-org-scoping.test.ts` caveat.** Its `matches()` helper has a hardcoded
`if (key === 'user')` branch. Fixtures must **REPLACE** `user: { organizationId }` with a top-level
`organizationId` — **not add one alongside it**, or a revert still passes and the test is vacuous.
**Remove the now-dead `user` branch from `matches()` too.**

The other ~33 `tests/unit/**` grep hits are `locals: { user: { … } }` request stubs. **Leave them.**

### Part B — the test that does not exist

No test anywhere constructs the divergent precondition, so the whole suite passes under both shapes.

- **Where:** new file `tests/unit/employee-org-divergence.test.ts`. A new file because there is no
  shared Prisma mock helper — all 177 unit tests hand-roll `vi.hoisted` + `vi.mock('$lib/server/db')`.
- **Pattern to copy:** `tests/unit/dashboard-org-scoping.test.ts` — VALIDATE confirmed it has a real
  recursive `matches(row, where)` engine that applies the filter to fixtures, so it can genuinely
  fail on revert. Copy that style, not `toEqual` shape-matching.
- **Also copy the positive+negative assertion pair from `department-head.test.ts:111-112`:**
  ```ts
  expect(where.organizationId).toBe(ORG)
  expect(where.user).toBeUndefined()
  ```
  Both assertions, always. The second is what makes a revert fail.
- **Precondition:** a fixture employee with `Employee.organizationId = 'org-A'` and
  `Employee.user.organizationId = 'org-B'`, plus a converged control where both are `'org-A'`.
- **Assert, all three:**
  1. **Missing rows.** With `ctx.organizationId = 'org-A'` the divergent employee **IS** returned.
  2. **Cross-tenant inclusion.** With `ctx.organizationId = 'org-B'` it is **NOT** returned.
  3. **Positive control.** The converged employee behaves identically under both contexts.
- **Drive it through at least two** of `employeeListWhere` / `requestListWhere` /
  `timesheetListWhere`. **All three are module-private** — VALIDATE confirmed routing through their
  exported callers is viable. **Read the real signatures first.** Do not export a builder just to
  test it.
- **Do not** add a divergent fixture to any seed.

**Commit:** Part A + Part B together — one logical change, the suite moving from encoding the bug to
catching it.

---

# Block 2 — per-section execution brief (#5)

## Gate before Block 2 starts

`git status` clean, S1..S7 and T1 committed, `pnpm check` green, `pnpm test` green. Only then
dispatch I1. **D7 is a PROCEDURAL rule, not a structural one** — do not call it structural. Its
mitigation is stronger than rev 1 claimed, though: all 82 #4 edits are single-line, so Block 1
causes essentially zero line drift in the 21 overlapping files.

## Shared brief for every A-section

**Task.** In the listed files/lines only, move each `writeAuditLog` call inside the transaction that
commits the mutation it records, and pass the transaction client as the third argument.

### The 5-second cap (B3) — applies to every section

**There is no `transactionOptions` override anywhere in this repo** (verified). Prisma's defaults
apply to every new bare `db.$transaction(async (tx) => …)`: `maxWait 2000ms`, **`timeout 5000ms`**
(`@prisma/client/runtime/library.js:130`). **Every transaction you open must finish inside 5
seconds.** This is the constraint that forced D8. If a wrap would put a loop, a fan-out, or an
unbounded query inside a transaction, hoist it out first — and if you cannot, **stop and report**.
Do not silently raise the timeout; A5a is the only place an override is authorised.

### The four classes

Counts are **derived**; 3-5 sites sit on the C/B boundary. **Re-verify every one of your own sites.**

| Class | Count | What to do |
|---|---|---|
| A — already correct | **41 exactly** (not a lower bound — VALIDATE re-measured by paren balancing) | **Do not touch** — with the one carve-out below. |
| B — transaction exists, audit sits outside it | 19 | Move the call inside the existing closure, pass `tx`. All 19 are the interactive form. |
| C — bare `db.*`, no transaction | ~91 | Open one. Switch the mutation from `db.` to `tx.`. Pass `tx`. |
| D — must NOT be transactional | 4 | Leave outside; pass `db` explicitly. **VALIDATE hunted the full `AuditAction` enum, every `catch` near an audit, every `error(403)` guard and every synthetic `entityId`: there is no fifth class-D site.** The `entityId: 'reorder'` sites follow a real executed bulk update and are correctly class C. |

**The class-A carve-out (B1).** "Skip class A silently" has exactly ONE exception, and it is in A3.
40 of the 41 class-A sites are lexically inside a closure that binds their third argument. One is
not: `payroll/statutory-rates.ts:283`. See A3.

### DO-NOT-WRAP list (M7) — four dual-call functions

VALIDATE built the full call graph over all 73 `$transaction` sites and found **zero nested
transactions today** — the repo consistently threads an explicit `Prisma.TransactionClient`. These
four take a tx **or** open one. Wrapping them creates a nested transaction on a second connection;
the outer rolls back while the inner commits.

| Function | File | Section |
|---|---|---|
| `recordCompensationChange` | `employees.ts:724` | A8 |
| `promoteEmployee` | `employees.ts:~1041` | A8 |
| `applyProposedChange` | `employees.ts:1141` | A8 / A9 |
| `updateStatutoryRateConfig` | `statutory-rates.ts:259` | A3 |

The existing comment at `employees.ts:667-673` states the reason — *"Prisma has no nested
interactive transactions"*. Quote it; do not restate it differently.

### Finding your sites

`grep -nE -A40 'writeAuditLog\(' <file>` — **`-A40`, not `-A20`.** Exactly two payloads in the repo
exceed 20 lines, which is precisely why a short window lies about the third argument.

### The reference implementation

`src/lib/server/services/settings/backup.ts:108-143`. Read it first. Follow its shape and comment
style. **Do not invent** a wrapper, a retry helper, an audit facade, or a generic `withAudit()`.

### Hoisting non-DB side effects

Notifications by **email or file**, storage calls, and file deletes must not sit inside a
transaction. Precedent: `approvals.ts` runs `evictTombstonedBytes()` outside its transaction —
*"A filesystem unlink is not rollback-able: run it inside the `$transaction` above and a disk error
rolls back an approval that already moved a leave balance."* Match that, with a one-line comment.

**But hoist ONLY where this plan names it.** Rev 1's list was wrong in both directions:

- **Confirmed and required:** `documents.ts:105` (A8), `requests/index.ts:274` (A6),
  `announcements.ts:72` (A11 — **but see M5, the reason is different from what rev 1 said**),
  plus the two D9 sites in A6.
- **DROPPED — rev 1 was factually wrong, hoisting here is unrequested behaviour change:**
  `documents.ts:78` (`saveFile()` is at `:63`, **before** the create at `:65` — nothing to hoist)
  and `awards.ts:54` (`notify()` is at `:62`, **after** the audit — nothing to hoist).
- **DROPPED — all five file-level-only signals came back CLEAN per site. Hoist nothing extra and do
  not go looking:** `recruitment.ts` (10 sites clean), `complaints/index.ts` (3 clean),
  `performance.ts` (4 clean — already fixed under #324), `action-proposals.ts` (3 clean),
  `payroll/periods.ts` (only `:149`, marginal). Also `separation.ts` imports
  `sendOffboardingNoticeEmail` but calls it at `:76`, **after** the audit at `:65` — nothing to hoist.

### MANDATORY per-section unit assertion (D10 / M8)

Rev 1 claimed no unit test checks the third argument. **That is false.** Four files already do it:
`tests/unit/department-head.test.ts:81`, `performance-release.test.ts:121,133`,
`performance-template-assignment.test.ts:237`, `performance-template-delete.test.ts:13,89`.

**Every A-section must add this pattern for at least one site it converts.** Copy from
`tests/unit/department-head.test.ts:70-81`:

```ts
dbMock.$transaction.mockImplementation((fn) => fn(tx))
// …
expect(tx.department.update).toHaveBeenCalledWith({ where: { id: DEPT }, data: {...} })
// #324: the audit write shares the transaction.
expect(writeAuditLog).toHaveBeenCalledWith(expect.anything(), expect.anything(), tx)
```

**Two positive assertions, both required:** the mutation ran on `tx`, AND the audit received `tx`.
This fails on any revert. No Postgres, no config, no teardown. It is the cheapest real gate in the
whole plan — cheaper than the integration tier and it covers every section, not two.

### Expect `pnpm test` to go RED, and budget for it (M6)

Rev 1 predicted green and said the conversion "will break NOTHING". **Measured: false.** Of the 97
unit test files that mock `$lib/server/db`:

- **50 have no `$transaction` key at all** — a class-C conversion throws
  `TypeError: db.$transaction is not a function`.
- **8 more have `$transaction` with no `mockImplementation`** — it returns `undefined` where a
  created row is expected.
- **~58 test files need a mock update in total.**

**The rule for telling a legitimate mock update from a regression:**

| Failure | Verdict | Action |
|---|---|---|
| `TypeError: db.$transaction is not a function` | **legitimate** — the mock predates the transaction | Add `$transaction: vi.fn((fn) => fn(dbMock))` to that file's mock |
| `Cannot read properties of undefined` on a row the service just created | **legitimate** — `$transaction` returns `undefined` | Give it `mockImplementation((fn) => fn(tx))` and return the value |
| An assertion on payload contents, action name, entity type, or error message now fails | **REGRESSION** — stop and report | Do not "fix" the test |
| A call-count or ordering assertion changes | **investigate before touching** — may be a real reorder | Report |

**Allocate the mock work to the section that broke it.** Each A-section owns the mock updates for
the test files covering its own services, in its own commit. Do not defer them to a cleanup commit.

### Two static sweeps, mandatory (D11)

**(b) Per section — no bare `db.` inside a new `tx` closure.** This catches the most likely execute
agent mistake: opening `db.$transaction(async (tx) => …)` but leaving the mutation as
`db.thing.create(...)`. That type-checks perfectly and commits outside the transaction.

```bash
# In each file you edited, read every $transaction callback body and confirm zero `db.` calls.
grep -n 'db\.' <edited file>
```
Cross-check each hit against the callback ranges. Expected inside a callback: **zero**. This is a
grep plus a read, not a framework.

**(a) At Z1 — exactly four `db` third arguments.** See Z1.

### Standing fences

**D6 fence** applies. **Do not run any command** — no `pnpm check`, no `pnpm test`, no
`pnpm test:integration`. Edit and report.

---

### I1 — the integration tier (D3, slimmed by D10) · runs first

**Exactly TWO real-Postgres scenarios.** Not five. The `#324` unit pattern above is what gives broad
coverage; this tier exists only to prove that a real transaction really rolls back.

| Scenario | Class | Why |
|---|---|---|
| `payroll/loans.ts` — loan create | C, money | The exact example in the issue body. Loan creates are a plain `create` with no unique key, so they are **not idempotent** and a lost audit is unrecoverable. |
| `departments.ts:32` — department create | C, simplest | A clean read on whether the C conversion pattern works at all. |

**DROPPED from rev 1:** the class-D reveal scenario (`reports/audit-log/+page.server.ts:141` is a
form action needing a synthetic `RequestEvent` past two capability gates —
`tests/unit/audit-log-reveal.test.ts:249` already proves it at unit cost), plus the `supervisors.ts`
and `timesheets.ts` scenarios (the `#324` unit pattern covers those shapes).

**What to build:**

1. **`vitest.integration.config.ts`** — a second config, **not** a change to `vitest.config.ts`
   (whose `include` is hard-restricted to `tests/unit/**`; the 97 mocked files would fight a real
   client). **Keep `plugins: [sveltekit()]` (B5)** — without it every `$lib/...` import fails to
   resolve and the tier lands non-executable instead of red. **Change only `include`** to
   `['tests/integration/**/*.{test,spec}.ts']`, keep `environment: 'node'`, and add serial execution
   (`fileParallelism: false`) so tests do not fight over rows.
2. **`package.json`**: `"test:integration": "dotenv -e .env.dev -- vitest run --config vitest.integration.config.ts"`.
   The `dotenv -e .env.dev` prefix matches every other DB-touching script; there is no `.env`.
   **`pnpm test` stays exactly as it is.**
3. **The client.** Copy `tests/e2e/global-setup.ts:63` — the only real `new PrismaClient()` in the
   repo. It reaches `veent-db-5434` / `veent_hris` via `.env.dev`.
4. **Failure injection — the fix for B4. Read this carefully.**
   `db.$extends(...)` returns a **NEW** client. Every service imports the singleton `db` from
   `$lib/server/db` as a `const`, which cannot be reassigned. Calling `createDepartment(...)` uses
   the plain `db` and **the extension never fires** — rev 1's step 4 forbade the only mechanism that
   works. The correct shape is **module substitution with a REAL extended client**:
   ```ts
   const realDb = new PrismaClient()
   let injectedCalls = 0
   const broken = realDb.$extends({
     query: { auditLog: { create: () => { injectedCalls++; throw new Error('audit down') } } }
   })
   vi.mock('$lib/server/db', () => ({ db: broken }))
   ```
   **Do NOT "fix" this by substituting a fake object** — that removes the real transaction and the
   test proves nothing. It must be a real extended Prisma client.
   **Verified against Prisma 5.22.0 typings and runtime: extensions DO apply inside `$transaction`.**
   `_createItxClient` inherits `_extensions`, and `library.d.ts:918` carries the same `ExtArgs`. So
   `tx.auditLog.create` IS intercepted once the client reaches the service.
5. **Assert absence on a SEPARATE plain client** — not the extended one.
6. **Three assertions per scenario, all required.** A bare absence assertion is satisfiable by an FK
   failure, a role guard, or a broken mock, so it is not enough:
   - `await expect(fn()).rejects.toThrow('audit down')` — the *injected* error, by message
   - `expect(injectedCalls).toBe(1)` — the injected callback actually fired
   - the mutation row is **absent** on the separate client
7. **Positive control, mandatory.** The same scenario without injection: the mutation row AND the
   audit row both land.
8. **Teardown.** None exists in the repo to copy — I1 creates the first. Smallest thing that works:
   each test creates its own fixture rows with a run-unique marker and deletes them in `afterEach`;
   `$disconnect` in `afterAll`. **No truncation, no global reset, no reuse or mutation of seeded
   rows.** This suite must be safe against a developer's working database.

**Write I1's tests against the CURRENT (unfixed) code — they must FAIL at I1 commit time.** That is
the red half of the loop. Record the failing output in the commit body. **`pnpm test:integration` is
therefore not a merge gate until A2 and A4 have landed.**

`pnpm check` DOES cover the new tier — `.svelte-kit/tsconfig.json` includes `../tests/**/*.ts`
(verified).

---

### A5a — the `deriveRange` restructure (D8) · own commit, before A5

**Why this exists.** `deriveRange` (`attendance/index.ts:139-319`) is the worst wrap candidate in the
repo, and B3's 5-second cap makes a naive wrap impossible.

**Current shape, measured:** an outer loop over
`db.employee.findMany({ …, employmentStatus: 'ACTIVE' })` — the full org headcount — and, inside it,
per-employee `db.timeLog.findMany` (`:201`), two `db.request.findMany` (`:207`, `:221`), then an
inner loop over a caller-supplied date range that is **unbounded in code** (`:237-241`). Each inner
iteration does one `db.attendanceDay.findUnique` (`:253`) and one `db.attendanceDay.upsert`
(`:301`), sequentially awaited. Worst case ≈ headcount × days ≈ 900+ round-trips for a full-org
month, and **one** audit row for the whole batch (`:312`).

**Target shape — reads and compute stay OUTSIDE; the transaction holds only writes plus the audit:**

1. **Replace the per-day `findUnique` at `:253` with ONE batch read** before the loops:
   `db.attendanceDay.findMany({ where: { employeeId: { in: employeeIds }, date: { gte, lte } } })`,
   keyed into a `Map` on `${employeeId}|${dayKey}`.
   **Widen the select** from `{ isLocked, manuallyEdited }` to also include every field the `data`
   object at `:277-300` writes — this is what makes step 3 possible. Still one query.
   The per-employee `timeLog` / `request` reads at `:201/:207/:221` **stay where they are** — they
   are outside the transaction, so they cost latency but not lock time. **Do not batch them.** That
   is a separate optimisation and out of scope.
2. **Compute every row in memory.** No database call inside the compute loop. The `isLocked` /
   `manuallyEdited` / `skipUnpunched` skips at `:257-264` are applied against the Map, unchanged.
3. **Diff and drop no-ops.** For each computed row that already exists, compare against the fetched
   row and **skip it if nothing changed.** `deriveRange` is already documented as idempotent, so on
   a re-derive this collapses the write set to near zero. **This is the main lever** — it is what
   keeps the transaction short in the common case.
4. **One short transaction** containing only:
   - `tx.attendanceDay.createMany({ data: newRows, skipDuplicates: true })` — Prisma 5 has no bulk
     upsert, so inserts batch this way;
   - a per-row `tx.attendanceDay.update` for each changed existing row (the `data` differs per row,
     so `updateMany` cannot be used);
   - the single audit row, with `tx`.
5. **Set an explicit timeout on THIS call only:**
   `db.$transaction(async (tx) => { … }, { timeout: 30_000, maxWait: 10_000 })`.
   **This is the one authorised `transactionOptions` override in the plan.** Add a comment saying
   why (batch size scales with headcount × days) and referencing the 5s default it overrides.
6. **Report the measured worst-case write count** for a full-org month in the commit body. If it
   exceeds what 30s can honestly cover, **stop and report** rather than shipping it — do not raise
   the timeout further.

**Also in this section — `attendance/index.ts:578` (`resetDayToDerived`), which rev 1 never named.**
It does `db.attendanceDay.update` at `:575`, then `await deriveRange(...)` at `:576-580`, then
`writeAuditLog` at `:600`. A naive wrap nests the entire `deriveRange` loop inside a transaction.
**Sequence it AFTER the restructure**, then wrap. **Constraint: `deriveRange` writes its own audit
row — do not double-audit.** Decide explicitly whether `resetDayToDerived`'s audit and
`deriveRange`'s audit are both wanted, and say which you kept and why.

**The remaining sites in this file — `:536`, `:603`, `:632` — are also A5a's.** This section owns
`attendance/index.ts` entirely so no other agent touches it.

**Gate note:** the `#324` unit pattern is mandatory here too, and this is the section most likely to
need real test work. `tests/unit/attendance-backlog-import.test.ts` already exercises this path.

---

### A1 — Array-form conversions · 5 conversions / 7 audit calls · wave 2

- `supervisors.ts:75/86` · `complaints/index.ts:145/150` · `employees.ts:1220/1231` ·
  `onboarding.ts:357/362` · `offboarding.ts:211/216`.
- **The trap:** `db.$transaction([a, b])` — the array form — **cannot host a `writeAuditLog` call**.
  It takes promises, not a callback, so there is no `tx`. Convert to
  `db.$transaction(async (tx) => { … })` keeping **the same statements in the same order**, then add
  the audit at the end. **No new locks, no reordering, no added reads.**
- **DO-NOT-WRAP applies** — check the four functions in the shared list before touching
  `employees.ts`.
- **Line-range conflict.** A1 owns **only** the lines listed above in `employees.ts`,
  `onboarding.ts` and `offboarding.ts`. Run in its own wave.
- **A1 ADDS lines** to `onboarding.ts` above A9's remaining site in that file. **A9 must re-grep, not
  trust this plan's line numbers.** (`employees.ts:1220` is below all of A8's targets, so A8 is
  unaffected.)

### A2 — Payroll, money · 11 sites · wave 1

- `payroll/loans.ts:85/105/133/155` (loans **and** cash advances) · `employee-earnings.ts:35/55` ·
  `employee-deductions.ts:49/71` · `employee-statutory.ts:123/150/177`.
- Money, read-then-write. Where a `before` value builds `oldValue`, **move that read inside the
  transaction too.**
- Loan and CA creates are plain `create` with no unique key — **not idempotent**, no safe retry.
- I1's money scenario covers `loans.ts`. This section flips it from red to green.

### A3 — Payroll, runs & periods · 11 sites (not 13) · wave 1 · **owns B1 + D12**

**B1 — the silent survivor. This is the single most important find of the whole validate pass.**

`updateStatutoryRateConfig` (`payroll/statutory-rates.ts:259`) declares
`client: Prisma.TransactionClient = db`. Inside, at `:277` it reads `existing`, at `:278` it
upserts, and at **`:283`** it calls `writeAuditLog(ctx, {...}, client)`.

- Caller `statutory-rates.ts:388` passes `tx` — fine.
- Caller **`src/routes/(app)/payroll/statutory-rates/+page.server.ts:192` passes NOTHING**, so
  `client = db` and the tax-table upsert plus its audit are **two separate commits**.
- Because the function *does* pass a client to `writeAuditLog`, it **greps as class A** and the
  shared brief's "skip class A silently" would skip it. **Z1 does not touch it either.** It is the
  only site in the repo with this shape — 40 of the 41 class-A sites are lexically inside a closure
  that binds their third argument; this one is not.

**Fix (D12): remove `= db` from `updateStatutoryRateConfig`'s own `client` parameter**, exactly as Z1
does to `writeAuditLog`. That forces `+page.server.ts:192` to open a transaction and pass one. Same
fix, same reason, no new pattern. **Do NOT wrap the function's body in its own transaction** — it is
on the DO-NOT-WRAP list (M7); it must keep taking a client from its caller.

**The rest of A3:**
- Class B: `payroll/index.ts:262`→tx at 244 · `payroll/index.ts:679`→660 · `periods.ts:106`→63 ·
  `periods.ts:294`→182.
- Class C: `statutory-rates.ts:342/415` · `payroll/index.ts:719/774` · `periods.ts:125/149/322`.
- `runs.ts:130` is **class A with an `oldValue` defect** — see the `oldValue` section. Do not wrap it.
- **CORRECTED: `payroll/runs.ts` has NO advisory lock.** Rev 1 said it did and would have sent an
  agent hunting a pattern that is not there. **Only two `pg_advisory_xact_lock` sites exist in the
  repo: `timesheets.ts:185` and `payroll/index.ts:110.`** Both are `_xact_` locks taken as the first
  statement on the same Manila-month key. Nothing this plan wraps takes a second lock, so **there is
  no lock-ordering inversion risk** (verified).
- **`payroll/index.ts:774` has a second, independent atomicity defect** (updates `payrollEntry` then
  `payrollRun` with no transaction between them). **Do not fix it.** Wrap the audit; mention the
  separate defect in the PR body.

### A4 — Settings & master data · 19 sites (not 20) · wave 1

- Trivial class C: `settings/master.ts` all 8 (`:38/74/94/111/127/177/193/222`) ·
  `posting-approvers.ts:77/92` · `departments.ts:32/55` · `settings/org.ts:58/98`.
- **CORRECTED: `settings/org.ts:432` is in `assignEmployeePosition` — a bare `db.employee.update`
  plus an unwrapped audit, not inside any transaction. It is trivial class C, NOT "Tier 4".** Rev 1
  was wrong.
- `oldValue`: `departments.ts:101`.
- **Class B, Serializable: `settings/org.ts:308`→tx at 281 and `:360`→tx at 336.** **Only the audit
  call moves.** Do not touch the isolation level, the reads, or anything else in those closures.
  Their `oldValue` reads are **already inside** the Serializable transaction and are **NOT** defects.
- **R2 applies here.** Keep the diff at those two sites to the two moved lines, nothing else.
- I1's simple-C scenario covers `departments.ts:32`. This section flips it green.
- Largest section by count. Split the dispatch by file if needed; **one commit**.

### A5 — Schedules, timesheets, timelog · wave 1 · (`attendance/index.ts` belongs to A5a)

- Class B: `attendance/schedules.ts:60`→39 · `timesheets.ts:228`→183 · `:272`→258 · `:299`→288 ·
  `:475`→455 · `timelog.ts:374`→344.
- Class C: `attendance/schedules.ts:80/110/131/159` · `timesheets.ts:323/363/420`.
- `oldValue`: `timesheets.ts:272`, `timesheets.ts:363`.

**The trap rev 1 missed entirely (M3): `timesheets.ts:420` is a SECOND untransacted path inside
`reviewTimesheet` — the same function as the named class-B site `:475`.** An agent that moves `:475`
into the transaction at `:452` and thinks "one transaction, this function is done" **leaves `:420`
standing**. Handle both. Confirm by grep that `reviewTimesheet` has no third audit call.

**`timelog.ts:141` — R3 is a NON-RISK, downgraded.** Rev 1 treated the P2002→409 catch as a top
risk. Verified against the Prisma runtime: **ITX rethrows the original error object unchanged**
(`library.js:130`), so `e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'`
still matches from inside a transaction. **`AuditLog` has no unique constraint**, so the audit insert
cannot raise a spurious P2002. Still keep the `try`/`catch` **around** the `db.$transaction(...)`
call rather than inside it — but this is now proven, not hoped, and **AC11 is satisfied by reading
the diff.**

Also verified and safe to rely on: **SvelteKit `error()` thrown inside `$transaction` rolls back AND
propagates as an HTTP response.** Already relied on in shipped code — `action-proposals.ts:213`
throws `error(404)` inside a transaction and `routes/(app)/requests/proposals/+page.server.ts:191-199`
catches it.

`timesheets.ts:185` holds an advisory lock — it is the first statement, so nothing you add inverts an
ordering.

### A6 — Requests & approvals · wave 1 · **owns D9 / B2**

- Class B: `requests/index.ts:194`→190 · `approvals.ts:297`→262 · `approvals.ts:680`→660.
- Class C: `requests/index.ts:78`.
- **`approvals.ts:317`→262 — D4.** Its own comment argues against wrapping. **The owner decision
  overrides the comment: wrap it, class B.** Update the comment to record the new reasoning; do not
  leave a comment that contradicts the code.

**B2 / D9 — two `evictTombstonedBytes` sites that rev 1 placed in no section and no tier list.**
Under a blanket class-C instruction an agent would wrap both and pull a non-rollback-able filesystem
unlink inside a transaction.

| Site | Function | Unlink at | Do |
|---|---|---|---|
| `requests/index.ts:223` | `cancelRequest` | `:221` | Wrap mutation + audit; move `evictTombstonedBytes` to **after** the transaction closes |
| `requests/documents.ts:296` | `deleteRequestDocument` | `:293` | Same |

**D9 also requires rewriting the comment at `requests/index.ts:216`.** It currently says no
transaction should be added because "wrapping it would be speculative structure". That reason is
**obsolete** — #5 supplies a concrete one. Rewrite it to state (a) why the transaction now exists
and (b) why the unlink stays outside it. **Follow the `approvals.ts` `evictTombstonedBytes`
precedent exactly** — same structure, same style of reasoning.

- **Tier 5, separately confirmed:** `requests/index.ts:274` — a `deleteStoredFile()` loop over every
  attached document sits between the mutation and the audit. Hoist the whole loop out.
- `approvals.ts` is the repo's model for all of this. Read it before editing it.

### A7 — Recruitment & job boards · wave 1

- Class B: `recruitment.ts:291`→278 · `:555`→535.
- Class C multi-statement: `recruitment.ts:359/427/467/511/594` (each 2-3 writes) · `:58/84/178` ·
  `job-boards.ts` sites.
- All writes plus the audit in one transaction; **keep the order**.
- **HOIST NOTHING.** Rev 1 flagged `recruitment.ts` as a file-level tier-5 signal. VALIDATE checked
  every site: **all 10 are clean** — no notification or mail call sits between a mutation and its
  audit. Do not go looking.

### A8 — People records · wave 3

- `employees.ts:332` · `:426` · `:638` · `:803` · `emergencyContacts.ts:38/60` ·
  `documents.ts:78/105` · `benefits.ts:51/91/159/194`.
- **`employees.ts:332` is class D and lives here, not in A12.** It audits a **READ** of PII, gated on
  `opts.audit` — *"Constitution P1/P4: reading PII is itself an auditable event."* **Leave it outside
  a transaction.** It passes `db` explicitly (see A12's note on doing this now vs at Z1).
- **DO-NOT-WRAP (M7):** `recordCompensationChange` (`:724`), `promoteEmployee` (`~:1041`) and
  `applyProposedChange` (`:1141`) all take a tx **or** open one. Quote the existing comment at
  `employees.ts:667-673`. Wrapping any of them creates a nested transaction on a second connection.
- **`employees.ts:638`** builds `oldValue`/`newValue` from a field-by-field diff and the `before`
  read is far from the write. Move the `before` read inside the transaction. Read the whole function
  first.
- **`employees.ts:803` is class A with an `oldValue` defect (M2), NOT a wrap target.** It already
  passes `tx` and both call paths are transactional. Only the `atEff` read moves. **Preserve the
  dual-call shape** — the `write(tx)` closure joins a caller's confirm transaction or opens its own.
- **`documents.ts:105` — hoist the storage call out** of the transaction, with a comment.
- **`documents.ts:78` — DO NOT HOIST (M4).** `saveFile()` is at `:63`, **before** the create at
  `:65`. There is nothing between the mutation and the audit. Rev 1 was wrong.
- **Line-range:** `employees.ts:1220/1231` belongs to A1, not here.

### A9 — Separation & lifecycle · 6 sites (not 8) · wave 3

- `separation.ts:65/241` · `offboarding.ts` (all but `:211/216`) · `onboarding.ts` (all but
  `:357/362`) · `action-proposals.ts:227`→tx at 207 (class B) · `:164/:264` (class C).
- **`separation.ts:456` and `:656` are class A with `oldValue` defects (M2), NOT wrap targets.** Both
  already pass `tx`. Only the `before` reads move.
- **`separation.ts:241`** counts, then `updateMany`s — the count-then-write is itself a race. Wrapping
  both in one transaction fixes the audit and narrows the race; say so in the commit body. **Do NOT
  additionally re-architect the count into a compare-and-set claim** — scope creep. **And do NOT
  touch the deliberate `status: { not: 'FINALIZED' }` floor at `:220-238` or its comment.**
- **HOIST NOTHING.** `action-proposals.ts` came back clean at all 3 sites. `separation.ts` imports
  `sendOffboardingNoticeEmail` but calls it at `:76`, **after** the audit at `:65`.
- **RE-GREP before editing.** A1 adds lines to `onboarding.ts` above your remaining site there.

### A10 — Performance · 4 sites · wave 1

- Class C: `performance.ts:122/172/207/307`, plus `performance-templates.ts` sites — **reconcile the
  count by grep.**
- **`performance.ts:878` is NOT a defect and NOT in scope.** Verified twice (PLAN and VALIDATE): in
  `savePerformanceConfig` the `before` read, the `upsert` and the audit are all inside one
  `db.$transaction` with `tx` passed. Class A. **Do not touch it.**
- **`performance.ts:329` is a doc comment** — a #4 false positive, irrelevant here, still not edited.
- **HOIST NOTHING.** All 4 sites clean — `performance.ts`'s notification paths were already fixed
  under #324.

### A11 — Misc · wave 1

**`announcements.ts:72` — RE-DECIDED. Rev 1's premise was factually wrong (M5).**
Rev 1 said a `notifyMany` fan-out sits between the create and the audit and must be hoisted out on
the `approvals.ts` filesystem-unlink precedent. **Verified false:** `notifyMany`
(`src/lib/server/services/notifications.ts:17`) is **DB-only** — a single
`db.notification.createMany`. No network call, no per-recipient fan-out.

**Consequence:** this is a **lock-duration** concern, not an irreversibility one, and the
`approvals.ts` precedent **does not apply**. Hoisting the notification write OUT would actively
**weaken** atomicity — notifications would persist for an announcement that rolled back.

**Decision: keep `notifyMany` INSIDE the transaction.** Three DB statements (the announcement
create, one `createMany`, one audit insert) comfortably fit B3's 5-second cap. **Hoist only the
org-wide `user.findMany` recipient query at `:52`** out of the transaction — it is a read, it does
not need to be atomic with the write, and keeping it out is what holds the transaction short.
**State this reason in the comment.** Do not cite `approvals.ts`; the reason here is lock duration,
not rollback-ability.

- **`awards.ts:54` — DO NOT HOIST (M4).** `notify()` is at `:62`, **after** the audit. Nothing sits
  between the mutation and the audit. Rev 1 was wrong.
- **`branches.ts:252` — class A with a confirmed `oldValue` defect.** In `toggleBranchStatus` the
  write side is already correct (`db.$transaction`, audit inside, `tx` passed), but `existing` comes
  from a `db.branch.findFirst` **outside** the transaction and its `.status` becomes `oldValue`.
  Move the status read inside. **That `findFirst` is also the 404 guard — keep 404 behaviour
  identical.** Either move the whole guard in, or re-read `status` inside and leave the guard where
  it is. **Read the function, choose, and report which.**
- `inventory.ts` — verify whether it has any non-class-A site at all before editing.

### A12 — Auth & session · 4 sites · wave 1

**Three of the four class-D sites live here. LEAVE THEM OUTSIDE a transaction.**

| Site | Why it stays outside |
|---|---|
| `routes/(auth)/login/+page.server.ts:73` — `LOGIN_FAILED` | No mutation exists. **The audit row IS the event.** A vanishing failed-login trail is a security regression. |
| `routes/(auth)/login/+page.server.ts:99` — `LOGIN` | The session cookie is already set at line 88. A `lastLoginAt` write failure must not erase the record of a session that exists. |
| `routes/(app)/reports/audit-log/+page.server.ts:141` — the reveal | Audits a **READ**. *"Written before the payload is returned, so a failed write means no reveal."* **Locked by `tests/unit/audit-log-reveal.test.ts:249`** — must stay green. |

- The fourth class-D site, `services/employees.ts:332`, is in A8. Named here for completeness.
- **The one class-C site here** is `routes/api/v1/session/switch-org/+server.ts` — wrap it normally.
- **Add the explicit `db` third argument NOW, not at Z1**, so Z1's diff is only `audit.ts`. All four
  class-D files **already import `db`** — **zero new imports**. Verify before adding one. **If A12
  does this, A8 must do the same for `employees.ts:332`.**
- **Add a short comment at each class-D site recording why it is exempt**, so a future reader does
  not "fix" it back. Reuse the reasoning above.

---

### Z1 — make the third parameter required (D5) · LAST commit, alone

```ts
- client: Prisma.TransactionClient = db
+ client: Prisma.TransactionClient
```

- **This turns every remaining un-passed call site into a type error at once** — hence last. If
  `pnpm check` reports errors after Z1, each is a site an A-section missed. **Fix them inside Z1's
  commit** and name them in the commit body. Do not amend an earlier commit.
- **Do NOT add an export for `AuditContext` or `AuditPayload`.** `AuditContext` is **already
  exported** from `src/lib/server/services/types.ts:3` and imported by 40+ services; `audit.ts`'s
  private copies are duplicates. Rev 1's "check whether they need exporting" step is **removed** —
  it would have produced a second competing export.
- The `import { db } from './db'` in `audit.ts` may become unused. **Remove it if and only if it
  does. Nothing else.**
- **`prisma/**` and `scripts/**` are NOT a risk** — `grep -rn "writeAuditLog" scripts/ prisma/` is
  empty (verified twice). The documented `pnpm check` blind spot does not apply. **Re-run the grep at
  Z1 time and paste the empty result into the commit body.**

**D11(a) — the sweep that makes Z1 a real gate (B6).**

`pnpm check` after Z1 proves a client is passed. **It does not prove that client is a *transaction*
client.** An agent could write `writeAuditLog(ctx, payload, db)` at all 114 sites: `pnpm check`
green, `pnpm test` green, third-argument grep green, **#5 entirely unfixed.** AC6 as rev 1 wrote it
was unproven by its own stated evidence.

**The gate:**

```bash
grep -rnE -A40 'writeAuditLog\(' src --include='*.ts' | grep -nE '^\s*(db|db\s*\))'
```
Read every third argument. **Expected: exactly FOUR sites pass `db`**, and they must be these four
and no others:

1. `routes/(auth)/login/+page.server.ts:73` (`LOGIN_FAILED`)
2. `routes/(auth)/login/+page.server.ts:99` (`LOGIN`)
3. `routes/(app)/reports/audit-log/+page.server.ts:141` (the reveal)
4. `services/employees.ts:332` (PII read)

**A fifth `db` is a missed conversion. Fix it in Z1.** Paste the enumerated list into the commit
body. Combined with D11(b)'s per-section sweep, this is what actually proves #5 landed.

---

## The `oldValue` race — 9 sites, of which 4 are RECLASSIFIED (M2)

A separate defect that shares the fix. **Fixing the write side does not fix this.** The `oldValue`
stays a stale pre-transaction snapshot and two concurrent saves still log the same one.

**The fix, everywhere: move the `before` read inside the transaction, immediately before the write.**
Reference: `services/settings/backup.ts:108-143`.

**Rev 1 told agents to CONVERT four sites that are ALREADY class A.** Rev 1 caught this shape twice
(`branches.ts:252`, `performance.ts:878`) but did not sweep for it. Reclassified as **class A with an
`oldValue` defect — the `oldValue` fix is still required; the wrap is NOT**:

| Site | Section | Status | Note |
|---|---|---|---|
| `payroll/runs.ts:130` | A3 | **class A + oldValue** — passes `tx`, inside the tx at `:118` | `run` read outside; the `wasLocked` decision drives `reverseAmortization`. Highest consequence of the nine. |
| `employees.ts:803` | A8 | **class A + oldValue** — passes `tx`, both call paths transactional | **Money.** `atEff` read outside the `write(tx)` closure. Preserve the dual-call shape. |
| `separation.ts:456` | A9 | **class A + oldValue** — passes `tx` | |
| `separation.ts:656` | A9 | **class A + oldValue** — passes `tx` | |
| `branches.ts:252` | A11 | class A + oldValue | Write side correct; preserve the 404 guard exactly. |
| `timesheets.ts:272` | A5 | class B + oldValue | Both fixes needed. |
| `timesheets.ts:363` | A5 | class C + oldValue | |
| `departments.ts:101` | A4 | class C + oldValue | |
| `performance.ts:878` | — | **NOT A DEFECT** | Verified twice. Read, write and audit all inside one transaction. **Removed. Do not touch.** |

`settings/org.ts:308` / `:360` are **NOT** defects — their reads are already inside the Serializable
transaction.

**If any section finds a tenth site of this shape, report it — do not fix it silently.**

---

## Verification — per section

**Standing rules for the orchestrator:** `pnpm check` kills a running dev server; only the
orchestrator runs it, knowingly. Never start the database or the dev server — the user does that.
One gate pass per section, then one commit.

### Block 1 gates (per section)

| Step | Command / check | What a pass proves |
|---|---|---|
| 1 | `git diff --stat` | Only the section's listed files changed. |
| 2 | `grep -nP 'user\s*:\s*\{[^{}]*organizationId' <section files>` | Returns **only** whichever of the four known false positives are in this section. **CORRECTED: there is no `isActive` carve-out.** After S6's conversion the surviving `user: { isActive: true }` wrapper has no `organizationId` and **cannot match the pattern**. Rev 1's carve-out was bogus and would have let an agent accept a stray hit. |
| 3 | `pnpm check` | The conversion type-checks. **Does not cover** `reports.ts:99` (unannotated) or the raw SQL in S2. |
| 4 | `pnpm test` | Green **except** the five known files in T1. Track which fail and why — a *new* failure outside those five is a real regression. |
| 5 | `git commit` | — |

- **S2 extra:** there is no compile-time check on a `$queryRaw` template — **manual read is the
  gate.** Confirm alias `u` is gone everywhere after deleting the JOIN at `:64`.
- **S4 extra:** confirm S6 is committed. Confirm **both** `calculator.ts:309` and `:347` changed and
  `:317` did not.

### Block 1 exit gate (after T1)

| Command | Expected |
|---|---|
| **`grep -rnP 'user\s*:\s*\{[^{}]*organizationId' --include='*.ts' src`** | **Repo-wide sweep, one command. Residue = exactly the 4 false positives.** Per-section greps cannot prove completeness; this can. |
| `pnpm check` | clean |
| `pnpm test` | **fully green, 0 failures** |
| `pnpm test tests/unit/employee-org-divergence.test.ts` | passes |
| **Red-proof (mandatory)** | Temporarily revert one converted `where` builder in the working tree, re-run the divergence test, confirm it **FAILS**, restore with `git stash pop` / `git restore`. **Never `git checkout <file>`** — it silently reverts uncommitted work. Copy to the scratchpad if unsure. |
| `pnpm test:e2e` | 127/127. Once at block exit, not per section. |

Without the red-proof the new test is unproven and may be vacuously green.

### Block 2 gates (per section)

| Step | Command / check | What a pass proves |
|---|---|---|
| 1 | `git diff --stat` | Only the section's listed files/lines changed. |
| 2 | `grep -nE -A40 'writeAuditLog\(' <section files>` | Every site now passes a third argument, or is a documented class-D exemption. |
| 3 | **D11(b) sweep** — `grep -n 'db\.' <edited files>`, cross-checked against each `$transaction` callback range | **Zero bare `db.` calls inside any new `tx` closure.** Catches the mutation-left-on-`db` mistake, which type-checks perfectly and silently commits outside the transaction. |
| 4 | `pnpm check` | The `tx` client type-checks against every mutation moved onto it. |
| 5 | `pnpm test` | **EXPECT RED on first run.** Apply the M6 legitimate-vs-regression table. Green only after this section's ~N mock updates land in the same commit. |
| 6 | **`#324` unit assertion** for at least one converted site in this section | The mutation ran on `tx` AND the audit received `tx`. **Fails on revert. This is the section's real correctness gate.** |
| 7 | `pnpm test:integration` | Only A2 and A4 have coverage here; those two flip I1 from red to green. |
| 8 | `git commit` | — |

### What a green suite does and does NOT prove for #5

**A green `pnpm test` alone is worth close to nothing.** 97 of 176 unit files mock `$lib/server/db`;
those with `$transaction` mock it as `async (fn) => fn(dbMock)` — a pass-through, so no transaction,
no rollback, no atomicity, and a test cannot observe "the mutation did not persist" because nothing
ever persists. 75 files mock `writeAuditLog` away entirely (`payroll-void-audit.test.ts` says so in
its own header: *"They do NOT prove the row reached Postgres."*). `src/lib/server/audit.ts` has no
dedicated unit test.

Per Block-2 section:

- **Green `pnpm test` proves:** nothing was accidentally broken in the surrounding logic — payload
  contents, action names, error paths, call ordering as the mocks see it. A **regression** gate, not
  a **correctness** gate.
- **Green `pnpm test` does NOT prove:** that the audit row and the mutation commit or roll back
  together; that a transaction exists at all; that a lock is not held too long; that an `oldValue`
  is read inside the transaction.
- **What DOES prove correctness, in order of coverage:** the **`#324` unit assertion** (step 6 —
  every section, cheap, fails on revert), the **D11 sweeps** (steps 3 and Z1 — catch the two silent
  mistakes), and **`pnpm test:integration`** (two scenarios, proves a real rollback really happens).
  `pnpm check` after Z1 proves only that *a* client is passed, which is why D11(a) exists.

**Say all of this plainly in the PR body.**

### Block 2 exit gate (after Z1)

| Command | Expected |
|---|---|
| `pnpm check` | clean |
| **D11(a) sweep** | **exactly 4 `db` third arguments, and they are the 4 named in Z1** |
| `grep -rn "writeAuditLog" scripts/ prisma/` | empty (paste into Z1's commit body) |
| `pnpm test` | fully green |
| `pnpm test:integration` | both scenarios green, each with its positive control and its `injectedCalls` counter |
| `pnpm test:e2e` | 127/127 |
| `pnpm lint` | clean |

---

## Acceptance criteria

| # | Criterion | Proven by | Strategy |
|---|---|---|---|
| AC1 | All 82 #4 sites use `Employee.organizationId`; the 4 false positives untouched | **repo-wide sweep at Block 1 exit** + `pnpm check` | Fully-Automated |
| AC2 | The raw-SQL site no longer joins `users` | manual read of `dashboard.ts:61-65` | Agent-Probe |
| AC3 | `team/+page.server.ts:40` keeps `user: { isActive: true }` | S6 diff review + `pnpm check` | Hybrid |
| AC4 | The divergent precondition is covered and genuinely fails on the old shape | `employee-org-divergence.test.ts` + the mandatory red-proof | Hybrid |
| AC5 | The 5 buggy-shape tests are converted, not deleted; `matches()` has no dead `user` branch | `pnpm test` green at Block 1 exit + diff review | Fully-Automated |
| AC6 | All 114 #5 sites pass a **transaction** client | `pnpm check` after Z1 **AND D11(a) — exactly 4 `db`** | Fully-Automated |
| AC7 | Every new `tx` closure mutates on `tx`, never on `db` | **D11(b) per-section sweep** | Fully-Automated |
| AC8 | The four class-D sites stay outside a transaction and pass `db` | D11(a) + `tests/unit/audit-log-reveal.test.ts` | Fully-Automated |
| AC9 | A failed audit write rolls the mutation back | `pnpm test:integration` — 2 scenarios, each with `rejects.toThrow('audit down')`, `injectedCalls === 1`, absence on a separate client, and a positive control | Fully-Automated |
| AC10 | Per section, the mutation ran on `tx` and the audit received `tx` | **`#324` unit assertion, one per A-section** | Fully-Automated |
| AC11 | The 9 `oldValue` reads happen inside their transactions | diff review against the reclassified table | Agent-Probe |
| AC12 | Only the named hoists happen; nothing extra | diff review of A6, A8, A11 + A5a | Agent-Probe |
| AC13 | `deriveRange` finishes inside its stated timeout | A5a's reported worst-case write count + the explicit `timeout` option | Hybrid |
| AC14 | `timelog.ts` still returns 409 on a duplicate punch | **diff review** — proven by the banked Prisma-runtime finding, no test needed | Agent-Probe |
| AC15 | `updateStatutoryRateConfig`'s route caller opens a transaction | `pnpm check` after D12 removes the default | Fully-Automated |
| AC16 | No UI/UX change | `git diff --stat -- '*.svelte'` empty | Fully-Automated |

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Repo-wide `grep -rnP 'user\s*:\s*\{[^{}]*organizationId' --include='*.ts' src` at Block 1 exit | Fully-Automated | AC1 |
| `pnpm check` per section and after Z1 | Fully-Automated | AC1, AC3, AC6, AC15 |
| `pnpm test` fully green at Block 1 exit | Fully-Automated | AC5 |
| `employee-org-divergence.test.ts` + manual red-proof revert | Hybrid — needs a deliberate temporary revert | AC4 |
| **D11(a)** — enumerate every `db` third argument after Z1; exactly 4, each named | Fully-Automated | AC6, AC8 |
| **D11(b)** — per section, zero bare `db.` inside a new `tx` closure | Fully-Automated | AC7 |
| **`#324` unit assertion, one per A-section** (`department-head.test.ts:70-81` pattern) | Fully-Automated | AC10 |
| `pnpm test:integration` — loan create + department create, each with throw-by-message, `injectedCalls`, absence on a separate client, and a positive control | Fully-Automated (precondition: `veent-db-5434` up, `.env.dev`) | AC9 |
| `tests/unit/audit-log-reveal.test.ts` stays green | Fully-Automated | AC8 |
| Manual read of `dashboard.ts:61-65` | Agent-Probe — no compile-time check on a raw template | AC2 |
| Diff review of the 9 `oldValue` sites against the reclassified table | Agent-Probe | AC11 |
| Diff review of the named hoists only (A6, A8, A11, A5a) | Agent-Probe | AC12 |
| A5a's reported worst-case write count + explicit `timeout` | Hybrid | AC13 |
| Diff review of `timelog.ts`'s catch placement | Agent-Probe — the runtime behaviour is already verified | AC14 |
| `git diff --stat -- '*.svelte'` empty | Fully-Automated | AC16 |
| `pnpm test:e2e` 127/127 at each block exit | Fully-Automated (precondition: build + preview per `playwright.config.ts`) | regression only |

**Known gaps — CONDITIONAL, not accepted as PASS:**

| Gap | Why | Backlog stub |
|---|---|---|
| Only 2 sites have real-Postgres rollback proof; the rest rest on the `#324` unit pattern plus the two sweeps | One integration test per site is not affordable. The `#324` pattern is a genuine per-section gate, so this gap is much smaller than rev 1's | `avipa-5-audit-integration-coverage_NOTE` |
| Lock duration is not measured, including A5a's restructured transaction | No perf harness exists | `avipa-5-lock-duration_NOTE` |
| P2034 retry exposure at `settings/org.ts` is untested | No retry wrapper exists to test (R2) | `avipa-5-serializable-retry_NOTE` |
| `deriveRange`'s per-employee reads (`:201/:207/:221`) stay N+1 | Out of scope — they are outside the transaction | `avipa-5-deriverange-batch-reads_NOTE` |

---

## Risks

| # | Risk | Mitigation |
|---|---|---|
| **R1** | **Class-C/B misclassification.** The ~91 count is derived; 3-5 sites sit on the boundary. An agent may open a second transaction inside a function that already has one. | Every brief says re-verify your own sites. **`pnpm check` will NOT catch a nested transaction** — the D11(b) sweep plus the diff review must confirm no function gained a second `$transaction`. The M7 DO-NOT-WRAP list names the four functions where this is most likely. VALIDATE confirmed **zero nesting exists today**, so any new one is ours. |
| **R2** | **P2034 at `settings/org.ts:281/336`.** Both are already Serializable and **no retry wrapper exists anywhere in `src/lib/server`.** | Both are class B — only the audit moves, so the added work is one insert. Keep the diff to two lines. **Do not build a retry wrapper.** Backlog stub. |
| **R3** | ~~`timelog.ts:141` P2002→409 semantics~~ — **DOWNGRADED TO NON-RISK.** | Verified: Prisma ITX rethrows the original error object unchanged; `AuditLog` has no unique constraint. Keep the catch around the `$transaction` and read the diff. No test needed. |
| **R4** | **Prisma's 5-second transaction cap (B3).** No override exists anywhere; every new bare transaction inherits `timeout 5000ms`. | Stated in the shared Block-2 brief so it reaches every agent. D8/A5a restructures the one site that cannot fit. Any agent that cannot fit inside 5s **stops and reports** rather than raising the timeout. |
| **R5** | **A5a's restructured transaction is still large on a full-org month re-derive.** | The diff-and-skip in step 3 collapses the common case to near zero writes. `createMany` batches inserts. An explicit `{ timeout: 30_000 }` on that one call. The agent must **report the measured worst case** and stop if 30s is not honest. |
| **R6** | **A green suite hides a wrong #5 fix entirely** (pass-through `$transaction` mocks; `writeAuditLog` mocked away). | Four independent gates now, not one: the `#324` unit assertion per section, D11(a), D11(b), and the two integration scenarios. Rev 1 relied on `pnpm check` alone, which B6 showed is a no-op. |
| **R7** | **`pnpm test` goes red across ~58 files and the work is unbudgeted.** | M6 quantifies it (50 files with no `$transaction` key, 8 with no `mockImplementation`), gives the legitimate-vs-regression table, and assigns the mock updates to the section that broke them, in the same commit. |
| **R8** | **D7 violated** — a #5 agent dispatched while a #4 section is open. 21 files overlap and the conflicts would be silent semantic ones. | Block 2's entry gate: `git status` clean AND T1 committed AND both suites green. **D7 is procedural, not structural** — the orchestrator must actually run the gate. Mitigating factor: all 82 #4 edits are single-line, so line drift in the overlapping files is essentially zero. |
| **R9** | **Line-range split of `employees.ts` / `onboarding.ts` / `offboarding.ts` across A1 and A8/A9.** | The split is exact (VALIDATE confirmed no line falls in both or neither). Waves keep them apart. **A1 adds lines to `onboarding.ts`, so A9 must re-grep.** The fallback is decided once, before wave 1. |
| **R10** | **The new #4 divergence test is vacuously green.** | The mandatory red-proof, the converged positive control, the `expect(where.user).toBeUndefined()` negative assertion, and removal of `matches()`'s dead `user` branch. |
| **R11** | **`reports.ts:99` is unannotated and the raw SQL has no compile-time check.** | Both are named manual-read gates. The repo-wide sweep at Block 1 exit catches a missed conversion in either. |
| **R12** | **Z1 surfaces missed sites all at once.** | Expected: fix inside Z1's commit, name each in the body. **More than ~5 means an A-section under-verified** — record which. |
| **R13** | **The integration tier mutates a developer's working database.** | Per-test fixtures with a run-unique marker, deleted in `afterEach`. No truncation, no global reset, no reuse of seeded rows. Serial execution. |
| **R14** | **B1's shape recurs** — another function with its own `client = db` default that greps as class A. | VALIDATE swept for it: `updateStatutoryRateConfig` is the **only** one; 40 of 41 class-A sites are lexically inside a binding closure. D11(a)'s enumeration would catch a new one at Z1. |

**Non-risks, verified — do not spend effort here:** advisory-lock ordering (only two `_xact_` sites,
both first-statement, same key); connection pool exhaustion (no `connection_limit`, bare
`new PrismaClient()`, no nesting, ≤1 connection per request path); `prisma/**` and `scripts/**`
coverage at Z1 (grep empty, and `.svelte-kit/tsconfig.json` includes `../tests/**/*.ts`);
SvelteKit `error()` inside `$transaction`.

---

## NON-GOALS — explicitly out of scope

1. **AVIPA #6** — the ~43 unscoped `employee.findUnique({ where: { userId } })` self-lookups (D6).
2. **`payroll/index.ts:774`'s independent atomicity defect.** Mention in the PR body; do not fix.
3. **`prisma/seed-core.ts:465`'s stale comment** — already false today; belongs to #6.
4. **`prisma/seed-core.ts:70`** — the hardcode that makes divergence unconstructible. The #4 test
   builds divergence with a unit fixture instead.
5. **A shared org-scope helper for #4** (D1, rejected by the owner).
6. **A transaction wrapper, retry utility, or audit facade for #5.**
7. **A P2034 retry wrapper.** Backlog stub only.
8. **Batching `deriveRange`'s per-employee `timeLog` / `request` reads.** A5a batches only the
   `attendanceDay` read. Backlog stub.
9. **`transactionOptions` anywhere except A5a's one call.**
10. **`impeccable` UI passes.** Zero `.svelte` files change.
11. **Any adjacent refactor, reformat, rename, or dead-code deletion.**
12. **Turning `separation.ts:241` or any other pre-existing race into a compare-and-set claim**
    beyond what wrapping the audit naturally achieves. Do not touch its `FINALIZED` floor.

---

## Test Infra Improvement Notes

- **The `#324` unit pattern was already in the repo and rev 1 missed it.** Four files use it
  (`department-head.test.ts:81`, `performance-release.test.ts:121,133`,
  `performance-template-assignment.test.ts:237`, `performance-template-delete.test.ts:13,89`). It is
  now mandated per A-section. **This is the highest-leverage test infrastructure fact in the plan** —
  cheaper than the integration tier and it covers every section.
- **The integration tier (I1) is the first real-Postgres test layer outside Playwright.** Extending
  it per service is cheap once it exists.
- **No shared Prisma mock helper exists** — all 177 unit tests hand-roll `vi.hoisted` +
  `vi.mock('$lib/server/db')`. **~58 of them need a `$transaction` mock after #5.** Building the
  shared helper is tempting and **out of scope for this branch** — but after ~58 hand-edits the case
  for it is much stronger. File a note.
- **`tests/unit/setup.ts` is one line.** No DB lifecycle.
- **`tests/e2e/global-setup.ts` seeds but never rolls back.** No teardown pattern to copy; I1 creates
  the first one.
- **`src/lib/server/audit.ts` has no dedicated test file.** After Z1 a small one asserting the
  required-parameter signature would be cheap. Note only.
- **`dashboard-org-scoping.test.ts`'s `matches()` engine is the repo's only real filter simulator.**
  It is why T1 Part B can genuinely fail. Worth knowing about for future scoping work.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/general-plans/active/avipa-4-5-org-scoping-and-audit-tx_PLAN_01-09-26.md`
2. **Last completed step:** PLAN revision 2 written 01-09-26 in response to a BLOCKED validate verdict. No source file touched. Branch `fix/org-scoping-audit-tx-4-5` at `8880660`.
3. **Validate contract status:** written — see below. Rev 1 verdict BLOCKED; this revision resolves B1-B7 and is submitted for re-validate.
4. **Supporting context loaded:** the research digest, `avipa-4-5-orchestrator-spotchecks.md`, issues `HyuseCS/AVIPA#4` and `#5`, `CLAUDE.md`, `vitest.config.ts`, `package.json`, `src/lib/server/audit.ts`, `tests/e2e/global-setup.ts`, plus direct reads of `attendance/index.ts:130-325`, `payroll/statutory-rates.ts:250-300`, `routes/(app)/payroll/statutory-rates/+page.server.ts:180-200`, `payroll/calculator.ts:300-350`, `performance.ts:840-900`, `branches.ts:200-275`, `payroll/runs.ts:120-150`, `employees.ts:780-815`, `timelog.ts:120-155`.
5. **Next step for a fresh agent:** re-validate this revision. After a GO, commit the research digest and this plan, then dispatch Block 1 wave 1 (S1, S2, S3, S5, S6, S7) as six parallel `vc-execute-agent`s. Gate and commit each in the main thread. Then S4, then T1, then the Block 1 exit gate including the repo-wide sweep and the red-proof. Only then start Block 2 with I1 → A5a → the A waves → Z1.
6. **PLAN-time verifications banked (do not redo):** `performance.ts:878` is not an `oldValue` defect; `branches.ts:252` is one; `calculator.ts` has sites at `:309` and `:347` and an already-correct `groupBy` at `:317`; `updateStatutoryRateConfig`'s route caller at `+page.server.ts:192` passes no client; `deriveRange`'s real loop and query shape as described in A5a.

---

## Validate Contract

**Verdict: rev 1 BLOCKED → this revision submits as CONDITIONAL.** Four adversarial validators ran on
disjoint scopes (V1 = #4 inventory, V2 = #5 inventory and classes, V3 = test strategy, V4 = runtime
and transaction semantics). Every blocker was something rev 1 did not LOOK at; none was something it
got wrong.

### Blockers and resolutions

| # | Blocker | Resolution in rev 2 |
|---|---|---|
| **B1** | `payroll/statutory-rates.ts:283` is a silent survivor. `updateStatutoryRateConfig` has its own `client = db` default; route caller `+page.server.ts:192` passes nothing, so the upsert and the audit are two commits. It greps as class A, so "skip class A silently" skips it and Z1 never touches it. | **D12** — remove that function's own default too, forcing the route to open a transaction. Owned by **A3**. A class-A carve-out is now stated in the shared brief. **R14** tracks recurrence; VALIDATE confirmed it is the only instance. |
| **B2** | `requests/index.ts:223` and `requests/documents.ts:296` were in no section and no tier-5 list; A6's blanket class-C instruction would pull a filesystem unlink inside a transaction. | **D9** — both named in **A6** with the unlink moved after the transaction, per the `approvals.ts` precedent, and the obsolete comment at `requests/index.ts:216` rewritten. |
| **B3** | Prisma's 5-second transaction cap; no `transactionOptions` override exists anywhere. | Stated as its own subsection of the **shared Block-2 brief** so it reaches every agent, plus **R4**. It is named as the reason D8 exists. A5a is the only authorised override. |
| **B4** | I1's `db.$extends(...)` injection never reaches the code under test — services import the `db` singleton, which the extension does not replace. Rev 1 forbade the only mechanism that works. | **I1 step 4 rewritten**: `vi.mock('$lib/server/db', () => ({ db: broken }))` with a **real** extended client, plus an explicit "do NOT substitute a fake object" warning. Banked: extensions DO apply inside `$transaction` (Prisma 5.22.0, `_createItxClient` inherits `_extensions`). |
| **B5** | `vitest.integration.config.ts` as specified could not resolve `$lib`. | **I1 step 1**: keep `plugins: [sveltekit()]`, change only `include`. |
| **B6** | `Z1 + pnpm check` is a no-op gate and was the sole gate for 109 of 114 sites — `writeAuditLog(ctx, payload, db)` everywhere would pass it. | **D11(a)** — enumerate every `db` third argument at Z1; exactly 4, each named. AC6 rewritten to cite it. Plus the `#324` per-section assertion (D10) as broad coverage. |
| **B7** | No gate caught a `tx` closure that leaves the mutation on `db`. | **D11(b)** — per-section sweep, now gate step 3 in every Block-2 section. New **AC7**. |

### Decisions added

**D8** deriveRange restructure (own section A5a, own commit, spec written from the real code, includes
the previously-unnamed `:578`) · **D9** the two `evictTombstonedBytes` sites · **D10** slim I1 to two
scenarios and mandate the `#324` unit pattern per section · **D11** two static sweeps as gates ·
**D12** remove `updateStatutoryRateConfig`'s own client default.

### Major corrections applied

**M1** `calculator.ts:347` was missing — rev 1 would have shipped 81 of 82 · **M2** four sites
reclassified as class-A-with-`oldValue` (`runs.ts:130`, `employees.ts:803`, `separation.ts:456/:656`)
· **M3** counts corrected (A3=11, A4=19, A9=6, A1 split into 5 conversions / 7 calls) and all 23
previously-unnamed sites enumerated, including `timesheets.ts:420` · **M4** two false hoists dropped
(`documents.ts:78`, `awards.ts:54`) and all five file-level signals cleared · **M5** `announcements.ts:72`
re-decided against the real `notifyMany` (DB-only; keep it inside, hoist only the recipient read) ·
**M6** `pnpm test` will go red across ~58 files, with a legitimate-vs-regression rule and per-section
allocation · **M7** DO-NOT-WRAP list of four dual-call functions · **M8** the `#324` unit pattern
already exists and is now mandated.

Minors applied: `payroll/runs.ts` has no advisory lock · `settings/org.ts:432` is trivial class C ·
sections are reviewable not revertible · `AuditContext` is already exported · 44 files / 41 edited ·
raw-SQL lines are `:61/:64/:65` · the bogus `isActive` grep carve-out removed · `benefits-enroll-scoping`
breaks from S6 · `matches()` needs replace-not-add plus dead-branch removal · I1 needs throw-by-message
and a call counter · I1's class-D scenario dropped · the `Employee.userId` non-nullable fact added ·
repo-wide sweep at Block 1 exit · the error-before-audit rollback note for the PR body ·
`separation.ts:241`'s FINALIZED floor protected · A9 must re-grep after A1 · the "unconstructible"
claim scoped to application write paths.

### Banked — confirmed by VALIDATE, do not re-derive

- **#4 inventory is exact**: 82 sites, 35 files, S1..S7 disjoint and exhaustive, exactly 4 false
  positives, no site 83, no primary-org counterexample.
- **#5 headline numbers are exact**: 155 calls, 114 to fix, **41 class A — exact, not a lower bound**.
- **No fifth class-D site exists.** The `entityId: 'reorder'` sites are correctly class C.
- **No nested-transaction case exists today** (full call graph, 73 `$transaction` sites). M7 is a
  guardrail, not a bug report.
- **`timelog.ts:141`'s P2002→409 survives a transaction** — Prisma ITX rethrows unchanged;
  `AuditLog` has no unique constraint. **R3 downgraded to a non-risk.**
- **SvelteKit `error()` inside `$transaction`** rolls back and propagates; already relied on in
  shipped code (`action-proposals.ts:213` ↔ `requests/proposals/+page.server.ts:191-199`).
- **Advisory locks are safe** — only `timesheets.ts:185` and `payroll/index.ts:110`, both
  first-statement `_xact_` locks on the same Manila-month key.
- **Connection pool is fine** — no `connection_limit`, bare `new PrismaClient()`, ≤1 connection per
  request path with no nesting.
- **Z1's blast radius is contained** — `grep -rn writeAuditLog scripts/ prisma/` empty, and
  `.svelte-kit/tsconfig.json` includes `../tests/**/*.ts` so `pnpm check` covers the new tier.
- **The A1/A8/A9 line-range split is exact**; wave disjointness holds; no signature change crosses
  agents.
- **T1 Part B can genuinely fail on revert** — `dashboard-org-scoping.test.ts` has a real recursive
  `matches(row, where)` engine. The three `where` builders are module-private and routing through
  exported callers is viable.
- **Non-goals are clean** — nothing in the plan would have an agent touch AVIPA #6,
  `payroll/index.ts:774`, or `seed-core.ts:465`.
- **`separation.ts`'s `sendOffboardingNoticeEmail` is called after the audit** — no hoist needed.
