<script lang="ts">
	import type { Snippet } from 'svelte'
	import { enhance } from '$app/forms'
	import Field from '$lib/components/ui/Field.svelte'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
	import { formatCurrency } from '$lib/utils/format'
	import { LOAN_TYPES } from '$lib/utils/loan-types'
	import Badge from '$lib/components/ui/Badge.svelte'
	import { LIST_RENDER_CAP, type EmployeeDetailData } from './shared'

	let {
		data,
		actionError,
		truncated
	}: {
		data: EmployeeDetailData
		actionError: Snippet<[string[]]>
		truncated: Snippet<[number]>
	} = $props()

	const addLoan = submitFeedback({ error: null })
	const addCashAdvance = submitFeedback({ error: null })
</script>

<section class="rounded-lg border bg-card p-6 space-y-4 lg:col-span-2">
	<h2 class="font-semibold">Loans &amp; Cash Advances</h2>
	{@render actionError(['addLoan', 'addCashAdvance'])}
	<p class="text-xs text-muted-foreground">
		Active items amortize automatically each payroll period (fixed installment, capped at balance).
	</p>
	<div class="grid gap-6 lg:grid-cols-2">
		<!-- Loans -->
		<div class="space-y-3">
			<h3 class="text-sm font-semibold text-muted-foreground">Loans</h3>
			{#if data.loans.length}
				<div class="card-scroll">
					<table class="w-full text-sm">
						<tbody class="divide-y">
							{#each data.loans.slice(0, LIST_RENDER_CAP) as l (l.id)}
								<tr>
									<td class="py-1.5">{l.type ?? 'Loan'}</td>
									<td class="py-1.5 text-right font-mono"
										>{formatCurrency(Number(l.balance))}<span
											class="ml-1 text-xs text-muted-foreground"
											>/ {formatCurrency(Number(l.installment))}·pd</span
										></td
									>
									<td class="py-1.5 text-right"><Badge status={l.status} domain="loan" /></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{@render truncated(data.loans.length)}
			{:else}
				<p class="text-xs text-muted-foreground">No loans on record.</p>
			{/if}
			<form
				method="POST"
				action="?/addLoan"
				use:enhance={addLoan.enhance}
				class="flex flex-wrap items-end gap-2"
			>
				<Field size="compact" label="Type">
					{#snippet children(a)}
						<select
							{...a}
							name="type"
							required
							class="h-8 w-28 rounded-md border border-input bg-background px-2 text-xs"
						>
							<option value="" disabled selected>Type</option>
							{#each LOAN_TYPES as t (t)}
								<option value={t}>{t}</option>
							{/each}
						</select>
					{/snippet}
				</Field>
				<Field size="compact" label="Principal">
					{#snippet children(a)}
						<input
							{...a}
							name="principal"
							type="number"
							min="0"
							step="500"
							placeholder="Principal"
							required
							class="h-8 w-24 rounded-md border border-input bg-background px-2 text-xs"
						/>
					{/snippet}
				</Field>
				<Field size="compact" label="Per period">
					{#snippet children(a)}
						<input
							{...a}
							name="installment"
							type="number"
							min="0"
							step="100"
							placeholder="Per period"
							required
							class="h-8 w-24 rounded-md border border-input bg-background px-2 text-xs"
						/>
					{/snippet}
				</Field>
				<button
					disabled={addLoan.busy}
					class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
					>{addLoan.busy ? 'Adding…' : 'Add Loan'}</button
				>
			</form>
		</div>
		<!-- Cash advances -->
		<div class="space-y-3">
			<h3 class="text-sm font-semibold text-muted-foreground">Cash Advances</h3>
			{#if data.cashAdvances.length}
				<div class="card-scroll">
					<table class="w-full text-sm">
						<tbody class="divide-y">
							{#each data.cashAdvances.slice(0, LIST_RENDER_CAP) as a (a.id)}
								<tr>
									<td class="py-1.5">Cash advance</td>
									<td class="py-1.5 text-right font-mono"
										>{formatCurrency(Number(a.balance))}<span
											class="ml-1 text-xs text-muted-foreground"
											>/ {formatCurrency(Number(a.installment))}·pd</span
										></td
									>
									<td class="py-1.5 text-right"><Badge status={a.status} domain="loan" /></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{@render truncated(data.cashAdvances.length)}
			{:else}
				<p class="text-xs text-muted-foreground">No cash advances on record.</p>
			{/if}
			<form
				method="POST"
				action="?/addCashAdvance"
				use:enhance={addCashAdvance.enhance}
				class="flex flex-wrap items-end gap-2"
			>
				<Field size="compact" label="Amount">
					{#snippet children(a)}
						<input
							{...a}
							name="amount"
							type="number"
							min="0"
							step="500"
							placeholder="Amount"
							required
							class="h-8 w-24 rounded-md border border-input bg-background px-2 text-xs"
						/>
					{/snippet}
				</Field>
				<Field size="compact" label="Per period">
					{#snippet children(a)}
						<input
							{...a}
							name="installment"
							type="number"
							min="0"
							step="100"
							placeholder="Per period"
							required
							class="h-8 w-24 rounded-md border border-input bg-background px-2 text-xs"
						/>
					{/snippet}
				</Field>
				<button
					disabled={addCashAdvance.busy}
					class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
					>{addCashAdvance.busy ? 'Adding…' : 'Add Advance'}</button
				>
			</form>
		</div>
	</div>
</section>
