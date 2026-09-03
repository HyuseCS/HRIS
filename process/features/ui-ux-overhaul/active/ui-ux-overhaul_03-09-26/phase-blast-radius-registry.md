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

---

## Phase 7 — `page-splits`

**Plan:** `phase-07-page-splits_PLAN_03-09-26.md`
**Claimed:** 03-09-26 (transcribed from the plan's Touchpoints by the S6/S7 agent, as the plan's
blast-radius note instructed) · **Branch:** `feat/uiux-phase-7`
**Commits:** `96a05ab` `a763df7` `6adf133` `f30c22b` (S1-S4) · `d11219e` `ee37138` (S5) ·
`621685d` (S6) · `a7b76ae` (S7)

**Files modified**

| File | Section |
|---|---|
| `src/routes/(app)/employees/[id]/+page.svelte` | S1-S4 — five URL-backed tabs, scoped feedback, one emergency-contact surface, checkbox supervisors, per-employee reveal cache, danger zone |
| `src/routes/(app)/employees/[id]/+page.server.ts` | S2 — SC-1 (`action:` key on every action result) |
| `src/routes/(app)/attendance/+page.svelte` | S5 — persona split, bulk-bar grouping, CSV disclosure, sticky Save column |
| `src/routes/(app)/settings/+page.svelte` | S6 — grouped hub rendered from the shared array |
| `src/routes/(app)/settings/+page.server.ts` | S6 — SC-3 (four orphaned flags deleted; `MANAGE_HR` guard kept) |
| `src/routes/(app)/settings/org/+page.svelte` | S7 — search + only-unassigned filter on the assignment wall |
| `src/routes/(app)/employees/new/+page.svelte` | S7 — Required-to-hire / Complete-later grouping |
| `src/routes/(app)/+layout.svelte` | S6 — **Settings children only** (source swapped to `visibleSettings().filter(inSidebar)`; two orphaned derives removed) |
| `src/routes/(app)/separations/+page.svelte`, `+page.server.ts` | S7 — SC-4 pagination (20) + `overflow-x-auto` wrapper |
| `src/routes/(app)/inventory/+page.svelte`, `+page.server.ts` | S7 — SC-4 pagination (20) |
| `src/routes/(app)/complaints/+page.svelte`, `+page.server.ts` | S7 — SC-4 pagination, **employee branch only** (`myPage`, 10) |
| `tests/unit/settings-cards.test.ts` | S6 — rewritten onto `visibleSettings`, longhand per-role href lists |
| `tests/e2e/settings-visibility.spec.ts` | S6 — canonical label + landmark-scoped positive locators |
| `tests/unit/destructive-confirms.test.ts` | S5 — pointer follow-through after the attendance extraction |

**Files created**

`src/lib/settings-destinations.ts` · `src/routes/(app)/settings/+layout.svelte` ·
`src/lib/components/employees/EmployeeTabs.svelte` ·
`src/lib/components/employees/employee-tabs.ts` ·
`src/lib/components/attendance/AttendanceSelfView.svelte` ·
`src/lib/components/attendance/AttendanceHrGrid.svelte` ·
`src/lib/components/attendance/Icon.svelte` · `src/lib/components/attendance/shared.ts` ·
`tests/unit/settings-destinations.test.ts` · `tests/unit/employee-tab-resolve.test.ts`

**Read-only (verified, not edited):** `src/lib/rbac.ts`, `src/lib/components/Pagination.svelte`,
`src/lib/server/pagination.ts`, `src/lib/components/ui/**`, `docs/ui-ux-audit-2026-09-03.md`.

**Out of bounds (verified untouched — `git diff --name-only` over the whole phase):**
`src/lib/rbac.ts`, `prisma/schema.prisma`, `src/lib/server/services/**`,
`src/lib/components/ui/**`.

**Overlap notices for later phases:**

- **Phase 08 (`copy-a11y`)** inherits the final structure. Item 34 (the onboarding manual-step
  control) is **already compliant** — S4 replaced the 16px glyph with a real `<button>` carrying
  `aria-label="Mark {step} complete"`; skip it. Three new attendance components
  (`AttendanceSelfView`, `AttendanceHrGrid`, `shared.ts`) and two new settings surfaces
  (`settings/+layout.svelte`, the regrouped hub) are new copy/a11y surface that did not exist when
  the audit was written.
- **Any later phase adding a settings page** adds ONE entry to `src/lib/settings-destinations.ts`.
  Do not add a card, a sub-nav row or a sidebar row by hand — that is the bug this array closed.
  Changing a label there changes it on all three surfaces at once, and
  `tests/e2e/settings-visibility.spec.ts` asserts on those labels.

**Status:** DONE (CODE DONE, not VERIFIED) — all seven sections executed and committed 03-09-26;
full CI gate set green in CI order. The live gates (G5-G8, G10-G14, the five-role settings walk,
the `impeccable` audit and the Playwright baseline) are the owner's and are still unrun. See
`phase-07-page-splits-s1-s4_REPORT_03-09-26.md`, `phase-07-page-splits-s5_REPORT_03-09-26.md` and
`phase-07-page-splits-s6-s7_REPORT_03-09-26.md`.

---

## Phase 8 — `copy-a11y`

**Plan:** `phase-08-copy-a11y_PLAN_03-09-26.md`
**Claimed:** 03-09-26 (transcribed from the plan's Touchpoints) · **Branch:** `feat/uiux-phase-8`
**Commits:** `f8fa640` (S1) · `c70f89c` (S2) · `0c5abd1` (S3) — sections S1-S3, first agent ·
`9533da0` (S4) · `0c47b8c` (S5) · `3639694` (S6) — sections S4-S6, second agent

**Files created**

`src/routes/(app)/inquiries/**` (4 files, moved from `complaints/`) ·
`src/routes/(app)/complaints/+page.server.ts` · `src/routes/(app)/complaints/+page.svelte` ·
`src/routes/(app)/complaints/[id]/+page.server.ts` · `src/routes/(app)/complaints/[id]/+page.svelte`
(four 308-redirect stubs) · `src/lib/actions/scrollToError.ts` ·
`tests/unit/copy-invariants.test.ts` · `tests/unit/a11y-invariants.test.ts`

**Files modified**

`src/routes/(app)/+layout.svelte` · `src/routes/(app)/team/+page.svelte` ·
`src/routes/(app)/team/+page.server.ts` · `src/routes/(app)/branches/+page.svelte` ·
`src/routes/(app)/employees/+page.svelte` · `src/routes/(app)/employees/[id]/+page.svelte` ·
`src/routes/(app)/requests/+page.svelte` · `src/routes/(app)/requests/[id]/+page.svelte` ·
`src/routes/(app)/requests/approvals/+page.svelte` ·
`src/routes/(app)/requests/approvals/+page.server.ts` · `src/routes/(app)/leave/+page.svelte` ·
`src/routes/(app)/leave/balances/+page.svelte` · `src/routes/(app)/recruitment/+page.svelte` ·
`src/routes/(app)/recruitment/+page.server.ts` ·
`src/routes/(app)/recruitment/[id]/apply/+page.svelte` ·
`src/routes/(app)/timesheets/+page.svelte` · `src/routes/(app)/separations/+page.svelte` ·
`src/routes/(app)/separations/[id]/+page.svelte` · `src/routes/(app)/performance/+page.svelte` ·
`src/routes/(app)/performance/templates/[id]/+page.svelte` ·
`src/routes/(app)/payroll/+page.svelte` · `src/routes/(app)/payroll/+page.server.ts` ·
`src/routes/(app)/payroll/[id]/+page.server.ts` · `src/routes/(app)/payroll/config/+page.svelte` ·
`src/routes/(app)/payroll/config/+page.server.ts` ·
`src/routes/(app)/payroll/calculator/+page.server.ts` ·
`src/routes/(app)/payroll/statutory-rates/+page.svelte` ·
`src/routes/(app)/attendance/+page.svelte` · `src/routes/(app)/attendance/+page.server.ts` ·
`src/routes/(app)/reports/[type]/+page.svelte` ·
`src/routes/(app)/reports/audit-log/+page.svelte` · `src/routes/(app)/settings/roles/+page.svelte` ·
`src/routes/(app)/settings/schedules/+page.svelte` ·
`src/routes/(app)/settings/holidays/+page.server.ts` ·
`src/routes/(app)/settings/posting-approvers/+page.server.ts` ·
`src/routes/(app)/departments/+page.server.ts` · `src/routes/(app)/benefits/+page.server.ts` ·
`src/routes/(app)/dashboard/+page.server.ts` · `src/routes/(auth)/login/+page.svelte` ·
`src/routes/(auth)/login/+page.server.ts` (comment only) · `src/lib/labels.ts` · `src/lib/nav.ts` ·
`src/lib/server/services/complaints/index.ts` (notification link targets only — the four
`/complaints/{id}` URL literals became `/inquiries/{id}`; no logic, no data key) ·
`tests/unit/labels.test.ts` · `tests/unit/complaints.test.ts` ·
`tests/unit/complaints-scoping.test.ts` · `tests/unit/nav-sections.test.ts` ·
`tests/e2e/branches.spec.ts` · `tests/e2e/tenancy-switch.spec.ts`

**Read-only (verified, not edited):** `prisma/schema.prisma`, `src/lib/rbac.ts`,
`src/lib/components/ui/**`, `src/lib/server/services/**` (except the URL literals noted above),
`src/routes/(app)/punch/+page.svelte` (its `role="status"`/`role="alert"` split is the model —
`git diff` over the phase touches it zero times), `docs/ui-ux-audit-2026-09-03.md`.

**Out of bounds (verified untouched — `git diff --name-only` over the whole phase):**
`prisma/schema.prisma`, `src/lib/rbac.ts`, `package.json`, `src/app.css`, `static/*`,
`src/lib/components/ui/**`.

**Corrections issued to earlier phases' registry claims:**

- **Phase 07's entry is wrong about item 34.** It states the onboarding manual-step control was
  "already compliant — S4 replaced the 16px glyph with a real `<button>` carrying
  `aria-label="Mark {step} complete"`". No such string exists in
  `employees/[id]/+page.svelte`; the control was still `h-4 w-4` (16px) with
  `aria-label="{step.done ? 'Uncheck' : 'Check'} {step.label}"`. Phase 08 built it (raised to
  `h-6 w-6`). **Lesson for future registry entries:** an "already done" claim should cite a
  grep-able string, and the consuming phase should grep it before skipping.

**Notes for anyone after this phase:**

- No `<tr>` in `src/` may carry `role="link"` — `tests/unit/a11y-invariants.test.ts` enforces it
  repo-wide, with a self-check that the scan can still see one.
- The org switcher in `(app)/+layout.svelte` is a native `<select>` labelled
  **"Active organization"** (not "Organization" — phase 02's nav has a section group of that name
  and the collision is a real ambiguity *and* a Playwright strict-mode failure). `orgMenuOpen` no
  longer exists.
- `src/lib/actions/scrollToError.ts` is the one error-scroll mechanism. Put it on the element that
  renders the error; it sets `tabindex="-1"` on the node for you and skips smooth scrolling under
  `prefers-reduced-motion`.
- The drawer focus trap in `(app)/+layout.svelte` is a deliberate copy of `Dialog.svelte`'s —
  see `backlog/drawer-focus-trap-duplicates-dialog_NOTE_03-09-26.md`.
- `/complaints` is four redirect stubs; `/inquiries` is the real route. Never write `/complaints`
  as a URL — `tests/unit/copy-invariants.test.ts` fails on it. The module path, Prisma models and
  audit entity names still say *complaint*; those are data keys.

**Status:** DONE (CODE DONE, not VERIFIED) — all six sections executed and committed 03-09-26; full
CI gate set green in CI order; ten S4 specs green against a recorded pre-phase baseline (31/31 both
sides); 42/42 on a 14-spec final sweep. Every Agent-Probe row (keyboard walk, 10-item screen-reader
list, live brand check, `impeccable` audit) is the owner's and is unrun. Both OWNER-DECISION items
remain OPEN and neither was built. See `phase-08-copy-a11y-s1-s3_REPORT_03-09-26.md` and
`phase-08-copy-a11y-s4-s6_REPORT_03-09-26.md`.

**PROGRAMME STATUS: all 8 phases CODE DONE.** The owner's test pass is the only remaining gate —
the consolidated list is the PROGRAM CLOSE section of
`phase-08-copy-a11y-s4-s6_REPORT_03-09-26.md`.

---

## Phase 9 — `login-email-first`

**Plan:** `phase-09-login-email-first_PLAN_03-09-26.md`
**Claimed:** 04-09-26

**Files claimed (2 source + 7 test + 3 process):**

| File | Change |
|---|---|
| `src/routes/(auth)/login/+page.server.ts` | `load` loses the org query; `loginSchema` → `resolveSchema` + `signinSchema`; `actions.default` → `actions.resolve` + `actions.signin`; new `resolveLoginOrgs` helper; `GENERIC` constant |
| `src/routes/(auth)/login/+page.svelte` | tenant-button step 1 → email step 1; client `selectedOrg` state deleted; step derived from `form`; radio picker; `<a href="/login">Change</a>`; password focus effect |
| `tests/unit/login-audit.test.ts` | entry point `actions.default` → `actions.signin`; mock shape extended |
| `tests/unit/login-resolution.test.ts` | **new** — U1-U4 + U6 (AC8b) |
| `tests/unit/copy-invariants.test.ts` | Avipa Amendments 1 + 2; new G1 (narrowed per E2) + G2 assertions |
| `tests/e2e/helpers.ts` | `login()` rewritten; `selectTenant` deleted |
| `tests/e2e/global-setup.ts` | browser warmup matches the new first interactive element |
| `tests/e2e/auth.spec.ts` | two rewrites, one deletion, four new specs |
| `tests/e2e/leave-balances.spec.ts` | stale `selectTenant` comment at `:99` only |
| `backlog/login-email-first-tenant-privacy_NOTE_03-09-26.md` | Status + option-D follow-on |
| `backlog/login-timing-parity_NOTE_03-09-26.md` | **new** — D1-D5 |
| `ui-ux-overhaul-umbrella_PLAN_03-09-26.md` | 8 → 9 phases |

**Overlap with earlier phases:** only `tests/unit/copy-invariants.test.ts` (phase 08's file, phase 08
already CODE DONE). Phases 01-08 never touched `(auth)/login/+page.server.ts` beyond one comment.
This phase is explicitly authorised to cross phase 08's AC5/AC20 boundary — that check pinned the
*absence* of this change and was correct for phase 08.

**Notes for anyone after this phase:**

- `POST /login` with no action name no longer exists. Use `?/resolve` (email only) or `?/signin`
  (email + password + optional `selectedOrg`).
- `?/resolve` has exactly ONE response shape forever: `{ email, orgs }`, with `orgs` populated only
  when the resolved membership set is ≥ 2. It never returns `fail()`. Unknown, malformed, inactive,
  zero-org and single-org emails are byte-identical. `tests/unit/login-resolution.test.ts` U1/U6
  pins it.
- The step-2 heading must stay generic (`Enter your password`). Naming the resolved org would make
  single-org distinguishable from zero-org. `copy-invariants` G2 pins it.
- `src/` is now Avipa-free with NO exceptions — the one allowed survivor went with `loginSchema`.

**Status:** DONE
