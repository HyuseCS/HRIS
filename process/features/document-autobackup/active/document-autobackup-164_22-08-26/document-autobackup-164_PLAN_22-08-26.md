---
name: plan:document-autobackup-164
description: "Automatic nightly backup of every employee/request document to a local or S3-compatible destination, with in-app schedule, retention, and run history (#164)"
date: 22-08-26
feature: document-autobackup
metadata:
  node_type: memory
  type: plan
---

# Automatic Document Backup (#164)

**Date**: 22-08-26
**Branch**: `feat/document-autobackup-164` (off `staging`)
**Complexity**: COMPLEX — new schema, new script, new settings surface, new security boundary
**Status**: ✅ EXECUTED — shipped on PR #322, awaiting merge to `staging`

> **This plan is a design record, not a work queue.** Every phase below is done. The paired
> `document-autobackup-164_REPORT_22-08-26.md` is the record of what was actually built and
> verified, and it takes precedence wherever the two disagree. Do NOT start at Phase 0.
>
> Remaining work is the three known gaps only, all owner/environment-blocked and filed under
> `process/features/document-autobackup/backlog/`: live S3 destination write, prod
> upload-volume verification (including the pre-cutover migration), and restore tooling.
> The validate gate stands at CONDITIONAL because the S3 path has never been written to live.

---

## TL;DR

A nightly cron script copies every document byte-file out of `UPLOAD_DIR` into a
per-organization backup tree at a configurable destination, writes a `manifest.json`
describing every file (and every row whose bytes are gone), records the outcome as a
`BackupRun` row, prunes old runs to the configured retention, and notifies the org's
system admins when a run is not clean. Schedule, retention, enable/disable and destination
kind are edited in a new `/settings/backup` page. Credentials are env-only. No archive
format, no download button, no restore tooling.

---

## 1. Context and Goals

### The problem

Issue #164: *"Automatically back up every employee document (201 file attachments,
uploads, supporting docs). Implement backup destination options (cloud, etc.). Frequency
must be configurable (i.e. every # days)."*

Today document **bytes** live only on local disk under `UPLOAD_DIR`
(`src/lib/server/storage.ts:7-9`). They are never in Postgres and never in object storage.
A `pg_dump` backs up the metadata rows and loses every actual file. There is no second
copy of any contract, government ID or exit document in the system.

### Goals

| # | Goal |
|---|---|
| G1 | Every `EmployeeDocument` and every `RequestDocument` byte-file reaches a second location, unmodified, on a schedule |
| G2 | The copy is self-describing — a human with only the backup can tell whose file each blob is |
| G3 | Frequency (every N days) and retention (keep last K) are edited in the app, not in code |
| G4 | Destination is selectable: local directory now, S3-compatible object storage behind config |
| G5 | A failed or partial run is visible to a human without reading a log file |
| G6 | A backup run can never damage, move or delete anything under `UPLOAD_DIR` |

### Non-goals — see §14 for the full out-of-scope list

Restore tooling, database dumps, incremental/differential backup, cross-org access,
download-from-UI, encryption at rest beyond what the destination provides.

---

## 2. Decisions (locked by the owner — do not re-open)

| ID | Decision |
|---|---|
| D1 | Destination: working **local** destination (`BACKUP_DIR`) now, **S3-compatible** destination selectable by config, provable by unit test only (no environment exists to e2e it) |
| D2 | Contents: files **plus** a metadata `manifest.json` with per-file SHA-256. **Not** a DB dump |
| D3 | Scope: **both** `EmployeeDocument` and `RequestDocument`. Tombstoned request docs with `storageKey === null` are skipped **and the skip is recorded in the manifest** |
| D4 | Schedule: nightly cron + in-app interval (`every N days`) and retention (`keep last K`). Script exits doing nothing when not due; prunes beyond K |

---

## 3. Architecture Decisions

### AD-001 — A backup is a directory, not an archive (A1: ACCEPTED)

`<destination>/<orgId>/<runId>/manifest.json` + `<destination>/<orgId>/<runId>/files/<storageKey>`.

Reasons, in order:

1. **No new dependency.** Nothing in the prod dep list can zip or tar. Adding `archiver`
   or `tar` to a 512MB droplet's image to compress files that are *already* compressed
   (PDF streams, JPEG, PNG, WEBP) buys single-digit percent at best.
2. **No shelling out.** `child_process` + `tar` is a command-injection surface fed by
   user-controlled filenames for no benefit.
3. **Per-file objects are the S3-native shape.** A tar would have to be built in memory
   (or streamed to a temp file, which is the disk-full failure we are trying to avoid)
   before a single PUT. Per-file PUTs need no buffering beyond one 10MB file.
4. **Partial failure stays partial.** One unreadable file costs one manifest entry, not
   the whole archive.

Cost accepted: many small objects; S3 LIST/DELETE for pruning is O(objects). At current
scale (hundreds of files) this is irrelevant.

### AD-002 — No download-from-UI (A2: ACCEPTED)

`/settings/backup` shows schedule + run history only. There is deliberately **no** control
that streams a backup to a browser.

A "download the whole backup" button would be a single authenticated request that exfiltrates
every government ID, contract and payroll form in the tenant. Every other document route in
this app is per-document and per-employee-scoped (`getEmployeeDocument` re-checks
`employee: { user: { organizationId } }` on every hit). A bulk endpoint would be the only
place where one 403-bypass equals total loss. Retrieval is an operator task done on the box
or in the bucket, where it is already gated by SSH/IAM.

### AD-003 — No "Run backup now" button either

Same page, related decision. A run copies every file in the tenant and can take minutes; it
would either block an HTTP worker on a 512MB box or need a job runner the app does not have.
Cron is the only trigger. The page shows *when the next run is due* instead.

### AD-004 — Credentials are env-only (A3: ACCEPTED)

The DB stores `enabled`, `intervalDays`, `retentionCount`, `destinationKind`. Endpoint,
region, bucket, access key and secret come from `process.env` (§10). Consequences that are
features, not bugs:

- A DB dump/leak contains no bucket credentials.
- The settings page has nothing secret to render, so it cannot leak one.
- Changing the bucket is a deploy action, not a form POST — it cannot be done by a
  compromised CEO session.

### AD-005 — S3 SigV4 with `node:crypto`, no AWS SDK (A4: ACCEPTED, with a named test bar)

`@aws-sdk/client-s3` pulls ~15MB plus a transitive tree into an image whose Dockerfile is
explicitly size-optimised, to use three operations (PUT / LIST / DELETE). SigV4 for these is
~80 lines of HMAC-SHA256 over a canonical request, and `fetch` is built into Node 22 — no
HTTP client dependency either.

**The condition on which this decision rests:** because there is no environment to test
against, the signer must be pinned to signatures we did not compute ourselves. See
`T-U-07`/`T-U-08` in §12 and the hard rule there: expected hex values are **copied from
AWS's published SigV4 test suite / worked examples**, never produced by our own code and
pasted back — a self-generated expectation proves only that the function is deterministic.

If, at EXECUTE time, official vectors cannot be obtained, this decision **flips** and the
S3 destination ships disabled with a backlog stub rather than shipping an unverifiable
signer. Recorded as a hard gate, not a preference.

### AD-006 — Per-organization config and per-organization backup subtree

`BackupConfig` is 1:1 with `Organization` (the shape `PayrollConfig` already uses), and
`BackupRun` carries `organizationId`.

- The settings page is already per-tenant (`load` uses `user.organizationId`); a global
  singleton could not be edited there without letting one tenant set another's schedule.
- A6 requires tenant partitioning inside the archive. Partitioning by `orgId` at the top of
  the tree makes "restore only JoJo Potato" a `cp` of one directory, and makes a
  mis-scoped read visible as a path, not as a filter someone forgot.
- Retention is per tenant, so one org's churn cannot evict another's history.

The script loops orgs; each org is an independent unit of work, lock, run row and failure.

### AD-007 — Concurrency: session-level `pg_try_advisory_lock`, NOT `pg_advisory_xact_lock`

**This is the one place I am deliberately diverging from the direction in A7, and why.**

The precedent cited is real and I am reusing its *key discipline*:

- `src/lib/server/services/timesheets.ts:185`
- `src/lib/server/services/payroll/index.ts:110`

both `await tx.$executeRaw\`SELECT pg_advisory_xact_lock(hashtext(${key})::bigint)\`` inside
a transaction. The #163 lesson recorded in this repo is that **the bug was in the key, not
in the presence of the lock** — two overlapping operations derived different keys, so the
lock was decorative.

What I reuse verbatim: `hashtext(<key>)::bigint` as the lock id, and the discipline of
proving the key is identical for any two operations that must not interleave.

What I do not reuse, and why: the payroll/timesheet call sites wrap a **short write**. A
backup run copies every file in the tenant and can run for minutes. `pg_advisory_xact_lock`
is transaction-scoped, so holding it would mean holding an open Postgres transaction — and
its snapshot, and one of `max_connections=20` — for the entire copy. That is a defect on a
tuned 512MB box, not a style preference. A crashed transaction would also roll back the
`BackupRun` row that is supposed to survive as the record of the crash.

So: **session-level, non-blocking**.

```
SELECT pg_try_advisory_lock(hashtext($1)::bigint)   -- at run start, per org
SELECT pg_advisory_unlock(hashtext($1)::bigint)     -- in finally
```

`try` rather than blocking: if last night's run is still going when tonight's cron fires, the
right behaviour is *skip and log*, not queue a second copy of the same files behind it.
Process exit drops the connection, which drops the lock — so a hard kill cannot wedge the org.

**The exact key, and why two concurrent runs necessarily derive the same one:**

```ts
export function backupLockKey(organizationId: string): string {
  return `document-backup:${organizationId}`
}
```

The key is a function of **one** argument, the organization id, and of nothing else — not
the run id, not the timestamp, not the destination, not the due-date computation. Every
concurrent backup process for org X calls `backupLockKey(X)` and there is no other input
that could differ between them. This is precisely the property #163 lacked: there, the key
was derived from a *range* that two overlapping operations described differently. A pure
one-argument key has no such degree of freedom. `backupLockKey` is exported and unit-tested
(`T-U-05`) so the string cannot drift silently.

**Prisma connection-pool trap (must be handled, or the lock is decorative again):** a
session-level lock lives on one connection. Prisma pools, so `pg_try_advisory_lock` and
`pg_advisory_unlock` could land on different connections and the unlock would silently no-op
(returning `false`). The script therefore constructs its own client pinned to a single
connection:

```ts
new PrismaClient({ datasources: { db: { url: withSingleConnection(process.env.DATABASE_URL!) } } })
```

`withSingleConnection` is a pure helper that appends/overrides `connection_limit=1`,
preserving any existing query string. Unit-tested (`T-U-06`). The script asserts the
`pg_advisory_unlock` result is `true` and logs loudly if it is not.

### AD-008 — Crash safety: the manifest is the completion marker

A `BackupRun` row is created with status `RUNNING` before the first byte is written. Files
are copied. **`manifest.json` is written last.** Then the row flips to `SUCCESS` or `PARTIAL`.

Therefore:

- A backup directory **without** `manifest.json` is by definition incomplete.
- Retention (`runsToPrune`) counts only runs whose status is `SUCCESS` or `PARTIAL`, so a
  half-written directory can never displace a good backup.
- At start of every run, rows still `RUNNING` older than `STALE_RUN_HOURS` (12) are flipped
  to `FAILED` with `error: 'run did not complete (process ended)'`. Their directories are
  removed by the same prune pass as any other non-completed run.

### AD-009 — Pure core, one impure writer (A5: ACCEPTED)

| Layer | File | Rule |
|---|---|---|
| Pure | `src/lib/server/backup/plan.ts` | No `fs`, no `net`, no `db`, no `Date.now()` (time is an argument). 100% unit-tested |
| Signing | `src/lib/server/backup/s3.ts` | `node:crypto` only; pure signer + one thin `fetch` caller |
| Destination | `src/lib/server/backup/destination.ts` | **One** `writeObject` / `listRuns` / `deleteRun` trio, each a `switch (dest.kind)`. No classes, no factory, no registry |
| Orchestration | `src/lib/server/backup/run.ts` | The only place that reads files, writes rows and calls the destination |
| Entry point | `scripts/backup-documents.ts` | Arg parsing, org loop, lock, exit codes. Mirrors `scripts/promote-probationary.ts` |

---

## 4. Data Flow

```
cron (02:30 droplet)
  └─ docker compose run --rm app pnpm exec tsx scripts/backup-documents.ts
       ├─ assertDestinationSafe(UPLOAD_DIR, BACKUP_DIR)     ← refuses before touching anything
       ├─ for each Organization:
       │    ├─ pg_try_advisory_lock(hashtext('document-backup:<orgId>'))   ← skip if taken
       │    ├─ load BackupConfig; isRunDue(config, lastCompletedAt, now)?  ← pure; exit if not
       │    ├─ expire stale RUNNING rows (>12h) → FAILED
       │    ├─ collect documents:
       │    │     EmployeeDocument where employee.user.organizationId = org      (storageKey NOT NULL)
       │    │     RequestDocument  where request.employee.user.organizationId = org
       │    │        ← NO deletedAt filter (see §5 reader note); storageKey === null → skipped[]
       │    ├─ pre-flight free-space check (local dest only)
       │    ├─ create BackupRun { status: RUNNING, runId, destinationKind }
       │    ├─ for each doc:  readStoredFile(key) → sha256 → writeObject(files/<key>)
       │    │        read/write error → failures[] , continue (never abort the whole run)
       │    ├─ writeObject('manifest.json', JSON of §6)          ← LAST
       │    ├─ BackupRun → SUCCESS (0 failures) | PARTIAL (>0 failures)
       │    ├─ prune: runsToPrune(completedRuns, retentionCount) → deleteRun(each)
       │    ├─ notifyMany(ADMINISTER_SYSTEM holders) if PARTIAL or FAILED
       │    └─ pg_advisory_unlock  (finally)
       └─ exit 0 (any org failing → exit 1, so cron mail/log shows it)
```

Nothing in this flow writes to, renames, or unlinks anything under `UPLOAD_DIR`. The only
`UPLOAD_DIR` call is `readStoredFile`.

---

## 5. Schema Changes

`db push` only — no migration files (repo convention). Both models are new, and the one new
enum is new (not a rename), so no `scripts/migrate-*.ts` is required.

### 5.1 New models — append to `prisma/schema.prisma` after the `EmployeeDocument` block

```prisma
// ─── Document backup (#164) ──────────────────────────────────────────────────
// Document BYTES live only on local disk under UPLOAD_DIR — never in Postgres — so a
// pg_dump backs up every document ROW and none of the files. These two models drive a
// nightly cron script (scripts/backup-documents.ts) that copies the files to a second
// location and writes a manifest describing them.
//
// Config is per-organization, not global, for two reasons: the settings page that edits it
// is already tenant-scoped (a singleton could not be edited there without letting one
// tenant set another's schedule), and the backup tree is partitioned by organizationId so
// "restore one tenant" is a directory, not a filter someone has to remember to apply.
//
// CREDENTIALS ARE NOT HERE AND MUST NEVER BE. Endpoint, region, bucket, access key and
// secret come from the environment (BACKUP_S3_*). What is stored is only the KIND of
// destination. A database dump therefore cannot leak the bucket, and the settings page has
// no secret to render.

enum BackupDestinationKind {
  LOCAL
  S3
}

enum BackupRunStatus {
  // Written before the first byte. A row left in this state means the process died — the
  // stale-run sweep at the start of the next run flips it to FAILED.
  RUNNING
  SUCCESS
  // Some files could not be read or written. Deliberately NOT a failure state: the backup
  // that was taken is real and worth keeping, and a silent SUCCESS over unreadable files is
  // exactly the lie this model exists to prevent.
  PARTIAL
  FAILED
}

model BackupConfig {
  id             String                @id @default(cuid())
  organizationId String                @unique
  // Master switch. Off → the nightly script skips this org entirely and records nothing.
  enabled        Boolean               @default(false)
  // "Every # days" from #164. 1 = every night. Measured from the last COMPLETED run
  // (SUCCESS or PARTIAL), not from the last attempt — a failed run must not push the next
  // one a full interval away. Bounded 1–90 at every writer.
  intervalDays   Int                   @default(1)
  // How many completed runs to keep. Pruning happens AFTER a run completes, never before,
  // so a crash mid-run cannot cost the newest good backup. Bounded 1–30 at every writer.
  retentionCount Int                   @default(7)
  destinationKind BackupDestinationKind @default(LOCAL)
  createdAt      DateTime              @default(now())
  updatedAt      DateTime              @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@map("backup_configs")
}

model BackupRun {
  id             String                @id @default(cuid())
  organizationId String
  // Directory / key prefix name, e.g. "2026-08-22T023000Z". Also the ONLY thing the
  // settings page shows about location — never an absolute path, never a bucket name.
  runId          String
  status         BackupRunStatus
  destinationKind BackupDestinationKind
  startedAt      DateTime              @default(now())
  finishedAt     DateTime?
  // Counts, not lists: the per-file detail lives in the backup's own manifest.json, which
  // is the artifact a restorer actually has. Storing filenames here would put document
  // names (which are user-supplied and sometimes sensitive) in a second place for no gain.
  fileCount      Int                   @default(0)
  skippedCount   Int                   @default(0)
  failedCount    Int                   @default(0)
  totalBytes     BigInt                @default(0)
  // sha256 of the serialized manifest. Lets an operator confirm the manifest on the
  // destination is the one this run wrote.
  manifestSha256 String?
  // Operator-facing reason for FAILED/PARTIAL. SANITIZED before storage: never an absolute
  // path, never a bucket/endpoint, never a credential — this string is rendered in the UI.
  error          String?               @db.VarChar(500)

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  // The history table reads newest-first per org; retention pruning reads completed runs
  // per org in the same order. Both are covered by this one index.
  @@index([organizationId, startedAt])
  @@map("backup_runs")
}
```

### 5.2 `Organization` relations — MODIFIED

Add to the relation block at `prisma/schema.prisma:316+`:

```prisma
  backupConfig              BackupConfig?
  backupRuns                BackupRun[]
```

### 5.3 `RequestDocument` schema comment — MODIFIED (mandatory, not cosmetic)

The comment at `prisma/schema.prisma:875-888` states the reader split: *"seven must INCLUDE
tombstones … and four must EXCLUDE them"*. The backup collector is an **eighth includer**.
Leaving the comment saying seven is how the next person concludes their new reader is one of
the four.

Edit the sentence to read:

```
// Only the BYTES may go: `storageKey` is nulled once evicted. Readers are split DELIBERATELY —
// EIGHT must INCLUDE tombstones (decide()'s F3 read, the pending-queue SoD, actBlockedReason, the
// Removed-documents history panel, the request-delete sweep, both storage scripts, and #164's
// backup collector) and four must EXCLUDE them (download list, upload cap, approvals chip,
// detail-page live list). A uniform `where: { deletedAt: null }` reopens the bypass with every
// test green. See process/general-plans/.../soft-delete-request-documents-299_PLAN_12-08-26.md
// for the reader table.
//
// #164: the backup collector INCLUDES tombstones on purpose. A tombstoned row whose bytes are
// still on disk still owns a file that must be backed up — the same reasoning that keeps
// sweep-orphan-uploads.ts unfiltered (#299/AC-7). A tombstoned row whose `storageKey` is already
// NULL has no bytes to copy, and is recorded in the manifest's `skipped` list rather than dropped,
// so a restorer can see the row existed and why nothing was saved for it.
```

---

## Public Contracts

### 6.1 `manifest.json` — the durable contract with any future restorer (D2)

Version it from day one; a restore tool written in 2027 must be able to refuse a shape it
does not understand.

```jsonc
{
  "manifestVersion": 1,
  "runId": "2026-08-22T023000Z",
  "generatedAt": "2026-08-22T02:30:00.000Z",
  "organizationId": "org_seed",
  "organizationName": "Veent",
  "counts": { "files": 412, "skipped": 3, "failed": 0, "totalBytes": 188213404 },
  "files": [
    {
      "source": "employeeDocument",          // "employeeDocument" | "requestDocument"
      "id": "clx…",                          // the row id
      "storageKey": "employees/clx…/9f2e….pdf",
      "path": "files/employees/clx…/9f2e….pdf", // relative to this manifest
      "employeeId": "clx…",
      "employeeNumber": "EMP-015",
      "employeeName": "Dela Cruz, Juan",
      "category": "CONTRACT",                // employeeDocument only; null for requestDocument
      "requestId": null,                     // requestDocument only
      "label": "Signed contract 2026",
      "fileName": "contract-signed.pdf",     // the ORIGINAL upload name (metadata only on disk)
      "mimeType": "application/pdf",
      "size": 184320,
      "uploadedAt": "2026-02-11T03:12:44.000Z",
      "sha256": "3b1f…"                      // of the bytes as written to the destination
    }
  ],
  "skipped": [
    {
      "source": "requestDocument",
      "id": "clx…",
      "reason": "bytes-evicted",             // storageKey === null (#299 tombstone)
      "requestId": "clx…",
      "label": "Medical certificate",
      "fileName": "med-cert.jpg",
      "uploadedAt": "2025-11-02T01:00:00.000Z",
      "deletedAt": "2026-01-04T05:00:00.000Z"
    }
  ],
  "failed": [
    { "source": "employeeDocument", "id": "clx…", "storageKey": "employees/…/…", "reason": "read-error" }
  ]
}
```

Contract rules:
- `path` is always `files/` + `storageKey`, so a restorer needs no name mapping.
- `sha256` is of the bytes actually written, computed from the same buffer that was written.
- `skipped` and `failed` are always present, even when empty (a restorer must not have to
  distinguish "absent" from "none").
- No absolute paths, no bucket name, no endpoint, no credential appears anywhere in the file.

### 6.2 Destination tree

```
<BACKUP_DIR or s3://<bucket>/<prefix>>/
  <organizationId>/
    2026-08-22T023000Z/
      manifest.json
      files/
        employees/<employeeId>/<uuid>.pdf
        requests/<requestId>/<uuid>.jpg
```

### 6.3 Exported TypeScript surface (new)

```ts
// src/lib/server/backup/plan.ts  (PURE)
export function isRunDue(cfg: {enabled: boolean; intervalDays: number}, lastCompletedAt: Date | null, now: Date): boolean
export function runsToPrune<T extends {id: string; status: string; startedAt: Date}>(runs: T[], retentionCount: number): T[]
export function makeRunId(now: Date): string                       // "2026-08-22T023000Z"
export function backupLockKey(organizationId: string): string      // "document-backup:<id>"
export function buildManifest(input: ManifestInput): Manifest
export function assertDestinationSafe(uploadDir: string, backupDir: string): void
export function withSingleConnection(databaseUrl: string): string
export function sanitizeError(message: string, secrets: string[]): string

// src/lib/server/backup/destination.ts  (I/O)
export type Destination = { kind: 'LOCAL'; root: string } | { kind: 'S3'; endpoint: string; region: string; bucket: string; prefix: string; accessKeyId: string; secretAccessKey: string }
export function destinationFromEnv(kind: BackupDestinationKind): Destination   // throws a NAMED, secret-free error when misconfigured
export async function writeObject(dest: Destination, relPath: string, bytes: Buffer): Promise<void>
export async function listRunIds(dest: Destination, organizationId: string): Promise<string[]>
export async function deleteRun(dest: Destination, organizationId: string, runId: string): Promise<void>

// src/lib/server/backup/s3.ts  (PURE signer + one thin caller)
export function canonicalRequest(req: SigV4Request): string
export function stringToSign(canonical: string, amzDate: string, scope: string): string
export function signV4(req: SigV4Request, creds: {accessKeyId: string; secretAccessKey: string; region: string; service: string}, now: Date): Record<string, string>  // → headers
export async function s3Request(...): Promise<void>                // uses global fetch
```

---

## 7. Security (A6 — named gate)

| # | Threat | Control | Where enforced | Proven by |
|---|---|---|---|---|
| S1 | Path traversal writing the destination tree | `resolveWithin(root, rel)` — the containment check `storage.ts:resolveKey` already performs, extracted and exported so there is exactly ONE implementation. Every destination write resolves through it and throws on escape | `storage.ts` (extracted), `destination.ts` (LOCAL branch) | `T-U-01` |
| S2 | Backup written **inside** `UPLOAD_DIR` (self-referential growth; next run backs up the last backup; orphan sweep sees millions of "orphans") | `assertDestinationSafe(uploadDir, backupDir)` refuses when either path equals or is an ancestor of the other, after `path.resolve`. Called **before** any org is processed, so a misconfigured box fails fast and writes nothing | `plan.ts`, called first in `scripts/backup-documents.ts` | `T-U-02` |
| S3 | Backup directory world-readable — 201 files at rest with looser permissions than `UPLOAD_DIR` | Every `mkdir` in the LOCAL branch uses `{ recursive: true, mode: 0o700 }`; every file written with `{ mode: 0o600 }`. The script logs the effective mode of the destination root at start | `destination.ts` | `M10` (manual, `ls -ld`) |
| S4 | Secrets leaked into logs, the UI, or an error string | Three layers: (a) credentials are read into a local `Destination` object and never logged; (b) every error stored on `BackupRun.error` or printed passes through `sanitizeError(message, [accessKeyId, secretAccessKey, endpoint, bucket, backupDir])` which replaces each occurrence with `[redacted]`; (c) the settings page renders `error` only, and never any env value | `plan.ts`, `run.ts`, `+page.server.ts` | `T-U-09`, `M8` (the run-history Error cell) |
| S5 | Unauthorized read/edit of backup config or run history | `requireAnyCapability(user.roles, 'ADMINISTER_SYSTEM')` in `load` **and again inside every form action** — the repo's standing double-guard. `ADMINISTER_SYSTEM` = `SUPER_ADMIN`, `CEO`, documented as *"payroll config, user provisioning, role activation, the settings surface"*, which is exactly what this is. **Not** `OVERRIDE_FINALIZED` — nothing here is irreversible | `src/routes/(app)/settings/backup/+page.server.ts` | `M1`, `T-E-01` |
| S6 | Cross-tenant read — one org's backup containing another's documents | Two independent barriers: the collector queries walk the relation (`employee: { user: { organizationId } }` / `request: { employee: { user: { organizationId } } }`), and the destination path is prefixed with `organizationId`, so a mis-scoped row lands in a visibly wrong directory rather than silently mixing. The run-history query filters on `organizationId` from the session, never from a form field | `run.ts`, `+page.server.ts` | `T-U-10`, `M4` (objects land under `backups/<orgId>/`) |
| S7 | Bulk exfiltration via the app | AD-002: no download route, no bulk endpoint, no run-now. The settings page is read-only about content | — | design |
| S8 | Failure notification leaking content | The notification text is a fixed template with **counts only**: *"Nightly document backup finished with errors (N of M files could not be copied). Open Settings → Document Backup."* No filenames, no employee names, no paths, no destination identity. Link is `/settings/backup`, which is itself capability-gated | `run.ts` | `T-U-11` |
| S9 | Unsigned/replayable S3 request or a signer that silently signs nothing | SigV4 pinned to official published vectors (AD-005); `x-amz-content-sha256` is the real payload hash (never `UNSIGNED-PAYLOAD`); the request fails closed on a non-2xx response | `s3.ts` | `T-U-07`, `T-U-08` |
| S10 | A compromised in-app session redirecting backups to an attacker bucket | Impossible by construction — destination coordinates are env-only (AD-004). The form can only choose `LOCAL` or `S3`, both of which resolve to values the operator set on the box | schema + `destinationFromEnv` | design |

---

## 8. Stability (A7 — named gate)

| # | Failure mode | Behaviour | Proven by |
|---|---|---|---|
| ST1 | Some files unreadable (missing on disk, permission, I/O error) | Recorded in `failed[]` in the manifest and in `BackupRun.failedCount`; run status is **`PARTIAL`**, never `SUCCESS`; admins are notified. The run continues — one bad file must not cost the other 411 | `T-U-03`, `M8` |
| ST2 | Crash mid-run leaves a half-written directory that retention counts as good | `manifest.json` is written **last** (AD-008). `runsToPrune` only considers `SUCCESS`/`PARTIAL` rows. The stale sweep runs at the start of the next run and its two branches are gated **differently** (see E-08 as built): a `RUNNING` row whose destination HAS a manifest is promoted to `SUCCESS`/`PARTIAL` at **any age**, because the per-org advisory lock is held around the whole run and any `RUNNING` row present therefore belongs to a dead process; a row with **no** manifest is flipped to `FAILED` and its directory removed only once it is older than 12h. Without the age-free promotion branch, a crash between the manifest write and the status update left a young `RUNNING` row that `pruneRuns` then deleted — destroying a complete backup | `T-U-04`, `M7`, `backup-run.test.ts` crash-recovery cases |
| ST3 | Concurrent runs (cron overlapping a long run; an operator running it by hand) | `pg_try_advisory_lock(hashtext('document-backup:<orgId>'))`, non-blocking; the second process logs `"org <id>: another backup is already running — skipped"` and moves to the next org. Key derivation is a pure one-argument function, so two processes cannot derive different keys (AD-007, the #163 lesson) | `T-U-05`, `M11` |
| ST4 | Prisma pool puts lock and unlock on different connections | Script's own client is pinned with `connection_limit=1`; the unlock result is asserted `true` and logged loudly if not | `T-U-06` |
| ST5 | Disk full (LOCAL) | Pre-flight: `statfs(BACKUP_DIR)` free bytes must exceed `freeSpaceNeeded(sum(size), retentionCount, existingRuns)` — i.e. `retentionCount + 1` copies on a fresh destination, because pruning happens AFTER the run (E-13) — else the run is refused **before** creating a run directory, recorded as a `FAILED` `BackupRun` row with `"insufficient free space at the backup destination"`, and admins notified. **The whole pre-row section (stale sweep, collector, LIST, free-space check) is wrapped so that ANY failure there still persists that row and notification**; letting it throw left no row and no alert, so the settings page showed nothing and backups could stop silently. If `ENOSPC` still occurs mid-copy, the run aborts, the partial run directory is removed, status is `FAILED`, and **no pruning happens** — a full disk must never be "solved" by deleting the backups we still have | `T-U-12` (no manual step: a real full disk cannot be staged on dev — named residual) |
| ST6 | A run damages `UPLOAD_DIR` | The backup code path contains **no** write, rename, or unlink against `UPLOAD_DIR`. The only call is `readStoredFile`. Enforced by review + a grep gate in the checklist, and proven empirically by the golden tripwire (§13): a sha256 manifest of `UPLOAD_DIR` taken before and after a full run must be byte-identical | `M10`, tripwire |
| ST7 | Destination unreachable (S3 down, `BACKUP_DIR` unmounted) | **As built:** `copyAll` aborts after **5 consecutive** `writeObject` failures. That org's run is then `FAILED` with `"backup destination is unreachable (5 consecutive write failures)"`, sanitized, admins notified, the partial directory removed, and the sweep continues to the next org. Exit code 1 so cron's log shows it. The abort happens **before** the manifest write — writing one would mark an empty directory as a complete backup. A consecutive-failure threshold is used deliberately **instead of** classifying error types: no two S3-compatible providers agree on which status or code means "gone", and a real outage fails on the very first file and never recovers, while genuinely scattered per-file failures do not line up five deep by chance. Scattered failures therefore still produce `PARTIAL`, which is correct — the earlier wording promised "first non-per-file failure aborts", which the code never did: it recorded all 400+ as `failed[]` and called the result `PARTIAL` | `T-U-13`, `backup-run.test.ts` abort + scattered-failure cases |
| ST8 | Clock skew / a cron that missed several nights | `isRunDue` compares `now` against the **last completed** run, so a missed night simply means the next run is overdue and fires. There is no catch-up loop — one backup per night is the whole point | `T-U-14` |
| ST9 | Backup config missing for an org | Treated as `enabled: false` — no row is auto-created by the script. Only the settings page creates one (upsert). An org that never visited the page is never backed up, and the page says so | `M2` (the page states the org has never been backed up) |

---

## 9. File-by-File Change List

Every NEW file carries a reason it cannot be a function in an existing file.

### New

| File | Why it must be new |
|---|---|
| `src/lib/server/backup/plan.ts` | A5 requires the pure logic (due/prune/manifest/keys/containment) to be unit-testable with **no fs, no net, no db**. Placing it in `storage.ts` would give that module a Prisma-shaped dependency it does not have; placing it in `services/` would put it beside modules that all import `$lib/server/db`. It is the only file in the feature with zero I/O and that separation is the point |
| `src/lib/server/backup/destination.ts` | The single `switch (dest.kind)` writer (A5). It is the only file allowed to touch both the filesystem and the network, so it is also the only file that has to be reviewed for path-traversal and credential handling |
| `src/lib/server/backup/s3.ts` | ~80 lines of SigV4 with a distinct test bar (official vectors, AD-005). Mixing it into `destination.ts` would mean the destination writer could not be read without also reading a crypto implementation, and would blur which tests pin which contract |
| `src/lib/server/backup/run.ts` | Orchestration: collect → copy → manifest → status → prune → notify. Cannot live in `scripts/` because it must be importable by tests (`pnpm check` does not even cover `scripts/**`). Cannot live in `services/documents.ts`, which is the per-document CRUD surface used by HTTP routes and must not grow a batch job |
| `scripts/backup-documents.ts` | The cron entry point. The repo's established pattern for recurring work is a one-shot script here (`scripts/README.md:190-235`); the app has no scheduler |
| `src/routes/(app)/settings/backup/+page.server.ts` | New settings route; SvelteKit requires the file |
| `src/routes/(app)/settings/backup/+page.svelte` | New settings route; SvelteKit requires the file |
| `src/lib/server/services/settings/backup.ts` | Config read/write + run history + audit, matching `settings/master.ts`. It is a **service** because the double-guard convention wants the route thin; it is a **new file** rather than a section of `master.ts` because `master.ts` is company/org master data and this is operational job config |
| `tests/unit/backup-plan.test.ts` | Pure-logic gate |
| `tests/unit/backup-s3-sigv4.test.ts` | Signer pinned to official vectors — kept separate so a red here is unmistakably "the signature is wrong", not "the schedule maths is wrong" |
| `tests/unit/backup-destination.test.ts` | LOCAL fs behaviour + S3 request shape against a stubbed `fetch` |
| `tests/e2e/backup-settings.spec.ts` | Capability gate + form round-trip on the new page |

### Modified

| File | Change | Justification |
|---|---|---|
| `prisma/schema.prisma` | Add `BackupDestinationKind`, `BackupRunStatus`, `BackupConfig`, `BackupRun`; add two `Organization` relations; **update the `RequestDocument` reader-split comment from seven to eight includers** (§5.3) | The comment is the repo's only guard against the next reader guessing wrong |
| `src/lib/server/storage.ts` | Extract the containment check in `resolveKey` into an exported `resolveWithin(root, rel)`; `resolveKey` becomes `resolveWithin(UPLOAD_DIR, storageKey)` | Reuse, not reinvention (A5). Without this the backup writer needs a second traversal check, and two implementations of a security check drift |
| `src/routes/(app)/settings/+page.svelte` | Add `{ href: '/settings/backup', title: 'Document Backup', desc: 'Automatic 201-file backups', super: true }` to `cards` | `super: true` filters on `data.isSuperAdmin` = `canAny(roles, 'ADMINISTER_SYSTEM')`, exactly the page's own guard — card and page agree (the #258 lesson) |
| `docker-compose.yml` | Add named volumes `uploads` and `backups`; mount `uploads:/app/uploads` and `backups:/app/backups` on `app` | See §15 blocking finding. `docker compose run --rm app` inherits the service's volumes, so the cron invocation only works if the destination is a mount |
| `.env.dev.example` | Add the `BACKUP_*` block (§10) | Convention: env names are documented here |
| `.env.prod.example` | Add the `BACKUP_*` block (§10, unquoted form) | Same, with the file's no-quotes rule |
| `scripts/README.md` | Add a `## Automatic document backup — backup-documents.ts` section under "Scheduled jobs (droplet crontab)" (§11) | Crontab entries live outside the repo; this file is the only recovery record |
| `.gitignore` | Add `/backups/` beside the existing `/uploads/` | E-01. The dev default `BACKUP_DIR="./backups"` writes real government IDs into the working tree; without this `git add -A` commits them |
| `.dockerignore` | Add `backups` beside the existing `uploads` | E-01. Same bytes must not enter the build context |

### Explicitly NOT created

- No `BackupProvider` interface / class hierarchy / factory. One `switch` (A5).
- No archive/zip/tar dependency (AD-001).
- No `@aws-sdk/*` (AD-005).
- No new UI primitive. The page is assembled from existing components (§13.1).
- No new toast/banner/table/empty-state markup.

---

## 10. Environment Variables

### Add to `.env.dev.example` (dotenv-cli — quoted form matches that file)

```
# ─── Document backup (#164) ──────────────────────────────────────────────────
# Where nightly document backups are written when the destination kind is LOCAL.
# MUST NOT be inside UPLOAD_DIR (or contain it) — the script refuses to start otherwise.
BACKUP_DIR="./backups"
# S3-compatible destination (kind = S3). Endpoint is the full origin, e.g.
# https://sgp1.digitaloceanspaces.com or https://s3.ap-southeast-1.amazonaws.com.
# These are read ONLY from the environment — they are never stored in the database and
# never rendered in the UI.
BACKUP_S3_ENDPOINT=""
BACKUP_S3_REGION=""
BACKUP_S3_BUCKET=""
BACKUP_S3_PREFIX="veent-hris"
BACKUP_S3_ACCESS_KEY_ID=""
BACKUP_S3_SECRET_ACCESS_KEY=""
```

### Add to `.env.prod.example` (docker `--env-file` — NO quotes, per that file's header)

```
# ─── Document backup (#164) ──────────────────────────────────────────────────
# LOCAL destination. Must be a mounted volume (see docker-compose.yml), or the backup
# dies with the container it was written into. MUST NOT be inside UPLOAD_DIR.
BACKUP_DIR=/app/backups
# S3-compatible destination — only needed when the org's destination kind is S3.
# Never stored in the database; never shown in the UI.
BACKUP_S3_ENDPOINT=
BACKUP_S3_REGION=
BACKUP_S3_BUCKET=
BACKUP_S3_PREFIX=veent-hris
BACKUP_S3_ACCESS_KEY_ID=
BACKUP_S3_SECRET_ACCESS_KEY=
```

Also add to `.env.prod.example`, because the pre-existing omission is what makes §15 a
data-loss finding:

```
# Where document bytes are stored. MUST be a mounted volume — without one, every 201 file
# lives inside the container and is destroyed by the next `docker compose up`.
UPLOAD_DIR=/app/uploads
```

---

## 11. Crontab Entry — append to `scripts/README.md`

Insert after the `promote-probationary.ts` section, matching its format exactly:

````markdown
## Automatic document backup — `backup-documents.ts`

Document **bytes** live only on local disk under `UPLOAD_DIR` — never in Postgres — so
`pg_dump` backs up every document row and none of the files (#164). This copies every
`EmployeeDocument` and `RequestDocument` file to a second destination, writes a
`manifest.json` describing each one (employee, category, label, original filename, MIME,
size, upload date, SHA-256), records the outcome as a `BackupRun`, prunes to the org's
retention setting, and notifies that org's Super Admins / CEO when a run is not clean.

Schedule and retention are per organization and edited in the app at **Settings → Document
Backup**. This cron entry only *offers* the script a chance to run each night; the script
itself exits doing nothing when the org's interval has not elapsed.

```
30 2 * * *  cd ~/repos/Veent_HRIS && docker compose run --rm app pnpm exec tsx scripts/backup-documents.ts >> /var/log/veent-backup.log 2>&1
```

Runs 02:30 droplet time — after the 01:00 regularization sweep, so the two never contend for
the 512MB box. `docker compose run --rm` costs no idle RAM.

**`BACKUP_DIR` and `UPLOAD_DIR` must both be mounted volumes** (see `docker-compose.yml`).
A `--rm` container's own filesystem is discarded when it exits, so a backup written to an
unmounted path is deleted the moment the script finishes.

Dry run first when testing (lists what *would* be copied, writes nothing anywhere):

```bash
docker compose run --rm app pnpm exec tsx scripts/backup-documents.ts --dry-run
```

Force a run outside the configured interval (still honours the lock and retention):

```bash
docker compose run --rm app pnpm exec tsx scripts/backup-documents.ts --force
```

Concurrency-safe: each org is held under `pg_advisory_lock` for the duration, so a run that
overruns into the next night causes the next invocation to skip that org rather than copy
the same files twice. Refuses to start at all if `BACKUP_DIR` is inside `UPLOAD_DIR` (or
vice versa) — that configuration makes each night's backup include the previous night's.

Exits 1 if any org's run failed, so a failure is visible in `/var/log/veent-backup.log` and
in cron mail even before anyone opens the app.
````

---

## 12. Implementation Checklist

### Phase 0 — Tripwire (before any edit)

1. Run the golden tripwire snapshot in §13 and commit the outputs to
   `process/features/document-autobackup/active/document-autobackup-164_22-08-26/` as
   `tripwire-before.txt`.

### Phase 1 — Schema

2. `prisma/schema.prisma`: add `BackupDestinationKind` and `BackupRunStatus` enums, and
   `BackupConfig` / `BackupRun` models exactly as §5.1, comments included.
3. `prisma/schema.prisma`: add `backupConfig` / `backupRuns` relations to `Organization`.
4. `prisma/schema.prisma`: update the `RequestDocument` reader-split comment to §5.3
   (seven → eight, and the new `#164:` paragraph).
5. `pnpm db:push` then `pnpm prisma generate`. Confirm `backup_configs` and `backup_runs`
   exist: `docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c '\dt backup*'`.

### Phase 2 — Reuse extraction

6. `src/lib/server/storage.ts`: extract `resolveWithin(root: string, rel: string): string`
   (exported) from `resolveKey`; rewrite `resolveKey` to call it. No behaviour change.
7. `pnpm test tests/unit/storage.test.ts` — must stay green with no edits to the test file.

### Phase 3 — Pure core (TDD: write the failing tests first)

8. Write `tests/unit/backup-plan.test.ts` with `T-U-01` … `T-U-06`, `T-U-09`, `T-U-14`
   as failing stubs (§13.3).
9. Implement `src/lib/server/backup/plan.ts`: `isRunDue`, `runsToPrune`, `makeRunId`,
   `backupLockKey`, `buildManifest`, `assertDestinationSafe`, `withSingleConnection`,
   `sanitizeError`. No `fs`, no `net`, no `db`, no ambient `Date.now()`.
10. Green `T-U-01…06, 09, 14`.

### Phase 4 — S3 signer

11. Obtain the official AWS SigV4 test vectors. **Hard gate**: if they cannot be obtained,
    stop and apply AD-005's flip (ship S3 disabled + backlog stub).
12. Write `tests/unit/backup-s3-sigv4.test.ts` (`T-U-07`, `T-U-08`) with the vectors'
    expected canonical request / string-to-sign / signature pasted verbatim.
13. Implement `src/lib/server/backup/s3.ts`. `x-amz-content-sha256` = real payload hash.
14. Green `T-U-07`, `T-U-08`.

### Phase 5 — Destination writer

15. Write `tests/unit/backup-destination.test.ts` (`T-U-10`, `T-U-12`, `T-U-13`).
16. Implement `src/lib/server/backup/destination.ts`: `destinationFromEnv`, `writeObject`,
    `listRunIds`, `deleteRun`. LOCAL branch resolves every path through `resolveWithin`,
    `mkdir` mode `0o700`, `writeFile` mode `0o600`. S3 branch uses `fetch` + `signV4`,
    fails closed on non-2xx.
17. Green Phase 5 tests.

### Phase 6 — Orchestration

18. Write `tests/unit/backup-run.test.ts` (`T-U-03`, `T-U-04`, `T-U-11`) against injected
    fakes for the destination and the reader.
19. Implement `src/lib/server/backup/run.ts`: collect (both tables, tombstones INCLUDED,
    `storageKey === null` → `skipped`), pre-flight space check, `RUNNING` row, per-file
    copy + sha256, manifest **last**, status, prune, notify.
20. Notification recipients: `db.user.findMany({ where: { organizationId, isActive: true,
    roles: { hasSome: ['SUPER_ADMIN', 'CEO'] } } })` → `notifyMany(ids, <fixed template>,
    '/settings/backup')`. Fires on `PARTIAL` and `FAILED` only.
21. Green Phase 6 tests.

### Phase 7 — Cron script

22. Implement `scripts/backup-documents.ts` following `scripts/promote-probationary.ts`:
    `import 'dotenv/config'`, own `PrismaClient` (pinned via `withSingleConnection`),
    `--dry-run` and `--force` flags, `assertDestinationSafe` first, org loop,
    `pg_try_advisory_lock` / `pg_advisory_unlock` in `finally`, stale-`RUNNING` sweep,
    per-org try/catch so one org cannot abort the sweep, exit 1 if any org failed.
23. **No `AuditLog` write from this script** — see §16. It therefore does **not** need the
    seeded `system@veent.ph` user, and must not query for one.
24. Grep gate: `grep -n "writeFile\|unlink\|rename\|rm(" src/lib/server/backup/ scripts/backup-documents.ts`
    — every hit must be against the destination, never `UPLOAD_DIR`.

### Phase 8 — Settings surface

25. `src/lib/server/services/settings/backup.ts`: `getBackupSettings(organizationId)`
    (config upserted-on-read as an in-memory default, **not** written) returning config +
    last 20 `BackupRun` rows + next-due date; `updateBackupConfig(organizationId, input,
    ctx)` doing a Prisma `upsert` + `writeAuditLog(ctx, { action: 'UPDATE', entityType:
    'BackupConfig', entityId, oldValue, newValue })`.
26. `src/routes/(app)/settings/backup/+page.server.ts`: `requireAnyCapability(user.roles,
    'ADMINISTER_SYSTEM')` in `load` **and** in the `save` action; zod schema
    `{ enabled: coerce boolean, intervalDays: coerce int 1–90, retentionCount: coerce int
    1–30, destinationKind: enum(['LOCAL','S3']) }`; `fail(422, { error })` on parse failure;
    `isHttpError` catch → `fail(e.status, …)` exactly as `settings/company` does.
27. `src/routes/(app)/settings/backup/+page.svelte` — assembled from existing components
    only (§13.1).
28. `src/routes/(app)/settings/+page.svelte`: add the tile.

### Phase 9 — Docs, env, infra

29. `.env.dev.example` + `.env.prod.example`: add the blocks in §10 (including
    `UPLOAD_DIR` in prod).
30. `docker-compose.yml`: add `uploads` and `backups` named volumes and mount them on `app`.
31. `scripts/README.md`: add the §11 section.

### Phase 10 — Verification

32. `pnpm prisma generate && pnpm check && pnpm lint && pnpm format:check && pnpm test`.
33. `pnpm test:e2e tests/e2e/backup-settings.spec.ts`.
34. Run the manual GUI script `M1…M10` (§13.2) against dev.
35. Re-run the golden tripwire; diff against `tripwire-before.txt` (§13).

---

## 13. Test Plan

### 13.1 UI reuse contract (verified prop signatures — do not hand-roll)

| Component | Real signature (read from source) | Used for |
|---|---|---|
| `PageHeader.svelte` | `{ title: string; description?: string; actions?: Snippet; back?: Snippet }` | Page title + "Back to settings" |
| `BackButton.svelte` | rendered inside `PageHeader`'s `back` snippet | Return to `/settings` |
| `Table.svelte` (generic over `Row`) | `{ columns: Column[]; rows: Row[]; cell: Snippet<[Row, Column]>; getKey: (row, i) => string; onRowClick?; emptyTitle?; emptyDescription?; emptyVariant?: 'empty' \| 'no-results'; emptyAction?; caption? }` | Run history. **Table renders `EmptyState` itself when `rows.length === 0`** — pass `emptyTitle`/`emptyDescription`, do not add a second empty branch |
| `table.ts` | `interface Column { key; label; align?; width?: 'auto' \| 'min'; hideOnMobile? }` | Column defs: `startedAt` (min), `status` (min), `files`, `size` (right, min), `destination` (hideOnMobile), `error` |
| `EmptyState.svelte` | `{ variant?: 'empty' \| 'no-results'; title: string; description?: string; action?: Snippet }` | Reached via `Table`'s empty props; not imported directly |
| `Toaster.svelte` | no props; **already mounted once in `src/routes/(app)/+layout.svelte`** | Save result. Push with `addToast(msg, { kind: 'success' \| 'error' })` from `$lib/stores/toast.svelte` inside an `$effect` on `form` |
| `createSubmitGuard` (`$lib/utils/submit-guard.svelte`) | `createSubmitGuard(inner?)` → `{ busy, enhance }` | The save form: `use:enhance={save.enhance}`, `disabled={save.busy}` |
| `ConfirmDialog` / `ConfirmButton` | `ConfirmButton: { action; title?; message?; confirmText?; triggerLabel?; triggerClass?; disabled?; submit?; children? }` | **Not used.** The page has no destructive control — the only action is `save`, which is reversible. Recorded deliberately so a reviewer does not read the absence as an omission. If a "delete this run's files" control is ever added, it uses `ConfirmButton` |

`MaskedField`, `PeriodPicker`, `Skeleton`, `TableSkeleton`, `ReasonDialog` are not applicable
here (no masked values, no period selection, no streamed/deferred data, no reason capture).

### 13.2 Golden tripwire — snapshot BEFORE any edit

Run all five, save to `tripwire-before.txt`, re-run after Phase 9 as `tripwire-after.txt`:

```bash
cd /home/hyuse/Desktop/VeentApps/veent_hris
git rev-parse HEAD
pnpm test 2>&1 | tail -5                                   # baseline pass/fail counts
docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c '\dt' | sort
find uploads -type f -exec sha256sum {} \; | sort          # every document byte, hashed
pnpm exec tsx scripts/sweep-orphan-uploads.ts              # dry run: files-on-disk vs rows
```

Required after-state:

| Snapshot | Required diff |
|---|---|
| `pnpm test` tail | test count **increased**; **zero** previously-passing tests now failing |
| `\dt` | exactly two new tables (`backup_configs`, `backup_runs`); nothing removed or renamed |
| `find uploads … sha256sum` | **byte-identical** — this is the proof of ST6 / G6. Any difference means a backup run touched `UPLOAD_DIR` |
| `sweep-orphan-uploads.ts` | identical "Files on disk / document rows / Orphans" counts. A changed orphan count means the backup wrote into `UPLOAD_DIR` (S2) |

Run the `find`/`sweep` pair **again immediately after** the first real backup run in `M4`.

### 13.3 Unit tests (`pnpm test`)

| ID | File | Test | What it PROVES |
|---|---|---|---|
| T-U-01 | `backup-plan` | `resolveWithin(root, '../../etc/passwd')` throws; `resolveWithin(root, 'a/b.pdf')` returns a path inside `root`; a key that is a prefix-sibling (`root-evil/x`) throws | The containment check the destination writer relies on actually refuses traversal (S1) — and, because `resolveKey` now delegates to it, that the existing upload path is unchanged |
| T-U-02 | `backup-plan` | `assertDestinationSafe('/data/uploads', '/data/uploads/backups')` throws; `('/data/uploads', '/data')` throws; `('/data/uploads', '/data/backups')` passes; symlink-free relative forms (`./uploads`, `uploads/../uploads/bk`) resolve before comparing | A backup can never be written inside `UPLOAD_DIR` in either direction (S2) |
| T-U-03 | `backup-run` | With a reader that throws on 1 of 5 files: result status is `PARTIAL`, `failedCount === 1`, `fileCount === 4`, and the manifest's `failed[]` has the id | Partial failure is recorded, never a silent success, and one bad file does not abort the run (ST1) |
| T-U-04 | `backup-plan` | `runsToPrune` given `[SUCCESS, RUNNING, FAILED, SUCCESS, PARTIAL]` and `retentionCount: 2` keeps the 2 newest **completed** runs, and returns the `RUNNING`/`FAILED` rows for removal regardless of age | A crashed half-written run can never displace a good backup, and incomplete runs are cleaned (ST2) |
| T-U-05 | `backup-plan` | `backupLockKey('org_a') === 'document-backup:org_a'`; two calls with the same org id are identical; different org ids differ; the function takes exactly one argument | The #163 failure mode is structurally impossible — the key has no input that could differ between two concurrent runs (ST3) |
| T-U-06 | `backup-plan` | `withSingleConnection` on a URL with no query, with an existing query, and with an existing `connection_limit=10` all yield exactly one `connection_limit=1` and preserve every other parameter | Lock and unlock land on the same connection (ST4) |
| T-U-07 | `backup-s3-sigv4` | `canonicalRequest` and `stringToSign` reproduce the **official AWS SigV4 test-suite** expectations byte-for-byte | The canonicalisation half of the signature is right, against an expectation we did not author (S9/AD-005) |
| T-U-08 | `backup-s3-sigv4` | `signV4` reproduces the official vector's `Authorization` header exactly, including the signed-header list and the `Credential` scope | The full signature is right. **Hard rule: the expected hex is copied from AWS's published material. A value generated by our own signer and pasted back proves nothing** |
| T-U-09 | `backup-plan` | `sanitizeError('PUT https://k.s3.example/… failed: AKIAEXAMPLE denied', ['AKIAEXAMPLE','https://k.s3.example'])` contains neither substring and does contain `[redacted]`; an empty secret list is a no-op; a secret appearing twice is redacted twice | No credential, endpoint, bucket or absolute path can reach `BackupRun.error` or the UI (S4) |
| T-U-10 | `backup-destination` | `writeObject` for a LOCAL destination places `org_a`'s object under `<root>/org_a/…` and never outside it; a `relPath` containing `..` throws | Tenant partitioning is a path property, not a filter (S6), and traversal is refused at the writer (S1) |
| T-U-11 | `backup-run` | The notification string produced for a `PARTIAL` run contains the counts and contains **none** of: any filename in the fixture, any employee name, any absolute path, any bucket/endpoint | A failure alert cannot leak document content (S8) |
| T-U-12 | `backup-destination` | With a `statfs` stub reporting free bytes below `total × 1.1`, the run is refused before any object is written (writer stub records zero calls) | Disk-full is refused up front rather than discovered halfway (ST5) |
| T-U-13 | `backup-destination` | A stubbed `fetch` returning 403 makes `writeObject` reject; a stubbed `fetch` returning 200 resolves; the request carries `x-amz-content-sha256` equal to the sha256 of the body and never the literal `UNSIGNED-PAYLOAD` | The S3 path fails closed and signs the real payload (S9/ST7) |
| T-U-14 | `backup-plan` | `isRunDue` — disabled config → false; `lastCompletedAt === null` → true; `intervalDays: 3` with a completed run 2 days ago → false, 3 days ago → true, 40 days ago → true (no catch-up loop, one run); a `FAILED` run's timestamp is not treated as "completed" | "Every # days" (#164, G3) behaves as stated, and a failed night does not delay the next attempt by a full interval (ST8) |
| T-U-15 | `backup-run` | Collector fixture: 2 `EmployeeDocument`, 3 `RequestDocument` of which 1 is tombstoned-with-bytes and 1 is tombstoned-with-`storageKey: null` → `files[]` has 4 entries, `skipped[]` has exactly the null-key row with `reason: 'bytes-evicted'`, and the query passed to Prisma has **no** `deletedAt` filter | D3 exactly: tombstones with bytes ARE backed up, evicted rows ARE recorded as skipped, and the eighth-includer promise in the schema comment is kept |

### 13.4 E2E (`pnpm test:e2e`)

| ID | Test | What it PROVES |
|---|---|---|
| T-E-01 | `tests/e2e/backup-settings.spec.ts`: an `HR_ADMIN` session navigating to `/settings/backup` receives 403; a `SUPER_ADMIN` session sees the heading "Document Backup" | S5 — the capability gate is real on the route, not just on the tile |
| T-E-02 | Same spec: `SUPER_ADMIN` POSTs `?/save` with `intervalDays=0` and receives a 422 with an inline message; `intervalDays=3` succeeds | Bounds are enforced server-side, not only by the `min` attribute |

Note the standing repo caveat: the Playwright suite is used as a gate but has been flaky
(#287). A red here is diagnosed before it is dismissed.

### 13.5 Manual GUI test script (dev only — there is no staging or prod)

Preconditions: `./start.sh` is up; `pnpm db:seed`; `pnpm dev`; logged in as a **Super Admin**
of the Veent tenant.

**Plant the marker first** — every later step finds the record by this marker:

- **M0.** Go to **Employees → (any active employee) → Documents** tab. Upload a small PDF
  with **Label** exactly `TRIPWIRE-164-MARKER` and **Category** `OTHER`. **Assert:** the
  documents table now shows a row whose Label cell reads `TRIPWIRE-164-MARKER`, with today's
  date in the Uploaded column. Note the employee's number (e.g. `EMP-015`).

| # | Steps | Positive assertion |
|---|---|---|
| M1 | Sign out. Sign in as **HR Admin** (`hr@veent.ph` / `Hr@1234`, tenant **Veent**). Open `/settings` | **Positive control first (E-17):** a card titled `Company Information` IS present — proving the grid rendered. Then: no card titled `Document Backup`. Then go directly to `/settings/backup`: the page shows a large `403` and the heading **`Access Denied`** (this is `src/routes/+error.svelte`; it does NOT say "Insufficient permissions") |
| M2 | Sign back in as **Super Admin** (`admin@veent.ph` / `Admin@1234`). Open `/settings`. Click the card **Document Backup** | Heading reads `Document Backup`. The status card shows `STATUS` = grey badge `Off`, `LAST COMPLETED` = `—`, `NEXT DUE` = `Backups are off`. The checkbox **`Back up documents automatically`** is unticked. `Run every` = `1`, `Keep the last` = `7`, `Destination` = `Server disk`. The history area shows the empty-state title **`No backups yet`** |
| M3 | Tick `Back up documents automatically`. Set `Run every` = `1`, `Keep the last` = `3`, `Destination` = `Server disk`. Click **`Save schedule`** | A toast reads exactly **`Backup schedule saved.`** The button reads `Saving…` and is disabled while in flight. After reload the controls still read ticked / `1` / `3` / `Server disk`, and the status card `STATUS` badge is now green **`On`**. In psql: `docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c 'select enabled, "intervalDays", "retentionCount" from backup_configs;'` returns exactly `t / 1 / 3`. Because no run has happened yet, an amber note appears reading `Backups are switched on but none has run yet.` |
| M4 | In **fish** (`VAR=x cmd` is bash-only — the `env` prefix is required, and `dotenv-cli` will not override an already-set variable): `env BACKUP_DIR=$PWD/backups pnpm exec dotenv -e .env.dev -- tsx scripts/backup-documents.ts` | stdout contains `org org_seed: N file(s) copied, 0 failed`. **The org id is `org_seed`, not `org_veent`** — `org_seed` is the seeded Veent tenant. `ls backups/org_seed/` lists exactly one directory named like `2026-08-22T…Z-<16 hex>`. `cat backups/org_seed/*/manifest.json \| grep TRIPWIRE-164-MARKER` prints the marker's entry, and its `sha256` equals `sha256sum` of the matching file under `backups/org_seed/*/files/`. The manifest's `fileName` is the **original** upload filename, not the UUID on disk |
| M5 | Reload `/settings/backup` | The history table has exactly one row. `Started` shows today, `Status` is a green badge reading **`SUCCESS`** (the raw enum, upper-case — not `Success`), `Files` reads `N copied`, `Size` is a formatted byte count, `Destination` reads `Server disk`, `Detail` reads `—`. The status card `LAST COMPLETED` now shows a timestamp and `NEXT DUE` shows tomorrow. The amber never-ran note is gone |
| M6 | Re-run the exact M4 command immediately | stdout says the org is **not due**. `ls backups/org_seed/ \| wc -l` still prints `1`, and the history table still shows exactly one row — proving the in-app interval gate, independently of the cron schedule |
| M7 | Run the M4 command with `--force` four times in a row, then reload the page | `ls backups/org_seed/ \| wc -l` prints `3`, not `5` — `Keep the last 3` pruned the two oldest. The history table shows **5 rows** (every run is remembered), and the two oldest rows' `Detail` cell reads **`Files removed by retention`** while the three newest read `—`. Those three correspond exactly to the three surviving directories |
| M8 | Break one file: `mv uploads/employees/<employeeId>/<marker uuid>.pdf /tmp/`. Run with `--force`. Reload the page | stdout reports `1 failed`. The newest row's `Status` badge reads **`PARTIAL`** in amber (never green), `Files` shows `· 1 failed` in red, and `Detail` shows a short reason containing **no** absolute path. Open the notification bell: a message reads `Nightly document backup finished with errors (1 of N files could not be copied). Open Settings → Document Backup.` and links to `/settings/backup`. Restore it: `mv /tmp/<uuid>.pdf uploads/employees/<employeeId>/` |
| M9 | Record `find uploads -type f \| wc -l` first. Then: `env BACKUP_DIR=$PWD/uploads/bk pnpm exec dotenv -e .env.dev -- tsx scripts/backup-documents.ts` | **Positive assertions (E-17):** stderr contains a refusal naming the destination as inside `UPLOAD_DIR`; `echo $status` prints non-zero; `find uploads -type f \| wc -l` prints the **same** number recorded before. Only then: `ls uploads/` shows no `bk` directory |
| M10 | `ls -ld backups/org_seed/*/` and `ls -l backups/org_seed/*/manifest.json`; then re-run `find uploads -type f -exec sha256sum {} \; \| sort` and diff against `tripwire-before.txt` | Directory mode is `drwx------` (0700), `manifest.json` is `-rw-------` (0600). The `uploads` hash listing is **byte-identical** to the pre-change snapshot — proof a full run read everything and changed nothing (G6/ST6). NOTE: running the **e2e suite** also adds orphan files under `uploads/requests/`; take the snapshot without an e2e run in between, or diff only the 63 original hashes |
| M11 | **Concurrency (E-11).** Launch two runs in the same second (fish): `env BACKUP_DIR=$PWD/backups pnpm exec dotenv -e .env.dev -- tsx scripts/backup-documents.ts --force &; env BACKUP_DIR=$PWD/backups pnpm exec dotenv -e .env.dev -- tsx scripts/backup-documents.ts --force &; wait` | Exactly one process prints `N file(s) copied`; the other prints `another backup is already running — skipped`. `ls backups/org_seed/ \| wc -l` increases by exactly `1`. `docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c "select count(*) from backup_runs where status='RUNNING';"` returns `0` after both exit |

### 13.6 Known gaps

| Gap | Why | Resolution |
|---|---|---|
| The S3 destination is never exercised against a real endpoint | No staging and no prod environment exists (owner-stated constraint), and no S3-compatible bucket is provisioned | Proven by unit test only (`T-U-07`, `T-U-08`, `T-U-13`) per D1. Backlog stub `s3-destination-live-verification_NOTE_22-08-26.md` in `process/features/document-autobackup/backlog/` records that the S3 path is **CONDITIONAL, not verified**, and must be smoke-tested the first time a bucket exists. The settings page's `Destination` control ships with `S3` labelled `S3-compatible (not yet verified against a live bucket)` so nobody selects it believing it is proven |
| The cron entry itself | Crontab lives outside the repo and there is no droplet to install it on | Recorded in `scripts/README.md` per the existing convention; verified by running the same command by hand in M4 |
| Restore | Out of scope (§14) | Backlog stub `document-restore-tooling_NOTE_22-08-26.md`. Until it exists, "restore" is: copy `files/` back under `UPLOAD_DIR` preserving relative paths, and reconcile rows using `manifest.json`. This sentence goes in `scripts/README.md` so the knowledge is not only in this plan |

---

## 14. Out of Scope (explicit)

| Item | Why not now |
|---|---|
| **Restore tooling** | Restoring is a rarer, higher-stakes operation than backing up and deserves its own design (conflict handling, row re-creation, tenant selection, dry-run diff). Shipping backup without restore still moves us from "one copy" to "two copies", which is the whole risk being retired. Backlog stub required |
| **Database dump** | D2. The rows are already covered by whatever Postgres backup the host provides; the files are what has no second copy. Mixing a `pg_dump` into this job would couple document backup to DB backup policy |
| **Cross-org download / a global backup console** | Contradicts every tenant boundary in the app (S6) and AD-002 |
| **Incremental / differential backup** | Requires a durable index of what was already copied and a correctness story for a corrupted index. Current volume is hundreds of files; a full copy is cheap. Revisit if `totalBytes` grows past a few GB |
| **Encryption of the backup at rest by the app** | Key management with no secret store is worse than the destination's own encryption (filesystem permissions 0700/0600 locally; SSE at the bucket). An app-managed key stored in the same env as the bucket credentials adds ceremony, not security |
| **Email/Discord alerting on failure** | A8 is satisfied by the existing in-app `notifyMany`. The app has no outbound email, and the Discord bot is a timelog integration, not an alerting channel |
| **A "Run backup now" button** | AD-003 |
| **Backing up `Organization.logoUrl` or any non-document upload** | #164 names employee documents. `logoUrl` is a URL, not a stored file |

---

## 15. BLOCKING FINDING — pre-existing prod data loss (must be fixed by this PR)

`docker-compose.yml` defines exactly one volume, `pgdata`. There is **no** volume for
`UPLOAD_DIR`, and `.env.prod.example` does not set `UPLOAD_DIR` at all — so in a production
deployment every 201 file is written to `/app/uploads` **inside the container**, and
`docker compose pull && docker compose up -d` (the documented deploy) destroys them.

This clears the §5 out-of-scope-bug bar on its own terms — guaranteed data loss — and it is
not tangential: the backup script is invoked via `docker compose run --rm app`, whose
container filesystem is discarded on exit. Without volumes, this feature would faithfully
copy every document into a directory that is deleted seconds later. **The fix is a
prerequisite, not an adjacent improvement.**

Fix (checklist step 30):

```yaml
  app:
    volumes:
      - uploads:/app/uploads
      - backups:/app/backups

volumes:
  pgdata:
  uploads:
  backups:
```

plus `UPLOAD_DIR=/app/uploads` and `BACKUP_DIR=/app/backups` in `.env.prod.example` (§10).

Cannot be verified here — there is no prod or staging. Verification is limited to: the
compose file parses (`docker compose config`), and the dev run in `M4` proves the script
honours whatever `BACKUP_DIR` points at. A backlog stub
`prod-upload-volume-verification_NOTE_22-08-26.md` records that the mount itself is unproven
until an environment exists.

---

## 16. Audit and Actor

The cron script runs with no HTTP request: no `ipAddress`, no `userAgent`, no session.

| Action | Audited? | Reasoning |
|---|---|---|
| Editing backup config in `/settings/backup` | **Yes** — `writeAuditLog(ctx, { action: 'UPDATE', entityType: 'BackupConfig', entityId, oldValue, newValue })` with the real `actorId`, `actorRoles` and `getClientAddress()` | It is a human changing a system-administration setting. Turning backups off, or stretching the interval to 90 days, is precisely the change someone would want to find later. Same treatment `settings/company` gives company info |
| A backup run (start, success, partial, failure, prune) | **No `AuditLog` write** | The `BackupRun` row **is** the durable record, and it is richer than an audit entry (counts, bytes, manifest checksum, sanitized reason) and rendered directly in the UI. `AuditLog.actorId` is a non-nullable FK, so auditing here would force the `system@veent.ph` dependency and its "exit 1 if the seed is missing" failure mode onto a job that otherwise needs no actor at all — buying a second, poorer copy of a record we already keep |

Consequence, stated so it is a choice and not an oversight: this script — unlike
`scripts/promote-probationary.ts` — has **no dependency on the seeded `system@veent.ph`
user** and must not query for one. It also writes no domain rows, so there is no timeline
that could degrade. If a future reviewer decides run history belongs in the audit log too,
`promote-probationary.ts` is the drop-in pattern: look up the system user, exit 1 with a
clear message when absent, and pass it as `ctx.actorId`.

Notifications are separate from auditing and do fire from the script (A8) — recipients are a
query, not an actor.

---

## Touchpoints

**Read:** `src/lib/server/storage.ts`, `src/lib/server/services/documents.ts`,
`src/lib/server/services/notifications.ts`, `src/lib/server/audit.ts`,
`src/lib/server/rbac.ts`, `src/lib/rbac.ts`,
`src/lib/server/services/settings/master.ts`,
`src/routes/(app)/settings/company/+page.server.ts`,
`scripts/promote-probationary.ts`, `scripts/sweep-orphan-uploads.ts`,
`src/lib/server/services/payroll/index.ts:95-112`, `src/lib/server/services/timesheets.ts:185`,
`src/lib/components/ui/*`, `src/lib/utils/submit-guard.svelte`,
`src/lib/stores/toast.svelte`.

**Changed:** the 12 new + 7 modified files in §9.

## Blast Radius

| Dimension | Value |
|---|---|
| New files | 12 (5 source, 1 script, 2 route, 1 service, 3 test) |
| Modified files | 7 (`prisma/schema.prisma`, `storage.ts`, `settings/+page.svelte`, `docker-compose.yml`, both env examples, `scripts/README.md`) |
| Schema | 2 new tables, 2 new enums, 2 new relations, 0 renames, 0 drops. `db push` safe |
| Risk classes present | **secrets / trust boundary** (S3 credentials), **filesystem writes outside the app tree**, **permission logic** (new capability-gated surface), **container/deploy** (§15 volumes) |
| Risk classes absent | money, payroll, auth/session, public API, existing-row mutation. Nothing in this change writes to any pre-existing table |
| Highest-risk single edit | `src/lib/server/storage.ts` — the only pre-existing runtime file touched, and it is on the upload/download hot path. Mitigated by making the change a pure extraction with zero behaviour delta, guarded by the unmodified `tests/unit/storage.test.ts` |

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `T-U-15` collector fixture (both tables, tombstones, evicted rows) | Fully-Automated | G1 + D3 — every document is enumerated; evicted rows are recorded, not dropped |
| `M4` manifest marker + sha256 match | Hybrid (dev DB + dev filesystem) | G1, G2, D2 — bytes reach the destination unmodified and the manifest identifies them |
| `T-U-14` `isRunDue` matrix | Fully-Automated | G3 — "every # days" |
| `M6` second run same night | Hybrid | G3 — the interval gate actually gates |
| `T-U-07`, `T-U-08` official SigV4 vectors | Fully-Automated | G4 — the cloud destination signs correctly (D1's "provable by unit test") |
| `T-U-13` fail-closed S3 request | Fully-Automated | G4, ST7 |
| `M8` broken-file run → `Partial` + notification | Hybrid | G5, ST1, A8, S8 |
| `T-U-11` notification content | Fully-Automated | S8 — the alert leaks nothing |
| `M10` uploads sha256 listing byte-identical | Hybrid | **G6** — a full run changed nothing under `UPLOAD_DIR` |
| `M9` destination-inside-uploads refusal | Hybrid | S2 |
| `T-U-01`, `T-U-02`, `T-U-10` | Fully-Automated | S1, S2, S6 |
| `T-U-05`, `T-U-06` lock key + single connection | Fully-Automated | ST3, ST4 — the #163 lesson is structurally closed |
| `T-U-03`, `T-U-04` partial + prune | Fully-Automated | ST1, ST2 |
| `T-U-12` free-space pre-flight | Fully-Automated | ST5 |
| `M1`, `T-E-01` capability gate | Hybrid + Fully-Automated | S5 |
| `M7` retention keeps exactly K | Hybrid | G3 (retention half), ST2 |
| `M3` config round-trip + psql assertion | Hybrid | G3 — the setting the UI shows is the setting the script reads |
| `M10` 0700/0600 modes | Agent-Probe (operator reads `ls -l`) | S3 |
| Live S3 bucket write | **Known gap** — no environment exists | Backlog stub required; `S3` ships labelled unverified. Gate stays **CONDITIONAL** |
| Prod volume mount survives a redeploy | **Known gap** — no prod exists | Backlog stub required; §15 gate stays **CONDITIONAL** |

Two known gaps are recorded above. Neither is a terminal PASS: both keep their gate
CONDITIONAL and both require a backlog stub written during EXECUTE.

## Test Infra Improvement Notes

- There is no fixture factory for "an org with employees and documents on disk"; every
  document-touching unit test builds its own. `backup-run` tests will need one — if it turns
  out to be more than ~30 lines, extract it to `tests/fixtures/` rather than copying it.
- `pnpm check` does not cover `scripts/**` (recorded in the tests context, and one site
  shipped broken on that assumption in #282). `scripts/backup-documents.ts` is therefore
  **not** typechecked by the standard gate. Mitigation for this PR: keep the script a thin
  arg-parse + loop over `run.ts` (which **is** covered), and run
  `pnpm exec tsc --noEmit scripts/backup-documents.ts` once by hand during Phase 10.
  Longer-term fix is out of scope here — note it in the phase report.

## 21. Rollback Plan

| Stage reached | Rollback |
|---|---|
| Code merged, cron **not** installed | Nothing runs. The feature is inert: `BackupConfig.enabled` defaults to `false`, and no code path outside `/settings/backup` and the script reads either new table. Revert the PR at leisure |
| Cron installed, behaving badly | `crontab -e`, comment the line. Instant, no deploy, no code change. Second lever without shell access: set `Enabled` off at `/settings/backup` per org — the script then does nothing for that org |
| Need to revert the code | `git revert` the PR. The two new tables and two new enums are left in place deliberately — dropping them is not required for correctness (nothing reads them once the code is gone) and a drop would destroy the run history that explains why the revert happened. If a later cleanup is wanted, it is a `scripts/migrate-*.ts` doing `DROP TABLE backup_runs; DROP TABLE backup_configs; DROP TYPE …`, run knowingly |
| `storage.ts` extraction suspected | It is a pure refactor with no behaviour delta and is the single revertable hunk: restore the inline check inside `resolveKey` and keep `resolveWithin` as a copy for the backup module. `tests/unit/storage.test.ts` is the guard either way |
| Backup files themselves | Deleting the destination tree is always safe — nothing in the app reads it. `UPLOAD_DIR` is untouched by design (G6) and is proven so by the tripwire |

Irreversible steps: **none**. No existing row is written, no file is moved, no enum value is
renamed, no column is dropped.

## Resume and Execution Handoff

1. **Selected plan file:**
   `process/features/document-autobackup/active/document-autobackup-164_22-08-26/PLAN.md`
2. **Last completed phase or step:** ALL phases complete. `feat/document-autobackup-164` is
   merged with `staging` and open as PR #322. Gates: `pnpm check` 0, `pnpm lint` 0,
   `format:check` clean, `pnpm test` 1845 passed / 158 files; CI E2E, unit and the
   populated-DB `db push` all green. Manual gates M1–M11 all run live on dev — the CLI half
   on 22-08-26, the GUI half (M1–M3) on 25-08-26.
3. **Validate-contract status:** written, standing at **CONDITIONAL** — the S3 destination
   has never been written to live. It ships labelled unverified.
4. **Supporting context loaded:** `process/context/all-context.md`,
   `process/context/tests/all-tests.md`, `process/context/planning/all-planning.md`;
   sources listed in §17.
5. **Next step for a fresh agent:** nothing in this plan. Read the `_REPORT_` file first.
   The only open work is the three backlog notes, and each is blocked on an environment
   this machine does not have — do not attempt them by writing code against an
   unreachable destination. If you are here to change backup behaviour, read §E-01
   (`/backups/` gitignore), §E-05 (the two-int advisory lock) and §E-08 (the asymmetric
   stale-run sweep) before touching anything: all three encode defects that already shipped
   once.


## Acceptance Criteria

| # | Criterion | Proven by | Strategy |
|---|---|---|---|
| AC-1 | Every `EmployeeDocument` and every non-evicted `RequestDocument` byte-file for an org is present at the destination after a run, byte-identical to the source | `T-U-15`, `M4` (sha256 match) | Fully-Automated + Hybrid |
| AC-2 | Each backup carries a `manifest.json` naming, per file: employee, category, label, original filename, MIME, size, upload date, SHA-256 | `M4` (marker lookup), `T-U-15` | Hybrid + Fully-Automated |
| AC-3 | A `RequestDocument` row whose `storageKey` is null appears in `manifest.skipped[]` with `reason: "bytes-evicted"` and is not silently dropped | `T-U-15` | Fully-Automated |
| AC-4 | The run interval ("every # days") and retention ("keep last K") are set in the app and honoured by the script | `T-U-14`, `M3`, `M6`, `M7` | Fully-Automated + Hybrid |
| AC-5 | Destination kind is selectable between LOCAL and S3; the S3 request is correctly SigV4-signed and fails closed | `T-U-07`, `T-U-08`, `T-U-13` | Fully-Automated (live bucket = Known-Gap, gate stays CONDITIONAL) |
| AC-6 | A run with unreadable files completes as `PARTIAL`, never `SUCCESS`, and notifies the org's `ADMINISTER_SYSTEM` holders with counts only | `T-U-03`, `T-U-11`, `M8` | Fully-Automated + Hybrid |
| AC-7 | A crashed or in-flight run can never be counted as a keeper by retention | `T-U-04`, `M7` | Fully-Automated + Hybrid |
| AC-8 | Two concurrent runs for one org cannot interleave, and both derive the identical lock key | `T-U-05`, `T-U-06`, `M11` | Fully-Automated + Hybrid |
| AC-9 | No backup run writes, moves, renames or deletes anything under `UPLOAD_DIR` | `M10` tripwire diff (byte-identical), grep gate (step 24) | Hybrid |
| AC-10 | The backup destination cannot be inside `UPLOAD_DIR` (either direction); the script refuses to start | `T-U-02`, `M9` | Fully-Automated + Hybrid |
| AC-11 | `/settings/backup` and every one of its actions are gated on `ADMINISTER_SYSTEM`; the settings tile obeys the same predicate | `T-E-01`, `M1`, `M2` | Fully-Automated + Hybrid |
| AC-12 | No credential, endpoint, bucket name or absolute path appears in the UI, in `BackupRun.error`, or in a notification | `T-U-09`, `T-U-11`, `M8` | Fully-Automated + Hybrid |
| AC-13 | Config edits are audit-logged with the real actor and IP; runs are not audit-logged and the script needs no seeded system user | code review of step 25/23, audit table check during `M3` | Agent-Probe |
| AC-14 | The full pre-existing suite still passes and no existing behaviour moved | tripwire before/after (§13.2) | Fully-Automated |

## Phase Completion Rules

A checklist phase is `CODE DONE` when its steps are written and compile. It is `VERIFIED`
only when the gates named below are green with recorded evidence. `CODE DONE` is never
reported as `VERIFIED`.

| Phase | Exit gate (all required) |
|---|---|
| 0 Tripwire | `tripwire-before.txt` exists in the task folder and contains all five snapshots |
| 1 Schema | `pnpm db:push` clean; `\dt backup*` shows both tables; `pnpm prisma generate` clean; the `RequestDocument` comment says EIGHT includers |
| 2 Reuse extraction | `pnpm test tests/unit/storage.test.ts` green with **zero** edits to that test file |
| 3 Pure core | `T-U-01, 02, 04, 05, 06, 09, 14` green; `grep -E "node:fs\|node:net\|\$lib/server/db" src/lib/server/backup/plan.ts` returns nothing |
| 4 S3 signer | `T-U-07`, `T-U-08` green **against vectors copied from AWS's published material**. If vectors are unobtainable, AD-005 flips and this phase closes as `BLOCKED — S3 shipped disabled` with a backlog stub |
| 5 Destination | `T-U-10`, `T-U-12`, `T-U-13` green |
| 6 Orchestration | `T-U-03`, `T-U-11`, `T-U-15` green |
| 7 Cron script | The step-24 grep gate returns only destination writes; `--dry-run` runs and writes nothing (`find backups -type f` empty) |
| 8 Settings surface | `pnpm check` clean; `T-E-01`, `T-E-02` green; `M1`–`M3` pass |
| 9 Docs/env/infra | `docker compose config` parses; both env examples contain every var in §10; `scripts/README.md` section present |
| 10 Verification | `pnpm check && pnpm lint && pnpm format:check && pnpm test` all green; `M1`–`M10` all pass with the stated positive assertions; tripwire after-diff matches §13.2's required-diff table; both backlog stubs written |

## Validate Contract

Status: CONDITIONAL
Date: 22-08-26
date: 2026-08-22
generated-by: outer-pvl

Parallel strategy: sequential (in-process fan-out)
Rationale: 6/7 signals present (S1 multi-package, S2 schema+auth surface, S4 no, S6 high-risk classes, S7 19 files, S5 user requested adversarial depth). Threshold says HIGH → agent team / workflow. The Agent tool was not available in this validate session, so the 4 Layer-1 dimensions and 8 Layer-2 section probes were run in-process against the live repo with the same role prompts. Every claim below is backed by a command run against the working tree, not by inference.

### Test gates (C3)

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1 | Every EmployeeDocument + non-evicted RequestDocument byte reaches the destination | Fully-Automated | `pnpm test tests/unit/backup-run.test.ts` (T-U-15) | B |
| AC-1 | Bytes at the destination are byte-identical to source | Hybrid | M4 — precondition: `./start.sh` up, `pnpm db:seed`, marker uploaded; sha256 of `backups/<org>/<run>/files/<key>` equals manifest `sha256` | B |
| AC-2 | manifest.json names employee/category/label/original filename/mime/size/uploadedAt/sha256 | Hybrid | M4 marker lookup: `grep TRIPWIRE-164-MARKER backups/*/*/manifest.json` | B |
| AC-3 | storageKey===null RequestDocument appears in `skipped[]` with reason `bytes-evicted` | Fully-Automated | `pnpm test tests/unit/backup-run.test.ts` (T-U-15) | B |
| AC-4 | intervalDays / retentionCount are honoured by the script | Fully-Automated | `pnpm test tests/unit/backup-plan.test.ts` (T-U-14, T-U-04) | B |
| AC-4 | The interval and retention the UI shows are the ones the script reads | Hybrid | M3 + M6 + M7 — precondition: dev DB + `docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris` | B |
| AC-5 | SigV4 signature matches AWS-published expectations | Fully-Automated | `pnpm test tests/unit/backup-s3-sigv4.test.ts` (T-U-07, T-U-08) | B |
| AC-5 | S3 write against a real bucket | Agent-Probe | none possible — no bucket, no staging, no prod | D |
| AC-6 | Unreadable file → PARTIAL, never SUCCESS; admins notified with counts only | Fully-Automated | `pnpm test tests/unit/backup-run.test.ts` (T-U-03, T-U-11) | B |
| AC-6 | Notification renders and links correctly | Hybrid | M8 — precondition: dev app running, marker file moved to /tmp | B |
| AC-7 | A crashed/in-flight run is never counted as a keeper by retention | Fully-Automated | `pnpm test tests/unit/backup-plan.test.ts` (T-U-04) | B |
| AC-8 | Two concurrent runs cannot interleave; both derive the identical lock key | Fully-Automated | `pnpm test tests/unit/backup-plan.test.ts` (T-U-05, T-U-06) | B |
| AC-8 | A second live process actually skips | Hybrid | NEW M11 (see E-11) — two `--force` runs launched concurrently against dev; second prints `another backup is already running — skipped` | B |
| AC-9 | No run writes/moves/renames/deletes under UPLOAD_DIR | Hybrid | M10 tripwire diff: `find uploads -type f -exec sha256sum {} \; \| sort` byte-identical to `tripwire-before.txt` | B |
| AC-9 | No write call targets UPLOAD_DIR in source | Fully-Automated | checklist step 24 grep gate: `grep -n "writeFile\|unlink\|rename\|rm(" src/lib/server/backup/ scripts/backup-documents.ts` | B |
| AC-10 | Destination inside UPLOAD_DIR (either direction) is refused before any org runs | Fully-Automated | `pnpm test tests/unit/backup-plan.test.ts` (T-U-02) | B |
| AC-10 | The refusal happens live | Hybrid | M9 | B |
| AC-11 | /settings/backup + every action gated on ADMINISTER_SYSTEM | Fully-Automated | `pnpm test:e2e tests/e2e/backup-settings.spec.ts` (T-E-01, T-E-02) — precondition: `pnpm db:seed:e2e`, build+preview per #287 | B |
| AC-12 | No credential/endpoint/bucket/absolute path in UI, BackupRun.error or notification | Fully-Automated | `pnpm test tests/unit/backup-plan.test.ts` (T-U-09) + `backup-run.test.ts` (T-U-11) | B |
| AC-13 | Config edits audit-logged with the real actor and IP; runs are not | Agent-Probe | M3 + `select * from audit_logs where "entityType"='BackupConfig' order by "createdAt" desc limit 1;` — operator judges actorId/ipAddress/oldValue/newValue are real | B |
| AC-14 | The pre-existing suite still passes and nothing moved | Fully-Automated | `pnpm check && pnpm lint && pnpm format:check && pnpm test` all exit 0; tripwire before/after diff | A |
| E-01 (new) | Backup output can never be committed to git | Fully-Automated | `git check-ignore -q backups && echo ok` exits 0 | B |
| E-05 (new) | The backup lock key cannot collide with the payroll/timesheet advisory-lock keys | Fully-Automated | new unit case in `backup-plan.test.ts` asserting the two-int lock form (or a classifier-prefixed hash) is used | B |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

C-4 reconciliation: the `strategy:` column carries ONLY the 3 proving strategies (Fully-Automated / Hybrid / Agent-Probe). Known-Gap is NEVER a `strategy:` value — it is a named residual carried via gap-resolution D.

Legacy line form (retained so existing validate-contract consumers still parse):
- pure core (`src/lib/server/backup/plan.ts`): Fully-automated: `pnpm test tests/unit/backup-plan.test.ts`
- S3 signer (`src/lib/server/backup/s3.ts`): Fully-automated: `pnpm test tests/unit/backup-s3-sigv4.test.ts`
- destination writer (`src/lib/server/backup/destination.ts`): Fully-automated: `pnpm test tests/unit/backup-destination.test.ts`
- orchestration (`src/lib/server/backup/run.ts`): Fully-automated: `pnpm test tests/unit/backup-run.test.ts`
- settings route: Fully-automated: `pnpm test:e2e tests/e2e/backup-settings.spec.ts` (precondition: `pnpm db:seed:e2e`, build+preview per #287)
- cron script (`scripts/backup-documents.ts`): hybrid: `pnpm exec dotenv -e .env.dev -- tsx scripts/backup-documents.ts --dry-run` + precondition: `./start.sh` up, seeded dev DB; NOT covered by `pnpm check`
- whole-feature live behaviour: hybrid: manual GUI script M0–M11 against dev
- prod volume mount survives redeploy: known-gap: documented — no prod environment exists
- S3 write against a live bucket: known-gap: documented — no bucket exists

### Dimension findings

- Infra fit: CONCERN — §15's compose fix is correct and verified (`docker compose run --rm app` does inherit the service's volumes; the `bot` service touches no storage and correctly needs neither; a named volume over an empty image path masks nothing and there is no prod data to migrate). But `pgdata`, `uploads` and `backups` all become named volumes on the SAME droplet filesystem, so an unpruned backup tree can fill the disk Postgres writes to. `statfs` free space is therefore shared, and `assertDestinationSafe` checks path containment only, not device.
- Test coverage: CONCERN — the tier assignments are real and the commands exist (`pnpm test` = vitest run; `pnpm test:e2e`; no `test:unit`). Three defects: (1) ten `T-M-01…T-M-09` IDs are referenced in §7/§8 and defined nowhere — the manual tests are named M0–M10; (2) AC-7 and AC-8 both cite `M5` as proof of crash-safety and concurrency, and M5 only reloads the run-history page — it tests neither; (3) the plan has no mutation-honesty step, despite `process/context/tests/all-tests.md` naming vacuous mocks as this repo's #1 false-green mode and the `backup-run` tests being entirely DB-mocked.
- Breaking changes: PASS — 2 new tables, 2 new enums, 2 new relations, 0 renames, 0 drops; `db push` is safe and no `scripts/migrate-*.ts` is needed (verified: the plan adds enums, it does not rename values). `storage.ts` is the only pre-existing runtime file touched and the change is a pure extraction guarded by the unmodified `tests/unit/storage.test.ts`. Verified that exactly two tables hold a `storageKey` (`prisma/schema.prisma:896`, `:937`) — no third document table is missed. `notifyMany(userIds, message, link?, kind?)` matches the plan's call. `requireAnyCapability` throws `error(403, 'Insufficient permissions')` — M1's asserted text is correct. One new external surface: `BackupRun.totalBytes BigInt` would be the first `BigInt` in the schema (verified: zero today).
- Security surface: CONCERN — the S1–S10 table is sound and the controls are real. `resolveWithin` extraction is correct reuse. Two gaps: `./backups` is not in `.gitignore` or `.dockerignore` while `/uploads/` is, so the dev default `BACKUP_DIR="./backups"` writes government IDs and contracts into the working tree where `git add -A` commits them; and the notification recipient query hard-codes `['SUPER_ADMIN','CEO']` instead of reading `CAPABILITIES.ADMINISTER_SYSTEM`, duplicating the capability table.
- Section §5 Schema: PASS — mechanical feasibility confirmed. The edit target `seven must INCLUDE tombstones` is uniquely matchable (1 hit, `prisma/schema.prisma:884`; the plan's cited range `875-888` is off by ~8 lines but the string is unambiguous). The seven→eight arithmetic is correct: the existing parenthetical names 5 items + "both storage scripts" = 7, and the backup collector is the 8th. `EmployeeDocument.storageKey` is non-nullable, so the collector's NOT-NULL note is vacuous but harmless. `Request.employeeId` and `Employee.userId` are both non-null, so both relation walks in the collector are safe.
- Section AD-007 Concurrency: CONCERN — see C-4, C-5, C-6 below.
- Section AD-008 Crash safety: CONCERN — see C-7, C-8 below.
- Section AD-005 S3: CONCERN — see C-9, C-10, C-11 below.
- Section ST5 Disk full: CONCERN — see C-12, C-13 below.
- Section §15 Compose volumes: PASS with one CONCERN (C-14) — the fix as written is correct.
- Section §13.1 UI reuse: PASS — every claimed prop signature was read from source and matches exactly. `PageHeader` `{title, description?, actions?, back?}` ✓. `Table` `{columns, rows, cell, getKey, onRowClick?, emptyTitle?, emptyDescription?, emptyVariant?, emptyAction?, caption?}` and it does render `EmptyState` itself at `rows.length === 0` ✓. `table.ts` `Column {key, label, align?, width?, hideOnMobile?}` ✓. `EmptyState {variant?, title, description?, action?}` ✓. `Toaster` takes no props and is mounted once at `src/routes/(app)/+layout.svelte:333` ✓. `addToast(message, {link?, kind?, timeout?})` ✓. `createSubmitGuard(inner?) → {busy, enhance}` ✓. The `super: true` settings-card pattern matches the existing entry at `src/routes/(app)/settings/+page.svelte:72`, and `/settings`'s load exposes `isSuperAdmin = canAny(roles,'ADMINISTER_SYSTEM')` — card and page agree. Note the two files are `submit-guard.svelte.ts` and `toast.svelte.ts` on disk; the plan's import specifiers are correct.
- Section §13.5 Manual GUI script: CONCERN — see C-15, C-16, C-17 below.
- Section §14 Scope: PASS — the out-of-scope list is honest and complete. No silent expansion beyond #164 was found. The two genuine additions (§15 compose volumes, the `storage.ts` extraction) are both argued as prerequisites in the plan text rather than smuggled in.

### Open gaps

- S3 destination against a live bucket: known-gap: documented as NEW PLAN REQUIRED — backlog stub `s3-destination-live-verification_NOTE_22-08-26.md`. Non-blocking; the LOCAL destination is fully provable.
- Prod volume mount surviving a redeploy: known-gap: documented as NEW PLAN REQUIRED — backlog stub `prod-upload-volume-verification_NOTE_22-08-26.md`. No prod or staging environment exists (owner-stated). Verified independently: `docker-compose.yml` defines only `pgdata`, and `.env.prod.example` contains no `UPLOAD_DIR`.
- Restore tooling: out of scope (§14) — backlog stub `document-restore-tooling_NOTE_22-08-26.md`.
- `scripts/backup-documents.ts` is not typechecked by any gate (`pnpm check` excludes `scripts/**` and `prisma/**` — confirmed in `process/context/tests/all-tests.md`). The plan's mitigation (thin script + one manual `tsc --noEmit`) is accepted. The plan does NOT rely on the false premise anywhere — checked.

### What this coverage does NOT prove

- `pnpm test tests/unit/backup-run.test.ts` (T-U-03, T-U-11, T-U-15): does NOT prove the Prisma query is actually tenant-scoped or that the real DB returns the rows the fixture returns. All `backup-run` tests are DB-mocked. It also does not prove the collector reads the two tables in one pass, or that a real tombstoned row behaves as the fixture claims.
- `pnpm test tests/unit/backup-plan.test.ts`: proves pure-function behaviour only. It does NOT prove `pg_try_advisory_lock` is actually taken, that the lock and unlock land on the same Postgres session, or that `connection_limit=1` survives a Prisma pool reconnect.
- `pnpm test tests/unit/backup-s3-sigv4.test.ts`: proves the signature matches one published vector. It does NOT prove any real S3-compatible endpoint accepts the request, that LIST pagination works past 1000 keys, or that DELETE succeeds against a provider requiring `Content-MD5`.
- `pnpm test tests/unit/backup-destination.test.ts`: proves the LOCAL fs path and the stubbed-`fetch` request shape. It does NOT prove real disk-full behaviour, real permission-denied behaviour, or that `0o700`/`0o600` survive the container's umask.
- M4/M5/M7/M8/M10 (hybrid, dev only): prove behaviour against ONE dev database with a handful of documents. They do NOT prove behaviour at 400+ files, do not prove concurrency (nothing in M0–M10 runs two processes), and do not prove anything about a Docker volume, because the dev run is on the host filesystem.
- M10 tripwire byte-identity: proves that this ONE run changed nothing under `UPLOAD_DIR`. It does not prove no code path could — that is the step-24 grep gate's job, and grep can be defeated by an aliased import.
- `pnpm test:e2e tests/e2e/backup-settings.spec.ts`: proves the route 403s an HR_ADMIN and 422s a bad interval. It does NOT prove the form action's second guard is reached (a test that only exercises `load` passes even if the action guard is missing — read the `actions` export, per the #290 lesson).
- `docker compose config` parsing: proves YAML validity only. It proves nothing about whether the volume is actually mounted, writable by the container user, or survives `docker compose pull && up -d`.

Gate: CONDITIONAL (17 concerns; 1 of them FAIL-severity and converted to a hard pre-EXECUTE instruction E-01; 3 known-gaps documented)
Accepted by: session — accepted concerns: C-1 backup output not gitignored (mitigated by E-01, must be done in Phase 0), C-2 hard-coded notification recipient roles, C-3 dangling T-M-* test IDs, C-4 advisory-lock namespace shared with payroll/timesheet, C-5 wedged-lock silent skip, C-6 unconditional unlock false alarm, C-7 manifest-present-but-row-RUNNING directory deleted, C-8 destination directories with no DB row never reconciled, C-9 AD-005 flip state undefined, C-10 S3 LIST pagination unspecified, C-11 `s3Request` return type cannot carry a LIST body, C-12 free-space estimate ignores retention multiplier, C-13 same-filesystem destination, C-14 backups volume shares the disk with pgdata, C-15 manual steps with negative-only assertions, C-16 `makeRunId` second-resolution collision under `--force`, C-17 fish-shell-invalid manual commands. Live S3 and the prod volume mount remain known-gaps by owner-stated environment constraint.

### Execute-agent instructions (binding)

| # | Instruction | Trigger |
|---|---|---|
| E-01 | **FAIL-severity, do this FIRST.** Add `/backups/` to `.gitignore` (next to the existing `/uploads/` entry) and `backups` to `.dockerignore` (next to the existing `uploads`), and add `.gitignore` + `.dockerignore` to §9's Modified list. Verify with `git check-ignore -q backups; echo $?` → `0`. Without this, the dev default `BACKUP_DIR="./backups"` and manual step M4 place real government IDs and contracts inside the working tree where `git add -A` commits them. | Phase 0, before any other edit |
| E-02 | Derive notification recipients from the capability table, not from role literals: `const roles = CAPABILITIES.ADMINISTER_SYSTEM` then `roles: { hasSome: [...roles] }`. Copy the pattern at `src/lib/server/services/action-proposals.ts:105-125`. Hard-coding `['SUPER_ADMIN','CEO']` (checklist step 20) duplicates `src/lib/rbac.ts:58` and silently misses any role added there later. | Phase 6, step 20 |
| E-03 | Renumber or resolve every `T-M-0N` reference in §7 and §8 to the matching `M0…M11` step before writing any test. Ten IDs are currently dangling. Specifically fix AC-7 and AC-8: neither is proven by M5 (M5 only reloads the run-history page). AC-7's hybrid proof is M7; AC-8's is the new M11 (E-11). | Phase 3, before writing tests |
| E-04 | Add a mutation-honesty pass to Phase 10: for each of T-U-03, T-U-04, T-U-05, T-U-14, T-U-15, break the production code on purpose (invert the status choice, drop the `retentionCount` slice, return a constant lock key, remove the tombstone inclusion) and confirm the test goes RED. Record each mutation and its result in the phase report. `process/context/tests/all-tests.md` names vacuous mocks as this repo's #1 false-green mode, and every `backup-run` test is DB-mocked. | Phase 10 |
| E-05 | Namespace the advisory lock away from the existing keys. `hashtext()` returns `integer` (verified live: 32-bit), and `pg_advisory_xact_lock(bigint)` at `src/lib/server/services/timesheets.ts:185` and `src/lib/server/services/payroll/index.ts:110` share that same single-argument namespace. A collision would make a minutes-long backup **block** a payroll or timesheet write (those calls are blocking, not `try`). Use the two-int form — `pg_try_advisory_lock(164, hashtext($1))` / `pg_advisory_unlock(164, hashtext($1))` — which is a separate namespace, and add a unit case asserting the two-argument form is what the script emits. | Phase 7, step 22 |
| E-06 | The claim "a hard kill cannot wedge the org" (AD-007) is over-stated: on a container kill that severs the network without a FIN, the Postgres backend holds the session lock until TCP keepalives expire. Because acquisition uses `try` and skips silently, an org can then stop being backed up indefinitely with no alarm — and the stale-RUNNING sweep cannot fire either, because it runs *after* the lock is taken. Add: when `pg_try_advisory_lock` returns false AND the org's newest `BackupRun` is `RUNNING` and older than `STALE_RUN_HOURS`, notify the org's `ADMINISTER_SYSTEM` holders and set the process exit code to 1. | Phase 7, step 22 |
| E-07 | Only call `pg_advisory_unlock` in `finally` when the lock was actually acquired. The plan asserts the unlock result is `true` and "logs loudly" otherwise; an unconditional unlock on a skipped org returns `false` every time and turns that alarm into noise. | Phase 7, step 22 |
| E-08 | Close the AD-008 window: a directory that HAS `manifest.json` but whose row is still `RUNNING` is a **complete** backup whose status write was lost. The plan currently flips it to `FAILED` and lets the prune pass delete it — destroying a good backup. In the stale-run sweep, check the destination for `manifest.json` first: if present, promote the row to `SUCCESS`/`PARTIAL` from the manifest's counts; only if absent flip to `FAILED` and delete. | Phase 6, step 19 |
| E-08 (as built) | The instruction above was implemented but with an age gate inherited from the surrounding query, and that gate reopened the window it was meant to close: the promotion branch only fired for rows older than `STALE_RUN_HOURS`, so a crash between the manifest write and the status update left a YOUNG `RUNNING` row that `pruneRuns` deleted. **Shipped behaviour:** the sweep reads every `RUNNING` row for the org regardless of age; manifest present → promote at any age; manifest absent → keep the 12h gate before `FAILED` + delete. Safe because the per-org advisory lock is held around the entire run, so a `RUNNING` row seen here cannot belong to a live process. | Fixed post-EXECUTE |
| E-09 | Either wire `listRunIds` into the prune pass or delete the export. §6.3 exports it, and the §4 data flow never calls it — pruning is driven purely off `BackupRun` rows. Consequence today: after a DB reset or restore, destination directories with no matching row are never counted toward retention and never removed, so the destination grows without bound. Recommended: reconcile `listRunIds(dest, orgId)` against the run rows and delete unreferenced directories. Also make `deleteRun` idempotent (tolerate `ENOENT`) — with rows kept forever, already-pruned runs are re-selected by `runsToPrune` on every subsequent run. | Phase 5 / Phase 6 |
| E-10 | Define the AD-005 flip state concretely before Phase 4 starts, so "S3 ships disabled" is a specification and not a wish: (a) the `BackupDestinationKind` enum keeps `S3` (schema unchanged); (b) `destinationFromEnv('S3')` throws a named, secret-free error; (c) the settings form's `destinationKind` select renders the `S3` option `disabled` with the label `S3-compatible (not implemented)`; (d) the zod enum still accepts `'S3'` but the action returns `fail(422)` for it; (e) AC-5 is rewritten as a known-gap for that cycle. **Acceptable vector sources** (network reachability from this box verified: `docs.aws.amazon.com` → 200): AWS's published SigV4 worked example (`AKIDEXAMPLE` / `20150830T123600Z` / region `us-east-1` / service `service`) in the AWS General Reference, or the `aws-samples/sigv4-signing-examples` repository. The retired `aws-sig-v4-test-suite.zip` download is NOT required. Copy the expected hex verbatim; a value produced by our own signer and pasted back proves only determinism. | Phase 4, step 11 |
| E-11 | Add manual step **M11 (concurrency)**: with a marker file present, run `env BACKUP_DIR=$PWD/backups pnpm exec dotenv -e .env.dev -- tsx scripts/backup-documents.ts --force &` twice in the same second. **Assert positively:** exactly one process prints `N file(s) copied`, the other prints `another backup is already running — skipped`; `ls backups/org_veent/ \| wc -l` increases by exactly `1`; and `select count(*) from backup_runs where status='RUNNING';` returns `0` after both exit. Nothing in M0–M10 tests concurrency today, yet AC-8 claims a hybrid proof. | Phase 10, step 34 |
| E-12 | Make `makeRunId` collision-safe. It is second-resolution (`2026-08-22T023000Z`), and M7 runs `--force` four times back-to-back — two runs completing inside one second produce the same `runId` and write into the same directory, which breaks M7's own `ls \| wc -l == 3` assertion and silently merges two backups. Either append milliseconds plus a 4-char random suffix, or have the LOCAL/S3 writer refuse to write into an existing run prefix. | Phase 3, step 9 |
| E-13 | Fix the free-space pre-flight. Three corrections: (a) sum `size` across **both** `EmployeeDocument` and `RequestDocument`, not just one; (b) `EmployeeDocument.size`/`RequestDocument.size` are stored `Int`s that can disagree with the file on disk, so state in a comment that the estimate is advisory and that the mid-copy `ENOSPC` path (ST5's second half) is the real guard; (c) the estimate must account for the fact that pruning happens **after** the run — at peak the destination holds `retentionCount + 1` full copies, so with the default `retentionCount: 7` the volume needs roughly 8× a full copy, not 1.1×. Either check `(K+1) × sum(size)` on the first run of a fresh destination, or prune to `K-1` before copying and document the trade. | Phase 5 / Phase 6 |
| E-14 | Add a device check to `assertDestinationSafe`, or log it loudly at start: `statfs`/`stat().dev` for `BACKUP_DIR` and `UPLOAD_DIR`. Path containment is not the only hazard — in the §15 compose fix, `pgdata`, `uploads` and `backups` are all named volumes under `/var/lib/docker/volumes` on one droplet filesystem, so a backup tree that fills the disk takes Postgres down with it. At minimum print `WARNING: BACKUP_DIR shares a filesystem with UPLOAD_DIR` and record it in `scripts/README.md`'s §11 section. | Phase 7 + Phase 9 |
| E-15 | Convert `BackupRun.totalBytes` to a plain `number` at the service boundary (`src/lib/server/services/settings/backup.ts`) before it reaches `load`. This would be the **first** `BigInt` in the schema (verified: zero today, and `src/hooks.ts` only transports `Decimal`). `devalue@5.8.1` does serialize it (verified round-trip → `bigint` on the client), but any client-side formatting — `totalBytes / 1024`, `.toLocaleString()` mixed with a number — throws `TypeError: Cannot mix BigInt and other types`. Keep `BigInt` in the column; convert at the read. | Phase 8, step 25 |
| E-16 | Fix the manual-test commands for the user's shell. `BACKUP_DIR=$PWD/backups pnpm exec …` (M4) and `BACKUP_DIR=$PWD/uploads/bk pnpm exec …` (M9) are bash syntax and are **invalid in fish**, which is this operator's shell. Rewrite both as `env BACKUP_DIR=$PWD/backups pnpm exec dotenv -e .env.dev -- tsx scripts/backup-documents.ts`. Also give M3's psql assertion in full: `docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris -c 'select enabled, "intervalDays", "retentionCount" from backup_configs;'`. Note that `dotenv-cli` does not override already-set environment variables, so the `env` prefix does win over a `BACKUP_DIR` line in `.env.dev` — this is load-bearing for M9. | Phase 10, step 34 |
| E-17 | Raise the two negative-only manual assertions to the repo bar (`process/context/tests/all-tests.md`: "The card is absent proves nothing"). **M1:** alongside "no tile titled Document Backup", assert a positive control — that a tile the HR Admin *does* hold is present (e.g. `Company Information`) — so a mistyped selector cannot pass as a missing tile. **M9:** alongside "no `bk` directory", assert positively that the process printed `backup destination must not be inside UPLOAD_DIR`, that its exit status is non-zero (`echo $status` in fish), and that `find uploads -type f \| wc -l` prints the same number recorded before the step. | Phase 10, step 34 |
| E-18 | `resolveWithin` must reject the root itself. The current `resolveKey` check at `src/lib/server/storage.ts:63-67` allows `abs === UPLOAD_DIR` (so `''` or `'.'` resolves to the directory). Preserve the behaviour for `resolveKey` if `tests/unit/storage.test.ts` depends on it, but have the destination writer reject an empty or `.`-resolving `relPath` outright, and add that case to T-U-01. This is the plan's single security check for path containment; it should not return a directory. | Phase 2, step 6 |
| E-19 | Add a Phase 5 test case for S3 LIST pagination. `listRunIds` must follow `IsTruncated`/`NextContinuationToken`; with per-file objects at hundreds-to-thousands of keys, a single unpaginated `ListObjectsV2` silently caps at 1000 and prunes only part of a run. Also: use per-object `DELETE` rather than the batch `DeleteObjects` POST (which several S3-compatible providers require a `Content-MD5` for), and widen `s3Request`'s declared return type from `Promise<void>` — as declared in §6.3 it cannot carry the XML body `listRunIds` needs. | Phase 4 / Phase 5 |

### Backlog artifacts (write during EXECUTE)

| Artifact | Location | What it tracks |
|---|---|---|
| `s3-destination-live-verification_NOTE_22-08-26.md` | `process/features/document-autobackup/backlog/` | The S3 path is CONDITIONAL, not verified. Smoke-test the first time a bucket exists. |
| `prod-upload-volume-verification_NOTE_22-08-26.md` | `process/features/document-autobackup/backlog/` | The `uploads`/`backups` volume mounts are unproven until a prod environment exists. |
| `document-restore-tooling_NOTE_22-08-26.md` | `process/features/document-autobackup/backlog/` | Restore is out of scope; the interim procedure lives in `scripts/README.md`. |
| `typecheck-scripts-and-prisma_NOTE_22-08-26.md` | `process/features/development-process/backlog/` | No gate typechecks `scripts/**` or `prisma/**`; one site has already shipped broken on that gap (#282). |

## Autonomous Goal Block

```
SESSION GOAL
Implement issue #164 (automatic document backup) on branch feat/document-autobackup-164 in
/home/hyuse/Desktop/VeentApps/veent_hris, following
process/features/document-autobackup/active/document-autobackup-164_22-08-26/document-autobackup-164_PLAN_22-08-26.md
checklist Phases 0-10 in order, subject to the 19 binding execute-agent instructions (E-01 .. E-19)
in that plan's ## Validate Contract section.

CONTRACT SUMMARY
Gate: CONDITIONAL. 17 accepted concerns, all closed by E-01..E-19. Three known-gaps stand and are
non-blocking: live S3 write, prod volume mount, restore tooling. There is NO prod and NO staging
environment - dev is the only running database. Any verification step that needs prod or staging is
invalid; do not invent one.

AUTONOMY RULES
- Follow the checklist order. Phase 0 is the tripwire snapshot; E-01 (.gitignore/.dockerignore for
  backups) runs FIRST, before any other edit.
- TDD: write the failing test before the implementation in Phases 3-6.
- pnpm check does NOT cover prisma/** or scripts/**. Never treat a green `pnpm check` as proof that
  scripts/backup-documents.ts or prisma/schema.prisma compiles. Run
  `pnpm exec tsc --noEmit scripts/backup-documents.ts` by hand in Phase 10.
- A green suite is not a working guard. Run the E-04 mutation pass and record every mutation result.
- Prefer reuse over reinvention: CAPABILITIES from src/lib/rbac.ts, resolveWithin from storage.ts,
  the existing ui/ components with the signatures verified in plan section 13.1.
- Commit in logical chunks on the feature branch. Do not push and do not open a PR unless asked.
- Blocked on something out of scope: write a backlog NOTE and continue with the remaining phases.

HARD STOPS (ask before proceeding)
- Any git push, PR creation, or anything reaching an audience outside this machine.
- Any change to prod configuration or any action requiring a prod/staging environment.
- Phase 4: if AWS-published SigV4 vectors cannot be obtained, apply the AD-005 flip exactly as
  specified in E-10 (ship S3 disabled) - do not ship a self-verified signer.
- Any destructive operation against uploads/ or the dev database beyond `pnpm db:push`.

NEXT PHASE
None. EXECUTE completed 22-08-26; the GUI manual gates closed 25-08-26. PR #322 is open
against `staging`.

EXECUTE START COMMAND
Superseded — do not run. This block is kept only so the record of what was asked for stays
intact. See the `_REPORT_` file for what was built, and the `backlog/` notes for what was not.
```
