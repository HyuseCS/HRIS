<script lang="ts">
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import Field from '$lib/components/ui/Field.svelte'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
	import type { EmployeeDetailData, EmployeeDetailForm } from './shared'

	let { data, form }: { data: EmployeeDetailData; form: EmployeeDetailForm } = $props()

	const assignTemplate = submitFeedback({ error: null })
</script>

<div class="rounded-lg border bg-card p-6 space-y-4">
	<h2 class="font-semibold">Evaluation Template</h2>
	{#if form?.action === 'assignTemplate' && form?.success}
		<Banner kind="success" message="Saved." autoDismiss />
	{:else if form?.action === 'assignTemplate' && form?.error}
		<div
			class="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-red-400"
		>
			{form.error}
		</div>
	{/if}
	<form
		method="POST"
		action="?/assignTemplate"
		use:enhance={assignTemplate.enhance}
		class="space-y-2"
	>
		<Field size="compact" label="Assigned template" id="assignedTemplateId">
			{#snippet children(a)}
				<select
					{...a}
					id="assignedTemplateId"
					name="assignedTemplateId"
					class="w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
				>
					<option value="" selected={!data.assignedTemplateId}>— none —</option>
					{#each data.performanceTemplates as t (t.id)}
						<option value={t.id} selected={t.id === data.assignedTemplateId}>{t.name}</option>
					{/each}
				</select>
			{/snippet}
		</Field>
		<button
			type="submit"
			disabled={assignTemplate.busy}
			class="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
			>{assignTemplate.busy ? 'Saving…' : 'Save template'}</button
		>
	</form>
</div>
