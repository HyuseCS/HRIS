---
name: plan:owner-click-pass-build-lane
description: "Implementation plan for the four settled items from the owner's 18-09-26 click pass — N7 PageHeader description behind a ?, N1 attendance view switch, N4 separations title-row action, N6 settings/org assignments pagination."
date: 18-09-26
feature: ui-ux-overhaul
---

# Owner click-pass build lane — PLAN

**Date**: 18-09-26
**Status**: PLANNED — awaiting VALIDATE
**Complexity**: COMPLEX (4 items, 5 source files, 34 acceptance criteria, a shared component with ~52-route reach)
**Feature**: ui-ux-overhaul
**Branch**: `feat/uiux-phase-7`
**Upstream SPEC**: `owner-click-pass-build-lane_SPEC_18-09-26.md`

**TL;DR** — 22 steps, 4 commits, order **N7 → N1 → N4 → N6**. 5 source files change, 5 test files change (2 new unit, 3 new e2e, 2 extended e2e). 33 of 34 acceptance criteria are covered with a named step and a named test. **N6-AC10's page-change focus clause is OUT of this lane by owner decision** and is filed as its own backlog note; the rest of AC10 is covered. See [N6-AC10 — deferred by owner decision](#n6-ac10--deferred-by-owner-decision). Two mandatory negative controls are specified with exact mutations. Nothing touches `rbac.ts`, `schema.prisma` or `services/**`.

Upstream SPEC: `owner-click-pass-build-lane_SPEC_18-09-26.md` (same folder). Decisions D1, D3, D6, D6b are inputs, not choices — INNOVATE was skipped deliberately.

---

## Context Envelope

| # | Field | Value |
|---|---|---|
| 1 | feature | `ui-ux-overhaul` |
| 2 | phase | `PLAN` |
| 3 | session-goal | Build N7, N1, N4, N6 from the owner's 18-09-26 click pass |
| 4 | branch | `feat/uiux-phase-7` |
| 5 | worktree | main checkout `/home/hyuse/Desktop/VeentApps/hris` |
| 6 | context-group | `uxui`, `tests` |
| 7 | blast-radius-packages | `src/lib/components/ui/PageHeader.svelte`, `src/lib/components/attendance/AttendanceHrGrid.svelte`, `src/routes/(app)/separations/+page.svelte`, `src/routes/(app)/settings/org/+page.server.ts`, `src/routes/(app)/settings/org/+page.svelte`, `tests/**` |
| 8 | active-plan | this file |
| 9 | test-runner | `vitest` (`bun run test`) \| `playwright` (`bun run test:e2e`) |
| 10 | validate-contract | pending — vc-validate-agent writes it before EXECUTE |

---

## Touchpoints

**Source files changed (5):**

| File | Item | Change class |
|---|---|---|
| `src/lib/components/ui/PageHeader.svelte` | N7 | Replace the description `<p>` with a `HelpTip` |
| `src/lib/components/attendance/AttendanceHrGrid.svelte` | N1 | Two-state switch + flip link; per-day controls collapse to one row |
| `src/routes/(app)/separations/+page.svelte` | N4 | Move `New Separation` onto the title row |
| `src/routes/(app)/settings/org/+page.server.ts` | N6 | Read `url`, filter, paginate, slice |
| `src/routes/(app)/settings/org/+page.svelte` | N6 | Filters become a GET form; render one page + `Pagination` |

**Files READ but not changed:** `src/lib/components/ui/HelpTip.svelte` (mutated only in the N7 negative control, then reverted), `src/lib/server/pagination.ts`, `src/lib/components/Pagination.svelte`, `src/routes/(app)/attendance/+page.svelte` (mutated only in the A1 negative control, then reverted), `src/routes/(app)/settings/roles/+page.server.ts` + `+page.svelte` (pattern source).

**Test files changed (7):**

| File | Status |
|---|---|
| `tests/unit/page-header-helptip.test.ts` | NEW (source-assertion, node env) |
| `tests/unit/settings-org-load.test.ts` | NEW (load unit, mocked service) |
| `tests/e2e/page-header-helptip.spec.ts` | NEW |
| `tests/e2e/attendance-view-switch.spec.ts` | NEW |
| `tests/e2e/settings-org-assignments.spec.ts` | NEW |
| `tests/e2e/employee-view-only.spec.ts` | CORRECTED (line 170) |
| `tests/e2e/separations.spec.ts` | EXTENDED (3 new tests appended) |

**Explicitly NOT touched (hard constraint):** `src/lib/rbac.ts`, `prisma/schema.prisma`, `src/lib/server/services/**`, `.env` / `.env.dev`, `prisma/seed*.ts`.

---

## Public Contracts

| Contract | Before | After | Breaking? |
|---|---|---|---|
| `PageHeader` props | `title`, `description?`, `badge?`, `back?` | identical — no prop added, renamed or removed | No. D1 requires the prop name survive so no call site is edited. |
| `PageHeader` render of `description` | visible `<p>` under the title | `HelpTip` `?` button inside the title cluster | Visual only. No test asserts any description string (verified). |
| `/attendance?view=` values | `matrix` \| `team` \| `employee` | unchanged | No. N1-AC5 pins this. |
| `/attendance` visible link names | `Whole team`, `Team day`, `By employee` | `Whole team`, `By employee`, + one named flip link | `Team day` disappears — that is the point of D6, and A1 corrects the one spec that referenced the area. |
| `/settings/org` address | no query params consumed | reads `empSearch`, `empUnassigned`, `empPage` | Additive. Unknown params are ignored today, so old bookmarks still resolve. |
| `assignEmployee` form action | unchanged | unchanged | No. |
| `listAssignableEmployees(organizationId)` | one argument | **one argument — unchanged** | No. `services/**` is never touched; the load filters and slices in memory. |

---

## Blast Radius

- **5 source files**, **7 test files**, **0 schema changes**, **0 service changes**, **0 dependency additions** (`lucide-svelte@0.460.0` is already a dependency — verified in `package.json:75`; `calendar-days.svelte`, `grid-3x3.svelte`, `table-2.svelte` all exist under `node_modules/lucide-svelte/dist/icons/`).
- **Risk class: LOW–MEDIUM.** No auth, no billing, no schema, no migration, no secrets. The one medium item is N7, which changes how **all 33 descriptions across 30 files** render from one file — wide reach, but zero existing-test blast radius (no test anywhere asserts a description string) and no behaviour change.
- **Widest single reach:** `PageHeader.svelte` — rendered by ~52 routes.
- **Rollback cost:** each item is one commit; `git revert` is clean for all four (see [Rollback](#rollback)).

---

## Decision log — decided during PLAN, not reopened from INNOVATE

These are the implementation-level calls the SPEC left to PLAN. The owner's D1/D3/D6/D6b are untouched.

### P-D1 — the N7 label is `About {title}`, with no guard against a badge

`HelpTip`'s `label` prop is `label: string`, **required, no default** (`HelpTip.svelte:4`). `PageHeader` synthesises it as the template literal `` `About ${title}` ``. That mirrors the two hand-written `PageHeader` badge call sites exactly — `leave/balances/+page.svelte:33` already writes `label="About leave balances"` and `settings/roles/+page.svelte:168` writes `label="About roles and permissions"`.

**N7-AC7 / R1 — what stops a double `?`.**

> **Corrected at VALIDATE.** The SPEC's background section names **four** pages as passing a `HelpTip` through a `PageHeader` `badge` snippet. Two of those four are wrong, and I repeated the error in the first draft of this plan. Re-derived from source:
> `grep -rl PageHeader src/ | xargs grep -l HelpTip` returns **three** files — `dashboard/+page.svelte`, `leave/balances/+page.svelte`, `settings/roles/+page.svelte` — and only two of those put the `HelpTip` in the `badge` snippet.
> - `attendance/TeamMatrix.svelte:75` — its `HelpTip` is inside `{#snippet toolbar()}` beside an `<h2>`, passed to `<Container>` at `:111`. **`grep -c PageHeader TeamMatrix.svelte` returns 0.** It is not a `PageHeader` badge at all.
> - `dashboard/+page.svelte:253` — its `HelpTip` is inside the "Upcoming Regularizations" popover, gated by `{#if openPanel === 'regularizations'}` at `:245`. The page's own header is a bare `<PageHeader title="Dashboard" />` at `:138` — no description, no badge.
> The conclusion is unchanged; only the evidence is.

There are exactly **two** `PageHeader` badge-`HelpTip` call sites, and **three** call sites passing a `description` alongside a badge. The split is decisive:

| File | passes `description` on `<PageHeader>`? | `badge` snippet content |
|---|---|---|
| `leave/balances/+page.svelte:31-36` | **no** | a `HelpTip` |
| `settings/roles/+page.svelte:166-172` | **no** | a `HelpTip` |
| `performance/reviews/[id]/+page.svelte` | **yes** | a **`Badge`** status pill |
| `separations/[id]/+page.svelte` | **yes** | a **`Badge`** status pill |
| `complaints/[id]/+page.svelte` | **yes** | a **`Badge`** status pill |

Not `PageHeader` badges, and therefore not in this table: `attendance/TeamMatrix.svelte:75` (a `Container` toolbar `HelpTip`) and `dashboard/+page.svelte:253` (a popover `HelpTip`).

So **no page today passes both a `description` and a badge-`HelpTip`**. The two badge-`HelpTip` pages pass no description at all, so they render exactly one `?` with no conditional needed.

**Rejected:** `{#if description && !badge}`. It looks like the safe guard and it is wrong — it would silently delete the description from the three `Badge`-pill detail pages, and it would break N7-AC10 outright (`/complaints/[id]` must keep its identity line in the tooltip).

**Chosen:** render on `{#if description}` alone, and make the invariant a **gate** rather than an accident — `tests/unit/page-header-helptip.test.ts` scans every `<PageHeader` call site in `src/` and fails if any one passes both a `description` and a `badge` snippet containing `HelpTip`. A future page that would render two `?` goes red in `bun run test` before it ships. This is the deterministic outcome R1 asks for.

### P-D2 — N6 uses a fixed `pageSize: 20`, **not** `fitPageSize`

The prompt asks me to derive `rowPx`/`chromePx` by measuring a comparable route. The honest answer is that `fitPageSize` does not fit here, and I am not going to guess a `chromePx`:

- `fitPageSize`'s `chromePx` is defined as *"innerHeight minus the scrolling region's clientHeight"* (`pagination.ts:70`). Every route that uses it — `settings/roles` (65/285), `employees` (61/287), `leave/balances` (53/281), `payslips` (48/242) — has its table as the **only** major block on the page, so the table effectively owns the viewport.
- `/settings/org` is a `space-y-8` stack: PageHeader → error banner → **Positions catalog section with its own full table** → org chart → **then** Employee Assignments. The assignments table is the last of four blocks and is normally below the fold. There is no scrolling region for it to fit into, so any `chromePx` I wrote would be a fabricated number, and the `vp` cookie falls back silently when it cannot parse — a wrong number would never announce itself.
- The precedent that actually matches this shape — **fetch-then-filter-then-slice on a banned-service list** — is `separations/+page.server.ts:29` and `inventory/+page.server.ts:40`. Both use a **fixed `paginate(url, n, { pageSize: 20 })` and no `fitPageSize` at all**.

**Chosen:** `paginate(url, filtered.length, { param: 'empPage', pageSize: 20 })`. The load therefore destructures `{ locals, url }` — **not** `cookies`. Twenty rows also keeps the seeded e2e set comfortably multi-page.

*(For the record, had `fitPageSize` been appropriate, the derived row height is ~53 px: `px-4 py-2` cells = 8+8, an `h-9` = 36 px select/Save control in the Position cell, +1 px `divide-y` border = 53 — the same figure `leave/balances` uses. It is recorded here only so a later viewport-fitting change does not have to re-derive it.)*

### P-D3 — N6 param names: `empSearch`, `empUnassigned`, `empPage`

`empPage` follows the `myPage` / `teamPage` two-tables-one-page precedent at `timesheets/+page.server.ts:62,79`. It is deliberately **not** `page`, so a future Positions table can take `page` or `posPage` without colliding — that is N6-AC6, asserted as a literal string in the load unit test.

**Two limits of this design, recorded at VALIDATE so nobody rediscovers them as bugs:**

- **A GET form replaces the whole query string.** So if a Positions table is paged later, changing an assignments filter would also reset the Positions page. Harmless today — `/settings/org` consumes no other param — and it does not weaken N6-AC6, which is about *name collision* (two params overwriting one another's value), not about co-survival. If Positions is ever paged, the fix is a hidden `<input>` carrying the Positions param through this form. Noted, not built (YAGNI).
- **The native `×` on `<input type="search">` fires no submit.** After N6, clearing the box with the browser's built-in clear button will not restore the unfiltered rows until the user presses Enter or clicks `Filter`. This is not an N6-AC5 violation — no filter change has been committed to the address — but it is a real trap created by the round-trip model the owner accepted in D3/R7. **Flag it to the owner at sign-off**; do not silently add an `onsearch` handler to paper over it, because that reintroduces per-keystroke navigation.

### P-D4 — N6-AC5 (filter change returns to page 1) is enforced structurally, not by code

The filter row becomes a plain `<form method="GET">` containing **only** `empSearch` and `empUnassigned`. A GET form submit replaces the entire query string with that form's fields, so `empPage` is simply not emitted and `paginate` reads no `empPage` → page 1. There is no reset branch to get wrong. Conversely `Pagination.svelte`'s `href()` copies the current `searchParams` and sets **only** `meta.param` (`Pagination.svelte:21-25`), so paging preserves the filters. The two halves of AC5 fall out of the two mechanisms; neither needs bespoke logic.

### P-D5 — the N1 flip control: a plain `<a>`, two states

Per D6: a link, not a menu, not a popover, no new component. Rendered only when `data.view === 'matrix' || data.view === 'team'` (i.e. only while `Whole team` is active — N1-AC2).

| Active view | lucide icon (verified present) | `aria-label` (exact) | `href` (exact) |
|---|---|---|---|
| `matrix` (week grid) | `lucide-svelte/icons/calendar-days` | `Show one day` | `?view=team&date={data.date}` |
| `team` (per day) | `lucide-svelte/icons/table-2` | `Show the week grid` | `?view=matrix` |

Both labels name the **destination**, as D6 requires. `Show the week grid` and `Show one day` are stable literal strings the e2e specs and the A1 negative control locate by. `table-2` reads as a grid of rows/columns and is already the shape the matrix draws; `calendar-days` reads as a single dated day.

**Rejected:** `grid-3x3` — it is present, but it reads as a generic app-grid/gallery rather than a data table.

---

## Implementation Checklist

Twenty-two atomic steps. Order is **N7 → N1 → N4 → N6**, per the task contract: N7 removes the grey description line, and N1-AC6 / N4-AC1 are bounding-box assertions whose geometry shifts when that line disappears.

> Reminder for EXECUTE: **no explanatory comments in code**. Existing comments — `PageHeader.svelte:4-7` and `:25-32`, `AttendanceHrGrid.svelte:318-322` (E3), `pagination.ts`, `Pagination.svelte:19-20`, `settings/org/+page.svelte:14-30` — are carried across **verbatim**, never reworded, never deleted.

---

### N7 — page descriptions move behind a `?`

#### Step 1 — import `HelpTip` into `PageHeader`

File: `src/lib/components/ui/PageHeader.svelte`

Anchor (lines 1-2, current):

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte'
```

Replacement:

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte'
	import HelpTip from './HelpTip.svelte'
```

Satisfies: N7-AC1 (enabling).

#### Step 2 — render the description as a `HelpTip` inside the `relative` title cluster

File: `src/lib/components/ui/PageHeader.svelte`

Anchor (lines 33-42, current, **verbatim**):

```svelte
<div class="flex flex-wrap items-start justify-between gap-3">
	<div class="min-w-0 flex-1 space-y-1">
		<div class="relative flex flex-wrap items-center gap-2">
			<h1 class="text-2xl font-bold tracking-tight">{title}</h1>
			{#if badge}{@render badge()}{/if}
		</div>
		{#if description}
			<p class="max-w-2xl text-sm text-muted-foreground">{description}</p>
		{/if}
	</div>
```

Replacement:

```svelte
<div class="flex flex-wrap items-start justify-between gap-3">
	<div class="min-w-0 flex-1 space-y-1">
		<div class="relative flex flex-wrap items-center gap-2">
			<h1 class="text-2xl font-bold tracking-tight">{title}</h1>
			{#if badge}{@render badge()}{/if}
			{#if description}
				<HelpTip label={`About ${title}`}>{description}</HelpTip>
			{/if}
		</div>
	</div>
```

Why this exact placement: `HelpTip`'s tooltip span is `absolute` with **no `relative` on its own wrapper** (`HelpTip.svelte:9` is `class="group inline-flex"`). Its only positioned ancestor is the `relative` div at line 35. Rendering the `?` anywhere else — including as a sibling of that div — silently mis-anchors every tooltip in the app with no compile error (SPEC R4). The `{#if description}` block must therefore live **inside** that div.

`{description}` as element content becomes `HelpTip`'s implicit `children` snippet, which is exactly the `children: Snippet` prop it declares (`HelpTip.svelte:4`).

`space-y-1` on the outer wrapper now has one child and is inert. It is left in place — surgical changes, and removing it is unrelated churn.

Satisfies: **N7-AC1, N7-AC2, N7-AC3, N7-AC4, N7-AC5, N7-AC6, N7-AC7, N7-AC9, N7-AC10**.

#### Step 3 — the source-assertion unit gate

File: `tests/unit/page-header-helptip.test.ts` (NEW). Node environment, no DOM — this repo has **no component-test harness**: `vitest.config.ts` sets `environment: 'node'` and `include: ['tests/unit/**']`, `jsdom`/`happy-dom` are not installed, and `@testing-library/svelte` has zero importers. The established way this repo pins a Svelte render contract is a source assertion — `badge-class-literals.test.ts`, `time-picker-migration.test.ts`, `destructive-confirms.test.ts`. Adding jsdom is a new devDependency and a config change for three assertions; it is not the rung that holds.

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const header = readFileSync('src/lib/components/ui/PageHeader.svelte', 'utf8')

function sourceFiles(dir: string, out: string[] = []): string[] {
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry)
		if (statSync(path).isDirectory()) sourceFiles(path, out)
		else if (entry.endsWith('.svelte')) out.push(path)
	}
	return out
}

describe('PageHeader renders its description as a HelpTip', () => {
	it('carries no standalone description paragraph', () => {
		expect(header).not.toMatch(/<p[^>]*>\s*\{description\}/)
	})

	it('renders exactly one HelpTip, named from the title, guarded by description', () => {
		const tip = header.match(/\{#if description\}\s*<HelpTip label=\{`About \$\{title\}`\}>\{description\}<\/HelpTip>/)
		expect(tip).not.toBeNull()
		expect(header.match(/<HelpTip/g)).toHaveLength(1)
	})

	it('keeps the HelpTip inside the only relative ancestor it can anchor to', () => {
		const cluster = header.slice(
			header.indexOf('<div class="relative'),
			header.indexOf('</div>', header.indexOf('<HelpTip'))
		)
		expect(cluster).toContain('<HelpTip')
	})

	it('keeps the props list unchanged', () => {
		for (const prop of ['title:', 'description?:', 'badge?:', 'back?:']) {
			expect(header).toContain(prop)
		}
		expect(header).not.toContain('actions')
	})

	it('no call site passes both a description and a badge HelpTip', () => {
		const offenders = sourceFiles('src').filter((path) => {
			const src = readFileSync(path, 'utf8')
			// Scope to the <PageHeader ...> OPENING TAG. A file-wide /description=/ is wrong:
			// EmptyState, Badge and others take a `description` prop too.
			const openingTags = [...src.matchAll(/<PageHeader\b[^>]*>/g)].map((m) => m[0])
			if (!openingTags.some((tag) => /\bdescription=/.test(tag))) return false
			const badge = src.match(/\{#snippet badge\(\)\}([\s\S]*?)\{\/snippet\}/)
			return !!badge && badge[1].includes('HelpTip')
		})
		expect(offenders).toEqual([])
	})
})
```

**Why the predicate is scoped to the opening tag (corrected at VALIDATE).** A file-wide `/description=/` test makes this gate **red against the untouched repo**: `leave/balances/+page.svelte` has a badge-`HelpTip` at `:33` **and** an unrelated `description={filtered ? … : undefined}` on an `<EmptyState>` at `:148`, so it would be reported as an offender on day one. `EmptyState`, `Badge` and others all take a `description` prop. Matching `/<PageHeader\b[^>]*>/g` and testing only those tags is the fix. The regex-over-source shape mirrors `tests/unit/badge-class-literals.test.ts:34-40` (the recursive `sourceFiles` walker, lifted verbatim) and `tests/unit/time-picker-migration.test.ts:9-13`.

**The mutation that reds this gate (state it in the phase report).** Add a description to the `PageHeader` at `src/routes/(app)/leave/balances/+page.svelte:31`:

```svelte
<PageHeader title="Leave Balances" description="Remaining days per employee.">
```

That file already carries a badge-`HelpTip` at `:33`, so the page would render two `?` — one from the badge, one from the description path. Expected failure:
`expect(received).toEqual(expected) — Received: ["src/routes/(app)/leave/balances/+page.svelte"], Expected: []`.
Revert after recording. This confirms the invariant scan is a guard and not a tautology.

Satisfies: **N7-AC1, N7-AC2, N7-AC3, N7-AC7** (the invariant half), **N7-AC4** (the props half), **N4-AC4** (the `actions` half).

#### Step 4 — the N7 e2e spec

File: `tests/e2e/page-header-helptip.spec.ts` (NEW). Full assertions in [Test plan](#test-plan). Satisfies **N7-AC5, N7-AC6, N7-AC7, N7-AC9, N7-AC10**.

#### Step 5 — the N7 negative control (mandatory)

Specified in [Negative control 2](#negative-control-2--n7-focus-reveal). Satisfies **N7-AC9**'s negative-control clause.

#### Step 6 — the N7-AC8 contrast probe

Agent-probe. Specified in [Test plan → N7-AC8](#n7-ac8--contrast-probe-agent-probe). No code change.

> **Commit 1 here.** The diff must contain `src/lib/components/ui/PageHeader.svelte` and the two new test files and **nothing else** — that is N7-AC4's diff-scope gate.

---

### N1 — attendance view switch and the per-day controls row

#### Step 7 — import the two flip icons

File: `src/lib/components/attendance/AttendanceHrGrid.svelte`

Add to the existing `<script>` import block (alongside the existing `DatePicker` import):

```svelte
	import CalendarDays from 'lucide-svelte/icons/calendar-days'
	import Table2 from 'lucide-svelte/icons/table-2'
```

Import style matches `DatePicker.svelte:3-4` (`lucide-svelte/icons/<kebab>`), the per-icon deep path this repo uses everywhere.

#### Step 8 — collapse the switch to two states and add the flip link

File: `src/lib/components/attendance/AttendanceHrGrid.svelte`

Anchor (lines 207-238, current, **verbatim**):

```svelte
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0 flex-1">
			<PageHeader title="Attendance" description="Team overview, daily records & corrections." />
		</div>
		<div class="inline-flex w-full max-w-full flex-wrap rounded-lg border p-1 text-sm sm:w-auto">
			<a
				href="?view=matrix"
				class="rounded-md px-3 py-1.5 font-medium {data.view === 'matrix'
					? 'bg-primary text-primary-foreground'
					: 'text-muted-foreground hover:bg-accent'}"
			>
				Whole team
			</a>
			<a
				href="?view=team&date={data.date}"
				class="rounded-md px-3 py-1.5 font-medium {data.view === 'team'
					? 'bg-primary text-primary-foreground'
					: 'text-muted-foreground hover:bg-accent'}"
			>
				Team day
			</a>
			<a
				href="?view=employee&employeeId={data.selectedEmployeeId ??
					''}&from={data.from}&to={data.to}"
				class="rounded-md px-3 py-1.5 font-medium {data.view === 'employee'
					? 'bg-primary text-primary-foreground'
					: 'text-muted-foreground hover:bg-accent'}"
			>
				By employee
			</a>
		</div>
	</div>
```

Replacement:

```svelte
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0 flex-1">
			<PageHeader title="Attendance" description="Team overview, daily records & corrections." />
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<div class="inline-flex max-w-full flex-wrap rounded-lg border p-1 text-sm">
				<a
					href="?view=matrix"
					class="rounded-md px-3 py-1.5 font-medium {data.view !== 'employee'
						? 'bg-primary text-primary-foreground'
						: 'text-muted-foreground hover:bg-accent'}"
				>
					Whole team
				</a>
				<a
					href="?view=employee&employeeId={data.selectedEmployeeId ??
						''}&from={data.from}&to={data.to}"
					class="rounded-md px-3 py-1.5 font-medium {data.view === 'employee'
						? 'bg-primary text-primary-foreground'
						: 'text-muted-foreground hover:bg-accent'}"
				>
					By employee
				</a>
			</div>
			{#if data.view !== 'employee'}
				<a
					href={data.view === 'matrix' ? `?view=team&date=${data.date}` : '?view=matrix'}
					aria-label={data.view === 'matrix' ? 'Show one day' : 'Show the week grid'}
					class="inline-flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{#if data.view === 'matrix'}
						<CalendarDays class="h-4 w-4" aria-hidden="true" />
					{:else}
						<Table2 class="h-4 w-4" aria-hidden="true" />
					{/if}
				</a>
			{/if}
		</div>
	</div>
```

Notes an executor needs:

- `data.view !== 'employee'` is the `Whole team` active test, because `Whole team` now covers **both** `matrix` and `team`. That is exactly D6: two switch states, with the flip choosing the layout inside `Whole team`.
- `href="?view=matrix"` on the `Whole team` link is unchanged, so coming from `By employee` always lands on the week grid — **N1-AC4**.
- The `?view=` values are untouched — **N1-AC5**.
- `w-full … sm:w-auto` moves off the pill and the pill and the flip link now share one `flex flex-wrap` parent, so the flip link wraps with the pill instead of being pushed off.
- The icons carry `aria-hidden="true"`; the link's `aria-label` is the accessible name — **N1-AC8**.
- DOM order is `Whole team` → `By employee` → flip link, which is the Tab order N1-AC8 requires.

Satisfies: **N1-AC1, N1-AC2, N1-AC3, N1-AC4, N1-AC5, N1-AC8**.

#### Step 9 — collapse the per-day controls card to one row (D6b)

File: `src/lib/components/attendance/AttendanceHrGrid.svelte`

**9a — the card wrapper and the filter block.** Anchor (lines 240-246 + 258, current):

```svelte
	{#if data.view !== 'matrix'}
		<div class="space-y-4 rounded-lg border bg-card p-4">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<!-- Filters -->
				{#if data.view === 'team'}
					<form bind:this={dayForm} method="GET" class="flex flex-1 flex-wrap items-end gap-3">
```

…through the closing `</form>` at line 258 and the `{:else if data.view === 'employee'}` at 259.

Replacement — the card loses `space-y-4` on the team view, and the `team` branch of the filter wrapper is **removed from here** (it reappears in 9b):

```svelte
	{#if data.view !== 'matrix'}
		<div class="rounded-lg border bg-card p-4 {data.view === 'team' ? '' : 'space-y-4'}">
			{#if data.view === 'employee'}
				<div class="flex flex-wrap items-start justify-between gap-3">
					<!-- Filters -->
					<form bind:this={rangeForm} method="GET" class="flex flex-1 flex-wrap items-end gap-3">
```

…the entire existing `employee` form body (lines 260-314) is unchanged, and its closing becomes:

```svelte
					</form>
				</div>
			{/if}
```

The `<!-- Filters -->` comment is carried across verbatim, as required.

**9b — the bulk-actions row absorbs the Day picker.** Anchor (lines 318-323, current, **the E3 comment is verbatim and must not change**):

```svelte
			<!-- Bulk actions.
			     E3: one flat row of five buttons made a re-derive read the same as a lock. They are now
			     two labelled clusters — a read-ish recalculate, and the irreversible lock/release pair —
			     split by a visible divider, with "Save as timesheet" held apart as this bar's primary
			     action. -->
			<div class="flex flex-wrap items-center gap-2 border-t pt-4">
```

Replacement:

```svelte
			<!-- Bulk actions.
			     E3: one flat row of five buttons made a re-derive read the same as a lock. They are now
			     two labelled clusters — a read-ish recalculate, and the irreversible lock/release pair —
			     split by a visible divider, with "Save as timesheet" held apart as this bar's primary
			     action. -->
			<div class="flex flex-wrap items-center gap-2 {data.view === 'team' ? '' : 'border-t pt-4'}">
```

Then, immediately **before** the closing `</div>` of that bulk-actions row — after the existing "Exceptions only" label block — insert the Day form, moved here intact from 9a:

```svelte
				{#if data.view === 'team'}
					<form bind:this={dayForm} method="GET" class="ml-auto flex flex-wrap items-end gap-3">
						<input type="hidden" name="view" value="team" />
						{#if data.exceptionsOnly}<input type="hidden" name="exceptions" value="1" />{/if}
						<div class="flex flex-col gap-1">
							<label for="date" class="text-xs font-medium text-muted-foreground">Day</label>
							<DatePicker
								id="date"
								name="date"
								value={data.date}
								onchange={() => dayForm?.requestSubmit()}
								class="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm"
							/>
						</div>
					</form>
				{/if}
```

Result on the per-day view: one row reading `Refresh | Lock day | Unlock day | Export CSV | Exceptions only ……… [Day ▾]`. `ml-auto` pushes the Day picker to the right edge, which is both halves of **N1-AC6** — vertical mid-points aligned by `items-center`, and the Day picker's left edge strictly right of the last bulk button's right edge, which two overlapping elements cannot fake (SPEC R8). The `border-t` divider between the old two rows is gone on this view.

The employee view keeps `space-y-4`, keeps its two-row shape and keeps its `border-t pt-4` — **N1-AC7**. `bind:this={dayForm}`, the `view`/`exceptions` hidden inputs and the `requestSubmit()` handler all move unchanged, so day selection still round-trips.

Satisfies: **N1-AC6, N1-AC7**.

#### Step 10 — the N1 e2e spec

File: `tests/e2e/attendance-view-switch.spec.ts` (NEW). Assertions in [Test plan](#test-plan). Satisfies **N1-AC1…AC8**.

#### Step 11 — correct `employee-view-only.spec.ts:170`

File: `tests/e2e/employee-view-only.spec.ts`

Anchor (line 170, current):

```ts
	await expect(page.getByRole('link', { name: 'Whole team (day)' })).toHaveCount(0)
```

Replacement (two lines, replacing the one):

```ts
	await expect(page.getByRole('link', { name: 'Whole team', exact: true })).toHaveCount(0)
	await expect(page.getByRole('link', { name: 'Show one day', exact: true })).toHaveCount(0)
```

Line 171 (`'By employee'`) is left exactly as it is — it is already a real match. `exact: true` matters: without it, `'Whole team'` would substring-match a future label and the assertion could drift vacuous again.

Satisfies: **N1-AC9** (with [Negative control 1](#negative-control-1--a1--n1-ac9)).

#### Step 12 — the A1 negative control (mandatory)

Specified in [Negative control 1](#negative-control-1--a1--n1-ac9).

> **Commit 2 here.**

---

### N4 — `New Separation` on the title row

#### Step 13 — lay the button beside `PageHeader`

File: `src/routes/(app)/separations/+page.svelte`

Anchor (lines 22-35, current, **verbatim**):

```svelte
<div class="space-y-6">
	<PageHeader
		title="Separations"
		description="Record resignations and terminations, run clearance, and settle final pay."
	/>

	<div class="flex justify-end">
		<button
			onclick={() => (showForm = true)}
			class="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
		>
			New Separation
		</button>
	</div>
```

Replacement:

```svelte
<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0 flex-1">
			<PageHeader
				title="Separations"
				description="Record resignations and terminations, run clearance, and settle final pay."
			/>
		</div>
		<button
			onclick={() => (showForm = true)}
			class="inline-flex h-9 shrink-0 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			New Separation
		</button>
	</div>
```

This is the one live precedent in the repo for a page laying its own control beside `PageHeader` — `AttendanceHrGrid.svelte:207-210` uses the identical `flex flex-wrap items-start justify-between gap-3` outer + `min-w-0 flex-1` inner shape. N1 Step 8 keeps that shape intact, so the two items do **not** conflict.

The `flex justify-end` wrapper is gone entirely — **N4-AC2**. The `onclick` handler, the label and the `bind:open={showForm}` dialog wiring at line 37 are untouched — **N4-AC3**. `PageHeader` gains no `actions` prop and the `back` snippet is not repurposed — **N4-AC4**, pinned by Step 3's props assertion. `focus-visible:ring-2 focus-visible:ring-ring` is added because the button previously had no focus ring at all and N4-AC5 requires a visible one; this is the repo's standard ring pair (`HelpTip.svelte:14`, the org page's `inputClass`).

Satisfies: **N4-AC1, N4-AC2, N4-AC3, N4-AC4, N4-AC5**.

#### Step 14 — extend `separations.spec.ts`

File: `tests/e2e/separations.spec.ts` — append one `test.describe` block. Assertions in [Test plan](#test-plan). Satisfies **N4-AC1, N4-AC2, N4-AC3, N4-AC5**.

> **Commit 3 here.**

---

### N6 — paging the Employee Assignments table

#### Step 15 — rewrite the load

File: `src/routes/(app)/settings/org/+page.server.ts`

**15a — the import.** Anchor (line 12-13, current):

```ts
import { listSalaryGrades } from '$lib/server/services/settings/master'
import type { Actions, PageServerLoad } from './$types'
```

Replacement:

```ts
import { listSalaryGrades } from '$lib/server/services/settings/master'
import { paginate } from '$lib/server/pagination'
import type { Actions, PageServerLoad } from './$types'
```

**15b — the load body.** Anchor (lines 15-27, current, **verbatim**):

```ts
export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!
	requireAnyCapability(user.roles, 'MANAGE_HR')

	const [positions, orgChart, salaryGrades, employees] = await Promise.all([
		listPositions(user.organizationId),
		getOrgChart(user.organizationId),
		listSalaryGrades(user.organizationId),
		listAssignableEmployees(user.organizationId)
	])

	return { positions, orgChart, salaryGrades, employees }
}
```

Replacement:

```ts
export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user!
	requireAnyCapability(user.roles, 'MANAGE_HR')

	const [positions, orgChart, salaryGrades, allEmployees] = await Promise.all([
		listPositions(user.organizationId),
		getOrgChart(user.organizationId),
		listSalaryGrades(user.organizationId),
		listAssignableEmployees(user.organizationId)
	])

	const empSearch = (url.searchParams.get('empSearch') ?? '').trim()
	const empUnassigned = url.searchParams.get('empUnassigned') === '1'
	const needle = empSearch.toLowerCase()
	const filtered = allEmployees.filter(
		(e) =>
			(!empUnassigned || !e.positionId) &&
			(needle === '' ||
				e.name.toLowerCase().includes(needle) ||
				e.jobTitle.toLowerCase().includes(needle))
	)

	// Sliced here, not in the query: `listAssignableEmployees` is a shared service and giving it
	// skip/take is out of this phase's bounds. This caps what the page RENDERS, not what the
	// load fetches — the query cost is tracked as a backlog item.
	const employeePagination = paginate(url, filtered.length, { param: 'empPage', pageSize: 20 })

	return {
		positions,
		orgChart,
		salaryGrades,
		employees: filtered.slice(
			employeePagination.skip,
			employeePagination.skip + employeePagination.take
		),
		employeeTotal: allEmployees.length,
		employeePagination,
		empSearch,
		empUnassigned
	}
}
```

**Comment sanction (recorded at VALIDATE).** This is the **only** new code comment anywhere in this plan, and the standing rule is no explanatory comments. It is sanctioned explicitly: it states a load-bearing constraint (why the slice is in the load and not in the query) rather than narrating the diff, and it is the repo's own established wording for this exact pattern. EXECUTE may add this one comment and no other.

The four-line comment is **adapted from `separations/+page.server.ts:26-28` / `inventory/+page.server.ts:37-39`**, where this exact fetch-then-slice constraint already needed stating. It is a load-bearing constraint note, not narration, and it is the repo's own established wording for this pattern (SPEC R3 requires the in-memory limitation be stated openly).

The filter predicate is lifted **verbatim** from the client `$derived.by` at `+page.svelte:38-45` — same fields, same `includes`, same `!e.positionId` test — so filtering behaviour is byte-identical, only relocated. `data.positions` is returned whole and unpaged, so the per-row `<select>` still offers every position — **N6-AC7**, and Positions stays out of scope per D3.

Satisfies: **N6-AC1, N6-AC2, N6-AC3, N6-AC4, N6-AC5, N6-AC6, N6-AC7, N6-AC8, N6-AC9**.

#### Step 16 — drop the client filter state

File: `src/routes/(app)/settings/org/+page.svelte`

Anchor (lines 32-46, current, **verbatim**):

```svelte
	// Assignment-wall filters. Client-side only: the load already holds every assignable employee,
	// so filtering here costs no query and keeps the bulk-assign workflow on one screen.
	let search = $state('')
	let onlyUnassigned = $state(false)
	const filteredEmployees = $derived.by(() => {
		const q = search.trim().toLowerCase()
		return data.employees.filter(
			(e) =>
				(!onlyUnassigned || !e.positionId) &&
				(q === '' || e.name.toLowerCase().includes(q) || e.jobTitle.toLowerCase().includes(q))
		)
	})
	const filtering = $derived(search.trim() !== '' || onlyUnassigned)
```

Replacement (the whole block, comment included, is deleted and replaced by one line):

```svelte
	const filtering = $derived(data.empSearch !== '' || data.empUnassigned)
```

The deleted comment is the only comment removed anywhere in this plan, and it is removed because the code it describes is gone and its claim ("client-side only… costs no query") becomes false. That is the "clean up your own mess" case, not a reword. The `assignGuards` comment at lines 25-30 and the `#108` comment at 14 stay untouched.

Add the `Pagination` import beside the existing `Badge` import:

```svelte
	import Pagination from '$lib/components/Pagination.svelte'
```

#### Step 17 — the filter row becomes a GET form

File: `src/routes/(app)/settings/org/+page.svelte`

Anchor (the filter row, current, **verbatim**):

```svelte
		<div class="flex flex-wrap items-center gap-3">
			<div class="min-w-56 flex-1">
				<label for="employee-search" class="sr-only">Search employees</label>
				<input
					id="employee-search"
					type="search"
					bind:value={search}
					placeholder="Search by name or job title"
					class="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</div>
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={onlyUnassigned} class="rounded border-input" />
				Only unassigned
			</label>
			<p class="text-sm text-muted-foreground">
				Showing {filteredEmployees.length} of {data.employees.length} employees
			</p>
		</div>
```

Replacement:

```svelte
		<form
			method="GET"
			data-sveltekit-keepfocus
			class="flex flex-wrap items-center gap-3"
		>
			<div class="min-w-56 flex-1">
				<label for="employee-search" class="sr-only">Search employees</label>
				<input
					id="employee-search"
					type="search"
					name="empSearch"
					value={data.empSearch}
					placeholder="Search by name or job title"
					class="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</div>
			<label class="flex items-center gap-2 text-sm">
				<input
					type="checkbox"
					name="empUnassigned"
					value="1"
					checked={data.empUnassigned}
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
					class="rounded border-input"
				/>
				Only unassigned
			</label>
			<button type="submit" class="h-9 rounded-md border px-3 text-sm hover:bg-accent">
				Filter
			</button>
			<p aria-live="polite" class="text-sm text-muted-foreground">
				Showing {data.employeePagination.total} of {data.employeeTotal} employees
			</p>
		</form>
```

- The form carries **only** `empSearch` and `empUnassigned` — no `empPage` hidden input. That is the whole of **N6-AC5**'s first half (see P-D4).
- `Filter` submit button mirrors `settings/roles/+page.svelte:149-162` exactly; the checkbox auto-submits via `requestSubmit()`, mirroring `AttendanceHrGrid`'s exceptions checkbox.
- `data-sveltekit-keepfocus` keeps focus on the control the user was using across the filter navigation — the filter half of **N6-AC10**.
- `aria-live="polite"` on the count makes the result change announced — the announcement half of **N6-AC10**.
- Counter: `employeePagination.total` is the **filtered** count (N), `employeeTotal` is the **full assignable** count (M) — **N6-AC8**. Unfiltered, `paginate` was given `filtered.length === allEmployees.length`, so N equals M.

#### Step 18 — render one page and the paging control

File: `src/routes/(app)/settings/org/+page.svelte`

Anchor (the each-block opener, current):

```svelte
					{#each filteredEmployees as emp (emp.id)}
						{@const assign = assignGuard(emp.id)}
```

Replacement:

```svelte
					{#each data.employees as emp (emp.id)}
						{@const assign = assignGuard(emp.id)}
```

`{@const}` stays the immediate first child of `{#each}` — the SPEC's explicit `{@const}` trap is not tripped. Everything inside the row, including the `<select>` over `data.positions`, is untouched.

Then, immediately after the closing `</div>` of the assignments table's `overflow-x-auto` wrapper and before the `</section>`, add:

```svelte
			<Pagination meta={data.employeePagination} />
```

`Pagination.svelte:28` renders nothing when `meta.total <= meta.pageSize`, which **is** N6-AC9 — no conditional needed here.

Satisfies: **N6-AC1, N6-AC2, N6-AC4, N6-AC7, N6-AC9**.

#### Step 19 — the N6 load unit test

File: `tests/unit/settings-org-load.test.ts` (NEW). Mirrors `tests/unit/settings-roles-load.test.ts` — `vi.hoisted` + `vi.mock` of `$lib/server/services/settings/org`. Assertions in [Test plan](#test-plan). Satisfies **N6-AC5, N6-AC6, N6-AC8**.

#### Step 20 — the N6 e2e spec

File: `tests/e2e/settings-org-assignments.spec.ts` (NEW). Assertions in [Test plan](#test-plan). Satisfies **N6-AC1…AC5, AC7…AC10**.

#### Step 21 — confirm the e2e seed has more than 20 assignable employees

Read-only check before writing Step 20's assertions: `prisma/seed-e2e.ts` and `prisma/seed-core.ts`. N6-AC1 and N6-AC2 need **more than 20** assignable employees in the `Veent` org, or "table is bounded" and "page 2 and back" are vacuous by construction.

**Confirmed at VALIDATE: the shared seed carries well under 21 assignable employees**, so this is not a maybe — the spec **must** seed its own fixtures. Create them in `test.beforeAll` under a distinct surname prefix (do **not** reuse `Zzpagetest`; pick a non-colliding marker such as `Zzorgtest` so the two specs cannot sweep each other's rows) and delete them in `afterAll`, payroll entries first. This is the pattern that avoids the "fixture residue turns into failures" trap.

**Do not edit `prisma/seed-e2e.ts` or `prisma/seed-core.ts`** — other specs assert against their exact contents.

#### Step 22 — the full gate run

Run the CI gate set in CI order (see [Gates](#gates)). Then run the two negative controls.

> **Commit 4 here.**

---

## Test plan

### `tests/unit/page-header-helptip.test.ts` (NEW)

Full body in Step 3. Five assertions: no standalone `<p>`; exactly one `HelpTip` with the `About {title}` label under `{#if description}`; the `HelpTip` sits inside the `relative` cluster; the props list is unchanged and `actions` is absent; **no call site passes both a description and a badge-`HelpTip`**.

### `tests/e2e/page-header-helptip.spec.ts` (NEW)

Logged in as `USERS.hr` (or `USERS.admin` for `/settings/roles`). Reference page: `/separations` — it passes a `description` and, after N4, sits beside a known button.

| Test name | Assertions |
|---|---|
| `hover reveals` | `/separations`; `const tip = page.getByRole('tooltip')`; before hover `await expect(tip).toHaveCSS('opacity', '0')`; `await page.getByRole('button', { name: 'About Separations' }).hover()`; `await expect(tip).toHaveCSS('opacity', '1')`; `await expect(tip).toContainText('Record resignations and terminations')`. **`toHaveCSS('opacity')`, not `toBeVisible()` — an `opacity-0` element is still "visible" to Playwright, so a visibility assertion here cannot go red.** |
| `focus reveals` | same page; `await page.getByRole('button', { name: 'About Separations' }).focus()`; `await expect(tip).toHaveCSS('opacity', '1')`. Asserted **separately** from hover — hover-only is the exact failure mode the 04-09-26 note warned about. |
| `no standalone description paragraph` | `await expect(page.getByText('Record resignations and terminations', { exact: false })).toHaveCount(1)` — the only occurrence is the tooltip body. |
| `anchoring and overflow at three widths` | for `w` of `1280`, `768`, `375`: `setViewportSize`, focus the `?`, read `tip.boundingBox()` and the `h1`'s box; assert `tip.y >= h1.y + h1.height - 2` (below), `tip.x < h1.x + h1.width && tip.x + tip.width > h1.x` (horizontal overlap), `tip.x >= 0` and `tip.x + tip.width <= w` (no spill). |
| `exactly one description-path help control per page` | **Rewritten at VALIDATE — see the note under this table.** For each row of the expected-count table below: assert `getByRole('button', { name: 'About ' + <that page's h1 text>, exact: true })` has count **1 when the page passes a description, 0 when it does not**; and separately assert the page's **total** `getByRole('button', { name: /^About / })` count equals the recorded figure. |
| `keyboard reach + aria-describedby resolves` | `/separations`; Tab from the `h1` until the `?` has focus; `const id = await tipButton.getAttribute('aria-describedby')`; assert `id` is non-empty; `await expect(page.locator(`#${id}`)).toContainText('Record resignations and terminations')`; assert `toHaveCSS('opacity', '1')` while focused. |
| `complaints detail keeps an identifying title` | seed/read one complaint id; `/complaints/{id}`; assert the `h1` text equals the complaint subject; assert the tooltip body contains `For ` and the employee number. |

#### The N7-AC7 rewrite — what "exactly one `?`" actually means

> **Corrected at VALIDATE.** The first draft asserted `getByRole('button', { name: /^About / })).toHaveCount(1)` on four pages. That assertion **goes red against correct code** on two of them, and it was measuring the wrong thing.

The invariant that matters is not "one `?` on the page". It is **exactly one `?` originating from the description path** — i.e. at most one `PageHeader`-synthesised `About {title}` button. A page may legitimately carry other `HelpTip`s in section toolbars or popovers; those are page-owned and none of N7's business.

Measured expected counts, per page:

| Page | `About {h1}` from the description path | Other `About …` controls on the page | **Total** `/^About /` |
|---|---|---|---|
| `/settings/roles` | **0** — `PageHeader title="Roles & Permissions"` at `:166` passes no description | 1 — the badge `HelpTip` `About roles and permissions` at `:168` | **1** |
| `/leave/balances` | **0** — `PageHeader title="Leave Balances"` at `:31` passes no description | 1 — the badge `HelpTip` `About leave balances` at `:33` | **1** |
| `/attendance` | **1** — `About Attendance`, from the description at `AttendanceHrGrid.svelte:209` | 1 — `About team attendance` at `TeamMatrix.svelte:75`, rendered via the `toolbar` snippet passed to `<Container>` at `:111` on the matrix view | **2** |
| `/dashboard` | **0** — `PageHeader title="Dashboard"` at `:138` passes neither description nor badge | 0 — the popover `HelpTip` at `:253` is behind `{#if openPanel === 'regularizations'}` at `:245` and is **not in the DOM** while the panel is closed | **0** |

Two `?` on `/attendance` — one on the title row, one on the section toolbar — is **correct behaviour**, not a defect. They describe different things and sit in different places.

The test asserts both columns: the description-path count (the invariant N7 owns) and the total (a canary that catches an unexpected new `HelpTip` appearing). `/dashboard` is kept in the table precisely because its expected description-path count is 0 — it proves the assertion is capable of distinguishing 0 from 1.

**This rewritten test can still fail.** Two mutations red it, either of which may be used as the recorded check:
- Drop the `{#if description}` guard in Step 2 so the `HelpTip` always renders → `/settings/roles`, `/leave/balances` and `/dashboard` each gain an `About {title}` button and their description-path assertions go from 0 to 1.
  Expected: `expect(locator).toHaveCount(0) — Expected: 0, Received: 1`.
- Add a `description` to `<PageHeader title="Dashboard" />` at `dashboard/+page.svelte:138` → `/dashboard`'s total goes 0 → 1.

#### N7-AC8 — contrast probe (Agent-Probe)

No automated contrast gate exists in this repo. Procedure, recorded in the phase report with numbers:

1. In a Playwright script, open a page with a description, focus the `?`.
2. For the `?` button text and the tooltip text, walk `elementFromPoint` ancestors accumulating `background-color` until an opaque layer is reached, **compositing** each `rgba` over the next. An uncomposited read against `bg-card` returns a meaningless ratio.
3. Compute WCAG contrast for both elements against the composited background.
4. Repeat with the dark theme applied (toggle via `localStorage` + the theme class, per the repo's screenshot recipe).
5. Record four numbers. Floor: **4.5:1** for the tooltip body text, **3:1** for the `?` glyph (it is a bordered control).

`tests/unit/theme-token-contrast.test.ts` already exists and may cover the token pair statically — read it first; if it does, cite it and record only the composited deltas.

### `tests/e2e/attendance-view-switch.spec.ts` (NEW)

Logged in as `USERS.hr` (has `canManage`, so `AttendanceHrGrid` renders).

| Test name | Assertions |
|---|---|
| `switch shows two states` | `/attendance`; `getByRole('link', { name: 'Whole team', exact: true })` count 1; `'By employee'` count 1; **`getByRole('link', { name: 'Team day' })` count 0**. |
| `flip to per day in one click` | `/attendance?view=matrix`; `const flip = page.getByRole('link', { name: 'Show one day' })`; count 1; `await flip.click()`; `await expect(page).toHaveURL(/view=team/)`. |
| `flip round trip` | continue: `getByRole('link', { name: 'Show the week grid' })` count 1, click, `toHaveURL(/view=matrix/)`. Two clicks total, ends where it started. |
| `Whole team lands on the grid` | `/attendance?view=employee`; assert the flip link has count 0 there; click `Whole team`; `toHaveURL(/view=matrix/)`. |
| `url contract unchanged` | direct `goto` to `?view=matrix`, `?view=team&date=<seeded>`, `?view=employee&employeeId=<id>&from=&to=`; each renders its own marker (matrix grid header row / the `Day` label / the `Employee` select). |
| `per day controls are one row` | `?view=team`; `const day = page.getByLabel('Day')`, `const bulk = page.getByRole('button', { name: 'Lock day' })`; boxes: `Math.abs((d.y + d.height/2) - (b.y + b.height/2)) <= 24` **and** `d.x > b.x + b.width`. Also `await expect(page.locator('.border-t').filter({ has: page.getByRole('button', { name: 'Lock day' }) })).toHaveCount(0)`. Both clauses together — vertical alignment alone can be satisfied by two overlapping elements (SPEC R8). |
| `employee view controls untouched` | `?view=employee&employeeId=<id>`; `getByLabel('Employee')`, `getByLabel('From')`, `getByLabel('To')` each visible; `getByText('Quick pick:')` visible; `getByText(/Range is capped at/)` visible. |
| `keyboard order and names` | focus the `h1`; press `Tab` three times; assert the focused element's accessible name is `Whole team`, then `By employee`, then `Show one day`; assert the flip link's `aria-label` is non-empty; assert its computed `outline`/`box-shadow` changes under `:focus-visible`. Theme-pair confirmation of the ring is the owner's (Hybrid). |

### `tests/e2e/employee-view-only.spec.ts` (CORRECTED)

Line 170 replaced per Step 11.

### `tests/e2e/separations.spec.ts` (EXTENDED)

Appended `test.describe('Separations title row (N4)')`, logged in as `USERS.hr`:

| Test name | Assertions |
|---|---|
| `action sits on the title row` | `const h = page.getByRole('heading', { name: 'Separations', level: 1 })`, `const b = page.getByRole('button', { name: 'New Separation' })`; boxes: mid-points within 24 px **and** `b.x > h.x + h.width`. |
| `no standalone action row` | `await expect(page.locator('div.flex.justify-end').filter({ has: page.getByRole('button', { name: 'New Separation' }) })).toHaveCount(0)`. |
| `title row a11y` | `getByRole('button', { name: 'New Separation' })` count 1 and enabled; `page.locator('h1')` count 1; `await b.focus()` then assert a non-`none` focus outline/ring. |
| `the button still opens the create dialog` | `await page.getByRole('button', { name: 'New Separation' }).click()`; assert the create dialog is open — `await expect(page.getByRole('dialog')).toBeVisible()` and its Employee field resolves (`getByLabel('Employee')`). Close without submitting. |

**N4-AC3, corrected at VALIDATE.** The first draft leaned on "every existing assertion in `separations.spec.ts` passes". That proves nothing about this change: **`grep -c "New Separation" tests/e2e/separations.spec.ts` returns 0.** The existing spec asserts the `h1`, the 403 gate, and drives finalize/undo from DB fixtures — it never touches the button or the dialog. Moving the button could break the create flow outright and the whole file would still be green.

So N4-AC3 is proved by the **new** `the button still opens the create dialog` test, with the existing spec's continued pass as a regression check rather than as the proof. Run `bun run test:e2e -- separations` and record before/after counts for both roles.

### `tests/unit/settings-org-load.test.ts` (NEW)

Mirrors `settings-roles-load.test.ts`: `vi.hoisted` + `vi.mock('$lib/server/services/settings/org', ...)` stubbing `listPositions`, `getOrgChart`, `listAssignableEmployees`, `assignEmployeePosition`, plus `vi.mock` of `$lib/server/services/settings/master` for `listSalaryGrades`. Call shape:

```ts
const load = (query: string) =>
	org.load({
		locals: { user: { id: 'actor', organizationId: 'org1', roles: ['SUPER_ADMIN'] } },
		url: new URL(`http://localhost/settings/org${query}`)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any)
```

| Test | Assertion |
|---|---|
| `pages at 20 and uses its own param` | 45 mocked employees; `load('')` → `employees` length 20, `employeePagination.param === 'empPage'`, `employeePagination.totalPages === 3`. |
| `the assignments param is not the generic page param` | `employeePagination.param` **not** `'page'`; and `load('?page=3')` returns page 1. This is **N6-AC6** as a literal-string assertion, so a future Positions `page` param provably cannot collide. |
| `filters before it pages` | `?empUnassigned=1` with 45 employees of which 25 are unassigned → `employeePagination.total === 25`, `employeeTotal === 45`, every returned row has a falsy `positionId`. |
| `search matches name or job title` | `?empSearch=welder` matches both a name hit and a `jobTitle` hit; `employeePagination.total` equals the mocked match count. |
| `counter inputs` | unfiltered: `employeePagination.total === employeeTotal` — **N6-AC8**. |
| `a filter with no page param starts at page 1` | `?empSearch=x` (no `empPage`) → `employeePagination.page === 1` — **N6-AC5**. |
| `out-of-range page clamps` | `?empPage=99` → `page === totalPages`, non-empty slice. |
| `positions are returned whole` | `positions` length equals the mocked catalog length, unpaged — **N6-AC7** (server half). |

### `tests/e2e/settings-org-assignments.spec.ts` (NEW)

Logged in as `USERS.admin` (`MANAGE_HR` + settings access). Precondition from Step 21: **> 20 assignable employees** in the org, created by the spec itself.

**Two anti-flake requirements, added at VALIDATE. Both are mandatory.**

1. **Serial mode.** The spec's first statement must be `test.describe.configure({ mode: 'serial' })`. `playwright.config.ts` sets `fullyParallel: true`, and `tests/e2e/pagination.spec.ts:13-14` seeds **25 `Zzpagetest` employees into the same Veent org**, with deliberately *best-effort* cleanup at `:67-79` ("Leftovers are swept by `scripts/clean-e2e-employees.ts` rather than failing teardown"). Under a parallel run, the assignable-employee population of the org changes underneath this spec mid-test.
2. **Read M from the page, never from a fixture constant.** `counter tells the truth` must parse `Showing N of M` and assert the *relationship* — unfiltered `N === M`; filtered `N` equals the number of rows summed across pages; `M` unchanged across a filter change — rather than comparing `M` to a hard-coded seed count. Any assertion of the form `expect(M).toBe(25)` is flaky by construction here and must not be written.

`pagination.spec.ts` is the working precedent for **both** halves: it already declares `test.describe.configure({ mode: 'serial' })` at `:10` and seeds its own `SURNAME = 'Zzpagetest'` / `COUNT = 25` fixtures in `beforeAll` rather than depending on the shared seed. Follow its shape, including the `afterAll` ordering note — **delete `payrollEntry` rows before `employee` rows**, because that FK is `RESTRICT` and a concurrent payroll compute will have attached entries to any ACTIVE fixture employee.

| Test name | Assertions |
|---|---|
| `table is bounded` | `/settings/org`; assignments `tbody tr` count `<= 20`; `getByRole('navigation', { name: 'Pagination' })` visible. |
| `page 2 and back` | collect page-1 employee-name cell texts; go `?empPage=2`; collect page-2 names; assert the two sets are disjoint; return to page 1 and assert the original set. |
| `filters survive reload` | type `welder` + `Filter`; assert `page.url()` contains `empSearch=welder`; `page.reload()`; assert the same row set and the same page. |
| `filter applies across pages` | tick `Only unassigned`; walk **every** page via `Next →` until it is disabled; on each page assert every Position `<select>` has value `''`. This is the assertion that catches "filtered only the current page". |
| `filter resets page, paging keeps filter` | go `?empPage=2`; tick `Only unassigned`; assert the URL has **no** `empPage` (or `empPage=1`) and `empUnassigned=1`; then click `Next →` and assert the URL still carries `empUnassigned=1`. |
| `counter tells the truth` | unfiltered: parse `Showing N of M`, assert `N === M` and `M === ` the full assignable count; filtered: assert `N` equals the number of rows the filter matches (walk pages and sum) and `M` is unchanged. |
| `no control when it fits` | apply a search matching < 20 employees; assert `getByRole('navigation', { name: 'Pagination' })` count 0. |
| `assign from a row still works` | on page 1, read a row's `<select>` option count and assert it equals the full `Positions` catalog row count (including a position that would fall off any hypothetical Positions page); select a different position; click `Save`; assert the row's select shows the new value after the action settles. |
| `filters and paging a11y` | `getByLabel('Search employees')` resolves; the `Only unassigned` checkbox is reachable and toggles by `Space`; every pagination link has a non-empty accessible name; after submitting the filter, `document.activeElement` is **not** `BODY`. See the AC10 hole below for the page-change clause. |

---

## Negative controls

Two are mandatory. A guard that cannot go red is not a guard.

### Negative control 1 — A1 / N1-AC9

**Mutation.** `src/routes/(app)/attendance/+page.svelte:19`:

```svelte
{#if data.canManage}
```
→
```svelte
{#if true}
```

This renders `AttendanceHrGrid` — and therefore the `Whole team` link and the `Show one day` flip link — for the employee-role user the spec logs in as.

**Command.** `bun run test:e2e -- employee-view-only`

**Expected failure.** The test `employee sees only their own attendance, with no correction controls` must go **red**. Any of these is an acceptable red — record which one occurred:

- the likely one: `expect(locator).toHaveCount(0) — Expected: 0, Received: 1` on `getByRole('link', { name: 'Whole team', exact: true })`, which is the first of the two corrected assertions to run;
- the same failure on `getByRole('link', { name: 'Show one day', exact: true })`;
- an earlier failure in the same test — including a **render or load error**. `AttendanceHrGrid` is built for the `canManage` persona and reads fields the employee-scoped load may not populate, so forcing it to render for an employee can throw before any assertion is reached.

What is **not** acceptable is a green run. A green run means the corrected assertions are still vacuous and Step 11 has to be redone. Do not over-specify the message when recording — record the actual failure text.

**Revert.** `git checkout -- "src/routes/(app)/attendance/+page.svelte"` — **only** after confirming the file has no other uncommitted change (the repo has been burned by `git checkout <file>` reverting live work). Safest: make the mutation **after** Commit 2 is in, so the revert target is a committed state.

**Why it proves something the old line did not.** `'Whole team (day)'` exists nowhere in `src/`, so the old assertion returned 0 under every possible application state, mutated or not. The new strings are real, rendered labels.

### Negative control 2 — N7 focus-reveal

**Mutation.** `src/lib/components/ui/HelpTip.svelte:21` — delete `group-focus-within:opacity-100` from the tooltip span's class list, leaving `group-hover:opacity-100`.

**Command.** `bun run test:e2e -- page-header-helptip`

**Expected failure, exactly.** Two tests go red:
- `focus reveals`: `expect(locator).toHaveCSS('opacity', '1') — Received: "0"`.
- `keyboard reach + aria-describedby resolves`: same assertion, same message, on the focused-opacity clause.

The `hover reveals` test must stay **green** — that is what proves the two paths are independently covered and that the spec is not passing on hover alone.

**Revert.** `git checkout -- src/lib/components/ui/HelpTip.svelte`, again only from a committed clean state.

**Why `toHaveCSS`, not `toBeVisible`.** Playwright treats an `opacity: 0` element as visible (opacity is not a visibility signal for it). A `toBeVisible()` assertion here would stay green through this mutation — i.e. it would be a second vacuous assertion of exactly the kind A1 exists to correct.

---

## Gates

Run after **each** commit, in CI order, stopping at the first failure. Exact strings:

```bash
bun install --frozen-lockfile
bunx prisma generate
bun run format:check
bun run lint
bun run check
bun run test
```

Then the e2e job (the owner's DB must be up; **do not** start it yourself):

```bash
bunx prisma db push --skip-generate
bunx tsx prisma/seed-e2e.ts
bunx playwright install --with-deps chromium
bun run test:e2e
```

Targeted runs while iterating (faster, and what each commit's own gate needs):

```bash
bun run test -- page-header-helptip
bun run test -- settings-org-load
bun run test:e2e -- page-header-helptip
bun run test:e2e -- attendance-view-switch
bun run test:e2e -- employee-view-only
bun run test:e2e -- separations
bun run test:e2e -- settings-org-assignments
```

Diff-scope gate for **N7-AC4**, run before Commit 1:

```bash
git diff --cached --name-only
```
Expected, exactly three lines: `src/lib/components/ui/PageHeader.svelte`, `tests/unit/page-header-helptip.test.ts`, `tests/e2e/page-header-helptip.spec.ts`. Any fourth path means a call site was edited and D1 is broken.

Hard-constraint gate, run before **every** commit:

```bash
git diff --cached --name-only | grep -E 'src/lib/rbac\.ts|prisma/schema\.prisma|src/lib/server/services/' && echo VIOLATION
```
Must print nothing.

**`bun run test:e2e` baseline.** Record the pass/fail/skip counts on `feat/uiux-phase-7` **before** Commit 1. The suite is documented as flaky (#287); a post-change number is only meaningful against a recorded pre-change number.

---

## Commit plan

One commit per finished unit. Stage **exact paths** — never `git add -A` (agents may be running).

**Commit 1 — N7**

```
git add src/lib/components/ui/PageHeader.svelte tests/unit/page-header-helptip.test.ts tests/e2e/page-header-helptip.spec.ts
```

```
feat(ui): move every page description behind a ? tooltip

PageHeader printed a grey sentence under the title on 33 call sites across
30 files, costing a line of vertical space on every page. It now renders the
same string as a HelpTip beside the title, revealed on hover and on keyboard
focus, with aria-describedby resolving whether or not the tooltip is shown.

The prop name is kept, so no call site is edited and no page's text is
rewritten. The HelpTip is placed inside the relative div in the title cluster
because that div is its only positioned ancestor — HelpTip's own wrapper is
not relative, so rendering the control anywhere else mis-anchors the tooltip
with no compile error.

No page today passes both a description and a badge HelpTip: the two pages
that carry a badge HelpTip pass no description, and the three that pass both
a description and a badge carry a status pill, not a second ?. A source
assertion scoped to the PageHeader opening tag now pins that invariant, so a
future page that would render two ? fails the unit gate instead of shipping.

Other HelpTips on a page are untouched and are not this component's business:
/attendance legitimately shows two, one on the title row and one on the
matrix section toolbar.
```

**Commit 2 — N1**

```
git add src/lib/components/attendance/AttendanceHrGrid.svelte tests/e2e/attendance-view-switch.spec.ts tests/e2e/employee-view-only.spec.ts
```

```
feat(attendance): two-state view switch with a one-click layout flip

Three buttons named Whole team, Team day and By employee made the reader
click each one to learn what it showed, and "Team" carried no signal in two
of the three. The switch is now two states — Whole team and By employee —
with a single icon link beside it that flips between the week grid and the
single-day list while Whole team is active. Its accessible name states the
destination in both directions. Arriving from By employee lands on the grid.

The ?view= values are unchanged, so every saved link still opens what it
opened before.

On the single-day view the controls box drops from two rows to one: the bulk
action buttons move up into the row the Day picker vacated, the Day picker
sits at the right edge, and the divider between the old rows goes with them.
The By employee form keeps its two-row shape — it genuinely fills them.

employee-view-only.spec.ts asserted that a link named "Whole team (day)" was
absent. That string existed nowhere in src/, so the assertion could not fail.
It now asserts the labels that exist, and a negative control confirms it goes
red when the canManage guard is removed.
```

**Commit 3 — N4**

```
git add "src/routes/(app)/separations/+page.svelte" tests/e2e/separations.spec.ts
```

```
fix(separations): put New Separation on the title row

The page's only action sat alone on a full-width row under the header,
spending a screen row on one button. It now sits beside the Separations
title, which is what the PageHeader title-row rule already prescribes for a
page with no Back link. The page lays the button out itself, beside the
component — PageHeader still takes no actions prop.

The button also gains the standard focus ring; it had none.
```

**Commit 4 — N6**

```
git add "src/routes/(app)/settings/org/+page.server.ts" "src/routes/(app)/settings/org/+page.svelte" tests/unit/settings-org-load.test.ts tests/e2e/settings-org-assignments.spec.ts
```

```
feat(settings/org): page the Employee Assignments table

The table rendered every assignable employee at once, so a large tenant got
one very long page. The load now reads the search and only-unassigned filters
from the address, filters, and slices to 20 rows under its own empPage param
— distinct from the generic page param so a future Positions table cannot
collide with it.

Moving the filters into the address is what makes paging and filtering agree:
page 2 can no longer show a row the filter excluded. A filter change emits no
page param and so returns to page 1; the paging links copy the current search
params and so preserve the filters.

This bounds what the page renders, not what the load fetches.
listAssignableEmployees still returns every row, and giving it skip/take needs
a service signature change that is out of bounds here. The query cost stays
tracked as a backlog item.

The Positions catalog is untouched and the per-row dropdown still lists every
position, so assignment is unaffected.
```

None of the four messages carries a `Co-Authored-By` trailer or any AI attribution, per the repo rule.

---

## Execute lane split

**Answer: partly sequential. N7 runs alone first; N1, N4 and N6 may then run concurrently.**

File ownership is genuinely disjoint:

| Lane | Owns (exclusive write) |
|---|---|
| **N7** | `src/lib/components/ui/PageHeader.svelte`, `tests/unit/page-header-helptip.test.ts`, `tests/e2e/page-header-helptip.spec.ts` |
| **N1** | `src/lib/components/attendance/AttendanceHrGrid.svelte`, `tests/e2e/attendance-view-switch.spec.ts`, `tests/e2e/employee-view-only.spec.ts` |
| **N4** | `src/routes/(app)/separations/+page.svelte`, `tests/e2e/separations.spec.ts` |
| **N6** | `src/routes/(app)/settings/org/+page.server.ts`, `src/routes/(app)/settings/org/+page.svelte`, `tests/unit/settings-org-load.test.ts`, `tests/e2e/settings-org-assignments.spec.ts` |

So why is N7 still first and alone?

1. **Geometry coupling.** N7 deletes a `<p>` from the shared title treatment, moving everything below it up. N1-AC6 and N4-AC1 are bounding-box assertions in that exact region. Run concurrently, a lane would be measuring a layout that the other lane is about to change, and a green N4 box assertion could flip red on merge with no N4 change involved.
2. **Shared render surface.** N1 and N4 both render `PageHeader`. N1 Step 8 keeps `AttendanceHrGrid.svelte:207-210`'s `flex … justify-between` + `min-w-0 flex-1` shape, and N4 Step 13 copies that same shape — if N7 were in flight underneath both, the two lanes would be reasoning about different versions of the component.
3. **One build, one suite.** `playwright.config.ts` builds and serves one app (`reuseExistingServer: false`). Concurrent lanes on one branch share that build, so a mid-flight `PageHeader` makes every lane's e2e run untrustworthy.

Recommended execution:

```
  ┌──────────────┐
  │  N7 (alone)  │  commit 1, gates green, e2e baseline re-recorded
  └──────┬───────┘
         │
    ┌────┴────┬──────────┐
    ▼         ▼          ▼
 ┌──────┐ ┌──────┐  ┌───────┐    concurrent — disjoint files, disjoint specs
 │  N1  │ │  N4  │  │  N6   │
 └──┬───┘ └──┬───┘  └───┬───┘
    └────────┴──────────┘
             ▼
   commits 2,3,4 + full CI gate set
```

**One coupling the table does not show (found at VALIDATE).** N7's own spec, `tests/e2e/page-header-helptip.spec.ts`, uses **`/separations`** as its reference page and asserts its title-row geometry at three widths. `/separations` is N4's surface, and Step 13 wraps its `PageHeader` in `min-w-0 flex-1`, which narrows the title cluster the tooltip anchors to. So N4 can move N7's assertions even though the two lanes share no file.

Mitigation, and it is the only one: **the full `bun run test:e2e` after Commit 4 is the gate that catches this**, not any per-lane run. A lane-local green on `page-header-helptip` before N4 lands does not carry. If the anchoring assertions prove brittle under the narrower cluster, re-point that spec at a page with no title-row action — `/inventory` and `/complaints` both pass a description and carry no title-row control.

If the concurrent lanes run as parallel subagents: each owns its table row above and **writes nothing outside it**. Negative control 1 mutates `attendance/+page.svelte`, which is outside every lane's ownership — that mutation must run **after** N1 is committed, by whoever runs the gates, never inside a live lane. The owner's visual sign-off on N4 happens after N7 lands (SPEC sequencing note).

---

## Rollback

| Item | Revert | Blast radius of the revert | Anything that does not come back |
|---|---|---|---|
| **N7** | `git revert <commit 1>` | `PageHeader.svelte` + 2 new test files. Every page reverts to the grey `<p>` in one step. | Nothing. No call site was edited, so nothing else has to unwind. This is the cleanest of the four. |
| **N1** | `git revert <commit 2>` | `AttendanceHrGrid.svelte` + 2 specs. The three-state switch and the two-row per-day card come back. | The corrected `employee-view-only.spec.ts:170` reverts to the vacuous assertion with it. If the owner rejects N1 but wants A1 kept, revert the commit then re-apply Step 11 alone as a follow-up commit. |
| **N4** | `git revert <commit 3>` | `separations/+page.svelte` + `separations.spec.ts`. | The focus ring added in Step 13 goes with it — an accessibility regression relative to the reverted state, so re-add it as a one-line follow-up if N4 is rejected. |
| **N6** | `git revert <commit 4>` | 2 source + 2 test files. The client `$derived.by` filter and the unbounded table come back. | Any address a user bookmarked with `empSearch` / `empUnassigned` / `empPage` stops filtering — the params become inert again. No data, no permission and no saved state is involved, so there is nothing to migrate back. |

Nothing here writes to the database, changes a schema, or touches a permission, so every revert is a pure code revert. No commit is pushed by this plan (push only on the owner's word), so a pre-push reset is also available.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `bun run test -- page-header-helptip` › no standalone `<p>`, tooltip carries the string | Fully-Automated | N7-AC1 |
| `bun run test -- page-header-helptip` › one `HelpTip`, `About {title}` label | Fully-Automated | N7-AC2 |
| `bun run test -- page-header-helptip` › guarded by `{#if description}` | Fully-Automated | N7-AC3 |
| `bun run test -- page-header-helptip` › props unchanged + `git diff --cached --name-only` is 3 lines + `bun run check` | Fully-Automated | N7-AC4, N4-AC4 |
| `bun run test -- page-header-helptip` › no call site passes description + badge-HelpTip | Fully-Automated | N7-AC7 (invariant half) |
| e2e `page-header-helptip` › `hover reveals` / `focus reveals` | Fully-Automated | N7-AC5 |
| e2e `page-header-helptip` › `anchoring and overflow at three widths` | Fully-Automated | N7-AC6 |
| e2e `page-header-helptip` › `exactly one description-path help control per page` (4-page expected-count table) | Fully-Automated | N7-AC7 |
| Composited contrast probe, both themes, numbers in the phase report | Agent-Probe | N7-AC8 |
| e2e `page-header-helptip` › `keyboard reach + aria-describedby resolves` **+ Negative control 2** | Fully-Automated | N7-AC9 |
| e2e `page-header-helptip` › `complaints detail keeps an identifying title` | Fully-Automated | N7-AC10 |
| e2e `attendance-view-switch` › `switch shows two states` | Fully-Automated | N1-AC1 |
| e2e `attendance-view-switch` › `flip to per day in one click` | Fully-Automated | N1-AC2 |
| e2e `attendance-view-switch` › `flip round trip` | Fully-Automated | N1-AC3 |
| e2e `attendance-view-switch` › `Whole team lands on the grid` | Fully-Automated | N1-AC4 |
| e2e `attendance-view-switch` › `url contract unchanged` | Fully-Automated | N1-AC5 |
| e2e `attendance-view-switch` › `per day controls are one row` (alignment **and** separation) | Fully-Automated | N1-AC6 |
| e2e `attendance-view-switch` › `employee view controls untouched` | Fully-Automated | N1-AC7 |
| e2e `attendance-view-switch` › `keyboard order and names` + owner theme-pair focus-ring check | Hybrid | N1-AC8 |
| corrected `employee-view-only.spec.ts:170` **+ Negative control 1** | Fully-Automated | N1-AC9 |
| e2e `separations` › `action sits on the title row` | Fully-Automated | N4-AC1 |
| e2e `separations` › `no standalone action row` | Fully-Automated | N4-AC2 |
| full existing `separations.spec.ts` green, before/after counts recorded | Fully-Automated | N4-AC3 |
| e2e `separations` › `title row a11y` + owner theme-pair focus-ring check | Hybrid | N4-AC5 |
| e2e `settings-org-assignments` › `table is bounded` | Fully-Automated | N6-AC1 |
| e2e `settings-org-assignments` › `page 2 and back` | Fully-Automated | N6-AC2 |
| e2e `settings-org-assignments` › `filters survive reload` | Fully-Automated | N6-AC3 |
| e2e `settings-org-assignments` › `filter applies across pages` (walks every page) | Fully-Automated | N6-AC4 |
| e2e `settings-org-assignments` › `filter resets page, paging keeps filter` + unit `a filter with no page param starts at page 1` | Fully-Automated | N6-AC5 |
| unit `settings-org-load` › `the assignments param is not the generic page param` | Fully-Automated | N6-AC6 |
| e2e `settings-org-assignments` › `assign from a row still works` + unit `positions are returned whole` | Fully-Automated | N6-AC7 |
| e2e `settings-org-assignments` › `counter tells the truth` + unit `counter inputs` | Fully-Automated | N6-AC8 |
| e2e `settings-org-assignments` › `no control when it fits` | Fully-Automated | N6-AC9 |
| e2e `settings-org-assignments` › `filters and paging a11y` + owner screen-reader listen | Hybrid | N6-AC10 (labels, roles, link names, announcement, focus-after-filter) |
| — page-change focus clause only | **DEFERRED by owner decision** → backlog note | N6-AC10 (one clause) |
| e2e `separations` › `the button still opens the create dialog` | Fully-Automated | N4-AC3 |

No criterion is proved by Known-Gap. Every in-scope criterion has a Fully-Automated, Hybrid or Agent-Probe gate. One clause of one criterion (N6-AC10's page-change focus) is **deferred by owner decision** and handed to a named backlog note — a recorded residual, not a silent pass.

### N6-AC10 — deferred by owner decision

> **Owner decision, taken at VALIDATE: the page-change focus clause is OUT of this lane and is filed as its own backlog note.** It is not to be added back. The rest of N6-AC10 — labels, keyboard operability, pagination link names, the announcement, and focus after a *filter* change — stays in scope and is covered.

**The clause that is out:** *"Focus is not lost to `<body>` after a filter or a page change."*

- The **filter** half is satisfied — Step 17 adds `data-sveltekit-keepfocus` to the GET form, so SvelteKit keeps focus on the control the user was using across that navigation. The e2e asserts `document.activeElement !== BODY` after a filter submit.
- The **page change** half is not, and **the owner has taken it out of this lane.** Paging goes through `Pagination.svelte`'s `<a>` elements; on navigation SvelteKit resets focus to `<body>` by default. Fixing it means editing **`Pagination.svelte`, which is imported by 19 files across 16 routes** (15 route pages plus `/attendance` via `AttendanceHrGrid.svelte`, `AttendanceSelfView.svelte` and `TeamMatrix.svelte`; `TimesheetListTab.svelte` is the fourth shared importer). None of those is in this plan's blast radius.
- **And `data-sveltekit-keepfocus` on those links would not finish the job anyway.** On page 1 the `← Previous` control is a `<span>`, not an anchor (`Pagination.svelte:40`), and on the last page `Next →` is likewise a `<span>` (`:55`). There is no element to keep focus on at either end of the range, so the boundary cases need a different fix — a roving focus target or an `aria-live` region — which is a design question, not a one-attribute change. Recording this matters: a future reader must not assume the backlog note describes a one-line fix.

**Status:** N6-AC10 is **covered except the page-change focus clause**, which is **DEFERRED by owner decision** with a backlog note. It is not a silent gap and it is not a Known-Gap standing in for a proving strategy — the in-scope clauses all have a Fully-Automated or Hybrid gate. The deferred clause is a recorded residual owned by a separate artifact.

The `data-sveltekit-keepfocus` attribute on the **filter form** (Step 17) stays in this lane: it is page-local, inside the blast radius, and covers the filter half at the cost of one attribute. Only the shared-`Pagination.svelte` edit is deferred.

**Backlog note required at EXECUTE time** (write it, do not skip it — it is the artifact the owner's decision hands the clause off to):
`process/features/ui-ux-overhaul/backlog/pagination-focus-after-page-change_NOTE_18-09-26.md` — records that `Pagination.svelte` drops focus to `<body>` on every page change across every paginated route, names `data-sveltekit-keepfocus` on its two `<a>` elements as a **partial** candidate fix, records that the fix is **incomplete on its own** because `← Previous` on page 1 (`:40`) and `Next →` on the last page (`:55`) are `<span>`s with no anchor to keep focus on, and notes that the change is app-wide — `Pagination.svelte` is imported by **19 files across 16 routes** — so it alters focus behaviour everywhere at once and needs its own review.

**Decision status: TAKEN.** The owner chose to ship N6 with the filter half only and file the app-wide `Pagination.svelte` focus behaviour as its own backlog note. No option remains open here; do not re-ask (standing rule: a parked decision is filed once, not re-raised).

---

## Test Infra Improvement Notes

- **No component-test harness exists.** `vitest.config.ts` runs `environment: 'node'` over `tests/unit/**` only; `jsdom`/`happy-dom` are not installed; `@testing-library/svelte@5.2.0` is a devDependency with **zero importers** in the repo. Every "unit test on a component" in this repo is therefore a source assertion. `settings-roles-load.test.ts` says so in its own header comment: *"no component harness exists in this repo."* This plan follows that pattern rather than introducing jsdom for three assertions. If component tests are wanted later, the change is: add `jsdom`, set `environmentMatchGlobs` (or per-file `// @vitest-environment jsdom` docblocks) so the 230 existing node-env files are unaffected, and widen `include`. **Not in this lane's scope.**
- **`@testing-library/svelte` is an unused devDependency.** Flagged, not removed (surgical changes; it is pre-existing).
- **`/settings/org` had zero test coverage of any kind** before this plan — no e2e, no unit. Step 19 and Step 20 are its first.
- **The e2e seed's assignable-employee count is unverified against N6's 20-row page size** (Step 21). If the spec has to create its own rows, that is a durable gap worth a seed change later — but not one made from inside this lane, because other specs depend on the seed's exact contents.
- **No automated contrast gate exists**, which is why N7-AC8 is an Agent-Probe. `tests/unit/theme-token-contrast.test.ts` covers token pairs statically but cannot see a composited background.
- **`bun run test:e2e` is documented flaky (#287).** Always record a pre-change baseline; a post-change count alone proves nothing.

---

## Acceptance Criteria

The 34 acceptance criteria are owned by the SPEC and are not restated here. They are reproduced verbatim in `owner-click-pass-build-lane_SPEC_18-09-26.md` §N1/§N4/§N6/§N7, and every one is mapped to its step and its proving test in [Traceability](#traceability) below. The plan adds no criterion of its own.

## Phase Completion Rules

This lane is a single phase with four committable units. It may be marked:

- **CODE DONE** when Commits 1–4 exist and every gate in [Gates](#gates) is green in CI order, including a full `bun run test:e2e` measured against the recorded pre-change baseline.
- **VERIFIED** only when, in addition: both negative controls in [Negative controls](#negative-controls) have been run and recorded as going **red** on mutation and green on revert; the N7-AC8 contrast probe numbers are recorded in the phase report for both themes; the owner has confirmed the three Hybrid focus-ring/screen-reader clauses (N1-AC8, N4-AC5, N6-AC10) on a live page in light and dark; and the N6-AC10 backlog note exists at `process/features/ui-ux-overhaul/backlog/pagination-focus-after-page-change_NOTE_18-09-26.md`.
- It may **not** be marked VERIFIED while that backlog note is unwritten. A green suite with the note missing is the vacuous-green case this repo has been burned by; the deferred clause must be recorded, not dropped.
- It may **not** be marked VERIFIED on the strength of the existing `separations.spec.ts` alone for N4-AC3 — that file contains no `New Separation` match and cannot prove the create flow survived the move.
- A commit whose `git diff --cached --name-only` contains `src/lib/rbac.ts`, `prisma/schema.prisma`, or any `src/lib/server/services/` path is a **phase failure**, not a deviation. Stop and re-plan.

## Traceability

All 34 acceptance criteria. Every criterion has at least one step and at least one proving test.

| Criterion | Step(s) | Proving test | Status |
|---|---|---|---|
| N1-AC1 | 8 | e2e `attendance-view-switch` › `switch shows two states` | covered |
| N1-AC2 | 8 | e2e › `flip to per day in one click` | covered |
| N1-AC3 | 8 | e2e › `flip round trip` | covered |
| N1-AC4 | 8 | e2e › `Whole team lands on the grid` | covered |
| N1-AC5 | 8 | e2e › `url contract unchanged` | covered |
| N1-AC6 | 9a, 9b | e2e › `per day controls are one row` | covered |
| N1-AC7 | 9a | e2e › `employee view controls untouched` | covered |
| N1-AC8 | 8 | e2e › `keyboard order and names` + owner theme check | covered (Hybrid) |
| N1-AC9 | 11, 12 | corrected `employee-view-only.spec.ts` + **Negative control 1** | covered |
| N4-AC1 | 13 | e2e `separations` › `action sits on the title row` | covered |
| N4-AC2 | 13 | e2e › `no standalone action row` | covered |
| N4-AC3 | 13, 14 | e2e › `the button still opens the create dialog` (**the proof**) + full existing `separations.spec.ts` (regression) | covered |
| N4-AC4 | 13, 3 | unit `page-header-helptip` › props unchanged, no `actions` | covered |
| N4-AC5 | 13 | e2e › `title row a11y` + owner theme check | covered (Hybrid) |
| N6-AC1 | 15, 18 | e2e `settings-org-assignments` › `table is bounded` | covered |
| N6-AC2 | 15, 18 | e2e › `page 2 and back` | covered |
| N6-AC3 | 15, 17 | e2e › `filters survive reload` | covered |
| N6-AC4 | 15 | e2e › `filter applies across pages` | covered |
| N6-AC5 | 15, 17 (P-D4) | e2e › `filter resets page, paging keeps filter`; unit › `a filter with no page param starts at page 1` | covered |
| N6-AC6 | 15 (P-D3) | unit › `the assignments param is not the generic page param` | covered |
| N6-AC7 | 15, 18 | e2e › `assign from a row still works`; unit › `positions are returned whole` | covered |
| N6-AC8 | 15, 17 | e2e › `counter tells the truth`; unit › `counter inputs` | covered |
| N6-AC9 | 18 | e2e › `no control when it fits` | covered |
| N6-AC10 | 17 | e2e › `filters and paging a11y` | covered **except the page-change focus clause — DEFERRED by owner decision**, backlog note required |
| N7-AC1 | 2 | unit › no standalone `<p>`; e2e › `no standalone description paragraph` | covered |
| N7-AC2 | 2, 3 | unit › one `HelpTip`, named | covered |
| N7-AC3 | 2, 3 | unit › guarded by `{#if description}` | covered |
| N7-AC4 | 2 | unit › props unchanged + diff-scope gate + `bun run check` | covered |
| N7-AC5 | 2, 4 | e2e › `hover reveals`, `focus reveals` | covered |
| N7-AC6 | 2, 4 | e2e › `anchoring and overflow at three widths` | covered |
| N7-AC7 | 2, 3, 4 (P-D1) | e2e › `exactly one description-path help control per page`; unit › invariant scan (opening-tag-scoped) | covered |
| N7-AC8 | 6 | composited contrast probe, both themes | covered (Agent-Probe) |
| N7-AC9 | 2, 5 | e2e › `keyboard reach + aria-describedby resolves` + **Negative control 2** | covered |
| N7-AC10 | 2, 4 | e2e › `complaints detail keeps an identifying title` | covered |

**33 of 34 fully covered. N6-AC10 covered except one clause deferred by owner decision.** No criterion is unaddressed.

---

## Risks carried from the SPEC, and where each is answered

| SPEC risk | Answered by |
|---|---|
| R1 double `?` | P-D1 + the unit invariant scan (Step 3) |
| R2 `/complaints/[id]` loses its identity line | Accepted by D2; N7-AC10 e2e keeps the `h1` identifying |
| R3 N6 bounds the table, not the query | Stated in the load comment (Step 15b) and in the Commit 4 message. **Do not report N6 as a performance fix.** |
| R4 `HelpTip` anchoring | Step 2 places the control inside the `relative` div; unit asserts it; N7-AC6 asserts the geometry at three widths |
| R5 renamed labels turn assertions vacuous | Step 11 + Negative control 1; `exact: true` on both new assertions |
| R6 N4 moves a located button | N4-AC3 runs the whole existing spec; N4-AC1 adds a position assertion the old markup fails |
| R7 N6 filtering becomes a round trip | Accepted by D3; called out again here for the owner's sign-off — typing then `Filter`/Enter, not instant |
| R8 bounding boxes pass for the wrong reason | Every box assertion (N1-AC6, N4-AC1) asserts alignment **and** horizontal separation, which overlap cannot satisfy |

---

## Validate Contract

Status: BLOCKED
Date: 18-09-26
date: 2026-09-18
generated-by: outer-pvl

Parallel strategy: sequential (single validate-agent, batched read-only probes)
Rationale: 4/7 signals (S3 four independent items, S5 user asked for depth, S6 shared-component wide reach, S7 12 files). The HIGH score recommends a fan-out, but no Agent tool is available in this session, so the Layer 1 + Layer 2 roles were executed in-process as batched parallel Bash probes. Every finding below carries file:line evidence; none is inferred.

### Test gates

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| N7-AC1..AC4 | PageHeader renders description as HelpTip, props unchanged | Fully-Automated | `bun run test -- page-header-helptip` | B — gate must be rewritten first (FAIL-3) |
| N7-AC5 | hover AND focus both reveal | Fully-Automated | e2e `page-header-helptip` › `hover reveals`, `focus reveals` (`toHaveCSS('opacity','1')`) | A |
| N7-AC6 | tooltip anchors under the title row, no spill at 1280/768/375 | Fully-Automated | e2e › `anchoring and overflow at three widths` | A |
| N7-AC7 | exactly one `?` on the badge-HelpTip pages | Fully-Automated | e2e › `no double question mark…` | **B — test is wrong as written (FAIL-1, FAIL-2)** |
| N7-AC8 | `?` and tooltip text clear the contrast floor, both themes | Agent-Probe | composited-alpha measurement, numbers in the phase report | A |
| N7-AC9 | keyboard reach + `aria-describedby` resolves | Fully-Automated | e2e › `keyboard reach…` + Negative control 2 (`HelpTip.svelte:21`) | A |
| N7-AC10 | `/complaints/[id]` keeps an identifying `h1` | Fully-Automated | e2e › `complaints detail keeps an identifying title` | A |
| N1-AC1..AC7 | two-state switch, flip link, one-row per-day controls, url contract | Fully-Automated | e2e `attendance-view-switch` (8 tests) | A |
| N1-AC8 | keyboard order, names, focus ring | Hybrid | e2e › `keyboard order and names` + owner theme-pair check | A |
| N1-AC9 | `employee-view-only:170` is no longer vacuous | Fully-Automated | corrected spec + Negative control 1 (`attendance/+page.svelte:19`) | A |
| N4-AC1, AC2 | button on the title row, old `justify-end` row gone | Fully-Automated | e2e `separations` › `action sits on the title row`, `no standalone action row` | A |
| N4-AC3 | create dialog still opens and the create flow completes | Fully-Automated | full existing `separations.spec.ts` | **B — the existing spec never touches the button (CONCERN-2)** |
| N4-AC4 | `PageHeader` still has no `actions` prop | Fully-Automated | unit `page-header-helptip` › props assertion | B (same gate as FAIL-3) |
| N4-AC5 | name, role, single `h1`, focus ring | Hybrid | e2e › `title row a11y` + owner theme-pair check | A |
| N6-AC1..AC4, AC7..AC9 | bounded table, paging, filters in the address, positions unpaged | Fully-Automated | e2e `settings-org-assignments` + unit `settings-org-load` | A (see CONCERN-3 for flake control) |
| N6-AC5 | filter change returns to page 1 | Fully-Automated | unit › `a filter with no page param starts at page 1` + e2e › `filter resets page…` | A |
| N6-AC6 | `empPage` is not the generic `page` param | Fully-Automated | unit › `the assignments param is not the generic page param` | A |
| N6-AC10 | filters/paging a11y; focus not lost to `<body>` | Hybrid | e2e › `filters and paging a11y` (filter half only) | **D — page-change half is a named residual; backlog stub required** |

gap-resolution legend: A proven now · B fixed by this plan · C deferred to a named later phase · D backlog test-building stub (named residual).

Legacy line form:
- N7 PageHeader: [Fully-automated: `bun run test -- page-header-helptip`] + [Fully-automated: `bun run test:e2e -- page-header-helptip`] + [agent-probe: composited contrast, both themes]
- N1 attendance: [Fully-automated: `bun run test:e2e -- attendance-view-switch`] + [Fully-automated: `bun run test:e2e -- employee-view-only`] + [hybrid: owner confirms the focus ring in both themes]
- N4 separations: [Fully-automated: `bun run test:e2e -- separations`] + [hybrid: owner confirms the focus ring in both themes]
- N6 settings/org: [Fully-automated: `bun run test -- settings-org-load`] + [Fully-automated: `bun run test:e2e -- settings-org-assignments`] + [known-gap: focus after a page change, documented as a backlog NOTE]

### Dimension findings

- Infra fit: **PASS** — `lucide-svelte ^0.460.0` at `package.json:75` (resolved 0.460.1); `calendar-days.svelte`, `table-2.svelte`, `grid-3x3.svelte` all present in `node_modules/lucide-svelte/dist/icons/`; import style matches `DatePicker.svelte:3-4`. `vitest.config.ts` is `environment: 'node'`, `include: tests/unit/**` — the source-assertion pattern is correct and jsdom is genuinely absent. `playwright.config.ts` builds and serves its own preview (`reuseExistingServer: false`, port 4173) so `bun run test:e2e` does not need the owner's dev server, only the DB. `bun run test -- <name>` and `bun run test:e2e -- <name>` both resolve correctly through the `dotenv -e .env.dev --` wrapper. No step runs `./start.sh`, `vite dev` or `docker`. Every quoted anchor in Steps 2, 8, 9a, 13, 15b matches live source verbatim.
- Test coverage: **FAIL** — two specified gates cannot pass on a correct implementation (FAIL-2, FAIL-3), and N4-AC3 rests on a spec that never exercises the behaviour it claims to prove (CONCERN-2).
- Breaking changes: **PASS** — `PageHeader` props unchanged (`PageHeader.svelte:8-22`); `listAssignableEmployees` signature untouched (`services/settings/org.ts:394`); `/attendance?view=` values untouched; `/settings/org` gains only additive query params. No test anywhere asserts a description string (verified: zero matches across `tests/`).
- Security surface: **PASS** — no auth, billing, schema, migration, secret or trust-boundary surface. `requireAnyCapability(user.roles, 'MANAGE_HR')` stays at the head of the `/settings/org` load, unmoved. `rbac.ts`, `prisma/schema.prisma` and `src/lib/server/services/**` are untouched by every one of the 22 steps; the staged-path grep gate in §Gates is a real guard. Employee names appearing in the query string via `empSearch` match the existing GET-filter pattern on `/settings/roles`, `/employees` and `/leave/balances` — no new exposure class.
- Section N7 feasibility: **FAIL** — mechanically sound (Step 2's anchor is verbatim, the `relative` ancestor argument at `PageHeader.svelte:35` is correct), but the P-D1 evidence table is wrong on two rows and both N7-AC7 gates inherit the error.
- Section N1 feasibility: **PASS** — anchors verbatim at `AttendanceHrGrid.svelte:207-237` and `240-258`; `data.view !== 'employee'` correctly covers both `matrix` and `team`; the flip link's DOM position gives the Tab order N1-AC8 requires.
- Section N4 feasibility: **CONCERN** — the edit is correct and the `AttendanceHrGrid.svelte:207-210` precedent is real, but N4-AC3 is not actually proved (CONCERN-2).
- Section N6 feasibility: **CONCERN** — the load rewrite is complete (all four `data.employees`/`filteredEmployees` consumers at `+page.svelte:38-46, 289, 304, 340` are accounted for; `data.positions` at `:145` and `:324` is never narrowed), but the e2e is exposed to cross-spec employee fixtures (CONCERN-3) and the AC10 residual understates its own blast radius (CONCERN-1).

### FAILs — must be resolved before EXECUTE

**FAIL-1 — P-D1's evidence table is wrong on two of four rows.** Only **two** call sites pass a `HelpTip` through a `PageHeader` `badge` snippet: `leave/balances/+page.svelte:33` and `settings/roles/+page.svelte:168`. The other two named are not PageHeader badges at all:
- `attendance/TeamMatrix.svelte:75-78` — the HelpTip sits in a `{#snippet toolbar()}` beside an `<h2>`. `TeamMatrix.svelte` contains **zero** references to `PageHeader`.
- `dashboard/+page.svelte:253-255` — the HelpTip sits inside the "Upcoming Regularizations" popover (`{#if openPanel === 'regularizations'}`). That page's header is `<PageHeader title="Dashboard" />` at `:138` — no description, no badge.
The *conclusion* P-D1 draws survives (no page passes both a description and a badge-HelpTip; `{#if description}` alone is still the right choice; `{#if description && !badge}` is still correctly rejected because it would delete the descriptions at `complaints/[id]:43`, `separations/[id]:98` and `performance/reviews/[id]:97`). Only the evidence is wrong — and the two gates built on it are not.

**FAIL-2 — the N7-AC7 e2e test goes red on a correct implementation.** `expect(page.getByRole('button', { name: /^About / })).toHaveCount(1)` is asserted for four pages. Two of them will not return 1:
- `/attendance` → **2**. `AttendanceHrGrid.svelte:209` passes `description="Team overview, daily records & corrections."`, so N7 adds an `About Attendance` button on the title row, while `TeamMatrix` (rendered at `AttendanceHrGrid.svelte:580` under `{#if data.view === 'matrix' && data.matrix}`, the landing view) already renders `About team attendance`.
- `/dashboard` → **0**. No description on its PageHeader, and the only HelpTip on the page is inside a closed popover.
Fix: assert `toHaveCount(1)` only for `/settings/roles` and `/leave/balances`; for `/attendance` assert exactly one `About Attendance` on the title row and separately that the TeamMatrix `?` is unaffected; drop `/dashboard` or restate it as "no `?` on the title row". SPEC N7-AC7's wording needs the same correction.

**FAIL-3 — the Step 3 source-scan gate is red on arrival.** Its offender predicate uses a file-wide `/description=/.test(src)`. `leave/balances/+page.svelte:148` carries `description={filtered ? … }` on an `<EmptyState>`, and the same file has a badge-HelpTip at `:33`. So `offenders` evaluates to `['src/routes/(app)/leave/balances/+page.svelte']` and `expect(offenders).toEqual([])` fails against the unmodified repo. Fix: extract the `<PageHeader …>` opening tag first and test `\bdescription=` against **that tag only**, not the whole file. (Checked for the same trap elsewhere: `settings/org/+page.svelte` also carries an `EmptyState description=`, but has no badge snippet, so it is not a second offender today — it would become one under any future badge.)
Answering the "name the mutation that turns it red" question: with the scope fixed, the mutation is to add `description="Remaining / allocated days per active employee."` to the `<PageHeader title="Leave Balances">` tag at `leave/balances/+page.svelte:31` — `offenders` then contains that file and the assertion fails. The pattern matches the cited precedents exactly (`badge-class-literals.test.ts:34-40` and `time-picker-migration.test.ts:9-13` both recurse `src/` and assert an offender list is empty), so the shape is right; only the predicate is wrong.

### Open gaps

- **N6-AC10 (page-change focus)** — `known-gap: documented as NEW PLAN REQUIRED`. Blast radius is **larger than the plan states**: `Pagination.svelte` is imported by **19 files covering 16 distinct routes**, not "roughly ten". Direct routes: `complaints`, `employees`, `inventory`, `leave`, `leave/balances`, `payslips`, `recruitment`, `reports/audit-log`, `requests`, `requests/approvals`, `requests/proposals`, `requests/timesheets`, `separations`, `settings/roles`, `team`. Via shared components: `/attendance` (`AttendanceHrGrid.svelte`, `AttendanceSelfView.svelte`, `TeamMatrix.svelte`) and `/timesheets` (`TimesheetListTab.svelte`). What changes for each: adding `data-sveltekit-keepfocus` to the two `<a>` at `Pagination.svelte:33` and `:48` suppresses SvelteKit's focus reset on every one of those routes, which also changes what a screen reader announces on a page change. It is also an **incomplete** fix — on page 1 and on the last page the clicked link is rendered as a `<span>` (`Pagination.svelte:40`, `:55`), so there is no anchor left to keep focus on. Verdict: **genuinely out of this lane's bounds.** Option A (ship the filter half, defer the shared fix) is the right call, and the backlog stub must name 16 routes and the first/last-page hole.
- **CONCERN-2 — N4-AC3 is not proved.** `tests/e2e/separations.spec.ts` contains no `New Separation` match at all; it asserts the `h1` (`:23`, `:33`) and drives the finalize/undo flow from DB fixtures. Running "the full existing spec" therefore proves nothing about the create dialog. (The SPEC contradicts itself here: R6 says "N4 moves a button the separations spec locates", the Background section says "No spec locates the separations `New Separation` button" — the latter is correct.) Fix, one line in the new N4 block: click `New Separation` and assert the dialog is visible.
- **CONCERN-3 — N6 e2e is exposed to cross-spec employee fixtures.** `playwright.config.ts` sets `fullyParallel: true`. `tests/e2e/pagination.spec.ts:13-14` seeds **25** `Zzpagetest` employees into the Veent org with best-effort cleanup (`:67-79`, which explicitly tolerates leftovers), and `separations.spec.ts` and `payslip-tenancy.spec.ts` also create employees. The new spec's "M equals the full assignable count" assertion will drift. Fix: `test.describe.configure({ mode: 'serial' })`, derive M from the page rather than a constant, and scope every row assertion to the spec's own name prefix. `pagination.spec.ts` is the exact working precedent for Step 21's seeding fallback — name it in the step.
- **CONCERN-1** — the "ten routes / nine unrelated pages" figure in §Hole: N6-AC10 and in the Decision-for-the-owner is wrong; it is 16 routes.
- **CONCERN-4** — cleared-search path: the native `×` on `<input type="search">` fires no submit, so after N6 the rows will not match an emptied box until Enter or `Filter`. Not an AC5 violation (no filter change is committed) but a real UX trap created by the round-trip model (SPEC R7). Worth one line to the owner.
- **CONCERN-5** — a GET form replaces the whole query string, so any assignments filter change would also reset a future Positions `page` param. This partly undercuts P-D3's stated rationale; harmless today (no other param is consumed).
- **CONCERN-6** — `data-sveltekit-keepfocus` on a `<form method="GET">` is an untested runtime behaviour, not a source fact. It is gated by the e2e `document.activeElement !== BODY` assertion, so it is acceptable; it must not be reported as proven until that assertion is green.
- **CONCERN-7** — Step 15b adds a four-line code comment. It is adapted, not verbatim, from `separations/+page.server.ts:26-28`. It is the only new comment in the plan; under the standing no-comments rule EXECUTE needs explicit sanction to add it. Sanctioned here: it states a load-bearing constraint and matches the repo's own wording for this pattern.
- **CONCERN-8** — Negative control 1's "expected failure, exactly" is over-specified. With `{#if true}` an employee-role user may not have the data `AttendanceHrGrid` needs, so the spec may go red on a render error rather than on `Expected: 0, Received: 1`. The control is still valid (red is red); the wording should say "red on the corrected assertion, or on a render error".
- **CONCERN-9** — the lane table misses one coupling: N7's own e2e spec targets `/separations` (owned by N4) and asserts its title-row geometry at three widths. N4 wraps `PageHeader` in `min-w-0 flex-1`, which narrows it. Mitigated only by the final full-suite run — say so explicitly.
- **CONCERN-10** — minor drift: the `canManage` guard is at `attendance/+page.svelte:19`, not `:20`; `{:else if data.view === 'employee'}` is at `AttendanceHrGrid.svelte:258`, not `:259`; lucide resolves to 0.460.1 (`^0.460.0` at `package.json:75`). Step 21's precondition is real — org_seed carries well under 21 assignable employees, so the spec **will** need its own fixtures.
  - **Re-derived at PLAN: the `:258`/`:259` half of this does not reproduce.** `sed -n '256,261p' src/lib/components/attendance/AttendanceHrGrid.svelte` shows `</form>` at **258** and `{:else if data.view === 'employee'}` at **259** — which is exactly what Step 9a says. The plan was already correct; no edit made. The `attendance/+page.svelte:19` half **did** reproduce and is fixed in Negative control 1. (Standing rule: a machine finding is a hypothesis — verify the defect and the cause separately before acting.)

### What this coverage does NOT prove

- `bun run test -- page-header-helptip` is a **source-text** assertion. It does not prove the component renders, that the tooltip is positioned correctly, or that any of the 33 call sites still compile — only `bun run check` and the e2e cover those.
- `bun run test:e2e -- page-header-helptip` runs a single Chromium project. It proves nothing about Firefox, WebKit, touch devices (where `:hover` does not exist — the `?` is a `<button>` so tap-focus reveals it, but that path is untested), reduced-motion, or forced-colors mode.
- `toHaveCSS('opacity','1')` proves the reveal rule fires. It does not prove the tooltip is readable, is not clipped by an ancestor `overflow:hidden`, or is announced by a real screen reader — N7-AC8 (Agent-Probe) and the owner's Hybrid checks carry those.
- The bounding-box assertions prove alignment and horizontal separation at three fixed widths on one device scale factor. They do not prove the layout at the owner's actual 125% browser zoom, nor at any width between the three sampled points.
- `bun run test:e2e -- separations` proves the page opens for HR, is refused for an employee, and that the finalize/undo flow works from DB fixtures. It does **not** today prove the create dialog opens or that a separation can be created through the UI (CONCERN-2).
- `bun run test -- settings-org-load` runs against a mocked service. It proves the filter/slice/param arithmetic; it proves nothing about the real Prisma query, the real row shape, or the payload size — and N6 explicitly does not reduce the query cost (SPEC R3).
- `bun run test:e2e -- settings-org-assignments` proves paging and filtering on whatever roster exists at run time. It does not prove behaviour at real tenant scale, nor that the unbounded `listAssignableEmployees` query stays acceptable.
- Nothing in this contract proves the four commits are free of the repo's known e2e flake (#287). Only a recorded pre-change baseline makes a post-change count meaningful.
- The two negative controls prove those two specific assertions are red-capable. They prove nothing about the other ~40 assertions in the new specs, which have no negative control.

Gate: BLOCKED (3 unresolved FAILs — FAIL-1, FAIL-2, FAIL-3)
Accepted by: not accepted — BLOCKED gates cannot be accepted. Return to PLAN; each FAIL has a named one-line fix above.

---

## Resume and Execution Handoff

1. **Selected plan file:** `process/features/ui-ux-overhaul/active/owner-click-pass-build-lane_18-09-26/owner-click-pass-build-lane_PLAN_18-09-26.md`
2. **Last completed phase or step:** PLAN complete, then **revised after a BLOCKED VALIDATE gate**. FAIL-1, FAIL-2 and FAIL-3 are resolved in-plan; CONCERN-1 through CONCERN-10 are each addressed, deferred by owner decision, or recorded as not-reproducing. No step executed. No file under `src/` or `tests/` touched. Branch `feat/uiux-phase-7`, tree clean apart from this task folder.
3. **Validate-contract status:** pending — the first VALIDATE pass returned **BLOCKED**; this revision must go back through **VALIDATE from V1**.
4. **Supporting context files loaded:** `owner-click-pass-build-lane_SPEC_18-09-26.md`; `CLAUDE.md`; `process/context/all-context.md` → `process/context/uxui/all-uxui.md`, `process/context/tests/all-tests.md`; `process/development-protocols/all-development-protocols.md`, `implementation-standards.md`, `plan-lifecycle.md`; umbrella `phase-07-page-splits_PLAN_03-09-26.md` (lines 85-86, 617).
5. **Next step for a fresh agent:** re-run **VALIDATE from V1** against this revised plan. The three FAILs are fixed; re-check specifically that the N7-AC7 expected-count table and the opening-tag-scoped unit predicate are both red-capable, which was the defect class that blocked the first pass. On approval, EXECUTE **Step 1** and stop at Commit 1's gate — N7 must be committed and green before the N1/N4/N6 lanes start (see [Execute lane split](#execute-lane-split)). Before any source edit, re-read the anchors in Steps 2, 8, 9, 13, 15 against live source; this plan was written against a clean tree and any drift invalidates a quoted anchor.

**Do not** run `./start.sh`, `vite` or `docker` — the owner starts servers and the database. **Do not** `git add -A`. **Do not** push.
