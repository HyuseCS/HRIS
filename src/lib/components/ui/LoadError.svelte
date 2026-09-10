<script lang="ts">
	import { invalidateAll } from '$app/navigation'
	import Banner from '$lib/components/ui/Banner.svelte'

	// The `{:catch}` arm for a streamed load. Without one, a rejected promise swaps the skeleton
	// for nothing at all and the page reads as "you have no records" — the worst possible lie for
	// a list of timesheets or payroll runs.
	let { what }: { what: string } = $props()

	let retrying = $state(false)

	async function retry() {
		retrying = true
		try {
			await invalidateAll()
		} finally {
			retrying = false
		}
	}
</script>

<Banner kind="error">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<span>Could not load {what}.</span>
		<button
			type="button"
			onclick={retry}
			disabled={retrying}
			class="rounded-md border border-red-500/30 px-2 py-1 text-xs font-medium disabled:opacity-50"
			>{retrying ? 'Retrying…' : 'Retry'}</button
		>
	</div>
</Banner>
