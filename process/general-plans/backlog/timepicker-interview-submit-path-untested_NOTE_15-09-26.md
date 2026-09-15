---
name: note:timepicker-interview-submit-path-untested
description: "F11a's P5 live probe only checked TimePicker's empty-field block and typing 830 -> 08:30; it never submitted an interview because that sends a real email, so the typed-time-to-stored-value path is unproven"
date: 15-09-26
feature: general-plans
---

# Known gap — untested interview-submit path (typed time → stored value)

During F11a's live-probe pass (P5), the applicant scheduling form's `required` block and the
typed-time normalization (`830` → `08:30`) were both verified in the DOM. The probe stopped short of
clicking "Schedule Interview" because that action sends a real email to the applicant, so there is no
live evidence that a typed `TimePicker` value survives the full submit → server → stored
`scheduledTime` round trip for this specific call site.

## Fix option

Either add a dev-only/staging email sink so this path can be probed without spamming a real inbox, or
accept a targeted unit/integration test against the `+page.server.ts` action with a mocked mailer, and
run it the next time recruitment scheduling is touched.

## Priority

Low — `time-of-day.ts` and the shared `TimePicker` write path are covered elsewhere (unit tests +
the attendance e2e spec); this gap is specific to the applicant call site's full submit round trip.

## Source

`process/general-plans/completed/f11a-analog-time-picker_15-09-26/f11a-analog-time-picker_PLAN_15-09-26.md`,
§11 Verification Evidence (P5 probe row).
