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

	const initials = (first: string, last: string) =>
		`${first.charAt(0)}${last.charAt(0)}`.toUpperCase()

	function waitingFor(submittedAt: Date | string): string {
		const days = Math.floor((Date.now() - new Date(submittedAt).getTime()) / 86_400_000)
		if (days < 1) return 'today'
		if (days === 1) return '1 day'
		return `${days} days`
	}
	const isStale = (submittedAt: Date | string) =>
		Date.now() - new Date(submittedAt).getTime() >= 3 * 86_400_000

	const roleLabels: Record<string, string> = {
		HR_ADMIN: 'HR',
		SUPER_ADMIN: 'Admin',
		MANAGER: 'Manager',
		VERIFIER: 'Verifier',
		APPROVER: 'Approver',
		CEO: 'CEO',
		PAYROLL_OFFICER: 'Payroll'
	}
	const roleLabel = (r: string) =>
		roleLabels[r] ??
		r
			.toLowerCase()
			.replace(/_/g, ' ')
			.replace(/^\w/, (c) => c.toUpperCase())

	function stageLabel(kind: string | null, role: string | null) {
		if (!kind) return ''
		return kind === 'SUPERVISOR' ? 'Supervisor' : roleLabel(role ?? 'APPROVER')
	}

	const reviewGuards = new Map<string, ReturnType<typeof submitFeedback>>()
	function reviewGuard(id: string) {
		let g = reviewGuards.get(id)
		if (!g) {
			g = submitFeedback()
			reviewGuards.set(id, g)
		}
		return g
	}

	// The bulk rejection reason is collected in a popup (#70 follow-up) — no
	// inline textarea in the bar. Confirming fills the hidden input and submits.
	let rejectDialogOpen = $state(false)
	let rejectTarget = $state<{ kind: 'bulk' } | { kind: 'single'; id: string } | null>(null)
	let rejectForm = $state<HTMLFormElement>()
	let singleForm = $state<HTMLFormElement>()
	let singleId = $state('')
	let singleReason = $state('')
	const singleReject = submitFeedback()

	function askReason(target: NonNullable<typeof rejectTarget>) {
		rejectTarget = target
		rejectDialogOpen = true
	}
	function forceInput(form: HTMLFormElement | undefined, name: string, value: string) {
		const el = form?.elements.namedItem(name)
		if (el instanceof HTMLInputElement) el.value = value
	}
	async function submitBulkReject(reason: string) {
		if (rejectTarget?.kind === 'single') {
			singleId = rejectTarget.id
			singleReason = reason
			await tick()
			forceInput(singleForm, 'id', rejectTarget.id)
			forceInput(singleForm, 'rejectionReason', reason)
			singleForm?.requestSubmit()
			return
		}
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
							onclick={() => askReason({ kind: 'bulk' })}
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
				<ul class="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
					{#each data.pendingTimesheets as ts (ts.id)}
						{@const picked = selected.includes(ts.id)}
						{@const g = reviewGuard(ts.id)}
						<li
							class="flex flex-col rounded-lg border bg-card transition-colors {picked
								? 'border-primary ring-1 ring-primary'
								: 'hover:border-muted-foreground/30'}"
						>
							<div
								role="button"
								tabindex="0"
								onclick={() => (openTs = ts)}
								onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (openTs = ts)}
								class="flex min-h-0 flex-1 cursor-pointer flex-col gap-3 p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<div class="flex items-start gap-3">
									<div
										class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground/70"
										aria-hidden="true"
									>
										{initials(ts.employee.firstName, ts.employee.lastName)}
									</div>
									<div class="min-w-0 flex-1">
										<h2 class="font-medium leading-tight break-words">
											{ts.employee.lastName}, {ts.employee.firstName}
										</h2>
										{#if ts.submittedAt}
											<p class="mt-0.5 text-xs text-muted-foreground">
												Waiting {waitingFor(ts.submittedAt)}
												{#if isStale(ts.submittedAt)}
													<span class="ml-1 font-medium text-amber-500">· overdue</span>
												{/if}
											</p>
										{/if}
									</div>
									<input
										type="checkbox"
										checked={picked}
										onchange={() => toggle(ts.id)}
										onclick={(e) => e.stopPropagation()}
										aria-label="Select timesheet"
										class="mt-1 align-middle"
									/>
								</div>

								<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
									<span>{formatShortDate(ts.periodStart)} – {formatShortDate(ts.periodEnd)}</span>
									<span class="rounded bg-muted px-1.5 py-0.5 text-xs font-medium"
										>{Number(ts.totalHours).toFixed(1)} hrs</span
									>
									<span class="rounded bg-muted px-1.5 py-0.5 text-xs font-medium"
										>{ts.entries.length} entries</span
									>
								</div>
							</div>

							<div class="mt-auto flex items-center justify-between gap-2 px-4 pb-3 pt-1">
								{#if ts.currentStageKind}
									<span class="rounded-full bg-foreground/15 px-2 py-0.5 text-xs text-foreground/70"
										>Stage: {stageLabel(ts.currentStageKind, ts.currentStageRole)}</span
									>
								{/if}
								<button type="button" class="btn-row ml-auto" onclick={() => (openTs = ts)}
									>View detail</button
								>
							</div>

							<form
								method="POST"
								action="?/review"
								use:enhance={g.enhance}
								class="flex shrink-0 gap-2 border-t bg-muted/20 p-3"
							>
								<input type="hidden" name="id" value={ts.id} />
								<button
									type="submit"
									name="approved"
									value="true"
									disabled={g.busy}
									class="flex-1 rounded-md bg-green-700 px-2 py-1 text-xs font-medium text-white hover:bg-green-800 disabled:pointer-events-none disabled:opacity-50"
									>{g.busy ? 'Approving…' : 'Approve'}</button
								>
								<button
									type="button"
									disabled={singleReject.busy && singleId === ts.id}
									onclick={() => askReason({ kind: 'single', id: ts.id })}
									class="flex-1 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50"
									>Reject</button
								>
							</form>
						</li>
					{/each}
				</ul>

				<Pagination meta={data.pagination} />
			{/if}
		</div>
	</div>
</div>

<TimesheetModal bind:ts={openTs} mode="review" isManager={true} />

<form
	bind:this={singleForm}
	method="POST"
	action="?/review"
	use:enhance={singleReject.enhance}
	class="hidden"
>
	<input type="hidden" name="id" value={singleId} />
	<input type="hidden" name="approved" value="false" />
	<input type="hidden" name="rejectionReason" value={singleReason} />
</form>

<ReasonDialog
	bind:open={rejectDialogOpen}
	title={rejectTarget?.kind === 'single'
		? 'Reject this timesheet'
		: `Reject ${selected.length} selected timesheet${selected.length === 1 ? '' : 's'}`}
	message={rejectTarget?.kind === 'single'
		? 'The reason is recorded on the timesheet and sent back to the filer.'
		: 'The reason below is applied to every selected timesheet.'}
	placeholder="Explain what needs to change…"
	confirmText="Reject"
	onconfirm={submitBulkReject}
/>
