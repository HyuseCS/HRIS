---
name: report:n2-settings-nav-design
description: "Three named redesign directions for the /settings nav bar, with markup, layouts, cost and a11y"
date: 18-09-26
metadata:
  node_type: memory
  type: report
  feature: ui-ux-overhaul
  phase: "n2"
---

# N2 — Settings nav bar redesign (proposal only)

**TL;DR.** Three directions. **A — Context Rail** is my recommendation: the bar stops
listing 17 pages and starts listing the 5 **groups**; on a sub-page it adds a second row
with only that page's siblings. On `/settings` there is no sub-page, so the bar is 5 chips
and the grid below is the only list — the duplicate is gone by construction, not by hiding
anything. Search sits top-right on the title row, as the owner asked. Two files, one new
one-line helper, no new component, **no e2e breakage in any of the three directions**.

Nothing under `src/` was touched. This is a proposal.

---

## 1. What is on the page today (measured, not estimated)

| Surface | File:line | What it renders |
|---|---|---|
| Settings bar | `src/routes/(app)/settings/+layout.svelte:25-58` | `<nav aria-label="Settings sections">` — "All settings" + **every** visible destination, grouped, in a wrapping flex |
| Hub grid | `src/routes/(app)/settings/+page.svelte:32-49` | `<div role="region" aria-label="Settings destinations">` — **the same** destinations as cards, grouped, `sm:grid-cols-2 lg:grid-cols-3` |
| Sidebar | `src/routes/(app)/+layout.svelte:147` | `.filter((d) => d.inSidebar)` → a curated **7** of the 17 |
| Data | `src/lib/settings-destinations.ts:41-188` | 17 entries; `visibleSettings(roles)` at `:191` |

Counts I read off the table (`inSidebar: true` at lines 48, 56, 78, 86, 94, 127, 135 → 7
sidebar rows). The destination list is 17 / 14 / 12 for SUPER_ADMIN / HR_ADMIN / MANAGER,
per the brief.

**Why it reads "old and bulky."** Three reasons, all structural:

1. **It is a list of 17 links, and lists of 17 links wrap.** At 1280px the bar is 3 stacked
   rows of pills; at 390px it is 6+. Nothing else in this app is that tall and that
   uniform — `Tabs.svelte:76` keeps its rail to **one** scrolling line.
2. **It repeats the page below it verbatim.** The eye reads the bar, then reads the same 17
   names again in bigger type. That is what makes it feel like chrome rather than
   navigation.
3. **It is styled like a 2014 link farm.** `rounded-md px-2 py-1` text links on a bordered
   card, with a `text-xs uppercase` group caption stacked above each cluster
   (`+layout.svelte:37-40`). Square pills, no rail, no motion, no active indicator beyond a
   tint.

**The one thing the bar does that nothing else does:** on the 17 sub-pages it is the only
lateral move between settings pages (the sidebar carries 7 of 17). Any direction must keep
that, or degrade it knowingly.

---

## Direction A — **Context Rail** *(recommended)*

> The bar stops being a directory and becomes a **place indicator**: 5 group chips always,
> plus — only when you are on a sub-page — that group's siblings underneath.

### A.1 How it kills the duplicate

On `/settings` there is no current destination, so `siblings` is empty and the second row
never renders. The bar is then **5 group chips**; the grid below is **17 destinations**.
Two different lists doing two different jobs. Nothing is hidden and nothing is dropped —
the bar gained a job (group filter) instead of losing one.

Clicking a chip goes to `/settings?g=payroll`, which filters the grid. So the chips are
real navigation with real URLs, they work with JS off, they are shareable, and on a
sub-page they are the way back up into a *different* group.

### A.2 Markup

**`src/lib/settings-destinations.ts`** — one exported line appended (after `:195`):

```ts
export const groupSlug = (g: SettingsGroup) => g.toLowerCase().replace(/[^a-z]+/g, '-')
```

`'Time & Attendance' → 'time-attendance'`, `'Hiring & Separation' → 'hiring-separation'`.
No new field on the 17 entries, no new table — ladder rung 5, one line.

**`src/routes/(app)/settings/+layout.svelte`** — full replacement:

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
	const chip =
		'shrink-0 rounded-full px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
</script>

<div class="space-y-6">
	<nav aria-label="Settings sections" class="rounded-lg border bg-card">
		<div class="scrollbar-none flex items-center gap-1 overflow-x-auto px-2 py-1.5">
			<a
				href="/settings"
				aria-current={$page.url.pathname === '/settings' && !activeGroup ? 'page' : undefined}
				class="{chip} {$page.url.pathname === '/settings' && !activeGroup
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

Both `{@const}` uses are immediate children of an `{#each}`. `scrollbar-none` is the
project utility registered in `tailwind.config.ts:74-81` (defined, currently unused in
`src/` — this is its first consumer).

**`src/routes/(app)/settings/+page.svelte`** — full replacement:

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
				<h2 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</h2>
				<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{#each items as d (d.href)}
						<a
							href={d.href}
							class="group relative overflow-hidden rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							<span
								aria-hidden="true"
								class="absolute inset-y-0 left-0 w-0.5 bg-primary opacity-0 transition-opacity group-hover:opacity-100"
							></span>
							<p class="text-sm font-medium">{d.label}</p>
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

`.input` is the app.css recipe (`src/app.css`, `@layer components .input`); `SearchInput`
appends `min-w-0 flex-1 pl-9` itself (`SearchInput.svelte:14`) and its wrapper switches to
`flex` because the input carries `w-full` (`SearchInput.svelte:9`). So the box fills the
`sm:w-72` div and the magnifier stays centred on the `h-9` the `.input` recipe sets.

### A.3 Layout

**Desktop (≥1024px)**

```
┌──────────────────────────────────────────────────────────────────────┐
│ ( All settings ) │ (Organization) (Time & Attendance) (Payroll) ...  │   ← 1 line, 48px
└──────────────────────────────────────────────────────────────────────┘

  Settings                                        ┌──────────────────┐
  Master data and configuration for your org.     │ ⌕ Search settings│
                                                  └──────────────────┘

  ORGANIZATION
  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
  │▏Company Info  │ │▏Org Structure │ │▏Org Chart     │
  │ Name, address │ │ Depts & posns │ │ Reporting …   │
  └───────────────┘ └───────────────┘ └───────────────┘
  TIME & ATTENDANCE
  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐   ▏= primary accent
  │▏Work Schedules│ │▏Holiday Cal.  │ │▏Leave Types   │        on hover
  └───────────────┘ └───────────────┘ └───────────────┘
```

**Sub-page, desktop** (`/settings/holidays`)

```
┌──────────────────────────────────────────────────────────────────────┐
│ ( All settings ) │ (Organization) (Time & Attendance) (Payroll) ...  │
├──────────────────────────────────────────────────────────────────────┤
│  Work Schedules   [Holiday Calendar]   Leave Types                   │   ← siblings only
└──────────────────────────────────────────────────────────────────────┘
```

**390px, /settings**

```
┌────────────────────────────────┐
│(All settings)│(Organization)(T…│ →  scrolls inside the nav only
└────────────────────────────────┘
 Settings
 Master data and configuration
 for your organization.
┌────────────────────────────────┐
│ ⌕ Search settings…             │   ← full-width row of its own
└────────────────────────────────┘
 ORGANIZATION
┌────────────────────────────────┐
│ Company Information            │
│ Name, address, logo            │
└────────────────────────────────┘
┌────────────────────────────────┐
│ Org Structure                  │
└────────────────────────────────┘
```

Bar height at 390px: **one** 48px line that scrolls sideways *inside itself*
(`overflow-x-auto`), versus today's 6+ wrapped rows. The page never scrolls sideways.

### A.4 Where search sits and why

**Top-right of the title row** — the baseline the owner asked for. It is legal under the
`PageHeader` title-row rule (`PageHeader.svelte:25-32`): `/settings` passes no `back`
snippet, so the page may lay exactly one filter-like control beside the header. It is a
filter over the thing directly underneath it, so it sits directly above that thing.

Below `sm` it takes `w-full` and drops to its own row, which is the same behaviour the
`back` cluster already has (`PageHeader.svelte:45` `basis-full … sm:basis-auto`). Long
title never gets squeezed.

**No alternative proposed for A.** The chips and the search are two halves of the same
filter, but chips are navigation (they change the URL) and search is a view filter (it does
not) — keeping them on different rows is what makes that difference visible.

### A.5 Cost

| Item | Value |
|---|---|
| Files touched | `settings/+layout.svelte` (rewrite, ~55 lines), `settings/+page.svelte` (rewrite, ~80 lines), `settings-destinations.ts` (+1 line after `:195`) |
| New component | **None** |
| New dependency | None |
| e2e | **Nothing breaks.** See §5 |
| Risk | Low. `?g=` is additive; a bad or absent value falls through to "show everything" |

### A.6 Accessibility

- Bar stays `<nav aria-label="Settings sections">` — the accessible name is unchanged, so
  `getByRole('navigation', {name})` locators are stable.
- `aria-current="page"` on the sibling row for the destination you are on — same as today.
- `aria-current="true"` on the selected group chip. `true` (not `page`) is correct: the chip
  is not the current page, it is the current filter. Both are valid `aria-current` tokens.
- **Keyboard path on /settings:** sidebar → `All settings` → 5 chips → search box →
  destination cards in DOM order, group by group. Visual order == DOM order at every width;
  the grid is document-ordered, no `order-*` anywhere.
- **Keyboard path on a sub-page:** chips → siblings → page content. Two short rows instead
  of one 17-stop row. For a keyboard user this is the single biggest win in the redesign:
  today reaching page content on `/settings/backup` costs up to 18 tab stops.
- Every link carries `focus-visible:ring-2 focus-visible:ring-ring` — the bar has **no**
  visible focus style today (`+layout.svelte:47-49` sets colour only), so this is a genuine
  a11y fix, not decoration.
- `aria-live="polite"` count line announces the filter result; without it a search that
  empties the grid is silent to a screen reader.
- Hit size: `px-3 py-2` + `text-sm` ≈ **36px** tall, which is the app's control height
  (`.btn-*`, `.input` are all `h-9`). It is **not** 44px. I am matching the house norm
  deliberately; the repo's own coarse-pointer floor is 24px (`src/app.css`, the
  `@media (pointer: coarse)` block) and does not cover `a` elements at all. Flagging it
  rather than silently claiming 44.
- Motion: colour/opacity transitions only, no transforms, nothing to gate behind
  `prefers-reduced-motion`.
- Contrast: every pair is an existing token pair already shipped elsewhere —
  `text-primary` on `bg-primary/15` is the current active treatment (`+layout.svelte:31`),
  `text-muted-foreground` on `bg-card` is the current rest treatment. No new colour
  relationships in either theme, so nothing new to measure.

### A.7 Downside (the honest one)

**A cross-group jump on a sub-page costs two clicks instead of one.** From
`/settings/holidays` to `/settings/backup` today is one click; under A it is
`System` chip → `Document Backup` card. I judge that acceptable because the sidebar already
carries the 7 most-travelled destinations as one-click rows, and because the 17-link bar was
paying for that one click on *every page load, for every user, forever*. But it is a real
regression and the owner should see it before choosing.

Secondary: the `?g=` query on `/settings` is a second piece of view state next to the search
box, and the two can disagree in a mild way (chip "Payroll" + search "holiday" → empty
grid). The empty state names the search term, so it is recoverable, but it exists.

---

## Direction B — **Jump Bar**

> The bar stops listing anything. It becomes one slim line: where you are, plus a
> type-to-jump box that opens a filtered list.

### B.1 How it kills the duplicate

Absolutely — the bar holds **zero** destination names until the user types. The hub cards
become the only rendered list, on every page. This is the most complete answer to the
owner's constraint and the most modern-feeling of the three.

### B.2 Markup

**New component `src/lib/components/ui/SettingsJump.svelte`:**

```svelte
<script lang="ts">
	import { goto } from '$app/navigation'
	import SearchInput from '$lib/components/ui/SearchInput.svelte'
	import type { SettingsDestination } from '$lib/settings-destinations'

	let {
		destinations,
		label = 'Jump to a setting'
	}: { destinations: SettingsDestination[]; label?: string } = $props()

	const id = $props.id()
	let q = $state('')
	let open = $state(false)
	let active = $state(0)

	const needle = $derived(q.trim().toLowerCase())
	const matches = $derived(
		destinations.filter(
			(d) => !needle || `${d.label} ${d.desc} ${d.group}`.toLowerCase().includes(needle)
		)
	)

	function choose(d: SettingsDestination) {
		open = false
		q = ''
		void goto(d.href)
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false
			return
		}
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault()
			open = true
			if (matches.length === 0) return
			active =
				e.key === 'ArrowDown'
					? (active + 1) % matches.length
					: (active - 1 + matches.length) % matches.length
			return
		}
		if (e.key === 'Enter' && open && matches[active]) {
			e.preventDefault()
			choose(matches[active])
		}
	}
</script>

<div class="relative w-full sm:w-80">
	<label for="{id}-input" class="sr-only">{label}</label>
	<SearchInput
		id="{id}-input"
		bind:value={q}
		role="combobox"
		aria-expanded={open}
		aria-controls="{id}-list"
		aria-autocomplete="list"
		aria-activedescendant={open && matches[active] ? `${id}-opt-${active}` : undefined}
		autocomplete="off"
		placeholder="Jump to a setting…"
		class="input w-full"
		onfocus={() => (open = true)}
		oninput={() => {
			open = true
			active = 0
		}}
		onblur={() => setTimeout(() => (open = false), 120)}
		{onkeydown}
	/>
	{#if open}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<ul
			id="{id}-list"
			role="listbox"
			aria-label={label}
			class="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-lg"
		>
			{#each matches as d, i (d.href)}
				<li
					id="{id}-opt-{i}"
					role="option"
					aria-selected={i === active}
					class="cursor-pointer rounded-md px-3 py-2 {i === active ? 'bg-accent' : ''}"
					onmousedown={(e) => {
						e.preventDefault()
						choose(d)
					}}
				>
					<span class="block text-sm font-medium">{d.label}</span>
					<span class="block text-xs text-muted-foreground">{d.group} · {d.desc}</span>
				</li>
			{:else}
				<li class="px-3 py-2 text-sm text-muted-foreground">No settings match.</li>
			{/each}
		</ul>
	{/if}
</div>
```

`SearchInput` spreads `...rest` onto the `<input>` (`SearchInput.svelte:14`), so every
`role`/`aria-*`/handler above lands on the real element; `bind:value` is applied after the
spread, so it coexists with `oninput`.

**`src/routes/(app)/settings/+layout.svelte`** — bar body becomes:

```svelte
<nav
	aria-label="Settings sections"
	class="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2"
>
	<a
		href="/settings"
		aria-current={$page.url.pathname === '/settings' ? 'page' : undefined}
		class="shrink-0 rounded-md px-2 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {$page
			.url.pathname === '/settings'
			? 'text-foreground'
			: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
	>
		All settings
	</a>
	{#if current}
		<span aria-hidden="true" class="text-muted-foreground">/</span>
		<span class="truncate text-sm text-muted-foreground">{current.group}</span>
		<span aria-hidden="true" class="text-muted-foreground">/</span>
		<span class="truncate text-sm font-semibold text-foreground">{current.label}</span>
	{/if}
	<div class="ml-auto w-full sm:w-auto">
		<SettingsJump destinations={visible} />
	</div>
</nav>
```

with `const current = $derived(visible.find((d) => d.href === $page.url.pathname))` added to
the script. `settings/+page.svelte` is **unchanged** except the title-row question below.

### B.3 Layout

**Desktop**

```
┌──────────────────────────────────────────────────────────────────────┐
│ All settings / Time & Attendance / Holiday Calendar   ┌────────────┐ │  ← 1 line, 52px
│                                                       │⌕ Jump to a…│ │
└───────────────────────────────────────────────────────└────────────┘─┘
                                                        ┌────────────────┐
                                                        │ Work Schedules │
                                                        │ Time & Att · … │
                                                        │ Holiday Calen… │  ← listbox
                                                        │ Leave Types    │
                                                        └────────────────┘
```

**390px**

```
┌────────────────────────────────┐
│ All settings / … / Holiday Cal.│
│ ┌────────────────────────────┐ │   ← box wraps to its own full-width row
│ │ ⌕ Jump to a setting…       │ │
│ └────────────────────────────┘ │
└────────────────────────────────┘
```

Hub page below is exactly today's card grid, unchanged.

### B.4 Where search sits and why

**In the bar, not on the title row.** This is the "different home obviously better" case the
brief invited. In B the search box *is* the navigation — it has to be present on all 17
sub-pages, and the title row of a sub-page is already spoken for by that page's Back button
(`PageHeader.svelte:20-21`). One home on all 18 pages beats one home on 1 page and a
different home on 17.

If the owner still wants it top-right on `/settings`, B can render the bar's jump box only
on sub-pages and put a plain filter box on the hub title row — but then the app has two
search controls that look alike and behave differently, and I would argue against it.

### B.5 Cost

| Item | Value |
|---|---|
| Files touched | `settings/+layout.svelte` (rewrite), **new** `src/lib/components/ui/SettingsJump.svelte` (~90 lines) |
| New component | **Yes — one.** See justification below |
| New dependency | None |
| e2e | Nothing breaks. The listbox rows are `role="option"`, not links, so the unscoped `getByRole('link')` counts at `settings-visibility.spec.ts:57-58` are unaffected |
| Risk | **Medium-high.** Hand-rolled combobox; blur-vs-click ordering, mobile virtual keyboard, and `aria-activedescendant` are all classic sources of live-only bugs |

**New-component justification against the ladder.** Rung 1 (does it need to exist?) — for
this direction, yes: there is no combobox, popover or menu primitive in
`src/lib/components/ui/` (verified — the only popovers are the bespoke ones inside
`DatePicker.svelte` and `TimePicker.svelte`, neither extractable without a refactor). Rung 3
(native platform feature) — `<datalist>` is the native answer and is rejected: it cannot
render the `group · desc` second line, and its styling and mobile behaviour are not
controllable. Rung 4 (installed dependency) — none present. So rung 6, minimum code, ~90
lines. **This is the only direction that adds a file, and it is the reason I do not
recommend it.**

### B.6 Accessibility

- `<nav aria-label="Settings sections">` preserved.
- The breadcrumb text is plain text, not links — `aria-current` is dropped rather than put
  on a `<span>`, since `All settings` already carries `aria-current="page"` on the hub.
- Combobox follows the ARIA 1.2 pattern: `role="combobox"` + `aria-expanded` +
  `aria-controls` + `aria-autocomplete="list"` + `aria-activedescendant`, with DOM focus
  staying on the input.
- Keyboard: Tab → `All settings`, Tab → input. Down/Up move the active option, Enter
  navigates, Escape closes. Focus never enters the list, so there is no focus-trap to build.
- The `onmousedown` handler on `<li role="option">` will trip Svelte's
  `a11y_no_noninteractive_element_interactions` check; the `svelte-ignore` above is required
  and is the standard escape for this pattern.
- Contrast: `bg-popover` / `text-popover-foreground` are defined in both themes
  (`src/app.css` `:root` and `.dark`) and are already used by no other component — this
  would be their first real consumer, so the pair must be eyeballed in dark mode once.

### B.7 Downside (the honest one)

**It removes browsing.** On a sub-page, a user who does not already know the name of the
setting they want has no list to scan — they must go back to `/settings` first. The current
bar's one redeeming quality is exactly that scan. Search is only faster than scanning when
you know the target; settings are the classic case where you *don't*. This is the direction
most likely to look great in a screenshot and annoy someone on day three.

Secondary: it is the only direction with a genuine chance of a live-only defect (blur/click
race, iOS keyboard pushing the listbox off-screen).

---

## Direction C — **Split Rail**

> Each surface does one job and they never appear together: the bar is hidden on
> `/settings`, and on the 17 sub-pages it becomes a slim one-line scrolling rail.

### C.1 How it kills the duplicate

By separation in time rather than in content: `{#if $page.url.pathname !== '/settings'}`.
The hub is the list on the hub; the rail is the list everywhere else. This is the closest of
the three to "dropping it", and I present it because it is by far the cheapest and because
the rail itself is a real redesign — it goes from a wrapping 3-row link farm to a single
44px chrome-tab strip with group dividers.

The hub is also reworked: cards become **dense list rows** with a chevron, which reads as a
directory (its actual job) instead of 17 competing tiles.

### C.2 Markup

**`src/routes/(app)/settings/+layout.svelte`** — keeps today's `groups` derivation
(`+layout.svelte:16-21`) verbatim; only the markup changes:

```svelte
{#if $page.url.pathname !== '/settings'}
	<nav aria-label="Settings sections" class="rounded-lg border bg-card">
		<div class="scrollbar-none flex items-center gap-1 overflow-x-auto px-2 py-1.5">
			<a
				href="/settings"
				class="shrink-0 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				All settings
			</a>
			{#each groups as [group, items] (group)}
				<span aria-hidden="true" class="mx-1 h-5 w-px shrink-0 bg-border"></span>
				<span
					class="shrink-0 px-1 text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground/70"
				>
					{group}
				</span>
				{#each items as d (d.href)}
					{@const on = $page.url.pathname === d.href}
					<a
						href={d.href}
						aria-current={on ? 'page' : undefined}
						class="shrink-0 rounded-md px-2.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {on
							? 'bg-primary/15 font-semibold text-primary'
							: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
					>
						{d.label}
					</a>
				{/each}
			{/each}
		</div>
	</nav>
{/if}

{@render children()}
```

Wrapper `<div class="space-y-6">` still wraps both, so spacing is unchanged when the nav is
absent (`space-y` collapses cleanly with one child).

**`src/routes/(app)/settings/+page.svelte`** — same script as Direction A (search state and
`matches`), minus the `?g=` filter, with this body:

```svelte
<div role="region" aria-label="Settings destinations" class="space-y-6">
	<p aria-live="polite" class="sr-only">{matches.length} of {visible.length} settings shown</p>
	{#each groups as [group, items] (group)}
		<section>
			<h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{group}
			</h2>
			<ul class="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2">
				{#each items as d (d.href)}
					<li class="bg-card">
						<a
							href={d.href}
							class="flex h-full items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
						>
							<span class="min-w-0 flex-1">
								<span class="block text-sm font-medium">{d.label}</span>
								<span class="block truncate text-xs text-muted-foreground">{d.desc}</span>
							</span>
							<ChevronRight class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/each}
</div>
```

with `import ChevronRight from 'lucide-svelte/icons/chevron-right'`. `lucide-svelte@^0.460.0`
is already a dependency (`package.json:75`) and the per-icon import path is the idiom already
used at `SearchInput.svelte:2` and `DatePicker.svelte:2-3`.

The `gap-px` + `bg-border` + `bg-card` cell trick draws every hairline with no `nth-child`
arithmetic and no stray edge line at any row count, in either theme.

### C.3 Layout

**Sub-page, desktop**

```
┌──────────────────────────────────────────────────────────────────────────┐
│ All settings │ ORGANIZATION Company Org Chart │ TIME & ATT. Schedules [Ho…│ → scrolls
└──────────────────────────────────────────────────────────────────────────┘
```

**/settings, desktop** — no bar at all:

```
  Settings                                        ┌──────────────────┐
  Master data and configuration for your org.     │ ⌕ Search settings│
                                                  └──────────────────┘
  ORGANIZATION
  ┌───────────────────────────┬───────────────────────────┐
  │ Company Information     › │ Org Structure           › │
  │ Name, address, logo       │ Departments & positions   │
  ├───────────────────────────┼───────────────────────────┤
  │ Org Chart               › │ Roles & Access          › │
  └───────────────────────────┴───────────────────────────┘
```

**390px** — rail is one scrolling line; hub list goes single column, rows ~60px.

```
┌────────────────────────────────┐
│All settings│ORGANIZATION Comp…│ →
└────────────────────────────────┘
 ...
┌────────────────────────────────┐
│ Company Information          › │
│ Name, address, logo            │
├────────────────────────────────┤
│ Org Structure                › │
└────────────────────────────────┘
```

### C.4 Where search sits and why

**Top-right of the title row**, same as A, same justification
(`PageHeader.svelte:25-32`, no `back` snippet on `/settings`). In C the search has nowhere
else to go: the bar does not exist on the only page the search applies to.

### C.5 Cost

| Item | Value |
|---|---|
| Files touched | `settings/+layout.svelte` (markup only, derivations untouched), `settings/+page.svelte` (rewrite) |
| New component | **None** |
| New dependency | None (new *icon import* from an installed package) |
| e2e | Nothing breaks. `role="region"` landmark and link roles both survive the `<ul>/<li>` wrapping |
| Risk | **Lowest of the three.** No new state machine, no new URL param |

### C.6 Accessibility

- `<nav aria-label="Settings sections">` preserved on the 17 sub-pages; **absent** on
  `/settings`. Any future test that expects that landmark on the hub would need updating —
  none exists today (`settings-visibility.spec.ts:8` scopes to the `Main` navigation, not
  this one).
- `aria-current="page"` on the rail's active destination — unchanged from today.
- Group captions are decorative `<span>`s inside the nav, not headings. They read as extra
  text to a screen reader walking the nav. If that is judged noisy, the alternative is
  `aria-hidden="true"` on them plus a `<span class="sr-only">` group prefix on each link;
  say the word and I will spell it out.
- Hub rows are a real `<ul>`/`<li>` list, so a screen reader announces "list, N items" per
  group — better than today's `<div>` grid of anonymous links.
- `focus-visible:ring-inset` on the hub rows so the ring is not clipped by the container's
  `overflow-hidden`.
- Keyboard path on the hub: sidebar → search → rows, group by group, DOM order == visual
  order in both the 1-column and 2-column layouts (CSS Grid fills in document order; no
  `grid-flow-col`, no `order-*`).
- Contrast/tokens: only existing pairs. `text-[0.625rem]` group caption at
  `text-muted-foreground/70` is the one thing to measure live — 10px at 70% opacity over
  `bg-card` is the weakest pair in any of the three proposals and may need to go to full
  `text-muted-foreground`.

### C.7 Downside (the honest one)

**It is the least "more than what it is".** The owner explicitly said *"instead of dropping
it or whatever, let's re-design it into something more than what it is."* C redesigns it
handsomely but also removes it from the page where the complaint was raised. If the owner
looks at `/settings` and sees no bar, this reads as the thing they asked me not to do — even
though the bar is alive and better on 17 other pages.

Secondary: on a sub-page the rail is still 17 items long. It is one line instead of three,
but reaching the last item is a horizontal scroll, and horizontal scroll is a weak
affordance on desktop with a mouse and no visible scrollbar (`scrollbar-none`). A fade mask
on the right edge would help and is not in the markup above.

---

## 5. e2e impact — checked, not assumed

`tests/e2e/settings-visibility.spec.ts`:

| Line | What it does | A | B | C |
|---|---|---|---|---|
| 5-6 | `hubCard` = `getByRole('region', {name: 'Settings destinations'}).getByRole('link', …)` | ok — landmark and attribute kept verbatim | ok — hub untouched | ok — landmark kept; `<li>` wrapper does not change the link role |
| 7-8 | `sidebarRow` scoped to `navigation` named **`Main`** | unaffected — our nav is named `Settings sections` | same | same |
| 35, 41-43 | Holiday card visible, clickable, lands on `/settings/holidays` | ok | ok | ok |
| 57-58 | **Unscoped** `getByRole('link', {name: /Payroll Config/}).toHaveCount(0)` for HR/Manager | ok — those roles never get the entry from `visibleSettings`, and the group chips carry group names, not destination names | ok — bar carries no destination names; listbox rows are `role="option"` | ok — bar is not rendered on `/settings` |
| 65-66, 68 | Super Admin sees all three hub cards | ok | ok | ok |

**One thing to watch in all three:** lines 57-58 are unscoped and would start failing if any
direction ever rendered a destination label twice on `/settings` for a *visible* role. None
of the three does. That assertion is, in effect, a regression guard on the very duplication
the owner is complaining about — worth keeping.

Also note the comment at `settings-visibility.spec.ts:32-34` ("the hub card, the settings
sub-nav row and the sidebar row all carry the SAME canonical label, so an unscoped locator
matches three links"). Under **A** on `/settings` that drops from three to two; under **C**
it drops to two as well. Nobody depends on it being three, but the comment will be stale and
should be corrected in the same commit.

---

## 6. Comparison

| | **A — Context Rail** | **B — Jump Bar** | **C — Split Rail** |
|---|---|---|---|
| Kills the duplicate | By giving the bar a different list (groups) | Completely — bar lists nothing | By hiding the bar on one page |
| "More than it was"? | **Yes** — gains a filter job | Yes — gains a search job | Partly — better, but absent where asked |
| Bar height, 1280px | 48px (1 row) / 96px on a sub-page | 52px (1 row) | 44px (1 row), 0 on the hub |
| Bar height, 390px | 48px, scrolls in place | 96px (box wraps) | 44px, scrolls in place |
| Browsing preserved on sub-pages | Within group, 1 click; across groups, 2 | **No** — search only | Yes, all 17, 1 click |
| New component | No | **Yes (1)** | No |
| Files touched | 3 | 2 (1 new) | 2 |
| Search home | Title row (baseline) | In the bar (argued) | Title row (baseline) |
| e2e breakage | None | None | None |
| Build risk | Low | Medium-high | Lowest |
| Biggest downside | 2 clicks across groups | Removes scanning | Reads as "dropped it" |

---

## 7. Recommendation — **A, Context Rail**

Because it is the only one of the three that answers the owner's sentence literally. They
said *more than what it is*: A gives the bar a job it never had (group filter for the hub)
while keeping the job it does have (lateral movement between sibling settings). B takes a
job away, C takes the bar away on the page in question. A is also the only one that makes
the bar **the same height on all 18 pages and at all three role sizes** — 17 / 14 / 12
destinations do not change the chip row at all, because the chip row counts groups, not
destinations. That is what makes it stop looking bulky, and it is structural, so it cannot
drift back.

It costs no new component, it touches three files, it breaks no test, and its single real
regression (cross-group jump on a sub-page is two clicks) is buffered by the sidebar's
curated 7.

**If the owner wants scanning preserved above all**, take C. **Do not take B** unless they
want the command-palette feel badly enough to pay for a hand-rolled combobox and accept that
browsing settings by name goes away.

---

## Open questions

1. **Cross-group jump (A).** Is two clicks acceptable from a sub-page, or should the sibling
   row get a trailing "All settings ›" link so it is one click to the hub and two to
   anything? I left it out to keep the row honest.
2. **`?g=` persistence (A).** Should a chip selection survive into a sub-page and back (so
   returning to `/settings` re-applies the last group), or reset every time? I proposed
   reset — simplest, and stale filters are a classic "where did my stuff go".
3. **Search scope.** I match `label`, `desc` **and** `group`, so typing "payroll" finds all
   four Payroll destinations even though only two have "Payroll" in the label. Confirm that
   is wanted; matching label-only is one deletion.
4. **Group captions in C's rail** — read aloud by a screen reader as loose text inside the
   nav. Keep, or hide and move into each link's accessible name?
5. **36px vs 44px touch targets.** I matched the house `h-9` norm rather than the 44px
   guideline. Standing decision, or should the settings bar be the exception?

*Proposal only. No file under `src/` was modified.*
