<script lang="ts">
	import { page } from '$app/stores'
	import {
		SETTINGS_GROUP_ORDER,
		visibleSettings,
		type SettingsDestination,
		type SettingsGroup
	} from '$lib/settings-destinations'
	import type { LayoutData } from './$types'

	// `user.roles` comes from the root (app) layout load — child layouts inherit it, so this
	// sub-nav needs no load of its own.
	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props()

	const visible = $derived(visibleSettings(data.user.roles))
	const groups = $derived(
		SETTINGS_GROUP_ORDER.map(
			(group) =>
				[group, visible.filter((d) => d.group === group)] as [SettingsGroup, SettingsDestination[]]
		).filter(([, items]) => items.length > 0)
	)
</script>

<div class="space-y-6">
	<nav aria-label="Settings sections" class="overflow-x-auto rounded-lg border bg-card p-3">
		<div class="flex flex-wrap items-start gap-x-6 gap-y-3">
			<a
				href="/settings"
				aria-current={$page.url.pathname === '/settings' ? 'page' : undefined}
				class="rounded-md px-2 py-1 text-sm font-medium {$page.url.pathname === '/settings'
					? 'bg-primary/15 text-primary'
					: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
			>
				All settings
			</a>
			{#each groups as [group, items] (group)}
				<div class="space-y-1">
					<p class="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{group}
					</p>
					<div class="flex flex-wrap gap-1">
						{#each items as d (d.href)}
							{@const active = $page.url.pathname === d.href}
							<a
								href={d.href}
								aria-current={active ? 'page' : undefined}
								class="rounded-md px-2 py-1 text-sm {active
									? 'bg-primary/15 font-medium text-primary'
									: 'text-muted-foreground hover:bg-accent hover:text-foreground'}"
							>
								{d.label}
							</a>
						{/each}
					</div>
				</div>
			{/each}
		</div>
	</nav>

	{@render children()}
</div>
