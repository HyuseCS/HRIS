---
phase: phase-03-design-system-s1-s5
date: 2026-09-03
status: COMPLETE_WITH_GAPS
feature: ui-ux-overhaul
plan: process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-03-design-system_PLAN_03-09-26.md
---

# Phase 03, sections S1–S5 — EXECUTE report

**TL;DR.** All five sections are committed and the full CI gate set is green on each commit. The
S4+S5 exit grep returns nothing, so AC-4 is met. Three real defects were found and fixed inside the
sweep. One thing the plan did not predict: the Sentence-case labels break 12 e2e assertions, which
are fixed here in a sixth commit. Hybrid gates (light/dark spot-check, contrast measurement) are
DEFERRED — they need a running server, which the owner starts.

## What Was Done

| Section | Commit | Gate |
|---|---|---|
| S1 — theme-paired badge tokens + scrollbar hover | `199debf` | format/lint/check/test green — 197 files, 2208 tests |
| S2 — `$lib/labels.ts` + exhaustiveness test | `20308ff` | green — 198 files, 2250 tests |
| S3 — `Badge.svelte` + `badge.ts` + tone test | `ecfe9fa` | green — 199 files, 2261 tests |
| S4 — badge adoption, people + time | `7d17744` | green — 199 files, 2267 tests |
| S5 — badge adoption, pay/cases/perf/recruitment/settings/reports | `60db203` | green — 199 files, 2273 tests |
| S5 follow-on — e2e locator casing | `099c734` | green — 199 files, 2273 tests |

`pnpm check`: 1099 files, **0 errors**, 1 warning (`CalculatorWindow.svelte` a11y — pre-existing,
present in the baseline).

### Files changed (36, all presentation-layer)

Created: `src/lib/labels.ts`, `src/lib/components/ui/badge.ts`,
`src/lib/components/ui/Badge.svelte`, `tests/unit/labels.test.ts`,
`tests/unit/badge-tone.test.ts`, plus the AC-7 backlog note.

Modified: `src/app.css`; the 10 S4 files; the 20 S5 files; 9 e2e specs.
**Zero** `+page.server.ts`, zero schema, zero S6–S17 files.

## Test Gate Outcomes

| Gate | Tier | Result |
|---|---|---|
| `pnpm format:check` | Fully-Automated | PASS at all 6 commits |
| `pnpm lint` | Fully-Automated | PASS (0 errors; 1 pre-existing warning) |
| `pnpm check` | Fully-Automated | PASS, 0 errors |
| `pnpm test` | Fully-Automated | PASS, 2273 tests |
| `tests/unit/labels.test.ts` (AC-3) | Fully-Automated | PASS — 25 enums exhaustive vs `@prisma/client`, fallback proven |
| `tests/unit/badge-tone.test.ts` (AC-2) | Fully-Automated | PASS — gray+raw on unknown, overrides honoured, no throw |
| S4+S5 exit grep (AC-4) | Fully-Automated | **PASS — returns nothing** |
| §8.3 light/dark spot-check (AC-7 hybrid) | Hybrid | **DEFERRED** — needs the owner-started server |
| §8.5 contrast measurement (AC-8) | Hybrid | **DEFERRED** — same precondition |
| `pnpm test:e2e` | Fully-Automated | **NOT RUN** — belongs to the S12/S15/S17 boundaries |

### Mutation check on the AC-3 gate

`labels.test.ts` was written after the map it tests, so a red-first run was not possible. Instead it
was mutation-checked: deleting `EmploymentType.ON_CALL` from the map turned it red with
`EmploymentType.ON_CALL has no label`, then the value was restored. The gate can fail.

## Contrast Ratios

The plan measured these during VALIDATE, composited over the light card (`--card: 0 0% 100%`) at the
badge's 12px `font-medium`, where the 4.5:1 floor applies (no large-text allowance):

| Pair | Ratio | Verdict |
|---|---|---|
| `text-yellow-800` on `bg-yellow-500/20` | 6.02:1 | PASS |
| `text-blue-700` on `bg-blue-500/15` | 5.64:1 | PASS |
| `text-red-700` on `bg-red-500/15` | 5.32:1 | PASS |
| `text-green-700` on `bg-green-500/15` | 4.40:1 | FAIL → replaced with `green-800` (OD-1 default) |
| `text-muted-foreground` on `bg-muted` | 4.34:1 light / 4.20:1 dark | FAIL → replaced with `text-foreground/70` (OD-1 default) |

**Pairs I introduced that the plan did NOT measure — flagged, unmeasured:**

- `text-green-800` on `bg-green-500/15` and `text-foreground/70` on `bg-muted` — the two OD-1
  replacements. The plan requires re-measuring both in §8.5 and neither has been.
- `text-orange-800 dark:text-orange-400` on `bg-orange-500/15` — approval-chain RETURNED circle
  (requests/[id]) and the team calendar INCOMPLETE cell.
- `text-purple-800 dark:text-purple-400` on `bg-purple-500/15` — team calendar HOLIDAY cell.
- `text-amber-800 dark:text-amber-400` on `bg-amber-500/15` — audit-log LOGIN_FAILED tag; and
  `text-amber-700 dark:text-amber-400` on `bg-amber-500/15` — the employees/[id] salary-band chip
  and the team LATE cell.
- `text-green-700 dark:text-green-400` on `bg-green-500/15` at **circle** sizes (requests/[id] step
  circles, schedules toggles, the schedules "default" chip). These are not 12px badge text; the
  green-700 4.40:1 figure applies, so they need their own measurement against their real size.

All of the above are Hybrid-tier and stay unmeasured until the owner's pass.

## Defects Found and Fixed

1. **`EmployeeCard.svelte` coloured two impossible statuses** (named in the plan). It switched on
   `employmentStatus` but branched on `PROBATIONARY` (an `EmploymentType`) and `RESIGNED` (not a
   member of any enum) — both unreachable. The one reachable status it missed, `ON_LEAVE`, fell to
   the gray default and rendered identically to `OFFBOARDED`. Now yellow.
2. **`performance/+page.svelte` toned review CYCLE status with the review helper.** The helper knows
   `PENDING`/`SCORED`/`SIGNING`/`COMPLETED`/`ACKNOWLEDGED`; a cycle is `DRAFT`/`ACTIVE`/`CLOSED`, so
   every cycle fell through to the blue else-branch. Now uses the `reviewCycle` domain. Not in the
   plan.
3. **`RETURNED` was two different colours** for the same `RequestStatus` — orange on `/leave`,
   orange on `/requests`, and the detail page's own copy. All now one tone.

## Plan Deviations

All are within blast radius (presentation-only, inside the named files).

1. **Orange and purple fold into the 5-tone set.** The old helpers used `bg-orange-*`/`bg-purple-*`
   for `RETURNED`, `OFFER`, `INCOMPLETE`, `SCORED`, `SIGNING`, `INTERVIEW`. There is no
   `.badge-orange`/`.badge-purple` and S1 forbids new class names, so these resolve to yellow/blue.
   This is a visible colour change on those statuses. Recorded in `badge.ts` comments.
2. **Six enums added to `labels.ts` beyond the plan's 19**: `AttendanceStatus`,
   `BenefitEnrollmentStatus`, `LoanStatus`, `BackupRunStatus`, `JobPostingStatus`, `OfferStatus`.
   The sweep found badges rendering all six. Plan S4.3 mandates exactly this (add to the map, never
   inline). Total is 25.
3. **`COMPLAINT_STATUS_LABELS` copy taken from the pages, not from the enum.** Both complaint pages
   already rendered "Awaiting employee"/"Awaiting HR". Using the generic "Open"/"Responded" would
   have been a copy regression, so the better copy became the shared copy.
4. **Four sites keep their existing markup and get colour pairs only**, because `<Badge>` is the
   wrong tool for them:
   - `team/+page.svelte` calendar cells — sized on a 1–2 letter code, a label would not fit.
   - `settings/schedules` tardiness toggles (×2) — they are `<button>`s; `Badge` renders a `<span>`,
     so converting them would have silently killed a form submit.
   - `reports/audit-log` action tag — square by design, and an auditor wants the raw enum text.
   - `requests/[id]` approval-chain circles — plan S5.6/S5.7 explicitly require this.
5. **`BalanceSummary.svelte` unchanged.** It is in the S4 list, but its Paid/Unpaid chips are
   booleans already using the shared `.badge-*` classes; they inherited the S1 fix. Converting them
   would have added code and removed nothing.
6. **`EmployeeCard`'s badge gained a `shrink-0` wrapper span.** `Badge` has no `class` prop (YAGNI,
   per plan S3.3) and the pill is a flex child that needs it. A wrapper was preferred over adding an
   escape-hatch prop.
7. **`payroll/+page.svelte`'s override asterisk moved just outside the pill.** It used to render
   inside the badge span; `Badge` takes no children. It now sits immediately after, and got a
   light-mode pair.
8. **Sixth commit, not five.** The e2e locator fix (below) is a direct consequence of S4/S5 and is
   committed separately rather than being folded into an already-gated section commit.

## Unplanned Work: 12 e2e assertions

The plan predicted e2e exposure from *dialog accessible names* (S8–S12) and *`<h1>` text*
(S14/S15). It did **not** predict that Sentence-case badge labels break status-text assertions.
Twelve across nine specs matched SCREAMING_CASE badge text and would have gone red at the S12
boundary. Each is now case-insensitive, so it holds under either casing and a phase-08 copy pass
cannot break it again. DB/API enum assertions are untouched.

**This fix is unverified by a run** — `pnpm test:e2e` was out of scope here.

## Test Infra Gaps Found

- No unit tier can render a Svelte component (`vitest.config.ts` is `environment: 'node'`). So
  nothing proves `Badge.svelte` renders `class="badge-{tone}"` correctly — only that `badge.ts`
  resolves the right tone. The wiring between them is covered by `pnpm check` and nothing else.
- Nothing automated checks a colour. A badge with a correct tone and a broken `.badge-*` rule passes
  every gate in this report.

## Closeout Packet

- **Selected plan**: `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-03-design-system_PLAN_03-09-26.md`
- **Finished**: S1, S2, S3, S4, S5 — committed, each with a green full CI gate.
- **Verified**: every Fully-Automated gate for AC-2, AC-3, AC-4, AC-9. Exit grep returns nothing.
- **Unverified**: AC-7 hybrid (light/dark computed-style spot-check on the 5 named pages), AC-8
  (contrast re-measurement, including the 5 unmeasured pairs listed above), and the e2e suite.
- **Classification**: `Keep in active/testing`. S6–S17 are unstarted and the hybrid gates for S1–S5
  are unrun, so this phase is **CODE DONE for S1–S5, not VERIFIED**.
- **Next**: S6 (`Dialog.svelte`) per the same plan.

## Forward Preview

**Test infra found.** `pnpm test:e2e` is the only tier that can catch what this phase breaks, and it
is not run until S12. Consider running it once after S5 rather than waiting — this section alone
would have shipped 12 red assertions undetected.

**Blast radius changes.** `src/lib/labels.ts` and `src/lib/components/ui/badge.ts` are now imported
by 25 files. Any change to a label string is a UI copy change across every page in the sweep.
`inventory` and `branches` also read their `<select>` options from these maps.

**Commands to stay green.** `pnpm format:check && pnpm lint && pnpm check && pnpm test`. Run
`pnpm prettier --write` on touched files before `format:check` — CI runs format first and skips the
rest on failure.

**Dependency changes.** None. No package added or removed.

## Follow-up Stubs Created

- `process/features/ui-ux-overhaul/backlog/phase-03-residual-dark-only-colours_NOTE_03-09-26.md` —
  AC-7 named residual. The re-count corrects the plan: **24 dark-only occurrences across 6 files**,
  not 31 across 11. Five named files were already paired.
- **Not written here**: `phase-03-responsive-sweep_NOTE_03-09-26.md`. That residual covers the whole
  sweep including S13–S17, so it belongs to a later section's owner.

## CONTEXT_PARTIAL

- `CONTEXT_PARTIAL: hybrid verification` — every colour and theme claim in this report is
  arithmetic from the plan, not a measurement of the running app. No server was started, per the
  standing rule that the owner starts them.
