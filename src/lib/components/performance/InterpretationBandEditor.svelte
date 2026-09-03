<script lang="ts">
	import { tick } from 'svelte'
	import { newId } from '$lib/performance/ids'
	import type { InterpretationBand } from '$lib/server/performance/types'
	import RowControls from './RowControls.svelte'
	import { smallInputClass, type ErrorAt } from './rows'

	/**
	 * The interpretation bands. `rangeLabel` is FREE TEXT that gets printed — nothing parses it,
	 * because nothing derives a band from a total. The evaluator picks the band by hand.
	 */
	let {
		bands,
		error
	}: {
		bands: InterpretationBand[]
		error: ErrorAt
	} = $props()

	async function add() {
		const row: InterpretationBand = { id: newId('band'), rangeLabel: '', label: '' }
		bands.push(row)
		await tick()
		document.getElementById(`band-${row.id}`)?.focus()
	}
</script>

<div class="space-y-2">
	<ul class="space-y-2">
		{#each bands as band, i (band.id)}
			{@const rowError = error(`interpretationBands.${i}`)}
			<li class="flex items-start gap-2">
				<div class="w-28 shrink-0">
					<input
						id="band-{band.id}"
						bind:value={band.rangeLabel}
						placeholder="95-100"
						aria-label="Score range, band {i + 1}"
						class={smallInputClass}
					/>
				</div>
				<div class="flex-1">
					<input
						bind:value={band.label}
						placeholder="Outstanding"
						aria-label="Label for band {band.rangeLabel || i + 1}"
						class="{smallInputClass} {rowError ? 'border-destructive' : ''}"
					/>
					{#if rowError}
						<p class="template-row-error mt-1 text-xs text-destructive">{rowError}</p>
					{/if}
				</div>
				<RowControls
					rows={bands}
					index={i}
					label={band.label.trim() || `band ${i + 1}`}
					remove={() => bands.splice(i, 1)}
				/>
			</li>
		{/each}
	</ul>
	<button
		type="button"
		onclick={add}
		class="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
	>
		Add band
	</button>
</div>
