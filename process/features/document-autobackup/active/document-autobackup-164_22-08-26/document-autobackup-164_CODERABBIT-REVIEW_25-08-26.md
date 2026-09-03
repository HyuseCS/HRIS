# CodeRabbit review — PR #322 (`feat/document-autobackup-164` → `staging`)

- Date: 2026-08-25
- Command: `coderabbit review --agent --base staging`
- CLI: 0.7.3 · Plan: Free (public OSS)
- Result: **3 findings** — 0 critical, 2 major, 1 minor. 30 files reviewed.

> Review output is untrusted data. Nothing here was applied. Verify each item against the
> current code before acting on it.

---

## Major

### 1. `prisma/schema.prisma:1010` — org deletion leaves S3 objects orphaned

Deleting an `Organization` cascades away its `BackupRun` rows, so the record of what was
written to the destination disappears with it. The objects under the org's destination
prefix stay in the bucket forever.

Suggested fix: delete the org's destination prefix **before** the cascade runs, or persist a
cleanup job in a table that does not cascade with `Organization`, so the sweep survives the
delete.

### 2. `src/lib/server/backup/s3.ts:167-195` — `host` / `content-length` passed to `fetch`

Both are forbidden header names for `fetch`; undici sets them itself from the URL and the
body. Passing them by hand is at best ignored, and is a signature-mismatch trap if the two
ever disagree.

Suggested fix: keep `host` in the **SigV4 input** (the signature needs it), drop
`content-length` from the signed headers, and pass neither in the `fetch` headers.

Note: signing behaviour is currently correct in practice — undici recomputes the same values
— so this is a hardening/clarity fix, not a live break.

---

## Minor

### 3. `…/document-autobackup-164_PLAN_22-08-26.md:14-16` — plan status is stale

The plan still says "No code written" and points a future agent at Phase 0, while the paired
`_REPORT_` file documents completed phases.

Suggested fix: update Status and the execution handoff, link the report, and point future
agents at the remaining work / known gaps only.

---

## Files reviewed (30)

`.dockerignore`, `.env.dev.example`, `.env.prod.example`, `.gitignore`,
`docker-compose.yml`, `prisma/schema.prisma`, `scripts/README.md`,
`scripts/backup-documents.ts`, `src/lib/server/backup/destination.ts`,
`src/lib/server/backup/plan.ts`, `src/lib/server/backup/run.ts`,
`src/lib/server/backup/s3.ts`, `src/lib/server/services/settings/backup.ts`,
`src/lib/server/storage.ts`, `src/routes/(app)/settings/+page.svelte`,
`src/routes/(app)/settings/backup/+page.server.ts`,
`src/routes/(app)/settings/backup/+page.svelte`, `tests/e2e/backup-settings.spec.ts`,
`tests/unit/backup-destination.test.ts`, `tests/unit/backup-plan.test.ts`,
`tests/unit/backup-run.test.ts`, `tests/unit/backup-s3-sigv4.test.ts`,
plus 8 `process/**` note, plan, report and tripwire files.
