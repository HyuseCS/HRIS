<script lang="ts">
	import type { Snippet } from 'svelte'

	let { label, children }: { label: string; children: Snippet } = $props()

	const id = $props.id()
</script>

<span class="group inline-flex">
	<button
		type="button"
		aria-describedby={id}
		aria-label={label}
		class="flex h-6 w-6 items-center justify-center rounded-full border text-xs font-medium text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
	>
		?
	</button>
	<span
		{id}
		role="tooltip"
		class="pointer-events-none absolute left-0 top-full z-20 mt-2 w-72 max-w-[calc(100vw-4rem)] rounded-md border bg-card p-3 text-left text-xs font-normal text-muted-foreground opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
	>
		{@render children()}
	</span>
</span>
