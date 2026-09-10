---
title: /settings/roles reports a refused deactivation twice
date: 10-09-26
found: phase 04 feedback-contract manual test pass, section 8 check 1
status: BACKLOG — owner ruling recorded, not built
---

# A refused `setActive` shows as a banner AND a toast

## What the owner saw

"Deactivating my own account has 2 error or warning notifications, banner and toast, we
should remove the banner. Also happens when I try to deactivate the CEO."

Both are `setUserActive` guardrails: the self-deactivation bar and the last-active-CEO
409. Both reach the same place.

## Why it doubles

`src/routes/(app)/settings/roles/+page.svelte:158` renders a hand-rolled destructive strip
on `form?.error`. The row's guard at line 29 is a plain `submitFeedback()`, which toasts
`data.error` on a failure. One refusal, two surfaces.

Same defect as F3 on the recruitment posting page, fixed in `661719d`. The owner's rule is
unchanged: **one message per action, whichever sits nearest the button.**

## The fix, and why it is safe

Delete lines 156-164 — the comment, the `{#if form?.error}`, and the strip. The toast
stays and becomes the single voice.

**Checked before writing this**, because deleting a shared error surface has silenced
forms here before (see the `removing-a-banner-can-silence-errors` lesson): this banner is
genuinely `setActive`-only. The sibling `setRole` guard at line 47 skips `update()` on
failure **on purpose** (#283), so a rejected role save never publishes into the page-level
`form` prop; it renders inside the dialog at line 330 and pulls focus onto itself. So no
other form on this page depends on the strip.

Nothing else on the route reads `form.error`.

## Size

Six lines out, no import to drop, no server change. `Banner` is not involved — this strip
is hand-rolled, so the `Banner` component's call-site count does not change.
