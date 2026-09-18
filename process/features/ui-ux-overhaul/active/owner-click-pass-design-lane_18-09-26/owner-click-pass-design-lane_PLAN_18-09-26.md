---
name: plan:owner-click-pass-design-lane
description: "Implementation plan for the three design-round items — N2 /settings Context Rail + destinations search, N3 /employees/new Companion Rail, N5 /inventory list+grid with one shared create/edit modal."
date: 18-09-26
feature: ui-ux-overhaul
---

# Owner click-pass design lane — PLAN

**Date**: 18-09-26
**Status**: PLANNED — awaiting VALIDATE
**Complexity**: COMPLEX (3 items, 6 source files, 20 acceptance criteria, 3 route surfaces, 2 mandatory negative controls)
**Feature**: ui-ux-overhaul
**Branch**: `feat/uiux-phase-7`
**Upstream SPEC**: `owner-click-pass-design-lane_SPEC_18-09-26.md` (same folder)
**INNOVATE**: deliberately skipped — the owner chose one direction per item on 18-09-26 (D4/D11, D5, D7/D12, D17, D8, D13/D9, D15). Those are inputs, not choices, and are not reopened here.

## TL;DR

Three pages, three files of real source each, 34 numbered steps, 4 commits. All 20 SPEC criteria have
a step and a test. Nothing touches `rbac.ts`, `schema.prisma` or `services/**`. No new component.

Five things this plan corrects against the design reports, because the reports were written before
the owner's D17 ruling or were measured wrong:

1. **N3 gates at `2xl` (1536), not `xl` (1280).** Every `xl:` in the N3 design's Direction C markup
   becomes `2xl:`. This is SPEC R12, one character, worth 288px of form width at 1280.
2. **N3's section-link nav must not be `hidden`.** The design says `hidden xl:block`; SPEC N3-AC3
   requires those links reachable by keyboard at 390. `hidden` removes them from the tab order.
3. **N3's "first error" must be DOM-ordered.** The design uses `Object.keys(fieldErrors)[0]`, which
   is server-insertion order, not page order. SPEC N3-AC6 says "the **first** invalid field".
4. **N3's jump must move focus, not just scroll.** A bare `href="#id"` is a scroll in the spec and a
   focus only by browser grace. SPEC N3-AC6 says focus. Explicit `.focus()` with the anchor kept as
   the no-JS fallback.
5. **N2's group row is not always 5 chips.** Measured: SUPER_ADMIN 5, HR_ADMIN 5, **MANAGER 4** —
   the `System` group's only two entries are both capability-gated. A `toHaveCount(5)` assertion
   would be red on correct code. Every count in the test plan is derived, never hardcoded.

The two lanes can run **at the same time**: zero file overlap. Two sequencing notes in §Lane split.

---

## Context Envelope

| # | Field | Value |
|---|---|---|
| 1 | feature | `ui-ux-overhaul` |
| 2 | phase | `PLAN` |
| 3 | session-goal | Build N2 / N3 / N5 from the locked design-lane SPEC, no design choices reopened |
| 4 | branch | `feat/uiux-phase-7` |
| 5 | worktree | main |
| 6 | context-group | `uxui`, `tests` |
| 7 | blast-radius-packages | `src/routes/(app)/settings/+layout.svelte`, `src/routes/(app)/settings/+page.svelte`, `src/lib/settings-destinations.ts`, `src/routes/(app)/employees/new/+page.svelte`, `src/routes/(app)/inventory/+page.svelte`, `src/routes/(app)/inventory/+page.server.ts`, `tests/e2e/**` |
| 8 | active-plan | this file |
| 9 | test-runner | `vitest` (unit) \| `playwright` (e2e) |
| 10 | validate-contract | pending — vc-validate-agent writes it |

---

## Touchpoints

| File | Item | Change |
|---|---|---|
| `src/lib/settings-destinations.ts` | N2 | **+1 exported line** (`groupSlug`). The 17 entries are untouched. |
| `src/routes/(app)/settings/+layout.svelte` | N2 | Full rewrite — group row + conditional sibling row |
| `src/routes/(app)/settings/+page.svelte` | N2 | Full rewrite — search box on the title row, `?g=` + text filter over the cards |
| `src/routes/(app)/employees/new/+page.svelte` | N3 | Wrapper, form grid, 3 inner grid tokens, 4 fieldset ids, new aside, bottom submit row deleted |
| `src/routes/(app)/inventory/+page.svelte` | N5 | Rewritten below the filter form — toolbar, table snippet, card snippet, one shared dialog |
| `src/routes/(app)/inventory/+page.server.ts` | N5 | **+2 lines** — read `view`. Actions and `itemSchema` untouched. |
| `tests/e2e/settings-context-rail.spec.ts` | N2 | **new** |
| `tests/e2e/employees-new-layout.spec.ts` | N3 | **new** |
| `tests/e2e/inventory.spec.ts` | N5 | rewritten alongside the page |
| `tests/e2e/settings-visibility.spec.ts` | N2 | **comment at 32-34 only.** No assertion changes. |

**Read, never written:** `src/lib/components/ui/Dialog.svelte`, `ConfirmButton.svelte`,
`ConfirmDialog.svelte`, `Badge.svelte`, `SearchInput.svelte`, `EmptyState.svelte`, `PageHeader.svelte`,
`src/lib/components/Pagination.svelte`, `src/lib/components/people/EmployeeTable.svelte`,
`src/lib/utils/submit-feedback.svelte.ts`, `src/routes/(app)/team/+page.svelte`, `src/lib/rbac.ts`.

**Banned, and no step needs them:** `src/lib/rbac.ts`, `prisma/schema.prisma`,
`src/lib/server/services/**`.

---

## Public Contracts

| Contract | Before | After | Who depends |
|---|---|---|---|
| `nav[aria-label="Settings sections"]` | lists 17 destinations | lists `All settings` + N group links; second row only on sub-pages | `settings-visibility.spec.ts:57-58` (unscoped link counts) |
| `region[aria-label="Settings destinations"]` | 17 cards | same landmark, filtered subset | `settings-visibility.spec.ts:5-6,35,65,66,68` |
| `groupSlug(group)` | — | **new export** from `settings-destinations.ts` | N2 layout + page |
| `/settings?g=<slug>` | — | **new** URL view state; unknown/absent value = show everything | N2 only |
| `button[name="Create Employee"]` | 1 in the bottom submit row | 1 in the aside | `admin.spec.ts:49` **strict mode** |
| `Cancel` on `/employees/new` | 2 (header + submit row) | 1 (header) | N3-AC4 |
| `Complete later — 12 optional fields` | frozen | **unchanged, byte-for-byte** | `admin.spec.ts:128,159` |
| `/inventory` `?/create` `?/update` `?/remove` + `itemSchema` | 10 field names | **unchanged** | N5-AC4 |
| `/inventory?view=list\|grid` | — | **new** read-only param, default `list` | N5-AC3 |
| `tr[data-name]` on `/inventory` | table row, 9 editors | row **and** card both carry `data-name`, CSS hides one | `inventory.spec.ts` helper |

---

## Blast Radius

- **6 source files**, 3 test files, 1 test comment. ~3 route surfaces.
- **Risk class: UI / layout / accessibility.** No auth, no billing, no schema, no money, no
  permission logic. `visibleSettings()` is *read* by N2; its rule is not changed.
- **Highest-risk single line:** the `2xl` token in `/employees/new`'s form grid (SPEC R12). One
  character wrong silently makes the form narrower than today at 1280.
- **Second:** `update({ reset: false })` in the inventory modal (SPEC R6) — a wrong default gives a
  green test that proves nothing.

---

## Measured facts this plan depends on

Verified against the tree at `feat/uiux-phase-7`. Do not re-derive; do re-verify any line you edit.

| Fact | Where | Value |
|---|---|---|
| Content width | `(app)/+layout.svelte:650-651` | `viewport − 304` from `lg`; `viewport − 32` below |
| `2xl` breakpoint | `tailwind.config.ts` — no `screens` key | stock **1536** |
| Page cap today | `employees/new/+page.svelte:78` | `mx-auto max-w-3xl` (768) |
| `Create Employee` count today | `employees/new/+page.svelte:581` | **1** |
| `Cancel` count today | `:80-82` header + `:579` submit row | **2** |
| Frozen summary | `:413` | `Complete later — 12 optional fields` |
| `OPTIONAL_FIELDS` length | `:43-55` | **11** entries (string says 12 — out of scope, do not fix) |
| Float legend | `:101-102` | `float-left … w-full` + `[&>legend+*]:clear-left` on the fieldset |
| Fieldset grid lines | `:103 :151 :177 :246 :423 :486 :523` | `sm:grid-cols-3/2/2/2/2/3/2` |
| Settings destinations | `settings-destinations.ts` | **17** total; `SETTINGS_GROUP_ORDER` = 5 |
| Capability-gated destinations | `:68 :106 :114 :171 :182` | 5 gated, 12 ungated |
| `System` group membership | Review Schedule + Document Backup | **both gated** |
| Destinations by role | via `visibleSettings` | SUPER_ADMIN 17, HR_ADMIN 14, MANAGER 12 |
| **Groups by role** | derived from the two rows above | **SUPER_ADMIN 5, HR_ADMIN 5, MANAGER 4** |
| Settings bar focus style today | `settings/+layout.svelte:47-49` | **none** — colour only |
| Inventory table min width | `inventory/+page.svelte:193-194` `min-w-max` | ~1438px; 942 available at 1280 |
| `Dialog` max-height source | `Dialog.svelte:125` | only `scroll` adds `flex max-h-[90vh] flex-col overflow-hidden` |
| `Dialog` focus restore | `Dialog.svelte` `trigger?.focus()` on close | detached node after a delete → `<body>` |
| `ConfirmDialog` z-index | hard-wired | **60** — a parent dialog must be below it |
| `submitFeedback` update seam | `submit-feedback.svelte.ts:70,82,90` | returning a callback from `inner` suppresses the built-in `o.update()` |
| `paginate()` return | `src/lib/server/pagination.ts:53-63` | carries `total`, `totalPages`, `skip`, `take`, `label` |
| `scrollbar-none` utility | `tailwind.config.ts:68` | defined, **zero consumers today** — N2 is the first |

### The hazard-2 count check, done before any assertion is written

SPEC hazard 2 says: count the real value before asserting "exactly N". Done:

- `Create Employee` on `/employees/new` today = **1**. After N3 still 1. Assertion `=== 1` is red on
  a duplicate, green on correct code. Safe.
- `Cancel` on `/employees/new` today = **2**. After N3 = 1. Asserting 1 **before** step 15 lands
  would be red on arrival — so this assertion ships in the same commit as the deletion. Safe.
- Settings group links: **not symmetric across roles.** 5 / 5 / **4**. Any `toHaveCount(5)` is red
  on a correct MANAGER page. Every group-count assertion therefore derives its expectation from the
  role's own visible destination set (§Test plan N2-T1), never from a literal.

---

## Deviations from the design reports, and why

The design reports are the source for markup. These five points override them. Nothing else does.

| # | Report said | This plan says | Why |
|---|---|---|---|
| **D-1** | N3: `xl:grid-cols-[minmax(0,1fr)_16rem]`, `xl:sticky` (n3 §Layout, §Markup) | `2xl:` on every one | Owner ruling **D17**; SPEC R12. The report predates it. |
| **D-2** | N3: `<nav aria-label="Form sections" class="hidden … xl:block">` | never `hidden`; a compact always-rendered row below `2xl` | SPEC N3-AC3: section links must "remain in the document and reachable by keyboard" at 390 |
| **D-3** | N3: `href="#{errorFields[0]}"` where `errorFields = Object.keys(fieldErrors)` | an explicit DOM-ordered `FIELD_ORDER` array picks the first | `Object.keys` is server-insertion order. SPEC N3-AC6 says the **first** invalid field. |
| **D-4** | N3: jump is a plain anchor | anchor + explicit `onclick` that calls `.focus()` | SPEC N3-AC6 says focus *lands*, not that the page scrolls |
| **D-5** | N5 §2.2 toolbar uses `data.pagination.total` | keep it, and it is correct | `paginate()` does return `total` (verified `pagination.ts:56`). The old `data.items.length` at `:187` counts the page slice. |

Everything else — the `<button>`-stretched-over-row pattern, `size="wide" scroll zIndex={50}`, the
`reset:false` seam, the `— no longer active` option label, the merged create/edit dialog, the
Context Rail chips, `groupSlug` — is taken from the reports as written.

---

# Implementation Checklist

34 steps. Each names the file, quotes the current code, and gives the replacement.

## N2 — `/settings` Context Rail + destinations search (steps 1-9)

### Step 1 — append `groupSlug` to the destinations module

File: `src/lib/settings-destinations.ts`, appended after the final `visibleSettings` export.

Current final export, verbatim:

```ts
/** Destinations the given roles may reach, in array order. Empty `capabilities` = always shown. */
export function visibleSettings(roles: Role[]): SettingsDestination[] {
	return SETTINGS_DESTINATIONS.filter(
		(d) => d.capabilities.length === 0 || d.capabilities.some((c) => canAny(roles, c))
	)
}
```

Append, exactly:

```ts

export const groupSlug = (g: SettingsGroup) => g.toLowerCase().replace(/[^a-z]+/g, '-')
```

`'Time & Attendance' → 'time-attendance'`, `'Hiring & Separation' → 'hiring-separation'`,
`'Organization' → 'organization'`, `'Payroll' → 'payroll'`, `'System' → 'system'`. No new field on
the 17 entries. **Satisfies:** N2-AC1, N2-AC3 (both need group identity in a URL).

### Step 2 — rewrite the settings layout as a Context Rail

File: `src/routes/(app)/settings/+layout.svelte` — **full replacement of the whole file**.

The existing comment at lines 11-12 is carried across **verbatim**:

```
	// `user.roles` comes from the root (app) layout load — child layouts inherit it, so this
	// sub-nav needs no load of its own.
```

Replacement file:

```svelte
<script lang="ts">
	import { page } from '$app/stores'
	import { SETTINGS_GROUP_ORDER, groupSlug, visibleSettings } from '$lib/settings-destinations'
	import type { LayoutData } from './$types'

	// `user.roles` comes from the root (app) layout load — child layouts inherit it, so this
	// sub-nav needs no load of its own.
	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props()

	const visible = $derived(visibleSettings(data.user.roles))
	const groups = $derived(SETTINGS_GROUP_ORDER.filter((g) => visible.some((d) => d.group === g)))
	const current = $derived(visible.find((d) => d.href === $page.url.pathname))
	const activeGroup = $derived(
		current?.group ?? groups.find((g) => groupSlug(g) === $page.url.searchParams.get('g'))
	)
	const siblings = $derived(current ? visible.filter((d) => d.group === current.group) : [])
	const onHub = $derived($page.url.pathname === '/settings' && !activeGroup)
	const chip =
		'shrink-0 rounded-full px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
</script>

<div class="space-y-6">
	<nav aria-label="Settings sections" class="rounded-lg border bg-card">
		<div class="scrollbar-none flex items-center gap-1 overflow-x-auto px-2 py-1.5">
			<a
				href="/settings"
				aria-current={onHub ? 'page' : undefined}
				class="{chip} {onHub
					? 'bg-primary/15 text-primary'
					: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
			>
				All settings
			</a>
			<span aria-hidden="true" class="mx-1 h-5 w-px shrink-0 bg-border"></span>
			{#each groups as g (g)}
				{@const on = activeGroup === g}
				<a
					href="/settings?g={groupSlug(g)}"
					aria-current={on ? 'true' : undefined}
					class="{chip} {on
						? 'bg-primary/15 text-primary'
						: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
				>
					{g}
				</a>
			{/each}
		</div>

		{#if siblings.length > 0}
			<div class="scrollbar-none flex items-center gap-1 overflow-x-auto border-t px-2 py-1.5">
				{#each siblings as d (d.href)}
					{@const on = $page.url.pathname === d.href}
					<a
						href={d.href}
						aria-current={on ? 'page' : undefined}
						class="shrink-0 rounded-md px-2.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {on
							? 'bg-accent font-semibold text-foreground'
							: 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}"
					>
						{d.label}
					</a>
				{/each}
			</div>
		{/if}
	</nav>

	{@render children()}
</div>
```

Checks a reviewer must make on this step:

- Both `{@const}` are immediate children of an `{#each}`. ✅ repo rule.
- `aria-current="true"` on a group chip (a filter), `aria-current="page"` on a destination (a page).
  Both are valid tokens; the distinction is what N2-AC6 asserts.
- `focus-visible:ring-2 focus-visible:ring-ring` on **every** link in both rows. This is the a11y
  fix N2-AC6 calls out — the bar has none today.
- `overflow-x-auto` is on the inner div, so the row scrolls **inside itself** at 390 and the page
  does not (N2-AC5).
- `siblings` is `[]` on `/settings` because `current` is undefined there, so the second row is not
  rendered at all. That is what removes the duplicate **by construction** (N2-AC2, N2-AC3).

**Satisfies:** N2-AC1, N2-AC2, N2-AC3, N2-AC5, N2-AC6.

### Step 3 — rewrite the settings hub page: search on the title row, filtered cards

File: `src/routes/(app)/settings/+page.svelte` — **full replacement of the whole file**.

The existing comments at lines 13-14 and line 31 are carried across **verbatim**:

```
	// One source for the hub, the sub-nav and the sidebar. Capability filtering happens in
	// visibleSettings via the same rbac table the server enforces.
```
```
	<!-- Landmark so a locator can tell a hub card from the same destination's sub-nav row. -->
```

Replacement file:

```svelte
<script lang="ts">
	import { page } from '$app/stores'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import SearchInput from '$lib/components/ui/SearchInput.svelte'
	import {
		SETTINGS_GROUP_ORDER,
		groupSlug,
		visibleSettings,
		type SettingsDestination,
		type SettingsGroup
	} from '$lib/settings-destinations'
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()

	let q = $state('')

	// One source for the hub, the sub-nav and the sidebar. Capability filtering happens in
	// visibleSettings via the same rbac table the server enforces.
	const visible = $derived(visibleSettings(data.user.roles))
	const g = $derived($page.url.searchParams.get('g'))
	const needle = $derived(q.trim().toLowerCase())
	const matches = $derived(
		visible
			.filter((d) => !g || groupSlug(d.group) === g)
			.filter((d) => !needle || `${d.label} ${d.desc} ${d.group}`.toLowerCase().includes(needle))
	)
	const groups = $derived(
		SETTINGS_GROUP_ORDER.map(
			(group) =>
				[group, matches.filter((d) => d.group === group)] as [SettingsGroup, SettingsDestination[]]
		).filter(([, items]) => items.length > 0)
	)
</script>

<svelte:head>
	<title>Settings — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start gap-3">
		<div class="min-w-0 flex-1">
			<PageHeader
				title="Settings"
				description="Master data and configuration for your organization."
			/>
		</div>
		<div class="ml-auto w-full sm:w-72">
			<label for="settings-search" class="sr-only">Search settings</label>
			<SearchInput
				id="settings-search"
				bind:value={q}
				autocomplete="off"
				placeholder="Search settings…"
				class="input w-full"
			/>
		</div>
	</div>

	<!-- Landmark so a locator can tell a hub card from the same destination's sub-nav row. -->
	<div role="region" aria-label="Settings destinations" class="space-y-6">
		<p aria-live="polite" class="sr-only">{matches.length} of {visible.length} settings shown</p>
		{#each groups as [group, items] (group)}
			<section class="space-y-3">
				<h2 class="text-sm font-semibold text-muted-foreground">{group}</h2>
				<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{#each items as d (d.href)}
						<a
							href={d.href}
							class="rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<p class="font-medium">{d.label}</p>
							<p class="mt-0.5 text-xs text-muted-foreground">{d.desc}</p>
						</a>
					{/each}
				</div>
			</section>
		{/each}
		{#if matches.length === 0}
			<p class="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
				No settings match “{q}”.
			</p>
		{/if}
	</div>
</div>
```

Notes on the step:

- The search box is laid out by the **page**, beside `PageHeader`, never inside it. This is the
  SPEC R4 rule that keeps N7 and this lane apart — N7 rewrites `PageHeader`'s internals and this
  file must not care.
- `w-full sm:w-72` is what drops it to its own row below `sm` (N2-AC4's last sentence).
- The empty state names `{q}` verbatim, so the no-match assertion can look for the typed string.
- `aria-live="polite"` on a `sr-only` count line — N2-AC6's announcement.
- The card grid classes are today's, plus a focus ring the cards also lacked.

**Satisfies:** N2-AC2, N2-AC4, N2-AC6.

### Step 4 — correct the stale comment in `settings-visibility.spec.ts`

File: `tests/e2e/settings-visibility.spec.ts`, lines 32-34. **Comment only — no assertion changes.**

Current, verbatim:

```ts
		// Scoped: since phase 07 the hub card, the settings sub-nav row and the sidebar row all
		// carry the SAME canonical label, so an unscoped locator matches three links and
		// Playwright strict mode throws.
```

Replacement:

```ts
		// Scoped: the hub card and the sidebar row carry the SAME canonical label, so an unscoped
		// locator matches two links and Playwright strict mode throws. (Before the settings
		// Context Rail there was a third — the sub-nav repeated every destination on /settings.)
```

The assertions at 57-58 and every locator are **untouched**. They are the regression guard on the
duplication being removed (N2-AC2, SPEC R3). **Satisfies:** N2-AC2 (the "survive unchanged" half).

### Step 5 — write `tests/e2e/settings-context-rail.spec.ts`

New file. Full contents in §Test plan N2. **Satisfies:** all six N2 criteria.

### Step 6 — gate run for N2

```bash
bun run format:check && bun run lint && bun run check && bun run test
```

`bunx prisma generate` first if `bun run check` is red for a `$types` reason.

### Step 7 — e2e run for N2

```bash
CI=1 bun run exec dotenv -e .env.dev -- playwright test tests/e2e/settings-context-rail.spec.ts tests/e2e/settings-visibility.spec.ts
```

`bun run test:e2e -- <spec>` does **not** filter — it silently runs everything. Use the form above.

### Step 8 — N2 owner step (manual, one page)

The owner opens `/settings` and `/settings/holidays` in **light and dark**, at 390 and 1280, and
confirms: the focus ring on a bar link is visible in both themes (N2-AC6's Hybrid half), and the
search box's position on the title row reads right. Record the answer in the phase report. Note the
SPEC's reservation: the owner may move the search control after seeing it; top-right is what ships.

### Step 9 — **Commit 1** (see §Commit plan)

---

## N3 — `/employees/new` Companion Rail (steps 10-19)

All edits are in `src/routes/(app)/employees/new/+page.svelte`. One file.

### Step 10 — add the DOM-ordered error index to the script

Insert immediately **after** the existing `optionalHasError` line (`:56`). Current, verbatim:

```ts
	const optionalHasError = $derived(OPTIONAL_FIELDS.some((f) => invalid(f)))
```

Append after it:

```ts
	const FIELD_ORDER = [
		'firstName',
		'lastName',
		'middleName',
		'contactPhone',
		'contactAddress',
		'email',
		'password',
		'role',
		'discordId',
		'departmentId',
		'jobTitle',
		'employmentType',
		'startDate',
		'rateType',
		'basicSalary',
		'reportsToId',
		'positionId',
		'workScheduleId',
		...OPTIONAL_FIELDS
	]
	const errorCount = $derived(
		Object.keys(
			(form as { fieldErrors?: Record<string, string[]> } | null)?.fieldErrors ?? {}
		).length
	)
	const firstErrorField = $derived(FIELD_ORDER.find((f) => invalid(f)))
```

This is deviation **D-3**. `FIELD_ORDER` is the page's own reading order (the same sequence
N3-AC6 freezes), with the 11 optional fields appended in their existing array order — so
`firstErrorField` is the first invalid field **on the page**, not the first key the server happened
to write. `OPTIONAL_FIELDS` is reused, not restated, so the two cannot drift.

> Step-10 verification before writing: confirm each of the 18 required-block names above matches a
> real `name=` on the page (`grep -n 'name="' src/routes/\(app\)/employees/new/+page.svelte`). A name
> that does not exist is silently never invalid and would make the jump skip a field.

**Satisfies:** N3-AC3, N3-AC6.

### Step 11 — drop the max-width cap

File line 78. Current, verbatim:

```svelte
<div class="mx-auto max-w-3xl space-y-6">
```

Replacement:

```svelte
<div class="space-y-6">
```

No replacement max-width anywhere. **Satisfies:** N3-AC1.

### Step 12 — make the form a two-track grid at `2xl`

Current, verbatim (the `<form>` open tag and the heading that follows it):

```svelte
		<form method="POST" action="?/create" use:enhance={create.enhance} class="space-y-8">
			<h2 class="text-sm font-semibold text-muted-foreground">Required to hire</h2>
```

Replacement:

```svelte
		<form
			method="POST"
			action="?/create"
			use:enhance={create.enhance}
			class="grid items-start gap-8 2xl:grid-cols-[minmax(0,1fr)_16rem]"
		>
			<div class="space-y-8">
				<h2 class="text-sm font-semibold text-muted-foreground">Required to hire</h2>
```

**`2xl`, not `xl`** — deviation D-1 / SPEC R12. Arithmetic, re-checked: `16rem` = 256, `gap-8` = 32,
so the form loses 288 only at ≥1536. 1536 → 1232 − 288 = **944**. 1920 → 1616 − 288 = **1328**.
Below 1536 the grid is one column and the form column is the full content width: 1280 → **976**,
1440 → **1136**. Every one is ≥ today's 768 and 1024 is unchanged at 720.

The `<div class="space-y-8">` opened here **closes in step 14**, immediately after the `</details>`.
It carries the `space-y-8` the `<form>` used to own, so the vertical rhythm between fieldsets is
unchanged.

**Satisfies:** N3-AC1, N3-AC2.

### Step 13 — anchor ids + three additive inner-grid tokens

Four fieldsets get an `id` and `scroll-mt-8`; three grids get one appended token. Nothing is ever
made narrower.

| Line | Current (verbatim) | Replacement |
|---|---|---|
| 101 | `<fieldset class="rounded-lg border bg-card p-6 space-y-4 [&>legend+*]:clear-left">` | `<fieldset id="sec-personal" class="scroll-mt-8 rounded-lg border bg-card p-6 space-y-4 [&>legend+*]:clear-left">` |
| 103 | `<div class="grid gap-4 sm:grid-cols-3">` | **unchanged** |
| 149 | `<fieldset class="rounded-lg border bg-card p-6 space-y-4 [&>legend+*]:clear-left">` | `<fieldset id="sec-contact" class="scroll-mt-8 rounded-lg border bg-card p-6 space-y-4 [&>legend+*]:clear-left">` |
| 151 | `<div class="grid gap-4 sm:grid-cols-2">` | **unchanged** |
| 175 | `<fieldset class="rounded-lg border bg-card p-6 space-y-4 [&>legend+*]:clear-left">` | `<fieldset id="sec-account" class="scroll-mt-8 rounded-lg border bg-card p-6 space-y-4 [&>legend+*]:clear-left">` |
| 177 | `<div class="grid gap-4 sm:grid-cols-2">` | **unchanged** |
| 244 | `<fieldset class="rounded-lg border bg-card p-6 space-y-4 [&>legend+*]:clear-left">` | `<fieldset id="sec-employment" class="scroll-mt-8 rounded-lg border bg-card p-6 space-y-4 [&>legend+*]:clear-left">` |
| 246 | `<div class="grid gap-4 sm:grid-cols-2">` | `<div class="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">` |
| 423 | `<div class="grid gap-4 sm:grid-cols-2">` (Government IDs) | `<div class="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">` |
| 486 | `<div class="grid gap-4 sm:grid-cols-3">` (Emergency) | **unchanged** |
| 523 | `<div class="grid gap-4 sm:grid-cols-2">` (Bank / GCash) | `<div class="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">` |

Width check at 1536 (form column 944, `gap-4` = 16): 3-up = 304 each, 4-up = 224 each. Both clear a
`h-9` input comfortably. At 1920 (1328): 3-up = 432, 4-up = 320.

**The legend stays above its fields in every fieldset.** No `ml-*` matching margin is introduced,
so SPEC R5's float/grid trap is not entered. `[&>legend+*]:clear-left` is carried across verbatim on
all seven fieldsets.

**Satisfies:** N3-AC1, N3-AC5 (the disclosure keeps the full form-column width).

### Step 14 — close the form column after the disclosure

Current, verbatim (the disclosure's closing tag, `:575-576` region):

```svelte
			</details>
```

Replacement:

```svelte
			</details>
			</div>
```

That `</div>` closes the `<div class="space-y-8">` opened in step 12. The `<details>` is therefore
the last thing in the form column, full width of it, **with nothing beside it** — the aside is a
grid sibling, not a flow sibling, and it is `sticky`, so opening the disclosure moves it by 0px
(N3-AC5).

`<details open={optionalHasError} class="rounded-md border">` and its `<summary>` string at `:412-413`
are **untouched, byte-for-byte**.

### Step 15 — delete the bottom submit row, add the aside

Current, verbatim (`:578-589`):

```svelte
			<div class="flex justify-end gap-3">
				<a href="/employees" class="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancel</a>
				<button
					type="submit"
					disabled={create.busy}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
				>
					{create.busy ? 'Creating…' : 'Create Employee'}
				</button>
			</div>
```

Replacement — the whole block goes, and this aside takes its place:

```svelte
			<aside class="space-y-4 2xl:sticky 2xl:top-8">
				{#if errorCount > 0 && firstErrorField}
					<div class="rounded-lg border border-destructive bg-destructive/10 p-3">
						<p class="text-sm font-medium text-destructive">
							{errorCount} field{errorCount === 1 ? '' : 's'} need attention
						</p>
						<a
							href="#{firstErrorField}"
							onclick={(e) => {
								e.preventDefault()
								const el = document.getElementById(firstErrorField)
								el?.scrollIntoView({ block: 'center' })
								el?.focus()
							}}
							class="mt-1 inline-block rounded text-xs text-destructive underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							Go to the first one
						</a>
					</div>
				{/if}

				<nav aria-label="Form sections" class="rounded-lg border bg-card p-2">
					<ul class="flex flex-wrap gap-1 text-sm 2xl:block 2xl:space-y-0.5">
						<li>
							<a
								href="#sec-personal"
								class="block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>Personal Information</a
							>
						</li>
						<li>
							<a
								href="#sec-contact"
								class="block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>Contact Information</a
							>
						</li>
						<li>
							<a
								href="#sec-account"
								class="block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>Account</a
							>
						</li>
						<li>
							<a
								href="#sec-employment"
								class="block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>Employment Details</a
							>
						</li>
					</ul>
				</nav>

				<button
					type="submit"
					disabled={create.busy}
					class="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
				>
					{create.busy ? 'Creating…' : 'Create Employee'}
				</button>
			</aside>
```

The load-bearing details:

- **One** `Create Employee` button in the whole document. **One** `Cancel`, the `PageHeader` `back()`
  snippet at `:80-82`, untouched. The aside is *one set of elements repositioned by CSS* — there is
  no `hidden`/`block` pair anywhere, so a hidden duplicate cannot exist for `admin.spec.ts:49` to
  trip over (N3-AC4, SPEC R1).
- The aside is inside `<form>`, so the submit needs no `form=` attribute and no new id.
- `2xl:sticky 2xl:top-8` — pinned only where it is a column (D-1).
- `flex flex-wrap` below `2xl`, `2xl:block` above: **not `hidden`** (deviation D-2). At 390 the four
  section links wrap onto 2-3 short rows and stay in the tab order (N3-AC3).
- The jump control calls `.focus()` explicitly (deviation D-4). The `href` stays as the no-JS
  fallback and as the accessible affordance. `preventDefault()` stops the double-scroll.
- If `firstErrorField` is inside the disclosure, `optionalHasError` has already set `open` on the
  same render, so the element exists and is focusable when the click lands (N3-AC6).
- Every aside control carries a focus ring.

**Satisfies:** N3-AC2, N3-AC3, N3-AC4, N3-AC6.

### Step 16 — verify the DOM order of the aside against `admin.spec.ts`

No edit. A read-only confirmation before the gate:

```bash
grep -n "Create Employee\|Complete later\|getByLabel\|select\[name=" tests/e2e/admin.spec.ts
```

Confirm line 49 is still `getByRole('button', { name: 'Create Employee' })` and lines 128/159 still
click the frozen string. If either moved, the step-17 gate will say so, but knowing before is
cheaper than a red run.

### Step 17 — write `tests/e2e/employees-new-layout.spec.ts`

New file. Full contents in §Test plan N3. **Satisfies:** all six N3 criteria.

### Step 18 — gates for N3

```bash
bun run format:check && bun run lint && bun run check && bun run test
CI=1 bun run exec dotenv -e .env.dev -- playwright test tests/e2e/employees-new-layout.spec.ts tests/e2e/admin.spec.ts
```

`admin.spec.ts` **in full** — it is the strict-mode guard.

### Step 19 — **Commit 2**

---

## N5 — `/inventory` list + grid + one shared modal (steps 20-34)

### Step 20 — read the `view` parameter on the server

File: `src/routes/(app)/inventory/+page.server.ts`. **Two lines. Actions and `itemSchema` are not
touched.**

Current, verbatim (`:20-24` and `:42`):

```ts
	const filter = {
		search: url.searchParams.get('search') ?? '',
		category: url.searchParams.get('category') ?? '',
		status: url.searchParams.get('status') ?? ''
	}
```
```ts
	return { items, categories, employees, filter, pagination }
```

Replacements:

```ts
	const filter = {
		search: url.searchParams.get('search') ?? '',
		category: url.searchParams.get('category') ?? '',
		status: url.searchParams.get('status') ?? ''
	}
	const view = url.searchParams.get('view') === 'grid' ? 'grid' : 'list'
```
```ts
	return { items, categories, employees, filter, pagination, view }
```

An absent or unknown `view` falls through to `'list'` — List is the default (N5-AC3). The GET filter
form, `listInventory`, the page size and `paginate()` are untouched.

**Satisfies:** N5-AC3.

### Step 21 — inventory script: state, derivations, and the two submit handlers

File: `src/routes/(app)/inventory/+page.svelte`. Replace the script's guard block. Current, verbatim
(`:16-18`):

```ts
	const add = createSubmitGuard()
	const saveGuards: Record<string, ReturnType<typeof createSubmitGuard>> = {}
	const saveGuard = (id: string) => (saveGuards[id] ??= createSubmitGuard())
```

Replacement:

```ts
	let editingId = $state<string | null>(null)
	let creating = $state(false)
	let listEl = $state<HTMLElement>()

	const editing = $derived(data.items.find((i) => i.id === editingId) ?? null)
	const dialogOpen = $derived(creating || editing !== null)
	const views: { value: 'list' | 'grid'; label: string }[] = [
		{ value: 'grid', label: 'Grid' },
		{ value: 'list', label: 'List' }
	]

	function inventoryHref(view: 'list' | 'grid') {
		const params = new URLSearchParams($page.url.searchParams)
		if (view === 'grid') params.set('view', 'grid')
		else params.delete('view')
		params.delete('page')
		const qs = params.toString()
		return qs ? `/inventory?${qs}` : '/inventory'
	}

	const save = submitFeedback({
		inner: () => async ({ update, result }) => {
			await update({ reset: false })
			if (result.type === 'success') {
				editingId = null
				creating = false
			}
		}
	})

	const afterDelete: SubmitFunction = () => async ({ update, result }) => {
		await update({ reset: false })
		if (result.type === 'success') {
			editingId = null
			listEl?.focus()
		}
	}
```

Imports to add at the top of the script (and `createSubmitGuard` to remove — it has no remaining
call site):

```ts
	import { page } from '$app/stores'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
	import Dialog from '$lib/components/ui/Dialog.svelte'
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import type { SubmitFunction } from '@sveltejs/kit'
```

`enhance` (already imported) stays. `cellInputClass` at `:23-24` is **deleted** — its only consumers
were the row editors. `inputClass` at `:21-22` stays and is reused by the modal verbatim.

Why this shape, precisely:

- **`update({ reset: false })` is the whole of SPEC R6.** SvelteKit's default `reset: true` resets
  the `<form>` to its HTML defaults, wiping the user's edits on a rejected save. The existing e2e
  would still pass, for the wrong reason. This repo has lost time to it twice
  (`sveltekit-update-resets-the-form`). N5-AC6's negative control proves the guard is real.
- Returning a callback from `inner` makes `submitFeedback` skip its own `o.update()`
  (`submit-feedback.svelte.ts:70,82,90` — `if (!after) await o.update()`), so `update()` is called
  exactly once, with our options. Verified against source.
- `editing` is `$derived` **by id** off `data.items`, not a captured object, so after
  `invalidateAll` it points at fresh server data, not a stale snapshot.
- `listEl?.focus()` after a delete is SPEC R7 / N5-AC7. `Dialog`'s own restore targets the row
  button, which no longer exists; without this line focus falls to `<body>`.
- `inventoryHref` drops `page` so a view switch does not land on page 3 of a shorter list, and
  preserves the filter params so the toggle does not clear a filter.

**Satisfies:** N5-AC3, N5-AC6, N5-AC7.

### Step 22 — delete the `Add an item` `<details>` form

File `src/routes/(app)/inventory/+page.svelte`, the `<details>` block between the filter form and
the `<datalist>` (the `#a-name` form, ~96 lines). **Deleted entirely.** Its job moves into the
shared dialog (step 27), which is the D15 merge.

`<datalist id="categories">` immediately after it **stays where it is** — the modal's category input
references it by id and a `<datalist>` resolves from anywhere in the document.

The GET filter form above it is **untouched**.

**Satisfies:** N5-AC4.

### Step 23 — replace the list section with the toolbar shell

Current, verbatim (`:186-187`):

```svelte
	<section class="space-y-3 rounded-lg border bg-card p-4">
		<h2 class="font-semibold">Items ({data.items.length})</h2>
```

Replacement (this opens the shell; steps 24-26 supply the snippets it renders):

```svelte
	<section
		bind:this={listEl}
		tabindex="-1"
		class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card focus:outline-none"
	>
		<div class="flex flex-wrap items-center gap-3 border-b px-4 py-3">
			<h2 class="font-semibold">Items</h2>
			<p class="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
				{data.pagination.total} {data.pagination.total === 1 ? 'item' : 'items'}
			</p>
			<div class="ml-auto flex items-center gap-3">
				<div role="group" aria-label="View" class="inline-flex rounded-md border p-0.5">
					{#each views as v (v.value)}
						<a
							href={inventoryHref(v.value)}
							aria-current={data.view === v.value ? 'page' : undefined}
							class="rounded px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {data.view ===
							v.value
								? 'bg-muted text-foreground'
								: 'text-muted-foreground hover:text-foreground'}">{v.label}</a
						>
					{/each}
				</div>
				<button
					type="button"
					onclick={() => (creating = true)}
					class="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>Add item</button
				>
			</div>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto">
			{#if data.items.length === 0}
				<EmptyState
					variant={data.filter.search || data.filter.category || data.filter.status
						? 'no-results'
						: 'empty'}
					title={data.filter.search || data.filter.category || data.filter.status
						? 'No items match these filters'
						: 'No items in the registry yet'}
				>
					{#snippet action()}
						<a
							href="/inventory"
							class="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">Clear filters</a
						>
					{/snippet}
				</EmptyState>
			{:else if data.view === 'grid'}
				{@render cardGrid()}
			{:else}
				{@render itemTable()}
				<div class="sm:hidden">{@render cardGrid()}</div>
			{/if}
		</div>

		<div class="has-[nav]:border-t has-[nav]:px-4 has-[nav]:py-3">
			<Pagination meta={data.pagination} />
		</div>
	</section>
```

`Items ({data.items.length})` at `:187` counted the page slice (max 20), not the registry.
`data.pagination.total` is the real count — verified present at `pagination.ts:56`.

The toggle is `/team`'s, verbatim in shape (`team/+page.svelte:60-71`): `role="group"
aria-label="View"`, `aria-current="page"` on the active one, links not buttons so the choice is in
the URL and survives a reload (N5-AC3).

`bind:this={listEl}` + `tabindex="-1"` is the post-delete focus target (N5-AC7).

**Satisfies:** N5-AC3, N5-AC7.

### Step 24 — the table snippet

Add above the `<section>`, with `const th = 'px-4 py-2 text-left text-xs font-medium text-muted-foreground'`
in the script (lifted from `EmployeeTable.svelte:12`):

```svelte
{#snippet itemTable()}
	<table class="hidden w-full table-fixed text-sm sm:table">
		<caption class="sr-only">Inventory items. Select an item to edit it.</caption>
		<thead class="sticky top-0 z-10 border-b bg-muted/50 backdrop-blur">
			<tr>
				<th scope="col" class="{th} w-[38%] md:w-[26%]">Item</th>
				<th scope="col" class="{th} hidden md:table-cell">Category</th>
				<th scope="col" class="{th} w-20 text-right">Qty</th>
				<th scope="col" class="{th} hidden xl:table-cell">Location</th>
				<th scope="col" class="{th} w-28">Status</th>
				<th scope="col" class="{th} hidden lg:table-cell">Assigned to</th>
				<th scope="col" class="{th} hidden w-28 text-right xl:table-cell">Value</th>
			</tr>
		</thead>
		<tbody class="divide-y">
			{#each data.items as item (item.id)}
				<tr
					class="relative h-12 transition-colors hover:bg-accent/40 has-[button:focus-visible]:outline has-[button:focus-visible]:outline-2 has-[button:focus-visible]:-outline-offset-2 has-[button:focus-visible]:outline-ring"
					data-name={item.name}
				>
					<td class="px-4 py-1.5">
						<button
							type="button"
							onclick={() => (editingId = item.id)}
							class="block w-full min-w-0 cursor-pointer text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
						>
							<span class="sr-only">Edit </span>
							<span class="block truncate font-medium text-foreground">{item.name}</span>
							{#if item.serialNumber}
								<span class="block truncate text-xs tabular-nums text-muted-foreground"
									>{item.serialNumber}</span
								>
							{/if}
						</button>
					</td>
					<td class="hidden truncate px-4 py-1.5 text-muted-foreground md:table-cell">{item.category}</td>
					<td class="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">
						{item.quantity}<span class="text-muted-foreground"> {item.unit}</span>
					</td>
					<td class="hidden truncate px-4 py-1.5 text-muted-foreground xl:table-cell"
						>{item.location ?? '—'}</td
					>
					<td class="px-4 py-1.5"><Badge status={item.status} domain="inventory" /></td>
					<td class="hidden truncate px-4 py-1.5 text-muted-foreground lg:table-cell">
						{item.assignedTo ? empName(item.assignedTo) : '—'}
					</td>
					<td class="hidden whitespace-nowrap px-4 py-1.5 text-right tabular-nums xl:table-cell">
						{item.value == null ? '—' : formatCurrency(Number(item.value))}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}
```

**Why this cannot scroll sideways:** `table-fixed` sizes columns from the `<th>` widths and the
container, ignoring cell content. Every text cell carries `truncate`. There is no `min-w-max`, no
fixed-width input and no `overflow-x-auto` wrapper — the three things that made the old table need
1438px. The scroll wrapper is deliberately **not** kept: keeping it would hide a regression instead
of preventing one (N5-AC1a).

**The row is a real `<button type="button">`,** stretched with `after:absolute after:inset-0`,
copying `EmployeeTable.svelte:29,35`. `Table.svelte`'s `onRowClick` — `role="button"` on a `<tr>`,
and a Space handler with no `preventDefault` — is rejected by the SPEC and not used. Native
`<button>` gives Enter **and** Space for free, and Space does not scroll (N5-AC8).

Exactly one focusable element per row (N5-AC2).

**Satisfies:** N5-AC1a, N5-AC2, N5-AC8.

### Step 25 — the card snippet

```svelte
{#snippet itemCard(item: (typeof data.items)[number])}
	<li
		class="relative rounded-lg border bg-card transition-colors hover:bg-accent/40 has-[button:focus-visible]:outline has-[button:focus-visible]:outline-2 has-[button:focus-visible]:-outline-offset-2 has-[button:focus-visible]:outline-ring"
		data-name={item.name}
	>
		<button
			type="button"
			onclick={() => (editingId = item.id)}
			class="flex w-full min-w-0 cursor-pointer flex-col gap-2 p-3 text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
		>
			<span class="sr-only">Edit </span>
			<span class="flex min-w-0 items-start justify-between gap-2">
				<span class="min-w-0">
					<span class="block truncate font-medium text-foreground">{item.name}</span>
					<span class="block truncate text-xs text-muted-foreground">
						{item.category}{#if item.serialNumber}<span class="tabular-nums">
								· {item.serialNumber}</span
							>{/if}
					</span>
				</span>
				<span class="shrink-0"><Badge status={item.status} domain="inventory" /></span>
			</span>

			<span class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground">
				<span class="tabular-nums text-foreground">{item.quantity} {item.unit}</span>
				{#if item.location}<span class="min-w-0 truncate">{item.location}</span>{/if}
				{#if item.value != null}
					<span class="ml-auto shrink-0 tabular-nums text-foreground"
						>{formatCurrency(Number(item.value))}</span
					>
				{/if}
			</span>

			<span class="flex min-w-0 items-center gap-1.5 border-t pt-2 text-xs text-muted-foreground">
				<span class="shrink-0">Holder</span>
				<span aria-hidden="true">·</span>
				<span class="min-w-0 truncate text-foreground"
					>{item.assignedTo ? empName(item.assignedTo) : 'Unassigned'}</span
				>
			</span>
		</button>
	</li>
{/snippet}

{#snippet cardGrid()}
	<ul class="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-2 xl:grid-cols-3">
		{#each data.items as item (item.id)}{@render itemCard(item)}{/each}
	</ul>
{/snippet}
```

**Every element inside the `<button>` is a `<span>`.** A `<button>` may contain phrasing content
only; a `<div>` or `<p>` in there is invalid HTML and browsers recover from it by splitting the
button. This is the detail card-as-button implementations get wrong, and it is why
`Table.svelte:119-121` refused to make its mobile cards clickable.

The card is used twice: `view=grid` at every width, and `view=list` below `sm` (the `sm:hidden`
wrapper in step 23). Both the row and the card carry `data-name` and CSS hides one — which is why
the e2e helper must match the **visible** one (step 31, SPEC R8).

**Satisfies:** N5-AC1a, N5-AC2, N5-AC3, N5-AC8.

### Step 26 — delete the footer hint

Current, verbatim (`:340-343`):

```svelte
			<p class="text-xs text-muted-foreground">
				Edit a row's fields and press <span class="font-medium">Save</span>. Setting status to
				<span class="font-medium">Assigned</span> requires choosing an employee.
			</p>
```

**Deleted.** Sentence one is false after this change — there are no row fields and no row Save. The
`<caption class="sr-only">` in step 24 covers the screen-reader half. Sentence two moves into the
modal as the status field's `aria-describedby` hint (step 27) — a constraint stated 500px from the
control it constrains is a footnote; stated under the control and announced with it, it is a field
hint. **N5-AC8 requires exactly this placement.**

### Step 27 — the one shared create/edit dialog

Rendered **once**, as a sibling of the `<section>`, outside the view branch — so list and grid share
it verbatim and neither knows the other exists. This is the D13+D15 merge: `creating` drives the
create path, `editing` the edit path, and there is **one** set of ten fields.

```svelte
{#if dialogOpen}
	<Dialog
		open
		onclose={() => {
			editingId = null
			creating = false
		}}
		labelledBy="inv-edit-title"
		size="wide"
		scroll
		zIndex={50}
	>
		<div class="flex items-start justify-between gap-3 pb-4">
			<div class="min-w-0">
				<h2 id="inv-edit-title" class="truncate text-lg font-semibold">
					{creating ? 'Add an item' : `Edit ${editing?.name}`}
				</h2>
			</div>
			{#if !creating && editing}
				<ConfirmButton
					action="?/remove"
					title="Delete item?"
					message="This permanently removes {editing.name} from the registry."
					triggerLabel="Delete"
					triggerClass="btn-row-danger shrink-0"
					submit={afterDelete}
				>
					<input type="hidden" name="id" value={editing.id} />
				</ConfirmButton>
			{/if}
		</div>

		<form
			method="POST"
			action={creating ? '?/create' : '?/update'}
			use:enhance={save.enhance}
			class="flex min-h-0 flex-1 flex-col"
		>
			{#if !creating && editing}
				<input type="hidden" name="id" value={editing.id} />
			{/if}

			<div class="min-h-0 flex-1 overflow-y-auto border-t pt-4">
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="grid gap-1.5 sm:col-span-2">
						<label for="i-name" class="text-sm font-medium"
							>Name <span class="text-destructive" aria-hidden="true">*</span></label
						>
						<input
							id="i-name"
							name="name"
							value={editing?.name ?? ''}
							required
							maxlength="120"
							class={inputClass}
						/>
					</div>

					<div class="grid gap-1.5">
						<label for="i-category" class="text-sm font-medium">Category</label>
						<input
							id="i-category"
							name="category"
							list="categories"
							value={editing?.category ?? ''}
							maxlength="60"
							class={inputClass}
						/>
					</div>

					<div class="grid grid-cols-[1fr_6rem] gap-3">
						<div class="grid gap-1.5">
							<label for="i-qty" class="text-sm font-medium">Quantity</label>
							<input
								id="i-qty"
								name="quantity"
								type="number"
								min="0"
								value={editing?.quantity ?? 1}
								class="{inputClass} text-right tabular-nums"
							/>
						</div>
						<div class="grid gap-1.5">
							<label for="i-unit" class="text-sm font-medium">Unit</label>
							<input
								id="i-unit"
								name="unit"
								value={editing?.unit ?? ''}
								maxlength="20"
								class={inputClass}
							/>
						</div>
					</div>

					<div class="grid gap-1.5">
						<label for="i-location" class="text-sm font-medium">Location</label>
						<input
							id="i-location"
							name="location"
							value={editing?.location ?? ''}
							maxlength="120"
							class={inputClass}
						/>
					</div>

					<div class="grid gap-1.5">
						<label for="i-serial" class="text-sm font-medium">Serial / tag</label>
						<input
							id="i-serial"
							name="serialNumber"
							value={editing?.serialNumber ?? ''}
							maxlength="120"
							class="{inputClass} tabular-nums"
						/>
					</div>

					<div class="grid gap-1.5">
						<label for="i-status" class="text-sm font-medium">Status</label>
						<select id="i-status" name="status" aria-describedby="i-status-hint" class={inputClass}>
							{#each Object.entries(INVENTORY_STATUS_LABELS) as [val, label] (val)}
								<option value={val} selected={editing?.status === val}>{label}</option>
							{/each}
						</select>
						<p id="i-status-hint" class="text-xs text-muted-foreground">
							Assigned needs an employee below. Any other status clears the holder.
						</p>
					</div>

					<div class="grid gap-1.5">
						<label for="i-assigned" class="text-sm font-medium">Assigned to</label>
						<select id="i-assigned" name="assignedToId" class={inputClass}>
							<option value="">— unassigned —</option>
							{#each data.employees as e (e.id)}
								<option value={e.id} selected={editing?.assignedToId === e.id}>{empName(e)}</option>
							{/each}
							{#if editing?.assignedTo && !data.employees.some((e) => e.id === editing.assignedToId)}
								<!-- Assignee is inactive/offboarded but keep them selectable so a save
								     doesn't silently drop the assignment. -->
								<option value={editing.assignedToId} selected
									>{empName(editing.assignedTo)} — no longer active</option
								>
							{/if}
						</select>
					</div>

					<div class="grid gap-1.5">
						<label for="i-value" class="text-sm font-medium">Value (₱)</label>
						<input
							id="i-value"
							name="value"
							type="number"
							min="0"
							step="0.01"
							value={editing?.value == null ? '' : Number(editing.value)}
							class="{inputClass} text-right tabular-nums"
						/>
					</div>

					<div class="grid gap-1.5 sm:col-span-2">
						<label for="i-notes" class="text-sm font-medium">Notes</label>
						<textarea
							id="i-notes"
							name="notes"
							rows="2"
							maxlength="2000"
							class="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>{editing?.notes ?? ''}</textarea
						>
					</div>
				</div>
			</div>

			<div class="mt-4 flex items-center justify-end gap-2 border-t pt-4">
				<button
					type="button"
					onclick={() => {
						editingId = null
						creating = false
					}}
					class="h-9 rounded-md border px-4 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>Cancel</button
				>
				<button
					type="submit"
					disabled={save.busy}
					class="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
					>{save.busy ? 'Saving…' : creating ? 'Create item' : 'Save'}</button
				>
			</div>
		</form>
	</Dialog>
{/if}
```

The existing inactive-assignee comment from `:276-279` is carried across **verbatim** — same words,
same two lines. Only its surroundings changed.

**The ten field names are exactly `itemSchema`'s** (`+page.server.ts:46-61`): `name, category,
quantity, unit, location, status, assignedToId, serialNumber, value, notes` — plus `id` on update
only, which the `update` action reads at `:114`. **Zero server change** (N5-AC4).

**`notes` is present in both modes.** Today it exists in the Add form and has no table column. That
is the drift D15 removes — one form, one set of fields, they cannot disagree.

**Delete is a header-row sibling of the edit form, not a Save-row neighbour.** `ConfirmButton`
renders its own `<form class="contents">` (`ConfirmButton.svelte:52`); putting it on the Save row
would nest a form inside a form — invalid HTML. The header sits outside the scrolling body, so
Delete is permanently visible (N5-AC5).

**`size` / `scroll` / `zIndex`, with the no-overflow argument:**

| Prop | Value | Why, with the number |
|---|---|---|
| `scroll` | **set** | `Dialog.svelte:125` — `scroll` is the *only* thing that adds `flex max-h-[90vh] flex-col overflow-hidden`. Without it the panel has **no max-height at all**, and the backdrop's `items-center` centres an over-tall panel so both ends clip off-screen and Save becomes unreachable. Measured body heights: **~1008px at 390** (10 field rows, 1 column), **~696px at 1280** (6 rows, 2 columns). Both exceed a 720px viewport minus chrome. The owner's measured `innerHeight` has been as low as **314px**. `scroll` is mandatory, not stylistic. |
| `size` | `"wide"` | `max-w-lg` / `sm:max-w-2xl` / `lg:max-w-4xl`. At `lg` (512) the `sm:grid-cols-2` field grid gives 236px columns, which truncates employee names in the assignee select. `wide` gives 2xl/4xl above `sm`; below `sm` the backdrop's `p-4` caps it at 358px at 390 anyway. |
| `zIndex` | `50` | `ConfirmDialog` is hard-wired to **60**. A dialog that contains one must sit below it or the confirm paints underneath. `TimesheetModal.svelte:305` passes 50 for exactly this reason. |
| `initialFocus` | left at the default `'panel'` | `Dialog.svelte:28` documents that panel-focus and a self-focusing control race each other. Do **not** autofocus the Name field. |

With `scroll`, the panel is `flex max-h-[90vh] flex-col overflow-hidden`, the form is
`flex min-h-0 flex-1 flex-col`, the field grid is `min-h-0 flex-1 overflow-y-auto`. Header, Delete
and the Save/Cancel row are always on screen; **only the fields scroll** (N5-AC1b). This is
`RequestCreateDialog.svelte:98,104,108` copied exactly.

No `{@const}` anywhere in the dialog — it is outside any `{#each}` that would need one, which also
removes the `{@const}`-placement hazard the current row has.

**Satisfies:** N5-AC1b, N5-AC4, N5-AC5, N5-AC6, N5-AC8.

### Step 28 — delete the per-row edit forms

Everything between the old `<tbody>` and the section's close that is not replaced by steps 23-26 —
the nine cell editors, the `form="edit-{id}"` indirection, the per-row `<form method="POST"
action="?/update">`, the per-row `Save` button and the per-row `ConfirmButton` Delete — is removed
by the step-23/24 replacement. Confirm afterwards:

```bash
grep -n 'form="edit-\|cellInputClass\|saveGuard\|createSubmitGuard' "src/routes/(app)/inventory/+page.svelte"
```

Expected output: **nothing**. Any hit is a leftover. **Satisfies:** N5-AC2.

### Step 29 — verify the server surface did not move

```bash
git diff --stat -- "src/routes/(app)/inventory/+page.server.ts"
git diff -- "src/routes/(app)/inventory/+page.server.ts" | grep -E '^[+-]' | grep -v '^[+-][+-]'
```

Expected: exactly **two** changed lines, both in `load` — the `view` const and the `return`. If the
diff touches `itemSchema` or any `actions` entry, the step is wrong. **Satisfies:** N5-AC4.

### Step 30 — rewrite `tests/e2e/inventory.spec.ts`

Alongside the page, not after it. Full contents in §Test plan N5. The `#114` header comment at
lines 4-6 is carried across **verbatim**. **Satisfies:** all eight N5 criteria.

### Step 31 — run both negative controls and record them

§Negative controls. Both mutations, both red results, both reverted. Non-optional — SPEC calls both
mandatory.

### Step 32 — gates for N5

```bash
bun run format:check && bun run lint && bun run check && bun run test
CI=1 bun run exec dotenv -e .env.dev -- playwright test tests/e2e/inventory.spec.ts
```

### Step 33 — N5 owner step (manual)

The owner opens `/inventory` in **light and dark** at 390 and 1280, in both views, and confirms the
row/card focus indicator reads correctly (N5-AC8's Hybrid half). They also confirm the modal at a
deliberately short window. Record in the phase report.

### Step 34 — **Commit 3**, then the full-suite gate (Commit 4 if it needs a fix)

---

# Test plan

Three files. Every assertion below is stated exactly. No source-scanning unit test is written
anywhere in this lane — SPEC hazard 1 is avoided by construction, not by care: there is no
file-wide predicate to be red on arrival, because there is no file-wide predicate.

**Runner.** `bun run test:e2e -- <spec>` does **not** filter — it silently runs the whole suite. The
working form is:

```bash
CI=1 bun run exec dotenv -e .env.dev -- playwright test <specs>
```

**Parallelism.** Playwright is `fullyParallel: true`, and `pagination.spec.ts:13-14` seeds 25
`Zzpagetest` employees with best-effort cleanup at `:67-79`. Therefore: **every spec here that
counts rows declares `test.describe.configure({ mode: 'serial' })` and reads its totals from the
page, never from a fixture constant.** `inventory.spec.ts` already does this at line 7; the two new
specs adopt it.

---

## N2 — `tests/e2e/settings-context-rail.spec.ts` (new)

```ts
import { test, expect, type Page } from '@playwright/test'
import { login, USERS } from './helpers'
import {
	SETTINGS_GROUP_ORDER,
	visibleSettings,
	type SettingsDestination
} from '../../src/lib/settings-destinations'

// The group row counts GROUPS, not destinations — and a role that can reach no destination in a
// group does not get that group's chip. MANAGER has neither System entry, so MANAGER sees FOUR
// chips where SUPER_ADMIN sees five. Every expectation here is derived from the role's own
// visible set for that reason; a hardcoded 5 would be red on a correct MANAGER page.
test.describe.configure({ mode: 'serial' })

const bar = (page: Page) => page.getByRole('navigation', { name: 'Settings sections' })
const hub = (page: Page) => page.getByRole('region', { name: 'Settings destinations' })

const ROLES = [
	{ label: 'Super Admin', user: USERS.admin, roles: ['SUPER_ADMIN'] as const },
	{ label: 'HR Admin', user: USERS.hr, roles: ['HR_ADMIN'] as const },
	{ label: 'Manager', user: USERS.manager, roles: ['MANAGER'] as const }
]

const expected = (roles: readonly string[]) => {
	const visible = visibleSettings(roles as never) as SettingsDestination[]
	const groups = SETTINGS_GROUP_ORDER.filter((g) => visible.some((d) => d.group === g))
	return { visible, groups }
}
```

**N2-T1 — "bar lists groups only"** (proves **N2-AC1**)

```ts
for (const { label, user, roles } of ROLES) {
	test(`bar lists groups only — ${label}`, async ({ page }) => {
		const { visible, groups } = expected(roles)
		await login(page, user)
		await page.goto('/settings', { waitUntil: 'domcontentloaded' })

		// All settings + one link per visible group. Derived, never a literal.
		await expect(bar(page).getByRole('link')).toHaveCount(groups.length + 1)
		await expect(bar(page).getByRole('link', { name: 'All settings' })).toBeVisible()
		for (const g of groups) {
			await expect(bar(page).getByRole('link', { name: g, exact: true })).toHaveCount(1)
		}
		// No destination label appears in the bar at all, on the hub.
		for (const d of visible) {
			await expect(bar(page).getByRole('link', { name: d.label, exact: true })).toHaveCount(0)
		}
	})
}
```

**N2-T2 — "no destination is listed twice on the hub"** (proves **N2-AC2**)

```ts
for (const { label, user, roles } of ROLES) {
	test(`no destination is listed twice on the hub — ${label}`, async ({ page }) => {
		const { visible } = expected(roles)
		await login(page, user)
		await page.goto('/settings', { waitUntil: 'domcontentloaded' })
		for (const d of visible) {
			await expect(bar(page).getByRole('link', { name: d.label, exact: true })).toHaveCount(0)
			await expect(hub(page).getByRole('link', { name: d.label, exact: true })).toHaveCount(1)
		}
	})
}
```

The role-negative half of N2-AC2 is `settings-visibility.spec.ts:57-58`, run unchanged.

**N2-T3 — "siblings only, sub-page only"** (proves **N2-AC3**)

```ts
test('siblings only, sub-page only', async ({ page }) => {
	await login(page, USERS.admin)

	await page.goto('/settings', { waitUntil: 'domcontentloaded' })
	// The hub has no current destination, so the sibling row is not rendered at all.
	await expect(bar(page).locator('> div')).toHaveCount(1)

	await page.goto('/settings/holidays', { waitUntil: 'domcontentloaded' })
	await expect(bar(page).locator('> div')).toHaveCount(2)

	const siblingRow = bar(page).locator('> div').nth(1)
	// Holiday Calendar's group is Time & Attendance: Work Schedules, Holiday Calendar, Leave Types.
	await expect(siblingRow.getByRole('link', { name: 'Work Schedules', exact: true })).toHaveCount(1)
	await expect(siblingRow.getByRole('link', { name: 'Leave Types', exact: true })).toHaveCount(1)
	// A destination from another group must not leak in.
	await expect(siblingRow.getByRole('link', { name: 'Salary Grades', exact: true })).toHaveCount(0)
	await expect(
		siblingRow.getByRole('link', { name: 'Company Information', exact: true })
	).toHaveCount(0)
	// The current page is marked current.
	await expect(
		siblingRow.getByRole('link', { name: 'Holiday Calendar', exact: true })
	).toHaveAttribute('aria-current', 'page')
})
```

**N2-T4 — "search filters the cards only"** (proves **N2-AC4**; SPEC R10 guarded)

```ts
test('search filters the cards only', async ({ page }) => {
	await login(page, USERS.admin)
	await page.goto('/settings', { waitUntil: 'domcontentloaded' })

	// Title-row placement: vertical alignment AND horizontal separation. An overlap cannot
	// satisfy both, which is what stops this passing for the wrong reason (SPEC R10).
	const heading = await page.getByRole('heading', { name: 'Settings', level: 1 }).boundingBox()
	const search = await page.getByLabel('Search settings').boundingBox()
	expect(heading && search).toBeTruthy()
	expect(Math.abs(heading!.y + heading!.height / 2 - (search!.y + search!.height / 2))).toBeLessThan(24)
	expect(search!.x).toBeGreaterThan(heading!.x + heading!.width)

	const cards = hub(page).getByRole('link')
	const before = await cards.count()
	const barLinksBefore = await bar(page).getByRole('link').count()
	const mainLinksBefore = await page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('link')
		.count()

	await page.getByLabel('Search settings').fill('holiday')
	await expect(cards).toHaveCount(1)
	expect(await cards.count()).toBeLessThan(before)
	// The filter touches the cards and nothing else.
	await expect(bar(page).getByRole('link')).toHaveCount(barLinksBefore)
	await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveCount(
		mainLinksBefore
	)

	// Clearing restores the full set.
	await page.getByLabel('Search settings').fill('')
	await expect(cards).toHaveCount(before)

	// A no-match string names the typed text in the empty state.
	await page.getByLabel('Search settings').fill('zzzznope')
	await expect(cards).toHaveCount(0)
	await expect(page.getByText('zzzznope')).toBeVisible()
})
```

**N2-T5 — "one line at three widths and three roles"** (proves **N2-AC5**)

```ts
test('one line at three widths and three roles', async ({ browser }) => {
	for (const width of [390, 1280, 1920]) {
		const heights: number[] = []
		for (const { user } of ROLES) {
			const ctx = await browser.newContext({ viewport: { width, height: 900 } })
			const page = await ctx.newPage()
			await login(page, user)
			await page.goto('/settings', { waitUntil: 'domcontentloaded' })
			const box = await bar(page).locator('> div').first().boundingBox()
			heights.push(box!.height)
			await ctx.close()
		}
		// Structural: the row counts groups, not destinations, so 17 / 14 / 12 cannot change it.
		expect(new Set(heights.map((h) => Math.round(h))).size).toBe(1)
		// And it is ONE line: a single chip is ~36px tall; two wrapped rows would exceed 60.
		expect(heights[0]).toBeLessThan(60)
	}
})
```

**N2-T6 — "no sideways scroll"** (proves **N2-AC5**)

```ts
test('no sideways scroll', async ({ browser }) => {
	for (const width of [390, 1280, 1920]) {
		const ctx = await browser.newContext({ viewport: { width, height: 900 } })
		const page = await ctx.newPage()
		await login(page, USERS.admin)
		for (const path of ['/settings', '/settings/holidays']) {
			await page.goto(path, { waitUntil: 'domcontentloaded' })
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			)
			expect(overflow, `${path} at ${width}`).toBe(0)
		}
		await ctx.close()
	}
})
```

**N2-T7 — "keyboard order, current-state and focus rings"** (proves **N2-AC6**, automated half)

```ts
test('keyboard order, current-state and focus rings', async ({ page }) => {
	await login(page, USERS.admin)
	await page.goto('/settings', { waitUntil: 'domcontentloaded' })

	// Current-state tokens: "page" for the hub link, "true" for a selected group filter.
	await expect(bar(page).getByRole('link', { name: 'All settings' })).toHaveAttribute(
		'aria-current',
		'page'
	)
	await page.goto('/settings?g=payroll', { waitUntil: 'domcontentloaded' })
	await expect(bar(page).getByRole('link', { name: 'Payroll', exact: true })).toHaveAttribute(
		'aria-current',
		'true'
	)

	// A visible focus ring on EVERY bar link. Assert the COMPUTED style, not a bounding box —
	// a box cannot tell a ring from no ring, and this bar has no focus style at all today.
	const links = bar(page).getByRole('link')
	for (let i = 0; i < (await links.count()); i++) {
		await links.nth(i).focus()
		const shadow = await links.nth(i).evaluate((el) => getComputedStyle(el).boxShadow)
		expect(shadow, `bar link ${i}`).not.toBe('none')
	}

	// Tab order: All settings -> group links -> search -> first card.
	await page.goto('/settings', { waitUntil: 'domcontentloaded' })
	await bar(page).getByRole('link', { name: 'All settings' }).focus()
	const groupCount = (await bar(page).getByRole('link').count()) - 1
	for (let i = 0; i < groupCount; i++) await page.keyboard.press('Tab')
	await page.keyboard.press('Tab')
	await expect(page.getByLabel('Search settings')).toBeFocused()
	await page.keyboard.press('Tab')
	await expect(hub(page).getByRole('link').first()).toBeFocused()

	// The match count is announced politely.
	await expect(page.locator('[aria-live="polite"]')).toHaveCount(1)
})
```

**Hybrid half of N2-AC6:** step 8 — the owner confirms the ring is *visible* in light and dark. The
repo has no automated contrast or focus-visibility gate; that is why this half is not automated and
is not recorded as proven until the owner answers.

**Existing specs run unchanged:** `tests/e2e/settings-visibility.spec.ts` in full;
`tests/unit/settings-cards.test.ts` and `tests/unit/settings-destinations.test.ts` green (they
assert off the **load**, not the markup, so N2 cannot move them — but they must still be seen green,
per SPEC R9).

---

## N3 — `tests/e2e/employees-new-layout.spec.ts` (new)

```ts
import { test, expect, type Page } from '@playwright/test'
import { login, USERS } from './helpers'

test.describe.configure({ mode: 'serial' })

const formCol = (page: Page) => page.locator('form[action="?/create"] > div').first()
const rail = (page: Page) => page.locator('form[action="?/create"] aside')

const at = async (page: Page, width: number) => {
	await page.setViewportSize({ width, height: 900 })
	await page.goto('/employees/new', { waitUntil: 'domcontentloaded' })
}
```

**N3-T1 — "form column widths at six viewports"** (proves **N3-AC1**; SPEC R12 guarded)

```ts
const WIDTHS: [number, number][] = [
	[390, 358],
	[1024, 720],
	[1280, 976],
	[1440, 1136],
	[1536, 944],
	[1920, 1328]
]

test('form column widths at six viewports', async ({ page }) => {
	await login(page, USERS.admin)
	for (const [viewport, expectedWidth] of WIDTHS) {
		await at(page, viewport)
		const box = await formCol(page).boundingBox()
		expect(Math.abs(box!.width - expectedWidth), `${viewport}px`).toBeLessThanOrEqual(8)
	}
	// R12 explicitly: 1280 and 1440 must be WIDER than today's 768 cap. If the gate is written
	// as xl: instead of 2xl:, 1280 silently becomes 688 and this is the assertion that catches it.
	for (const viewport of [1280, 1440]) {
		await at(page, viewport)
		const box = await formCol(page).boundingBox()
		expect(box!.width, `${viewport}px must beat the old 768 cap`).toBeGreaterThan(768)
	}
})
```

**N3-T2 — "no sideways scroll"** (proves **N3-AC1**)

```ts
test('no sideways scroll', async ({ page }) => {
	await login(page, USERS.admin)
	for (const [viewport] of WIDTHS) {
		await at(page, viewport)
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		)
		expect(overflow, `${viewport}px`).toBe(0)
	}
})
```

**N3-T3 — "rail is a sticky aside at 1536 and 1920"** (proves **N3-AC2**)

```ts
test('rail is a sticky aside at 1536 and 1920', async ({ page }) => {
	await login(page, USERS.admin)
	for (const viewport of [1536, 1920]) {
		await at(page, viewport)
		const form = await formCol(page).boundingBox()
		const aside = await rail(page).boundingBox()
		expect(Math.abs(aside!.width - 256), `${viewport}px width`).toBeLessThanOrEqual(4)
		// To the RIGHT of the form, and not overlapping it (SPEC R10: alignment alone can lie).
		expect(aside!.x).toBeGreaterThanOrEqual(form!.x + form!.width)

		const topBefore = aside!.y
		await page.mouse.wheel(0, 600)
		await page.waitForTimeout(150)
		const topAfter = (await rail(page).boundingBox())!.y
		expect(Math.abs(topAfter - topBefore), `${viewport}px sticky`).toBeLessThanOrEqual(8)

		await expect(rail(page).getByRole('navigation', { name: 'Form sections' })).toBeVisible()
		await expect(rail(page).getByRole('button', { name: 'Create Employee' })).toBeVisible()
		// The error count and jump link exist only after a rejected submit.
		await expect(rail(page).getByText(/need(s)? attention/)).toHaveCount(0)
	}
})
```

**N3-T4 — "no rail at 1440"** (proves **N3-AC2**, the other side of the boundary)

```ts
test('no rail at 1440', async ({ page }) => {
	await login(page, USERS.admin)
	await at(page, 1440)
	const form = await formCol(page).boundingBox()
	const aside = await rail(page).boundingBox()
	expect(Math.abs(form!.width - 1136)).toBeLessThanOrEqual(8)
	// Not a 256px column: at 1440 the aside is a full-width block under the form.
	expect(aside!.width).toBeGreaterThan(400)
	expect(aside!.y).toBeGreaterThan(form!.y + form!.height - 8)
})
```

**N3-T5 — "rail contents stack under the form below 2xl"** (proves **N3-AC3**)

```ts
test('rail contents stack under the form below 2xl', async ({ page }) => {
	await login(page, USERS.admin)
	for (const viewport of [390, 1024, 1280, 1440]) {
		await at(page, viewport)
		const form = await formCol(page).boundingBox()
		const aside = await rail(page).boundingBox()
		expect(aside!.y, `${viewport}px is under the form`).toBeGreaterThan(form!.y + form!.height - 8)
		expect(Math.abs(aside!.width - form!.width), `${viewport}px full width`).toBeLessThanOrEqual(8)
		// Create Employee is last inside the aside.
		const sections = await rail(page)
			.getByRole('navigation', { name: 'Form sections' })
			.boundingBox()
		const create = await rail(page).getByRole('button', { name: 'Create Employee' }).boundingBox()
		expect(create!.y).toBeGreaterThanOrEqual(sections!.y)
		// The section links are in the document and keyboard-reachable — not `hidden`.
		await expect(
			rail(page).getByRole('navigation', { name: 'Form sections' }).getByRole('link')
		).toHaveCount(4)
		await rail(page).getByRole('link', { name: 'Employment Details' }).focus()
		await expect(rail(page).getByRole('link', { name: 'Employment Details' })).toBeFocused()
		// Not pinned: it scrolls with the page.
		const before = (await rail(page).boundingBox())!.y
		await page.mouse.wheel(0, 400)
		await page.waitForTimeout(150)
		expect((await rail(page).boundingBox())!.y).toBeLessThan(before)
	}
})
```

**N3-T6 — "jump to first error works at 390"** (proves **N3-AC3**, **N3-AC6**)

```ts
test('jump to first error works at 390', async ({ page }) => {
	await login(page, USERS.admin)
	await at(page, 390)
	// Submit with only the name filled, so the server rejects and the first invalid field is
	// deterministic and near the top of FIELD_ORDER.
	await page.getByLabel('First Name').fill('E2E')
	await page.getByRole('button', { name: 'Create Employee' }).click()
	const jump = page.getByRole('link', { name: 'Go to the first one' })
	await expect(jump).toBeVisible()
	await jump.click()
	const focused = await page.evaluate(() => document.activeElement?.id ?? '')
	expect(focused).not.toBe('')
	expect(focused).not.toBe('body')
	// It is the first invalid field in PAGE order, and it is really invalid.
	const isInvalid = await page.evaluate(
		(id) => document.getElementById(id)?.getAttribute('aria-invalid'),
		focused
	)
	expect(isInvalid).toBe('true')
})
```

**N3-T7 — "exactly one Create Employee and one Cancel at six widths"** (proves **N3-AC4**; SPEC R1)

```ts
test('exactly one Create Employee and one Cancel at six widths', async ({ page }) => {
	await login(page, USERS.admin)
	for (const [viewport] of WIDTHS) {
		await at(page, viewport)
		// DOM-level counts: querySelectorAll does NOT skip hidden nodes, so a `hidden 2xl:block`
		// duplicate is counted. A toHaveCount(1) on the visible-role locator would pass with a
		// hidden duplicate that still breaks admin.spec.ts:49's strict-mode locator.
		const counts = await page.evaluate(() => {
			const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()
			const all = [...document.querySelectorAll('button, a, input[type=submit]')]
			return {
				create: all.filter((el) => text(el) === 'Create Employee').length,
				cancel: all.filter((el) => text(el) === 'Cancel').length
			}
		})
		expect(counts.create, `Create Employee at ${viewport}px`).toBe(1)
		expect(counts.cancel, `Cancel at ${viewport}px`).toBe(1)
	}
})
```

> **Hazard-2 note on this test.** `Cancel` is **2** on the untouched tree (header `:80-82` + submit
> row `:579`), so this assertion is red before step 15 and green after. It ships in the **same
> commit** as the deletion. `Create Employee` is **1** today and 1 after, so that half is green on
> both sides and only reds on a real duplicate — which is what it is for.

**N3-T8 — "disclosure text frozen"** (proves **N3-AC5**)

```ts
test('disclosure text frozen', async ({ page }) => {
	await login(page, USERS.admin)
	await at(page, 1280)
	await expect(page.locator('details > summary')).toHaveText('Complete later — 12 optional fields')
	// It spans the form column with nothing beside it.
	const form = await formCol(page).boundingBox()
	const det = await page.locator('details').boundingBox()
	expect(Math.abs(det!.width - form!.width)).toBeLessThanOrEqual(56)
})
```

**N3-T9 — "opening the disclosure does not move the rail"** (proves **N3-AC5**)

```ts
test('opening the disclosure does not move the rail', async ({ page }) => {
	await login(page, USERS.admin)
	await at(page, 1920)
	const before = await rail(page).boundingBox()
	await page.locator('details > summary').click()
	await expect(page.locator('details')).toHaveAttribute('open', '')
	const after = await rail(page).boundingBox()
	expect(after!.y).toBe(before!.y)
	expect(after!.x).toBe(before!.x)
})
```

**N3-T10 — "tab order unchanged above and below 2xl"** (proves **N3-AC6**)

```ts
const TAB_ORDER = [
	'firstName','lastName','middleName','contactPhone','contactAddress','email','password',
	'role','discordId','departmentId','jobTitle','employmentType','startDate','rateType',
	'basicSalary','reportsToId','positionId','workScheduleId'
]

test('tab order unchanged above and below 2xl', async ({ page }) => {
	await login(page, USERS.admin)
	for (const viewport of [1280, 1920]) {
		await at(page, viewport)
		await page.locator('#firstName').focus()
		for (let i = 1; i < TAB_ORDER.length; i++) {
			await page.keyboard.press('Tab')
			const id = await page.evaluate(() => document.activeElement?.id ?? '')
			// DatePicker and TimePicker wrap their inputs; skip a stop that is not a named field.
			if (id !== TAB_ORDER[i]) {
				await page.keyboard.press('Tab')
			}
			expect(
				await page.evaluate(() => document.activeElement?.id ?? ''),
				`${viewport}px stop ${i}`
			).toBe(TAB_ORDER[i])
		}
		// Then the disclosure summary, then the rail — same elements, both sides of the breakpoint.
		await page.keyboard.press('Tab')
		await expect(page.locator('details > summary')).toBeFocused()
	}
})
```

> **Execution note for this test.** `DatePicker` (Start Date) and any composite control may insert
> an extra tab stop. Run it once against the built page and, if a stop is inserted, replace the
> single-skip fallback above with the measured exact sequence and delete the fallback. Do **not**
> loosen the assertion to "contains" — the criterion is an order, not a set.

**N3-T11 — "one h1"** (proves **N3-AC6**)

```ts
test('one h1', async ({ page }) => {
	await login(page, USERS.admin)
	await at(page, 1280)
	await expect(page.locator('h1')).toHaveCount(1)
})
```

**Hybrid half of N3-AC6:** step 8's sibling for N3 — the owner confirms the rail controls' focus
ring in both themes.

**Existing spec run unchanged:** `tests/e2e/admin.spec.ts` in full.

---

## N5 — `tests/e2e/inventory.spec.ts` (rewritten alongside)

The `#114` header comment (lines 4-6) is carried across **verbatim**. `test.describe.configure({
mode: 'serial' })` at line 7 stays — it is already there and it is required (fixture drift).

**The helper, line 10.** Both the row and the card carry `data-name` and CSS hides one, so an
element-name selector double-counts (SPEC R8).

```ts
// was: page.locator(`tr[data-name="${name}"]`)
const row = (page: import('@playwright/test').Page, name: string) =>
	page.locator(`[data-name="${name}"]:visible`)
```

Lines 18, 19, 25, 26, 29 keep working unchanged against it — Playwright's default 1280 renders the
table branch.

**Lines 38-39 become** (proves **N5-AC4**):

```ts
await page.getByRole('button', { name: 'Add item' }).click()
const create = page.getByRole('dialog', { name: 'Add an item' })
await create.locator('#i-name').fill('E2E Monitor')
await create.getByRole('button', { name: 'Create item' }).click()
await expect(row(page, 'E2E Monitor')).toBeVisible()
```

**Lines 43-44 become** (proves **N5-AC5**):

```ts
await row(page, 'E2E Monitor').click()
const dlg = page.getByRole('dialog', { name: /^Edit E2E Monitor$/ })
await dlg.locator('select[name="status"]').selectOption('ASSIGNED')
await dlg.getByRole('button', { name: 'Save' }).click()
await expect(page.getByText(/Select an employee/)).toBeVisible()
```

**Lines 48-49 become** (proves **N5-AC6** — this is the `reset:false` guard):

```ts
// The modal is still open from the rejected save, and the user's edit is still in it.
await expect(dlg).toBeVisible()
await expect(dlg.locator('select[name="status"]')).toHaveValue('ASSIGNED')
await dlg.locator('select[name="assignedToId"]').selectOption({ index: 1 })
await dlg.getByRole('button', { name: 'Save' }).click()
await expect(dlg).toHaveCount(0)
await expect(page.getByText(/Select an employee/)).toHaveCount(0)
```

**Lines 53-54 become** (proves **N5-AC5**, **N5-AC7**):

```ts
await row(page, 'E2E Monitor').click()
await page
	.getByRole('dialog', { name: /^Edit E2E Monitor$/ })
	.getByRole('button', { name: 'Delete' })
	.click()
// ConfirmDialog is role="alertdialog", so line 54's disambiguation still works.
await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
await expect(row(page, 'E2E Monitor')).toHaveCount(0)
// Focus did not fall to <body> — assert by identity, not "something is focused".
const landed = await page.evaluate(() => {
	const el = document.activeElement
	const list = document.querySelector('section[tabindex="-1"]')
	return {
		isBody: el === document.body,
		attached: !!el && document.contains(el),
		inList: !!el && !!list && (el === list || list.contains(el))
	}
})
expect(landed.isBody).toBe(false)
expect(landed.attached).toBe(true)
expect(landed.inList).toBe(true)
```

**New scenarios**, in full:

```ts
test('no sideways scroll at three widths in both views', async ({ page }) => {   // N5-AC1a
	await login(page, USERS.admin)
	for (const view of ['list', 'grid']) {
		for (const width of [390, 1280, 1920]) {
			await page.setViewportSize({ width, height: 900 })
			await page.goto(view === 'grid' ? '/inventory?view=grid' : '/inventory', {
				waitUntil: 'domcontentloaded'
			})
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			)
			expect(overflow, `${view} at ${width}`).toBe(0)
			// No descendant of the items panel is wider than the panel.
			const wider = await page.evaluate(() => {
				const panel = document.querySelector('section[tabindex="-1"]')!
				const w = panel.getBoundingClientRect().width
				return [...panel.querySelectorAll('*')].filter(
					(el) => el.getBoundingClientRect().width > w + 1
				).length
			})
			expect(wider, `${view} at ${width}`).toBe(0)
		}
	}
})

test('modal fits three viewports including a short one', async ({ page }) => {   // N5-AC1b
	await login(page, USERS.admin)
	for (const [w, h] of [[390, 844], [1280, 720], [1280, 360]] as const) {
		await page.setViewportSize({ width: w, height: h })
		await page.goto('/inventory', { waitUntil: 'domcontentloaded' })
		await row(page, 'Office Chair').click()
		const dlg = page.getByRole('dialog', { name: /^Edit Office Chair$/ })
		const box = await dlg.boundingBox()
		expect(box!.height, `${w}x${h} panel height`).toBeLessThanOrEqual(h * 0.9 + 1)
		for (const part of [
			dlg.getByRole('heading', { name: /^Edit Office Chair$/ }),
			dlg.getByRole('button', { name: 'Delete' }),
			dlg.getByRole('button', { name: 'Save' }),
			dlg.getByRole('button', { name: 'Cancel' })
		]) {
			const b = await part.boundingBox()
			expect(b!.y, `${w}x${h}`).toBeGreaterThanOrEqual(0)
			expect(b!.y + b!.height, `${w}x${h}`).toBeLessThanOrEqual(h)
		}
		await page.keyboard.press('Escape')
	}
})

test('rows carry no controls', async ({ page }) => {                              // N5-AC2
	await login(page, USERS.admin)
	for (const url of ['/inventory', '/inventory?view=grid']) {
		await page.goto(url, { waitUntil: 'domcontentloaded' })
		const counts = await row(page, 'Office Chair').evaluate((el) => ({
			focusable: el.querySelectorAll(
				'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
			).length,
			editors: el.querySelectorAll('input, select, textarea').length
		}))
		expect(counts.focusable, url).toBe(1)
		expect(counts.editors, url).toBe(0)
	}
	// No per-row form anywhere on the page.
	expect(await page.locator('section[tabindex="-1"] form').count()).toBe(0)
})

test('view toggle defaults to list and survives reload', async ({ page }) => {    // N5-AC3
	await login(page, USERS.admin)
	await page.goto('/inventory', { waitUntil: 'domcontentloaded' })
	const toggle = page.getByRole('group', { name: 'View' })
	await expect(toggle.getByRole('link')).toHaveCount(2)
	await expect(toggle.getByRole('link', { name: 'List' })).toHaveAttribute('aria-current', 'page')
	await expect(page.locator('table')).toBeVisible()

	await toggle.getByRole('link', { name: 'Grid' }).click()
	await expect(page).toHaveURL(/view=grid/)
	await expect(toggle.getByRole('link', { name: 'Grid' })).toHaveAttribute('aria-current', 'page')
	await expect(page.locator('table')).toHaveCount(0)
	await page.reload({ waitUntil: 'domcontentloaded' })
	await expect(toggle.getByRole('link', { name: 'Grid' })).toHaveAttribute('aria-current', 'page')

	await toggle.getByRole('link', { name: 'List' }).click()
	await expect(page.locator('table')).toBeVisible()
})

test('both views open the same modal', async ({ page }) => {                      // N5-AC3
	await login(page, USERS.admin)
	for (const url of ['/inventory', '/inventory?view=grid']) {
		await page.goto(url, { waitUntil: 'domcontentloaded' })
		await row(page, 'Office Chair').click()
		await expect(page.getByRole('dialog', { name: /^Edit Office Chair$/ })).toBeVisible()
		await page.keyboard.press('Escape')
	}
})

test('add item uses the shared modal', async ({ page }) => {                      // N5-AC4
	await login(page, USERS.admin)
	await page.goto('/inventory', { waitUntil: 'domcontentloaded' })
	// The old <details> add form is gone.
	await expect(page.getByText('Add an item', { exact: true })).toHaveCount(0)
	await expect(page.locator('#a-name')).toHaveCount(0)

	const names = (d: ReturnType<typeof page.getByRole>) =>
		d.locator('[name]').evaluateAll((els) =>
			els.map((e) => e.getAttribute('name')).filter((n) => n !== 'id').sort()
		)

	await page.getByRole('button', { name: 'Add item' }).click()
	const create = page.getByRole('dialog', { name: 'Add an item' })
	await expect(create.getByRole('button', { name: 'Create item' })).toBeVisible()
	const createNames = await names(create)
	await page.keyboard.press('Escape')

	await row(page, 'Office Chair').click()
	const edit = page.getByRole('dialog', { name: /^Edit Office Chair$/ })
	await expect(edit.getByRole('button', { name: 'Save' })).toBeVisible()
	const editNames = await names(edit)

	// The identical ten fields, including notes — which the row-edit form never had.
	expect(createNames).toEqual(editNames)
	expect(createNames).toEqual([
		'assignedToId','category','location','name','notes','quantity',
		'serialNumber','status','unit','value'
	])
})

test('inactive holder is preserved on save', async ({ page }) => {                // N5-AC5
	await login(page, USERS.admin)
	await page.goto('/inventory', { waitUntil: 'domcontentloaded' })
	await row(page, 'MacBook Pro 14').click()
	const dlg = page.getByRole('dialog', { name: /^Edit MacBook Pro 14$/ })
	const assigned = dlg.locator('select[name="assignedToId"]')
	const selectedBefore = await assigned.inputValue()
	// Save without touching the assignment.
	await dlg.getByRole('button', { name: 'Save' }).click()
	await expect(dlg).toHaveCount(0)
	await row(page, 'MacBook Pro 14').click()
	await expect(
		page.getByRole('dialog', { name: /^Edit MacBook Pro 14$/ }).locator('select[name="assignedToId"]')
	).toHaveValue(selectedBefore)
	await page.keyboard.press('Escape')
})

test('row is a button with a name', async ({ page }) => {                         // N5-AC8
	await login(page, USERS.admin)
	for (const url of ['/inventory', '/inventory?view=grid']) {
		await page.goto(url, { waitUntil: 'domcontentloaded' })
		const btn = row(page, 'Office Chair').getByRole('button')
		await expect(btn).toHaveCount(1)
		await expect(btn).toHaveAccessibleName(/^Edit .*Office Chair/)
		expect(await btn.evaluate((el) => el.tagName)).toBe('BUTTON')
		expect(await btn.evaluate((el) => el.getAttribute('type'))).toBe('button')
	}
	// role="button" on a <tr> is banned.
	expect(await page.locator('tr[role="button"]').count()).toBe(0)
})

test('Enter and Space both open, Space does not scroll', async ({ page }) => {    // N5-AC8
	await login(page, USERS.admin)
	await page.goto('/inventory', { waitUntil: 'domcontentloaded' })
	const btn = row(page, 'Office Chair').getByRole('button')

	await btn.focus()
	await page.keyboard.press('Enter')
	await expect(page.getByRole('dialog', { name: /^Edit Office Chair$/ })).toBeVisible()
	await page.keyboard.press('Escape')

	await btn.focus()
	const yBefore = await page.evaluate(() => window.scrollY)
	await page.keyboard.press(' ')
	await expect(page.getByRole('dialog', { name: /^Edit Office Chair$/ })).toBeVisible()
	expect(await page.evaluate(() => window.scrollY)).toBe(yBefore)
	await page.keyboard.press('Escape')
})

test('focus on open, on close, and after delete', async ({ page }) => {           // N5-AC8
	await login(page, USERS.admin)
	await page.goto('/inventory', { waitUntil: 'domcontentloaded' })
	const btn = row(page, 'Office Chair').getByRole('button')
	await btn.focus()
	await page.keyboard.press('Enter')
	const dlg = page.getByRole('dialog', { name: /^Edit Office Chair$/ })
	await expect(dlg).toBeVisible()
	// Focus moved into the dialog.
	expect(
		await page.evaluate(() => {
			const d = document.querySelector('[role="dialog"]')
			return !!d && (document.activeElement === d || d.contains(document.activeElement))
		})
	).toBe(true)
	await page.keyboard.press('Escape')
	// Focus returned to the exact row button that opened it.
	await expect(btn).toBeFocused()
})
```

> **`toBeVisible()` is never used to assert a reveal anywhere in this lane.** Playwright treats an
> `opacity: 0` element as visible. The two reveal-shaped assertions here — the focus ring (N2-T7)
> and the focus indicator on a row — use `getComputedStyle` / `toHaveCSS`, not visibility. Where a
> tooltip-style reveal ever needs asserting, the form is `toHaveCSS('opacity', '1')`.

---

## Negative controls

Both are mandatory. Both are run **from a committed clean state**, so the revert is a
`git checkout` against a known-good tree. Record the mutation, the exact red output, and the
revert, in the phase report.

### NC-1 — `update()`'s default reset (proves **N5-AC6** is not vacuous)

**Mutation.** `src/routes/(app)/inventory/+page.svelte`, in `save`:

```diff
-			await update({ reset: false })
+			await update()
```

**Run:** `CI=1 bun run exec dotenv -e .env.dev -- playwright test tests/e2e/inventory.spec.ts -g "enforces the assign invariant"`

**Expected failure, exactly:**

```
Error: expect(locator).toHaveValue(expected)
Locator: getByRole('dialog', { name: /^Edit E2E Monitor$/ }).locator('select[name="status"]')
Expected string: "ASSIGNED"
Received string: "IN_STOCK"
```

The rejected save blanks the form back to its HTML defaults; the status reverts. **If this stays
green, the test is proving nothing and the guard is not wired** — that is the failure this repo has
recorded twice (`sveltekit-update-resets-the-form`).

**Revert:** `git checkout -- "src/routes/(app)/inventory/+page.svelte"`

### NC-2 — post-delete focus (proves **N5-AC7** is not vacuous)

**Mutation.** Same file, in `afterDelete`:

```diff
 			editingId = null
-			listEl?.focus()
```

**Run:** `CI=1 bun run exec dotenv -e .env.dev -- playwright test tests/e2e/inventory.spec.ts -g "enforces the assign invariant"`

**Expected failure, exactly:**

```
Error: expect(received).toBe(expected)
Expected: false
Received: true
   expect(landed.isBody).toBe(false)
```

`Dialog`'s restore calls `trigger?.focus()` on a node that the delete removed, so focus falls to
`<body>`.

**Revert:** `git checkout -- "src/routes/(app)/inventory/+page.svelte"`

> **Both reverts use `git checkout <file>`, which silently discards uncommitted work in that file.**
> Do the mutations **after** Commit 3 is in, and confirm `git status --short` shows the file clean
> before mutating. This repo has been burned by exactly this.

---

## Gates — in CI order, after each commit

CI stops at the first failure, so run them in this order and do not skip ahead:

```bash
bun install --frozen-lockfile
bunx prisma generate
bun run format:check
bun run lint
bun run check
bun run test
```

then, for the e2e half:

```bash
bunx prisma db push --skip-generate
bunx tsx prisma/seed-e2e.ts
bunx playwright install --with-deps chromium
bun run test:e2e
```

Per-commit, before the full suite, the narrow runs are:

| After | Narrow e2e run |
|---|---|
| Commit 1 (N2) | `CI=1 bun run exec dotenv -e .env.dev -- playwright test tests/e2e/settings-context-rail.spec.ts tests/e2e/settings-visibility.spec.ts` |
| Commit 2 (N3) | `CI=1 bun run exec dotenv -e .env.dev -- playwright test tests/e2e/employees-new-layout.spec.ts tests/e2e/admin.spec.ts` |
| Commit 3 (N5) | `CI=1 bun run exec dotenv -e .env.dev -- playwright test tests/e2e/inventory.spec.ts` |
| After all three | `bun run test:e2e` — the **full** suite, unfiltered |

Two operational notes, both recorded in the repo's test context:

- `bun run test:e2e -- <spec>` **does not filter**. It silently runs everything. Use the
  `playwright test <specs>` form above when you want a subset.
- Run `bunx prisma generate` before believing a red `bun run check` — a missing client produces
  type errors that look like source errors.
- Never `bun test` bare; bun shadows it. Always `bun run <script>`.

---

## Commit plan

Four commits, one per finished unit. Explicit paths every time — **never `git add -A`**. No
`Co-Authored-By`, no AI attribution, no generated-with footer.

### Commit 1 — N2

```bash
git add src/lib/settings-destinations.ts \
        "src/routes/(app)/settings/+layout.svelte" \
        "src/routes/(app)/settings/+page.svelte" \
        tests/e2e/settings-context-rail.spec.ts \
        tests/e2e/settings-visibility.spec.ts
```

```
feat(settings): replace the destination bar with a group Context Rail

/settings listed all 17 destinations twice — once in the sub-nav bar and again
as the hub cards below it. The bar now lists the five groups instead, and a
sibling row appears only on a sub-page, where there is a current destination to
have siblings. On the hub there are none, so the second row is not rendered and
the duplicate is gone by construction.

A search box on the Settings title row filters the cards, and every link in the
bar gains a visible focus ring — it had none.

The unscoped link-count assertions in settings-visibility.spec.ts are untouched;
they guard the very duplication this removes. Its comment above them said the
locator matched three links, which stops being true here.
```

### Commit 2 — N3

```bash
git add "src/routes/(app)/employees/new/+page.svelte" \
        tests/e2e/employees-new-layout.spec.ts
```

```
feat(employees): give the hire form the full width and a companion rail

The 768px cap goes. The form column is wider at every width above 1024 and never
narrower: 976 at 1280, 1136 at 1440, 944 at 1536, 1328 at 1920.

From 1536 up, a 256px sticky aside carries the count of rejected fields, a jump
to the first one, the section links and the single Create Employee button. Below
1536 the same elements — not a second copy — stack as a full-width block under
the form, so the DOM holds exactly one Create Employee and the strict-mode
locator in admin.spec.ts keeps resolving.

The bottom submit row goes with its duplicate Cancel; the header keeps the only
one. The first invalid field is picked in page order, not in whatever order the
server wrote its keys, and the jump moves focus rather than only scrolling.
```

### Commit 3 — N5

```bash
git add "src/routes/(app)/inventory/+page.svelte" \
        "src/routes/(app)/inventory/+page.server.ts" \
        tests/e2e/inventory.spec.ts
```

```
feat(inventory): read-only rows, two views, one shared edit modal

The table needed 1438px and had 942 at 1280, so it scrolled sideways on a normal
laptop. Nine editors per row move into one modal; the row becomes a single real
button stretched over its width, so Enter and Space both open it and Space does
not scroll the page.

The same modal creates, so the separate Add form goes — it was a second copy of
the same ten fields and had already drifted: notes lived there and nowhere else.
A list and a card grid share one toggle and one modal, defaulting to list.

A rejected save keeps the modal open with the edits intact, which needs
update({ reset: false }); the default would blank them and the test would still
pass. Focus after a delete goes to the list, because the row button the dialog
would restore to no longer exists.

The three server actions and itemSchema are unchanged — the modal posts the same
field names. The load reads a view parameter and nothing else.
```

### Commit 4 — only if the full suite needs a fix

Scope it to whatever the full run turned red, with a message naming that failure.

---

## Lane split

**The two lanes can run at the same time. There is zero file overlap.**

| Owner | Files |
|---|---|
| **Design lane (this plan)** | `src/lib/settings-destinations.ts`, `settings/+layout.svelte`, `settings/+page.svelte`, `employees/new/+page.svelte`, `inventory/+page.svelte`, `inventory/+page.server.ts`, `tests/e2e/settings-context-rail.spec.ts`, `tests/e2e/employees-new-layout.spec.ts`, `tests/e2e/inventory.spec.ts`, `tests/e2e/settings-visibility.spec.ts` (comment only) |
| **Build lane** | `src/lib/components/ui/PageHeader.svelte`, `components/attendance/AttendanceHrGrid.svelte`, `separations/+page.svelte`, `settings/org/+page.server.ts`, `settings/org/+page.svelte`, `tests/unit/page-header-helptip.test.ts`, `tests/e2e/page-header-helptip.spec.ts`, `tests/e2e/attendance-view-switch.spec.ts`, `tests/e2e/employee-view-only.spec.ts`, `tests/e2e/separations.spec.ts`, `tests/unit/settings-org-load.test.ts`, `tests/e2e/settings-org-assignments.spec.ts` |

Disjoint. Two lanes, one branch, no merge conflict.

**Two sequencing notes, neither of which blocks parallel work:**

1. **N7 changes `/settings` and `/inventory` headers underneath this lane.** Both pass a
   `description`, so after N7 the grey line becomes a `?` beside the title. Nothing in this plan
   asserts on the description's rendering, and the N2 search control is laid out by the page
   **beside** `PageHeader`, never inside it — so N7 landing first, second, or during changes
   nothing here. **No step of this plan removes `relative` from the title row** (SPEC R4:
   `HelpTip` anchors to `PageHeader.svelte:35`'s `relative` div, and dropping it mis-positions every
   tooltip in the app with no compile error). This plan does not edit `PageHeader.svelte` at all.
2. **Owner sign-off on N2's title row happens after N7 lands**, per the SPEC, because the owner is
   judging a row whose other half N7 owns. Step 8 can run before N7 for the focus-ring half; the
   layout half waits.

One cross-lane test note: the build lane's `settings-org-assignments.spec.ts` runs on
`/settings/org`, which under N2 gains a sibling row in the settings nav. If that spec uses an
unscoped link locator, N2 can turn it red through no fault of its own. **Whichever lane lands
second runs the other's specs before committing.** The full-suite gate catches it either way.

---

## Rollback

Each item is one commit, so each rolls back on its own.

| Item | Rollback | Blast |
|---|---|---|
| **N2** | `git revert <commit 1>` | `/settings` and all 17 sub-pages return to the wrapping 17-link bar and the unfiltered card grid. `groupSlug` disappears with it — it has no other consumer. `?g=` becomes an ignored query param. The unscoped assertions at `settings-visibility.spec.ts:57-58` pass before and after, so the revert is provable with an existing test. |
| **N3** | `git revert <commit 2>` | `/employees/new` returns to the 768px centred column with two Cancels and the bottom submit row. `admin.spec.ts` passes on both sides of the revert — its strict-mode `Create Employee` locator resolves to exactly one element either way. No data path is involved. |
| **N5** | `git revert <commit 3>` | `/inventory` returns to the nine-editor row and the separate Add form, and to its sideways scroll at 1280. **No data migration, no server change to undo** — `?/create`, `?/update`, `?/remove` and `itemSchema` were never touched, so items created or edited through the modal are indistinguishable from ones created through the old form. `?view=grid` becomes an ignored query param. |

No step in this plan writes to the database, changes a permission, changes a schema, or changes a
server action. There is nothing to un-migrate in any of the three.

---

## Verification Evidence

| Gate / Scenario | Strategy | Proves SPEC criterion |
|---|---|---|
| `settings-context-rail.spec.ts` › "bar lists groups only" | Fully-Automated | N2-AC1 |
| `settings-context-rail.spec.ts` › "no destination is listed twice on the hub" + unchanged `settings-visibility.spec.ts:57-58` | Fully-Automated | N2-AC2 |
| `settings-context-rail.spec.ts` › "siblings only, sub-page only" | Fully-Automated | N2-AC3 |
| `settings-context-rail.spec.ts` › "search filters the cards only" | Fully-Automated | N2-AC4 |
| `settings-context-rail.spec.ts` › "one line at three widths and three roles" + "no sideways scroll" | Fully-Automated | N2-AC5 |
| `settings-context-rail.spec.ts` › "keyboard order, current-state and focus rings" + owner theme check (step 8) | Hybrid | N2-AC6 |
| `employees-new-layout.spec.ts` › "form column widths at six viewports" + "no sideways scroll" | Fully-Automated | N3-AC1 |
| `employees-new-layout.spec.ts` › "rail is a sticky aside at 1536 and 1920" + "no rail at 1440" | Fully-Automated | N3-AC2 |
| `employees-new-layout.spec.ts` › "rail contents stack under the form below 2xl" + "jump to first error works at 390" | Fully-Automated | N3-AC3 |
| `employees-new-layout.spec.ts` › "exactly one Create Employee and one Cancel at six widths" (DOM counts) + unchanged `admin.spec.ts` | Fully-Automated | N3-AC4 |
| `employees-new-layout.spec.ts` › "disclosure text frozen" + "opening the disclosure does not move the rail" + `admin.spec.ts:128,159` | Fully-Automated | N3-AC5 |
| `employees-new-layout.spec.ts` › "tab order unchanged above and below 2xl" + "jump to first error works at 390" + "one h1" + owner theme check (step 8) | Hybrid | N3-AC6 |
| `inventory.spec.ts` › "no sideways scroll at three widths in both views" + "modal fits three viewports including a short one" | Fully-Automated | N5-AC1 |
| `inventory.spec.ts` › "rows carry no controls" | Fully-Automated | N5-AC2 |
| `inventory.spec.ts` › "view toggle defaults to list and survives reload" + "both views open the same modal" | Fully-Automated | N5-AC3 |
| `inventory.spec.ts` › "add item uses the shared modal" (+ field-name comparison) + step-29 server diff check | Fully-Automated | N5-AC4 |
| `inventory.spec.ts` › "delete from the modal" + "assign invariant enforced" + "inactive holder is preserved on save" | Fully-Automated | N5-AC5 |
| `inventory.spec.ts` › "failed save preserves the edit" + **NC-1** | Fully-Automated | N5-AC6 |
| `inventory.spec.ts` › "focus after delete lands on the list" + **NC-2** | Fully-Automated | N5-AC7 |
| `inventory.spec.ts` › "row is a button with a name" + "Enter and Space both open, Space does not scroll" + "focus on open, on close, and after delete" + owner theme check (step 33) | Hybrid | N5-AC8 |

**Vacuous-green statement.** No criterion in this lane is proved by Known-Gap. All 20 have at least
one Fully-Automated or Hybrid gate. The three Hybrid criteria (N2-AC6, N3-AC6, N5-AC8) are Hybrid
for one reason only — the repo has no automated contrast or focus-visibility gate, so the "is the
ring *visible*" half needs an owner's eye. Every other half of each is automated.

---

## Test Infra Improvement Notes

Found while writing this plan. None blocks the lane; all three are real.

1. **No automated focus-visibility or contrast gate.** It is the single reason three of twenty
   criteria are Hybrid rather than Fully-Automated. A computed-style assertion can prove a
   `box-shadow` is not `none` (N2-T7 does), but it cannot prove the ring has contrast against its
   background in either theme. Candidate backlog item.
2. **`bun run test:e2e -- <spec>` silently ignores its filter** and runs the whole suite. This is
   already recorded in the repo's test context and in a backlog note
   (`e2e-spec-filter-silently-ignored_NOTE_10-09-26.md`), and every gate in this plan works around
   it. It keeps costing every agent the same 15 minutes.
3. **`/settings/org` and the settings sub-nav have no coverage at all today** (SPEC R9) — neither
   e2e nor unit. N2's new spec closes the sub-nav half. `/settings/org` is the build lane's, and is
   getting its first spec there.

---

## Traceability

All 20 SPEC criteria → steps → tests. **No criterion is without a step, and no criterion is without
a test.**

| Criterion | Steps | Test |
|---|---|---|
| N2-AC1 | 1, 2 | N2-T1 |
| N2-AC2 | 2, 3, 4 | N2-T2 + unchanged `settings-visibility.spec.ts` |
| N2-AC3 | 1, 2 | N2-T3 |
| N2-AC4 | 3 | N2-T4 |
| N2-AC5 | 2 | N2-T5, N2-T6 |
| N2-AC6 | 2, 3, 8 | N2-T7 + owner theme check |
| N3-AC1 | 11, 12, 13 | N3-T1, N3-T2 |
| N3-AC2 | 12, 15 | N3-T3, N3-T4 |
| N3-AC3 | 10, 15 | N3-T5, N3-T6 |
| N3-AC4 | 15 | N3-T7 + unchanged `admin.spec.ts` |
| N3-AC5 | 13, 14 | N3-T8, N3-T9 + `admin.spec.ts:128,159` |
| N3-AC6 | 10, 15, 18 | N3-T10, N3-T6, N3-T11 + owner theme check |
| N5-AC1 | 24, 25, 27 | "no sideways scroll…", "modal fits three viewports…" |
| N5-AC2 | 24, 25, 28 | "rows carry no controls" |
| N5-AC3 | 20, 21, 23, 25 | "view toggle defaults to list…", "both views open the same modal" |
| N5-AC4 | 22, 27, 29 | "add item uses the shared modal" + step-29 diff check |
| N5-AC5 | 26, 27 | rewritten lines 53-54, "inactive holder is preserved on save", "assign invariant" |
| N5-AC6 | 21, 27 | rewritten lines 48-49 + **NC-1** |
| N5-AC7 | 21, 23 | post-delete focus block + **NC-2** |
| N5-AC8 | 24, 25, 26, 27 | "row is a button with a name", "Enter and Space…", "focus on open, on close…" + owner theme check |

**Holes: none.** Every one of the 20 has a step and a gate.

---

## Risks carried from the SPEC, and where each is answered

| SPEC risk | Answered by |
|---|---|
| R1 strict-mode `Create Employee` | Step 15 (one set of elements, no `hidden` pair) + N3-T7 DOM-level count at six widths |
| R2 frozen summary string | Steps 13/14 leave `:411-413` untouched + N3-T8 exact-string assertion |
| R3 stale `settings-visibility.spec.ts:32-34` comment | Step 4, same commit as N2 |
| R4 N7 changes both headers underneath | §Lane split note 1 — this plan never edits `PageHeader.svelte` and never removes `relative` |
| R5 `float-left` legend vs grid | Step 13 keeps every legend above its fields; no `ml-*` matching margin exists to drift |
| R6 `update()` default reset | Step 21 `update({ reset: false })` + **NC-1** |
| R7 post-delete focus to `<body>` | Steps 21/23 `listEl?.focus()` + **NC-2**, asserted by identity |
| R8 `inventory.spec.ts` row locators | Step 30's `:visible` helper + the line-by-line rewrite, alongside the page |
| R9 `/settings` sub-nav has no coverage | Step 5's new spec is required, not optional; the two unit specs run and are seen green |
| R10 bounding boxes pass for the wrong reason | N2-T4 and N3-T3 assert vertical alignment **and** horizontal separation — overlap satisfies neither pair |
| R11 `table-fixed` truncates | Accepted, out of scope to mitigate |
| R12 the `2xl` gate is one character | Step 12's arithmetic + N3-T1's six measured widths **and** its explicit `> 768` assertion at 1280/1440, + N3-T4 asserting the boundary from the far side |

---

## Resume and Execution Handoff

1. **Selected plan file:**
   `process/features/ui-ux-overhaul/active/owner-click-pass-design-lane_18-09-26/owner-click-pass-design-lane_PLAN_18-09-26.md`
2. **Last completed phase or step:** PLAN written. No source file touched. Step 1 is next.
3. **Validate-contract status:** pending — vc-validate-agent writes it before EXECUTE.
4. **Supporting context loaded:** the design-lane SPEC; the three design reports in
   `owner-click-pass-design-round_18-09-26/`; the build-lane SPEC and PLAN (for lane split);
   `phase-07-page-splits_PLAN_03-09-26.md:85-86,617` (the never-touch list); `CLAUDE.md`;
   `process/context/all-context.md` and its uxui + tests routing targets.
5. **Next step for a fresh agent:** run `git status --short` and confirm the three source files
   named in Commit 1 are clean, then start at **Step 1** — the one-line `groupSlug` append. The
   three items are independent; N2, N3 and N5 may be executed in any order or in three parallel
   lanes with the file ownership in §Lane split. Do **not** start the negative controls (step 31)
   until Commit 3 is in — both reverts use `git checkout <file>` and will discard uncommitted work.

---

---

## Acceptance Criteria

The 20 criteria are owned by the SPEC — `owner-click-pass-design-lane_SPEC_18-09-26.md` — and are
not restated or reworded here. This plan carries them by id; each id's wording lives in the SPEC and
that is the single source.

| Id | One-line restatement | Strategy | Proven by |
|---|---|---|---|
| N2-AC1 | The bar lists groups, not destinations | Fully-Automated | N2-T1 |
| N2-AC2 | `/settings` renders each destination exactly once, countably | Fully-Automated | N2-T2 + unchanged `settings-visibility.spec.ts:57-58` |
| N2-AC3 | The sibling row appears only on sub-pages and holds only siblings | Fully-Automated | N2-T3 |
| N2-AC4 | Search sits top-right on the title row and filters destinations only | Fully-Automated | N2-T4 |
| N2-AC5 | One line, no sideways scroll, every role, every width | Fully-Automated | N2-T5, N2-T6 |
| N2-AC6 | Landmark, current-state, focus, announcement | Hybrid | N2-T7 + owner theme check (step 8) |
| N3-AC1 | Full bleed, measured, never narrower than today | Fully-Automated | N3-T1, N3-T2 |
| N3-AC2 | The rail is a sticky aside at `2xl` and up | Fully-Automated | N3-T3, N3-T4 |
| N3-AC3 | Below `2xl` the same four things stack, and the jump control survives | Fully-Automated | N3-T5, N3-T6 |
| N3-AC4 | Exactly one `Create Employee` and one `Cancel`, at every width | Fully-Automated | N3-T7 + unchanged `admin.spec.ts` |
| N3-AC5 | The disclosure is unchanged in text and behaviour, and does not move the rail | Fully-Automated | N3-T8, N3-T9 + `admin.spec.ts:128,159` |
| N3-AC6 | Tab order, jump behaviour, focus | Hybrid | N3-T10, N3-T6, N3-T11 + owner theme check (step 8) |
| N5-AC1 | Nothing overflows: not the page, not the modal | Fully-Automated | "no sideways scroll…", "modal fits three viewports…" |
| N5-AC2 | The row is purely clickable; nothing on it edits | Fully-Automated | "rows carry no controls" |
| N5-AC3 | Two views, `/team`-style toggle, List by default | Fully-Automated | "view toggle defaults to list…", "both views open the same modal" |
| N5-AC4 | One modal for create and edit; the old add form is gone | Fully-Automated | "add item uses the shared modal" + step-29 server diff check |
| N5-AC5 | Delete lives in the modal, behind a confirm, assign invariant holds | Fully-Automated | rewritten lines 53-54, "assign invariant", "inactive holder is preserved on save" |
| N5-AC6 | A rejected save keeps the modal open AND keeps the edits | Fully-Automated | rewritten lines 48-49 + **NC-1** |
| N5-AC7 | Focus after a delete never falls to `<body>` | Fully-Automated | post-delete focus block + **NC-2** |
| N5-AC8 | The row is a real button, named, keyboard-complete, defined focus path | Hybrid | "row is a button…", "Enter and Space…", "focus on open, on close…" + owner theme check (step 33) |

**Coverage: 20 of 20.** No criterion is carried by Known-Gap, and none lacks a step (see
§Traceability).

---

## Phase Completion Rules

This lane is one phase with three committable units (N2, N3, N5) plus a contingency commit. It may
be marked:

- **CODE DONE** when Commits 1-3 exist, each narrow e2e run in §Gates is green, and the full
  `bun run test:e2e` is green in CI order against the recorded pre-change baseline.
- **VERIFIED** only when, in addition, **all** of the following hold:
  1. Both negative controls (**NC-1**, **NC-2**) have been run and recorded as going **red** on
     mutation with the exact failure text, and green again on revert.
  2. The owner has confirmed the three Hybrid halves on a live page in **light and dark** —
     N2-AC6's bar focus ring (step 8), N3-AC6's rail focus ring (step 8), and N5-AC8's row focus
     indicator in both views (step 33) — with the answers written into the phase report.
  3. `git diff --stat` confirms `src/routes/(app)/inventory/+page.server.ts` changed **exactly two
     lines**, both inside `load` (step 29). Any touch to `itemSchema` or an `actions` entry is a
     phase failure.
  4. `tests/e2e/settings-visibility.spec.ts` lines 57-58 are byte-identical to their pre-change
     state and pass.
- It may **not** be marked VERIFIED on a green suite with a negative control unrun. A criterion
  that stays green through its own mutation has not been proven, and this repo has lost time to
  exactly that on `update({ reset: false })` twice.
- It may **not** be marked VERIFIED while the owner's Hybrid confirmations are outstanding. There is
  no automated contrast or focus-visibility gate in this repo, so those three halves have no
  machine substitute.
- A commit whose `git diff --cached --name-only` contains `src/lib/rbac.ts`,
  `prisma/schema.prisma`, or any `src/lib/server/services/` path is a **phase failure**, not a
  deviation. Stop and re-plan.
- A commit staged with `git add -A` is a phase failure regardless of its contents.

---

## Post-phase testing

After the three commits land, run the **full** gate set in CI order (§Gates) — not a filtered
subset. `bun run test:e2e -- <spec>` does not filter and will silently run everything anyway, which
is the one case where that bug does no harm.

The specs most likely to catch a cross-lane regression, and which must be seen green by name:

- `tests/e2e/admin.spec.ts` — the strict-mode `Create Employee` locator and the frozen summary
  string (N3).
- `tests/e2e/settings-visibility.spec.ts` — the unscoped link-count guard on the duplication N2
  removes.
- `tests/unit/settings-cards.test.ts`, `tests/unit/settings-destinations.test.ts` — they assert off
  the load rather than the markup, so N2 cannot move them, but SPEC R9 requires them seen green.
- `tests/e2e/settings-org-assignments.spec.ts` — the build lane's, running on a page whose settings
  nav this lane changes. Whichever lane lands second runs the other's specs before committing.

## Validate Contract

(placeholder — vc-validate-agent writes this section before EXECUTE)
