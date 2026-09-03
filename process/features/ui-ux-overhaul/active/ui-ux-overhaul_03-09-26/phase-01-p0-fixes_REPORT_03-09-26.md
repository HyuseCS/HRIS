---
name: report:ui-ux-overhaul-phase-01-p0-fixes
description: "EXECUTE report for phase 01 — all 8 P0 sections implemented, 8 commits, CI green; every browser probe deferred to the owner"
phase: phase-01-p0-fixes
date: 03-09-26
status: COMPLETE_WITH_GAPS
feature: ui-ux-overhaul
plan: process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-01-p0-fixes_PLAN_03-09-26.md
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: "01"
---

# Phase 01 — P0 Showstoppers — EXECUTE report

Branch: `feat/uiux-phase-1-2`. 8 sections, 8 commits, no push.

Every section closes as **CODE DONE**, never `VERIFIED`: all agent probes, all `pnpm test:e2e`
runs, and the whole Manual Verification Checklist were deferred by the operator, so nothing here
was seen in a browser or against a database.

---

## What Was Done

| § | Commit | Files changed | Result |
|---|---|---|---|
| 1 | `9bf68d6` | `(app)/approvals/+page.server.ts`, `(app)/approvals/+page.svelte`, `tests/unit/approvals-legacy-redirect.test.ts` (new) | CODE DONE |
| 2 | `04d79a3` | `(app)/+layout.svelte`, `(app)/reports/+page.svelte` | CODE DONE |
| 3 | `3ea5504` | `lib/components/performance/ReviewFormRender.svelte` | CODE DONE |
| 4 | `b3ffc73` | `lib/components/ui/Toaster.svelte` | CODE DONE |
| 5 | `e77f45f` | `(app)/requests/approvals/+page.server.ts`, `(app)/requests/timesheets/+page.server.ts`, `tests/unit/request-decide-feedback.test.ts` (new) | CODE DONE |
| 6 | `599ea47` | `(app)/employees/+page.server.ts`, `(app)/employees/[id]/+page.server.ts`, `(app)/employees/[id]/+page.svelte` | CODE DONE |
| 7 | `8b7bd8c` | `(app)/payroll/periods/+page.svelte`, `(app)/payroll/periods/+page.server.ts`, `tests/unit/payroll-period-feedback.test.ts` (new) | CODE DONE |
| 8 | `5788670` | `(app)/employees/[id]/+page.server.ts`, `(app)/employees/[id]/+page.svelte`, `tests/unit/employee-detail-action-tags.test.ts` (new) | CODE DONE — partial by design |

12 source files + 4 new unit test files. No file outside the plan's Touchpoints table was
touched. `src/lib/rbac.ts`, `prisma/**` and `src/lib/server/services/**` are untouched.

---

## Test Gate Outcomes

Full CI gate set, in CI order, run after §4 and again after §8. Both runs green.

| Gate | After §4 | After §8 |
|---|---|---|
| `pnpm prisma generate` | ok | ok |
| `pnpm format:check` | PASS | PASS |
| `pnpm lint` | PASS (0 errors, 1 pre-existing warning) | PASS (same warning) |
| `pnpm check` | PASS — 0 errors, 1 warning, 1089 files | PASS — 0 errors, 1 warning, 1092 files |
| `pnpm test` | 193 files / 2171 tests PASS | **196 files / 2185 tests PASS** |

The single lint/check warning is pre-existing and unrelated:
`lib/components/payroll/CalculatorWindow.svelte:82` a11y_no_static_element_interactions. It was
present on the untouched baseline.

New unit tests: 14 tests across 4 files (2171 → 2185).

### Section 8 grep gates (E6)

Both run before the §8 commit.

- Gate 2 — `grep -n "return failFromError" …` → **EMPTY**. All 5 sites converted (4 in §8, 1 in §6).
- Gate 1 — `awk 'NR>=420' … | grep -n "return {\|return fail(" | grep -v "action"` → one hit at
  relative line 71 (absolute 490). **False positive**: prettier reflowed that `return fail(409, {`
  across four lines, so the `action,` sits on the next physical line and a line-based grep cannot
  see it. A multiline-aware re-run of the same gate (4-line window) returns **EMPTY**. The tag IS
  present — verified by reading lines 488–496.
- The two `load` returns (lines 73, 199) were never tagged. Confirmed by inspection after the edit.

**Gate defect found:** E6's gate 1 as written is not prettier-safe. Any `fail()` whose object
exceeds the print width wraps and produces a permanent false positive. Phase 04 should replace it
with the window form.

---

## Mutation Check Results (E7)

Every check reverted the fix, confirmed red, then restored and confirmed green.

| Reverted | Gate | Red? | Restored green? |
|---|---|---|---|
| §1 `redirect(308, '/requests/approvals')` → `'/requests'` | `approvals-legacy-redirect.test.ts` | YES — 1/1 failed | YES |
| §5 both `return { saved }` (approvals + timesheets) | `request-decide-feedback.test.ts` | YES — 3/5 failed | YES — 5/5 |
| §7 `return { saved: 'Period voided.' }` | `payroll-period-feedback.test.ts` | YES — 2/5 failed | YES |
| §7 both `saved` returns | `payroll-period-feedback.test.ts` | YES — 3/5 failed | YES — 5/5 |
| §8 `action` on `update`'s success return | E6 grep gate 1 | YES — gate went non-empty | YES — empty |
| §8 `action` on `addLoan`'s validation fail | `employee-detail-action-tags.test.ts` | YES — 1/4 failed | YES — 4/4 |

No test in this phase passes with its fix reverted.

---

## Plan Deviations and Line Drift

All within-blast-radius. No hard-stop class deviation occurred; nothing was done that the plan did
not name.

1. **§2 — `active` expression simplified inside the new arm (real deviation).** The plan (step 6,
   E3) said to copy the generic `{:else}` arm whole, including its `{@const active = …}`. Doing so
   verbatim produced **2 svelte-check errors**: inside `{:else if item.href === '/reports'}` the
   type of `item.href` narrows to the literal `'/reports'`, so `item.href !== '/dashboard'` and
   `item.href !== '/performance'` are provably-unreachable comparisons and `pnpm check` refuses
   them. Reduced to `{@const active = $page.url.pathname.startsWith(item.href)}`, which is exactly
   what the full expression evaluates to when `item.href === '/reports'` — the two dropped conjuncts
   are vacuously true there. Behaviour is identical. Everything else in E3 (the `{@const}` as an
   immediate child, the whole `<svg d={item.icon}>` block, the `{#if item.badge}` block) was copied
   as instructed.
2. **§2 — insert point drift.** Plan said insert `reportsChildren` after line ~322;
   `requestsChildren` actually closes at **325–326**. Inserted after 326. The plan's own VALIDATE
   correction was right in direction, one span short in extent.
3. **§8 — action line numbers drifted +3** for every action after `offboard`, because §6 added
   3 lines to the same file earlier in the phase. Plan `addLoan` 663 → actual 666, and so on
   through `toggleOnboardingStep` 920 → 923. `setSupervisors` 420, `update` 436, `reveal` 615 and
   `offboard` 642 were unchanged. All 18 rows of the enumeration table were found and tagged;
   the count is exactly 21 actions as VALIDATE claimed.
4. **§8 — 11 return sites the plan's table did not enumerate.** Beyond the 5 `return failFromError`
   sites VALIDATE found, there are 11 `return fail(e.status, { error: String(e.body.message) })`
   arms inside `isHttpError` catches. They matched neither of the plan's two named shapes and
   needed the same treatment. All 11 tagged. This is the same blind-spot class VALIDATE caught
   once — the corrected gate 1 did catch these, so nothing was missed.
5. **§7 test — `error()` throws in SvelteKit 2.** The plan said to "mock the service to throw a
   409". `error(409, …)` cannot build a rejection value because it throws at the call site; the
   test uses a plain `{ status, body: { message } }` literal, which is the shape `toFail` reads.
6. **§8 test — `update`'s cheap failure path.** An empty body PASSES `updateSchema` (every field is
   optional) and reaches the unmocked service. Used `jobTitle: ''`, which fails
   `z.string().min(1)`, to stay inside the action.

Every other cited line read exactly as the plan quoted it (E2 satisfied).

---

## Accepted Regressions — implemented by design, confirmed present

Both were named by VALIDATE and both are now live in the code.

1. **`setSupervisors` loses a working success banner.** `setSupervisors` returns
   `{ action, success: true }`; the shared block at `employees/[id]/+page.svelte:497` is now gated
   on `form?.action === 'update'`. A successful supervisor change therefore reports **nothing at
   all**. This is not a mis-routed error being silenced — it is a currently-working signal removed.
   Closed by phase 07's per-form slots. (OWNER-DECISION-2, applied default: proceed.)
2. **A failed `addLoan` (and 17 other actions) renders nowhere.** Previously it rendered inside the
   Update Profile card. The trade is deliberate: an error attributed to the wrong form is worse
   than a silent one, and the window is bounded by phase 07.

Also accepted, per the plan: `payroll/periods` keeps four still-silent successes (`open`, `import`,
`generate`, `lock`) — the new `{#if form?.saved}` block is page-level but only `release` and `void`
populate it. Phase 04 owns the repo-wide contract.

---

## OWNER-DECISION-1 — MANAGER exposure (measurement)

The plan required a live MANAGER probe arm. **Not run** — browser verification was deferred. What
is derivable from source, unchanged by this phase:

- `src/lib/rbac.ts:26` — `MANAGE_HR: ['MANAGER', 'HR_ADMIN', 'SUPER_ADMIN', 'CEO']`. A branch
  MANAGER holds it.
- Lines 30–33 of the same file say in as many words: use `ADMINISTER_HR_ORGWIDE`, never
  `MANAGE_HR`, to decide "may reach any employee record".
- Both new surfaces are gated on `MANAGE_HR` — the reports card via
  `data.canViewHrReports` (`canAny(roles, 'MANAGE_HR')`), the sidebar row via `isAdmin` (same).
  This correctly mirrors the route's own guard at `reports/audit-log/+page.server.ts:11`.
- **Therefore every branch MANAGER now sees both the Audit Log card and the sidebar row**, pointing
  at a page whose query scopes on `organizationId` only, with no reporting-line filter.
- Not a widening of access — a MANAGER could already type the URL and already saw every `/reports`
  card. What changed is discoverability. Masked values stay behind `ADMINISTER_SYSTEM`.

The exposure is real, expected and unresolved. The gate decision stays with phase 02.
**The live measurement arm is still owed.**

---

## What Was Skipped or Deferred

Deferred by explicit operator instruction — no server, browser or database was started:

- Every agent probe: audit-log reachability + FINANCE negative control + MANAGER arm (AC-2), the
  rating-row red/green control pair (AC-3), the Toaster ARIA DOM probe (AC-4), the approve-a-request
  banner (AC-5), the offboard DOM+psql probe (AC-6), the periods void/release confirm probe with
  its Cancel positive control (AC-8), the `employees/[id]` mis-routing probe a/b/c (AC-9).
- Every `pnpm test:e2e` run: `employee.spec.ts`, `form-errors.spec.ts`,
  `payroll-lock-idempotency.spec.ts`, `payroll-run-void.spec.ts`.
- The whole 13-item Manual Verification Checklist.

**Consequence — this is the load-bearing gap.** Sections 2, 3 and 4 have **no** automated proof at
all and cannot reach `VERIFIED` on a green suite; the plan says so and `all-tests.md` records five
occasions where a green suite here coexisted with a live defect. Section 3's fix is only evidence
with its red control on the pre-fix commit (E9), which was not run. Section 8's 18 remaining tags
are proven to EXIST but not proven to match what the template reads — only the probe covers that.

Section 6's dead-action delete has the strongest static evidence (single-hit grep + lint + check +
the two guard test files staying green) but the end-to-end offboard re-run the plan required is
still owed.

---

## Test Infra Gaps Found

Carried forward unchanged from the plan; nothing new discovered beyond the E6 gate defect above.

- **No DOM test environment.** `vitest.config.ts` pins `environment: 'node'`, so none of the now-196
  unit files can render a component — `@testing-library/svelte` and `@testing-library/jest-dom` are
  installed and unusable. This is exactly why §3 and §4 have zero automated cover.
  Backlog artifact: `component-test-dom-environment_NOTE_03-09-26.md`.
- **`ConfirmButton` is unobservable on success by construction** (`ConfirmButton.svelte:38-53` — the
  dialog closes before the request resolves). §7's page banner is the only completion signal.
  Phase 04 owns the primitive.
- **No gate typechecks `prisma/**` or `scripts/**`.** Not touched this phase; recorded so phase 02
  does not assume `pnpm check` covers them.
- **E6 gate 1 is not prettier-safe** (see Test Gate Outcomes). Use the 4-line-window form.

CONTEXT_PARTIAL: none.

---

## Closeout Packet

- **Selected plan:** `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-01-p0-fixes_PLAN_03-09-26.md`
- **Finished:** all 8 sections implemented and committed; 4 new unit test files; 6 mutation checks
  green; both E6 gates satisfied; full CI gate set green twice.
- **Verified:** only what a mocked node-environment suite can verify — return shapes, the redirect
  throw, the action-tag surface, no orphan imports, no type error, no format/lint regression.
- **Unverified:** everything a user can see. No banner, no dialog, no nav row, no ARIA attribute and
  no database row was observed. The MANAGER exposure measurement is owed.
- **Remaining cleanup:** run the 13-item manual checklist and the 7 agent probes; run the 4 e2e
  specs; answer OWNER-DECISION-1 (or let phase 02 inherit it); create the two backlog artifacts the
  Validate Contract names, which do not exist yet.
- **Closeout state:** `Keep in active/testing`. Not archivable — the plan's own Phase Completion
  Rules require a checked manual row plus user confirmation per section, and none exist.

## Forward Preview

**Test Infra Found:** node-only vitest (no DOM); 196 unit files / 2185 tests; e2e runs against a
build and is known-flaky (#287); no gate covers `prisma/**` or `scripts/**`.

**Blast Radius Changes:** `employees/[id]/+page.server.ts` grew a `const action` in all 21 actions —
phase 07 restructures this file and should build on that shape, not replace it.
`payroll/periods/+page.svelte` now imports `ConfirmButton`; phase 04 rebuilds that primitive and
must keep the `submit?: SubmitFunction` prop or the #108 per-row guard breaks. The
`{ action, saved?, error? }` return shape phases 5–8 established is the seed of phase 04's
repo-wide feedback contract.

**Commands to Stay Green:** `pnpm prisma generate` → `pnpm format:check` → `pnpm lint` →
`pnpm check` → `pnpm test`. Never run `pnpm check` while a dev server is up — it kills it.

**Dependency Changes:** none. No package added, removed or upgraded.
