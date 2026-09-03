<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	// #108: double-submitting either config form would write the same rates twice.
	const saveConfig = createSubmitGuard()
	// Re-seed the was→now baseline once the save lands, so a second save with no further edits
	// correctly reports "nothing changed" instead of replaying the first edit.
	const saveRates = createSubmitGuard(() => async ({ update, result }) => {
		await update()
		if (result.type === 'success') baselineRates = { ...rateValues }
	})

	// Editable form fields seeded once from the loaded config — an intentional
	// snapshot so a data refresh can't clobber the user's in-progress edits.
	// svelte-ignore state_referenced_locally
	const cfg = data.config
	let payFrequency = $state(cfg?.payFrequency ?? 'SEMI_MONTHLY')
	let cutoffDay1 = $state(cfg?.firstCutoff ?? 15)
	let cutoffDay2 = $state(cfg?.secondCutoff ?? 30)

	// These multipliers set OT, night-differential, rest-day and holiday pay for every future run,
	// so saving them confirms first and the dialog names which rows moved.
	const rateFields = [
		{ name: 'overtime', label: 'Overtime', hint: 'ordinary-day OT (×)' },
		{
			name: 'overtimePremium',
			label: 'OT premium (rest/holiday)',
			hint: 'extra factor on premium-day OT'
		},
		{ name: 'nightDiff', label: 'Night differential', hint: '10pm–6am, additive' },
		{ name: 'restDay', label: 'Rest day', hint: 'rest-day work (×)' },
		{ name: 'regularHoliday', label: 'Regular holiday', hint: '(×)' },
		{ name: 'specialHoliday', label: 'Special holiday', hint: '(×)' }
	] as const
	type RateName = (typeof rateFields)[number]['name']

	// Same intentional-snapshot reasoning as `cfg` above: the six live values at load are the "was"
	// side of the summary, and a data refresh must not move them under an in-progress edit.
	const loaded = Object.fromEntries(
		rateFields.map((f) => [f.name, Number(data.rates[f.name])])
	) as Record<RateName, number>
	let baselineRates = $state({ ...loaded })
	let rateValues = $state({ ...loaded })

	const changedRates = $derived(
		rateFields
			.filter((f) => rateValues[f.name] !== baselineRates[f.name])
			.map((f) => `${f.label}: ${baselineRates[f.name]} → ${rateValues[f.name]}`)
	)
	const ratesMessage = $derived(
		`These multipliers set overtime, night differential, rest-day and holiday pay for every payroll run from now on. Runs already computed are not recalculated.\n\nChanging:\n${changedRates.join('\n')}`
	)

	let ratesConfirm = $state(false)
	let ratesFormEl = $state<HTMLFormElement>()

	// Nothing changed means nothing to warn about — submit straight through.
	function submitRates() {
		if (changedRates.length === 0) ratesFormEl?.requestSubmit()
		else ratesConfirm = true
	}
</script>

<svelte:head>
	<title>Payroll Configuration — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<!-- The description carries a link, which PageHeader's string `description` cannot, so it
	     stays its own paragraph directly under the title. -->
	<PageHeader title="Payroll Configuration" />
	<p class="-mt-4 max-w-2xl text-sm text-muted-foreground">
		Configure payroll frequency and cutoff dates. Statutory rate tables live under
		<a href="/payroll/statutory-rates" class="underline hover:text-foreground">Statutory Rates</a>.
	</p>

	{#if form?.success}
		<Banner kind="success" message="Payroll configuration saved successfully." />
	{/if}

	{#if form?.error}
		<div
			class="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
		>
			{form.error}
		</div>
	{/if}

	<form
		method="POST"
		action="?/update"
		use:enhance={saveConfig.enhance}
		class="rounded-md border bg-card p-6 space-y-6"
	>
		<!-- Pay Frequency -->
		<div class="space-y-2">
			<label class="text-sm font-medium" for="payFrequency">Pay Frequency</label>
			<select
				id="payFrequency"
				name="payFrequency"
				bind:value={payFrequency}
				class="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<option value="SEMI_MONTHLY">Semi-Monthly (twice a month)</option>
				<option value="MONTHLY">Monthly (once a month)</option>
			</select>
		</div>

		<!-- Cutoff Days (only shown for SEMI_MONTHLY) -->
		{#if payFrequency === 'SEMI_MONTHLY'}
			<div class="rounded-md border bg-muted/50 p-4 space-y-4">
				<h3 class="text-sm font-semibold">Semi-Monthly Cutoff Days</h3>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<label class="text-sm font-medium" for="cutoffDay1">Cutoff Day 1</label>
						<input
							id="cutoffDay1"
							name="cutoffDay1"
							type="number"
							min="1"
							max="28"
							bind:value={cutoffDay1}
							class="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
						<p class="text-xs text-muted-foreground">Day of month for first payroll cutoff</p>
					</div>
					<div class="space-y-2">
						<label class="text-sm font-medium" for="cutoffDay2">Cutoff Day 2</label>
						<input
							id="cutoffDay2"
							name="cutoffDay2"
							type="number"
							min="1"
							max="31"
							bind:value={cutoffDay2}
							class="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						/>
						<p class="text-xs text-muted-foreground">Day of month for second payroll cutoff</p>
					</div>
				</div>
			</div>
		{/if}

		<div class="flex justify-end pt-2">
			<button
				type="submit"
				disabled={saveConfig.busy}
				class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
			>
				{saveConfig.busy ? 'Saving…' : 'Save Configuration'}
			</button>
		</div>
	</form>

	<!-- Premium pay multipliers (PayRateRule) -->
	<form
		method="POST"
		action="?/updateRates"
		use:enhance={saveRates.enhance}
		bind:this={ratesFormEl}
		class="rounded-md border bg-card p-6 space-y-6"
	>
		<div>
			<h2 class="text-lg font-semibold">Premium Pay Multipliers</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				Applied against the base hourly rate when payroll auto-computes OT, night differential,
				rest-day, and holiday pay. Night differential is an additive fraction (e.g. 0.10 = +10%);
				the others are full multipliers (e.g. 2.00 = 200%). Defaults follow DOLE rules.
			</p>
		</div>

		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each rateFields as f (f.name)}
				<div>
					<label for="rate-{f.name}" class="text-sm font-medium">{f.label}</label>
					<input
						id="rate-{f.name}"
						name={f.name}
						type="number"
						min="0"
						max="10"
						step="0.01"
						required
						bind:value={rateValues[f.name]}
						class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
					<p class="mt-1 text-xs text-muted-foreground">{f.hint}</p>
				</div>
			{/each}
		</div>

		<div class="flex justify-end">
			<button
				type="button"
				onclick={submitRates}
				disabled={saveRates.busy}
				class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
			>
				{saveRates.busy ? 'Saving…' : 'Save Multipliers'}
			</button>
		</div>
	</form>
</div>

<ConfirmDialog
	bind:open={ratesConfirm}
	title="Save premium pay multipliers?"
	message={ratesMessage}
	confirmText="Save multipliers"
	onconfirm={() => ratesFormEl?.requestSubmit()}
/>
