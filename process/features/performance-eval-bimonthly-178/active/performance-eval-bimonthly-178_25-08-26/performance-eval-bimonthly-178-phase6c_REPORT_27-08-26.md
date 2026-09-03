---
name: report:performance-eval-bimonthly-178-phase6-c
description: Phase 6 section C EXECUTE report — items 127 and 136 (asSubject redaction on the reviews API + its mutation-checked test); closes a live leak of every evaluator rating
date: 27-08-26
metadata:
  node_type: memory
  type: report
  feature: performance-eval-bimonthly-178
  phase: "6C"
---

# Phase 6C — items 127, 136

## What Was Done

**Item 127** — `src/routes/api/v1/performance/reviews/+server.ts`. The `asSubject` arm is now
`asSubject.map(redactHrAuthored)`, matching `src/routes/(app)/performance/+page.server.ts:44`. The
`asReviewer` arm is byte-for-byte unchanged: the evaluator reading their own work is not the leak.
A five-line comment above the return names item 127 and the reason.

This was a live leak, not a tidy-up. Since 52a4269 `redactHrAuthored` also nulls `answers`, and
`answers` holds every rating, remark, subtotal, total, band and narrative the evaluator typed. An
employee calling this endpoint about their own review received the complete evaluation before HR
released anything.

**Item 136** — new `tests/unit/performance-api-redaction.test.ts`, 5 cases. Only `$lib/server/db`
and `$lib/server/audit` are mocked, so the route calls the real `listReviewsForEmployee` and the
real `redactHrAuthored`.

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `pnpm test` | 168 files, 1961 tests, all pass |
| `pnpm check` | 1040 files, **0 errors**, 1 pre-existing a11y warning (`CalculatorWindow.svelte:82`) |
| `pnpm lint` | 0 errors, same 1 pre-existing warning |
| `pnpm format:check` | clean |

## Mutation Check — three mutations, all RED

1. **Guard removed** (`.map(redactHrAuthored)` deleted) → 2 failed. `answers` non-null and
   `crit_quality` present in the arm.
2. **Partial leak** (`redactHrAuthored` applied, then `lastBand` echoed back from the blob) → 1
   failed. The `answers === null` case **passed** — i.e. the shallow assertion alone would have
   shipped the leak. The whole-arm grep caught it. This is why the sibling
   `performance-redact.test.ts` grep approach was copied.
3. **Returns nothing** (`asSubject: []`) → 2 failed, including the positive control. Proves an
   empty response cannot pass as correct redaction.

Reverted after each by re-editing the file, never `git checkout`.

## Positive Control

`still returns what the subject IS allowed to see` asserts `id`, `status`, `selfAssessment`,
`employeeComments`, `cycle` and the `reviewer` relation all survive redaction.

## Plan Deviations

None. Item 127 was implemented exactly as specified; item 136 goes beyond the literal ask with the
whole-arm grep, the positive control, an unchanged-reviewer-arm case and a no-employee-record case.

## Plan Drift

Line numbers only. Items 127 and 136 sit at plan lines 1200 and 1256, not their original positions.
Content matched exactly — no wording drift, nothing in the plan was wrong.

## Forward Preview

- **Test infra found:** route unit tests here mock `$lib/server/db` via `vi.hoisted` and
  `await import` the `+server` module. `GET({ locals } as never)` is enough to call the handler.
- **Blast radius changes:** none beyond the two files.
- **Commands to stay green:** `pnpm vitest run tests/unit/performance-api-redaction.test.ts`.
- **Dependency changes:** none.
- **Phase 8 note:** this arm now uses the unconditional `redactHrAuthored`. When Phase 8 upgrades
  that into the release-gated version, this call site inherits the gate for free — but the third
  test case (`leaves the reviewer arm whole`) and the token list will need a released-review case
  added.
