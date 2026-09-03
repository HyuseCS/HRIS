<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	let showCreate = $state(false)
	let newName = $state('')
	let editingId = $state<string | null>(null)
	let editName = $state('')

	// #108: a double-click here would create a duplicate department / apply the rename twice.
	// Only one create form and one edit row are mounted at a time, so one guard each is safe.
	const create = createSubmitGuard(() => async ({ update }) => {
		await update()
		showCreate = false
		newName = ''
	})
	const rename = createSubmitGuard(() => async ({ update }) => {
		await update()
		editingId = null
		editName = ''
	})

	function startEdit(id: string, name: string) {
		editingId = id
		editName = name
	}

	function cancelEdit() {
		editingId = null
		editName = ''
	}

	// Members panel (#71): expand one department at a time to see current members
	// and transfer other employees in (routed through the employee-update path so
	// the move lands in employment history).
	let membersId = $state<string | null>(null)
	let assignId = $state('')
	const deptName = $derived(new Map(data.departments.map((d) => [d.id, d.name])))
	const membersOf = (id: string) => data.employees.filter((e) => e.departmentId === id)
	const assignableTo = (id: string) => data.employees.filter((e) => e.departmentId !== id)
	function toggleMembers(id: string) {
		membersId = membersId === id ? null : id
		assignId = ''
	}

	// #108: a double-click would fire two transfers and write two employment-history rows.
	// Only one department's members panel is open at a time, so a single guard is safe here.
	const assign = createSubmitGuard(() => async ({ update }) => {
		await update()
		assignId = ''
	})

	// #178: the head picker. Options are this department's ACTIVE members — the invariant the
	// service enforces is that the head belongs to the department — plus the sitting head when
	// they are not on that roster (e.g. ON_LEAVE), so opening the panel cannot silently blank
	// them out and clear the column on save.
	function headOptions(dept: PageData['departments'][number]) {
		const members = membersOf(dept.id)
		const head = dept.head
		return head && !members.some((m) => m.id === head.id)
			? [{ id: head.id, firstName: head.firstName, lastName: head.lastName }, ...members]
			: members
	}

	// #108: one members panel is open at a time, so a single guard covers the one mounted form.
	const setHead = createSubmitGuard(() => async ({ update }) => {
		await update()
	})

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('en-PH', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		})
	}
</script>

<svelte:head>
	<title>Departments — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader title="Departments" />

	{#if form?.error}
		<div
			class="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive"
		>
			{form.error}
		</div>
	{/if}

	<!-- The create toggle sits directly above the form it opens and the list it adds to. -->
	<div class="flex justify-end">
		<button
			onclick={() => {
				showCreate = !showCreate
				newName = ''
			}}
			class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
		>
			{showCreate ? 'Cancel' : 'Add Department'}
		</button>
	</div>

	<!-- Inline create form -->
	{#if showCreate}
		<form
			method="POST"
			action="?/create"
			use:enhance={create.enhance}
			class="flex items-center gap-3 rounded-md border bg-muted/50 p-4"
		>
			<!-- The form only mounts on user action, so focusing it is expected. -->
			<!-- svelte-ignore a11y_autofocus -->
			<input
				name="name"
				bind:value={newName}
				placeholder="Department name…"
				required
				autofocus
				class="flex h-9 w-64 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
			<button
				type="submit"
				disabled={create.busy}
				class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
			>
				{create.busy ? 'Creating…' : 'Create'}
			</button>
			<button
				type="button"
				onclick={() => {
					showCreate = false
					newName = ''
				}}
				class="rounded-md border px-4 py-2 text-sm hover:bg-accent"
			>
				Cancel
			</button>
		</form>
	{/if}

	<!-- Departments table -->
	<div class="overflow-x-auto rounded-md border">
		<table class="w-full min-w-max text-sm">
			<thead class="border-b bg-muted/50">
				<tr>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Employees</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
					<th class="px-4 py-3"></th>
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each data.departments as dept (dept.id)}
					<tr class="hover:bg-muted/30">
						<td class="px-4 py-3">
							{#if editingId === dept.id}
								<form
									method="POST"
									action="?/update"
									use:enhance={rename.enhance}
									class="flex items-center gap-2"
								>
									<input type="hidden" name="id" value={dept.id} />
									<input
										name="name"
										bind:value={editName}
										required
										class="flex h-8 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									/>
									<button
										type="submit"
										disabled={rename.busy}
										class="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
									>
										{rename.busy ? 'Saving…' : 'Save'}
									</button>
									<button
										type="button"
										onclick={cancelEdit}
										class="rounded-md border px-3 py-1 text-xs hover:bg-accent"
									>
										Cancel
									</button>
								</form>
							{:else}
								<span class="font-medium">{dept.name}</span>
							{/if}
						</td>
						<td class="px-4 py-3 text-muted-foreground">
							{dept._count.employees}
						</td>
						<td class="px-4 py-3 text-muted-foreground">
							{formatDate(dept.createdAt)}
						</td>
						<td class="px-4 py-3 text-right">
							{#if editingId !== dept.id}
								<div class="flex justify-end gap-2">
									<button
										onclick={() => toggleMembers(dept.id)}
										class="rounded-md border px-3 py-1 text-xs hover:bg-accent"
									>
										{membersId === dept.id ? 'Hide Members' : 'Members'}
									</button>
									<button
										onclick={() => startEdit(dept.id, dept.name)}
										class="rounded-md border px-3 py-1 text-xs hover:bg-accent"
									>
										Edit
									</button>
								</div>
							{/if}
						</td>
					</tr>
					{#if membersId === dept.id}
						<tr class="bg-muted/20">
							<td colspan="4" class="px-4 py-4">
								<div class="space-y-3">
									{#if membersOf(dept.id).length}
										<ul class="flex flex-wrap gap-2">
											{#each membersOf(dept.id) as emp (emp.id)}
												<li>
													<!-- ?from so the shared employee page's Back returns here, not the
													     role-based /employees fallback, on reload/direct entry (#113). -->
													<a
														href="/employees/{emp.id}?from=/departments"
														class="rounded-full border bg-card px-3 py-1 text-xs hover:border-primary/40"
														>{emp.lastName}, {emp.firstName}
														<span class="text-muted-foreground">· {emp.employeeNumber}</span></a
													>
												</li>
											{/each}
										</ul>
									{:else}
										<p class="text-xs text-muted-foreground">
											No active employees in this department.
										</p>
									{/if}
									{#if data.canSetHead}
										<form
											method="POST"
											action="?/setHead"
											use:enhance={setHead.enhance}
											class="flex flex-wrap items-center gap-2"
										>
											<input type="hidden" name="departmentId" value={dept.id} />
											<label for="head-{dept.id}" class="text-xs text-muted-foreground"
												>Department head</label
											>
											<select
												id="head-{dept.id}"
												name="headEmployeeId"
												value={dept.headEmployeeId ?? ''}
												class="h-8 max-w-xs rounded-md border border-input bg-background px-2 text-xs"
											>
												<option value="">No head assigned</option>
												{#each headOptions(dept) as emp (emp.id)}
													<option value={emp.id}>{emp.lastName}, {emp.firstName}</option>
												{/each}
											</select>
											<button
												type="submit"
												disabled={setHead.busy}
												class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
												>{setHead.busy ? 'Saving…' : 'Save head'}</button
											>
											<span class="text-xs text-muted-foreground"
												>Signs the Department Head slot on this department's performance reviews.</span
											>
										</form>
									{/if}
									<form
										method="POST"
										action="?/assignEmployee"
										use:enhance={assign.enhance}
										class="flex flex-wrap items-center gap-2"
									>
										<input type="hidden" name="departmentId" value={dept.id} />
										<select
											name="employeeId"
											bind:value={assignId}
											required
											class="h-8 max-w-xs rounded-md border border-input bg-background px-2 text-xs"
										>
											<option value="" disabled>Assign an employee…</option>
											{#each assignableTo(dept.id) as emp (emp.id)}
												<option value={emp.id}
													>{emp.lastName}, {emp.firstName} ({deptName.get(emp.departmentId) ??
														'—'})</option
												>
											{/each}
										</select>
										<button
											type="submit"
											disabled={!assignId || assign.busy}
											class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
											>{assign.busy ? 'Assigning…' : 'Assign here'}</button
										>
										<span class="text-xs text-muted-foreground"
											>Transfers are recorded in the employee's employment history.</span
										>
									</form>
								</div>
							</td>
						</tr>
					{/if}
				{:else}
					<tr>
						<td colspan="4" class="px-4 py-8 text-center text-muted-foreground">
							No departments yet. Add one to get started.
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
