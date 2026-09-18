---
name: note:attendance-team-day-controls-row
description: "Owner feedback 18-09-26 on /attendance?view=team — the controls card wastes a whole row on one date field, and the 'Team day' toggle label reads wrong. Collapse to one row and rename."
date: 18-09-26
feature: ui-ux-overhaul
---

# Attendance team-day controls row — owner feedback

Date: 2026-09-18
Source: owner, live on `/attendance?view=team` after the phase 07 split
Surface: `src/lib/components/attendance/AttendanceHrGrid.svelte`
Status: NOTED, not built. Phase 07 is markup-frozen; this is a follow-up.

## F1 — the controls card spends two rows on one field

Team view renders the card as two stacked rows:

| Row | Content | Lines |
|---|---|---|
| 1 | the GET filter form — a single `Day` DatePicker, `flex-1`, left-aligned | ~241-258 |
| 2 | the bulk-action clusters, behind `border-t pt-4` | ~322 onward |

The first row holds one control and a label, so most of its width is empty. The card is taller
than its contents need on every screen.

Owner's ask: move the date to the **right** side, and pull the action buttons **up** into the
space the date vacates. Two rows become one.

Note this is team view only. The employee view's form carries Employee + From + To + the
quick-pick strip + the range-cap line, so it genuinely fills its row — do not apply this there
without re-checking. The `border-t` divider only earns its place while the rows are separate.

## F2 — "Team day" is the wrong label

The three-way toggle (~lines 211-234) reads:

- `Whole team` → `?view=matrix`
- `Team day` → `?view=team`
- `By employee` → `?view=employee`

Owner: "Team day in the filter is weird. Another name could better suite it."

The view is: every employee's record for **one** chosen date. The trouble is that `Whole team`
sits next to it, so `Team` in both labels carries no signal and the real difference — the time
axis — is the word doing the least work.

Candidates, not decided:

| Option | Reads as |
|---|---|
| `Single day` | pairs against `Whole team` on the time axis, which is the actual distinction |
| `One day` | shorter, same idea |
| `Daily` | matches `By employee`'s adverbial shape |
| `By day` | exact parallel to `By employee`, the tightest pair |

`By day` is the closest parallel to the existing `By employee`. Owner picks.

## Scope

Markup and copy only. No load change, no action change, no new query param — `?view=team` stays
the URL value whatever the label becomes.

## Why it is not built yet

Phase 07 is on PR #16, rebased, green, and awaiting the owner's click pass. Changing this surface
now re-opens a branch that is already verified. It belongs in the next UI pass.
