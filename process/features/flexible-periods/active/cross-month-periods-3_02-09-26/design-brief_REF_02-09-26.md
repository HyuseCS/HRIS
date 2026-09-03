# Design brief — PeriodPicker, cross-month custom ranges (#3)

Impeccable `shape` + `clarify` pass, Operate mode. Refinement, not redesign: the incumbent
identity, layout, component vocabulary and everything outside the custom-range row stay untouched.

Target: `src/lib/components/ui/PeriodPicker.svelte`. Mounted in three places —
`timesheets/NewTimesheetDialog.svelte:128`, `payroll/+page.svelte:79`, and
`payroll/periods/+page.svelte:75`, which **overrides both field names** (`start`/`end`).

Substitution disclosed: Impeccable's interview step is normally a live probe. The owner answered
the four decisions that govern this work up front and instructed that the build proceed without
further interruption, so the brief is written from those answers and stands as the confirmation
step.

---

## Job and audience

An HR admin creating an off-cycle payroll run, opening a period, or saving a timesheet. They are
mid-task, they already know the shape of the range they want (`26 Dec – 10 Jan` is the driver), and
the picker is a control on the way to that goal, not a destination. Operate mode: the tool
disappears into the task. Familiarity is the feature.

## The one thing that changes

The picker currently greys out every day outside the start month. That was the correct expression of
a rule that is going away. It must not simply be deleted.

## Selected direction

**D-A — Retarget the native constraint, never remove it.**
`min`/`max` on the two date inputs stay. They stop meaning *"the start month"* and start meaning
*"the largest range the size cap allows"*. A picker that silently accepts any date and then punishes
the user with red text is worse than today, not better — the native calendar is the cheapest and
most accessible refusal there is, and it is already the component's stated design (`:90-93`).

**D-B — One source of truth for the bound.**
The `max` end date must be derived from the **same summed-fraction function the server uses to
refuse**, not from a re-derived date rule. The component already imports from `pay-periods.ts`
precisely so "the inline message and the 400 the service would return can never disagree" (`:80-82`).
A second, hand-rolled month rule in the browser would reintroduce the divergence that comment exists
to prevent. The `min` on the start input is the same rule read backwards from a filled end date.

**D-C — The cutoff rule stays server-only. The picker must not attempt it.**
Whether a range clashes with a statutory cutoff window depends on the organisation's employee
allocation rows, which the picker does not have and must not fetch. It stays a server refusal
surfaced after submit. A builder must not invent a client-side approximation of it: a guess that
greys out a legal day is worse than a refusal that explains itself.

**D-D — No new structure.**
No new component, no new props, no layout change, no new state beyond what the bound needs. The
revealed custom row keeps its two `w-40` date inputs, its `aria-invalid` / `aria-describedby`
wiring, and its single `text-destructive` message line. The `aria-live="polite"` preview stays where
it is.

## Copy

Exact strings are fixed by the SPEC's Error Copy section. The clarify lens confirms them and adds
nothing: each names what is wrong, in what quantity, and what to do next.

| State | Text |
|---|---|
| Reversed range | `End date must be on or after the start date.` (unchanged) |
| Same-month rule | **deleted** — no longer a rule |
| Over the size cap | `A custom period cannot cover more than one month of pay. This range covers {percent}% of a month. Shorten it.` |
| Preview, custom | `… · statutory and loans prorated to {n}% of a month` — "of **the** month" was written when only one month could exist |

The cutoff refusal gains `{Month Year}` server-side. It is not picker copy, but it is the message an
HR admin will read after submitting a cross-month range, and without the month they cannot tell
which of the two blocked them.

Terminology stays fixed across all of it: **custom period**, **range**, **cutoff**. Do not introduce
"span", "window" or "date range" as synonyms.

## States the builder must cover

1. **Custom selected, nothing picked** — preview reads `Pick a start and end date`. Unchanged.
2. **Start only** — end input's `min` is the start; its `max` is the cap bound. The calendar already
   shows the user the reachable window before they have made a mistake.
3. **End before start** — reversed message. Unchanged behaviour, unchanged copy.
4. **Over the cap** — reachable only if a user types or pastes a date past the `max`, since the
   calendar bounds it. The message must still exist: `max` is not a guarantee, it is a first line.
5. **Valid cross-month** — no message, preview shows the summed percentage, hidden inputs carry the
   real dates.
6. **Valid same-month** — byte-identical to today. This is the regression rail: nothing about the
   single-month path may move.

## Boundaries and anti-goals

- **Untouched:** the Month/Year selects, the four-button segmented control, `YEARS`, the standard
  shapes, the hidden-input contract and both overridable field names, all spacing and colour.
- **Not in scope:** any visual restyle; the pre-existing local-vs-UTC default month at `:39`; a
  client-side cutoff check (D-C); a shared constants module for the duplicated error strings — PLAN
  decides whether that is worth it, and one is not required to ship this.
- **Anti-goal:** widening the picker into a "smart" range assistant. It offers four period shapes
  and a bounded custom range. It does not suggest, warn ahead, or explain payroll policy.

## Verification

Both themes ship; the only new visual surface is an existing `text-destructive` line, so contrast is
already established. Keyboard and screen-reader behaviour must not regress: the error keeps its id,
the inputs keep `aria-describedby`, the preview keeps `aria-live="polite"`.

Run the mechanical detector over the changed component once the edit is complete, before the audit
pass:

```
node /home/hyuse/.claude/skills/impeccable/scripts/detect.mjs --json src/lib/components/ui/PeriodPicker.svelte
```
