---
name: note:e2e-flakiness-blocks-feedback-regression
description: "#287 e2e flakiness is the named Known-Gap residual behind phase 04's feedback-contract regression proof"
date: 03-09-26
feature: ui-ux-overhaul
---

# `pnpm test:e2e` cannot yet stand as the feedback-contract regression proof

**Source.** Phase 04 validate-contract, Known-Gap (CONDITIONAL) row: "Playwright regression proof —
`pnpm test:e2e` run, and a red result diagnosed from the actual error before being called a phase
failure (#287)."

## What happened in phase 04 S5–S6

The suite WAS run and it IS green: **141/141**, matching the pre-phase baseline exactly.

It went red once first, with 3 failures, and the diagnosis is the whole point of this note. All
three were the same cause and none was flakiness:

```
strict mode violation: getByText(/Synced \d+ days? from attendance/) resolved to 2 elements
```

The success message now renders twice — the page's own banner AND the new toast — so a page-wide
`getByText` matched both. The fix was to anchor each locator to `getByRole('main')`. Same text,
same visibility assertion, one node. Nothing was weakened.

That is the #287 trap in one paragraph: "3 e2e failures" reads as flakiness, and the correct
response was to read the error, which named a real and expected consequence of the change.

## Why this stays a Known-Gap

Green at 141/141 does NOT prove the feedback contract. No e2e test asserts:

- that a toast appears for any of the S6 high-stakes actions (payroll void/release/decide,
  roles setActive, employees offboard, the attendance locks);
- that a toast survives a hover past its 6s timer, or that the stack caps at 5;
- that an `employees/[id]` error renders in its OWN card for an OFFBOARDED employee (the P0-7
  negative control);
- that a flash message renders at its destination with JS disabled.

The suite passes because it never looked. Phase 04's proof for those is the Hybrid/Agent-Probe
tier, which needs a running dev server and a browser — deferred to the owner's manual pass.

## What building this looks like

Add e2e coverage for the feedback contract itself, not just for the flows that happen to carry it:

1. A toast helper locator (`[role="status"]` region) so a test can assert a toast distinctly from
   a page banner — the ambiguity that broke three tests above is the same ambiguity that makes
   toast assertions unwritable today.
2. One spec per tier: a success toast for a money action; a hover that holds a toast past 6s with
   an unhovered control that expires; a forced failure on an offboarded employee asserting the
   error lands in the Loans card.
3. Only then can the Hybrid/Agent-Probe rows in phase 04's validate contract be retired.

Until then the phase's AC-5 / AC-7 / AC-8 / AC-9 / AC-10 rows stay CONDITIONAL, and a green e2e
run must not be read as proving them.
