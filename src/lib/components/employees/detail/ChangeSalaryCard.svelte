<script lang="ts">
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import DatePicker from '$lib/components/ui/DatePicker.svelte'
	import Field from '$lib/components/ui/Field.svelte'
	import { scrollToError } from '$lib/actions/scrollToError'
	import { autoDismiss } from '$lib/actions/autoDismiss'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
	import { rateBasisOptionsFor, rateBasisCopy, type RateBasis } from '$lib/utils/rate-basis'
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

	// #170: the mid-period change form has its own rate-basis state so its amount label follows the
	// selected basis and its dropdown offers only bases valid for this employment type (like create).
	// Initialized from the saved basis; NOT re-synced from `employee` (the [id] route remounts per
	// employee), so a later reprop — e.g. after a salary reveal — can't discard an in-progress pick.
	// svelte-ignore state_referenced_locally
	let compRateType = $state<RateBasis>(employee.rateType as RateBasis)
	const compRate = $derived(rateBasisCopy(compRateType))
	const compRateOptions = $derived(rateBasisOptionsFor(employee.employmentType))
	const changeCompensation = submitFeedback({ error: null })
</script>

<form
	id="change-salary"
	method="POST"
	action="?/changeCompensation"
	use:enhance={changeCompensation.enhance}
	class="rounded-lg border bg-card p-6 space-y-4 lg:col-span-2"
>
	<h2 class="font-semibold">
		Change Salary / Pay Type
		<span class="text-xs font-normal text-muted-foreground"
			>(records an effective-dated change; payroll splits a run that straddles it)</span
		>
	</h2>
	<p class="text-sm text-muted-foreground">
		Records a dated pay change in the employment history. Use
		<a href="?tab=compensation#promote" class="text-primary hover:underline">Promote</a>
		if the job title or position is also changing.
	</p>
	{#if form?.action === 'changeCompensation' && form?.notice}
		<Banner kind="warning" message={form.notice} />
	{:else if form?.action === 'changeCompensation' && form?.success}
		<Banner kind="success" message="Saved." autoDismiss />
	{:else if form?.action === 'changeCompensation' && form?.error}
		<div
			use:autoDismiss
			use:scrollToError
			role="alert"
			class="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
		>
			{form.error}
		</div>
	{/if}
	<div class="grid gap-3 sm:grid-cols-3">
		<Field
			label="Effective Date"
			id="effectiveDate"
			hint="When it takes effect. Backdating and future-dating are both allowed."
		>
			{#snippet children(a)}
				<DatePicker
					{...a}
					id="effectiveDate"
					name="effectiveDate"
					required
					value={todayInput}
					min={hireInput}
					class="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			{/snippet}
		</Field>
		<Field label="Rate Basis" id="compRateType">
			{#snippet children(a)}
				<select
					{...a}
					id="compRateType"
					name="rateType"
					bind:value={compRateType}
					class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					{#each compRateOptions as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			{/snippet}
		</Field>
		<Field
			label={compRate.label}
			id="compSalary"
			hint="Masked; reveal above to edit, or leave blank to keep the current amount."
		>
			{#snippet children(a)}
				<input
					{...a}
					id="compSalary"
					name="basicMonthlySalary"
					type="number"
					step={compRate.step}
					min="0"
					value={revealed?.basicMonthlySalary ?? ''}
					placeholder={String(employee.basicMonthlySalary ?? '')}
					class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			{/snippet}
		</Field>
		<Field label="Note" id="compNote" class="sm:col-span-3">
			{#snippet suffix()}<span class="text-muted-foreground">(optional)</span>{/snippet}
			{#snippet children(a)}
				<input
					{...a}
					id="compNote"
					name="note"
					maxlength="500"
					placeholder="e.g. Annual merit increase"
					class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			{/snippet}
		</Field>
	</div>
	<button
		type="submit"
		disabled={changeCompensation.busy}
		class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
		>{changeCompensation.busy ? 'Recording…' : 'Record change'}</button
	>
</form>
