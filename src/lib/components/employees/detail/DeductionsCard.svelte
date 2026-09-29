<script lang="ts">
	import type { Snippet } from 'svelte'
	import { enhance } from '$app/forms'
	import Field from '$lib/components/ui/Field.svelte'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
	import { formatCurrency } from '$lib/utils/format'
	import Badge from '$lib/components/ui/Badge.svelte'
	import type { EmployeeDetailData } from './shared'

	let { data, actionError }: { data: EmployeeDetailData; actionError: Snippet<[string[]]> } =
		$props()

	const endDeduction = submitFeedback({ error: null })
	const addDeduction = submitFeedback({ error: null })
	const toggleStatutory = submitFeedback({ error: null })
	const toggleErExternal = submitFeedback({ error: null })
	const setAllocation = submitFeedback({ error: null })

	const STATUTORY_LABELS: Record<string, string> = {
		SSS: 'SSS',
		PHILHEALTH: 'PhilHealth',
		PAGIBIG: 'Pag-IBIG'
	}
</script>

<section class="rounded-lg border bg-card p-6 space-y-4 lg:col-span-2">
	<h2 class="font-semibold">Recurring Deductions</h2>
	{@render actionError([
		'addDeduction',
		'endDeduction',
		'toggleStatutoryExemption',
		'toggleEmployerShareExternal',
		'setStatutoryAllocation'
	])}

	<div class="space-y-2">
		<h3 class="text-sm font-medium">Statutory contributions</h3>
		<p class="text-xs text-muted-foreground">
			SSS, PhilHealth, and Pag-IBIG are computed automatically from the salary. Remove an employee
			who is not enrolled — both the employee and employer share are zeroed; Restore re-enrolls
			them. Withholding tax is always computed.
		</p>
		<table class="w-full text-sm">
			<tbody class="divide-y">
				{#each data.statutoryConfig as s (s.contribution)}
					<tr>
						<td class="py-1.5">{STATUTORY_LABELS[s.contribution] ?? s.contribution}</td>
						<td class="py-1.5 text-right font-mono">
							{#if s.exempt}
								<span class="text-muted-foreground">Exempt</span>
							{:else}
								{formatCurrency(s.monthlyEe)}<span class="ml-1 text-xs text-muted-foreground"
									>/mo</span
								>
								{#if s.employerSharePaidExternally}
									<span class="block text-xs font-sans text-muted-foreground"
										>Employer share paid externally</span
									>
								{/if}
							{/if}
						</td>
						<td class="py-1.5 text-right">
							<div class="flex flex-col items-end gap-1">
								<form
									method="POST"
									action="?/toggleStatutoryExemption"
									use:enhance={toggleStatutory.enhance}
								>
									<input type="hidden" name="contribution" value={s.contribution} />
									<input type="hidden" name="exempt" value={s.exempt ? 'false' : 'true'} />
									{#if s.exempt}
										<button
											type="submit"
											disabled={toggleStatutory.busy}
											class="rounded-md border border-primary/20 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-50"
											>{toggleStatutory.busy ? 'Saving…' : 'Restore'}</button
										>
									{:else}
										<button
											type="submit"
											disabled={toggleStatutory.busy}
											class="rounded-md border border-red-500/20 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:pointer-events-none disabled:opacity-50"
											>{toggleStatutory.busy ? 'Saving…' : 'Remove'}</button
										>
									{/if}
								</form>
								<!-- EE-share cutoff allocation (#173, Feature E). Moot while exempt (EE already
							     zeroed), so hidden then. Auto-submits on change. -->
								{#if !s.exempt}
									<form
										method="POST"
										action="?/setStatutoryAllocation"
										use:enhance={setAllocation.enhance}
									>
										<input type="hidden" name="contribution" value={s.contribution} />
										<select
											name="allocation"
											value={s.allocation}
											disabled={setAllocation.busy}
											onchange={(e) => e.currentTarget.form?.requestSubmit()}
											class="h-7 rounded-md border border-input bg-background px-2 text-xs disabled:pointer-events-none disabled:opacity-50"
											aria-label="Employee-share cutoff"
										>
											<option value="EVEN">Even split</option>
											<option value="FIRST">1st cutoff</option>
											<option value="SECOND">2nd cutoff</option>
										</select>
									</form>
								{/if}
								<!-- Employer-share-paid-externally control (#173). Meaningless while exempt (both
							     shares already zeroed), so hidden then. -->
								{#if !s.exempt}
									<form
										method="POST"
										action="?/toggleEmployerShareExternal"
										use:enhance={toggleErExternal.enhance}
									>
										<input type="hidden" name="contribution" value={s.contribution} />
										<input
											type="hidden"
											name="external"
											value={s.employerSharePaidExternally ? 'false' : 'true'}
										/>
										<button
											type="submit"
											disabled={toggleErExternal.busy}
											class="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
											>{toggleErExternal.busy
												? 'Saving…'
												: s.employerSharePaidExternally
													? 'Restore employer share'
													: 'Employer share paid externally'}</button
										>
									</form>
								{/if}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<h3 class="text-sm font-medium">Custom deductions</h3>
	<p class="text-xs text-muted-foreground">
		Monthly amounts against a deduction code from Payroll &rarr; Earnings &amp; Deductions, prorated
		to each payroll period and taken before loan/cash-advance installments. Ended items stop from
		the next payroll run.
	</p>
	{#if data.recurringDeductions.length}
		<div class="card-scroll">
			<table class="w-full text-sm">
				<tbody class="divide-y">
					{#each data.recurringDeductions as d (d.id)}
						<tr>
							<td class="py-1.5">{d.label ?? d.deductionType.label}</td>
							<td class="py-1.5 text-muted-foreground">{d.deductionType.code}</td>
							<td class="py-1.5 text-right font-mono"
								>{formatCurrency(Number(d.monthlyAmount))}<span
									class="ml-1 text-xs text-muted-foreground">/mo</span
								></td
							>
							<td class="py-1.5 text-right">
								{#if d.isActive}
									<form method="POST" action="?/endDeduction" use:enhance={endDeduction.enhance}>
										<input type="hidden" name="id" value={d.id} />
										<button
											type="submit"
											disabled={endDeduction.busy}
											class="rounded-md border border-red-500/20 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:pointer-events-none disabled:opacity-50"
											>{endDeduction.busy ? 'Ending…' : 'End'}</button
										>
									</form>
								{:else}
									<Badge status="ENDED" tone="gray" />
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="text-xs text-muted-foreground">No recurring deductions.</p>
	{/if}
	{#if data.deductionTypes.length}
		<form
			method="POST"
			action="?/addDeduction"
			use:enhance={addDeduction.enhance}
			class="flex flex-wrap items-end gap-2"
		>
			<Field size="compact" label="Pay code">
				{#snippet children(a)}
					<select
						{...a}
						name="deductionTypeId"
						required
						class="h-8 rounded-md border border-input bg-background px-2 text-xs"
					>
						{#each data.deductionTypes as t (t.id)}
							<option value={t.id}>{t.code} — {t.label}</option>
						{/each}
					</select>
				{/snippet}
			</Field>
			<Field size="compact" label="Label (optional)">
				{#snippet children(a)}
					<input
						{...a}
						name="label"
						placeholder="Label override (optional)"
						class="h-8 w-40 rounded-md border border-input bg-background px-2 text-xs"
					/>
				{/snippet}
			</Field>
			<Field size="compact" label="Monthly amount">
				{#snippet children(a)}
					<input
						{...a}
						name="monthlyAmount"
						type="number"
						min="0.01"
						step="100"
						placeholder="Monthly amount"
						required
						class="h-8 w-28 rounded-md border border-input bg-background px-2 text-xs"
					/>
				{/snippet}
			</Field>
			<button
				disabled={addDeduction.busy}
				class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
				>{addDeduction.busy ? 'Adding…' : 'Add'}</button
			>
		</form>
	{:else}
		<p class="text-xs text-muted-foreground">
			No assignable deduction codes yet — create one under
			<a href="/payroll/pay-codes" class="underline">Payroll &rarr; Earnings &amp; Deductions</a>.
		</p>
	{/if}
</section>
