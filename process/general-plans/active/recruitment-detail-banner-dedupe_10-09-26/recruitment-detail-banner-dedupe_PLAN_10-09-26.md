---
name: plan:recruitment-detail-banner-dedupe
description: "Delete the duplicated status-change error banner on the job posting detail page so a refusal reports once, as a toast"
date: 10-09-26
feature: uiux-phase-4
---

# Recruitment detail — one message per refused status change

**TL;DR** — Delete 5 lines (`+page.svelte` 84-88) so a refused `updateStatus` / `advanceStage` reports once as a toast instead of twice. The four forms are already on `submitFeedback`, so the toast is already firing. Prove it live with a `BOGUS` status submit, add the missing e2e guard, keep the `convert` banner and the board-row inline error untouched.

**Date**: 10-09-26
**Status**: ACTIVE
**Complexity**: SIMPLE

## Overview

The job posting detail page reports a refused status change twice: once as a page-level `Banner`, once as an error toast fired by the `submitFeedback` guard every one of those forms already uses. This plan deletes the banner so the refusal reports once. Context routing was loaded via `process/context/all-context.md` and the testing chain via `process/context/tests/all-tests.md`; the e2e tier here is Playwright against build+preview, and post-phase testing is the CI gate set plus the new `form-errors` case.

## Acceptance Criteria

1. `src/routes/(app)/recruitment/[id]/+page.svelte` contains exactly one `<Banner` (the `convert` one) and no `form?.action === 'updateStatus'` conditional.
2. Forcing `status=BOGUS` on `?/updateStatus` shows exactly ONE error toast reading `Invalid status`, and zero `role="alert"` nodes.
3. A valid status change still shows a success toast (feedback path intact).
4. The board-row inline error and the `convert` banner both still render on the same page.
5. `pnpm format:check && pnpm lint && pnpm check && pnpm test` all green, plus `pnpm test:e2e -- form-errors`.
6. One commit, conventional message, no attribution trailer.

## Phase Completion Rules

Single phase. It is `CODE DONE` when checklist steps 1-5 are finished and the CI gate set is green. It is only `VERIFIED` when the live probe section is run on the running app with BOTH negative controls (N1 string mutation goes red, N2 success toast appears) and BOTH regression checks (R1 board-row inline error, R2 `convert` banner) recorded with actual DOM evidence. Green tests alone do not promote this to VERIFIED.

- **Branch:** `feat/uiux-phase-4` (PR #13), clean at `0a2f11d`
- **Risk class:** low — one UI deletion, no server, no schema, no auth

## Goals

1. A refused status change or stage move shows exactly ONE message.
2. That message is the error toast (assertive), not the page banner.
3. The two other error surfaces on the same page still render.
4. The route stops having zero error-surface test coverage.

## Non-goals

- Do not touch `src/lib/utils/submit-feedback.svelte.ts`.
- Do not touch `src/lib/components/ui/Toaster.svelte` or `Banner.svelte`.
- Do not touch the board-row inline error (lines 211-212) or the `convert` banner (lines 226-227).
- Do not change any server action, guard, or `failFromError`.
- Do not re-open whether the deletion is correct — it is approved.

## Touchpoints

| File | Change |
|---|---|
| `src/routes/(app)/recruitment/[id]/+page.svelte` | delete lines 84-88 (comment + `{#if}` block). Nothing else. |
| `tests/e2e/form-errors.spec.ts` | add one test (see step 3). |

Read-only (context, do not edit): `src/lib/utils/submit-feedback.svelte.ts`, `src/lib/components/ui/Toaster.svelte`, `src/lib/components/ui/Banner.svelte`, `src/routes/(app)/recruitment/[id]/+page.server.ts`, `src/lib/components/recruitment/ApplicantKanban.svelte`.

## Public Contracts

None change. Server actions keep returning `{ action, error }` on failure; `submit-feedback` keeps reading `result.data.error`. The only change is which DOM node renders that string.

Accessibility contract is preserved: the deleted `Banner kind="error"` carried `role="alert"`; the error toast carries `aria-live="assertive"` (`Toaster.svelte:64`). The assertive announcement survives.

## Blast Radius

- 1 source file, 5 lines deleted.
- 1 test file, ~25 lines added.
- No package, schema, API, auth, billing, or migration surface.
- Reachable UI: the `Close Posting` / `Publish` / `Reopen` buttons and the kanban `move`. Nothing else reads `form.action === 'updateStatus' | 'advanceStage'`.

## Established facts (research is DONE — do not re-derive)

- `closePosting`, `publishPosting`, `reopenPosting` (route lines 16-18) and `move` (`ApplicantKanban.svelte:32`) are plain `submitFeedback()` with no `error` option, so a `failure` always toasts: `result.data.error` first, then `FRIENDLY_ERROR` (`submit-feedback.svelte.ts:83-88`).
- `move`'s `inner` suppresses only the internal `update()`, never `addToast` (`submit-feedback.svelte.ts:70-90`).
- `channelGuard = submitFeedback({ error: null })` is a different guard, used only by `?/setChannel`. Out of scope.
- Two of five server failure paths already bypass the banner: `failFromError` returns no `action` (`form-fail.ts:12-15`), so `+page.server.ts:98` and `:132` never matched. Only `:79` (`Invalid input`), `:112` (`Invalid status`) and `:120` (`Posting not found`) reach it today.
- The `Banner` import at line 4 must STAY — line 227 still uses it.
- No test at any layer asserts this banner.
- Precedent: `c2e0e20` did this for `/requests`, `/requests/approvals` and `/leave`. Its rule (forms onto `submitFeedback` FIRST, banners SECOND) is already satisfied here.

## Implementation Checklist

1. **Delete the block.** In `src/routes/(app)/recruitment/[id]/+page.svelte`, delete lines 84-88 inclusive — the two-line HTML comment AND the `{#if}` block. Leave one blank line between the closing `</div>` at line 82 and the `<!-- The posting actions sit under… -->` comment.

   BEFORE (lines 82-90):
   ```svelte
   			</div>

   			<!-- Only `setChannel` errors used to render (down in the boards list), so a publish or
   			     a stage move that a server rule refused read as a no-op. -->
   			{#if (form?.action === 'updateStatus' || form?.action === 'advanceStage') && form?.error}
   				<Banner kind="error" message={form.error} />
   			{/if}

   			<!-- The posting actions sit under the summary they act on, not on the title row. -->
   ```

   AFTER (lines 82-84):
   ```svelte
   			</div>

   			<!-- The posting actions sit under the summary they act on, not on the title row. -->
   ```

2. **Do NOT touch the import.** Line 4 `import Banner from '$lib/components/ui/Banner.svelte'` stays — line 227 (`convert`) still uses it. Confirm with `grep -n "<Banner" "src/routes/(app)/recruitment/[id]/+page.svelte"` → must return exactly one hit (the `convert` banner).

3. **Add the missing e2e guard** to `tests/e2e/form-errors.spec.ts`, following the two existing tests in that file. Use `USERS.admin` (or `USERS.hr`) and the seeded posting `jp_seed_demo` — `job-board-tracking.spec.ts:38` already drives it. Shape:
   - `login`, `goto('/recruitment/jp_seed_demo')`, `waitForLoadState('networkidle')` (hydration — same reason `job-board-tracking.spec.ts` waits).
   - Locate `form[action*="updateStatus"]`, set its hidden input: `form.locator('input[name="status"]').evaluate((el: HTMLInputElement) => { el.value = 'BOGUS' })`.
   - Submit via the form's own button (`Close Posting` / `Publish` / `Reopen` — match `/Close Posting|Publish|Reopen/`).
   - ASSERT the toast: `await expect(page.locator('[role="status"] [aria-live="assertive"]')).toHaveText(/Invalid status/)`.
   - ASSERT it is not doubled: `await expect(page.locator('[role="status"] [aria-live="assertive"]')).toHaveCount(1)` and `await expect(page.getByRole('alert')).toHaveCount(0)`.
   - No explanatory comments beyond the one-line "why this test exists" header the file already uses at the top; keep it to one sentence if added at all.

4. **Run the CI gate set** (all four, in CI order — `format:check` runs first and skips the rest on failure):
   ```
   pnpm format:check && pnpm lint && pnpm check && pnpm test
   ```

5. **Run the new e2e** (build + preview tier):
   ```
   pnpm test:e2e -- form-errors
   ```

6. **Run the live probe** (section below) before committing.

7. **Commit** with the message in the Commit section. No push unless the owner asks.

## Verification Evidence

Selectors, fixed. `getByRole('alert')` is the BANNER only — the toast is NOT `role="alert"`; the toast region is `div[role="status"]` and an error toast is its child with `aria-live="assertive"` (`Toaster.svelte:44,64`).

| Gate / Scenario | Strategy | Proves criterion |
|---|---|---|
| `pnpm format:check && pnpm lint && pnpm check` clean | Fully-Automated | the deletion leaves no unused import / dangling block |
| `pnpm test` green | Fully-Automated | no unit/component test depended on the banner |
| New `form-errors.spec.ts` case: `BOGUS` status → exactly one `[aria-live="assertive"]` toast reading `Invalid status`, and `getByRole('alert')` count 0 | Hybrid (needs build+preview + seeded DB) | Goals 1, 2, 4 |
| Live browser probe, positive + negative controls (below) | Agent-Probe | Goals 1, 2 on the real running app |
| Live regression probe of the two out-of-scope surfaces (below) | Agent-Probe | Goal 3 |

### Live probe — setup

App is already running at `http://localhost:5173` with headed Chromium on CDP `9222`. Do NOT start servers. Log in:

```
POST http://localhost:5173/api/v1/_dev/login-as   body: {"email":"hr@veent.ph"}
```

Then navigate to `/recruitment/jp_seed_demo` and `waitForLoadState('networkidle')` before touching anything (hydration reconciles hidden inputs otherwise).

### Live probe — POSITIVE control (the toast still fires, with the right words)

1. In the page, set the `?/updateStatus` form's hidden input to a value the server rejects:
   `document.querySelector('form[action*="updateStatus"] input[name="status"]').value = 'BOGUS'`
2. Click that form's own submit button (`Close Posting`, `Publish`, or `Reopen` — whichever the current status renders).
3. Assert, in the DOM:
   - `document.querySelectorAll('[role="status"] [aria-live="assertive"]').length === 1`
   - that node's `textContent` contains `Invalid status`
   - `document.querySelectorAll('[role="alert"]').length === 0` — this is the whole point: before the change it was 1.
4. Record the actual outerHTML of the toast node in the report. Do not report "it worked".

### Live probe — NEGATIVE controls (prove the check can go red)

Two are required. A check that cannot fail is not a check.

- **N1 — string mutation.** Re-run step 3 asserting `textContent` contains `Invalid stAAAtus`. It MUST fail. This proves the assertion reads the real node and not a stale/empty one.
- **N2 — feedback still alive on the happy path.** Reload the page (clears the toast), submit the SAME form untouched (a real, valid status change). A SUCCESS toast must appear: one `[role="status"] > div` whose text is the server's own words (`?/updateStatus` returns `saved`). If nothing appears, the deletion broke the feedback path and the change is wrong. Restore the posting to its original status afterwards (`jp_seed_demo` is shared fixture data — `job-board-tracking.spec.ts` expects it OPEN).

### Live probe — REGRESSION (the two out-of-scope surfaces still render)

Both must be checked ON THE SAME PAGE, after the deletion.

- **R1 — board-row inline error.** In the boards list, submit a `?/setChannel` row with a URL the server refuses (an over-length / malformed URL — the cap landed in `0a2f11d`). Assert a `p` with class `text-red-600` appears INSIDE that row's `<form>` and nowhere else, and that its text is the server's message. Assert no toast fires for it (`channelGuard` is `submitFeedback({ error: null })`).
- **R2 — `convert` banner.** With a hired applicant present, force a `?/convert` failure (submit `convert` for an applicant that will be refused — e.g. one already converted). Assert `document.querySelectorAll('[role="alert"]').length === 1` and that node sits inside the "Hired Applicants" card. This is the one `role="alert"` that must survive.

If a hired applicant is not present in the seed, say so and mark R2 `BLOCKED — no fixture`; do not fabricate a pass and do not create employee records to manufacture one.

## E2E coverage recommendation

**Add it. Yes.** Reason: this route has zero error-surface coverage at any layer, and this change removes the only surface anything could have keyed on — after it, the sole proof a refusal is reported at all is a toast that no test asserts. `tests/e2e/form-errors.spec.ts` already exists for exactly this class of defect (#106: an action returned an error that nothing rendered) and already carries the hidden-input mutation trick. Cost is one test in a file that exists; the alternative is a route where a silent refusal regression ships green.

Scope note: one test, `updateStatus` only. Do NOT also add a kanban `advanceStage` case — the `move` guard is shared plumbing already exercised by `recruitment.spec.ts`, and a second case widens the diff past the request.

## Test Infra Improvement Notes

- `tests/e2e/form-errors.spec.ts` asserts on `getByRole('alert')`, which only matches `Banner`. As pages migrate from banner to toast (this change, and `c2e0e20` before it), that selector silently stops matching. A shared helper (`expectErrorToast(page, /text/)`) would be worth having, but it is OUT OF SCOPE here — note it, do not build it.

## Risks

| Risk | Mitigation |
|---|---|
| The `Banner` import goes unused and lint fails | It does not — line 227 uses it. Step 2 greps to confirm. |
| A refusal path that returns no `action` now shows nothing | It already showed nothing (`form-fail.ts:12-15`); those paths toast via `submitFeedback`. N2 proves the toast path is alive. |
| Deleting the wrong `{#if}` (three error blocks live on this page) | The target is the ONLY one keyed on `form?.action === 'updateStatus' \|\| … 'advanceStage'`. R1/R2 prove the other two survive. |
| The live probe mutates shared seed data (`jp_seed_demo`) | N2 says restore the posting status. R2 must not create employees. |

## Rollback

`git revert` of the single commit, or `git checkout HEAD~1 -- "src/routes/(app)/recruitment/[id]/+page.svelte"`. No data, no migration, nothing to undo server-side.

## Commit

One commit. Conventional. No attribution trailer, no footer, no `Co-Authored-By` of any kind.

```
fix(recruitment): report a refused status change once, as a toast

The posting detail page rendered a page-level Banner for `updateStatus` and
`advanceStage` failures while all four forms were already on `submitFeedback`,
which toasts the same string. A refusal read twice. The banner goes; the toast
carries aria-live="assertive", so the assertive announcement is unchanged.

Adds the route's first error-surface e2e guard.
```

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)

## Resume and Execution Handoff

1. **Selected plan:** `process/general-plans/active/recruitment-detail-banner-dedupe_10-09-26/recruitment-detail-banner-dedupe_PLAN_10-09-26.md`
2. **Last completed step:** PLAN written. Nothing implemented.
3. **Validate-contract status:** pending.
4. **Context loaded:** `+page.svelte` (lines 1-30, 78-140, 205-232), `+page.server.ts` (70-135), `submit-feedback.svelte.ts` (60-95), `Toaster.svelte`, `Banner.svelte`, `tests/e2e/form-errors.spec.ts`, `tests/e2e/helpers.ts`, `tests/e2e/job-board-tracking.spec.ts`.
5. **Next step for a fresh agent:** checklist step 1 — delete lines 84-88 of `src/routes/(app)/recruitment/[id]/+page.svelte`. Confirm the file still has exactly one `<Banner` before moving on.

## Standing constraints

- No explanatory comments added to source. The why goes in the commit message.
- Surgical: every changed line traces to this request.
- Do not commit or push unless the owner asks.
