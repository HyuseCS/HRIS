---
name: note:queue-pages-not-viewport-fit
description: "Requests/timesheets and the two other card-grid queue pages were excluded from the viewport-cookie row-fit rollout"
date: 18-09-26
feature: ui-ux-overhaul
---

# Card-grid queue pages have no viewport fit — NEW PLAN REQUIRED (low priority)

Date: 2026-09-18
Source: `f289962` ("rows per page follow the window height") commit message, deliberate
exclusion list.

## The finding

`f289962` applied `fitPageSize` (viewport-cookie-driven row counts) to 13 single-table list
views, but deliberately excluded: audit-log, the two-table timesheets page, and the three
card-grid queues (per the commit message — requests, and two others sharing that layout). Those
pages keep fixed row/card counts and can still under-fill a tall window or scroll on a scaled
display.

## Why it is not folded into that commit

`fitPageSize` is built for a single measured table row height; a card-grid or two-table layout
needs its own row/chrome measurement logic, which is new scope, not a mechanical application of
the existing helper.

## Owner

Whoever next extends `src/lib/server/pagination.ts`'s viewport-fit logic to card-grid layouts.
