---
name: report:ui-ux-overhaul-phase-10-container-bounds
description: "Phase 10 execution report — every list container in the app now has a ceiling. Three dashboard caps, ~20 scroll boxes, one shared .card-scroll class, three service functions, eleven RED mutations run."
date: 04-09-26
phase: "10"
status: COMPLETE
feature: ui-ux-overhaul
plan: process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-10-container-bounds_PLAN_03-09-26.md
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: phase-10
---

# Phase 10 — `container-bounds` — execution report

**TL;DR** — Eleven commits across eleven sections. Every list container in the app now has a
ceiling: one new `.card-scroll` class, three dashboard cards capped at ten, ~20 scroll boxes, and
three service functions that gained an optional `limit`. Eleven RED mutations were run and recorded.
The full CI gate set is green at every section boundary. **CODE DONE, not ✅ VERIFIED** — the e2e
run is the orchestrator's and the 390px/1440px look pass is the owner's.

**Branch:** `feat/uiux-phase-10`, rebased onto the phase-9 execute tip.
**Phase-9 tip this phase was built on:** `6decf06` (`plan(ui-ux): write the phase 10 validate-contract into the plan`), whose parent chain carries phase 9's execute commits. Zero file overlap with phase 9 — no login file was touched.

---

## What Was Done

### S0 — entry checks (`3067ce0`)

Re-verified against the current tree before any edit:

| Claim | Result |
|---|---|
| T1 — `listUpcomingEvents` reads the whole roster for four derived kinds | **CONFIRMED** at `dashboard.ts:469-481`, comment at `:469-470`, sole exit at `:591` |
| T2 — `listUpcomingRegularizations` has no `orderBy`, sorts in JS | **CONFIRMED** — `findMany` at `:22-37`, `.sort()` at `:53` |
| T3 — `/team` members reused for attendance | **CONFIRMED** — `employeeId: { in: members.map((m) => m.id) }` |
| T4 — five picker sites | **CONFIRMED**, `employees/[id]:510` already carries `max-h-48 overflow-y-auto` |
| T5 — documents feed the onboarding checklist | **CONFIRMED** — `documents.map((d) => d.category)` into `getEmployeeOnboarding` |
| T6 — thirteen paginated loads | **CONFIRMED**, 13 files call `paginate(` |
| RC-1 — `performance.ts` has `orderBy` at only three sites | **CONFIRMED** — `grep -n orderBy` returns `:26`, `:70`, `:81`; `listStalledSignoffs` has none |
| RC-2 — history events are derived | **CONFIRMED** |
| C1 — `addUTCMonths` overflows | **CONFIRMED, and it is documented in the source itself**: `dates.ts:168-170` says *"Jan 31 + 1 month is Mar 3 … not Feb 28"*, pinned by `tests/unit/dates-add-utc-months.test.ts` |

Blast-radius registry claim appended.

**Drift found:** the plan's config-scale list names an `/org-chart` route. **There is no
`src/routes/(app)/org-chart/`.** Checklist item 54's "re-derive with grep rather than trusting this
list" is exactly why that did not become a failure. `/settings/offboarding` also has no
`overflow-x-auto` wrapper — its clearance steps are a bare `<ul>`.

### S1 — the shared mechanism (`c003cc5`)

- `.card-scroll` in `src/app.css`, beside `.card`: `@apply max-h-[min(60vh,28rem)] overflow-y-auto`.
  One declaration, no breakpoint variant — 60vh shrinks it on a short viewport, 28rem stops it
  growing on a tall one.
- `tests/unit/container-bounds-scan.test.ts` — G5 (thirteen paginated pages) and G10 (the four
  never-cap traps). 34 assertions.
- **`Table.svelte` was NOT touched — E2 applied.** The component has exactly two call sites
  (`payslips/+page.svelte:32`, `settings/backup/+page.svelte:217`), neither a phase-10 target, and
  **no** phase-10 target uses it — all ~20 containers are hand-rolled `{#each}` or `<table>`. A
  `maxHeight` prop would have shipped with zero consumers. G4 and AC7 are dropped with it.

### S2 — Upcoming Events (`5c939d3`)

`listUpcomingEvents` gained `limit?: number`, applied at the return as a slice of the merged sorted
output. Cap 10 at `dashboard/+page.server.ts`. Pattern B on the `<ul>`: `min-h-0 flex-1
overflow-y-auto`, because the card already declares `flex h-full flex-col` and `.card-scroll` would
fight it. No view-all link (no `/events` page exists).

**E5 applied:** the `<li>` contents are `<p>`/`<span>` only — nothing focusable — so the scroll
region carries `tabindex="0"`, `role="region"` and `aria-label="Upcoming events"`. Svelte's
`a11y_no_noninteractive_tabindex` fires on that and is suppressed with a one-line
`svelte-ignore` plus the reason: the rule is right in general and wrong for a scroll container,
because WCAG 2.1.1 needs the tab stop precisely *because* nothing inside is focusable.

### S3 — Upcoming Regularizations (`854c2b0`) — **E1 applied**

`orderBy: { startDate: 'asc' }` went in as the plan says, with a comment stating it is query
determinism ONLY. The cap is a `.slice()` **after** the JS `daysUntil` sort, never a query `take`.
Cap 10, `.card-scroll` on the `<ul>`, and the `View all employees` link inside an E8 heading row.

### S4 — Postings awaiting approval (`5b454a8`)

`listPostingsAwaitingApprover` gained `limit?: number`, applied to the **approvable** set after the
filter. Cap 10, `.card-scroll`, and the mandatory `View all postings` link in an E8 heading wrapper.

The chain was refactored to `const approvable = pending.filter(...)` then
`approvable.slice(...).map(...)` — Prettier wrapped the original single expression in parentheses,
and the named intermediate reads better and shrinks the diff. The G1b mutation was **re-run against
the final shape**, not just the first one.

### S5 — `/employees/[id]`, the 201 file (`cbb081b`)

`const LIST_RENDER_CAP = 25` plus a `{#snippet truncated(total)}` that renders **only when
`total > 25`** (OD-2 as settled).

| Panel | Treatment |
|---|---|
| Documents, Employment History, Loans, Cash Advances, Recurring Earnings, Recurring Deductions | cap 25 + ceiling + note |
| Leave Balances, Benefits, Emergency contacts, Onboarding steps | ceiling only (config-scale) |
| The two supervisor pickers | untouched (T4) |

No service edit — RC-2 and T5 both forbid it.

### S6 — `/team` matrix (`28a8162`) — **OD-1 resolved: sticky KEPT**

The bound went on the existing `overflow-x-auto` wrapper (E7), giving both axes in one box. The
sticky attempt **succeeded on the first try and was kept**: `sticky top-0` sits on each `<th>`
rather than on `<thead>` (a sticky `thead` does not carry its background with it), with three
z-layers because this is now a two-axis sticky — corner cell `z-30` > date headers `z-20` >
the already-sticky employee-name column `z-10`. The members query was not touched.

*Caveat, honestly stated:* "it works" here means it compiles, typechecks and the z-order is
correct by construction. The visual proof is item 3 on the owner's list below.

### S7 — `/benefits` and `/leave/balances` (`76bd34a`)

Both benefits tables and the balances matrix got the ceiling on their existing wrappers.
`/leave/balances` has **no cap** — it is the view-all destination for `/leave` (D-6).

### S8 — `/performance` (`313dd78`)

All four tables, ceiling only, no service edit (RC-1). **C12 confirmed:** none of the four uses
`Table.svelte`; all are hand-rolled inside `overflow-x-auto` divs.

### S9 — `/payroll/[id]` and `/profile` (`dc024fc`)

Ceiling on the payroll run wrapper (kept `overflow-x-auto` — this is the widest money table in the
app) and on the three profile panels. Punches are already 14-day windowed by the loader.

### S10 — settings and config-scale (`ef3fb0f`)

Fourteen wrappers across `/settings/org` (2), `/settings/roles`, `/branches`, `/departments`,
`/settings/posting-approvers`, `/payroll/statutory-rates` (2), `/settings/salary-grades` (2),
`/settings/schedules`, `/settings/pay-codes` (2), and `/settings/offboarding`'s bare `<ul>`.
Ceilings only — `/settings/org`'s arrays feed a client-side search, so capping the source would make
the search unable to find a row that exists. `/settings/roles`' existing `PILL_CAP` was left alone.

### S11 — verification and close (this commit)

`tests/e2e/container-bounds.spec.ts` (E3-compliant, self-seeded), both backlog notes, the
`prisma-mock` infra note, the responsive-sweep cross-reference, and this report.

---

## Test Gate Outcomes

The full CI gate set ran in CI order — `pnpm format:check && pnpm lint && pnpm check && pnpm test` —
at **every** section boundary, green before each commit.

| Gate | Result |
|---|---|
| `pnpm format:check` | **PASS** at every boundary |
| `pnpm lint` | **PASS**, 0 errors. Back to the single pre-existing warning (`CalculatorWindow.svelte:82`) — the one warning this phase introduced was suppressed with a justified `svelte-ignore` |
| `pnpm check` | **PASS**, 0 errors, 1141 files |
| `pnpm test` | **PASS**, 2504 tests / 216 files (was 2495 / 215 — 9 new) |
| G1, G1b, G2, G3, G3b | **GREEN** — `tests/unit/container-bounds.test.ts`, 9 tests |
| G5, G10 | **GREEN** — `tests/unit/container-bounds-scan.test.ts`, 34 tests |
| G6, G7, G8, G9 | **WRITTEN, NOT RUN** — `tests/e2e/container-bounds.spec.ts`. e2e is the orchestrator's at the phase boundary |
| G11 | **READ, NOT RUN** — see below |
| G4 | **DROPPED** — E2 removed the prop it guarded |

### G11 — `tests/e2e/dashboard.spec.ts` risk, read not re-run

Its locator is `page.locator('li', { hasText: TITLE }).filter({ hasText: 'Byline check.' })`. The
body-text filter is what saves it: this phase adds `<li>` elements to three sibling cards and to the
e2e fixtures, and **none** of them carries the text `Byline check.`. Risk assessed **LOW**. If it
goes red at the boundary, read the failure — do not re-run blindly (#287).

---

## RED Mutation Evidence

Eleven mutations run. Every mutation was applied to the working tree, the gate observed, and the
file restored **from a scratchpad copy** — never `git checkout` on a tracked file.

| # | Gate | Mutation | Expected | Observed |
|---|---|---|---|---|
| M1 | G5 | `take: pagination.take` → `take: 10` in `employees/+page.server.ts` | red | **RED** — "gained a literal take" |
| M2 | G10 | `listEmployeeDocuments(..., 10)` | red | **RED** |
| M3 | G10 | `take: 10` on the `/team` members `findMany` | red | **RED** — "/team members gained a take" |
| M4 | G2 | move the limit onto the roster `findMany` | red | **RED** — the two earliest birthdays vanished; first row became `2026-06-04` instead of `2026-06-02` |
| M5 | G1 | remove the regularizations slice | red | **RED** — 25 returned |
| M6 | G3 | **delete `orderBy` only** | *(see below)* | **GREEN — mutation VOID** |
| M7 | G3 | delete BOTH the `orderBy` and the JS `.sort()` | G3 red, G1 green | **RED on G3 + G3b, G1 GREEN** |
| M8 | **G3b** | put the cap back as a query `take` on `startDate asc` | G3b red, G1 green | **RED on G3b only, G1 GREEN** |
| M9 | G1b | move the slice before the `.filter()` | red | **RED** — 5 approvable rows instead of 10 |
| M10 | G1b | same, re-run against the refactored `approvable` shape | red | **RED** |
| M11 | C4 live | *(unintentional)* the word `tabindex="0"` inside a code comment in `leave/balances/+page.svelte` | — | **RED** — `a11y-invariants` failed with *"no converted row is still a focusable fake control"*. C4 predicted this exact confusing failure; E4 named the cause. Comment reworded to "tab stop" |

### M6 — a named gate gap, stated honestly

Plan checklist item 23 specified: *delete the `orderBy` → G3 must go red while G2 stays green.* Run
it, and **G3 stays green**. That mutation is **VOID**, and E7's rule says to report it rather than
accept the green.

The reason is E1 itself, not a defect. Once the cap moved off the query and onto a slice after the
JS `daysUntil` sort, the `orderBy` stopped being what orders the card — the JS sort does that
alone. The `orderBy` survives for query determinism, as E1 instructs, but it is **no longer
load-bearing**, so nothing can go red when it is removed.

What replaced it, and both were run:

- **M7** deletes *both* ordering mechanisms and turns G3 red while G1 stays green — the negative
  control shape the plan asked for, now correctly aimed at the mechanism that actually orders.
- **M8** is the control E1 specified: putting the cap back where the plan originally wanted it
  turns **G3b** red, alone, while G1 stays green. It is the direct empirical proof that a query
  `take` on `startDate asc` returns the wrong rows.

G3b also **measured C1 in the shipped code** rather than reasoning about it: with start dates
2025-08-30 / 08-31 / 09-01 and `asOf` 2026-02-20, the service returns regularization dates
2026-03-02 / 2026-03-03 / **2026-03-01** — the September row first. The overflow is real.

---

## Plan Deviations

| # | Deviation | Class | Why |
|---|---|---|---|
| D1 | `Table.svelte` prop, G4 and AC7 dropped | **binding — E2** | Zero consumers. Not a deviation from the contract; a deviation from the plan body, which the contract overrides |
| D2 | The regularizations cap is a slice, not a query `take` | **binding — E1** | `addUTCMonths` overflows |
| D3 | G3's specified RED mutation is VOID; M7 and M8 substituted | within blast radius | Consequence of E1. Fully documented above rather than quietly replaced |
| D4 | `listPostingsAwaitingApprover` refactored to a named `approvable` const | within blast radius | Prettier wrapped the original expression in parens; the named form is shorter and clearer. Mutation re-run against the final shape |
| D5 | `/org-chart` not bounded | within blast radius | **The route does not exist.** Plan list was stale; item 54 mandated re-derivation |
| D6 | `/settings/offboarding` bound on a bare `<ul>`, not an `overflow-x-auto` wrapper | within blast radius | It has no such wrapper |
| D7 | `svelte-ignore a11y_no_noninteractive_tabindex` added on the Upcoming Events `<ul>` | within blast radius | E5 requires the tab stop; the Svelte rule fires on it. Suppression is one line with the reason; the alternative was leaving a new lint warning in a repo that carries exactly one |
| D8 | Truncation note implemented as a `{#snippet}` | within blast radius | Six call sites on one page; six copies of the same three lines would be worse |

**Nothing in the hard-stop class occurred.** No auth, billing, schema, migration, container or
secret surface was touched. No evidence pack required (the contract agrees).

---

## Test Infra Gaps Found

1. **The repo's Prisma mock is `where`-only.** Confirmed at execution: reusing it would have made
   every cap assertion vacuous. Phase 10 built a where → orderBy → take → project client locally.
   Backlog: `prisma-mock-orderby-take-helper_NOTE_04-09-26.md`.
2. **The mock's projection helper has a latent bug.** `dashboard-org-scoping.test.ts`'s `project()`
   recurses into a relation's `{ select: { … } }` **without unwrapping the inner `select`**, so it
   looks for a field literally named `select`. It never fires there because that file's only
   relation select happens not to reach the branch. Phase 10's copy fixes it; the original is
   untouched (out of scope). Noted so the shared helper does not inherit it.
3. **No component-render tier exists**, so G5/G10 can only ever be source scans and AC7 could never
   have been proven as written (C13 was right).
4. **No viewport-matrix Playwright projects.** Cross-referenced into
   `phase-03-responsive-sweep_NOTE_03-09-26.md` rather than opening a third note.
5. **`a11y-invariants` scans at file level**, so a *comment* containing `tabindex="0"` fails it.
   That is arguably too blunt, but tightening the gate mid-phase would weaken it — left alone,
   recorded here.

---

## What Was Skipped or Deferred

- **`pnpm test:e2e`** — not run here by instruction; the orchestrator runs it at the boundary.
- **P1, P2, P3 (agent probes)** — not run. They need a running app and a seeded DB, and this repo's
  rule is that the owner starts servers. They fold into the owner list below.
- **The impeccable audit pass (A1)** — not run in this session. Standing repo rule for UI work;
  flagged for the boundary.
- **Query cost** — unchanged for every container. All three service caps are JS slices. Recorded.

---

## Closeout Packet

- **Selected plan:** `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-10-container-bounds_PLAN_03-09-26.md`
- **Finished:** all eleven sections; ~26 source files; 3 new test files; 3 backlog notes written or
  updated; 11 RED mutations run and recorded.
- **Verified:** the full CI gate set, green at every boundary. Nine unit gates green with mutation
  proof. The C1 arithmetic measured in the shipped code.
- **Unverified:** every e2e gate (G6–G9, G11), all three agent probes, the impeccable pass, and
  everything visual.
- **Single best next state:** `Keep in active/testing`. Code is done; the e2e run and the owner's
  look pass are the remaining gates. **`CODE DONE`, not `✅ VERIFIED`.**

---

## Owner Manual-Test Additions — for PROGRAM CLOSE

Every item is a **look pass**: open the page at 390×844 and again at 1440×900.

| # | Surface | At 390px | At 1440px |
|---|---|---|---|
| 1 | `/dashboard` | three capped cards fit; nothing pushes past the viewport; each scroll box is usable with a thumb | cards do not look empty at cap 10; the grid row heights still balance; **both new links land correctly** — `View all employees` → `/employees`, `View all postings` → `/recruitment` |
| 2 | `/dashboard` keyboard | Tab reaches the Upcoming Events list and the arrow keys scroll it — this is the one scroll box with nothing focusable inside | same |
| 3 | **`/team`** — highest-value item | matrix scrolls both ways; the sticky header does **not** overlap rows; the corner cell stays above both the date headers and the name column when scrolling diagonally | header stays put on a long roster; no z-order flicker |
| 4 | `/employees/[id]` | each capped panel's "Showing the first 25 of N" note is readable; tabs still switch; the note is **absent** on panels with ≤25 rows | 25 rows inside a 28rem box does not look truncated by accident |
| 5 | `/leave/balances` | both scroll axes work; **count the rows against the employee count — no row may be missing** | column growth with many leave types still readable |
| 6 | `/payroll/[id]` | the widest money table still scrolls sideways and is not clipped | seven numeric columns unaffected by the vertical box |
| 7 | `/performance`, `/benefits`, `/profile`, `/settings/org`, `/settings/roles` | scroll boxes usable | no card looks artificially short at 28rem |
| 8 | Config-scale pages (`/branches`, `/departments`, `/settings/schedules`, `/settings/pay-codes`, `/settings/salary-grades`, `/settings/posting-approvers`, `/settings/offboarding`, `/payroll/statutory-rates`) | quick sweep: nothing clipped | quick sweep: no box shorter than its content warrants |
| 9 | Regression R1 | nav resolves for HR_ADMIN / MANAGER / employee | same |
| 10 | Regression R2 | masked-reveal walk on `employees/[id]` — mask holds, reveal once, audit row written | same |

**The judgment call to make at #1 and #7:** ten rows and 25 rows are owner defaults. No gate can
tell a useful cap from a frustrating one — that is the whole of AC14, and it is yours.

---

## Forward Preview

### Test infra found
The `where`-only Prisma mock and its `select`-unwrapping bug; no component-render tier; no viewport
matrix; `a11y-invariants` scans at file level and will fail on a code comment.

### Blast radius changes
`Table.svelte` came **out** of the blast radius (E2). `/org-chart` does not exist. Otherwise the
registry claim as written holds; it is annotated `status: DONE`.

### Commands to stay green
```
pnpm format:check && pnpm lint && pnpm check && pnpm test
```
Plus, at the boundary: `pnpm test:e2e`, with `tests/e2e/dashboard.spec.ts` **read** if it goes red.

### Dependency changes
None. No new npm dependency, no schema change, no migration, no `rbac.ts` change.

**Public contract changes (all additive, all optional):**
- `listUpcomingEvents(orgId, viewer, asOf?, limit?)`
- `listUpcomingRegularizations(orgId, asOf?, limit?)`
- `listPostingsAwaitingApprover(orgId, actorEmployeeId, actorRoles, actorUserId, limit?)`
- `.card-scroll` — additive; `.card` itself is unchanged.

Every existing caller is unaffected: each function has exactly one route caller, and
`tests/unit/recruitment-posting-sod.test.ts:298` passes four positional arguments, so the optional
fifth is inert. `/api/v1/dashboard` calls none of the three.
