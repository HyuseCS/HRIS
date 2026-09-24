---
name: plan:hris-27-semantic-colour-tokens
description: "Issue #27 — wire --success/--warning tokens, form-tier affirmative/warning/destructive button classes, symmetric row classes, migrate solid-fill buttons, ReasonDialog tone prop, amber 'warning' toast kind for rejections/returns"
date: 24-09-26
feature: general
---

# #27 Semantic colour through tokens — PLAN (SIMPLE)

**Date**: 24-09-26
**Status**: CODE DONE — G10 screenshots (both themes) and e2e pending
**Complexity**: SIMPLE

**TL;DR:** Wire `--success`/`--warning` into Tailwind and `.dark`, add `.btn-success`/`.btn-warning` and make `.btn-destructive` solid, give the row classes a matching resting fill, move 16 solid-fill lines (15 buttons) in 7 files onto these classes (ReasonDialog through `tone`), swap ReasonDialog's `confirmClass` for `tone`, and add an amber `warning` toast. The server picks it by returning `kind: 'warning'`. Branch `fix/27-semantic-colour-tokens`, one PR to `staging`.

## Phase record

| Phase | Status | Note |
|---|---|---|
| SPEC | SKIPPED | Issue #27 body + owner decisions D4 and round-2 (CONTEXT.md) are the spec |
| INNOVATE | SKIPPED | Owner chose the approach (D4 tokens; amber warning toast kind) |
| RESEARCH | DONE | research-27.md, re-verified against staging d773e1a on 24-09-26 |
| PLAN | DONE (this file) | |
| VALIDATE | pending | |

Intent restatement: make semantic colour (success / warning / destructive) go through CSS tokens for buttons and toasts, move the hand-rolled solid-fill buttons onto classes, and show rejections, send-backs and returns as amber warning toasts. Wave 2, next to #23. Do not touch `src/routes/(app)/employees/[id]/*`.

## Overview / Goals / Scope

SPEC criteria. These are the issue's Scope list plus owner decisions:

- **C1** `--success`, `--success-foreground`, `--warning`, `--warning-foreground` exist in `:root` AND `.dark`. They map in `tailwind.config.ts` as `{DEFAULT, foreground}`, the same shape as `destructive`. Text on each fill is 4.5:1 or more in both themes.
- **C2** The form tier has an affirmative class `.btn-success` with the same metrics as `.btn-primary`. The row family is symmetric: every coloured row class has a resting `/10` fill and a `/20` hover. The override at `recruitment/[id]/+page.svelte:268` is removed.
- **C3** No solid `bg-(green|red|orange)-NNN … text-white` button remains in `src/`, except the deferred `employees/[id]/+page.svelte`.
- **C4** ReasonDialog exposes `tone?: 'destructive' | 'warning'`. `confirmClass` is gone. The 4 callers are updated.
- **C5** `ToastKind` and `FlashKind` include `'warning'`. `takeFlash` keeps `'warning'`. Toaster paints warning in a solid amber from tokens. `submitFeedback` emits `warning` when the action data carries `kind: 'warning'`. Every rejection, send-back and return site in the inventory uses this.
- **Out of scope:** Badge / Banner classes (not needed for C1-C5; Banner already has a `warning` kind). Raw `text-*` / tinted `bg-*/NN` colours elsewhere (research §8: 261 + 105 + 53 hits). Non-button hits (dashboard dots, progress bar, payroll step circles). Container surfaces (#20, Wave 3).

## Owner decisions honoured

- D4: tokens. Round 2: rejections, send-backs and returns get a NEW amber `warning` toast kind.

## Plan decisions (PD) — VALIDATE must check these

- **PD-1 Token values.** Set `--success: 142 72% 29%` in `:root` (it changes from `142 71% 45%`, which gives 2.30:1 with white text and fails) and in `.dark` (the same value). `--success-foreground: 0 0% 100%` in both. `--warning: 38 92% 50%` and `--warning-foreground: 0 0% 10%` stay as they are and are copied into `.dark`. Measured: success/white = 5.08:1, warning/10% = 8.16:1, destructive/white = 4.93:1. Reason: these are fill tokens (text on a solid fill). One value clears 4.5:1 in both themes, so the `.dark` values can be the same.
- **PD-2 The row classes keep raw Tailwind hues, with the light text steps raised to the `.badge-*` steps (A1).** Reason (one line): a single fill token cannot also be readable as text on both the light card and the dark background, so the rows keep their tuned `dark:` steps. Symmetry: `.btn-row-positive` gets `bg-green-600/10 hover:bg-green-600/20`, `.btn-row-warning` gets `bg-yellow-600/10 hover:bg-yellow-600/20`. Light text: positive `text-green-600` → `text-green-800`, warning `text-yellow-600` → `text-yellow-800`, danger `text-red-600` → `text-red-700`. Every `dark:` step is kept. Measured on card: 6.19 / 6.03 / 5.37 at rest, 5.54 / 5.47 / 4.58 at the /20 hover.
- **PD-3 Form tier.** Add `.btn-success` (`btn h-9 px-4 bg-success text-success-foreground hover:bg-success/90`) and `.btn-warning` (`btn h-9 px-4 bg-warning text-warning-foreground hover:bg-warning/90`). Change `.btn-destructive` to `btn h-9 px-4 bg-destructive text-destructive-foreground hover:bg-destructive/90`. Reason: today's `.btn-destructive` is a tint with raw `text-red-400` and has 0 users outside app.css (research §1). Solid-destructive is the look that ConfirmDialog already ships (`ConfirmDialog.svelte:50`).
- **PD-4 Row-size solid buttons become the row classes** (`btn-row-positive` / `btn-row-warning` / `btn-row-danger` + `flex-1`). They do not become new solid row classes. Reason: the row tier already exists for exactly these buttons. No new class family. Approvals "Return" (orange) → `btn-row-warning` (yellow). This is the one hue shift, and it is the purpose of the change.
- **PD-5 ReasonDialog `tone` values = `'destructive' | 'warning'`, default `'destructive'`.** They map to `.btn-destructive` / `.btn-warning`. `neutral` is not added because no ReasonDialog caller needs it.
- **PD-6 warning is selected by the server: action data `kind: 'warning'`.** `submitFeedback` reads `result.data?.kind === 'warning'`. Any other value gives `'success'`. The message logic does not change. Reason: this is the smallest API that covers every site. The client `success:` overrides at approvals `decide`, timesheets `singleReject` and TimesheetModal `rejectFb` all post to actions that we tag on the server, so no page script changes are needed. No new option on `SubmitFeedbackOptions`.
- **PD-7 ApplicantKanban "Applicant moved." to REJECTED becomes a warning.** The `advanceStage` action returns `kind: parsed.data.stage === 'REJECTED' ? 'warning' : 'success'`. The message stays the same. Reason: moving an applicant to REJECTED is a rejection (owner round-2). The confirm button for this move is the red "Reject".
- **PD-8 The proposals Banner (`proposals/+page.svelte:85`) becomes amber for a rejection.** `rejectChange` returns `{ success: '…', kind: 'warning' as const }`, and the page renders `<Banner kind={form.kind === 'warning' ? 'warning' : 'success'} …>`. Reason: owner round-2 covers all rejections. Banner already supports `warning`, so Banner itself is not changed.
- **PD-9 aria-live for warning = polite.** The toast inherits the container's `aria-live="polite"`, so `Toaster.svelte:70` does not change. Reason: a warning confirms an action the user asked for. It is not a failure, so it must not interrupt.
- **PD-10 Toaster palette goes to tokens for all three coloured kinds, with solid fills.** Success → `border-success bg-success text-success-foreground`. Error → `border-destructive bg-destructive text-destructive-foreground`. Warning → `border-warning bg-warning text-warning-foreground`. Info does not change. Reason: this is the minimum consistent choice. The fills are opaque (`Toaster.svelte:33-35` needs this), and the text contrast is proven by the token test. The comment at :33-35 is kept verbatim.
- **PD-11 `bg-destructive` for Reject in ApplicantKanban** uses `.btn-destructive` (form metrics). Its sibling Confirm button moves to `.btn-primary` (T17), which looks the same as today's `bg-primary …` string.

## Touchpoints (re-verified at d773e1a)

| # | File | Anchor (content) | Change |
|---|---|---|---|
| T1 | `src/app.css` | :root `--success: 142 71% 45%;` (:39) | value → `142 72% 29%` |
| T2 | `src/app.css` | `.dark {` block (starts :46), after `--ring` | add 4 lines: `--success: 142 72% 29%; --success-foreground: 0 0% 100%; --warning: 38 92% 50%; --warning-foreground: 0 0% 10%;` |
| T3 | `src/app.css` | `.btn-destructive` (:213-214) | apply → `btn h-9 px-4 bg-destructive text-destructive-foreground hover:bg-destructive/90` |
| T4 | `src/app.css` | after `.btn-destructive` | add `.btn-success`, `.btn-warning` (PD-3) |
| T5 | `src/app.css` | `.btn-row-positive` (:222-223) | insert `bg-green-600/10` after `border-green-700`; `hover:bg-green-600/10` → `hover:bg-green-600/20`; `text-green-600` → `text-green-800` (dark steps kept) |
| T6 | `src/app.css` | `.btn-row-warning` (:225-226) | insert `bg-yellow-600/10`; hover `/10` → `/20`; `text-yellow-600` → `text-yellow-800` (dark steps kept) |
| T6b | `src/app.css` | `.btn-row-danger` (:228-229) | `text-red-600` → `text-red-700` only (dark steps kept) |
| T7 | `tailwind.config.ts` | after `destructive: {…}` (:37-40) | add `success: { DEFAULT: 'hsl(var(--success))', foreground: 'hsl(var(--success-foreground))' }` and the same for `warning` |
| T8 | `src/lib/components/ui/ReasonDialog.svelte` | :16-17 prop, :28 default, :78 class | the doc line + `confirmClass?: string` → `/** Confirm button colour — defaults to destructive. */ tone?: 'destructive' \| 'warning'`. The default is `tone = 'destructive'`. The button class is `{tone === 'warning' ? 'btn-warning' : 'btn-destructive'} disabled:cursor-not-allowed`. Remove `rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50` (`.btn` supplies them). The doc comment is rewritten ONLY because the prop it describes is replaced |
| T9 | `src/routes/(app)/requests/approvals/+page.svelte` | `confirmClass={…}` (:435-437) | → `tone={noteTarget?.kind !== 'bulk' && noteTarget?.decision === 'RETURNED' ? 'warning' : 'destructive'}` |
| T10 | same | "Reject selected" button `bg-red-600` (:203) | class → `btn-destructive cursor-pointer` (keep `disabled:cursor-not-allowed`) |
| T11 | same | row Approve `bg-green-700` (:377), Return `bg-orange-700` (:384), Reject `bg-red-600` (:391) | → `flex-1 btn-row-positive`, `flex-1 btn-row-warning`, `flex-1 btn-row-danger` |
| T12 | `src/routes/(app)/requests/timesheets/+page.svelte` | Approve selected (:152), Reject selected (:163) | → `btn-success`, `btn-destructive disabled:cursor-not-allowed` |
| T13 | same | row Approve (:268), Reject (:275) | → `flex-1 btn-row-positive`, `flex-1 btn-row-danger` |
| T14 | `src/routes/(app)/requests/proposals/+page.svelte` | row Confirm & apply (:223), Reject (:234) | → `flex-1 btn-row-positive`, `flex-1 btn-row-danger` |
| T15 | same | `<Banner kind="success" message={form.success} />` (:85) | `kind={form.kind === 'warning' ? 'warning' : 'success'}` |
| T16 | `src/lib/components/timesheets/TimesheetModal.svelte` | Approve `bg-green-600` (:572) | → `btn-success` |
| T17 | `src/lib/components/recruitment/ApplicantKanban.svelte` | ternary (:220-223) | `class="{target.to === 'REJECTED' ? 'btn-destructive' : 'btn-primary'}"`. The `disabled:opacity-50` is inherited from `.btn`. PD-11: the primary branch → `btn-primary` gives the same look (`bg-primary text-primary-foreground hover:bg-primary/90`, h-9 px-4) |
| T18 | `src/routes/(app)/recruitment/applicant/[applicantId]/+page.svelte` | Mark accepted (:326) | → `btn-row-positive` |
| T18b | same | Mark declined (:336, `border border-destructive/30 px-3 py-1.5 … text-destructive hover:bg-destructive/10 …`) | → `btn-row-danger` (A6: the issue cites this pair; disabled states come from the class) |
| T19 | `src/routes/(app)/recruitment/[id]/+page.svelte` | `btn-row-positive bg-green-600/10 hover:bg-green-600/25` (:268) | → `btn-row-positive` |
| T20 | `src/lib/stores/toast.svelte.ts` | :4 | `'info' \| 'success' \| 'warning' \| 'error'` |
| T21 | `src/lib/server/flash.ts` | :15, :58 | FlashKind adds `'warning'`. takeFlash: `kind === 'error' \|\| kind === 'info' \|\| kind === 'warning' ? kind : 'success'` |
| T22 | `src/lib/components/ui/Toaster.svelte` | `kindClass` (:36-41) and the dismiss ✕ button (:88-91, `class="shrink-0 text-muted-foreground hover:text-foreground"`) | PD-10 palette, with a `warning` branch before the info fallback. ✕ class → `shrink-0 {t.kind === 'info' ? 'text-muted-foreground hover:text-foreground' : 'hover:opacity-80'}` so coloured toasts use their own foreground (5.07 / 4.94 / 8.18). Info unchanged (A2) |
| T23 | `src/lib/utils/submit-feedback.svelte.ts` | :81 `addToast(msg, { kind: 'success' })` | `{ kind: result.data?.kind === 'warning' ? 'warning' : 'success' }` |
| T24 | `src/routes/(app)/dashboard/+page.server.ts` | decidePosting return (:238-241) | add `kind: approve ? 'success' : 'warning'` |
| T25 | `src/routes/(app)/requests/timesheets/+page.server.ts` | review return (:141), rejectMany return (:213-215) | add `kind: approved ? 'success' : 'warning'`; add `kind: 'warning'` |
| T26 | `src/routes/(app)/requests/approvals/+page.server.ts` | decideRequest return (:144-152), rejectMany return (:189-192) | add `kind: decision === 'APPROVED' ? 'success' : 'warning'`; add `kind: 'warning'` |
| T27 | `src/routes/(app)/payroll/[id]/+page.server.ts` | decide return (:194-197) | add `kind: action === 'approve' ? 'success' : 'warning'` |
| T28 | `src/routes/(app)/payroll/statutory-rates/+page.server.ts` | rejectProposal return (:212) | add `kind: 'warning'`. Note: this form uses ConfirmButton (`statutory-rates/+page.svelte:319`), which toasts `data.saved` itself. See T29 |
| T29 | `src/lib/components/ui/ConfirmButton.svelte` | `const fb = submitFeedback({ success: (data) => successMessage ?? … })` (:62-66) | **NO CHANGE** — verified: ConfirmButton toasts through `submitFeedback`, so T23 already gives statutory-rates reject a warning toast |
| T30 | `src/routes/(app)/recruitment/[id]/+page.server.ts` | advanceStage return (:105) | add `kind: parsed.data.stage === 'REJECTED' ? 'warning' : 'success'` (PD-7) |
| T31 | `src/routes/(app)/requests/proposals/+page.server.ts` | reject return (:217) | `{ success: '…', kind: 'warning' as const }` (PD-8) |

New test files: `tests/unit/semantic-colour-tokens.test.ts`, `tests/unit/solid-fill-buttons-scan.test.ts`, `tests/unit/warning-outcome-sites.test.ts`. Edited tests: `tests/unit/submit-feedback.test.ts`, `tests/unit/flash.test.ts`.

## Deferred: employees/[id]/* (owned by #23, Wave 2)

| Site | What | In #27 scope? |
|---|---|---|
| `employees/[id]/+page.svelte:344` | checklist toggle button `bg-green-500 text-white hover:bg-green-600` | **YES.** It is a solid-fill button. Follow-up commit after #23 merges: `bg-success text-success-foreground hover:bg-success/90` (in whichever card file #23 moves it to) |
| `:355` | the same look on a `<span>` (done state) | **YES**, it pairs with :344. Same follow-up: `bg-success text-success-foreground` |
| `:1849` | ConfirmButton `triggerClass` raw red text | NO (text colour, not a solid fill) |
| `:1945` | timeline dot `bg-green-500` | NO (not a button) |
| `:473` | amber pill | NO (badge-like, badges out of scope) |
| `:2045` | `bg-destructive` | NO (already tokens) |

The follow-up is one commit on this same branch if #23 has merged before this PR merges. If not, it is a separate small PR. When it lands, the scan test allowlist (G6) loses its `employees/[id]` entry in that same commit.

## Acceptance Criteria

- C1-C5 above, each green by its gate in Verification Evidence.
- `bun run format:check`, `bun run lint`, `bun run check`, `bun run test` all exit 0.
- G10 screenshots exist for both themes and show amber warning toast + symmetric rows.

## Phase Completion Rules

- CODE DONE: S0-S6 committed, G1-G9 green.
- VERIFIED: CODE DONE + the full CI gate set green + the G10 visual pass reviewed in both themes.

## Public Contracts

- CSS: new classes `.btn-success`, `.btn-warning`. The look of `.btn-destructive` changes (0 external users). `.btn-row-positive` / `-warning` gain a resting fill. New Tailwind colours `success`, `warning` (`bg-success`, `text-warning-foreground`, …).
- `ReasonDialog` prop: `confirmClass` is REMOVED and `tone` is added. All 4 callers are in-repo.
- `ToastKind`, `FlashKind` gain `'warning'`.
- Form action data contract: an optional `kind: 'success' | 'warning'` next to `saved`. Only `'warning'` changes behaviour.

## Blast Radius

About 20 source files, UI + 7 server action return objects (only an extra key; no logic, DB, auth or schema change). Risk class: none of the high-risk classes. The action return shape grows by one optional key.
Files NO lane may touch: `src/routes/(app)/employees/[id]/*` (#23), `Banner.svelte`, `Badge.svelte`, `badge.ts`, `Container.svelte`, `Table.svelte`.
Wave coordination: `recruitment/[id]/+page.server.ts` is also changed by #21 (Wave 1, `updateStatus`). Branch after Wave 1 merges, or rebase. T30 touches only the `advanceStage` return.

## Implementation Checklist (red-first)

**S0 — Start**
1. `git switch staging && git pull`, then `git switch -c fix/27-semantic-colour-tokens`. Confirm that Wave 1 (#21) has merged.
2. Re-scan and record the counts in the PR body:
   `grep -rnE "bg-(green|red|orange)-[0-9]{3}([^/0-9]|$)" src/ | grep -n "text-white"`. Expect the 13 class lines above + 2 in employees/[id] + the 3 `confirmClass`/ReasonDialog lines. Also run `grep -rn "confirmClass" src/` and `grep -rnE "btn-row-positive [^\"]*bg-" src/`. If a new site has appeared, add it to the matching T row, with the same mapping rule (form size → `.btn-*`, row size → `.btn-row-*`).
3. `bun run test` baseline: all green. Record the count.

**S1 — Tokens (C1)**
4. Write `tests/unit/semantic-colour-tokens.test.ts` (G1-G3). Run it: RED. The reasons are that `.dark` has no `--success`, tailwind has no `success:` key, and success/white = 2.30 < 4.5. Record this.
5. T1, T2, T7. Run G1-G3: GREEN. Run `tests/unit/theme-token-contrast.test.ts`: still green (gray tokens untouched).

**S2 — Classes (C2)**
6. Add to `semantic-colour-tokens.test.ts` the G4 class assertions. RED: `.btn-success` is missing, and `.btn-row-positive` has no resting `bg-`.
7. T3, T4, T5, T6. G4 GREEN.

**S3 — Toast kinds (C5 core)**
8. Edit `tests/unit/submit-feedback.test.ts` (G7) and `tests/unit/flash.test.ts` (G8). RED: the toast kind is `'success'`, and takeFlash maps `'warning'` → `'success'`.
9. T20, T21, T23, T22. Add the G11 Toaster check (A2) in this step: RED today (✕ has no kind branch), GREEN after T22. G7, G8 GREEN. `bun run check`: no type errors (ToastKind is widened).

**S4 — Warning sites (C5 routing)**
10. Add the G9a runtime asserts to the existing action tests (A4) and update `proposal-queue.test.ts:382` (A3). Write the reduced source scan `tests/unit/warning-outcome-sites.test.ts` (G9b). Run: RED, because `kind` is undefined in every return today. Record the output.
11. T24-T28, T30, T31, T15. G9a + G9b GREEN.

**S5 — ReasonDialog (C4)**
12. Add G5 to `semantic-colour-tokens.test.ts`: RED while `confirmClass` exists.
13. T8, T9. G5 GREEN. `bun run check` clean. Other ReasonDialog callers (TimesheetModal:524, timesheets:304, proposals:263) need no change: they pass no `confirmClass`, and the default is `destructive`.

**S6 — Button sweep (C3)**
14. Write `tests/unit/solid-fill-buttons-scan.test.ts` (G6). RED: it lists all the files above.
15. T10-T14, T16-T19, T18b. G6 GREEN.

**S7 — Gates + visual**
16. `bun run format:check`, `bun run lint`, `bun run check`, `bun run test` (CI order). Fix any failures.
17. Visual pass G10 (owner starts the dev server; EXECUTE does not).
18. Commit per section, only when that section is green (see Git). Do not push until the owner says push.

## Test design (exact assertions)

- **G1** (`semantic-colour-tokens.test.ts`): read `src/app.css`. Use the `block()` helper pattern from `theme-token-contrast.test.ts:17-22` for `:root {` and `.dark {`. For each of the 4 names, assert `new RegExp('^\\s*--NAME:\\s*(\\d+) (\\d+)% (\\d+(?:\\.\\d+)?)%;', 'm')` matches in BOTH blocks. Positive control: the same regex finds `--destructive` in both blocks. This proves that the parser can pass.
- **G2**: read `tailwind.config.ts` as text. Assert it contains `'hsl(var(--success))'`, `'hsl(var(--success-foreground))'`, `'hsl(var(--warning))'`, `'hsl(var(--warning-foreground))'`. Positive control: `'hsl(var(--destructive))'`.
- **G3**: an HSL→sRGB conversion (the same formula as `theme-token-contrast.test.ts` luminance, extended with an hsl→rgb helper written in the test). For each theme block, check that the contrast of `success` vs `success-foreground`, `warning` vs `warning-foreground`, and `destructive` vs `destructive-foreground` is 4.5 or more. Negative-control proof: on today's code, `:root` success (142 71% 45%) vs white = 2.30. RED for the right reason, and `.dark` fails as missing.
- **G4**: regex-extract the `@apply` list of `.btn-success`, `.btn-warning`, `.btn-destructive`, `.btn-primary`. Assert that success, warning and destructive contain `h-9` and `px-4` and `btn`, the same as `.btn-primary`. Assert that `.btn-success` contains `bg-success` and `text-success-foreground`, and `.btn-warning` the same for warning. For each of `.btn-row-positive`, `.btn-row-warning`, `.btn-row-danger`: capture the resting `bg-X/(\d+)` and the `hover:bg-X/(\d+)`, and assert hover > resting and resting exists. Positive control: `.btn-row-danger` passes on today's code (10 < 20). A rule that refuses all input would fail this control. A1 addition: for each row class, take the light (non-`dark:`) `text-(green|yellow|red)-(\d{3})` step and assert it is at least 800 / 800 / 700 for positive / warning / danger. Also compute the contrast of that Tailwind step (hex values hard-coded in the test: green-800 #166534, yellow-800 #854d0e, red-700 #b91c1c) over the /20 hover tint composited on `--card` 98.5%, and assert it is 4.5 or more (the validator's script is `scratchpad/contrast.mjs`). RED today: the steps are 600.
- **G5**: read `ReasonDialog.svelte`. `not.toContain('confirmClass')`, `toMatch(/tone\?: 'destructive' \| 'warning'/)`. Read `requests/approvals/+page.svelte`: `not.toContain('confirmClass')`. Recursive scan of `src/`: 0 `confirmClass` hits.
- **G6** (`solid-fill-buttons-scan.test.ts`): walk `src/**/*.svelte` with `readdirSync` recursive. For every line that matches `/\bbg-(green|red|orange)-\d{3}(?![\/\d])/` AND `/\btext-white\b/`, collect `file:line`. The allowlist is by CONTENT, not path (A5): a line is allowed only if it contains `bg-green-500 text-white` (the deferred checklist toggle, wherever #23 moves it). Assert: the non-allowed list is `[]`; the allowed count is at most 2; the allowed count is at least 1. When it reaches 0, the test fails and forces the allowlist to be removed (self-expiry). Positive control: the line predicate on `'class="rounded-md bg-green-600 px-4 text-white"'` → true, and on `'bg-green-600/10 text-white'` → false.
- **G7** (`submit-feedback.test.ts`, add after the E3 test): (a) `submitFeedback()` with `{type:'success', data:{saved:'Timesheet rejected.', kind:'warning'}}` → the toast text is `['Timesheet rejected.']` and the kind is `'warning'`. RED today ('success'). (b) With a `success:` override function and `data:{kind:'warning'}` → the kind is `'warning'` (this covers approvals `decide` / `singleReject` / `rejectFb`). (c) Positive control: `data:{saved:'X', kind:'success'}` → `'success'`. (d) `data:{saved:'X', kind:'error'}` → `'success'`: only warning is honoured. The existing asserts at :58, :71 stay `'success'` unchanged. :98, :123 stay `'error'`.
- **G8** (`flash.test.ts`): add `setFlash(cookies, { kind: 'warning', message: 'Rejected.' })` → `takeFlash(cookies)?.kind` is `'warning'`. RED today. The existing `falls back to success for an unknown kind` (:84-87) stays and is the positive control.
- **G9a** (runtime, A4). Extend the tests that already call the real actions. `tests/unit/request-decide-feedback.test.ts`: approvals decideRequest APPROVED → `kind: 'success'`, REJECTED and RETURNED → `'warning'` (next to :70-84); timesheets review approve → `'success'`, reject → `'warning'` (:96-103); timesheets rejectMany partial → `'warning'` (:177). `tests/unit/high-stakes-action-feedback.test.ts:162`: payroll/[id] decide approve → `'success'`, return → `'warning'`. `tests/unit/proposal-queue.test.ts:382`: the reject `toEqual` gains `kind: 'warning'` (A3); :277 and :314 (confirm) stay unchanged, which is the positive control that a confirm does not gain `kind`. Each new assert must be seen RED on today's code (`kind` undefined).
- **G9b** (`warning-outcome-sites.test.ts`, source scan, only where no action harness exists). Dashboard decidePosting: the return contains `kind: approve ? 'success' : 'warning'` (order asserted, so an inverted ternary fails). Statutory-rates rejectProposal: the return with `'Proposal rejected.'` contains `kind: 'warning'`. Recruitment advanceStage: contains `kind: parsed.data.stage === 'REJECTED' ? 'warning' : 'success'` (order asserted). Approvals rejectMany: the return with `` `Rejected ${done} `` contains `kind: 'warning'`. Positive control: the statutory `'Proposal applied to the live rates.'` return does NOT contain `'warning'`.
- **G11** (A2, add to `semantic-colour-tokens.test.ts`): read `Toaster.svelte`. Assert the dismiss button class contains `t.kind === 'info' ? 'text-muted-foreground hover:text-foreground'`, and that no other `text-muted-foreground` is applied without the kind branch on that button. Assert `kindClass` has branches for `'success'`, `'error'`, `'warning'` using `bg-success`, `bg-destructive`, `bg-warning`. Positive control: the info fallback still returns `border-border bg-card text-foreground`. RED today.
- **G10 Visual (Agent-Probe, both themes).** Precondition: the owner has the dev server up. The theme is set via `localStorage.setItem('theme','light'|'dark')` + reload (NOT prefers-color-scheme). Use a Playwright script to screenshot, in light and dark: `/requests/approvals` (bulk bar + a row with Approve/Return/Reject + the Return ReasonDialog open), `/requests/timesheets` (bulk bar + row), `/requests/proposals` (row + the Banner after a reject if data exists), `/recruitment/applicant/<id>` with an offer (Mark accepted/declined pair). Use one toast of each kind via `addToast` in `page.evaluate`: import the store from the page's module graph, or trigger real actions. The judge: buttons are readable, Return is amber, the positive/danger row pair looks symmetric, the toasts are opaque, and the warning toast is amber in both themes. Also check a hover on the row buttons with CDP `forcePseudoState` (memory: hover needs this). Save the shots in the scratchpad and list them in the PR. Also judge: the ✕ is clearly visible on the success, error and warning toasts in both themes (A2), and Mark accepted / Mark declined look like a matching pair (A6).

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| G1 tokens in :root and .dark | Fully-Automated | C1 |
| G2 tailwind mapping | Fully-Automated | C1 |
| G3 fill/foreground contrast ≥4.5 both themes | Fully-Automated | C1 |
| G4 class metrics + row symmetry | Fully-Automated | C2 |
| G5 ReasonDialog tone, no confirmClass | Fully-Automated | C4 |
| G6 solid-fill scan with self-expiring allowlist | Fully-Automated | C3 |
| G7 submitFeedback emits warning | Fully-Automated | C5 |
| G8 takeFlash keeps warning | Fully-Automated | C5 |
| G9a warning routing via real action calls | Fully-Automated | C5 |
| G9b warning routing source scan, ternary order (4 sites) | Fully-Automated | C5 |
| G11 toast ✕ uses toast foreground on coloured kinds | Fully-Automated | C5 |
| G10 Playwright screenshots, light + dark, 4 pages + 3 toast kinds | Agent-Probe | C1, C2, C3, C5 |
| `bun run format:check && bun run lint && bun run check && bun run test` | Fully-Automated | all |

Criterion → gate: C1 proven by G1/G2/G3 (Fully-Automated) + G10. C2 proven by G4 (Fully-Automated), including row text contrast (A1). C3 proven by G6 (Fully-Automated). C4 proven by G5 + `bun run check` (Fully-Automated). C5 proven by G7/G8/G9a/G9b/G11 (Fully-Automated) + G10 (Agent-Probe). No Known-Gap.

## Existing tests affected

- `tests/unit/submit-feedback.test.ts`: add cases only. The existing `'success'`/`'error'` asserts stay valid.
- `tests/unit/flash.test.ts`: add a case only.
- `tests/unit/proposal-queue.test.ts:382`: exact `toEqual({ success: 'Proposal rejected and the initiator notified.' })` → add `kind: 'warning'` (A3). :277 and :314 stay unchanged.
- `tests/unit/request-decide-feedback.test.ts`, `tests/unit/high-stakes-action-feedback.test.ts`: add `kind` asserts (G9a). The existing message asserts stay. If any of them uses an exact `toEqual` on a return object that gains `kind`, add the key there too.
- `tests/unit/theme-token-contrast.test.ts`: not changed (it reads gray `0 0% N%` only; the new hued lines are ignored by its regex).
- `tests/unit/a11y-invariants.test.ts:222`: not affected (its pattern is not touched).
- `tests/unit/destructive-confirms.test.ts`: EXECUTE runs `grep -n "ReasonDialog\|confirmClass" tests/` at S0. Any hit is updated to `tone`.
- e2e: `grep -rnE "bg-(green|red|orange)-|confirmClass|btn-row|Approve selected|Reject selected" tests/e2e` at S0. Role/name locators do not change (labels are the same). Class-based locators, if found, are updated. Not rerun unless a hit is found (owner starts servers).

## Risks

- ConfirmButton: verified in PLAN to use `submitFeedback` (ConfirmButton.svelte:62), so no separate path exists.
- `.btn` adds `h-9`: the ReasonDialog confirm button changes from `py-2` (about 36px) to `h-9` (36px). No visible change. The ApplicantKanban Confirm button: same.
- Row buttons change from solid to tinted-bordered on 3 request pages. This is intended by PD-4. G10 checks it.
- Rebase conflict with #21 in `recruitment/[id]/+page.server.ts`: different functions. Low risk.
- Rollback: revert the PR. There is no data or schema change.

## Parallel lanes

Not recommended: about 20 small edits that share `app.css`, and the tests share files. One sequential EXECUTE agent (opus).

## Git

Branch `fix/27-semantic-colour-tokens` off updated `staging`. Commits (no AI attribution, no Co-Authored-By). Owner rule: commit on green only. There is no red test-only commit. Each red-first test goes into the same commit as the code that makes it pass, and the red output (test name + failure line) goes in that commit's body:
1. `feat(theme): wire success and warning tokens into tailwind and the dark theme`
2. `feat(ui): add success and warning form buttons and make row buttons symmetric`
3. `feat(toast): add a warning toast kind that actions can select`
4. `fix(requests): show rejections, returns and send-backs as warning toasts`
5. `refactor(ui): give ReasonDialog a tone prop instead of a class string`
6. `refactor(ui): move solid-fill action buttons onto the button classes`
One PR to `staging`, titled `#27 Semantic colour through tokens`. The body lists the S0 counts, the PD list, the deferred employees/[id] rows and the G10 screenshots. Push only on the owner's word.

## Test Infra Improvement Notes

- `theme-token-contrast.test.ts` can only parse gray tokens. The new test adds an hsl→rgb helper. A later task could move it into a shared test util (not now).

## Resume and Execution Handoff

1. Selected plan: `process/general-plans/active/hris-27-semantic-colour-tokens_PLAN_24-09-26.md`
2. Last completed: EXECUTE, commit 6 (`f8329f9`). All 6 commits green on format:check, lint, check and unit tests. The `employees/[id]` checklist-button follow-up stays deferred (G6 allowlist, by content).
3. Validate-contract: pass 1, CONDITIONAL; A1-A6 folded into the body and applied during EXECUTE.
4. Context loaded: scratchpad `CONTEXT.md`, `PLAN-BRIEF.md`, `research-27.md`, issue #27 body, source re-verified at d773e1a
5. Next: with the owner's servers up, run G10 (Playwright screenshots in light and dark of requests/approvals, requests/timesheets, requests/proposals, recruitment/applicant, and one toast of each kind) and the e2e run. Then mark the plan VERIFIED.

## Validate Contract

Status: CONDITIONAL
Date: 24-09-26
date: 2026-09-24
generated-by: outer-pvl

Parallel strategy: sequential
Rationale: 7-signal score 1/7 (S7: ~20 files). No schema/auth/API/high-risk class. Edits share app.css and test files, so one opus EXECUTE agent. Validation ran single-agent with source + contrast measurement (scratchpad contrast.mjs).

Verdict in one line: the approach holds (tokens, `kind: 'warning'` routing, ReasonDialog `tone`, sweep coverage). Two HIGH defects the plan would ship (A1, A2) and four test/guard gaps (A3-A6) must be applied to the plan before EXECUTE starts.

### Required amendments (apply before EXECUTE; PVL supplement cycle)

- **A1 (HIGH, light-theme contrast regression from PD-4).** Row classes use light text `text-green-600` / `text-yellow-600` / `text-red-600` (app.css:222-229). Measured on `--card` (98.5%) with the /10 tint: 2.86 / 2.58 / 4.01. Today's solid row buttons are 5.02 (white/green-700) / 5.18 (white/orange-700) / 4.83 (white/red-600). PD-4 moves 7 primary decision buttons (approvals 3, timesheets 2, proposals 2) + applicant Mark accepted onto these classes, so they drop below 4.5:1 in light mode. Fix in T5/T6 + new T6b: light text steps become the `.badge-*` steps (app.css:164-182): `.btn-row-positive` `text-green-600` → `text-green-800`; `.btn-row-warning` `text-yellow-600` → `text-yellow-800`; `.btn-row-danger` (T6b, new) `text-red-600` → `text-red-700`. Keep every `dark:` step. Measured after: 6.19 / 6.03 / 5.37 at rest, 5.54 / 5.47 / 4.58 at /20 hover (on card). Add a G4 assertion: the light `text-(green|yellow|red)-NNN` step of each row class is ≥ 800 / 800 / 700 (RED today: 600).
- **A2 (HIGH, invisible toast dismiss button from PD-10).** Toaster.svelte:88-91 dismiss ✕ is `text-muted-foreground hover:text-foreground`. On the new solid fills: 1.09 (light) / 1.56 (dark) on success, 1.12 / 1.52 on destructive, 2.59 / 1.52 on warning. Below the 3:1 non-text floor. Fix in T22: the ✕ class becomes `shrink-0 {t.kind === 'info' ? 'text-muted-foreground hover:text-foreground' : 'hover:opacity-80'}` so coloured kinds inherit the toast foreground (5.07 / 4.94 / 8.18). Info toasts unchanged. Add to G10 judge list: ✕ visible on all 3 coloured kinds, both themes.
- **A3 (MEDIUM, missed existing test).** `tests/unit/proposal-queue.test.ts:382` is `expect(res).toEqual({ success: 'Proposal rejected and the initiator notified.' })`. T31 adds `kind` → RED. Add to "Existing tests affected": update :382 to include `kind: 'warning'`. Lines :277 and :314 (confirm, no kind) stay unchanged — keep T31 the only proposals return that gains `kind`.
- **A4 (MEDIUM, G9 cannot catch an inverted ternary).** G9 asserts the return text "contains `kind:` and `'warning'`". `kind: approve ? 'warning' : 'success'` (inverted) passes it at 5 of the 9 sites. Replace G9 with runtime asserts where a harness already calls the real action: `tests/unit/request-decide-feedback.test.ts` (approvals decideRequest APPROVED→'success', REJECTED/RETURNED→'warning' at :70-84; timesheets review approve/reject at :96-103; timesheets rejectMany partial at :177), `tests/unit/high-stakes-action-feedback.test.ts:162` (payroll/[id] decide approve→'success', return→'warning'), `tests/unit/proposal-queue.test.ts:382` (A3). Keep the source scan only for dashboard decidePosting, statutory-rates rejectProposal, recruitment advanceStage, approvals rejectMany; for the three ternary sites among them, assert the ternary text order (`approve ? 'success' : 'warning'`, `=== 'REJECTED' ? 'warning' : 'success'`). Each runtime assert must be seen RED on today's code (kind undefined).
- **A5 (MEDIUM, G6 allowlist breaks #23's CI).** G6's `DEFERRED = ['src/routes/(app)/employees/[id]/+page.svelte']` is a path. If #27 merges first, #23 moves the checklist button (:344/:355) into `src/lib/components/employees/detail/OnboardingCard.svelte` (#23 plan hris-23-employee-detail-split_PLAN_24-09-26.md:81, :86). #23's CI then goes RED on a file #27 owns (new path not allowlisted, and the old entry matches 0 lines). Fix: allowlist by content signature, not path — allow only lines that match `bg-green-500 text-white` (the checklist toggle), cap at 2, and fail when the count reaches 0 (self-expiry kept). Then the #23 move is neutral.
- **A6 (LOW, applicant pair asymmetry).** T18 moves Mark accepted to `btn-row-positive` (px-2.5 py-1). Its sibling Mark declined (applicant page :336) stays `border-destructive/30 px-3 py-1.5`, so the pair differs in size and style, which G10 judges. Add T18b: Mark declined → `btn-row-danger` (keep `disabled:` states from the class).

Nits (fix wording only): TL;DR "15 solid-fill buttons in 6 files" → "16 lines (15 buttons) in 7 files; ReasonDialog handled by `tone`". PD-11 says the Confirm button "stays as it is today" but T17 moves it to `btn-primary` (same look) — say that.

Test gates (C3 5-column table — ADDITIVE; existing consumers still parse the legacy line form below it):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| C1 | success/warning tokens in :root and .dark, tailwind mapping | Fully-Automated | `bun run test tests/unit/semantic-colour-tokens.test.ts` (G1, G2) | B |
| C1 | fill/foreground ≥4.5 both themes | Fully-Automated | same file (G3) | B |
| C2 | form-tier metrics, row resting+hover fill, row light text step (A1) | Fully-Automated | same file (G4 + A1 assert) | B |
| C3 | no solid green/red/orange + text-white button outside signature allowlist | Fully-Automated | `bun run test tests/unit/solid-fill-buttons-scan.test.ts` (G6, A5) | B |
| C4 | ReasonDialog `tone`, 0 confirmClass | Fully-Automated | G5 + `bun run check` | B |
| C5 | submitFeedback emits warning from data.kind, incl. with `success:` override | Fully-Automated | `bun run test tests/unit/submit-feedback.test.ts` (G7) | B |
| C5 | takeFlash keeps warning | Fully-Automated | `bun run test tests/unit/flash.test.ts` (G8) | B |
| C5 | each negative outcome returns kind 'warning', each approve returns 'success' | Fully-Automated | `bun run test tests/unit/request-decide-feedback.test.ts tests/unit/high-stakes-action-feedback.test.ts tests/unit/proposal-queue.test.ts tests/unit/warning-outcome-sites.test.ts` (A4) | B |
| C1,C2,C3,C5 | visual: buttons readable, Return amber, rows symmetric, toasts opaque, ✕ visible, both themes | Agent-Probe | G10 Playwright script (owner starts server; theme via localStorage `theme`) + CDP forcePseudoState hover | A |
| all | CI gate set | Fully-Automated | `bun run format:check && bun run lint && bun run check && bun run test` | A |

Failing stubs (Fully-Automated rows; red-first, not on disk until EXECUTE):
```
test("should define --success/--warning (+foreground) in :root and .dark and map them in tailwind", () => { throw new Error("NOT IMPLEMENTED — TDD stub: tokens in both themes") })
test("should keep success/warning/destructive text-on-fill at 4.5:1 or more in both themes", () => { throw new Error("NOT IMPLEMENTED — TDD stub: fill contrast") })
test("should give every row class a resting /10 fill, a /20 hover and a light text step of 800/800/700", () => { throw new Error("NOT IMPLEMENTED — TDD stub: row symmetry + light contrast") })
test("should find no solid green/red/orange text-white button outside the checklist signature allowlist", () => { throw new Error("NOT IMPLEMENTED — TDD stub: solid-fill scan") })
test("should expose tone and no confirmClass on ReasonDialog", () => { throw new Error("NOT IMPLEMENTED — TDD stub: ReasonDialog tone") })
test("should toast warning when action data carries kind warning, even with a success override", () => { throw new Error("NOT IMPLEMENTED — TDD stub: submitFeedback warning") })
test("should keep kind warning through takeFlash", () => { throw new Error("NOT IMPLEMENTED — TDD stub: flash warning") })
test("should return kind warning for reject/return/send-back and kind success for approve", () => { throw new Error("NOT IMPLEMENTED — TDD stub: warning routing runtime") })
```

Legacy line form (retained so existing validate-contract consumers still parse):
- tokens/classes: Fully-automated: `bun run test tests/unit/semantic-colour-tokens.test.ts`
- sweep: Fully-automated: `bun run test tests/unit/solid-fill-buttons-scan.test.ts`
- toast kinds: Fully-automated: `bun run test tests/unit/submit-feedback.test.ts tests/unit/flash.test.ts`
- warning routing: Fully-automated: `bun run test tests/unit/request-decide-feedback.test.ts tests/unit/high-stakes-action-feedback.test.ts tests/unit/proposal-queue.test.ts tests/unit/warning-outcome-sites.test.ts`
- visual: agent-probe: G10 Playwright both themes (owner-started server)

Dimension findings:
- Infra fit: PASS — no server/DB/runtime change; script names verified in package.json:13-20; EXECUTE must not start servers.
- Test coverage: CONCERN — G9 source scan passes an inverted ternary (A4); no guard on row light-text contrast (A1); proposal-queue.test.ts:382 unlisted (A3); ✕ not in G10 judge list (A2).
- Breaking changes: CONCERN — `kind` key collides with nothing (only setFlash args and a zod field use `kind:` in src/routes; 0 `form?.kind`/`data.kind` reads); but proposal-queue.test.ts:382 exact `toEqual` breaks (A3); ReasonDialog `confirmClass` removal has 1 caller (approvals:435).
- Security surface: PASS — UI + one optional return key; no auth, data, secret or trust-boundary change.
- S1 Tokens: PASS — `--success`/`--warning` used 0 times (no `var(--success`, no `*-success|*-warning` utility); measured success/white 5.07, warning/10% 8.18, destructive/white 4.94 (plan's 5.08/8.16/4.93 are rounding). Fill-on-surface: dark success 3.36 / destructive 3.45 on --card (≥3); amber on light card 2.07 (hue-visible, LOW; G10 judges).
- S2 Classes: CONCERN — A1 light text regression; `.btn-destructive` has 0 users outside app.css (confirmed).
- S3 Toast kinds: CONCERN — mechanism PASS (kind is read from result.data independent of the message, submit-feedback.svelte.ts:77-81, so client `success:` overrides at approvals:172, timesheets:101, TimesheetModal:285-287 and ConfirmButton:62-66 do not bypass it); A2 ✕ contrast.
- S4 Warning sites: PASS on coverage — all 9 routed sites confirmed wired through submitFeedback/ConfirmButton (dashboard:64, payroll/[id]:23, ApplicantKanban:34, approvals:51/:172, timesheets:45/:101, TimesheetModal:285, statutory-rates:320 ConfirmButton); proposals is Banner-only via createSubmitGuard (T15 correct). No 10th site found: other negatives are voids/cancel/undo (not rejections per owner round 2), offer decline has no toast (createSubmitGuard), no fetch-based decision paths, /timesheets has no `review` action (timesheets/+page.server.ts:237).
- S5 ReasonDialog: PASS — 1 confirmClass caller; other 3 callers take the default.
- S6 Sweep: PASS — plan S0 grep = 18 lines (16 in scope + 2 employees/[id]), all 16 mapped by T8-T18; remaining 11 research hits are non-buttons; employees/[id] untouched. A5 allowlist fix; A6 pair.
- Wave order: PASS — #21 edits `updateStatus` (:108+) and the import at :6; #27 T30 edits only the `advanceStage` return (:105). Branching after #21 merges removes any overlap; #21 reads recruitment/[id]/+page.svelte only, #27 T19 edits it.
- PD-2 (row classes raw, not tokens): CONCERN-LOW, owner-visible — defensible: amber as text on light fails at every token lightness that also works as a fill with dark text, so full row tokenisation needs a second token set. Minimal alternative if the owner wants tokens in rows: `.dark` `--success: 142 71% 45%` with `--success-foreground: 0 0% 9%` (fill 7.81, as text on dark card 7.41), then `.btn-row-positive`/`-danger` use `border-success bg-success/10 text-success` in both themes; `-warning` stays raw. Recommendation: keep PD-2 + A1.

Open gaps: none beyond A1-A6 (plan amendments, not deferrals). employees/[id]:344/:355 stay deferred to the post-#23 follow-up as the plan states.

What This Coverage Does NOT Prove:
- G1-G4: text parsing of app.css/tailwind.config.ts; not that Tailwind emits the classes or that the built CSS resolves `hsl(var(--success))` (G10 covers).
- G3/A1 asserts: luminance math only; not hue legibility or amber-on-light visibility (G10 judges).
- G6: one-line predicate; a multi-line class string that splits `bg-…-NNN` and `text-white` across lines is not seen (none exist today).
- G7/G8: unit behaviour of submitFeedback/takeFlash; not the Toaster paint.
- A4 runtime asserts: return values with mocked services; not that the page form posts to that action (wiring confirmed by source read in this contract).
- G10: judged screenshots; no automated visual regression, no e2e run.

Gate: CONDITIONAL (0 FAILs; 2 HIGH + 3 MEDIUM + 1 LOW concerns, all exact plan amendments A1-A6)
Accepted by: session (autonomous validate, orchestrator-directed; no user menu) — concerns A1 row light contrast, A2 toast dismiss contrast, A3 proposal-queue:382, A4 G9 inverted-ternary vacuity, A5 G6 path allowlist vs #23, A6 applicant pair, PD-2 owner-visible choice. First-pass CONDITIONAL: EXECUTE only after a PVL supplement applies A1-A6 and VALIDATE re-runs from V1.

## Autonomous Goal Block

```
/goal Ship HRIS #27 semantic colour through tokens on branch fix/27-semantic-colour-tokens (off staging after Wave 1 #21 merges), one PR to staging.
Reference: process/general-plans/active/hris-27-semantic-colour-tokens_PLAN_24-09-26.md (Validate Contract + amendments A1-A6).
Precondition: plan supplemented with A1-A6 and re-validated to PASS.
Charter: tokens --success/--warning in :root and .dark + tailwind; .btn-success/.btn-warning, solid .btn-destructive; row classes symmetric with badge-step light text; migrate 16 solid-fill lines (not employees/[id]/*); ReasonDialog tone; warning toast kind selected by action data kind:'warning'.
Autonomy: red-first per section S0-S7; commit per section; no AI attribution, no Co-Authored-By.
Hard stops: do not touch src/routes/(app)/employees/[id]/*, Banner/Badge/badge.ts/Container/Table; no servers, no DB, no .env; no push; no git add -A.
Gates: bun run format:check && bun run lint && bun run check && bun run test; G10 Playwright both themes after owner starts the server.
Next phase: EXECUTE from S0.
```

## Next Instruction

ENTER VALIDATE MODE for this plan, then ENTER EXECUTE MODE starting at S0.
