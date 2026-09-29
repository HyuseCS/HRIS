---
name: plan:ui-ux-overhaul-phase-01-p0-fixes
description: "Phase 01 of the UI/UX overhaul — the 8 P0 showstoppers from the 2026-09-03 audit, smallest correct diffs only"
date: 03-09-26
feature: ui-ux-overhaul
phase: "01"
---

# UI/UX Overhaul — Phase 01: P0 Showstoppers

**Date**: 03-09-26
**Status**: ✅ VERIFIED (04-09-26) — see `phase-01-p0-fixes_REPORT_03-09-26.md`. All 13 Manual
Verification Checklist items below ran live and passed; archived to
`process/features/ui-ux-overhaul/completed/ui-ux-overhaul_03-09-26/`.
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

2b. **(added by VALIDATE)** `src/routes/(app)/approvals/+page.svelte:1` carries the *same* wrong
   sentence in a comment — `<!-- Never rendered: the server load redirects /approvals → /requests
   (merged page). -->`. Correct it to name `/requests/approvals`. Leaving it is how the bug
   re-enters on the next read.

**Blast radius:** 2 files, 3 lines. VALIDATE confirmed **zero** in-repo consumers: no
`goto('/approvals')` and no `href="/approvals"` anywhere in `src/` or `tests/`. The only other hit
is a stale comment at `tests/e2e/dashboard.spec.ts:10`; that spec asserts the dashboard
*Pending Approvals* card navigates to `/requests` (the card's own href,
`dashboard/+page.svelte:171`) and is **unaffected** by this redirect change — do not edit it. The
risk is entirely external bookmarks, which is the point of the fix.

**Verification:** new unit test `tests/unit/approvals-legacy-redirect.test.ts` — import the
`load` from the route module, call it, assert the thrown object is a 308 redirect whose
`location` is `/requests/approvals`. Follow the `page.server` import style already used in
`tests/unit/complaints-scoping.test.ts` —
`const { load } = await import('../../src/routes/(app)/approvals/+page.server')`.
**(VALIDATE notes)** In SvelteKit 2 `redirect()` **throws**, so assert with `try/catch` (or
`expect(() => load(...)).toThrow()`) and read `.status` / `.location` off the caught object;
`isRedirect` from `@sveltejs/kit` is the type guard. `tsconfig.json` extends
`.svelte-kit/tsconfig.json`, which type-checks `tests/` — `PageServerLoad` demands an event
argument, so cast a minimal event the way `tests/unit/audit-log-reveal.test.ts` already does
rather than calling `load()` bare.

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

4. Add a derived list next to `settingsChildren`/`requestsChildren`. **(VALIDATE line-drift
   correction)** `settingsChildren` is at line **265**, `requestsChildren` at **294–322** — the
   plan's original "~292" lands *inside* `requestsChildren`. Insert **after line ~322**:
   `const reportsChildren = $derived([{ href: '/reports/audit-log', label: 'Audit Log', show: isAdmin }].filter((i) => i.show))`
5. In the nav `{#each navItems}` loop (**line 515**), add a branch. **(VALIDATE exact insertion
   point)** the `{#if item.href === '/requests' && canApprove}` arm runs **516–585** and the
   generic `{:else}` begins at **586** — the new arm goes at line **586, immediately before that
   `{:else}`**: `{:else if item.href === '/reports' && reportsChildren.length > 0}`. Render the
   **same** `<a>` markup the generic `{:else}` arm already uses (copy it whole, **including its
   `{@const active = …}` at 587–590 and the icon `<svg … d={item.icon}>` + `{#if item.badge}`
   block at 598–616** — a partial copy silently drops the Reports icon), then, directly under
   it, the same indented child list markup used by the requests group
   (`<div class="mt-0.5 space-y-0.5 border-l border-border pl-3 ml-4">` + one `<a>` per child).
   **No toggle, no new state, no new icon, no badge** — the child list is always shown when the
   user holds `MANAGE_HR`. A collapsible Reports group is phase 02 IA work, not this.
   **(VALIDATE)** There is exactly **one** `<nav>` in this file (line 514) — no separate mobile
   drawer loop to keep in sync.
   **(VALIDATE)** The `/reports` navItem itself (lines 244–247) is gated
   `show: canViewReports` = `canAny(roles,'VIEW_PAYROLL_REPORTS')` (line 101) — **not** `isAdmin`.
   That is why the `reportsChildren.length > 0` test is load-bearing: a payroll-only viewer keeps
   the plain Reports link through the generic `{:else}` and gains no child row.
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
- **MANAGER exposure arm (added by VALIDATE — mandatory, measurement only):** repeat as a
  **MANAGER**. `rbac.ts:26` lists `MANAGE_HR: ['MANAGER','HR_ADMIN','SUPER_ADMIN','CEO']`, so a
  branch manager WILL see the new card and the new sidebar row — and the audit-log query
  (`audit-log/+page.server.ts:22–28`) scopes on `organizationId` **only**, with no reporting-line
  filter. Record in the phase report exactly what a MANAGER sees. Do **not** change the gate here:
  narrowing it to `ADMINISTER_HR_ORGWIDE` is a server-guard decision already owned by the
  umbrella's open owner-decision "MANAGER / `ADMINISTER_HR_ORGWIDE` guard alignment" (raised by
  phase 02). See OWNER-DECISION-1 in the Validate Contract.
- **(VALIDATE, verified)** `reportCards` at `reports/+page.svelte:82–84` is
  `data.canViewHrReports ? allReportCards : allReportCards.filter((r) => r.payroll)` — the plan's
  `payroll: false` claim is correct: a payroll-only viewer never sees the card.

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
9b. **(added by VALIDATE — required, not optional)** also put `aria-atomic="false"` on the
   container. `role="status"` carries an **implicit `aria-atomic="true"`**, which re-announces the
   *whole* toast stack on every mutation — precisely the failure step 9 says it is avoiding by
   refusing `role="alert"`. Without this the fix trades one bad announcement pattern for another.
   The container also holds the interactive Dismiss `<button>`s (lines 34–39) inside the live
   region; acceptable for a toast stack, but re-examine it when phase 04 rebuilds the Toaster.

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

**Accepted partial (named by VALIDATE):** the `{#if form?.error}` block at lines 48–54 is
*page-level* and shared by all six actions on this page (`open`, `import`, `generate`, `lock`,
`release`, `void`). The new `{#if form?.saved}` block is page-level too, but only `release` and
`void` populate it — so `open`, `import`, `generate` and `lock` stay silent on success after this
phase. In scope for phase 04 (the repo-wide feedback contract), not phase 01. Record it in the
phase report.

**(VALIDATE, verified against source)** `ConfirmButton.svelte:7–33` accepts exactly
`action` (required), `title`, `message`, `confirmText`, `triggerLabel`, `triggerClass`,
`disabled`, `submit?: SubmitFunction`, `children?: Snippet` — every prop steps 17–18 pass exists,
and no required prop is omitted. It renders its **own**
`<form method="POST" {action} use:enhance={submit ?? noop} class="contents">` (line 41), so the
existing inline `<form>` must be **replaced**, never wrapped around it. `releaseG` is
`{@const}`-bound at line 182 and `voidG` at line 196, each an immediate child of its `{#if}` —
that stays legal after the swap, and `.busy` / `.enhance` are the real field names.

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

**Accepted regression named explicitly (added by VALIDATE).** The plan states the trade as "a
failed `addLoan` renders **nowhere** instead of in the wrong form". There is a second, sharper
loss it did not name: **`setSupervisors` returns `{ success: true }` at line 433 and today lights
the shared "Saved." banner at `+page.svelte:497`.** After step 25 gates that block on
`form?.action === 'update'`, a successful supervisor change reports **nothing at all** — a
currently-*working* success signal is removed, not merely a mis-routed error. Accepted for phase
01, closed by phase 07's per-form slots. Write it into the phase report by name, alongside the
`addLoan` case.

**Scope fence:** the full fix (a scoped error slot next to each of the ~21 forms) is phase 07's
page restructure. This phase does only what the audit calls the disambiguation pattern: tag every
untagged return with `action`, then gate the one shared block on it. After this phase a failed
`addLoan` renders **nowhere** instead of rendering inside Update Profile. That is the intended
trade — a silent failure is less harmful than an error attributed to the wrong form, and phase 07
gives every action its own slot. **Record this explicitly in the phase report as an accepted,
temporary regression in coverage.**

**File A:** `src/routes/(app)/employees/[id]/+page.server.ts`

22. Three actions already carry `const action = '<name>'` and spread it into every return —
    `assignTemplate` (line **511**), `changeCompensation` (line **564**), `promote` (line **591**).
    **(VALIDATE line-drift correction — the plan originally read 515/567/593.)** **Do not
    touch them.** Copy their shape onto the rest. Their page-side blocks are already gated
    (`+page.svelte:433/439`, `1495–1509`, `1597–1611`) — leave those alone too.
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
- **Enumeration check (CORRECTED BY VALIDATE — the original pass-condition was wrong and
  unachievable).** The original gate was
  `grep -n "return {\|return fail(" … | grep -v "action"` with an expected output of *empty*. Run
  on the current tree it returns **46** lines, two of which — **line 73 and line 199** — are
  `load` returns that must **never** be tagged. Chasing "empty" would push you to tag `load`.
  Use these **two** gates instead, both run before committing:

  1. Untagged action returns — scope the grep to the actions block, which starts at line 420:
     ```bash
     awk 'NR>=420' "src/routes/(app)/employees/[id]/+page.server.ts" \
       | grep -n "return {\|return fail(" | grep -v "action"
     ```
     Expected output after the edit: **empty**. Any line here is a missed row.
  2. **`failFromError` blind spot (found by VALIDATE).** The grep above matches neither
     `return {` nor `return fail(` on a `return failFromError(e)` line, so it is **blind** to the
     five sites step 23 must convert — lines **431** (`setSupervisors`), **657** (`offboard`),
     **676** (`addLoan`), **694** (`addCashAdvance`), **712** (`addEarning`). Add a second gate:
     ```bash
     grep -n "return failFromError" "src/routes/(app)/employees/[id]/+page.server.ts"
     ```
     Expected output after the edit: **empty** — each becomes
     `const f = failFromError(e); return fail(f.status, { action, ...f.data })`. (The bare
     `import { failFromError }` at line 3 does not match this pattern and stays.)
- New unit test `tests/unit/employee-detail-action-tags.test.ts`: import the route module's
  `actions` object (VALIDATE confirmed the count is **exactly 21**, and all 18 rows of the table
  above match the current tree to the line), assert `Object.keys(actions)` matches the expected
  21-name list (fails loudly
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

All 13 items ran live on 04-09-26 and PASSED. Full evidence and wording corrections:
`phase-01-p0-fixes_REPORT_03-09-26.md` → "Manual Verification Checklist Results (04-09-26)".

- [x] 1. Visit `/approvals` → lands on `/requests/approvals`, heading reads "Request Approvals".
- [x] 2. As HR_ADMIN: `/reports` shows an "Audit Log" card; clicking it loads the audit log.
- [x] 3. As HR_ADMIN: the sidebar shows "Audit Log" nested under Reports; it navigates.
- [x] 4. As a payroll-only role: no Audit Log card, no Audit Log sidebar row, **but** the
      Payroll Register card IS present (positive control). Ran against two dev-DB-only accounts
      inserted to unblock this check — `payroll@veent.ph`/`finance@veent.ph` are NOT in
      `prisma/seed-core.ts`; see backlog `dev-seed-missing-finance-payroll-accounts_NOTE_04-09-26.md`.
- [x] 5. Template builder: "Add rating row" ×2 with no editing → preview still renders both new
      rows. (Corrected wording — the control at `RatingScaleEditor.svelte:98` is labelled
      "Add rating row", not "Add row".)
- [x] 6. Any toast fires → the container node has `role="status"` and `aria-live="polite"`.
- [x] 7. Approve a request → green banner names the decision. Reject one → banner differs.
- [x] 8. Approve a timesheet from `/requests/timesheets` → green banner. (Ordering note: an
      HR-submitted sheet needs `verifier@veent.ph` to approve first, then `approver@veent.ph`;
      status flips to APPROVED only after the final stage.)
- [x] 9. Offboard a marker employee → confirmation visible AFTER the Offboard form disappears;
      `psql` shows `employmentStatus = 'OFFBOARDED'`.
- [x] 10. `/payroll/periods`: Void a disposable LOCKED period → confirm dialog appears; Cancel
      leaves the status pill unchanged; Confirm shows "Period voided." and a VOIDED pill.
      **Requires SUPER_ADMIN** (`OVERRIDE_FINALIZED` is SUPER_ADMIN-only) — ran as `admin@veent.ph`.
- [x] 11. Same for Release. Same SUPER_ADMIN requirement as item 10.
- [x] 12. `employees/[id]`: Update Profile save shows "Saved."; a failing `addLoan` shows nothing
      in Update Profile.
- [x] 13. Take a screenshot of `/reports`, `/payroll/periods` and `employees/[id]` — assertions do
      not see layout. Found a container-background inconsistency across the three; deliberately
      deferred to a repo-wide fix — see backlog `surface-background-inconsistency_NOTE_04-09-26.md`.

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

Status: CONDITIONAL
Date: 03-09-26
date: 2026-09-03
generated-by: outer-pvl

Parallel strategy: sequential (in-thread fan-out)
Rationale: 7-signal score **6/7** (S2 schema/API/auth surface, S3 3+ directions, S4 phase program,
S5 depth requested, S6 high-risk class, S7 5+ files; S1 absent — one package). That scores HIGH and
would normally route to parallel subagents for a read-only 12-agent fan-out (4 Layer-1 dimensions +
8 Layer-2 sections). **Deviation:** the Agent tool was disabled in the validating session, so all
12 checks were executed sequentially in-thread against the live source tree. Coverage is
equivalent — every claim below carries file:line evidence — but wall-clock cost was ~4x the
parallel plan. Record this if a later phase re-runs PVL with subagents available.

### Test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-1 | `GET /approvals` 308s to `/requests/approvals` | Fully-Automated | `tests/unit/approvals-legacy-redirect.test.ts` — `await import('../../src/routes/(app)/approvals/+page.server')`, call `load`, catch, assert `status===308 && location==='/requests/approvals'` | B |
| AC-2 | HR_ADMIN reaches `/reports/audit-log` from index + sidebar; payroll-only sees neither | Agent-Probe | Audit-log reachability probe + FINANCE negative control + **MANAGER exposure arm** (added by VALIDATE) | A |
| AC-3 | Two "Add row" clicks leave the preview rendering | Agent-Probe | Rating-row duplicate-key probe, **red control on the pre-fix commit** | A |
| AC-4 | Toast container is `role="status"` + `aria-live="polite"` + `aria-atomic="false"`; error toasts `assertive` | Agent-Probe | Toaster ARIA DOM probe asserting all three container attributes | A |
| AC-5 | Approve / reject / return and timesheet approve/reject each return a distinct non-empty `saved` the page renders | Fully-Automated + Agent-Probe | `tests/unit/request-decide-feedback.test.ts` (+ mutation check) + approve-in-browser probe | B |
| AC-6 | Successful offboard shows a confirmation surviving the ACTIVE-block unmount; DB row reads `OFFBOARDED` | Hybrid | Offboard marker probe — DOM assert **after** the form disappears + `docker exec … psql -p 5434` assert on `employmentStatus` | A |
| AC-7 | Dead list-page `?/offboard` gone, no orphan imports, no live path broken | Fully-Automated | `pnpm lint` + `pnpm check` + `pnpm test` + `pnpm test:e2e -- tests/e2e/employee.spec.ts` | A |
| AC-8 | `?/void` and `?/release` each confirm and each report; the per-row double-submit guard holds | Fully-Automated + Agent-Probe | `tests/unit/payroll-period-feedback.test.ts` (+ mutation check) + void/release probe with a Cancel positive control + `tests/e2e/payroll-lock-idempotency.spec.ts` | B |
| AC-9 | Every `employees/[id]` action returns an `action` key; the shared block renders only for `update` | Fully-Automated + Agent-Probe | **Corrected** two-gate grep (scoped `awk 'NR>=420'` gate + `return failFromError` gate) + `tests/unit/employee-detail-action-tags.test.ts` + mis-routing probe a/b/c | B |
| AC-10 | Full CI gate set green in CI order | Fully-Automated | `pnpm format:check` → `pnpm lint` → `pnpm check` → `pnpm test` | A |
| RESIDUAL-1 | Section 3 rating-row key regression-proofed by an automated test | — | none possible: `vitest.config.ts` sets `environment: 'node'`; no DOM in the 193-file suite | D |
| RESIDUAL-2 | Section 4 Toaster ARIA attributes regression-proofed by an automated test | — | same node-only limitation | D |

gap-resolution legend: A — proven now. B — gate added by this plan's checklist. C — deferred to a
named later phase. D — backlog test-building stub (named residual; keep-active; continue).

Legacy line form (retained for existing validate-contract consumers):
- approvals redirect: Fully-automated: `pnpm test` (new `approvals-legacy-redirect.test.ts`)
- audit-log reachability: agent-probe: HR_ADMIN + FINANCE negative control + MANAGER exposure arm
- rating-row key: agent-probe: pre-fix red control then post-fix green
- Toaster ARIA: agent-probe: assert `role`/`aria-live`/`aria-atomic` on the DOM node
- request + timesheet feedback: Fully-automated: `pnpm test` (new `request-decide-feedback.test.ts`) + mutation check
- offboard: hybrid: DOM probe + `psql` on `employmentStatus` — precondition: `veent-db-5434` and a user-started dev server
- dead-action delete: Fully-automated: `pnpm lint && pnpm check && pnpm test && pnpm test:e2e -- tests/e2e/employee.spec.ts`
- payroll period feedback: Fully-automated: `pnpm test` (new `payroll-period-feedback.test.ts`) + hybrid `pnpm test:e2e -- tests/e2e/payroll-lock-idempotency.spec.ts tests/e2e/payroll-run-void.spec.ts`
- action-tag sweep: Fully-automated: corrected two-gate grep + `employee-detail-action-tags.test.ts`
- component-render regression for sections 3 and 4: known-gap: documented (no DOM environment)

### Failing stubs (Fully-Automated rows only — TDD red-first starting point)

```
test("should 308-redirect GET /approvals to /requests/approvals", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: GET /approvals 308s to /requests/approvals")
})
test("should return a distinct non-empty saved string for approve, reject and return", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: decideRequest returns a decision-specific saved string")
})
test("should return a non-empty saved string from actions.void and actions.release", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: payroll period void/release report success")
})
test("should tag every employees/[id] action return with its own action key", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: all 21 actions return an action key")
})
```

### Dimension findings

- **Infra fit: CONCERN** — `ConfirmButton`'s prop surface matches the plan exactly and `voidG`/
  `releaseG`/`.busy`/`.enhance` are the real names, but the four CI gates were **not** run on the
  current tree during VALIDATE (`pnpm check` kills a dev server; both are slow). Baseline is
  unproven — see E1.
- **Test coverage: CONCERN** — the route-module unit-test pattern the plan copies is real and used
  in 10+ files, and the action count is exactly 21 as claimed. But section 8 shipped **two broken
  verification gates** (wrong pass-condition; blind to `return failFromError`). Both corrected in
  the plan. Sections 2, 3 and 4 still have **zero** automated proof — that is what keeps this gate
  CONDITIONAL rather than PASS.
- **Breaking changes: PASS** — `/approvals` has zero in-repo consumers (no `goto`, no `href` in
  `src/` or `tests/`); `?/offboard` has exactly one hit, a relative action on the detail route, so
  the list-page delete breaks nothing; every `{#if form?.saved}` block the plan targets exists at
  the cited line. Two shared-banner side effects named in-plan (see Open gaps).
- **Security surface: CONCERN** — the nav gate correctly mirrors the route guard (do-not-break
  item 1 upheld) and nothing touches `rbac.ts`, `prisma/schema.prisma` or `services/**`. The
  concern is what the correct mirror *reveals*: see OWNER-DECISION-1. `failFromError` rethrows any
  non-HttpError (`form-fail.ts:12-14`), so `{ action, ...f.data }` leaks nothing new. Masked-reveal
  stays gated on `ADMINISTER_SYSTEM` (`audit-log/+page.server.ts:12,91`) — unchanged.
- **Section 1 — /approvals redirect: PASS** — redirect confirmed at line 6 inside `load`. Gap
  found and fixed: a second stale comment at `approvals/+page.svelte:1`. Highest risk: none;
  1 file, 3 lines.
- **Section 2 — Audit Log reachable: CONCERN** — every cited construct verified
  (`reportCards` filter logic is exactly as the plan claims; `isAdmin` at 94; one `<nav>` at 514).
  Two line-drift corrections applied (insert point 322 not 292; `{:else if}` at 586). Highest
  risk: `+layout.svelte` 500s every page on a compile error — `pnpm check` is the non-negotiable
  gate. Carries OWNER-DECISION-1.
- **Section 3 — rating-row key: PASS** — line 169 matches verbatim; every other keyed each in the
  file keys on a real `.id`; `ratingScaleSchema` rows are `.strict()` with only `{value,
  description}`, so minting ids really would be a schema break. Index keying is right.
- **Section 4 — Toaster ARIA: CONCERN** — lines 14-16 / 18-22 confirmed, no existing role/aria.
  Gap found and fixed: `role="status"` implies `aria-atomic="true"`, reintroducing the exact
  re-announce-everything failure the plan says it avoids. `aria-atomic="false"` added as step 9b.
- **Section 5 — approve/timesheet feedback: PASS** — `decideRequest` (105-142) ends with no
  return; `rejectMany`'s `{ saved }` shape confirmed at 178-186; both `?/decideRequest` forms
  (lines 360, 400) are on the page that renders the shared block at 192, so `form` reaches it.
  `review` (84-110) and `approved` confirmed; `timesheets/+page.svelte:74` renders `form?.saved`.
- **Section 6 — offboard feedback + dead-action delete: PASS** — the `{#if canManage &&
  employmentStatus === 'ACTIVE'}` block is at line **1783** exactly, and the plan's
  outside-the-block placement is correct. The File C keep/remove import list is right to the
  specifier: `failFromError`, `offboardEmployee`, `assertCanTouchEmployee` and `Actions` are used
  **only** by the deleted action; `load` keeps `requireAnyCapability`, `paginate`,
  `countEmployees`, `listEmployees`, `listAssignableBranches`, `listVisibleEmployeeIds`,
  `isFoodServiceOrg`, `PageServerLoad`. Highest risk: deleting a live path — mitigated by the
  verified single-hit grep plus the end-to-end re-run.
- **Section 7 — payroll periods confirm + message: PASS** — release form 183-190, void form
  197-205, error block 48-54, guard factory 19-24, server `release` 102-110 and `void` 112-120 all
  match the plan to the line. `void:` as an object key is legal and `actions.void` is callable
  from a unit test. Highest risk: losing the `{@const}`-scoped per-row guard (#108 double-submit)
  — mitigated by passing `submit={voidG.enhance}` and by the idempotency spec.
- **Section 8 — error mis-routing: CONCERN** — 21 actions confirmed and all 18 table line numbers
  exact. Two verification-gate defects found and corrected, and one unnamed regression
  (`setSupervisors` loses a *working* success banner) written into the plan. Highest risk stands
  as the plan says: a mistyped `action` string turns a working banner silent.

### Open gaps

- Sections 2, 3 and 4 have **no** fully-automated proof and cannot reach `VERIFIED` on a green
  suite alone. Residual, tracked as gap-resolution D.
- `known-gap: documented` — no DOM test environment. `vitest.config.ts` pins
  `environment: 'node'`, so none of the 193 unit files can render a component even though
  `@testing-library/svelte@5.2` and `@testing-library/jest-dom@6.6` are already devDependencies.
  A `jsdom` project (or a second vitest project scoped to `tests/component/`) would make AC-3 and
  AC-4 cheaply regression-proof. Out of scope for phase 01; phase 03/04 should pick it up.
- **Accepted regression (named):** gating the shared block on `form?.action === 'update'` removes
  the success banner `setSupervisors` currently gets from `{ success: true }` at line 433. Closed
  by phase 07.
- **Accepted partial (named):** `payroll/periods` keeps four still-silent successes (`open`,
  `import`, `generate`, `lock`) after this phase. Closed by phase 04.
- CI baseline on the current tree is unproven by this VALIDATE — see E1.

### REJECTED-ROUTED (cross-phase contract violations — not folded into this plan)

| Finding | Owning phase | Why routed |
|---|---|---|
| Narrow the audit-log nav/card gate from `MANAGE_HR` to `ADMINISTER_HR_ORGWIDE` so a branch MANAGER stops reaching the org-wide audit log | **Phase 02 / owner backlog** | This is a **server-guard alignment** decision, not a nav-only change. The umbrella's Open owner-decisions registry already carries it as "MANAGER / `ADMINISTER_HR_ORGWIDE` guard alignment (raised by 02)". Folding it into phase 01 would execute a decision phase 02 explicitly routed to the owner. |
| Rebuild `ConfirmButton` so it waits for the result and reports it | **Phase 04** | Umbrella §Shared-primitive contract: phase 04 owns the rebuild and freezes the API; phase 03 leaves it as a compile canary. A validate finding proposing an edit to it from any other phase is a contract violation, not a gap. Phase 01 only *consumes* the current primitive and closes the loop with a page banner. |
| `payroll/[id] ?/decide` success signal; Toaster pause-on-hover / stacking cap / de-dup / `(auth)` mounting; the repo-wide `{ action, error?, saved? }` contract; the 13-site raw `e.message` leak | **Phase 04** | Named in the plan's own Non-goals table and in the umbrella's phase-04 scope. |
| Per-action error slots beside each of the ~21 `employees/[id]` forms (P0-7 proper) | **Phase 07** | The plan's Scope fence. Phase 01 ships the disambiguation pattern only. |
| Dashboard "Pending Approvals" card links to `/requests` (My Requests) while counting pending *approvals* — the same defect class as P0-1, at `dashboard/+page.svelte:171`, pinned by `tests/e2e/dashboard.spec.ts:11` | **Phase 06** (surface consolidation — the four-inbox / combined-badge item) | Out of phase 01's Touchpoints. Discovered during this PVL; recorded here so it is not lost. |

### OWNER-DECISION gates (do not block EXECUTE)

**OWNER-DECISION-1 — the audit log becomes discoverable to every branch MANAGER.**
Section 2 gates the new reports card and the new sidebar row on `MANAGE_HR`, correctly mirroring
the route's own guard (`reports/audit-log/+page.server.ts:11`) per do-not-break item 1.
`src/lib/rbac.ts:26` lists `MANAGE_HR: ['MANAGER','HR_ADMIN','SUPER_ADMIN','CEO']`, and lines
30-33 of that same file say in so many words: use `ADMINISTER_HR_ORGWIDE`, **never** `MANAGE_HR`,
to decide "may reach any employee record". The audit-log query scopes on `organizationId` only —
there is no reporting-line filter. So after this phase every branch manager sees a signposted door
to the **org-wide** audit log.
This is **not** a widening: a MANAGER can already reach the page by typing the URL today, and
already sees every card on `/reports` because `canViewHrReports` is also `MANAGE_HR`. What changes
is discoverability. Masked values stay safe — reveal is gated separately on `ADMINISTER_SYSTEM`
(`audit-log/+page.server.ts:12,91`).
- Applied default: **ship as planned** (gate = `MANAGE_HR`), plus a mandatory MANAGER probe arm so
  the exposure is measured and written into the phase report rather than assumed.
- Owner's call: accept, or answer the umbrella's existing `ADMINISTER_HR_ORGWIDE` alignment
  decision — which would change the gate on both this nav row and the route guard, in phase 02.
- If unanswered: phase 01 ships the card and row on `MANAGE_HR` and phase 02 inherits the decision.

**OWNER-DECISION-2 — section 8's accepted coverage regression.**
After section 8, a failed `addLoan` renders nowhere instead of in the wrong form, **and** a
successful `setSupervisors` reports nothing at all. Phase 07 closes both. The plan already frames
the first as the intended trade; the second was unnamed until this PVL.
- Applied default: **proceed** — a silent failure is less harmful than an error attributed to the
  wrong form, and the window is bounded by phase 07.
- Owner's call: accept the temporary regression, or have phase 01 add a second gated slot for
  `setSupervisors` (a ~6-line addition to `+page.svelte`, still inside this phase's Touchpoints).
- If unanswered: proceed as planned, recorded in the phase report.

### Execute-agent instructions

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | **Run the four CI gates on the untouched tree first** — `pnpm prisma generate`, then `pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test`, in that order. VALIDATE could not run them. A red gate before the first edit is a baseline miss, not your diff. | Before section 1 |
| E2 | Confirm each cited line still reads as the plan quotes it before editing. Every line number in this plan was re-verified against the tree at `093a413` during PVL; if you are on a later commit and a target has moved, update the target and record the drift in the phase report — do **not** skip the step. | Every section entry |
| E3 | Section 2: the `{:else if}` arm goes at line **586**, immediately before the existing `{:else}`. Copy the generic arm whole — including its `{@const active = …}` (587-590) and the `<svg d={item.icon}>` + `{#if item.badge}` markup (598-616). `{@const}` must stay an immediate child of a block tag. | Section 2 entry |
| E4 | Section 6: place the offboard message **outside** the `{#if canManage && employmentStatus === 'ACTIVE'}` block at line 1783. Inside it, it can never render — the block unmounts on success. | Section 6 entry |
| E5 | Section 7: **replace** each inline `<form>` with `<ConfirmButton>`; do not wrap one around the other — ConfirmButton renders its own `<form>` (line 41). Pass `submit={voidG.enhance}` / `submit={releaseG.enhance}` explicitly; dropping it reintroduces the #108 double-submit. | Section 7 entry |
| E6 | Section 8: run **both** corrected grep gates before committing — the scoped `awk 'NR>=420' … \| grep -n "return {\|return fail(" \| grep -v "action"` gate AND the `grep -n "return failFromError"` gate. Both must be empty. Never tag the `load` returns at lines 73 and 199. | Section 8, before commit |
| E7 | Run every mutation check the plan names (revert each new `return { saved }` and the `action: 'update'` tag, confirm red). A test that passes with the fix reverted is vacuous — this repo has five recorded cases of a green suite hiding a live defect. | End of sections 5, 7, 8 |
| E8 | Never start `./start.sh`, vite, or `veent-db-5434` — ask the owner. Driving an already-running app is fine. Run all CI gates **before** the browser pass; `pnpm check` kills the dev server. | Any probe |
| E9 | Section 3's probe is only evidence with its **red control** on the pre-fix commit. A green run on the fixed build alone proves nothing. | Section 3 verification |
| E10 | Commit per section (8 commits). No `Co-Authored-By` trailer. Merges target `staging`, so `Closes #N` never fires — close any linked issue by hand. | Every section |

### Backlog artifacts

| Artifact | Location | What it tracks |
|---|---|---|
| `component-test-dom-environment_NOTE_03-09-26.md` | `process/features/ui-ux-overhaul/backlog/` | RESIDUAL-1 + RESIDUAL-2 — add a jsdom vitest project (or `tests/component/`) so the rating-row key and Toaster ARIA get automated regression cover. Deps already installed. |
| `dashboard-pending-approvals-wrong-target_NOTE_03-09-26.md` | `process/features/ui-ux-overhaul/backlog/` | The P0-1 defect class repeating at `dashboard/+page.svelte:171`; routed to phase 06. |

### What this coverage does NOT prove

- `pnpm test` (unit): every service and DB call is mocked. It does **not** prove any value reached
  Postgres, that the redirect fires over real HTTP, that a banner renders, or that `enhance` ran.
- `tests/unit/approvals-legacy-redirect.test.ts`: proves the `load` export throws a 308 to the new
  path. Does **not** prove SvelteKit serves that redirect over the wire, nor that an external
  bookmark resolves.
- `request-decide-feedback.test.ts` / `payroll-period-feedback.test.ts`: prove the action returns a
  non-empty `saved` and that the failure contract survives. Do **not** prove the page renders it,
  that it is announced, or that the right banner lit for the right action.
- `employee-detail-action-tags.test.ts` + the two greps: prove every return carries an `action` key
  and that the key equals the action name for three representative actions. Do **not** prove the
  remaining 18 tags are spelled correctly against what the template reads — only the probe does.
- `pnpm lint` + `pnpm check`: prove no orphan import and no type error after the section-6 delete.
  Do **not** prove the deleted action was unreachable — the grep plus the end-to-end offboard
  re-run is that evidence. Neither gate typechecks `prisma/**` or `scripts/**`.
- `pnpm test:e2e`: runs against a build; known-flaky (#287). Read the actual error before
  re-running — three distinct causes have hidden behind "flaky" in this repo.
- Agent probes (AC-2, AC-3, AC-4, and the probe halves of AC-5/8/9): prove one path, once, on one
  build, in one browser. They do **not** prove light/dark rendering, keyboard operability, mobile
  layout, or screen-reader behaviour in a real AT — only that the attribute or text is in the DOM.
- The MANAGER exposure arm **measures** the exposure. It does not resolve it — see
  OWNER-DECISION-1.
- Nothing here proves the CI baseline was green before the first edit — see E1.

Gate: CONDITIONAL (concerns documented and defaults applied; sections 2/3/4 rest on agent-probe
evidence with no automated gate, and two OWNER-DECISION items remain open by design)
Accepted by: session (autonomous, outer-PVL subagent run — no owner present). Concerns accepted by
name: (1) no DOM test environment, so AC-3 and AC-4 have no automated gate; (2) section 8's
accepted coverage regression, including the newly-named `setSupervisors` banner loss;
(3) `payroll/periods` keeps four still-silent successes; (4) the audit log becomes discoverable to
every branch MANAGER — surfaced as OWNER-DECISION-1 and routed to phase 02, not resolved here;
(5) the CI baseline was not run by VALIDATE and is carried as execute-agent instruction E1.

---

## Resume and Execution Handoff

1. **Selected plan file path:**
   `process/features/ui-ux-overhaul/completed/ui-ux-overhaul_03-09-26/phase-01-p0-fixes_PLAN_03-09-26.md`
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
   `process/features/ui-ux-overhaul/completed/ui-ux-overhaul_03-09-26/phase-01-p0-fixes_PLAN_03-09-26.md`.
   Pass exactly this path to EXECUTE.
7. **Supporting phase files:** none yet. No umbrella plan or sibling phase files exist in this
   task folder at plan time; phases 02–07 are named in the Non-goals table but have no plan files.
   If an umbrella plan is added later, it is context only — the execute anchor stays this file.

---

## Next Step

Plan complete. Review carefully. Say **ENTER VALIDATE MODE** when ready to proceed to plan
validation (required before implementation).
