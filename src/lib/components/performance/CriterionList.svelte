<script lang="ts">
	import { tick } from 'svelte'
	import { newId } from '$lib/performance/ids'
	import type { TemplateCriterion } from '$lib/server/performance/types'
	import RowControls from './RowControls.svelte'
	import { smallInputClass, type ErrorAt, type ConfirmRemove } from './rows'

	/**
	 * The criteria inside one category. Order is array order; the id on each row is minted ONCE,
	 * here, when HR adds it, and carried through every later edit and reorder — an already-open
	 * review keys its answers off that id.
	 */
	let {
		criteria,
		sectionIndex,
		error,
		confirmRemove
	}: {
		criteria: TemplateCriterion[]
		sectionIndex: number
		error: ErrorAt
		confirmRemove: ConfirmRemove
	} = $props()

	async function add() {
		const row: TemplateCriterion = { id: newId('crit'), text: '' }
		criteria.push(row)
		// Adding a row and leaving focus behind makes the keyboard path a Tab hunt.
		await tick()
		document.getElementById(`crit-${row.id}`)?.focus()
	}

	function remove(index: number, row: TemplateCriterion) {
		confirmRemove(
			row.text.trim() === ''
				? null
				: `Remove "${row.text}"? Reviews already opened against this template are unaffected — they carry their own snapshot.`,
			() => criteria.splice(index, 1)
		)
	}
</script>

<ul class="space-y-2">
	{#each criteria as criterion, i (criterion.id)}
		{@const rowError = error(`sections.${sectionIndex}.criteria.${i}`)}
		<li class="flex items-start gap-2">
			<span class="mt-2 w-5 shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
			<div class="flex-1">
				<input
					id="crit-{criterion.id}"
					bind:value={criterion.text}
					placeholder="e.g. Achieves monthly sales target"
					aria-label="Criterion {i + 1}"
					aria-invalid={rowError ? 'true' : undefined}
					class="{smallInputClass} {rowError ? 'border-destructive' : ''}"
				/>
				{#if rowError}
					<p class="template-row-error mt-1 text-xs text-destructive">{rowError}</p>
				{/if}
			</div>
			<RowControls
				rows={criteria}
				index={i}
				label={criterion.text.trim() || `criterion ${i + 1}`}
				remove={() => remove(i, criterion)}
			/>
		</li>
	{/each}
</ul>

<button
	type="button"
	onclick={add}
	class="mt-2 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
>
	Add criterion
</button>
