---
name: report:coderabbit-pr325-fixes-s2s3
description: "EXECUTE report — sections S2 (review read-back renders server data) and S3 (deactivated template stays on the employee picker) of the CodeRabbit PR #325 response; three files, both sections code-done"
phase: coderabbit-pr325-fixes-s2s3
date: 2026-09-01
status: COMPLETE
feature: performance-eval-bimonthly-178
plan: process/features/performance-eval-bimonthly-178/active/coderabbit-pr325-fixes_01-09-26/coderabbit-pr325-fixes_PLAN_01-09-26.md
metadata:
  node_type: memory
  type: report
  feature: performance-eval-bimonthly-178
  phase: coderabbit-pr325-fixes-s2s3
---

# S2 + S3 EXECUTE report

**TL;DR** — Both sections built, exactly as planned, in the three named files. S3 is proven by a
new unit case that goes red when the fix is reverted. **S2 has no automated proof at all in this
session** — its contract row names `pnpm check` + `pnpm lint`, and both were withheld for
concurrency. S2 is Manual-GUI only right now.

## What Was Done

- **S2** — `src/routes/(app)/performance/reviews/[id]/+page.svelte:234`, the DISABLED read-back
  branch: `answers={draft}` → `answers={answerDraft(data.structure, r.answers)}`. Prettier
  reflowed the now-longer tag onto six lines; no other content change. The EDITABLE branch at
  `:210` still passes `draft`, untouched. The comment at `:233` ("the stored values") became true
  and was left verbatim.
- **S3** — `src/routes/(app)/employees/[id]/+page.server.ts:195-196`: the picker keeps the
  currently-assigned template when it is inactive, and labels it. Exactly the plan's two lines:
  `.filter((t) => t.isActive || t.id === employee.assignedTemplateId)` and
  `.map((t) => ({ id: t.id, name: t.isActive ? t.name : `${t.name} (inactive)` }))`.
- **S3 test** — `tests/unit/performance-template-assignment.test.ts:185-204`, one new case:
  `getEmployee` returns `assignedTemplateId: 'tpl-old'`; `load` must return all three rows with
  `{ id: 'tpl-old', name: 'Retired Form (inactive)' }` last. Uses the inactive `tpl-old` already
  in the shared `listTemplates` mock at `:152-156`.
- `src/routes/(app)/employees/[id]/+page.svelte` was NOT touched. The plan permitted it only if
  the label needed styling; it does not — the suffix rides in on `name` as option text.

## What Was Skipped or Deferred

- `pnpm check`, `pnpm lint` and full `pnpm test` — withheld by the orchestrator because other
  agents are editing concurrently and `svelte-kit sync` would race. These are S2's ONLY named
  Fully-Automated gates, so S2 is unproven by automation in this session.
- The two Manual-GUI rows (employee opens a released review; HR deactivates an assigned template
  and reloads the employee page) ride the owner GUI pass, as the plan states.
- No commit made — git writes were out of scope for this agent.

## Test Gate Outcomes

| Gate | Tier | Result |
|---|---|---|
| `pnpm exec vitest run tests/unit/performance-template-assignment.test.ts` | Fully-Automated | GREEN — 11 passed |
| Mutation check: revert the `\|\| t.id === employee.assignedTemplateId` | Fully-Automated | RED as required — exactly 1 failed (the new case), 10 passed. Fix restored immediately. |
| AC4-reg — existing case at the `assignedTemplateId: null` mock | Fully-Automated | GREEN, unmodified |
| AC4-reg — existing `load echoes the stored id verbatim` case | Fully-Automated | GREEN, unmodified |
| `pnpm exec prettier --check` on the three files | Fully-Automated | GREEN (after `--write` on the svelte file only) |
| AC3 — `pnpm check` + `pnpm lint` | Fully-Automated | **NOT RUN** — withheld for concurrency |

## Plan Deviations

None. One formatting note, not a deviation: prettier reflowed the S2 `ReviewFormRender` tag to
multi-line because the new expression pushed it past the print width. The plan called it "one
line"; the expression is one change, the rendering is six lines.

## Test Infra Gaps Found

- **S2 is not automatable as written.** `pnpm check` proves the expression typechecks and the
  `data.structure` narrowing at `:189` still holds — it does not prove the read-back renders the
  DB row instead of the draft. Nothing in the unit suite asserts on rendered review answers, so
  reverting S2 would leave every automated gate green. The plan already names this under
  "What this coverage does NOT prove"; this run confirms it empirically.
- Backlog test-building stub: a component test rendering `+page.svelte`'s read-back branch with a
  `draft` deliberately diverged from `data.review.answers`, asserting the DOM shows the server
  value. Would make AC3 Fully-Automated. Not built — out of this section's scope.

## Closeout Packet

- **Selected plan:** `process/features/performance-eval-bimonthly-178/active/coderabbit-pr325-fixes_01-09-26/coderabbit-pr325-fixes_PLAN_01-09-26.md`
- **Finished:** S2 (checklist item 6, code only) and S3 (checklist items 7 and 8).
- **Verified:** S3, fully — including a red-on-revert mutation check and both regression cases.
- **Unverified:** S2 entirely, plus the two Manual-GUI rows and the `pnpm check`/`pnpm lint`/
  `pnpm test` sweep, which must run once the concurrent agents finish.
- **Remaining:** the two section commits (S2 and S3 are separate commits per the plan), the
  repo-wide gate sweep, and the owner GUI pass.
- **Best next state:** `Keep in active/testing` — S2 has no automated proof and other sections of
  this plan are still in flight. Not archivable.

## Forward Preview

- **Test Infra Found:** `tests/unit/performance-template-assignment.test.ts` mocks `getEmployee`
  and `listTemplates` per-test via `vi.clearAllMocks()` in `beforeEach`; re-mocking `getEmployee`
  inside a case is the established pattern. No render-level test harness exists for
  `performance/reviews/[id]/+page.svelte`.
- **Blast Radius Changes:** none beyond the three named files. `performanceTemplates` keeps its
  `{ id, name }` shape; the only consumer is `employees/[id]/+page.svelte:461`, which renders
  `name` as option text and posts `t.id`, so the ` (inactive)` suffix cannot round-trip as an id.
- **Commands to Stay Green:** `pnpm exec vitest run tests/unit/performance-template-assignment.test.ts`;
  and once the concurrency window closes, `pnpm check` and `pnpm lint` for S2.
- **Dependency Changes:** none.
