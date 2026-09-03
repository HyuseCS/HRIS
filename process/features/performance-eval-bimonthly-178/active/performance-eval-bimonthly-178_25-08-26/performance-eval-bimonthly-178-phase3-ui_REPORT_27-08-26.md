---
name: report:performance-eval-bimonthly-178-phase3-ui
description: "Phase 3 UI half of #178 — templates list, template builder, nav entry, shared ReviewFormRender"
date: 27-08-26
phase: phase-3-ui
status: COMPLETE
feature: performance-eval-bimonthly-178
plan: process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_PLAN_25-08-26.md
metadata:
  node_type: memory
  type: report
  feature: performance-eval-bimonthly-178
  phase: phase-3-ui
---

# Phase 3 (UI half) — execute report

## What Was Done

Plan items 71, 73, 75, plus `ReviewFormRender.svelte` (the design brief §3 / §9 requirement that
the preview and the real review form be ONE component). Server half `c6f1dc9` untouched.

Created:

- `src/lib/components/performance/ReviewFormRender.svelte` — the evaluation form, `preview` | `fill`.
- `src/lib/components/performance/rows.ts` — shared input classes, `moveRow`, `ErrorAt`,
  `ConfirmRemove`.
- `src/lib/components/performance/RowControls.svelte` — ↑ / ↓ / remove with row-naming aria labels.
- The nine §8.1 editors: `TemplateMetaFields`, `RatingScaleEditor`, `SectionList`, `SectionEditor`,
  `CriterionList`, `InterpretationBandEditor`, `NarrativeBlockEditor`, `RecommendationEditor`,
  `KpiEditor`, `SignatoryOrderEditor`.
- `src/routes/(app)/performance/templates/+page.svelte` — the list (item 71).
- `src/routes/(app)/performance/templates/[id]/+page.svelte` — the builder (item 73).

Changed:

- `src/routes/(app)/+layout.svelte` — the `/performance/templates` nav entry (item 75) plus a
  one-clause active-state exception so `/performance` does not light up alongside it.

## What Was Skipped or Deferred

- `fill` mode answer binding and submit — Phase 6 owns it, per the component's own comment.
- Duplicate from the LIST page — the list `load` carries no `structure`. Duplicate lives in the
  builder; the list says so. Reported as a limitation, no server file edited.

## Test Gate Outcomes

- `pnpm check` — 0 errors, 1 pre-existing warning (`CalculatorWindow.svelte`).
- `pnpm test` — 161 files, 1872 tests, all pass.
- `pnpm lint` — 0 errors, same 1 pre-existing warning.
- `pnpm format:check` — clean.
- `pnpm build` — succeeds (proves no `$lib/server` value import leaked to the client).

## Plan Deviations

1. Remove-confirm rule: plan §8.3 says confirm only when open reviews exist; brief §7 says confirm
   only when the row has content. Implemented as the brief says (content-based), with the snapshot
   sentence in the confirm message. Brief is the later authority.
2. Two files beyond §8.1's nine (`rows.ts`, `RowControls.svelte`). Neither is the banned generic
   `<RepeatableRows>`; they carry one move function and one a11y-correct control triplet used in
   seven places.
3. `SIGNATORY_ROLES` is spelled out in `SignatoryOrderEditor` — it is a runtime value inside
   `$lib/server/**` and cannot be imported client-side. The server schema still validates it.
4. Nav active-state got one extra clause, mirroring the existing `/dashboard` exception.

## Test Infra Gaps Found

None. No UI test exists for the builder yet; the plan routes UI proof to an agent-probe Tab pass.

## Forward Preview

- **Test Infra Found:** unchanged.
- **Blast Radius Changes:** `src/lib/components/performance/` is new and now imported by
  `/performance/templates/[id]`. Phase 6's `reviews/[id]/+page.svelte` must render
  `ReviewFormRender` in `fill` mode rather than hand-rolling the form (plan item 131 supersedes).
- **Commands to Stay Green:** `pnpm check`, `pnpm test`, `pnpm lint`, `pnpm format:check`.
- **Dependency Changes:** none.
