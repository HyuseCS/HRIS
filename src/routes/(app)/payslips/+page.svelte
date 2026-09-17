<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import Pagination from '$lib/components/Pagination.svelte'
	import PanelPage from '$lib/components/ui/PanelPage.svelte'
	import Table from '$lib/components/ui/Table.svelte'
	import type { Column } from '$lib/components/ui/table'
	import { formatCurrency, formatShortDate } from '$lib/utils/format'
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()

	type Payslip = PageData['payslips'][number]

	// Money and status size to their content so the period column takes the slack; without that
	// the four numeric columns share it equally and the figures drift from their headers.
	const columns: Column[] = [
		{ key: 'period', label: 'Period' },
		{ key: 'gross', label: 'Gross Pay', align: 'right', width: 'min' },
		{ key: 'deductions', label: 'Deductions', align: 'right', width: 'min' },
		{ key: 'net', label: 'Net Pay', align: 'right', width: 'min' },
		{ key: 'status', label: 'Status', width: 'min' },
		{ key: 'actions', label: '', width: 'min' }
	]
</script>

<svelte:head>
	<title>My Payslips — Veent HRIS</title>
</svelte:head>

{#snippet emptyState()}
	<EmptyState
		title="No payslips yet"
		description="Approved payroll runs appear here. Once a run covering you is released, its payslip becomes available to view and download."
	/>
{/snippet}

<PanelPage
	title="My Payslips"
	description="View and download your approved payslips."
	tone="card"
	flush
	empty={data.payslips.length === 0}
	{emptyState}
>
	<Table
		bare
		{columns}
		rows={data.payslips}
		getKey={(p: Payslip) => p.id}
		caption="Approved payslips"
	>
		{#snippet cell(payslip: Payslip, column: Column)}
			{#if column.key === 'period'}
				{formatShortDate(payslip.payrollRun.periodStart)} – {formatShortDate(
					payslip.payrollRun.periodEnd
				)}
			{:else if column.key === 'gross'}
				<span class="font-mono tabular-nums">{formatCurrency(Number(payslip.grossPay))}</span>
			{:else if column.key === 'deductions'}
				<span class="font-mono tabular-nums text-muted-foreground"
					>{formatCurrency(Number(payslip.totalDeductions))}</span
				>
			{:else if column.key === 'net'}
				<span class="font-mono font-medium tabular-nums"
					>{formatCurrency(Number(payslip.netPay))}</span
				>
			{:else if column.key === 'status'}
				<span class="badge-green">{payslip.payrollRun.status}</span>
			{:else if column.key === 'actions'}
				<a href="/payslips/{payslip.id}" class="btn-row">View</a>
			{/if}
		{/snippet}
	</Table>

	{#snippet footer()}
		<Pagination meta={data.pagination} />
	{/snippet}
</PanelPage>
