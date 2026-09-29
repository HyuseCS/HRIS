# Dashboard layout — RESEARCH report (17-09-26)

```yaml
context-envelope:
  feature: ui-ux-overhaul
  phase: RESEARCH
  session-goal: Research the dashboard page for a layout overhaul (unbounded lists, messy admin layout)
  branch: feat/uiux-phase-6
  worktree: main
  context-group: uxui
  blast-radius-packages: src/routes/(app)/dashboard, src/lib/components/dashboard, src/lib/components/ui, src/app.css
  active-plan: process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/ui-ux-overhaul-umbrella_PLAN_03-09-26.md
  test-runner: vitest | playwright
  validate-contract: none
```

TL;DR — the dashboard is 4 stacked grid rows plus a flat card list. Only ONE list in the whole page has a height bound (`Recent Activity`, `max-h-96`). `Upcoming Regularizations`, `Postings awaiting your approval`, `Upcoming Events`, `Announcements`, `Awaiting you` and the `My Status` leave list are all unbounded. The admin/CEO mess is structural: the two amber/blue full-width alert cards (regularizations, postings) and `Awaiting you` only exist for MANAGE_HR / APPROVE_REQUESTS holders, and they are appended as full-width rows AFTER the 3-column feed row, so those roles get a long single-column ribbon under a dense grid.

## Scope and Blast Radius

In scope: `src/routes/(app)/dashboard/+page.svelte` (836 lines), `+page.server.ts` (246), `src/app.css` `.card`, `src/lib/components/ui/{Container,PageHeader,EmptyState,Badge}.svelte`, `src/lib/components/dashboard/{ActivityIcon,AnnouncementItem}.svelte`.
Out of scope: the services under `src/lib/server/services/` (dashboard, approvals, recruitment, notifications) — they only shape data; the capability map `src/lib/rbac.ts` (read-only reference).

## 1. Cards in DOM order

Page root: `+page.svelte:139` `<div class="flex flex-1 flex-col gap-6">`, `PageHeader title="Dashboard"` at `:140`.

**ROW 1** — `:150` `grid grid-cols-1 gap-4 lg:grid-cols-3`. Left sub-stack `:151` `space-y-4 lg:col-span-2`.

| # | Card | Gate | Data | Grid / classes | Height bound |
|---|---|---|---|---|---|
| 1 | Attendance Today `:153` | none (always) | `metrics.attendance.{present,late,absent,onLeave,derived}` (server `:62-76`) | `card space-y-3`; inner `:161` `grid grid-cols-2 gap-4 sm:grid-cols-4`; `{#if metrics.attendance.derived > 0}` `:160` else prose `:180` | none (fixed 4 cells) |
| 2 | Active Employees `:191` | none | `metrics.headcount` | inside `:190` `grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3`; anchor `card flex flex-col gap-3` | n/a |
| 3 | Pending Approvals `:202` | none | `metrics.pendingApprovals/pendingRequests/pendingTimesheets/pendingPayrollRuns` | same grid, `card flex flex-col gap-3` | n/a |
| 4 | Last Payroll `:222` | `{#if data.canViewPayroll}` | `metrics.lastPayrollRun.{totalNet,periodEnd,status}` | same grid | n/a. **This is the 3rd cell — its absence leaves the sm:grid-cols-2 row half-empty for EMPLOYEE.** |
| 5 | Upcoming Events `:256` | none (server filters sensitivity, `+page.server.ts:89`) | `data.upcomingEvents[]` (kind/date/title/detail/mine) | `card flex h-full flex-col gap-3`, right column of the lg:grid-cols-3 | **NO max-h, NO overflow.** `<ul class="divide-y divide-border/40">` `:261`. Empty branch `:287` centres an `EmptyState` |

**ROW 2** — `:301` `grid grid-cols-1 gap-4 lg:grid-cols-3`.

| # | Card | Gate | Data | Classes | Bound |
|---|---|---|---|---|---|
| 6 | Recent Activity `:303-304` | `{#if data.recentActivity.length}` | `listRecent(user.id, 25)` (`server:122`) | `card space-y-3`; list `:312` `max-h-96 space-y-2 overflow-y-auto` | **BOUNDED — the only one** |
| 7 | Announcements `:339` | none; post/award buttons gated `{#if data.canPost}` `:344`; forms `:362`, `:396` | `data.announcements` (5, `server:79`), `data.birthdays`, `data.awards`, `data.awardEmployees` | `card flex h-full flex-col gap-3`; feed `<ul class="divide-y">` `:424`; else `EmptyState` `:446` | **NO max-h, NO overflow.** Two inline forms expand the card in place |
| 8 | My Status `:458-459` | `{#if status}` (`data.myStatus`, `server:84`) | employmentType, tenure, probation bar, renewal, `status.leave[]`, pendingRequests, openTimesheets, schedule/manager/department | `card space-y-4`; leave loop `:526`; dl `:571` | **NO bound; leave list `:523` grows per leave type** |

Row-2 cell-count instability: the row is `lg:grid-cols-3` but carries 1–3 children depending on `recentActivity.length` and `status`. An EMPLOYEE with no activity gets 2 cards in a 3-col grid; a fresh admin account with no employee record gets 1.

**ROW 3+ — full-width cards appended to the page flex column (not in any grid):**

| # | Card | Gate | Data | Classes | Bound |
|---|---|---|---|---|---|
| 9 | Upcoming Regularizations `:605-606` | `{#if data.canPost && data.regularizations.length}` (server `:102` also `canPost`-gated) | `listUpcomingRegularizations(orgId)` — name, jobTitle, department, regularizationDate, daysUntil, overdue | `card space-y-3 border-amber-500/30 bg-amber-500/5`; `<ul class="divide-y divide-border/60">` `:630` | **NO max-h, NO overflow, NO min-h — owner's complaint #1** |
| 10 | Postings awaiting your approval `:654-655` | `{#if data.postingsToApprove.length}` (`listPostingsAwaitingApprover`, server `:111`) | posting title, department; per-row Approve form + Send-back note form `:692` | `card space-y-3 border-blue-500/30 bg-blue-500/5`; `<ul class="divide-y divide-border/60">` `:664` | **NO max-h, NO overflow, NO min-h — owner's complaint #2.** Expanding a reject note grows a row further |
| 11 | Awaiting you `:724-725` | `{#if metrics.pendingApprovals > 0}` | `awaiting` derived `:56-73` — 4 rows filtered to `n > 0`, each a `Badge status="pending" tone="blue"` | `card space-y-3`, heading `<h2 class="text-sm font-semibold">` `:726` | max 4 rows, so effectively bounded but not declared |
| 12 | Quick actions `:747` | Onboard always `:748`; New Timesheet `{#if data.canCreateTimesheet}` `:778`; File Leave always `:808` | static links | `mt-auto grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3`, each `card group flex items-center gap-4` | n/a. 2 cells for EMPLOYEE in a 3-col grid |

Note: `Onboard Employee` `:748` is **ungated** — every role including EMPLOYEE sees it, unlike New Timesheet.

## 2. Role × card visibility

Capability flags, `src/routes/(app)/dashboard/+page.server.ts`:
- `:23` `canPost = canAny(user.roles, 'MANAGE_HR')`
- `:25` `canViewPayroll = canAny(user.roles, 'VIEW_PAYROLL_REPORTS')`
- `:28` `canCreateTimesheet = canAny(user.roles, 'MANAGE_HR')`

Capability→role map is in **`src/lib/rbac.ts`** (re-exported by `src/lib/server/rbac.ts:9`):
- `MANAGE_HR: ['MANAGER','HR_ADMIN','SUPER_ADMIN','CEO']` — `src/lib/rbac.ts:26`
- `VIEW_PAYROLL_REPORTS: ['MANAGER','SUPER_ADMIN','HR_ADMIN','PAYROLL_OFFICER','FINANCE','CEO']` — `src/lib/rbac.ts:107`
- `APPROVE_REQUESTS: ['MANAGER','HR_ADMIN','SUPER_ADMIN','PAYROLL_OFFICER','CEO', …]` — `src/lib/rbac.ts:77-83`

| Card | EMPLOYEE | MANAGER | HR_ADMIN | PAYROLL_OFFICER | CEO | SUPER_ADMIN |
|---|---|---|---|---|---|---|
| Attendance Today | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Active Employees | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Pending Approvals tile | ✓ (zeros) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Last Payroll | ✗ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Upcoming Events | ✓ (own only) | ✓ full | ✓ full | ✓ own only | ✓ full | ✓ full |
| Recent Activity | data-dependent | data | data | data | data | data |
| Announcements (read) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| — Post / Give award buttons | ✗ | ✓ | ✓ | ✗ | ✓ | ✓ |
| My Status | only if employee record | ditto | ditto | ditto | ditto | ditto |
| Upcoming Regularizations | ✗ | ✓ | ✓ | ✗ | ✓ | ✓ |
| Postings awaiting approval | data (approver mapping) | data | data | data | data | data |
| Awaiting you | ✗ (approvals.ts short-circuits non-APPROVE_REQUESTS to zero — see `+page.svelte:49-55`) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Quick: Onboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Quick: New Timesheet | ✗ | ✓ | ✓ | ✗ | ✓ | ✓ |
| Quick: File Leave | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Worst case (HR_ADMIN / CEO / SUPER_ADMIN): **all 12 blocks present** — 5 in row 1, 3 in row 2, then 3 full-width single-column cards, then a 3-up quick-action grid. PAYROLL_OFFICER is the odd shape: gets Last Payroll and Awaiting you, but not the amber regularizations card or New Timesheet, so its row-2/row-3 mix differs from both EMPLOYEE and HR.

## 3. Class and container definitions

`src/app.css:237-239`:
```css
.card {
  @apply rounded-lg border bg-card p-5 shadow-sm dark:shadow-none;
}
```
No height, no overflow, no min-height. Comment at `:232-236` states the card edge carries the grouping.

`src/lib/components/ui/Container.svelte` — the phase-05 container template. Root class:
```
flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border
+ (tone === 'card' ? 'bg-card' : 'bg-muted/50')
```
Body: `flex min-h-0 flex-1 flex-col overflow-y-auto {flush ? '' : 'p-4'}`, plus optional `toolbar` (`border-b px-4 py-2`) and `footer` (`border-t px-4 py-3 empty:hidden`), and an `empty`/`emptyState` centring path. **The dashboard does not use `Container` at all** — it is used by 14 routes (`employees`, `requests`, `requests/approvals`, `requests/timesheets`, `requests/proposals`, `timesheets`, `payslips`, `leave`, `performance`, `recruitment`, `complaints`, `settings/holidays`, `settings/roles`, `reports/audit-log`). Container is the only component in the repo that owns scroll + min-h-0 for a panel.

`PageHeader.svelte` — `flex flex-wrap items-start justify-between gap-3`, `h1 text-2xl font-bold tracking-tight`; its comment states the title-row rule: title + description + **at most ONE control** (Back counts as that control). Dashboard passes only `title`.

`EmptyState.svelte` — `flex flex-col items-center justify-center gap-3 px-6 py-12 text-center`, `variant: 'empty' | 'no-results'`. Used twice on the dashboard (`:288`, `:447`).

`Badge.svelte` / `badge.ts` — tone/label resolution, five tones matching `.badge-*` in app.css. Dashboard uses one instance: `:734` `<Badge status="pending" tone="blue" label={String(row.n)} />`.

## 4. Dashboard components

Only two exist: `src/lib/components/dashboard/ActivityIcon.svelte` (used at `+page.svelte:323`) and `src/lib/components/dashboard/AnnouncementItem.svelte` (used at `:426`, `:429`, `:437`). No card/panel wrapper component exists for the dashboard — every card is inline markup.

## 5. Bounded vs unbounded lists

Bounded (1): Recent Activity — `+page.svelte:312` `class="max-h-96 space-y-2 overflow-y-auto"`, feeding up to 25 rows (`server:122`).

Unbounded (no max-h, no overflow, no min-h):
- Upcoming Events `:261` `divide-y divide-border/40`
- Announcements `:424` `divide-y`
- My Status leave balances `:524` `space-y-1.5 border-t border-border/60 pt-3`
- Upcoming Regularizations `:630` `divide-y divide-border/60`
- Postings awaiting approval `:664` `divide-y divide-border/60`
- Awaiting you `:727` `space-y-1` (self-limits to 4)

Only two cards declare any height intent at all: `:256` and `:339` use `h-full` to stretch within their grid row; neither constrains content.

## 6. Tests that break on heading/order/structure change

- `tests/e2e/dashboard.spec.ts:9-12` — card labels `'Active Employees'`, `'Pending Approvals'`, `'Last Payroll'`, each asserted at `:20` as `getByRole('link', {name: RegExp(label)})` and `:22` `toHaveURL`. **Requires these three cards stay anchors whose accessible name contains the label.**
- `tests/e2e/dashboard.spec.ts:52` — `getByRole('button', {name: 'Post', exact: true})`; `:53` `input[name="title"]`; `:57` `textarea[name="body"]`; `:58` `getByRole('button', {name:'Post announcement'})`; `:62-64` `page.locator('li', {hasText: TITLE})` containing `— Hannah HR`. **Announcement items must stay `<li>`.**
- `tests/e2e/dashboard.spec.ts:69-70` — same `li` locator after reload.
- `tests/e2e/admin.spec.ts:70-71` — `getByText('Active Employees')`, `getByText('Pending Approvals')` visible.
- `tests/e2e/employee-view-only.spec.ts:102-103` — `getByRole('link', {name:/New Timesheet/})` and `getByRole('button', {name:/Timesheet/})` both count 0 for EMPLOYEE.
- `tests/e2e/posting-approver-sod.spec.ts:60-64` — `approvalCard()` = `page.locator('li', {hasText: title}).filter({has: getByRole('button',{name:'Approve'})})`. **The postings card row must stay an `<li>` containing a button literally named `Approve`.** Asserted at `:84-85`, `:92-94`, `:154-155`, `:162-163`, `:165-166`, `:173-174`.
- `tests/e2e/helpers.ts:55-56` — every login waits for `**/dashboard` and `getByRole('heading', {name:'Dashboard'})`. **The `h1` text must stay exactly `Dashboard`.** This gates the entire e2e suite.
- `tests/e2e/multi-role-sod.spec.ts:72` — `getByText(/^\d+ awaiting you$/)` — that is the queue-page pill, not the dashboard card, but the wording collides with the dashboard `h2 "Awaiting you"` at `+page.svelte:726`; a change to the dashboard heading text could start/stop matching this regex.
- Unit (data shape only, not DOM): `tests/unit/dashboard-org-scoping.test.ts:28`, `tests/unit/approval-queues.test.ts:292` (total = sum of four domains, tied to the four "Awaiting you" rows), `tests/unit/regularization.test.ts:10,50`, `tests/unit/employment.test.ts:8`, `tests/unit/recruitment-posting-sod.test.ts:259-260`, `tests/unit/announcement-author.test.ts:71`.

No unit test renders the dashboard — `vitest.config.ts` runs `environment: 'node'`, so nothing in this repo can mount a component (stated in `src/lib/components/ui/badge.ts` header). All DOM-level dashboard coverage is Playwright.

## 7. Documented design rules that apply

- `process/context/uxui/all-uxui.md` — `{@const}` must be an immediate child of a block tag; runes only; 43 HSL tokens, both themes must be styled; **no single button class in use** (27 `.btn-*` vs 252 raw `<button>`), so an app-wide button change is a global selector or 250 edits; touch-target floor 24px under `pointer: coarse`; contrast must be computed and alpha composited, not eyeballed; feedback rule = **one message per action, on the surface nearest the button**.
- `PageHeader.svelte` in-file rule: title row carries at most ONE control; a page with no Back may put its single page-level action there.
- `Container.svelte` is the established panel recipe (`min-h-0 flex-1 overflow-hidden` shell + `overflow-y-auto` body) on 14 routes; the dashboard is outside it.
- `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-blast-radius-registry.md:88-89` — the only dashboard entries: `+page.server.ts` "S1 — `pendingProposals` forwarded"; `+page.svelte` "S1, S2 — Awaiting-you card; File Leave quick action repointed". **No phase has claimed dashboard layout.**
- Umbrella plan `ui-ux-overhaul-umbrella_PLAN_03-09-26.md:189` lists item 7 "Decision-ready detail pages" including "approver cards with waiting-time, coverage shortfall … chips" — adjacent but not the dashboard.

## Test Gap Analysis

1. **Zero-coverage files in blast radius:** `src/lib/components/dashboard/ActivityIcon.svelte`, `src/lib/components/dashboard/AnnouncementItem.svelte`, `src/lib/components/ui/Container.svelte`, `src/lib/components/ui/EmptyState.svelte`, `src/lib/components/ui/PageHeader.svelte` — none have any test file and none can have a unit test (node environment, no component mounting).
2. **Behaviours with no asserting test:**
   - No assertion anywhere that any dashboard list is height-bounded or scrollable. `max-h-96` at `:312` is unasserted.
   - No test asserts the `Upcoming Regularizations` card renders at all (only the pure date helpers in `tests/unit/regularization.test.ts`).
   - No test asserts `Upcoming Events`, `My Status`, `Attendance Today`, or `Awaiting you` render on the dashboard — only `approval-queues.test.ts:292` asserts the underlying counts.
   - No role-matrix test for dashboard card visibility except the single EMPLOYEE/New-Timesheet case (`employee-view-only.spec.ts:98`). Nothing asserts EMPLOYEE does NOT see `Last Payroll` or `Upcoming Regularizations`.
   - No viewport/responsive assertion at any width.
3. **Preliminary tier classification:** height-bound + scroll assertions → **Fully-Automated** (Playwright `boundingBox` / `scrollHeight` vs `clientHeight`). Role-matrix card visibility → **Fully-Automated** (login-as helpers and `USERS` fixtures already exist in `tests/e2e/helpers.ts`). Overall "the layout is a mess / reads well at width N" → **Agent-Probe** (screenshot pass; the repo already has the precedent that size measurements cannot see overlap). Dark/light contrast on the amber and blue tinted cards → **Hybrid** (computed ratio + human look).

## Infra Improvement Suggestions

- There is no way to unit-test any Svelte component in this repo (`environment: 'node'`), so every dashboard structural claim must be proven in Playwright. A card-level test id convention would let scroll/height assertions target cards without coupling to heading text — today every dashboard locator keys off visible copy or `<li>` shape, which is exactly what a layout overhaul changes.
- No existing helper asserts "element is scrollable" or "element does not exceed N px"; each new bound would hand-roll it.

## Open Questions

- Does the owner want the two alert cards (regularizations, postings) bounded with internal scroll, or moved out of the full-width trailing stack? Not decided — this is INNOVATE's call.
- `My Status` renders only when `data.myStatus` exists; an HR_ADMIN account with no `Employee` row silently drops a whole cell from row 2. Is that a layout case to handle, or acceptable?
- `Onboard Employee` quick action at `:748` is ungated while `New Timesheet` at `:778` is gated on MANAGE_HR. Unknown whether that is deliberate; out of scope for a layout change but it affects the EMPLOYEE quick-action row count (2 vs 3).
- Row 2's `lg:grid-cols-3` carrying 1–3 conditional children: is the variable cell count part of "the layout is a mess", or is the complaint only about the unbounded lists? Not stated.

PHASE_COMPLETE: RESEARCH — findings summary written

Research complete. Choose: (a) say 'go' to move to SPEC mode (writes the requirements doc for your review); (b) say 'validate' to run deeper Layer 1 + Layer 2 verification on these findings first; or (c) ask follow-up questions / request deeper research.

**Status:** DONE
**Summary:** Mapped all 12 dashboard cards in DOM order with gates, data, grid classes and height constraints; built the role×card matrix from `src/lib/rbac.ts`; found only `Recent Activity` (`max-h-96`, `+page.svelte:312`) is bounded while the two cards the owner named are fully unbounded; listed every test assertion that couples to dashboard headings, `<li>` shape or the `Dashboard` h1.
**Concerns/Blockers:** `tests/e2e/helpers.ts:56` asserts the `Dashboard` h1 on every login — the whole e2e suite fails if that heading changes. `tests/e2e/posting-approver-sod.spec.ts:60-64` requires the postings rows stay `<li>` with a button named exactly `Approve`.