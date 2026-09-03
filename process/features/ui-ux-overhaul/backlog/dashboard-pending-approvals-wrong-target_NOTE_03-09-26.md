---
name: note:dashboard-pending-approvals-wrong-target
description: "The dashboard Pending Approvals card links to /requests (My Requests), repeating the P0-1 defect class at a second surface"
date: 03-09-26
feature: ui-ux-overhaul
---

# Dashboard "Pending Approvals" card points at the wrong page — NEW PLAN REQUIRED

Date: 2026-09-03
Source: outer-PVL on `phase-01-p0-fixes_PLAN_03-09-26.md` — found while grepping `/approvals`
consumers for P0-1.

## The finding

`src/routes/(app)/dashboard/+page.svelte:170-181` renders the **Pending Approvals** metric card as
an anchor with `href="/requests"`. `/requests` is *My Requests* — the user's own filings. The
approval inbox is `/requests/approvals`. The card counts `metrics.pendingApprovals` (things
awaiting the user's decision) and then sends the user somewhere that shows none of them.

This is the **same defect class as P0-1** (the legacy `/approvals` 308 redirect), at a second
surface the audit did not name.

## Why it is not folded into phase 01

Out of phase 01's Touchpoints — `dashboard/+page.svelte` is not in its blast radius, and the
program charter forbids scope growing past a phase plan's Touchpoints.

## Coupled test

`tests/e2e/dashboard.spec.ts:11` pins the current target:
`{ label: 'Pending Approvals', target: '/requests' }`, with a comment at line 10 repeating the same
stale premise. Any fix must update the spec in the same commit, or the spec turns the fix red.

## Owner

**Phase 06** (`surface-consolidation`) — it already owns the "approver has four separate inboxes,
no combined awaiting-me view, no summed badge" item from audit §T5. This card is the dashboard
entry point to that same problem.
