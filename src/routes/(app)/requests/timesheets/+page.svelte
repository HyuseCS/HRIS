<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import type { SubmitFunction } from '@sveltejs/kit'
	import { tick } from 'svelte'
	import { formatShortDate } from '$lib/utils/format'
	import Pagination from '$lib/components/Pagination.svelte'
	import TimesheetModal from '$lib/components/timesheets/TimesheetModal.svelte'
	import ReasonDialog from '$lib/components/ui/ReasonDialog.svelte'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()

	// Read-only review modal (approve/reject only).
	type Timesheet = PageData['pendingTimesheets'][number]
	let openTs = $state<Timesheet | null>(null)

	// ─── Bulk selection ─────────────────────────────────────────────────────────
	let selected = $state<string[]>([])
	let bulkReason = $state('')
	let busy = $state(false)
	function toggle(id: string) {
		selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
	}
	function toggleAll() {
		selected = selected.length > 0 ? [] : allIds
	}
	const clearOnSuccess: SubmitFunction = () => {
		busy = true
		return async ({ result, update }) => {
			await update()
			busy = false
			if (result.type === 'success') {
				selected = []
				bulkReason = ''
			}
		}
	}

	const bulkFb = submitFeedback({ inner: clearOnSuccess })

	const allIds = $derived(data.pendingTimesheets.map((t) => t.id))
	const allSelected = $derived(allIds.length > 0 && allIds.every((id) => selected.includes(id)))
	const someSelected = $derived(selected.length > 0 && !allSelected)
	let selectAllCheckbox = $state<HTMLInputElement>()
	$effect(() => {
		if (selectAllCheckbox) {
			selectAllCheckbox.indeterminate = someSelected
			selectAllCheckbox.checked = allSelected
		}
	})

	// The bulk rejection reason is collected in a popup (#70 follow-up) — no
	// inline textarea in the bar. Confirming fills the hidden input and submits.
	let rejectDialogOpen = $state(false)
	let rejectForm = $state<HTMLFormElement>()
	async function submitBulkReject(reason: string) {
		bulkReason = reason
		await tick()
		// Belt and braces against a reactive-flush race at submit time.
		const el = rejectForm?.elements.namedItem('rejectionReason')
		if (el instanceof HTMLInputElement) el.value = reason
		rejectForm?.requestSubmit()
	}
</script>

<svelte:head>
	<title>Timesheet Approvals — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader title="Timesheet Approvals" description="Review and approve submitted timesheets.">
		{#snippet back()}
			{#if data.pagination.total > 0}
				<span class="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
					{data.pagination.total} awaiting you
				</span>
			{/if}
		{/snippet}
	</PageHeader>

	<div class="rounded-lg border bg-muted/50">
		{#if data.pendingTimesheets.length > 0}
			<div class="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2">
				<label
					class="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-foreground/70"
				>
					<input
						bind:this={selectAllCheckbox}
						type="checkbox"
						onchange={toggleAll}
						class="cursor-pointer align-middle"
					/>
					<span aria-live="polite"
						>{selected.length ? `${selected.length} selected` : 'Select all'}</span
					>
				</label>

				<div class="flex items-center gap-2">
					<form method="POST" action="?/approveMany" use:enhance={bulkFb.enhance}>
						<input type="hidden" name="ids" value={selected.join(',')} />
						<button
							disabled={busy || !selected.length}
							class="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
							>Approve selected</button
						>
					</form>
					<form
						bind:this={rejectForm}
						method="POST"
						action="?/rejectMany"
						use:enhance={bulkFb.enhance}
					>
						<input type="hidden" name="ids" value={selected.join(',')} />
						<input type="hidden" name="rejectionReason" value={bulkReason} />
						<button
							type="button"
							disabled={busy || !selected.length}
							onclick={() => (rejectDialogOpen = true)}
							class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
							>Reject selected</button
						>
					</form>
				</div>
			</div>
		{/if}

		<div class="p-4">
			{#if data.pendingTimesheets.length === 0}
				<EmptyState title="No pending timesheets to review" />
			{:else}
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each data.pendingTimesheets as ts (ts.id)}
						<div
							role="button"
							tabindex="0"
							onclick={() => (openTs = ts)}
							onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (openTs = ts)}
							class="cursor-pointer space-y-3 rounded-md border bg-card p-4 hover:border-primary/40 hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring {selected.includes(
								ts.id
							)
								? 'border-primary/50 ring-1 ring-primary/40'
								: ''}"
						>
							<div class="flex items-start justify-between gap-3">
								<div class="min-w-0">
									<p class="truncate text-sm font-semibold">
										{ts.employee.lastName}, {ts.employee.firstName}
									</p>
									<p class="mt-0.5 text-xs text-muted-foreground">
										{formatShortDate(ts.periodStart)} – {formatShortDate(ts.periodEnd)}
									</p>
								</div>
								<input
									type="checkbox"
									checked={selected.includes(ts.id)}
									onchange={() => toggle(ts.id)}
									onclick={(e) => e.stopPropagation()}
									aria-label="Select timesheet"
									class="align-middle"
								/>
							</div>
							<div class="rounded-md bg-muted/50 px-3 py-2 text-sm">
								{Number(ts.totalHours).toFixed(1)} hrs · {ts.entries.length} entries
							</div>
							<div class="flex justify-end">
								<span class="btn-row pointer-events-none">Review</span>
							</div>
						</div>
					{/each}
				</div>

				<Pagination meta={data.pagination} />
			{/if}
		</div>
	</div>
</div>

<TimesheetModal bind:ts={openTs} mode="review" isManager={true} />

<ReasonDialog
	bind:open={rejectDialogOpen}
	title={`Reject ${selected.length} selected timesheet${selected.length === 1 ? '' : 's'}`}
	message="The reason below is applied to every selected timesheet."
	placeholder="Explain what needs to change…"
	confirmText="Reject"
	onconfirm={submitBulkReject}
/>
