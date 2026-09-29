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
