<script lang="ts">
	import type { Snippet } from 'svelte'

	// One page title treatment for every route. Before this the app carried six different
	// heading class strings across 52 pages, plus a legacy pair of CSS utility classes used on
	// two of them, so the heading size and the gap under it drifted page to page. Those legacy
	// rules are gone from app.css now — this component is the only title treatment left.
	let {
		title,
		description,
		back
	}: {
		title: string
		/** One line under the title. Say what the page is for, not what it is called. */
		description?: string
		/** A BackButton, rendered on the right edge of the title row — the side opposite the sidebar. */
		back?: Snippet
	} = $props()
</script>

<!-- Title-row rule: the title, its description and the Back link, nothing else. Page actions
     move DOWN to the heading row of the first section they act on (right-aligned, level with
     that heading), so Back is the only thing a thumb can hit on the title line and each action
     sits beside the thing it changes. This component therefore takes no actions prop at all.
     `ml-auto` keeps the Back cluster flush right on whatever line it lands on, and below `sm`
     it takes a full-width row of its own so a long title is never squeezed against it. -->
<div class="flex flex-wrap items-start justify-between gap-3">
	<div class="min-w-0 flex-1 space-y-1">
		<h1 class="text-2xl font-bold tracking-tight">{title}</h1>
		{#if description}
			<p class="max-w-2xl text-sm text-muted-foreground">{description}</p>
		{/if}
	</div>
	{#if back}
		<div
			class="ml-auto flex basis-full shrink-0 flex-wrap items-center justify-end gap-2 sm:basis-auto"
		>
			{@render back()}
		</div>
	{/if}
</div>
