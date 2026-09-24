---
name: plan:hris-23-employee-detail-split
description: "#23 — split employees/[id] (+page.svelte 2062 lines, +page.server.ts 983 lines) into one component per card and one action module per card group; pure refactor, same DOM, same 21 actions, one reveal path"
date: 24-09-26
feature: general
---

# #23 — Split the employee detail page into cards and action modules

**Date**: 24-09-26
**Status**: PLANNED
**Complexity**: COMPLEX (one plan, 10 commits, one PR)
**Wave:** 2 — starts only after Wave 1 (#21, #22, #24 part 1) is merged to staging.
**Branch:** `refactor/23-employee-detail-split` (off updated local `staging`)

TL;DR: Move each of 17 cards of `src/routes/(app)/employees/[id]/+page.svelte` into its own
component under `src/lib/components/employees/detail/`. Move the 21 actions into 7 modules (offboard lives in `profile.ts`) under
`src/lib/server/employee-detail/`, spread back into the one `scopedToEmployee({...})` in
`+page.server.ts`. The page keeps the shared state (form, reveal cache, reveal guard, savedNotice,
snippets, offboard + ConfirmDialog). Markup moves byte-for-byte. Proof: a before/after DOM
snapshot per tab (EXECUTE, once the owner has servers up) that must diff empty, plus the six
source tripwire tests retargeted so each one still reds when a slot, guard or needle is removed.

## Phase Table

| Phase | Status | Note |
|---|---|---|
| SPEC | SKIPPED | Issue #23 body + owner decisions in CONTEXT.md + orchestrator brief are the spec |
| INNOVATE | SKIPPED | Owner/orchestrator fixed the approach (components per card, action modules, attendance precedent) |
| Intent-clarify | DONE | "Pure structural split of employees/[id]: per-card components + per-group action modules, same DOM, same 21 actions, one reveal/audit path, tripwires retargeted with negative controls" — auto-proceed |
| PLAN | DONE | this file |
| VALIDATE | pending | |
| EXECUTE | pending | after Wave 1 merge |

## Overview — SPEC criteria (from issue + brief)

- **C1** No behaviour, markup-output or copy change: the rendered DOM of every tab is identical before and after.
- **C2** One component per card under `src/lib/components/employees/`, attendance precedent (`shared.ts` re-exports PageData/ActionData types).
- **C3** Actions grouped into modules by card; `+page.server.ts` still exports `actions = scopedToEmployee({...})`; `Object.keys(actions)` equals the exact 21 names; nothing else becomes a route.
- **C4** Reveal path stays single: one `?/reveal` action, one audit row per reveal, client cache keyed to employee id, its comments carried verbatim.
- **C5** Every source tripwire test is retargeted so it still reds on the defect it guards (negative control each).
- **C6** A size bar (PD-2) holds for every file in the group.
- **C7** Every commit is green on the per-commit G-set (format:check, lint, check, unit test) and revertible alone. e2e is NOT claimed per commit; CI runs e2e on the PR head only (checked in 11.6).
- **C8** Full unit suite green; e2e specs that open the page green.

## Verified source facts (staging d773e1a, re-read 24-09-26)

- `+page.svelte` 2062 lines; `+page.server.ts` 983 lines (`wc -l`).
- Script refs (corrected by VALIDATE, A7): `$props` :30, `LIST_RENDER_CAP` :32, `GOV_ID_ROWS` :39-46, `employee`/`canManage` :47-50, `orgDefaultSchedule` :51-52, reveal block :53-87 (`$effect` :71-79, writes `revealCache` only when `f?.action === 'reveal'`), `legacyEmergencyContact` :89-102, `DOC_CATEGORIES`..`fmtSize` :104-116, `savedRate` :118-120, comp state :122-129, promo state + reset effect :130-142, `todayInput`/`hireInput` :144-147, `grade`/`band` :149-160, #108 comment :162-168, guards :169-186 (`reveal` :169, `offboard` :171), P0-7 comment + `errorFor` :187-193, `STATUTORY_LABELS` :195-199, `uploadDocument` guard :200, onboarding guard + comment :201-202, `DONE` :204-220, `savedNotice` + comment :221-225, offboard confirm :227-235, snippet `truncated` :238-244, snippet `actionError` :246-256 (holds `<div use:scrollToError>`).
- These refs are guides only. EXECUTE ALWAYS moves code BY CONTENT (first/last line text), whether or not step 0.2 finds drift.
- `<main id="main-content">` is the grandparent of `#panel-overview` (`(app)/+layout.svelte:691-692`); it holds only the page root + ConfirmDialog.
- Panels: overview `:281`, compensation `:1057`, documents `:1799`, history `:1920`, actions `:1988`; always rendered, hidden by `hidden=` + `class:hidden`.
- `ConfirmDialog` `:2056-2062` sits OUTSIDE the root `<div class="space-y-6">`.
- No `<style>` block in the page (`grep -n "<style" +page.svelte` → none), so no scoped-CSS hash can change when markup moves.
- Server: imports `:1-62`, `DOC_CATEGORIES` `:64-71` (used only by `uploadDocument` `:923`), `ctxOf` `:73-83`, load `:85-243`, schemas `:245-406`, `scopedToEmployee` `:408-424`, `actions` `:426-983`.
- Action heads (regex `^\t[a-zA-Z]+: async`): setSupervisors 428, update 446, assignTemplate 525, changeCompensation 578, promote 605, reveal 629, offboard 657, addLoan 681 (preceded by `// ponytail:` comment 679-680), addCashAdvance 701, addEarning 721, endEarning 741, addDeduction 761, endDeduction 781, toggleStatutoryExemption 802, toggleEmployerShareExternal 824, setStatutoryAllocation 847, addEmergencyContact 867, deleteEmergencyContact 894, uploadDocument 912, deleteDocument 942, toggleOnboardingStep 962.
- `form?.`/`form.` read directly only in: Evaluation Template `:596-602`, Update Profile `:664-670`, Change Salary `:1568-1578`, Promote `:1672-1680`, and the offboard banner `:2001-2007`.
- `card-scroll` occurs exactly 10 times in `+page.svelte` (lines 317, 906, 946, 1070, 1120, 1189, 1257, 1461, 1817, 1938) — `grep -c card-scroll` style count used by container-bounds G13 (`>= 10`).
- `{#each data.supervisorOptions as opt (opt.id)}` `:564` (Supervisors card); `{#each data.supervisorOptions as s (s.id)}` `:1767` (Promote card).
- `aria-label="{step.done ? 'Uncheck' : 'Check'} {step.label}"` `:342` (Onboarding card).
- Precedent: `src/lib/components/attendance/shared.ts:1` `import type { PageData, ActionData } from '../../../routes/(app)/attendance/$types'`.
- #22 plan PD-4 (`process/general-plans/active/hris-22-offboarded-pay-writes_PLAN_24-09-26.md:56`) makes NO change to `employees/[id]/**`. So the post-Wave-1 files are expected to equal d773e1a. EXECUTE still re-reads (step 0.2).

## Plan Decisions (PD — VALIDATE must check)

- **PD-1 Component folder `src/lib/components/employees/detail/`** (not flat in `employees/`). Why: the retargeted tripwires glob one folder; flat would sweep `EmployeeCard.svelte` / `EmployeeTabs.svelte`, which are not part of this page.
- **PD-2 Size bar: every file in the group ≤ 400 lines (`wc -l`).** Group = `+page.svelte`, `+page.server.ts`, `src/lib/components/employees/detail/*`, `src/lib/server/employee-detail/*`. Why: simple, measurable; largest planned file (UpdateProfileCard ≈ 290) fits with margin; the page shell is estimated ≈ 360. If a file exceeds 400 at EXECUTE, stop and report — do not squeeze or split further without a plan change. Applied to this page only; enforced as a gate command, not a test.
- **PD-3 The card's outer gate `{#if …}` and the HTML comment in front of the card stay in `+page.svelte`; the component holds the card element (`<section>`, `<div>` or `<form>`) and everything inside it.** Why: DOM is identical either way (Svelte strips HTML comments and adds no wrapper node), and keeping the four `{#if canManage && employee.employmentStatus === 'ACTIVE'}` gates in the page keeps the offboard-feedback "banner outside every dying block" test meaningful on one file.
- **PD-4 Danger zone + offboard banner + ConfirmDialog stay in `+page.svelte`** (no DangerZone component). Why: `ConfirmDialog` sits outside the root div (`:2056`); moving it into a card component would move it in the DOM (breaks C1), and splitting the form from the dialog needs a bindable form ref across a component for 35 lines. Destructive-confirms G1/G3 keep reading the page unchanged.
- **PD-5 Shared state stays in `+page.svelte` and crosses by props:** `form` (single source; only the 4 cards that read it get it), `revealCache`/`revealed`/`history` (page owns the `$effect`; cards get `revealed` / `history` read-only), the one `reveal` guard (created once in the page, passed as a prop to Profile, Gov IDs, Disbursement — `busy` is a getter over `$state`, so it stays reactive through a prop), `todayInput`/`hireInput` (computed once in the page with their comment, passed to Change Salary + Promote), `truncated`/`actionError` snippets (page-level, passed as snippet props so the literal `{@render actionError([...])}` text moves into the card unchanged), `DONE` + `savedNotice` (page; the banner is at page top).
- **PD-6 Per-card guards move into their card** (`const addLoan = submitFeedback({ error: null })` etc.). The #108 comment block stays in the page above the `reveal` guard, verbatim. The onboarding guard's own comment (`:194`) moves with it.
- **PD-7 Action modules (7) live in `src/lib/server/employee-detail/`** (server-only by SvelteKit's `$lib/server` rule; not under `src/routes/`, so no file can become a route). Typed with the route's `Actions` via relative `$types` import (attendance precedent).
- **PD-8 One new assertion in error-slots: no action name appears twice across the scanned server files.** Why: a half-done move (action copied into a module, not deleted from the route) keeps `Object.keys(actions)` at 21 (the spread wins) and would hide as dead code.
- **PD-9 Single sequential EXECUTE lane**, orchestrator holds git. Why: every commit edits both shared route files; parallel lanes would serialize on them anyway.
- **PD-10 success-surfaces `Row.page` becomes `string | string[]`** (files concatenated before the needle check). The non-vacuity loop (`success-surfaces.test.ts:376-383`) is changed to loop over each file of an array (a string counts as a one-item array) and require EACH file `read(file).length > 1000` (A3).
- **PD-11 (A1) `offboard` goes into `profile.ts`**, not its own module. Why: a standalone module is ~976 chars and fails success-surfaces' `> 1000` non-vacuity check.
- **PD-12 (A4) Orphan-card check** in `employee-detail-error-slots.test.ts`: for every `.svelte` in `lib/components/employees/detail/`, `+page.svelte` must contain `import <Name> from '$lib/components/employees/detail/<Name>.svelte'` AND `<<Name> ` (the tag). Why: folder globs cannot see a card file whose tag was removed from the page. Why: the DONE-map rows' needles now span the page (`savedNotice` banner, DONE entry) and the card (`action="?/setSupervisors"`); checking absent-needles across both keeps the "second surface" power.

## Target layout

### Components — `src/lib/components/employees/detail/`

| File | Owns (source range at d773e1a, card element only) | Props | Local (moved from page script) |
|---|---|---|---|
| `shared.ts` | types + constant | — | `export type EmployeeDetailData = PageData`, `export type EmployeeDetailForm = ActionData`, `export type Revealed = NonNullable<ActionData>['revealed'] \| null`, `export type History = PageData['history']`, `export type FeedbackGuard = ReturnType<typeof submitFeedback>`, `export const LIST_RENDER_CAP = 25`; types imported with `import type { PageData, ActionData } from '../../../../routes/(app)/employees/[id]/$types'` (verbatimModuleSyntax is on — every type-only import MUST be `import type`) |
| `OnboardingCard.svelte` | `<section>` `:292-380` | `data`, `actionError` | `toggleOnboardingStep` guard + its comment `:194` |
| `ProfileCard.svelte` | `<div>` `:384-441` | `data`, `revealed`, `reveal` | `employee`, `canManage`, `savedRate` (+ comment `:120-121`), `grade`, `band` (+ comment `:147-148` and inner comment) |
| `GovIdsCard.svelte` | first `<div>` in `{#if canManage}` `:445-480` | `data`, `revealed`, `reveal` | `employee`, `GOV_ID_ROWS` (+ comment `:39-40`) |
| `DisbursementCard.svelte` | second `<div>` `:483-521` | `data`, `revealed`, `reveal` | `employee` |
| `SupervisorsCard.svelte` | `<div>` `:525-589` | `data`, `actionError` | `employee`, `setSupervisors` guard |
| `EvalTemplateCard.svelte` | `<div>` `:594-631` | `data`, `form` | `assignTemplate` guard |
| `UpdateProfileCard.svelte` | `<form id="update-profile">` `:636-892` | `data`, `form`, `revealed` | `employee`, `orgDefaultSchedule` (+ comment), `update` guard |
| `LeaveBalancesCard.svelte` | `<section>` `:897-935` | `data` | `employee` |
| `EmergencyContactsCard.svelte` | `<section>` `:938-1052` | `data`, `actionError` | `employee`, `canManage`, `legacyEmergencyContact` (+ comment `:89-92`), `deleteEmergencyContact`, `addEmergencyContact` guards |
| `BenefitsCard.svelte` | `<section>` `:1067-1105` | `data` | — |
| `LoansCard.svelte` | `<section>` `:1108-1245` | `data`, `actionError`, `truncated` | `addLoan`, `addCashAdvance` guards; imports `LIST_RENDER_CAP` from `./shared` |
| `AllowancesCard.svelte` | `<section>` `:1249-1332` | `data`, `actionError` | `endEarning`, `addEarning` guards |
| `DeductionsCard.svelte` | `<section>` `:1336-1544` | `data`, `actionError` | `STATUTORY_LABELS`, `endDeduction`, `addDeduction`, `toggleStatutory`, `toggleErExternal`, `setAllocation` guards |
| `ChangeSalaryCard.svelte` | `<form id="change-salary">` `:1550-1644` | `data`, `form`, `revealed`, `todayInput`, `hireInput` | `employee`, `compRateType` (+ its `svelte-ignore` and comment `:123-126`), `compRate`, `compRateOptions`, `changeCompensation` guard; imports `scrollToError` from `$lib/actions/scrollToError` itself (used at `:1574`) |
| `PromoteCard.svelte` | `<form id="promote">` `:1651-1793` | `data`, `form`, `revealed`, `todayInput`, `hireInput` | `employee`, `promoType`, `promoRateType` (+ both `svelte-ignore` lines and comment `:130-133`), `promoRateOptions`, `promoRate`, the reset `$effect`, `promote` guard |
| `DocumentsCard.svelte` | `<section>` `:1808-1914` | `data`, `actionError` | `employee`, `DOC_CATEGORIES`, `catLabel`, `fmtSize`, `uploadDocument` guard |
| `EmploymentHistoryCard.svelte` | `<section>` `:1929-1982` | `history`, `truncated` | imports `LIST_RENDER_CAP` from `./shared` |

Rules for every component:
- Markup moves byte-for-byte (only re-indented; prettier decides indentation). No class, text, attribute or order change.
- Every type-only import (`$types`, `Snippet`, shared types) uses `import type` (`.svelte-kit/tsconfig.json:18` `verbatimModuleSyntax: true`).
- Props: `let { data, … }: { data: EmployeeDetailData; form: EmployeeDetailForm; revealed: Revealed; history: History; reveal: FeedbackGuard; todayInput: string; hireInput: string; actionError: Snippet<[string[]]>; truncated: Snippet<[number]> } = $props()` — each component declares only the props in its row. `Snippet` from `'svelte'`.
- Local `employee` / `canManage` are `const employee = $derived(data.employee)` / `const canManage = $derived(data.canManage)`, declared only where the moved markup uses them.
- Imports: exactly what the moved markup and script use (svelte-check + eslint `no-unused-vars` decide; the table is the expected set, the gates are the authority).
- No new comments. Existing comments that belong to moved code move with it verbatim. Comments that describe page-wide things stay in the page.

### Page after split — `src/routes/(app)/employees/[id]/+page.svelte`

Keeps: imports still used; `$props`; `activeTab` (+comment); `employee`, `canManage` (+comment `:45-46`); the whole reveal-cache block `:48-84` verbatim; `todayInput`/`hireInput` (+comment `:141-142`); the #108 comment + `const reveal = …` + `const offboard = …`; `errorFor` (+P0-7 comment); `DONE`, `savedNotice` (+comment); offboard confirm state; both snippets (`truncated` now uses imported `LIST_RENDER_CAP`); `<svelte:head>`; PageHeader; savedNotice banner; `EmployeeTabs`; all five panel wrappers and grids; every card-level HTML comment and outer `{#if}` gate (PD-3); the component tags in the same order; the actions panel (banner + danger zone) and `ConfirmDialog` unchanged.

Removed from the page: `const LIST_RENDER_CAP = 25` (now imported), and every declaration listed in the "Local" column above.

Component tag shapes (exact):
- `<OnboardingCard {data} {actionError} />`
- `<ProfileCard {data} {revealed} {reveal} />`, `<GovIdsCard {data} {revealed} {reveal} />`, `<DisbursementCard {data} {revealed} {reveal} />` (both inside the existing `{#if canManage}`, the Disbursement HTML comment between them)
- `<SupervisorsCard {data} {actionError} />`, `<EvalTemplateCard {data} {form} />`, `<UpdateProfileCard {data} {form} {revealed} />`, `<LeaveBalancesCard {data} />`, `<EmergencyContactsCard {data} {actionError} />`
- `<BenefitsCard {data} />`, `<LoansCard {data} {actionError} {truncated} />`, `<AllowancesCard {data} {actionError} />`, `<DeductionsCard {data} {actionError} />`, `<ChangeSalaryCard {data} {form} {revealed} {todayInput} {hireInput} />`, `<PromoteCard {data} {form} {revealed} {todayInput} {hireInput} />`
- `<DocumentsCard {data} {actionError} />`, `<EmploymentHistoryCard {history} {truncated} />`

### Action modules — `src/lib/server/employee-detail/`

Each module: `import type { Actions } from '../../../routes/(app)/employees/[id]/$types'` and `export const <name>: Actions = {` with each action at ONE tab indent (`\tname: async (`) so the tripwire regexes keep matching. Action bodies, their leading comments and their schemas move verbatim.

| File | Export | Actions (source lines) | Also moves |
|---|---|---|---|
| `shared.ts` | `ctxOf` | — | `ctxOf` `:73-83` with its #247 comment |
| `assignments.ts` | `assignmentActions` | setSupervisors 428-445, assignTemplate 525-577 | — |
| `profile.ts` | `profileActions` | update 446-524, reveal 629-656, offboard 657-678 (A1) | `updateSchema` `:277-342` |
| `compensation.ts` | `compensationActions` | changeCompensation 578-604, promote 605-628 | `changeCompensationSchema` `:344-364`, `promoteSchema` `:366-397` (with comments) |
| `pay-items.ts` | `payItemActions` | `// ponytail:` 679-680 + addLoan … setStatutoryAllocation 681-866 | the 7 schemas `:245-275` |
| `emergency-contacts.ts` | `emergencyContactActions` | addEmergencyContact 867-893, deleteEmergencyContact 894-911 | `emergencyContactSchema` `:399-406` |
| `documents.ts` | `documentActions` | uploadDocument 912-941, deleteDocument 942-961 | `DOC_CATEGORIES` `:64-71` |
| `onboarding.ts` | `onboardingActions` | toggleOnboardingStep 962-982 | — |

`+page.server.ts` after split: imports used by `load` + `scopedToEmployee` + the 7 action modules; onboarding comment `:85-88`; `load` verbatim; `scopedToEmployee` verbatim; then

```
export const actions: Actions = scopedToEmployee({
	...assignmentActions,
	...profileActions,
	...compensationActions,
	...payItemActions,
	...emergencyContactActions,
	...documentActions,
	...onboardingActions
})
```

(The block above is the plan's target shape for the assembly line, not example code.) SvelteKit reads `actions` only from `+page.server.ts`; the modules are plain server modules. No new file under `src/routes/`.

## Implementation Checklist

Every step: markup/code moves verbatim; then run the per-commit gate set (G-set below); commit only when green. EXECUTE never starts servers.

**Commit rule (E6 + owner):** commit only when the G-set is green — never a red or test-only failing commit. Commit messages: subject + optional body; NO `Co-Authored-By` line and no AI trailer or footer of any kind. Stage exact paths only (never `git add -A`). After EVERY commit run the 11.1 `wc -l` size check (A7/E1): any group file over 400 lines → stop and report.

**G-set (CI order, `package.json` + `.github/workflows/ci.yml:38-47`):** `bun run format:check` → `bun run lint` → `bun run check` → `bun run test`. Plus `bun run test -- tests/unit/employee-detail-error-slots.test.ts tests/unit/employee-offboard-feedback.test.ts tests/unit/success-surfaces.test.ts tests/unit/container-bounds-scan.test.ts tests/unit/a11y-invariants.test.ts tests/unit/destructive-confirms.test.ts tests/unit/copy-invariants.test.ts tests/unit/employee-detail-action-tags.test.ts` reported separately.

### Step 0 — Preflight (no commit)

0.1 `git switch staging && git pull` then `git switch -c refactor/23-employee-detail-split`. Confirm Wave 1 PRs (#21, #22, #24 part 1) are merged: `gh pr list --state merged --base staging --limit 10`.
0.2 Re-read both route files. `git diff d773e1a..HEAD -- 'src/routes/(app)/employees/[id]'` and record it. Whatever it shows, move every declaration, card and action BY CONTENT (first/last line text), using the line refs in this plan only as guides (A7). `wc -l` both files.
0.3 Re-run `grep -nE '^\t[a-zA-Z]+: async' '+page.server.ts'` → expect exactly the 21 names above. Different set → STOP, report.
0.4 Baseline: G-set on the untouched branch; record test counts. A red baseline → STOP, report.
0.5 DOM "before" snapshots (needs owner-started dev server on :5173 and DB; ask the owner if not up; do NOT start them). Write a scratch script (scratchpad, not committed) `dom-snap.mjs <out-dir>` using `@playwright/test`'s `chromium`:
  - Session: `POST http://localhost:5173/api/v1/_dev/login-as` with `{ "email": "hr@veent.ph" }` from the page context, then navigate.
  - Snapshot function (A5): serialize `document.getElementById('main-content').innerHTML` (holds the page root AND the ConfirmDialog), with all comment nodes removed via a TreeWalker before serializing. Append a second section to the same file: one line per `input, select, textarea` inside `#main-content`, in document order, formatted `id|name|type|value|checked` from the live DOM PROPERTIES (`el.value`, `el.checked`), so a broken `bind:value` or a reveal value that never reaches Update Profile / Change Salary / Promote shows up. Write one file per scenario/tab.
  - Determinism control (A5): take the full "before" set TWICE (`before-a/`, `before-b/`); `diff -r before-a before-b` must be empty, else find and remove the unstable source first. Sensitivity control: `diff before-a/S1-overview before-a/S3-overview` must NOT be empty (proves the snapshot can see a change). All before and after runs happen on the SAME calendar day (DatePicker default and tenure text are date-dependent).
  - Scenarios: S1 HR on an ACTIVE employee with onboarding + loans + documents + history (pick from `/employees`, record id): load `?tab=overview`, then click each tab button (Overview, Compensation & Payroll, Documents, History, Actions) and snapshot after each click → 5 files. S2 same employee: click "Reveal" once (Profile card), wait for the revealed salary, snapshot all 5 tabs by clicking tabs (no reload — a reload drops the cache). S3 HR on an OFFBOARDED employee, 5 tabs. S4 `manager@veent.ph` on a direct report, 5 tabs. S5 error slot: on S1 employee, Emergency Contacts add with phone `abc` (server `isValidPhone` refuses; nothing written — confirm the input has no client pattern first; if the browser blocks it, pick another server-only refusal and record which), snapshot overview.
  - Reveal audit count: before and after S2's single click, count VIEW audit rows for the employee with `docker exec -i veent-db-5434 psql -p 5434 -U veent -d veent_hris -c "<count query on the audit log table for entity = employee id>"` (EXECUTE reads the audit table/column names from `prisma/schema.prisma` and `services/employees.ts:331-343`). Record: exactly +1.
  - Keep #27 edits out of the served tree between the before and after runs (use a separate worktree for #23, or snapshot when `git status` shows only #23 files changed). A diff caused by `src/lib/components/ui/*` is not a #23 defect but makes the gate unreadable — isolate instead.

### Commit 1 — `test(employees): let the 201 page tripwires read its split files`

1.1 Create `src/lib/components/employees/detail/shared.ts` (types + `LIST_RENDER_CAP`, see table). Page: delete `const LIST_RENDER_CAP = 25`, add `import { LIST_RENDER_CAP } from '$lib/components/employees/detail/shared'`.
1.2 Create `src/lib/server/employee-detail/shared.ts` exporting `ctxOf` (moved verbatim with comment). `+page.server.ts`: delete `ctxOf`, import it from `$lib/server/employee-detail/shared`.
1.3 `tests/unit/employee-detail-error-slots.test.ts`:
  - `server` becomes a list: `+page.server.ts` plus every `.ts` in `src/lib/server/employee-detail/` (`readdirSync` + filter `.ts`, sorted). `template` becomes a list: `+page.svelte` plus every `.svelte` in `src/lib/components/employees/detail/`.
  - `actionNames` = flatMap of the same regex over each server file. `canFail(name)` finds the ONE server file containing `\t${name}: async` and slices inside that file only (same slice logic).
  - `slotted` = the same two regexes over each template file. Test 3 counts `{#if form?.error}` across all template files.
  - PD-8: in test 1 add `expect(new Set(actionNames).size).toBe(actionNames.length)`.
  - PD-12 (A4): add test `every detail card is imported and rendered by the page`: for each `.svelte` file in the component folder, assert `+page.svelte` contains `import <Name> from '$lib/components/employees/detail/<Name>.svelte'` and `<<Name> `. In commit 1 the folder has no `.svelte` yet, so the loop is empty until commit 2. Its control runs in commit 3 (below).
  - Header comment: leave as is (no new comments).
1.4 `tests/unit/employee-offboard-feedback.test.ts`:
  - Add `templates` = `+page.svelte` + every `.svelte` in the component folder, joined with `'\n'`. Test 1 (`>= 20` bindings) and test 2 (`silenced` equals `['offboard']`) read `templates`. Tests 3 and 4 keep reading `+page.svelte` (banner and the ACTIVE gates stay there — PD-3/PD-4). Test 5 keeps reading `+page.server.ts` for now (moves in commit 10).
1.5 `tests/unit/container-bounds-scan.test.ts` G13 row `['routes/(app)/employees/[id]/+page.svelte', 10]`: the `it.each` stays; for that one file the count is taken over `+page.svelte` + every `.svelte` in `lib/components/employees/detail/` (implement as a small branch in the `it.each` body keyed on that path, or a separate `it` with the same `>= 10` assertion and remove the row — EXECUTE picks the separate `it`, named `employees/[id] and its cards have card-scroll at least 10 times`).
1.6 Gate: G-set green. Behaviour: no markup moved yet, so every tripwire still sees everything.

### Commits 2-10 — one card group per commit (server module + components + that group's test retargets)

For each: create component(s) and module; replace the card element in the page with the component tag; move the declarations; remove now-unused page/server imports; retarget the named test rows; run G-set; run that commit's negative control(s) (below), restore, re-run the tripwire file green; commit.

2. `refactor(employees): move the read-only cards out of the 201 page` — LeaveBalancesCard, BenefitsCard, EmploymentHistoryCard. No server change. Test (A2): container-bounds G13 "the 201 file render-caps its long lists" → assert `lib/components/employees/detail/EmploymentHistoryCard.svelte` contains `history.slice(0, LIST_RENDER_CAP)` (Loans needles added in commit 7). Control: change that slice to `history.slice(0, 25)` → red on the missing needle (the import line no longer satisfies the check).
3. `refactor(employees): move supervisors and template assignment` — SupervisorsCard, EvalTemplateCard + `assignments.ts`. Tests: container-bounds PICKERS row 2 → `lib/components/employees/detail/SupervisorsCard.svelte`; success-surfaces setSupervisors row → `page: ['routes/(app)/employees/[id]/+page.svelte', 'lib/components/employees/detail/SupervisorsCard.svelte']`, `server: 'lib/server/employee-detail/assignments.ts'` (PD-10 type change lands here). Controls: remove `{@render actionError(['setSupervisors'])}` from SupervisorsCard → error-slots test 2 red naming `setSupervisors`; delete the `<SupervisorsCard` tag from `+page.svelte` (keep the file) → PD-12 orphan test red (and svelte-check/lint may also flag the unused import — the orphan test must be red on its own message); add `saved: 'x'` to setSupervisors' success return in `assignments.ts` → success-surfaces red.
4. `refactor(employees): move the onboarding checklist` — OnboardingCard + `onboarding.ts`. Test: a11y "onboarding manual-step control" reads `lib/components/employees/detail/OnboardingCard.svelte`. Control: change `h-6` target back to `mt-0.5 flex h-4 w-4 flex-none` → red.
5. `refactor(employees): move the profile, ID and disbursement cards and the reveal action` — ProfileCard, GovIdsCard, DisbursementCard, UpdateProfileCard + `profile.ts` (update, reveal). Page keeps the reveal cache + `reveal` guard (PD-5). Controls: add `{#if form?.error}<p>{form.error}</p>{/if}` inside UpdateProfileCard → error-slots test 3 red; remove the `form?.action === 'update'` branches from UpdateProfileCard → test 2 red naming `update`. Reveal check (A6): `grep -rln revealEmployeeSensitive src` → exactly 5 files: `src/lib/server/employee-detail/profile.ts`, `src/lib/server/services/employees.ts`, and three comment-only hits `src/lib/server/services/action-proposals.ts` (:174), `src/lib/utils/format.ts` (:49), `src/routes/(app)/reports/audit-log/+page.server.ts` (:125). Real assertions: `grep -c revealEmployeeSensitive 'src/routes/(app)/employees/[id]/+page.server.ts'` → 0, and `grep -rn revealEmployeeSensitive src/lib/components` → none; `grep -rn "action=\"?/reveal\"" src/lib/components/employees/detail` → exactly 3 (Profile, GovIds, Disbursement); `grep -n "revealCache" src/lib/components` → none.
6. `refactor(employees): move emergency contacts` — EmergencyContactsCard + `emergency-contacts.ts`. Control: remove its `actionError` render → error-slots red naming both actions.
7. `refactor(employees): move loans, allowances and deductions` — LoansCard, AllowancesCard, DeductionsCard + `pay-items.ts`. Tests (A2): container-bounds render-cap test also asserts `LoansCard.svelte` contains both `data.loans.slice(0, LIST_RENDER_CAP)` and `data.cashAdvances.slice(0, LIST_RENDER_CAP)`; success-surfaces addLoan row → page array with `LoansCard.svelte`, server `lib/server/employee-detail/pay-items.ts`. Controls: change `const addLoan = submitFeedback({ error: null })` to `{ error: null, success: null }` → offboard-feedback test 2 red; remove one `card-scroll` from DeductionsCard → container-bounds G13 red (count 9).
8. `refactor(employees): move salary change and promotion` — ChangeSalaryCard, PromoteCard + `compensation.ts`. Test: container-bounds PICKERS row 3 → `PromoteCard.svelte`. Control: change `(s.id)` key → red.
9. `refactor(employees): move documents` — DocumentsCard + `documents.ts`. Test: success-surfaces uploadDocument row → page array with `DocumentsCard.svelte`, server `documents.ts`. Controls: add `{#if form?.action === 'uploadDocument' && form?.success}` text to DocumentsCard → red (absent needle); remove its `actionError` render → error-slots red.
10. `refactor(employees): move the offboard action into the profile module` — `offboard` moves into `profile.ts` (A1; markup stays, PD-4). Tests: success-surfaces offboard row `server: 'lib/server/employee-detail/profile.ts'`; offboard-feedback test 5 reads `profile.ts`. Control: change `'Employee offboarded.'` in `profile.ts` → both red.

After commit 10, `+page.server.ts` holds only `load`, `scopedToEmployee` and the spread assembly.

### Step 11 — Final proof (no commit unless a fix is needed)

11.1 Size bar: `wc -l 'src/routes/(app)/employees/[id]/+page.svelte' 'src/routes/(app)/employees/[id]/+page.server.ts' src/lib/components/employees/detail/* src/lib/server/employee-detail/*` → every line ≤ 400 (PD-2).
11.2 `bun run test -- tests/unit/employee-detail-action-tags.test.ts` → 21 keys; `grep -c "^\t\.\.\." '+page.server.ts'` → 7.
11.3 No new comments: `git diff staging...HEAD -U0 -- src | grep -E '^\+\s*(//|<!--|/\*|\*)'` → every hit is a comment that also appears as a `-` line (moved), checked by eye, or a `// ponytail:` line that moved.
11.4 Nothing new under routes: `git diff --name-status staging...HEAD -- src/routes` → only `M` on the two route files.
11.5 DOM "after" snapshots (same day as 0.5): rerun `dom-snap.mjs` on the same employees and scenarios; `diff -r before-a/ after/` → empty, including the form-control state section. Reveal audit count again +1 for one click.
11.6 E2E (orchestrator holds the e2e port; DB must be up; owner starts it): `bun run test:e2e -- tests/e2e/employee-tabs.spec.ts tests/e2e/pii.spec.ts tests/e2e/onboarding-checklist.spec.ts tests/e2e/back-navigation.spec.ts tests/e2e/leave-balances.spec.ts tests/e2e/page-header-helptip.spec.ts tests/e2e/admin.spec.ts tests/e2e/employees-new-disclosure.spec.ts tests/e2e/dashboard-layout.spec.ts tests/e2e/employees-new-layout.spec.ts`. Compare with the same run on staging if anything is red (baseline rule).
11.7 Open the PR to staging only on the owner's word (push only when told). PR body: summary, the per-commit list, DOM-diff result, size table, reassess note below. No AI attribution.

## Reassess other pages (issue step 3 — note only, no code)

Against PD-2 (400 lines), at d773e1a these files are over the bar: `dashboard/+page.svelte` 984, `payroll/statutory-rates/+page.svelte` 701, `employees/new/+page.svelte` 692, `payroll/[id]/+page.svelte` 544, `performance/templates/[id]/+page.svelte` 502, `recruitment/applicant/…/+page.svelte` 498, `inventory/+page.svelte` 490, `requests/approvals/+page.svelte` 439, `settings/roles/+page.svelte` 437; servers `attendance/+page.server.ts` 615, `timesheets/+page.server.ts` 431 (research-23 §8; re-measure before acting). Recommendation for the owner: one follow-up issue listing them; `employees/new` should wait for #24 part 2, `dashboard` is the next biggest win. Not in this PR.

## Acceptance Criteria

- AC1 (C1) `diff -r before/ after/` empty for S1-S5 (25+ snapshot files).
- AC2 (C2) 17 `.svelte` + `shared.ts` in `src/lib/components/employees/detail/`, one per card per the table.
- AC3 (C3) action-tags test green (21 keys); 7 spreads; no new route files.
- AC4 (C4) one `?/reveal` action (`profile.ts`), 3 reveal forms, cache only in the page, one audit row per click (psql +1).
- AC5 (C5) each retargeted test green, and each listed negative control observed red for the stated reason.
- AC6 (C6) every group file ≤ 400 lines.
- AC7 (C7) G-set + `wc -l` bar green at every commit (record per commit); e2e only at 11.6.
- AC8 (C8) full `bun run test` count equal to baseline + 0 new failing; e2e list green (or same as staging baseline).

## Phase Completion Rules

CODE DONE when commit 10 is green. VERIFIED only after AC1 (DOM diff) and AC8 e2e are recorded. If the owner cannot bring servers up, status stays CODE DONE and the PR says so.

## Touchpoints

- Edit: `src/routes/(app)/employees/[id]/+page.svelte`, `src/routes/(app)/employees/[id]/+page.server.ts`.
- Create: `src/lib/components/employees/detail/{shared.ts, OnboardingCard, ProfileCard, GovIdsCard, DisbursementCard, SupervisorsCard, EvalTemplateCard, UpdateProfileCard, LeaveBalancesCard, EmergencyContactsCard, BenefitsCard, LoansCard, AllowancesCard, DeductionsCard, ChangeSalaryCard, PromoteCard, DocumentsCard, EmploymentHistoryCard}.svelte`; `src/lib/server/employee-detail/{shared, assignments, profile, compensation, pay-items, emergency-contacts, documents, onboarding}.ts`.
- Edit tests: `tests/unit/employee-detail-error-slots.test.ts`, `employee-offboard-feedback.test.ts`, `container-bounds-scan.test.ts`, `a11y-invariants.test.ts`, `success-surfaces.test.ts`.
- Read-only, expected unchanged and green: `destructive-confirms.test.ts` (WIRING + COPY rows read the page, where offboard + ConfirmDialog stay; control: delete the `ConfirmDialog` import in the page → red), `copy-invariants.test.ts` (only comments mention employees/[id]; `<title>` stays in the page; control: drop `— Veent HRIS` from the page title → red), `employee-detail-action-tags`, `employee-reveal-access`, `performance-template-assignment`, `pay-write-role-context`, `phone-entry-points` (import `actions`/`load` from `+page.server`; their `vi.mock` targets are module ids, so they still apply inside the modules).
- MUST NOT touch (#27 lane and others): `src/app.css`, `tailwind.config.ts`, `src/lib/components/ui/**`, toast/flash files (`Toaster.svelte`, `toast.svelte.ts`, flash helpers), `src/lib/utils/submit-feedback.svelte.ts`, `src/lib/components/employees/EmployeeTabs.svelte`, `employee-tabs.ts`, any `services/**`, `prisma/**`, `.env*`.

## Public Contracts

- Form action names and payloads: unchanged (21 names, same returns).
- `?/reveal`: unchanged — same action, same `revealEmployeeSensitive` call, one audit row.
- URLs, `?tab=`, element ids (`update-profile`, `change-salary`, `promote`, `panel-*`), copy: unchanged.
- New internal module surface only (`$lib/components/employees/detail/*`, `$lib/server/employee-detail/*`); nothing outside this page imports them.

## Blast Radius

2 edited source files, 26 new source files, 5 edited test files. One route. Risk class: touches the salary/ID reveal path (secrets/trust-boundary: masked PII) — code moves only, no logic change. Rollback: revert any single commit (each group is self-contained); whole PR revert restores the two files.

## Security note (reveal path)

STRIDE quick scan: Information disclosure is the only live threat — a moved component could hold its own reveal state or read from a non-reveal payload. Mitigation: cache and `$effect` stay in the page (commit 5 greps), components get `revealed` read-only, per-employee key unchanged, server `reveal` body moves verbatim with the `isSelf` check. Server-only modules sit under `$lib/server` so the client bundle cannot import them.

## Data Flow

Load (`+page.server.ts`) → `data` → page → props → cards. Submit in a card → `?/name` → `scopedToEmployee` wrapper (object check) → module handler → `form` → page → `errorFor`/`actionError` snippet (passed to the card) and `savedNotice` banner (page). Reveal: card form → `profile.ts` reveal → one audit row → `form.revealed` → page `$effect` → `revealCache` (keyed id) → `revealed`/`history` props.

## Risk Predictions

| Risk | Likelihood | Mitigation |
|---|---|---|
| A card loses a prop and renders empty | Med | `bun run check` (undefined identifier) + DOM diff |
| A moved card drops its error slot | Med | error-slots retargeted from commit 1; controls per commit |
| Reveal cache duplicated in a card | Low | commit 5 greps; PD-5 |
| Tripwire scans nothing after retarget | Med | tests are self-protecting (moved actions become unslotted / counts drop below floor) + PD-8 + controls |
| DOM diff noise from #27 edits or DB changes | Med | isolate worktree; snapshot same employees with no concurrent writes; investigate any diff line |
| Page shell > 400 lines | Low | PD-2 stop rule |
| `$types` relative import path wrong | Low | `bun run check` |

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| G-set (format, lint, check, test) + `wc -l` at every commit | Fully-Automated | C7, C6 |
| PD-12 orphan-card test + control (commit 3) | Fully-Automated | C2, C5 |
| DOM determinism (before twice) + sensitivity (S1≠S3) controls | Hybrid | C1 |
| error-slots retargeted + PD-8 + controls (commits 3,5,6,9) | Fully-Automated | C5, C1 (error surfaces kept) |
| offboard-feedback retargeted (test 5 → profile.ts) + controls (commits 7,10) | Fully-Automated | C5 |
| success-surfaces rows retargeted + controls (3,9,10) | Fully-Automated | C5 |
| container-bounds G10/G13/PICKERS retargeted + controls (2,7,8) | Fully-Automated | C5 |
| a11y onboarding control retargeted + control (4) | Fully-Automated | C5 |
| destructive-confirms, copy-invariants unchanged + control | Fully-Automated | C5 |
| action-tags exact 21 keys; 7 spreads grep; route name-status | Fully-Automated | C3 |
| reveal greps (commit 5) | Fully-Automated | C4 |
| `wc -l` size bar (11.1) | Fully-Automated | C6 |
| DOM before/after snapshot diff S1-S5 (0.5 / 11.5) | Hybrid (needs owner's dev server + DB) | C1 |
| psql VIEW audit count +1 per reveal (0.5 / 11.5) | Hybrid | C4 |
| e2e list (11.6, PR head only) | Hybrid (DB up, e2e port) | C8 |
| Human glance at each tab in both themes (localStorage `theme`) | Agent-Probe | C1 (sanity beside the diff) |

Known gaps: none assigned to developed behaviour.

## Test Infra Improvement Notes

- The DOM snapshot script is a scratch tool; if it proves useful, a follow-up could keep it as a reusable refactor-proof helper (not in this PR).
- (none else identified yet)

## Validate Contract

Status: CONDITIONAL
Date: 24-09-26
date: 2026-09-24
generated-by: outer-pvl
supersedes: 2026-09-24 (outer-pvl) — pass 2 after one plan-fix loop (A1-A7 + E6 applied to the body); outer PVL has current evidence
Pass: 2

Parallel strategy: sequential
Rationale: 3/7 signals (S6 reveal path = secrets/trust boundary; S7 28 files; S1 no). One route, every commit edits the same two route files, so one lane (PD-9). Validation ran sequential in one agent, read-only.

Net gate: CONDITIONAL — 0 FAIL, 3 LOW CONCERN (all closed by execute instructions E8-E10), rest PASS. Pass-1 FAILs A1 and A2 are closed in the body.

Pass-2 amendment check (body line refs are to this file):
- A1 PASS — PD-11 (:76); profile.ts row = update, reveal, offboard (:133); assembly shows 7 spreads (:143-151); 11.2 expects 7 (:213); AC3 7 spreads (:228); commit 10 moves offboard into profile.ts and retargets success-surfaces + offboard-feedback test 5 to profile.ts (:206); Touchpoints drop offboard.ts (:242); Blast Radius 26 new files (:256). profile.ts ≈ imports ~20 + updateSchema 66 + update 79 + reveal 28 + offboard 22 ≈ 215 lines: over 1000 chars by far, under the 400 bar. Between commits 5 and 10 the offboard row still reads +page.server.ts, which keeps load (> 1000 chars) — green.
- A2 PASS — commit 2 asserts `history.slice(0, LIST_RENDER_CAP)` in EmploymentHistoryCard (:198), commit 7 adds `data.loans.slice(0, LIST_RENDER_CAP)` and `data.cashAdvances.slice(0, LIST_RENDER_CAP)` in LoansCard (:203); these strings are verbatim in the source (+page.svelte:1940, :1123, :1192). Control `history.slice(0, 25)` removes the needle while the import line stays, so the unit test reds on its own message (lint also reds on the unused import — acceptable, the test red is the one that counts).
- A3 PASS — PD-10 (:75) reads each file of an array and requires each > 1000 chars; every array member (page, SupervisorsCard ~65 lines, LoansCard ~140, DocumentsCard ~110) clears it.
- A4 PASS with LOW — PD-12 (:77) + 1.3 (:187) + commit-3 control (:199). Regex check: prettier.config printWidth 100, useTabs, default tabWidth 2; the longest planned tag `<ChangeSalaryCard {data} {form} {revealed} {todayInput} {hireInput} />` at 4 tabs is ~79 columns, so no tag wraps and every tag keeps `<Name ` with a space. Vacuity: the loop is empty at commit 1 (stated) and has no floor afterwards (E8).
- A5 PASS — snapshot of `#main-content` + live-property control lines (:172), determinism and sensitivity controls and same-day rule (:173), after-diff includes the control section (:216).
- A6 PASS — commit 5 lists the exact 5 files and the two real assertions (:201).
- A7 PASS with LOW — corrected script refs (:49) and "always by content" (:50, :167); per-commit `wc -l` (:160). Stale script refs remain in the component table (:86-100: `:194`, `:120-121`, `:147-148`, `:123-126`), "Page after split" (:114: `:45-46`, `:48-84`, `:141-142`) and PD-6 (:71: `:194`); :50 makes them guides only, so harmless (E9).
- E6 PASS — commit rule, no Co-Authored-By or AI trailer, exact-path staging (:160); C7 reworded to the per-commit G-set, e2e on PR head only (:43, :232).
- New defects: none blocking. Commit count and order unchanged (10); each commit's gates re-traced green. Cosmetic: PD-12 (:77) ends with PD-10's old "Why" sentence (it belongs to PD-10); AC1 (:226) still names `before/` while 0.5/11.5 use `before-a/`; PD-2 (:67) still says shell ≈ 360 (pass-1 simulation: 381; the per-commit bar check covers it).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| C3 | exactly 21 action keys, every one wrapped by scopedToEmployee | Fully-Automated | `bun run test -- tests/unit/employee-detail-action-tags.test.ts` + `grep -cP '^\t\.\.\.' 'src/routes/(app)/employees/[id]/+page.server.ts'` = 7 | A |
| C3/PD-8 | no action name defined twice across route + modules | Fully-Automated | error-slots test 1 `new Set(actionNames).size === actionNames.length` | B |
| C5/PD-12 | every detail card file is imported and rendered by the page | Fully-Automated | error-slots orphan-card test; control commit 3 | B |
| C5 | every failable action keeps a scoped error slot | Fully-Automated | `bun run test -- tests/unit/employee-detail-error-slots.test.ts` | B |
| C5 | offboard toast silenced, banner outside dying blocks, server returns saved string | Fully-Automated | `bun run test -- tests/unit/employee-offboard-feedback.test.ts` | B |
| C5 | one success surface per action, every read file non-empty | Fully-Automated | `bun run test -- tests/unit/success-surfaces.test.ts` | B |
| C5 | card-scroll >= 10, pickers uncapped, lists slice with LIST_RENDER_CAP | Fully-Automated | `bun run test -- tests/unit/container-bounds-scan.test.ts` | B |
| C5 | onboarding target h-6 | Fully-Automated | `bun run test -- tests/unit/a11y-invariants.test.ts` | B |
| C5 | offboard confirm wiring + copy unchanged | Fully-Automated | `bun run test -- tests/unit/destructive-confirms.test.ts tests/unit/copy-invariants.test.ts` | A |
| C4 | one ?/reveal action, 3 reveal forms, cache only in page | Fully-Automated | commit-5 greps (plan :201) | B |
| C6 | every group file <= 400 lines | Fully-Automated | `wc -l` (11.1) after every commit | B |
| C7/C8 | format, lint, types, unit suite green at each commit | Fully-Automated | `bun run format:check && bun run lint && bun run check && bun run test` | A |
| C1 | rendered DOM + live form-control state identical, 5 tabs x S1-S5 | Hybrid | dom-snap.mjs, determinism + sensitivity controls, `diff -r before-a after` empty — precondition: owner-started dev server :5173 + DB | B |
| C4 | one VIEW audit row per reveal click | Hybrid | psql count +1 — precondition: DB up | B |
| C8 | e2e specs that open the page stay green | Hybrid | `bun run test:e2e -- <11.6 list>` — precondition: DB up, orchestrator holds e2e port | A |
| C1 | both themes look the same per tab | Agent-Probe | glance at each tab, localStorage `theme` light + dark | A |

Failing stub:
test("should find each detail card component imported and rendered by +page.svelte", () => { throw new Error("NOT IMPLEMENTED — TDD stub: orphan-card check (PD-12)") })
test("should find history.slice(0, LIST_RENDER_CAP) in EmploymentHistoryCard and both loan/cash-advance slices in LoansCard", () => { throw new Error("NOT IMPLEMENTED — TDD stub: render-cap slice needles (A2)") })
test("should read every file of an array Row.page and require each > 1000 chars", () => { throw new Error("NOT IMPLEMENTED — TDD stub: success-surfaces array non-vacuity (PD-10)") })
test("should find no action name twice across route and module files", () => { throw new Error("NOT IMPLEMENTED — TDD stub: PD-8") })

Legacy line form:
- route + modules: Fully-automated: `bun run test -- tests/unit/employee-detail-action-tags.test.ts tests/unit/employee-detail-error-slots.test.ts`
- tripwires: Fully-automated: `bun run test -- tests/unit/employee-offboard-feedback.test.ts tests/unit/success-surfaces.test.ts tests/unit/container-bounds-scan.test.ts tests/unit/a11y-invariants.test.ts tests/unit/destructive-confirms.test.ts tests/unit/copy-invariants.test.ts`
- regression: Fully-automated: `bun run format:check && bun run lint && bun run check && bun run test`
- DOM identity: hybrid: dom-snap.mjs diff + owner-started dev server and DB
- reveal audit: hybrid: psql VIEW-row count + DB up
- visual: agent-probe: tab glance in both themes

Dimension findings:
- Infra fit: PASS — scripts exist (package.json:13 test, :15 test:e2e, :17 lint, :19 format:check, :20 check); CI order ci.yml:37-47 matches the G-set; no eslint import restriction; `import type` rule now in the body (:85, :106) for verbatimModuleSyntax (.svelte-kit/tsconfig.json:18).
- Test coverage: CONCERN (LOW) — pass-1 FAILs closed (A1, A2) and A3-A5 in. Remaining: the PD-12 orphan test has no floor on the number of card files, so a wrong folder path would pass it silently (E8).
- Breaking changes: PASS — Object.keys(actions) still 21 (sorted compare, employee-detail-action-tags.test.ts:85); scopedToEmployee (+page.server.ts:414-424) wraps every spread entry; `actions: Actions` already annotated (:426); all action-importing tests mock by `$lib/...` alias.
- Security surface: PASS — reveal body moves verbatim with isSelf into profile.ts; cache + $effect stay in the page (+page.svelte:66-87); commit-5 greps now correct.
- Section Q1 Svelte 5 props: PASS (unchanged from pass 1) — snippet props legal, bound state owned by its card, guard getter + function survive props, no card writes revealCache.
- Section Q2 hidden coupling: PASS — no 9th shared state; ChangeSalary's own scrollToError import now in its row (:99); DeductionsCard no longer lists `employee` (:98).
- Section Q3 DOM identity: PASS — whitespace/if placement identical (pass-1 probes, Svelte 5.56.4); snapshot now covers live control state and has determinism + sensitivity controls. Closed dialogs still not compared (LOW, PD-4 keeps ConfirmDialog code unchanged).
- Section Q4 server split: PASS — 7 modules + shared, relative `$types` depths correct.
- Section Q5 tripwires: PASS — every listed control reds for the right reason; commit 1 green at its own SHA; PD-2 bar holds (shell ~381, UpdateProfileCard ~285, profile.ts ~215).
- Section Q6 later plans: PASS — #20, #24 part 2, #27 locate sites by content/action grep.
- Section Q7 gates/commits: PASS — commit rule with no AI trailer in the body (:160).

Execute-agent instructions:
- E1: stop and report if any group file passes 400 lines after a commit (PD-2); the shell margin is ~19 lines.
- E2: declare `employee`/`canManage` only where the moved markup uses them; lint is the authority.
- E3: every route-type import is `import type { … } from '…/$types'`.
- E4: no new comments; carry moved comments verbatim.
- E5: DOM diff runs in an isolated worktree with no #27 files; investigate every diff line.
- E6: commit messages are subject + optional body, no Co-Authored-By or AI trailer; no push; PR only on the owner's word.
- E7 (optional, LOW): widen a11y-invariants.test.ts:148 filter to include `lib/components/employees/detail/`.
- E8: build the PD-12 file list from the SAME folder constant as the error-slots template list, and add a floor: from commit 2 `expect(cards.length).toBeGreaterThan(0)`, and in commit 9 (the last card commit) `expect(cards.length).toBe(17)`. Match the tag with `new RegExp('<' + name + '[\\s/>]')` so a prettier wrap cannot break it.
- E9: treat every line ref outside :49 as a guide; move by content (plan :50).
- E10: when writing the report/PR, use `before-a/` for AC1 and the measured shell size instead of PD-2's ≈360; PD-12's trailing "Why" sentence belongs to PD-10 (cosmetic).

Open gaps: none deferred to backlog. Closed-dialog content (ConfirmDialog, per-row ConfirmButton) is not in the snapshot — LOW, accepted.
What this coverage does NOT prove:
- action-tags + error-slots + PD-12: that a slot renders in the browser; that errorFor matches at runtime (source text only).
- offboard-feedback / success-surfaces / container-bounds / a11y: text presence in files, not rendering or card-scroll box height.
- G-set: runtime hydration and client reactivity (svelte-check proves types, not behaviour).
- DOM diff: open-dialog content; submits other than reveal and the S5 error; data shapes not in S1-S4; CSS/visual (agent-probe glance only).
- psql audit count: exact per-click count if other reveals run at the same time (run with no other users).
- e2e list: cards no spec drives (Deductions, Allowances, Documents upload).
Gate: CONDITIONAL (0 FAIL; 3 LOW concerns closed by E8-E10 as execute instructions; after 1 validate-fix loop)
Accepted by: session (orchestrator-directed VALIDATE pass 2, no user menu) — accepted concerns: PD-12 vacuity floor (E8), stale guide line refs outside :49 (E9), cosmetic plan text in PD-12/AC1/PD-2 (E10), closed-dialog content not snapshotted (Open gaps)

## Autonomous Goal Block

/goal Refactor HRIS #23 on branch refactor/23-employee-detail-split off updated staging (after Wave 1 merges): split src/routes/(app)/employees/[id]/+page.svelte into 17 card components under src/lib/components/employees/detail/ and move the 21 actions into 7 modules under src/lib/server/employee-detail/ (offboard lives in profile.ts), spread into the one scopedToEmployee({...}). Plan: process/general-plans/active/hris-23-employee-detail-split_PLAN_24-09-26.md (Validate Contract pass 2 CONDITIONAL; apply E1-E10). Order: Step 0 preflight + DOM before-snapshots twice (owner starts servers), commit 1 retargets tripwires (+PD-12 orphan check), commits 2-10 one card group each, G-set (format:check, lint, check, test) + wc -l + that commit's negative control after every commit, then Step 11 proof. Autonomy: edit only the plan's touchpoints; markup moves byte-for-byte by content; no new comments. Hard stops: no push, no PR without owner word, never start servers or DB, no .env, no AI attribution in commits, do not touch app.css, tailwind.config.ts, src/lib/components/ui/**, toast/flash files, submit-feedback.svelte.ts, EmployeeTabs, services/**, prisma/**; stop if any group file exceeds 400 lines or a control reds for the wrong reason. Next phase: EXECUTE after Wave 1 merges. Start: git switch staging && git pull && git switch -c refactor/23-employee-detail-split.

## Resume and Execution Handoff

1. Selected plan: `process/general-plans/active/hris-23-employee-detail-split_PLAN_24-09-26.md`.
2. Last completed: PLAN. No code written.
3. Validate-contract: pending.
4. Context loaded: `process/context/all-context.md`, `process/context/tests/all-tests.md`, CONTEXT.md, PLAN-BRIEF.md, research-23.md (scratchpad), issue #23 + owner comment, both route files, the 6 source tripwires + action-tags test, attendance precedent, #22 plan (no employees/[id] change), `package.json`, `.github/workflows/ci.yml`, `playwright.config.ts`, `_dev/login-as`.
5. Next: VALIDATE this plan. EXECUTE starts at Step 0 only after Wave 1 is merged; resume mid-run by `git log --oneline staging..HEAD` and continuing at the next commit number in the checklist.

Next Step: ENTER VALIDATE MODE (vc-validate-agent), then ENTER EXECUTE MODE after Wave 1 merges.
