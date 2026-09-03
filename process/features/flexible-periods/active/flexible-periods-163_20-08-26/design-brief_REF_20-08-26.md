---
name: ref:flexible-periods-163-design-brief
description: "Impeccable SHAPE brief — the Custom range control on PeriodPicker and the Save-as-timesheet unlock on /attendance (#163)"
date: 20-08-26
feature: flexible-periods
phase: SHAPE (impeccable)
---

# DESIGN BRIEF — Custom period control (#163)

Mode: **Operate**. The visitor completes a task. Scanability, consistency and native
expectations outrank expression. This is a **narrow refinement** of an incumbent component —
`src/lib/components/ui/PeriodPicker.svelte` and the app's existing Tailwind HSL tokens are the
design authority. No PRODUCT.md / DESIGN.md is created; impeccable `init` was deliberately not
run, as it is outside #163.

## Job and audience

A payroll officer or HR admin who needs to run payroll, open a payroll period, or save a
timesheet for a span that is not one of the two standard halves — a mid-month off-cycle run, a
back-pay correction, a short final period. They reach it from `/payroll`, `/payroll/periods`,
and the New timesheet dialog. They arrive knowing the dates they want. Success is entering
those two dates and understanding the money consequence **before** they commit.

## Selected direction

- **A fourth segment, same row.** `Custom range` joins `First half (1–15)` / `Second half
  (16–EOM)` / `Whole month` in the existing `role="group"` control. One mental model: pick a
  period shape. The default stays `FIRST_HALF`, so the 15-day cutoff remains the path of least
  resistance and nobody reaches Custom by accident.
- **Selecting it reveals two native `<input type="date">` fields** in the same two-column grid
  the Month/Year selects already use, styled with the incumbent `selectClass` string. Native
  date inputs, not a picker library — the platform control is already what `/attendance` uses.
- **The preview line carries the money.** It already reads `Mar 3 – Mar 9, 2026 (7 days)` via
  `formatPeriodPreview`. For a custom range it gains the share:
  `Mar 3 – Mar 9, 2026 (7 days) · statutory and loans prorated to 23% of the month`.
  This is the single highest-value pixel in the change — it states the consequence before commit.

## Scope and boundaries

- **Untouched:** the three existing buttons and their exact label text, and the `#pp-month`
  select id. Both are e2e selectors (`tests/e2e/timesheet-create-for-employee.spec.ts:105,107`,
  `manager-org-wide-timesheets.spec.ts:91,93`). Month and Year selects stay rendered in Custom
  mode — hiding them would remove `#pp-month` from the DOM and break those specs.
- **Untouched:** the hidden-input contract at `PeriodPicker.svelte:67-68`. Custom mode feeds the
  same two hidden inputs, so every surrounding `<form>` posts identical field names. No consumer
  changes shape.
- **`/attendance` gets no new UI.** The unlock is a **deletion**: `rangeIsStandard`
  (`+page.svelte:54-59`), its use in `disabled=` (`:399`), and the now-false tooltip (`:396-398`).
  The date inputs (`:311-330`) and quick-picks (`:332-342`) already do the job. Net negative lines.
- **Anti-goals:** no date-picker dependency, no new component file, no calendar popover, no
  redesign of the payroll pages around it.

## States and ranges

| State | Behaviour |
|---|---|
| Default (no interaction) | `First half` selected. Identical to today, pixel for pixel. |
| Custom selected, no dates yet | Hidden inputs empty; submit button disabled; preview reads `Pick a start and end date`. |
| End before start | Inline message under the inputs: `End date must be on or after the start date.` Submit stays disabled. |
| Range crosses a month | Inline message: `A custom period must start and end in the same month.` Submit stays disabled. v1 scope decision. |
| Valid custom range | Preview shows range, day count, and prorated share. Submit enabled. |
| Overlaps an existing run/period | Server-side 409 surfaced as a form error naming the conflicting period's dates. Not preventable client-side. |
| Duplicate timesheet start day | `Timesheet.@@unique([employeeId, periodStart])` — surfaced as a clear message, never a 500. |

Realistic ranges: 1 to 31 days. The same-month rule caps length at 31 naturally, so no separate
length cap is needed on this control.

## Interaction and accessibility

- The segmented control keeps `role="group"` and `aria-pressed` per button. The new button is
  the same element, nothing new to learn.
- Both date inputs get real `<label for>` bindings, matching the Month/Year pattern at `:73` and `:81`.
- The preview paragraph becomes `aria-live="polite"` so a screen-reader user hears the day count
  and the prorated share change as they pick dates. It is the only feedback channel for the
  money consequence.
- Validation messages are inline text under the inputs, associated with `aria-describedby` — not
  a toast, which would be missed.
- The revealed date inputs must not shift the buttons above them; the block grows downward only.

## Copy (exact)

- Button: `Custom range`
- Labels: `Start date`, `End date`
- Empty preview: `Pick a start and end date`
- Preview suffix: ` · statutory and loans prorated to {N}% of the month`
- Inverted range: `End date must be on or after the start date.`
- Cross-month: `A custom period must start and end in the same month.`

## Verification

Once the UI is built, run the mechanical detector **once**:
`node /home/hyuse/.claude/skills/impeccable/scripts/detect.mjs --json src/lib/components/ui/PeriodPicker.svelte "src/routes/(app)/attendance/+page.svelte"`
