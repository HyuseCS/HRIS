---
name: note:raw-enum-leftovers
description: "Raw enum renders found by the raw-enum-labels VALIDATE pass but kept out of its scope"
date: 23-09-26
feature: ui-ux-overhaul
---

# Raw enum renders left out of the raw-enum-labels fix

Date: 2026-09-23
Source: VALIDATE of `active/raw-enum-labels_23-09-26/raw-enum-labels_PLAN_23-09-26.md` (staging `1f3ce18`).

## Why these are not in that fix

The widened `labels.test.ts` regexes do not flag them, and each needs its own call.

## The sites

| # | Where | What renders raw | Note |
|---|---|---|---|
| 1 | `src/routes/(app)/profile/+page.svelte:253` | `{p.source}`: DISCORD, WEB, MANUAL | No map exists in `labels.ts` |
| 2 | `src/routes/(app)/reports/audit-log/+page.svelte:196`, `:255` (aria-label) | the audit action, e.g. LOGIN_FAILED | The filter dropdown uses the same raw codes, so it may be deliberate. Decide first. |
| 3 | `src/lib/server/services/employees.ts:1350` | builds "PART TIME" and "ON LEAVE" for the `/employees/[id]` history tab | A `.ts` builder. `tests/unit/employment-history-masking.test.ts:154` asserts 'PART TIME' and must change with it. Touches `src/lib/server/services/**`, so the umbrella hard-stop applies. |
