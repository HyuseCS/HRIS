---
name: plan:hris-24-form-field-component
description: "#24 part 2 — one shared Field wrapper (label, hint, error slot, aria wiring); adopt in employees/new and the employees/[id] card forms"
date: 24-09-26
feature: general
---

# #24 part 2 — shared form field component

**Date**: 24-09-26
**Status**: PLANNED
**Complexity**: SIMPLE

TL;DR: add one `Field.svelte` wrapper (label + hint + error around a child control passed as a snippet). It owns presentation only. Adopt it in `employees/new` and the employee-detail card forms. Give the four unlabelled add-rows visible labels. No server change. No sweep of other pages.

## Phase Record

| Phase | Status | Note |
|---|---|---|
| SPEC | SKIPPED | Issue #24 body + owner decisions (CONTEXT.md, round 2) are the spec |
| INNOVATE | SKIPPED | Owner fixed the approach: server zod is truth, component is presentation only, adopt first in employees/new + employees/[id] |
| Intent-clarify | Emitted | "Plan one Field wrapper and its adoption on the two employee pages, presentation only, keeping every e2e selector intact." Auto-proceeded. |
| PLAN | This file | SIMPLE (one PR, 3 files of source + tests) |
| VALIDATE | pending | |

Wave 3, LAST. Starts only after #23 (employees/[id] split into `src/lib/components/employees/*`), #27 and #20 are merged to staging.

## Overview and Goals

- G1: a shared `Field` component so label wiring, hint, error slot, `aria-invalid` and `aria-describedby` are no longer hand-written per field.
- G2: `employees/new` uses it for every labelled control (29). Every id, name and label text stays the same; `invalid()`, FIELD_ORDER, firstErrorField and the details disclosure stay. Error display gains: `contactPhone` and `contactAddress` now show their server fieldError and `aria-invalid` (today they show none, so a rejected phone only says "1 field need attention"). Per-field errors become linked to their control with `aria-describedby` (today: 0 links, research §3).
- G3: the employee-detail card forms use it. The loan, cash-advance, allowance and deduction add-rows get VISIBLE labels (owner round 2).
- Non-goals: no server `fieldErrors` on employees/[id] actions; no other page; no change to validation; no base-class sweep; the rest of the repo is a follow-up note only.

## Decisions

Owner decisions (do not contradict): server zod stays the source of truth; component owns presentation only and is never the only guard; adopt first in employees/new + employees/[id] cards; add-row inputs get visible labels.

| ID | Decision | One-line reason |
|---|---|---|
| PD-1 | Shape = ONE wrapper `src/lib/components/ui/Field.svelte`; the control is passed as a `children` snippet that receives `{ id, 'aria-invalid', 'aria-describedby' }` to spread | One component covers `<input>`, `<select>`, `<textarea>` and DatePicker (already accepts id/aria-invalid/aria-describedby, `DatePicker.svelte:34-35`) with no per-control duplication. |
| PD-2 | Id: `id` prop if given, else `$props.id()` (same as `HelpTip.svelte`) | employees/new must keep its ids (e2e `#firstName` etc.); add-rows have no id today. |
| PD-3 | One `size` prop: `'default' \| 'compact'`. It changes only the wrapper and label/hint/error text size; the control keeps its own class | Covers both existing sizes with no new control styles. |
| PD-4 | Error text = `mt-1 text-xs text-destructive`; hint text = `mt-1 text-xs text-muted-foreground` | Matches the 11 existing destructive sites; replaces the 4 `text-red-400` gov-ID errors on employees/new only. |
| PD-5 | Base input class: KEEP each adopted control's current class string unchanged (hand-written ring-2 on employees/new, `h-8 … text-xs` on add-rows). Do NOT switch to `.input` | Zero visual change and zero layout-spec risk; `.input` has ring-1/py-1/shadow and would shift heights. |
| PD-6 | Label text on the four unlabelled add-rows = the fixed table in step 6 (mostly the current placeholder; two selects have no placeholder option). Placeholders stay. No `required` marker on add-rows | Deterministic wording; placeholder lookups unaffected. |
| PD-7 | NOT adopted: file inputs (`FileInput` owns its own id + errors), the `setStatutoryAllocation` select (uses `aria-label`, inline, no visible label by design), hidden inputs, checkboxes | Out of the text/select/textarea/DatePicker set the component targets. |
| PD-8 | Required marker: `required` prop renders `{' '}<span class="text-destructive">*</span>` after the label text (explicit `{' '}`: Svelte drops a bare leading space in `{#if}`, E1) | Keeps label text byte-identical so getByLabel substring matches. Field does NOT set the native `required` attr — the control keeps its own. |
| PD-10 | Optional `suffix?: Snippet` rendered inside the label after the marker, for the 3 labels holding a styled `(optional)` span | Keeps existing label markup without widening `label` beyond string. |
| PD-9 | `aria-describedby` = space-joined `${id}-hint` (when hint given) and `${id}-error` (when error given); `undefined` when neither | Links hint too, standard pattern; absent when nothing to describe. |

## Touchpoints

| File | Change |
|---|---|
| `src/lib/components/ui/Field.svelte` | NEW |
| `src/routes/(app)/employees/new/+page.svelte` | adopt Field on 29 labelled controls |
| `src/lib/components/employees/detail/*.svelte` + `src/routes/(app)/employees/[id]/+page.svelte` (offboard) (post-#23; exact files found by step 1) | adopt Field in the card forms listed in §Checklist step 6 |
| `tests/unit/field.test.ts` | NEW |
| `tests/unit/employees-new-fields.test.ts` | NEW |
| `process/general-plans/backlog/hris-24-field-rollout_NOTE_24-09-26.md` | NEW follow-up note (no code) |

Read only: `src/lib/components/ui/HelpTip.svelte`, `DatePicker.svelte`, `src/lib/utils/cn.ts`, `tests/unit/statutory-proposal-card.test.ts` (render pattern), e2e specs in §Verification.

## Public Contracts

`Field.svelte` props (exact):

- `label: string` (required)
- `id?: string`
- `hint?: string`
- `error?: string` (first message; caller passes `form?.fieldErrors?.x?.[0]`)
- `required?: boolean` (marker only, PD-8)
- `size?: 'default' | 'compact'` (default `'default'`)
- `suffix?: Snippet` (rendered inside the label, PD-10)
- `class?: string` (as `klass`, merged with `cn`)
- `children: Snippet<[{ id: string; 'aria-invalid': true | undefined; 'aria-describedby': string | undefined }]>`

Markup (exact order):
1. Wrapper `<div class={cn(size === 'compact' ? 'grid gap-1' : '', klass)}>`.
2. `<label for={id} class={size === 'compact' ? 'text-xs font-medium text-muted-foreground' : 'text-sm font-medium'}>{label}{#if required}{' '}<span class="text-destructive">*</span>{/if}{#if suffix}{' '}{@render suffix()}{/if}</label>`. The `{' '}` is required (E1: a bare space is dropped, giving accessible name "First Name*").
3. `{@render children(attrs)}`.
4. Hint when given: `<p id="{id}-hint" class="mt-1 text-xs text-muted-foreground">{hint}</p>`.
5. Error when given: `<p id="{id}-error" class="mt-1 text-xs text-destructive">{error}</p>`.

`attrs['aria-invalid']` = `error ? true : undefined`. No other public contract changes. No server, schema, API or route change.

## Blast Radius

- 1 new component, 1 route page, the post-#23 employee card files that hold the listed forms (expected 4-8 files), 2 new unit test files, 1 backlog note.
- Risk class: UI only. No auth, billing, schema, API. High-risk classes: none.
- Rendered output changes: add-rows gain visible labels (layout of those rows grows by one label line); gov-ID error colour red-400 → destructive; employees/new controls gain `aria-describedby` when an error or hint exists; `rateType`/`basicMonthlySalary` gain `aria-invalid` when in error (they show an error today but lack the attribute); `contactPhone`/`contactAddress` gain an error `<p>` and `aria-invalid` (G1); `assignTemplate` label-to-select gap goes 8px → 4px (compact wrapper, E6 — the only employee-card visual delta). Nothing else should render differently.

## Data Flow

Server action returns `fail(400, { fieldErrors, values })` (unchanged, `employees/new/+page.server.ts` flatten) → page reads `form.fieldErrors.x[0]` → passes as `error` to Field → Field renders error `<p id>` and hands `aria-invalid`/`aria-describedby` to the control. Browser `required`/`min` attrs stay on the controls; the server re-checks everything (unchanged).

## Implementation Checklist

Lane: one EXECUTE agent, sequential (files depend on Field). Branch `feat/24-form-field-component` off updated local staging (`git switch -c`).

1. Re-scan (read only). Confirm #23, #27, #20 are merged into staging. Run and record:
   - STOP rule (E9): if the grep below finds no file for any of the 11 action names, STOP and report. Do not map by line or guess. Expected: cards in `src/lib/components/employees/detail/*.svelte`, `offboard` in `+page.svelte`.
   - `grep -rln 'action="?/\(update\|addEmergencyContact\|addLoan\|addCashAdvance\|addEarning\|addDeduction\|changeCompensation\|promote\|uploadDocument\|offboard\|assignTemplate\)"' src/lib/components/employees 'src/routes/(app)/employees/[id]'` — full list, no head. This is the card-file list for step 6.
   - `grep -n '<label\|<input\|<select\|<textarea\|<DatePicker' 'src/routes/(app)/employees/new/+page.svelte'` — confirm the labelled controls; `grep -c '<label for=' 'src/routes/(app)/employees/new/+page.svelte'` must be 29 (18 main + 4 gov IDs + 3 emergency + 4 bank; E4). The 4a pair list is derived from this grep, never hard-coded. If a control was added/removed by earlier waves (e.g. contactPhone/contactAddress error slots from Wave 1), include it with the same rule.
2. Create `src/lib/components/ui/Field.svelte` exactly as §Public Contracts. `const genId = $props.id()`; `const fid = $derived(id ?? genId)`; `describedBy` = `[hint && \`${fid}-hint\`, error && \`${fid}-error\`].filter(Boolean).join(' ') || undefined`. Import `cn` from `$lib/utils/cn`. No comments.
3. Write `tests/unit/field.test.ts` (render via `svelte/server`). Child via `createRawSnippet((a) => ({ render: () => … }))` — `a` is a GETTER (E3): capture `a()` into a test variable, assert on that object, and print only defined attrs into the HTML. Before every string assertion strip hydration comments: `body.replace(/<!--[\s\S]*?-->/g, '')` (E2). Cases:
   - a. `label="First Name" id="firstName"` → output has `<label for="firstName"` and the child `id="firstName"`.
   - b. no `id` → label `for` equals the child's `id` (extract both with regex, assert equal and non-empty).
   - c. `error="Required"` → `<p id="firstName-error"` with text `Required`, class contains `text-destructive`; captured attrs equal `{ id: 'firstName', 'aria-invalid': true, 'aria-describedby': 'firstName-error' }`.
   - d. NEGATIVE: no error, no hint → captured `aria-invalid` and `aria-describedby` are both `undefined`; output contains no `-error`.
   - e. hint + error → `aria-describedby="firstName-hint firstName-error"`.
   - f. `required` → stripped output contains the literal `First Name <span class="text-destructive">*</span>` (fails without `{' '}`, E1).
   - g. `size="compact"` → wrapper has `grid gap-1`, label has `text-xs`.
   - h. `suffix` snippet (raw `<span class="text-muted-foreground">(optional)</span>`) renders inside `<label>…</label>`, after the label text and one space.
   Negative control: temporarily make step 2 return `undefined` for `describedBy`; see c and e red for "missing aria-describedby"; restore. Record the red output for the commit body (step 11).
4. Write `tests/unit/employees-new-fields.test.ts` BEFORE touching the page (render the page with `svelte/server`, mocks as in `statutory-proposal-card.test.ts:4-5` plus any `$app/*` module the page imports; `data` fixture = every `data.*` key the page reads, from `grep -o 'data\.[a-zA-Z]*' 'src/routes/(app)/employees/new/+page.svelte' | sort -u`, each an empty array or minimal object):
   Strip hydration comments before assertions (E2). Probe-confirmed data keys: departments, employees, positions, workSchedules, organizationId; mock `$app/forms`.
   - a. PRESERVATION (passes on today's code and must still pass): for each of the 29 `[id, labelText]` pairs derived from the step-1 grep (e.g. `['firstName','First Name']`, `['basicMonthlySalary', <rate.label for the default rateType>]`, `['sssNumber','SSS Number']` …), output contains `<label for="{id}"` whose text contains `labelText`, and a control with `id="{id}"` and the same `name`.
   - b. With `form = { fieldErrors: { firstName: ['Required'], sssNumber: ['Bad'], contactPhone: ['Invalid phone'] }, values: {} }`: `id="firstName"` control carries `aria-describedby="firstName-error"`; `<p id="firstName-error"`; `id="contactPhone"` control carries `aria-describedby="contactPhone-error"` and `aria-invalid="true"`, and `<p id="contactPhone-error"` holds `Invalid phone` (G1); `<details … open` present (optionalHasError); the element `<p id="sssNumber-error"` itself has a class containing `text-destructive` and not `text-red-400` (E5 — assert on that element, not page-wide).
   - c. NEGATIVE: with `form = null`, no `aria-describedby` containing `-error` and no `aria-invalid` anywhere.
   Negative control: run 4b on the unchanged page → red because no `aria-describedby` (0 today) and no contactPhone error `<p>`. Record the failure text for the commit body. Do not commit this red state (step 11).
5. Adopt Field in `employees/new/+page.svelte`. For each labelled control: replace the wrapping `<div>` + `<label>` + hint `<p>` + `{#if form?.fieldErrors?.x}` error block with `<Field label=… id="x" required={bool if label had *} hint=… error={form?.fieldErrors?.x?.[0]} class=<old div class if any>>{#snippet children(a)}<control {...a} …every other existing attr unchanged…/>{/snippet}</Field>`. Rules:
   - Keep `id`, `name`, `type`, `required`, `value`, `bind:value`, `min`, `step`, `placeholder`, the class string, `<option>` blocks and the existing `<!-- Mirrors HIRE_ROLES … -->` comment verbatim.
   - Every control gets `error={form?.fieldErrors?.x?.[0]}` — including `contactPhone` and `contactAddress`, which have no error slot today (G1). Remove the control's own `aria-invalid={invalid('x')}` (Field supplies it). Keep `const invalid` (still used by `optionalHasError`), `FIELD_ORDER`, `OPTIONAL_FIELDS`, `firstErrorField`, `document.getElementById`, `<details open={optionalHasError}>` untouched.
   - Hints: password, discordId, basicMonthlySalary (`{rate.hint}`), workScheduleId — pass as `hint` string (multi-line text joined by one space).
   - `basicMonthlySalary` label = `{rate.label}` → `label={rate.label}`.
   - DatePicker `startDate`: `{#snippet children(a)}<DatePicker {...a} name="startDate" …/>{/snippet}`.
   - Import `Field from '$lib/components/ui/Field.svelte'`.
   Run step 4 test → green; step 3 test → green.
6. Adopt Field in the card files found in step 1, per form (identify by action name + control name, NOT line):
   - `update`, `changeCompensation`, `promote`, `offboard`: same rules as step 5, `size` default, no `error` prop (no per-field errors on these actions — out of scope). Keep existing ids.
   - `assignTemplate` and `uploadDocument` (select + text only; the native file input is not adopted, PD-7): `size="compact"` — they use the compact label style today (E6). uploadDocument's `<div class="grid gap-1">` wrappers are dropped (Field supplies it). assignTemplate has no wrapper today, so its gap goes 8px → 4px — accepted; record it in the step-10 probe note.
   - Labels with a styled span (E7): compNote and promoNote `Note <span class="text-muted-foreground">(optional)</span>`, doc label `Label <span class="text-muted-foreground/70">(optional)</span>` → `label="Note"` / `label="Label"` plus `{#snippet suffix()}` holding the existing span unchanged.
   - `addEmergencyContact`: `size="compact"`, keep ids `ec-*`, drop the `<div class="grid gap-1">` (Field supplies it).
   - Add-rows: wrap each control in `<Field size="compact" label=…>`, no `id` prop (generated), no Field `required` (E8). Keep placeholders, classes, native `required`, `min`, `step`. Labels (exact, E8):

     | Form | Labels in control order |
     |---|---|
     | addLoan | Type / Principal / Per period |
     | addCashAdvance | Amount / Per period |
     | addEarning | Kind / Label / Monthly amount |
     | addDeduction | Pay code / Label (optional) / Monthly amount |

   - After step 6 run `wc -l src/lib/components/employees/detail/*.svelte`; report any file over 400 lines in the PR (#23 PD-2 bar, E11). Do not split files.
   - `setStatutoryAllocation`: untouched (PD-7).
7. Write `process/general-plans/backlog/hris-24-field-rollout_NOTE_24-09-26.md`: 5-10 lines — remaining pages (research §1 top list), the other per-field-error UIs (RequestCreateDialog, SeparationCreateDialog, ComplaintCreateDialog, ReviewFormRender, settings/roles) and their red-500/red-600 colours, the `.input` vs ring-2 base-class choice left open. No code.
8. Gates (CI order): `bun run format:check` → `bun run lint` → `bun run check` → `bun run test`. Fix inline until green.
9. E2E (owner starts servers; EXECUTE does not): ask the owner to start the app, then run `bun run test:e2e tests/e2e/employees-new-disclosure.spec.ts tests/e2e/employees-new-layout.spec.ts tests/e2e/admin.spec.ts tests/e2e/dashboard-layout.spec.ts tests/e2e/employee.spec.ts tests/e2e/employee-tabs.spec.ts tests/e2e/employee-view-only.spec.ts tests/e2e/pii.spec.ts` (pii.spec visits `/employees/${employeeId}`, where the update-form gov-ID inputs change; E10). All must pass with NO spec edits.
10. Playwright visual pass (agent probe), both themes (set `localStorage.theme` = `dark` then `light`, reload): screenshot `/employees/new` (empty, and after submitting blank → errors shown, `details` open) and the employee detail tabs holding the add-rows at 1440 and 390 widths. Judge: labels visible above each add-row control, no row overflow, error text readable. Also `getByLabel('Principal', { exact: true })` resolves to exactly one input.
11. Commits — only on green gates (owner rule G2): no red or test-only commit. A red-first test goes in the SAME commit as the code that makes it pass; its negative-control red output goes in that commit's body. Stage exact paths, no `git add -A`, no attribution trailer.
    - `feat(ui): add Field wrapper for label, hint and error wiring` (Field.svelte, field.test.ts; body: step-3 negative-control red output)
    - `refactor(employees): use Field on the new-employee form and show phone/address errors` (page + employees-new-fields.test.ts 4a/4b/4c; body: step-4 red output)
    - `feat(employees): use Field on the detail card forms and label the add-rows` (card files)
    - `docs(process): note the remaining Field rollout` (backlog note)
    One PR to `staging`. Push only on the owner's word.

## Acceptance Criteria

| ID | Criterion | proven by | strategy |
|---|---|---|---|
| AC-1 | Field links label→control, and error→control via aria-describedby only when an error exists; marker space; suffix | field.test.ts a-h | Fully-Automated |
| AC-2 | Every employees/new id, name and label text preserved | employees-new-fields 4a | Fully-Automated |
| AC-3 | employees/new errors (incl. contactPhone) linked with aria-describedby + aria-invalid; details still opens on optional error; gov-ID error uses text-destructive | employees-new-fields 4b/4c | Fully-Automated |
| AC-4 | e2e selectors (getByLabel, #id, [name=]) pass unchanged | e2e step 9 | Hybrid |
| AC-5 | loan / cash advance / allowance / deduction add-rows show visible labels bound to their controls | Playwright probe step 10 + `getByLabel('Principal', { exact: true })` | Agent-Probe |
| AC-6 | No server validation change | `git diff staging --stat` shows no `+page.server.ts` / service files | Fully-Automated |

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run test -- tests/unit/field.test.ts` (a-h, negative d) | Fully-Automated | AC-1 |
| `bun run test -- tests/unit/employees-new-fields.test.ts` 4a | Fully-Automated | AC-2 |
| same file 4b/4c (red on today's code) | Fully-Automated | AC-3 |
| format:check, lint, check, test | Fully-Automated | AC-1..3 regression |
| e2e list in step 9 (8 specs incl. pii.spec) (owner-started server) | Hybrid | AC-4 |
| Playwright both themes, 1440 + 390 | Agent-Probe | AC-5 |
| `git diff --stat staging...HEAD` | Fully-Automated | AC-6 |

E2E selectors that must pass unchanged (research §6): getByLabel 'First Name', 'Last Name', 'Email', 'Department', 'Job Title', 'Start Date', 'Basic Monthly Salary', 'SSS Number', 'PhilHealth Number', 'TIN Number' (admin.spec.ts, employees-new-layout.spec.ts, dashboard-layout.spec.ts); `#firstName #lastName #email #departmentId #jobTitle #startDate #basicMonthlySalary #emergencyContactName #sssNumber #workScheduleId` (employees-new-disclosure.spec.ts, employees-new-layout.spec.ts); `select[name="employmentType"]`, `select[name="rateType"]` (admin.spec.ts). Note: getByLabel is a substring match, so new add-row labels such as "Type" could collide — check at step 9 that no spec on the detail page uses `getByLabel('Type')` (research: no e2e selects card fields).

Existing tests to watch (source-reading the employee page/cards; expected no change, re-run): `employee-detail-error-slots`, `employee-offboard-feedback`, `success-surfaces`, `container-bounds-scan`, `destructive-confirms`. If one fails because it greps markup that moved into a snippet, update only its expected string; list it in the PR.

## Risks

| Risk | Mitigation |
|---|---|
| Label text drifts (whitespace, asterisk) and breaks getByLabel | PD-8 exact markup; test 4a + e2e step 9 |
| DatePicker loses `#startDate` | spread `{...a}` gives `id`; 4a checks `id="startDate"` |
| Generated `$props.id()` differs SSR vs client | Svelte guarantees hydration-stable ids (HelpTip already relies on it) |
| Add-row labels widen rows and overflow on phone | step 10 at 390 width |
| #23 file layout differs from expectation | step 1 re-scan by action name |

Rollback: revert the PR; no data or schema involved.

## Phase Completion Rules

CODE DONE = steps 1-8 green. VERIFIED = also step 9 e2e green unchanged and step 10 probe recorded in the PR body.

## Test Infra Improvement Notes

(none identified yet)

## Resume and Execution Handoff

1. Selected plan: `process/general-plans/active/hris-24-form-field-component_PLAN_24-09-26.md`
2. Last completed: PLAN written; VALIDATE CONDITIONAL; E1-E11 + G1/G2 folded into the body; no execution.
3. Validate contract: written (CONDITIONAL, amendments now in body).
4. Context loaded: CONTEXT.md, PLAN-BRIEF.md, research-24b.md (scratchpad), issue #24, HelpTip.svelte, DatePicker.svelte props, employees/new +page.svelte (d773e1a), statutory-proposal-card.test.ts.
5. Next: VALIDATE; then EXECUTE starts at step 1 only after #23, #27, #20 are merged.

## Validate Contract

Status: CONDITIONAL
Date: 24-09-26
date: 2026-09-24
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 1/7 signals (S7: 5+ files). UI-only, one lane; files depend on Field.svelte.

Probe used for this contract (scratch only, repo untouched): the §Public Contracts Field.svelte, rendered with the repo's own vitest + sveltekit plugin via `svelte/server` `render` + `createRawSnippet`, plus a wrapper spreading the snippet attrs onto DatePicker, `<select>` and `<textarea>`, plus a render of today's `employees/new/+page.svelte` with `vi.mock('$app/forms')`. All three rendered.

### Execute-agent amendments (binding; apply before or while doing the named step)

- E1 (step 2, Field markup) The required-marker space is DROPPED by Svelte. Probe output for the §Public Contracts markup `{label}{#if required} <span…>` is `First Name<!--[0--><span class="text-destructive">*</span>` (no space). Accessible name becomes "First Name*", and test f cannot pass. Write `{label}{#if required}{' '}<span class="text-destructive">*</span>{/if}`. Probe with `{' '}` gives `First Name<!--[0--> <span …>`.
- E2 (steps 3 and 4, assertions) SSR output has hydration comments inside labels (`<!--[0-->`, `<!--$s1-->`). Strip `/<!--[\s\S]*?-->/g` from `body` before all string assertions. Test f then asserts the literal `First Name <span class="text-destructive">*</span>`.
- E3 (step 3, raw snippet) `createRawSnippet` hands the snippet a GETTER: `createRawSnippet((a) => ({ render: () => … a().id … }))`. Capture `a()` into a test variable and assert on the object itself (c: `{ id:'firstName', 'aria-invalid': true, 'aria-describedby':'firstName-error' }`; d: both aria keys `undefined`). Print only defined attrs into the HTML. Otherwise case d tests the test's own serializer, not Field.
- E4 (steps 1, 4a) employees/new has 29 labelled controls, not 28: `grep -c '<label for=' 'src/routes/(app)/employees/new/+page.svelte'` = 29 at d773e1a (18 main + 4 gov IDs + 3 emergency + 4 bank). Derive the pair list from the step-1 grep. Do not hard-code 28.
- E5 (step 4b) Assert the gov-ID colour on the element itself: `<p id="sssNumber-error"` whose class contains `text-destructive` and not `text-red-400`. The page has other `text-destructive` text, so a page-wide check cannot fail.
- E6 (step 6, sizes) `assignTemplate` and `uploadDocument` use the COMPACT label style today (`text-xs font-medium text-muted-foreground`, employees/[id]/+page.svelte:611, :1871, :1884). Step 6 says size default, which would change them to text-sm, which breaks PD-5. Use `size="compact"` for both. uploadDocument already has `<div class="grid gap-1">` wrappers (:1870, :1883), so compact is identical. assignTemplate has NO wrapper: label and select are direct children of `<form class="space-y-2">` (:605-618). Compact makes the label-to-select gap 4px instead of 8px. Accepted as the only visual delta. Record it in the probe note.
- E7 (step 6, label markup) Three labels hold a styled span that a `label: string` cannot render. compNote :1626-1627 and promoNote :1775-1776 (`Note <span class="text-muted-foreground">(optional)</span>`), doc-label :1884-1885 (`Label <span class="text-muted-foreground/70">(optional)</span>`). Add one optional prop, `suffix?: Snippet`, rendered as `{#if suffix}{' '}{@render suffix()}{/if}` after the required marker inside `<label>`. Pass the existing span unchanged. Add field.test.ts case h: suffix renders inside the label. doc-file is a native file input: not adopted (PD-7).
- E8 (step 6, PD-6 wording) PD-6 ("label = placeholder") has no answer for two selects, and it gives a clumsy label for one input. addEarning `kind` select has no placeholder option; its first option "Allowance" is a real value (:1304-1309). addDeduction `deductionTypeId` select has no placeholder option (:1507-1513). Use this exact table (placeholders stay):
  addLoan: "Type" / "Principal" / "Per period". addCashAdvance: "Amount" / "Per period". addEarning: "Kind" / "Label" / "Monthly amount". addDeduction: "Pay code" / "Label (optional)" / "Monthly amount".
  Do not pass Field `required` on add-rows (no asterisk today). Keep the control's native `required`.
- E9 (step 1, stop rule) If the action grep finds no file for any of the 11 action names, STOP and report. Do not map by line or guess. Expected after #23 (its plan: hris-23-employee-detail-split_PLAN_24-09-26.md PD-3/PD-4): the cards are in `src/lib/components/employees/detail/*.svelte` with literal `action="?/…"` kept; `offboard` stays in `+page.svelte`. The step-1 `grep -rln` covers both paths.
- E10 (step 9) Add `tests/e2e/pii.spec.ts` to the e2e list. It visits `/employees/${employeeId}` (:57, :75) where the update-form gov-ID inputs change.
- E11 (#23 size bar) #23 PD-2 keeps each card file at ≤ 400 lines (gate command, not a test). After step 6, run `wc -l src/lib/components/employees/detail/*.svelte` and report any file over 400 in the PR. Do not split files to fit.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1 | Field links label to control; error/hint to control via aria-describedby only when present; aria-invalid only on error; required marker keeps its space; compact sizes; suffix | Fully-Automated | `bun run test -- tests/unit/field.test.ts` (a-h) + negative control: describedBy forced `undefined` makes c/e red | B |
Failing stub:
test("should link label, hint and error to the control through the snippet attrs", () => { throw new Error("NOT IMPLEMENTED — TDD stub: Field aria wiring") })
| AC-2 | every employees/new id, name and label text preserved (29 controls) | Fully-Automated | `bun run test -- tests/unit/employees-new-fields.test.ts` 4a (green before and after the page edit) | B |
Failing stub:
test("should keep every employees/new label for, id, name and label text", () => { throw new Error("NOT IMPLEMENTED — TDD stub: employees/new preservation") })
| AC-3 | employees/new field errors linked by aria-describedby; details opens on optional error; gov-ID error uses text-destructive | Fully-Automated | same file 4b (red today: source has 0 `aria-describedby`) and 4c (negative, form=null) | B |
Failing stub:
test("should link each employees/new field error with aria-describedby and open details on an optional error", () => { throw new Error("NOT IMPLEMENTED — TDD stub: employees/new error linking") })
| AC-1..3 regression | whole unit suite, types, lint, format | Fully-Automated | `bun run format:check` then `bun run lint` then `bun run check` then `bun run test` | A |
| AC-4 | e2e getByLabel / #id / [name=] selectors pass with no spec edits | Hybrid | `bun run test:e2e tests/e2e/employees-new-disclosure.spec.ts tests/e2e/employees-new-layout.spec.ts tests/e2e/admin.spec.ts tests/e2e/dashboard-layout.spec.ts tests/e2e/employee.spec.ts tests/e2e/employee-tabs.spec.ts tests/e2e/employee-view-only.spec.ts tests/e2e/pii.spec.ts`. Precondition: the owner starts the app. | B |
| AC-5 | add-rows show visible labels bound to their controls; no overflow at 390; no other visual change | Agent-Probe | step 10 Playwright, both themes via localStorage.theme, 1440 + 390; also `getByLabel('Principal', { exact: true })` resolves to one input | B |
| AC-6 | no server or validation change | Fully-Automated | `git diff --stat staging...HEAD` lists no `+page.server.ts`, `src/lib/server/**` | A |

Legacy line form:
- Field component: Fully-automated: `bun run test -- tests/unit/field.test.ts`
- employees/new: Fully-automated: `bun run test -- tests/unit/employees-new-fields.test.ts`
- e2e selectors: hybrid: `bun run test:e2e <8 specs above>` + owner-started app
- employee card add-rows: agent-probe: Playwright visual pass, both themes, 1440/390
- employee card forms markup: known-gap: no unit test renders the detail cards (named residual below)

Dimension findings:
- Infra fit: PASS — vitest.config.ts runs `sveltekit()` with `environment: 'node'`. `svelte/server` render is already used (tests/unit/statutory-proposal-card.test.ts:2, performance-capture.test.ts). Svelte 5.56.4 has `createRawSnippet` and `$props.id()`. The probe rendered Field, DatePicker/select/textarea children, and today's employees/new page (needs only `vi.mock('$app/forms')` plus data keys departments, employees, positions, workSchedules, organizationId). Scripts exist: package.json:13 test, :15 test:e2e, :17 lint, :19 format:check, :20 check.
- Test coverage: CONCERN — red-first is real: 4b fails today for the right reason (0 `aria-describedby` in the page; the probe showed only 2 aria-invalid with firstName+sssNumber errors). The describedBy negative control is real. Gaps: E1 (test f fails on the plan's own markup), E2 (hydration comments), E3 (the raw-snippet serializer can hide Field bugs), E4 (the 28 vs 29 count), E5 (a page-wide colour check cannot fail). The card forms have no unit test (residual).
- Breaking changes: PASS — no server, schema or API change. Probe DOM order is unchanged: `div > label + control + hint + error`. `cn('')` renders a bare `<div>` (no class attr), same as today's plain wrappers. All e2e selectors hold: getByLabel is a substring match and the texts are unchanged (with E1). Every `#id`/`[name=]` stays because Field passes the same id. On the employee pages, the e2e specs use getByLabel only for 'Leave type' (a dialog) and 'Employee' (on /attendance, employee-view-only.spec.ts:169). No spec selects a card field. The 43 static ids on employees/[id] are all unique (`grep -oP '\bid="[^"{]*"' | sort | uniq -c`), and the generated ids (`s1`, `s2`, …) are unique per render. Tabs are rendered with `hidden`, so the "Per period" label shows twice in the DOM on the compensation tab (loan and cash advance). No test depends on it.
- Security surface: PASS — presentation only. The server zod still does all validation (owner decision). No trust boundary, auth or data path is touched.
- Section: Field.svelte (steps 2-3): CONCERN — E1, E2, E3, E7.
- Section: employees/new adoption (steps 4-5): CONCERN — E4, E5. Everything else holds: `invalid()` stays for optionalHasError/firstErrorField, getElementById still finds the ids, and `<details open={optionalHasError}>` is untouched. rateType and basicMonthlySalary gain aria-invalid (declared in Blast Radius).
- Section: employee card adoption (step 6): CONCERN — E6 (the default size would restyle 2 compact forms), E7 (3 labels with spans), E8 (PD-6 undefined for 2 selects), E9 (stop rule). The plan holds against #23: the forms are found by action name, and #23 keeps the literal actions and the same DOM.
- Section: gates / e2e / probe / commits (steps 8-11): PASS with E10, E11 — the script names are correct, the commit messages have no AI attribution, and the owner starts the servers.
- Scope (question 5): PASS — nothing is added beyond the ask. PD-5 keeps the class strings. The only extra rendered changes are declared in Blast Radius: the gov-ID colour on employees/new, aria-describedby on hints, and aria-invalid on 2 fields. E7 adds one small prop only to keep the current markup.

Open gaps:
- employee card forms: known-gap — no unit render of the detail cards (they need the full page data). Covered by the e2e smoke on the employee pages (AC-4) and the agent probe (AC-5). Resolution D: add a card render test in the Field rollout note (step 7).

What this coverage does NOT prove:
- field.test.ts: the client-side hydration of `$props.id()` (SSR only), and the real browser accessible name (the string check stands in for it).
- employees-new-fields.test.ts: the post-submit client state after `use:enhance`/update(), and scroll-to-first-error behaviour in a browser.
- unit gates: the rendered markup of the employee card forms (no render test).
- e2e list: that the add-row labels are bound (no spec touches them), and any layout at widths other than the defaults.
- agent probe: pixel parity of the unchanged controls. It is a human judgement, not a diff.

Gate: CONDITIONAL (0 FAIL, 6 CONCERN; all have exact amendments E1-E11 above)
Accepted by: pending — first-pass CONDITIONAL. Concerns: E1 required-marker space, E2 hydration comments, E3 raw-snippet getter, E4 29 controls, E5 gov-ID colour assertion, E6 compact size for assignTemplate/uploadDocument, E7 label suffix snippet, E8 add-row label table, E9 step-1 stop rule, E10 pii.spec in e2e list, E11 #23 size bar report.

### Autonomous Goal Block

SESSION GOAL: Execute process/general-plans/active/hris-24-form-field-component_PLAN_24-09-26.md (HRIS #24 part 2: shared Field wrapper, adopted in employees/new and the employees/[id] card forms, visible labels on the loan / cash advance / allowance / deduction add-rows).
Start condition: #23, #27 and #20 are merged to staging. Branch feat/24-form-field-component off updated local staging.
Autonomy: follow the checklist steps 1-11 with the Validate Contract amendments E1-E11. Fix gates inline until green. Commit per step 11, with exact paths and no attribution.
Hard stops: the step-1 grep misses an action (E9); any e2e spec needs an edit; any server/service file in the diff; a push (owner only); starting servers (owner only).
Contract summary: CONDITIONAL, 0 FAIL. Gates: format:check, lint, check, test; field.test.ts + employees-new-fields.test.ts; e2e list (8 specs, owner-started); Playwright probe both themes 1440/390.
Execute start command: ENTER EXECUTE MODE on the plan path above, step 1.
