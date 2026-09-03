<script lang="ts">
	import { inputClass, type ErrorAt } from './rows'

	/** Name and active flag. Bound to page state; the page posts them as hidden fields on Save. */
	let {
		meta,
		error
	}: {
		meta: { name: string; isActive: boolean }
		error: ErrorAt
	} = $props()

	const nameError = $derived(error('name'))
</script>

<div class="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
	<div>
		<label for="template-name" class="text-xs font-medium text-muted-foreground">
			Template name
		</label>
		<input
			id="template-name"
			bind:value={meta.name}
			maxlength="200"
			required
			aria-invalid={nameError ? 'true' : undefined}
			class="mt-1 {inputClass} {nameError ? 'border-destructive' : ''}"
		/>
		{#if nameError}
			<p class="template-row-error mt-1 text-xs text-destructive">{nameError}</p>
		{/if}
	</div>
	<label class="flex items-center gap-2 pb-1.5 text-sm">
		<input type="checkbox" bind:checked={meta.isActive} class="h-4 w-4 rounded border-input" />
		Active
	</label>
</div>
