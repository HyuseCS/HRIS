<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import ConfirmButton from '$lib/components/ui/ConfirmButton.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	const add = createSubmitGuard()

	// Per-row guards so saving/toggling one item doesn't freeze the whole list.
	const saveGuards: Record<string, ReturnType<typeof createSubmitGuard>> = {}
	const saveGuard = (id: string) => (saveGuards[id] ??= createSubmitGuard())
	const toggleGuards: Record<string, ReturnType<typeof createSubmitGuard>> = {}
	const toggleGuard = (id: string) => (toggleGuards[id] ??= createSubmitGuard())

	const inputClass =
		'h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
</script>

<svelte:head>
	<title>Onboarding Checklist — Veent HRIS</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6">
	<!-- The description carries emphasis markup, which PageHeader's string `description` cannot,
	     so it stays its own paragraph directly under the title. -->
	<PageHeader title="Onboarding Checklist">
		{#snippet back()}
			<BackButton fallback="/settings" label="Settings" preferFallback />
		{/snippet}
	</PageHeader>
	<p class="-mt-4 max-w-2xl text-sm text-muted-foreground">
		The steps shown on each employee's 201 file. <span class="font-medium">Derived</span> steps tick
		themselves off from the employee record (position, salary, government IDs, contract…); you can
		reorder, rename, or hide them but not delete them.
		<span class="font-medium">Manual</span> steps (orientation attended, equipment issued, NDA signed…)
		are ticked off by HR per employee.
	</p>

	{#if form?.error}
		<Banner kind="error" message={form.error} />
	{/if}

	<!-- Add manual step -->
	<section class="space-y-3 rounded-lg border bg-card p-4">
		<h2 class="font-semibold">Add a manual step</h2>
		<form
			method="POST"
			action="?/add"
			use:enhance={add.enhance}
			class="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
		>
			<div>
				<label for="add-label" class="text-xs font-medium text-muted-foreground">Label</label>
				<input
					id="add-label"
					name="label"
					required
					maxlength="120"
					placeholder="e.g. Orientation attended"
					class="mt-1 {inputClass}"
				/>
			</div>
			<div>
				<label for="add-hint" class="text-xs font-medium text-muted-foreground"
					>Hint <span class="text-muted-foreground/70">(optional)</span></label
				>
				<input
					id="add-hint"
					name="hint"
					maxlength="240"
					placeholder="Shown under the step until it's ticked"
					class="mt-1 {inputClass}"
				/>
			</div>
			<button
				type="submit"
				disabled={add.busy}
				class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
				>{add.busy ? 'Adding…' : 'Add step'}</button
			>
		</form>
	</section>

	<!-- List -->
	<section class="space-y-3 rounded-lg border bg-card p-4">
		<h2 class="font-semibold">Checklist steps</h2>
		{#if data.items.length === 0}
			<p class="text-sm text-muted-foreground">No steps yet.</p>
		{:else}
			<ul class="divide-y">
				{#each data.items as item, i (item.id)}
					{@const save = saveGuard(item.id)}
					{@const toggle = toggleGuard(item.id)}
					<li
						data-label={item.label}
						class="flex flex-wrap items-start gap-3 py-3 {item.isActive ? '' : 'opacity-50'}"
					>
						<!-- Reorder -->
						<div class="flex flex-col">
							<form method="POST" action="?/move" use:enhance>
								<input type="hidden" name="id" value={item.id} />
								<input type="hidden" name="direction" value="up" />
								<button
									type="submit"
									disabled={i === 0}
									aria-label="Move up"
									class="rounded border px-1.5 text-xs hover:bg-accent disabled:pointer-events-none disabled:opacity-30"
									>↑</button
								>
							</form>
							<form method="POST" action="?/move" use:enhance>
								<input type="hidden" name="id" value={item.id} />
								<input type="hidden" name="direction" value="down" />
								<button
									type="submit"
									disabled={i === data.items.length - 1}
									aria-label="Move down"
									class="mt-1 rounded border px-1.5 text-xs hover:bg-accent disabled:pointer-events-none disabled:opacity-30"
									>↓</button
								>
							</form>
						</div>

						<!-- Label + hint (editable) -->
						<div class="min-w-[12rem] flex-1 space-y-1">
							<div class="flex items-center gap-2">
								<span
									class="rounded-full px-2 py-0.5 text-[10px] font-medium {item.kind === 'MANUAL'
										? 'bg-blue-500/15 text-blue-400'
										: 'bg-muted text-muted-foreground'}"
									>{item.kind === 'MANUAL' ? 'Manual' : 'Derived'}</span
								>
							</div>
							<input
								form="edit-{item.id}"
								name="label"
								value={item.label}
								required
								maxlength="120"
								class={inputClass}
							/>
							<input
								form="edit-{item.id}"
								name="hint"
								value={item.hint}
								maxlength="240"
								placeholder="Hint (optional)"
								class="{inputClass} text-xs"
							/>
						</div>

						<!-- Actions -->
						<div class="flex flex-wrap items-center gap-2">
							<form method="POST" action="?/update" id="edit-{item.id}" use:enhance={save.enhance}>
								<input type="hidden" name="id" value={item.id} />
								<button
									type="submit"
									disabled={save.busy}
									class="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
									>{save.busy ? 'Saving…' : 'Save'}</button
								>
							</form>
							<form method="POST" action="?/toggle" use:enhance={toggle.enhance}>
								<input type="hidden" name="id" value={item.id} />
								<button
									type="submit"
									disabled={toggle.busy}
									class="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
									>{toggle.busy ? '…' : item.isActive ? 'Hide' : 'Show'}</button
								>
							</form>
							{#if item.kind === 'MANUAL'}
								<ConfirmButton
									action="?/remove"
									title="Delete step?"
									message="This removes the step and its completion history for every employee."
									triggerLabel="Delete"
									triggerClass="rounded-md border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400"
								>
									<input type="hidden" name="id" value={item.id} />
								</ConfirmButton>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
			<p class="text-xs text-muted-foreground">
				Edit a step's label/hint and press <span class="font-medium">Save</span>. Hidden steps stay
				off every employee's checklist without losing manual completion history.
			</p>
		{/if}
	</section>
</div>
