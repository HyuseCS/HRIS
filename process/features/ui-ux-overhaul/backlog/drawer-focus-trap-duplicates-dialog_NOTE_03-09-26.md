---
name: note:drawer-focus-trap-duplicates-dialog
description: "The mobile nav drawer's focus trap is a hand copy of Dialog.svelte's. Extract the trap into a shared utility once components/ui is in scope, and have both consume it."
date: 03-09-26
feature: ui-ux-overhaul
metadata:
  node_type: memory
  type: note
  feature: ui-ux-overhaul
  phase: "08"
---

# The drawer focus trap duplicates Dialog's

**Raised by:** phase 08 section S5 (item 27), 03-09-26.
**Severity:** low — not a defect. Two correct implementations of one idea.

## What

`src/routes/(app)/+layout.svelte` now contains a focus trap for the mobile nav drawer:
a `FOCUSABLE` selector string, Tab/Shift+Tab cycling inside the panel, Escape-to-close, and focus
restore to the opener. All four are a hand copy of the trap inside
`src/lib/components/ui/Dialog.svelte`.

## Why it was copied rather than reused

Three reasons, recorded so nobody re-litigates them:

1. **Dialog's trap is inline, not exported.** Lifting it out means editing
   `src/lib/components/ui/**`, which phase 03 owns and phase 08's Touchpoints list as read-only.
2. **The drawer does not fit inside Dialog.** Dialog renders a centred, `max-w-*` panel inside a
   flex-centred backdrop. The drawer is a full-height slide-in pinned to the left edge — and it is
   the *same element* that is the persistent desktop sidebar at `lg:`. Making it fit means restyling
   both.
3. The copied surface is small and stable, so the drift risk is low.

## The fix, when `components/ui` is in scope

Extract the trap from `Dialog.svelte` into a shared helper — a Svelte action is the natural shape
(`use:focusTrap={open}`), since the consumer already owns the element. Then:

- `Dialog.svelte` consumes it.
- `(app)/+layout.svelte`'s drawer consumes it and drops its local copy (~35 lines).

Keep the drawer's two behaviours that Dialog does **not** have, because they are drawer-specific and
not duplication:

- The dialog semantics (`role`/`aria-modal`/`aria-label`) are **conditional on `sidebarOpen`** —
  above `lg` the same `<aside>` is the ordinary page sidebar, and a permanent `aria-modal` would tell
  a screen reader the rest of the page is inert when it is not.
- The `matchMedia('(min-width: 1024px)')` effect that closes the drawer when the viewport crosses up
  to `lg`. Without it, opening the drawer narrow and then widening leaves the desktop sidebar
  focus-trapped and the app unusable by keyboard.

## Cost

One small commit, once a plan legitimately touches `src/lib/components/ui/`.
