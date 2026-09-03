<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import { formatCurrency, formatShortDate } from '$lib/utils/format'
	import { periodDays } from '$lib/utils/pay-periods'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
	import type { PageData, ActionData } from './$types'
	import Badge from '$lib/components/ui/Badge.svelte'

	let { data, form }: { data: PageData; form: ActionData } = $props()
	const run = $derived(data.run)
	let overrideEntryId = $state<string | null>(null)
	let expandedEntryId = $state<string | null>(null)
	let showReturn = $state(false)

	// #108: a double-submitted recompute rebuilds every entry twice — expensive to unwind.
	const compute = createSubmitGuard()
	// Final sign-off. The page banner is far above the fold on a long run, so the toast is the
	// only cue that lands where the operator is looking.
	const decideGuard = submitFeedback()

	// Maker-checker chain (#134): each attempt is MAKE → VERIFY → APPROVE. Group the
	// append-only steps by attempt so a recomputed/refiled run shows its full history.
	type Step = (typeof run.approvalSteps)[number]
	const stageName: Record<string, string> = { MAKE: 'Make', VERIFY: 'Verify', APPROVE: 'Approve' }
	const latestAttempt = $derived(Math.max(1, ...run.approvalSteps.map((s) => s.attempt)))
	const attempts = $derived.by(() => {
		const groups = new Map<number, Step[]>()
		for (const s of run.approvalSteps) {
			const list = groups.get(s.attempt) ?? []
			list.push(s)
			groups.set(s.attempt, list)
		}
		return [...groups.entries()]
			.sort((a, b) => a[0] - b[0])
			.map(([attempt, steps]) => ({
				attempt,
				steps: [...steps].sort((a, b) => a.stageIndex - b.stageIndex)
			}))
	})

	function stepLabel(step: Step): string {
		if (step.decision === 'APPROVED') {
			return step.stage === 'MAKE' ? 'Prepared' : step.stage === 'VERIFY' ? 'Verified' : 'Approved'
		}
		if (step.decision === 'REJECTED') return 'Rejected'
		if (step.decision === 'RETURNED') return 'Returned'
		return stageName[step.stage] ?? 'Pending'
	}

	// The live stage is highlighted only while the run is open for review and the
	// latest attempt hasn't been returned. `data.canAct` gates whether *this* user acts.
	const haltedLatest = $derived(
		run.approvalSteps.some(
			(s) => s.attempt === latestAttempt && (s.decision === 'RETURNED' || s.decision === 'REJECTED')
		)
	)
	function isActive(step: Step): boolean {
		return (
			run.status === 'COMPUTED' &&
			!haltedLatest &&
			step.attempt === latestAttempt &&
			step.decision == null &&
			data.liveStage === step.stage
		)
	}
	const actVerb = $derived(data.liveStage === 'APPROVE' ? 'Approve' : 'Verify')

	// #108: the override form is rendered inside an {#each}, so it gets a per-entry guard rather
	// than a shared one. Memoised by entry id so the identity is stable across re-renders.
	const overrideGuards = new Map<string, ReturnType<typeof createSubmitGuard>>()
	function overrideGuard(entryId: string) {
		let g = overrideGuards.get(entryId)
		if (!g) overrideGuards.set(entryId, (g = createSubmitGuard()))
		return g
	}
</script>

<svelte:head>
	<title>Payroll {formatShortDate(run.periodStart)} — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<!-- #163: a custom range is no longer self-evident from its dates, so the inclusive day
	     count is spelled out — it is what statutory and loans are prorated against. -->
	<PageHeader
		title="{formatShortDate(run.periodStart)} – {formatShortDate(run.periodEnd)} ({periodDays(
			run.periodStart,
			run.periodEnd
		)} days)"
	>
		{#snippet back()}
			<Badge status={run.status} domain="payrollRun" />
			{#if run.hasOverride}
				<span class="text-xs text-yellow-600 font-medium dark:text-yellow-500">Has overrides</span>
			{/if}
			<BackButton fallback="/payroll" label="Payroll" />
		{/snippet}
	</PageHeader>

	<!-- Recompute rebuilds all entries from current data (e.g. after assigning recurring
	     earnings/deductions). Managers only; disabled once approved. It sits above the totals
	     and the entry table it rebuilds, not on the title row. -->
	{#if data.canManage && run.status === 'COMPUTED'}
		<div class="flex justify-end">
			<form method="POST" action="?/compute" use:enhance={compute.enhance}>
				<button
					type="submit"
					disabled={compute.busy}
					class="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
					>{compute.busy ? 'Computing…' : 'Recompute'}</button
				>
			</form>
		</div>
	{/if}

	{#if form?.error}
		<div
			class="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive"
		>
			{form.error}
		</div>
	{/if}

	<!-- #249: the figures below and the table are this viewer's team only, not the run. Said out
	     loud because the totals were recomputed to match the rows, which makes a scoped view look
	     exactly like a complete one. -->
	{#if data.scopedToTeam}
		<p
			class="rounded-md border border-sky-500/20 bg-sky-500/10 px-4 py-2 text-sm text-sky-600 dark:text-sky-400"
		>
			Showing your team only — employees who report to you or work in a branch you manage. Totals
			cover these entries, not the whole run.
		</p>
	{/if}

	<div class="grid gap-4 sm:grid-cols-3">
		<div class="rounded-lg border bg-card p-4">
			<p class="text-sm text-muted-foreground">Total Gross</p>
			<p class="text-xl font-bold font-mono">{formatCurrency(Number(run.totalGross))}</p>
		</div>
		<div class="rounded-lg border bg-card p-4">
			<p class="text-sm text-muted-foreground">Total Deductions</p>
			<p class="text-xl font-bold font-mono">{formatCurrency(Number(run.totalDeductions))}</p>
		</div>
		<div class="rounded-lg border bg-card p-4">
			<p class="text-sm text-muted-foreground">Total Net Pay</p>
			<p class="text-xl font-bold font-mono text-green-700 dark:text-green-400">
				{formatCurrency(Number(run.totalNet))}
			</p>
		</div>
	</div>

	<div class="rounded-lg border overflow-x-auto">
		<table class="w-full text-sm">
			<thead class="border-b bg-muted/50">
				<tr>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Employee</th>
					<th class="px-4 py-3 text-right font-medium text-muted-foreground">Gross</th>
					<th class="px-4 py-3 text-right font-medium text-muted-foreground">SSS (EE)</th>
					<th class="px-4 py-3 text-right font-medium text-muted-foreground">PhilHealth</th>
					<th class="px-4 py-3 text-right font-medium text-muted-foreground">Pag-IBIG</th>
					<th class="px-4 py-3 text-right font-medium text-muted-foreground">BIR Tax</th>
					<th class="px-4 py-3 text-right font-medium text-muted-foreground">Net Pay</th>
					<th class="px-4 py-3"></th>
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each run.entries as entry (entry.id)}
					<tr class="hover:bg-muted/30 {entry.isFlagged ? 'bg-yellow-500/10' : ''}">
						<td class="px-4 py-3">
							<div class="font-medium">{entry.employee.lastName}, {entry.employee.firstName}</div>
							<div class="text-xs text-muted-foreground">
								{entry.employee.employeeNumber} · {entry.employee.department.name}
							</div>
							{#if entry.isFlagged}
								<div class="text-xs text-yellow-600 dark:text-yellow-500">⚠ {entry.flagReason}</div>
							{/if}
						</td>
						<td class="px-4 py-3 text-right font-mono tabular-nums"
							>{formatCurrency(Number(entry.grossPay))}</td
						>
						<td class="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground"
							>{formatCurrency(Number(entry.sssEe))}</td
						>
						<td class="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground"
							>{formatCurrency(Number(entry.philhealthEe))}</td
						>
						<td class="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground"
							>{formatCurrency(Number(entry.pagibigEe))}</td
						>
						<td class="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground"
							>{formatCurrency(Number(entry.withholdingTax))}</td
						>
						<td class="px-4 py-3 text-right font-mono font-medium tabular-nums"
							>{formatCurrency(Number(entry.netPay))}</td
						>
						<td class="px-4 py-3">
							<div class="flex items-center justify-end gap-2">
								{#if data.payslipVisible}
									<a href={`/payslips/${entry.id}`} class="btn-row">Payslip</a>
								{/if}
								<button
									onclick={() => (expandedEntryId = expandedEntryId === entry.id ? null : entry.id)}
									class="btn-row">{expandedEntryId === entry.id ? 'Hide' : 'Breakdown'}</button
								>
								{#if data.canManage && run.status !== 'APPROVED'}
									<button onclick={() => (overrideEntryId = entry.id)} class="btn-row"
										>Override</button
									>
								{/if}
							</div>
						</td>
					</tr>
					{#if expandedEntryId === entry.id}
						<tr>
							<td colspan="8" class="bg-muted/30 px-4 py-3">
								<div class="grid gap-6 sm:grid-cols-2">
									<div>
										<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
											Earnings
										</p>
										<table class="mt-1 w-full text-sm">
											<tbody>
												{#each entry.earnings as c (c.id)}
													<tr
														><td class="py-0.5">{c.label}{c.taxable ? '' : ' (non-taxable)'}</td><td
															class="py-0.5 text-right font-mono tabular-nums"
															>{formatCurrency(Number(c.amount))}</td
														></tr
													>
												{:else}
													<tr><td class="py-0.5 text-muted-foreground">No earning lines.</td></tr>
												{/each}
											</tbody>
										</table>
									</div>
									<div>
										<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
											Deductions
										</p>
										<table class="mt-1 w-full text-sm">
											<tbody>
												{#each entry.deductions as c (c.id)}
													<tr
														><td class="py-0.5">{c.label}</td><td
															class="py-0.5 text-right font-mono tabular-nums text-muted-foreground"
															>{formatCurrency(Number(c.amount))}</td
														></tr
													>
												{:else}
													<tr><td class="py-0.5 text-muted-foreground">No deduction lines.</td></tr>
												{/each}
											</tbody>
										</table>
									</div>
								</div>
							</td>
						</tr>
					{/if}
					{#if overrideEntryId === entry.id}
						{@const overrideG = overrideGuard(entry.id)}
						<tr>
							<td colspan="8" class="px-4 py-3 bg-muted/30">
								<form
									method="POST"
									action="?/override"
									use:enhance={overrideG.enhance}
									class="flex items-end gap-3"
								>
									<input type="hidden" name="entryId" value={entry.id} />
									<div>
										<label for={'netPay-' + entry.id} class="text-xs font-medium"
											>Override Net Pay</label
										>
										<input
											id={'netPay-' + entry.id}
											name="netPay"
											type="number"
											step="any"
											value={Number(entry.netPay)}
											class="mt-1 flex h-8 w-36 rounded border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
										/>
									</div>
									<div class="flex-1">
										<label for={'note-' + entry.id} class="text-xs font-medium"
											>Reason (required)</label
										>
										<input
											id={'note-' + entry.id}
											name="note"
											required
											class="mt-1 flex h-8 w-full rounded border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
										/>
									</div>
									<button
										type="submit"
										disabled={overrideG.busy}
										class="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
										>{overrideG.busy ? 'Saving…' : 'Save'}</button
									>
									<button
										type="button"
										onclick={() => (overrideEntryId = null)}
										class="rounded border px-3 py-1.5 text-xs hover:bg-accent">Cancel</button
									>
								</form>
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Maker-checker approval chain (#134) -->
	<div class="space-y-3">
		<div class="flex items-center justify-between">
			<h2 class="text-lg font-semibold">Approval chain</h2>
			<p class="text-xs text-muted-foreground">Maker → Verifier → Approver (CEO / Super Admin)</p>
		</div>

		{#if run.approvalSteps.length === 0}
			<p class="text-sm text-muted-foreground">
				No approval chain yet — compute this run to start the maker-checker flow.
			</p>
		{/if}

		{#each attempts as group (group.attempt)}
			{#if attempts.length > 1}
				<p class="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					Attempt {group.attempt}
				</p>
			{/if}
			<ol class="space-y-2">
				{#each group.steps as step, i (step.id)}
					{@const active = isActive(step)}
					<li
						class="flex items-start gap-3 rounded-lg border p-3 {active
							? 'border-primary/50 bg-primary/5'
							: ''}"
					>
						<div
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium
							{step.decision === 'APPROVED'
								? 'bg-green-100 text-green-700'
								: step.decision === 'REJECTED'
									? 'bg-red-100 text-red-700'
									: step.decision === 'RETURNED'
										? 'bg-orange-100 text-orange-700'
										: 'bg-muted text-muted-foreground'}"
						>
							{i + 1}
						</div>
						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium">
								{stepLabel(step)}
								<span class="font-normal text-muted-foreground"
									>· {stageName[step.stage]} stage</span
								>
							</p>
							<p class="text-xs text-muted-foreground">
								{#if step.decision}
									{#if step.actor}by {step.actor.email}{/if}{#if step.decidedAt}{' '}
										· {formatShortDate(step.decidedAt)}{/if}
								{:else if active}
									Pending — awaiting {stageName[step.stage].toLowerCase()}
								{:else}
									Not yet reached
								{/if}
							</p>
							{#if step.note}<p class="mt-1 text-xs text-muted-foreground">“{step.note}”</p>{/if}
						</div>
					</li>
				{/each}
			</ol>
		{/each}

		{#if data.canAct}
			<div class="rounded-lg border bg-card p-4">
				<p class="text-sm font-medium">
					This run is awaiting your {data.liveStage === 'APPROVE' ? 'approval' : 'verification'}.
				</p>
				<div class="mt-3 flex flex-wrap items-center gap-2">
					<form method="POST" action="?/decide" use:enhance={decideGuard.enhance}>
						<input type="hidden" name="action" value="approve" />
						<button
							type="submit"
							disabled={decideGuard.busy}
							class="btn-row-positive disabled:pointer-events-none disabled:opacity-50"
							>{decideGuard.busy ? 'Saving…' : actVerb}</button
						>
					</form>
					<button type="button" onclick={() => (showReturn = !showReturn)} class="btn-row"
						>Return to maker</button
					>
				</div>

				{#if showReturn}
					<form
						method="POST"
						action="?/decide"
						use:enhance={decideGuard.enhance}
						class="mt-3 flex items-end gap-3"
					>
						<input type="hidden" name="action" value="return" />
						<div class="flex-1">
							<label for="return-note" class="text-xs font-medium">Reason (required)</label>
							<input
								id="return-note"
								name="note"
								required
								placeholder="What needs to be corrected before refiling?"
								class="mt-1 flex h-8 w-full rounded border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
							/>
						</div>
						<button
							type="submit"
							disabled={decideGuard.busy}
							class="rounded border px-3 py-1.5 text-xs hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
							>{decideGuard.busy ? 'Returning…' : 'Confirm return'}</button
						>
					</form>
				{/if}
			</div>
		{:else if data.actBlockedReason}
			<!-- #283/D12: a barred approver navigated HERE, to this one run, so a control that simply
			     vanishes reads as a bug and teaches nothing. The button stays visible, is announced
			     as disabled, and carries the reason.

			     type="button" + aria-disabled rather than the native `disabled` attribute: a disabled
			     button leaves the tab order and fires no events, so a keyboard or screen-reader user
			     could never reach the explanation — exactly the people who need it most. type="button"
			     (not submit) is what makes the control a real no-op. The reason is always-visible
			     adjacent text bound with aria-describedby, not a tooltip, because hover-only fails the
			     same users for the same reason.

			     focus-visible:opacity-100 + ring-2 because the dimming defeats its own focus ring:
			     btn-row's default ring is 1px, and at opacity-50 that is invisible in practice — so
			     a sighted keyboard user tabs onto the control and sees nothing happen, which reads
			     exactly like being skipped. Reachable but invisible is not reachable. -->
			<div class="rounded-lg border bg-card p-4">
				<button
					type="button"
					aria-disabled="true"
					aria-describedby="act-blocked"
					class="btn-row cursor-not-allowed opacity-50 focus-visible:opacity-100 focus-visible:ring-2"
				>
					{actVerb}
				</button>
				<p id="act-blocked" class="mt-2 text-xs text-muted-foreground">
					{data.actBlockedReason}
				</p>
			</div>
		{:else if run.status === 'COMPUTED' && haltedLatest}
			<p class="text-sm text-orange-600 dark:text-orange-500">
				Returned to the maker — recompute this run to refile it for review.
			</p>
		{/if}
	</div>
</div>
