<script lang="ts">
	import Skeleton from './Skeleton.svelte'

	let {
		rows = 5,
		cols = 5,
		flush = false
	}: { rows?: number; cols?: number; flush?: boolean } = $props()

	const rowList = $derived(Array.from({ length: rows }))
	const colList = $derived(Array.from({ length: cols }))
</script>

<div class={flush ? '' : 'rounded-lg border bg-card'} aria-hidden="true">
	<div class="flex gap-4 border-b border-border/60 bg-muted/40 px-4 py-3">
		{#each colList as _, i (i)}
			<Skeleton class="h-4 flex-1" />
		{/each}
	</div>
	<div class="divide-y">
		{#each rowList as _, r (r)}
			<div class="flex gap-4 px-4 py-3">
				{#each colList as _, c (c)}
					<Skeleton class="h-4 flex-1" />
				{/each}
			</div>
		{/each}
	</div>
</div>
