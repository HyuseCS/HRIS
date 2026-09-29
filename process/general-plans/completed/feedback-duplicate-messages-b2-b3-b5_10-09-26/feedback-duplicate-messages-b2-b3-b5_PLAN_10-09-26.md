---
name: plan:feedback-duplicate-messages-b2-b3-b5
description: "One message per action on /settings/roles and /requests/timesheets, plus the six Reject/Return ellipsis labels — phase 04 feedback contract"
date: 10-09-26
feature: uiux-phase-4
---

# B2 / B3 / B5 — one message per action, and drop the ellipsis

**TL;DR** — Four commits. (1) Delete the hand-rolled error strip on `/settings/roles` (9 lines) — the toast already fires. (2) Put the two bulk timesheet actions on `submitFeedback` so they have a voice BEFORE anything is deleted. (3) Delete both page banners on `/requests/timesheets` **and** the modal's own `form?.error` strip, leaving the toast as the single voice. (4) Strip `…` from six button labels. Bulk approve/reject have zero tests today — this plan adds two unit tests and one e2e that asserts "exactly one visible message", which is the whole point of phase 04.

**Date**: 10-09-26
**Status**: COMPLETE — all four sections CODE DONE and VERIFIED (see Execution Outcome) — archived 10-09-26
**Complexity**: SIMPLE (4 independently committable sections)
**Branch**: `feat/uiux-phase-4`, clean, ahead 3 of origin
**Risk class**: low-medium — UI only, no server logic change, no schema, no auth. The medium comes from one shared component (`TimesheetModal`) and from deleting error surfaces, which has silenced forms in this repo before.

## Amendment log — 10-09-26 (post-VALIDATE)

VALIDATE returned **Gate: BLOCKED** with two FAILs against §3 and five CONCERNs. This plan has been amended in place. The Validate Contract below is the PREVIOUS run's output and is retained verbatim as the audit record — its `Gate: BLOCKED` verdict refers to the pre-amendment text.

| Finding | What changed |
|---|---|
| **F1** — the new e2e can never run; its premise is false | §3 step 6 rewritten. The `test.skip()` is GONE. The test seeds its own SUBMITTED timesheet via the repo's existing Prisma-upsert pattern (`tests/e2e/timesheet-approval.spec.ts:42-70`) and deletes it afterward, and FAILS rather than skips if the card is absent. The "first exactly-one assertion in the repo" claim is deleted — `form-errors.spec.ts:86-89` already carries that triple (`661719d`) — and replaced with an honest statement of what the test adds. Negative controls added. |
| **F2** — probe R2 named an account whose control never renders | §3 probe R2 rewritten to `manager@veent.ph` on timesheet `cmtuzqmq9001h61zqc4bk89aj` (REJECTED, manager-owned, so `canEdit` is true). A PRECONDITION is now asserted before any measurement — the `?/saveEntries` form must be proven present — and a failed precondition is `BLOCKED`, never a revert trigger. Phase Completion Rules updated to match. |
| **§3 destroyed its own fixture** | §3 steps 8 and 9 SWAPPED: live probes first, e2e last, with the reason written in. Chosen over per-probe self-seeding so the plan keeps exactly ONE seeding mechanism. |
| **C1** — the "`form` prop is still read by other logic" claim was false | Public Contracts corrected: the prop has zero readers after §3. EXECUTE must MEASURE with `pnpm lint` alone, never assume. D2 folded in. |
| **C2** — "every writer on `/timesheets` toasts" was false | Claim withdrawn and restated accurately: every writer inside the shared modal toasts; the page's own `?/submitMany` (`timesheets/+page.svelte:92`) does not, and does not need to. |
| **C3** — the modal walk listed four actions | Corrected to a table of six form actions plus the ConfirmButton delete. None is left mute. |
| **C4** — line drift | Fixed throughout the B3 table and the §2 checklist. EXECUTE is now instructed to locate the two bulk forms by `action=` attribute, never by line number. |
| **C5** — incomplete locator check | §4 step 5 split into 5a (newly matches) and 5b (`grep -rniE "Reject…|Return…" tests/`, newly misses). |

**Owner decisions now CLOSED — do not re-ask:**

- **D1 = YES.** Fixture seeding is authorised for the §2 and §3 probes, using the e2e suite's own Prisma-upsert pattern, with mandatory cleanup. Written into Phase Completion Rules and both probe blocks.
- **D2 = YES, conditionally.** If `pnpm lint` fails on the dead `form` prop after §3, the execute-agent may delete the `{form}` pass at `timesheets/+page.svelte:259` — **that one line only, and only if lint actually fails.** Measured, never assumed. Written into Scope and Public Contracts.

Unchanged: §1, §2 and §4 keep their rulings and their steps (§2 only gained the corrected line numbers). §T2 / green buttons / `app.css` remain OUT — issue #27. Sections stay independently committable. No explanatory comments in source.

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
- `/timesheets` (the employee edit page). It shares `TimesheetModal`, so §3 reaches it — §3 states exactly what changes there and proves nothing is silenced. **One carve-out only (owner decision D2, APPROVED):** if — and only if — `pnpm lint` fails on the now-dead `form` prop after §3, the execute-agent may delete the `{form}` being passed to `<TimesheetModal …>` at `src/routes/(app)/timesheets/+page.svelte:259`. **That one line, nothing else in that file.** It must be MEASURED (run `pnpm lint` alone and read the output), never assumed. Lint green ⇒ no edit.
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
6. A bulk 400 on `/requests/timesheets` produces exactly ONE `[role="status"] [aria-live="assertive"]` node and `getByRole('alert')` count **0** — asserted by a new test in `tests/e2e/form-errors.spec.ts` that **seeds its own SUBMITTED timesheet, cleans it up, and contains no `test.skip()`**. The test must actually EXECUTE in the run, and both of its negative controls must have been fired.
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
- §3 additionally cannot reach VERIFIED without probe **R2** (the `/timesheets` shared-modal non-silencing check), run as `manager@veent.ph` on timesheet `cmtuzqmq9001h61zqc4bk89aj`. **The revert rule is conditional on the precondition:** if R2's precondition holds — the `?/saveEntries` control is proven present in the DOM — and no toast appears, §3 is reverted, not patched. If the precondition FAILS (no control rendered), R2 is `BLOCKED — control not rendered` and **§3 is not reverted**; a false negative must never trigger a revert.
- **Fixture seeding is AUTHORISED for §2 and §3 probes (owner decision D1).** The execute-agent may seed pending timesheets using the e2e suite's own Prisma-upsert pattern (`tests/e2e/timesheet-approval.spec.ts:42-70`, driven per `tests/e2e/helpers.ts:64-82`), with distinctive hours labels, and **must delete every row it created** and record the ids. Do not run `db:seed:e2e`. Do not touch any row the agent did not create. If seeding itself fails, record `BLOCKED — no fixture` and leave the section CODE DONE. Never fabricate evidence.
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
8. §2 step 3 — swap both forms onto `bulkFb.enhance`. **Locate them by their `action=` attribute, never by line number.** For reference only: the `?/approveMany` form and its `use:enhance` are both on `:101`; the `?/rejectMany` form opens at `:109` and its `use:enhance` is on `:113`.
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
20. §3 step 6 — add the one e2e to `tests/e2e/form-errors.spec.ts` (bulk 400, exactly-one assertion). **It seeds its own SUBMITTED timesheet and cleans up; no `test.skip()`.** Fire its negative controls.
21. §3 step 7 — `pnpm lint` alone first (the `form`-prop measurement, D2), then the rest of the CI gate set.
22. §3 step 8 — **run the live probes FIRST**: P3, then P1, N1, P2, R1, R3, and **R2 (mandatory, as `manager@veent.ph` on `cmtuzqmq9001h61zqc4bk89aj`, precondition asserted first)**. Seed and clean up fixtures under D1 as needed.
23. §3 step 9 — **e2e LAST**, after warning the owner it deletes `cmtuzqmpk001561zqp6z2trxk`: `CI=1 pnpm test:e2e -- form-errors`, then `CI=1 pnpm test:e2e -- timesheet-approval timesheet-punch manager-org-wide-timesheets`.
24. §3 step 10 — commit 3.
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
| bulk approve success | `+page.server.ts:137-139` `saved: "Approved N timesheets…"` | success banner |
| bulk reject success | `+page.server.ts:169-171` `saved: "Rejected N timesheets…"` | success banner |
| 403 `Insufficient permissions` | `:118`, `:147` | error banner |
| 400 `No timesheets selected` / `A reason is required to reject.` | `:124`, `:155-156` | error banner |

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
- **Every writer INSIDE `TimesheetModal` toasts on failure.** The correct enumeration is **six form actions plus the ConfirmButton delete**, not four:

  | Action | Line | Guard | Toasts on failure? |
  |---|---|---|---|
  | `?/review` (hidden reject form) | `:510` | `closeFb` (`:273`, bare `submitFeedback`) | yes |
  | `?/review` (approve) | `:561` | `closeFb` | yes |
  | `?/saveEntries` | `:547` | `keepOpenFb` (`:274`, bare `submitFeedback`) | yes |
  | `?/syncAttendance` | `:572` | `closeFb` | yes |
  | `?/submit` | `:582` | `closeFb` | yes |
  | `?/submitDraft` | `:592` | `closeFb` | yes |
  | `?/delete` | `:533` (`ConfirmButton`) | ConfirmButton's **own** internal `submitFeedback` (`ConfirmButton.svelte:50-55`), no `error` option | yes |

  `submit-feedback.svelte.ts:84-87` always yields a string (`data.error`, falling back to `FRIENDLY_ERROR`), so **no action in the modal is left mute.** Note `?/submit` is the action `tests/e2e/timesheet-approval.spec.ts:130` depends on — §3 re-runs that spec. §3's regression probe R2 proves the toast fires on the running app.
- **The page-level claim is narrower than the plan first said.** "Every writer on `/timesheets` toasts on failure" was FALSE: `src/routes/(app)/timesheets/+page.svelte:92` puts `?/submitMany` on a bare `use:enhance={clearOnSuccess('mine')}`, and `clearOnSuccess` (`:47-56`) is a plain `SubmitFunction` factory that calls `update()` and toasts nothing. **It is not a silencing risk from this plan** — `?/submitMany` fires with the modal closed, where the page banner at `:215` (`{#if form?.error && !openTs}`) still renders — but the blanket claim is withdrawn. The accurate statement is: *every writer inside the shared modal toasts; the page's own `?/submitMany` does not, and it does not need to, because its banner is unaffected.*
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

**Component prop contract, `TimesheetModal`:** the `form?: { error?: string } | null` prop appears at `:44` (type), `:54` (destructure default), and `:347` / `:351` — the strip §3 deletes — **and nowhere else**. The earlier claim that "the prop is still read by other logic" was FALSE. After §3 the prop has **zero readers** inside the component. The same is true of `let { data, form }` at `settings/roles/+page.svelte:18` after §1.

**This is a measurement, not an assumption.** `eslint.config.js` sets `no-unused-vars: ['error', …]` and it applies to `**/*.svelte`. EXECUTE must run `pnpm lint` ALONE immediately after each deletion and read the actual output. Do not pre-emptively delete anything, and do not assume the linter stays quiet.

- **§1, if lint flags it:** in-scope and clean — reduce `let { data, form }: { data: PageData; form: ActionData } = $props()` at `settings/roles/+page.svelte:18` to `let { data }: { data: PageData } = $props()` and drop the now-unused `ActionData` from the type import.
- **§3, if lint flags it (owner decision D2 — APPROVED):** delete the `form` prop at `:44` and its destructure at `:54`, and remove the `{form}` being passed at the two call sites — `requests/timesheets/+page.svelte:172` and `src/routes/(app)/timesheets/+page.svelte:259`. **That one line at `:259` is the ONLY permitted edit to `timesheets/+page.svelte` in this whole plan, and it is permitted ONLY if `pnpm lint` actually fails.** If lint is green, change nothing there. Locate it by the `<TimesheetModal` tag, not by line number.
- **If lint is green after §3:** leave the prop exactly as it is and record that lint was green. Do not tidy it away.

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

3. Swap both forms onto the guard. **Find each form by its `action=` attribute — `action="?/approveMany"` and `action="?/rejectMany"` — never by line number.** Line refs below are orientation only and will drift:
   - the `?/approveMany` form: `use:enhance={clearOnSuccess}` → `use:enhance={bulkFb.enhance}` (both are on `:101` today)
   - the `?/rejectMany` form: `use:enhance={clearOnSuccess}` → `use:enhance={bulkFb.enhance}` (the form opens at `:109`; its `use:enhance` is on `:113`)

   **One shared guard is correct here**, not one per form: only one bulk action can be in flight at a time (both submit the same selection from the same bar), so a shared busy lock is the desired behaviour, not a bug. This is the opposite of the per-row case at `settings/roles:28` where a shared guard would freeze the whole table.

4. **The `busy` variable.** The page keeps its own `let busy = $state(false)` (`:23`), set by `clearOnSuccess`. Both buttons read `disabled={busy}` (`:104`, `:119`). `clearOnSuccess` still runs as `inner`, so `busy` still flips — **leave `disabled={busy}` alone**. Do NOT switch the buttons to `bulkFb.busy`; that is a second lock doing the same job and a wider diff. Confirm after the edit that a bulk submit still disables both buttons (probe P3 below).

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

Log in as an account that can review timesheets (`approver@veent.ph`, or `admin@veent.ph`). Go to `/requests/timesheets`. **Preconditions:** at least one pending timesheet card must be present. If the queue is empty, seed one under **owner decision D1** — the e2e suite's own Prisma-upsert pattern (`tests/e2e/timesheet-approval.spec.ts:42-70`), distinctive hours label, deleted again afterward, ids recorded. Do **not** run `db:seed:e2e`, and do not touch any row the agent did not create. If seeding itself fails, mark the probe `BLOCKED — no fixture`.

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

   **One test, and it seeds its own fixture. NO `test.skip()`.**

   **The earlier draft was wrong on both counts, and the corrections are load-bearing:**

   - *"There is no fixture helper that guarantees a pending timesheet."* **False.** `tests/e2e/timesheet-approval.spec.ts:42-70` has `resetFixture()`, which seeds a SUBMITTED timesheet by direct Prisma upsert; `tests/e2e/helpers.ts:64-82` then drives it through `/requests/timesheets`. That is the repo's own sanctioned pattern and this test reuses it.
   - *A `test.skip()` on an empty queue is an acceptable escape hatch.* **No — it would skip on EVERY run.** `pnpm test:e2e` is `dotenv -e .env.dev -- playwright test`, so the suite runs against the same database as the dev server, and `tests/e2e/global-setup.ts:81-82` runs `db.timesheet.deleteMany()` for `employee@veent.ph` on every run. The review queue is empty by the time `form-errors.spec.ts` executes. A gate that never runs is not a gate, and Acceptance Criterion 6 requires the assertion to actually execute.
   - *"The first exactly-one-visible-message assertion in the repo."* **False, and the claim is deleted.** `tests/e2e/form-errors.spec.ts:86-89` already carries that exact triple — `toHaveText(/Invalid status/)`, `toHaveCount(1)`, `getByRole('alert')` `toHaveCount(0)` — added by `661719d`.

   **What this test genuinely adds, stated honestly:** it is the first assertion of ANY kind on `approveMany` / `rejectMany`, which have zero coverage at every layer (`grep -rln "approveMany\|rejectMany" tests/` → 0), and the first exactly-one assertion on `/requests/timesheets`, the route §3 strips both banners from. It **reuses** the existing triple; it does not invent it.

   Shape:
   - **`beforeEach` — seed.** Create one SUBMITTED timesheet with a distinctive hours label, copying the Prisma-upsert shape at `tests/e2e/timesheet-approval.spec.ts:42-70`. Keep the returned id.
   - **`afterEach` — clean up.** Delete exactly what was seeded, by id. Seed and remove; never leave a card behind for the owner to find.
   - go to `/requests/timesheets`, then **assert the seeded card is present before anything else**. If it is absent the test **FAILS**. It does not skip.
   - select that card's checkbox so the bulk bar appears
   - blank the hidden `ids` input via `.evaluate((el: HTMLInputElement) => { el.value = '' })` on `form[action*="approveMany"] input[name="ids"]` — the same hidden-input mutation trick this file already uses at `:26-29`
   - submit that form's own button
   - **ASSERT the toast:** `await expect(page.locator('[role="status"] [aria-live="assertive"]')).toHaveText(/No timesheets selected/)`
   - **ASSERT exactly one message — this is the phase-04 assertion and the reason the test exists:**
     `await expect(page.locator('[role="status"] [aria-live="assertive"]')).toHaveCount(1)` **and**
     `await expect(page.getByRole('alert')).toHaveCount(0)`
   - the bare `getByRole('alert')` count-0 is safe **on this route specifically**: after step 1 there is no `Banner` on the page at all, and `Banner` is the only `role="alert"` producer in play (`Banner.svelte:42` gives it to `error` AND `warning`). Confirm with the step-2 grep before trusting it.
   - **Negative control before trusting it:** change the expected text to `No timesheets selectedAAA` and confirm the test goes RED; then change `toHaveCount(1)` to `toHaveCount(2)` and confirm RED again. Record both, then revert. A check that cannot fail is not a check.
   - one short comment at the top saying why the test exists, matching the file's existing style. Nothing else.

7. Gate set: `pnpm format:check && pnpm lint && pnpm check && pnpm test`. Run `pnpm lint` ALONE first, immediately after the deletions — see Public Contracts for the `form`-prop measurement and the D2 carve-out.

8. **Live probe (below) — PROBES RUN BEFORE THE E2E.** This is a deliberate swap of the original step order, and the reason is that **§3 was destroying its own fixture**: `pnpm test:e2e` loads `.env.dev`, the same database the dev server uses, and `tests/e2e/global-setup.ts:81-82` deletes every timesheet belonging to `employee@veent.ph` — which is the only card in the review queue. Running the e2e first left the probes with nothing to probe.

   **Why swap rather than make each probe self-seeding:** the probes are driven by hand against the owner's live app, not by the Playwright fixture harness, so a per-probe seed would be a second, hand-rolled seeding mechanism next to the one the e2e already uses. Ordering costs nothing and keeps exactly one seeding path in the plan. The probes may still seed under D1 (below) when the queue is too thin — that uses the SAME Prisma-upsert pattern, not a new one.

9. **E2E, last.** Warn the owner first: this run will DELETE Elena's SUBMITTED timesheet `cmtuzqmpk001561zqp6z2trxk`. `cmtuzqmq9001h61zqc4bk89aj` (Maria's REJECTED, the R2 fixture) survives.
   ```
   CI=1 pnpm test:e2e -- form-errors
   CI=1 pnpm test:e2e -- timesheet-approval timesheet-punch manager-org-wide-timesheets
   ```
   The second command is the three sibling specs that carry `getByRole('main')` scoping, proving they are unaffected. The pre-existing attendance failure is **not** in this list. If it appears in a broader run, record it as pre-existing and move on.

10. Commit.

### Live probe — §3

**Run this block BEFORE the e2e (step 8 above).**

Log in as a reviewer at `/requests/timesheets`. This probe set needs **at least four** pending timesheets — P1 rejects one, P2 approves another, R1 selects two for a bulk approve — and the dev DB has one.

**Fixture seeding is AUTHORISED (owner decision D1, APPROVED).** The execute-agent MAY seed the pending timesheets it needs, under these rules:

1. Use the e2e suite's **own existing** Prisma-upsert pattern — `tests/e2e/timesheet-approval.spec.ts:42-70`, driven the way `tests/e2e/helpers.ts:64-82` drives it. Do not invent a new seeding mechanism, and do not run `db:seed:e2e`.
2. Give every seeded timesheet a **distinctive hours label** so it is identifiable on sight and by query.
3. **Clean up what you create.** Delete every seeded row by id when the probe block finishes, and record the ids that were created and deleted in the report.
4. Do not touch, mutate, or delete any row the agent did not create. `cmtuzqmpk001561zqp6z2trxk` (Elena, SUBMITTED) and `cmtuzqmq9001h61zqc4bk89aj` (Maria, REJECTED) are the owner's — leave them as found.

If seeding itself fails, mark the affected probe `BLOCKED — no fixture` and record why. Do not fabricate evidence.

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
- **R2 — regression, `/timesheets` is not silenced.** This is the shared-component check, it is **mandatory**, and it decides whether §3 ships or reverts — so its account and its fixture are fixed, not a choice.

  **Account: `manager@veent.ph`. Timesheet: `cmtuzqmq9001h61zqc4bk89aj` (REJECTED, manager-owned).** NOT `employee@veent.ph`. `TimesheetModal.svelte:88-90` reads `canEdit = mode === 'edit' && canModify && isManager && ts != null && ts.status !== 'APPROVED'` — an Employee is not a manager, so the `?/saveEntries` form at `:547` **never renders** for that account. Running R2 as an Employee would show no toast for the trivial reason that there is no button, and the plan's own rule would then revert §3 on a false negative.

  **PRECONDITION — assert this BEFORE measuring anything.** Open the modal on `/timesheets` as `manager@veent.ph` and assert the `?/saveEntries` control is actually present in the DOM: `document.querySelectorAll('form[action*="saveEntries"]').length === 1` and its submit button is visible and not `disabled`. **If the precondition fails, R2 is `BLOCKED — control not rendered`, NOT a failure, and §3 is NOT reverted.** A revert may only be triggered by a probe whose control was proven present. Record the precondition result in the report alongside the measurement.

  Then force a `?/saveEntries` failure (corrupt a hidden `id`, or submit an entry the server refuses). Assert:
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
| 3.3 | A bulk 400 shows exactly ONE message, and it is a toast | new e2e in `form-errors.spec.ts` — **hybrid** (needs build+preview; the test seeds and cleans up its own SUBMITTED timesheet) | unit tests |
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

5. **Re-check the locator surface — TWO greps, both mechanical, both required.** One grep alone is incomplete: it only catches a locator that newly MATCHES, never one that newly MISSES.

   5a — a locator that newly **matches**:
   ```
   grep -rn "exact: true" tests/e2e/ | grep -iE "reject|return"
   ```
   Must be **0 hits**. If a hit appears (someone added one since research), stop and re-assess — an `{ exact: true, name: 'Reject' }` would newly match a button it did not match before.

   5b — a locator that newly **misses**, because it names the OLD string with the ellipsis:
   ```
   grep -rniE "Reject…|Return…" tests/
   ```
   Must be **0 hits**. Verified 0 today (`grep -rn "Reject" tests/` returns only `mockRejectedValue` / `expectRejectedAt` / `PromiseRejectedResult`), so there is no live risk — but a `name: 'Reject…'` added since research would break silently, and 5a cannot see it.

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
| `grep -rniE "Reject…\|Return…" tests/` = 0 | Fully-Automated | 4.3 (missing half) — no locator naming the OLD string newly misses |
| `pnpm lint` run ALONE immediately after each deletion, output read | Fully-Automated | Public Contracts / D2 — whether the dead `form` prop trips `no-unused-vars` is MEASURED, never assumed |
| New unit tests: `approveMany` / `rejectMany` return distinct non-empty `saved` strings; the three refusal paths return non-empty `error` strings | Fully-Automated | 2.2 — every bulk outcome carries a string the toast can read. Goal 6 (payload half) |
| New e2e in `form-errors.spec.ts`: bulk 400 → exactly ONE `[aria-live="assertive"]` toast reading `No timesheets selected`, and `getByRole('alert')` count 0. **Self-seeds its SUBMITTED timesheet via the Prisma-upsert pattern at `timesheet-approval.spec.ts:42-70` and cleans up; no `test.skip()`** | Hybrid (build+preview; precondition self-satisfied by the seed) | 3.3, Goal 2, Goal 6 — the first assertion of any kind on `approveMany`/`rejectMany`, and the first exactly-one assertion on `/requests/timesheets`. It REUSES the triple already at `form-errors.spec.ts:86-89` (`661719d`); it is not the repo's first |
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

RESEARCH found the gap: `approveMany` / `rejectMany` have **zero** coverage at every layer. After §3 the only proof a bulk refusal is reported at all is a toast that nothing asserts. Note the correction: the repo **already** asserts "exactly one visible message" — `form-errors.spec.ts:86-89`, added by `661719d`. What is missing is that assertion on *this* surface and *this* route. The new test reuses the existing triple.

Proportionality, deliberately:

- **One** e2e, on the deterministic 400 path, **seeding its own SUBMITTED timesheet and deleting it afterward**. Not a happy-path bulk approve test — that duplicates what `timesheet-approval.spec.ts` already drives through the modal.
- **Two** unit tests, in a file whose mocks already exist. Not a new file, not new mock wiring.
- **Do NOT** add an e2e for §1 or §4. `/settings/roles` already has `settings-roles.spec.ts` covering the table, the probe covers the strip, and adding a self-deactivation e2e means mutating account state in a shared fixture. §4 is six characters with a mechanical grep guard.
- **Do NOT** add a `/timesheets` e2e for R2. That route is out of scope; the probe is the right tier for a one-off cross-route check.

## Test Infra Improvement Notes

- `tests/e2e/form-errors.spec.ts` still asserts on `getByRole('alert')`, which matches `Banner` only. Every phase-04 banner→toast migration (this plan, `661719d`, `c2e0e20`) silently narrows what that selector can catch. A shared helper — `expectExactlyOneErrorToast(page, /text/)` wrapping the `[role="status"] [aria-live="assertive"]` + `toHaveCount(1)` + `getByRole('alert')` count-0 triple — would stop each site re-deriving it. **OUT OF SCOPE here: note it, do not build it.** This is the second plan in a row to write that same triple by hand.
- **Correction to an earlier note in this plan:** the claim that "there is no fixture helper that guarantees a pending timesheet" was FALSE. `tests/e2e/timesheet-approval.spec.ts:42-70` (`resetFixture()`, a direct Prisma upsert, driven by `helpers.ts:64-82`) is exactly that helper. The real gap is narrower: the pattern is **inlined per spec** rather than shared, so every spec that needs a pending timesheet re-writes it. Lifting it into `tests/e2e/helpers.ts` would make the bulk path testable without a copy. **OUT OF SCOPE here: note it, do not build it.** §3's new e2e copies the pattern in place.
- `pnpm test:e2e` loads `.env.dev`, so the e2e suite and the dev server share ONE database, and `global-setup.ts:81-82` wipes `employee@veent.ph`'s timesheets on every run. That coupling is why §3 must run its probes before its e2e, and why any probe fixture has to be seeded and cleaned by the agent. A separate e2e database would remove the whole class of problem. Note only.
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
| A probe mutates shared seed data (timesheet status, user active flag) | §1 N2 says restore the account. Under D1 the agent SEEDS its own pending timesheets (distinctive hours label) and deletes them again, recording the ids — so the owner's own rows are left alone. It must not approve, reject, or delete any row it did not create. |
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

## Execution Outcome

**COMPLETE.** All four sections shipped, in the planned order, one commit each.

| Section | Commit | Delivered |
|---|---|---|
| §1 — B2 `/settings/roles` | `a4b3dcd` | duplicate error strip deleted; the orphaned `form` prop and the `ActionData` import removed with it |
| §2 — B3 part 1, bulk voice | `ec0714e` | both bulk forms moved onto `submitFeedback`; two new unit tests; `skipped`-counter backlog note filed |
| §3 — B3 part 2 | `1a17ebd` | both page banners and the modal's `form?.error` strip deleted; the D2/E1 lint cascade applied through `requests/timesheets/+page.svelte:12,14` and `timesheets/+page.svelte:259`; the queue's first error-surface e2e added |
| §4 — B5 labels | `937934b` | the ellipsis dropped from all six Reject/Return labels |

Plus `ab695c5` (`playwright-report/` and `test-results/` added to the eslint ignores — the local
lint gate was red with 475 errors from bundled Playwright output while CI stayed green, because CI
lints a fresh checkout) and the two plan-doc commits `b886a4d` / `26377b3`.

### Acceptance criteria — final state, measured on disk

| AC | Result | Evidence |
|---|---|---|
| 1 | MET | `grep -c "form?.error\|form.error\|form?.saved"` on `settings/roles/+page.svelte` = **0**. The `#283` in-dialog `saveError` strip survives with its `role="alert"`. |
| 2 | MET | `grep -c "bulkFb.enhance"` = **2**; `grep -c "use:enhance={clearOnSuccess}"` = **0**. |
| 3 | MET | two new cases in `tests/unit/request-decide-feedback.test.ts`, green in `pnpm test` (2429 tests). |
| 4 | MET | `grep -c "Banner"` on `requests/timesheets/+page.svelte` = **0**. |
| 5 | MET | `grep -c "form?.error"` on `TimesheetModal.svelte` = **0**; the `REJECTED` stored-reason panel survives. The `form` prop did **not** survive — the D2/E1 lint cascade removed it, which E1 explicitly authorised and which overrides this criterion's second clause. |
| 6 | MET | the new `form-errors.spec.ts` case seeds and cleans its own SUBMITTED timesheet; `grep -c "test.skip"` = **0**. |
| 7 | MET (Agent-Probe, §3) | recorded by the §3 execute pass. The green box is gone; the **toast is still green** — see Known Gaps. |
| 8 | MET (Agent-Probe, §3) | toast `z-index` 100 vs dialog 50, node inside the viewport rect. |
| 9 | MET (Agent-Probe, §3 R2) | `manager@veent.ph` on `cmtuzqmq9001h61zqc4bk89aj`, precondition asserted before measurement. |
| 10 | MET | per-file ellipsis counts **1 / 1 / 2 / 2 = 6**, down from 12. |
| 11 | MET | `grep -rn "exact: true" tests/e2e/ \| grep -iE "reject\|return"` = **0**; `grep -rniE "Reject…\|Return…" tests/` = **0**. |
| 12 | MET | full CI gate set green after each section; the three named e2e batches green. The pre-existing `attendance-save-timesheet-custom-range` failure is recorded as pre-existing, not fixed. |
| 13 | MET | four commits, conventional, no attribution trailer; backlog note filed at `process/features/ui-ux-overhaul/backlog/bulk-timesheet-skipped-counter_NOTE_10-09-26.md`. |

### Corrections applied to this plan at archival

- **N4** — §3 success criterion 3.3 said the e2e "needs build+preview + a pending timesheet". The
  amended test seeds its own. Row 3.3 now reads "the test seeds and cleans up its own SUBMITTED
  timesheet".
- **N5** — the B3 modal-walk table put the hidden reject form's `?/review` at `:511`; the `action`
  attribute was at `:510`. Fixed. **Both numbers describe the pre-§3 tree.** After `1a17ebd` deleted
  the strip, that action sits at `:500`. The Run-1 Validate Contract's copies of `:511` are left
  verbatim — it is retained as the audit record, and N5 already records the correction inside it.

### Deviations

- **The D2/E1 lint cascade fired twice**, exactly as N1 predicted, and it overrode §3 step 3's
  "keep the `form` prop destructure at `:14`". Deleting the banners orphaned the prop; step 3 and
  acceptance criterion 12 (lint green after every section) could not both hold. E1 was written for
  this and was followed.
- **§4's agent-probe extended D1's fixture authorisation to §4.** D1's text scopes seeding to the
  §2 and §3 probes; all three queues were empty at §4 probe time, so proving 4.4 needed one seeded
  row per route. The D1 pattern (raw Prisma create, record the id, delete by id, never touch a row
  the agent did not create) was followed exactly and every id is recorded in the report.
- **§4's P4 is a partial probe.** The `/requests/proposals` Reject control was confirmed by static
  text, not by a click. Recorded as a residual, not re-run.
- **E5's invocation form is wrong for this repo.** `CI=1 pnpm test:e2e -- <specs>` does not filter
  — see Known Gaps.

## Known Gaps (Resolved via Backlog)

- **`pnpm test:e2e -- <specs>` silently runs the whole suite** instead of the named specs —
  `process/features/ui-ux-overhaul/backlog/e2e-spec-filter-silently-ignored_NOTE_10-09-26.md`.
  Every earlier gate log in this repo that claimed a small filtered count is suspect.
- **The rejection toast is still green.** `?/review` returns its reject string through the `saved`
  key, so `submitFeedback` dispatches `kind: 'success'`. The persistent green *box* is fixed; the
  six-second green *toast* is not. Owner ruling owed —
  `process/features/ui-ux-overhaul/backlog/rejection-toast-is-green_NOTE_10-09-26.md`.
- **The `skipped` counter returns a green success for a total failure** —
  `process/features/ui-ux-overhaul/backlog/bulk-timesheet-skipped-counter_NOTE_10-09-26.md`. Owner
  has not ruled. Out of scope by design.
- **§4 probe P4 partial** — the proposals Reject button was not exercised through a click, and
  `/requests/proposals` has zero e2e coverage at any tier. Not filed separately; covered by the
  standing `feedback-contract-remaining-adoption_NOTE_03-09-26.md`.
- **`timesheets/+page.svelte:219`** (`form?.saved` with no `!openTs` guard) still shows banner +
  toast on a successful modal action on the edit page. Known, accepted, out of scope — recorded in
  the B3 ruling, not fixed.
- **B4 (no affirmative button at form scale)** left this plan for **GitHub issue #27**: 12
  hand-rolled solid fills across 8 files; `--success` / `--warning` are defined at `src/app.css:39-42`
  but never mapped into `tailwind.config.ts` and absent from `.dark`.
- **B1 (`/settings/roles` renders 196 logins with no pagination)** is owned by no phase — phase 07's
  SC-4 names only separations, inventory and complaints. Note at
  `process/features/ui-ux-overhaul/backlog/settings-roles-unbounded-table_NOTE_10-09-26.md`.
- **The pre-existing `attendance-save-timesheet-custom-range` e2e failure** on this branch is
  unrelated and still unowned.

## Resume and Execution Handoff

1. **Selected plan file**: `process/general-plans/completed/feedback-duplicate-messages-b2-b3-b5_10-09-26/feedback-duplicate-messages-b2-b3-b5_PLAN_10-09-26.md` (archived)
2. **Last completed phase/step**: UPDATE PROCESS complete. All four sections executed and committed on `feat/uiux-phase-4` — `a4b3dcd`, `ec0714e`, `1a17ebd`, `937934b`, plus `ab695c5` for the eslint ignores. Nothing left to execute in this plan.
3. **Validate-contract status**: two contracts below. Run 1 returned **BLOCKED** (2 FAILs, 5 CONCERNs) and is retained verbatim as the audit record — its verdict refers to the pre-amendment text. Run 2 re-validated the amended plan at `b886a4d` and returned **CONDITIONAL** (0 FAILs, 2 CONCERNs), closed by binding instructions E1-E8. All of E1-E8 were followed; E5's invocation form proved wrong for this repo (see Known Gaps).
4. **Supporting context loaded**: `process/context/all-context.md`, `process/context/tests/all-tests.md`; both backlog notes (`settings-roles-duplicate-refusal_NOTE_10-09-26.md`, `timesheet-review-surface_NOTE_10-09-26.md`); the archived precedent plan `process/general-plans/completed/recruitment-detail-banner-dedupe_10-09-26/`; source read in full for all five touchpoint files plus `submit-feedback.svelte.ts`, `ConfirmButton.svelte`, `Toaster.svelte`, `toast.svelte.ts`, `+page.server.ts`, and `tests/unit/request-decide-feedback.test.ts`.
5. **Next step for a fresh agent**: nothing in this plan. The follow-ups are the four backlog notes named under Known Gaps — the `pnpm test:e2e` spec-filter footgun, the still-green rejection toast (owner ruling owed), the `skipped` counter, and B1's unowned pagination. B4 lives on GitHub issue #27.

## Validate Contract — Run 1 (SUPERSEDED, retained as the audit record)

Status: BLOCKED
Date: 10-09-26
date: 2026-09-10
generated-by: outer-pvl

Parallel strategy: sequential (one deep source-verification pass)
Rationale: 2/7 signals — S5 (user explicitly requested adversarial depth) and S7 (5 source + 2 test files in blast radius). No S1/S2/S3/S4/S6. The blast radius is five files in one package with a shared component; a fan-out would have split the one thing that mattered — reading each cited line and its neighbours in order. PLAN's 1/7 sequential call was right on strategy; it was wrong that the sections were low-risk to verify.

### Verdict in one line

The three surface RULINGS survive source verification. Six of the plan's factual CLAIMS do not. §1, §2 and §4 are safe to execute as written. §3 is NOT — it carries two FAIL-grade instructions that would send an execute-agent to the wrong conclusion.

### Test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| 1.1 / 2.1 / 3.1 / 3.2 / 4.1 / 4.2 | the named surface is actually gone / actually wired | Fully-Automated | `grep -c "form?.error\|form\.error\|form?.saved" "src/routes/(app)/settings/roles/+page.svelte"` = 0; `grep -c "Banner" "src/routes/(app)/requests/timesheets/+page.svelte"` = 0; `grep -c "form?.error" src/lib/components/timesheets/TimesheetModal.svelte` = 0; `grep -c "bulkFb.enhance" "src/routes/(app)/requests/timesheets/+page.svelte"` = 2; ellipsis per-file counts 1/1/2/2 | A |
| 4.3 (half) | no `exact: true` locator newly matches a renamed button | Fully-Automated | `grep -rn "exact: true" tests/e2e/ \| grep -iE "reject\|return"` = 0 — VERIFIED 0 today | A |
| 4.3 (missing half) | no NON-exact locator newly MISSES a renamed button | Fully-Automated | `grep -rniE "Reject…\|Return…\|Reject selected…" tests/` = 0 — VERIFIED 0 today; ADD this grep, the plan only checks `exact: true` | B |
| 1.5 / 2.5 / 3.9 / 4.5 | nothing else broke | Fully-Automated | `pnpm format:check && pnpm lint && pnpm check && pnpm test` after each section | A |
| 1.5 / 3.9 (unused-prop risk) | the `form` prop/destructure left behind by §1 and §3 does not fail the gate | Fully-Automated | `pnpm lint` FIRST, alone, immediately after each deletion — before the rest of the gate set | B |
| 2.2 | every bulk outcome carries a non-empty string the toast can read | Fully-Automated | new `describe` in `tests/unit/request-decide-feedback.test.ts`, run by `pnpm test` | B |
| 3.3 / Goal 6 | a bulk 400 shows exactly ONE visible message and it is the toast | Hybrid | new test in `tests/e2e/form-errors.spec.ts`, run by `CI=1 pnpm test:e2e -- form-errors`. Precondition: a SUBMITTED timesheet in the review queue, seeded by the test itself via the Prisma-upsert pattern at `tests/e2e/timesheet-approval.spec.ts:42-70`. NOT `test.skip()` | B |
| 3.7 | the three `getByRole('main')` specs on `/timesheets` are unaffected | Hybrid | `CI=1 pnpm test:e2e -- timesheet-approval timesheet-punch manager-org-wide-timesheets` | A |
| 4.3 | the renamed buttons are still reachable by every existing locator | Hybrid | `CI=1 pnpm test:e2e -- approval-chain multi-role-sod timesheet-approval` | A |
| 1.2 / 1.3 / 1.4 | a refused `setActive` reports once, the success path still speaks, the #283 in-dialog refusal is untouched | Agent-Probe | §1 probes P1, P2, N1, N2, R1 against the running dev app | A |
| 2.3 / 2.4 | the bulk string reaches the screen; the double-submit lock survives | Agent-Probe | §2 probes P1, P2, P3 + N1/N2 | A |
| 3.4 / 3.5 / 3.8 | a rejection reports once and not in green; a failed review is visible above the modal; the stored-reason panel survives | Agent-Probe | §3 probes P1, P2, P3, R1, R3 — **run BEFORE the §3 e2e**, see E4 | C |
| 3.6 | `/timesheets` (shared modal) is not silenced | Agent-Probe | §3 probe R2, **as `manager@veent.ph` on timesheet `cmtuzqmq9001h61zqc4bk89aj` (REJECTED)** — see F2 | B |
| 4.4 | every renamed button still opens its dialog | Agent-Probe | §4 probes P1-P4 + N1 | A |
| — | the `skipped` counter returns a green toast for a total failure | — | named residual: backlog note, owner has not ruled | D |

gap-resolution legend: A — proven now. B — gate added/corrected by this plan. C — deferred to a named later step. D — backlog residual.

Legacy line form (retained for existing consumers):
- settings/roles: [Fully-automated: `grep -c` = 0] + [agent-probe: P1/P2/N1/N2/R1]
- requests/timesheets bulk: [Fully-automated: new unit tests via `pnpm test`] + [hybrid: `CI=1 pnpm test:e2e -- form-errors`, precondition = self-seeded SUBMITTED timesheet] + [agent-probe: P1/P2/P3]
- TimesheetModal strip: [Fully-automated: `grep -c "form?.error"` = 0] + [agent-probe: P3, R2, R3]
- B5 labels: [Fully-automated: per-file ellipsis counts + both locator greps] + [hybrid: three named e2e specs] + [agent-probe: P1-P4]
- `skipped` counter semantics: [known-gap: documented, backlog note, owner has not ruled]

### Dimension findings

- Infra fit: **CONCERN** — `pnpm test:e2e` and `pnpm dev` both load `.env.dev`, so the e2e suite runs against the OWNER'S dev database. `tests/e2e/global-setup.ts:81-82` runs `db.timesheet.deleteMany({ where: { employeeId: <employee@veent.ph> } })` on every run. The only SUBMITTED timesheet in the dev DB today, `cmtuzqmpk001561zqp6z2trxk`, belongs to `employee@veent.ph` — the e2e run DELETES it. §3 runs the e2e (step 8) before the live probes (step 9), so §3 as written destroys its own probe fixture.
- Test coverage: **FAIL** — the plan's headline new e2e opens with `test.skip()` when the review queue is empty, and the queue IS empty at the moment `form-errors.spec.ts` runs (global-setup wipes it; `timesheet-approval.spec.ts` consumes its own card before it finishes). A gate that skips on every run is not a gate. The repo already has the fixture mechanism the plan says does not exist.
- Breaking changes: **PASS** — no server logic, no schema, no API, no auth. Every action keeps returning `{ error }` / `{ saved }`. `submitFeedback` reads the same keys. `Banner kind="error"` `role="alert"` (`Banner.svelte:42`) is replaced by the toast's `aria-live="assertive"` (`Toaster.svelte:64`) — the assertive announcement survives, and the two hand-rolled strips being deleted carry no ARIA role at all. Accessibility is net-neutral at worst, as claimed.
- Security surface: **PASS** — no auth, identity, billing, secrets, migration, or trust boundary. No high-risk class. No evidence pack required.
- Section §1 (B2, `/settings/roles`): **PASS** — mechanical feasibility exact; both halves of the safety claim verified against source; the delete range is right to the line. One CONCERN carried (C1).
- Section §2 (B3 part 1, bulk voice): **CONCERN** — the premise is TRUE and the §2→§3 ordering is genuinely load-bearing. All four outcomes are covered. Line refs in the checklist are wrong (C4).
- Section §3 (B3 part 2, delete banners + modal strip): **FAIL** — two FAIL-grade instructions (F1, F2) plus three CONCERNs. The DECISION (toast wins) is sound; the instructions that verify it are not.
- Section §4 (B5, six labels): **PASS** — every line number, every exclusion, and both counts verified exact. Locator safety verified. One incomplete check (C2).

### Claims REFUTED against source

| # | Plan's claim | Source evidence | Severity |
|---|---|---|---|
| F1 | The new e2e is "the first 'exactly one visible message' assertion in the repo" and "there is no fixture helper that guarantees a pending timesheet … which is why the new e2e carries a `test.skip()`" | `tests/e2e/form-errors.spec.ts:86-89` already asserts the exact triple (`toHaveText(/Invalid status/)`, `toHaveCount(1)`, `getByRole('alert')…toHaveCount(0)`), added by `661719d`. And `tests/e2e/timesheet-approval.spec.ts:42-70` `resetFixture()` seeds a timesheet by direct Prisma upsert, which `helpers.ts:64-82` then drives through `/requests/timesheets`. The fixture pattern exists and is already sanctioned in this repo | **FAIL** |
| F2 | §3 probe R2: "Log in as `employee@veent.ph` … Force a `?/saveEntries` failure" | `TimesheetModal.svelte:88-90` — `canEdit = mode === 'edit' && canModify && isManager && ts != null && ts.status !== 'APPROVED'`. An Employee is not a manager, so the `?/saveEntries` form at `:547` never renders for that account. R2 as written is impossible; an agent would read "no toast" and revert §3 per the plan's own rule | **FAIL** |
| C1 | "the `form` prop is still read by other logic; do not delete the prop, do not delete the destructure" (Public Contracts, `TimesheetModal`) | `grep -n form src/lib/components/timesheets/TimesheetModal.svelte` → `form` appears at `:44` (type), `:54` (destructure default), `:347`, `:351` (the strip §3 deletes) and NOWHERE else. After §3 it has zero readers. The same is true of `let { data, form }` at `settings/roles/+page.svelte:18` after §1. `eslint.config.js` sets `no-unused-vars: ['error', …]` and it applies to `**/*.svelte`. The plan's mitigation ("leave it and note it") rests on a false premise and may contradict Acceptance Criterion 12 (gates green after every section) | CONCERN |
| C2 | "every writer on `/timesheets` toasts on failure" | `src/routes/(app)/timesheets/+page.svelte:92` — `<form method="POST" action="?/submitMany" use:enhance={clearOnSuccess('mine')}>`, and `clearOnSuccess` at `:47-56` is a plain `SubmitFunction` factory that calls `update()` and toasts nothing. Not a silencing risk (it fires with the modal closed, where `:215`'s `!openTs` page banner still renders), but the blanket claim is false | CONCERN |
| C3 | The modal walk covers `?/review`, `?/saveEntries`, `?/syncAttendance` and the ConfirmButton delete | `TimesheetModal` has SIX form actions: `?/review` twice (`:511` hidden reject form, `:561` approve), `?/saveEntries` (`:547`), `?/syncAttendance` (`:572`), `?/submit` (`:582`), `?/submitDraft` (`:592`), plus `ConfirmButton action="?/delete"` (`:533`, `submit={closeOnSuccess}` raw). The conclusion HOLDS — all six route through `closeFb`/`keepOpenFb`/ConfirmButton's own `submitFeedback`, and `submit-feedback.svelte.ts:84-87` always yields a string (`data.error` or `FRIENDLY_ERROR`) — but the enumeration was incomplete, and `?/submit` is exactly the action the existing `timesheet-approval.spec.ts:130` assertion depends on | CONCERN |
| C4 | Line refs in the B3 outcome table and the §2 checklist | approveMany `saved` cited `:135-137`, actual `:137-139`. rejectMany `saved` cited `:167-169`, actual `:169-171`. 403 cited `:117`/`:148`, actual `:118`/`:147`. 400 cited `:123`/`:157-159`, actual `:124`/`:155-156`. Checklist "swap `:100`" — the `?/approveMany` form and its `use:enhance` are both on `:101`. Checklist "`:105-109`" — the `?/rejectMany` form opens at `:109` and its `use:enhance` is on `:113`. `disabled={busy}` cited `(:103, :118)`, actual `:104`/`:119`. Also `submit-feedback.svelte.ts` `:83-88`→`:83-87`, `:38-40`→`:38-41`, `:97-99`→`:97-100`; `TimesheetModal` `zIndex={50}` cited `:290`, actual `:291`; `settings/roles` in-dialog strip cited `:328-336`/`:327-336`, actual `:328-337`; `#283` comment cited `:32-43`, actual `:33-45`; unit-test `event()` helper cited `:39-48`, actual `:40-49` | CONCERN |
| C5 | B5 locator safety is settled by `grep "exact: true" \| grep -iE "reject\|return"` | That grep only catches a locator that newly MATCHES. A non-exact locator naming the OLD string (`name: 'Reject…'`) would newly MISS, and the plan's check cannot see it. Verified 0 such hits today (`grep -rn "Reject" tests/` returns only `mockRejectedValue` / `expectRejectedAt` / `PromiseRejectedResult`), so there is no live risk — the stated check is simply incomplete | CONCERN |

### Claims VERIFIED — do not re-derive

- §1 delete range `156-164` is EXACT: the HTML comment is `156-157`, the `{#if form?.error}` block is `158-164`. No off-by-one, no orphaned comment.
- B2's safety claim holds on BOTH halves. `setActiveGuard` (`settings/roles/+page.svelte:29`) is a bare `submitFeedback()` — no `error` option — so a `?/setActive` failure always toasts. `setRoleGuard` (`:47-65`) returns early on `result.type === 'failure'` WITHOUT calling `update()` (`:48-62`), so a rejected role save never publishes to page-level `form`; it renders in-dialog at `:328-337` on the local `saveError` with focus pulled onto it. Exactly 2 references to `form.error` on the route, both inside the deleted block.
- §3 delete ranges are EXACT: `requests/timesheets/+page.svelte:66-72` is both `{#if}` blocks; the `Banner` import is `:5`; `TimesheetModal.svelte:347-353` is the strip; the `REJECTED` stored-reason panel at `:355-360` is safely two lines below.
- The bulk actions have NO toast today. `clearOnSuccess` (`requests/timesheets/+page.svelte:30-40`) is a plain `SubmitFunction`, not `createSubmitGuard`, not `submitFeedback`; the page's imports (`:1-12`) include no toast helper. **The §2→§3 hard ordering is correct and necessary.**
- §2 covers all four outcomes. Non-empty `saved` at `+page.server.ts:138` and `:170` (distinct strings); non-empty `error` at `:118`/`:147` (403), `:124`/`:155` (`No timesheets selected`), `:156` (`A reason is required to reject.`). With no `success`/`error` option `submitFeedback` uses `savedMessage` (`:77-81`) and `data.error` with a `FRIENDLY_ERROR` fallback (`:84-87`) — no failure branch can be silent.
- No double-`update()`. `clearOnSuccess` returns its own callback, so `after` is truthy and `if (!after) await o.update()` is skipped on both branches (`submit-feedback.svelte.ts:82`, `:90`). §2's core assumption holds.
- The stacking claim holds. Toaster container is `role="status"` with `class="… z-[100]"` (`Toaster.svelte:44-48`); an error toast is a child carrying `aria-live="assertive"` (`:64`); `TimesheetModal`'s `Dialog` is `size="full" scroll zIndex={50}` (`:284-291`) and the action buttons are in the footer at `:528-529`, in the same scroll flow as the strip at `:347`. The F3-shape reading is correct.
- The bare `getByRole('alert')).toHaveCount(0)` is SAFE on `/requests/timesheets` after §3: no `role="alert"` exists in `src/routes/+layout.svelte`, `src/routes/(app)/+layout.svelte`, or `src/lib/components/layout/`, and `Banner.svelte:42` (which gives the role to `error` AND `warning`) is the only producer in play once the import is gone.
- B5 is exact on every count. All six targets verified at the named lines: `TimesheetModal.svelte:559`, `requests/timesheets/+page.svelte:122`, `requests/proposals/+page.svelte:213`, `requests/approvals/+page.svelte:219`, `:367`, `:374`. All six exclusions verified: `:178`, `:202`, `:240`, `:360`, `:412`, `:522`. Current per-file counts are 2 / 2 / 3 / 5 = **12**; post-edit 1 / 1 / 2 / 2 = **6**. No `<option>` text is involved anywhere in the twelve.
- B5 locator safety holds. `grep -rn "exact: true" tests/e2e/ | grep -iE "reject|return"` → 0 hits. No test in `tests/` selects any Reject or Return button by name. `helpers.ts:79` `dialog.getByRole('button', { name: 'Approve' })` and the two `toHaveCount(0)` siblings (`timesheet-approval.spec.ts:126`, `timesheet-punch.spec.ts:113`) are all on `Approve`, untouched by this plan.
- No explanatory comment enters `src/`. §1 DELETES a comment, §3 deletes only, §4 changes six characters, §2 adds one line of code and zero comments. The only prose added is two short test-file headers, which match the existing style of both files (`request-decide-feedback.test.ts:4-14`, `form-errors.spec.ts:4-11`, `:73-74`). **The standing owner rule is not violated.**
- The plan's five source paths, two test paths, and every read-only context path exist on disk. `validate-plan-artifact.mjs` returns 0 failures, 0 warnings.

### Fixture reality — the dev DB right now

Queried live (`docker exec veent-db-5434 psql -p 5434 -U veent -d veent_hris`):

| id | status | employee | consequence |
|---|---|---|---|
| `cmtuzqmpk001561zqp6z2trxk` | SUBMITTED | Elena Employee (`employee@veent.ph`) | the ONLY card in `/requests/timesheets`. `approval_steps` is EMPTY, so `liveChain` returns null and the legacy `canAny(roles,'VIEW_TEAM')` branch (`+page.server.ts:56`) admits it — `admin@veent.ph` WILL see it. **Deleted by `global-setup.ts:81-82` on any e2e run.** |
| `cmtuzqmq9001h61zqc4bk89aj` | REJECTED | Maria Manager (`manager@veent.ph`) | not in the review queue. IS editable on `/timesheets` as `manager@veent.ph` (`canEdit` needs `isManager` and `status !== 'APPROVED'`) — **this is the correct R2 fixture** |
| `cmtux2gde0854pkkv2mcd2khu` | APPROVED | Elena Employee | not editable (`canEdit` excludes APPROVED), not in the queue |

So: the §2 and §3 live probes CAN run — but on ONE card. §3's probe set needs at least four pending timesheets (P1 rejects one, P2 approves another, R1 selects two for a bulk approve). With one card, P2 and R1 are `BLOCKED — no fixture` no matter what order they run in.

### Open gaps

- `skipped` counter returns a green success toast for a total failure (`+page.server.ts:133-135`, `:165-167`): known-gap: documented as NEW PLAN REQUIRED — backlog note is §2 step 9, `process/features/ui-ux-overhaul/backlog/bulk-timesheet-skipped-counter_NOTE_10-09-26.md`. Owner has not ruled. Correctly out of scope.
- `timesheets/+page.svelte:219` (`form?.saved` with no `!openTs` guard) still shows banner + toast on a successful modal action: known-gap, out of scope, record in the report.
- §3 probe fixture depth: only 1 pending timesheet exists; §3's probes need ≥4. Owner decision required (see D1).
- The unused-`form` gate outcome (C1) could not be measured — the linter could not be run in this session (auto-mode denied `eslint`, `pnpm exec eslint` and `node -e`). EXECUTE must measure it, not assume it.
- Test-infra note (out of scope, do not build): a shared `expectExactlyOneErrorToast(page, /text/)` helper. This is now the THIRD site to hand-write the same triple.

### What this coverage does NOT prove

- `pnpm test` / `pnpm check` / `pnpm lint` / `grep` guards prove no DOM behaviour at all — not that a toast appears, not that it is on screen, not its colour, not the message count. Every "one message" claim in this plan rests on a live probe or the one new e2e.
- The new unit tests prove only the SHAPE of the server payload (a non-empty, distinct string per path). They do not prove the string ever reaches a user, and they cannot: there is no DOM in vitest.
- The new e2e proves the count on ONE outcome (`No timesheets selected`, the bulk 400) on ONE route. It does NOT prove the bulk approve success path, the bulk reject success path, the 403, `A reason is required to reject.`, the modal review paths, the `/timesheets` shared-modal behaviour, the rejection-is-not-green claim, or the toast's stacking above the dialog.
- `CI=1 pnpm test:e2e -- timesheet-approval timesheet-punch manager-org-wide-timesheets` proves those three specs still pass. It does not prove they would have CAUGHT a regression on `/requests/timesheets` — all three assert against `/timesheets`, a route this plan does not edit.
- `CI=1 pnpm test:e2e -- approval-chain multi-role-sod timesheet-approval` proves the renamed buttons are still reachable. It does not prove the labels read correctly — nothing in `tests/` asserts on a Reject or Return label at all, which is exactly why §4's probe N1 is not optional.
- No automated tier at any level proves: the rejection is not announced in green (3.4), the toast is stacked above and inside the viewport of an open dialog (3.5), or that `/timesheets` is not silenced by the shared-component deletion (3.6). Those three are agent-probe only, and 3.6 is the one that decides whether §3 ships or reverts.
- Nothing in this plan proves the `skipped` counter is honest. `Approved 0 timesheets, 5 skipped.` will now be delivered as a GREEN success toast — the plan moves that defect to a louder surface without fixing it. Named residual.
- Nothing proves the probes ran against a real failure rather than a mistyped selector. That is what the N1 negative control is for, in all four sections, and a section is not VERIFIED without it firing.

### Execute-agent instructions

| # | Instruction | Trigger |
|---|---|---|
| E1 | §1 and §4 are clear to execute exactly as written. Every line number, range and count in both was verified against source. | §1 / §4 entry |
| E2 | §2 is clear to execute, but IGNORE the checklist line numbers. The `?/approveMany` form and its `use:enhance` are on `:101`; the `?/rejectMany` form opens at `:109` and its `use:enhance` is on `:113`; `disabled={busy}` is at `:104` and `:119`. Locate by `action="?/approveMany"` / `action="?/rejectMany"`, never by line. | §2 step 3 |
| E3 | **§3 is BLOCKED until F1 and F2 are amended.** Do not start §3 on the current text. | §3 entry |
| E4 | §3: SWAP steps 8 and 9. Run the LIVE PROBES FIRST, then the e2e. `pnpm test:e2e` loads `.env.dev` — the same database the dev server uses — and `global-setup.ts:81-82` deletes every timesheet belonging to `employee@veent.ph`, which is the only card in the review queue. Running the e2e first destroys the probes' only fixture. | §3 steps 8-9 |
| E5 | §3 probe R2: use `manager@veent.ph` and timesheet `cmtuzqmq9001h61zqc4bk89aj` (REJECTED, manager-owned, therefore `canEdit`). NOT `employee@veent.ph` — `TimesheetModal.svelte:88-90` requires `isManager`, so an Employee never sees the Save-entries button and R2 would read as a false negative. | §3 probe R2 |
| E6 | §3 probe ordering within the probe block: run P3 (forced review failure, consumes nothing) BEFORE P1 (reject, consumes the card). With one pending timesheet, P2 and R1 are `BLOCKED — no fixture`; record them that way and do NOT seed the owner's dev DB without asking. | §3 step 9 |
| E7 | The new e2e must NOT rely on `test.skip()`. Seed its own SUBMITTED timesheet with a distinctive hours label using the Prisma-upsert pattern at `tests/e2e/timesheet-approval.spec.ts:42-70`, and reset it in a `beforeEach`/`afterEach`. A test that skips on every run is not a gate, and AC 6 demands the assertion actually execute. | §3 step 6 |
| E8 | Prove the new e2e can FAIL before trusting it (negative control): temporarily change the expected text to `No timesheets selectedAAA` and confirm it goes RED; then change `toHaveCount(1)` to `toHaveCount(2)` and confirm RED again. Record both. Revert. Do the same for the two new unit tests — assert the WRONG string once and watch it fail. | §2 step 6 / §3 step 6 |
| E9 | Run `pnpm lint` ALONE, immediately after each deletion, before the rest of the gate set. If it reports `form` unused: for §1 the fix is in-scope and clean — reduce `let { data, form }: { data: PageData; form: ActionData } = $props()` at `settings/roles/+page.svelte:18` to `let { data }: { data: PageData } = $props()` and drop the now-unused `ActionData` from the type import. For §3 there is NO in-scope fix — removing the prop from `TimesheetModal` forces an edit to `src/routes/(app)/timesheets/+page.svelte:259`, which Scope forbids. STOP and ask the owner; do not silently widen §3. | §1 step 4 / §3 step 7 |
| E10 | Add the missing half of the B5 locator check as §4 step 5b: `grep -rniE "Reject…\|Return…\|Reject selected…" tests/` must return 0. The plan's `exact: true` grep only catches a locator that newly MATCHES; this one catches a locator that newly MISSES. | §4 step 5 |
| E11 | The §3 blast-radius walk is incomplete. `TimesheetModal` has SIX form actions, not four: `?/review` (`:511`, `:561`), `?/saveEntries` (`:547`), `?/syncAttendance` (`:572`), `?/submit` (`:582`), `?/submitDraft` (`:592`), plus `?/delete` via ConfirmButton (`:533`). All six toast on failure, so no action is left mute — but note `?/submit` is what `timesheet-approval.spec.ts:130` asserts, and it must be re-run. | §3 report |
| E12 | Warn the owner before running any e2e: `CI=1 pnpm test:e2e` will DELETE `cmtuzqmpk001561zqp6z2trxk` (Elena's SUBMITTED timesheet from today's test pass). `cmtuzqmq9001h61zqc4bk89aj` survives. | before §3 step 8 and §4 step 7 |
| E13 | Record the pre-existing attendance e2e failure as pre-existing in the report, with the exact spec name and the command that produced it. Do not fix it, do not let it gate §3. | §3 / §4 report |

### Owner decisions required

| # | Question | Options |
|---|---|---|
| D1 | §3's live probes need at least four pending timesheets; the dev DB has one. | **(a)** Accept `BLOCKED — no fixture` on P2 and R1; §3 lands CODE DONE, not VERIFIED. **(b)** Allow the execute-agent to seed pending timesheets with distinctive hours labels using the SAME Prisma-upsert pattern the e2e suite already uses (`timesheet-approval.spec.ts:42-70`), and delete them afterward. Recommended: **(b)** — it is the repo's own existing mechanism, not a fabricated fixture, and without it §3 can never reach VERIFIED. |
| D2 | If `pnpm lint`/`pnpm check` flags the now-dead `form` prop on `TimesheetModal` after §3. | **(a)** Widen §3 by three lines (drop the prop at `:44`/`:54` and the `{form}` pass at `requests/timesheets/+page.svelte:172` and `timesheets/+page.svelte:259`) — clean, but touches a file Scope forbids. **(b)** Suppress with an eslint-disable — adds noise to source. Recommended: **(a)**, with the owner's explicit sign-off on the one out-of-scope line. |

Open gaps: see Open gaps above.

Gate: BLOCKED — 2 unresolved FAILs (F1: the new e2e cannot run and its stated justification is false; F2: probe R2 names an account for which the tested control never renders). §1, §2 and §4 are independently committable and are CLEAR to execute now; only §3 is blocked. Both FAILs are one-paragraph plan amendments, not design changes — none of the three surface rulings needs reopening.
Accepted by: not accepted — BLOCKED. Return to PLAN for the §3 amendments (F1, F2), then re-run VALIDATE from V1.

## Autonomous Goal Block — Run 1 (SUPERSEDED)

**Superseded 10-09-26 by the Amendment log.** The block below reflects the AMENDED plan. The previous version (which said "do not start §3 until F1 and F2 are amended") is obsolete — F1, F2 and all five CONCERNs are now amended in. A fresh VALIDATE run from V1 is still required before EXECUTE.

SESSION GOAL: land B2/B3/B5 — one message per action on /settings/roles and /requests/timesheets, and drop the ellipsis from six Reject/Return labels — as four separate conventional commits on feat/uiux-phase-4, with each section's grep guards, CI gate set, and live probes recorded before the next section starts.

CONTRACT SUMMARY: the previous VALIDATE gate was BLOCKED for §3 only, on two FAILs. Both are amended: the new e2e now seeds its own SUBMITTED timesheet via the repo's existing Prisma-upsert pattern (tests/e2e/timesheet-approval.spec.ts:42-70) and has no test.skip(); probe R2 now runs as manager@veent.ph on timesheet cmtuzqmq9001h61zqc4bk89aj and asserts its precondition (the ?/saveEntries control is present) BEFORE measuring. §3's steps 8 and 9 are swapped — probes first, e2e last — because pnpm test:e2e loads .env.dev and global-setup.ts:81-82 deletes the review queue. §1, §2 and §4 passed source verification line-for-line; §2's two bulk forms must be located by action attribute, never by line number.

AUTONOMY RULES: re-run VALIDATE from V1 first. On approval, execute §1, then §2, then §4, then §3. Commit each section on its own. Run pnpm lint alone straight after each deletion, before the rest of the gate set, and READ the output — the dead form prop is a measurement, not an assumption. Seed probe fixtures under D1 using the e2e suite's own Prisma-upsert pattern with distinctive hours labels, delete every seeded row afterward, and record the ids. Record every probe with actual DOM evidence (outerHTML, computed styles, counts) and confirm both negative controls fired; "it worked" is not evidence.

HARD STOPS: do not run any e2e without first telling the owner it will delete timesheet cmtuzqmpk001561zqp6z2trxk. Do not touch, mutate, or delete any database row the agent did not create. Do not run db:seed:e2e. Do not edit src/routes/(app)/timesheets/+page.svelte except the single {form} pass at :259, and only if pnpm lint actually fails (owner decision D2). Do not touch any +page.server.ts, any button class list (issue #27), or submit-feedback / submit-guard / Banner / Toaster / toast / ConfirmButton / ReasonDialog. Do not add an explanatory comment to any file under src/. Do not revert §3 on an R2 whose precondition failed — that is BLOCKED, not a failure. Do not push. Do not add any attribution trailer to any commit.

NEXT PHASE: VALIDATE from V1 against this amended plan. Then EXECUTE §1 (settings/roles strip, delete lines 156-164 exactly), §2 (bulk toast + two unit tests + backlog note), §4 (six labels), §3 (banners + modal strip; probes before e2e).

EXECUTE START COMMAND: start with process/general-plans/active/feedback-duplicate-messages-b2-b3-b5_10-09-26/feedback-duplicate-messages-b2-b3-b5_PLAN_10-09-26.md Section 1, following Execute-agent instructions E1, E2, E9 and E13 in the Validate Contract, as amended by the Amendment log at the top of this plan.

---

## Validate Contract

Status: CONDITIONAL
Date: 10-09-26
date: 2026-09-10
generated-by: outer-pvl
supersedes: 2026-09-10 (outer-pvl) — run 2 re-validates the amended plan at `b886a4d`; the run-1 contract above is retained as the audit record

Parallel strategy: sequential (one deep source-verification pass)
Rationale: 2/7 signals — S5 (owner explicitly asked for adversarial depth on an amendment) and S7 (5 source + 2 test files). Same call as run 1, same reason: the work is reading each cited line and its neighbours in order, plus three live DB queries. A fan-out would have split the one thing that mattered.

### Verdict in one line

Both FAILs are genuinely fixed and every line number in the amendment is exact. **Zero FAILs remain.** One material CONCERN survives: the D2 lint carve-out cascades one file further than the plan admits, and §3 step 3 explicitly forbids the follow-on edit — so §3 as written cannot satisfy Acceptance Criterion 12. It is resolved by execute-agent instruction E1 below, not by returning to PLAN.

### What was RE-VERIFIED and now holds (run 1's FAILs)

| # | Amendment claim | Source evidence | Verdict |
|---|---|---|---|
| F1 | The new e2e seeds its own SUBMITTED timesheet, cleans up by id, and fails rather than skips | `tests/e2e/timesheet-approval.spec.ts:42-70` is a plain `PrismaClient` upsert with no fixture-harness dependency — copyable into `form-errors.spec.ts`, which today imports only `./helpers` (`:1-2`) and needs one added import. `prisma/schema.prisma:676` gives `TimesheetEntry.timesheet` `onDelete: Cascade`, so `db.timesheet.delete({ where: { id } })` removes exactly the seeded row and its entries and nothing else. `tests/e2e/global-setup.ts:81-82` runs ONCE in `globalSetup`, before any test file, so it cannot race a `beforeEach` seed. `playwright.config.ts:23` sets `workers: 1` under `CI`, and the plan mandates `CI=1`, so no sibling spec runs concurrently | **FIXED** |
| F1b | The seeded card actually reaches the review queue (so the test can pass at all) | A raw-seeded SUBMITTED timesheet has no `approvalSteps`; `approvals.ts:41` returns `null` from `liveChain([])`, and `requests/timesheets/+page.server.ts:52-54` then falls to the legacy branch `return canAny(roles, 'VIEW_TEAM')`. `USERS.admin` is `SUPER_ADMIN`, which holds both `MANAGE_HR` and `VIEW_TEAM` (`src/lib/rbac.ts:26,48`), so the card renders | **HOLDS** |
| F1c | The negative controls are real | The toast node `[role="status"] [aria-live="assertive"]` is produced only by `Toaster.svelte:45,64`; a corrupted expected string makes `toHaveText` red, and `toHaveCount(2)` is red because exactly one toast node exists. Neither can pass vacuously | **REAL** |
| F2 | R2 as `manager@veent.ph` on `cmtuzqmq9001h61zqc4bk89aj` satisfies `canEdit` | DB: that row is `status = REJECTED`, `employeeId = cmszfa1u5004g11747nfo70q9` (Maria Manager), whose `userId` is the `manager@veent.ph` user; that user's `roles` is `{MANAGER}`. `src/lib/rbac.ts:48` puts `MANAGER` in `VIEW_TEAM`; `timesheets/+page.server.ts:39,45` sets `isManager = canAny(roles,'VIEW_TEAM')` and `canModify = isManager`; both are passed at `timesheets/+page.svelte:255,257`. `TimesheetModal.svelte:88-90` then yields `canEdit = true` — `REJECTED` is not `APPROVED`, and no other gate applies | **FIXED** |
| F2b | The R2 precondition is satisfiable, not a permanent BLOCKED | `TimesheetModal.svelte:546-547` renders `<form action="?/saveEntries">` inside `{#if canEdit}` — exactly one instance, since only one modal is mounted. Its button is `disabled={busy}` with `busy = $state(false)` (`:69`), so it is visible and enabled at rest. The row is reachable: Maria's own sheet lists in the "mine" table and `timesheets/+page.svelte:155` makes each `<tr>` open the modal via `openReview(ts)` | **SATISFIABLE** |
| F2c | The forced `?/saveEntries` failure produces a toast | `timesheets/+page.server.ts:337-357` returns `fail(400, { error })` or `toFail(e)`; `submit-feedback.svelte.ts:83-87` toasts `data.error`, and `:91-92` toasts `FRIENDLY_ERROR` even on a raw `error` result. No path is mute | **HOLDS** |
| Reorder | Probes at step 8, e2e at step 9 — fixtures survive | §3 steps 1-7 are file edits plus `format:check` / `lint` / `check` / `test`. `vitest.config.ts` scopes `pnpm test` to `tests/unit/**` with no `dotenv` wrapper, and the Prisma references in those files are `PrismaClientKnownRequestError` constructions, not live clients. Nothing between step 1 and step 8 touches the database | **SOUND** |
| D1 / D2 | Stated as authorised steps with measurable preconditions, not questions | Both appear as `**D1 = YES**` / `**D2 = YES, conditionally**` in the Amendment log, in Phase Completion Rules, in Scope, and in Public Contracts. D2's precondition is `pnpm lint` output, read alone. `timesheets/+page.svelte:259` is verified to be exactly the `{form}` line inside the `<TimesheetModal>` tag opened at `:252` — the carve-out is genuinely one line | **HOLDS** |
| C4 | Line numbers fixed throughout | Every number verified exact: `+page.server.ts:118` and `:147` are the two `fail(403,…)`; `:124` and `:155-156` are the three `fail(400,…)`; `:137-139` and `:169-171` are the two `saved:` returns. On `requests/timesheets/+page.svelte`: `:101` form + `use:enhance`, `:104` `disabled`, `:109` form open, `:113` `use:enhance`, `:119` `disabled`, `:122` `Reject selected…`. §2 step 3 AND checklist item 8 both instruct EXECUTE to locate the two bulk forms by `action=` attribute | **EXACT** |
| C5 | 5a / 5b split | Both greps present in §4 step 5 and both return **0 hits** today, re-run and confirmed | **HOLDS** |
| C1 / C2 / C3 | corrections | C1: `form` in `TimesheetModal.svelte` appears only at `:44`, `:52`, `:347`, `:351` — zero readers after §3. C2: `timesheets/+page.svelte:92` is `use:enhance={clearOnSuccess('mine')}` and `:215` carries `&& !openTs` while `:219` does not — restated claim is accurate. C3: six form actions verified at `:510`, `:547`, `:561`, `:572`, `:582`, `:592` plus `ConfirmButton action="?/delete"` at `:533` | **HOLD** |
| §1 execution | The committed diff matches §1 | `a4b3dcd` deletes exactly the comment + `{#if form?.error}` block (old `:156-164`) and, per the Public Contracts §1 carve-out, drops `form` from `$props()` and `ActionData` from the type import. `grep -c "form?.error\|form\.error\|form?.saved"` on that file = **0**. The `#283` in-dialog surface survives at `:318-325` with `role="alert"` at `:321` | **CORRECT, NO REGRESSION** |
| Lint gate | `pnpm lint` is usable again | Ran it: **0 errors, 1 warning** (`CalculatorWindow.svelte:82`, pre-existing a11y warning). `ab695c5` added `playwright-report/` and `test-results/` to `eslint.config.js` ignores | **USABLE GATE** |

### Claims REFUTED / gaps found in the amendment

| # | Finding | Source evidence | Severity |
|---|---|---|---|
| **N1** | **The D2 lint carve-out stops one file short, and §3 step 3 forbids the follow-on edit.** §3 step 3 says "Keep the `form` prop destructure at `:14` … Do not delete it", while Public Contracts D2 authorises removing `{form}` from `requests/timesheets/+page.svelte:172`. Those two cannot both hold | `grep -n "form\b\|ActionData" "src/routes/(app)/requests/timesheets/+page.svelte"` → `form` occurs at `:12` (type import), `:14` (`$props()`), `:66`, `:67`, `:70`, `:71` (the Banners §3 step 1 deletes) and `:172` (`{form}`) — **and nowhere else**. So once step 1 deletes `:66-72` and D2 deletes `{form}` at `:172`, the destructured `form` at `:14` and the `ActionData` import at `:12` are both orphaned. `a4b3dcd` is empirical proof that eslint DOES flag an orphaned `$props()` destructure in a `.svelte` file — that is exactly why `form`/`ActionData` were removed from `settings/roles/+page.svelte`. §3 as written therefore cannot satisfy Acceptance Criterion 12 ("lint green after every section"). Resolved by E1 | CONCERN |
| **N2** | The e2e seed shape is under-specified in two ways that decide whether the test passes. The plan says "Create one SUBMITTED timesheet with a distinctive hours label" but names neither the labels already in play nor `submittedAt` | `requests/timesheets/+page.server.ts:47` orders by `submittedAt: 'asc'` — a `null` sorts last in Postgres but the field should be set anyway for realism. And `helpers.ts:73-75` filters review cards by `hoursLabel`; the dev DB and the sibling specs already use `0.00`, `3.00` and `7.00` totals. A seed reusing one of those is ambiguous on sight and in query. Resolved by E2 | CONCERN |
| **N3** | The plan never tells EXECUTE to confirm the dev server is up before a probe block. `pnpm check` is `svelte-kit sync && svelte-check` (`package.json:20`), and this repo's own working lesson is that running it kills the owner's dev server. §1/§2/§3/§4 each run the full gate set immediately BEFORE their probe block, and every probe drives `http://localhost:5173` | `package.json:20`; §1 step 4→5, §2 step 7→8, §3 step 7→8, §4 step 6→8. A probe that silently hits a dead server reads as "no toast" — the same false-negative class F2 was. Resolved by E3 | CONCERN |
| **N4** | §3 success criterion 3.3 still describes the e2e precondition as "needs build+preview + **a pending timesheet**", which reads as an external precondition. After the amendment the test seeds its own | Plan §3 success-criteria table, row 3.3, vs §3 step 6 ("it seeds its own fixture"). Cosmetic staleness only; the step text governs | minor |
| **N5** | C3's table puts the hidden reject form's `?/review` at `:511`; the `action` attribute is at `:510` (the `<form>` tag opens at `:507`) | `grep -n 'action="?/' src/lib/components/timesheets/TimesheetModal.svelte` → `510`. Orientation-only reference; §3 does not edit that form | minor |

Nothing else the amendment touched broke. §2's and §4's rulings, orderings, and success criteria are unchanged by the reorder; the Amendment log's seven rows each describe a change that is actually present in the file.

### Test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| 1.1 / 2.1 / 3.1 / 3.2 / 4.1 / 4.2 | the named surface is actually gone / actually wired | Fully-Automated | `grep -c "form?.error\|form\.error\|form?.saved" "src/routes/(app)/settings/roles/+page.svelte"` = 0 (**already 0 at `a4b3dcd`**); `grep -c "Banner" "src/routes/(app)/requests/timesheets/+page.svelte"` = 0; `grep -c "form?.error" src/lib/components/timesheets/TimesheetModal.svelte` = 0; `grep -c "bulkFb.enhance" "src/routes/(app)/requests/timesheets/+page.svelte"` = 2; ellipsis per-file counts 1/1/2/2 | A |
| 4.3 (half) | no `exact: true` locator newly matches a renamed button | Fully-Automated | `grep -rn "exact: true" tests/e2e/ \| grep -iE "reject\|return"` = 0 — **re-verified 0 at `b886a4d`** | A |
| 4.3 (other half) | no locator naming the OLD ellipsis string newly MISSES | Fully-Automated | `grep -rniE "Reject…\|Return…" tests/` = 0 — **re-verified 0** | A |
| 1.5 / 2.5 / 3.9 / 4.5 | nothing else broke | Fully-Automated | `pnpm format:check && pnpm lint && pnpm check && pnpm test` after each section. `pnpm lint` is a REAL gate again: 0 errors / 1 pre-existing warning at `ab695c5` | A |
| Public Contracts / D2 / **E1** | the orphaned `form` props and their type imports do not leave the lint gate red | Fully-Automated | `pnpm lint` run ALONE immediately after each deletion, output read. Cascade to `requests/timesheets/+page.svelte:12,14` is in scope per E1 | B |
| 2.2 | every bulk outcome carries a non-empty string the toast can read | Fully-Automated | new `describe` in `tests/unit/request-decide-feedback.test.ts`, run by `pnpm test` | B |
| 3.3 / Goal 6 | a bulk 400 shows exactly ONE visible message and it is the toast | Hybrid | new test in `tests/e2e/form-errors.spec.ts`, run by `CI=1 pnpm test:e2e -- form-errors`. Precondition is now INTERNAL — the test seeds its own SUBMITTED timesheet (`beforeEach`) and deletes it by id (`afterEach`). No `test.skip()`. Both negative controls must be fired and recorded | B |
| 3.7 | the three `getByRole('main')` specs on `/timesheets` are unaffected | Hybrid | `CI=1 pnpm test:e2e -- timesheet-approval timesheet-punch manager-org-wide-timesheets` | A |
| 4.3 | the renamed buttons are still reachable by every existing locator | Hybrid | `CI=1 pnpm test:e2e -- approval-chain multi-role-sod timesheet-approval` | A |
| 1.2 / 1.3 / 1.4 | a refused `setActive` reports once; the success path still speaks; the `#283` in-dialog refusal is untouched | Agent-Probe | §1 probes P1, P2, N1, N2, R1. **§1 is committed but NOT yet probed — it is CODE DONE, not VERIFIED** | C |
| 2.3 / 2.4 | the bulk string reaches the screen; the double-submit lock survives | Agent-Probe | §2 probes P1, P2, P3 + N1/N2 | A |
| 3.4 / 3.5 / 3.8 | a rejection reports once and not in green; a failed review is visible above the modal; the stored-reason panel survives | Agent-Probe | §3 probes P1, P2, P3, R1, R3 — run BEFORE the §3 e2e | A |
| 3.6 | `/timesheets` (shared modal) is not silenced | Agent-Probe | §3 probe R2 as `manager@veent.ph` on `cmtuzqmq9001h61zqc4bk89aj`, precondition asserted first — **re-verified satisfiable against source + DB** | A |
| 4.4 | every renamed button still opens its dialog | Agent-Probe | §4 probes P1-P4 + N1 | A |
| — | the `skipped` counter returns a green success toast for a total failure | — | named residual: backlog note at `process/features/ui-ux-overhaul/backlog/bulk-timesheet-skipped-counter_NOTE_10-09-26.md`; owner has not ruled | D |

gap-resolution legend: A — proven now. B — gate added/corrected by this plan. C — deferred to a named later step. D — backlog residual.

Legacy line form (retained for existing consumers):
- settings/roles: [Fully-automated: `grep -c` = 0, already true at `a4b3dcd`] + [agent-probe: P1/P2/N1/N2/R1 — still owed]
- requests/timesheets bulk: [Fully-automated: new unit tests via `pnpm test`] + [hybrid: `CI=1 pnpm test:e2e -- form-errors`, precondition self-seeded] + [agent-probe: P1/P2/P3]
- TimesheetModal strip: [Fully-automated: `grep -c "form?.error"` = 0 + `pnpm lint` alone] + [agent-probe: P3, R2, R3]
- B5 labels: [Fully-automated: per-file ellipsis counts + both locator greps] + [hybrid: three named e2e specs] + [agent-probe: P1-P4]
- `skipped` counter semantics: [known-gap: documented, backlog note, owner has not ruled]

### Execute-agent instructions (binding — read before Section 2)

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | **The D2 cascade.** After §3's deletions, run `pnpm lint` ALONE and read it. If it flags the orphaned `form` prop in `TimesheetModal.svelte`, D2 fires: delete the prop at `:44`/`:52` and the `{form}` at BOTH call sites (`requests/timesheets/+page.svelte:172`, `timesheets/+page.svelte:259` — locate by the `<TimesheetModal` tag). Then run `pnpm lint` AGAIN: `form` at `requests/timesheets/+page.svelte:14` and `ActionData` at `:12` are now orphaned too. **Removing those two is IN SCOPE for §3 and overrides §3 step 3's "keep the destructure at `:14`", which was written before D2 existed.** Make the same shape of edit `a4b3dcd` made on `settings/roles`: `let { data }: { data: PageData } = $props()` and `import type { PageData } from './$types'`. `timesheets/+page.svelte` keeps its own `form` — it is still read at `:215` and `:219`; the `{form}` at `:259` is the only permitted edit there. If lint is green at any stage, stop and change nothing further; record that it was green | §3 step 7 |
| E2 | **Seed shape for the new e2e.** Set `status: 'SUBMITTED'` and `submittedAt: new Date()` (the queue orders by `submittedAt asc`, `+page.server.ts:47`). Do NOT create `approvalSteps` — the empty chain is what routes the card down the legacy `VIEW_TEAM` branch (`+page.server.ts:52-54`) and makes it visible to `USERS.admin`. Pick a total-hours value that is NOT `0.00`, `3.00` or `7.00`; those three are already in the dev DB and in `helpers.ts:73-75`'s `hoursLabel` filter. Use a period well away from `timesheet-approval.spec.ts`'s "three months out, first of month" so the `@@unique([employeeId, periodStart])` constraint cannot collide | §3 step 6 |
| E3 | **Confirm the dev server before every probe block.** `pnpm check` (`package.json:20`) has killed the owner's dev server in this repo before. After each section's gate set and BEFORE its probes, confirm `http://localhost:5173` answers. If it does not, ASK the owner to restart it — do not start it yourself, and do not record a probe against a dead server. A dead server reads as "no toast", which is the same false-negative class that made §3's revert rule dangerous | §1 step 5, §2 step 8, §3 step 8, §4 step 8 |
| E4 | **§1 is CODE DONE, not VERIFIED.** `a4b3dcd` is committed and its grep guard is green, but probes P1, P2, N1, N2, R1 have not run. Run them before the plan is called complete; they may be run at any point (the surface is stable) | before plan close |
| E5 | Run the e2e suite ONLY as `CI=1 pnpm test:e2e -- <specs>`. `playwright.config.ts:23` sets `workers: 1` under CI, which is what removes the cross-file fixture race between the new `form-errors` seed and `timesheet-approval.spec.ts`. Without `CI=1` the suite runs `fullyParallel` with default workers and the seeds can collide | §3 step 9, §4 step 7 |
| E6 | `form-errors.spec.ts` today imports only `{ test, expect }` from `@playwright/test` and `{ login, USERS }` from `./helpers` (`:1-2`). The seed needs `import { PrismaClient } from '@prisma/client'` added — mirror `timesheet-approval.spec.ts:1-3`. Do not import the app's `$lib/server/db` singleton into a spec | §3 step 6 |
| E7 | The bare `getByRole('alert')).toHaveCount(0)` in the new e2e is verified safe on `/requests/timesheets` specifically: `Banner.svelte:42` is the only `role="alert"` producer in play on that route and §3 step 1-2 removes it entirely. No dialog or toast component emits `role="alert"`. Do NOT copy this bare assertion to any other route without re-checking | §3 step 6 |
| E8 | Record §3 success criterion 3.3's wording as stale (N4) and C3's `:511` as `:510` (N5) in the phase report. Do not amend the plan mid-execution for either — both are orientation-only | §3 report |

### Dimension findings

- Infra fit: **PASS** — the `.env.dev` / shared-database coupling that failed run 1 is now handled correctly. `global-setup.ts:81-82` runs once in `globalSetup`, before any spec, so it cannot race a `beforeEach` seed; the probes run before the e2e (step 8 before step 9) so nothing destroys its own fixture; `CI=1` pins `workers: 1` (`playwright.config.ts:23`) so no sibling spec contends. `TimesheetEntry` cascades (`schema.prisma:676`) so a delete-by-id is exact. Carried CONCERN: N3 (dev server after `pnpm check`).
- Test coverage: **CONCERN** — the `test.skip()` is gone, the seed pattern exists and is copyable, and both negative controls are real and can genuinely go red. Remaining gap is shape-level only (N2): the plan does not name `submittedAt`, the empty approval chain, or the hours values already taken. E2 closes it.
- Breaking changes: **PASS** — unchanged from run 1. No server logic, schema, API, or auth. `Banner kind="error"`'s `role="alert"` (`Banner.svelte:42`) is replaced by the toast's `aria-live="assertive"` (`Toaster.svelte:64`); the two hand-rolled strips carry no ARIA role at all. Accessibility net-neutral at worst. One newly-surfaced contract ripple: N1, the `form` prop cascade, which is a lint/type surface only and reaches no runtime behavior.
- Security surface: **PASS** — no auth, identity, billing, secrets, migration, or trust boundary. No high-risk class. No evidence pack required. The one privileged action the plan takes is DB seeding, and D1 bounds it: seed only, delete by recorded id, never touch a row the agent did not create.
- Section §1 (B2, `/settings/roles`): **PASS** — executed at `a4b3dcd`, diff matches the plan exactly, grep guard 0, `#283` surface intact. Not yet VERIFIED (probes owed, E4).
- Section §2 (B3 part 1, bulk voice): **PASS** — every line reference now exact, the `submitFeedback({ inner })` non-double-`update()` claim re-checked against `submit-feedback.svelte.ts:70,82,90`, the shared-guard rationale holds. `?/rejectMany`'s button is `type="button"` and opens the dialog, so probe P2's forced-400 must go through the `?/approveMany` form, as the plan says.
- Section §3 (B3 part 2, delete banners + modal strip): **CONCERN** — both run-1 FAILs are genuinely fixed and re-proved against source and the live DB. One material CONCERN (N1) plus two procedural ones (N2, N3), all resolved by E1/E2/E3. Highest-risk edit: the D2 lint cascade, because the plan text explicitly contradicts it — sequence it as E1 describes and let `pnpm lint` decide each step.
- Section §4 (B5, six labels): **PASS** — all twelve ellipsis line numbers re-verified exact (targets 559 / 122 / 213 / 219 / 367 / 374; exclusions 522 / 178 / 240 / 202 / 412 / 360), both locator greps return 0, the 5a/5b split closes run 1's C5.

### Net gate derivation

| Layer 1 dimensions | Status |
|---|---|
| Infra fit | PASS |
| Test coverage | CONCERN |
| Breaking changes | PASS |
| Security surface | PASS |

| Layer 2 sections | Status |
|---|---|
| §1 — B2 `/settings/roles` | PASS (executed, probes owed) |
| §2 — B3 part 1, bulk voice | PASS |
| §3 — B3 part 2, banners + modal strip | CONCERN |
| §4 — B5, six labels | PASS |

**Totals: 0 FAILs / 2 CONCERNs / 6 PASSes**

**→ Net Gate: CONDITIONAL**

Open gaps:
- N1 — the D2 lint cascade contradicts §3 step 3. Carried as binding instruction E1 rather than a plan rewrite; `pnpm lint` is the arbiter at each step, so the instruction cannot be followed on a false premise.
- N2 — e2e seed shape under-specified. Carried as E2.
- N3 — no dev-server liveness check before the probe blocks. Carried as E3.
- N4, N5 — cosmetic staleness in §3's criterion 3.3 and C3's `:511`. Recorded, not fixed (E8).
- `skipped` counter semantics: known-gap: documented as owner-unruled; backlog note is a §2 deliverable.

What this coverage does NOT prove:
- The grep guards prove a string is absent from a file. They do not prove the right block was cut, that the page still renders, or that anything reaches a screen. Only the probes do that.
- `pnpm lint` / `pnpm check` / `pnpm test` prove no dangling symbol and no broken type. They cannot see a DOM, so they prove nothing about duplication, colour, stacking, or visibility. `pnpm test` in particular runs `tests/unit/**` in a `node` environment with every Prisma call mocked (`vitest.config.ts`) — it touches no database and renders no component.
- The new unit tests prove the server hands back a non-empty, distinct string on all five bulk paths. They do NOT prove that string reaches the screen, that it reaches it once, or that the `skipped` counter's green-success-for-total-failure case is acceptable.
- The new e2e proves message COUNT on `/requests/timesheets` for one deterministic 400 path. It does not prove the success paths, does not prove colour (a green box containing a rejection would still pass a count assertion), does not cover `/timesheets`, and does not cover the review modal.
- `CI=1 pnpm test:e2e -- timesheet-approval timesheet-punch manager-org-wide-timesheets` proves those three specs still pass. It does not prove the `getByRole('main')` scoping is still CORRECT — only that it has not started failing.
- Probe R2 proves the shared modal is not silenced on `/timesheets` for ONE account, ONE action (`?/saveEntries`), and ONE timesheet. The other five modal actions and the `ConfirmButton` delete are proven by source reading only.
- Nothing here proves the pre-existing attendance e2e failure is unrelated. It is recorded as pre-existing on the owner's word and this branch's history, not measured.
- Nothing proves the plan's four commits will be free of an attribution trailer — that is a human check on `git log`.

Gate: CONDITIONAL — 0 FAILs; 2 CONCERNs accepted with the gaps on record and closed by binding execute-agent instructions E1-E8. §2, §3 and §4 may execute. §1 is already committed at `a4b3dcd` and only owes its probes.
Accepted by: session (run 2 of outer PVL, one recorded validate-fix cycle) — accepted concerns: N1 (D2 lint cascade contradicts §3 step 3 — closed by E1), N2 (e2e seed shape under-specified — closed by E2), N3 (no dev-server liveness check before probe blocks — closed by E3). Residuals N4, N5 recorded as cosmetic. `skipped`-counter semantics remain a documented known-gap pending an owner ruling.

## Autonomous Goal Block

```
SESSION GOAL
Execute the B2/B3/B5 feedback-contract plan at
process/general-plans/active/feedback-duplicate-messages-b2-b3-b5_10-09-26/feedback-duplicate-messages-b2-b3-b5_PLAN_10-09-26.md
on branch feat/uiux-phase-4. Section 1 is already committed as a4b3dcd. Deliver Sections 2, 3
and 4 as three further commits, plus Section 1's owed live probes.

CONTRACT SUMMARY
Validate Contract run 2: Gate CONDITIONAL. 0 FAILs, 2 CONCERNs, both closed by binding
execute-agent instructions E1-E8 in that contract. Read E1, E2, E3 and E5 before touching
Section 2. Run-1's BLOCKED contract is retained above as an audit record only.

AUTONOMY RULES
- Sections are independently committable. Order: 2, then 3 (hard dependency), 4 any time.
- Commit per section. Conventional messages, exactly as written in the plan. No attribution
  trailer of any kind. No push unless the owner asks.
- Run the full gate set after every section: pnpm format:check && pnpm lint && pnpm check &&
  pnpm test. pnpm lint is a real gate again (0 errors / 1 pre-existing warning).
- E2E only as CI=1 pnpm test:e2e -- <named specs>.
- Fixture seeding is authorised (D1): seed with the Prisma-upsert pattern at
  tests/e2e/timesheet-approval.spec.ts:42-70, record every id, delete every id. Never touch a
  row you did not create.
- A section is CODE DONE on green gates; VERIFIED only with recorded DOM evidence and both
  negative controls fired. Green tests never promote a section.

HARD STOPS
- Do not start or restart the dev server or the database. Ask the owner (E3).
- Do not push, do not open a GitHub issue, do not run db:seed:e2e.
- Section 3 step 9 deletes Elena's SUBMITTED timesheet cmtuzqmpk001561zqp6z2trxk. Warn the
  owner before running it.
- If probe P3 shows the toast is not above the open modal, revert Section 3 — do not patch it.
- If probe R2's precondition fails (no ?/saveEntries control rendered), record
  BLOCKED — control not rendered. Do NOT revert Section 3 on a false negative.
- Do not touch app.css or any button class list (issue #27), any +page.server.ts, or
  src/routes/(app)/timesheets/+page.svelte beyond the single {form} line at :259 under D2.
- No explanatory comments in source.

NEXT PHASE
EXECUTE.

EXECUTE START COMMAND
Start with Section 2 of
process/general-plans/active/feedback-duplicate-messages-b2-b3-b5_10-09-26/feedback-duplicate-messages-b2-b3-b5_PLAN_10-09-26.md,
following execute-agent instructions E1, E2, E3, E5, E6 and E7 in the run-2 Validate Contract.
```
