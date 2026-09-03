<script lang="ts">
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import ConfirmButton from '$lib/components/ui/ConfirmButton.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import { CLEARANCE_AREA_OPTIONS } from '$lib/utils/clearance-area'
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
	<title>Offboarding Checklist — Veent HRIS</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6">
	<PageHeader
		title="Offboarding Checklist"
		description="The clearance steps every separation case starts with. Each names a task and the clearance area that signs it off, optionally pinned to a specific department. Opening a separation copies the active steps into the case, and the departing employee is emailed a transition notice listing them."
	>
		{#snippet back()}
			<BackButton fallback="/settings" label="Settings" preferFallback />
		{/snippet}
	</PageHeader>

	{#if form?.error}
		<Banner kind="error" message={form.error} />
	{/if}

	<!-- Add step -->
	<section class="space-y-3 rounded-lg border bg-card p-4">
		<h2 class="font-semibold">Add a clearance step</h2>
		<form
			method="POST"
			action="?/add"
			use:enhance={add.enhance}
			class="grid gap-3 sm:grid-cols-[1fr_10rem_12rem_auto] sm:items-end"
		>
			<div>
				<label for="add-label" class="text-xs font-medium text-muted-foreground">Task</label>
				<input
					id="add-label"
					name="label"
					required
					maxlength="120"
					placeholder="e.g. Return company equipment"
					class="mt-1 {inputClass}"
				/>
			</div>
			<div>
				<label for="add-area" class="text-xs font-medium text-muted-foreground">Area</label>
				<select id="add-area" name="area" required class="mt-1 {inputClass}">
					{#each CLEARANCE_AREA_OPTIONS as [value, label] (value)}
						<option {value}>{label}</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="add-departmentId" class="text-xs font-medium text-muted-foreground"
					>Department</label
				>
				<select id="add-departmentId" name="departmentId" class="mt-1 {inputClass}">
					<option value="">— none —</option>
					{#each data.departments as dept (dept.id)}
						<option value={dept.id}>{dept.name}</option>
					{/each}
				</select>
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
		<h2 class="font-semibold">Clearance steps</h2>
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

						<!-- Task + area + department (editable) -->
						<div class="grid min-w-[12rem] flex-1 gap-1 sm:grid-cols-[1fr_9rem_11rem]">
							<input
								form="edit-{item.id}"
								name="label"
								value={item.label}
								required
								maxlength="120"
								aria-label="Task"
								class={inputClass}
							/>
							<select
								form="edit-{item.id}"
								name="area"
								required
								aria-label="Clearance area"
								class={inputClass}
							>
								{#each CLEARANCE_AREA_OPTIONS as [value, label] (value)}
									<option {value} selected={item.area === value}>{label}</option>
								{/each}
							</select>
							<select
								form="edit-{item.id}"
								name="departmentId"
								aria-label="Department"
								class={inputClass}
							>
								<option value="" selected={!item.departmentId}>— none —</option>
								{#each data.departments as dept (dept.id)}
									<option value={dept.id} selected={item.departmentId === dept.id}
										>{dept.name}</option
									>
								{/each}
							</select>
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
							<ConfirmButton
								action="?/remove"
								title="Delete step?"
								message="This removes the step from the template. Existing separation cases keep their copy."
								triggerLabel="Delete"
								triggerClass="rounded-md border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400"
							>
								<input type="hidden" name="id" value={item.id} />
							</ConfirmButton>
						</div>
					</li>
				{/each}
			</ul>
			<p class="text-xs text-muted-foreground">
				Hidden steps stay off new separation cases. Editing the template does not change cases
				already opened.
			</p>
		{/if}
	</section>
</div>
