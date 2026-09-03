<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import ConfirmButton from '$lib/components/ui/ConfirmButton.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { PageData, ActionData } from './$types'
	import Badge from '$lib/components/ui/Badge.svelte'
	import { BRANCH_STATUS_LABELS } from '$lib/labels'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	const add = createSubmitGuard()
	const saveGuards: Record<string, ReturnType<typeof createSubmitGuard>> = {}
	const saveGuard = (id: string) => (saveGuards[id] ??= createSubmitGuard())
	const reopenGuards: Record<string, ReturnType<typeof createSubmitGuard>> = {}
	const reopenGuard = (id: string) => (reopenGuards[id] ??= createSubmitGuard())

	const empName = (e: { firstName: string; lastName: string }) => `${e.lastName}, ${e.firstName}`

	const inputClass =
		'h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
	const cellInputClass =
		'h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
</script>

<svelte:head>
	<title>Stores — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader
		title="Stores"
		description="Your physical stores — address, contact, branch manager, and who works out of each. Closing a branch keeps its crew on record; it just stops accepting new assignments."
	/>

	{#if form?.error}
		<Banner kind="error" message={form.error} />
	{/if}

	<!-- Filters -->
	<form method="GET" class="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
		<div class="min-w-[12rem] flex-1">
			<label for="f-search" class="text-xs font-medium text-muted-foreground">Search</label>
			<input
				id="f-search"
				name="search"
				value={data.filter.search}
				placeholder="Name, address, phone"
				class="mt-1 {inputClass}"
			/>
		</div>
		<div>
			<label for="f-status" class="text-xs font-medium text-muted-foreground">Status</label>
			<select id="f-status" name="status" class="mt-1 {inputClass}">
				<option value="">All</option>
				{#each Object.entries(BRANCH_STATUS_LABELS) as [val, label] (val)}
					<option value={val} selected={data.filter.status === val}>{label}</option>
				{/each}
			</select>
		</div>
		<button type="submit" class="h-9 rounded-md border px-4 text-sm font-medium hover:bg-accent"
			>Filter</button
		>
		{#if data.filter.search || data.filter.status}
			<a
				href="/branches"
				class="h-9 rounded-md border px-4 text-sm font-medium leading-9 hover:bg-accent">Clear</a
			>
		{/if}
	</form>

	<!-- Add -->
	<details class="rounded-lg border bg-card">
		<summary class="cursor-pointer px-4 py-3 font-semibold">Add a branch</summary>
		<form
			method="POST"
			action="?/create"
			use:enhance={add.enhance}
			class="grid gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-3"
		>
			<div>
				<label for="a-name" class="text-xs font-medium text-muted-foreground">Name *</label>
				<input
					id="a-name"
					name="name"
					required
					maxlength="120"
					placeholder="e.g. Trinoma Mall"
					class="mt-1 {inputClass}"
				/>
			</div>
			<div class="lg:col-span-2">
				<label for="a-address" class="text-xs font-medium text-muted-foreground">Address</label>
				<input id="a-address" name="address" maxlength="300" class="mt-1 {inputClass}" />
			</div>
			<div>
				<label for="a-phone" class="text-xs font-medium text-muted-foreground">Contact phone</label>
				<input id="a-phone" name="contactPhone" maxlength="40" class="mt-1 {inputClass}" />
			</div>
			<div>
				<label for="a-manager" class="text-xs font-medium text-muted-foreground">
					Branch manager <span class="text-muted-foreground/70">(optional)</span>
				</label>
				<select id="a-manager" name="managerId" class="mt-1 {inputClass}">
					<option value="">— No manager —</option>
					{#each data.employees as e (e.id)}
						<option value={e.id}>{empName(e)}</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="a-status" class="text-xs font-medium text-muted-foreground">Status</label>
				<select id="a-status" name="status" class="mt-1 {inputClass}">
					{#each Object.entries(BRANCH_STATUS_LABELS) as [val, label] (val)}
						<option value={val}>{label}</option>
					{/each}
				</select>
			</div>
			<div class="sm:col-span-2 lg:col-span-3">
				<label for="a-notes" class="text-xs font-medium text-muted-foreground">Notes</label>
				<input id="a-notes" name="notes" maxlength="2000" class="mt-1 {inputClass}" />
			</div>
			<div class="sm:col-span-2 lg:col-span-3">
				<p class="mb-2 text-xs text-muted-foreground">
					Naming a manager also assigns them to this branch.
				</p>
				<button
					type="submit"
					disabled={add.busy}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
					>{add.busy ? 'Adding…' : 'Add branch'}</button
				>
			</div>
		</form>
	</details>

	<!-- List -->
	<section class="space-y-3 rounded-lg border bg-card p-4">
		<h2 class="font-semibold">Stores ({data.branches.length})</h2>
		{#if data.branches.length === 0}
			<p class="text-sm text-muted-foreground">
				No branches match — add one above or adjust the filters.
			</p>
		{:else}
			<div class="overflow-x-auto rounded-md border">
				<table class="w-full min-w-max text-sm">
					<thead class="border-b bg-muted/50">
						<tr>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Address</th>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Phone</th>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Manager</th>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
							<th class="px-3 py-2 text-right font-medium text-muted-foreground">Staff</th>
							<th class="px-3 py-2"></th>
							<th class="px-3 py-2"></th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each data.branches as b (b.id)}
							{@const save = saveGuard(b.id)}
							{@const reopen = reopenGuard(b.id)}
							<tr
								class="hover:bg-muted/30 {b.status === 'CLOSED' ? 'opacity-60' : ''}"
								data-name={b.name}
							>
								<td class="px-3 py-2">
									<input
										form="edit-{b.id}"
										name="name"
										value={b.name}
										required
										maxlength="120"
										class="{cellInputClass} w-44"
									/>
								</td>
								<td class="px-3 py-2">
									<input
										form="edit-{b.id}"
										name="address"
										value={b.address ?? ''}
										maxlength="300"
										class="{cellInputClass} w-64"
									/>
								</td>
								<td class="px-3 py-2">
									<input
										form="edit-{b.id}"
										name="contactPhone"
										value={b.contactPhone ?? ''}
										maxlength="40"
										class="{cellInputClass} w-32"
									/>
								</td>
								<td class="px-3 py-2">
									<select form="edit-{b.id}" name="managerId" class="{cellInputClass} w-44">
										<option value="">— No manager —</option>
										{#each data.employees as e (e.id)}
											<option value={e.id} selected={b.managerId === e.id}>{empName(e)}</option>
										{/each}
									</select>
								</td>
								<td class="px-3 py-2">
									<!-- Status is a badge, not an editable field: changes go through the toggle
									     below so "closing clears the manager" can't be bypassed by a plain Save. -->
									<input form="edit-{b.id}" type="hidden" name="status" value={b.status} />
									<Badge status={b.status} domain="branch" />
								</td>
								<td class="px-3 py-2 text-right">
									<a href="/employees?branch={b.id}" class="text-primary hover:underline"
										>{data.headcount[b.id] ?? 0}</a
									>
								</td>
								<td class="px-3 py-2 text-right">
									<form method="POST" action="?/update" id="edit-{b.id}" use:enhance={save.enhance}>
										<input type="hidden" name="id" value={b.id} />
										<button
											type="submit"
											disabled={save.busy}
											class="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
											>{save.busy ? 'Saving…' : 'Save'}</button
										>
									</form>
								</td>
								<td class="px-3 py-2 text-right">
									{#if b.status === 'OPEN'}
										<ConfirmButton
											action="?/toggle"
											title="Close this branch?"
											message="Its crew stay on record and keep counting toward its roster. The branch stops accepting new assignments and its manager is cleared."
											confirmText="Close"
											triggerLabel="Close"
											triggerClass="rounded-md border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400"
										>
											<input type="hidden" name="id" value={b.id} />
										</ConfirmButton>
									{:else}
										<form method="POST" action="?/toggle" use:enhance={reopen.enhance}>
											<input type="hidden" name="id" value={b.id} />
											<button
												type="submit"
												disabled={reopen.busy}
												class="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
												>{reopen.busy ? '…' : 'Reopen'}</button
											>
										</form>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="text-xs text-muted-foreground">
				Staff counts link to that branch's roster. <a href="/employees" class="underline"
					>{data.unassigned}</a
				> active employees are not assigned to a branch.
			</p>
		{/if}
	</section>
</div>
