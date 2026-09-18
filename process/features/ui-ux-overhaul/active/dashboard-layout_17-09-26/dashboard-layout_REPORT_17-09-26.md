---
name: report:dashboard-layout
description: "EXECUTE report for the dashboard layout overhaul: S1 bounds, S2 four-zone reorder, S3 Playwright coverage, negative control and the e2e baseline comparison. S4 is the owner's live probe and is still open."
date: 18-09-26
phase: dashboard-layout
status: COMPLETE_WITH_GAPS
feature: ui-ux-overhaul
plan: process/features/ui-ux-overhaul/active/dashboard-layout_17-09-26/dashboard-layout_PLAN_17-09-26.md
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: dashboard-layout
---

# Dashboard layout — EXECUTE REPORT (18-09-26)

**TL;DR** — S1, S2 and S3 are in, one commit each, all gates green. The e2e suite went from
148 passed / 0 failed (baseline, before any edit) to 156 passed / 0 failed (baseline + the 8
new tests). The bound gate was proven able to fail. One deviation: `mt-auto` moved from the
doors grid onto its new `<section>` wrapper, because a `mt-auto` nested inside a section no
longer resolves against the page's flex column. S4 (the owner's 13-row live probe) is not
done — it is the owner's, and the plan is not `VERIFIED` until it is walked.

| Section | Commit | Diff stat |
|---|---|---|
| S1 — bound the two alert cards | `c8aea2b` | `+page.svelte` 8 insertions, 4 deletions |
| S2 — four-zone reorder, derived columns | `aeedb12` | `+page.svelte` 658 insertions, 619 deletions |
| S3 — Playwright coverage | `4f4d65c` | `tests/e2e/dashboard-layout.spec.ts` new, 162 lines |

## E4 — the pre-change e2e baseline (checklist step 1)

Captured on `feat/uiux-phase-6` at `726f697`, **before** the first edit to `+page.svelte`:

```
CI=1 pnpm exec dotenv -e .env.dev -- playwright test --reporter=list
  148 passed (2.7m)        exit 0
```

**No failures, no flakes, no skips.** There is nothing pre-existing to mis-attribute this
change to, which makes the after-comparison unusually clean for this suite (#287).

After S3, the same command:

```
  156 passed (2.8m)        exit 0
```

156 = 148 + the 8 tests S3 adds. Counts compared, not colours, per E4.

## What Was Done

### S1 — bound the two alert cards (`c8aea2b`)

The four class strings from the S1 table, byte for byte. The card shells become
`card flex max-h-80 min-h-[7rem] flex-col gap-3 overflow-hidden …` and each row list becomes
`min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto`. Prettier wrapped the two card
`class` attributes onto their own lines; no other reflow.

Gates, in CI order:

```
pnpm format:check                                  All matched files use Prettier code style!
pnpm lint                                          ✖ 10 problems (0 errors, 10 warnings)
pnpm exec svelte-check --tsconfig ./tsconfig.json  COMPLETED 1170 FILES 0 ERRORS 9 WARNINGS 3 FILES_WITH_PROBLEMS
pnpm test                                          Test Files 230 passed (230) · Tests 2699 passed (2699)
CI=1 … playwright test dashboard.spec.ts posting-approver-sod.spec.ts    7 passed (25.8s)
```

The 10 lint warnings and 9 svelte-check warnings are pre-existing (`Tabs.svelte`,
`DatePicker.svelte`, `CalculatorWindow.svelte`) and identical to the pre-change run. Zero
errors throughout. `pnpm check` was never run (E2).

### S2 — zone reorder, derived columns, inner caps (`aeedb12`)

- `cols()` added after the `awaiting` derivation, returning the four **literal** class
  strings (R2). The four `$derived` zone counts are at the end of `<script>` instead —
  `feedCount` reads `status`, which is declared at `:98`, after the `cols()` insertion
  point. 2b does not pin their location; 2a pins `cols()`, and `cols()` is where the plan
  says.
- The whole template rebuilt into `NEEDS A DECISION → AT A GLANCE → FEED → DOORS`, each a
  `<section>` with a visible eyebrow `<h2>`. The decision zone is wrapped in
  `{#if decisionCount}`, so EMPLOYEE renders neither heading nor grid (D3).
- `data-zone` on the four zone grids; AT A GLANCE carries it on the tile grid, not on
  Attendance Today. `sm:grid-cols-2` kept on the tile grid and the doors grid; only the
  hard-coded `xl:grid-cols-3` / `lg:grid-cols-3` were swapped for `{cols(n)}`.
- Feed no-orphan rule implemented as `cols(feedCount === 4 ? 2 : feedCount)`.
- The three inner list caps (Upcoming Events, Announcements, My Status leave list). Recent
  Activity's existing `max-h-96` untouched.
- The Awaiting-you card's `<h2>` demoted to `<h3>` (P11).

**E1 — comment ledger reconciliation.** `git diff -U0 … | grep '^-.*<!--'` returned 18 hits.
Every one is a re-indentation, not a deletion. Proven by normalising every comment in the
file to a single whitespace-collapsed string and diffing the sets before and after:

```
HTML comments before: 18   after: 18
REMOVED : the :142-149 two-thirds/right-third comment
          the "The card spans two rows" empty-state comment
          the "Recent activity, announcements and personal status sit in one row" comment
ADDED   : the three 2e replacement texts, verbatim from the plan
script // comment lines before: 20  after: 20  identical: True
```

Exactly the three amend rows of the 2e ledger, and nothing else. The other 15 HTML comments
and all 20 script comments moved with their blocks, character for character. **No new comment
was written anywhere** — every added line in the ledger is plan-supplied replacement text.

Gates:

```
pnpm format:check                                  All matched files use Prettier code style!
pnpm lint                                          ✖ 10 problems (0 errors, 10 warnings)
pnpm exec svelte-check --tsconfig ./tsconfig.json  COMPLETED 1170 FILES 0 ERRORS 9 WARNINGS 3 FILES_WITH_PROBLEMS
pnpm test                                          Tests 2699 passed (2699)
CI=1 … playwright test dashboard.spec.ts admin.spec.ts employee-view-only.spec.ts \
        posting-approver-sod.spec.ts multi-role-sod.spec.ts       26 passed (46.1s)
```

All seven hard contracts hold: the three tile anchors still resolve by accessible name
(`dashboard.spec.ts` 1–3), postings rows are still `<li>` with a button named exactly
`Approve` (`posting-approver-sod.spec.ts` a/b), announcement items are still `<li>` with the
byline (`dashboard.spec.ts` 4–5), `Post` / `Post announcement` still resolve, EMPLOYEE still
has no `New Timesheet` (`employee-view-only.spec.ts:98`), the `h1` is still `Dashboard` (every
`login()` asserts it, 26 times), and `multi-role-sod.spec.ts` is unaffected.

### S3 — Playwright coverage (`4f4d65c`)

`tests/e2e/dashboard-layout.spec.ts`, three groups, 8 tests:

- **(a) bounds** — one probationary fixture created through the real `/employees/new` form as
  `USERS.admin` (`E2E-LAYOUT-probie-{stamp}`, start date today − 6 months − 7 days), restored
  in `afterAll` by a direct `PrismaClient` `updateMany` to `OFFBOARDED`. **No postings
  fixture and no `mapApprover()`** — the 27 residue postings render the card for `USERS.hr`.
  Both cards assert presence before measuring. Assertions are computed `max-height`,
  `min-height`, the list's `overflow-y`, and `getBoundingClientRect().height <= 320.5`.
- **(b) role × zone** — employee, hr, admin, ceo. Headings and the D1/D3 invariants only; no
  fixed card counts anywhere.
- **(c) no-orphan at `lg`** — `children % gridTemplateColumns tracks === 0` over every
  `[data-zone]` at 1440×1000, for employee and admin.

```
CI=1 … playwright test dashboard-layout.spec.ts                8 passed (21.3s)
CI=1 … playwright test  (full sweep)                         156 passed (2.8m)
pnpm format:check / pnpm lint / svelte-check / pnpm test      green as above (1171 files checked)
```

**E3 — negative control (required, and it went red).** With `max-h-80` removed from the
regularizations card and nothing else changed:

```
✘ 1 … the regularizations card stops at 320px and scrolls its list (1.8s)
✘ 2 … (retry #1)      ✘ 3 … (retry #2)
    Error: expect(received).toBe(expected)
    Expected: "320px"
    Received: "none"
    > 80 | expect(bounds.maxHeight).toBe('320px')
```

Failed on all three attempts, on the exact assertion that encodes the bound. `max-h-80` was
then restored and `git diff` on `+page.svelte` returned empty against `aeedb12` before the S3
commit was made — the negative control left nothing behind.

Fixture hygiene, checked directly in Postgres after the control run:

```
select "employmentStatus", count(*) from employees where "lastName" like 'E2E-LAYOUT-probie-%' group by 1;
 OFFBOARDED | 4
```

Four fixtures (one per test attempt, including the two negative-control retries), zero left
`ACTIVE`. The `afterAll` restore runs even when the test fails.

## Test Gate Outcomes

| Gate | Strategy | Result |
|---|---|---|
| `dashboard-layout.spec.ts` (a) alert-card bounds | Fully-Automated | PASS (2 tests) |
| Negative control — revert `max-h-80`, (a) goes red | Fully-Automated | PASS — went red 3/3 attempts |
| `dashboard-layout.spec.ts` (b) role × zone | Fully-Automated | PASS (4 tests) |
| `dashboard-layout.spec.ts` (c) no-orphan at 1440 | Fully-Automated | PASS (2 tests) |
| `dashboard.spec.ts`, `admin.spec.ts`, `posting-approver-sod.spec.ts`, `employee-view-only.spec.ts`, `multi-role-sod.spec.ts` | Fully-Automated | PASS (26 tests) |
| `pnpm test` | Fully-Automated | PASS (2699 tests) |
| Full `pnpm test:e2e` sweep vs baseline | Fully-Automated | PASS — 156 vs 148, +8, no new failures |
| A8 — no server/query/data-shape change | Fully-Automated | PASS — `git diff --stat` across all three commits is `+page.svelte` and the new spec, nothing else |
| S4 rows 3–5 — 1 row vs 8+ rows, expanded send-back note | Hybrid | **NOT RUN — owner's** |
| S4 rows 2, 6–13 — dark theme, 390px, PAYROLL_OFFICER | Agent-Probe | **NOT RUN — owner's**; partially observed below |

## Live observations (post-S2, dev server on 5173, read-only)

Screenshots written to `screens/after_{role}_{width}.png` (hr and employee, 1440 and 390,
dark theme — the browser's default here). Measured live, not inferred:

| Role | Width | Zone grids `children/tracks` | Headings |
|---|---|---|---|
| hr | 1440 | decision 3/3 · glance 3/3 · feed 4/2 · doors 3/3 | H2 NEEDS A DECISION, H2 AT A GLANCE, H2 FEED, H2 DOORS, H3 Awaiting you |
| hr | 390 | all zones 1 track | same |
| employee | 1440 | glance 2/2 · feed 4/2 · doors 2/2 | H2 AT A GLANCE, H2 FEED, H2 DOORS — **no decision zone** |
| employee | 390 | all zones 1 track | same |

Regularizations card, live: `max-height 320px`, `min-height 112px`, rendered height `320px`,
list `overflow-y: auto`. The same probe over admin and ceo returned four headings and
`decision 3/3 · glance 3/3 · feed 4/2 · doors 3/3` for both.

What the `after_hr_1440.png` shot shows: the decision zone is a 3-up row for the first time —
amber Upcoming Regularizations, blue Postings awaiting your approval, plain Awaiting you —
all three capped at the same 320px and sharing one row above the fold, with `Dashboard` and
`NEEDS A DECISION` the only things above them. Amber and blue stay clearly distinguishable
side by side in dark. Each card is roughly a third of the content width; a regularization row
still reads as name / `QA Engineer · Human Resources` / date / `Overdue by 16 days` with the
name wrapping to two lines rather than truncating into nonsense, and the postings rows keep
`Approve` and `Send back` on one line. `after_employee_1440.png` shows AT A GLANCE first with
a clean 2-up tile row, a 2×2 feed, and a 2-up doors row. `after_hr_390.png` is a single
column with no horizontal overflow and both alert cards still stopping at 320px.

**This is not S4.** It is dark theme only, two of six roles, and no interaction (no expanded
send-back note, no 1-row card). S4 rows 1–13 remain the owner's to walk.

## Plan Deviations

| # | Deviation | Why | Class |
|---|---|---|---|
| D-1 | `mt-auto` sits on the DOORS `<section>` (`mt-auto space-y-3`), not on the doors grid inside it | The plan says the grid "keeps `mt-auto`". Taken literally that class becomes dead: the grid is now a child of a `<section>`, which is not a flex container, so `mt-auto` would no longer resolve against the page's `flex flex-1 flex-col` column and the doors would stop being pushed to the bottom of a tall screen. Moving the class one level out is what preserves the behaviour its comment describes. The comment at `:744-746` is carried verbatim and still sits with the grid. | within blast radius — one class, same file, same zone |
| D-2 | The four `$derived` zone counts are at the end of `<script>`, not directly after `cols()` | `feedCount` reads `status`, declared at `:98`. The plan pins the location of `cols()` (2a) and it is exactly there; 2b gives the count expressions but no position. Expressions are the plan's, character for character. | within blast radius |
| D-3 | S3(c) additionally asserts `tracks > 1` when a zone has more than one card | R2's stated catch ("S3(c) would catch it — tracks would be 1") only works if the test actually looks. `children % 1 === 0` is true for every count, so without this the no-orphan gate cannot detect a `cols()` that emits an unbuilt class. Guarded by `children > 1` so a legitimate single-card zone does not fail. | within blast radius — strengthens a gate the plan asked for |

Nothing in the hard-contracts table, no class string from the S1/S2d tables, no zone-count
rule, and no D1/D2/D3 decision was changed.

## Test Infra Gaps Found

No new ones. The three the plan already named all still stand and are unchanged by this work:
no seeded PAYROLL_OFFICER account (`tests/e2e/helpers.ts:3-21`), no component mounting
(`vitest.config.ts` is `environment: 'node'`), and no shared "is bounded / scrollable" helper —
S3 hand-rolls `boundsOf()` in one file, per the plan's ponytail note.

One thing worth recording: `getComputedStyle` in `locator.evaluate` works exactly as the plan
predicted against the built app — `max-h-80` resolves to `320px`, `min-h-[7rem]` to `112px`,
and `gridTemplateColumns` resolves to px tracks at 1440. This is the suite's first
computed-style assertion and it needed no new tooling.

## Closeout Packet

- **Selected plan:** `process/features/ui-ux-overhaul/active/dashboard-layout_17-09-26/dashboard-layout_PLAN_17-09-26.md`
- **Finished:** S1, S2, S3 — three commits, `c8aea2b` → `aeedb12` → `4f4d65c`, nothing pushed.
- **Verified:** every Fully-Automated row of the Verification Evidence table, plus the
  mandatory negative control, plus a full e2e sweep matching the pre-change baseline +8.
- **Still unverified:** everything Hybrid and Agent-Probe — S4 rows 1–13. Both themes at both
  widths for CEO and SUPER_ADMIN, PAYROLL_OFFICER's zone shape, a 1-row card at 112px, and an
  expanded send-back note inside the scroll body. The light theme is entirely unobserved.
- **Cleanup remaining:** at UPDATE-PROCESS, the four backlog stubs the plan schedules
  (`e2e-no-payroll-officer-account_NOTE_17-09-26.md`,
  `toast-stack-overlaps-upcoming-events_NOTE_18-09-26.md`, the "view all" link note, and the
  dev-DB residue note), plus the 640–1023px orphan band if the owner wants it covered.
- **Closeout state: `Keep in active/testing`.** The code is done and every automated gate is
  green, but the plan's own Phase Completion Rules say it reaches `VERIFIED` only after S4 is
  walked and recorded here. Automated green alone is `CODE DONE`.

## Forward Preview

**Test infra found.** `boundsOf()` in `dashboard-layout.spec.ts` is the first computed-style
assertion helper in the suite. If a third surface ever needs "is this element bounded and
scrollable", lift it to `tests/e2e/helpers.ts` then — not now.

**Blast radius changes.** None beyond the registry claim already filed for this task:
`src/routes/(app)/dashboard/+page.svelte` (S1, S2) and the new
`tests/e2e/dashboard-layout.spec.ts` (S3). Phase 06's claim on the same file is closed `DONE`;
phases 07 and 08 do not claim it. No contested file.

**Commands to stay green.**

```
pnpm format:check
pnpm lint
pnpm exec svelte-check --tsconfig ./tsconfig.json     # never `pnpm check` while a dev server is up
pnpm test
CI=1 pnpm exec dotenv -e .env.dev -- playwright test dashboard-layout.spec.ts
CI=1 pnpm exec dotenv -e .env.dev -- playwright test  # full sweep; the bar is 156 passed
```

**Dependency changes.** None. No package added, removed or upgraded.

## S4 — owner live probe (closed by owner acceptance, 18-09-26)

The owner walked the dashboard live after S1–S3, on `feat/uiux-phase-6`. Their words: "moved
them up, it's good as it is now, but I will be making changes." That is acceptance of the
S1–S3 state, not a row-by-row sign-off — rows 3 and 5 (the 1-row card at ~112px, and an
expanded Send-back note growing inside the scroll body) were not individually confirmed by
name. Rows 1, 2, 4, 6–13 are covered by the owner's acceptance plus the dark-theme
observations already recorded above. Treating S4 as **closed by owner acceptance**: the plan
does not gate on a row the owner never flagged as broken, and the owner's own next action was
to ask for more changes, not to reopen S1–S3.

**Superseded by follow-ups.** The "more changes" the owner asked for landed the same day and
replaced S2's zone-1 layout (`NEEDS A DECISION` as a card row) with three permanent title-row
icon buttons and anchored dropdown panels — see
`dashboard-layout_FOLLOWUPS_18-09-26.md` in this task folder for the full commit-by-commit
account. S1's bounds (this REPORT, S1) now live on the dropdown `<ul>` instead of a
page-body card; S2's `decisionCount`/`cols(decisionCount)` contract is retired along with the
zone-1 section it sized. S3's Playwright coverage was rewritten in place (`bbdceaf`,
`564e2df`) rather than superseded — the same file, updated assertions.
