# Phase 10 — container bounds RESEARCH (03-09-26)

Owner ruling (03-09-26): every list container that grows with database rows gets (a) a cap on
items loaded/rendered, (b) a max-height with scroll inside as backstop, (c) a "view all" link
where a destination exists. Added ruling: the fix must scale on all screen sizes.
Branch: `feat/uiux-phase-10` off `feat/uiux-phase-9`, PR #19 stacked on #18.

Code of record at research time: `feat/uiux-phase-9` tip (= phase-8 code, no phase-9 source yet).

## TL;DR

The dashboard has **three** truly unbounded stacked-card lists (Upcoming Events, Upcoming
Regularizations, Postings awaiting approval) plus one unbounded `<select>` roster. Everything
else on the dashboard is already capped (`take 5` / `take 25`) or is an aggregate count. Off the
dashboard the pattern repeats in ~20 unpaginated tables/stacks, worst of which is the 201-file
(`employees/[id]`, 27 `{#each}` blocks, none bounded) and `/team` (members × dates matrix). The
house idiom exists: `max-h-96 overflow-y-auto` (dashboard:307) and viewport-relative
`max-h-[90vh]` / `max-h-[70vh]`. There are **zero** breakpoint-prefixed `max-h-` classes in the
repo and **no custom `maxHeight` or `screens`** in Tailwind config, so responsive scaling must
come from `vh` units or new `sm:`/`lg:` variants.

Out of scope (already paginated via `src/lib/server/pagination.ts` + `Pagination.svelte`, do not
touch): `/employees`, `/requests`, `/requests/approvals`, `/requests/proposals`, `/leave`,
`/payslips`, `/attendance`, `/timesheets`, `/recruitment`, `/reports/audit-log`, `/separations`,
`/inventory`, `/inquiries`.

Overlapping recorded gap: `process/features/ui-ux-overhaul/backlog/query-level-pagination-unbounded-lists_NOTE_03-09-26.md`
— records that `src/lib/server/services/**` was out of bounds for the overhaul umbrella. Three of
the four dashboard offenders have their query in a service.

## 1. Dashboard cards

### D1 — Upcoming Events
- Render: `dashboard/+page.svelte:255-278`, `{#each data.upcomingEvents}` at :257. No bound.
- Query: `dashboard/+page.server.ts:89` → `listUpcomingEvents` in
  `src/lib/server/services/dashboard.ts:449-592`. Four findMany calls (`:465` holidays, `:471`
  **entire active roster, no take**, `:483` payroll periods, `:487` approved leaves), merged,
  sorted at `:591`, returned whole. `UPCOMING_EVENT_DAYS = 14` (`:402`) is the only limiter.
- ~40–60 rows at 500 staff; linear in headcount.
- View-all destination: **none exists** (no /events page).
- **Bound belongs in the merged, sorted output (post-`:591` slice), NOT the queries** — the
  roster read at `:471` feeds four derived event kinds (comment `:469-470`); a query take drops
  whole categories.

### D2 — Upcoming Regularizations (HR only)
- Render: `+page.svelte:607-653`, `{#each data.regularizations}` at :633. No bound.
- Query: `+page.server.ts:102` → `listUpcomingRegularizations` at `dashboard.ts:15-54`; findMany
  `:22-37`, no take. `REGULARIZATION_NOTICE_DAYS = 21` (`:6`) bounds forward only; `startDate:
  { lte: startCeiling }` (`:27`) has **no floor** — past-due probationaries accumulate forever
  (deliberate, docstring `:9-11`).
- **The sort is post-fetch JS at `:53`** — a query `take` without adding
  `orderBy: { startDate: 'asc' }` first caps the WRONG rows silently. Negative-control this.
- View-all: partial — rows link to `/employees/{r.id}` (`:636`).

### D3 — Postings awaiting your approval
- Render: `+page.svelte:656-721`, `{#each data.postingsToApprove}` at :667. No bound.
- Query: `+page.server.ts:111-116` → `listPostingsAwaitingApprover` in
  `src/lib/server/services/recruitment.ts` (no take; the only take in that file is :40,
  unrelated stageHistory take 1).
- Each row carries an inline approve/send-back form with per-row guard (`+page.svelte:668`,
  `decideGuard(p.id)`) — capping the render alone hides actionable work, so the view-all link is
  mandatory here. Destination exists: `/recruitment` (paginated).

### D4 — Award recipient picker
- `+page.svelte:377-379` `<select>` over the whole roster (`+page.server.ts:93-99`, no take).
- Native select scrolls itself; capping breaks the picker. **Do not cap.** Typeahead = backlog.

### D5 — Recent Activity — already conforms, THE MODEL
- `+page.svelte:299-330`, `<ul class="max-h-96 space-y-2 overflow-y-auto">` at **:307**.
- Query `+page.server.ts:122` `listRecent(user.id, 25)` → `notifications.ts:41-48` take limit.
- Cap rationale comment at `+page.server.ts:119-121` ("25, not 8: ... only way to recover a
  missed toast") is the model comment style.

### D6 — Announcements feed — conforms (take 5 announcements `announcements.ts:17`, take 5
awards `awards.ts:82-86`). Residual: `listTodaysBirthdays` (`dashboard.ts:59`) uncapped but
joined into one sentence (`+page.svelte:91`) — grows a paragraph, not a stack. Low priority.

### D7 — My Status leave balances — `dashboard.ts:144-152` no take, but bounded by configured
leave types (<10). Not a stretcher.

### D8 — "Awaiting you" — max 4 rows by construction (`+page.svelte:57-74`); comment `:50-56` is
a scoping guarantee to preserve verbatim. Do not touch.

## 2. Repo-wide sweep (unpaginated lists)

| # | Page | Query | Render | Bound | Shape |
|---|---|---|---|---|---|
| R1 | /employees/[id] Documents | `+page.server.ts:141` → `documents.ts:22-37` | `+page.svelte:1754` | none | table |
| R2 | /employees/[id] History | `+page.server.ts:143` → `employees.ts:1307-1320` | `+page.svelte:1864` timeline (+nested `:1886`) | none | stack |
| R3-R6 | /employees/[id] Loans/CashAdv/RecEarn/RecDeduct | `+page.server.ts:122-125` | `:1067/:1131/:1194/:1392` | none | tables |
| R7 | /employees/[id] Leave Balances | `:147` → `leave.ts:110-117` | `:854` | none | stack (config-scale) |
| R8 | /employees/[id] Benefits | `:150` → `benefits.ts:126` | `:1029` | none | stack |
| R9 | /employees/[id] supervisor picker | `:177-185` full roster | `:511`, `:1692` | none | select — do not cap |
| R10-R11 | emergency contacts / onboarding steps | in getEmployee / `:161-167` | `:905` / `:272` | none | small stacks |
| R12 | /profile Punches | `:44` → `timelog.ts:191-204` | `:246` | 14-day window (`+page.server.ts:14`) | table |
| R13-R14 | /profile Documents / Benefits | `:42` / `:43` | `:285` / `:329` | none | table/stack |
| R15 | /team matrix | `team/+page.server.ts:43-50` roster + `:69-75` attendance | `+page.svelte:136` × `:145` | none | **2-D** |
| R16-R19 | /performance 4 tables | `+page.server.ts:17,32,53,54` → `performance.ts:23-26,824-825,63-70,74-81` | `:45,:92,:132,:171` | none | tables |
| R20-R22 | /benefits enrollments/plans/picker | `+page.server.ts:19-21` → `benefits.ts:115-123,15-21` | `:265,:156,:209` | none | tables + select |
| R23-R24 | /settings/org assignment/positions | `+page.server.ts:20,23` | `:304,:145` (client-side search only) | none | tables |
| R25 | /settings/roles users | `:18` listOrgUsers | rows; pills capped `PILL_CAP :239-241` | rows none | table |
| R26 | /leave/balances | `:17` listOrgLeaveBalances | `:81` × `:101` | none | **2-D**; IS the view-all target for /leave |
| R27-R31, R33 | /branches, /departments, /settings/offboarding, posting-approvers, statutory-rates pending, salary-grades/schedules/pay-codes/org-chart | respective loads | respective svelte | none | config-scale |
| R32 | /payroll/[id] entries | run include | 6 `{#each}` | none | one row per employee per run |
| R34 | /api/v1/dashboard JSON (`dashboard.ts:222,238-241 take 3,271,303-306 take 5`) | API only, `getEmployeeMetrics`/`getManagerMetrics`/`getAdminMetrics` no longer used by the page | — | mixed | not a UI target |

## 3. Precedent to reuse

Max-height/scroll (complete grep):
- `dashboard/+page.svelte:307` — `max-h-96 space-y-2 overflow-y-auto` (the target shape)
- `DevLoginSwitcher.svelte:86` — `max-h-96 overflow-y-auto py-1`
- `employees/[id]/+page.svelte:510` — `max-h-48 ... overflow-y-auto` (supervisor picker)
- `ui/Dialog.svelte:128` — `flex max-h-[90vh] flex-col overflow-hidden` (behind `scroll` prop)
- `payroll/CalculatorWindow.svelte:75` `max-h-[90vh] max-w-[90vw]`; `:147` `min-h-0 flex-1 overflow-y-auto p-4`
- `performance/templates/[id]/+page.svelte:436` — `max-h-[70vh] overflow-y-auto pr-1`
- `(app)/+layout.svelte:388` sidebar; `settings/roles/+page.svelte:304`, `TimesheetModal.svelte:326` dialog bodies
- `app.css:103-107` — global textarea `max-height: 16rem` (#70)

Responsive facts: zero `sm:|md:|lg:|xl::max-h` hits in src/. `min-h-0 flex-1 overflow-y-auto` is
the house "scroll inside a flex column" pattern. Cards already `flex h-full flex-col`
(dashboard `:251` Upcoming Events, `:334` Announcements) are structurally ready.

View-all pattern: `leave/+page.svelte:60-70` (canonical, capability-gated, placement comment) and
`dashboard/+page.svelte:155` `.btn-row` header variant. `.btn-row` at `app.css:214-226`
(#68/#76 comment at :212-213).

Query-cap house style: named default param on the service, overridden at call site with a
justifying comment (`dashboard/+page.server.ts:119-121` is the model). Existing caps: 3, 5, 5,
8→25, 10.

## 4. Design-system facts

- `.card` is a CSS class (`app.css:234-236`), rationale at `:230-233`. **No Card/Panel component
  exists.** ui/ inventory: BackButton, Badge, Banner, ConfirmButton, ConfirmDialog, Dialog,
  EmptyState, LoadError, MaskedField, PageHeader, PeriodPicker, ReasonDialog, Skeleton,
  TableSkeleton, Table, Toaster.
- `Table.svelte:1-40` is the one list primitive (replaced 49 hand-rolled tables; renders stacked
  cards below `sm` per its header comment `:6-11`). **No height/scroll prop.** A max-height at
  Table level affects both desktop table and mobile card stack.
- `tailwind.config.ts`: extend has only fontFamily/colors/borderRadius. No maxHeight, no screens
  override → default breakpoints. Only custom utility `.scrollbar-none` (:62-70). Container
  padding 1rem / sm 1.5rem / lg 2rem.
- Breakpoint usage counts in src/: sm 112, lg 55, xl 9, md 6, 2xl 0 → **two-breakpoint system
  (sm/lg)**; do not introduce md/2xl.
- `dashboard/+page.svelte:143-146`: `grid-cols-1` is load-bearing (minmax(0,1fr) ellipsis at
  390px). New wrappers must not reintroduce a min-content floor.

## 5. Counts-not-lists (do not touch)

Attendance Today (`+page.server.ts:62-76` groupBy → `:157-175`), Active Employees (`:35-37`),
Pending Approvals (`:51-55` countPendingApprovals → `:199-217`), Last Payroll (`:56-60`
findFirst), On Leave Today (computed, not rendered — `tests/e2e/dashboard.spec.ts:5-6`), My
Status counts (`dashboard.ts:155,157-159`), "Awaiting you" (max 4).

## 6. Tests pinning current rendering

- `tests/e2e/dashboard.spec.ts:7-24` metric-card nav (safe under caps); `:45-65` and `:67-71`
  announcement `li` locator — safe today (`createdAt desc` + take 5) but over-specified because
  the notification feed renders the same title (comment `:60-61`); re-run after any Recent
  Activity change.
- `tests/unit/dashboard-org-scoping.test.ts:168` `recentActivity` length 1 — pins API-only
  `getManagerMetrics` (`dashboard.ts:253`), not the page; shared-helper edits could touch it.
- `tests/e2e/pagination.spec.ts:89,:97` `toHaveCount(10)` — guards `paginate()`/`Pagination.svelte`.
- **No test asserts a rendered row count for any of R1–R33.** No existing cap (take 25/5/5) is
  asserted anywhere.

## 7. Ranked offenders

1. Dashboard Upcoming Events — markup + post-sort slice (query take unsafe)
2. Dashboard Upcoming Regularizations — query take ONLY after adding orderBy startDate asc
3. /employees/[id] 201 file (History `:1864`, Documents `:1754` worst) — query take safe for
   History/Documents EXCEPT documents reuse (see traps)
4. Dashboard Postings awaiting approval — query take safe; view-all mandatory (actionable rows)
5. /team matrix — capping members query silently changes the attendance fetch (coupled `:69`)
6. /benefits enrollments — query take safe (`benefits.ts:116`)
7. /leave/balances — 2-D; it IS a view-all destination; needs a count for clamping
8. /performance 4 tables — query take safe (all orderBy desc)
9. /settings/org assignment — client filter `filteredEmployees` needs rework if query-capped
10. /payroll/[id] entries; 11. /profile punches (windowed, markup backstop only);
12. /settings/roles users; 13. config-scale tables (markup backstop only);
14. roster selects (do not cap; typeahead = backlog)

## Fetch-bound vs markup-bound traps (binding)

1. `listUpcomingEvents` roster read (`dashboard.ts:471`) — cap merged output post-`:591`, never
   the query.
2. `listUpcomingRegularizations` (`dashboard.ts:22`) — sort is post-fetch (`:53`); add
   `orderBy: { startDate: 'asc' }` BEFORE any take; negative-control it.
3. `/team` members (`team/+page.server.ts:43`) — reused at `:69-75` (`in: members.map`) and
   `attendanceMap :78+`; capping members changes derived attendance.
4. Picker domains (dashboard `:377`, employees `:511/:1692`, benefits `:209`,
   posting-approvers) — never cap.
5. `employees/[id]` documents (`+page.server.ts:141`) — reused at `:165`
   (`documents.map(d => d.category)`) for `getEmployeeOnboarding`. **Query cap corrupts the
   onboarding checklist.** Render-cap only, or cap after the onboarding computation.
6. `/requests/approvals`, `/requests/proposals`, `/separations`, `/inventory`, inquiries
   (employee branch) — `paginate(url, rows.length)` then slice; a query take breaks page-count
   arithmetic (see query-level-pagination note :29-45). Out of phase-10 scope anyway.

## Test gaps

No cap/ordering/scroll behaviour is asserted anywhere. Fully-Automated: service-level cap +
ordering asserts (mock-db harness shape in `dashboard-org-scoping.test.ts`); e2e `toHaveCount`
per capped card mirroring `pagination.spec.ts:89`. Hybrid: view-all link + destination shows the
overflow (needs seeded fixture). Agent-Probe: scrollHeight > clientHeight + computed max-height;
390px/1440px look. Known-Gap: no viewport-matrix Playwright projects exist.

## Infra suggestions

Viewport-matrix Playwright projects (390/768/1440) would make the responsive requirement
machine-provable. A `maxHeight` affordance on `Table.svelte` + a `.card-scroll` companion to
`.card` gives one place to change instead of ~20. Component-DOM harness gap already recorded
(component-test-dom-environment / a11y-component-test-harness notes). Read
`phase-03-responsive-sweep_NOTE_03-09-26.md` before planning — it overlaps the responsive
requirement.

## Open questions raised (orchestrator rulings recorded in the plan prompt)

Q1 service boundary; Q2 missing view-all destinations; Q3 cap value; Q4 max-height idiom;
Q5 Table.svelte scope; Q6 2-D axes; Q7 regularizations ordering under a cap.
