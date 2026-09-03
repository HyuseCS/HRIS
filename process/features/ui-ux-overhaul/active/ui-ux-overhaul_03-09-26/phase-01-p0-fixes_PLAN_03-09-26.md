---
name: plan:ui-ux-overhaul-phase-01-p0-fixes
description: "Phase 01 of the UI/UX overhaul — the 8 P0 showstoppers from the 2026-09-03 audit, smallest correct diffs only"
date: 03-09-26
feature: ui-ux-overhaul
phase: "01"
---

# UI/UX Overhaul — Phase 01: P0 Showstoppers

**Date**: 03-09-26
**Status**: DRAFT — awaiting VALIDATE
**Complexity**: SIMPLE-plus (8 independent sections, one surface each, no schema change, no new deps)
**Feature:** `ui-ux-overhaul`
**Source of truth:** `docs/ui-ux-audit-2026-09-03.md` §2 (P0-1..P0-3) and Addendum §B (P0-4..P0-8)
**Context loaded:** `process/context/all-context.md`, `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md`, `process/context/uxui/all-uxui.md`

---

## TL;DR

Eight independent P0 fixes. One wrong redirect, one orphaned compliance page, one crash key, one
missing ARIA pair, and four silent high-stakes actions. Every section is a small diff on one or two
files with its own verification step. Nothing here refactors, adds a component, or adds a
dependency. Section 8 is deliberately partial harm-reduction — the real fix belongs to phase 07.

---

## Overview

The audit scored the system 19/40. Phase 01 does not improve that score; it removes the eight
findings that are actively wrong (a redirect to the wrong page, a crash, an unreachable
compliance page) or actively dangerous (irreversible money and person actions that give the
operator no signal at all).

### Goals

1. No approver lands on the wrong page from a legacy `/approvals` link.
2. The Audit Log page is reachable from the UI by a user who is allowed to see it.
3. Two "Add row" clicks in the template builder cannot kill the preview.
4. Screen-reader users receive toast notifications.
5. Approve / reject, timesheet review, offboard, period void and period release each say
   something on success.
6. A failed action on `employees/[id]` does not paint its error into an unrelated form.

### Non-goals (explicitly deferred)

| Deferred item | Owner |
|---|---|
| Confirm dialogs for offboard, attendance lock, `settings/roles ?/setActive` (T3) | phase 03 |
| `ConfirmButton` waiting for the result / busy state / completion signal | phase 04 |
| Toaster pause-on-hover, stacking cap, de-dup, `(auth)` mounting | phase 04 |
| Full `employees/[id]` per-action error slots + page restructure (P0-7 proper) | phase 07 |
| Sidebar IA rework / collapse (T1) | phase 02 |
| The repo-wide feedback contract (Addendum §H) | phase 04 |
| `payroll/[id] ?/decide` success signal (named in P0-5 but a different surface family) | phase 04 |

---

## Touchpoints

| # | File | Lines (at plan time) | Change |
|---|---|---|---|
| 1 | `src/routes/(app)/approvals/+page.server.ts` | 4–7 | redirect target + comment |
| 2 | `src/routes/(app)/reports/+page.svelte` | 8–84 | one card object in `allReportCards` |
| 2 | `src/routes/(app)/+layout.svelte` | ~244, ~585–614 | Reports nav child |
| 3 | `src/lib/components/performance/ReviewFormRender.svelte` | 169 | each-key |
| 4 | `src/lib/components/ui/Toaster.svelte` | 14–17, 18–22 | container + per-toast ARIA |
| 5 | `src/routes/(app)/requests/approvals/+page.server.ts` | 104–141 | `decideRequest` return |
| 5 | `src/routes/(app)/requests/timesheets/+page.server.ts` | 82–110 | `review` return |
| 6 | `src/routes/(app)/employees/[id]/+page.server.ts` | 642–661 | `offboard` return |
| 6 | `src/routes/(app)/employees/[id]/+page.svelte` | ~1782 | success render |
| 6 | `src/routes/(app)/employees/+page.server.ts` | 1–11, 65–92 | delete dead action |
| 7 | `src/routes/(app)/payroll/periods/+page.server.ts` | 102–120 | `release` / `void` returns |
| 7 | `src/routes/(app)/payroll/periods/+page.svelte` | 1–8, 48–54, 181–205 | ConfirmButton + saved block |
| 8 | `src/routes/(app)/employees/[id]/+page.server.ts` | 18 actions | `action` key on returns |
| 8 | `src/routes/(app)/employees/[id]/+page.svelte` | 497–507 | gate shared block |

Read-only during this phase: `src/routes/(app)/reports/audit-log/+page.server.ts` (to confirm the
capability), `src/lib/components/ui/ConfirmButton.svelte`, `src/lib/server/form-fail.ts`.

---

## Public Contracts

These are the only outward-visible behaviour changes. Everything else is additive.

| Contract | Before | After | Who can observe it |
|---|---|---|---|
| `GET /approvals` | 308 → `/requests` | 308 → `/requests/approvals` | any bookmark/link |
| `?/decideRequest` return | `undefined` on success | `{ saved: string }` | `requests/approvals/+page.svelte` |
| `?/review` (requests/timesheets) return | `undefined` on success | `{ saved: string }` | that page only |
| `?/offboard` (employees/[id]) return | `undefined` on success | `{ action: 'offboard', saved: string }` | that page only |
| `?/offboard` (employees list) | exists, unreachable | **deleted** — POST now 404s | nothing posts to it (verified) |
| `?/release`, `?/void` (payroll/periods) | `undefined` on success | `{ saved: string }` | that page only |
| 18 `employees/[id]` actions | `{ success }` / `fail({ error })` | same **plus** `action: '<name>'` | that page only |

No schema change. No API route change. No capability change. No change to what any action
*does* — only what it returns and what the page renders.

---

## Blast Radius

- **Files changed:** 12 (7 `+page.server.ts`, 4 `+page.svelte`, 2 components — `employees/[id]`
  appears in two sections).
- **Packages:** one — the SvelteKit app. No `prisma/`, no `scripts/`, no `src/lib/server/services/`.
- **Risk class:** three high-risk surfaces are touched *at the return-value layer only*:
  payroll (money), offboard (person state), approvals (maker-checker). No service, guard, or
  capability call is edited. `assertCanTouchEmployee` in the deleted list-page action is removed
  **with** the action it guards, not from a live path.
- **Highest-risk single edit:** section 8. Adding `action:` to a `fail()` and gating the shared
  block means any action whose `action` key is mistyped goes from "error in the wrong form" to
  "error nowhere". Section 8 has a mandatory per-action enumeration check because of this.
- **Second-highest:** section 6's success render placement. On success the employee flips to
  `OFFBOARDED`, so the whole `{#if canManage && employmentStatus === 'ACTIVE'}` block that holds
  the Offboard form **unmounts** — a message placed inside it would never render. It must go
  outside that block.

---

## Implementation Checklist

Commit per section (repo convention: one issue, one PR, many commits).

### Section 1 — `/approvals` redirect target (P0-1)

**File:** `src/routes/(app)/approvals/+page.server.ts`

1. Change line 6 `redirect(308, '/requests')` → `redirect(308, '/requests/approvals')`.
2. Update the comment on line 4 — it currently says "merged into the unified Requests/Approvals
   page at /requests", which is the sentence that caused the bug. State the approval inbox is at
   `/requests/approvals` and the user's own filings are at `/requests`.

**Blast radius:** 1 file, 2 lines. No caller in-repo (`grep -rn "'/approvals'" src` returns the
route itself only) — the risk is entirely external bookmarks, which is the point of the fix.

**Verification:** new unit test `tests/unit/approvals-legacy-redirect.test.ts` — import the
`load` from the route module, call it, assert the thrown object is a 308 redirect whose
`location` is `/requests/approvals`. Follow the `page.server` import style already used in
`tests/unit/complaints-scoping.test.ts`.

---

### Section 2 — Audit Log reachable (P0-2)

**Capability (verified, do not re-derive):** `reports/audit-log/+page.server.ts:11` guards with
`requireAnyCapability(user.roles, 'MANAGE_HR')`. Reuse the *same* capability on both surfaces:

- reports index already computes `canViewHrReports = canAny(roles, 'MANAGE_HR')` and returns it
  (`reports/+page.server.ts:14, 36`) — no server change needed.
- sidebar already computes `isAdmin = canAny(roles, 'MANAGE_HR')` (`+layout.svelte:94`) — no new
  derived value needed.

**File A:** `src/routes/(app)/reports/+page.svelte`

3. Append one object to `allReportCards` (after the Recruitment entry, line 75–80):
   `{ href: '/reports/audit-log', label: 'Audit Log', desc: 'Who changed what, when', payroll: false }`.
   `payroll: false` is what makes `reportCards` (line 82–84) hide it from payroll-only viewers —
   which is exactly the `MANAGE_HR` gate. No other edit to this file.

**File B:** `src/routes/(app)/+layout.svelte`

4. Add a derived list next to `settingsChildren`/`requestsChildren` (after line ~292):
   `const reportsChildren = $derived([{ href: '/reports/audit-log', label: 'Audit Log', show: isAdmin }].filter((i) => i.show))`
5. In the nav `{#each navItems}` loop, add a branch after the existing
   `{#if item.href === '/requests' && canApprove}` arm:
   `{:else if item.href === '/reports' && reportsChildren.length > 0}` — render the **same**
   `<a>` markup the generic `{:else}` arm already uses for the Reports link, then, directly under
   it, the same indented child list markup used by the requests group
   (`<div class="mt-0.5 space-y-0.5 border-l border-border pl-3 ml-4">` + one `<a>` per child).
   **No toggle, no new state, no new icon, no badge** — the child list is always shown when the
   user holds `MANAGE_HR`. A collapsible Reports group is phase 02 IA work, not this.
6. Keep the existing `active` calculation untouched. `/reports` uses `startsWith`, so both rows
   highlight on `/reports/audit-log`. Accept this — changing the `active` rule would break the
   Reports highlight on all 12 other report subpages, which is a bigger diff than the fix.

**Blast radius:** 2 files. `+layout.svelte` is the app shell — a compile error here 500s every
page, so the compile check for this section is non-negotiable.

**Verification:**
- `pnpm check` must pass (svelte-check compiles `+layout.svelte`).
- Agent probe (live browser, `POST /api/v1/_dev/login-as`): as an HR_ADMIN, load `/reports`,
  assert an anchor with `href="/reports/audit-log"` is present in the Detailed Reports grid, click
  it, assert the audit-log `<h1>` renders (assert something **positive**, per
  `all-tests.md`). Then load any page and assert the sidebar anchor with the same href exists.
- **Negative control (mandatory):** repeat as a FINANCE / payroll-only user (holds
  `VIEW_PAYROLL_REPORTS`, not `MANAGE_HR`). Assert the card is absent AND that a payroll card
  (e.g. `href="/reports/payroll-register"`) IS present — that positive assertion is what proves
  the selector works and the absence is real.

---

### Section 3 — Rating-row keyed-each crash (P0-3)

**File:** `src/lib/components/performance/ReviewFormRender.svelte`

7. Line 169: `{#each structure.ratingScale.rows as row (row.value)}` →
   `{#each structure.ratingScale.rows as row, i (i)}`.

**Why index, not minted ids:** `RatingScaleEditor.svelte:19-24` pushes
`{ value: scale.min, description: '' }` — the row object has no id, and `ratingScaleSchema`
(`src/lib/server/performance/schemas.ts:24`) has no id field. Minting ids means a schema change,
a migration path for stored structures, and an editor change. Index keying is correct here
because this list is display-only, append/remove-at-end, and never reordered.
`RatingScaleEditor.svelte:61` already iterates the same array by index (`as row, i`) with no key
at all — the editor has never had this bug, only the preview.

**Blast radius:** 1 file, 1 line. Only consumer of `structure.ratingScale.rows` as a keyed each in
the whole repo (`grep -rn "row.value" src` — 5 hits, 4 in the editor, 1 here).

**Verification:** agent probe (live browser). Open
`/performance/templates/[id]`, click "Add row" in the rating-scale editor **twice without
editing**, assert the preview's Rating Scale `<ul>` still renders and now has two more `<li>`
than before. **Negative control:** run the identical script on the pre-fix commit and confirm the
preview dies (a Svelte duplicate-key error in the console / the `<ul>` disappearing). Per
`all-tests.md`, a green run on the fixed build alone proves nothing — the red run on the old
build is the evidence.

**Why no unit test:** `vitest.config.ts` sets `environment: 'node'`; there is no DOM and no
component-render test in the 193-file suite. Adding jsdom for one assertion is out of scope for
phase 01 — logged in Test Infra Improvement Notes below.

---

### Section 4 — Toaster ARIA (P0-4)

**File:** `src/lib/components/ui/Toaster.svelte`

8. On the container `<div>` (line 14–16) add `role="status"` and `aria-live="polite"`.
9. On the per-toast `<div>` (line 18–22) add `aria-live={t.kind === 'error' ? 'assertive' : undefined}`
   so an error toast announces immediately. Do **not** put `role="alert"` on the container — the
   container is persistent and would re-announce on every mutation.

Attribute-level only. Do not touch `kindClass`, the timer, stacking, or the dismiss button. Pause-on-hover,
de-dup, stacking cap and `(auth)` mounting are phase 04.

**Blast radius:** 1 file, 2 attributes. Mounted app-wide in `(app)/+layout.svelte`, so a syntax
error is app-wide — `pnpm check` covers it.

**Verification:**
- `pnpm check` + `pnpm lint` (eslint-plugin-svelte carries the a11y rules).
- Agent probe: trigger any existing toast call site (there are 10 in 5 files; the org switcher in
  `+layout.svelte` is the easiest), then assert on the **DOM node** — `[role="status"]` exists and
  has `aria-live="polite"`. Assert the attribute, not a screenshot.

---

### Section 5 — Approve/reject and timesheet review say something (P0-5)

Copy the shape that already works: `rejectMany` in the same file returns
`{ saved: 'Rejected N requests…' }` (`requests/approvals/+page.server.ts:178`) and the page
already renders `{#if form?.saved}` (`+page.svelte:192-198`). The block is live and unused — the
server just never populates it.

**File A:** `src/routes/(app)/requests/approvals/+page.server.ts`

10. In `decideRequest`, after the `try/catch` (currently ends at line 141 returning nothing), add
    a return whose message names the decision, e.g.
    `return { saved: decision === 'APPROVED' ? 'Request approved.' : decision === 'REJECTED' ? 'Request rejected.' : 'Request returned to the filer.' }`.
    Do not touch the guard, the schema check, the `decide()` call, or the catch arms.

**File B:** `src/routes/(app)/requests/timesheets/+page.server.ts`

11. In `review`, after the `try/catch` (ends ~line 110), add
    `return { saved: approved ? 'Timesheet approved.' : 'Timesheet rejected.' }`.
    The page already renders `form?.saved` at `+page.svelte:74`.

**Out of scope:** `payroll/[id] ?/decide`. The audit names it in the same bullet but it is a
different page family with its own banner situation — phase 04.

**Blast radius:** 2 files, 2 returns. Both actions previously returned `undefined`; adding a
success payload cannot change the failure paths. Existing `ActionData` types regenerate via
`svelte-kit sync` (run by `pnpm check`).

**Verification:**
- New unit tests, following the existing `page.server` + mocked-service pattern
  (`tests/unit/complaints-scoping.test.ts`, `tests/unit/performance-templates-rbac.test.ts`):
  `tests/unit/request-decide-feedback.test.ts` — mock the `decide` service to resolve, call
  `actions.decideRequest` with `decision=APPROVED` and again with `REJECTED`, assert the returned
  object has a non-empty `saved` string and that the two strings differ.
  Same file (or a sibling) for `requests/timesheets ?/review` approve + reject.
- **Mutation check (required, per `all-tests.md`):** delete the new `return` line and confirm the
  new test goes red. A test that passes with the fix reverted is vacuous.
- Agent probe: approve one real request in the browser; assert the green banner text is in the DOM
  after the action settles.

---

### Section 6 — Offboard feedback + delete the dead action (P0-6)

**File A:** `src/routes/(app)/employees/[id]/+page.server.ts`

12. In `offboard` (line 642–661), after the `try/catch`, add
    `return { action: 'offboard', saved: 'Employee offboarded.' }`.
    Also add `action: 'offboard'` to the failure arm — the catch currently does
    `return failFromError(e)`; change it to
    `const f = failFromError(e); return fail(f.status, { action: 'offboard', ...f.data })`,
    which is the exact pattern `changeCompensation` already uses at line 583–584. (`fail` is
    already imported in this file.)

**File B:** `src/routes/(app)/employees/[id]/+page.svelte`

13. Render the message **immediately before** the `{#if canManage && employee.employmentStatus === 'ACTIVE'}`
    at line ~1783 — i.e. outside that block, in the same grid column. Gate it on
    `form?.action === 'offboard'`:
    a success `<div>` on `form?.saved` and an error `<div>` on `form?.error`, styled like the
    existing pair at lines 497–507.
    **This placement is load-bearing:** on success `employmentStatus` becomes `OFFBOARDED`, the
    `{#if …ACTIVE}` block unmounts, and a message inside it would never be seen. Do not put it
    inside the form.

**File C:** `src/routes/(app)/employees/+page.server.ts`

14. Delete the whole `export const actions: Actions = { offboard: … }` block (lines 65–92).
    Verified dead: `grep -rn '?/offboard' src` finds only `employees/[id]/+page.svelte:1786`,
    which posts to the detail route's own action.
15. Remove the imports that only that action used: `failFromError` (line 2), `offboardEmployee`
    from the `services/employees` import (line 4 — keep `countEmployees`, `listEmployees`),
    `assertCanTouchEmployee` from the `employee-access` import (line 6–9 — keep
    `listVisibleEmployeeIds`), and `Actions` from the `$types` import (line 11 — keep
    `PageServerLoad`). Keep `requireAnyCapability` (used by `load` at line 17).
    Do not remove anything the `load` still uses; `pnpm check` + `pnpm lint` (no-unused-vars) is
    the proof.

**Blast radius:** 3 files. File C is a **deletion on a `MANAGE_HR` destructive action** — the
risk is deleting a live path. That is why step 14 carries an explicit grep, and why the
verification below re-runs the offboard flow end-to-end after the delete.

**Verification:**
- `pnpm check` and `pnpm lint` must be green — they are the orphan-import proof.
- Re-run `pnpm test`; `tests/unit/offboard-self-guard.test.ts` and
  `tests/unit/employee-access.test.ts` must stay green (they cover the service and the access
  guard, not the deleted route action — if either goes red, the delete removed something live,
  stop and reassess).
- `pnpm test:e2e -- tests/e2e/employee.spec.ts` — the roster/detail flow.
- Agent probe: offboard a **marker** employee created for the run (plant a marker so the row is
  findable), assert the green "Employee offboarded." text is in the DOM *after* the Offboard form
  has disappeared, then assert against the **database row**
  (`docker exec … psql -p 5434 -c "select \"employmentStatus\" from …"`) that it is `OFFBOARDED`
  — not against the value the form submitted.

---

### Section 7 — payroll/periods void + release: confirm before, message after (P0-8)

**File A:** `src/routes/(app)/payroll/periods/+page.svelte`

16. Add `import ConfirmButton from '$lib/components/ui/ConfirmButton.svelte'` to the script block.
17. Replace the inline `?/void` form (lines ~197–205) with a `ConfirmButton`, keeping the per-row
    submit guard by passing it through — `ConfirmButton` accepts `submit?: SubmitFunction`:
    `action="?/void"`, `title="Void this payroll period?"`,
    `message` in the same style as the run-list void (`payroll/+page.svelte:207-216`) — state that
    it cannot be undone and that the same exact period cannot be created again —
    `confirmText="Void period"`, `triggerLabel={voidG.busy ? 'Voiding…' : 'Void'}`,
    `triggerClass="btn-row-danger disabled:pointer-events-none disabled:opacity-50"`,
    `disabled={voidG.busy}`, `submit={voidG.enhance}`, with the existing
    `<input type="hidden" name="id" value={p.id} />` as the child snippet.
18. Same replacement for the `?/release` form (lines ~183–190):
    `title="Release this period?"`, message stating payslips become visible to employees and the
    period leaves LOCKED, `confirmText="Release period"`,
    `triggerClass="btn-row-positive …"`, `submit={releaseG.enhance}`.
19. Add a `{#if form?.saved}` green block directly after the existing `{#if form?.error}` block
    (lines 48–54), styled to match it (`border-green-500/20 bg-green-500/10`, as in
    `requests/approvals/+page.svelte:192-198`).

**File B:** `src/routes/(app)/payroll/periods/+page.server.ts`

20. `release` (line 102–110): after the `try/catch`, `return { saved: 'Period released.' }`.
21. `void` (line 112–120): after the `try/catch`, `return { saved: 'Period voided.' }`.
    Do not touch `requirePayrollManage`, `requireAnyCapability(… 'OVERRIDE_FINALIZED')`, `toFail`,
    or the service calls.

**Known limitation (do not fix here):** `ConfirmButton` closes its dialog before the request
resolves and reports nothing itself (`ConfirmButton.svelte:38-53`, Addendum §E). The new
`form?.saved` banner is what closes the loop for these two actions. Fixing the primitive is
phase 04.

**Blast radius:** 2 files. Money surface, but only the confirm wrapper and the return value
change; the guard and service call are untouched. The `{#each}`-scoped `guard()` memoisation
(`+page.svelte:19-23`) must survive — passing `submit={…enhance}` preserves it, and losing it
would reintroduce the #108 double-submit bug.

**Verification:**
- New unit test `tests/unit/payroll-period-feedback.test.ts` in the style of
  `tests/unit/payroll-period-actors.test.ts` (hoisted `dbMock`, mocked services): call
  `actions.void` and `actions.release` with the service mocked to resolve; assert each returns a
  non-empty `saved`. Assert the failure path still returns `{ error }` (mock the service to throw
  a 409) — proving the success payload did not swallow the error contract.
- **Mutation check:** revert one `return { saved: … }`; the matching assertion must go red.
- `pnpm test:e2e -- tests/e2e/payroll-lock-idempotency.spec.ts tests/e2e/payroll-run-void.spec.ts`
  — these drive the neighbouring period/void surfaces and are the regression tripwire for the
  double-submit guard.
- Agent probe: on `/payroll/periods`, click Void on a disposable LOCKED period — assert the
  confirm dialog appears (`ConfirmDialog` text in the DOM), cancel, assert the period status pill
  is unchanged (positive control), then confirm and assert both the green banner text AND the
  `VOIDED` pill. Repeat for Release.

---

### Section 8 — `employees/[id]` error mis-routing: minimal harm reduction (P0-7, partial)

**Scope fence:** the full fix (a scoped error slot next to each of the ~21 forms) is phase 07's
page restructure. This phase does only what the audit calls the disambiguation pattern: tag every
untagged return with `action`, then gate the one shared block on it. After this phase a failed
`addLoan` renders **nowhere** instead of rendering inside Update Profile. That is the intended
trade — a silent failure is less harmful than an error attributed to the wrong form, and phase 07
gives every action its own slot. **Record this explicitly in the phase report as an accepted,
temporary regression in coverage.**

**File A:** `src/routes/(app)/employees/[id]/+page.server.ts`

22. Three actions already carry `const action = '<name>'` and spread it into every return —
    `assignTemplate` (line 515), `changeCompensation` (line 567), `promote` (line 593). **Do not
    touch them.** Copy their shape onto the rest.
23. Add `action: '<name>'` to every `return` and every `return fail(...)` in these **18** actions
    (exact names, from `grep -n "^\t[a-zA-Z]*: async" src/routes/(app)/employees/\[id\]/+page.server.ts`):

    | # | Action | Line |
    |---|---|---|
    | 1 | `setSupervisors` | 420 |
    | 2 | `update` | 436 |
    | 3 | `reveal` | 615 |
    | 4 | `offboard` | 642 |
    | 5 | `addLoan` | 663 |
    | 6 | `addCashAdvance` | 681 |
    | 7 | `addEarning` | 699 |
    | 8 | `endEarning` | 717 |
    | 9 | `addDeduction` | 736 |
    | 10 | `endDeduction` | 755 |
    | 11 | `toggleStatutoryExemption` | 775 |
    | 12 | `toggleEmployerShareExternal` | 796 |
    | 13 | `setStatutoryAllocation` | 818 |
    | 14 | `addEmergencyContact` | 837 |
    | 15 | `deleteEmergencyContact` | 855 |
    | 16 | `uploadDocument` | 872 |
    | 17 | `deleteDocument` | 901 |
    | 18 | `toggleOnboardingStep` | 920 |

    `offboard` (#4) is already covered by section 6 step 12 — do it once, not twice.
    `reveal` (#3) returns `{ revealed, history }` at line 639 and the page reads
    `form?.revealed` / `form?.history` (`+page.svelte:39,42`) **ungated** — add
    `action: 'reveal'` to its returns but **do not** gate those two `$derived` reads on it;
    changing them is a behaviour change outside this fence.
    Where a return goes through `failFromError(e)`, use the `changeCompensation` shape:
    `const f = failFromError(e); return fail(f.status, { action, ...f.data })`.
24. `update` (#2) is the action the shared block belongs to. Its returns are at lines 446, 487
    (fails) and 492 (`{ success: true }`) — all three need `action: 'update'`, or step 25 silences
    the Update Profile form entirely.

**File B:** `src/routes/(app)/employees/[id]/+page.svelte`

25. Line 497: `{#if form?.success}` → `{#if form?.action === 'update' && form?.success}`;
    line 503: `{:else if form?.error}` → `{:else if form?.action === 'update' && form?.error}`.
    No other edit to this file in this section.

**Blast radius:** 2 files, ~40 return statements. This is the largest section and the one that can
silently break a working banner. The enumeration table above is the checklist — tick each of the
18 rows.

**Verification:**
- **Enumeration check (run before committing):**
  `grep -n "return {\|return fail(" "src/routes/(app)/employees/[id]/+page.server.ts" | grep -v "action" `
  must return **only** the `reveal` line 639 return if you chose to leave it (it should not — step
  23 tags it too) — i.e. the expected output is empty. Any remaining untagged return is a missed row.
- New unit test `tests/unit/employee-detail-action-tags.test.ts`: import the route module's
  `actions` object, assert `Object.keys(actions)` matches the expected 21-name list (fails loudly
  if an action is added later without a tag), and for at least three representative actions
  (`update`, `addLoan`, `deleteDocument`) drive the cheap failure path (missing/invalid form
  field, no service call needed) and assert the returned `data.action` equals the action name.
- **Mutation check:** remove `action: 'update'` from the line-492 success return; the Update
  Profile probe below must go red.
- Agent probe (this is the finding, so probe it directly): as HR_ADMIN on an ACTIVE employee —
  (a) save Update Profile successfully, assert "Saved." appears inside the Update Profile card
  (positive control — proves step 24 landed);
  (b) submit `addLoan` with an invalid amount, assert Update Profile shows **no** error and no
  "Saved.";
  (c) on an **OFFBOARDED** employee, submit a failing document delete and assert nothing renders
  in Update Profile (that card is not even mounted) — this documents the accepted phase-07 gap.
- `pnpm test:e2e -- tests/e2e/employee.spec.ts tests/e2e/form-errors.spec.ts` — `form-errors.spec.ts`
  is the direct regression tripwire for step 25.

---

## Acceptance Criteria

| # | Criterion | proven by | strategy |
|---|---|---|---|
| AC-1 | `GET /approvals` returns 308 to `/requests/approvals` | `approvals-legacy-redirect.test.ts` | Fully-Automated |
| AC-2 | An HR_ADMIN reaches `/reports/audit-log` from both the reports index and the sidebar; a payroll-only viewer sees neither | Audit-log reachability probe + negative control | Agent-Probe |
| AC-3 | Two consecutive "Add row" clicks leave the template preview rendering | Rating-row duplicate-key probe (with red control on the pre-fix commit) | Agent-Probe |
| AC-4 | The toast container exposes `role="status"` + `aria-live="polite"`; error toasts are `assertive` | Toaster ARIA DOM probe | Agent-Probe |
| AC-5 | Approve, reject and return of a request, and timesheet approve/reject, each return a distinct non-empty `saved` string the page renders | `request-decide-feedback.test.ts` + approve-in-browser probe | Fully-Automated + Agent-Probe |
| AC-6 | A successful offboard shows a confirmation that survives the ACTIVE-block unmount, and the DB row reads `OFFBOARDED` | Offboard marker probe (DOM + psql) | Hybrid |
| AC-7 | The dead `?/offboard` on the employees list is gone with no orphan imports and no live path broken | `pnpm lint` + `pnpm check` + `pnpm test` + `employee.spec.ts` | Fully-Automated |
| AC-8 | `?/void` and `?/release` on payroll/periods each require a confirm and each render a success message; the per-row double-submit guard still holds | `payroll-period-feedback.test.ts` + periods void/release probe + `payroll-lock-idempotency.spec.ts` | Fully-Automated + Agent-Probe |
| AC-9 | Every action in `employees/[id]/+page.server.ts` returns an `action` key, and the shared block renders only for `update` | Untagged-return grep + `employee-detail-action-tags.test.ts` + mis-routing probe | Fully-Automated + Agent-Probe |
| AC-10 | Full CI gate set green in CI order | `pnpm format:check` → `pnpm lint` → `pnpm check` → `pnpm test` | Fully-Automated |

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm format:check` | Fully-Automated | AC-10 (runs FIRST in CI; a red format check skips every other job) |
| `pnpm lint` | Fully-Automated | AC-7, AC-10 |
| `pnpm check` (after `pnpm prisma generate`) | Fully-Automated | AC-2, AC-7, AC-10 |
| `pnpm test` | Fully-Automated | AC-1, AC-5, AC-7, AC-8, AC-9 |
| `tests/unit/approvals-legacy-redirect.test.ts` (new) | Fully-Automated | AC-1 |
| `tests/unit/request-decide-feedback.test.ts` (new) | Fully-Automated | AC-5 |
| `tests/unit/payroll-period-feedback.test.ts` (new) | Fully-Automated | AC-8 |
| `tests/unit/employee-detail-action-tags.test.ts` (new) | Fully-Automated | AC-9 |
| Untagged-return grep on `employees/[id]/+page.server.ts` | Fully-Automated | AC-9 |
| Mutation checks (revert each new `return { saved }` / `action:` tag, expect red) | Fully-Automated | AC-5, AC-8, AC-9 — proves the new tests are not vacuous |
| `pnpm test:e2e -- employee.spec.ts form-errors.spec.ts` | Hybrid (dev build + Playwright; #287 flaky) | AC-7, AC-9 |
| `pnpm test:e2e -- payroll-lock-idempotency.spec.ts payroll-run-void.spec.ts` | Hybrid | AC-8 |
| Offboard marker probe: DOM assert + `psql` assert on `employmentStatus` | Hybrid (needs `veent-db-5434` + dev server, both user-started) | AC-6 |
| Audit-log reachability probe + FINANCE negative control | Agent-Probe | AC-2 |
| Rating-row duplicate-key probe, run on both the pre-fix and post-fix commit | Agent-Probe | AC-3 |
| Toaster ARIA DOM probe (`[role="status"]` + `aria-live`) | Agent-Probe | AC-4 |
| Approve-a-request banner probe | Agent-Probe | AC-5 |
| Periods void/release confirm + banner probe (cancel = positive control) | Agent-Probe | AC-8 |
| `employees/[id]` mis-routing probe (a/b/c in section 8) | Agent-Probe | AC-9 |

No criterion in this plan is left on Known-Gap. Two coverage gaps exist at the *tooling* level
(no DOM environment for component tests; ConfirmButton silent-on-success) — both are recorded in
Test Infra Improvement Notes and neither is a proving strategy for any AC above.

---

## Manual Verification Checklist (exit gate)

Run in this order, on a dev server the **user** starts (never launch `./start.sh`, vite or
`veent-db-5434` yourself — ask). Drive with Playwright MCP + `POST /api/v1/_dev/login-as`.
Note that `pnpm check` kills the dev server, so run all CI gates **before** the browser pass.

- [ ] 1. Visit `/approvals` → lands on `/requests/approvals`, heading reads "Request Approvals".
- [ ] 2. As HR_ADMIN: `/reports` shows an "Audit Log" card; clicking it loads the audit log.
- [ ] 3. As HR_ADMIN: the sidebar shows "Audit Log" nested under Reports; it navigates.
- [ ] 4. As FINANCE (payroll-only): no Audit Log card, no Audit Log sidebar row, **but** the
      Payroll Register card IS present (positive control).
- [ ] 5. Template builder: "Add row" ×2 with no editing → preview still renders both new rows.
- [ ] 6. Any toast fires → the container node has `role="status"` and `aria-live="polite"`.
- [ ] 7. Approve a request → green banner names the decision. Reject one → banner differs.
- [ ] 8. Approve a timesheet from `/requests/timesheets` → green banner.
- [ ] 9. Offboard a marker employee → confirmation visible AFTER the Offboard form disappears;
      `psql` shows `employmentStatus = 'OFFBOARDED'`.
- [ ] 10. `/payroll/periods`: Void a disposable LOCKED period → confirm dialog appears; Cancel
      leaves the status pill unchanged; Confirm shows "Period voided." and a VOIDED pill.
- [ ] 11. Same for Release.
- [ ] 12. `employees/[id]`: Update Profile save shows "Saved."; a failing `addLoan` shows nothing
      in Update Profile.
- [ ] 13. Take a screenshot of `/reports`, `/payroll/periods` and `employees/[id]` — assertions do
      not see layout.

---

## Post-Phase Testing (CI gate set, in CI order)

```bash
pnpm prisma generate     # a stale client produces phantom check failures
pnpm format:check        # CI runs this FIRST and skips the rest on red
pnpm lint
pnpm check
pnpm test
pnpm test:e2e            # #287: flaky; read the actual error before re-running
```

Baseline rule from `process/context/planning/all-planning.md`: confirm all four gates are green on
the **current tree before** editing anything. A VALIDATE BLOCKED here is usually a baseline miss,
not a reasoning error.

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Section 8 mistypes an `action` string → a working banner goes silent | Medium | Untagged-return grep + `employee-detail-action-tags.test.ts` + the Update Profile positive control probe |
| Section 6 deletes an import the `load` still needs | Low | `pnpm check` + `pnpm lint` are the proof; `employee-access.test.ts` must stay green |
| Section 7 loses the per-row submit guard → #108 double-submit returns | Medium | `submit={voidG.enhance}` passed explicitly; `payroll-lock-idempotency.spec.ts` is the tripwire |
| Section 2 breaks `+layout.svelte` → every page 500s | Low | `pnpm check` compiles it; browser pass loads at least one page |
| Section 6's success message placed inside the unmounting block → never seen | Medium | Called out explicitly in step 13; probe asserts the message is visible *after* the form disappears |
| Index keying (section 3) masks a future reorder feature | Low | Rows are append/remove-at-end only today; note it in the phase report so phase 07 revisits if reorder ships |
| E2E flakiness (#287) reads as a real failure | Medium | Read the error, not the verdict; three distinct causes have hidden behind "flaky" here |

---

## Phase Completion Rules

- A section is `CODE DONE` when its diff is committed and the four CI gates are green.
- A section is `✅ VERIFIED` only when its manual/agent-probe row is checked off **and** the user
  User Confirmation is required. Code-only completion is `CODE DONE`, never `VERIFIED`.
- Sections 3, 4 and 2 have **no** fully-automated proof — they cannot reach `VERIFIED` on a green
  suite alone. `all-tests.md` records five times a green suite here coexisted with a real defect.
- Section 8 closes as `CODE DONE — partial by design`; P0-7 is not resolved until phase 07.
- Merges go to `staging`, so `Closes #N` never fires — close any linked issue by hand.

---

## Dependencies

- None on other phases. Phase 01 is the entry point of the program.
- Downstream: phase 03 (confirm dialogs) builds on section 7's ConfirmButton usage; phase 04
  (feedback contract) builds on the `{ action, saved }` shape sections 5–8 establish; phase 07
  finishes section 8.
- Environment: `veent-db-5434` running and schema pushed; dev server running (user-started) for
  every probe.

---

## Test Infra Improvement Notes

- **No DOM test environment.** `vitest.config.ts` sets `environment: 'node'`, so none of the 193
  unit files can render a component, even though `@testing-library/svelte` and
  `@testing-library/jest-dom` are already devDependencies. This is why sections 3 and 4 have no
  automated gate. A future `environment: 'jsdom'` project (or a second vitest project scoped to
  `tests/component/`) would make the rating-row key and the Toaster ARIA attributes cheaply
  regression-proof. Out of scope for phase 01.
- **`ConfirmButton` is unobservable on success by construction** (`ConfirmButton.svelte:38-53`) —
  the dialog closes before the request resolves. Any test asserting "confirmed action reported
  success" has to assert on the page's banner, not on the primitive. Phase 04 owns the primitive.
- **No gate typechecks `prisma/**` or `scripts/**`** — not touched by this phase, recorded so the
  next phase does not assume `pnpm check` covers them.
- **`pnpm test:e2e` is a known-flaky CI gate (#287)** — treat a single red spec as a signal to
  read the error, not to re-run.

---

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)

---

## Resume and Execution Handoff

1. **Selected plan file path:**
   `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-01-p0-fixes_PLAN_03-09-26.md`
2. **Last completed phase or step:** none — PLAN written, nothing implemented.
3. **Validate-contract status:** pending (placeholder section above). VALIDATE needs this plan
   **committed** before it can write into it.
4. **Supporting context files loaded:** `process/context/all-context.md`,
   `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md`,
   `process/context/uxui/all-uxui.md`, `docs/ui-ux-audit-2026-09-03.md` (§2 + Addendum §B).
5. **Next step for a fresh agent:** commit this plan, run VALIDATE against it, then EXECUTE
   section by section in the order 1 → 8, committing per section. Confirm the four CI gates are
   green on the current tree **before** the first edit — the baseline, not the diff, is the usual
   cause of a surprise red.

6. **Primary execute anchor:** this file is the single execute anchor for phase 01 —
   `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-01-p0-fixes_PLAN_03-09-26.md`.
   Pass exactly this path to EXECUTE.
7. **Supporting phase files:** none yet. No umbrella plan or sibling phase files exist in this
   task folder at plan time; phases 02–07 are named in the Non-goals table but have no plan files.
   If an umbrella plan is added later, it is context only — the execute anchor stays this file.

---

## Next Step

Plan complete. Review carefully. Say **ENTER VALIDATE MODE** when ready to proceed to plan
validation (required before implementation).
