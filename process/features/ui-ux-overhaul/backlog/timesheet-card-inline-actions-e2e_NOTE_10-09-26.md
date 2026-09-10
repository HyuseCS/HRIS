---
name: note:timesheet-card-inline-actions-e2e
description: "The inline Approve/Reject footer on the /requests/timesheets card has no automated spec — no e2e exercises the card footer, because it needs a second self-resetting SUBMITTED fixture in a shared queue. NEW PLAN REQUIRED."
date: 10-09-26
feature: ui-ux-overhaul
---

# Inline card-footer Approve/Reject have no e2e — NEW PLAN REQUIRED

Date: 2026-09-10
Source: `process/general-plans/active/timesheet-queue-approvals-parity_10-09-26/timesheet-queue-approvals-parity_PLAN_10-09-26.md`
— Section 3 test plan (known-gap ruling, vacuous-green ban) and AC3.14, which require this note to
exist on disk before S3 can be reported.

## What is not covered

Section 3 (D2) added an inline action footer to every card on `/requests/timesheets`:

- **Approve** — a `type="submit"` button inside a per-card `<form method="POST" action="?/review">`,
  guarded by a per-card `submitFeedback()` instance (DD-9).
- **Reject** — opens the shared `ReasonDialog` with the single-timesheet copy, then posts through
  one page-level hidden `?/review` form guarded by a dedicated `singleReject` instance (DD-8, E7).

Neither path is exercised by any spec. What the existing gates DO cover:

- `tests/unit/request-decide-feedback.test.ts:56-60` covers the `?/review` **action** at the server
  boundary. The action is not new and is not the gap.
- `tests/e2e/timesheet-approval.spec.ts` / `timesheet-punch.spec.ts` cover the **modal** approve
  path (card body click → dialog → Approve), not the card footer.
- `tests/e2e/form-errors.spec.ts` covers the **bulk** bar.

The gap is the card wiring — that the footer posts the right id, that the per-card guard isolates
one row from another, and that Reject routes the dialog to the single target rather than the bulk one.
That is a DOM claim, and this repo has no component-render tier
(`component-test-dom-environment_NOTE_03-09-26.md`, still open), so it is e2e or nothing.

## The fixture it needs

The blocker is not the assertion, it is the fixture. An inline-approve spec spends its subject: the
timesheet leaves the queue, so the spec cannot re-run without reseeding, and the queue is shared with
every other timesheet spec.

What a plan for this has to build:

- A seeded SUBMITTED timesheet whose approval chain can be spent once per run and reset in teardown —
  the `tests/e2e/timesheet-approval.spec.ts:37-45` reset pattern is the model.
- **Two** such rows, not one: proving the per-card guard needs a second card that stays enabled while
  the first is mid-post.
- Visibility for the acting user. A step-less row falls back to `canAny(roles, 'VIEW_TEAM')`; a
  chained row needs an actor holding the live stage's capability — only `VERIFIER` holds
  `VERIFY_REQUESTS` (`src/lib/rbac.ts:87`), so `admin@veent.ph` cannot act on a `VERIFY` stage.
  This was measured live during S3 execution, not assumed.

## Why it was deferred

A second self-resetting fixture in the shared queue is its own piece of work, not a two-line
assertion appended to an existing spec. The plan ruled it out of S3's scope and required this note
instead.

## Interim evidence (not a substitute)

S3's AC3.13 agent-probe was run live on 2026-09-10 against two purpose-seeded chained timesheets
(deleted afterwards, before/after row counts proven equal). It observed, as `verifier@veent.ph`:
card 1's Approve flipping to `Approving…` and disabled while card 2's Approve stayed enabled, one
toast reading `Timesheet approved.`, card 1 leaving the queue and card 2 remaining, and the count
pill dropping 2 → 1. That is a one-off agent observation. It is not a gate and does not close this
item.
