<script lang="ts">
	import type { Snippet } from 'svelte'
	import { cn } from '$lib/utils/cn'

	let {
		toolbar,
		children,
		footer,
		empty = false,
		emptyState,
		tone = 'muted',
		flush = false,
		fill = true,
		bodyClass,
		class: className
	}: {
		toolbar?: Snippet
		children: Snippet
		footer?: Snippet
		empty?: boolean
		emptyState?: Snippet
		tone?: 'muted' | 'card'
		flush?: boolean
		fill?: boolean
		bodyClass?: string
		class?: string
	} = $props()
</script>

<div
	class={cn(
		fill
			? 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border'
			: 'flex flex-col overflow-hidden rounded-lg border',
		tone === 'card' ? 'bg-card' : 'bg-muted/50',
		className
	)}
>
	{#if toolbar}
		<div class="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2">
			{@render toolbar()}
		</div>
	{/if}

	<div
		class="flex min-h-0 flex-1 flex-col overflow-y-auto {flush ? '' : 'p-4'} {empty && !emptyState
			? 'items-center justify-center'
			: ''} {bodyClass ?? ''}"
	>
		{@render children()}
		{#if empty && emptyState}
			<div class="flex flex-1 items-center justify-center">
				{@render emptyState()}
			</div>
		{/if}
	</div>

	{#if footer}
		<div class="border-t px-4 py-3 empty:hidden">
			{@render footer()}
		</div>
	{/if}
</div>
