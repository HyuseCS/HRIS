---
name: plan:ui-ux-overhaul-phase-10-container-bounds
description: "Phase 10 of the Veent HRIS UI/UX overhaul — bound every list container that grows with database rows. One shared .card-scroll class plus an optional Table.svelte maxHeight, applied across three dashboard cards and the ranked repo-wide sweep, with query caps only where the research proves a take is safe."
date: 03-09-26
feature: ui-ux-overhaul
phase: "10"
---

# Phase 10 — `container-bounds`

**TL;DR** — Nothing on this app stops a list growing forever. Three dashboard cards, the 201 file,
the team matrix and ~15 other stacks render one DOM row per database row. This phase adds **one**
CSS class and **one** optional Table prop, then applies three fixes per container: cap what is
loaded or rendered, put a viewport-aware max-height with scroll behind it as a backstop, and add a
"view all" link where a destination already exists. Six named fetch-vs-markup traps are binding —
two containers must be capped at the query, one must never be capped at the query, and the pickers
must never be capped at all. No new pages, no new dependency, no schema change. The service
out-of-bounds rule is lifted narrowly and only for the functions named here.

**Date**: 03-09-26
**Status**: PLANNED — PVL pending. No code changed.
**Complexity**: COMPLEX (phase of a now-10-phase program; ~26 files, 3 service functions, 1 new CSS
class, 1 new component prop, 3 new test files)
**Feature**: ui-ux-overhaul
**Phase**: 10 of 10 — `container-bounds`
**Branch**: `feat/uiux-phase-10` off `feat/uiux-phase-9`; PR #19 stacked on #18

---

## Overview

Phase 03 gave the app a design system. Phase 07 split the pages that were too long. Neither asked
what happens when a list has 500 rows in it. The answer, verified in
`phase-10-container-bounds_RESEARCH_03-09-26.md`, is that roughly twenty containers render one DOM
node per database row with no ceiling of any kind. On a seeded demo tenant they look correct. At
500 staff the Upcoming Events card is 40–60 rows tall, the 201 file's Employment History is one row
per edit ever made, and the team matrix is members × dates.

This is not a redesign. It is the same rule applied twenty-odd times:

1. **Cap** the items loaded or rendered.
2. **Max-height plus scroll inside** as the backstop, so a cap that is wrong or a container that
   cannot be capped still cannot push the page apart.
3. **"View all" link** where a destination already exists.

Plus one added owner ruling that shapes every value chosen below: **it must scale on all screen
sizes**, phone through wide desktop.

The phase runs last because the dashboard cards it caps were re-laid-out by phase 02, the `.card`
class it extends was written by phase 03, and `Table.svelte` — which gets the optional height prop —
is phase 03's primitive. Running earlier would mean capping containers that then move.

---

## Goal

Every list container in the app has a ceiling. A container either loads a bounded number of rows,
or renders a bounded number, or scrolls inside a bounded box — and in most cases all three.

**Non-goal, stated up front:** this does not fix query *cost*. Where the research proves a query
`take` is unsafe (the six traps), the fix is a render cap and a scroll box; the database still
returns every row. That residual is already recorded in
`process/features/ui-ux-overhaul/backlog/query-level-pagination-unbounded-lists_NOTE_03-09-26.md`
and this phase updates that note rather than pretending to close it.

## Non-Goals

- **No new destination pages.** Where no view-all target exists (Upcoming Events), the link is
  omitted. Building an `/events` page is out of scope (owner ruling 4).
- **No column-axis redesign** for the two 2-D matrices (`/team`, `/leave/balances`). Vertical bound
  only, plus a horizontal-scroll backstop if one is missing (owner ruling 8).
- **No changes to the paginated pages.** Thirteen surfaces already use
  `src/lib/server/pagination.ts` + `Pagination.svelte`. They are byte-unaffected and a gate proves it.
- **No cap on any picker `<select>`.** Capping a roster picker makes people unreachable. Typeahead
  goes to backlog (owner ruling 2).
- **No query cap on `employees/[id]` documents.** The same array feeds the onboarding checklist.
- **No new npm dependency, no schema change, no `rbac.ts` change.**
- **Not touching D5 (Recent Activity), D6 (Announcements), D7 (My Status), D8 ("Awaiting you").**
  D8's scoping comment (`dashboard/+page.svelte:50-56`) is preserved verbatim.

---

## Settled Decisions (do not reopen)

These were ruled by the owner and the orchestrator on 03-09-26. They are recorded here so a later
reader does not read them as open choices.

### D-1 — The service boundary is lifted, narrowly

The umbrella's hard stop — *"Any change to `src/lib/server/services/**`"*
(`ui-ux-overhaul-umbrella_PLAN_03-09-26.md:100`, repeated at `:644` as **out of bounds**) — is
**LIFTED for phase 10 only**, and only for these functions:

| File | Function | What may change |
|---|---|---|
| `src/lib/server/services/dashboard.ts` | `listUpcomingEvents` | add an optional `limit` param, applied to the **merged sorted output** at the return |
| `src/lib/server/services/dashboard.ts` | `listUpcomingRegularizations` | add `orderBy: { startDate: 'asc' }` to the `findMany`, then an optional `limit` |
| `src/lib/server/services/recruitment.ts` | `listPostingsAwaitingApprover` | add an optional `limit`, applied after the approver filter |

**Nothing else in `src/lib/server/services/**` is touched.** Every other bound in this phase is a
render cap or a CSS backstop. The lift does not extend to phase 11 or to any later work.

### D-2 — The six fetch-vs-markup traps are binding

Verbatim from the research §"Fetch-bound vs markup-bound traps (binding)", each re-verified against
source while writing this plan:

| # | Trap | Verified at | Consequence for this plan |
|---|---|---|---|
| T1 | `listUpcomingEvents` reads the **entire active roster** in one query that feeds four derived event kinds (birthdays, anniversaries, regularizations, contract ends) | `dashboard.ts:469-481` — the comment at `:469-470` states the four-in-one intent | Cap the **merged sorted output** at the `return events.sort(...)` on `dashboard.ts:591`. A query `take` drops whole event categories. |
| T2 | `listUpcomingRegularizations` sorts **post-fetch in JS** (`.sort((a,b) => a.daysUntil - b.daysUntil)`) with **no `orderBy` on the query** | `dashboard.ts:22-37` (findMany, no orderBy) and `:53` (the JS sort) | Add `orderBy: { startDate: 'asc' }` **before** any `take`. A take without it caps the wrong rows silently. **Negative control mandatory** (Gate G3). |
| T3 | `/team` members query is **reused** to build the attendance fetch (`employeeId: { in: members.map(...) }`) and `attendanceMap` | `team/+page.server.ts:43-50` (members) → `:69-75` (attendance `in:`) → `:78-84` (map) | `/team` gets a **markup-level bound only**. Capping members silently changes derived attendance. |
| T4 | Picker `<select>` domains | dashboard `:377-379`; `employees/[id]` `:511`, `:1692`; benefits `:209`; posting-approvers | **Never capped.** Native select scrolls itself. Typeahead → backlog note. |
| T5 | `employees/[id]` documents is **reused** for the onboarding checklist | `employees/[id]/+page.server.ts:141` (fetch) → `:161-167` (`documents.map(d => d.category)` into `getEmployeeOnboarding`) | **Never query-capped.** Render-cap only. A query cap corrupts the onboarding checklist. |
| T6 | `/requests/approvals`, `/requests/proposals`, `/separations`, `/inventory`, employee-branch inquiries use `paginate(url, rows.length)` then slice | see the backlog note `:20-27` | Out of phase-10 scope entirely; the source-scan gate G5 proves they are unchanged. |

### D-3 — Regularization order under the cap

Most-overdue / soonest-first, i.e. `startDate: 'asc'`.

**Why this is equivalent to the existing behaviour, proven:** `regularizationDate = startDate +
REGULARIZATION_MONTHS` (`dashboard.ts:17-20`, `regularizationStatus` in `$lib/utils/dates`), so
`daysUntil` is strictly monotonic increasing in `startDate`. `orderBy: { startDate: 'asc' }` and the
existing `.sort((a,b) => a.daysUntil - b.daysUntil)` produce the **same order**. The existing
docstring already claims this order (`dashboard.ts:9-11`: *"Ordered soonest first so overdue rows
lead"*) — the query never enforced it. The JS sort **stays** as the belt-and-braces; it is now
redundant, not wrong, and removing it would make the cap depend on one mechanism instead of two.

### D-4 — No new destination pages

Where a view-all target exists, link to it. Where none exists, omit the link.

| Card | Destination | Link? |
|---|---|---|
| Upcoming Events | none — no `/events` page exists | **omit** |
| Upcoming Regularizations | rows already link per-employee to `/employees/{id}` (`+page.svelte:636`); the list-level target is `/employees` | **add** `View all employees` — reason below |
| Postings awaiting your approval | `/recruitment` (paginated) | **mandatory** — rows carry inline approve/send-back forms (`+page.svelte:668`, `decideGuard(p.id)`); hiding actionable work with no route out is not acceptable |

*Regularizations note:* `/employees` is not a filtered "upcoming regularizations" view, so the link
label must not promise one. Use `View all employees` — honest about where it goes. This follows the
honest-dead-end-copy standard (do-not-break item 8).

### D-5 — Cap default is 10

Ten for all three dashboard cards, each with a justifying comment at the call site in the house
style modelled on `dashboard/+page.server.ts:119-121`. Recent Activity keeps its documented 25 and is
not touched. Deviations from 10 in this plan, each with its reason:

| Surface | Cap | Reason |
|---|---|---|
| Upcoming Events, Regularizations, Postings | 10 | owner default |
| `employees/[id]` sub-lists | 25 rendered | the 201 file is a reference document, not a summary card; 25 rows is a screen-and-a-bit inside the scroll box, and the panels are already behind tabs |
| `/team`, `/leave/balances` | **no cap** | scroll backstop only — see D-6 and T3 |
| `/performance` stalled sign-offs | **no cap** | render-cap unsafe to pair with a query cap; see the research correction RC-1 |
| Config-scale tables (rank 13) | **no cap** | markup backstop only, per owner ruling 8 |

### D-6 — `/leave/balances` is scroll-only

`/leave/balances` **is** the view-all destination for `/leave` (`leave/+page.svelte:60-70`). A
destination that silently drops rows is worse than an unbounded one. It gets the vertical scroll
backstop and the horizontal backstop, and **no cap**. Query-level pagination — the honest fix — is
explicitly out of scope and stays recorded in the backlog note.

### D-7 — The responsive idiom, one value

Two patterns, no breakpoint variants, chosen against the precedent inventory (research §3):

**Pattern A — `.card-scroll`** (the new class, one place to change):

```
max-h-[min(60vh,28rem)] overflow-y-auto
```

`min(60vh, 28rem)` scales down on a short viewport and stops growing on a tall one. At 390×844 it
resolves to ~506px (60vh); at 1440×900 it resolves to 448px (28rem, the cap). One value, every
screen, **no `sm:`/`lg:` variant needed** — which satisfies owner ruling 7's "only if genuinely
needed". `28rem` sits between the two existing precedents (`max-h-96` = 24rem at
`dashboard/+page.svelte:307`, `max-h-[70vh]` at `performance/templates/[id]/+page.svelte:436`).

**Pattern B — the flex-stretch pattern** for cards that already declare `flex h-full flex-col`
(Upcoming Events at `dashboard/+page.svelte:251`, Announcements at `:334`): apply
`min-h-0 flex-1 overflow-y-auto` to the inner `<ul>`. This is the existing house pattern
(`payroll/CalculatorWindow.svelte:147`) and uses **only existing utilities — no new class**. A card
that stretches to its grid row should scroll to that row's height, not to an arbitrary rem value.

**Hard constraints on both:**
- Never introduce `md:` or `2xl:` — the repo is a two-breakpoint system (sm 112 / lg 55 uses vs md 6
  / 2xl 0, research §4).
- Never reintroduce a min-content floor. `dashboard/+page.svelte:143-146` documents why
  `grid-cols-1` is load-bearing: an implicit `auto` column plus a `truncate`d line pushes the card
  past 390px. Any new wrapper must keep `min-w-0` where the existing markup has it.

### D-8 — Shared mechanism, minimal

Exactly two additions, per owner ruling 6:

1. **`.card-scroll`** — one companion class beside `.card` in `src/app.css` (`.card` is at
   `app.css:234-236`; there is **no** Card/Panel component, research §4).
2. **`Table.svelte` optional `maxHeight`** — a prop that is a **no-op unless passed**. Every existing
   call site must be byte-unaffected in rendered output. Gate G4 proves it.

Everything else in this phase reuses these two plus existing Tailwind utilities.

---

## Research Corrections (found while writing this plan — cite-check outcomes)

The research is accurate on every trap and every line reference I checked. Two claims need
narrowing before execution:

| # | Research claim | Correction | Consequence |
|---|---|---|---|
| **RC-1** | §7 rank 8: *"/performance 4 tables — query take safe (all orderBy desc)"* | **Three of four, not four.** `listReviewCycles` (`performance.ts:26-29`), `listReviewsForEmployee` (`:63-73`) and `listReviewsForReviewer` (`:74-84`) all carry `orderBy`. `listStalledSignoffs` (`performance.ts:824-832`) has **no `orderBy`** and post-processes through `Promise.all` + a filter — the exact T2 shape. | `/performance` gets the **markup backstop only** on all four tables. No service edit. This also keeps the phase's service lift (D-1) to the three functions it names. |
| **RC-2** | §7 rank 3: *"query take safe for History/Documents EXCEPT documents reuse"* | `getEmploymentHistory` (`employees.ts:1307-1322`) reads `auditLog` with `orderBy: { createdAt: 'desc' }`, so a take *would* be order-safe — but the returned events are **derived** by diffing `HISTORY_FIELDS` per log row (`employees.ts:~1355-1370`), and the derivation drops rows that produced no field change. A `take: N` on logs therefore yields **fewer than N** history events, unpredictably. | `employees/[id]` gets **render caps only**, no service edit. Consistent with the documents trap (T5) on the same page, and keeps the whole 201 file to one mechanism. |

Both corrections **reduce** the service surface. Neither widens scope.

---

## Dependencies

### Consumed from earlier phases

| Phase | Artifact relied on |
|---|---|
| 02 `nav-ia` | The dashboard grid at `dashboard/+page.svelte:147` and the `grid-cols-1` min-content note at `:143-146`. This phase's wrappers sit inside that grid and must not break it. |
| 03 `design-system` | `.card` (`app.css:234-236`) — `.card-scroll` is a companion, not a replacement. `Table.svelte` — the one list primitive, which gets the optional `maxHeight`. `EmptyState` inside `Table.svelte:46-53`, which must keep rendering when `rows.length === 0` regardless of `maxHeight`. |
| 07 `page-splits` | The `paginate()` + `Pagination.svelte` surfaces this phase must leave alone, and the backlog note this phase updates. |
| 09 `login-email-first` | **Branch only.** Phase 9 adds source commits to `feat/uiux-phase-9`. Phase 10 touches **none** of the login files, so no file conflict exists. |

### Branch handling (do this before any edit)

`feat/uiux-phase-10` branches off `feat/uiux-phase-9`. Phase 9 may add commits to that branch before
or during this phase.

1. Confirm the phase-9 tip: `git fetch && git log --oneline -5 origin/feat/uiux-phase-9`
2. Create the branch off the **current** tip: `git switch feat/uiux-phase-9 && git pull && git switch -c feat/uiux-phase-10`
3. If phase 9 lands more commits mid-phase, merge (do not rebase — the branch is pushed and PR #19
   is stacked on #18) the phase-9 tip in before the next section.
4. Record the phase-9 tip SHA in the phase report so a later reader can see what this phase was built on.

**Do not push** without the owner asking (repo rule).

### Hard entry gate

Do not begin Section 1 until:
- `phase-09-login-email-first_PLAN_03-09-26.md` exists on disk **and** either its report is written
  or the owner has confirmed phase 10 may start in parallel.
- `git status` is clean and the branch is `feat/uiux-phase-10`.
- The staleness check (checklist item 3) has been run and any drift recorded in this plan.

---

## Implementation Checklist

Ordered. **Commit per section**, not per phase (repo convention). Run the section's gate before
moving on. The full CI gate set is `pnpm format:check && pnpm lint && pnpm check && pnpm test` — in
that order, because CI runs format first and skips the rest on failure.

### Section 0 — entry checks

1. Confirm the phase-9 tip SHA and create `feat/uiux-phase-10` off it (see Branch handling).
2. Re-verify the six traps (D-2 table) against the current tree. Every line number in this plan was
   checked at `868dd6e`; phases 9 and any drift may have moved them. Record every drift in this plan
   **before** editing code.
3. Re-verify RC-1 and RC-2 (`grep -n "orderBy" src/lib/server/services/performance.ts`;
   read `getEmploymentHistory`'s derivation loop).
4. Append this phase's claim to `phase-blast-radius-registry.md` in this folder (append-only; the
   file exists and already carries phases 5–8).
5. Gate: `git status` clean apart from this plan; no source file edited yet.

### Section 1 — the shared mechanism

6. Add `.card-scroll` to `src/app.css`, immediately after `.card` (`:234-236`), inside the same
   `@layer components` block:
   ```
   .card-scroll { @apply max-h-[min(60vh,28rem)] overflow-y-auto; }
   ```
   With a comment in the house style stating: the value is `min(60vh, 28rem)` so one declaration
   scales from a 390px phone to a wide desktop without a breakpoint variant; `60vh` shrinks the box
   on a short viewport, `28rem` stops it growing on a tall one; it sits between the two existing
   precedents (`max-h-96` at `dashboard/+page.svelte:307` and `max-h-[70vh]` at
   `performance/templates/[id]/+page.svelte:436`).
7. Add an **optional** `maxHeight?: string` prop to `src/lib/components/ui/Table.svelte`
   (`$props()` block, `:13-35`). Default `undefined`.
   - When set, apply it to **both** layout wrappers: the desktop `<div class="hidden overflow-x-auto
     …">` (`:57-59`) and the mobile stacked-card wrapper below it.
   - When unset, the rendered class strings must be **character-identical** to today.
   - Implement as a conditional class append, not a always-present class with a default value —
     a default like `max-h-none` changes the rendered string and breaks G4.
   - The `rows.length === 0` branch (`:45-53`) is untouched: an EmptyState must never scroll.
   - Document the prop in the component's existing header comment: it exists so ~20 unbounded
     tables have one place to change, and it is off by default so the 30-odd existing call sites are
     unaffected.
8. Add `tests/unit/container-bounds-scan.test.ts` with Gate **G4** (Table no-op scan) and Gate
   **G5** (paginated pages untouched). See Verification Evidence for the exact assertions.
9. Run the G4/G5 **RED mutations** and record both: add `maxHeight="10rem"` to one existing Table
   call site → G4 must go red; add a `take:` to one paginated page's load → G5 must go red. Revert
   both.
10. Gate: `pnpm format:check && pnpm lint && pnpm check && pnpm test`.

### Section 2 — D1 Upcoming Events (rank 1)

11. In `src/lib/server/services/dashboard.ts`, add an optional `limit?: number` parameter to
    `listUpcomingEvents` (`:449-453`). Apply it **only** at the return (`:591`):
    `return events.sort(...).slice(0, limit ?? events.length)`.
    Comment must state T1: the roster read at `:471` feeds four derived event kinds (its own comment
    at `:469-470`), so a query `take` would drop whole categories — the bound belongs on the merged
    sorted output.
12. In `src/routes/(app)/dashboard/+page.server.ts:89`, pass `10` with a justifying comment in the
    `:119-121` house style: ten is a fortnight's worth of the events a person acts on, and the card
    shares a grid row — a longer list pushes the column past the one beside it. The full set is
    unreachable by design; there is no `/events` page (D-4).
13. In `src/routes/(app)/dashboard/+page.svelte`, apply Pattern B to the Upcoming Events `<ul>`
    (`:256`): add `min-h-0 flex-1 overflow-y-auto`. The card already declares
    `flex h-full flex-col` at `:251`. Do **not** add `.card-scroll` here — the card stretches to its
    grid row and Pattern A would fight it.
14. Verify the `{:else}` empty branch (`:279-282`) still centres — it uses `flex-1` on a sibling and
    the new `flex-1` on the `<ul>` is inside the `{#if}`, so they never coexist. Confirm by reading,
    then in the browser during P1.
15. **No view-all link** (D-4).
16. Gate: `pnpm format:check && pnpm lint && pnpm check && pnpm test`.

### Section 3 — D2 Upcoming Regularizations (rank 2)

17. In `src/lib/server/services/dashboard.ts`, add `orderBy: { startDate: 'asc' }` to the
    `db.employee.findMany` in `listUpcomingRegularizations` (`:22-37`). Comment must state T2: the
    order was only ever enforced by the post-fetch JS sort at `:53`, so a `take` without this caps the
    wrong rows; `startDate` asc is equivalent to `daysUntil` asc because
    `regularizationDate = startDate + REGULARIZATION_MONTHS` is monotonic (D-3).
18. Add an optional `limit?: number` and apply it as a query `take`. Keep the JS `.sort()` at `:53`
    — it is now redundant, not wrong, and it means the cap does not depend on one mechanism (D-3).
19. In `src/routes/(app)/dashboard/+page.server.ts:102`, pass `10` with a justifying comment: ten
    named people is what HR can act on in one sitting; the card is an advance warning, not the
    register. Rows link per-employee, and the list-level route out is `/employees`.
20. In `+page.svelte`, add `.card-scroll` to the regularizations `<ul>` (`:632`). This card is
    **not** a flex-stretch card (`:608` is `card space-y-3 border-amber-500/30 bg-amber-500/5`), so
    Pattern A applies.
21. Add the view-all link: `<a href="/employees" class="btn-row">View all employees</a>` placed with
    the card's heading cluster (`:609-627`), matching the `.btn-row` header variant at
    `dashboard/+page.svelte:155`. Label is `View all employees`, not "View all regularizations" —
    `/employees` is not a filtered view and the copy must not promise one (D-4).
22. Write the **negative control** in `tests/unit/container-bounds.test.ts` (Gate **G3**) — see
    Verification Evidence. This gate is **mandatory** (owner ruling 2).
23. Run the G3 RED mutation and record it: delete the `orderBy` line → G3 must go red while G2
    (cap count) stays green. A cap test that passes without the ordering is the exact vacuous-green
    shape this repo has been burned by.
24. Gate: `pnpm format:check && pnpm lint && pnpm check && pnpm test`.

### Section 4 — D3 Postings awaiting your approval (rank 4, dashboard)

25. In `src/lib/server/services/recruitment.ts`, add an optional `limit?: number` to
    `listPostingsAwaitingApprover` (`:229-266`). Apply it as a `.slice(0, limit ?? len)` **after**
    the `.filter(...)` at `:248-259` — never as a query `take`. The filter drops postings the actor
    cannot approve and postings they submitted themselves (`:256-258`); a query `take` would cap
    before that and return fewer approvable rows than the cap asks for. The query's
    `orderBy: { updatedAt: 'asc' }` (`:238`) is already oldest-first, which is the right order to
    keep under a cap — the longest-waiting postings stay visible.
26. In `src/routes/(app)/dashboard/+page.server.ts:111-116`, pass `10` with a justifying comment:
    ten is an approval sitting; the rest are reachable at `/recruitment`, which paginates.
27. In `+page.svelte`, add `.card-scroll` to the postings `<ul>` (`:666`). Pattern A — the card at
    `:657` is not flex-stretch.
28. **Mandatory** view-all link: `<a href="/recruitment" class="btn-row">View all postings</a>`
    beside the card heading (`:658-660`). Owner ruling 4 — the rows carry inline approve/send-back
    forms with per-row guards (`:667-668`), so hiding actionable work without a route out is not
    acceptable.
29. Gate: `pnpm format:check && pnpm lint && pnpm check && pnpm test`.

### Section 5 — `/employees/[id]`, the 201 file (rank 3)

Render caps only — **no service edit** (RC-2, T5). Each panel gets a `RENDER_CAP = 25` constant, a
`.slice(0, RENDER_CAP)` in the `{#each}` source, `.card-scroll` (or the Table `maxHeight` where the
panel uses `Table.svelte`), and a one-line "showing first 25 of N" note where the list is truncated.

30. Add a single module-level `const LIST_RENDER_CAP = 25` in the page's `<script>` with a comment:
    the 201 file is a reference document behind tabs, so 25 rows is a screen-and-a-bit inside the
    scroll box; the service is deliberately not capped because the documents array feeds the
    onboarding checklist (`+page.server.ts:161-167`) and the history events are derived, not 1:1
    with rows (RC-2).
31. **Documents** (`+page.svelte:1754`) — render cap + bound. T5: never touch
    `+page.server.ts:141`.
32. **Employment History** (`:1864`, plus the nested `{#each}` at `:1886`) — render cap the outer
    timeline + bound. Leave the nested per-event field list uncapped (it is bounded by
    `HISTORY_FIELDS`).
33. **Loans / Cash Advances / Recurring Earnings / Recurring Deductions**
    (`:1067`, `:1131`, `:1194`, `:1392`) — render cap + bound each.
34. **Leave Balances** (`:854`) and **Benefits** (`:1029`) — bound only, no cap: both are
    config-scale (leave types < 10; enrolments per employee are few).
35. **Emergency contacts** (`:905`) and **onboarding steps** (`:272`) — bound only, no cap.
36. **Do not touch** the supervisor pickers at `:511` and `:1692` (T4). `:510` already carries
    `max-h-48 … overflow-y-auto`.
37. Gate: `pnpm format:check && pnpm lint && pnpm check && pnpm test`.

### Section 6 — `/team` matrix (rank 5)

38. **Markup-level bound only** (T3). Do not touch `team/+page.server.ts:43-50` — the members array
    is consumed at `:69-75` (`employeeId: { in: members.map(m => m.id) }`) and at `:78-84` to build
    `attendanceMap`. Capping members silently changes derived attendance.
39. Wrap the matrix (`+page.svelte:136` × `:145`) in a vertically-scrolling box using `.card-scroll`
    or the equivalent utilities, keeping the header row usable — prefer `sticky top-0` on `<thead>`
    inside the scroll box so the date columns stay readable. If `sticky` fights the existing layout,
    fall back to the plain scroll box and record the compromise; do not redesign the header.
40. Confirm a horizontal backstop exists on the matrix (`overflow-x-auto`); add it if missing.
    **Vertical bound plus horizontal backstop only — no column-axis redesign** (owner ruling 8).
41. Gate: `pnpm format:check && pnpm lint && pnpm check && pnpm test`.

### Section 7 — `/benefits` (rank 6) and `/leave/balances` (rank 7)

42. `/benefits` enrolments (`+page.svelte:265`) — bound. The query
    (`benefits.ts:115-123`, `listAllEnrollments`) carries
    `orderBy: [{ status: 'asc' }, { effectiveDate: 'desc' }]`, so a take *would* be safe — but the
    service lift (D-1) does **not** cover it, so this is a **markup bound only**. Record the residual
    in the backlog-note update (checklist item 55).
43. `/benefits` plans (`:156`) — bound. **Do not touch** the picker at `:209` (T4).
44. `/leave/balances` (`:81` × `:101`) — **scroll backstop only, no cap** (D-6). It is the view-all
    destination for `/leave` and may not lose rows. Vertical bound plus an `overflow-x-auto`
    horizontal backstop; the column count grows with the number of leave types, which is why the
    phase-03 responsive note already names this page (`phase-03-responsive-sweep_NOTE_03-09-26.md:54`).
45. Gate: `pnpm format:check && pnpm lint && pnpm check && pnpm test`.

### Section 8 — `/performance` (rank 8)

46. All four tables (`+page.svelte:45`, `:92`, `:132`, `:171`) get the **markup backstop only** —
    no service edit, per **RC-1**. `listStalledSignoffs` (`performance.ts:824-832`) has no `orderBy`
    and post-processes through `Promise.all` + a filter, so a query cap there is the T2 trap again.
47. Where a table uses `Table.svelte`, pass the new `maxHeight`; where it is hand-rolled, use
    `.card-scroll`. Record which pattern each of the four used, in the phase report.
48. Gate: `pnpm format:check && pnpm lint && pnpm check && pnpm test`.

### Section 9 — `/payroll/[id]` (rank 10) and `/profile` (rank 11)

49. `/payroll/[id]` entries — six `{#each}` blocks, one row per employee per run. Markup backstop on
    each. This page is the widest money table in the app
    (`phase-03-responsive-sweep_NOTE_03-09-26.md:52`); the horizontal scroll wrapper must survive.
50. `/profile` Punches (`:246`) — already windowed to 14 days (`+page.server.ts:14`); **markup
    backstop only**, no cap. Documents (`:285`) and Benefits (`:329`) — markup backstop.
51. Gate: `pnpm format:check && pnpm lint && pnpm check && pnpm test`.

### Section 10 — settings and config-scale tables (ranks 9, 12, 13)

52. `/settings/org` assignment (`:304`) and positions (`:145`) — **markup backstop only**. A query
    cap would break the client-side `filteredEmployees` search (research §7 rank 9): capping the
    source array makes the search unable to find a row that exists.
53. `/settings/roles` users (`:18` load) — markup backstop on the rows. The pills are already capped
    (`PILL_CAP :239-241`); leave that alone.
54. Config-scale tables (rank 13) — **markup backstop only**, per owner ruling 8:
    `/branches`, `/departments`, `/settings/offboarding`, posting-approvers, statutory-rates pending,
    salary-grades, schedules, pay-codes, org-chart. Re-derive the exact list with
    `grep -rn "{#each" src/routes/\(app\)/settings src/routes/\(app\)/branches src/routes/\(app\)/departments`
    at execution time rather than trusting this list verbatim.
55. **Do not touch** `/api/v1/dashboard` (R34) — it is JSON, not a UI target, and its
    `getEmployeeMetrics`/`getManagerMetrics`/`getAdminMetrics` are pinned by
    `tests/unit/dashboard-org-scoping.test.ts`.
56. Gate: `pnpm format:check && pnpm lint && pnpm check && pnpm test`.

### Section 11 — verification, backlog notes, close

57. Write `tests/e2e/container-bounds.spec.ts` — Gates **G6** (per-card `toHaveCount(10)`),
    **G7** (scroll-container assertion), **G8** (390px viewport assertion). See Verification Evidence.
58. **Re-run `tests/e2e/dashboard.spec.ts` explicitly.** Its announcement `li` locator
    (`:45-65`, `:67-71`) is over-specified — the notification feed renders the same title
    (comment at `:60-61`). Safe today, but this phase changes the DOM of three sibling cards. If it
    goes red, **read the failure**; do not re-run blindly (#287).
59. Run **every** RED mutation named in the Verification Evidence table and record each in the phase
    report. A gate whose mutation was not run is a hypothesis, not a gate.
60. Write the backlog note `roster-select-typeahead_NOTE_{date}.md` in
    `process/features/ui-ux-overhaul/backlog/` — the pickers (T4) are unbounded by design and the
    honest fix is a typeahead, not a cap. Name the five picker sites.
61. **Update** `process/features/ui-ux-overhaul/backlog/query-level-pagination-unbounded-lists_NOTE_03-09-26.md`
    to record what phase 10 did and did not absorb: three service functions gained an optional limit
    (D-1); every other container is a render cap or CSS backstop with the query cost unchanged;
    `/leave/balances` is explicitly scroll-only (D-6) and still needs real `skip`/`take` + `count`;
    `/benefits` enrolments would be take-safe but was left to markup because the service lift did not
    cover it.
62. Run the impeccable audit pass on the changed `.svelte` files (standing repo rule: UI work goes
    through impeccable).
63. Run `pnpm test:e2e` at the phase boundary and compare against the pre-phase baseline.
64. Write `phase-10-container-bounds_REPORT_{date}.md` FLAT in this folder, with known gaps, the
    phase-9 tip SHA, the recorded RED mutations, and the owner manual-test list for PROGRAM CLOSE.
65. Commit via `vc-git-manager`. No `Co-Authored-By`. Do not push unless the owner asks.

---

## Acceptance Criteria

| # | Criterion | proven by | strategy |
|---|---|---|---|
| AC1 | Each of the three dashboard cards renders at most 10 rows regardless of how many rows the database holds | G6 (e2e `toHaveCount`), G1 (unit cap assertion) | Fully-Automated |
| AC2 | `listUpcomingRegularizations` returns the **most-overdue-first** rows under a cap — a cap applied without the new `orderBy` returns different rows and fails | G3 negative control | Fully-Automated |
| AC3 | `listUpcomingEvents` is capped on the merged sorted output, so every event kind can still appear under the cap | G2 (unit: a fixture where the roster-derived kinds sort after holidays still yields both kinds under a cap of 10) | Fully-Automated |
| AC4 | `listPostingsAwaitingApprover` caps **after** the approver filter — a cap of 10 with 12 approvable rows behind 5 non-approvable ones returns 10 approvable rows | G1b | Fully-Automated |
| AC5 | Every capped or bounded container scrolls inside its box instead of growing the page: `scrollHeight > clientHeight` with a computed `max-height` | G7 | Fully-Automated (dashboard cards); Agent-Probe elsewhere |
| AC6 | The Postings card links to `/recruitment`; the Regularizations card links to `/employees`; the Upcoming Events card has **no** view-all link | G6 (link presence) + G9 (asserted absence on Upcoming Events) | Fully-Automated |
| AC7 | Every existing `Table.svelte` call site that does not pass `maxHeight` renders a character-identical class string | G4 + its RED mutation | Fully-Automated |
| AC8 | The thirteen paginated pages are unchanged — no cap, no `take`, no new prop | G5 + its RED mutation | Fully-Automated |
| AC9 | `/employees/[id]` documents and `/team` members are **not** query-capped, so the onboarding checklist and the attendance matrix are unaffected | G10 source scan (no `take`/`slice` added to `+page.server.ts:141` or `team/+page.server.ts:43`) | Fully-Automated |
| AC10 | No picker `<select>` gained a cap | G10 | Fully-Automated |
| AC11 | The dashboard renders correctly at 390px — no card pushes past the viewport, the `grid-cols-1` min-content floor is not reintroduced | G8 (machine: 390px viewport, no horizontal overflow on `body`) | Fully-Automated |
| AC12 | `/leave/balances` loses **no** rows — it is a view-all destination, scroll-only | G10 (asserts no cap constant in that page) + P3 | Fully-Automated + Agent-Probe |
| AC13 | `tests/e2e/dashboard.spec.ts` is no worse than the pre-phase baseline | G11 | Fully-Automated |
| AC14 | The full look pass at 390px phone and 1440px desktop is acceptable across every changed surface | **Owner manual list** — recorded for PROGRAM CLOSE | Agent-Probe (owner) |
| AC15 | Full CI gate set green in CI order | G12 | Fully-Automated |

**Residual (named, not a PASS state):** AC14 rests entirely on the owner's look pass. There are no
viewport-matrix Playwright projects in this repo (research §"Infra suggestions"), so anything beyond
the single 390px assertion in G8 is unproven by machine. This is the same residual
`phase-03-responsive-sweep_NOTE_03-09-26.md` already carries; phase 10 **narrows** it for the pages
it touches and does not close it. AC5 outside the dashboard and AC12's visual half stay
**CONDITIONAL** on P2/P3 being recorded row by row in the phase report.

## Phase Completion Rules

`CODE DONE` when checklist items 1–63 are complete and the CI gate set is green.

`✅ VERIFIED` only when **all** of:

1. `pnpm format:check && pnpm lint && pnpm check && pnpm test` green, in that order.
2. `pnpm test:e2e` no worse than the pre-phase baseline, with `tests/e2e/dashboard.spec.ts` read
   (not just re-run) if red.
3. Every RED mutation in the Verification Evidence table run and recorded — G1–G5, G8, G10 at minimum.
4. P1, P2 and P3 recorded with an outcome each.
5. Both backlog notes written/updated (checklist 60, 61).
6. The impeccable audit pass recorded.
7. `phase-10-container-bounds_REPORT_{date}.md` written FLAT in this folder, with the owner manual
   list for PROGRAM CLOSE.
8. This plan's `Validate Contract` section filled by vc-validate-agent.
9. Execution changes committed via `vc-git-manager`, separate from process/plan commits.
10. **User confirmation** — the owner has run the 390px/1440px look pass and confirmed. Per the
    umbrella's per-phase loop the EXECUTE approval gate is not standing-granted for this program, and
    the same rule holds at the exit.

Code-only completion is `CODE DONE`, never `✅ VERIFIED`.

---

## Touchpoints

**Changed — services (3 functions, narrow lift per D-1):**

| File | Function |
|---|---|
| `src/lib/server/services/dashboard.ts` | `listUpcomingEvents`, `listUpcomingRegularizations` |
| `src/lib/server/services/recruitment.ts` | `listPostingsAwaitingApprover` |

**Changed — shared (2 files):**

| File | Change |
|---|---|
| `src/app.css` | new `.card-scroll` companion class beside `.card` |
| `src/lib/components/ui/Table.svelte` | optional `maxHeight?: string`, no-op when unset |

**Changed — routes:**

`src/routes/(app)/dashboard/+page.server.ts`, `dashboard/+page.svelte`,
`employees/[id]/+page.svelte`, `team/+page.svelte`, `benefits/+page.svelte`,
`leave/balances/+page.svelte`, `performance/+page.svelte`, `payroll/[id]/+page.svelte`,
`profile/+page.svelte`, `settings/org/+page.svelte`, `settings/roles/+page.svelte`, and the
config-scale pages re-derived at checklist item 54.

**New test files (3):**
`tests/unit/container-bounds.test.ts`, `tests/unit/container-bounds-scan.test.ts`,
`tests/e2e/container-bounds.spec.ts`.

**Read-only (verify, do not edit):**
`src/lib/server/pagination.ts`, `src/lib/components/ui/Pagination.svelte`,
`src/lib/components/ui/EmptyState.svelte`, `src/lib/server/services/performance.ts`,
`src/lib/server/services/employees.ts`, `src/lib/server/services/documents.ts`,
`src/lib/server/services/benefits.ts`, `src/lib/server/services/leave.ts`,
`src/routes/(app)/team/+page.server.ts`, `src/routes/(app)/employees/[id]/+page.server.ts`,
`tests/e2e/dashboard.spec.ts`, `tests/e2e/pagination.spec.ts`,
`tests/unit/dashboard-org-scoping.test.ts`.

**Out of bounds:** `prisma/schema.prisma`, `src/lib/rbac.ts`, every service function not named in
D-1, the thirteen paginated route loads, every picker `<select>`, `/api/v1/dashboard`,
`dashboard/+page.svelte:50-56` (D8's scoping comment — preserve verbatim), `package.json`.

## Public Contracts

- **Three service signatures gain one optional trailing parameter each.** `limit?: number`,
  defaulting to no cap. Every existing caller is unaffected — including `/api/v1/dashboard`, which
  does not call these three but which the same file serves.
- **`Table.svelte` gains one optional prop.** `maxHeight?: string`, default `undefined`. When unset
  the rendered output is byte-identical; G4 proves it. If the prop's presence changes any existing
  call site's DOM, that is a **failure**, not a tradeoff.
- **`.card-scroll` is additive.** `.card` itself is not modified. A `.card` with no `.card-scroll`
  behaves exactly as before.
- **No route, redirect, URL or capability change.** Nothing becomes reachable or unreachable.
  Two new links point at pages the viewer could already reach — `/recruitment` and `/employees` both
  have their own load guards, and this phase adds no visibility logic of its own. *(Nav visibility
  mirrors the load guard: these are plain anchors inside already-gated cards — the postings card
  renders only when `data.postingsToApprove.length`, the regularizations card only when
  `data.canPost`. Neither link widens reach.)*
- **No server behaviour change beyond the three limits.** No where-clause, no org scoping, no
  ordering semantics change: D-3 proves the new `orderBy` is equivalent to the existing JS sort.

## Blast Radius

- **Files:** ~26 changed (2 service, 2 shared, ~20 route `.svelte`, 1 route `.server.ts`) + 3 new
  test files.
- **Packages:** one — this is a single SvelteKit app.
- **Risk class: MEDIUM-HIGH.** Higher than the pure-presentation phases for three named reasons:
  1. **It edits `src/lib/server/services/**`,** which the umbrella declared a hard stop. The lift is
     narrow and recorded (D-1), but three functions that feed the dashboard now take a limit. A
     wrong limit placement silently returns wrong rows and no test outside this phase would see it.
     Mitigated by G1–G3 and their RED mutations.
  2. **`Table.svelte` is consumed by ~30 call sites.** A default value that changes the rendered
     class string regresses every table in the app at once. Mitigated by G4 and its RED mutation,
     and by the "conditional append, never a default class" instruction in checklist item 7.
  3. **A cap that hides actionable work is a functional regression, not a cosmetic one.** The
     postings card carries approve/send-back forms. Capping it without the `/recruitment` link makes
     approvals unreachable — which is why owner ruling 4 makes that link mandatory.
- **Highest-risk edits:** checklist item 7 (Table prop), item 17 (the `orderBy` that the cap depends
  on), item 25 (cap after filter, not before).
- **Overlap with earlier phases:** `dashboard/+page.svelte` (phases 01, 02, 04),
  `employees/[id]/+page.svelte` (phases 05, 07), `Table.svelte` and `app.css` (phase 03). Record all
  four in the blast-radius registry.

## Verification Evidence

Tier assignments follow `process/context/tests/all-tests.md`. **The controlling fact:** the repo has
no component-interaction harness and no viewport-matrix Playwright projects. Cap counts and ordering
are provable in unit tests against a mocked Prisma client; scroll geometry and one narrow viewport
are provable in Playwright; everything beyond that is the owner's eyes.

**The harness this phase must build.** `tests/unit/dashboard-org-scoping.test.ts:110-130` applies the
`where` clause to its fixtures but **ignores `orderBy` and `take` entirely**. Reusing it as-is would
make every cap assertion vacuous. `tests/unit/container-bounds.test.ts` must extend the same shape
with an `orderBy` comparator and a `take` slice, in that order, and its fixtures must be declared
**out of the expected output order** so a service that forgets `orderBy` returns the wrong rows and
the test goes red.

| Gate / Scenario | Strategy | Proves SPEC criterion | RED mutation (run it) |
|---|---|---|---|
| **G1** `tests/unit/container-bounds.test.ts` — `listUpcomingRegularizations(org, asOf, 10)` against 25 fixture employees returns exactly 10 | Fully-Automated | AC1 | Remove the `take` → 25 returned, test red |
| **G1b** Same file — `listPostingsAwaitingApprover` with 5 non-approvable rows ordered *before* 12 approvable ones, `limit` 10, returns 10 **approvable** rows | Fully-Automated | AC4 | Move the slice before the `.filter(...)` → returns 5 approvable rows, test red |
| **G2** Same file — `listUpcomingEvents(..., 10)` where the fixture makes 12 holidays sort before all roster-derived events; assert the returned 10 contain at least one holiday **and** that a full call (no limit) contains roster-derived kinds, so the slice is proven to be on the merged output | Fully-Automated | AC3 | Move the limit onto the roster `findMany` → the roster-derived kinds vanish, test red |
| **G3** **Negative control, mandatory.** Same file — 25 probationary fixtures declared in an order **opposite** to `startDate` asc. Assert `listUpcomingRegularizations(org, asOf, 10)` returns the 10 **earliest `startDate`** rows. The mock applies `orderBy` then `take`, in that order | Fully-Automated | AC2 | Delete `orderBy: { startDate: 'asc' }` from the service → the mock takes the first 10 in declaration order, which are the wrong rows, test red **while G1 stays green** |
| **G4** `tests/unit/container-bounds-scan.test.ts` — read `Table.svelte`; assert `maxHeight` appears only inside a conditional expression and never as a defaulted value in `$props()`. Then read every `.svelte` file that imports `Table` and assert none passes `maxHeight` except the sites this phase adds (list them explicitly) | Fully-Automated | AC7, AC8 | Add `maxHeight="10rem"` to one un-listed call site → red. Change the prop to `maxHeight = 'none'` in `$props()` → red |
| **G5** Same file — for each of the thirteen paginated route loads, assert the file still calls `paginate(` and contains no new `take:` or `.slice(0,` added by this phase | Fully-Automated | AC8 | Add a `take: 10` to `employees/+page.server.ts` → red |
| **G6** `tests/e2e/container-bounds.spec.ts` — use an org with >10 rows per card; `await expect(page.locator('…upcoming-events li')).toHaveCount(10)` per card, mirroring `tests/e2e/pagination.spec.ts:89`. Also assert the `/recruitment` and `/employees` links are visible | Fully-Automated | AC1, AC6 | Remove one cap at its call site → count goes to N, red |
| **G7** Same spec — for each capped card, `evaluate` the `<ul>` and assert `scrollHeight > clientHeight` **and** `getComputedStyle(el).maxHeight !== 'none'` | Fully-Automated | AC5 | Remove `.card-scroll` from one `<ul>` → `maxHeight === 'none'`, red |
| **G8** Same spec — `page.setViewportSize({ width: 390, height: 844 })` on `/dashboard`, then assert `document.documentElement.scrollWidth <= 390` (no horizontal overflow) and that each capped card's `<ul>` is still scrollable | Fully-Automated | AC11 | Add `whitespace-nowrap` without `min-w-0` to a card body → scrollWidth exceeds 390, red |
| **G9** Same spec — assert the Upcoming Events card contains **no** link whose accessible name matches `/view all/i`. A positive-absence assertion against a **named container**, not a page-wide absence | Fully-Automated | AC6 | Add a view-all link to that card → red |
| **G10** `container-bounds-scan.test.ts` — assert `employees/[id]/+page.server.ts` line for `listEmployeeDocuments` has no `take`/`slice`; `team/+page.server.ts` members `findMany` has no `take`; no `<select>` block in the five picker files gained a `.slice(`; `leave/balances/+page.svelte` contains no render-cap constant | Fully-Automated | AC9, AC10, AC12 | Add `take: 10` to the documents call → red |
| **G11** `pnpm test:e2e tests/e2e/dashboard.spec.ts` explicitly re-run; compare against the pre-phase baseline | Fully-Automated (flaky — read the error, do not re-run blindly, #287) | AC13 | — (baseline comparison, not a mutation gate) |
| **G12** `pnpm format:check && pnpm lint && pnpm check && pnpm test`, in that order | Fully-Automated | AC15 | — |
| **P1** Live walk of the dashboard with an org holding >10 rows per card: each card shows 10, scrolls inside its box, and the two view-all links land on the right page | Agent-Probe | AC1, AC5, AC6 in practice | — |
| **P2** Live walk of `/employees/[id]`, `/team`, `/performance`, `/payroll/[id]`, `/settings/org`: every bounded container scrolls inside its box and the page does not grow | Agent-Probe | AC5 outside the dashboard | — |
| **P3** `/leave/balances` with many leave types: vertical scroll works, horizontal scroll works, **no row is missing** — count the rows against the employee count | Agent-Probe | AC12 | — |
| **R1** Regression: nav resolves for HR_ADMIN / MANAGER / employee | Hybrid — precondition: running app + seeded roles | The umbrella's standing regression rule from phase 02 onward | — |
| **R2** Regression: masked-reveal walk on `employees/[id]` — mask holds, reveal once, audit row written | Hybrid — precondition: running app + DB | Do-not-break item 3; this phase edits that file | — |
| **A1** impeccable audit pass on the changed `.svelte` files | Agent-Probe | Design-quality bar the CI gates cannot express | — |

### Owner manual list (record for PROGRAM CLOSE)

Machine coverage stops at one 390px assertion on one page. These go on the owner's list:

| # | Surface | At 390px | At 1440px |
|---|---|---|---|
| 1 | `/dashboard` | three capped cards fit, nothing pushes past the viewport, scroll boxes usable with a thumb | cards do not look empty at cap 10; the grid row heights still balance |
| 2 | `/employees/[id]` | each capped panel's "showing first 25" note is readable; tabs still switch | 25 rows inside a 28rem box does not look truncated by accident |
| 3 | `/team` | matrix scrolls both ways; sticky header (if kept) does not overlap rows | header stays put on a long roster |
| 4 | `/leave/balances` | both scroll axes work; no row missing | column growth with many leave types still readable |
| 5 | `/payroll/[id]` | the widest money table still scrolls sideways, not clipped | seven numeric columns unaffected by the vertical box |
| 6 | `/performance`, `/benefits`, `/profile`, `/settings/org` | scroll boxes usable | no card looks artificially short |

### What this coverage does NOT prove

- G4/G5/G10 are **source scans**. They prove text is or is not present in a file. They do not prove a
  table renders, a cap applies at runtime, or a scroll box is usable.
- G6/G7 prove counts and geometry on the **dashboard only**. The ~20 other bounded containers rest on
  P2 — agent judgment recorded in a report, not repeatable in CI.
- G8 proves one viewport on one page. It says nothing about 390px on the other nineteen surfaces;
  that is AC14, the owner's list.
- G3's negative control proves the ordering is forwarded **to the mock**. It does not prove Postgres
  orders identically — but the field is a plain `DateTime` column with no collation subtlety, so the
  gap is narrow and named rather than assumed away.
- Nothing here proves query **cost** improved. For every container except the three named in D-1 the
  database still returns every row. That is the recorded backlog residual, restated in checklist 61.
- `pnpm test:e2e` is flaky (#287). A green run does not prove correctness; a red run must be read.

## Test Infra Improvement Notes

- **Gap found at plan time:** `tests/unit/dashboard-org-scoping.test.ts`'s mock client applies `where`
  but **ignores `orderBy` and `take`** (`:110-130`). Any cap test written on that harness as-is is
  vacuous. This phase extends the shape locally in `container-bounds.test.ts`. **Resolution:** promote
  the extended mock (where → orderBy → take → project, in that order) to a shared helper at
  UPDATE-PROCESS so the next service-cap test cannot regress to the vacuous shape. Register
  `prisma-mock-orderby-take-helper_NOTE_{date}.md` in `process/features/ui-ux-overhaul/backlog/`.
- **Gap found at plan time:** no viewport-matrix Playwright projects exist (390 / 768 / 1440). Adding
  them would convert AC14 from an owner look-pass to a machine gate for the whole program, not just
  this phase. **Resolution:** backlog stub, not this phase — it is test infrastructure outside a
  bounding phase's blast radius, and `phase-03-responsive-sweep_NOTE_03-09-26.md` already records the
  same need. Cross-reference the two notes at UPDATE-PROCESS rather than filing a third.
- **Gap found at plan time:** no test anywhere asserts a rendered row count for R1–R33, and no
  existing cap (`take 25`/`5`/`5`) is asserted either (research §6). This phase's G6 is the first row-
  count gate in the repo; the pre-existing caps stay unasserted.
- (Further notes added during EVL.)

## Validate Contract

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

### Concerns

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

### Truth checks demanded by the owner — results

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

### Binding execute-agent instructions

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
2. **Last completed step:** plan written. No code changed. Checklist item 1 not started.
3. **Validate-contract status:** pending — PVL has not run on this phase plan.
4. **Supporting context files loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`,
   `phase-10-container-bounds_RESEARCH_03-09-26.md`,
   `ui-ux-overhaul-umbrella_PLAN_03-09-26.md` (charter `:23`, stable goal `:79`, hard stops `:100`,
   do-not-break `:178`, touchpoints `:636-644`),
   `phase-05-destructive-actions_PLAN_03-09-26.md` (format model),
   `backlog/phase-03-responsive-sweep_NOTE_03-09-26.md`,
   `backlog/query-level-pagination-unbounded-lists_NOTE_03-09-26.md`,
   plus the source files listed under Touchpoints, each read while writing this plan.
5. **Next step for a fresh agent:** confirm the `feat/uiux-phase-9` tip, branch
   `feat/uiux-phase-10` off it, then run checklist items 2–4 (re-verify the six traps and the two
   research corrections against the current tree). Start at **Section 1** — the shared mechanism —
   because every later section depends on `.card-scroll` and the Table prop existing, and because
   G4's RED mutation proves the highest-risk edit in the phase before twenty files consume it.
6. **Primary execute anchor:** this file. Pass exactly this path to EXECUTE — not the umbrella, and
   not a folder.
7. **Supporting phase files** (read-only inputs, never the execute target):
   `ui-ux-overhaul-umbrella_PLAN_03-09-26.md`, `phase-10-container-bounds_RESEARCH_03-09-26.md`,
   `phase-09-login-email-first_PLAN_03-09-26.md` (branch parent only — no file overlap),
   `phase-blast-radius-registry.md` (append this phase's claim before editing), and the two backlog
   notes named above.

---

## OPEN DECISIONS

Two genuine forks the rulings do not cover. Neither blocks starting Section 1.

**OD-1 — `/team` sticky header.** Checklist item 39 prefers `sticky top-0` on the matrix `<thead>`
inside the new scroll box, with a plain scroll box as the fallback. Sticky inside an element that
scrolls both axes can behave unexpectedly with the existing `overflow-x-auto` wrapper, and the team
matrix is do-not-break item 10 ("task-shaped density done right"). **Fork:** ship sticky, or ship the
plain scroll box and leave the header scrolling away. **Recommendation:** attempt sticky; if it
fights the layout in one attempt, take the plain box and record it — do not spend the phase on it.
This is flagged rather than chosen because it touches a do-not-break item.

**OD-2 — the `employees/[id]` truncation note.** Checklist item 30 adds "showing first 25 of N" where
a panel is render-capped. That copy needs `N`, which the page already has (`array.length`). **Fork:**
show the note on every capped panel (honest, but six extra lines of chrome on one page), or show it
only when `N > 25` (quieter, but the reader cannot tell a full list from a capped one at a glance).
**Recommendation:** show only when `N > 25` — a note on an uncapped list is noise. Flagged because it
is a copy/density judgment on a page phase 07 already worked hard to shorten, and the owner may
prefer the always-on form.
