---
name: report:performance-eval-bimonthly-178-phase6-d
description: Phase 6 section D EXECUTE report — items 128, 129, 130 (submitScores action, saveEmployeeComments action, defensive templateSnapshot parse in load); clears the last pnpm check error left by 6B
date: 27-08-26
phase: phase-6d
status: COMPLETE
feature: performance-eval-bimonthly-178
plan: process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_PLAN_25-08-26.md
metadata:
  node_type: memory
  type: report
  feature: performance-eval-bimonthly-178
  phase: phase-6d
---

# Phase 6 section D — the review page server

## TL;DR

Items 128, 129 and 130 are done in the one file this section owns. `pnpm check` is back to
**0 errors**. `pnpm test` (1956), `pnpm lint` and `pnpm format:check` are all green. No audit
write exists in the route at all, so no audit row can carry `answers`. One live breakage is
handed forward: `+page.svelte` still posts to `?/submitReview`, an action that no longer
exists — that file is item 131's and was not touched.

## What Was Done

| Item | Change | Status |
|---|---|---|
| 128 | `submitReview` action replaced by `submitScores`; inline `z.object({managerComments, overallRating})` deleted; `submitManagerReview` import removed | DONE |
| 129 | `saveEmployeeComments` action added | DONE |
| 130 | `load` parses `templateSnapshot` through `templateStructureSchema.safeParse`; returns `structure` + `structureError` | DONE |

Only file changed: `src/routes/(app)/performance/reviews/[id]/+page.server.ts`.

## Action contracts (item 131 builds against these)

### `?/submitScores`

| Form field | Type | Required | Notes |
|---|---|---|---|
| `answers` | string | yes | The **whole** §4.2 answers object, `JSON.stringify`-ed. ONE field. |

Nothing else is read. `version: 1` must be inside the JSON — `answersSchemaFor` requires it.

Why one JSON field and not index-encoded names: it is the same decision plan §8.2 already made
for the template builder's single `structure` field. One field, one parse, one failure mode.
The numeric fields are `z.coerce`, so string values inside the JSON (`"rating": "4"`) are
accepted as well as real numbers — the renderer may bind either.

Responses:

| Condition | Result |
|---|---|
| caller is not `review.reviewer.id` | `fail(409, { error: 'Only the assigned reviewer can submit scores' })` |
| snapshot missing/unreadable | `fail(409, { error: 'This review has no readable form template' })` |
| `answers` is not valid JSON | `fail(422, { error: 'The submitted scores are not valid JSON', issues: [] })` |
| schema failure | `fail(422, { error: <first zod message>, issues: [{ path, message }] })` |
| review not found in org | 404 (thrown by `getReview`) |
| success | `{ success: true }`, review moves to `SCORED` |

`issues[].path` is the dotted zod path (`criteria.crit_d4e5f6.rating`, `sectionSubtotals.sec_a1b2c3`,
`totalScore`, `interpretationBandId`) — that is the hook for per-field error rendering.

### `?/saveEmployeeComments`

| Form field | Type | Required | Notes |
|---|---|---|---|
| `employeeComments` | string | yes | Trimmed, min 1, by `employeeCommentsSchema`. |

| Condition | Result |
|---|---|
| empty/whitespace | `fail(422, { error: 'Comments cannot be empty' })` |
| caller is not the review subject | `fail(409, { error: 'Only the review subject can leave employee comments' })` (from the service) |
| success | `{ success: true }`; status is NOT moved |

Unchanged actions: `?/saveSelf` (field `selfAssessment`) and `?/acknowledge` (no fields).

## Item 130 — how the failure flag reaches the page

`load` now returns two new keys:

```ts
structure: TemplateStructure | null
structureError: string | null   // non-null EXACTLY when structure is null
```

The page must branch on `structureError` **first** and render an error banner **instead of**
the evaluation form — never a form with `structure` missing, and never a partly-rendered one.
A silently empty form would be signed off as though it were complete; that is the whole reason
the flag exists.

The banner text is a fixed sentence, not the zod issue, on purpose: a zod message can name
criterion ids from the form, and this page is also served to the review's subject. Same
defensive-read shape as `/performance/templates/[id]`, which returns `structure` +
`structureError` the same way — one pattern, two pages.

`structure` is returned to the subject as well as the reviewer. That is correct: the *form* is
not private, the *answers* are, and `redactHrAuthored` still nulls `answers` for the subject.

## Privacy confirmation

**No audit write exists in this route.** `grep -n "writeAuditLog\|newValue\|audit"` on the file
returns nothing. The route calls services; the services own their own audit rows, and 6B already
proved those carry `{ status }` / `{ employeeCommentsAt }` only. There is therefore no path by
which this section puts `answers` into an audit `newValue` — not a second write, not a partial
one, not a count.

## Deliberate double validation, kept

The action parses the answers **and** `submitScores` parses them again server-side. Both stay:
the action's copy produces the per-field `issues` the form needs, and a direct POST that skips
the page skips the action's copy entirely. Neither replaces the other.

The action also re-checks `review.reviewer.id === reviewerId` **before** parsing content. This
mirrors the service's guard rather than replacing it (the service re-checks independently), and
it preserves the service's identity-before-content ordering at the HTTP edge: without it, any
authenticated org user could POST to `?/submitScores` and read back validation messages naming
another employee's form criteria. Same belt-and-braces shape as
`/performance/templates/[id]`, where the action calls `requireAnyCapability` and the service
still re-checks the org.

## Plan Deviations

None. All three items implemented as written.

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `pnpm check` | **PASS — 0 errors**, 1039 files (1 pre-existing a11y warning in `CalculatorWindow.svelte`) |
| `pnpm test` | **PASS** — 167 files, 1956 tests |
| `pnpm lint` | **PASS** — 0 errors, same 1 pre-existing warning |
| `pnpm format:check` | **PASS** |

`tests/unit/performance-no-scoring.test.ts` re-run on its own: 3/3 pass. This route performs no
arithmetic of any kind — it parses and forwards `parsed.data` verbatim.

### Real-data probe (item 130, against the live DB)

Pulled all 5 `performance_reviews.templateSnapshot` rows out of `veent-db-5434` and ran the
route's exact `structureOf()` body over them:

- all 5 → **PARSED** (6 sections, `totalCeiling: 100`) → form renders. This is the positive
  control, so the negative results below are not vacuous.
- `null` snapshot → null → banner.
- `{}` (no `structure` key) → null → banner.
- `{ structure: { version: 9 } }` → null → banner.

Then, against a real snapshot, through `answersSchemaFor`:

- well-formed answers (string-valued numbers, as a form post sends) → **accepted**
- `totalScore = totalCeiling + 1` → rejected, "The total cannot exceed 100"
- unknown criterion id → rejected, "…is not a criterion on this review's form"
- non-JSON `answers` → `JSON.parse` throws → the action's `fail(422)` branch

Probe files were temporary and are deleted.

## What Was Skipped or Deferred

Items 127, 131, 132, 134, 136, 137 — other sections.

## Handed forward — a LIVE breakage this section cannot fix

`src/routes/(app)/performance/reviews/[id]/+page.svelte:86` still posts to `?/submitReview`.
That action no longer exists, so the Submit review button now 404s at runtime. The file is
item 131's and is `DO NOT TOUCH` for this section. **Item 131 must repoint it to
`?/submitScores` and send the single `answers` JSON field.** `pnpm check` cannot catch this —
SvelteKit action names are not type-checked against the page — and no test covers it either.

## Test Infra Gaps Found

- `CONTEXT_PARTIAL: no test asserts a page's `use:enhance` form action name matches an exported
  action.` Nothing in `pnpm check` or `pnpm test` catches a form posting to a deleted action.
  This is the second time this phase that a rename left a hole only a human could see (6B's
  report made the same point about deleted service exports vs `pnpm test`).
- There is no unit test over this route's actions at all. `tests/unit/review-privacy.test.ts`
  exercises `load` only. Items 128/129's guard order and 422 shapes are currently proven by the
  live probe above, not by a committed test. Recommend a follow-up test item.

## What the Plan Got Wrong

1. **Items 128–130 never name the form-field encoding.** Item 128 says "parsing through
   `answersSchemaFor(review.templateSnapshot.structure)`" but not *what the browser posts*.
   The action and item 131's UI are two sections apart, so the wire format had to be decided
   here and back-published (above) rather than read from the plan. §8.2 fixes this for the
   template builder; §6 should have done the same for answers.
2. **Item 128's line reference `:63-84` and item 130's `:14-39` are stale** — the file had
   shifted. Located by content, as instructed.
3. **`review.templateSnapshot.structure` in item 128 is written as a safe dotted access.**
   `templateSnapshot` is `Json?` and nullable in Prisma; it must be reached defensively
   (`(snapshot as {structure?: unknown} | null)?.structure`), exactly as item 130 requires and
   as `submitScores` already does. The two items describe the same access with opposite
   levels of care.
4. **Item 131's coupling to item 128 is undeclared** — the same defect 6B reported for
   125↔128. Deleting or renaming an action must list the pages that post to it in the same item.

## Forward Preview

### Test Infra Found
No new test infra. `tests/unit/review-privacy.test.ts` mocks the performance service export
list and now names `submitScores` / `saveEmployeeComments` (6B updated it) — a future action
test can reuse that mock factory.

### Blast Radius Changes
`load` returns two new keys, `structure` and `structureError`. Item 131 consumes both.

### Commands to Stay Green
`pnpm check` · `pnpm test` · `pnpm lint` · `pnpm format:check` — all four green as of this
section.

### Dependency Changes
None. `zod` is no longer imported by this route (the inline schema is gone); it is still a
project dependency used everywhere else.
