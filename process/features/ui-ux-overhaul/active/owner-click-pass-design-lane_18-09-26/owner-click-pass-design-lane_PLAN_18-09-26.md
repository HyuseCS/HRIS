---
name: plan:owner-click-pass-design-lane
description: "Implementation plan for the three design-round items — N2 /settings Context Rail + destinations search, N3 /employees/new Companion Rail, N5 /inventory list+grid with one shared create/edit modal."
date: 18-09-26
feature: ui-ux-overhaul
---

# Owner click-pass design lane — PLAN

**Date**: 18-09-26
**Status**: PLANNED — awaiting VALIDATE
**Complexity**: COMPLEX (3 items, 6 source files, 20 SPEC criteria + 1 plan-added, 3 route surfaces, 2 mandatory negative controls, 1 e2e fixture)
**Feature**: ui-ux-overhaul
**Branch**: `feat/uiux-phase-7`
**Upstream SPEC**: `owner-click-pass-design-lane_SPEC_18-09-26.md` (same folder)
**INNOVATE**: deliberately skipped — the owner chose one direction per item on 18-09-26 (D4/D11, D5, D7/D12, D17, D8, D13/D9, D15). Those are inputs, not choices, and are not reopened here.

## TL;DR

Three pages, three files of real source each, 35 numbered steps, 4 commits. All 20 SPEC criteria
have a step and a test, plus 1 plan-added criterion (N5-AC9). Nothing touches `rbac.ts`,
`schema.prisma` or `services/**`. No new component.

**One finding is bigger than this lane: `/inventory` loses data today.** Every row save writes
`notes: null` over whatever the item had, because the row form posts ten fields and `notes` is not
one of them while `inputOf` sets it unconditionally. D15's single-modal merge fixes it for free;
N5-AC9 makes the fix an asserted behaviour instead of a side effect. Full chain in §The `notes`
defect.

**D19 (owner ruling, 18-09-26) changed how the tests are specified.** Exact e2e locators and
assertions are no longer written here — they are authored during EXECUTE against the real rendered
page, because the last three VALIDATE failures were all rendered-page properties that source
reading cannot see. What stays in the plan is what each test proves, the exact mutation that must
turn it red, the fixtures in full, and a mandatory four-step EXECUTE procedure: write it, see it
green, see it RED under the mutation, revert and see it green again. **A test that has not been
seen failing is not accepted.** No criterion lost its gate. See §Test plan.

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

Verified against the tree at `feat/uiux-phase-7` by reading each line. **Several cites carried over
from the design reports were off by a few lines and have been corrected here** — the reports are
right on substance and unreliable on line numbers, which is the same failure that blocked the
sibling lane. Do not re-derive the measurements; **do** re-verify any line number before editing at
it. Every cite below is one `sed -n` from being checked, and a stale one sends the next reader to
the wrong place with full confidence.

| Fact | Where | Value |
|---|---|---|
| Content width | `(app)/+layout.svelte:650-651` | `viewport − 304` from `lg`; `viewport − 32` below |
| `2xl` breakpoint | `tailwind.config.ts` — no `screens` key | stock **1536** |
| Page cap today | `employees/new/+page.svelte:78` | `mx-auto max-w-3xl` (768) |
| `Create Employee` count today | `employees/new/+page.svelte:585` | **1** |
| `Cancel` count today | `:80-82` header + `:579` submit row | **2** |
| Frozen summary | `:413` | `Complete later — 12 optional fields` |
| `OPTIONAL_FIELDS` length | `:43-55` | **11** entries (string says 12 — out of scope, do not fix) |
| Float legend | `:101-102` | `float-left … w-full` + `[&>legend+*]:clear-left` on the fieldset |
| Fieldset grid lines | `:103 :151 :177 :246 :423 :486 :523` | `sm:grid-cols-3/2/2/2/2/3/2` |
| Settings destinations | `settings-destinations.ts` | **17** total; `SETTINGS_GROUP_ORDER` = 5 |
| Capability-gated destinations | `settings-destinations.ts:77, 109, 118, 177, 185` (the `capabilities:` lines) | 5 gated, 12 ungated |
| `System` group membership | Review Schedule + Document Backup | **both gated** |
| Destinations by role | via `visibleSettings` | SUPER_ADMIN 17, HR_ADMIN 14, MANAGER 12 |
| **Groups by role** | derived from the two rows above | **SUPER_ADMIN 5, HR_ADMIN 5, MANAGER 4** |
| Settings bar focus style today | `settings/+layout.svelte:47-49` | **none** — colour only |
| Inventory table min width | `inventory/+page.svelte:194` `min-w-max` | ~1438px; 942 available at 1280 |
| `Dialog` max-height source | `Dialog.svelte:149` | only `scroll` adds `flex max-h-[90vh] flex-col overflow-hidden` |
| `Dialog` focus restore | `Dialog.svelte:85-87` — captures `activeElement`, restores with `trigger?.focus()` | detached node after a delete → `<body>` |
| `ConfirmDialog` z-index | `ConfirmDialog.svelte:34` | **60** — a parent dialog must be below it |
| `submitFeedback` update seam | `submit-feedback.svelte.ts:82,90` | returning a callback from `inner` suppresses the built-in `o.update()` |
| `paginate()` return | `src/lib/server/pagination.ts:53-63` | carries `total`, `totalPages`, `skip`, `take`, `label` |
| Seed inventory items | `prisma/seed-core.ts:938-978` | 3 items; first is `MacBook Pro 14"` **with a trailing quote**; **all three unassigned**; none has `notes` |
| **Row save erases `notes` today** | `inventory/+page.svelte:213-321` posts 10 fields, none is `notes`; `+page.server.ts:122` → `inputOf` at `:63-76` sets `notes: d.notes ?? null` | **live data loss** — see §The `notes` defect |
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

## The `notes` defect — pre-existing live data loss, fixed as a side effect

**Found while planning N5. It is not a design concern and it is bigger than this lane.** Stating it
here so it is not carried as a footnote, and adding a criterion so the fix is proven rather than
assumed.

### What is wrong today

Every row save on `/inventory` silently erases that item's `notes`. The chain, all three links read
from source:

1. The row edit form posts **ten** fields (`inventory/+page.svelte:213-321`) — `name`, `category`,
   `quantity`, `unit`, `location`, `status`, `assignedToId`, `serialNumber`, `value`, and the hidden
   `id`. **`notes` is not among them.** It has no table column and no row editor.
2. `update` parses the body and calls `inputOf(parsed.data)` (`+page.server.ts:122`).
3. `inputOf` (`:63-76`) builds a **complete** `InventoryInput` and sets `notes: d.notes ?? null`.

`notes` is `z.string().max(2000).optional()` (`:60`), so an absent field parses to `undefined`,
`?? null` turns it into `null`, and the update writes `null` over whatever was there. It is a full
overwrite, not a patch.

So: an item's notes can only be set through the "Add an item" form, and are destroyed by the next
edit of any other field on that item. Nobody would connect the two.

### Status and ownership

- **Severity:** silent, unrecoverable loss of user-entered data in shipped code. It is not a layout
  bug.
- **Cause of the drift:** the page has carried **two independent forms over the same ten fields**.
  `notes` exists in one and not the other. That divergence is exactly what D15 cites as the reason
  to merge them.
- **Is it in scope?** The *fix* is, incidentally and for free: D15's single shared modal renders all
  ten fields in both modes, so a save always posts a real `notes` value and there is nothing left to
  null. No server change is involved — `inputOf` is correct, it was being starved of a field.
- **What is NOT in scope:** recovering notes already destroyed. They are gone; there is no audit of
  the prior value to restore from. If the owner wants to know how much was lost, that is a separate
  query against the audit trail and a separate decision.
- **Do not let it ride as a side effect.** N5-AC9 below makes the preservation an asserted
  behaviour, so a future change that reintroduces a partial-field save on this page turns a test
  red instead of quietly resuming the data loss.

### N5-AC9 (plan-added) — a modal save preserves a non-empty `notes`

> Opening an item that has a non-empty `notes` shows that text in the modal. Changing a **different**
> field and saving leaves `notes` byte-identical when the item is reopened. Proven against a fixture
> item that actually has notes, because **no seed item does**.

*proven by:* e2e `inventory.spec.ts` › "a modal save preserves a non-empty notes value";
`strategy:` Fully-Automated

This criterion is **added by this plan**, not by the SPEC. It is recorded separately from the SPEC's
20 throughout this document so the SPEC's coverage count stays honest: **20 SPEC criteria + 1
plan-added = 21**. It should be folded into the SPEC on the next revision, and the defect itself
deserves a backlog note regardless of this lane
(`inventory-row-save-erases-notes_NOTE_18-09-26.md`) so it is recorded even if N5 is rolled back —
**rolling back Commit 3 reinstates the data loss.**

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
`reset:false` seam, the merged create/edit dialog, the
Context Rail chips, `groupSlug` — is taken from the reports as written.

---

# Implementation Checklist

35 steps — Step 5 is the new import pre-flight and Step 5a writes the spec it protects. Each step
names the file, quotes the current code, and gives the replacement.

## N2 — `/settings` Context Rail + destinations search (steps 1-9, incl. 5a)

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

### Step 5 — pre-flight: prove the `settings-destinations` import resolves under Playwright

**Do this before writing the spec, not after it fails.** N2-T1 and N2-T2 derive their expected
counts by importing `visibleSettings` and `SETTINGS_GROUP_ORDER` from the app's own module. If that
import does not resolve under Playwright's transform, **the spec does not run at all** — the file
errors at collection and Playwright reports zero tests for it. A zero is not a failure: the run goes
green and two criteria are proved by nothing. That silent-zero is the exact shape of the
vacuous-green problem this lane is being held to.

Note the import in the spec is a **relative** path (`../../src/lib/settings-destinations`), not the
`$lib` alias — `$lib` is a SvelteKit alias resolved by the Vite plugin, and the Playwright runner
does not necessarily carry it.

Write this throwaway file, run it, delete it:

```ts
// tests/e2e/_preflight.spec.ts — DELETE after this step
import { test, expect } from '@playwright/test'
import { SETTINGS_GROUP_ORDER, visibleSettings } from '../../src/lib/settings-destinations'

test('settings-destinations resolves under the Playwright runner', () => {
	expect(SETTINGS_GROUP_ORDER).toHaveLength(5)
	expect(visibleSettings(['SUPER_ADMIN'] as never)).toHaveLength(17)
	expect(visibleSettings(['MANAGER'] as never)).toHaveLength(12)
})
```

```bash
CI=1 bunx dotenv -e .env.dev -- playwright test tests/e2e/_preflight.spec.ts --reporter=list
```

**Read the output for the test count, not just for green.** `1 passed` is the pass. `0 passed`, `no
tests found`, or any resolution error is a fail, and the fix is one of:

- the module pulls in `$lib/rbac` (it does, at its first line) — if **that** alias is what fails,
  add the mapping the runner needs, or
- fall back to **not importing app code at all**: hardcode the three per-role expectations as
  literals in the spec, with a comment naming `settings-destinations.ts` as the source and the risk
  that they drift.

The fallback is acceptable and the silent zero is not. Record which path was taken in the phase
report. Delete `_preflight.spec.ts` before Commit 1 — `git status --short` must not show it.

### Step 5a — write `tests/e2e/settings-context-rail.spec.ts`

New file. Full contents in §Test plan N2. **Satisfies:** all six N2 criteria.

### Step 6 — gate run for N2

```bash
bun run format:check && bun run lint && bun run check && bun run test
```

`bunx prisma generate` first if `bun run check` is red for a `$types` reason.

### Step 7 — e2e run for N2

```bash
CI=1 bunx dotenv -e .env.dev -- playwright test tests/e2e/settings-context-rail.spec.ts tests/e2e/settings-visibility.spec.ts
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
		'basicMonthlySalary',
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

> **This list was verified against source, name by name, and one was wrong.** The field is
> `basicMonthlySalary` (`employees/new/+page.svelte:345`, confirmed at `+page.server.ts:82` and
> `tests/e2e/admin.spec.ts:48`) — **not** `basicSalary`. A name that does not exist on the page is
> permanently never invalid, so `invalid('basicSalary')` would be false forever and the
> jump-to-first-error would silently **skip the salary field** — one of the ten required ones.
>
> The full check, and its result: `grep -n 'name="' "src/routes/(app)/employees/new/+page.svelte"`
> yields 29 names in DOM order. All 18 required-block names above and all 11 `OPTIONAL_FIELDS`
> entries now match source exactly, in source order. The 29th name is `basicMonthlySalary` at :345;
> every other one was already correct. Re-run that grep and diff it against `FIELD_ORDER` before
> editing this list again — this defect class is invisible to the compiler and to a green suite.

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

**What `xl:` would actually cost, at both widths — not just 1280.** If this token is written as
`xl:` the rail appears from 1280 up, so the form column is wrong at **two** of the six measured
viewports, not one:

| Viewport | Correct (`2xl:`) | With `xl:` | Verdict |
|---|---|---|---|
| 1280 | 976 | **688** | narrower than today's 768 cap |
| 1440 | 1136 | **848** | 288px short — wider than 768, so a naive "is it wider than today" check passes |

The 1440 case is the dangerous one: 848 still beats 768, so a guard that only asked "wider than
today" would go green on it. N3-T1 asserts the **exact** width at all six viewports, which is what
catches 1440, and additionally asserts `> 768` at 1280 and 1440. Both halves are needed.

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

Current, verbatim (`:578-587`) — **the row ends at `:587`; `:588` is `</form>` and `:589` is `{/key}`, so delete the quoted markup, never the line range `578-589`**:

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
CI=1 bunx dotenv -e .env.dev -- playwright test tests/e2e/employees-new-layout.spec.ts tests/e2e/admin.spec.ts
```

`admin.spec.ts` **in full** — it is the strict-mode guard.

### Step 19 — **Commit 2**

---

## N5 — `/inventory` list + grid + one shared modal (steps 20-34)

### Step 20 — read the `view` parameter on the server

File: `src/routes/(app)/inventory/+page.server.ts`. **Two lines. Actions and `itemSchema` are not
touched.**

Current, verbatim (`:21-25` and `:43`):

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

`enhance` (already imported) stays. `cellInputClass` at `:24-25` is **deleted** — its only consumers
were the row editors. `inputClass` at `:22-23` stays and is reused by the modal verbatim.

Why this shape, precisely:

- **`update({ reset: false })` is the whole of SPEC R6.** SvelteKit's default `reset: true` resets
  the `<form>` to its HTML defaults, wiping the user's edits on a rejected save. The existing e2e
  would still pass, for the wrong reason. This repo has lost time to it twice
  (`sveltekit-update-resets-the-form`). N5-AC6's negative control proves the guard is real.
- Returning a callback from `inner` makes `submitFeedback` skip its own `o.update()`
  (`submit-feedback.svelte.ts:82,90` — `if (!after) await o.update()`; `:70` is `if (after) await after(o)`), so `update()` is called
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
		class="overflow-hidden rounded-lg border bg-card focus:outline-none"
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

		<div>
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

### Why this shell is NOT `/team`'s flex column, and why the thead does not stick

The N5 design report's toolbar sketch (§2.2) is lifted from `/team`, including
`flex min-h-0 flex-1 flex-col overflow-hidden` on the panel, `min-h-0 flex-1 overflow-y-auto` on the
body, and a `sticky top-0` thead. **On `/inventory` all four of those are dead code**, and shipping
them would be worse than useless — they would read as a working scrollport to the next person.

The reason is one line of context the report did not carry across. `/team` wraps its whole page in a
height-constrained flex column:

```svelte
<!-- team/+page.svelte:36 -->
<div class="flex min-h-[calc(100dvh-6rem)] flex-col gap-6 lg:h-[calc(100dvh-4rem)] lg:min-h-0">
```

`/inventory`'s page wrapper is `<div class="space-y-6">` (`inventory/+page.svelte:32`), and **no step
of this plan changes it.** Without an ancestor that has a bounded height, `flex-1` has nothing to
fill, `min-h-0` has nothing to shrink against, and the inner `overflow-y-auto` never becomes a
scrollport — so `sticky top-0` has no scrolling container to stick within and the thead simply
scrolls away with the page.

**Decision: drop them.** The section is a plain bordered panel and the whole page scrolls, which is
what `/inventory` does today. `tabindex="-1"` stays — it is the focus target, not a layout device.

The alternative — adding a `lg:h-[calc(100dvh-4rem)]` wrapper to match `/team` — is rejected here:
it is a second, unrequested layout change to a page already being rewritten, it has its own
overflow risk against the owner's "modals must not overflow / 314px innerHeight" rule, and **no SPEC
criterion asks for a viewport-fit inventory panel or a sticky header.** N5-AC1's no-overflow
assertions hold either way. If the owner later wants the registry to fit the viewport, that is a
separate item — there is already a backlog note in this feature for the same idea
(`queue-pages-not-viewport-fit_NOTE_18-09-26.md`).

**Satisfies:** N5-AC3, N5-AC7.

### Step 24 — the table snippet

Add above the `<section>`, with `const th = 'px-4 py-2 text-left text-xs font-medium text-muted-foreground'`
in the script (lifted from `EmployeeTable.svelte:12`):

```svelte
{#snippet itemTable()}
	<table class="hidden w-full table-fixed text-sm sm:table">
		<caption class="sr-only">Inventory items. Select an item to edit it.</caption>
		<thead class="border-b bg-muted/50">
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
									>{empName(editing.assignedTo)}</option
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

The existing inactive-assignee comment from `:277-278` is carried across **verbatim** — same words,
same two lines. Only its surroundings changed.

**The preserved option's label is `{empName(editing.assignedTo)}`, unsuffixed** — byte-for-byte what
the row editor renders today at `inventory/+page.svelte:279`. An earlier draft of this plan wrote it
as `… — no longer active` and described that suffix as an existing source fact. **It is not in
source, and it is not introduced here either.** A suffix would be new UI copy with no SPEC criterion
behind it, so it is dropped and the test asserts the holder's name exactly as source renders it
(`` `${lastName}, ${firstName}` ``, `inventory/+page.svelte:20`).

**The ten field names are exactly `itemSchema`'s** (`+page.server.ts:46-61`): `name, category,
quantity, unit, location, status, assignedToId, serialNumber, value, notes` — plus `id` on update
only, which the `update` action reads at `+page.server.ts:114` before calling `inputOf` at `:122`. **Zero server change** (N5-AC4).

**`notes` is present in both modes.** Today it exists in the Add form and has no table column. That
is the drift D15 removes — one form, one set of fields, they cannot disagree.

**Delete is a header-row sibling of the edit form, not a Save-row neighbour.** `ConfirmButton`
renders its own `<form class="contents">` (`ConfirmButton.svelte:91`); putting it on the Save row
would nest a form inside a form — invalid HTML. The header sits outside the scrolling body, so
Delete is permanently visible (N5-AC5).

**`size` / `scroll` / `zIndex`, with the no-overflow argument:**

| Prop | Value | Why, with the number |
|---|---|---|
| `scroll` | **set** | `Dialog.svelte:149` — `scroll` is the *only* thing that adds `flex max-h-[90vh] flex-col overflow-hidden`. Without it the panel has **no max-height at all**, and the backdrop's `items-center` centres an over-tall panel so both ends clip off-screen and Save becomes unreachable. Measured body heights: **~1008px at 390** (10 field rows, 1 column), **~696px at 1280** (6 rows, 2 columns). Both exceed a 720px viewport minus chrome. The owner's measured `innerHeight` has been as low as **314px**. `scroll` is mandatory, not stylistic. |
| `size` | `"wide"` | `max-w-lg` / `sm:max-w-2xl` / `lg:max-w-4xl`. At `lg` (512) the `sm:grid-cols-2` field grid gives 236px columns, which truncates employee names in the assignee select. `wide` gives 2xl/4xl above `sm`; below `sm` the backdrop's `p-4` caps it at 358px at 390 anyway. |
| `zIndex` | `50` | `ConfirmDialog` is hard-wired to **60** (`ConfirmDialog.svelte:34`). A dialog that contains one must sit below it or the confirm paints underneath. `timesheets/TimesheetModal.svelte:305` passes 50 for exactly this reason. |
| `initialFocus` | left at the default `'panel'` | `Dialog.svelte:28` documents `initialFocus` — panel-focus and a self-focusing control race each other. Do **not** autofocus the Name field. |

With `scroll`, the panel is `flex max-h-[90vh] flex-col overflow-hidden`, the form is
`flex min-h-0 flex-1 flex-col`, the field grid is `min-h-0 flex-1 overflow-y-auto`. Header, Delete
and the Save/Cancel row are always on screen; **only the fields scroll** (N5-AC1b). This is
the shape `RequestCreateDialog.svelte` already uses for a scrolling dialog body.

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

Alongside the page, not after it. Scope, mutations and the fixture are in §Test plan N5; the
assertions are authored here, against the real page, under the mandatory EXECUTE procedure. The `#114` header comment at
lines 4-6 is carried across **verbatim**. **Satisfies:** all eight N5 criteria.

### Step 31 — run both negative controls and record them

§Negative controls. For each: the **unmutated run recorded green first**, then the mutation, the
exact red output, then the revert and a second green. Non-optional — SPEC calls both mandatory.

The same four-step procedure applies to **every** e2e test in this lane, not just these two (§The
EXECUTE test procedure). A test that has not been seen failing is not accepted.

### Step 32 — gates for N5

```bash
bun run format:check && bun run lint && bun run check && bun run test
CI=1 bunx dotenv -e .env.dev -- playwright test tests/e2e/inventory.spec.ts
```

### Step 33 — N5 owner step (manual)

The owner opens `/inventory` in **light and dark** at 390 and 1280, in both views, and confirms the
row/card focus indicator reads correctly (N5-AC8's Hybrid half). They also confirm the modal at a
deliberately short window. Record in the phase report.

### Step 34 — **Commit 3**, then the full-suite gate (Commit 4 if it needs a fix)

---

# Test plan

**D19 (owner ruling, 18-09-26) governs this whole section.** Exact e2e locators, selectors and
count literals are **no longer specified here**. They are authored during EXECUTE against the real
rendered page. Three VALIDATE rounds each fixed every defect found and each introduced a new one,
and the last three were all the same class: a property of the *rendered page* that source reading
cannot see (native constraint validation blocking a submit, a global `Toaster` making an
`aria-live` count 2, a page that cannot scroll making a scroll assertion unfailable).

So each test below specifies four things and nothing else:

1. **Proves** — which criterion, in one line.
2. **The mutation that must turn it red**, and the expected failure mode. This stays in the plan;
   it is the most valuable part of it.
3. **The fixture it needs**, in full, where it needs one.
4. **The EXECUTE procedure** below, which is mandatory and is not restated per test.

**This changes WHERE the locator is written, never WHAT must be proven.** Every criterion that had
a gate still has one. No criterion moves to Known-Gap.

## The EXECUTE test procedure — mandatory, every e2e test in this lane

For each test, in this order, with no step skipped:

1. **Write the assertion against the real rendered page.** Open the page, read the real DOM, and
   write the locator from what is there. Do not copy a locator out of a plan or a design report.
2. **Run it and confirm it passes.** A test that has never been green proves nothing about the
   page; it may simply be unsatisfiable.
3. **Apply the named mutation and confirm it FAILS.** Record the exact failure message.
4. **Revert the mutation and confirm it passes again.**

**A test that has not been seen failing is not accepted.** Record the red output — verbatim, not
paraphrased — in the phase report, one entry per test. A test whose mutation leaves it green is a
test that proves nothing: fix the test, not the record.

Reverts use `git checkout -- <file>`, which discards uncommitted work in that file. Mutate only
from a committed clean state and confirm `git status --short` shows the file clean first.

## What you may still hard-code — and only this

These are **source facts**, already verified by reading the file at the line. They are not
rendered-page guesses, so they stay in the plan and may be written as literals:

| Fact | Kind | Where |
|---|---|---|
| The 18 form field `name=`/`id=` values and their DOM order (`FIELD_ORDER`, `TAB_SEQUENCE`) | source fact | `employees/new/+page.svelte:109-390` |
| `Complete later — 12 optional fields`, byte-for-byte | source fact (frozen string) | `employees/new/+page.svelte:413` |
| `itemSchema`'s ten field names | source fact | `inventory/+page.server.ts:46-61` |
| The six N3 expected form-column widths | derived arithmetic, §Step 12 | — |
| The three seed inventory item names | source fact | `prisma/seed-core.ts:938-978` |
| Settings destinations: 17 total, 5 groups, 5 gated; groups per role 5 / 5 / 4 | source fact, derived | `settings-destinations.ts` |

**Everything else is authored at EXECUTE.** In particular: no accessible-name string, no
`toHaveCount(n)` literal, no aria-attribute value and no bounding-box number is specified in this
plan unless it appears in the table above.

## Rules that survive D19 unchanged

**Runner.** `bun run test:e2e -- <spec>` does **not** filter — it silently runs the whole suite. The
working form is:

```bash
CI=1 bunx dotenv -e .env.dev -- playwright test <specs>
```

**Parallelism.** Playwright is `fullyParallel: true`, and `pagination.spec.ts:13-14` seeds 25
`Zzpagetest` employees with best-effort cleanup at `:67-79`. Therefore: **every spec here that
counts rows declares `test.describe.configure({ mode: 'serial' })` and reads its totals from the
page, never from a fixture constant.** `inventory.spec.ts` already does this at line 7; the two new
specs adopt it.

**Counts are derived, never literal.** Settings group counts are 5 / 5 / **4** across
SUPER_ADMIN / HR_ADMIN / MANAGER, because both `System` entries are capability-gated. Any
`toHaveCount(5)` is red on a correct MANAGER page. Every count assertion derives its expectation
from the role's own visible destination set, computed in the spec from the imported module.

**`toBeVisible()` is never used to assert a reveal.** Playwright treats an `opacity: 0` element as
visible. A reveal is asserted with `getComputedStyle` / `toHaveCSS`, never with visibility.

**No source-scanning unit test is written anywhere in this lane.** SPEC hazard 1 is avoided by
construction: there is no file-wide predicate to be red on arrival.

---

## N2 — `tests/e2e/settings-context-rail.spec.ts` (new)

Serial mode. The spec imports `SETTINGS_GROUP_ORDER` and `visibleSettings` from
`src/lib/settings-destinations.ts` and derives every expected count from the role under test — the
three roles are Super Admin, HR Admin and Manager. Step 5's pre-flight proves that import resolves
under Playwright before this spec is written.

| Test | Proves | Mutation that must turn it red | Expected failure mode |
|---|---|---|---|
| **N2-T1** bar lists groups, not destinations | N2-AC1 | In `settings/+layout.svelte`, render the visible **destinations** in the first row instead of the groups | The bar's link count exceeds `groups + 1`, and a destination label resolves inside the bar |
| **N2-T2** no destination is listed twice on the hub | N2-AC2 | Duplicate the hub's card `{#each}` block | The hub resolves 2 links for a destination where it must resolve 1 |
| **N2-T3** siblings only, and only on a sub-page | N2-AC3 | Drop the "is there a current destination" guard, so the sibling row also renders on the hub | The hub renders two rows where it must render one |
| **N2-T4** search filters the cards and nothing else | N2-AC4 | Make the search input a no-op (drop the filter predicate) | The filtered card count equals the unfiltered count |
| **N2-T5** one line, three widths, three roles | N2-AC5 | Remove the no-wrap on the group row | The row's height for one role exceeds one chip line |
| **N2-T6** no sideways scroll | N2-AC5 | Give the group row a fixed width wider than the narrow viewport | `scrollWidth − clientWidth` is greater than 0 at 390 |
| **N2-T7a** current state | N2-AC6 | Delete the `aria-current` write on the bar links | The hub link and the selected group link carry no current-state token |
| **N2-T7b** focus ring on every bar link | N2-AC6 | Delete the focus-ring class from the bar link | The computed `box-shadow` on a Tab-focused bar link is `none` |
| **N2-T7c** tab order | N2-AC6 | Move the search control before the bar in the DOM | The walk reaches the search box before the last group link |
| **N2-T7d** the match count is announced | N2-AC6 | Delete the polite live region from the hub | The hub contains no polite live region |

**N2-T7 authoring notes — three page realities the assertions must respect:**

- **The focused element is reached by `keyboard.press('Tab')`, never by a programmatic `.focus()`.**
  Chromium only paints `:focus-visible` on a programmatic focus when it judges the last interaction
  to have been a keyboard one, so after any click a `.focus()` can leave the ring unpainted and red
  a correct page. Tab is the interaction the criterion is about. **This focus walk is kept exactly
  as it is and must not be replaced with `.focus()`.**
- **Assert the computed style, not a bounding box.** A box cannot tell a ring from no ring, and this
  bar has no focus style at all today.
- **`[aria-live="polite"]` is never 1 on any page in this app.** `(app)/+layout.svelte:214` mounts
  `<Toaster />`, which renders a polite live region at `Toaster.svelte:52`. **The count on
  `/settings` is 2, not 1.** Scope the assertion to the destinations landmark and assert its
  *content* rather than a page-wide count. A bare `toHaveCount(1)` here reds correct code — it did,
  in round 3.

**Hybrid half of N2-AC6:** step 8 — the owner confirms the ring is *visible* in light and dark. The
repo has no automated contrast or focus-visibility gate; that is why this half is not automated and
is not recorded as proven until the owner answers.

**Existing specs run unchanged:** `tests/e2e/settings-visibility.spec.ts` in full — its unscoped
link-count assertions at `:57-58` are the role-negative half of N2-AC2 and are byte-untouched;
`tests/unit/settings-cards.test.ts` and `tests/unit/settings-destinations.test.ts` seen green (they
assert off the **load**, not the markup, so N2 cannot move them — but SPEC R9 requires them seen).

---

## N3 — `tests/e2e/employees-new-layout.spec.ts` (new)

Serial mode. Six viewports throughout: **390, 1024, 1280, 1440, 1536, 1920**.

| Test | Proves | Mutation that must turn it red | Expected failure mode |
|---|---|---|---|
| **N3-T1** form column width at six viewports | N3-AC1 | Change the form grid gate from `2xl:` to `xl:` | At 1280 the column measures ~688 and fails the `> 768` assertion |
| **N3-T2** no sideways scroll | N3-AC1 | Give the form column a fixed min-width above the narrow viewport | `scrollWidth − clientWidth` > 0 at 390 |
| **N3-T3** sticky aside at 1536 and 1920 | N3-AC2 | Drop `2xl:sticky` | The aside's top moves with the wheel |
| **N3-T4** no 256px column at 1440 | N3-AC2 | Change the gate to `xl:` | At 1440 the aside is a 256px column beside the form, not a block under it |
| **N3-T5** rail contents stack and stay reachable below `2xl` | N3-AC3 | Add `hidden` to the section-link nav below `2xl` (what the design report said) | The nav's links are absent from the DOM and the focus step fails |
| **N3-T6** jump to the first error moves focus, at 390 | N3-AC3, N3-AC6 | Remove the explicit `.focus()` from the jump handler, leaving the bare anchor | The active element after the jump is not the invalid field (it is `<body>` or unchanged) |
| **N3-T7** exactly one `Create Employee`, one `Cancel`, six widths | N3-AC4 | Keep the bottom submit row instead of deleting it | The DOM-level `Cancel` count is 2 |
| **N3-T8** the disclosure summary string is frozen | N3-AC5 | Change one character of the summary string | Exact-text mismatch |
| **N3-T9** opening the disclosure does not move the rail | N3-AC5 | Put the aside inside the form column | The aside's y shifts when the disclosure opens |
| **N3-T10** tab order, pinned, both sides of `2xl` | N3-AC6 | Move one fieldset above another in the DOM | The walk mismatches at that index |
| **N3-T11** one `h1` | N3-AC6 | Add a second `h1` to the aside | The `h1` count is 2 |

### N3-T1 — the six widths, which stay literal

These six numbers are derived arithmetic from §Step 12 and the measured content width, not page
guesses, so they stay in the plan: **390→358, 1024→720, 1280→976, 1440→1136, 1536→944,
1920→1328**, tolerance ±8px. Plus the explicit R12 assertion: at **1280 and 1440** the form column
must be **wider than 768**, today's cap. That is the assertion that catches an `xl:` written where
`2xl:` belongs — one character, 288px of form width.

### N3-T6 — the submit is blocked by native validation, and the scenario must be rebuilt for it

**The round-3 scenario was wrong and is deleted.** It filled only First Name and expected a server
rejection. The form at `employees/new/+page.svelte:97` carries **no `novalidate`**, and seven fields
are `required` (`firstName:112`, `lastName:128`, `email:187`, `departmentId:255`, `jobTitle:275`,
`startDate:313`, `basicMonthlySalary:349`). Chromium blocks the submit, `use:enhance` never sees a
submit event, no POST fires, `form` stays `null`, there is no error count and no jump link. The test
reds on correct code.

**The replacement scenario, and why this one and not another.** Only the zod `fail(400, …)` at
`+page.server.ts:140-141` returns `fieldErrors` at all; the three 409 paths (`:176, :189, :196`)
return `{ error, values }` with none, so a duplicate-email submit also leaves the error block
unrendered. So the submit must satisfy every HTML constraint **and** still fail zod. It does this:

- Fill all **seven** required fields with natively-valid values.
- Set **`basicMonthlySalary` to `0`**. The input is `type="number" min="0"` (`:344-349`), so `0` is
  natively valid; the schema is `z.coerce.number().positive()` (`+page.server.ts:82`), which rejects
  it. The result is a `fail(400)` carrying `fieldErrors.basicMonthlySalary` — a real error on a
  real, focusable, `aria-invalid` field.
- Assert the aside's error block has rendered **before** clicking the jump link. If it has not, the
  test must fail there, loudly, rather than time out on the link.

Rejected alternatives, recorded so they are not re-proposed: the `rateType` / `employmentType`
refine (`+page.server.ts:126-129`) is **unreachable from the UI** — `:70` re-writes `rateType` to
`MONTHLY` whenever the pairing is illegal; an invalid `email` is blocked natively by
`type="email"`; a blank `firstName` is blocked by `required`.

**The DOM-order half of N3-AC6 — a named residual, honestly recorded.** Deviation D-3 requires the
first invalid field to be picked in *page* order, not in server-key order. Distinguishing the two
needs two simultaneously-invalid fields whose server-key order **inverts** their DOM order. Every
reachable pair was checked against `createSchema` (`+page.server.ts:59-122`) and the form's DOM
order (`:109-390`): schema declaration order and DOM order agree for every field that can be both
natively valid and zod-invalid, and `contactPhone` / `contactAddress` — the only DOM-early fields —
are not in the schema at all, so they can never carry a `fieldError`. **EXECUTE must retry this
search against the real page** and use such a pair if one exists. If none does:

- N3-T6 still proves the whole of the rest of N3-AC6's jump clause — that the error block renders,
  that the jump link exists, that clicking it **moves focus**, and that focus lands on a field that
  is genuinely `aria-invalid`.
- The ordering half alone is recorded as a **known residual** with a test-building backlog stub:
  `n3-first-error-dom-order-unprovable_NOTE_18-09-26.md`. It is a residual, not a proving strategy,
  and N3-AC6 stays Hybrid either way (its focus-ring half already is).

### N3-T10 — the pinned tab order, unchanged

The exact sequence stays in the plan: it is a source fact, the 18 `name=` attributes of the required
block in DOM order (`employees/new/+page.svelte:109-390`), plus one extra stop for the Start Date
`DatePicker` at `:309`, whose wrapper renders the named text input first (`DatePicker.svelte:661`)
and its calendar toggle second — the toggle's `aria-label="Open calendar"` is at
**`DatePicker.svelte:695`**. There is no `TimePicker` on this page.

```
firstName, lastName, middleName, contactPhone, contactAddress, email, password, role,
discordId, departmentId, jobTitle, employmentType, startDate, [Open calendar],
rateType, basicMonthlySalary, reportsToId, positionId, workScheduleId
```

Matched by element id, except the calendar toggle, which has no id and is matched by accessible
name. **There is NO tolerance and NO skip:** an unexpected stop at any position is a failure,
because the criterion is an order, not a set. The walk is `keyboard.press('Tab')`, and it must stay
that way.

> **If the first run disagrees with this sequence, the fix is to correct the sequence from what the
> page actually does — never to add tolerance.** A `if (unexpected) press Tab again` fallback
> accepts one stray stop at *every* position, which is the loosening N3-AC6 exists to forbid.

**Hazard-2 note on N3-T7.** `Cancel` is **2** on the untouched tree (header `:80-82` + submit row
`:579`), so its assertion is red before step 15 and green after: it ships in the **same commit** as
the deletion. `Create Employee` is **1** today and 1 after, so that half is green on both sides and
only reds on a real duplicate — which is what it is for. Both counts are taken at **DOM level**
(`querySelectorAll` does not skip hidden nodes), because a `hidden 2xl:block` duplicate would still
break `admin.spec.ts:49`'s strict-mode locator while a visible-role locator passed.

**Hybrid half of N3-AC6:** step 8's sibling for N3 — the owner confirms the rail controls' focus
ring in both themes.

**Existing spec run unchanged:** `tests/e2e/admin.spec.ts` in full.

---

## N5 — `tests/e2e/inventory.spec.ts` (rewritten alongside)

The `#114` header comment (lines 4-6) is carried across **verbatim**. `test.describe.configure({
mode: 'serial' })` at line 7 stays — it is already there and it is required (fixture drift).

| Test | Proves | Mutation that must turn it red | Expected failure mode |
|---|---|---|---|
| **no sideways scroll, 3 widths × 2 views** | N5-AC1 | Restore `min-w-max` on the table | `scrollWidth − clientWidth` > 0 at 1280 |
| **the modal fits, incl. a short viewport** | N5-AC1 | Drop `scroll` from the shared `Dialog`'s props | The panel is taller than 90% of a 360px-high viewport |
| **rows carry no controls** | N5-AC2 | Leave one `<select>` in the row | The row's editor count is 1 |
| **view toggle defaults to list, survives reload** | N5-AC3 | Default the server's `view` to `grid` | `/inventory` with no query renders the grid |
| **both views open the same modal** | N5-AC3 | Make the card's click open nothing | No dialog after the card click |
| **add item uses the shared modal** | N5-AC4 | Remove `notes` from the shared modal | The create/edit field-name set no longer equals `itemSchema`'s ten |
| **delete from the modal, behind a confirm** | N5-AC5 | Remove the confirm step | The row disappears without a confirm |
| **the assign invariant is enforced** | N5-AC5 | — (server-side, unchanged; the invariant is existing behaviour) | — |
| **inactive holder is preserved on save** | N5-AC5 | Delete the preserved-option `{#if}` at `inventory/+page.svelte:276` | The assignee select opens empty and the save nulls the holder |
| **a rejected save keeps the modal open and the edits** | N5-AC6 | **NC-1** below | see NC-1 |
| **focus after a delete lands on the list** | N5-AC7 | **NC-2** below | see NC-2 |
| **the row is a real button with a name** | N5-AC8 | Put `role="button"` on the `<tr>` instead of a real `<button>` | The row's button is not a `BUTTON` element |
| **Enter and Space both open; Space does not scroll** | N5-AC8 | Replace the button with a `div` carrying a keydown-Enter handler only | Space does not open the modal, **and** the page scrolls |
| **focus on open and on close** | N5-AC8 | Remove the dialog's focus move | Focus stays outside the dialog after it opens |
| **a modal save preserves a non-empty `notes`** | **N5-AC9** | Remove the `notes` textarea from the modal | The reopened item's notes are empty |

### The row locator — two source facts that stay

Both the table row and the card carry `data-name` and CSS hides one, so an element-name selector
double-counts (SPEC R8): the helper matches on the attribute and on `:visible`, never on `tr`.

And the value is **escaped**: one seed item is literally `MacBook Pro 14"` — the name ends in a
double quote, which closes an attribute selector early and makes the locator a syntax error rather
than a miss. The three seed names, byte-exact (`prisma/seed-core.ts:938-978`):

| Seed id | `name`, exactly | `assignedToId` |
|---|---|---|
| `inv_seed_1` | `MacBook Pro 14"` — **note the trailing `"`** | none |
| `inv_seed_2` | `Office Chair` | none |
| `inv_seed_3` | `Projector (old)` | none |

Any dialog-name regex for the first item is built with `new RegExp` from a string rather than a
`/…/` literal, so the quote does not have to fight the delimiter. **All three are unassigned and
none has `notes`**, which is why N5-AC5's inactive-holder clause and N5-AC9 both need the fixture
below rather than a seed row.

### "Space does not scroll" — the page must be scrollable or the check is vacuous

At Playwright's default 1280×720 with three seed items and one or two e2e rows the document is
shorter than the viewport, so `scrollY` is `0` before and after **whether or not Space scrolls**.
`0 === 0` cannot fail. That is exactly the hazard-1 shape the SPEC forbids.

**Required:** make the page genuinely scrollable first, then assert. Two acceptable ways, pick one
at EXECUTE against the real page:

- run this case at a **short viewport** (e.g. 1280×360, the height the modal-fit test already
  uses), or
- add enough fixture rows that the list exceeds the viewport.

Either way the test must **assert the precondition** — that the document's scroll height exceeds
its client height — **before** pressing Space, and fail on it. A guard with nothing to guard is not
a guard.

### The fixture — unchanged, and it is verified correct

Four rules it follows, none of which may be loosened:

- **It never *picks* an existing employee.** A pick by `orderBy` over ACTIVE employees lands on
  `pagination.spec.ts`'s 25 `Zzpagetest` rows (same org, `:15-45`), which that spec's `afterAll`
  deletes (`:67-79`). `InventoryItem.assignedTo` is `onDelete: SetNull`
  (`prisma/schema.prisma:1489`), so the assignment nulls silently and the guard goes vacuous again;
  the restore then throws `P2025` on a deleted row. `mode: 'serial'` does not protect against this
  — Playwright is `fullyParallel` **across files**.
- **Nor does it filter the pick.** `lastName: { not: { startsWith: 'Zz' } }` would couple this spec
  to another spec's naming convention and break silently on the next fixture prefix.
- **Teardown deletes, in FK order, inside `try/catch`**: item → payroll entries → employee → user.
  `payrollEntry → employee` is RESTRICT (the trap `pagination.spec.ts:70-72` documents) and
  `employee → user` is RESTRICT.
- **It creates its own item rather than mutating a seed row.** `deleteMany` by name runs first *and*
  last, so a run is independent of how the previous one ended. The `upsert`'s `update` branch forces
  `employmentStatus: 'OFFBOARDED'`, so a leftover row from a killed run is corrected, not inherited.

The fixture must end up **OFFBOARDED**, not merely created: the load lists assignees with
`where: { organizationId, employmentStatus: 'ACTIVE' }` (`inventory/+page.server.ts:29-33`), so an
ACTIVE holder appears in the normal `{#each}`, the preserved-option `{#if}` at
`inventory/+page.svelte:276` never fires, and N5-AC5 proves nothing. `beforeAll` asserts all three
facts — item assigned, notes non-empty, holder OFFBOARDED — **before** any test runs.

```ts
// ponytail: this spec creates its own User + Employee rather than picking an existing one.
// A pick is silently nulled when another spec deletes its own fixtures (assignedTo is SetNull),
// which makes the assertion vacuously green. Do not replace this with a query.
const FIXTURE_NAME = 'E2E Fixture Asset'
const FIXTURE_NOTES = 'E2E notes sentinel — must survive a modal save'
const FIXTURE_EMAIL = 'zzinvfixture@example.test'
const FIXTURE_LAST = 'Zzinvfixture'
const FIXTURE_FIRST = 'Holder'
// `empName` renders `${lastName}, ${firstName}` (inventory/+page.svelte:20).
const FIXTURE_HOLDER_NAME = `${FIXTURE_LAST}, ${FIXTURE_FIRST}`
let fixtureHolderId = ''

test.beforeAll(async () => {
	const { PrismaClient } = await import('@prisma/client')
	const db = new PrismaClient()
	try {
		const admin = await db.user.findFirstOrThrow({
			where: { email: 'admin@veent.ph' },
			select: { organizationId: true }
		})
		const department = await db.department.findFirstOrThrow({
			where: { organizationId: admin.organizationId },
			select: { id: true }
		})

		// Required fields taken from prisma/schema.prisma: User needs organizationId, email,
		// passwordHash; Employee needs userId, organizationId, employeeNumber (unique per org),
		// firstName, lastName, departmentId, jobTitle, employmentType, startDate,
		// basicMonthlySalary. Same shape pagination.spec.ts:28-58 uses.
		const user = await db.user.upsert({
			where: { email: FIXTURE_EMAIL },
			update: {},
			create: {
				organizationId: admin.organizationId,
				email: FIXTURE_EMAIL,
				// Fixture only — nobody logs in as this row.
				passwordHash: 'not-a-real-hash',
				roles: ['EMPLOYEE'],
				isActive: false
			}
		})
		const holder = await db.employee.upsert({
			where: { userId: user.id },
			// OFFBOARDED on both paths, so a leftover row from a killed run is corrected, never
			// inherited. OFFBOARDED is what keeps them out of the load's
			// `where: { employmentStatus: 'ACTIVE' }` (inventory/+page.server.ts:29-33), which is
			// what makes the page's {#if} at :276 fire and `selectedBefore` non-empty.
			update: { employmentStatus: 'OFFBOARDED' },
			create: {
				userId: user.id,
				organizationId: admin.organizationId,
				employeeNumber: 'ZZINV-001',
				firstName: FIXTURE_FIRST,
				lastName: FIXTURE_LAST,
				departmentId: department.id,
				jobTitle: 'Inventory Fixture',
				employmentType: 'REGULAR',
				employmentStatus: 'OFFBOARDED',
				startDate: new Date('2026-01-05'),
				basicMonthlySalary: 10000,
				rateType: 'MONTHLY'
			}
		})
		fixtureHolderId = holder.id

		await db.inventoryItem.deleteMany({ where: { name: FIXTURE_NAME } })
		await db.inventoryItem.create({
			data: {
				organizationId: admin.organizationId,
				name: FIXTURE_NAME,
				category: 'Laptop',
				quantity: 1,
				unit: 'pc',
				status: 'ASSIGNED',
				assignedToId: fixtureHolderId,
				notes: FIXTURE_NOTES
			}
		})

		// The fixture must be REAL before any guard runs on it. Without this, a silently
		// unassigned or notes-less item makes both N5-AC5 and N5-AC9 vacuously green — the third
		// time this spec would have had that shape.
		const check = await db.inventoryItem.findFirstOrThrow({ where: { name: FIXTURE_NAME } })
		expect(check.assignedToId, 'fixture item must be assigned').toBe(fixtureHolderId)
		expect(check.notes, 'fixture item must carry notes').toBe(FIXTURE_NOTES)
		expect(holder.employmentStatus, 'fixture holder must be inactive').toBe('OFFBOARDED')
	} finally {
		await db.$disconnect()
	}
})

test.afterAll(async () => {
	const { PrismaClient } = await import('@prisma/client')
	const db = new PrismaClient()
	try {
		// FK ORDER. InventoryItem.assignedTo is SetNull, but payrollEntry → employee is RESTRICT
		// (pagination.spec.ts:70-72 hit exactly this), and employee → user is RESTRICT. So:
		//   1. the item (it points at the employee)
		//   2. any payroll entries attached to the employee by a concurrent compute
		//   3. the employee
		//   4. the user
		// try/catch so a failed assertion earlier in the run can never leave the org dirty AND
		// take teardown down with it. NOTHING ELSE SWEEPS THIS FIXTURE: scripts/clean-e2e-employees
		// matches email prefixes only, and its list is ['e2e_', 'probe_', 'zzpagetest'] (:20) —
		// zzinvfixture@example.test matches none of them. This teardown is the only cleanup, which
		// is why the assertions below run and why Phase Completion Rule 5 is mandatory.
		await db.inventoryItem.deleteMany({ where: { name: FIXTURE_NAME } })
		await db.payrollEntry.deleteMany({ where: { employee: { lastName: FIXTURE_LAST } } })
		await db.employee.deleteMany({ where: { lastName: FIXTURE_LAST } })
		await db.user.deleteMany({ where: { email: FIXTURE_EMAIL } })

		// Prove the teardown actually emptied, in the same process that owns the fixture. This
		// replaces the psql check the phase rules used to prescribe: no docker, no owner step.
		expect(await db.inventoryItem.count({ where: { name: FIXTURE_NAME } })).toBe(0)
		expect(await db.employee.count({ where: { lastName: FIXTURE_LAST } })).toBe(0)
		expect(await db.user.count({ where: { email: FIXTURE_EMAIL } })).toBe(0)
	} catch {
		// Best-effort.
	} finally {
		await db.$disconnect()
	}
})
```

> **The sweep-script claim is gone and this is the choice made.** `scripts/clean-e2e-employees.ts`
> was never going to sweep `zzinvfixture@example.test` — its `PREFIXES` are `['e2e_', 'probe_',
> 'zzpagetest']` (`:20`). Rather than add a prefix to a script that is not in this lane's blast
> radius, the false sentence is deleted and **this teardown is the only cleanup**, with its own
> assertions proving it ran. A leftover OFFBOARDED employee silently changes what every headcount
> spec sees on the next run, so the proof lives in the spec, not in a manual step.

---

## Negative controls

Both are mandatory, and they are the two cases where the mutation is named against a *specific* line
of the new page code rather than against a behaviour. Both run **from a committed clean state**.
Record the mutation, the exact red output, and the revert, in the phase report.

### NC-1 — `update()`'s default reset (proves **N5-AC6** is not vacuous)

**Run the unmutated test FIRST and record it GREEN.** This is not optional and it is not a
formality: NC-1's expected red output is *indistinguishable* from the output of an assertion that
could never pass, so a red-only record cannot tell "guard removed" from "guard never worked". The
green run is half of the control.

Why the doubt is real: `update({ reset: false })` stops SvelteKit resetting the `<form>`, but
`update()` still invalidates and re-runs `load`, which re-renders the modal's `<option selected>`
set. Whether the user's changed selection survives that re-render is live behaviour nobody has
observed.

**If the unmutated run is red**, the fix is named in advance: bind the select to local `$state`
seeded from the item being edited, so the user's choice is not re-derived from `load` data on
re-render. Do not weaken the assertion.

**Mutation.** `src/routes/(app)/inventory/+page.svelte`, in `save`:

```diff
-			await update({ reset: false })
+			await update()
```

**Expected failure mode:** the rejected save blanks the form back to its HTML defaults, so the
status the user selected reverts to the item's stored value and the modal's value assertion fails.
**If this stays green, the test is proving nothing and the guard is not wired** — that is the
failure this repo has recorded twice (`sveltekit-update-resets-the-form`).

**Revert:** `git checkout -- "src/routes/(app)/inventory/+page.svelte"`

### NC-2 — post-delete focus (proves **N5-AC7** is not vacuous)

Same rule: record the unmutated test green first.

**Mutation.** Same file, in `afterDelete`:

```diff
 			editingId = null
-			listEl?.focus()
```

**Expected failure mode:** `Dialog`'s restore calls `trigger?.focus()` on a node the delete removed,
so focus falls to `<body>` and the "focus is not on body, is attached, and is inside the list"
assertion fails on its first clause.

**Revert:** `git checkout -- "src/routes/(app)/inventory/+page.svelte"`

> **Both reverts use `git checkout <file>`, which silently discards uncommitted work in that file.**
> Do the mutations **after** Commit 3 is in, and confirm `git status --short` shows the file clean
> before mutating. This repo has been burned by exactly this.

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
| Commit 1 (N2) | `CI=1 bunx dotenv -e .env.dev -- playwright test tests/e2e/settings-context-rail.spec.ts tests/e2e/settings-visibility.spec.ts` |
| Commit 2 (N3) | `CI=1 bunx dotenv -e .env.dev -- playwright test tests/e2e/employees-new-layout.spec.ts tests/e2e/admin.spec.ts` |
| Commit 3 (N5) | `CI=1 bunx dotenv -e .env.dev -- playwright test tests/e2e/inventory.spec.ts` |
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
| **N5** | `git revert <commit 3>` | `/inventory` returns to the nine-editor row and the separate Add form, to its sideways scroll at 1280, **and to silently erasing `notes` on every row save** — see §The `notes` defect. That is the one rollback in this lane with a data cost, and it is why the defect gets its own backlog note rather than living only in this commit. **No data migration, no server change to undo** — `?/create`, `?/update`, `?/remove` and `itemSchema` were never touched, so items created or edited through the modal are indistinguishable from ones created through the old form. `?view=grid` becomes an ignored query param. |

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
| `inventory.spec.ts` › "delete from the modal, behind a confirm" + "the assign invariant is enforced" + "inactive holder is preserved on save" | Fully-Automated | N5-AC5 |
| `inventory.spec.ts` › "a rejected save keeps the modal open and the edits" + **NC-1** (unmutated green recorded first) | Fully-Automated | N5-AC6 |
| `inventory.spec.ts` › "focus after a delete lands on the list" + **NC-2** (unmutated green recorded first) | Fully-Automated | N5-AC7 |
| `inventory.spec.ts` › "row is a button with a name" + "Enter and Space both open, Space does not scroll" + "focus on open, on close, and after delete" + owner theme check (step 33) | Hybrid | N5-AC8 |
| `inventory.spec.ts` › "a modal save preserves a non-empty notes value" (fixtured — no seed item has notes) | Fully-Automated | **N5-AC9** (plan-added) |

**Under D19 the "Gate / Scenario" column names the test, not its assertions.** The assertions are
authored at EXECUTE against the real page; the per-test mutation tables in §Test plan are what pins
each gate to the behaviour it proves, and no gate is accepted until it has been seen red under that
mutation.

**Vacuous-green statement.** No criterion in this lane is proved by Known-Gap. All 20 SPEC criteria
and the 1 plan-added criterion have at least one Fully-Automated or Hybrid gate. **Two of them —
N5-AC5's inactive-holder clause and N5-AC9 — would have been *vacuously* green against the seed**,
because all three seed items are unassigned and none has notes; both now run against an explicit
`beforeAll` fixture that gives the guard something to guard. The three Hybrid criteria (N2-AC6, N3-AC6, N5-AC8) are Hybrid
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
3. **The DOM-order half of N3-AC6 has no reachable scenario.** Distinguishing a page-ordered
   first-error pick from a server-key-ordered one needs two simultaneously-invalid fields whose key
   order inverts their DOM order, and `createSchema`'s declaration order agrees with the form's DOM
   order for every field that can be natively valid and zod-invalid. Recorded as a named residual
   with a backlog stub (`n3-first-error-dom-order-unprovable_NOTE_18-09-26.md`), not as a proven
   behaviour. Everything else in N3-AC6's jump clause is proven.
4. **`/settings/org` and the settings sub-nav have no coverage at all today** (SPEC R9) — neither
   e2e nor unit. N2's new spec closes the sub-nav half. `/settings/org` is the build lane's, and is
   getting its first spec there.

---

## Traceability

All 20 SPEC criteria → steps → tests. **No criterion is without a step, and no criterion is without
a test.**

| Criterion | Steps | Test |
|---|---|---|
| N2-AC1 | 1, 2, 5 | N2-T1 |
| N2-AC2 | 2, 3, 4, 5 | N2-T2 + unchanged `settings-visibility.spec.ts` |
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
| N5-AC1 | 24, 25, 27 | "no sideways scroll, 3 widths × 2 views", "the modal fits, incl. a short viewport" |
| N5-AC2 | 24, 25, 28 | "rows carry no controls" |
| N5-AC3 | 20, 21, 23, 25 | "view toggle defaults to list…", "both views open the same modal" |
| N5-AC4 | 22, 27, 29 | "add item uses the shared modal" + step-29 diff check |
| N5-AC5 | 26, 27 | "delete from the modal, behind a confirm", "the assign invariant is enforced", "inactive holder is preserved on save" **+ the `beforeAll` fixture** |
| N5-AC6 | 21, 27 | "a rejected save keeps the modal open and the edits" + **NC-1** (unmutated green recorded first) |
| N5-AC7 | 21, 23 | "focus after a delete lands on the list" + **NC-2** (unmutated green recorded first) |
| N5-AC8 | 24, 25, 26, 27 | "row is a button with a name", "Enter and Space…", "focus on open, on close…" + owner theme check |
| **N5-AC9** (plan-added) | 27 | "a modal save preserves a non-empty notes value" + the `beforeAll` fixture |

**Holes: none.** All 20 SPEC criteria have a step and a gate, as does the 1 plan-added criterion.

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
| N5-AC5 | Delete lives in the modal, behind a confirm, assign invariant holds | Fully-Automated | "delete from the modal, behind a confirm", "the assign invariant is enforced", "inactive holder is preserved on save" |
| N5-AC6 | A rejected save keeps the modal open AND keeps the edits | Fully-Automated | "a rejected save keeps the modal open and the edits" + **NC-1** |
| N5-AC7 | Focus after a delete never falls to `<body>` | Fully-Automated | "focus after a delete lands on the list" + **NC-2** |
| N5-AC8 | The row is a real button, named, keyboard-complete, defined focus path | Hybrid | "the row is a real button with a name", "Enter and Space both open; Space does not scroll" (run where the page is genuinely scrollable), "focus on open and on close" + owner theme check (step 33) |
| **N5-AC9** *(plan-added, not in the SPEC)* | A modal save preserves a non-empty `notes` — see §The `notes` defect | Fully-Automated | "a modal save preserves a non-empty notes value" |

**Coverage: 20 of 20 SPEC criteria, plus 1 plan-added = 21.** No criterion is carried by Known-Gap,
and none lacks a step (see §Traceability).

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
  5. The `inventory.spec.ts` fixture's `afterAll` is confirmed to have **run and emptied**. This is
     proven **inside the spec**, not by hand and not by `docker exec`: the `afterAll` now asserts,
     in the same process that owns the fixture, that no `E2E Fixture Asset` item, no employee with
     `lastName: 'Zzinvfixture'` and no user with email `zzinvfixture@example.test` remains. A
     leftover OFFBOARDED employee silently changes what every headcount spec sees on the next run,
     and nothing else sweeps this fixture. **No step of this plan runs `./start.sh`, vite, or
     docker** — that constraint stands, and this rule no longer contradicts it. **And** the fixture
     holder is a row this spec created, never one it selected:
     `grep -n "orderBy" tests/e2e/inventory.spec.ts` must return nothing inside the `beforeAll`.
  6. N5-AC9 is green **and** its fixture is confirmed to carry a non-empty `notes` — a green
     "preserves notes" assertion against an item with no notes proves nothing, which is the same
     vacuous shape as an unassigned item proving the inactive-holder guard.
  7. The backlog note `inventory-row-save-erases-notes_NOTE_18-09-26.md` exists, recording the
     pre-existing data loss independently of this lane. Rolling back Commit 3 reinstates the bug,
     so the record must not live only inside the commit that happens to fix it.
  8. **Every e2e test in this lane has been seen RED under its own named mutation** (§Test plan's
     per-test mutation tables), and the exact red output is recorded in the phase report, one entry
     per test. A test that has not been seen failing is not accepted. NC-1 and NC-2 additionally
     require their **unmutated green run recorded first**.
  9. If EXECUTE could not find a two-field scenario whose server-key order inverts DOM order for
     N3-T6, the backlog stub `n3-first-error-dom-order-unprovable_NOTE_18-09-26.md` exists,
     recording the ordering half of N3-AC6 as a named residual.
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

Status: BLOCKED
Date: 18-09-26
date: 2026-09-18
generated-by: outer-pvl
supersedes: 2026-09-18 (outer-pvl) — third outer-PVL pass; both round-2 FAILs re-verified as fixed against source, two new FAILs and four new cite/claim defects found in the amended text

Parallel strategy: sequential
Rationale: 3/7 signals (S3 three items, S7 6+ source files). No Agent tool available in this
session, so the Layer 1 / Layer 2 fan-out ran sequentially in one context. Every claim below was
re-derived from source at the line; nothing was carried forward from round 2 on trust.

### Net gate derivation

| Layer 1 dimension | Status |
|---|---|
| Infra fit | PASS |
| Test coverage | FAIL |
| Breaking changes | PASS |
| Security surface | PASS |

| Layer 2 section | Status |
|---|---|
| N2 — `/settings` Context Rail + search | FAIL |
| N3 — `/employees/new` Companion Rail | FAIL |
| N5 — `/inventory` list + grid + shared modal | CONCERN |
| Test plan | FAIL |
| Gates / commit plan | PASS |
| Lane split | PASS |

**Totals: 2 FAILs / 5 CONCERNs / 8 PASSes → Net gate: BLOCKED**

### Round-2 items — verdicts

| Item | Verdict | Evidence |
|---|---|---|
| **F-NEW-1** fixture creates its own rows | **CONFIRMED FIXED** | `User` required set is `organizationId, email, passwordHash` (`prisma/schema.prisma:402-404`); `roles`/`isActive` have defaults (`:408-409`). `Employee` required set is `userId, organizationId, employeeNumber, firstName, lastName, departmentId, jobTitle, employmentType, startDate, basicMonthlySalary` (`:435-465`); `employmentStatus` and `rateType` have defaults (`:448, :466`) and the plan supplies both explicitly. `REGULAR` and `OFFBOARDED` are valid enum members. `@@unique([organizationId, employeeNumber])` at `:525` — `ZZINV-001` is unused elsewhere. No missed required field, no invalid enum value. |
| **F-NEW-1** `departmentId` | **CONFIRMED FIXED** | The `beforeAll` resolves a real row with `db.department.findFirstOrThrow({ where: { organizationId } })` — same idiom as `pagination.spec.ts:22-25`. It never assumes an id. |
| **F-NEW-1** teardown FK order | **CONFIRMED CORRECT** | `InventoryItem.assignedTo` is `onDelete: SetNull` (`:1489`); `PayrollEntry.employee` (`:1279`) and `Employee.user` (`:488`) carry no `onDelete`, so both are RESTRICT. item → payrollEntry → employee → user is the right order. The `try/catch` swallows only teardown, after every assertion has run — it cannot mask a test failure. |
| **F-NEW-1** OFFBOARDED keeps the holder out of the active list | **CONFIRMED** | `inventory/+page.server.ts:29-33` filters `employmentStatus: 'ACTIVE'`, so the holder is absent from `data.employees`, the `{#if}` at `inventory/+page.svelte:276` fires, and `selectedBefore` is the holder id. The save path does **not** re-check employment status — `services/inventory.ts:99-104` looks the assignee up by `{ id, organizationId }` only — so saving an OFFBOARDED holder is accepted. |
| **F-NEW-1** pre-guard reality assertions | **CONFIRMED** | `beforeAll` asserts `assignedToId`, `notes`, and `employmentStatus` before any test body runs. A silently-unassigned or notes-less fixture now reds in `beforeAll` instead of going vacuously green. |
| **F-NEW-1** nothing else can select or delete the fixture | **CONFIRMED, with one gap** | Every `employee`/`user`/`inventoryItem` write in `tests/e2e/` was read. The only broad deletes are `pagination.spec.ts:73-75` (`lastName: 'Zzpagetest'`, `email startsWith 'zzpagetest'`) — neither matches `Zzinvfixture` / `zzinvfixture@example.test`. `global-setup.ts`, `branches.spec.ts:54`, `leave-balances.spec.ts:55` all target specific seeded rows. **Gap:** see CONCERN-6 — the plan's claim that leftovers are swept by `scripts/clean-e2e-employees.ts` is false. |
| **F-NEW-1** idempotency across reruns | **CONFIRMED** | `user.upsert` by unique `email`; `employee.upsert` by unique `userId` (`schema.prisma:435`) with `update: { employmentStatus: 'OFFBOARDED' }`, so a leftover ACTIVE row from a killed run is corrected rather than inherited. `inventoryItem.deleteMany` by name runs before the `create`, so a leftover item cannot be reused with stale `notes`. |
| **F-NEW-2** commands | **CONFIRMED FIXED — run, not read** | `grep -c 'bun run exec'` = 0. `bunx dotenv` appears 17× (13 commands, 4 in prose/history). `node_modules/.bin/dotenv` exists; `package.json:15` is `"test:e2e": "dotenv -e .env.dev -- playwright test"`, so the plan's form matches the script's flags and argument order exactly. Executed live: `CI=1 bunx dotenv -e .env.dev -- playwright test tests/e2e/inventory.spec.ts --list` → `Total: 2 tests in 1 file`. The `-g "enforces the assign invariant"` filter in NC-1/NC-2 matches the real title `adds an item, enforces the assign invariant, then deletes it` (`inventory.spec.ts:32`). |
| **Cite** `inventory/+page.svelte:277-278` | **CONFIRMED CORRECT** | `:276` `{#if}`, `:277-278` the comment, `:279` the option, `:280` `{/if}`. |
| **Cite** `inventory/+page.svelte:340-343` | **CONFIRMED CORRECT** | `<p>` opens at `:340`, `</p>` at `:343`. |
| **Cite** `team/+page.svelte:36` | **CONFIRMED CORRECT** | `:36` is the `flex min-h-[calc(100dvh-6rem)] … lg:min-h-0` wrapper. `:60-71` toggle also correct. |
| **Cite** `+page.server.ts:114` / `:122` | **CONFIRMED CORRECT** | `:114` `const id = data.id as string`; `:122` `inputOf(parsed.data)` inside `update`. |
| **Cite** `employees/new/+page.svelte:585` | **CONFIRMED CORRECT** | `:585` is `{create.busy ? 'Creating…' : 'Create Employee'}`. |
| **Invented string** `— no longer active` | **CONFIRMED REMOVED** | `grep -n "no longer active" "src/routes/(app)/inventory/+page.svelte"` → no match. `:279` renders `{empName(item.assignedTo)}` unsuffixed; `empName` at `:20` is `` `${lastName}, ${firstName}` ``, so the test's `Zzinvfixture, Holder` is byte-correct. No other invented source claim found. |
| **Trimmed comment** | **CONFIRMED** | Exactly one `// ponytail:` marker in the whole plan (3 lines, in `tests/e2e/inventory.spec.ts`). **Zero new comments are introduced into any `src/` file:** the four comment blocks in the replacement markup are all carried verbatim and each was diffed against source — `settings/+layout.svelte:11-12`, `settings/+page.svelte:13-14` and `:31`, `inventory/+page.svelte:277-278`. The new spec files do carry new comments; that is normal for this repo's specs and outside the standing rule, which is scoped to `src/`. |

### New defects found in round 3

**FAIL-1 (class 2 — a gate that goes red against correct code). N3-T6 cannot run its own scenario: native constraint validation blocks the submit.**
The test fills only First Name and clicks Create Employee, expecting a server rejection. But
`<form method="POST" action="?/create" use:enhance…>` at `employees/new/+page.svelte:97` carries **no
`novalidate`**, and seven fields are `required` — `lastName:128`, `email:187`, `departmentId:255`,
`jobTitle:275`, `startDate:313`, `basicMonthlySalary:349` (plus `firstName:112`). Chromium blocks the
submit, the `submit` event `use:enhance` listens for never fires, no POST happens, `form` stays
`null`, `errorCount` is `0`, the aside error block never renders, and
`await expect(jump).toBeVisible()` times out. The test fails on correct code.
Compounding it: the only code path that produces `fieldErrors` is the zod `fail(400, …)` at
`+page.server.ts:140-141`. Every 409 path (`:176, :189, :196`) returns `{ error, values }` with **no
`fieldErrors`**, so a duplicate-email submit would also leave `errorCount === 0`. The replacement
scenario must satisfy every HTML constraint and still fail zod.
*Effect:* N3-AC6's jump-focus half and N3-AC3's 390-reachability half lose their only automated gate.

**FAIL-2 (class 2 — a gate that goes red against correct code). N2-T7's `aria-live` count is 2, not 1.**
`src/routes/(app)/+layout.svelte:214` mounts `<Toaster />` on every app page, and
`Toaster.svelte:49-52` renders `<div role="status" aria-live="polite" aria-atomic="false">`. The
final assertion `await expect(page.locator('[aria-live="polite"]')).toHaveCount(1)` therefore sees
**two** elements on `/settings` — the Toaster region and the new sr-only count line — and reds the
whole test on correct code.
*Fix:* scope it to the landmark and assert its content, which also removes a bare-count assertion:
`await expect(hub(page).locator('[aria-live="polite"]')).toHaveText(/\d+ of \d+ settings shown/)`.
*Effect:* N2-AC6 loses its only automated gate.

**CONCERN-4 (class 1 — a gate that cannot fail). "Space does not scroll" has no scrollable page.**
`expect(await page.evaluate(() => window.scrollY)).toBe(yBefore)` runs at Playwright's default
1280×720 against 3 seed items plus 1-2 e2e rows. The document is very likely shorter than the
viewport, so `scrollY` is `0` before and after **whether or not Space scrolls** — the assertion
cannot fail, which is precisely the failure the SPEC's hazard 1 forbids. Add a precondition that
reds when the page is not scrollable, e.g.
`expect(await page.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight), 'page must be scrollable for this to mean anything').toBe(true)`
before the Space press, or run this case at a short viewport.

**CONCERN-5 (class 3 — wrong cite, and the dangerous one). Step 15 quotes the submit row as `:578-589`; it is `:578-587`.**
`:588` is `</form>` and `:589` is `{/key}`. The quoted markup in Step 15 is correct and stops at
`</div>`, so an agent matching the quote is safe — but an agent deleting the stated **range** breaks
the component with no compile error at the deletion site. Round 2 listed `578-589` in its
"confirmed correct" set, so this cite has now survived two correction passes.

**CONCERN-6 (a false claim in the new fixture). `scripts/clean-e2e-employees.ts` does not sweep this fixture.**
The `afterAll` comment says "Leftovers are swept by `scripts/clean-e2e-employees.ts`". That script
matches on email prefix only, and its list is `const PREFIXES = ['e2e_', 'probe_', 'zzpagetest']`
(`scripts/clean-e2e-employees.ts:20`). `zzinvfixture@example.test` matches none of them, so a
best-effort teardown that loses a race leaves an OFFBOARDED employee and a user in the dev DB with
no sweeper — the exact leftover that Phase Completion Rule 5 exists to catch. Either add
`'zzinvfixture'` to `PREFIXES` (a one-line change to a file not currently in the blast radius, so it
must be added to Touchpoints) or delete the false sentence and make Rule 5's psql check mandatory.

**CONCERN-7 (class 3 — two more wrong cites, both carried over).**
- `submit-feedback.svelte.ts:70,82,90` is cited in Step 21 for `if (!after) await o.update()`. That
  line appears at **`:82` and `:90` only**; `:70` is `if (after) await after(o)`. The seam is real
  and the reasoning holds; the line list is wrong. Round 2 listed `70,82,90` as confirmed correct.
- `DatePicker.svelte:691-693` is cited in the N3-T10 note for the `aria-label="Open calendar"`
  trigger. The `<button>` opens at `:691`, but the `aria-label` is at **`:695`**. Round 2 found this
  and it was **not** included in the supplement request, so it was never fixed.

**CONCERN-8 (a claim the amendment made false). "No step runs `./start.sh`, vite or docker" is no longer true.**
Phase Completion Rule 5 (plan line 3091) prescribes
`docker exec -i veent-db-5434 psql …` as the leftover check, while the standing-constraints section
still asserts no step runs docker. The psql query is read-only and does not start a container, so
this is a wording defect, not a rule breach — but the two statements must be reconciled.

**Nit (not a finding).** Step 24 says its `th` constant is "lifted from `EmployeeTable.svelte:12`";
source at `:12` is `'px-4 py-2 text-left font-medium text-muted-foreground'` — the plan's string adds
`text-xs`. The plan's own value is the intended one; only the word "lifted" overstates it.

### Still-unproven, but not defects

- **N5-AC6's positive direction is unproven.** `update({ reset: false })` stops SvelteKit resetting
  the `<form>`, but `update()` still invalidates and re-runs `load`, which re-renders the modal's
  `<option selected={editing?.status === val}>` set. Whether the user's `ASSIGNED` selection survives
  that re-render is a live behaviour nobody has observed. NC-1 does not settle it: its expected red
  output (`Expected "ASSIGNED", Received "IN_STOCK"`) is **identical** to the output you get if the
  assertion simply cannot pass, so NC-1 cannot tell "guard removed" from "guard never worked". Run
  the unmutated test first and record it green **before** running NC-1; if it is red, bind the select
  to local `$state` seeded from `editing`.
- **N2-T4's title-row separation passes by the 12px `gap-3` only.** `PageHeader.svelte:35-36` puts the
  `<h1>` inside a `flex` row, so the h1 box is text-width and `search.x > heading.x + heading.width`
  clears comfortably. Verified, not a risk — recorded because the build lane rewrites that component.

### Standing constraints — re-checked, all clear

- `src/lib/rbac.ts`, `prisma/schema.prisma`, `src/lib/server/services/**`: no step touches any of
  them. The e2e fixture uses `PrismaClient` directly from `tests/`, the repo's existing idiom.
- `/inventory` actions and `itemSchema` unchanged; the modal's ten field names are exactly
  `itemSchema`'s (`+page.server.ts:46-61`), `notes` included, `id` on update only (read at `:114`).
- `Complete later — 12 optional fields` byte-identical: the string is at
  `employees/new/+page.svelte:413`, inside the `<details>` at `:411`, and Steps 13/14 do not touch it.
  `admin.spec.ts:128,159` click that exact string.
- Exactly one `Create Employee` at every width: Step 15 repositions one set of elements by CSS with
  no `hidden`/`block` pair; N3-T7 counts at DOM level via `querySelectorAll`, which does not skip
  hidden nodes, at all six widths. `admin.spec.ts:49` strict mode is safe.
- `/settings` search filter: `'holiday'` matches exactly one destination (`Holiday Calendar`,
  `settings-destinations.ts:90-91`) — no other label, desc or group contains the string, so
  `toHaveCount(1)` is correct and discriminating. No destination label equals a group name, so
  N2-T1's `exact: true` group assertions cannot collide.
- 17 destinations, 5 groups, 5 capability-gated (`:77, :109, :118, :177, :185`), both `System`
  entries gated — independently re-derived. Groups per role 5 / 5 / 4 stands.
- No `git add -A`; no `Co-Authored-By`, no AI attribution in any drafted commit message.
- App never deployed — no production reasoning anywhere in the plan.
- **Coverage count is honest.** The SPEC contains exactly 20 `N*-AC*` criteria; the plan declares
  "20 SPEC + 1 plan-added = 21" and the traceability table matches.

### Lane split — the no-overlap claim still holds

Re-read the build lane's Touchpoints (`owner-click-pass-build-lane_PLAN_18-09-26.md:40-70`): 5 source
files (`PageHeader.svelte`, `AttendanceHrGrid.svelte`, `separations/+page.svelte`,
`settings/org/+page.server.ts`, `settings/org/+page.svelte`) and 7 test files
(`page-header-helptip` unit + e2e, `settings-org-load`, `settings-org-assignments`,
`attendance-view-switch`, `employee-view-only`, `separations`). The design lane's 6 source + 4 test
files share **none** of them. The two runtime couplings the plan names are real and correctly
handled. **Safe to run concurrently — unchanged from round 2.**

Test gates:

| criterion id | behavior | strategy | proving test | gap-resolution |
|---|---|---|---|---|
| N2-AC1 | bar lists groups, not destinations | Fully-Automated | `settings-context-rail.spec.ts` › "bar lists groups only" (counts derived per role) | A |
| N2-AC2 | each destination rendered exactly once | Fully-Automated | same spec › "no destination is listed twice on the hub" + unchanged `settings-visibility.spec.ts:57-58` | A |
| N2-AC3 | sibling row only on sub-pages | Fully-Automated | same spec › "siblings only, sub-page only" | A |
| N2-AC4 | search on the title row, filters cards only | Fully-Automated | same spec › "search filters the cards only" | A |
| N2-AC5 | one line, no sideways scroll, all roles/widths | Fully-Automated | same spec › "one line at three widths and three roles", "no sideways scroll" | A |
| N2-AC6 | landmark, current-state, focus ring, announcement | Hybrid | same spec › "keyboard order, current-state and focus rings" + owner light/dark pass (Step 8) | **B** — the only gate reds on correct code; see FAIL-2 |
| N3-AC1 | full bleed, measured, never narrower than today | Fully-Automated | `employees-new-layout.spec.ts` › "form column widths at six viewports", "no sideways scroll" | A |
| N3-AC2 | rail is a sticky aside at 2xl | Fully-Automated | same spec › "rail is a sticky aside at 1536 and 1920", "no rail at 1440" | A |
| N3-AC3 | below 2xl the four things stack and stay reachable | Fully-Automated | same spec › "rail contents stack under the form below 2xl" (green); "jump to first error works at 390" | **B** — the 390 half reds on correct code; see FAIL-1 |
| N3-AC4 | exactly one Create Employee and one Cancel | Fully-Automated | same spec › "exactly one Create Employee and one Cancel at six widths" (DOM counts) + unchanged `admin.spec.ts` | A |
| N3-AC5 | disclosure text and behaviour unchanged | Fully-Automated | same spec › "disclosure text frozen", "opening the disclosure does not move the rail" + `admin.spec.ts:128,159` | A |
| N3-AC6 | tab order, jump focus, one h1 | Hybrid | same spec › "tab order unchanged above and below 2xl", "one h1" (both green); "jump to first error works at 390" + owner pass | **B** — the jump-focus half reds on correct code; see FAIL-1 |
| N5-AC1 | nothing overflows: page or modal | Fully-Automated | `inventory.spec.ts` › "no sideways scroll at three widths in both views", "modal fits three viewports including a short one" | A |
| N5-AC2 | the row is purely clickable | Fully-Automated | same spec › "rows carry no controls" | A |
| N5-AC3 | two views, List default, survives reload | Fully-Automated | same spec › "view toggle defaults to list and survives reload", "both views open the same modal" | A |
| N5-AC4 | one modal for create and edit; old add form gone | Fully-Automated | same spec › "add item uses the shared modal" (field-name equality against a literal ten-name list) + Step 29 server diff check | A |
| N5-AC5 | delete in the modal, confirm, assign invariant, holder preserved | Fully-Automated | same spec › rewritten `:53-54`, "assign invariant", "inactive holder is preserved on save" — fixture now verified sound | A |
| N5-AC6 | rejected save keeps modal open AND keeps edits | Fully-Automated | same spec › rewritten `:48-49` + **NC-1** | A — but record the unmutated green BEFORE NC-1; see §Still-unproven |
| N5-AC7 | focus after delete never falls to `<body>` | Fully-Automated | same spec › post-delete focus block (asserted by identity) + **NC-2** | A |
| N5-AC8 | row is a real button, named, keyboard-complete | Hybrid | same spec › "row is a button with a name", "focus on open, on close, and after delete" + owner pass (Step 33); "Enter and Space both open, Space does not scroll" | **B** — the Space-scroll half cannot fail; see CONCERN-4 |
| **N5-AC9** (plan-added) | a modal save preserves a non-empty `notes` | Fully-Automated | same spec › "a modal save preserves a non-empty notes value" — fixture now verified sound | A |

gap-resolution legend: A — proven now; B — fixed in this plan; C — deferred to a named phase; D — backlog test-building stub.

Legacy line form:
- N2 (`/settings`): Fully-automated: `CI=1 bunx dotenv -e .env.dev -- playwright test tests/e2e/settings-context-rail.spec.ts tests/e2e/settings-visibility.spec.ts`
- N3 (`/employees/new`): Fully-automated: `CI=1 bunx dotenv -e .env.dev -- playwright test tests/e2e/employees-new-layout.spec.ts tests/e2e/admin.spec.ts`
- N5 (`/inventory`): Fully-automated: `CI=1 bunx dotenv -e .env.dev -- playwright test tests/e2e/inventory.spec.ts`
- Unit + static: Fully-automated: `bun run format:check && bun run lint && bun run check && bun run test`
- Focus-ring visibility in light and dark (N2-AC6, N3-AC6, N5-AC8): hybrid: owner pass at Steps 8 and 33 — precondition: the three commits are in and a dev server is running (the owner starts it)
- Full regression: Fully-automated: `bun run test:e2e` after Commit 3

Dimension findings:
- Infra fit: PASS — `bunx dotenv -e .env.dev -- playwright test …` verified by running it; matches `package.json:15`'s flags and argument order. No step starts a server, vite or docker (see CONCERN-8 for one read-only `docker exec` wording clash).
- Test coverage: FAIL — two of the 21 criteria are carried by a gate that reds on correct code (FAIL-1, FAIL-2) and one by a gate that cannot fail (CONCERN-4).
- Breaking changes: PASS — `settings-visibility.spec.ts:57-58` and `admin.spec.ts:49,128,159` pass on both sides; the `/inventory` server surface is provably two lines inside `load`.
- Security surface: PASS — no auth, schema, permission, money or trust-boundary surface. `visibleSettings()` is read, never changed. The e2e fixture writes a disabled, OFFBOARDED user with a non-hash password that nobody can log in as.
- N2 section feasibility: FAIL — markup and derivations all verified (`SearchInput` spreads `id`/`autocomplete`/`class` onto its `<input>`, so `getByLabel` resolves; `{@const}` placement legal in both `{#each}` blocks; `scrollbar-none` defined at `tailwind.config.ts:68`). The single blocker is FAIL-2's `aria-live` count.
- N3 section feasibility: FAIL — all 29 `name=`/`id=` pairs verified in DOM order (`:109-390`, `:427-563`); `FIELD_ORDER` matches source exactly; `2xl` arithmetic correct. Blockers: FAIL-1, plus CONCERN-5's `:578-589` range.
- N5 section feasibility: CONCERN — page work is sound and every component API checked (`Dialog` `size:'wide'` = `max-w-lg sm:max-w-2xl lg:max-w-4xl` at `:67`; `scroll` is the only source of `max-h-[90vh]` at `:149`; `ConfirmDialog` z-60 at `:34`; `ConfirmButton` accepts `submit` at `:30`; `Pagination` renders its `<nav>` only when `total > pageSize`, which the `has-[nav]:` classes handle). Remaining: CONCERN-4, CONCERN-6.
- Test plan: FAIL — FAIL-1, FAIL-2, CONCERN-4.
- Gates / commit plan: PASS — command form verified live; CI order matches; explicit staged paths; no AI attribution.
- Lane split: PASS — zero file overlap with the build lane, re-verified against its Touchpoints table.

Open gaps: none deferred to backlog. One backlog note is still required by the plan itself and does
not yet exist — `inventory-row-save-erases-notes_NOTE_18-09-26.md` (§Phase Completion Rules item 7).

What this coverage does NOT prove:
- The e2e gates prove behaviour at 390/1024/1280/1440/1536/1920 × Chromium only. Nothing here proves
  any other engine, any other width, or the owner's real 125%-scaled viewport with docked DevTools
  (`innerHeight` has measured as low as 314 in this repo).
- `getComputedStyle(el).boxShadow !== 'none'` proves a ring **exists**. It proves nothing about the
  ring's contrast against its background in either theme — that is why N2-AC6, N3-AC6 and N5-AC8 are
  Hybrid, and a green suite does not carry them.
- NC-1 and NC-2 prove those two assertions respond to a mutation. NC-1 in particular does **not**
  prove the assertion is green-capable on correct code — its red output is indistinguishable from an
  assertion that can never pass. The other ~60 assertions in the three new specs have no negative
  control at all.
- The six-viewport width assertions use a ±8px tolerance. They cannot distinguish 1136 from 1132,
  only 1136 from 848 — which is the failure they exist for.
- Nothing here proves the three commits are free of the repo's known e2e flake (#287), nor that the
  dev DB's existing e2e residue rows do not change what a count-based assertion sees. Only a recorded
  pre-change baseline makes a post-change count meaningful.
- Step 29's `git diff --stat` proves the server file changed two lines. It proves nothing about
  whether those two lines are correct — only the view-toggle e2e does.
- Nothing proves the fixture's OFFBOARDED employee is invisible to every other spec's headcount
  assertions while the suite runs `fullyParallel` across files. No spec read in this pass asserts a
  total employee count, but that is an absence of evidence, not a gate.

Gate: BLOCKED (2 unresolved FAILs)
Accepted by: — (not applicable; gate is BLOCKED)

SUPPLEMENT REQUEST:
- Gap 1: Section test-plan | Concern: N3-T6 "jump to first error works at 390" fills only First Name and clicks Create Employee, but the form at `employees/new/+page.svelte:97` has no `novalidate` and seven fields are `required` (`:112, :128, :187, :255, :275, :313, :349`), so Chromium blocks the submit, no POST fires, `form` stays null, `errorCount` is 0 and the "Go to the first one" link never renders — the test reds on correct code. The 409 paths at `+page.server.ts:176, :189, :196` return no `fieldErrors`, so only the zod `fail(400, …)` at `:140-141` can produce the error block | Severity: FAIL | Suggested addition: rewrite the scenario to satisfy every HTML constraint and still fail zod (fill all seven required fields with natively-valid values and supply one server-invalid value, e.g. an over-length or malformed field that zod rejects), and assert the aside error block renders before clicking the jump link.
- Gap 2: Section test-plan | Concern: N2-T7's closing assertion `expect(page.locator('[aria-live="polite"]')).toHaveCount(1)` sees two elements — `src/routes/(app)/+layout.svelte:214` mounts `<Toaster />`, which renders `aria-live="polite"` at `Toaster.svelte:52` — so the whole test reds on correct code and N2-AC6 loses its only automated gate | Severity: FAIL | Suggested addition: scope and strengthen it to `await expect(hub(page).locator('[aria-live="polite"]')).toHaveText(/\d+ of \d+ settings shown/)`.
- Gap 3: Section test-plan | Concern: "Enter and Space both open, Space does not scroll" compares `window.scrollY` before and after at 1280×720 on a page with 3-5 rows, where the document is not scrollable, so `0 === 0` passes whether or not Space scrolls — a gate that cannot fail | Severity: CONCERN | Suggested addition: assert the page is scrollable as a precondition (`document.documentElement.scrollHeight > clientHeight`) or run the case at a short viewport.
- Gap 4: Section step-15 | Concern: the submit row is quoted as `:578-589`; it is `:578-587` — `:588` is `</form>` and `:589` is `{/key}`, so deleting the stated range breaks the component | Severity: CONCERN | Suggested addition: correct the range to `:578-587`.
- Gap 5: Section test-plan N5 fixture | Concern: the `afterAll` comment claims leftovers are swept by `scripts/clean-e2e-employees.ts`, but that script matches email prefixes only and its list is `['e2e_', 'probe_', 'zzpagetest']` (`scripts/clean-e2e-employees.ts:20`) — `zzinvfixture@example.test` matches none | Severity: CONCERN | Suggested addition: either add `'zzinvfixture'` to that script's `PREFIXES` and list the script in Touchpoints, or delete the false sentence and make Phase Completion Rule 5's psql check mandatory.
- Gap 6: Section step-21 and step-N3-T10-note | Concern: two cites are wrong — `if (!after) await o.update()` is at `submit-feedback.svelte.ts:82` and `:90` only (`:70` is `if (after) await after(o)`), and `DatePicker.svelte`'s `aria-label="Open calendar"` is at `:695`, not within the cited `:691-693` | Severity: CONCERN | Suggested addition: correct both in place.
- Gap 7: Section standing-constraints | Concern: "No step runs `./start.sh`, vite or docker" contradicts Phase Completion Rule 5's `docker exec -i veent-db-5434 psql …` leftover check | Severity: CONCERN | Suggested addition: qualify it as "no step starts a server or a container; Rule 5's read-only psql query runs against the container the owner already has up".
- Gap 8: Section test-plan N5 | Concern: NC-1's expected red output is identical to the output of an assertion that can never pass, so it cannot distinguish "guard removed" from "guard never worked"; `update()` still invalidates and re-renders the modal's `<option selected>` set, so it is unproven that the user's ASSIGNED selection survives a rejected save | Severity: CONCERN | Suggested addition: require the unmutated N5-AC6 assertion to be recorded green BEFORE NC-1 is run, and name the fallback (bind the select to local `$state` seeded from `editing`) if it is red.

---

## Supplement 18-09-26 — round-2 PVL gap closure

PVL-supplement mode. Scope: the two round-2 FAILs and the three round-2 CONCERNs only. No design
decision reopened, no scope change, no source file touched.

| Gap | Section | What changed |
|---|---|---|
| **F-NEW-1** (FAIL) | §Test plan N5 fixture, §Test-plan preamble, §Phase Completion Rules item 5 | The `beforeAll` no longer **picks** a holder. It **creates** a dedicated `User` + `Employee` (`zzinvfixture@example.test` / `Zzinvfixture, Holder`, `employeeNumber` `ZZINV-001`, created **OFFBOARDED**) with the exact required fields from `prisma/schema.prisma` (`User`: organizationId, email, passwordHash; `Employee`: userId, organizationId, employeeNumber, firstName, lastName, departmentId, jobTitle, employmentType, startDate, basicMonthlySalary). Nothing else can select it, so `pagination.spec.ts`'s `Zzpagetest` rows are irrelevant. A `lastName: { not: { startsWith: 'Zz' } }` filter was **explicitly rejected** — it couples this spec to another spec's naming convention and breaks silently on the next prefix. |
| **F-NEW-1** teardown | §Test plan N5 fixture | `afterAll` deletes in explicit FK order — item → payrollEntry → employee → user (`payrollEntry → employee` and `employee → user` are both RESTRICT) — wrapped in `try/catch` so a failed assertion cannot leave the org dirty or fail teardown. |
| **F-NEW-1** non-vacuity | §Test plan N5 fixture | `beforeAll` now asserts the fixture is **real before any guard runs**: item `assignedToId` equals the created holder, `notes` equals `FIXTURE_NOTES`, and the holder is `OFFBOARDED`. OFFBOARDED is what keeps the holder out of `where: { employmentStatus: 'ACTIVE' }` (`inventory/+page.server.ts:29-33`) so the `{#if}` at `inventory/+page.svelte:276` fires and `selectedBefore` is non-empty. Completion rule 5 gained a DB-level leftover check plus a `grep` that forbids an `orderBy` pick returning. |
| **F-NEW-2** (FAIL) | Steps 5, 7, 18, 32, §Gates (3 rows), NC-1, NC-2 | All ten occurrences now read `CI=1 bunx dotenv -e .env.dev -- playwright test …`. Zero `bun run` + `exec` forms remain anywhere in this file. |
| **CONCERN-1** cites | §Measured facts, §Step 26, §Step 27, §Why this shell is NOT `/team`'s, §The `notes` defect | Five corrected against source, each re-read at the line: inactive-assignee comment `inventory/+page.svelte:277-278` (was `:280-281`; `:279` is the option, `:280` the `{/if}`); footer hint `:340-343` (was `:339-343`); `/team` wrapper `team/+page.svelte:36` (was `:35`, which contradicted the plan's own note); `id` read at `inventory/+page.server.ts:114` and `inputOf` called at `:122` (both were `:113`); `Create Employee` string at `employees/new/+page.svelte:585` (was `:581`, which is `type="submit"`). Surrounding cites re-checked at the same time: `+page.server.ts:29-33` ACTIVE filter, `schema.prisma:1489` SetNull, `inventory/+page.svelte:20` `empName`, `:276` `{#if}` — all correct as written. |
| **CONCERN-2** invented string | §Step 27, §Deviations, §Test plan N5 | **Choice taken: dropped.** The preserved option now renders `{empName(editing.assignedTo)}` unsuffixed — byte-for-byte what `inventory/+page.svelte:279` renders today — and the test asserts the holder's name (`Zzinvfixture, Holder`) exactly as `empName` formats it. Why dropped rather than declared new: a `— no longer active` suffix is **new UI copy with no SPEC criterion behind it**, and giving it one would add a second plan-added criterion, breaking the "20 SPEC + 1 plan-added" count that must stay honest. Carrying the source label costs nothing and removes an invented fact. |

Deliberately **not** changed, per the supplement scope: `FIELD_ORDER`'s 18 names (re-verified
correct), the dropped sticky thead, N5-AC9 and the "20 SPEC + 1 plan-added" count, the `2xl` gating,
the pinned tab-order with no fallback, the `keyboard.press('Tab')` focus walk, and Step 5's
pre-flight.

**Re-validate required.** A plan amendment introduces defects; this one rewrote a test fixture.
VALIDATE round 3 should re-run against the new `beforeAll`/`afterAll` before EXECUTE starts.
