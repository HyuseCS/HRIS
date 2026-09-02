---
phase: c9-period-picker-cap-bound
date: 2026-09-02
status: COMPLETE_WITH_GAPS
feature: flexible-periods
plan: process/features/flexible-periods/active/cross-month-periods-3_02-09-26/cross-month-periods-3_PLAN_02-09-26.md
---

# C9 — PeriodPicker cap bound + its e2e edits

## What Was Done

- **C9.1** `customError` is now one call: `customRangeError(customRange.s, customRange.e)`.
  The `$derived.by` block collapsed to a one-line `$derived`. Comment above it rewritten —
  the inline message and the 400 are now literally the same function.
- **C9.2** `startMonthEnd` / `startMonthStart` deleted. Replaced by one `capBound(anchor, step)`
  linear probe (ceiling 40 iterations, breaks early) plus two `$derived`: `capBoundEnd`
  (`capBound(customStart, 1)`) and `capBoundStart` (`capBound(customEnd, -1)`). Both walks refuse
  with `customRangeError` — no month rule is re-derived in the browser (D-B). Carries the
  `// ponytail:` comment the plan specified, verbatim in substance.
- **C9.3** Import line: removed `daysInMonth` and `isSameMonthRange`, added `customRangeError`.
  `periodOf`, `periodShareOf`, `formatPeriodPreview`, `toPeriodInputValue`, `type PeriodKind` stay.
- **C9.4** Preview copy `prorated to ${share}% of the month` → `of a month`.
- **C9.5** No new component, prop, layout or field name. `w-40` inputs, `aria-invalid` /
  `aria-describedby`, `#pp-custom-error`, `aria-live="polite"` all untouched. Markup change is
  exactly two attribute expressions: `min={capBoundStart}`, `max={capBoundEnd}`.
- **C9.6** Both `test()` blocks in `tests/e2e/period-picker-default-cutoff.spec.ts` edited:
  same-month refusal → `toHaveCount(0)` plus a new 109% size-cap assertion; preview string
  `of the month` → `of a month`; three bound literals retargeted to the plan's table values;
  second test renamed to `…bound each other at the one-month cap`.
- Impeccable detector on the component: `[]` (clean).

## What Was Skipped or Deferred

- **`pnpm test:e2e` did not run.** The Postgres container `veent-db-5434` is
  `Exited (0) 9 days ago`, so Playwright's webServer timed out after 180s on `[500] GET /login`
  (`Can't reach database server at localhost:5434`). Standing repo rule: the agent does not start
  the DB or the servers. The user must run `./start.sh`, then `pnpm build && pnpm test:e2e`.
- Consequently **R-1 is UNDECIDED** — see below.

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `pnpm check` | GREEN — 1084 files, 0 errors, 1 warning (pre-existing, `CalculatorWindow.svelte:82` a11y) |
| `pnpm lint` | GREEN — 0 errors, same 1 pre-existing warning |
| `pnpm format:check` | GREEN — all matched files use Prettier style |
| `pnpm test` | GREEN — 191 files / 2162 tests passed |
| `pnpm build` | GREEN — built in 20.23s, adapter-node done |
| `pnpm test:e2e` | **NOT RUN — blocked, DB container down** |

**Substitute proof for the C9.6 literals** (`npx tsx` against the real `pay-periods.ts`, the
component's `capBound` walk copied verbatim):

```
PASS  end max for start 2026-06-03: got 2026-07-02 want 2026-07-02
PASS  end max for start 2026-02-10: got 2026-03-09 want 2026-03-09
PASS  start min for end 2026-06-09: got 2026-05-11 want 2026-05-11
PASS  empty start: got undefined want undefined
PASS  empty end: got undefined want undefined
Jun3->Jul5 pct = 109 (want 109)
Jun20->Jul5 err = null (want null)
Jun3->Jun9 share pct = 23 (want 23)
```

All four bounds and all three changed strings are confirmed at the data layer. What is NOT
confirmed is the browser layer: that the `$derived` reaches the DOM `max`/`min` attributes, and
R-1's `fill()` behaviour.

## R-1 — which branch was taken

**Neither. Undecided, because it could not be run.** The plan required deciding this by running,
not reading, and the e2e tier is unavailable. The spec is committed on the **primary** branch —
`fill('2026-07-05')` against a `max` of `2026-07-02`, asserting the 109% string. If the first real
e2e run shows the harness clamps or rejects the value, apply the plan's C9.6 fallback: replace that
assertion with a `max` attribute assertion and let C1.7's whole-string `customRangeError` test carry
the size-cap copy proof. Do not change the arithmetic.

## Plan Deviations

1. **Stale header comment corrected (out of the literal checklist, inside the named file).**
   `PeriodPicker.svelte:18-20` said Custom range "reveals two native date inputs for any
   **same-month** span" — a description of the rule this commit deletes. Rewrote the phrase to name
   the #3 cap. Within blast radius, comment-only, no behaviour change. Flagged rather than left,
   because a comment describing a deleted rule reads identically to one describing a live rule.
2. **One redundant line not written.** C9.6's first-test text implies re-filling the start date for
   the no-error case; the reversed-range step above it already leaves start on `2026-06-20`, so only
   the end fill was written. The start IS re-filled for the 109% case, where it must change.
3. **`capBound` is one shared helper, not two inline walks.** The plan sketched `capBoundEnd` and
   described the start bound as "the same walk read backwards". Two call sites, one function — this
   is the shortest form of what the plan asked for, not an added abstraction.

Nothing else deviates. No file outside the two named was touched.

## Test Infra Gaps Found

- `CONTEXT_PARTIAL: e2e tier requires a running veent-db-5434; there is no agent-runnable path to
  the e2e gate when the container is stopped.` Not a new gap, but it is what blocked this phase.

## Closeout Packet

- **Selected plan:** `process/features/flexible-periods/active/cross-month-periods-3_02-09-26/cross-month-periods-3_PLAN_02-09-26.md` (C9 only)
- **Finished:** all six sub-steps C9.1–C9.6, both files.
- **Verified:** check, lint, format:check, test, build — all green. All C9.6 literals proved against
  the shared function.
- **Unverified:** the browser tier — `pnpm test:e2e` and therefore R-1.
- **Remaining:** user starts `./start.sh`, then `pnpm build && pnpm test:e2e`. Decide R-1 from that
  run.
- **Best next state:** `Keep in active/testing` — the code is complete but one required gate is
  unrun.

## Forward Preview

- **Test infra found:** e2e runs against `build` + `preview`; it needs the Postgres container up
  and `login(page, USERS.admin)` to resolve. `pnpm check` must never run beside the preview.
- **Blast radius changes:** `PeriodPicker.svelte` no longer imports `daysInMonth` or
  `isSameMonthRange`. C8's deletion of `isSameMonthRange` from `pay-periods.ts` is now unblocked
  from this component's side.
- **Commands to stay green:** `pnpm check`, `pnpm lint`, `pnpm format:check`, `pnpm test`,
  `pnpm build && pnpm test:e2e`.
- **Dependency changes:** none.
