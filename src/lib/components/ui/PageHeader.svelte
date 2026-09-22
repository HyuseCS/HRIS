<script lang="ts">
	import type { Snippet } from 'svelte'
	import HelpTip from './HelpTip.svelte'

	// One page title treatment for every route. Before this the app carried six different
	// heading class strings across 52 pages, plus a legacy pair of CSS utility classes used on
	// two of them, so the heading size and the gap under it drifted page to page. Those legacy
	// rules are gone from app.css now — this component is the only title treatment left.
	let {
		title,
		description,
		badge,
		back
	}: {
		title: string
		/** One line under the title, shown in the `?` tooltip. Say what the page is for, not what it
		 *  is called. Pass a snippet instead of a string when the line needs a link or a branch. */
		description?: string | Snippet
		/** A status pill for the record the page is about. Sits beside the title, because it
		 *  qualifies the name — it is not a navigation control like Back. */
		badge?: Snippet
		/** A BackButton, rendered on the right edge of the title row — the side opposite the sidebar. */
		back?: Snippet
	} = $props()
</script>

<!-- Title-row rule: the title, its description and at most ONE control — the Back link counts
     as that control. A page with no Back link may put its single page-level action (or one
     filter-like control) on the title row, laid out by the page beside its PageHeader. Everything else
     goes on the panel's toolbar or on the heading row of the section it acts on (right-aligned,
     level with that heading), so each action sits beside the thing it changes.
     This component itself takes no actions prop.
     `ml-auto` keeps the Back cluster flush right on whatever line it lands on, and below `sm`
     it takes a full-width row of its own so a long title is never squeezed against it. -->
<div class="flex flex-wrap items-start justify-between gap-3">
	<div class="min-w-0 flex-1 space-y-1">
		<div class="relative flex flex-wrap items-center gap-2">
			<h1 class="text-2xl font-bold tracking-tight">{title}</h1>
			{#if badge}{@render badge()}{/if}
			{#if description}
				<HelpTip label={`About ${title}`}>
					{#if typeof description === 'function'}{@render description()}{:else}{description}{/if}
				</HelpTip>
			{/if}
		</div>
	</div>
	{#if back}
		<div
			class="ml-auto flex basis-full shrink-0 flex-wrap items-center justify-end gap-2 sm:basis-auto"
		>
			{@render back()}
		</div>
	{/if}
</div>
