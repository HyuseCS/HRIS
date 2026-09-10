---
phase: recruitment-detail-banner-dedupe
date: 2026-09-10
status: COMPLETE_WITH_GAPS
feature: uiux-phase-4
plan: process/general-plans/completed/recruitment-detail-banner-dedupe_10-09-26/recruitment-detail-banner-dedupe_PLAN_10-09-26.md
---

## What Was Done

The plan's own scope — deleting the duplicated status-change error banner on
`src/routes/(app)/recruitment/[id]/+page.svelte` — shipped as `661719d`, with the route's first
error-surface e2e guard added to `tests/e2e/form-errors.spec.ts`.

The session carried nine other commits, in this order, none of which the plan covers:

| Commit | What |
|---|---|
| `d981ba0` | Made `scripts/seed-uiux-demo.ts` tolerant of a missing punch fixture. The handoff had claimed the seed row was present; it was not, and `time_logs` was empty, aborting the script with `findUniqueOrThrow` before it reached the posting/applicant fixtures this plan's own checklist needed. |
| `b026395` | Fixed a SILENT bug: the kanban's applicant stage-move form used a bare `use:enhance`, so a successful move never toasted. Phase 04's earlier UI sweep missed this because it was a child component (`ApplicantKanban.svelte`), not the page. Fixed by routing it through `submitFeedback`. |
| `0a2f11d` | Job-board rows: dropped the duplicate error toast (the row already renders its own inline error), kept the success toast, capped the URL field width. |
| `10faabc` | This plan file. |
| `f29a329` | `pnpm format:check` fix for `ApplicantKanban.svelte`, which `b026395` had left unformatted. Required as its own commit before the CI gate set could pass at all, since `format:check` runs first and short-circuits everything after it. |
| `661719d` | THE PLANNED CHANGE. |
| `dd7058f` .. `586a855` (8 commits) | An unplanned feature + design pass on the same card: per-posting board tiles replacing the board rows (add picker, two-step remove), uniform tile shape, neutral palette, base heights, a hover-fill bug fix, kanban column sizing. |

## What Was Skipped/Deferred

- `pnpm check` — never run this session; the owner's dev server was up on 5173 throughout, and
  `pnpm check` runs `svelte-kit sync`, which would have stopped it. Backlog note added.
- Both e2e specs touching this work — `tests/e2e/form-errors.spec.ts` (new case) and
  `tests/e2e/job-board-tracking.spec.ts` (reworked because the tick box it drove no longer exists
  after the tile rework) — committed but never executed. Backlog note added.
- R2 (convert-banner regression probe) — `BLOCKED — no fixture`, as the plan itself anticipated.
  No hired-applicant fixture exists in either seed script, and the plan forbids fabricating one.
  Backlog note added.
- F1 ("the notifs is using a banner, should use a Toast") — owner finding, surface never
  identified. Backlog note added.
- F2 — superseded by the tile rework; no action needed.
- O2 (toast auto-dismiss after 6s) — pre-existing behaviour, not new to this session; not
  re-opened.
- Light-theme tile shade sitting ~5 luminance points off the page — parked under issue #20's
  repo-wide canonical-surface ruling, which already names this file. Not duplicated into backlog
  per the standing "don't re-ask parked decisions" rule.

## Test Gate Outcomes

- `pnpm format:check` — RED at baseline (`10faabc`, `ApplicantKanban.svelte` unformatted by
  `b026395`); cleared by `f29a329`. Not re-run after `586a855`.
- `pnpm lint` — clean at time of the planned commit per validate-contract record.
- `pnpm test` (vitest) — 208 files / 2427 tests green as of the plan's baseline measurement; not
  re-run after the tile-rework commits.
- `pnpm check` — never run (see Skipped/Deferred).
- `pnpm test:e2e -- form-errors` — never run (see Skipped/Deferred). The new case exists in
  `tests/e2e/form-errors.spec.ts` and forces the posting OPEN first (via `Reopen`) rather than
  scoping the alert selector to the header card — the execute agent's E4 choice.
- `pnpm test:e2e -- job-board-tracking` — never run; the spec was reworked mid-session for the new
  tile UI and has no confirmed pass since.
- Live probes (positive, N1, N2, R1) from the plan's Verification Evidence section — executed per
  the plan's checklist step 6 before the `661719d` commit; not re-verified in this UPDATE PROCESS
  pass. R2 stayed `BLOCKED — no fixture`.

## Plan Deviations

The plan covered one commit (`661719d`) inside a nine-commit session. Everything else is drift:

1. Two pre-existing silent bugs were found and fixed before the planned change could even be
   tested (seed fixture gap, silent `use:enhance`) — both blocked reaching the plan's own
   acceptance criteria.
2. A red `format:check` at baseline, caused by an earlier unrelated commit, had to be cleared as
   its own commit before any CI gate set run could mean anything.
3. An unplanned 8-commit feature-and-design pass (per-posting board tiles) landed on the same
   file this plan touched, after the planned change shipped.

None of these touched the plan's own blast radius (`+page.svelte` lines 84-88,
`form-errors.spec.ts`) except by being on the same file at different line ranges, and the
validate-contract's acceptance criteria for AC1/AC2/AC4a were re-confirmed against the diff, not
just assumed stable.

## Test Infra Gaps Found

- `tests/e2e/form-errors.spec.ts` asserts on `getByRole('alert')`, which only matches `Banner`. As
  more pages migrate from banner to toast, that selector silently stops proving anything. A shared
  `expectErrorToast(page, /text/)` helper was named as worth having but explicitly out of scope —
  carried forward, not built.
- No hired-applicant fixture exists anywhere in the seed layer, which blocks any e2e coverage of
  the recruitment "Hired Applicants" card, not just R2 here.

## SPEC Achievement

No `*_SPEC_*.md` exists for this plan — SIMPLE-complexity single-file plan, no phase-program
umbrella SPEC applies. Scoring is against the plan's own Acceptance Criteria instead (see
`## Execution Outcome` in the plan file, and `## SPEC Gaps` below for anything unmet).

### SPEC Gaps

- AC5 (full CI gate set + e2e green): **unmet** as a completed proof — `pnpm check` and both e2e
  specs unrun. Backlog note: "Run the two unrun e2e specs and `pnpm check`...".
- AC4b (`convert` banner regression): **unmet** as a live-verified proof — `BLOCKED — no fixture`,
  a documented Known-Gap. Backlog note: "R2 convert-banner regression check has no fixture".
- AC1, AC2 (grep count), AC3, AC6: **met** per commit-history evidence recorded above.

## Closeout Packet

**1. Selected plan path:** `process/general-plans/active/recruitment-detail-banner-dedupe_10-09-26/recruitment-detail-banner-dedupe_PLAN_10-09-26.md` (archiving to `completed/` in this same UPDATE PROCESS pass, per explicit owner instruction).

**2. Closeout classification:** Needs PLAN/UPDATE PROCESS reconciliation, resolved here — archiving
proceeds by explicit owner direction, with the gap between "CODE DONE" and "VERIFIED" recorded
rather than silently upgraded. This report and the plan's own `## Execution Outcome` /
`## Known Gaps` sections are the reconciliation.

**3. What was finished:** the planned banner deletion (`661719d`) plus 8 unplanned but shipped
commits fixing two silent bugs, a baseline format break, and a job-board tile rework — see table
above.

**4. Verified vs unverified:** the planned change's own live probes (positive, N1, N2, R1) were run
per the plan's checklist before commit. `pnpm check`, both relevant e2e specs, and a fresh
`pnpm test` on the final tree are unverified this session — the owner's dev server stayed up
throughout.

**4b. Validate-contract compliance:** present, inline in the plan file (`## Validate Contract`,
CONDITIONAL gate, 4 accepted concerns, 0 unresolved FAILs). Staged and committed as part of this
UPDATE PROCESS pass (was unstaged at session start).

**5. Cleanup done vs still needed:** plan file updated with Execution Outcome + Known Gaps; three
backlog notes added; this report written; folder archived. Still needed: run the three unrun test
gates on the final tree (see backlog), and eventually the #20 canonical-surface sweep for the
parked tile shade.

**6. Single best next valid state:** `Keep the branch active on feat/uiux-phase-4; when the
owner's dev server is next down, run pnpm check && pnpm test:e2e -- form-errors
job-board-tracking, then continue PR #13 review.`

**7. Commit-checkpoint recommendation:** Process commit belongs after UPDATE PROCESS — the
remaining unstaged/new changes here are the plan's validate-contract section (already
implementation-adjacent but doc-only), this report, the archived-folder move, and the backlog/
context edits. No further source changes are pending in this pass.

**8. Regression status:** not a phase program; no umbrella regression sweep applies. The two
regression checks the plan itself specified (R1 board-row inline error, R2 convert banner) were
run as part of the plan's own live probe (R1 PASS, R2 BLOCKED — no fixture), not re-run in this
UPDATE PROCESS pass.

**9. SPEC achievement:** see `## SPEC Achievement` / `## SPEC Gaps` above — no locked SPEC exists
for this plan; scored against its own Acceptance Criteria instead.

**Drift score:** MEDIUM (3 signals — (a) 10 files touched across the session +1, +1 for ≥10; (c)
3+ memory-worthy findings this session: the silent `use:enhance` bug, the baseline-format-break
short-circuit lesson, and the VALIDATE grep-count correction). `Recommend UPDATE PROCESS --
significant changes detected.`

## Forward Preview

### Test Infra Found

- `expectErrorToast(page, /text/)` helper named as worth building, not built — see Test Infra Gaps.
- No hired-applicant seed fixture anywhere — blocks R2 and any future "Hired Applicants" coverage.

### Blast Radius Changes

Original blast radius: 1 source file (5 lines deleted), 1 test file (~25 lines added). Actual:
`+page.svelte` (multiple further edits from the tile rework), `ApplicantKanban.svelte` (silent-bug
fix + formatting), `scripts/seed-uiux-demo.ts` (seed tolerance fix), `tests/e2e/form-errors.spec.ts`
(as planned), `tests/e2e/job-board-tracking.spec.ts` (reworked, unplanned).

### Commands to Stay Green

```
pnpm format:check && pnpm lint && pnpm check && pnpm test
pnpm test:e2e -- form-errors job-board-tracking
```
Run only when the owner's dev server is down.

### Dependency Changes

None.
