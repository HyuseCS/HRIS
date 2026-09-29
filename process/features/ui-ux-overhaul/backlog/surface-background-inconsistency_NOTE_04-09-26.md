---
name: note:surface-background-inconsistency
description: "58 bordered containers render with no background token while 90 use bg-card and the shared Table uses bg-card + ring — three competing surface treatments, needs one canonical decision then a repo-wide sweep"
date: 04-09-26
feature: ui-ux-overhaul
---

# Container surface inconsistency — three competing treatments

**Status**: BACKLOG — needs an owner ruling on the canonical surface, then one repo-wide PR.
**Raised by**: the owner, during the phase 01 + 02 manual test pass on 04-09-26, check 13
(screenshot review of `/reports`, `/payroll/periods`, `/employees/[id]`).

## What this is

Bordered containers in this app do not agree on whether they have a background. Three
patterns are live at once:

| Pattern | Sites | Where |
|---|---|---|
| `rounded-lg border bg-card` | 90 | the majority of panels |
| `rounded-lg border` (no background token) | 58 | listed below |
| `rounded-lg bg-card ring-1 ring-black/[0.12] dark:ring-white/10` | shared | `src/lib/components/ui/Table.svelte:48,60` |

The third is the newest: `Table.svelte` dropped `border` for a `ring` entirely. So the 27
hand-rolled table wrappers in group B below disagree with the shared Table component **and**
with the 90 `bg-card` panels.

A container with no background token inherits the page background. On a page whose body and
card colours differ it reads as a bare outline next to a filled card. The owner's two named
examples are **Update Profile** (`employees/[id]/+page.svelte:494`) and **Change Salary / Pay
Type** (`:1595`), which sit directly beside `bg-card` panels on the same page.

## Not fixed by any phase

Checked on 04-09-26 against the branches, not the plans:

- `feat/uiux-phase-3` (the design-system phase) — `employees/[id]/+page.svelte` still has all 4
  background-less boxes.
- `feat/uiux-phase-8` — 4.
- `feat/uiux-phase-10` (last in the stack) — 4.

No existing backlog note covers it. It survived the whole ten-phase overhaul because every
phase audited what it touched, and no phase owned "is every surface the same surface".

## The 58 sites, grouped by what they actually are

Grouping matters: these must NOT all be changed the same way.

### A — padded content panels (23)

Card-like. These are the ones that look wrong beside a `bg-card` sibling, and the owner's two
examples are here. Most likely outcome: add the canonical background.

Two are **not** plain panels and need a per-site look: `attendance/+page.svelte:245` is an
`inline-flex … p-1` segmented control, and `employees/[id]/+page.svelte:1812` is the
destructive Offboard box (`border-destructive/50`), whose bare surface may be deliberate.

| File | Line | Classes |
|---|---|---|
| `src/routes/(app)/attendance/+page.svelte` | 245 | `inline-flex rounded-lg border p-1 text-sm` |
| `src/routes/(app)/complaints/+page.svelte` | 99 | `space-y-4 rounded-lg border p-6` |
| `src/routes/(app)/employees/[id]/+page.svelte` | 494 | `rounded-lg border p-6 space-y-4 lg:col-span-2` |
| `src/routes/(app)/employees/[id]/+page.svelte` | 1493 | `rounded-lg border p-6 space-y-4 lg:col-span-2` |
| `src/routes/(app)/employees/[id]/+page.svelte` | 1595 | `rounded-lg border p-6 space-y-4 lg:col-span-2` |
| `src/routes/(app)/employees/[id]/+page.svelte` | 1812 | `rounded-lg border border-destructive/50 p-6 space-y-4 lg:col` |
| `src/routes/(app)/leave/new/+page.svelte` | 49 | `space-y-4 rounded-lg border p-5` |
| `src/routes/(app)/payroll/+page.svelte` | 94 | `rounded-lg border p-4 space-y-3` |
| `src/routes/(app)/payroll/periods/+page.svelte` | 72 | `rounded-lg border p-4 space-y-3` |
| `src/routes/(app)/recruitment/+page.svelte` | 107 | `rounded-lg border p-4 space-y-3` |
| `src/routes/(app)/recruitment/[id]/+page.svelte` | 55 | `rounded-lg border p-6 space-y-4` |
| `src/routes/(app)/recruitment/[id]/+page.svelte` | 141 | `rounded-lg border p-4 space-y-3` |
| `src/routes/(app)/recruitment/[id]/+page.svelte` | 216 | `rounded-lg border p-4 space-y-3` |
| `src/routes/(app)/requests/[id]/+page.svelte` | 225 | `flex flex-wrap items-center justify-between gap-3 rounded-lg` |
| `src/routes/(app)/requests/[id]/+page.svelte` | 372 | `flex items-start gap-3 rounded-lg border p-3` |
| `src/routes/(app)/settings/holidays/+page.svelte` | 68 | `rounded-lg border p-4 space-y-4` |
| `src/routes/(app)/settings/org/+page.svelte` | 58 | `rounded-lg border p-4 space-y-4` |
| `src/routes/(app)/settings/org-chart/+page.svelte` | 141 | `rounded-lg border p-4` |
| `src/routes/(app)/settings/schedules/+page.svelte` | 52 | `flex items-center justify-between gap-4 rounded-lg border p-` |
| `src/routes/(app)/settings/schedules/+page.svelte` | 76 | `space-y-3 rounded-lg border p-4` |
| `src/routes/(app)/settings/schedules/+page.svelte` | 130 | `rounded-lg border p-4 space-y-4` |
| `src/lib/components/payroll/CalculatorPanel.svelte` | 86 | `rounded-lg border p-5 space-y-4` |
| `src/lib/components/performance/ReviewFormRender.svelte` | 191 | `space-y-2 rounded-lg border p-3` |

### B — hand-rolled table wrappers (27)

`overflow-x-auto rounded-lg border` with no padding, each wrapping a raw `<table>`. These are
the ones that disagree with `Table.svelte`. The real question here is not "add `bg-card`" but
**"why are these not using the shared Table component at all?"** — answering that may delete
most of this group rather than restyle it.

| File | Line | Classes |
|---|---|---|
| `src/routes/(app)/attendance/+page.svelte` | 576 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/attendance/+page.svelte` | 732 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/benefits/+page.svelte` | 139 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/benefits/+page.svelte` | 245 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/employees/+page.svelte` | 89 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/leave/+page.svelte` | 123 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/leave/balances/+page.svelte` | 53 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/payroll/+page.svelte` | 127 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/payroll/[id]/+page.svelte` | 154 | `rounded-lg border overflow-x-auto` |
| `src/routes/(app)/payroll/periods/+page.svelte` | 118 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/performance/+page.svelte` | 43 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/performance/+page.svelte` | 95 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/performance/+page.svelte` | 136 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/performance/+page.svelte` | 181 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/recruitment/+page.svelte` | 160 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/reports/+page.svelte` | 181 | `rounded-lg border overflow-x-auto` |
| `src/routes/(app)/reports/[type]/+page.svelte` | 232 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/reports/audit-log/+page.svelte` | 139 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/requests/+page.svelte` | 379 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/settings/holidays/+page.svelte` | 149 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/settings/org/+page.svelte` | 115 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/settings/org/+page.svelte` | 262 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/settings/posting-approvers/+page.svelte` | 36 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/settings/roles/+page.svelte` | 191 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/settings/schedules/+page.svelte` | 225 | `overflow-x-auto rounded-lg border` |
| `src/routes/(app)/timesheets/+page.svelte` | 127 | `overflow-x-auto rounded-lg border` |
| `src/lib/components/timesheets/TimesheetModal.svelte` | 376 | `overflow-x-auto rounded-lg border` |

### C — dashed affordances and empty states (3)

Almost certainly correct as-is. A dashed outline with no fill is the conventional "add one
here" / "nothing here yet" treatment. Listed so a blind sweep does not fill them in.

| File | Line | Classes |
|---|---|---|
| `src/routes/(app)/requests/[id]/+page.svelte` | 324 | `flex flex-wrap items-center justify-between gap-3 rounded-lg` |
| `src/lib/components/performance/SectionList.svelte` | 40 | `rounded-lg border border-dashed px-4 py-6 text-center text-s` |
| `src/lib/components/timesheets/TimesheetModal.svelte` | 507 | `w-full rounded-lg border border-dashed py-2 text-sm font-med` |

### D — other (5)

No padding, no overflow wrapper. Each needs to be read in place.
`ui/TableSkeleton.svelte:10` should match whatever `Table.svelte` settles on, or the loading
state will not match the loaded state.

| File | Line | Classes |
|---|---|---|
| `src/routes/(app)/performance/+page.svelte` | 123 | `rounded-lg border` |
| `src/routes/(app)/punch/+page.svelte` | 309 | `divide-y divide-border rounded-lg border border-border` |
| `src/routes/(app)/separations/+page.svelte` | 138 | `rounded-lg border` |
| `src/routes/(app)/settings/org-chart/+page.svelte` | 125 | `rounded-lg border` |
| `src/lib/components/ui/TableSkeleton.svelte` | 10 | `rounded-lg border` |

## What a fix has to include

1. **An owner ruling on the canonical surface.** `border bg-card` (90 sites) or
   `bg-card ring-1` (the shared Table)? Whichever loses becomes a second sweep. This is a
   visual decision, not a refactor — it changes every page.
2. Group B answered separately: restyle in place, or migrate to `Table.svelte`.
3. Explicit carve-outs for group C and for the two group-A exceptions named above, so the
   sweep does not flatten intentional treatments.
4. **Light AND dark verification**, since the whole defect is that a transparent container is
   invisible only when the page and card colours differ. A computed-style check in both themes,
   with a negative control — the phase 03 plan's §8.3 method.
5. One PR. The point of deferring it is that a repo-wide visual change is easier to review and
   revert as a single diff than as 58 edits scattered through feature branches.

## Scope note

Detection used `class="… rounded-lg border …"` with no `bg-` token, over `src/routes` and
`src/lib/components`. It will miss containers built from `rounded-md`/`rounded-xl`, containers
whose classes are composed in script, and any surface outside those two trees. Re-run the scan
as part of the fix rather than trusting these counts as complete.
