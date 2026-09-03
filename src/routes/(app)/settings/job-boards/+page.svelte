<script lang="ts">
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	const add = createSubmitGuard()
	const saveGuards: Record<string, ReturnType<typeof createSubmitGuard>> = {}
	const saveGuard = (id: string) => (saveGuards[id] ??= createSubmitGuard())
	const toggleGuards: Record<string, ReturnType<typeof createSubmitGuard>> = {}
	const toggleGuard = (id: string) => (toggleGuards[id] ??= createSubmitGuard())

	const inputClass =
		'h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
</script>

<svelte:head>
	<title>Job Boards — Veent HRIS</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<PageHeader
		title="Job Boards"
		description="The sites HR can mark a posting as published to (JobStreet, Indeed, LinkedIn…). Track where a role went on each posting's page. Deactivate a board to hide it from new postings without losing where past roles were advertised."
	>
		{#snippet back()}
			<BackButton fallback="/settings" label="Settings" preferFallback />
		{/snippet}
	</PageHeader>

	{#if form?.error}
		<Banner kind="error" message={form.error} />
	{/if}

	<!-- Add -->
	<section class="space-y-3 rounded-lg border bg-card p-4">
		<h2 class="font-semibold">Add a board</h2>
		<form
			method="POST"
			action="?/add"
			use:enhance={add.enhance}
			class="flex flex-wrap items-end gap-3"
		>
			<div class="flex-1">
				<label for="add-name" class="text-xs font-medium text-muted-foreground">Name</label>
				<input
					id="add-name"
					name="name"
					required
					maxlength="60"
					placeholder="e.g. Kalibrr"
					class="mt-1 {inputClass}"
				/>
			</div>
			<button
				type="submit"
				disabled={add.busy}
				class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
				>{add.busy ? 'Adding…' : 'Add board'}</button
			>
		</form>
	</section>

	<!-- List -->
	<section class="space-y-3 rounded-lg border bg-card p-4">
		<h2 class="font-semibold">Boards</h2>
		{#if data.boards.length === 0}
			<p class="text-sm text-muted-foreground">No boards yet — add one above.</p>
		{:else}
			<ul class="divide-y">
				{#each data.boards as board (board.id)}
					{@const save = saveGuard(board.id)}
					{@const toggle = toggleGuard(board.id)}
					<li
						data-name={board.name}
						class="flex flex-wrap items-center gap-2 py-2 {board.isActive ? '' : 'opacity-50'}"
					>
						<form
							method="POST"
							action="?/update"
							id="edit-{board.id}"
							use:enhance={save.enhance}
							class="flex-1"
						>
							<input type="hidden" name="id" value={board.id} />
							<input name="name" value={board.name} required maxlength="60" class={inputClass} />
						</form>
						<button
							type="submit"
							form="edit-{board.id}"
							disabled={save.busy}
							class="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
							>{save.busy ? 'Saving…' : 'Save'}</button
						>
						<form method="POST" action="?/toggle" use:enhance={toggle.enhance}>
							<input type="hidden" name="id" value={board.id} />
							<button
								type="submit"
								disabled={toggle.busy}
								class="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
								>{toggle.busy ? '…' : board.isActive ? 'Deactivate' : 'Activate'}</button
							>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
