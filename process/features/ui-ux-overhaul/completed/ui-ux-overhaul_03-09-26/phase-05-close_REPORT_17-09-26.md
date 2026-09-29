---
name: report:ui-ux-overhaul-phase-05-close
description: "Close-out report for phase 5 of the Veent HRIS UI/UX overhaul — owner pass, remediation A/B, surfaces/fields/open-period, the datepicker rollout, the 17-09-26 live pass, the Container rollout, attendance/team restructure and the CodeRabbit CLI review remediation."
date: 17-09-26
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: "05"
---

# Phase 5 — `destructive-actions` — close report

**Status:** DONE — closed 17-09-26, PR #14 (`feat/uiux-phase-5` → staging) pending merge.
**Branch:** `feat/uiux-phase-5`
**Plan:** `phase-05-destructive-actions_PLAN_03-09-26.md`
**Final gates (17-09-26, at efe96ce): format:check clean; lint 0 errors; svelte-check 0 errors; unit 227 files / 2681 tests passed; e2e 148/148 passed.**

**TL;DR** — Phase 5 shipped its 16-site destructive-actions confirm sweep (already `CODE DONE`
as of 03-09-26, covered by its own report), then absorbed the owner's live pass, two remediation
rounds, a rebase onto staging, three owner-driven UI fixes (surfaces/fields/open-period), a
datepicker rollout to all 27 date inputs, a full-page Container rollout with the attendance/team
restructure, a CI needle fix, and a 34-finding CodeRabbit CLI review with 19 confirmed defects
fixed. The 17-09-26 live pass ran all 7 steps and all passed.

---

## What Was Delivered

### 1. Destructive-actions confirm sweep (03-09-26)

16 §T3 sites routed through the kit `ConfirmButton`/`ConfirmDialog`, zero native `confirm()`
left in `src/`. See `phase-05-destructive-actions_PLAN_03-09-26.md` and
`phase-05-destructive-actions_REPORT_03-09-26.md` for the full site-by-site record.

### 2. Owner pass and remediation A/B (11-09-26)

The owner ran a live P1 matrix against the confirm sweep (`phase-05-owner-pass_P1-RESULTS_11-09-26.md`),
producing 11 findings (`phase-05-owner-pass_FINDINGS_11-09-26.md`). Remediation A
(`phase-05-remediation-A-feedback-statutory_PLAN_11-09-26.md`, reports S2/S7) covered the
feedback and statutory-rates findings; remediation B
(`phase-05-remediation-B-attendance_PLAN_11-09-26.md`) covered attendance. The statutory rate
table backup used during the pass (`phase-05-owner-pass_statutory-backup-org_seed.json`) was
restored afterward.

### 3. Rebase onto staging (11-09-26)

`phase-05-rebase-onto-staging_PLAN_11-09-26.md` — validated CONDITIONAL, two accepted
deviations, executed to bring the branch current with staging before continuing.

### 4. Surfaces, fields and open-period (15-09-26)

Three owner-raised UI findings — the roles page's missing container, low-contrast form field
borders in light mode, and the inline open-period form — were scoped
(`surfaces-fields-open-period_BRIEF_15-09-26.md`), planned
(`surfaces-fields-open-period_PLAN_15-09-26.md`) and executed
(`surfaces-fields-open-period_REPORT_15-09-26.md`, screenshots in
`surfaces-fields-open-period_screens/`). All three shipped and their backlog notes are now
archived alongside this report:

- `settings-roles-no-container_NOTE_15-09-26.md` — SHIPPED in `40239f4`, `701e120`, `848ac4c`.
- `light-mode-fields-low-contrast_NOTE_15-09-26.md` — SHIPPED in `9aebc46`.
- `open-period-modal-and-toast_NOTE_15-09-26.md` — SHIPPED in `b271e42`, `ba28e7c`.

### 5. Datepicker rollout (16-09-26)

`datepicker-rollout_PLAN_16-09-26.md` replaced all 27 native date inputs with the house
component, closing `6e7b737` (close on full date typed), `a5b66ba` (year list clipping), and
`7c9634a` (screen-reader labels).

### 6. Container rollout and attendance/team restructure

`git log --oneline ecc44fa..HEAD` (oldest first, reversed below) — the full page-layout pass
that put every list/table page inside `Container`, plus the attendance-matrix-into-`/attendance`,
team-becomes-people-page restructure:

| Commit | Subject |
|---|---|
| `b5123ed` | fix(requests): let the dialog date fields fill their column |
| `162bcb9` | fix(separations): tidy the create dialog layout and move its error beside submit |
| `83fce94` | feat(attendance): paginate the one-day team roster and send the team tab to the matrix |
| `151a3f3` | feat(attendance): open on the team matrix and keep the view switch on the title row |
| `2f8f2b6` | feat(team): replace the attendance matrix with a people page |
| `6e7b737` | fix(ui): close the date picker once a full date is typed |
| `a56213c` | feat(team): show today's attendance on grid cards and fit the page on one screen |
| `18a310a` | fix(team): put the email on its own card line and show 12 list rows |
| `a2c8b3b` | fix(team): hold the container at one height and keep list rows on one line |
| `5e40a78` | fix(team): size list rows so 12 fill the list area |
| `1d5c064` | feat(ui): add a full-height PanelPage template and use it for timesheet approvals |
| `b70a070` | feat(attendance): move the matrix blurb into a help tooltip and the dates onto the title row |
| `0daf51c` | style(attendance): narrow the date fields to 160px |
| `5598f74` | feat(ui): let PanelPage host table pages |
| `40239f4` | refactor(settings): move the roles list onto PanelPage |
| `87055ee` | feat(ui): add a notice row to PanelPage |
| `c827311` | refactor(requests,payslips): move My Requests and My Payslips onto PanelPage |
| `d22201b` | refactor(reports,requests): move proposals and the audit log onto PanelPage |
| `02f828c` | feat(ui): give every search box a magnifier icon |
| `325bceb` | feat(ui): allow a page's single action on the title row |
| `27bd7af` | fix(ui): stretch PanelPage to the bottom of the screen on phones and tablets |
| `5829452` | refactor(settings): move public holidays onto PanelPage |
| `e5e1150` | refactor(complaints,recruitment): open the create forms in popups and move both lists onto PanelPage |
| `a53615e` | feat(ui): let PanelPage keep a table's header above an empty state |
| `856fea1` | fix(requests,payslips): keep the column names above an empty list |
| `a85aa4c` | refactor(employees,complaints,recruitment): full-height panels that keep their column names when empty |
| `701e120` | refactor(settings,reports,leave): keep column names above empty tables and move leave onto PanelPage |
| `b9ec508` | feat(settings): move the roles description into a help tooltip |
| `29372e5` | refactor(requests): lay out the approval queues in the page with Container |
| `848ac4c` | refactor(employees,leave,settings,reports): lay out five list pages in the page with Container |
| `8eaca35` | fix(payslips): spread the payslip columns across the table |
| `3df88b7` | refactor(requests,complaints,recruitment): lay out the three pages in the page with Container |
| `a53638a` | refactor(ui): remove PanelPage now every page lays itself out with Container |
| `3b3f5b5` | refactor(performance): fill the page with the employee's review tables |
| `379cf2c` | refactor(ui): make Container's body a flex column |
| `4076bba` | refactor(timesheets): fill the page with the My and Team lists in one Container |
| `4cf8ced` | refactor(performance): put the HR view's four boxes in Container |
| `bf84fe9` | refactor(attendance): fill the page with the Whole team matrix and filter By employee exceptions on the server |
| `f52e958` | test(ui): repoint the payroll override surface needle at the named toast guard |

`60b3adf` (`feat(ui): add Container, a content box that fills its page column`) is the primitive
this whole rollout is built on.

### 7. CI fix — success-surfaces needle (`f52e958`)

The existing `success-surfaces` gate asserted against a needle that the Container rollout moved;
`f52e958` repoints it at the named toast guard so it keeps proving the right thing rather than
going vacuously green or red on layout-only churn.

### 8. CodeRabbit CLI review remediation (17-09-26)

CodeRabbit CLI reviewed PR #14 (`feat/uiux-phase-5` → staging) directory-by-directory (225 files,
34 findings). Every finding was checked against source before acting — CodeRabbit findings are
hypotheses, not verdicts. Result: **19 CONFIRMED, 8 PARTIAL, 7 NOT A DEFECT.**

Fixed:

| Commit | Findings | Subject |
|---|---|---|
| `12b0a5e` | F2 | let Space and clicks on a row's checkbox reach the checkbox |
| `309a667` | F3 | keep the applied filters in the form and ignore invalid dates |
| `9d045ea` | F8 | wrap a single bare tab's panel so it scrolls like the multi-tab case |
| `37d780e` | F12 | show type and reason errors and cap reason at 1000 characters |
| `7c9634a` | F13 | label each row's date picker for screen readers |
| `a5b66ba` | F14 | stop the date picker year list clipping its last row |
| `bcedc8c` | F16-F18 | mark three shipped backlog notes as shipped |
| `a4a30cd` | F19-F21 | make the open-period probe scripts portable and rerunnable |
| `9342283` | F22-F33 (docs) | correct stale counts, paths and gates in phase 5 plans and reports |
| `518c9e6` | F9 | pick tax and SSS brackets by floor so fractional income in a gap is not mistaxed |
| `661a8c8` | F5 | refuse a blank net-pay override instead of writing 0 |
| `ff7f2a9` | F6 | re-seed the rates baseline from the submitted values, not live input |
| `c3c9692` | F4 | show leave balances for the chosen start date's Manila year |
| `efe96ce` | F7 | anchor the matrix default week to Manila Monday through Sunday |

Not defects: **F1, F10, F11, F15, F26, F30, F34.**

---

## The 17-09-26 Live Pass

All 7 steps ran and **all 7 PASSED**. Step 5 used temporary supervisor rows created for the
pass; those rows were deleted afterward — no seed data or fixtures were left behind.

---

## Known Residuals

- `success-surfaces` — was pre-existing stale-needle drift from the Container rollout; **now
  fixed** in `f52e958`.
- e2e parallel-run fixture clashes between `timesheet-approval` and `timesheet-queue-page-walk`,
  `payroll-approval`, and `multi-role-sod AC-29` — each passes when run alone; the clash is a
  shared-fixture ordering issue under parallel execution, not a product defect.

---

## Next

1. Merge PR #14 (`feat/uiux-phase-5` → staging).
2. Rebase `feat/uiux-phase-6` onto staging.
