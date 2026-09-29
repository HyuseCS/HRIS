---
name: note:timepicker-screen-reader-verification
description: "No SR harness exists to verify TimePicker's aria-live announcement text; §7 SR gate stays CONDITIONAL"
date: 15-09-26
feature: general-plans
---

# Known gap — TimePicker screen-reader verification

`TimePicker.svelte` exposes the picked value through a `<span class="sr-only" aria-live="polite">`
(e.g. `"9:07 AM"`) while the SVG dial itself is `aria-hidden="true"`. This was verified by reading
the DOM text only — an Agent-Probe partial, not an automated or live SR announcement check. There is
no screen-reader test harness in this repo.

## Fix option

Decide and build an SR verification approach (e.g. axe-core automated checks, or a manual VoiceOver/
NVDA pass documented as a repeatable script) the next time accessibility work is scoped.

## Priority

Low — the typed `<input>` is the primary a11y path per plan §7 and works without the popover at all.
The gap is specific to the popover's live-value announcement.

## Source

`process/general-plans/completed/f11a-analog-time-picker_15-09-26/f11a-analog-time-picker_PLAN_15-09-26.md`,
§13 item 1, Verification Evidence table.
