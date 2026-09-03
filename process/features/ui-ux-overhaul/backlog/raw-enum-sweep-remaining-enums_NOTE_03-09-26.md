---
name: note:raw-enum-sweep-remaining-enums
description: "Raw database enums still rendered to users in ~13 places that phase 08 does not map — payroll run/period, benefit enrollment, attendance day, job posting and backup status. NEW PLAN REQUIRED."
date: 03-09-26
feature: ui-ux-overhaul
---

# Raw enum sweep — the enums phase 08 does not map — NEW PLAN REQUIRED

Date: 2026-09-03
Source: outer PVL on `phase-08-copy-a11y_PLAN_03-09-26.md` — VALIDATE V3 known-gap classification.

## Gap

Phase 08 goal 1 says "no raw database enum reaches a user's eye anywhere in the app". Its S1 section
defines label maps for **six** enums only: `RequestType`, `RequestStatus`, `SeparationType`,
`SeparationStatus`, `ReviewStatus`, plus report column keys.

A repo-wide grep at `5e5cdfe` finds **28** raw `{x.status}` / `{x.type}` interpolations in
`src/routes/**/*.svelte`. Roughly eight belong to the six mapped enums. The remaining ~13 belong to
enums with no map in that plan:

| Site | Enum family |
|---|---|
| `payroll/+page.svelte:170`, `payroll/[id]/+page.svelte:92`, `payslips/+page.svelte:56`, `payroll/periods/+page.svelte:130` | payroll run / period status |
| `benefits/+page.svelte:276`, `profile/+page.svelte:351`, `employees/[id]/+page.svelte:829` | benefit enrollment status |
| `attendance/+page.svelte:622`, `attendance/+page.svelte:780` | attendance day status |
| `dashboard/+page.svelte:207` | last payroll-run status |
| `recruitment/[id]/+page.svelte:65` | job posting status |
| `settings/backup/+page.svelte:236` | backup job status |

(`branches/+page.svelte:211` is a hidden input `value`, not a render — excluded.)

## Why it is not in phase 08

Mapping six more enums plus their adoption sweep is a second S1-sized commit. It pushes phase 08 past
its stated blast radius (~40 files) and past its own out-of-scope table. Phase 08's AC1 and its S1
grep gate were therefore **scoped** by VALIDATE to the eight files that carry the six mapped enums.

## Resolution

New plan. It should reuse `$lib/labels.ts` (created by phase 03, extended by phase 08) and the same
exhaustive-against-the-Prisma-enum unit-test pattern from `tests/unit/labels.test.ts`. Only then can
the repo-wide zero-raw-enum grep gate become the real gate.

Files outside phase 08's blast radius: `payroll/periods`, `payslips`, `benefits`, `profile`,
`settings/backup`, `dashboard`, `recruitment/[id]`, `attendance` (render sites).
New API surface: N/A — presentation only.
