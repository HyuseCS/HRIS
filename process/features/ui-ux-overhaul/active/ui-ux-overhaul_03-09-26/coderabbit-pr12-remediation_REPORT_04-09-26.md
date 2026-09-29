---
name: report:coderabbit-pr12-remediation
description: "EXECUTE report for the CodeRabbit PR #12 remediation — 16 steps, 4 commits, all gates green, the A2 negative control run for real"
date: 04-09-26
feature: ui-ux-overhaul
plan: process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/coderabbit-pr12-remediation_PLAN_04-09-26.md
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: "03"
status: COMPLETE
---

# EXECUTE — CodeRabbit PR #12 remediation

**TL;DR.** All 16 steps done, four commits in order, every gate green at every boundary. The A2
negative control was run for real: five transitions, two genuine REDs, `src/app.css` byte-identical
afterwards. The two e2e specs were run on request and passed (6/6). `src/app.css` was never changed.

## Baseline (§V.1, untouched tree at `b10c43b`)

| Gate | Result |
|---|---|
| `pnpm format:check` | PASS |
| `pnpm lint` | 0 errors, 1 pre-existing warning (`CalculatorWindow.svelte:82`) |
| `pnpm check` | **1102 files, 0 errors, 1 warning** |
| `pnpm test` | 200 files, 2280 tests, all passed |

**Plan drift:** the plan records the `pnpm check` baseline as 1099 files. It is **1102** at
`b10c43b`. Zero errors either way, so the baseline holds; the file count had simply moved.

## Commits

| # | SHA | Subject |
|---|---|---|
| C1 | `b932c5c` | `fix(ui): close the two code findings from the PR #12 review` |
| C2 | `1bbf93b` | `docs(ui-ux): correct four counts and claims in the phase 03 execute reports` |
| C3 | `007dd1a` | `docs(ui-ux): correct the phase 03 backlog notes and the plan's dark-pair figures` |
| C4 | `e4c09ce` | `docs+test: reject the false badge-dot finding and guard the rule that proves it` |

11 files, +197 / −75. No `Co-Authored-By`, no AI-attribution footer. Not pushed.

## Steps

| Step | What | Where |
|---|---|---|
| 1 | F2 `Props` → `BaseProps &` (title-or-labelledBy union) | `src/lib/components/ui/Dialog.svelte:16-45` |
| 2 | 7 consumers compile untouched | `pnpm check` 1102 files / 0 errors |
| 3 | `title="New timesheet"` → `"New Timesheet"` | `src/lib/components/timesheets/NewTimesheetDialog.svelte:37` |
| 4 | dialog locators recased; button locators untouched | `tests/e2e/timesheet-create-for-employee.spec.ts:74`, `tests/e2e/manager-org-wide-timesheets.spec.ts:79` |
| 5 | F4 `36` → `46` | `…s1-s5_REPORT_03-09-26.md:31` |
| 6 | F5 restated as three duplicated identical orange copies folding to yellow | `…s1-s5_REPORT…:100-104` |
| 7 | F6 `22` → `23`; table at `:33` untouched | `…s13-s17_REPORT…:111` |
| 8 | F7 → `59 of 61` + holdout footnote | `…s13-s17_REPORT…:279`, footnote at `:285-287` |
| 9 | F8 `plan:` → `note:` | `phase-03-responsive-sweep_NOTE_03-09-26.md:2` |
| 10 | F9 split into pattern 1 (3 pages) and pattern 3 (10 pages) | same file, `:27-37` |
| 11 | F10 retitled "Reconciliation"; closes at 31, names ApplicantKanban's 3 | `phase-03-residual-dark-only-colours_NOTE…:35-52` |
| 12 | F11 one answer in both places, S5 basis named, advice rewritten | same file, `:11-15` and `:70-75` |
| 13 | X1 rewritten with re-run figures (E1 applied) | `phase-03-design-system_PLAN_03-09-26.md:595-616` |
| 14 | A2 new `describe`; `appCss`/`toneRules`/`tones` hoisted to module scope (E3) | `tests/unit/badge-class-literals.test.ts:15-38, 63-94` |
| 15 | A2 negative control — five transitions, see below | — |
| 16 | A1 rejection record (E2 applied to the header line) | `code-review-pr-12.md:10-14, 93-140, 155-162` |

## Gate outcomes at each boundary

| Boundary | format:check | lint | check | test |
|---|---|---|---|---|
| baseline | PASS | 0 err / 1 warn | 1102 / 0 err / 1 warn | 2280 passed |
| C1 `b932c5c` | PASS (after `prettier --write Dialog.svelte`) | 0 err / 1 warn | 1102 / 0 err / 1 warn | 2280 passed |
| C2 `1bbf93b` | PASS | 0 err / 1 warn | 1102 / 0 err / 1 warn | 2280 passed |
| C3 `007dd1a` | PASS | 0 err / 1 warn | 1102 / 0 err / 1 warn | 2280 passed |
| C4 `e4c09ce` | PASS | 0 err / 1 warn | 1102 / 0 err / 1 warn | **2286 passed** (+6 from A2) |

## §V.2 — the F2 negative control (AC-6)

A scratch `src/lib/components/ui/__nameless-control.svelte` holding
`<Dialog bind:open>{#snippet children()}x{/snippet}</Dialog>` made `pnpm check` go RED:

```
ERROR "src/lib/components/ui/__nameless-control.svelte" 6:7
"Type '{ open: boolean; children: () => any; }' is not assignable to type 'Props | undefined'. …
Property 'labelledBy' is missing in type '{ open: boolean; children: () => any; }'
but required in type '{ labelledBy: string; title?: undefined; }'."
COMPLETED 1103 FILES 1 ERRORS 1 WARNINGS 2 FILES_WITH_PROBLEMS
```

The scratch file was a NEW untracked file, deleted with `rm` — no tracked file was ever restored.

## §V.6 — the A2 negative control (AC-3), all five transitions

1. **GREEN** — `Test Files 1 passed (1) / Tests 13 passed (13)`
2. **RED, Mutation A** (deleted `.badge::before`, `src/app.css:155-158`):
   `× .badge::before exists and declares content` → `AssertionError: expected null not to be null`
   at `badge-class-literals.test.ts:84`. `Tests 1 failed | 12 passed (13)`
3. **GREEN** after restore — `Tests 13 passed (13)`
4. **RED, Mutation B** (removed `badge ` from `.badge-green`'s `@apply`):
   `× badge-green still routes through @apply badge` —
   `Received: "@apply bg-green-500/15 text-green-800 dark:text-green-400;"` at `:92`.
   `Tests 1 failed | 12 passed (13)`. The failure **names `badge-green`**, as required.
5. **GREEN** after restore — `Tests 13 passed (13)`

`git diff --exit-code src/app.css` → exit 0. `git diff c030e7f -- src/app.css` → 0 lines (AC-1).
Restore was by `cp` from a scratch copy taken before the first mutation; no `git checkout`/`restore`
was used on any file.

## §V.3 and §V.4 re-derivations (all reproduced exactly)

```
anchors:              :31 "Files changed (36" · :111 "EmptyState across 22" · :279 "plus nested users"
F6  S16 commit 15ffdd1                     → 23
F7  (app) +page.svelte                     → 61
F7  with PageHeader                        → 59
F7  holdouts        → approvals/+page.svelte, payslips/[id]/+page.svelte
F5  baseline RETURNED (7742e59)            → 3 sites, all bg-orange-500/15 text-orange-400
F8  backlog note prefixes                  → 15 notes, all "note:", zero "plan:"
X1  total occurrences                      → 137
X1  files                                  → 37
X1  dark:-paired                           → 21
X1  bare                                   → 116
X1  11-file subset lines                   → 31   (occurrences also 31 — one match per line)
X1  subset bare / paired                   → 24 / 7
X1  complement bare                        → 92        (92 + 24 = 116 ✓, 24 + 7 = 31 ✓)
    paired-per-file: ApplicantKanban 3; payroll/config, payroll/statutory-rates,
    reports, settings/company 1 each
F9  report :78-90                          → pattern 1 = 3 pages, pattern 3 = 10 pages
F11 pill files at HEAD                     → 10/5/3/2/2/1 = 23 (S5 basis is 24, per KG-2)
```

E1 was applied: the 31 is written as "31 matching lines … each line carries exactly one match, so
31 is also the occurrence total for that subset", and the old `104` is named as `135 − 31`.

## E2E (owner-requested, beyond KG-1)

```
npx dotenv -e .env.dev -- tsx scripts/seed-uiux-demo.ts --clear    → cleared
pnpm test:e2e tests/e2e/timesheet-create-for-employee.spec.ts \
              tests/e2e/manager-org-wide-timesheets.spec.ts        → 6 passed (46.2s)
npx dotenv -e .env.dev -- tsx scripts/seed-uiux-demo.ts            → re-seeded
```

KG-1 is now **closed for these two specs**, not deferred. The plan's premise held: both locators
bind either way.

## Plan Deviations

1. **`pnpm tsx scripts/seed-uiux-demo.ts` does not work as the plan writes it.** The script needs
   `DATABASE_URL`, which lives in `.env.dev` and is not loaded by a bare `pnpm tsx`. It fails with a
   Prisma validation error. The working form is
   `npx dotenv -e .env.dev -- tsx scripts/seed-uiux-demo.ts`, matching every other DB script in
   `package.json`. Within blast radius (command form only, no file changed).
2. **`prettier --write` was needed on `Dialog.svelte`** after Step 1. Prettier reformats the union's
   leading `|`. In blast radius; `format:check` is a named C1 gate.
3. **Step 13 also corrected one sentence the plan did not list.** The AC-7 scope note still read
   "Most are decorative or muted-icon uses, not status pills" — which after Step 12 contradicts the
   backlog note. Step 13's own requirement is that the rewrite "does not contradict the backlog
   note", so the sentence was corrected in the same edit.
4. **Step 16's edit 5 numbering.** The plan says "renumber so F3 and F2 lead". Done, plus an
   explicit "There is no user-visible defect in this set." line above the list.

## Things in the plan that were wrong when checked against source

- **`pnpm check` baseline is 1102 files, not the plan's 1099.** 0 errors either way.
- **The seed command in §V.5 / KG-1 is missing its `dotenv -e .env.dev` wrapper** (deviation 1).
  If the owner copies the plan's command verbatim it will fail.
- **Nothing else.** Every anchor (`:31`, `:111`, `:279`, `:35`), every count, and every §V.4 figure
  reproduced exactly as the amendment recorded them.

## Test Infra Gaps Found

None new. TI-1 (nothing in the unit tier sees the built stylesheet) and TI-2 (no screenshot tier)
stand as the plan records them, and A2's own comment says in plain words that it guards the source
rule only.

## Known Gaps at exit

- **KG-1 — CLOSED** for the two edited specs (6/6 passed above).
- **KG-2, KG-3, KG-4, KG-5** — unchanged, still named residuals.

## Closeout Packet

- **Plan:** `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/coderabbit-pr12-remediation_PLAN_04-09-26.md`
- **Finished:** all 16 steps, 4 commits, 11 files.
- **Verified:** AC-1 through AC-3, AC-5 through AC-9, AC-11 through AC-13, AC-15 (numeric half),
  AC-17, AC-18 (structural half), AC-21 — all by command, outputs above. AC-6 and AC-3 both carry a
  real negative control that went RED.
- **Not machine-verifiable (Agent-Probe, judged by the executing agent, not independently
  re-read):** AC-4, AC-10, AC-14, AC-16, AC-19, AC-20 — the five rewritten prose passages plus the
  test comments. Per the plan's Phase Completion Rules these need an Agent-Probe read recorded
  before `VERIFIED`.
- **Remaining:** the Agent-Probe read of the five passages, then the owner's own review. Nothing is
  pushed.
- **Best next state:** `Keep in active/testing` — code is `CODE DONE` with every automated gate
  green, but `VERIFIED` needs the Agent-Probe pass the plan requires.

## Forward Preview

- **Test infra found:** e2e needs `dotenv -e .env.dev` on every seed/script call; the suite builds
  and runs its own preview server, so it does not collide with the owner's dev server.
- **Blast radius changes:** none beyond the 11 files. `src/app.css` proven untouched.
- **Commands to stay green:** `pnpm format:check && pnpm lint && pnpm check && pnpm test`, in that
  order. CI runs format first and skips the rest on failure.
- **Dependency changes:** none.
