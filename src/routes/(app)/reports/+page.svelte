<script lang="ts">
	import { formatCurrency, formatShortDate } from '$lib/utils/format'
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()
	const currentYear = new Date().getFullYear()

	const allReportCards = [
		{
			href: '/reports/payroll-register',
			label: 'Payroll Register',
			desc: 'Per-employee gross, deductions & net',
			payroll: true
		},
		{
			href: '/reports/headcount',
			label: 'Headcount',
			desc: 'Monthly headcount by department',
			payroll: false
		},
		{
			href: '/reports/attendance',
			label: 'Attendance',
			desc: 'Timesheet hours by employee',
			payroll: false
		},
		{
			href: '/reports/payroll-costs',
			label: 'Payroll Costs',
			desc: 'Gross/net by department',
			payroll: true
		},
		{
			href: '/reports/leave-utilization',
			label: 'Leave Utilization',
			desc: 'Days used by leave type',
			payroll: false
		},
		{
			href: '/reports/tardiness',
			label: 'Tardiness',
			desc: 'Late & undertime by employee',
			payroll: false
		},
		{
			href: '/reports/overtime',
			label: 'Overtime',
			desc: 'Approved/raw OT & night diff',
			payroll: false
		},
		{
			href: '/reports/loan-summary',
			label: 'Loan Summary',
			desc: 'Outstanding loan balances',
			payroll: true
		},
		{
			href: '/reports/government-remittance',
			label: 'Government Remittance',
			desc: 'SSS/PhilHealth/Pag-IBIG/BIR totals',
			payroll: true
		},
		{
			href: '/reports/bir-withholding',
			label: 'BIR Withholding',
			desc: 'Tax withheld per employee',
			payroll: true
		},
		{
			href: '/reports/separation',
			label: 'Separation',
			desc: 'Offboarding cases, clearance & final pay',
			payroll: false
		},
		{
			href: '/reports/recruitment',
			label: 'Recruitment',
			desc: 'Job postings, applicant funnel & days open',
			payroll: false
		}
	]
	const reportCards = $derived(
		data.canViewHrReports ? allReportCards : allReportCards.filter((r) => r.payroll)
	)
</script>

<svelte:head>
	<title>Reports — Veent HRIS</title>
</svelte:head>

{#snippet yearForm()}
	<!-- Drives the year-scoped summaries below (#73). Detailed report tabs have
	     their own date filters, so this lives next to what it actually filters. -->
	<form id="year-form" method="GET" class="flex items-center gap-2">
		<label for="year-select" class="text-sm font-medium">Year</label>
		<select
			id="year-select"
			name="year"
			onchange={() => {
				if (typeof document !== 'undefined')
					(document.getElementById('year-form') as HTMLFormElement)?.submit()
			}}
			class="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			{#each [currentYear, currentYear - 1, currentYear - 2] as y (y)}
				<option value={y} selected={y === data.year}>{y}</option>
			{/each}
		</select>
	</form>
{/snippet}

<div class="space-y-8">
	<h1 class="text-2xl font-bold tracking-tight">Reports</h1>

	{#if data.canViewHrReports}
		<!-- Attrition summary -->
		<section class="space-y-3">
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-semibold">Workforce — {data.year}</h2>
				{@render yearForm()}
			</div>
			<div class="grid gap-4 sm:grid-cols-3">
				<div class="rounded-lg border bg-card p-4">
					<p class="text-sm text-muted-foreground">Total Active</p>
					<p class="text-3xl font-bold">
						{data.headcountByDept.reduce(
							(s: number, d: (typeof data.headcountByDept)[number]) => s + d._count.employees,
							0
						)}
					</p>
				</div>
				<div class="rounded-lg border bg-card p-4">
					<p class="text-sm text-muted-foreground">Hired in {data.year}</p>
					<p class="text-3xl font-bold text-green-600 dark:text-green-400">
						{data.attrition.hired}
					</p>
				</div>
				<div class="rounded-lg border bg-card p-4">
					<p class="text-sm text-muted-foreground">Offboarded in {data.year}</p>
					<p class="text-3xl font-bold text-red-600 dark:text-red-400">
						{data.attrition.offboarded}
					</p>
				</div>
			</div>
		</section>
	{/if}

	<!-- Detailed reports (filterable + CSV export) -->
	<section class="space-y-3">
		<h2 class="text-lg font-semibold">Detailed Reports</h2>
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each reportCards as r (r.href)}
				<a
					href={r.href}
					class="rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-card/80"
				>
					<p class="font-medium">{r.label}</p>
					<p class="mt-0.5 text-xs text-muted-foreground">{r.desc}</p>
				</a>
			{/each}
		</div>
	</section>

	<!-- Payroll summary -->
	{#if data.payrollSummary.length > 0}
		<section class="space-y-3">
			<div class="flex items-center justify-between">
				<h2 class="text-lg font-semibold">Payroll Summary — {data.year}</h2>
				{#if !data.canViewHrReports}
					<!-- Payroll-only viewers don't see the Workforce section — keep the
					     year control next to the one year-scoped table they do see. -->
					{@render yearForm()}
				{/if}
			</div>
			<div class="rounded-lg border overflow-x-auto">
				<table class="w-full text-sm">
					<thead class="border-b bg-muted/50">
						<tr>
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Period</th>
							<th class="px-4 py-3 text-right font-medium text-muted-foreground">Gross</th>
							<th class="px-4 py-3 text-right font-medium text-muted-foreground">Deductions</th>
							<th class="px-4 py-3 text-right font-medium text-muted-foreground">Net Pay</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each data.payrollSummary as run (run.id)}
							<tr class="hover:bg-muted/30">
								<td class="px-4 py-3"
									>{formatShortDate(run.periodStart)} – {formatShortDate(run.periodEnd)}</td
								>
								<td class="px-4 py-3 text-right font-mono"
									>{formatCurrency(Number(run.totalGross))}</td
								>
								<td class="px-4 py-3 text-right font-mono text-muted-foreground"
									>{formatCurrency(Number(run.totalDeductions))}</td
								>
								<td class="px-4 py-3 text-right font-mono font-medium"
									>{formatCurrency(Number(run.totalNet))}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</div>
