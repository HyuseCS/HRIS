---
name: note:text-primary-fails-aa-in-dark
description: "The `primary` token is the same red in both themes, so `text-primary` measures 5.62:1 on a light card but only 3.03:1 on a dark one — 47 sites, and dark is the app default"
date: 04-09-26
feature: ui-ux-overhaul
---

# `text-primary` fails WCAG AA in dark mode — 47 sites

**Status**: BACKLOG — needs an owner ruling before any edit. A token change, not a bug fix.
**Raised by**: the phase 03 live dialog pass on 04-09-26, measured in a real browser on
`/recruitment/jp_seed_demo`'s applicant-name links.

## The measurement

`src/lib/components/recruitment/ApplicantKanban.svelte:109` —
`class="text-sm font-medium text-primary hover:underline"` on a `bg-card` container.
14px weight 500 is body text, so the floor is **4.5:1**.

| Theme | Text | Card background | Ratio | Result |
|---|---|---|---|---|
| Light | `rgb(205, 24, 24)` | `rgb(255, 255, 255)` | 5.62:1 | PASS |
| Dark  | `rgb(205, 24, 24)` | `rgb(28, 28, 28)`   | **3.03:1** | **FAIL** |

The text colour is byte-identical in both themes. `--primary` in `src/app.css` has no dark
override, so the one red is asked to sit on both a white card and a near-black one. It can
only work on one of them, and it works on the lighter one.

**Dark is the app's default** (`(app)/+layout.svelte:65` —
`localStorage.getItem('theme') !== 'light'`), so the failing case is what an untouched session
shows.

## Scale

47 occurrences of `text-primary` (excluding `text-primary-foreground`) across `src/routes` and
`src/lib/components`, in at least 20 files. Not all are body text — some are icons, where the
3:1 non-text floor applies and 3.03 squeaks past. Each site needs classifying before a sweep:

- **Body text and links** — must reach 4.5:1. This is the failing group.
- **Icons and non-text graphics** — 3:1 floor. Currently passing, barely.
- **Large text** (18.66px+ regular, or 14pt+ bold) — 3:1 floor. Passing.

## Why it was not fixed in phase 03

Phase 03 owns the design-system tokens, so this is arguably in scope. It is deferred anyway
because the fix is a **brand colour change visible on every page**, which is an owner decision,
not an engineering one. Phase 03's badge and banner fixes each moved one token used in one
place; this moves the app's primary red.

## The two candidate fixes

1. **Give `--primary` a dark variant** — a lighter red under `.dark`, the way the `.badge-*`
   tokens already split (`text-red-700` light / `text-red-400` dark). Keeps the brand red in
   light mode, which is where it was chosen. Touches one line in `src/app.css`, but changes
   every `text-primary`, `bg-primary` and `border-primary` in dark mode — including buttons,
   whose `bg-primary` + `text-primary-foreground` pair currently passes and must be re-measured
   after any change.
2. **Stop using `text-primary` for links** — introduce a separate link token. Narrower blast
   radius on the brand, wider diff (47 sites to triage).

Option 1 is smaller and keeps one source of truth. It also silently restyles buttons, so it
needs a full both-theme re-measure of every `primary` pair, not just the links.

## What a fix has to include

- A both-theme `getComputedStyle` measurement per changed pair, with a negative control (one
  untouched element whose ratio must not move). Reasoned ratios are not evidence — the
  measured 3.03 here is 2.6 points below what the same class scores in light.
- The `bg-primary` / `text-primary-foreground` button pair re-measured, since option 1 moves it.
- The 47 sites triaged into body-text / icon / large-text before anything is swept.

## Related

- `[[nav-avatar-initial-contrast]]` — `text-primary` on `bg-primary/20`, 3.98 light / 2.69 dark.
  Same token, and option 1 above would move it too. Fix them together or the avatar note is
  stale the moment this lands.
