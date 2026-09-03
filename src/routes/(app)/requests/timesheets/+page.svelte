<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import type { SubmitFunction } from '@sveltejs/kit'
	import { tick } from 'svelte'
	import { slide } from 'svelte/transition'
	import { formatShortDate } from '$lib/utils/format'
	import TimesheetModal from '$lib/components/timesheets/TimesheetModal.svelte'
	import ReasonDialog from '$lib/components/ui/ReasonDialog.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

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
	function toggleAll(ids: string[], on: boolean) {
		selected = on ? ids : []
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

	const allIds = $derived(data.pendingTimesheets.map((t) => t.id))
	const allSelected = $derived(allIds.length > 0 && allIds.every((id) => selected.includes(id)))

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
	<PageHeader title="Timesheet Approvals" description="Review and approve submitted timesheets." />

	{#if form?.error}
		<Banner kind="error" message={form.error} />
	{/if}

	{#if form?.saved}
		<Banner kind="success" message={form.saved} />
	{/if}

	{#if data.pendingTimesheets.length === 0}
		<div class="rounded-md border bg-muted/50">
			<EmptyState title="No pending timesheets to review" />
		</div>
	{:else}
		<!-- Bulk bar: appears when cards are selected -->
		<label class="flex w-fit items-center gap-2 text-sm text-muted-foreground">
			<input
				type="checkbox"
				checked={allSelected}
				onchange={(e) => toggleAll(allIds, e.currentTarget.checked)}
				class="align-middle"
			/>
			Select all
		</label>

		{#if selected.length}
			<div
				class="flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3"
				transition:slide={{ duration: 120 }}
			>
				<span class="text-sm font-medium">{selected.length} selected</span>
				<div class="flex items-center gap-2">
					<button
						onclick={() => (selected = [])}
						class="text-sm text-muted-foreground hover:underline">Clear</button
					>
					<form method="POST" action="?/approveMany" use:enhance={clearOnSuccess}>
						<input type="hidden" name="ids" value={selected.join(',')} />
						<button
							disabled={busy}
							class="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
							>Approve selected</button
						>
					</form>
					<form
						bind:this={rejectForm}
						method="POST"
						action="?/rejectMany"
						use:enhance={clearOnSuccess}
					>
						<input type="hidden" name="ids" value={selected.join(',')} />
						<input type="hidden" name="rejectionReason" value={bulkReason} />
						<button
							type="button"
							disabled={busy}
							onclick={() => (rejectDialogOpen = true)}
							class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
							>Reject selected…</button
						>
					</form>
				</div>
			</div>
		{/if}

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
	{/if}
</div>

<TimesheetModal bind:ts={openTs} mode="review" isManager={true} {form} />

<ReasonDialog
	bind:open={rejectDialogOpen}
	title={`Reject ${selected.length} selected timesheet${selected.length === 1 ? '' : 's'}`}
	message="The reason below is applied to every selected timesheet."
	placeholder="Explain what needs to change…"
	confirmText="Reject"
	onconfirm={submitBulkReject}
/>
