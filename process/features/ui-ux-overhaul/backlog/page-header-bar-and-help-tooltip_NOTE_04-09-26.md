---
name: note:page-header-bar-and-help-tooltip
description: "Turn PageHeader into a real bar with its own surface, a short one-line description and a `?` tooltip carrying the long copy — 10 of 34 descriptions run over 120 characters and one is 290"
date: 04-09-26
feature: ui-ux-overhaul
---

# Give PageHeader a surface, and put the long copy behind a `?`

**Status**: BACKLOG — owner ruling recorded, one conflict below needs settling first.
**Raised by**: the owner, 2026-09-04, in two parts:

> *"sub texts of some page descriptions are too long in my opinion need to change that into a
> tooltip similar to what was done with the `?` in the Create New Timesheet modal. Another thing
> is we should add a Header which will contain the title of the page and some info."*

Owner chose **both**, as one piece of work: a header bar with its own background and a rule under
it, holding the title, a short description, and a `?` that reveals the full text.

## Part 1 — the descriptions are too long. Measured.

34 pages pass a `description` to `PageHeader`.

| | Characters |
|---|---|
| Median | 72 |
| Over 120 | **10 pages** |
| Over 190 | **5 pages** |
| Longest | **290** |

The 290 is `settings/clearance-steps`: four sentences, wrapping to three lines above the fold on
every page load, on a page whose real content starts below it.

The five worst:

| Chars | Page |
|---|---|
| 290 | clearance steps |
| 224 | job boards |
| 214 | user roles |
| 202 | leave types |
| 199 | posting approvers |

**Threshold to write into the component's doc comment: one line, about 90 characters.** Anything
longer goes in the tooltip. That keeps the median-72 pages exactly as they are and only touches
the 10 outliers.

## Part 2 — the pattern to lift

`NewTimesheetDialog.svelte:37-58` already solved this, and it is pure CSS — no JS, no library:

```svelte
<div class="group absolute right-4 top-4">
	<button type="button" aria-describedby="nt-help" aria-label="About new timesheets"
		class="flex h-6 w-6 items-center justify-center rounded-full border text-xs …">?</button>
	<p id="nt-help" role="tooltip"
		class="pointer-events-none absolute right-0 top-8 z-10 w-72 rounded-md border bg-card p-3
		       text-xs opacity-0 shadow-lg transition-opacity
		       group-focus-within:opacity-100 group-hover:opacity-100">
		…the long copy…
	</p>
</div>
```

Hover **or** keyboard focus reveals it, and `aria-describedby` keeps it attached for a screen
reader whether or not it is visible. Extract it as `ui/HelpTooltip.svelte` taking an `id`,
`label` and the body text; `NewTimesheetDialog` then uses the extracted one rather than keeping a
second copy.

Two things the extraction must not drop: `aria-describedby` on the button, and
`group-focus-within` alongside `group-hover`. A hover-only tooltip is unreachable by keyboard and
fails the same accessibility bar the rest of phase 03 was measured against.

## Part 3 — the bar

`PageHeader.svelte` currently renders a bare `<div>` with no surface. The ask is a real header
bar: its own background, a rule under it, title and short description on the left, `?` on the
right.

Whatever background it takes must be the **same** canonical surface issue #20 settles. Do not
pick one here — a new header bar with a fourth surface treatment makes that issue worse. **This
work is blocked on issue #20's canonical-surface ruling.**

Measure the header text against the chosen surface in both themes. `text-muted-foreground` on
`bg-muted` already failed once in phase 03 at 4.34 light / 4.20 dark, which is why the badge
tokens moved to `text-foreground/70`.

## The conflict — settle this before writing code

The owner's chosen layout puts an action button in the bar:

```
+-------------------------------------------------+
|  User Roles  (?)                    [ + Add ]   |
+-------------------------------------------------+
```

**Phase 03 deliberately did the opposite.** `PageHeader.svelte`'s own comment states the rule:

> *Title-row rule: the title, its description and the Back link, nothing else. Page actions move
> DOWN to the heading row of the first section they act on … This component therefore takes no
> actions prop at all.*

S13-S17 moved **29 action clusters** down under that rule. Putting actions back in the bar
reverses that sweep across ~29 pages, on top of the ~52 pages the bar itself touches.

Three ways to resolve it, owner's call:

1. **Bar takes no actions** — the phase 03 rule stands, the bar is title + description + `?` +
   Back only. Smallest diff, and the 29 clusters stay where they were just put.
2. **Bar takes one primary action** — the page's single main action (`+ Add`) returns to the bar;
   everything else stays down at its section. Needs a rule for which action qualifies, or it
   drifts back to where it was before phase 03.
3. **Full revert** — all 29 clusters come back up. Largest diff, and it undoes committed,
   reviewed work.

**Recommendation: 2.** The owner's sketch clearly wants a primary action visible at the top, and
1 does not deliver that. 2 gets it while keeping the secondary actions beside what they change,
which was the actual point of the phase 03 rule. It needs the qualifying rule written into the
component comment so the next sweep does not have to guess.

## Part 4 — the detail-page variant

**Raised by the owner, 2026-09-04**, while laying out `separations/[id]`:

> *"If we were to implement the header, the name of the employee and the back button would be
> placed on the header along with the status."*

Parts 1-3 above design the **list-page** shape only: title, short description, `?`. A detail page
carries three more things, and today they are passed through `PageHeader`'s `back()` snippet and
render inside the page body:

| Element | Where it is now |
|---|---|
| Record name as the title | `PageHeader title=` — already correct |
| Back link | `back()` snippet, e.g. `separations/[id]:103`, `recruitment/applicant/[applicantId]:87` |
| Status badge / stage pill | same `back()` snippet, beside the Back link |

So the bar needs two shapes, not one:

```
list:    +--------------------------------------------------+
         |  User Roles  (?)                      [ + Add ]  |
         +--------------------------------------------------+

detail:  +--------------------------------------------------+
         |  < Separations   Cruz, Bea   [Hired]             |
         |  Software Engineer · Software Developers · #919  |
         +--------------------------------------------------+
```

Notes for whoever builds it:

- The `back()` snippet is the current carrier for both the Back link and the badge, so the two
  move together. Do not split them.
- Detail pages that already wrap this cluster in their own card must drop that card, or the page
  ends up with a bar and a duplicate header block. Confirmed present on `separations/[id]` (the
  `space-y-2 rounded-lg border bg-card p-4` wrapper) and absent on
  `recruitment/applicant/[applicantId]`, which uses a bare `PageHeader`. Sweep for both.
- The status badge is a `Badge`/stage pill, so it inherits whatever `[[surface-background-inconsistency]]`
  settles — the same block named in Part 3. A gray pill on the new bar's background is the exact
  pairing that failed before: `bg-muted` on a near-equal surface, fixed in `8c745be` by moving to
  `bg-foreground/15`. Re-measure it against the bar, do not assume it carries over.
- The description line on a detail page is generated, not authored (`jobTitle · department ·
  number`), so the ~90-character rule from Part 1 does not apply to it. It needs its own check
  for a long department name rather than a tooltip.

## Scope

- `src/lib/components/ui/PageHeader.svelte` — the bar
- `src/lib/components/ui/HelpTooltip.svelte` — new, extracted
- `src/lib/components/timesheets/NewTimesheetDialog.svelte` — use the extracted one
- 10 route pages — split the long description into a short line plus tooltip copy
- ~29 route pages — only if resolution 2 or 3 is chosen

## Verify after

- Every page still renders one `<h1>` and only one.
- The `?` opens on **keyboard focus**, not only hover, and `aria-describedby` resolves to a real
  element id. Negative control: remove `group-focus-within` and watch the keyboard check go red.
- Header text contrast measured in both themes against the new surface, with a negative control.
- No description over the ~90-character line remains inline.

## Related

- `[[surface-background-inconsistency]]` / issue #20 — blocks the bar's background choice.

---

# OWNER DECISION 18-09-26 — the `?` carries all of it

Date: 2026-09-18
Source: owner, during the 18-09-26 click pass, asked for the `?` on three separate pages
(`/settings`, `/separations`, `/inventory`) before settling it program-wide.

> "the ? carries all of it. Also since we are doing a lot of tooltips. Scan page header for
> subtexts and if there are any then put them in ?"

## The ruling

**No short description stays visible.** The title row shows the title and a `?`. The whole
description moves into the tooltip. That closes Part 1's open question — there is no
"short line plus tooltip copy" split to author, because nothing stays inline.

This also means **every** description moves, not just the ten over 120 characters. The owner's
instruction is to scan for subtexts and put them in the `?`, without a length threshold.

## Full inventory — measured 18-09-26, not sampled

Scanned every `.svelte` under `src/` for a `<PageHeader ... />` tag carrying a `description`.

| | Count |
|---|---|
| files rendering `PageHeader` | 59 |
| `description` values found | **33** |
| string literals | 31 |
| `{expression}` values | 2 |
| over 120 characters | 9 |

Two files pass two descriptions each from different branches — `complaints/+page.svelte` (HR
view and employee view) and `requests/+page.svelte`. One is not a route at all:
`src/lib/components/attendance/AttendanceHrGrid.svelte`, phase 07's extracted component.

### Every description, longest first

| Chars | File | Text |
|---|---|---|
| 290 | `settings/offboarding` | The clearance steps every separation case starts with… |
| 224 | `settings/job-boards` | The sites HR can mark a posting as published to… |
| 214 | `complaints/[id]` | *(generated — category · employee · opened date)* |
| 202 | `settings/leave-types` | Master data for the leave/request flow… |
| 199 | `settings/posting-approvers` | Job postings must be approved before they go live… |
| 167 | `branches` | Your physical stores — address, contact, branch manager… |
| 134 | `settings/salary-grades` | Pay bands assignable to positions… |
| 133 | `requests/proposals` | Pay and promotion changes someone else filed… |
| 122 | `performance/templates` | The evaluation forms HR issues… |
| 104 | `payroll/periods` | A period is the pay window… |
| 102 | `settings/pay-codes` | Codes used by the payroll engine… |
| 100 | `inventory` | Track company assets, equipment, and supplies… |
| 99 | `settings/performance` | How often performance reviews are opened… |
| 92 | `separations/[id]` | *(generated — job title · department · number)* |
| 89 | `settings/backup` | Copies every employee 201 file and request attachment… |
| 74 | `separations` | Record resignations and terminations, run clearance… |
| 71 | `performance/reviews/[id]` | *(generated — cycle · reviewer)* |
| 68 | `complaints` (HR) | Raise a question or concern to an employee… |
| 55 | `settings/org-chart` | Reporting hierarchy built from each employee's manager. |
| 52 | `complaints` (employee) | Questions HR has raised with you. Open one to reply. |
| 52 | `settings` | Master data and configuration for your organization. |
| 49 | `settings/company` | Appears on payslips, reports, and the org header. |
| 47 | `settings/holidays` | Manage public holidays for payroll computation. |
| 43 | `components/attendance/AttendanceHrGrid` | Team overview, daily records & corrections. |
| 43 | `punch` | *(expression — employee name when linked)* |
| 42 | `performance/templates/[id]` | Compose the evaluation form HR will issue. |
| 41 | `payslips` | View and download your approved payslips. |
| 40 | `requests/timesheets` | Review and approve submitted timesheets. |
| 39 | `requests/approvals` | Review requests awaiting your decision. |
| 35 | `payroll/calculator` | What-if preview — nothing is saved. |
| 29 | `recruitment/[id]/apply` | *(expression — department name)* |
| 29 | `requests` | File and track your requests. |
| 29 | `requests` | File and track your requests. |

## The one thing the ruling does NOT cover — needs the owner

**Five of the 33 are not help text. They are record identity.**

`complaints/[id]`, `separations/[id]`, `performance/reviews/[id]`, `punch`, and
`recruitment/[id]/apply` build their description from the record: who the complaint is about,
which employee is separating, which cycle and reviewer. This note already flagged the shape in
Part 3 — *"the description line on a detail page is generated, not authored… so the
~90-character rule does not apply to it."*

Hiding those behind a `?` hides **who the page is about** until the user hovers. That is a
different change from hiding an explanation, and the owner's ruling was given about
explanations.

Recommendation: the `?` takes the 28 authored descriptions; the 5 generated ones stay visible as
a subtitle. Owner confirms or overrides. Do not start the sweep until this is answered — it
decides whether the work is 28 pages or 33.

## What changes in the plan above

- Part 1's "short line plus tooltip copy" authoring job is **gone**. No new copy to write.
- Scope grows from "10 route pages" to **28 or 33**, per the answer above.
- `PageHeader`'s `description` prop becomes the tooltip body. Whether the prop is renamed, or
  kept and simply rendered inside `HelpTip`, is an implementation choice — keeping the name means
  33 call sites need no edit at all, which is the cheaper path.
- `src/lib/components/ui/HelpTip.svelte` **already exists** and renders this control. The Scope
  section above names a new `HelpTooltip.svelte` — that is stale, use `HelpTip`.
