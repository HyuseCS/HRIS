---
phase: surfaces-fields-open-period-s11
date: 2026-09-15
status: COMPLETE_WITH_GAPS
feature: ui-ux-overhaul
plan: process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/surfaces-fields-open-period_PLAN_15-09-26.md
---

# S11 Verification Report — surfaces, fields, Open Period modal

TL;DR: Every measured pair meets its target in both themes and matches the set-B / dark tables to
the hundredth. NC-11.3 went red and back. E1 holds (backdrop top 0). The live probe passed
required-field, success, 409 and Escape/Cancel focus return. Four defects were found (none fixed —
S11 is no-src): (D1) after a failed submit, focus drops to `<body>` and Escape no longer closes
the dialog; (D2) `/settings/roles` on phone scrolls sideways to 1039px; (D3) after a success close,
focus lands on `<body>`, not the trigger; (D4) phone pagination wraps its labels. NC-T5.3a/b were
not run (they need a rebuild, which the owner's running dev server forbids).

Branch `feat/uiux-phase-5` at `9aebc46`. Built bundle `build/` (12:54, newer than HEAD) served with
`pnpm exec dotenv -e .env.dev -- vite preview --port 4173`, stopped at the end. Port 5173 (owner's
dev server) was not touched. Scripts: `lib.mjs`, `measure.mjs`, `measure2.mjs`, `skel.mjs`,
`shots.mjs`, `ovf*.mjs`, `probe.mjs`, `probe2.mjs` in the session scratchpad
(`/tmp/claude-1000/-home-hyuse-Desktop-VeentApps-hris/30a0e80f-b399-4795-8f0a-fca6d8b59612/scratchpad`).

## What Was Done

Already done by the orchestrator (not redone): 11.1 wave gate (format:check, lint 0 errors / 1
pre-existing CalculatorWindow warning, check 0 errors, vitest 221 files / 2623 tests), `pnpm build`,
cross-month e2e 4/4, owner chose light set B.

This session: 11.3 measurement, 11.1.1 site scan re-run, 11.4 screenshots, 11.5 live probe, AC-S2.3
skeleton check.

Login: `POST /api/v1/_dev/login-as {"email":"admin@veent.ph"}` returned 200 on preview. Its `if (!dev)`
guard is compiled out of this build (`.env.dev` sets `NODE_ENV="development"` at build time), so the
passwordless route exists in the built bundle. No production environment exists; recorded, not acted on.

Theme: `localStorage.theme` + reload; body computed `#f0f0f0` light vs `#0f0f0f` dark (differ — pass valid).
Fonts awaited before every read and screenshot.

## Test Gate Outcomes

### 11.3 Built-bundle computed-style measurement (Hybrid)

Method: computed style, background alpha-composited down to the first opaque ancestor, WCAG ratio on
8-bit values. "== token" compares against a live `div` carrying the utility class.

| Page | Check | Light | Dark | Target | Result |
|---|---|---|---|---|---|
| `/settings/roles` | selector control: container holds `#roles-q`, form, table | found | found | found | PASS |
| `/settings/roles` | container fill == `bg-card` | #fbfbfb | #1c1c1c | card | PASS |
| `/settings/roles` | container border-top-width | 1px | 1px | 1px | PASS |
| `/settings/roles` | `#roles-q` border == `border-input` | #878787 | #6e6e6e | --input | PASS |
| `/settings/roles` | input edge vs container | **3.47** | **3.34** | ≥3 (plan 3.47 / 3.34) | PASS |
| `/settings/roles` | input edge vs body | **3.15** | **3.76** | ≥3 (plan 3.15 / 3.76) | PASS |
| `/settings/roles` | container vs body | 1.10 | 1.12 | info (plan 1.10 / 1.12) | match |
| `/settings/roles` | muted `<th>` on thead (`bg-muted/50` over card) | 5.12 | 5.04 | ≥4.5 (plan 5.12 / 5.04) | PASS |
| `/settings/roles` | pagination wrapper (has nav) border-top (R12) | 1px | 1px | 1px | PASS |
| `/employees/[id]` | Update Profile form fill == card (AC-S3.1) | #fbfbfb | #1c1c1c | card | PASS |
| `/employees/[id]` | neighbouring `bg-card` section | #fbfbfb | #1c1c1c | card | PASS |
| `/employees/[id]` | Change Salary form fill == card | true | true | card | PASS |
| `/employees/[id]` | Offboard form background (AC-S3.2) | rgba(0,0,0,0) | rgba(0,0,0,0) | transparent | PASS |
| `/employees/[id]` | Offboard border colour | rgba(217,38,38,0.5) | rgba(217,38,38,0.5) | destructive/50 | PASS |
| `/employees/[id]` | selector control: inject `bg-card` on Offboard | reads #fbfbfb, then transparent | reads #1c1c1c, then transparent | discriminates | PASS |
| `/employees/[id]` | `#jobTitle` edge vs Update Profile card | 3.47 | 3.34 | ≥3 | PASS |
| `/employees` | LIST-SHAPE container holds form + table, 1px, card (AC-S3.3) | yes | yes | yes | PASS |
| `/employees` | table wrapper own border | 0px/0px | 0px/0px | none | PASS |
| `/employees` | pagination wrapper (has nav) | 1px | 1px | 1px | PASS |
| `/employees` | PageHeader description | — | — | — | not measurable: `/employees` has no description; measured on `/payslips` instead |
| `/payslips` | PageHeader description (muted-foreground on body) | 4.82 | 5.93 | ≥4.5 (plan 4.82 / 5.93) | PASS |
| `/payslips` | shared `Table` wrapper (AC-S2.2) | 1px, shadow none | 1px, shadow none | 1px, none | PASS (empty-state wrapper rendered; admin has no payslip rows) |
| `/employees` (stream) | `TableSkeleton flush` during stream, CDP-throttled (AC-S2.3) | class "", border 0px, transparent | — | no border | PASS (light only) |
| `/team` | LIST-SHAPE container (AC-S7.2) | form + table, 1px, card | same | yes | PASS |
| `/leave/balances` | LIST-SHAPE container (AC-S8.1) | form + table, 1px, card | same | yes | PASS |
| `/reports/audit-log` | LIST-SHAPE container + pagination 1px (AC-S10.1) | yes | yes | yes | PASS |
| `/payroll` | create form fill == card; runs table wrapper == card (AC-S4.1) | true / true | true / true | card | PASS |
| `/payroll` | `#pp-month` edge vs create form | 3.47 | 3.34 | ≥3 | PASS |
| `/payroll/[id]` (E2, run `cmtmd2obl000711xpmqijsxm7`) | all 3 inactive approval `<li>` fill == card | #fbfbfb ×3 | #1c1c1c ×3 | card | PASS |
| `/requests/[id]` (E2, request `cmtmoggmv004hyt54sjptvza8`) | origin + inactive approval `<li>` fill == card; active `<li>` keeps `bg-primary/5` | card | card | card | PASS |
| `/requests/[id]` | dashed `<li>` transparent (AC-S9.1) | — | — | transparent | NOT MEASURED — no request in the DB has a removed document (`request_documents.deletedAt` all null); source diff shows the dashed `<li>` line unchanged |
| `/payroll/periods` | table wrapper fill == card (AC-S5.7) | true | true | card | PASS |
| `/payroll/periods` dialog | panel fill == card | true | true | card | PASS |
| `/payroll/periods` dialog | `#name` border == `border-input`; edge vs panel | 3.47 | 3.34 | ≥3 | PASS |
| `/payroll/periods` dialog (E1) | backdrop rect | top 0, left 0, 1528×900 = viewport, margin-top 0px | same | top 0 | PASS |
| `/payroll/periods` dialog (E1) | `elementFromPoint(5,12)` is the backdrop | true | true | true | PASS |
| `/profile` | `.input#firstName` fill (S1 step 3) | #f0f0f0 == background, != input | #0f0f0f == background | background | PASS |
| `/attendance` | segmented control `:327` background (AC-S7.1) | rgba(0,0,0,0) | rgba(0,0,0,0) | transparent | PASS |
| `/attendance` | selector control: inject `bg-card` on it | reads rgb(251,251,251) = card | reads rgb(28,28,28) = card | discriminates | PASS |
| injected `div.bg-muted.text-muted-foreground` | muted-foreground on muted | 4.90 | 4.80 | ≥4.5 (plan 4.90 / 4.80) | PASS |
| `/settings/holidays` · `org` · `org-chart` · `schedules` · `posting-approvers` (AC-S6.2) | every bordered box resolves to card | 1/1 · 2/2 · 27/27 · 2/2 · 1/1 | same | all | PASS |

The first run showed 4 FAIL rows. All 4 were script faults, fixed and re-run: `bg-input` no longer
exists in the bundle (compared against `border-input` instead); `/employees` has no header
description; the `/payroll` create form is behind the "New Payroll Run" toggle.

**NC-11.3 (negative control)** on `/settings/roles`:

| Theme | Before | `--input` forced | After force (edge vs card / body) | Verdict | After reload |
|---|---|---|---|---|---|
| light | 3.47 / 3.15 | `0 0% 94%` | **1.10 / 1.00** | FAIL | 3.47 / 3.15 PASS |
| dark | 3.34 / 3.76 | `0 0% 13%` | **1.06 / 1.19** | FAIL | 3.34 / 3.76 PASS |

### 11.1.1 Site scan re-run (Hybrid)

`scan2.mjs` over `src/**/*.svelte`: 29 hits, 8 at top level, 21 inside a filled surface.

Top level (none is a bare container that needs a fill):

```
src/lib/components/Pagination.svelte:40,55          <span> disabled Prev/Next — not a surface
src/lib/components/performance/ReviewFormRender.svelte:168  <ul>  — leave (plan)
src/lib/components/performance/SectionList.svelte:40        <p> dashed — carve (site 52)
src/lib/components/recruitment/ApplicantKanban.svelte:172   dashed — leave (plan)
src/routes/(app)/complaints/+page.svelte:237                dashed — leave (plan)
src/routes/(app)/complaints/[id]/+page.svelte:90            dashed — leave (plan)
src/routes/(app)/requests/[id]/+page.svelte:305             dashed <li> — carve (site 51, was :303)
```

Nested (all `leave` or `carve` in the plan): `attendance:327` (carve, inside the filter `bg-card`
panel), `branches:146`, `dashboard:339,373`, `employees/[id]:859,903,1423`, `employees/[id]:1828`
(Offboard carve — the nesting heuristic labels it INSIDE; live measure shows transparent),
`inventory:191`, `profile:236,274,317`, `recruitment/[id]:185,313`,
`recruitment/applicant/[applicantId]:142,300`, `settings/leave-types:133`, `settings/pay-codes:47,130`,
`settings/salary-grades:47,144`. `TimesheetModal:489` dashed is a `<button>`, dropped by the scan.

Every `fill`/`list` row from the plan table is gone from the scan. Carve-outs unchanged:
`git diff 825d3ff..HEAD` shows no `-`/`+` line with `border-dashed` or `border-destructive/50` in
`requests/[id]` or `employees/[id]`; the attendance diff is the two table fills only (`:327` unchanged).
E2 sites use template ternaries the string scan cannot see; both measured live above (card).

### 11.4 Screenshots (Agent-Probe)

Saved in `surfaces-fields-open-period_screens/`. Desktop 1440×900, as the orchestrator directed (the
plan said 1528). Full-page except the dialog shots. Each image was viewed.

| File | What I see |
|---|---|
| `settings-roles_light_1440.png` | One card holds filter, table, pagination. Field edge is clear. The input reads as a slightly darker well (`bg-background` on card). No defect. |
| `settings-roles_dark_1440.png` | Same shape. Field edge visible on the dark card. No defect. |
| `settings-roles_light_390.png` | **D2**: page scrolls sideways (image 1039px wide, empty right). Table scrolls in its wrapper. Pagination labels wrap (**D4**). |
| `settings-roles_dark_390.png` | Same as light: D2, D4. |
| `employees_light_1440.png` | Search, tabs, table, pagination in one card. No double border. No defect. |
| `employees_dark_1440.png` | Same. No defect. |
| `employees_light_390.png` | Card fits. Table scrolls inside the wrapper (right columns cut at edge, no scroll cue — same pattern as before). Pagination wraps (**D4**). |
| `employees_dark_390.png` | Same as light. |
| `employees-id_light_1440.png` | Profile, Update Profile, Change Salary, Promote all read as cards. Offboard is unfilled with a red edge (carve-out). Leave balance tiles are gray wells inside the card. No defect at this scale (5459px tall, viewed downscaled). |
| `employees-id_dark_1440.png` | Same. No defect seen. |
| `employees-id_light_390.png` | 9526px tall, too downscaled to judge details. Measured: no horizontal overflow. |
| `employees-id_dark_390.png` | Same limit. No horizontal overflow. |
| `payroll-periods_light_1440.png` | Table on card. No inline form. No defect. |
| `payroll-periods_dark_1440.png` | Same. No defect. |
| `payroll-periods_light_390.png` | Card fits. Date column wraps word-by-word (pre-existing narrow column). No overflow. |
| `payroll-periods_dark_390.png` | Same. |
| `payroll-periods-dialog_light_1440.png` | Backdrop covers the whole viewport, top strip included (E1). Panel is ~896px (`wide`); content uses ~545px, so the right ~40% of the panel is empty. Not too narrow. Observation only. |
| `payroll-periods-dialog_dark_1440.png` | Same. |
| `payroll-periods-dialog_light_390.png` | R4 check: the segmented period control wraps onto 3 rows inside the 358px panel. Content right edge 349 < panel 374. No clipping, no overflow. Buttons fit. |
| `payroll-periods-dialog_dark_390.png` | Same. |
| `payroll_light_1440.png` | Runs table on card. No defect. |
| `payroll_dark_1440.png` | Same. |
| `payroll_light_390.png` | Card fits; table scrolls in wrapper (Net Pay cut at edge, same pattern). |
| `payroll_dark_390.png` | Same. |
| `reports-audit-log_light_1440.png` | Filter, summary, table, pagination in one card. No double border. No defect. |
| `reports-audit-log_dark_1440.png` | Same. |
| `reports-audit-log_light_390.png` | Card fits; table scrolls in wrapper; pagination wraps (**D4**). |
| `reports-audit-log_dark_390.png` | Same. |
| `employees-new_light_1440.png` (look) | Seven fieldsets read as cards; legends sit on the top edge. No defect. |
| `recruitment-id-apply_light_1440.png` (look, `jp_seed_demo`) | Two fieldsets read as cards. No defect. |
| `departments_light_1440.png` (look) | Table on card. No defect. |
| `complaints_light_1440.png` (look) | Empty state: the dashed box (`:237`, leave) sits on the page with no fill. The `:189` list did not render (no data), so it was not seen. |

Layout metrics (all 32 shots): no `overflow-hidden` container clips content (scrollWidth/Height ≤
client); no empty pagination strip (every `has-[nav]` wrapper on these pages holds a nav);
document horizontal overflow only on `settings-roles_*_390`.

### 11.5 Open Period live probe (Agent-Probe)

Target: preview 4173 (the plan said the dev server; the dev server is the owner's). Marker
`PROBE open-period 15-09-26`, range 2031-02-02 – 2031-02-08.

Baseline: `payroll_periods` 3, `payroll_runs` 3, overlap count 0, marker 0, periods digest
`2b5c49d3183c59324b72d3b2089070da`.

| Step | Result | AC |
|---|---|---|
| 1 empty Name → Open | native message "Please fill out this field.", `valueMissing` true, focus on `#name`, **0 POSTs** to `?/open`, dialog open | AC-S5.3 PASS |
| 2 fill marker, Custom range, dates | no `#pp-custom-error`; hidden `start`/`end` = 2031-02-02 / 2031-02-08 | — |
| E4 Month `<select>` (`#pp-month`) click → Escape | dialog **stays open**, focus stays on the select (headless Chromium; native popup not drawn, so "popup closed" cannot be seen) | E4 recorded |
| 3 Open (valid) | HTTP 200, action result `{type:"success", data:{action:"open", saved:"Period opened."}}`; dialog closed; polite region over 4s saw exactly one message `Period opened.`; marker row in table; page red block 0 | AC-S5.5 PASS |
| 3 focus after success close | focus on `<body>`, not on `Open Period` (**D3**) | not an AC; defect |
| 4 same range again | action result `{type:"failure", status:**409**, data:{action:"open", error:"A payroll run for this period already exists"}}` (HTTP 200 envelope); one error toast with that text; dialog open; Name / start / end kept; red block 0; still 1 marker row | AC-S5.4 PASS |
| 5a Escape (fresh open) | dialog count 0, focus on `Open Period` | AC-S5.6 PASS |
| 5b reopen → Cancel | Name empty on reopen; dialog count 0; focus on `Open Period` | AC-S5.6 PASS |
| extra: Escape right after the 409 | focus had dropped to `<body>`; Escape does **nothing**, dialog stays; after focusing `#name` again Escape closes and focus returns to trigger (**D1**) | defect |

psql read-back (probe run 2): period `cmu281lih000bvoh724banjs7` OPEN, run `cmu281lil000dvoh7348pz26k`
DRAFT (0 approval steps, 0 entries). Totals 4/4, so the three 409 submits wrote nothing.

Probe run 1 also created the marker (period `cmu27vkc00002voh7ak853n7e`, run
`cmu27vkc20004voh7nwzxx8d1`). My `tail` cut its step log, and the script then stopped at step 4.
That run was cleaned up by exact name and id, then the probe ran again from step 1. The table above
comes from the full second run, plus `probe2.mjs` for the Escape/focus detail.

Cleanup: each time, one transaction deleting the run and then the period, matched by exact name
**and** read-back id. FKs to these tables: only `approval_steps`, `payroll_entries` (both 0) and
`payroll_runs.periodId`. After: marker 0, periods 3, runs 3, digest
`2b5c49d3183c59324b72d3b2089070da` (same as baseline) — AC-S11.5 PASS.

**Audit rows kept (E8):** `cmu27vkc50006voh78yx873v0` (run 1) and `cmu281lio000fvoh7ng5a2nal` (run 2),
both `CREATE` / `PayrollPeriod` / name = marker. Not deleted.

### NC-T5.3a / NC-T5.3b — NOT RUN

The orchestrator said no `pnpm build` / `pnpm check` while the owner's dev server runs.
NC-T5.3a needs a src edit plus a rebuild. NC-T5.3b is a test-only edit, but
`playwright.config.ts` `webServer` always runs `pnpm build` (`reuseExistingServer: false`). So both
need a rebuild. AC-S5.2 stays open on its NCs until an e2e window.

## Defects Found (not fixed — S11 is no-src)

| # | Defect | Evidence | Cause (verified) |
|---|---|---|---|
| D1 | After a failed Open (409), Escape does not close the dialog, and keyboard focus is outside the modal | `probe2.mjs`: after 409 focus = `BODY`, Escape → dialog count 1; focus `#name` → Escape closes | The submit button becomes `disabled` while busy and loses focus to `<body>`. Dialog's Escape handler is `onkeydown` on the panel (`Dialog.svelte` `onKeydown`), so a key on `<body>` never reaches it. Shared `Dialog` — likely affects every dialog form that disables its submit. |
| D2 | `/settings/roles` at 390px scrolls sideways to 1039px | `settings-roles_light_390.png`, `settings-roles_dark_390.png`; `documentElement.scrollWidth` 1039, `scrollX` can reach 649 | `<th class="px-4 py-3"><span class="sr-only">Actions</span></th>` (`settings/roles/+page.svelte:181`): the absolutely positioned `sr-only` span has no positioned ancestor, so it escapes both `overflow-x-auto` and `overflow-hidden`. Giving the `<th>` `position: relative` in the live DOM drops scrollWidth to 390. Probably pre-existing (the old wrapper had the same escape); not proven on an old build. |
| D3 | After a successful Open, focus lands on `<body>`, not on `Open Period` | probe step 3 `triggerFocused: false` | Not diagnosed further. Same disabled-button focus loss is the likely cause. |
| D4 | Phone pagination wraps "← Previous", "Next →" and "1–10 of 25" onto two lines | `*_390.png` for roles, employees, audit-log | `Pagination` inside the new `has-[nav]:px-4` wrapper has 32px less width than before. Cosmetic. |

Observations (not defects): the desktop dialog panel is ~896px for ~545px of content; light fields are
darker wells (`bg-background` 94% on a 98.5% card), which is the S1 design; complaints' dashed empty
box stays unfilled beside filled pages (plan `leave`).

## What Was Skipped or Deferred

- NC-T5.3a/b: not run (rebuild forbidden while the dev server runs).
- AC-S9.1 dashed `<li>` computed style: no data (no removed request documents). Source unchanged.
- AC-S2.3 non-flush skeleton: not caught live; only the flush case was measured.
- 11.6 e2e window and 11.7 `impeccable` audit: not in this handoff.
- Backlog stub `surface-recipe-source-gate_NOTE_15-09-26.md` (plan Test Infra notes): not written, since this handoff limits writes to the report and screens.
- Owner human click-through of the seven pages, both themes: still to ask.

## Plan Deviations

- Desktop screenshot width 1440 (orchestrator) instead of 1528 (plan). Measurement ran at 1528.
- 11.5 ran on preview 4173, not the dev server (the owner's dev server is off-limits).
- The probe marker was created twice (run 1's log was cut off). Both were cleaned up by name + id; two audit rows remain.
- Header-description contrast was measured on `/payslips` because `/employees` has no description.

## Test Infra Gaps Found

- The e2e `webServer` rebuilds every run, so no e2e (and no NC-T5.3b, which is test-only) can run while the dev server must stay undisturbed.
- The built e2e/preview bundle is a `NODE_ENV=development` build, so `dev` guards (the `_dev/login-as` route) are compiled out.
- The site scan's indentation heuristic mislabels `employees/[id]:1828` as nested. Live measurement covered it.
- Measurement and probe scripts live only in the session scratchpad. The plan wants them kept with the report.

## Closeout Packet

- Selected plan: `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/surfaces-fields-open-period_PLAN_15-09-26.md`
- Finished: 11.3 (all PASS, NC-11.3 red and back, selector controls), scan re-run, 11.4 (32 screenshots, each viewed), 11.5 (all AC rows PASS, cleanup exact).
- Unverified: NC-T5.3a/b, AC-S9.1 live, 11.6, 11.7, owner click pass.
- Closeout state: **Keep in active/testing** — D1–D4 need an owner decision (fix in S5/S6 files or backlog), and NC-T5.3 plus 11.7 are open.
- Next valid state: owner triage of D1–D4, then an e2e window for NC-T5.3a/b, then 11.7.

## Forward Preview

### Test Infra Found
Preview on 4173 with `_dev/login-as` works for the agent browser. The theme switch is `localStorage.theme` + reload.

### Blast Radius Changes
None (no src edits). New files: this report and `surfaces-fields-open-period_screens/` (32 PNGs).

### Commands to Stay Green
`pnpm exec dotenv -e .env.dev -- vite preview --port 4173`; `CI=1 pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/period-picker-cross-month.spec.ts` (rebuilds — needs the dev server down).

### Dependency Changes
None.

## Addendum 15-09-26: post-report checks

- D1 (focus to body after failed submit), D2 (roles sideways scroll at 390px), D3 (applyAction reset_focus undid focus return) fixed in `ba28e7c`, verified live on 5173 with negative controls.
- `pnpm check` on `ba28e7c`: 0 errors, 1 old CalculatorWindow warning.
- AC-S5.2: cross-month e2e 4/4 green. NC-T5.3a went red (2 failed at dialog `toBeVisible`), NC-T5.3b went red (1 failed at Name `toBeFocused`). Both files restored byte-identical, final run 4/4.
- 11.7 impeccable audit: detector 0 findings on 40 changed files (planted side-tab flagged as a control). Non-blocking items in `backlog/surfaces-fields-open-period-followups_NOTE_15-09-26.md` (`6c6d76e`). D4 moved there.
- Still owed: owner click-through of the seven pages in both themes.
