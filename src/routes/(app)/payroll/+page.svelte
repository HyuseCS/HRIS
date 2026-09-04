<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import { formatCurrency, formatShortDate } from '$lib/utils/format'
	import PeriodPicker from '$lib/components/ui/PeriodPicker.svelte'
	import TableSkeleton from '$lib/components/ui/TableSkeleton.svelte'
	import LoadError from '$lib/components/ui/LoadError.svelte'
	import ConfirmButton from '$lib/components/ui/ConfirmButton.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import { addToast } from '$lib/stores/toast.svelte'
	import type { PageData, ActionData } from './$types'
	import Badge from '$lib/components/ui/Badge.svelte'

	let { data, form }: { data: PageData; form: ActionData } = $props()
	let showCreate = $state(false)

	// #108: a double-submit here creates a duplicate payroll run for the same period.
	//
	// It also owns the success confirmation: a created run used to leave this panel open over a
	// reset picker with nothing said, so the only way to know it worked was to spot the new row in
	// the list below. Closing the panel and naming the period is the confirmation — the period
	// matters because a custom range can now span two months, and the list shows many runs.
	//
	// Announced from the submit callback, NOT from an `$effect` watching `form`. `addToast` pushes
	// onto a `$state` array, and `push` reads it as well as writing it — inside an effect that is a
	// read-write cycle and Svelte 5 aborts the page with `effect_update_depth_exceeded`. Same trap,
	// same fix as `settings/backup`.
	const create = createSubmitGuard((input) => {
		// Read before `update()`: a successful submit resets the form and blanks these.
		const start = String(input.formData.get('periodStart') ?? '')
		const end = String(input.formData.get('periodEnd') ?? '')
		return async ({ update, result }) => {
			await update()
			if (result.type !== 'success') return
			showCreate = false
			addToast(
				`Payroll run created for ${formatShortDate(new Date(start))} – ${formatShortDate(new Date(end))}.`,
				{ kind: 'success' }
			)
		}
	})

	// #108: compute/approve live inside an {#each}, so each run needs its OWN guard — a single
	// shared one would disable every row's button at once. Memoised by `${runId}:${action}`.
	const guards = new Map<string, ReturnType<typeof createSubmitGuard>>()
	function guard(key: string) {
		let g = guards.get(key)
		if (!g) guards.set(key, (g = createSubmitGuard()))
		return g
	}
</script>

<svelte:head>
	<title>Payroll — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader title="Payroll Runs" />

	<!-- The run actions sit above the list they add to, not on the title row. -->
	<div class="flex items-center justify-end">
		{#if data.canManage}
			<div class="flex items-center gap-2">
				<a
					href="/payroll/calculator"
					class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">Calculator</a
				>
				<a
					href="/payroll/periods"
					class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">Payroll Periods</a
				>
				<button
					onclick={() => (showCreate = !showCreate)}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
				>
					New Payroll Run
				</button>
			</div>
		{:else}
			<!-- Sign-off roles (Verifier/Approver) see a read-only list and open a run to act. -->
			<span class="text-xs text-muted-foreground">Open a computed run to verify or approve it.</span
			>
		{/if}
	</div>

	{#if form?.error && !showCreate}
		<div
			class="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm text-destructive"
		>
			{form.error}
		</div>
	{/if}

	{#if showCreate}
		<form
			method="POST"
			action="?/create"
			use:enhance={create.enhance}
			class="rounded-lg border p-4 space-y-3"
		>
			<h2 class="font-semibold">Create Payroll Run</h2>
			{#if form?.error}<div class="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{form.error}
				</div>{/if}
			<!-- #163: wide enough that Month, Year and all four period buttons sit on one row
			     and the two date fields keep their two-column grid instead of stacking. -->
			<div class="max-w-4xl">
				<PeriodPicker />
			</div>
			<div class="flex items-center gap-2">
				<button
					type="submit"
					disabled={create.busy}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
					>{create.busy ? 'Creating…' : 'Create'}</button
				>
				<button
					type="button"
					onclick={() => (showCreate = false)}
					class="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancel</button
				>
			</div>
		</form>
	{/if}

	{#await data.runs}
		<TableSkeleton rows={5} cols={6} />
	{:then runs}
		<!-- A finance approver (CEO / Super Admin) sees runs from every tenant (#174); the
		     Tenant column and per-row org label only appear once runs span more than one org. -->
		{@const crossTenant = runs.some((r) => r.organizationId !== data.viewerOrg)}
		<div class="overflow-x-auto rounded-lg border">
			<table class="w-full text-sm">
				<thead class="border-b bg-muted/50">
					<tr>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Period</th>
						{#if crossTenant}
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Tenant</th>
						{/if}
						<th class="px-4 py-3 text-right font-medium text-muted-foreground">Gross</th>
						<th class="px-4 py-3 text-right font-medium text-muted-foreground">Deductions</th>
						<th class="px-4 py-3 text-right font-medium text-muted-foreground">Net Pay</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
						<th class="px-4 py-3"></th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each runs as run (run.id)}
						<tr class="hover:bg-muted/30">
							<td class="px-4 py-3"
								>{formatShortDate(run.periodStart)} – {formatShortDate(run.periodEnd)}</td
							>
							{#if crossTenant}
								<td class="px-4 py-3 text-muted-foreground">{run.organization?.name ?? '—'}</td>
							{/if}
							<td class="px-4 py-3 text-right font-mono tabular-nums"
								>{formatCurrency(Number(run.totalGross))}</td
							>
							<td class="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground"
								>{formatCurrency(Number(run.totalDeductions))}</td
							>
							<td class="px-4 py-3 text-right font-mono font-medium tabular-nums"
								>{formatCurrency(Number(run.totalNet))}</td
							>
							<td class="px-4 py-3">
								<Badge status={run.status} domain="payrollRun" />
								{#if run.hasOverride}<span class="ml-1 text-yellow-600 dark:text-yellow-500">*</span
									>{/if}
							</td>
							<td class="px-4 py-3">
								<div class="flex items-center justify-end gap-2">
									<!-- Creating a run computes it (#138), so a run only stays DRAFT when that
									     compute failed — this button is the recovery path. -->
									{#if data.canManage && run.organizationId === data.viewerOrg && run.status === 'DRAFT'}
										{@const computeG = guard(`${run.id}:compute`)}
										<form method="POST" action="?/compute" use:enhance={computeG.enhance}>
											<input type="hidden" name="id" value={run.id} />
											<button
												type="submit"
												disabled={computeG.busy}
												class="btn-row disabled:pointer-events-none disabled:opacity-50"
												>{computeG.busy ? 'Computing…' : 'Compute'}</button
											>
										</form>
									{/if}
									{#if data.canManage && run.organizationId === data.viewerOrg && run.status === 'COMPUTED'}
										{@const recomputeG = guard(`${run.id}:compute`)}
										<form method="POST" action="?/compute" use:enhance={recomputeG.enhance}>
											<input type="hidden" name="id" value={run.id} />
											<button
												type="submit"
												disabled={recomputeG.busy}
												class="btn-row disabled:pointer-events-none disabled:opacity-50"
												>{recomputeG.busy ? 'Computing…' : 'Recompute'}</button
											>
										</form>
									{/if}
									<!-- #319: an overlapping range is refused with "void the conflicting run to
									     proceed", so that run needs a Void control on the screen that shows the
									     message. Confirmed, because a locked period's amortization is credited
									     back and the run cannot be un-voided. -->
									{#if data.canVoid && run.organizationId === data.viewerOrg && run.status !== 'VOIDED'}
										<ConfirmButton
											action="?/void"
											title="Void this payroll run?"
											message="The run is marked VOIDED and any amortization it collected is credited back. This cannot be undone, and the same exact period cannot be created again."
											confirmText="Void run"
											triggerLabel="Void"
											triggerClass="btn-row text-destructive"
										>
											<input type="hidden" name="id" value={run.id} />
										</ConfirmButton>
									{/if}
									<!-- Sign-off (verify → approve) happens through the chain on the detail page (#134). -->
									<a href="/payroll/{run.id}" class="btn-row"
										>{run.status === 'COMPUTED' ? 'Review' : 'Detail'}</a
									>
								</div>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan={crossTenant ? 7 : 6} class="p-0"
								><EmptyState title="No payroll runs yet" /></td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:catch}
		<LoadError what="the payroll runs" />
	{/await}
</div>
