<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import ConfirmButton from '$lib/components/ui/ConfirmButton.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import { formatCurrency } from '$lib/utils/format'
	import type { PageData, ActionData } from './$types'
	import Badge from '$lib/components/ui/Badge.svelte'
	import { INVENTORY_STATUS_LABELS } from '$lib/labels'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	const add = createSubmitGuard()
	const saveGuards: Record<string, ReturnType<typeof createSubmitGuard>> = {}
	const saveGuard = (id: string) => (saveGuards[id] ??= createSubmitGuard())

	const empName = (e: { firstName: string; lastName: string }) => `${e.lastName}, ${e.firstName}`

	const inputClass =
		'h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
	const cellInputClass =
		'h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
</script>

<svelte:head>
	<title>Inventory — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader
		title="Inventory"
		description="Track company assets, equipment, and supplies — quantity, location, status, and who holds each item."
	/>

	{#if form?.error}
		<Banner kind="error" message={form.error} />
	{/if}

	<!-- Filters -->
	<form method="GET" class="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
		<div class="flex-1 min-w-[12rem]">
			<label for="f-search" class="text-xs font-medium text-muted-foreground">Search</label>
			<input
				id="f-search"
				name="search"
				value={data.filter.search}
				placeholder="Name, serial, category, location"
				class="mt-1 {inputClass}"
			/>
		</div>
		<div>
			<label for="f-category" class="text-xs font-medium text-muted-foreground">Category</label>
			<select id="f-category" name="category" class="mt-1 {inputClass}">
				<option value="">All</option>
				{#each data.categories as c (c)}
					<option value={c} selected={data.filter.category === c}>{c}</option>
				{/each}
			</select>
		</div>
		<div>
			<label for="f-status" class="text-xs font-medium text-muted-foreground">Status</label>
			<select id="f-status" name="status" class="mt-1 {inputClass}">
				<option value="">All</option>
				{#each Object.entries(INVENTORY_STATUS_LABELS) as [val, label] (val)}
					<option value={val} selected={data.filter.status === val}>{label}</option>
				{/each}
			</select>
		</div>
		<button type="submit" class="h-9 rounded-md border px-4 text-sm font-medium hover:bg-accent"
			>Filter</button
		>
		{#if data.filter.search || data.filter.category || data.filter.status}
			<a
				href="/inventory"
				class="h-9 rounded-md border px-4 text-sm font-medium leading-9 hover:bg-accent">Clear</a
			>
		{/if}
	</form>

	<!-- Add item -->
	<details class="rounded-lg border bg-card">
		<summary class="cursor-pointer px-4 py-3 font-semibold">Add an item</summary>
		<form
			method="POST"
			action="?/create"
			use:enhance={add.enhance}
			class="grid gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-3"
		>
			<div>
				<label for="a-name" class="text-xs font-medium text-muted-foreground">Name *</label>
				<input id="a-name" name="name" required maxlength="120" class="mt-1 {inputClass}" />
			</div>
			<div>
				<label for="a-category" class="text-xs font-medium text-muted-foreground">Category</label>
				<input
					id="a-category"
					name="category"
					list="categories"
					placeholder="e.g. Laptop"
					class="mt-1 {inputClass}"
				/>
			</div>
			<div>
				<label for="a-location" class="text-xs font-medium text-muted-foreground">Location</label>
				<input
					id="a-location"
					name="location"
					placeholder="e.g. Main office"
					class="mt-1 {inputClass}"
				/>
			</div>
			<div class="flex gap-2">
				<div class="flex-1">
					<label for="a-qty" class="text-xs font-medium text-muted-foreground">Quantity</label>
					<input
						id="a-qty"
						name="quantity"
						type="number"
						min="0"
						value="1"
						class="mt-1 {inputClass}"
					/>
				</div>
				<div class="w-24">
					<label for="a-unit" class="text-xs font-medium text-muted-foreground">Unit</label>
					<input id="a-unit" name="unit" placeholder="pc" class="mt-1 {inputClass}" />
				</div>
			</div>
			<div>
				<label for="a-status" class="text-xs font-medium text-muted-foreground">Status</label>
				<select id="a-status" name="status" class="mt-1 {inputClass}">
					{#each Object.entries(INVENTORY_STATUS_LABELS) as [val, label] (val)}
						<option value={val}>{label}</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="a-assigned" class="text-xs font-medium text-muted-foreground"
					>Assigned to <span class="text-muted-foreground/70">(if assigned)</span></label
				>
				<select id="a-assigned" name="assignedToId" class="mt-1 {inputClass}">
					<option value="">— unassigned —</option>
					{#each data.employees as e (e.id)}
						<option value={e.id}>{empName(e)}</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="a-serial" class="text-xs font-medium text-muted-foreground">Serial / tag</label>
				<input id="a-serial" name="serialNumber" class="mt-1 {inputClass}" />
			</div>
			<div>
				<label for="a-value" class="text-xs font-medium text-muted-foreground">Value (₱)</label>
				<input
					id="a-value"
					name="value"
					type="number"
					min="0"
					step="0.01"
					class="mt-1 {inputClass}"
				/>
			</div>
			<div class="sm:col-span-2 lg:col-span-3">
				<label for="a-notes" class="text-xs font-medium text-muted-foreground">Notes</label>
				<input id="a-notes" name="notes" maxlength="2000" class="mt-1 {inputClass}" />
			</div>
			<div class="sm:col-span-2 lg:col-span-3">
				<button
					type="submit"
					disabled={add.busy}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
					>{add.busy ? 'Adding…' : 'Add item'}</button
				>
			</div>
		</form>
	</details>

	<datalist id="categories">
		{#each data.categories as c (c)}<option value={c}></option>{/each}
	</datalist>

	<!-- List -->
	<section class="space-y-3 rounded-lg border bg-card p-4">
		<h2 class="font-semibold">Items ({data.items.length})</h2>
		{#if data.items.length === 0}
			<p class="text-sm text-muted-foreground">
				No items match — add one above or adjust the filters.
			</p>
		{:else}
			<div class="overflow-x-auto rounded-md border">
				<table class="w-full min-w-max text-sm">
					<thead class="border-b bg-muted/50">
						<tr>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Category</th>
							<th class="px-3 py-2 text-right font-medium text-muted-foreground">Qty</th>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Unit</th>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Location</th>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Assigned to</th>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Serial</th>
							<th class="px-3 py-2 text-right font-medium text-muted-foreground">Value</th>
							<th class="px-3 py-2"></th>
							<th class="px-3 py-2"></th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each data.items as item (item.id)}
							{@const save = saveGuard(item.id)}
							<tr class="hover:bg-muted/30" data-name={item.name}>
								<td class="px-3 py-2">
									<input
										form="edit-{item.id}"
										name="name"
										value={item.name}
										required
										class="{cellInputClass} w-40"
									/>
								</td>
								<td class="px-3 py-2">
									<input
										form="edit-{item.id}"
										name="category"
										value={item.category}
										list="categories"
										class="{cellInputClass} w-32"
									/>
								</td>
								<td class="px-3 py-2 text-right">
									<input
										form="edit-{item.id}"
										name="quantity"
										type="number"
										min="0"
										value={item.quantity}
										class="{cellInputClass} w-20 text-right"
									/>
								</td>
								<td class="px-3 py-2">
									<input
										form="edit-{item.id}"
										name="unit"
										value={item.unit}
										class="{cellInputClass} w-16"
									/>
								</td>
								<td class="px-3 py-2">
									<input
										form="edit-{item.id}"
										name="location"
										value={item.location ?? ''}
										class="{cellInputClass} w-32"
									/>
								</td>
								<td class="px-3 py-2">
									<select form="edit-{item.id}" name="status" class="{cellInputClass} w-28">
										{#each Object.entries(INVENTORY_STATUS_LABELS) as [val, label] (val)}
											<option value={val} selected={item.status === val}>{label}</option>
										{/each}
									</select>
									<span class="ml-1 hidden sm:inline">
										<Badge status={item.status} domain="inventory" />
									</span>
								</td>
								<td class="px-3 py-2">
									<select form="edit-{item.id}" name="assignedToId" class="{cellInputClass} w-40">
										<option value="">— unassigned —</option>
										{#each data.employees as e (e.id)}
											<option value={e.id} selected={item.assignedToId === e.id}
												>{empName(e)}</option
											>
										{/each}
										{#if item.assignedTo && !data.employees.some((e) => e.id === item.assignedToId)}
											<!-- Assignee is inactive/offboarded but keep them selectable so a save
											     doesn't silently drop the assignment. -->
											<option value={item.assignedToId} selected>{empName(item.assignedTo)}</option>
										{/if}
									</select>
								</td>
								<td class="px-3 py-2">
									<input
										form="edit-{item.id}"
										name="serialNumber"
										value={item.serialNumber ?? ''}
										class="{cellInputClass} w-28"
									/>
								</td>
								<td class="px-3 py-2 text-right">
									<input
										form="edit-{item.id}"
										name="value"
										type="number"
										min="0"
										step="0.01"
										value={item.value == null ? '' : Number(item.value)}
										class="{cellInputClass} w-24 text-right"
									/>
									{#if item.value != null}
										<span class="block text-[10px] tabular-nums text-muted-foreground"
											>{formatCurrency(Number(item.value))}</span
										>
									{/if}
								</td>
								<td class="px-3 py-2 text-right">
									<form
										method="POST"
										action="?/update"
										id="edit-{item.id}"
										use:enhance={save.enhance}
									>
										<input type="hidden" name="id" value={item.id} />
										<button
											type="submit"
											disabled={save.busy}
											class="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
											>{save.busy ? 'Saving…' : 'Save'}</button
										>
									</form>
								</td>
								<td class="px-3 py-2 text-right">
									<ConfirmButton
										action="?/remove"
										title="Delete item?"
										message="This permanently removes {item.name} from the registry."
										triggerLabel="Delete"
										triggerClass="rounded-md border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400"
									>
										<input type="hidden" name="id" value={item.id} />
									</ConfirmButton>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="text-xs text-muted-foreground">
				Edit a row's fields and press <span class="font-medium">Save</span>. Setting status to
				<span class="font-medium">Assigned</span> requires choosing an employee.
			</p>
		{/if}
	</section>
</div>
