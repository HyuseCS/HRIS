---
phase: phase-05-remediation-A-S7
date: 2026-09-11
status: COMPLETE_WITH_GAPS
feature: ui-ux-overhaul
plan: process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-05-remediation-A-feedback-statutory_PLAN_11-09-26.md
---

# S7 — F5 + F6 + F7, `/payroll/statutory-rates`

Three commits, in plan order. All four CI gates green after each, in CI order.

| commit | subject |
|---|---|
| `4d80d23` | `fix(payroll): compare statutory payloads by value, not by JSON key order` |
| `c0c6f0a` | `fix(payroll): toast the four statutory-rate outcomes instead of banner-ing them` |
| `594af0f` | `refactor(payroll): collapse each pending rate proposal to one summary row` |

## What Was Done

**S7a (F5).** `summarizeChanges` extracted to
`src/lib/server/services/payroll/statutory-change-summary.ts`, exported, with its own
`WireConfig` type. The two `JSON.stringify` comparisons replaced by a field-by-field
comparison over the named numeric fields plus array length. `null`/`undefined`/`Infinity`
all normalise to "open ceiling" — defensive against a raw-table fixture, NOT a live bug
(all three production paths already carry `null`). New gate
`tests/unit/statutory-change-summary.test.ts`, 9 cases.

**S7b (F6).** The four actions now return `{ action, saved }` — the repo's success
contract that `submitFeedback` actually reads. `saveGuard` swapped from
`createSubmitGuard` to `submitFeedback`, inner handler and its baseline re-seed kept
intact (it still owns `update()`). Green `Banner` block and now-orphan `Banner` import
removed; `enhance` import kept (verified in use at the form). `error: null` passed so the
existing red block stays the single error surface (AC-S7b.4).
Confirm/Reject needed no client change — they inherit the toast from `ConfirmButton`.

**S7c (F7).** One summary row per proposal (proposer · date, then state-dependent line),
Confirm/Reject on that row, change list behind a native `<details>`. Three states wired.
Kit classes and both `#108` comments kept; no new colour token. New gate
`tests/unit/statutory-proposal-card.test.ts`, 3 SSR render cases.

## Test Gate Outcomes

Gates run after EACH commit, CI order `format:check → lint → check → test`.

| gate | S7a | S7b | S7c |
|---|---|---|---|
| `pnpm format:check` | clean | clean* | clean |
| `pnpm lint` | 0 err / 1 warn | 0 err / 1 warn | 0 err / 1 warn |
| `pnpm check` | 0 errors | 0 errors | 0 errors |
| `pnpm test` | 2496 / 215 files | 2496 / 215 files | 2506 / 217 files |

The single warning is the pre-existing `CalculatorWindow.svelte:82` baseline.
Totals moved from the 2480/213 baseline because five other agents are committing to this
branch; my own files are 12 new passing tests across 2 new files.

*At the S7b run `format:check` flagged `src/routes/(app)/attendance/+page.svelte` — plan
B's file, in flight, not mine. It was clean again by the S7c run. My own three files were
prettier-clean at every gate.

### Mutation checks — every gate proven both ways

| # | mutation | expected red | result |
|---|---|---|---|
| A1 | `bracketsEqual` reverted to `JSON.stringify(a) === JSON.stringify(b)` (the pre-fix compare) | key-order cases + fallback | **RED 5/9**: both key-order cases, the Pag-IBIG-only case, the no-change fallback, and the no-config-row case. Restored → **GREEN 9/9** |
| A2 | open-ceiling normalisation dropped (`v === Infinity` removed) | the Infinity/null case | **RED 1/9** — exactly the raw-table case. Restored → **GREEN 9/9** |
| C1 | single-change branch disabled (forced into a disclosure) | AC-S7c.1 | **RED 1/3**. Restored → **GREEN 3/3** |
| C2 | empty-proposal branch disabled | AC-S7c.3 | **RED 1/3**. Restored → **GREEN 3/3** |
| C3 | disclosure body emptied (`{#each [] as c}`) | AC-S7c.2 | **RED 1/3**. Restored → **GREEN 3/3** |

**Proof the `'No effective change vs the live rates.'` fallback is now reachable:** the
test `returns the no-effective-change fallback when nothing changed` passes on the fixed
code and goes RED under mutation A1 (the pre-fix `JSON.stringify` compare). Two further
cases confirm it from the other side: the Pag-IBIG-cap-only case asserts `toEqual` on a
one-element array — it would carry three lines pre-fix — and the no-config-row case
(`DEFAULT_STATUTORY_RATE_CONFIG` as live, the realistic production shape) also went RED
under A1.

As the plan predicted, the no-config-row half of the 8th case passes with or without the
open-ceiling normalisation (it stayed GREEN under A2). That is the verified fact, not a
weak test — recorded, not "fixed".

## What Was Skipped or Deferred

Every Agent-Probe criterion. I cannot start a server (owner rule) and the dev DB holds
**0 PENDING** proposals, so no live pass was possible:

- `AC-S7a.2` — Pag-IBIG-only proposal shows exactly one line to the approver.
- `AC-S7b.1`–`AC-S7b.4` — four toasts, no green Banner, leave guard, error path.
- `AC-S7c.4` — measured pixel height of one entry, 3-change case.
- `AC-S7c.6` — the Confirm dialog still lists the changes. The dialog body is not
  server-rendered (it renders on open), so I dropped an SSR assertion that would have
  been vacuous. The `${p.changes.join('\n')}` interpolation is intact in source and
  `destructive-confirms.test.ts` sites 7 and 8 pass unchanged (`AC-S7c.5` GREEN, 31/31).

Height estimate from the class tokens, **not** a browser measurement: old entry `p-4` +
5 text rows ≈ 140px; new entry `px-4 py-3` + 2 text rows ≈ 64px for the 3-change case.
The real measurement belongs to the probe pass.

## Plan Deviations

1. **`error: null` on the save form's `submitFeedback`.** S7b step 5 says leave the
   `{#if form?.error}` block alone; AC-S7b.4 requires no double-report. Without
   `error: null` the default error toast would fire alongside the red block. Passing
   `error: null` satisfies both, and matches the escape the plan names for S6.
   Within blast radius.
2. **`type StatutoryRateInput` import dropped from `+page.server.ts`.** Orphaned by the
   extraction; `pnpm lint` caught it as an error. Surgical-changes rule — my change made
   it dead.
3. **An extra automated gate for S7c** (`statutory-proposal-card.test.ts`) that the plan
   did not ask for. The plan gave S7c an Agent-Probe-only gate, which I cannot run; three
   SSR cases with three mutation controls keep the section from resting on an unrun gate.

## Test Infra Gaps Found

- `render` from `svelte/server` renders a whole `+page.svelte` in the node vitest env with
  only `$app/forms` and `$app/navigation` mocked. Cheap DOM-level gates for markup
  branches are available and barely used (one prior site, `performance-capture.test.ts`).
- `ConfirmButton`'s own `submitFeedback` has no `error` option, so a failing Confirm or
  Reject toasts AND renders the page's red block. Not reachable through the UI here (the
  only failure is a missing proposal id) and `ConfirmButton` is out of my ownership —
  flagged, not touched.

## Closeout Packet

- **Plan**: `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-05-remediation-A-feedback-statutory_PLAN_11-09-26.md`
- **Finished**: S7a, S7b, S7c — three commits, all automated gates green.
- **Verified**: every automated gate, each proven red under a targeted mutation.
- **Unverified**: all Agent-Probe criteria above; they need the owner's running app and
  three hand-made PENDING proposals (1 change, 2+ changes, and a no-change submit).
- **Next valid state**: keep the plan active — the S7 probe pass is still owed.

## Forward Preview

- **Test Infra Found**: SSR component gates via `svelte/server` `render` + `vi.mock` of
  `$app/forms` / `$app/navigation`.
- **Blast Radius Changes**: one new file,
  `src/lib/server/services/payroll/statutory-change-summary.ts`. Anything else importing
  `summarizeChanges` must now import from there.
- **Commands to Stay Green**: `pnpm vitest run tests/unit/statutory-change-summary.test.ts
  tests/unit/statutory-proposal-card.test.ts tests/unit/destructive-confirms.test.ts`
- **Dependency Changes**: none.
