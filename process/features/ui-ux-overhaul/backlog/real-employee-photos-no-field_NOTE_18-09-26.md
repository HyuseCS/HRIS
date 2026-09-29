---
name: note:real-employee-photos-no-field
description: "The app has no employee photo field — the awaiting-you dropdown panel uses a Monogram, not a real photo"
date: 18-09-26
feature: ui-ux-overhaul
---

# No employee photo field — Monogram used everywhere — NEW PLAN REQUIRED (low priority)

Date: 2026-09-18
Source: `dashboard-layout` follow-up round, `bbdceaf` (awaiting-you panel).

## The finding

The awaiting-you dropdown panel lists pending items with a `Monogram` (initials) beside each
name, because there is no employee photo field in the Prisma schema or anywhere in the app to
render instead.

## Why it is not folded into the dashboard-layout task

Adding a photo field is a schema change (new column, upload/storage path, avatar rendering
everywhere a person is shown) — well outside a presentation-only dashboard plan's blast radius.

## Owner

Whoever next scopes an employee-photo feature. Would touch `prisma/schema.prisma`, an upload
route, and every place `Monogram` is currently used as the fallback.
