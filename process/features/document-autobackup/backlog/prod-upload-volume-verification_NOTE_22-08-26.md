---
name: note:prod-upload-volume-verification
description: "OPEN — docker-compose.yml now mounts uploads and backups as named volumes (#164 §15), but no environment exists to prove the mounts survive a redeploy"
date: 22-08-26
feature: document-autobackup
---

# Known gap — the uploads/backups volume mounts are unproven (#164 §15)

**Status: OPEN.** The fix is committed; the verification is impossible here.

## The defect that was fixed

Before #164, `docker-compose.yml` defined exactly one volume, `pgdata`. There was **no**
volume for `UPLOAD_DIR`, and `.env.prod.example` did not set `UPLOAD_DIR` at all — so in a
production deployment every 201 file was written to `/app/uploads` **inside the container**,
and `docker compose pull && docker compose up -d` (the documented deploy) destroyed them.

This is guaranteed data loss, and it is not tangential to the backup feature: the backup
script runs via `docker compose run --rm app`, whose container filesystem is discarded on
exit. Without the mounts, the feature would have faithfully copied every document into a
directory deleted seconds later.

## What was verified

`docker compose config` parses and resolves both mounts:

```
uploads -> /app/uploads   (named volume veent_hris_uploads)
backups -> /app/backups   (named volume veent_hris_backups)
```

## What is NOT verified

- That the volumes are actually created on the droplet.
- That they are writable by the container user.
- That they survive `docker compose pull && docker compose up -d`.
- That existing container-local files are migrated (there are none to migrate today —
  but if a deploy has already happened, whatever is in the container layer is already lost).

There is no prod or staging environment, so none of this can be exercised.

## How to close it

On the first real deploy: `docker compose up -d`, upload one document through the UI,
`docker compose pull && docker compose up -d`, then confirm the document still downloads.

## Pre-cutover step — DO THIS BEFORE the first volume-backed `up -d` (PR #322 review)

Adding `uploads:/app/uploads` **hides** anything already sitting at that path in the container
layer. The mount shadows it; the old bytes are not copied, and they are gone for good once the
old container is removed. On a box that has already run a deploy, copy them out first:

```bash
# 1. Is there anything to save? Run against the OLD (pre-mount) container.
docker compose exec app sh -c 'find /app/uploads -type f | wc -l'

# 2. If that count is non-zero, copy the tree to the host BEFORE changing docker-compose.yml.
docker compose cp app:/app/uploads ./uploads-preserved

# 3. Bring up the new compose file, then copy the tree into the named volume.
docker compose up -d
docker compose cp ./uploads-preserved/. app:/app/uploads

# 4. Prove it, positively — the count must match step 1, not merely be non-zero.
docker compose exec app sh -c 'find /app/uploads -type f | wc -l'
```

Then the post-redeploy check: open a document that existed **before** the cutover in the UI and
confirm it downloads and opens. A 200 with zero bytes is the failure this catches; asserting the
page merely renders proves nothing.

If step 1 returns `0`, there is nothing to migrate and the mount is safe to add directly.

## Related concern (do not lose)

`pgdata`, `uploads` and `backups` are all named volumes on ONE droplet filesystem. An
unpruned backup tree can therefore fill the disk Postgres writes to. The script warns
(`WARNING: BACKUP_DIR shares a filesystem with UPLOAD_DIR`) but cannot refuse — on a
single-volume box there is no other option. Keep `retentionCount` low until backups live on
separate storage.
