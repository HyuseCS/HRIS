# Veent HRIS — Full-System UI/UX Audit

**Date:** 2026-09-03
**Method:** dual-track per the Impeccable critique playbook — 7 isolated design-review agents (one per app area: shell/nav, people, time & attendance, payroll, requests/cases, performance/recruitment, settings/reports) + 1 deterministic detector scan. ⚠️ Browser leg degraded: no browser automation tool was available this session, so this is a **source-code review**, not a live-page one. No files were changed.
**Scope:** 63 pages, 3 layouts, 105 `.svelte` files under `src/routes` and `src/lib/components`.
**Mode:** Operate (task completion, scanability, consistency outrank expression).

---

## 1. Verdict

The functionality is genuinely good and deeply authored for this product — Philippine statutory payroll, the no-arithmetic evaluation rule, audited salary reveals, maker-checker chains. Nothing here is generic template UI. **The problem is aggregate, not per-element:** a flat 20-item sidebar, duplicate surfaces for the same task, a shared UI kit that most pages ignore, and consistency that tracks whichever page was built last. Individually most screens are competent; together they read as a different app on every click. This is fixable with reorganization and convergence, not a visual redesign.

### Design health score (Nielsen, system-wide)

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 2 | Most saves succeed silently; Toaster exists, almost nothing uses it; approvals dot hides the count |
| 2 | Match system / real world | 2 | Raw enums shown to users (`TERMINATION`, `SELF_ASSESSMENT`); employees asked to type `contactAddress` |
| 3 | User control and freedom | 2 | Evaluator can lose ~60 typed fields on navigation; no backward move on the hiring pipeline; no sidebar collapse |
| 4 | Consistency and standards | 1 | The dominant failure — 5+ badge systems, 4 error-banner variants, 3 row-click patterns, 4 add-form patterns |
| 5 | Error prevention | 2 | Double-submit guards are excellent and universal, but the highest-stakes actions (offboard, void, release, net-pay override) fire unconfirmed |
| 6 | Recognition rather than recall | 2 | 20-item flat nav forces linear scans; labels contradict routes (Inquiries→/complaints, Stores/Branches) |
| 7 | Flexibility and efficiency | 2 | Bulk actions exist but unevenly (bulk reject without bulk approve); no shortcuts; no combined approvals view |
| 8 | Aesthetic and minimalist design | 2 | Per-element the quiet dense style is well executed; the aggregate (everything top-level, 1,800-line pages) is not minimal |
| 9 | Error recovery | 3 | Long-form error routing (zod path → focused field) is genuinely strong; banner styling drifts |
| 10 | Help and documentation | 2 | Some of the best inline explanatory copy I've seen in an admin app, but coverage is uneven and there's no help surface |
| **Total** | | **20/40** | **Acceptable (low end) — significant improvement needed, foundation is solid** |

**Deterministic detector:** 1 finding across 105 files (`side-tab` on `src/lib/components/recruitment/ApplicantKanban.svelte:100` — stage-colored left border; arguably functional kanban idiom, low priority). The mess is architectural/behavioral, which the detector doesn't measure — do not read "1 finding" as "clean."

---

## 2. Showstoppers (P0)

- **P0-1 — Legacy `/approvals` redirect sends approvers to the wrong page.** `src/routes/(app)/approvals/+page.server.ts:6-7` redirects 308 to `/requests` (My Requests — the user's own filings), but the approval inbox lives at `/requests/approvals`. Bookmarks, old links, and muscle memory silently land on the wrong surface. Fix: redirect to `/requests/approvals`.
- **P0-2 — The Audit Log page is an orphan.** Zero inbound links anywhere: not on the reports index (12 cards, none audit-log), not in the sidebar. A compliance-critical page reachable only by typed URL (`src/routes/(app)/reports/audit-log/+page.svelte`). Fix: card on the reports index + sidebar child, capability-gated.
- **P0-3 (crash risk) — Template-builder preview can blank on duplicate rating values.** New rating rows mint at `value: scale.min` (`RatingScaleEditor.svelte:21`) while the preview keys the each-block by `row.value` (`ReviewFormRender.svelte:169`). Two "Add row" clicks before editing = duplicate keys = Svelte throws, preview dies mid-authoring. Fix: key by index or mint ids.

---

## 3. Systemic themes — the overhaul backbone

These recur across every area. Fixing them page-by-page will not work; each needs one decision applied everywhere.

### T1 — Navigation / information architecture (P1, the "sidebar is a mess" diagnosis)

- **HR_ADMIN sees ~20 ungrouped top-level items** (up to 22 on food-service tenants, ~31 destinations with groups) in one flat scroll with no section headers (`(app)/+layout.svelte:113-262`). Order interleaves self-service and admin at random: Payslips and Profile sit between the approvals group and Performance; Payroll is wedged between Stores and Separations.
- **Label collisions:** the Requests group contains children "My Requests" and "Requests"; "Timesheets" appears twice (top-level `/timesheets` and group child `/requests/timesheets`); the group is called "Requests/Approvals".
- **Label/route contradictions:** "Inquiries" lives at `/complaints`; on food-service tenants `/team` is labelled "Branches" while `/branches` is labelled "Stores"; page titles say "Stores", buttons say "Add a branch".
- **MANAGER inherits the entire admin nav** (Employees, Recruitment, Benefits, Inventory, all Settings) because `isAdmin = canAny(roles,'MANAGE_HR')` and MANAGE_HR includes MANAGER (`+layout.svelte:94`, `rbac.ts:26`). A branch lead gets a 19-item HR-department sidebar.
- **Settings is split-brained:** the hub shows a flat, unordered 17-card grid (`settings/+page.svelte:123-133`); the sidebar sub-nav shows only 8 of 17 destinations, under different names ("Holiday Calendar" / "Holidays" / "Public Holidays" are one page; same for Roles, Schedules, Pay codes). Nine settings pages are reachable only via hub round-trips. Two cards jump out of `/settings` into `/payroll/*`.
- **Payroll has no sub-nav at all** despite six related pages and a `+layout.svelte` sitting there ready to host one: Config and Statutory Rates are reachable only through Settings; Periods/Calculator only via header buttons that sign-off roles don't get; `/payroll` appears in two nav rows for sign-off roles and both highlight active simultaneously.
- Eval Templates is the only child page promoted to top level; the active-state logic is a hand-maintained exception list (`+layout.svelte:587-590`).

**Fix direction:** 4–5 labeled nav sections matching the HR mental model (My Work / People / Time / Pay / Performance / Organization+Settings); pure array resort — the mechanism already exists. One canonical label per destination reused in nav, hub, and page title. Payroll tab sub-nav in its layout. Gate admin/settings nav on `ADMINISTER_HR_ORGWIDE`, not `MANAGE_HR` (verify each route's own guard first). Rename children by task: "Approve requests", "Approve timesheets".

### T2 — Light mode is broken wherever status is shown (P1)

Dark-tuned colors hardcoded without a light variant, in at least five independently hand-rolled `statusClass` copies:

- `text-green-400` / `text-yellow-400` / `text-gray-400` on 15% tints — below WCAG AA on white. Instances: `employees/+page.svelte:125-131`, `team:15-23`, `profile:348-352`, `employees/[id]:141-146`, `attendance:80-88`, `leave:41-47`, `requests:75-81`, `requests/[id]:52-58`, `complaints:25-29`, `separations:17-21`, `performance/+page.svelte:9-15`, `recruitment:218-224`, `applicant:287-294`, `settings/roles:213`, `settings/org:139-140`, `schedules:65-66`, `audit-log:184-192`, and more.
- **`.badge-gray` is `bg-white/10 text-white/50` — literally invisible on white** (`src/app.css:159-173`). DRAFT payroll runs and OPEN periods render an unreadable pill.
- Error banners drift the same way: `text-red-400`-only variants on attendance, periods, profile, schedules vs the correct `text-red-600 dark:text-red-400` used elsewhere.
- Scrollbar hover hardcodes `hsl(0 0% 28%)` (`app.css:140-142`).

**Fix direction:** one shared Badge component (or theme-paired `.badge-*` classes: `text-green-700 dark:text-green-400`) + one shared banner recipe; delete every inline `statusClass`. The correct pattern already exists in the codebase — this is convergence, not invention.

### T3 — Destructive-action friction tracks the page author, not the stakes (P1)

Protection is inverted: low-stakes deletes get the kit `ConfirmButton` while the most consequential actions fire on one bare click.

| Action | Stakes | Current friction |
|---|---|---|
| Offboard employee (`employees/[id]:1783-1809`) | Disables a person's employment record | **None** |
| Period void (`payroll/periods:196-206`) | Un-undoable, credits back amortization | **None** (run void on the next page gets a full ConfirmButton) |
| Net-pay override (`payroll/[id]:263-271`) | Rewrites someone's pay; negative values allowed, no `min` | **None** |
| DOLE multiplier save (`payroll/config`) | Rewrites OT pay for every future run | **None** |
| Statutory proposal Confirm (`statutory-rates:~215-235`) | Applies org-wide tax tables | **None**, and no double-submit guard (the #108 pattern guarded everywhere else) |
| Release review to employee (`performance/reviews/[id]:173-180`) | Irreversibly discloses evaluator's entries | **None** |
| Deactivate user (`settings/roles`) | Locks a person out | **None** |
| Separation finalize/undo (`separations/[id]:210-232`) | Money movement + login disable | Native browser `confirm()` |
| Attendance reset (`attendance:18-21`) | Discards a manual edit | Native `confirm()` |
| Inventory row delete, branch close, holiday delete | Low | Kit ConfirmButton ✓ |

**Fix direction:** one rule — anything irreversible or money/person-affecting goes through `ConfirmButton`/`ConfirmDialog` with a consequence-naming message. Replace both native `confirm()` calls.

### T4 — The UI kit exists and almost nobody uses it (P1)

The kit was built to end exactly this drift (PageHeader's own comment: "six different h1 strings across 52 pages"; EmptyState's: "31 improvised no-rows cells") and then wasn't adopted:

- **PageHeader:** used by payslips, periods, proposals, most settings subpages; hand-rolled `<h1>` everywhere else including both hub pages, dashboard, all people pages, all time pages, most payroll pages. Profile uses legacy `.page-header` CSS classes.
- **EmptyState:** used by backup, stalled sign-offs, templates, dashboard; everyone else uses bare `colspan` cells, dashed paragraphs, or bordered divs with drifting copy and punctuation.
- **Table:** payslips only. Money tables elsewhere hand-roll without `tabular-nums`; benefits money columns aren't even mono.
- **Toaster:** mounted globally, fired by almost nothing (see T7).
- **ConfirmDialog focus trap:** the roles page hand-rolled a full modal because "Neither ConfirmDialog nor ReasonDialog does this [focus trap]" (`roles:146-147`); PunchMapDialog built its own trap; TimesheetModal has a partial one; NewTimesheetDialog and ApplicantKanban's dialog have none. Five modal implementations, one correct.
- Duplicated per-page logic begging for `$lib` modules: `statusClass` ×5, `typeLabels`, `waitingFor`/`isStale`, the submit-guard factory (implemented three different ways), the ~150-char input class string repeated ~40 times on some pages vs `.input`/`.btn-primary` utilities on others.

**Fix direction:** kit-adoption sweep (mechanical, low-risk, high-visibility payoff) + lift the focus trap into a shared Dialog primitive + shared Badge/StatusPill and banner components + shared label maps.

### T5 — Duplicate and overlapping surfaces (P1)

- **Four approval inboxes** for one approver: `/requests/approvals`, `/requests/timesheets`, `/requests/proposals`, `/payroll` — no combined "awaiting me" view or summed badge.
- **Two live leave-filing forms** of different quality: `/leave/new` (top banner errors only, reachable from the dashboard) vs `/requests` New Request → Leave (per-field zod errors, `aria-invalid`). `/leave` itself tells users to file from `/requests`.
- **Three punch→timesheet creation doors with three period vocabularies:** attendance "Save as timesheet" (any same-month range), AggregatePanel (week), NewTimesheetDialog (pay period) — no cross-links, no guidance on which to use.
- **Two parallel payroll lifecycles** (runs: DRAFT/COMPUTED/APPROVED/VOIDED vs periods: OPEN→…→RELEASED), each with its own void, nothing explaining how they relate; a period row's "Detail" jumps into a run silently.
- **Emergency contact data lives in three places** on the employee page: a singular read-only card, a plural table with separate add/remove, and a third editable copy inside Update Profile (`employees/[id]:476-486, 845-943, 667-697`).
- **Three overlapping edit forms for the same fields** on `employees/[id]`: Update Profile, Change Salary, and Promote all touch title/position/rate — using the wrong one silently bypasses the audited career event.

**Fix direction:** per pair, pick one canonical surface and redirect/link the other. Unified approvals landing (tabs per domain) or at minimum a summed group badge + dashboard "awaiting you" block.

### T6 — Monster pages with no internal navigation (P1)

- **`employees/[id]` is 1,813 lines, ~16 stacked sections, ~20 POST forms, no tabs, no anchor nav.** HR's most-used page. Finding "Documents" means scrolling past loans, deductions, and two salary forms every time. Fix: tabs or sticky section nav (Overview / Compensation & Payroll / Documents / History / Actions) with the danger zone isolated.
- **`attendance` is 904 lines serving three personas** (HR correction grid, manager view, employee self-view) with ~8 stacked pre-table sections and a 5-button ungrouped bulk bar (`:342-394`). Fix: split employee self-view from HR correction; group read vs destructive actions; import behind a disclosure.
- **`settings/org` is two apps on one page:** positions catalog + a per-employee assignment table with no search or pagination — a wall of dropdowns at 100+ employees.
- **`employees/new`:** 26 fields, one page, only 9 required but nothing says what's safe to skip. Fix: "Required to hire" + collapsed "Complete later" group.
- Unbounded lists with no Pagination: separations, inventory, employee-side complaints.

### T7 — Silent success, invisible status (P2)

- Most mutations give no success signal: everything on `employees/[id]` except 4 inline banners (each styled differently), all of holidays/leave-types/org/pay-codes/salary-grades/posting-approvers/job-boards, roles activate/deactivate. Settings uses four different feedback mechanisms across pages (banner / `role="status"` / inline text / toast / nothing).
- The collapsed Requests group signals pending work with a bare 8px red dot, `title`-only (`+layout.svelte:539-544`) — invisible to screen readers; the count exists (`data.pendingApprovals.total`) and Inquiries already shows a numeric pill.
- Loading states: employees list, reports/[type], and dashboard have skeletons; the heaviest page (`employees/[id]`, ~10 queries) and everything else render nothing.
- Notifications auto-mark read after a transient toast (`+layout.svelte:78-87`) — status can vanish unseen.
- Run-detail status badge is a binary `APPROVED ? green : blue`, so DRAFT/VOIDED runs show blue on the detail page and gray/red on the list (`payroll/[id]:91`). COMPLETED is green on the performance index, blue on review detail.

### T8 — Accessibility debt in repeating patterns (P2)

- `role="link"` on `<tr>` destroys row semantics for screen readers (employees list, requests list, timesheets rows — the last also missing `preventDefault`, so Space scrolls the page while opening the modal). The leave page does it right; recruitment's version navigates away when you press Space on a row checkbox (`recruitment/+page.svelte:189-196`).
- Mobile drawer: no focus trap, no focus move/restore, no Escape (`+layout.svelte:346-350, 393-399`). Org-switcher popover: no Escape, no listbox semantics.
- `<select multiple size=4>` with "Ctrl/Cmd-click" instructions for supervisors — unusable on touch, one wrong click clears the selection (`employees/[id]:400-417`).
- Color-only signals: override `*` on run badges with no sr-text/title (`payroll/+page.svelte:171`), the approvals red dot, the schedules On/Off pill with no `role="switch"`.
- No `aria-current` on active nav links; nav lacks `aria-label`; per-tenant accent theming has no contrast guard (`themeStyle`, `+layout.svelte:33`).
- Login error box: no `role="alert"`, `text-red-400` on light (`login/+page.svelte:72`).
- Editor/Preview pane switch has no selected-state semantics (`templates/[id]:275-282`).

### T9 — Copy, naming, and brand drift (P2)

- **Raw enums as user-facing copy:** `TERMINATION` next to a person's name, `SELF_ASSESSMENT`, `PENDING_APPROVAL`, `RESIGNATION` (`separations`, `performance/+page.svelte:163,207`). Recruitment and complaints have proper label maps; requests and separations don't.
- **Login page is branded "Avipa"** — logo, title, footer — while the app says Veent HRIS everywhere (`login/+page.svelte:15-21,127`). First-touch surface names a different product. Login step 1 also enumerates every tenant org to anonymous visitors (`:35`) — customer-list disclosure.
- INFO_UPDATE asks employees to type internal field names ("e.g. contactAddress", `requests/+page.svelte:305-320`).
- Apply page speaks with the applicant's voice on an HR-only form ("Link to **your** resume", `recruitment/[id]/apply:101-103`).
- Name rendering flips between "Last, First" and "First Last" on the same page (`employees/[id]:380-382`).
- Mixed verbs for one destination: "Review" vs "Detail"; periods' "Detail" opens a *run*.
- `DevLoginSwitcher` mounted in both layout and login with "TEMP DEV — remove before merge" comments — already on staging.

---

## 4. Notable per-area findings not covered above

Full agent reports are condensed here; evidence is `file:line`.

### Shell / dashboard / login
- No way to collapse the desktop sidebar despite 20+ rows.
- Three distinct concepts share the identical clipboard icon (My Requests, Requests group, Eval Templates — `+layout.svelte:157,184,293`); 24 inline SVG paths invite drift.
- Footer identity block at 10px type; long emails truncate.

### People
- **Reveal flow drops on any save:** after HR reveals salary to edit a gov ID, saving re-masks everything and the reveal must be re-audited to continue (`employees/[id]:36-42, 627-666`). Return `revealed` through the action result.
- Branches: an all-cells-always-editable table with per-row Save — no read mode, accidental keystrokes invisible until the wrong Save (`branches:851-944`); departments uses explicit Edit-toggles. Same split on inventory (11 editable columns, no dirty state).
- Onboarding manual-step checkbox is a 16px `✓` text-glyph button, sub-24px target (`employees/[id]:190-203`).
- `EmployeeCard.svelte` is dead weight and colors non-existent status values (`PROBATIONARY`/`RESIGNED` as statuses).

### Time & attendance
- Attendance Save button sits at the far right of a 12-column horizontal scroller — off-screen on laptops in AM/PM tenants (`attendance:682-714`). Sticky action column.
- Period-selection UX diverges: raw date inputs + hand-rolled quick-picks (attendance) vs kit PeriodPicker (NewTimesheetDialog) vs bare week input (AggregatePanel).
- Balance display duplicated with different components and typography (`/leave` inline cards vs `BalanceSummary` on `/leave/new`).
- Timesheets "Total Hours" left-aligned while every other numeric column is right-aligned.

### Payroll
- Statutory editor: all four services submit together via hidden inputs — "Save" on the SSS tab silently commits forgotten edits in unseen tabs; no unsaved-changes guard (`statutory-rates:~540-547`).
- Cryptic inline "Override note (if flagged)" input beside Lock with no explanation (`periods:158-163`).
- Payslip PDF iframe: fixed 720px, no loading/error fallback (`payslips/[id]:48-50`); redundant always-green Status column on the list.
- Config success banner says "Payroll configuration saved" even after saving multipliers (`config:34-40`).
- Calculator FAB overlaps table rows on small screens; drag is pointer-only.

### Requests / cases
- Chat bubbles align by author role, not viewer — employees see their own messages on the left, HR's in the "mine" style (`complaints/[id]:346-351`).
- Bulk asymmetry: timesheet queue has bulk approve+reject; request queue has bulk reject only, unexplained (`requests/approvals:223-233`).
- Browser-tab titles leak the most on the most sensitive pages: separations put the employee's full name in `<title>`, complaints put the subject, while request detail is generic (`separations/[id]:242`).
- Emoji 📎 as the only emoji icon in the app, no `aria-hidden` (`requests/approvals:331`).
- Separations table lacks the `overflow-x-auto` wrapper its siblings have.

### Performance / recruitment
- **Evaluator's fill form (~60 inputs) has no unsaved-work protection and no draft save** — the template builder next door protects the identical work shape with dirty tracking + `beforeNavigate` + `beforeunload` (`templates/[id]:92-110` vs `reviews/[id]:30,197-221`). Port the guard.
- The no-arithmetic rule ("You type every number") is stated only beside Submit at the bottom — evaluators meet Subtotal boxes mid-form expecting autofill (`reviews/[id]:217-219`). Move it to the top of the section.
- The weight-sum hint — the builder's highest-value check per its own comment — renders as muted `text-xs`, indistinguishable from a hint (`templates/[id]:295-298`).
- Disabled Duplicate button's `title` explanation can never show: `disabled:pointer-events-none` kills hover (`templates/[id]:447-449`).
- All `allowsFreeText` recommendation options share one `recommendationOther` binding — typing in one mirrors into the other (`ReviewFormRender.svelte:329-337`).
- Kanban: filled-primary CTAs on every card (dozens of red chips vs the "red sparingly" brand rule); no backward stage correction anywhere; stage-move dialog never receives focus so its own Escape handler is dead on open (`ApplicantKanban.svelte:127-196`).
- Readiness banner ("N employees have no assigned template") links nowhere (`performance/+page.svelte:30-36`).
- Create-posting department select silently defaults to the first department — easy mis-filing (`recruitment:122-131`).

### Settings / reports
- Audit-log filter form loses its state after submit — selects never reflect the URL params, so active filters are invisible and can't be adjusted incrementally (`audit-log:54-115`).
- Reports year selector hardcodes 3 years — older payroll history becomes unreachable from the UI (`reports/+page.svelte:105`).
- Report table headers are raw column keys (`TotalGross`), no sorting; currency alignment depends on a hand-maintained `CURRENCY_COLS` set (`reports/[type]:79-96, 236-241`).
- Audit-log entity IDs truncated with no title/copy affordance (`audit-log:199`).
- Company logo preview renders any URL with no broken-image fallback (`company:106-112`).

---

## 5. What the overhaul must not destroy

Strengths the reviewers flagged independently — these are the product's character:

1. **Nav visibility and server authorization read the same capability table** (`$lib/rbac`), with per-item comments citing the issue that shaped each rule. The "shown but 403s" bug class is structurally prevented. Any nav regroup must keep this.
2. **Double-submit discipline is systemic** — per-row memoised guards with in-flight labels on every mutating form, with comments naming the duplicate they prevent.
3. **The masked-reveal flow** — server-side masking, single audited reveal, "recorded in the audit log" on the button, post-reveal format-check chips, salary-band badge only on real figures.
4. **One renderer, two modes** for evaluations — the builder preview and the evaluator's real form are the same component, so the preview cannot lie; code-level defense of the no-arithmetic rule.
5. **The blocked-approver pattern** (`payroll/[id]:427-448`) — visible, `aria-disabled`, always-visible reason, with a comment explaining why native `disabled` fails. Best-in-class; should become the kit standard.
6. **The punch page** — honest geolocation copy, split `role="status"`/`role="alert"`, location-failure-never-loses-the-punch carried through UI, copy, and no-JS fallback.
7. **Decision-ready detail pages** — request detail's attempt-grouped timeline, leave-balance ledger, removed-documents audit panel; approver cards with waiting-time, coverage shortfall, and unverified-doc chips.
8. **Honest dead-end copy** — "Used by N reviews — deactivate instead of deleting"; the redacted-subject explanation; offboarding/posting-approver setting descriptions.
9. **The token system** — full HSL set in both themes, pre-paint bootstrap, per-tenant theming, documented micro-decisions (44px coarse-pointer floor).
10. **Team attendance matrix and the "Exceptions only" filter** — task-shaped density done right.

---

## 6. Persona red flags (Operate surface → Alex, Sam, Jordan)

**Alex (power user, HR admin):** every navigation is a linear scan of ~20 sidebar rows; four inboxes to check each morning with no combined view; the monthly payroll cycle spans six pages with no sub-nav; no bulk approve on the request queue; no keyboard shortcuts anywhere.

**Sam (screen reader / keyboard):** `role="link"` rows orphan table cells; three of five modals lack focus management; the mobile drawer traps nothing and ignores Escape; the approvals dot and override asterisk are invisible; supervisors multi-select needs Ctrl-click; active nav state is color-only.

**Jordan (first-time employee):** lands on a login page branded as a different product; "Inquiries" in the nav becomes `/complaints` in the address bar; their review status reads `SELF_ASSESSMENT`; filing an info-update request asks for `contactAddress`; their own chat messages render on the wrong side.

---

## 7. Recommended overhaul sequence

Ordered so each step is independently shippable and the visible payoff comes early:

1. **P0 batch** — fix the `/approvals` redirect, link the audit log, fix the rating-row key. Tiny diffs.
2. **Nav + IA restructure (T1)** — sectioned sidebar, canonical labels, payroll sub-nav, settings hub grouping, MANAGER gating. This alone addresses most of the "jumbled" feeling.
3. **Kit convergence (T2+T4)** — shared Badge/banner with light-mode-correct colors, PageHeader/EmptyState/Toaster sweep, one Dialog primitive with a focus trap. Mechanical, wide, low-risk.
4. **Destructive-action pass (T3)** — one confirm rule applied to the table in §T3.
5. **Surface consolidation (T5)** — leave filing, punch→timesheet doors, approvals landing, emergency contacts, runs↔periods explanation.
6. **Monster-page splits (T6)** — employees/[id] tabs first (highest traffic), then attendance persona split, settings/org.
7. **Feedback + a11y pass (T7+T8)** — toast-on-success everywhere, count badge, row-link semantics, drawer focus.
8. **Copy pass (T9)** — enum label maps, login rebrand, naming table (Stores/Branches, Inquiries).

Each step maps cleanly to Impeccable commands when we get there: 2 → `shape`, 3 → `polish`/`layout`, 4 → `harden`, 7 → `audit`/`harden`, 8 → `clarify`.

---

*Method note: findings were produced by isolated per-area reviewers and cross-checked against each other in synthesis; every finding carries source evidence. Because no browser was available, purely visual issues (actual rendered contrast, spacing rhythm, responsive breakage) are inferred from code and should be spot-verified live during the overhaul — the light-mode badge findings especially will be immediately visible on first look.*

---

# Addendum (same day) — Feedback & error-handling deep-dive

**Method:** 3 additional isolated reviewers — server-side error handling, client-side error display, success feedback/toasts. Source-only, nothing changed. This section deepens and partly supersedes theme T7.

**Score adjustment:** with this evidence, heuristic 9 (error recovery) drops from 3 to 2 — the error *routing* is good where it exists, but five surfaces fail silently and the biggest page shows errors in the wrong form. **Revised total: 19/40.**

## A. The headline numbers

- **~165 mutating actions** across 53 server files. Only **~29% give a correctly-placed success signal** (toast, banner, or inline text). ~40% rely on "the row changed, trust your eyes," 8 actions redirect and lose context, and **~20 actions show literally nothing** — concentrated in the highest-stakes paths: approve, void, release, offboard, lock.
- **Toast adoption: 10 call sites in 5 files** — about 4% of mutations. Three feedback dialects coexist (toast / persistent banner / nothing).
- **`fail()` calls: 305**, in 5 payload shapes; `{ error: string }` dominates (~209). The convention is real — enforcement isn't.
- **ARIA on feedback: ~1 in 6.** `role="alert"` in 11 files, `aria-live` in 3 places, success `role="status"` on 6 of ~30 banners — and **the Toaster itself has none**.

## B. New showstoppers (P0)

- **P0-4 — The Toaster has no `aria-live` / `role="status"`** (`src/lib/components/ui/Toaster.svelte:14-17`). Toasts are the delivery channel for the entire notification system — screen-reader users receive zero notifications and zero toast feedback app-wide. One-attribute fix (`role="status" aria-live="polite"`, `assertive` for the error kind).
- **P0-5 — Approving or rejecting a request is silent.** `?/decideRequest` returns `undefined` on success (`requests/approvals/+page.server.ts:105`) while the page's `{#if form?.saved}` block sits unused (`+page.svelte:192`). The app's highest-stakes daily action gives no confirmation; the sibling bulk `rejectMany` already does it right (`:178`). Same hole on `requests/timesheets ?/review` and `payroll/[id] ?/decide` (final payroll sign-off).
- **P0-6 — Offboarding an employee is silent in both places** (`employees/[id]/+page.server.ts:642`, `employees/+page.server.ts:68` — a dead action nothing posts to). Combined with the missing confirm dialog (T3), the app's most consequential person-action has neither a "are you sure" before nor a "done" after — the only cue is cards unmounting.
- **P0-7 — `employees/[id]`: 19 of 24 actions have no error slot of their own.** The only ungated `{#if form?.error}` sits inside the Update Profile form (`+page.svelte:497-507`). A failed `addLoan` or `offboard` paints its error into Update Profile hundreds of lines away; worse, that card is gated on `canManage && status === 'ACTIVE'`, so for an **offboarded employee every document/reveal/contact failure renders nowhere — fully silent**. The inverse also holds: any of 15 unrelated successes flashes "Saved." inside Update Profile. The page's own `form?.action` disambiguation pattern (used by 3 actions) is the fix — apply it to all 24.
- **P0-8 — `payroll/periods ?/void` and `?/release`:** irreversible money actions with no confirm before (already T3) **and no message after** — all six period actions render only errors (`payroll/periods/+page.svelte:48-54, 183-204`).

## C. Silent-failure surfaces (errors the user never sees)

Beyond P0-7, four pages render no error at all for real failure paths:

| Surface | What fails silently | Evidence |
|---|---|---|
| `/leave` bulk delete | `deleteMany` fail() arrives, template renders only `form?.saved` | `leave/+page.server.ts:96` vs `+page.svelte:87` |
| `/timesheets` list-level actions | 14 server fail() sites reachable with the modal closed; error renders only inside `TimesheetModal:356` | `timesheets/+page.svelte:211, 251` |
| Dashboard `decidePosting` | no error slot; if the award panel is open the error appears under "Give award" | `dashboard/+page.server.ts:180,200` vs `+page.svelte:350,382,646,667` |
| `recruitment/[id]` publish/close/convert | only `setChannel` errors render (gated `:203-204`); publishing that fails a server rule looks like a no-op | `recruitment/[id]/+page.server.ts:101,110,118,180,192` |

Plus client-side swallowing: **all 4 `{#await}` blocks have no `{:catch}`** (employees, payroll, timesheets ×2 — a rejected streamed load replaces the skeleton with a blank list); `CalculatorPanel.svelte:76-85` ignores `result.type === 'error'` and keeps showing the stale result; the org switcher's fetch has `try/finally` with no `catch`, so an offline switch dies without its own "Could not switch" toast (`+layout.svelte:48-60`).

## D. Server-side error handling (P1/P2)

- **[P1] Raw `e.message` forwarded to the client at 13 sites in 8 files** — the fallback `if (e instanceof Error) return fail(400, { error: e.message })` catches Prisma errors too, so a banner can display a raw Prisma invocation dump (internals leak + gibberish). Files: `requests/+page.server.ts:152,175,198`, `requests/[id]:143,166,193`, `requests/approvals:139`, `requests/timesheets:107`, `separations:59`, `separations/[id]:77,96,122`, `leave/new:81`. Fix: drop that arm — rethrow to the error page, or map to a fixed friendly string.
- **[P1] No `handleError` hook** (`src/hooks.server.ts` has only auth). Unexpected errors show the generic error page with "Internal Error" and no reference ID — an HR admin mid-payroll can report nothing actionable. Fix: `handleError` that logs with a generated ID and returns "Something went wrong. (Ref: …)".
- **[P2] Zod failures collapse to a blob on ~40 forms** — messages joined with " · " into one banner (`employees/[id]/+page.server.ts:445-446`) or first-error-only (`settings/performance:51`, deliberate per the #106 comment). 11 files already return proper `fieldErrors`; 5 pages render them per-field with `aria-invalid`. Standardize on that.
- **[P2] Dead `details` payloads** — `payroll/config/+page.server.ts:46` and `recruitment/[id]:78` ship `details: parsed.error.flatten()` the client never renders; user sees only "Invalid configuration values".
- **[P3] Shape outlier:** `reports/audit-log/+page.server.ts:129` uses `{ message }` where everything reads `form?.error`.
- **[P3] Message quality split.** Good: "That Discord ID is already linked to another employee.", "Range exceeds the 2-month limit.", "Derived items can be hidden but not deleted — toggle it off instead." Bad: "Invalid input", "Invalid statutory toggle", "Missing day id", "Invalid correction", "The template structure is not valid JSON" (the user never typed JSON), "Insufficient permissions" (9+ sites, no next step).
- What's solid: a real global `+error.svelte` (branded, friendly 403/404/500 copy), no stack traces reach the client, services throw typed `error(4xx, message)` at 321 sites and actions translate via `isHttpError` — the architecture is right; the leaks are the exceptions to it.

## E. Success feedback (P1/P2)

- **[P1] Silent high-stakes successes (beyond the P0s):** run void (`payroll/+page.svelte:206-217`), attendance lock/unlock/lockTeam/unlockTeam/resetDay (`attendance/+page.server.ts:219-347` — several auto-submit `onchange`, compounding it), `settings/roles ?/setActive` (deactivates a login: no confirm, no message — pill flip is the only cue).
- **[P1] `ConfirmButton` is silent-on-success by construction** — the confirm dialog closes before the request resolves, with no busy state and no completion signal (`ConfirmButton.svelte:38-53`). Every confirmed destructive action inherits this. Fixing the primitive fixes them all.
- **[P1] Notification loss:** the layout toasts up to 10 unread then POSTs `markAllRead` — with >10 unread, the overflow is marked read without ever being shown; there is no notification center, and the only history is the dashboard's 8-row "Recent activity" (`+layout.svelte:78-89`, `notifications.ts:29-62`). Fix: mark only the toasted ids read (`markRead` exists) and/or add a notifications page.
- **[P1] Redirect-after-success loses all context in 6 flows** — employees/new → detail (and the temp-password email is sent without telling the operator), recruitment convert/hire → employee page, leave/new → /leave, `timesheets ?/create` → same page (the self-redirect discards `form`, so its own banner system never fires), apply → board, separations create → detail. None of the destinations render a "created/hired" banner.
- **[P2] 14+ dead success flags** — server returns them, no template renders them: benefits ×3, dashboard `postingDecided`, branches/inventory `{success:true}`, all 6 applicant-page actions, separations `toggleClearance`, recruitment `setChannel`. Wiring exists on one side only — evidence the intent was there.
- **[P2] "Did it save?" invisible saves** — success is pixel-identical to no-op on: branches/inventory row saves, `departments ?/setHead`, posting-approvers, salary-grade assign, org assign, row updates on job-boards/leave-types/onboarding/offboarding, and `payroll/[id] ?/override` (panel stays open, looks unsaved). Create panels are split too: schedules/periods/benefits/branches/inventory stay open with blanked fields (reads as a failed submit); org/holidays/payroll/dashboard close theirs.
- **[P2] Banners are persistent and unscoped** — form-prop banners never auto-clear and survive until the next submit; `payroll/config` shows "Payroll configuration saved" even after saving multipliers; `timesheets ?/saveEntries` renders its banner *behind the open modal* (`TimesheetModal.svelte:253`).
- **[P3] Toaster component gaps:** no pause-on-hover (6s hard timer, link-toasts can vanish mid-click), no stacking cap or de-dup, no dismiss-all; not mounted in `(auth)` so login can never toast.

## F. Long-page placement and ARIA (P2)

- Top-only banners with no scroll-into-view on exactly the pages that can't afford it: attendance (904 lines — a failed grid edit shows a banner the user scrolled past), statutory-rates (585), requests/approvals, settings/roles, employees/[id]. **Only 2 files in the repo scroll the error into view:** `performance/templates/[id]/+page.svelte:86` and `recruitment/applicant/[applicantId]/+page.svelte:32`.
- Shared single banners on multi-form CRUD pages (pay-codes, onboarding, offboarding, periods, branches, departments, holidays, inventory): after a per-row failure the user can't tell which row or action failed.
- Full per-page coverage table (error rendered? placement? `role=alert`?) is in the reviewer output; the pattern: ~46 pages render errors, 5 don't, ~30 are top-only, 11 have any `role="alert"`.

## G. The standard to copy (found in-repo)

1. **`punch/+page.svelte:276-300`** — split `role="status"` ambient region vs `role="alert"` outcome region; verdict-first copy ("Not punched."); theme-correct colors; suppresses the location line next to a failure.
2. **`performance/templates/[id]`** — derived `formError` + `role="alert"` + per-field `fieldErrors` + `scrollIntoView` on the first invalid field. The only page family solving the long-page problem.
3. **`requests/+page.svelte` and `settings/schedules`** — full `aria-invalid` + `aria-describedby` field wiring.
4. **`NewTimesheetDialog.svelte:102-108`** — the only enhance callback in the repo handling all three result types (`redirect`, `failure`, `error`).
5. **`separations/[id]` finalize/undo** — confirmed before, banner + warning after: the model citizen for destructive flows.

## H. Fix shape (one contract, applied everywhere)

The overhaul step for this addendum is one **feedback contract**: (1) every action returns `{ action, error? , saved? }`; (2) every form renders its own scoped error, `role="alert"`, scrolled into view on long pages; (3) every success fires a toast (Toaster gains `aria-live`, pause-on-hover, error variant used); (4) `ConfirmButton` waits for the result and reports it; (5) redirects carry a flash message the destination renders; (6) the `e.message` fallback and the `markAllRead` overreach are deleted. Slots into the §7 sequence as an expanded step 7, best done right after the kit convergence (step 3) since the shared Badge/banner/Dialog work touches the same files.
