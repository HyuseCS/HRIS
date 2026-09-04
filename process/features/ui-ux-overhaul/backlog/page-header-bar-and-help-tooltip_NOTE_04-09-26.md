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
