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
residual under AC-7's scope note, not a failure of the gate. **Most of them ARE status pills** —
16 of the 24 (measured at the S5 commit, the same basis as the table below) carry the pill shape
`bg-{tone}-500/15 text-{tone}-400`. Only the `dashboard` remainder is decorative.

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

## Reconciliation with the plan's figure

**Both numbers are right.** They measure two different things, and the difference closes exactly.
The plan's AC-7 scope note counted **all 31 matching occurrences** across its 11 named files. The
table above counts only the **24 unpaired** ones, because a colour that already has a `dark:` pair
was never a defect. Neither figure is a correction of the other.

The seven already-paired occurrences are:

```
24 unpaired (the table above)
+ 4 already-paired, one each in payroll/config, payroll/statutory-rates, reports, settings/company
+ 3 already-paired in lib/components/recruitment/ApplicantKanban.svelte
= 31
```

`ApplicantKanban.svelte` is the one that makes this look like a discrepancy: it contributes **0**
to the table, so it is easy to read as contributing nothing at all — but its stage map holds **3**
already-paired occurrences, and those are part of the plan's 31.

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

Most of these ARE status pills — 16 of the 24 (measured at the S5 commit, the same basis as the
table above), spread across all six files. **Convert those to `<Badge>`.** The component already
carries theme-paired tones and the leading dot, so it fixes light mode and the duplication in one
step; hand-pairing a pill would leave the duplication behind. The hand-pairing advice above applies
only to the genuinely decorative remainder, all of which is in `dashboard/+page.svelte`: the large
metric numbers, an icon tile, a section eyebrow, and an outline button.
