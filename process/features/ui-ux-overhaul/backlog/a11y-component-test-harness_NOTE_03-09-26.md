---
name: note:a11y-component-test-harness
description: "There is no component-render or axe test tier in this repo, so phase 08's markup-level accessibility work is provable only by grep, Playwright or an agent's eyes. NEW PLAN REQUIRED."
date: 03-09-26
feature: ui-ux-overhaul
---

# A component-render + axe test tier — NEW PLAN REQUIRED

Date: 2026-09-03
Source: outer PVL on `phase-08-copy-a11y_PLAN_03-09-26.md` — the plan's own Known Gaps table names
this stub and its Phase Completion Rules require it to exist on disk.

## Gap

`vitest.config.ts` runs `environment: 'node'` over `tests/unit/**`. There is no jsdom, no
`@testing-library/svelte`, and no `axe-core`. So none of these can be asserted automatically:

- a screen reader announces a converted row as a table row containing a link
- the mobile drawer traps Tab, closes on Escape, and restores focus to the hamburger
- the schedules On/Off control announces as a switch with its checked state
- the override asterisk carries a text equivalent
- rendered contrast of the fixed colour-only signals in both themes

Phase 08 covers these with Agent-Probe rows (a keyboard walk plus a 10-item screen-reader
spot-check). That is judgement, not a gate, so those behaviours stay **CONDITIONAL**.

## Resolution

New plan: add a jsdom + `@testing-library/svelte` + `axe-core` tier. It needs new dev dependencies,
which phase 08 forbids itself, so it is owner-gated.

A cheaper companion, also proposed at phase 08's EVL: capture the phase's grep gates as
`scripts/check-ui-invariants.mjs` so a later change cannot silently reintroduce a `role="link"` row
or a raw enum.

Files outside phase 08's blast radius: `vitest.config.ts`, `package.json`, a new `tests/component/`
tree, `scripts/check-ui-invariants.mjs`.
New API surface: N/A.
