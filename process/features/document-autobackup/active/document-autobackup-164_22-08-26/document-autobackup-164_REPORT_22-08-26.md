---
phase: document-autobackup-164-backend
date: 2026-08-22
status: COMPLETE_WITH_GAPS
feature: document-autobackup
plan: process/features/document-autobackup/active/document-autobackup-164_22-08-26/document-autobackup-164_PLAN_22-08-26.md
---

# EXECUTE report — #164 backend slice (Phases 0–7, 9)

Scope: everything except Phase 8 (the settings page and its e2e spec), which was a
separate parallel pass.

## What Was Done

| Commit | Phase | Content |
|---|---|---|
| `b944cce` | 0 | E-01 — `/backups/` in `.gitignore`, `backups` in `.dockerignore`, before any other edit |
| `87aee48` | 1 | `BackupConfig` + `BackupRun` + 2 enums + 2 `Organization` relations; `RequestDocument` comment seven → EIGHT includers |
| `058a9a2` | 2 | `resolveWithin` extracted from `resolveKey`, exported |
| `9181eb4` | 3 | E-03/E-11/E-16/E-17 plan-doc fixes (dangling test IDs, M11, fish commands, positive controls) |
| `03a7de9` | 3 | `plan.ts` pure core, 42 tests written first |
| `1e96fc2` | 4 | `s3.ts` SigV4, pinned to AWS's own vectors |
| `1ed3358` | 5 | `destination.ts` LOCAL + S3 writer |
| `38f5c77` | 6 | `run.ts` orchestration |
| `9673958` | 7 | `scripts/backup-documents.ts` |
| `2058d65` | 7 | Fix found by running it: unsafe destination now refused before the first org |
| `f5b9edc` | 9 | Env examples, compose volumes, `scripts/README.md` |
| `aa5b2e3` | 10 | E-04 mutation pass — 5 tests for a hole it found |
| (last) | — | Four backlog stubs |

## Test Gate Outcomes

- `pnpm test`: **1801 passed / 156 files, 0 failed.** Baseline 1707/152 → +94 tests, +4 files. Nothing regressed.
- `pnpm check`: 0 errors (1 pre-existing a11y warning in `CalculatorWindow.svelte`).
- `pnpm lint`: 0 errors. `pnpm format:check`: clean.
- `scripts/**` typecheck (manual, `tsconfig.scripts.json`): `backup-documents.ts` clean.
- Step-24 grep gate: only two write calls, both `destination.ts`, both via `resolveWithin(dest.root, …)`. No `unlink`, no `rename`.

## Live verification on dev (Phase 7)

Dev had 0 document rows, so a bare run would have copied zero files and proved nothing.
Two real documents plus an evicted tombstone were seeded (rows + bytes), exercised, then
removed.

- Dry run: `would copy 2 file(s), skip 1`; `find backups -type f` = 0.
- Real run: `2 file(s) copied, 0 failed`; both backup files sha256-identical to source; `manifestSha256` in the row equals `sha256sum manifest.json`; `skipped[]` held the evicted row with `reason: bytes-evicted`; modes `drwx------` / `-rw-------`.
- M6 interval gate: second run same night → `not due (next run 2026-08-23T08:31:33Z)`, still 1 directory.
- M7 retention: `--force` ×4 with `retentionCount: 3` → **3 directories, 5 rows**.
- M8 partial: file moved away → `1 file(s) copied, 1 failed`, status `PARTIAL`, `failed[]` with `read-error`, notification `"…(1 of 2 files could not be copied)…"` → `/settings/backup`, counts only.
- M9 refusal: `BACKUP_DIR` inside uploads → exit 1, message before any org, no `bk` dir, 65 files unchanged.
- M11 concurrency: two `--force` runs at once → one `2 file(s) copied`, one `another backup is already running — skipped`, 0 `RUNNING` rows left.
- Tripwire: `uploads/` byte-identical across every run; after cleanup identical to `tripwire-before.txt` (63 files); orphan sweep still exactly 63.

## Plan Deviations

1. **Safety check hoisted** (`2058d65`) — was per-org inside the loop; S2 requires before any org. Found by running it.
2. **T-U-12 uses real `statfs`, not a stub** — a stub proves the comparison but not that `statfs` is called or that `bsize × bavail` is the right way round.
3. **`makeRunId` random suffix, `freeSpaceNeeded` K+1** — E-12 and E-13, contract overrides plan body.
4. **`s3Request` returns `{status, body}`** — E-19; `Promise<void>` cannot carry a LIST body.
5. **`resolveWithin` rejects the root** — E-18. `resolveKey` never passed `''`, so upload/download is unchanged and `storage.test.ts` is untouched.

## E-04 mutation results

| Mutation | Result |
|---|---|
| drop `retentionCount` slice | 5 failed ✅ |
| constant lock key | 1 failed ✅ |
| ignore `enabled` flag | 1 failed ✅ |
| `copyAll` swallows read errors | 1 failed ✅ |
| filter `deletedAt: null` | 1 failed ✅ |
| drop evicted rows | 1 failed ✅ |
| **force `status = 'SUCCESS'`** | **SURVIVED** — hole, fixed in `aa5b2e3`; now 1 failed ✅ |
| manifest written first | 1 failed ✅ (new test) |

The survivor is the point of E-04: every test exercised `copyAll`, and nothing asserted
what the orchestrator does with a non-empty `failed[]`. AC-6's "PARTIAL, never SUCCESS"
had no automated proof at all.

## Test Infra Gaps Found

- `pnpm check` covers neither `scripts/**` nor `prisma/**`. `tsc --noEmit <file>` does not
  work as a substitute — it ignores `tsconfig.json`. Command recorded in `scripts/README.md`.
- One transient full-suite failure early in the session (1 failed) that did not reproduce
  in five subsequent runs and was not captured. Recorded, not dismissed.

## Known gaps (backlog stubs written)

`s3-destination-live-verification`, `prod-upload-volume-verification`,
`document-restore-tooling`, `typecheck-scripts-and-prisma`.

## Forward Preview

- **Test infra found:** no fixture factory for "an org with documents on disk"; each backup test builds its own.
- **Blast radius changes:** `storage.ts` gained one export; `docker-compose.yml` gained two volumes; schema gained two tables.
- **Commands to stay green:** `pnpm test`, `pnpm check`, `pnpm lint`, `pnpm format:check`, plus the scripts tsconfig command.
- **Dependency changes:** none. No new npm package.

---

# Post-EXECUTE fix round — adversarial review findings C-1, C-2, H-1

Both C-1 and C-2 were confirmed against the source before any code was written. Neither
had any test coverage: every existing mock stubbed success, which is why a green 1801-test
suite said nothing about either.

## Failing-before / passing-after

Six tests added. Run against the UNFIXED code first:

```text
× promotes a RUNNING row that HAS a manifest, however young, and never deletes it
× records a FAILED row and notifies when the free-space pre-flight refuses (ST5)
× records a FAILED row when the collector itself throws
× aborts the copy after 5 consecutive write failures instead of trying every file
  Tests  4 failed | 21 passed (25)
```

The two control tests passed from the start, by design — they guard against
over-correcting (a young `RUNNING` row with NO manifest must still be left alone, and
scattered failures must still produce `PARTIAL`, not an abort).

After the fixes: **25/25**. Each fix was then reverted in isolation to prove it is
load-bearing rather than incidentally covered:

| Reverted | Result |
|---|---|
| C-1 — age gate restored on the promotion query | 1 failed |
| C-2 — pre-flight throw allowed to propagate | 2 failed |
| H-1 — abort disabled | 1 failed |

**The fake DB honours its `where` clause.** This is the crux: a stub returning its fixture
regardless of the filter passes against the broken code, because the defect *is* the
filter. That would have been a textbook vacuous green.

## What changed

- **C-1** — fixed at the root, not with a second check in `pruneRuns`. `sweepStaleRuns` now
  reads every `RUNNING` row for the org; manifest present → promote at **any age**;
  manifest absent → keep the 12h gate. Safe because the per-org advisory lock is held
  around the whole run, so a `RUNNING` row seen here cannot belong to a live process. One
  code path owns the decision, and by the time `pruneRuns` runs no manifest-bearing row is
  still `RUNNING`.
- **C-2** — the pre-row section (stale sweep, collector, `listRunIds`, `checkFreeSpace`) is
  wrapped; any failure persists a `FAILED` row with a sanitized reason, notifies, and
  returns a FAILED outcome.
- **H-1** — `copyAll` aborts after 5 consecutive write failures and returns `aborted`;
  `runBackupForOrg` throws **before** the manifest write, so the existing catch records
  FAILED and removes the partial directory.

## Gates

`pnpm test` **1807 passed / 156 files** (was 1801; +6, zero regressions) · `pnpm check` 0
errors · `pnpm lint` 0 errors · `pnpm format:check` clean · `scripts/**` typecheck clean.

## Plan text updated to match the code

§8 ST2 (asymmetric sweep gate), ST5 (pre-row failures are visible; `freeSpaceNeeded`
rather than `× 1.1`), ST7 (rewritten to describe the consecutive-failure abort as built),
and a new `E-08 (as built)` row recording that the original instruction was implemented
with an age gate that reopened the window it was meant to close.

## Disagreement

One, on ST7's original wording rather than on the fix. "First `writeObject` failure that is
not per-file … aborts" cannot be implemented honestly: distinguishing "the destination is
gone" from "this one object was rejected" means classifying provider error codes, and no
two S3-compatible providers agree. The consecutive-failure threshold is the weaker but
truthful signal, so I amended ST7 to describe it rather than leaving the document claiming
a classifier that does not exist. The threshold of 5 is arbitrary; it is safe because a
real outage fails on the first file and never recovers.
