<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import Pagination from '$lib/components/Pagination.svelte'
	import Container from '$lib/components/ui/Container.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import Table from '$lib/components/ui/Table.svelte'
	import type { Column } from '$lib/components/ui/table'
	import { formatCurrency, formatShortDate } from '$lib/utils/format'
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()

	type Payslip = PageData['payslips'][number]

	const columns: Column[] = [
		{ key: 'period', label: 'Period', width: 'w-[30%]' },
		{ key: 'gross', label: 'Gross Pay', align: 'right', width: 'w-[16%]' },
		{ key: 'deductions', label: 'Deductions', align: 'right', width: 'w-[16%]' },
		{ key: 'net', label: 'Net Pay', align: 'right', width: 'w-[16%]' },
		{ key: 'status', label: 'Status', width: 'w-[12%]' },
		{ key: 'actions', label: '', width: 'w-[10%]' }
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

<div class="flex min-h-[calc(100dvh-6rem)] flex-col gap-6 lg:h-[calc(100dvh-4rem)] lg:min-h-0">
	<PageHeader title="My Payslips" description="View and download your approved payslips." />
	<Container tone="card" flush empty={data.payslips.length === 0} {emptyState}>
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
	</Container>
</div>
