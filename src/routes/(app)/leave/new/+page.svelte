<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import { advanceTo } from '$lib/actions/dateRange'
	import { formatDateISO, tenureRequirement } from '$lib/utils/dates'
	import BalanceSummary from '$lib/components/leave/BalanceSummary.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	// #108: a double-click here would file the same leave request twice and deduct the balance twice.
	const create = createSubmitGuard()

	let selectedLeaveTypeId = $state('')

	let selectedBalance = $derived(data.balances.find((b) => b.leaveTypeId === selectedLeaveTypeId))

	// Date guards: start can't be before today; end can't be before start.
	const today = formatDateISO(new Date())
	let startDate = $state('')
</script>

<svelte:head>
	<title>New Leave Request — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader title="New Leave Request">
		{#snippet back()}
			<a href="/leave" class="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancel</a>
		{/snippet}
	</PageHeader>

	{#if data.balances.length > 0}
		<BalanceSummary balances={data.balances} />
	{/if}

	{#if form?.error}
		<Banner kind="error" message={form.error} />
	{/if}

	<form
		method="POST"
		action="?/create"
		use:enhance={create.enhance}
		class="space-y-4 rounded-lg border bg-card p-5"
	>
		<!-- One row on a wide screen: a full-width select reads as broken at 1200px. -->
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<div class="space-y-1 lg:col-span-2">
				<label for="leaveTypeId" class="text-sm font-medium">Leave Type</label>
				<select
					id="leaveTypeId"
					name="leaveTypeId"
					required
					bind:value={selectedLeaveTypeId}
					class="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<option value="">Select leave type…</option>
					{#each data.leaveTypes as lt (lt.id)}
						<option value={lt.id} disabled={!lt.eligible}>
							{lt.name}{lt.eligible
								? ''
								: ` — available after ${tenureRequirement(lt.minMonthsOfService)}`}
						</option>
					{/each}
				</select>
				{#if selectedBalance}
					<p class="text-xs text-muted-foreground mt-1">
						Available: <span class="font-medium">{Number(selectedBalance.remaining)} days</span>
						of {Number(selectedBalance.allocated)} allocated
					</p>
				{/if}
			</div>

			<div class="space-y-1">
				<label for="startDate" class="text-sm font-medium">Start Date</label>
				<input
					id="startDate"
					name="startDate"
					type="date"
					required
					min={today}
					bind:value={startDate}
					use:advanceTo={'endDate'}
					class="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</div>
			<div class="space-y-1">
				<label for="endDate" class="text-sm font-medium">End Date</label>
				<input
					id="endDate"
					name="endDate"
					type="date"
					required
					min={startDate || today}
					class="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</div>
		</div>

		<div class="space-y-1">
			<label for="reason" class="text-sm font-medium"
				>Reason <span class="text-muted-foreground">(optional)</span></label
			>
			<textarea
				id="reason"
				name="reason"
				rows="3"
				placeholder="Provide a reason for your leave request…"
				class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
			></textarea>
		</div>

		<div class="flex gap-3 pt-1">
			<button
				type="submit"
				disabled={create.busy}
				class="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
			>
				{create.busy ? 'Submitting…' : 'Submit Request'}
			</button>
			<a href="/leave" class="rounded-md border px-5 py-2 text-sm hover:bg-accent"> Cancel </a>
		</div>
	</form>
</div>
