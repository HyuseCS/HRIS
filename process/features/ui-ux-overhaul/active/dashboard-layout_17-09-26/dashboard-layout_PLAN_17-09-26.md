---
name: plan:dashboard-layout
description: "Bound the two unbounded dashboard alert cards and regroup the dashboard into four priority-ordered zones (decision → glance → feed → doors) with per-zone derived grid column counts, plus Playwright height/role/no-orphan coverage."
date: 17-09-26
feature: ui-ux-overhaul
---

# Dashboard layout — PLAN (17-09-26)

**TL;DR** — Four sections, four commits, one source file (`src/routes/(app)/dashboard/+page.svelte`)
plus one new e2e spec. S1 gives the two alert cards a min/max height and a scrolling list body
(the owner's literal ask). S2 reorders the page into NEEDS A DECISION → AT A GLANCE → FEED → DOORS
and derives each zone's column count from the cards that role actually sees, so no row ends with an
orphan. S3 adds Playwright coverage for the bounds, the role×zone matrix and the no-orphan rule.
S4 is the owner's live probe checklist. **No server load, query or data shape changes.**

- **Date**: 17-09-26
- **Status**: VERIFIED (18-09-26) — S4 closed by owner acceptance; S2's zone-1 layout is
  superseded by same-day follow-ups, see `dashboard-layout_FOLLOWUPS_18-09-26.md`
- **Complexity**: SIMPLE (4 sections, 4 commits, 2 files)
- **Feature**: ui-ux-overhaul
- **Upstream**: `dashboard-layout_RESEARCH_17-09-26.md`, `dashboard-layout_INNOVATE_17-09-26.md` (option **O2**),
  `dashboard-layout_INNOVATE-SUPPLEMENT_18-09-26.md`, `screens/README.md`
- **Branch**: `feat/uiux-phase-6`

## Context Envelope

| Field | Value |
|---|---|
| feature | ui-ux-overhaul |
| phase | PLAN |
| session-goal | Bound the two alert cards and regroup the dashboard into priority zones |
| branch | feat/uiux-phase-6 |
| worktree | main |
| context-group | uxui, tests |
| blast-radius-packages | `src/routes/(app)/dashboard/`, `tests/e2e/` |
| active-plan | this file |
| test-runner | vitest \| playwright |
| validate-contract | pending |

---

## Goal

Make the dashboard readable for the roles that see everything (HR_ADMIN / CEO / SUPER_ADMIN) by
(a) capping the two unbounded alert cards and (b) putting decisions first, without changing what any
role can see or do.

## Scope

**In scope:** `src/routes/(app)/dashboard/+page.svelte` (template + one `cols()` helper in the
existing `<script>`), one new `tests/e2e/dashboard-layout.spec.ts`.

**Out of scope (binding):** `+page.server.ts`, every service under `src/lib/server/services/`,
`src/lib/rbac.ts`, `src/app.css`, `Container.svelte` (recipe copied inline, component not adopted),
the O1 right-rail and O3 tabbed action-queue ideas (backlog if the owner wants more later), the
ungated `Onboard Employee` quick action (a gating question, not a layout one), and a "view all" /
count link on either alert card — `/employees` has no `employmentType` filter (only `search`,
`department`, `branch`, `status=offboarded`) and `+page.server.ts` is out of scope, so the link would
be new server scope. Backlog note at UPDATE-PROCESS.

## Hard contracts (must still hold after every section)

| Contract | Proof |
|---|---|
| `h1` text is exactly `Dashboard` | `tests/e2e/helpers.ts:56` — gates the whole e2e suite |
| `Active Employees` / `Pending Approvals` / `Last Payroll` stay `<a>` whose accessible name contains the label | `dashboard.spec.ts:9-22` — the only anchor contract. `admin.spec.ts:70-71` is `getByText`: it proves the labels are visible, not that they are links |
| Postings rows stay `<li>` containing a button named exactly `Approve` | `posting-approver-sod.spec.ts:60-64` |
| Announcement items stay `<li>` | `dashboard.spec.ts:62-64` |
| Post buttons named exactly `Post` and `Post announcement` | `dashboard.spec.ts:52,58` |
| EMPLOYEE sees no `New Timesheet` link/button | `employee-view-only.spec.ts:102-103` |
| No text matching `/^\d+ awaiting you$/` is introduced | `multi-role-sod.spec.ts:72` — `getByText`, not a heading, and it runs on `/requests/approvals`. The collision risk is wording, not a dashboard assertion |

**Owner rules binding on EXECUTE:** no new explanatory comments. The dashboard file is
comment-heavy and S2 moves the markup those comments explain — `:142-149`, `:253-255`, `:286-287`,
`:297-300`, `:308-311`, `:659-661`, `:721-723`, `:744-746`. Three of them describe the layout S2
deletes and are **amended**; every other one moves **verbatim**. The ledger at S2 2e is binding and
exhaustive — nothing outside it changes. Surgical diffs. Svelte 5 runes. Tailwind v3 HSL tokens, both themes. No new
deps. `{@const}` only as a direct child of a block tag. Ponytail: one small `cols()` helper, not a
component library. Never edit `.env`. Commit per section as its gates go green. No AI attribution.

---

## Open Decisions (defaults applied — owner may flip any before EXECUTE)

| # | Decision | **Default taken** | Flip cost |
|---|---|---|---|
| D1 | `Pending Approvals` tile vs `Awaiting you` card (they overlap) | **Keep BOTH.** The tile is an e2e-asserted anchor (`dashboard.spec.ts:9-22`, `admin.spec.ts:70-71`); the `Awaiting you` card stays in the decision zone. Retiring the tile is a separate decision with its own test edit. | Flipping = delete the tile + edit 2 specs + re-derive the glance zone count (2 instead of 3). ~30 min. |
| D2 | A lone decision-zone card's width | **Full width** (today's behaviour — `cols(1)` → `lg:grid-cols-1`). | Flipping to a capped width = add `lg:max-w-2xl` on the zone grid when count is 1. ~5 min. |
| D3 | Zone ordering rule | **decision → glance → doors for every role, no role-specific pinning.** EMPLOYEE simply has an empty decision zone, so glance is already first for them with no special case. | Flipping to role-pinned order = a `$derived` zone order array + a role-matrix test per role. ~1 h and it makes S3(b) harder. |

*S2 note (not owner-flagged, stated for the record):* `Attendance Today` stays a **full-width card at
the top of the AT A GLANCE zone** rather than joining the tile grid — it is a 4-stat panel, not a
one-number tile, and putting it in the tile grid would make the tile row 3–4 cells of unequal
weight. The tile grid below it carries 2 cards (EMPLOYEE) or 3 (everyone else).

---

## Touchpoints

| File | Sections | What changes |
|---|---|---|
| `src/routes/(app)/dashboard/+page.svelte` | S1, S2 | Card shell classes; zone regrouping; one `cols()` helper + 4 `$derived` counts |
| `tests/e2e/dashboard-layout.spec.ts` | S3 | New file |

## Public Contracts

None change. No exported function, route, load-data shape, form action, URL or accessible name is
added, removed or renamed. The only externally observable changes are CSS geometry and DOM order
within `<div class="flex flex-1 flex-col gap-6">` (`+page.svelte:139`).

## Blast Radius

| Dimension | Value |
|---|---|
| Files changed | 2 (1 edited, 1 new) |
| Packages | 1 (SvelteKit app) |
| Risk class | **presentation-only** — no auth, billing, schema, migration, public API or secrets surface |
| Roles affected | all 6 (EMPLOYEE, MANAGER, HR_ADMIN, PAYROLL_OFFICER, CEO, SUPER_ADMIN) — visually only |
| Rollback | `git revert` of the section commit; no data or schema state to unwind |

---

## S1 — Bound the two alert cards

**Files:** `src/routes/(app)/dashboard/+page.svelte` — Upcoming Regularizations card `:605-606`,
its `<ul>` `:630`; Postings card `:654-655`, its `<ul>` `:664`.

**Exact class changes:**

| Anchor | Remove | Add |
|---|---|---|
| `:606` card div | `card space-y-3 border-amber-500/30 bg-amber-500/5` | `card flex max-h-80 min-h-[7rem] flex-col gap-3 overflow-hidden border-amber-500/30 bg-amber-500/5` |
| `:630` `<ul>` | `divide-y divide-border/60` | `min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto` |
| `:655` card div | `card space-y-3 border-blue-500/30 bg-blue-500/5` | `card flex max-h-80 min-h-[7rem] flex-col gap-3 overflow-hidden border-blue-500/30 bg-blue-500/5` |
| `:664` `<ul>` | `divide-y divide-border/60` | `min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto` |

`space-y-3` → `gap-3` is required, not cosmetic: `space-y-*` sets margins that fight `flex-1` on the
scroll body. `min-h-0 flex-1 overflow-y-auto` inside an `overflow-hidden` shell is the
`Container.svelte` recipe, copied inline (S1 does **not** adopt the component — that would change
the card's border/background tone and break the amber/blue coding).

The postings card's `Banner` (`:659-661`) and both cards' heading/description blocks stay as
fixed-height flex children above the scroll body. `max-h-80` = 20rem, `min-h-[7rem]` = 7rem.

At real volume the rows are visually near-identical (the dev DB's 255 residue rows all read "QA
Engineer · Human Resources", "Overdue by 15 days", same date), so an "8+ rows" check proves the card
is **bounded**, not that the capped list is a legible decision tool. Legibility at volume is the
backlog "view all" question (Scope), not an S1 acceptance criterion.

**Acceptance check** (dev server already running, owner's):
```
CI=1 pnpm exec dotenv -e .env.dev -- playwright test dashboard.spec.ts posting-approver-sod.spec.ts
```
Expected: same pass count as the pre-change baseline (capture the baseline first — see Risks R3).

**Gates:** `pnpm format:check` → `pnpm lint` → `pnpm exec svelte-check --tsconfig ./tsconfig.json`
→ `pnpm test` → the e2e command above. `svelte-check` is the **default** type gate for this plan, not
a fallback: `pnpm check` runs `svelte-kit sync` and **will stop the owner's dev server**. `pnpm check`
is the CI form only, and only on a tree with no live dev server.

**Commit:** `fix(dashboard): bound the regularizations and postings cards and scroll their rows`

**Rollback:** revert the commit; the four class strings are self-contained.

---

## S2 — Zone reorder, derived columns, inner caps

**Files:** `src/routes/(app)/dashboard/+page.svelte` — `<script>` (helper + counts), and the whole
template body between `:150` and `:746`.

**2a. Helper (in the existing `<script>`, after the `awaiting` derivation at `:56-73`):**
```
const cols = (n: number) =>
  n >= 4 ? 'lg:grid-cols-4' : n === 3 ? 'lg:grid-cols-3' : n === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-1'
```
The four class names must appear as **literal strings** so Tailwind's JIT scanner emits them — do
not build them by interpolation (`lg:grid-cols-${n}` produces no CSS).

**2b. Zone counts (`$derived`):**

| Zone | Count expression | Range |
|---|---|---|
| decision | `[data.canPost && data.regularizations.length, data.postingsToApprove.length, metrics.pendingApprovals > 0].filter(Boolean).length` | 0–3 |
| glance tiles | `data.canViewPayroll ? 3 : 2` | 2–3 |
| feed | `[data.recentActivity.length, true, !!status, true].filter(Boolean).length` (Announcements and Upcoming Events always render) | 2–4 |
| doors | `data.canCreateTimesheet ? 3 : 2` | 2–3 |

**Feed no-orphan rule:** a 4-card feed uses **2×2**, not 3+1 — call `cols(feedCount === 4 ? 2 : feedCount)`.
Every other zone calls `cols(count)` directly.

**2c. Zone markup.** Each zone is `<section class="space-y-3">` containing an eyebrow heading then a
grid. Eyebrow (**visible**, matching the existing card label style at `:156`, `:258`, `:306`):
```
<h2 class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">NEEDS A DECISION</h2>
```
Wrap each zone in `{#if zoneCount}` so a zero-card zone renders neither heading nor grid. Zone grid:
`class="grid grid-cols-1 gap-4 {cols(n)}"` plus `data-zone="decision" | "glance" | "feed" | "doors"`.
`grid-cols-1` is load-bearing at narrow widths (see the ledger entry for `:142-149` at 2e).

`data-zone` is the **only** DOM addition in this plan. S3(c) needs a stable handle on the four zone
grids and a bare `.grid` selector would also match the attendance stat grid (`:161`) and the
award-form grid (`:372`). AT A GLANCE carries it on the **tile grid**, not on the Attendance card.

Order and contents (D3):

| Zone | Heading | Cards, in order |
|---|---|---|
| 1 | `NEEDS A DECISION` | Upcoming Regularizations (`:605`), Postings awaiting your approval (`:654`), Awaiting you (`:724`) |
| 2 | `AT A GLANCE` | Attendance Today (`:153`, full-width above the tile grid), then tile grid: Active Employees (`:192`), Pending Approvals (`:202`), Last Payroll (`:222`) |
| 3 | `FEED` | Recent Activity (`:303`), Announcements (`:339`), My Status (`:458`), Upcoming Events (`:256`) |
| 4 | `DOORS` | Onboard (`:748`), New Timesheet (`:778`), File Leave (`:808`) |

The DOORS grid keeps `mt-auto` (carry the comment at `:744-746` verbatim) **and keeps
`sm:grid-cols-2`**; only the hard-coded `lg:grid-cols-3` is swapped for `{cols(doorCount)}`.

**Heading levels (P11).** The Awaiting-you card's own `<h2>` (`:726`) becomes an `<h3>`. It now sits
under a zone `<h2>`, and two nested `h2`s break the page outline. Nothing asserts its level —
`multi-role-sod.spec.ts:72` matches text, on another page.

**2d. Inner list caps** (the cards keep their existing `flex h-full flex-col`; only the list is
capped):

| Anchor | Remove | Add |
|---|---|---|
| Upcoming Events `<ul>` `:261` | `divide-y divide-border/40` | `max-h-80 divide-y divide-border/40 overflow-y-auto` |
| Announcements `<ul>` `:424` | `divide-y` | `max-h-80 divide-y overflow-y-auto` |
| My Status leave list `:524` | `space-y-1.5 border-t border-border/60 pt-3` | `max-h-80 space-y-1.5 overflow-y-auto border-t border-border/60 pt-3` |

Recent Activity keeps its existing `max-h-96` (`:312`) — unchanged, it is already correct.

**2e. Comment ledger (R1) — binding and exhaustive.** Three comments describe the layout S2
deletes. Those three are **amended**. Every other comment in the file moves **verbatim**. Nothing
outside this table changes.

| Anchor | Disposition |
|---|---|
| `:142-149` | **Amend.** Its first paragraph describes the two-thirds / right-third grid S2 removes; its `grid-cols-1` paragraph is still true and survives word for word. Move it above the first zone section |
| `:286-287` | **Amend.** "The card spans two rows" stops being true once Upcoming Events joins the FEED zone |
| `:297-300` | **Amend.** The feed row is four cards at 2x2 now, not three in one row |
| `:253-255` | Carry verbatim — moves with the Upcoming Events card into FEED |
| `:308-311` | Carry verbatim — moves with Recent Activity into FEED |
| `:659-661` | Carry verbatim — moves with the postings card into NEEDS A DECISION |
| `:721-723` | Carry verbatim — moves with the Awaiting-you card into NEEDS A DECISION |
| `:744-746` | Carry verbatim — stays with the DOORS grid and its `mt-auto` |
| every comment in `<script>` and inside a card body | Carry verbatim — S2 does not open them |

Replacement text for `:142-149`:

```
<!-- Zones in priority order: what needs a decision, then the numbers, then the feed, then the
     doors. Each zone's lg column count is derived from the cards that role actually sees, so no
     row ends with a lone stretched card.

     `grid-cols-1` is load-bearing, not decoration: without an explicit template the single
     column is sized `auto`, so a `truncate`d line (whitespace-nowrap) sets a min-content
     floor and the whole card pushes past a 390px viewport. Tailwind's numbered variants
     emit `minmax(0, 1fr)`, which lets the column shrink and the text ellipsize as intended. -->
```

Replacement text for `:286-287`:

```
<!-- An empty card beside full siblings is a void. A centred empty state fills it deliberately
     instead of leaving a lone sentence at the top. -->
```

Replacement text for `:297-300`:

```
<!-- Recent activity, announcements, personal status and upcoming events are each a glance, not a
     task, so they read side by side. Four cards go 2x2 rather than 3+1, and the row simply
     carries fewer when a viewer has no activity yet or no employee record. -->
```

**Acceptance check:**
```
CI=1 pnpm exec dotenv -e .env.dev -- playwright test dashboard.spec.ts admin.spec.ts employee-view-only.spec.ts posting-approver-sod.spec.ts multi-role-sod.spec.ts
```
Expected: all pass — this is the full set of specs coupled to dashboard DOM (RESEARCH §6).

**Gates:** same five, same order, same `svelte-check` substitution.

**Commit:** `refactor(dashboard): group the cards into decision, glance, feed and door zones`

**Rollback:** revert the commit. S1's bounds survive independently (different class strings, no
shared code), so a S2 revert does not reopen the owner's original complaint.

---

## S3 — Playwright coverage

**File:** new `tests/e2e/dashboard-layout.spec.ts`. Imports `{ login, USERS }` from `./helpers`.

**(a) Height + scroll bounds.** **One** fixture, built through the real UI (a **fresh seed** has
**no** `PROBATIONARY` employee and no pending posting, so neither card renders under a bare seed).
**Correction (18-09-26 supplement):** that is true of a fresh seed and **false of this dev DB**, which
carries e2e residue — 255 `PROBATIONARY` `Testcase …` employees and 27 `PENDING_APPROVAL`
`E2E-F4-self-…` postings, so both cards already render. The test logic is unchanged: it asserts
computed style, not row count, and the fixture still guarantees at least one row on a clean DB.

- Regularizations: as `USERS.admin`, `/employees/new` → create `E2E-LAYOUT-probie-${Date.now()}`
  with `employmentType` `PROBATIONARY` (the form default) and a `startDate` ~6 months ago minus a
  week (the service is `startDate + 6mo ≤ today + 21d`, `src/lib/server/services/dashboard.ts:15-40`).
- Postings: **no fixture.** The card is driven by whatever `listPostingsAwaitingApprover` already
  returns for the account under test; 27 residue postings reach HR under the fallback mapping today.
  Do **not** reuse `mapApprover()` from `tests/e2e/posting-approver-sod.spec.ts:24-58`: it rewrites
  the `Software Developers` mapping that spec owns and restores (`:182-187`),
  `playwright.config.ts:20` is `fullyParallel: true`, and only `CI=1` forces `workers: 1` (`:23`) —
  a non-CI run races it. **Assert the card is present before measuring it**; a missing precondition
  is `BLOCKED`, never a silent pass.

Locators (no shared "is bounded / scrollable" helper exists — S3 hand-rolls them, see Test Infra
Improvement Notes):
- card: `page.locator('div.card', { hasText: 'Upcoming Regularizations' })`, and the same shape with
  `'Postings awaiting your approval'`
- list: that card's own `ul`

Assertions per card (`locator.evaluate` on the card element — this is the suite's **first**
computed-style assertion; `grep getComputedStyle tests/e2e/` returns nothing today):
- `getComputedStyle(card).maxHeight === '320px'` and `minHeight === '112px'`
- `getComputedStyle(list).overflowY === 'auto'`
- `card.getBoundingClientRect().height <= 320.5`

Restore, in `test.afterAll`: import `PrismaClient` directly and set the fixture employee's
`employmentStatus` to `OFFBOARDED` — the pattern `tests/e2e/dashboard.spec.ts:35-43` already uses.
The service filters `employmentStatus: 'ACTIVE'`
(`src/lib/server/services/dashboard.ts:26`), so the flip removes the row. There is no department
mapping to clear and no posting to delete, because this spec creates neither. (The SOD spec's own
restore discipline leaves its postings as permanent residue — `posting-approver-sod.spec.ts:206-211`
— so it is not the model to copy for cleanup.)

**(b) Role × zone visibility.** `for (const [role, expect] of …)` over `USERS.employee`,
`USERS.hr`, `USERS.admin`, `USERS.ceo` (there is no dedicated payroll-officer account in
`tests/e2e/helpers.ts:3-21` — PAYROLL_OFFICER is covered by the owner's live probe in S4 instead;
see the Test Infra note). Per role assert eyebrow visibility (`getByRole('heading', { name: 'AT A
GLANCE' })` etc.) and the D1/D3 invariants: EMPLOYEE sees no `NEEDS A DECISION` heading and no
`Last Payroll` link; HR/CEO see all four headings.

`employee@veent.ph` is wiped on **every** `playwright test` invocation
(`tests/e2e/global-setup.ts:78-95`), so that account's Recent Activity card may or may not render and
its FEED zone is 3 **or** 4 cards depending on run order. Assert headings and the D1/D3 invariants
only — never a fixed card count.

**(c) No-orphan at `lg`.** At `page.setViewportSize({ width: 1440, height: 1000 })`, for each
`[data-zone]` grid:
```
const tracks = getComputedStyle(grid).gridTemplateColumns.split(' ').length
expect(grid.children.length % tracks).toBe(0)
```
Run for `USERS.employee` and `USERS.admin` (the two extreme card counts). **This is an `lg`-only
rule and A4 is scoped to match.** `sm:grid-cols-2` survives on the tile grid (`:190`) and the doors
grid (`:747`), so a 3-card zone still renders 2+1 between 640px and 1023px. That band is
deliberately unasserted and is named in Open Gaps rather than left implied.

**Acceptance check:**
```
CI=1 pnpm exec dotenv -e .env.dev -- playwright test dashboard-layout.spec.ts
```
Expected: all new tests pass. **Negative control (required):** before accepting, temporarily revert
S1's `max-h-80` on the regularizations card and confirm test (a) goes red; restore. A bound test that
cannot fail is not a bound test.

**Gates:** `pnpm format:check`, `pnpm lint`, `pnpm exec svelte-check --tsconfig ./tsconfig.json`,
`pnpm test`, then the command above, then one full `pnpm test:e2e` sweep before the final commit.

**Commit:** `test(dashboard): assert the alert-card bounds, the role zones and the no-orphan grids`

**Rollback:** delete the spec file.

---

## S4 — Owner live probe checklist

Not a code change — the checklist the owner (or a driven browser run) walks after S3 is green.
Log in via the real login form or `POST /api/v1/_dev/login-as`.

| # | Role | Width | Theme | Check |
|---|---|---|---|---|
| 1 | HR_ADMIN | 1440 | light | Four zone headings in order; no row ends with a lone stretched card |
| 2 | HR_ADMIN | 1440 | both | Post-S2 the decision zone is **3-up** for this role — amber regularizations, blue postings and the plain Awaiting-you card share one row for the first time (all three conditions hold in this dev DB: 255 regularizations, 27 postings, 15 pending). Check all three together, in that row, in **each** theme: borders/fills still readable against `bg-card`, amber and blue still distinguishable side by side |
| 3 | HR_ADMIN | 1440 | both | Regularizations with **1** row: card is ~112px, does not look broken next to its siblings |
| 4 | HR_ADMIN | 1440 | both | Regularizations with **8+** rows: card stops at 320px, list scrolls, heading stays put |
| 5 | HR_ADMIN | 1440 | both | Postings with **8+** rows, one "Send back" note expanded: card still 320px, the note grows inside the scroll body |
| 6 | HR_ADMIN | 390 | both | Every zone is a single column; nothing overflows horizontally |
| 7 | CEO | 1440 / 390 | both | Same as 1 and 6 |
| 8 | SUPER_ADMIN | 1440 / 390 | both | Same as 1 and 6 |
| 9 | EMPLOYEE | 1440 | both | No `NEEDS A DECISION` zone; glance tiles are a clean 2-up; doors are a clean 2-up |
| 10 | EMPLOYEE | 390 | both | Single column, no orphan, no horizontal scroll |
| 11 | PAYROLL_OFFICER | 1440 | both | Sees `Last Payroll` (3 glance tiles) but **no** regularizations card and **no** `New Timesheet` door (2 doors). `Awaiting you` is **absent** unless something is pending for `payroll@veent.ph`: `pendingApprovals` is 0 in this dev DB (`screens/payroll_officer_light_1440_top.png`) and the card only renders above zero (`+page.svelte:724`), so the NEEDS A DECISION zone is expected to be **empty**. To check the card, file a request against that account first — do not read its absence as a regression |
| 12 | HR_ADMIN | 1440 | both | Walk the Regularizations card against the **existing 255-row residue** in this dev DB (no fixture needed — the worst case is already on screen): card stays 320px, the scrollbar is present, the heading stays fixed |
| 13 | HR_ADMIN | 1440 | both | Legibility of the 3-up decision row: each card is roughly a third of the content width (~370px at 1440 with the sidebar). Confirm a regularization row — name, `jobTitle · department`, date, "Overdue by N days" (`+page.svelte:632-646`) — still reads without truncating into nonsense. If it does not, the follow-up is D2's capped-width flip or a 2-up decision rule, not a code fix inside this plan |

Record findings in `dashboard-layout_REPORT_17-09-26.md` in this task folder.

---

## Acceptance Criteria

| # | Criterion | proven by | strategy |
|---|---|---|---|
| A1 | The Upcoming Regularizations card never exceeds 320px tall and never falls below 112px; its row list scrolls | `dashboard-layout.spec.ts` (a) regularizations bounds + negative control | Fully-Automated |
| A2 | The Postings-awaiting-approval card has the same bounds and scrolling list, including with a Send-back note expanded | `dashboard-layout.spec.ts` (a) postings bounds; S4 probe row 5 | Fully-Automated (+ Hybrid for the expanded note) |
| A3 | The page renders four zones in the order decision → glance → feed → doors, and a zero-card zone renders nothing | `dashboard-layout.spec.ts` (b) zone heading order/visibility | Fully-Automated |
| A4 | No zone grid row ends with an orphan card **at `lg` and above** for any role. The 640–1023px band keeps `sm:grid-cols-2` and is out of scope | `dashboard-layout.spec.ts` (c) no-orphan track check at 1440 | Fully-Automated |
| A5 | Every hard contract (h1 text, tile anchors, `<li>`+`Approve`, announcement `<li>`, Post buttons, EMPLOYEE no New Timesheet) still holds | `dashboard.spec.ts`, `admin.spec.ts`, `posting-approver-sod.spec.ts`, `employee-view-only.spec.ts`, `multi-role-sod.spec.ts` | Fully-Automated |
| A6 | No role gains or loses a visible card | `dashboard-layout.spec.ts` (b) role matrix; S4 probe row 11 for PAYROLL_OFFICER | Fully-Automated (+ Agent-Probe for PAYROLL_OFFICER) |
| A7 | Both themes read correctly at 1440 and 390 px for HR_ADMIN, CEO, SUPER_ADMIN and EMPLOYEE | S4 probe rows 1–10 | Agent-Probe |
| A8 | No server load, query or data shape changed | `git diff --stat` shows only `+page.svelte` and the new spec; `pnpm test` green | Fully-Automated |

## Phase Completion Rules

- A section is `CODE DONE` when its edits are in and its own gates are green; it is not `VERIFIED`.
- A section reaches `VERIFIED` only when its Verification Evidence rows are green **and** the full
  `pnpm test:e2e` sweep matches the step-1 baseline.
- The plan as a whole reaches `VERIFIED` only after S4's owner probe is walked and recorded in
  `dashboard-layout_REPORT_17-09-26.md`. Automated green alone is `CODE DONE`.

**VERIFIED 18-09-26.** S4 closed by owner acceptance, recorded in the REPORT. Note for anyone
reading S2 below: the zone-1 (`NEEDS A DECISION`) layout it describes was superseded the same
day by follow-up commits that moved those three cards into title-row icon buttons with
dropdown panels. S2's text below is left as written — it is the record of what shipped first
and why — see `dashboard-layout_FOLLOWUPS_18-09-26.md` for what replaced it.
- A red gate is never waived: fix in place if in blast radius, otherwise write a backlog note in
  `process/features/ui-ux-overhaul/backlog/` and keep the section CONDITIONAL.
- Commit per section as its gates go green — do not batch.

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `dashboard-layout.spec.ts` (a) — computed `max-height`/`min-height`/`overflow-y` on both alert cards | Fully-Automated | The two named cards are bounded and scroll (owner's literal ask, S1) |
| Negative control — revert `max-h-80`, test (a) goes red | Fully-Automated | The bound gate can actually fail |
| `dashboard-layout.spec.ts` (b) — role × zone heading and link visibility | Fully-Automated | The reorder changed no role's visible surface (S2, D3) |
| `dashboard-layout.spec.ts` (c) — `children % gridTemplateColumns tracks === 0` at 1440 | Fully-Automated | No zone row ends with an orphan card (S2) |
| `dashboard.spec.ts`, `admin.spec.ts`, `posting-approver-sod.spec.ts`, `employee-view-only.spec.ts`, `multi-role-sod.spec.ts` | Fully-Automated | Every hard contract in the table above still holds |
| `pnpm test` (1737 unit tests) | Fully-Automated | No data-shape or service regression (should be untouched) |
| S4 rows 3–5 — 1 row vs 8+ rows, expanded send-back note | Hybrid | The bounds look right, not just measure right, at real content volumes |
| S4 rows 2, 6–11 — dark theme, 390px, PAYROLL_OFFICER | Agent-Probe | Both themes and the role the e2e fixtures cannot reach read correctly |

## Test Infra Improvement Notes

- No `payrollOfficer` account exists in `tests/e2e/helpers.ts:3-21`, so PAYROLL_OFFICER — the one
  role with a distinct zone shape (payroll tile yes, regularizations no, timesheet door no) — can
  only be proven by probe. Adding a seeded account would move S3(b) row 11 from Agent-Probe to
  Fully-Automated. **Backlog stub to write at UPDATE-PROCESS:**
  `process/features/ui-ux-overhaul/backlog/e2e-no-payroll-officer-account_NOTE_17-09-26.md`.
- Nothing in this repo can mount a Svelte component (`vitest.config.ts` is `environment: 'node'`),
  so every layout claim costs a Playwright run. Already tracked in
  `backlog/component-test-dom-environment_NOTE_03-09-26.md`.
- The notification toast stack overlaps the Upcoming Events card top-right for PAYROLL_OFFICER
  (`screens/payroll_officer_light_1440_top.png`, five stacked `e2e byline … · New` toasts). It is a
  separate notification component, not a Touchpoint of this plan, so it is out of scope here.
  **Backlog stub to write at UPDATE-PROCESS:**
  `process/features/ui-ux-overhaul/backlog/toast-stack-overlaps-upcoming-events_NOTE_18-09-26.md`.
- No shared helper asserts "element is bounded / scrollable". S3 hand-rolls it; if a third surface
  ever needs it, extract it to `tests/e2e/helpers.ts` then — not now (ponytail).

## Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | Moving markup between zones silently drops a layout-intent comment, **or** carries one across verbatim after S2 has made it false | **High** — the known failure mode (`no-comments-brief-drops-contracts`), now with a second face | The S2 2e ledger is binding: three comments are amended, every other one moves verbatim, nothing else changes. Before each section commit run `git diff -U0 -- 'src/routes/(app)/dashboard/+page.svelte' \| grep '^-.*<!--'` and reconcile every hit against the ledger |
| R2 | `cols()` built by interpolation emits no Tailwind CSS, and the grid silently falls back to 1 column at lg | Medium | Helper returns literal class strings only; S3(c) would catch it (tracks would be 1) |
| R3 | A pre-existing e2e failure is mis-attributed to this change | **High** — the suite is flaky (#287) | Capture a full `pnpm test:e2e` baseline on `feat/uiux-phase-6` **before** S1's first edit; compare counts, not colours |
| R4 | `pnpm check` stops the owner's dev server mid-probe | Medium | Ask before running it; use `pnpm exec svelte-check --tsconfig ./tsconfig.json` while a probe is live |
| R5 | `pnpm format:check` is red from an unrelated file and short-circuits every later gate | Medium | Run it first on a clean tree; if red, clear it as its own commit before trusting any gate |
| R6 | `min-h-[7rem]` makes a 1-row card look hollow next to a 3-row sibling | Medium | S4 row 3 is the explicit check; if it reads wrong, drop to `min-h-0` — one class, no other change |
| R7 | `overflow-hidden` on the postings card clips a focus ring on the `Approve` button at the scroll edge | Low | S4 row 5 keyboard-tabs through the last posting row; the scroll body scrolls focus into view natively |

---

## Implementation Checklist

1. Capture a full `pnpm test:e2e` baseline on `feat/uiux-phase-6` and record the pass/fail counts (R3).
2. Edit `+page.svelte:606` — replace the regularizations card class string per the S1 table.
3. Edit `+page.svelte:630` — replace the regularizations `<ul>` class string per the S1 table.
4. Edit `+page.svelte:655` — replace the postings card class string per the S1 table.
5. Edit `+page.svelte:664` — replace the postings `<ul>` class string per the S1 table.
6. Run the S1 gates in CI order; grep the diff for removed comment lines; commit S1.
7. Add the `cols()` helper to `<script>` after the `awaiting` derivation (`:73`).
8. Add the four `$derived` zone counts per the S2 table.
9. Build zone 1 `NEEDS A DECISION` — move the regularizations, postings and Awaiting-you cards into one `{#if decisionCount}` section grid, and demote the Awaiting-you card's own `<h2>` (`:726`) to `<h3>`.
10. Build zone 2 `AT A GLANCE` — Attendance Today full-width, then the 2–3 tile grid.
11. Build zone 3 `FEED` — Recent Activity, Announcements, My Status, Upcoming Events with the `feedCount === 4 ? 2 : feedCount` rule.
12. Build zone 4 `DOORS` — keep `mt-auto` **and** `sm:grid-cols-2`, swap only the hard-coded `lg:grid-cols-3` for `cols(doorCount)`.
13. Put `data-zone="decision"`, `"glance"`, `"feed"`, `"doors"` on the four zone grids — glance carries it on the tile grid, not on Attendance Today. S3(c) selects on it.
14. Apply the three inner list caps (`:261`, `:424`, `:524`) per the S2 table.
15. Amend the three comments named in the S2 2e ledger to their replacement text; confirm every other comment survives verbatim (`git diff -U0 -- 'src/routes/(app)/dashboard/+page.svelte' | grep '^-.*<!--'`, reconcile each hit against the ledger).
16. Run the S2 gates in CI order; commit S2.
17. Create `tests/e2e/dashboard-layout.spec.ts` with the probationary-employee fixture and the `PrismaClient` `afterAll` restore. **No posting fixture, no `mapApprover()`.**
18. Add test group (a) — computed-style bounds on both alert cards, precondition asserted before each measurement.
19. Add test group (b) — role × zone visibility for employee, hr, admin, ceo; no fixed card counts.
20. Add test group (c) — no-orphan track-count check at 1440 for employee and admin, selecting on `[data-zone]`.
21. Run the negative control: revert `max-h-80`, confirm (a) goes red, restore.
22. Run the S3 gates plus one full `pnpm test:e2e`; compare to the step-1 baseline; commit S3.
23. Hand the owner the S4 probe checklist (13 rows); record results in `dashboard-layout_REPORT_17-09-26.md`.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/ui-ux-overhaul/active/dashboard-layout_17-09-26/dashboard-layout_PLAN_17-09-26.md`
2. **Last completed step:** none — PLAN written, nothing executed.
3. **Validate-contract status:** written 18-09-26 — **CONDITIONAL**, P1–P13 applied. See below.
4. **Supporting context loaded:** `process/context/all-context.md`, `process/context/tests/all-tests.md`,
   `dashboard-layout_RESEARCH_17-09-26.md`, `dashboard-layout_INNOVATE_17-09-26.md`,
   `src/routes/(app)/dashboard/+page.svelte`, `src/lib/components/ui/Container.svelte`,
   `tests/e2e/helpers.ts`, `tests/e2e/dashboard.spec.ts`, `tests/e2e/posting-approver-sod.spec.ts`,
   `src/lib/server/services/dashboard.ts`, `phase-blast-radius-registry.md`.
5. **Next step for a fresh agent:** D1–D3 are confirmed and locked, and the validate-contract is
   CONDITIONAL-accepted. Run checklist step 1 (the e2e baseline) before touching `+page.svelte`.
   Sections are independently committable and strictly ordered S1 → S2 → S3 → S4.

## Inner Loop Refresh Note

**18-09-26** — amended **A1–A6** from `dashboard-layout_INNOVATE-SUPPLEMENT_18-09-26.md`, the
screenshot-fed INNOVATE refresh (24 role × theme × width captures in `screens/`). All six are
doc-only: A1 corrects the S3 fixture premise (this dev DB already holds 255 probationary employees
and 27 pending postings), A2 adds S4 probe row 12 against that residue, A3 rewords S4 row 2 for the
newly adjacent amber/blue cards, A4 states what an "8+ rows" check does and does not prove, A5 rules
a "view all" link out of scope, A6 adds the F7 toast-overlap backlog stub. **No code, no
checkpoint, no class string, no zone rule and no checklist step changed; D1–D3 stay locked.**

**18-09-26, second pass** — VALIDATE ran and returned **CONDITIONAL** (0 FAILs, 15 findings). Plan
updates **P1–P13** are applied above: the S2 2e comment ledger (three comments amended, the rest
carried verbatim), `data-zone` hooks on the four zone grids, the Awaiting-you `<h3>` demotion, the
S3(a) posting fixture dropped, a `PrismaClient` `afterAll` restore, A4 narrowed to `lg`, S4 rows 2
and 11 corrected plus a new row 13, `svelte-check` made the default type gate, and the drifted
comment and anchor line numbers fixed. **No class string, no zone-count rule and no decision
changed; D1–D3 stay locked.** The contract is below.

## Validate Contract

Status: CONDITIONAL
Date: 18-09-26
date: 2026-09-18
generated-by: outer-pvl

Parallel strategy for EXECUTE: sequential
Rationale: 0 of 7 fan-out signals present — 2 files, 1 package, presentation-only, no
schema/API/auth/high-risk surface, 3 strictly ordered code sections in one file. One
`vc-execute-agent`, S1 → S2 → S3, commit per section as its gates go green; S4 is the owner's
probe and is not an agent task. Parallel lanes would contend on a single file and buy nothing.
Cost guard: not triggered (1 agent).

VALIDATE's own fan-out ran **sequentially in-session** — the validating agent had no Agent tool in
its grant, so all four Layer 1 dimensions and all four Layer 2 sections were checked directly
against source rather than spawned. Every finding below cites a file and line that was read.

### Test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| A1 | Upcoming Regularizations card bounded 112–320px, list scrolls | Fully-Automated | `dashboard-layout.spec.ts` (a) + the mandatory negative control | B — added by S3 |
| A2 | Postings card same bounds and scrolling list | Fully-Automated | `dashboard-layout.spec.ts` (a) postings bounds | B — added by S3 |
| A2-note | Bounds hold with a Send-back note expanded | Hybrid | S4 probe row 5, dev server running | C — owner probe |
| A3 | Four zones in order; a zero-card zone renders nothing | Fully-Automated | `dashboard-layout.spec.ts` (b) zone heading visibility | B — added by S3 |
| A4 | No zone row ends with an orphan **at `lg` and above** | Fully-Automated | `dashboard-layout.spec.ts` (c) `children % tracks === 0` at 1440, on `[data-zone]` | B — added by S3 |
| A5 | All seven hard contracts still hold | Fully-Automated | `dashboard.spec.ts`, `admin.spec.ts`, `posting-approver-sod.spec.ts`, `employee-view-only.spec.ts` | A — proven now (all seven verified against source at VALIDATE) |
| A6 | No role gains or loses a card — employee, hr, admin, ceo | Fully-Automated | `dashboard-layout.spec.ts` (b) role matrix | B — added by S3 |
| A6-PO | Same, for PAYROLL_OFFICER | Agent-Probe | S4 probe row 11 | D — no seeded account (`tests/e2e/helpers.ts:3-21`); backlog stub `e2e-no-payroll-officer-account_NOTE_17-09-26.md` |
| A7 | Both themes read correctly at 1440 and 390 | Agent-Probe | S4 probe rows 1–10, 13 | D — nothing in this repo mounts a component (`vitest.config.ts` is `environment: 'node'`); backlog `component-test-dom-environment_NOTE_03-09-26.md` |
| A8 | No server load, query or data-shape change | Fully-Automated | `git diff --stat` shows only `+page.svelte` and the new spec; `pnpm test` green | A — proven now |

gap-resolution legend: A = proven now · B = gate added by this plan · C = deferred to a named
later step · D = named residual with a backlog stub.

Failing stubs (red-first starting points for S3; not files on disk yet):

```
test("should bound the regularizations card to 320px and scroll its list", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: regularizations card bounds")
})
test("should bound the postings card to 320px and scroll its list", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: postings card bounds")
})
test("should render four zones in order and omit a zero-card zone", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: zone order and visibility")
})
test("should leave no orphan card in any zone grid at lg", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: no-orphan track count at 1440")
})
test("should show each role the same cards before and after the reorder", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: role x zone matrix")
})
test("should change no server load, query or data shape", () => {
  throw new Error("NOT IMPLEMENTED — TDD stub for: git diff --stat scope check")
})
```

Legacy line form, for contract consumers that parse it:

- alert-card bounds: Fully-automated: `CI=1 pnpm exec dotenv -e .env.dev -- playwright test dashboard-layout.spec.ts`
- zone order and role matrix: Fully-automated: same command
- no-orphan at `lg`: Fully-automated: same command
- hard contracts: Fully-automated: `CI=1 pnpm exec dotenv -e .env.dev -- playwright test dashboard.spec.ts admin.spec.ts employee-view-only.spec.ts posting-approver-sod.spec.ts multi-role-sod.spec.ts`
- service and data shape: Fully-automated: `pnpm test`
- expanded send-back note at volume: hybrid: S4 probe row 5 + a running dev server
- both themes, 390px, PAYROLL_OFFICER: agent-probe: S4 probe rows 1–13
- 640–1023px orphan band: known-gap: documented, see Open gaps

### Dimension findings

- Infra fit: CONCERN — e2e runs against `pnpm build && pnpm preview` on port 4173 with
  `reuseExistingServer: false` (`playwright.config.ts:44-52`), so S3 never touches the owner's 5173
  dev server and the plan's `CI=1 pnpm exec dotenv …` command form is correct. One fix applied
  (P12): `pnpm exec svelte-check --tsconfig ./tsconfig.json` is now the default type gate in all
  three sections instead of `pnpm check`. R2's Tailwind mitigation confirmed valid —
  `tailwind.config.ts:11` globs `./src/**/*.{html,js,svelte,ts}`, so literal `lg:grid-cols-N`
  strings are emitted.
- Test coverage: CONCERN — seven findings, all fixed in plan (P3, P5, P6, P7, P13) or carried as
  named residuals. The bound test is **not** vacuous: `listUpcomingRegularizations` has no `take()`
  (`src/lib/server/services/dashboard.ts:22-37`), so all 255 residue rows really render, and the
  negative control is mandatory before S3 is accepted.
- Breaking changes: PASS — all seven hard contracts checked line by line against the specs; no
  exported function, route, load shape, form action, URL or accessible name changes. Two Proof-column
  overstatements corrected (P10). Blast-radius registry claims `+page.svelte` for this task; phase 06's
  claim on the same file is closed `DONE` and phases 07/08 do not claim it — no live overlap.
- Security surface: PASS — presentation-only. `+page.server.ts`, `src/lib/rbac.ts` and every service
  stay out of scope. Each card's render condition already mirrors a server-computed capability
  boolean (`+page.server.ts:22-28`), and the four `$derived` zone counts read those same booleans,
  so the reorder provably cannot widen what any role sees. `listUpcomingRegularizations` is
  org-scoped (`dashboard.ts:24`). No auth, money, schema, migration, secret or trust-boundary
  surface, so no `vc-risk-evidence-pack` is required.
- S1 — bound the two alert cards: PASS — all four class anchors (`:606`, `:630`, `:655`, `:664`)
  match the file byte for byte. `space-y-3` → `gap-3` is correctly justified. No `{@const}`
  involvement. Highest-risk edit: none; S1 has no gate of its own until S3 lands, so run the
  negative control the moment S3(a) exists.
- S2 — zone reorder and derived columns: CONCERN — feasible under Svelte 5 runes as the file stands
  today. All four zone-count expressions were checked card by card against the real render
  conditions (`:605`, `:654`, `:724`, `:222`, `:303`, `:458`, `:778`) and all four agree. The
  `{@const}` placement rule is not engaged: the file's only two (`:314`, `:666`) are already
  immediate children of `{#each}` blocks and travel with them. Highest-risk edit: moving three card
  blocks across ~600 lines — mitigated by the binding 2e comment ledger plus the
  `git diff -U0 … | grep '^-.*<!--'` reconciliation at checklist step 15.
- S3 — Playwright coverage: CONCERN — writable in this setup (Chromium against build+preview,
  `locator.evaluate`, `max-h-80` → `320px`, `min-h-[7rem]` → `112px`, `gridTemplateColumns` resolves
  to px tracks at 1440, and specs may import `PrismaClient` directly per `dashboard.spec.ts:35-43`).
  This is the suite's first computed-style assertion. Highest-risk edit: the original postings
  fixture, which rewrote a department mapping another spec owns — removed by P5.
- S4 — owner live probe: CONCERN — two rows were factually wrong against this dev DB and are fixed
  (P3, P8); one row added. Rows 1, 3–8, 10, 12 stand as written.

### Execute-agent instructions

| # | Instruction | Trigger condition |
|---|---|---|
| E1 | Before **every** section commit, run `git diff -U0 -- 'src/routes/(app)/dashboard/+page.svelte' \| grep '^-.*<!--'` and reconcile each hit against the S2 2e ledger. A removed comment line that is not an amend row in that ledger is a defect, not a cleanup. | Each of S1, S2, S3 |
| E2 | Never run `pnpm check` — it runs `svelte-kit sync` and stops the owner's dev server. Use `pnpm exec svelte-check --tsconfig ./tsconfig.json`. | Every type gate |
| E3 | Run the S3(a) negative control (revert `max-h-80`, confirm the test goes red, restore) and **record that it went red** in the phase report. A bound test that cannot fail is not a bound test. | S3 exit, before commit |
| E4 | Capture the full `pnpm test:e2e` baseline on `feat/uiux-phase-6` **before** the first edit to `+page.svelte`, and compare counts — not colours — afterwards. The suite is flaky (#287). | Checklist step 1, before S1 |

### Open gaps

- PAYROLL_OFFICER automated zone coverage: known-gap — no seeded account in
  `tests/e2e/helpers.ts:3-21`. Agent-Probe only (S4 row 11). Backlog stub
  `e2e-no-payroll-officer-account_NOTE_17-09-26.md` already scheduled at UPDATE-PROCESS.
- Both-theme visual proof: known-gap — no component mounting and no visual-regression tooling
  (`vitest.config.ts` is `environment: 'node'`). Agent-Probe only. Tracked in
  `backlog/component-test-dom-environment_NOTE_03-09-26.md`.
- Orphan cards between 640px and 1023px: known-gap — `sm:grid-cols-2` survives on the tile grid
  (`:190`) and the doors grid (`:747`), so a 3-card zone renders 2+1 in that band. A4 is explicitly
  scoped to `lg` and above. Write a backlog note at UPDATE-PROCESS if the owner wants that band
  covered.
- Legibility of 255 near-identical rows inside a 320px scroll box: known-gap, by prior decision —
  the "view all" link is ruled out of scope (A5 of the INNOVATE supplement; `/employees` has no
  `employmentType` filter). Backlog note already scheduled.
- Toast stack overlapping Upcoming Events for PAYROLL_OFFICER: known-gap — separate notification
  component, not a Touchpoint. Backlog stub `toast-stack-overlaps-upcoming-events_NOTE_18-09-26.md`
  already scheduled.
- Ungated `Onboard Employee` quick action: out of scope by the plan's own Scope section — a gating
  question, not a layout one. Visible to EMPLOYEE in `screens/employee_light_1440_top.png`.

### What this coverage does NOT prove

- The Fully-Automated e2e gates run only in Chromium at 1440px and prove **computed style and DOM
  structure**. They do not prove the page looks right: not the dark theme, not 390px, not colour
  contrast, not whether amber and blue stay distinguishable in the new 3-up decision row.
- The no-orphan gate runs at one viewport (1440). It proves nothing at 390px, 768px or 1024px, and
  by design it cannot fail on the 640–1023px orphan band named above.
- The role-matrix gate covers four seeded accounts (employee, hr, admin, ceo). It proves nothing
  about PAYROLL_OFFICER, MANAGER, FINANCE, VERIFIER or APPROVER zone shapes.
- The bound gate proves the card **stops at 320px**. It does not prove the capped list is a usable
  decision tool at 255 rows, nor that a 1-row card at 112px does not read as hollow (S4 row 3).
- `pnpm test` mocks the database, so it cannot prove any query-level or tenant-scoping property; it
  is used here only as a no-regression check on a surface this plan does not touch.
- A green `pnpm test:e2e` sweep matching the step-1 baseline proves **no new failures**, not that
  the pre-existing failures are unrelated. Read the errors (#287).

Gate: CONDITIONAL — 0 FAILs, 15 findings; 13 fixed in the plan as P1–P13, 4 written as execute-agent
instructions E1–E4, 6 carried as named known-gaps above. Proceed to EXECUTE with the gaps on record.
Accepted by: owner, V5 option 1 ("Accept"), 18-09-26 — accepting the six Open-gaps entries above as
known residuals, with P1–P13 applied to the plan before EXECUTE.

**Autonomous goal block:** not written here. This task runs under the `ui-ux-overhaul` umbrella,
which already carries `## Stable Program Goal`
(`../ui-ux-overhaul_03-09-26/ui-ux-overhaul-umbrella_PLAN_03-09-26.md:79`). That goal governs;
reference for latest state is the umbrella plan.

