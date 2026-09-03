<script lang="ts">
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { formatCurrency } from '$lib/utils/format'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	// #108: a double-click would create a duplicate salary grade.
	const addGrade = createSubmitGuard()

	// #108: both tables render one form per row, so each row needs its own guard — a shared one
	// would freeze every other row while one is in flight. Separate maps per action: the two
	// tables are keyed by different ids (grade vs position) and must not collide. Plain objects,
	// not `$state`: each guard holds its own reactive `busy`, the maps only memoise identity.
	const toggleGradeGuards: Record<string, ReturnType<typeof createSubmitGuard>> = {}
	const toggleGradeGuard = (id: string) => (toggleGradeGuards[id] ??= createSubmitGuard())
	const assignGradeGuards: Record<string, ReturnType<typeof createSubmitGuard>> = {}
	const assignGradeGuard = (id: string) => (assignGradeGuards[id] ??= createSubmitGuard())
</script>

<svelte:head>
	<title>Salary Grades — Veent HRIS</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6">
	<PageHeader
		title="Salary Grades"
		description="Pay bands assignable to positions. Employees inherit their band via their position; HR is warned when a basic salary falls outside it."
	>
		{#snippet back()}
			<BackButton fallback="/settings" label="Settings" preferFallback />
		{/snippet}
	</PageHeader>

	{#if form?.error}
		<Banner kind="error" message={form.error} />
	{/if}

	<!-- Grades -->
	<section class="space-y-3 rounded-lg border bg-card p-4">
		<h2 class="font-semibold">Grades</h2>
		<div class="overflow-x-auto rounded-md border">
			<table class="w-full min-w-max text-sm">
				<thead class="border-b bg-muted/50">
					<!-- The name column absorbs the slack (`w-full`) so the money and action
					     columns stay hugged to their content instead of being stretched apart
					     by the table's own `w-full` (#142). -->
					<tr>
						<th class="w-full px-3 py-2 text-left font-medium text-muted-foreground">Grade</th>
						<th class="px-3 py-2 text-right font-medium text-muted-foreground">Min</th>
						<th class="px-3 py-2 text-right font-medium text-muted-foreground">Mid</th>
						<th class="px-3 py-2 text-right font-medium text-muted-foreground">Max</th>
						<th class="px-3 py-2"></th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each data.grades as g (g.id)}
						{@const toggle = toggleGradeGuard(g.id)}
						<tr class="hover:bg-muted/30 {g.isActive ? '' : 'opacity-50'}">
							<td class="px-3 py-2 font-medium">{g.name}</td>
							<td class="whitespace-nowrap px-3 py-2 text-right font-mono text-xs"
								>{formatCurrency(Number(g.minSalary))}</td
							>
							<td class="whitespace-nowrap px-3 py-2 text-right font-mono text-xs"
								>{formatCurrency(Number(g.midSalary))}</td
							>
							<td class="whitespace-nowrap px-3 py-2 text-right font-mono text-xs"
								>{formatCurrency(Number(g.maxSalary))}</td
							>
							<td class="whitespace-nowrap px-3 py-2 text-right">
								<form method="POST" action="?/toggleGrade" use:enhance={toggle.enhance}>
									<input type="hidden" name="id" value={g.id} />
									<button
										type="submit"
										disabled={toggle.busy}
										class={g.isActive ? 'btn-row-danger' : 'btn-row-positive'}
										>{toggle.busy ? 'Saving…' : g.isActive ? 'Deactivate' : 'Activate'}</button
									>
								</form>
							</td>
						</tr>
					{:else}
						<tr
							><td colspan="5" class="px-3 py-6 text-center text-muted-foreground"
								>No grades yet.</td
							></tr
						>
					{/each}
				</tbody>
			</table>
		</div>
		<form
			method="POST"
			action="?/addGrade"
			use:enhance={addGrade.enhance}
			class="flex flex-wrap items-end gap-2 border-t pt-3"
		>
			<input
				name="name"
				placeholder="Grade name"
				required
				class="h-8 w-36 rounded-md border border-input bg-background px-2 text-xs"
			/>
			<input
				name="minSalary"
				type="number"
				min="0"
				step="1000"
				placeholder="Min"
				required
				class="h-8 w-24 rounded-md border border-input bg-background px-2 text-xs"
			/>
			<input
				name="midSalary"
				type="number"
				min="0"
				step="1000"
				placeholder="Mid"
				required
				class="h-8 w-24 rounded-md border border-input bg-background px-2 text-xs"
			/>
			<input
				name="maxSalary"
				type="number"
				min="0"
				step="1000"
				placeholder="Max"
				required
				class="h-8 w-24 rounded-md border border-input bg-background px-2 text-xs"
			/>
			<button
				disabled={addGrade.busy}
				class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
				>{addGrade.busy ? 'Adding…' : 'Add Grade'}</button
			>
		</form>
	</section>

	<!-- Position assignment -->
	<section class="space-y-3 rounded-lg border bg-card p-4">
		<h2 class="font-semibold">Position Grades</h2>
		{#if data.positions.length}
			<div class="overflow-x-auto rounded-md border">
				<table class="w-full min-w-max text-sm">
					<thead class="border-b bg-muted/50">
						<!-- Same column rule as the Grades table above: the title absorbs the
						     slack, the grade picker is pinned right (#142). -->
						<tr>
							<th class="w-full px-3 py-2 text-left font-medium text-muted-foreground">Position</th>
							<!-- Right-aligned so the picker sits against the table edge rather than floating
							     mid-row (#142). Alignment and slack only: this table is min-w-max, under
							     which per-column percentage widths (w-[1%]) collapse every column to zero —
							     verified by screenshot, so size columns here with care. -->
							<th class="px-3 py-2 text-right font-medium text-muted-foreground">Grade</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each data.positions as p (p.id)}
							{@const assign = assignGradeGuard(p.id)}
							<tr class="hover:bg-muted/30">
								<td class="px-3 py-2">{p.title}</td>
								<td class="whitespace-nowrap px-3 py-2">
									<form
										method="POST"
										action="?/assignGrade"
										use:enhance={assign.enhance}
										class="flex items-center justify-end gap-2"
									>
										<input type="hidden" name="positionId" value={p.id} />
										<!-- No submit button: the select auto-submits via requestSubmit(), which
										     bypasses any button `disabled`. The guard cancels the re-entrant
										     submit; disabling the select stops a second change mid-flight. -->
										<select
											name="salaryGradeId"
											disabled={assign.busy}
											onchange={(e) =>
												(e.currentTarget.closest('form') as HTMLFormElement).requestSubmit()}
											class="h-8 rounded-md border border-input bg-background px-2 text-xs disabled:pointer-events-none disabled:opacity-50"
										>
											<option value="" selected={!p.salaryGradeId}>— none —</option>
											{#each data.grades as g (g.id)}
												<option value={g.id} selected={p.salaryGradeId === g.id}>{g.name}</option>
											{/each}
										</select>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p class="text-xs text-muted-foreground">
				No positions defined. Create positions under <a
					href="/settings/org"
					class="text-primary hover:underline">Org Structure</a
				>.
			</p>
		{/if}
	</section>
</div>
