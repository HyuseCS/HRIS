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

	const endEarning = submitFeedback({ error: null })
	const addEarning = submitFeedback({ error: null })
</script>

<section class="rounded-lg border bg-card p-6 space-y-4 lg:col-span-2">
	<h2 class="font-semibold">Recurring Allowances &amp; Incentives</h2>
	{@render actionError(['addEarning', 'endEarning'])}
	<p class="text-xs text-muted-foreground">
		Monthly amounts, prorated to each payroll period and added to the payslip's Allowances /
		Incentives lines. Ended items stop from the next payroll run.
	</p>
	{#if data.recurringEarnings.length}
		<div class="card-scroll">
			<table class="w-full text-sm">
				<tbody class="divide-y">
					{#each data.recurringEarnings as e (e.id)}
						<tr>
							<td class="py-1.5">{e.label}</td>
							<td class="py-1.5 text-muted-foreground"
								>{e.kind === 'ALLOWANCE' ? 'Allowance' : 'Incentive'}</td
							>
							<td class="py-1.5 text-right font-mono"
								>{formatCurrency(Number(e.monthlyAmount))}<span
									class="ml-1 text-xs text-muted-foreground">/mo</span
								></td
							>
							<td class="py-1.5 text-right">
								{#if e.isActive}
									<form method="POST" action="?/endEarning" use:enhance={endEarning.enhance}>
										<input type="hidden" name="id" value={e.id} />
										<button
											type="submit"
											disabled={endEarning.busy}
											class="rounded-md border border-red-500/20 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 disabled:pointer-events-none disabled:opacity-50"
											>{endEarning.busy ? 'Ending…' : 'End'}</button
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
		<p class="text-xs text-muted-foreground">No recurring allowances or incentives.</p>
	{/if}
	<form
		method="POST"
		action="?/addEarning"
		use:enhance={addEarning.enhance}
		class="flex flex-wrap items-end gap-2"
	>
		<Field size="compact" label="Kind">
			{#snippet children(a)}
				<select
					{...a}
					name="kind"
					class="h-8 rounded-md border border-input bg-background px-2 text-xs"
				>
					<option value="ALLOWANCE">Allowance</option>
					<option value="INCENTIVE">Incentive</option>
				</select>
			{/snippet}
		</Field>
		<Field size="compact" label="Label">
			{#snippet children(a)}
				<input
					{...a}
					name="label"
					placeholder="Label (e.g. Meal allowance)"
					required
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
			disabled={addEarning.busy}
			class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
			>{addEarning.busy ? 'Adding…' : 'Add'}</button
		>
	</form>
</section>
