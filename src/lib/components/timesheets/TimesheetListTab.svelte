<script lang="ts" module>
	export interface Row {
		id: string
		employee: { firstName: string; lastName: string }
		periodStart: Date | string
		periodEnd: Date | string
		totalHours: unknown
		status: string
	}
</script>

<script lang="ts" generics="T extends Row">
	import type { ComponentProps } from 'svelte'
	import { enhance } from '$app/forms'
	import type { SubmitFunction } from '@sveltejs/kit'
	import { slide } from 'svelte/transition'
	import { formatShortDate } from '$lib/utils/format'
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import TableSkeleton from '$lib/components/ui/TableSkeleton.svelte'
	import LoadError from '$lib/components/ui/LoadError.svelte'
	import Pagination from '$lib/components/Pagination.svelte'
	import ConfirmButton from '$lib/components/ui/ConfirmButton.svelte'
	import Badge from '$lib/components/ui/Badge.svelte'

	let {
		rows,
		pagination,
		kind,
		canModify,
		onopen
	}: {
		rows: Promise<T[]>
		pagination: ComponentProps<typeof Pagination>['meta']
		kind: 'mine' | 'team'
		canModify: boolean
		onopen: (_ts: T) => void
	} = $props()

	const showEmployee = $derived(kind === 'team')
	let selectedIds = $state<string[]>([])
	let busy = $state(false)

	const clearOnSuccess: SubmitFunction = () => {
		busy = true
		return async ({ result, update }) => {
			await update()
			busy = false
			if (result.type === 'success') selectedIds = []
		}
	}

	const toggle = (id: string) =>
		(selectedIds = selectedIds.includes(id)
			? selectedIds.filter((x) => x !== id)
			: [...selectedIds, id])

	const btnPrimary =
		'rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
	const btnDanger =
		'rounded-md border border-red-500/20 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50'
</script>

{#await rows}
	<TableSkeleton rows={5} cols={showEmployee ? 4 : 3} flush />
{:then list}
	{@const ids = list.map((t) => t.id)}
	{@const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id))}
	<div class="flex flex-1 flex-col">
		{#if canModify && selectedIds.length}
			<div
				class="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2"
				transition:slide={{ duration: 120 }}
			>
				<span class="text-sm font-medium">{selectedIds.length} selected</span>
				<div class="flex items-center gap-2">
					<button
						onclick={() => (selectedIds = [])}
						class="mr-1 text-sm text-muted-foreground hover:underline">Clear</button
					>
					{#if kind === 'mine'}
						<form method="POST" action="?/submitMany" use:enhance={clearOnSuccess}>
							<input type="hidden" name="ids" value={selectedIds.join(',')} />
							<button disabled={busy} class={btnPrimary}>Submit selected</button>
						</form>
					{/if}
					<ConfirmButton
						action="?/deleteMany"
						title="Delete selected timesheets?"
						message={kind === 'mine'
							? 'Draft and rejected timesheets you own will be permanently deleted; submitted and approved ones are skipped.'
							: `${selectedIds.length} timesheet${selectedIds.length === 1 ? '' : 's'} will be permanently deleted.`}
						triggerLabel="Delete selected"
						triggerClass={btnDanger}
						disabled={busy}
						submit={clearOnSuccess}
					>
						<input type="hidden" name="ids" value={selectedIds.join(',')} />
					</ConfirmButton>
				</div>
			</div>
		{/if}

		<div class="overflow-x-auto">
			<!-- table-fixed with shared column widths so the right-anchored Total Hours
			     and Status columns line up between the My/Team tables even though only
			     the Team table has an Employee column. -->
			<table class="w-full min-w-[44rem] table-fixed text-sm">
				<thead class="border-b bg-muted/50">
					<tr>
						{#if canModify}
							<th class="w-12 px-4 py-3">
								<input
									type="checkbox"
									checked={allSelected}
									onchange={(e) => (selectedIds = e.currentTarget.checked ? ids : [])}
									aria-label="Select all"
									class="align-middle"
								/>
							</th>
						{/if}
						{#if showEmployee}
							<th class="w-56 px-4 py-3 text-left font-medium text-muted-foreground">Employee</th>
						{/if}
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Period</th>
						<th
							class="w-40 px-4 py-3 text-right font-medium text-muted-foreground whitespace-nowrap"
							>Total Hours</th
						>
						<th class="w-32 px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each list as ts (ts.id)}
						<!-- R1 carve-out (item 22): this row opens a modal, not a URL, so there is nothing
						     to put in an <a href>. The period cell carries a real <button> instead. Dropping
						     the row's tabindex and key handler is also item 23's fix at the root — the old
						     handler had no preventDefault, so Space both opened the modal and scrolled the
						     page, and it fired for Space on the row's selection checkbox too. -->
						<tr
							onclick={(e) => {
								if ((e.target as HTMLElement).closest('a, button, input, label, form')) return
								onopen(ts)
							}}
							class={`cursor-pointer hover:bg-muted/30 ${selectedIds.includes(ts.id) ? 'bg-primary/5' : ''}`}
						>
							{#if canModify}
								<td class="px-4 py-3" onclick={(e) => e.stopPropagation()}>
									<input
										type="checkbox"
										checked={selectedIds.includes(ts.id)}
										onchange={() => toggle(ts.id)}
										aria-label="Select timesheet"
										class="align-middle"
									/>
								</td>
							{/if}
							{#if showEmployee}
								<td class="truncate px-4 py-3">{ts.employee.lastName}, {ts.employee.firstName}</td>
							{/if}
							<td class="px-4 py-3 whitespace-nowrap">
								<button
									type="button"
									onclick={() => onopen(ts)}
									aria-label="Review timesheet for {formatShortDate(
										ts.periodStart
									)} to {formatShortDate(ts.periodEnd)}"
									class="min-h-6 inline-flex items-center hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									>{formatShortDate(ts.periodStart)} – {formatShortDate(ts.periodEnd)}</button
								>
							</td>
							<td class="px-4 py-3 text-right tabular-nums"
								>{Number(ts.totalHours).toFixed(2)} hrs</td
							>
							<td class="px-4 py-3"><Badge status={ts.status} domain="timesheet" /></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if list.length === 0}
			<div class="flex flex-1 items-center justify-center">
				<EmptyState title="No timesheets found" />
			</div>
		{/if}

		<div class="mt-auto has-[nav]:border-t has-[nav]:px-4 has-[nav]:py-3">
			<Pagination meta={pagination} />
		</div>
	</div>
{:catch}
	<div class="p-4">
		<LoadError what={kind === 'mine' ? 'your timesheets' : 'the team timesheets'} />
	</div>
{/await}
