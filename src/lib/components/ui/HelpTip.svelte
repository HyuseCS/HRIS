<script lang="ts">
	import type { Snippet } from 'svelte'

	let { label, children }: { label: string; children: Snippet } = $props()

	const id = $props.id()

	let shown = $state(false)
	let closeTimer: ReturnType<typeof setTimeout>

	function open() {
		clearTimeout(closeTimer)
		shown = true
	}

	// The bubble sits 8px below the `?`, so a pointer travelling from one to the other is over
	// neither for a few frames. Closing on that frame makes a link in the bubble unclickable by
	// mouse. The delay holds the bubble hit-testable long enough for the pointer to arrive; the
	// re-entry clears the timer. Drop it and the link goes mouse-dead again.
	function closeSoon() {
		clearTimeout(closeTimer)
		closeTimer = setTimeout(() => (shown = false), 200)
	}
</script>

<span class="group inline-flex">
	<button
		type="button"
		aria-describedby={id}
		aria-label={label}
		onpointerenter={open}
		onpointerleave={closeSoon}
		class="flex h-6 w-6 items-center justify-center rounded-full border text-xs font-medium text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
	>
		?
	</button>
	<span
		{id}
		role="tooltip"
		onpointerenter={open}
		onpointerleave={closeSoon}
		class="absolute left-0 top-full z-20 mt-2 w-72 max-w-[calc(100vw-4rem)] rounded-md border bg-card p-3 text-left text-xs font-normal text-muted-foreground shadow-lg transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 {shown
			? 'pointer-events-auto opacity-100'
			: 'pointer-events-none opacity-0'}"
	>
		{@render children()}
	</span>
</span>
