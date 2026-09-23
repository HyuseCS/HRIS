---
name: plan:payroll-e2e-fk-race
description: "A4 — stop the local-parallel e2e race where payroll computes sweep in ACTIVE fixtures that other specs hard-delete (FK P2003 500 / silent residue). Test-only fix via a Playwright project dependency."
date: 23-09-26
feature: development-process
---

# PLAN — Payroll compute vs fixture hard-delete e2e race (A4)

**Date**: 23-09-26 · **Status**: PLANNED (validate CONDITIONAL, C1-C3 applied, accepted) · **Complexity**: SIMPLE · **Base**: `staging` @ c152031 · **Branch**: `fix/payroll-e2e-fk-race` (exists, checked out, equals `staging`)

TL;DR: Split the six specs that create and then hard-delete ACTIVE seed-org employees into their own Playwright project. Locally, the main project depends on it, so no payroll compute can run while those fixtures exist. In CI (`workers: 1`) there is no dependency. Test config only. No product change.

## Overview

`computePayroll` (`src/lib/server/services/payroll/index.ts:324`) reads ACTIVE employees at :348 with no transaction. It writes entries later in a separate `db.$transaction` (`src/lib/server/services/payroll/index.ts:694-700`). `PayrollEntry.employee` is RESTRICT. When another spec's afterAll deletes ACTIVE fixtures in the seed org while a compute is in flight, one of two things happens:
- (a) the delete wins, then the compute write fails with P2003. This gives a raw 500, because the payroll actions catch only `isHttpError`.
- (b) the compute commits between the `payrollEntry.deleteMany` and the `employee.deleteMany`. The employee delete then fails inside a swallowed catch and leaves residue behind.

CI runs `workers: 1`, so only local parallel runs are hit. This is NOT a product bug.

## Research facts (verified on staging)

The seed-org specs that create ACTIVE employees and then hard-delete them are the "fixture set":

| Spec | Why it is in the set |
|---|---|
| `tests/e2e/pagination.spec.ts` | 25 ACTIVE (schema default `@default(ACTIVE)`), deleted at :73-75 |
| `tests/e2e/admin.spec.ts` | creates users/employees, deletes at :22-24 |
| `tests/e2e/container-bounds.spec.ts` | `employmentStatus: 'ACTIVE'` at :103, `sweep()` at `tests/e2e/container-bounds.spec.ts:31-38` |
| `tests/e2e/employees-new-disclosure.spec.ts` | creates through the UI (default ACTIVE), deletes at :58-59 |
| `tests/e2e/settings-org-assignments.spec.ts` | default ACTIVE, deletes at :68-69 |
| `tests/e2e/separations.spec.ts` | `employmentStatus: 'ACTIVE'` at :116. Deletes employees at :76 with NO payrollEntry delete first, so a sweep would fail its teardown. |

Excluded, and why:
- `inventory`, `pagination-lists`, `settings-org-search` make OFFBOARDED fixtures. Compute never sweeps them in.
- `payslip-tenancy` uses a separate FOREIGN org. The seed-org compute cannot see it.
- `timesheet-punch` has no payroll refs.
- `dashboard-layout` creates an ACTIVE PROBATIONARY employee but only offboards it in afterAll (`updateMany` to OFFBOARDED at :115-118). It never hard-deletes, so it cannot cause P2003. A compute can sweep it in, which is harmless because runs are cleaned by id.

The compute-triggering specs (16) are `action-buttons`, `dashboard`, `multi-role-sod`, `page-header-helptip`, `payroll-approval`, `payroll-custom-range-labels`, `payroll-custom-range-overlap`, `payroll-lock-idempotency`, `payroll-run-void`, `payroll-void-run-amortization`, `payslip-draft-visibility`, `payslip-tenancy`, `period-picker-cross-month`, `period-picker-default-cutoff`, `settings-context-rail`, and `settings-org-search`. EXECUTE step 1 re-confirms this list by grep. The fix does not need the list, because every spec outside the fixture set runs after it.

`test.describe.configure({ mode: 'serial' })` works per file only. It cannot stop two files from overlapping, so option (ii-describe) is ruled out.

## Options

| Option | Verdict |
|---|---|
| **(ii) Playwright project dependency — RECOMMENDED** | Put the 6 fixture-set specs in project `fixtures-hard-delete`. Project `chromium` gets `testIgnore` for them and `dependencies: ['fixtures-hard-delete']`. Playwright runs every dependency project to completion (afterAll included) before the dependent project starts. So no compute can overlap a fixture's lifetime. The files inside each project still run in parallel. One file changes. It fixes both directions (a) and (b). |
| (i) Fixture isolation (separate org / non-ACTIVE) | Rejected. `pagination` and `settings-org-assignments` must be ACTIVE and in the admin's org, because the list pages they test default to the active tab of the logged-in org. A separate org needs a new login user per spec. That is a larger, riskier change across 6 files. |
| (iii) Offboard instead of hard-delete | Rejected. It does not fix (a). A compute that snapshotted before the offboard still writes entries (no FK error, but wrong). It also leaves permanent rows that fill the render caps (memory: a-render-cap-turns-fixture-residue-into-failures). |
| (iv) Product: compute skips vanished employees / maps P2003 to a 4xx | Not the smallest fix. It hits the `src/lib/server/services/**` hard-stop, and it does not fix (b) residue. Only a follow-up if the owner wants the 500 to become a clean error anyway. |

Known cost of (ii): if a fixture-set spec fails, Playwright skips the whole `chromium` project. With D4 this applies to local runs only. CI has no dependency, so a fixture failure in CI does not turn about 200 chromium tests into "did not run". EXECUTE may pass `--no-deps` for targeted local runs.

## Owner decisions (DECIDED)

- **D4 — decided: the dependency is local-only.** `chromium` gets `dependencies: process.env.CI ? [] : ['fixtures-hard-delete']`. Reason: CI runs `workers: 1`, so the race cannot happen there, and a CI dependency would skip about 200 chromium tests after one fixture-set failure (validate F4). Locally, a fixture-set failure still skips `chromium`; that is accepted.
- **D5 — decided: test-only.** Only `playwright.config.ts` changes. No product hardening of the P2003 500 in `computePayroll`, and no backlog note for it.

## Scope

In: `playwright.config.ts` only.
Out: every file under `src/`, every spec body, `scripts/clean-e2e-employees.ts`.

## Touchpoints

| File | Lane / owner | Change |
|---|---|---|
| `playwright.config.ts` | Lane 1 (single vc-execute-agent) | Add project `fixtures-hard-delete` (`testMatch` = the 6 specs, same `devices['Desktop Chrome']`). Put the 6 names in ONE shared const array of string globs (never a RegExp: `/pagination/` would also match `pagination-lists.spec.ts`). On `chromium`, add `testIgnore` = that same array and `dependencies: process.env.CI ? [] : ['fixtures-hard-delete']` (D4). Keep every existing comment verbatim. Add no new comment. |

Read-only: the 6 fixture-set specs and the 16 compute specs (grep only).

## Public Contracts

None. There is no product, API, or schema change. `bun run test:e2e` still runs every spec exactly once.

## Blast Radius

1 file. Test harness only. Risk class: none of the high-risk classes. It changes e2e ordering and can change wall-clock time.

## Implementation Checklist

1. Preconditions. The user has started `veent-db-5434` (`./start.sh`). **Executors never run `./start.sh`, vite, or the DB.** Playwright's own `webServer` (build + preview on 4173) is allowed, because that is the suite. The branch `fix/payroll-e2e-fk-race` already exists and is checked out. Do not create it. Confirm `git rev-parse HEAD` = `git rev-parse staging` (c152031). If they differ, stop and report. The orchestrator holds git.
2. Re-confirm the sets. Run `git grep -ln "employee.deleteMany" -- tests/e2e` and `git grep -n "employmentStatus" -- tests/e2e`. Record any drift from the tables above in the report. If a new ACTIVE seed-org hard-deleter exists, add it to the fixture set.
3. **Full-suite baseline (before the edit).** On unchanged staging, run `mkdir -p /tmp/claude-1000/-home-hyuse-Desktop-VeentApps-hris/a4` then `bun run test:e2e -- --reporter=line 2>&1 | tee /tmp/claude-1000/-home-hyuse-Desktop-VeentApps-hris/a4/baseline-full.log`, timed with `time`. Record passed / failed / flaky counts, the name and error text of every failure, and the wall-clock.
4. **RED loop (before the edit).** Run the repro loop below, N=30, on unchanged staging. It runs one copy each of five specs that own separate run months, so they never collide with each other. For each iteration record: pass/fail, the race-signature hits (see step 5), and the residue count from `docker exec -i veent-db-5434 psql -p 5434 -U veent -d veent_hris -tAc "select count(*) from employees where \"lastName\"='Zzpagetest'"` (the Prisma model `Employee` is `@@map("employees")`; `-i` is required, memory: commands-that-succeed-at-nothing).
5. **Classify every failure.** A failure counts as RED only if it carries the race signature: `P2003`, `Foreign key constraint`, or `Received: 500` on a payroll create or compute action (a bare ` 500` also matches `Timed out 5000ms`), or residue > 0 after the iteration. Check with `grep -nE "P2003|Foreign key constraint|Received: 500" /tmp/claude-1000/-home-hyuse-Desktop-VeentApps-hris/a4/a4-run-*.log`, and quote the error text. Record every other failure separately, with its error text, as "not the race" (memory: diagnose-from-the-error-not-the-verdict). Do not invent a failure rate.
6. **Sequential control.** Run the same repro command with `--workers=4` changed to `--workers=1`, 3 iterations. It must show 0 race-signature hits and 0 residue in 3/3. If it shows a signature hit, stop: the failure is not the race (memory: concurrency-test-needs-a-sequential-control).
7. Edit `playwright.config.ts` as in Touchpoints.
8. **Membership check.** Before and after the edit, run `bun run test:e2e -- --list | sed -E 's/^ *\[[^]]+\] › //' | sort > /tmp/claude-1000/-home-hyuse-Desktop-VeentApps-hris/a4/list-before.txt` (then `list-after.txt`). `diff /tmp/claude-1000/-home-hyuse-Desktop-VeentApps-hris/a4/list-before.txt /tmp/claude-1000/-home-hyuse-Desktop-VeentApps-hris/a4/list-after.txt` must be empty. `bun run test:e2e -- --list --project=fixtures-hard-delete` must end with `in 6 files`.
9. **Phase-order gate (deterministic).** Run `DEBUG=pw:test:task bun run test:e2e -- tests/e2e/pagination.spec.ts tests/e2e/payroll-custom-range-labels.spec.ts tests/e2e/payroll-custom-range-overlap.spec.ts tests/e2e/payroll-approval.spec.ts tests/e2e/multi-role-sod.spec.ts --workers=4 --reporter=line 2>&1 | tee /tmp/claude-1000/-home-hyuse-Desktop-VeentApps-hris/a4/phase-after.log`. `grep -n "created phase" /tmp/claude-1000/-home-hyuse-Desktop-VeentApps-hris/a4/phase-after.log` must show `created phase #1 with fixtures-hard-delete projects` and then `created phase #2 with chromium projects`. This proves the fixture project, afterAll included, finishes before any chromium compute starts, whether or not the race reproduces.
10. **Negative control.** Temporarily remove the `dependencies` line and run the step-9 command again into `/tmp/claude-1000/-home-hyuse-Desktop-VeentApps-hris/a4/phase-negative.log`. `grep -n "created phase"` must show ONE phase that lists both projects. Restore the line. `git diff` must show only the intended change.
11. **GREEN loop.** Run the repro loop again after the edit. An iteration counts toward N=30 only if `grep -c "did not run" /tmp/claude-1000/-home-hyuse-Desktop-VeentApps-hris/a4/a4-run-$i.log` = 0. Otherwise record it in the "not the race" list and run one more iteration. It must show 0 race-signature hits and 0 residue in every iteration. Match any other failure against the step-3 baseline and the step-4 "not the race" list. If step 4 had 0 signature hits, record "RED unproven"; the step-9 phase-order gate is then the proof. RED will likely end as "RED unproven", because each iteration has only one pagination teardown to race against; steps 9-10 are the proof of AC1.
12. Run the gates in order: `bun run format:check`, `bun run lint`, `bun run check`, `bun run test`.
13. **Full local e2e after the edit.** `bun run test:e2e -- --reporter=line 2>&1 | tee /tmp/claude-1000/-home-hyuse-Desktop-VeentApps-hris/a4/after-full.log`, timed. Compare against the step-3 baseline: no new failures, and record the wall-clock change (measure it, do not quote an estimate) (memory: full-suite-failures-need-a-baseline-run).
14. Commit `playwright.config.ts` only. Message: `test(e2e): run fixture hard-delete specs before payroll computes`, with a body that states the race and the RED/GREEN numbers. No AI attribution, no Co-Authored-By.

## Repro command

```
mkdir -p /tmp/claude-1000/-home-hyuse-Desktop-VeentApps-hris/a4
for i in $(seq 1 30); do bun run test:e2e -- tests/e2e/pagination.spec.ts tests/e2e/payroll-custom-range-labels.spec.ts tests/e2e/payroll-custom-range-overlap.spec.ts tests/e2e/payroll-approval.spec.ts tests/e2e/multi-role-sod.spec.ts --workers=4 --reporter=line 2>&1 | tee /tmp/claude-1000/-home-hyuse-Desktop-VeentApps-hris/a4/a4-run-$i.log | tail -3; docker exec -i veent-db-5434 psql -p 5434 -U veent -d veent_hris -tAc "select count(*) from employees where \"lastName\"='Zzpagetest'" | tee -a /tmp/claude-1000/-home-hyuse-Desktop-VeentApps-hris/a4/a4-residue.log; done
```

No `--repeat-each`. Copies of the same spec collide on the same users and the same run months, so they fail for a reason that is not the race. `--repeat-each` also does not repeat dependency projects, so RED and GREEN would not be like-for-like. The five specs own separate months: payroll-custom-range-labels Dec 2026 (:13-14), payroll-custom-range-overlap Jul 2026 (:14-17), payroll-approval Sep and Oct 2026 (:11-14), multi-role-sod Nov 2026 (:18-19). After the fix the dependency project also runs all 6 fixture specs in each iteration (validate VC2), which makes each iteration slower. `webServer` rebuilds on every invocation (~12s), which is accepted.

For steps 4 and 11 the GREEN/RED log prefix differs: rename the step-4 logs to `a4-red-*` before step 11 starts.

## Acceptance Criteria

- AC1: No payroll compute overlaps a fixture's lifetime, and the race signature is gone. `proven by:` step 9 phase-order gate (2 phases, fixtures first) with the step-10 negative control (1 phase), and step 11 GREEN loop N=30 with 0 race-signature hits · `strategy:` Hybrid
- AC2: 0 Zzpagetest residue rows after every GREEN iteration. `proven by:` step 11 residue query on `employees` · `strategy:` Hybrid
- AC3: Every e2e test is listed exactly once and the fixture project holds exactly 6 files. `proven by:` step 8 list diff empty + `in 6 files` · `strategy:` Fully-Automated
- AC4: No file under `src/` is changed. `proven by:` `git diff --stat staging -- src` is empty · `strategy:` Fully-Automated
- AC5: The static gates and the full e2e run show no new failures against the step-3 baseline. `proven by:` steps 12-13 · `strategy:` Hybrid

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| Full-suite baseline on staging, with wall-clock (step 3) | Hybrid (needs user-started DB) | baseline for AC5 |
| RED loop N=30, signature-only count (steps 4-5) | Hybrid | precondition for AC1 (RED rate, or "RED unproven") |
| Sequential control, workers=1 (step 6) | Hybrid | proves a signature hit is concurrency-only |
| `playwright test --list` diff + `in 6 files` (step 8) | Fully-Automated | AC3 |
| `DEBUG=pw:test:task` phase order: 2 phases, fixtures first (step 9) | Hybrid | AC1 |
| Negative control: dependency removed, 1 phase (step 10) | Hybrid | AC1 gate is not vacuous |
| GREEN loop N=30, 0 signature hits, 0 residue (step 11) | Hybrid | AC1, AC2 |
| `git diff --stat staging -- src` | Fully-Automated | AC4 |
| format:check / lint / check / test (step 12) | Fully-Automated | AC5 |
| full `bun run test:e2e` vs step-3 baseline (step 13) | Hybrid | AC5 |

## Phase Completion Rules

- CODE DONE: config edited, steps 8-10 pass.
- VERIFIED: AC1-AC5 all proven with recorded numbers (RED rate or "RED unproven", phase-order gate green, GREEN 0 signature hits in 30, residue 0, full-run diff against the step-3 baseline). If RED never reproduced, the phase-order gate (steps 9-10) is the proof of AC1.

## Risks

- A fixture-set failure skips the dependent project in local runs (D4). CI has no dependency, so this does not apply there.
- Wall-clock time goes up slightly, because the 6 specs no longer overlap the rest.
- A future spec can add a new ACTIVE hard-deleter outside the set and bring the race back. Step 2 records this. A follow-up guard test is out of scope.
- Rollback: revert the one commit.

## Test Infra Improvement Notes

- A later guard test could scan `tests/e2e` for `employee.deleteMany` in specs outside `fixtures-hard-delete` whose fixtures are ACTIVE. It is not in scope.

## Validate Contract

Status: CONDITIONAL, C1-C3 applied, accepted
Date: 23-09-26
date: 2026-09-23
generated-by: outer-pvl
supersedes: 2026-09-23 (outer-pvl) — outer PVL re-run after the P1-P7 supplement has current evidence

Parallel strategy: sequential
Rationale: score 0/7 (1 file, no high-risk class, not a phase program). One vc-execute-agent (opus). Validation ran as one sequential agent that read the Playwright 1.61.1 runner source.

Net gate: 0 FAIL / 3 CONCERNs (after 1 validate-fix loop). F1 is closed: no `--repeat-each`, 5 specs with separate months. D4 and D5 are decided by the owner and are not re-opened.

### Validated facts (re-checked on c152031 = staging; no drift from 1f3ce18 in tests/e2e, playwright.config.ts or the payroll service)

- VC1-VC4 still hold (1.61.1 source, `node_modules/playwright/lib/runner/index.js`). createPhasesTask L6051-6093; createRunTestsTask L6094+ (`dispatcher.run` then `dispatcher.stop` per phase). collectProjectsAndTestFiles L2352-2385: `buildProjectsClosure` over ALL filtered projects marks `fixtures-hard-delete` as "dependency" even when a CLI file also matches it, so the step-9 run gets all 6 fixture files. createRootSuite L2418+ prepends it.
- Phase debug text (L6088): `created phase #${n} with ${names.sort()} projects, ${k} testGroups`. Step 9 expects `created phase #1 with fixtures-hard-delete projects, …` then `created phase #2 with chromium projects, …`. Step 10 expects one line `created phase #1 with chromium,fixtures-hard-delete projects, …` (comma, no space). Substring greps in the plan match both. The gate reds for the right reason: with CI set, or with the dependency missing, it prints one phase.
- `--list` mode (L6504-6507) runs only the load task: no webServer, no globalSetup. Real output ends `Total: 281 tests in 60 files`; lines are `  [chromium] › file:line:col › title`, so the step-8 sed is correct.
- D4 local: `CI` is unset in the agent shell and `.env.dev` has no `CI` key, so `process.env.CI ? [] : ['fixtures-hard-delete']` gives the dependency in every local command. The agent shell is zsh, so the bash-style `for … do … done` loop runs.
- Race path (Q1): the only hard-deleter in the 5 repro specs is `tests/e2e/pagination.spec.ts` afterAll (:73 payrollEntry, :74 `employee.deleteMany`, :75 user). The colliding write is `tx.payrollEntry.create` at `src/lib/server/services/payroll/index.ts:698` (tx opens :694), after the ACTIVE read at :348. All 4 payroll specs reach it: `?/create` → `createPayrollRun` → `computePayroll` (:307) in `src/routes/(app)/payroll/+page.server.ts:51`. A P2003 is logged by `handleError` (`src/hooks.server.ts:58-69`, console.error → webServer stderr is piped into the log). Reachable, but narrow: pagination has ONE test (:97), so there is one afterAll per iteration. RED will likely be "RED unproven"; the step 9-10 phase gate is then the proof, as the plan already states.
- Residue query verified live (read-only): returns 0 on the current DB.
- Fixture specs trigger no compute (grep), so phase 1 cannot race itself.

### Findings

- C1 CONCERN — step 5 (line 88) grep ` 500` matches non-race text. Playwright's expect timeout prints `Timed out 5000ms …`, which contains ` 500`. RED can count a false hit, and GREEN can fail on a non-race timeout. Fix: `grep -nE "P2003|Foreign key constraint|Received: 500" …` (multi-role-sod asserts `created.status()` toBe 200, so a 500 prints `Received: 500`; the UI specs' P2003 is caught by the server-side `Foreign key constraint` line).
- C2 CONCERN — step 11 (line 94) GREEN can pass vacuously. Locally (D4), a failure in any of the 6 fixture specs skips `chromium`, so the 4 payroll specs "did not run" and the iteration shows 0 hits. Fix: an iteration counts toward N=30 only if `grep -c "did not run" a4-run-$i.log` = 0; otherwise record it and run one more iteration.
- C3 CONCERN — step 1 (line 84) `git switch -c fix/payroll-e2e-fk-race` fails: the branch already exists, is checked out, and equals staging (c152031). The header (line 10) says base 1f3ce18. Fix: skip branch creation; confirm `git rev-parse HEAD` = `git rev-parse staging`. The orchestrator holds git.
- Nit — line 16 cites the write tx as :693-698; it is :694-700 (:693 is blank). Line 30 cites sweep :31-37; it is :31-38. No other citation is wrong.

### Execute-agent instructions (E)

- E1 — One shared const array of string globs for `testMatch` and `testIgnore`. Never a RegExp.
- E2 — Use the C1 grep, not the plan's ` 500` grep. Quote the error text of every hit.
- E3 — Apply C2: a GREEN iteration with any "did not run" does not count; re-run to reach 30 valid iterations.
- E4 — Apply C3: no `git switch -c`; the branch exists.
- E5 — Before step 9, record `echo "CI=[$CI]"`; it must be empty.
- E6 — Never run `./start.sh`, vite, the DB, or `scripts/clean-e2e-employees.ts --apply`.

Test gates:

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | no compute overlaps a fixture's lifetime | Hybrid | step 9 `DEBUG=pw:test:task` shows phase #1 fixtures-hard-delete, #2 chromium; step 10 negative control shows one phase `chromium,fixtures-hard-delete` | B |
| AC1 | race signature gone | Hybrid | step 11 loop, 30 valid iterations (E3), 0 hits with the C1 grep; RED rate or "RED unproven" recorded | B |
| AC2 | no Zzpagetest residue | Hybrid | `docker exec -i veent-db-5434 psql -p 5434 -U veent -d veent_hris -tAc "select count(*) from employees where \"lastName\"='Zzpagetest'"` = 0 per iteration | B |
| AC3 | every test listed once; 6 files in fixture project | Fully-Automated | step 8 list diff empty + `Total: … in 6 files` | A |
| AC4 | no product change | Fully-Automated | `git diff --stat staging -- src` empty | A |
| AC5 | no new failures | Hybrid | format:check, lint, check, test, then full `bun run test:e2e` vs step-3 baseline | B |

Failing stub (AC3):
test("should list every e2e test exactly once with 6 files in fixtures-hard-delete", () => { throw new Error("NOT IMPLEMENTED — TDD stub: list diff empty, fixture project in 6 files") })
Failing stub (AC4):
test("should change no file under src", () => { throw new Error("NOT IMPLEMENTED — TDD stub: git diff --stat staging -- src empty") })

Legacy line form:
- playwright.config: Fully-automated: step-8 list diff | hybrid: DEBUG=pw:test:task phase lines + repro loop (precondition: user-started veent-db-5434) | known-gap: race rate may never reproduce

Dimension findings:
- Infra fit: PASS — one project added, CI unfiltered (`.github/workflows/ci.yml:116`), webServer/globalSetup global, `--list` starts no server, CI unset locally.
- Test coverage: CONCERN — ` 500` grep false positives (C1); GREEN vacuous when chromium is skipped (C2). Phase gate and negative control are sound.
- Breaking changes: PASS — report prefix changes to `[fixtures-hard-delete]` for 6 specs; CI has no dependency (D4).
- Security surface: PASS — test config only.
- Section Research facts: PASS — fixture set of 6 re-confirmed (10 `employee.deleteMany` specs, same split).
- Section Implementation Checklist: CONCERN — step 1 branch create fails (C3); steps 5 and 11 per C1/C2.
- Section Repro command: PASS — 5 specs own separate months; pagination is the only deleter, which is reachable but low-rate.

Open gaps: C1-C3 (carried as E2-E4). Known gap: the race rate may be 0 in 30; then "RED unproven" and the phase gate is the proof.

What This Coverage Does NOT Prove:
- Phase-order gate: that no future spec outside the 6 hard-deletes ACTIVE seed-org employees.
- Repro loop: a RED rate above 0 if no signature is seen; RED and GREEN are not like-for-like (GREEN runs all 6 fixture specs, RED only pagination).
- AC3 list diff: runtime behaviour; membership and count only.
- AC5: flakiness not seen in the baseline run.

Gate: CONDITIONAL (0 FAILs, 3 CONCERNs carried as execute-agent instructions E2-E4)
Accepted by: caller — C1-C3 and both nits applied to the plan body (steps 1, 5, 11; header; lines 16, 30).

## Autonomous Goal Block

SESSION GOAL: Fix the local-parallel e2e race (payroll compute vs ACTIVE fixture hard-delete) with a Playwright project dependency in playwright.config.ts only.
Plan: process/features/development-process/active/payroll-e2e-fk-race_23-09-26/payroll-e2e-fk-race_PLAN_23-09-26.md
State: validate CONDITIONAL, C1-C3 applied, accepted. Next: EXECUTE.
Autonomy: edit playwright.config.ts only. Commit per verified unit. No AI attribution.
Hard stops: no ./start.sh, vite, DB start, or clean-e2e-employees --apply. No src/ edits. No push. Never edit .env.
Contract summary: dependency semantics proven from 1.61.1 source. Fixture set of 6 confirmed. Proof = DEBUG=pw:test:task phase order + negative control; race loop uses the C1 grep and counts only iterations where chromium ran (E3). No git switch -c (E4).
Execute start: after PASS/CONDITIONAL, run "ENTER EXECUTE MODE" with the plan path above.

## Resume and Execution Handoff

1. Selected plan: `process/features/development-process/active/payroll-e2e-fk-race_23-09-26/payroll-e2e-fk-race_PLAN_23-09-26.md`
2. Last completed step: none (PLAN written)
3. Validate-contract: CONDITIONAL, C1-C3 applied, accepted
4. Context loaded: `playwright.config.ts`, the 10 `employee.deleteMany` specs, `prisma/schema.prisma` employmentStatus default, memory files named in the task
5. Next: one vc-execute-agent (opus) runs steps 1-14. The orchestrator holds git and the e2e port.

Next instruction: ENTER EXECUTE MODE with this exact plan path.
