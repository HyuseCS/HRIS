<script lang="ts">
	import { enhance } from '$app/forms'
	import { formatCurrency, formatShortDate } from '$lib/utils/format'
	import { tenureLabel } from '$lib/utils/dates'
	import { rateBasisCopy, type RateBasis } from '$lib/utils/rate-basis'
	import { labelFor, EMPLOYMENT_TYPE_LABELS } from '$lib/labels'
	import type { EmployeeDetailData, FeedbackGuard, Revealed } from './shared'

	let {
		data,
		revealed,
		reveal
	}: { data: EmployeeDetailData; revealed: Revealed; reveal: FeedbackGuard } = $props()

	const employee = $derived(data.employee)
	const canManage = $derived(data.canManage)

	// #170: pay is edited only through the dated "Change Salary / Pay Type" form below — the quick-edit
	// form no longer writes salary/rateType. This read-only display follows the SAVED basis.
	const savedRate = $derived(rateBasisCopy(employee.rateType as RateBasis))

	// Salary-band check: employee inherits their grade via their position (T163).
	// Grades are monthly bands (#120), so an hourly rate must not be scored against them.
	const grade = $derived(employee.position?.salaryGrade ?? null)
	const band = $derived.by(() => {
		if (employee.rateType !== 'MONTHLY') return null
		// Salary is masked until the audited reveal — the band can only be scored on the real figure.
		if (!grade || revealed?.basicMonthlySalary == null) return null
		const s = Number(revealed.basicMonthlySalary),
			min = Number(grade.minSalary),
			max = Number(grade.maxSalary)
		return { status: s < min ? 'below' : s > max ? 'above' : 'within', min, max, name: grade.name }
	})
</script>

<div class="rounded-lg border bg-card p-6 space-y-4">
	<h2 class="font-semibold">Profile</h2>
	<dl class="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
		<dt class="text-muted-foreground">Employee No.</dt>
		<dd class="font-medium">{employee.employeeNumber}</dd>
		<dt class="text-muted-foreground">Email</dt>
		<dd>{employee.user.email}</dd>
		<dt class="text-muted-foreground">Department</dt>
		<dd>{employee.department.name}</dd>
		<dt class="text-muted-foreground">Job Title</dt>
		<dd>{employee.jobTitle}</dd>
		<dt class="text-muted-foreground">Employment Type</dt>
		<dd>{labelFor(EMPLOYMENT_TYPE_LABELS, employee.employmentType)}</dd>
		<dt class="text-muted-foreground">Start Date</dt>
		<dd>{formatShortDate(employee.startDate)}</dd>
		<dt class="text-muted-foreground">Tenure</dt>
		<dd>{tenureLabel(employee.startDate, employee.endDate ?? undefined)}</dd>
		{#if canManage}
			<dt class="text-muted-foreground">Basic Salary</dt>
			<dd class="font-medium">
				{#if revealed?.basicMonthlySalary != null}
					{formatCurrency(Number(revealed.basicMonthlySalary))}{savedRate.suffix}
				{:else}
					{employee.basicMonthlySalary ?? '—'}
					{#if data.canReveal}
						<form method="POST" action="?/reveal" use:enhance={reveal.enhance} class="inline">
							<button
								type="submit"
								disabled={reveal.busy}
								class="ml-1 text-xs font-normal text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
								title="Revealing sensitive fields is recorded in the audit log"
								>{reveal.busy ? 'Revealing…' : 'Reveal'}</button
							>
						</form>
					{/if}
				{/if}
				{#if band}
					{#if band.status === 'within'}
						<span
							class="ml-1 rounded-full bg-green-500/15 px-1.5 py-0.5 text-xs font-normal text-green-700 dark:text-green-400"
							title="Within the {band.name} band">✓ {grade?.name}</span
						>
					{:else}
						<span
							class="ml-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-xs font-normal text-amber-700 dark:text-amber-400"
							title="{band.name}: {formatCurrency(band.min)}–{formatCurrency(band.max)}"
						>
							⚠ {band.status === 'below' ? 'Below' : 'Above'}
							{grade?.name} band
						</span>
					{/if}
				{/if}
			</dd>
		{/if}
		<dt class="text-muted-foreground">Role</dt>
		<dd>{employee.user.roles.join(', ')}</dd>
	</dl>
</div>
