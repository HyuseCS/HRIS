<script lang="ts">
	import { tick } from 'svelte'
	import { newId } from '$lib/performance/ids'
	import type { TemplateSection } from '$lib/server/performance/types'
	import SectionEditor from './SectionEditor.svelte'
	import type { ErrorAt, ConfirmRemove } from './rows'

	/**
	 * The loud zone: the categories and their criteria. This is the only part of a template that
	 * differs meaningfully between forms, so it gets the top of the page and the space.
	 */
	let {
		sections,
		error,
		confirmRemove
	}: {
		sections: TemplateSection[]
		error: ErrorAt
		confirmRemove: ConfirmRemove
	} = $props()

	async function add() {
		// A new category arrives holding one criterion, for the same reason a new template does:
		// a blank container makes HR guess the shape.
		const section: TemplateSection = {
			id: newId('sec'),
			name: '',
			weightLabel: '',
			maximum: null,
			criteria: [{ id: newId('crit'), text: '' }]
		}
		sections.push(section)
		await tick()
		document.getElementById(`section-${section.id}`)?.focus()
	}
</script>

<div class="space-y-3">
	{#if sections.length === 0}
		<p class="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
			This template has no categories yet.
		</p>
	{/if}
	{#each sections as section, i (section.id)}
		<SectionEditor {sections} index={i} {error} {confirmRemove} />
	{/each}
	<button
		type="button"
		onclick={add}
		class="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
	>
		Add category
	</button>
</div>
