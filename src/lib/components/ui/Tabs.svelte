<script lang="ts">
	import type { Snippet } from 'svelte'
	import { page } from '$app/stores'
	import { goto } from '$app/navigation'

	interface Tab {
		key: string
		label: string
		short?: string
		count?: string
		tone?: 'warning'
	}

	let {
		tabs,
		active = $bindable(),
		label,
		param,
		panel,
		bare = false
	}: {
		tabs: Tab[]
		active: string
		label: string
		param?: string
		panel: Snippet<[string]>
		bare?: boolean
	} = $props()

	const base = `tabs-${param ?? tabs.map((t) => t.key).join('-')}`

	// svelte-ignore state_referenced_locally
	const fromUrl = param ? $page.url.searchParams.get(param) : null
	// svelte-ignore state_referenced_locally
	if (fromUrl && tabs.some((t) => t.key === fromUrl)) active = fromUrl

	const pill =
		'rounded-full px-1.5 py-px text-[0.6875rem] font-medium leading-4 tabular-nums sm:px-2 sm:py-0.5 sm:text-xs'

	function pillTone(t: Tab, selected: boolean) {
		if (t.tone === 'warning') return 'bg-yellow-500/20 text-yellow-800 dark:text-yellow-400'
		return selected
			? 'bg-primary/15 text-red-800 dark:text-red-400'
			: 'bg-foreground/10 text-foreground/70'
	}

	function select(key: string) {
		active = key
		if (!param) return
		const url = new URL($page.url)
		url.searchParams.set(param, key)
		void goto(url, { replaceState: true, noScroll: true, keepFocus: true })
	}

	function onKeydown(e: KeyboardEvent, i: number) {
		let next = i
		if (e.key === 'ArrowRight') next = (i + 1) % tabs.length
		else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length
		else if (e.key === 'Home') next = 0
		else if (e.key === 'End') next = tabs.length - 1
		else return
		e.preventDefault()
		select(tabs[next].key)
		document.getElementById(`${base}-tab-${tabs[next].key}`)?.focus()
	}
</script>

<div
	class={bare
		? 'flex min-h-0 flex-1 flex-col'
		: `overflow-hidden border bg-card ${tabs.length > 1 ? 'rounded-b-lg' : 'rounded-lg'}`}
>
	{#if tabs.length > 1}
		<div
			role="tablist"
			aria-label={label}
			class="flex gap-1 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden{bare
				? ' shrink-0'
				: ''}"
		>
			{#each tabs as t, i (t.key)}
				<button
					type="button"
					role="tab"
					id="{base}-tab-{t.key}"
					aria-selected={active === t.key}
					aria-controls="{base}-panel"
					tabindex={active === t.key ? 0 : -1}
					onclick={() => select(t.key)}
					onkeydown={(e) => onKeydown(e, i)}
					class="inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4 {active ===
					t.key
						? 'border-primary bg-primary/[0.07] font-semibold text-foreground'
						: 'border-transparent font-medium text-muted-foreground hover:border-foreground/20 hover:bg-foreground/[0.04] hover:text-foreground'}"
				>
					{#if t.short}
						<span class="sm:hidden">{t.short}</span><span class="hidden sm:inline">{t.label}</span>
					{:else}
						{t.label}
					{/if}
					{#if t.count}
						<span aria-hidden="true" class="{pill} {pillTone(t, active === t.key)}">{t.count}</span>
						<span class="sr-only">, {t.count}</span>
					{/if}
				</button>
			{/each}
		</div>
		<div
			role="tabpanel"
			id="{base}-panel"
			aria-labelledby="{base}-tab-{active}"
			class={bare ? 'flex min-h-0 flex-1 flex-col overflow-y-auto' : undefined}
		>
			{@render panel(active)}
		</div>
	{:else if tabs.length === 1}
		<h2
			class="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold{bare
				? ' shrink-0'
				: ''}"
		>
			{tabs[0].label}
			{#if tabs[0].count}
				<span aria-hidden="true" class="{pill} {pillTone(tabs[0], false)}">{tabs[0].count}</span>
				<span class="sr-only">, {tabs[0].count}</span>
			{/if}
		</h2>
		{#if bare}
			<div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
				{@render panel(tabs[0].key)}
			</div>
		{:else}
			{@render panel(tabs[0].key)}
		{/if}
	{/if}
</div>
