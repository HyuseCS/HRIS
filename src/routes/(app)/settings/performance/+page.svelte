<script lang="ts">
	import { enhance } from '$app/forms'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { ActionData, PageData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	// #108: a double-click would fire two redundant writes of the config row.
	const save = createSubmitGuard()

	// #106: the failure banner is TOP-LEVEL and always mounted — never nested inside a
	// collapsible — so a rejected save is visible the moment the response lands. The action only
	// ever puts a STRING in `error`, so this can never render "[object Object]".
</script>

<svelte:head>
	<title>Review Schedule — Veent HRIS</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6">
	<PageHeader
		title="Review Schedule"
		description="How often performance reviews are opened for everyone, and how long evaluators have to finish them."
	>
		{#snippet back()}
			<BackButton fallback="/settings" label="Settings" preferFallback />
		{/snippet}
	</PageHeader>

	{#if form?.error}
		<div class="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
			{form.error}
		</div>
	{:else if form?.success}
		<div class="rounded bg-primary/10 px-3 py-2 text-sm text-primary" role="status">
			Review schedule saved.
		</div>
	{/if}

	<form method="POST" action="?/saveConfig" use:enhance={save.enhance} class="card space-y-5">
		<label class="flex items-start gap-3">
			<input
				type="checkbox"
				name="enabled"
				checked={data.config.enabled}
				class="mt-0.5 h-4 w-4 rounded border-input accent-primary"
			/>
			<span>
				<span class="block text-sm font-medium">Open review cycles automatically</span>
				<span class="block text-sm text-muted-foreground">
					When off, no new cycle is generated and nothing already open is changed.
				</span>
			</span>
		</label>

		<div class="grid gap-4 sm:grid-cols-2">
			<div class="grid gap-1.5">
				<label for="intervalMonths" class="text-sm font-medium">Run a review every</label>
				<div class="flex items-center gap-2">
					<input
						id="intervalMonths"
						name="intervalMonths"
						type="number"
						min="1"
						max="24"
						required
						value={data.config.intervalMonths}
						class="input w-24"
					/>
					<span class="text-sm text-muted-foreground">month(s)</span>
				</div>
				<p class="text-xs text-muted-foreground">Counted from the end of the last cycle.</p>
			</div>

			<div class="grid gap-1.5">
				<label for="dueDays" class="text-sm font-medium">Days to complete</label>
				<div class="flex items-center gap-2">
					<input
						id="dueDays"
						name="dueDays"
						type="number"
						min="1"
						max="180"
						required
						value={data.config.dueDays}
						class="input w-24"
					/>
					<span class="text-sm text-muted-foreground">day(s)</span>
				</div>
				<p class="text-xs text-muted-foreground">Counted from the day the cycle opens.</p>
			</div>
		</div>

		<p class="text-sm text-muted-foreground">
			Cycles are opened by a nightly job on the server, not by this app. A change here applies to
			the next cycle only — cycles already open keep the schedule they were created with.
		</p>

		<div class="flex justify-end">
			<button type="submit" class="btn-primary" disabled={save.busy}>
				{save.busy ? 'Saving…' : 'Save schedule'}
			</button>
		</div>
	</form>
</div>
