---
name: report:timesheet-capture-phase2-200
description: "EXECUTE report — Phase 2 (#200 CSV backlog import): four CI gates green, 14 mutations RED, four mutation-honesty defects found and fixed"
phase: phase-2-200-csv-backlog-import
date: 17-08-26
status: COMPLETE
feature: timesheet-capture
plan: process/features/timesheet-capture/active/timesheet-capture-162-177-200_17-08-26/timesheet-capture-162-177-200_PLAN_17-08-26.md
metadata:
  node_type: memory
  type: report
  feature: timesheet-capture
  phase: phase-2-200
---

# Phase 2 (#200) — CSV backlog import

Status: **CODE DONE + VERIFIED** against §2.8. Not committed (the user commits after review).
Stopped at the §2 phase gate; Phase 3 not started.

## Files changed

| File | Change | Lines |
|---|---|---|
| `src/lib/server/services/attendance/import.ts` | **new** — caps, `sanitizeCell`, `parseBacklogCsv`, `importBacklogCsv` | +331 |
| `tests/unit/attendance-backlog-import.test.ts` | **new** — B6–B12 | +411 |
| `tests/unit/attendance-backlog-rbac.test.ts` | **new** — B13–B16 | +170 |
| `tests/unit/attendance-backlog-parse.test.ts` | **new** — B1–B5 | +145 |
| `tests/fixtures/backlog/{valid,formula-injection,malformed,binary}.csv` | **new** | +14 |
| `src/routes/(app)/attendance/+page.svelte` | upload form + result summary + one submit guard | +60 |
| `src/routes/(app)/attendance/+page.server.ts` | `importBacklog` action, `toFail` allow-list | +35 −3 |
| `prisma/schema.prisma` | `TimeLog.dedupKey` + `@@unique([dedupKey, employeeId])` | +9 |
| `package.json` / `pnpm-lock.yaml` | `papaparse` 5.6.0, `@types/papaparse` 5.5.2 | +20 |

`src/lib/server/services/reports.ts` is **unchanged** (still in the plan's read-but-not-changed set).
No pre-existing test file was edited.

## Contract items — in scope for Phase 2

| Item | Verdict |
|---|---|
| **E4** caps must bound their work | **APPLIED.** Size + extension are checked in the ACTION before `await file.text()` — the body is never decoded on a refusal. The row cap moved into papaparse `preview: MAX_IMPORT_ROWS + 1`, so it bounds the parse rather than following it. Verified empirically that `preview` counts DATA rows under `header: true`. The service keeps both checks as a second layer. B16 asserts `file.text()` was never called. |
| **E5 (rows 1–5)** extra mutations | **APPLIED.** 62-day span, NUL rejection, `.csv` extension, `toFail` 413/415 all RED. Row 3 (BOM strip) is **not applicable** — see Deviations. |
| **E8** four mocked specs that cannot fail | **APPLIED.** B10 uses a `where.dedupKey.in`-keyed `mockImplementation`; B6 asserts the literal `+08:00` instants; B11 uses a 25-rejection fixture so `≤20` is a real bound; B12 asserts the `where` shapes, not call counts. |
| **P2** the regex is not a "mirror" | **APPLIED with a stated difference.** Read `reports.ts:622` live: `/^[=+\-@\t\r]/`. Copied that class **verbatim** so the two cannot disagree, and the comment states plainly that this is an independent READ-side check (reject), not a mirror of the WRITE-side neutraliser (prepend a tab), and that `reports.ts`'s constant is module-private. `reports.ts` was not widened, which keeps the plan's "read but not changed" invariant true. |
| **P3** papaparse size | **APPLIED.** Measured the installed tree: **265,221 bytes = 259 KiB** unpacked, v5.6.0, zero runtime sub-dependencies (confirmed). The plan's "~45 kB" is wrong by ~6×; §2.1 should be corrected. |
| **P4** name collision | **APPLIED.** One service function, `importBacklogCsv`, exported and called under that single name. The form action stays `importBacklog` — distinct from the service, and named for the form as its siblings are. |
| **P8** populated-table push | **APPLIED + partly proved live.** See "What was proved and what could not be". |
| **P1, P5, P6, P7** | **NOT APPLICABLE** — Phase 1 (`correctDay`, seed scripts) or Phase 3 (`recordPunch`). |
| **E1, E2, E6, E7** | **NOT APPLICABLE** — Phase 1. |
| **E3, E9** | **NOT APPLICABLE** — Phase 3. |
| **A-E1 … A-E7, A-P1 … A-P5** (Amendment 1) | **ALL NOT APPLICABLE.** Amendment 1 is Phase 1 only, by its own §1.11.9 ("Phase 2, Phase 3: No — explicitly out of this amendment's scope"). Each item names a Phase-1 file: A-E1 `index.ts` threshold wiring; A-E2/A-E3 the `setAmPmMinGap` parse; A-E4 `derive.ts` `amPmMinGapMs`; A-E5/A-E6 `attendance-ampm-gap-setting.test.ts`; A-E7 the `settings/schedules` load; A-P1 `correctDay`; A-P2/A-P3 risk R10; A-P4 the 240 ceiling; A-P5 risk R11. None touches a Phase-2 file. |

## The four CI gates, in CI order

| Gate | Result |
|---|---|
| `pnpm format:check` | **PASS** — all matched files use Prettier style (needed one `pnpm format` write pass mid-phase) |
| `pnpm lint` | **PASS** — 0 errors, 1 warning (pre-existing `CalculatorWindow.svelte` a11y warning, untouched) |
| `pnpm check` | **PASS** — 918 files, **0 errors**, 1 warning (the same pre-existing one) |
| `pnpm test` | **PASS** — **116 files / 1391 tests**, 0 failed |

Baseline was 113 files / 1350 tests → **+3 files, +41 tests**. `tests/unit/timelog-aggregate.test.ts` is
green untouched, as §2.8 requires.

Schema step: `pnpm db:push` **failed** as the plan wrote it (see Deviations); ran
`prisma db push --accept-data-loss` then `pnpm prisma generate`. `\d time_logs` confirms the
`dedupKey` column and `time_logs_dedupKey_employeeId_key`.

## Mutation table — every guard broken, tested, restored

All 14 applicable mutations were applied by hand, the named test re-run, RED confirmed, then
reverted. Post-restore re-run: GREEN.

| # | Guard | Mutation | Test | Result |
|---|---|---|---|---|
| M1 | Lock refusal | delete the `isLocked` branch | B8 | **RED** (2 failed) |
| M2 | Manual-edit refusal | delete the `manuallyEdited` branch | B9 | **RED** (1) |
| M3 | Duplicate collapse | drop the `seenKeys` filter | B10 | **RED** (2) |
| M4 | DB dedup backstop | `skipDuplicates: false` | B10 concurrent | **RED** (1) |
| M5 | Org gate | delete `requireFoodServiceOrg` from the action | B14 | **RED** (1) |
| M6 | Capability gate | delete `requireAnyCapability` from the action | B13 | **RED** (1) |
| M7 | Employee org scoping | drop `user: { organizationId }` from the step-4 `where` | B7 | **RED** (2) |
| M8 | Formula rejection | delete `sanitizeCell`'s prefix test | B2/B3 | **RED** (2) |
| M9a | Size cap | raise `MAX_IMPORT_BYTES` ×1024 | B16 oversize | **RED** (2) — *after the fix below* |
| M9b | Row cap | raise `MAX_IMPORT_ROWS` ×100 | row cap | **RED** (2) — *after the fix below* |
| M10 | 62-day span guard (E5-1) | raise `MAX_SPAN_DAYS` ×100 | B6 span | **RED** (1) |
| M11 | NUL rejection (E5-2) | delete the check | B5 | **RED** (1) — *after the fix below* |
| M12 | BOM strip (E5-3) | — | — | **NOT APPLICABLE** — see Deviations |
| M13 | `.csv` extension (E5-4) | delete the check | B16 415 | **RED** (1) |
| M14 | `toFail` widening (E5-5) | revert to `[400,404,409]` | service-thrown 415 | **RED** (3) |

### Four mutations stayed GREEN on the first pass. All four were real defects, all four are fixed.

1. **M9a and M9b — the Phase 1 trap, twice.** The fixtures were sized `MAX_IMPORT_BYTES + 1` and
   `MAX_IMPORT_ROWS + 500`, so raising the constant moved **both sides** of the comparison and the
   test stayed green. Fixed by making the fixtures **literal** (3 MB, 2500 rows) and adding one
   assertion each pinning the documented constant (`2 * 1024 * 1024`, `2000`). Both now RED.
2. **M11 — the NUL assertion passed for the wrong reason.** With the NUL check deleted, papaparse
   still threw — on the mangled header — so a status-only `toThrowError({ status: 400 })` was
   satisfied by a different guard entirely. Fixed by asserting the NUL-specific message. Now RED.
3. **M12 — a guard that could not be broken because it was dead code.** The BOM was stripped twice
   (whole body **and** `transformHeader`), so deleting either left the other. Removing the redundant
   one exposed the real finding: **papaparse strips the UTF-8 BOM itself** — verified on 5.6.0, a
   leading U+FEFF never reaches `transformHeader`. Both of our strips were unreachable. Deleted
   both; the `valid.csv` fixture still carries a real BOM, so B1 pins the library's behaviour and a
   regression in papaparse is caught here. E5 row 3 is therefore **unsatisfiable by construction,
   not skipped**: there is no BOM strip of ours left to delete.

## Security — built in full

- **Formula-injection rejection on the read side** — `sanitizeCell` strips a leading tab (our own
  exporter's neutralised form) then rejects `/^[=+\-@\t\r]/`. Per row, so one hostile cell never
  costs the operator the rest of the file (B2/B3). Comment records the honest scope: the parsed
  cells become timestamps and employee-number lookups, never re-exported strings, so this is cheap
  garbage rejection, not a load-bearing control.
- **Caps bound the work they exist to bound** (E4) — size and type before the body is read; the row
  cap inside the parse.
- **Locked and hand-corrected days are refused before ANY `TimeLog` write** — the guard is a
  `continue` in the survivor loop, upstream of the `createMany` payload being built at all. B8
  asserts the surviving records by `dedupKey`, so "reject then write anyway" cannot pass. `TimeLog`
  is append-only, so this is what stops an unlock resurrecting backlog punches. `deriveRange` then
  re-checks both flags independently (`index.ts`), so the guard is doubled.
- **RBAC matches its neighbours** — read live: every write action on this page (`derive`, `correct`,
  `resetDay`, `lock`, `deriveTeam`, `lockTeam`) uses `requireAnyCapability(roles, 'MANAGE_HR')`;
  only `unlock`/`unlockTeam` escalate to `OVERRIDE_FINALIZED`. Import is a write of the same class,
  so `MANAGE_HR` it is. Plus `requireFoodServiceOrg` (404), matching the twin-door rule — the
  `{#if}` on the form is cosmetic and B14 pins the action.
- **Org scoping** — the employee lookup goes through `user: { organizationId }` and the org comes
  from the session, never the form (two separate assertions; M7 RED).
- **No new Prisma `Decimal` reaches the client.** `dedupKey` is `String?`.

## What was proved live, and what could not be (P8)

**Proved** on `veent-db-5434` with a scratch table, because the plan's claim needed evidence rather
than reasoning:

- 5,000 pre-existing rows with `dedupKey = NULL` sharing three `employeeId` values.
- `CREATE UNIQUE INDEX … ("dedupKey","employeeId")` over them: **succeeded**. NULLs are distinct.
- Negative control: a genuine duplicate `('backlog:JJ-0001:2026-08-10:amIn','e1')` was **rejected**
  with `duplicate key value violates unique constraint`.
- A further NULL-keyed insert **after** the index existed: accepted.
- Scratch table dropped.

**Still unprovable locally:**

- `select count(*) from time_logs` is **0** on this machine, so the real `prisma db push` against a
  populated table is untested. The scratch test above is the closest available evidence and it
  covers the failure mode that matters (NULL collision); what it does not cover is the
  **ACCESS EXCLUSIVE lock duration** on a large staging table — `db push` builds the index without
  `CONCURRENTLY`. Precedent: #236.
- Production `BODY_SIZE_LIMIT`. `svelte.config.js` passes only `{ out: 'build' }` to
  `@sveltejs/adapter-node`, whose default is 512 KB; `vite dev` does not apply it. A 2 MB CSV may be
  rejected in production while it works locally. `storage.ts` already permits 10 MB uploads, so the
  deployment probably sets it — **confirm before trusting `MAX_IMPORT_BYTES = 2 MB`**.
- `$transaction` rollback, `createMany({ skipDuplicates })` absorbing a real race, and the SQL
  validity of every Prisma query: all mocked here, none exercised against Postgres. Manual steps
  M3–M6 are the intended cover.

## Plan claims wrong against live code

1. **`pnpm db:push` fails for this change.** The script is
   `dotenv -e .env.dev -- prisma db push` with no `--accept-data-loss`, and adding a unique index
   triggers Prisma's data-loss warning ("If there are existing duplicate values, this will fail"),
   so the command exits 1. The §Prisma Contract command sequence needs
   `--accept-data-loss` for Phase 2, and a staging runbook must say so.
2. **papaparse is 259 KiB, not ~45 kB** (P3, confirmed by measurement).
3. **papaparse strips the BOM itself**, so §2.3c's "also strip a leading UTF-8 BOM" is a no-op.
4. **`reports.ts:622` is `/^[=+\-@\t\r]/`**, not `/^[=+\-@]/` (P2, confirmed by reading).

## Deviations from the plan

| Deviation | Why |
|---|---|
| Header defects (unknown column, missing required column) reject the **whole file** with a 400 rather than producing a per-row rejection with a line number, as B4's phrasing implies | A header is file-level: one bad header makes every row untrustworthy, and a stray column means the wrong export was uploaded. Per-row reasons + line numbers are still produced for all row-level defects. Tested both ways in B4. |
| No BOM strip of our own | Dead code — papaparse already does it (verified). Keeping it would have been a guard no mutation could turn red. |
| The audit row is written on **every** import, including one where every row was refused | The plan's step 8 puts the audit inside the write. An all-refused upload is precisely the one an investigator wants on record. One extra spec covers it; B11 still asserts exactly one audit call. |
| `deriveRange` is skipped when nothing was written | Nothing new to re-pair; it would be a full org-wide re-derive for no reason. B9 asserts it. |
| Red-first (validate-contract Mode A) was **not** observed | The plan's own checklist orders implementation (18–19) before tests (22–25), and I followed the checklist. The substitute proof is the mutation table: every guard was broken and confirmed RED after the fact. Recorded honestly rather than claimed. |

## Follow-ups created

None as separate plan stubs. Two items belong in the PR description / staging runbook and are
recorded above rather than in a new file: the `--accept-data-loss` requirement, and confirming
`BODY_SIZE_LIMIT` before trusting the 2 MB cap.

## Forward Preview (Phase 3)

- **Test infra found:** `tests/fixtures/backlog/` now exists and is the first shared upload-fixture
  directory in the repo. The `actions`-export test pattern (B13–B16) worked cleanly with
  `vi.mock(..., importOriginal)` to keep real constants while stubbing one function — reuse it for
  C7–C12. A real `File` plus `vi.spyOn(file, 'text')` is how "the body was never read" is asserted.
- **Blast-radius changes:** `TimeLog` gains `dedupKey` — Phase 3 **shares** this column as the web
  punch's debounce key, so the §2.9 rollback ("drop the column") must not run before Phase 3 is
  reverted too. `attendance/+page.server.ts` `toFail` now allows 413/415.
- **Commands to stay green:** `pnpm format:check && pnpm lint && pnpm check && pnpm test` — 116
  files / 1391 tests is the new baseline. After any schema edit:
  `pnpm dotenv -e .env.dev -- prisma db push --accept-data-loss && pnpm prisma generate`.
- **Dependency changes:** `papaparse@5.6.0` (prod), `@types/papaparse@5.5.2` (dev). Zero runtime
  sub-dependencies.

## Closeout

- Selected plan: `timesheet-capture-162-177-200_PLAN_17-08-26.md`
- Finished: Phase 2 checklist items 16–26, in full.
- Verified: all four CI gates; 41 new specs; 14 mutations RED-then-restored; NULL-distinctness
  proved live.
- Unverified: populated-table `db push`, production `BODY_SIZE_LIMIT`, real Postgres behaviour of
  the transaction and the unique index under concurrency (manual M3–M6).
- **Not committed** — the user commits after reviewing the gates.
- Classification: **Keep in active/testing.** Phases 1 and 2 are green; Phase 3 (#177) is the next
  step in the same plan file.
