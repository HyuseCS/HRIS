---
name: innovate-supplement:dashboard-layout
description: "Screenshot-fed refresh of the dashboard-layout INNOVATE pass: O2 and the height numbers hold; the fixture-volume premise was wrong; six doc-only plan amendments and three backlog notes."
date: 18-09-26
feature: ui-ux-overhaul
upstream: dashboard-layout_INNOVATE_17-09-26.md, dashboard-layout_PLAN_17-09-26.md, screens/README.md
---

# Dashboard layout — INNOVATE SUPPLEMENT (18-09-26)

Produced by a vc-innovate-agent refresh pass fed with the 24 role x theme x width screenshots in `screens/` (captured 18-09-26 at 17a98d8). The orchestrator verified F4 (no employmentType filter on `/employees`, only `search`, `department`, `branch`, `status=offboarded`) and F7 (five e2e toasts overlap Upcoming Events in `payroll_officer_light_1440_top.png`) before saving.

## TL;DR

**YES-WITH-CHANGES.** O2 (priority zones, single column) still fits. The screenshots make the case stronger: on HR_ADMIN/CEO/SUPER_ADMIN the two unbounded cards eat 93%+ of page height (17,496 px total, ~16,000 px of it 255 regularization rows + 27 posting rows). The plan's `min-h-[7rem] max-h-80` numbers are correct and need no change. What the plan gets wrong is a premise, not a design: it assumes the local DB has zero fixture rows for these cards. It has 255 + 27 residue rows. That does not break S1's CSS fix; it makes the plan's own worst-case probe rows undersell the real worst case, and it rules out a "view all" link as easy scope (the route to link to does not exist).

## F1–F8 Findings

- **F1** `hr_admin_light_1440_top.png`, `hr_admin_dark_1440_top.png`: the Upcoming Regularizations card renders all 255 rows unbounded, as RESEARCH described. Confirms S1's CSS-only fix is correctly scoped.
- **F2** `screens/README.md` heights: 17,496 px for the three approver roles vs 1,006 px for EMPLOYEE. The two alert cards are essentially the entire page for approver roles. Validates O2 over O1/O3: a cap + reorder attacks the measured problem; a rail or tab merge would not shrink this further than S1 does.
- **F3** `hr_admin_light_1440_top.png` row content: every residue row reads identically ("QA Engineer · Human Resources", "Overdue by 15 days", same date). At real volume a 320 px scroll box (~5 visible rows) shows indistinguishable rows. Affects S3 fixtures and S4 rows 4–5 (A2).
- **F4** `src/routes/(app)/employees/+page.server.ts`: only `search`, `department`, `branch` and `status=offboarded` params. No route exists to deep-link "all pending probationary employees". A "view all" link is new scope (A5).
- **F5** `src/lib/server/services/dashboard.ts` `listUpcomingRegularizations`: no `take()`/limit. The plan's "no server load, query or data shape change" holds at 255 rows; this is presentation-only.
- **F6** `employee_light_1440_top.png`, `payroll_officer_light_1440_top.png`: EMPLOYEE 2 glance tiles, 2 doors; PAYROLL_OFFICER 3 glance tiles. Both match the plan's S2 zone-count table. No amendment.
- **F7** `payroll_officer_light_1440_top.png`: five stacked toasts ("e2e byline … · New", each with a dismiss) overlap the Upcoming Events card top-right. Separate notification component, not a plan Touchpoint. Backlog (A6).
- **F8** `*_390_top.png`: cards already stack single-column. `max-h-80` is width-independent. No phone-specific rule is missing.

## Height numbers

`min-h-[7rem] max-h-80` (112 / 320 px) on both alert cards and `max-h-80` on the feed lists: **confirmed, no change.** The cap absorbs 8 rows or 255 rows alike.

## 390 px

No new plan work. One S4 wording note: on a real ~700–800 px phone viewport a 320 px card is a large share of the screen; S4 rows 6 and 10 already ask the owner to look at this live.

## Dark theme, amber and blue cards

Amber reads fine against `bg-card` in `hr_admin_dark_1440_top.png`. The blue postings card never appears inside the first 2400 px of any dark shot (buried under 255 rows), so it is inferred from the shared pattern (`border-blue-500/30 bg-blue-500/5`), not proven. Pre-change the two cards never sit side by side; post-S2 they share the NEEDS A DECISION row for the first time. New scenario, covered by A3.

## Plan amendments (all doc-only, zero code change)

| # | Section | Exact change | Cost |
|---|---|---|---|
| A1 | S3(a) fixture note | Add: "true of a fresh seed, false of this dev DB (255 PROBATIONARY `Testcase …` employees, 27 PENDING_APPROVAL `E2E-F4-self-…` postings). Test logic unchanged: it asserts computed style, not row count." | 5 min |
| A2 | S4 rows 4–5 | Add a probe row: HR_ADMIN, 1440, both themes, walk the card against the EXISTING 255-row residue (no fixture needed): card stays 320 px, scrollbar present, heading fixed. | 5 min |
| A3 | S4 row 2 | Reword to require both alert cards checked ADJACENT in the same decision-zone row, post-S2, both themes. | wording |
| A4 | Goal / S1 framing | One line: residue rows are visually near-identical at scale, so "8+ rows" proves bounded, not legible. | wording |
| A5 | Scope | Do NOT add a "view all" link; `/employees` has no employmentType filter and `+page.server.ts` is out of scope. Backlog note 1. | 0 |
| A6 | Test Infra Improvement Notes | Add a backlog stub for F7 (toast stack over Upcoming Events). | wording |

D1, D2, D3 stay locked.

## Backlog NOTEs to write at UPDATE-PROCESS

1. "View all" / count link for the two alert cards: needs query-param filter support on `/employees` (and likely `/approvals`).
2. Toast stack overlapping Upcoming Events for PAYROLL_OFFICER (F7).
3. Dev-DB hygiene: 255 `Testcase…` employees + 27 `E2E-F4-self-…` postings are e2e leftovers.

## Risk re-run on O2

Architect, Security unchanged. Performance: stronger case; the cap bounds paint work for a real 255-row org. UX: a scroll box of 255 identical rows is a weak decision tool; backlog note 1, not a blocker. Devil's advocate asked whether S1 alone is enough; rejected, F2 shows a bounded card is still buried at the bottom pre-reorder. **Verdict: GO** with A1–A6 folded in before EXECUTE.

**Status:** DONE
**Summary:** O2 and the height numbers hold; the fixture-volume premise was wrong; six doc-only amendments and three backlog notes.
**Concerns/Blockers:** Blue card legibility next to amber in dark, post-S2, is unproven by screenshot; covered by A3.
