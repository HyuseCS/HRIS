---
name: plan:datepicker-rollout
description: "Add min/max, onchange, imperative open, and data-r/data-c to DatePicker, then replace all 27 remaining native date inputs across 14 files"
date: 16-09-26
feature: ui-ux-overhaul
---

# DatePicker Rollout — PLAN

**TL;DR** — Phase 1 adds four props to `DatePicker.svelte` (`min`/`max`, `onchange`, an exported
`focusAndOpen()`, and `data-r`/`data-c`). Phase 2 replaces **27** native date inputs (not 26) across
14 files in 11 non-overlapping file batches, then deletes `src/lib/actions/dateRange.ts`.
Complexity: **COMPLEX**.

**Date**: 16-09-26
**Status**: PLANNED — not executed
**Complexity**: COMPLEX
**Feature**: ui-ux-overhaul
**Branch**: `feat/uiux-phase-5`
**Base commit**: `4062844`

## Overview

The app currently shows two different date controls. `DatePicker.svelte` shipped at `b232028` and is
used on the holidays page (2 sites). Every other date field in the app — **27** of them across 14
files — is still a native `<input type="date">`, which renders differently in every browser and does
not match the design tokens.

The owner chose **"build the missing props first, then migrate everything"** over a partial
migration. Reason: the hard sites need the props anyway, and a half-migrated app puts two different
date pickers side by side on the same page.

Four things block a direct swap today. `DatePicker` has no `min`/`max` (needed at 12 sites), no
commit-only `onchange` (needed by 5 auto-submitting GET filters), no way to replace the
`use:advanceTo` action (4 sites), and no `data-r`/`data-c` passthrough (1 site, breaks table keyboard
navigation without it). Phase 1 adds all four. Phase 2 migrates every site in 11 file-disjoint
batches. Phase 3 deletes the dead action and runs the full CI gate set.

Context routing: this plan follows `process/context/all-context.md` for domain context and
`process/context/tests/all-tests.md` for the test-tier routing that produced the Verification
Evidence table below. Post-phase testing runs after every batch — see the per-batch gates and
Step 3.3.

---

## Corrections to the research brief

Four claims in the brief are wrong. Verified in source at commit `4062844`.

| # | Brief said | Source says | Impact |
|---|---|---|---|
| C1 | 26 remaining inputs | **27**. `src/routes/(app)/requests/+page.svelte:250` (`startDate`, has `min={today}` AND `use:advanceTo`) was not listed. The brief listed requests `:266` and `:284` only. | Batch B8 covers 3 sites, not 2. |
| C2 | `min`/`max` used at 8 sites | **12 sites.** leave/new `:85`,`:98`; requests `:252`,`:268`; reports/[type] `:131`(max),`:143`(min); employees/[id] `:1556`,`:1650`; team `:72`(max),`:84`(min); PeriodPicker `:223`+`:224`,`:236`+`:237`. PeriodPicker carries `min` AND `max` on each of its two inputs. | G1 is the widest gap, not the narrowest. |
| C3 | `use:advanceTo` at 5 sites | **4 sites.** leave/new `:87`, reports/[type] `:132`, reports/audit-log `:105`, requests `:254`. `grep -rn advanceTo src/` returns exactly these plus the import lines and the doc comment. | 4 call sites to rewrite, then delete the action file. |
| C4 | `AggregatePanel:110` may double-write via the hidden mirror | **No double-write, and the hidden inputs must stay.** The visible input at `:110` sits OUTSIDE both `<form>` elements (forms open at `:117` and `:127`). It has no `name`. The two hidden `weekOf` inputs at `:119` and `:128` are what actually post. DatePicker's `formdata` effect returns early on `input.form === null`, and would be inert anyway with no `name`. | Straight swap, no form plumbing. Confirmed by the coordinator. |

Two additions from the coordinator, both confirmed independently:

- **G4 — `data-r` / `data-c` is a fourth missing prop.** `TimesheetModal.svelte:379-380`. Precedent to
  mirror exactly: `TimePicker.svelte:25-26` (Props) and `:40-41` (destructure).
- **`TimesheetModal.svelte:247` becomes dead.** Decided below in Step 2.11.

Everything else in the brief is confirmed: no `step=`, no `.valueAsDate`/`.valueAsNumber`, the only
`.showPicker()` is in `dateRange.ts`, no conditional `readonly`/`disabled` on any date input, and
`payroll/+page.svelte` is `PeriodPicker`'s only consumer.

---

## Goals

1. One date control everywhere in the app. Zero `<input type="date">` left in `src/`.
2. No behaviour regression at the 5 auto-submitting GET filter inputs.
3. No behaviour regression in the 15 e2e specs that fill a date field.
4. No change to DatePicker's shipped behaviour: portal/popup, keyboard handling, the numeric mask,
   the validity gate, existing styling.

## Non-goals

- Fixing the 6 `non_reactive_update` eslint warnings on `bind:this` refs. Deliberately deferred.
- Any styling change at any call site. Every `class=` string transfers verbatim.
- Touching `PeriodPicker`'s own `selectClass` const or its three `<select>` elements.

---

## Touchpoints

**Changed — component (Phase 1):**
- `src/lib/components/ui/DatePicker.svelte`

**Changed — call sites (Phase 2), 14 files:**
- `src/lib/components/ui/PeriodPicker.svelte`
- `src/lib/components/timesheets/AggregatePanel.svelte`
- `src/lib/components/timesheets/TimesheetModal.svelte`
- `src/routes/(app)/attendance/+page.svelte`
- `src/routes/(app)/team/+page.svelte`
- `src/routes/(app)/reports/[type]/+page.svelte`
- `src/routes/(app)/reports/audit-log/+page.svelte`
- `src/routes/(app)/requests/+page.svelte`
- `src/routes/(app)/leave/new/+page.svelte`
- `src/routes/(app)/employees/[id]/+page.svelte`
- `src/routes/(app)/employees/new/+page.svelte`
- `src/routes/(app)/profile/+page.svelte`
- `src/routes/(app)/benefits/+page.svelte`
- `src/routes/(app)/separations/+page.svelte`
- `src/routes/(app)/recruitment/applicant/[applicantId]/+page.svelte`

(15 files listed — `PeriodPicker` and `AggregatePanel` are components, the other 13 are routes.)

**Deleted (Phase 3):**
- `src/lib/actions/dateRange.ts`

**Read only:**
- `src/lib/components/ui/TimePicker.svelte` (the Props precedent)
- `src/lib/utils/calendar-day.ts` (`parseDay`, `normalizeDate`, `formatDay`, `daysInMonth`)

---

## Public Contracts

`DatePicker.svelte` `Props` after Phase 1. Additive only — every existing prop keeps its signature,
so the two shipped holidays call sites are untouched.

```ts
interface Props {
  value: string                       // unchanged, $bindable
  name?: string                       // unchanged
  form?: string                       // unchanged
  id?: string                         // unchanged
  required?: boolean                  // unchanged
  disabled?: boolean                  // unchanged
  class?: string                      // unchanged
  placeholder?: string                // unchanged
  'aria-label'?: string               // unchanged
  oninput?: (_v: string) => void      // unchanged — still fires per accepted keystroke
  onkeydown?: (_e: KeyboardEvent) => void  // unchanged
  min?: string                        // NEW — YYYY-MM-DD or undefined
  max?: string                        // NEW — YYYY-MM-DD or undefined
  onchange?: (_v: string) => void     // NEW — commit-only, see Step 1.2
  'data-r'?: string | number          // NEW — mirrors TimePicker.svelte:25
  'data-c'?: string | number          // NEW — mirrors TimePicker.svelte:26
  'aria-invalid'?: boolean | 'true' | 'false' | null   // NEW — OR-ed with internal state
  'aria-describedby'?: string | null                   // NEW — passed through verbatim
}
```

Plus one instance method, reachable via `bind:this`:

```ts
export function focusAndOpen(): void
```

`min` and `max` must tolerate `undefined` — 6 of the 12 bound sites pass `expr || undefined`.

`'aria-invalid'` must tolerate `boolean`, the string `'true'`, and `undefined`. The three shapes in
use at the call sites are `invalid('startDate')` (requests, employees/new, separations) and
`customError ? 'true' : undefined` (PeriodPicker). See Step 1.7 for the OR semantics — the call-site
value never overwrites DatePicker's own invalid state.

---

## Blast Radius

| Dimension | Value |
|---|---|
| Files changed | 16 (1 component + 15 call-site files) |
| Files deleted | 1 (`dateRange.ts`) |
| Call sites replaced | 27 |
| Packages | 1 (single SvelteKit app) |
| Schema / API / auth | none |
| Risk class | **UI regression + form-submission behaviour.** Not a high-risk class per `vc-test-coverage-plan` (no auth, billing, schema, public API, secrets). |
| Highest-risk surfaces | `attendance` (3 auto-submit) and `team` (2 auto-submit) — a GET form that submits on the wrong event reloads the page mid-type. `PeriodPicker` — 5 payroll e2e specs depend on it. |
| Rollback | Per-batch `git revert` of a single commit. Each batch is one file (except B11), so reverts never collide. Phase 1 is additive, so reverting a Phase-2 batch alone leaves a working app. |

---


## Implementation Checklist

Atomic, ordered, each naming its files and its gate. Full detail for each item is in the phase
section of the same number.

**Phase 1 — `src/lib/components/ui/DatePicker.svelte` (one commit, gate = Step 1.9)**

1. Add `min?: string` and `max?: string` to `Props`; derive `minDay`/`maxDay` through
   `normalizeDate`; add the `outOfRange(s)` predicate.
2. Disable out-of-range day cells in the `{#each cells}` grid and guard the `gridKey` Enter/Space
   commit; leave `moveFocus` unrestricted.
3. Replace the literal in the `setCustomValidity` effect (line 144-146) with the derived
   `validityMsg` chain (format error first, then range message). **Do not touch line 581 here —
   Step 1.7 owns that line** and its version carries the external term too.
4. Disable the `‹`/`›` month arrows when the adjacent month is wholly out of range.
5. Disable — do not filter — wholly out-of-range entries in the month and year lists; route
   `clampedStep`, `yearTypeahead`, and `Home`/`End` through the enabled subsets.
6. *(superseded by item 12 — the opening clamp is specified once, in Step 1.6, and covers both the
   `sel === null` case and the non-null-but-out-of-range case. Do not implement a narrower version
   here.)*
7. Add `onchange?: (_v: string) => void`, the `committed` shadow variable, and the `commit()`
   helper. Wire `commit()` at the **five** points named in Step 1.2 — `pick()`, the input's
   `onblur`, the outside-pointerdown branch at line 215, the forward-Tab branch at line 199, and a
   **new `onblur` on `toggleBtn`** guarded by
   `e.relatedTarget !== input && !popup?.contains(e.relatedTarget as Node)` (NEW-FAIL-C). **Never
   inside the shared `close()` const at line 150** (NEW-FAIL-B). Re-seed `committed` **inside** the
   existing `normalizeDate(text) !== v` guard in the effect at lines 116-123, never after it
   (NEW-FAIL-A) — an unconditional re-seed makes the callback unreachable on every path.
8. Add `export function focusAndOpen()` — `input.focus()` then `toggle()` guarded by `if (!open)`.
9. Add `'data-r'`/`'data-c'` to `Props`, destructure as `dataR`/`dataC`, forward to the inner input.
   Mirror `TimePicker.svelte:25-26,40-41`.
10. Add `'aria-invalid'` and `'aria-describedby'` to `Props`; render `aria-invalid` as the OR of the
    call-site value and the internal state; pass `aria-describedby` through verbatim (Step 1.7).
11. Add the `nearestEnabled()` helper; clamp `yearActive`/`monthActive` to the nearest **enabled**
    entry before `focusYear`/`focusMonth`; fix `clampedStep`'s `indexOf === -1` fallback; disable the
    month/year trigger buttons when their enabled subset is empty (Step 1.8, closes FAIL-3 + WARN-4).
12. Widen Step 1.6's opening clamp to cover a **non-null but out-of-range** `sel`, not only
    `sel === null`.
13. Suppress the blur commit when focus moves to the component's own toggle button (Step 1.2,
    WARN-1). **The matching `commit()` wiring is specified once, in item 7 — do not derive it from
    the phrase "dismiss paths".** Scroll, resize and shift-Tab are all dismiss paths and must NOT
    commit (NEW-FAIL-B); only the five points in item 7 do.
14. Run the Step 1.9 gate. Commit `src/lib/components/ui/DatePicker.svelte` alone.

**Phase 2 — 11 file-disjoint batches (each its own commit and gate)**

15. **B1** — `src/lib/components/ui/PeriodPicker.svelte:221,234`. Keep `selectClass` and the three
    `<select>` elements untouched. Gate: the 5 PeriodPicker/payroll specs.
16. **B2** — `src/lib/components/timesheets/AggregatePanel.svelte:110`. Leave both hidden `weekOf`
    inputs at `:119`/`:128` as they are. Keep `clearPreview` on `oninput`. Gate: `timesheet-punch.spec.ts`.
17. **B3** — `src/lib/components/timesheets/TimesheetModal.svelte:377`. Carry `data-r`/`data-c`.
    Delete line 247 and its comment. Gate: the B3 hand-click script.
18. **B4** — `src/routes/(app)/attendance/+page.svelte:256,290,301`. Rewrite all three auto-submits to
    a `bind:this` form ref. Gate: the B4 hand-click script. **Land this batch FIRST and ALONE** — it proves the
    `onchange` timing contract and surfaces WARN-1 (EXEC-4 step 2b).
19. **B5** — `src/routes/(app)/team/+page.svelte:70,82`. Form ref plus `min`/`max`. Gate: the B5
    hand-click script.
20. **B6** — `src/routes/(app)/reports/[type]/+page.svelte:129,141`. `min`/`max` plus the
    `focusAndOpen` rewrite; drop the import at line 3. Gate: the B6 hand-click script.
21. **B7** — `src/routes/(app)/reports/audit-log/+page.svelte:104,114`. `focusAndOpen` rewrite; drop
    the import at line 4. Gate: `audit-log-reveal.spec.ts` plus the B7 hand-click script.
22. **B8** — `src/routes/(app)/requests/+page.svelte:250,266,284`. Three sites, including the one the
    brief missed, plus `aria-invalid`/`aria-describedby` on all three. Drop the import at line 6.
    Gate: **hand-click only — B8 has zero automated coverage** (FAIL-2). See the B8 script.
23. **B9** — `src/routes/(app)/leave/new/+page.svelte:83,96`. Drop the import at line 5. Gate:
    `leave-balances.spec.ts`, `employee.spec.ts`, `back-navigation.spec.ts`.
24. **B10** — `src/routes/(app)/employees/[id]/+page.svelte:1553,1647,1837`. Gate: `employee.spec.ts`,
    `separations.spec.ts`, plus the B10 hand-click script.
25. **B11** — `employees/new:293`, `profile:208`, `benefits:240`, `separations:105`,
    `recruitment/applicant/[applicantId]:231,437`. Gate: `admin.spec.ts`, `recruitment.spec.ts`,
    `separations.spec.ts`, `pii.spec.ts`, `form-errors.spec.ts` (re-homed from B8), plus the
    five-site B11 hand-click script.

**Phase 3 — cleanup (after items 20, 21, 22, and 23 are committed)**

26. Confirm `grep -rn 'advanceTo' src/` returns zero, then `git rm src/lib/actions/dateRange.ts`.
27. Confirm `grep -rn 'type="date"' src/` returns only the 4 comment lines; leave those comments alone.
28. Run the full CI gate set in CI order: `pnpm format:check`, `pnpm lint`, `pnpm check` (dev server
    on 5173 must be down), `pnpm test`, `pnpm test:e2e`. Commit the deletion.

## PHASE 1 — the four props on `DatePicker.svelte`

One file. One commit per step is too fine; commit Phase 1 as **one** commit after Step 1.9's gate
goes green, because the props are interdependent (`onchange` is what makes `focusAndOpen` reachable
at the call sites).

### Step 1.1 — `min` / `max`

**Prop signature:** `min?: string`, `max?: string`. ISO `YYYY-MM-DD`, or `undefined`.

**Normalize once, at the top of the derived chain.** Call sites pass raw bound values
(`min={startValue || undefined}`), which may be `''`:

```
const minDay = $derived(min ? normalizeDate(min) : null)   // null when absent OR unparseable
const maxDay = $derived(max ? normalizeDate(max) : null)
```

`normalizeDate('')` returns `''`, which is falsy — so an empty bound value yields no bound. An
unparseable bound yields `null` and is likewise ignored. **Never throw on a bad bound.** A
half-typed `min` from a paired field must not break the picker it is bounding.

**One range predicate, used by every consumer.** ISO date strings compare correctly with `<`/`>`:

```
function outOfRange(s: string): boolean {
  if (s === '') return false
  return (!!minDay && s < minDay) || (!!maxDay && s > maxDay)
}
```

**Accepted residual — `minDay > maxDay` is reachable and is not engineered around.** `PeriodPicker`'s
end field takes `min={customStart || undefined}` and `max={capBoundEnd}`, and a start date past the
cap inverts the pair. `outOfRange` then returns `true` for every date: the whole grid is disabled,
both quick-jump triggers go `disabled` per Step 1.8, and the range message appears beside
`PeriodPicker`'s own `#pp-custom-error`, which already states the problem better. The state is fully
escapable — the user fixes the start field and the bound inverts back. Detecting and special-casing
an inverted pair would add a fifth message state to the validity chain for a condition the call site
already reports. Recorded, not fixed.

**Where it plugs in — five places:**

1. **Day cells.** In the `{#each cells}` loop, add `{@const iso = formatDay(cell.y, cell.m, cell.d)}`
   and `{@const blocked = outOfRange(iso)}`. Set `disabled={blocked}` on the cell button and add
   `blocked && 'text-muted-foreground/30 line-through'` to the `cn()` class list. `{@const}` must
   stay an immediate child of the `{#each}` block — it already is, alongside `isSel`/`isFocused`.
2. **Keyboard commit.** `gridKey` case `'Enter'`/`' '` calls `pick(focused.y, focused.m, focused.d)`.
   Guard it: if `outOfRange(formatDay(focused...))`, `e.preventDefault()` and return without picking.
   Do **not** block `moveFocus` — arrowing across a blocked day must still work, or a user cannot
   traverse a gap. Only the commit is refused.
3. **Validity gate.** This is the interaction with `4062844`. The existing effect at line 144-146
   sets a single message. Replace the literal with a derived message, priority-ordered — format
   error wins, because a string that does not parse cannot be range-checked:

   ```
   const rangeMsg = $derived.by(() => {
     const n = normalizeDate(text)
     if (n === null || n === '' || !outOfRange(n)) return ''
     if (minDay && n < minDay) return `Choose a date on or after ${minDay}.`
     return `Choose a date on or before ${maxDay}.`
   })
   const validityMsg = $derived(invalid ? 'Enter a date as YYYY-MM-DD.' : rangeMsg)

   $effect(() => { input.setCustomValidity(validityMsg) })
   ```

   A hand-typed out-of-range date is therefore refused at submit, not merely unclickable. `invalid`
   itself is **not** widened — it stays "does not parse", because it also drives the mask's own
   logic. Range is a separate axis.
4. **`aria-invalid`.** Line 581 needs the range term — but **Step 1.7 owns that line and
   supersedes this item.** Its version is
   `aria-invalid={internalInvalid || externalInvalid ? 'true' : undefined}`, where `internalInvalid`
   carries exactly the range term described here. Do not write a version without `externalInvalid`:
   applying this step after 1.7 would silently drop the call-site term and re-open FAIL-1. The
   `touched || length === 10` gate from `4062844` is preserved in 1.7 either way — a range error
   cannot be known before 10 chars, so no early-red behaviour is added.
5. **Prev/next month arrows.** Disable `‹` when every day of the previous month is out of range
   (i.e. `minDay` and the last day of the previous month `< minDay`), and `›` symmetrically against
   `maxDay`. Use `daysInMonth` to build the boundary day.

**Month and year quick-jump lists when a whole month or year is out of range** — the question the
brief asked. Decision: **keep every entry in the list, disable the fully-out-of-range ones, and skip
them during keyboard movement.** Do not filter entries out.

Rationale: the year list's scroll position is computed from `DECADES` index arithmetic
(`yearList.scrollTop = groupIndex * maxHeight`, line 548) and its snap groups are decade-sized.
Removing entries desynchronises that arithmetic and breaks the decade snap. Disabling preserves it.

Concretely:
- A month is blocked when `outOfRange` holds for **both** day 1 and the last day of that month in
  `view.y`. A year is blocked when both `YYYY-01-01` and `YYYY-12-31` are out of range.
- Blocked options get `disabled`, `aria-disabled="true"`, and `opacity-40`. `focusableIn()`
  (line 82) already excludes `button:not([disabled])`, so blocked options drop out of the Tab ring
  for free.
- `clampedStep(values, active, delta)` at line 352 must receive the **enabled** subset. Derive
  `enabledYears` and `enabledMonths` and pass those to `moveYearActive` / `moveMonthActive`. Arrow
  keys then step over blocked entries instead of parking on one.
- **`clampedStep` must also survive an `active` that is not in the subset (WARN-4).** It currently
  does `values.indexOf(active)`, which returns `-1` when `active` is a disabled entry, so
  `Math.max(0, -1 + delta)` lands on `values[0]` for **both** directions. Fix it in the same edit:

  ```
  function clampedStep(values: number[], active: number, delta: number): number {
    if (values.length === 0) return active
    let idx = values.indexOf(active)
    if (idx === -1) idx = values.indexOf(nearestEnabled(values, active) as number)
    return values[Math.min(values.length - 1, Math.max(0, idx + delta))]
  }
  ```

  `nearestEnabled` is **defined here**, at its first use, and reused by Steps 1.6 and 1.8:

  ```
  function nearestEnabled(values: number[], target: number): number | null {
    if (values.length === 0) return null
    return values.reduce(
      (best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best),
      values[0]
    )
  }
  ```
- `yearTypeahead` (line 390) searches `YEARS.find(...)`; change to `enabledYears.find(...)` so
  typing `19` cannot land on a blocked year.
- `Home`/`End` in `yearKey`/`monthKey` use `enabledYears[0]` / last, not `YEARS[0]`.

**Opening view:** see Step 1.6.

---

### Step 1.2 — `onchange`

**Prop signature:** `onchange?: (_v: string) => void`. Receives the normalized ISO value.

**Fires at exactly two moments, never per keystroke:**

1. A calendar pick — end of `pick()`.
2. Blur of the text input, after `onblur` has normalized `text`.

**Never fires** on `onType` / per keystroke, and never on a programmatic `value` change arriving
from the parent (the `$effect` at line 116). Those two exclusions are what keep the filter bars from
submitting mid-type.

**Implementation — one commit helper plus one shadow variable:**

```
let committed = untrack(() => value)

function commit() {
  const n = normalizeDate(text)
  if (n === null) return          // does not parse: validity gate already blocks submit
  if (n === committed) return     // no-op guard
  committed = n
  onchange?.(n)
}
```

`committed` is a plain `let`, not `$state` — it is a change-detection shadow, never rendered. It
mirrors the existing `seen` pattern at line 96.

**The `committed` re-seed goes INSIDE the existing internal/external guard, not after it
(NEW-FAIL-A).** The `$effect` at lines 116-123 is not an external-change detector — it fires on
every change to `value`, and `write()` (line 261) sets `value` on every parseable keystroke, with
`pick()` calling `write()` too. Re-seeding unconditionally makes `committed` always equal the new
value by the time `commit()` runs, so `n === committed` early-returns and **the callback never fires
on any path** — not on blur, not on a pick. That would silently kill Goal 2 and B4, B5, B6, B7, B8,
B9, and it would make B4's step 2b pass for the wrong reason (no navigation on the glyph click, and
none on the pick either — green gate, dead feature).

The effect's existing `if` already distinguishes the two cases: an internal write leaves
`normalizeDate(text) === v`, an external one does not. Re-seed inside it:

```
untrack(() => {
  if (normalizeDate(text) !== v) {
    text = v
    committed = v
  }
})
```

A parent-driven value change still cannot produce a spurious `onchange` — which was the intent — and
an internal keystroke no longer poisons the guard.

**Call `commit()` at exactly five points.** It is idempotent via the `committed` guard, but it must
not be wired into anything that fires without the user leaving the field:

1. As the last statement of `pick()`, **after** `done()` — so the popup is closed before a filter
   form submits and navigates.
2. Inside the existing `onblur` handler at line 584, after the
   `if (normalized !== null) text = normalized` line — **suppressed on the glyph hop, per WARN-1**.
3. Inside the **outside-pointerdown branch of `onDown`** (the `close()` at line 215) — a genuine
   dismissal by clicking elsewhere on the page.
4. Inside the **forward-Tab branch of `onKey`** (the `close()` at line 199) — focus moves to the
   element after the glyph in document order, so the user has genuinely left the control.
5. On a **new `onblur` handler on `toggleBtn`** — see NEW-FAIL-C immediately below.

**NEW-FAIL-C — a keyboard user Tabbing past the glyph loses the filter submit.**

`toggleBtn` (lines 592-603) carries only `onclick={toggle}`. There is no `onblur`. So this sequence
commits nothing: type `2026-03-02` in the `/team` start field, `Tab` to the glyph, `Tab` again. The
input→glyph blur is suppressed by the WARN-1 rule, correctly. But **Tabbing to the glyph does not
open the popup** — only a click or `focusAndOpen()` does — so the `open` effect never registers and
the `:199` forward-Tab branch does not exist. The glyph then blurs with no handler at all. The user
is left looking at their typed date beside unfiltered rows.

That is precisely the state this step condemns in its own argument for firing on clear: *"silently
stale data, the worst outcome of the three."* It is also a regression against the native control,
which fires `change` on Tab-out today. It cannot ride as a residual.

Blast radius is **B4 and B5 only**. At B6-B9 the same gap costs only the end field not auto-opening,
and the data still posts through the `formdata` listener at line 133.

The patch is additive and leaves the existing input-side suppression untouched:

```
onblur={(e) => {
  if (e.relatedTarget !== input && !popup?.contains(e.relatedTarget as Node)) commit()
}}
```

Checked against all six ways `toggleBtn` can blur: it fixes the Tab-out gap; stays silent when the
popup opened and the grid took focus; stays silent on `done()` and on Shift+Tab back to the input;
is a no-op after the `:215` branch has already committed; and as a bonus it closes the "second glyph
click" skip in the exit audit below.

**Do NOT put `commit()` inside the shared `close()` const at line 150 (NEW-FAIL-B).** Five call
sites reach it, and three of them must not commit:

| `close()` reacher | Commit? | Why |
|---|---|---|
| `:215` outside pointerdown | **yes** | real dismissal, focus leaves the control |
| `:199` forward-Tab off the last focusable | **yes** | focus moves past the glyph, out of the control |
| `:193` shift-Tab off the first focusable | **no** | it calls `toggleBtn.focus()` immediately after — committing here is exactly the glyph hop the WARN-1 suppression exists to prevent. Wiring it into `close()` would make the fix contradict itself. |
| `:223` capture-phase `scroll` | **no** | scrolling the page would navigate the GET filter on `/attendance` and `/team`. Same defect class as WARN-1 and **worse**, because scrolling mid-type is far more common than clicking the glyph mid-type. |
| `:227` `resize` (registered as the listener itself) | **no** | resizing the window would navigate the filter |

Wire the two calls at the branch sites, not at the shared helper.

**WARN-1 — DECISION: suppress the blur commit when focus moves to the toggle button.**

The problem: `onblur` fires when focus moves from the text input to the component's own calendar
glyph. On `/attendance` and `/team` that means typing `2026-03-02` and then clicking the glyph
navigates the GET form immediately, which destroys the popup mid-open; the user then picks a day and
the form navigates a **second** time. A native `<input type="date">` never committed on icon-click,
so this is a genuine new behaviour, not a test-script gap.

Suppress it. The glyph is part of the same control — moving focus onto it is not "leaving the
field", so it must not commit:

```
onblur={(e) => {
  touched = true
  const normalized = normalizeDate(text)
  if (normalized !== null) text = normalized
  if (e.relatedTarget === toggleBtn) return
  commit()
}}
```

**Exit audit — do not claim total coverage.** There are eleven ways out of the control. The typed
**data** survives all eleven, because `write()` sets `value` on every parseable keystroke, `oninput`
fires with it, and the `formdata` listener at line 133 carries `value` into the submitted payload.
The **callback** fires at six of them and is skipped at five:

| Exit | `onchange` fires? |
|---|---|
| calendar pick | yes — `pick()` |
| blur to anywhere that is not the glyph | yes — `onblur` |
| outside-pointerdown dismiss | yes — `onDown` `:215` |
| forward-Tab out of the popup | yes — `onKey` `:199` |
| blur to another field after `done()` returned focus | yes — the follow-on blur |
| clicking the glyph mid-type | **no, by design** — WARN-1 suppression, popup opens instead |
| Tab from the input to the glyph, then Tab away | yes — the new `toggleBtn` `onblur` (NEW-FAIL-C) |
| Escape | no — `done()` refocuses the input |
| the Done button | no — `done()` refocuses the input |
| a second glyph click (toggle closes), then focus leaves | yes — the new `toggleBtn` `onblur` |
| Enter-to-submit from the input | no — the form submits directly, with native validation, before any blur |
| scroll / resize dismiss, and unmount | no |

**The remaining skips are benign only on the routes named here — state the route, not a blanket
claim.** Escape and the Done button both run `done()`, which returns focus to the text input, so the
next real blur commits. Enter-to-submit navigates anyway, carrying the current `value`, which is the
outcome the callback would have produced. Scroll and resize dismiss the popup but leave focus where
it was, so the eventual blur commits.

The self-healing argument holds for the **click** route into the glyph, because a click opens the
popup and every popup exit either commits or returns focus to the input. It was **false for the Tab
route**, where no popup ever opens and nothing downstream fires — that was NEW-FAIL-C, and it is
closed by commit point 5, not by self-healing. Do not generalise the click-route argument to
keyboard traversal.

`relatedTarget` is `null` only when focus goes nowhere, which is not the glyph case. No exit route
loses the typed value, and no exit route fires the callback while focus is still inside the control.

**WARN-2 — `commit()` does not range-check, and that is deliberate.** `onchange` fires with an
out-of-range value. The filter bars are safe **only** because `requestSubmit()` runs native
constraint validation, which Step 1.1 now populates via `setCustomValidity`. This is a stated
dependency, not an accident: **every auto-submit call site must use `form.requestSubmit()`, never
`form.submit()`**, because `.submit()` bypasses constraint validation entirely. Range-checking
inside `commit()` was rejected — it would silently swallow the callback and leave the filter bar
showing stale rows with no error, which is exactly the failure mode Step 1.2 argues against for the
empty case.

**Does it fire when the field is cleared to empty? YES.**

Justification against the filter-bar sites. `normalizeDate('')` returns `''`, not `null` — an empty
field is a *valid* value, not a parse failure. On `/team`, clearing the Start Date box and tabbing
away must reload the list with no start filter. If clearing did not fire, the page would sit showing
the previously filtered rows next to an empty control — silently stale data, the worst outcome of
the three. The `committed` no-op guard prevents the degenerate case: blurring an already-empty field
commits `''` against `committed === ''` and returns without calling back.

This also matches `period-picker-default-cutoff.spec.ts:91`, which exercises `start.fill('')`.

**`oninput` is unchanged** and still fires per accepted keystroke. `AggregatePanel`'s
`oninput={clearPreview}` keeps working untouched — clearing a stale preview on every keystroke is
the correct behaviour there and must not be promoted to `onchange`.

---

### Step 1.3 — replacing `use:advanceTo`

**The action cannot stay an action.** `use:` on a component applies to the component, not to the
inner `<input>`; and even if it reached the input, `dateRange.ts:25` calls `target.showPicker?.()`,
which is `undefined` on `type="text"` — the try/catch swallows it and only the `focus()` survives.
The action is already half-dead today.

**Decision: an exported instance method, `focusAndOpen()`, driven from the start field's new
`onchange`.**

```
export function focusAndOpen() {
  input.focus()
  if (!open) toggle()
}
```

`toggle()` already computes popup position from `wrapper.getBoundingClientRect()` and seeds
`view`/`focused`, so nothing else is needed. The `if (!open)` guard stops a second call from closing
an already-open popup — `toggle()` is a toggle.

**Why this and not a prop.** Two alternatives were considered and rejected:

- *Keep a prop like `advanceTo="endDate"`.* DatePicker would have to `querySelector` a sibling by
  `name` and call something on it. The sibling is now a component; the query finds its inner text
  input, which has no `showPicker` and no way to open the Svelte popup. This is precisely the bug
  that made the current action useless. Rejected.
- *A `nextField` prop taking a callback.* Functionally identical to wiring `onchange` at the call
  site, but adds a second prop that means "fire on commit" alongside `onchange`, which already means
  that. Rejected as redundant surface.

`bind:this` + an exported function is the idiomatic Svelte 5 way to express "call a method on
another component instance", and it removes the fragile name-based DOM lookup.

**Call-site shape — identical at all 4 sites:**

```svelte
let endPicker: ReturnType<typeof DatePicker> | undefined = $state()
...
<DatePicker ... onchange={(v) => { if (v) endPicker?.focusAndOpen() }} />
<DatePicker bind:this={endPicker} ... />
```

**WARN-10 — the annotation must be `ReturnType<typeof DatePicker>`, not `DatePicker`.** Under
svelte 5.56.4 a component is typed `Component<Props, Exports, Bindings>`, a callable interface — not
a class — so `DatePicker` in type position does not describe the instance and will not expose
`focusAndOpen`. This applies identically at all four sites (B6, B7, B8, B9).

The `if (v)` guard mirrors `dateRange.ts:16` (`if (!node.value) return`) — clearing the start field
must not yank focus into the end field.

**The 4 call sites this changes** (each in a different batch, so `dateRange.ts` is deleted only in
the final step):

| # | File | Line | Start field | Target |
|---|---|---|---|---|
| 1 | `src/routes/(app)/leave/new/+page.svelte` | 87 | `startDate` | `endDate` |
| 2 | `src/routes/(app)/reports/[type]/+page.svelte` | 132 | `start` | `end` |
| 3 | `src/routes/(app)/reports/audit-log/+page.svelte` | 105 | `start` | `end` |
| 4 | `src/routes/(app)/requests/+page.svelte` | 254 | `startDate` | `endDate` |

Each of those files also drops its `import { advanceTo } from '$lib/actions/dateRange'` line
(`leave/new:5`, `reports/[type]:3`, `reports/audit-log:4`, `requests:6`) — a self-created orphan, so
removal is in scope per the surgical-changes rule.

---

### Step 1.4 — `data-r` / `data-c`

Mirror `TimePicker.svelte` exactly. Do **not** introduce a rest-props spread; the owner wants the
two Props interfaces to stay symmetrical.

- Add to `Props`: `'data-r'?: string | number` and `'data-c'?: string | number`.
- Destructure: `'data-r': dataR,` and `'data-c': dataC,`.
- On the inner `<input>` (around line 574): `data-r={dataR}` and `data-c={dataC}`.

---


---

### Step 1.6 — clamp the opening day (widened per FAIL-3)

`toggle()` (line 280) sets `view`/`focused` from `sel ?? focused`, and `focused` initialises to
`todayParts()`. If the resulting day is out of range, the grid opens on a month where every cell is
disabled.

**The clamp must cover a non-null but out-of-range `sel`, not only `sel === null`.** This is the
`employees/[id]` case: a stored effective date that predates `min={hireInput}` is a perfectly real
`sel`, and it is exactly the value the picker will try to open on.

```
const start = sel ?? focused
const startIso = formatDay(start.y, start.m, start.d)
const clamped = outOfRange(startIso)
  ? (minDay && startIso < minDay ? parseDay(minDay) : parseDay(maxDay as string))
  : start
```

Use `clamped` (falling back to `start` if either bound fails to parse) for both `view` and `focused`.
The selected-day highlight still reflects the real `sel`, so the user can see that the stored value
is outside the allowed window — only the opening viewport moves.

---

### Step 1.7 — `aria-invalid` and `aria-describedby` (closes FAIL-1)

**Why this is required, not optional.** `DatePicker` has no rest-props spread, and line 581's
`aria-invalid` is its **own internal attribute**, not a pass-through. Seven call sites pass
`aria-invalid` and five pass `aria-describedby`. Without these props the build fails, the attributes
vanish, `src/app.css:194` (`input[aria-invalid='true']`) stops painting the red border, and the
field-error association breaks. Transform rule 4's "keep verbatim" is unbuildable until this lands.

Source-verified call sites (two line numbers in the validate contract are off by one; these are the
grep results):

| File | `aria-invalid` | `aria-describedby` |
|---|---|---|
| `src/lib/components/ui/PeriodPicker.svelte` | `:226`, `:239` | `:227`, `:240` |
| `src/routes/(app)/requests/+page.svelte` | `:255`, `:270`, `:287` | `:256`, `:271`, `:288` |
| `src/routes/(app)/employees/new/+page.svelte` | `:292` | — |
| `src/routes/(app)/separations/+page.svelte` | `:104` | — |

**Prop signatures:**

```
'aria-invalid'?: boolean | 'true' | 'false' | null
'aria-describedby'?: string | null
```

Both shapes in use must typecheck: `invalid('startDate')` (requests, employees/new, separations) and
`customError ? 'true' : undefined` (PeriodPicker).

**`aria-invalid` is OR-ed with the internal state, never overwritten.** A server-side field error and
a malformed local entry are different conditions, and either one alone must show red:

```
const externalInvalid = $derived(ariaInvalid === true || ariaInvalid === 'true')
const internalInvalid = $derived(
  (invalid || rangeMsg !== '') && (touched || text.length === 10)
)
```

Rendered on the inner input, replacing line 581:

```
aria-invalid={internalInvalid || externalInvalid ? 'true' : undefined}
```

Emit the **string** `'true'`, not the boolean — `src/app.css:194` selects on `[aria-invalid='true']`.
Emit `undefined` (attribute absent) rather than `'false'`, matching what the native inputs do today.

**What wins when the call site passes `undefined`: the internal state, alone.**

`undefined` means "this call site has no opinion" — it is **not** an assertion that the field is
valid. It contributes `false` to the OR and the internal state decides by itself. That is precisely
`PeriodPicker`'s steady state: with no `customError`, a locally malformed entry must still paint red.

There is deliberately **no way for a call site to force `aria-invalid` off.** Passing `false` or
`'false'` also contributes `false` to the OR; it does not suppress the internal state. Suppression
was rejected — it would let a stale server response hide a date the user has just broken by hand.

**`aria-describedby` passes through verbatim.** `DatePicker` generates no description id of its own,
so there is nothing to merge. `undefined` renders no attribute. The existing internal
`aria-live` region (line 785) is unlabelled and unaffected.

The `touched || text.length === 10` gate from `4062844` is preserved exactly — it constrains only
the internal term. An external error shows immediately, which is correct: it came from the server,
not from half-typed text.

---

### Step 1.8 — keep the month and year lists keyboard-reachable (closes FAIL-3 + WARN-4)

**The bug this prevents.** `focusYear(view.y)` at line 549 and `focusMonth(view.m - 1)` at line 563
call `.focus()`, which is a **no-op on a disabled button**. Focus then stays on the trigger, which
sits *outside* the portaled listbox carrying `onkeydown={yearKey}` / `monthKey`. Arrow keys, Enter,
Home/End and the typeahead all reach nothing, and there is no escape from inside the list. This is
reachable at `employees/[id]` whenever a stored value predates `min={hireInput}`.

**Shared helper:** `nearestEnabled()` is already defined in Step 1.1 at its first use (the
`clampedStep` fix). Do not redefine it here.

**Four edits:**

1. `toggleYearList` (line 366): `yearActive = nearestEnabled(enabledYears, view.y) ?? view.y`.
2. The year `$effect` (line 549): `focusYear(nearestEnabled(enabledYears, view.y) ?? view.y)`.
3. `toggleMonthList` (line 433) and the month `$effect` (line 563): the same clamp against
   `enabledMonths`.
4. **Disable the trigger itself when its enabled subset is empty.** If no year is selectable, the
   year button gets `disabled` and cannot be opened at all — opening an empty listbox is the same
   keyboard-dead state by another route. Same for the month trigger.

`aria-selected` still tracks the real `view.y` / `view.m`, so the clamp moves only the roving
`tabindex`, not the displayed selection.

**Accepted residual (WARN-3).** `moveFocus` in the day grid stays unrestricted by design, so
`focused` can sit on a disabled cell and the focus ring will disagree with the `aria-live` readout.
This is escapable — keydown still bubbles to the grid — so grid navigation is never trapped, unlike
the list case. Recorded, not fixed; blocking arrow traversal would make a gap impassable.

---

### Step 1.9 — Phase 1 gate

| Gate | Command / step |
|---|---|
| Lint | `pnpm lint` — exit 0. The 6 pre-existing `non_reactive_update` warnings may remain; no **new** warning is allowed. |
| Format | `pnpm format:check` |
| Types | `pnpm check` — **only when the owner confirms the dev server on 5173 is stopped** (see Constraints). Zero new errors. |
| Unit | `pnpm test` |
| Regression — shipped sites | Hand-click `/settings/holidays`. Add a holiday with the calendar (marker name `DP-P1-ADD`), confirm it lists. Inline-edit an existing row's date by typing `2026-12-25`, save, confirm the row shows 25 Dec 2026. Neither passes `min`/`max`/`onchange`, so both must behave exactly as at `4062844`. |

Commit: `feat(ui): add min/max, onchange, focusAndOpen and data cell attrs to DatePicker`
Stage exactly: `src/lib/components/ui/DatePicker.svelte`

---

## PHASE 2 — the migration, 11 batches

**Hard rule: no two batches touch the same file.** The list below is therefore partitioned by file.
Batches may run in parallel. Every batch depends on Phase 1 and on nothing else.

**Mechanical transform, identical in every batch:**

1. Add `import DatePicker from '$lib/components/ui/DatePicker.svelte'` to the `<script>` imports.
2. `<input type="date" ... />` becomes `<DatePicker ... />`.
3. Drop `type="date"` (implied) and `inputmode` if present (none are).
4. Keep verbatim: `id`, `name`, `required`, `disabled`, `class`, `bind:value` / `value`, `min`, `max`,
   `aria-invalid`, `aria-describedby`, `form`. **`aria-invalid` and `aria-describedby` only compile
   once Step 1.7 lands** — they are not pass-throughs today.
5. `value={expr}` (no bind) stays `value={expr}` — the prop is `$bindable` with a default, so a
   one-way pass still works.
6. `onchange={(e) => e.currentTarget.form?.requestSubmit()}` **must be rewritten** — the new callback
   receives a string, not an event. There is no `currentTarget`. See B4/B5.
7. `use:advanceTo={'x'}` is removed and replaced per Step 1.3.
8. **No explanatory comments.** Not one added line of comment.

---

### B1 — `PeriodPicker.svelte` (2 sites) — HIGHEST e2e exposure

File: `src/lib/components/ui/PeriodPicker.svelte`

| Line | Field | Props carried |
|---|---|---|
| 221 | `pp-custom-start` | `bind:value={customStart}`, `min={capBoundStart}`, `max={customEnd \|\| undefined}`, `class={selectClass}`, `aria-invalid`, `aria-describedby` |
| 234 | `pp-custom-end` | `bind:value={customEnd}`, `min={customStart \|\| undefined}`, `max={capBoundEnd}`, `class={selectClass}`, `aria-invalid`, `aria-describedby` |

**Does `selectClass` stay? YES — unchanged, and still passed to both DatePickers.**
`PeriodPicker`'s own `selectClass` (line 144) is shared with three `<select>` elements at lines 164,
172, and 182, which are **not** being migrated. Deleting or narrowing it would restyle those three.
Pass it through as `class={selectClass}`; DatePicker merges it via `cn(klass, 'pr-7')`, so the only
visual delta is 1.75rem of right padding for the calendar glyph — which is the intended change.
DatePicker's *internal* `selectClass` const (line 70) is a different, private value for its own popup
month/year triggers, and is untouched.

`capBoundStart` / `capBoundEnd` are `$derived` and may be empty — Step 1.1's normalizer handles that.

**Gate B1:**
```
pnpm test:e2e tests/e2e/period-picker-cross-month.spec.ts tests/e2e/period-picker-default-cutoff.spec.ts tests/e2e/payroll-custom-range-overlap.spec.ts tests/e2e/payroll-custom-range-labels.spec.ts tests/e2e/payroll-run-void.spec.ts
```
All 5 green. `period-picker-default-cutoff.spec.ts:91` exercises `start.fill('')` — the clear path,
which is the single most likely thing to break.

Both inputs also carry `aria-invalid={customError ? 'true' : undefined}` and
`aria-describedby={customError ? 'pp-custom-error' : undefined}` (`:226`/`:227`, `:239`/`:240`).
These require Step 1.7. The specs prove `#pp-custom-error` still computes, but **not** that
`aria-describedby` still points at it — confirm by hand: enter an invalid range, then check the
start input's `aria-describedby` attribute reads `pp-custom-error` in devtools.

Commit: `refactor(ui): use DatePicker for the PeriodPicker custom range`
Stage: `src/lib/components/ui/PeriodPicker.svelte`

---

### B2 — `AggregatePanel.svelte` (1 site)

File: `src/lib/components/timesheets/AggregatePanel.svelte`, line 110.

Props: `id="agg-week"`, `bind:value={weekOf}`, `oninput={clearPreview}`, `class="mt-1 {inputClass}"`.

**Gotcha, resolved:** this input is outside both forms and has no `name`. The hidden `weekOf` mirrors
at lines 119 and 128 are the real payload. **Leave both hidden inputs exactly as they are.** There is
no double-write: DatePicker's `formdata` listener needs both `input.form` (null here) and `name`
(absent here) and bails on the first.

Keep `oninput={clearPreview}` on `oninput` — do **not** move it to `onchange`. The preview must be
invalidated the moment the week text changes, not only on blur. The signature changes from
`(e: Event)` to `(v: string)`; `clearPreview` takes no argument, so `oninput={clearPreview}` still
type-checks.

**Gate B2:** `pnpm test:e2e tests/e2e/timesheet-punch.spec.ts` — `:82` fills `#agg-week`.

Commit: `refactor(timesheets): use DatePicker for the aggregate week field`
Stage: `src/lib/components/timesheets/AggregatePanel.svelte`

---

### B3 — `TimesheetModal.svelte` (1 site) + the `cellKeydown` decision

File: `src/lib/components/timesheets/TimesheetModal.svelte`, line 377.

Props: `bind:value={row.date}`, `data-r={i}`, `data-c={0}`, `onkeydown={(e) => cellKeydown(e, i, 0)}`,
`class={inputClass}`.

**Gotcha — no `<form>` ancestor: verified tolerated.** The `<table>` opens at line 359; the first
`<form>` opens at line 498. `input.form` is therefore `null`, and DatePicker's effect at line 125
returns on `if (!f) return` before registering anything. No change needed to the component.

**Gotcha — `data-r`/`data-c` are load-bearing.** `cellKeydown`'s `focusCell` (line 234) locates the
neighbour with `document.querySelector('[data-r="rr"][data-c="cc"]')`. Without Step 1.4 the date cell
becomes unreachable by keyboard. Step 1.4 is a hard prerequisite for this batch specifically.

**DECISION — `cellKeydown` line 247 is removed.**

Line 247 reads `if (el.type === 'date') return`. It exists because a native date input consumes
Left/Right for its day/month/year segments. Once the cell is a DatePicker, `el.type === 'text'`, so
the guard silently stops matching and the two lines below take over:

```
if (e.key === 'ArrowRight' && atEnd(el)) return focusCell(r, c + 1)
if (e.key === 'ArrowLeft'  && atStart(el)) return focusCell(r, c - 1)
```

Left/Right on the date cell will start jumping between table cells, the same as every other text
cell in the row. **That is the intended outcome** — consistent row navigation — but it is a real
behaviour change and it is stated here rather than discovered during execution.

Because the branch becomes unreachable, **delete line 247 including its trailing
`// keep native segment arrows` comment.** This is the one comment deletion that is in scope: it
would otherwise describe a condition that can never be true. No other comment in the file is touched.

Second-order note, accepted: `focusCell`'s `t.select()` (line 239) currently lands in the `catch`
for date inputs. On a text input it succeeds and selects the whole `YYYY-MM-DD` on arrow-entry into
the cell — identical to how the Notes cell already behaves. Leave the try/catch in place; the other
cell types still route through it.

**Gate B3 — no e2e coverage exists; hand-click script:**

1. Log in as an owner. Go to `/timesheets` and open a timesheet whose state allows editing
   (`canEdit` true — a DRAFT).
2. Click the Date cell of row 1. Type `2026-04-07`. Confirm the text reads `2026-04-07` and no red
   invalid ring appears.
3. Press `ArrowDown`. Focus must land on row 2's Date cell (proves `data-r`/`data-c`).
4. From row 2's Date cell, press `End` **first**, then `ArrowRight` once. Focus must move to the In
   cell (proves the line-247 removal). The `End` press is required, not optional: `focusCell` calls
   `t.select()` on arrival (line 239), so the whole `YYYY-MM-DD` is selected and `atEnd(el)` is
   false — a bare first `ArrowRight` only collapses the selection to the end and moves nothing.
   Then press `End` again and `ArrowRight` again to reach the Out cell.
4b. Press `ArrowLeft` twice from the In cell (with `Home` pressed first each time) to walk back to
   the Date cell. Focus must return there.
5. Click the calendar glyph on row 2's Date cell. Pick **7 April 2026** from the grid. The cell must
   read `2026-04-07`.
6. Click **Save entries**. Reopen the modal. Rows 1 and 2 must both still read `2026-04-07`.
7. Search marker: `2026-04-07` on two rows of that timesheet.

**Accepted residual (WARN-6).** Arrowing out of the Date cell while its calendar popup is open
leaves the popup open and orphaned — nothing closes it on focus loss. Fixing this means adding
focus-loss close logic to the popup, which EXEC-2 forbids in this plan. Recorded as a known gap with
a backlog stub (`datepicker-orphan-popup-on-cell-nav_NOTE_16-09-26.md`); B3's gate stays
**CONDITIONAL** until that stub exists. Do not close the popup by arrowing during the hand-click —
press `Escape` first.

Commit: `refactor(timesheets): use DatePicker for the timesheet row date`
Stage: `src/lib/components/timesheets/TimesheetModal.svelte`

---

### B4 — `attendance/+page.svelte` (3 sites) — HIGHEST regression risk

File: `src/routes/(app)/attendance/+page.svelte`, lines 256, 290, 301.

All three carry `onchange={(e) => e.currentTarget.form?.requestSubmit()}` on a GET form.

**The rewrite.** The new `onchange` receives a string. Add `bind:this` on each enclosing `<form>` and
call `requestSubmit()` on the ref:

```svelte
let dayForm: HTMLFormElement | undefined = $state()
...
<form method="GET" bind:this={dayForm}>
  <DatePicker ... onchange={() => dayForm?.requestSubmit()} />
</form>
```

**Two forms, confirmed — do not re-derive (EXEC-9).** Lines 256, 290 and 301 sit in exactly two
`<form method="GET">` elements, in mutually exclusive branches: `:256` alone inside
`{#if data.view === 'team'}`, and `:290` + `:301` inside the `{:else}`. Declare one ref per form.

**Why this is the riskiest batch.** `onchange` must not fire per keystroke. If it does, the GET form
navigates after `2`, then `20`, then `202`… Step 1.2's commit-only contract is what prevents it, and
this batch is where it is proved.

**Gate B4 — no e2e coverage of these filters; hand-click script:**

1. Go to `/attendance`.
2. Click into the first date filter. Type `2026-03-02` **one character at a time**. The URL must not
   change and the page must not reload until you leave the field.
**Count navigations, do not judge them.** Steps 2b, 2c and 2d each state a required navigation
count. Watch the URL bar or the network panel and count page loads. A step passes only on its exact
number — not "it works", not "it seems fine". Any other number is a stop-and-escalate.

2b. **(EXEC-4 — WARN-1 and NEW-FAIL-A.)** With `2026-03-02` typed and **without tabbing out**, click
   the calendar glyph. **Required: 0 navigations.** Then pick a day in the popup. **Required:
   exactly 1 navigation**, carrying the picked day. Diagnose by count:
   - 1 on the glyph click → the WARN-1 suppression is not wired. Stop.
   - 2 total → suppression missing and the pick also fired. Stop.
   - **0 on the pick** → `commit()` is unreachable; this is NEW-FAIL-A, the unconditional
     `committed` re-seed. Stop. This is the single most important count in the plan — it is the only
     check that can see a dead callback.

2c. **(NEW-FAIL-B.)** Type `2026-03-05`, stay in the field, and **scroll the page**. **Required: 0
   navigations.** Resize the browser window. **Required: 0 navigations** (running total still 0).
   Now click somewhere neutral outside the control. **Required: exactly 1 navigation**, carrying
   `2026-03-05`. Any navigation on the scroll or the resize means `commit()` was wired into the
   shared `close()` at line 150. Stop.

2d. **(NEW-FAIL-C — the keyboard route. `/team` is the better host for this one; run it there too.)**
   Reload to a clean state. Click into the start filter and type `2026-03-09`. Press `Tab` **once**
   — focus lands on the calendar glyph. **Required: 0 navigations** (the popup must not open on Tab
   either). Press `Tab` again — focus leaves the control. **Required: exactly 1 navigation**,
   carrying `2026-03-09`. **0 navigations on the second Tab is NEW-FAIL-C** — `toggleBtn` has no
   `onblur` and a keyboard user has silently lost the filter submit. Stop.
3. Press `Tab`. The page must reload **once** and the URL must carry the new date.
4. Return to the field, select all, press `Delete`, press `Tab`. The page must reload once with the
   date parameter cleared, showing the unfiltered set.
5. Click the calendar glyph on the second date filter, pick any day. The page must reload
   immediately, once, on the click.
6. Repeat step 3 on the third date filter.
7. Marker: the query string must read the date you typed, e.g. `?date=2026-03-02`.

Commit: `refactor(attendance): use DatePicker for the attendance filters`
Stage: `src/routes/(app)/attendance/+page.svelte`

---

### B5 — `team/+page.svelte` (2 sites) — auto-submit + min/max

File: `src/routes/(app)/team/+page.svelte`, lines 70 and 82. Both inside the one GET form at line 64.

- `:70` — `id="start"`, `name="start"`, `bind:value={startValue}`, `max={endValue || undefined}`, auto-submit
- `:82` — `id="end"`, `name="end"`, `bind:value={endValue}`, `min={startValue || undefined}`, auto-submit

Same form-ref rewrite as B4; one shared ref, since both are in the same form.

**Gate B5 — hand-click script:**

1. Go to `/team`.
2. Type `2026-03-02` into Start Date one character at a time. **Required: 0 navigations** until you
   leave the field.
3. Tab out. **Required: exactly 1 navigation**, `?start=2026-03-02` in the URL.
3b. **(NEW-FAIL-C — keyboard route, same as B4 step 2d.)** Reload. Type `2026-03-09` into Start Date
   and press `Tab` **once** (focus lands on the glyph): **required 0 navigations**. Press `Tab`
   again: **required exactly 1 navigation**, carrying `2026-03-09`. 0 on the second Tab is
   NEW-FAIL-C — stop and escalate. B4 and B5 are the only two batches where this gap has
   consequences.
4. Open the End Date calendar. Every day **before** 2 Mar 2026 must be visibly disabled and
   unclickable. Every month before March 2026 in the month list must be disabled.
5. Type `2026-01-01` into End Date by hand and press Enter to submit. The browser must refuse with
   "Choose a date on or after 2026-03-02." (proves the range feeds the validity gate, not just the grid).
6. Clear Start Date, Tab out. One reload, `start` gone from the URL, End Date's calendar fully
   enabled again.
7. Marker: `?start=2026-03-02` then `?start=` absent.

Commit: `refactor(team): use DatePicker for the team date range filter`
Stage: `src/routes/(app)/team/+page.svelte`

---

### B6 — `reports/[type]/+page.svelte` (2 sites) — min/max + advanceTo

File: `src/routes/(app)/reports/[type]/+page.svelte`, lines 129 and 141. Manual submit button.

- `:129` — `max={endValue || undefined}`, `use:advanceTo={'end'}` → becomes
  `onchange={(v) => { if (v) endPicker?.focusAndOpen() }}`
- `:141` — `min={startValue || undefined}`, receives `bind:this={endPicker}`

Remove the `import { advanceTo }` at line 3.

**Gate B6 — no e2e coverage; hand-click script:**

1. Go to `/reports/attendance` (any report type that renders the range).
2. Click the Start field's calendar glyph, pick **2 March 2026**. The popup must close, and the End
   field's calendar must open immediately with focus in it (proves `focusAndOpen`).
3. In that open End calendar, every day before 2 Mar 2026 must be disabled.
4. Pick **31 March 2026**. Click Generate/Submit.
5. Return to Start. Clear it and Tab out. The End calendar must **not** pop open (proves the
   `if (v)` guard).
6. Marker: the generated report header must name 2026-03-02 to 2026-03-31.

Commit: `refactor(reports): use DatePicker for the report date range`
Stage: `src/routes/(app)/reports/[type]/+page.svelte`

---

### B7 — `reports/audit-log/+page.svelte` (2 sites) — advanceTo

File: `src/routes/(app)/reports/audit-log/+page.svelte`, lines 104 and 114. Manual submit. No min/max.

- `:104` — `use:advanceTo={'end'}` → `onchange` + `endPicker?.focusAndOpen()`
- `:114` — receives `bind:this={endPicker}`

Remove the `import { advanceTo }` at line 4.

**Gate B7:**
`pnpm test:e2e tests/e2e/audit-log-reveal.spec.ts` (guards the page still renders and the reveal flow
is intact; it does not fill the dates).

Hand-click:
1. Go to `/reports/audit-log`.
2. Pick a Start date from the calendar. The End calendar must open with focus.
3. Pick an End date, submit, confirm rows are filtered to that window.
4. Marker: the result count changes versus the unfiltered view.

Commit: `refactor(reports): use DatePicker for the audit log date range`
Stage: `src/routes/(app)/reports/audit-log/+page.svelte`

---

### B8 — `requests/+page.svelte` (3 sites) — the one the brief missed

File: `src/routes/(app)/requests/+page.svelte`, lines **250**, 266, 284.

| Line | Field | Props |
|---|---|---|
| 250 | `startDate` | `required`, `min={today}`, `bind:value={startDate}`, `use:advanceTo={'endDate'}`, `aria-invalid`, `aria-describedby` |
| 266 | `endDate` | `required`, `min={startDate \|\| today}`, `value={submitted?.endDate ?? ''}`, `aria-invalid`, `aria-describedby` |
| 284 | `date` | `required`, `value={submitted?.date ?? ''}`, `aria-invalid`, `aria-describedby` — plain, no bounds |

`:250` and `:266` are inside the `{#if selectedType === 'LEAVE' || 'OFFICIAL_BUSINESS'}` branch;
`:284` is in the `{:else if isDayHours(selectedType)}` branch. Only one branch renders at a time, so
`bind:this={endPicker}` is safe — but declare it `$state()` so it re-binds when the branch toggles.

Remove the `import { advanceTo }` at line 6.

All three sites also carry `aria-invalid={invalid(...)}` and `aria-describedby={describedBy(...)}`
(`:255`/`:256`, `:270`/`:271`, `:287`/`:288`). Step 1.7 is a hard prerequisite for this batch.

**Gate B8 — HAND-CLICK ONLY. B8 has zero automated coverage (FAIL-2).**

The two specs previously named here do not load this page. `form-errors.spec.ts` visits `/benefits`,
`/settings/performance` and `/recruitment/jp_seed_demo`; `request-documents.spec.ts` visits the
`/requests/{id}` **detail** route. Neither loads `src/routes/(app)/requests/+page.svelte`.
`form-errors.spec.ts` has been re-homed to B11's gate, where `/benefits` actually lives. No spec in
`tests/e2e/` visits bare `/requests`, so B8's `required`, `min={today}`,
`min={startDate || today}`, both aria attributes, and the `advanceTo`→`focusAndOpen` rewrite rest
entirely on the script below. **B8's gate is CONDITIONAL** and the backlog stub
`datepicker-requests-page-e2e_NOTE_16-09-26.md` must exist before the batch is closed.

Hand-click script (marker: the reason text `DP-B8-REQ`):

1. Log in as a rank-and-file employee. Go to `/requests`. Choose type **Leave**.
2. Open the Start field's calendar. Every day **before today** must be disabled (proves
   `min={today}`). Pick **today+3**.
3. The End field's calendar must open immediately with focus in it (proves `focusAndOpen`), and
   every day before today+3 must be disabled (proves `min={startDate || today}`).
4. Pick **today+5**. Enter the reason `DP-B8-REQ`. Submit.
5. The request must appear in the list with the today+3 → today+5 range. **Reload the page** and
   confirm the row and its dates are still there. Search the page for `DP-B8-REQ`.
6. Start a second Leave request. Leave Start empty and submit. The browser must block submission on
   the Start field (proves `required` survived).
7. Type `2020-01-01` into Start by hand and submit. The browser must refuse with
   "Choose a date on or after {today}." (proves the range feeds the validity gate).
8. Trigger a server-side field error on Start — submit an end date earlier than the start by
   bypassing the picker (type both by hand). The Start field must show the red border and its
   message must be associated: confirm in devtools that the input's `aria-describedby` matches the
   error paragraph's `id` (proves Step 1.7's pass-through).
9. Clear the Start field and tab away. The End calendar must **not** pop open (proves the `if (v)`
   guard).
10. Switch the type to an hours type (e.g. Overtime). The single Date field at `:287` must render as
    a DatePicker with no disabled days and must carry its own `aria-invalid` wiring.

Commit: `refactor(requests): use DatePicker for the request date fields`
Stage: `src/routes/(app)/requests/+page.svelte`

---

### B9 — `leave/new/+page.svelte` (2 sites) — min + advanceTo

File: `src/routes/(app)/leave/new/+page.svelte`, lines 83 and 96.

- `:83` — `required`, `min={today}`, `bind:value={startDate}`, `use:advanceTo={'endDate'}`
- `:96` — `required`, `min={startDate || today}`, receives `bind:this={endPicker}`

Remove the `import { advanceTo }` at line 5.

**Gate B9:**
```
pnpm test:e2e tests/e2e/leave-balances.spec.ts tests/e2e/employee.spec.ts tests/e2e/back-navigation.spec.ts
```
All three fill `getByLabel('Start Date')` / `getByLabel('End Date')` on this page. `<label for>`
association survives because DatePicker forwards `id` to the inner input — this is the batch that
proves it.

Commit: `refactor(leave): use DatePicker for the leave request dates`
Stage: `src/routes/(app)/leave/new/+page.svelte`

---

### B10 — `employees/[id]/+page.svelte` (3 sites)

File: `src/routes/(app)/employees/[id]/+page.svelte`, lines 1553, 1647, 1837.

- `:1553` — `min={hireInput}`
- `:1647` — `min={hireInput}`
- `:1837` — offboard `endDate`, plain

Three separate forms in one file; batch them together because the file cannot be split.

**Gate B10:**
`pnpm test:e2e tests/e2e/employee.spec.ts tests/e2e/separations.spec.ts`

Hand-click (no e2e fills these three):
1. Open any employee at `/employees/{id}`.
2. Find the first date field bounded by hire date. Open its calendar; every day before the hire date
   must be disabled.
2b. **(FAIL-3 probe — the keyboard-dead case.)** Pick an employee whose stored value for this field
   **predates** the hire date, so the picker opens on an out-of-range month. Open the calendar.
   Click the **year** trigger. The list must open with a highlighted, focusable year — the nearest
   *enabled* one, not the stored out-of-range year. Press `ArrowDown` twice, then `Enter`. The view
   must change year. Repeat with the **month** trigger: `ArrowDown`, `Enter`, the view must change
   month. If either list opens with nothing focused and arrow keys do nothing, the Step 1.8 clamp is
   not working — stop and escalate. If no year at all is selectable, the year trigger itself must be
   `disabled` and unopenable.
3. Type a date one day **before** the hire date by hand and submit. The browser must refuse with
   "Choose a date on or after {hireDate}."
4. Type `2026-05-14`, save. Reload the page. The field must still read `2026-05-14`.
5. Repeat 2-4 on the second bounded field.
6. Open the offboard form, set End Date to `2026-05-15` via the calendar, save.
7. Marker: `2026-05-14` on two fields and `2026-05-15` on the offboard record.

Commit: `refactor(employees): use DatePicker for the employee detail dates`
Stage: `src/routes/(app)/employees/[id]/+page.svelte`

---

### B11 — the five plain-POST files (6 sites, no new props used)

Five files, no `min`/`max`, no `onchange`, no `advanceTo`. Pure mechanical swap. Grouped because each
is a single trivial change.

**Per-site props (WARN-11) — these are not all bare swaps.** Two sites carry `aria-invalid`, which
would be silently dropped by a copy-paste transform:

| File | Line | Field | Props that must transfer |
|---|---|---|---|
| `src/routes/(app)/employees/new/+page.svelte` | 293 | hire / start date | `id`, `name`, `required`, `class`, `value`, **`aria-invalid={invalid('startDate')}` (`:292`)** |
| `src/routes/(app)/profile/+page.svelte` | 208 | date of birth | `id="dateOfBirth"`, `name`, `value`, **`class="input w-full"`** — see below |
| `src/routes/(app)/benefits/+page.svelte` | 240 | benefit date | `id`, `name`, `class`, `value` |
| `src/routes/(app)/separations/+page.svelte` | 105 | separation date | `id`, `name`, `required`, `class`, `value`, **`aria-invalid={invalid('effectiveDate')}` (`:104`)** |
| `src/routes/(app)/recruitment/applicant/[applicantId]/+page.svelte` | 231, 437 | interview / offer dates | `id`, `name`, `class`, `value` |

Neither `employees/new` nor `separations` passes `aria-describedby`. Both depend on Step 1.7.

**WARN-7 — `/profile:208` must become `class="input w-full"`, not `class="input"`.** This is not a
styling change. `DatePicker`'s wrapper selector is `[&:has(>input.w-full)]:flex`, which matches the
literal `w-full` **token** in the class attribute. `.input` gets its width from
`@apply … w-full …` at `src/app.css:187`, which the `:has()` selector cannot see. Without the
explicit token the wrapper stays `inline-flex` and the DOB field visibly collapses. Add `w-full`
alongside `input`; do not replace `.input`.

**Gate B11 — automated:**
```
pnpm test:e2e tests/e2e/admin.spec.ts tests/e2e/recruitment.spec.ts tests/e2e/separations.spec.ts tests/e2e/pii.spec.ts tests/e2e/form-errors.spec.ts tests/e2e/employee.spec.ts
```
`form-errors.spec.ts:18` is re-homed here from B8 — it visits `/benefits`, which is a B11 site.
`employee.spec.ts:34` loads `/profile`, guarding the WARN-7 fix renders.
`admin.spec.ts` fills `getByLabel('Start Date')` at `:47`, `:125`, `:154`, `:224`, all on
`/employees/new` — so that site is covered. The other five are hand-click only.

**Gate B11 — hand-click, the five uncovered sites:**

1. **`/profile`** — before touching the control, confirm the DOB field spans the full width of its
   column exactly as the fields above it do (proves the WARN-7 `w-full` fix; if it has collapsed to
   a narrow inline box, stop). Then set Date of Birth via the calendar to `1995-08-21`. Save.
   Reload. Field must read `1995-08-21`. Confirm the **year list scrolls back to the 1990s** — this
   is the one site where the year quick-jump is genuinely used, and its decade snap must still work.
   Marker: `1995-08-21`.
2. **`/benefits`** — add a benefit with date `2026-07-04`, marker name `DP-B11-BEN`. Save. Confirm the
   row lists with 4 Jul 2026.
3. **`/separations`** — start a separation with date `2026-07-05`, marker reason text `DP-B11-SEP`.
   Save. Confirm the record lists with 5 Jul 2026.
4. **`/recruitment/applicant/{id}`, field at `:231`** — set it to `2026-07-06` by typing. Save.
   Reload. Must read `2026-07-06`.
5. **`/recruitment/applicant/{id}`, field at `:437`** — set it to `2026-07-07` via the calendar. Save.
   Reload. Must read `2026-07-07`.

Commit: `refactor(ui): use DatePicker for the remaining plain date fields`
Stage the five paths explicitly.

---

## PHASE 3 — cleanup and full gate

### Step 3.1 — delete the dead action

Runs only after B6, B7, B8, and B9 are all committed.

1. `grep -rn 'advanceTo' src/` must return **zero** results.
2. `git rm src/lib/actions/dateRange.ts`
3. Confirm no test imports it: `grep -rn 'dateRange' src/ tests/`

### Step 3.2 — zero native date inputs

```
grep -rn 'type="date"' src/
```
Must return only the 3 comment lines in `src/lib/utils/pay-periods.ts` (`:7`, `:226`, `:248`) and
`src/lib/components/ui/PeriodPicker.svelte:74`. **Leave all four comments alone** — they document the
YYYY-MM-DD wire convention, which is unchanged and still correct. Zero `<input type="date">` elements.

### Step 3.3 — full CI gate set, in CI order

CI runs `format` first and skips the rest on failure, so run in this order:

```
pnpm format:check
pnpm lint
pnpm check          # dev server on 5173 must be DOWN
pnpm test
pnpm test:e2e       # full suite
```

Commit: `refactor(ui): remove the dead advanceTo date-range action`
Stage: `src/lib/actions/dateRange.ts` (deletion) + any import line not already removed in its batch.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `pnpm lint` exit 0, no new warnings | Fully-Automated | No new lint debt; the 6 deferred `non_reactive_update` warnings are unchanged |
| `pnpm format:check` exit 0 | Fully-Automated | Formatting clean, CI's first gate passes |
| `pnpm check` zero new errors | Fully-Automated | `min`/`max`/`onchange`/`data-*` prop types accept every call site's expression, including `undefined` |
| `pnpm test` (vitest) | Fully-Automated | No unit regression in `calendar-day` or `pay-periods` consumers |
| `period-picker-cross-month.spec.ts` + `period-picker-default-cutoff.spec.ts` | Fully-Automated | Goal 3 — `.fill()` and `.fill('')` survive on a text input at the highest-traffic date site |
| `payroll-custom-range-overlap` + `-labels` + `payroll-run-void` | Fully-Automated | Goal 3 — the payroll range flow through `PeriodPicker` is unbroken |
| `timesheet-punch.spec.ts:82` (`#agg-week`) | Fully-Automated | Goal 3 — `id`-targeted `.fill()` still reaches the inner input |
| `leave-balances` + `employee` + `back-navigation` | Fully-Automated | Goal 3 — `getByLabel('Start Date')` still resolves via `<label for>` → forwarded `id` |
| `admin.spec.ts:47,125,154,224` | Fully-Automated | Goal 3 — `/employees/new` hire date fills correctly |
| `recruitment` + `separations` + `pii` + `audit-log-reveal` | Fully-Automated | Pages still render and submit after the swap |
| `form-errors.spec.ts:18` (B11, re-homed from B8) | Fully-Automated | `/benefits` still renders and posts. It does **not** visit `/requests` — see FAIL-2. |
| `employee-view-only.spec.ts:162,184` + `attendance-save-timesheet-custom-range.spec.ts:95,117` (B4) | Fully-Automated | `/attendance` both views still render and hydrate after the filter swap |
| `back-navigation.spec.ts:11,29,44` (B5) | Fully-Automated | `/team` still renders and the range filter round-trips |
| `admin.spec.ts:92` (B6) | Fully-Automated | `/reports/[type]` renders with `?start=…&end=…` in the URL |
| `pii.spec.ts:100` (B7) | Fully-Automated | `/reports/audit-log` renders under the PII path |
| `employee.spec.ts:34` (B11) | Fully-Automated | `/profile` still renders — guards the WARN-7 `w-full` fix |
| `pnpm check` with `aria-invalid`/`aria-describedby` on `Props` | Fully-Automated | FAIL-1 — the 7 `aria-invalid` and 5 `aria-describedby` call sites compile |
| `grep -rn 'type="date"' src/` → only 4 comment lines | Fully-Automated | Goal 1 — zero native date inputs remain |
| `grep -rn 'advanceTo' src/` → 0 results | Fully-Automated | The action is fully retired, not orphaned |
| B4 attendance hand-click, steps 2-6 | Agent-Probe | Goal 2 — typing does not submit mid-entry; blur and calendar-pick each submit exactly once; clearing submits with the filter removed |
| B5 team hand-click, steps 4-6 | Agent-Probe | G1 — out-of-range days are unclickable **and** a hand-typed out-of-range date is refused by the validity gate |
| B4 hand-click step 2b (EXEC-4) | Agent-Probe | WARN-1 — clicking the calendar glyph mid-type does not navigate, and the subsequent pick navigates exactly once. **The "pick navigates exactly once" half is also the NEW-FAIL-A guard** — if the callback is unreachable, the pick navigates zero times and the step fails. |
| B4 hand-click step 2c | Agent-Probe | NEW-FAIL-B — scrolling and resizing mid-type must navigate exactly 0 times |
| B4 step 2d + B5 step 3b | Agent-Probe | NEW-FAIL-C — Tabbing from the input past the glyph navigates exactly once; a keyboard user does not lose the filter submit |
| B10 hand-click step 2b | Agent-Probe | FAIL-3 — the month and year quick-jump lists stay keyboard-reachable when the opening entry is disabled |
| B1 hand-click `aria-describedby` check | Agent-Probe | FAIL-1 / Step 1.7 — `aria-describedby` still resolves to `#pp-custom-error` after the swap |
| B8 hand-click steps 1-10 (CONDITIONAL — the ONLY proof for B8) | Agent-Probe | FAIL-2 — `/requests` `required` + `min` + both aria attributes + the `focusAndOpen` rewrite. No spec visits bare `/requests`. |
| B3 TimesheetModal hand-click, steps 3-4 | Agent-Probe | G4 — `data-r`/`data-c` restore Up/Down cell navigation; the line-247 removal gives Left/Right cell jumping |
| B6 reports hand-click, steps 2 and 5 | Agent-Probe | G3 — `focusAndOpen()` replaces the action, and clearing the start field does not yank focus |
| B11 `/profile` hand-click, step 1 | Agent-Probe | The year quick-jump decade snap still works with `min`/`max` absent |
| Phase 1 holidays regression click | Agent-Probe | Goal 4 — the two shipped sites behave exactly as at `4062844` |
| Cross-browser rendering of the popup | Known-Gap | Not proven. Backlog stub below. Gate stays CONDITIONAL. |
| Screen-reader announcement of a disabled day cell | Known-Gap | Not proven. Backlog stub below. Gate stays CONDITIONAL. |

### Known-gap backlog stubs (required — a Known-Gap is a recorded residual, never a PASS)

| Gap | Why untestable in this plan | Resolution |
|---|---|---|
| Cross-browser popup rendering (Safari/Firefox) | Playwright config runs one browser project; adding projects is out of this plan's blast radius | Backlog: `datepicker-cross-browser_NOTE_16-09-26.md` in `process/features/ui-ux-overhaul/backlog/` |
| Screen-reader announcement of disabled day cells and disabled month/year options | No AT harness in the repo; requires a live NVDA/VoiceOver pass | Backlog: `datepicker-a11y-disabled-cells_NOTE_16-09-26.md` in `process/features/ui-ux-overhaul/backlog/` |
| 9 sites have no e2e date coverage at all | Writing 9 new specs is a larger scope than this migration | Backlog: `datepicker-uncovered-sites-e2e_NOTE_16-09-26.md`. Covered here by the hand-click scripts in B3, B5, B6, B10, B11. |
| **B8 / `/requests` has zero automated coverage** (FAIL-2) | No spec in `tests/e2e/` visits bare `/requests`; writing one needs a rank-and-file fixture and a leave-type seed | Backlog: `datepicker-requests-page-e2e_NOTE_16-09-26.md`. B8's gate stays **CONDITIONAL**. Covered here by the 10-step B8 hand-click script. |
| Orphaned popup when arrowing out of the TimesheetModal date cell (WARN-6) | The fix is focus-loss close logic inside the popup, which EXEC-2 forbids in this plan | Backlog: `datepicker-orphan-popup-on-cell-nav_NOTE_16-09-26.md`. B3's gate stays **CONDITIONAL**. |
| `pnpm test:e2e` runs `vite build`, which also syncs `.svelte-kit` (WARN-9) | The port claim is proven (4173, `--strictPort`); the sync side-effect on a live 5173 dev server is not | Ask the owner before the first `pnpm test:e2e` run, same as `pnpm check`. See Constraint 4. |

---

## Test Infra Improvement Notes

- Nine date sites have zero e2e coverage (benefits, separations, recruitment ×2, employees/[id] ×3,
  profile DOB, TimesheetModal row date). Every one is proved by hand-click in this plan. A spec per
  site would convert five Agent-Probe rows above into Fully-Automated rows. Tracked in the backlog
  stub `datepicker-uncovered-sites-e2e_NOTE_16-09-26.md`.
- There is no component-level test harness for `src/lib/components/ui/`. A vitest + `@testing-library/svelte`
  suite over `DatePicker.svelte` would let the `min`/`max` and `onchange`-timing contracts be asserted
  directly instead of through page-level e2e. Not created by this plan.
- `DatePicker` renders hardcoded ids `dp-month` and `dp-year` on its popup's sr-only labels. With 3
  DatePickers on one page (attendance, employees/[id]) these would duplicate if two popups were ever
  open at once. In practice `pointerdown` outside closes the first, so only one popup exists at a
  time. Observed, not fixed — out of scope, and no gate depends on it.

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `onchange` fires per keystroke, reloading a GET filter mid-type | Medium | Step 1.2's commit-only contract; proved by B4 hand-click step 2 before any other filter batch is trusted |
| `getByLabel('Start Date')` breaks in 9 e2e specs | Low | DatePicker forwards `id` to the inner input, so `<label for>` association holds. B9 and B11 gates prove it. |
| `.fill('')` clear path regresses at PeriodPicker | Medium | `period-picker-default-cutoff.spec.ts:91` is an existing spec that covers exactly this; B1 gate |
| A `min` bound that is itself half-typed throws | Medium | Step 1.1 normalizes bounds through `normalizeDate` and treats `null` as "no bound". Never throws. |
| Year-list decade snap breaks when years are disabled | Medium | Step 1.1 disables rather than filters, preserving the `DECADES` index arithmetic at line 547-548. B11 `/profile` probe checks it. |
| B8 `/requests` regresses undetected — 3 sites with `required` + `min` + both aria attributes + the `focusAndOpen` rewrite and **no automated gate** | Medium | Hand-click only (FAIL-2). The 10-step B8 script covers every one of those props explicitly, including a devtools check of `aria-describedby`. Backlog stub required; gate stays CONDITIONAL. |
| The month or year quick-jump list opens keyboard-dead on a disabled entry | Medium — reachable at `employees/[id]` | Step 1.8 clamps the opening active entry to the nearest enabled one and disables the trigger when the subset is empty. B10 hand-click step 2b proves it. |
| `aria-invalid` from a call site overwrites the internal state and hides a malformed entry | Medium | Step 1.7 specifies an OR, never an overwrite, and states that no call-site value can force it off. B8 step 8 proves both terms light the border. |
| Clicking the calendar glyph mid-type double-navigates a GET filter | High without the fix | Step 1.2 suppresses the blur commit on `relatedTarget === toggleBtn` and adds `commit()` to the two genuine-exit branches. EXEC-4 step 2b is a hard stop-and-escalate gate before any other filter batch runs. |
| `committed` is re-seeded unconditionally, making `onchange` unreachable on every path (NEW-FAIL-A) | **High** — this is the failure the cycle-2 fix introduced | Step 1.2 puts the re-seed inside the existing `normalizeDate(text) !== v` guard. It fails loud: B4 step 2b's pick would navigate zero times instead of once. |
| A keyboard user Tabs from the input past the glyph and the filter never submits (NEW-FAIL-C) | **High** on B4/B5 — `toggleBtn` has no `onblur` today | Step 1.2 commit point 5 adds a guarded `onblur` to `toggleBtn`. B4 step 2d and B5 step 3b prove it by count. Blast radius is B4/B5 only: at B6-B9 the gap costs only the end-field auto-open, and the data still posts via the `formdata` listener at line 133. |
| `commit()` wired into the shared `close()`, so scrolling or resizing navigates a GET filter (NEW-FAIL-B) | **High** — scrolling mid-type is common | Step 1.2 wires the two calls at the `:215` and `:199` branch sites only, with a five-row table naming every `close()` reacher and its verdict. B4 step 2c proves it. |
| A subagent adds explanatory comments | **High** — this keeps happening | Constraint restated in every batch; grep the diff for added comment lines before accepting any batch |
| `pnpm check` kills the owner's dev server | High if unguarded | Never run `pnpm check` without confirming 5173 is down. See Constraints. |

---

## Standing note — why the hand-click counts carry the weight

**Every defect found in validation cycles 2, 3 and 4 was a missing or an extra callback**, and **no
automated gate in this plan can see a missing callback.** `pnpm check` typechecks a dead `onchange`
happily. `pnpm lint` has no opinion. Every e2e spec that touches a date field uses `.fill()`, which
never blurs and never picks, so the whole suite stays green against a `commit()` that never runs.

That is the entire reason B4 lands **first and alone**, and the reason its steps 2b, 2c and 2d are
written as exact navigation counts rather than as pass/fail judgments. A step that says "the page
does not navigate" is satisfied by a component whose callback is dead. A step that says "**required:
exactly 1 navigation**" is not.

Execute agents: do not soften these into prose. Count the page loads, write the number down, and
stop on any number other than the one the step names.

## Constraints binding every downstream agent

1. **No explanatory comments in code.** Not one. The why goes in the commit message. Before accepting
   any batch, run `git diff -U0 -- <paths> | grep -nE '^\+\s*(//|/\*|<!--)'` and reject non-empty output.
   The single exception is the **deletion** of `TimesheetModal.svelte:247` and its trailing comment,
   which is mandated by B3.
2. **Do not change DatePicker's existing behaviour** — portal/popup logic, keyboard handling, the
   numeric mask, the validity-gate mechanics from `4062844`, or any existing styling. Phase 1 is
   purely additive except for **three** named composition points:
   (a) the `setCustomValidity` message becomes derived (Step 1.1);
   (b) `aria-invalid` gains the range term **and** the call-site OR (Step 1.7);
   (c) `aria-invalid` moves from always-present to **absent when valid** (Step 1.7). Nothing in
   `tests/` asserts the attribute, and `src/app.css:194` selects only `[aria-invalid='true']`, so
   this is safe — but it is a real rendered-DOM change and is listed rather than left implicit.
3. **Do not fix the 6 `non_reactive_update` eslint warnings** on the `bind:this` refs. Deferred.
4. **`pnpm check` must never run while the dev server is live on 5173.** It runs `svelte-kit sync`,
   which regenerates `.svelte-kit` and kills the running server. Safe windows: (a) at the Step 1.9 Phase 1 gate
   after asking the owner to stop the server, and (b) at Step 3.3 once all batches are committed. Do
   not run it per batch. **`pnpm test:e2e` is safe alongside the dev server only on the port axis**
   (Playwright builds and previews on 4173 with `--strictPort`). It also runs `pnpm build`, i.e.
   `vite build`, which triggers a sveltekit sync — that side-effect on a live 5173 dev server is
   **not** proven (WARN-9). Ask the owner before the first `pnpm test:e2e` run, same as `pnpm check`.
5. **The owner starts dev servers and owns env files.** Never edit `.env` or `.env.dev`. Never run
   `./start.sh`. Never touch the `veent-db-5434` container.
6. **Commit per finished verified unit, staging explicit paths.** Never `git add -A`. One commit per
   batch, after that batch's gate is green. Commit messages carry no AI attribution and no
   `Co-Authored-By` trailer.
7. **Batch file ownership is exclusive.** No two batches may touch the same file. If a batch needs a
   change in another batch's file, stop and surface it rather than editing across the boundary.

---


## Phase Completion Rules

A phase or batch is complete only when **all** of the following hold. Code-only completion is
`CODE DONE`, never `VERIFIED`.

1. Every automated gate named for that phase or batch has been run and exits 0. The command and its
   exit status are recorded, not summarised.
2. Every hand-click script for that batch has been driven end to end, and the named marker value has
   been confirmed present **after a page reload** — not merely after the save toast.
3. `git diff -U0` for the staged paths contains zero added comment lines. The only permitted comment
   deletion in the whole plan is `TimesheetModal.svelte:247`.
4. The batch's own commit exists, staging explicit paths only. No `git add -A`.
5. A batch whose gate is Known-Gap only stays **CONDITIONAL** — it cannot be marked PASS. The
   backlog stub for that gap must exist before the batch is closed.
6. `CODE DONE` is the status when 1 holds but 2 has not been driven. `VERIFIED` requires 1 through 5.

## Execution order and parallelism

```
PHASE 1  Steps 1.1 - 1.8, single agent, ALONE, one commit
   │      gate: lint / format / check / test / holidays regression click
   ▼
B4  attendance/+page.svelte          ALONE. Proves the onchange timing contract
   │                                 AND surfaces WARN-1 via hand-click step 2b.
   │                                 Nothing else starts until 2, 2b and 5 are green.
   ▼
B1  PeriodPicker.svelte              ALONE. Highest automated exposure (5 specs) —
   │                                 the cheapest place to catch a Phase-1 regression.
   ▼
   ├── B2  AggregatePanel.svelte
   ├── B3  TimesheetModal.svelte                    CONDITIONAL (WARN-6 stub)
   ├── B5  team/+page.svelte
   ├── B6  reports/[type]/+page.svelte
   ├── B7  reports/audit-log/+page.svelte
   ├── B8  requests/+page.svelte                    CONDITIONAL (FAIL-2 stub)
   ├── B9  leave/new/+page.svelte
   ├── B10 employees/[id]/+page.svelte
   └── B11 employees/new + profile + benefits + separations + recruitment
   │       (nine batches, file-disjoint, fully parallel)
   ▼
PHASE 3  delete dateRange.ts + full CI gate set
         (requires B6, B7, B8, B9 committed)
```

**Sequencing is not free-for-all. Four stages, in this order:**

1. **Phase 1, single agent, alone.** Nothing starts until it is committed.
2. **B4 alone.** Not merely "first among the filter batches" — alone. Its hand-click is the only
   proof of the `onchange` timing contract that every other batch inherits from Phase 1, and step 2b
   is the only proof of the WARN-1 suppression. If step 2, 2b or 5 fails, stop and fix Step 1.2
   before anything else merges.
3. **B1 alone.** Second, and also alone: it is the batch with real automated coverage (5 specs), so
   it is the cheapest place to catch a Phase-1 regression before nine agents fan out.
4. **Then B2, B3, B5, B6, B7, B8, B9, B10, B11 in parallel.** Genuinely independent and
   file-disjoint; no coordination needed.
5. **Phase 3** after B6, B7, B8 and B9 have all committed.

---

## Acceptance Criteria

1. `grep -rn 'type="date"' src/` returns only the 4 comment lines in `pay-periods.ts` and
   `PeriodPicker.svelte:74`. Zero `<input type="date">` elements.
2. `grep -rn 'advanceTo' src/` returns 0 results and `src/lib/actions/dateRange.ts` does not exist.
3. `pnpm format:check`, `pnpm lint`, `pnpm check`, `pnpm test`, and the full `pnpm test:e2e` all pass,
   run in that order.
4. `DatePicker.svelte`'s `Props` interface contains `min`, `max`, `onchange`, `data-r`, `data-c`,
   `aria-invalid`, and `aria-describedby`, and the module exports `focusAndOpen`.
4b. Rendered `aria-invalid` is the OR of the call-site value and the internal state; no call-site
   value can force it off. Proved by B8 step 8 and B1's devtools check.
4c. Opening the month or year quick-jump list always lands focus on an enabled entry, and a trigger
   whose enabled subset is empty is itself `disabled`. Proved by B10 step 2b.
4d. Clicking the calendar glyph while a value is typed does not navigate a GET filter form, and the
   subsequent pick navigates exactly once. Proved by B4 step 2b.
5. Typing into any of the 5 auto-submit filter inputs does not navigate until blur or calendar pick.
6. An out-of-range date typed by hand is refused at submit with a range-specific message at every one
   of the 12 bounded sites.
7. Every hand-click script in B3, B4, B5, B6, B7, B8, B10, and B11 has been run and its marker value
   confirmed present after reload.
7b. The three CONDITIONAL batches (B3 via WARN-6, B8 via FAIL-2, plus the pre-existing known-gaps)
   each have their backlog stub written **before** the batch is closed. A Known-Gap batch can never
   be marked PASS.
8. `git diff` against `4062844` contains zero added comment lines, and exactly one deleted comment
   (`TimesheetModal.svelte:247`).

---

## Validate Contract

Status: BLOCKED
Date: 16-09-26
date: 2026-09-16
generated-by: outer-pvl
supersedes: 2026-09-16 (outer-pvl) — cycle 3, narrow deep pass scoped to Step 1.2 + checklist items 3/6/7 + the two pointer edits

Parallel strategy: sequential (in-thread, scoped)
Rationale: cycle 3 was deliberately narrow. Steps 1.1, 1.3, 1.4, 1.6, 1.7, 1.8 and all eleven batches were cleared in cycle 2 and were untouched except the two pointer edits, which are re-verified below. No fan-out was re-run.

**Cycle 3 result.** Both cycle-2 FAILs are correctly closed. Four of the five attack points pass. One new FAIL on the keyboard path (NEW-FAIL-C) and one residual-grade WARN on checklist item 13. Gate stays BLOCKED on NEW-FAIL-C alone — a three-line addition to Step 1.2, with the patch written out below.

### Cycle-2 findings: disposition

| Cycle-2 finding | Disposition | Evidence |
|---|---|---|
| NEW-FAIL-A unconditional `committed` re-seed | **CLOSED** | The re-seed now sits inside the effect's existing `if (normalizeDate(text) !== v)` guard. Verified order-independent — see attack 1. |
| NEW-FAIL-B `commit()` in the shared `close()` | **CLOSED** | Wired at `:215` and `:199` only, never at `:150`. The five-row reacher table names each path and its verdict, and all five verdicts match source. |
| NEW-WARN-A stale checklist items 3/6/7 | CLOSED | 3 defers to 1.7, 6 is marked superseded by 12, 7 is fully rewritten |
| NEW-WARN-B line 581 specified twice | CLOSED | pointer edit verified — see below |
| NEW-WARN-C `nearestEnabled` used before defined | CLOSED | pointer edit verified — see below |
| NEW-WARN-D unsatisfiable bounds | CARRIED as documented residual | reachable at PeriodPicker's end field; escapable; doubled message |
| NEW-WARN-E `aria-invalid` absent-when-valid | CARRIED as documented residual | safe: nothing under `tests/` asserts it, `app.css:194` selects only `='true'` |
| NEW-WARN-F overclaimed exit coverage | CLOSED in substance | the eleven-row exit table replaces the blanket claim — but see NEW-FAIL-C, one row of it is wrong |
| NEW-WARN-G B4 step 2b missed the over-commit | CLOSED | EXEC-4 step 2c covers scroll, resize and shift-Tab |
| WARN-9 `pnpm test:e2e` runs `vite build` | CARRIED | port proven (4173, `--strictPort`); the sync side-effect is not |

### Attack results (the five the coordinator named)

**1 — `pick()` ordering: PASS, and robust in both directions.**

```
text = formatDay(y, m, d)   // canonical ISO
write(text)                 // value = text → invalidates the $effect at :116
focused = …; view = …
done()                      // open = false; input.focus()
commit()
```

Two independent reasons this is safe, and they do not depend on flush timing:

- **`commit()` runs before the effect flushes.** `pick()` is called synchronously from an `onclick`; Svelte 5 queues `$effect` and flushes after the handler. So at `commit()` time `committed` still holds the OLD value, `n` is the picked date, they differ, and the callback fires exactly once.
- **Even if the effect flushed mid-`pick()`, the guard would not fire.** `pick()` sets `text` *before* `write()`, so by the time the effect reads `v = value`, `normalizeDate(text) === v` — `formatDay(2026,3,2)` is `2026-03-02` and `normalizeDate('2026-03-02')` returns the identical string. The guard is false, so no re-seed and no `text` rewrite.

The guard makes the path order-independent, which is the property that matters: neither "never fires on a pick" nor "fires twice" is reachable. B4 step 2b's pick leg is sound.

**2 — `done()` before `commit()`: PASS.**

`input.focus()` can only blur some *other* element. `onblur` exists on exactly one element in this component — the inner input at `:584` — and focusing the input cannot blur the input. Nothing else in `DatePicker.svelte` carries a blur handler, and no call site attaches one to a date field: a repo-wide grep for `onblur` under `src/routes` and `src/lib/components` returns exactly two hits, `TimePicker.svelte:207` and `DatePicker.svelte:584`, both internal to their own component. So `done()` cannot trigger an early or duplicate commit.

Sub-case checked: if focus was already on the input, `input.focus()` is a no-op and fires no events. If focus was on a grid cell, that cell blurs and has no handler.

Note on the stated rationale: `done()` sets `open = false` in state, but the popup's DOM removal is deferred to the render flush, so "the popup is closed before the form submits" is true of state and not yet of the DOM at the instant `onchange` runs. Harmless — a GET navigation tears the whole document down — but the ordering buys intent, not a hard DOM guarantee.

**3 — Idempotence: PASS. Four sequences walked, exactly one callback each.**

| Sequence | Trace | Callbacks |
|---|---|---|
| pick, then Tab away | `pick()` → `commit()` sets `committed` = picked, fires. Later `onblur`, `relatedTarget` ≠ `toggleBtn` → `commit()`, `n === committed` → return. | 1 |
| type, glyph click (suppressed), click outside | `pointerdown` fires before focus moves → `onDown` outside branch → `close()` + `commit()`, fires. `toggleBtn` then blurs with no handler; the input already blurred and was suppressed. | 1 |
| `focusAndOpen()` (popup open, focus in the input), type, click outside | `pointerdown` → `onDown` → `commit()`, fires. Focus then moves → input `blur`, `relatedTarget` = the clicked element ≠ `toggleBtn` → `commit()`, `n === committed` → return. **This is the tightest succession and the guard absorbs it.** | 1 |
| type, glyph click (suppressed), Escape, Tab away | Escape → `done()`, no commit, focus back on the input. Tab → `onblur`, `relatedTarget` ≠ `toggleBtn` → `commit()`, fires. | 1 |

**4 — WARN-1 suppression against a keyboard user: FAIL. See NEW-FAIL-C.**

Half of it holds. `relatedTarget` is populated identically for keyboard and pointer focus moves, and `toggleBtn` is the immediate next tab stop after the input — a plain `<button type="button">` with no `tabindex`, directly after the input inside the wrapper span. So Tab from the input to the glyph **is** suppressed, exactly as the click is. That half is correct and consistent.

The second half is not. See below.

**5 — Checklist items 3, 6, 7: PASS. One loose item elsewhere.**

- Item 3 — now explicitly hands line 581 to Step 1.7 and warns that applying a version without `externalInvalid` re-opens FAIL-1. ✓
- Item 6 — marked superseded by item 12, with "do not implement a narrower version here". ✓
- Item 7 — names all four commit points (`pick()`, `onblur`, `:215`, `:199`), carries **both** prohibitions (never inside the shared `close()` at `:150`; re-seed inside the `normalizeDate(text) !== v` guard, never after it), and states the consequence of getting either wrong. ✓
- No other checklist item restates superseded text. Items 5 and 11 are complementary, not contradictory. Items 15-28 are batch items, cleared in cycle 2.
- **NEW-WARN-H** attaches to item 13 — see below.

**Pointer edits: both landed cleanly.**
- Step 1.1 item 4 no longer carries its own line-581 code. It states that Step 1.7 owns the line, quotes 1.7's expression, and names the failure mode of applying 1.1 after 1.7. ✓
- `nearestEnabled()` is defined once, in Step 1.1 at its first use inside the `clampedStep` fix, and Step 1.8 says "already defined in Step 1.1 at its first use … Do not redefine it here." ✓

### NEW FAIL (cycle 3)

**NEW-FAIL-C — Step 1.2, WARN-1 suppression. Tab → glyph → Tab silently drops the commit.**

Tab from the input to the glyph is suppressed (correctly). But a Tab to the glyph does **not** open the popup — only a click or `focusAndOpen()` does. So from that state:

- the popup is closed, therefore the `open` effect is not registered, therefore the forward-Tab branch at `:199` **does not exist**;
- `toggleBtn` has **no** `onblur` handler — confirmed in source at `:592-603`, it carries only `onclick={toggle}`;
- the next Tab moves focus out of the control with nothing firing.

The typed value is never committed. On `/team`: type `2026-03-02` in Start Date, Tab, Tab — the filter never submits. The user sees their date in the box and unfiltered rows beside it.

That is the exact state Step 1.2 itself names as unacceptable when arguing why clearing must fire the callback: *"the page would sit showing the previously filtered rows next to an empty control — silently stale data, the worst outcome of the three."* By the plan's own reasoning this cannot ride as a residual. It is also a regression against the native control, which fires `change` on Tab-out today.

The eleven-row exit table's claim that the skips are "benign and self-healing" because "focus is either still inside the control or back on the text input, so the next real blur commits" is true for the **click** route — clicking the glyph opens the popup, and every popup exit either commits or returns focus to the input. It is false for the **Tab** route, where no popup ever opens.

**Blast radius: B4 and B5 only.** At the four `focusAndOpen` sites (B6-B9) the same gap costs only the convenience of the end field not auto-opening; the data still posts via the `formdata` listener at `:133`. At the plain-POST sites there is no callback at all.

**Patch — three lines, additive, no change to the existing suppression.** Add a blur handler to the toggle button:

```
onblur={(e) => {
  if (e.relatedTarget !== input && !popup?.contains(e.relatedTarget as Node)) commit()
}}
```

Verified against all six ways `toggleBtn` can blur:

| `toggleBtn` blurs to | Commits? | Correct? |
|---|---|---|
| the next page element, popup closed (the gap) | yes — `popup` is undefined, so `!popup?.contains(…)` is true | **yes, this is the fix** |
| a grid cell, right after a glyph click opened the popup (the `$effect` at `:527` focuses it) | no — the cell is inside `popup` | yes |
| the input, via `done()` from Escape or the Done button | no — `relatedTarget === input` | yes |
| the input, via Shift+Tab back | no — same | yes, still inside the control |
| the clicked element after an outside-pointerdown already committed at `:215` | yes, but `n === committed` → no-op | yes, idempotent |
| the next element after a second glyph click closed the popup | yes | yes — this also closes the "second glyph click" skip in the exit table |

This makes the exit table's claim true rather than nearly true, and it adds a fifth commit point that must be named in Step 1.2 and in checklist item 7.

### NEW WARN (cycle 3) — rides as a documented residual

- **NEW-WARN-H (checklist item 13):** item 13 says "add `commit()` to the popup-dismiss paths so no exit route loses a typed value". Read alone, "popup-dismiss paths" invites wiring into the shared `close()` — which is precisely NEW-FAIL-B — because scroll, resize and shift-Tab are all dismiss paths. Item 7 already names the two exact branch sites, so an agent reading both items is safe, and EXEC-13 already routes disagreements to the Step text. Tighten item 13 to "see item 7 for the exact wiring" and drop the "no exit route loses a typed value" clause, which the Step 1.2 exit table has already replaced with an accurate eleven-row breakdown. Non-blocking.

### Test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | zero native date inputs remain | Fully-Automated | `grep -rn 'type="date"' src/` returns exactly 4 comment lines (`pay-periods.ts:7,226,248`, `PeriodPicker.svelte:74`) | A |
| AC2 | the dead action is retired, not orphaned | Fully-Automated | `grep -rn 'advanceTo' src/` returns 0 and `src/lib/actions/dateRange.ts` does not exist | A |
| AC3 | CI gate set clean | Fully-Automated | `pnpm format:check` && `pnpm lint` && `pnpm check` && `pnpm test` && `pnpm test:e2e`, in CI order | A |
| AC4 | DatePicker Props carry the new surface | Fully-Automated | `pnpm check` exit 0 with `min`, `max`, `onchange`, `data-r`, `data-c`, `aria-invalid`, `aria-describedby` on `Props` and `focusAndOpen` exported | A |
| Goal 2 pick | `onchange` fires exactly once on a calendar pick | Agent-Probe | B4 step 2b pick leg | A |
| Goal 2 pointer | typing does not navigate; the glyph click does not navigate; scroll/resize/shift-Tab do not navigate | Agent-Probe | B4 steps 2, 2b, 2c | A |
| Goal 2 keyboard | **Tab out of a filter date field commits exactly once** | Agent-Probe | B4 step **2d** (new, EXEC-15) — **currently proven impossible by NEW-FAIL-C** | B |
| Goal 3 / B1 | PeriodPicker custom range survives `.fill()` and `.fill('')` | Fully-Automated | `pnpm test:e2e tests/e2e/period-picker-cross-month.spec.ts tests/e2e/period-picker-default-cutoff.spec.ts tests/e2e/payroll-custom-range-overlap.spec.ts tests/e2e/payroll-custom-range-labels.spec.ts tests/e2e/payroll-run-void.spec.ts` | A |
| Goal 3 / B2 | `#agg-week` id-targeted fill still reaches the inner input | Fully-Automated | `pnpm test:e2e tests/e2e/timesheet-punch.spec.ts` (`:82`) | A |
| Goal 3 / B9 | `getByLabel('Start Date')` still resolves through the forwarded `id` | Fully-Automated | `pnpm test:e2e tests/e2e/leave-balances.spec.ts tests/e2e/employee.spec.ts tests/e2e/back-navigation.spec.ts` | A |
| Goal 3 / B4 render | `/attendance` both views still render and hydrate | Fully-Automated | `pnpm test:e2e tests/e2e/employee-view-only.spec.ts tests/e2e/attendance-save-timesheet-custom-range.spec.ts` | A |
| Goal 3 / B5 render | `/team` still renders and the range filter round-trips | Fully-Automated | `pnpm test:e2e tests/e2e/back-navigation.spec.ts` (`:11,:29,:44`) | A |
| Goal 3 / B6 render | `/reports/[type]` renders with a start/end range in the URL | Fully-Automated | `pnpm test:e2e tests/e2e/admin.spec.ts` (`:92`) | A |
| Goal 3 / B7 | `/reports/audit-log` renders and the reveal flow is intact | Fully-Automated | `pnpm test:e2e tests/e2e/audit-log-reveal.spec.ts tests/e2e/pii.spec.ts` | A |
| Goal 3 / B11 | `/employees/new` hire date fills; `/benefits`, `/profile`, `/separations`, `/recruitment` render | Fully-Automated | `pnpm test:e2e tests/e2e/admin.spec.ts tests/e2e/recruitment.spec.ts tests/e2e/separations.spec.ts tests/e2e/pii.spec.ts tests/e2e/form-errors.spec.ts tests/e2e/employee.spec.ts` | A |
| G1 / B5 | out-of-range days unclickable AND a hand-typed out-of-range date refused at submit | Agent-Probe | B5 hand-click steps 4-6 | A |
| G4 / B3 | `data-r`/`data-c` restore Up/Down cell nav; the line-247 removal gives Left/Right cell jumping | Agent-Probe | B3 hand-click steps 3, 4, 4b (with the mandatory `End`/`Home` presses) | A |
| G3 / B6 | `focusAndOpen()` replaces the action; clearing the start field does not yank focus | Agent-Probe | B6 hand-click steps 2 and 5 | A |
| FAIL-3 / B10 | the month and year lists stay keyboard-reachable when the stored value predates `min` | Agent-Probe | B10 hand-click step 2b | A |
| FAIL-1 / B8 | both `aria-invalid` terms light the border; `aria-describedby` still points at the error paragraph | Agent-Probe | B8 hand-click step 8 (devtools id match) | A |
| B8 | `/requests` start/end/date submit, enforce `required` + `min`, keep field-error wiring | Agent-Probe | B8 hand-click steps 1-10, marker `DP-B8-REQ` — the ONLY proof for B8 | B |
| B10 | the two hire-bounded effective-date fields and the offboard last-day field | Agent-Probe | B10 hand-click steps 2-7 | A |
| B11 | decade snap on `/profile` DOB and the `w-full` fix; the four other uncovered plain sites | Agent-Probe | B11 hand-click steps 1-5 | A |
| Phase 1 | the two shipped holidays sites behave exactly as at `4062844` | Agent-Probe | Step 1.9 holidays regression click, marker `DP-P1-ADD` | A |
| — | cross-browser popup rendering (Safari/Firefox) | — | none — `playwright.config.ts` declares a single `chromium` project | D |
| — | screen-reader announcement of disabled day cells and disabled month/year options | — | none — no AT harness in the repo | D |
| — | 9 sites with zero e2e date coverage, `/requests` included | — | none — hand-click only | D |
| — | orphaned popup when arrowing out of a TimesheetModal date cell | — | none — fixing it needs focus-loss close logic, which EXEC-2 forbids | D |

gap-resolution legend:
- A — proven now (gate passes in this cycle)
- B — fixed in this plan (gate added or corrected by this plan's checklist)
- C — deferred to a named later phase/plan
- D — backlog test-building stub (named residual; keep-active; continue)

Legacy line form (retained so existing validate-contract consumers still parse):
- DatePicker props/types: Fully-automated: `pnpm check` (dev server on 5173 DOWN)
- Migration completeness: Fully-automated: `grep -rn 'type="date"' src/` and `grep -rn 'advanceTo' src/`
- PeriodPicker / payroll: Fully-automated: the 5 B1 specs
- Timesheets aggregate: Fully-automated: `pnpm test:e2e tests/e2e/timesheet-punch.spec.ts`
- leave/new + employees/new: Fully-automated: `leave-balances`, `employee`, `back-navigation`, `admin`
- render guards: Fully-automated: `employee-view-only`, `attendance-save-timesheet-custom-range`, `back-navigation`, `admin:92`, `pii`, `form-errors:18`, `employee:34`
- onchange timing, pointer paths: Agent-probe: B4 steps 2, 2b, 2c
- onchange timing, keyboard path: Agent-probe: B4 step 2d — blocked by NEW-FAIL-C
- range refusal at the 12 bounded sites: Agent-probe: B5 step 5, B8 step 7, B10 step 3
- FAIL-3 list reachability: Agent-probe: B10 step 2b
- FAIL-1 aria OR + describedby: Agent-probe: B8 step 8
- `/requests` (B8, 3 sites): Agent-probe: hand-click only — known-gap in automation
- Cross-browser popup, screen-reader on disabled cells, orphan popup: known-gap: documented, backlog stubs required

Dimension findings:
- Infra fit: PASS — unchanged. Commands exist; e2e serves on 4173 with `--strictPort`; `pnpm check` is `svelte-kit sync && svelte-check`. WARN-9 carried.
- Test coverage: CONCERN — unchanged from cycle 2. B8 is honestly hand-click-only with a marker script and a backlog stub; the seven render-guard specs are re-homed. Cycle 3 adds B4 step 2d, which is the only gate that would have caught NEW-FAIL-C — no automated gate in this plan can see a missing callback.
- Breaking changes: PASS — unchanged from cycle 2. Both aria props declared, OR-ed correctly, line numbers corrected.
- Security surface: PASS — unchanged. Presentation layer only.
- Section: Phase 1 Step 1.2 (onchange) — **FAIL**. NEW-FAIL-A and NEW-FAIL-B are both correctly closed and the four-point wiring, the five-row `close()` reacher table and the eleven-row exit table all match source. The `pick()` ordering is order-independent, `done()` cannot cross-trigger a blur handler, and idempotence holds across all four tight sequences. One route is wrong: Tab → glyph → Tab commits nothing (NEW-FAIL-C). NEW-WARN-H attaches to checklist item 13.
- Section: Phase 1 Steps 1.1, 1.3, 1.4, 1.6, 1.7, 1.8 — PASS, carried from cycle 2. Both pointer edits verified in this pass; no other change.
- Section: Phase 2, all eleven batches — PASS, carried from cycle 2. Untouched this cycle.

Open gaps:
- **NEW-FAIL-C (Step 1.2, WARN-1 suppression):** Tab → glyph → Tab leaves the typed value uncommitted. `toggleBtn` has no blur handler (`:592-603`) and the popup never opened, so the `:199` forward-Tab branch does not exist. Blast radius B4 and B5. Patch: add the three-line `onblur` to `toggleBtn` given above, name it as the fifth commit point in Step 1.2, and add it to checklist item 7.
- NEW-WARN-H (checklist item 13): "popup-dismiss paths" is loose enough to invite the NEW-FAIL-B wiring. Point it at item 7 and drop the total-coverage clause. Rides as a residual.
- NEW-WARN-D (carried): `minDay > maxDay` is reachable at PeriodPicker's end field and makes the control unsatisfiable with a doubled message. Escapable. Rides as a residual.
- NEW-WARN-E (carried): `aria-invalid` becomes absent-when-valid instead of `"false"`. Safe. Add it to Constraint 2's named list. Rides as a residual.
- WARN-9 (carried): `pnpm test:e2e` runs `vite build`, which also syncs `.svelte-kit`. Port proven, sync side-effect not. Rides as an execute-agent instruction.
- Cross-browser popup rendering: known-gap: documented as NEW PLAN REQUIRED — backlog `datepicker-cross-browser_NOTE_16-09-26.md`
- Screen-reader announcement of disabled cells/options: known-gap: documented as NEW PLAN REQUIRED — backlog `datepicker-a11y-disabled-cells_NOTE_16-09-26.md`
- 9 uncovered sites: known-gap: documented as NEW PLAN REQUIRED — backlog `datepicker-uncovered-sites-e2e_NOTE_16-09-26.md`
- `/requests` page has no spec: known-gap: documented as NEW PLAN REQUIRED — backlog `datepicker-requests-page-e2e_NOTE_16-09-26.md`
- Orphaned popup on cell nav: known-gap: documented as NEW PLAN REQUIRED — backlog `datepicker-orphan-popup-on-cell-nav_NOTE_16-09-26.md`

Plan claims re-verified as CORRECT in source (do not re-litigate):
- `pick()` sets `text` before `write()`, so the re-seed guard is false on that path regardless of when the effect flushes — no missed callback and no double callback.
- `onblur` exists on exactly two elements repo-wide, `DatePicker.svelte:584` and `TimePicker.svelte:207`; no call site attaches one to a date field, so `done()`'s `input.focus()` cannot cross-trigger a commit.
- `relatedTarget` is populated identically for keyboard and pointer focus moves, and `toggleBtn` is the immediate next tab stop after the input.
- All five `close()` reachers in the plan's table match source: `:215` pointerdown, `:199` forward-Tab, `:193` shift-Tab, `:223` scroll, `:227` resize.
- `nearestEnabled()` is defined once (Step 1.1) with Step 1.8 pointing at it; line 581 is owned once (Step 1.7) with Step 1.1 item 4 pointing at it.
- 27 real `<input type="date">`; 4 surviving comment lines; 4 `use:advanceTo` sites; 15 file-disjoint batch files.
- `maskDate` yields no `parseDay`-matchable string before 8 digits, so no per-keystroke leak.
- Structural plan validation: `validate-plan-artifact.mjs` returns 0 failures, 0 warnings.

### Execute-agent instructions (binding)

| # | Instruction | Trigger |
|---|---|---|
| EXEC-1 | **No explanatory comments in code. Not one.** Before staging any batch run `git diff -U0 -- <paths> \| grep -nE '^\+\s*(//\|/\*\|<!--)'` and reject non-empty output. The only permitted comment DELETION is `TimesheetModal.svelte:247` and its trailing `// keep native segment arrows`. | every batch, before `git commit` |
| EXEC-2 | Do not change DatePicker's portal/popup logic, keyboard handling, numeric mask, validity-gate mechanics, or styling beyond what the new props require. Named behaviour changes, and only these: the derived `setCustomValidity` message; the rewritten `aria-invalid` (now also absent-when-valid, NEW-WARN-E); the `onblur` suppression on the input; the new `onblur` on `toggleBtn` (NEW-FAIL-C patch); and the two commit calls at `:215` and `:199`. | Phase 1 |
| EXEC-3 | Do not touch the 6 `non_reactive_update` eslint warnings on the `bind:this` refs. No new warnings. | every batch |
| EXEC-4 | B4 hand-click **step 2c**: with a value typed and the glyph clicked (popup open, no navigation), scroll the page — no navigation. Resize the window — no navigation. Shift-Tab from the popup's first focusable back to the glyph — no navigation. Any navigation on any of the three means NEW-FAIL-B is live: stop and escalate. | B4 |
| EXEC-15 | B4 hand-click **step 2d (NEW-FAIL-C regression check)**: in a fresh filter field, type `2026-03-02` and press `Tab` **twice** using the keyboard only — first Tab lands on the calendar glyph, second Tab leaves the control. The page must navigate exactly **once**, on the second Tab, carrying `?date=2026-03-02`. If nothing navigates, NEW-FAIL-C is still live: stop and escalate, no other filter batch may start. Repeat on `/team` Start Date as B5 step 3b. | B4, B5 |
| EXEC-5 | `pnpm check` must NEVER run while the dev server is live on 5173. Safe windows only: (a) the Step 1.9 gate after the owner confirms 5173 is stopped, and (b) Step 3.3 after every batch is committed. Never per batch. Ask the owner before the first `pnpm test:e2e` run — it runs `vite build`, which also syncs `.svelte-kit` (WARN-9). | Step 1.9, Step 3.3, first e2e run |
| EXEC-6 | Commit per finished verified unit, staging explicit paths. Never `git add -A`, especially while parallel agents run. No `Co-Authored-By` trailer, no AI attribution. | every batch |
| EXEC-7 | Never edit `.env` or `.env.dev`, never run `./start.sh`, never touch the `veent-db-5434` container. The owner starts dev servers. | always |
| EXEC-8 | Every hand-click step must name the route, the control, and a marker value confirmed AFTER a page reload. Reject any step that says "verify it works". Markers: `DP-P1-ADD`, `DP-B8-REQ`, `DP-B11-BEN`, `DP-B11-SEP`, `2026-04-07`, `2026-03-02`, `2026-05-14`, `2026-05-15`, `1995-08-21`, `2026-07-04`…`2026-07-07`. | Phase 1, B3, B4, B5, B6, B7, B8, B10, B11 |
| EXEC-9 | B4: lines 256, 290, 301 sit in two mutually exclusive `<form method="GET">` elements (`:256` in the `data.view === 'team'` branch; `:290`/`:301` in the `{:else}`). Confirmed — do not re-derive. | B4 |
| EXEC-10 | Use `ReturnType<typeof DatePicker>` for the `bind:this` annotation at all 4 `focusAndOpen` sites. | B6, B7, B8, B9 |
| EXEC-11 | `/profile:208` must become `class="input w-full"`. Not a styling change — it is what makes `[&:has(>input.w-full)]:flex` match. Confirm full width before touching the control (B11 step 1). | B11 |
| EXEC-12 | Write the five backlog notes named in Open Gaps BEFORE closing the batch whose only gate is Known-Gap. A Known-Gap batch stays CONDITIONAL and can never be marked PASS. | B3, B5, B6, B8, B10, B11 |
| EXEC-13 | Where the Implementation Checklist and a Step section disagree, the Step section wins. Item 3 defers to Step 1.7, item 6 to item 12, item 13 to item 7. | Phase 1 |
| EXEC-14 | Every auto-submit call site uses `form.requestSubmit()`, never `form.submit()`. `.submit()` bypasses constraint validation, the only thing stopping an out-of-range value from navigating. | B4, B5 |

### What this coverage does NOT prove

- `pnpm check`, `pnpm lint`, `pnpm format:check`, `pnpm test`: prove no runtime behaviour. **No automated gate in this plan can see a missing `onchange` callback** — that is how NEW-FAIL-A and NEW-FAIL-C both got as far as they did, and it is why B4 steps 2b/2c/2d are load-bearing.
- The 5 B1 payroll/period specs: prove `.fill()` and `.fill('')` write through the mask and `#pp-custom-error` still computes. They do NOT prove the popup opens, that disabled days are unclickable, that the decade snap survives, that `aria-describedby` still resolves, or anything about the unsatisfiable-bounds case.
- `timesheet-punch.spec.ts:82`: proves `#agg-week` accepts a `.fill()`. Does NOT prove `clearPreview` still fires per keystroke, nor that the hidden `weekOf` mirrors post correctly.
- `leave-balances` + `employee` + `back-navigation` + `admin`: prove `getByLabel` resolves through the forwarded `id`. They never blur a date field, so they prove nothing about `onchange`, and nothing about `min={today}`.
- Every render-guard spec: proves the page renders and hydrates. None touches a date control.
- The grep gates (AC1, AC2): prove absence of the old markup, nothing about the replacement.
- Every Agent-Probe row: one pass, one browser, one viewport. Not a regression guard — nothing re-runs it.
- **B8 (`/requests`, 3 sites) has no automated proof at all.**
- No coverage at any tier: Safari/Firefox popup rendering; screen-reader announcement of disabled cells and options; the orphaned popup on TimesheetModal cell nav; the nine uncovered sites.

Gate: BLOCKED (1 unresolved FAIL — NEW-FAIL-C, the Tab → glyph → Tab keyboard path commits nothing. Both cycle-2 FAILs are closed; attacks 1, 2, 3 and 5 all pass; both pointer edits verified. The fix is a three-line `onblur` on `toggleBtn`, written out in full above, plus naming it as the fifth commit point in Step 1.2 and checklist item 7. NEW-WARN-H, NEW-WARN-D, NEW-WARN-E and WARN-9 all ride as documented residuals and need no amendment.)
Accepted by: not accepted — BLOCKED on NEW-FAIL-C alone. Return to PLAN for Step 1.2 and checklist item 7 only. Do not re-open Steps 1.1, 1.3, 1.4, 1.6, 1.7, 1.8, any batch, or anything already cleared in cycles 2 and 3.

### Recommended execution order

```
PHASE 1 (single agent, sequential, opus)
   └─ Steps 1.1 … 1.8, one commit, gate 1.9
        │
        ├─ B4  attendance      ← LAND FIRST, ALONE. Steps 2, 2b, 2c and 2d together are
        │                        the only proof of the onchange contract across all four
        │                        input methods: typing, the glyph click, the dismiss
        │                        paths, and the keyboard. Nothing else starts until all
        │                        four are green.
        │
        ├─ B1  PeriodPicker    ← SECOND, alone. Highest e2e exposure (5 specs) and the
        │                        only place the unsatisfiable-bounds case is reachable.
        │
        └─ then in parallel (file-disjoint, no coordination needed):
             B2  B3  B5  B6  B7  B8  B9  B10  B11
                  │       └─ B5 carries step 3b, the /team half of the EXEC-15 check
                  │
PHASE 3 (after B6, B7, B8, B9 commit)
```

**B4 first and alone: unchanged across all three cycles, and now for a fourth reason.** It is the only proof of the `onchange` timing contract that every other batch inherits, and steps 2b, 2c and 2d are the only gates that can see the three defects found in cycles 2 and 3 — all of which are invisible to every automated gate in the plan. B1 second and alone: the batch with real automated coverage, the cheapest place to catch a Phase-1 regression, and the only site where `minDay > maxDay` is reachable. The remaining nine are genuinely independent once B4 and B1 are green.


---

## Resume and Execution Handoff

1. **Selected plan file path:**
   `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/datepicker-rollout_PLAN_16-09-26.md`
2. **Last completed phase or step:** none — plan authored, nothing executed. Repo is clean at
   `4062844` on `feat/uiux-phase-5`.
3. **Validate-contract status:** written, verdict BLOCKED at V1 (3 FAILs, 11 WARNs), then amended by
   this PLAN pass. All 3 FAILs are closed (FAIL-1 → Step 1.7; FAIL-2 → B8 reclassified hand-click-only
   with `form-errors.spec.ts` re-homed to B11; FAIL-3 → Step 1.8 + widened Step 1.6). All 11 WARNs are
   folded in as plan changes or recorded residuals. Cycles 2-4 then found four further defects, all
   confined to Step 1.2 and all closed: NEW-FAIL-A (unconditional `committed` re-seed made `onchange`
   unreachable), NEW-FAIL-B (`commit()` in the shared `close()` navigated on scroll/resize/shift-Tab),
   NEW-FAIL-C (`toggleBtn` has no `onblur`, so a keyboard Tab-out lost the filter submit), and
   NEW-WARN-H (loose "dismiss paths" wording in checklist item 13). `commit()` now has exactly five
   named call sites. Riding residuals: NEW-WARN-D (unsatisfiable bounds at PeriodPicker), NEW-WARN-E
   (`aria-invalid` absent-when-valid), WARN-9 (`vite build` syncs `.svelte-kit`).
4. **Supporting context files loaded:** `src/lib/components/ui/DatePicker.svelte` (full),
   `src/lib/components/ui/TimePicker.svelte` (Props block), `src/lib/utils/calendar-day.ts` (full),
   `src/lib/actions/dateRange.ts` (full), `src/lib/components/ui/PeriodPicker.svelte:200-250`,
   `src/lib/components/timesheets/AggregatePanel.svelte:95-135`,
   `src/lib/components/timesheets/TimesheetModal.svelte:231-250,355-400,498-590`,
   `src/routes/(app)/requests/+page.svelte:240-300`, `src/routes/(app)/team/+page.svelte:60-92`,
   `src/routes/(app)/leave/new/+page.svelte:75-105`, `tests/e2e/` fill inventory, `package.json` scripts,
   `playwright.config.*` (testDir + webServer).
5. **Next step for a fresh agent:** re-run VALIDATE from V1 against this amended plan. On approval,
   execute PHASE 1 (Steps 1.1-1.8) as a single agent and commit it before spawning anything else.
   Then B4 alone, then B1 alone, then the remaining nine in parallel, then Phase 3. Do not start any
   batch until Phase 1 is committed — every batch depends on the new props, and B8/B11 depend
   specifically on Step 1.7 or they will not compile. The binding execute-agent instructions are
   EXEC-1 through EXEC-12 in the Validate Contract section; EXEC-4 (B4 step 2b) is a hard
   stop-and-escalate gate.
