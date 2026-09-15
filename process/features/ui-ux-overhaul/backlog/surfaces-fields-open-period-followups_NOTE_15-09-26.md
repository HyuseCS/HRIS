---
name: note:surfaces-fields-open-period-followups
description: "Non-blocking follow-ups from the 15-09-26 surfaces / field edges / Open Period verify and impeccable audit (11.7), plus the R2 source-gate residual"
date: 15-09-26
feature: ui-ux-overhaul
---

# Follow-ups: surfaces, field edges, Open Period

Source: `active/ui-ux-overhaul_03-09-26/surfaces-fields-open-period_REPORT_15-09-26.md` and the 11.7
impeccable audit. None of these breaks a brief ruling, a contrast target or an anti-goal.

Audit: impeccable detector on the 40 `src` files changed since `825d3ff` returned 0 findings (the
detector flagged a planted side-tab border in a negative control, so it is live). `pnpm check` 0 errors.

1. **Pagination labels wrap on phone.** At 390px "← Previous" and "Page 1 of 3" break onto two lines on
   `/settings/roles`, `/employees`, audit-log. Screens: `surfaces-fields-open-period_screens/*_390.png`.
2. **Open Period dialog is wider than its content.** `size="wide"` gives ~896px, the form uses ~545px.
   Try the default size.
3. **Other dialogs that close on success may lose focus like D3.** SvelteKit `applyAction` calls
   `reset_focus` after `update()`, so a dialog closed in `onSuccess` hands focus to its trigger and
   then loses it to `<body>`. Fixed for `OpenPeriodDialog` in `ba28e7c` (close after `update()`).
   Sweep the other `submitFeedback({ onSuccess: () => (open = false) })` dialogs.
4. **Inherited `border-input` edges not looked at visually.** They only got darker (light 94→53%):
   `reports/[type]` Export CSV outline button, `FileInput.svelte` dropzone and tile,
   `ReviewFormRender.svelte` dashed placeholder, the `rounded border-input` checkboxes. Check they do
   not now read heavier than the fields.
5. **R2 residual: no source gate for bare boxes.** Nothing stops a new `rounded-lg border p-4` without
   `bg-card`. A lint or unit scan over class strings (with the carve-outs as an allow-list) would.
   Remaining bare sites are tracked on GitHub #20.
