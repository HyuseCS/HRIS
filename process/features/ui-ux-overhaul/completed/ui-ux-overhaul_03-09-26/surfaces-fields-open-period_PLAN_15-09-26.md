---
name: plan:surfaces-fields-open-period
description: "One canonical card surface over the re-scanned bare boxes, 3:1 field edges in both themes via the token layer, list pages with filter + table + pagination in one container, and the Open Period modal with a result toast. 11 sections split by non-overlapping file ownership."
date: 15-09-26
feature: ui-ux-overhaul
---

# Surfaces, Field Edges, Open Period Modal

**TL;DR** — Eleven sections, each owning its files outright, so EXECUTE can run the edit lanes in
parallel with no shared file. S1 retunes the tokens in `src/app.css` (blocked on the owner picking
one of three measured candidate sets live, gate **G0**). S2 moves the shared `Table` and
`TableSkeleton` from a ring to the border. S3–S10 sweep the bare boxes by route family and give
five list pages the one-container shape. S5 also turns Open Period into a modal with a toast. S11
is verification only: the full CI gate set, a built-bundle contrast measurement with a negative
control, screenshots, and an `impeccable` audit. The orchestrator commits one commit per section.

- **Date**: 15-09-26
- **Status**: PLANNED — PVL pending. No code changed.
- **Complexity**: COMPLEX (single plan, 11 sections, 11 commits, ~45 source files + 4 test files)
- **Feature**: ui-ux-overhaul
- **Branch**: `feat/uiux-phase-5`
- **Upstream (binding)**: `surfaces-fields-open-period_BRIEF_15-09-26.md` — its Owner rulings,
  Carve-outs and Anti-goals are not re-opened here.
- **Sources**: `backlog/surface-background-inconsistency_NOTE_04-09-26.md`,
  `backlog/settings-roles-no-container_NOTE_15-09-26.md`,
  `backlog/light-mode-fields-low-contrast_NOTE_15-09-26.md`,
  `backlog/open-period-modal-and-toast_NOTE_15-09-26.md`.
- **No SPEC file.** The brief is the upstream requirements document. Acceptance criteria below carry
  ids `AC-*` and every one names its proving gate.

---

## Overview

Three owner complaints from 15-09-26 have one root and one side-quest:

1. **Surfaces.** In light mode the page (98%), the card (100%) and the fields (edge 94%) are almost
   the same gray. 57 of the 58 bordered boxes in the 04-09-26 inventory still have no background, so
   they show the page through them beside filled cards. The shared `Table.svelte` uses a third
   treatment (a ring, no border).
2. **Field edges.** `--input` at 94% on a 100% card is **1.14:1** in light and **1.06:1** in dark
   (13% on 11%). WCAG 1.4.11 asks 3:1. 244 `border-input` uses in 60 files all read that one token.
3. **Open Period.** The inline "Open a Payroll Period" card becomes its own component shown in the
   house `Dialog`, and the `open` action reports its result as a toast.

Facts that shape the plan, all re-verified in the working tree on 15-09-26:

- **`.input` fills with `bg-input`** (`src/app.css:187`). Once `--input` becomes a 3:1 edge gray, a
  field using the `.input` class would be filled with that gray (a ~53% light-gray box, a ~43% box
  in dark). Its users are `profile/+page.svelte:166,173,185` and `dashboard/+page.svelte:345,355,358,378,384`.
  **S1 must switch `.input` to `bg-background`**, which is what the 244 inline fields already fill
  with. This is the only way "field fill stays what it is" holds.
- **Darkening the page gray drops text contrast.** `--muted-foreground` 45% on today's 98% page is
  4.56:1; on a 92% page it is 3.98:1. Every candidate set therefore darkens `--muted-foreground` too.
  The same measurement shows two **pre-existing** failures that the owner's criteria forbid:
  muted-foreground on `--muted` is **4.36:1** in light and **4.20:1** in dark today.
- **`.card`** (`src/app.css:240`, 21 users) is a fourth surface recipe: `bg-card shadow-sm ring-1`.
  The brief does not name it. It is an owner tick at G0 (see S1).
- **Pagination renders nothing on one page** (`src/lib/components/Pagination.svelte:28`,
  `{#if meta.total > meta.pageSize}`). A padded wrapper around it would leave an empty stripe. The
  list shape uses Tailwind 3.4's `has-[nav]:` variant so the padding and divider exist only when the
  `<nav>` renders (`package.json:60` pins `tailwindcss ^3.4.0`).
- **The `open` action returns nothing on success** (`payroll/periods/+page.server.ts:50-68`) and its
  failures carry no `action` key, so a failure writes `form.error` into the page-wide block at
  `+page.svelte:43-50` — which is hidden behind the modal backdrop.

### Owner rulings carried in (fixed — do not re-open)

| Id | Ruling (from the brief) |
|---|---|
| R1 | Canonical surface = `border` + card token. The card is a soft off-white, not pure white; the page moves far enough away that the card sits above it. |
| R2 | Sweep all 58 inventory boxes, minus the carve-outs. |
| R3 | Field edges reach 3:1 in light and dark, via the `--input` token, not per site. |
| R4 | List pages: the filter and the table (with pagination) share one container; table flush, filter row padded. |
| R5 | Open Period: modal, heading "Open a Payroll Period", Cancel/Escape close, focus returns, success toast + close, failure toast + stays open with values kept, `saved: 'Period opened.'`. |
| CO | Carve-outs: `requests/[id]` dashed row, `SectionList.svelte:40`, `TimesheetModal.svelte` dashed add button, `attendance` segmented control, `employees/[id]` Offboard box. |
| AG | Anti-goals: no pure-white card, no added shadows, no per-site border colour, no dark redesign, no new card component, the cross-month e2e keeps working. |
| LIVE | The owner picks the light values live from 2–3 candidates that all meet the targets. |

---

## Goal

Every panel reads as a surface above the page and every field edge is findable at a glance, in both
themes, at desktop and phone width — proven by measured contrast in the built bundle, not by reading
source — and Open Period is a modal that reports once, on a surface the user can see.

## Scope

**In scope (11 sections / 11 commits):**

| S | Owns (exclusive) | Commit subject |
|---|---|---|
| S1 | `src/app.css`, NEW `tests/unit/theme-token-contrast.test.ts` | `style(ui): retune light surfaces and give field edges 3:1 in both themes` |
| S2 | `src/lib/components/ui/Table.svelte`, `src/lib/components/ui/TableSkeleton.svelte` | `style(ui): give the shared table the card border instead of a ring` |
| S3 | `routes/(app)/employees/+page.svelte`, `employees/[id]/+page.svelte`, `employees/new/+page.svelte` | `style(employees): put employee panels on the card surface and contain the list` |
| S4 | `routes/(app)/payroll/+page.svelte`, `payroll/[id]/+page.svelte`, `lib/components/payroll/CalculatorPanel.svelte` | `style(payroll): put payroll panels and tables on the card surface` |
| S5 | `routes/(app)/payroll/periods/+page.svelte`, `payroll/periods/+page.server.ts`, NEW `lib/components/payroll/OpenPeriodDialog.svelte`, `tests/unit/payroll-period-feedback.test.ts`, `tests/unit/success-surfaces.test.ts`, `tests/e2e/period-picker-cross-month.spec.ts` | `feat(payroll): open a payroll period from a modal with a result toast` |
| S6 | `routes/(app)/settings/roles/+page.svelte`, `settings/holidays/+page.svelte`, `settings/org/+page.svelte`, `settings/org-chart/+page.svelte`, `settings/schedules/+page.svelte`, `settings/posting-approvers/+page.svelte` | `style(settings): contain the roles list and fill settings panels` |
| S7 | `routes/(app)/attendance/+page.svelte`, `team/+page.svelte`, `timesheets/+page.svelte`, `punch/+page.svelte`, `lib/components/timesheets/TimesheetModal.svelte` | `style(attendance): contain the team list and fill attendance and timesheet tables` |
| S8 | `routes/(app)/leave/+page.svelte`, `leave/balances/+page.svelte`, `benefits/+page.svelte`, `performance/+page.svelte`, `separations/+page.svelte`, `departments/+page.svelte`, `lib/components/performance/ReviewFormRender.svelte` | `style(ui): contain leave balances and fill leave, benefits, performance and separations surfaces` |
| S9 | `routes/(app)/recruitment/+page.svelte`, `recruitment/[id]/+page.svelte`, `recruitment/[id]/apply/+page.svelte`, `requests/+page.svelte`, `requests/[id]/+page.svelte`, `complaints/+page.svelte` | `style(ui): fill recruitment, requests and complaints surfaces` |
| S10 | `routes/(app)/reports/+page.svelte`, `reports/[type]/+page.svelte`, `reports/audit-log/+page.svelte` | `style(reports): contain the audit-log list and fill report tables` |
| S11 | `surfaces-fields-open-period_REPORT_15-09-26.md` + `surfaces-fields-open-period_screens/` in this task folder (no `src/`) | `docs(process): record the surfaces, field edges and open-period verification` |

All `routes/` paths are under `src/`. `lib/` paths are under `src/`.

**Explicitly OUT of scope (binding):**

- Migrating the hand-rolled tables to `Table.svelte` (brief, Direction A).
- Any change to `--popover`, `--secondary`, `--accent`, `--primary`, `--destructive` or any status
  colour. S11's audit looks at them on the new surfaces; a finding goes to backlog, not into S1.
- The nested boxes that already sit inside a filled surface (listed in the site table as `leave`).
- `Pagination.svelte`, `Dialog.svelte`, `ConfirmButton.svelte`, `submit-feedback.svelte.ts`,
  `PeriodPicker.svelte` — read, never edited.
- A committed source-scan gate for bare boxes (named in Test Infra Improvement Notes as a backlog
  stub, not built here).
- Any `.env` / `.env.dev` edit, `./start.sh`, vite or `veent-db-5434` start. The owner starts servers.
- `git push`.

---

## Ordering Constraints (binding)

```
G0 owner picks candidate set ─────────────────────► S1 tokens commit
                                                        │
S2 shared Table ──(fixes TableSkeleton `flush` prop)──┐ │
S3..S10 sweep lanes (parallel, disjoint files) ───────┼─┤
S5 Open Period modal (parallel, disjoint files) ──────┘ │
                                                        ▼
                     WAVE GATE: full CI set on the combined tree (no live probe running)
                                                        │
                            commits S2..S10 (one each, explicit paths), then S1
                                                        │
                                                        ▼
                S11 built-bundle contrast + screenshots + e2e + impeccable audit
                                                        │
                        blocking audit finding? ── yes ─► fix inside the owning section's files,
                                                          re-run wave gate, amend nothing: new commit
```

- S3 uses the `flush` prop that S2 adds to `TableSkeleton`. The prop's contract is fixed in this
  plan (S2 step 3), so S2 and S3 can run at the same time. S3's `pnpm check` result is only
  trusted after S2 has landed on disk.
- The edit lanes do NOT depend on G0: they change class strings, not token values. S1 is the only
  section that waits.
- The full gate set reads the whole tree, so it runs ONCE after every lane has returned, never
  inside a lane. Each lane runs only its scoped gates (below).
- `pnpm check`, `pnpm build` and the e2e suite (whose `webServer` runs `pnpm build`) stop the owner's
  dev server. They run only when no live probe is using the dev server **and** the owner has said
  the dev server may go down. Until then the safe stand-in is
  `pnpm exec svelte-check --tsconfig ./tsconfig.json`.

---

## Implementation Checklist

> **Repo rules inherited by EXECUTE.**
> 1. **No explanatory comments in shipped code.** The why goes in the commit message. Existing
>    comments stay unless this plan names them as made false by the change. `// ponytail:` is exempt.
> 2. **Re-grep every line anchor before editing.** Anchors are from the working tree at `825d3ff`.
> 3. **Class-string edits only** in S2–S4 and S6–S10, except the list-shape wrappers named per page.
>    No markup restructuring beyond what a step names. No new component except `OpenPeriodDialog`.
> 4. **Scoped lane gates** (run by the lane agent on its own files only):
>    `pnpm exec prettier --write <owned files>` then `pnpm exec prettier --check <owned files>`,
>    `pnpm exec eslint <owned files>`, plus the lane's named vitest file if any.
> 5. **Before returning, each lane greps its own diff for added comment lines:**
>    `git diff -U0 -- <owned files> | grep -E '^\+\s*(//|/\*|<!--)'` must print only `// ponytail:`
>    lines. (Read-only git; the orchestrator does all staging and committing.)

### The canonical recipes (the only class strings the sweep may use)

| Recipe | Classes added / removed | Used for |
|---|---|---|
| **FILL** | add `bg-card` to the existing `rounded-* border …` string; change nothing else | padded panels, table wrappers, empty-state wrappers |
| **LIST-SHAPE container** | a new wrapping `<div class="overflow-hidden rounded-lg border bg-card">` around the filter row, any tab/legend/summary row, the table block and `<Pagination>` | the five list pages in S3, S6, S7, S8, S10 |
| **LIST-SHAPE filter row** | the filter `<form>` loses any `rounded-* border bg-card` it had and gets `border-b p-4` | inside the container |
| **LIST-SHAPE table** | the table wrapper loses `rounded-* border` and keeps `overflow-x-auto` | inside the container |
| **LIST-SHAPE pagination** | `<Pagination>` is wrapped in `<div class="has-[nav]:border-t has-[nav]:px-4 has-[nav]:py-3">` | inside the container |
| **LIST-SHAPE empty box** | an empty-state box inside the container loses `rounded-* border` and keeps its fill and height | inside the container |

`overflow-hidden` is safe on every list container named below: each wrapped filter holds only native
`<input>`, `<select>` and links, and every dialog in these pages is `position: fixed` (`Dialog.svelte:147`),
which an `overflow-hidden` ancestor does not clip. Verified per page in its section.

### Per-site decision table (re-scanned 15-09-26)

Scan method: a Node script over every `.svelte` file under `src/`, matching any quoted class string
with `rounded`, `rounded-sm|md|lg|xl` and `border` or `border-dashed`, and no `bg-*` or `border-input`
token; element tag and nearest surfaced ancestor read from the file. Buttons, links, spans and
`<img>` were dropped (outline buttons are not surfaces). Composed classes: `class={…}` and template
literals were scanned too — **0** container hits. The `.card` `@apply` class and the `PILL` constant
in `settings/roles` are not bare boxes. The script lives in the EXECUTE scratchpad; S11 re-runs it
and pastes the output.

Decisions: **fill** = FILL recipe · **list** = LIST-SHAPE · **carve** = brief carve-out, no edit ·
**absorbed** = removed by the modal · **done** = already filled, no edit · **leave** = nested inside
an already-filled surface, no edit · **look** = not in the 04-09-26 inventory; default shown, the
S11 screenshot pass confirms.

#### Inventory sites (the 58 from 04-09-26)

| # | Grp | File | 04-09 line | Now | Decision | Section |
|---|---|---|---|---|---|---|
| 1 | A | `attendance/+page.svelte` segmented control | 245 | 327 | **carve** | S7 (no edit) |
| 2 | A | `complaints/+page.svelte` form | 99 | 86 | fill | S9 |
| 3 | A | `employees/[id]/+page.svelte` Update Profile | 494 | 549 | fill | S3 |
| 4 | A | `employees/[id]/+page.svelte` | 1493 | 1528 | fill | S3 |
| 5 | A | `employees/[id]/+page.svelte` Change Salary / Pay Type | 1595 | 1622 | fill | S3 |
| 6 | A | `employees/[id]/+page.svelte` Offboard `border-destructive/50` | 1812 | 1828 | **carve** | S3 (no edit) |
| 7 | A | `leave/new/+page.svelte` | 49 | 48 | **done** (`bg-card` already present) | — |
| 8 | A | `payroll/+page.svelte` form | 94 | 100 | fill | S4 |
| 9 | A | `payroll/periods/+page.svelte` inline Open form | 72 | 57 | **absorbed** (form moves into the Dialog panel, which is `bg-card`) | S5 |
| 10 | A | `recruitment/+page.svelte` Create Job Posting form | 107 | 112 | fill | S9 |
| 11 | A | `recruitment/[id]/+page.svelte` | 55 | 75 | fill | S9 |
| 12 | A | `recruitment/[id]/+page.svelte` Posted on | 141 | 163 | fill | S9 |
| 13 | A | `recruitment/[id]/+page.svelte` Hired Applicants | 216 | 306 | fill | S9 |
| 14 | A | `requests/[id]/+page.svelte` `<li>` | 225 | 207 | fill | S9 |
| 15 | A | `requests/[id]/+page.svelte` `<li>` | 372 | 347 | fill | S9 |
| 16 | A | `settings/holidays/+page.svelte` form | 68 | 69 | fill | S6 |
| 17 | A | `settings/org/+page.svelte` form | 58 | 60 | fill | S6 |
| 18 | A | `settings/org-chart/+page.svelte` tree | 141 | 141 | fill | S6 |
| 19 | A | `settings/schedules/+page.svelte` | 52 | 62 | fill | S6 |
| 20 | A | `settings/schedules/+page.svelte` | 76 | 86 | fill | S6 |
| 21 | A | `settings/schedules/+page.svelte` form | 130 | 140 | fill | S6 |
| 22 | A | `lib/components/payroll/CalculatorPanel.svelte` form | 86 | 97 | fill | S4 |
| 23 | A | `lib/components/performance/ReviewFormRender.svelte` section | 191 | 191 | fill | S8 |
| 24 | B | `attendance/+page.svelte` team-day table | 576 | 597 | fill | S7 |
| 25 | B | `attendance/+page.svelte` employee table | 732 | 819 | fill | S7 |
| 26 | B | `benefits/+page.svelte` | 139 | 143 | fill | S8 |
| 27 | B | `benefits/+page.svelte` | 245 | 252 | fill | S8 |
| 28 | B | `employees/+page.svelte` | 89 | 94 | **list** | S3 |
| 29 | B | `leave/+page.svelte` | 123 | 103 | fill | S8 |
| 30 | B | `leave/balances/+page.svelte` | 53 | 58 | **list** | S8 |
| 31 | B | `payroll/+page.svelte` | 127 | 132 | fill | S4 |
| 32 | B | `payroll/[id]/+page.svelte` | 154 | 198 | fill | S4 |
| 33 | B | `payroll/periods/+page.svelte` | 118 | 106 | fill | S5 |
| 34 | B | `performance/+page.svelte` | 43 | 35 | fill | S8 |
| 35 | B | `performance/+page.svelte` | 95 | 81 | fill | S8 |
| 36 | B | `performance/+page.svelte` | 136 | 122 | fill | S8 |
| 37 | B | `performance/+page.svelte` | 181 | 161 | fill | S8 |
| 38 | B | `recruitment/+page.svelte` | 160 | 165 | fill | S9 |
| 39 | B | `reports/+page.svelte` Payroll Summary | 181 | 182 | fill | S10 |
| 40 | B | `reports/[type]/+page.svelte` results | 232 | 232 | fill | S10 |
| 41 | B | `reports/audit-log/+page.svelte` | 139 | 140 | **list** | S10 |
| 42 | B | `requests/+page.svelte` | 379 | 342 | fill | S9 |
| 43 | B | `settings/holidays/+page.svelte` | 149 | 150 | fill | S6 |
| 44 | B | `settings/org/+page.svelte` | 115 | 117 | fill | S6 |
| 45 | B | `settings/org/+page.svelte` | 262 | 259 | fill | S6 |
| 46 | B | `settings/posting-approvers/+page.svelte` | 36 | 34 | fill | S6 |
| 47 | B | `settings/roles/+page.svelte` | 191 | 170 | **list** | S6 |
| 48 | B | `settings/schedules/+page.svelte` | 225 | 233 | fill | S6 |
| 49 | B | `timesheets/+page.svelte` | 127 | 126 | fill | S7 |
| 50 | B | `lib/components/timesheets/TimesheetModal.svelte` | 376 | 358 | fill (inside the modal's card; no visible change, done for one recipe) | S7 |
| 51 | C | `requests/[id]/+page.svelte` dashed `<li>` | 324 | 303 | **carve** | S9 (no edit) |
| 52 | C | `lib/components/performance/SectionList.svelte` | 40 | 40 | **carve** | — |
| 53 | C | `lib/components/timesheets/TimesheetModal.svelte` dashed add | 507 | 489 | **carve** | S7 (no edit) |
| 54 | D | `performance/+page.svelte` EmptyState wrapper | 123 | 109 | fill | S8 |
| 55 | D | `punch/+page.svelte` `<ul>` | 309 | 305 | fill | S7 |
| 56 | D | `separations/+page.svelte` table | 138 | 133 | fill | S8 |
| 57 | D | `settings/org-chart/+page.svelte` search results | 125 | 125 | fill | S6 |
| 58 | D | `lib/components/ui/TableSkeleton.svelte` | 10 | 10 | S2 recipe (below) | S2 |

Tally: fill 46 (A 19 · B 23 · D 4) · list 4 · carve 5 · absorbed 1 · done 1 · S2 recipe 1 = 58.
The fifth list page, `/team`, is a new site (below).

#### New sites the 04-09-26 scan missed (rounded-md, fieldsets, dashed)

| File:line (now) | What | Decision | Section |
|---|---|---|---|
| `employees/new/+page.svelte:81,129,155,224,393,456,491` | seven top-level `<fieldset class="rounded-md border p-4 space-y-4">` | **look → fill** | S3 |
| `recruitment/[id]/apply/+page.svelte:34,87` | two top-level fieldsets | **look → fill** | S9 |
| `departments/+page.svelte:151` | top-level table wrapper `rounded-md border` | **look → fill** | S8 |
| `complaints/+page.svelte:189` | top-level `overflow-hidden rounded-md border` list | **look → fill** | S9 |
| `team/+page.svelte:63,110,114` | filter form, empty box, table wrapper | **list** | S7 |
| `complaints/+page.svelte:237`, `complaints/[id]/+page.svelte:90`, `recruitment/[id]/+page.svelte:185,193`, `lib/components/recruitment/ApplicantKanban.svelte:172` | dashed empty/affordance boxes | **look → leave** (same rationale as group C; the brief's carve-out list is not widened) | no edit |
| `lib/components/performance/ReviewFormRender.svelte:168` | `divide-y rounded-md border` list inside the review form | **look → leave** | S8 (no edit) |
| `employees/[id]/+page.svelte:859,903,1423` | inside `bg-card` sections (`:856` etc.) | leave | no edit |
| `recruitment/[id]/+page.svelte:313` | rows inside site 13 | leave | no edit |
| `recruitment/applicant/[applicantId]/+page.svelte:142,300` | inside `bg-card` sections | leave | no edit |
| `branches:146`, `inventory:191`, `settings/leave-types:133`, `settings/pay-codes:47,130`, `settings/salary-grades:47,144` | table wrappers inside `space-y-3 rounded-lg border bg-card p-4` | leave | no edit |
| `profile/+page.svelte:236,274,317` | inside `.card` sections | leave | no edit |
| `dashboard/+page.svelte:339,373` | forms inside `.card` | leave | no edit |

### List pages (R4) — which have a filter, and what is applied

| Page | Filter row today | Applied |
|---|---|---|
| `/settings/roles` | GET form `:155` (text filter) above table `:170`, `<Pagination>` `:289` | **LIST-SHAPE** (S6) |
| `/employees` | GET form `:41` (search, branch, Add Employee link), tabs `:79`, `{#await}` table `:94`, `<Pagination>` `:170` | **LIST-SHAPE** (S3) |
| `/leave/balances` | GET form `:36` (search, department) above table `:58`; no pagination | **LIST-SHAPE** (S8) |
| `/team` | GET form `:63` (date range), legend `:98`, empty box `:110` / table `:114`; no pagination | **LIST-SHAPE** (S7) |
| `/reports/audit-log` | GET form `:51` (already its own `bg-card`), summary `<p>`, empty box / table `:140`, `<Pagination>` `:260` | **LIST-SHAPE** (S10) |
| `/attendance` | filters live inside the first `bg-card` panel `:245` together with the bulk-action bar; the table `:597`/`:819` sits ~250 lines later with the result panel and help text between | **fill only.** Not merged — see Open Questions Q2 |
| `/reports/[type]` | filter card `:123` (already `bg-card`), then a separate "Results" section with heading, CSV export and the table | **fill only.** Not merged — see Open Questions Q2 |
| `/reports` | a year `<select>` inside a section header, not a filter row | fill only |
| `/requests`, `/leave`, `/timesheets`, `/recruitment`, `/performance`, `/benefits`, `/payroll`, `/payroll/periods`, `/separations`, `/departments`, the settings tables | no filter row | fill only |

---

### S1 — Tokens (`src/app.css`) + token contrast unit test — **BLOCKED ON G0**

**Files:** `src/app.css`; NEW `tests/unit/theme-token-contrast.test.ts`.

#### The WCAG math (how every number below was computed)

A gray `hsl(0 0% L%)` resolves to 8-bit `c = round(L/100 × 255)`. Linearise `s = c/255` with
`s ≤ 0.04045 ? s/12.92 : ((s+0.055)/1.055)^2.4`. For a gray, relative luminance `Y` = that value.
Contrast = `(Y_light + 0.05) / (Y_dark + 0.05)`. Alpha layers (`bg-muted/50`) are composited in
8-bit sRGB before `Y`. Thresholds: field edge ≥ **3:1** (WCAG 1.4.11); body and muted text ≥ **4.5:1**
(1.4.3). Divider and card-vs-page are not WCAG thresholds; they are reported so the owner can see the
change.

Worked example, candidate B light `--input` 53% vs `--background` 94%:
`53% → 135 → 0.5294 → Y 0.2423`; `94% → 240 → 0.9412 → Y 0.8714`;
`(0.8714 + 0.05) / (0.2423 + 0.05) = 3.15:1` ✔.

#### Today (baseline, same math)

| Pair | Light (bg 98 · card 100 · muted 96 · border 89 · input 94 · fg 9 · mfg 45) | Dark (6 · 11 · 14 · 18 · 13 · 94 · 52) |
|---|---|---|
| input edge vs card | **1.14 FAIL** | **1.06 FAIL** |
| input edge vs background | **1.09 FAIL** | **1.19 FAIL** |
| card vs background | 1.04 | 1.12 |
| border vs card | 1.28 | 1.25 |
| muted-foreground on muted | **4.36 FAIL** | **4.20 FAIL** |
| muted-foreground on `muted/50` over card | 4.56 | **4.39 FAIL** |
| muted-foreground on card / background | 4.76 / 4.56 | 4.59 / 5.16 |
| foreground on card / background / muted | 17.94 / 17.17 / 16.42 | 14.91 / 16.74 / 13.64 |

#### The three light candidate sets (owner picks one at G0)

Only these six light tokens change: `--background`, `--card`, `--muted`, `--border`, `--input`,
`--muted-foreground`. `--card-foreground` and `--foreground` stay 9%.

| Token | Now | **A — soft** | **B — medium** | **C — strong** |
|---|---|---|---|---|
| `--background` | 98% | 96% (#F5F5F5) | 94% (#F0F0F0) | 92% (#EBEBEB) |
| `--card` | 100% | 99% (#FCFCFC) | 98.5% (#FBFBFB) | 98% (#FAFAFA) |
| `--muted` | 96% | 95.5% | 95% | 94% |
| `--border` | 89% | 87% | 86% | 85% |
| `--input` | 94% | 54% (#8A8A8A) | 53% (#878787) | 51% (#828282) |
| `--muted-foreground` | 45% | 42% | 41% | 40% |

| Pair (target) | A | B | C |
|---|---|---|---|
| input edge vs card (≥3) | 3.36 ✔ | 3.47 ✔ | 3.68 ✔ |
| input edge vs background (≥3) | 3.17 ✔ | 3.15 ✔ | 3.22 ✔ |
| input edge vs muted (info) | 3.14 | 3.21 | 3.37 |
| **card vs background** (separation) | 1.06 (today 1.04) | 1.10 | 1.14 |
| border vs card (divider, today 1.28) | 1.31 | 1.34 | 1.35 |
| border vs background | 1.23 | 1.21 | 1.18 |
| muted vs card (header band) | 1.07 | 1.08 | 1.09 |
| foreground on card / bg / muted (≥4.5) | 17.47 / 16.44 / 16.30 ✔ | 17.32 / 15.73 / 16.01 ✔ | 17.18 / 15.04 / 15.73 ✔ |
| muted-foreground on card (≥4.5) | 5.19 ✔ | 5.31 ✔ | 5.50 ✔ |
| muted-foreground on background (≥4.5) | 4.89 ✔ | 4.82 ✔ | 4.82 ✔ |
| muted-foreground on muted (≥4.5) | 4.85 ✔ | 4.90 ✔ | 5.04 ✔ |
| muted-foreground on `muted/50` over card (≥4.5) | 5.02 ✔ | 5.12 ✔ | 5.27 ✔ |

Recommendation for the owner: **B**. A barely moves the page (1.06 vs today's 1.04); C is the clearest
separation but puts the page at 92%, where `--accent` (94%, unchanged) hover fills on page-level
ghost buttons become *lighter* than the page.

#### Dark (one set, re-checked, not redesigned)

Only `--input` and `--muted-foreground` change. Card, page, muted and border keep today's relationship.

| Token | Now | New |
|---|---|---|
| `--input` | 13% | **43%** (#6E6E6E) |
| `--muted-foreground` | 52% | **56%** (#8F8F8F) |

| Pair (target) | Now | New |
|---|---|---|
| input edge vs card 11% (≥3) | 1.06 | **3.34 ✔** |
| input edge vs background 6% (≥3) | 1.19 | **3.76 ✔** |
| input edge vs muted 14% (info) | 1.03 | 3.04 |
| muted-foreground on card / bg (≥4.5) | 4.59 / 5.16 | 5.27 / 5.93 ✔ |
| muted-foreground on muted (≥4.5) | 4.20 | **4.80 ✔** |
| muted-foreground on `muted/50` over card (≥4.5) | 4.39 | **5.04 ✔** |
| foreground on card / bg / muted | 14.91 / 16.74 / 13.64 | unchanged |
| card vs background · border vs card | 1.12 · 1.25 | unchanged |

#### Gate G0 — owner picks, live (before S1 edits `src/app.css`)

1. The agent does NOT change `src/app.css` yet and does NOT open the owner's browser.
2. The agent gives the owner three exact console one-liners to paste into the DevTools console of
   **their own** `http://localhost:5173/settings/roles` tab (light theme), one per candidate. Each is
   six `document.documentElement.style.setProperty('--token', '0 0% N%')` calls, one per changed light
   token, with the N values from the candidate table. A reload undoes it. A fourth line restores
   today's values without a reload.
3. The owner looks at `/settings/roles` and `/employees/<any id>` with each candidate and answers
   three things. Ask with at most two options each, plain language:
   - **Q-G0a** Which light set: A, B or C? (recommend B)
   - **Q-G0b** Move the `.card` class (dashboard, profile — 21 uses) from its ring to the same border?
     Yes makes every surface one recipe and makes the dashboard's existing `hover:border-primary/40`
     visible for the first time. No keeps `.card` as it is. (recommend Yes)
   - **Q-G0c** Accept the dark `--muted-foreground` 52% → 56%? It fixes a failing 4.20:1 and is the
     only dark text change. (recommend Yes)
4. Record the three answers verbatim in the S11 report before S1 is edited.

If the owner rejects all three light sets, S1 stops and the agent computes a new set to the owner's
direction with the same math. S1 never ships a set whose table row has a FAIL.

#### S1 steps (after G0)

1. `:root` — set the six light tokens to the chosen set, written as `0 0% N%`.
2. `.dark` — `--input: 0 0% 43%`; `--muted-foreground: 0 0% 56%` (only if Q-G0c = yes; if no,
   leave 52% and record the pre-existing 4.20:1 as a backlog note in S11).
3. `.input` (`:186-188`) — replace `bg-input` with `bg-background`. Nothing else in the `@apply` line.
4. If Q-G0b = yes: `.card` (`:240`) — replace `ring-1 ring-black/[0.12] dark:ring-white/10` with
   `border`. Keep `shadow-sm dark:shadow-none`. Its comment block at `:233-239` describes the ring
   and the 98%/100% values; rewrite those sentences so they are true for the border and the chosen
   values. Do not add new comment lines.
5. Grep the other comments in `src/app.css` for the literal old values (`98%`, `100%`, `96%`, `94%`,
   `89%`, `45%`, `13%`, `52%`). The `.badge-gray` comment at `:176-180` states `bg-muted` is 96% in light;
   correct the number. Do not rewrite anything else.
6. NEW `tests/unit/theme-token-contrast.test.ts`: read `src/app.css` from disk, parse the `:root` and
   `.dark` blocks for `--background`, `--card`, `--muted`, `--border`, `--input`, `--foreground`,
   `--muted-foreground` (gray `0 0% N%` values only), compute contrast with the math above (8-bit
   rounding included), and assert, per theme: input vs card ≥ 3, input vs background ≥ 3; foreground
   and muted-foreground on card, background and muted ≥ 4.5; muted-foreground on `muted/50` over card
   ≥ 4.5; card is lighter than background in light and in dark; `.input`'s `@apply` line contains
   `bg-background` and not `bg-input`. It also asserts the parser found all seven tokens in both
   blocks (so a renamed selector goes red instead of passing on zero tokens).
7. Negative controls (each run, seen red, restored, output pasted into the S11 report):
   - NC-S1a: set light `--input` back to `0 0% 94%` → the input-edge assertions go red.
   - NC-S1b: set dark `--muted-foreground` back to `0 0% 52%` → the muted-on-muted assertion goes red.
   - NC-S1c: rename `.dark {` to `.darkx {` → the "found all seven tokens" assertion goes red.
   - NC-S1d: put `bg-input` back in `.input` → red.

**Acceptance criteria (each can fail).**

- `AC-S1.1` — G0 answers are recorded before `src/app.css` changes (report timestamp order).
- `AC-S1.2` — `pnpm vitest run tests/unit/theme-token-contrast.test.ts` exits 0 on the chosen set, and
  all four negative controls went red.
- `AC-S1.3` — no token outside the six light and two dark tokens changed: `git diff -- src/app.css`
  touches only those lines, `.input`, and (if Q-G0b) `.card` and its comment, and the `.badge-gray`
  number.
- `AC-S1.4` — built-bundle measurement in S11 matches the table for the chosen set to ±0.02.

---

### S2 — Shared `Table.svelte` + `TableSkeleton.svelte`

**Files:** `src/lib/components/ui/Table.svelte`, `src/lib/components/ui/TableSkeleton.svelte`.
Consumers of `Table`: `payslips/+page.svelte`, `settings/backup/+page.svelte` (read only).
Consumers of `TableSkeleton`: `employees/+page.svelte:92`, `timesheets/+page.svelte:229,239`,
`reports/[type]/+page.svelte:216`.

1. `Table.svelte:48` (empty wrapper), `:60` (desktop wrapper), `:111` (mobile `<li>`): replace
   `ring-1 ring-black/[0.12]` and `dark:ring-white/10` with `border`. Keep `rounded-lg bg-card`, and on
   `:60` keep `hidden overflow-x-auto sm:block`, on `:111` keep `p-3`.
2. `TableSkeleton.svelte:10`: `rounded-lg border` → `rounded-lg border bg-card` when not flush.
3. `TableSkeleton.svelte`: add one optional prop `flush?: boolean` (default `false`) to the existing
   `$props()` destructure. When `flush` is true the outer `<div>` carries no `rounded-lg`, no `border`
   and no `bg-card` (it sits flush inside a LIST-SHAPE container). When false it renders exactly as
   step 2. Inner header band and rows unchanged.
4. Scoped gates (repo rule 4). Negative control NC-S2: none needed for a class swap; S11's computed
   style check on `/payslips` asserts `border-top-width: 1px` on the desktop wrapper and a
   `box-shadow` of `none` (no ring), and on the `/employees` loading skeleton asserts `border-top-width: 0px`.

**Acceptance criteria.**

- `AC-S2.1` — `grep -n "ring-black\|ring-white" src/lib/components/ui/Table.svelte` prints nothing.
- `AC-S2.2` — `/payslips` desktop table wrapper computed `border-top-width` is `1px` and
  `box-shadow` is `none` in the built bundle (S11).
- `AC-S2.3` — `TableSkeleton` without `flush` renders a bordered card; with `flush` it renders no
  border (S11 computed style on `/employees` while the list streams; if the stream is too fast to
  catch, S11 renders the page with the network throttled via CDP `Network.emulateNetworkConditions`).

---

### S3 — Employees family

**Files:** `employees/+page.svelte`, `employees/[id]/+page.svelte`, `employees/new/+page.svelte`.

1. `employees/[id]` — FILL sites 3, 4, 5 (`:549`, `:1528`, `:1622`). **Do not touch `:1828`** (carve-out).
   Do not touch `:859`, `:903`, `:1423` (leave).
2. `employees/new` — FILL the seven fieldsets (`:81,129,155,224,393,456,491`).
3. `employees` — LIST-SHAPE:
   - one container `<div>` from the GET `<form>` (`:41`) through `<Pagination>` (`:170`), inside the
     page's existing `space-y-6` wrapper;
   - the form gets `border-b p-4` (it keeps `flex flex-wrap gap-2`);
   - the tabs row (`:79`, `flex gap-1 border-b`) gets `px-4`, keeps its `border-b`;
   - `{#await}` pending: `<TableSkeleton rows={6} cols={6} flush />`;
   - table wrapper `:94` → `overflow-x-auto` (drop `rounded-lg border`);
   - `{:catch}` `<LoadError>` is wrapped in `<div class="p-4">`;
   - `<Pagination>` gets the LIST-SHAPE pagination wrapper.
   - overflow check: the form holds one `<input>`, one `<select>` and one `<a>`; no popover. ✔
4. Scoped gates. The existing e2e specs that open `/employees` find rows by text and click links; no
   locator depends on the wrapper classes (verify with
   `grep -rn "rounded-lg border\|overflow-x-auto" tests/e2e` before and after — must print the same).

**Acceptance criteria.**

- `AC-S3.1` — Update Profile and Change Salary / Pay Type panels compute the same
  `background-color` as the neighbouring `bg-card` section, both themes (S11).
- `AC-S3.2` — the Offboard box still computes a transparent background and a `border-destructive/50`
  border colour (S11 negative control for the sweep: the carve-out did not get filled).
- `AC-S3.3` — `/employees` filter, tabs, table and pagination share one element with a 1px border and
  `bg-card`; the table has no border of its own (S11 computed style).

---

### S4 — Payroll family (not periods)

**Files:** `payroll/+page.svelte`, `payroll/[id]/+page.svelte`, `lib/components/payroll/CalculatorPanel.svelte`.

1. `payroll/+page.svelte` — FILL `:100` (form) and `:132` (table wrapper).
2. `payroll/[id]/+page.svelte` — FILL `:198`.
3. `CalculatorPanel.svelte` — FILL `:97`.
4. Scoped gates.
   `tests/e2e/period-picker-cross-month.spec.ts:53` locates `form[action="?/create"]` on `/payroll`;
   the attribute is unchanged. ✔

**Acceptance criteria.**

- `AC-S4.1` — `/payroll` create-run form and runs table compute `bg-card` in both themes (S11).

---

### S5 — Open Period modal + periods sweep

**Files:** `payroll/periods/+page.svelte`, `payroll/periods/+page.server.ts`, NEW
`lib/components/payroll/OpenPeriodDialog.svelte`, `tests/unit/payroll-period-feedback.test.ts`,
`tests/unit/success-surfaces.test.ts`, `tests/e2e/period-picker-cross-month.spec.ts`.

#### Decision: how the page-wide `form?.error` block stops being the only (hidden) surface for `open`

The `open` action tags every result with `action: 'open'`, and the page-wide block renders only when
the error is not from `open`. The modal's failure toast is then the one surface for `open`.
Release and void keep their current behaviour exactly (their failures carry no `action` key, so the
block still renders for them — known gap 2 in `success-surfaces.test.ts` is unchanged, not widened).

Rejected: suppressing `update()` on failure inside the dialog via `submitFeedback({ inner })`. It
works, but it silently opts one form out of the documented "failure still calls `update()`" contract
(`submit-feedback.svelte.ts:13-14,88-90`), and a source reader cannot see why the page block never
fires. The `action` tag is visible in the server file and in the page condition, and a unit test can
pin it.

#### Server — `payroll/periods/+page.server.ts`

1. `toFail` (`:34-40`) gains an optional second parameter `action?: string`. When it is passed, the
   fail payload is `{ action, error }`; when it is not, the payload is exactly `{ error }` as today
   (no `action` key at all — do not write `action: undefined`).
2. `open` (`:50-68`):
   - the zod failure (`:53`) returns `fail(400, { action: 'open', error: 'Invalid period details' })`;
   - the catch (`:65-67`) returns `toFail(e, 'open')`;
   - after the `try`, return `{ action: 'open', saved: 'Period opened.' }`, same shape as release
     (`:110`) and void (`:121`).
3. Do not touch any other action.

#### Component — NEW `src/lib/components/payroll/OpenPeriodDialog.svelte`

Model: `NewTimesheetDialog.svelte` for the `bind:open` prop shape; `recruitment/[id]/+page.svelte:44-48,268-300`
for Dialog + form + `submitFeedback({ onSuccess })`.

1. Props: `let { open = $bindable() }: { open: boolean } = $props()`.
2. Imports: `enhance` from `$app/forms`, `Dialog` from `$lib/components/ui/Dialog.svelte`,
   `PeriodPicker` from `$lib/components/ui/PeriodPicker.svelte`, `submitFeedback` from
   `$lib/utils/submit-feedback.svelte`.
3. `const openPeriod = submitFeedback({ onSuccess: () => { open = false } })` — no `success` option,
   so the toast text is the server's `saved` string. No `error` option, so a failure toasts
   `data.error`. **No `$effect` anywhere reads `form` or raises a toast** (the
   `effect_update_depth_exceeded` trap).
4. `<Dialog bind:open labelledBy="open-period-title" size="wide">` — `wide` because the non-compact
   `PeriodPicker` segmented control needs ~545px (`period-picker-cross-month.spec.ts:34-35`) and the
   brief moves the picker as it is. Default `zIndex` 60 (the toaster is `z-[100]`,
   `Toaster.svelte:54`, so the error toast shows above the backdrop).
5. Body, moved from `+page.svelte:59-88` as it is, with only these changes:
   - `<h2 id="open-period-title" class="text-lg font-semibold">Open a Payroll Period</h2>`;
   - the `<form>` keeps `method="POST" action="?/open"`, uses `use:enhance={openPeriod.enhance}`, and
     its class becomes `mt-4 space-y-4` (no border, no padding — the Dialog panel is the surface);
   - the Name input keeps `id="name" name="name" required placeholder="Jul 1–15 2026"` and its classes;
   - `<PeriodPicker startName="start" endName="end">` with the same `actions` snippet;
   - Cancel: `type="button"`, `onclick={() => (open = false)}`;
   - Open: `type="submit"`, `disabled={openPeriod.busy}`, label `{openPeriod.busy ? 'Opening…' : 'Open'}`,
     same classes.
6. Behaviour this produces (no extra code needed; each is a probe row in S11):
   - success → `onSuccess` closes the Dialog → toast "Period opened." → `update()` invalidates → the
     new row renders;
   - failure → error toast with the server message → `update()` does not reset a form on failure, and
     the Dialog stays open, so typed values stay;
   - Cancel / Escape / backdrop → `open = false` → Dialog restores focus to the element focused at
     open, which is the trigger (`Dialog.svelte:82-87`);
   - reopen → Dialog's `{#if open}` re-mounts the form empty.

#### Page — `payroll/periods/+page.svelte`

1. Remove the `{#if showOpen} … {/if}` block (`:52-90`).
2. Remove `const openPeriod = createSubmitGuard()` (`:17`) and its `#108` comment (`:16`) — the guard
   now lives in the component via `submitFeedback`, which wraps `createSubmitGuard`. Keep the
   `createSubmitGuard` import: `guard()` (`:24-29`) still uses it.
3. Remove the `PeriodPicker` import (`:5`) — orphaned. Keep `enhance` (row forms use it).
4. Add `import OpenPeriodDialog from '$lib/components/payroll/OpenPeriodDialog.svelte'`.
5. Keep `let showOpen = $state(false)`. Trigger (`:98-103`): `onclick={() => (showOpen = true)}` (open,
   not toggle), add `type="button"`. Label stays exactly `Open Period`.
6. Render `<OpenPeriodDialog bind:open={showOpen} />` once, directly after the `</section>` at `:223`.
7. The page-wide block (`:43`): condition becomes `{#if form?.error && form.action !== 'open'}`. Body
   and classes unchanged.
8. FILL the table wrapper `:106`.
9. `ConfirmButton action="?/release"` and `action="?/void"` stay in this file with their messages
   (`destructive-confirms.test.ts:35,137-146` scans this file). Do not move them.

#### Tests

**T5.1 — `tests/unit/payroll-period-feedback.test.ts`** (add a `describe('payroll/periods ?/open feedback')`):

Add a body builder beside `event()` that sets `name`, `start`, `end` on a `FormData`
(`'Probe period'`, `'2027-03-01'`, `'2027-03-15'`) and reuses the same `locals` / `getClientAddress`.
`beforeEach` also sets `periodsMock.openPeriod.mockResolvedValue(undefined)`.

| Case | Assertion |
|---|---|
| success | result is exactly `{ action: 'open', saved: 'Period opened.' }` and `openPeriod` was called once with `organizationId 'org1'` and `name 'Probe period'` |
| 409 from the service | `mockRejectedValueOnce(httpError(409, 'A payroll run for this period already exists'))` → `status 409`, `data.error` that message, `data.action 'open'`, `data.saved` undefined |
| invalid body (name empty) | `status 400`, `data` exactly `{ action: 'open', error: 'Invalid period details' }`, `openPeriod` not called |
| release failure shape unchanged | the existing 409 release case additionally asserts `'action' in res.data` is `false` |

Negative controls (run, see red, restore, paste):
- NC-T5.1a: delete the `saved` line from `open` → the success case goes red.
- NC-T5.1b: call `toFail(e)` without `'open'` → the 409 case goes red on `data.action`.
- NC-T5.1c: make `toFail` always write `action` → the release "no action key" assertion goes red.

**T5.2 — `tests/unit/success-surfaces.test.ts`** (two new rows in `SITES`, after `payroll/periods void`):

| site | page | action | surface | expectServerSaved | present | absent |
|---|---|---|---|---|---|---|
| `payroll/periods open (modal)` | `lib/components/payroll/OpenPeriodDialog.svelte` | `open` | `toast` | `true` | `action="?/open"`, `use:enhance={openPeriod.enhance}`, `const openPeriod = submitFeedback(` | `NO_SUCCESS_BANNER` |
| `payroll/periods open (page)` | `routes/(app)/payroll/periods/+page.svelte` | `open` | `toast` | `true` | `<OpenPeriodDialog bind:open={showOpen} />`, `{#if form?.error && form.action !== 'open'}` | `NO_SUCCESS_BANNER` plus `action="?/open"` (the inline form must be gone from the page) |

`server` is `routes/(app)/payroll/periods/+page.server.ts` for both. `actionBlock` finds `open` because
it is declared as `\n\topen: async (` (`:50`).

Negative controls:
- NC-T5.2a: delete the `saved` line → both rows red.
- NC-T5.2b: paste the old inline `<form … action="?/open">` back into the page → the page row red.
- NC-T5.2c: add `<Banner kind="success"` to the component → the modal row red.
- NC-T5.2d: revert the page condition to `{#if form?.error}` → the page row red.

**T5.3 — `tests/e2e/period-picker-cross-month.spec.ts`**

1. Test at `:63-84`: after clicking `Open Period`, take
   `page.getByRole('dialog', { name: 'Open a Payroll Period' })`, assert it is visible, then run
   `fillCrossMonth(page)` unchanged, and scope `form` to `dialog.locator('form[action="?/open"]')`.
   Every existing assertion stays.
2. Add one read-only test in the same file: open the dialog, assert visible, press `Escape`, assert
   the dialog has count 0, assert the `Open Period` button is focused. Update the header comment's
   "No test here submits" sentence only if it becomes false (it does not — this test submits nothing).
3. Negative controls (run once in the S11 e2e window):
   - NC-T5.3a: change the trigger to `onclick={() => (showOpen = false)}` → both tests red at
     "dialog visible".
   - NC-T5.3b: in the Escape test, temporarily assert the Name input is focused instead → red (proves
     `toBeFocused` discriminates).

**Acceptance criteria.**

- `AC-S5.1` — `pnpm vitest run tests/unit/payroll-period-feedback.test.ts tests/unit/success-surfaces.test.ts tests/unit/destructive-confirms.test.ts`
  exits 0; NC-T5.1a–c and NC-T5.2a–d went red.
- `AC-S5.2` — cross-month e2e (both periods tests) green in the S11 e2e window; NC-T5.3a–b went red.
- `AC-S5.3` — live: empty Name + Open → native required message, no request (Network panel / CDP
  request log shows no POST to `?/open`).
- `AC-S5.4` — live: duplicate range → error toast with the server message, dialog still open, Name
  and dates still hold the typed values, page-wide red block count 0.
- `AC-S5.5` — live: valid marker period → dialog closes, one success toast "Period opened.", the
  marker row appears, page-wide red block count 0, polite live region sampled for 4s shows exactly one
  success message.
- `AC-S5.6` — live: Escape and Cancel both close and return focus to `Open Period`.
- `AC-S5.7` — `/payroll/periods` table wrapper computes `bg-card` (S11).

---

### S6 — Settings

**Files:** `settings/roles/+page.svelte`, `settings/holidays/+page.svelte`, `settings/org/+page.svelte`,
`settings/org-chart/+page.svelte`, `settings/schedules/+page.svelte`, `settings/posting-approvers/+page.svelte`.

1. `settings/roles` — LIST-SHAPE:
   - one container from the GET `<form>` (`:155`) through `<Pagination>` (`:289`);
   - form gets `border-b p-4`;
   - table wrapper `:170` → `overflow-x-auto`;
   - pagination wrapper;
   - the `{#if editing}` role editor `Dialog` (`:292+`) stays outside the container, unchanged;
   - overflow check: form holds one `<input>` and one `<button>`. ✔
2. `settings/holidays` — FILL `:69`, `:150`.
3. `settings/org` — FILL `:60`, `:117`, `:259`.
4. `settings/org-chart` — FILL `:125`, `:141`.
5. `settings/schedules` — FILL `:62`, `:86`, `:140`, `:233`.
6. `settings/posting-approvers` — FILL `:34`.
7. Scoped gates plus `pnpm vitest run tests/unit/success-surfaces.test.ts tests/unit/destructive-confirms.test.ts`
   (both scan `settings/roles`; their needles are `ConfirmButton` markup this section does not touch).

**Acceptance criteria.**

- `AC-S6.1` — `/settings/roles`: filter, table and pagination share one bordered `bg-card` element;
  the filter input's border colour computes to `--input` and measures ≥3:1 against that element's
  background (S11 — this is the owner's named page).
- `AC-S6.2` — every settings site above computes `bg-card` (S11 spot-check: one per file).

---

### S7 — Attendance and time

**Files:** `attendance/+page.svelte`, `team/+page.svelte`, `timesheets/+page.svelte`, `punch/+page.svelte`,
`lib/components/timesheets/TimesheetModal.svelte`.

**Entry check:** `phase-05-remediation-B-attendance_PLAN_11-09-26.md` is still `PLANNED` and owns
attendance files. Before editing, confirm with `git status --short -- 'src/routes/(app)/attendance'`
that no one has uncommitted work there. If there is, stop this lane and report the one-sentence
blocker; the other lanes continue.

1. `attendance` — FILL `:597`, `:819`. **Do not touch `:327`** (carve-out). No other edit.
2. `team` — LIST-SHAPE:
   - one container from the GET `<form>` (`:63`) through the `{/if}` that closes the table block;
   - form: drop `rounded-md border`, keep `p-4`, add `border-b`;
   - legend `<div>` (`:98`): add `border-b px-4 py-3`;
   - empty box (`:110`): drop `rounded-md border`, keep `bg-muted/50`;
   - table wrapper (`:114`): drop `rounded-md border`, keep `overflow-x-auto`;
   - no pagination on this page;
   - overflow check: two date `<input>`s and one `<a>`. ✔
3. `timesheets` — FILL `:126`.
4. `punch` — FILL `:305`.
5. `TimesheetModal.svelte` — FILL `:358`. **Do not touch `:489`** (carve-out).
6. Scoped gates plus `pnpm vitest run tests/unit/success-surfaces.test.ts` (it scans attendance needles
   at `saveAll`/`resetAll`/`resetDay`; unchanged).

**Acceptance criteria.**

- `AC-S7.1` — attendance segmented control still computes a transparent background (S11 negative
  control for the sweep).
- `AC-S7.2` — `/team` date filter, legend and table share one bordered `bg-card` element (S11).

---

### S8 — Leave, benefits, performance, separations, departments

**Files:** `leave/+page.svelte`, `leave/balances/+page.svelte`, `benefits/+page.svelte`,
`performance/+page.svelte`, `separations/+page.svelte`, `departments/+page.svelte`,
`lib/components/performance/ReviewFormRender.svelte`.

1. `leave` — FILL `:103`.
2. `leave/balances` — LIST-SHAPE: container from the GET `<form>` (`:36`) through the table's closing
   `</div>`; form gets `border-b p-4`; table wrapper `:58` → `overflow-x-auto`; no pagination.
   Overflow check: one `<input>`, one `<select>`, one `<button>`. ✔
3. `benefits` — FILL `:143`, `:252`.
4. `performance` — FILL `:35`, `:81`, `:109`, `:122`, `:161`.
5. `separations` — FILL `:133`.
6. `departments` — FILL `:151`.
7. `ReviewFormRender.svelte` — FILL `:191`. Leave `:168`.
8. Scoped gates.

**Acceptance criteria.**

- `AC-S8.1` — `/leave/balances` filter and table share one bordered `bg-card` element (S11).

---

### S9 — Recruitment, requests, complaints

**Files:** `recruitment/+page.svelte`, `recruitment/[id]/+page.svelte`, `recruitment/[id]/apply/+page.svelte`,
`requests/+page.svelte`, `requests/[id]/+page.svelte`, `complaints/+page.svelte`.

1. `recruitment` — FILL `:112`, `:165`.
2. `recruitment/[id]` — FILL `:75`, `:163`, `:306`. Leave `:185`, `:193`, `:313`.
3. `recruitment/[id]/apply` — FILL `:34`, `:87`.
4. `requests` — FILL `:342`.
5. `requests/[id]` — FILL `:207`, `:347`. **Do not touch `:303`** (carve-out).
6. `complaints` — FILL `:86`, `:189`. Leave `:237`.
7. Scoped gates.

**Acceptance criteria.**

- `AC-S9.1` — `requests/[id]` dashed row still computes a transparent background (S11 negative control).

---

### S10 — Reports

**Files:** `reports/+page.svelte`, `reports/[type]/+page.svelte`, `reports/audit-log/+page.svelte`.

1. `reports` — FILL `:182`.
2. `reports/[type]` — FILL `:232`. The filter card `:123` and the empty box are unchanged.
3. `reports/audit-log` — LIST-SHAPE:
   - one container from the GET `<form>` (`:51`) through `<Pagination>` (`:260`);
   - form: drop `rounded-lg border bg-card`, keep `flex flex-wrap items-end gap-3 p-4`, add `border-b`;
   - summary `<p>`: add `px-4 py-3`;
   - empty box: drop `rounded-lg border`, keep `flex h-40 items-center justify-center bg-muted/30 text-muted-foreground`, add `border-t`;
   - table wrapper `:140`: drop `rounded-lg border`, add `border-t`;
   - pagination wrapper;
   - overflow check: native `<select>`s, date `<input>`s, one `<button>`; the payload `<pre>`s inside
     cells scroll inside the table's own `overflow-x-auto`. ✔
4. Scoped gates.

**Acceptance criteria.**

- `AC-S10.1` — `/reports/audit-log` filter, summary, table and pagination share one bordered `bg-card`
  element (S11).

---

### S11 — Verification (no `src/` edits)

Runs in the main thread after every lane has returned. Writes only
`surfaces-fields-open-period_REPORT_15-09-26.md` and `surfaces-fields-open-period_screens/` in this
task folder.

#### 11.1 Wave gate (before any commit)

1. Re-run the site scan script. Every `fill`/`list` row must now show a `bg-card` or be gone; every
   `carve`/`leave` row must be unchanged. Paste the output.
2. Comment check over the whole wave: `git diff -U0 -- src tests | grep -E '^\+\s*(//|/\*|<!--)'`
   prints only `// ponytail:` lines.
3. Scope check: `git diff --name-only` lists only files in the Scope table.
4. Full CI gate set, in CI order, **only when no live probe is using the dev server and the owner has
   said it may go down** (`pnpm check` runs `svelte-kit sync`):
   `pnpm format:check` → `pnpm lint` → `pnpm check` → `pnpm test`.
   Before any edit, record the baseline of all four (lint warning count and file, `pnpm test` pass
   and file counts). A change in the pre-existing lint warning set, or a test-file count that moved by
   anything other than +1 (`theme-token-contrast.test.ts`), is a finding.
   If the dev server must stay up: `pnpm exec prettier --check .` (same as `format:check`), `pnpm lint`,
   `pnpm exec svelte-check --tsconfig ./tsconfig.json`, `pnpm test` — and the real `pnpm check` runs
   later in the e2e window before the last commit.
5. If a red `pnpm check`: run `pnpm prisma generate` first, then re-run.

#### 11.2 Commits (orchestrator only)

One commit per section in this order: S2, S3, S4, S5, S6, S7, S8, S9, S10, then S1 (after G0), then S11.
For each: `git add <the section's exact paths from the Scope table>` (never `git add -A`), then the
section's commit subject. No `Co-Authored-By`, no generated-by footer. No push.

#### 11.3 Built-bundle contrast measurement (both themes, with negative control)

Window: needs `pnpm build` + `pnpm preview --port 4173` (`playwright.config.ts:9,45`). Same dev-server
rule as 11.1. The agent drives its **own** Playwright browser context, never the owner's tab.

1. Log in with the e2e helper accounts (`tests/e2e/helpers` `login`, `USERS.admin`) against `:4173`.
2. Theme: `localStorage.setItem('theme', 'light')` then `page.reload()`; confirm with `body`'s computed
   `background-color`, not the class. Repeat with `'dark'`. The two themes must report different body
   colours, or the pass is void.
3. Pages and elements (computed style, alpha composited down to the first opaque ancestor):

   | Page | Element | Pair measured |
   |---|---|---|
   | `/settings/roles` | `body`; the LIST-SHAPE container; `#roles-q` `border-top-color`; `thead` fill; a muted-foreground `<th>` | input edge vs container; input edge vs body; container vs body; muted text on header band |
   | `/employees/<id>` | Update Profile form; neighbouring `bg-card` section; Offboard form; a field in Update Profile | FILL equals card; Offboard transparent; input edge vs card |
   | `/employees` | PageHeader description text | muted-foreground on body |
   | `/payroll/periods` | table wrapper; open dialog panel; `#name` border | card fill; input edge vs dialog panel |
   | `/payslips` | desktop `Table` wrapper | `border-top-width 1px`, `box-shadow none` (AC-S2.2) |
   | `/profile` | a `.input` field | fill equals `--background`, not `--input` (S1 step 3) |
   | `/attendance` | segmented control `:327` | transparent (AC-S7.1) |
   | `/requests/<id>` with a dashed row | dashed `<li>` | transparent (AC-S9.1) |
   | any page | injected `<div class="bg-muted text-muted-foreground">` (classes exist in the bundle) | muted-foreground on muted |

4. Assert each pair against its target and against the S1 table for the chosen set (±0.02).
5. **Negative control NC-11.3:** on `/settings/roles`, set
   `document.documentElement.style.setProperty('--input', '0 0% 94%')` (light) → the script must report
   the input-edge pair as FAIL at ~1.1:1. Reload → PASS again. Same in dark with `0 0% 13%`.
6. **Selector control:** before trusting any "transparent" result, inject a `bg-card` class onto the
   measured carve-out element in the live DOM, confirm the script now reads the card colour, then reload.
7. Paste the full table of measured ratios into the report.

#### 11.4 Screenshots (look at every one)

Light + dark × desktop 1528×900 + phone 390×844, saved as
`surfaces-fields-open-period_screens/<page>_<theme>_<width>.png`:
`/settings/roles`, `/employees`, `/employees/<id>`, `/payroll/periods`, `/payroll/periods` with the
Open Period dialog open, `/payroll`, `/reports/audit-log`. Also, one each in light desktop, every
`look` site from the new-sites table (`/employees/new`, `/recruitment/<id>/apply`, `/departments`,
`/complaints`). Write one line per screenshot in the report: what reads as surface, where the field
edges are, anything wrong. Check specifically the phone width of the dialog: the segmented period
control at ~545px inside a `max-w-lg` panel (Risk R4).

Human pass beside the machine pass: give the owner the exact list of the seven pages and ask them to
click through in their own browser, both themes.

#### 11.5 Open Period live probe (one step at a time; announce, run, report, wait)

Target: dev server, `admin@veent.ph`. Marker: period name `PROBE open-period 15-09-26`, custom range
`2031-02-02`–`2031-02-08` (far future, no seeded collision; confirm with
`docker exec -i veent-db-5434 psql -p 5434 -U veent -d veent_hris -tAc "select count(*) from payroll_periods where \"startDate\" <= '2031-02-08' and \"endDate\" >= '2031-02-02';"` = `0` first).

1. Open → empty Name → Open → native required message, no POST (AC-S5.3).
2. Name the marker, set the range, Open → toast, dialog closes, row present (AC-S5.5). psql:
   one row with the marker name.
3. Open again with the same range → 409 toast, dialog open, values kept, no page red block (AC-S5.4).
   Record the actual status and message (the brief calls it a 409; the service's overlap guard may
   answer 400 — record what it is, do not assume).
4. Escape, then reopen and Cancel → closed, focus on trigger (AC-S5.6).
5. Cleanup **by marker only**: delete the marker period and its run by matching the exact name, in
   one transaction, after reading the ids back. Never by date range or by actor. Paste before/after counts.

#### 11.6 E2E window

With the owner's go-ahead for the dev server to go down:
`CI=1 pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/period-picker-cross-month.spec.ts`
(never `pnpm test:e2e -- <spec>`, which silently runs all specs). Then NC-T5.3a–b.

#### 11.7 `impeccable` audit

After 11.1–11.6 are green, load the `impeccable` skill in the main thread and run its audit on the
seven screenshot pages plus the dialog, both themes. Also look at the brief's named inherited edges:
`reports/[type]` Export CSV outline button, `FileInput.svelte:122,154` dropzone and tile,
`ReviewFormRender.svelte:76` dashed placeholder, and the ~10 `rounded border-input` checkboxes.
Triage every finding: **blocking** (breaks a brief ruling, a 3:1/4.5:1 target, or an anti-goal) →
fixed inside the owning section's files, wave gate re-run, a new commit on that section's subject
with `(audit)` appended; **non-blocking** → one backlog note in `process/features/ui-ux-overhaul/backlog/`.

**Acceptance criteria.**

- `AC-S11.1` — wave gate green in CI order; baseline recorded before edits.
- `AC-S11.2` — every measured pair meets target in both themes; NC-11.3 went red and back.
- `AC-S11.3` — screenshots exist for every named page × theme × width and each has a written line.
- `AC-S11.4` — impeccable audit run and triaged; zero open blocking findings.
- `AC-S11.5` — the probe marker row count after cleanup is 0, and no other `payroll_periods` row
  changed (count before = count after the probe, minus nothing).

---

## Touchpoints

| Area | Files | Change |
|---|---|---|
| Design tokens | `src/app.css` | 6 light + 2 dark token values, `.input` fill, optional `.card` edge |
| Shared UI | `ui/Table.svelte`, `ui/TableSkeleton.svelte` | ring → border; new `flush` prop |
| Payroll | `payroll/periods/+page.svelte`, `+page.server.ts`, NEW `payroll/OpenPeriodDialog.svelte`, `payroll/+page.svelte`, `payroll/[id]/+page.svelte`, `payroll/CalculatorPanel.svelte` | modal, `action`/`saved` payload, fills |
| Routes (class strings) | 30 route files listed per section | FILL / LIST-SHAPE |
| Tests | NEW `tests/unit/theme-token-contrast.test.ts`; `payroll-period-feedback.test.ts`; `success-surfaces.test.ts`; `e2e/period-picker-cross-month.spec.ts` | new gates and rows |
| Read only | `Dialog.svelte`, `ConfirmButton.svelte`, `Pagination.svelte`, `PeriodPicker.svelte`, `submit-feedback.svelte.ts`, `Toaster.svelte`, `destructive-confirms.test.ts`, `NewTimesheetDialog.svelte`, `recruitment/[id]/+page.svelte` | precedent and contracts |

## Public Contracts

| Contract | Before | After |
|---|---|---|
| `?/open` success payload | `undefined` | `{ action: 'open', saved: 'Period opened.' }` |
| `?/open` failure payload | `{ error }` (400 zod, 400/404/409 service) | `{ action: 'open', error }`, same statuses |
| `toFail(e)` | `fail(status, { error })` | unchanged when called with one argument; `toFail(e, action)` adds `action` |
| Other periods actions | unchanged | unchanged (release/void failure payload has no `action` key — pinned by T5.1) |
| `TableSkeleton` props | `rows`, `cols` | + `flush?: boolean` (default `false`) |
| `OpenPeriodDialog` | — | `open: boolean` (`$bindable`), no other props |
| CSS tokens | `--background/--card/--muted/--border/--input/--muted-foreground` light; `--input/--muted-foreground` dark | new values per G0; every `bg-*`/`border-*`/`text-*` utility on these tokens changes appearance app-wide |
| `.input` | fill `--input` | fill `--background` |
| `.card` (if Q-G0b) | ring | border |
| Accessible name of the dialog | — | "Open a Payroll Period" (`aria-labelledby`) — e2e depends on it |

No API route, schema, auth, RBAC or money logic changes. The `open` action keeps
`requirePayrollManage` first.

## Blast Radius

- **Files:** ~45 source files + 1 new component + 1 new test + 3 edited test files + 1 report.
- **Packages:** one (the SvelteKit app).
- **Risk class:** visual/app-wide (token change reaches every page), plus one form-action payload
  change. No high-risk class from the test-coverage list (no auth, billing computation, schema,
  public API, container, or secrets). The `open` action creates payroll periods; its logic is not
  touched, only its return payload.
- **Worst case:** a token set that passes the math but reads wrong somewhere unmeasured (for example
  `--accent` hover on the darker page). Caught by screenshots + audit; reverted by reverting the S1
  commit alone, which leaves the sweep correct under the old tokens.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| G0 owner pick recorded before S1 edit | Agent-Probe | AC-S1.1 (brief LIVE) |
| `pnpm vitest run tests/unit/theme-token-contrast.test.ts` + NC-S1a–d | Fully-Automated | AC-S1.2 (R3 in source) |
| `git diff -- src/app.css` line audit | Fully-Automated | AC-S1.3 |
| Built-bundle computed-style measurement, both themes, + NC-11.3 + selector control | Hybrid (precondition: `pnpm build` + `pnpm preview` on 4173, owner go-ahead) | AC-S1.4, AC-S2.2, AC-S2.3, AC-S3.1, AC-S3.2, AC-S3.3, AC-S4.1, AC-S5.7, AC-S6.1, AC-S6.2, AC-S7.1, AC-S7.2, AC-S8.1, AC-S9.1, AC-S10.1, AC-S11.2 (R1, R3, R4, CO) |
| `grep -n "ring-black\|ring-white" src/lib/components/ui/Table.svelte` empty | Fully-Automated | AC-S2.1 |
| Site scan re-run, pasted | Hybrid (precondition: scratch script) | R2, CO — every fill/list row filled, every carve/leave row unchanged |
| `pnpm vitest run tests/unit/payroll-period-feedback.test.ts` + NC-T5.1a–c | Fully-Automated | AC-S5.1 (R5 `saved`, failure tagged `open`, release/void unchanged) |
| `pnpm vitest run tests/unit/success-surfaces.test.ts` + NC-T5.2a–d | Fully-Automated | AC-S5.1 (one success surface for `open`; inline form gone; page block excludes `open`) |
| `pnpm vitest run tests/unit/destructive-confirms.test.ts` | Fully-Automated | AC-S5.1 (release/void confirms still in the page) |
| `CI=1 pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/period-picker-cross-month.spec.ts` + NC-T5.3a–b | Hybrid (precondition: build/preview, dev DB, owner go-ahead) | AC-S5.2 (AG: cross-month e2e keeps working; Escape + focus return) |
| Live probe 11.5 steps 1–5 with psql read-back and marker cleanup | Agent-Probe | AC-S5.3, AC-S5.4, AC-S5.5, AC-S5.6, AC-S11.5 |
| Screenshots light/dark × desktop/phone, each looked at + owner click pass | Agent-Probe | AC-S11.3 (R1 "reads as a surface", R4 shape, dialog on phone) |
| `impeccable` audit, triaged | Agent-Probe | AC-S11.4 (AG, inherited `border-input` edges) |
| `pnpm format:check` → `pnpm lint` → `pnpm check` → `pnpm test` | Fully-Automated | AC-S11.1 |
| `git diff -U0 -- src tests \| grep -E '^\+\s*(//\|/\*\|<!--)'` | Fully-Automated | owner rule: no explanatory comments |

Failing stubs (Fully-Automated rows, red-first for EXECUTE):

```
test("should keep the light --input edge at 3:1 or more against card and background", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: theme-token-contrast light input edge")
})
test("should keep muted-foreground at 4.5:1 or more on muted in both themes", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: theme-token-contrast muted text")
})
test("should return { action: 'open', saved: 'Period opened.' } on success", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: periods open saved string")
})
test("should tag a 409 from openPeriod with action 'open'", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: periods open failure tag")
})
```

What this coverage does NOT prove:

- The token unit test proves the numbers in `src/app.css`; it does not prove the built CSS uses them
  (a later layer could override). Only 11.3 proves that.
- 11.3 measures named elements on seven pages. It does not prove every one of ~290 bordered sites
  reads right; the scan proves the class strings, the screenshots prove the look.
- `success-surfaces.test.ts` is a source scan; it does not prove the toast renders or is read.
- The e2e does not submit, so it does not prove success/failure behaviour; 11.5 does, once, by hand.
- Nothing automated guards against a future bare box. Named residual below.

## Test Infra Improvement Notes

- **No committed gate for bare boxes.** The 11.1 scan is a scratch script. A committed
  `tests/unit/surface-recipe.test.ts` would need an ancestor-aware parser (the regex nesting heuristic
  mis-classified `employees/[id]:549` as nested during planning). Backlog stub to write in S11:
  `process/features/ui-ux-overhaul/backlog/surface-recipe-source-gate_NOTE_15-09-26.md`. Not a Known-Gap
  for this plan's developed behaviour: R2 is proven by the Hybrid scan + Hybrid measurement.
- **The token contrast test is new infrastructure** other theme work can reuse (for example
  `text-primary-fails-aa-in-dark_NOTE_04-09-26.md`).
- **Contrast measurement script** from 11.3 should be kept with the report so the next token change
  re-runs it instead of rewriting it (alpha compositing and theme-by-localStorage are the two traps).

## Risks and Mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | `.input` fields turn into gray boxes when `--input` darkens | S1 step 3 moves `.input` to `bg-background`; token test asserts it; 11.3 measures `/profile` |
| R2 | Darker page drops muted text below 4.5:1 | every candidate darkens `--muted-foreground`; table shows the math; token test guards it |
| R3 | `--accent` 94% hover becomes lighter than a 92% page (candidate C) | owner sees it at G0; audit looks at ghost-button hover on page background; backlog if non-blocking |
| R4 | Non-compact `PeriodPicker` (~545px) inside `max-w-lg` on phone overflows | same overflow exists in today's inline form on phone; 11.4 phone screenshot of the dialog; if it clips, the fix is `PeriodPicker compact` inside the dialog, which changes `fillCrossMonth` to `compact = true` — that is a plan change, surface it, do not do it silently |
| R5 | A LIST-SHAPE `overflow-hidden` clips a popover | each list page's filter was checked for native controls only (per section) |
| R6 | Two lanes edit one file | Scope table ownership is exclusive; the orchestrator checks `git diff --name-only` per lane against it |
| R7 | Full-tree gates run while a lane is mid-edit and go red for the wrong reason | full gates run once after all lanes return (11.1) |
| R8 | `pnpm check`/build/e2e stops the owner's dev server during their testing | owner go-ahead required; `svelte-check` stand-in meanwhile |
| R9 | Plan B attendance work collides with S7 | S7 entry check on `git status` of attendance; S7 is three class edits |
| R10 | A carve-out gets filled by a blind replace | per-site table lists them; 11.3 asserts all carve-outs transparent with a selector control |
| R11 | The probe's cleanup deletes someone's period | cleanup matches the exact marker name after reading ids back, never by range or actor |
| R12 | `has-[nav]:` not generated in the build | Tailwind 3.4 supports it; 11.3 checks pagination wrapper `border-top-width` on a page with 2+ pages (`/settings/roles` with page size exceeded, or `/reports/audit-log`) and `0px` height when absent |

## Rollback

- Every section is its own commit; revert the one that is wrong. S1 revert restores all token values
  and leaves the sweep correct (fills use `bg-card`, which exists in both token sets).
- S5 revert restores the inline form and the old action return; `success-surfaces.test.ts` and
  `payroll-period-feedback.test.ts` revert with it.
- No data migration. The only data written is the probe marker, removed in 11.5.

## Acceptance Criteria (plan level)

- `AC-P1` — every section's criteria met and evidence pasted in the report.
- `AC-P2` — the brief's anti-goals hold: no `bg-white`/100% card; `git diff` adds no `shadow-*`
  class; no `border-[#…]` or per-site border colour class added; dark `--card/--background/--muted/--border`
  unchanged; no new component other than `OpenPeriodDialog`.
- `AC-P3` — full CI gate set green in CI order on the final tree.
- `AC-P4` — no explanatory comments added.
- `AC-P5` — nothing pushed.

## Phase Completion Rules

- A section is `CODE DONE` when its lane returns with scoped gates green and no added comments.
- A section is `VERIFIED` only when the 11.1 wave gate is green on the combined tree, its commit
  exists, and every one of its `AC-*` rows has pasted evidence in the report (11.3 measurement,
  11.5 probe or 11.6 e2e where named). A green unit suite alone never makes a section VERIFIED.
- S1 cannot be `CODE DONE` before G0 is recorded.
- The plan is complete when AC-P1–AC-P5 hold and 11.7 has zero open blocking findings.

## Resume and Execution Handoff

1. **Selected plan file path:**
   `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/surfaces-fields-open-period_PLAN_15-09-26.md`
2. **Last completed phase or step:** PLAN written. No section started. Branch `feat/uiux-phase-5` at
   `825d3ff`, clean tree.
3. **Validate-contract status:** CONDITIONAL (outer-pvl, 15-09-26) — see `## Validate Contract`; E1-E8 binding.
4. **Supporting context files loaded:** `process/context/all-context.md` (router); the brief and the four backlog notes named at the top;
   `process/context/tests/all-tests.md`; `CLAUDE.md`; `phase-05-remediation-A-feedback-statutory_PLAN_11-09-26.md`
   (shape); `phase-03-design-system_PLAN_03-09-26.md` §8.3–8.4 (measurement and modal methods); the
   source files named in Touchpoints.
5. **Next step for a fresh agent:** run VALIDATE on this plan. After it: EXECUTE as parallel lanes
   (S2, S3, S4, S5, S6, S7, S8, S9, S10 at once — exclusive files), while the orchestrator runs G0 with
   the owner. Then S1, then 11.1 wave gate, commits, 11.3–11.7. Paste the `[PONYTAIL]` directive and
   the no-comments rule into every lane prompt, and grep each lane's diff for added comments before
   accepting it.

**Execution strategy (vc-agent-strategy-compare, simple mode):** score 2/7 (S7 5+ files; S3 more
than three directions counted as nine disjoint lanes). **Parallel subagents** for EXECUTE — nine lanes,
no mid-run talk needed because file ownership is exclusive. Model: sonnet for the class-string lanes
(S2–S4, S6–S10), opus for S5 (component + server + tests) and S1. VALIDATE: one validate agent
(sonnet). Agent count: 9 lanes + 1 S1 + orchestrator verification = 10 spawned. Cost guard not triggered.

## Validate Contract

Status: CONDITIONAL
Date: 15-09-26
date: 2026-09-15
generated-by: outer-pvl

Parallel strategy: parallel-subagents
Rationale: 2/7 signals (S7 5+ files; nine disjoint edit lanes). File ownership in the Scope table is
exclusive (checked: no file in two sections). Two read-only cross-lane test dependencies exist (E6).
Model: sonnet for S2-S4 and S6-S10, opus for S5 and S1.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC-S1.2 | light and dark `--input` edge >= 3:1 on card and background; text >= 4.5:1 on card, background, muted, muted/50; `.input` fills `bg-background` | Fully-Automated | `pnpm vitest run tests/unit/theme-token-contrast.test.ts` + NC-S1a-d (parser must accept decimals, E5) | B |
| AC-S1.3 | only the named token lines change | Fully-Automated | `git diff -- src/app.css` line audit | B |
| AC-S1.4, AC-S2.2, AC-S2.3, AC-S3.1-3, AC-S4.1, AC-S5.7, AC-S6.1-2, AC-S7.1-2, AC-S8.1, AC-S9.1, AC-S10.1, AC-S11.2 | built CSS resolves to the measured pairs; fills, list shapes and carve-outs compute as declared | Hybrid | 11.3 computed-style script on `pnpm build` + `pnpm preview --port 4173`, both themes, NC-11.3 + selector control (precondition: owner go-ahead for the dev server to go down) | B |
| AC-S2.1 | shared Table has no ring | Fully-Automated | `grep -n "ring-black\|ring-white" src/lib/components/ui/Table.svelte` prints nothing | B |
| AC-S5.1 | `?/open` returns `{ action: 'open', saved }`; failures tagged `open`; release/void failure has no `action` key | Fully-Automated | `pnpm vitest run tests/unit/payroll-period-feedback.test.ts` + NC-T5.1a-c | B |
| AC-S5.1 | one success surface for `open`; inline form gone from page; page block excludes `open` | Fully-Automated | `pnpm vitest run tests/unit/success-surfaces.test.ts` + NC-T5.2a-d | B |
| AC-S5.1 | release/void confirms stay in the periods page | Fully-Automated | `pnpm vitest run tests/unit/destructive-confirms.test.ts` (baseline 15-09-26: 3 files, 58 tests green) | A |
| AC-S5.2 | cross-month rename still posts `start`/`end` from the modal; Escape closes and focus returns | Hybrid | `CI=1 pnpm exec dotenv -e .env.dev -- playwright test tests/e2e/period-picker-cross-month.spec.ts` + NC-T5.3a-b | B |
| AC-S5.3-6, AC-S11.5 | required-field block, 409 toast with values kept, success toast + close, Escape/Cancel focus return, marker cleanup | Agent-Probe | 11.5 steps 1-5 with psql read-back, plus E4 select-Escape step | B |
| AC-S11.3, AC-S11.4 | every panel reads as a surface; field edges findable; dialog fits on phone | Agent-Probe | 11.4 screenshots + owner click pass + 11.7 impeccable audit | B |
| AC-S11.1, AC-P3 | full CI set green on the combined tree | Fully-Automated | `pnpm format:check` -> `pnpm lint` -> `pnpm check` -> `pnpm test` | B |
| AC-P4 | no explanatory comments added | Fully-Automated | `git diff -U0 -- src tests \| grep -E '^\+\s*(//\|/\*\|<!--)'` prints only `// ponytail:` | B |
| R2 residual | no committed gate stops a future bare box | Known-Gap (named residual, not a strategy) | none; backlog stub `surface-recipe-source-gate_NOTE_15-09-26.md` | D |

Failing stubs (Fully-Automated rows):

```
test("should keep the light --input edge at 3:1 or more against card and background", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: theme-token-contrast light input edge")
})
test("should keep the dark --input edge at 3:1 or more against card and background", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: theme-token-contrast dark input edge")
})
test("should keep muted-foreground at 4.5:1 or more on muted in both themes", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: theme-token-contrast muted text")
})
test("should parse a decimal token value such as 0 0% 98.5%", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: theme-token-contrast decimal parse")
})
test("should fill .input with bg-background and not bg-input", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: theme-token-contrast .input fill")
})
test("should return { action: 'open', saved: 'Period opened.' } on success", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: periods open saved string")
})
test("should tag a 409 from openPeriod with action 'open'", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: periods open failure tag")
})
test("should return exactly { action: 'open', error: 'Invalid period details' } for an empty name", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: periods open zod failure")
})
test("should keep the release failure payload free of an action key", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: release failure shape unchanged")
})
test("payroll/periods open (modal) reports as declared (toast)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: success-surfaces modal row")
})
test("payroll/periods open (page) reports as declared (toast)", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub: success-surfaces page row")
})
```

Legacy line form:
- tokens: Fully-automated: `pnpm vitest run tests/unit/theme-token-contrast.test.ts` | hybrid: 11.3 built-bundle measurement + `pnpm preview --port 4173` | agent-probe: G0 owner pick | known-gap: none
- shared table + sweep: Fully-automated: AC-S2.1 grep | hybrid: 11.1 site scan re-run + 11.3 | agent-probe: 11.4 screenshots, 11.7 audit | known-gap: committed bare-box gate (backlog D)
- open period: Fully-automated: `pnpm vitest run tests/unit/payroll-period-feedback.test.ts tests/unit/success-surfaces.test.ts tests/unit/destructive-confirms.test.ts` | hybrid: cross-month e2e | agent-probe: 11.5 live probe | known-gap: none

Dimension findings:
- Infra fit: PASS — dev-server rules (no `pnpm check`/build/e2e without the owner's go-ahead) are in 11.1/11.3/11.6; Tailwind is 3.4.19 so `has-[nav]:` is generated; Pagination's root is `<nav>` (`Pagination.svelte:29`); theme key `theme` matches `app.html:11`; probe SQL names match `@@map("payroll_periods")` and camelCase columns.
- Test coverage: CONCERN — the S3 step 4 e2e grep cannot fail (edits are in `src/`, so before and after always match, and real e2e locators use dot form such as `div.rounded-lg.border`, `multi-role-sod.spec.ts:110`); S6/S7 lane gates read `success-surfaces.test.ts`/`destructive-confirms.test.ts` while S5 edits that test and the periods page; the token parser must handle `98.5%`. Everything else can fail: T5.1 asserts call args and exact payloads, T5.2 needles are discriminating, NC-S1c goes red even though `html.dark {` (`app.css:87`) also contains `.dark {`.
- Breaking changes: PASS — `?/open` payload gains `action`/`saved`; only reader of `form` on the page is `+page.svelte:43,48`; release/void/import/generate/lock keep `{ error }`; SvelteKit ActionData makes `form.action` optional on every branch; no API route, schema, auth or money logic changes; e2e scan found no class/color locator on a swept page (hits are `/requests/approvals`, the settings index and a `border-l-4` card, none touched).
- Security surface: PASS — `requirePayrollManage` stays first in `open`; no trust boundary, secret or RBAC change; the probe deletes by exact marker name only. Not a high-risk class; no evidence pack required.
- S1 tokens (math): CONCERN — independently recomputed with 8-bit rounding: set B and the dark set match the plan to the hundredth on every listed pair; badges (green 6.08/5.60, red 5.17/4.71, yellow 5.86/5.40, blue 5.47/5.03 on B card/page), `badge-gray` fill (1.36 vs today 1.37), `--primary` text on B page (4.93) all hold. Unlisted pairs: set B puts `--accent` 94% EQUAL to `--background` 94% (1.00:1), so every `hover:bg-accent` on the page itself (for example `BackButton`, outline buttons outside cards) shows no hover fill — the plan's R3 says this only happens in C. Set A puts `--secondary` 96% equal to `--background` 96% (1.00:1). Dark `--muted-foreground` 56% on `--accent` 16% is 4.4985:1 (under 4.5; today 3.94) — no static `bg-accent` + muted-text site found, hover only. Today-table baseline numbers differ from 8-bit math by up to 0.04 (e.g. dark fg on card 14.95, not 14.91); the candidate tables are exact.
- S1 `border-input`/`bg-input` users: PASS — `bg-input` appears only in `.input` (`app.css:187`); `hsl(var(--input))` only in `tailwind.config.ts:25`; no `ring-input`/`divide-input`. Checkboxes with `rounded border-input` (e.g. `attendance:458`, `recruitment:176`) have no border width, so no visible change. `FileInput.svelte:122,154`, `ReviewFormRender.svelte:76`, `reports/[type]:192` get a 3:1 gray edge on a `bg-background` fill; 11.7 looks at them.
- S2 shared Table: PASS — anchors `Table.svelte:48,60,111` and `TableSkeleton.svelte:4,10` match; `flush` contract is fixed in the plan.
- S3 employees: CONCERN — anchors all match; the e2e grep in step 4 is vacuous (see Test coverage).
- S4 payroll: CONCERN — misses `payroll/[id]/+page.svelte:399`, the approval-chain step `<li>` whose inactive branch is `''` (bare box on the page, under `<div class="space-y-3">` at `:377`).
- S5 open period: CONCERN — server, toFail, 409 and unit tests are sound (exact duplicate range hits `error(409, ...)` in `periods.ts` before the overlap guard; failure `update()` does not reset a form and the Dialog stays mounted, so typed values stay). Defect: page step 6 puts `<OpenPeriodDialog>` after `</section>` at `:223`, INSIDE `<div class="space-y-6">` (`:36`-`:224`). The Dialog's fixed backdrop (`Dialog.svelte:128-129`) is then a `space-y-6` child and gets `margin-top: 1.5rem`, which with `inset-0` leaves a 24px strip at the top with no dim, no blur and no click-to-close. Precedent puts dialogs outside the root: `timesheets/+page.svelte:261-263`, `settings/roles/+page.svelte:292`. Escape inside an open native `<select>` (`PeriodPicker.svelte:164,172,182`) cannot be proven from source.
- S6 settings: PASS — anchors match; roles Dialog already outside the root.
- S7 attendance/time: PASS — anchors match; carve-out `:327` confirmed.
- S8 leave/benefits/performance: PASS — anchors match.
- S9 recruitment/requests/complaints: CONCERN — misses `requests/[id]/+page.svelte:375`, the approval-chain step `<li>` with an inactive `''` branch. It is in the SAME `<ol>` as `:347`, which the plan fills, so the list ships half filled. `requests/[id]:173` leave tiles use `bg-background` inside a `bg-card` section (`:163`) and turn into darker wells on B; look item only.
- S10 reports: PASS — anchors match; `reports/[type]:219` empty box (`bg-muted/30`) stays visually near the page next to a filled results table; look item for 11.4.
- S11 verification: PASS — measurement, negative controls and probe cleanup are concrete; the probe's `writeAuditLog` CREATE row remains after cleanup (E7).
- Plan structure: PASS — `validate-plan-artifact.mjs` 0 failures, 0 warnings; site tally 46+4+5+1+1+1 = 58 checks out; every "Now" line anchor re-verified on disk.

Execute-agent instructions (binding):

| # | Instruction | Trigger |
|---|---|---|
| E1 | S5 page step 6: render `<OpenPeriodDialog bind:open={showOpen} />` AFTER the root `</div>` (`+page.svelte:224`), not after `</section>`. Add the same to the 11.4 dialog screenshot check: the backdrop must cover the top 24px. | S5 entry |
| E2 | S9: in `requests/[id]/+page.svelte:375` change the inactive branch `''` to `'bg-card'`. S4: same change at `payroll/[id]/+page.svelte:399`. Add both to the 11.1 scan expectations. | S4, S9 entry |
| E3 | G0: tell the owner, in the Q-G0a text, that set B makes `--accent` equal the page, so hover on page-level ghost/outline buttons shows no fill, and set A makes `--secondary` equal the page. Correct R3 in the report. Do not change `--accent`/`--secondary` (out of scope); record the owner's answer. 11.7 looks at `BackButton` hover on the page. | G0 |
| E4 | 11.5: add a step — in the dialog, open the Period `<select>` popup, press Escape once: record whether the popup closes and the dialog stays open. If the dialog closes too, it is a non-blocking backlog note (same Dialog as `NewTimesheetDialog`), not an S5 edit. Use `exact: true` for any locator on the submit button named `Open`. | 11.5 |
| E5 | S1 token test: parse values with `(\d+(?:\.\d+)?)%`, locate blocks with `:root {` and a line-start `.dark {` match (not `html.dark {`). Add one more negative control: set light `--card` to `0 0% 98.5%` and confirm the parsed number is 98.5. | S1 |
| E6 | S6 and S7 run `success-surfaces.test.ts` / `destructive-confirms.test.ts` only after S5 has returned; a red from the S5 rows or the periods page during S5's edit is not a lane failure. | S6, S7 gates |
| E7 | S3 step 4: replace the grep with `grep -rnE "\.(rounded(-md\|-lg)?\|border\|bg-card\|bg-muted)\b\|overflow-x-auto" tests/e2e` and check each hit's page is not in S3-S10. Known hits today: `recruitment.spec.ts:70`, `backup-settings.spec.ts:82`, `multi-role-sod.spec.ts:110,123` — none on a swept page. | S3 step 4 |
| E8 | 11.5 cleanup: the audit log CREATE row for the marker stays. Record its id in the report; do not delete audit rows. | 11.5 step 5 |

Open gaps:
- no committed source gate for bare boxes: known-gap, backlog stub `surface-recipe-source-gate_NOTE_15-09-26.md` (resolution D)
- dark `--muted-foreground` on `--accent` 4.4985:1, hover-only: non-blocking, backlog note in S11 if 11.7 finds a static use
- pre-existing: `text-red-400` on `bg-destructive/10` error banner is 2.28:1 today, 2.10:1 on set B page (status colour, out of scope): backlog note in S11

What this coverage does NOT prove:
- `theme-token-contrast.test.ts`: the numbers in `src/app.css` only; not that the built CSS applies them, not `--accent`/`--secondary`/`--popover` pairs, not hover or focus states.
- `payroll-period-feedback.test.ts`: mocked service; proves payload shape, not that a period reaches Postgres or that a real overlap answers 400 vs 409.
- `success-surfaces.test.ts`: source text; not that the toast renders, is announced, or appears once.
- `destructive-confirms.test.ts`: confirm messages exist in source; not that confirm dialogs open.
- cross-month e2e: no submit; not success/failure behaviour, not phone width, not Escape inside an open `<select>`.
- 11.3 measurement: named elements on named pages; not every bordered site, not hover fills, not the approval-chain lists unless E2 adds them.
- 11.5 probe: one run by hand, admin role only, one browser.
- AC-S2.1 grep: the ring classes are gone from one file; not how the border looks.
- CI set: types, lint, format and unit tests; nothing visual.

Gate: CONDITIONAL (6 concerns, 0 FAILs; fixes carried as E1-E8, first pass)
Accepted by: orchestrator under the owner's standing instruction (15-09-26, "if validate is good, you can proceed to execute mode"), E1-E8 carried as binding execute instructions instead of a supplement cycle; E1, E2 and E3 spot-checked in source first. First-pass CONDITIONAL; concerns: (1) S5 dialog inside `space-y-6`, (2) missed approval-chain boxes `requests/[id]:375` and `payroll/[id]:399`, (3) set B `--accent` = page and set A `--secondary` = page not disclosed, (4) vacuous S3 e2e grep, (5) S6/S7 gates read files S5 edits, (6) token parser decimal and `html.dark` traps. Needs a PVL supplement cycle or explicit owner acceptance before EXECUTE.

Goal block: BRANCH B — `ui-ux-overhaul-umbrella_PLAN_03-09-26.md` carries `## Stable Program Goal` (line 79). No `## Autonomous Goal Block` is written to this plan. Reference for latest state: `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/ui-ux-overhaul-umbrella_PLAN_03-09-26.md`.

## Open Questions

1. **Q1 (G0, owner, blocking S1 only):** light set A/B/C; `.card` ring → border yes/no; dark
   muted-foreground 52→56 yes/no. Asked live, recorded in the report. Nothing else waits on it.
2. **Q2 (owner, at the screenshot pass, not blocking):** `/attendance` and `/reports/[type]` have
   filters but are left as fill-only, because their filter sits in a panel with other controls
   (attendance: bulk actions and a result panel between filter and table; reports: a separate Results
   section with a heading and CSV export). Merging them is a restructure, not a class change. If the
   owner wants R4 on them too, it is a follow-up in the owning section's files.
3. **Q3 (resolved in plan):** the `form?.error` block — `action: 'open'` tag + page condition. Recorded
   above with the rejected alternative.
4. **Q4 (resolved at probe, no owner input):** whether a duplicate range answers 409 or the overlap
   guard's 400. The probe records the real status; both paths are tagged `open` and toast.

---

**Next:** Say **'ENTER VALIDATE MODE'** to validate this plan before implementation.
