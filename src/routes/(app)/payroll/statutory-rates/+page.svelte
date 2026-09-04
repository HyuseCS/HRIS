<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	const saveGuard = createSubmitGuard()
	let formEl = $state<HTMLFormElement>()
	let confirmOpen = $state(false)

	// Prefill from the live authoritative config (#220). Rate fields are percentages in the UI.
	// Round the ×100 to kill float noise (0.3 * 100 === 30.000000000000004); clean values round-trip.
	const toPct = (d: number) => Math.round(d * 1e6) / 1e4
	// svelte-ignore state_referenced_locally
	const live = data.live
	let philhealthRate = $state(toPct(live.philhealthRate))
	let philhealthFloor = $state(live.philhealthFloor)
	let philhealthCeiling = $state(live.philhealthCeiling)
	let pagibigRate = $state(toPct(live.pagibigRate))
	let pagibigCap = $state(live.pagibigCap)

	type SssRow = {
		salaryFloor: number | null
		salaryCeiling: number | null
		totalContribution: number | null
		eeShare: number | null
		erShare: number | null
	}
	type TaxRow = {
		floor: number | null
		ceiling: number | null
		baseTax: number | null
		rate: number | null
		excessOver: number | null
	}
	let sssRows = $state<SssRow[]>(structuredClone(live.sssBrackets as SssRow[]))
	// Rate is shown/entered as a percentage in the UI (0.25 → 25); the server converts back on save.
	let taxRows = $state<TaxRow[]>(
		(live.taxBrackets as TaxRow[]).map((r) => ({
			...r,
			rate: r.rate == null ? null : toPct(r.rate)
		}))
	)

	const num = (v: number | null) => (v == null ? 0 : Number(v))
	const nullable = (v: number | null) => (v == null ? null : Number(v))
	// Read-only previews of the columns the server derives on save (SSS total = ee+er; tax baseTax
	// accumulates across brackets, excessOver = floor). Shown for transparency, never submitted.
	const peso = (v: number) => Math.round(v * 100) / 100
	const sssTotal = (r: SssRow) => peso(num(r.eeShare) + num(r.erShare))
	const taxDerived = $derived.by(() => {
		let baseTax = 0
		return taxRows.map((r, i) => {
			const floor = num(r.floor)
			if (i > 0) baseTax += (floor - num(taxRows[i - 1].floor)) * (num(taxRows[i - 1].rate) / 100)
			return { baseTax: peso(baseTax), excessOver: floor }
		})
	})
	// Only ranges + rates are sent; the server derives the read-only columns. The last bracket is
	// open-ended (null ceiling); the resolver revives that to Infinity.
	const sssPayload = $derived(
		JSON.stringify(
			sssRows.map((r, i) => ({
				salaryFloor: num(r.salaryFloor),
				salaryCeiling: i === sssRows.length - 1 ? nullable(r.salaryCeiling) : num(r.salaryCeiling),
				eeShare: num(r.eeShare),
				erShare: num(r.erShare)
			}))
		)
	)
	const taxPayload = $derived(
		JSON.stringify(
			taxRows.map((r, i) => ({
				floor: num(r.floor),
				ceiling: i === taxRows.length - 1 ? nullable(r.ceiling) : num(r.ceiling),
				rate: num(r.rate)
			}))
		)
	)

	const addSssRow = () =>
		(sssRows = [
			...sssRows,
			{
				salaryFloor: null,
				salaryCeiling: null,
				totalContribution: null,
				eeShare: null,
				erShare: null
			}
		])
	const addTaxRow = () =>
		(taxRows = [
			...taxRows,
			{ floor: null, ceiling: null, baseTax: null, rate: null, excessOver: null }
		])
	const removeSssRow = (i: number) => (sssRows = sssRows.filter((_, idx) => idx !== i))
	const removeTaxRow = (i: number) => (taxRows = taxRows.filter((_, idx) => idx !== i))

	const cell =
		'h-8 w-full rounded border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
	// Read-only derived columns: same box as an input, but muted + non-interactive so it reads as a
	// disabled field, not floating text.
	const roCell =
		'flex h-8 w-full cursor-not-allowed items-center rounded border border-input bg-background px-2 text-sm text-muted-foreground'
	const scalarInput =
		'flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

	// Direct save (managers) opens the confirm dialog; the proposer path submits straight away.
	// Capability is fixed for the page's lifetime, so the initial value is exactly what we want.
	// svelte-ignore state_referenced_locally
	const saveAction = data.canManage ? '?/saveStatutoryRates' : '?/proposeStatutoryRates'

	// Card selector: one service open at a time. All fields submit via the root hidden inputs, so an
	// inactive (unmounted) panel never drops data — visibility and submission are fully decoupled.
	// Card descriptions reflect the live values loaded for this org (#220), not hardcoded rates.
	const k = (v: number) => (v % 1000 === 0 ? `₱${v / 1000}k` : `₱${v.toLocaleString('en-PH')}`)
	const tabs = [
		{ key: 'sss', name: 'SSS', desc: 'Social Security — bracketed peso amounts' },
		{
			key: 'philhealth',
			name: 'PhilHealth',
			desc: `${toPct(live.philhealthRate)}% of salary, ${k(live.philhealthFloor)}–${k(live.philhealthCeiling)} band`
		},
		{
			key: 'pagibig',
			name: 'Pag-IBIG',
			desc: `${toPct(live.pagibigRate)}% of salary, capped ₱${live.pagibigCap.toLocaleString('en-PH')}`
		},
		{ key: 'bir', name: 'BIR Withholding Tax', desc: 'Marginal income-tax brackets' }
	] as const
	let active = $state<(typeof tabs)[number]['key']>('sss')

	// Roving-tabindex keyboard nav for the WAI-ARIA tablist (arrows move + activate, Home/End jump).
	const focusTab = (key: string) => document.getElementById(`tab-${key}`)?.focus()
	function onTabKeydown(e: KeyboardEvent, i: number) {
		const step =
			e.key === 'ArrowRight' || e.key === 'ArrowDown'
				? 1
				: e.key === 'ArrowLeft' || e.key === 'ArrowUp'
					? -1
					: 0
		let next = i
		if (step) next = (i + step + tabs.length) % tabs.length
		else if (e.key === 'Home') next = 0
		else if (e.key === 'End') next = tabs.length - 1
		else return
		e.preventDefault()
		active = tabs[next].key
		focusTab(active)
	}
</script>

<svelte:head>
	<title>Statutory Rates — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<!-- The description branches on capability, which PageHeader's string `description` cannot
	     express, so it stays its own paragraph directly under the title. -->
	<PageHeader title="Statutory Rates" />
	<p class="-mt-4 max-w-2xl text-sm text-muted-foreground">
		The SSS, PhilHealth, Pag-IBIG, and BIR withholding-tax figures the payroll engine computes with.
		These are authoritative — changes take effect on the next payroll computation (approved runs
		stay frozen).
		{#if data.canManage}
			You can edit and apply these directly.
		{:else}
			Your changes are submitted for CEO approval before they take effect.
		{/if}
	</p>

	{#if form?.success}
		<Banner kind="success" message={form.success} />
	{/if}
	{#if form?.error}
		<div
			class="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
		>
			{form.error}
		</div>
	{/if}

	<!-- Pending proposals (confirmers only) -->
	{#if data.canManage && data.pending.length > 0}
		<div class="rounded-md border bg-card p-6 space-y-4">
			<h2 class="text-lg font-semibold">Pending proposals</h2>
			<div class="space-y-3">
				{#each data.pending as p (p.id)}
					<div class="rounded-md border bg-muted/30 p-4">
						<div class="flex items-start justify-between gap-4">
							<div class="text-sm">
								<p class="font-medium">Proposed by {p.proposer}</p>
								<p class="text-xs text-muted-foreground">
									{new Date(p.createdAt).toLocaleString()}
								</p>
								<ul class="mt-2 list-disc space-y-0.5 pl-5 text-muted-foreground">
									{#each p.changes as c (c)}
										<li>{c}</li>
									{/each}
								</ul>
							</div>
							<div class="flex shrink-0 gap-2">
								<form method="POST" action="?/confirmProposal" use:enhance>
									<input type="hidden" name="proposalId" value={p.id} />
									<button
										type="submit"
										class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
										>Confirm</button
									>
								</form>
								<form method="POST" action="?/rejectProposal" use:enhance>
									<input type="hidden" name="proposalId" value={p.id} />
									<button
										type="submit"
										class="rounded-md border px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10"
										>Reject</button
									>
								</form>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Rate editor -->
	<form
		bind:this={formEl}
		method="POST"
		action={saveAction}
		use:enhance={saveGuard.enhance}
		class="space-y-5"
	>
		<!-- Service selector: one card per statutory service; the active one's details show below. -->
		<div
			role="tablist"
			aria-label="Statutory service"
			class="grid grid-cols-2 gap-3 sm:grid-cols-4"
		>
			{#each tabs as t, i (t.key)}
				<button
					type="button"
					role="tab"
					id="tab-{t.key}"
					aria-selected={active === t.key}
					aria-controls="statutory-panel"
					tabindex={active === t.key ? 0 : -1}
					onclick={() => (active = t.key)}
					onkeydown={(e) => onTabKeydown(e, i)}
					class="flex flex-col gap-1.5 rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {active ===
					t.key
						? 'border-primary bg-primary/5'
						: 'border-border bg-card hover:border-foreground/20 hover:bg-muted/40'}"
				>
					<span class="flex items-center gap-2">
						<span
							class="h-2 w-2 shrink-0 rounded-full {active === t.key
								? 'bg-primary'
								: 'bg-muted-foreground/30'}"
						></span>
						<span
							class="text-sm font-semibold {active === t.key
								? 'text-foreground'
								: 'text-foreground/80'}">{t.name}</span
						>
					</span>
					<span class="text-xs text-muted-foreground">{t.desc}</span>
				</button>
			{/each}
		</div>

		<!-- Active service panel. Keyed so it crossfades on switch; reduced-motion users get it flat. -->
		{#key active}
			<div
				id="statutory-panel"
				role="tabpanel"
				aria-labelledby="tab-{active}"
				tabindex="0"
				class="statutory-panel rounded-lg border bg-card p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				{#if active === 'sss'}
					<div class="space-y-3">
						<div>
							<h2 class="text-base font-semibold">Social Security System</h2>
							<p class="mt-0.5 text-sm text-muted-foreground">
								A published bracket table of fixed peso amounts — one EE and ER share per salary
								band. The total is derived from EE + ER on save.
							</p>
						</div>
						<div class="overflow-x-auto">
							<table class="w-full text-sm">
								<thead>
									<tr class="text-left text-xs text-muted-foreground">
										<th class="p-1 font-medium">Salary floor</th>
										<th class="p-1 font-medium">Salary ceiling</th>
										<th class="p-1 font-medium">Total (auto)</th>
										<th class="p-1 font-medium">EE share</th>
										<th class="p-1 font-medium">ER share</th>
										<th class="p-1"></th>
									</tr>
								</thead>
								<tbody>
									{#each sssRows as row, i (i)}
										<tr>
											<td class="p-1"
												><input
													type="number"
													step="0.01"
													bind:value={row.salaryFloor}
													class={cell}
												/></td
											>
											<td class="p-1">
												<input
													type="number"
													step="0.01"
													bind:value={row.salaryCeiling}
													placeholder={i === sssRows.length - 1 ? '∞ (open-ended)' : ''}
													class={cell}
												/>
											</td>
											<td class="p-1"><div class={roCell}>{sssTotal(row)}</div></td>
											<td class="p-1"
												><input
													type="number"
													step="0.01"
													bind:value={row.eeShare}
													class={cell}
												/></td
											>
											<td class="p-1"
												><input
													type="number"
													step="0.01"
													bind:value={row.erShare}
													class={cell}
												/></td
											>
											<td class="p-1">
												<button
													type="button"
													onclick={() => removeSssRow(i)}
													class="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
													>Remove</button
												>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						<button
							type="button"
							onclick={addSssRow}
							class="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
							>+ Add row</button
						>
						<p class="text-xs text-muted-foreground">
							Rows must be sorted ascending, non-overlapping, start at 0, and the last ceiling left
							blank (open-ended). Total is derived from EE + ER shares on save.
						</p>
					</div>
				{:else if active === 'philhealth'}
					<div class="space-y-3">
						<div>
							<h2 class="text-base font-semibold">PhilHealth</h2>
							<p class="mt-0.5 text-sm text-muted-foreground">
								A flat percentage of monthly salary, clamped between the floor and ceiling, then
								split evenly between employee and employer.
							</p>
						</div>
						<div class="grid gap-4 sm:max-w-2xl sm:grid-cols-3">
							<div class="space-y-1">
								<label class="text-sm font-medium" for="stat-ph-rate">Rate (%)</label>
								<input
									id="stat-ph-rate"
									type="number"
									min="0"
									max="100"
									step="0.01"
									bind:value={philhealthRate}
									class={scalarInput}
								/>
							</div>
							<div class="space-y-1">
								<label class="text-sm font-medium" for="stat-ph-floor">Salary floor (₱)</label>
								<input
									id="stat-ph-floor"
									type="number"
									min="0"
									step="0.01"
									bind:value={philhealthFloor}
									class={scalarInput}
								/>
							</div>
							<div class="space-y-1">
								<label class="text-sm font-medium" for="stat-ph-ceil">Salary ceiling (₱)</label>
								<input
									id="stat-ph-ceil"
									type="number"
									min="0"
									step="0.01"
									bind:value={philhealthCeiling}
									class={scalarInput}
								/>
							</div>
						</div>
					</div>
				{:else if active === 'pagibig'}
					<div class="space-y-3">
						<div>
							<h2 class="text-base font-semibold">Pag-IBIG</h2>
							<p class="mt-0.5 text-sm text-muted-foreground">
								A flat percentage of monthly salary for each of the employee and employer, capped at
								the maximum share (₱200 = 2% of the ₱10,000 ceiling).
							</p>
						</div>
						<div class="grid gap-4 sm:max-w-md sm:grid-cols-2">
							<div class="space-y-1">
								<label class="text-sm font-medium" for="stat-pi-rate">Rate (%)</label>
								<input
									id="stat-pi-rate"
									type="number"
									min="0"
									max="100"
									step="0.01"
									bind:value={pagibigRate}
									class={scalarInput}
								/>
							</div>
							<div class="space-y-1">
								<label class="text-sm font-medium" for="stat-pi-cap">Share cap (₱)</label>
								<input
									id="stat-pi-cap"
									type="number"
									min="0"
									step="0.01"
									bind:value={pagibigCap}
									class={scalarInput}
								/>
							</div>
						</div>
					</div>
				{:else if active === 'bir'}
					<div class="space-y-3">
						<div>
							<h2 class="text-base font-semibold">BIR Withholding Tax</h2>
							<p class="mt-0.5 text-sm text-muted-foreground">
								Marginal income-tax brackets. Base tax and excess-over are derived from the ranges
								and rates on save.
							</p>
						</div>
						<div class="overflow-x-auto">
							<table class="w-full text-sm">
								<thead>
									<tr class="text-left text-xs text-muted-foreground">
										<th class="p-1 font-medium">Income floor</th>
										<th class="p-1 font-medium">Income ceiling</th>
										<th class="p-1 font-medium">Base tax (auto)</th>
										<th class="p-1 font-medium">Rate (%)</th>
										<th class="p-1 font-medium">Excess over (auto)</th>
										<th class="p-1"></th>
									</tr>
								</thead>
								<tbody>
									{#each taxRows as row, i (i)}
										<tr>
											<td class="p-1"
												><input type="number" step="0.01" bind:value={row.floor} class={cell} /></td
											>
											<td class="p-1">
												<input
													type="number"
													step="0.01"
													bind:value={row.ceiling}
													placeholder={i === taxRows.length - 1 ? '∞ (open-ended)' : ''}
													class={cell}
												/>
											</td>
											<td class="p-1"><div class={roCell}>{taxDerived[i].baseTax}</div></td>
											<td class="p-1"
												><input
													type="number"
													step="0.01"
													min="0"
													max="100"
													bind:value={row.rate}
													class={cell}
												/></td
											>
											<td class="p-1"><div class={roCell}>{taxDerived[i].excessOver}</div></td>
											<td class="p-1">
												<button
													type="button"
													onclick={() => removeTaxRow(i)}
													class="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
													>Remove</button
												>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						<button
							type="button"
							onclick={addTaxRow}
							class="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
							>+ Add row</button
						>
						<p class="text-xs text-muted-foreground">
							The first row's ceiling is the tax-exempt threshold (rate 0). Rows sorted ascending,
							non-overlapping, start at 0, last ceiling blank; rate is a percentage (20 = 20%).
						</p>
					</div>
				{/if}
			</div>
		{/key}

		<!-- Every field submits here, always in the DOM regardless of which panel is open. -->
		<input type="hidden" name="philhealthRate" value={philhealthRate} />
		<input type="hidden" name="philhealthFloor" value={philhealthFloor} />
		<input type="hidden" name="philhealthCeiling" value={philhealthCeiling} />
		<input type="hidden" name="pagibigRate" value={pagibigRate} />
		<input type="hidden" name="pagibigCap" value={pagibigCap} />
		<input type="hidden" name="sssBrackets" value={sssPayload} />
		<input type="hidden" name="taxBrackets" value={taxPayload} />

		<div class="flex justify-end">
			{#if data.canManage}
				<button
					type="button"
					disabled={saveGuard.busy}
					onclick={() => (confirmOpen = true)}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
				>
					{saveGuard.busy ? 'Saving…' : 'Save changes'}
				</button>
			{:else}
				<button
					type="submit"
					disabled={saveGuard.busy}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
				>
					{saveGuard.busy ? 'Submitting…' : 'Submit for CEO approval'}
				</button>
			{/if}
		</div>
	</form>
</div>

<ConfirmDialog
	bind:open={confirmOpen}
	title="Apply statutory rates?"
	message="These rates feed the payroll tax computation for all future runs. Apply them now?"
	confirmText="Apply"
	onconfirm={() => formEl?.requestSubmit()}
/>

<style>
	/* The active panel fades in on each switch; motion-sensitive users get it instantly. */
	@media (prefers-reduced-motion: no-preference) {
		.statutory-panel {
			animation: panel-in 200ms cubic-bezier(0.22, 1, 0.36, 1);
		}
	}
	@keyframes panel-in {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
