---
name: report:performance-eval-bimonthly-178-phase-8
description: Phase 8 EXECUTE report — items 150-157 (release-gated redaction, releaseReview, the release action and button, three test files); item 158 live verification not in scope
date: 27-08-26
phase: "8"
status: COMPLETE
feature: performance-eval-bimonthly-178
plan: process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_PLAN_25-08-26.md
metadata:
  node_type: memory
  type: report
  feature: performance-eval-bimonthly-178
  phase: 8
---

# Phase 8 — Release gate and API-layer redaction (items 150-157)

## What Was Done

**150 — `redactHrAuthored` → `redactForSubject`, release-gated.** One added line:
`if (review.releasedAt) return review`. `managerComments` and `overallRating` ride the same gate
as `answers` — they hold the same class of content on pre-#178 rows, and AC6 says the employee
sees NOTHING evaluator-authored until release, not "nothing except the two legacy columns".
Withheld by default: a review whose `releasedAt` was never selected arrives as `undefined`, which
is falsy, so the gate closes. Renamed at every site; **no alias kept**.

Call sites found by grep — the plan named three plus one mock; the real count is **three call
sites, one stale comment and three test files**:
`src/routes/(app)/performance/+page.server.ts`,
`src/routes/(app)/performance/reviews/[id]/+page.server.ts`,
`src/routes/api/v1/performance/reviews/+server.ts`, a comment in the review `+page.svelte`,
`tests/unit/performance-redact.test.ts`, `tests/unit/review-privacy.test.ts`, and
`tests/unit/performance-api-redaction.test.ts` (the plan does not mention this last one).

**151 — `releaseReview(id, organizationId, userId, ctx)`.** Org-scoped through
`cycle.organizationId`. Idempotent: a second release returns early with no write, no audit row and
no notification. Audits inside the transaction with `tx` as the third argument (#324). Notifies the
employee AFTER the commit and only on a real release, via `notify(...,'PERFORMANCE')`.

**152 — the `release` action**, `requireAnyCapability(roles,'ADMINISTER_HR_ORGWIDE')` as its first
line, before any form read. It throws rather than returning `fail(403)`, matching
`performance/templates/[id]/+page.server.ts:57`. `load` now calls `redactForSubject` and returns
`canRelease`.

**153 — the UI.** The Release button sits on the **Evaluation section's heading row**, not the page
title row (the swept app-wide header rule). Once released the same row reads
"Released by {name} on {date}". A subject viewing an unreleased review gets the explicit sentence
"Your evaluator's entries are not yet released by HR…", branched BEFORE the read-back, so a
released subject falls through to the real form.

**154 — `tests/unit/performance-release.test.ts`** (11 tests, new). Real action + real service +
mocked db, so a refusal is provably "never reached the database".

**155 — `tests/unit/performance-redact.test.ts`** rewritten (12 tests). Unreleased / released /
both-states / not-mutated, field by field, with a whole-object token sweep on each side.

**156 — `tests/unit/review-privacy.test.ts`** extended (8 tests) with an API-route-level pair and a
MANAGER-403 re-proof against a template-based review.

**157** — `pnpm test` 173 files / **2031 passed**; `pnpm check` **0 errors**, 1 pre-existing
warning (`CalculatorWindow.svelte:82`); `pnpm lint` 0 errors; `prettier --check` clean.

## Two things the plan got wrong

**1. `releasedByUserId` is not a user id.** `schema.prisma:1716` declares
`releasedBy Employee? @relation("ReviewReleasedBy", fields: [releasedByUserId], references: [id])`,
and the live database agrees:
`performance_reviews_releasedByUserId_fkey FOREIGN KEY ("releasedByUserId") REFERENCES employees(id)`.
The column is named for a User and keyed to an Employee. That defect came in with the plan's own
§3.4 diff in Phase 2. Meanwhile item 151 hands the service a `userId`, and every action in this
feature passes `locals.user!.id` — a real User id. Writing that straight into the column would
violate the FK on every release.

Resolved **without a schema change** (a schema change is hard-stop class and Phase 8 is not the
place): the parameter stays the actor's User id as item 151 specifies, and the service resolves it
to the actor's employee row before writing. An HR user with no employee record still releases, with
the attribution column left null — the FK is already `ON DELETE SET NULL`, so absent attribution is
a state the schema allows, and the audit row names the actor in its own `actorId` regardless.
Refusing the release instead would strand the employee behind a column-naming bug. **The rename
belongs in a follow-up**; it is a column rename plus a migration, not Phase 8 work.

**2. The call-site list was short again.** Item 150 names three call sites "plus the mock at
`tests/unit/review-privacy.test.ts:31`". `tests/unit/performance-api-redaction.test.ts` also names
the function twice and is not listed. Third time in this issue the plan's site list has been
incomplete.

## Mutation Results (test-by-test)

Every mutation was reverted by re-editing from a scratchpad copy and confirmed byte-identical with
`diff`. **No `git checkout` was used on any tracked file.**

| # | Mutation | Result |
|---|---|---|
| 1 | `release` guard swapped to `MANAGE_HR` | **RED** — `performance-release.test.ts` › "403s a MANAGER and never touches the database — the MANAGE_HR trap". Resolved `{success:true}` instead of rejecting. This is the #133 trap firing exactly as designed. |
| 2 | idempotency early-return deleted | **RED ×2** — "does not write again — the first attribution and timestamp stand", "writes no audit row and sends no second notification". |
| 3a | release gate deleted (always redact) | **RED ×4** — `performance-redact` › "returns answers intact", "returns the manager comments and rating intact", "every withheld token is now present"; `review-privacy` › "hands it over once HR has released it". |
| 3b | release gate inverted (always open) | **RED ×8** — `performance-redact` ×4 including "redacts a review whose releasedAt was never selected"; `performance-api-redaction` ×2; `review-privacy` › "still lets the subject read their own review, redacted" and › "withholds the evaluation from its subject while it is unreleased". |

3a and 3b are run separately on purpose: 3a proves the released side is real, 3b proves the
withheld side is real. A single mutation would only have proved one of them.

## Traps Handled

- **The `review-privacy.test.ts` mock export list.** It has broken three times in this issue and a
  partial factory can also go green while proving nothing. Replaced with
  `vi.mock(path, async (importOriginal) => ({ ...actual, getReview, redactForSubject }))`. A new
  export never breaks this file again, and `redactForSubject` is now a **spy wrapping the real
  function** — the call assertions still work and the redaction assertions run against real data.
- **A partial leak passes a naive assertion.** Every redaction assertion is paired with a
  whole-object `JSON.stringify(...)` sweep over a named token list (`crit_quality`, `88`,
  `Closes hard deals.`, `band_outstanding`, `private`, …), in `performance-redact.test.ts`,
  `review-privacy.test.ts` and the pre-existing `performance-api-redaction.test.ts`.
- **Positive controls.** The API-layer case asserts `employeeComments` and `selfAssessment` ARE
  present in the same response the evaluator tokens are absent from, so the probe is proven able to
  see anything at all.
- **A nullable bound coerces.** No numeric comparison was added. The two new conditions are
  `if (review.releasedAt)` and `r.releasedAt != null` — truthiness on a `Date | null`, no `>`/`<`.
  Both directions were mutation-proven above (3a and 3b).
- **A SvelteKit action name is not typechecked.** **I ran the cross-check explicitly.** The five
  `action="?/…"` values in the svelte file are `attest`, `release`, `saveEmployeeComments`,
  `saveSelf`, `submitScores`. The `actions` export declares `saveSelf`, `submitScores`,
  `saveEmployeeComments`, `acknowledge`, `release`, `attest`. **All five referenced names exist.**
  `acknowledge` is exported and never posted to from this page — pre-existing, not touched.
- **No arithmetic.** `performance-no-scoring.test.ts` passes. Nothing added sums, weights or
  derives; the release gate is one truthiness test.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| Unit | `pnpm test` | PASS — 173 files, 2031 tests (was 2011; +20) |
| Types | `pnpm check` | PASS — 0 errors, 1 pre-existing a11y warning |
| Lint | `pnpm lint` | PASS — 0 errors, same 1 warning |
| Format | `pnpm exec prettier --check` | PASS on all nine touched files |

## What Was Skipped or Deferred

- **Item 158 (live before/after verification)** — outside the assigned 150-157 range. Not run.
- **The `releasedByUserId` rename** — needs a schema change and a migration. Deferred; see above.

## Plan Deviations

- `managerComments` / `overallRating` were put behind the release gate as well as `answers`. Item
  155 enumerates only `answers`. Within blast radius, and required by AC6 as written.
- `getReview`'s include gained `releasedBy: { select: { firstName, lastName } }` for item 153's
  "released by X on Y" line. Not spelled out in the plan; the line cannot be rendered without it.
- `releasedByUserId` is written as the actor's **employee** id, resolved from the `userId`
  parameter. Forced by the FK. See above.

## Test Infra Gaps Found

- `CONTEXT_PARTIAL: performance-review notifications` — `attestSignoff` and its neighbours in
  `services/performance.ts` notify nobody, so item 151's "copy how the neighbours notify" had no
  local precedent. Copied `$lib/server/services/notifications.notify` with the `PERFORMANCE` kind
  instead.

## Closeout Packet

- Selected plan: `…/performance-eval-bimonthly-178_PLAN_25-08-26.md`, items 150-157.
- Finished and verified: all eight items; four gates green; four mutations RED then reverted.
- Still unverified: item 158's live browser/curl pass; the `releasedByUserId` FK against a real
  release (no release has been performed against the live DB).
- Next: **Phase 8 item 158**, then `PHASE 9 — Reminders cron and real SMTP email` in the same plan.
- Closeout state: **Keep in active/testing** — item 158 is unrun and Phases 9+ remain.

## Forward Preview

**Test infra found.** `review-privacy.test.ts` now spreads `importOriginal()`; add exports to
`services/performance.ts` freely, that file will not break again.

**Blast radius changes.** `redactHrAuthored` no longer exists anywhere. Any later phase that
redacts for a subject must call `redactForSubject`, and the object it passes must carry
`releasedAt` or the review will be withheld.

**Commands to stay green.** `pnpm test`, `pnpm check`, `pnpm lint`,
`pnpm exec prettier --check <files>`.

**Dependency changes.** None. No package added or removed.
