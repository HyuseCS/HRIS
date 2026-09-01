# Research digest — AVIPA #4 + #5

Measured on HEAD (`8880660`), branch `fix/org-scoping-audit-tx-4-5`, 2026-09-01.
Two RESEARCH agents produced this. **Counts here supersede the issue bodies.**

---

## Settled decisions (owner, 2026-09-01)

| # | Decision |
|---|---|
| D1 | #4: convert all 82 sites. The four shared `where` builders are converted in place — **no new shared org-scope helper**. |
| D2 | #5: convert all 114 sites, sectioned. Side-effect-hoisting sites included. |
| D3 | Build a real-Postgres integration test tier. It is the only thing that can fail if the fix is wrong. |
| D4 | `approvals.ts:317` → wrap it (treat as class B), overriding its own comment. The `LOGIN` and `LOGIN_FAILED` audits stay outside a transaction (class D). |
| D5 | `writeAuditLog`'s third parameter becomes **required** (drop `= db`). Lands LAST, after all 114 sites. Class-D sites pass `db` explicitly. |
| D6 | The ~43 unscoped `employee.findUnique({ where: { userId } })` self-lookups are **out of scope** — filed as AVIPA #6. Do not fix them here even when editing the same function. |
| D7 | #4 lands completely before #5 begins. 21 files overlap. Never run the two concurrently. |

---

# ISSUE #4 — employee queries join through `user.organizationId`

## Corrected counts
- **82 sites, 35 files.** 81 Prisma `where` clauses + 1 raw SQL.
- The issue's "36 files" is off by one.

## The conversion
```ts
- where: { employee: { user: { organizationId: ctx.organizationId } } }
+ where: { employee: { organizationId: ctx.organizationId } }
```
`Employee.organizationId` exists and is indexed (`@@unique([organizationId, employeeNumber])`,
`@@index([organizationId, branchId])`). Reference shape already in the repo:
`src/lib/server/services/complaints/index.ts`, plus `routes/(app)/profile/+page.server.ts:30`,
`routes/(app)/punch/+page.server.ts:42`, `routes/(app)/complaints/[id]/+page.server.ts:20`.

## The "read each one" warning came back EMPTY
All 82 sites read. **Zero genuinely mean the primary org.** Every one is a tenant boundary.
Convert all 82. Six need care, not a different answer:

1. `services/dashboard.ts:61` — **raw SQL.** `JOIN users u ON u.id = e."userId" WHERE u."organizationId" = $1`
   becomes `e."organizationId" = $1` with the JOIN dropped entirely.
2. `routes/(app)/team/+page.server.ts:40` — the **only** site with a second key inside the user filter:
   `user: { organizationId: user.organizationId, isActive: true }`. Move `organizationId` out to the
   Employee level and **keep** `user: { isActive: true }`. Do not delete the wrapper.
3-6. Four high-fan-out shared `where` builders: `employees.ts:160` (`employeeListWhere`),
   `requests/index.ts:99` (`requestListWhere`), `timesheets.ts:68` (`timesheetListWhere`),
   `reports.ts:99` (inline `const where` in `generateHeadcount`, unannotated so TS will not catch a bad edit).

## DO NOT EDIT — four grep false positives
- `services/performance.ts:329` — doc comment
- `services/departments.ts:74` — doc comment
- `services/payroll/payslip-fetch.ts:34` — TS parameter type
- `routes/(app)/punch/+page.server.ts:40` — TS parameter type; the query at :42 is already correct

## Files already MIXED (both shapes in one file — do not "tidy" the correct ones)
`payroll/index.ts` (:314 wrong, 10 others right), `payroll/calculator.ts` (:309 wrong, :317 right),
`dashboard.ts` (:346 wrong, :490 right).

## Sections — S1..S7, disjoint, one commit each
| S | Name | Files | Sites |
|---|---|---|---|
| S1 | Reports | `services/reports.ts` | 9 |
| S2 | Dashboard | `services/dashboard.ts` (7 + 1 raw SQL), `routes/(app)/dashboard/+page.server.ts` (4) | 12 |
| S3 | Attendance | `attendance/index.ts` (7), `attendance/import.ts` (1), `attendance/schedules.ts` (1), `routes/(app)/attendance/+page.server.ts` (1) | 10 |
| S4 | Payroll | `payroll/loans.ts` (4), `calculator.ts` (2), `index.ts` (1), `employee-earnings.ts` (1), `employee-deductions.ts` (1), `employee-statutory.ts` (1) | 10 |
| S5 | Requests/approvals/timesheets/leave | `requests/index.ts` (4), `requests/documents.ts` (2), `approvals.ts` (3), `timesheets.ts` (3), `leave.ts` (2), `routes/(app)/timesheets/+page.server.ts` (1), `routes/(app)/requests/timesheets/+page.server.ts` (1), `routes/(app)/requests/proposals/+page.server.ts` (1) | 17 |
| S6 | Employees & access | `employees.ts` (4), `employee-access.ts` (4), `supervisors.ts` (2), `routes/(app)/employees/[id]/+page.server.ts` (1), `routes/(app)/employees/new/+page.server.ts` (1), `routes/(app)/team/+page.server.ts` (1) | 13 |
| S7 | HR misc & backup | `documents.ts` (2), `emergencyContacts.ts` (2), `lib/server/backup/run.ts` (2), `awards.ts` (1), `posting-approvers.ts` (1), `routes/(app)/settings/posting-approvers/+page.server.ts` (1), `routes/(app)/departments/+page.server.ts` (1), `routes/(app)/benefits/+page.server.ts` (1) | 11 |

**Ordering constraint:** S6 before S4 — `payroll/calculator.ts:304` consumes
`listVisiblePayEmployeeIds` from `employee-access.ts` (S6). No file overlap, but S4's commit is only
independently verifiable once S6's behaviour is in place.

## Existing tests encode the BUGGY shape — they WILL fail. That is the tripwire, not a problem.
| File:line | What it asserts |
|---|---|
| `tests/unit/report-scoping.test.ts:171` | `expect(where.employee).toEqual({ user: { organizationId: 'org1' } })` |
| `tests/unit/benefits-enroll-scoping.test.ts:56` | `where: { id: EMPLOYEE, user: { organizationId: ORG } }` |
| `tests/unit/backup-run.test.ts:369,372` | the buggy shape, twice |
| `tests/unit/dashboard-org-scoping.test.ts:35,40,42,154` | fixtures carry `user: { organizationId }` and NO own `organizationId` |
| `tests/unit/attendance-backlog-import.test.ts:83,262` | comment + matching fixture |

Convert them to the new shape — do not delete the assertions.
The other ~33 `tests/unit/**` grep hits are `locals: { user: { … } }` request stubs. Leave them.

## The test that does not exist
**No test anywhere constructs the divergent precondition.** Every org-scoping test covers the
converged case. The precondition is an Employee where
`Employee.organizationId !== Employee.user.organizationId`.

`prisma/seed-core.ts:70` inside `ensureEmployeeProfile` hardcodes `organizationId: user.organizationId`,
which is the exact line that makes divergence unconstructible in a real DB.

Unit route (cheapest): add a fixture employee carrying BOTH columns, disagreeing. There is no shared
Prisma mock helper — all 177 unit tests hand-roll `vi.hoisted` + `vi.mock('$lib/server/db')`, so this
is per-file work. `tests/unit/dashboard-org-scoping.test.ts` applies the `where` to fixtures rather
than asserting shape, and is the closest thing to a reusable pattern.

## Stale comments the conversion invalidates
- `services/attendance/import.ts:221-222` — "Org-scoped through the `user` relation, matching every
  other org-scoped employee read in this service". Becomes false.
- `prisma/seed-core.ts:465` — "Executive access account — no Employee record". **Already false today**
  (`seed-core.ts:487` creates `EMP-900`). Correcting it belongs to AVIPA #6, not here.

## No UI/UX change
11 `+page.server.ts` loaders are touched. Zero `.svelte` files. Both shapes return identical rows
today because the defect is latent, so no rendered output changes. `impeccable` is NOT warranted.

## Latency claims re-verified on HEAD
4 of 5 hold (`allocateAndCreate` one-transaction; `seed-core.ts:70`; admin upsert `update: {}`;
nothing writes `User.organizationId` — all 6 `user.update` sites checked).
**Claim 5 is FALSE:** the CEO now has an Employee (`seed-core.ts:487`, `EMP-900`). #4 stays latent
anyway because that row's two org columns still agree. The consequence is AVIPA #6 (D6).

---

# ISSUE #5 — audit rows written outside the enclosing transaction

## `writeAuditLog` THROWS. It does not swallow.
`src/lib/server/audit.ts`, 41 lines, one signature, **no wrappers anywhere**.
```ts
export async function writeAuditLog(ctx, payload, client: Prisma.TransactionClient = db): Promise<void> {
	await client.auditLog.create({ data: { … } })
}
```
So the real failure mode is **committed change + no audit row + a 500 shown to the user** —
not silent loss. The issue's framing is wrong on this point. State it correctly in the PR.

`AuditContext` and `AuditPayload` are **not exported**. D5 may need them exported.

## Corrected counts
| | Issue said | HEAD |
|---|---|---|
| Call sites | 149 | **155** |
| Already correct (class A) | 24 | **41** |
| To fix | 125 | **114** |
| Files with calls | — | **45** (40 services + 5 routes) |

**Re-count caveat:** two class-A sites have payloads >20 lines, so a `grep -A20` scan misses their
third argument. **Always use `-A40`.** 41 is a verified lower bound.

## Classes
- **A — 41.** Correct already. Do not touch.
- **B — 19.** A transaction exists in the enclosing function; the audit sits outside it. All 19 are
  the interactive form, so `tx` is in scope. Fix = move the call inside the closure + pass `tx`.
- **C — ~91.** Bare `db.*` mutation, no transaction anywhere. **This count is DERIVED, not
  individually eyeballed** — 3-5 sites sit on the C/B boundary. Every section must re-verify its own
  sites before editing.
- **D — 4.** Must NOT be transactional.

### Class B (19) — audit line → transaction opens at
`action-proposals.ts:227`→207 · `approvals.ts:297`→262 · **`approvals.ts:317`→262 (D4: wrap it)** ·
`approvals.ts:680`→660 · `attendance/schedules.ts:60`→39 · `payroll/index.ts:262`→244 ·
`payroll/index.ts:679`→660 · `payroll/periods.ts:106`→63 · `payroll/periods.ts:294`→182 ·
`recruitment.ts:291`→278 · `recruitment.ts:555`→535 · `requests/index.ts:194`→190 ·
`settings/org.ts:308`→281 (**Serializable**) · `settings/org.ts:360`→336 (**Serializable**) ·
`timelog.ts:374`→344 · `timesheets.ts:228`→183 · `timesheets.ts:272`→258 · `timesheets.ts:299`→288 ·
`timesheets.ts:475`→455

### Class D (4) — LEAVE OUTSIDE A TRANSACTION
| Site | Why |
|---|---|
| `routes/(auth)/login/+page.server.ts:73` — `LOGIN_FAILED` | No mutation exists. The audit row IS the event. A vanishing failed-login trail is a security regression. |
| `routes/(auth)/login/+page.server.ts:99` — `LOGIN` | The session cookie is already set at line 88. A `lastLoginAt` write failure must not erase the record of a session that exists. |
| `routes/(app)/reports/audit-log/+page.server.ts:141` — the reveal | Audits a READ. Existing comment: "Written before the payload is returned, so a failed write means no reveal." Locked by `tests/unit/audit-log-reveal.test.ts:249`. |
| `services/employees.ts:332` — PII read | Audits a READ, gated on `opts.audit`. "Constitution P1/P4: reading PII is itself an auditable event." |

Under D5 these four pass `db` explicitly. All four files already import `db`. **Zero new imports.**

## Class C difficulty tiers

**Tier 1 — trivial, ~45 sites.** One mutation + audit, no side effects.
`departments.ts:32/55` · `emergencyContacts.ts:38/60` · `payroll/employee-earnings.ts:35/55` ·
`payroll/employee-deductions.ts:49/71` · `payroll/employee-statutory.ts:123/150/177` ·
`posting-approvers.ts:77/92` · `settings/master.ts` (all 8: 38/74/94/111/127/177/193/222) ·
`benefits.ts:51/91` · `attendance/schedules.ts:80/110/131` · `performance.ts:122/172/207/307`

**Tier 2 — array-form, 5 sites.** `db.$transaction([a, b])` CANNOT host a `writeAuditLog` call.
Convert to `async (tx) => { … }` first. Mechanical, same statements, same order, no new locks.
`supervisors.ts:75/86` · `complaints/index.ts:145/150` · `employees.ts:1220/1231` ·
`onboarding.ts:357/362` · `offboarding.ts:211/216`

**Tier 3 — money, read-then-write.** `payroll/loans.ts:85/105/133/155` (loans AND cash advances —
the four the issue names) · `payroll/statutory-rates.ts:342/415` · `payroll/index.ts:719/774`.
Loan/CA creates are plain `create` with no unique key, so NOT idempotent.

**Tier 4 — multi-statement / loops.** `recruitment.ts:359/427/467/511/594` (each 2-3 writes) ·
`attendance/index.ts:312` (**upsert inside a `for` loop**) · `settings/org.ts:432`

**Tier 5 — side effects must be hoisted OUT of the transaction first.** These change ordering; they
are behavioural edits, not mechanical ones.
| File | Non-DB work sitting between mutation and audit |
|---|---|
| `announcements.ts:72` | `notifyMany` fan-out over every active user, plus an org-wide `user.findMany` |
| `requests/index.ts:274` | `deleteStoredFile()` loop over every attached document |
| `documents.ts:78/105` | storage calls |
| `awards.ts:54` | notifications |
| `recruitment.ts`, `complaints/index.ts`, `performance.ts`, `action-proposals.ts`, `payroll/periods.ts` | notification/mail references — **file-level signal only, confirm per site** |

**The repo's own precedent is already correct and must be followed:** `approvals.ts` runs
`evictTombstonedBytes()` outside its transaction and says why — *"A filesystem unlink is not
rollback-able: run it inside the `$transaction` above and a disk error rolls back an approval that
already moved a leave balance."*

**Tier 6 — hardest.** `timelog.ts:141` (a `try`/`catch` converts P2002 → 409; a transaction must
preserve that or duplicate punches start 500-ing) · `separation.ts:65/241` (`241` counts then
`updateMany` — the count-then-write is itself a race) · `employees.ts:426/638` (`638` builds
`oldValue`/`newValue` from a field-by-field diff; the `before` read is far from the write)

## Lock-duration risks — three sites
1. **`attendance/index.ts:312`** — `upsert` inside a `for` loop, one audit row for the batch.
   Wrapping the whole loop makes transaction length scale with days × employees. Worst candidate.
2. **`announcements.ts:52-72`** — an org-wide `user.findMany` plus an N-recipient fan-out sits
   between create and audit.
3. **`settings/org.ts:281/336`** — already **Serializable**. Class B, so only the audit moves, but
   any change raises P2034 retry exposure and **no retry wrapper exists anywhere in `src/lib/server`.**

Precedent to follow rather than invent: `payroll/periods.ts` and `payroll/runs.ts` already use
advisory locks and compare-and-set `updateMany` claims.

## The `oldValue` race — a SEPARATE defect, 8 confirmed + 2 uncertain
Fixing the write side does NOT fix these. The `oldValue` stays a stale pre-transaction snapshot and
two concurrent saves still log the same one. 29 sites pass an `oldValue`; these read it outside the
transaction that then mutates it:

`payroll/runs.ts:130` (the `wasLocked` decision drives amortization reversal) ·
`employees.ts:803` (**money** — `oldValue.basicMonthlySalary`) · `separation.ts:456` ·
`separation.ts:656` · `timesheets.ts:272` · `timesheets.ts:363` · `departments.ts:101` ·
`settings/org.ts:308`/`:360` are NOT defects (the read is already inside the Serializable tx).
Uncertain, verify: `performance.ts:878`, `branches.ts:252`.

The reference implementation fixes both at once by moving the `before` read inside the transaction:
**`services/settings/backup.ts:108-143`**, whose comment states the whole contract in one sentence —
*"One transaction: a failed audit write must not leave the config change standing unrecorded, and
reading `before` outside it lets two concurrent saves log the same oldValue."*

## Sections — disjoint, one commit each
| S | Name | Files | Sites | Collides with #4? |
|---|---|---|---|---|
| A1 | Array-form conversions | `supervisors.ts`, `complaints/index.ts`, `employees.ts:1231`, `onboarding.ts:362`, `offboarding.ts:216` | 5 | — |
| A2 | Payroll — money | `payroll/loans.ts`, `employee-earnings.ts`, `employee-deductions.ts`, `employee-statutory.ts` | 11 | YES |
| A3 | Payroll — runs & periods | `payroll/index.ts`, `periods.ts`, `runs.ts`, `statutory-rates.ts` | 13 | YES (`payroll/index.ts`) |
| A4 | Settings & master data | `settings/master.ts`, `settings/org.ts`, `departments.ts`, `posting-approvers.ts`, `routes/(app)/payroll/config/+page.server.ts` | 20 | YES (`posting-approvers.ts`) |
| A5 | Attendance & timesheets | `attendance/index.ts`, `attendance/schedules.ts`, `timesheets.ts`, `timelog.ts` | 19 | YES |
| A6 | Requests & approvals | `requests/index.ts`, `requests/documents.ts`, `approvals.ts` | 10 | YES |
| A7 | Recruitment & job boards | `recruitment.ts`, `job-boards.ts` | 11 | — |
| A8 | People records | `employees.ts` (332/426/638), `emergencyContacts.ts`, `documents.ts`, `benefits.ts` | 11 | YES |
| A9 | Separation & lifecycle | `separation.ts`, `offboarding.ts` (rest), `onboarding.ts` (rest), `action-proposals.ts` | 8 | — |
| A10 | Performance | `performance.ts`, `performance-templates.ts` | 4 | YES (`performance.ts`) |
| A11 | Misc | `announcements.ts`, `awards.ts`, `inventory.ts`, `branches.ts` | 2 | YES (`awards.ts`) |
| A12 | Auth & session | `routes/(auth)/login/+page.server.ts`, `routes/api/v1/session/switch-org/+server.ts`, `routes/(app)/reports/audit-log/+page.server.ts` | 4 (3 D + 1 C) | — |

Three files are split across sections by LINE RANGE, not file: `employees.ts` (A1 line 1231 vs A8),
`onboarding.ts` (A1 line 362 vs A9), `offboarding.ts` (A1 line 216 vs A9). If line-level splitting is
unacceptable, fold A1 into A8/A9 and keep only `supervisors.ts` + `complaints/index.ts` as A1.

## The test problem — why the suite CANNOT prove this fix
- 97 of 176 unit test files mock `$lib/server/db` wholesale.
- They mock `$transaction` as `async (fn) => fn(dbMock)` — **a pass-through. No transaction, no
  rollback, no atomicity.** A test cannot observe "the mutation did not persist" because nothing
  ever persists.
- 75 files mock `writeAuditLog` away entirely and assert on the argument object. `payroll-void-audit.test.ts`
  says so in its own header: *"They do NOT prove the row reached Postgres."*
- **No test checks the third argument.** `toHaveBeenCalledWith(ctx, payload)` passes either way.
- **Moving a call inside a transaction will break NOTHING.** The suite stays green through the entire
  conversion while proving nothing. This is the exact trap the repo has hit before.
- `src/lib/server/audit.ts` has **no dedicated test file at all.**

**The one test of the right shape:** `tests/unit/audit-log-reveal.test.ts:249-253` makes the audit
write fail and asserts the caller throws. Correct for class D only — for B and C the assertion must
also be "the row is gone from Postgres", which is unreachable with a mocked `db`.

## D3 — the integration tier that has to be built
Blockers and the pattern to copy:
- `vitest.config.ts:7` hard-restricts `include: ['tests/unit/**/*.{test,spec}.{js,ts}']`. A second
  config/project is required — unit and integration **must not share one**, or the 97 mocked files
  fight a real client.
- `tests/unit/setup.ts` is one line (`@testing-library/jest-dom`). No DB lifecycle exists.
- `tests/e2e/global-setup.ts:63` is the **only** real `new PrismaClient()` in the repo. Copy that
  pattern (`dotenv -e .env.dev`, `veent-db-5434`).
- Failure injection must happen at the **Prisma layer, not the module layer**, so the real transaction
  survives: `db.$extends({ query: { auditLog: { create: () => { throw new Error('audit down') } } } })`.
- Assert absence on a **separate client**.
- Keep a **positive control**: the same test without the injected failure must show the row lands.
- Teardown does not exist. `tests/e2e/global-setup.ts` seeds but never rolls back.

## D5 — making the third parameter required
Drop `= db`. All 114 sites become type errors at once, so it must land **last**, as its own commit.
`grep -rn "writeAuditLog" scripts/ prisma/` returns nothing, so the known
`pnpm check`-does-not-cover-`prisma/**`-or-`scripts/**` blind spot is **not** a risk here. Verified.

## No UI/UX change
Zero `.svelte` occurrences. `writeAuditLog` returns `Promise<void>`; no call site reads a return
value. Only the database outcome of an error changes, not the message. `impeccable` NOT warranted.

## Out of scope — note, do not fix
`payroll/index.ts:774` updates `payrollEntry` then `payrollRun` with no transaction between them.
An atomicity defect independent of the audit row. Mention in the PR body; do not fix here.

---

## Reproduction commands

```bash
# #4 — sites and files
grep -rnP 'user\s*:\s*\{[^{}]*organizationId' --include='*.ts' src   # 85 raw, minus 4 false positives
grep -rn '\$queryRaw\|\$executeRaw' --include='*.ts' src              # the raw-SQL site

# #5 — call sites (156 hits minus 1 comment at employees.ts:673 = 155 calls)
grep -rn "writeAuditLog(" src --include="*.ts" | grep -v "^src/lib/server/audit.ts" | wc -l
grep -rnE -A40 "writeAuditLog\($" src --include="*.ts"   # -A40, NOT -A20

# the 21 colliding files
comm -12 <(grep -rlP 'user\s*:\s*\{[^{}]*organizationId' --include='*.ts' src | sort) \
         <(grep -rl 'writeAuditLog(' --include='*.ts' src | grep -v audit.ts | sort)
```
