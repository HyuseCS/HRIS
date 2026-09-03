<script lang="ts">
	import { tick } from 'svelte'
	import type { RatingScale } from '$lib/server/performance/types'
	import RowControls from './RowControls.svelte'
	import { inputClass, smallInputClass, type ErrorAt } from './rows'

	/**
	 * The rating scale. `min`/`max` are the only two numbers anything downstream reads — and they
	 * are read by a RANGE CHECK, never by a calculation. `rows` is printed above the categories.
	 */
	let {
		scale,
		error
	}: {
		scale: RatingScale
		error: ErrorAt
	} = $props()

	async function add() {
		const index = scale.rows.length
		scale.rows.push({ value: scale.min, description: '' })
		await tick()
		document.getElementById(`scale-row-${index}`)?.focus()
	}
</script>

<div class="space-y-3">
	<div class="grid gap-3 sm:grid-cols-2">
		<div>
			<label for="scale-min" class="text-xs font-medium text-muted-foreground">Lowest rating</label>
			<input
				id="scale-min"
				type="number"
				bind:value={scale.min}
				class="mt-1 {inputClass}"
				aria-describedby="scale-hint"
			/>
		</div>
		<div>
			<label for="scale-max" class="text-xs font-medium text-muted-foreground">
				Highest rating
			</label>
			<input
				id="scale-max"
				type="number"
				bind:value={scale.max}
				class="mt-1 {inputClass}"
				aria-describedby="scale-hint"
			/>
		</div>
	</div>
	<p id="scale-hint" class="text-xs text-muted-foreground">
		The only bounds the form checks a typed rating against. Nothing is scored from them.
	</p>
	{#if error('ratingScale')}
		<p class="template-row-error text-xs text-destructive">{error('ratingScale')}</p>
	{/if}

	<ul class="space-y-2">
		{#each scale.rows as row, i (i)}
			{@const rowError = error(`ratingScale.rows.${i}`)}
			<li class="flex items-start gap-2">
				<div class="w-16 shrink-0">
					<input
						id="scale-row-{i}"
						type="number"
						bind:value={row.value}
						aria-label="Rating value, row {i + 1}"
						class={smallInputClass}
					/>
				</div>
				<div class="flex-1">
					<input
						bind:value={row.description}
						placeholder="e.g. Outstanding - Consistently exceeds expectations"
						aria-label="Description for rating {row.value}"
						class={smallInputClass}
					/>
					{#if rowError}
						<p class="template-row-error mt-1 text-xs text-destructive">{rowError}</p>
					{/if}
				</div>
				<RowControls
					rows={scale.rows}
					index={i}
					label="rating {row.value}"
					canRemove={scale.rows.length > 1}
					remove={() => scale.rows.splice(i, 1)}
				/>
			</li>
		{/each}
	</ul>
	<button
		type="button"
		onclick={add}
		class="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
	>
		Add rating row
	</button>
</div>
