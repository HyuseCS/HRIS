---
name: report:phase-03-design-system-hybrid-gates
description: "The phase 03 hybrid gates (§8.3 theme, §8.4 modal focus, §8.5 WCAG AA) run live on 04-09-26 — every one was DEFERRED in the three execute reports; two defects found, both fixed, plus three new backlog notes"
date: 04-09-26
feature: ui-ux-overhaul
phase: "03"
---

# Phase 03 — hybrid gates, run live

**What this closes.** The three S1-S5, S6-S12 and S13-S17 execute reports each recorded the
plan's hybrid gates as `DEFERRED` or `Unverified`, because no server was running. This report
runs them. It supersedes items **A**, **B** and **C** of the S13-S17 report's "Deferred
verification" list. Item **D** (visual coherence) is covered in part. Item **E** (390px) stays
a filed Known-Gap and is phase 04's.

Method throughout: a live browser driven by Playwright against `pnpm dev`, asserting
`getComputedStyle` on real elements, never a class string. Every contrast figure is measured
against the **composited** background.

## Verdict

| Gate | Plan ref | Result |
|---|---|---|
| Light/dark computed-style spot-check | §8.3 | **PASS**, after fixing two defects it exposed |
| Banner tones render non-transparent | §8.3 (S13) | **PASS**, after raising two tones |
| WCAG AA on every changed pair | §8.5 | **PASS** at 4.5:1, after two fixes |
| Modal focus behaviour, 7 modals | §8.4 | **PASS**, 7 of 7 |
| Nested-dialog Escape | §8.4.7 | **PASS** |
| Leaflet init inside the primitive | §8.4 item 8 | **PASS**, both themes |

Five commits came out of it: `b073a0f`, `d9b4aa4`, `f7a0678`, `db0b575`, `4efc345`.

## F1 — Tailwind's `darkMode` was never set, so every `dark:` variant was inert

The one that mattered. `tailwind.config.ts` had no `darkMode` key, so Tailwind used its default,
`media` — `dark:` compiled to `@media (prefers-color-scheme: dark)`.

The app does not use `prefers-color-scheme`. `(app)/+layout.svelte:65` writes `html.dark` from
`localStorage` and **defaults to dark**:

```ts
let isDark = $state(browser ? localStorage.getItem('theme') !== 'light' : true)
```

The two mechanisms never agreed. Every `dark:` colour the phase added did nothing under the
app's own switch.

Measured on `.badge-green` in app-dark:

| State | Ratio |
|---|---|
| Before phase 03 (unconditional `text-green-400`) | 8.78:1 |
| After phase 03 (`text-green-800 dark:text-green-400`, the `dark:` never firing) | **2.15:1** |

Phase 03 made dark mode worse, and dark is the default. Fixed in `b073a0f` — `darkMode: 'class'`.

Diagnosis note for the record: the first probe read 2.14 and I nearly filed it as a CSS defect.
The cause was only visible by reading the **served stylesheet**, not the config file. Verify the
check before the code.

## F2 — Three `.badge-*` classes were purged out of the stylesheet entirely

The owner's walk found this first: *"Some statuses no longer are in pills."*

`Badge.svelte:28` was `<span class="badge-{resolved.tone}">`. Tailwind emits a
`@layer components` rule only when the class name appears **literally** in a scanned file. There
is no `safelist`. So `.badge-red`, `.badge-yellow` and `.badge-blue` were never emitted, and
every status in those tones rendered as unstyled text across 13 list pages and roughly a dozen
detail cards. `badge-green` and `badge-gray` survived only because four unrelated files happen
to spell them out.

`src/routes/(app)/dashboard/+page.svelte:205` had the same trap.

Both fixed in `d9b4aa4` with complete static strings. Confirmed independently with a real
Tailwind build plus a **negative control**: adding one file containing the three literals brought
all three classes back into the output.

`f7a0678` adds `tests/unit/badge-class-literals.test.ts` — it reads the tones out of `app.css`,
asserts each appears as a literal in `src/`, and bans `class="badge-{`. Proven with its own
negative control: 3 red with the interpolation restored, 7 green with it removed. `pnpm check`
cannot see this defect; the markup is valid either way.

## §8.5 — WCAG AA, measured

Floor is **4.5:1**: the badge is 12px `font-medium` and the banner 14px, neither of which is
WCAG "large text".

### Banner tones, over a real card background

| Tone | Light before | Light after | Dark |
|---|---|---|---|
| error | 4.24 **FAIL** | **5.68** | 5.59 |
| success | 3.03 **FAIL** | **6.55** | 8.32 |
| warning | 4.65 | — | 8.58 |
| info | 4.61 | — | 5.97 |

`error` moved to `text-red-700`, `success` to `text-green-800` — the same steps the `.badge-*`
tokens landed on, for the same reason. Committed in `4efc345`. Per the plan's §8.5 rule, a
darker step, never a waiver.

`db0b575` additionally put `employees/[id]`'s page-level feedback on `<Banner>`; its
hand-rolled version was dark-only `text-green-400` on a white card.

### Badge tones

All five pass in both themes once `b073a0f` makes the `dark:` half fire. The S1-S5 report's
figures were arithmetic; these are measured, and they agree.

## §8.4 — Modal focus behaviour, 7 of 7

Per modal: focus lands inside the panel on open, Tab wraps, Shift+Tab wraps, Escape closes and
returns focus to the trigger, backdrop click closes.

| Modal | Result |
|---|---|
| Roles editor | PASS — 12 real Tab presses, zero escapes |
| `NewTimesheetDialog` | PASS |
| `TimesheetModal` (timesheet review) | PASS |
| `ConfirmDialog` nested in `TimesheetModal` | PASS — see §8.4.7 below |
| `ReasonDialog` | PASS — `initialFocus="none"` puts focus on the textarea, not the panel |
| `PunchMapDialog` | PASS — see below |
| `ApplicantKanban` stage-move | PASS — see below |

**Method.** A `focusin` watcher counting every focus event landing outside the dialog, plus real
keyboard presses. The watcher proved itself by recording exactly one escape at close, when focus
returns to the trigger. An earlier probe of mine computed the wrong `last` element on the roles
editor and produced a misleading "did not wrap"; the escape-counting assertion replaced it and is
what the numbers above come from.

### §8.4.7 nested-dialog Escape

Opened `ReasonDialog`/`ConfirmDialog` inside `TimesheetModal:522`. Escape closed **only** the
inner "Delete timesheet?" at z60. The outer "Timesheet review" at z50 survived, and focus
returned to the Delete button. This is what `stopPropagation` protects, and it holds.

### `PunchMapDialog` — was blocked, now run

Blocked until 04-09-26 because zero of 369 punches had coordinates.
`scripts/seed-uiux-demo.ts` now seeds one (and clears cleanly — proven by a three-state
seed/clear/re-seed count check).

- Focus lands on the panel; 7 Tab and 5 Shift+Tab presses over a 5-element cycle, **zero escapes**.
- Escape closes, focus returns to the trigger.
- Backdrop click closes and restores focus. **Negative control:** a click landing inside the
  panel does **not** close it. My first backdrop attempt clicked `body`, whose centre is the
  panel — the check was wrong, not the code.
- Leaflet initialises inside the primitive: `.leaflet-container` present, 5 tiles in light and
  4 in dark, 2 SVG paths (the `circleMarker` pin and the accuracy `circle` — no marker PNG, as
  the component's own comment states).
- **Theme-aware tiles are a second proof of `b073a0f`:** `html.light` loads `light_all` tiles,
  `html.dark` loads `dark_all`. Both directions confirmed.

### `ApplicantKanban` stage-move — was blocked, now run

Blocked until 04-09-26 because zero applicants existed in any org. The seed script adds three on
`jp_seed_demo` at APPLIED / SCREENING / INTERVIEW, so every card shows both a "Move to" and a
"Reject" button.

- Focus lands on the panel; 7 Tabs over a 5-element cycle, **zero escapes**.
- Escape closes, focus returns to the trigger. Backdrop click likewise.
- **End-to-end, not just focus:** typed a note, pressed "Confirm move", and verified in Postgres
  that `applicants.currentStage` went APPLIED → SCREENING **and** an `applicant_stage_history`
  row landed carrying the note text. The dialog does its job, not just its focus trap.

## New defects found, filed not fixed

Three, all outside phase 03's blast radius. Each is a written backlog note, not a mention.

| Note | What | Why not fixed here |
|---|---|---|
| `nav-avatar-initial-contrast_NOTE_04-09-26` | Sidebar avatar initial: 3.98 light / **2.69 dark**, floor 4.5 | `(app)/+layout.svelte` is phase 02's file, and phase 02 is merged |
| `text-primary-fails-aa-in-dark_NOTE_04-09-26` | `text-primary` is one red in both themes: 5.62 light / **3.03 dark**. 47 sites | Changing it is a brand-colour decision on every page — the owner's call, not an engineering one |
| `punch-map-carto-tiles-need-api-key_NOTE_04-09-26` | CARTO basemap tiles render watermarked "API KEY REQUIRED" | Predates phase 03; CARTO changed terms, the code did not |

The first two share a cause and must be fixed together, or the avatar note goes stale the moment
the token moves.

## Still not verified

- **390px responsive** — `phase-03-responsive-sweep_NOTE_03-09-26`. Phase 04's.
- **§8.3 negative controls on the five named pages.** The theme spot-check was run through the
  badge and banner defects above rather than page by page with a per-page untouched control. The
  `b073a0f` before/after (8.78 → 2.15 → measured-passing) is a stronger signal than the planned
  check, but it is not the same check.
- **The S8 "before" negative control**, which the plan says is only reachable from commit
  `b6042c7`. Not run.
- **Item D.10** — filtering three list pages to empty and judging the `no-results` copy.

## Data left in place

`scripts/seed-uiux-demo.ts` is left **seeded** so the two dialogs stay walkable. Run
`pnpm tsx scripts/seed-uiux-demo.ts --clear` before `pnpm test:e2e`, the same caveat
`seed-punches-demo.ts` carries.
