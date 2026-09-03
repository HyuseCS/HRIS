---
name: report:performance-eval-bimonthly-178-phase6-e
description: Phase 6 section E EXECUTE report — items 131 and 132 (the evaluator's real review form, rendered through ReviewFormRender in fill mode, and the AC4 round-trip test)
date: 27-08-26
phase: phase-6e
status: COMPLETE
feature: performance-eval-bimonthly-178
plan: process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_PLAN_25-08-26.md
metadata:
  node_type: memory
  type: report
  feature: performance-eval-bimonthly-178
  phase: phase-6e
---

# Phase 6 section E — the evaluator's review form

## TL;DR

Items 131 and 132 are done. The review page renders the review's own snapshot through
`ReviewFormRender.svelte` in `fill` mode — one component, two modes, as the AMENDMENT requires.
The live `?/submitReview` 404 is fixed: the page posts one JSON `answers` field to
`?/submitScores`. `tests/unit/performance-capture.test.ts` proves the AC4 round trip through the
real action, the real schema and the real service, and went red under three separate mutations.
All gates green: `pnpm check` 0 errors, `pnpm test` 1971 passed, `pnpm lint` 0 errors,
`pnpm format:check` clean, the no-scoring gate green.

**Nothing was seen in a browser** — the user's browser is closed and no dev server was started.
Every claim below is verified by compile, by server-side render inside the unit runner, or by
unit test. No live click-through was performed.

## What Was Done

| Item | Change | Status |
|---|---|---|
| 131 | `reviews/[id]/+page.svelte` rewritten to consume `ReviewFormRender` in `fill` mode | DONE |
| 131 | `ReviewFormRender.svelte` `fill` mode completed — binding, errors, read-back | DONE |
| 132 | `tests/unit/performance-capture.test.ts` — 10 cases, mutation-checked | DONE |

Files changed:

- `src/routes/(app)/performance/reviews/[id]/+page.svelte` (rewrite)
- `src/lib/components/performance/ReviewFormRender.svelte` (`fill` mode completed)
- `src/lib/components/performance/answer-draft.ts` (NEW — see Deviations)
- `tests/unit/performance-capture.test.ts` (NEW)

## `fill` mode, and why `preview` still works

`fill` was structurally complete and inert. It now binds:

| Field | Bound to | Renders when |
|---|---|---|
| criterion rating / remark | `draft.criteria[id].rating` / `.remark` | always |
| section subtotal | `draft.sectionSubtotals[id]` | `section.maximum !== null` only |
| summary-table score | the SAME `draft.sectionSubtotals[id]` | `section.maximum !== null` only |
| total | `draft.totalScore` | always |
| band | `draft.interpretationBandId` | always |
| narrative | `draft.narratives[id]` | per block |
| recommendations | `bind:group` on `draft.recommendationIds` | per option |
| "Other" free text | `draft.recommendationOther` | `allowsFreeText` |
| KPI actual | `draft.kpiActuals[id]` | when the snapshot has `kpiRows` |

The mode asymmetry is intact and is asserted, not asserted-about: an SSR render of `preview`
contains the dashed empty boxes and contains neither `value="0"` nor any typed value. **Neither
mode computes.** Three things protect `preview`:

1. Every control that only `fill` fills still renders in both modes, disabled in `preview`.
2. `answerFor(id)` mints an inert slot for a criterion the draft has none for. This is the one
   real way the amendment could have broken the builder: HR adds a criterion to `draft.structure`
   after the component mounted, and a bare `draft.criteria[id].rating` would have dereferenced
   `undefined` and blanked the whole preview pane.
3. `pnpm check` compiles the builder page against the new prop list (all three new props optional).

## How answers bind and serialise

ONE hidden field. `<input type="hidden" name="answers" value={serialiseAnswers(draft)} />`, and
**no visible input carries a `name`**, so nothing is posted twice and there is one parse and one
failure mode — the same decision plan §8.2 made for the builder's single `structure` field.

Numbers are held as STRINGS in the draft, because that is what a text input returns. The one
conversion to a number is `z.coerce` at the server boundary, so there is exactly one place where
a typed `"4"` becomes `4`, and no client-side parsing that could round or clamp it.

An untouched numeric box is **omitted** from the JSON, not sent as `""`: `z.coerce.number()`
turns `""` into `0`, and a silent zero is indistinguishable from a typed one on an HR record. A
criterion with a remark but no rating IS sent, so the server rejects it visibly on that row
rather than the form quietly dropping what the evaluator wrote.

## Row-level errors from `issues[].path`

`?/submitScores` returns `issues: [{ path, message }]` with zod's dotted path. The page has the
same `errorAt(prefix)` lookup the template builder uses (exact match, or one level below, so a
nested list's issue does not surface on its parent) and passes it into `ReviewFormRender` as the
`errorAt` prop. Each row asks for its own path:

| Path | Lands on |
|---|---|
| `criteria.{id}` / `criteria.{id}.rating` | that criterion's rating input |
| `sectionSubtotals.{id}` | that category's subtotal line (and reddens its summary cell) |
| `totalScore` | the total line |
| `interpretationBandId` | the band select |
| `narratives.{id}` | that narrative block |
| `recommendationIds` | the checklist |

Each offending control also gets `aria-invalid` and an `aria-describedby` pointing at its own
message, so the error is announced with the field rather than only seen next to it.

## `?/submitReview` is gone

`grep -n "submitReview" src/routes/\(app\)/performance` returns nothing. The page posted to an
action deleted in 48dbf78 and 404'd at runtime; SvelteKit does not typecheck action names, so
nothing caught it. It now posts to `?/submitScores`.

## The no-arithmetic comment

Written immediately above `{#each structure.sections}` in `ReviewFormRender.svelte`:

> NO `$derived` IN THIS LOOP MAY SUM ANYTHING. A `$derived(() => ratings.reduce(...))` added here
> to "helpfully" show a running subtotal IS the scoring engine arriving through the front door —
> the one thing #178 forbids permanently (SPEC acceptance criterion 4, plan §0).

The page and `answer-draft.ts` carry the same rule in their file headers.

## The redacted case (`answers === null`)

`redactHrAuthored` nulls `answers` for the subject, so a subject-only viewer gets a review with
no evaluator content at all. The page renders a sentence, not a form:

> This evaluation is confidential while it is being completed. HR releases it to you once it is
> finished, and you can leave your comments below.

It does not render an empty `fill` form, which would read as "your reviewer scored you zero".
Their own Self-Assessment and Employee Comments boxes stay fully available above and below it —
both are employee-authored columns and are never inside `answers`.

## What item 132 round-trips

`tests/unit/performance-capture.test.ts` (10 cases) runs the REAL path, not a re-implementation:

```
answerDraft → serialiseAnswers → the real ?/submitScores action → the real answersSchemaFor
  → the real submitScores service → the exact object handed to Prisma → answerDraft again
  → an SSR render of the real ReviewFormRender
```

Prisma and the audit log are the only mocks. It asserts:

- a fresh draft is EMPTY — every rating, subtotal and total is `''`, never `0`;
- a `maximum: null` category gets no subtotal slot at all (AE Section 3);
- the stored object deep-equals what was typed, field for field, with no extra keys;
- ratings, remarks, subtotals, total, band, narratives, recommendations (order preserved),
  the "Other" free text and KPI actuals all survive verbatim;
- awkward text survives: leading/trailing spaces, a newline, quotes, a backslash, `"0"`, `"007"`
  and non-ASCII — the things a stray `.trim()` or a number coercion would eat;
- **the numbers do not add up, on purpose**: the typed subtotals are not the sums of their
  criteria, the typed total (88) is not the sum of the subtotals (70), and the picked band is not
  the one whose range contains 88. Any arithmetic makes these red;
- a criterion the evaluator never touched is absent, not stored as a zero rating;
- read-back → re-submit → read-back is stable across three passes;
- the SSR-rendered `fill` form contains the stored values; the SSR-rendered `preview` contains
  the empty boxes and no values.

### Mutation checks — run, each went red as predicted

| Mutation | Result |
|---|---|
| `.trim()` added to the read-back of a stored value | 2 cases red |
| `totalScore` serialised as the sum of the subtotals | 4 cases red |
| `preview`'s empty box replaced with `value="0"` | 1 case red |

Each was reverted from a scratchpad copy (never `git checkout`).

## Plan Deviations

All within the blast radius of items 131/132; none touches auth, schema, billing, a public API or
container lifecycle.

1. **A third file: `src/lib/components/performance/answer-draft.ts`.** The scope said two files.
   The draft type, its prefill and its serialisation are needed by BOTH the page (to mint the
   draft and fill the hidden field) and the component (to type its `answers` prop), and item 132
   has to unit-test them. Putting them in the page would have made them untestable; putting them
   in `<script module>` of a `.svelte` file would have made the unit test import a component to
   reach a pure function. 110 lines, no logic beyond copying values.
2. **`disabled` prop on `ReviewFormRender`.** The plan never says how an already-scored review
   reads back to HR or to the reviewer after submit. `preview` cannot do it — it shows empty
   boxes by design. `mode="fill" disabled` shows the stored values in the same form, inert.
3. **The summary table's score cell prints `—` for a `maximum: null` category, in BOTH modes.**
   Previously `preview` drew a dashed box there. That box has no counterpart in `fill` (the
   server rejects a subtotal for such a category), so leaving it would have been exactly the
   preview-teaches-a-lie failure the amendment exists to prevent.
4. **The legacy "Manager Review" block is kept**, read-only, only when
   `managerComments`/`overallRating` are non-null and the viewer is not the subject. Item 125
   leaves those columns in place because existing rows hold data; dropping the block would hide
   that data from HR. The local DB has no such row (`has_mc` false on all 5), so this is
   defensive, not observed.
5. **The summary table's score input and the category's own subtotal input bind to the same
   value.** The paper form recaps the subtotal, so the form recaps it. A recap is a copy, not a
   calculation. Two distinct accessible names.

## What The Plan Got Wrong

1. **Item 131's field list includes "the self-assessment box and the employee-comments box"** as
   part of what `ReviewFormRender` must render in `fill`. It must not. Both are
   employee-authored, live in their own Prisma columns and must never enter `answers` (plan §4.2,
   the redaction rule). They stay on the page, outside the component and outside the
   `?/submitScores` form. Phase 3 already built the component this way; the plan's field list was
   never corrected to match.
2. **Item 131 does not cover the read-back state** — a scored review viewed by HR, or by the
   reviewer after submitting. Deviation 2 above fills that gap.
3. **Nothing in the plan mentions the summary table duplicating each category's subtotal.** It is
   in the component from Phase 3 and is the paper form's shape; `fill` mode forced the question.
4. **Plan line numbers are stale** (expected after five phases). Item 131 is at plan lines
   1211–1238 including its AMENDMENT block; item 132 at 1239–1241. Located by content.

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `pnpm check` | 0 errors, 1 pre-existing warning (`payroll/CalculatorWindow.svelte`, untouched) |
| `pnpm test` | 169 files, **1971 passed**, 0 failed |
| `pnpm lint` | 0 errors, same 1 pre-existing warning |
| `pnpm format:check` | clean |
| `tests/unit/performance-no-scoring.test.ts` | 3 passed |

## Not Verified

- **No browser.** No dev server was started and nothing was clicked. Keyboard order, focus rings,
  both themes, and the mobile grid collapse of the criterion row are unverified by observation.
- The e2e suite (`pnpm test:e2e`) was not run — it needs a build and a running database, and
  no e2e spec covers this page.
- Item 137's phase-wide green is met by the four gates above.

## Forward Preview

### Test Infra Found
`svelte/server`'s `render()` works inside the existing vitest node environment with the SvelteKit
plugin — no jsdom, no `@testing-library/svelte`, no config change. A component's real markup can
be asserted in a unit test. This is the first place in the repo to use it and it is how the
`preview`-versus-`fill` asymmetry is actually proven rather than described.

### Blast Radius Changes
`ReviewFormRender.svelte` now has three optional props (`answers`, `errorAt`, `disabled`). Both
of its consumers are in-tree: the template builder (`preview`, unchanged call site) and the
review page (`fill`). Phase 7 adds the sign-off panel to the review page below the evaluation
section; Phase 8 turns the subject's "confidential" sentence into a release-gated render of the
same `fill disabled` form.

### Commands to Stay Green
`pnpm check` · `pnpm test` · `pnpm lint` · `pnpm format:check`

### Dependency Changes
None. No package added.
