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

## Drift correction — measured 2026-09-03 at phase 08 S1 execution

The counts above were taken at `5e5cdfe`, before phases 01-07 landed. They are now stale, and the
gap is much smaller than "~13".

Phase 03 built `src/lib/labels.ts` with **all 25** enum maps, wired them into `Badge`, and adopted
`Badge` across most list pages. Phase 08 S1 cleared the last three sites its own scope named. A
repo-wide scan (same regex the phase 08 gate uses) now finds **four** raw enum renders left:

| File | Enum |
|---|---|
| `benefits/+page.svelte` | benefit enrollment status |
| `dashboard/+page.svelte` | payroll run status (last run) |
| `payslips/+page.svelte` | payroll run status |
| `recruitment/[id]/+page.svelte` | job posting status |

`src/routes/+error.svelte` renders `{$page.status}` — an HTTP status code, not a database enum, and
correctly rendered as a number. Not a target.

Every one of the four already has a finished, exhaustively-tested map in `$lib/labels.ts`
(`BENEFIT_ENROLLMENT_STATUS_LABELS`, `PAYROLL_RUN_STATUS_LABELS`, `JOB_POSTING_STATUS_LABELS`), so
this is no longer "map six more enums" — it is four one-line `labelFor(...)` swaps plus widening the
adoption scan in `tests/unit/labels.test.ts` from its eight named files to repo-wide. That is a
small, single-commit follow-up, not the S1-sized second plan described above.

## Drift correction — measured 2026-09-22 at phase 08 item 1

The 03-09-26 count of **four** is wrong, and so are its line numbers. The real count is **twelve**.

The 03-09-26 scan looked for `{x.status}` and `{x.type}` only. That regex cannot see an entire
class of site: an enum dressed up with `.replace('_', ' ')`. That call swaps the **first**
underscore for a space and changes nothing else, so the value still reaches the user in
SCREAMING case — "REGULAR", "PART TIME", "ON CALL". It reads as a database internal, and it is
announced that way.

### Evidence

`/employees` announces employment type as "REGULAR" to a screen reader. Observed live in the
accessibility tree on 2026-09-22 during the phase 08 item-1 spot check:

```
- row "Admin, System EMP-001 Human Resources HR System Administrator REGULAR Active …":
  - cell "REGULAR"
- row "Cruz, Bea EMP-919 Software Developers Software Engineer PROBATIONARY Active …":
  - cell "PROBATIONARY"
```

### The twelve sites, at 2026-09-22 line numbers

All twelve paths and line numbers below were re-checked against the working tree on 2026-09-22.

The four the 03-09-26 scan already knew about — bare `{x.status}` renders:

| Site | Enum |
|---|---|
| `src/routes/(app)/benefits/+page.svelte:284` | benefit enrollment status |
| `src/routes/(app)/dashboard/+page.svelte:507` | payroll run status |
| `src/routes/(app)/payslips/+page.svelte:62` | payroll run status |
| `src/routes/(app)/recruitment/[id]/+page.svelte:92` | job posting status |

The eight it missed — all `.replace()`:

| Site | Enum |
|---|---|
| `src/routes/(app)/employees/+page.svelte:150` | `EmploymentType` |
| `src/routes/(app)/employees/[id]/+page.svelte:383` | `EmploymentType` |
| `src/routes/(app)/employees/[id]/+page.svelte:1072` | `BenefitPlanType` (benefit plan type) |
| `src/routes/(app)/benefits/+page.svelte:160` | `BenefitPlanType` (benefit plan type) |
| `src/routes/(app)/profile/+page.svelte:75` | `EmploymentType` |
| `src/routes/(app)/profile/+page.svelte:335` | `BenefitPlanType` (benefit plan type) |
| `src/routes/(app)/requests/approvals/+page.svelte:104` | `Role` — see below, a different defect |
| `src/routes/(app)/requests/timesheets/+page.svelte:81` | `Role` — see below, a different defect |

### Two of the twelve are a different defect

`requests/approvals:104` and `requests/timesheets:81` are the `roleLabel` fallback. Each page
carries its own seven-entry `roleLabels` object and falls back to
`.toLowerCase().replace(/_/g, ' ').replace(/^\w/, …)`, which title-cases. They therefore do
**not** render SCREAMING case — the fallback produces "Employee", not "EMPLOYEE".

What is wrong with them instead:

- The map is a local duplicate. There is no `ROLE_LABELS` in `src/lib/labels.ts`, so the same
  seven labels are maintained twice, in two files, with no test holding them together.
- Neither copy is exhaustive against the Prisma `Role` enum. `Role` has nine values; the local
  maps cover seven. `EMPLOYEE` and `FINANCE` fall through to the title-case path and silently
  drift from whatever the rest of the app calls them.

They belong in the same follow-up, but as "add `ROLE_LABELS` to `labels.ts`, adopt it in both
files, add it to the exhaustive-against-the-Prisma-enum unit test" — not as a `labelFor(...)`
one-liner.

### Cost of the follow-up

`EMPLOYMENT_TYPE_LABELS` already exists in `src/lib/labels.ts` and is unused at all three
`EmploymentType` sites, so those are one-line `labelFor(...)` swaps. The same is true of the
four bare-`{x.status}` sites: `BENEFIT_ENROLLMENT_STATUS_LABELS`, `PAYROLL_RUN_STATUS_LABELS`
and `JOB_POSTING_STATUS_LABELS` are all present and unused there.

Two gaps stop the whole set from being pure one-liners:

- **`BenefitPlanType` has no map in `labels.ts` at all.** The file has 25 maps; that is not one
  of them. The three benefit-plan-type sites need the map written first. It is six values
  (`HMO`, `INSURANCE`, `RETIREMENT`, `ALLOWANCE`, `LEAVE_CREDIT`, `OTHER`).
- **`Role` has no map either**, per the section above.

So: seven one-line swaps, plus two new maps and their unit-test rows, plus the two role-site
adoptions. Twelve sites, not four. Still a single-commit follow-up, but larger than the
03-09-26 correction implies.

### The scan must be widened, or this recurs

The adoption scan in `tests/unit/labels.test.ts` has to catch `.replace(` applied to an enum
field, not just `{x.status}` / `{x.type}`. A regex that only looks for a bare interpolation
missed two thirds of the real count once and will miss the same class again.
