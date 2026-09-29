---
name: note:dashboard-alert-panels-need-view-all-link
description: "The regularizations/postings/awaiting-you dropdown panels have no view-all or count link — needs query-param filter support on /employees and /approvals first"
date: 18-09-26
feature: ui-ux-overhaul
---

# Dashboard dropdown panels have no "view all" — NEW PLAN REQUIRED

Date: 2026-09-18
Source: `dashboard-layout` task follow-up round (`bbdceaf`), carried from the
INNOVATE-SUPPLEMENT's A5 (`dashboard-layout_INNOVATE-SUPPLEMENT_18-09-26.md`).

## The finding

The three title-row icon dropdowns (regularizations, postings, awaiting-you) each list a capped
set of items with no way to jump to a full list. At real volume (255 regularization rows, 27
postings in this dev DB) a dropdown can only ever show a slice.

## Why it is not folded into the dashboard-layout task

`src/routes/(app)/employees/+page.server.ts` only accepts `search`, `department`, `branch` and
`status=offboarded` — there is no employmentType or "pending regularization" filter to deep-link
into. Adding one is new scope on a different route (`/employees`, and likely `/approvals`), not a
dashboard change.

## Owner

Whoever next touches `/employees` list filters, or a future dashboard follow-up once that filter
exists.
