<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import SeparationCreateDialog from '$lib/components/separations/SeparationCreateDialog.svelte'
	import { formatShortDate } from '$lib/utils/format'
	import type { PageData, ActionData } from './$types'
	import Badge from '$lib/components/ui/Badge.svelte'
	import { SEPARATION_TYPE_LABELS, labelFor } from '$lib/labels'
	import Pagination from '$lib/components/Pagination.svelte'

	let { data, form }: { data: PageData; form: ActionData } = $props()
	let showForm = $state(false)

	function clearedCount(items: { status: string }[]) {
		return items.filter((i) => i.status === 'CLEARED').length
	}
</script>

<svelte:head>
	<title>Separations — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0 flex-1">
			<PageHeader
				title="Separations"
				description="Record resignations and terminations, run clearance, and settle final pay."
			/>
		</div>
		<button
			onclick={() => (showForm = true)}
			class="inline-flex h-9 shrink-0 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			New Separation
		</button>
	</div>

	<SeparationCreateDialog bind:open={showForm} employees={data.employees} {form} />

	<div class="overflow-x-auto rounded-lg border bg-card">
		<table class="w-full text-sm">
			<thead class="border-b bg-muted/50">
				<tr>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Employee</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Effective</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Clearance</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
					<th class="px-4 py-3"></th>
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each data.separations as s (s.id)}
					<tr class="hover:bg-muted/30">
						<td class="px-4 py-3 font-medium">
							<a href="/separations/{s.id}" class="hover:underline"
								>{s.employee.lastName}, {s.employee.firstName}</a
							>
							<span class="text-xs text-muted-foreground">({s.employee.employeeNumber})</span>
						</td>
						<td class="px-4 py-3 text-muted-foreground"
							>{labelFor(SEPARATION_TYPE_LABELS, s.type)}</td
						>
						<td class="px-4 py-3 text-muted-foreground">{formatShortDate(s.effectiveDate)}</td>
						<td class="px-4 py-3 text-muted-foreground"
							>{clearedCount(s.clearanceItems)}/{s.clearanceItems.length}</td
						>
						<td class="px-4 py-3">
							<Badge status={s.status} domain="separation" />
						</td>
						<td class="px-4 py-3 text-right">
							<a href="/separations/{s.id}" class="btn-row">Open</a>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="6" class="p-0"><EmptyState title="No separation cases yet" /></td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<Pagination meta={data.pagination} />
</div>
