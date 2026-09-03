---
name: spec:299-soft-delete-request-documents
description: "Soft-delete RequestDocument rows instead of hard-deleting them, FIFO-cap the underlying FILES at 3 per request, and never evict rows — so clearing a #283/F3 sign-off and re-uploading cannot launder who signed a document"
keywords: request documents, soft delete, tombstone, FIFO, verifiedById, verifiedAt, document history, storage sweep, orphan uploads, F3 bar, separation of duties
date: 12-08-26
issue: 299
---

# SPEC — #299 Soft-delete request documents with a FIFO byte cap

## Summary

Today, deleting a supporting document on a request permanently erases the row — including
`verifiedById`, the field that records who signed off on it. #283 built a rule that says
"whoever signs a document may not also decide the request it supports" (the F3 bar), but
that rule reads a value that can be made to disappear: an approver clears their own
sign-off, the requester (who owns the delete action) removes the now-unverified document,
re-uploads a replacement, and the signature is gone — the bar never fires. This change
closes that gap by never actually deleting a document's row. Instead, a "delete" marks the
row as removed (a tombstone) while keeping every fact about it, including who signed it.
Only the underlying file on disk is allowed to disappear, and only after three newer files
have already replaced it — so storage does not grow forever, but the audit trail does.

## User Stories / Jobs To Be Done

### US-1 — Requester swaps a wrong file without losing their edit history
**As a** requester whose supporting document was rejected or was the wrong file, **I want**
to delete it and upload the correct one, **so that** my request keeps moving without me
needing anyone's help to fix a simple mistake.

### US-2 — Approver's signature cannot be erased by someone else's cleanup
**As an** approver who signed off on a document, **I want** my sign-off to remain provable
even after the requester deletes and replaces that document, **so that** the person I
verified for cannot use a delete-and-reupload trick to make themselves eligible to decide
their own request.

### US-3 — Auditor can reconstruct who signed what, later
**As** someone auditing a request after the fact, **I want** the document history to show
every document that was ever attached — including removed ones and who verified each —
**so that** I can answer "did anyone improperly decide their own evidence?" months later,
not just at the moment it happened.

### US-4 — Storage does not grow without bound
**As the** system operator, **I want** old, superseded document files to eventually be
removed from disk, **so that** storage cost does not grow forever just because requesters
keep correcting mistakes.

## What The User Wants (Behavioral Outcomes)

- Deleting a request document never fully erases its record. The record (who uploaded it,
  who signed it, when) survives forever.
- A deleted document becomes a **tombstone**: it still shows up in the request's document
  history, still names who signed it (if anyone did), but has no file to download.
- Files are capped, not rows: at most 3 tombstoned documents per request keep their actual
  file. When a 4th document is soft-deleted, the **oldest tombstoned file** (not row) has
  its bytes removed — the tombstone itself stays, forever.
- The everyday "wrong file, let me swap it" correction flow works exactly as it does today
  from the requester's point of view — same buttons, same result they see.
- After such a swap, an approver who signed the original document is **still barred** from
  deciding that request — this is the regression the issue exists to fix, and it must hold
  even after several swaps.
- The request detail page's downloadable document list excludes tombstones; the request's
  document *history* (a separate, already-decided-to-exist view) includes them.
- A requester is not locked out of attaching new documents to their own request just
  because old, tombstoned ones exist and count toward some limit — the current cap
  (`MAX_REQUEST_DOCS = 5`) must keep meaning "5 live documents," not "5 documents ever."
- Nothing that currently reads a request's documents to decide something (the F3
  same-actor bar, the storage cleanup sweep, the "N documents" count shown to approvers)
  may silently start treating tombstones the same way the download list does — each reader
  has a stake in the answer and several of them need the OPPOSITE answer from each other.

## Flow / State Diagram

### A. The swap that must not launder a signature (the regression this issue fixes)

```
 Approver signs Document A (verifiedById = approver, verifiedAt = now)
          |
          v
 Approver clears sign-off ("un-verify")     -- verifiedAt -> null
          |                                     verifiedById SURVIVES (#283/D11, already shipped)
          v
 Requester deletes Document A                -- TODAY: hard delete, verifiedById is GONE
          |                                     UNDER #299: soft delete only. Row becomes
          |                                     a tombstone. verifiedById is UNCHANGED.
          v
 Requester uploads Document B (replacement)
          |
          v
 Approver attempts to decide the request
          |
          v
   TODAY: allowed (their signature vanished with the row) <- THE BUG
   UNDER #299: still REFUSED — F3 bar still sees the approver
               in verifiedDocActorIds via the tombstoned row
```

### B. FIFO byte cap — rows forever, files capped at 3

```
 Request has documents, each soft-delete adds one to the "tombstoned" set
 (ordered oldest -> newest by when they were soft-deleted)

   tombstoned: [ ]                     -- 0 tombstones, all files present
        |  swap 1
        v
   tombstoned: [A]                     -- file A still on disk
        |  swap 2
        v
   tombstoned: [A, B]                  -- files A, B still on disk
        |  swap 3
        v
   tombstoned: [A, B, C]               -- files A, B, C still on disk (at the cap)
        |  swap 4
        v
   tombstoned: [A, B, C, D]            -- 4 rows, but only 3 files may survive
                    |
                    v
        oldest tombstoned FILE (A's bytes) is deleted from disk.
        Row A is UNCHANGED — still a tombstone, still names its signer.
        Rows B, C, D keep their files.
```

### C. Same array, opposite answers — the reader split

```
                     RequestDocument rows for a request
                    (some live, some tombstoned, some with
                     bytes evicted, some without)
                                  |
        +---------+---------+---------+---------+
        |         |         |         |         |
        v         v         v         v         v
   decide()   pending-   detail page  detail page   storage
   F3 bar     queue      DOWNLOAD     HISTORY        sweep /
   (approvals badge/     list          panel          prod-delete
    .ts)      count                                   (byte cleanup)
      |          |            |            |              |
   INCLUDE    matches      EXCLUDE      INCLUDE         INCLUDE
  tombstones  decide()     tombstones   tombstones     tombstones
  (this is    (same        (nothing              (must find every
   the whole   guard,       to download)           storageKey that
   point)      same                                 still points at
               answer)                              a real file, to
                                                      avoid orphans)

   A single `where: { deletedAt: null }` applied uniformly to all five
   silently reopens the exact bypass this issue exists to close.
```

## Acceptance Criteria (Testable Outcomes)

Scenario names are drawn from the existing test surface identified in RESEARCH
(`tests/unit/requests-documents.test.ts`, `tests/unit/request-documents.test.ts`,
`tests/unit/approval-self-guard.test.ts`, `tests/unit/approvals.test.ts`,
`tests/unit/proposal-queue.test.ts`, `tests/unit/storage.test.ts`) plus new cases
grounded in those same files/suites. No scenario names a file that does not exist today
without saying so explicitly.

**AC-1 — Un-verify → delete → re-upload no longer erases the signer (the core regression).**
Given an approver has signed a document, cleared the sign-off, and the requester has
deleted then replaced it, when the approver attempts to decide the request, then the
decision is still refused. This test must fail against `main` today (per the issue's own
acceptance bullet) and pass after this change.
- proven by: new case in `tests/unit/approval-self-guard.test.ts › canActOnStage — the
  document-verifier bar (#283/F3)` (sibling of the existing `survives un-verifying the
  document (#283/AC-28)` case, extended to also survive a delete-and-reupload)
- strategy: Fully-Automated (unit)

**AC-2 — `decide()`'s own document read still includes a tombstoned signer (the missing
mutation coverage RESEARCH found).**
Given `decide()`'s F3 documents query, when a document is soft-deleted, then the query
result used to build `verifiedDocActorIds` must still contain that document's
`verifiedById` — i.e. a mutation that adds `where: { deletedAt: null }` (or equivalent) to
that specific query must turn this test red. RESEARCH confirmed no test in the repo
currently fails under that exact mutation.
- proven by: new case in `tests/unit/approvals.test.ts › decide` — asserts the F3 bar
  fires using a request whose only verified document is a tombstone (not merely a
  cleared-but-still-live one, which AC-1/AC-28 already cover)
- strategy: Fully-Automated (unit) — this is a mutation-style assertion, not a coverage
  percentage; it is written to fail specifically against the uniform-filter trap.

**AC-3 — The FIFO cap evicts the oldest tombstoned FILE, never a row.**
Given a request with 3 tombstoned documents (files A, B, C still on disk, oldest-to-newest
A, B, C), when a 4th document is soft-deleted, then file A's bytes are removed from disk,
row A remains as a tombstone (unchanged: same `verifiedById`, same `fileName`, same
`uploadedAt`), and files B, C, and the newly-tombstoned D keep their bytes.
- proven by: new suite in `tests/unit/requests-documents.test.ts` — `FIFO byte eviction
  (#299)` — asserts disk-eviction call is made for the oldest tombstoned file only, and
  that the row survives the delete call
- strategy: Fully-Automated (unit)

**AC-4 — The swap survives 4+ iterations with the bar still holding.**
Given the AC-1 scenario repeated across 4 soft-delete/re-upload cycles (so the FIFO cap has
fired at least once), when the original signer attempts to decide the request, then they
are still refused — the eviction of their file's bytes does not affect the row the F3 bar
reads.
- proven by: new case in `tests/unit/approval-self-guard.test.ts` combining AC-1 and AC-3 —
  "the bar survives FIFO byte eviction of the signed file"
- strategy: Fully-Automated (unit)

**AC-5 — The request detail page's download list excludes tombstones; a separate history
view includes them.**
Given a request with both live and tombstoned documents, when the requester or an approver
opens the request detail page, then the downloadable-documents list shows only live
documents, and the document history (a distinct, already-decided-to-exist section) lists
every document ever attached, tombstoned ones included, each naming its signer if one
exists and offering no download control.
- proven by: `tests/e2e/request-documents.spec.ts` — new spec, `tombstoned documents show
  in history without a download link` (no such spec file exists today; RESEARCH found no
  e2e coverage of request documents at all — this is new ground, flagged, not invented
  test-file fiction)
- strategy: Fully-Automated (E2E) — this is the one criterion in the set that a unit test
  cannot carry alone: the claim is about what is and is not rendered as a clickable link.

**AC-6 — Tombstones do not lock a requester out of their own request.**
Given a request with 3 tombstoned documents, when the requester uploads new documents,
then they may still attach up to `MAX_REQUEST_DOCS` (5) **live** documents — the cap counts
live documents only, not tombstones.
- proven by: extends `tests/unit/request-documents.test.ts › assertValidRequestUploads ›
  counts documents already attached to the request toward the cap` with a case where
  tombstoned documents exist and are excluded from the count
- strategy: Fully-Automated (unit)

**AC-7 — The storage cleanup sweep finds every file that still exists, tombstoned or not.**
Given a request with tombstoned documents whose files have NOT yet been FIFO-evicted, when
`scripts/sweep-orphan-uploads.ts` runs, then it does not flag those files as orphans — its
"known" set is built from every `RequestDocument.storageKey` regardless of soft-delete
state.
- proven by: manual run of `scripts/sweep-orphan-uploads.ts` against a seeded tombstone
  fixture (not typechecked by `pnpm check`, per the repo's own script-coverage gap — must
  be proved by execution, not by a green typecheck)
- strategy: Agent-Probe — `scripts/**` is outside `pnpm check` and has no existing unit
  harness; RESEARCH could not confirm any automated coverage exists for this script today.

**AC-8 — Approvers' "N documents" count and unverified badge count only live documents.**
Given a request with 2 live and 2 tombstoned documents, when the approvals list computes
its document count chip, then it shows 2, not 4 — matching what the approver can actually
open and act on.
- proven by: new case alongside the existing `unverifiedCount` usage in
  `requests/approvals/+page.svelte`'s data — surfaced via a new
  `tests/unit/approval-self-guard.test.ts` or `proposal-queue.test.ts` case asserting the
  count-producing query excludes tombstones (exact host suite TBD at PLAN time; RESEARCH
  found no existing unit test for this specific chip)
- strategy: Fully-Automated (unit)

**AC-9 — `prod-delete.ts`'s employee-purge sweep still finds every file it must delete.**
Given an employee being purged who has both live and tombstoned request documents, when
`scripts/prod-delete.ts` collects `storageKey`s to delete, then it collects all of them —
tombstoned or not — so no file is left behind after the employee's data is purged.
- proven by: manual run against a seeded fixture, same caveat as AC-7 — `scripts/**` is
  untypechecked and RESEARCH found no existing automated harness for `prod-delete.ts`
- strategy: Agent-Probe

## Out Of Scope

1. **A `RequestDocumentVerification` history table** (one row per sign-off). This issue's
   own text names it as the "upgrade path" for the *separate*, already-accepted #283/D11
   ceiling — a second signer overwriting `verifiedById` and forgetting the first signer.
   Soft-delete does not touch that ceiling; it remains open.
2. **`verifiedBy`'s `SetNull` relation behavior.** `schema.prisma:876` gives the
   `verifiedBy` relation no explicit `onDelete`, so Prisma defaults to `SetNull` — deleting
   a User nulls `verifiedById` on every document they signed, which is a third route to the
   same "the bar forgets a signer" outcome. #299 does not name this and this SPEC does not
   resolve it; it is flagged in Risks below as a residual gap, matching the shape of the
   already-accepted #283/D11 residual.
3. **The delete-lock key itself** (`if (doc.verifiedAt) error(409, ...)`). The issue
   explicitly keeps this as-is; it correctly blocks removing a *currently* verified
   document, and this issue is only about what happens once a sign-off is cleared.
4. **Rewriting the delete authorization model.** Delete stays owner-only
   (`employeeId === doc.request.employeeId`); this issue does not add a second authorized
   deleter or change who may delete.
5. **Changing `MAX_REQUEST_DOCS`'s numeric value.** It stays 5; only what it *counts*
   changes (live documents, not all documents ever).
6. **A database-level constraint enforcing the FIFO cap or the row-immortality rule.**
   Enforced in application code only, consistent with how this repo already enforces
   similarly-shaped rules (e.g. #283/D4's empty-role-set ban).

## Constraints

**User decisions (given — not to be re-opened):**

- Soft-delete the `RequestDocument` row rather than hard-deleting it.
- FIFO-cap the **files** at **3** soft-deleted per request; the 4th swap hard-deletes the
  oldest FILE's bytes, not the row.
- Rows are kept **forever** as tombstones. Rows are never FIFO'd — evicting the oldest row
  would launder the very signature this issue exists to protect.
- A tombstone still appears in the request's document history, still names who signed it,
  but has no downloadable file.

**System / technical constraints (from RESEARCH):**

- `RequestDocument` has no soft-delete precedent anywhere in the schema today — no
  `deletedAt`/`archivedAt` field exists on any model. The 12 `isActive Boolean` models in
  this schema are a *deactivation* pattern (no timestamp, no ordering key) and cannot be
  copied verbatim for a FIFO-ordered tombstone.
- `RequestDocument` is indexed only on `requestId`; there is no index on `uploadedAt` or on
  a soft-delete marker, so FIFO ordering currently has no supporting index.
- `getRequestDocument` (`documents.ts:147`) is a three-caller choke point shared by
  `setRequestDocumentVerified`, `deleteRequestDocument`, and the v1 download route
  (`api/v1/requests/[id]/documents/[docId]/+server.ts`). Whatever this change decides a
  tombstone means for lookup (404 vs. found-but-marked), it decides it for all three
  callers at once.
- The v1 download route is a real, separately-reachable URL. Hiding a download link in the
  Svelte detail page does not, by itself, stop that route from serving bytes for a
  tombstoned document whose file has not yet been evicted.
- `scripts/sweep-orphan-uploads.ts` and `scripts/prod-delete.ts` both read `storageKey` off
  every `RequestDocument` row directly; neither is covered by `pnpm check` (which skips
  `prisma/**` and `scripts/**`), and `prod-delete.ts` carries its own separate copy of
  file-deletion logic rather than calling the shared `deleteStoredFile`.
- The repo uses `prisma db push` with no migration files. A new nullable/optional field
  (e.g. a `deletedAt` timestamp) is purely additive and safe to push; RESEARCH found no
  data-shape reason this would need a migration script, unlike the enum-rename precedent
  noted in `CLAUDE.md`.
- The #236 CI `schema-upgrade` job that pushes against a populated database seeds **zero**
  `RequestDocument` rows. Its populated-DB check will pass for this change **vacuously** —
  it does not exercise this table at all and proves nothing about this specific field.
- No e2e coverage exists today for request documents of any kind, and the seed scripts
  create none — AC-5's e2e spec is new ground, not an extension of an existing spec.
- **Not verified by RESEARCH (state, do not assume):** whether Prisma 5's `_count` supports
  a filtered count (e.g. `_count: { select: { documents: { where: { deletedAt: null } } } }`)
  the way `saveRequestDocuments`'s existing cap check would need for AC-6. If unsupported,
  the cap check needs a separate `count()` query instead of a `_count` selector — a PLAN-time
  detail, not resolved here.
- **Not verified by RESEARCH:** the exact contents of `tests/unit/storage.test.ts` beyond
  the `describe`/`it` names listed in Background — whether `deleteStoredFile` already
  tolerates a missing/already-evicted file gracefully (relevant to AC-3/AC-4 not throwing
  on a double-eviction) was not confirmed by reading the file body.

## Resolved Decisions

All six questions RESEARCH surfaced are now answered — four by default with the user not
objecting, two by explicit choice (D-4, D-6). The core design (soft-delete rows, FIFO-cap
files at 3, rows kept forever) was never in question.

**D-1 — A tombstone cannot be verified or un-verified.** `setRequestDocumentVerified`
refuses on a soft-deleted row. A deleted document must not gain a new signature: doing so
would write a fresh `verifiedById` onto a row nobody can see and silently extend the F3 bar
to an approver who never saw the file. Since all three callers share the
`getRequestDocument` choke point, the refusal belongs at the call site, not in the shared
reader — the delete path and the download route want different answers.

**D-2 — Deleting an already-soft-deleted document is refused with 404.** The row is already
gone from the requester's point of view, so "not found" is honest. It also closes the FIFO
gaming path: a repeated delete of one id cannot force extra eviction cycles.

**D-3 — The download route serves a tombstone while its bytes survive, and 404s once they
are evicted.** This follows the user's own framing: a request with six swaps shows all six
in history, the three most recent still downloadable, the older three as "file removed".
The tombstone is version history, not an erasure — "deleted" means removed from the active
set, not withheld from the record. Enforcement is at the ROUTE, not only in Svelte: hiding
a link does not close a URL, and AC-5 must assert the route.

**D-4 — Byte eviction nulls `storageKey`.** (User's explicit choice.) One column carries
the whole truth: no key means no file, with no second source of truth to drift. The cost is
that `storageKey` becomes nullable and two scripts read it with no typecheck cover — see
"Consequences of D-4" below.

**D-5 — Tombstones do NOT count toward `MAX_REQUEST_DOCS`.** The cap means "5 live
documents", not "5 ever". Counting tombstones would lock a requester out of their own
request after two swaps, which is the flow this whole change exists to protect.

**D-6 — Bytes are evicted when a request reaches a TERMINAL status — APPROVED or
REJECTED — as well as on the 4th swap.** (User's explicit choice.) The FIFO cap alone
never fires on a request that stops moving, so a rejected request would hold its files
forever. Rows and signatures are untouched by this; only bytes go. A request abandoned in
PENDING keeps its files deliberately: it is still live, and there is no terminal event to
hang the eviction on.

### Consequences of D-4 — the untypechecked readers

`storageKey` becomes `String?`, and **two scripts read it that no gate covers.** `pnpm check`
does not typecheck `scripts/**`, and `pnpm lint` catches only orphaned bindings, not type
errors — so nothing in the pipeline will flag either of these. They must be changed by hand
and proved by running them.

- `scripts/sweep-orphan-uploads.ts:29` — `findMany({ select: { storageKey: true } })` feeds a
  `known` Set that decides which files on disk are orphans. A `null` in that set is harmless
  for matching but changes the collection's type.
- `scripts/prod-delete.ts:176` — same read, and it passes the keys into a **private duplicate**
  of `deleteStoredFile`/`resolveKey` (`:59-63`) rather than importing from
  `$lib/server/storage`. A `null` reaching `resolveKey` there is a runtime failure, and the
  change has to be made in both copies.

The seeds create **zero** `RequestDocument` rows, so the #236 populated-database CI job proves
nothing about this table — its check passes vacuously here. Neither script has test coverage.

### Ordering constraint that falls out of D-4

**Eviction must unlink the file BEFORE nulling the key.** Null first and the pointer is
gone while the file remains — a permanent orphan that `sweep-orphan-uploads.ts` can never
reclaim, because the sweep works by matching keys against disk. This ordering is not a
style preference; it is the difference between a reclaimable file and a leaked one.

## Background / Research Findings

Key facts from RESEARCH that shaped these requirements:

- **8 readers, 6 writers of `RequestDocument`; RESEARCH found 5 the issue's own table
  missed:** `saveRequestDocuments`'s `_count.documents` cap check (`documents.ts:92`),
  the `getRequestDocument` three-caller choke point (`documents.ts:147`), the v1 download
  route, both cleanup scripts (`sweep-orphan-uploads.ts`, `prod-delete.ts`), and the
  approvals-list "N documents" count chip (`requests/approvals/+page.svelte:328`).
- **The reader split is the core risk.** `decide()`'s F3 bar and
  `listPendingRequestsForApprover` must INCLUDE tombstones; the detail page's download
  list and the count chip must EXCLUDE them; `deleteRequest`'s storage sweep must INCLUDE
  them. RESEARCH verified this is not hypothetical: adding `where: { verifiedAt: { not:
  null } }` to `decide()`'s documents select leaves **all 1273 existing tests green** — the
  hole is real and currently unguarded by any test.
- `approval-self-guard.test.ts` already has the shape of the needed regression test
  (`survives un-verifying the document (#283/AC-28)`) — AC-1 and AC-2 above extend that
  pattern to cover delete-and-reupload and the exact query-level mutation, respectively.
- **Schema today:** `RequestDocument` has 10 columns, `storageKey` is `NOT NULL`, indexed
  only on `requestId`. Zero existing soft-delete precedent anywhere in the schema.
- **Delete path today** (`documents.ts:203-219`): owner-only, requires PENDING/RETURNED
  status, 409 keys on `verifiedAt` (not `verifiedById`) which is why the bypass exists,
  hard `db.requestDocument.delete`, best-effort `deleteStoredFile`, and an audit `DELETE`
  entry recording only `{requestId, fileName}` — notably not `verifiedById`, so today's
  audit log cannot reconstruct who signed a deleted document either.
- **Migration:** repo uses `prisma db push`, no migration files; a new nullable field is
  additive and safe. The #236 populated-DB CI job seeds zero `RequestDocument` rows, so it
  validates nothing about this specific change.
- **No e2e coverage exists** for request documents at all today, and the seeds create none.
- User's brainstorm/decision input, captured verbatim in intent: "Rows are kept forever...
  Never FIFO'd — evicting the oldest row launders the very signature the F3 bar reads, that
  is the hole being closed." This is the load-bearing design constraint the whole SPEC is
  built around, and it is why OQ-5/OQ-6 above are scoped as *byte*-retention questions, not
  row-retention questions — row retention is not up for discussion.
