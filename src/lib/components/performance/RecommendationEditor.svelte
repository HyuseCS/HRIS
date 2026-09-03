<script lang="ts">
	import { tick } from 'svelte'
	import { newId } from '$lib/performance/ids'
	import type { RecommendationOption } from '$lib/server/performance/types'
	import RowControls from './RowControls.svelte'
	import { smallInputClass, type ErrorAt } from './rows'

	/**
	 * The recommendation checklist. It is a checklist, not a radio group — the paper form lets an
	 * evaluator tick several. `allowsFreeText` renders the "Other: ____" companion input.
	 */
	let {
		options,
		error
	}: {
		options: RecommendationOption[]
		error: ErrorAt
	} = $props()

	async function add() {
		const row: RecommendationOption = { id: newId('rec'), label: '', allowsFreeText: false }
		options.push(row)
		await tick()
		document.getElementById(`rec-${row.id}`)?.focus()
	}
</script>

<div class="space-y-2">
	<ul class="space-y-2">
		{#each options as option, i (option.id)}
			{@const rowError = error(`recommendationOptions.${i}`)}
			<li class="flex items-start gap-2">
				<div class="flex-1">
					<input
						id="rec-{option.id}"
						bind:value={option.label}
						placeholder="e.g. Regularization"
						aria-label="Recommendation {i + 1}"
						class="{smallInputClass} {rowError ? 'border-destructive' : ''}"
					/>
					{#if rowError}
						<p class="template-row-error mt-1 text-xs text-destructive">{rowError}</p>
					{/if}
				</div>
				<label class="flex shrink-0 items-center gap-1.5 pt-1.5 text-xs text-muted-foreground">
					<input
						type="checkbox"
						bind:checked={option.allowsFreeText}
						aria-label="{option.label.trim() || `Recommendation ${i + 1}`} takes a written note"
						class="h-3.5 w-3.5 rounded border-input"
					/>
					Takes a note
				</label>
				<RowControls
					rows={options}
					index={i}
					label={option.label.trim() || `recommendation ${i + 1}`}
					remove={() => options.splice(i, 1)}
				/>
			</li>
		{/each}
	</ul>
	<button
		type="button"
		onclick={add}
		class="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
	>
		Add recommendation
	</button>
</div>
