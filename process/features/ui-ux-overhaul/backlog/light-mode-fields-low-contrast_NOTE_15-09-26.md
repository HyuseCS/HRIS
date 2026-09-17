---
name: note:light-mode-fields-low-contrast
description: "Form fields are almost invisible in light mode: the --input border token is 94% lightness on a white card, about 1.14:1, where WCAG 1.4.11 asks 3:1"
date: 15-09-26
feature: ui-ux-overhaul
---

# Form fields vanish into the background in light mode

**Status**: SHIPPED in `9aebc46` (`src/app.css:33`). The owner wants it done right after P2 of the phase 05 owner pass, with
`settings-roles-no-container_NOTE_15-09-26.md`.
**Raised by**: the owner, 15-09-26, during P2 test 2 (offboard):

> *"the fields, specially in light mode is really hard to distinguish with the background we need to
> address that."*

**Screen**: `http://localhost:5173/employees/<EMP-904 id>` as `hr@veent.ph`, light mode.
Screenshot: `light-mode-fields-low-contrast_15-09-26.png` next to this note. The same shows on
the `/settings/roles` filter box.

## Likely cause (from source, not yet measured in the browser)

`src/app.css` light theme: `--input: 0 0% 94%`, `--card: 0 0% 100%`, `--background: 0 0% 98%`.
Fields use `border border-input` (60 files). A 94% gray border on white is about **1.14:1**.
WCAG 1.4.11 (non-text contrast) asks **3:1** for a field boundary. Dark mode `--input` is 13% on a
11% card, which is also low. Measure both themes in the built bundle before the fix.

## What to do

A token change to `--input` likely fixes all 60 files at once. Check it does not make other
`border-input` uses (buttons, dividers) too heavy.
