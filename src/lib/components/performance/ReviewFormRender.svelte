<script lang="ts">
	import type { TemplateSection, TemplateStructure } from '$lib/server/performance/types'
	import { answerDraft, type AnswerDraft } from './answer-draft'
	import type { ErrorAt } from './rows'

	/**
	 * The evaluation form, rendered from a `TemplateStructure`. ONE component, TWO modes (#178).
	 *
	 * - `preview` — the template builder's right-hand pane. Every control is inert and every
	 *   number the evaluator would write is an EMPTY BOX.
	 * - `fill` — the evaluator's real review form. Bound to `answers`; `disabled` renders the same
	 *   form read-only with the stored values still visible, which is how a submitted review reads
	 *   back to HR.
	 *
	 * It exists in one file on purpose. A preview that is a second, separate approximation of the
	 * review form drifts from it, and a drifting preview is worse than no preview: it teaches HR
	 * to trust a lie about what the form they are composing will look like.
	 *
	 * THE RULE THIS COMPONENT CARRIES: **the app performs NO arithmetic on evaluation scores.**
	 * Weights, section maxima, band ranges and the total ceiling are LABELS this form prints. There
	 * is no sum, no average, no percentage and no derived band anywhere below — not even a
	 * zero-valued placeholder, because a preview showing `0 / 100` teaches HR exactly the wrong
	 * model of who calculates. Subtotals and the total are boxes the evaluator writes in: empty in
	 * `preview`, typed into in `fill`. NEITHER MODE EVER COMPUTES. The builder's weight hint is
	 * deliberately NOT here; it belongs to the builder alone and must never reach a review.
	 */
	let {
		structure,
		mode = 'preview',
		answers,
		errorAt = () => undefined,
		disabled = false
	}: {
		structure: TemplateStructure
		mode?: 'preview' | 'fill'
		/** The evaluator's answers. Required in `fill`; ignored in `preview`. */
		answers?: AnswerDraft
		/** Looks up the server's validation issue for one dotted zod path, so it lands on its row. */
		errorAt?: ErrorAt
		/** `fill`, but read-only: a submitted review rendered back with its values. */
		disabled?: boolean
	} = $props()

	/**
	 * Bound to the caller's `$state` object when there is one — a plain `const`, not `$derived`, so
	 * the proxy identity every `bind:` writes through never changes underneath. The fallback exists
	 * only so `preview`, which has no answers and no enabled control, still type-checks.
	 */
	// svelte-ignore state_referenced_locally
	let fallback = $state(answerDraft(structure, null))
	// svelte-ignore state_referenced_locally
	const draft = answers ?? fallback

	/** Inert = no typing. `preview` is always inert; `fill` is inert when read back. */
	const inert = $derived(mode === 'preview' || disabled)

	/**
	 * The slot one criterion's answer is bound to. It is missing only in `preview`, where the
	 * builder adds a criterion to `structure` after this component was created — an inert slot is
	 * minted for it rather than dereferencing `undefined` and blanking the whole preview pane. In
	 * `fill` the slot always exists: the draft is built from this same snapshot.
	 */
	function answerFor(id: string) {
		return (draft.criteria[id] ??= { rating: '', remark: '' })
	}

	const inputClass =
		'h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60'

	const errorClass = (message: string | undefined) => (message ? ' border-destructive' : '')
</script>

<!-- The empty box `preview` shows where the evaluator will write a number. Never `0`. -->
{#snippet emptyBox(accessibleName: string)}
	<span
		class="inline-block h-7 w-20 rounded-md border border-dashed border-input bg-muted/30"
		aria-label="{accessibleName} — written in by the evaluator"
	></span>
{/snippet}

{#snippet fieldError(path: string)}
	{@const message = errorAt(path)}
	{#if message}
		<p id="err-{path}" class="mt-1 text-xs text-destructive">{message}</p>
	{/if}
{/snippet}

<!--
	One "____ / ceiling" line. `sectionId: null` means this is the overall total.
	The ceiling is PRINTED, and read by the server's range validator. It is never an operand here.
-->
{#snippet scoreLine(
	label: string,
	accessibleName: string,
	ceiling: number | null,
	sectionId: string | null
)}
	{@const path = sectionId ? `sectionSubtotals.${sectionId}` : 'totalScore'}
	{@const message = errorAt(path)}
	<div class="border-t pt-2">
		<div class="flex items-center justify-between gap-3">
			<span class="text-sm font-medium">{label}</span>
			<span class="flex items-center gap-1.5 text-sm text-muted-foreground">
				{#if mode === 'preview'}
					{@render emptyBox(accessibleName)}
				{:else if sectionId}
					<input
						type="text"
						inputmode="numeric"
						bind:value={draft.sectionSubtotals[sectionId]}
						disabled={inert}
						aria-label={accessibleName}
						aria-invalid={message ? 'true' : undefined}
						aria-describedby={message ? `err-${path}` : undefined}
						class="h-7 w-20 {inputClass}{errorClass(message)}"
					/>
				{:else}
					<input
						type="text"
						inputmode="numeric"
						bind:value={draft.totalScore}
						disabled={inert}
						aria-label={accessibleName}
						aria-invalid={message ? 'true' : undefined}
						aria-describedby={message ? `err-${path}` : undefined}
						class="h-7 w-20 {inputClass}{errorClass(message)}"
					/>
				{/if}
				{#if ceiling !== null}
					<span class="tabular-nums">/ {ceiling}</span>
				{/if}
			</span>
		</div>
		{@render fieldError(path)}
	</div>
{/snippet}

<!--
	The summary table's score cell. It is the SAME stored value as the category's own subtotal
	line — the paper form recaps it, so this form recaps it too. A recap is a copy, not a
	calculation: nothing here adds the criteria up, and a category that declares no maximum has no
	subtotal to recap, so it prints a dash in both modes rather than inventing a box.
-->
{#snippet scoreCell(section: TemplateSection)}
	{@const name = `Score for ${section.name || 'this category'} in the summary`}
	{@const message = errorAt(`sectionSubtotals.${section.id}`)}
	{#if section.maximum === null}
		<span class="text-muted-foreground">—</span>
	{:else if mode === 'preview'}
		{@render emptyBox(name)}
	{:else}
		<input
			type="text"
			inputmode="numeric"
			bind:value={draft.sectionSubtotals[section.id]}
			disabled={inert}
			aria-label={name}
			aria-invalid={message ? 'true' : undefined}
			class="h-7 w-20 {inputClass}{errorClass(message)}"
		/>
	{/if}
{/snippet}

<div class="space-y-6">
	<!-- Rating scale — printed above the sections, exactly as on the paper form. -->
	<section class="space-y-2">
		<h3 class="text-sm font-semibold">Rating Scale</h3>
		<ul class="divide-y rounded-md border text-sm">
			{#each structure.ratingScale.rows as row (row.value)}
				<li class="flex gap-3 px-3 py-1.5">
					<span class="w-6 shrink-0 font-medium tabular-nums">{row.value}</span>
					<span class="text-muted-foreground">{row.description}</span>
				</li>
			{/each}
		</ul>
	</section>

	<!--
		The categories and their criteria.

		NO `$derived` IN THIS LOOP MAY SUM ANYTHING. A `$derived(() => ratings.reduce(...))` added
		here to "helpfully" show a running subtotal IS the scoring engine arriving through the front
		door — the one thing #178 forbids permanently (SPEC acceptance criterion 4, plan §0). HR
		calculates outside the app; the evaluator types every rating, every subtotal and the total,
		and picks the band. `maximum` below is printed and range-checked on the server, never added.
	-->
	{#each structure.sections as section, si (section.id)}
		<section class="space-y-2 rounded-lg border p-3">
			<div class="flex flex-wrap items-baseline justify-between gap-2">
				<h3 class="text-sm font-semibold">
					{si + 1}. {section.name || 'Untitled category'}
				</h3>
				{#if section.weightLabel}
					<span class="text-xs text-muted-foreground">Weight {section.weightLabel}</span>
				{/if}
			</div>

			{#if section.criteria.length === 0}
				<p class="text-xs text-muted-foreground">No criteria yet.</p>
			{:else}
				<ul class="space-y-2">
					{#each section.criteria as criterion (criterion.id)}
						{@const label = criterion.text || 'this criterion'}
						{@const ratingPath = `criteria.${criterion.id}.rating`}
						{@const ratingError = errorAt(`criteria.${criterion.id}`)}
						{@const answer = answerFor(criterion.id)}
						<li class="grid gap-2 sm:grid-cols-[1fr_5rem_10rem] sm:items-start">
							<span class="text-sm sm:pt-1.5">{criterion.text || 'Untitled criterion'}</span>
							<div>
								<input
									type="text"
									inputmode="numeric"
									bind:value={answer.rating}
									disabled={inert}
									placeholder="{structure.ratingScale.min}–{structure.ratingScale.max}"
									aria-label="Rating for {label}"
									aria-invalid={ratingError ? 'true' : undefined}
									aria-describedby={ratingError ? `err-${ratingPath}` : undefined}
									class="{inputClass}{errorClass(ratingError)}"
								/>
								{#if ratingError}
									<p id="err-{ratingPath}" class="mt-1 text-xs text-destructive">{ratingError}</p>
								{/if}
							</div>
							<input
								type="text"
								bind:value={answer.remark}
								disabled={inert}
								placeholder="Remarks"
								aria-label="Remarks for {label}"
								class={inputClass}
							/>
						</li>
					{/each}
				</ul>
			{/if}

			<!--
				The subtotal line exists ONLY when the category declares a maximum. `null` means the
				paper form prints no subtotal for this category (the AE form's Section 3) — rendering
				one anyway would invent a field the evaluator has nowhere to copy from, and the server
				rejects a subtotal sent for such a category.
			-->
			{#if section.maximum !== null}
				{@render scoreLine(
					'Subtotal',
					`Subtotal for ${section.name || 'this category'}`,
					section.maximum,
					section.id
				)}
			{/if}
		</section>
	{/each}

	<!-- Overall summary — the paper form's recap table. Every cell here is a printed LABEL. -->
	<section class="space-y-2">
		<h3 class="text-sm font-semibold">Overall Summary</h3>
		<table class="w-full border-collapse text-sm">
			<thead>
				<tr class="border-b text-left text-xs uppercase text-muted-foreground">
					<th class="py-1.5 pr-3 font-medium">Category</th>
					<th class="py-1.5 pr-3 font-medium">Weight</th>
					<th class="py-1.5 font-medium">Score</th>
				</tr>
			</thead>
			<tbody>
				{#each structure.sections as section (section.id)}
					<tr class="border-b last:border-0">
						<td class="py-1.5 pr-3">{section.name || 'Untitled category'}</td>
						<td class="py-1.5 pr-3 text-muted-foreground">{section.weightLabel || '—'}</td>
						<td class="py-1.5">{@render scoreCell(section)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		{@render scoreLine('Total Score', 'Total score', structure.totalCeiling, null)}
	</section>

	<!-- The band is PICKED by the evaluator. It is never looked up from a total. -->
	<section class="space-y-2">
		<h3 class="text-sm font-semibold">Interpretation</h3>
		<select
			bind:value={draft.interpretationBandId}
			disabled={inert}
			aria-label="Interpretation band"
			aria-invalid={errorAt('interpretationBandId') ? 'true' : undefined}
			aria-describedby={errorAt('interpretationBandId') ? 'err-interpretationBandId' : undefined}
			class="h-9 {inputClass}{errorClass(errorAt('interpretationBandId'))}"
		>
			<option value="">— select —</option>
			{#each structure.interpretationBands as band (band.id)}
				<option value={band.id}>{band.rangeLabel} — {band.label}</option>
			{/each}
		</select>
		{@render fieldError('interpretationBandId')}
	</section>

	<!-- Narrative blocks, in array order. -->
	{#each structure.narrativeBlocks as block (block.id)}
		<section class="space-y-1.5">
			<h3 class="text-sm font-semibold">{block.label || 'Untitled block'}</h3>
			<textarea
				rows="3"
				bind:value={draft.narratives[block.id]}
				disabled={inert}
				aria-label={block.label || 'Narrative block'}
				class="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
			></textarea>
			{@render fieldError(`narratives.${block.id}`)}
		</section>
	{/each}

	<!-- A checklist, not a radio group: the paper form allows several at once. -->
	<section class="space-y-2">
		<h3 class="text-sm font-semibold">Recommendation</h3>
		<ul class="space-y-1.5">
			{#each structure.recommendationOptions as option (option.id)}
				<li class="flex flex-wrap items-center gap-2">
					<label class="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							value={option.id}
							bind:group={draft.recommendationIds}
							disabled={inert}
							class="h-4 w-4 rounded border-input disabled:cursor-not-allowed disabled:opacity-60"
						/>
						{option.label || 'Untitled option'}
					</label>
					{#if option.allowsFreeText}
						<input
							type="text"
							bind:value={draft.recommendationOther}
							disabled={inert}
							placeholder="Please specify"
							aria-label="{option.label || 'Other'} — details"
							class="h-8 w-56 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
						/>
					{/if}
				</li>
			{/each}
		</ul>
		{@render fieldError('recommendationIds')}
	</section>

	<!-- KPI table — present on Admin Staff, absent on Account Executive. `target` is a label. -->
	{#if structure.kpiRows && structure.kpiRows.length > 0}
		<section class="space-y-2">
			<h3 class="text-sm font-semibold">Key Performance Indicators</h3>
			<table class="w-full border-collapse text-sm">
				<thead>
					<tr class="border-b text-left text-xs uppercase text-muted-foreground">
						<th class="py-1.5 pr-3 font-medium">Indicator</th>
						<th class="py-1.5 pr-3 font-medium">Target</th>
						<th class="py-1.5 font-medium">Actual</th>
					</tr>
				</thead>
				<tbody>
					{#each structure.kpiRows as kpi (kpi.id)}
						<tr class="border-b last:border-0 align-top">
							<td class="py-1.5 pr-3">{kpi.indicator}</td>
							<td class="py-1.5 pr-3 text-muted-foreground">{kpi.target}</td>
							<td class="py-1.5">
								<!-- Free text, typed. NEVER compared to `target`. -->
								<input
									type="text"
									bind:value={draft.kpiActuals[kpi.id]}
									disabled={inert}
									aria-label="Actual for {kpi.indicator}"
									class={inputClass}
								/>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}
</div>
