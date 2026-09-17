<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import Dialog from '$lib/components/ui/Dialog.svelte'
	import DatePicker from '$lib/components/ui/DatePicker.svelte'
	import { enhance } from '$app/forms'
	import { formatShortDate } from '$lib/utils/format'
	import ConfirmButton from '$lib/components/ui/ConfirmButton.svelte'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import PanelPage from '$lib/components/ui/PanelPage.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	let showAddForm = $state(false)
	let editingId = $state<string | null>(null)
	let newDate = $state('')
	let editDate = $state('')

	// #108: a double-click would create a duplicate holiday / re-run the update.
	const createHoliday = createSubmitGuard(() => async ({ result, update }) => {
		if (result.type === 'success' || result.type === 'redirect') {
			showAddForm = false
		}
		await update()
	})
	// Only one row is in edit mode at a time (`editingId`), so a single guard is safe here.
	const updateHoliday = createSubmitGuard(() => async ({ result, update }) => {
		if (result.type === 'success' || result.type === 'redirect') {
			editingId = null
		}
		await update()
	})

	function typeBadgeClass(type: string) {
		if (type === 'REGULAR') return 'bg-red-500/15 text-red-400'
		if (type === 'SPECIAL_WORKING') return 'bg-green-500/15 text-green-400'
		return 'bg-blue-500/15 text-blue-400'
	}

	function typeLabel(type: string) {
		if (type === 'REGULAR') return 'Regular'
		if (type === 'SPECIAL_WORKING') return 'Special Working'
		return 'Special Non-Working'
	}
</script>

<svelte:head>
	<title>Public Holidays — Settings — Veent HRIS</title>
</svelte:head>

{#snippet notice()}
	<div
		class="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive"
	>
		{form?.error}
	</div>
{/snippet}

<PanelPage
	title="Public Holidays"
	description="Manage public holidays for payroll computation."
	tone="card"
	flush
	notice={form?.error ? notice : undefined}
	empty={data.holidays.length === 0}
>
	{#snippet back()}
		<BackButton fallback="/settings" label="Settings" preferFallback />
	{/snippet}

	<!-- Holiday List -->
	<div class="overflow-x-auto">
		<table class="w-full min-w-[40rem] table-fixed text-sm">
			<thead class="border-b bg-muted/50">
				<tr>
					<th class="w-40 px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Holiday Name</th>
					<th class="w-48 px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
					<th class="w-44 px-4 py-1 text-right">
						<button
							onclick={() => {
								showAddForm = true
								editingId = null
								newDate = ''
							}}
							class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
						>
							Add Holiday
						</button>
					</th>
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each data.holidays as holiday (holiday.id)}
					{#if editingId === holiday.id}
						<tr>
							<td colspan="4" class="px-4 py-3">
								<form
									method="POST"
									action="?/update"
									use:enhance={updateHoliday.enhance}
									class="flex flex-wrap gap-3 items-end"
								>
									<input type="hidden" name="id" value={holiday.id} />
									<div>
										<label
											for={'date-' + holiday.id}
											class="text-xs font-medium text-muted-foreground">Date</label
										>
										<DatePicker
											id={'date-' + holiday.id}
											name="date"
											required
											bind:value={editDate}
											class="mt-0.5 h-8 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										/>
									</div>
									<div class="flex-1 min-w-48">
										<label
											for={'name-' + holiday.id}
											class="text-xs font-medium text-muted-foreground">Name</label
										>
										<input
											id={'name-' + holiday.id}
											name="name"
											required
											value={holiday.name}
											class="mt-0.5 flex h-8 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										/>
									</div>
									<div>
										<label
											for={'type-' + holiday.id}
											class="text-xs font-medium text-muted-foreground">Type</label
										>
										<select
											id={'type-' + holiday.id}
											name="type"
											class="mt-0.5 flex h-8 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										>
											<option value="REGULAR" selected={holiday.type === 'REGULAR'}>Regular</option>
											<option
												value="SPECIAL_NON_WORKING"
												selected={holiday.type === 'SPECIAL_NON_WORKING'}
												>Special Non-Working</option
											>
											<option value="SPECIAL_WORKING" selected={holiday.type === 'SPECIAL_WORKING'}
												>Special Working</option
											>
										</select>
									</div>
									<div class="flex gap-2">
										<button
											type="submit"
											disabled={updateHoliday.busy}
											class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
										>
											{updateHoliday.busy ? 'Saving…' : 'Save'}
										</button>
										<button
											type="button"
											onclick={() => (editingId = null)}
											class="rounded-md border px-3 py-1.5 text-xs hover:bg-accent"
										>
											Cancel
										</button>
									</div>
								</form>
							</td>
						</tr>
					{:else}
						<tr class="hover:bg-muted/30">
							<td class="px-4 py-3 text-muted-foreground">{formatShortDate(holiday.date)}</td>
							<td class="break-words px-4 py-3 font-medium">{holiday.name}</td>
							<td class="px-4 py-3">
								<span
									class="rounded-full px-2 py-0.5 text-xs font-medium {typeBadgeClass(
										holiday.type
									)}"
								>
									{typeLabel(holiday.type)}
								</span>
							</td>
							<td class="px-4 py-3">
								<div class="flex items-center justify-end gap-2">
									<button
										onclick={() => {
											editingId = holiday.id
											editDate = new Date(holiday.date).toISOString().slice(0, 10)
										}}
										class="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent"
									>
										Edit
									</button>
									<ConfirmButton
										action="?/delete"
										title="Delete holiday?"
										message="“{holiday.name}” will be removed from the calendar."
										triggerClass="rounded-md border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/10"
									>
										<input type="hidden" name="id" value={holiday.id} />
									</ConfirmButton>
								</div>
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	</div>

	{#snippet emptyState()}
		<EmptyState title="No public holidays configured yet" />
	{/snippet}
</PanelPage>

<Dialog bind:open={showAddForm} title="Add New Holiday" size="lg">
	<form method="POST" action="?/create" use:enhance={createHoliday.enhance} class="space-y-4">
		<h2 class="font-semibold">Add New Holiday</h2>
		<div class="grid gap-4">
			<div>
				<label for="date" class="text-sm font-medium">
					Date <span class="text-destructive">*</span>
				</label>
				<DatePicker
					id="date"
					name="date"
					required
					bind:value={newDate}
					class="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</div>
			<div>
				<label for="name" class="text-sm font-medium">
					Holiday Name <span class="text-destructive">*</span>
				</label>
				<input
					id="name"
					name="name"
					required
					placeholder="e.g. New Year's Day"
					class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</div>
			<div>
				<label for="type" class="text-sm font-medium">
					Type <span class="text-destructive">*</span>
				</label>
				<select
					id="type"
					name="type"
					required
					class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<option value="REGULAR">Regular</option>
					<option value="SPECIAL_NON_WORKING">Special Non-Working</option>
					<option value="SPECIAL_WORKING">Special Working</option>
				</select>
			</div>
		</div>
		<div class="flex justify-end gap-2">
			<button
				type="button"
				onclick={() => (showAddForm = false)}
				class="rounded-md border px-4 py-2 text-sm hover:bg-accent"
			>
				Cancel
			</button>
			<button
				type="submit"
				disabled={createHoliday.busy}
				class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
			>
				{createHoliday.busy ? 'Saving…' : 'Save Holiday'}
			</button>
		</div>
	</form>
</Dialog>
