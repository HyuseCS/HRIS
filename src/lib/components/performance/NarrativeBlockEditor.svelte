<script lang="ts">
	import { tick } from 'svelte'
	import { newId } from '$lib/performance/ids'
	import type { NarrativeBlock } from '$lib/server/performance/types'
	import RowControls from './RowControls.svelte'
	import { smallInputClass, type ErrorAt } from './rows'

	/** The free-text blocks the evaluator fills in. Array order is render order on the form. */
	let {
		blocks,
		error
	}: {
		blocks: NarrativeBlock[]
		error: ErrorAt
	} = $props()

	async function add() {
		const row: NarrativeBlock = { id: newId('nb'), label: '' }
		blocks.push(row)
		await tick()
		document.getElementById(`nb-${row.id}`)?.focus()
	}
</script>

<div class="space-y-2">
	<ul class="space-y-2">
		{#each blocks as block, i (block.id)}
			{@const rowError = error(`narrativeBlocks.${i}`)}
			<li class="flex items-start gap-2">
				<div class="flex-1">
					<input
						id="nb-{block.id}"
						bind:value={block.label}
						placeholder="e.g. Areas for Improvement"
						aria-label="Narrative block {i + 1}"
						class="{smallInputClass} {rowError ? 'border-destructive' : ''}"
					/>
					{#if rowError}
						<p class="template-row-error mt-1 text-xs text-destructive">{rowError}</p>
					{/if}
				</div>
				<RowControls
					rows={blocks}
					index={i}
					label={block.label.trim() || `narrative block ${i + 1}`}
					remove={() => blocks.splice(i, 1)}
				/>
			</li>
		{/each}
	</ul>
	<button
		type="button"
		onclick={add}
		class="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
	>
		Add narrative block
	</button>
</div>
