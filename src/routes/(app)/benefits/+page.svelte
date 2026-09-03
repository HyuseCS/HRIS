<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import { formatCurrency } from '$lib/utils/format'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { ActionData, PageData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()
	let showCreate = $state(false)

	// #108: a double-click here would create a duplicate plan or a duplicate enrollment.
	const createPlan = createSubmitGuard()
	const enroll = createSubmitGuard()

	// One guard per enrollment row — a shared guard would freeze every row's status select at once.
	const statusGuards = new Map<string, ReturnType<typeof createSubmitGuard>>()
	function statusGuard(id: string) {
		let g = statusGuards.get(id)
		if (!g) {
			g = createSubmitGuard()
			statusGuards.set(id, g)
		}
		return g
	}
</script>

<svelte:head>
	<title>Benefits — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader title="Benefits" />

	<!-- Top level, not inside the collapsible create form: enroll and setEnrollmentStatus
	     are submitted from the plan list below, and their failures must surface too. -->
	{#if form?.error}
		<div class="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
			{form.error}
		</div>
	{/if}

	<!-- The create toggle sits directly above the form it opens and the plan list it adds to. -->
	<div class="flex justify-end">
		<button
			onclick={() => (showCreate = !showCreate)}
			class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
		>
			Add Plan
		</button>
	</div>

	<!-- Create form -->
	{#if showCreate}
		<form
			method="POST"
			action="?/createPlan"
			use:enhance={createPlan.enhance}
			class="rounded-lg border bg-card p-4 space-y-4"
		>
			<h2 class="font-semibold">New Benefit Plan</h2>
			<div class="grid gap-3 sm:grid-cols-2">
				<div>
					<label for="name" class="text-sm font-medium">Name</label>
					<input
						id="name"
						name="name"
						required
						class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<div>
					<label for="type" class="text-sm font-medium">Type</label>
					<select
						id="type"
						name="type"
						class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="HMO">HMO</option>
						<option value="INSURANCE">Insurance</option>
						<option value="RETIREMENT">Retirement</option>
						<option value="ALLOWANCE">Allowance</option>
						<option value="LEAVE_CREDIT">Leave Credit</option>
						<option value="OTHER">Other</option>
					</select>
				</div>
				<div>
					<label for="provider" class="text-sm font-medium">Provider</label>
					<input
						id="provider"
						name="provider"
						class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<div>
					<label for="description" class="text-sm font-medium">Description</label>
					<input
						id="description"
						name="description"
						class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<div>
					<label for="employeeCost" class="text-sm font-medium">Employee Cost (PHP)</label>
					<input
						id="employeeCost"
						name="employeeCost"
						type="number"
						min="0"
						step="100"
						class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<div>
					<label for="employerCost" class="text-sm font-medium">Employer Cost (PHP)</label>
					<input
						id="employerCost"
						name="employerCost"
						type="number"
						min="0"
						step="100"
						class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
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
					disabled={createPlan.busy}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
					>{createPlan.busy ? 'Creating…' : 'Create'}</button
				>
			</div>
		</form>
	{/if}

	<!-- Table -->
	<div class="overflow-x-auto rounded-lg border">
		<table class="w-full min-w-max text-sm">
			<thead class="border-b bg-muted/50">
				<tr>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Provider</th>
					<th class="px-4 py-3 text-right font-medium text-muted-foreground">EE Cost</th>
					<th class="px-4 py-3 text-right font-medium text-muted-foreground">ER Cost</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Active</th>
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each data.plans as plan (plan.id)}
					<tr class="hover:bg-muted/30">
						<td class="px-4 py-3 font-medium">{plan.name}</td>
						<td class="px-4 py-3 text-muted-foreground">{plan.type.replace('_', ' ')}</td>
						<td class="px-4 py-3 text-muted-foreground">{plan.provider ?? '—'}</td>
						<td class="px-4 py-3 text-right tabular-nums"
							>{plan.employeeCost != null ? formatCurrency(Number(plan.employeeCost)) : '—'}</td
						>
						<td class="px-4 py-3 text-right tabular-nums"
							>{plan.employerCost != null ? formatCurrency(Number(plan.employerCost)) : '—'}</td
						>
						<td class="px-4 py-3">
							<span
								class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium {plan.isActive
									? 'bg-green-500/15 text-green-400'
									: 'bg-gray-500/15 text-gray-400'}"
							>
								{plan.isActive ? 'Active' : 'Inactive'}
							</span>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="6" class="p-0"
							><EmptyState
								title="No benefit plans yet"
								description="Add a plan to start enrolling employees."
							/></td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Enrollments -->
	<section class="space-y-3">
		<h2 class="text-lg font-semibold">Enrollments</h2>

		<form
			method="POST"
			action="?/enroll"
			use:enhance={enroll.enhance}
			class="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-4"
		>
			<div class="grid gap-1">
				<label for="enr-emp" class="text-xs font-medium text-muted-foreground">Employee</label>
				<select
					id="enr-emp"
					name="employeeId"
					required
					class="h-9 rounded-md border border-input bg-background px-2 text-sm"
				>
					{#each data.employees as e (e.id)}<option value={e.id}>{e.lastName}, {e.firstName}</option
						>{/each}
				</select>
			</div>
			<div class="grid gap-1">
				<label for="enr-plan" class="text-xs font-medium text-muted-foreground">Plan</label>
				<select
					id="enr-plan"
					name="benefitPlanId"
					required
					class="h-9 rounded-md border border-input bg-background px-2 text-sm"
				>
					{#each data.plans.filter((p) => p.isActive) as p (p.id)}<option value={p.id}
							>{p.name}</option
						>{/each}
				</select>
			</div>
			<div class="grid gap-1">
				<label for="enr-cov" class="text-xs font-medium text-muted-foreground">Coverage</label>
				<input
					id="enr-cov"
					name="coverageLevel"
					placeholder="e.g. Self + 1"
					class="h-9 w-32 rounded-md border border-input bg-background px-2 text-sm"
				/>
			</div>
			<div class="grid gap-1">
				<label for="enr-date" class="text-xs font-medium text-muted-foreground">Effective</label>
				<input
					id="enr-date"
					name="effectiveDate"
					type="date"
					required
					class="h-9 rounded-md border border-input bg-background px-2 text-sm"
				/>
			</div>
			<button
				disabled={enroll.busy}
				class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
				>{enroll.busy ? 'Enrolling…' : 'Enroll'}</button
			>
		</form>

		<div class="overflow-x-auto rounded-lg border">
			<table class="w-full min-w-max text-sm">
				<thead class="border-b bg-muted/50">
					<tr>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Employee</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Plan</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Coverage</th>
						<th class="px-4 py-3 text-right font-medium text-muted-foreground">EE Cost</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
						<th class="px-4 py-3"></th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each data.enrollments as en (en.id)}
						{@const setEnrollmentStatus = statusGuard(en.id)}
						<tr class="hover:bg-muted/30 {en.status === 'ACTIVE' ? '' : 'opacity-60'}">
							<td class="px-4 py-3">{en.employee.lastName}, {en.employee.firstName}</td>
							<td class="px-4 py-3 text-muted-foreground">{en.plan.name}</td>
							<td class="px-4 py-3 text-muted-foreground">{en.coverageLevel ?? '—'}</td>
							<td class="px-4 py-3 text-right tabular-nums"
								>{en.plan.employeeCost != null
									? formatCurrency(Number(en.plan.employeeCost))
									: '—'}</td
							>
							<td class="px-4 py-3">
								<span
									class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium {en.status ===
									'ACTIVE'
										? 'bg-green-500/15 text-green-400'
										: en.status === 'WAIVED'
											? 'bg-yellow-500/15 text-yellow-400'
											: 'bg-gray-500/15 text-gray-400'}">{en.status}</span
								>
							</td>
							<td class="px-4 py-3 text-right">
								<form
									method="POST"
									action="?/setEnrollmentStatus"
									use:enhance={setEnrollmentStatus.enhance}
									class="inline-flex items-center gap-1"
								>
									<input type="hidden" name="id" value={en.id} />
									<select
										name="status"
										aria-label="Change enrollment status"
										disabled={setEnrollmentStatus.busy}
										onchange={(e) =>
											(e.currentTarget.closest('form') as HTMLFormElement).requestSubmit()}
										class="h-7 rounded border border-input bg-background px-1 text-xs disabled:pointer-events-none disabled:opacity-50"
									>
										<option value="ACTIVE" selected={en.status === 'ACTIVE'}>Active</option>
										<option value="WAIVED" selected={en.status === 'WAIVED'}>Waived</option>
										<option value="TERMINATED" selected={en.status === 'TERMINATED'}
											>Terminated</option
										>
									</select>
								</form>
							</td>
						</tr>
					{:else}
						<tr><td colspan="6" class="p-0"><EmptyState title="No enrollments yet" /></td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>
