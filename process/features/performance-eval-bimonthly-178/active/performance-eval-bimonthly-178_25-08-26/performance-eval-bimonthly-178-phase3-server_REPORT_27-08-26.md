---
name: report:performance-eval-bimonthly-178-phase-3-server
description: Phase 3 (Template CRUD) EXECUTE report — SERVER half only; items 67-70, 72, 74, 76-81 done; 71/73/75 belong to the UI agent
date: 27-08-26
metadata:
  node_type: memory
  type: report
  feature: performance-eval-bimonthly-178
  phase: PHASE 3 — Template CRUD (server half)
---

# Phase 3 EXECUTE report — server half (#178)

**Status: CODE DONE.** Items 67, 68, 69, 70, 72, 74, 76, 77, 78, 79, 80, 81 applied. Nothing
committed. All four gates green. The seed ran twice against `veent-db-5434` and is idempotent.

## What Was Done

| Item | Target | Status |
|---|---|---|
| 67 | `src/lib/server/performance/types.ts` | done |
| 68 | `src/lib/server/performance/schemas.ts` | done (`releaseSchema` deliberately omitted — see Deviations) |
| 69 | `src/lib/server/services/performance-templates.ts` (NEW file) | done (+1 extra export) |
| 70 | `(app)/performance/templates/+page.server.ts` | done |
| 72 | `(app)/performance/templates/[id]/+page.server.ts` | done |
| 74 | `api/v1/performance/templates/+server.ts` | done |
| 76 | `prisma/seed-performance-templates.ts` | done, RUN, idempotent |
| 77 | `package.json` → `db:seed:templates` | done |
| 78 | `tests/unit/performance-template-schema.test.ts` | done — 10 tests |
| 79 | `tests/unit/performance-template-render.test.ts` | done — 6 tests |
| 80 | `tests/unit/performance-templates-rbac.test.ts` | done — 11 tests, mutation-checked |
| 81 | gates | all green |
| 71, 73, 75 | `.svelte` files | OUT OF SCOPE — the UI agent's |

New file outside the plan's list: `src/lib/performance/ids.ts` (see Deviations).

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `pnpm check` | PASS — 0 errors, 1 pre-existing a11y warning (`CalculatorWindow.svelte:82`) |
| `pnpm test` | PASS — 161 files, 1872 tests (was 158/1845; +3 files, +27 tests) |
| `pnpm lint` | PASS — 0 errors, same pre-existing warning |
| `pnpm format:check` | PASS |
| `tsc --noEmit --strict prisma/seed-performance-templates.ts` | PASS (`pnpm check` does not cover `prisma/**`) |
| `pnpm db:seed:templates` | PASS twice — 6 rows, unchanged ids on re-run |

## Item 80 mutation check — BOTH halves observed

- **Guard swapped** `ADMINISTER_HR_ORGWIDE` → `MANAGE_HR` in both `+page.server.ts` files:
  5 failed / 6 passed. All five MANAGER cases went RED; every HR_ADMIN case stayed green.
- **Reverted** by re-editing the same two files (never `git checkout`): 11/11 pass.

The test is therefore not vacuous: it fails against a broken guard.

## Plan Deviations

1. **`newId()` cannot live only in `$lib/server` — item 68 as written is unbuildable for the
   builder.** §8.3 has the client mint an id the moment HR adds a row, and SvelteKit refuses a
   client import of `$lib/server/**`. `newId` is defined in the new client-safe
   `src/lib/performance/ids.ts` and RE-EXPORTED from `schemas.ts`, so item 68's letter holds and
   the builder can import it. Its import inside `schemas.ts` is relative (`../../performance/ids`)
   rather than `$lib/...` because `tsx` runs the seed without SvelteKit's aliases.
2. **`blankTemplateStructure()` added to `schemas.ts`.** Not in the plan. A brand-new template must
   persist a VALID structure before the redirect to `[id]`, and the design brief requires the
   builder to open on a pre-filled shape, not a void. It carries the §9 shared content (5→1 scale,
   six bands, ceiling 100, three narratives, six recommendations, four signatories) and one empty
   category with one empty criterion. The seed spreads it, so the shared content has ONE source.
3. **`releaseSchema` omitted.** §5 names it, but nothing anywhere defines its shape and the RELEASE
   action's only input is the route param. Inventing a body now is a guess Phase 8 must undo. All
   other §5 schemas except `answersSchemaFor` (Phase 6, by plan) are present.
4. **`countReviewsUsingTemplate(templateId)` added to the service.** §8.4 requires `openReviewCount`
   on the `[id]` load and item 69's export list omits the query that produces it.
5. **Structure strings are permissive; ids are not.** `templateStructureSchema` allows an empty
   category name / criterion text (so a half-composed draft saves and the blank structure is valid)
   but rejects exactly the six malformations item 78 names, plus any unknown key and any duplicate
   id anywhere in the document.
6. **`Prisma.InputJsonValue` widening.** Prisma types a Json column input as an index-signature
   object, which a named interface never satisfies; `asJson()` in the service widens a
   already-schema-validated structure. Comment says so at the site.
7. **The seed is `update: {}`.** "Idempotent upsert" is read as "never overwrite a template HR has
   since edited". A re-run creates nothing and changes nothing.

## Line-Number Drift Found In The Plan

All §11.2 / §8 citations that name `performance.ts` line numbers are stale after Phase 1.
Nothing was located by line number; every target was found by content and was unambiguous.

## Test Infra Gaps Found

- `prisma/**` is still outside `pnpm check`. The seed was typechecked by a one-off
  `tsc --noEmit --strict` pass; CI repeats nothing.
- The seed exports its two builders and guards its runner with a `process.argv[1]` check so the
  unit tests can assert on the SEEDED structures rather than on retyped copies. Without that guard,
  importing the seed in a test would open a database connection.

## Closeout Packet

- **Selected plan:** `process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_PLAN_25-08-26.md`
- **Finished:** items 67-70, 72, 74, 76-81.
- **Verified:** four gates green, 27 new tests, mutation check red-then-green, seed run live.
- **Unverified:** every browser-level claim — no page renders until items 71/73/75 exist.
- **Best next state:** `Keep in active/testing` — the UI agent builds items 71, 73, 75 next.

## Forward Preview — what the UI agent builds against

- **Test Infra Found:** `tests/unit/performance-templates-rbac.test.ts` is the harness to copy for
  any further action-level guard test on this surface.
- **Blast Radius Changes:** one file outside the plan's list — `src/lib/performance/ids.ts`.
- **Commands to Stay Green:** `pnpm exec dotenv -e .env.dev -- prisma generate` then
  `pnpm check && pnpm lint && pnpm format:check && pnpm test`.
- **Dependency Changes:** none.
