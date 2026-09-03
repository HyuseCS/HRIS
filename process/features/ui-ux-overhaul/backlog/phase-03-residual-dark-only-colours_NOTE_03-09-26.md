---
name: note:phase-03-residual-dark-only-colours
description: "Named residual from phase 03 AC-7 — dark-only status colours in the files no phase-03 section touches"
date: 03-09-26
feature: ui-ux-overhaul
phase: "03"
---

# Residual: dark-only status colours outside phase 03's section lists

**TL;DR.** Phase 03 fixed light mode wherever it touched a file. 24 colour occurrences across
6 files were left alone because no section of the phase edits those files. They are a named
residual under AC-7's scope note, not a failure of the gate. None of them is a status pill.

## Why this exists

AC-7 was scoped during VALIDATE (OD-2, default applied: scoped + backlog) to the files S1/S4/S5/S13
touch. An unscoped "the grep returns zero" gate could never have gone green inside phase 03, because
the phase does not open these files at all. This note is the record of what was left.

## Measured residual (re-counted at the S5 commit, not copied from the plan)

Pattern: `text-green-400|text-yellow-400|text-gray-400|text-blue-400` with no `dark:` pair.

| File | Dark-only occurrences |
|---|---|
| `src/routes/(app)/dashboard/+page.svelte` | 11 |
| `src/routes/(app)/benefits/+page.svelte` | 5 |
| `src/routes/(app)/recruitment/[id]/+page.svelte` | 3 |
| `src/routes/(app)/settings/holidays/+page.svelte` | 2 |
| `src/routes/(app)/requests/approvals/+page.svelte` | 2 |
| `src/routes/(app)/settings/onboarding/+page.svelte` | 1 |
| **Total** | **24** |

## Correction to the plan's figure

The plan's AC-7 scope note said **31 occurrences across 11 files**. The re-count finds **24 across 6**.
Five of the named files carry an occurrence that ALREADY has a `dark:` pair and was therefore never
a defect: `payroll/config`, `payroll/statutory-rates`, `reports`, `settings/company` (1 each), and
`lib/components/recruitment/ApplicantKanban.svelte` (0 dark-only — its stage map is already paired).
The plan counted total occurrences, not unpaired ones.

## What is NOT in this residual

Nine dark-only `text-green-400` occurrences remain inside files S4/S5 DID touch —
`employees/[id]` (5), `profile`, `complaints`, `complaints/[id]`, `payroll/periods` (1 each).
Every one is a success **banner** (`rounded-md border border-green-500/20 bg-green-500/10 … text-sm`),
not a status pill. Banners are **S13's** scope (`Banner.svelte` + the banner recipe sweep), and S13
is inside phase 03. They are not deferred — they are simply not S1–S5's to fix, and AC-7 still
covers them via S13.

## Fixing it later

Mechanical: give each occurrence a light-mode pair on the same step the badge tokens use
(`text-green-800 dark:text-green-400`, `text-blue-700 dark:text-blue-400`, and so on — see the
comment above the `.badge-*` block in `src/app.css`). Measure the composited ratio before accepting
any pair; the badge work found `green-700` at 4.40:1, under the 4.5:1 floor for 12px text.

Most of these are decorative or muted-icon uses rather than status pills, so a `<Badge>` conversion
is probably the wrong tool for them — pair the colours, do not force the component.
