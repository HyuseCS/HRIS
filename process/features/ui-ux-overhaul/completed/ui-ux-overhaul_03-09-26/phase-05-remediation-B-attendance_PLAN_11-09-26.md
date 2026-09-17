---
name: plan:phase-05-remediation-B-attendance
description: "Phase 05 owner-pass remediation batch B — attendance Reg/OT read-only (F10), dirty-row actions and Reset rename (F11b), Save all / Reset all (F11c)"
date: 11-09-26
feature: ui-ux-overhaul
phase: "05-remediation-B"
---

# Phase 05 remediation — batch B: `/attendance` corrections

**TL;DR.** Five commits on one page. Stop the Reg/OT boxes from lying (they are ignored by the
server, so they become read-only text). Then make the row show what was actually stored. Then show
**Save** only on a changed row and rename **Reset** to **Recalculate**. Then add **Save all** and
**Recalculate all**, both reporting per row and both scoped to the visible page. Section 5 waits for
plan A.

**Date**: 11-09-26
**Status**: PLANNED — PVL pending. No code changed.
**Complexity**: COMPLEX (5 independently committable sections; 2 source files, 5 test files, 1 money control, 1 owner live pass, 1 cross-plan file-ownership dependency)
**Feature**: ui-ux-overhaul
**Phase**: 05 remediation, batch B of 2 (plan A owns payroll/employees/separations/roles)
**Branch**: `feat/uiux-phase-5`
**Owner decisions D4 / D8 / D9 are FIXED.** Do not re-open them. Do not re-ask them.

---

## Overview

The phase 05 owner live pass (`phase-05-owner-pass_FINDINGS_11-09-26.md`) produced 11 findings. Three
of them live on `/attendance` and form this batch.

The worst is **F10**. HR can type a number into the **Reg** or **OT** cell, press Save, and get a
green `Attendance day saved.` toast — while the database stores `0.00` and the cell keeps showing
the typed number until a reload. Verified twice against the database. It is not a display bug with a
save bug beside it; it is one route bug (`+page.server.ts:207-210` forces the derive branch) and one
rendering bug (one-way `value={…}` inputs are never re-synced when the underlying value did not
change).

The owner's answer (**D4**) is not to honour the typed hours. Honouring them would bypass the
approved-overtime cap that `correctDay` applies from APPROVED `OVERTIME` requests — a money control.
So the fields become read-only and the page says so, copying the sentence the AM/PM columns already
carry for exactly the same reason (#162).

**F11b** and **F11c** are the owner's ergonomics asks on the same table: show **Save** only on a row
that changed, rename **Reset** so it stops reading like "undo my typing", and add bulk **Save all** /
**Recalculate all** that report per row rather than as a bare count. Both depend on F10 landing
first — a dirty rule built on fields that do not persist would encode the bug, and a bulk save that
saves nothing would multiply it.

The whole batch is one route, two tables, no schema, no migration, no new authorization logic.

---

## Goal

After this batch, on `/attendance`:

1. No control on the page offers to take a value the server will discard.
2. Every cell on a saved row shows what the database now holds, without a reload.
3. A row's **Save** exists only when that row has unsaved edits; **Recalculate** stays tied to
   committed state.
4. Bulk save and bulk recalculate exist, are scoped and labelled honestly (they act on the visible
   page), and report every row they touched with a reason for each one they could not.
5. The approved-overtime cap is structurally unbypassable from this route.

## Non-Goals

- The time picker (F11a) — deferred by the owner to its own plan after this batch.
- Anything plan A owns (see *Scope*).
- A "discard my unsaved edits" affordance. The findings raise it; the owner did not decide it.
- Narrowing `correctDay`'s service signature (see *Public Contracts*, residual).
- Any change to `correctDay` or `resetDayToDerived` themselves.

---

## Scope

**In scope**

| Finding | What it is |
|---|---|
| **F10** | Typed Reg/OT hours are silently discarded, the toast says "saved", and the cell keeps showing the typed number |
| **F11b** | Per-row **Save** shows on every row; **Reset** is named as if it undoes your typing |
| **F11c** | No **Save all** / **Reset all**; when they exist they must report per row |

**Out of scope — do not touch**

- **F11a (the time picker).** Owner deferred it to its own plan AFTER this batch. This plan only
  records the contracts that plan will inherit (see *Hand-off to the later F11a plan*).
- Everything plan A owns: `src/routes/(app)/payroll/**`, `src/routes/(app)/employees/**`,
  `src/routes/(app)/separations/**`, `src/routes/(app)/settings/roles/**`,
  `src/lib/server/services/payroll/**`, and **`tests/unit/destructive-confirms.test.ts`**.
- `note` on an attendance day. `correctSchema` accepts it (`+page.server.ts:176`) but **this page
  renders no `note` control on any row**, in either table. Verified by grep: no `name="note"` in
  `attendance/+page.svelte`. It is therefore not a dirty-state field and not a display-staleness
  field. Recorded as a residual, not planned.

---

## Owner decisions carried into this plan (fixed)

### D4 — Reg and OT become read-only / visibly derived (F10)

HR corrects a day by setting the **times**. Typed hours are **not** honoured, and the UI must stop
offering to take them.

**This is a money control. State it in the commit message.** The derive path caps overtime at
`approvedOtHours`, summed from **APPROVED `OVERTIME` requests**
(`src/lib/server/services/attendance/index.ts:609-623`), and stores the ungated figure separately as
`rawOvertimeHours`. The table renders the gap between the two as the amber *unapproved OT* marker
(`+page.svelte:800-804`). **Honouring a typed OT number would bypass that cap** — HR could pay
overtime that was never approved, and the amber marker would go quiet because the two figures would
agree. Making the fields read-only is what preserves the cap.

**Precedent to copy, on this same page.** The AM/PM columns are already read-only by design (#162)
and the page already says so in copy at `:541-545`:

> AM/PM columns are worked out from the punches and cannot be typed in. Correct a day by editing its
> In and Out.

Reg/OT get a sentence of the same shape. And `recalcHours` at `:102-121` currently carries the
comment *"HR can still override the numbers afterward"* — a promise the server breaks. That comment
goes when the behaviour goes.

### D8 — dirty-row actions, and Reset is renamed (F11b)

- **Save** renders only when the row has unsaved edits.
- **Reset** keeps `disabled={!d.manuallyEdited}` (`:672`, `:846`). It posts `?/resetDay` and acts on
  **committed** state, so it must not be hidden on the same rule. It is **renamed** so it stops
  reading like "undo my typing".
- D4 shrinks what *dirty* can mean. With Reg/OT read-only, a row is dirty only via **times** or
  **status** (`note` has no control — see Scope).

### D9 — bulk results are reported per row, not as a bare count (F11c)

Copy the precedent already on this page: the CSV import card at `+page.svelte:487-533` reports
applied / skipped / rejected with a per-line reasons `<details>`.

**Reset all** is destructive across many days, so under phase 05's own rule it needs a
`ConfirmButton` naming the **count**, the **date range**, the **employee**, and that hand-entered
data is lost. Both bulk buttons need a disabled state when nothing qualifies and a count in the
label.

---

## Verified research facts (do not re-derive)

1. **F10's bug is upstream of `correctDay`, not inside it.** `correctDay`
   (`attendance/index.ts:585`) does `const editingTimes = 'timeIn' in data || 'timeOut' in data`, and
   when that is false `write = { ...data }` — typed hours are **already honoured** on that branch.
   The defect is `+page.server.ts:207-210`:

   ```
   if (date) {
       data.timeIn  = timeIn  ? new Date(`${date}T${timeIn}:00+08:00`)  : null
       data.timeOut = timeOut ? new Date(`${date}T${timeOut}:00+08:00`) : null
   }
   ```

   Both keys are set whenever a `date` is present, and **every row form posts a hidden `date`**
   (`:659`, `:833`). So `editingTimes` is always true and the derive branch always wins.

2. `?/correct` returns `{ action: 'correct', saved: 'Attendance day saved.' }` at
   `+page.server.ts:216`, **unconditionally after the try/catch**. That is why the toast lies.

3. `regularHours` / `overtimeHours` are accepted by `correctSchema` (`+page.server.ts:174-175`) and
   reach `data` via `...rest` at `:205`, then get overwritten by the derive branch.

4. **`correctDay` has exactly ONE route caller** — `+page.server.ts:212`, action `?/correct` — posted
   from two forms, both in `attendance/+page.svelte`: the team table at `:657` and the day table at
   `:829`. No timesheet path reaches it.

5. **There is NO dirty state today.** The row inputs are one-way `value={...}` with no client model.
   A dirty rule needs per-row `$state` seeded from `data.days` / `data.team`. **That is the real cost
   of F11b, not the buttons.**

6. **The F3 trap applies here.** `+page.svelte:14-16` documents it, and `payroll/config` was just
   bitten by it: a native form reset blanks the DOM without telling Svelte, and one-way `value={...}`
   inputs are not re-synced unless the *expression* changed. Do **not** fix the
   displayed-not-equal-to-stored problem by letting the form reset.

7. **The stale-display problem is wider than Reg/OT.** Status override, night differential,
   late/undertime and the AM/PM split all move server-side on every correction and are stale in the
   DOM today. **D4 removes only the Reg/OT half of the symptom. Section 2 is needed regardless of
   D4.**

8. **The F11c premise in the findings doc is WRONG, and this plan corrects it.** F11c claims the bulk
   timesheet review "reports a partial failure as a failure". **It does not.** Verified at
   `src/routes/(app)/requests/timesheets/+page.server.ts:148-155`:

   ```
   if (done === 0)
       return fail(400, { error: 'No timesheets were approved. …' })
   return { saved: `Approved ${done} timesheet${done === 1 ? '' : 's'}${skipped ? `, ${skipped} skipped` : ''}.` }
   ```

   A partial returns **success** (`Approved 3 timesheets, 2 skipped.`); `fail()` fires **only when
   `done === 0`**. So the repo precedent is *partial = success with counts*, and D9 extends it to
   *partial = success with counts AND per-row reasons*. **Update the findings doc with this
   correction as part of Section 4's commit.**

9. **`Pagination` at `:879` means "all" is "all on this page".** The day table is paginated
   (`+page.server.ts:98-107`, one count + one page query). "Save all" and "Recalculate all" can only
   see `dayRows`, which is the current page, further filtered by the `exceptionsOnly` checkbox
   (`:161-163`). **The label must say so.**

10. **Post-format contract:** ``new Date(`${date}T${HH:MM}:00+08:00`)`` at `+page.server.ts:208-209`,
    fed by `name="timeIn"` / `name="timeOut"` at `:606`, `:616`, `:756`, `:766`.

11. `correctDay` **returns the updated row** (`attendance/index.ts:695-707`, `return updated` out of
    the `$transaction`). `src/hooks.ts` transports Prisma `Decimal` as a plain number across the
    server-to-client boundary, which covers a form-action return as well as `load` data. So returning
    the saved row from `?/correct` is safe and needs no bespoke serialization.

---

## Tests that constrain this work

| Test | Line | What it pins | Effect on this plan |
|---|---|---|---|
| `tests/unit/attendance-correct-derive.test.ts` | `:75, :89, :98, :111` | the times-derive path: 8h reg from 08:00–18:00, OT gated to 0 with no approved request, night diff, status override | **Must not break.** Nothing in this plan touches `correctDay`. |
| `tests/e2e/employee-view-only.spec.ts` | `:197` | posts `?/correct` as an employee with `{id:'any', date, status}` and no times, expecting **403** | **Verified unaffected.** The 403 comes from `requireAnyCapability(…, 'MANAGE_HR')` at `+page.server.ts:199`, which runs **before** `correctSchema.safeParse`. Removing two optional schema keys cannot change a pre-parse 403. |
| `tests/unit/high-stakes-action-feedback.test.ts` | `:149` | attendance `lock`/`unlock`/`lockTeam`/`unlockTeam`/`resetDay` each return `{action, saved}` | New `?/saveAll` and `?/resetAll` **must follow the same shape** and be added to this test. |
| `tests/unit/destructive-confirms.test.ts` | `:211-214`, `:219` | site 15 needle is `thrown away and re-derived from the raw punches`; `COPY.length === 17` | **Verified:** the needle pins the **dialog message**, not the trigger label — so the D8 rename does **not** break this gate. The `COPY.length` assertion **does** collide with Section 5. See *Hand-off to plan A*. |

### The test-coverage gap this plan must close (stated explicitly)

- **Nothing today asserts the hand-typed path.** Every test in `attendance-correct-derive.test.ts`
  passes `timeIn`/`timeOut`. No test calls `?/correct` with hours and no times, so the bug in fact 1
  was invisible to the suite for its whole life.
- **Nothing today asserts that the displayed value matches the stored one.** There is no test, unit
  or e2e, that saves a row and then reads the DOM back. That is why F10's second defect survived.
- Both gaps get a named gate below (G1.2, G2.2).

---

## Implementation Checklist

Atomic, ordered, one commit per section. Each item names its file.

**Section 1 — Reg/OT read-only (money control)**

1. Delete the `regularHours` and `overtimeHours` lines from `correctSchema` in
   `src/routes/(app)/attendance/+page.server.ts:174-175`.
2. In `src/routes/(app)/attendance/+page.svelte:774-806` (day table), replace the `regularHours` and
   `overtimeHours` `<input>` elements with the read-only render already used by the non-editable
   branch, keeping the amber unapproved-OT marker at `:800-804` so it now shows on editable rows too.
3. Do the same in the team table at `src/routes/(app)/attendance/+page.svelte:626-646`.
4. Delete `recalcHours` (`+page.svelte:102-121`) and all four `oninput={recalcHours}` handlers at
   `:610`, `:620`, `:760`, `:770`.
5. Remove `CELL_NUM` (`+page.svelte:141`) **only if** grep shows no remaining reference.
6. Add the Reg/OT read-only sentence beside the AM/PM sentence at `+page.svelte:541-545`, gated on
   `data.canManage`.
7. Write `tests/unit/attendance-correct-hours-ignored.test.ts`: POST `?/correct` with
   `regularHours=7.25` and no times; assert success AND that `correctDay`'s data argument carries no
   `regularHours` key.
8. Fix the P1-15 fixture step in `phase-05-destructive-actions_TEST-SCRIPT_11-09-26.md` to make a
   manually-edited day by setting the **times**.
9. Run the gate set; commit.

**Section 2 — displayed value matches stored value**

10. In `?/correct` (`+page.server.ts:196-217`), capture `correctDay`'s return and add it to the
    success payload as `day`.
11. In `+page.svelte`, add a per-row `$state` model cached by day id — copy the lazy-cache shape of
    `rowGuard` at `:34-42`. Hold `timeIn`, `timeOut`, `status`, plus the read-only display figures.
12. Convert the row `timeIn` / `timeOut` / `status` controls from one-way `value={…}` to `bind:value`
    against that model, in both tables.
13. Point the read-only Reg / OT / Night / Late-UT / AM-PM cells at the model.
14. In the row enhance handler, on `result.type === 'success'` copy `result.data.day` into the row's
    model before `update({ reset: false })` runs. Leave `keepValues` (`:14-19`) untouched.
15. Add re-seed-on-genuine-change so a page, employee, or range change refreshes a row.
16. Write `tests/e2e/attendance-display-matches-stored.spec.ts` — seed its own fixture, save a row,
    read the DOM without reload, assert against the database row.
17. Add the sibling-row negative control (an untouched row keeps its values after another row saves).
18. Run the gate set plus the scoped e2e form; commit.

**Section 3 — dirty-row Save, Reset renamed**

19. Add a `dirty` derivation per row: model vs last-saved baseline across `timeIn`, `timeOut`,
    `status`.
20. Gate the row `Save` button on `dirty` in both tables (`+page.svelte:660-666`, `:836-842`), with a
    reserved-width action cell so the column does not reflow.
21. Change `triggerLabel="Reset"` to `triggerLabel="Recalculate"` and `triggerTitle` to
    `"Recalculate this day from the raw punches"` at `+page.svelte:668-676` and `:843-851`.
22. Leave the dialog `title`, `message` and `confirmText` untouched, and leave
    `disabled={!d.manuallyEdited}` at `:672` and `:846` exactly as they are.
23. Add the e2e assertions for 0-Saves-clean / 1-Save-after-edit / Save-clears-after-save.
24. Run the gate set and confirm `destructive-confirms.test.ts` passes **unmodified**; commit.

**Section 4 — Save all**

25. Add action `?/saveAll` to `+page.server.ts`: `MANAGE_HR`, per-row `correctSchema` validation, a
    row cap at `pagination.take`, a catch-per-row loop over `correctDay`, `fail(400)` only when
    `done === 0`, returning `{ action: 'saveAll', saved, results }`.
26. Add the bulk Save button above the table: label carries the count and the words *on this page*,
    disabled at zero dirty rows.
27. Add the result panel, copying the import card's shape at `+page.svelte:502-533`, gated on
    `form.action === 'saveAll'`, `<details>` open when nothing saved, each line naming the date.
28. Write `tests/unit/attendance-bulk-actions.test.ts` covering partial-is-success, all-fail-is-fail,
    the `regularHours` strip, and the row cap.
29. Extend `tests/unit/high-stakes-action-feedback.test.ts:149` with `saveAll`.
30. Add the fact-8 correction to `phase-05-owner-pass_FINDINGS_11-09-26.md` under F11c.
31. Run the gate set; commit.

**Section 5 — Recalculate all (BLOCKED on plan A)**

32. **Check first:** `tests/unit/destructive-confirms.test.ts:219` must already show a `COPY.length`
    above 17. If it still reads 17, plan A has not landed — STOP and report.
33. Add action `?/resetAll` to `+page.server.ts`, same shape as `?/saveAll`, looping
    `resetDayToDerived` and surfacing its 409 texts as per-row reasons.
34. Add the bulk `ConfirmButton`: trigger `Recalculate N days on this page`, title
    `Discard N manual edits?`, message naming count + date range + employee + data loss + page scope.
35. Add the `resetAll` result panel.
36. Extend `attendance-bulk-actions.test.ts` and `high-stakes-action-feedback.test.ts` with
    `resetAll`.
37. Add the site-16 `COPY` entry and bump `COPY.length` in `destructive-confirms.test.ts` — only if
    plan A did not already take it (see *Hand-off to plan A*).
38. Run the gate set; commit.

**After every section:** `pnpm format:check && pnpm lint && pnpm check && pnpm test`. Format runs
FIRST in CI and short-circuits the rest.

---

## Acceptance Criteria

The per-section tables above (A1.1–A5.7) are the binding criteria. Each row states the condition and
the way it FAILS. The batch is complete when every A-row is satisfied, every gate in *Verification
Evidence* is green, every mutation check has been observed to go red, and the L1–L7 live steps have
been run by the owner one at a time.

---

## Phase Completion Rules

- A section is `CODE DONE` when its commit exists and its automated gates are green.
- A section reaches `VERIFIED` only when its Agent-Probe / live rows in *Verification Evidence* have
  also been run and reported. Sections 2, 3, 4 and 5 each carry at least one live step, so **none of
  them can reach VERIFIED from the test suite alone**.
- A green suite is not evidence. Each section's mutation check must be observed going red before its
  gates are trusted.
- Section 5 cannot start — not merely cannot finish — until plan A's F8 section has landed. The
  check is item 32.
- The batch is `VERIFIED` only when all five sections are VERIFIED and the full e2e suite has been
  run once (`CI=1 pnpm test:e2e`), with any failure diagnosed from its actual error rather than
  labelled flaky.
- If a section is blocked, record the blocker and the safest next action in this file and stop.
  Do not widen scope into plan A's files or into F11a.

---

## Touchpoints

| File | Sections | Nature |
|---|---|---|
| `src/routes/(app)/attendance/+page.server.ts` | 1, 4, 5 | `correctSchema`, `?/correct`, new `?/saveAll`, new `?/resetAll` |
| `src/routes/(app)/attendance/+page.svelte` | 1, 2, 3, 4, 5 | Reg/OT cells, `recalcHours`, row `$state` model, row buttons, bulk bar, result panel |
| `src/lib/server/services/attendance/index.ts` | read-only | `correctDay` / `resetDayToDerived` are **not modified**; read for contract only |
| `tests/unit/attendance-correct-hours-ignored.test.ts` | 1 | **new** |
| `tests/unit/attendance-bulk-actions.test.ts` | 4, 5 | **new** |
| `tests/unit/high-stakes-action-feedback.test.ts` | 4, 5 | extend the attendance list |
| `tests/e2e/attendance-display-matches-stored.spec.ts` | 2 | **new** |
| `tests/unit/destructive-confirms.test.ts` | 5 | **plan A owns this file** — hand-off, not a blind edit |
| `.../phase-05-owner-pass_FINDINGS_11-09-26.md` | 4 | record the fact-8 correction |
| `.../phase-05-destructive-actions_TEST-SCRIPT_11-09-26.md` | 1 | P1-15 fixture step: make a manually-edited day by setting **times**, not hours |

## Public Contracts

| Contract | Before | After | Who depends on it |
|---|---|---|---|
| `?/correct` request body | may carry `regularHours` / `overtimeHours` | those two keys are **dropped from `correctSchema`**; `z.object` strips unknown keys, so a stale tab or forged POST carrying them gets a normal success with the values ignored — **not** a 400 | the two row forms; `employee-view-only.spec.ts` (403 path, unaffected) |
| `?/correct` response | `{ action, saved }` — always success-shaped | `{ action, saved, day }` where `day` is the row `correctDay` returned | Section 2's row patch |
| `?/saveAll` response | — | `{ action: 'saveAll', saved, results: [{ id, date, ok, reason? }] }` | Section 4 result panel; `high-stakes-action-feedback.test.ts` |
| `?/resetAll` response | — | `{ action: 'resetAll', saved, results: [{ id, date, ok, reason? }] }` | Section 5 result panel; same test |
| `correctDay(…)` service signature | accepts `regularHours` / `overtimeHours` on its non-time branch | **unchanged** | no route reaches that branch any more — recorded as a residual below |
| `name="timeIn"` / `name="timeOut"` + `HH:MM` post format | contract | **unchanged** | `+page.server.ts:207-210`; the later F11a plan |

**Residual to record, not to fix here.** After Section 1, `correctDay`'s non-time branch (which
honours hand-typed hours and bypasses the `approvedOtHours` cap) becomes **unreachable from any
route**. It is left in place because the service API is not this plan's to narrow and nothing else
calls it. Flag it in the Section 1 commit body so a future reader does not mistake it for a live
bypass. Do **not** delete it in this batch.

## Blast Radius

- **Files changed:** 2 source files, 5 test files (3 new), 2 process docs. One further test file
  (`destructive-confirms.test.ts`) is changed **by plan A**, not by this plan.
- **Packages/surfaces:** one route — `/attendance` — plus its two tables (employee-range and
  team-day). No service, no schema, no migration.
- **Risk class:** **money-adjacent** (Section 1 preserves the approved-OT cap) and **destructive**
  (Section 5 re-derives many days at once). Not auth, not billing, not schema.
- **Tenant/role surface:** every new action reuses `requireAnyCapability(…, 'MANAGE_HR')` and the
  existing `correctDay` / `resetDayToDerived` org scoping. **No new authorization logic is written
  in this plan** — if a section finds itself writing a `where: { organizationId }`, stop: it belongs
  inside the service that already has one.

---

## Ordering

```
  S1  F10a — Reg/OT read-only + schema + copy
   │   (a dirty rule on fields that do not persist would encode the bug)
   ├──────────────┐
   ▼              ▼
  S2  F10b —   S3  F11b — dirty Save + Reset rename
  display      (needs S1: "dirty" must mean only what persists)
  matches      (needs S2: the row $state model is built there)
  stored
   │              │
   └──────┬───────┘
          ▼
         S4  F11c-1 — Save all (dirty rows on this page), per-row results
          │   ("save every dirty row" multiplies F10 if a dirty row saves nothing)
          ▼
         S5  F11c-2 — Recalculate all + ConfirmButton
              ▲
              └── BLOCKED ON plan A's F8 section landing
                  (destructive-confirms.test.ts COPY.length collision)
```

**S3 depends on S2**, not just on S1: the per-row `$state` model that Section 2 introduces to fix
the display **is** the dirty-tracking model. Building two models would be the wrong shape. If the
executor prefers to land S3 before S2, they must move the `$state` model into S3 and reduce S2 to
the patch-from-response step — **state which order was taken in the commit body**.

---

## Section 1 — F10a: make Reg/OT read-only, and stop the route accepting typed hours

**Goal.** The page stops offering an input it cannot honour, and the route stops accepting a value
that would bypass the approved-OT cap.

### Changes

**1.1 — `src/routes/(app)/attendance/+page.server.ts:174-175`.** Remove these two lines from
`correctSchema`:

```
regularHours: z.coerce.number().min(0).optional(),
overtimeHours: z.coerce.number().min(0).optional(),
```

**Decision, and why (required by the brief).** *Drop the keys; do not add a rejection.* `z.object`
strips unknown keys by default, so a stale browser tab or a forged POST still carrying
`regularHours=7.25` gets a **normal success with the field ignored**, exactly as it does today —
while the route becomes structurally incapable of forwarding a hand-typed figure to `correctDay`'s
uncapped branch. Adding `.strict()` or an explicit refusal would turn a stale tab into a 400 the user
cannot act on, and would be a worse outcome for the same guarantee. The guarantee comes from the key
not existing, not from an error message.

**1.2 — `src/routes/(app)/attendance/+page.svelte:774-806`** (day table) **and `:626-646`** (team
table). Replace the `regularHours` and `overtimeHours` `<input>` elements with the read-only render
that the non-editable branch already uses.

- Day table Reg: `{n(d.regularHours).toFixed(2)}` for **both** branches.
- Day table OT: `{n(d.overtimeHours).toFixed(2)}` plus the existing amber unapproved-OT marker at
  `:800-804` — **the marker must now render in the editable case too**, which it never did before.
  That is a deliberate gain: HR editing a day is exactly who needs to see the ungated gap.
- Team table Reg/OT: same, `{d ? n(d.regularHours).toFixed(2) : '—'}`.
- The `{#if editable}` wrapper around those four cells disappears; the cells become unconditional.
- `CELL_NUM` (`:141`) becomes unused if nothing else references it — **check before removing it**.

**1.3 — delete `recalcHours` (`:102-121`) and both `oninput={recalcHours}` handlers** at `:610`,
`:620` (team) and `:760`, `:770` (day).

**Why delete rather than retarget.** `recalcHours` duplicates the derive engine in the client but
does **not** apply the `approvedOtHours` cap. Keeping it as a preview would put a number on screen
that the server will refuse to store — the same "UI promises what the server breaks" defect, moved to
a new place. Its own comment at `:102-104` ends with *"HR can still override the numbers afterward"*,
which is the false promise D4 removes.

**Accepted trade-off, state it in the commit:** typing times no longer previews the resulting hours.
The truthful number arrives after Save, from Section 2's patch. A lying preview is worse than a
one-save delay.

**1.4 — add the copy sentence**, matching the shape of the AM/PM sentence at `:541-545`, rendered
near it and gated the same way (`data.canManage`):

> Reg and OT are worked out from the punches and the approved overtime, and cannot be typed in.
> Correct a day by editing its In and Out.

**1.5 — update the P1-15 fixture step** in
`phase-05-destructive-actions_TEST-SCRIPT_11-09-26.md`: a manually-edited day is produced by setting
the **times** (e.g. `09:00`–`17:00`), not by typing hours. F10 records that the script's current
instruction does not work.

### Acceptance criteria (each can FAIL)

| # | Criterion | How it fails |
|---|---|---|
| A1.1 | `correctSchema` has no `regularHours` / `overtimeHours` key | grep finds either key in `+page.server.ts` |
| A1.2 | A `?/correct` POST carrying `regularHours=7.25` and no times **succeeds** and calls `correctDay` with **no** `regularHours` in its data argument | the mock receives `regularHours` |
| A1.3 | No `<input name="regularHours">` or `<input name="overtimeHours">` exists in `attendance/+page.svelte` | grep finds one |
| A1.4 | `recalcHours` and every `oninput={recalcHours}` are gone | grep finds either |
| A1.5 | The amber unapproved-OT marker renders for an editable row where `rawOvertimeHours > overtimeHours` | e2e/DOM check finds no `(+N)` span on a capped, editable row |
| A1.6 | The page states that Reg/OT cannot be typed in | grep for the sentence fails |
| A1.7 | `attendance-correct-derive.test.ts` still passes unchanged | any of `:75/:89/:98/:111` goes red |

### Gate

```
pnpm format:check && pnpm lint && pnpm check && pnpm test
```

Plus the new file `tests/unit/attendance-correct-hours-ignored.test.ts` (gate **G1.2**, see
Verification Evidence). **`pnpm prisma generate` first** if `pnpm check` is red — a stale client has
produced phantom type errors here three times.

### Commit

`fix(attendance): make Reg/OT read-only so the approved-OT cap cannot be bypassed`

Body must carry: the cap reasoning (`index.ts:609-623` + `rawOvertimeHours`), the deleted-preview
trade-off, and the unreachable-branch residual.

---

## Section 2 — F10b: the displayed value must match what was stored

**Goal.** After any save, every cell on that row shows what the database now holds. **Needed
regardless of D4** — D4 only removes the Reg/OT half of the symptom; status, night differential,
late/undertime and the AM/PM split still move server-side on every correction and are stale in the
DOM today.

### The two candidate approaches, weighed

| Option | Mechanism | Verdict |
|---|---|---|
| **(a) Return the saved row and patch the row from it** | `?/correct` returns `{ …, day }`; the client row `$state` is re-seeded from `day` in the enhance callback | **RECOMMENDED** |
| (b) Version-key the row so it re-mounts from fresh data | `{#each dayRows as d (d.id + d.updatedAt)}`; `invalidateAll` brings new data, the key changes, the row re-mounts | Rejected |

**Why (a).**

1. **(b) depends on load timing and flashes.** `keepValues` calls `update({ reset: false })`, which
   runs `invalidateAll`. The re-mount happens only once the whole page's `load` has re-run — and that
   `load` also calls `autoDeriveFromPunches` (`+page.server.ts:80-92`) and two more queries. The row
   holds the stale DOM until then, then swaps. (a) patches in the same tick the result arrives.
2. **(b) throws away the client model that Section 3 needs.** A re-mount re-seeds from `data.days`
   and discards any per-row `$state`, including the dirty baseline. F11b would then have no stable
   "what was last saved" value to compare against.
3. **(b) scales badly to Section 4.** "Save all" would want one re-mount per row, all keyed off one
   `invalidateAll`. (a) patches each row from its own result, which is exactly the per-row reporting
   D9 asks for.
4. **(a) costs nothing at the server.** `correctDay` already returns the updated row
   (`index.ts:695-707`) and `src/hooks.ts` already transports `Decimal` as a number.

**The F3 trap is respected either way:** neither option lets the form reset. `keepValues`
(`+page.svelte:14-19`) stays exactly as it is, and its comment stays with it.

### Changes

**2.1 — `+page.server.ts:196-217`, `?/correct`.** Capture the service's return and include it:

```
const day = await correctDay(id, …)
…
return { action: 'correct', saved: 'Attendance day saved.', day }
```

The `return` stays **after** the try/catch as it is today, so the failure path is unchanged
(`toFail` still returns a `fail()` before reaching it). Fact 2 called this return "unconditional" —
it is unconditional **on the success path only**; the catch returns first. Confirm that reading
before editing.

**2.2 — `+page.svelte`: introduce a per-row client model.** One `$state` record per row, keyed by
day id, seeded from `data.days` / `data.team`, holding the three fields a row can carry —
`timeIn`, `timeOut`, `status` — plus the read-only figures the row displays.

- Seed lazily and cache by id, exactly as `rowGuard` (`:34-42`) already does. That pattern is
  already in this file; reuse its shape rather than inventing a second one.
- Re-seed a row when `data` brings a genuinely different value for it (an `invalidateAll` from a
  bulk action, a page change, or an employee switch).
- Inputs move from one-way `value={…}` to `bind:value` against the model, so the DOM and the model
  can no longer disagree. **This is the specific fix for the F3 class of bug**: with a bound model,
  the value shown and the value that would be posted are the same object.
- The read-only cells from Section 1 (`Reg`, `OT`, `Night`, `Late/UT`, the four AM/PM columns) read
  from the model too, so the patch in 2.3 updates them.

**2.3 — patch the row on a successful save.** In the row's enhance handler (built on `keepValues`,
which already suppresses the reset), on `result.type === 'success'` copy `result.data.day` into that
row's model, then let `update({ reset: false })` run as it does today.

**2.4 — the same patch covers the team table**, which posts the same `?/correct` from `:657`.

### Acceptance criteria (each can FAIL)

| # | Criterion | How it fails |
|---|---|---|
| A2.1 | `?/correct` returns a `day` object on success | the action return has no `day` key |
| A2.2 | Saving a row with times `09:00`/`17:00` leaves the row showing `Reg 7.00` **without a reload** | the cell still shows the pre-save figure |
| A2.3 | Saving a row whose server-derived **status** differs from the selected one leaves the `<select>` showing the **stored** status | the select still shows what was picked |
| A2.4 | Night and Late/UT cells update on the same save | either cell is stale |
| A2.5 | No row input is a one-way `value={…}` any more | grep finds `value=` on a `name="timeIn"`/`timeOut`/`status` control |
| A2.6 | The form still does not reset — an untouched sibling row keeps its values after another row saves | a sibling row blanks (the F3 symptom) |

### Gate

Full set, plus the new e2e spec `tests/e2e/attendance-display-matches-stored.spec.ts` (gate **G2.2**).

**Run e2e with the working form** — `pnpm test:e2e -- <spec>` silently runs all 143 tests:

```
CI=1 pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/attendance-display-matches-stored.spec.ts
```

**Warning for the executor:** `tests/e2e/global-setup.ts:78-95` wipes `employee@veent.ph`'s timeLogs,
timesheets, leave requests and requests on **every** `playwright test` invocation, scoped or not.
Seed this spec's own fixture; do not lean on demo data. Plant a marker and assert against the
**database row**, not against the value the spec typed.

### Commit

`fix(attendance): show what was stored after a correction, not what was typed`

---

## Section 3 — F11b: Save only on a dirty row, and rename Reset

**Depends on:** Section 1 (what "dirty" may mean) and Section 2 (the row `$state` model).

### 3.1 — Dirty rule

A row is **dirty** when its model differs from its last-saved baseline in `timeIn`, `timeOut`, or
`status`. Under D4 that is the complete list — `Reg`/`OT` are read-only and `note` has no control on
this page.

- Baseline = the values the row was seeded with, refreshed by the Section 2.3 patch after every
  successful save. So a save makes the row clean without a reload.
- **Save** renders only when the row is dirty. Reserve the cell's width so the table does not
  reflow as rows become dirty — an action column that changes width on keystroke is worse than the
  button noise it replaces.
- A third "discard my unsaved edits" affordance is **explicitly not built here.** The findings note
  it as a possibility; the owner did not decide it. Record it as a follow-up, do not add it.

### 3.2 — Rename Reset

**Recommendation: `Recalculate`** for the row trigger, with the full phrase carried by the existing
`triggerTitle`:

```
triggerLabel="Recalculate"
triggerTitle="Recalculate this day from the raw punches"
```

**Why this one.** The brief named three candidates and asked for a recommendation with a reason:

| Candidate | Verdict |
|---|---|
| *Re-derive* | Jargon. "Derive" is this codebase's internal word (`deriveRange`, `autoDeriveFromPunches`); it is not a word an HR user brings with them. |
| *Recalculate from punches* | Plainest, but 24 characters in a row action cell sitting beside **Save** in a table that already scrolls horizontally on food-service tenants (12 columns). It would force the action column wider on every row. |
| **Recalculate** | **Chosen.** Plain, one word, does not read as "undo my typing", and the missing detail — *from punches* — is already carried three times over: the `triggerTitle` tooltip, the dialog title, and the dialog message (*"re-derived from the raw punches"*). The bulk button in Section 5 has room for the full phrase and uses it. |

**The `disabled={!d.manuallyEdited}` rule stays exactly as it is** at `:672` and `:846`. It is the
correct rule: this button acts on committed state and is meaningful precisely when the row is *not*
dirty.

**Verified: the rename does not break the phase 05 gate.** `tests/unit/destructive-confirms.test.ts:211-214`
pins site 15 on the needle `thrown away and re-derived from the raw punches` — that string lives in
the `message` prop at `:670`/`:844`, not in `triggerLabel`. **Leave the dialog `title`, `message` and
`confirmText` untouched in this section.** Changing `confirmText="Reset"` is optional polish and is
**not** planned here, because the moment this section touches that component's copy it starts
competing with plan A's ownership of the gate file.

### Acceptance criteria (each can FAIL)

| # | Criterion | How it fails |
|---|---|---|
| A3.1 | On a freshly loaded page with no edits, **zero** Save buttons render in the day table | any Save is present |
| A3.2 | Typing a new `timeIn` on one row makes exactly **one** Save appear | zero appear, or more than one |
| A3.3 | Changing `status` on a row makes its Save appear | it does not |
| A3.4 | After a successful save the row's Save disappears again without a reload | it stays |
| A3.5 | The trigger reads `Recalculate`, and no `triggerLabel="Reset"` remains in the file | grep finds `Reset` as a trigger label |
| A3.6 | `disabled={!d.manuallyEdited}` is still present on both `ConfirmButton`s | grep finds fewer than two |
| A3.7 | `destructive-confirms.test.ts` still passes **untouched** | the site-15 test goes red — which would mean the dialog copy was edited, and it must not be |
| A3.8 | The action column width does not change when a row becomes dirty | measured widths differ |

### Gate

Full set. A3.8 needs a browser measurement — see *Live browser pass*.

### Commit

`fix(attendance): show Save only on a changed row and rename Reset to Recalculate`

---

## Section 4 — F11c-1: Save all, with per-row results

**Depends on:** Sections 1–3. ("Save all" means "save every dirty row"; if a dirty row saves nothing,
bulk save multiplies F10.)

### 4.1 — New action `?/saveAll`

In `+page.server.ts`, following the shape of the existing actions:

- `requireAnyCapability(event.locals.user!.roles, 'MANAGE_HR')` — same boundary as `?/correct`.
- Accept a list of rows, each carrying `id`, `date`, `timeIn`, `timeOut`, `status`. Validate each
  with the **same `correctSchema`** so bulk cannot accept what single-save refuses — including the
  Section 1 key removal. A bulk door that takes `regularHours` would reopen the cap bypass.
- Loop, `await correctDay(...)` per row, collect `{ id, date, ok, reason? }`. A failing row is
  **caught and counted**, never allowed to abort the batch — this is the `approveMany` shape
  (`requests/timesheets/+page.server.ts:141-155`).
- **Failure policy, per fact 8 and D9:** partial is a **success** carrying counts and per-row
  results; `fail()` only when `done === 0`. That matches the real repo precedent, which the findings
  doc described incorrectly.
- Return `{ action: 'saveAll', saved: 'Saved N days, M skipped.', results }` — the `{action, saved}`
  shape `high-stakes-action-feedback.test.ts:149` pins for this page.

**Bound the batch.** Cap the number of rows accepted in one POST at the page size (`pagination.take`).
A hand-crafted POST must not be able to drive an unbounded loop of transactions. Refuse with
`fail(400, …)` over the cap.

### 4.2 — The button

- Label carries the count **and the page scope**: `Save 3 changed days on this page`. Fact 9: the
  day table is paginated at `:879` and further filtered by `exceptionsOnly`, so "all" is "all
  visible". The label must not promise more than it does.
- `disabled` when zero rows are dirty.
- Placed with the other range-level controls, above the table; not inside a row.
- Not a `ConfirmButton` — saving is not destructive. (Section 5's is.)

### 4.3 — The result panel (D9)

Copy the CSV import card's shape at `+page.svelte:502-533` — it is the precedent the owner named:

- `role="status"`, colour-coded by outcome: all-saved green, partial amber, none-saved red.
- A lead sentence that states the outcome first, then the counts.
- Per-row reasons behind a `<details>`, **open when nothing saved** — same rule the import card uses
  for exactly the same reason: when nothing landed, the reasons are the only useful content.
- Each line names the **date**, not the row id: `Sep 3, 2026 — locked and cannot be edited`.
- Gate the panel on its own key (`form?.results` with `form.action === 'saveAll'`), not on the bare
  `error`/`saved` keys. The import card learned this the hard way — its M-9 comment at `:474-479`
  records that a bare `error` check echoed unrelated actions' failures under the wrong heading.

### 4.4 — Correct the findings doc

Add the fact-8 correction to `phase-05-owner-pass_FINDINGS_11-09-26.md` under F11c: the bulk
timesheet review reports a partial as a **success**, not a failure; cite
`requests/timesheets/+page.server.ts:148-155`.

### Acceptance criteria (each can FAIL)

| # | Criterion | How it fails |
|---|---|---|
| A4.1 | `?/saveAll` with 3 rows where 1 throws returns **success** with `done: 2, skipped: 1` and 3 result entries | it returns `fail()` |
| A4.2 | `?/saveAll` where **every** row throws returns `fail(400, …)` | it returns success |
| A4.3 | `?/saveAll` rejects a body carrying `regularHours` by ignoring it — `correctDay` is never called with that key | the mock receives it |
| A4.4 | `?/saveAll` over the row cap returns `fail(400, …)` | it loops anyway |
| A4.5 | The button is disabled with zero dirty rows and its label carries the count | it is enabled at zero |
| A4.6 | The label states the scope is the current page | it says "all days" |
| A4.7 | A partial result renders amber with a per-row `<details>` naming each failed **date** and reason | it renders a bare count |
| A4.8 | `?/saveAll` returns `{action, saved}` and passes the extended `high-stakes-action-feedback.test.ts` | the test goes red |

### Gate

Full set, plus `tests/unit/attendance-bulk-actions.test.ts` (gate **G4.1**) and the extended
`high-stakes-action-feedback.test.ts` (gate **G4.2**).

### Commit

`feat(attendance): save every changed day on the page and report each row`

---

## Section 5 — F11c-2: Recalculate all, with a confirm naming the blast radius

**BLOCKED until plan A's F8 section lands.** See *Hand-off to plan A*. Do not start this section
until plan A has bumped `COPY.length` and added its own entries; then add this one entry on top.

### 5.1 — New action `?/resetAll`

Same shape as `?/saveAll`:

- `requireAnyCapability(…, 'MANAGE_HR')`.
- Accept the ids of the visible rows where `manuallyEdited` is true. Loop `resetDayToDerived`,
  catching per row.
- `resetDayToDerived` already refuses a locked day (409, `index.ts:727`) and a non-ACTIVE employee
  (409, `index.ts:730-731`). **Those refusals become per-row `reason` strings**, which is precisely
  the per-row reporting D9 asks for. Do not pre-filter them away in the action — let the service
  refuse and report what it said.
- Same partial-is-success policy, same row cap, same `{ action: 'resetAll', saved, results }` shape.

### 5.2 — The `ConfirmButton`

Under phase 05's own rule this is destructive across many days, so the dialog must name the
**count**, the **date range**, the **employee**, and that hand-entered data is lost:

- **Trigger label:** `Recalculate 4 days on this page` — the full phrase fits here, which is why the
  row button may stay at the short `Recalculate` (Section 3.2).
- **Dialog title:** `Discard 4 manual edits?`
- **Dialog message** must contain all four facts, e.g.:
  `4 days for Juan dela Cruz between Sep 1 and Sep 15 are thrown away and re-derived from the raw punches. Anything typed by hand on those days is lost. Only the days shown on this page are affected.`
- `disabled` when zero visible rows are `manuallyEdited`.
- Reuse `ConfirmButton`, which wires `submitFeedback` and toasts the action's own `saved` string for
  free (`ConfirmButton.svelte:50-53`) — the F2 wiring gap does not apply to this component.

**Note the deliberate repetition:** the needle `thrown away and re-derived from the raw punches`
appears in both the row dialog and this one. That is intended — the gate test matches per site, and
the phrase is the one HR has already been taught.

### 5.3 — Result panel

Same panel as 4.3, keyed on `form.action === 'resetAll'`.

### 5.4 — Gate entry (hand-off, not a blind edit)

`tests/unit/destructive-confirms.test.ts` needs one new `COPY` entry and a `COPY.length` bump. **Plan
A owns that file.** Hand the entry over per *Hand-off to plan A* below; do not edit the file from
this plan without plan A's F8 section already merged.

### Acceptance criteria (each can FAIL)

| # | Criterion | How it fails |
|---|---|---|
| A5.1 | `?/resetAll` over 3 rows where 1 is locked returns success, `skipped: 1`, and the locked row's reason is the service's 409 text | the batch aborts, or the reason is generic |
| A5.2 | `?/resetAll` where every row fails returns `fail(400, …)` | it returns success |
| A5.3 | The dialog message names count, date range, employee, and the data loss | any one is missing |
| A5.4 | The trigger is disabled when no visible row is `manuallyEdited` | it is enabled |
| A5.5 | The label states the scope is the current page | it says "all days" |
| A5.6 | `destructive-confirms.test.ts` passes with the bumped `COPY.length` and the new entry | red — and if it is red because plan A had not landed, this section started too early |
| A5.7 | `?/resetAll` returns `{action, saved}` and passes the extended `high-stakes-action-feedback.test.ts` | the test goes red |

### Gate

Full set, plus `attendance-bulk-actions.test.ts`, the extended `high-stakes-action-feedback.test.ts`,
and `destructive-confirms.test.ts`.

### Commit

`feat(attendance): recalculate every manually edited day on the page behind a confirm`

---

## Hand-off to plan A — `destructive-confirms.test.ts`

**Plan A owns `tests/unit/destructive-confirms.test.ts`, including the `COPY` array (`:128`) and the
`COPY.length` assertion at `:219` (currently `17`).** Section 5 adds one site and therefore needs one
more entry and a bump. Two plans editing that file independently will collide.

**The entry plan A should add on plan B's behalf** (final wording must match the shipped dialog —
plan B confirms it at Section 5 execution time):

```
{
    site: '16 attendance recalculate all',
    file: 'routes/(app)/attendance/+page.svelte',
    needle: 'Anything typed by hand on those days is lost'
}
```

**Needle choice.** Deliberately **not** `thrown away and re-derived from the raw punches` — that
string already pins site 15, so a needle reusing it would pass even if the bulk dialog were deleted.
The chosen needle is unique to the bulk dialog and carries the data-loss consequence, which is what
the gate exists to protect.

**Sequencing.**
1. Plan A lands its F8 section, bumping `COPY.length` to whatever its own additions require.
2. Plan B's Section 5 then adds **one** entry and bumps by **one** more.
3. If plan A prefers to take plan B's entry in its own commit, that is fine — plan B's Section 5
   then only verifies the needle matches the shipped copy, and A5.6 becomes a read-only check.

**Plan B must not touch the file before step 1.** If Section 5 is reached and plan A has not landed,
**stop and report** rather than editing around it.

---

## Hand-off to the later F11a plan (the time picker)

Constraints this batch creates or preserves. The F11a plan inherits all of them.

1. **`name="timeIn"` / `name="timeOut"` and the `HH:MM` post format are a contract.**
   `+page.server.ts:207-210` rebuilds PHT timestamps as ``new Date(`${date}T${HH:MM}:00+08:00`)``.
   A picker that posts any other string shape breaks every correction silently.
2. **The `form="c-{id}"` association is a contract.** The inputs live in table cells, outside their
   own `<form>`, and reach it by the `form` attribute (`:607`, `:617`, `:757`, `:767`). A picker that
   renders a hidden or unassociated input drops the field from the POST with no error.
3. **`recalcHours`'s DOM-selector dependency is GONE after Section 1.** The original warning was that
   `document.querySelector('input[name="timeIn"][form="c-xyz"]')` (`:106-112`) breaks **silently** if a
   real named `form=`-associated input is removed. Section 1 deletes `recalcHours`, so that specific
   silent-break risk is retired — but constraint 2 stands on its own and is the one that matters.
4. **After Section 2, the time inputs are `bind:value` against a per-row `$state` model.** A picker
   must write into that model, not only into the DOM. Writing only to the DOM re-creates the exact
   F3 class of bug this batch removes.
5. **Keyboard entry must keep working.** The native control allows typing a time and that is faster
   than any picker.
6. **After Section 3, the row's Save visibility is derived from that model.** A picker that mutates
   the DOM without the model leaves Save hidden on a row the user just changed.

---

## Live browser pass

Flagged because assertions do not see layout, and three of these cannot be proven by the suite.

**Rules for the executor.**
- **The owner starts dev servers.** Never launch `./start.sh`, `vite`, or the `veent-db-5434`
  container. Ask. Driving an already-running app is fine.
- **ONE test step at a time.** Announce the single step, run it, report the result, then **wait**.
  Never chain browser actions, especially writes.
- **`pnpm check` runs `svelte-kit sync` and will stop the owner's dev server.** While the server must
  stay up, use `pnpm exec svelte-check --tsconfig ./tsconfig.json` instead.
- Assert the **control is present and enabled** before measuring it. A failed precondition is
  `BLOCKED`, never a revert trigger.
- A toast is `[role=status][aria-live=polite]`; a page Banner is `role="status"` with **no**
  `aria-live`. Check both and screenshot before recording anything as silent (F6's detector lesson).

**Steps, in order.**

| # | Step | What proves it |
|---|---|---|
| L1 | On an unlocked day, confirm Reg and OT are **text, not inputs**, and the copy sentence is present | S1 / A1.3, A1.6 |
| L2 | Set times `09:00`–`17:00`, Save. Read the Reg cell **without reloading**, then read `attendance_days.regularHours` in psql | S2 / A2.2 — the DOM and the row must agree, and the row must read `7.00` |
| L3 | On a day with an approved-OT shortfall, confirm the amber `(+N)` marker renders on an **editable** row | S1 / A1.5 |
| L4 | Load the page clean: count Save buttons (expect 0). Type one time change: count again (expect 1). Measure the action column width before and after | S3 / A3.1, A3.2, A3.8 |
| L5 | Confirm the row trigger reads **Recalculate** and is disabled on a row that is not `manuallyEdited` | S3 / A3.5, A3.6 |
| L6 | Make 2 rows dirty, press **Save all**, read the result panel and confirm both dates are listed | S4 / A4.7 |
| L7 | Open the **Recalculate all** dialog and read the message aloud: count, date range, employee, data loss | S5 / A5.3 |

**psql reminder:** the container runs Postgres on **5434 inside the container too**, and
`docker exec` without `-i` runs zero SQL and exits 0. Use
`docker exec -i veent-db-5434 psql -p 5434 -U veent -d veent_hris`.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| **G0** `pnpm format:check` | Fully-Automated | CI runs format FIRST and short-circuits everything after it. A red baseline makes every later gate unprovable. Clear it as its own commit before trusting any result. |
| **G0b** `pnpm lint` | Fully-Automated | no lint regression |
| **G0c** `pnpm check` (`pnpm prisma generate` first if red) | Fully-Automated | no type regression |
| **G0d** `pnpm test` | Fully-Automated | whole unit suite, ~1737 tests, ~35s |
| **G1.1** `tests/unit/attendance-correct-derive.test.ts` unchanged | Fully-Automated | A1.7 — the times-derive path is untouched |
| **G1.2** `tests/unit/attendance-correct-hours-ignored.test.ts` (**new**) | Fully-Automated | A1.1, A1.2 — **closes the "nothing asserts the hand-typed path" gap**. Calls `?/correct` with `regularHours=7.25` and no times; asserts `correctDay`'s data argument has **no** `regularHours` key and the action still succeeds. |
| **G1.3** grep: no `name="regularHours"` / `name="overtimeHours"` / `recalcHours` in `attendance/+page.svelte` | Fully-Automated | A1.3, A1.4 |
| **G1.4** grep: the Reg/OT read-only sentence is present | Fully-Automated | A1.6 |
| **G2.1** unit: `?/correct` success payload includes `day` | Fully-Automated | A2.1 |
| **G2.2** `tests/e2e/attendance-display-matches-stored.spec.ts` (**new**) | Hybrid — precondition: the owner's dev server + `veent-db-5434` running; run as `CI=1 pnpm exec dotenv -e .env.dev -- playwright test <spec>` | A2.2, A2.3, A2.4 — **closes the "nothing asserts displayed == stored" gap**. Saves a row, reads the DOM without reload, then asserts against the **database row**. |
| **G2.3** L2 live pass | Agent-Probe (owner-driven, one step at a time) | A2.2 against a real browser and a real row |
| **G2.4** e2e: a sibling row keeps its values after another row saves | Fully-Automated | A2.6 — the F3 negative control |
| **G3.1** e2e: 0 Save buttons on a clean load; exactly 1 after one edit | Fully-Automated | A3.1, A3.2, A3.3, A3.4 |
| **G3.2** grep: no `triggerLabel="Reset"`; two `disabled={!d.manuallyEdited}` remain | Fully-Automated | A3.5, A3.6 |
| **G3.3** `tests/unit/destructive-confirms.test.ts` passes **untouched** after the rename | Fully-Automated | A3.7 — proves the needle pins the message, not the label |
| **G3.4** L4 column-width measurement | Agent-Probe | A3.8 — assertions do not see layout |
| **G4.1** `tests/unit/attendance-bulk-actions.test.ts` (**new**) | Fully-Automated | A4.1–A4.4, A5.1, A5.2 — partial-is-success, all-fail-is-`fail`, the key-strip, the row cap |
| **G4.2** extended `tests/unit/high-stakes-action-feedback.test.ts:149` | Fully-Automated | A4.8, A5.7 — `{action, saved}` shape |
| **G4.3** L6 live pass on the result panel | Agent-Probe | A4.7 — per-row reasons render and read correctly |
| **G5.1** `destructive-confirms.test.ts` with the new site-16 entry | Fully-Automated | A5.6 — **depends on plan A landing first** |
| **G5.2** L7 live pass reading the bulk dialog | Agent-Probe | A5.3 — a human must judge whether the sentence names the blast radius |
| **G6** full e2e suite, `CI=1 pnpm test:e2e` | Hybrid — flaky (#287); read the actual error before re-running | no regression across the 36 specs |

### Mutation checks (a check that cannot fail is not a check)

Before trusting green, break each of these on purpose and confirm the named gate goes **red**:

| Mutation | Gate that must go red |
|---|---|
| Re-add `regularHours` to `correctSchema` and forward it | G1.2 |
| Drop `day` from the `?/correct` return | G2.1, G2.2 |
| Make the dirty rule always return `true` | G3.1 |
| Make `?/saveAll` return `fail()` on a partial | G4.1 |
| Delete the count from the bulk dialog message | G5.1 |

**Prove the zeros are not vacuous.** G3.1 asserts *0 Save buttons*. Before trusting it, inject a
matching node into the live DOM, confirm the selector returns it, then remove it. A zero from a
selector that can never return one is not evidence.

---

## Test Infra Improvement Notes

- **No helper exists for "the DOM matches the database row".** G2.2 is the first spec of this shape
  in the repo and will be hand-written. If a second one appears, extract it.
- **`pnpm test:e2e -- <spec>` silently runs all 143 tests** (backlog note:
  `e2e-spec-filter-silently-ignored_NOTE_10-09-26.md`). Every scoped run in this plan must use the
  `CI=1 pnpm exec dotenv -e .env.dev -- playwright test <spec>` form. Not fixed here.
- **Still no shared "exactly one visible message" e2e helper.** Three plans have hand-written the
  `[role="status"]` + `toHaveCount(1)` + `getByRole('alert')`-count-0 triple. Section 4's result
  panel is a fourth candidate. Not fixed here.
- **`tests/e2e/global-setup.ts:78-95` wipes `employee@veent.ph` demo data on every invocation.**
  Pre-existing and by design. Section 2's spec must seed its own fixture.

---

## Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Removing the Reg/OT inputs is read as removing a capability HR relied on | It never worked — the value was discarded on every save (F10, verified twice against the database). The copy sentence in 1.4 says what to do instead. |
| R2 | The `$state` row model re-seeds over an edit the user is mid-way through typing | Re-seed only on a genuinely different incoming value, and only after a successful save or a data change (page, employee, range). Cover with G2.4's sibling-row control. |
| R3 | `?/saveAll` loops unbounded transactions from a crafted POST | Row cap at `pagination.take`, `fail(400)` over it (A4.4). |
| R4 | "Save all" / "Recalculate all" read as whole-range when they are page-scoped | The count and the words *on this page* are in the label (A4.6, A5.5). |
| R5 | Section 5 starts before plan A and collides on `COPY.length` | Section 5 is marked BLOCKED; A5.6 fails loudly if it is started early. |
| R6 | Deleting `recalcHours` is felt as a regression by whoever asked for it | Deliberate — the preview lacked the approved-OT cap and would show a number the server refuses. Stated in the Section 1 commit body. |
| R7 | Bulk actions add a second write door that could drift from the single-save rules | Both use the **same `correctSchema`** and the **same services**. No new authorization code (see Blast Radius). |

## Rollback

Each section is one commit touching at most two source files and no schema. Revert the section's
commit; nothing downstream depends on it except the next section, which has not landed yet.

- Sections 1–3 have **no data effect** — no migration, no write shape change.
- Sections 4–5 add actions; reverting removes the doors. Days already reset by `?/resetAll` are not
  restored by a revert — `resetDayToDerived` is not undoable. That is pre-existing behaviour of the
  single-row Reset, unchanged by this plan.

---

## No explanatory comments in shipped code

**The execute leg inherits this rule.** The repo standard is that the *why* goes in the **commit
message**, never in the source. A comment restating what the diff did is noise that must be read and
maintained forever.

- Do **not** add comments explaining the cap, the dirty rule, or the display patch. Put them in the
  commit bodies, which this plan specifies per section.
- This is **not** licence to delete comments already there. `keepValues` (`:14-16`), the AM/PM #162
  notes, and the M-9/M-10 import notes all stay. The **only** comment this plan removes is
  `recalcHours`' own block at `:102-104`, and only because the function it describes is deleted.
- Grep the diff for added comment lines before accepting the result.

---

## Validate Contract

Status: CONDITIONAL
Date: 11-09-26
date: 2026-09-11
generated-by: outer-pvl

Parallel strategy: parallel-subagents
Rationale: 5/7 signals (S2 API-contract change, S4 phase program, S5 explicit depth request, S6 high-risk class, S7 9-file blast radius). Layer 1 × 4 dimensions + Layer 2 × 5 sections, read-only, no cross-agent talk needed. 9 agents, cost guard not triggered.

### Source verification performed (every load-bearing claim in the plan was checked against the file)

| Plan claim | Verdict |
|---|---|
| `correctSchema` carries `regularHours`/`overtimeHours` at `+page.server.ts:174-175` | CONFIRMED — exact lines |
| `?/correct` 403 comes from `requireAnyCapability` BEFORE `correctSchema.safeParse` | CONFIRMED — `:201` vs `:202`; `employee-view-only.spec.ts` posts `{id,date,status}` only, no hours. Schema narrowing cannot reach it |
| `correctDay` has exactly ONE route caller | CONFIRMED — `+page.server.ts:212` only. `resetDayToDerived` likewise `:225` only |
| `correctDay` returns the updated row | CONFIRMED — `return await db.$transaction(...)` returning `updated` (`index.ts:683,707`) |
| `src/hooks.ts` transport covers a form-action return, not just `load` | CONFIRMED at runtime source — `@sveltejs/kit@2.69.2` `runtime/server/page/actions.js:71-85` calls `stringify_action_response(data, route_id, options.hooks.transport)`. Prisma `Decimal` will NOT reach the client raw |
| `approvedOtHours` cap from APPROVED `OVERTIME` requests, `rawOvertimeHours` stored ungated | CONFIRMED — `index.ts:606-623` |
| Timesheet bulk: partial = SUCCESS, `fail()` only when `done === 0` | CONFIRMED — `requests/timesheets/+page.server.ts:148-155`. The plan's fact-8 correction of the findings doc is right |
| `COPY.length === 17` at `destructive-confirms.test.ts:219`; site 15 needle at `:211-214` pins the `message` prop, not `triggerLabel` | CONFIRMED — needle `thrown away and re-derived from the raw punches` matches `message=` at `+page.svelte:670` / `:844`; `triggerLabel="Reset"` is a separate prop. The D8 rename is safe |
| Plan A takes `COPY.length` 17 → 18 in its S8 | CONFIRMED — plan A `:28-29`, `:688-689`, `:715`, `:1044`. S5's hard stop (grep `:219` for a value above 17) is real and mechanically checkable |
| `high-stakes-action-feedback.test.ts:149-155` pins `{action, saved}`; `correctDay` already mocked at `:68` | CONFIRMED — extending it with `saveAll`/`resetAll` is mechanically feasible in-place |
| Day table amber marker lives in the NON-editable branch (`:795-805`) | CONFIRMED — making the cells unconditional does bring it to editable rows |
| Pagination + `exceptionsOnly` scope `dayRows` | CONFIRMED — `+page.server.ts:97-107`, `+page.svelte:161-163`, `Pagination` at `:879` |
| All five gate commands exist verbatim | CONFIRMED — `format:check`/`lint`/`check`/`test`/`test:e2e` in `package.json` |

Test gates:

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| A1.1, A1.2 | the route cannot forward a hand-typed hours figure to `correctDay`'s uncapped branch — the money control is closed at the SERVER, not only the UI | Fully-Automated | `tests/unit/attendance-correct-hours-ignored.test.ts` (new) — POST `?/correct` with `regularHours=7.25`, assert `correctDay`'s data argument has no `regularHours` key. MUST include a no-`date` case (see E1) | B |
| A1.3, A1.4, A1.6 | no hours input and no `recalcHours` survive; the read-only copy is present | Fully-Automated | grep gates G1.3, G1.4 over `attendance/+page.svelte` | B |
| A1.7 | the times-derive path is untouched | Fully-Automated | `pnpm test` — `tests/unit/attendance-correct-derive.test.ts:75,89,98,111` pass unchanged | A |
| A2.1 | `?/correct` success payload carries the saved row | Fully-Automated | unit gate G2.1 on the action return | B |
| A2.2, A2.3, A2.4 | what is displayed equals what is stored, with no reload | Hybrid — precondition: owner's dev server + `veent-db-5434` up | `CI=1 pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/attendance-display-matches-stored.spec.ts` (new); assert against the Prisma row, not the typed value | B |
| A2.6 | the F3 reset trap is not reintroduced — a sibling row keeps its values | Fully-Automated | G2.4 sibling-row negative control inside the same spec | B |
| A3.1–A3.4 | Save renders only on a dirty row and clears after a save | Fully-Automated | G3.1 e2e count assertions, with the injected-node zero-proof from the plan's Mutation Checks | B |
| A3.5, A3.6 | the trigger reads `Recalculate`; both `disabled={!d.manuallyEdited}` survive | Fully-Automated | grep gate G3.2 | B |
| A3.7 | the rename did not touch dialog copy | Fully-Automated | `destructive-confirms.test.ts` passes UNMODIFIED | A |
| A3.8 | the action column does not reflow as rows become dirty | Agent-Probe | L4 — measure the action-column rect before and after one edit | C |
| A4.1–A4.4, A5.1, A5.2 | bulk partial = success with counts; all-fail = `fail(400)`; the hours key is stripped on the bulk door too; the row cap holds | Fully-Automated | `tests/unit/attendance-bulk-actions.test.ts` (new) | B |
| A4.8, A5.7 | the new actions keep the `{action, saved}` feedback shape | Fully-Automated | extended `tests/unit/high-stakes-action-feedback.test.ts:149` | B |
| A4.7 | the result panel names WHICH rows failed and why — not a bare count | Agent-Probe | L6 — make 2 rows dirty, Save all, read the panel and confirm both dates are listed with reasons | C |
| A5.3 | the bulk dialog names count + date range + employee + data loss | Agent-Probe | L7 — read the message aloud against the four facts | C |
| A5.6 | the site-16 confirm copy is pinned | Fully-Automated | `destructive-confirms.test.ts` with the new entry — depends on plan A landing first | C |
| — (regression) | no regression across the 36 specs | Hybrid — flaky per #287; diagnose from the actual error, never relabel as flaky | `CI=1 pnpm test:e2e` | A |

Legacy line form:
- attendance route (server): Fully-automated: `pnpm format:check && pnpm lint && pnpm check && pnpm test`
- attendance route (display == stored): hybrid: `CI=1 pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/attendance-display-matches-stored.spec.ts` + precondition owner's dev server and `veent-db-5434` running
- attendance route (layout, panel copy, dialog copy): agent-probe: owner-driven L1–L7, one step at a time
- `?/resetDay` row freshness after a single-row Recalculate: known-gap: documented — see Open gaps

Dimension findings:
- Infra fit: PASS — one route, two source files, no schema, no migration, no container or port surface. All five gate commands exist verbatim in `package.json`. The `pnpm test:e2e -- <spec>` filter trap and the `CI=1 pnpm exec dotenv -e .env.dev -- playwright test <spec>` workaround are both correctly carried. `global-setup.ts:78-95` wiping `employee@veent.ph` is correctly flagged and the plan seeds its own fixture.
- Test coverage: CONCERN — the three new files do close both named gaps and the five mutation checks are genuine (each names a gate that would go red). Three holes remain: G1.2's negative control is under-specified (E1); no gate covers row freshness after `?/resetDay` or after `?/saveAll` (E4); and the plan states "no helper exists for DOM-matches-database" while `tests/e2e/attendance-save-timesheet-custom-range.spec.ts` is an existing same-page Prisma-seeding precedent to copy.
- Breaking changes: PASS — verified at source. Narrowing `correctSchema` cannot break `employee-view-only.spec.ts:197` (403 at `:201` precedes `safeParse` at `:202`). `z.object` strips by default, so a stale tab degrades to a silent ignore, not a 400 — the plan's stated reasoning is correct. `correctDay` and `resetDayToDerived` each have exactly one route caller. The `{action, saved}` contract is preserved and extended, not replaced.
- Security surface: PASS — the money control is closed at the SERVER. After the key removal the route can only forward `status` and `note` on `correctDay`'s uncapped branch; neither is a money field, and `nightDiffHours`/`lateMinutes`/`undertimeMinutes` were never in `correctSchema`. So the `approvedOtHours` cap becomes structurally unbypassable from this route, exactly as claimed — this is not a UI-only fix. No new authorization logic; both new actions reuse `requireAnyCapability(…, 'MANAGE_HR')` and the services' existing org scoping. Returning the saved row exposes nothing the client did not already hold, and `transport` keeps `Decimal` off the wire as a raw object. The `?/saveAll` row cap correctly closes the unbounded-transaction vector (R3).
- Section 1 — Reg/OT read-only: PASS — every edit target exists at the cited line and is uniquely matchable. Highest-risk edit: deleting the `{#if editable}` wrapper around the four hours cells; sequence it cell by cell and run `pnpm check` between the two tables.
- Section 2 — displayed matches stored: CONCERN — the approach choice is right and the F3 trap is genuinely avoided (nothing lets the form reset; `bind:value` makes DOM and model the same object). Two real gaps, both covered by E2 and E3. Highest-risk edit: the re-seed rule — it must refresh a row after a save and after an `invalidateAll`, without clobbering an edit the user is mid-way through typing.
- Section 3 — dirty Save + rename: CONCERN — inherits S2's `manuallyEdited` gap (A3.4 and A3.6 are only correct if the model carries it). The rename itself is verified safe against the phase-05 gate. Highest-risk edit: none in the rename; the dirty derivation is the risk and it belongs to S2's model.
- Section 4 — Save all: CONCERN — the failure policy, the row cap, the shared-schema rule and the result-panel precedent are all correct and verified against source. The multi-row wire format is undecided (E5) and it is the section's only real blocker. Highest-risk edit: the new action's per-row catch loop — a `throw` that escapes it turns a partial into a total failure and re-creates F10 at bulk scale.
- Section 5 — Recalculate all: PASS — blocked by design, and the block is real: `destructive-confirms.test.ts:219` reads `17` today and plan A's S8 takes it to `18`, so the grep is a valid landing signal. The needle reasoning is correct and confirmed: `thrown away and re-derived from the raw punches` already pins site 15 at `:211-214`, so reusing it would pass even with the bulk dialog deleted; `Anything typed by hand on those days is lost` appears nowhere in the file today and is unique to the bulk dialog.

### Execute-agent instructions (carry these; they are the CONDITIONAL terms)

| # | Instruction | Trigger |
|---|---|---|
| E1 | `attendance-correct-hours-ignored.test.ts` must assert on the `data` argument passed to the mocked `correctDay`, and must include at least one case that posts NO `date`. With a `date` present the derive branch overwrites the hours anyway, so a DB-level or outcome-level assertion would stay green even with the schema keys re-added — the mutation check would not go red and the gate would be vacuous. | Section 1, item 7 |
| E2 | The Section 2 row model MUST also carry `rawOvertimeHours` and `manuallyEdited`. `rawOvertimeHours` drives the amber unapproved-OT marker (A1.5) and `manuallyEdited` drives `disabled={!d.manuallyEdited}` on the Recalculate trigger (A3.6) — the server sets `manuallyEdited: true` on every correction, so omitting it leaves the button stale-disabled on a row the user just saved. That is the same defect class Section 2 exists to remove. Add both to the plan's field list at 2.2 and to A2.4. | Section 2, item 11 |
| E3 | Do NOT copy `rowGuard`'s literal shape for the row model. `rowGuards` at `+page.svelte:34-42` is a plain `new Map()` and is NOT reactive — a model built that way will never re-render and Section 2 will appear to do nothing. Copy the lazy-cache *idea*, but hold the per-row record in `$state` (a `$state` record object keyed by id, or `SvelteMap`). Prove it with the sibling-row control before moving on. | Section 2, item 11 |
| E4 | Write down which invalidations re-seed a row, before writing the code. At minimum: after a successful `?/correct` (patched from `result.data.day`), after `?/resetDay` (which does NOT return a row — it must re-seed from the refreshed `data`), after `?/saveAll` and `?/resetAll`, and on page/employee/range change. A row that is mid-edit and has no incoming change must not be clobbered (R2). `?/resetDay` row freshness has no automated gate — cover it at L5 and record the result. | Section 2, item 15 |
| E5 | Decide and state the `?/saveAll` wire format before writing the action. `Object.fromEntries(formData)` collapses duplicate keys, and the row inputs are bound to their own per-row form via `form="c-{id}"` so they cannot be reused by a bulk form. Serialize the dirty rows from the client `$state` model into one field (JSON) or into indexed hidden fields, and validate each row with `correctSchema` as planned. Record the chosen shape in the Section 4 commit body. | Section 4, item 25 |
| E6 | In `?/correct`, `correctDay`'s return must be hoisted (`let day` declared before the `try`) because the success `return` sits after the try/catch. Do not move the `return` inside the `try` — that would change the failure path the plan promises to leave alone. | Section 2, item 10 |
| E7 | `tests/e2e/attendance-save-timesheet-custom-range.spec.ts` already seeds attendance rows through Prisma on this same page. Copy its fixture setup for `attendance-display-matches-stored.spec.ts` rather than hand-writing one. The plan's "no helper exists" note is about the assertion shape, not the fixture. | Section 2, item 16 |
| E8 | Section 1 changes the team table's Reg/OT to read-only text but does not add the amber unapproved-OT marker there (the team table has never had one). Either add it for parity or state in the commit body that the team view intentionally does not show the ungated gap. Do not leave it undecided. | Section 1, item 3 |
| E9 | Standing repo rules, unchanged: run the gate set in CI order `pnpm format:check && pnpm lint && pnpm check && pnpm test` — format runs FIRST in CI and short-circuits. No explanatory comments in shipped code; grep the diff for added comment lines. One commit per section, staging explicit paths, never `git add -A`. The owner starts dev servers. Live steps L1–L7 run ONE at a time: announce, run, report, WAIT. | every section |

Open gaps:
- `?/resetDay` row freshness: known-gap: documented — the single-row Recalculate does not return the re-derived row, so its row model can only be refreshed by the re-seed rule (E4). No automated gate covers it; L5 is the only evidence. Not worth a new action shape in this batch.
- `?/saveAll` / `?/resetAll` post-bulk row freshness: known-gap: documented — `results` carries `{id, date, ok, reason?}` and no row data, so refreshed values rest entirely on the E4 re-seed rule. If E4 is built correctly this is covered; if it is not, the bulk path re-creates F10b.
- Section 4's multi-row wire format is unspecified in the plan (E5). Not a FAIL: the action boundary, failure policy, schema reuse and row cap are all specified — only the encoding is open.
- A3.8 (action-column reflow), A4.7 (per-row panel reads correctly) and A5.3 (the dialog names the blast radius) cannot be proven by any suite. Agent-Probe only, owner-driven.
- The `exceptionsOnly`-scoping question at the end of the plan stays open by design. Surface it at L7, not before.
- F11a (the time picker) is out of scope and was NOT validated. The six inherited contracts recorded in the plan were spot-checked and hold: `name="timeIn"`/`timeOut` at `:606,616,756,766` and the `form="c-{id}"` association at `:607,617,757,767` both exist as stated.

What this coverage does NOT prove:
- `pnpm test` (the unit tier) never renders the page. It cannot prove any cell shows what was stored, that Save hides on a clean row, that the panel lists the right dates, or that the column does not reflow. Every one of those rests on the e2e tier or on the owner's L-pass.
- `attendance-correct-hours-ignored.test.ts` mocks `correctDay`. It proves the ROUTE strips the key; it does not prove the service caps OT — that is `attendance-correct-derive.test.ts:75-98`'s job, and neither test proves the two still agree after a real write. No test in this plan exercises a real `correctDay` against a real database.
- `attendance-display-matches-stored.spec.ts` proves the day-table row on the employee view. It does not cover the team-day table, a locked row, a non-ACTIVE employee, or a row on a page other than page 1.
- The grep gates (G1.3, G1.4, G3.2) prove strings are present or absent in the source file. They cannot prove the markup renders, that the copy is placed where an HR user will see it, or that the marker is visible rather than clipped.
- `destructive-confirms.test.ts` scans source text for a needle. It does not prove the dialog opens, traps focus, or that its confirm actually submits — the repo has no component-interaction harness (`destructive-confirms.test.ts:11-18`; backlog notes `a11y-component-test-harness_NOTE_03-09-26.md`, `component-test-dom-environment_NOTE_03-09-26.md`).
- `CI=1 pnpm test:e2e` proves no regression on the 36 existing specs against seeded demo data. It proves nothing about a real tenant's data volume, about concurrency between two HR users correcting the same day, or about the `?/saveAll` row cap under a crafted POST.
- No gate proves the Section 1 residual (`correctDay`'s uncapped non-time branch) stays unreachable. If a future route calls `correctDay` without times, the bypass returns silently and nothing in this plan would catch it.
- Nothing here proves the plan-A dependency ordering at runtime — only that `COPY.length` reads 17 today. If plan A lands a different count, S5's grep passes for the wrong reason.

Gate: CONDITIONAL (0 FAILs, 4 CONCERNs — all four converted to execute-agent instructions E1–E5 with named gates; the money control, the 403 ordering, the Decimal transport, the needle uniqueness and the plan-A hard stop were each verified at source and are PASS)
Accepted by: user / session — accepted concerns: (1) Section 2's row model omits `rawOvertimeHours` and `manuallyEdited` [E2]; (2) the `rowGuard` pattern named for reuse is non-reactive [E3]; (3) the re-seed rule is under-specified and is the crux of Sections 2, 4 and 5 [E4]; (4) Section 4's multi-row wire format is undecided [E5]. Plus (5) G1.2's negative control needs the no-`date` case to avoid being vacuous [E1].

### Autonomous goal block

BRANCH B — the umbrella plan `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/ui-ux-overhaul-umbrella_PLAN_03-09-26.md` carries `## Stable Program Goal` at line 79 and governs this phase. No `## Autonomous Goal Block` is written to this phase plan. Reference for latest state: that umbrella path.

---

## Resume and Execution Handoff

1. **Selected plan file:**
   `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-05-remediation-B-attendance_PLAN_11-09-26.md`
2. **Last completed phase or step:** PLAN written. No section executed. Branch `feat/uiux-phase-5`
   at `47252f9`.
3. **Validate-contract status:** pending — VALIDATE has not run.
4. **Supporting context loaded:** `process/context/all-context.md`,
   `process/context/tests/all-tests.md`, `phase-05-owner-pass_FINDINGS_11-09-26.md` (F10, F11),
   `src/routes/(app)/attendance/+page.svelte`, `src/routes/(app)/attendance/+page.server.ts`,
   `src/lib/server/services/attendance/index.ts`,
   `src/routes/(app)/requests/timesheets/+page.server.ts`,
   `src/lib/utils/submit-feedback.svelte.ts`, `src/lib/components/ui/ConfirmButton.svelte`,
   `src/hooks.ts`, and the four constraining test files.
5. **Next step for a fresh agent:** run VALIDATE against this plan. Then EXECUTE **Section 1 only**,
   commit it, and stop for the L1–L3 live pass before starting Section 2. Do not start Section 5
   until plan A's F8 section has landed — check
   `tests/unit/destructive-confirms.test.ts:219` for a `COPY.length` above 17 as the signal.

---

## Open question that could not be closed from source

**One.** Should the **Recalculate all** button be scoped by the `exceptionsOnly` filter
(`+page.svelte:156-163`) as well as by pagination?

- `dayRows` is already filtered by that checkbox, so as specified the bulk action follows the filter.
- That is defensible (*what you see is what you act on*) and it is the reading this plan assumes.
- But it means the same button, at the same count label, acts on a different set depending on a
  checkbox several rows above it — and the dialog names a **date range** that would then be wider
  than the set actually touched.
- **Not blocking.** The plan proceeds on *what you see is what you act on*, and the dialog message in
  5.2 says *"Only the days shown on this page are affected."* If the owner wants the filter called
  out explicitly, it is a one-sentence copy change in 5.2. **Surface it at the L7 live step; do not
  ask before then.**

---

**Plan complete. Review carefully. Say "ENTER VALIDATE MODE" when ready to proceed to plan
validation (required before implementation).**
