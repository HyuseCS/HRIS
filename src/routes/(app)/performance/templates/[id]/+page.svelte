<script lang="ts">
	import Banner from '$lib/components/ui/Banner.svelte'
	import { tick } from 'svelte'
	import { applyAction, enhance } from '$app/forms'
	import { beforeNavigate, goto } from '$app/navigation'
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import InterpretationBandEditor from '$lib/components/performance/InterpretationBandEditor.svelte'
	import KpiEditor from '$lib/components/performance/KpiEditor.svelte'
	import NarrativeBlockEditor from '$lib/components/performance/NarrativeBlockEditor.svelte'
	import RatingScaleEditor from '$lib/components/performance/RatingScaleEditor.svelte'
	import RecommendationEditor from '$lib/components/performance/RecommendationEditor.svelte'
	import ReviewFormRender from '$lib/components/performance/ReviewFormRender.svelte'
	import SectionList from '$lib/components/performance/SectionList.svelte'
	import SignatoryOrderEditor from '$lib/components/performance/SignatoryOrderEditor.svelte'
	import TemplateMetaFields from '$lib/components/performance/TemplateMetaFields.svelte'
	import { inputClass } from '$lib/components/performance/rows'
	import { newId } from '$lib/performance/ids'
	import { addToast } from '$lib/stores/toast.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { TemplateStructure } from '$lib/server/performance/types'
	import type { ActionData, PageData } from './$types'

	/**
	 * The template builder (#178, plan §8, design brief 26-08-26).
	 *
	 * ONE client-side draft, ONE explicit Save. Every editor below mutates its slice of `draft`
	 * directly (Svelte 5 deep reactivity), and Save serialises the whole object into a single
	 * hidden `structure` field. This deliberately diverges from `settings/onboarding`'s per-row
	 * `?/move` / `?/save` actions — it is a decision, not an inconsistency: composing a
	 * five-category form through per-row actions is ~40 round-trips, and the structure is stored
	 * as one JSON column anyway, so one field means one parse and one failure mode.
	 *
	 * THE RULE THIS PAGE CARRIES: **the app performs NO arithmetic on evaluation scores.** Weights,
	 * maxima and bands are text this form prints. The one exception is the weight hint below, and
	 * it is confined to this page — see its comment.
	 */

	let { data, form }: { data: PageData; form: ActionData } = $props()

	// The draft. `null` only when the stored JSON does not parse, in which case the page renders a
	// banner instead of a half-built form.
	// These three read `data` once ON PURPOSE — a draft that re-derived from `data` would throw
	// away HR's unsaved edits every time the page reloaded. Save updates the baseline explicitly.
	// svelte-ignore state_referenced_locally
	let draft = $state<TemplateStructure | null>(
		data.structure ? structuredClone(data.structure) : null
	)
	// svelte-ignore state_referenced_locally
	let meta = $state({ name: data.template.name, isActive: data.template.isActive })

	const serialise = (m: typeof meta, s: TemplateStructure | null) => JSON.stringify({ m, s })
	// The last state the server acknowledged. Save resets it; everything else compares against it.
	// svelte-ignore state_referenced_locally
	let savedJson = $state(serialise(meta, data.structure))
	const dirty = $derived(serialise(meta, draft) !== savedJson)

	// ── Validation errors, routed to the row that caused them ──────────────────
	// The action returns zod's dotted paths (`sections.0.criteria.2.id`). A single banner on a
	// 60-input page is not usable, so each editor asks for its own path.
	const issues = $derived(
		form && 'issues' in form && form.issues
			? (form.issues as { path: string; message: string }[])
			: []
	)
	const formError = $derived(form && 'error' in form ? String(form.error) : null)

	/** The issue belonging to `prefix` itself or to one of its own fields — not to a nested list. */
	function errorAt(prefix: string): string | undefined {
		for (const issue of issues) {
			if (issue.path === prefix) return issue.message
			if (issue.path.startsWith(`${prefix}.`)) {
				const rest = issue.path.slice(prefix.length + 1)
				if (!rest.includes('.')) return issue.message
			}
		}
		return undefined
	}

	// Take the page to the first offending row rather than leaving HR to hunt for it.
	$effect(() => {
		if (issues.length === 0) return
		void tick().then(() => {
			const first = document.querySelector('.template-row-error')
			if (!first) return
			first.scrollIntoView({ behavior: 'smooth', block: 'center' })
			const field = first.parentElement?.querySelector<HTMLElement>('input, select, textarea')
			field?.focus({ preventScroll: true })
		})
	})

	// ── Unsaved-draft guard ────────────────────────────────────────────────────
	// One Save means leaving the page loses work. Two exits to cover: the tab (native
	// `beforeunload`, the only thing a browser honours) and in-app navigation (ConfirmDialog).
	let leaving = $state(false)
	let pendingUrl = $state<string | null>(null)
	let confirmLeaveOpen = $state(false)

	function onBeforeUnload(event: BeforeUnloadEvent) {
		if (!dirty || leaving) return
		event.preventDefault()
	}

	beforeNavigate((nav) => {
		// `leave` is the tab-close path; `onBeforeUnload` above already owns it.
		if (nav.type === 'leave' || !dirty || leaving) return
		nav.cancel()
		pendingUrl = nav.to?.url.href ?? null
		confirmLeaveOpen = true
	})

	function discardAndLeave() {
		leaving = true
		if (pendingUrl) void goto(pendingUrl)
	}

	// ── Remove confirmation ────────────────────────────────────────────────────
	// One dialog for the whole builder. `message === null` means the row is empty and confirming
	// its deletion would be friction for nothing.
	let confirmRemoveOpen = $state(false)
	let confirmRemoveMessage = $state('')
	let pendingRemove: (() => void) | null = null

	function confirmRemove(message: string | null, remove: () => void) {
		if (message === null) {
			remove()
			return
		}
		confirmRemoveMessage = message
		pendingRemove = remove
		confirmRemoveOpen = true
	}

	// ── Save ───────────────────────────────────────────────────────────────────
	const save = createSubmitGuard(() => async ({ result, update }) => {
		await update({ reset: false })
		if (result.type === 'success') {
			// The draft IS what the server just stored, so it becomes the new clean baseline. The
			// reloaded `data` is not copied back over it — that would discard nothing here, but it
			// would re-mint the object identity every editor is bound to.
			savedJson = serialise(meta, draft)
			addToast('Template saved.', { kind: 'success' })
		}
	})

	/**
	 * Duplicate. Ids are per-template and never shared, so the copy gets a fresh set — the copy has
	 * no reviews snapshotted against it, so nothing can be orphaned by re-minting them.
	 */
	function withFreshIds(structure: TemplateStructure): TemplateStructure {
		return {
			...structure,
			sections: structure.sections.map((s) => ({
				...s,
				id: newId('sec'),
				criteria: s.criteria.map((c) => ({ ...c, id: newId('crit') }))
			})),
			interpretationBands: structure.interpretationBands.map((b) => ({ ...b, id: newId('band') })),
			narrativeBlocks: structure.narrativeBlocks.map((n) => ({ ...n, id: newId('nb') })),
			recommendationOptions: structure.recommendationOptions.map((r) => ({
				...r,
				id: newId('rec')
			})),
			...(structure.kpiRows
				? { kpiRows: structure.kpiRows.map((k) => ({ ...k, id: newId('kpi') })) }
				: {}),
			signatoryOrder: structure.signatoryOrder.map((s) => ({ ...s, id: newId('sig') }))
		}
	}

	const duplicate = createSubmitGuard(() => async ({ result }) => {
		// The redirect below leaves this page; the draft is clean (Duplicate is disabled while
		// dirty), so there is nothing for the unsaved guard to protect.
		leaving = true
		if (result.type === 'failure') {
			leaving = false
			addToast(String(result.data?.error ?? 'Could not duplicate this template.'), {
				kind: 'error'
			})
			return
		}
		await applyAction(result)
	})

	/**
	 * THE ONE DELIBERATE EXCEPTION TO "NO ARITHMETIC", AND IT IS NOT A SCORING ENGINE.
	 *
	 * It adds up the WEIGHT LABELS HR typed, in the BUILDER ONLY. It is never stored, never posted,
	 * never reaches a review, and blocks nothing — Save works with any total. It exists because
	 * this exact error is already in HR's real paper form: the Admin Staff sheet prints
	 * 30/20/20/10/15 on its category headers and 30/20/20/15/15 in its summary table. Catching
	 * that at authoring time is the single highest-value thing this screen can do that paper
	 * cannot.
	 *
	 * It touches no rating, no subtotal and no total, and it lives here rather than in
	 * `ReviewFormRender.svelte` precisely so it cannot leak onto the evaluator's form.
	 *
	 * Written as a plain loop, not `.reduce(`, to keep the structural no-scoring grep unambiguous.
	 */
	function weightHint(sections: TemplateStructure['sections']): string | null {
		if (sections.length === 0) return null
		let total = 0
		for (const section of sections) {
			const parsed = Number.parseFloat(section.weightLabel.replace('%', '').trim())
			// Any label that is not a plain percentage ("1/3", "", "n/a") means the hint cannot say
			// anything true, so it says nothing.
			if (!Number.isFinite(parsed)) return null
			total += parsed
		}
		if (total === 100) return null
		return `Weights add to ${Number(total.toFixed(2))}%.`
	}

	const weightNote = $derived(draft ? weightHint(draft.sections) : null)

	// Below xl the panes stack and this toggle picks one — a 40%-wide preview on a tablet is
	// legible in neither pane.
	let pane = $state<'editor' | 'preview'>('editor')

	const paneBtn = (selected: boolean) =>
		`rounded-md px-3 py-1.5 text-sm font-medium ${
			selected ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
		}`
</script>

<svelte:head>
	<title>{data.template.name} — Templates — Veent HRIS</title>
</svelte:head>

<svelte:window onbeforeunload={onBeforeUnload} />

<div class="space-y-6 pb-4">
	<PageHeader title={data.template.name} description="Compose the evaluation form HR will issue.">
		{#snippet back()}
			<BackButton fallback="/performance/templates" label="Templates" preferFallback />
		{/snippet}
	</PageHeader>

	{#if formError}
		<div class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
			{formError}
		</div>
	{/if}

	{#if data.structureError}
		<div class="space-y-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
			<h2 class="text-sm font-semibold text-destructive">This template cannot be opened</h2>
			<p class="text-sm text-muted-foreground">
				Its stored structure does not match the shape the form builder reads:
				<span class="font-medium">{data.structureError}</span>
			</p>
			<p class="text-sm text-muted-foreground">
				Nothing has been changed. Reviews already opened against this template still work — they
				carry their own snapshot.
			</p>
			<a
				href="/performance/templates"
				class="inline-block rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
				>Back to templates</a
			>
		</div>
	{:else if draft}
		{#if data.openReviewCount > 0}
			<Banner kind="warning">
				{data.openReviewCount}
				{data.openReviewCount === 1 ? 'review is' : 'reviews are'} already open against this template.
				Editing it here does not change them: each review carries its own snapshot of the form it was
				opened with.
			</Banner>
		{/if}

		<!-- Segmented Editor/Preview switch — below xl only. -->
		<div class="flex gap-1 rounded-lg border bg-card p-1 xl:hidden">
			<button type="button" class={paneBtn(pane === 'editor')} onclick={() => (pane = 'editor')}
				>Editor</button
			>
			<button type="button" class={paneBtn(pane === 'preview')} onclick={() => (pane = 'preview')}
				>Preview</button
			>
		</div>

		<div class="grid items-start gap-6 xl:grid-cols-[3fr_2fr]">
			<!-- Editor -->
			<div class="{pane === 'editor' ? '' : 'hidden'} space-y-4 xl:block">
				<section class="rounded-lg border bg-card p-4">
					<TemplateMetaFields {meta} error={errorAt} />
				</section>

				<!-- The loud zone. -->
				<section class="space-y-3">
					<div class="flex flex-wrap items-baseline justify-between gap-2">
						<h2 class="text-lg font-semibold">Categories</h2>
						{#if weightNote}
							<!-- Non-blocking. Save works regardless; this never leaves the browser. -->
							<p class="text-xs text-muted-foreground">{weightNote}</p>
						{/if}
					</div>
					<SectionList sections={draft.sections} error={errorAt} {confirmRemove} />
				</section>

				<!-- The four quiet zones. Pre-filled; opened only when HR needs to differ. -->
				<details class="group rounded-lg border bg-card">
					<summary
						class="cursor-pointer list-none px-4 py-3 text-sm font-semibold hover:bg-accent/50"
					>
						<span
							class="mr-1 inline-block transition-transform group-open:rotate-90 motion-reduce:transition-none"
							>▸</span
						>
						Scoring labels — rating scale
					</summary>
					<div class="border-t p-4">
						<RatingScaleEditor scale={draft.ratingScale} error={errorAt} />
					</div>
				</details>

				<details class="group rounded-lg border bg-card">
					<summary
						class="cursor-pointer list-none px-4 py-3 text-sm font-semibold hover:bg-accent/50"
					>
						<span
							class="mr-1 inline-block transition-transform group-open:rotate-90 motion-reduce:transition-none"
							>▸</span
						>
						Scoring labels — interpretation bands and total
					</summary>
					<div class="space-y-4 border-t p-4">
						<div class="max-w-xs">
							<label for="total-ceiling" class="text-xs font-medium text-muted-foreground">
								Total printed after the blank
							</label>
							<input
								id="total-ceiling"
								type="number"
								min="1"
								bind:value={draft.totalCeiling}
								class="mt-1 {inputClass}"
								aria-describedby="total-ceiling-hint"
							/>
							<p id="total-ceiling-hint" class="mt-1 text-xs text-muted-foreground">
								Prints as "Total Score: ___ / {draft.totalCeiling}". The evaluator writes the score.
							</p>
							{#if errorAt('totalCeiling')}
								<p class="template-row-error mt-1 text-xs text-destructive">
									{errorAt('totalCeiling')}
								</p>
							{/if}
						</div>
						<InterpretationBandEditor bands={draft.interpretationBands} error={errorAt} />
					</div>
				</details>

				<details class="group rounded-lg border bg-card">
					<summary
						class="cursor-pointer list-none px-4 py-3 text-sm font-semibold hover:bg-accent/50"
					>
						<span
							class="mr-1 inline-block transition-transform group-open:rotate-90 motion-reduce:transition-none"
							>▸</span
						>
						Narrative blocks
					</summary>
					<div class="border-t p-4">
						<NarrativeBlockEditor blocks={draft.narrativeBlocks} error={errorAt} />
					</div>
				</details>

				<details class="group rounded-lg border bg-card">
					<summary
						class="cursor-pointer list-none px-4 py-3 text-sm font-semibold hover:bg-accent/50"
					>
						<span
							class="mr-1 inline-block transition-transform group-open:rotate-90 motion-reduce:transition-none"
							>▸</span
						>
						Recommendation checklist
					</summary>
					<div class="border-t p-4">
						<RecommendationEditor options={draft.recommendationOptions} error={errorAt} />
					</div>
				</details>

				<details class="group rounded-lg border bg-card">
					<summary
						class="cursor-pointer list-none px-4 py-3 text-sm font-semibold hover:bg-accent/50"
					>
						<span
							class="mr-1 inline-block transition-transform group-open:rotate-90 motion-reduce:transition-none"
							>▸</span
						>
						Key performance indicators
					</summary>
					<div class="border-t p-4">
						<KpiEditor structure={draft} error={errorAt} />
					</div>
				</details>

				<details class="group rounded-lg border bg-card">
					<summary
						class="cursor-pointer list-none px-4 py-3 text-sm font-semibold hover:bg-accent/50"
					>
						<span
							class="mr-1 inline-block transition-transform group-open:rotate-90 motion-reduce:transition-none"
							>▸</span
						>
						Signing order
					</summary>
					<div class="border-t p-4">
						<SignatoryOrderEditor slots={draft.signatoryOrder} error={errorAt} />
					</div>
				</details>
			</div>

			<!-- Preview. The SAME component the evaluator's review form uses, read-only. -->
			<div class="{pane === 'preview' ? '' : 'hidden'} xl:sticky xl:top-4 xl:block">
				<div class="rounded-lg border bg-card p-4">
					<h2 class="text-sm font-semibold">Preview</h2>
					<p class="mt-1 text-xs text-muted-foreground">
						What the evaluator will see. Every blank is written in by hand — the app scores nothing.
					</p>
					<div class="mt-4 max-h-[70vh] overflow-y-auto pr-1">
						<ReviewFormRender structure={draft} mode="preview" />
					</div>
				</div>
			</div>
		</div>

		<!-- Action bar -->
		<div
			class="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6"
		>
			<span class="mr-auto text-xs text-muted-foreground">
				{dirty ? 'Unsaved changes' : 'All changes saved'}
			</span>

			<form
				method="POST"
				action="/performance/templates?/createTemplate"
				use:enhance={duplicate.enhance}
			>
				<input type="hidden" name="name" value="{meta.name} (copy)" />
				<input type="hidden" name="structure" value={JSON.stringify(withFreshIds(draft))} />
				<button
					type="submit"
					disabled={duplicate.busy || dirty}
					title={dirty ? 'Save your changes before duplicating.' : undefined}
					class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
					>{duplicate.busy ? '…' : 'Duplicate'}</button
				>
			</form>

			<a
				href="/performance/templates"
				class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">Cancel</a
			>

			<form method="POST" action="?/updateTemplate" use:enhance={save.enhance}>
				<input type="hidden" name="name" value={meta.name} />
				<input type="hidden" name="isActive" value={meta.isActive ? 'true' : 'false'} />
				<input type="hidden" name="structure" value={JSON.stringify(draft)} />
				<button
					type="submit"
					disabled={save.busy}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
					>{save.busy ? 'Saving…' : 'Save template'}</button
				>
			</form>
		</div>
	{/if}
</div>

<ConfirmDialog
	bind:open={confirmLeaveOpen}
	title="Leave without saving?"
	message="This template has unsaved changes. They are not stored anywhere until you press Save."
	confirmText="Discard changes"
	cancelText="Keep editing"
	onconfirm={discardAndLeave}
/>

<ConfirmDialog
	bind:open={confirmRemoveOpen}
	title="Remove this row?"
	message={confirmRemoveMessage}
	confirmText="Remove"
	onconfirm={() => pendingRemove?.()}
/>
