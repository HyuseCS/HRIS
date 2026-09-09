<script lang="ts">
	import { page } from '$app/stores'
	import { afterNavigate } from '$app/navigation'
	import { resolveBackTarget, backLabel } from '$lib/utils/back'

	// `preferFallback` makes Back move UP to the section index instead of sideways to a
	// sibling page — set it on section subpages (Settings) where hopping between tabs would
	// otherwise chain Back through them and strand the index.
	let {
		fallback,
		label,
		preferFallback = false
	}: { fallback: string; label: string; preferFallback?: boolean } = $props()

	// Capture the page actually navigated from (ignoring same-pathname navigations,
	// e.g. our own query-param changes) so Back returns to the real origin. ?from and
	// the static fallback cover hard loads / direct entry.
	let cameFrom = $state<string | null>(null)
	afterNavigate((nav) => {
		const from = nav.from?.url
		if (from && from.pathname !== $page.url.pathname) cameFrom = from.pathname + from.search
	})

	const target = $derived(
		resolveBackTarget(cameFrom, $page.url.searchParams.get('from'), fallback, preferFallback)
	)
	const text = $derived(backLabel(target, fallback, label))
</script>

<a
	href={target}
	aria-label={text === 'Back' ? 'Back' : `Back to ${label}`}
	class="inline-flex items-center gap-1.5 rounded-md border border-muted-foreground/30 bg-secondary px-2.5 py-1.5 text-sm font-medium text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground"
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		fill="none"
		viewBox="0 0 24 24"
		stroke-width="1.5"
		stroke="currentColor"
		class="size-4"
		aria-hidden="true"
	>
		<path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
	</svg>
	{text}
</a>
