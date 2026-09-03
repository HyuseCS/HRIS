<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import { enhance } from '$app/forms'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { PageData, ActionData } from './$types'
	import Badge from '$lib/components/ui/Badge.svelte'

	let { data, form }: { data: PageData; form: ActionData } = $props()
	let showCreate = $state(false)
	let editingId = $state<string | null>(null)

	// #108: a double-click would create a duplicate position / re-run the update.
	const createPosition = createSubmitGuard(() => async ({ update }) => {
		await update()
		showCreate = false
	})
	// Only one row is expanded at a time (`editingId`), so a single guard is safe here.
	const updatePosition = createSubmitGuard(() => async ({ update }) => {
		await update({ reset: false })
		editingId = null
	})

	// The employee-assignment table renders one form per employee, so each row needs its own guard
	// — a shared one would disable every other row's Save while one is in flight. Plain object,
	// not `$state`: each guard holds its own reactive `busy`, the map only memoises identity.
	const assignGuards: Record<string, ReturnType<typeof createSubmitGuard>> = {}
	const assignGuard = (id: string) => (assignGuards[id] ??= createSubmitGuard())

	const inputClass =
		'mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

	// Assignment-wall filters. Client-side only: the load already holds every assignable employee,
	// so filtering here costs no query and keeps the bulk-assign workflow on one screen.
	let search = $state('')
	let onlyUnassigned = $state(false)
	const filteredEmployees = $derived.by(() => {
		const q = search.trim().toLowerCase()
		return data.employees.filter(
			(e) =>
				(!onlyUnassigned || !e.positionId) &&
				(q === '' || e.name.toLowerCase().includes(q) || e.jobTitle.toLowerCase().includes(q))
		)
	})
	const filtering = $derived(search.trim() !== '' || onlyUnassigned)
</script>

<svelte:head>
	<title>Organization Structure — Veent HRIS</title>
</svelte:head>

<div class="space-y-8">
	<PageHeader title="Organization Structure">
		{#snippet back()}
			<BackButton fallback="/settings" label="Settings" preferFallback />
		{/snippet}
	</PageHeader>

	{#if form?.error}
		<div
			class="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
		>
			{form.error}
		</div>
	{/if}

	<!-- Create position form -->
	{#if showCreate}
		<form
			method="POST"
			action="?/createPosition"
			use:enhance={createPosition.enhance}
			class="rounded-lg border p-4 space-y-4"
		>
			<h2 class="font-semibold">New Position</h2>
			<div class="grid gap-3 sm:grid-cols-3">
				<div>
					<label for="title" class="text-sm font-medium">Title</label>
					<input id="title" name="title" required class={inputClass} />
				</div>
				<div>
					<label for="level" class="text-sm font-medium">Level</label>
					<input id="level" name="level" type="number" min="0" class={inputClass} />
				</div>
				<div>
					<label for="departmentId" class="text-sm font-medium">Department</label>
					<select id="departmentId" name="departmentId" class={inputClass}>
						<option value="">— None —</option>
						{#each data.orgChart as dept (dept.id)}
							<option value={dept.id}>{dept.name}</option>
						{/each}
					</select>
				</div>
			</div>
			<div class="flex gap-2 justify-end">
				<button
					type="button"
					onclick={() => (showCreate = false)}
					class="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancel</button
				>
				<button
					type="submit"
					disabled={createPosition.busy}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
					>{createPosition.busy ? 'Creating…' : 'Create'}</button
				>
			</div>
		</form>
	{/if}

	<!-- Positions catalog -->
	<section class="space-y-3">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<h2 class="text-lg font-semibold">Positions</h2>
			<div
				class="ml-auto flex basis-full shrink-0 flex-wrap items-center justify-end gap-2 sm:basis-auto"
			>
				<a
					href="/settings/org-chart"
					class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">View Org Chart</a
				>
				<button
					onclick={() => (showCreate = !showCreate)}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
				>
					Add Position
				</button>
			</div>
		</div>
		<div class="overflow-x-auto rounded-lg border">
			<table class="w-full text-sm">
				<thead class="border-b bg-muted/50">
					<tr>
						<th class="w-full px-4 py-2 text-left font-medium text-muted-foreground">Title</th>
						<th class="px-4 py-2 text-left font-medium text-muted-foreground">Department</th>
						<th class="px-4 py-2 text-left font-medium text-muted-foreground">Level</th>
						<th class="px-4 py-2 text-left font-medium text-muted-foreground">Salary Grade</th>
						<th class="px-4 py-2 text-left font-medium text-muted-foreground">Employees</th>
						<th class="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
						<th class="w-[1%] whitespace-nowrap px-4 py-2"></th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each data.positions as pos (pos.id)}
						<tr class="hover:bg-muted/30">
							<td class="px-4 py-2 font-medium">{pos.title}</td>
							<td class="px-4 py-2 text-muted-foreground">{pos.department?.name ?? '—'}</td>
							<td class="px-4 py-2 text-muted-foreground">{pos.level ?? '—'}</td>
							<td class="px-4 py-2 text-muted-foreground">{pos.salaryGrade?.name ?? '—'}</td>
							<td class="px-4 py-2 text-muted-foreground">{pos._count.employees}</td>
							<td class="px-4 py-2">
								<Badge
									status={pos.isActive ? 'ACTIVE' : 'INACTIVE'}
									tone={pos.isActive ? 'green' : 'gray'}
								/>
							</td>
							<td class="w-[1%] whitespace-nowrap px-4 py-2 text-right">
								<button
									onclick={() => (editingId = editingId === pos.id ? null : pos.id)}
									class="rounded-md border px-3 py-1 text-xs hover:bg-accent"
								>
									{editingId === pos.id ? 'Close' : 'Edit'}
								</button>
							</td>
						</tr>
						{#if editingId === pos.id}
							<tr class="bg-muted/20">
								<td colspan="7" class="px-4 py-4">
									<form
										method="POST"
										action="?/updatePosition"
										use:enhance={updatePosition.enhance}
										class="grid items-end gap-3 sm:grid-cols-5"
									>
										<input type="hidden" name="id" value={pos.id} />
										<div>
											<label for={'title-' + pos.id} class="text-xs font-medium">Title</label>
											<input
												id={'title-' + pos.id}
												name="title"
												required
												value={pos.title}
												class={inputClass}
											/>
										</div>
										<div>
											<label for={'level-' + pos.id} class="text-xs font-medium">Level</label>
											<input
												id={'level-' + pos.id}
												name="level"
												type="number"
												min="0"
												value={pos.level ?? ''}
												class={inputClass}
											/>
										</div>
										<div>
											<label for={'departmentId-' + pos.id} class="text-xs font-medium"
												>Department</label
											>
											<select
												id={'departmentId-' + pos.id}
												name="departmentId"
												value={pos.departmentId ?? ''}
												class={inputClass}
											>
												<option value="">— None —</option>
												{#each data.orgChart as dept (dept.id)}
													<option value={dept.id}>{dept.name}</option>
												{/each}
											</select>
										</div>
										<div>
											<label for={'salaryGradeId-' + pos.id} class="text-xs font-medium"
												>Salary Grade</label
											>
											<select
												id={'salaryGradeId-' + pos.id}
												name="salaryGradeId"
												value={pos.salaryGradeId ?? ''}
												class={inputClass}
											>
												<option value="">— None —</option>
												{#each data.salaryGrades as g (g.id)}
													<option value={g.id}>{g.name}</option>
												{/each}
											</select>
										</div>
										<div>
											<label for={'isActive-' + pos.id} class="text-xs font-medium">Status</label>
											<select
												id={'isActive-' + pos.id}
												name="isActive"
												value={pos.isActive ? 'true' : 'false'}
												class={inputClass}
											>
												<option value="true">Active</option>
												<option value="false">Inactive</option>
											</select>
										</div>
										<div class="sm:col-span-5 flex justify-end gap-2">
											<button
												type="button"
												onclick={() => (editingId = null)}
												class="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancel</button
											>
											<button
												type="submit"
												disabled={updatePosition.busy}
												class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
												>{updatePosition.busy ? 'Saving…' : 'Save'}</button
											>
										</div>
									</form>
								</td>
							</tr>
						{/if}
					{:else}
						<tr>
							<td colspan="7" class="p-0"><EmptyState title="No positions defined" /></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<!-- Employee ↔ position assignment -->
	<section class="space-y-3">
		<h2 class="text-lg font-semibold">Employee Assignments</h2>
		<p class="text-sm text-muted-foreground">Assign each employee to a position in the catalog.</p>
		<div class="flex flex-wrap items-center gap-3">
			<div class="min-w-56 flex-1">
				<label for="employee-search" class="sr-only">Search employees</label>
				<input
					id="employee-search"
					type="search"
					bind:value={search}
					placeholder="Search by name or job title"
					class="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</div>
			<label class="flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={onlyUnassigned} class="rounded border-input" />
				Only unassigned
			</label>
			<p class="text-sm text-muted-foreground">
				Showing {filteredEmployees.length} of {data.employees.length} employees
			</p>
		</div>
		<div class="overflow-x-auto rounded-lg border">
			<table class="w-full text-sm">
				<thead class="border-b bg-muted/50">
					<tr>
						<th class="w-full px-4 py-2 text-left font-medium text-muted-foreground">Employee</th>
						<th class="px-4 py-2 text-left font-medium text-muted-foreground">Job Title</th>
						<th class="px-4 py-2 text-left font-medium text-muted-foreground">Department</th>
						<th class="px-4 py-2 text-left font-medium text-muted-foreground">Position</th>
						<th class="w-[1%] whitespace-nowrap px-4 py-2"></th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each filteredEmployees as emp (emp.id)}
						{@const assign = assignGuard(emp.id)}
						<tr class="hover:bg-muted/30">
							<td class="px-4 py-2 font-medium">{emp.name}</td>
							<td class="px-4 py-2 text-muted-foreground">{emp.jobTitle}</td>
							<td class="px-4 py-2 text-muted-foreground">{emp.departmentName ?? '—'}</td>
							<td class="px-4 py-2" colspan="2">
								<form
									method="POST"
									action="?/assignEmployee"
									use:enhance={assign.enhance}
									class="flex items-center gap-2"
								>
									<input type="hidden" name="employeeId" value={emp.id} />
									<select
										name="positionId"
										value={emp.positionId ?? ''}
										class="flex h-9 w-56 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									>
										<option value="">— Unassigned —</option>
										{#each data.positions as pos (pos.id)}
											<option value={pos.id}>{pos.title}</option>
										{/each}
									</select>
									<button
										type="submit"
										disabled={assign.busy}
										class="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
										>{assign.busy ? 'Saving…' : 'Save'}</button
									>
								</form>
							</td>
						</tr>
					{:else}
						<tr>
							<td colspan="5" class="p-0">
								{#if filtering}
									<EmptyState
										variant="no-results"
										title="No employees match this filter"
										description="Clear the search box or untick “Only unassigned” to see the full list."
									/>
								{:else}
									<EmptyState title="No employees found" />
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>
