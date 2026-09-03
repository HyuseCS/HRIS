---
name: report:ui-ux-overhaul-phase-blast-radius-registry
description: "Append-only blast-radius claim registry for the 8-phase Veent HRIS UI/UX overhaul program. One section per phase, created at first execution, never overwritten."
date: 03-09-26
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: program
---

# Phase Blast-Radius Registry — `ui-ux-overhaul`

Append-only. One `## Phase N` section per phase. Nobody overwrites an earlier section.
Overlap is expected (phases 3-8 all touch `src/lib/components/ui/` and
`src/routes/(app)/employees/[id]/`); this file makes the overlap visible and sequenced, it does
not prevent it.

Status vocabulary: *(no status)* / `BLOCKED-skipped` / `DONE` / `SUPERSEDED`.

---

## Phase 5 — `destructive-actions`

**Plan:** `phase-05-destructive-actions_PLAN_03-09-26.md`
**Claimed:** 03-09-26

**Files claimed (9 `.svelte` + 1 new test file):**

| File | Sites |
|---|---|
| `src/routes/(app)/employees/[id]/+page.svelte` | 1 |
| `src/routes/(app)/payroll/periods/+page.svelte` | 2, 3 |
| `src/routes/(app)/payroll/[id]/+page.svelte` | 5 |
| `src/routes/(app)/payroll/config/+page.svelte` | 6 |
| `src/routes/(app)/payroll/statutory-rates/+page.svelte` | 7, 8, 9, 10 |
| `src/routes/(app)/performance/reviews/[id]/+page.svelte` | 11 |
| `src/routes/(app)/settings/roles/+page.svelte` | 12 |
| `src/routes/(app)/separations/[id]/+page.svelte` | 13, 14 |
| `src/routes/(app)/attendance/+page.svelte` | 15 (renders twice — concern C1) |
| `tests/unit/destructive-confirms.test.ts` | new — gates G1/G2/G3 |

**Read-only (verified, not edited):** `src/routes/(app)/payroll/+page.svelte` (site 4),
`src/routes/(app)/requests/approvals/+page.svelte` (site 16),
`src/lib/components/ui/ConfirmButton.svelte`, `ConfirmDialog.svelte`, `ReasonDialog.svelte`,
`src/routes/(app)/performance/templates/[id]/+page.svelte`,
`src/lib/utils/submit-guard.svelte.ts`.

**Out of bounds:** `prisma/schema.prisma`, every `+page.server.ts`, `src/lib/server/**`,
`src/lib/rbac.ts`, `src/app.css`, `src/lib/components/ui/**` (phase 03 owns it).

**Overlap notices for later phases:**

- **Phase 07 (`page-splits`)** splits `src/routes/(app)/employees/[id]/+page.svelte` and
  `src/routes/(app)/attendance/+page.svelte`. Both files have forms **moved into confirm
  wrappers** by this phase — the offboard form (employees) and both attendance-reset render
  sites. Phase 07 must carry the wrapper, not just the form.
- **Phase 06 (`surface-consolidation`)** touches `src/routes/(app)/separations/[id]/+page.svelte`
  and `src/routes/(app)/payroll/config/+page.svelte`; this phase changes their submit paths from
  native `confirm()` / bare submit to dialog-gated submits.
- **Phase 08 (`copy-a11y`)** owns the payroll-config success-banner copy defect
  (§4 Payroll) and the period `?/lock` "Override note (if flagged)" copy — this phase
  deliberately leaves both alone.

**Additional file touched beyond the claim (authorized amendment):**
`src/lib/components/ui/ConfirmDialog.svelte` — one line, `whitespace-pre-line` added to the
message `<p>` so `\n` in a confirm message renders as a line break. Authorized by the
orchestrator as a **phase 03 amendment**, committed alone as `3c7c08e`. This is the single
exception to the "out of bounds: `src/lib/components/ui/**`" rule above; nothing else in that
directory was touched.

**Status:** DONE (CODE DONE, not ✅ VERIFIED) — sections 0-3 executed 03-09-26 (sites 2, 3,
4-verify, 5, 6); sections 4-7 executed 03-09-26 (sites 1, 7-16 and
`tests/unit/destructive-confirms.test.ts`). CI gate set green; the owner's live P1 matrix is the
only gate left. See `phase-05-destructive-actions_REPORT_03-09-26.md`.

---

## Phase 06 — `surface-consolidation`

**Claim date:** 03-09-26 · **Branch:** `feat/uiux-phase-6` · **Commits:** `c9f77c6` (S1),
`9b5eb74` (S2), `c437b53` (S3), `1efdfcd` (S4)

| File | Section |
|---|---|
| `src/routes/(app)/dashboard/+page.server.ts` | S1 — `pendingProposals` forwarded |
| `src/routes/(app)/dashboard/+page.svelte` | S1, S2 — Awaiting-you card; File Leave quick action repointed |
| `src/routes/(app)/leave/new/+page.server.ts` | S2 — collapsed to a `redirect(308, '/requests?new=leave')` load |
| `src/routes/(app)/leave/new/+page.svelte` | S2 — **deleted** |
| `src/routes/(app)/requests/+page.server.ts` | S2 — guarded `getLeaveBalances` |
| `src/routes/(app)/requests/+page.svelte` | S2 — `?new=leave` preset; `BalanceSummary` |
| `src/lib/server/services/requests/index.ts` | S2 — one comment (three filing paths → two) |
| `src/routes/(app)/timesheets/+page.svelte` | S3 — one "Create a timesheet" section |
| `src/lib/components/timesheets/AggregatePanel.svelte` | S3 — heading + sub-copy name the week shape |
| `src/routes/(app)/attendance/+page.svelte` | S3 — visible scope copy + `/timesheets` cross-link |
| `src/lib/payroll-tabs.ts` | S4 — **new**; the four tab predicates + the tab-list builder |
| `src/routes/(app)/payroll/+layout.server.ts` | S4 — returns the four booleans on both branches |
| `src/routes/(app)/payroll/+layout.svelte` | S4 — capability-filtered tab bar |
| `src/routes/(app)/payroll/periods/+page.svelte` | S4 — period→run copy; `Detail` → `View run` |
| `tests/unit/approval-queues.test.ts` | S1 — sum/zero assertions |
| `tests/unit/leave-new-redirect.test.ts` | S2 — **new** |
| `tests/unit/request-filing-role-context.test.ts` | S2 — role-context assertions moved onto `/requests ?/create` |
| `tests/e2e/back-navigation.spec.ts`, `employee.spec.ts`, `leave-balances.spec.ts` | S2 — repointed |
| `tests/unit/payroll-tabs-capability.test.ts` | S4 — **new** |
| `tests/unit/payroll-status-badge.test.ts` | S4 — **new** |
| `tests/unit/nav-sections.test.ts` | S4 — canary fixture pointer only (see the overlap notice) |

**Read-only (verified, not edited):** `src/lib/nav.ts` (phase 02's summed badge — verified at
`(app)/+layout.svelte:386-393`, no S1 nav change needed), `src/routes/(app)/payroll/+page.svelte`,
`src/routes/(app)/payroll/[id]/+page.svelte` (phase 03 already routed both through `Badge`),
`src/lib/components/ui/badge.ts`, `src/lib/labels.ts`,
`src/routes/(app)/payroll/periods/+page.svelte:26-33` (the 6-value period status map).

**Out of bounds (untouched):** `src/routes/(app)/employees/[id]/**`, `src/lib/rbac.ts`,
`src/lib/server/rbac.ts`, `src/lib/server/services/approvals.ts`,
`src/lib/server/services/leave.ts`, `src/lib/server/services/requests/**` (except the one comment),
`prisma/schema.prisma`.

**Amendment beyond the plan's Touchpoints:** `tests/unit/nav-sections.test.ts` — the `/payroll`
fixture's `file` pointer follows the four predicates into `src/lib/payroll-tabs.ts`. The capability
list and every assertion are unchanged; only the file the staleness canary reads moved. Rationale
in the phase report, deviation D-2.

**Overlap notices for later phases:**

- **Phase 07 (`page-splits`)** splits `src/routes/(app)/attendance/+page.svelte`, which this phase
  edited (the Save-as-timesheet scope copy and the `/timesheets` cross-link, just below the bulk
  action row). Carry the copy, not just the form. `src/routes/(app)/employees/[id]/**` was **not
  opened** by this phase — the emergency-contact triplication and the three overlapping edit forms
  are intact and still owed.
- **Phases 07 and 08** consume the run-status contract from `$lib/components/ui/badge.ts` and the
  tab predicates from `$lib/payroll-tabs.ts`. Neither may fork either; both are pinned by unit
  gates that will fail on a page-local copy.

**Status:** DONE (CODE DONE, not VERIFIED) — S1/S2 executed 03-09-26 by a prior agent, S3/S4
executed 03-09-26. Full CI gate set green in CI order after each section; all four mutation checks
went red as predicted. The owner's role walk, live walk, both-theme pass, `impeccable` audit,
masked-reveal regression and the Playwright baseline are the gates left. See
`phase-06-surface-consolidation_REPORT_03-09-26.md`.
