<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { page } from '$app/stores'
	import { goto } from '$app/navigation'
	import { formatShortDate } from '$lib/utils/format'
	import { tenureLabel } from '$lib/utils/dates'
	import Pagination from '$lib/components/Pagination.svelte'
	import TableSkeleton from '$lib/components/ui/TableSkeleton.svelte'
	import LoadError from '$lib/components/ui/LoadError.svelte'
	import type { PageData } from './$types'
	import Badge from '$lib/components/ui/Badge.svelte'

	let { data }: { data: PageData } = $props()
	let search = $state($page.url.searchParams.get('search') ?? '')
	// Read the APPLIED filter from the URL, not the bound input: typing must not flip the empty
	// state to "no results" before the search is submitted.
	const filtered = $derived(!!($page.url.searchParams.get('search') || data.branchFilter))

	// Active / Offboarded tab links (#184) — keep the search and branch filters, switch the
	// status, and drop the page so a tab always opens on its first page.
	function tabHref(status: 'active' | 'offboarded') {
		const params = new URLSearchParams($page.url.searchParams)
		if (status === 'active') params.delete('status')
		else params.set('status', status)
		params.delete('page')
		const qs = params.toString()
		return qs ? `${$page.url.pathname}?${qs}` : $page.url.pathname
	}
</script>

<svelte:head>
	<title>Employees — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader title="Employees" />

	<!-- Search -->
	<!-- One GET form: a sibling form would submit on its own and drop the search term. -->
	<form method="GET" class="flex flex-wrap gap-2">
		<input
			name="search"
			value={search}
			placeholder="Search by name or employee number…"
			class="flex h-9 w-64 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		/>
		{#if data.showBranches}
			<select
				name="branch"
				aria-label="Store"
				class="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<option value="">All stores</option>
				{#each data.branches as br (br.id)}
					<option value={br.id} selected={data.branchFilter === br.id}>{br.name}</option>
				{/each}
			</select>
		{/if}
		<button type="submit" class="rounded-md border px-3 py-1 text-sm hover:bg-accent">Search</button
		>
		<a
			href="/employees/new"
			class="ml-auto rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
		>
			Add Employee
		</a>
	</form>

	<!-- Active / Offboarded tabs (#184) -->
	<div class="flex gap-1 border-b">
		<a
			href={tabHref('active')}
			class="border-b-2 px-4 py-2 text-sm font-medium transition-colors {data.tab === 'active'
				? 'border-primary text-foreground'
				: 'border-transparent text-muted-foreground hover:text-foreground'}"
		>
			Active <span class="text-xs text-muted-foreground">({data.activeCount})</span>
		</a>
		<a
			href={tabHref('offboarded')}
			class="border-b-2 px-4 py-2 text-sm font-medium transition-colors {data.tab === 'offboarded'
				? 'border-primary text-foreground'
				: 'border-transparent text-muted-foreground hover:text-foreground'}"
		>
			Offboarded <span class="text-xs text-muted-foreground">({data.offboardedCount})</span>
		</a>
	</div>

	<!-- Table -->
	{#await data.employees}
		<TableSkeleton rows={6} cols={6} />
	{:then employees}
		<div class="overflow-x-auto rounded-lg border">
			<table class="w-full min-w-max text-sm">
				<thead class="border-b bg-muted/50">
					<tr>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Employee</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Department</th>
						{#if data.showBranches}
							<th class="px-4 py-3 text-left font-medium text-muted-foreground">Store</th>
						{/if}
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Title</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Start Date</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Tenure</th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each employees as emp (emp.id)}
						<!-- R1: the real link lives in the name cell. The whole-row click stays as a mouse
						     convenience only — the row is not focusable and carries no key handler, so a
						     keyboard reader gets a plain table row containing a link. -->
						<tr
							class="cursor-pointer hover:bg-muted/30"
							onclick={(e) => {
								if ((e.target as HTMLElement).closest('a, button, input, label, form')) return
								goto(`/employees/${emp.id}`)
							}}
						>
							<td class="px-4 py-3">
								<a
									href="/employees/{emp.id}"
									class="font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									>{emp.lastName}, {emp.firstName}</a
								>
								<div class="text-xs text-muted-foreground">{emp.employeeNumber}</div>
							</td>
							<td class="px-4 py-3 text-muted-foreground">{emp.department.name}</td>
							{#if data.showBranches}
								<td class="px-4 py-3 text-muted-foreground">{emp.branch?.name ?? '—'}</td>
							{/if}
							<td class="px-4 py-3">{emp.jobTitle}</td>
							<td class="px-4 py-3 text-muted-foreground">{emp.employmentType.replace('_', ' ')}</td
							>
							<td class="px-4 py-3">
								<Badge status={emp.employmentStatus} domain="employment" />
								{#if emp.employmentStatus === 'OFFBOARDED' && emp.endDate}
									<div class="mt-0.5 text-xs text-muted-foreground">
										left {formatShortDate(emp.endDate)}
									</div>
								{/if}
							</td>
							<td class="px-4 py-3 text-muted-foreground">{formatShortDate(emp.startDate)}</td>
							<td class="px-4 py-3 text-muted-foreground"
								>{tenureLabel(emp.startDate, emp.endDate ?? undefined)}</td
							>
						</tr>
					{:else}
						<tr>
							<td colspan={data.showBranches ? 8 : 7} class="p-0">
								<EmptyState
									variant={filtered ? 'no-results' : 'empty'}
									title={data.tab === 'offboarded'
										? 'No offboarded employees'
										: 'No employees found'}
									description={filtered
										? 'No employee matches your search or store filter.'
										: undefined}
								/>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:catch}
		<LoadError what="the employee list" />
	{/await}

	<Pagination meta={data.pagination} />
</div>
