<script lang="ts">
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import DatePicker from '$lib/components/ui/DatePicker.svelte'
	import Field from '$lib/components/ui/Field.svelte'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
	import {
		rateBasisOptionsFor,
		rateBasisCopy,
		isRateBasisAllowed,
		type RateBasis
	} from '$lib/utils/rate-basis'
	import { EMPLOYMENT_TYPE_OPTIONS } from '$lib/utils/employment-type'
	import type { EmployeeDetailData, EmployeeDetailForm, Revealed } from './shared'

	let {
		data,
		form,
		revealed,
		todayInput,
		hireInput
	}: {
		data: EmployeeDetailData
		form: EmployeeDetailForm
		revealed: Revealed
		todayInput: string
		hireInput: string
	} = $props()

	const employee = $derived(data.employee)

	// #222: the promote form carries its own type/basis pair, because a promotion is exactly where the
	// #189 pairing breaks (a PART_TIME hourly crew member made REGULAR). The dropdown follows the type
	// picked here, not the saved one, and an now-invalid basis resets — the same guard the create form
	// applies, and the server validates the resulting pair regardless.
	// svelte-ignore state_referenced_locally
	let promoType = $state<string>(employee.employmentType)
	// svelte-ignore state_referenced_locally
	let promoRateType = $state<RateBasis>(employee.rateType as RateBasis)
	const promoRateOptions = $derived(rateBasisOptionsFor(promoType))
	const promoRate = $derived(rateBasisCopy(promoRateType))
	$effect(() => {
		if (!isRateBasisAllowed(promoRateType, promoType)) promoRateType = 'MONTHLY'
	})
	const promote = submitFeedback({ error: null })
</script>

<form
	id="promote"
	method="POST"
	action="?/promote"
	use:enhance={promote.enhance}
	class="rounded-lg border bg-card p-6 space-y-4 lg:col-span-2"
>
	<h2 class="font-semibold">
		Promote
		<span class="text-xs font-normal text-muted-foreground"
			>(one audited event — leave anything unchanged blank)</span
		>
	</h2>
	<p class="text-sm text-muted-foreground">
		Records a dated position or title change, with an optional pay change in the same event. Use
		<a href="?tab=compensation#change-salary" class="text-primary hover:underline">Change Salary</a>
		if only the pay is changing.
	</p>
	{#if form?.action === 'promote' && form?.notice}
		<Banner kind="warning" message={form.notice} />
	{:else if form?.action === 'promote' && form?.success}
		<Banner kind="success" message="Promotion recorded." />
	{:else if form?.action === 'promote' && form?.error}
		<div
			class="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-red-400"
		>
			{form.error}
		</div>
	{/if}
	<div class="grid gap-3 sm:grid-cols-3">
		<Field label="Effective Date" id="promoEffectiveDate">
			{#snippet children(a)}
				<DatePicker
					{...a}
					id="promoEffectiveDate"
					name="effectiveDate"
					required
					value={todayInput}
					min={hireInput}
					class="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			{/snippet}
		</Field>
		<Field label="Position" id="promoPosition">
			{#snippet children(a)}
				<select
					{...a}
					id="promoPosition"
					name="positionId"
					class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<option value="">— unchanged —</option>
					{#each data.positions as p (p.id)}
						<option value={p.id} selected={employee.positionId === p.id}>{p.title}</option>
					{/each}
				</select>
			{/snippet}
		</Field>
		<Field label="Job Title" id="promoJobTitle">
			{#snippet children(a)}
				<input
					{...a}
					id="promoJobTitle"
					name="jobTitle"
					value={employee.jobTitle}
					class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			{/snippet}
		</Field>
		<Field label="Employment Type" id="promoType">
			{#snippet children(a)}
				<select
					{...a}
					id="promoType"
					name="employmentType"
					bind:value={promoType}
					class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{#each EMPLOYMENT_TYPE_OPTIONS as [val, label] (val)}
						<option value={val}>{label}</option>
					{/each}
				</select>
			{/snippet}
		</Field>
		<Field label="Rate Basis" id="promoRateType">
			{#snippet children(a)}
				<select
					{...a}
					id="promoRateType"
					name="rateType"
					bind:value={promoRateType}
					class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{#each promoRateOptions as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			{/snippet}
		</Field>
		<Field
			label={promoRate.label}
			id="promoSalary"
			hint="Masked; reveal above to edit, or leave blank to keep the current amount."
		>
			{#snippet children(a)}
				<input
					{...a}
					id="promoSalary"
					name="basicMonthlySalary"
					type="number"
					step={promoRate.step}
					min="0"
					value={revealed?.basicMonthlySalary ?? ''}
					placeholder={String(employee.basicMonthlySalary ?? '')}
					class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			{/snippet}
		</Field>
		<Field label="Reports To" id="promoReportsTo">
			{#snippet children(a)}
				<select
					{...a}
					id="promoReportsTo"
					name="reportsToId"
					class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<option value="">— unchanged —</option>
					{#each data.supervisorOptions as s (s.id)}
						<option value={s.id} selected={employee.reportsToId === s.id}
							>{s.lastName}, {s.firstName}</option
						>
					{/each}
				</select>
			{/snippet}
		</Field>
		<Field label="Note" id="promoNote" class="sm:col-span-2">
			{#snippet suffix()}<span class="text-muted-foreground">(optional)</span>{/snippet}
			{#snippet children(a)}
				<input
					{...a}
					id="promoNote"
					name="note"
					maxlength="500"
					placeholder="e.g. Promoted to Shift Lead"
					class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			{/snippet}
		</Field>
	</div>
	<button
		type="submit"
		disabled={promote.busy}
		class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
		>{promote.busy ? 'Recording…' : 'Record promotion'}</button
	>
</form>
