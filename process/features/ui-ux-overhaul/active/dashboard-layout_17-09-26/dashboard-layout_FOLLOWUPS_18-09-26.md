---
name: report:dashboard-layout-followups
description: "The 18-09-26 owner follow-up round that replaced S2's zone-1 layout with permanent title-row icon dropdowns, plus adjacent /leave/balances, /team, /recruitment and viewport-fit work on the same branch"
date: 18-09-26
feature: ui-ux-overhaul
plan: process/features/ui-ux-overhaul/active/dashboard-layout_17-09-26/dashboard-layout_PLAN_17-09-26.md
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: dashboard-layout
---

# Dashboard layout — FOLLOWUPS (18-09-26)

**TL;DR** — After S1–S3 shipped and the owner accepted the live probe, they asked for one more
change: the `NEEDS A DECISION` zone (three cards eating the top of the page) became three
permanent title-row icon buttons with anchored dropdown panels. That landed in `bbdceaf` and
`564e2df`. Six more commits on the same branch, outside this plan's touchpoints, did unrelated
title-row and viewport-fit work: recruitment title rows, `/leave/balances` pagination + Container,
`/team` + `/leave/balances` onto the fill-the-window height rule, and a viewport-cookie row-fit
rollout to 13 list views. All gates green throughout: format, lint, svelte-check 0 errors, vitest
2703/2703, e2e 157/157.

## Per-commit account

| Commit | What changed | Supersedes / relates to this plan |
|---|---|---|
| `bbdceaf` | `feat(dashboard): move the decision cards into title-row icons with dropdown panels`. Regularizations, postings, and awaiting-you cards become three capability-gated (`canPost` / `canDecidePostings` / `canApprove`) icon buttons on the dashboard title row, each with a count badge and an anchored dropdown (`role="region"`, closes on Escape / outside click / second click). Posting rows link to `/recruitment/{id}`; the regularizations note moved into a `HelpTip`; the awaiting-you panel lists real pending items via new `listPendingApprovals()` in `approvals.ts` (reuses the same queries `countPendingApprovals` already ran, so badge and list agree). `dashboard-layout.spec.ts` rewritten for buttons/regions. | **Supersedes S2's zone-1 (`NEEDS A DECISION`) section** — the `<section>`+`{#if decisionCount}` card row is gone; `decisionCount` and `cols(decisionCount)` no longer exist for that zone. **Carries S1's bound forward** — `max-h-80`/`min-h-[7rem]`/`overflow-y-auto` now live on each dropdown's `<ul>` instead of a page-body card. |
| `564e2df` | `feat(dashboard): keep the title-row icons visible at zero`. The three icons vanished at count-zero, changing the header shape between visits. Now they show for anyone entitled to act; only the badge hides at zero, and an empty panel says so. Adds a `payroll` account (`payroll@veent.ph`) to `tests/e2e/helpers.ts`, and a payroll-officer zero-state e2e. | **Closes** the plan's own Test Infra note "no `payrollOfficer` account in `helpers.ts`" — a seeded account now exists; see Backlog note below (moot, not written). |
| `75878eb` | `fix(recruitment): put New Job Posting and Back on the title row`. Not a Touchpoint of this plan. | Independent — same branch, same "one page action on the title row" owner rule. |
| `1e337c5` | `feat(leave): paginate the balances page and move it onto the Container template`. Not a Touchpoint. | Independent. |
| `624f622` | `fix(leave): one-line column headers on the balances table`. Not a Touchpoint. | Independent, follow-on to `1e337c5`. |
| `81b7ffb` | `fix(leave): tighter body rows on the balances table`. Not a Touchpoint. | Independent, follow-on to `1e337c5`. |
| `b43ee6a` | `feat(leave): nine balances rows per page`. Not a Touchpoint. | Independent, follow-on to `1e337c5`. |
| `ecf5e33` | `fix(ui): put /team and /leave/balances on the fill-the-window height rule`. Not a Touchpoint. | Independent. |
| `f289962` | `feat(lists): rows per page follow the window height`. A `vp` viewport cookie (set on load/resize in `(app)/+layout.svelte`) feeds `fitPageSize()` in `src/lib/server/pagination.ts`; applied to 13 single-table list views. Not a Touchpoint. | Independent. Two known wrinkles below. |

Dev-DB fixes made by agents during this round (not code, not committed): `employee@veent.ph`
roles reset to `{EMPLOYEE}`; `payroll@veent.ph` password hash reset to the seeded value (the seed
upsert never rewrites `passwordHash` on an existing row).

## Owner decisions taken, in order

1. Icons hide-at-zero → **reversed** to permanent, badge-only hide-at-zero (`bbdceaf` → `564e2df`).
2. Dropdowns, not modals — kept throughout.
3. "List mode" (the awaiting-you panel) = real pending items via `listPendingApprovals()`, not a
   static count — kept.
4. No-vertical-scroll on `/leave/balances` → **reversed** to the fill-the-window rule (matches
   `/employees`) once a real scrollport existed (`ecf5e33`).
5. `/leave/balances` page size 8 → 6 → 8 → 9, then superseded by the viewport-cookie fit
   (`1e337c5`, `624f622`/`81b7ffb` implied a resize, `b43ee6a`, then `f289962`'s cookie fit takes
   over row-count decisions for this page going forward).
6. The "one more row" chase (repeated row-height tightening on `/leave/balances` to fit a
   768px window) was closed by the owner once `f289962` made row count follow the actual window
   height instead of a fixed guess.

## Known wrinkles of the viewport-cookie approach (`f289962`)

1. The first page load in a fresh browser (no `vp` cookie yet) renders at the old fixed fallback
   size, then re-renders at the fitted size after the cookie is set on that same load's client-side
   resize handler — a visible one-time reflow for a brand-new session.
2. The attendance **employee** view (not the matrix view) still scrolls roughly 110px at a
   1366x768 viewport, unlike the other 12 fitted views — see the backlog note below.

## Backlog

- (a) View-all/count link on the alert panels —
  `dashboard-alert-panels-need-view-all-link_NOTE_18-09-26.md`
- (b) Toast stack overlapping Upcoming Events for PAYROLL_OFFICER —
  `toast-stack-overlaps-upcoming-events_NOTE_18-09-26.md`
- (c) Dev-DB e2e residue hygiene (255 `Testcase …` employees, 27 `E2E-F4-self-…` postings) —
  `dev-db-e2e-residue-hygiene_NOTE_18-09-26.md`
- (d) Real employee photos (no photo field; `Monogram` used) —
  `real-employee-photos-no-field_NOTE_18-09-26.md`
- (e) Attendance employee view min-clamp scroll at 1366x768 —
  `attendance-employee-view-min-clamp-scroll_NOTE_18-09-26.md`
- (f) Requests/timesheets and the two other card-grid queues have no viewport fit —
  `queue-pages-not-viewport-fit_NOTE_18-09-26.md`
- **Not written** — the plan's own scheduled stub
  `e2e-no-payroll-officer-account_NOTE_17-09-26.md` is moot: `564e2df` added a seeded `payroll`
  account to `tests/e2e/helpers.ts` in this same round, closing the gap the stub would have
  named.

## Rule improvements (proposed, not enforced)

1. A plan's "Blast Radius" table (2 files, presentation-only) does not obligate the owner to stop
   asking for more changes on the same branch same day. Consider a convention where a plan that
   ships and gets superseded same-day gets a `FOLLOWUPS` doc (this one) rather than a PLAN rewrite
   — worked well here; worth naming explicitly in the planning context doc.
2. `dashboard-layout_INNOVATE-SUPPLEMENT_18-09-26.md`'s F7 finding (toast overlap) and its A6
   backlog stub both matched the eventual backlog note 1:1 — screenshot-fed INNOVATE supplements
   that name a backlog stub in advance are worth keeping as the norm for UI plans.
3. The registry's per-task claim table (this task's entry in `phase-blast-radius-registry.md`)
   listed only the plan's original 2 Touchpoints; the follow-up round touched 3 more files
   (`+page.server.ts`, `approvals.ts`, `helpers.ts`) that were never re-claimed. A registry claim
   should be amendable inline when a same-day follow-up expands the file set, not just closed at
   the original scope.
4. `f289962`'s commit message named its own two known wrinkles in prose; that made this
   FOLLOWUPS doc's "known wrinkles" section a direct lift instead of a re-derivation — good
   practice, worth calling out as a convention for any commit that ships with a known residual.
