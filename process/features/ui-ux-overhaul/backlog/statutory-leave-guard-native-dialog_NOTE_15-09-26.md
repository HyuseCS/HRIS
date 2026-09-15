---
name: note:statutory-leave-guard-native-dialog
description: "Owner 15-09-26: the leave-without-saving prompt on /payroll/statutory-rates does not follow the theme; it is the browser's native beforeunload dialog, which cannot be styled"
date: 15-09-26
feature: ui-ux-overhaul
---

# Statutory leave prompt is the browser's own dialog

Owner, 15-09-26, while I left `http://localhost:5173/payroll/statutory-rates` with unsaved edits
(PhilHealth rate, Pag-IBIG cap, SSS row 3) by a full page load to `/timesheets`:

> "uh that modal does not follow the theme or design at all. Take note"

Playwright reported the modal as: `"beforeunload" dialog with message "This page is asking you to confirm
that you want to leave — information you've entered may not be saved."`

## What it is

The page has two leave guards (`+page.svelte`, `onBeforeUnload` and `beforeNavigate`):

- **In-app links** (sidebar, any SvelteKit navigation) open the themed `ConfirmDialog`
  "Leave without saving?".
- **Reload, tab close, typed URL, full page load** go through `beforeunload`. The browser draws that
  dialog itself. Browsers do not let a page style it or change its text.

## Options for the fix

1. Keep the native prompt for reload/close (the only thing a browser honours there) and accept it is
   unstyled; make sure every in-app exit uses the themed dialog.
2. Drop the native prompt and rely only on the themed dialog for in-app exits. Unsaved statutory edits
   would then be lost silently on reload or tab close.

Same pattern exists on `performance/templates/[id]` (the guard was ported from there).

**CLOSED 15-09-26, no fix**: owner accepted it is the browser's own prompt ("ok that's why it doesn't fit the system"). In-app exits already use the themed dialog.
