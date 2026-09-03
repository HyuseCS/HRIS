<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import type { SubmitFunction } from '@sveltejs/kit'
	import { slide } from 'svelte/transition'
	import { formatShortDate } from '$lib/utils/format'
	import TableSkeleton from '$lib/components/ui/TableSkeleton.svelte'
	import Pagination from '$lib/components/Pagination.svelte'
	import TimesheetModal from '$lib/components/timesheets/TimesheetModal.svelte'
	import NewTimesheetDialog from '$lib/components/timesheets/NewTimesheetDialog.svelte'
	import AggregatePanel from '$lib/components/timesheets/AggregatePanel.svelte'
	import ConfirmButton from '$lib/components/ui/ConfirmButton.svelte'
	import Badge from '$lib/components/ui/Badge.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()
	let showCreate = $state(false)

	// ─── Review modal ─────────────────────────────────────────────────────────
	// /timesheets is read/modify only — the modal runs in "edit" mode (no approve/reject).
	type Timesheet = Awaited<PageData['myTimesheets']>[number]
	let openTs = $state<Timesheet | null>(null)
	let busy = $state(false)

	// ─── Bulk selection ─────────────────────────────────────────────────────────
	// Managers see two tables (their own timesheets vs. the team's); each keeps its own
	// selection so a bulk action only ever touches the section it was triggered from.
	type Kind = 'mine' | 'team'
	let selectedMine = $state<string[]>([])
	let selectedTeam = $state<string[]>([])
	const selOf = (kind: Kind) => (kind === 'team' ? selectedTeam : selectedMine)
	function setSel(kind: Kind, v: string[]) {
		if (kind === 'team') selectedTeam = v
		else selectedMine = v
	}
	function toggle(kind: Kind, id: string) {
		const cur = selOf(kind)
		setSel(kind, cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
	}
	function toggleAll(kind: Kind, ids: string[], on: boolean) {
		setSel(kind, on ? ids : [])
	}
	// Clear that section's selection after a successful bulk delete/submit.
	const clearOnSuccess =
		(kind: Kind): SubmitFunction =>
		() => {
			busy = true
			return async ({ result, update }) => {
				await update()
				busy = false
				if (result.type === 'success') setSel(kind, [])
			}
		}

	function openReview(ts: Timesheet) {
		openTs = ts
	}

	// Theme-aware status pills (dark-mode safe) — see the .badge-* classes in app.css.
	const btnPrimary =
		'rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
</script>

<svelte:head>
	<title>Timesheets — Veent HRIS</title>
</svelte:head>

{#snippet section(title: string, rows: Timesheet[], kind: Kind, showEmployee: boolean)}
	{@const ids = rows.map((t) => t.id)}
	{@const selectedIds = selOf(kind)}
	{@const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id))}
	{@const cols = (showEmployee ? 4 : 3) + (data.canModify ? 1 : 0)}
	<section class="space-y-3">
		<h2 class="text-lg font-semibold">{title}</h2>

		<!-- Bulk actions for this section; appear when its rows are selected -->
		{#if data.canModify && selectedIds.length}
			<div
				class="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-2"
				transition:slide={{ duration: 120 }}
			>
				<span class="text-sm font-medium">{selectedIds.length} selected</span>
				<div class="flex items-center gap-2">
					<button
						onclick={() => setSel(kind, [])}
						class="mr-1 text-sm text-muted-foreground hover:underline">Clear</button
					>
					{#if kind === 'mine'}
						<form method="POST" action="?/submitMany" use:enhance={clearOnSuccess('mine')}>
							<input type="hidden" name="ids" value={selectedIds.join(',')} />
							<button disabled={busy} class={btnPrimary}>Submit selected</button>
						</form>
						<ConfirmButton
							action="?/deleteMany"
							title="Delete selected timesheets?"
							message="Draft and rejected timesheets you own will be permanently deleted; submitted and approved ones are skipped."
							triggerLabel="Delete selected"
							triggerClass="rounded-md border border-red-500/20 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50"
							disabled={busy}
							submit={clearOnSuccess('mine')}
						>
							<input type="hidden" name="ids" value={selectedIds.join(',')} />
						</ConfirmButton>
					{:else}
						<ConfirmButton
							action="?/deleteMany"
							title="Delete selected timesheets?"
							message="{selectedIds.length} timesheet{selectedIds.length === 1
								? ''
								: 's'} will be permanently deleted."
							triggerLabel="Delete selected"
							triggerClass="rounded-md border border-red-500/20 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50"
							disabled={busy}
							submit={clearOnSuccess('team')}
						>
							<input type="hidden" name="ids" value={selectedIds.join(',')} />
						</ConfirmButton>
					{/if}
				</div>
			</div>
		{/if}

		<div class="overflow-x-auto rounded-lg border">
			<!-- table-fixed with shared column widths so the right-anchored Total Hours
			     and Status columns line up between the My/Team tables even though only
			     the Team table has an Employee column. -->
			<table class="w-full min-w-[44rem] table-fixed text-sm">
				<thead class="border-b bg-muted/50">
					<tr>
						{#if data.canModify}
							<th class="w-12 px-4 py-3">
								<input
									type="checkbox"
									checked={allSelected}
									onchange={(e) => toggleAll(kind, ids, e.currentTarget.checked)}
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
					{#each rows as ts (ts.id)}
						<tr
							onclick={() => openReview(ts)}
							onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && openReview(ts)}
							tabindex="0"
							class={`cursor-pointer hover:bg-muted/30 focus:bg-muted/40 focus:outline-none ${selectedIds.includes(ts.id) ? 'bg-primary/5' : ''}`}
						>
							{#if data.canModify}
								<td class="px-4 py-3" onclick={(e) => e.stopPropagation()}>
									<input
										type="checkbox"
										checked={selectedIds.includes(ts.id)}
										onchange={() => toggle(kind, ts.id)}
										aria-label="Select timesheet"
										class="align-middle"
									/>
								</td>
							{/if}
							{#if showEmployee}
								<td class="truncate px-4 py-3">{ts.employee.lastName}, {ts.employee.firstName}</td>
							{/if}
							<td class="px-4 py-3 whitespace-nowrap"
								>{formatShortDate(ts.periodStart)} – {formatShortDate(ts.periodEnd)}</td
							>
							<td class="px-4 py-3 text-right tabular-nums"
								>{Number(ts.totalHours).toFixed(2)} hrs</td
							>
							<td class="px-4 py-3"><Badge status={ts.status} domain="timesheet" /></td>
						</tr>
					{:else}
						<tr>
							<td colspan={cols} class="p-0"><EmptyState title="No timesheets found" /></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
{/snippet}

<div class="space-y-8">
	<PageHeader title="Timesheets" />

	<!-- The create action sits above the lists it adds to, not on the title row. It cannot go on
	     a section heading: `canCreate` is independent of which of the two sections render. -->
	{#if data.canCreate}
		<div class="flex justify-end">
			<button
				onclick={() => (showCreate = true)}
				class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
			>
				New Timesheet
			</button>
		</div>
	{/if}

	{#if form?.saved}
		<Banner kind="success" message={form.saved} />
	{/if}

	{#if data.isHrAdmin}
		<AggregatePanel employees={data.employees} />
	{/if}

	{#if data.myEmployeeId}
		{#await data.myTimesheets}
			<TableSkeleton rows={5} cols={data.isManager ? 4 : 3} />
		{:then mine}
			{@render section('My Timesheets', mine, 'mine', false)}
			<Pagination meta={data.minePagination} />
		{/await}
	{/if}
	{#if data.isManager}
		{#await data.teamTimesheets}
			<TableSkeleton rows={5} cols={4} />
		{:then team}
			{@render section('Team Timesheets', team, 'team', true)}
			<Pagination meta={data.teamPagination} />
		{/await}
	{/if}
	{#if !data.myEmployeeId && !data.isManager}
		<p class="text-sm text-muted-foreground">No employee profile found.</p>
	{/if}
</div>

<TimesheetModal
	bind:ts={openTs}
	mode="edit"
	isManager={data.isManager}
	isHrAdmin={data.isHrAdmin}
	canModify={data.canModify}
	myEmployeeId={data.myEmployeeId}
	{form}
/>

{#if data.canCreate}
	<NewTimesheetDialog bind:open={showCreate} employees={data.employees} />
{/if}
