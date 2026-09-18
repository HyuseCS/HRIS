---
name: report:ui-ux-overhaul-phase-07-s5
description: "Phase 07 §S5 execute report — the attendance persona split (E1-E6): two extracted components, grouped bulk bar, collapsed CSV import, sticky Save column."
phase: phase-07-page-splits-s5
date: 2026-09-03
status: COMPLETE
feature: ui-ux-overhaul
plan: process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-07-page-splits_PLAN_03-09-26.md
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: phase-07
---

# Phase 07 §S5 — Attendance persona split

**Branch:** `feat/uiux-phase-7` · **Commits:** `d11219e` (E1/E2), `ee37138` (E3/E4/E5)
**Scope executed:** S5 only (E1-E6). S1-S4 (`employees/[id]`) and S6-S7 (settings,
`employees/new`, pagination) were not opened.

---

## Drift log (research refresh against HEAD `5128769`)

| # | Plan said | HEAD actually had | What I did |
|---|---|---|---|
| 1 | "one two-way branch" | `data.canManage` branched at 12 sites; `?view=employee\|team` lives wholly inside the `canManage === true` path (`load` only ever hands a non-manager `view: 'employee'` — `+page.server.ts:52`) | Followed the validate-contract restatement: the page is now a header + banners + a two-way persona branch; the `?view=` axis moved into `AttendanceHrGrid` unchanged |
| 2 | E3 "the 5-button bulk bar … `Derive`, `Derive team`, `Lock`, `Unlock`, `Lock team`, `Unlock team`" | **There is no single 5-button bar.** There are two mutually-exclusive bars: employee view (Refresh / Lock range / Unlock range / Export CSV / Save as timesheet) and team view (Refresh / Lock day / Unlock day / Export CSV). The button labels are `Refresh`, `Lock range`, `Unlock range`, `Lock day`, `Unlock day` — not the action names the plan lists | Applied the grouping to **both** bars: `Recalculate` = the view's Refresh; `Lock & release` = that view's Lock + Unlock. No button label changed |
| 3 | Phase 05 "gave attendance a Save-as-timesheet confirm" | No `ConfirmButton` on `?/saveTimesheet` exists. Phase 05 landed `ConfirmButton` on `?/resetDay` at **two** render sites (team grid row, employee grid row) | Both `?/resetDay` sites moved verbatim into `AttendanceHrGrid.svelte`; `destructive-confirms.test.ts` WIRING + COPY site 15 repointed in the same commit (`d11219e`) |
| 4 | Phase 06 added scope copy + "All timesheets" cross-link | Present, directly under the employee bulk bar | Carried into `AttendanceHrGrid`, unchanged, still directly under that bar |
| 5 | E1 "keeps the period state" | There is no period `$state` on this page — From/To are `data.from`/`data.to` and the quick-picks drive the GET form through the DOM (`applyRange` reads `#from`/`#to`) | Nothing to thread. `data` carries the period; the quick-pick helpers moved to the shared module and still target the same input ids |

---

## What was done

**E1 — persona extraction.** `src/routes/(app)/attendance/+page.svelte` went 907 → 84 lines. It
now holds the shared script state and renders `PageHeader`, the two page-level result banners, and
one branch:

- `src/lib/components/attendance/AttendanceSelfView.svelte` — `canManage === false`. Date filter,
  quick picks, Export CSV, read-only day table, `Pagination`. The dead `canManage` branches are
  gone rather than gated: this persona can never reach the team view or an edit cell.
- `src/lib/components/attendance/AttendanceHrGrid.svelte` — `canManage === true`. View toggle,
  both filter forms, both bulk bars, the CSV import, the exceptions filter, the AM/PM note, both
  grids, `Pagination`.
- `src/lib/components/attendance/shared.ts` — **not in the plan's Created list** (deviation D-1).
  The formatters, cell classes, `STATUSES`, the Heroicon paths, the quick-pick helpers,
  `recalcHours`, `keepValues`, `isException` and the guard factory. Without it the split would
  duplicate logic, not just markup.
- `src/lib/components/attendance/Icon.svelte` — **not in the plan's Created list** (deviation D-1).
  The page's local `{#snippet icon}` lifted so both personas emit byte-identical SVG.

**E2 — matrix and "Exceptions only" moved behavior-identical.** No restyle, no re-key
(`{#each teamRows as t (t.id)}` / `{#each dayRows as d (d.id)}` unchanged), no semantics change:
`isException` is the same predicate, the empty-state variants and copy are unchanged, and the
`{data.view === 'team' ? teamRows.length : dayRows.length} shown` counter is unchanged. The only
edits inside the moved markup are the ones an extraction forces: `data.canManage &&` dropped from
two `editable` expressions (always true in this component) and the `{@render icon(...)}` calls
became `<Icon ... />`.

**E3 — bulk bar grouped.** Two `role="group"` clusters per bar, each with its own `aria-label`
(`Recalculate`, `Lock & release`), split by a visible `h-6 w-px bg-border` divider. Export CSV sits
after a second divider; `Save as timesheet` is pushed to the far end with `ml-auto` and is the only
`bg-primary` control in the bar. Every submit guard, `disabled` binding, in-flight label
(`Locking…`, `Importing…`, `Saving…`), `title` and the `#108` comment moved unchanged.

**E4 — CSV import behind a disclosure.** `<details class="rounded-lg border bg-card">` with
`<summary>Import backlog CSV</summary>`, collapsed by default,
`open={!!(form?.importError || form?.imported)}` so any import result or import error forces it
open. The `importError`-not-`error` gating comment and its reasoning are intact, as is the nested
"Why rows were rejected" `<details open={nothing}>`.

**E5 — sticky Save column.** The action `<th>`/`<td>` on **both** grids carry
`sticky right-0 border-l bg-card` (4 sites: team header + team body, employee header + employee
body). Both grids already sit in an `overflow-x-auto` wrapper, which is what makes `sticky` bite.
The AM/PM variant is the same markup with four extra columns, so it is covered by the same change.

---

## States and guards threaded as props (the contract's hard requirement)

Created **once** in `+page.svelte`, passed down — never re-created in a child:

| Threaded | Prop | Why it must not be re-created |
|---|---|---|
| 8 bulk submit guards (`derive`, `lock`, `unlock`, `saveTimesheet`, `deriveTeam`, `lockTeam`, `unlockTeam`, `importBacklog`) | `guards` (one object from `createAttendanceGuards()`) | A guard re-created in the child gets its own in-flight flag → the #108 double-submit hole reopens |
| The per-row guard cache (`Map` + `rowGuard()`) | `rowGuard` | A second Map would hand the same row two guards; the cache is also what stops one row greying out every row |
| `exceptionsOnly` | `bind:exceptionsOnly` | The filter state and the two derived row lists must be one value; the child owns the checkbox, the page owns the state |
| `teamRows` / `dayRows` (derived from `exceptionsOnly`) | `teamRows`, `dayRows` | Single derivation site |
| `exportHref` | `exportHref` | One URL builder for both personas |
| period / date | inside `data` | There is no separate period state — see drift #5 |

`keepValues` is a pure `SubmitFunction` factory with no state, so it is imported directly by the
grid rather than threaded.

---

## Test gate outcomes

| Gate | Command | Result |
|---|---|---|
| Structural | `pnpm check` | **PASS** — 1123 files, 0 errors, 1 warning (pre-existing `CalculatorWindow.svelte` a11y warning, untouched) |
| Attendance units (G9) | `npx vitest run` on the 14 attendance unit files + `destructive-confirms.test.ts` | **PASS** — 15 files, 195 tests |
| `attendance-save-timesheet-cross-month.test.ts` | same run, file **unmodified** | **PASS** — 4 tests |
| Full unit suite | `pnpm test` | **PASS** — 210 files, 2371 tests |
| Format | `pnpm format:check` | **PASS** |
| Lint | `pnpm lint` | **PASS** — 0 errors, same 1 pre-existing warning |

Full CI-order set (`format:check → lint → check → test`) run green at section end.
Not run, by instruction: `pnpm test:e2e` (no servers started, no DB touched).

---

## Plan deviations

| # | Deviation | Class | Rationale |
|---|---|---|---|
| D-1 | Created two files beyond the plan's Created list: `src/lib/components/attendance/shared.ts` and `.../Icon.svelte` | Within blast radius (new files inside the folder the plan created for this split) | The plan named two components; a persona split duplicates *markup* by design, but duplicating `fmtTime`, `recalcHours`, the cell class strings and the icon paths into both files would duplicate *logic*. Both new files are internal to `components/attendance/` and are imported by nothing else. |
| D-2 | E3's cluster membership is per-view (`Refresh` alone under `Recalculate`; `Lock range`+`Unlock range` **or** `Lock day`+`Unlock day` under `Lock & release`) rather than the plan's six-button single bar | Within blast radius | The six-button bar the plan describes does not exist — see drift #2. The intent (read-ish actions visually separated from irreversible ones) is met in both bars. |
| D-3 | `Save as timesheet` gained `bg-primary` styling | Within blast radius | E3 requires it be "its own primary action, visually apart". Divider + `ml-auto` gives the position; primary styling gives the rank. It matches the per-row `Save` button's existing primary treatment. |
| D-4 | `tests/unit/destructive-confirms.test.ts` WIRING + COPY site 15 repointed from `routes/(app)/attendance/+page.svelte` to `lib/components/attendance/AttendanceHrGrid.svelte` | Required by the brief, done in the same commit as the move | The route file no longer imports `ConfirmButton`; leaving the fixture would have gone red for the wrong reason. Assertions and the copy needle are unchanged. |

No hard-stop-class deviation. No server, schema, service, RBAC or `components/ui/` file was
opened. No route, URL, form action or `?view=` value changed.

---

## Test infra gaps found

- **No component-test harness.** The extraction is proven only by `pnpm check` (every reference
  resolves) and by the unit tier still passing — neither renders these components. That nothing
  visually regressed, that the sticky column is reachable at 1280/1440px, that the import
  disclosure auto-opens, and that the two `role="group"` clusters read correctly are **G8's**
  job (Hybrid + Agent-Probe) and are **UNRUN** — no servers were started.
- `destructive-confirms.test.ts` is a source scan by its own admission: it now proves
  `AttendanceHrGrid.svelte` imports `ConfirmButton` and mentions `?/resetDay`. It cannot prove the
  dialog still opens after the move.

---

## Closeout packet

- **Selected plan:** `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-07-page-splits_PLAN_03-09-26.md`
- **Finished:** E1, E2, E3, E4, E5, E6 (gate).
- **Verified:** the full CI gate set, the 14 attendance unit files, `destructive-confirms.test.ts`,
  the whole 2371-test unit suite.
- **Unverified:** G8 (attendance persona live walk — sticky Save at 1280/1440px, import
  disclosure auto-open, matrix parity), `tests/e2e/employee-view-only.spec.ts:162-169`, the
  `impeccable` audit (G11) on the three new `.svelte` files.
- **State:** `Keep in active/testing` — S5 is CODE DONE. Phase 07 is not archivable until S6-S7
  land and the live gates run.

---

## Forward Preview

**Test infra found.** No component-test harness; `pnpm check` is the only structural gate a
markup extraction has. The source-scanning unit tests (`destructive-confirms.test.ts`,
`nav-sections.test.ts`, `settings-cards.test.ts`) hard-code file paths — **any phase that moves
markup between files must repoint its fixture in the same commit**, or the gate goes red for the
wrong reason and the next agent debugs a phantom.

**Blast radius changes.** Files I claimed for S5:
`src/routes/(app)/attendance/+page.svelte` (rewritten, 907 → 84 lines),
`src/lib/components/attendance/{AttendanceSelfView,AttendanceHrGrid,Icon}.svelte`,
`src/lib/components/attendance/shared.ts` (all new),
`tests/unit/destructive-confirms.test.ts` (fixture paths only).
The registry has **no `## Phase 07` section yet** — the S1-S4 agent did not open one and I did not
create one, to avoid a write race with the S6-S7 agent. Whoever finishes phase 07 last must write
it, transcribing S1-S4, this S5 list, and S6-S7.

**Commands to stay green.**
```
pnpm format:check && pnpm lint && pnpm check && pnpm test
npx vitest run tests/unit/attendance-*.test.ts tests/unit/destructive-confirms.test.ts
```

**Dependency changes.** None. No npm dependency added.

**For the S6-S7 agent.**
- I touched none of your files. `tests/unit/settings-cards.test.ts`,
  `tests/e2e/settings-visibility.spec.ts`, `(app)/+layout.svelte`, `settings/**`,
  `employees/new/**`, `separations/**`, `inventory/**`, `complaints/**` are untouched.
- The one shared file is `tests/unit/destructive-confirms.test.ts` — I changed exactly two
  entries (WIRING index 8, COPY site 15) and nothing else. Rebase, do not overwrite.
- If you add a new `settings/+layout.svelte`, note that the destructive-confirms G2 scan walks
  **every** `.ts`/`.svelte` under `src/` — a native `confirm()` anywhere new goes red.

**For phase 08 (copy + a11y).**
- Three new files to sweep: `AttendanceSelfView.svelte`, `AttendanceHrGrid.svelte`, `Icon.svelte`.
- `Icon.svelte` is `aria-hidden="true"` by construction — every use is decorative and its button
  carries the text label. Do not add an `aria-label` to the icon; label the control.
- The two bulk-bar clusters are labelled `Recalculate` and `Lock & release` via `aria-label` on a
  `role="group"` div, with no visible caption. If phase 08 wants visible group captions, the
  `aria-label` should become a visible `<span id>` + `aria-labelledby` rather than both.
- The import `<summary>` text (`Import backlog CSV`) is the same string as the submit button
  inside it. That duplication predates this phase but now reads as two identical controls.
