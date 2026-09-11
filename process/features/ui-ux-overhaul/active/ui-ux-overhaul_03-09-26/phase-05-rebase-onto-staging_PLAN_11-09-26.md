---
name: plan:ui-ux-overhaul-phase-05-rebase-onto-staging
description: "Rebase the 10 phase 05 commits of feat/uiux-phase-5 (PR #14) onto origin/staging, skipping the 3 pre-phase-5 commits whose work is already in staging with a different pre-image. Conflict map derived by in-memory merge-tree simulation: 3 conflicted files across 2 commits. No push, no force-push, no amend."
date: 11-09-26
feature: ui-ux-overhaul
phase: "05"
---

# Phase 05 — rebase `feat/uiux-phase-5` onto `origin/staging`

**TL;DR** — Run `git rebase --onto origin/staging b3334f0 feat/uiux-phase-5`. Ten commits replay.
Seven land clean. Two conflict, in three files: `employees/[id]` (commit 8fd0e61) and
`attendance` + `separations/[id]` (commit 0114184). Attendance is the trap: staging **already
built** the same ConfirmButton with different copy, so a naive `--ours` resolution passes lint and
fails `tests/unit/destructive-confirms.test.ts` site 15. The other trap is 8fd0e61 auto-merging
`settings/roles` and `performance/reviews/[id]` cleanly right next to the file that conflicts.
Nothing is pushed by this plan.

**Date**: 11-09-26
**Status**: PLANNED — PVL complete, see `## Validate Contract`. No refs changed.
**Complexity**: SIMPLE (single mechanical operation, 10 commits, 3 conflicted files)
**Feature**: ui-ux-overhaul
**Phase**: 05 — branch update only, no product behavior change

---

## Self-Inclusion Note (read before counting commits)

This plan file is itself committed on `feat/uiux-phase-5`, on top of `1bf99af`, as
`docs(plan): record the phase 05 rebase-onto-staging plan`. It therefore **replays too**.

Adjust the shape checks accordingly:

- `git log --oneline origin/staging..HEAD` is **11** lines, not 10: the 10 phase 05 commits plus
  this plan commit as the last one.
- the `--stat` allow-list gains a 15th path:
  `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-05-rebase-onto-staging_PLAN_11-09-26.md`.
- the replay still starts at `b3334f0`, so the three trap commits are still excluded. The plan
  commit is clean (new file, staging has no copy).
- step 1 of the checklist expects HEAD at the plan commit, not `1bf99af`. `1bf99af` must be its
  parent.

Everything else in this plan is unchanged.

## Overview

`feat/uiux-phase-5` (PR #14, pushed, HEAD `1bf99af`) was cut before PRs #12 and #13 merged phases
03 and 04 into staging. Merge base is `7742e59`; staging is 175 commits ahead; the branch is 55
ahead by hash. Owner chose **rebase**, not merge.

`git cherry origin/staging HEAD` reports 45 of those 55 as patch-identical to staging (the phases
03/04 work that merged via #12/#13) and 13 with `+`. Three of the 13 are **not** phase 05 work:

| Commit | Subject | Why it must NOT replay |
|---|---|---|
| `75d88c1` | S11 refactor(timesheets): migrate NewTimesheetDialog onto Dialog | staging carries the same work with a different pre-image; staging is the superset |
| `c487adc` | S14 refactor(ui): put people and time pages on PageHeader | same |
| `eab4c57` | S6 fix(ui): give each employees/[id] card its own error slot | same — staging generalised it into the `error: null` + `actionError` pattern |

All three are ancestors of `b3334f0` (verified with `git merge-base --is-ancestor`), which is the
last pre-phase-05 commit. Starting the replay **at `b3334f0`** therefore excludes all three by
construction — the rebase never considers them, so there is no chance of a hand-skip mistake.

---

## Rebase Shape — why `--onto`, not plain

| Option | Commits offered for replay | Risk |
|---|---|---|
| `git rebase origin/staging` | all 13 `+` commits, including the 3 traps | git offers `75d88c1` / `c487adc` / `eab4c57`; each will conflict (different pre-image), and a hand `--skip` decision must be made correctly three times **while** the executor is in conflict-resolution mode. One wrong `git rebase --continue` replays staging's subset over its superset and silently regresses merged phase 03/04 work. |
| **`git rebase --onto origin/staging b3334f0 feat/uiux-phase-5`** (chosen) | exactly the 10 phase 05 commits | the traps are never presented. Only the intended work replays. |

**Chosen: `--onto`.** It is safer because it removes the three trap decisions from the executor's
hands entirely rather than relying on correct judgment three times under pressure.

### Exact command

```bash
git rebase --onto origin/staging b3334f0 feat/uiux-phase-5
```

Replay order (10):
`9062f11 715f965 ab01634 3c7c08e 5c3cfc3 8fd0e61 0114184 9296163 e3ad21a 1bf99af`

---

## Conflict Map (derived, not guessed)

Derived by simulating the whole rebase in memory with `git merge-tree --write-tree`, chaining each
resulting tree into the next step. This touched **no ref and no working-tree file** — it only wrote
objects. Final simulated tree: `ebdd167`.

| # | Commit | Subject | Result | Conflicted file(s) |
|---|---|---|---|---|
| 1 | `9062f11` | s1 payroll period void/release | CLEAN | — |
| 2 | `715f965` | s2 net-pay override | CLEAN | — |
| 3 | `ab01634` | s3 DOLE multipliers | CLEAN | — |
| 4 | `3c7c08e` | ConfirmDialog newlines (phase 03 amendment) | CLEAN | — |
| 5 | `5c3cfc3` | s4 statutory rates | CLEAN | — |
| 6 | `8fd0e61` | s5 offboard / review release / login deactivate | **CONFLICT** | `src/routes/(app)/employees/[id]/+page.svelte` |
| 7 | `0114184` | s6 last native confirms | **CONFLICT** | `src/routes/(app)/attendance/+page.svelte`, `src/routes/(app)/separations/[id]/+page.svelte` |
| 8 | `9296163` | s7 destructive-confirms unit gate | CLEAN | — |
| 9 | `e3ad21a` | phase 05 report + registry | CLEAN | — |
| 10 | `1bf99af` | e2e separations spec | CLEAN | — |

Supporting fact — divergence between `b3334f0` and `origin/staging` on the ten watch files:

| File | Lines diverged | Consequence |
|---|---|---|
| `ui/ConfirmDialog.svelte` | 0 | commit 4 applies clean |
| `payroll/config/+page.svelte` | 0 | commit 3 clean |
| `payroll/statutory-rates/+page.svelte` | 0 | commit 5 clean |
| `payroll/[id]/+page.svelte` | 4 | auto-merges |
| `performance/reviews/[id]/+page.svelte` | 4 | auto-merges (see trap T2) |
| `payroll/periods/+page.svelte` | 45 | auto-merges |
| `settings/roles/+page.svelte` | 45 | auto-merges (see trap T2) |
| `employees/[id]/+page.svelte` | 83 | **conflicts** |
| `separations/[id]/+page.svelte` | 290 | **conflicts** |
| `attendance/+page.svelte` | 484 | **conflicts** |

**ConfirmDialog question answered.** Staging does **not** already cover `3c7c08e`. Staging rewrote
`ConfirmDialog.svelte` onto the shared `Dialog` base, ending at blob `3f925ed` — which is exactly
`3c7c08e`'s **pre**-image (`3f925ed..d35f49f`). The `whitespace-pre-line` class is absent from
staging's copy. `3c7c08e` must replay, and it applies with zero conflict. Do not drop it: without
it the separation-undo message renders its `\n\n` re-open clause as one run-on paragraph.

---

## Per-Conflict Intended Resolution

### C1 — `8fd0e61` → `src/routes/(app)/employees/[id]/+page.svelte`

**Where.** Phase 05 inserts the offboard-confirm state block immediately after
`const uploadDocument = submitFeedback()`. Staging rewrote that exact region: every
`submitFeedback()` call gained `({ error: null })`, and staging appended `toggleOnboardingStep`,
a `DONE` message map, and a `savedNotice` `$derived` right after `uploadDocument`. Two edits at one
insertion point.

**Resolution — keep both, staging first.**

1. Keep **all** of staging's block verbatim: the `{ error: null }` argument on every
   `submitFeedback()` call, `toggleOnboardingStep`, `DONE`, `savedNotice`.
2. Append phase 05's block **after** staging's `savedNotice`: the `offboardFormEl` /
   `offboardConfirm` state, `openOffboardConfirm()`, and its comment.
3. The other two phase 05 hunks in this file (`bind:this={offboardFormEl}` on the offboard form;
   `type="submit"` → `type="button"` + `onclick={openOffboardConfirm}`; the trailing
   `<ConfirmDialog …>` block) are outside staging's edits — apply them unchanged.
4. Keep the `import ConfirmDialog` line phase 05 adds.

**Do NOT** drop `{ error: null }` to take phase 05's side of the block — that silently re-enables
duplicate error toasts on every card and regresses shipped phase 04 work.

### C2 — `0114184` → `src/routes/(app)/attendance/+page.svelte` (THE TRAP)

**Where.** Both sides did the same job. Staging **already** deleted `confirmReset` and replaced both
Reset rows with `ConfirmButton` — with different copy, different `triggerClass`, and an extra
`disabled={!d.manuallyEdited}` prop that replaces the `{#if d.manuallyEdited}` wrapper. Staging also
converted `createSubmitGuard` → `submitFeedback` in the same hunk.

**Resolution — staging's structure, phase 05's message.**

1. Take **staging's** side for the whole file (structure, `disabled={!d.manuallyEdited}`,
   `triggerClass`, the `createSubmitGuard`→`submitFeedback` conversions, the deletion of
   `confirmReset`). Staging's shape is the superset.
2. Then, in **both** Reset `ConfirmButton` blocks, replace the `message` prop value with phase 05's:
   `"The hours you corrected for this day are thrown away and re-derived from the raw punches. Anything typed by hand is lost."`
3. Leave staging's `title` (`"Discard the manual edit?"`) and `confirmText` (`"Reset"`) as-is.
4. Do **not** re-add phase 05's `import ConfirmButton` if staging already imports it — a duplicate
   import fails `pnpm check`.

**Why step 2 is mandatory.** `tests/unit/destructive-confirms.test.ts` (added by `9296163`, two
commits later) asserts site 15 contains the literal substring
`thrown away and re-derived from the raw punches`. Staging's copy is
`"This day goes back to the values derived from its punch records. The manual correction is lost."`
A plain `git checkout --ours` here is a **green lint, green check, red test** outcome, and the
failure surfaces two commits after the resolution that caused it. Verified: staging lacks the
needle.

If the owner later prefers staging's wording, that is a copy decision — it must change the test's
needle and the phase 05 plan, not be made silently during a rebase.

### C3 — `0114184` → `src/routes/(app)/separations/[id]/+page.svelte`

**Where.** Staging did **not** touch the confirm code here — staging's hunks are at `@@ -56`,
`@@ -98`, and a large `@@ -109,150` structural rewrite. Phase 05's hunks are at `@@ -5` (imports),
`@@ -26` (the `finalize` / `undo` guards), and `@@ -206` (the finalize form → `ConfirmButton`). The
overlap is only the `@@ -206` region falling inside staging's 109–259 rewrite.

**Resolution — staging's markup, phase 05's confirm wiring.**

1. Keep staging's structural/markup changes for the surrounding card.
2. Apply phase 05's changes in full: both `ConfirmButton`/`ConfirmDialog` imports; the `finalize`
   guard replaced by `ConfirmButton`; `undo` reduced to a bare `createSubmitGuard()` plus
   `undoFormEl`, `undoConfirm` and the `undoMessage` `$derived`; the separate `<ConfirmDialog>` for
   undo (it sits beside the form because the `reopenClearance` checkbox is posted by that form).
3. Preserve every attribute staging may have changed on the finalize button that phase 05 moves onto
   `ConfirmButton` — specifically `aria-describedby={finalizeBar ? 'finalize-bar' : undefined}` and
   the `disabled={pendingCount > 0 || !!finalizeBar}` condition. Losing `aria-describedby` drops the
   phase 08 a11y association.
4. After resolving, `confirm(` must appear **zero** times in this file. Staging still has 2.

---

## Named Traps

| ID | Trap | Where | Guard |
|---|---|---|---|
| T1 | Silent-correct wrong resolution | `attendance/+page.svelte` | See C2. `--ours` looks perfect and fails the unit gate two commits later. |
| T2 | **The clean hunk beside the conflicted one** | `8fd0e61` auto-merges `settings/roles/+page.svelte` and `performance/reviews/[id]/+page.svelte` while `employees/[id]` conflicts | Both auto-merges were simulated and verified correct in tree `ebdd167`: the site 11 and site 12 consequence needles survive, and `confirm(` count is 0 in both. **Still eyeball both files after `--continue`** — this is exactly the shape that bit the phase 04 update. |
| T3 | Orphaned/duplicated import | all three conflicted files | A resolution that takes one side of an import block can drop `enhance` (breaking `use:enhance={guard.enhance}` at runtime with no type error) or duplicate `ConfirmButton`. Diff the import block of each resolved file against both sides before `--continue`. |
| T4 | Dropping `3c7c08e` as "already in staging" | `ConfirmDialog.svelte` | It is not. See above. It replays clean; do not skip it. |
| T5 | Losing `{ error: null }` | `employees/[id]/+page.svelte` | See C1 step 1. |

---

## Verified-clean auto-merges (no action needed, informational)

Simulated tree `ebdd167` was checked for 8 of the 17 `destructive-confirms` needles in files that
auto-merged. All 8 present: `settings/roles` (site 12), `performance/reviews/[id]` (site 11),
`payroll/periods` (sites 2 and 3), `payroll/[id]` (site 5), `payroll/config` (site 6),
`payroll/statutory-rates` (site 10), `payroll/+page.svelte` (site 4, already on staging).
The remaining needles (sites 1, 13, 14, 15) live in the three conflicted files and are the
executor's responsibility.

---

## Recovery Rules

If files appear to revert on disk mid-rebase, **do not reflexively abort**. Compare first:

```bash
cat .git/rebase-merge/orig-head
git rev-parse feat/uiux-phase-5
```

| Comparison | Meaning | Action |
|---|---|---|
| They **differ** | stale rebase debris from an earlier, already-finished operation | `git rebase --quit` (drops the stale state, leaves the branch alone) |
| They **match** | this rebase really is in flight | `git rebase --abort` is safe and returns to `1bf99af` |

`1bf99af` is also on `origin/feat/uiux-phase-5`, so the pre-rebase state is recoverable from the
remote ref in the worst case. Never reach for `git reset --hard` as a first move.

---

## Implementation Checklist

1. Confirm a clean tree: `git status --porcelain` returns nothing. Confirm HEAD is `1bf99af` and the
   branch is `feat/uiux-phase-5`.
2. Record the pre-state: `git rev-parse HEAD origin/staging` — write both hashes down.
3. Run `git rebase --onto origin/staging b3334f0 feat/uiux-phase-5`.
4. Commits 1–5 replay clean. Do not intervene.
5. At `8fd0e61`: resolve `src/routes/(app)/employees/[id]/+page.svelte` per **C1**. Then eyeball
   `settings/roles/+page.svelte` and `performance/reviews/[id]/+page.svelte` per **T2**.
   `git add` the three paths, `git rebase --continue`, keep the original message.
6. At `0114184`: resolve `src/routes/(app)/attendance/+page.svelte` per **C2** (staging structure +
   phase 05 message, both Reset blocks) and `src/routes/(app)/separations/[id]/+page.svelte` per
   **C3**. Check T3 on both. `git add`, `git rebase --continue`.
7. Commits 8–10 replay clean. Rebase reports success.
8. Grep the whole tree for leftover markers: `grep -rn "^<<<<<<<" src/ tests/` must be empty.
9. Run the shape checks (below).
10. Run the gate set in CI order (below).
11. **STOP.** Report. Do not push.

---

## Post-Rebase Shape Checks

```bash
git log --oneline origin/staging..HEAD          # MUST be exactly 10 lines
git diff origin/staging...HEAD --stat            # see allow-list below
```

`git diff origin/staging...HEAD --stat` must show **only**:

| Path | Kind |
|---|---|
| `src/lib/components/ui/ConfirmDialog.svelte` | phase 05 svelte |
| `src/routes/(app)/attendance/+page.svelte` | phase 05 svelte |
| `src/routes/(app)/employees/[id]/+page.svelte` | phase 05 svelte |
| `src/routes/(app)/payroll/config/+page.svelte` | phase 05 svelte |
| `src/routes/(app)/payroll/[id]/+page.svelte` | phase 05 svelte |
| `src/routes/(app)/payroll/periods/+page.svelte` | phase 05 svelte |
| `src/routes/(app)/payroll/statutory-rates/+page.svelte` | phase 05 svelte |
| `src/routes/(app)/performance/reviews/[id]/+page.svelte` | phase 05 svelte |
| `src/routes/(app)/separations/[id]/+page.svelte` | phase 05 svelte |
| `src/routes/(app)/settings/roles/+page.svelte` | phase 05 svelte |
| `tests/unit/destructive-confirms.test.ts` | new test |
| `tests/e2e/separations.spec.ts` | test edit |
| `.../phase-05-destructive-actions_REPORT_03-09-26.md` | docs |
| `.../phase-blast-radius-registry.md` | docs |

That is **10 svelte files** (9 route/component files from the phase 05 site list plus
`ConfirmDialog.svelte` from the phase 03 amendment `3c7c08e`), 2 test files, 2 docs files.
Any path outside this list means a trap commit replayed or a resolution pulled in foreign content —
stop and investigate before running gates.

---

## Gate Set (CI order — run all, stop reporting only at the end)

```bash
pnpm format:check
pnpm lint
pnpm check
pnpm test
CI=1 pnpm test:e2e
```

CI runs `format:check` **first** and skips the rest on failure, so a green `pnpm check` alone proves
nothing. Run all five.

| Gate | Must be | Notes |
|---|---|---|
| `pnpm format:check` | green | a hand-resolved conflict commonly leaves bad indentation |
| `pnpm lint` | green | catches duplicate/orphan imports (T3) |
| `pnpm check` | green | svelte-check; catches a dropped `$state` or a wrong prop |
| `pnpm test` | green | **`tests/unit/destructive-confirms.test.ts` is the primary rebase gate.** G1 wiring, G2 no-native-`confirm`, G3 the 17 consequence needles. A C2 mis-resolution shows here as `site 15`. |
| `CI=1 pnpm test:e2e` | green except one | **One pre-existing attendance e2e failure is known and is NOT a rebase defect.** Any **other** failure is. Name the failing spec and test title in the report so the distinction is checkable, not asserted. |

Do not use `pnpm test:e2e -- <spec>` to scope a run — the filter is ignored and all specs run,
which re-hits the known attendance failure and invites mis-attribution.

---

## STOP Conditions (hard)

- **Never `git push`.** Not `--force`, not `--force-with-lease`, not at all. PR #14 stays as-is.
- **Never `git commit --amend`** on any replayed commit. Keep the original 10 messages verbatim.
- Never `git reset --hard`. Recovery is `--quit` / `--abort` per the table above.
- Do not start the dev server or the database. Every gate above runs without them except
  `test:e2e`, which manages its own build+preview.
- If a gate fails and the cause is not obviously a resolution mistake in one of the three files,
  **stop and report** — do not "fix forward" into unrelated source.

---

## Acceptance Criteria

1. `git log --oneline origin/staging..HEAD` prints exactly 10 lines, and the subjects match the
   phase 05 replay order above.
2. `75d88c1`, `c487adc`, `eab4c57` do not appear in `origin/staging..HEAD`.
3. `git diff origin/staging...HEAD --stat` lists only the 14 allow-listed paths.
4. `grep -rn "^<<<<<<<" src/ tests/` returns nothing.
5. `pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test` all green.
6. `CI=1 pnpm test:e2e` green except the one known pre-existing attendance failure, named by spec
   file and test title in the report.
7. `tests/unit/destructive-confirms.test.ts` passes all of G1, G2, G3 — including site 15.
8. `confirm(` appears zero times in `src/routes/(app)/separations/[id]/+page.svelte` and
   `src/routes/(app)/attendance/+page.svelte`.
9. `origin/feat/uiux-phase-5` still points at `1bf99af` — nothing was pushed.

## Phase Completion Rules

- **CODE DONE** when criteria 1-4 hold and the rebase reports success.
- **VERIFIED** only when criteria 5-9 also hold, with each gate command actually run and its output
  quoted in the report. An agent summary is not evidence.
- The phase report for this update is appended to
  `phase-05-destructive-actions_REPORT_03-09-26.md` under a `## Rebase onto staging (11-09-26)`
  heading. Record: each conflicted file, which side won and why, and any deviation from C1/C2/C3.
- The branch is **not** pushed and PR #14 is **not** updated by this phase. Pushing is a separate,
  owner-authorised step.

## Testing Context

Test routing per `process/context/all-context.md` → `process/context/tests/all-tests.md`. Runners:
`vitest` for `tests/unit/**` via `pnpm test`; Playwright against a production build + preview via
`CI=1 pnpm test:e2e`. Post-phase testing is the full five-command gate set above, run in CI order.

## Execute Anchor

Execute starts at `## Implementation Checklist` step 1. Supporting phase files:
`phase-05-destructive-actions_PLAN_03-09-26.md` (the site enumeration and copy standards this
rebase must preserve), `phase-05-destructive-actions_REPORT_03-09-26.md` (what was actually built),
`phase-blast-radius-registry.md` (the claim closed by `e3ad21a`).

## Touchpoints

- **Refs read:** `origin/staging` (`339630b`), `feat/uiux-phase-5` (`1bf99af`), `b3334f0`, `7742e59`
- **Ref written:** `feat/uiux-phase-5` (local only)
- **Files resolved by hand:** `src/routes/(app)/employees/[id]/+page.svelte`,
  `src/routes/(app)/attendance/+page.svelte`, `src/routes/(app)/separations/[id]/+page.svelte`
- **Files reviewed after auto-merge:** `src/routes/(app)/settings/roles/+page.svelte`,
  `src/routes/(app)/performance/reviews/[id]/+page.svelte`
- **Gate artifact:** `tests/unit/destructive-confirms.test.ts`, `tests/e2e/separations.spec.ts`

## Public Contracts

None. No schema, no API route, no capability, no server action signature changes. The only
user-visible contract is confirm-dialog **copy**, which `destructive-confirms.test.ts` pins.

## Blast Radius

14 files in the resulting diff (10 svelte, 2 test, 2 docs). One local branch ref. Risk class:
**history rewrite on a pushed branch** — mitigated by never pushing and by `1bf99af` remaining on
`origin/feat/uiux-phase-5`. No production surface; the project has no live deployment.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `git log --oneline origin/staging..HEAD` is 10 lines | Fully-Automated | The 3 trap commits did not replay and none of the 10 was lost |
| `git diff origin/staging...HEAD --stat` matches the allow-list | Fully-Automated | No foreign content entered via a resolution |
| `grep -rn "^<<<<<<<" src/ tests/` empty | Fully-Automated | No marker shipped |
| `pnpm format:check` / `pnpm lint` / `pnpm check` | Fully-Automated | Resolutions are syntactically and type-wise sound; no orphan/duplicate imports (T3) |
| `pnpm test` → `destructive-confirms.test.ts` G1/G2/G3 | Fully-Automated | All 16 sites still wired, zero native `confirm(`, all 17 consequence needles intact — this is the C2 trap detector |
| `CI=1 pnpm test:e2e` | Hybrid (builds + previews the app) | Separation confirm flow still drives the kit dialog; no regression from staging's structural rewrites |
| Eyeball `settings/roles` + `performance/reviews/[id]` after step 5 | Agent-Probe | T2 — the clean hunk beside the conflicted one is semantically right, not just marker-free |

Failing stub for the primary gate (already implemented by `9296163`; listed for red-first traceability):

```
test("site 15 attendance reset still says the phase 05 consequence copy", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: attendance ConfirmButton message retains 'thrown away and re-derived from the raw punches'")
})
```

## Test Infra Improvement Notes

The conflict map here was produced by chaining `git merge-tree --write-tree` per commit — a
read-only, worktree-safe rebase dry run. This is reusable for every future stale-branch update in
this program and is worth promoting to a script. (Not built in this plan — out of scope.)

## Resume and Execution Handoff

1. **Selected plan file path:**
   `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-05-rebase-onto-staging_PLAN_11-09-26.md`
2. **Last completed phase or step:** VALIDATE complete. No rebase started; no ref changed.
3. **Validate-contract status:** written — see `## Validate Contract`.
4. **Supporting context files loaded:** `phase-05-destructive-actions_PLAN_03-09-26.md`,
   `phase-05-destructive-actions_REPORT_03-09-26.md`, `phase-blast-radius-registry.md`,
   `tests/unit/destructive-confirms.test.ts`, `CLAUDE.md`.
5. **Next step for a fresh agent:** run `## Implementation Checklist` step 1. If `git status` is not
   clean or HEAD is not `1bf99af`, stop — the pre-state assumed by the conflict map no longer holds
   and the simulation must be re-run before proceeding.

---

## Validate Contract

```yaml
generated-by: outer-pvl
plan: process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-05-rebase-onto-staging_PLAN_11-09-26.md
date: 11-09-26
gate: CONDITIONAL
mode: deep
layer1:
  infra-fit: PASS
  test-coverage: PASS
  breaking-changes: PASS
  security-surface: PASS
layer2:
  rebase-shape: PASS
  C1-employees-detail: PASS
  C2-attendance: CONCERN
  C3-separations: CONCERN
  gates-and-stop-conditions: PASS
concerns:
  - id: V-1
    section: C2
    text: >-
      The attendance resolution keeps staging's ConfirmButton structure but substitutes phase 05's
      message copy. Two competing wordings exist for the same dialog and the plan picks one on the
      test's authority, not the owner's. Accepted because destructive-confirms.test.ts is the
      shipped contract; a copy change is a separate owner decision.
    disposition: accepted — execute-agent instruction E1
  - id: V-2
    section: C3
    text: >-
      Staging's 109-259 rewrite of separations/[id] was read at hunk-header granularity, not line by
      line. The finalize button's aria-describedby and disabled condition are named explicitly as
      must-preserve, but other staging attribute changes in that card could be lost.
    disposition: accepted — execute-agent instruction E2; e2e separations spec is the backstop
execute-agent-instructions:
  - id: E1
    trigger: at commit 0114184, resolving src/routes/(app)/attendance/+page.svelte
    text: >-
      Take staging's side wholesale, then edit BOTH Reset ConfirmButton blocks to carry phase 05's
      message string verbatim. Do not accept `git checkout --ours` as finished. Confirm with
      `grep -c "thrown away and re-derived from the raw punches" src/routes/\(app\)/attendance/+page.svelte`
      returning 2 before `git rebase --continue`.
  - id: E2
    trigger: at commit 0114184, resolving src/routes/(app)/separations/[id]/+page.svelte
    text: >-
      Before staging the resolution, run
      `git diff origin/staging -- "src/routes/(app)/separations/[id]/+page.svelte"` and read every
      removed line. Any line removed that is NOT part of the finalize/undo confirm rewiring is a
      mis-resolution — restore it.
  - id: E3
    trigger: after `git rebase --continue` at commit 8fd0e61
    text: >-
      T2. Diff settings/roles/+page.svelte and performance/reviews/[id]/+page.svelte against both
      sides. They auto-merged; simulation says correctly, but this is the shape that failed during
      the phase 04 update.
  - id: E4
    trigger: any gate failure
    text: >-
      Only the one known pre-existing attendance e2e failure is permitted. Name the failing spec file
      and test title in the report. Every other failure is a rebase defect — stop, do not fix forward.
test-gates:
  - pnpm format:check
  - pnpm lint
  - pnpm check
  - pnpm test
  - CI=1 pnpm test:e2e
shape-gates:
  - "git log --oneline origin/staging..HEAD | wc -l == 10"
  - "git diff origin/staging...HEAD --stat matches the 14-path allow-list"
  - "grep -rn \"^<<<<<<<\" src/ tests/ is empty"
hard-stops:
  - never git push (any form)
  - never git commit --amend
  - never git reset --hard
  - do not start dev server or database
strategy: sequential
model: opus (single executor; conflict resolution is code-execution work)
