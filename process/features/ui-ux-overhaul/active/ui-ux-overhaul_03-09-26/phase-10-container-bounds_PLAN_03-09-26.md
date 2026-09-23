---
name: plan:ui-ux-overhaul-phase-10-container-bounds
description: "Phase 10 of the Veent HRIS UI/UX overhaul, PORTED to staging 9cc3dcc on 23-09-26 — bound every list container that grows with database rows. Re-applies the intent of the 16 reference commits f9514d7..origin/feat/uiux-phase-10 by hand onto current files: one .card-scroll class, dashboard caps of 10 with true totals on the badges, 201-file render caps, plain-site ceilings, and a red-capable scan + e2e."
date: 03-09-26
feature: ui-ux-overhaul
phase: "10"
---

# Phase 10 — `container-bounds` (PORT to staging)

**TL;DR** — Phase 10 was built once, on base `f9514d7`. Staging moved 498 commits since. This plan
is now a **port plan**: EXECUTE re-applies the intent of the old commits by hand onto today's files.
It does not cherry-pick. Six lanes run in parallel, each owning its own files. The dashboard gets
cap 10 on three lists, and the two dropdown badges show the **real** total. The scan test that is
red on the branch today gets fixed so it can still fail for the right reason.

**Date**: 03-09-26 (written) · **Revised**: 23-09-26 (port)
**Status**: PORT PLANNED — port PVL CONDITIONAL 23-09-26 (VC-1..VC-15). On branch: `.card-scroll` + the scan test only (`197cf02`).
**Complexity**: COMPLEX (single phase plan, ~20 source files, 6 parallel lanes)
**Feature**: ui-ux-overhaul
**Phase**: 10 of 10 — `container-bounds`
**Branch**: `feat/uiux-phase-10-bounds` = `origin/staging` (`9cc3dcc`) + 4 ported commits. PR #19 is
CLOSED; this branch gets a fresh PR against `staging` when the owner says so.

---

## Port to staging 9cc3dcc (23-09-26)

**Read this section first.** Every section below it has been revised for the port. Where the old
03-09-26 text was wrong for staging it was replaced, not stacked on. The old validate-contract is kept
further down, with a status mark on every item.

### What changed and why

| # | Change | Why |
|---|---|---|
| P-1 | **Method: port by hand, not cherry-pick.** The 16 commits `f9514d7..origin/feat/uiux-phase-10` are the **reference implementation**. EXECUTE reads them with `git show <sha>` and re-applies their intent to the current file. | Staging moved 498 commits. `employees/[id]/+page.svelte` drifted +82/-40; the dashboard cards became title-row dropdown panels; pay codes and salary grades moved under `/payroll`. A cherry-pick would conflict or, worse, apply cleanly onto the wrong lines. |
| P-2 | **Regularizations and Postings are dropdown panels now**, not cards. Staging already bounds them: panel `max-h-[calc(100dvh-9rem)]`, list `min-h-0 flex-1 overflow-y-auto` (`dashboard/+page.svelte:244-284`, `:286-358`). | Owner D1: keep that shape. Do **not** add `.card-scroll`. Add cap 10 + a "View all" link inside each panel. |
| P-3 | **True totals on the badges.** The title-row buttons show `data.regularizations.length` and `data.postingsToApprove.length` (`:148`, `:169`, `:182`, `:203`). Under a cap of 10 those would say "10" when 40 wait. | Owner D1: the server sends `regularizationsTotal` and `postingsToApproveTotal`; the badge text and its `aria-label` use them. |
| P-4 | **The cap moves from the service to the route load for Regularizations and Postings.** The route calls the service with no limit, takes `.length` as the total, then slices to 10. `recruitment.ts` is **not** edited. `dashboard.ts` gets only the `orderBy` for `listUpcomingRegularizations` (from `854c2b0`) and the `limit` for `listUpcomingEvents` (from `5c939d3`). | The total needs the full list anyway. Both old service caps were already post-query (C1/E1 moved the regularizations cap after the JS sort; the postings cap was after the approver filter), so the query cost is the same. One slice in the route is the smallest diff that gives both the cap and the total. |
| P-5 | **Upcoming Events keeps staging's `max-h-80 overflow-y-auto`** on its list (`:834`). Add cap 10 and the keyboard region (`tabindex="0"`, `role="region"`, `aria-label="Upcoming events"`) from `5c939d3`. Do **not** port 5c939d3's `min-h-0 flex-1` Pattern B. | Staging already has a real ceiling there. Pattern B depends on the grid row having a height, which the restructured dashboard no longer guarantees. Less layout risk, same bound. |
| P-6 | **Dropped sites (owner D2):** `leave/balances`, `settings/roles`, performance EMPLOYEE view (`:215`, `:256`), `/team` + `TeamMatrix`. So `76bd34a`'s leave-balances half, the roles hunk of `ef3fb0f`, and all of `28a8162` are **not** ported. | Staging already bounds these in the lg-only fill-window shape. Keep staging's shape. |
| P-7 | **Performance ADMIN view is in scope** (`performance/+page.svelte:42`, `:87`, `:130`, `:171`). | Unbounded at every width on staging. |
| P-8 | **Moved paths:** pay codes → `payroll/pay-codes/+page.svelte:47`, `:130`; salary grades → `payroll/salary-grades/+page.svelte:47`, `:144`. The grade `<select>` at `:182` is a picker: **never cap**. | `settings/pay-codes` and `settings/salary-grades` are 308 redirects now. |
| P-9 | **The scan test must be fixed so it can still fail.** It is RED on the branch (4 failed / 30 passed). G5's `/\.slice\(0,/` hits string slices in 3 paginated loads. G10's `/team` T3 needle points at a file that is now a paginated people list. | Loosening would make the gate vacuous. The fix is an exact-string allowlist for the known string slices, and T3 moves to where the coupling now lives (`attendance/+page.server.ts:100`). Each fix gets a negative control. |
| P-10 | **Cap-collision fixes in other e2e specs.** A cap of 10 turns fixture residue into failures. `dashboard-layout.spec.ts:112-113` (PROBIE in regularizations), `:157-158` (its POSTING), and `posting-approver-sod.spec.ts:60-70` are exposed. | House rule: a render cap turns fixture residue into failures — sweep in `beforeAll` AND use unique names. See Section 6. |
| P-11 | **The 8 gap surfaces go to a backlog note**, not this PR (owner D3): `process/features/ui-ux-overhaul/backlog/container-bounds-gaps_NOTE_23-09-26.md`. | Port only. |
| P-12 | **No NEW comments.** The old commits carried long justifying comments. EXECUTE carries **existing** comments verbatim and adds none. The `<!-- svelte-ignore a11y_no_noninteractive_tabindex -->` directive is a compiler directive, not a comment, and is allowed. The why goes in the commit message. | Owner standing rule. |
| P-13 | **`Table.svelte` is not touched** (old E2 stands). **No `recruitment.ts` edit.** Gates are `bun run …`, not `pnpm …`. | E2 found zero consumers; P-4 removes the postings service change; the repo moved to bun. |

### Owner decisions (binding, do not re-ask)

- **D1** — Regularizations + Postings panels: cap 10 + "View all" link; server sends the true total
  for the badge and its `aria-label`. Upcoming Events: cap 10 + keyboard region. Keep staging's panel
  bounds. Recent Activity keeps 25. Awaiting-you panel (cap 20, `PENDING_ITEM_LIMIT`) untouched.
- **D2** — Sites already bounded on staging in the lg-only fill-window shape keep that shape:
  `leave/balances`, `settings/roles`, performance EMPLOYEE view, `/team` + `TeamMatrix`.
  Performance ADMIN tables are in scope.
- **D3** — Port only. Gaps go to the backlog note.

### What is already on the branch

| Commit | Content | State |
|---|---|---|
| `8bfcf07`, `3ba8d9d`, `d7cf164` | plan, validate-contract, registry claim | ported |
| `197cf02` | `.card-scroll` in `src/app.css:249-251` + `tests/unit/container-bounds-scan.test.ts` | ported; **scan is RED** — fixed in Lane D1 |

---

## Overview

Nothing on this app stopped a list growing forever. Staging has since bounded some lists (the
dropdown panels, the lg fill-window pages). This port finishes the job on the rest, using the same
rule the original phase used:

1. **Cap** the items loaded or rendered.
2. **Max-height plus scroll inside** as the backstop.
3. **"View all" link** where a destination already exists.

It must scale on all screen sizes, phone through wide desktop.

## Goal

Every list container in this port's site list has a ceiling at every width. The two dashboard badges
tell the truth about how many items wait.

## Non-Goals

- **No new destination pages.** Upcoming Events has no view-all link (no `/events` page).
- **No filtered view-all.** "View all employees" goes to `/employees` unfiltered; the label must not
  promise a filter. The filtered deep link stays in
  `backlog/dashboard-alert-panels-need-view-all-link_NOTE_18-09-26.md`.
- **No change to staging's lg-only fill-window sites** (D2): `leave/balances`, `settings/roles`,
  performance EMPLOYEE view, `/team`, `TeamMatrix`.
- **No change to the Awaiting-you panel**, Recent Activity (25), Announcements, My Status.
- **No change to the paginated pages.** The scan proves it.
- **No cap on any picker `<select>`** — including the salary-grade select at
  `payroll/salary-grades/+page.svelte:182`.
- **No query cap on `employees/[id]` documents** (T5) or history (RC-2).
- **No `Table.svelte` prop, no `recruitment.ts` edit, no schema change, no `rbac.ts` change, no new
  dependency.**
- **No fix for the 8 gap surfaces** — they go to `container-bounds-gaps_NOTE_23-09-26.md`.
- **Not fixing the 2 pre-existing e2e failures** (`payroll-approval.spec.ts:77`,
  `timesheet-approval.spec.ts:99`).

---

## Settled Decisions (do not reopen)

Carried from 03-09-26, each marked for the port.

| Id | Decision | Port status |
|---|---|---|
| D-1 | Narrow lift of the `src/lib/server/services/**` hard stop | **AMENDED.** Now only `dashboard.ts`: `listUpcomingEvents` gains optional `limit` applied to the merged sorted output (as `5c939d3`); `listUpcomingRegularizations` gains `orderBy: { startDate: 'asc' }` for tie determinism only (as `854c2b0`) and **no** limit. `recruitment.ts` is not touched (P-4). |
| D-2 | The six fetch-vs-markup traps | **STILL BINDING**, amended: T1 holds (`dashboard.ts:449`). T2 holds and is stronger under C1 (see D-3). T3 moved: the members→attendance coupling now lives in `attendance/+page.server.ts:82-100` and those members are **paginated**; `/team` is out of scope (D2). T4 holds, plus the salary-grade select. T5 holds. T6 holds. |
| D-3 | Regularization order under the cap | **AMENDED by C1.** `startDate` asc is **not** `daysUntil` asc (`addUTCMonths`, `src/lib/utils/dates.ts:172-176`, overflows). The cap is a slice taken **after** the service's JS sort by `daysUntil` (`dashboard.ts:53`). With P-4 that slice lives in the route load. |
| D-4 | No new destination pages | **STILL BINDING.** Regularizations → `/employees`, label `View all employees`. Postings → `/recruitment`, label `View all postings` (mandatory — the rows carry decide forms). Events → no link. |
| D-5 | Cap default 10 | **STILL BINDING.** Dashboard 10. 201 file 25 rendered. Recent Activity 25 untouched. |
| D-6 | `/leave/balances` scroll-only | **OBSOLETE for this port** — the page is dropped (D2). The no-cap scan assertion stays as a guard. |
| D-7 | Responsive idiom | **STILL BINDING for plain sites:** `.card-scroll` = `max-h-[min(60vh,28rem)] overflow-y-auto`, on the existing `overflow-x-auto` wrapper where one exists (E7). Pattern B is **not** used (P-5). Never add `md:`/`2xl:`. |
| D-8 | Shared mechanism | **AMENDED.** One addition only: `.card-scroll` (already on the branch). No `Table.svelte` prop. |
| RC-1 | `/performance` markup-only | **STILL BINDING** for the admin tables. |
| RC-2 | 201 file render-only | **STILL BINDING.** |

---

## Site table (staging `9cc3dcc` line numbers, paths under `src/routes/(app)/`)

EXECUTE must re-read each line before editing. Numbers were verified on 23-09-26.

| Site | Lines | Treatment | Lane | Reference commit |
|---|---|---|---|---|
| dashboard Upcoming Events list | `dashboard/+page.svelte:834` | cap 10 (service `limit`), keep `max-h-80 overflow-y-auto`, add region + tabindex | A | `5c939d3` |
| dashboard Regularizations panel | `:244-284` (list `:261`), badge `:148`/`:169` | cap 10 in route, total to badge + aria-label, "View all employees" link | A | `854c2b0` |
| dashboard Postings panel | `:286-358` (list `:302`), badge `:182`/`:203` | cap 10 in route, total to badge + aria-label, "View all postings" link | A | `5b454a8` |
| dashboard load | `dashboard/+page.server.ts:90`, `:103`, `:112-117` | pass `limit` to events; slice + total for the two panels | A | same three |
| service | `src/lib/server/services/dashboard.ts:15` (regs), `:449` (events) | `orderBy` on regs; `limit` on events | A | `854c2b0`, `5c939d3` |
| 201 file | `employees/[id]/+page.svelte` onboarding `:306`, leave balances `:893`, emergency contacts `:933`, benefits `:1057`, loans `:1105`/`:1107`, cash advances `:1169`/`:1171`, recurring earnings `:1232`/`:1234`, recurring deductions `:1430`/`:1432`, documents `:1784`/`:1796`, history `:1905`/`:1906` | `LIST_RENDER_CAP = 25` + truncated-note snippet on documents, history, loans, cash advances, both recurring; `.card-scroll` ceiling only on onboarding, leave balances, emergency contacts, benefits | B | `cbb081b` |
| benefits | `benefits/+page.svelte:144`, `:253` | `.card-scroll` on the wrapper; picker untouched | C1 | `76bd34a` (benefits half only) |
| performance ADMIN | `performance/+page.svelte:42`, `:87`, `:130`, `:171` | `.card-scroll` on each existing `overflow-x-auto` wrapper; EMPLOYEE view `:215`/`:256` untouched | C1 | `313dd78` |
| payroll run | `payroll/[id]/+page.svelte:209` | `.card-scroll` on the existing wrapper | C1 | `dc024fc` |
| profile | `profile/+page.svelte:239`, `:277`, `:320` | `.card-scroll` | C1 | `dc024fc` |
| branches | `branches/+page.svelte:147` | `.card-scroll` | C2 | `ef3fb0f` |
| departments | `departments/+page.svelte:151` | `.card-scroll` | C2 | `ef3fb0f` |
| statutory rates | `payroll/statutory-rates/+page.svelte:401`, `:564` | `.card-scroll` | C2 | `ef3fb0f` |
| offboarding | `settings/offboarding/+page.svelte:97` | `.card-scroll` | C2 | `ef3fb0f` |
| org | `settings/org/+page.svelte:120`, `:298` | `.card-scroll`; no cap (client search needs the full array) | C2 | `ef3fb0f` |
| posting approvers | `settings/posting-approvers/+page.svelte:34` | `.card-scroll`; picker untouched | C2 | `ef3fb0f` |
| schedules | `settings/schedules/+page.svelte:238` | `.card-scroll` | C2 | `ef3fb0f` |
| pay codes (moved) | `payroll/pay-codes/+page.svelte:47`, `:130` | `.card-scroll` | C2 | `ef3fb0f` (settings/pay-codes hunk, re-targeted) |
| salary grades (moved) | `payroll/salary-grades/+page.svelte:47`, `:144` | `.card-scroll`; select `:182` untouched | C2 | `ef3fb0f` (settings/salary-grades hunk, re-targeted) |

**Plain-site rule (Lanes C1, C2):** put `card-scroll` on the element that already scrolls sideways
(`overflow-x-auto`) if there is one — `.card-scroll` adds `overflow-y-auto` and the max-height, giving
`overflow: auto` on both axes. If the list has no wrapper, put it on the list element itself. If an
element already carries a conflicting `max-h-*` or `overflow-y-*`, stop and report — do not stack two
ceilings. Never wrap a `<tbody>`.

---

## Dependencies

| Depends on | What |
|---|---|
| staging `9cc3dcc` | the dropdown-panel dashboard, the lg fill-window pages, the moved payroll paths |
| `197cf02` (on branch) | `.card-scroll` in `src/app.css:249-251` |
| reference commits | `5c939d3 854c2b0 5b454a8 cbb081b 76bd34a 313dd78 dc024fc ef3fb0f ced04d4 f304d35 c003cc5` — read-only via `git show` |
| owner | D1, D2, D3 (binding) |

**Entry gate:** branch is `feat/uiux-phase-10-bounds`, tree clean, HEAD contains `197cf02`. E2E
baseline recorded: **275 passed, 2 failed (`payroll-approval.spec.ts:77`,
`timesheet-approval.spec.ts:99`), 1 did not run.**

---

## Lane Split (parallel vc-execute-agents, exclusive file ownership)

No file is in two lanes. Agents may run `bunx eslint <their files>`, `bunx prettier --check <their
files>`, `bun run test -- <name>` filtered to their own test, and read-only `bunx svelte-check`.
The **orchestrator** holds all git, all e2e, the build, and `bun run check`.

| Lane | Owns (only these files) | Unit gate the agent may run | Commit unit |
|---|---|---|---|
| **A — dashboard** | `src/lib/server/services/dashboard.ts`, `src/routes/(app)/dashboard/+page.server.ts`, `src/routes/(app)/dashboard/+page.svelte`, `tests/unit/container-bounds.test.ts` (new) | `bun run test -- container-bounds.test` | 1 |
| **B — 201 file** | `src/routes/(app)/employees/[id]/+page.svelte` | none (render-only); `bunx svelte-check` read-only | 2 |
| **C1 — people/money tables** | `benefits/+page.svelte`, `performance/+page.svelte`, `payroll/[id]/+page.svelte`, `profile/+page.svelte` (all under `src/routes/(app)/`) | none | 3 |
| **C2 — settings/config tables** | `branches/+page.svelte`, `departments/+page.svelte`, `payroll/statutory-rates/+page.svelte`, `settings/offboarding/+page.svelte`, `settings/org/+page.svelte`, `settings/posting-approvers/+page.svelte`, `settings/schedules/+page.svelte`, `payroll/pay-codes/+page.svelte`, `payroll/salary-grades/+page.svelte` (all under `src/routes/(app)/`) | none | 4 |
| **D1 — source scan** | `tests/unit/container-bounds-scan.test.ts` | `bun run test -- container-bounds-scan` (goes fully green only after A, B, C1, C2 land) | 5 |
| **D2 — e2e** | `tests/e2e/container-bounds.spec.ts` (new), `tests/e2e/dashboard-layout.spec.ts`, `tests/e2e/posting-approver-sod.spec.ts` | none — orchestrator runs e2e | 6 |

**Files NO lane may touch:** `src/app.css` (`.card-scroll` is done), `src/lib/server/services/recruitment.ts`,
`src/lib/components/ui/Table.svelte`, `src/routes/(app)/leave/balances/+page.svelte`,
`src/routes/(app)/settings/roles/+page.svelte`, `src/routes/(app)/team/**`, `TeamMatrix.svelte`,
`src/routes/(app)/attendance/**` (read-only for the T3 scan), every `+page.server.ts` except
`dashboard/+page.server.ts`, `prisma/**`, `src/lib/rbac.ts`, `package.json`,
`tests/unit/a11y-invariants.test.ts`, `tests/unit/dashboard-org-scoping.test.ts`,
`tests/unit/recruitment-posting-sod.test.ts`, `.claude/hooks/**`, any `.env*`, and every file in the
8 gap surfaces.

**Code rules for every lane:** no NEW comments; carry every existing comment verbatim; reuse
`.card-scroll` (= `max-h-[min(60vh,28rem)] overflow-y-auto`) for plain sites; no `md:`/`2xl:`; never
add `tabindex="0"` to the five `CONVERTED_ROWS` files (E4).

---

## Implementation Checklist

Gate order, as CI runs it: `bun run format` check first, then lint, then `bun run check`, then
`bun run test`. The orchestrator runs these after each lane lands, then commits that lane.

### Section 0 — entry (orchestrator)

1. Confirm branch `feat/uiux-phase-10-bounds`, clean tree, HEAD contains `197cf02`.
2. Confirm the baseline above is the current one (do not re-run unless the branch moved).
3. Commit this plan revision + `container-bounds-gaps_NOTE_23-09-26.md` as a process commit
   (commit unit 0).

### Section 1 — Lane A: dashboard

4. `dashboard.ts` `listUpcomingEvents` (`:449`): add optional trailing `limit?: number`; apply only at
   the final `return events.sort(...)` as `limit === undefined ? sorted : sorted.slice(0, limit)`.
   Reference: `git show 5c939d3 -- src/lib/server/services/dashboard.ts` (applies cleanly).
5. `dashboard.ts` `listUpcomingRegularizations` (`:15`): add `orderBy: { startDate: 'asc' }` to the
   `findMany`. **Do not** add a `limit` and do not change the JS sort at `:53`.
6. `dashboard/+page.server.ts`: add `const DASHBOARD_LIST_CAP = 10`. Pass it as the `limit` to
   `listUpcomingEvents` (`:90`).
7. Same file (`:103`): keep the service call unbounded; return `regularizations: all.slice(0,
   DASHBOARD_LIST_CAP)` and `regularizationsTotal: all.length` (0 when `!canPost`).
8. Same file (`:112-117`): same shape — `postingsToApprove: all.slice(0, DASHBOARD_LIST_CAP)` and
   `postingsToApproveTotal: all.length`. The slice is on the service output, which is already
   approver-filtered and oldest-first.
9. `dashboard/+page.svelte:148`, `:169`: the regularizations `aria-label` and badge text use
   `data.regularizationsTotal`; the `{#if … > 0}` badge condition uses it too.
10. `:182`, `:203`: same for postings with `data.postingsToApproveTotal`.
11. Regularizations panel (`:244-284`): keep every class as is. Inside the non-empty `{:else}` branch,
    after the `</ul>`, add `<a href="/employees" class="btn-row self-start">View all employees</a>`.
12. Postings panel (`:286-358`): same, `<a href="/recruitment" class="btn-row self-start">View all
    postings</a>`. Keep the existing scoped-banner comment verbatim.
13. Upcoming Events list (`:834`): keep `max-h-80 … overflow-y-auto`; add `tabindex="0"`,
    `role="region"`, `aria-label="Upcoming events"`, preceded by the
    `<!-- svelte-ignore a11y_no_noninteractive_tabindex -->` directive only. No view-all link.
14. Write `tests/unit/container-bounds.test.ts`, porting from `5c939d3` and `854c2b0` with the
    where→orderBy→take mock: **G2** (events limit on merged output), **G3** (regs full list comes back
    in `daysUntil` order from fixtures declared in reverse), **G3b** (straddle `2025-08-30`,
    `2025-08-31`, `2025-09-01`: the Sept row is first). Drop the old G1/G1b service-limit cases — the
    cap no longer lives in those services; e2e G6/G15 prove it.
15. Agent runs `bunx eslint`/`bunx prettier --check` on its 4 files and
    `bun run test -- container-bounds.test`. Negative controls in the Verification table (G2, G3b)
    must be run and reported with the red output.
16. Orchestrator: full gate set → commit unit 1.

### Section 2 — Lane B: 201 file

17. Re-read `cbb081b` (`git show cbb081b`). Add `const LIST_RENDER_CAP = 25` and the truncated-note
    snippet ("Showing the first 25 of N", rendered only when N > 25 — OD-2). No new comment on either.
18. Apply cap + snippet + `.card-scroll` to documents (`:1784`/`:1796`), history outer list
    (`:1905`; the nested per-event list `:1906` stays uncapped), loans (`:1105`/`:1107`), cash
    advances (`:1169`/`:1171`), recurring earnings (`:1232`/`:1234`), recurring deductions
    (`:1430`/`:1432`).
19. `.card-scroll` only, no cap: onboarding (`:306`), leave balances (`:893`), emergency contacts
    (`:933`), benefits (`:1057`).
20. Do not touch the two supervisor pickers or `+page.server.ts` (T4, T5).
21. Orchestrator: full gate set → commit unit 2.

### Section 3 — Lane C1

22. Apply the plain-site rule to benefits `:144`, `:253`; performance ADMIN `:42`, `:87`, `:130`,
    `:171`; payroll run `:209`; profile `:239`, `:277`, `:320`. Leave performance `:215`/`:256` and the
    benefits picker alone.
23. Orchestrator: full gate set → commit unit 3.

### Section 4 — Lane C2

24. Apply the plain-site rule to branches `:147`, departments `:151`, statutory-rates `:401`, `:564`,
    offboarding `:97`, org `:120`, `:298`, posting-approvers `:34`, schedules `:238`, pay-codes `:47`,
    `:130`, salary-grades `:47`, `:144`. Leave the salary-grade select (`:182`) and the
    posting-approvers picker alone.
25. Orchestrator: full gate set → commit unit 4.

### Section 5 — Lane D1: make the scan red-capable

26. **G5 fix.** Replace the bare `/\.slice\(0,/` check with: strip an **exact-string allowlist**
    from the source, then assert no `.slice(0,` remains. Allowlist, each entry a full expression:
    `toISOString().slice(0, 10)` (attendance), `.trim().slice(0, 100)` (audit-log search clamp),
    `manilaDayKey(new Date()).slice(0, 4)` (requests year). Keep the `take:\s*\d` check unchanged.
27. **T3 fix.** Replace the `/team` test with one on `routes/(app)/attendance/+page.server.ts`: it
    contains `employeeId: { in: members.map((m) => m.id) }` and `take: pagination.take`, and has no
    `take:\s*\d`. Drop the `/team` needle.
28. **Pickers.** Add `['routes/(app)/payroll/salary-grades/+page.svelte', '{#each data.grades as g
    (g.id)}']` to `PICKERS`.
29. **New G13 — the plain sites are bounded.** For each Lane C1/C2 file and the 201 file, assert it
    contains `card-scroll` at least N times (N = the site-table count for that file). Use the moved
    `payroll/pay-codes` and `payroll/salary-grades` paths. Assert `employees/[id]/+page.svelte`
    contains `LIST_RENDER_CAP`.
30. **New G14 — the dropped sites keep staging's shape.** Assert `leave/balances`,
    `settings/roles`, `team/+page.svelte` do **not** contain `card-scroll`. Keep the existing
    `/leave/balances` no-cap assertion.
31. Keep every existing comment in the file verbatim, except where a comment names `/team` as the T3
    site: that comment block goes with the test it describes (deleting a test deletes its comment).
    No new comments.
32. Run each negative control in the table and report the red output. Orchestrator: gates → commit 5.

### Section 6 — Lane D2: port the e2e spec

33. Port `tests/e2e/container-bounds.spec.ts` from `ced04d4` + `f304d35`. Keep: serial mode, unique
    `Zzbound`-style marker per run, `beforeAll` **sweep of every earlier run's marker rows first**, then
    seed; `afterAll` deletes `payrollEntry` first, then employees, users, postings, holidays.
34. Seed: ≥12 `PROBATIONARY` `ACTIVE` employees with `daysUntil` in **1..20** (future, not overdue —
    so they rank after any overdue row); ≥12 `publicHoliday` rows in the next 14 days; ≥12
    `PENDING_APPROVAL` postings in a fixture department **mapped to `USERS.manager`'s employee**
    (not admin — f304d35's admin mapping collides with `dashboard-layout.spec.ts`, which reads
    postings as admin). Submitter ≠ manager. Log in as manager for the postings tests.
35. Retarget locators: open each panel with its title-row button (`decisionButton` + `openPanel`
    shape from `dashboard-layout.spec.ts`), then scope to
    `getByRole('region', { name: 'Upcoming Regularizations' })` /
    `{ name: 'Postings awaiting your approval' }`. Events: `getByRole('region', { name: 'Upcoming
    events', exact: true })`. The 390px test uses the same new locators.
36. Assertions: **G6** list `li` `toHaveCount(10)` per list; **G15** badge text and button
    `aria-label` number equal each other and are **> 10**; **G16** link `View all employees` →
    `/employees`, `View all postings` → `/recruitment`, visible inside the region; **G9** no
    `/view all/i` link inside the Events region; **G7** Events list `maxHeight !== 'none'` and
    `overflowY === 'auto'`, panel lists `overflowY === 'auto'`; **G8** at 390×844 the page has no
    horizontal overflow and each region still fits the viewport.
37. `dashboard-layout.spec.ts` PROBIE (`:98-113`): make PROBIE rank first regardless of residue —
    in the test, read `min(startDate)` of `PROBATIONARY` rows in the org via Prisma and fill a Start
    Date one day earlier. If the form refuses that date, seed PROBIE with Prisma instead and record
    it. Keep its `afterAll`.
38. `dashboard-layout.spec.ts` POSTING (`:120-158`): add a `beforeAll` sweep
    `jobPosting.deleteMany({ where: { title: { startsWith: 'E2E-LAYOUT-posting-' } } })`.
39. `posting-approver-sod.spec.ts`: port f304d35's `beforeAll` sweep of `E2E-F4-*` postings and its
    residue comment change **verbatim** (it is reference text, not a new comment).
40. Orchestrator runs the full e2e and each negative control (table) → commit unit 6.

### Section 7 — close (orchestrator)

41. Full gate set in CI order + full e2e; compare with the baseline (275/2/1). Only the 2 known
    failures may be red. Read any other red, do not re-run blindly.
42. Owner look pass (AC14) and impeccable audit (A1) on the changed `.svelte` files.
43. Write the phase report FLAT in this folder; update
    `backlog/query-level-pagination-unbounded-lists_NOTE_03-09-26.md` and
    `backlog/dashboard-alert-panels-need-view-all-link_NOTE_18-09-26.md` (unfiltered links shipped;
    filtered deep link still open); port `roster-select-typeahead_NOTE_04-09-26.md` and
    `prisma-mock-orderby-take-helper_NOTE_04-09-26.md` from `ced04d4` if absent → commit unit 7.

### Commit units

| # | Message | Files |
|---|---|---|
| 0 | `plan(uiux-10): revise phase 10 into a port plan for staging 9cc3dcc` | this plan, `container-bounds-gaps_NOTE_23-09-26.md` |
| 1 | `feat(uiux-10): cap the three dashboard lists at ten and send the true panel totals` | Lane A |
| 2 | `feat(uiux-10): cap and bound the list panels on the 201 file` | Lane B |
| 3 | `feat(uiux-10): bound the benefits, performance admin, payroll run and profile tables` | Lane C1 |
| 4 | `feat(uiux-10): bound the settings and config-scale tables` | Lane C2 |
| 5 | `test(uiux-10): make the container-bounds scan red-capable on staging` | Lane D1 |
| 6 | `test(uiux-10): port the container-bounds e2e to the dropdown panels and sweep cap residue` | Lane D2 |
| 7 | `docs(uiux-10): write the phase 10 port report and backlog updates` | report + notes |

No `Co-Authored-By`, no attribution footer. Do not push unless the owner asks.

---

## Acceptance Criteria

| # | Criterion | proven by | strategy |
|---|---|---|---|
| AC1 | Events, Regularizations and Postings each render at most 10 rows | G6 | Fully-Automated (e2e) |
| AC1b | The two badges and their `aria-label`s show the real total, not the capped count | G15 | Fully-Automated (e2e) |
| AC2 | Regularizations under the cap are the most overdue (by `daysUntil`), across the month-end overflow | G3, G3b | Fully-Automated (unit) |
| AC3 | Events are capped on the merged sorted output; no event kind is dropped by a query take | G2 | Fully-Automated (unit) |
| AC4 | The postings cap is taken after the approver filter | G6 (manager sees 10 of ≥12 approvable) + source: route slices the service output | Fully-Automated (e2e) |
| AC5 | Every bounded container scrolls inside its box | G7 (dashboard), G13 (source, plain sites), P2 | Fully-Automated + Agent-Probe |
| AC6 | Postings → `/recruitment`; Regularizations → `/employees`; Events has no view-all | G16, G9 | Fully-Automated (e2e) |
| AC8 | The paginated pages gained no cap | G5 (fixed) | Fully-Automated (unit) |
| AC9 | Documents (T5) and attendance members (T3) are not capped by a constant | G10 (fixed T3) | Fully-Automated (unit) |
| AC10 | No picker gained a cap, incl. the salary-grade select | G10 pickers | Fully-Automated (unit) |
| AC11 | 390px: no horizontal overflow on `/dashboard` | G8 | Fully-Automated (e2e) |
| AC12 | Dropped sites keep staging's shape; `/leave/balances` has no cap | G14 | Fully-Automated (unit) |
| AC13 | E2E no worse than baseline (275 pass / 2 known fail / 1 not run), incl. `dashboard-layout` and `posting-approver-sod` | G11 | Fully-Automated (e2e) |
| AC14 | Look pass at 390px and 1440px on every changed surface | owner manual list | Agent-Probe (owner) |
| AC15 | Full CI gate set green in CI order | G12 | Fully-Automated |

AC7 is **OBSOLETE** (no `Table.svelte` prop). AC14 is a named residual; it keeps the phase
CONDITIONAL until the owner records it.

## Phase Completion Rules

`CODE DONE` when commit units 1–6 are in and G12 is green. `✅ VERIFIED` only when: G12 green in CI
order; e2e no worse than baseline; every negative control below run and recorded; P2 and A1 recorded;
the report and backlog updates written; this plan's re-PVL contract filled; the owner confirmed the
look pass.

---

## Touchpoints

- **Service:** `src/lib/server/services/dashboard.ts` (`listUpcomingEvents`, `listUpcomingRegularizations`).
- **Routes:** `dashboard/+page.server.ts`, `dashboard/+page.svelte`, `employees/[id]/+page.svelte`,
  `benefits`, `performance`, `payroll/[id]`, `profile`, `branches`, `departments`,
  `payroll/statutory-rates`, `settings/offboarding`, `settings/org`, `settings/posting-approvers`,
  `settings/schedules`, `payroll/pay-codes`, `payroll/salary-grades` (`+page.svelte` each).
- **Tests:** new `tests/unit/container-bounds.test.ts`, new `tests/e2e/container-bounds.spec.ts`;
  changed `tests/unit/container-bounds-scan.test.ts`, `tests/e2e/dashboard-layout.spec.ts`,
  `tests/e2e/posting-approver-sod.spec.ts`.
- **Read-only:** `src/app.css`, `recruitment.ts`, `attendance/+page.server.ts`,
  `employees/[id]/+page.server.ts`, `tests/unit/a11y-invariants.test.ts`, `tests/e2e/helpers.ts`,
  the reference commits.

## Public Contracts

- `listUpcomingEvents(orgId, opts, limit?)` gains one optional trailing param; one caller.
- `listUpcomingRegularizations` signature unchanged; adds an `orderBy` (same result order after the
  JS sort; ties become deterministic).
- Dashboard load data gains `regularizationsTotal: number` and `postingsToApproveTotal: number`;
  `regularizations` and `postingsToApprove` are now at most 10 long. Only `dashboard/+page.svelte`
  reads them.
- Two new anchors inside already-gated panels (`data.canPost`, `data.canDecidePostings`); both targets
  have their own load guards. No reach widens.
- No route, URL, capability, schema or `Table.svelte` change.

## Blast Radius

- **Files:** 17 source files + 5 test files. One package.
- **Risk class: MEDIUM.** One service file; load-data shape change on one page; no auth, schema,
  billing or trust-boundary surface.
- **Highest-risk edits:** items 7–10 (a slice before the total is computed makes the badge lie; G15's
  negative control catches it); item 34 (fixture mapping — the wrong approver renders zero rows or
  crowds another spec); items 26–27 (a loose allowlist makes G5 vacuous).
- **Overlap:** `dashboard/+page.svelte` also touched by the merged dashboard-layout work;
  `employees/[id]/+page.svelte` by phases 05/07. Registry claim is in `phase-blast-radius-registry.md`
  (`d7cf164`); update it to drop `/team`, `leave/balances`, `settings/roles` and add the moved payroll
  paths at close.

## Verification Evidence

Tier routing: `process/context/tests/all-tests.md`. Unit tests run under vitest via `bun run test`
(never bare `bun test`); e2e is Playwright, orchestrator only. Every new or changed test has a named
negative control: break the code, watch the named assertion go red **for the stated reason**, revert.

| Gate / Scenario | Strategy | Proves SPEC criterion | Negative control (must go red) |
|---|---|---|---|
| **G2** unit: events `limit` 10 on a fixture of 12 holidays + roster events declared in reverse date order keeps the earliest roster-derived events | Fully-Automated | AC3 | move the limit onto the roster `findMany` as `take` → the earliest birthdays vanish |
| **G3** unit: regs full list returned in ascending `daysUntil` from reverse-declared fixtures | Fully-Automated | AC2 | delete the JS `.sort` at `dashboard.ts:53` AND the new `orderBy` → rows come back in reverse declaration order, red |
| **G3b** unit: straddle `2025-08-30/31`, `2025-09-01` → the Sept row is index 0 | Fully-Automated | AC2 | delete only the JS `.sort` (keep the `orderBy`) → `startDate` order puts `2025-08-30` first, G3b red while G3 on non-straddle fixtures stays green (proves the sort, not the `orderBy`, orders the list) |
| **G5** scan: 13 paginated loads keep `paginate(`, no literal `take`, no `.slice(0,` outside the exact allowlist | Fully-Automated | AC8 | (a) add `rows.slice(0, 10)` to `employees/+page.server.ts` → red; (b) add `x.slice(0, 5)` to `attendance/+page.server.ts` → red (proves the allowlist does not mask the file) |
| **G10-T3** scan: attendance members keep `take: pagination.take` and the `members.map` coupling | Fully-Automated | AC9 | change `take: pagination.take` to `take: 10` → red |
| **G10-T5** scan: documents not capped (unchanged test) | Fully-Automated | AC9 | add `documents.slice(0, 5)` → red |
| **G10-pickers** scan incl. salary-grade select | Fully-Automated | AC10 | rename `data.grades as g` to `data.grades.slice(0, 5) as g` → red |
| **G13** scan: each plain-site file has its `card-scroll` count; 201 file has `LIST_RENDER_CAP` | Fully-Automated | AC5 | remove `card-scroll` from `payroll/pay-codes/+page.svelte` → red |
| **G14** scan: `leave/balances`, `settings/roles`, `team/+page.svelte` have no `card-scroll`; balances has no cap | Fully-Automated | AC12 | add `card-scroll` to `settings/roles/+page.svelte` → red |
| **G6** e2e: each of the 3 lists has exactly 10 `li` | Fully-Automated | AC1, AC4 | remove the route slice for postings → count 12+, red |
| **G15** e2e: badge number == aria-label number, and > 10 | Fully-Automated | AC1b | make the badge read `data.postingsToApprove.length` → 10, red on `> 10` |
| **G16** e2e: view-all links visible in each panel with the right `href` | Fully-Automated | AC6 | delete the postings link → red |
| **G9** e2e: no `/view all/i` link inside the Events region | Fully-Automated | AC6 | add one → red |
| **G7** e2e: Events `maxHeight !== 'none'` + `overflowY auto`; panel lists `overflowY auto` | Fully-Automated | AC5 | remove `overflow-y-auto` from the Events list → red |
| **G8** e2e: 390×844, `scrollWidth <= 390`, each region inside the viewport | Fully-Automated | AC11 | remove `w-[calc(100vw-2rem)]` from the postings panel → red (run it; if it stays green the gate is VOID and reported) |
| **G11** full e2e vs baseline; `dashboard-layout` PROBIE/POSTING + `posting-approver-sod` green | Fully-Automated (read on red, #287) | AC13 | seed 11 overdue probationaries older than PROBIE's old date with the OLD `probationStartDate()` → PROBIE test red; with the fix → green |
| **G12** `bun run format` check → lint → `bun run check` → `bun run test` | Fully-Automated | AC15 | — |
| **P2** live walk of the 201 file, performance admin, payroll run, profile, settings/config pages at 390 and 1440 | Agent-Probe | AC5 | — |
| **A1** impeccable audit on changed `.svelte` files | Agent-Probe | AC14 support | — |
| owner look pass | Agent-Probe (owner) | AC14 | — |

**What this does NOT prove:** scans prove text, not rendering; plain-site geometry rests on P2 and
the owner; unit gates run on a mock, not Postgres; query cost is unchanged for every list except
Events; e2e is flaky (#287) — read every red.

## Test Infra Improvement Notes

- Carried: the shared where→orderBy→take mock helper and the viewport-matrix projects remain backlog
  (`prisma-mock-orderby-take-helper_NOTE_04-09-26.md`, `phase-03-responsive-sweep_NOTE_03-09-26.md`).
- New: fullyParallel e2e + any capped list means every spec that reads a capped list must sweep its
  own residue and must not share an approver with another spec. Candidate for a context note at
  UPDATE-PROCESS.
- New: G5-style "no constant slice" scans need an exact-expression allowlist, not a looser regex.

## Validate Contract

### Port contract (23-09-26) — CURRENT

Status: CONDITIONAL
Date: 23-09-26
date: 2026-09-23
generated-by: outer-pvl
supersedes: 2026-09-03 (outer-pvl) — outer PVL has current evidence for the port revision

Parallel strategy: sequential (single validate-agent, direct source reads)
Rationale: 4/7 signals (S4 phase program, S5 owner demanded seven named checks, S6 dashboard load-shape change, S7 22 files). Every check is a read of the same ~25 files plus one read-only DB count; a fan-out would re-read them N times with no cross-agent finding. Cost guard: not triggered (1 agent). EXECUTE: 6 parallel lanes as planned (opus for code lanes A, B, C1, C2; D1/D2 test lanes), orchestrator holds git, e2e, build, `bun run check`.

Pre-checks run: `validate-plan-artifact.mjs` → 0 failures / 0 warnings. Branch `feat/uiux-phase-10-bounds` at `0f806b0`, clean, contains `197cf02`. `bun run test -- container-bounds-scan` → 4 failed / 30 passed (3 × G5 string slices + T3 `/team`), exactly as P-9 says. `dashboard.ts` is byte-identical to base `f9514d7` (`git diff --stat` empty), so `5c939d3`/`854c2b0` and their unit-test mock apply as-is. Read-only dev DB count: 337 ACTIVE PROBATIONARY rows, all `startDate 2026-03-02` (all in the notice window, overdue 21 days); 46 `E2E-F4-self-*` rows `PENDING_APPROVAL`; `posting_approvers` empty (Software Developers unmapped).

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | Events, Regularizations, Postings each render at most 10 rows | Fully-Automated | e2e G6 `tests/e2e/container-bounds.spec.ts` (orchestrator) | B |
| AC1b | badge text and `aria-label` show the true total | Fully-Automated | e2e G15 | B |
| AC2 | regs under the cap are the most overdue, across the month-end overflow | Fully-Automated | `bun run test -- container-bounds.test` G3, G3b; runtime corroboration: `dashboard-layout.spec.ts` PROBIE-ranks-first (VC-6) | B |
| AC3 | events cut on the merged sorted output | Fully-Automated | `bun run test -- container-bounds.test` G2 | B |
| AC4 | postings cut after the approver filter | Fully-Automated | e2e G6 as manager (source: route slices service output) | B |
| AC5 | bounded containers scroll inside their box | Fully-Automated (dashboard G7, plain-site text G13) + Agent-Probe (P2) | G7, G13, P2 | B / D |
| AC6 | view-all links right; Events has none; no dead link | Fully-Automated | e2e G16, G9 | B |
| AC8 | paginated pages gained no constant cap | Fully-Automated | `bun run test -- container-bounds-scan` G5 (per VC-9) | B |
| AC9 | documents + attendance members not constant-capped | Fully-Automated | scan G10-T5, G10-T3 (per VC-10) | B |
| AC10 | no picker capped, incl. salary-grade select | Fully-Automated | scan G10-pickers (per VC-2) | B |
| AC11 | 390px dashboard: no horizontal overflow, panels inside viewport | Fully-Automated | e2e G8 (per VC-8 mutations) | B |
| AC12 | dropped sites keep staging's shape | Fully-Automated | scan G14 | B |
| AC13 | e2e no worse than 275/2/1 | Fully-Automated (read on red, #287) | full e2e + `dashboard-layout` + `posting-approver-sod` | B |
| AC15 | CI gate set green in CI order | Fully-Automated | `bun run format` check → lint → `bun run check` → `bun run test` | B |
| AC14 | look pass 390/1440 on every changed surface | Agent-Probe | owner manual list + P2 + A1 impeccable | D |

Failing stubs (Fully-Automated rows; red-first starting points, not files):
- `test("should cut upcoming events after the merge so the earliest roster events survive", () => { throw new Error("NOT IMPLEMENTED — TDD stub: G2") })`
- `test("should return regularizations in ascending daysUntil from reverse-declared fixtures", () => { throw new Error("NOT IMPLEMENTED — TDD stub: G3") })`
- `test("should rank the 2025-09-01 start above 2025-08-30 and 2025-08-31", () => { throw new Error("NOT IMPLEMENTED — TDD stub: G3b") })`
- `test("should find no constant slice in a paginated load after stripping the exact allowlist", () => { throw new Error("NOT IMPLEMENTED — TDD stub: G5") })`
- `test("should keep take: pagination.take on the attendance members query", () => { throw new Error("NOT IMPLEMENTED — TDD stub: G10-T3") })`
- `test("should keep both data.grades each blocks in salary-grades uncapped", () => { throw new Error("NOT IMPLEMENTED — TDD stub: G10-pickers") })`
- `test("should find card-scroll N times in each plain-site file", () => { throw new Error("NOT IMPLEMENTED — TDD stub: G13") })`
- `test("should find no card-scroll on leave/balances, settings/roles, team", () => { throw new Error("NOT IMPLEMENTED — TDD stub: G14") })`
- `test("should render exactly 10 rows in each capped dashboard list", () => { throw new Error("NOT IMPLEMENTED — TDD stub: G6") })`
- `test("should show the same true total above 10 in badge and aria-label", () => { throw new Error("NOT IMPLEMENTED — TDD stub: G15") })`
- `test("should show View all links with the right href and none in Events", () => { throw new Error("NOT IMPLEMENTED — TDD stub: G16/G9") })`
- `test("should keep the dashboard inside a 390px viewport", () => { throw new Error("NOT IMPLEMENTED — TDD stub: G8") })`

C-4 reconciliation: `strategy` carries only Fully-Automated / Hybrid / Agent-Probe. Known-gaps are named residuals below.

Legacy line form:
- dashboard service ordering and cut: [Fully-automated: `bun run test -- container-bounds.test` G2/G3/G3b]
- source scans: [Fully-automated: `bun run test -- container-bounds-scan` G5/G10/G13/G14]
- dashboard counts, totals, links, geometry, 390px: [Fully-automated: e2e `tests/e2e/container-bounds.spec.ts` G6/G7/G8/G9/G15/G16 — orchestrator only]
- cap-collision regressions: [Fully-automated (flaky #287): e2e `dashboard-layout.spec.ts`, `posting-approver-sod.spec.ts`, read on red]
- plain-site geometry, 201 file, look: [agent-probe: P2, A1, owner look pass]
- query cost of every list except Events: [known-gap: documented — `query-level-pagination-unbounded-lists_NOTE_03-09-26.md`]

Dimension findings:
- Infra fit: PASS — one SvelteKit app, no container/port/deploy surface; `.card-scroll` already compiled on branch (`src/app.css:249-251`); `dashboard.ts` unchanged since `f9514d7`.
- Test coverage: CONCERN — four gates as written cannot fail or fail for the wrong reason: G10-pickers (VC-2), G13 on the four bare 201 tables (VC-3), G8's named mutation (VC-8), G10-T3's own needle (VC-10). Two e2e rows the cap can drop are only half-fixed (VC-5, VC-6).
- Breaking changes: CONCERN — load data gains two totals; only `dashboard/+page.svelte` reads `regularizations`/`postingsToApprove` (grep of `src` + `tests`: `+page.svelte:148,165,169,182,199,203,258,262,299,303`; no layout, no `/api/v1/dashboard` read, no unit test imports the load). Public Contracts misstates the events signature (VC-11).
- Security surface: CONCERN — no auth/schema/trust change, no evidence pack needed. But "View all postings" as written renders for mapped approvers without MANAGE_HR and points at a MANAGE_HR-only page (VC-1): a dead link, the nav-mirrors-load-guard rule.
- Section 1 (Lane A dashboard): CONCERN — cap/total/sort order correct; VC-1, VC-7, VC-11.
- Section 2 (Lane B 201 file): CONCERN — all 16 line refs exact; VC-3 (bare tables), VC-4 (history mis-cite).
- Section 3 (Lane C1): PASS — `benefits:144,253`, `performance:42,87,130,171`, `payroll/[id]:209`, `profile:239,277,320` are all existing `overflow-x-auto` wrappers; matches `76bd34a` (benefits half), `313dd78`, `dc024fc` hunk for hunk; no conflicting `max-h`/`overflow-y`.
- Section 4 (Lane C2): PASS — all 13 refs are the existing wrappers (`offboarding:97` is the `<ul>`, as in `ef3fb0f`); every `ef3fb0f` hunk except the D2-dropped roles hunk is mapped, pay-codes/salary-grades retargeted to `/payroll/*`.
- Section 5 (Lane D1 scan): CONCERN — G5 allowlist strings exact and complete (attendance `:61,62,109,117`, audit-log `:14`, requests `:60`); T3 needle verified at `attendance/+page.server.ts:100`; VC-2, VC-9, VC-10.
- Section 6 (Lane D2 e2e): CONCERN — manager mapping works; VC-5, VC-6, VC-12.

#### Answers to the seven questions

1. **True total everywhere: PASS once items 9-10 land.** Every read of the two arrays is in `dashboard/+page.svelte` (lines above). Badge `:169/:203`, badge condition `:165/:199`, `aria-label` `:148/:182` all move to the total. The link text carries no count. Empty states `:258/:299` use `=== 0` on the sliced list — still right, since `slice(0,10)` of a non-empty list is non-empty. Sort before slice: yes — the service sorts by `daysUntil` (`dashboard.ts:53`) and the route slices its output; `slice` is on the route side only.
2. **Postings order: PASS.** `recruitment.ts:236-238` orders `updatedAt asc`, filters in JS (`:248-259`), so the 10 shown are the **10 longest-waiting approvable** postings, the same order `5b454a8` capped. Nothing in D1 asks otherwise. But the cap drops the **newest** row, and both specs add the newest row — see VC-5 (dashboard-layout POSTING is not safe with the planned sweep) and VC-6 (PROBIE min−1 is not safe at the overflow). `posting-approver-sod` (b) TITLE_B is safe only with item 39's sweep (46 `E2E-F4-self` rows on the dev DB, all visible to twoHat after the remap); (a) TITLE_A is safe regardless (the residue is self-submitted by the approver, filtered at `:257`).
3. **Negative controls:** G2 PASS, G3 PASS, G3b PASS (measured: `08-30→03-02`, `08-31→03-03`, `09-01→03-01`). G5 PASS with VC-9. **G10-T3 WEAK** (VC-10). **G10-pickers VACUOUS** (VC-2). **G13 PASS as a text gate but vacuous for four sites** (VC-3). G14 PASS (no `card-scroll` anywhere in `src` except `app.css` today, so it is green now and the named control reds). **G8 VOID as named** (VC-8). G6/G15/G16/G9/G7 PASS.
4. **Site list: PASS on completeness, two defects in Lane B.** Every hunk of `cbb081b`, `76bd34a` (benefits half), `313dd78`, `dc024fc`, `ef3fb0f` (minus roles) maps to a plan row; no bounded list is missing. All line numbers verified against the current files. Defects: VC-3, VC-4.
5. **Lane ownership: PASS.** No file in two lanes. `LIST_RENDER_CAP` and the `truncated` snippet live in the 201 file (Lane B only); `DASHBOARD_LIST_CAP` in `dashboard/+page.server.ts` (Lane A only); `.card-scroll` is done. Cross-lane geometry (D2 measures Lane A's panels; D1 counts B/C1/C2 classes) is serialised by the orchestrator running e2e and the scan after the lanes land. Labels are fixed in the plan text, so D2 can write locators in parallel.
6. **Fixtures:** the manager **does** see the panel — `MANAGER` holds `MANAGE_HR` (`src/lib/rbac.ts:26`), so `canPost` and `canDecidePostings` are true regardless of the mapping, and a mapped department makes the Zzbound rows decidable only by the manager (`recruitment.ts:132-144`) — so they stay off admin's card, which is the point. Note the manager is also an HR-fallback decider, so the manager's card also holds all unmapped residue (46 rows today); G6/G15 still hold. PROBIE trick: holds against today's 337 residue rows but not at the overflow (VC-6). Sweeps: own-prefix only, PASS, with VC-12 on cleanup completeness.
7. **Contradictions:** VC-4 (history `:1906`), VC-11 (events signature), plain-site rule vs Lane B bare tables (VC-3), item 33's afterAll list vs `f304d35` (VC-12). Section 0 item 3 is already done (`0f806b0` carries the gaps note).

#### Binding execute conditions

| # | Condition | Lane |
|---|---|---|
| **VC-1** (blocking) | Wrap the "View all postings" anchor in `{#if data.canPost}`. `/recruitment` requires `MANAGE_HR` (`recruitment/+page.server.ts:17`); `canDecidePostings` is also true for a mapped approver without it (`dashboard/+page.server.ts:118-123`, e.g. `approver@veent.ph`), who would get a 403. Regularizations needs no gate (`canPost`=MANAGE_HR ⊂ VIEW_TEAM, `employees/+page.server.ts:14`). D2 adds to G16: logged in as `USERS.approver` with a mapped posting, the postings region has no `View all postings` link. Record the residual: a non-HR approver with >10 pending drains the queue oldest-first and has no route to row 11+ — add it to `container-bounds-gaps_NOTE_23-09-26.md`. | A, D2 |
| **VC-2** (blocking) | G10-pickers for salary-grades: `{#each data.grades as g (g.id)}` appears **twice** (`payroll/salary-grades/+page.svelte:62` table, `:182` select). A `toContain` stays green when `:182` is capped. Assert the match count is exactly 2. Run the named control on `:182` and show red. | D1 |
| **VC-3** (blocking) | Loans `:1105`, cash advances `:1169`, recurring earnings `:1232`, recurring deductions `:1430` are bare `<table>`s with no wrapper. `max-height`/`overflow` do nothing on a table box. Wrap each in a new `<div class="card-scroll">` exactly as `cbb081b` did — the plain-site "put it on the list element" fallback does not apply to tables. G13's count cannot see this; P2 must scroll each of the four at 390 and 1440. | B |
| **VC-4** (blocking) | History: `:1906` is the **outer** `{#each history as ev}` and gets the cap (`history.slice(0, LIST_RENDER_CAP)`); `.card-scroll` goes on the `<ol>` `:1905`; the nested per-event list is `:1928` (`{#each ev.changes}`) and stays uncapped. Item 18's "`:1906` stays uncapped" is wrong; `cbb081b` capped `:1906`. P2 checks that the timeline dots (`-left-[27px]`) are not clipped by the new scroll box. | B |
| **VC-5** (blocking) | dashboard-layout POSTING: the `E2E-LAYOUT-posting-` sweep is not enough. After `posting-approver-sod` restores its mapping to HR-fallback, its `E2E-F4-self-*` rows (46 on the dev DB now) sit on admin's card, **older** than POSTING, and under `fullyParallel` `dashboard-layout` usually starts before sod's sweep. Do not sweep another spec's prefix. Instead, after creating POSTING, backdate it below every pending row: `jobPosting.update({ where: { id }, data: { updatedAt: <min pending updatedAt − 1 day> } })` (Prisma honours an explicit `@updatedAt` value), same idea as item 37. Keep the own-prefix sweep. | D2 |
| **VC-6** (blocking) | PROBIE: use `min(startDate)` **minus 4 days**, not 1. `addUTCMonths` overflow inverts order across the Aug 29-31 → Feb boundary (measured: `2026-08-31→2027-03-03`, `2026-09-01→2027-03-01`), so min−1 loses to the min row in that window. Overflow is at most 3 days. | D2 |
| **VC-7** | Upcoming Events region: put `role="region"`, `tabindex="0"`, `aria-label="Upcoming events"` and `max-h-80 overflow-y-auto` on a wrapping `<div>`, keep the `<ul>` a list. `role="region"` on the `<ul>` removes its list role and orphans every `<li>` (the `5c939d3` shape). The `svelte-ignore` directive moves with the tabindex. G6/G7 locate the region, then `ul > li`. | A, D2 |
| **VC-8** (blocking) | G8's named mutation (remove `w-[calc(100vw-2rem)]`) will stay green: the panel is `absolute right-0`, so without a width it shrinks to fit and cannot overflow. G8 must assert `document.documentElement.scrollWidth <= 390` **and** each open region's `getBoundingClientRect()` has `left >= 0` and `right <= innerWidth`. Controls: (a) `w-[calc(100vw-2rem)]`→`w-[calc(100vw+2rem)]` on the postings panel → the region arm reds; (b) `right-0`→`left-0` on it → the `scrollWidth` arm reds. Run both, report red output. If either stays green, that arm is VOID and reported. | D2 |
| **VC-9** | G5 allowlist: strip **every** occurrence (`split(entry).join('')` or `replaceAll`), not `.replace` (attendance has four `toISOString().slice(0, 10)`). Key the allowlist per file (attendance / audit-log / requests), so an allowlisted string elsewhere is still red. Run controls (a) and (b). | D1 |
| **VC-10** | G10-T3: `take: pagination.take` appears three times in `attendance/+page.server.ts` (`:87`, `:225`, `:235`), so the `toContain` cannot go red when the members query alone is capped. Assert on the members block: `/const members = await db\.employee\.findMany\(\{[\s\S]*?take: pagination\.take\s*\}\)/`. Control: `:87` → `take: 10` must red **this** assertion, not only the `\d` one. | D1 |
| **VC-11** | `listUpcomingEvents` is `(organizationId, viewer, asOf = new Date(), limit?)` (`dashboard.ts:449-453`); the route passes `new Date()` then `DASHBOARD_LIST_CAP`, as `5c939d3` did. Public Contracts' `(orgId, opts, limit?)` is shorthand, not the signature. | A |
| **VC-12** | container-bounds `afterAll` and `beforeAll` sweep must also delete the fixture `postingApprover` row and the fixture department (resolved by name, as `f304d35` did), after the postings. If the marker is per-run unique, `employeeNumber` must carry the run stamp too (`@@unique([organizationId, employeeNumber])`, `schema.prisma:525`), or the sweep must run before any upsert. Every `deleteMany` filters on a fixture prefix; nothing unscoped. | D2 |
| VC-13 | Add an Events negative control to G6: call `listUpcomingEvents` without the limit → Events count > 10, red. | D2 |
| VC-14 | Old E4/E7 still bind: no `tabindex="0"` in the five `CONVERTED_ROWS` files; every named mutation is run and its red recorded; a mutation that stays green voids its gate. | all |
| VC-15 | P2 focus list, in addition to the plan's: onboarding `<ul>` is `columns-1 sm:columns-2` — with a max-height, multicol can spill a third column sideways instead of scrolling; the history dots (VC-4); the four new 201 table wrappers (VC-3). | orchestrator |

Open gaps:
- Non-HR mapped approver with >10 pending postings has no route to rows past 10 (VC-1): known-gap: documented as NEW PLAN REQUIRED — see backlog/container-bounds-gaps_NOTE_23-09-26.md (add at close).
- Query cost unchanged for every capped list except Events: known-gap — `query-level-pagination-unbounded-lists_NOTE_03-09-26.md`.
- G5 cannot see a cap written as `take: SOME_CONSTANT`: known-gap — scan residual, recorded in the phase report.
- Plain-site geometry has no runtime gate: known-gap — P2 + owner look pass (AC14).

### What This Coverage Does NOT Prove

- **Scans (G5, G10, G13, G14)** prove text, not rendering. G13 counts `card-scroll`; it cannot tell a box that scrolls from a class on a table that ignores it (VC-3 closes the known case). G5 misses a named-constant `take`.
- **Unit G2/G3/G3b** run on a where→orderBy→take mock, not Postgres. They prove the service sort; they do not prove the route slices after it — only the source and the runtime PROBIE check (VC-6) do.
- **e2e G6/G7/G8/G9/G15/G16** cover the dashboard at 390 and default desktop width only. They do not cover the other 16 bounded files.
- **G8** proves one page at one width, and only after VC-8's mutations red.
- **G11 regressions** are flaky (#287): a green run is not proof; read every red, never re-run blindly.
- **Nothing** proves 10 or 25 is the right number, or that the query cost fell.
- **P2/A1/owner pass** are judgment, not repeatable in CI.

Gate: CONDITIONAL (0 unresolved FAILs; 15 execute conditions, VC-1 to VC-6 and VC-8 blocking for their lanes)
Accepted by: pending — first-pass CONDITIONAL. Concerns by name: VC-1 dead postings link, VC-2 vacuous salary-grade picker gate, VC-3 no-op card-scroll on four bare tables, VC-4 history cap mis-cite, VC-5 POSTING crowded by E2E-F4 residue, VC-6 PROBIE overflow inversion, VC-7 region role on a list, VC-8 void G8 mutation, VC-9 allowlist strip, VC-10 weak T3 needle, VC-11 signature wording, VC-12 fixture cleanup, VC-13 events control, VC-14 carried E4/E7, VC-15 P2 focus. Owner decisions D1/D2/D3 are not reopened: VC-1 gates a link D1 asked for so it only renders where its target loads; VC-7 keeps D1's keyboard region and moves it onto a wrapper.

Autonomous Goal Block: not written to this phase plan — BRANCH B. The umbrella `ui-ux-overhaul-umbrella_PLAN_03-09-26.md` carries `## Stable Program Goal` (line 79).

### Historical record


The 03-09-26 contract below stays as the historical record. Every item is marked here; the port
contract above supersedes it.

| Item | Mark | Reason |
|---|---|---|
| C1 | **STILL BINDING** | `addUTCMonths` (`src/lib/utils/dates.ts:172-176`) still overflows; cap after the `daysUntil` sort. |
| C2 | **STILL BINDING** | `Table.svelte` still not used by any site here; no prop. |
| C3 | **STILL BINDING** | Seed schema unchanged since base; the e2e spec still self-seeds. |
| C4 | **STILL BINDING** | `a11y-invariants.test.ts:42-48,75-81` still forbids `tabindex="0"` in the 5 converted files (moot for `leave/balances` under D2, kept). |
| C5 | AMENDED | Still true for Events; fixed by item 13 on the staging `max-h-80` list. |
| C6 | AMENDED | Events no longer uses Pattern B (P-5); G7 asserts `maxHeight` there. |
| C7 | STILL BINDING | Plain-site rule: bound the existing `overflow-x-auto` wrapper. |
| C8 | OBSOLETE | Panels have `<h2>` headers now; links go at the panel foot. |
| C9, C12 | OBSOLETE | No `Table.svelte` change. |
| C10 | STILL BINDING | Now also covers cross-spec collisions (items 34, 37–39). |
| C11 | OBSOLETE | All line numbers re-derived for staging in the site table. |
| C13 | OBSOLETE | AC7 dropped. |
| C14 | STILL BINDING | G8's mutation must be run; void if it stays green. |
| E1 | **AMENDED** | Cap after the JS sort stays; with P-4 the slice moves to the route load and the service gets no `limit`. G3b's mutation changes to "delete the JS sort". |
| E2 | **STILL BINDING** | No `Table.svelte` prop. |
| E3 | **AMENDED** | Self-seeding stands; postings fixtures map to `USERS.manager`, not admin (collision with `dashboard-layout.spec.ts`); beforeAll sweeps prior-run markers. |
| E4 | **STILL BINDING** | Never add `tabindex="0"` to the five `CONVERTED_ROWS` files. |
| E5 | **STILL BINDING** | Events region: `tabindex="0"`, `role="region"`, `aria-label="Upcoming events"`. |
| E6 | **AMENDED** | Events is Pattern A-like now (`max-h-80`); G7 asserts `maxHeight` + `overflowY` there, `overflowY` on the panel lists. |
| E7 | **STILL BINDING** | Bound the existing wrapper; run every mutation. The `/team` sticky part is **OBSOLETE** (D2). |
| E8 | **OBSOLETE** | The regularizations heading is now `<h2>` + HelpTip and postings has an `<h2>`; the links go at the panel foot (items 11–12). |

### 03-09-26 contract (historical — carried verbatim, see marks above)

Status: CONDITIONAL
Date: 03-09-26
date: 2026-09-03
generated-by: outer-pvl

Parallel strategy: sequential (single validate-agent), by owner direction
Rationale: 5/7 signals — S2 (three service signatures + a shared-component prop = public contract
change), S4 (phase program, 10 of 10), S5 (the owner demanded ten named truth checks), S6 (the plan
self-declares MEDIUM-HIGH and lifts an umbrella hard stop on `src/lib/server/services/**`), S7 (~26
files). A 5/7 score would normally route to a fan-out; the plan-agent recommended and the owner
directed a **sequential exhaustive** pass instead, which is the right call here because every check
is a read of the same twenty-odd files and a fan-out would have re-read them N times without any
cross-agent finding. Cost guard: not triggered (1 agent).

**Grade: CONDITIONAL — GO, with 8 binding execute-agent instructions, four of them blocking.**
Every claim in the plan that was checkable against source was re-read on disk at `feat/uiux-phase-10`
(1c84d3f). The plan is unusually accurate — all fourteen `employees/[id]` line references are exact,
both research corrections are confirmed verbatim, and the six traps hold. Three findings are
FAIL-severity as facts and are converted to CONDITIONAL only because each has a small, in-scope fix
that reopens **no settled ruling**: a false proof under D-3 that makes G3 vacuous (C1), a false
premise under D-8 about `Table.svelte`'s consumer count (C2), and an e2e seed that cannot produce
the row volumes G6 asserts (C3). A fourth (C4) is a hard collision with an existing unit gate that
would only surface as a confusing red at execution time.

Test gates (C3 5-column table):

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| AC1 | each of the three dashboard cards renders at most 10 rows however many rows exist | Fully-Automated | `pnpm test` G1 (unit cap) + `pnpm test:e2e tests/e2e/container-bounds.spec.ts` G6 — **G6 requires the E3 fixtures; it is unrunnable on today's seed** | B |
| AC2 | `listUpcomingRegularizations` returns the genuinely most-overdue rows under a cap | Fully-Automated | `pnpm test` G3 **as re-specified by E1** (assert the 10 lowest `daysUntil`, not the 10 earliest `startDate`) + new G3b straddle fixture | B |
| AC3 | `listUpcomingEvents` is capped on the merged sorted output so no event kind is dropped | Fully-Automated | `pnpm test` G2 — slice point confirmed at `dashboard.ts:591`, sole exit of the function | B |
| AC4 | `listPostingsAwaitingApprover` caps AFTER the approver filter | Fully-Automated | `pnpm test` G1b — filter confirmed at `recruitment.ts:248-259`, `orderBy: { updatedAt: 'asc' }` at `:238` | B |
| AC5 | every bounded container scrolls inside its box instead of growing the page | Fully-Automated (dashboard, **G7 as re-specified by E6**); Agent-Probe elsewhere (P2) | G7 + P2 | B / D |
| AC6 | Postings → `/recruitment`, Regularizations → `/employees`, Upcoming Events → no link | Fully-Automated | G6 (link presence) + G9 (scoped absence) — both need E3 fixtures; markup placement per E8 | B |
| AC7 | no existing `Table.svelte` call site changes | Fully-Automated | G4 source scan — **scope corrected by C2/E2: there are exactly TWO call sites, `payslips/+page.svelte:32` and `settings/backup/+page.svelte:217`, not ~30** | B |
| AC8 | the thirteen paginated pages are unchanged | Fully-Automated | G5 + its RED mutation (`take: 10` into `employees/+page.server.ts`) | B |
| AC9 | `employees/[id]` documents and `/team` members are not query-capped | Fully-Automated | G10 source scan — T5 confirmed at `employees/[id]/+page.server.ts:141` → `:161-167`; T3 confirmed at `team/+page.server.ts:42-51` → `:71-77` → `:80-88` | B |
| AC10 | no picker `<select>` gained a cap | Fully-Automated | G10 — the five picker sites confirmed, `employees/[id]:510` already carries `max-h-48 overflow-y-auto` | B |
| AC11 | the dashboard renders at 390px with no horizontal overflow | Fully-Automated | G8 — `grid-cols-1` min-content note confirmed verbatim at `dashboard/+page.svelte:143-146`; **mutation coherence unproven, see C14/E7** | B |
| AC12 | `/leave/balances` loses no rows | Fully-Automated + Agent-Probe | G10 (no cap constant) + P3 — **and E4: that file may not gain `tabindex="0"`** | B / D |
| AC13 | `tests/e2e/dashboard.spec.ts` no worse than the pre-phase baseline | Fully-Automated (flaky, #287) | G11 — risk assessed LOW: the announcement locator is `page.locator('li', {hasText: TITLE}).filter({hasText:'Byline check.'})` and this phase adds no `<li>` carrying that text | A |
| AC14 | the 390px / 1440px look pass across every changed surface | Agent-Probe (owner) | owner manual list, recorded for PROGRAM CLOSE | D |
| AC15 | the full CI gate set is green in CI order | Fully-Automated | `pnpm format:check && pnpm lint && pnpm check && pnpm test` | A |
| R1 | nav resolves for HR_ADMIN / MANAGER / employee | Hybrid — precondition: running app + seeded roles | umbrella standing regression from phase 02 | B |
| R2 | masked-reveal walk on `employees/[id]` still holds | Hybrid — precondition: running app + DB | do-not-break item 3 | B |
| A1 | design-quality bar the CI gates cannot express | Agent-Probe | `impeccable` audit on the changed `.svelte` files | D |

gap-resolution legend: A = proven now; B = gate added by this plan's checklist; C = deferred to a
named later phase; D = backlog test-building stub (named residual, keep-active).

Legacy line form:
- service caps and ordering: [Fully-automated: `pnpm test` — `tests/unit/container-bounds.test.ts` G1/G1b/G2/G3/G3b, each with a named RED mutation]
- source-scan invariants: [Fully-automated: `pnpm test` — `tests/unit/container-bounds-scan.test.ts` G4/G5/G10]
- dashboard counts, geometry and viewport: [Fully-automated: `pnpm test:e2e tests/e2e/container-bounds.spec.ts` G6/G7/G8/G9 — precondition: the E3 seed fixtures]
- dashboard regression: [Fully-automated (flaky #287): `pnpm test:e2e tests/e2e/dashboard.spec.ts`, baseline-compared, read on red]
- CI gate set: [Fully-automated: `pnpm format:check && pnpm lint && pnpm check && pnpm test`]
- nav + masked-reveal regressions: [hybrid: running app + seeded DB]
- the ~20 non-dashboard bounded containers, `/leave/balances` row count, design quality: [agent-probe: P2, P3, impeccable]
- query COST for every container except the three in D-1: [known-gap: documented — `query-level-pagination-unbounded-lists_NOTE_03-09-26.md`, updated at checklist 61]
- a viewport matrix (390/768/1440) for the other nineteen surfaces: [known-gap: documented — cross-reference `phase-03-responsive-sweep_NOTE_03-09-26.md` at UPDATE-PROCESS]
- a shared where→orderBy→take Prisma mock helper: [known-gap: documented — `prisma-mock-orderby-take-helper_NOTE_{date}.md`]
- roster picker typeahead (T4): [known-gap: documented — `roster-select-typeahead_NOTE_{date}.md`, checklist 60]

Dimension findings:

- **Infra fit: PASS.** One SvelteKit app; no container, port, proxy or deploy surface.
  `validate-plan-artifact.mjs` returns 0 failures / 0 warnings. The one genuine infra unknown —
  whether Tailwind v3 JIT compiles `min()` inside an arbitrary value inside `@apply` — was **settled
  empirically, not by reasoning**: there is no existing `min()`/`clamp()` arbitrary value anywhere in
  `src/`, so I built it. `tailwindcss` (v3.4, `package.json:60`) compiled
  `.card-scroll { @apply max-h-[min(60vh,28rem)] overflow-y-auto; }` to
  `.card-scroll { max-height: min(60vh, 28rem); overflow-y: auto }`. **Confirmed working; first
  `min()` in the repo.** `.card` is at `app.css:234-236` as claimed and carries `p-5`, so a scroll
  box on an inner `<ul>` sits inside the card padding — correct.
- **Test coverage: CONCERN.** The anti-vacuous-mock analysis is right and important:
  `tests/unit/dashboard-org-scoping.test.ts:110-130` really does apply only `where`
  (`findMany.mockImplementation(async ({ where }) => EMPLOYEES.filter(...))`) and ignores `orderBy`
  and `take` entirely — reusing it would have made every cap assertion vacuous, exactly as the plan
  says. Three gaps: G3 as specified is vacuous for a different reason (C1); G6/G7/G9 cannot be seeded
  today (C3); and G7 contradicts D-7 Pattern B (C6).
- **Breaking changes: CONCERN.** The three service signature changes are genuinely safe — each
  function has exactly ONE route caller (`dashboard/+page.server.ts:89`, `:102`, `:111-116`), and the
  only other consumer is `tests/unit/recruitment-posting-sod.test.ts:298`, which passes four
  positional arguments, so an optional fifth is inert. `/api/v1/dashboard` genuinely does not call
  any of the three. But the `Table.svelte` blast-radius statement is **wrong by an order of
  magnitude** (C2), and the risk framing that justifies G4 rests on it.
- **Security surface: PASS.** No auth, billing, schema, secret or trust-boundary surface. No
  where-clause, org-scoping or capability change. The two new links are plain anchors inside cards
  that are already gated (`{#if data.canPost && data.regularizations.length}` at
  `dashboard/+page.svelte:606`; `{#if data.postingsToApprove.length}` at `:656`), so neither widens
  reach — the nav-visibility-mirrors-the-load-guard rule is satisfied, and I checked it rather than
  taking the plan's word. **No evidence pack required.** One adjacent note: `canApprovePosting`
  (`recruitment.ts:132-144`) makes a MAPPED department decidable only by its designated approver, HR
  being the fallback for UNMAPPED ones only — the E3 fixtures must respect that or the postings card
  will silently render zero rows.

Section verdicts (Layer 2 — twelve sections, 0 through 11, all probed):

- Section 0 — entry checks: **PASS.** The branch is already `feat/uiux-phase-10` at 1c84d3f with a
  clean tree, so Branch-handling steps 1-2 are done; the merge-not-rebase rule for a stacked PR is
  correct. The registry exists and carries phases 5-8; no `## Phase 10` yet, correct for item 4.
- Section 1 — the shared mechanism: **CONCERN.** C2 (the Table prop has zero consumers), C9 (the
  mobile wrapper has no overflow utility; three line refs off by two). `.card-scroll` itself is
  clean and empirically compiles.
- Section 2 — Upcoming Events: **CONCERN.** C5 (the `<ul>` at `:256` has no focusable descendant, so
  the scroll box is keyboard-unreachable) and C6 (Pattern B sets no max-height, so G7 fails on this
  card). Everything else is exact: the card is `card flex h-full flex-col gap-3` at `:251`, the
  `{:else}` branch at `:279-282` uses `flex flex-1` on a sibling of the `{#if}`, so the plan is right
  that the two `flex-1`s never coexist.
- Section 3 — Upcoming Regularizations: **FAIL-severity finding, converted.** C1 — D-3's
  monotonicity proof is false and G3 as written cannot catch it. Highest-risk edit in the phase.
- Section 4 — Postings: **PASS with a note.** The service shape is exactly as described. Note C8 —
  the card heading at `:657-659` is a bare `<p>`, not a `justify-between` row, so the mandatory link
  needs a wrapper.
- Section 5 — `employees/[id]`: **PASS.** All fourteen line references are **exact** — `:272`, `:511`,
  `:854`, `:905`, `:1029`, `:1067`, `:1131`, `:1194`, `:1392`, `:1692`, `:1754`, `:1864`, `:1886`,
  and `:510`'s existing `max-h-48 overflow-y-auto`. RC-2 confirmed verbatim.
- Section 6 — `/team`: **CONCERN.** C7 — the `overflow-x-auto` wrapper already exists at `:117`;
  "wrap the matrix (`:136` × `:145`)" cannot be done literally because no element may sit between
  `<table>` and `<tbody>`. OD-1 note: the first body cell already carries `sticky left-0 bg-background
  z-10` (`:138`), so a sticky `<thead>` makes this a two-axis sticky and the corner `<th>` needs both
  offsets plus a higher `z-index`.
- Section 7 — `/benefits` + `/leave/balances`: **CONCERN.** C4 — `/leave/balances` is inside
  `a11y-invariants.test.ts`'s `CONVERTED_ROWS`, which asserts that file contains no `tabindex="0"`
  **at file level**. Row refs `:81` and `:101` are exact; the `overflow-x-auto` wrapper is at `:58`.
- Section 8 — `/performance`: **PASS with a note.** RC-1 confirmed exactly — `grep -n orderBy` on
  `performance.ts` returns only `:26`, `:70`, `:81`; `listStalledSignoffs` (`:824-844`) has none and
  post-processes through `Promise.all` + a null filter, the T2 shape. Note C12: **none** of the four
  tables uses `Table.svelte` — all are hand-rolled inside `overflow-x-auto` divs at `:35`, `:81`,
  `:122`, `:161` — so item 47's `Table.svelte` branch is dead and C7 applies to all four.
- Section 9 — `/payroll/[id]` + `/profile`: **PASS.** The `overflow-x-auto` wrapper is at
  `payroll/[id]/+page.svelte:196`; C7 applies.
- Section 10 — settings and config-scale: **PASS.** The "re-derive with grep at execution time rather
  than trusting this list" instruction is the right shape and is why this section is not a concern.
- Section 11 — verification and close: **CONCERN.** C3 (the e2e fixtures do not exist), C10 (fixture
  pollution), C13 (AC7 overclaims what a source scan proves), C14 (G8's mutation may not go red).

Totals: 0 unresolved FAILs / 14 CONCERNs / 6 PASSes (of 16 probes)
→ Net Gate: **CONDITIONAL**

#### Concerns

**C1 — CRITICAL, correctness. D-3's monotonicity proof is FALSE, and G3 as specified stays green on
the bug.** `regularizationDate` is `addUTCMonths(startDate, 6)` (`utils/dates.ts:191-193`), and
`addUTCMonths` (`:172-176`) is `d.setUTCMonth(d.getUTCMonth() + months)`. `setUTCMonth` **overflows;
it does not clamp.** Measured, not reasoned:

```
2025-08-31  +6mo → 2026-03-03
2025-09-01  +6mo → 2026-03-01
```

So `startDate` ascending is **not** `daysUntil` ascending. The map is non-monotonic across every
31-day-month → February boundary; a scan of 400 consecutive start dates found the inversion. The
21-day notice window is narrow but can straddle Aug 29 – Sep 2, which is precisely where it breaks.
Consequence: with `orderBy: { startDate: 'asc' }` + a query `take: 10` (checklist items 17-18), the
database can return a row that is **not** among the ten most overdue, and the surviving JS `.sort()`
at `:53` then presents those wrong rows in convincingly correct order. AC2 is not met. **G3 cannot
catch it** — G3 asserts "returns the 10 earliest `startDate` rows", which is exactly what the buggy
code does. That is the vacuous-green shape this gate exists to prevent, one level up. Fix: **E1**.
This does not reopen the orchestrator's `orderBy`-before-`take` ruling — the `orderBy` stays.

**C2 — HIGH, false premise. `Table.svelte` has TWO call sites, not "~30".** Verified by grep across
`src/routes` and `src/lib`: the only importers are `payslips/+page.svelte:32` and
`settings/backup/+page.svelte:217`. Neither is a phase-10 touchpoint, and `/payslips` is fully
paginated (`paginate` at `+page.server.ts:26`, `take: pagination.take` at `:43`) — it is one of the
thirteen pages G5 exists to protect. Separately, **no** phase-10 target uses `Table.svelte`:
`/performance` (4 hand-rolled tables), `/team`, `/leave/balances`, `/payroll/[id]`, `/settings/*` and
every `employees/[id]` panel are all hand-rolled `{#each}` or `<table>` markup. So the new
`maxHeight` prop would ship with **zero consumers**, and G4 would exist purely to prove that dead
code is harmless. Two plan statements rest on the wrong number — Blast Radius risk 2 ("consumed by
~30 call sites… regresses every table in the app at once") and D-8 ("the 30-odd existing call
sites") — and so does the Resume section's claim that item 7 is "the highest-risk edit in the phase
before twenty files consume it". Nothing consumes it. Fix: **E2**.

**C3 — HIGH, unrunnable gate. The e2e seed cannot produce the row volumes G6/G7/G9 assert; those
gates would fail at 0, not pass at 10.** Read `prisma/seed-core.ts` end to end:
- **Zero `PROBATIONARY` employees.** Every `employmentType` in the file is `'REGULAR'` (`:76`, `:224`,
  `:274`, `:457`, `:762`, `:793`). `listUpcomingRegularizations` filters
  `employmentType: 'PROBATIONARY'`, so it returns `[]` and the card does not render at all
  (`{#if data.canPost && data.regularizations.length}`).
- **Zero `publicHoliday` rows** — `grep publicHoliday prisma/seed-core.ts` returns nothing. With
  ~13 employee records total and a 14-day window (`UPCOMING_EVENT_DAYS = 14`,
  `dashboard.ts:402`), Upcoming Events will not reach 10.
- **One `jobPosting`** (`:877`), `status: 'OPEN'` — not `PENDING_APPROVAL`. So
  `listPostingsAwaitingApprover` returns `[]` and that card does not render either.

G6's `toHaveCount(10)` therefore cannot bite; the plan's "use an org with >10 rows per card" names no
mechanism. The repo already has the right precedent and the plan does not cite it:
`tests/e2e/pagination.spec.ts:13-62` seeds its own 25 fixtures in `beforeAll` with a distinctive
surname and tears them down in `afterAll`. Fix: **E3**.

**C4 — HIGH, hard collision with an existing gate. `/leave/balances` may not gain `tabindex="0"`.**
`tests/unit/a11y-invariants.test.ts` lists `routes/(app)/leave/balances/+page.svelte` in
`CONVERTED_ROWS` (`:45`) and then asserts, at **file level, not scoped to `<tr>`**:
`expect(read(file), file).not.toContain('tabindex="0"')` (`:75-81`). If the executor makes that
page's scroll box keyboard-reachable the obvious way, `pnpm test` goes red with the message *"no
converted row is still a focusable fake control"* — a failure that points at the wrong thing and will
cost an execution cycle. The same trap applies to the other four `CONVERTED_ROWS` files
(`employees/`, `requests/`, `leave/`, `recruitment/`). Fix: **E4**.

**C5 — MEDIUM, accessibility. The Upcoming Events scroll box would be keyboard-unreachable.** Its
`<li>` contents (`dashboard/+page.svelte:257-278`) are `<p>` and `<span>` only — no link, no button,
no focusable descendant of any kind. A scrollable region with no focusable child cannot be scrolled
by keyboard (WCAG 2.1.1). Of the phase's scroll boxes this is the one confirmed case; the
regularizations `<ul>` (`:631`) and the postings `<ul>` (`:666`) both contain links or form buttons,
and `dashboard/+page.svelte` is **not** in `CONVERTED_ROWS`, so it is safe to fix. Fix: **E5**.

**C6 — MEDIUM, contradiction. G7 fails on the one card that uses D-7 Pattern B.** G7 asserts
`getComputedStyle(el).maxHeight !== 'none'` for "each capped card". Pattern B (Upcoming Events) is
`min-h-0 flex-1 overflow-y-auto` — it sets **no** `max-height` at all; the bound comes from the flex
parent's height. G7 would report `'none'` and go red on correct code. Fix: **E6**.

**C7 — MEDIUM, mechanical feasibility. "Wrap the matrix" cannot be done as written — the wrapper
already exists.** Every table target already sits inside an `overflow-x-auto` div: `/team` `:117`,
`/leave/balances` `:58`, `/performance` `:35`/`:81`/`:122`/`:161`, `/payroll/[id]` `:196`. Checklist
39 says to wrap `team/+page.svelte:136 × :145` — those are the `{#each}` lines **inside** `<tbody>`,
and no element may legally sit between `<table>` and `<tbody>`. Fix: **E7**.

**C8 — MEDIUM, markup. Neither view-all link has a heading row to sit in.** The `.btn-row` precedent
(`dashboard/+page.svelte:155`) lives inside a `flex items-center justify-between` wrapper. The
regularizations heading is `<div class="flex items-center gap-2">` holding an `<svg>` and a `<p>`
(`:608-627`) — adding an anchor there puts it flush against the label. The postings heading
(`:657-659`) is a bare `<p>` with no flex row at all. Fix: **E8**.

**C9 — LOW, line drift in `Table.svelte` (only load-bearing if C2 is overridden).** `$props()` is
`:13-37` (plan says `:13-35`); the desktop wrapper is `:59-61` (plan says `:57-59` — those are its
comment lines); the `rows.length === 0` branch is `:47-55` (plan says `:45-53`). All three are off by
two. Also: the mobile wrapper is `<ul class="space-y-2 sm:hidden">` at `:106` and carries **no**
overflow utility, so a `maxHeight` applied there without `overflow-y-auto` would clip rather than
scroll. The desktop wrapper already has `overflow-x-auto`, so adding `overflow-y-auto` there gives
`overflow: auto` on both axes — correct, but worth knowing.

**C10 — LOW, e2e fixture pollution.** New **ACTIVE** `PROBATIONARY` fixtures will be swept into any
payroll compute running in another spec, and `payrollEntry → employee` is FK `RESTRICT`. This is the
exact trap `pagination.spec.ts:64-79` documents in its teardown comment. Covered by E3.

**C11 — LOW, citation drift elsewhere (excellent hit rate overall).** Off by one or two:
regularizations card `:607` not `:608`, its `<ul>` `:631` not `:632`; `team/+page.server.ts` members
`:42-51` not `:43-50`, the attendance `in:` `:71-77` not `:69-75`, the map `:80-88` not `:78-84`;
`getEmploymentHistory`'s derivation loop is `:1354-1395`, not `~:1355-1370`; `/performance`'s `:45`,
`:92`, `:132`, `:171` are the `{#each}` rows, not the table wrappers. Exact and confirmed:
`dashboard.ts:22-37`, `:53`, `:449-453`, `:591`, `:469-481`; `recruitment.ts:229-266`, `:238`,
`:248-259`, `:256-258`; `employees.ts:1307-1322`; `performance.ts:824-832`;
`employees/[id]/+page.server.ts:141`, `:161-167`; `dashboard/+page.server.ts:89`, `:102`, `:111-116`,
`:119-121`; `dashboard/+page.svelte:143-146`, `:147`, `:155`, `:251`, `:256`, `:279-282`, `:307`,
`:657`, `:666`, `:667-668`; `app.css:234-236`; `leave/balances/+page.svelte:81`, `:101`;
`performance/templates/[id]/+page.svelte:436`; and all fourteen `employees/[id]/+page.svelte` refs.
Checklist item 2 already mandates re-verification, which is why this is LOW.

**C12 — LOW, dead branch. Checklist 47's `Table.svelte` fork never fires.** None of `/performance`'s
four tables uses `Table.svelte`; all four are hand-rolled. The instruction resolves to "`.card-scroll`
on all four" — and per C7, onto the existing `overflow-x-auto` wrapper.

**C13 — LOW, overclaim. AC7 says "renders a character-identical class string"; G4 is a source scan.**
There is no component-render harness in this repo, so no gate can observe rendered output. The plan's
own "What this coverage does NOT prove" already says source scans do not prove rendering; AC7's
wording should match. Restate AC7 as: *no call site outside the listed ones passes `maxHeight`, and
the prop is never given a default in `$props()`* — which is what G4 actually proves and what its two
mutations actually test.

**C14 — LOW, unproven mutation. G8's RED mutation may not go red.** `grid-cols-1` emits
`minmax(0, 1fr)`, so the column can shrink; a `whitespace-nowrap` added inside a chain that still has
`min-w-0` will clip rather than overflow. The mutation must remove `min-w-0` from the whole chain to
the nowrap element, and it must be **run**, not assumed. Covered by E7's general rule.

#### Truth checks demanded by the owner — results

1. **RC-1 and RC-2 — both CONFIRMED exactly.** RC-1: `grep -n orderBy src/lib/server/services/
   performance.ts` returns only `:26`, `:70`, `:81`. `listStalledSignoffs` (`:824-844`) has no
   `orderBy` and post-processes via `Promise.all` + `.filter(Boolean)` — the T2 shape exactly as the
   correction states. RC-2: `getEmploymentHistory` (`:1307-1322`) does carry
   `orderBy: { createdAt: 'desc' }`, so a `take` would be order-safe — but the derivation loop ends
   `if (changes.length > 0) { events.push(...) }`, so a log row that produced no field change yields
   no event and `take: N` gives fewer than N events, unpredictably. Both corrections stand and both
   correctly **narrow** the service surface.
2. **The `startDate` monotonicity claim — FALSE. See C1.** This is the one place the plan reasoned to
   a number instead of measuring it. `setUTCMonth` overflows rather than clamps; `2025-08-31 → 2026-03-03`
   while `2025-09-01 → 2026-03-01`.
3. **The `Table.svelte` prop-less no-op claim — provable in principle, but the premise is wrong and
   the gate is weaker than AC7 says.** G4 **can** go red: adding `maxHeight="10rem"` to an unlisted
   call site fails the second assertion, and writing `maxHeight = 'none'` into `$props()` fails the
   first. Both mutations are real. But it proves text, not bytes (C13), and there are two call sites,
   not thirty (C2) — and the phase's own list of sites to add is empty.
4. **The `listUpcomingEvents` slice point — CONFIRMED.** `return events.sort((a, b) =>
   a.date.localeCompare(b.date) || a.title.localeCompare(b.title))` at `dashboard.ts:591` is the
   function's **sole** exit. `grep` across `src` and `tests` finds exactly one caller,
   `dashboard/+page.server.ts:89`; nothing else consumes the merged array. T1's four-in-one roster
   read is confirmed at `:469-481` with the comment at `:469-470` stating the intent.
5. **The extended mock harness — the diagnosis is CONFIRMED and the fixture design is sound, given
   E1.** `dashboard-org-scoping.test.ts:110-130` really is
   `findMany.mockImplementation(async ({ where }) => EMPLOYEES.filter((e) => matches(e, where)))` —
   `orderBy` and `take` are destructured away and never read. Reusing it would make every cap
   assertion vacuous, exactly as the plan warns. The where→orderBy→take ordering and the
   declared-out-of-order fixtures are the right design and would catch a dropped `orderBy` **at the
   mock level**. What they cannot catch is C1, because there the service forwards a *correct-looking*
   `orderBy` that is the wrong key. E1's G3b closes it.
6. **The six traps — all CONFIRMED at source.** T1 `dashboard.ts:469-481`/`:591`. T2
   `dashboard.ts:22-37` (no `orderBy`) + `:53` (JS sort). T3 `team/+page.server.ts:42-51` →
   `employeeId: { in: members.map((m) => m.id) }` `:71-77` → `attendanceMap` `:80-88`. T4 five picker
   sites, `employees/[id]:510` already `max-h-48 … overflow-y-auto`. T5
   `employees/[id]/+page.server.ts:141` → `documents.map((d) => d.category)` into
   `getEmployeeOnboarding` `:161-167`. T6 out of scope, G5 covers it. **The plan's sections respect
   every one**: no `take` on the `/team` members query (item 38 forbids it), no query cap on the
   documents query (items 30-31 forbid it), pickers untouched (items 36, 43).
7. **e2e — the seeds CANNOT produce the volumes. See C3.** The `dashboard.spec.ts` locator risk is
   real but LOW: `page.locator('li', { hasText: TITLE }).filter({ hasText: 'Byline check.' })` is
   page-wide, but this phase adds no `<li>` carrying that body text. Item 58's "read the failure, do
   not re-run blindly" is the right mitigation and is adequate.
8. **Tailwind `min()` — CONFIRMED by building it.** v3.4 (`package.json:60`); no existing
   `min()`/`clamp()` arbitrary value anywhere in `src/`; a real `tailwindcss` build of
   `@apply max-h-[min(60vh,28rem)] overflow-y-auto` emitted `max-height: min(60vh, 28rem)`. The
   390px constraint is not violated: `grid-cols-1` at `dashboard/+page.svelte:147` with its
   min-content note verbatim at `:143-146`, and the new wrappers are inner `<ul>`s that add no
   min-content floor — provided E5's `tabindex` addition does not introduce one, which it does not.
9. **Mutation coherence — 8 of 10 sound, 2 flawed.** Sound and able to go red: G1 (remove `take`),
   G1b (move the slice before the filter), G2 (move the limit onto the roster `findMany`), G4 ×2,
   G5 (`take: 10` into `employees/+page.server.ts`), G6 (remove a cap), G9 (add a link). Flawed: **G3
   cannot go red on the real defect** (C1) — and its stated negative control, "G3 red while G1 stays
   green", *is* coherent as written and remains coherent after E1, because G1 counts rows and G3
   checks identity; E1 only changes which rows G3 demands. **G7 goes red on correct code** for the
   Pattern B card (C6). **G8's mutation is unverified** (C14).
10. **Phase-9 interaction — CONFIRMED, zero overlap.** Phase 09's Touchpoints are
    `src/routes/(auth)/login/+page.server.ts` and `+page.svelte` plus test files; it declares
    `src/app.css`, `src/lib/components/ui/**` and `src/lib/server/services/**` **out of bounds**
    (`phase-09…:644-646`). Phase 10 touches none of the login files. The intersection is empty. The
    branch instructions are present and correct — the merge-not-rebase rule is right for a pushed
    branch with PR #19 stacked on #18, and recording the phase-9 tip SHA in the report is the right
    audit trail. Steps 1-2 are already satisfied: the tree is on `feat/uiux-phase-10` at 1c84d3f,
    clean.

#### Binding execute-agent instructions

| # | Instruction | Trigger |
|---|---|---|
| **E1** (blocking) | **Do not apply the regularization limit as a query `take`.** Keep checklist item 17 exactly as written — `orderBy: { startDate: 'asc' }` goes in, for query determinism, and its comment stays. **Replace item 18**: apply `limit` as `.slice(0, limit ?? events.length)` **after** the existing JS `.sort((a, b) => a.daysUntil - b.daysUntil)` at `dashboard.ts:53`, the same shape T1 mandates for `listUpcomingEvents`. Reason, and put it in the comment: `regularizationDate = addUTCMonths(startDate, 6)` and `setUTCMonth` **overflows rather than clamps**, so `2025-08-31 → 2026-03-03` while `2025-09-01 → 2026-03-01` — `startDate` order is **not** `daysUntil` order across a 31-day-month → February boundary, and a query `take` can return rows that are not the most overdue. Amend **D-3** in this plan to say so; the `orderBy`-before-`take` ruling is honoured (the `orderBy` stays), only the cap's position moves. Then **re-specify G3**: assert the returned 10 are the 10 lowest `daysUntil`, not the 10 earliest `startDate`. Then **add G3b**, a straddle fixture with `startDate`s at `2025-08-30`, `2025-08-31` and `2025-09-01` and an `asOf` that puts all three in window, asserting the `2025-09-01` row outranks both August rows. **RED mutation for G3b:** put the limit back as a query `take` → G3b goes red while G1 stays green. Record both in the phase report. The query stays unbounded for this function; note that residual in the checklist-61 backlog update alongside the others. | Section 3, items 17-18, 22-23 |
| **E2** (blocking) | **Default: do NOT add the `maxHeight` prop to `Table.svelte`.** It has exactly two call sites — `payslips/+page.svelte:32` and `settings/backup/+page.svelte:217` — and **no** phase-10 target uses the component, so the prop would ship with zero consumers, which the repo's simplicity rule forbids. Use `.card-scroll` (or the existing wrapper per E7) everywhere instead. Drop checklist item 7, drop G4, drop AC7, and delete the `Table.svelte` row from Touchpoints and from Blast Radius risk 2 — replacing that risk with the accurate one: **the risk is that ~20 hand-rolled containers each get their own wrapper edit, so `.card-scroll` is the single point of change and the only shared surface.** Correct D-8 to one addition, not two. If the owner overrides and wants the prop kept anyway, then it MUST be applied to at least one real call site in this phase, C9's line numbers apply (`$props()` `:13-37`, desktop wrapper `:59-61`, empty branch `:47-55`), and the mobile `<ul>` at `:106` must also receive `overflow-y-auto` or a max-height there clips instead of scrolling. Record the choice and its reason in the phase report. | Section 1, item 7; Section 8, item 47 |
| **E3** (blocking) | **`tests/e2e/container-bounds.spec.ts` must seed its own fixtures — G6/G7/G9 cannot run on today's seed.** Verified: zero `PROBATIONARY` employees, zero `publicHoliday` rows, one `jobPosting` and it is `OPEN`. Mirror `tests/e2e/pagination.spec.ts:13-79` exactly — `test.describe.configure({ mode: 'serial' })`, a `beforeAll` that upserts with a distinctive marker, an `afterAll` that deletes **`payrollEntry` first** (FK `RESTRICT`), then employees, then users, wrapped in try/catch as best-effort. Seed: (a) ≥11 `PROBATIONARY` `ACTIVE` employees with `startDate` inside the 21-day notice window; (b) ≥11 `publicHoliday` rows inside the next 14 days — the cheapest way to overflow Upcoming Events, since none are seeded today; (c) ≥11 `jobPosting` rows with `status: 'PENDING_APPROVAL'`, `submittedById` **≠** the logged-in actor's user id, and a `departmentId` whose `postingApprover` mapping resolves to the actor — or an UNMAPPED department with an HR actor. Both routes work; `canApprovePosting` (`recruitment.ts:132-144`) makes a MAPPED department decidable **only** by its designated approver, HR being the fallback for unmapped ones only, so getting this wrong renders zero rows and G6 fails for the wrong reason. If any fixture cannot be created, say so and mark that gate a named gap — do **not** weaken `toHaveCount(10)` into a `toBeLessThanOrEqual`. | Section 11, item 57 |
| **E4** (blocking) | **Never add `tabindex="0"` to `src/routes/(app)/leave/balances/+page.svelte`** — nor to `employees/+page.svelte`, `requests/+page.svelte`, `leave/+page.svelte`, or `recruitment/+page.svelte`. `tests/unit/a11y-invariants.test.ts:75-81` asserts, at file level, that each `CONVERTED_ROWS` file (`:42-48`) contains no `tabindex="0"`. It is not needed on any of them: their rows carry real `<a>` links, so the scroll region already has focusable descendants. If `pnpm test` ever fails with *"no converted row is still a focusable fake control"* after a phase-10 edit, this is the cause — remove the `tabindex`, do not amend the gate. | Sections 7 and 10 |
| E5 | **Make the Upcoming Events scroll box keyboard-operable.** Its `<li>` contents (`dashboard/+page.svelte:257-278`) are `<p>`/`<span>` only — no focusable descendant, so a keyboard user cannot scroll it. Add `tabindex="0"` **plus** `role="region"` and an `aria-label` (or `aria-labelledby` pointing at the "Upcoming Events" `<p>`) to the `<ul>` at `:256`. `dashboard/+page.svelte` is **not** in `CONVERTED_ROWS`, so this is safe. Apply the same test to every other scroll box this phase creates — add `tabindex="0"` only where the region has **no** focusable child, and never in the five files E4 names. Record which boxes got it. | Section 2, item 13 |
| E6 | **Re-specify G7 so it does not fail on correct code.** For Pattern A boxes (`.card-scroll`) keep both assertions. For Pattern B boxes — the Upcoming Events card, `min-h-0 flex-1 overflow-y-auto`, which sets **no** `max-height` — assert `scrollHeight > clientHeight` and `getComputedStyle(el).overflowY === 'auto'` instead. Name in the spec which card is which. **RED mutation for the Pattern B arm:** remove `overflow-y-auto` from that `<ul>` → `overflowY` is `'visible'`, red. | Section 11, item 57 |
| E7 | **Put the vertical bound on the EXISTING wrapper; do not add a new one.** Every table target already sits in an `overflow-x-auto` div — `/team` `:117`, `/leave/balances` `:58`, `/performance` `:35`/`:81`/`:122`/`:161`, `/payroll/[id]` `:196`. No element may sit between `<table>` and `<tbody>`, so checklist 39's literal "wrap the matrix (`:136` × `:145`)" is not executable. Add the max-height and `overflow-y-auto` to that existing div, giving `overflow: auto` on both axes and preserving the horizontal backstop item 40 asks about (it is present on all of them — nothing to add). **OD-1 is settled per the plan's own recommendation — attempt sticky, fall back once, record it** — with this addition: the first body cell already carries `sticky left-0 bg-background z-10` (`team/+page.svelte:138`), so a sticky `<thead>` makes this a two-axis sticky; the corner `<th>` needs `sticky left-0 top-0` **and** a higher `z-index` than either single-axis cell, or it will scroll under. One attempt, then the plain box. **And the general rule for this phase: every RED mutation named in the Verification Evidence table must be RUN. If a mutation does not go red — G8's is the one I could not verify statically, because `grid-cols-1` emits `minmax(0, 1fr)` and a `min-w-0` chain will clip rather than overflow — the gate is VOID. Report it as a gap; do not accept the green.** | Sections 6, 7, 8, 9; item 59 |
| E8 | **Give both view-all links a heading row.** The `.btn-row` precedent (`dashboard/+page.svelte:155`) sits inside `flex items-center justify-between`. The regularizations heading is `<div class="flex items-center gap-2">` with an `<svg>` and a `<p>` (`:608-627`) — add `justify-between` and wrap the svg+`<p>` pair so the anchor lands on the right. The postings heading (`:657-659`) is a bare `<p>` — wrap the `<p>` and the new anchor in `<div class="flex items-center justify-between gap-2">`. Labels stay exactly as D-4 specifies: `View all employees` and `View all postings`. | Sections 3 and 4, items 21 and 28 |

**Also settled by this contract, no further decision needed:**
- **OD-1** — settled per the plan's recommendation: attempt `sticky top-0`, fall back to the plain
  scroll box after one attempt and record the compromise. See E7 for the two-axis corner-cell detail.
- **OD-2** — settled per the plan's recommendation: show the "showing first 25 of N" note **only when
  N > 25**. A note on an uncapped list is noise.
- **No evidence pack required.** No high-risk class is touched: no auth, billing, schema, migration,
  destructive write, deploy/container surface, or trust-boundary logic. The three service signature
  changes are additive optional parameters with one caller each, and no where-clause or org-scoping
  changes.

Open gaps:
- Query **cost** is unchanged for every container except the three in D-1 — and after E1, for
  `listUpcomingRegularizations` too, since its cap moves off the query: known-gap: documented —
  `query-level-pagination-unbounded-lists_NOTE_03-09-26.md`, updated at checklist 61. E1 adds one line
  to that update.
- `/leave/balances` still needs real `skip`/`take` + `count`: known-gap: documented — same note, D-6.
- `/benefits` enrolments would be `take`-safe (`benefits.ts:115-123` carries
  `orderBy: [{ status: 'asc' }, { effectiveDate: 'desc' }]`) but the D-1 lift does not cover it:
  known-gap: documented — same note.
- No viewport-matrix Playwright projects (390 / 768 / 1440): known-gap: documented — cross-reference
  `phase-03-responsive-sweep_NOTE_03-09-26.md` at UPDATE-PROCESS rather than filing a third note.
- No shared where→orderBy→take Prisma mock helper: known-gap: documented —
  `prisma-mock-orderby-take-helper_NOTE_{date}.md` at UPDATE-PROCESS.
- Roster picker typeahead (T4, five sites): known-gap: documented — `roster-select-typeahead_NOTE_{date}.md`,
  checklist 60.
- No component-render test tier exists in this repo, which is why AC7 can only ever be a source scan
  (C13) and why the ~20 non-dashboard containers rest on P2: known-gap: documented.

What this coverage does NOT prove:
- **G4/G5/G10 are source scans.** They prove a string is or is not present in a file. They do not
  prove a table renders, a cap applies at runtime, or a scroll box is usable. After E2, G4 is dropped
  entirely.
- **G1/G1b/G2/G3/G3b run against a mocked Prisma client.** They prove the service's own logic given a
  mock that applies where → orderBy → take. They do **not** prove Postgres returns rows in that order,
  that the `startDate` index exists, or that `take` is pushed into SQL. G3b proves the JS ordering is
  correct after E1; it says nothing about the database.
- **G6/G7/G8/G9 cover the dashboard only**, and only once the E3 fixtures exist. The ~20 other bounded
  containers rest on **P2** — agent judgment recorded in a report, not repeatable in CI.
- **G8 proves one viewport on one page.** It says nothing about 390px on the other nineteen surfaces;
  that is AC14, the owner's list. Its RED mutation is unverified (C14) — if it does not go red the
  gate is void.
- **Nothing proves the cap is the RIGHT number.** Ten rows is an owner default; no gate can tell a
  useful cap from a frustrating one. That is P1 and the owner's look pass.
- **Nothing proves query cost improved.** For every container except the two remaining D-1 functions
  the database still returns every row — and after E1, three of the four capped surfaces are
  render-caps, not query-caps.
- **`pnpm test:e2e` is flaky (#287).** A green run does not prove correctness; a red run must be read,
  never re-run blindly.
- **Nothing proves this is safe in production.** This repo has never been deployed live.

Gate: CONDITIONAL (0 unresolved FAILs; 14 concerns, every one with a named fix; execute-agent bound
to E1-E8, of which E1, E2, E3 and E4 are blocking for their sections)
Accepted by: session (outer PVL, autonomous) — accepted concerns, by name: C1 (false monotonicity
proof → fixed by E1, D-3 amended, G3 re-specified, G3b added), C2 (`Table.svelte` consumer count
wrong by an order of magnitude → fixed by E2), C3 (e2e fixtures do not exist → fixed by E3), C4
(`tabindex` collision with `a11y-invariants` → fixed by E4), C5 (keyboard-unreachable scroll box →
E5), C6 (G7 contradicts Pattern B → E6), C7 (wrapper already exists → E7), C8 (heading rows → E8),
C9/C11 (line drift → checklist item 2 already mandates re-verification), C10 (fixture pollution →
covered by E3), C12 (dead branch → covered by E2), C13 (AC7 overclaim → restated), C14 (unverified
G8 mutation → covered by E7's run-every-mutation rule). The owner's settled rulings — cap plus
max-height plus view-all-where-a-destination-exists, scale on all screens, the branch and PR
stacking, the narrow service lift, the six traps, `orderBy` before `take` with a negative control,
no new pages, dashboard cap 10, one `.card-scroll` class, the viewport-relative idiom, the full
ranked scope, and `/leave/balances` scroll-only — were treated as binding. **None is reopened.** E1
keeps the `orderBy` and keeps the negative control; it moves only where the cap is applied, because
the arithmetic proves the query position is unsafe. E2 asks the owner to confirm one half of the
"one class plus one optional prop" mechanism, because the fact that justified the prop turned out to
be false; the `.card-scroll` half is untouched.

Autonomous Goal Block: not written to this phase plan — BRANCH B. The umbrella
`ui-ux-overhaul-umbrella_PLAN_03-09-26.md` carries `## Stable Program Goal` (line 79) and governs
this program's autonomous execution.

## Resume and Execution Handoff

1. **Selected plan file:**
   `process/features/ui-ux-overhaul/active/ui-ux-overhaul_03-09-26/phase-10-container-bounds_PLAN_03-09-26.md`
2. **Last completed step:** port revision written (23-09-26). On the branch: `.card-scroll` +
   the scan test (`197cf02`, scan RED 4/30 by design until Lane D1). No Lane A–D2 code yet.
3. **Validate-contract status:** CONDITIONAL, port contract 23-09-26 in `## Validate Contract`
   (VC-1..VC-15 bind EXECUTE). The 03-09-26 contract is historical.
4. **Supporting context loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`,
   the reference commits (`git show 5c939d3 854c2b0 5b454a8 cbb081b 76bd34a 313dd78 dc024fc ef3fb0f
   ced04d4 f304d35 c003cc5`), `tests/e2e/dashboard-layout.spec.ts`,
   `tests/e2e/posting-approver-sod.spec.ts`, `tests/e2e/helpers.ts`, `playwright.config.ts`
   (`fullyParallel: true` locally), `backlog/dashboard-alert-panels-need-view-all-link_NOTE_18-09-26.md`.
5. **Next step for a fresh agent:** after re-PVL, the orchestrator does Section 0, then spawns Lanes
   A, B, C1, C2, D1, D2 in parallel (each gets this path, its lane row, the code rules, and the
   `[PONYTAIL]` directive). Commit in unit order 1→6 as each lane's gates go green; D1 goes fully
   green only after A–C2 are in.
6. **Primary execute anchor:** this file.
7. **Supporting files (read-only):** `ui-ux-overhaul-umbrella_PLAN_03-09-26.md`,
   `phase-10-container-bounds_RESEARCH_03-09-26.md`, `phase-blast-radius-registry.md`,
   `process/features/ui-ux-overhaul/backlog/container-bounds-gaps_NOTE_23-09-26.md`.

---

## OPEN DECISIONS

None blocking. OD-1 (`/team` sticky header) is **OBSOLETE** — `/team` is dropped (D2). OD-2 is
settled: the "showing the first 25 of N" note renders only when N > 25.
