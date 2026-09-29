---
name: note:nav-avatar-initial-contrast
description: "The sidebar user-avatar initial is text-primary on bg-primary/20 and measures 3.98:1 light / 2.69:1 dark, both under the 4.5 AA floor for its 12px bold text — phase 02's file, found during the phase 03 live pass"
date: 04-09-26
feature: ui-ux-overhaul
---

# Sidebar avatar initial fails WCAG AA in both themes

**Status**: BACKLOG — a one-line fix, deliberately not made here.
**Raised by**: the phase 03 live contrast pass on 04-09-26, measured in a real browser with
Playwright against the composited background.

## The defect

`src/routes/(app)/+layout.svelte:532` renders the user's initial:

```
class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full
       bg-primary/20 text-xs font-semibold text-primary"
```

`text-xs font-semibold` is 12px bold. That is **not** WCAG "large text" (which needs 14pt bold
/ 18.66px), so the floor is **4.5:1**, not 3:1.

| Theme | Measured | Floor | Result |
|---|---|---|---|
| Light | 3.98:1 | 4.5:1 | FAIL |
| Dark  | 2.69:1 | 4.5:1 | FAIL |

Dark is the app's default (`+layout.svelte:65` — `localStorage.getItem('theme') !== 'light'`),
so the worse of the two is what most sessions actually see.

The cause is the same one phase 03 hit twice: a 20% tint of the foreground colour is used as
that same colour's background. `bg-primary/20` composites to something close enough to
`text-primary` that the pair cannot reach AA at any tint under roughly 40%.

## Why it was not fixed in phase 03

`(app)/+layout.svelte` is **phase 02's** file. Phase 02 is merged. Editing it from
`feat/uiux-phase-3` would reopen a closed phase and put an unrelated file in phase 03's diff,
against the surgical-changes rule. Phase 03's own scope is the design-system tokens.

## What a fix looks like

Either is one line. Both need re-measuring, not reasoning — the composite is what fails, and
the composite is only visible in a browser.

1. **Darken the text**: `text-primary` to a fixed darker step in light mode with a lighter
   `dark:` step. This is the shape the `.badge-*` tokens and `Banner.svelte` both landed on.
2. **Solidify the background**: `bg-primary` with `text-primary-foreground`. Removes the
   composite entirely and matches how the primary Button already renders. Likely the better
   answer — it is an existing token pair that is already known to pass.

Whichever is chosen, measure `getComputedStyle` on the real element in **both** themes and
keep a negative control (one untouched element whose ratio must not move).

## Scope note

Only this one element was measured. The same `bg-X/20` + `text-X` shape may exist elsewhere in
the nav and was not swept for. Grep `bg-primary/20`, `bg-accent/20` and friends as part of the
fix rather than trusting this as the only site.
