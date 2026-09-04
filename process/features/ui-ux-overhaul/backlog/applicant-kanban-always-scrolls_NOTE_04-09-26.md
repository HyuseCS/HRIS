---
name: note:applicant-kanban-always-scrolls
description: "The applicant board is six fixed 256px columns in a min-w-max flex row, so it needs 1616px and scrolls horizontally on every screen the app ships to — the last two stages are never visible without scrolling"
date: 04-09-26
feature: ui-ux-overhaul
---

# The applicant board always scrolls sideways

**Status**: BACKLOG — needs a layout decision, then a rebuild of one component.
**Raised by**: the owner, 2026-09-04: *"The Applicant's section should not be horizontally
scrollable it needs a redesign."*

## The arithmetic

`src/lib/components/recruitment/ApplicantKanban.svelte:78-82`:

```svelte
<div class="overflow-x-auto pb-4">
	<div class="flex gap-4 min-w-max">
		{#each STAGES as stage}
			<div class="w-64 flex-shrink-0">
```

Six stages (`APPLIED, SCREENING, INTERVIEW, OFFER, HIRED, REJECTED`) at a fixed `w-64` (256px),
with five 16px gaps:

**6 × 256 + 5 × 16 = 1616px minimum.**

At a 1536px browser window the sidebar takes 240px and the main pad another ~64px, leaving about
**1230px**. The board is 386px too wide before a single applicant exists. `min-w-max` and
`flex-shrink-0` together forbid the columns from ever narrowing, so this is not a small-screen
problem — **it scrolls on every screen**, including a 27" monitor at 2560px once the browser is
not full-width.

Consequence: **Offer, Hired and Rejected are off-screen by default.** A recruiter cannot see the
end of their own pipeline without scrolling, and there is no visual cue that the board continues.

Confirmed live on 2026-09-04 at 1536px: the Hired column was clipped mid-word at the viewport
edge.

## Three ways out

Each is a real redesign, not a class tweak. The owner picks.

### 1. Let the columns shrink

Drop `min-w-max` and `flex-shrink-0`, give each column `flex-1 min-w-0`. Six columns share the
width at ~190px each.

- Cheapest — three class changes.
- 190px is tight for a name, an email and two buttons. The email already needs `truncate`; the
  action buttons would wrap to two lines.
- Still bad below ~900px.

### 2. Wrap into a responsive grid

`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6`. Columns become cells that reflow.

- Never scrolls sideways at any width, which is what was asked for.
- Loses the left-to-right pipeline reading order below `xl` — Offer can end up above Applied.
  Numbering the stage headers (1-6) recovers most of that.

### 3. Collapse the terminal stages

Keep four live columns (Applied, Screening, Interview, Offer) at full width and move **Hired** and
**Rejected** into a collapsed summary — a count chip that expands to a list.

**4 × 256 + 3 × 16 = 1072px**, which fits.

- Best fit for how the board is actually read: Hired and Rejected are archives, not work queues.
  The live pipeline gets the whole width.
- Most work of the three, and it changes the information architecture, not just the layout.

## Recommendation on record

**3, with 2 as the small-screen fallback.** The board's job is showing what needs action, and two
of the six columns never do. If that is too much work, **2** alone satisfies the literal ask and
is honest at every width; **1** only moves the breakpoint at which the problem returns.

## Also in this component

Not the reported defect, but adjacent and worth settling in the same edit:

- `:100` — cards are `rounded-md border border-l-4 … bg-card`, which is correct. The empty-state
  boxes at `:162` are `rounded-md border border-dashed` with no background, and belong to the
  group-C carve-out in issue #20 — leave them bare.
- `:109` — applicant names are `text-primary`, which measures **3.03:1** on `bg-card` in dark
  mode. See `[[text-primary-fails-aa-in-dark]]`. If that token moves, these links move with it.

## Verify after

- Measure the rendered board width against the available content width at 1536px, 1280px and
  390px. The assertion is `board.scrollWidth <= container.clientWidth`, not "it looks fine".
- Negative control: force six columns back to `w-64 flex-shrink-0` and watch the same assertion
  go red.
- Both themes, since the stage header colours differ per theme.
