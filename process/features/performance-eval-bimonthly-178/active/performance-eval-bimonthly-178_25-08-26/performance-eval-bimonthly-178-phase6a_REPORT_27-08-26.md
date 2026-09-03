---
name: report:performance-eval-bimonthly-178-phase6-a
description: Phase 6 section A EXECUTE report — items 122 and 133 only (answersSchemaFor + the SPEC AC5 boundary tests); items 123-132 and 134-137 belong to other agents
phase: performance-eval-phase6-section-a
date: 2026-08-27
status: COMPLETE
feature: performance-eval-bimonthly-178
plan: process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_PLAN_25-08-26.md
metadata:
  node_type: memory
  type: report
  feature: performance-eval-bimonthly-178
  phase: phase6-a
---

# Phase 6 section A — the answers schema (items 122, 133)

## What Was Done

**Item 122 — `src/lib/server/performance/schemas.ts`.** Added `answersSchemaFor(structure)`,
carrying the plan §5 "DOES NOT and MUST NOT" comment verbatim. Signature:

```ts
export function answersSchemaFor(structure: TemplateStructure): ZodType<Answers, ZodTypeDef, unknown>
```

Plan §5 writes the return as `ZodType<Answers>`. The third generic is the INPUT type; §5 also
mandates `z.coerce.number().int()` for rating/subtotal/total, and a coerced schema's input is
`unknown`, not `Answers`. `ZodType<Answers>` therefore does not typecheck. The output type is
`Answers` exactly, so this is the same contract with an honest input generic. A comment in the
source says so. **This is the only deviation, and it is a within-blast-radius type-annotation
detail, not a behavioural one.**

What it enforces (the four §5 rules plus the id-existence rules): rating is an int in
`[ratingScale.min, ratingScale.max]`; subtotal is a non-negative int `<=` that section's
`maximum`, and a section with `maximum === null` accepts **no** subtotal at all; `totalScore` is
a non-negative int `<=` `totalCeiling`; and every criterion / section / band / narrative /
recommendation / KPI id in the answers must exist in the structure. `.strict()` at both levels,
so an unknown top-level key is a rejection rather than a silent drop.

**Item 133 — `tests/unit/performance-capture-validation.test.ts` (new).** 13 cases: the 11 the
plan names, plus two fixture-integrity cases (the AE fixture really does have exactly one
`maximum: null` section; a fully in-range answer set is accepted). Fixtures come from
`accountExecutive()` in the seed, not retyped, so seed/validator drift fails here.

## Test Gate Outcomes

| Gate | Command | Result |
|---|---|---|
| Fully-automated | `pnpm test tests/unit/performance-capture-validation.test.ts` | 13/13 pass |
| Fully-automated | `pnpm test` | 167 files, 1953 tests, all pass |
| Fully-automated | `pnpm check` | 0 errors, 1 pre-existing warning (`CalculatorWindow.svelte` a11y) |
| Fully-automated | `pnpm lint` | 0 errors, same 1 pre-existing warning |
| Fully-automated | `pnpm format:check` | clean |

### Mutation check (all-tests.md discipline #1 — a green test that survives guard removal is vacuous)

Eight guards were neutered one at a time in a scratch copy and the suite re-run. All eight kill
a test:

| Mutation | Result |
|---|---|
| drop `.max(max)` on rating | 1 failed |
| drop `.min(min)` on rating | 1 failed |
| drop `.int()` on rating | 1 failed |
| drop `.max(totalCeiling)` | 1 failed |
| neuter `if (maximum === null)` | **initially SURVIVED — see below**, now 1 failed |
| neuter `subtotal > maximum` | 1 failed |
| neuter unknown-criterion check | 1 failed |
| neuter unknown-band check | 1 failed |

**The `maximum: null` survivor, and the fix.** The first draft of the null-maximum test submitted
a subtotal of `1`. With the `maximum === null` branch removed the code falls through to
`subtotal > maximum`, where JS coerces `null` to `0`, so `1 > null` is true and the answer was
still rejected — the test stayed green with the guard gone. The test now submits **`0`**, the one
value that slips past every comparison-based fallback (`0 > null` is false). The mutation now
dies. Recorded because the same trap will hit anyone testing a nullable numeric bound in this
feature.

## No-arithmetic proof (§0, SPEC AC4)

```
$ sed -n '224,312p' src/lib/server/performance/schemas.ts | grep -vE '^\s*(//|\*|/\*)' \
    | grep -nE '\.reduce\(|\+|\*|Math\.|\bsum|\bderive|\btotal\s*\+|weighted'
NO ARITHMETIC in executable lines of answersSchemaFor
```

The only comparison in the function body is `subtotal > maximum` — one typed number against one
declared bound. Nothing sums criteria, nothing weights subtotals, nothing derives a band.
Item 134's structural gate (another agent) is the durable version of this check.

## Plan Deviations

1. Return-type generic — `ZodType<Answers, ZodTypeDef, unknown>` instead of `ZodType<Answers>`.
   Rationale above. Within blast radius.
2. Two extra tests beyond the 11 named (fixture-integrity + a positive control). Additive.
3. One stale comment corrected in the same file: the line
   "`answersSchemaFor(snapshot)` … lands in Phase 6" became false the moment item 122 landed, so
   it was removed and the section header re-titled. Same file, same item.

## What Was Skipped or Deferred

Nothing in scope. Items 123–132 and 134–137 belong to other agents and were not touched.

## Test Infra Gaps Found

None new. The nullable-bound mutation trap above is a discipline note, not an infra gap.

## Closeout Packet

- Selected plan: `.../performance-eval-bimonthly-178_PLAN_25-08-26.md`, Phase 6 items 122 + 133.
- Verified: all four gates green; 8/8 mutation checks kill a test; live DB confirms the AE
  template really is 6 sections / 1 null maximum / ceiling 100 / scale 1–5, matching the fixture.
- Unverified: nothing in this scope. `answersSchemaFor` has no caller yet — item 128 wires it to
  the `submitScores` action.
- Next: items 123–131 (service + route + form), then 132/134–137.
- State: **Keep in active/testing** — Phase 6 is incomplete until its remaining items land.

## Forward Preview

- **Test infra found:** `accountExecutive()` / `adminStaff()` from `prisma/seed-performance-templates`
  are the standing fixtures for anything structure-shaped. Import them; do not retype a structure.
- **Blast radius changes:** `src/lib/server/performance/schemas.ts` now exports `answersSchemaFor`.
  Items 123 and 128 both consume it. It must not be duplicated at either call site.
- **Commands to stay green:** `pnpm test tests/unit/performance-capture-validation.test.ts`,
  `pnpm check`, `pnpm lint`, `pnpm format:check`.
- **Dependency changes:** none. No new packages.
