---
name: plan:hris-42-banner-auto-dismiss
description: "#42 — action-result banners close by themselves on the toast timer; state banners and Q1 warnings stay"
date: 24-09-26
feature: general
---

# #42 Banner auto-dismiss — PLAN (24-09-26)

TL;DR: one Svelte action `autoDismiss` (own per-banner timer, toast `DEFAULT_TIMEOUT`, pauses on
hover and focus). Banner gets an opt-in `autoDismiss` prop. Hand-rolled result blocks get
`use:autoDismiss`. State banners, Q1 warnings and login keep today's markup. A source scan pins every site.

**Date**: 24-09-26
**Status**: PLANNED — awaiting VALIDATE
**Complexity**: SIMPLE

## Overview

Issue #42: banners that report an action result stay on screen until the user navigates away. Toasts close after 6 s. This plan makes result banners close the same way and keeps state banners. Context: process/context/all-context.md → tests/all-tests.md (vitest unit + Playwright e2e).

## Acceptance Criteria

- AC1: every CLOSES site hides 6 s after it appears — proven by: auto-dismiss.test.ts a + banner-auto-dismiss Test 1; strategy: Fully-Automated.
- AC2: hover or focus inside pauses the timer, and resume keeps the remaining time — proven by: auto-dismiss.test.ts b, c, d; strategy: Fully-Automated.
- AC3: STAYS sites (state + Q1 + login) never close — proven by: auto-dismiss.test.ts e + banner-auto-dismiss Test 2; strategy: Fully-Automated.
- AC4: a new result shows again for a full 6 s — proven by: auto-dismiss.test.ts f + live probe; strategy: Fully-Automated / Agent-Probe (pending).
- AC5: no e2e regression — proven by: the at-risk e2e list; strategy: Hybrid.

## Phase Completion Rules

CODE DONE = the four CI gates are green and every negative control was seen red. VERIFIED = CODE DONE + the at-risk e2e specs are green on owner servers + the live probe passes. Post-phase testing: run the full unit suite after each area commit.

## Phase record

| Phase | Status | Note |
|---|---|---|
| RESEARCH | done | scratchpad `lane42/research-42.md` (worktree base 1e6ece7) |
| SPEC | SKIPPED | issue #42 + owner decisions O1, Q1 are the spec |
| INNOVATE | SKIPPED | owner chose O1 and Q1=O1 |
| PLAN | this file | SIMPLE (one plan, one PR) |
| VALIDATE | pending | |

Intent (Tier-0): after a submit, success/error result banners disappear after 6 s like toasts (paused
while hovered or focused), while banners that describe state or ask the user to act stay.

## Owner decisions (binding)

- O1: every banner that shows the RESULT of an action closes by itself, on all pages, toast timing, pause on hover. State banners stay.
- Q1: amber warnings that ask the user to act STAY (ChangeSalaryCard/PromoteCard `notice`, AttendanceHrGrid import summary, save-all/reset-all summary). Errors and successes close. requests/proposals amber "Proposal rejected" CLOSES.
- Orchestrator: also pause while keyboard focus is inside the banner.
- Tie rule: results close, anything the user must still act on stays.

## Plan decisions (PD-n — VALIDATE checks these)

- **PD-1 One Svelte action, `src/lib/actions/autoDismiss.ts`.** The same action serves Banner and hand-rolled blocks, so there is one mechanism and each site needs one attribute. No migration of hand-rolled blocks to Banner (that is restyling, out of scope).
- **PD-2 Banner opt-in: `autoDismiss?: boolean`, default `false`.** State banners (LoadError, stillLive, backfill, notices) need zero edits and cannot close by accident. The source scan catches a result site that forgets it.
- **PD-3 Own per-banner timer, not the toasts' shared pause.** A banner is in the page, not the toaster. Hovering the toaster must not hold a banner and the other way round. SvelteKit remounts `{#if form?.x}` blocks for each applied result (research §4), so a mount-started timer re-arms each submit.
- **PD-4 Reuse the toast timing: `export const DEFAULT_TIMEOUT = 6000` in `src/lib/stores/toast.svelte.ts`** (add `export` only). The action imports it. The number is not copied.
- **PD-5 Close = hand focus back if needed, then `node.hidden = true` AND `node.style.display = 'none'` (A2, A7).** `hidden` makes Tailwind `space-y-*` (`> :not([hidden]) ~ :not([hidden])`, tailwindcss corePlugins.js:2043) skip the node, so no stray top margin is left. Inline `display:none` beats any Tailwind display class on hand-rolled divs. Both remove the node from the accessibility tree. The node stays in the DOM until the next result or navigation remounts or removes it. Nothing is re-announced.
- **PD-6 Focus (A1, A2): the timer pauses only while focus is on a DESCENDANT of the banner, never for focus on the node itself.** `focusin(e)`: `if (e.target === node) return`; else `focused = true; stop()`. The node has `tabindex="-1"`, so only code (`scrollToError`, roles `errorEl?.focus()`) or a click can focus it, and a click is already covered by hover. So `scrollToError`/`errorEl.focus()` does NOT count as a pause, and the issue's own example (employees/[id] card error after a mouse click) closes after 6 s. Where focus goes on close: in `close()`, if `node.contains(document.activeElement)`, call `node.parentElement?.closest<HTMLElement>('[tabindex]')?.focus({ preventScroll: true })` before hiding. On settings/roles this is the Dialog panel (`tabindex="-1"`, Dialog.svelte:145-159), so focus stays in the modal. Where there is no such ancestor (employees/[id]), focus falls to `<body>`. The browser keeps the sequential focus start point at the hidden node, so the next Tab continues from there. A focused descendant (a link in a banner) still pauses the timer, so a user focused inside never loses focus.
- **PD-7 Action order: `use:autoDismiss` comes BEFORE `use:scrollToError` on the same element.** Actions run in source order. `scrollToError` calls `focus()` synchronously, so the focusin listener must already exist. The scan test enforces the order.
- **PD-8 On a `scrollToError` wrapper, the action goes on the wrapper, not the inner Banner** (employees/[id] `actionError`). Focus lands on the wrapper, and focusin does not reach a child.
- **PD-9 Roles stay unchanged.** `role="alert"`/`status` and the Banner role split do not change. No `aria-live` is added. No close button is added (none today; not asked).
- **PD-10 FormFeedback applies `autoDismiss` to `saved` and `error` only. `notice` stays** (Q1 pattern: a notice asks for action). payroll/config call sites do not change.
- **PD-11 Login `(auth)/login` STAYS.** One div shows both the action error and the load state `accountDisabled` (the user must contact HR). The tie rule says it stays. Splitting it would be a new markup change.
- **PD-12 audit-log `failureNotice` CLOSES.** Traced: `failure` comes only from `fail(400, { action: 'reveal', … })` at `reports/audit-log/+page.server.ts:139`. That is an action result.
- **PD-13 punch: the action goes on the two inner `<p>` elements** (`form?.punched`, `form?.error`), not the always-mounted `role="alert"` region. The region is persistent. The `<p>` elements remount per result. The `locationMessage` status region stays (state).
- **PD-14 Dialog errors close too** (O1 says all errors). They are results. The dialog is still open and the user can resubmit.
- **PD-15 Two local-`$state` error sites do not remount on a repeat of the same message.** A hidden node would then stay hidden. The fix is to clear the variable at submit start:
  - `settings/roles/+page.svelte`: in `setRoleGuard`'s submit function, set `saveError = ''` before the returned callback.
  - `payroll/CalculatorPanel.svelte`: change `inner: () => async (...) => {…}` to `inner: () => { error = ''; return async (...) => {…} }`.
  - NewTimesheetDialog already clears `error = ''` at submit start (:91), so it needs no change. The `$derived` from `form` sites remount by themselves.
- **PD-16 Absent-checks that use `getByRole` get `{ includeHidden: true }`.** `getByRole` skips `display:none`, so a closed banner could make `toHaveCount(0)` pass for the wrong reason. CSS locators already count hidden nodes.

## Mechanism spec — `src/lib/actions/autoDismiss.ts`

Signature: `export function autoDismiss(node: HTMLElement, enabled: boolean = true)`.
- `enabled === false` → return `{}` (no listeners, no timer).
- Local state: `remaining = DEFAULT_TIMEOUT`, `startedAt`, `handle | null`, `hovered`, `focused`.
- `start()`: return if `handle` or `hovered` or `focused`. Else set `startedAt = Date.now()` and `handle = setTimeout(close, remaining)`.
- `stop()`: return if no `handle`. Else clear it, set `handle = null`, `remaining = Math.max(0, remaining - (Date.now() - startedAt))` (same formula as toast.svelte.ts `pauseToasts`).
- `close()`: `handle = null`; if `node.contains(document.activeElement)` → `node.parentElement?.closest<HTMLElement>('[tabindex]')?.focus({ preventScroll: true })`; then `node.hidden = true`; `node.style.display = 'none'`.
- Listeners (use `addEventListener`, the same reason as Toaster `pausable`): `mouseenter` → hovered=true, stop. `mouseleave` → hovered=false, start. `focusin(e)` → if `e.target === node` return; focused=true, stop. `focusout(e)` → if `node.contains(e.relatedTarget as Node | null)` return; focused=false, start.
- Call `start()` at mount. `destroy()`: clear the timer and remove the 4 listeners.
- No new comments.

Banner.svelte: add the prop `autoDismiss: dismiss = false` (typed `autoDismiss?: boolean`). Add `use:autoDismiss={dismiss}` to the root div after `{role}`. FormFeedback.svelte: add `autoDismiss` to the `saved` Banner and the `error` Banner only.

## Site list (identify by file + content; re-scan at EXECUTE start)

R = `src/routes/(app)/`, C = `src/lib/components/`. "B" = add ` autoDismiss` as the LAST attribute of `<Banner …>` (so the prefix regexes in the pinned tests still match). "U" = add `use:autoDismiss` to the element (first `use:` if the element has `use:scrollToError`). Count = expected `autoDismiss` tokens in the file for the scan map.

### CLOSES (action results)

| Area | File | Sites (content anchor) | How | Count |
|---|---|---|---|---|
| ui | C ui/Banner.svelte | root div | mechanism | (excluded) |
| ui | C ui/FormFeedback.svelte | `saved`, `error` | B | 2 |
| dialogs | C complaints/ComplaintCreateDialog | `submitted && form?.error` | B | 1 |
| dialogs | C recruitment/JobPostingCreateDialog | form error Banner | B | 1 |
| dialogs | C separations/SeparationCreateDialog | form error Banner | B | 1 |
| dialogs | C timesheets/NewTimesheetDialog | `{#if error}` block | U | 1 |
| payroll | C payroll/CalculatorPanel | `{#if error}` block (+PD-15) | U | 1 |
| employees | C employees/detail/ChangeSalaryCard | success "Saved."; error div with scrollToError | B, U | 2 |
| employees | C employees/detail/EvalTemplateCard | success | B | 1 |
| employees | C employees/detail/PromoteCard | "Promotion recorded." | B | 1 |
| employees | C employees/detail/UpdateProfileCard | success | B | 1 |
| employees | R employees/[id]/+page.svelte | `actionError` wrapper div (PD-8); `{#if savedNotice}`; offboard `form?.saved`; offboard `form?.error` div | U, B, B, U | 4 |
| employees | R employees/new | form error div | U | 1 |
| payroll | R payroll/+page | two result divs | U | 2 |
| payroll | R payroll/[id] | result div | U | 1 |
| payroll | R payroll/periods | role=alert div | U | 1 |
| payroll | R payroll/statutory-rates | scrollToError div | U | 1 |
| payroll | R payroll/pay-codes, payroll/salary-grades | Banner | B | 1 each |
| settings | R settings/roles | `{#if saveError}` div (+PD-15) | U | 1 |
| settings | R settings/company | two Banners | B | 2 |
| settings | R settings/performance | two Banners | B | 2 |
| settings | R settings/job-boards, leave-types, offboarding, onboarding, posting-approvers | Banner | B | 1 each |
| settings | R settings/holidays | the `{#if form?.error}` WRAPPER div `flex shrink-0 flex-col gap-3` (:68-72), not the snippet div (A7) | U | 1 |
| settings | R settings/org | result div | U | 1 |
| settings | R settings/schedules | result div; `<p role="status">` | U | 2 |
| people | R branches, inventory, performance/reviews/[id] | Banner | B | 1 each |
| people | R departments, benefits | result div | U | 1 each |
| people | R inquiries | the result WRAPPER div `flex shrink-0 flex-col gap-3` (:95-99) that holds the Banner + error div (A7) | U | 1 |
| people | R inquiries/[id] | Banner + error div | B, U | 2 |
| people | R profile | success Banner; `form?.error` div | B, U | 2 |
| people | R recruitment/+page | success div; error div | U | 2 |
| people | R recruitment/[id] | action Banner (NOT stillLive) | B | 1 |
| people | R recruitment/[id]/apply, recruitment/applicant/[applicantId] | result div | U | 1 each |
| people | R performance/templates, performance/templates/[id] | `{#if formError}` div (NOT backfill/structureError/openReviewCount) | U | 1 each |
| requests | R requests/[id] | two result Banners (NOT actBlockedReason) | B | 2 |
| requests | R requests/proposals | the result WRAPPER div `flex shrink-0 flex-col gap-3` (:103-107) that holds the error div + warning/success Banner (A7) | U | 1 |
| requests | R separations/[id] | result Banner; `form?.undone`; `form?.finalized` (NOT partiallyRestored) | B | 3 |
| time | R dashboard | Banner; `giveAward` `<p>`; `postAnnouncement` `<p>` | B, U, U | 3 |
| time | R timesheets | two Banners (per Banner; the wrapper also holds HR-admin content, so it stays; named residual: an empty wrapper gap on the non-admin view) | B | 2 |
| time | C attendance/AttendanceHrGrid | `form?.importError` div (before scrollToError); `form?.imported` `role="status"` div (~:543) gets `use:autoDismiss={res.rejected.length === 0}` (A3: only the summary WITH rejected rows stays) | U, U | 2 |
| time | R punch | `form?.punched` `<p>`; `form?.error` `<p>` (PD-13) | U | 2 |
| time | R reports/audit-log | the `{#if failure}` WRAPPER div (:133-137), not the snippet div (PD-12, A7) | U | 1 |

### STAYS (no autoDismiss — scan asserts)

LoadError.svelte and its 3 users; FormFeedback `notice`; ChangeSalaryCard `notice`; PromoteCard `notice`; AttendanceHrGrid `form?.imported` summary ONLY when `res.rejected.length > 0` (enforced by the `{res.rejected.length === 0}` param, A3) and the save-all/reset-all summary; `(auth)/login` (PD-11); performance templateBackfill; performance/templates backfillCount; templates/[id] structureError, openReviewCount; recruitment/[id] stillLive; requests notice; requests/[id] actBlockedReason; separations/[id] partiallyRestored; settings/backup neverRan + row.error; `src/routes/+error.svelte`; punch location status region; Field/FileInput/RatingScaleEditor/SignatoryOrderEditor per-field text.

## Implementation Checklist

Section A — mechanism (commit 1)
1. Re-scan: run the 4 research grep commands (research §3) plus `grep -rn "autoDismiss" src`. Diff the results against the site list. Record any drift in the Resume section before editing.
2. RED: create `tests/unit/auto-dismiss.test.ts` (vitest, node env, `vi.useFakeTimers()`). Fake node = `Object.assign(new EventTarget(), { style: { display: '' }, hidden: false, parentElement: null, contains: (n) => n === inner })`. Dispatch focusout as `Object.assign(new Event('focusout'), { relatedTarget })`. Set a child target with `Object.defineProperty(ev, 'target', { value: inner })`. Case a also checks `hidden === true`. Cases:
   a. The node is still shown at `DEFAULT_TIMEOUT - 1` and `display === 'none'` at `DEFAULT_TIMEOUT`.
   b. mouseenter at 2000 → advance 60 000 → still shown. mouseleave → still shown at +3999, closed at +4000 (remaining time is kept).
   c. focusin with a child target → advance 60 000 → shown. focusout with relatedTarget = inner → advance 60 000 → shown. focusout with relatedTarget null → closes after the remaining time.
   c1. focusin dispatched on the node itself (target = node, as `scrollToError` does) → closes at `DEFAULT_TIMEOUT` (A1).
   c2. focusin with a child target (`Object.defineProperty(ev, 'target', { value: inner })`) → pauses.
   i. focus handoff: `vi.stubGlobal('document', { activeElement: node })`; the fake `contains` returns true for `node`; the fake `parentElement.closest` returns a panel with a `focus` spy → at timeout the spy is called with `{ preventScroll: true }`, then `hidden === true` and `display === 'none'` (A2).
   d. focused and hovered, then mouseleave → still paused (it needs both released).
   e. `autoDismiss(node, false)` → advance 60 000 → shown (state banners never close).
   f. Re-arm: the first node closes. A new node mounted after it (a new result) gets a full `DEFAULT_TIMEOUT`.
   g. `destroy()` before timeout → advance → display unchanged.
   h. It imports `DEFAULT_TIMEOUT` from the toast store, and the value is 6000.
   Run `bun run test -- tests/unit/auto-dismiss.test.ts` → red (the module is missing). Record why.
3. `src/lib/stores/toast.svelte.ts`: `const DEFAULT_TIMEOUT` → `export const DEFAULT_TIMEOUT`.
4. Create `src/lib/actions/autoDismiss.ts` per the Mechanism spec. Step-2 tests go green. Negative controls (each: apply, run, see the named case red for the stated reason, revert): (0) `close()` no-op → a, b, c, f red; (i) ignore `enabled` → e red; (ii) `destroy` does not clear the timer → g red; (iii) `mouseleave` restarts while focused → d red; (iv) ignore `relatedTarget` in focusout → c red; (v) old PD-6 (pause on every focusin, incl. `e.target === node`) → c1 red. Control (v) is the right-reason proof of the PD-6 fix.

Section B — Banner + FormFeedback + scan test (commit 2)
5. RED: create `tests/unit/banner-auto-dismiss.test.ts` (source scan, `fs.readFileSync`, same style as success-surfaces.test.ts):
   - `EXPECTED: Record<string, number>` = file → count of `/\bautoDismiss\b/g` in the file, not counting `import` lines. Banner.svelte and the action file are excluded.
   - Test 1: every `.svelte` file under `src` that contains `autoDismiss` is in EXPECTED with the exact count, and every EXPECTED file matches (catches missing and extra sites).
   - Test 2: STAYS anchors — `[file, anchor]`. The slice runs from the anchor to the FIRST `{:`, `{/if}` or `{/snippet}` (so `{:else if}` success/error branches are not in a notice slice) and contains no `autoDismiss`. Assert `indexOf(anchor) > -1` for every anchor, so a renamed anchor fails instead of passing. Use anchors: `LoadError.svelte`: whole file; `FormFeedback.svelte` `mine?.notice`; ChangeSalaryCard / PromoteCard `notice`; AttendanceHrGrid save-all summary anchor (the import summary is pinned instead: Test 5); login `form?.error || data.accountDisabled`; recruitment/[id] `stillLive`; templates/[id] `structureError`, `openReviewCount`; templates `backfillCount`; performance `templateBackfill`; requests `notice`; requests/[id] `actBlockedReason`; separations/[id] `partiallyRestored`; backup `neverRan`.
   - Test 3 (PD-7, A5): across `src`, the count of `/use:scrollToError[^>]*use:autoDismiss/g` is 0, AND the count of `/use:autoDismiss[^>]*use:scrollToError/g` is an exact number, `BOTH_ACTIONS` (0 after commit 2; it grows per area commit; final 4: employees/[id], ChangeSalaryCard, statutory-rates, AttendanceHrGrid). Login stays 0.
   - Test 5 (A3): AttendanceHrGrid.svelte contains `use:autoDismiss={res.rejected.length === 0}` (added with commit 7; the test lands in that commit).
   - Test 4: Banner.svelte contains `autoDismiss: dismiss = false` and `use:autoDismiss={dismiss}`.
   Start with EXPECTED containing only FormFeedback: 2 → red.
6. Banner.svelte + FormFeedback.svelte edits (Mechanism spec). Scan green. Negative controls: (i) remove one FormFeedback `autoDismiss` → Test 1 red; (ii) add `autoDismiss` to the notice Banner → Test 1 and Test 2 red; (iii) default `= true` → Test 4 red. Revert each.
7. Gates (see Verification): format:check, lint, check, test. Red-first tests are committed only in the commit that makes them green (owner rule: commit on green only).

Sections C–G — one commit per area. Each commit: edit the files in the area rows, add their counts to EXPECTED, update the pinned tests, and run the gates.
8. Success-surfaces pins, per area commit: :85, :101, :118, :135, :293 get ` autoDismiss` before `/>`; :305 becomes `<Banner kind="success" autoDismiss>`.
8a. C employees: ChangeSalaryCard, EvalTemplateCard, PromoteCard, UpdateProfileCard, employees/[id], employees/new. Update `tests/unit/success-surfaces.test.ts` pins at :85, :101, :118, :135 (and any other pin the re-scan shows on these files): append ` autoDismiss` before `/>`. Check `employee-offboard-feedback.test.ts` :47-76. Its regex is a prefix `<Banner kind="success"`, so expect no change; if it goes red, append `[^>]*` only. `employee-detail-error-slots.test.ts` should not change. `a11y-invariants.test.ts` :177-187 `toContain('use:scrollToError')` stays true.
9. D payroll: CalculatorPanel (+PD-15), payroll/+page, [id], periods, statutory-rates, pay-codes, salary-grades. `payroll-config-form.test.ts` should not change (PD-10).
10. E settings: roles (+PD-15), company, performance, job-boards, leave-types, offboarding, onboarding, posting-approvers, holidays, org, schedules. a11y-invariants `errorEl?.focus()` pin stays.
11. F people/requests: dialogs (Complaint, JobPosting, Separation, NewTimesheet), branches, inventory, departments, benefits, inquiries, inquiries/[id], profile, recruitment, recruitment/[id], apply, applicant, performance/reviews/[id], performance/templates, templates/[id], requests/[id], requests/proposals, separations/[id]. Update success-surfaces pins :293, :305 (separations) and any others the re-scan shows.
12. G time: dashboard, timesheets, AttendanceHrGrid (importError + import summary with the `res.rejected.length === 0` param), punch, audit-log (wrapper). Add Test 5. Before editing the e2e file, run form-errors :90 and :218 on unedited code as a baseline and record the result. Then edit `tests/e2e/form-errors.spec.ts:90` and `:218`: `getByRole('alert', { includeHidden: true })` (PD-16).
12a. A8 committed e2e `tests/e2e/banner-auto-dismiss.spec.ts` (Hybrid; runs in CI; local run needs owner servers), in commit 7. Use `page.clock.install()` before `goto`. Case 1 benefits failing submit: alert visible; `clock.runFor(5999)` visible; hover + `runFor(60000)` visible; move the mouse away + `runFor(6000)` → `getByRole('alert')` count 0 and `{ includeHidden: true }` count 1; submit again → visible (re-arm). Case 2 employees/[id] card error submitted by MOUSE click (the issue's example; scrollToError focuses the wrapper) → visible, then `runFor(6000)` → hidden. Write the locators during EXECUTE; see each assertion fail first (e.g. with the action removed) before accepting it.
13. Final: re-run the step-1 greps. Every hit is either in the CLOSES table with its count or in STAYS. Record in the Resume section.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| auto-dismiss.test.ts a (closes at timeout) | Fully-Automated | O1 same timing as toasts |
| auto-dismiss.test.ts b, d (hover pause, remaining time) | Fully-Automated | O1 pause on hover |
| auto-dismiss.test.ts c (focus pause, relatedTarget) | Fully-Automated | orchestrator focus pause; PD-6 no stranded focus |
| auto-dismiss.test.ts e (disabled never closes) | Fully-Automated | O1 state banners stay |
| auto-dismiss.test.ts f (re-arm per new node) | Fully-Automated | O1 each result gets full time |
| auto-dismiss.test.ts h (shared constant) | Fully-Automated | PD-4 |
| banner-auto-dismiss.test.ts Test 1 (+negative controls) | Fully-Automated | O1 all result sites, no extra |
| banner-auto-dismiss.test.ts Test 2 | Fully-Automated | Q1 warnings + state stay |
| banner-auto-dismiss.test.ts Test 3 (exact count), 4, 5 | Fully-Automated | PD-7, PD-2, Q1 import summary |
| auto-dismiss.test.ts c1 + control (v) | Fully-Automated | PD-6: scrollToError focus does not pause |
| auto-dismiss.test.ts c2, i | Fully-Automated | PD-6 descendant pause; focus handoff on close |
| tests/e2e/banner-auto-dismiss.spec.ts (A8), owner servers / CI | Hybrid | O1 live remount re-arm + issue's mouse-click case |
| e2e at-risk specs (below), owner servers up | Hybrid | no regression of present/absent asserts |
| Residuals: timesheets non-admin empty wrapper gap; punch empty status line after the error `<p>` closes | Known-Gap residual (named, not a proving strategy) | — |

Gates in CI order (package.json): `bun run format:check` → `bun run lint` → `bun run check` → `bun run test`. E2E (owner starts servers; EXECUTE must not): `bun run test:e2e -- banner-auto-dismiss form-errors separations attendance-csv-import timesheet-punch-location auth attendance-display-matches-stored attendance-hr-grid attendance-save-timesheet-custom-range backup-settings tenancy-switch timesheet-create-for-employee admin`.

E2E at-risk list and why each stays meaningful:
- Present-after-action (form-errors :33,:60; separations :189,:254,:297; timesheet-punch-location :103,:118,:173; attendance-csv-import :144): each asserts right after the action. The 6 s timer is longer than the 5 s default expect wait, and hidden nodes still match `toContainText`/text asserts on the region. If one goes red, it is a real slow path: diagnose, do not raise timeouts blindly.
- attendance-csv-import :97,:118 (`[role=status]` summary) and :145 (`toHaveCount(0)`): a clean import summary now closes (A3), but these asserts run right after the import, and CSS locators and textContent read hidden nodes. No change.
- auth.spec :19: login STAYS (PD-11). No change.
- Unconfirmed (attendance-display-matches-stored :109,129,172; attendance-hr-grid :380; attendance-save-timesheet-custom-range :100; backup-settings :27,46,63; tenancy-switch :73; timesheet-create-for-employee :202; admin :132): at step 1 check whether each asserts a banner or a toast. Toasts do not change. For banners, the assertion must come directly after the action.
- Absent-checks form-errors :90, :218: add `includeHidden: true` (PD-16) so a closed banner still counts.

## Touchpoints

New: `src/lib/actions/autoDismiss.ts`, `tests/unit/auto-dismiss.test.ts`, `tests/unit/banner-auto-dismiss.test.ts`, `tests/e2e/banner-auto-dismiss.spec.ts`. Edited: `src/lib/stores/toast.svelte.ts` (one `export`), Banner.svelte, FormFeedback.svelte, the CLOSES files above (≈55), `tests/unit/success-surfaces.test.ts`, `tests/e2e/form-errors.spec.ts`, and conditionally `tests/unit/employee-offboard-feedback.test.ts`. Read-only: Toaster.svelte, scrollToError.ts, submit-feedback.svelte.ts.

## Public Contracts

- `DEFAULT_TIMEOUT` becomes an export of the toast store (value unchanged).
- New action `autoDismiss(node, enabled = true)`.
- New Banner prop `autoDismiss?: boolean` (default false; existing callers unchanged).
- No server, schema, or API changes.

## Blast Radius

About 58 source files, all UI templates. Two script-level changes: PD-15 (roles, CalculatorPanel). Risk class: UI / a11y only (no auth, billing or schema). Main risks: (1) a result that hides for good on a repeat with the same text (PD-15 covers the local-state sites; `form`-driven sites remount); (2) e2e timing (list above); (3) focus loss (PD-6/7).

## Parallel lanes (optional)

After commits 1–2 land, lanes C–G own disjoint file sets as listed. Shared files that only the orchestrator edits, one lane at a time or merged at the end: `tests/unit/banner-auto-dismiss.test.ts` EXPECTED map and `tests/unit/success-surfaces.test.ts`. No lane may touch Banner.svelte, FormFeedback.svelte, autoDismiss.ts, or toast.svelte.ts. Recommendation: run sequentially. The edits are one-attribute changes, and the shared test map makes parallel merges cost more than they save.

## Git

Branch `fix/42-banner-auto-dismiss` (stacked on `feat/24-form-field-component`). PR base `feat/24-form-field-component`. Commit only when green. No push until the owner says so. No AI trailers. Commits:
1. `feat(ui): add an autoDismiss action on the toast timer`
2. `feat(ui): let Banner and FormFeedback close action results by themselves`
3. `fix(employees): close action-result banners after the toast timeout`
4. `fix(payroll): close action-result banners after the toast timeout`
5. `fix(settings): close action-result banners after the toast timeout`
6. `fix(ui): close action-result banners on people, recruitment and request pages`
7. `fix(ui): close action-result banners on time, dashboard and audit pages` (includes the A8 e2e spec and Test 5)

## Rollback

Each area commit reverts on its own. Reverting commit 2 disables Banner opt-in; hand-rolled sites keep working (action only).

## Test Infra Improvement Notes

- Vitest runs in the `node` environment and has no DOM. The action tests use an `EventTarget` fake node. Real remount re-arm is proven only by the live probe.
- playwright.config.ts sets no `expect.timeout` (default 5 s), which is below the 6 s dismiss. Keep assertions directly after actions.

## Resume and Execution Handoff

1. Selected plan: `/home/hyuse/Desktop/VeentApps/hris-wt/42/process/general-plans/active/hris-42-banner-auto-dismiss_PLAN_24-09-26.md`
2. Last completed step: PLAN supplemented with VALIDATE amendments A1-A8 (24-09-26). Nothing executed.
3. Validate-contract: BLOCKED (first run); A1-A8 are now in the plan body; VALIDATE re-runs from V1.
4. Context loaded: scratchpad `plan/PLAN-BRIEF.md`, `lane42/research-42.md`; source at worktree HEAD 1e6ece7.
5. Next: VALIDATE this plan. Then EXECUTE starts at step 1 (re-scan) in `/home/hyuse/Desktop/VeentApps/hris-wt/42`. It adds the `[PONYTAIL]` directive to the execute prompt.

## Validate Contract

Status: CONDITIONAL
Date: 24-09-26
date: 2026-09-24
generated-by: outer-pvl
supersedes: 2026-09-24 (outer-pvl, pass 1, BLOCKED on F1/PD-6) — outer PVL pass 2 has current evidence after 1 validate-fix loop
Pass: 2 (after 1 validate-fix loop)

Parallel strategy: sequential
Rationale: 1/7 signals (S7: ~58 files). One shared scan map + one shared pin file; the plan's lane note already says sequential.

Net gate: CONDITIONAL. 0 FAILs. All pass-1 amendments A1-A8 are in the body and correct. Pass 2 found 3 new CONCERNs, all of them execute-agent instructions (E1-E3), plus 2 low notes. None needs an owner decision.

### Pass-1 amendments — verified in the body

- A1/A2 (F1): PASS. PD-6 (:61) and the Mechanism spec (:83-84): `focusin` returns when `e.target === node`, so scrollToError's focus (scrollToError.ts:26) and roles `errorEl?.focus()` (:62) no longer pause. `close()` hands focus to `parentElement?.closest('[tabindex]')` (Dialog panel `tabindex="-1"`, Dialog.svelte:145-159) or leaves it on body. Unit cases c1, c2, i (:153-155) and control (v) (:163) prove it for the right reason. The e2e case 2 (:184) is the issue's own mouse-click example.
- A3 (Q1 import summary): PASS. `use:autoDismiss={res.rejected.length === 0}` on the `form?.imported` div (:137). `res` is the block's `{@const}` (AttendanceHrGrid.svelte:532), so it is in scope. STAYS text updated (:143). Test 5 pins it (:171).
- A4 (Test 2): PASS. The slice ends at the first `{:`, `{/if}` or `{/snippet}`, every anchor is asserted found, and FormFeedback uses `mine?.notice` (:169). The card anchors `notice` first appear at ChangeSalaryCard:56 and PromoteCard:66, and requests `notice` at :67, so the slices start at the right place.
- A5 (Test 3): PASS. Exact `BOTH_ACTIONS` count (:170). Per commit: 0 after commit 2, 2 after commit 3 (employees/[id], ChangeSalaryCard), 3 after commit 4 (statutory-rates), 4 after commit 7 (AttendanceHrGrid). `[^>]*` cannot cross tags; none of the four tags holds a `>`.
- A6: PASS. Controls (0), (i)-(v) (:163).
- A7: PASS. `hidden = true` + `display:none` (PD-5 :60). Wrapper placement for holidays, inquiries, proposals, audit-log (:120, :125, :133, :139). timesheets is a named residual (:136).
- A8: PASS in intent, but see N2 for how to make it reliable.

### New findings (pass 2)

- **N1 CONCERN — unit tests crash before they can prove anything.** `close()` now reads `document.activeElement` (:83). Vitest runs `environment: 'node'` (vitest.config.ts), where `document` is undefined. Only case i stubs it (:155). So cases a, b, c, c1, f throw `ReferenceError: document is not defined` inside the fake timer, instead of passing or failing on behaviour. **E1:** in `auto-dismiss.test.ts`, add `beforeEach(() => vi.stubGlobal('document', { activeElement: null }))` and `afterEach(() => vi.unstubAllGlobals())`. Case i overrides it. Make sure every negative control reddens with an assertion failure, not a ReferenceError.
- **N2 CONCERN — the A8 e2e boundary asserts are flaky as written.** Playwright's `clock.install()` lets time FLOW until `pauseAt` is called (node_modules/playwright-core/types/types.d.ts:18512-18522). Real time between banner mount and `runFor(5999)` counts against the timer, so "visible at 5999" can fail at random. Also, after a mouse click, scrollToError scrolls the banner to the viewport centre, and Chrome re-hit-tests the resting pointer after scrolling. If the pointer lands on the banner, `mouseenter` pauses it, which makes case 2 flaky. **E2:**
  - `clock.install({ time: T0 })` before login/goto. After hydration (the form-errors `toPass` pattern) and BEFORE the submit, call `clock.pauseAt(T0 + 1h)`. The clock is then frozen, so `runFor(5999)` visible and `runFor(1)` hidden are exact.
  - Case 2: call `page.mouse.move(0, 0)` right after the banner is visible, then `runFor(6000)` shows it hidden.
  - Case 2 data: force the failure the way form-errors.spec.ts:26-29 does (strip `required`, submit empty) on one employees/[id] card form of a CI-seeded employee. Nothing is written, so no cleanup is needed.
  - See each assertion fail first with `use:autoDismiss` removed.
- **N3 CONCERN (low) — the focus handoff re-arms a dead timer.** In `close()`, `handle = null`, then `panel.focus()` synchronously fires `focusout` on the node (relatedTarget = panel, outside), which calls `start()`. That sets a new 6 s timer on a node that is about to be hidden. It is harmless (the second `close()` only re-hides, and `destroy` clears it) but sloppy. **E3:** `start()` also returns when `node.hidden`, and case i asserts no pending timer after close (`vi.getTimerCount() === 0`).
- **Note (low) — text drift, no behaviour impact.** Owner-decision Q1 (:50) still says "AttendanceHrGrid import summary" without "with rejected rows". AC4 (:27) still says Agent-Probe (pending), and the Test Infra note (:251) says re-arm is proven "only by the live probe". Both are now the A8 e2e. PD-7's rationale (:62) ("the focusin listener must already exist") is obsolete after A1; the rule itself is harmless. Fix these at UPDATE PROCESS or in the PR body, not a blocker.
- **Residual (named) — resting pointer.** Real users see the same thing N2 describes: a pointer that ends up resting on a scrolled-in banner pauses it until the mouse moves. That is the owner's hover rule working, not a defect. Recorded with the timesheets wrapper gap and the punch empty status line.
- **Checked, no defect — `hidden = true` vs remount.** Each applied result sets `form` to null and then to the new object (kit client.js:2607-2616), so the next result builds a NEW node without `hidden`. The hidden node is removed. Local-state sites clear at submit start (PD-15). A same-`form` re-render (invalidateAll) keeps the old node hidden, which is correct. The wrapper sites (A7) remount the same way.

### Findings carried from pass 1 (still PASS)

PD-5 remount path, coverage (60 grep hits, no missing site; flash is a toast), PD-16 semantics (form-errors :90/:218 become stricter and stay correct; baseline run is in step 12), e2e race (no present-after-action assert sits more than 6 s after its result), pinned tests (success-surfaces :85/:101/:118/:135/:293/:305 updates at step 8; offboard, payroll-config, error-slots, a11y, surface-background-scan unchanged), gates (ci.yml:38-47 order), git (branch at #41 head 1e6ece7, base feat/24-form-field-component, no AI trailers). Open PR #39 overlaps toast.svelte.ts (a different line), recruitment/[id], applicant and proposals: low conflict risk.

Dimension findings:
- Infra fit: PASS — UI-only; SvelteKit 2.69.2 remount path verified in source.
- Test coverage: CONCERN — N1 (document stub), N2 (clock flow + pointer) — both fixed by E1/E2.
- Breaking changes: PASS — opt-in prop default false; `DEFAULT_TIMEOUT` export only; pins updated per commit.
- Security surface: PASS — no auth/billing/schema/trust boundary; roles unchanged.
- Plan decisions PD-1..PD-16: PASS — PD-6 fixed; PD-5 `hidden` verified against remount; PD-7 rationale stale (note).
- Site list: PASS — A3 and A7 applied.
- Implementation checklist / tests: CONCERN — N1, N2, N3 as execute instructions.

### Test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | result banner hides 6 s after mount (`hidden` + `display:none`) | Fully-Automated | tests/unit/auto-dismiss.test.ts a (+E1 stub) | B |
| AC1/F1 | focus on the node itself (scrollToError) does not pause | Fully-Automated | auto-dismiss.test.ts c1 + control (v) | B |
| AC2 | hover pauses; resume keeps the remaining time | Fully-Automated | auto-dismiss.test.ts b, d + control (iii) | B |
| AC2 | descendant focus pauses; relatedTarget inside keeps it | Fully-Automated | auto-dismiss.test.ts c, c2 + control (iv) | B |
| F1 | focused node hands focus to nearest `[tabindex]` ancestor; no timer left | Fully-Automated | auto-dismiss.test.ts i (+E3) | B |
| AC3 | disabled / STAYS never close | Fully-Automated | auto-dismiss.test.ts e + control (i); banner-auto-dismiss.test.ts Test 1, 2 | B |
| AC4 | new node gets a full timeout; destroy clears | Fully-Automated | auto-dismiss.test.ts f, g + control (ii) | B |
| PD-4 | shared constant 6000 | Fully-Automated | auto-dismiss.test.ts h | B |
| PD-7 | autoDismiss before scrollToError, exact count per commit | Fully-Automated | banner-auto-dismiss.test.ts Test 3 | B |
| Q1 | clean import summary closes, rejected-rows summary stays | Fully-Automated | banner-auto-dismiss.test.ts Test 5 | B |
| AC4/F1 live | remount re-arm; mouse-click employee card error closes | Hybrid | tests/e2e/banner-auto-dismiss.spec.ts (+E2), CI e2e job or owner servers | B |
| AC5 | no e2e regression | Hybrid | `bun run test:e2e -- banner-auto-dismiss form-errors separations attendance-csv-import timesheet-punch-location auth attendance-display-matches-stored attendance-hr-grid attendance-save-timesheet-custom-range backup-settings tenancy-switch timesheet-create-for-employee admin` | A |
| residual | timesheets non-admin wrapper gap; punch empty status line; resting pointer pauses | Known-Gap residual | — | D |

Failing stubs (unit rows):
test("should hide the node at DEFAULT_TIMEOUT and not before", () => { throw new Error("NOT IMPLEMENTED — TDD stub: closes at timeout") })
test("should not pause when focus lands on the node itself", () => { throw new Error("NOT IMPLEMENTED — TDD stub: programmatic focus does not pause") })
test("should pause while a descendant holds focus", () => { throw new Error("NOT IMPLEMENTED — TDD stub: descendant focus pauses") })
test("should hand focus to the nearest tabindex ancestor on close and leave no timer", () => { throw new Error("NOT IMPLEMENTED — TDD stub: focus handoff") })
test("should keep STAYS anchors free of autoDismiss up to the first {: or {/", () => { throw new Error("NOT IMPLEMENTED — TDD stub: STAYS anchors") })
test("should count exactly BOTH_ACTIONS autoDismiss-before-scrollToError tags", () => { throw new Error("NOT IMPLEMENTED — TDD stub: Test 3 count") })
test("should pin the import summary param res.rejected.length === 0", () => { throw new Error("NOT IMPLEMENTED — TDD stub: Test 5") })

Legacy line form:
- mechanism: Fully-automated: bun run test -- tests/unit/auto-dismiss.test.ts
- sites: Fully-automated: bun run test -- tests/unit/banner-auto-dismiss.test.ts tests/unit/success-surfaces.test.ts
- live: hybrid: bun run test:e2e -- banner-auto-dismiss form-errors (CI or owner servers)

What this coverage does NOT prove:
- Unit tests use a fake EventTarget and a stubbed `document`. They do not prove Svelte mounts the action, real focus/blur order, or the browser's focus fix-up.
- The source scan proves attributes co-occur in text. It does not prove a site renders or closes on screen.
- The A8 e2e covers two sites (benefits, one employee card). The other ~55 sites rely on the scan plus the shared action.
- The regression run proves no present/absent assert broke. Only A8 proves a banner actually closes.
- Nothing proves 6 s is enough for slow screen-reader users. The owner chose toast timing.

Execute-agent instructions:
- E1: stub `document` in beforeEach for every auto-dismiss.test.ts case (N1). Trigger: step 2.
- E2: `clock.install` before navigation, `clock.pauseAt` after hydration and before submit; `mouse.move(0,0)` after the case-2 banner shows; force the case-2 failure by stripping `required` on a seeded employee's card form (N2). Trigger: step 12a.
- E3: `start()` returns when `node.hidden`; case i asserts `vi.getTimerCount() === 0` after close (N3). Trigger: step 4.

Open gaps: none blocking. Named residuals: timesheets non-admin wrapper gap; punch empty status line after the error `<p>` closes; a resting pointer over a scrolled-in banner pauses it (owner hover rule).
Gate: CONDITIONAL (0 FAILs; N1-N3 carried as execute instructions E1-E3; 1 validate-fix loop recorded)
Accepted by: session (autonomous, outer-PVL pass 2 for the orchestrator) — accepted concerns: N1 document stub (E1), N2 e2e clock/pointer reliability (E2), N3 re-armed timer after handoff (E3), text drift note. The owner has not seen this; the orchestrator relays it.

### Autonomous Goal Block

(Written inside this section, not as its own `##` heading, because the caller limited writes to the validate-contract section. No umbrella plan exists: BRANCH A.)

SESSION GOAL: Ship HRIS #42. Action-result banners close after the toast DEFAULT_TIMEOUT (6000 ms). The timer pauses on hover and on focus inside the banner, but not on scrollToError's own focus. State banners, Q1 warnings and rejected-row import summaries stay. Plan: /home/hyuse/Desktop/VeentApps/hris-wt/42/process/general-plans/active/hris-42-banner-auto-dismiss_PLAN_24-09-26.md
Next phase: EXECUTE from Implementation Checklist step 1 (re-scan) in /home/hyuse/Desktop/VeentApps/hris-wt/42, applying E1-E3.
Autonomy: edit only the plan's files. Commit per area when the 4 gates are green (format:check, lint, check, test). No AI trailers. Add the [PONYTAIL] directive to execute prompts. No new comments.
Hard stops: no push; no servers (the owner starts them; e2e runs in CI or on owner servers); no .env edits; never `git add -A`; stop if any negative control fails to go red for the stated reason.
Contract summary: CONDITIONAL, 0 FAILs; E1 document stub, E2 e2e clock pause + pointer move, E3 no timer after close.
Execute start: "ENTER EXECUTE MODE — plan above, start at Implementation Checklist step 1 (re-scan), apply validate-contract E1-E3."
