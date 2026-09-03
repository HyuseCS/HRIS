<script lang="ts">
	import { enhance } from '$app/forms'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
	import { formatCurrency } from '$lib/utils/format'

	// Shared what-if calculator (#72): used by the full /payroll/calculator page and
	// the floating window on payroll pages. Posts to the calculator route's action so
	// both surfaces run the exact same server preview; the result is kept locally so
	// it works from any route.

	export type CalcEmployee = {
		id: string
		firstName: string
		lastName: string
		employeeNumber: string
	}
	export type CalcResult = {
		employee: { id: string; firstName: string; lastName: string }
		earnings: { code: string; label: string; amount: number; taxable: boolean }[]
		deductions: { code: string; label: string; amount: number; refId?: string | null }[]
		grossPay: number
		totalDeductions: number
		netPay: number
	}

	let {
		employees,
		recurringDefaults,
		stacked = false
	}: {
		employees: CalcEmployee[]
		recurringDefaults: Record<string, { allowances: number; incentives: number }>
		/** Stack the form above the result (floating window) instead of side-by-side. */
		stacked?: boolean
	} = $props()

	let selectedEmployee = $state('')
	let vals = $state<Record<string, string>>({})
	let result = $state<CalcResult | null>(null)

	// The `error` result type used to fall through every branch, leaving the previous employee's
	// figures on screen under a stale heading. It now clears the result like any other failure,
	// and the toast layer says so.
	const preview = submitFeedback({
		success: null,
		inner:
			() =>
			async ({ result: r }) => {
				if (r.type === 'success' && r.data?.result) {
					result = r.data.result as CalcResult
					error = ''
				} else if (r.type !== 'redirect') {
					result = null
					error =
						r.type === 'failure' ? String(r.data?.error ?? 'Preview failed') : 'Preview failed.'
				}
			}
	})
	let error = $state('')

	// Selecting an employee prefills the ₱ inputs from their recurring
	// allowance/incentive assignments (already prorated server-side); the values
	// stay editable — this is still a what-if tool.
	function prefillRecurring() {
		const d = recurringDefaults[selectedEmployee]
		vals.allowances = d?.allowances ? String(d.allowances) : ''
		vals.incentives = d?.incentives ? String(d.incentives) : ''
	}

	const fields = [
		{ name: 'regularHours', label: 'Regular hours' },
		{ name: 'overtimeHours', label: 'Overtime hours' },
		{ name: 'nightDiffHours', label: 'Night-diff hours' },
		{ name: 'restDayHours', label: 'Rest-day hours' },
		{ name: 'regularHolidayHours', label: 'Reg. holiday hours' },
		{ name: 'specialHolidayHours', label: 'Spec. holiday hours' },
		{ name: 'lateMinutes', label: 'Late (min)' },
		{ name: 'undertimeMinutes', label: 'Undertime (min)' },
		{ name: 'allowances', label: 'Allowances (₱)' },
		{ name: 'incentives', label: 'Incentives (₱)' }
	]
</script>

{#if error}
	<div
		class="mb-4 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-red-400"
	>
		{error}
	</div>
{/if}

<div class="grid gap-6 {stacked ? '' : 'lg:grid-cols-2'}">
	<form
		method="POST"
		action="/payroll/calculator?/preview"
		use:enhance={preview.enhance}
		class="rounded-lg border p-5 space-y-4"
	>
		<div>
			<label class="text-sm font-medium" for="calc-employee">Employee</label>
			<select
				id="calc-employee"
				name="employeeId"
				required
				bind:value={selectedEmployee}
				onchange={prefillRecurring}
				class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<option value="">Select employee…</option>
				{#each employees as e (e.id)}
					<option value={e.id}>{e.lastName}, {e.firstName} ({e.employeeNumber})</option>
				{/each}
			</select>
			<p class="mt-1 text-xs text-muted-foreground">
				Allowances &amp; incentives prefill from the employee's recurring assignments (prorated per
				period) — edit freely.
			</p>
		</div>
		<div class="grid gap-3 sm:grid-cols-2">
			{#each fields as f (f.name)}
				<div>
					<label class="text-xs font-medium text-muted-foreground" for="calc-{f.name}">
						{f.label}
					</label>
					<input
						id="calc-{f.name}"
						name={f.name}
						type="number"
						min="0"
						step="0.01"
						placeholder="0"
						bind:value={vals[f.name]}
						class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
			{/each}
		</div>
		<button
			type="submit"
			class="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
			>Calculate</button
		>
	</form>

	<div class="rounded-lg border bg-card p-5">
		{#if result}
			{@const r = result}
			<h2 class="font-semibold">{r.employee.lastName}, {r.employee.firstName}</h2>
			<div class="mt-4 space-y-4 text-sm">
				<div>
					<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Earnings
					</p>
					<table class="mt-1 w-full">
						<tbody>
							{#each r.earnings as c (c.code)}
								<tr
									><td class="py-0.5">{c.label}{c.taxable ? '' : ' (non-taxable)'}</td><td
										class="py-0.5 text-right font-mono">{formatCurrency(c.amount)}</td
									></tr
								>
							{/each}
							<tr class="border-t font-medium"
								><td class="py-1">Gross</td><td class="py-1 text-right font-mono"
									>{formatCurrency(r.grossPay)}</td
								></tr
							>
						</tbody>
					</table>
				</div>
				<div>
					<p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Deductions
					</p>
					<table class="mt-1 w-full">
						<tbody>
							{#each r.deductions as c (c.code + (c.refId ?? ''))}
								<tr
									><td class="py-0.5">{c.label}</td><td
										class="py-0.5 text-right font-mono text-muted-foreground"
										>{formatCurrency(c.amount)}</td
									></tr
								>
							{/each}
							<tr class="border-t font-medium"
								><td class="py-1">Total deductions</td><td class="py-1 text-right font-mono"
									>{formatCurrency(r.totalDeductions)}</td
								></tr
							>
						</tbody>
					</table>
				</div>
				<div class="flex items-center justify-between rounded-md bg-primary/10 px-3 py-2">
					<span class="font-semibold">Net pay</span>
					<span class="font-mono text-lg font-bold text-primary">{formatCurrency(r.netPay)}</span>
				</div>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">
				Fill in the hours and click Calculate to preview an itemized computation.
			</p>
		{/if}
	</div>
</div>
