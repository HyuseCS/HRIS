<script lang="ts">
	import type { TemplateSection } from '$lib/server/performance/types'
	import CriterionList from './CriterionList.svelte'
	import RowControls from './RowControls.svelte'
	import { smallInputClass, type ErrorAt, type ConfirmRemove } from './rows'

	/**
	 * One category card: its name, its printed weight label, its optional maximum, and its criteria.
	 *
	 * `weightLabel` is TEXT that gets printed on the form — "35%", "1/3", anything HR's paper form
	 * says. Nothing reads it as a number. `maximum` is `null` when the category prints no subtotal
	 * line at all (the AE form's Section 3), and otherwise is the ceiling a typed subtotal is range-
	 * checked against — never a value anything sums to.
	 */
	let {
		sections,
		index,
		error,
		confirmRemove
	}: {
		sections: TemplateSection[]
		index: number
		error: ErrorAt
		confirmRemove: ConfirmRemove
	} = $props()

	const section = $derived(sections[index])
	const rowLabel = $derived(section.name.trim() || `category ${index + 1}`)
	const sectionError = $derived(error(`sections.${index}`))

	// A category either prints a subtotal line or it does not. The checkbox is the honest control
	// for that; unticking it sets `maximum` to null rather than to 0, which would print "/ 0".
	let lastMaximum = $state(30)
	function toggleMaximum(on: boolean) {
		if (on) section.maximum = lastMaximum
		else {
			if (section.maximum !== null) lastMaximum = section.maximum
			section.maximum = null
		}
	}

	function remove() {
		const hasContent =
			section.name.trim() !== '' || section.criteria.some((c) => c.text.trim() !== '')
		confirmRemove(
			hasContent
				? `Remove the category "${rowLabel}" and its ${section.criteria.length} criteria? Reviews already opened against this template are unaffected — they carry their own snapshot.`
				: null,
			() => sections.splice(index, 1)
		)
	}
</script>

<article class="space-y-3 rounded-lg border bg-card p-4">
	<div class="flex items-start gap-2">
		<span class="mt-2 w-5 shrink-0 text-sm font-semibold tabular-nums">{index + 1}.</span>
		<div class="min-w-0 flex-1 space-y-2">
			<input
				id="section-{section.id}"
				bind:value={section.name}
				placeholder="Category name, e.g. SALES PERFORMANCE"
				aria-label="Category {index + 1} name"
				aria-invalid={sectionError ? 'true' : undefined}
				class="{smallInputClass} font-medium {sectionError ? 'border-destructive' : ''}"
			/>
			<div class="grid gap-2 sm:grid-cols-2">
				<div>
					<label
						for="section-weight-{section.id}"
						class="text-xs font-medium text-muted-foreground"
					>
						Weight label
					</label>
					<input
						id="section-weight-{section.id}"
						bind:value={section.weightLabel}
						placeholder="e.g. 35%"
						class="mt-1 {smallInputClass}"
						aria-describedby="section-weight-hint-{section.id}"
					/>
					<p id="section-weight-hint-{section.id}" class="mt-1 text-xs text-muted-foreground">
						Printed on the form as-is.
					</p>
				</div>
				<div>
					<label class="flex items-center gap-2 text-xs font-medium text-muted-foreground">
						<input
							type="checkbox"
							checked={section.maximum !== null}
							onchange={(e) => toggleMaximum(e.currentTarget.checked)}
							class="h-3.5 w-3.5 rounded border-input"
						/>
						Prints a subtotal line
					</label>
					{#if section.maximum !== null}
						<input
							type="number"
							min="0"
							bind:value={section.maximum}
							aria-label="Subtotal maximum for {rowLabel}"
							class="mt-1 {smallInputClass}"
							aria-describedby="section-max-hint-{section.id}"
						/>
						<p id="section-max-hint-{section.id}" class="mt-1 text-xs text-muted-foreground">
							Printed after the blank the evaluator writes in.
						</p>
					{/if}
				</div>
			</div>
			{#if sectionError}
				<p class="template-row-error text-xs text-destructive">{sectionError}</p>
			{/if}
		</div>
		<RowControls rows={sections} {index} label={rowLabel} {remove} />
	</div>

	<!--
		Native <details> rather than a hand-rolled toggle: it is keyboard-operable and screen-reader
		announced for free, and it needs no extra state key (an extra key on the section object would
		fail the strict schema on save).
	-->
	<details open class="group ml-7">
		<summary
			class="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-foreground"
		>
			<span
				class="inline-block transition-transform group-open:rotate-90 motion-reduce:transition-none"
				>▸</span
			>
			{section.criteria.length}
			{section.criteria.length === 1 ? 'criterion' : 'criteria'}
		</summary>
		<div class="mt-2">
			<CriterionList criteria={section.criteria} sectionIndex={index} {error} {confirmRemove} />
		</div>
	</details>
</article>
