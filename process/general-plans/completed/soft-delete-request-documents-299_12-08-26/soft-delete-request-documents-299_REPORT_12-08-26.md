---
name: report:299-soft-delete-request-documents-execute
description: "EXECUTE report for #299 — all 30 plan steps applied across 7 commits; 4 gates green, both Agent-Probes run, 3 plan deviations recorded"
phase: execute
date: 12-08-26
status: COMPLETE
feature: general-plans
plan: process/general-plans/active/soft-delete-request-documents-299_12-08-26/soft-delete-request-documents-299_PLAN_12-08-26.md
metadata:
  node_type: memory
  type: report
  issue: 299
---

# EXECUTE — #299 Soft-delete request documents with a FIFO byte cap

**Branch**: `feat/soft-delete-request-docs-299` — 7 commits on top of `2d09b7b`. Not pushed, no PR.

---

## What Was Done

All 30 steps, in the plan's order, one commit per section.

| Section | Commit | What landed |
|---|---|---|
| 1 Schema | `927ef0a` | `storageKey String?`, `deletedAt DateTime?`, `@@index([requestId, deletedAt])`, the #299 header paragraph |
| 2+3 Service | `5919576` | tombstone write, `evictTombstonedBytes`, filtered cap `_count`, 409 on verifying a tombstone, `verifiedById` in the DELETE audit entry |
| 4 Readers | `5fc1fb9` | all nine readers decided site by site; three terminal eviction triggers; the D-3 route guard |
| 5 Detail UI | `5027b2b` | the read-only "Removed documents" panel |
| 6 Tests | `6d961be`, `1f0…` (e2e) | 26 new unit cases + the AC-5 e2e |
| 7 Scripts | `aebb479` | null-filtered key collection in both scripts |

**The reader split, as built** — five INCLUDE, four EXCLUDE, one blind, exactly per the plan's table.
Every INCLUDE site carries its comment; the comments were treated as the deliverable, not decoration.

---

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| Format | `pnpm format:check` | **green** |
| Lint | `pnpm lint` | **0 errors, 1 warning** — the pre-existing `CalculatorWindow.svelte` a11y warning, untouched by this work |
| Typecheck | `pnpm check` | **0 errors** (907 files) |
| Unit | `pnpm test` | **1302 passed / 107 files** (1276 before; +26) |
| E2E | `pnpm test:e2e tests/e2e/request-documents.spec.ts` | **1 passed** (15.2s) |
| Schema (Hybrid) | `pnpm db:push` + `psql \d` | **green** — see P-2 below |

### Mutation checks — the gates were proved, not assumed

Every gate whose whole job is to catch a specific silent regression was verified by
**making that regression and watching the gate turn red**, then restoring from a scratchpad copy
(never `git checkout`).

| Mutation | Gate that fired |
|---|---|
| `where: { deletedAt: null }` on `decide()`'s documents include | AC-2, AC-1 and AC-4 all red (3 failures) |
| `where: { deletedAt: null }` on `listPendingRequestsForApprover`'s include | the queue mirror + AC-8 red (2 failures) |
| `evictTombstonedBytes(req.id, 3)` instead of `0` | both AC-10 decide cases red |
| null-the-key before unlinking, in the helper | `invocationCallOrder` + the `continue`-on-failure case red |
| a 4th terminal writer dropped in `src/routes/(app)/__tripwire_probe/+page.server.ts` | the static tripwire red, naming the new file |

### P-2 — the `DROP NOT NULL` proof (Hybrid)

Seeded to 3 rows / 3 non-null keys **before** the push (the live DB held only 1, which is barely
stronger than an empty table).

```
BEFORE  rows | keys        AFTER   rows | keys
           3 |    3                   3 |    3
```

Every `storageKey` value identical across the push. `db push` took no prompt and reported no data
loss. After: `storageKey | text |` (no `not null`), `deletedAt | timestamp(3)`, and both
`request_documents_requestId_idx` and `request_documents_requestId_deletedAt_idx` present.

---

## Agent-Probe Results (§5) — the two gates nothing automated covers

`pnpm check` reads `src/` and `tests/` only. Both of these were proved by **running them**.

### Fixture (built through the real HTTP form actions, not psql inserts)

Request `cmspv3o5u…`, 5 uploads then 4 deletions one at a time:

```
 fileName | tombstoned | evicted
----------+------------+---------
 doc1.pdf | t          | t
 doc2.pdf | t          | f
 doc3.pdf | t          | f
 doc4.pdf | t          | f
 doc5.pdf | f          | f
```

Disk: 4 files (doc1's unlinked). **This is itself the live proof of the FIFO cap** — deletions 1-3
evicted nothing, deletion 4 evicted the oldest tombstone by `deletedAt`, and no row was ever removed.

### AC-7 — `sweep-orphan-uploads.ts` — **PASS**

Dry run, `--grace-minutes=0`:

```
Files on disk: 12 | document rows: 4
Orphans: 8 (0 within 0m grace — skipped)
  orphan: requests/cmspl35uf001d6ni0qtfeah9j/e41459a5-….png
  orphan: requests/cmspqsdz300pn6ni0sknkuxnq/5e25b6f7-….png
  orphan: requests/cmspqu2sp00q66ni0q9t4b49z/793f3b1b-….png
  orphan: requests/cmspt9sq500011j85djxwnoho/6fa76b5a-….pdf
  orphan: requests/cmspt9sq500011j85djxwnoho/seed-a-11111111.pdf
  orphan: requests/cmspt9sq500011j85djxwnoho/seed-b-22222222.pdf
  orphan: requests/cmspv1cbu0003dqy2lrqf3e8h/61bfc7c1-….pdf
  orphan: requests/cmspv1cbu0003dqy2lrqf3e8h/d18026be-….pdf

Dry run — re-run with --delete to remove the 8 file(s) above.
```

- No throw. **None of the 3 surviving tombstoned files is listed.**
- `document rows: 4` counts them — 3 tombstoned-with-bytes + 1 live = the 4 non-null keys. Correct.
- The 8 listed orphans are genuine: their rows were removed by the e2e global-setup reset and by the
  earlier repro cleanup. Flagging them is the script doing its job.

Then `--delete --grace-minutes=0` → `Deleted 8 orphan file(s).` **The 3 tombstoned files were still
on disk afterwards**, and all 5 rows were untouched. That is the assertion that matters: a real
delete-mode run does not reclaim a tombstone's surviving bytes.

### AC-9 — `prod-delete.ts` — **PASS**

Run against a purpose-built throwaway employee (`TW-299` / `throwaway299@veent.ph`), never a seeded
account, with its own 5-document / 4-tombstone fixture.

Dry run:

```
  requests           1
  request_documents  5
  4 uploaded file(s) will be removed from disk after commit.
```

The count **includes the tombstones** (5 rows), and the key list correctly drops the one evicted row
(4 files). Execute:

```
✓ Deleted TW-299 (Away, Throw).
  Removed 4/4 uploaded file(s).
```

- **No `resolveKey` TypeError.** `4/4` — every surviving tombstoned file went.
- `uploads/requests/{id}/` went 4 files → 0. `request_documents` for that request → 0 rows.

The named FAIL signature was separately confirmed to be real rather than hypothetical:
`path.resolve('/tmp/uploads', null)` throws `TypeError: The "paths[1]" argument must be of type
string`. Without step 29's filter that is what the droplet would hit, mid-purge, with nothing in the
pipeline to catch it.

---

## Plan Deviations

Three. None is a design change; all three are places the plan contradicted itself or was
arithmetically wrong, and all three are recorded rather than silently fixed.

### DEVIATION-1 — the history panel offers no download control (step 19 vs AC-5 / step 27)

Step 19 asked for a download **link** in the "Removed documents" panel when `storageKey != null`.
AC-5 and step 27 both require **no download control** there. The plan cannot have both.

**Resolved for AC-5**, because AC-5 is the locked SPEC-derived criterion and step 19 is an
elaboration of it. The panel renders no link; it reads `File removed` once the bytes are evicted and
nothing in that slot while they survive.

**D-3 is untouched, and this is the important part**: the *route* still serves a tombstone while its
bytes survive, and the e2e asserts exactly that (`GET …/documents/{deletedId}` → **200**). The 404 is
keyed on the bytes being gone, never on `deletedAt`. The UI choice and the route rule are separate
facts and the plan's own §6 item 8 says the 200 assertion is the one that must break loudly.

### DEVIATION-2 — §5's fixture arithmetic was off by one

§5 said "upload 4 documents, deleting 3 of them" produces "the FIFO cap fired once". It does not:
`keepNewest = 3` keeps the newest three tombstones, so three deletions evict **nothing** and the
probe would run against a fixture with no evicted row — the one state it exists to cover. Corrected
in the plan to 5 uploads / 4 deletions, and verified live.

### DEVIATION-3 — E3 editorial fixes (N-1..N-5)

Applied inline, no supplement cycle:

- **N-1** — `cancelRequest` added as the third row of P-3's caller table. (The "both call sites"
  half of N-1 was already correct in the plan; it reads "all three".)
- **N-2** — the stale cross-references. Most were already corrected in the file; the one live
  remnant (step 8's "see §7 for the expected pre-existing breakage") now points at
  §Resume and Execution Handoff.
- **N-3** — step 22 option (a) now says LOCAL copy explicitly, citing Test Infra note 1.
- **N-4** — §Phase Completion Rules already read `AC-1..AC-10`; confirmed, not changed.
- **N-5** — taken, not deferred: the tripwire scans **all of `src/`**, and this was proved by
  dropping a probe writer under `src/routes/` and watching it fail.

---

## What Was Skipped or Deferred

- **Step 30** — `prod-delete.ts`'s duplicated `deleteStoredFile`/`resolveKey` left exactly as they
  are, per I-6 and the file's own comment at `:50-54`. Backlogged, not done.
- The four **Test Infra Improvement Notes** remain backlog, as the plan requires.

## Test Infra Gaps Found

Nothing new beyond the plan's four notes. Two operational facts worth writing down:

- `pnpm test:e2e` does **not** load `.env.dev` — Playwright's own process needs `DATABASE_URL`
  exported. Neither `prod-delete.ts` nor `sweep-orphan-uploads.ts` does either.
- The e2e `global-setup` resets the seeded employee's transactional data, which will delete any
  hand-seeded `request_documents` attached to `employee@veent.ph`. It ate the Section-1 P-2 seed rows
  between the schema commit and the probes. Harmless there, but it will surprise someone.

---

## Closeout Packet

- **Selected plan**: `process/general-plans/active/soft-delete-request-documents-299_12-08-26/soft-delete-request-documents-299_PLAN_12-08-26.md`
- **Finished**: all 30 steps; 7 commits; every AC-1..AC-10 row has a recorded outcome.
- **Verified**: 4 automated gates green, the E2E green, both Agent-Probes executed with output
  recorded verbatim above, the Hybrid P-2 proof done on ≥3 rows, and five mutation checks confirming
  the new gates are not vacuous.
- **Still unverified**: nothing in this plan's scope. Not pushed; no PR; no human review yet.
- **Remaining cleanup**: the PR description must carry the plan's asymmetric-rollback warning —
  `String? → String` cannot be pushed back once any row has been evicted, so a post-ship rollback is
  a data decision, not a git operation.
- **Best next state**: `Keep in active/testing` — the code is complete and proven, but the branch has
  not been pushed, reviewed or merged, and that is the user's call.

## Forward Preview

- **Test infra found**: as above — `DATABASE_URL` is not injected for e2e or scripts; e2e global-setup
  wipes the seeded employee's requests.
- **Blast radius changes**: none beyond the plan's 12 touchpoints. One extra file the plan implied but
  did not number: `tests/unit/request-terminal-writers.test.ts` (step 26a's tripwire) and
  `tests/unit/requests-cancel.test.ts` (step 21a's cancel describe) are both new files.
- **Commands to stay green**:
  `pnpm format:check && pnpm lint && pnpm check && pnpm test`, plus
  `DATABASE_URL=… E2E_PORT=<port> pnpm test:e2e tests/e2e/request-documents.spec.ts`.
- **Dependency changes**: none.
