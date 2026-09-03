---
name: note:feedback-contract-remaining-adoption
description: "Phase 04's Tracked Follow-Up — the ~100 remaining mechanical adoption sites and the audit's P2/P3 feedback items, carried forward not dropped"
date: 03-09-26
feature: ui-ux-overhaul
---

# Feedback contract — the remaining adoption work

Phase 04 built ONE feedback contract and adopted it on every site the audit named as P0/P1. The
rest of the app is mechanical work that was deliberately kept out of that phase's diff so the
change stayed reviewable. This is the carry-forward list, copied from the phase 04 plan's
**Tracked Follow-Up** table so it survives the plan being archived.

## What the contract now is (so an adopter needs no design decision)

- **Server:** an action returns `{ action: '<actionName>', saved: true | string }` on success, or
  `fail(status, { action: '<actionName>', error: '<friendly string>' })` on failure. A `saved`
  STRING is the message; `saved: true` means "succeeded, say nothing extra".
- **Client:** `use:enhance={fb.enhance}` where `const fb = submitFeedback()`. With no options it
  toasts the server's own `saved` string on success and `data.error` on failure, and it still calls
  `update()` so the page's own banner keeps rendering. `ConfirmButton` does the same internally.
- **Redirect-after-success:** `setFlash(cookies, …)` before `redirect()`; the `(app)` layout renders
  it. This is the only path that survives a 302 and works with no JS.
- **Scoped slots:** on a multi-action page, each card renders only its own action's error —
  `{#if form?.action === '<name>' && form?.error}`. `employees/[id]` has the reference
  implementation (one `actionError` snippet + a source-sweep test that pins it).

Adopting a site is therefore: name the action, return a `saved` string, swap
`createSubmitGuard()` → `submitFeedback()`.

## The list

| Item | Source | Size |
|---|---|---|
| ~100 remaining mutating actions adopt `submitFeedback` | audit §A ("~165 mutating actions, ~29% signal correctly") | large, mechanical |
| 14+ dead success flags — the server returns them, no template renders them (benefits ×3, branches/inventory `{success:true}`, all 6 applicant-page actions, separations `toggleClearance`) | §E P2 | medium |
| "Did it save?" invisible saves — branches/inventory rows, `departments ?/setHead`, posting-approvers, salary-grade assign, org assign, job-boards/leave-types/onboarding/offboarding rows, `payroll/[id] ?/override`, and the ~15 `employees/[id]` actions that return `{ action, success: true }` with no message | §E P2 | medium |
| Create-panel behaviour split — schedules/periods/benefits/branches/inventory stay open with blanked fields (reads as a failed submit) vs org/holidays/payroll/dashboard which close | §E P2 | small |
| Banners persistent + unscoped; `payroll/config` shows a stale message; `timesheets ?/saveEntries` renders its banner BEHIND the open modal (`TimesheetModal.svelte:253`) | §E P2 | medium |
| Zod `fieldErrors` standardisation on ~40 forms (11 files already return them; 5 pages render per-field with `aria-invalid`) | §D P2 | large |
| Dead `details` payload at `payroll/config:46` (the `recruitment/[id]` one was removed in phase 04 S6) | §D P2 | trivial |
| `scrollIntoView` rollout to long pages — attendance (904 lines), statutory-rates (585), requests/approvals, settings/roles, employees/[id]. Only 2 files do it today | §F | medium |
| Shared single banners on multi-form CRUD pages (pay-codes, onboarding, offboarding, periods, branches, departments, holidays, inventory) — the user cannot tell which row failed | §F | medium |
| Message-quality pass — "Invalid input", "Missing day id", "Insufficient permissions" (9+ sites, no next step) | §D P3 | phase 08 |
| A real `/notifications` page — rejected in phase 04 on diff size; the dashboard Recent Activity cap was raised 8 → 25 instead | §E P1 | medium |

## Two more, added by phase 04 itself

| Item | Why | Size |
|---|---|---|
| `employees/[id]` success signals. Phase 04 gave all 21 actions a scoped ERROR slot; ~15 of them still return `{ action, success: true }`, which carries no message, so a successful loan add or document upload is still silent. Give each a `saved` string — the client side already handles it | §E P2, discovered while building P0-7 | small, mechanical |
| The 4 `e.message` forwards at `api/v1/leave/[id]:64,65` and `api/v1/timesheets/[id]:60,61` | tracked separately in `api-v1-raw-error-message-leak_NOTE_03-09-26.md` | small |
