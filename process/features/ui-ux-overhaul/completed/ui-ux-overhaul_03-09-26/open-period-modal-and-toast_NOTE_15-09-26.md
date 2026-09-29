---
name: note:open-period-modal-and-toast
description: "/payroll/periods: move the inline 'Open a Payroll Period' form into its own component shown as a modal from 'Open Period', and toast success or error on Open"
date: 15-09-26
feature: ui-ux-overhaul
---

# Open Period becomes a modal component with a result toast

**Status**: SHIPPED in `b271e42` and `ba28e7c`. Batched with `settings-roles-no-container_NOTE_15-09-26.md` and
`light-mode-fields-low-contrast_NOTE_15-09-26.md`, run through the RIPER-5 harness after P2.
**Raised by**: the owner, 15-09-26, right after P2 test 3 (period void):

> *"'Open a Payroll Period' container. Let's turn this into a component. Let's turn that into a modal
> whenever 'Open Period' is clicked. That modal opens. Also when clicking 'Open' on the Open a Payroll
> Period, a success toast or error toast should appear in response to the result of clicking the open
> button."*

**Screen**: `http://localhost:5173/payroll/periods` as `admin@veent.ph`, form open.
Screenshot: `open-period-inline-form_15-09-26.png` next to this note.

## Today

`src/routes/(app)/payroll/periods/+page.svelte` (224 lines): `showOpen` state (line 14) toggles an
inline card `{#if showOpen}` (line 52) headed "Open a Payroll Period". The **Open Period** button
(line 99) toggles it. The house `Dialog.svelte` and `Toaster.svelte` already exist in
`src/lib/components/ui/`.

## Wanted

1. The form is its own component.
2. **Open Period** opens it in a modal.
3. **Open** shows a success toast when the period is created, an error toast when it fails.
