---
phase: roles-pagination-and-bulk-allfail
date: 2026-09-10
status: COMPLETE
feature: uiux-phase-4
plan: process/general-plans/completed/roles-pagination-and-bulk-allfail_10-09-26/roles-pagination-and-bulk-allfail_PLAN_10-09-26.md
---

# `/settings/roles` pagination (B1) + bulk timesheet all-fail (O1) — phase report

**TL;DR** — Both sections shipped `CODE DONE`. Two commits on `feat/uiux-phase-4`: `d26066d`
(B1) and `bb7eb28` (O1), plus the plan commit `cacdb09`. Full gate set green except the
pre-existing `attendance-save-timesheet-custom-range` e2e failure. `✅ VERIFIED` is still open —
owner manual confirmation has not happened.

## What Was Done

- Section 1 (B1) — `/settings/roles` paginated (default `?page=`, pageSize 10) and filtered
  (`?q=` against email + employee name), applied in the route `load`, keeping
  `src/lib/server/services/**` untouched. Two e2e specs repaired to carry `?q=` on every
  lookup. New unit test `tests/unit/settings-roles-load.test.ts`. Commit `d26066d`.
- Section 2 (O1) — `approveMany` / `rejectMany` in
  `src/routes/(app)/requests/timesheets/+page.server.ts` now return `fail(400)` when every row
  in a bulk batch fails, instead of the green `saved` string. Partial batches are unchanged
  (still green, with the skipped count). Four new unit tests plus a docblock correction in
  `tests/unit/request-decide-feedback.test.ts`. Commit `bb7eb28`.

## What Was Skipped/Deferred

- The Section 2 e2e known gap (an all-fail bulk batch driven through the real UI) — needs a
  seeded batch of non-reviewable timesheets that doesn't exist today; the plan records this as a
  deliberate known gap, no backlog note, no issue (owner ruling D7). Not revisited this session.
- Owner's `✅ VERIFIED` manual confirmation — outstanding, not part of this UPDATE PROCESS pass.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| Format | `pnpm format:check` | GREEN |
| Lint | `pnpm lint` | GREEN (0 errors, 1 pre-existing `CalculatorWindow` warning) |
| Types | `pnpm exec svelte-check --tsconfig ./tsconfig.json` | GREEN (1118 files, 0 errors) |
| Unit | `pnpm test` | GREEN (2435 tests / 209 files) |
| E2E | `CI=1 pnpm test:e2e` | 142 passed / 1 failed — pre-existing `attendance-save-timesheet-custom-range`, not ours |

## Plan Deviations

None recorded against the E1-E3 binding validate-contract corrections — VALIDATE's three
FAIL-grade findings (the `:74` row-lookup goto, the unreachable `attempted > 0` condition, and
the T1.1 fixture size) were folded into the plan text before EXECUTE as binding instructions and
followed as written.

## Test Infra Gaps Found

None new this session. The pre-existing `pnpm test:e2e -- <specs>` filter-silently-ignored gap
(backlog note `e2e-spec-filter-silently-ignored_NOTE_10-09-26.md`, captured in
`process/context/tests/all-tests.md`) applies here too — the gate set above used the working
`CI=1 pnpm exec dotenv -e .env.dev -- playwright test <specs>` form where scoping was needed.

## SPEC Achievement

No `*_SPEC_*.md` exists for this plan — acceptance criteria live in the plan file's
`## Acceptance criteria — Section 1` and `## Acceptance criteria — Section 2` tables, scored via
the plan's `## Test gates` table (criterion id / strategy / proving test). All Fully-Automated
and Agent-Probe criteria are met by the gate set above; the one Known-Gap criterion (AC2.1 e2e)
is recorded, not scored as met — see the deliberate known-gap rationale in the plan's Section 2
test plan.

## Closeout Packet

1. **Selected plan path:** `process/general-plans/completed/roles-pagination-and-bulk-allfail_10-09-26/roles-pagination-and-bulk-allfail_PLAN_10-09-26.md`
2. **Closeout classification:** Keep in active/testing for `✅ VERIFIED` purposes — code is
   `CODE DONE` and archived as a design record, but the plan's own `## Phase Completion Rules`
   requires owner confirmation before `VERIFIED`, which has not happened. Archived anyway per the
   orchestrator's explicit instruction (light UPDATE PROCESS, both sections SHIPPED and
   committed); the plan file and this report carry that distinction forward so no future reader
   mistakes `CODE DONE` for `VERIFIED`.
3. **What was finished:** both sections, two commits, full gate set green minus the pre-existing
   attendance e2e failure.
4. **Verified vs unverified:** all Fully-Automated and Agent-Probe gates green; the Section 2 e2e
   Known-Gap and the owner's manual `VERIFIED` confirmation remain open.
   4b. **Validate-contract:** present, CONDITIONAL, closed by binding instructions E1-E3, both
   followed.
5. **Cleanup done:** plan status updated, plan archived, two backlog notes retired with
   resolution records. **Still needed:** owner's `VERIFIED` confirmation; owner's own commit of
   these process artifacts.
6. **Next valid state:** owner reviews and commits the process artifacts; separately, take the
   owner's manual confirmation pass to close `VERIFIED`.
7. **Commit checkpoint:** Process commit belongs after UPDATE PROCESS. The execution commits
   `d26066d` / `bb7eb28` / `cacdb09` already exist; everything this session wrote is `process/`
   only.
8. **Regression status:** not a phase program; N/A.

Drift score: MEDIUM (2 signals — plan file + 2 backlog notes changed = feature-folder structural
change; 3+ memory-worthy observations in the lessons below).
Recommend UPDATE PROCESS -- significant changes detected.

## Lessons Captured

- **VALIDATE catching FAIL-grade defects the plan never looked at, not defects it got wrong.**
  All three FAILs (V-F1/V-F2/V-F3) were gaps in what the plan text examined, not mistakes in its
  reasoning: (a) checklist item 9 said "change every goto" but `settings-roles.spec.ts:74` isn't
  a goto, it's a row lookup with no goto of its own to filter — the fix needed a *new* goto, not
  an edit to an existing one; (b) the `attempted > 0` gate condition was unreachable-false because
  `!ids.length` already returns before the loop, so the plan's justifying sentence was also
  factually wrong about existing behaviour; (c) the pagination test (T1.1/AC1.4) would have
  passed vacuously at the plan's stated fixture size — `paginate` clamps `?page=2` back to page 1
  under 11 matching fixtures, so the assertion needed 11+ fixtures to actually exercise the
  clamp, not just avoid an error.
- **VALIDATE also corrected severity downward, and that mattered for EXECUTE's risk read.** The
  plan called `posting-approver-sod.spec.ts` the load-bearing risk; VALIDATE traced its actual
  email lookups and found it only ever needs `approver@veent.ph` (rank 2 of 212, page 1 either
  way). `settings-roles.spec.ts` was the one carrying the 211/212 and 212/212 lookups — the
  actually load-bearing file.
- **Ordering the e2e emails against the real DB before planning is what surfaced the whole risk
  class.** `verifier.approver@veent.ph` sitting at 211/212 in `org_seed` is a fact no spec-reading
  pass would find without querying the seed order directly.
- **Negative controls on both new test sets caught real regressions, not just presence.** The
  bulk guard was mutated to `done === -1` and both all-fail tests went red; the roles `load` slice
  was replaced with the unfiltered list and both load tests went red.
- **Two parallel EXECUTE agents with zero shared files needed no merge coordination.** The
  orchestrator held git throughout and wrote both commit messages; neither agent ran git.
