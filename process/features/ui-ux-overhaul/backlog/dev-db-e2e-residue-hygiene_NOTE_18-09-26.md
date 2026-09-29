---
name: note:dev-db-e2e-residue-hygiene
description: "The local dev DB carries 255 Testcase probationary employees and 27 E2E-F4-self postings left over from prior e2e runs"
date: 18-09-26
feature: ui-ux-overhaul
---

# Dev-DB e2e residue hygiene — NEW PLAN REQUIRED (low priority)

Date: 2026-09-18
Source: `dashboard-layout_INNOVATE-SUPPLEMENT_18-09-26.md` F1/F3, confirmed live during the
dashboard-layout EXECUTE run (18-09-26).

## The finding

`feat/uiux-phase-6`'s local dev DB (`veent-db-5434`) has:
- 255 `PROBATIONARY` employees named `Testcase …`
- 27 `PENDING_APPROVAL` postings named `E2E-F4-self-…`

Both are e2e leftovers, not real data. They make the Upcoming Regularizations and
Postings-awaiting-approval cards render at unrealistic volume on every manual walk of this dev
DB, and every residue row reads near-identically ("QA Engineer · Human Resources", "Overdue by N
days"), which makes any card showing more than ~5 rows illegible as a decision tool regardless of
the layout.

## Why it is not folded into the dashboard-layout task

It is dev-DB state, not a code or layout defect. The dashboard-layout plan's own Blast Radius is
presentation-only; cleaning fixture residue is out of that scope.

## Owner

Whoever next needs a clean dev DB for a volume-sensitive manual walk. A `scripts/` cleanup script
(delete by the `Testcase …` / `E2E-F4-self-…` name patterns) is the likely fix; no schema change
needed.
