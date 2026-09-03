---
name: note:document-restore-tooling
description: "OPEN — #164 ships backup without restore. The interim manual procedure is recorded in scripts/README.md; a real tool needs its own design"
date: 22-08-26
feature: document-autobackup
---

# Out of scope — restore tooling (#164 §14)

**Status: OPEN.** Deliberately not built.

## Why backup shipped without it

Restoring is a rarer and higher-stakes operation than backing up, and deserves its own
design: conflict handling (a file that already exists), row re-creation (a document row
deleted after the backup was taken), tenant selection, and a dry-run diff. Shipping backup
alone still moves the system from ONE copy of every contract and government ID to TWO,
which is the entire risk being retired.

## The interim procedure (also in `scripts/README.md`, so it is not only in a plan file)

1. Pick a run directory whose `manifest.json` exists — a directory WITHOUT one is by
   definition incomplete (the manifest is written last, on purpose).
2. Copy `files/` back under `UPLOAD_DIR`, preserving relative paths. Every manifest entry's
   `path` is exactly `files/` + that row's `storageKey`, so no name mapping is needed.
3. Reconcile the rows against `manifest.json`. `files[]` carries the row id, employee
   number, category, label, original filename, MIME, size, upload date and SHA-256.
4. `skipped[]` lists rows whose bytes were already evicted (#299 tombstones). Those files
   do not exist anywhere and cannot be restored — the entry exists so a restorer can see
   the row existed and why nothing was saved for it, rather than silently missing it.
5. Verify with `sha256sum` against the manifest before trusting the restore.

## What a real tool would add

A dry-run diff (what would change), refusal to overwrite a file whose hash already matches,
per-tenant selection, and a report of rows in the manifest that no longer exist in the
database.
