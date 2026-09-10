---
name: note:rejection-toast-is-green
description: "A timesheet rejection still announces itself in a green success toast — the green box is fixed, the green toast is not. Owner ruling owed."
date: 10-09-26
feature: ui-ux-overhaul
---

# A rejection is still announced in green — as a toast

**Owner ruling owed.** Raised at the close of the B2/B3/B5 feedback plan, 10-09-26.

## What is fixed and what is not

§3 (`1a17ebd`) deleted the page banners on `/requests/timesheets` and the modal's own error strip,
so a rejection no longer sits on the page in a persistent green success box. Goal 4 of that plan
("a rejection is never announced in a green success box") is met for the box.

**The toast is still green.** `?/review` returns its reject string through the `saved` key, so
`submitFeedback` (`src/lib/utils/submit-feedback.svelte.ts`) dispatches `kind: 'success'` and
`Toaster.svelte` renders the success palette. A rejection reads as a six-second green success.

## The shape is shared

`Posting sent back to draft.` on the recruitment side returns through the same `saved` key and has
the same shape. **Any change has to be consistent across both** — fixing one and not the other
just moves the inconsistency.

## Options, not decided

1. **Leave it.** The string says "rejected"; only the colour disagrees. Cheapest, and the toast is
   short-lived.
2. **Add a `warning` toast kind for negative-but-successful outcomes** and route reject / return /
   send-back through it. Touches `toast.svelte.ts`, `Toaster.svelte`, and every caller that returns
   a negative outcome via `saved`. Note `--warning` is defined at `src/app.css:39-42` but is not
   mapped into `tailwind.config.ts` and is absent from `.dark` — see GitHub issue #27, which owns
   that gap.
3. **Return reject outcomes through a different key** so the guard can classify them. Server-side
   change, wider blast radius, touches the action contract.

No GitHub issue filed — do not open one without asking.
