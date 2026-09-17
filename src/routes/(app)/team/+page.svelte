<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import Pagination from '$lib/components/Pagination.svelte'
	import EmployeeCard from '$lib/components/people/EmployeeCard.svelte'
	import EmployeeTable from '$lib/components/people/EmployeeTable.svelte'
	import type { PeopleView, Person } from '$lib/components/people/people'
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()

	const title = $derived(data.isFoodService ? 'Branches' : 'Team')
	const views: { value: PeopleView; label: string }[] = [
		{ value: 'grid', label: 'Grid' },
		{ value: 'list', label: 'List' }
	]

	function teamHref(view: PeopleView, search: string) {
		const params = new URLSearchParams()
		if (search) params.set('search', search)
		if (view === 'list') params.set('view', view)
		const qs = params.toString()
		return qs ? `/team?${qs}` : '/team'
	}

	// ?from so the shared employee page's Back returns here, not the role-based
	// /employees fallback, even on reload/direct entry (#113).
	const employeeHref = (person: Person) => `/employees/${person.id}?from=/team`
</script>

<svelte:head>
	<title>{title} — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader {title} />

	<div class="flex flex-col overflow-hidden rounded-lg border bg-card lg:h-[39.75rem]">
		<div class="flex flex-wrap items-center gap-3 border-b px-4 py-3">
			<form method="GET" role="search" class="w-full sm:w-auto sm:min-w-0 sm:flex-1">
				<label for="team-search" class="sr-only">Search people</label>
				<input
					id="team-search"
					type="search"
					name="search"
					value={data.search}
					maxlength="100"
					placeholder="Search by name, employee number or job title…"
					class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-sm"
				/>
				{#if data.view === 'list'}
					<input type="hidden" name="view" value="list" />
				{/if}
			</form>
			<div class="ml-auto flex items-center gap-3">
				<p class="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
					{data.pagination.total}
					{data.pagination.total === 1 ? 'person' : 'people'}
				</p>
				<div role="group" aria-label="View" class="inline-flex rounded-md border p-0.5">
					{#each views as v (v.value)}
						<a
							href={teamHref(v.value, data.search)}
							aria-current={data.view === v.value ? 'page' : undefined}
							class="rounded px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {data.view ===
							v.value
								? 'bg-muted text-foreground'
								: 'text-muted-foreground hover:text-foreground'}">{v.label}</a
						>
					{/each}
				</div>
			</div>
		</div>

		<div class="min-h-0 flex-1">
			{#if data.people.length === 0}
				{#if data.search}
					<EmptyState variant="no-results" title="No one matches “{data.search}”">
						{#snippet action()}
							<a
								href={teamHref(data.view, '')}
								class="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
								>Clear search</a
							>
						{/snippet}
					</EmptyState>
				{:else}
					<EmptyState title={data.isAdmin ? 'No active employees' : 'No one reports to you yet'} />
				{/if}
			{:else if data.view === 'list'}
				<EmployeeTable
					people={data.people}
					unitLabel={data.isFoodService ? 'Branch' : 'Department'}
					hrefFor={employeeHref}
				/>
			{:else}
				<ul class="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
					{#each data.people as person (person.id)}
						<li class="min-w-0"><EmployeeCard {person} href={employeeHref(person)} /></li>
					{/each}
				</ul>
			{/if}
		</div>

		<div class="has-[nav]:border-t has-[nav]:px-4 has-[nav]:py-3">
			<Pagination meta={data.pagination} />
		</div>
	</div>
</div>
