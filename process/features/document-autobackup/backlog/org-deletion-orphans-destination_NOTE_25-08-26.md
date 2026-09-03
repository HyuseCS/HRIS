---
name: note:org-deletion-orphans-destination
description: "OPEN but UNREACHABLE — deleting an Organization cascades away its BackupRun rows while the copied bytes stay on the destination forever; no org-delete path exists in the app today"
date: 25-08-26
feature: document-autobackup
---

# Known gap — deleting an organization orphans its backup objects

**Status: OPEN, but not reachable through the application.** Raised by the CodeRabbit CLI
review of PR #322 (`prisma/schema.prisma:1010`). Filed rather than built, deliberately.

## The finding

Both backup tables cascade on the organization:

```prisma
organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
```

`backup_configs` and `backup_runs` both carry it. So deleting an `Organization` destroys the
only record of what was written to that org's destination prefix, while the bytes themselves —
a full copy of every 201 file and request attachment — stay in the bucket or on the disk
indefinitely. Nothing afterwards knows they exist or that they may be deleted.

For an S3 destination that is a recurring cost. For either destination it is a pile of
government IDs and contracts with no owner and no retention clock, which is the more serious
half.

## Why it was NOT fixed in #322

**There is no org-delete path.** `organization.delete` and `organization.deleteMany` appear
**zero** times across `src/`, `scripts/` and `prisma/` — verified 25-08-26. Reaching this
requires someone running SQL by hand against the database.

Building prefix-cleanup, or a cleanup-job table that survives the cascade, would be
speculative infrastructure for a code path that does not exist. It would also have to be
written against a live S3 destination, which is itself an open gap
(`s3-destination-live-verification_NOTE_22-08-26.md`) — so it could not be verified either.

## When this stops being theoretical

The moment **any** of these lands, this note becomes real work and should be done in the same
change, not after it:

- An org-offboarding or tenant-deletion feature of any kind.
- An admin action that deletes an `Organization` row.
- Any data-retention or GDPR-style erasure requirement covering documents.

## How to close it

Preferred: delete the destination prefix **before** the cascade runs, inside the same
transaction that removes the org, so a failure aborts the delete rather than half-completing.

Fallback if the destination is slow or unreliable: persist a cleanup job in a table that does
**not** cascade with `Organization` (nullable `organizationId`, or the prefix stored as a plain
string), so the sweep still knows what to remove after the org row is gone.

Whichever is chosen, it needs the live-S3 gap closed first — a cleanup path that has never
deleted a real object is not a cleanup path.

## Related

- `s3-destination-live-verification_NOTE_22-08-26.md` — blocks verifying any of this.
- `document-restore-tooling_NOTE_22-08-26.md` — the other half of destination lifecycle.
