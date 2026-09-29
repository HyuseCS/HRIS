---
name: plan:raw-enum-labels
description: "A1 — replace the 12 remaining raw Prisma enum renders with $lib label maps (adds BENEFIT_PLAN_TYPE_LABELS, reuses rbac ROLE_LABELS) and widen tests/unit/labels.test.ts from an 8-file list to every .svelte file under src/routes and src/lib."
date: 23-09-26
feature: ui-ux-overhaul
---

# Raw enum labels — PLAN (23-09-26)

**Status**: PLANNED (not validated)  
**Complexity**: SIMPLE  
**Date**: 23-09-26

**TL;DR** — 13 sites in 10 files (12 found in research + org-chart, owner D2=A) still show raw enum text (`PART TIME`, `LEAVE CREDIT`, `DRAFT`, `HR_ADMIN` fallback).
Lane L0 adds one map and widens the gate. Five file-owned lanes then swap the sites in parallel. The widened
gate must be seen RED before the swaps and GREEN after. Complexity: SIMPLE. Base: `staging` @ `1f3ce18`.

## Overview

Phase 08 mapped enums but its adoption gate only scanned 8 hard-coded files. The regex only caught bare
`{x.status}`, so `.replace('_',' ')` sites were invisible (see memory note
`a-grep-scan-misses-dressed-up-enums.md`). This plan closes the rest of that gap. It also closes
`process/features/ui-ux-overhaul/backlog/raw-enum-sweep-remaining-enums_NOTE_03-09-26.md` (UPDATE PROCESS moves it).

## Research facts (verified 23-09-26 on 1f3ce18)

- `labelFor(map: Record<string,string>, value: string): string` in `src/lib/labels.ts:298` — returns `map[value] ?? value`.
- Maps are `export const X_LABELS: Record<PrismaEnum, string>`, Sentence case, types imported from `@prisma/client` (sorted `import type` block).
- **Surprise 1 — a Role map already exists:** `src/lib/rbac.ts:180` `ROLE_LABELS: Record<Role, string>`, all 9 members. Its own NOTE (rbac.ts ~line 177) says the approvals copy should be folded into it. Only `settings/roles/+page.svelte` uses it today. Decision: reuse it. Do NOT add a Role map to `labels.ts`.
- **Surprise 2 — the Role sites change visible copy.** The two local maps use short words: `HR_ADMIN→'HR'`, `SUPER_ADMIN→'Admin'`, `PAYROLL_OFFICER→'Payroll'`. `ROLE_LABELS` says `'HR Admin'`, `'Super Admin'`, `'Payroll Officer'`. Those two sites were never raw (the fallback title-cased them); the defect is the duplicate, non-exhaustive map. No test asserts `Stage: HR` (grep of `tests/` for `Stage:` = 0 hits in e2e).
- **Surprise 3 — out of scope:** `src/routes/(app)/+layout.svelte:171` carries a third local `roleLabel` map (`roles.map((r) => roleLabel[r] ?? r)`, line 633). The scan regexes do not flag it and it is not in the 12. Mention only; do not touch.
- `BenefitPlanType` (`prisma/schema.prisma:231`): HMO, INSURANCE, RETIREMENT, ALLOWANCE, LEAVE_CREDIT, OTHER. No map exists.
- Scripts (`package.json`): `check`, `lint`, `format:check`, `test` (= `vitest run`; there is NO `test:unit`), `test:e2e`.
- No e2e spec asserts on the old rendered text. All `'PART_TIME'`, `'DRAFT'`, `'ACTIVE'` hits in `tests/e2e` are DB values or `selectOption` values, not visible text.

## Regex scan — the before count (run 23-09-26, bun script over every `.svelte` in `src/routes` and `src/lib`)

Regexes (these exact literals go into the test):

- `BARE = /(?<!=)\{\s*[A-Za-z_$][\w$]*(?:\.[\w$]+)*\.(?:status|type|employmentType|employmentStatus|role)\s*\}/g`
- `DRESSED = /\.(?:status|type|employmentType|role|stage|category)\s*\.\s*(?:replace|replaceAll|toLowerCase)\s*\(/g`
- `UNDERSCORE = /\.replace(?:All)?\(\s*(?:'_'|"_"|\/_\/g?)\s*,\s*['"] ['"]\s*\)/g`

Hits (exactly these; `src/lib/**/*.svelte` = 0 hits):

| # | Regex | File:line | Match |
|---|---|---|---|
| 1 | BARE | `src/routes/(app)/benefits/+page.svelte:284` | `{en.status}` |
| 2 | BARE | `src/routes/(app)/dashboard/+page.svelte:511` | `{metrics.lastPayrollRun.status}` |
| 3 | BARE | `src/routes/(app)/payslips/+page.svelte:62` | `{payslip.payrollRun.status}` |
| 4 | BARE | `src/routes/(app)/recruitment/[id]/+page.svelte:92` | `{posting.status}` |
| — | BARE | `src/routes/+error.svelte:20` | `{$page.status}` — HTTP code, ALLOWLISTED |
| 5 | DRESSED+UNDERSCORE | `src/routes/(app)/benefits/+page.svelte:160` | `plan.type.replace('_', ' ')` |
| 6 | DRESSED+UNDERSCORE | `src/routes/(app)/employees/+page.svelte:150` | `emp.employmentType.replace('_', ' ')` |
| 7 | DRESSED+UNDERSCORE | `src/routes/(app)/employees/[id]/+page.svelte:395` | `employee.employmentType.replace('_', ' ')` |
| 8 | DRESSED+UNDERSCORE | `src/routes/(app)/employees/[id]/+page.svelte:1084` | `b.plan.type.replace('_', ' ')` |
| 9 | DRESSED+UNDERSCORE | `src/routes/(app)/profile/+page.svelte:75` | `emp.employmentType.replace(/_/g, ' ')` |
| 10 | DRESSED+UNDERSCORE | `src/routes/(app)/profile/+page.svelte:335` | `b.plan.type.replace('_', ' ')` |
| 11 | UNDERSCORE | `src/routes/(app)/requests/approvals/+page.svelte:104` | role fallback `.replace(/_/g, ' ')` |
| 12 | UNDERSCORE | `src/routes/(app)/requests/timesheets/+page.svelte:81` | role fallback `.replace(/_/g, ' ')` |
| 13 | BARE (with `employmentStatus` added) | `src/routes/(app)/settings/org-chart/+page.svelte:71` | `{n.employmentStatus}` |

Raw counts (with `employmentStatus` in BARE): BARE 6 (5 + 1 allowlisted), DRESSED 6, UNDERSCORE 8. **Unique defect lines: 13 in 10 files. After: 0** (plus the 1 allowlisted `+error.svelte` hit, which the test skips).

Exclusions, and how each is handled:
- Prop bindings `status={x.status}` and attrs `value={x.status}`: `(?<!=)` in BARE.
- Comparisons (`x.status === 'APPROVED'`): not inside a bare `{…}`, BARE cannot match. Scan confirmed 0 false hits.
- `+error.svelte` `{$page.status}`: explicit allowlist entry `['src/routes/+error.svelte', '{$page.status}']`. Match by file AND exact text, so a second hit in that file still fails.
- `.toLowerCase()` alone is only flagged when chained directly on an enum-named field (DRESSED). A standalone `r.toLowerCase().replace(/_/g,' ')` fallback is caught by UNDERSCORE. Known limit: an enum aliased into a variable with an unrelated name and rendered bare is not caught — record in Test Infra notes.

## Expected rendered labels (reviewer check)

| Site | Before | After |
|---|---|---|
| benefits:160, employees/[id]:1084, profile:335 (plan type) | `HMO` `INSURANCE` `RETIREMENT` `ALLOWANCE` `LEAVE CREDIT` `OTHER` | `HMO` `Insurance` `Retirement` `Allowance` `Leave credit` `Other` |
| benefits:284 (enrollment) | `ACTIVE` `WAIVED` `TERMINATED` | `Active` `Waived` `Terminated` |
| employees:150, employees/[id]:395, profile:75 (employment type) | `REGULAR` `PART TIME` `CONTRACTUAL` `PROBATIONARY` `ON CALL` `INTERN` | `Regular` `Part time` `Contractual` `Probationary` `On call` `Intern` |
| dashboard:511, payslips:62 (payroll run) | `DRAFT` `COMPUTED` `APPROVED` `VOIDED` | `Draft` `Computed` `Approved` `Voided` |
| org-chart:71 (employment status) | `ON_LEAVE` `OFFBOARDED` | `On leave` `Offboarded` |
| recruitment/[id]:92 (posting) | `DRAFT` `PENDING_APPROVAL` `OPEN` `CLOSED` | `Draft` `Pending approval` `Open` `Closed` |
| approvals, timesheets `Stage:` chip | `HR` `Admin` `Payroll` `Manager` `Verifier` `Approver` `CEO`; `Employee`/`Finance` via fallback | `HR Admin` `Super Admin` `Payroll Officer` `Manager` `Verifier` `Approver` `CEO` `Employee` `Finance`; `Supervisor` unchanged |

Note: `{plan.type.replace('_',' ')}` only replaced the first `_`, so it never matched sentence case.

## Goals / Scope

In: the 13 lines above; `BENEFIT_PLAN_TYPE_LABELS`; `CASES` 25 → 27 (BenefitPlanType + Role); gate widened to all `.svelte` in `src/routes` + `src/lib`; rbac.ts NOTE made true (owner D3=A).
Out (known gaps, backlog notes at UPDATE PROCESS): profile `+page.svelte:253` `{p.source}` (PunchSource, no map); audit-log `{log.action}` (`reports/audit-log/+page.svelte:196`, `:255`); `src/lib/server/services/employees.ts:1350` `.replace(/_/g, ' ')` history text. Mention only: `(app)/+layout.svelte:171` and `$lib/utils/employment.ts` `EMPLOYMENT_TYPE_LABEL` duplicate maps.
Out: `(app)/+layout.svelte` role map; `.ts` files; badge colour logic (branches like `en.status === 'WAIVED'` stay, they compare the enum value, which is correct per labels.ts header).

## Implementation Checklist

Executor rules (all lanes): add NO new comments; carry existing comments verbatim (except the two named edits below);
minimal diff; no formatting or adjacent changes; compare against enum values, never against labels; use
`labelFor(MAP, value)` from `$lib/labels` (or `$lib/rbac` for `ROLE_LABELS`). Run `bunx prettier --write <owned files>` only on files you own.

### L0 — maps + gate (runs FIRST; owner of `src/lib/labels.ts`, `tests/unit/labels.test.ts`)

1. `src/lib/labels.ts`: add `BenefitPlanType` to the sorted `import type` block; add
   `export const BENEFIT_PLAN_TYPE_LABELS: Record<BenefitPlanType, string> = { HMO: 'HMO', INSURANCE: 'Insurance', RETIREMENT: 'Retirement', ALLOWANCE: 'Allowance', LEAVE_CREDIT: 'Leave credit', OTHER: 'Other' }` directly after `BENEFIT_ENROLLMENT_STATUS_LABELS`.
2. `tests/unit/labels.test.ts`: import `BenefitPlanType`, `Role` (runtime objects from `@prisma/client`, same as existing), `BENEFIT_PLAN_TYPE_LABELS`, and `ROLE_LABELS` from `$lib/rbac` (use the same import path style the file already uses for `$lib/labels`). Append two rows to `CASES`: `['BenefitPlanType', BenefitPlanType, BENEFIT_PLAN_TYPE_LABELS]`, `['Role', Role, ROLE_LABELS]`. In the same edit change `expect(CASES).toHaveLength(25)` to `toHaveLength(27)` (VC-5).
3. Gate: `bun run test -- tests/unit/labels.test.ts` green, `bun run check` green. **Commit L0-a**: `feat(labels): add benefit plan type labels and cover Role in the totality test`.
4. `tests/unit/labels.test.ts` Phase 08 S1 block: replace `ENUM_ADOPTION_FILES` + per-file loop with a recursive walk (`readdirSync(dir, { recursive: true })`) of `src/routes` and `src/lib` keeping `.svelte` files; apply BARE, DRESSED, UNDERSCORE (literals above) per file using `String.prototype.match`/`matchAll` ONLY — never `RE.test()` or a shared `exec` loop on these `/g` regexes, `lastIndex` persists across files and skips hits (VC-3); drop a hit only when BOTH its file key and its exact text equal the `ALLOWED` entry, key built as `join('src/routes', rel)` against `join('src/routes', '+error.svelte')` + `'{$page.status}'` (VC-4); one `it` per file, `expect(hits).toEqual([])` where hits are `path:line match` strings. The "walk found > 50 files" check is its OWN `it`, outside the per-file loop, so an empty walk fails (VC-2; today 133). Keep the self-test `it` and extend it: `{s.status}` matches BARE; `status={s.status}` does not; `x.employmentType.replace('_', ' ')` matches DRESSED; `r.toLowerCase().replace(/_/g, ' ')` matches UNDERSCORE; `x.replace('-', ' ')` matches neither.
5. Update the block's docstring: it is now false (says 8 files, points to the backlog note). Rewrite it to state the new scope, the three regexes' purpose, the one allowlist entry, and the measured blind spots (VC-6): `{x?.status}`, `{x.status ?? …}`, `{fn(x.status)}`, `.split('_').join(' ')`, enum fields outside the BARE name list (e.g. `source`, `action`), `.ts` string builders, an enum aliased into an unrelated variable; plus the latent false positive: a script template literal `${x.status}` matches BARE. Keep the "WHAT THESE GATES DO NOT PROVE" framing.
6. **NC-1 (RED before swaps):** run `bun run test -- tests/unit/labels.test.ts`. Must FAIL on exactly 10 files with exactly the 13 lines in the scan table, and `+error.svelte` must be ABSENT from the RED list (proves VC-4) (BARE/DRESSED/UNDERSCORE may double-list a line). Paste the failure summary into the report. If it fails for any other reason (import error, 0 files), it does not count — fix and re-run. Do NOT commit `tests/unit/labels.test.ts` until L6 (VC-8); lanes L1–L5 never touch it. **L1–L5 must not start until NC-1 RED is recorded on the untouched tree** (VC-1) — a lane landing first shrinks the list and voids NC-1.

### L1–L5 — swaps (parallel, only after NC-1 RED is recorded; one owner per file; one commit per lane)

Lane gate = `bun run check` (the labels test stays RED until every lane lands). Each lane stages only its own paths (VC-8).

6a. **L1** `src/routes/(app)/benefits/+page.svelte`: line 160 → `{labelFor(BENEFIT_PLAN_TYPE_LABELS, plan.type)}`; line 284 → `{labelFor(BENEFIT_ENROLLMENT_STATUS_LABELS, en.status)}` (class ternary untouched). Add imports. Commit `fix(benefits): render plan type and enrollment status through labels`.
7. **L2** `src/routes/(app)/employees/+page.svelte:150` → `labelFor(EMPLOYMENT_TYPE_LABELS, emp.employmentType)`; `src/routes/(app)/employees/[id]/+page.svelte:395` → `labelFor(EMPLOYMENT_TYPE_LABELS, employee.employmentType)`, `:1084` → `labelFor(BENEFIT_PLAN_TYPE_LABELS, b.plan.type)`. Commit `fix(employees): render employment and plan type through labels`.
8. **L3** `src/routes/(app)/profile/+page.svelte:75` → `labelFor(EMPLOYMENT_TYPE_LABELS, emp.employmentType)`, `:335` → `labelFor(BENEFIT_PLAN_TYPE_LABELS, b.plan.type)`. Commit `fix(profile): render employment and plan type through labels`.
9. **L4** `dashboard/+page.svelte:511` and `payslips/+page.svelte:62` → `labelFor(PAYROLL_RUN_STATUS_LABELS, …)`; `recruitment/[id]/+page.svelte:92` → `labelFor(JOB_POSTING_STATUS_LABELS, posting.status)`; `settings/org-chart/+page.svelte:71` → `{labelFor(EMPLOYMENT_STATUS_LABELS, n.employmentStatus)}` (the `{#if n.employmentStatus !== 'ACTIVE'}` stays on the raw value). Class conditions stay on the raw value. Commit `fix(ui): render payroll run, posting and employment status through labels`.
10. **L5** `requests/approvals/+page.svelte` and `requests/timesheets/+page.svelte`: delete the local `roleLabels` object and the fallback chain; `roleLabel` becomes `(r: string) => labelFor(ROLE_LABELS, r)` (import `ROLE_LABELS` from `$lib/rbac`, `labelFor` from `$lib/labels`). The comment above the approvals map ("Roles reach the template as raw enum values…") stays verbatim above the new line. `src/lib/rbac.ts` NOTE (~line 177), comment-only (owner D3=A): remove the `and (app)/requests/approvals/+page.svelte:79` part, change `(app)/+layout.svelte:299` to `(app)/+layout.svelte:171`, and make the last sentence singular: "Fold it in next time it is touched." (fix the verb in the same sentence to match). Nothing else. Stage chips take the long `ROLE_LABELS` names (owner D1=A). Commit `refactor(requests): use ROLE_LABELS for approval stage chips`.

### L6 — close-out (orchestrator, after L1–L5)

11. `bun run test -- tests/unit/labels.test.ts` GREEN (0 hits; allowlist hit skipped). Commit L0's gate: `test(labels): scan every svelte file for raw and dressed-up enums`.
12. **NC-2:** edit `employees/+page.svelte:150` back to `{emp.employmentType.replace('_', ' ')}` → gate RED naming that file:line under DRESSED and UNDERSCORE → restore with Edit, never `git checkout` → GREEN. **NC-3:** add `x.replace(/_/g, ' ')` inside any `<script>` of an owned file → RED under UNDERSCORE → remove with Edit → GREEN. Record both RED outputs naming exact `file:line` and regex (VC-9).
13. Full gate set in CI order: `bun run format:check`, `bun run lint`, `bun run check`, `bun run test`.
14. Agent probe (live, only if owner has servers up — do not start them): open `/employees`, `/employees/<id>`, `/profile`, `/benefits`, `/payslips`, `/dashboard`, `/recruitment/<id>`, `/settings/org-chart`, `/requests/approvals`, `/requests/timesheets` and confirm the "After" strings in the label table appear and no SCREAMING_CASE/`_` text remains; check "Stage: Payroll Officer" does not wrap badly next to "View detail".

## Lane table

| Lane | Files owned | Sites | Depends on | Commit |
|---|---|---|---|---|
| L0 | `src/lib/labels.ts`, `tests/unit/labels.test.ts` | map + CASES + gate + NC-1 | — | L0-a now; gate commit in L6 |
| L1 | `(app)/benefits/+page.svelte` | 160, 284 | NC-1 recorded | 1 |
| L2 | `(app)/employees/+page.svelte`, `(app)/employees/[id]/+page.svelte` | 150; 395, 1084 | NC-1 recorded | 1 |
| L3 | `(app)/profile/+page.svelte` | 75, 335 | NC-1 recorded | 1 |
| L4 | `(app)/dashboard/+page.svelte`, `(app)/payslips/+page.svelte`, `(app)/recruitment/[id]/+page.svelte`, `(app)/settings/org-chart/+page.svelte` | 511; 62; 92; 71 | NC-1 recorded | 1 |
| L5 | `(app)/requests/approvals/+page.svelte`, `(app)/requests/timesheets/+page.svelte`, `src/lib/rbac.ts` (NOTE text only) | role maps | NC-1 recorded | 1 |
| L6 | none (runs gates, commits test) | — | L1–L5 | 1 |

Commits: no `Co-Authored-By`, no AI footer, stage exact paths only (never `git add -A`). The orchestrator holds git; lanes return diffs.

## Acceptance Criteria

- AC1: no raw or `_`-dressed enum text renders at the 13 sites — proven by: widened labels gate GREEN + NC-1 RED list; strategy: Fully-Automated.
- AC2: new/used maps are exhaustive — proven by: `CASES` 27 rows green + `bun run check`; strategy: Fully-Automated.
- AC3: the gate can fail — proven by: NC-1, NC-2, NC-3 recorded RED; strategy: Fully-Automated.
- AC4: rendered strings match the label table — proven by: live page probe (step 14); strategy: Agent-Probe.
- AC5: no regressions — proven by: full CI gate set; strategy: Fully-Automated.

## Phase Completion Rules

- A lane is CODE DONE when its diff is committed and `bun run check` passes.
- The plan is VERIFIED only when NC-1, NC-2, NC-3 are recorded, the widened gate is GREEN, the full CI gate set is GREEN, and the AC4 probe is done (or marked pending owner servers).

## Touchpoints

`src/lib/labels.ts`, `src/lib/rbac.ts` (comment only, owner-approved D3), `tests/unit/labels.test.ts`, 12 `.svelte` route files listed in the lane table. Read-only: `prisma/schema.prisma`, `src/routes/+error.svelte`.

## Public Contracts

New export `BENEFIT_PLAN_TYPE_LABELS`. `ROLE_LABELS` gains two importers. No schema, API, or server change.

## Blast Radius

15 files, one package, UI copy only. Risk class: low (display text). Visible copy change on the two role chips (HR → HR Admin etc.).

## Dependencies / Risks

- L1–L3 need L0-a committed first (new map). L4, L5 need nothing new but run in the same wave.
- Risk: the Role chip copy gets longer — may wrap on narrow cards. Probe step 14 checks it. If the owner wants the short words, change `ROLE_LABELS` is NOT the fix (settings uses it); raise it instead.
- Risk: recursive `readdirSync` returns paths with OS separators; build the `ALLOWED` key with `join`.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| NC-1 widened gate RED on 13 lines / 10 files before swaps, `+error.svelte` absent | Fully-Automated | AC1, AC3 |
| widened gate GREEN after L1–L5 | Fully-Automated | AC1 |
| NC-2 re-introduced `.replace('_', ' ')` RED | Fully-Automated | AC3 |
| NC-3 script-level `/_/g` fallback RED | Fully-Automated | AC3 |
| CASES 27 totality tests + `bun run check` | Fully-Automated | AC2 |
| `format:check`, `lint`, `check`, `test` | Fully-Automated | AC5 |
| live page probe of 10 routes | Agent-Probe | AC4 |

## Test Infra Improvement Notes

- The gate is a source scan. Measured blind spots: `{x?.status}`, `{x.status ?? …}`, `{fn(x.status)}`, `.split('_').join(' ')`, enum fields outside the BARE name list (`source`, `action`), `.ts` string builders (`employees.ts:1350`), aliased variables. Latent false positive: script template literal `${x.status}` matches BARE.
- `/g` regexes carry `lastIndex`; the gate must use `match`/`matchAll` only.
- A guard inside a per-file loop cannot fail on an empty walk — keep it a separate `it`.
- `(app)/+layout.svelte:171` role map is not caught by any regex (no `_` fallback). A future gate could flag any local `Record<string, string>` whose keys are Role members.

## Resume and Execution Handoff

1. Selected plan: `process/features/ui-ux-overhaul/active/raw-enum-labels_23-09-26/raw-enum-labels_PLAN_23-09-26.md`
2. Last completed step: PLAN written; no code changed.
3. Validate contract: written (CONDITIONAL → accepted by owner 23-09-26; VC-1..VC-9 absorbed into the checklist).
4. Context loaded: `src/lib/labels.ts`, `src/lib/rbac.ts`, `tests/unit/labels.test.ts`, `prisma/schema.prisma`, backlog note `raw-enum-sweep-remaining-enums_NOTE_03-09-26.md`, memory `a-grep-scan-misses-dressed-up-enums.md`.
5. Next: VALIDATE, then L0 on a branch `git switch -c fix/raw-enum-labels` off updated staging; then L1–L5 in parallel.

## Validate Contract

Status: CONDITIONAL
Date: 23-09-26
date: 2026-09-23
generated-by: outer-pvl

Parallel strategy: parallel-subagents (L1–L5 file-disjoint, orchestrator holds git)
Rationale: 1/7 signals (S7: 14 files); strategy-by-fit overrides the LOW score — five file-owned lanes with no shared file and no mid-run talk. L0 → NC-1 → L1–L5 → L6 is strictly ordered.

Evidence (run 23-09-26 on 1f3ce18, read-only): the plan's three regexes over all 133 `.svelte` files in `src/routes` + `src/lib` give exactly 13 hit lines = the 12 defect lines in 9 files + `src/routes/+error.svelte:20` `{$page.status}`. Raw counts BARE 5, DRESSED 6, UNDERSCORE 8 — all match the plan. Baseline `bun run check` 0 errors / 9 warnings; `bun run test -- tests/unit/labels.test.ts` 64/64 green. Scripts `check`, `lint`, `format:check`, `test` (= `vitest run`) exist; no `test:unit`.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | no raw / `_`-dressed enum text at the 12 sites | Fully-Automated | `bun run test -- tests/unit/labels.test.ts` (widened scan, 0 hits) | B |
| AC2 | BenefitPlanType + Role maps are exhaustive | Fully-Automated | same file, CASES 27 rows + `bun run check` | B |
| AC3 | the gate can fail | Fully-Automated | NC-1 (13 lines / 10 files RED after D2=A), NC-2, NC-3, empty-walk guard, self-test | B |
| AC4 | rendered strings match the label table, chips do not wrap badly | Agent-Probe | step 14 live probe of 9 routes (owner servers only) | C |
| AC5 | no regressions | Fully-Automated | `bun run format:check && bun run lint && bun run check && bun run test` | A |

Failing stub:
test("every .svelte file under src/routes and src/lib interpolates no raw or dressed-up enum", () => { throw new Error("NOT IMPLEMENTED — TDD stub: widened scan") })

Failing stub:
test("BenefitPlanType and Role: every member has a non-blank label and no extra key", () => { throw new Error("NOT IMPLEMENTED — TDD stub: CASES 27") })

Failing stub:
test("the scan still sees a raw, a dressed and an underscore-fallback enum", () => { throw new Error("NOT IMPLEMENTED — TDD stub: self-test") })

Failing stub:
test("full CI gate set green", () => { throw new Error("NOT IMPLEMENTED — TDD stub: CI gate set") })

Legacy line form:
- labels gate: Fully-automated: `bun run test -- tests/unit/labels.test.ts`
- types: Fully-automated: `bun run check`
- CI set: Fully-automated: `bun run format:check`, `bun run lint`, `bun run check`, `bun run test`
- rendered copy: agent-probe: step 14, only if the owner already has servers up
- known-gap: org-chart `{n.employmentStatus}`, profile `{p.source}`, audit-log `{log.action}`, `employees.ts:1350` history text — see Open gaps

Validation conditions (execute-agent MUST follow):
- VC-1 Sequencing: L1–L5 start ONLY after NC-1 is recorded RED on the untouched tree. "After L0-a is committed" is not enough — NC-1 (step 6) runs after the L0-a commit, and a lane that lands first shrinks the 12-line list and voids NC-1.
- VC-2 Empty-walk guard: the "> 50 files" assertion is its own `it`, OUTSIDE the per-file loop. Inside the loop it never runs when the walk is empty, so it could not fail. Today's walk finds 133.
- VC-3 Regex use: use `match`/`matchAll` only. Never `RE.test()` or a shared `exec` loop on these `/g` regexes — `lastIndex` persists across files (verified: `BARE.test` on two raw strings returns `[true, false]`), which silently skips hits.
- VC-4 Allowlist key: build the file key as `join('src/routes', rel)` (or compare relative paths on both sides) and drop a hit only when BOTH file and text equal the entry. Verify by NC-1 output: `+error.svelte` must be absent from the RED list.
- VC-5 CASES length: change `expect(CASES).toHaveLength(25)` to 27 in the same edit (the plan implies it, does not say it).
- VC-6 Docstring known limits: list the measured blind spots, not only the aliased variable: `{x?.status}`, `{x.status ?? …}`, `{fn(x.status)}`, `.split('_').join(' ')`, enum fields outside the BARE name list (e.g. `employmentStatus`, `source`, `action`), and `.ts` builders. Also note the latent false positive: a script template literal `${x.status}` matches BARE.
- VC-7 rbac.ts NOTE: the NOTE's `(app)/+layout.svelte:299` is stale (the map is at line 171) and "Fold them in next time either is touched" stops being grammatical with one file left. Pending owner decision D3.
- VC-8 Lanes: L1–L5 commits stage only their own paths; `tests/unit/labels.test.ts` stays uncommitted until L6. Lane gate is `bun run check`, not the labels test (it stays RED until all lanes land).
- VC-9 NC-2/NC-3: record the RED output naming the exact `file:line` and regex; restore with Edit, never `git checkout`.

Dimension findings:
- Infra fit: PASS — no server, DB, schema or runtime change; scripts verified in package.json; `readdirSync({recursive})` and `import.meta.dirname` fine on CI Node 20.
- Test coverage: CONCERN — gate logic sound and the 12-line before-count reproduces exactly, but VC-1 (NC-1 race), VC-2 (guard placement) and VC-3 (`/g` lastIndex) are ways a check could pass without proving anything; and one live raw enum (org-chart) sits outside the gate.
- Breaking changes: PASS — one new export, `ROLE_LABELS` gains two importers; no test in `tests/` asserts the old strings (0 hits for `Stage:`; `employment-history-masking.test.ts:154` 'PART TIME' asserts a `.ts` service the plan does not touch). Visible copy change on the Stage chip is owner decision D1.
- Security surface: PASS — display text only; Svelte text interpolation escapes; no `{@html}`, no auth/data path touched.
- L0 maps + gate: CONCERN — VC-2, VC-3, VC-4, VC-5, VC-6.
- L1 benefits: PASS — both targets unique; class ternary on raw value stays; types compile today (`.replace` already type-checks on these fields).
- L2 employees: PASS — 150, 395, 1084 unique; 1084 needs L0-a.
- L3 profile: PASS — 75, 335 unique. Note: line 253 `{p.source}` (PunchSource) is a raw enum the plan does not touch — Open gap.
- L4 dashboard/payslips/recruitment: PASS — dashboard site is inside `{#if metrics.lastPayrollRun}`; existing maps only.
- L5 role chips: CONCERN — rbac.ts edit hits the umbrella hard stop ("Any change to src/lib/rbac.ts … ask the owner"), even comment-only (D3); copy change (D1). Chip sits in a `flex justify-between` row beside "View detail" in a 1/2/3-column card grid; "Stage: Payroll Officer" is the longest string — AC4 probe checks wrap.

Owner decisions (answered 23-09-26 — D1=A, D2=A, D3=A):
- D1 Stage chip wording: (A) take `ROLE_LABELS` long names — "HR Admin", "Super Admin", "Payroll Officer" — same words the sidebar and Settings → Roles already show [recommended]; (B) keep the short words, which means a second role map survives and the duplicate this plan removes stays.
- D2 Org chart raw status: `settings/org-chart/+page.svelte:71` renders `{n.employmentStatus}` raw — "ON_LEAVE", "OFFBOARDED". (A) add it here: one `labelFor(EMPLOYMENT_STATUS_LABELS, …)` swap in a new lane file and add `employmentStatus` to BARE's name list (only this one hit today; NC-1 becomes 13 lines / 10 files) [recommended]; (B) leave it and file a backlog note.
- D3 rbac.ts NOTE: (A) OK the comment-only edit, and also fix `:299` → `:171` and "Fold it in next time it is touched" [recommended]; (B) drop the rbac.ts edit; the NOTE stays wrong.

Open gaps:
- org-chart `{n.employmentStatus}` raw — RESOLVED by D2=A (lane L4).
- profile `+page.svelte:253` `{p.source}` renders PunchSource raw (DISCORD / WEB / MANUAL); no map exists. known-gap: backlog note needed.
- audit-log `{log.action}` (`reports/audit-log/+page.svelte:196`, `:255` aria-label) renders AuditAction raw (LOGIN_FAILED, PAYROLL_VOID); the filter dropdown uses the same raw codes, so this reads as a deliberate code vocabulary. known-gap: backlog note.
- `src/lib/server/services/employees.ts:1350` builds history text with `.replace(/_/g, ' ')` ("PART TIME", "ON LEAVE") shown on `/employees/[id]` — `.ts`, out of scope by plan. known-gap: backlog note.
- `(app)/+layout.svelte:171` and `$lib/utils/employment.ts` `EMPLOYMENT_TYPE_LABEL` are duplicate maps (not raw). Mention only.

What this coverage does NOT prove:
- labels gate: that a label reads well, that the element renders, or any render pattern outside the three regexes (VC-6 list); `.ts` string builders; enum fields not in the BARE name list.
- CASES 27: that the maps are USED anywhere; only that they are total.
- `bun run check`: runtime value shape (it trusts PageData types).
- NC-2/NC-3: only that those two patterns red; not every blind spot.
- CI set: no e2e run; no rendered-page check.
- Agent probe: only the routes and rows visible with the owner's data; may be pending if servers are down.

Gate: CONDITIONAL (0 FAILs, 3 CONCERNs; owner decisions D1–D3 open)
Accepted by: owner 23-09-26 — VC-1..VC-9 accepted as execute instructions and absorbed into the checklist; D1=A, D2=A, D3=A.
