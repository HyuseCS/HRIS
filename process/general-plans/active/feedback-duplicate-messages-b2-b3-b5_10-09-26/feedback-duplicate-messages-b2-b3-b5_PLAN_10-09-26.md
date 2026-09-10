---
name: plan:feedback-duplicate-messages-b2-b3-b5
description: "One message per action on /settings/roles and /requests/timesheets, plus the six Reject/Return ellipsis labels — phase 04 feedback contract"
date: 10-09-26
feature: uiux-phase-4
---

# B2 / B3 / B5 — one message per action, and drop the ellipsis

**TL;DR** — Four commits. (1) Delete the hand-rolled error strip on `/settings/roles` (9 lines) — the toast already fires. (2) Put the two bulk timesheet actions on `submitFeedback` so they have a voice BEFORE anything is deleted. (3) Delete both page banners on `/requests/timesheets` **and** the modal's own `form?.error` strip, leaving the toast as the single voice. (4) Strip `…` from six button labels. Bulk approve/reject have zero tests today — this plan adds two unit tests and one e2e that asserts "exactly one visible message", which is the whole point of phase 04.

**Date**: 10-09-26
**Status**: NOT STARTED
**Complexity**: SIMPLE (4 independently committable sections)
**Branch**: `feat/uiux-phase-4`, clean, ahead 3 of origin
**Risk class**: low-medium — UI only, no server logic change, no schema, no auth. The medium comes from one shared component (`TimesheetModal`) and from deleting error surfaces, which has silenced forms in this repo before.

## Overview

Three filed findings, one rule. The owner's rule, applied five times now:

> **One message per action, whichever surface sits NEAREST THE BUTTON.**

It is not "delete the banner". Both precedents are real and they point opposite ways:

| Precedent | Shape | Ruling |
|---|---|---|
| `661719d` (F3, recruitment posting status) | banner in the page header, button far below | banner deleted, toast kept |
| `0a2f11d` (recruitment job-board rows) | inline error sitting ON the row, beside its own button | toast suppressed via `submitFeedback({ error: null })`, inline kept |

Each surface in this plan is graded against that rule, and the grade is written down with what breaks if it is wrong.

Context routing was loaded via `process/context/all-context.md`; the test chain via `process/context/tests/all-tests.md`. Unit tier is `vitest` (`pnpm test`), e2e tier is Playwright against build+preview (`CI=1 pnpm test:e2e`).

## Scope

**IN**: B2 (`/settings/roles` strip), B3 (`/requests/timesheets` duplicate review message + the bulk-action voice it depends on), B5 (six ellipsis labels).

**OUT — do not touch, do not mention in the diff:**

- **§T2** — the hand-rolled green `bg-green-600` Approve buttons and `app.css` button tokens. That is **GitHub issue #27**. Four call sites, including two files this plan edits (`TimesheetModal.svelte:566`, `requests/timesheets/+page.svelte:105`). Edit the label, never the class list.
- `/timesheets` (the employee edit page). It shares `TimesheetModal`, so §3 reaches it — §3 states exactly what changes there and proves nothing is silenced. No edit to `src/routes/(app)/timesheets/+page.svelte`.
- `src/lib/utils/submit-feedback.svelte.ts`, `submit-guard.svelte.ts`, `Banner.svelte`, `Toaster.svelte`, `toast.svelte.ts`, `ConfirmButton.svelte` — all read-only context.
- Any server action's logic. §2 adds nothing to `+page.server.ts`.
- Busy-state labels (`Saving…`, `Working…`, `Approving…`, `Confirming…`, `Punching in…`, a bare `…`), `<option>` text, and input placeholders. B5 is six labels, named exactly.

### The `skipped` counter — explicitly OUT OF SCOPE

`approveMany` (`+page.server.ts:133`) and `rejectMany` (`:165`) swallow every per-row exception into a `skipped` count and always return **success**. A batch where all five rows fail returns `saved: "Approved 0 timesheets, 5 skipped."` — a green success toast for a total failure.

**Ruling: not in scope, and §2 must not "improve" it.** Reasons: (a) it is a server-semantics defect, not a duplicate-message defect, and this plan is the feedback contract; (b) fixing it means deciding what a partial batch *should* return, which is a product decision the owner has not made; (c) widening §2 into the server would put a behaviour change in the same commit as a feedback change, which is exactly the fragmentation this repo avoids. §2 wires the existing string to a toast verbatim and nothing else.

**Action required:** EXECUTE files this as a backlog note at
`process/features/ui-ux-overhaul/backlog/bulk-timesheet-skipped-counter_NOTE_10-09-26.md`
before closing §2 — one short note recording the `0 approved, 5 skipped` case and that the owner has not ruled on it. Do not fix it. Do not open a GitHub issue without asking.

## Goals

1. A refused `setActive` on `/settings/roles` reports exactly ONCE.
2. Every bulk timesheet outcome — success, 403, and both 400s — reports at least once, and exactly once.
3. A timesheet review outcome (approve or reject, success or failure) reports exactly ONCE.
4. A rejection is never announced in a green success box.
5. Six buttons lose their trailing `…`.
6. `approveMany` / `rejectMany` stop being a zero-coverage surface, and something somewhere asserts "exactly one visible message per outcome".

## Acceptance Criteria

1. `src/routes/(app)/settings/roles/+page.svelte` contains **zero** references to `form.error` / `form.saved` (it has 2 before). The `#283` in-dialog `saveError` strip still renders and still takes focus.
2. Both bulk forms on `src/routes/(app)/requests/timesheets/+page.svelte` use `bulkFb.enhance`; **zero** occurrences of `use:enhance={clearOnSuccess}` remain. `clearOnSuccess` itself is unchanged.
3. `approveMany` and `rejectMany` each return a non-empty, **distinct** `saved` string; the three refusal paths (403, `No timesheets selected`, `A reason is required to reject.`) each return a non-empty `error` string — pinned by new unit tests in `tests/unit/request-decide-feedback.test.ts`.
4. `src/routes/(app)/requests/timesheets/+page.svelte` contains **zero** occurrences of `Banner` — both `{#if}` blocks and the import are gone.
5. `src/lib/components/timesheets/TimesheetModal.svelte` contains **zero** occurrences of `form?.error`. The `REJECTED` stored-reason panel and the `form` prop both survive.
6. A bulk 400 on `/requests/timesheets` produces exactly ONE `[role="status"] [aria-live="assertive"]` node and `getByRole('alert')` count **0** — asserted by a new test in `tests/e2e/form-errors.spec.ts`.
7. A timesheet rejection produces one toast reading `Timesheet rejected.` and **no green success box anywhere** on the page.
8. A failed `?/review` produces exactly one message, it is the toast, and it renders above the open modal (toast container computed `z-index` 100 vs dialog 50, node inside the viewport rect).
9. `/timesheets` (shared `TimesheetModal`) still reports a failed `?/saveEntries` — exactly one toast, modal stays open, no destructive strip.
10. The total `…` count across the four B5 files drops from **12 to 6**; the six survivors are the two busy-state labels and the four placeholders named in the B5 table.
11. `grep -rn "exact: true" tests/e2e/ | grep -iE "reject|return"` returns **0 hits**.
12. `pnpm format:check && pnpm lint && pnpm check && pnpm test` green after every section, plus `CI=1 pnpm test:e2e -- form-errors`, `CI=1 pnpm test:e2e -- timesheet-approval timesheet-punch manager-org-wide-timesheets`, and `CI=1 pnpm test:e2e -- approval-chain multi-role-sod timesheet-approval`. The pre-existing attendance e2e failure is recorded as pre-existing, not fixed.
13. Four commits, conventional, no attribution trailer of any kind. `skipped`-counter backlog note filed.

## Phase Completion Rules

Four sections, each its own commit and its own gate.

- A section is **CODE DONE** when its edits are made, its `grep` guards return the stated counts, and the CI gate set (`pnpm format:check && pnpm lint && pnpm check && pnpm test`) is green.
- A section is **VERIFIED** only when its live probes are recorded with **actual DOM evidence** (`outerHTML`, computed styles, counts) AND **both negative controls fired** AND every regression check in that section is recorded PASS / FIXED / BLOCKED with the command or step that produced it.
- Green tests alone never promote a section to VERIFIED. A probe recorded as "it worked" is not evidence.
- §3 additionally cannot reach VERIFIED without probe **R2** (the `/timesheets` shared-modal non-silencing check) — if R2 shows no toast, §3 is reverted, not patched.
- A probe blocked by a missing fixture is recorded `BLOCKED — no fixture` and the section stays CODE DONE. Do not fabricate fixtures or seed the owner's dev database to manufacture a pass.
- The whole plan is complete when all four sections are VERIFIED and the four commits exist. No push unless the owner asks.

## Implementation Checklist

Ordered. §1 and §4 are order-independent; **§2 must precede §3**.

1. §1 step 1 — delete `settings/roles/+page.svelte:156-164` (comment + `{#if form?.error}` + strip).
2. §1 step 2 — `grep -c "form?.error\|form\.error\|form?.saved"` on that file → must be `0`.
3. §1 step 4 — run the CI gate set.
4. §1 step 5 — run live probes P1, P2, N1, N2, R1; record DOM evidence.
5. §1 — commit 1.
6. §2 step 1 — add the `submitFeedback` import to `requests/timesheets/+page.svelte`.
7. §2 step 2 — add `const bulkFb = submitFeedback({ inner: clearOnSuccess })` after `clearOnSuccess`.
8. §2 step 3 — swap both forms (`?/approveMany` `:100`, `?/rejectMany` `:105-109`) onto `bulkFb.enhance`.
9. §2 step 4 — leave `disabled={busy}` and the page's own `busy` alone.
10. §2 step 6 — add the two unit tests to `tests/unit/request-decide-feedback.test.ts` (no new mock wiring).
11. §2 step 7 — run the CI gate set.
12. §2 step 8 — run live probes P1, P2, P3, N1, N2.
13. §2 step 9 — file `process/features/ui-ux-overhaul/backlog/bulk-timesheet-skipped-counter_NOTE_10-09-26.md`.
14. §2 — commit 2.
15. §3 step 1 — delete `requests/timesheets/+page.svelte:66-72` (both `<Banner>` blocks).
16. §3 step 2 — delete the `Banner` import (line 5); `grep -c "Banner"` → must be `0`.
17. §3 step 3 — keep the `form` prop destructure at `:14`.
18. §3 step 4 — delete `TimesheetModal.svelte:347-353` (the `{#if form?.error}` strip).
19. §3 step 5 — leave the `REJECTED` reason panel, all four guards, and every class list untouched.
20. §3 step 6 — add the one e2e to `tests/e2e/form-errors.spec.ts` (bulk 400, exactly-one assertion).
21. §3 step 7 — run the CI gate set.
22. §3 step 8 — `CI=1 pnpm test:e2e -- form-errors`, then `CI=1 pnpm test:e2e -- timesheet-approval timesheet-punch manager-org-wide-timesheets`.
23. §3 step 9 — run live probes P1, P2, P3, N1, R1, R2, R3. **R2 is mandatory.**
24. §3 — commit 3.
25. §4 step 1 — re-grep `'…'` across the four files; expect 12 hits, match the B5 table by label text not line number.
26. §4 step 2 — remove the U+2026 from exactly the six named labels.
27. §4 step 4 — `grep -c '…'` per file → 1 / 1 / 2 / 2, total `6`.
28. §4 step 5 — `grep -rn "exact: true" tests/e2e/ | grep -iE "reject|return"` → `0`.
29. §4 step 6 — run the CI gate set.
30. §4 step 7 — `CI=1 pnpm test:e2e -- approval-chain multi-role-sod timesheet-approval`.
31. §4 step 8 — run live probes P1-P4 and N1.
32. §4 — commit 4.

## The three surface rulings

### B2 — `/settings/roles`: the strip goes, the toast wins

Verified, not assumed:

- Only `?/setActive` can populate the page-level `form.error`. Its guard (`+page.svelte:29`) is a bare `submitFeedback()` — no `error` option — so a failure always toasts `data.error`, falling back to `FRIENDLY_ERROR` (`submit-feedback.svelte.ts:83-88`).
- The sibling `setRole` guard (`:44`) deliberately **skips `update()` on failure** (#283, documented at `:32-43`), so a rejected role save never publishes to the page-level `form`. It renders in-dialog at `:328-336` with focus pulled onto it.
- Grep for other readers of `form.error` / `form.saved` on this route: **zero hits** beyond the strip itself.
- No test at any layer asserts this strip: `grep "getByRole('alert')\|role=\"alert\"\|destructive" tests/e2e/settings-roles.spec.ts` → 0 hits.

**Ruling: F3 shape.** The strip sits at the top of the page under `PageHeader` (`:156-164`); the buttons are down in table rows, potentially many screens below. Nearest-the-button says the strip is not it. Delete the strip.

**If this is wrong:** a refused deactivation would report only as a toast that auto-dismisses after 6s (`toast.svelte.ts` `DEFAULT_TIMEOUT`). Proof it is not wrong is the live probe in §1, which asserts the toast fires with the server's exact words and that `role="alert"` count on the page is 0 while the toast text is present.

### B3 — `/requests/timesheets`: the note was REFUTED. The bulk actions have no toast.

The note said "check the bulk actions first". **The check came back negative.**

- `Approve selected` (`?/approveMany`, `+page.svelte:101`) and `Reject selected…` (`?/rejectMany`, `:109-113`) are on a **bare `use:enhance={clearOnSuccess}`**.
- `clearOnSuccess` (`:30-40`) is a plain `SubmitFunction`. Not `createSubmitGuard`. Not `submitFeedback`. It calls `update()`, clears the selection on success, and toasts nothing.
- The page **imports no toast helper at all** (`:1-12`).

So the page banners at `:66-68` (`form?.error`) and `:70-72` (`form?.saved`) are the ONLY voice for four outcomes:

| Outcome | Source | Today's only surface |
|---|---|---|
| bulk approve success | `+page.server.ts:135-137` `saved: "Approved N timesheets…"` | success banner |
| bulk reject success | `+page.server.ts:167-169` `saved: "Rejected N timesheets…"` | success banner |
| 403 `Insufficient permissions` | `:117`, `:148` | error banner |
| 400 `No timesheets selected` / `A reason is required to reject.` | `:123`, `:157-159` | error banner |

Deleting the banners first would reproduce the documented `removing-a-banner-can-silence-errors` defect exactly. **Owner's decision: give the bulk actions a toast FIRST (§2), then delete the banners (§3).** Two commits, in that order, never merged.

### B3 — the review path: THREE surfaces today, and the decision

A **failed** `?/review` currently shows the same string three times:

1. page error banner (`requests/timesheets/+page.svelte:66-68`)
2. the modal's own strip (`TimesheetModal.svelte:347-353`)
3. the toast, from `closeFb` (`TimesheetModal.svelte:273`)

Why all three fire: `closeOnSuccess` (`:261-268`) calls `await update({ reset: false })` unconditionally and only closes on success — so on failure the modal stays open, `form.error` is published to the page-level `form`, the page renders it, the page passes `{form}` back into the modal (`requests/timesheets/+page.svelte:172`), and the modal renders it again. `closeFb` toasts on top.

Deleting the page banners in §3 removes surface 1. **Two are left, and the plan must pick one.**

> **DECISION: delete the modal strip. The toast wins.**

**Why.** The strip at `:347` is not near the button. `Dialog` is mounted `size="full"` with `scroll` (`TimesheetModal.svelte:283-291`); the strip sits in the summary block, *above* the entries table, and the action buttons are in the footer at `:527+`, in the same scroll flow. On a timesheet with a fortnight of entries the strip is scrolled off the top of the dialog when the user presses Approve. That is the **F3 shape**, not the `0a2f11d` shape — `0a2f11d` kept the inline error because it sat physically on the row beside its own button. This one does not.

The toast, by contrast, is `position: fixed`, top-right, at `z-[100]` (`Toaster.svelte:48`) — strictly above the `Dialog`'s `zIndex={50}`. It is the only one of the two guaranteed to be in the viewport at the moment the button is pressed.

**Why NOT the alternative** (keep the strip, suppress the toast for review only): it would need a fourth guard, because `closeFb` (`:273`) drives `?/review`, `?/saveEntries`, `?/syncAttendance` AND the `?/delete` `ConfirmButton`'s inner. Passing `error: null` there would silence all four. The minimal version is a new `reviewFb = submitFeedback({ inner: closeOnSuccess, error: null })` used by the two `?/review` forms only (`:561` and the hidden reject form at `:506-517`) — one extra guard, one extra concept, and it leaves the message in the surface that can be off-screen. Rejected: more code, worse placement.

**What breaks if this decision is wrong:** a review failure would report only in a 6s-lived toast. The specific loss is that the message no longer *persists* while the modal is open, so a user who looks away misses it. §3's live probe therefore has to prove the toast is (a) present, (b) readable, (c) stacked above the open modal, with a negative control — not just that the strip is gone.

**Blast onto `/timesheets` (edit mode) — the load-bearing check.** `TimesheetModal` is shared: `requests/timesheets/+page.svelte:172` (`mode="review"`) and `timesheets/+page.svelte:252-260` (`mode="edit"`). Deleting the strip reaches the edit page. Verified that nothing is silenced there:

- `timesheets/+page.svelte:215` already reads `{#if form?.error && !openTs}` — the page banner is **deliberately suppressed while the modal is open**. Today the strip is the in-modal voice; after §3 the toast is.
- Every writer on that page toasts on failure: `?/saveEntries` → `keepOpenFb` (`TimesheetModal.svelte:274`, bare `submitFeedback`, always toasts); `?/review` / `?/syncAttendance` → `closeFb` (`:273`, same); `?/delete` → `ConfirmButton`, which builds its **own** `submitFeedback` internally (`ConfirmButton.svelte:50-55`) with no `error` option, so it toasts too. **No surface is left mute.** §3's regression probe R2 proves this on the running app.
- Known, accepted, out of scope: `timesheets/+page.svelte:219` (`form?.saved`) has no `!openTs` guard, so a *successful* modal action on the edit page still shows banner + toast. That is the same class of defect on a page this plan does not own. Record it in the report; do not fix it.

**The e2e that already knows about this.** `tests/e2e/timesheet-approval.spec.ts:126-128` is scoped to `getByRole('main')` with the comment "phase 04 also toasts this message, and a page-wide locator now matches both the page banner and the toast". **It targets `/timesheets`, not `/requests/timesheets`** — `hrPage.goto('/timesheets')` at `:111`, asserting `'Timesheet submitted for review.'`, which is a `?/submit` on the edit page. This plan does not touch that page's banners, so the assertion is **unaffected**. Two sibling assertions have the same shape and are likewise unaffected: `timesheet-punch.spec.ts:95,117` and `manager-org-wide-timesheets.spec.ts:113`, all on `/timesheets`. §3 re-runs all three anyway.

Also unaffected: `helpers.ts:79` `dialog.getByRole('button', { name: 'Approve' })` — scoped to the dialog, and `Approve` is not a substring of `Reject…`.

### B5 — six labels, exactly

Character is **U+2026 `…`**, never three literal dots. Confirmed by `grep -n '…'` at every line below.

| # | File | Line | Now | After |
|---|---|---|---|---|
| 1 | `src/lib/components/timesheets/TimesheetModal.svelte` | 559 | `Reject…` | `Reject` |
| 2 | `src/routes/(app)/requests/timesheets/+page.svelte` | 122 | `Reject selected…` | `Reject selected` |
| 3 | `src/routes/(app)/requests/proposals/+page.svelte` | 213 | `Reject…` | `Reject` |
| 4 | `src/routes/(app)/requests/approvals/+page.svelte` | 219 | `Reject selected…` | `Reject selected` |
| 5 | `src/routes/(app)/requests/approvals/+page.svelte` | 367 | `Return…` | `Return` |
| 6 | `src/routes/(app)/requests/approvals/+page.svelte` | 374 | `Reject…` | `Reject` |

**Do NOT touch** — same files, same grep, deliberately excluded: `requests/timesheets/+page.svelte:178` (placeholder), `requests/approvals/+page.svelte:360` (`Approving…` busy state), `:412` (placeholder), `requests/proposals/+page.svelte:202` (`Confirming…` busy state), `:240` (placeholder), `TimesheetModal.svelte:522` (placeholder).

**Locator risk — checked.** `grep -rn "Reject" tests/` returns only `mockRejectedValue` hits; nothing selects any of these six by name. Playwright's `name:` is a **case-insensitive substring** match by default, so the question is whether removing `…` creates a NEW match. It cannot: `"Reject…"` already contains `"Reject"`, so any substring locator that matches after the change matched before it. The one way to break is `{ exact: true }` on the *old* string, or an `exact: true` name of `'Reject'`/`'Return'` that newly matches — `grep -rn "exact: true" tests/e2e/ | grep -iE "reject|return|approve"` returns **zero** button-name hits (only `getByText('Approver'|'HR Admin')` role-label assertions on `settings-roles.spec.ts` and `posting-approver-sod.spec.ts`, which are unrelated text nodes). B5 is locator-safe. §4 re-greps as step 1 anyway.

## Touchpoints

| File | Section | Change |
|---|---|---|
| `src/routes/(app)/settings/roles/+page.svelte` | §1 | delete `:156-164` (comment + `{#if form?.error}` + strip) |
| `src/routes/(app)/requests/timesheets/+page.svelte` | §2 | swap `clearOnSuccess` from bare `enhance` onto `submitFeedback({ inner: clearOnSuccess })`; add the import |
| `src/routes/(app)/requests/timesheets/+page.svelte` | §3 | delete `:66-72` (both `<Banner>` blocks) and the now-unused `Banner` import |
| `src/lib/components/timesheets/TimesheetModal.svelte` | §3 | delete `:347-353` (`{#if form?.error}` strip) |
| `src/lib/components/timesheets/TimesheetModal.svelte` | §4 | line 559 label |
| `src/routes/(app)/requests/timesheets/+page.svelte` | §4 | line 122 label |
| `src/routes/(app)/requests/proposals/+page.svelte` | §4 | line 213 label |
| `src/routes/(app)/requests/approvals/+page.svelte` | §4 | lines 219, 367, 374 labels |
| `tests/unit/request-decide-feedback.test.ts` | §2 | add one `describe` block, two tests |
| `tests/e2e/form-errors.spec.ts` | §3 | add one test |
| `process/features/ui-ux-overhaul/backlog/bulk-timesheet-skipped-counter_NOTE_10-09-26.md` | §2 | new backlog note |

Read-only context (do not edit): `src/lib/utils/submit-feedback.svelte.ts`, `src/lib/utils/submit-guard.svelte.ts`, `src/lib/components/ui/Banner.svelte`, `src/lib/components/ui/Toaster.svelte`, `src/lib/stores/toast.svelte.ts`, `src/lib/components/ui/ConfirmButton.svelte`, `src/lib/components/ui/ReasonDialog.svelte`, `src/routes/(app)/requests/timesheets/+page.server.ts`, `src/routes/(app)/timesheets/+page.svelte`.

## Public Contracts

**Nothing server-side changes.** Every action keeps returning `{ error }` on failure and `{ saved }` on success. `submit-feedback.svelte.ts` keeps reading `result.data.error` / `result.data.saved`. Only the DOM node that renders those strings changes.

**Component prop contract, `TimesheetModal`:** the `form?: { error?: string } | null` prop (`:44`) **stays** — it is still destructured and still passed by both call sites. §3 removes the only *render* of `form.error` inside the component but the prop is still read by other logic; do not delete the prop, do not delete the destructure. `pnpm check` will flag it if the prop genuinely becomes unused — if it does, leave it and note it, because removing it is a two-call-site change §3 does not own.

**Accessibility contract:** `Banner kind="error"` carries `role="alert"` (`Banner.svelte:42`). The error toast carries `aria-live="assertive"` (`Toaster.svelte:64`). The assertive announcement survives every deletion in this plan. The two hand-rolled strips (`settings/roles:156-164`, `TimesheetModal:347-353`) carry **no** role at all — deleting them is an accessibility net-neutral at worst.

## Blast Radius

- **5 source files**, ~20 lines deleted, ~4 lines added.
- **2 test files** touched, ~60 lines added. **1 backlog note** created.
- 1 shared component (`TimesheetModal`) reaching 2 routes; the second route (`/timesheets`) is analysed above and covered by regression probe R2.
- No package boundary, no schema, no migration, no API, no auth, no billing, no secrets. **No high-risk class present.**
- Reachable UI: the `/settings/roles` status toggles; the `/requests/timesheets` bulk bar and review modal; the `/timesheets` edit modal (read-only impact); three Reject/Return buttons on `/requests/approvals` and `/requests/proposals`.

## Established facts (research is DONE — do not re-derive)

- `submitFeedback` is **additive**: on failure it still calls `update()` unless the `inner` handler returns its own callback, in which case the inner owns `update()` (`submit-feedback.svelte.ts:70-90`). `clearOnSuccess` DOES return its own callback, so `submitFeedback({ inner: clearOnSuccess })` will **not** double-`update()`. §2 relies on this.
- With no `success` option, `submitFeedback` uses the action's own `saved` string as the toast text (`savedMessage`, `:38-40`). `approveMany`/`rejectMany` already return a `saved` string, so §2 needs **no** `success` prop.
- With no `error` option, a `failure` toasts `result.data.error`, falling back to `FRIENDLY_ERROR` (`:83-88`). Both 403s and both 400s carry `error` strings, so §2 needs no `error` prop either.
- `submitFeedback` exposes `busy` (`:97-99`). §2 must read `busy` off the guard, not the page's own `let busy = $state(false)` — see step §2.2.
- Toaster is `z-[100]` fixed top-right (`Toaster.svelte:48`); `TimesheetModal`'s `Dialog` is `zIndex={50}` (`:290`). Toast renders above an open modal.
- Toast auto-dismisses at 6000 ms, pauses on hover/focus (`toast.svelte.ts`, `DEFAULT_TIMEOUT`, `MAX_VISIBLE = 5`).
- `?/review` returns `saved: 'Timesheet approved.' | 'Timesheet rejected.'` through the same `saved` key (`+page.server.ts:110`), which is why a **rejection** renders in a **green** `Banner kind="success"` today. Deleting the banner fixes the colour for free — the toast is dispatched by `kind`, not by `saved`.
- `approveMany`/`rejectMany` have **no unit test and no e2e**: `grep -rln "approveMany\|rejectMany\|Approve selected\|Reject selected" tests/` → 0 hits.
- `tests/unit/request-decide-feedback.test.ts` already hoists `reviewTimesheetMock` and imports `requests/timesheets/+page.server` (`:19,:30,:35`). §2's new tests need **no new mock wiring**.
- `pnpm format:check` is **GREEN** at the current HEAD (`d4c8e41`) — verified 10-09-26. No baseline-clearing commit is needed this time.
- `pnpm test` is `vitest run`. `pnpm test:e2e` is `dotenv -e .env.dev -- playwright test`; the suite runs against build+preview and must be invoked as `CI=1 pnpm test:e2e` (see the 10-09-26 handoff).
- There is a **pre-existing** attendance e2e failure on this branch. It is not caused by this plan. Record it as pre-existing in the report; do not fix it, do not let it block §3.

---

# Section 1 — B2: delete the `/settings/roles` strip

**Independently committable. No dependency on any other section.**

### Steps

1. In `src/routes/(app)/settings/roles/+page.svelte`, delete lines **156-164 inclusive** — the two-line HTML comment AND the `{#if form?.error}` block.

   BEFORE (lines 154-166):
   ```svelte
   	</PageHeader>

   	<!-- `?/setActive` errors only: a rejected role save renders inside the dialog, where the person
   	     who pressed Save is looking. -->
   	{#if form?.error}
   		<div
   			class="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
   		>
   			{form.error}
   		</div>
   	{/if}

   	<div class="overflow-x-auto rounded-lg border">
   ```

   AFTER (lines 154-156):
   ```svelte
   	</PageHeader>

   	<div class="overflow-x-auto rounded-lg border">
   ```

2. **Touch no imports.** `Banner` is not imported on this route (the strip is hand-rolled) and nothing else becomes unused. Confirm:
   ```
   grep -c "form?.error\|form\.error\|form?.saved" "src/routes/(app)/settings/roles/+page.svelte"
   ```
   Must be **0** after the edit (the in-dialog strip at `:328` reads `saveError`, a local, not `form`). Any non-zero means the wrong block was cut.

3. **Do not touch** the `setRole` guard, its `saveError` strip (`:327-336`), or the `#283` comment block at `:32-43`. Those are the deliberate in-dialog surface.

4. Gate set: `pnpm format:check && pnpm lint && pnpm check && pnpm test`.

5. Live probe (below), then commit.

### Live probe — §1

App is already running on `http://localhost:5173`; headed Chromium on CDP `9222`. **Do NOT start servers** — the owner owns them. Log in:

```
POST http://localhost:5173/api/v1/_dev/login-as   body: {"email":"admin@veent.ph"}
```

Go to `/settings/roles`, `waitForLoadState('networkidle')` before touching anything.

- **P1 — positive control (self-deactivation).** Find the row whose email is the logged-in account and submit its `?/setActive` toggle. Assert in the DOM:
  - `document.querySelectorAll('[role="status"] [aria-live="assertive"]').length === 1`
  - that node's `textContent` is the server's refusal for self-deactivation
  - `document.querySelectorAll('[role="alert"]').length === 0`
  - **Record the actual `outerHTML` of the toast node in the report.** Do not report "it worked".
- **P2 — positive control (last active CEO).** Same, on the CEO row (`ceo@veent.ph`). Same three assertions, expecting the 409 text.
- **N1 — negative control, string mutation.** Re-run P1's text assertion against a deliberately corrupted expectation (insert `AAA` mid-word). It MUST fail. A check that cannot fail is not a check.
- **N2 — negative control, the happy path still speaks.** Reload (clears the toast), then deactivate and immediately re-activate a **non-protected, non-self** user. A SUCCESS toast must appear both times. If nothing appears, the deletion broke the feedback path. **Restore the account to its original state** — `settings-roles.spec.ts` reads this table.
- **R1 — regression, the in-dialog surface survives.** Open a role-edit dialog, uncheck every role, Save. Assert the dialog **stays open**, that a `role="alert"` node exists **inside** the dialog with the server's message, and that focus is on it. This is the `#283` behaviour and it must be untouched.

### Success criteria — §1, and how each is PROVEN

| # | Criterion | Proven by | Not proven by |
|---|---|---|---|
| 1.1 | The file contains zero references to `form.error` / `form.saved` | `grep -c` in step 2 = 0 — **fully automated** | — |
| 1.2 | A refused `setActive` shows exactly one message, and it is the toast | live probe P1 + P2, with N1 as the negative control — **agent probe**. Not provable by unit test (no DOM) and not by the existing e2e (no coverage of this strip) | `pnpm test` green |
| 1.3 | The success path still speaks | live probe N2 — **agent probe** | — |
| 1.4 | The `#283` in-dialog refusal is untouched | live probe R1 — **agent probe** | — |
| 1.5 | Nothing else broke | `pnpm format:check && pnpm lint && pnpm check && pnpm test` — **fully automated** | — |

### Rollback — §1

`git revert` the single commit, or `git checkout HEAD~1 -- "src/routes/(app)/settings/roles/+page.svelte"`. No data written, nothing server-side to undo. If the live probe mutated a user's active state, restore it by hand (N2 covers this).

### Commit — §1

```
fix(settings): report a refused account-status change once, as a toast

The roles table rendered a hand-rolled destructive strip on form.error while
every row's setActive form was already on submitFeedback, which toasts the same
string. One refusal read twice — both on the self-deactivation bar and on the
last-active-CEO 409.

The strip was setActive-only: a rejected role save deliberately skips update()
(#283) and renders inside its dialog instead, so nothing else depended on it.
```

---

# Section 2 — B3 part 1: give the bulk actions a voice

**Depends on nothing. MUST land BEFORE §3.** This is the whole point of the ordering: §3 deletes the banners that are, today, the bulk actions' only voice.

### Steps

1. In `src/routes/(app)/requests/timesheets/+page.svelte`, add the import beside the existing ones (`:1-12`):
   ```ts
   import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
   ```

2. Wrap the existing handler. **Keep `clearOnSuccess` exactly as it is** (`:30-40`) — it still owns the selection clear and the `update()`. Add one line after it:
   ```ts
   const bulkFb = submitFeedback({ inner: clearOnSuccess })
   ```
   No `success` option (the server's `saved` string is the message). No `error` option (the server's `error` string is the message). No new abstraction.

3. Swap both forms onto the guard:
   - `:100` `use:enhance={clearOnSuccess}` → `use:enhance={bulkFb.enhance}` (the `?/approveMany` form)
   - `:105-109` `use:enhance={clearOnSuccess}` → `use:enhance={bulkFb.enhance}` (the `?/rejectMany` form)

   **One shared guard is correct here**, not one per form: only one bulk action can be in flight at a time (both submit the same selection from the same bar), so a shared busy lock is the desired behaviour, not a bug. This is the opposite of the per-row case at `settings/roles:28` where a shared guard would freeze the whole table.

4. **The `busy` variable.** The page keeps its own `let busy = $state(false)` (`:23`), set by `clearOnSuccess`. Both buttons read `disabled={busy}` (`:103`, `:118`). `clearOnSuccess` still runs as `inner`, so `busy` still flips — **leave `disabled={busy}` alone**. Do NOT switch the buttons to `bulkFb.busy`; that is a second lock doing the same job and a wider diff. Confirm after the edit that a bulk submit still disables both buttons (probe P3 below).

5. **Change nothing else.** Do not touch `+page.server.ts`. Do not touch the button class lists (that is issue #27). Do not touch the `ReasonDialog` wiring (`:41-55`, `:174-183`).

6. **Add the unit tests** to `tests/unit/request-decide-feedback.test.ts`, in a new `describe` beside the existing `requests/timesheets ?/review success feedback` block (`:94`). The mocks it needs (`reviewTimesheetMock`, the `event()` helper, `timesheets` import) already exist at `:19`, `:30`, `:35`, `:39-48` — add no new mock wiring.

   Two tests, pinning the payload SHAPE the toast will read:
   - `approveMany` and `rejectMany` each return a non-empty `saved` **string**, and the two strings differ. Drive with `event({ ids: 'a,b', rejectionReason: 'fix it' })` and `reviewTimesheetMock` resolving.
   - The refusal paths return a non-empty `error` **string**: no `ids` → `'No timesheets selected'`; `rejectMany` with ids but a blank `rejectionReason` → `'A reason is required to reject.'`; a non-reviewer role → a 403 with `'Insufficient permissions'`. Use `fail`'s returned shape (`result.data.error`), matching how the existing tests read `?.saved`.

   Keep the file's existing style: one short block comment at the top of the new `describe` saying what it pins and what it does not, no per-line narration.

7. Gate set: `pnpm format:check && pnpm lint && pnpm check && pnpm test`.

8. Live probe (below).

9. **File the backlog note** for the `skipped` counter at
   `process/features/ui-ux-overhaul/backlog/bulk-timesheet-skipped-counter_NOTE_10-09-26.md`
   — the `Approved 0 timesheets, 5 skipped.` green-success case, the two line refs (`+page.server.ts:133`, `:165`), and "owner has not ruled". Short. Do not fix it.

10. Commit (source + tests together; the note is part of the same commit or its own `docs:` commit — either is fine, but do not leave it uncommitted).

### Live probe — §2

Log in as an account that can review timesheets (`approver@veent.ph`, or `admin@veent.ph`). Go to `/requests/timesheets`. **Preconditions:** at least one pending timesheet card must be present. If the queue is empty, say so and mark the probe `BLOCKED — no fixture`; **do not fabricate timesheets to manufacture one**, and do not run `db:seed:e2e` against the owner's dev database without asking.

At this point in the sequence the banners **still exist** (§3 has not run). So the assertion for §2 is "**at least one** toast, carrying the right words", and the "exactly one" assertion belongs to §3.

- **P1 — bulk approve success.** Select one card, click `Approve selected`. Assert a `[role="status"]` toast appears whose text matches `/^Approved 1 timesheet/`. Record its `outerHTML`.
- **P2 — a 400 speaks.** Force the empty-selection path: with the bulk bar rendered, blank the hidden input (`document.querySelector('form[action*="approveMany"] input[name="ids"]').value = ''`) and submit that form. Assert an error toast with `aria-live="assertive"` reading `No timesheets selected`.
- **P3 — the busy lock still works.** During P1's in-flight submit, assert both bulk buttons carry `disabled`. This proves step 4's claim that `inner` still flips the page's own `busy`.
- **N1 — negative control.** Re-run P2's text assertion with a corrupted expected string. It MUST fail.
- **N2 — negative control, no toast before the change.** If §2 is being re-verified after the fact, `git stash` is not needed — instead assert the *shape*: with `bulkFb` in place, `submit-feedback`'s failure branch must have produced an `aria-live="assertive"` node. A page whose only error surface is a `Banner` produces `role="alert"`, not `aria-live="assertive"`. Asserting on `aria-live="assertive"` specifically is what makes P2 unable to pass on the old code.

### Success criteria — §2, and how each is PROVEN

| # | Criterion | Proven by | Not proven by |
|---|---|---|---|
| 2.1 | Both bulk forms route through `submitFeedback` | `grep -c "bulkFb.enhance"` = 2 and `grep -c "use:enhance={clearOnSuccess}"` = 0 — **fully automated** | — |
| 2.2 | Every bulk outcome carries a non-empty string the toast can read (2 success, 3 failure) | new unit tests, `pnpm test` — **fully automated**. This is the *payload* half only | that the string reaches the screen |
| 2.3 | The string actually reaches the screen as a toast | live probe P1 + P2 with N1/N2 as controls — **agent probe**. A unit test cannot see the DOM; the e2e for this lands in §3 | `pnpm test` green |
| 2.4 | The double-submit lock survives | live probe P3 — **agent probe** | — |
| 2.5 | Nothing else broke | gate set — **fully automated** | — |

### Rollback — §2

`git revert` the commit. Reverting §2 alone while §3 is already in is **unsafe** — it would leave the bulk actions mute. If §3 has landed, revert §3 first, or revert both together. Write that ordering into the report.

### Commit — §2

```
feat(timesheets): toast the bulk approve and reject outcomes

Both bulk forms were on a bare use:enhance with a plain SubmitFunction, so the
page banner was the only voice for four outcomes: bulk approve, bulk reject, a
403, and the two 400s. The page imported no toast helper at all.

Wrapping the existing handler as submitFeedback's inner keeps the selection
clear and the single update(), and hands the server's own saved/error strings
to the toast. Adds the first tests these two actions have ever had.
```

---

# Section 3 — B3 part 2: delete the page banners and the modal strip

**HARD DEPENDENCY: §2 must be committed and its probe green first.** Landing §3 without §2 reproduces the `removing-a-banner-can-silence-errors` defect verbatim.

### Steps

1. In `src/routes/(app)/requests/timesheets/+page.svelte`, delete lines **66-72 inclusive** — both `{#if}` blocks.

   BEFORE (lines 64-74):
   ```svelte
   	<PageHeader title="Timesheet Approvals" description="Review and approve submitted timesheets." />

   	{#if form?.error}
   		<Banner kind="error" message={form.error} />
   	{/if}

   	{#if form?.saved}
   		<Banner kind="success" message={form.saved} />
   	{/if}

   	{#if data.pendingTimesheets.length === 0}
   ```

   AFTER (lines 64-66):
   ```svelte
   	<PageHeader title="Timesheet Approvals" description="Review and approve submitted timesheets." />

   	{#if data.pendingTimesheets.length === 0}
   ```

2. **Delete the now-unused `Banner` import**, line 5:
   ```ts
   import Banner from '$lib/components/ui/Banner.svelte'
   ```
   Those two were its only uses on this route. Confirm:
   ```
   grep -c "Banner" "src/routes/(app)/requests/timesheets/+page.svelte"
   ```
   Must be **0**. If it is non-zero, a use was missed — stop and re-read. (This is the inverse of the recruitment case, where the import had to STAY.)

3. **Keep the `form` prop destructure** at `:14`. It is still passed to `<TimesheetModal … {form} />` at `:172`. Do not delete it. If `pnpm check` reports it unused after step 4, leave it and note it — removing it is a modal-prop change this section does not own (see Public Contracts).

4. In `src/lib/components/timesheets/TimesheetModal.svelte`, delete lines **347-353 inclusive** — the `{#if form?.error}` strip.

   BEFORE (lines 345-355):
   ```svelte
   		</div>

   		{#if form?.error}
   			<div
   				class="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
   			>
   				{form.error}
   			</div>
   		{/if}

   		{#if ts.status === 'REJECTED' && ts.rejectionReason}
   ```

   AFTER (lines 345-347):
   ```svelte
   		</div>

   		{#if ts.status === 'REJECTED' && ts.rejectionReason}
   ```

5. **Do NOT touch** the `REJECTED` reason panel at `:355-360` — that renders stored data, not a form outcome, and it is a different thing entirely. Do NOT touch `closeFb` / `keepOpenFb` / `closeOnSuccess` / `keepOpen` (`:253-274`). Do NOT add a `reviewFb` guard — that was the rejected alternative. Do NOT touch any button class list (issue #27).

6. **Add the e2e** to `tests/e2e/form-errors.spec.ts`, following the two existing tests in that file (`login` from `./helpers`, `USERS.admin` or `USERS.approver`, `goto(…, { waitUntil: 'domcontentloaded' })`, then a hydration retry via `expect(async () => {…}).toPass({ timeout: 15000 })` — the pattern at `:20-24`).

   **One test.** Scope: the bulk 400 path, because it is deterministic, needs no seeded pending timesheet to *succeed*, and is the exact outcome §2 gave a voice to. Shape:
   - go to `/requests/timesheets`; if the pending queue is empty, `test.skip()` with a message naming the missing fixture (the bulk bar only renders when something is selected)
   - select one card's checkbox so the bulk bar appears
   - blank the hidden `ids` input via `.evaluate((el: HTMLInputElement) => { el.value = '' })` on `form[action*="approveMany"] input[name="ids"]` — the same hidden-input mutation trick this file already uses at `:26-29`
   - submit that form's own button
   - **ASSERT the toast:** `await expect(page.locator('[role="status"] [aria-live="assertive"]')).toHaveText(/No timesheets selected/)`
   - **ASSERT exactly one message — this is the phase-04 assertion and the reason the test exists:**
     `await expect(page.locator('[role="status"] [aria-live="assertive"]')).toHaveCount(1)` **and**
     `await expect(page.getByRole('alert')).toHaveCount(0)`
   - the bare `getByRole('alert')` count-0 is safe **on this route specifically**: after step 1 there is no `Banner` on the page at all, and `Banner` is the only `role="alert"` producer in play (`Banner.svelte:42` gives it to `error` AND `warning`). Confirm with the step-2 grep before trusting it.
   - one short comment at the top saying why the test exists, matching the file's existing style. Nothing else.

7. Gate set: `pnpm format:check && pnpm lint && pnpm check && pnpm test`.

8. E2E: `CI=1 pnpm test:e2e -- form-errors`, then the three sibling specs that carry `getByRole('main')` scoping, to prove they are unaffected:
   ```
   CI=1 pnpm test:e2e -- timesheet-approval timesheet-punch manager-org-wide-timesheets
   ```
   The pre-existing attendance failure is **not** in this list. If it appears in a broader run, record it as pre-existing and move on.

9. Live probe (below), then commit.

### Live probe — §3

Log in as a reviewer at `/requests/timesheets`. Preconditions as in §2 — at least one pending timesheet. If none, mark `BLOCKED — no fixture`; do not fabricate.

- **P1 — a rejection reports once, and not in green.** Open a card's review modal, press `Reject`, give a reason, confirm. Assert:
  - the modal **closes**
  - exactly one `[role="status"]` toast, text `Timesheet rejected.`
  - `document.querySelectorAll('[role="alert"]').length === 0`
  - **no green success box anywhere**: assert zero nodes matching `[class*="green-500/10"]` or `[class*="bg-green-500"]` that contain the string `rejected`. This is the finding's headline — a rejection announced in green — and it must be gone.
  - record the toast `outerHTML` **and** its computed background colour.
- **P2 — an approval reports once.** Same, with `Approve`. One toast reading `Timesheet approved.`, `role="alert"` count 0.
- **P3 — a FAILED review reports once, and it is visible.** Force a failure: open the modal, then `document.querySelector('form[action*="review"] input[name="id"]').value = 'nope'` and submit. Assert:
  - the modal **stays open** (`closeOnSuccess` only closes on success)
  - exactly one `[aria-live="assertive"]` toast with the server's message
  - **zero** destructive strips inside the dialog: `document.querySelectorAll('[role="dialog"] [class*="bg-destructive"]').length === 0`
  - **the toast is stacked above the open modal.** Read the toast container's computed `z-index` (expect `100`) and the dialog's (expect `50`), and confirm the toast node is inside the viewport rect. This is the decision's load-bearing claim; if the toast is behind or off-screen, the decision was wrong and §3 must be reopened, not patched.
- **N1 — negative control, string mutation.** Re-run P1's text assertion with a corrupted expected string. It MUST fail.
- **N2 — negative control, the success path is alive.** P1 and P2 both passing IS this control — if the deletion had broken the feedback path, both would show nothing.
- **R1 — regression, bulk still speaks (this is §2's e2e assertion, live).** Select two cards, `Approve selected`. Exactly one toast, `role="alert"` count 0.
- **R2 — regression, `/timesheets` is not silenced.** This is the shared-component check and it is **mandatory**. Log in as `employee@veent.ph` (or `admin@veent.ph` for a draft), go to `/timesheets`, open a timesheet's modal. Force a `?/saveEntries` failure (corrupt a hidden `id`, or submit an entry the server refuses). Assert:
  - exactly one `[aria-live="assertive"]` toast with the server's message
  - the modal stays open (`keepOpen` never closes)
  - `document.querySelectorAll('[role="dialog"] [class*="bg-destructive"]').length === 0` — the strip is gone
  - and, critically, that the page banner is **still suppressed** while the modal is open (`timesheets/+page.svelte:215` `&& !openTs`), so the toast really is the only voice and it really did fire. **If no toast appears, §3 has silenced the edit page and must be reverted immediately.**
- **R3 — regression, the stored rejection reason panel still renders.** Open a modal on an already-REJECTED timesheet. Assert the red `Rejection reason:` panel (`TimesheetModal.svelte:355-360`) is present. It sits two lines below the deleted strip and is the easiest thing to cut by accident.

### Success criteria — §3, and how each is PROVEN

| # | Criterion | Proven by | Not proven by |
|---|---|---|---|
| 3.1 | Zero `Banner` references on `/requests/timesheets` | `grep -c "Banner"` = 0 — **fully automated** | — |
| 3.2 | Zero `form?.error` renders inside `TimesheetModal` | `grep -c "form?.error"` on the component = 0 — **fully automated** | — |
| 3.3 | A bulk 400 shows exactly ONE message, and it is a toast | new e2e in `form-errors.spec.ts` — **hybrid** (needs build+preview + a pending timesheet) | unit tests |
| 3.4 | A rejection shows one message, never in green | live probe P1 with N1 as control — **agent probe**. No automated tier can assert "the box is not green" cheaply | the e2e |
| 3.5 | A failed review shows one message and it is visible above the modal | live probe P3 — **agent probe**. The z-index/viewport check is the decision's proof | anything automated |
| 3.6 | `/timesheets` (shared modal) is not silenced | live probe R2 — **agent probe**, mandatory | the e2e (different route) |
| 3.7 | The three `getByRole('main')` specs are unaffected | `CI=1 pnpm test:e2e -- timesheet-approval timesheet-punch manager-org-wide-timesheets` green — **hybrid** | reading the code |
| 3.8 | The stored rejection-reason panel survives | live probe R3 — **agent probe** | — |
| 3.9 | Nothing else broke | gate set — **fully automated** | — |

### Rollback — §3

`git revert` the single commit restores both banners and the modal strip together. Because §2 is already in, reverting §3 alone is **safe** — it leaves the page with banner + toast (a duplicate, not a silence). That asymmetry is the reason for the §2-then-§3 ordering; write it into the report.

If probe P3 shows the toast is not visible above the modal, **do not patch §3** — revert it and reopen the modal-strip decision with the measurement attached.

### Commit — §3

```
fix(timesheets): report a review outcome once, as a toast

The approvals queue rendered a Banner for both form.error and form.saved while
the modal's guard already toasted the same string, and the modal rendered its
own destructive strip on top — a failed review read three times. A rejection
was worse: ?/review returns its reject string through the `saved` key, so a
rejection was announced in a green success box that outlived the toast.

The modal strip goes too. The dialog is size="full" with scroll, so the strip
sits above the entries table while the buttons are in the footer — on a long
timesheet it is off-screen at the moment the button is pressed. The toast is
fixed and stacks above the dialog, so it is the surface nearest the button.

The bulk actions got their toast in the preceding commit; nothing on either
route is left mute. Adds the queue's first error-surface e2e.
```

---

# Section 4 — B5: drop the ellipsis from six labels

**Independently committable. No dependency on any other section.** Can land before or after §1-§3; if it lands after §3, note that lines 122 and 559 will have shifted by the deletions above — **re-locate by label text, not by line number.**

### Steps

1. **Re-grep first**, because §1-§3 shift line numbers:
   ```
   grep -n '…' "src/lib/components/timesheets/TimesheetModal.svelte" \
     "src/routes/(app)/requests/timesheets/+page.svelte" \
     "src/routes/(app)/requests/proposals/+page.svelte" \
     "src/routes/(app)/requests/approvals/+page.svelte"
   ```
   Expect 12 hits. Six are targets; six are excluded (two busy states, four placeholders). Match the table in the B5 ruling above.

2. Edit exactly six labels. Character to remove is **U+2026**, one character, not three dots:
   - `TimesheetModal.svelte` — `>Reject…</button` → `>Reject</button`
   - `requests/timesheets/+page.svelte` — `>Reject selected…</button` → `>Reject selected</button`
   - `requests/proposals/+page.svelte` — `>Reject…</button` → `>Reject</button`
   - `requests/approvals/+page.svelte` — `>Reject selected…</button` → `>Reject selected</button`
   - `requests/approvals/+page.svelte` — `>Return…</button` → `>Return</button`
   - `requests/approvals/+page.svelte` — `>Reject…</button` → `>Reject</button`

3. **Change nothing else on those lines.** No class edits (issue #27 owns the green Approve buttons two lines away in three of these files), no `type`/`disabled`/`onclick` edits, no added comments.

4. **Verify the count.** After the edit:
   ```
   grep -c '…' "src/lib/components/timesheets/TimesheetModal.svelte" \
     "src/routes/(app)/requests/timesheets/+page.svelte" \
     "src/routes/(app)/requests/proposals/+page.svelte" \
     "src/routes/(app)/requests/approvals/+page.svelte"
   ```
   Expected per file: `TimesheetModal` 1 (placeholder `:522`), `requests/timesheets` 1 (placeholder), `requests/proposals` 2 (`Confirming…` + placeholder), `requests/approvals` 2 (`Approving…` + placeholder). Total **6**, down from 12. Any other total means the wrong lines were cut.

5. **Re-check the locator surface** — one grep, mechanical:
   ```
   grep -rn "exact: true" tests/e2e/ | grep -iE "reject|return"
   ```
   Must be **0 hits**. If a hit appears (someone added one since research), stop and re-assess — an `{ exact: true, name: 'Reject' }` would newly match a button it did not match before.

6. Gate set: `pnpm format:check && pnpm lint && pnpm check && pnpm test`.

7. E2E, the three specs that drive these buttons:
   ```
   CI=1 pnpm test:e2e -- approval-chain multi-role-sod timesheet-approval
   ```

8. Live probe (below), then commit.

### Live probe — §4

Purely visual and behavioural. For each of the three routes:

- **P1 — `/requests/timesheets`**: the bulk bar's button reads `Reject selected` with no trailing character. Clicking it still opens `ReasonDialog` (behaviour unchanged — this was a label change only). Confirm the dialog's own confirm button still reads plain `Reject`.
- **P2 — the review modal**: `Reject` with no trailing character; clicking still opens `ReasonDialog`.
- **P3 — `/requests/approvals`**: `Reject selected`, `Return`, `Reject` — all three, all plain, all still opening their dialogs.
- **P4 — `/requests/proposals`**: `Reject` plain, still opens its dialog.
- **N1 — negative control.** Assert `document.body.innerText.includes('Reject…')` is **false** on each of the four routes, and that the same check returns **true** for a known-surviving ellipsis (`Approving…` mid-submit on `/requests/approvals`, or a textarea placeholder read off the `placeholder` attribute). This proves the check reads the live DOM and can distinguish the six from the six that stay.

### Success criteria — §4, and how each is PROVEN

| # | Criterion | Proven by | Not proven by |
|---|---|---|---|
| 4.1 | Exactly six `…` removed; six survive | the `grep -c` in step 4 — **fully automated** | eyeballing |
| 4.2 | No busy label, `<option>`, or placeholder touched | step 4's per-file counts + `git diff` review — **fully automated** | — |
| 4.3 | No test locator newly matches or newly misses | step 5 grep = 0 hits, plus `CI=1 pnpm test:e2e -- approval-chain multi-role-sod timesheet-approval` green — **hybrid** | — |
| 4.4 | Every button still opens its dialog | live probe P1-P4 with N1 as control — **agent probe** | — |
| 4.5 | Nothing else broke | gate set — **fully automated** | — |

### Rollback — §4

`git revert` the single commit. Six characters. Nothing else in the diff, nothing to undo elsewhere.

### Commit — §4

```
style(requests): drop the ellipsis from the Reject and Return labels

Six labels across four files. The ellipsis is the platform convention for a
control that opens a further prompt, and all six do open a ReasonDialog — the
owner has made the call anyway, so this is a label change with no behaviour
change. ReasonDialog's own confirm button already reads plain Reject.

Busy-state labels, option text, and placeholders are untouched.
```

---

## Verification Evidence

Selector facts, fixed and verified — get these wrong and every assertion below is meaningless:

- `getByRole('alert')` matches the **`Banner`** component ONLY, for `kind="error"` AND `kind="warning"` (`Banner.svelte:42`).
- The **toast** is NOT `role="alert"`. The toast region is `div[role="status"]` (`Toaster.svelte:48`); an **error** toast is a child carrying `aria-live="assertive"` (`:64`).
- The two hand-rolled strips this plan deletes (`settings/roles:156-164`, `TimesheetModal:347-353`) carry **no ARIA role at all** — they match neither locator. Assert on their class (`[class*="bg-destructive"]`) scoped to the container, not on a role.

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm format:check && pnpm lint && pnpm check` clean after each section | Fully-Automated | 1.1, 1.5, 2.5, 3.9, 4.5 — no dangling block, no unused import, no broken prop |
| `pnpm test` green after each section | Fully-Automated | 1.5, 2.5, 3.9, 4.5 — no existing unit test depended on any deleted surface |
| `grep -c` guards: `settings/roles` `form.error` = 0; `requests/timesheets` `Banner` = 0; `TimesheetModal` `form?.error` = 0; `bulkFb.enhance` = 2; ellipsis count 12 → 6 | Fully-Automated | 1.1, 2.1, 3.1, 3.2, 4.1, 4.2 |
| `grep -rn "exact: true" tests/e2e/ \| grep -iE "reject\|return"` = 0 | Fully-Automated | 4.3 — no locator newly matches |
| New unit tests: `approveMany` / `rejectMany` return distinct non-empty `saved` strings; the three refusal paths return non-empty `error` strings | Fully-Automated | 2.2 — every bulk outcome carries a string the toast can read. Goal 6 (payload half) |
| New e2e in `form-errors.spec.ts`: bulk 400 → exactly ONE `[aria-live="assertive"]` toast reading `No timesheets selected`, and `getByRole('alert')` count 0 | Hybrid (build+preview, seeded pending timesheet) | 3.3, Goal 2, Goal 6 — the first "exactly one visible message" assertion in the repo |
| `CI=1 pnpm test:e2e -- timesheet-approval timesheet-punch manager-org-wide-timesheets` green | Hybrid | 3.7 — the three `getByRole('main')` assertions on `/timesheets` are unaffected |
| `CI=1 pnpm test:e2e -- approval-chain multi-role-sod timesheet-approval` green | Hybrid | 4.3 — the renamed buttons are still reachable by every existing locator |
| §1 live probe P1/P2 + N1/N2 + R1 | Agent-Probe | 1.2, 1.3, 1.4, Goal 1 |
| §2 live probe P1/P2/P3 + N1/N2 | Agent-Probe | 2.3, 2.4, Goal 2 |
| §3 live probe P1/P2/P3 + N1 + R1/R2/R3 | Agent-Probe | 3.4, 3.5, 3.6, 3.8, Goals 3 and 4 |
| §4 live probe P1-P4 + N1 | Agent-Probe | 4.4, Goal 5 |

### What the tiers can and cannot prove — stated plainly

- **A unit test can prove** the server hands back a non-empty, distinct string on every path. That is the payload half of "one message per action". It cannot see a DOM and therefore cannot prove a single thing about duplication.
- **An e2e can prove** message *count* on a route — this is where "exactly one" is actually assertable, and §3's new test is the first place in this repo where that is asserted at all.
- **Only a live browser probe can prove** colour (was the rejection green?), stacking (is the toast above the modal?), viewport position (is the surviving message actually on screen?), and cross-route non-silencing on the shared modal (`/timesheets`, R2). Those four are the reason the probes are mandatory and not decorative.
- **Green tests do not promote any section to VERIFIED.** Each section is `CODE DONE` when its gate set is green, and `VERIFIED` only when its probes are recorded with actual DOM evidence and both negative controls fired.

## E2E coverage recommendation — and why it is exactly one test

**Add one test, in §3, in a file that already exists.**

RESEARCH found the gap: `approveMany` / `rejectMany` have **zero** coverage at every layer, and nothing anywhere in the repo asserts "exactly one visible message per outcome" — which is the entire premise of phase 04. After §3 the only proof a bulk refusal is reported at all is a toast that nothing asserts.

Proportionality, deliberately:

- **One** e2e, on the deterministic 400 path. Not a happy-path bulk approve test — that needs seeded pending timesheets, mutates shared fixture state, and duplicates what `timesheet-approval.spec.ts` already drives through the modal.
- **Two** unit tests, in a file whose mocks already exist. Not a new file, not new mock wiring.
- **Do NOT** add an e2e for §1 or §4. `/settings/roles` already has `settings-roles.spec.ts` covering the table, the probe covers the strip, and adding a self-deactivation e2e means mutating account state in a shared fixture. §4 is six characters with a mechanical grep guard.
- **Do NOT** add a `/timesheets` e2e for R2. That route is out of scope; the probe is the right tier for a one-off cross-route check.

## Test Infra Improvement Notes

- `tests/e2e/form-errors.spec.ts` still asserts on `getByRole('alert')`, which matches `Banner` only. Every phase-04 banner→toast migration (this plan, `661719d`, `c2e0e20`) silently narrows what that selector can catch. A shared helper — `expectExactlyOneErrorToast(page, /text/)` wrapping the `[role="status"] [aria-live="assertive"]` + `toHaveCount(1)` + `getByRole('alert')` count-0 triple — would stop each site re-deriving it. **OUT OF SCOPE here: note it, do not build it.** This is the second plan in a row to write that same triple by hand.
- There is no fixture helper that guarantees a pending timesheet on `/requests/timesheets`, which is why both §2's and §3's probes carry a `BLOCKED — no fixture` escape hatch and the new e2e carries a `test.skip()`. A seeded always-pending timesheet would make the bulk path testable without mutating shared state. Note only.
- The pre-existing attendance e2e failure on this branch (see the 10-09-26 handoff) is unrelated and unowned. It makes "run the e2e suite" an unreliable gate, which is why every e2e command in this plan names its specs explicitly.

## Risks

| Risk | Mitigation |
|---|---|
| §3 lands before §2 and silences four bulk outcomes | The hard dependency is stated in §3's header and in §2's rollback note. §3's probe R1 re-checks the bulk toast live. |
| Deleting the modal strip silences `/timesheets` (shared component) | Verified in research: `keepOpenFb`, `closeFb`, and `ConfirmButton`'s own internal `submitFeedback` all toast on failure. §3 probe R2 is mandatory and proves it live. |
| The surviving toast is behind the open modal or off-screen | Toaster is `z-[100]`, Dialog is `zIndex={50}` — verified in source. §3 probe P3 measures both computed z-indexes and the viewport rect. If it fails, revert §3; do not patch. |
| `Banner` import left dangling on `/requests/timesheets` | Step §3.2 greps for 0. `pnpm lint` also catches it. Note this is the INVERSE of the recruitment case where the import had to stay. |
| The `form` prop on `TimesheetModal` becomes unused and `pnpm check` complains | Stated in Public Contracts: leave it, note it. Removing it is a two-call-site change §3 does not own. |
| `TimesheetModal` line numbers shift, and §4 edits the wrong line | §4 step 1 re-greps and matches on label text, not line number. Step 4 verifies by count. |
| A §4 edit strays into the `bg-green-600` classes two lines away | Issue #27 owns those. §4 step 3 says label text only; the `git diff` for §4 must be six single-character deletions and nothing else. |
| A probe mutates shared seed data (timesheet status, user active flag) | §1 N2 says restore the account. §2/§3 probes may approve/reject a real pending timesheet — record which one in the report so the owner knows. Do not create fixtures to manufacture a probe. |
| Someone "fixes" the `skipped` counter while in §2 | Explicitly out of scope, with reasons, in the Scope section. §2 step 9 files a backlog note instead. |

## Non-goals

- Do not touch `src/lib/utils/submit-feedback.svelte.ts` or `submit-guard.svelte.ts`.
- Do not touch `Banner.svelte`, `Toaster.svelte`, `toast.svelte.ts`, `ConfirmButton.svelte`, `ReasonDialog.svelte`.
- Do not touch any `+page.server.ts`.
- Do not touch `app.css` or any button class list — issue #27.
- Do not edit `src/routes/(app)/timesheets/+page.svelte`.
- Do not add a `reviewFb` guard, a config flag, a shared toast-assert helper, or any new abstraction. Reuse `submitFeedback` exactly as every other adopting site does.
- **No explanatory comments in the source.** Standing owner rule — the "why" goes in the commit message, never in the code. §2 adds one line of code and zero comments. The only prose this plan permits in source is the single one-sentence header on the new e2e test, matching the file's existing style.
- Do not re-open any of the three surface rulings during EXECUTE — they are decided above, with reasons. The one exception is §3 probe P3 failing, which reverts rather than patches.

## Commit sequence

Four commits, in this order. Conventional. **No attribution trailer, no `Co-Authored-By`, no generated-with footer, of any kind.** No push unless the owner asks.

1. `fix(settings): report a refused account-status change once, as a toast` — §1
2. `feat(timesheets): toast the bulk approve and reject outcomes` — §2 (+ the backlog note)
3. `fix(timesheets): report a review outcome once, as a toast` — §3
4. `style(requests): drop the ellipsis from the Reject and Return labels` — §4

§1 and §4 are order-independent. §2 → §3 is a hard ordering.

## Resume and Execution Handoff

1. **Selected plan file**: `process/general-plans/active/feedback-duplicate-messages-b2-b3-b5_10-09-26/feedback-duplicate-messages-b2-b3-b5_PLAN_10-09-26.md`
2. **Last completed phase/step**: PLAN complete. Nothing executed. Branch `feat/uiux-phase-4` at `d4c8e41`, clean, ahead 3 of origin. `pnpm format:check` verified green at this HEAD.
3. **Validate-contract status**: pending — VALIDATE has not run.
4. **Supporting context loaded**: `process/context/all-context.md`, `process/context/tests/all-tests.md`; both backlog notes (`settings-roles-duplicate-refusal_NOTE_10-09-26.md`, `timesheet-review-surface_NOTE_10-09-26.md`); the archived precedent plan `process/general-plans/completed/recruitment-detail-banner-dedupe_10-09-26/`; source read in full for all five touchpoint files plus `submit-feedback.svelte.ts`, `ConfirmButton.svelte`, `Toaster.svelte`, `toast.svelte.ts`, `+page.server.ts`, and `tests/unit/request-decide-feedback.test.ts`.
5. **Next step for a fresh agent**: run VALIDATE against this plan. On approval, execute §1 first (fully self-contained, lowest risk, proves the probe harness works before the harder sections). Then §2, then §3 — **that ordering is a hard dependency, not a preference**. §4 any time. Commit per section; do not batch. If resuming mid-plan, `git log --oneline -4` against the four commit subjects above tells you exactly where you are; if `TimesheetModal.svelte` or `requests/timesheets/+page.svelte` has already changed, re-grep before trusting any line number in this plan.

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
