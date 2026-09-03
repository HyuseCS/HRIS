---
name: note:component-test-dom-environment
description: "No DOM test environment in the vitest suite — phase 01 sections 3 and 4 ship with agent-probe evidence only"
date: 03-09-26
feature: ui-ux-overhaul
---

# No DOM test environment — component behaviour cannot be regression-proofed

Date: 2026-09-03
Source: outer-PVL on `phase-01-p0-fixes_PLAN_03-09-26.md` (RESIDUAL-1, RESIDUAL-2)

## The gap

`vitest.config.ts` pins `environment: 'node'` and includes only `tests/unit/**`. None of the 193
unit files can render a Svelte component. So two phase-01 fixes have **no automated gate at all**
and rest entirely on an agent probe:

- **AC-3** — the rating-row keyed-each fix at `ReviewFormRender.svelte:169`.
- **AC-4** — the Toaster ARIA attributes (`role="status"`, `aria-live="polite"`,
  `aria-atomic="false"`) at `Toaster.svelte:14-22`.

A probe proves one path once on one build. It cannot stop either fix regressing.

## Why it is cheap to close

`@testing-library/svelte@^5.2.0` and `@testing-library/jest-dom@^6.6.0` are **already**
devDependencies (`package.json:37-38`). Nothing new needs owner approval for a dependency.

## Suggested shape

A second vitest project scoped to `tests/component/` with `environment: 'jsdom'`, leaving the
existing node project untouched. Two first tests: mount `ReviewFormRender` with two rating rows
sharing `value`, assert both `<li>`s render; mount `Toaster` with one toast, assert the container
node carries all three ARIA attributes.

## Owner

Phase 03 (`design-system`) or phase 04 (`feedback-contract`) — both build the primitives these
tests would cover. Not phase 01.
