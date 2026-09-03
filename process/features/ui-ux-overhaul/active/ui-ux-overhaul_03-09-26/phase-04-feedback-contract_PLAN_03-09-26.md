---
name: plan:phase-04-feedback-contract
description: "Phase 04 of the UI/UX overhaul — one feedback contract: shared submitFeedback util, ConfirmButton rebuild, cookie flash, server error handling, Toaster/notification fixes, adoption on the audit's named silent sites"
date: 03-09-26
feature: ui-ux-overhaul
phase: "04"
---

# Phase 04 — Feedback Contract

**Date**: 03-09-26
**Status**: PLANNED (not started)
**Complexity**: COMPLEX (multi-section, 6 commits, ~32 src files, high-risk classes present)
**Feature**: ui-ux-overhaul
**Phase**: 04 of the UI/UX overhaul phase program

**Orchestrator note (do not re-open):** the validator's 8-gap supplement request is NOT getting a
separate supplement cycle. Those 8 gaps are already binding execute-agent instructions E1–E8 inside
the `## Validate Contract` section below, and EXECUTE will follow them from there. A resume-reader
should treat the supplement cycle as CLOSED.

## Overview

Veent HRIS has ~165 mutating actions across 53 server files. Only about 29% give a correctly
placed success signal. Three feedback dialects coexist — toast, persistent banner, and nothing —
and roughly 20 actions show literally nothing, concentrated in the highest-stakes paths: approve,
void, release, offboard, lock. On the server side, 13 sites forward a raw `e.message` (which
catches Prisma errors, so a banner can print an invocation dump), there is no `handleError` hook,
and the `Toaster` is the delivery channel for the whole notification system.

This phase installs ONE feedback contract and proves it on the audit's named P0/P1 sites. It is
context for phase 05, which wraps destructive actions in the `ConfirmButton` this phase rebuilds.

**TL;DR.** Today the app has three feedback dialects (toast / persistent banner / nothing) and
~20 mutating actions that say nothing at all. This phase builds ONE contract — a shared
`submitFeedback` util on top of the existing `createSubmitGuard`, a `ConfirmButton` that waits
for its result, a cookie-based flash for redirects, and the server-side fixes that stop raw
Prisma text reaching users — then adopts it on every P0/P1 site the audit names. The remaining
~100 mechanical call sites are listed here as a tracked follow-up, not dropped.

**Re-sequencing note.** This phase was moved to run BEFORE Phase 05 (destructive actions).
Phase 05 wraps destructive actions in `ConfirmButton`; that primitive is rebuilt here (S2).
Running 05 first would bake the silent-on-success defect into every new confirm site.

---

## Phase Ordering

| # | Phase | Relationship to this phase |
|---|---|---|
| 01 | P0 batch + Toaster `aria-live` | UPSTREAM — S5 here assumes `role="status"`/`aria-live` already landed on `Toaster.svelte` |
| 02 | Nav / IA restructure | Independent |
| 03 | Kit convergence (Badge / banner / Dialog) | UPSTREAM (soft) — shares files with S6; if 03 has not landed, S6 keeps the existing banner markup and does NOT introduce a new shared banner |
| **04** | **Feedback contract (this plan)** | — |
| 05 | Destructive-action pass | **DOWNSTREAM — consumes the S2 `ConfirmButton` rebuild** |
| 06 | Surface consolidation | Independent |
| 07 | Monster-page splits | Downstream (soft) — `employees/[id]` P0-7 work here should land before the tab split |

---

## Goal

Make every mutating action in the audit's named P0/P1 set tell the user what happened, in one
consistent way, with no raw server internals and no screen-reader dead zones.

### Non-goals (explicitly out of scope for phase 04)

- The T2 light-mode colour work and the shared Badge/banner primitive (phase 03).
- Adding confirm dialogs where none exist (phase 05 — this phase only fixes the primitive).
- The Zod `fieldErrors` standardisation across ~40 forms (audit §D P2) — tracked follow-up.
- The `scrollIntoView` long-page rollout beyond the 2 pages that already do it (§F) — tracked
  follow-up.
- Copy quality rewrites (§D P3 message-quality split, phase 08).

---

## Binding Decisions (from INNOVATE, locked)

| # | Decision | Why | Rejected |
|---|---|---|---|
| D4 | **Hybrid contract.** A shared `submitFeedback` util layered ON the existing `createSubmitGuard` seam. Actions standardise on `{ action, error?, saved? }`. The util centralises success/error toasts and handles all three enhance result types. Per-form scoped banner rendering stays **page-local**. | The guard is already wired into ~90 forms and is unit-pinned; wrapping it costs nothing and inherits the double-submit protection. Banners must stay page-local or we regress the best-in-class pages. | A single global "feedback provider" component — would have forced the three good pages (`performance/templates/[id]`, `requests`, `punch`) to give up per-field `fieldErrors` + `scrollIntoView`. |
| D8 | **Cookie-based flash.** `src/lib/server/flash.ts` sets a short-lived cookie on redirect; the root `(app)` layout load reads and clears it. | Cookie, not URL param or session store: survives a 302, works with **no JS**, needs no schema change, no new dep. | URL query param (leaks into share/bookmark, sticks on refresh); DB-backed flash (schema change for a 5-second message). |
| — | **ConfirmButton rebuild.** Waits for the result, shows a busy state, reports the outcome via the util. Public API (`action`, `title`, `message`, `confirmText`, `triggerLabel`, `triggerClass`, `disabled`, `submit`, `children`) stays source-compatible. | Every confirmed destructive action inherits the fix. Phase 05 depends on it. | Fixing each call site individually. |
| — | **Server-side fixes are IN scope.** Delete the 13 raw `e.message` fallback arms; add `handleError` to `hooks.server.ts`; fix the `audit-log` `{ message }` shape outlier. | INNOVATE risk ruling: the client contract is not honest if the server hands it a raw Prisma invocation dump. These are the *source* of the worst error copy. | Deferring server work to a later phase — leaves the leak live behind a prettier banner. |
| — | **Notification history = raise the dashboard Recent Activity cap.** NOT a `/notifications` page. | Diff size. Cap raise ≈ 1 constant + a read/unread affordance (~15 lines). A page = new route dir + load + svelte + nav entry + pagination + RBAC (~150+ lines) and belongs with the phase 02 nav work. | `/notifications` page — recorded as a tracked follow-up. |
| — | **Adoption scope.** This phase ships util + flash + server fixes + adoption on the audit's named §B / §C / §E sites (enumerated below with file:line). The ~100 remaining mechanical sites are a tracked follow-up checklist in this plan. | Named-site adoption is what proves the contract works; a 100-site sweep in the same phase makes the diff unreviewable. | Full sweep now (unreviewable); named sites only with no follow-up list (silently drops the rest). |

---

## Constraints

- **No new dependencies.** Cookie flash uses SvelteKit's `event.cookies`. Toaster upgrades use
  existing Svelte 5 runes.
- **No-JS fallback preserved.** This is exactly why flash is cookie-based: a form posted without
  `use:enhance` still redirects, still sets the cookie, still renders the message. Every
  `submitFeedback` form must degrade to a plain POST.
- **Svelte 5 runes only.** `$state` / `$derived` / `$effect` / `$props`. `{@const}` must be an
  immediate child of a block tag.
- **Minimal, modular diffs.** One commit per section (S1–S6).
- **Do not regress the in-repo standards** (audit §G): `punch/+page.svelte:276-300`,
  `performance/templates/[id]/+page.svelte:86`, `requests/+page.svelte`, `settings/schedules`,
  `NewTimesheetDialog.svelte:102-108`, `separations/[id]` finalize/undo. These pages KEEP their
  local banner/field/scroll behaviour; they may adopt the toast layer only.

---

## Touchpoints

### New files

| Path | Purpose |
|---|---|
| `src/lib/utils/submit-feedback.svelte.ts` | The `submitFeedback` util (S1) |
| `src/lib/server/flash.ts` | `setFlash` / `takeFlash` cookie helpers (S3) |
| `tests/unit/submit-feedback.test.ts` | Unit gate for S1 |
| `tests/unit/flash.test.ts` | Unit gate for S3 |
| `tests/unit/handle-error.test.ts` | Unit gate for S4 |

### Modified — primitives and infrastructure

| Path | Change |
|---|---|
| `src/lib/utils/submit-guard.svelte.ts` | Extension point only: expose the inner result to a wrapper without changing existing behaviour (S1) |
| `src/lib/components/ui/ConfirmButton.svelte` | Rebuild — await result, busy state, report via util (S2) |
| `src/lib/components/ui/Toaster.svelte` | Pause-on-hover, stacking cap, dismiss-all (S5) |
| `src/lib/stores/toast.svelte.ts` | Stacking cap + timer pause support (S5) |
| `src/hooks.server.ts` | Add `handleError` (S4) |
| `src/routes/(app)/+layout.server.ts` | Read + clear flash; pass to layout (S3) |
| `src/routes/(app)/+layout.svelte` | Render flash as toast; org-switcher `catch`; toasted-ids read (S3/S5) |
| `src/routes/(auth)/+layout.svelte` | Mount `<Toaster/>` (S5) |
| `src/routes/api/v1/notifications/read/+server.ts` | Accept an id list; call `markRead` not `markAllRead` (S5) |
| `src/routes/(app)/dashboard/+page.server.ts:120` | `listRecent(user.id, 8)` → `25` (S5) |
| `src/routes/(app)/dashboard/+page.svelte` | Recent-activity panel shows the larger list + read state (S5) |

### Modified — server error handling (S4, all 13 `e.message` arms, verified on disk)

| File | Lines |
|---|---|
| `src/routes/(app)/requests/+page.server.ts` | 152, 175, 198 |
| `src/routes/(app)/requests/[id]/+page.server.ts` | 143, 166, 193 |
| `src/routes/(app)/requests/approvals/+page.server.ts` | 139 |
| `src/routes/(app)/requests/timesheets/+page.server.ts` | 107 |
| `src/routes/(app)/separations/+page.server.ts` | 59 |
| `src/routes/(app)/separations/[id]/+page.server.ts` | 77, 96, 122 |
| `src/routes/(app)/leave/new/+page.server.ts` | 81 |
| `src/routes/(app)/reports/audit-log/+page.server.ts` | 129 — `{ message }` → `{ error }` shape outlier |

### Modified — named adoption sites (S6) — see the S6 checklist for the full enumeration.

---

## Public Contracts

### 1. `submitFeedback` (client)

```
submitFeedback(opts?: {
  success?: string | ((data) => string | null)   // toast text on success; null = no toast
  error?:   string | ((data) => string | null)   // override; default reads data.error
  onSuccess?: (data) => void | Promise<void>     // e.g. close a panel
  inner?: SubmitFunction                          // composes, like createSubmitGuard
}) => { busy: boolean; enhance: SubmitFunction }
```

Behaviour contract (must be pinned by unit tests):
- `result.type === 'success'` → run `onSuccess`, fire a `success` toast, `update()`.
- `result.type === 'failure'` → fire an `error` toast from `data.error`, `update()` so the
  page-local banner still renders. **The util never suppresses the page's own banner.**
- `result.type === 'redirect'` → `goto(location, { invalidateAll: true })`. The destination
  renders the flash. No toast fired here (the flash owns it).
- `result.type === 'error'` → fixed friendly string, `error` toast. Never renders raw text.
- `busy` is ALWAYS released — same invariant `submit-guard.test.ts` already pins. A latched
  guard wedges the form for the life of the page.

### 2. Action return shape (server)

Every action touched in S6 returns one of:
- success: `{ action: '<actionName>', saved: true, ...payload }`
- failure: `fail(status, { action: '<actionName>', error: '<friendly string>' })`

`action` is what lets a multi-action page (`employees/[id]`, 24 actions) route the message to the
right card — the page's own existing `form?.action` disambiguation pattern, generalised.

### 3. Flash (server → next page)

```
setFlash(cookies, { kind: 'success' | 'info' | 'error', message: string })  // before redirect()
takeFlash(cookies): Flash | null                                            // reads AND clears
```
Cookie: `flash`, `httpOnly`, `sameSite: 'lax'`, `path: '/'`, `maxAge: 30`. Value is JSON,
length-capped (reject > 512 bytes, drop silently). Cleared by `takeFlash` in the layout load.

### 4. `handleError` (server)

Returns `{ message: 'Something went wrong. (Ref: <id>)' }`. Logs `{ ref, message, stack, url,
userId }` server-side. Never returns `error.message` to the client.

### 5. `ConfirmButton` — API: additive only, then FROZEN

The existing nine props keep their names and meanings. New internal behaviour only. Every current
caller compiles without edits. **Phase 05 depends on this compatibility guarantee.**

Two props are ADDED here, before the freeze — both optional, both default to no behaviour change:

| Prop | Type | Default | Why it is added now |
|---|---|---|---|
| `successMessage` | `string \| null` | `null` (no toast) | Lets a call site name its own success toast. Without it the rebuilt button is still silent |
| `triggerTitle` | `string \| undefined` | `undefined` | **Phase 05 site 15 (attendance reset) needs a tooltip on the TRIGGER button.** `title` is already taken as the *dialog* title, so a separate prop is required. Renders as the `title` attribute on the trigger `<button>` only — never on the dialog |

`triggerTitle` is added in phase 04 specifically so phase 05 does not have to reopen this
primitive after the freeze. **Phase 05 consumes it.** After S2 lands, the API is frozen: no
further prop additions without a cross-phase agreement.

---

## Blast Radius

| Dimension | Value |
|---|---|
| New files | 5 (2 src, 3 tests) |
| Modified src files (S1–S5) | ~14 |
| Modified src files (S6 adoption) | ~18 route files |
| Total src files touched | **~32** |
| Packages | single app (`src/`) — no monorepo fan-out |
| Schema change | **none** |
| New dependencies | **none** |
| Risk class | **High-risk classes present:** money-adjacent (`payroll/periods ?/void`, `?/release`, `payroll/[id] ?/decide`, `payroll ?/void`), permission-adjacent (`settings/roles ?/setActive`), destructive (`employees ?/offboard` ×2). Hybrid tier is the minimum gate for these (see Verification Evidence). |

**Blast-radius claim (agent-team coordination).** Phase 04 claims: `src/lib/utils/submit-*`,
`src/lib/server/flash.ts`, `src/lib/components/ui/ConfirmButton.svelte`,
`src/lib/components/ui/Toaster.svelte`, `src/lib/stores/toast.svelte.ts`, `src/hooks.server.ts`,
`src/lib/server/services/notifications.ts` (read-only), and the `+page.server.ts` **action return
shapes** of the S6 route list.

**Potential blast-radius conflicts:**
- **Phase 03 (kit convergence)** also touches `Toaster.svelte` and page banner markup. Resolution:
  phase 03 owns *visual* banner/Badge markup; phase 04 owns *behaviour* (aria, timers, cap) and
  action return shapes. If 03 has not merged when S5/S6 start, phase 04 leaves banner markup
  untouched and only changes logic.
- **Phase 05 (destructive actions)** consumes `ConfirmButton`. Resolution: 05 must not start
  before S2 is merged. API compatibility is the contract that de-risks this.
- **Phase 07 (`employees/[id]` split)** overlaps S6's P0-7 work. Resolution: S6 lands first; 07
  rebases onto the `form?.action` disambiguation this phase installs.

---

## Implementation Checklist

Six sections, one commit each. Run that section's test gate before committing.

### S1 — `submitFeedback` util + guard extension

1. Read `src/lib/utils/submit-guard.svelte.ts` and `tests/unit/submit-guard.test.ts` in full.
   Do not change the guard's observable behaviour — 90 forms depend on it and the test file
   pins the `busy`-always-released invariant.
2. Add the minimal extension to `createSubmitGuard`: allow the wrapper to observe the enhance
   `result` before `update()` runs, without changing the existing composition semantics.
3. Create `src/lib/utils/submit-feedback.svelte.ts` exporting `submitFeedback` with the signature
   in Public Contracts §1.
4. Implement the four result branches. Copy the branch structure from
   `src/lib/components/timesheets/NewTimesheetDialog.svelte:102-108` — the only correct
   three-type handler in the repo (`redirect` / `failure` / `error`).
5. Toast wiring: `addToast(msg, { kind: 'success' })` on success,
   `addToast(msg, { kind: 'error' })` on failure/error. Import from `$lib/stores/toast.svelte`.
6. Guarantee `busy` releases in a `finally` on every path, including a throwing `onSuccess`.
7. Write `tests/unit/submit-feedback.test.ts`. Mirror the driver helper in
   `tests/unit/submit-guard.test.ts` (it fabricates the enhance `input` and settles the returned
   callback). Cases: success toast fired; failure toast text from `data.error`; redirect fires NO
   toast; `error` type yields the fixed friendly string, never raw text; `busy` released on all
   four types; `busy` released when `onSuccess` throws; `update()` still called on failure so the
   page banner renders.
8. **Mutation-check (mandatory, per `process/context/tests/all-tests.md`):** delete the `finally`
   that releases `busy`, confirm a test goes RED, restore. A green suite here proves nothing
   otherwise — this repo has shipped five false-greens.
9. Gate: `pnpm test -- submit-feedback submit-guard` green. Commit S1.

### S2 — ConfirmButton rebuild

10. Rebuild `src/lib/components/ui/ConfirmButton.svelte`:
    - Keep all nine props exactly as they are today (lines 8–24). No prop renames, no removals.
    - Replace `use:enhance={submit ?? noop}` with `use:enhance={fb.enhance}` where `fb =
      submitFeedback({ success: successMessage, inner: submit })`.
    - Add an optional `successMessage?: string` prop, defaulting to `null` (no toast) so existing
      call sites are behaviourally additive, not surprising.
    - Keep the dialog open (or show a busy state on the confirm control) until the result
      resolves. Today the dialog closes at `onconfirm` before the request finishes
      (`ConfirmButton.svelte:38-53` per the audit) — that is the whole defect.
    - Add an optional `triggerTitle?: string` prop, applied as the `title` attribute on the
      TRIGGER button only. Do NOT reuse the existing `title` prop — that is the dialog heading.
      **Phase 05 site 15 (attendance reset) consumes this**; adding it now keeps the API frozen
      once S2 is merged.
    - Disable the trigger while `fb.busy`.
11. Verify `ConfirmDialog.svelte` can express a busy/disabled confirm control. If it cannot,
    add the minimum prop — do NOT redesign the dialog (that is phase 03).
12. Grep every `ConfirmButton` call site and confirm each still compiles unchanged:
    `grep -rln "ConfirmButton" src/`.
13. Gate: `pnpm check` green; agent-probe — drive one confirmed delete in the browser and confirm
    (a) the trigger disables, (b) the dialog does not vanish before the row does, (c) a toast
    appears. Commit S2.

### S3 — Cookie flash

14. Create `src/lib/server/flash.ts` with `setFlash(cookies, flash)` and `takeFlash(cookies)` per
    Public Contracts §3. `takeFlash` MUST delete the cookie — a sticky flash re-fires on every
    navigation.
15. Read + clear in `src/routes/(app)/+layout.server.ts`: call `takeFlash(cookies)` and return
    `flash` alongside the existing `notifications` / `pendingApprovals` payload.
16. In `src/routes/(app)/+layout.svelte`, fire the flash as a toast in an `$effect` keyed on the
    flash value. Guard against re-firing on `invalidateAll()` (the org switcher calls it).
17. Adopt in the six named redirect-after-success flows:
    - `employees/new` → detail. Message must ALSO tell the operator the temp-password email was
      sent (audit §E: it is sent silently today).
    - `recruitment/[id]` convert → employee page (×1)
    - `recruitment/[id]` hire → employee page (×1)
    - `leave/new` → `/leave`
    - `timesheets ?/create` self-redirect (the self-redirect discards `form`, so its own banner
      system can never fire — flash is the only fix)
    - `apply` → board
    - `separations` create → detail
18. **No-JS check:** each of the seven redirects above must still show the message when the form
    is submitted without `use:enhance`. This is the reason flash is a cookie. **The gate's named
    subject is `separations` create -> detail, NOT `leave/new`** — phase 06 deletes `/leave/new`
    after this phase runs, so exit evidence must not anchor on a route scheduled for deletion.
    (Item 21's one-line `leave/new:81` `e.message` fix STAYS — that route is still live when
    phase 04 executes.) Coordinator asked for the `/requests` filing flow as the substitute;
    verified on disk that `requests ?/create` (`requests/+page.server.ts:108`) RETURNS rather than
    redirecting — there is no `redirect(` anywhere in that file — so it cannot exercise the flash
    path at all. `/requests` is therefore used as the no-JS **non-flash control** (a plain POST
    still renders its page-local banner), and `separations` create carries the flash gate.
19. Write `tests/unit/flash.test.ts`: set→take round-trip; `takeFlash` clears; a second `takeFlash`
    returns `null`; oversized payload rejected; malformed JSON returns `null` and does not throw.
20. Gate: `pnpm test -- flash` green. Commit S3.

### S4 — Server error handling

21. Delete all 13 `if (e instanceof Error) return fail(4xx, { error: e.message })` arms at the
    exact file:line list in Touchpoints. For each: if the thrown error is a typed
    `error(4xx, msg)` the existing `isHttpError` branch already handles it — so the fallback
    arm becomes either a **rethrow** (unexpected → error page → `handleError`) or a **fixed
    friendly string** scoped to that action. Choose rethrow unless the action has a known,
    user-actionable failure that deserves an inline message.
22. `src/routes/(app)/requests/+page.server.ts:152` also carries `values: raw` — preserve the
    form-repopulation behaviour when replacing the message.
23. Add `handleError` to `src/hooks.server.ts` (the file has only `handle` today). Generate a
    short ref id (`crypto.randomUUID().slice(0, 8)`), log `{ ref, message, stack, url, userId }`,
    return `{ message: 'Something went wrong. (Ref: <ref>)' }`.
24. Confirm `src/routes/+error.svelte` renders `$page.error.message` so the ref reaches the user.
    If it renders a hard-coded string, wire it — minimum diff.
25. Fix the shape outlier at `src/routes/(app)/reports/audit-log/+page.server.ts:129`:
    `{ message: ... }` → `{ action: 'reveal', error: ... }`. Update its template to read
    `form?.error`.
26. Write `tests/unit/handle-error.test.ts`: returns the friendly string; includes a ref; NEVER
    includes `error.message` or a stack; the same ref appears in the log call.
27. **Mutation-check:** make `handleError` return `error.message`; confirm a test goes RED.
28. Gate: `pnpm test` green (full suite — this section changes 8 route files other tests import);
    `pnpm check` green. Commit S4.

### S5 — Toaster upgrades + notifications

29. `src/lib/stores/toast.svelte.ts`: add a stacking cap (max 5 visible — drop the oldest when
    exceeded) and make the 6s timer pausable.
30. `src/lib/components/ui/Toaster.svelte`: pause-on-hover and on focus-within (today a
    link-toast can vanish mid-click — 6s hard timer). Add a dismiss-all control when > 2 toasts.
    Confirm the phase-01 `role="status"` / `aria-live="polite"` (and `assertive` for `kind ===
    'error'`) is present; if phase 01 has not landed, add it here.
31. Ensure the `error` kind is actually USED — `submitFeedback` (S1) is its first real consumer.
32. Mount `<Toaster/>` in `src/routes/(auth)/+layout.svelte` so login can toast. Today it is only
    in the `(app)` layout.
33. Notification read fix: change `src/routes/api/v1/notifications/read/+server.ts` to accept a
    JSON `{ ids: string[] }` body and call `markRead(userId, ids)` instead of `markAllRead`.
    `markRead` already exists (`notifications.ts:52-58`).
34. Update the `$effect` in `src/routes/(app)/+layout.svelte:78-89` to POST exactly the ids it
    just toasted. With > 10 unread today, the overflow is marked read without ever being shown.
35. Recoverable history (D-decision: cap raise, NOT a page): change
    `src/routes/(app)/dashboard/+page.server.ts:120` `listRecent(user.id, 8)` → `25`, and let the
    dashboard panel show read vs unread state. `listRecent` already selects `readAt`.
36. Fix the org-switcher swallowed error: `src/routes/(app)/+layout.svelte:48-60` has
    `try/finally` with no `catch`. Add a `catch` firing
    `addToast('Could not switch organization.', { kind: 'error' })`. The `!res.ok` branch already
    toasts — this covers the offline/throw path only.
37. Gate: `pnpm test` green; agent-probe — hover a toast and confirm it does not expire; trigger
    11 notifications and confirm none are silently consumed. Commit S5.

### S6 — Named-site adoption

Every item below is a named audit finding with file:line. Each gets: the `{ action, error?,
saved? }` return shape, a scoped page-local error slot, and a success signal (toast via
`submitFeedback`, or flash if it redirects).

**§B — P0 showstoppers**

| # | Site | Defect | Fix |
|---|---|---|---|
| 38 | `requests/approvals/+page.server.ts:105` `?/decideRequest` | returns `undefined` on success; `+page.svelte:192` `{#if form?.saved}` sits unused | return `{ action: 'decideRequest', saved: true }`; adopt util. Copy the sibling `rejectMany` at `:178`, which already does it right |
| 39 | `requests/timesheets/+page.server.ts:84` `?/review` | silent success | same shape + toast |
| 40 | `payroll/[id]/+page.server.ts:166` `?/decide` | **final payroll sign-off is silent** | same shape + toast. Money-adjacent → hybrid gate |
| 41 | `employees/[id]/+page.server.ts:642` `?/offboard` | silent | flash on redirect / toast |
| 42 | `employees/+page.server.ts:68` `?/offboard` | silent AND a dead action nothing posts to | verify reachability first; if genuinely dead, DELETE it and note that in the report — do not wire feedback into dead code |
| 43 | `employees/[id]/+page.svelte:497-507` | **P0-7: 19 of 24 actions have no error slot.** The only ungated `{#if form?.error}` sits inside Update Profile, itself gated on `canManage && status === 'ACTIVE'` — so for an offboarded employee every document/reveal/contact failure renders NOWHERE | generalise the page's own `form?.action` disambiguation (already used by 3 actions) to all 24. Each card renders `{#if form?.action === '<name>' && form?.error}`. **This is the single largest item in S6** — consider its own commit |
| 44 | `payroll/periods/+page.server.ts:112` `?/void`, `:102` `?/release` | irreversible money actions, no message after; `+page.svelte:48-54, 183-204` render only errors | success shape + toast. Money-adjacent → hybrid gate |

**§C — silent-failure surfaces**

| # | Site | Defect | Fix |
|---|---|---|---|
| 45 | `leave/+page.server.ts:96` `?/deleteMany` | `fail()` arrives; template (`+page.svelte:87`) renders only `form?.saved` | add a scoped error slot |
| 46 | `timesheets/+page.svelte:211, 251` | 14 server `fail()` sites reachable with the modal closed; error renders only inside `TimesheetModal:356` | list-level error slot outside the modal |
| 47 | `dashboard/+page.server.ts:180, 200` `?/decidePosting` | no error slot; with the award panel open the error appears under "Give award" (`+page.svelte:350, 382, 646, 667`) | `form?.action`-scoped slot |
| 48 | `recruitment/[id]/+page.server.ts:101, 110, 118, 180, 192` | only `setChannel` errors render (gated `:203-204`); a publish that fails a server rule looks like a no-op | `form?.action`-scoped slots for publish / close / convert |
| 49 | `employees/+page.svelte:86`, `payroll/+page.svelte:121`, `timesheets/+page.svelte:224` and `:232` | all 4 `{#await}` blocks have no `{:catch}` — a rejected streamed load replaces the skeleton with a blank list | add `{:catch}` rendering an error state with a retry affordance |
| 50 | `CalculatorPanel.svelte` enhance callback | ignores `result.type === 'error'` and keeps showing the stale result | adopt `submitFeedback`, or add the `error` branch and clear the stale `result` |
| 51 | `AggregatePanel.svelte` | same class of swallowed-error defect | same fix |
| 52 | `(app)/+layout.svelte:48-60` org switcher | `try/finally`, no `catch` | done in S5 item 36 — verify here |

**§E — silent high-stakes successes**

| # | Site | Fix |
|---|---|---|
| 53 | `payroll/+page.server.ts:66` `?/void` (run void; `+page.svelte:206-217`) | success shape + toast. Money-adjacent |
| 54 | `attendance/+page.server.ts:219-347` — `lock` / `unlock` / `lockTeam` / `unlockTeam` / `resetDay` | success shape + toast. Several auto-submit on `onchange`, which compounds the silence — the toast is the only possible cue |
| 55 | `settings/roles/+page.server.ts:73` `?/setActive` | deactivating a login has no message; the pill flip is the only cue. Permission-adjacent → hybrid gate |
| 56 | Re-verify the six flash flows from S3 render at their destinations | — |

57. After 38–56, run the full CI gate set and the manual checklist below. Commit S6 (split item
    43 into its own commit if the diff exceeds ~200 lines).

---

## Tracked Follow-Up (NOT dropped, NOT in this phase)

Recorded so the remaining ~100 mechanical call sites are visible. Route to
`process/features/ui-ux-overhaul/backlog/` at UPDATE-PROCESS.

| Item | Source | Size |
|---|---|---|
| ~100 remaining mutating actions adopt `submitFeedback` | §A ("~165 mutating actions, ~29% signal correctly") | large, mechanical |
| 14+ dead success flags — server returns them, no template renders them (benefits ×3, dashboard `postingDecided`, branches/inventory `{success:true}`, all 6 applicant-page actions, separations `toggleClearance`, recruitment `setChannel`) | §E P2 | medium |
| "Did it save?" invisible saves (branches/inventory rows, `departments ?/setHead`, posting-approvers, salary-grade assign, org assign, job-boards/leave-types/onboarding/offboarding rows, `payroll/[id] ?/override`) | §E P2 | medium |
| Create-panel behaviour split — schedules/periods/benefits/branches/inventory stay open with blanked fields (reads as a failed submit) vs org/holidays/payroll/dashboard which close | §E P2 | small |
| Banners persistent + unscoped; `payroll/config` shows a stale message; `timesheets ?/saveEntries` renders its banner BEHIND the open modal (`TimesheetModal.svelte:253`) | §E P2 | medium |
| Zod `fieldErrors` standardisation on ~40 forms (11 files already return them; 5 pages render per-field with `aria-invalid`) | §D P2 | large |
| Dead `details` payloads (`payroll/config:46`, `recruitment/[id]:78`) | §D P2 | trivial |
| `scrollIntoView` rollout to long pages — attendance (904 lines), statutory-rates (585), requests/approvals, settings/roles, employees/[id]. Only 2 files do it today | §F | medium |
| Shared single banners on multi-form CRUD pages (pay-codes, onboarding, offboarding, periods, branches, departments, holidays, inventory) — user cannot tell which row failed | §F | medium |
| Message-quality pass — "Invalid input", "Missing day id", "Insufficient permissions" (9+ sites, no next step) | §D P3 | phase 08 |
| A real `/notifications` page (rejected here on diff size) | §E P1 | medium |

---

## Verification Evidence

Tier vocabulary per `vc-test-coverage-plan`: **Fully-Automated** / **Hybrid** / **Agent-Probe**.
Known-Gap is a residual, never a proving strategy — every Known-Gap below has a backlog stub and
keeps its gate CONDITIONAL.

Runner facts loaded from `process/context/tests/all-tests.md`: `pnpm test` (vitest, 193 unit
files), `pnpm test:e2e` (Playwright, flaky per #287), `pnpm check`, `pnpm lint`,
`pnpm format:check`. CI runs `format:check` FIRST and skips the rest on failure.

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm test -- submit-feedback` — all 4 enhance result types handled; `busy` always released | Fully-Automated | AC-1 the shared util handles redirect/failure/error/success correctly |
| Mutation check: delete the `busy` `finally` → a test goes RED | Fully-Automated | AC-1 the util's tests are not vacuous |
| `pnpm test -- submit-guard` still green after the S1 extension | Fully-Automated | AC-1 the ~90 existing forms are not regressed |
| `pnpm test -- flash` — round-trip, clear-on-read, oversize reject, malformed-JSON safety | Fully-Automated | AC-3 flash survives a redirect and fires exactly once |
| `pnpm test -- handle-error` — friendly string + ref, never `error.message`, never a stack | Fully-Automated | AC-4 no server internals reach the client |
| Mutation check: `handleError` returns `error.message` → a test goes RED | Fully-Automated | AC-4 the leak test is not vacuous |
| `grep -rn "e.message" src/routes \| grep "fail("` returns **0 matches** | Fully-Automated | AC-4 all 13 raw-message arms are gone |
| `pnpm check` green (typecheck) | Fully-Automated | AC-2 `ConfirmButton`'s public API is source-compatible — every existing call site still compiles |
| `pnpm test` full suite green | Fully-Automated | AC-6 no regression across 193 unit files |
| `pnpm lint` + `pnpm format:check` green | Fully-Automated | exit gate |
| **Money-adjacent:** confirm `payroll/periods ?/void`, `?/release`, `payroll ?/void`, `payroll/[id] ?/decide` each show a success message live. Precondition: `./start.sh` DB + dev server running (user starts them) | **Hybrid** | AC-5 high-stakes money actions are no longer silent |
| **Permission-adjacent:** `settings/roles ?/setActive` shows a message live. Precondition: dev server + `POST /api/v1/_dev/login-as` | **Hybrid** | AC-5 deactivating a login is confirmed to the operator |
| **Destructive:** `employees/[id] ?/offboard` shows a message live | **Hybrid** | AC-5 the most consequential person-action reports its outcome |
| No-JS flash: submit `separations` create with JS disabled; the message renders at the detail page. Control: submit `/requests` filing with JS disabled and confirm its page-local banner renders (non-flash path). Subject moved off `leave/new` because phase 06 deletes that route | **Hybrid** | AC-3 the no-JS fallback is preserved |
| **P0-7 negative control:** open an OFFBOARDED employee's `employees/[id]`, force a document/reveal failure, confirm the error renders in ITS OWN card. The control: the Update Profile card is hidden for that employee, so pre-fix the error renders nowhere | **Hybrid** | AC-7 all 24 actions have their own error slot |
| Toast pause-on-hover: hover a link-toast past 6s, confirm it survives; positive control = an unhovered toast expires | **Agent-Probe** | AC-8 link-toasts cannot vanish mid-click |
| Screen-reader/DOM probe: `role="status"` + `aria-live` present on the toast region; `assertive` on `kind === 'error'`. Assert the ATTRIBUTE, not the visual | **Agent-Probe** | AC-8 toasts reach assistive tech |
| Notification overflow: create 11 unread, load a page, confirm all 11 eventually surface and none is marked read unshown | **Agent-Probe** | AC-9 no notification is silently consumed |
| `ConfirmButton` live: trigger disables, dialog holds until resolve, toast fires | **Agent-Probe** | AC-2 confirmed actions report their outcome |
| Streamed-load `{:catch}`: throw from one `data.employees` promise, confirm an error state (not a blank list) | **Agent-Probe** | AC-10 the 4 `{#await}` blocks no longer swallow rejections |
| Playwright `pnpm test:e2e` | **Known-Gap (CONDITIONAL)** | flaky per #287 — run it, but a red result must be diagnosed from the actual error before being treated as a phase failure. Backlog stub: "#287 e2e flakiness blocks feedback-contract regression proof" |
| Real-device / offline org-switch `catch` path | **Known-Gap (CONDITIONAL)** | cannot be provoked reliably locally. Backlog stub: "org-switcher offline path unproven" |

### Why this test set is not vacuous

Per `all-tests.md`, five false-greens have shipped here. Specific guards applied above:
- **Mutation checks** on both new invariants (`busy` release, `handleError` leak) — a plan-stated
  mutation check is a hypothesis; only running it is evidence.
- **Assert the attribute, not the look** — the aria probe reads the DOM attribute (false-green #4
  measured a box that was naturally the right width).
- **Named positive controls** — "the toast is absent" proves nothing; the hover test pairs with an
  unhovered control, and the P0-7 test pairs with the hidden-Update-Profile control.
- **Unit tests mock the DB**, so the money-adjacent gates are Hybrid (live), not Fully-Automated.
- **`vi.mock` is file-scoped** — keep `submit-feedback.test.ts` free of `vi.mock` on the toast
  store where the real `addToast` is under test; split into a second file if a mock is needed.
- **`pnpm prisma generate` before believing a red `pnpm check`** — a stale client has produced
  phantom type errors three times.

---

## Test Infra Improvement Notes

(none identified yet)

---

## Manual Silent-Site Checklist (exit gate)

Drive with Playwright MCP against the already-running dev server plus
`POST /api/v1/_dev/login-as`. The user starts `./start.sh` and vite — never launch them. Note that
`pnpm check` kills the dev server, so run it before or after, not during.

For EACH site below, assert something POSITIVE (a named toast/banner node with its text), not an
absence:

- [ ] Approve a request (`requests/approvals`) → success message
- [ ] Reject a request → success message
- [ ] Review a timesheet (`requests/timesheets`) → success message
- [ ] Sign off a payroll run (`payroll/[id] ?/decide`) → success message
- [ ] Void a payroll period → success message; Release a period → success message
- [ ] Void a payroll run (`payroll ?/void`) → success message
- [ ] Offboard from `employees/[id]` → message survives the redirect (flash)
- [ ] `settings/roles ?/setActive` deactivate → success message
- [ ] Attendance lock / unlock / lockTeam / unlockTeam / resetDay → success message each
- [ ] Failed `addLoan` on `employees/[id]` → error renders in the Loans card, NOT in Update Profile
- [ ] Same failure on an OFFBOARDED employee → error still renders (the P0-7 negative control)
- [ ] `/leave` bulk delete failure → error renders
- [ ] `/timesheets` list action failure with the modal CLOSED → error renders
- [ ] Dashboard `decidePosting` failure with the award panel OPEN → error renders under Postings
- [ ] `recruitment/[id]` publish that fails a server rule → error renders (not a no-op)
- [ ] Create an employee → destination shows "created" AND mentions the temp-password email
- [ ] Convert and hire from recruitment → destination message
- [ ] `leave/new` → `/leave` message (JS on only — this route is deleted in phase 06)
- [ ] `separations` create → detail message **with JS disabled** (the no-JS flash exit gate)
- [ ] `/requests` filing with JS disabled → page-local banner renders (non-flash control)
- [ ] `timesheets ?/create` self-redirect → message appears
- [ ] `apply` → board message
- [ ] Trigger an unexpected 500 → error page shows "Something went wrong. (Ref: …)" and the same
      ref appears in the server log
- [ ] Hover a link-toast past 6s → it survives; unhovered control → it expires
- [ ] 11 unread notifications → all surface, none silently consumed
- [ ] Login page (`(auth)`) can toast

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| The S1 guard extension regresses one of ~90 forms | Medium | `submit-guard.test.ts` is the tripwire; run it before and after. Keep the extension additive — do not restructure the guard |
| `ConfirmButton` rebuild breaks a call site | Medium | API frozen; `pnpm check` + explicit call-site grep (item 12). Phase 05 depends on this |
| Flash cookie leaks into an unexpected navigation or re-fires | Medium | `takeFlash` clears on read; `$effect` guarded against `invalidateAll()` re-fire; 30s `maxAge` |
| Deleting an `e.message` arm removes a message a user genuinely needed | Medium | Read each of the 13 in context. Where the throw is a typed `error(4xx)`, `isHttpError` already handles it — the arm was only ever catching the unexpected case |
| S6 item 43 (24 actions on `employees/[id]`) is a large diff in a 700+ line server file | High | Split into its own commit; phase 07 rebases onto it, not the reverse |
| Phase 03 lands `Toaster.svelte` changes concurrently | Medium | Blast-radius split recorded above: 03 owns markup, 04 owns behaviour |
| Toast becomes the ONLY signal and is missed on a long page | Medium | The util never suppresses the page-local banner — `update()` always runs on failure |
| `pnpm test:e2e` red for #287 reasons, read as a phase failure | High | Known-Gap CONDITIONAL. Diagnose from the actual error — "flaky" has hidden three distinct real causes here |

---

## Rollback

Each section is one commit with no schema change and no new dependency, so `git revert` of a
single commit is a clean rollback.

- **S1 / S3 / S4 tests** are new files — reverting removes them cleanly.
- **S2 is the one commit phase 05 depends on.** If S2 must be reverted after 05 has started, 05
  must pause — the API is compatible either way, but the silent-on-success defect returns.
- **S4** is the highest-value-to-revert-last: it removes an information leak. Prefer fixing
  forward over reverting S4.
- No data migration, so there is no state to unwind.

---

## Acceptance Criteria

| ID | Criterion | proven by | strategy |
|---|---|---|---|
| AC-1 | `submitFeedback` handles all four enhance result types and always releases `busy` | `tests/unit/submit-feedback.test.ts` + its mutation check | Fully-Automated |
| AC-2 | `ConfirmButton` waits for the result, shows busy, reports the outcome; every existing call site compiles unchanged | `pnpm check` + the live ConfirmButton probe | Hybrid |
| AC-3 | All 7 redirect-after-success flows render a message at the destination, including with JS disabled | `tests/unit/flash.test.ts` + the no-JS live check on `separations` create (NOT `leave/new` — phase 06 deletes it), with `/requests` filing as the non-flash control | Hybrid |
| AC-4 | Zero raw `e.message` reaches the client; unexpected errors return "Something went wrong. (Ref: …)" | `grep` returns 0 matches + `tests/unit/handle-error.test.ts` + mutation check | Fully-Automated |
| AC-5 | Every §B/§C/§E named high-stakes action gives a correctly-placed success or error signal | the manual silent-site checklist | Hybrid |
| AC-6 | No regression: full unit suite, typecheck, lint, format all green | the full CI gate set | Fully-Automated |
| AC-7 | On `employees/[id]`, each of the 24 actions renders its own error — including for an offboarded employee | the P0-7 negative-control probe | Hybrid |
| AC-8 | Toasts pause on hover, are capped, use the error variant, carry `aria-live`, and mount in `(auth)` | the toast DOM/attribute probe + hover control | Agent-Probe |
| AC-9 | No notification is marked read without being shown; recoverable history covers > 10 | the 11-notification probe | Agent-Probe |
| AC-10 | The 4 `{#await}` blocks render a `{:catch}` state; CalculatorPanel / AggregatePanel / org-switcher no longer swallow errors | the streamed-load rejection probe | Agent-Probe |

---

## Phase Completion Rules

- A section (S1–S6) is complete only when its own gate in the Implementation Checklist is green
  AND it is committed. Do not batch gates to the end of the phase.
- Both mutation checks (item 8 and item 27) must be RUN, not just planned. A mutation check
  written into a plan is a hypothesis; only running it is evidence.
- Status `CODE DONE` is the maximum until the manual silent-site checklist has been run.
- Status `VERIFIED` requires: all six sections committed, the full CI gate set green, every
  Hybrid gate executed live, every Agent-Probe recorded with a judgment, the manual checklist
  completed with positive assertions, and the validate-contract evidence recorded.
- Known-Gap rows keep their gate CONDITIONAL and each carries a backlog stub. A Known-Gap alone
  never makes a behaviour PASS-able.
- If a test failure is inside this phase's blast radius, fix it inline and re-run. If the fix
  would change a module outside the blast radius, write a follow-up plan and continue. If there
  is no fix path, record it as a known gap in the phase report and continue.
- Phase 05 may not start until S2 is merged.

---

## Exit Gate

All of the following, in CI order (CI runs `format:check` FIRST and skips the rest on failure —
a green `pnpm check` alone proves nothing about CI):

```
pnpm format:check
pnpm lint
pnpm check
pnpm test
```

Plus: `pnpm test:e2e` run and its result diagnosed (Known-Gap CONDITIONAL, #287), and the manual
silent-site checklist above completed with every box positively asserted.

Phase status may only be recorded as `CODE DONE` until the manual checklist is run. `VERIFIED`
requires the checklist plus the validate-contract evidence.

---

## Dependencies

- **Hard:** Phase 01 (Toaster `aria-live`) SHOULD have landed; S5 adds it if not.
- **Soft:** Phase 03 (kit convergence) shares files with S5/S6 — see the conflict resolution in
  Blast Radius.
- **Downstream:** Phase 05 must not start before S2 is merged.
- **Environment:** the DB container (`veent-db-5434` via `./start.sh`) and the dev server must be
  running for every Hybrid gate. **The user starts them — never launch them.** Per
  `process/context/planning/all-planning.md`, confirm the baseline gates are ALREADY green on the
  current tree before locking these gate definitions; a VALIDATE `BLOCKED` here is usually an
  environment-baseline miss, not a reasoning error.

---

## Validate Contract

Status: CONDITIONAL
Date: 03-09-26
date: 2026-09-03
generated-by: outer-pvl

**Contract amendment — 03-09-26, amended-by outer-pvl cycle 1 (post-validation maintenance).**
The AC-3 no-JS hybrid gate's subject moved from `leave/new` → `/leave` to **`separations` create
→ `/separations/[id]` detail**, with a `/requests` filing as the non-flash control. Reason: phase 06
deletes `/leave/new` after this phase runs, so a gate anchored there would go unrunnable; and
`requests ?/create` returns rather than redirecting, so it can never carry a flash. Raised as
CONCERN-9 by the phase-06 validator. Verified against source before amending — see the AC-3 row.
Two rows changed (the AC-3 test-gate row and the flash legacy line); no verdict, severity count,
execute-agent instruction, or OWNER-DECISION changed. Gate stays CONDITIONAL.

Parallel strategy: sequential
Rationale: 7/7 signals present (S1–S7), which scores HIGH, but the validate-agent runtime for this
pass exposes no Agent/Task spawn tool — the two-layer fan-out (4 Layer-1 dimensions + 6 Layer-2
sections S1–S6) was executed in-thread against source instead. Every claim below is grep/read
verified on `staging @ 093a413`, not inferred.

### Test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1 | `submitFeedback` handles success/failure/redirect/error and always releases `busy` | Fully-Automated | `pnpm test -- submit-feedback` exits 0 | B |
| AC-1 | The `busy` invariant test is not vacuous | Fully-Automated | Mutation: delete the `busy` `finally` → a named test goes RED; restore | B |
| AC-1 | The ~90 existing `createSubmitGuard` forms are not regressed | Fully-Automated | `pnpm test -- submit-guard` exits 0 (baseline green today) | A |
| AC-2 | `ConfirmButton`'s 9-prop public API is source-compatible | Fully-Automated | `pnpm check` exits 0 with all 11 call-site files unedited | B |
| AC-2 | Confirmed actions wait for the result and report it | Agent-Probe | Drive one confirmed delete: trigger disables, row disappears before the dialog is gone, a toast fires | B |
| AC-3 | Flash survives a redirect, fires once, clears on read | Fully-Automated | `pnpm test -- flash` — round-trip, clear-on-read, second read `null`, >512B rejected, malformed JSON returns `null` without throwing | B |
| AC-3 | The no-JS fallback is preserved | Hybrid | Submit `separations` create with JS disabled; the message renders at the `/separations/[id]` detail page (verified: `create:` at `separations/+page.server.ts:35` ends in `redirect(303, /separations/${id})` at `:62`, so it can carry a flash). Control: submit a `/requests` filing with JS disabled and confirm its page-local banner renders — `requests/+page.server.ts:155` RETURNS `{ message }` rather than redirecting, so it is the non-flash control. Precondition: `./start.sh` DB + the already-running vite dev server (pid 37184) | B |
| AC-3 | A hover-preload cannot silently eat a flash | Hybrid | After a flash redirect, hover a nav link, then confirm the message still renders. Precondition: dev server. See C8 | B |
| AC-4 | No server internals reach the client | Fully-Automated | `pnpm test -- handle-error` — friendly string + ref, never `error.message`, never a stack | B |
| AC-4 | The leak test is not vacuous | Fully-Automated | Mutation: `handleError` returns `error.message` → a named test goes RED; restore | B |
| AC-4 | All 13 raw-message form-action arms are gone | Fully-Automated | `grep -rn "e\.message" src/routes \| grep "fail("` returns 0 matches (returns exactly 13 today) | B |
| AC-5 | Money/permission/destructive actions are no longer silent | Hybrid | Drive `payroll/periods ?/void`, `?/release`, `payroll ?/void`, `payroll/[id] ?/decide`, `settings/roles ?/setActive`, `employees/[id] ?/offboard` live; assert the named toast node and its text. Precondition: dev server + `POST /api/v1/_dev/login-as` | B |
| AC-6 | No regression across the unit suite | Fully-Automated | `pnpm test` exits 0 — baseline today is 192 files / 2170 tests green | A |
| AC-6 | CI exit gate | Fully-Automated | `pnpm format:check` && `pnpm lint` && `pnpm check` && `pnpm test`, in that order. **RED today** — see C1 | C |
| AC-7 | Each of the 24 `employees/[id]` actions renders its own error | Hybrid | Force an `addLoan` failure on an OFFBOARDED employee; the error renders in the Loans card. Control: the Update Profile card is hidden for that employee, so pre-fix the error renders nowhere | B |
| AC-8 | Toasts pause on hover | Agent-Probe | Hover a link-toast past 6s → survives. Positive control: an unhovered toast expires | B |
| AC-8 | Toasts reach assistive tech | Agent-Probe | Assert `role="status"` + `aria-live` on the toast region and `assertive` for `kind === 'error'` — the ATTRIBUTE, not the look. Zero ARIA present today | B |
| AC-9 | No notification is marked read without being shown | Agent-Probe | Create 11 unread; confirm all 11 surface and none is consumed unshown. Defect verified: `listUnread` is `take: 10` and the endpoint calls `markAllRead` | B |
| AC-10 | The 4 `{#await}` blocks no longer swallow rejections | Agent-Probe | Reject one `data.employees` promise; an error state with a retry renders, not a blank list | B |
| — | Playwright regression proof | Agent-Probe | `pnpm test:e2e` run, and a red result diagnosed from the actual error before being called a phase failure (#287) | D |
| — | Offline org-switch `catch` path | Agent-Probe | Cannot be provoked reliably locally | D |

gap-resolution legend: A — proven now. B — gate added by this plan's checklist. C — deferred to a
named owner/phase. D — backlog test-building stub (named residual; keep-active).

Legacy line form (for existing validate-contract consumers):
- submitFeedback util: Fully-automated: `pnpm test -- submit-feedback submit-guard`
- flash: Fully-automated: `pnpm test -- flash`; hybrid: no-JS `separations` create → `/separations/[id]` detail, control `/requests` filing (non-flash), precondition dev server
- handleError: Fully-automated: `pnpm test -- handle-error` + `grep -rn "e\.message" src/routes | grep "fail("` = 0
- ConfirmButton: Fully-automated: `pnpm check`; agent-probe: live confirmed-delete
- money/permission/destructive sites: hybrid: live drive, precondition dev server + `_dev/login-as`
- Toaster / notifications: agent-probe: hover control + 11-notification overflow
- e2e regression: known-gap: documented (#287 flakiness)
- offline org-switch: known-gap: documented

Failing stub (AC-1, `tests/unit/submit-feedback.test.ts`):
test("should handle all 4 enhance result types and always release busy", () => { throw new Error("NOT IMPLEMENTED — TDD stub: submitFeedback handles success/failure/redirect/error and always releases busy") })

Failing stub (AC-3, `tests/unit/flash.test.ts`):
test("should round-trip a flash and clear it on read", () => { throw new Error("NOT IMPLEMENTED — TDD stub: flash survives a redirect, fires once, clears on read") })

Failing stub (AC-4, `tests/unit/handle-error.test.ts`):
test("should return a friendly string with a ref and never error.message or a stack", () => { throw new Error("NOT IMPLEMENTED — TDD stub: no server internals reach the client") })

### Dimension findings

- Infra fit: CONCERN — every named path resolves except `src/routes/(auth)/+layout.svelte`, which
  does not exist (C6); the `(auth)` group holds only `login/+page.svelte` and
  `login/+page.server.ts`. All 7 flash destinations, including `apply`, are inside `(app)`
  (`(app)/recruitment/[id]/apply`), so a layout-load read does cover them. SvelteKit 2.8 / Svelte 5
  confirmed; `cookies.set`/`delete` in a server load is supported on this version.
- Test coverage: CONCERN — baseline `pnpm test` is green (192 files / 2170 tests) and `pnpm lint` is
  green (1 pre-existing a11y warning), but `pnpm format:check` is RED on the current tree (C1) and
  `pnpm check` could not be baselined because a vite dev server is running (C13). Both mutation
  checks are correctly specified and both are mandatory.
- Breaking changes: CONCERN — `ConfirmButton`'s frozen-API claim VERIFIED across all 11 call-site
  files (only the 9 declared props appear; no site uses `successMessage`), but
  `/api/v1/notifications/read` gains a required body (C7) and the `saved` return shape conflicts
  with the sibling it is told to copy (C3).
- Security surface: CONCERN — the 13 `e.message` `fail()` arms are verified at the exact file:line
  list, 13/13, and `employees/new:162` is correctly EXCLUDED (its `errMsg` is match-only, never
  returned). But AC-4's wording is broader than its gate: 4 more `e.message` forwards survive at
  `src/routes/api/v1/leave/[id]/+server.ts:64,65` and
  `src/routes/api/v1/timesheets/[id]/+server.ts:60,61` (C4). `+error.svelte:38` already renders
  `$page.error.message`, so the ref will reach the user with no extra work.
- S1 (submitFeedback util): CONCERN — mechanically feasible, and better than planned: the guard
  ALREADY exposes the result. Highest-risk edit is the unnecessary one (C2).
- S2 (ConfirmButton rebuild): FAIL → REJECTED-ROUTED — item 11 proposes editing a phase-03-owned
  file (F1). A zero-touch alternative exists and is mandated below.
- S3 (cookie flash): CONCERN — the mechanism works on all 7 destinations, but the Flash contract
  carries no nonce (C5) and a hover-preload can consume a flash silently (C8).
- S4 (server error handling): CONCERN — the strongest-verified section; only AC-4's scope wording
  is wrong (C4). `hooks.server.ts` has `handle` only, as claimed.
- S5 (Toaster + notifications): CONCERN — `markRead(userId, ids)` EXISTS with the exact claimed
  signature; `listUnread` `take: 10` + `markAllRead` confirms the AC-9 overflow defect is real;
  `listRecent(user.id, 8)` is at dashboard `+page.server.ts:120` exactly. The Toaster has ZERO
  `role`/`aria-live` today (C9), and the endpoint change is breaking (C7).
- S6 (named-site adoption): CONCERN — every named site verified. `employees ?/offboard` is
  confirmed DEAD (C11, owner-decision); the 4 `{#await}` blocks with no `{:catch}` are exact; the
  org-switcher `try/finally` with no `catch` is exact; audit-log:129 is exact. The `saved` shape
  conflict (C3) and the `action` name shadow (C10) must be settled before this section starts.

### Findings

| # | Finding | Severity | Resolution |
|---|---|---|---|
| F1 | Item 11 tells the executor to add a prop to `ConfirmDialog.svelte`. That file is claimed by **phase 03** (`phase-03:107`, rewritten in its S7, and its AC-1 pins "No prop added, removed, renamed, or made required"); phase 05 also records "ConfirmButton / ConfirmDialog props are consumed, not changed". The umbrella's Pre-PVL Conflict Resolution covers `ConfirmButton` but never `ConfirmDialog` — this overlap is unresolved. | FAIL → **REJECTED-ROUTED** | Execute instruction E1. Phase 04 must NOT edit `ConfirmDialog.svelte`. |
| C1 | `pnpm format:check` is RED on `staging @ 093a413` — `docs/ui-ux-audit-2026-09-03.md`, committed at `2f89ba9`. CI runs `format:check` FIRST and skips the rest, so this phase's Exit Gate cannot go green regardless of its own code. The file is a program-wide research artifact, outside phase 04's blast radius. | CONCERN (high) | **Route to the orchestrator / umbrella**, not to phase 04. One line: `pnpm prettier --write docs/ui-ux-audit-2026-09-03.md`. Blocks EVERY phase's exit gate. |
| C2 | Item 2 ("add the minimal extension to `createSubmitGuard`") is **unnecessary**. The guard already documents and implements the seam: "When the wrapped handler returns its own callback it owns the response — including whether to call `update()`." `submitFeedback` can compose purely as `inner`, and the guard's `finally { busy = false }` then wraps it, so `busy` is released even if the wrapper throws. | CONCERN | Execute instruction E2 — make NO change to `submit-guard.svelte.ts`. This deletes the plan's own #1 Medium risk (90 forms) for free. |
| C3 | Contract §2 says `saved: true`, but the sibling the plan tells the executor to copy — `rejectMany`, `requests/approvals/+page.server.ts:~178` — returns `saved: "<message string>"`. Two shapes on one page and one template. | CONCERN | Execute instruction E3 — widen the contract to `saved: true \| string` (truthy; a string IS the message) and make templates handle both. |
| C4 | AC-4 claims "zero raw `e.message` reaches the client", but its gate grep is narrowed with `\| grep "fail("`. Four `e.message` forwards survive at `api/v1/leave/[id]/+server.ts:64,65` and `api/v1/timesheets/[id]/+server.ts:60,61` (via `apiError`). | CONCERN | Reword AC-4 to "zero raw `e.message` in form-action `fail()` arms" + backlog stub for the 4 API sites. |
| C5 | The Flash contract `{kind, message}` has no id, so the client cannot dedupe defensively. `(app)/+layout.server.ts` reads only `locals` — no `url`, no `params`, no `depends()` — so Kit 2 does NOT re-run it on ordinary client-side navigation and `data.flash` stays cached between re-runs. The JS path is safe because `submitFeedback`'s redirect branch forces `invalidateAll`, and no-JS is a full document load; but the guard item 16 asks for cannot be written robustly without an id. | CONCERN | Execute instruction E4 — add `id: string` (nonce) to `Flash` and dedupe with a `Set`, mirroring the proven `seenNotifications` pattern at `(app)/+layout.svelte:77`. |
| C6 | `src/routes/(auth)/+layout.svelte` is listed under "Modified" but **does not exist**. The `(auth)` group holds only `login/+page.svelte` and `login/+page.server.ts`. | CONCERN | Execute instruction E5 — treat as a NEW file; it MUST render `{@render children()}` or the login page goes blank. |
| C7 | Making `{ ids }` a required body on `/api/v1/notifications/read` is a breaking change on a versioned API path. Only one in-repo caller exists (`(app)/+layout.svelte:86`), so in-repo it is safe. | CONCERN | Execute instruction E6 — accept an OPTIONAL body: `ids` present → `markRead`; absent → `markAllRead`. Same diff size, backward compatible. |
| C8 | `src/app.html:23` sets `data-sveltekit-preload-data="hover"`. A hover-preload issues a data request that can run the `(app)` layout load, and `takeFlash` would delete the cookie with nothing rendered. The window is narrow (invalidation-gated) but the failure is silent. | CONCERN | Covered by the AC-3 preload Hybrid gate above. |
| C9 | The Toaster has **zero** `role` and `aria-live` today — grep returns nothing. AC-8 depends on a phase-01 deliverable that has not landed. Item 30 already handles this correctly. Also: `listUnread` does not `select` `kind`, so notification toasts cannot carry a kind. | CONCERN | Confirms item 30's "add it here" branch is the live one, not the fallback. |
| C10 | `payroll/[id]/+page.server.ts ?/decide` already binds a local `const { action, note } = parsed.data`. Adding `action: 'decide'` to the return shape shadows it. | CONCERN | Execute-agent note — do not shadow; name the local differently or qualify the return. |
| C11 | `employees/+page.server.ts ?/offboard` is confirmed DEAD — no `?/offboard` post exists anywhere in `employees/+page.svelte`. Item 42's "delete it" is correct, but deleting a form action removes a POST surface. | CONCERN | **OWNER-DECISION 1** below. |
| C12 | Item 17 says "the six named redirect-after-success flows" then lists seven bullets; item 18 says "each of the seven redirects". | CONCERN | Seven is correct. Execute-agent reads seven. |
| C13 | `pnpm check` could not be baselined — a vite dev server is running (pid 37184) and `pnpm check` kills it. | CONCERN | Named residual — run `pnpm check` when the dev server is down, before locking S2's gate. |

**Verified-correct claims (no action).** All 13 `e.message` `fail()` arms match the plan's file:line
list exactly, 13/13. `employees/new:162` is correctly excluded (match-only, never returned).
`markRead(userId, ids: string[])` exists with the exact claimed signature.
`+error.svelte:38` already renders `$page.error.message`, so item 24 needs no work.
`listUnread` is `take: 10` and the endpoint calls `markAllRead` — the AC-9 defect is real.
`listRecent(user.id, 8)` is at dashboard `+page.server.ts:120` exactly. The 4 `{#await}` blocks
with no `{:catch}` are exact (employees:86, payroll:121, timesheets:224 and :232). The org-switcher
`try/finally` with no `catch` is exact (`(app)/+layout.svelte:47-62`). `hooks.server.ts` has
`handle` only. `audit-log/+page.server.ts:129` is the `{ message }` outlier, at that exact line.
`ConfirmButton`'s frozen-API claim holds across all 11 call-site files.

### Execute-agent instructions

| # | Instruction | Trigger |
|---|---|---|
| E1 | **Do NOT edit `src/lib/components/ui/ConfirmDialog.svelte`** — it is phase-03-owned. Achieve the hold-until-resolve behaviour with zero changes to it: `open` is `$bindable`, so `ConfirmDialog.confirm()` setting `open = false` before `onconfirm()` can be undone by re-setting `open = true` inside `ConfirmButton`'s `onconfirm` alongside `formEl.requestSubmit()`, then clearing it in the enhance callback when the result resolves. If that proves impossible, STOP and route the concern to phase 03 — do not edit the file. | S2 entry (item 11) |
| E2 | Make NO change to `src/lib/utils/submit-guard.svelte.ts`. Build `submitFeedback` purely as an `inner: SubmitFunction` that returns its own response callback. Confirm `pnpm test -- submit-guard` is green with a zero-line diff on that file. | S1 entry (item 2) |
| E3 | Treat the success contract as `saved: true \| string`. Reconcile with `rejectMany` before writing any S6 return shape. | S6 entry (item 38) |
| E4 | Add `id: string` (a nonce) to the `Flash` type. Dedupe client-side with a `Set`, mirroring `seenNotifications` at `(app)/+layout.svelte:77`. | S3 entry (items 14, 16) |
| E5 | `src/routes/(auth)/+layout.svelte` is a CREATE, not an edit. It must render `{@render children()}`. Verify the login page still renders after adding it. | S5 entry (item 32) |
| E6 | Keep `/api/v1/notifications/read` backward compatible: `{ ids }` present → `markRead(userId, ids)`; body absent or empty → `markAllRead(userId)`. | S5 entry (item 33) |
| E7 | Run `pnpm check` only while the dev server is DOWN. Run `pnpm prisma generate` before believing a red `pnpm check`. | Every `pnpm check` gate |
| E8 | Both mutation checks (items 8 and 27) must be RUN and their RED output recorded in the phase report. A planned mutation check is a hypothesis, not evidence. | S1 and S4 gates |

### Backlog artifacts

| Artifact | Location | Tracks |
|---|---|---|
| `api-v1-raw-error-message-leak_NOTE_03-09-26.md` | `process/features/ui-ux-overhaul/backlog/` | The 4 `e.message` forwards at `api/v1/leave/[id]:64,65` and `api/v1/timesheets/[id]:60,61` (C4) |
| `e2e-flakiness-blocks-feedback-regression_NOTE_03-09-26.md` | `process/features/ui-ux-overhaul/backlog/` | #287 e2e flakiness — the Known-Gap residual |
| `org-switcher-offline-path-unproven_NOTE_03-09-26.md` | `process/features/ui-ux-overhaul/backlog/` | The offline org-switch `catch` path — the Known-Gap residual |

### Open gaps

- `pnpm format:check` RED on `staging @ 093a413` (`docs/ui-ux-audit-2026-09-03.md`): **routed to the
  orchestrator / umbrella** — blocks the exit gate of every phase, not just 04. NEW PLAN NOT
  REQUIRED; it is a one-line fix, but it is outside phase 04's blast radius.
- `ConfirmDialog.svelte` cross-phase ownership: REJECTED-ROUTED to phase 03. The umbrella's Pre-PVL
  Conflict Resolution should record it alongside the `ConfirmButton` clause.
- The 4 `api/v1` `e.message` forwards: known-gap: documented as NEW PLAN REQUIRED — see the backlog
  note above.
- `pnpm test:e2e` (#287): known-gap: documented.
- Offline org-switch `catch`: known-gap: documented.
- `pnpm check` baseline: unverified (dev server running). Residual, not a blocker.
- `phase-blast-radius-registry.md` still does not exist in the task folder. This plan's inline
  blast-radius claim and conflict list must be copied into it when it is created — including the
  `ConfirmDialog` overlap this contract found.

### What this coverage does NOT prove

- `pnpm test -- submit-feedback` runs against a mocked toast store boundary and a fabricated enhance
  input. It does NOT prove a real form in a real browser releases `busy`, nor that the toast is
  visible or reaches a screen reader.
- `pnpm test -- flash` proves the cookie helper's round-trip in isolation. It does NOT prove
  SvelteKit actually writes the `Set-Cookie` through a 303, nor that the `(app)` layout load re-runs
  on any given navigation, nor that a hover-preload has not already consumed the cookie.
- `pnpm test -- handle-error` proves the hook's return shape. It does NOT prove `+error.svelte`
  renders the ref, nor that the same ref actually appears in a real server log.
- `grep ... | grep "fail("` returning 0 proves the 13 form-action arms are gone. It does NOT cover
  `apiError`, `error()`, `json()`, template-side rendering of a caught message, or the 4 known
  `api/v1` sites.
- `pnpm check` proves every `ConfirmButton` call site still COMPILES. It does NOT prove any of them
  still BEHAVES the same — the dialog-hold change is invisible to the type checker.
- `pnpm test` green (192 files / 2170 tests) proves no unit regression. Unit tests mock the DB, so
  it proves nothing about the money-adjacent actions; that is why those gates are Hybrid.
- The Agent-Probe rows are single judgments on a single machine. They do not prove behaviour across
  browsers, at other viewport sizes, or with a real assistive-tech stack.
- Nothing here proves the ~100 tracked follow-up call sites behave — they are explicitly out of
  scope for this phase.

Gate: CONDITIONAL (1 FAIL converted to a binding execute-agent routing instruction; 13 CONCERNs, 8
fixed as execute-agent instructions, 3 as backlog stubs, 2 routed outside this phase)
Accepted by: session (autonomous, /goal execution) — accepted concerns: F1 ConfirmDialog
cross-phase ownership (REJECTED-ROUTED, zero-touch alternative mandated in E1); C1 format:check
baseline RED (routed to orchestrator); C2 unnecessary guard edit; C3 `saved` shape conflict; C4
AC-4 scope overclaim; C5 flash nonce; C6 `(auth)` layout is a create; C7 notifications API
back-compat; C8 preload flash consumption; C9 Toaster ARIA absent; C10 `action` name shadow; C11
dead offboard action (OWNER-DECISION); C12 six-vs-seven flows; C13 `pnpm check` baseline unverified.

### OWNER-DECISION gates

| # | Decision | Recommended default | Effect if unanswered |
|---|---|---|---|
| OD-1 | `employees/+page.server.ts ?/offboard` is confirmed dead (nothing posts to it). Delete it, or wire a list-row offboard button to it? | **Delete it.** Item 42 already says so, and wiring a new destructive list-row action is phase 05's scope, not phase 04's. | Executor follows item 42 and deletes it, noting the removal in the phase report. |
| OD-2 | `docs/ui-ux-audit-2026-09-03.md` fails `format:check` and blocks every phase's CI exit gate. Fix it now under the umbrella, or waive `format:check` for the program? | **Fix it now** — `pnpm prettier --write docs/ui-ux-audit-2026-09-03.md`, one commit at the umbrella level, before phase 01 executes. | Phase 04's Exit Gate stays unreachable and every later phase inherits the same red gate. |
| OD-3 | The `ConfirmDialog` overlap is not in the umbrella's Pre-PVL Conflict Resolution. Add it as a resolved conflict (phase 03 owns the file, phase 04 works around it), or let phase 04 own the file instead? | **Phase 03 owns it**; phase 04 uses the zero-touch `$bindable` workaround in E1. Phase 03's S7 rewrite is the larger, more fragile change and should not be edited underneath. | E1 binds the executor to the workaround anyway; the umbrella's registry stays incomplete. |

---

## Resume and Execution Handoff

0. **Primary execute anchor:** this file is the single execute anchor for phase 04. There are no
   supporting phase files for this phase — the umbrella plan and sibling phase plans (01, 02, 03,
   05, 06, 07) are context only and must NOT be executed from this handoff.
1. **Selected plan file:**
   `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-04-feedback-contract_PLAN_03-09-26.md`
2. **Last completed phase or step:** none — plan written, nothing executed.
3. **Validate-contract status:** pending (PVL has not run).
4. **Supporting context files loaded:** `process/context/all-context.md`,
   `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md`,
   `process/context/uxui/all-uxui.md`, `docs/ui-ux-audit-2026-09-03.md` (full addendum §A–§H).
   Source read: `src/lib/utils/submit-guard.svelte.ts`,
   `src/lib/components/ui/ConfirmButton.svelte`, `src/lib/components/ui/Toaster.svelte`,
   `src/lib/stores/toast.svelte.ts`, `src/hooks.server.ts`,
   `src/lib/server/services/notifications.ts`, `src/routes/(app)/+layout.svelte`,
   `src/routes/(app)/+layout.server.ts`,
   `src/lib/components/timesheets/NewTimesheetDialog.svelte:90-115`,
   `src/routes/api/v1/notifications/read/+server.ts`, `tests/unit/submit-guard.test.ts`.
5. **Next step for a fresh agent:** run PVL (vc-validate-agent) against this plan to write the
   Validate Contract, then EXECUTE section S1 only. Do not start S2 before S1's gate is green;
   do not let phase 05 start before S2 is merged. Commit per section.

### Notes for the umbrella plan

The program task folder `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/` did not
yet contain an umbrella plan or a `phase-blast-radius-registry.md` when this plan was written. The
blast-radius claim and the conflict list are recorded inline under **Blast Radius** above; they
must be copied into the registry when it is created.
