<script lang="ts">
	import type { Snippet } from 'svelte'
	import PageHeader from './PageHeader.svelte'

	let {
		title,
		description,
		badge,
		back,
		actions,
		notice,
		toolbar,
		children,
		footer,
		empty = false,
		emptyState,
		tone = 'muted',
		flush = false
	}: {
		title: string
		description?: string
		badge?: Snippet
		back?: Snippet
		actions?: Snippet
		notice?: Snippet
		toolbar?: Snippet
		children: Snippet
		footer?: Snippet
		empty?: boolean
		emptyState?: Snippet
		tone?: 'muted' | 'card'
		flush?: boolean
	} = $props()
</script>

<div class="flex min-h-[calc(100dvh-6rem)] flex-col gap-6 lg:h-[calc(100dvh-4rem)] lg:min-h-0">
	{#if actions}
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="min-w-0 flex-1">
				<PageHeader {title} {description} {badge} {back} />
			</div>
			<div class="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:pt-1">
				{@render actions()}
			</div>
		</div>
	{:else}
		<PageHeader {title} {description} {badge} {back} />
	{/if}

	{#if notice}
		<div class="flex shrink-0 flex-col gap-3">
			{@render notice()}
		</div>
	{/if}

	<div
		class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border {tone === 'card'
			? 'bg-card'
			: 'bg-muted/50'}"
	>
		{#if toolbar}
			<div class="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2">
				{@render toolbar()}
			</div>
		{/if}

		<div
			class="min-h-0 flex-1 overflow-y-auto {flush ? '' : 'p-4'} {empty
				? emptyState
					? 'flex flex-col'
					: 'flex items-center justify-center'
				: ''}"
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
</div>
