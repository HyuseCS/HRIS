---
name: note:applicant-interview-time-no-timezone
description: "recruitment applicant +page.server.ts builds new Date(date+T+time) with no timezone suffix, parsed in server-local time instead of +08:00 — pre-existing, not caused by F11a"
date: 15-09-26
feature: general-plans
---

# Known gap — applicant interview time has no timezone suffix

`src/routes/(app)/recruitment/applicant/[applicantId]/+page.server.ts:90` builds
`new Date(\`${date}T${time}\`)` with no timezone suffix, so it is parsed in the server's local time
zone rather than `+08:00`. This is pre-existing (predates the F11a TimePicker migration) and was
explicitly left untouched — the F11a plan only changed the client-side control, not this server
contract.

## Fix option

Append the `+08:00` suffix (matching the pattern used by the attendance and timesheet servers) when
building the `Date`, then re-verify scheduled interview times display correctly across a DST-naive
Philippines-only deployment.

## Priority

High-ish if this server ever runs in a different local timezone than +08:00 (e.g. CI or a future
non-PH deploy) — silently wrong interview times.

## Source

`process/general-plans/completed/f11a-analog-time-picker_15-09-26/f11a-analog-time-picker_PLAN_15-09-26.md`,
§13 item 3, R4.
