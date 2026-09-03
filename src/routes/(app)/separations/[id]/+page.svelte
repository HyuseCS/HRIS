<script lang="ts">
	import { enhance } from '$app/forms'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import { formatShortDate } from '$lib/utils/format'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import { CLEARANCE_AREA_LABELS } from '$lib/utils/clearance-area'
	import type { PageData, ActionData } from './$types'
	import Badge from '$lib/components/ui/Badge.svelte'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	const s = $derived(data.separation)
	const isFinalized = $derived(s.status === 'FINALIZED')
	const pendingCount = $derived(s.clearanceItems.filter((i) => i.status !== 'CLEARED').length)
	// #297: the reason this actor may not finalize, or null. Computed server-side by the SAME
	// helper the service guard uses, so the button and the refusal cannot disagree.
	const finalizeBar = $derived(data.finalizeBar)

	const peso = (n: number) => n.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })

	// #108: every clearance row is its own form, so each needs its own guard — a shared one would
	// disable the whole checklist while any single row is in flight. Created lazily per item id.
	const clearanceGuards: Record<string, ReturnType<typeof createSubmitGuard>> = {}
	const clearanceGuard = (id: string) => (clearanceGuards[id] ??= createSubmitGuard())

	// #108: finalize snapshots final pay and offboards — a second submit must never land.
	// The guard releases `busy` when an inner handler cancels, so the confirm composes normally.
	const finalize = createSubmitGuard((input) => {
		if (
			!confirm(
				'Finalize this separation? This snapshots final pay, offboards the employee, and disables their login. Only a Super Admin can undo it.'
			)
		)
			input.cancel()
	})

	// #304: the undo re-enables a login and moves money back. Same single-submit guard as
	// finalize, with its own confirm — the guard releases `busy` when the inner handler cancels.
	let reopenClearance = $state(false)
	const undo = createSubmitGuard((input) => {
		if (
			!confirm(
				'Undo this finalization? This restores the loan and cash-advance balances, puts the employee back to their previous employment status, and RE-ENABLES their login.' +
					(reopenClearance
						? '\n\nClearance will also be RE-OPENED: the case returns to OPEN and every item goes back to pending.'
						: '')
			)
		)
			input.cancel()
	})
</script>

<svelte:head>
	<title>Separation — {s.employee.lastName}, {s.employee.firstName}</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	{#if form?.error}
		<div
			class="rounded-md border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400"
		>
			{form.error}
		</div>
	{/if}
	{#if form?.undone}
		<div
			class="rounded-md border border-green-500/20 bg-green-500/10 px-4 py-2 text-sm text-green-600 dark:text-green-400"
		>
			Finalization undone. The case is back to {form.status} and the employee's login is enabled again.
		</div>
	{/if}
	{#if data.partiallyRestored}
		<div
			class="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400"
		>
			<p class="font-semibold">Partially restored</p>
			<!-- {@const} must be an immediate child of a block tag, never inside a plain element. -->
			{#if data.writeOff !== null}
				<p class="mt-1">
					Loan and cash-advance balances totalling <span class="font-mono"
						>{peso(data.writeOff)}</span
					> were written off when this was finalized and could not be restored automatically — re-enter
					them manually.
				</p>
			{:else}
				<p class="mt-1">
					Loan and cash-advance balances of an unknown amount were written off when this was
					finalized and could not be restored automatically — re-enter them manually.
				</p>
			{/if}
		</div>
	{/if}
	{#if form?.finalized}
		<div
			class="rounded-md border border-green-500/20 bg-green-500/10 px-4 py-2 text-sm text-green-600 dark:text-green-400"
		>
			Separation finalized. The employee is now offboarded and their login is disabled.
		</div>
	{/if}

	<!-- Header -->
	<div class="flex flex-wrap items-start justify-between gap-4 rounded-lg border bg-card p-4">
		<div class="min-w-0 flex-1">
			<h1 class="text-xl font-bold tracking-tight">
				{s.employee.lastName}, {s.employee.firstName}
			</h1>
			<p class="text-sm text-muted-foreground">
				{s.employee.jobTitle} · {s.employee.department?.name ?? '—'} · #{s.employee.employeeNumber}
			</p>
			<p class="mt-2 text-sm">
				<span class="font-medium">{s.type}</span> · effective {formatShortDate(s.effectiveDate)}
			</p>
			{#if s.reason}<p class="mt-1 text-sm text-muted-foreground">{s.reason}</p>{/if}
		</div>
		<div
			class="ml-auto flex basis-full shrink-0 flex-wrap items-center justify-end gap-2 sm:basis-auto"
		>
			<BackButton fallback="/separations" label="Separations" />
			<Badge status={s.status} domain="separation" />
		</div>
	</div>

	<!-- Clearance checklist -->
	<div class="rounded-lg border bg-card">
		<div class="border-b px-4 py-3">
			<div class="flex items-center justify-between">
				<h2 class="font-semibold">Clearance checklist</h2>
				<span class="text-xs text-muted-foreground"
					>{s.clearanceItems.length - pendingCount}/{s.clearanceItems.length} cleared</span
				>
			</div>
			{#if !isFinalized}
				<p class="mt-1 text-xs text-amber-700 dark:text-amber-400">
					Marking any item cleared here means you will not be able to finalize this case. Another HR
					administrator, or your CEO, will have to finalize it.
				</p>
			{/if}
		</div>
		<ul class="divide-y">
			{#each s.clearanceItems as item (item.id)}
				<li class="flex items-center justify-between gap-3 px-4 py-3">
					<div>
						<p class="text-sm font-medium">{item.label}</p>
						<p class="text-xs text-muted-foreground">{CLEARANCE_AREA_LABELS[item.area]}</p>
					</div>
					{#if isFinalized}
						<Badge status={item.status} domain="clearance" />
					{:else}
						{@const toggle = clearanceGuard(item.id)}
						<form method="POST" action="?/toggleClearance" use:enhance={toggle.enhance}>
							<input type="hidden" name="itemId" value={item.id} />
							<input
								type="hidden"
								name="cleared"
								value={item.status === 'CLEARED' ? 'false' : 'true'}
							/>
							<button
								type="submit"
								disabled={toggle.busy}
								class="rounded-md border px-3 py-1 text-xs font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50 {item.status ===
								'CLEARED'
									? 'text-green-600 dark:text-green-400'
									: 'text-muted-foreground'}"
							>
								{item.status === 'CLEARED' ? 'Cleared' : 'Mark cleared'}
							</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	</div>

	<!-- Final pay -->
	<div class="rounded-lg border bg-card">
		<div class="border-b px-4 py-3">
			<h2 class="font-semibold">Final pay {isFinalized ? '(settled)' : '(preview)'}</h2>
		</div>
		<dl class="divide-y">
			{#each data.finalPay.lines as line (line.label)}
				<div class="flex items-center justify-between px-4 py-2 text-sm">
					<dt class="text-muted-foreground">{line.label}</dt>
					<dd class="font-mono {line.amount < 0 ? 'text-red-600' : ''}">{peso(line.amount)}</dd>
				</div>
			{/each}
			<div class="flex items-center justify-between px-4 py-3 text-sm font-semibold">
				<dt>Net final pay</dt>
				<dd class="font-mono {data.finalPay.total < 0 ? 'text-red-600' : ''}">
					{peso(data.finalPay.total)}
				</dd>
			</div>
		</dl>
		{#if data.finalPay.total < 0}
			<p class="px-4 pb-3 text-xs text-muted-foreground">
				Negative total means the employee owes the company after offsets.
			</p>
		{/if}
	</div>

	<!-- Finalize -->
	{#if !isFinalized}
		<div class="rounded-lg border border-destructive/30 bg-card p-4">
			<h2 class="font-semibold text-destructive">Finalize separation</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Snapshots the final pay above, sets the employee to <strong>OFFBOARDED</strong> (end date
				{formatShortDate(s.effectiveDate)}), and disables their login. Only a Super Admin can undo
				it (#304).
			</p>
			{#if pendingCount > 0}
				<p class="mt-2 text-sm text-amber-700 dark:text-amber-400">
					{pendingCount} clearance item{pendingCount === 1 ? '' : 's'} still pending — clear all before
					finalizing.
				</p>
			{/if}
			{#if finalizeBar}
				<p id="finalize-bar" class="mt-2 text-sm text-amber-700 dark:text-amber-400">
					{finalizeBar}
				</p>
			{/if}
			<form method="POST" action="?/finalize" use:enhance={finalize.enhance} class="mt-3">
				<button
					type="submit"
					aria-describedby={finalizeBar ? 'finalize-bar' : undefined}
					disabled={pendingCount > 0 || !!finalizeBar || finalize.busy}
					class="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
					>{finalize.busy ? 'Finalizing…' : 'Finalize & offboard'}</button
				>
			</form>
		</div>
	{:else}
		<div class="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
			Finalized{s.finalizedAt ? ` on ${formatShortDate(s.finalizedAt)}` : ''}. Final pay settled at
			<span class="font-mono">{peso(Number(s.finalPayAmount ?? 0))}</span>.
		</div>
		{#if data.canUndo}
			<div class="rounded-lg border border-destructive/30 bg-card p-4">
				<h2 class="font-semibold text-destructive">Undo finalization</h2>
				<p id="undo-warning" class="mt-1 text-sm text-muted-foreground">
					Restores the loan and cash-advance balances this finalize wrote off, sets the employee
					back to their previous employment status, and <strong>re-enables their login</strong>.
					Every undo is recorded in the audit log.
				</p>
				<form method="POST" action="?/undo" use:enhance={undo.enhance} class="mt-3 space-y-3">
					<div class="flex items-center gap-2">
						<input
							id="reopenClearance"
							name="reopenClearance"
							type="checkbox"
							value="true"
							bind:checked={reopenClearance}
							class="h-4 w-4 rounded border-input"
						/>
						<label for="reopenClearance" class="text-sm">
							Re-open clearance items — the case returns to <strong>OPEN</strong> and every item goes
							back to pending. Whoever cleared an item stays barred from finalizing this case.
						</label>
					</div>
					<button
						type="submit"
						aria-describedby="undo-warning"
						disabled={undo.busy}
						class="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
						>{undo.busy ? 'Undoing…' : 'Undo finalization'}</button
					>
				</form>
			</div>
		{/if}
	{/if}
</div>
