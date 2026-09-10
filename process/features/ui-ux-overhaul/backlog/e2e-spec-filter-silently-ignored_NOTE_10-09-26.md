---
name: note:e2e-spec-filter-silently-ignored
description: "pnpm test:e2e -- <specs> ignores the spec names and runs all 143 tests; every scoped-e2e claim in this repo's history is suspect"
date: 10-09-26
feature: ui-ux-overhaul
---

# `pnpm test:e2e -- <specs>` does not filter. It runs the whole suite.

**Live footgun, not history.** Found in §4 of the B2/B3/B5 feedback plan, 10-09-26.

## What happens

`package.json:15` defines:

```
"test:e2e": "dotenv -e .env.dev -- playwright test"
```

The script already ends in a `--` passthrough for `dotenv`. Running
`CI=1 pnpm test:e2e -- approval-chain multi-role-sod timesheet-approval` therefore produces

```
dotenv -e .env.dev -- playwright test -- approval-chain multi-role-sod timesheet-approval
```

Playwright sees a stray literal `--` and **ignores the spec names**. It runs the entire suite —
143 tests — and says nothing about it.

## How it surfaced

§4 asked for a scoped 3-spec run. The run took far longer than 5 tests should and reported the
pre-existing, unrelated `attendance-save-timesheet-custom-range.spec.ts` failure, which is not in
any of the three named specs. Confirmed against `--list`: the working form lists 5 tests in 3
files, the broken form lists everything.

## The working form

```
CI=1 pnpm exec dotenv -e .env.dev -- playwright test <specs>
```

`CI=1` is still required — `playwright.config.ts:23` sets `workers: 1` under CI, which is what
removes the cross-spec fixture race on the shared `.env.dev` database.

## Why this matters beyond one session

**Anyone who has ever run a scoped e2e in this repo actually ran all 143 tests.** Every plan,
phase report, and validate contract that recorded a small filtered pass or a specific failure from
`pnpm test:e2e -- <specs>` was reading whole-suite output. A failure may have been mis-attributed
to the specs named on the command line when it came from somewhere else entirely — that is exactly
what happened in §4.

## The fix

Either:

1. Fix the script so the passthrough works — e.g. `"test:e2e": "dotenv -e .env.dev -- playwright test --"` is **not** the answer; the cleanest is to drop the script's reliance on `pnpm run` arg forwarding and document `pnpm exec` as the scoped form, or
2. add a second script, e.g. `"test:e2e:only": "dotenv -e .env.dev -- playwright test"` invoked via `pnpm exec`, and make `test:e2e` whole-suite-only by name.

Not fixed here — it is a `package.json` change outside the feedback plan's blast radius, and the
choice between (1) and (2) is the owner's. The invocation quirk is documented in
`process/context/tests/all-tests.md` in the meantime.
