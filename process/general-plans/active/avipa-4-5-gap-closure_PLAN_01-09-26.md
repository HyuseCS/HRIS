# AVIPA #4/#5 — gap closure

Follow-on to `avipa-4-5-org-scoping-and-audit-tx_PLAN_01-09-26.md`, same branch
`fix/org-scoping-audit-tx-4-5`. That branch shipped 24 commits and left three gaps stated
openly in the hand-off. This plan closes them, plus one regression the gap research found
that the original plan never looked at.

Baseline at start: `eb1ae62`, tree clean, `pnpm check` 0 errors, 2076 unit tests green,
2 integration tests green.

No UI or UX surface is touched anywhere in this plan, so the Impeccable design pass does
not apply. Every change is server-side or test-side.

---

## Gaps

| Ref | Gap | Source |
|---|---|---|
| G1 | `deriveRange`'s 30s transaction budget was an analytical guess, never measured | hand-off |
| G2 | Three services converted for #5 with no positive-path test | hand-off |
| G3 | Test files whose `$transaction` mock makes the audit-client assertion unfalsifiable | hand-off |
| R1 | The #4/#5 branch widened a check-then-write window on attendance locks | gap RESEARCH |

## Decisions taken

- **D1** — G1 is fixed by removing the slow operation, not by picking a better timeout.
  User chose "rewrite it to write in bulk" over "measure it and set a real number".
- **D2** — G3 is fixed by repairing the two misleading assertions and committing a source
  scan as a test. The 26 pass-through mocks are NOT rewritten. User chose this over the
  full 26-file rewrite.
- **D3** — R1 is fixed here rather than deferred. It is a regression this branch
  introduced, it is one extra statement, and leaving it would ship a known lock bug.

## Measured evidence (this machine, dev Postgres 18, rolled-back transactions)

| Operation | 15,500 rows | Per row |
|---|---|---|
| `tx.attendanceDay.update` in a sequential loop (current code) | 38,079 ms | 2.457 ms |
| One `UPDATE ... FROM jsonb_to_recordset(...)` | 1,092 ms | 0.070 ms |
| `tx.attendanceDay.createMany` | 2,224 ms | 0.143 ms |

Both update paths produced identical stored values on a sampled row, `updatedAt` included.

Two consequences:

1. **The shipped 30s budget is already exceeded.** At 2.457 ms/row it is blown at about
   12,200 changed rows, which is roughly 394 employees over a 31-day payroll month. The
   original "covers 300-500 employees" estimate landed on the failure point, not inside it.
2. `createMany` does NOT hit Postgres's 65535 bind-parameter ceiling at 15,500 rows.
   That hypothesis was tested and is false. It needs no change.

---

## S1 — Bulk-write the changed attendance rows (G1)

File: `src/lib/server/services/attendance/index.ts`

Replace the per-row loop at `:388` with a single set-based statement. Everything else about
the transaction stays as the #5 work left it: reads and compute stay outside, the audit row
stays inside on `tx`.

The statement, proven against the live schema:

```sql
UPDATE "attendance_days" AS a
SET "status" = v."status", ... , "updatedAt" = now()
FROM jsonb_to_recordset($1::jsonb) AS v("id" text, "status" "AttendanceStatus", ...)
WHERE a."id" = v."id"
```

Requirements:

- **`updatedAt` must be set explicitly.** The column has no database default; Prisma's
  `@updatedAt` is client-side only, and raw SQL bypasses it. Omitting it silently freezes
  the timestamp on every bulk-updated row. This is the single easiest thing to get wrong here.
- Column type list must match the live schema exactly: `"AttendanceStatus"` and `"DayType"`
  for the two enums, `timestamp(3)` for the six datetime columns, `numeric(5,2)` for the
  eleven hour columns, `integer` for `lateMinutes` / `undertimeMinutes` / `breakMinutes`.
- One jsonb parameter carries the whole batch, so there is no row-count ceiling and no
  chunking. Do not add chunking.
- Skip the statement entirely when `updates.length === 0`.
- Build the column list from one array shared with the `data` object so the two cannot
  drift apart. A missing column here means a value silently never written.
- Verify how the values serialise. If `deriveAttendanceDay` returns `Prisma.Decimal`
  rather than `number`, confirm `JSON.stringify` emits something `numeric(5,2)` accepts,
  and assert it in a test rather than assuming.

Timeout: drop `{ timeout: 30_000, maxWait: 10_000 }` to `{ timeout: 15_000, maxWait: 10_000 }`.
Worst measured content is ~3.3 s. 15 s is ~4.5x headroom. It is not removed entirely because
the default 5 s leaves under 2x. Put the measured figures in the comment so the next person
inherits evidence instead of another guess.

Gate: a unit test asserting the bulk statement is issued once for many changed rows, is not
issued for zero, and still passes `tx` to `writeAuditLog`.

## S2 — Close the attendance lock window (R1)

File: `src/lib/server/services/attendance/index.ts`

`isLocked` and `manuallyEdited` are read from the batch snapshot at `:214`, but the writes
now happen after the whole compute pass. A concurrent `lockRange` (`:716`, a single
`updateMany`) can lock a day inside that window, and the update will overwrite a locked row.

Before the restructure the read sat immediately before its own write, so the window was
milliseconds. This branch widened it to the full compute. It is ours.

Fix: inside the transaction, before the bulk update, re-read the flags for the ids about to
be written and drop any row that has since become locked or hand-edited. One `findMany`.
Do the same filter for the insert set only if a cheap check exists; a brand-new row cannot
have been locked, so inserts need nothing.

Gate: a unit test where the in-transaction re-read reports a row locked and the bulk update
excludes it.

## S3 — Positive-path tests for the three untested services (G2)

New files under `tests/unit/`. Template: `tests/unit/loan-write-scoping.test.ts` — same
directory as two of the three targets, same `requireEmployee` + `assertNotSelf` guard stack,
already asserts tx-sharing on a create.

| Target | Functions needing a positive path |
|---|---|
| `src/lib/server/services/payroll/employee-earnings.ts` | `createEmployeeEarning`, `endEmployeeEarning` |
| `src/lib/server/services/payroll/employee-deductions.ts` | `createEmployeeDeduction`, `endEmployeeDeduction` |
| `src/lib/server/services/job-boards.ts` | `setChannel` |

`tx` must be a distinct object from the db mock. That separation is the entire point; a
test written with `fn(dbMock)` here reproduces the G3 defect in new code.

Fixture notes from research, all of which will otherwise cost a debugging round:

- `employee.findFirst` fixtures need a `userId` field — `assertNotSelf` compares it to
  `ctx.actorId`.
- `tx.employeeEarning.create` and `tx.employeeDeduction.create` must resolve `{ id }`; the
  audit payload dereferences it.
- `createEmployeeDeduction` reads `deductionType.findFirst` before the transaction and
  throws unless it returns `{ id, code, label, isActive: true, isStatutory: false }`.
- `job-boards.ts` imports `Prisma` as a **value** for `instanceof` checks. Do not mock
  `@prisma/client`.
- `setChannel`'s reads use `select: { id: true }`; `tests/unit/recruitment-posting-sod.test.ts`
  carries a `project()` helper for that and is the better template for this one function.

Out of scope, found during research, do not fix: `job-boards.ts:245` returns early when
unticking a board that was never posted, writing no audit row.

## S4 — Repair the two assertions that prove nothing (G3a)

- `tests/unit/employee-number.test.ts:177` — the comment says the audit row is written on
  the transaction's client; the asserted value is `dbMock`, and line 72 makes `tx === db`.
  Give the file a distinct `tx` and assert it.
- `tests/unit/proposal-queue.test.ts:353` — asserts the inverse class-D claim (this one must
  take `db`, it audits a read). Equally unprovable while `tx === db` (line 95). Give it a
  distinct `tx` and assert `db`, so the claim becomes falsifiable in the direction it means.

Only these two files. The other 24 pass-through files are left alone under D2.

## S5 — Commit the source scan as a test (G3b)

New test under `tests/unit/`. Port the throwaway D11(a) sweep into it.

It parses every `writeAuditLog(` call in `src/**`, matches parentheses to find the third
argument, and asserts each one is a transaction client — with a small explicit allow-list
for the four deliberate `db` exemptions, keyed by file and reason.

Why this and not the 26 mock rewrites: it covers all 155 call sites, including the many
that no unit test reaches at all, and it fails on a new violation anywhere rather than only
where someone remembered to assert.

Requirements:

- Skip the doc-comment match at `employees.ts:699`, which is prose, not a call.
- The allow-list must be exact. A wildcard turns the test into decoration.
- Fail with the offending `file:line` in the message.
- Must be a `.test.ts` under `tests/unit/` to be collected — `vitest.config.ts` has no
  `setupFiles` and includes only that glob.

---

## Commits

One per section, in order. S1 and S2 touch the same file and are sequenced.

1. `perf(attendance): bulk-write derived rows instead of one update per row`
2. `fix(attendance): re-check the lock flags inside the write transaction`
3. `test(payroll,recruitment): cover the three services converted without tests`
4. `test(audit): make the two vacuous audit-client assertions falsifiable`
5. `test(audit): assert every writeAuditLog call site passes a transaction client`

No `Co-Authored-By`, no attribution footer, on any of them.

## Gates

Every commit: `pnpm check` 0 errors. Final: full `pnpm test`, `pnpm test:integration`, and
both static sweeps still clean. Unit count must rise from 2076, never fall.

## Non-goals

- Rewriting the 26 pass-through `$transaction` mocks (D2).
- Chunking `createMany` — measured unnecessary.
- The `job-boards.ts:245` missing audit row on an untick.
- An advisory lock around `deriveRange`. S2 closes the window this branch opened; a full
  serialisation guard is separate work.
- Any headcount cap on `importAttendance`. The bulk rewrite removes the reason for one.

---

# Execution record

Five commits on top of `eb1ae62`.

| Commit | Section |
|---|---|
| `f040777` | this plan |
| `6b6c7da` | S4 |
| `d4dc603` | S3 |
| `2e155ea` | S1 + S2 |
| `57c8855` | S5 |

Final gates: `pnpm check` 0 errors over 1078 files (1 pre-existing a11y warning on
`CalculatorWindow.svelte`, untouched); unit 186 files / 2113 tests, up from 181 / 2076;
integration 2/2; both static sweeps clean; no attribution trailer on any commit.

`writeAuditLog` census after: 156 regex matches = 155 real calls plus one doc comment.
152 pass a transaction client, 4 pass `db` deliberately, 0 pass nothing.

## Deviations from the plan

- **S1 and S2 landed as one commit, not two.** They interleave in a single hunk: the lock
  re-check produces the very array the bulk statement consumes. Splitting them would have
  meant authoring a throwaway intermediate version purely to manufacture a second commit.
- **S1 requirement 2 was met differently.** The plan asked for a shared `COLS` array. The
  implementation uses `Object.keys(rows[0])` instead, so the column list IS the derived
  payload rather than a copy of it that can fall out of step. Strictly better; the test pins
  the count at 23.
- **One file outside the planned set changed.** `tests/unit/attendance-autoderive.test.ts`
  mocked `tx.attendanceDay.update`, which no longer exists on the write path, so two of its
  tests broke. Its `tx` now carries no `update` delegate at all, so a regression back to the
  loop throws there instead of passing quietly.

## Answers the plan asked for

- **Serialisation (S1 requirement 4):** plain `number`, not `Prisma.Decimal`.
  `AttendanceDayResult` in `attendance/derive.ts:105-127` declares every hour field as
  `number` and every time field as `Date | null`, all non-optional, so `JSON.stringify` never
  omits a key. Hours emit as bare JSON numbers, times as ISO strings. A later switch to
  Decimal would emit `{"d":[...]}` and fail the pinned test.
- **The `createMany` bind-parameter worry was false.** Tested at 15,500 rows against the live
  database: it succeeds. No chunking was added.

## Gap found while closing the others

The unit tests mock `$executeRaw`, so nothing executes the generated SQL. A wrong entry in
`DERIVED_COLUMN_TYPES`, a misspelled column, or a value that will not cast would pass every
unit test and fail at runtime. The hand-run probe validated an equivalent statement, not the
one this code builds. Closed by an integration test that runs `deriveRange` against real
Postgres and asserts one column per type family, `updatedAt` movement, and that a row locked
between the snapshot and the write is not overwritten.

## Still open, carried to the PR

- The 26 pass-through `$transaction` mocks remain (D2). The committed source scan is what
  holds the line, not those files.
- `job-boards.ts` writes no audit row when unticking a board that was never posted. Now
  pinned by a test, so moving it is a visible decision rather than a silent drop.
- No advisory lock serialises two concurrent `deriveRange` calls. S2 closed the window this
  branch opened; it did not make concurrent derives mutually exclusive.
- `importAttendance` still has no headcount cap. The bulk rewrite removed the reason to add
  one, but nothing enforces a ceiling.
- All timings are from one developer machine running four containers. Production hardware
  will differ; the ratio between the two approaches is the durable part, not the absolutes.
