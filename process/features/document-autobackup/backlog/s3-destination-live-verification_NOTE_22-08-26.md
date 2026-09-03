---
name: note:s3-destination-live-verification
description: "OPEN — the S3 backup destination is proven by unit test against AWS's own SigV4 vectors, but has never spoken to a real bucket. Smoke-test the first time one exists"
date: 22-08-26
feature: document-autobackup
---

# Known gap — the S3 destination has never talked to a real endpoint (#164)

**Status: OPEN.** The `S3` option ships working but **CONDITIONAL, not verified**.

## What IS proven

`tests/unit/backup-s3-sigv4.test.ts` pins the signer to AWS's own published SigV4 test
suite (mirrored in `awslabs/aws-c-auth`; the standalone `aws-sig-v4-test-suite.zip` AWS
used to host is now a 404). Four cases: `get-vanilla`, `get-vanilla-query-order-key-case`,
`get-unreserved`, `post-x-www-form-urlencoded`. Every expected hex is copied verbatim —
none of it was produced by our signer and pasted back.

`tests/unit/backup-destination.test.ts` proves the request SHAPE against a stubbed
`fetch`: the URL, `PUT`, the real payload hash in `x-amz-content-sha256` (never
`UNSIGNED-PAYLOAD`), failing closed on 403, LIST following
`IsTruncated`/`NextContinuationToken`, and per-object `DELETE`.

## What is NOT proven

- That any real S3-compatible endpoint accepts these requests.
- That LIST pagination behaves as assumed past 1000 real keys.
- That `DELETE` succeeds against a provider requiring `Content-MD5`.
- That the endpoint's clock skew tolerance accepts our `x-amz-date`.

## Why it cannot be closed now

There is no prod and no staging environment — dev is the only running database — and no
S3-compatible bucket is provisioned. This is an owner-stated constraint, not an oversight.

## How to close it

The first time a bucket exists: set `BACKUP_S3_*` in the environment, switch one org's
`destinationKind` to `S3`, run `pnpm exec dotenv -e .env.dev -- tsx scripts/backup-documents.ts --force`,
and confirm the objects and `manifest.json` land under `<prefix>/<orgId>/<runId>/`. Then run
it twice more with `retentionCount: 1` and confirm the older run's objects are actually
deleted — that is the LIST + DELETE path, which the local destination cannot exercise.
