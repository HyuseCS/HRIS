<script lang="ts">
	import { goto } from '$app/navigation'
	import Banner from '$lib/components/ui/Banner.svelte'
	import type { SubmitFunction } from '@sveltejs/kit'
	import { slide } from 'svelte/transition'
	import { formatDateRange, formatShortDate } from '$lib/utils/format'
	import ConfirmButton from '$lib/components/ui/ConfirmButton.svelte'
	import Badge from '$lib/components/ui/Badge.svelte'
	import Pagination from '$lib/components/Pagination.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	// Leave type name lives in the unified Request payload (leaveTypeId).
	const leaveName = (payload: unknown) => {
		const id = (payload as { leaveTypeId?: string })?.leaveTypeId
		return data.leaveTypes.find((lt) => lt.id === id)?.name ?? '—'
	}

	// ─── Bulk selection ───────────────────────────────────────────────────────────
	let selected = $state<string[]>([])
	let busy = $state(false)
	const ids = $derived(data.requests.map((r) => r.id))
	const allSelected = $derived(ids.length > 0 && ids.every((id) => selected.includes(id)))
	// Checkbox column + Leave Type/Dates/Stage/Status/Filed, plus Employee for managers.
	const cols = $derived(data.isManager ? 7 : 6)

	function toggle(id: string) {
		selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
	}
	function toggleAll(on: boolean) {
		selected = on ? ids : []
	}
	// Drop the selection after a successful bulk delete.
	const clearOnSuccess: SubmitFunction = () => {
		busy = true
		return async ({ result, update }) => {
			await update()
			busy = false
			if (result.type === 'success') selected = []
		}
	}
</script>

<svelte:head>
	<title>Leave — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Leave</h1>
			<p class="text-sm text-muted-foreground">
				Your leave balances and history. File leave from
				<a href="/requests" class="text-primary hover:underline">Requests/Approvals</a>.
			</p>
		</div>
		{#if data.canViewOrgBalances}
			<a
				href="/leave/balances"
				class="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
			>
				View all balances
			</a>
		{/if}
	</div>

	<!-- Balances -->
	{#if data.balances.length > 0}
		<div class="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
			{#each data.balances as b (b.id)}
				<div class="rounded-lg border bg-card p-4">
					<p class="text-xs font-medium text-muted-foreground">{b.leaveType.name}</p>
					<p class="mt-1 text-2xl font-bold">{Number(b.remaining).toFixed(1)}</p>
					<p class="text-xs text-muted-foreground">of {Number(b.allocated)} days</p>
				</div>
			{/each}
		</div>
	{/if}

	{#if form?.saved}
		<Banner kind="success" message={form.saved} />
	{/if}

	<!-- Bulk actions; appear once rows are selected -->
	{#if selected.length}
		<div
			class="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-2"
			transition:slide={{ duration: 120 }}
		>
			<span class="text-sm font-medium">{selected.length} selected</span>
			<div class="flex items-center gap-2">
				<button
					onclick={() => (selected = [])}
					class="mr-1 text-sm text-muted-foreground hover:underline">Clear</button
				>
				<ConfirmButton
					action="?/deleteMany"
					title="Delete selected leave requests?"
					message="Selected leave requests will be permanently deleted. Approved requests, and any you're not allowed to remove, are skipped."
					triggerLabel="Delete selected"
					triggerClass="rounded-md border border-red-500/20 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
					disabled={busy}
					submit={clearOnSuccess}
				>
					<input type="hidden" name="ids" value={selected.join(',')} />
				</ConfirmButton>
			</div>
		</div>
	{/if}

	<!-- Requests table -->
	<div class="overflow-x-auto rounded-lg border">
		<table class="w-full text-sm">
			<thead class="border-b bg-muted/50">
				<tr>
					<th class="w-[1%] px-4 py-3">
						<input
							type="checkbox"
							checked={allSelected}
							onchange={(e) => toggleAll(e.currentTarget.checked)}
							aria-label="Select all"
							class="align-middle"
						/>
					</th>
					{#if data.isManager}<th class="px-4 py-3 text-left font-medium text-muted-foreground"
							>Employee</th
						>{/if}
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Leave Type</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Dates</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Stage</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
					<th class="px-4 py-3 text-right font-medium text-muted-foreground">Filed</th>
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each data.requests as req (req.id)}
					<tr
						class={`cursor-pointer hover:bg-muted/30 focus:bg-muted/40 focus:outline-none ${selected.includes(req.id) ? 'bg-primary/5' : ''}`}
						role="link"
						tabindex="0"
						aria-label={`Open ${leaveName(req.payload)} request`}
						onclick={(e) => {
							// Don't navigate when the click is on the row's selection checkbox.
							if ((e.target as HTMLElement).closest('input, label')) return
							goto(`/requests/${req.id}`)
						}}
						onkeydown={(e) => {
							if ((e.target as HTMLElement).closest('input, label')) return
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault()
								goto(`/requests/${req.id}`)
							}
						}}
					>
						<td class="px-4 py-3" onclick={(e) => e.stopPropagation()}>
							<input
								type="checkbox"
								checked={selected.includes(req.id)}
								onchange={() => toggle(req.id)}
								aria-label="Select leave request"
								class="align-middle"
							/>
						</td>
						{#if data.isManager}
							<td class="px-4 py-3">{req.employee.lastName}, {req.employee.firstName}</td>
						{/if}
						<td class="px-4 py-3 font-medium">{leaveName(req.payload)}</td>
						<td class="px-4 py-3 text-muted-foreground">
							{#if req.dateFrom}
								{formatDateRange(req.dateFrom, req.dateTo)}
							{:else}
								—
							{/if}
						</td>
						<td class="px-4 py-3 text-muted-foreground">
							{req.status === 'PENDING' ? `${req.currentStage + 1} of ${req.steps.length}` : '—'}
						</td>
						<td class="px-4 py-3">
							<Badge status={req.status} domain="request" />
						</td>
						<td class="px-4 py-3 text-right text-muted-foreground"
							>{formatShortDate(req.createdAt)}</td
						>
					</tr>
				{:else}
					<tr>
						<td colspan={cols} class="px-4 py-8 text-center text-muted-foreground"
							>No leave requests</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<Pagination meta={data.pagination} />
</div>
