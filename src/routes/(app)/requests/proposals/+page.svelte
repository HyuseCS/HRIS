<script lang="ts">
	import { enhance } from '$app/forms'
	import { tick } from 'svelte'
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import Pagination from '$lib/components/Pagination.svelte'
	import ReasonDialog from '$lib/components/ui/ReasonDialog.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import { formatCurrency, formatShortDate, MASKED_SALARY } from '$lib/utils/format'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	const domainLabels: Record<string, string> = {
		COMPENSATION: 'Compensation',
		PROMOTION: 'Promotion'
	}

	// How long a proposal has been waiting — reused verbatim from /requests/approvals, where the
	// same "work oldest first, a week-old row is the one to surface" reasoning applies.
	function waitingFor(createdAt: Date | string): string {
		const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000)
		if (days < 1) return 'today'
		if (days === 1) return '1 day'
		return `${days} days`
	}
	const isStale = (createdAt: Date | string) =>
		Date.now() - new Date(createdAt).getTime() >= 3 * 86_400_000

	// Per-row guards: a shared one would disable every row's Confirm while any single row is in
	// flight (#108, the /requests/approvals pattern).
	const guards = new Map<string, ReturnType<typeof createSubmitGuard>>()
	function guardFor(id: string) {
		let g = guards.get(id)
		if (!g) {
			g = createSubmitGuard()
			guards.set(id, g)
		}
		return g
	}

	// Reject collects its required reason in a popup, then fills and submits one hidden form.
	const reject = createSubmitGuard()
	let noteDialogOpen = $state(false)
	let noteTargetId = $state<string | null>(null)
	let rejectForm = $state<HTMLFormElement>()
	let rejectId = $state('')
	let rejectNote = $state('')

	// Write straight onto the inputs too — belt and braces against a reactive-flush race leaving a
	// hidden field empty at submit time.
	function forceInput(f: HTMLFormElement | undefined, name: string, value: string) {
		const el = f?.elements.namedItem(name)
		if (el instanceof HTMLInputElement) el.value = value
	}
	async function submitRejection(reason: string) {
		if (!noteTargetId) return
		rejectId = noteTargetId
		rejectNote = reason
		await tick()
		forceInput(rejectForm, 'proposalId', rejectId)
		forceInput(rejectForm, 'note', reason)
		rejectForm?.requestSubmit()
	}
</script>

<svelte:head>
	<title>Pay Changes — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader
		title="Pay Changes"
		description="Pay and promotion changes someone else filed that need your confirmation. You cannot decide one you filed, or one about your own pay."
	/>

	{#if form?.error}
		<div
			class="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
			role="alert"
		>
			{form.error}
		</div>
	{/if}

	{#if form?.success}
		<div
			class="rounded-md border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-600"
		>
			{form.success}
		</div>
	{/if}

	{#if data.proposals.length === 0}
		<div class="rounded-lg border bg-card">
			<EmptyState
				title="No pay changes are waiting for you."
				description="Compensation and promotion changes filed by someone who cannot make them alone appear here for a second qualified person to confirm."
			/>
		</div>
	{:else}
		<div class="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
			{#each data.proposals as p (p.id)}
				{@const confirm = guardFor(p.id)}
				{@const revealed = form?.revealedId === p.id ? form.amounts : null}
				<div class="flex flex-col rounded-lg border bg-card">
					<div class="flex min-h-0 flex-1 flex-col gap-3 p-4">
						<div>
							<p class="font-medium leading-tight break-words">
								{p.target.lastName}, {p.target.firstName}
							</p>
							<p class="mt-0.5 text-xs text-muted-foreground">
								{p.target.employeeNumber} · waiting {waitingFor(p.createdAt)}
								{#if isStale(p.createdAt)}
									<span class="ml-1 font-medium text-amber-500">· overdue</span>
								{/if}
							</p>
						</div>

						<div class="flex flex-wrap items-center gap-2">
							<span class="rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-500">
								{domainLabels[p.domain] ?? p.domain}
							</span>
							<!-- Text, not colour alone: which capability this row demands turns on it. -->
							<span
								class="rounded-full px-2 py-0.5 text-xs font-medium {p.isSelfAction
									? 'bg-rose-500/15 text-rose-500'
									: 'bg-slate-500/15 text-slate-400'}"
							>
								{p.isSelfAction ? 'Self-filed' : 'Filed for someone else'}
							</span>
						</div>

						{#if p.unreadable}
							<p class="rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-500">
								⚠ Unreadable proposal payload — reject it and ask for a fresh filing.
							</p>
						{/if}

						<dl class="space-y-1 text-sm">
							{#each p.changes as change (change.label)}
								<div class="flex flex-wrap gap-x-2">
									<dt class="text-muted-foreground">{change.label}</dt>
									<dd><span class="text-muted-foreground">{change.from}</span> → {change.to}</dd>
								</div>
							{/each}

							{#if p.hasAmount}
								<div class="flex flex-wrap items-center gap-x-2">
									<dt class="text-muted-foreground">Salary</dt>
									<dd class="font-medium">
										{#if revealed}
											<span class="text-muted-foreground"
												>{revealed.current == null ? '—' : formatCurrency(revealed.current)}</span
											>
											→ {revealed.proposed == null ? '—' : formatCurrency(revealed.proposed)}
										{:else}
											{MASKED_SALARY} → {MASKED_SALARY}
										{/if}
									</dd>
								</div>
							{/if}

							{#if p.effectiveDate}
								<div class="flex flex-wrap gap-x-2">
									<dt class="text-muted-foreground">Effective</dt>
									<dd>{formatShortDate(p.effectiveDate)}</dd>
								</div>
							{/if}
						</dl>

						{#if p.note}
							<p class="text-xs text-muted-foreground">“{p.note}”</p>
						{/if}

						{#if p.hasAmount && !revealed}
							<form method="POST" action="?/revealAmount" use:enhance>
								<input type="hidden" name="proposalId" value={p.id} />
								<button
									type="submit"
									class="text-xs font-medium text-primary hover:underline"
									aria-label="Reveal salary for {p.target.lastName}, {p.target.firstName}"
									>Reveal salary</button
								>
							</form>
						{/if}

						<p class="mt-auto pt-1 text-xs text-muted-foreground">
							Proposed by {p.initiator}
						</p>
					</div>

					<form
						method="POST"
						action="?/confirm"
						use:enhance={confirm.enhance}
						class="flex shrink-0 gap-2 border-t bg-muted/20 p-3"
					>
						<input type="hidden" name="proposalId" value={p.id} />
						<button
							type="submit"
							disabled={confirm.busy}
							aria-label="Confirm and apply the change for {p.target.firstName} {p.target.lastName}"
							class="flex-1 rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:pointer-events-none disabled:opacity-50"
							>{confirm.busy ? 'Confirming…' : 'Confirm & apply'}</button
						>
						<button
							type="button"
							disabled={reject.busy}
							aria-label="Reject the change for {p.target.firstName} {p.target.lastName}"
							onclick={() => {
								noteTargetId = p.id
								noteDialogOpen = true
							}}
							class="flex-1 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50"
							>Reject…</button
						>
					</form>
				</div>
			{/each}
		</div>

		<Pagination meta={data.pagination} />
	{/if}
</div>

<!-- Submission target for the popup-collected rejection reason. -->
<form
	bind:this={rejectForm}
	method="POST"
	action="?/reject"
	use:enhance={reject.enhance}
	class="hidden"
>
	<input type="hidden" name="proposalId" value={rejectId} />
	<input type="hidden" name="note" value={rejectNote} />
</form>

<ReasonDialog
	bind:open={noteDialogOpen}
	title="Reject pay change"
	message="Tell the person who filed it why, and what to change. They are notified with this reason."
	placeholder="Write the reason…"
	confirmText="Reject"
	onconfirm={submitRejection}
/>
