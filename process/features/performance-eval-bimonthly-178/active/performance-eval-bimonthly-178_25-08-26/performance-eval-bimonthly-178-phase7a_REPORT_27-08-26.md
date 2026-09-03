---
name: report:performance-eval-bimonthly-178-phase7-a
description: Phase 7 section A EXECUTE report — items 138 and 139 only (the pure signoff-plan module and its 13 tests); items 140-146 belong to other agents
date: 27-08-26
metadata:
  node_type: memory
  type: report
  feature: performance-eval-bimonthly-178
  phase: phase-7-section-a
---

# Phase 7, section A — the pure sign-off ordering module

**Status:** COMPLETE. Four gates green. Two mutations RED then reverted.

Plan: `process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_PLAN_25-08-26.md`

## What Was Done

**Item 138** — `src/lib/server/performance/signoff-plan.ts` (NEW). Two exports:

```ts
export function nextSignatorySlot(
	signatoryOrder: SignatorySlot[],
	existingSignoffs: { slotId: string }[]
): SignatorySlot | null
export function isFullySigned(
	signatoryOrder: SignatorySlot[],
	existingSignoffs: { slotId: string }[]
): boolean
```

`nextSignatorySlot` builds a `Set` of signed slot ids and returns the first slot in
`signatoryOrder` not in that set. `isFullySigned` is `nextSignatorySlot(...) === null` —
derived from the same walk, never a length comparison, so the two answers cannot disagree.

**Purity, proven:** the only import is `import type { SignatorySlot } from './types'` — a
type-only import that erases at build. No Prisma, no `$lib/server/db`, no `fs`, no `fetch`,
no `Date.now()`, no `new Date()`. The header comment states the rule; a grep for
`import|Date|db|prisma|fetch|fs|require` returns only the type import and comment prose.

**Item 139** — `tests/unit/performance-signoff-order.test.ts` (NEW). 13 tests, 3 describes.

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `pnpm check` | **0 errors**, 1 pre-existing a11y warning (`CalculatorWindow.svelte:82`, not mine) |
| `pnpm test` | **171 files / 1989 tests passed** |
| `pnpm lint` | clean on both my files; see drift note below |
| `pnpm format:check` | all files Prettier-clean |

## The 13 tests and what each proves

**`nextSignatorySlot` — the in-order walk (AC11)**

| Test | Proves |
|---|---|
| returns slot 0 when nothing has been signed | empty signoff set → slot 0 (plan item 139) |
| advances one slot at a time, in order | the in-order case succeeds (AC11) |
| returns null once every slot is signed | fully-signed → `null` (plan item 139) |
| hands back the WRONG slot for an out-of-turn signatory | the out-of-turn case: DEPT_HEAD asks, gets IMMEDIATE_SUPERVISOR — this is what the service turns into a 409 |
| still refuses to skip a gap when a later slot was signed first | the walk never skips a hole |
| ignores a signoff for a slot not in the order | a stray/deleted slot id does not crash and is not progress (plan item 139) |
| walks slot by slot when one person holds several | the settled fact: NO same-signer check exists, by design |

**`nextSignatorySlot` — the derivation must not depend on the rows themselves** (my two extra cases + one)

| Test | Proves |
|---|---|
| does not miscount on duplicate rows for the same slot | **EXTRA 1.** `@@unique([reviewId, slotId])` should prevent it, but three `sig_1` rows + one `sig_2` is FOUR rows against a four-slot order; a length comparison calls that complete. It returns `sig_3` and `isFullySigned` is `false`. |
| is unaffected by signoff rows arriving out of order | **EXTRA 2.** `sig_2` listed before `sig_1`, and the fully reversed set. The answer comes from `signatoryOrder`'s positions, never the array position of `existingSignoffs`. |
| follows a template whose declared order is different | ORDER IS THE DATA: an employee-signs-first template gets `sig_4` first |

**`isFullySigned`**

| Test | Proves |
|---|---|
| false while any slot is unsigned | the negative case, including 3-of-4 |
| true only when every slot has a signature | the positive case |
| not fooled by a stray row outside the order | four rows, one belonging to no slot → still `false` |

## Mutation Check — both halves, two mutations

Backed the module up to scratchpad first, then mutated in place, then reverted by
re-editing (never `git checkout`).

**Mutation A — index by arrival count** (`return signatoryOrder[existingSignoffs.length] ?? null`):
**4 tests RED** — gap-skip, stray slot id, duplicate rows, and `isFullySigned` stray row.

**Mutation B — trust arrival order** (advance from `existingSignoffs.at(-1)`'s position):
**3 tests RED** — gap-skip, stray slot id, and out-of-order arrival.

**Revert:** re-edited the body back to the `Set` + `find` form. `diff` against the
pre-mutation scratchpad copy is byte-identical; 13/13 green again.

Between them, both extra cases are proven load-bearing: Mutation A is caught only by the
duplicate-rows case, Mutation B only by the out-of-order-arrival case.

## Plan Deviations

None. Both signatures match item 138 verbatim; all five item-139 cases are present plus the
two extras and two supporting cases.

## What Was Skipped or Deferred

Items 140-146 (slot resolution, `attestSignoff`, the route, the signature-block UI, the
stalled list, the department-head editor) are out of this section's scope. No existing file
was touched.

## Test Infra Gaps Found

None.

## Plan Drift Found

- Plan line numbers are stale, as warned. Item 138/139 are at plan lines **1276-1298**, not
  their originally-cited positions. `TemplateStructure.signatoryOrder` is documented at plan
  line **545**; the `ReviewSignoff` model at line **278**.
- Plan line 971's template-validation item names "an empty `signatoryOrder`" as a rejection
  case; that is already implemented in `schemas.ts:111` as
  `.min(1, 'A template needs at least one signatory')`. `isFullySigned` therefore treats an
  empty order as fully-signed (a total function) and says so in its doc comment — the case is
  unreachable upstream.

## Closeout Packet

- **Selected plan:** the #178 plan above, PHASE 7 items 138-139.
- **Finished:** both new files, four gates green, two mutations RED and reverted.
- **Verified:** everything in scope is proven by unit test; no DB or browser was needed.
- **Unverified:** nothing in scope.
- **Next plan path:** the same plan, PHASE 7 items 140-146 (service + route + UI).

## Forward Preview

**Test infra found:** `tests/unit/performance-cycle-plan.test.ts` is the house pattern for a
pure-module test here and was matched exactly. The `$lib/...` alias resolves in `tests/unit/`
without extra config.

**Blast radius changes:** two NEW files only. Nothing existing was modified.

**Commands to stay green:** `pnpm check`, `pnpm test`, `pnpm lint`, `pnpm format:check`.

**Dependency changes:** none.

**For the item 141 agent:** `attestSignoff` must call `nextSignatorySlot` and compare the
returned slot to the slot the actor is claiming — the module never rejects on its own, it only
answers whose turn it is. And `isFullySigned` must be recomputed INSIDE the transaction, after
the row insert, from the freshly-read rows; calling it on the pre-insert list is the drift this
module exists to prevent.
