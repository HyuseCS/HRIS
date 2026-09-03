---
name: report:performance-eval-bimonthly-178-phase-2
description: Phase 2 (Schema foundation) EXECUTE report — items 50-61 done; 62 pre-cleared by the orchestrator, 63-66 deliberately left unrun (they need the DB)
date: 27-08-26
metadata:
  node_type: memory
  type: report
  feature: performance-eval-bimonthly-178
  phase: PHASE 2 — Schema foundation
---

# Phase 2 EXECUTE report — Schema foundation (#178)

**Status: CODE DONE.** Items 50-61 applied. Nothing was run against the database and nothing
was committed. `pnpm prisma validate`, `pnpm check`, `pnpm lint`, `pnpm format:check` and
`pnpm test` are all green after the change.

## What Was Done

| Item | Target | Status |
|---|---|---|
| 50 | `enum ReviewStatus` — `MANAGER_REVIEW` → `SCORED`, `SIGNING` added | done |
| 51 | `enum NotificationKind` — `PERFORMANCE` added | done |
| 52 | `model PerformanceTemplate` | done |
| 53 | `model ReviewSignoff` | done |
| 54 | `model PerformanceConfig` | done |
| 55 | `ReviewCycle` — `@@unique([organizationId, startDate, endDate])` + `@@index([organizationId, status])` | done |
| 56 | `PerformanceReview` — 8 columns, `releasedBy` + `signoffs` relations, 3 indexes | done |
| 57 | `Employee` — `assignedTemplateId`, `assignedTemplate`, `releasedReviews`, `headedDepartments` | done |
| 58 | `Department` — `headEmployeeId` + `head` | done |
| 59 | `User` — `reviewSignoffs` | done |
| 60 | `Organization` — `performanceTemplates`, `performanceConfig` | done |
| 61 | `scripts/migrate-review-status-scored.ts` created (NOT run) | done |

Files changed:
- `prisma/schema.prisma`
- `src/lib/components/dashboard/ActivityIcon.svelte` (unplanned — see Deviations)
- `scripts/migrate-review-status-scored.ts` (new)

## What Was Skipped or Deferred

- **62** — pre-cleared by the orchestrator before this session: 1 `review_cycles` row,
  0 duplicates, 0 `performance_reviews`. The new `@@unique` cannot fail the push.
- **63-66** — out of scope by instruction. `migrate-review-status-scored.ts` has never been
  executed, `pnpm db:push` has never been run, and no `\d` / `enum_range` check has happened.
  The generated Prisma client in `node_modules` is now AHEAD of the live database.

## Test Gate Outcomes

| Gate | Result |
|---|---|
| `pnpm exec dotenv -e .env.dev -- prisma validate` | PASS — "The schema at prisma/schema.prisma is valid" |
| `pnpm exec dotenv -e .env.dev -- prisma generate` | PASS |
| `pnpm check` | PASS — 0 errors, 1 pre-existing a11y warning (`CalculatorWindow.svelte:82`) |
| `pnpm lint` | PASS — 0 errors, same pre-existing warning |
| `pnpm format:check` | PASS |
| `pnpm test` | PASS — 158 files, 1845 tests. `performance-redact.test.ts` still green, exactly as item 65 predicted |
| `tsc --noEmit --strict scripts/migrate-review-status-scored.ts` | PASS (extra — `pnpm check` does not cover `scripts/**`) |

Nothing here is blocked on the unrun push. Every gate that Phase 2 can prove without a database
is green.

## Plan Deviations

1. **`src/lib/components/dashboard/ActivityIcon.svelte` — one unplanned edit, forced by item 51.**
   That file holds `const ICONS: Record<NotificationKind, …>`, an exhaustive map. Adding
   `PERFORMANCE` to the enum made `pnpm check` fail with
   `Property 'PERFORMANCE' is missing in type … but required in type 'Record<NotificationKind, …>'`.
   The plan never names this file, and item 64 demands a green `pnpm check`, so the entry was
   added (indigo tint, clipboard-with-check paths, inserted before `GENERAL` so the
   `?? ICONS.GENERAL` fallback still reads last). Within-blast-radius, minimum diff, no
   behaviour change to any other kind. This is the only site: `NotificationKind` is referenced
   in exactly two files (`ActivityIcon.svelte`, `services/notifications.ts`), and the second
   only uses it as a parameter type.

2. **Comment blocks: verbatim prose, stripped line citations.** Items 52-54 say "with the
   comment block verbatim" and the text is reproduced word for word, with one exception —
   the plan's inline schema line references (`StatutoryRateConfig.sssTable / birTaxTable
   (:1201, :1205)`, `BackupConfig (:994-1013)`, `PayrollRun already uses (:1241)`,
   `SeparationRecord.preFinalizeState (:1098)`) were dropped, keeping the model names.
   Reason: Phase 1 deleted `model Goal` and `enum GoalStatus`, and Phase 2 adds ~150 lines, so
   every one of those numbers is already wrong. Committing a stale line number as a permanent
   schema comment is worse than committing the model name alone. The `#178 AC6` / `AC 20` /
   `AC 2` acceptance-criterion tags were likewise generalised into prose, because the SPEC is
   the reference, not a number a future reader cannot resolve from the schema.

3. **`prisma format` reflowed the `model User` relation block.** Adding
   `reviewSignoffs ReviewSignoff[]` widened the type column, so the formatter re-aligned six
   neighbouring lines. Whitespace only, formatter-driven, unavoidable.

## Line-Number Drift Found In The Plan

Every citation in §3.2-§3.4 is stale. Located by content instead; all targets were
unambiguous.

| Plan says | Actually is |
|---|---|
| `ReviewStatus :254-260` | `254-260` — correct |
| `NotificationKind :1155-1160` | `1145-1152` (VALIDATE's "actual is :1153-1160" nit was itself wrong) |
| `Department :372-390` | `365-383` |
| `Employee :440-500 region` | `419-506` |
| `ReviewCycle :1637-1651` | `1629-1643` |
| `PerformanceReview :1653-1674` | `1645-1666` |

## Two Things Worth Flagging To The Owner

1. **`PerformanceReview.releasedByUserId` points at `Employee`, not `User`.** That is exactly
   what §3.4 specifies (`releasedBy Employee? @relation("ReviewReleasedBy", …)` plus
   `Employee.releasedReviews`), so it was built as written and it is internally consistent.
   The column NAME is misleading — it holds an employee id. `ReviewSignoff.attestedByUserId`
   really does point at `User`, so the two "…UserId" columns in this feature reference
   different tables. Not a defect; a rename would need its own migration and is not in scope.
2. **The generated client is now ahead of the live DB.** Anything that boots the app against
   `veent-db-5434` before item 63 runs will see `SCORED`/`SIGNING`/`PERFORMANCE` in types that
   Postgres does not have yet.

## Test Infra Gaps Found

- `scripts/**` is still outside `pnpm check` (already a known gap, restated by §3.6). The new
  script was typechecked by hand with a one-off `tsc --noEmit --strict` pass; nothing in CI
  will repeat that.

## Closeout Packet

- **Selected plan:** `process/features/performance-eval-bimonthly-178/active/performance-eval-bimonthly-178_25-08-26/performance-eval-bimonthly-178_PLAN_25-08-26.md`
- **Finished:** items 50-61.
- **Verified:** schema parses, client generates, typecheck/lint/format/tests green.
- **Unverified:** everything that needs Postgres — the rename script's five branches, the push,
  the `\d` and `enum_range` checks (items 63-66).
- **Remaining cleanup:** the orchestrator runs 63-66, then one logical commit (no
  `Co-Authored-By`).
- **Best next state:** `Keep in active/testing` — Phase 2 is CODE DONE, not `✅ VERIFIED`.

## Forward Preview

- **Test Infra Found:** no new harness needed for Phase 2. Phase 3 will need the first
  `src/lib/server/performance/` unit tests; the `vi.hoisted` + `vi.mock('$lib/server/db')`
  harness in `tests/unit/review-privacy.test.ts:17-35` is the pattern to copy.
- **Blast Radius Changes:** one file outside the plan's listed touchpoints —
  `src/lib/components/dashboard/ActivityIcon.svelte`. Add it to the plan's Touchpoints.
- **Commands to Stay Green:** `pnpm exec dotenv -e .env.dev -- prisma generate` **before**
  `pnpm check`; then `pnpm check && pnpm lint && pnpm format:check && pnpm test`.
- **Dependency Changes:** none. No package added or removed.
