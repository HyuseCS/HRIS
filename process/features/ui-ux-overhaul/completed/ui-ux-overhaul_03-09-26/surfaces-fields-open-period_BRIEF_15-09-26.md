---
name: brief:surfaces-fields-open-period
description: "impeccable shape brief (15-09-26) for three batched changes: one canonical container surface over 58 bare boxes, 3:1 field edges in both themes, and the Open Period modal with a result toast"
date: 15-09-26
feature: ui-ux-overhaul
---

# Brief — surfaces, field edges, Open Period modal

Mode: **Operate**. Refinement inside the existing visual world (PRODUCT.md: near-greyscale surfaces,
bordered `bg-card` sections, Veent Red used sparingly). No new visual language.

Sources: `backlog/settings-roles-no-container_NOTE_15-09-26.md`,
`backlog/light-mode-fields-low-contrast_NOTE_15-09-26.md`,
`backlog/open-period-modal-and-toast_NOTE_15-09-26.md`,
`backlog/surface-background-inconsistency_NOTE_04-09-26.md` (the 58-site inventory).

## Job and outcome

HR and admins scan lists, filter them, and fill forms. Today in light mode the page, the panels and
the fields are near-identical grays, so the eye cannot find where content starts or where a field is.
Success: in both themes, every panel reads as a surface above the page and every field edge is
findable at a glance, without the UI turning heavy.

## Owner rulings (15-09-26)

1. **Canonical surface = card + border.** The card is **not pure white**. It is a soft off-white, and the
   page background moves far enough away from it that the card clearly sits above the page.
2. **Sweep all 58 bare boxes** from the 04-09-26 inventory, minus the carve-outs below.
3. **Field edges reach 3:1** (WCAG 1.4.11) in light and dark.
4. **Container scope for list pages: the filter and the table sit inside the same container** (owner,
   `/settings/roles`).

## Direction

### A. Surfaces
- One surface everywhere: `border` + the card token. `Table.svelte` and `TableSkeleton.svelte` switch
  from the ring to the border so the shared component matches the 90 existing card panels.
- Light-mode token retune: an off-white `--card`, a page `--background` darker than it, and `--muted`
  and `--border` re-checked so table header bands and dividers still read on the new card. Dark mode
  keeps its current relationship (card lighter than page) and is re-checked, not redesigned.
- List pages: the filter row and the table (with pagination) share one container. The table sits
  flush inside it and the filter row gets the container's padding.
- Group B (27 hand-rolled table wrappers): restyle in place. Migrating them to `Table.svelte` is out of
  scope.

### B. Field edges
- Change the `--input` token, not 244 call sites. Target: edge ≥ 3:1 against **both** the card and the
  page background, in **both** themes. Field fill stays what it is.
- The non-field users of `border-input` (the `reports/[type]` outline button, the `FileInput` dropzone
  and tile, the `ReviewFormRender` dashed placeholder) inherit the stronger edge. Look at them in the
  audit.

### C. Open Period modal
- New component (e.g. `src/lib/components/payroll/OpenPeriodDialog.svelte`) wrapping the house
  `Dialog.svelte` with `bind:open`. The form markup and `PeriodPicker` move as they are.
  `NewTimesheetDialog.svelte` is the model.
- "Open Period" opens the modal. Its visible heading is "Open a Payroll Period". Cancel and Escape
  close it, and focus returns to the trigger.
- Submit goes through `submitFeedback`. On success the modal closes and a success toast shows. The
  text comes from a new `saved` string on the `open` action ("Period opened."), matching release and
  void. On failure an error toast shows the server message, and the modal **stays open with the typed
  values kept**.
- The page-wide `form?.error` banner is hidden behind the backdrop while the modal is open, so it must
  not be the only error surface for `open`.

## Carve-outs (do not fill)

- Group C, the dashed affordances: `requests/[id]:324`, `SectionList.svelte:40`, `TimesheetModal.svelte:507`.
- `attendance/+page.svelte:245`, the segmented control.
- `employees/[id]/+page.svelte:1812`, the destructive Offboard box (`border-destructive/50`).
- Line numbers are from 04-09-26. Re-run the scan, because the counts are not trusted as complete.

## States and checks

- Both themes, desktop and a phone width. Pages to look at: `/settings/roles`, `/employees`,
  `/employees/[id]`, `/payroll/periods` (list plus modal), `/payroll`, one reports page.
- Computed-style measurement of every changed token pair in the **built bundle**, with a negative
  control. Contrast numbers are measured, not reasoned.
- Modal: empty-name submit (native required), a duplicate-range 409 (error toast, modal stays open),
  success (toast, modal closes, new row), Escape, focus return.

## Anti-goals

- No pure-white cards. No shadows added to fake the separation.
- No per-site border color overrides. The fix is token-first.
- No redesign of the dark theme. No new card component: containers stay class strings.
- `tests/e2e/period-picker-cross-month.spec.ts` must keep working, so update its locators to the modal.

## Open for the owner, live

The exact light-mode values (how off-white the card is, and how far the page moves) are tuned in the
browser with the owner watching, from 2-3 candidates that all meet the contrast targets. The builder
does not pick them alone.
