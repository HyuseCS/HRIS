---
name: report:performance-eval-bimonthly-178-phase6-b
description: Phase 6 section B EXECUTE report — items 123, 124, 125, 126, 135 (submitScores, saveEmployeeComments, submitManagerReview deleted, answers redaction, redact tests); item 125 leaves one blocking type error in item 128's route
date: 27-08-26
phase: phase-6b
status: COMPLETE_WITH_GAPS
feature: performance-eval-bimonthly-178
plan: process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_PLAN_25-08-26.md
metadata:
  node_type: memory
  type: report
  feature: performance-eval-bimonthly-178
  phase: phase-6b
---

# Phase 6 section B — capture service + interim redaction

## TL;DR

Items 123, 124, 126 and 135 are done and green. Item 125 (delete `submitManagerReview`) is
done in the service, and it leaves **exactly one** `pnpm check` error — in
`src/routes/(app)/performance/reviews/[id]/+page.server.ts`, the file **item 128 owns** and
this section is forbidden to touch. `pnpm test`, `pnpm lint` and `pnpm format:check` are
green. Item 128 clears the last error.

## What Was Done

| Item | File | Status |
|---|---|---|
| 123 | `src/lib/server/services/performance.ts` — `submitScores(id, reviewerId, answers, ctx)` | DONE |
| 124 | same — `saveEmployeeComments(id, employeeId, text, ctx)` | DONE |
| 125 | same — `submitManagerReview` DELETED | DONE (service half); blocks on item 128 for `pnpm check` |
| 126 | same — `redactHrAuthored` also nulls `answers` | DONE |
| 135 | `tests/unit/performance-redact.test.ts` — extended, mutation-checked | DONE |
| — | `tests/unit/review-privacy.test.ts` — mock export list updated | DONE, 5/5 still pass |

### Item 123 — `submitScores` guard order

Guards run in this order, and the order matters:

1. `findUnique` → **404** if the review does not exist.
2. `review.reviewerId !== reviewerId` → **409** `'Only the assigned reviewer can submit scores'`
   (mirrors the deleted `submitManagerReview` exactly).
3. `templateStructureSchema.safeParse(review.templateSnapshot?.structure)` → **409** if the
   review has no readable form template.
4. `answersSchemaFor(structure).safeParse(answers)` → **422** with the first zod issue message.
5. Only then the write: `{ answers, status: 'SCORED' }`.

Identity before content — a non-reviewer never learns whether their payload would have been
valid, and never learns the shape of someone else's form.

`status: 'SCORED'`, **not** `COMPLETED`. `completedAt` is deliberately left alone: the review
is not complete, it is scored and heading to SIGNING.

Re-validation is against **the review's own `templateSnapshot`**, not the live template row and
not the caller's word. The page action parses the same answers, but a direct POST bypasses the
action entirely.

### What reaches the audit `newValue` — and what does not

```ts
newValue: { status: updated.status }
```

That is the whole object. One key. The evaluator's `answers` are **NOT** in the audit row:
not whole, not partially, not summarised, not as a count. Confirmed by reading the final
source — `writeAuditLog` in `submitScores` is called with a `newValue` literal containing a
single `status` property and nothing else. The reason is written in a comment above the call:
the audit log is readable by more people than the review is, so logging the answers would hand
every rating to readers the Phase-8 release gate exists to hold back (#242).

`saveEmployeeComments` follows the same rule: `newValue: { employeeCommentsAt: updated.updatedAt }`
— that it happened and when, never the text.

### Item 124 — `saveEmployeeComments`

404 / **409 unless the caller is the review's subject** (`review.employeeId !== employeeId`),
mirroring `saveSelfAssessment`. Writes `employeeComments` only — it does **not** move `status`,
because the plan does not say it should and the comments box is open across several states.

### Item 126 — the interim redaction

`redactHrAuthored`'s generic constraint gained `answers: unknown`, and the return adds
`answers: null`. Two lines, as the plan said. The `#179` comment now reads `#178 (was #179)`
and explains why redaction is the single operation `answers = null` rather than field-picking.

Making `answers` a **required** member of the constraint is deliberate: a future caller that
`select:`s a narrower row without `answers` now fails to compile instead of silently passing a
shape the redactor cannot clean. Both existing callers pass full model rows, so nothing broke.

### Item 135 — mutation check, both halves

- **RED half.** Removed `answers: null` from the return of `redactHrAuthored`. Two of the new
  cases failed: `strips the whole answers blob` (`expected undefined to be null` on
  `r.answers`) and `leaves nothing of the ratings, total or narratives behind`
  (`expected '{"id":"r1",…}' not to contain 'crit_1'`). Result: **2 failed | 4 passed**.
- **GREEN half.** Reverted by **re-editing the same line** (never `git checkout`), re-ran:
  **6 passed**.

The existing three cases are untouched and still pass. Four new assertions were added: the
`answers === null` case the plan asked for, a serialise-and-scan case that pins redaction as a
whole-blob null rather than field-picking, an `employeeComments` survival case, and a
no-mutation assertion on `answers`.

## Item 125 — the one thing that is NOT green

`pnpm check` returns exactly one error:

```
ERROR "src/routes/(app)/performance/reviews/[id]/+page.server.ts" 9:2
"Module '"$lib/server/services/performance"' has no exported member 'submitManagerReview'."
```

That route is **item 128's** file (`DO NOT TOUCH` for this section). Item 128 replaces the
`submitReview` action with `submitScores` and deletes the inline
`z.object({ managerComments, overallRating })`; doing that removes the import on line 9 and the
call on line 83, and the error goes with it. No other file in the repo referenced
`submitManagerReview`.

**Reported, not papered over** — as instructed. The service change is correct as written; the
route is simply one item behind it.

## Plan Deviations

None in scope. Everything item 123–126 and 135 asked for was implemented as written.

## What the Plan Got Wrong

1. **"THIS IS THE CHANGE THAT FINALLY BREAKS `tests/unit/review-privacy.test.ts`" — still
   wrong, a third time.** Deleting `submitManagerReview` did **not** break that file. It was
   run twice to check: once with the old mock factory intact (5/5 pass) and once with the
   factory renamed to `submitScores` / `saveEmployeeComments` while the route still imported
   the old name (5/5 pass). Vitest's ESM mock resolves a missing named export to `undefined`
   at import time without throwing, and the route only *references* `submitManagerReview`
   inside an action body that these five load-only tests never execute. That file was never
   runtime-coupled to the export list at all.

   **The real coupling is TypeScript, in the route — not vitest, in the test.** A future plan
   should say "this breaks `pnpm check` on `[id]/+page.server.ts`", which is precise and true.

   The mock was still updated to name the two new exports, because it must be correct when
   item 128 lands, and all five #282 §3-B cases still pass.

2. **Item 125's coupling to item 128 is undeclared.** The plan splits them across separate
   checklist items with no note that 125 alone cannot leave the tree type-clean. Any future
   phase that deletes an exported service function should list its callers in the same item.

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `pnpm test` | **PASS** — 167 files, 1956 tests |
| `pnpm lint` | **PASS** — 0 errors (1 pre-existing a11y warning in `CalculatorWindow.svelte`, untouched) |
| `pnpm format:check` | **PASS** — all files match Prettier |
| `pnpm check` | **1 ERROR** — item 128's route, see above |

Extra evidence, beyond the plan's asks:

- **Real-data probe.** Pulled a live `templateSnapshot` out of `performance_reviews`
  (5 rows, all non-null, `version: 1`, `totalCeiling: 100`, rating scale 1–5, 6 sections) and
  ran it through the exact parsing path `submitScores` uses:
  `templateStructureSchema.safeParse(snapshot.structure)` → parses; `answersSchemaFor(structure)`
  accepts a well-formed answer set and rejects `totalCeiling + 1`, an unknown band id, and an
  unknown criterion id. This proves the `snapshot?.structure` access shape against production-
  shaped data, not a fixture. The probe file was temporary and has been deleted.
- **No-scoring structural gate** (`tests/unit/performance-no-scoring.test.ts`) is green — no
  `computeScore` / `calculateTotal` / `deriveBand` / `sumSubtotals` / `weightedTotal` was
  introduced. `submitScores` performs no arithmetic of any kind; it stores `parsed.data`
  verbatim.
- **#323** — no org-scoping join was added; `submitScores` and `saveEmployeeComments` scope on
  the review's own `reviewerId` / `employeeId` columns.
- **#324** — no new transaction was opened, so no `tx` hand-off applies. Both new functions do
  a single `update` plus an audit write, matching `saveSelfAssessment` exactly.

## What Was Skipped or Deferred

- The route half of item 125 — belongs to item 128.
- Items 127, 128, 129, 130, 131, 132, 134, 136, 137 — other sections.

## Test Infra Gaps Found

- `pnpm test` alone cannot catch a deleted service export. Only `pnpm check` can. A section
  that deletes an export must run `pnpm check`, not just the suite.

## Forward Preview

### Test Infra Found
`tests/unit/performance-redact.test.ts` now has 6 cases and is mutation-proven. Item 136's
API-redaction test can reuse the same serialise-and-scan pattern.

### Blast Radius Changes
`redactHrAuthored`'s generic constraint now **requires** `answers`. Item 127 must pass rows
that include the `answers` column or it will not compile — which is the point.

### Commands to Stay Green
`pnpm test` · `pnpm lint` · `pnpm format:check`. `pnpm check` goes green when item 128 lands.

### Dependency Changes
None. No package was added.
