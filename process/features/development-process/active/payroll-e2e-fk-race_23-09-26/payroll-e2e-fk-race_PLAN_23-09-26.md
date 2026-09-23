---
name: plan:payroll-e2e-fk-race
description: "A4 — stop the local-parallel e2e race where payroll computes sweep in ACTIVE fixtures that other specs hard-delete (FK P2003 500 / silent residue). Test-only fix via a Playwright project dependency."
date: 23-09-26
feature: development-process
---

# PLAN — Payroll compute vs fixture hard-delete e2e race (A4)

**Date**: 23-09-26 · **Status**: PLANNED · **Complexity**: SIMPLE · **Base**: `staging` @ 1f3ce18 · **Branch**: `fix/payroll-e2e-fk-race` (`git switch -c` off updated local `staging`)

TL;DR: Split the six specs that create and then hard-delete ACTIVE seed-org employees into their own Playwright project. The main project depends on it, so no payroll compute can run while those fixtures exist. Test config only. No product change.

## Overview

`computePayroll` (`src/lib/server/services/payroll/index.ts:324`) reads ACTIVE employees at :348 with no transaction. It writes entries later in a separate `db.$transaction` (:693-698). `PayrollEntry.employee` is RESTRICT. When another spec's afterAll deletes ACTIVE fixtures in the seed org while a compute is in flight, one of two things happens:
- (a) the delete wins, then the compute write fails with P2003. This gives a raw 500, because the payroll actions catch only `isHttpError`.
- (b) the compute commits between the `payrollEntry.deleteMany` and the `employee.deleteMany`. The employee delete then fails inside a swallowed catch and leaves residue behind.

CI runs `workers: 1`, so only local parallel runs are hit. This is NOT a product bug.

## Research facts (verified on staging)

The seed-org specs that create ACTIVE employees and then hard-delete them are the "fixture set":

| Spec | Why it is in the set |
|---|---|
| `tests/e2e/pagination.spec.ts` | 25 ACTIVE (schema default `@default(ACTIVE)`), deleted at :72-74 |
| `tests/e2e/admin.spec.ts` | creates users/employees, deletes at :22-24 |
| `tests/e2e/container-bounds.spec.ts` | `employmentStatus: 'ACTIVE'` at :103, sweep at :31 |
| `tests/e2e/employees-new-disclosure.spec.ts` | creates through the UI (default ACTIVE), deletes at :58-59 |
| `tests/e2e/settings-org-assignments.spec.ts` | default ACTIVE, deletes at :68-69 |
| `tests/e2e/separations.spec.ts` | `employmentStatus: 'ACTIVE'` at :116. Deletes employees at :76 with NO payrollEntry delete first, so a sweep would fail its teardown. |

Excluded, and why:
- `inventory`, `pagination-lists`, `settings-org-search` make OFFBOARDED fixtures. Compute never sweeps them in.
- `payslip-tenancy` uses a separate FOREIGN org. The seed-org compute cannot see it.
- `timesheet-punch` has no payroll refs.

The compute-triggering specs (16) are `action-buttons`, `dashboard`, `multi-role-sod`, `page-header-helptip`, `payroll-approval`, `payroll-custom-range-labels`, `payroll-custom-range-overlap`, `payroll-lock-idempotency`, `payroll-run-void`, `payroll-void-run-amortization`, `payslip-draft-visibility`, `payslip-tenancy`, `period-picker-cross-month`, `period-picker-default-cutoff`, `settings-context-rail`, and `settings-org-search`. EXECUTE step 1 re-confirms this list by grep. The fix does not need the list, because every spec outside the fixture set runs after it.

`test.describe.configure({ mode: 'serial' })` works per file only. It cannot stop two files from overlapping, so option (ii-describe) is ruled out.

## Options

| Option | Verdict |
|---|---|
| **(ii) Playwright project dependency — RECOMMENDED** | Put the 6 fixture-set specs in project `fixtures-hard-delete`. Project `chromium` gets `testIgnore` for them and `dependencies: ['fixtures-hard-delete']`. Playwright runs every dependency project to completion (afterAll included) before the dependent project starts. So no compute can overlap a fixture's lifetime. The files inside each project still run in parallel. One file changes. It fixes both directions (a) and (b). |
| (i) Fixture isolation (separate org / non-ACTIVE) | Rejected. `pagination` and `settings-org-assignments` must be ACTIVE and in the admin's org, because the list pages they test default to the active tab of the logged-in org. A separate org needs a new login user per spec. That is a larger, riskier change across 6 files. |
| (iii) Offboard instead of hard-delete | Rejected. It does not fix (a). A compute that snapshotted before the offboard still writes entries (no FK error, but wrong). It also leaves permanent rows that fill the render caps (memory: a-render-cap-turns-fixture-residue-into-failures). |
| (iv) Product: compute skips vanished employees / maps P2003 to a 4xx | Not the smallest fix. It hits the `src/lib/server/services/**` hard-stop, and it does not fix (b) residue. Only a follow-up if the owner wants the 500 to become a clean error anyway. |

Known cost of (ii): if a fixture-set spec fails, Playwright skips the whole `chromium` project. Mitigation: EXECUTE passes `--no-deps` for targeted local runs where needed, and the full run reports it clearly. The owner decides below.

## Owner decisions

1. **Failure in a fixture-set spec skips the rest of the suite.** (A) Accept it. It is the price of the hard ordering, and CI is serial anyway. (B) Drop the dependency and run local e2e with `--workers=1`, the same as CI. It is always safe, but the full run is much slower. **Recommend A.**
2. **Also harden the product 500 (option iv) later?** (A) No. Test-only, as the task says. (B) File a backlog note to map P2003 in `computePayroll` to a clean error. This needs owner approval (hard-stop). **Recommend A**, and write the backlog note only if the owner says B.

## Scope

In: `playwright.config.ts` only.
Out: every file under `src/`, every spec body, `scripts/clean-e2e-employees.ts`.

## Touchpoints

| File | Lane / owner | Change |
|---|---|---|
| `playwright.config.ts` | Lane 1 (single vc-execute-agent) | Add project `fixtures-hard-delete` (`testMatch` = the 6 specs, same `devices['Desktop Chrome']`). On `chromium`, add `testIgnore` = the same 6 and `dependencies: ['fixtures-hard-delete']`. Keep every existing comment verbatim. Add no new comment. |

Read-only: the 6 fixture-set specs and the 16 compute specs (grep only).

## Public Contracts

None. There is no product, API, or schema change. `bun run test:e2e` still runs every spec exactly once.

## Blast Radius

1 file. Test harness only. Risk class: none of the high-risk classes. It changes e2e ordering and can change wall-clock time.

## Implementation Checklist

1. Preconditions. The user has started `veent-db-5434` (`./start.sh`). **Executors never run `./start.sh`, vite, or the DB.** Playwright's own `webServer` (build + preview on 4173) is allowed, because that is the suite. Run `git switch staging && git pull` (the owner allows this), then `git switch -c fix/payroll-e2e-fk-race`.
2. Re-confirm the sets. Run `git grep -ln "employee.deleteMany" -- tests/e2e` and `git grep -n "employmentStatus" -- tests/e2e`. Record any drift from the tables above in the report. If a new ACTIVE seed-org hard-deleter exists, add it to the fixture set.
3. **RED baseline (measure first).** Run the repro command below N=10 times on unchanged staging. Record the pass/fail count per iteration and the exact error text. Grep the logs for `P2003`, `Foreign key constraint`, and `500`. Also count residue after each iteration: `docker exec -i veent-db-5434 psql -p 5434 -U veent -d veent_hris -tAc "select count(*) from \"Employee\" where \"lastName\"='Zzpagetest'"`. Confirm the table name from `prisma/schema.prisma` first. Note: `-i` is required (memory: commands-that-succeed-at-nothing).
4. **Sequential control.** Run the same command with `--workers=1`, 3 times. It must be green 3/3 with 0 residue. If the control is red, stop: the failure is not the race (memory: concurrency-test-needs-a-sequential-control, diagnose-from-the-error-not-the-verdict).
5. If step 3 shows 0 failures in 10, raise it to N=30 and add `payroll-approval.spec.ts` to the command. If it is still 0, record "race not reproduced", keep the fix (it is structural), and flag the RED as unproven in the report. Do not invent a failure rate.
6. Edit `playwright.config.ts` as in Touchpoints.
7. Run `bunx playwright test --list | wc -l` before and after the edit. The test count must be equal (every spec runs exactly once, none dropped). Then run `bunx playwright test --list --project=fixtures-hard-delete` and check it lists exactly the 6 files.
8. Negative control. Temporarily remove `dependencies` and run the repro once with `--repeat-each` as in step 3. It should show the RED signature again (only if step 3 reproduced it). Restore the file. Check `git diff` shows only the intended change.
9. GREEN. Run the same repro command N=10 (same N as step 3). It must be 10/10 green with 0 residue.
10. Run the gates in order: `bun run format:check`, `bun run lint`, `bun run check`, `bun run test`.
11. Full local e2e: `bun run test:e2e` (parallel workers, the default). Compare it to a baseline full run on staging taken in step 3, because pre-existing failures need a baseline (memory: full-suite-failures-need-a-baseline-run).
12. Commit `playwright.config.ts` only. Message: `test(e2e): run fixture hard-delete specs before payroll computes`, with a body that states the race and the RED/GREEN numbers. No AI attribution, no Co-Authored-By.

## Repro command

```
for i in $(seq 1 10); do bun run test:e2e -- tests/e2e/pagination.spec.ts tests/e2e/payroll-custom-range-labels.spec.ts tests/e2e/payroll-custom-range-overlap.spec.ts --workers=4 --repeat-each=3 --reporter=line 2>&1 | tee /tmp/claude-1000/-home-hyuse-Desktop-VeentApps-hris/f8214194-b4ec-4e22-9d63-d6dd2282c62d/scratchpad/a4-run-$i.log | tail -3; done
```

Control: the same command with `--workers=1`, 3 iterations. After the fix, the command runs unchanged. The dependency project runs first automatically. Note that `webServer` rebuilds on every invocation (~12s), which is accepted.

## Acceptance Criteria

- AC1: The repro command is green 10/10 after the fix, over the same N as the RED run. `proven by:` checklist step 9 · `strategy:` Hybrid
- AC2: 0 Zzpagetest residue rows after every GREEN iteration. `proven by:` step 3/9 residue query · `strategy:` Hybrid
- AC3: The test count is unchanged and the fixture project lists exactly 6 files. `proven by:` step 7 · `strategy:` Fully-Automated
- AC4: No file under `src/` is changed. `proven by:` `git diff --stat staging -- src` is empty · `strategy:` Fully-Automated
- AC5: The static gates and the full e2e run show no new failures against the baseline. `proven by:` steps 10-11 · `strategy:` Hybrid

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| RED baseline, N=10, parallel (step 3) | Hybrid (needs user-started DB) | precondition for AC1 |
| Sequential control, workers=1 (step 4) | Hybrid | proves the failure is concurrency-only |
| Dependency removed, RED again (step 8) | Hybrid | AC1 guard is not vacuous |
| Repro GREEN, N=10 (step 9) | Hybrid | AC1, AC2 |
| `playwright test --list` counts (step 7) | Fully-Automated | AC3 |
| `git diff --stat staging -- src` | Fully-Automated | AC4 |
| format:check / lint / check / test | Fully-Automated | AC5 |
| full `bun run test:e2e` vs baseline | Hybrid | AC5 |

## Phase Completion Rules

- CODE DONE: config edited, steps 7-8 pass.
- VERIFIED: AC1-AC5 all proven with recorded numbers (RED rate, GREEN 10/10, residue 0, full-run diff against baseline). If RED never reproduced, status stays CODE DONE with "RED unproven".

## Risks

- A fixture-set failure skips the dependent project (owner decision 1).
- Wall-clock time goes up slightly, because the 6 specs no longer overlap the rest.
- A future spec can add a new ACTIVE hard-deleter outside the set and bring the race back. Step 2 records this. A follow-up guard test is out of scope.
- Rollback: revert the one commit.

## Test Infra Improvement Notes

- A later guard test could scan `tests/e2e` for `employee.deleteMany` in specs outside `fixtures-hard-delete` whose fixtures are ACTIVE. It is not in scope.

## Validate Contract

Status: BLOCKED
Date: 23-09-26
date: 2026-09-23
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: score 0/7 (1 file, no high-risk class, not a phase program). One vc-execute-agent (opus). Validation ran as one sequential agent that read the Playwright 1.61.1 runner source directly.

Net gate: 1 FAIL / 4 CONCERNs. The fix itself (project dependency) is sound and proven from source. The FAIL is in the proof: the repro command cannot give an honest RED or a reachable GREEN. Class: missing-detail/checklist, so one plan-validate-fix loop, then re-validate from V1.

### Validated facts (VC = validate check)

- VC1 PASS — dependency holds, afterAll included, any worker count. Installed `@playwright/test` 1.61.1 (package.json `^1.49.0`). `node_modules/playwright/lib/runner/index.js` createPhasesTask (~L6051): a project enters a phase only when all its `deps` are processed. createRunTestsTask (~L6103): each phase does `await dispatcher.run(...)` then `await dispatcher.stop()` (all workers shut down, so afterAll and worker fixtures finish) before the next phase starts.
- VC2 PASS — CLI file paths keep the dependency. collectProjectsAndTestFiles (~L2375): a dependency project gets ALL its files and ignores the CLI filter. createRootSuite (~L2471) prepends it with the unfiltered suite. So the repro runs all 6 fixture specs, not only pagination. When a CLI filter matches ONLY fixture-set files, that project becomes top-level and runs only the filtered file.
- VC3 PASS — `--repeat-each` does NOT repeat the dependency project. The CLI override applies to top-level projects only (~L2444; comment in `lib/common/index.js` ~L646). After the fix, pagination runs once per invocation. Before the fix, it runs x3. RED and GREEN are therefore not like-for-like.
- VC4 PASS — `testMatch`/`testIgnore` string globs get a `**/` prefix and match the whole basename (`lib/util.js` createFileMatcher). `'pagination.spec.ts'` does NOT match `pagination-lists.spec.ts`. A RegExp such as `/pagination/` WOULD match it, so use string globs only.
- VC5 PASS — fixture set re-derived independently: the 6 specs are correct and complete. inventory, pagination-lists and settings-org-search are OFFBOARDED on create AND on upsert-update, and no flow in them sets ACTIVE again. payslip-tenancy uses the FOREIGN org. timesheet-create-for-employee creates a user with no employee. employees-new-layout's only Create is rejected by validation. Missed from the plan's exclusion list, but correctly excluded: `dashboard-layout.spec.ts` creates an ACTIVE PROBATIONARY employee through the UI (:130-139) and only offboards it in afterAll (:115). It never hard-deletes, so it cannot cause P2003. A compute can still sweep it in, which is harmless because runs are cleaned by id.
- VC6 PASS — the repro payroll specs do compute in the seed org. `createPayrollRun` calls `computePayroll` in the same request (`src/lib/server/services/payroll/index.ts:307`). Both specs use `org_seed`, which is the admin's org.
- VC7 PASS — config fit. CI runs `bun run test:e2e` with no `--project` filter (`.github/workflows/ci.yml:116`). The only existing project is `chromium`. There is no auth or storageState project. `globalSetup` and `webServer` are global and run once. `--list` builds the same root suite (dependency prepended), so every test is listed once. The count stays the same when both lists name the same 6 files.

### Findings

- F1 FAIL — the repro cannot fail or pass for the right reason. `--repeat-each=3 --workers=4` runs copies of the SAME file at the same time (each repeat index needs its own worker, `_workerHash ...-repeatEachIndex`). pagination x3 upserts the same 25 emails at the same time (unique race), and the first copy's afterAll deletes the rows the others are still paging. payroll-custom-range-labels x3 creates the same Dec 4-12 run (`@@unique([organizationId, periodStart, periodEnd])`, plus the overlap guard), and the first copy's afterAll deletes the others' run. The overlap spec x3 breaks its "one July run" assertion. Result: RED will show failures that are not the race. The workers=1 control will be green, so it "confirms concurrency" for the wrong cause. The step-8 negative control reds for the wrong reason. AC1 "GREEN 10/10" is likely UNREACHABLE after the fix, because chromium still repeats the payroll specs in parallel.
- F2 CONCERN — the residue query names a table that does not exist. `Employee` is `@@map("employees")`. Use `select count(*) from employees where "lastName"='Zzpagetest'`.
- F3 CONCERN — the race proof is probabilistic, and the plan has no deterministic proof that the ordering holds. Add `DEBUG=pw:test:task` to the GREEN run and grep for `created phase #1 with fixtures-hard-delete projects` and `created phase #2 with chromium projects`. The negative control (remove `dependencies`) must then show ONE phase listing both projects. This check can fail, it fails for the right reason, and it does not need the race to reproduce.
- F4 CONCERN — CI impact is not stated. The dependency also applies in CI (workers 1, retries 2). A fixture-set spec that still fails after retries makes about 200 chromium tests "did not run" in CI, so the report loses signal. See owner decision 1.
- F5 CONCERN — cost and baseline gaps. Step 11 compares against "a baseline full run taken in step 3", but step 3 never runs one. Add an explicit full `bun run test:e2e` on staging (record pass/fail/flaky and wall-clock). Each repro iteration after the fix also runs all 6 fixture specs (about 37 tests, serial files of 10 tests: separations, settings-org-assignments, admin), which adds an estimated 40-70s per iteration. Full-suite wall-clock goes up by an estimated 20-45s (phase 1 tail, 4 default workers on 8 cores). These are estimates: measure them, do not quote them.
- Cannot-fail check: AC4 (`git diff --stat staging -- src` empty) is a scope guard that is true by construction. Keep it, but it proves nothing about the race. AC3's "count equal" misses a file moved to the wrong project. Use the diff of test ids with the project prefix removed (E3).

### Required plan supplement (P = plan edit, applied by vc-plan-agent)

| # | What changes | Where |
|---|---|---|
| P1 | Replace the repro with: no `--repeat-each`, `--workers=4`, one copy each of pagination + payroll-custom-range-labels (Dec) + payroll-custom-range-overlap (Jul) + payroll-approval (Sep/Oct) + multi-role-sod (Nov). These own separate months, so they never collide with each other. Loop N=30. | Repro command, steps 3/5/8/9 |
| P2 | Count RED only as race-signature hits: `P2003` / `Foreign key constraint` / a 500 on a payroll create or compute action, or residue > 0. Record every other failure separately, with its error text, as "not the race". AC1 = 0 race-signature hits and 0 residue over N GREEN iterations, with other failures matched against the baseline. | Steps 3-5, 8-9, AC1 |
| P3 | Add the F3 phase-order gate (`DEBUG=pw:test:task`) to step 9, and make it the step-8 negative control. | Steps 8-9, Verification Evidence |
| P4 | Correct the residue SQL to `employees` (F2). Add `mkdir -p` for the log directory. | Step 3 |
| P5 | Add an explicit full-suite baseline on staging before the edit, with wall-clock. | Step 3 / 11 |
| P6 | Add `dashboard-layout` to the exclusion list, with its reason (VC5). | Research facts |
| P7 | Owner decision 1: add option B (below). Name the CI impact. | Owner decisions |

### Execute-agent instructions (E)

- E1 — Use string globs in ONE shared const array for both `testMatch` and `testIgnore`. Never use a RegExp (VC4).
- E2 — Do not treat a failure as the race without the P2 signature. Quote the error text.
- E3 — AC3: `bun run test:e2e -- --list | sed -E 's/^ *\[[^]]+\] › //' | sort` before and after the edit. The `diff` must be empty. `--project=fixtures-hard-delete --list` must end `in 6 files`.
- E4 — Never run `./start.sh`, vite, the DB, or `scripts/clean-e2e-employees.ts --apply`.

Test gates:

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | no compute overlaps a fixture's lifetime | Hybrid | `DEBUG=pw:test:task bun run test:e2e -- <P1 files> --workers=4` shows 2 phases, fixtures first; negative control shows 1 phase | B |
| AC1 | race signature gone | Hybrid | P1 loop N=30, 0 P2 signature hits (RED rate recorded, "RED unproven" allowed) | B |
| AC2 | no Zzpagetest residue | Hybrid | `docker exec -i veent-db-5434 psql -p 5434 -U veent -d veent_hris -tAc "select count(*) from employees where \"lastName\"='Zzpagetest'"` = 0 | B |
| AC3 | every test runs exactly once; 6 files in the fixture project | Fully-Automated | E3 list diff empty + `in 6 files` | A |
| AC4 | no product change | Fully-Automated | `git diff --stat staging -- src` empty | A |
| AC5 | no new failures | Hybrid | format:check, lint, check, test, then full `bun run test:e2e` vs the P5 baseline | B |

Failing stub (AC3):
test("should list every e2e test exactly once with 6 files in fixtures-hard-delete", () => { throw new Error("NOT IMPLEMENTED — TDD stub: list diff empty, fixture project in 6 files") })
Failing stub (AC4):
test("should change no file under src", () => { throw new Error("NOT IMPLEMENTED — TDD stub: git diff --stat staging -- src empty") })

Legacy line form:
- playwright.config: Fully-automated: E3 list diff | hybrid: DEBUG=pw:test:task phase lines + P1 loop (precondition: user-started veent-db-5434) | known-gap: race rate may never reproduce

Dimension findings:
- Infra fit: PASS — one project, CI unfiltered, webServer/globalSetup global, dependency semantics verified in 1.61.1 source.
- Test coverage: FAIL — repeat-each self-collision makes RED/control/GREEN measure the wrong thing (F1). No deterministic ordering gate (F3). Wrong table name (F2).
- Breaking changes: CONCERN — report prefix changes to `[fixtures-hard-delete]` for 6 specs. In CI, a fixture failure hides the rest of the suite (F4).
- Security surface: PASS — test config only. No auth, data, or secret surface.
- Section Options/Touchpoints feasibility: PASS — one-file edit, targets exist, no drift vs staging 1f3ce18.
- Section Implementation Checklist feasibility: FAIL — steps 3-5 and 8-9 as written (F1), step 11 baseline missing (F5).
- Section Research facts: CONCERN — set correct, dashboard-layout unlisted (VC5).

Open gaps: F1 (FAIL), F2-F5 (CONCERNs), owner decision 1.
Known gap: the race rate may stay 0 in N=30. Then "RED unproven" is recorded, and the phase-order gate (F3) is the proof.

What This Coverage Does NOT Prove:
- Phase-order gate: that no OTHER spec (outside the 6) hard-deletes ACTIVE seed-org employees in the future. Step 2 grep only covers today.
- P1 loop: that the race rate before the fix was above 0, if no signature is seen.
- AC3 list diff: runtime behaviour. It proves membership and count only.
- AC5: flakiness that is not in the baseline run.

Gate: BLOCKED (1 unresolved FAIL: F1)
Accepted by: none — BLOCKED. After the P1-P7 supplement, re-run VALIDATE from V1.

## Autonomous Goal Block

SESSION GOAL: Fix the local-parallel e2e race (payroll compute vs ACTIVE fixture hard-delete) with a Playwright project dependency in playwright.config.ts only.
Plan: process/features/development-process/active/payroll-e2e-fk-race_23-09-26/payroll-e2e-fk-race_PLAN_23-09-26.md
State: VALIDATE BLOCKED on F1 (the repeat-each repro self-collides). Next: vc-plan-agent applies P1-P7, then vc-validate-agent re-runs from V1.
Autonomy: edit playwright.config.ts only. Commit per verified unit. No AI attribution.
Hard stops: no ./start.sh, vite, DB start, or clean-e2e-employees --apply. No src/ edits. No push. Never edit .env.
Contract summary: dependency semantics proven from 1.61.1 source (VC1-VC4). Fixture set of 6 confirmed (VC5). Proof = DEBUG=pw:test:task phase order + a signature-only race loop without --repeat-each.
Execute start: after PASS/CONDITIONAL, run "ENTER EXECUTE MODE" with the plan path above.

## Resume and Execution Handoff

1. Selected plan: `process/features/development-process/active/payroll-e2e-fk-race_23-09-26/payroll-e2e-fk-race_PLAN_23-09-26.md`
2. Last completed step: none (PLAN written)
3. Validate-contract: pending
4. Context loaded: `playwright.config.ts`, the 10 `employee.deleteMany` specs, `prisma/schema.prisma` employmentStatus default, memory files named in the task
5. Next: VALIDATE, then one vc-execute-agent (opus) runs steps 1-12. The orchestrator holds git and the e2e port.

Next instruction: ENTER VALIDATE MODE for this plan, then ENTER EXECUTE MODE with this exact plan path.
