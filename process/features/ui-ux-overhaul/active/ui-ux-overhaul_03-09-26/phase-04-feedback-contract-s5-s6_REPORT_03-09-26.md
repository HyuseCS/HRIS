---
phase: phase-04-feedback-contract
date: 2026-09-03
status: COMPLETE_WITH_GAPS
feature: ui-ux-overhaul
plan: process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-04-feedback-contract_PLAN_03-09-26.md
---

# Phase 04 — S5–S6 execute report, and the phase close

Scope of this session: **S5** (Toaster upgrades + notifications) and **S6** (named-site adoption).
S1–S4 were done in a prior session and are reported in
`phase-04-feedback-contract-s1-s4_REPORT_03-09-26.md`. Branch `feat/uiux-phase-4`. Four commits,
full CI gate set green in CI order before each. Nothing pushed.

| Section | Commit | Files |
|---|---|---|
| S5 Toaster + notifications | `2e8f5e6` | `toast.svelte.ts`, `Toaster.svelte`, `(app)/+layout.svelte`, `(auth)/+layout.svelte` (new), `api/v1/notifications/read/+server.ts`, dashboard `+page.server.ts` + `+page.svelte`, `tests/unit/toast-store.test.ts` (new) — 8 files |
| S6 named-site adoption | `32818a2` | 26 src files + 2 test files — `submit-feedback.svelte.ts`, `ConfirmButton`, `LoadError.svelte` (new), `TimesheetModal`, `AggregatePanel`, `CalculatorPanel`, and the requests / payroll / periods / roles / attendance / leave / timesheets / dashboard / recruitment / employees route files; `tests/unit/high-stakes-action-feedback.test.ts` (new) |
| S6 item 43 (P0-7) | `eab4c57` | `employees/[id]/+page.svelte`, `tests/unit/employee-detail-error-slots.test.ts` (new) — split out per plan item 57 |
| S6 e2e locators | `9fe4b89` | 3 `tests/e2e/*.spec.ts` |

## What Was Done

### S5 — Toaster upgrades and notifications (items 29–36)

**29. Cap + pausable timer.** `toast.svelte.ts` gained `MAX_VISIBLE = 5` (dropping from the OLDEST
end, so the toast describing what the user just did always survives) and a per-toast timer record
kept OUTSIDE `$state` — `{ handle, remaining, startedAt }` — so pausing never re-renders.
`pauseToasts()` clears each handle and debits the elapsed time from `remaining`; `resumeToasts()`
restarts from what is LEFT, not a fresh 6s. A toast created while paused does not start its timer
at all.

**30. Pause-on-hover / focus-within, dismiss-all.** `Toaster.svelte` pauses on `focusin` at the
region and on `mouseenter` per toast, and gains a "Dismiss all" control once the stack exceeds 2.
The ARIA was verified present, not re-added — see Drift. Hover is attached through a tiny
`pausable` action rather than `onmouseenter`, because declaring a mouse handler on a static toast
card earns an a11y warning that it would be wrong to silence; the keyboard equivalent already
lives on the region.

**31. `error` kind used.** Satisfied by S1 — `submitFeedback` is its consumer. Verified, no work.

**32. `(auth)/+layout.svelte` CREATED** (E5) with `<Toaster/>` and `{@render children()}`. Login
renders — `pnpm check` clean and all 141 e2e specs, which sign in through this layout, pass.

**33 + 34. Notification overflow.** `/api/v1/notifications/read` accepts an optional
`{ ids: string[] }` and calls `markRead`; a body-less or non-JSON POST still means `markAllRead`
(E6 — backward compatible on a versioned path). The layout `$effect` now sends exactly the ids it
just toasted. `listUnread` caps at 10, so with 11+ unread the overflow was being marked read
without ever being shown; it now stays unread and surfaces on the next load.

**35. Recoverable history.** `listRecent(user.id, 8)` → `25`. The read/unread affordance the plan
asks for already exists (phase 01/03 gave unread rows an accent ring and a "· New" label), so the
only addition was `max-h-96 overflow-y-auto` on the list — 25 rows would otherwise have made this
card three times the height of the two beside it, a regression my own change would have caused.

**36. Org switcher.** `try/finally` with no `catch` gained one, toasting
`'Could not switch organization.'`. The `!res.ok` branch was upgraded to `kind: 'error'` at the
same time. This also closes S6 item 52.

### S6 — named-site adoption (items 38–56)

**The one reusable rule (E3).** Rather than wire ~20 bespoke success messages, the
`saved: true | string` contract was taught to `submitFeedback` ONCE: with no explicit `success`
option it toasts the action's own `saved` string. `ConfirmButton` does the same
(`successMessage ?? data.saved`). Adopting a site is now: return a `saved` string server-side, swap
`createSubmitGuard()` → `submitFeedback()` client-side. That is what kept a 21-site adoption to
~420 added lines. Reconciled with `rejectMany` first, as E3 requires — it was already returning a
string, and it is now the shape everything else follows.

| # | Site | What landed |
|---|---|---|
| 38 | `requests/approvals ?/decideRequest` | `action` tag added (phase 01 gave the `saved` string); both guards → `submitFeedback`, so a decision toasts as well as banners. `rejectMany` tagged to match |
| 39 | `requests/timesheets ?/review` | `action` tag; `TimesheetModal`'s `closeOnSuccess` now wraps in `submitFeedback` — the modal CLOSES on success, taking its banner with it, so the toast is the only surviving signal |
| 40 | `payroll/[id] ?/decide` | `{ action: 'decide', saved }`, different strings for sign-off vs return. The local `action` binding is NOT shadowed — the return names its keys explicitly (C10) |
| 41 | `employees/[id] ?/offboard` | Server shape was already right (phase 01); the page now toasts it via `submitFeedback` |
| 42 | `employees ?/offboard` | **VERIFIED already deleted** by phase 01. `employees/+page.server.ts` has no `actions` export and carries a comment explaining why. No work — see OD-1 |
| 43 | `employees/[id]` P0-7 | Own commit — see below |
| 44 | `payroll/periods ?/void` `?/release` | `action` tags; the existing `ConfirmButton`s now toast the server's `saved` string with zero call-site change |
| 45 | `leave ?/deleteMany` | Scoped error Banner added — `fail()` arrived and the template rendered only `form?.saved` |
| 46 | `timesheets` list | List-level error Banner gated on `!openTs`, so a failure with the modal SHUT renders, and an open modal still shows it once in place |
| 47 | `dashboard ?/decidePosting` | `action`-scoped slot under Postings; `giveAward` and `postAnnouncement` slots scoped too, so a posting failure stops rendering under "Give award". The dead `postingDecided` flag became a real `saved` string |
| 48 | `recruitment/[id]` | `action` tags on every arm; a scoped Banner in the header for `updateStatus`/`advanceStage` and one in the hired-applicants card for `convert`. A publish that a server rule refused no longer reads as a no-op. The dead `{ success: true }` on `setChannel` became a `saved` string |
| 49 | 4 `{#await}` blocks | New `LoadError.svelte` (Banner + a Retry that calls `invalidateAll`) rendered from a `{:catch}` on employees, payroll and both timesheets lists |
| 50 | `CalculatorPanel` | The `error` result type fell through every branch, leaving the previous employee's figures under a stale heading. Now clears the result and toasts |
| 51 | `AggregatePanel` | Both callbacks swallowed `error` entirely; both wrap in `submitFeedback` |
| 52 | org switcher | Done in S5 item 36 — verified |
| 53 | `payroll ?/void` | `{ action: 'void', saved: 'Payroll run voided.' }`; the existing `ConfirmButton` toasts it |
| 54 | attendance lock/unlock/lockTeam/unlockTeam/resetDay | All five return `{ action, saved }`; their guards → `submitFeedback`. Several auto-submit on `onchange`, so the toast is the only possible cue |
| 55 | `settings/roles ?/setActive` | `{ action: 'setActive', saved }`, different strings for activate vs deactivate |
| 56 | six flash flows | **VERIFIED on disk:** `setFlash` at `employees/new:163`, `recruitment/[id]:210` (convert), `recruitment/[id]/apply:77`, `leave/new:85`, `separations:62`, `timesheets:287`. All six destinations are inside `(app)`, whose layout load reads the flash. Live rendering is the Hybrid gate |

**Item 43 (P0-7), commit `eab4c57`.** `employees/[id]` has 21 form actions and had ONE ungated
error slot, itself inside the Update Profile card — which is gated on
`canManage && status === 'ACTIVE'`. For an OFFBOARDED employee a failed document upload, loan add
or contact delete therefore rendered **nowhere at all**. One `actionError(names)` snippet now sits
in each card and answers only for its own actions. Phase 01 had already tagged every action with
`action:` and already scoped 5 slots (update, assignTemplate, changeCompensation, promote,
offboard); this session added the other 16 across 7 cards. A cross-check confirms **21/21 actions
covered**: 20 with a slot, plus `reveal`, which has no `fail()` path at all.

## Test Gate Outcomes

Full CI gate set run in CI order (`format:check` → `lint` → `check` → `test`) before EACH commit,
green each time. `pnpm check` was run only with the dev server DOWN (E7); none was running at any
point. `pnpm prisma generate` was run before the first `check`.

| Gate | Result |
|---|---|
| `pnpm format:check` | GREEN |
| `pnpm lint` | 0 errors, 1 warning — `CalculatorWindow.svelte:82`, pre-existing and untouched |
| `pnpm check` | 1112 files, **0 ERRORS**, 1 warning (the same pre-existing one) |
| `pnpm test` | GREEN — **205 files / 2317 tests** (from 201/2299 at the end of S4: +3 files, +18 tests) |
| `pnpm test:e2e` | **141/141 passed**, matching the 141 baseline exactly. Went red once first — diagnosed, see below |
| `tests/unit/toast-store.test.ts` | GREEN — 7 tests: cap drops the oldest, pause holds past the timeout, resume uses the time LEFT, a toast added while paused does not start |
| `tests/unit/high-stakes-action-feedback.test.ts` | GREEN — 5 tests over payroll void/decide, period release/void, roles setActive, the 5 attendance locks |
| `tests/unit/employee-detail-error-slots.test.ts` | GREEN — 3 tests: every failable action is slotted, and no ungated `{#if form?.error}` may return |
| `tests/unit/submit-feedback.test.ts` | GREEN — 14 tests (was 11; +3 for the `saved` contract) |

### The e2e red, diagnosed (#287)

The first run failed 3 specs. **None was flakiness** — all three were one cause:

```
strict mode violation: getByText(/Synced \d+ days? from attendance/) resolved to 2 elements
```

The success message now renders TWICE — the page's own banner and the new toast — so a page-wide
`getByText` matched both. Each locator was anchored to `getByRole('main')`: same text, same
visibility assertion, one node. Nothing was weakened, and no product behaviour was changed to suit
a test. A fourth instance of the same pattern surfaced on the re-run and got the same fix. Final:
141/141.

### Mutation checks (S5/S6 are not covered by E8, which names items 8 and 27 — run anyway)

**Toast store.** Deleted the cap loop AND the `remaining` debit in `pauseToasts` →
**2 of 7 RED**, the two that name those behaviours:

```
× toast store > caps the stack at 5 and drops the OLDEST
× toast store > resumes with the time that was LEFT, not a fresh timeout
```

Restored, green.

**P0-7 sweep.** Deleted the `{@render actionError(['addLoan', 'addCashAdvance'])}` slot →
**1 of 3 RED** (`gives every failable action its own scoped error slot`, expected `[]` received a
non-empty array). Restored, green. This is the phase 07 tripwire: moving a card into a tab without
its slot puts the defect straight back.

**High-stakes shapes.** Not a deliberate mutation, but the first run of
`high-stakes-action-feedback.test.ts` failed with `expected undefined to be 'lock'` because the
test posted a range without `employeeId` and `rangeSchema` requires it. The assertion bites.

## Plan Deviations

All within blast radius; none hard-stop class. No auth, billing, schema, container or
public-API-contract change.

1. **`submitFeedback` and `ConfirmButton` were extended, not just consumed.** The `saved` fallback
   was added to both so the E3 contract is expressed once instead of at ~20 call sites. Both files
   are phase-04-owned; `ConfirmButton`'s public API is unchanged (no prop added, removed or
   renamed), so the phase-05 freeze holds.
2. **New shared component `LoadError.svelte`.** Item 49 asks for a `{:catch}` "with a retry
   affordance" on 4 blocks. One 33-line component beats four hand-rolled copies, and it composes
   phase 03's `Banner` rather than introducing new markup.
3. **`TimesheetModal.svelte` was touched** — not in the plan's file list, but it is where
   `?/review` (item 39) actually posts from, and the modal closing on success is what made that
   success invisible. Its `ConfirmButton` deliberately keeps the RAW inner callback, since
   `ConfirmButton` brings its own feedback layer and wrapping there would toast twice.
4. **Dashboard `giveAward` / `postAnnouncement` slots were scoped too.** Item 47 only names
   `decidePosting`, but scoping one of three unscoped slots on a page does not fix cross-talk —
   the other two would still have caught its error.
5. **Dead `details: parsed.error.flatten()` removed at `recruitment/[id]`.** It sat on the exact
   line item 48 required editing, and the plan's own Tracked Follow-Up lists it as dead. Verified
   nothing in the template reads it.
6. **`setChannel` and `postingDecided` dead success flags converted.** Both are on lines items 47
   and 48 required editing; leaving `{ success: true }` next to a new `{ action, saved }` in the
   same object would have shipped two contracts in one file.
7. **A `max-h-96 overflow-y-auto` was added to the dashboard activity list.** Not in item 35, but
   raising the cap 8 → 25 is what would have made the card overflow its row.
8. **Three unit test files were added.** The plan specifies no automated gate for S5/S6 — every
   row is Hybrid or Agent-Probe, and no dev server is available to this session. Rather than mark
   ~21 sites done on zero evidence, the parts that CAN be proven without a browser were: the toast
   store's cap and pausable timer, the high-stakes success payload shapes, and the P0-7 slot
   coverage. This converts three would-be vacuous-green sections into automated gates. The browser
   half of each remains deferred below.
9. **`pnpm test -- <name>` still does not filter** (carried from the S1–S4 report). `npx vitest run
   <path>` was used for iteration, `pnpm test` for the gate.

## Drift Found vs the Plan

| Claim | On this branch |
|---|---|
| Item 30 fallback: "if phase 01 has not landed, add the ARIA here" | **Dead branch, as briefed.** `role="status"` + `aria-live="polite"` + `aria-atomic="false"` on the region and `aria-live="assertive"` for `kind === 'error'` are all present from phase 01. Verified, not re-added |
| Item 42: `employees ?/offboard` is a dead action to delete | **Already deleted by phase 01.** The file has no `actions` export at all. Verified, recorded, not redone |
| Items 38–41: these actions are silent | **Partly fixed by phase 01**, which added the `saved` strings and tagged all `employees/[id]` actions with `action:`. This session reconciled them to the E3 contract and added the toast/slot layer rather than double-adding |
| Item 43: "19 of 24 actions have no error slot" | **21 actions on disk, 5 already slotted by phase 01.** 16 slots added here; 21/21 now covered (`reveal` has no `fail()` path) |
| Item 56 / C12: seven flash flows | **SIX**, as the S1–S4 report found — `recruitment/[id]` has no `hire` action. All six verified present |
| C9: "the Toaster has zero `role`/`aria-live`" | Stale as of phase 01. See item 30 above |
| Baseline `pnpm test` 192 files / 2170 tests | 201/2299 at session start; 205/2317 at the end |
| e2e baseline | 141 specs; 141/141 before and after |

## Test Infra Gaps Found

- **No toast locator exists for e2e.** The strict-mode failures above are the symptom: a toast and
  a page banner carrying the same text are indistinguishable to a page-wide `getByText`. Until a
  `[role="status"]` region helper exists, no e2e test can assert "a toast fired" — which is why
  every AC-8/AC-9 row is Agent-Probe. Recorded in
  `e2e-flakiness-blocks-feedback-regression_NOTE_03-09-26.md`.
- **No DOM environment for component tests** (`vitest` `environment: 'node'`). The org-switcher
  `catch` arm cannot be unit-tested for this reason; recorded in
  `org-switcher-offline-path-unproven_NOTE_03-09-26.md` and pre-existing as
  `component-test-dom-environment_NOTE_03-09-26.md`.
- **`.svelte.ts` rune modules DO work in unit tests** — `toast-store.test.ts` drives `$state`
  across a module boundary with `vi.useFakeTimers()`. Confirms the S1–S4 report's forward preview.

---

# PHASE-LEVEL CLOSE

## All six sections' commits

| Section | Commit | Landed |
|---|---|---|
| S1 `submitFeedback` util | `001965d` | S1–S4 session |
| S2 `ConfirmButton` rebuild | `e5009f3` | S1–S4 session |
| S3 cookie flash | `b2d1526` | S1–S4 session |
| S4 server error handling | `66d95f1` | S1–S4 session |
| S5 Toaster + notifications | `2e8f5e6` | this session |
| S6 named-site adoption | `32818a2` | this session |
| S6 item 43 (P0-7), split per item 57 | `eab4c57` | this session |
| S6 e2e locator fixes | `9fe4b89` | this session |
| Reports | `d5c9439` (S1–S4), this file | — |

Six sections, six-plus commits, no schema change, no new dependency. Each section is independently
revertible.

## Phase status: `CODE DONE`

Not `VERIFIED`. Per the plan's Phase Completion Rules, `VERIFIED` requires every Hybrid gate
executed live and the manual silent-site checklist completed with positive assertions. **No dev
server was available to this session and the owner starts them** — so every Hybrid and Agent-Probe
row is deferred, consolidated below.

The Fully-Automated tier is fully green, and three sections that the plan left with NO automated
gate now have one (see Deviation 8).

## Consolidated deferred Hybrid / Agent-Probe list — the owner's manual pass

From BOTH phase-04 reports. Preconditions for all of it: `./start.sh` (DB `veent-db-5434`) plus the
vite dev server, both started by the owner, plus `POST /api/v1/_dev/login-as`. **`pnpm check` kills
the dev server — run it before or after, never during.**

For each, assert something POSITIVE: a named node with its text. "The toast is absent" proves
nothing.

### Hybrid (money / permission / destructive — the minimum tier for these)

| # | Gate | AC | From |
|---|---|---|---|
| H1 | `payroll/periods ?/release` shows "Period released." | AC-5 | both |
| H2 | `payroll/periods ?/void` shows "Period voided." | AC-5 | both |
| H3 | `payroll ?/void` shows "Payroll run voided." | AC-5 | both |
| H4 | `payroll/[id] ?/decide` — sign off shows "Payroll run signed off."; return shows "Run returned to the maker." | AC-5 | both |
| H5 | `settings/roles ?/setActive` — deactivate shows "Login deactivated."; activate shows "Login activated." | AC-5 | both |
| H6 | `employees/[id] ?/offboard` shows "Employee offboarded." | AC-5 | both |
| H7 | Attendance `lock` / `unlock` / `lockTeam` / `unlockTeam` / `resetDay` — a message for each. Several auto-submit on `onchange`, so this is the ONLY cue | AC-5 | S5–S6 |
| H8 | **No-JS flash.** With JS disabled, submit `separations` create → the message renders at `/separations/[id]`. **Control:** submit a `/requests` filing with JS disabled → its page-local banner renders (non-flash path). Subject is NOT `leave/new` — phase 06 deletes that route | AC-3 | S1–S4 |
| H9 | **Hover-preload flash.** After a flash redirect, hover a nav link, then confirm the message still renders (`data-sveltekit-preload-data="hover"` is set in `app.html`; C8) | AC-3 | S1–S4 |
| H10 | **P0-7 negative control.** Open an OFFBOARDED employee, force an `addLoan` failure → the error renders in the Loans card. The control: Update Profile is HIDDEN for that employee, so pre-fix it rendered nowhere | AC-7 | both |
| H11 | Create an employee → the destination says "created" AND mentions the temp-password email | AC-3 | S1–S4 |
| H12 | Convert from `recruitment/[id]` → the destination message renders | AC-3 | both |
| H13 | `timesheets ?/create` self-redirect → the message appears | AC-3 | S1–S4 |
| H14 | `apply` → board message | AC-3 | S1–S4 |
| H15 | `leave/new` → `/leave` message (JS on only — phase 06 deletes this route) | AC-3 | S1–S4 |

### Agent-Probe (single judgment, single machine)

| # | Probe | AC | From |
|---|---|---|---|
| P1 | `ConfirmButton` live: the trigger disables, the dialog HOLDS until the result resolves, a toast fires | AC-2 | S1–S4 |
| P2 | Hover a link-toast past 6s → it survives. **Positive control:** an unhovered toast expires | AC-8 | S5–S6 |
| P3 | The toast region carries `role="status"` + `aria-live`, and `assertive` for `kind === 'error'`. Assert the ATTRIBUTE, not the look | AC-8 | S5–S6 |
| P4 | Raise 11 unread notifications → all 11 eventually surface and none is marked read unshown | AC-9 | S5–S6 |
| P5 | Reject one `data.employees` promise → an error state with a Retry renders, not a blank list | AC-10 | S5–S6 |
| P6 | The login page `(auth)` can toast | AC-8 | S5–S6 |
| P7 | "Dismiss all" appears once 3+ toasts are up and clears them | AC-8 | S5–S6 |
| P8 | Trigger an unexpected 500 → the error page shows "Something went wrong. (Ref: …)" and the SAME ref appears in the server log | AC-4 | S1–S4 |
| P9 | `/timesheets` list action failure with the modal CLOSED → the error renders | AC-5 | S5–S6 |
| P10 | Dashboard `decidePosting` failure with the award panel OPEN → the error renders under Postings, not under "Give award" | AC-5 | S5–S6 |
| P11 | `recruitment/[id]` publish that fails a server rule → the error renders, not a no-op | AC-5 | S5–S6 |
| P12 | `/leave` bulk-delete failure → the error renders | AC-5 | S5–S6 |

### Known-Gap (CONDITIONAL — a backlog stub, never a proving strategy)

| Gap | Stub |
|---|---|
| `pnpm test:e2e` cannot prove the feedback contract (it is green, but it never looks at toasts) | `e2e-flakiness-blocks-feedback-regression_NOTE_03-09-26.md` |
| The offline org-switch `catch` path cannot be provoked locally | `org-switcher-offline-path-unproven_NOTE_03-09-26.md` |
| 4 raw `e.message` forwards in `api/v1/leave/[id]` and `api/v1/timesheets/[id]` | `api-v1-raw-error-message-leak_NOTE_03-09-26.md` (S1–S4) |

## OWNER-DECISION status

- **OD-1** — `employees/+page.server.ts ?/offboard` is dead: delete it, or wire a list-row button?
  **ALREADY EXECUTED, by phase 01.** The recommended default (delete) was taken before this phase
  ran. `employees/+page.server.ts` has no `actions` export and carries a comment pointing at
  `employees/[id] ?/offboard` as the real surface. Item 42 required no work. Recording it as
  executed, not as open.
- **OD-2** — `docs/ui-ux-audit-2026-09-03.md` failing `format:check`: **RESOLVED** before the
  S1–S4 session. The tree is format-green.
- **OD-3** — `ConfirmDialog` cross-phase ownership: honoured. `ConfirmDialog.svelte` and
  `Dialog.svelte` are **zero-touch** across all six sections (E1); the hold-until-resolve behaviour
  is achieved through the `$bindable` `open` workaround inside `ConfirmButton`.

## Closeout Packet

- **Selected plan:**
  `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-04-feedback-contract_PLAN_03-09-26.md`
- **Finished:** all six sections (S1–S6). Tree clean, nothing pushed.
- **Verified:** every Fully-Automated gate in the validate contract, plus three new automated gates
  the plan did not specify, plus both mandatory S1/S4 mutation checks (prior session) and two more
  run here. `pnpm test:e2e` 141/141.
- **Still unverified:** the 15 Hybrid and 12 Agent-Probe rows consolidated above. They need a
  running dev server and a browser; the owner starts those.
- **Remaining cleanup:** the manual silent-site checklist in the plan, then UPDATE PROCESS.
- **Best next state:** **`Keep in active/testing`.** The phase is CODE DONE and not archivable —
  no Hybrid gate has been executed live, so AC-2, AC-3, AC-5, AC-7, AC-8, AC-9 and AC-10 rest on
  code review plus the automated subset, not on live evidence.
- **Next plan path:** `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-05-destructive-actions_PLAN_03-09-26.md`
  — unblocked, since S2 is committed and `ConfirmButton`'s API is frozen with `successMessage` and
  `triggerTitle` in place for phase 05 site 15.

**Follow-up stubs created this session:**

- `process/features/ui-ux-overhaul/backlog/e2e-flakiness-blocks-feedback-regression_NOTE_03-09-26.md`
- `process/features/ui-ux-overhaul/backlog/org-switcher-offline-path-unproven_NOTE_03-09-26.md`
- `process/features/ui-ux-overhaul/backlog/feedback-contract-remaining-adoption_NOTE_03-09-26.md`
  (the plan's Tracked Follow-Up table — ~100 mechanical sites — carried forward with the adoption
  recipe so it survives the plan being archived)

No `CONTEXT_PARTIAL` items found.

## Forward Preview

**Test infra found.** `.svelte.ts` rune modules unit-test cleanly with `vi.useFakeTimers()`; a
module-level `$state` array is observable across the import boundary. Source-sweep tests
(`employee-detail-error-slots.test.ts`) are a cheap way to pin a structural invariant across a
1700-line template — with the caveat that the sweep MUST assert it found the actions at all, or it
passes on an empty set. `pnpm test -- <name>` does not filter; use `npx vitest run <path>`.

**Blast radius changes.** Phase 04 now owns and has landed: `submit-feedback.svelte.ts`,
`flash.ts`, `ConfirmButton.svelte`, `Toaster.svelte`, `toast.svelte.ts`, `LoadError.svelte` (new),
`hooks.server.ts`, both app layouts, `(auth)/+layout.svelte` (new), the notifications read
endpoint, and the action return shapes of ~15 route files. `ConfirmDialog.svelte` and
`Dialog.svelte` remain zero-touch and phase-03-owned.

**For phase 05 (destructive actions).** `ConfirmButton` is FROZEN and ready: nine original props
plus `successMessage` and `triggerTitle`. It now toasts the action's own `saved` string with no
prop at all, so a new confirm site only needs its server to return one. Site 15 (attendance reset)
has `triggerTitle` waiting.

**For phase 07 (`employees/[id]` split).** Rebase onto `eab4c57`, not the reverse. The
`actionError` snippet plus `errorFor()` must move WITH the cards into their tabs;
`employee-detail-error-slots.test.ts` will go red if a card arrives without its slot, and its file
paths need updating when the page is split.

**Commands to stay green.** `pnpm format:check && pnpm lint && pnpm check && pnpm test`, in that
order, no dev server running. Then `pnpm test:e2e`. Baselines after this session: 205 files / 2317
unit tests; `pnpm check` 0 errors / 1 pre-existing warning; `pnpm lint` 0 errors / 1 pre-existing
warning; e2e 141/141.

**Dependency changes.** None. No new package, no schema change, no migration.
