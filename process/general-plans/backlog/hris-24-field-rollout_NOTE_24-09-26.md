---
name: note:hris-24-field-rollout
description: "Field.svelte is adopted on employees/new and the employees/[id] cards only; the rest of the repo still hand-writes label, hint and error wiring"
date: 24-09-26
feature: general-plans
---

# Follow-up — roll `Field` out past the employee pages

- #24 part 2 adopted `src/lib/components/ui/Field.svelte` on `employees/new` and the `employees/[id]` card forms only. Every other form still hand-writes its label, hint and error.
- Next pages by typeable-control count (research at d773e1a): `payroll/statutory-rates` (12), `settings/leave-types` (8), `inventory` (7), `ReviewFormRender` (7), `branches` (7).
- Other per-field-error UIs still hand-wired: `RequestCreateDialog`, `SeparationCreateDialog`, `ComplaintCreateDialog`, `ReviewFormRender`, `settings/roles`. The first three still use `text-red-500` / `text-red-600`; Field uses `text-destructive`.
- Open choice: base input class. Adopted controls kept their hand-written `ring-2` strings; the global `.input` class (ring-1, py-1, shadow) would change heights. Pick one before a wide sweep.
- The employee card forms have no unit render test (they need the full page data). Add a card render test with the rollout.
