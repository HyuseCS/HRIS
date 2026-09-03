---
name: report:performance-eval-bimonthly-178-phase7-c
description: "Phase 7 section C EXECUTE report — items 143 and 144 (the attest action + load data, and the signature block), plus the org-scope fix on attestSignoff; items 140-142 and 145-146 belong to other agents"
date: 27-08-26
phase: phase-7-section-c
status: COMPLETE
feature: performance-eval-bimonthly-178
plan: process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_PLAN_25-08-26.md
metadata:
  node_type: memory
  type: report
  feature: performance-eval-bimonthly-178
  phase: phase-7-section-c
---

# Phase 7 section C — items 143 + 144

## What Was Done

**Item 143 — `src/routes/(app)/performance/reviews/[id]/+page.server.ts`**

`load` now returns five new fields: `signatoryOrder`, `signoffs`, `nextSlot`,
`unstaffedSlotIds`, `mayIAttest`.

- `signatoryOrder` comes from `structure.signatoryOrder` — the review's OWN
  `templateSnapshot`, parsed by the existing `structureOf` helper. Never the live
  `PerformanceTemplate.structure`.
- `nextSlot` is `nextSignatorySlot(signatoryOrder, signoffs)` — the SAME function
  `attestSignoff` calls. The page does not compute the turn any other way, so the button
  and the server cannot disagree.
- `resolveSlotHolders` needs relations (`employee.userId`,
  `employee.department.head.userId`, `reviewer.userId`, `cycle.organizationId`) that
  `getReview`'s include does not carry, so `load` runs one extra `findFirst`, scoped
  through `cycle: { organizationId }` like every other reader.
- Holders are resolved for EVERY slot, not only the next one, so an unstaffed slot is
  named where it sits rather than looking like it is merely waiting. Only
  `HR_REPRESENTATIVE` costs a query; the other three roles are field reads on the row
  already fetched.
- `mayIAttest` = the current user id is in the holder list of `nextSlot`, and nothing else.

New `attest` action. Deliberately thin — it reads `typedName` off the form and hands it to
`attestSignoff`. Errors surface through the existing `run()` helper, which converts an
`isHttpError` into `fail(status, { error })` — the exact convention `saveSelf`,
`saveEmployeeComments` and `acknowledge` already use, and the page already renders that
`form.error` in its red banner at the top.

**Item 144 — `src/routes/(app)/performance/reviews/[id]/+page.svelte`**

A `Signatures` section between Employee Comments and the legacy manager-review block.
Every slot in snapshot order, in an `<ol class="divide-y">`; the three per-slot facts
(`signed`, `isTurn`, `unstaffed`) are `{@const}` children of `{#each}`, matching
`settings/onboarding/+page.svelte`. Four states:

| State | Renders |
|---|---|
| attested | `Signed` pill, typed name, `formatDate(attestedAt)` — once, no image, no blob |
| `mayIAttest` on this slot | typed-name input + `Attest as {slot.label}` button |
| no holder | `Nobody assigned` pill + "No one is assigned to this role — HR must resolve this." |
| anything else | `Waiting for signature` (next) or `Not yet their turn` — no input |

The label on the input says what the person is signing, not "Name":
*"Type your full name to sign as {slot.label}. Your typed name is your signature on this
evaluation and is recorded with the date."* The button carries the role too, so four
buttons on one page would never read as four identical "Attest"s (only one is ever
rendered, but the accessible name does not depend on that being true).

Header rule respected: no `actions` prop, no control in the title row. The "N of M signed"
readout sits on the section's own heading row, right-aligned. It is `signoffs.length` vs
`signatoryOrder.length` — two lengths, no fold. `.reduce(` does not appear in the file.

**Service change — org scope on `attestSignoff`**

`attestSignoff(id, organizationId, userId, typedName, ctx)`. The lookup went from
`findUnique({ where: { id } })` to `findFirst({ where: { id, cycle: { organizationId } } })`,
exactly `getReview`'s shape. Not a live write hole — holders always derive from the
review's own relations — but an unscoped lookup answered a foreign-org caller with 409 for
a review that exists and 404 for one that does not, which is an existence oracle over every
review id. Nothing else in that file changed.

## What Was Skipped or Deferred

Nothing in scope. Items 140-142 and 145-146 belong to other agents and were not touched.
`src/routes/(app)/performance/+page.server.ts` and `+page.svelte` were not opened.

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `pnpm check` | 0 errors, 1 warning (`CalculatorWindow.svelte:82`, pre-existing) |
| `pnpm test` | 172 files / 2011 tests, all green |
| `tests/unit/performance-no-scoring.test.ts` | 3/3 pass — the gate this page was most likely to trip |
| `pnpm lint` | 0 errors, same 1 pre-existing warning |
| `pnpm exec prettier --check` | clean on all six touched files |
| Action-name cross-check | 4 `action="?/…"` in the page — `saveSelf`, `submitScores`, `saveEmployeeComments`, `attest`. All four exist in the `actions` export. `acknowledge` is exported and posted from nowhere (pre-existing, not mine). |

Mutation check on the new org-scope test: dropping `cycle: { organizationId }` from the
`attestSignoff` lookup turns `tests/unit/performance-signoff.test.ts` red (6 failures).

The dev server on :5173 was not started, restarted or touched. No live verification was run.

## Plan Deviations

None against items 143/144 as written.

The `organizationId` parameter was added as a positional argument per the orchestrator's
instruction, rather than read from the `ctx.organizationId` that `attestSignoff` already
receives. The parameter form matches `getReview(id, organizationId)`; the `ctx` form would
have been a smaller diff. Recorded, not re-litigated.

## Test Infra Gaps Found

Three test files outside the named scope had to be edited because the signature change
broke them at compile time. All edits are mechanical, none weakens an assertion:

- `tests/unit/performance-signoff.test.ts` — ~20 call sites gained the `ORG` argument;
  the `performanceReview.findUnique` mock became `findFirst` and now honours
  `where.cycle.organizationId`, so it can tell a scoped lookup from an unscoped one. Two
  new tests added (`the attest lookup is org-scoped (#323)`): a foreign org gets 404 not
  409, plus a positive control that the owning org still succeeds.
- `tests/unit/performance-signoff-order.test.ts` — 2 call sites, `findUnique` → `findFirst`.
- `tests/unit/review-privacy.test.ts` — its `dbMock` had no `performanceReview` at all, and
  its performance-service mock had no `attestSignoff`/`resolveSlotHolders`. Added, with
  `performanceReview.findFirst` resolving `null` so the sign-off block is absent — this
  file guards read privacy, not sign-off.

## Closeout Packet

- Selected plan: `process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_PLAN_25-08-26.md`
- Finished: items 143, 144, and the `attestSignoff` org scope.
- Verified: four static gates green; sign-off service and page-load behaviour covered by
  unit tests. NOT verified: the rendered page in a browser, and the attest round trip
  against a real database.
- Remaining: item 145 (HR stalled list) is another agent's. A live pass over the signature
  block is still owed before Phase 7 closes.
- Best next state: `Keep in active/testing`.

## Forward Preview

**Test Infra Found.** `tests/unit/performance-signoff.test.ts` is the sign-off service
harness — its mocks behave like a small database (real row array, real P2002). Any further
`attestSignoff` signature change lands there and in
`tests/unit/performance-signoff-order.test.ts`. `tests/unit/review-privacy.test.ts` mocks
the whole performance service by hand, so ANY new import in
`reviews/[id]/+page.server.ts` breaks it until added to that factory. That trap will fire
again.

**Blast Radius Changes.** `attestSignoff` now takes 5 arguments. Item 145's stalled-list
page must not call it; if any later item does, it needs `organizationId` second.

**Commands to Stay Green.** `pnpm check`, `pnpm test`, `pnpm lint`,
`pnpm exec prettier --check .`

**Dependency Changes.** None. No package added.
