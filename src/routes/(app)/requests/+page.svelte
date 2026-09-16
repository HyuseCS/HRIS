<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import RequestCreateDialog, { TYPES } from '$lib/components/requests/RequestCreateDialog.svelte'
	import { goto } from '$app/navigation'
	import { page } from '$app/stores'
	import { formatDateRange, formatShortDate } from '$lib/utils/format'
	import Pagination from '$lib/components/Pagination.svelte'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
	import type { PageData, ActionData } from './$types'
	import Badge from '$lib/components/ui/Badge.svelte'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	const typeLabel = (t: string) => TYPES.find((x) => x.value === t)?.label ?? t

	// svelte-ignore state_referenced_locally
	let showForm = $state(
		Boolean((form as { values?: Record<string, string> } | null)?.values) ||
			$page.url.searchParams.get('new') === 'leave'
	)

	// Row actions live inside an `{#each}`, so each row needs its own guard — one shared guard
	// would grey out every row's button while a single row is in flight.
	function rowGuards() {
		const map = new Map<string, ReturnType<typeof submitFeedback>>()
		return (id: string) => {
			let g = map.get(id)
			if (!g) {
				g = submitFeedback()
				map.set(id, g)
			}
			return g
		}
	}
	const resubmitGuard = rowGuards()
	const cancelGuard = rowGuards()
</script>

<svelte:head>
	<title>My Requests — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader title="My Requests" description="File and track your requests." />

	<!-- The file action sits directly above the form it opens, not on the title row. -->
	{#if data.hasEmployee}
		<div class="flex justify-end">
			<button
				onclick={() => (showForm = true)}
				class="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
			>
				New Request
			</button>
		</div>
	{/if}

	{#if !data.hasEmployee}
		<Banner
			kind="warning"
			message="Your account has no employee profile, so you can't file requests."
		/>
	{/if}

	{#if data.hasEmployee}
		<RequestCreateDialog
			bind:open={showForm}
			leaveTypes={data.leaveTypes}
			balances={data.balances}
			{form}
		/>
	{/if}

	<div class="overflow-x-auto rounded-lg border bg-card">
		<table class="w-full text-sm">
			<thead class="border-b bg-muted/50">
				<tr>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Dates</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Stage</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
					<th class="px-4 py-3 text-right font-medium text-muted-foreground">Filed</th>
					<th class="px-4 py-3"></th>
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each data.requests as req (req.id)}
					<tr
						class="cursor-pointer hover:bg-muted/30"
						role="link"
						tabindex="0"
						onclick={(e) => {
							// Let the row's action buttons (Resubmit/Cancel) fire without also navigating.
							if ((e.target as HTMLElement).closest('button, a, form')) return
							goto(`/requests/${req.id}`)
						}}
						onkeydown={(e) => {
							if ((e.target as HTMLElement).closest('button, a, form')) return
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault()
								goto(`/requests/${req.id}`)
							}
						}}
					>
						<td class="px-4 py-3 font-medium">{typeLabel(req.type)}</td>
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
						<td class="px-4 py-3 text-right">
							<div class="flex items-center justify-end gap-2">
								{#if req.status === 'RETURNED'}
									{@const resubmit = resubmitGuard(req.id)}
									<form method="POST" action="?/resubmit" use:enhance={resubmit.enhance}>
										<input type="hidden" name="id" value={req.id} />
										<button
											type="submit"
											disabled={resubmit.busy}
											class="rounded-md border border-primary/40 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-50"
											>{resubmit.busy ? 'Resubmitting…' : 'Resubmit'}</button
										>
									</form>
								{/if}
								{#if req.status === 'PENDING' || req.status === 'RETURNED'}
									{@const cancel = cancelGuard(req.id)}
									<form method="POST" action="?/cancel" use:enhance={cancel.enhance}>
										<input type="hidden" name="id" value={req.id} />
										<button
											type="submit"
											disabled={cancel.busy}
											class="rounded-md border border-red-500/20 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-500/10 disabled:pointer-events-none disabled:opacity-50"
											>{cancel.busy ? 'Cancelling…' : 'Cancel'}</button
										>
									</form>
								{/if}
							</div>
						</td>
					</tr>
				{:else}
					<tr><td colspan="6" class="p-0"><EmptyState title="No requests yet" /></td></tr>
				{/each}
			</tbody>
		</table>
	</div>

	<Pagination meta={data.pagination} />
</div>
