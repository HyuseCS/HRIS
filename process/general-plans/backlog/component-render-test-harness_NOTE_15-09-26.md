---
name: note:component-render-test-harness
description: "@testing-library/svelte is installed and unused; vitest runs environment: node, so no component can be rendered and asserted in isolation"
date: 15-09-26
feature: general-plans
---

# Known gap — no component-render test harness

`@testing-library/svelte` is a dependency but nothing wires it up: `vitest.config.ts` sets
`environment: 'node'`, so no DOM exists for a component render. `TimePicker.svelte` (and any future
component with internal DOM state — drag, focus, popover) is therefore proved only by Playwright e2e
and agent live-probes, never by an isolated unit test.

## Fix option

Decide jsdom vs Vitest browser-mode deliberately (not inside an unrelated feature plan), wire
`@testing-library/svelte` or drop it, and add a `tests/unit/` (or new `tests/component/`) convention
so future controls like `TimePicker` get a fast, isolated render/interaction test instead of relying
only on live probes.

## Priority

Medium — this was explicitly deferred by decision D6 in the F11a plan, but it is now the second
plan in a row (after the earlier UI/UX phases) that named this gap.

## Source

`process/general-plans/completed/f11a-analog-time-picker_15-09-26/f11a-analog-time-picker_PLAN_15-09-26.md`,
§13 item 2, Verification Evidence table.
