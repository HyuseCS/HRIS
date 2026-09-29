---
phase: phase-04-feedback-contract
date: 2026-09-03
status: COMPLETE
feature: ui-ux-overhaul
plan: process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-04-feedback-contract_PLAN_03-09-26.md
---

# Phase 04 — S1–S4 execute report

Scope: S1–S4 only. S5 (Toaster + notifications) and S6 (named-site adoption) belong to a later
agent. Branch `feat/uiux-phase-4`. Four commits, one per section, full CI gate set green before
each.

| Section | Commit | Files |
|---|---|---|
| S1 submitFeedback util | `001965d` | `src/lib/utils/submit-feedback.svelte.ts` (new), `tests/unit/submit-feedback.test.ts` (new) |
| S2 ConfirmButton rebuild | `e5009f3` | `src/lib/components/ui/ConfirmButton.svelte` |
| S3 cookie flash | `b2d1526` | `src/lib/server/flash.ts` (new), `tests/unit/flash.test.ts` (new), `(app)/+layout.server.ts`, `(app)/+layout.svelte`, 6 route action files, `tests/unit/request-filing-role-context.test.ts` |
| S4 server error handling | `66d95f1` | `src/hooks.server.ts`, `tests/unit/handle-error.test.ts` (new), 7 route files (13 arms), `reports/audit-log/+page.server.ts` + `+page.svelte`, 2 test files, 1 backlog note |

## What Was Done

**S1.** `submitFeedback` composes purely as an `inner: SubmitFunction` on `createSubmitGuard` (E2),
so the guard is untouched and the `busy`-always-released invariant is inherited rather than
re-implemented. Four result branches per Public Contracts §1: success runs `onSuccess`, toasts and
updates; failure toasts `data.error` and STILL calls `update()` so a page's own banner renders;
redirect calls `goto(location, { invalidateAll: true })` and fires no toast; error yields a fixed
friendly string. 11 tests, toast store NOT mocked (the real `addToast` is under test); only
`$app/navigation` is mocked.

**S2.** `ConfirmButton` posts through `submitFeedback`. Trigger disables while busy, the confirm
control reads "Working…", the dialog holds until the result resolves, the outcome is toasted.
`ConfirmDialog.svelte` and `Dialog.svelte` were NOT edited (E1) — verified by a zero-line git diff.
The hold is achieved by re-setting `open = true` inside `onconfirm` (undoing the dialog's own
close in the same tick, which `$bindable` allows) and releasing it on the `busy` true→false edge.
Nine props byte-compatible; `successMessage` (default `null`) and `triggerTitle` added.

**S3.** `setFlash` / `takeFlash` cookie helpers with an `id` nonce (E4); the `(app)` layout load
reads and clears; the layout fires it as a toast in an `$effect` deduped by a `Set`, mirroring
`seenNotifications`. Adopted in every redirect-after-success flow on disk. 8 tests.

**S4.** All 13 raw `e.message` `fail()` arms deleted; each sat below an `isHttpError` arm that
already handled the user-actionable case, so rethrow was the correct choice everywhere (plan item
21's default). `handleError` added to `hooks.server.ts`. `audit-log:129` moved from `{ message }`
to `{ action: 'reveal', error }`. 7 tests.

## Test Gate Outcomes

Full CI gate set (`format:check` → `lint` → `check` → `test`) run in CI order before EACH of the
four commits, all green each time. `pnpm check` was run only with the dev server down (E7); no
dev server was running at any point. `pnpm prisma generate` was run before the first `check`.

| Gate | Result |
|---|---|
| `pnpm test -- submit-feedback submit-guard` | GREEN — 21 tests |
| `pnpm test -- flash` | GREEN — 8 tests |
| `pnpm test -- handle-error` | GREEN — 7 tests |
| `grep -rn "e\.message" src/routes \| grep "fail("` | **0 matches** (13 before) — AC-4 gate met |
| `pnpm check` | 0 ERRORS, 1 pre-existing warning (`CalculatorWindow.svelte:82`) — AC-2 met, all 12 ConfirmButton call sites unedited |
| `pnpm lint` | 0 errors, 1 pre-existing warning |
| `pnpm format:check` | GREEN |
| `pnpm test` | GREEN — 201 files / 2299 tests |

`pnpm test:e2e` NOT run — assigned to the S5–S6 agent.

### Mutation checks (E8) — both RUN, RED recorded

**S1 (item 8).** `busy` is released by the guard's `finally` (E2's composition puts it there, not
in `submitFeedback`), so the equivalent deletion is that `finally`. Deleted it →
**8 of 11 submit-feedback tests RED**, including the named one:

```
× submitFeedback > releases busy on every result type
  → busy latched on success: expected true to be false
× submitFeedback > releases busy when onSuccess throws
  → expected true to be false
```

Restored. `git diff -- src/lib/utils/submit-guard.svelte.ts` = **0 lines** (E2 satisfied).

**S4 (item 27).** `handleError` changed to return `error.message` → **4 of 7 handle-error tests
RED**:

```
× returns a friendly string carrying a reference
  → expected 'Invalid `db.employee.findUnique()` in…' to match /^Something went wrong\. \(Ref: …/
× never returns the error message or the stack
  → expected 'Invalid `db.employee.findUnique()` in…' not to contain 'invocation'
× logs the same reference the user is shown, with the detail
× handles a non-Error throw without leaking it
  → expected 'bare string with a secret' not to contain 'secret'
```

Restored, green.

## Drift Found vs the Plan's Line Numbers

The plan and contract were verified against `staging@093a413`; this branch carries phases 01–03.
Every cited line was re-derived before editing.

| Claim | On this branch |
|---|---|
| 13 `e.message` `fail()` arms at a named file:line list | **EXACT, 13/13.** No drift. |
| `NewTimesheetDialog.svelte:102-108` is the 3-type handler | Now at **:69-82**. Same shape; branch structure copied from there. |
| `ConfirmButton` has 11 call-site files | **12** (`grep -rln "ConfirmButton" src/` = 13 incl. the guard's doc comment). One added by phases 01–03. All 12 compile unedited. |
| Item 17 / C12: "seven redirect flows", C12 rules seven correct | **SIX on disk.** The list names `recruitment/[id]` convert AND hire as two flows; there is no `hire` action — `recruitment/[id]` has one redirect (`convert:`, now `:203`). Actions are `advanceStage`, `updateStatus`, `setChannel`, `convert`. Item 17's own prose ("the six named flows") is the correct count; the bullet list is what is wrong. All six real flows adopted. |
| Item 24: check `+error.svelte` renders `$page.error.message`, wire if not | **Already renders it** (`+error.svelte:37-39`, inside the non-404 branch). No edit — contract's verified-correct claim holds. |
| Item 25: audit-log template must be updated to read `form?.error` | The template already had a `failure` derived and rendered it — but it narrowed on `'message' in form`. Changed that one line to `'error' in form`. Smaller than planned. |
| C1 / OD-2: `format:check` RED on `docs/ui-ux-audit-2026-09-03.md` | **RESOLVED** before this session. Tree is format-green. No action taken. |
| C9: Toaster has zero `role`/`aria-live` | **Landed in phase 01.** Not in S1–S4 scope; noted for the S5 agent — item 30's fallback branch is now the dead one. |
| `(app)/+layout.svelte:77` `seenNotifications` | Now at **:78**. Pattern mirrored as instructed. |
| Baseline `pnpm test` 192 files / 2170 tests | **199 / 2273** at session start (phases 01–03). |

## Plan Deviations

1. **Six flash flows adopted, not seven.** Forced by the drift above — the seventh (`recruitment`
   hire) does not exist. Within blast radius, documented.
2. **`ConfirmButton` reads `successMessage` and `submit` through closures**
   (`success: () => successMessage`, `inner: (input) => submit?.(input)`) rather than passing them
   directly. `pnpm check` flagged `state_referenced_locally` on the direct form: it snapshots the
   prop at first render, so a per-row call site swapping them would silently keep the first row's
   values. Two new warnings, now zero. Within blast radius.
3. **Three existing tests changed** — `separation-routes.test.ts`, `request-decide-feedback.test.ts`
   (×2). All three asserted that a plain `Error`'s raw text reached the client, i.e. they pinned
   exactly the leak S4 removes. Rewritten to assert the rethrow. Within blast radius (tests for
   routes this section changes).
4. **One existing test extended** — `request-filing-role-context.test.ts`'s `formEvent` double
   gained a `cookies` stub, because `leave/new ?/create` now sets a flash. Within blast radius.
5. **`handleError` returns `message` unchanged for a 404.** Not in the plan. Without it every
   missing page would read "Something went wrong. (Ref: …)" instead of "Not Found", which is worse
   than the defect being fixed. Pinned by a test.
6. **`values: raw` on `requests:152`** — preserved on the `isHttpError` arm, which already carried
   it (item 22). The deleted unexpected-error arm's copy is gone with the arm; that path is now an
   error page, where form repopulation has no meaning.

No hard-stop-class deviations. No auth, billing, schema, container or public-API change.

## Test Infra Gaps Found

- **`pnpm test -- <name>` does not filter.** It runs the whole suite (200 files) and reports on
  all of it. Used `npx vitest run <path>` for per-section iteration and `pnpm test` for the gate.
  The validate contract's `pnpm test -- submit-feedback` rows are therefore satisfied by a
  superset, not a subset — greener than specified, not less.
- No unit test exercises SvelteKit's actual `Set-Cookie` through a 303, so the flash round-trip is
  proven only at the helper boundary. This is already named in the contract's "What this coverage
  does NOT prove".

## Closeout Packet

- **Selected plan:**
  `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-04-feedback-contract_PLAN_03-09-26.md`
- **Finished:** S1, S2, S3, S4 — four commits, tree clean, nothing pushed.
- **Verified:** every Fully-Automated gate in the validate contract that covers S1–S4, plus both
  mandatory mutation checks with RED output recorded above.
- **Still unverified:** every Hybrid and Agent-Probe row (they need a running dev server and a
  browser; the owner starts those). Specifically: the live `ConfirmButton` probe (AC-2), the no-JS
  `separations` create flash with the `/requests` non-flash control (AC-3), the hover-preload flash
  gate (AC-3), and every AC-5 money/permission/destructive drive — the last of which mostly depends
  on S6 adoption that has not run.
- **Remaining:** S5, S6, then the manual silent-site checklist.
- **Best next state:** `Keep in active/testing`. The phase is not archivable — S5 and S6 are
  unstarted and no Hybrid gate has been executed live. Phase status is below `CODE DONE` for the
  phase as a whole; S1–S4 individually are code-done and gate-green.

**Follow-up stubs created:**
`process/features/ui-ux-overhaul/backlog/api-v1-raw-error-message-leak_NOTE_03-09-26.md` (C4 — the
4 `e.message` forwards in `api/v1/leave/[id]` and `api/v1/timesheets/[id]`).

The other two contract-named backlog artifacts
(`e2e-flakiness-blocks-feedback-regression_NOTE_03-09-26.md`,
`org-switcher-offline-path-unproven_NOTE_03-09-26.md`) belong to S5/S6 and e2e, which are the next
agent's scope — not created here.

No `CONTEXT_PARTIAL` items found.

## Forward Preview

**Test infra found.** Runner is vitest via `vitest.config.ts`, `environment: node`, `globals: true`,
include `tests/unit/**`. `.svelte.ts` rune modules work in unit tests (the sveltekit plugin compiles
them) — `submit-feedback.test.ts` proves `$state` across a module boundary is observable, so the
S5 toast-store work can be unit-tested the same way instead of only by probe. `pnpm test -- x` does
not filter; use `npx vitest run <path>`.

**Blast radius changes.** Now claimed and landed: `src/lib/utils/submit-feedback.svelte.ts`,
`src/lib/server/flash.ts`, `src/lib/components/ui/ConfirmButton.svelte`, `src/hooks.server.ts`,
`(app)/+layout.server.ts`. `(app)/+layout.svelte` is touched (flash `$effect` added after the
notifications `$effect`) — **S5 also edits this file** for the notification-ids POST and the
org-switcher `catch`; the two regions do not overlap. `ConfirmDialog.svelte` and `Dialog.svelte`
remain zero-touch and phase-03-owned. `ConfirmButton`'s API is now FROZEN — phase 05 consumes
`successMessage` and `triggerTitle` as specified.

**Commands to stay green.** `pnpm format:check && pnpm lint && pnpm check && pnpm test`, in that
order, with no dev server running. Baseline after S4: 201 files / 2299 tests; `pnpm check` 0 errors
/ 1 pre-existing warning; `pnpm lint` 0 errors / 1 pre-existing warning.

**Dependency changes.** None. No new package, no schema change, no migration.

**Notes for the S5/S6 agent.**
- Phase 01 already landed the Toaster ARIA, so item 30's "if phase 01 has not landed, add it here"
  branch is dead — verify the attribute, do not re-add it.
- `submitFeedback` is the first real consumer of `kind: 'error'` (item 31) — already satisfied by S1.
- S6 item 52 (org-switcher `catch`) is still open; S5 item 36 owns it.
- E3's `saved: true | string` reconciliation with `rejectMany` is untouched — it is an S6 entry gate.
- The layout's flash `$effect` uses a `Set` keyed on `flash.id`; if S5 changes the notifications
  `$effect` next to it, keep the two `Set`s separate.
