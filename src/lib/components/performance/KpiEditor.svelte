<script lang="ts">
	import { tick } from 'svelte'
	import { newId } from '$lib/performance/ids'
	import type { KpiRow, TemplateStructure } from '$lib/server/performance/types'
	import RowControls from './RowControls.svelte'
	import { smallInputClass, type ErrorAt } from './rows'

	/**
	 * The optional KPI table — present on the Admin Staff form, absent on Account Executive.
	 *
	 * Takes the whole structure rather than the array because `kpiRows` is OPTIONAL: the key is
	 * created when HR adds the first row and deleted again when the last one goes, so a template
	 * that has no KPI table keeps no empty `kpiRows: []` it never asked for.
	 *
	 * `target` is a free-text label ("100%", "Within 24 hours"). Nothing ever compares an actual
	 * to it.
	 */
	let {
		structure,
		error
	}: {
		structure: TemplateStructure
		error: ErrorAt
	} = $props()

	async function add() {
		const row: KpiRow = { id: newId('kpi'), indicator: '', target: '' }
		if (!structure.kpiRows) structure.kpiRows = []
		structure.kpiRows.push(row)
		await tick()
		document.getElementById(`kpi-${row.id}`)?.focus()
	}

	function remove(index: number) {
		structure.kpiRows?.splice(index, 1)
		if (structure.kpiRows?.length === 0) delete structure.kpiRows
	}
</script>

<div class="space-y-2">
	{#if !structure.kpiRows || structure.kpiRows.length === 0}
		<p class="text-xs text-muted-foreground">
			No KPI table. Add a row to print one above the categories.
		</p>
	{:else}
		<ul class="space-y-2">
			{#each structure.kpiRows as kpi, i (kpi.id)}
				{@const rowError = error(`kpiRows.${i}`)}
				<li class="flex items-start gap-2">
					<div class="flex-1">
						<input
							id="kpi-{kpi.id}"
							bind:value={kpi.indicator}
							placeholder="e.g. Employee document completion"
							aria-label="KPI indicator {i + 1}"
							class="{smallInputClass} {rowError ? 'border-destructive' : ''}"
						/>
						{#if rowError}
							<p class="template-row-error mt-1 text-xs text-destructive">{rowError}</p>
						{/if}
					</div>
					<div class="w-40 shrink-0">
						<input
							bind:value={kpi.target}
							placeholder="e.g. 100%"
							aria-label="Target for {kpi.indicator.trim() || `KPI ${i + 1}`}"
							class={smallInputClass}
						/>
					</div>
					<RowControls
						rows={structure.kpiRows}
						index={i}
						label={kpi.indicator.trim() || `KPI row ${i + 1}`}
						remove={() => remove(i)}
					/>
				</li>
			{/each}
		</ul>
	{/if}
	<button
		type="button"
		onclick={add}
		class="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
	>
		Add KPI row
	</button>
</div>
