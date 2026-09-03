---
name: note:complaints-e2e-spec
description: "No Playwright e2e spec exists for the complaints/inquiries surface (#112) — Gate E covered the scoping guards with a one-time manual/live run instead"
date: 24-08-26
feature: hr-complaints-112
---

# Known gap — no e2e spec for /complaints (#112)

`grep -rn "Inquiries\|complaints" tests/e2e/` returns zero hits. The complaints/inquiries
feature (#112) — HR opening threads against employees, per-employee scoping, the
open/responded/resolved state machine, the sidebar waiting-count badge — has no automated
browser coverage. The e2e suite is a known-flaky gate (#287), so SPEC #112 did not require
one, and the plan instead ran a one-time manual/live verification script
(`process/general-plans/completed/hr-complaints-112_24-08-26/hr-complaints-112_MANUAL-TEST_24-08-26.md`)
to prove the MANAGER-scoping guard holds against a real database, not just a mocked one.

## Why this matters

The manual script proved the guard once, on 24-08-26. It does not run again on every future
change to `src/lib/server/services/complaints/index.ts` or the two complaints routes. A
future refactor could silently reintroduce the exact defect #112 fixed (MANAGER seeing every
employee's inquiries) and nothing in CI would catch it.

## Fix option

Write a Playwright spec covering at minimum: (1) an org-wide role opens against any employee;
(2) a MANAGER opens against a report and is refused against an out-of-scope employee (403 on
load/reply/resolve, not silent list-omission); (3) the subject employee sees only their own
thread; (4) the sidebar waiting-count badge renders and updates. Template: any existing spec
under `tests/e2e/` that logs in via the dev switcher and asserts role-scoped visibility.

## Priority

Low — not a regression, not required by any acceptance criterion. Worth doing before the next
change touches the complaints service.
