---
name: plan:299-soft-delete-request-documents
description: "Soft-delete RequestDocument rows (deletedAt tombstone), FIFO-cap the FILES at 3 per request plus a terminal-status full byte eviction, split the nine readers deliberately, and prove the #283/F3 bar survives delete-and-reupload"
keywords: request documents, soft delete, tombstone, deletedAt, FIFO byte eviction, storageKey nullable, verifiedById, F3 bar, separation of duties, document history, orphan sweep, prod-delete
date: 12-08-26
issue: 299
complexity: COMPLEX
spec: process/general-plans/active/soft-delete-request-documents-299_12-08-26/soft-delete-request-documents-299_SPEC_12-08-26.md
---

# PLAN — #299 Soft-delete request documents with a FIFO byte cap

**Date**: 12-08-26
**Status**: VALIDATED — contract PASS (pass 2, 12-08-26); ready for EXECUTE
**Complexity**: COMPLEX — one plan artifact, 7 ordered sections, NO phase split
**Issue**: #299
**Branch**: `feat/soft-delete-request-docs-299` (off staging @ 17e063c, zero code changes yet)

---

## TL;DR

Seven ordered sections on one branch, one PR. Add `deletedAt DateTime?` to `RequestDocument` and
widen `storageKey` to `String?`; rewrite `deleteRequestDocument` to tombstone instead of delete;
add **one** eviction helper with a `keepNewest` parameter serving both the 4th-swap FIFO path
(`keepNewest = 3`) and the terminal-status path (`keepNewest = 0`); then walk **nine** readers
one at a time and give each the answer it needs — five INCLUDE tombstones, four EXCLUDE them.
The `pnpm check` typechecker forces most of the nullable-`storageKey` work; the two script sites
it does NOT cover must be proved by running them.

**The single most likely way this build goes wrong**: someone adds `where: { deletedAt: null }`
to `decide()`'s documents include (`approvals.ts:214`) because "the download list needed it," and
every one of the 1273 existing tests stays green while the bypass this issue exists to close
silently reopens. Section 6's AC-2 test is written specifically to be the thing that turns red.
---

## Overview

**Context.** #283 built the F3 bar — whoever signs off a supporting document on a request may not
also decide that request — and it reads `RequestDocument.verifiedById`. That column can currently
be made to vanish: an approver clears their own sign-off (which nulls `verifiedAt` only, so the
409 delete-lock stops firing), the requester hard-deletes the now-unverified row, re-uploads a
replacement, and the signature is gone. The bar never fires. This issue closes that by never
deleting the row.

**Goal.** Deleting a request document marks it as a tombstone (`deletedAt`) and keeps every fact
about it forever, including who signed it. Only the bytes are allowed to disappear — capped at 3
tombstoned files per request FIFO, plus a full byte eviction once the request reaches a terminal
status.

**Scope.** One branch, one PR, seven ordered sections: schema → `documents.ts` service →
the eviction helper → the nine readers + terminal trigger → detail-page UI → tests → scripts.

**Context loaded for this plan.** `process/context/all-context.md` was consulted via
`vc-context-discovery` at session start; this repo's `process/context/` tree carries no test-group
router today, so the test strategy in §Verification Evidence and §5 is derived from the repo's
actual test surface (`tests/unit/**`, `tests/e2e/**`, `package.json` scripts) rather than from a
context doc. Post-phase testing is defined per section in §4 (every step carries a **Verify**
line) and in aggregate by §Phase Completion Rules below.

---

## 0. Session Setup

```bash
git switch feat/soft-delete-request-docs-299   # already exists, clean, off staging @17e063c
./start.sh                                     # veent-db-5434 on host networking, port 5434
```

Env is `.env.dev`; there is no `.env`. Package manager is `pnpm`, never `npm`.

**Gates used throughout:**

| Gate | Command | Covers |
|---|---|---|
| Typecheck | `pnpm check` | `src/**` only — NOT `prisma/**`, NOT `scripts/**` |
| Unit | `pnpm test` | `tests/unit/**` (1273 tests today) |
| Lint | `pnpm lint` | orphaned bindings; not types |
| Schema push | `pnpm db:push` | `prisma db push`, no migration files |
| E2E | `pnpm test:e2e` | `tests/e2e/**` |

---

## 1. Approved Decisions Carried In (do NOT re-open)

From the locked SPEC (D-1..D-6) and the completed INNOVATE session. EXECUTE must not relitigate
any of these.

| Id | Decision | Source |
|---|---|---|
| D-1 | A tombstone cannot be verified or un-verified; `setRequestDocumentVerified` refuses at the call site, not in the shared reader | SPEC |
| D-2 | Deleting an already-tombstoned document is refused **404** | SPEC |
| D-3 | The download route serves a tombstone **while its bytes survive** and 404s once evicted; enforced at the ROUTE, not only in Svelte | SPEC |
| D-4 | Byte eviction **nulls `storageKey`** — one column carries the whole truth. `storageKey` becomes `String?` | SPEC (user's explicit choice) |
| D-5 | Tombstones do NOT count toward `MAX_REQUEST_DOCS` (stays 5, counts **live** docs) | SPEC |
| D-6 | Bytes are evicted on the 4th swap **and** when the request reaches a terminal status — **APPROVED, REJECTED or CANCELLED**. At terminal, **ALL** tombstoned bytes go (the cap of 3 stops applying — the request is closed); **live documents keep their files** so an auditor can open what was actually approved. Rows and signers untouched, always. | SPEC + user's explicit scope choices this session |
| D-6a | **CANCELLED is a terminal trigger too** (user-approved scope extension at VALIDATE). Verified genuinely terminal: `resubmitRequest` requires RETURNED and `decide()` requires PENDING, so there is no path back out of CANCELLED. Wired at `requests/index.ts:193` — one import plus one line; `requests/index.ts → ./documents` is acyclic (`documents.ts` imports neither `approvals.ts` nor `index.ts`). | user, at VALIDATE |
| I-1 | Single `deletedAt DateTime?` — one column carries both tombstone state and the FIFO ordering key. A boolean + `uploadedAt` was rejected: creation order and deletion order diverge once swaps happen out of upload order, which is a real FIFO bug | INNOVATE |
| I-2 | Reader split by **named service functions + loud comments**, never a Prisma extension or global middleware. 5 of 9 readers must INCLUDE tombstones, so a "safe default" global filter inverts the safety property at exactly the highest-stakes sites | INNOVATE |
| I-3 | Exactly **ONE** eviction helper, never inlined at two sites — the D-4 unlink-before-null ordering must be enforced in one place | INNOVATE |
| I-4 | `getRequestDocument` stays **tombstone-blind**; each of its three callers branches on `deletedAt` itself. A boolean param would relocate the branch without removing it | INNOVATE |
| I-5 | Chip/SoD split happens on the **SERVER**, once. The Svelte template never learns tombstones exist; no `.filter()` is pushed into the template | user's call, this session |
| I-6 | `prod-delete.ts`'s private duplicate of `deleteStoredFile`/`resolveKey` is **NOT** consolidated — the comment at `prod-delete.ts:50-54` documents it as deliberate (the droplet image ships no `src/`). Out of scope; backlogged | INNOVATE |

---

## 2. Research Corrections — facts that differ from the brief

Six things verified in this session that change what gets built or tested. **These are the
sections VALIDATE should attack first.**

### C-1 — SPEC's AC-1/AC-4 name the wrong describe block (test-design, load-bearing)

`tests/unit/approval-self-guard.test.ts` contains **two different harnesses**:

- `describe('canActOnStage — the document-verifier bar (#283/F3)')` at **:198** is a
  **pure-predicate** suite. Its own comment at **:230-237** states AC-28 is deliberately NOT
  tested there: *"This predicate takes verifiedDocActorIds, not documents — it never sees
  verifiedAt — so a case written at this level cannot distinguish a standing sign-off from a
  cleared one, and would be byte-identical to AC-19 above."* The same argument applies verbatim
  to a tombstone. **A new AC-1/AC-4 case placed in this describe proves nothing.**
- `describe('decide — nobody decides their own request (#75)')` at **:57** IS a db-mocked
  service suite (`dbMock` at :20-25, `decide` imported at :37, `documents: []` fixture key at
  :71, and a real F3 case at :110-142 using `documents: [{ verifiedById: signerId }]`).

**Correction:** AC-1, AC-2 and AC-4 all go in a NEW describe in `approval-self-guard.test.ts`
built on the **:57 db-mock harness**, not the :198 predicate harness. Section 6 specifies this.

### C-2 — SPEC's AC-2 names `tests/unit/approvals.test.ts › decide`; no such suite exists

`approvals.test.ts` has **no** `vi.mock('$lib/server/db')` — it imports `canActOnStage`,
`nextState` etc. directly and is a pure-function suite. It has no `decide` describe. AC-2's host
is `approval-self-guard.test.ts` (per C-1).

### C-3 — the flat mock makes AC-2 vacuous unless a new helper is written (test-infra)

AC-2's contract is: *adding `where: { deletedAt: null }` to `decide()`'s documents include must
turn this test red.* Neither existing harness can do that:

- `approval-self-guard.test.ts` uses a flat `dbMock.request.findFirst.mockResolvedValue(...)` —
  it hands back the whole fixture whatever the query asked for. A `where` mutation is invisible.
- `approval-queues.test.ts`'s `project`/`projectDocs` helper (**:50-75**) honours the include's
  **`select` keys** only. It also cannot see a `where`.

**A new mock helper that applies the include's `where` to the fixture array is required.** This
is the one genuine test-infra addition in this plan; see §Test Infra Improvement Notes.

### C-4 — AC-5's e2e needs NO seed change

The brief asked which seed change AC-5 needs. **None.** The established repo pattern for
request-scoped e2e is in-spec fixture creation:
`tests/e2e/approval-chain.spec.ts:26-36` files requests via
`page.request.post('/api/v1/requests')`, collects ids in `createdIds`, and cleans up in
`test.afterAll` with a raw `PrismaClient`. `prisma/seed-e2e.ts` seeds zero requests and zero
`RequestDocument` rows, and it should stay that way. AC-5's spec copies the approval-chain
pattern. This removes the SPEC's "seeds create zero RequestDocument rows" concern for AC-5.

### C-5 — a NINTH reader the SPEC's list missed

`src/routes/(app)/requests/[id]/+page.server.ts:**89**`:

```ts
: req.documents.some((d) => d.verifiedById === user.id) && !canAny(user.roles, 'ADMINISTER_SYSTEM')
```

This is the #283/D12 `actBlockedReason` — the page that answers "why can't I act on this?".
It is an F3-shaped reader and **must INCLUDE tombstones**, or the approvals queue bars the actor
(correctly) while the detail page tells them nothing is wrong. Section 4 wires it.

### C-6 — both SPEC "not verified by RESEARCH" flags are now RESOLVED

| SPEC flag | Verdict | Evidence |
|---|---|---|
| Does Prisma 5 support a filtered `_count`? | **YES, VIABLE** | `node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client/index.d.ts:8067-8069` defines `RequestCountOutputTypeCountDocumentsArgs = { where?: RequestDocumentWhereInput }`. No separate `count()` fallback needed. |
| Does `deleteStoredFile` tolerate an already-evicted file? | **YES** | `src/lib/server/storage.ts:89-96` swallows `ENOENT` and rethrows everything else. Double-eviction will not throw — AC-3/AC-4 are safe. |

---

## 3. Plan-Level Decisions

Six decisions this plan makes that the SPEC and INNOVATE left open.

### P-1 — Add `@@index([requestId, deletedAt])`

INNOVATE framed this as a readability call because "N ≤ 5 docs per request." **That bound is
false for tombstones.** Live documents are capped at 5; tombstone rows are kept **forever** and
are unbounded by design. A request that has been corrected forty times over two years carries
forty rows, and every eviction pass sorts them by `deletedAt`.

The index is additive, free under `db push`, and — the actual reason — it is the greppable
declaration that `deletedAt` is a query dimension, so the next person adding a reader sees the
split exists before they write a uniform filter. Keep `@@index([requestId])` as-is; Postgres
uses the composite for `requestId`-only lookups via its leading column, but removing the plain
index is a change this issue does not need. **Add, do not replace.**

### P-2 — `storageKey String → String?` is safe under `prisma db push`; NO migrate script

The widening is `ALTER TABLE request_documents ALTER COLUMN "storageKey" DROP NOT NULL`. This is
non-destructive: every existing row keeps its value, and no row can fail the new (weaker)
constraint. `db push` performs it without prompting and without data loss.

This is the **opposite** direction from the `CLAUDE.md` enum-rename precedent, which needed
`scripts/migrate-employment-type-regular.ts` because renaming an enum value makes `db push`
DROP and RECREATE the type. Nothing is dropped here. **No `scripts/migrate-*.ts` is needed.**

Narrowing later (`String? → String`) WOULD need a data migration — noted so a future reverter
does not assume symmetry.

**EXECUTE must still prove it**, not assume it (§4 Section 1, steps 1-4).

### P-3 — the eviction helper's exact shape and ordering

One helper in `src/lib/server/services/requests/documents.ts`, one `keepNewest` parameter, two
thin callers. Ordering inside the loop is **not negotiable**:

```
evictTombstonedBytes(requestId, keepNewest)
  1. find rows where requestId = ?, deletedAt != null, storageKey != null
     ORDER BY deletedAt ASC          <- FIFO key is deletedAt, never uploadedAt (I-1)
  2. drop the newest `keepNewest` from the tail -> the eviction set
  3. for each row in the eviction set, IN THIS ORDER:
       a. await deleteStoredFile(row.storageKey)     <- UNLINK FIRST
          on failure: log, `continue`, DO NOT null   <- see below
       b. await update({ data: { storageKey: null } }) <- NULL SECOND
```

**Why unlink before null (SPEC, restated because it is the whole point):** null first and the
pointer is gone while the file remains — a permanent orphan `sweep-orphan-uploads.ts` can never
reclaim, because the sweep works by matching keys against disk. A file with no row is swept; a
file with a nulled row is invisible to both.

**Why `continue` on unlink failure (this plan's addition, one line):** if the unlink genuinely
fails (not ENOENT — `storage.ts:89-96` already swallows that), nulling anyway creates the exact
leak above. Leaving the key means the pointer survives, the sweep correctly ignores the file,
and the next eviction cycle retries. Costs one `continue`.

**Callers:**

| Caller | `keepNewest` | Where |
|---|---|---|
| `deleteRequestDocument`, after the tombstone write | `3` | `documents.ts` |
| `decide()`, after the `$transaction` commits, when status is APPROVED or REJECTED | `0` | `approvals.ts` |
| `cancelRequest`, after the bare `db.request.update` commits (no transaction exists there — see P-4) | `0` | `requests/index.ts` |

### P-4 — terminal eviction: the universal rule, and the two sites it lands on

**The rule (applies at EVERY terminal trigger site, all three statuses):**

> Call `evictTombstonedBytes(id, 0)` **after the status write has committed**, best-effort
> (`.catch(console.error)`), and **never inside a transaction.**

Best-effort because bytes are a cleanup concern and the user's action already succeeded — the same
shape the repo already uses at `documents.ts:216-218` and `requests/index.ts:234-236`. Never inside
a transaction because a filesystem unlink is not rollback-able: if the surrounding transaction
later aborts, the bytes are gone anyway and the DB says the request never closed.

**"After the status write commits" means different code in the two files. Do not pattern-match
one onto the other:**

| Site | What "committed" means there | Placement |
|---|---|---|
| `decide()` (`approvals.ts`) | the `await db.$transaction(...)` at `:254-272` returns | after that `await`, before the audit write |
| `cancelRequest()` (`requests/index.ts:193`) | the bare `await db.request.update(...)` returns — **there is no transaction here, and none should be added** | directly after that line, before the audit write |

**The #101 atomicity argument is `decide()`-specific.** That transaction exists because the step
flip, the request flip and the leave-balance deduction must commit together; putting an unlink
inside it would let a disk error roll back an approval that already moved a balance.
`cancelRequest` has no such coupling and no transaction. **Do not invent one** — a transaction
around a single update is speculative structure this issue does not need (CLAUDE.md §2).

```
// approvals.ts — after the $transaction
if (transition.status === 'APPROVED' || transition.status === 'REJECTED') {
  await evictTombstonedBytes(req.id, 0).catch((e) => console.error(...))
}

// requests/index.ts — after the bare update at :193
await evictTombstonedBytes(id, 0).catch((e) => console.error(...))
```

**Reachability (verified at VALIDATE):** in `decide()` there are no early returns and no skipping
branches between the `$transaction` and the `return`; if the transaction throws, nothing committed,
so skipping the eviction is correct.

### P-5 — the chip/SoD split: ONE new field on the returned row

`listPendingRequestsForApprover` (`approvals.ts:335-343`) returns a query result object whose
`documents` array serves **two consumers with opposite needs**:

- `verifiedDocActorIds` at `:356` — must INCLUDE tombstones (this is the bar)
- `req.documents.length` at `requests/approvals/+page.svelte:328` and `unverifiedCount(req.documents)`
  at `:325` (helper at `:163`) — must EXCLUDE tombstones

Per I-5 the server splits it once. Add `deletedAt` to the include's select, keep `documents`
unfiltered as the SoD input, and `.map()` one new field onto each returned row:

```
liveDocuments: r.documents.filter((d) => d.deletedAt === null)
```

The template then reads `req.liveDocuments` for **both** `.length` and `unverifiedCount(...)`
and never sees `documents` at all. One new field, no template filtering, and the two inputs
are physically different arrays so a future edit cannot collapse them by accident.

### P-6 — `setRequestDocumentVerified` on a tombstone returns **409**, not 404

D-2 fixes 404 for the delete path. D-1 does not name a code. Use **409 `'Removed documents
cannot be verified'`**, matching the existing 409 at `documents.ts:211`.

Rationale: a 404 is a lie here. Under D-3 the reviewer is looking at that tombstone **right
now** in the history panel, with its filename and signer. Telling them "not found" for a row
they can see produces a bug report. 409 "you can see it, you may not do this to it" is honest
and is the code this exact file already uses for the same class of refusal.

The delete path keeps 404 (D-2) because there the row genuinely is gone from the requester's
active set, and 404 also closes the FIFO-gaming path — a repeated delete of one id cannot force
extra eviction cycles.

---

## Touchpoints

Twelve files. Read column marks files read-only for context.

| # | Path | Change |
|---|---|---|
| 1 | `prisma/schema.prisma` (RequestDocument, :863-881) | `+ deletedAt DateTime?`, `storageKey String → String?`, `+ @@index([requestId, deletedAt])` |
| 2 | `src/lib/server/services/requests/documents.ts` | cap count (:92), verify refusal (:163), delete → tombstone (:195-226), NEW `evictTombstonedBytes` |
| 3 | `src/lib/server/services/approvals.ts` | `decide()` include comment (:214), terminal eviction call (after :272), `listPendingRequestsForApprover` (:343 + :356) |
| 4 | `src/lib/server/services/requests/index.ts` | `getRequest` returns `documents` + `documentHistory` (:143), **`cancelRequest` terminal eviction (:193, D-6a)**, `deleteRequest` null-guard (:234) |
| 5 | `src/routes/(app)/requests/[id]/+page.server.ts` | `actBlockedReason` reads `documentHistory` (:89) |
| 6 | `src/routes/(app)/requests/[id]/+page.svelte` | live list unchanged (:213-276); NEW history section |
| 7 | `src/routes/(app)/requests/approvals/+page.svelte` | `:325`, `:328` → `req.liveDocuments` |
| 8 | `src/routes/api/v1/requests/[id]/documents/[docId]/+server.ts` | null-`storageKey` 404 before `readStoredFile` (:22) |
| 9 | `scripts/sweep-orphan-uploads.ts` | `:29`, `:32` null-filter with type predicate |
| 10 | `scripts/prod-delete.ts` | `:176-181` null-filter with type predicate |
| 11 | `tests/unit/*` | AC-1..AC-4, AC-6, AC-8 + new `where`-honouring mock helper |
| 12 | `tests/e2e/request-documents.spec.ts` | NEW file, AC-5 |
| R | `src/lib/server/storage.ts` | read-only — `deleteStoredFile` already ENOENT-safe (C-6) |

---

## Public Contracts

| Contract | Before | After | Breaks? |
|---|---|---|---|
| `RequestDocument.storageKey` | `String` (NOT NULL) | `String?` | Yes — every `src/` reader goes red under `pnpm check`. Intentional; that redness IS the reader audit. `scripts/**` does NOT go red — §4 Section 7 (steps 28-30). |
| `RequestDocument.deletedAt` | — | `DateTime?` | Additive |
| `deleteRequestDocument` return | `{ deleted: true }` | unchanged | No |
| `getRequest()` return | `{ ..., documents }` (all) | `{ ..., documents }` (**live only**), `+ documentHistory` (all) | Yes — silent semantic narrowing of `documents`. C-5's site is the one consumer that must move to `documentHistory`. |
| `listPendingRequestsForApprover` rows | `{ ..., documents }` | `+ liveDocuments` (`documents` unchanged, still unfiltered) | Additive |
| `evictTombstonedBytes(requestId, keepNewest)` | — | new, module-internal to `documents.ts` but exported for tests | Additive |
| `cancelRequest` side effects | status write + audit | `+` best-effort byte eviction after the commit (D-6a) | Behavioural, additive |
| Download route `GET` | 200 or 403/404 | `+ 404` when `storageKey === null` | Yes, deliberately (D-3) |
| `MAX_REQUEST_DOCS` | `5`, counts all rows | `5`, counts **live** rows | Behavioural (D-5) |

---

## Blast Radius

- **Files changed**: 12 (10 source/schema/script + 2 test surfaces, one of which is a new file)
- **Packages**: 1 (single SvelteKit app; no workspace fan-out)
- **Risk class**: **HIGH** — this is simultaneously a **schema/data migration**, a
  **permission / separation-of-duties boundary**, and a **destructive file operation**. All three
  of `vc-test-coverage-plan`'s high-risk classes are present, so no gate in the Verification
  Evidence table may be Known-Gap for a developed behavior.
- **Irreversible surface**: byte eviction. Once a file is unlinked it is gone. The rows are not
  irreversible — the whole design keeps them.
- **Untypechecked surface**: `scripts/sweep-orphan-uploads.ts` and `scripts/prod-delete.ts`.
  `pnpm check` covers neither. #282 shipped a broken site on exactly this assumption.

### The nine readers, site by site

**This table is the plan.** Every other section serves it.

| # | Reader | file:line | Tombstones | Why |
|---|---|---|---|---|
| 1 | `decide()` F3 bar | `approvals.ts:214` | **INCLUDE** | This is the hole. Verified: adding a filter here leaves all 1273 tests green today. |
| 2 | `listPendingRequestsForApprover` → `verifiedDocActorIds` | `approvals.ts:343` → `:356` | **INCLUDE** | Queue mirror of the bar (#283/AC-21). |
| 3 | approvals chip + unverified badge | `approvals/+page.svelte:325,328` via new `liveDocuments` | **EXCLUDE** | AC-8. Shows what the approver can actually open. Same source array as #2 — P-5 splits it server-side. |
| 4 | `getRequest` download list (`documents`) | `requests/index.ts:143` | **EXCLUDE** | AC-5. Nothing to download. |
| 5 | `getRequest` history (`documentHistory`) | `requests/index.ts:143` (derived) | **INCLUDE** | AC-5. The audit view. **This is the one derived-array site — loud comment required (I-2).** |
| 6 | `actBlockedReason` | `[id]/+page.server.ts:89` | **INCLUDE** | C-5. F3-shaped; must agree with reader #1 or the page contradicts the queue. |
| 7 | `deleteRequest` storage sweep | `requests/index.ts:215,234` | **INCLUDE** | Otherwise tombstoned files orphan on request deletion. Also needs a null-key skip. |
| 8 | `sweep-orphan-uploads.ts` known-set | `scripts/sweep-orphan-uploads.ts:29,32` | **INCLUDE** | AC-7. A tombstoned-but-unevicted file must not be flagged an orphan. Null-filter required. |
| 9 | `prod-delete.ts` purge sweep | `scripts/prod-delete.ts:176-181` | **INCLUDE** | AC-9. Every byte of a purged employee must go. Null-filter required — `removeFiles()` at `:356` is typed `string[]` and its private `deleteStoredFile` (`:59-68`) throws on a null key, with no typecheck to catch it. |
| + | `saveRequestDocuments` cap count | `documents.ts:92` | **EXCLUDE** | AC-6/D-5. Filtered `_count`, viable per C-6. |
| + | `getRequestDocument` choke point | `documents.ts:146-153` | **BLIND** | I-4. All three callers branch themselves. |

Five INCLUDE, four EXCLUDE, one blind. **A uniform `where: { deletedAt: null }` reopens the
bypass with every test green.**

---

## 4. Implementation Checklist

Dependency order — **revised** from INNOVATE's suggestion. INNOVATE proposed
schema → service → readers+terminal → UI → scripts → tests. Two changes:

1. **Scripts move to the very end, not the middle.** They depend only on the schema, but they
   are the only sites `pnpm check` cannot police, so they need a **clean, fully-migrated
   database with seeded tombstones** to be run against. That fixture does not exist until the
   service layer works.
2. **Tests interleave, they do not trail.** AC-2's proving test needs the new `where`-honouring
   mock helper (C-3), which is the riskiest single artifact in the plan. Writing it last means
   discovering it does not work after everything else is committed.

Final order: **schema → service → eviction → readers → UI → tests → scripts**.

### Section 1 — Schema (AC-3, AC-6; enables everything)

1. `prisma/schema.prisma`, model `RequestDocument`: change `storageKey String` →
   `storageKey String?` and update its trailing comment to
   `// path relative to UPLOAD_DIR; null once the bytes are evicted (#299/D-4)`.
2. Same model: add `deletedAt DateTime?` after `verifiedAt`, with a comment stating it is BOTH
   the tombstone flag AND the FIFO ordering key, and that rows are never deleted (#299).
3. Same model: add `@@index([requestId, deletedAt])` beside the existing `@@index([requestId])`
   (P-1). Do not remove the existing index.
4. Extend the model's header comment block with a #299 paragraph naming the reader split and
   pointing at this plan — the block already carries the #283/D11 warning; this is the same
   pattern.
   - **Verify:** `pnpm db:push` succeeds. Then, with the container up:
     `docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c '\d request_documents'`
     must show `storageKey | text |` (no `not null`) and `deletedAt | timestamp(3) without time zone |`,
     and the index list must contain both `request_documents_requestId_idx` and
     `request_documents_requestId_deletedAt_idx`.
   - **Verify (P-2 proof, do NOT skip):** the live dev DB currently holds **exactly 1**
     `request_documents` row with 1 non-null key — a one-row before/after is barely stronger than
     the empty-table case this step exists to reject. **Seed at least 3 rows first**, at least one
     of which is destined to become a tombstone: file a request as `employee@veent.ph` and upload
     3 documents through `/requests/{id}` (or insert them directly with `psql`).
     Then `SELECT count(*), count("storageKey") FROM request_documents;` **before** the push,
     `pnpm db:push`, and re-run the same query plus
     `SELECT id, "storageKey" FROM request_documents ORDER BY "uploadedAt";` **after**.
     Both counts and every key must be identical across the push. That is the evidence the
     NOT NULL drop was non-destructive.

### Section 2 — `documents.ts` service layer (AC-1, AC-3, AC-6; D-1, D-2, D-4)

5. `saveRequestDocuments` `:92`: change the select to
   `_count: { select: { documents: { where: { deletedAt: null } } } }`. Comment it with #299/D-5:
   the cap means 5 **live** documents; counting tombstones locks a requester out of their own
   request after two swaps. (AC-6)
6. `getRequestDocument` `:146-153`: **no logic change.** Add a comment stating it is deliberately
   tombstone-blind (I-4) and that each of the three callers branches on `deletedAt` itself,
   because the delete path, the verify path and the download route need three different answers.
7. `setRequestDocumentVerified` `:163`, immediately after the `getRequestDocument` call:
   `if (doc.deletedAt) error(409, 'Removed documents cannot be verified')`. Comment with #299/D-1
   + P-6's rationale (409 not 404 — the reviewer can see the row in history right now). (D-1)
8. `deleteRequestDocument` `:195-226`, rewrite the tail:
   - after the existing 409 at `:211`, add `if (doc.deletedAt) error(404, 'Document not found')`
     with the #299/D-2 comment (already-gone from the requester's view; also closes the
     FIFO-gaming path where repeated deletes of one id force extra eviction cycles).
   - replace `db.requestDocument.delete(...)` (`:213`) with
     `db.requestDocument.update({ where: { id: doc.id }, data: { deletedAt: new Date() } })`.
   - **remove** the inline `deleteStoredFile` at `:216-218` — eviction moves to step 9's helper.
   - after the tombstone write, call `await evictTombstonedBytes(doc.requestId, 3)`, best-effort
     (`.catch(console.error)`) — a storage failure must not fail the user's delete or skip the
     audit entry, exactly as the removed inline call already reasoned.
   - **Audit change:** the `DELETE` entry's `oldValue` gains `verifiedById: doc.verifiedById`
     alongside the existing `{ requestId, fileName }`. Today's entry cannot reconstruct who
     signed a deleted document — the same class of amnesia this whole issue closes. One key.
   - Update the function's doc comment: it soft-deletes, the row is kept forever, and the 409 on
     `verifiedAt` is unchanged and deliberate (SPEC Out-of-Scope 3).
   - **Verify:** `pnpm check` (green), `pnpm test` (see §Resume and Execution Handoff for the expected breakage).

### Section 3 — the ONE eviction helper (AC-3, AC-4; D-4, D-6, I-3, P-3)

9. New exported function in `documents.ts`, placed directly above `deleteRequestDocument`:
   `export async function evictTombstonedBytes(requestId: string, keepNewest: number)`.
   Body exactly per P-3: findMany → slice → `for` loop with unlink-then-null and `continue` on
   unlink failure. Ordering: `orderBy: { deletedAt: 'asc' }`; where clause
   `{ requestId, deletedAt: { not: null }, storageKey: { not: null } }`; select
   `{ id: true, storageKey: true }`.
   - The function carries the plan's loudest comment block: **why the FIFO key is `deletedAt` and
     not `uploadedAt`** (I-1: creation and deletion order diverge once swaps happen out of upload
     order), **why unlink precedes null** (P-3: null-first leaks an unreclaimable orphan), and
     **why one helper serves two modes** (I-3: the ordering must be enforced in one place).
   - It must never touch a row's `deletedAt`, `verifiedById`, `verifiedAt`, `fileName` or
     `uploadedAt`. Only `storageKey`. State this in the comment.
   - **Verify:** `pnpm check`; the AC-3 unit suite from step 23 passes.

### Section 4 — readers + terminal trigger (AC-2, AC-5, AC-8; C-5, D-3, D-6, P-4, P-5)

10. `approvals.ts:214` (`decide()` documents include): **do not change the query.** Extend the
    existing `#283/F3` comment with a #299 paragraph: this include is deliberately UNFILTERED;
    a tombstoned document's signer is exactly what the bar must still see; adding
    `where: { deletedAt: null }` here reopens #299 with every test green. Name AC-2 as the test
    that catches it.
11. `approvals.ts`, after the `await db.$transaction(...)` at `:272` and before the audit write:
    the terminal eviction call, exactly per P-4. Comment: why it is outside the transaction
    (#101 atomicity — a disk error must not roll back an approval that already moved leave
    balances) and why `keepNewest = 0` (D-6: the request is closed, the cap stops applying;
    live documents keep their files so an auditor can open what was actually approved).
11a. `requests/index.ts:193` (`cancelRequest`) — **the CANCELLED terminal trigger (D-6a)**. Add
    `import { evictTombstonedBytes } from './documents'` to the import block (`:1-14`; the file
    already imports `./routing` and `./leave`, so the relative form matches — and the direction is
    acyclic, `documents.ts` imports neither `approvals.ts` nor `index.ts`). Then, directly after
    the bare `await db.request.update(...)` and before the audit write:
    `await evictTombstonedBytes(id, 0).catch((e) => console.error(...))`.
    Comment must say: CANCELLED is terminal (no path back — `resubmitRequest` requires RETURNED,
    `decide()` requires PENDING), and **there is deliberately no transaction here** — see P-4's
    table; the #101 argument is `decide()`-specific and does not transfer.
12. `approvals.ts:343` (`listPendingRequestsForApprover` include): add `deletedAt: true` to the
    documents select. Extend the existing comment: `verifiedAt` and `verifiedById` stay for the
    reasons already given; `deletedAt` is added **only** so the row can be split, and the
    `documents` array itself stays unfiltered because `verifiedDocActorIds` at `:356` is the bar.
13. `approvals.ts`, the `return pending.filter(...)` at `:348-360`: chain a `.map()` that adds
    `liveDocuments: r.documents.filter((d) => d.deletedAt === null)` (P-5). Comment: two
    consumers, opposite answers, split ONCE here so the template never learns tombstones exist;
    pushing a `.filter()` into Svelte would put the safety-critical distinction in the layer
    least likely to be reviewed.
14. `requests/approvals/+page.svelte:325` and `:328`: `req.documents` → `req.liveDocuments` at
    both sites (the `{@const unverified = ...}` and the `.length` chip). The `{#if}` guard at
    `:324` also moves to `req.liveDocuments`. `{@const}` stays an immediate child of the `{#if}`
    — do not restructure. (AC-8)
15. `requests/index.ts:134-150` (`getRequest`): keep the single unfiltered `documents` include
    (adding `deletedAt` is automatic — `include` returns all scalars), then return
    `{ ...req, documents: <live>, documentHistory: <all> }`.
    **This is the derived-array site named in I-2 and it gets the loudest comment in the file:**
    `documents` is the DOWNLOAD list and excludes tombstones; `documentHistory` is the AUDIT view
    and includes them; they are deliberately different arrays; collapsing them breaks AC-5 in one
    direction and the audit trail in the other. Both stay `orderBy: uploadedAt asc`.
16. `requests/index.ts:215` + `:234` (`deleteRequest` sweep): the select stays unfiltered
    (reader #7 INCLUDEs — a tombstoned file must not orphan). Add a null skip in the loop:
    `if (!d.storageKey) continue` before the `deleteStoredFile` call. `pnpm check` forces this
    one; the comment should say the skip is the evicted-bytes case, not a defensive nicety.
17. `[id]/+page.server.ts:89`: `req.documents.some(...)` → `req.documentHistory.some(...)`, with
    a comment naming C-5: this is the F3 mirror and must agree with `decide()`. If it reads the
    live list, the queue bars the actor while this page tells them nothing is wrong — the exact
    "why can't I act on this?" question #283/D12 added this line to answer.
    - **Verify (whole section):** `pnpm check` green; `pnpm test` green.

### Section 5 — detail page UI (AC-5; parallel-safe with Section 4 after step 15 lands)

18. `[id]/+page.svelte`: the existing "Supporting documents" list (`:213-276`) is **unchanged** —
    it already reads `req.documents`, which now means live-only. Verify no edit is needed rather
    than assuming it.
19. Same file, a NEW section after the upload form, rendered only when at least one tombstone
    exists: `{#if req.documentHistory.some((d) => d.deletedAt)}`. Heading "Removed documents".
    For each tombstone: filename, `uploadedAt`, removal date, and the signer via
    `doc.verifiedBy.email` when present. **No Remove button. No Verify button.**
    Download control: a link when `doc.storageKey != null`, and the literal text
    "File removed" when it is null. `{@const}` bindings must be immediate children of the
    `{#each}`/`{#if}` block tags — this repo's rule and the existing file already obeys it.
    - **Verify:** `pnpm check`; the AC-5 e2e from step 27.

### Section 6 — tests (AC-1..AC-4, AC-6, AC-8; corrections C-1, C-2, C-3)

20. **New mock helper (C-3), the highest-risk artifact in this plan.** In
    `tests/unit/approval-self-guard.test.ts`, replace the flat
    `dbMock.request.findFirst.mockResolvedValue(...)` for the new cases with a
    `mockImplementation` that reads `args.include.documents.where` and applies it to the fixture
    array before returning. It must at minimum honour `{ deletedAt: null }`.
    Model it on `approval-queues.test.ts`'s `project` (`:50-75`) — same intent, but that helper
    honours `select` keys only and **cannot** see a `where`, which is exactly why a new one is
    needed. Header comment must say so, and must name the vacuous-mock trap the repo has already
    shipped twice (`dashboard-org-scoping.test.ts`, `audit-log-reveal.test.ts` / #242).
21. `tests/unit/approval-self-guard.test.ts`, NEW describe
    `'decide — the F3 bar survives soft-delete (#299)'`, built on the **:57 db-mock harness**
    (per C-1, NOT the :198 predicate harness):
    - **AC-2**: fixture request whose ONLY verified document is a tombstone
      (`{ verifiedById: SIGNER, deletedAt: new Date() }`), decided by SIGNER → expect 403
      `'You cannot act on this stage'`. Uses step 20's helper, so adding
      `where: { deletedAt: null }` to `approvals.ts:214` flips this refuse→allow. Comment must
      state that contract explicitly.
    - **AC-1**: the full un-verify → delete → re-upload shape — one tombstoned doc with
      `verifiedAt: null, verifiedById: SIGNER` plus one fresh live doc with both null → still 403.
    - **AC-4**: same as AC-1 but the tombstoned doc also has `storageKey: null` (bytes evicted by
      the FIFO cap) → still 403. Proves eviction does not affect the row the bar reads.
21a. **The eviction TRIGGERS get their own gates (AC-10).** Step 23 tests
    `evictTombstonedBytes` in isolation — nothing there asserts that any caller ever *invokes*
    it. Without this step the call could be deleted outright, or passed `3` instead of `0`, and
    the entire suite stays green. This is the repo's own recurring failure shape (`timesheetSoD`:
    one correct guard, hand-wired inputs, one site left behind), landing here on the trigger.
    - In `tests/unit/approval-self-guard.test.ts`, module-mock the documents service —
      `vi.mock('$lib/server/services/requests/documents', () => ({ evictTombstonedBytes: vi.fn() }))`
      — and add three cases against `decide()`:
      **APPROVED** → called exactly once with `(req.id, 0)`;
      **REJECTED** → called exactly once with `(req.id, 0)`;
      **a PENDING stage advance** (a multi-stage chain where the decision does not close the
      request) → **not called at all**.
      Assert the arguments, not just the call — a `3` here would silently keep 3 files forever on
      a closed request and no other test would notice.
    - **`cancelRequest` has ZERO tests in this repo today** (`grep -rl cancelRequest tests/`
      returns nothing), so the CANCELLED trigger cannot ride on an existing case. Add a small new
      describe — `tests/unit/requests-cancel.test.ts`, or a new describe inside
      `tests/unit/requests-documents.test.ts` if a `db.request` mock is cheaper to add there —
      covering: cancelling a PENDING request calls `evictTombstonedBytes(id, 0)` exactly once;
      the 400 refusal path (status not PENDING/RETURNED) does **not** call it. (AC-10)
22. `tests/unit/approval-queues.test.ts`: extend the AC-21/AC-28 group with the queue mirror —
    a request whose only verified document is a tombstone stays excluded from the queue for its
    signer.
    **This step must honour `where`, and the existing helper cannot.** `projectDocs`
    (`approval-queues.test.ts:50-75`) reads only `args?.include?.documents?.select` — it can see
    which *keys* were requested and **nothing else**. Adding `where: { deletedAt: null }` to
    `approvals.ts:343` would make reader #2 of 9 silently stop seeing tombstoned signers while
    this test stayed green. That is precisely the mutation class AC-2 exists to catch, landing on
    the reader that is watched least.
    Do **one** of the following, not neither:
    - **(a) preferred** — a LOCAL copy of step 20's `where`-honouring helper against `findMany`
      here. Step 20's lives inline in `approval-self-guard.test.ts`, a different file; duplication
      at two callers is deliberate per Test Infra note 1, which promotes to a shared
      `tests/unit/helpers/` module only at a third caller. The mutation flips this case
      exclude→include; or
    - **(b)** capture the `findMany` args and assert
      `expect(args.include.documents).not.toHaveProperty('where')`, in the shape of
      `requests-documents.test.ts:71`.
    Whichever is chosen, the case carries a comment naming `approvals.ts:343` as the guarded line.
23. `tests/unit/requests-documents.test.ts`: NEW describe `'FIFO byte eviction (#299)'`. Extend
    the file's `dbMock` with `requestDocument.findMany` and `requestDocument.update`, and the
    storage mock already stubs `deleteStoredFile` (`:24-30`). (AC-3)
    - 4 tombstones A,B,C,D (`deletedAt` ascending), `keepNewest = 3` → `deleteStoredFile` called
      **once**, with A's key; `requestDocument.update` called once, `{ where: { id: 'A' },
      data: { storageKey: null } }`; **`requestDocument.delete` and `deleteMany` never called at
      all** (the rows-forever invariant, asserted directly).
    - **Ordering assertion**: `deleteStoredFile.mock.invocationCallOrder[0] <
      requestDocument.update.mock.invocationCallOrder[0]` — the unlink-before-null contract as a
      test, not a comment.
    - 3 tombstones, `keepNewest = 3` → no eviction at all.
    - `keepNewest = 0` (the D-6 terminal mode) → all tombstoned files evicted; a **live** doc in
      the same fixture is untouched.
    - unlink rejects → `update` is **not** called for that row (the P-3 `continue`), and the loop
      still processes the next row.
    - a tombstone with `storageKey: null` already → not passed to `deleteStoredFile` a second
      time (belt-and-braces; `storage.ts:89-96` also tolerates it per C-6).
24. `tests/unit/requests-documents.test.ts`: extend the `setRequestDocumentVerified` describe with
    the D-1 case — `findFirst` returns a row with `deletedAt` set → rejects 409, and
    `requestDocument.update` is **never called**. (D-1)
25. `tests/unit/request-documents.test.ts`: `assertValidRequestUploads` is a pure function taking
    `existingCount`, so it cannot see tombstones. The D-5/AC-6 behaviour lives in
    `saveRequestDocuments`'s **query shape**, not in the assertion. Add the AC-6 case to
    `tests/unit/requests-documents.test.ts` instead: mock `db.request.findFirst`, call
    `saveRequestDocuments`, and assert the select contains
    `documents: { where: { deletedAt: null } }`. Leave `request-documents.test.ts` untouched and
    note in the new case why the SPEC's suggested host could not carry it. (AC-6)
26. AC-8's host, per the SPEC's "exact host suite TBD at PLAN time": **`approval-queues.test.ts`**.
    New case asserting a returned row's `liveDocuments` excludes tombstones while its `documents`
    still contains them — one assertion pair, proving both halves of the P-5 split in the same
    test so a future edit cannot satisfy one and break the other.
    - **Verify:** `pnpm test` fully green.
26a. **Fourth-terminal-writer tripwire (AC-10).** Three explicit call sites is the honest
    minimum — the modes carry different semantics and a generic "terminal hook" abstraction is
    exactly the speculative flexibility CLAUDE.md §2 forbids. But the honest answer to "what
    catches a fourth writer?" is currently *nothing*. Add a **tripwire, not an abstraction**, in
    the shape of the repo's existing static scan `tests/unit/rbac-no-rank-helpers.test.ts`
    (`readdirSync`/`readFileSync` walk over `../../src`, comment lines skipped):
    - scan `src/lib` **and** `src/routes` for writes of a **terminal `Request.status`** (the establishing grep spanned both; a writer added under `src/routes/` must not pass unnoticed) — the shape
      `(db|tx).request.update(...)` / `updateMany(...)` whose `data` sets `status` to `APPROVED`,
      `REJECTED`, `CANCELLED`, or a `transition.status`-style variable.
    - assert the set of **files** containing such a write is exactly
      `{ services/approvals.ts, services/requests/index.ts }`.
    - **Verified at PLAN time:** those are the only two today. The many other
      `status: 'APPROVED'` hits across `src/lib/server/` are either other models
      (`Timesheet`, `PayrollRun`, `ActionProposal`, statutory rates) or `where`-clause reads —
      the scan must not match those, so it must key on `request.update`, not on the status
      literal alone.
    - Comment: a new file appearing in this set means a new terminal path exists and D-6 does not
      fire on it. The correct response is to add the eviction call there, not to widen the
      allow-list.
27. `tests/e2e/request-documents.spec.ts` — NEW file (AC-5). **No seed change (C-4).** Copy the
    `approval-chain.spec.ts` pattern: `test.describe.configure({ mode: 'serial' })`, file a
    request as `USERS.employee` via `page.request.post('/api/v1/requests')`, upload a document
    through the `?/uploadDocs` form action, delete it through `?/deleteDoc`, upload a
    replacement, then assert on `/requests/{id}`:
    - the "Supporting documents" list shows exactly one item, the replacement
    - the "Removed documents" section shows the deleted one, names its signer, and has **no**
      download link and **no** Remove/Verify button
    - a direct `page.request.get('/api/v1/requests/{id}/documents/{deletedDocId}')` returns
      **200 while its bytes survive** (D-3 — a tombstone within the cap is still downloadable),
      which is the assertion that proves the route was not naively 404'd on `deletedAt`
    - `test.afterAll` cleans up with a raw `PrismaClient`, same as approval-chain.
    - **Verify:** `pnpm test:e2e tests/e2e/request-documents.spec.ts`.

### Section 7 — scripts (AC-7, AC-9; the untypechecked surface)

28. `scripts/sweep-orphan-uploads.ts:29`: the query stays unfiltered (reader #8 INCLUDEs). At
    `:32`, change the Set construction to drop nulls with a type predicate:
    `.map((d) => d.storageKey).filter((k): k is string => k !== null)`. Comment: tombstoned
    documents whose bytes survive MUST stay in the known-set or the sweep deletes files that
    still have a row (#299/AC-7); the null filter is the evicted case, where the row correctly
    no longer claims any file.
29. `scripts/prod-delete.ts:176-181`: same — query unfiltered, and `:181`'s `storageKeys`
    construction gains `.filter((k): k is string => k !== null)`. Comment must name why this one
    is not merely cosmetic: `removeFiles()` at `:356` is typed `string[]` and its private
    `deleteStoredFile` at `:59-68` calls `path.resolve(UPLOAD_DIR, storageKey)` — a null there is
    a runtime `TypeError` on the droplet, and **`pnpm check` does not typecheck `scripts/**`**,
    so nothing in the pipeline flags it.
30. Do **not** consolidate `prod-delete.ts`'s private `deleteStoredFile`/`resolveKey` (I-6). The
    comment at `:50-54` documents the duplication as deliberate — the runtime image ships only
    `build/`, `prisma/`, `scripts/` and `node_modules`, so importing from `src/` crashes on the
    droplet. Add a backlog note instead (§Test Infra Improvement Notes).
    - **Verify:** the Agent-Probe runbook in §5. A green typecheck proves nothing here.

---

## 5. Manual Verification Runbook — AC-7 and AC-9

`pnpm check` covers neither script. `pnpm lint` catches orphaned bindings, not types. The #236 CI
`schema-upgrade` job seeds **zero** `RequestDocument` rows, so its populated-DB check passes
**vacuously** for this change. **These two ACs are proved by execution or not at all.**

### Seeded fixture (build once, reuse for both)

```bash
./start.sh
pnpm db:push
pnpm db:seed
```

Then, as `employee@veent.ph`: file one OVERTIME request, and on `/requests/{id}` upload **5**
documents, deleting **4** of them one at a time. That produces exactly the state both probes need —
4 tombstones, the FIFO cap fired once (so one tombstone has `storageKey = null` and 3 do not), and
1 live document.

**Corrected at EXECUTE (was 4 uploads / 3 deletes).** `keepNewest = 3` keeps the newest three
tombstones, so the cap first fires on the **4th** tombstone — three deletions evict nothing at all,
and the probe would then run against a fixture with no evicted row, which is the one state it
exists to cover. Verified live: deletions 1-3 evicted nothing, deletion 4 evicted the oldest.

Confirm the fixture before probing:

```bash
docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c \
  'SELECT id, "fileName", "deletedAt" IS NOT NULL AS tombstoned, "storageKey" IS NULL AS evicted FROM request_documents ORDER BY "uploadedAt";'
```

Expect 5 rows: 1 live+not-evicted, 1 tombstoned+evicted, 3 tombstoned+not-evicted.

### AC-7 probe — `sweep-orphan-uploads.ts`

```bash
pnpm tsx scripts/sweep-orphan-uploads.ts --grace-minutes=0
```

- **PASS**: the script completes without throwing, and **none** of the 2 surviving tombstoned
  files appears in the `orphan:` list. `document rows: N` must count them.
- **FAIL modes to watch for**: a `TypeError` (the null-filter was missed), or a tombstoned file
  listed as an orphan (the query was wrongly filtered to live rows — that would make the sweep
  delete files that still have a row).
- Do **not** pass `--delete` on the first run. Only after a clean dry run, re-run with
  `--delete --grace-minutes=0` and confirm the 2 tombstoned files still exist on disk afterwards.

### AC-9 probe — `prod-delete.ts`

Run against the **local dev database only**, never production.

```bash
pnpm tsx scripts/prod-delete.ts employee <employeeId>          # dry run, no --execute
```

The throwaway employee needs a `users` row so the fixture can be built over HTTP through
`/api/v1/_dev/login-as`. `--execute` additionally requires `--confirm=<employeeNumber>
--actor=<email>`, and neither script loads `.env.dev` itself — prefix both with `DATABASE_URL=...`.

- **PASS (dry)**: prints a `request_documents: N` count that includes the tombstones, and does not
  throw.
- Then, on a throwaway seeded employee only:

```bash
pnpm tsx scripts/prod-delete.ts employee <employeeId> --execute
```

- **PASS (execute)**: completes without a `TypeError` from `resolveKey`, and the 2 surviving
  tombstoned files are gone from `uploads/requests/{requestId}/`. Verify with
  `ls uploads/requests/{requestId}/` before and after.
- **FAIL mode**: `TypeError: The "path" argument must be of type string` from `path.resolve` in
  `prod-delete.ts:59-68` — that is the null reaching the private duplicate, which is precisely
  what the typechecker cannot see.

Record both probe outcomes verbatim in the EXECUTE report. "Ran it, looked fine" is not evidence.

---

## Verification Evidence

Every SPEC acceptance criterion, its proving scenario, and its strategy. **No developed behavior
in this plan is assigned Known-Gap.**

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `approval-self-guard.test.ts › decide — the F3 bar survives soft-delete (#299)` — un-verify → delete → re-upload, decision still 403 | Fully-Automated | **AC-1** |
| Same describe — request whose ONLY verified doc is a tombstone, using the step-20 `where`-honouring mock, so `where: { deletedAt: null }` on `approvals.ts:214` flips it refuse→allow | Fully-Automated | **AC-2** |
| `requests-documents.test.ts › FIFO byte eviction (#299)` — 4 tombstones / keepNewest 3 → one unlink (oldest by `deletedAt`), one `storageKey: null` update, `delete`/`deleteMany` never called, and unlink ordered before the null | Fully-Automated | **AC-3** |
| Same describe — `keepNewest = 0` terminal mode evicts every tombstoned file, live doc untouched | Fully-Automated | **AC-3 / D-6** |
| Same describe — unlink rejects → `update` not called for that row, loop continues | Fully-Automated | **AC-3 / P-3** |
| `approval-self-guard.test.ts` — tombstone with `storageKey: null` still bars its signer | Fully-Automated | **AC-4** |
| `requests-documents.test.ts` — `setRequestDocumentVerified` on a tombstone rejects 409, `update` never called | Fully-Automated | **D-1** |
| `requests-documents.test.ts` — `saveRequestDocuments` select contains `documents: { where: { deletedAt: null } }` | Fully-Automated | **AC-6** |
| `approval-queues.test.ts` — returned row's `liveDocuments` excludes tombstones while `documents` still contains them (both halves, one test) | Fully-Automated | **AC-8** |
| `approval-queues.test.ts` — queue still excludes a request whose only verified doc is a tombstone, using the `where`-honouring helper **or** a `not.toHaveProperty('where')` assertion on the captured `findMany` args (§4 step 22) | Fully-Automated | **AC-2 (queue mirror)** |
| `approval-self-guard.test.ts` — `decide()` on APPROVED calls `evictTombstonedBytes(req.id, 0)` exactly once (arguments asserted, not just the call) | Fully-Automated | **AC-10** |
| Same describe — REJECTED calls it once with `(req.id, 0)`; a non-terminal PENDING advance does **not** call it | Fully-Automated | **AC-10** |
| New `cancelRequest` describe — CANCELLED calls `evictTombstonedBytes(id, 0)` once; the 400 refusal path does not | Fully-Automated | **AC-10 / D-6a** |
| Static-scan tripwire — the set of files writing a terminal `Request.status` is exactly `{approvals.ts, requests/index.ts}` (§4 step 26a) | Fully-Automated | **AC-10** |
| `tests/e2e/request-documents.spec.ts` — live list shows only the replacement; "Removed documents" names the signer with no download link and no Remove/Verify control | Fully-Automated (E2E) | **AC-5** |
| Same spec — direct GET of the tombstoned doc's download URL returns **200 while bytes survive** | Fully-Automated (E2E) | **AC-5 / D-3** |
| §5 probe — `pnpm tsx scripts/sweep-orphan-uploads.ts --grace-minutes=0` against the seeded tombstone fixture: no throw, no surviving tombstoned file listed as an orphan | Agent-Probe | **AC-7** |
| §5 probe — `pnpm tsx scripts/prod-delete.ts employee <id> --execute` on a throwaway seeded employee: no `resolveKey` TypeError, tombstoned files gone from disk | Agent-Probe | **AC-9** |
| §4 step 1-4 — `psql \d request_documents` shows nullable `storageKey`, `deletedAt`, both indexes; row count and existing keys unchanged across the push | Hybrid (running DB required) | **P-2 / D-4** |
| `pnpm check` | Fully-Automated | The `String → String?` reader audit across `src/**` |
| `pnpm test` (1273 + new) | Fully-Automated | No regression |

**Why AC-7 and AC-9 are Agent-Probe and not Known-Gap:** they are high-risk-class
(destructive file operations) behaviors, so the vacuous-green ban forbids Known-Gap. They cannot
be Fully-Automated because `scripts/**` has no test harness in this repo and building one is
outside this issue's blast radius. Agent-Probe with the §5 runbook — exact commands, a seeded
fixture, and named FAIL signatures — is the strongest available proof and is a real proving
strategy, not a residual.

---

## Test Infra Improvement Notes

1. **`where`-honouring Prisma mock helper (C-3) — required by this plan, and reusable.**
   `approval-queues.test.ts`'s `project` (`:50-75`) honours `select` keys only. Neither it nor a
   flat `mockResolvedValue` can catch a `where` mutation, which is exactly the mutation class
   #299 must guard. Step 20 builds a minimal version inline in
   `approval-self-guard.test.ts`. **Follow-up**: promote both `project` and the new
   `where`-honourer into a shared `tests/unit/helpers/prisma-mock.ts` once a third caller
   appears. Not done here — it would touch test files outside this issue's blast radius.
2. **`scripts/**` has zero automated coverage** and is outside `pnpm check`. Two ACs in this plan
   (AC-7, AC-9) are Agent-Probe purely because of that. **Backlog artifact to file at
   UPDATE PROCESS**: a `tests/unit/scripts-storage-keys.test.ts` that at minimum unit-tests the
   key-collection expressions of both scripts against a mocked Prisma client. That would move
   AC-7/AC-9 from Agent-Probe to Fully-Automated for any future change.
3. **`prod-delete.ts`'s duplicated `deleteStoredFile`/`resolveKey` (`:50-68`)** is deliberate
   (I-6) but means a storage-contract change must be made in two places with only one of them
   typechecked. **Backlog**: a static test asserting the two copies stay in step, in the shape of
   `tests/unit/rbac-no-rank-helpers.test.ts` (an existing static-scan precedent in this repo).
4. **The #236 populated-DB CI job seeds zero `RequestDocument` rows**, so it validates nothing
   about this table. **Backlog**: add one request with one document to the CI seed so future
   `request_documents` schema changes are actually exercised there. Deliberately not done in this
   issue — changing the CI seed is its own blast radius and #282's lesson is that seed changes
   must be run, not assumed.

---

## 6. What Would Make This Plan Wrong

The assumptions most worth attacking. **VALIDATE should start here.**

1. ~~C-3's premise: that a `where`-honouring mock can be written cleanly in vitest.~~
   **RESOLVED at VALIDATE — C-3 PASS, and the fallback is deliberately deleted.** `decide()`
   builds `include: { …, documents: { select: { verifiedById: true } } }`
   (`approvals.ts:207-216`), so `args.include.documents.where` is a real path on the `findFirst`
   args and honouring it is ordinary `mockImplementation`. AC-2 **is** provable at unit level.
   The weaker query-shape fallback that stood here has been removed on purpose: leaving it in
   invites an execute-agent to take the weaker path when the strong one works.
   (A `not.toHaveProperty('where')` assertion survives as option (b) in §4 step 22 — but that is
   a *choice between two adequate options* on the queue reader, not a fallback from a failure.)
2. **P-2: that `prisma db push` drops a NOT NULL without data loss and without an interactive
   prompt.** I reasoned this from the direction of the change (widening), not from running it.
   If `db push` prompts or refuses, Section 1 stalls and a `scripts/migrate-*.ts` becomes
   necessary after all. Step 1-4's before/after row count is the guard, but the risk is that
   EXECUTE hits it late.
3. ~~P-5: that adding `liveDocuments` does not break another consumer.~~
   **RESOLVED at VALIDATE — P-5 PASS.** The second caller is `countPendingApprovals`
   (`approvals.ts:404`), which consumes `.length` only, so the additive field is safe. The split
   also cannot desynchronise: `verifiedDocActorIds` at `:356` keeps reading `r.documents`
   unfiltered, and `liveDocuments` is consumed only by the template.
4. ~~D-6's terminal trigger placement: that `decide()` is the ONLY route to a terminal status.~~
   **RESOLVED at VALIDATE — and it was NOT the only route.** The grep found a second:
   `cancelRequest` (`requests/index.ts:193`) writes `CANCELLED`. The user approved extending D-6
   to cover it (D-6a), it is wired at §4 step 11a, and it is proven by AC-10.
   **The residual worth attacking is now different and narrower:** the tripwire at §4 step 26a
   must key on `request.update`, **not** on the `status: 'APPROVED'` literal — `src/lib/server/`
   contains ~20 such literals belonging to `Timesheet`, `PayrollRun`, `ActionProposal`, statutory
   rates and `where`-clause reads. A tripwire that matches those is noise and will be deleted by
   the next person; one that matches none of them is the guard. **Attack the scan's precision.**
5. **P-6's 409-vs-404 choice for D-1.** If VALIDATE judges that a tombstone should be invisible to
   the verify path entirely, this becomes 404 and the AC in step 24 changes. Low blast radius,
   but it is a deliberate divergence from D-2's 404 and deserves a second opinion.
6. **C-5's claim that `actBlockedReason` must INCLUDE tombstones.** This makes the detail page
   tell an approver they are barred because of a document that no longer appears in their
   download list. That is *correct* (it matches the queue) but may read as confusing. The
   alternative — leaving it on the live list — creates a page that contradicts the queue, which
   is worse. Worth a deliberate confirmation rather than a silent one.
7. **The eviction helper's `continue`-on-unlink-failure (P-3).** It is strictly better than
   nulling anyway, but it means a persistently failing unlink keeps a file forever, retried on
   every subsequent eviction. There is no alerting on that. Accepted; named here so it is not
   discovered later as a surprise.
8. **AC-5's e2e asserting a 200 on a tombstoned document's download URL.** This is D-3 read
   literally, and it is the most counter-intuitive assertion in the plan — a reviewer's instinct
   will be that a "deleted" document should 404. If D-3 is ever softened, this test is the first
   thing that breaks, and it should break loudly rather than be quietly relaxed.

---

## 7. Risk Register + Rollback

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Uniform `where: { deletedAt: null }` applied to a reader that must INCLUDE | **High** — this repo's named twin-door pattern, six prior instances | **Critical** — silently reopens #299 with every test green | The nine-reader table in Blast Radius; comments at all five INCLUDE sites; AC-2's mutation-targeted test |
| Null `storageKey` reaches `prod-delete.ts`'s private `resolveKey` | Medium — no typecheck covers it | High — the purge crashes on the droplet mid-run | Step 29's type predicate + §5's AC-9 probe with the named TypeError signature |
| Byte eviction unlinks the wrong file | Low | **Irreversible** — bytes are gone | The FIFO key is `deletedAt` not `uploadedAt` (I-1); the AC-3 suite asserts the exact key passed to `deleteStoredFile`; `keepNewest` is explicit at all three call sites |
| Terminal eviction inside the `$transaction` | Low if P-4 is followed | High — a disk error rolls back an approval that already moved leave balances | P-4 places it after the commit, best-effort |
| Null-first ordering leaks an unreclaimable orphan | Medium — it is the natural way to write the loop | Medium — storage grows and no sweep can reclaim it | P-3's ordering + step 23's `invocationCallOrder` assertion |
| A **fourth** terminal `Request.status` writer appears and D-6 never fires on it | Low today, rises over time | Medium — those requests hold their tombstoned bytes forever, silently | **Resolved at VALIDATE**: the three writers are now enumerated and wired (`decide()` APPROVED/REJECTED + `cancelRequest` CANCELLED), and §4 step 26a's static-scan tripwire fails the suite if a fourth file joins the set. A tripwire, not an abstraction. |
| The eviction call is dropped or mis-argued (`3` instead of `0`) at a trigger site | Medium — the helper's own tests pass either way | Medium — a closed request keeps 3 files forever | §4 step 21a asserts the exact arguments at all three sites |

**Rollback.** Code rollback is a plain `git revert` of the branch. **Schema rollback is
asymmetric and must be understood before merge:**

- `deletedAt` can be dropped freely (additive, nullable).
- `storageKey String? → String` **cannot** be pushed back if any row has been evicted — those
  rows have a null and `db push` will refuse or destroy. Reverting after any eviction has run in
  an environment requires either deleting the evicted rows (which destroys exactly the audit
  trail this issue exists to create) or backfilling a sentinel.
- **Practical consequence:** rolling back after this ships in an environment where anyone has
  deleted a document is a data decision, not a git operation. Say so in the PR description.

---

## 8. Explicit Non-Goals

EXECUTE must not drift into these. All are SPEC Out-of-Scope items or INNOVATE rejections.

1. A `RequestDocumentVerification` history table (SPEC OoS 1 — the *other* #283/D11 ceiling).
2. Fixing `verifiedBy`'s implicit `SetNull` (`schema.prisma:876`) — a third route to signer
   amnesia, flagged in the SPEC's Risks as a residual, not resolved here.
3. Changing the `if (doc.verifiedAt) error(409, ...)` delete lock (SPEC OoS 3 — it correctly
   blocks removing a *currently* verified document).
4. Changing who may delete a document (SPEC OoS 4 — stays owner-only).
5. Changing `MAX_REQUEST_DOCS`'s value (SPEC OoS 5 — stays 5; only what it counts changes).
6. A database-level constraint enforcing the FIFO cap or row immortality (SPEC OoS 6 —
   application code only, consistent with #283/D4).
7. Consolidating `prod-delete.ts`'s private storage helpers (I-6 — deliberate duplication).
8. A Prisma extension or global middleware for the soft-delete filter (I-2 — inverts the safety
   property at the five INCLUDE sites).
9. Pushing a `.filter()` into the Svelte templates (I-5 — the split is a server concern).
10. Promoting the mock helpers into a shared file, adding script test coverage, or changing the
    CI seed — all four Test Infra Improvement Notes are **backlog**, not this PR.
11. Adding an `isActive`-style boolean. The 12 existing `isActive Boolean` models are a
    *deactivation* pattern with no timestamp and no ordering key; copying it loses the FIFO key
    (SPEC Constraints, I-1).

---

## Acceptance Criteria

Carried verbatim in intent from the locked SPEC (AC-1..AC-9). Each names its proving scenario and
strategy; the full gate table with commands is §Verification Evidence.

| AC | Outcome | proven by | strategy |
|---|---|---|---|
| **AC-1** | Un-verify → delete → re-upload no longer erases the signer; the decision is still refused | `approval-self-guard.test.ts › decide — the F3 bar survives soft-delete (#299)` (§4 step 21) | Fully-Automated |
| **AC-2** | `decide()`'s own documents read still includes a tombstoned signer — adding `where: { deletedAt: null }` to `approvals.ts:214` must turn this red | same describe, using the step-20 `where`-honouring mock | Fully-Automated |
| **AC-3** | The FIFO cap evicts the oldest tombstoned **file**, never a row | `requests-documents.test.ts › FIFO byte eviction (#299)` (§4 step 23) | Fully-Automated |
| **AC-4** | The bar still holds after 4+ swap cycles, i.e. after the signed file's bytes were evicted | `approval-self-guard.test.ts` — tombstone with `storageKey: null` (§4 step 21) | Fully-Automated |
| **AC-5** | Download list excludes tombstones; the history view includes them, names the signer, and offers no download control — and the v1 route agrees | `tests/e2e/request-documents.spec.ts` (NEW, §4 step 27) | Fully-Automated (E2E) |
| **AC-6** | Tombstones do not count toward `MAX_REQUEST_DOCS`; the cap means 5 **live** documents | `requests-documents.test.ts` — asserts the filtered `_count` select (§4 step 25) | Fully-Automated |
| **AC-7** | `sweep-orphan-uploads.ts` does not flag surviving tombstoned files as orphans | §5 runbook — seeded fixture + `pnpm tsx scripts/sweep-orphan-uploads.ts --grace-minutes=0` | Agent-Probe |
| **AC-8** | The approvals "N documents" chip and unverified badge count live documents only | `approval-queues.test.ts` — `liveDocuments` excludes / `documents` includes, one test (§4 step 26) | Fully-Automated |
| **AC-9** | `prod-delete.ts` collects every `storageKey`, tombstoned or not, so no file survives a purge | §5 runbook — `pnpm tsx scripts/prod-delete.ts employee <id> --execute` on a throwaway seeded employee | Agent-Probe |
| **AC-10** *(added at VALIDATE)* | Every terminal path **actually invokes** the eviction with `keepNewest = 0` — APPROVED, REJECTED and CANCELLED — a non-terminal advance does not, and a fourth terminal writer cannot appear unnoticed | `approval-self-guard.test.ts` trigger cases + the new `cancelRequest` describe (§4 step 21a) + the static-scan tripwire (§4 step 26a) | Fully-Automated |

**Why AC-10 exists.** As originally written, no AC covered any terminal *trigger* — AC-3 proves the
helper's `keepNewest = 0` **mode** only. The call sites themselves had zero gate, so the CANCELLED
path (and a dropped or mis-argued call at either other site) would have shipped unproven.

Two ACs deviate from the SPEC's suggested host suite; both deviations are justified in §2
(C-1 for AC-1/AC-4, C-2 for AC-2) and neither weakens the criterion.

---

## Phase Completion Rules

This plan has no phase split — it is one branch. "Done" is defined per section and in aggregate.

**A section is CODE DONE when** its checklist steps are applied and its per-step **Verify** line
passes. That is code-only status, not verified status.

**A section is VERIFIED when** CODE DONE holds *and*:

| Section | Verified requires |
|---|---|
| 1 Schema | `pnpm db:push` green **and** the `psql \d request_documents` inspection **and** the before/after row-count proof from step 1-4 (P-2). A green push on an empty table is not evidence. |
| 2 `documents.ts` | `pnpm check` green, `pnpm test` green |
| 3 Eviction helper | The full AC-3 suite green, including the `invocationCallOrder` unlink-before-null assertion |
| 4 Readers | `pnpm check` green, `pnpm test` green, **and** all five INCLUDE sites carry their comment (the comments are the deliverable, not decoration), **and** all three terminal triggers are wired (`decide()` APPROVED + REJECTED, `cancelRequest` CANCELLED) |
| 5 Detail UI | `pnpm check` green **and** the AC-5 e2e green |
| 6 Tests | `pnpm test` fully green (1273 + new), `pnpm test:e2e tests/e2e/request-documents.spec.ts` green, **and** the step 26a tripwire passes with exactly two files in its set |
| 7 Scripts | **Both §5 probes executed with their output recorded verbatim.** A green `pnpm check` proves nothing here — it does not read `scripts/**`. |

**The plan is COMPLETE when** all seven sections are VERIFIED, `pnpm check` + `pnpm lint` +
`pnpm test` + `pnpm test:e2e` are green on the branch, and every AC-1..AC-10 row in
§Verification Evidence has a recorded outcome. Any AC without a recorded outcome keeps the plan
**CONDITIONAL**, never PASS.

**Honest-status rule:** if a section's code is written but its gate has not been run, its status
is `CODE DONE`, never `VERIFIED`. AC-7 and AC-9 in particular cannot be inferred from any
automated gate in this repo.

---

## Resume and Execution Handoff

1. **Selected plan file**: `process/general-plans/active/soft-delete-request-documents-299_12-08-26/soft-delete-request-documents-299_PLAN_12-08-26.md`
2. **Last completed phase**: PLAN. RESEARCH, SPEC and INNOVATE are all complete; the SPEC is
   locked and its D-1..D-6 plus AC-1..AC-9 are binding. **No code has been written.**
3. **Validate-contract status**: **PASS** (VALIDATE pass 2, 12-08-26). Pass 1 was CONDITIONAL;
   all five remedies (V-1..V-5) are applied and re-verified against source. EXECUTE may start.
4. **Supporting context loaded**: the SPEC (same folder); `gh issue view 299`;
   `documents.ts`, `approvals.ts`, `requests/index.ts`, `storage.ts`, `schema.prisma`,
   the request detail route + page, the v1 download route, `approvals/+page.svelte`,
   both scripts, and the five relevant unit suites plus `approval-chain.spec.ts`.
5. **Next step for a fresh agent**: **EXECUTE.** VALIDATE pass 1 returned CONDITIONAL — 0 FAILs,
   5 CONCERNs; all five are closed in this file (V-1 step 22's `where` honouring, V-2/AC-10
   trigger gates at step 21a, V-3 the CANCELLED trigger at step 11a + P-4's universal rule,
   V-4 the step 26a tripwire, V-5 the ≥3-row P-2 proof). **Pass 2 re-validated all five as PASS.** EXECUTE starts at §4 Section 1 step 1 on branch
   `feat/soft-delete-request-docs-299`. §6 item 4's remaining question — the precision of step 26a's
   scan — was settled at pass 2: keying on `request.update` gives exactly the two intended files
   (the `status: 'APPROVED'` literal gives 7 files of noise). The only open items are the five
   editorial fixes N-1..N-5 in the validate-contract; apply them inline, do not re-plan.

**Expected pre-existing breakage during EXECUTE (do not treat as a regression):** after Section 1
lands, `pnpm check` goes red at every `src/` site reading `storageKey`. That redness IS the reader
audit — work through it via Sections 2-5 rather than silencing it with a non-null assertion.
A `!` on `storageKey` anywhere in `src/` is a plan violation.

---

## Validate Contract

Status: PASS
Date: 12-08-26
date: 2026-08-12
generated-by: outer-pvl
supersedes: 2026-08-12 (outer-pvl) — pass 2 re-validation after the V-1..V-5 remedies were applied in place; pass 1 was CONDITIONAL

Parallel strategy: sequential
Rationale: 6/7 signals present (S2 schema/auth, S3, S5, S6 high-risk, S7 5+ files), but the
validating session had no Agent tool, so both layers were executed sequentially by a single agent.
Stated plainly rather than presented as a fan-out. Pass 2 was additionally narrow by instruction:
verify the five pass-1 remedies landed and work, and catch damage the revision itself introduced.

### Pass 2 — the five remedies, verified against source

| Remedy | Landed? | Verified how |
|---|---|---|
| **V-1** — step 22's inverted claim removed; both options genuinely catch a `where` at `approvals.ts:343` | **YES, PASS** | The wrong sentence ("the query is not filtered, so no `where` honouring is needed") is gone; step 22 now states outright that `projectDocs` reads only `select` and names `approvals.ts:343` as the guarded line. Option **(b)** targets the right object: `listPendingRequestsForApprover` is `db.request.findMany({ include: { …, documents: { select: {…} } } })` (read at `:335-345`), so a mutation lands at exactly `args.include.documents.where` — `not.toHaveProperty('where')` on the captured `findMany` args catches it and cannot be satisfied by any other change. Option **(a)** is semantically sound too (the mutation flips the case exclude→include). Not decorative. |
| **V-2** — trigger gates assert the caller, with arguments, against the right module | **YES, PASS** | Step 21a asserts `(req.id, 0)` explicitly and says so in words ("Assert the arguments, not just the call — a `3` here would silently keep 3 files forever"), plus the negative PENDING-advance case. The mock target is proven, not assumed: `approval-self-guard.test.ts:33` **already** mocks `'$lib/server/services/notifications'` by alias while `approvals.ts` imports it relatively as `./notifications`, and that mock demonstrably works today — so the alias form for `'$lib/server/services/requests/documents'` resolves to the same module the caller will import. A full-module factory mock is also safe: no other `src/` module imports `requests/documents` inside `approvals.ts`'s graph (only three route files and two test files import it). Feasibility of the APPROVED case additionally confirmed: the existing `:57` fixture already drives `decide()` through the `$transaction` (`:99-104` asserts `resolves.toBeDefined()`), and `type: 'LEAVE'` with `payload: null` makes `applyApprovedRequest` return early with zero extra db surface needed. |
| **V-3** — step 11a + rewritten P-4 + AC-10 | **YES, PASS** | Step 11a wires `requests/index.ts:193` with the exact import, placement (after the bare `await db.request.update`, before the audit write) and the explicit "there is deliberately no transaction here — do not add one". P-4 is now a universal rule plus a two-row site table that quarantines the #101 argument to `decide()`. **AC-10 proves the TRIGGER, not the mode** — its text is "Every terminal path **actually invokes** the eviction with `keepNewest = 0`", its proving rows assert call-with-arguments at all three statuses plus the negative case, and the plan states the distinction outright ("AC-3 proves the helper's `keepNewest = 0` **mode** only"). The duplication this AC exists to prevent did not happen. D-6a, Touchpoints row 4, Public Contracts, Risk row 6, §6 item 4 and Section 4's Verified rule are all updated consistently. |
| **V-4** — step 26a tripwire | **YES, PASS** | Present in the `rbac-no-rank-helpers.test.ts` static-scan shape, pinning the file set to exactly `{services/approvals.ts, services/requests/index.ts}`, and it **keys on `request.update`/`updateMany`, not on the status literal** — the step says so explicitly and explains why the literal form is noise. Scan precision settled by the user's own grep this session (3 hits / 2 files on `request.update*`; 7 files of noise on the literal). Not re-run. |
| **V-5** — step 1-4 seeds ≥3 rows | **YES, PASS** | Step 1-4 now names the one-row problem, requires ≥3 seeded rows with at least one destined to become a tombstone, and compares `count(*)`, `count("storageKey")` and every key across the push. |

### Claims carried forward from pass 1 — NOT re-litigated

C-1, C-2, C-3, C-5, P-2, P-3, P-4, P-5, the no-tenth-reader sweep, the import-graph acyclicity, the
CANCELLED-is-terminal check, the `pnpm check` scope claim, the download route's `export const GET`
auth (checked per the #290 rule), the detail-page action names, and C-4's no-seed-change finding all
stood as PASS in pass 1 and were re-confirmed only where pass-2 work happened to touch them
(`approvals.ts:335-345` and `requests/index.ts:185-200` were re-read; both match the plan verbatim).
The pass-1 evidence table is preserved below the line in this file's history — nothing in it changed.

### Dimension findings

Dimension findings:
- Infra fit: PASS — `validate-plan-artifact.mjs` returns 0 failures / 0 warnings on the revised
  1284-line file; every path and line reference touched this pass (`approvals.ts:207-216`, `:335-345`,
  `requests/index.ts:185-200`, `apply.ts:39-60`, `approval-self-guard.test.ts:20-145`) resolves and
  matches the plan's description.
- Test coverage: PASS — the two pass-1 gaps are closed with gates that are mechanically sound, not
  nominal: the queue mirror now has a mutation-sensitive assertion at the right object, and every
  terminal trigger has an argument-asserting gate plus a static tripwire against a fourth writer.
- Breaking changes: PASS — unchanged from pass 1; no new public surface was introduced by the
  revision beyond `cancelRequest`'s best-effort side effect, which Public Contracts now lists.
- Security surface: PASS — the F3 read at `approvals.ts:214` remains deliberately unfiltered and is
  now mutation-gated at reader #1 (AC-2) **and** reader #2 (step 22). No new trust boundary. Named
  residual unchanged: `verifiedBy`'s implicit `SetNull` (§8 item 2).
- Section 1 Schema feasibility: PASS — V-5 applied.
- Section 2 `documents.ts` feasibility: PASS — unchanged from pass 1.
- Section 3 eviction helper feasibility: PASS — one editorial staleness in P-3 (N-1 below), which
  does not change the helper's shape.
- Section 4 readers + terminal trigger: PASS — step 11a is complete and P-4 no longer transfers the
  `decide()`-specific rationale onto the cancel site.
- Section 5 detail UI feasibility: PASS — unchanged; one stale cross-reference (N-2).
- Section 6 tests feasibility: PASS — steps 20/21/21a/22/23/26a are internally consistent; one
  cross-file helper-reuse wrinkle in step 22 option (a) (N-3).
- Section 7 scripts feasibility: PASS — unchanged from pass 1.

### Pass 2 findings — all editorial, none blocking

None of these change what gets built or what is proven. Each is a one-line edit; fix them opportunistically at EXECUTE rather than running another supplement cycle.

**N-1 — P-3's "Callers" table still lists two callers (§3, P-3, line ~240).** It shows
`deleteRequestDocument` (`keepNewest = 3`) and `decide()` (`0`) and **omits `cancelRequest`**. This is
the surviving old-scope assertion this repo's history predicts. It cannot cause the miss on its own —
D-6, D-6a, P-4's site table, step 11a, Section 4's Verified rule and Risk row 6 all state the
three-trigger truth — but it is the table an executor reads while writing the helper.
*Remedy:* add a third row `| cancelRequest, after the bare status update commits | 0 | requests/index.ts |`.
Same class, same fix: Risk Register row 3 says "`keepNewest` is explicit at **both** call sites" —
there are three (`documents.ts`, `approvals.ts`, `requests/index.ts`); change "both" to "all three".

**N-2 — four stale section/step cross-references (pre-existing, not introduced by the revision).**
- §3 P-2 line ~209: "(§7 step 1)" — means §4 Section 1 step 1-4; §7 is the Risk Register.
- Public Contracts row 1: "§7 step 7" — means §4 Section 7 (steps 28-30).
- §4 step 8 Verify: "(see §7 for the expected pre-existing breakage)" — that text lives in
  §Resume and Execution Handoff.
- §4 step 30 Verify: "§7's Agent-Probe runbook" — the runbook is **§5**.
- §4 step 9 Verify: "the AC-3 unit suite from step 18" — the AC-3 suite is **step 23** (step 18 is the
  detail-page UI).
- §4 step 19 Verify: "the AC-5 e2e from step 22" — the AC-5 e2e is **step 27** (step 22 is the queue
  mirror).
*Remedy:* correct the six pointers. Low severity, but two of them would send an executor to the wrong
gate when deciding whether a section is VERIFIED.

**N-3 — step 22 option (a) needs a local copy, and Test Infra note 1 forbids the promotion.** Step 20
builds the `where`-honourer *inline in `approval-self-guard.test.ts`*; step 22 option (a) says "reuse
step 20's helper … here", i.e. in `approval-queues.test.ts`, a different file. Test Infra note 1 says
promotion to a shared `tests/unit/helpers/` file is explicitly **not** done in this issue.
*Remedy:* one clause in step 22 — "option (a) means a local copy of the same helper in
`approval-queues.test.ts`; duplication at two callers is deliberate per Test Infra note 1, which
promotes only at a third." Option (b) is unaffected and is fully self-contained.

**N-4 — the completion ledger still reads AC-1..AC-9.** §Phase Completion Rules: "every AC-1..AC-9 row
in §Verification Evidence has a recorded outcome". AC-10 was added at pass 1 and is excluded by that
range, so the plan could be declared COMPLETE with the terminal-trigger gates unrecorded — the exact
class of omission AC-10 exists to prevent.
*Remedy:* change to `AC-1..AC-10`. This is the highest-value of the four editorial fixes.

**N-5 — the tripwire's scan root is narrower than the evidence base (advisory).** Step 26a scans
`src/lib/server/`, but the grep that established the two-file set spanned `src/lib` **and**
`src/routes`. A future terminal write placed directly in a `+page.server.ts` would be invisible to the
tripwire. Zero such writers exist today, and `rbac-no-rank-helpers.test.ts` — the cited precedent —
already walks all of `../../src`.
*Remedy:* scan `src/` (or `src/lib/server` + `src/routes`) and keep the same two-file assertion.

### Execute-agent instructions

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | The REJECTED trigger case must pass a non-empty `note` — `decide()` refuses REJECTED/RETURNED without one (`approvals.ts:240-243`) and would 400 before reaching the transaction, making the trigger assertion unreachable. | Writing step 21a's REJECTED case |
| E2 | The PENDING-advance negative case needs a **multi-stage** `steps` fixture; the existing `:57` fixture has one MAKE step and therefore closes the request on any APPROVED decision. | Writing step 21a's negative case |
| E3 | Apply N-1..N-4 as one-line edits when you first open the affected section. Do not open a supplement cycle for them. | Section 3 / Section 4 / Section 6 entry |
| E4 | The `vi.mock('$lib/server/services/requests/documents', …)` factory replaces the whole module. If Section 4 ever adds a second import from that module into `approvals.ts`, extend the factory in the same commit or the suite dies on an undefined export. | Any later edit to `approvals.ts` imports |

### Known Gaps (not counted toward the gate)

- `scripts/**` has no automated harness in this repo. AC-7/AC-9 are correctly Agent-Probe with an
  exact runbook, not Known-Gap. Backlogged as Test Infra note 2.
- Process death between the status commit and the eviction call leaves that request's tombstoned bytes
  unreclaimable. No re-drive exists and none is proposed. Accepted as a named residual — a
  storage-reclamation miss, not a security or audit miss; rows and signers are untouched either way.
- `verifiedBy` implicit `SetNull` (`schema.prisma:876`) — a third route to signer amnesia. Already an
  explicit non-goal (§8 item 2).

### Test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1 | Un-verify → delete → re-upload still bars the signer | Fully-Automated | `pnpm test tests/unit/approval-self-guard.test.ts` — `decide — the F3 bar survives soft-delete (#299)` | B |
| AC-2 | `decide()`'s document read stays unfiltered; adding `where: { deletedAt: null }` at `approvals.ts:214` turns it red | Fully-Automated | same suite, using the step-20 `where`-honouring mock | B |
| AC-2 (queue mirror) | `approvals.ts:343` stays unfiltered too | Fully-Automated | `pnpm test tests/unit/approval-queues.test.ts` — step 22, `where`-honouring copy **or** `not.toHaveProperty('where')` on the captured `findMany` args | B |
| AC-3 | FIFO cap evicts the oldest tombstoned FILE, never a row; unlink precedes null | Fully-Automated | `pnpm test tests/unit/requests-documents.test.ts` — `FIFO byte eviction (#299)`, incl. `invocationCallOrder` | B |
| AC-3 / D-6 | `keepNewest = 0` evicts every tombstoned file; live docs untouched | Fully-Automated | same describe | B |
| AC-3 / P-3 | unlink rejects → `update` not called for that row, loop continues | Fully-Automated | same describe | B |
| AC-10 (decide) | APPROVED and REJECTED decisions actually CALL `evictTombstonedBytes(req.id, 0)` — arguments asserted; a PENDING advance does not | Fully-Automated | `approval-self-guard.test.ts`, module-mocked `requests/documents` (step 21a) | B |
| AC-10 (cancel) | CANCELLED calls `evictTombstonedBytes(id, 0)` once; the 400 refusal path does not | Fully-Automated | new `cancelRequest` describe — the first test this function will have (step 21a) | B |
| AC-10 (tripwire) | No unlisted writer of a terminal `Request.status` | Fully-Automated | static scan in the `rbac-no-rank-helpers.test.ts` shape, keyed on `request.update`/`updateMany` (step 26a) | B |
| AC-4 | Bar holds after the signed file's bytes were evicted | Fully-Automated | `approval-self-guard.test.ts` — tombstone with `storageKey: null` | B |
| D-1 | Verifying a tombstone rejects 409; `update` never called | Fully-Automated | `pnpm test tests/unit/requests-documents.test.ts` | B |
| AC-6 | Cap counts live documents only | Fully-Automated | `requests-documents.test.ts` — asserts the filtered `_count` select | B |
| AC-8 | Chip/badge count live docs while `documents` still carries tombstones | Fully-Automated | `approval-queues.test.ts` — both halves in one case | B |
| AC-5 | Live list vs history view vs download control; v1 route agrees | Fully-Automated (E2E) | `pnpm test:e2e tests/e2e/request-documents.spec.ts` | B |
| AC-5 / D-3 | Tombstoned doc's download URL returns 200 while bytes survive | Fully-Automated (E2E) | same spec | B |
| AC-7 | Sweep does not flag surviving tombstoned files as orphans | Agent-Probe | §5 runbook — `pnpm tsx scripts/sweep-orphan-uploads.ts --grace-minutes=0`; FAIL = TypeError or a tombstoned file listed | A |
| AC-9 | `prod-delete.ts` collects every key, tombstoned or not | Agent-Probe | §5 runbook — `pnpm tsx scripts/prod-delete.ts employee <id> --execute`; FAIL = `resolveKey` TypeError | A |
| P-2 / D-4 | `DROP NOT NULL` is non-destructive on a populated table | Hybrid (running DB) | `pnpm db:push` then `docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c '\d request_documents'` + before/after row-count on **≥3 seeded rows** | B |
| regression | No regression across the suite | Fully-Automated | `pnpm format:check && pnpm lint && pnpm check && pnpm test` | A |

gap-resolution legend: A — proven now; B — gate added by this plan's checklist; C — deferred to a
named later plan; D — backlog test-building stub.

Legacy line form:
- F3 bar (`decide`) + terminal triggers: Fully-automated: `pnpm test tests/unit/approval-self-guard.test.ts`
- Queue mirror + chip split: Fully-automated: `pnpm test tests/unit/approval-queues.test.ts`
- Eviction helper + D-1 + AC-6: Fully-automated: `pnpm test tests/unit/requests-documents.test.ts`
- Cancel trigger: Fully-automated: `pnpm test tests/unit/requests-cancel.test.ts` (new file, or a new describe in `requests-documents.test.ts`)
- Fourth-writer tripwire: Fully-automated: `pnpm test` (static scan)
- Detail page / history view: Fully-automated: `pnpm test:e2e tests/e2e/request-documents.spec.ts`
- Schema widening: hybrid: `pnpm db:push` + `psql \d request_documents` — precondition: `veent-db-5434` up with ≥3 seeded `request_documents` rows
- `scripts/**`: agent-probe: §5 runbook, both probes, output recorded verbatim

Open gaps:
- N-1 — P-3's caller table lists two callers; Risk row 3 says "both call sites" (editorial, one row + one word)
- N-2 — six stale section/step cross-references (editorial)
- N-3 — step 22 option (a) implies a cross-file helper reuse that Test Infra note 1 defers (one clause)
- N-4 — §Phase Completion Rules still reads `AC-1..AC-9`, excluding AC-10 (one range)
- N-5 — the step 26a scan root is `src/lib/server/` while the establishing grep covered `src/routes` too (advisory)
- Residual (accepted): process death between status commit and eviction leaves unreclaimable bytes
- Residual (accepted, pre-existing non-goal): `verifiedBy` implicit `SetNull`

What this coverage does NOT prove:
- `pnpm test` / `pnpm check`: nothing about `scripts/**` or `prisma/**` — neither is in the
  `svelte-check` include. A green check is never evidence for AC-7 or AC-9.
- The unit gates mock Prisma. They prove the *query shape* the service builds and the *branching* on
  the returned rows; they do **not** prove Postgres applies `where: { deletedAt: null }` as expected,
  nor that the composite index is used, nor that a filtered `_count` compiles at the DB.
- The `where`-honouring mock proves sensitivity to a filter added at `approvals.ts:214`, and step 22
  proves it at `approvals.ts:343`. **No other reader has that sensitivity** — the seven remaining
  readers are proven only by their own behavioural assertions and by `pnpm check`'s nullability audit.
- The AC-10 trigger gates prove the call happens with `(id, 0)` at all three terminal statuses **in a
  mocked module**. They do not prove the real helper runs to completion at those sites, nor that the
  `.catch(console.error)` swallows what it should.
- The step 26a tripwire proves no new terminal writer appears **in its scan root**. Per N-5 that root
  is `src/lib/server/` only — a writer added under `src/routes/` would pass unnoticed.
- The AC-3 suite proves the helper's ordering and its selection set. It proves nothing about real
  filesystem behaviour under concurrent evictions of the same request.
- The E2E proves the rendered page and the v1 route for one happy path. It does not exercise the FIFO
  cap boundary (4th swap), the terminal eviction, or any concurrent-actor scenario.
- The §5 Agent-Probes prove the two scripts do not crash and do not mis-classify against **one** seeded
  fixture on **one** machine. They are not regression gates — nothing re-runs them on a future change.
- Nothing anywhere covers storage-full / permission-denied unlink behaviour beyond the mocked
  rejection case, nor a concurrent download of a document being evicted.

Gate: PASS — 0 FAILs, 0 blocking CONCERNs. All five pass-1 CONCERNs (V-1..V-5) are closed with
remedies that were checked against source, not taken on the plan's word: the queue-mirror assertion
targets the right object at `approvals.ts:343`, the trigger mock specifier is proven by an existing
alias-mocks-a-relative-import precedent in the same test file, AC-10 proves the trigger rather than
re-proving `keepNewest = 0`, the tripwire keys on `request.update`, and the P-2 proof now rests on ≥3
rows. The five residual findings (N-1..N-5) are documentation consistency only — one stale table, six
stale pointers, one clause, one AC range and one scan root. They change nothing about what is built or
what is proven, and every one of them is contradicted elsewhere in the plan by correct text, so none
can silently mislead. Fix them inline at EXECUTE; do not spend another supplement cycle on them.

Accepted by: session (VALIDATE pass 2) — no CONDITIONAL concerns to accept. N-1..N-5 are recorded as
execute-agent instruction E3, not as accepted gaps.

---

## Autonomous Goal Block

```
SESSION GOAL
Ship issue #299 on branch feat/soft-delete-request-docs-299: RequestDocument rows are soft-deleted
(deletedAt tombstone) and never removed, so the #283/F3 bar cannot be laundered by un-verify →
delete → re-upload. Only bytes may be evicted — FIFO-capped at 3 tombstoned files per request, plus
a full eviction of all tombstoned bytes when the request reaches APPROVED, REJECTED or CANCELLED.
Nine readers are split deliberately: five INCLUDE tombstones, four EXCLUDE.

PLAN
process/general-plans/active/soft-delete-request-documents-299_12-08-26/soft-delete-request-documents-299_PLAN_12-08-26.md
Seven ordered sections: schema -> documents.ts service -> eviction helper -> readers + terminal
triggers -> detail UI -> tests -> scripts. One branch, one PR.

CONTRACT SUMMARY
Gate: PASS (VALIDATE pass 2). Pass 1 was CONDITIONAL with 5 CONCERNs; all five remedies are applied
and were re-verified against source. Every design claim the plan flagged as its own highest risk
already validated PASS in pass 1 (C-1, C-2, C-3, C-5, P-2, P-3, P-4, P-5, no tenth reader) and was
not re-litigated. Five residual findings (N-1..N-5) are documentation consistency only.

FIX INLINE AT EXECUTE (one line each, no supplement cycle)
N-1 P-3's caller table lists two callers - add the cancelRequest row; Risk row 3 "both call sites"
    should read "all three".
N-2 six stale cross-refs: "SS7 step 1"/"SS7 step 7"/"SS7 runbook" mean SS4/SS5/SS-Resume; step 9's
    "AC-3 suite from step 18" is step 23; step 19's "AC-5 e2e from step 22" is step 27.
N-3 step 22 option (a) means a LOCAL copy of the helper in approval-queues.test.ts - Test Infra
    note 1 defers promotion to a shared file until a third caller.
N-4 Phase Completion Rules still says AC-1..AC-9 - must be AC-1..AC-10 or the trigger gates can go
    unrecorded. Highest-value of the four.
N-5 step 26a scans src/lib/server only; the establishing grep covered src/routes too (advisory).

EXECUTE-AGENT NOTES
The REJECTED trigger case needs a non-empty note or decide() 400s before the transaction.
The PENDING-advance negative case needs a multi-stage steps fixture; the existing :57 fixture
closes the request on any APPROVED decision.
vi.mock of $lib/server/services/requests/documents replaces the whole module - extend the factory
if approvals.ts ever imports a second export from it.

AUTONOMY RULES
Follow the plan's checklist order exactly. Do not relitigate D-1..D-6 or I-1..I-6 — they are locked.
Never apply a uniform where: { deletedAt: null }; the five INCLUDE sites are the safety property.
A `!` on storageKey anywhere in src/ is a plan violation — work through the pnpm check redness.
Record probe output verbatim; "ran it, looked fine" is not evidence.

HARD STOPS
- Any deviation from the nine-reader table.
- Running prod-delete.ts against anything but the local dev database.
- Marking a section VERIFIED without running its gate — CODE DONE is the honest status.
- Pushing storageKey String? -> String back after any eviction has run: that is a data decision.

GATES
pnpm format:check && pnpm lint && pnpm check && pnpm test && pnpm test:e2e
Plus both §5 Agent-Probes for AC-7 and AC-9. One pre-existing a11y lint warning in
CalculatorWindow.svelte is expected.

NEXT PHASE
EXECUTE. The contract is PASS - start at §4 Section 1 step 1. Apply N-1..N-5 inline as you pass
through the affected sections.

EXECUTE START
git switch feat/soft-delete-request-docs-299 && ./start.sh
```
