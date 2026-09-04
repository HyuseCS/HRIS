<script lang="ts">
	import { enhance } from '$app/forms'
	import { formatCurrency, formatShortDate } from '$lib/utils/format'
	import PeriodPicker from '$lib/components/ui/PeriodPicker.svelte'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import ConfirmButton from '$lib/components/ui/ConfirmButton.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()
	let showOpen = $state(false)

	// #108: a double-submitted period open creates a duplicate payroll period.
	const openPeriod = createSubmitGuard()

	// #108: the row actions (import/generate/lock/release/void) live inside an {#each}, so each
	// row needs its OWN guard — a single shared one would disable every row's button at once.
	// Memoised by `${periodId}:${action}` so the identity is stable across re-renders.
	const guards = new Map<string, ReturnType<typeof createSubmitGuard>>()
	function guard(key: string) {
		let g = guards.get(key)
		if (!g) guards.set(key, (g = createSubmitGuard()))
		return g
	}

	// Theme-aware status pills (#76) — see the .badge-* classes in app.css.
	const badge: Record<string, string> = {
		OPEN: 'badge-gray',
		IMPORTED: 'badge-blue',
		GENERATED: 'badge-blue',
		LOCKED: 'badge-yellow',
		RELEASED: 'badge-green',
		VOIDED: 'badge-red'
	}
</script>

<svelte:head>
	<title>Payroll Periods — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader title="Payroll Periods">
		{#snippet back()}
			<BackButton fallback="/payroll" label="Payroll" />
		{/snippet}
	</PageHeader>

	{#if form?.error}
		<div
			class="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-red-400"
		>
			{form.error}
		</div>
	{/if}

	<!-- Page-level, like the error block above. Only ?/release and ?/void populate `saved` for
	     now; open/import/generate/lock stay silent until the phase-04 feedback contract. -->
	{#if form?.saved}
		<div
			class="rounded-md border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-400"
		>
			{form.saved}
		</div>
	{/if}

	{#if showOpen}
		<form
			method="POST"
			action="?/open"
			use:enhance={openPeriod.enhance}
			class="rounded-lg border p-4 space-y-3"
		>
			<h2 class="font-semibold">Open a Payroll Period</h2>
			<div class="grid gap-4 sm:grid-cols-2">
				<div class="space-y-1.5">
					<label for="name" class="text-sm font-medium">Name</label>
					<input
						id="name"
						name="name"
						required
						placeholder="Jul 1–15 2026"
						class="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<PeriodPicker startName="start" endName="end" />
			</div>
			<div class="flex justify-end gap-2">
				<button
					type="button"
					onclick={() => (showOpen = false)}
					class="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancel</button
				>
				<button
					type="submit"
					disabled={openPeriod.busy}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
					>{openPeriod.busy ? 'Opening…' : 'Open'}</button
				>
			</div>
		</form>
	{/if}

	<section class="space-y-3">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-lg font-semibold">Periods</h2>
			<div
				class="ml-auto flex basis-full shrink-0 flex-wrap items-center justify-end gap-2 sm:basis-auto"
			>
				<button
					onclick={() => (showOpen = !showOpen)}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
				>
					Open Period
				</button>
			</div>
		</div>
		<div class="overflow-x-auto rounded-lg border">
			<table class="w-full text-sm">
				<thead class="border-b bg-muted/50">
					<tr>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Period</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Dates</th>
						<th class="px-4 py-3 text-right font-medium text-muted-foreground">Net</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
						<th class="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each data.periods as p (p.id)}
						{@const run = p.runs[0]}
						<tr class="hover:bg-muted/30">
							<td class="px-4 py-3 font-medium">{p.name}</td>
							<td class="px-4 py-3 text-muted-foreground"
								>{formatShortDate(p.startDate)} – {formatShortDate(p.endDate)}</td
							>
							<td class="px-4 py-3 text-right font-mono"
								>{run ? formatCurrency(Number(run.totalNet)) : '—'}</td
							>
							<td class="px-4 py-3">
								<span class={badge[p.status] ?? 'badge-gray'}>{p.status}</span>
							</td>
							<td class="px-4 py-3">
								<div class="flex flex-wrap items-center justify-end gap-2">
									{#if p.status === 'OPEN'}
										{@const importG = guard(`${p.id}:import`)}
										<form method="POST" action="?/import" use:enhance={importG.enhance}>
											<input type="hidden" name="id" value={p.id} />
											<button
												disabled={importG.busy}
												class="btn-row disabled:pointer-events-none disabled:opacity-50"
												>{importG.busy ? 'Importing…' : 'Import Attendance'}</button
											>
										</form>
									{/if}
									{#if p.status === 'OPEN' || p.status === 'IMPORTED' || p.status === 'GENERATED'}
										{@const generateG = guard(`${p.id}:generate`)}
										<form method="POST" action="?/generate" use:enhance={generateG.enhance}>
											<input type="hidden" name="id" value={p.id} />
											<button
												disabled={generateG.busy}
												class="btn-row disabled:pointer-events-none disabled:opacity-50"
												>{generateG.busy
													? 'Generating…'
													: p.status === 'GENERATED'
														? 'Re-generate'
														: 'Generate'}</button
											>
										</form>
									{/if}
									{#if p.status === 'GENERATED'}
										{@const lockG = guard(`${p.id}:lock`)}
										<form
											method="POST"
											action="?/lock"
											use:enhance={lockG.enhance}
											class="flex items-center gap-1"
										>
											<input type="hidden" name="id" value={p.id} />
											<input
												name="overrideNote"
												placeholder="Override note (if flagged)"
												class="h-7 w-44 rounded border border-input bg-background px-2 text-xs"
											/>
											<button
												disabled={lockG.busy}
												class="btn-row-warning disabled:pointer-events-none disabled:opacity-50"
												>{lockG.busy ? 'Locking…' : 'Lock'}</button
											>
										</form>
									{/if}
									{#if p.status === 'LOCKED'}
										{@const releaseG = guard(`${p.id}:release`)}
										<!-- submit={releaseG.enhance} is load-bearing: ConfirmButton renders its own
										     form, so dropping it loses the per-row #108 double-submit guard. -->
										<ConfirmButton
											action="?/release"
											title="Release this period?"
											message="Payslips for this period become visible to every employee in it, and the period leaves LOCKED."
											confirmText="Release period"
											triggerLabel={releaseG.busy ? 'Releasing…' : 'Release'}
											triggerClass="btn-row-positive disabled:pointer-events-none disabled:opacity-50"
											disabled={releaseG.busy}
											submit={releaseG.enhance}
										>
											<input type="hidden" name="id" value={p.id} />
										</ConfirmButton>
									{/if}
									{#if run}
										<a href="/payroll/{run.id}" class="btn-row">Detail</a>
									{/if}
									{#if data.canVoid && p.status !== 'VOIDED'}
										{@const voidG = guard(`${p.id}:void`)}
										<ConfirmButton
											action="?/void"
											title="Void this payroll period?"
											message="The period is marked VOIDED. This cannot be undone, and the same exact period cannot be created again."
											confirmText="Void period"
											triggerLabel={voidG.busy ? 'Voiding…' : 'Void'}
											triggerClass="btn-row-danger disabled:pointer-events-none disabled:opacity-50"
											disabled={voidG.busy}
											submit={voidG.enhance}
										>
											<input type="hidden" name="id" value={p.id} />
										</ConfirmButton>
									{/if}
								</div>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="5" class="px-4 py-8 text-center text-muted-foreground"
								>No payroll periods yet</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>
