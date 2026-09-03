<script lang="ts">
	import { page } from '$app/stores'
	import { pushState } from '$app/navigation'
	import { TABS, hrefFor, type TabId } from './employee-tabs'

	// Real anchors, not buttons: before hydration and with JS off a button + pushState tab strip
	// leaves four of the five tabs unreachable. The href alone deep-links; the click handler only
	// upgrades it to a shallow (no `load` re-run) URL change.
	let { active }: { active: TabId } = $props()

	let strip = $state<HTMLElement>()

	function go(id: TabId) {
		pushState(hrefFor($page.url, id), $page.state)
	}

	function onclick(e: MouseEvent, id: TabId) {
		// Let the browser handle middle-click / modified clicks (new tab, new window).
		if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
		e.preventDefault()
		go(id)
	}

	// ARIA tabs keyboard pattern: arrows move (and select) along the strip, Home/End jump.
	function onkeydown(e: KeyboardEvent) {
		const i = TABS.findIndex((t) => t.id === active)
		const next =
			e.key === 'ArrowRight'
				? (i + 1) % TABS.length
				: e.key === 'ArrowLeft'
					? (i - 1 + TABS.length) % TABS.length
					: e.key === 'Home'
						? 0
						: e.key === 'End'
							? TABS.length - 1
							: -1
		if (next < 0) return
		e.preventDefault()
		go(TABS[next].id)
		strip?.querySelector<HTMLElement>(`#tab-${TABS[next].id}`)?.focus()
	}
</script>

<div
	bind:this={strip}
	role="tablist"
	aria-label="Employee record sections"
	class="sticky top-0 z-20 -mx-1 flex gap-1 overflow-x-auto border-b bg-background px-1"
>
	{#each TABS as tab (tab.id)}
		{@const current = tab.id === active}
		<a
			id="tab-{tab.id}"
			role="tab"
			href={hrefFor($page.url, tab.id)}
			aria-selected={current}
			aria-controls="panel-{tab.id}"
			tabindex={current ? 0 : -1}
			onclick={(e) => onclick(e, tab.id)}
			{onkeydown}
			class="whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors {current
				? 'border-primary text-foreground'
				: 'border-transparent text-muted-foreground hover:text-foreground'}"
		>
			{tab.label}
		</a>
	{/each}
</div>
