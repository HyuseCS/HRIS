<script lang="ts">
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	// #108: a double-click would create a duplicate pay code.
	const addEarning = createSubmitGuard()
	const addDeduction = createSubmitGuard()

	// #108: each table row carries its own toggle form, so each needs its own guard — a shared one
	// would freeze the whole table while one row is in flight. Separate maps per action: earnings
	// and deductions are distinct id spaces. Plain objects, not `$state`: each guard holds its own
	// reactive `busy`, the maps only memoise identity.
	const toggleEarningGuards: Record<string, ReturnType<typeof createSubmitGuard>> = {}
	const toggleEarningGuard = (id: string) => (toggleEarningGuards[id] ??= createSubmitGuard())
	const toggleDeductionGuards: Record<string, ReturnType<typeof createSubmitGuard>> = {}
	const toggleDeductionGuard = (id: string) => (toggleDeductionGuards[id] ??= createSubmitGuard())
</script>

<svelte:head>
	<title>Earnings & Deductions — Veent HRIS</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6">
	<PageHeader
		title="Earnings & Deduction Codes"
		description="Codes used by the payroll engine. Deactivate instead of deleting — historical payslips reference them."
	>
		{#snippet back()}
			<BackButton fallback="/settings" label="Settings" preferFallback />
		{/snippet}
	</PageHeader>

	{#if form?.error}
		<Banner kind="error" message={form.error} />
	{/if}

	<div class="grid gap-6 lg:grid-cols-2">
		<!-- Earnings -->
		<section class="space-y-3 rounded-lg border bg-card p-4">
			<h2 class="font-semibold">Earnings</h2>
			<div class="overflow-x-auto rounded-md border">
				<table class="w-full text-sm">
					<thead class="border-b bg-muted/50">
						<tr>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Code</th>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Label</th>
							<th class="px-3 py-2 text-center font-medium text-muted-foreground">Taxable</th>
							<th class="px-3 py-2 text-right font-medium text-muted-foreground">×</th>
							<th class="px-3 py-2"></th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each data.earningTypes as et (et.id)}
							{@const toggle = toggleEarningGuard(et.id)}
							<tr class="hover:bg-muted/30 {et.isActive ? '' : 'opacity-50'}">
								<td class="px-3 py-2 font-mono text-xs">{et.code}</td>
								<td class="px-3 py-2">{et.label}</td>
								<td class="px-3 py-2 text-center">
									<span aria-label={et.taxable ? 'Taxable' : 'Not taxable'}
										>{et.taxable ? '✓' : '—'}</span
									>
								</td>
								<td class="px-3 py-2 text-right font-mono text-xs"
									>{et.multiplier ? Number(et.multiplier).toFixed(2) : '—'}</td
								>
								<td class="px-3 py-2 text-right">
									<form method="POST" action="?/toggleEarning" use:enhance={toggle.enhance}>
										<input type="hidden" name="id" value={et.id} />
										<button
											type="submit"
											disabled={toggle.busy}
											class="rounded-md border px-3 py-1 text-xs font-medium disabled:pointer-events-none disabled:opacity-50 {et.isActive
												? 'border-red-500/20 text-red-600 hover:bg-red-500/10'
												: 'border-green-500/20 text-green-600 hover:bg-green-500/10'}"
											>{toggle.busy ? 'Saving…' : et.isActive ? 'Deactivate' : 'Activate'}</button
										>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<form
				method="POST"
				action="?/addEarning"
				use:enhance={addEarning.enhance}
				class="flex flex-wrap items-end gap-2 border-t pt-3"
			>
				<input
					name="code"
					placeholder="CODE"
					required
					class="h-8 w-24 rounded-md border border-input bg-background px-2 text-xs uppercase"
				/>
				<input
					name="label"
					placeholder="Label"
					required
					class="h-8 w-32 rounded-md border border-input bg-background px-2 text-xs"
				/>
				<input
					name="multiplier"
					type="number"
					step="0.01"
					min="0"
					placeholder="×"
					class="h-8 w-16 rounded-md border border-input bg-background px-2 text-xs"
				/>
				<label class="flex items-center gap-1 text-xs"
					><input name="taxable" type="checkbox" checked /> Taxable</label
				>
				<button
					disabled={addEarning.busy}
					class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
					>{addEarning.busy ? 'Adding…' : 'Add'}</button
				>
			</form>
		</section>

		<!-- Deductions -->
		<section class="space-y-3 rounded-lg border bg-card p-4">
			<h2 class="font-semibold">Deductions</h2>
			<div class="overflow-x-auto rounded-md border">
				<table class="w-full text-sm">
					<thead class="border-b bg-muted/50">
						<tr>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Code</th>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Label</th>
							<th class="px-3 py-2 text-center font-medium text-muted-foreground">Statutory</th>
							<th class="px-3 py-2"></th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each data.deductionTypes as dt (dt.id)}
							{@const toggle = toggleDeductionGuard(dt.id)}
							<tr class="hover:bg-muted/30 {dt.isActive ? '' : 'opacity-50'}">
								<td class="px-3 py-2 font-mono text-xs">{dt.code}</td>
								<td class="px-3 py-2">{dt.label}</td>
								<td class="px-3 py-2 text-center">
									<span aria-label={dt.isStatutory ? 'Statutory' : 'Not statutory'}
										>{dt.isStatutory ? '✓' : '—'}</span
									>
								</td>
								<td class="px-3 py-2 text-right">
									<form method="POST" action="?/toggleDeduction" use:enhance={toggle.enhance}>
										<input type="hidden" name="id" value={dt.id} />
										<button
											type="submit"
											disabled={toggle.busy}
											class="rounded-md border px-3 py-1 text-xs font-medium disabled:pointer-events-none disabled:opacity-50 {dt.isActive
												? 'border-red-500/20 text-red-600 hover:bg-red-500/10'
												: 'border-green-500/20 text-green-600 hover:bg-green-500/10'}"
											>{toggle.busy ? 'Saving…' : dt.isActive ? 'Deactivate' : 'Activate'}</button
										>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<form
				method="POST"
				action="?/addDeduction"
				use:enhance={addDeduction.enhance}
				class="flex flex-wrap items-end gap-2 border-t pt-3"
			>
				<input
					name="code"
					placeholder="CODE"
					required
					class="h-8 w-24 rounded-md border border-input bg-background px-2 text-xs uppercase"
				/>
				<input
					name="label"
					placeholder="Label"
					required
					class="h-8 w-32 rounded-md border border-input bg-background px-2 text-xs"
				/>
				<label class="flex items-center gap-1 text-xs"
					><input name="isStatutory" type="checkbox" /> Statutory</label
				>
				<button
					disabled={addDeduction.busy}
					class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
					>{addDeduction.busy ? 'Adding…' : 'Add'}</button
				>
			</form>
		</section>
	</div>
</div>
