---
name: note:attendance-employee-view-min-clamp-scroll
description: "The attendance employee view still scrolls roughly 110px at 1366x768 after the viewport-cookie row-fit rollout"
date: 18-09-26
feature: ui-ux-overhaul
---

# Attendance employee view still scrolls ~110px at 1366x768 — NEW PLAN REQUIRED (low priority)

Date: 2026-09-18
Source: `f289962` ("rows per page follow the window height") commit message, self-reported known
wrinkle.

## The finding

After the `vp` viewport-cookie row-fit rollout (`fitPageSize` in `src/lib/server/pagination.ts`),
the attendance employee view still scrolls roughly 110px at a 1366x768 viewport, unlike the other
12 list views it was applied to.

## Why it is not folded into that commit's own follow-up

`f289962` is already the fix for the general case (13 list views); this is a known residual on
one specific view, worth its own investigation rather than blocking the general rollout further.

## Owner

Whoever next touches `src/routes/(app)/attendance/+page.svelte` or `fitPageSize` — likely a
row/chrome height measurement specific to the employee (non-matrix) attendance view.
