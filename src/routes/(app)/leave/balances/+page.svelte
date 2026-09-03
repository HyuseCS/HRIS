<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { goto } from '$app/navigation'
	import { monthsOfService, tenureRequirement } from '$lib/utils/dates'
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()

	// A cell is "locked" when the employee has a balance row but hasn't served long enough to
	// file against it (SIL). The row is allocated at onboarding so the ledger stays uniform —
	// the gate is at filing time — so without this the page would read as 5 available days.
	function locked(startDate: string | Date, minMonths: number): boolean {
		return minMonths > 0 && monthsOfService(new Date(startDate)) < minMonths
	}

	const colCount = $derived(3 + data.leaveTypes.length)
	const filtered = $derived(!!(data.search || data.departmentId))
</script>

<svelte:head>
	<title>Leave Balances — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader
		title="Leave Balances"
		description="Remaining / allocated days per active employee for {data.year}."
	>
		{#snippet back()}
			<BackButton fallback="/leave" label="Leave" />
		{/snippet}
	</PageHeader>

	<form method="GET" class="flex flex-wrap gap-2">
		<input
			name="search"
			value={data.search}
			placeholder="Search by name or employee number…"
			class="flex h-9 w-64 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		/>
		<select
			name="department"
			aria-label="Department"
			class="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<option value="">All departments</option>
			{#each data.departments as d (d.id)}
				<option value={d.id} selected={data.departmentId === d.id}>{d.name}</option>
			{/each}
		</select>
		<input type="hidden" name="year" value={data.year} />
		<button type="submit" class="rounded-md border px-3 py-1 text-sm hover:bg-accent">Filter</button
		>
	</form>

	<div class="overflow-x-auto rounded-lg border">
		<table class="w-full min-w-max text-sm">
			<thead class="border-b bg-muted/50">
				<tr>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Employee</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Department</th>
					{#each data.leaveTypes as lt (lt.id)}
						<th class="px-4 py-3 text-right font-medium text-muted-foreground">
							{lt.name}
							{#if lt.minMonthsOfService > 0}
								<span
									class="block text-xs font-normal opacity-70"
									title="Requires {tenureRequirement(lt.minMonthsOfService)} of service"
								>
									after {tenureRequirement(lt.minMonthsOfService)}
								</span>
							{/if}
						</th>
					{/each}
					<th class="px-4 py-3 text-right font-medium text-muted-foreground">Total left</th>
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each data.rows as row (row.id)}
					<!-- R1: the real link lives in the name cell; the whole-row click is a mouse
					     convenience only. -->
					<tr
						class="cursor-pointer hover:bg-muted/30"
						data-employee={row.employeeNumber}
						onclick={(e) => {
							if ((e.target as HTMLElement).closest('a, button, input, label, form')) return
							goto(`/employees/${row.id}`)
						}}
					>
						<td class="px-4 py-3">
							<a
								href="/employees/{row.id}"
								class="font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>{row.name}</a
							>
							<div class="text-xs text-muted-foreground">{row.employeeNumber}</div>
						</td>
						<td class="px-4 py-3 text-muted-foreground">{row.department}</td>
						{#each row.cells as cell, i (data.leaveTypes[i].id)}
							{@const gated = locked(row.startDate, data.leaveTypes[i].minMonthsOfService)}
							<td class="px-4 py-3 text-right tabular-nums">
								{#if !cell}
									<span class="text-muted-foreground" title="No balance allocated for {data.year}"
										>—</span
									>
								{:else if gated}
									<span class="text-muted-foreground" title="Not yet eligible">Locked</span>
								{:else}
									<span class="font-medium">{cell.remaining.toFixed(1)}</span>
									<span class="text-xs text-muted-foreground">/ {cell.allocated.toFixed(0)}</span>
								{/if}
							</td>
						{/each}
						<td class="px-4 py-3 text-right font-medium tabular-nums">
							{row.cells
								.reduce(
									(sum, cell, i) =>
										sum +
										(cell && !locked(row.startDate, data.leaveTypes[i].minMonthsOfService)
											? cell.remaining
											: 0),
									0
								)
								.toFixed(1)}
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan={colCount} class="p-0"
							><EmptyState
								variant={filtered ? 'no-results' : 'empty'}
								title="No employees found"
								description={filtered
									? 'No employee matches your search or department filter.'
									: undefined}
							/></td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
