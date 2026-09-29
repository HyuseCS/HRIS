---
name: note:toast-stack-overlaps-upcoming-events
description: "The notification toast stack overlaps the Upcoming Events card top-right for PAYROLL_OFFICER"
date: 18-09-26
feature: ui-ux-overhaul
---

# Toast stack overlaps Upcoming Events for PAYROLL_OFFICER — NEW PLAN REQUIRED

Date: 2026-09-18
Source: `dashboard-layout_INNOVATE-SUPPLEMENT_18-09-26.md` F7, screenshot
`screens/payroll_officer_light_1440_top.png`.

## The finding

Five stacked "e2e byline ... - New" toasts (each with its own dismiss control) render over the
top-right corner of the Upcoming Events card for the PAYROLL_OFFICER role at 1440px, light theme.

## Why it is not folded into the dashboard-layout task

The toast stack is a separate notification component, not one of the dashboard-layout plan's
Touchpoints (`src/routes/(app)/dashboard/+page.svelte` only). Fixing overlap needs a change to the
toast/notification component's positioning, not the dashboard page.

## Owner

Whoever next touches the toast/notification component.
