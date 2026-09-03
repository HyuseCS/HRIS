---
name: plan:phase-06-surface-consolidation
description: "Phase 6 of the Veent HRIS UI/UX overhaul — resolve the duplicate/overlapping surfaces in audit T5 to one canonical door each: an Awaiting-you aggregator + summed nav badge, one leave-filing form, one timesheet-creation entry, and a payroll runs/periods sub-nav with explicit linking."
date: 03-09-26
feature: ui-ux-overhaul
phase: "06"
---

# Phase 6 — Surface Consolidation

**TL;DR** — Four duplicate surfaces, four sections, four commits. Add an "Awaiting you" block to
the dashboard and a summed badge on the Approvals nav group (both from data already loaded — no new
queries). Retire `/leave/new` to a redirect. Put the three timesheet doors under one entry with the
period vocabulary explained. Give payroll a tab sub-nav and say out loud how a period relates to a
run. No inbox merge, no employee-page work, no route deletions.

- **Date**: 03-09-26
- **Status**: PLANNED
- **Complexity**: COMPLEX (phase 6 of an 8-phase program; 4 sections, 4 commits, 16 source files)
- **Feature**: ui-ux-overhaul
- **Umbrella**: `ui-ux-overhaul-umbrella_PLAN_03-09-26.md`

## Overview

Audit §T5 found six duplicate or overlapping surfaces. Users meet the same job through two or three
different doors that speak different vocabularies, and no door says which one is right. This phase
resolves four of the six to one canonical door each — approvals, leave filing, timesheet creation,
and the payroll runs/periods split — by adding aggregation, redirects, cross-links and copy. The
remaining two (emergency contacts and the three overlapping edit forms on `employees/[id]`) are
deliberately deferred to phase 7, which owns that page; that deferral removes the phase's
highest-risk item, the audited career-event path.

Nothing here adds a page, a query, a dependency, or a capability. Every change is presentation,
routing, or copy over data the app already loads.

---

## Goal

Per duplicate pair in audit §T5, pick one canonical surface and redirect or link the other — without
adding a page, a query set, a dependency, or a capability.

## Scope

**In scope (4 sections):**

| Section | T5 item | Commit |
|---|---|---|
| S1 | Four approval inboxes → dashboard "Awaiting you" block + summed nav badge | `feat(dashboard): surface a combined awaiting-you block and a summed approvals badge` |
| S2 | Two leave-filing forms → `/requests` is canonical, `/leave/new` redirects | `refactor(leave): retire /leave/new to a redirect onto the canonical requests form` |
| S3 | Three timesheet-creation doors → one entry on `/timesheets`, vocabulary explained | `refactor(timesheets): put the creation doors under one entry and name their period shapes` |
| S4 | Runs ↔ periods → payroll tab sub-nav, period→run copy, `Detail`→`View run`, run-status badge helper | `feat(payroll): add the runs/periods sub-nav and explain how a period reaches its run` |

**Explicitly OUT of scope (binding):**

- **Emergency-contact consolidation and the three overlapping edit forms on `employees/[id]`**
  (T5 items 5 and 6). Phase 7 owns that page. Do not open it. This removes the phase's
  highest-risk item — the audited career-event path is not touched here at all.
- **Merging the four approval inboxes into one page.** Binding decision D3: the four pages stay.
  This phase adds a read-only aggregator and a summed badge, nothing more.
- **Renaming `/complaints`** — phase 8.
- **Retiring `/payroll/config` or `/payroll/statutory-rates` from settings.** The sub-nav is
  *additive*; both stay reachable from settings until phase 7 settles their home.
- Any schema, service-logic, or capability change.

## Entry Conditions

| Dependency | What this phase needs from it | If missing |
|---|---|---|
| Phase 2 (`nav-ia`) | The sectioned sidebar and the Approvals/Requests collapsible group. S1's badge attaches to the group header phase 2 leaves behind. | S1 blocked — do not hand-roll a group header. |
| Phase 3 (`design-system`) | `Badge`/`StatusPill` from `$lib/components/ui/`, the label maps in `$lib/labels`. | S4's badge-helper item degrades to "extract a local 4-way map"; record the deviation. |
| Phase 4 (`feedback-contract`) | `submitFeedback` on `createSubmitGuard`, the cookie flash util, the `{ action, error?, saved? }` action shape. | S2's redirect cannot carry a flash — blocked, do not invent a second flash mechanism. |

**Research-refresh (loop step 1, mandatory before any edit):** every line number in this plan is
from HEAD `5e5cdfe` and phases 1–5 will have moved them. Re-grep each anchor before editing and
record the drift in the phase report.

---

## Binding Decisions Carried From INNOVATE

**D3 — keep the four approval pages.** No inbox merge. Two additions only:
(a) a dashboard "Awaiting you" block aggregating the pending counts across
`/requests/approvals`, `/requests/timesheets`, `/requests/proposals` and `/payroll`, each row a
link; (b) a summed numeric badge on the Approvals nav group header.

**D-leave — `/leave/new` becomes a redirect, it is NOT deleted.** Justification, since the brief
asked for the smallest diff:

- The umbrella's Public Contracts section is binding: *"Every retired route keeps a redirect; none
  is deleted."* That settles it on contract grounds before diff size is even weighed.
- On diff size the two options are near-identical anyway. Both delete `+page.svelte` (128 lines) and
  both break the same four e2e specs (`back-navigation`, `employee`, `leave-balances` ×2) and the
  same unit describe block (`request-filing-role-context.test.ts:166`), because both remove the
  `?/create` action those tests drive. Deleting additionally kills a bookmarkable URL and the
  dashboard's only inbound link target; redirecting keeps both working for free.
- Verdict: **redirect**. `+page.server.ts` collapses to a single `redirect(308, …)` load;
  `+page.svelte` is deleted.

**D-timesheets — fold nothing, cross-link everything, explain the vocabulary everywhere.**
`AggregatePanel` and `NewTimesheetDialog` already live on the *same page* (`/timesheets`), so the
"three doors" are really one page with two unlabelled entries plus a third on `/attendance`. Per-door
call:

| Door | Call | Why |
|---|---|---|
| `NewTimesheetDialog` (pay period) | **Canonical.** Stays the primary "New Timesheet" button. | It already uses the kit `PeriodPicker` and the standard 1-15 / 16-EOM / whole-month shapes (#129). |
| `AggregatePanel` (week) | **Fold under the same entry.** Move it beneath the New-Timesheet button inside one titled "Create a timesheet" region with a shape-choice line. | Same page already — folding is a wrapper + heading, not a move. Deleting it would remove the only Discord-punch roll-up path. |
| `/attendance` "Save as timesheet" (any same-month range) | **Keep in place; add one-line scope copy + a cross-link to `/timesheets`.** | It is context-bound to the range the HR user is already correcting. Moving it would break the correct-then-save flow and `attendance-save-timesheet-cross-month.test.ts` / its e2e spec. One line of copy is the smaller diff and the audit's actual complaint (no guidance, no cross-links). |

**D-payroll — the sub-nav is additive.** `payroll/+layout.svelte` renders only `{@render children()}`
plus the calculator FAB; it is idle and ready to host tabs. Five tabs, capability-filtered:
Runs · Periods · Config · Statutory Rates · Calculator. Config and Statutory Rates **also** stay in
settings.

---

## Implementation Checklist

### S1 — Awaiting-you block + summed nav badge

1. In `src/routes/(app)/dashboard/+page.server.ts`, extend the returned metrics to expose the
   per-domain counts the block needs. `countPendingApprovals` is **already called** at
   `:47-53` and already returns `{ timesheets, requests, payrollRuns, proposals, total }`, and
   `:138-141` already forwards four of the five. Add `pendingProposals: pending.proposals`
   alongside them. **No new query. No new load call. No new scoping code.**
2. In `src/routes/(app)/dashboard/+page.svelte`, add an "Awaiting you" card above the existing
   quick-actions grid. Render one row per non-zero domain, each an `<a>`:
   - `{n} request{s}` → `/requests/approvals`
   - `{n} timesheet{s}` → `/requests/timesheets`
   - `{n} pay change{s}` → `/requests/proposals`
   - `{n} payroll run{s}` → `/payroll`
   Render the whole card **only when `metrics.pendingApprovals > 0`**, matching the existing
   dashboard convention at `:518-519` ("`0 pending` is noise on a card whose job is to say what
   needs doing"). Reuse the `.card` class and the phase-3 `Badge` for the counts.
3. Add a code comment on the block naming its scoping guarantee: the counts come from
   `countPendingApprovals`, whose per-domain queries are the same ones the four destination pages
   run (`listPendingRequestsForApprover`, `countActionableTimesheets`,
   `countActionablePayrollRuns`, `listActionableProposals`), and which short-circuits to all-zeros
   for anyone without `APPROVE_REQUESTS` (`approvals.ts:439-440`). **The aggregator adds no
   query and therefore cannot widen scope.**
4. In `src/routes/(app)/+layout.svelte`, add the summed badge to the Requests/Approvals group
   header using `data.pendingApprovals.total` — the field already exists on the payload
   (`approvals.ts:477`) and is already in `data`. Do not re-sum the children in the template.
5. Keep every existing per-child badge in `requestsChildren` (`+layout.svelte:294-322`) exactly as
   it is. The group badge is a summary of them, not a replacement.
6. Confirm the badge only renders when the group renders — the group is already gated on
   `canApprove`/`isManager`/`canConfirmPayChanges`/`canSignOff` per child, and a user with no
   visible children must see no badge.

### S2 — One leave-filing form

7. Replace the body of `src/routes/(app)/leave/new/+page.server.ts` with a redirect-only load:
   `redirect(308, '/requests?new=leave')`. Delete the `actions` export and every now-unused import
   (`fail`, `isHttpError`, `db`, `getLeaveBalances`, `createRequest`, `meetsLeaveTenure`,
   `requestSchema`). Add a comment naming the retirement and pointing at this plan.
8. Delete `src/routes/(app)/leave/new/+page.svelte`.
9. In `src/routes/(app)/requests/+page.svelte`, honour the preset: initialise
   `showForm` as `Boolean(submitted) || $page.url.searchParams.get('new') === 'leave'` and leave
   `selectedType`'s existing `'LEAVE'` default alone (`:34-35`). Import `page` from `$app/stores` if
   it is not already imported.
10. Restore the balance affordance the retired page carried: in
    `src/routes/(app)/requests/+page.server.ts`, add `getLeaveBalances` to the existing
    `Promise.all` at `:45` **guarded on the caller having an employee record** (the same
    `hasEmployee` condition the page already computes), coercing `allocated`/`used`/`remaining` to
    `Number` at the boundary exactly as `leave/new/+page.server.ts:33-38` did.
11. In `src/routes/(app)/requests/+page.svelte`, render `BalanceSummary` inside the form when
    `selectedType === 'LEAVE'` and balances exist. This also closes the §4 "balance display
    duplicated with different components and typography" finding.
12. Repoint the dashboard quick action at `src/routes/(app)/dashboard/+page.svelte:758` from
    `/leave/new` to `/requests?new=leave`.
13. Grep `src/` for any remaining `leave/new` reference and repoint it. Known: the comment at
    `src/lib/server/services/requests/index.ts:37` names `/leave/new` as one of three filing paths —
    update it to say two.
14. Update the tests that drove the retired action:
    - `tests/unit/request-filing-role-context.test.ts` — the `(app)/leave/new ?/create` describe
      block at `:166` and the import at `:58`. The `/requests` `?/create` action is the surviving
      choke point and already has coverage in the same file; **move the role-context assertions
      onto it rather than deleting them.** Losing that assertion is not acceptable.
    - `tests/e2e/back-navigation.spec.ts:71`, `tests/e2e/employee.spec.ts:10`,
      `tests/e2e/leave-balances.spec.ts:61,111` — repoint to `/requests?new=leave` and adjust the
      selectors to the `/requests` form. Keep one spec asserting the **redirect itself** so the
      retired door stays proven.

### S3 — One timesheet-creation entry

15. In `src/routes/(app)/timesheets/+page.svelte`, wrap the New-Timesheet button and the
    `AggregatePanel` (currently split across `:197-220`) into one `<section>` titled
    **"Create a timesheet"**, rendered when `data.canCreate || data.isHrAdmin`.
16. Add the shape-choice line under that heading, verbatim intent:
    *"Pay period (1–15, 16–end, or whole month) — use New Timesheet. One week of Discord punches —
    use Aggregate from time logs. A custom same-month range — correct it on Attendance and use Save
    as timesheet there."* Include the `/attendance` link inline.
17. Keep both existing entries' own controls untouched. `NewTimesheetDialog` keeps its
    `PeriodPicker`; `AggregatePanel` keeps its week input. **Do not unify the two period
    controls** — that is a behaviour change, not a consolidation.
18. Re-label `AggregatePanel`'s `<h2>` from "Aggregate from time logs" to
    "Aggregate from time logs — one week" so the vocabulary is on the control, not only in the
    intro copy. Update its sub-copy to name the week shape explicitly.
19. In `src/routes/(app)/attendance/+page.svelte`, at the "Save as timesheet" form (`:383-393`):
    replace the `title` attribute with visible copy — a `text-xs text-muted-foreground` line reading
    *"Saves the selected range (must be within one month) as a timesheet."* — and add an adjacent
    `<a href="/timesheets">All timesheets</a>` cross-link. Keep the `title` off the button; a
    tooltip that only appears on hover is the finding, not the fix.
20. Do not touch `?/saveTimesheet`, its cross-month guard, or
    `AggregatePanel`'s preview/commit matching logic. `attendance-save-timesheet-cross-month.test.ts`
    and `attendance-save-timesheet-custom-range.spec.ts` must pass unmodified.

### S4 — Payroll sub-nav and runs↔periods linking

21. In `src/routes/(app)/payroll/+layout.server.ts`, return the two capability booleans the tabs
    need — `canManage` and `canSignOff` are **already computed** at `:14-16`. Add them to the
    returned object on both branches of the existing `canManage ? … : …` return. Do not add a
    capability check; do not change the `error(403)` gate.
22. In `src/routes/(app)/payroll/+layout.svelte`, add a tab bar above `{@render children()}`:
    Runs (`/payroll`) · Periods (`/payroll/periods`) · Config (`/payroll/config`) · Statutory Rates
    (`/payroll/statutory-rates`) · Calculator (`/payroll/calculator`). Filter each tab on the
    capability its own route already enforces — a sign-off-only user reaches `/payroll/[id]` but not
    the list/periods pages (see the `+layout.server.ts:8-11` comment), so **do not show them Periods,
    Config, or Statutory Rates.** Mark the active tab with `aria-current="page"`, driven by
    `$page.url.pathname` (already imported at `:2`).
23. Leave the calculator FAB and the `onCalculatorPage` suppression exactly as they are.
24. In `src/routes/(app)/payroll/periods/+page.svelte`, add one line of explanatory copy under the
    page heading: *"A period is the pay window. Locking a period creates the payroll run that
    computes and approves its pay."* One sentence, no diagram.
25. In the same file at `:193`, change the row link label from `Detail` to **`View run`** and add
    `title="Opens the payroll run for this period"`. The `href` (`/payroll/{run.id}`) is unchanged.
26. Extract the run-status badge mapping into a shared helper. Source of truth is the 4-way map on
    the list page (`src/routes/(app)/payroll/+page.svelte:162-168`:
    `APPROVED→badge-green`, `COMPUTED→badge-blue`, `VOIDED→badge-red`, else `badge-gray`). Put it in
    `$lib/labels` alongside phase 3's label maps (or `$lib/utils/payroll-status.ts` if phase 3 did
    not create `$lib/labels`).
27. Replace the 2-way expression at `src/routes/(app)/payroll/[id]/+page.svelte:91`
    (`run.status === 'APPROVED' ? 'badge-green' : 'badge-blue'`) with the helper. **This is a real
    bug fix:** today a `VOIDED` or `DRAFT` run reads blue on its own detail page while the list
    shows it red/gray.
28. Replace the inline ternary on the list page (`:162-168`) with the same helper.
29. Render both through the phase-3 `Badge` primitive if it accepts a variant/class; otherwise keep
    the `badge-*` class strings and note the deviation for phase 3 to absorb.
30. Do **not** touch the period status map at `periods/+page.svelte:26-33` — that is the period
    lifecycle, a different 6-value vocabulary, and merging the two is exactly the confusion this
    section is fixing.

---

## Touchpoints

| File | Section | Change |
|---|---|---|
| `src/routes/(app)/dashboard/+page.server.ts` | S1 | expose `pendingProposals` from the existing `countPendingApprovals` result |
| `src/routes/(app)/dashboard/+page.svelte` | S1, S2 | Awaiting-you block; repoint the File Leave quick action |
| `src/routes/(app)/+layout.svelte` | S1 | summed badge on the Approvals group header (`:294-322` region) |
| `src/routes/(app)/leave/new/+page.server.ts` | S2 | collapses to a `redirect(308, …)` load |
| `src/routes/(app)/leave/new/+page.svelte` | S2 | **deleted** |
| `src/routes/(app)/requests/+page.server.ts` | S2 | add guarded `getLeaveBalances` to the existing `Promise.all` |
| `src/routes/(app)/requests/+page.svelte` | S2 | `?new=leave` preset; render `BalanceSummary` |
| `src/lib/server/services/requests/index.ts` | S2 | comment at `:37` — three filing paths becomes two |
| `src/routes/(app)/timesheets/+page.svelte` | S3 | one "Create a timesheet" region + shape-choice copy |
| `src/lib/components/timesheets/AggregatePanel.svelte` | S3 | heading and sub-copy name the week shape |
| `src/routes/(app)/attendance/+page.svelte` | S3 | visible scope copy + `/timesheets` cross-link |
| `src/routes/(app)/payroll/+layout.server.ts` | S4 | return `canManage` / `canSignOff` (already computed) |
| `src/routes/(app)/payroll/+layout.svelte` | S4 | capability-filtered tab sub-nav |
| `src/routes/(app)/payroll/periods/+page.svelte` | S4 | linking copy; `Detail` → `View run` |
| `src/routes/(app)/payroll/+page.svelte` | S4 | consume the status-badge helper |
| `src/routes/(app)/payroll/[id]/+page.svelte` | S4 | consume the status-badge helper (fixes the 2-way map) |
| `$lib/labels` (or `$lib/utils/payroll-status.ts`) | S4 | new run-status helper |
| `tests/unit/request-filing-role-context.test.ts` | S2 | move the leave/new role-context assertions onto `/requests` |
| `tests/e2e/back-navigation.spec.ts`, `employee.spec.ts`, `leave-balances.spec.ts` | S2 | repoint to `/requests?new=leave`; one spec asserts the redirect |

**Read-only (must not change):** `src/lib/rbac.ts`, `src/lib/server/rbac.ts`,
`src/lib/server/services/approvals.ts`, `src/lib/server/services/leave.ts`,
`src/lib/server/services/requests/**` (except the one comment), `prisma/schema.prisma`,
`src/routes/(app)/employees/[id]/**`.

## Public Contracts

- **URL surface.** `/leave/new` becomes a permanent (308) redirect to `/requests?new=leave`. The URL
  keeps working; no route is deleted. `/requests` gains one optional query param, `new=leave`, which
  only opens the already-existing form — it is not a filter and changes no data.
- **`payroll` layout data.** `+layout.server.ts` gains two boolean fields (`canManage`,
  `canSignOff`) on its return. Additive; existing consumers are unaffected.
- **Dashboard load data.** One additive field, `pendingProposals`.
- **Run-status badge helper.** New shared export in `$lib`. Its 4-way mapping is the contract:
  `APPROVED→green`, `COMPUTED→blue`, `VOIDED→red`, else `gray`. Phase 7 and 8 consume it; neither
  may fork it.
- **Capability table.** Unchanged. No capability added, removed, or re-scoped. Every new tab and
  every aggregator row is gated on a capability the destination route already enforces.

## Scoping Guards (named, per the constraint)

The aggregator must respect the same capability/branch scoping as each source page. It does, by
construction — it issues **no query of its own**:

| Aggregator row | Guard it inherits | Where |
|---|---|---|
| all rows | `canAny(roles, 'APPROVE_REQUESTS')` — returns all-zeros otherwise | `approvals.ts:439-440` |
| requests | `listPendingRequestsForApprover(orgId, roles, myEmployeeId, userId)` — org-scoped, with the SoD self-exclusion | `approvals.ts:461` |
| timesheets | `countActionableTimesheets(...)`, gated on `MANAGE_HR \|\| VERIFY_REQUESTS \|\| APPROVE_SIGNOFF` | `approvals.ts:455-464` |
| payroll runs | `countActionablePayrollRuns(...)`, gated on `VERIFY_REQUESTS \|\| APPROVE_FINANCE`; a finance approver is deliberately cross-org, a Verifier is org-only | `approvals.ts:465, 488-498` |
| pay-change proposals | `listActionableProposals(orgId, { actorId, roles })` | `approvals.ts:469` |
| nav group badge | `data.pendingApprovals.total`, the sum computed inside the same service | `approvals.ts:477` |

The sidebar badge and the dashboard already read this identical service, so the aggregator, the
badge and the four inboxes cannot disagree — that agreement is the existing invariant documented at
`dashboard/+page.server.ts:48-51`, and this phase extends it rather than adding a parallel path.

Payroll tab visibility inherits `payroll/+layout.server.ts:14-16`, which is itself the existing
403 gate — the tabs show strictly less than the layout already permits.

## Blast Radius

- **Files:** 16 source files changed, 1 deleted, 1 new `$lib` helper, 4 test files updated.
- **Packages:** single SvelteKit app; no workspace fan-out.
- **Risk class:** **medium.** No schema, no service logic, no capability change, and the highest-risk
  T5 item (the `employees/[id]` audited career-event forms) is explicitly deferred to phase 7. The
  two live risks are (a) the payroll tab bar showing a sign-off-only user a page their route will
  403, and (b) the `/leave/new` retirement silently losing the leave-filing role-context assertion.
  Both have named gates below.
- **Authorization-adjacent:** yes, read-only. Nav/tab visibility narrows or stays equal; nothing
  widens.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm format:check && pnpm lint && pnpm check && pnpm test` green, in that order, run at the end of **each** section not batched | Fully-Automated | Phase exit criterion: the CI gate set passes |
| `tests/unit/approval-queues.test.ts` + `approval-self-guard.test.ts` + `dashboard-org-scoping.test.ts` pass unmodified | Fully-Automated | S1 added no query and no scope: the aggregator's counts are the service's counts |
| New unit assertion: `countPendingApprovals().total` equals the sum of its four domain fields, and is `0` for a role without `APPROVE_REQUESTS` | Fully-Automated | D3: "the combined count matches the sum of the four inboxes" |
| `tests/unit/request-filing-role-context.test.ts` — the leave role-context assertions now run against `/requests ?/create` and still pass | Fully-Automated | S2 retired a door without retiring its guard |
| New e2e assertion: `GET /leave/new` responds 308 to `/requests?new=leave`, and the landing page has the leave form open | Fully-Automated | S2: the retired door redirects to the canonical one |
| `attendance-save-timesheet-cross-month.test.ts` + `attendance-save-timesheet-custom-range.spec.ts` pass **unmodified** | Fully-Automated | S3 changed copy only; the same-month guard and the save path are untouched |
| `payroll-run-void-action.test.ts`, `payroll-period-actors.test.ts`, `pay-periods.test.ts` pass unmodified | Fully-Automated | S4 changed presentation only; no lifecycle behaviour moved |
| New unit test on the run-status helper: all four statuses map to the list page's original classes | Fully-Automated | S4: the detail page now agrees with the list (the VOIDED-reads-blue bug) |
| Playwright suite no worse than the pre-phase baseline (record the baseline first — #287) | Fully-Automated | Route and nav changes broke no working flow |
| Role walk in the running app as HR_ADMIN, MANAGER, a sign-off-only user, and a plain employee: every payroll tab shown resolves without a 403; every aggregator row shown resolves; MANAGER reaches nothing new | Hybrid (needs running app + seeded roles) | Hard safety constraint: nav narrows, never widens |
| Live walk of each consolidated flow: file leave from the dashboard link; create a timesheet by each of the three doors; open a period's run via **View run**; watch the badge and the Awaiting-you counts move after one approval | Agent-Probe | Exit criterion: each retired door reaches the canonical one and the counts stay honest |
| Light **and** dark mode check of the Awaiting-you block, the group badge, the payroll tabs and both run-status badges | Agent-Probe | Phase 3's light/dark pairing survived the new surfaces |
| `impeccable` audit pass over the four changed surfaces | Agent-Probe | Design-quality bar the CI gates cannot express |
| Masked-reveal regression: mask holds, reveal once, audit row written | Hybrid (needs running app + DB) | Program do-not-break item 3 survived phase 6 |

**Vacuous-green note:** no developed behaviour in this phase is left on Known-Gap. The two items
that cannot be proven automatically — the cross-role tab/aggregator walk and the visual pass — are
assigned **Hybrid** and **Agent-Probe**, not Known-Gap, and both are exit-blocking.

**Mutation checks (required, per `process/context/tests/all-tests.md`):**

1. Break the `APPROVE_REQUESTS` short-circuit in `countPendingApprovals` and confirm the new
   sum/zero assertion goes red. If it stays green the assertion is vacuous.
2. Flip one arm of the run-status helper (e.g. `VOIDED→green`) and confirm the new helper test goes
   red.
3. Point the `/leave/new` redirect at the wrong path and confirm the new e2e redirect assertion
   goes red.

## Test Infra Improvement Notes

(none identified yet)

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| A payroll tab is shown to a sign-off-only user whose destination 403s — reintroducing the "shown but 403s" bug class the program forbids (do-not-break item 1) | Filter each tab on the capability its own route enforces, read from `+layout.server.ts`'s already-computed booleans. Prove it in the role walk, per role, before the section is committed. |
| Retiring `/leave/new` silently drops its role-context coverage | Checklist item 14 **moves** the assertions onto `/requests ?/create`; deleting them is called out as unacceptable. |
| Adding `getLeaveBalances` to `/requests` slows a page every employee loads | It joins the existing `Promise.all`, and is guarded on the caller having an employee record. If the load regresses noticeably in the live walk, drop item 11 and record it — the balance card is the least load-bearing item in the phase. |
| The Awaiting-you block and the four inboxes disagree | Structurally impossible while both read `countPendingApprovals`. The gate is: never compute a count in the dashboard template. |
| Phase 3 did not ship `$lib/labels` | Fall back to `$lib/utils/payroll-status.ts` and note the deviation for phase 3 to absorb. Do not fork a Badge. |
| Line anchors in this plan have drifted after phases 1–5 | Loop step 1 re-grep is mandatory; drift is recorded in the phase report before any edit. |

## Rollback

Each section is one commit with no schema or service change, so `git revert` of a single section
commit is a complete rollback. S2 is the only section that deletes a file; reverting restores it.
Nothing in this phase writes data, so there is no state to unwind.

## Exit Criteria

1. All four section commits landed, each with its own green gate run.
2. Full CI gate set green on the branch, in CI order.
3. `impeccable` audit pass.
4. Live walk of all four consolidated flows completed, across the four roles, in both themes.
5. Playwright suite no worse than the recorded baseline.
6. `phase-06-surface-consolidation_REPORT_{date}.md` written FLAT in this folder, including the
   research-refresh drift log, the mutation-check results, and a Forward Preview for phase 7 naming
   what `employees/[id]` still owes (the emergency-contact triplication and the three overlapping
   edit forms, both deliberately untouched here).
7. Blast-radius claim appended to `phase-blast-radius-registry.md`.


## Acceptance Criteria

1. The dashboard shows an "Awaiting you" block whose per-domain counts equal the four inbox pages'
   own counts, and whose total equals the Approvals nav group badge. The block is absent when the
   total is zero.
2. A user without `APPROVE_REQUESTS` sees no aggregator block and no group badge.
3. `GET /leave/new` returns 308 to `/requests?new=leave`, and that page opens with the leave form
   expanded. `src/routes/(app)/leave/new/+page.svelte` no longer exists.
4. The leave-filing role-context assertions still run — against `/requests ?/create`.
5. `/timesheets` presents both creation entries under one "Create a timesheet" heading that names
   all three period shapes (pay period / week / same-month range) and links to `/attendance`.
6. `/attendance`'s "Save as timesheet" carries visible scope copy and a `/timesheets` cross-link;
   its cross-month guard and save path are byte-for-byte unchanged.
7. Every payroll page shows a capability-filtered tab bar (Runs · Periods · Config · Statutory
   Rates · Calculator) with `aria-current` on the active tab, and every tab shown resolves without a
   403 for the role seeing it. Config and Statutory Rates remain reachable from settings.
8. `/payroll/periods` explains in one sentence how a period reaches its run, and its row link reads
   **View run**.
9. A `VOIDED` run's badge is red on both the list and the detail page, from one shared helper.
10. No file under `src/routes/(app)/employees/[id]/`, `src/lib/rbac.ts`, `src/lib/server/rbac.ts`,
    `src/lib/server/services/approvals.ts`, or `prisma/schema.prisma` is modified.
11. The full CI gate set is green, in CI order, at the end of every section.

## Phase Completion Rules

- A section is **CODE DONE** when its checklist items are implemented and its own gate run is green.
- A section is **VERIFIED** only when its rows in Verification Evidence have run and passed,
  including the Hybrid role walk and the Agent-Probe live walk for the surfaces it changed.
- The phase is **VERIFIED** only when all four sections are VERIFIED, the mutation checks have been
  run and went red as predicted, the phase report is written, and the blast-radius claim is
  appended. Green gates alone are CODE DONE, never VERIFIED.
- A section that cannot pass its role walk is **BLOCKED**, not partially done. Do not proceed to the
  next section on a red role walk — nav visibility is the program's hard safety constraint.

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-06-surface-consolidation_PLAN_03-09-26.md`
2. **Last completed phase or step:** plan written. No code changed. Phases 1–5 not yet executed.
3. **Validate-contract status:** pending — PVL has not run on this phase plan.
4. **Supporting context files loaded:** `process/context/all-context.md`,
   `process/context/planning/all-planning.md`, `process/context/tests/all-tests.md`,
   `process/context/uxui/all-uxui.md`, `docs/ui-ux-audit-2026-09-03.md` (§T5, §T6, §4, §5),
   `ui-ux-overhaul-umbrella_PLAN_03-09-26.md`.
5. **Next step for a fresh agent:** do **not** start here — phase 6 requires phases 2, 3 and 4
   complete. When they are, run loop step 1 (research-refresh: re-grep every line anchor in the
   Touchpoints table and record drift), then PVL, then execute S1 → S2 → S3 → S4 in order, gating
   and committing after each.

6. **Primary execute anchor:** this file. EXECUTE receives this exact path and no other.
7. **Supporting phase files:** `ui-ux-overhaul-umbrella_PLAN_03-09-26.md` (program constraints and
   the do-not-break list) and the phase 2, 3 and 4 plans/reports for the primitives this phase
   consumes. These are context, not execution targets.

---

Plan complete. Review carefully. Say **'ENTER VALIDATE MODE'** when ready to proceed to plan
validation (required before implementation).
