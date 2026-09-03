<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
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
	<!-- The description carries a link, which PageHeader's string `description` cannot, so it
	     stays its own paragraph directly under the title. -->
	<PageHeader title="Leave" />
	<p class="-mt-4 max-w-2xl text-sm text-muted-foreground">
		Your leave balances and history. File leave from
		<a href="/requests" class="text-primary hover:underline">Requests/Approvals</a>.
	</p>

	<!-- Balances. The org-wide link sits beside the balances it widens, not on the title row. -->
	{#if data.canViewOrgBalances}
		<div class="flex justify-end">
			<a
				href="/leave/balances"
				class="rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
			>
				View all balances
			</a>
		</div>
	{/if}
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

	<!-- `deleteMany` can fail per item; without this slot the page rendered nothing at all. -->
	{#if form?.error}
		<Banner kind="error" message={form.error} />
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
					<!-- R1: the real link lives in the leave-type cell; the whole-row click is a mouse
					     convenience only, and the row carries no key handler so Space on the selection
					     checkbox can no longer navigate away. -->
					<tr
						class={`cursor-pointer hover:bg-muted/30 ${selected.includes(req.id) ? 'bg-primary/5' : ''}`}
						onclick={(e) => {
							// Don't navigate when the click is on the row's selection checkbox or its link.
							if ((e.target as HTMLElement).closest('a, button, input, label, form')) return
							goto(`/requests/${req.id}`)
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
						<td class="px-4 py-3 font-medium">
							<a
								href="/requests/{req.id}"
								aria-label={`Open ${leaveName(req.payload)} request`}
								class="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>{leaveName(req.payload)}</a
							>
						</td>
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
						<td colspan={cols} class="p-0"><EmptyState title="No leave requests" /></td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<Pagination meta={data.pagination} />
</div>
