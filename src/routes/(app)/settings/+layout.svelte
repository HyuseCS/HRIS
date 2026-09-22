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
