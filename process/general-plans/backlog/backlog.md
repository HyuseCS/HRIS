# Backlog

## recruitment-detail-banner-dedupe follow-ups

### Run the two unrun e2e specs and `pnpm check` for the banner-dedupe + board-tile work

- **Priority**: Medium
- **Problem**: `tests/e2e/form-errors.spec.ts` (new `updateStatus` toast case) and
  `tests/e2e/job-board-tracking.spec.ts` (reworked after the per-posting tile UI replaced the row
  UI it drove) are both committed but never executed. `pnpm check` was also never run this session.
  All three need the owner's dev server down first.
- **Root cause**: the session ran entirely against a live dev server on 5173; `pnpm check` runs
  `svelte-kit sync` and stops it, and the e2e tier needs its own build+preview.
- **Fix options**: with the dev server down, run `pnpm check`, then `pnpm test:e2e -- form-errors
  job-board-tracking`; fix whatever the reworked job-board spec's new tile locators surface.
- **Source**: `process/general-plans/completed/recruitment-detail-banner-dedupe_10-09-26/recruitment-detail-banner-dedupe_PLAN_10-09-26.md`

### R2 convert-banner regression check has no fixture

- **Priority**: Low (accepted residual, not a regression)
- **Problem**: The plan's R2 live-probe (does the `convert` banner still render after the
  `updateStatus` banner was deleted) is `BLOCKED — no fixture`. Neither `prisma/seed-core.ts` nor
  `scripts/seed-uiux-demo.ts` seeds a hired applicant, and the plan explicitly forbids fabricating
  one. Static proof stands in its place: the `convert` block (page line ~227) is untouched by the
  diff.
- **Root cause**: no seed fixture reaches the `hiredApplicants.length > 0` branch.
- **Fix options**: add a hired-applicant fixture to `scripts/seed-uiux-demo.ts` (or a dedicated e2e
  seed) the next time recruitment's "Hired Applicants" card needs real test coverage.
- **Source**: `process/general-plans/completed/recruitment-detail-banner-dedupe_10-09-26/recruitment-detail-banner-dedupe_PLAN_10-09-26.md`, Validate Contract "Open gaps"

### F1 — the notifications surface should be a toast, not a banner

- **Priority**: Low
- **Problem**: Owner finding from this session: "the notifs is using a banner, should use a Toast."
  The specific surface (which page/component) was never identified during this session.
- **Root cause**: not investigated — parked as a finding, not a scoped task.
- **Fix options**: next UI/UX pass should grep for the notifications banner, confirm which route
  owns it, and scope a plan the same shape as this one (delete banner, confirm `submitFeedback` or
  equivalent already toasts).
- **Source**: owner feedback during `feat/uiux-phase-4` session, 10-09-26.

## #278 follow-ups

### Add `finance@veent.ph` and `payroll@veent.ph` to `tests/e2e/helpers.ts` `USERS`

- **Priority**: Low
- **Problem**: Both accounts are seeded but absent from the e2e `USERS` map, so FINANCE and
  PAYROLL_OFFICER coverage of any payroll-visibility fix (including #278) rests on unit-level rows
  only and is never exercised at the HTTP layer.
- **Root cause**: `helpers.ts` was never extended when these roles were seeded.
- **Fix options**: add both entries to `USERS` with their seeded credentials; broadens several
  existing specs' reach cheaply. Deferred out of #278's scope by that plan's own Notes section.
- **Source**: `process/general-plans/active/payslip-draft-visibility-278_PLAN_10-08-26.md`
- **CORRECTION 04-09-26**: this entry's premise is wrong. `grep -rn "payroll@veent.ph\|finance@veent.ph" prisma/`
  returns zero hits — neither account exists in `prisma/seed-core.ts` or any other seed script.
  The `DevLoginSwitcher` buttons for both roles 404 on a fresh dev DB. See
  `process/features/ui-ux-overhaul/backlog/dev-seed-missing-finance-payroll-accounts_NOTE_04-09-26.md`
  for the confirmed state and fix.

### Repo-wide sweep for guard message strings with no test reference

- **Priority**: Low
- **Problem**: The #278 draft gate had zero test coverage before that plan — its message string
  (`'Payslip not yet available'`) appeared at three source sites and in no test file, meaning the
  guard was deletable without CI noticing. Unknown how many other authorization guards in the repo
  are in the same state.
- **Root cause**: No existing convention or lint rule ties a guard's error message to a required test
  assertion.
- **Fix options**: grep the repo for `error(403, ...)` / `return { ok: false, status: 403, ... }`
  message literals and cross-check each against `tests/**` for a matching assertion; file individual
  issues for any gaps found.
- **Source**: `process/general-plans/active/payslip-draft-visibility-278_PLAN_10-08-26.md`, "Test
  Infra Improvement Notes"

### RESIDUAL-1 — Door B's 403 guard identity is unpinned

- **Priority**: Low (accepted residual, not a regression)
- **Problem**: `src/routes/(app)/payslips/[id]/+page.server.ts` (Door B) answers 403 from either the
  access guard or the draft guard, but `src/routes/+error.svelte` renders a fixed body for every 403
  and never prints `$page.error.message`. No e2e can currently distinguish which guard fired at Door
  B, unlike Doors A and C which both assert the message.
- **Root cause**: `+error.svelte` was written before any door needed to expose *which* guard denied
  access; it only needed to deny.
- **Fix options**: have `+error.svelte` forward `$page.error.message` in dev/test builds only, or add
  a `accept: application/json` fallback path server-side (the client-side `accept` header attempt
  during #278 did not change SvelteKit's response). Closure was explicitly out of scope for #278 by
  user decision; the compensating control is that Doors A and C already pin gate order.
- **Source**: `process/general-plans/active/payslip-draft-visibility-278_PLAN_10-08-26.md`, Validate
  Contract "Open gaps"

## e2e: two specs share `jp_seed_demo`, so the suite flakes under local parallel workers

`tests/e2e/job-board-tracking.spec.ts` and `tests/e2e/form-errors.spec.ts` both drive the
`jp_seed_demo` posting. `playwright.config.ts` sets `fullyParallel: true` with
`workers: process.env.CI ? 1 : undefined`, so **CI runs serial and is green (141 passed)**, while a
bare local `pnpm test:e2e` runs them concurrently and job-board-tracking fails.

Reproduce: `pnpm test:e2e` flakes; `CI=1 pnpm test:e2e` passes; the spec passes alone.

Fix by giving one of the two its own posting fixture rather than sharing the seeded one. Until
then, run the suite locally with `CI=1`.

Recorded 2026-09-10.

## e2e: `attendance-save-timesheet-custom-range` fails, and predates this branch

`tests/e2e/attendance-save-timesheet-custom-range.spec.ts:89` expects
`Timesheet saved (7 days).` and the toast never appears. **Confirmed pre-existing**: it fails
identically in a worktree checked out at `d4c8e41`, before any of this session's commits. No
timesheet rows exist in the dev database, so it is not overlap residue.

Recorded 2026-09-10.
