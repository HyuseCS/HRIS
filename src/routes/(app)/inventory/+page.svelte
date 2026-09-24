<script lang="ts">
	import SearchInput from '$lib/components/ui/SearchInput.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import { page } from '$app/stores'
	import Banner from '$lib/components/ui/Banner.svelte'
	import ConfirmButton from '$lib/components/ui/ConfirmButton.svelte'
	import Dialog from '$lib/components/ui/Dialog.svelte'
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
	import { formatCurrency } from '$lib/utils/format'
	import type { SubmitFunction } from '@sveltejs/kit'
	import type { PageData, ActionData } from './$types'
	import Badge from '$lib/components/ui/Badge.svelte'
	import { INVENTORY_STATUS_LABELS } from '$lib/labels'
	import Pagination from '$lib/components/Pagination.svelte'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	let editingId = $state<string | null>(null)
	let creating = $state(false)
	let listEl = $state<HTMLElement>()

	const editing = $derived(data.items.find((i) => i.id === editingId) ?? null)
	const dialogOpen = $derived(creating || editing !== null)
	const views: { value: 'list' | 'grid'; label: string }[] = [
		{ value: 'grid', label: 'Grid' },
		{ value: 'list', label: 'List' }
	]

	function inventoryHref(view: 'list' | 'grid') {
		const params = new URLSearchParams($page.url.searchParams)
		if (view === 'grid') params.set('view', 'grid')
		else params.delete('view')
		params.delete('page')
		const qs = params.toString()
		return qs ? `/inventory?${qs}` : '/inventory'
	}

	const save = submitFeedback({
		inner:
			() =>
			async ({ update, result }) => {
				await update({ reset: false })
				if (result.type === 'success') {
					editingId = null
					creating = false
				}
			}
	})

	const afterDelete: SubmitFunction =
		() =>
		async ({ update, result }) => {
			await update({ reset: false })
			if (result.type === 'success') {
				editingId = null
				listEl?.focus()
			}
		}

	const empName = (e: { firstName: string; lastName: string }) => `${e.lastName}, ${e.firstName}`

	const inputClass =
		'h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
	const th = 'px-4 py-2 text-left text-xs font-medium text-muted-foreground'
</script>

<svelte:head>
	<title>Inventory — Veent HRIS</title>
</svelte:head>

{#snippet itemTable()}
	<table class="hidden w-full table-fixed text-sm sm:table">
		<caption class="sr-only">Inventory items. Select an item to edit it.</caption>
		<thead class="border-b bg-muted/50">
			<tr>
				<th scope="col" class="{th} w-[38%] md:w-[26%]">Item</th>
				<th scope="col" class="{th} hidden md:table-cell">Category</th>
				<th scope="col" class="{th} w-20 text-right">Qty</th>
				<th scope="col" class="{th} hidden xl:table-cell">Location</th>
				<th scope="col" class="{th} w-28">Status</th>
				<th scope="col" class="{th} hidden lg:table-cell">Assigned to</th>
				<th scope="col" class="{th} hidden w-28 text-right xl:table-cell">Value</th>
			</tr>
		</thead>
		<tbody class="divide-y">
			{#each data.items as item (item.id)}
				<tr
					class="relative h-12 transition-colors hover:bg-accent/40 has-[button:focus-visible]:outline has-[button:focus-visible]:outline-2 has-[button:focus-visible]:-outline-offset-2 has-[button:focus-visible]:outline-ring"
					data-name={item.name}
				>
					<td class="px-4 py-1.5">
						<button
							type="button"
							onclick={() => (editingId = item.id)}
							class="block w-full min-w-0 cursor-pointer text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
						>
							<span class="sr-only">Edit </span>
							<span class="block truncate font-medium text-foreground">{item.name}</span>
							{#if item.serialNumber}
								<span class="block truncate text-xs tabular-nums text-muted-foreground"
									>{item.serialNumber}</span
								>
							{/if}
						</button>
					</td>
					<td class="hidden truncate px-4 py-1.5 text-muted-foreground md:table-cell"
						>{item.category}</td
					>
					<td class="whitespace-nowrap px-4 py-1.5 text-right tabular-nums">
						{item.quantity}<span class="text-muted-foreground"> {item.unit}</span>
					</td>
					<td class="hidden truncate px-4 py-1.5 text-muted-foreground xl:table-cell"
						>{item.location ?? '—'}</td
					>
					<td class="px-4 py-1.5"><Badge status={item.status} domain="inventory" /></td>
					<td class="hidden truncate px-4 py-1.5 text-muted-foreground lg:table-cell">
						{item.assignedTo ? empName(item.assignedTo) : '—'}
					</td>
					<td class="hidden whitespace-nowrap px-4 py-1.5 text-right tabular-nums xl:table-cell">
						{item.value == null ? '—' : formatCurrency(Number(item.value))}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/snippet}

{#snippet itemCard(item: (typeof data.items)[number])}
	<li
		class="relative rounded-lg border bg-card transition-colors hover:bg-accent/40 has-[button:focus-visible]:outline has-[button:focus-visible]:outline-2 has-[button:focus-visible]:-outline-offset-2 has-[button:focus-visible]:outline-ring"
		data-name={item.name}
	>
		<button
			type="button"
			onclick={() => (editingId = item.id)}
			class="flex w-full min-w-0 cursor-pointer flex-col gap-2 p-3 text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
		>
			<span class="sr-only">Edit </span>
			<span class="flex min-w-0 items-start justify-between gap-2">
				<span class="min-w-0">
					<span class="block truncate font-medium text-foreground">{item.name}</span>
					<span class="block truncate text-xs text-muted-foreground">
						{item.category}{#if item.serialNumber}<span class="tabular-nums">
								· {item.serialNumber}</span
							>{/if}
					</span>
				</span>
				<span class="shrink-0"><Badge status={item.status} domain="inventory" /></span>
			</span>

			<span class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-muted-foreground">
				<span class="tabular-nums text-foreground">{item.quantity} {item.unit}</span>
				{#if item.location}<span class="min-w-0 truncate">{item.location}</span>{/if}
				{#if item.value != null}
					<span class="ml-auto shrink-0 tabular-nums text-foreground"
						>{formatCurrency(Number(item.value))}</span
					>
				{/if}
			</span>

			<span class="flex min-w-0 items-center gap-1.5 border-t pt-2 text-xs text-muted-foreground">
				<span class="shrink-0">Holder</span>
				<span aria-hidden="true">·</span>
				<span class="min-w-0 truncate text-foreground"
					>{item.assignedTo ? empName(item.assignedTo) : 'Unassigned'}</span
				>
			</span>
		</button>
	</li>
{/snippet}

{#snippet cardGrid()}
	<ul class="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-2 xl:grid-cols-3">
		{#each data.items as item (item.id)}{@render itemCard(item)}{/each}
	</ul>
{/snippet}

<div class="space-y-6">
	<PageHeader
		title="Inventory"
		description="Track company assets, equipment, and supplies — quantity, location, status, and who holds each item."
	/>

	{#if form?.error}
		<Banner kind="error" message={form.error} autoDismiss />
	{/if}

	<!-- Filters -->
	<form method="GET" class="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
		<div class="flex-1 min-w-[12rem]">
			<label for="f-search" class="text-xs font-medium text-muted-foreground">Search</label>
			<SearchInput
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

	<datalist id="categories">
		{#each data.categories as c (c)}<option value={c}></option>{/each}
	</datalist>

	<!-- List -->
	<section
		bind:this={listEl}
		tabindex="-1"
		class="overflow-hidden rounded-lg border bg-card focus:outline-none"
	>
		<div class="flex flex-wrap items-center gap-3 border-b px-4 py-3">
			<h2 class="font-semibold">Items</h2>
			<p class="whitespace-nowrap text-sm tabular-nums text-muted-foreground">
				{data.pagination.total}
				{data.pagination.total === 1 ? 'item' : 'items'}
			</p>
			<div class="ml-auto flex items-center gap-3">
				<div role="group" aria-label="View" class="inline-flex rounded-md border p-0.5">
					{#each views as v (v.value)}
						<a
							href={inventoryHref(v.value)}
							aria-current={data.view === v.value ? 'page' : undefined}
							class="rounded px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {data.view ===
							v.value
								? 'bg-muted text-foreground'
								: 'text-muted-foreground hover:text-foreground'}">{v.label}</a
						>
					{/each}
				</div>
				<button
					type="button"
					onclick={() => (creating = true)}
					class="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>Add item</button
				>
			</div>
		</div>

		<div>
			{#if data.items.length === 0}
				<EmptyState
					variant={data.filter.search || data.filter.category || data.filter.status
						? 'no-results'
						: 'empty'}
					title={data.filter.search || data.filter.category || data.filter.status
						? 'No items match these filters'
						: 'No items in the registry yet'}
				>
					{#snippet action()}
						<a
							href="/inventory"
							class="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
							>Clear filters</a
						>
					{/snippet}
				</EmptyState>
			{:else if data.view === 'grid'}
				{@render cardGrid()}
			{:else}
				{@render itemTable()}
				<div class="sm:hidden">{@render cardGrid()}</div>
			{/if}
		</div>

		<div class="has-[nav]:border-t has-[nav]:px-4 has-[nav]:py-3">
			<Pagination meta={data.pagination} />
		</div>
	</section>
</div>

{#if dialogOpen}
	<Dialog
		open
		onclose={() => {
			editingId = null
			creating = false
		}}
		labelledBy="inv-edit-title"
		size="wide"
		scroll
		zIndex={50}
	>
		<div class="flex items-start justify-between gap-3 pb-4">
			<div class="min-w-0">
				<h2 id="inv-edit-title" class="truncate text-lg font-semibold">
					{creating ? 'Add an item' : `Edit ${editing?.name}`}
				</h2>
			</div>
			{#if !creating && editing}
				<ConfirmButton
					action="?/remove"
					title="Delete item?"
					message="This permanently removes {editing.name} from the registry."
					triggerLabel="Delete"
					triggerClass="btn-row-danger shrink-0"
					submit={afterDelete}
				>
					<input type="hidden" name="id" value={editing.id} />
				</ConfirmButton>
			{/if}
		</div>

		<form
			method="POST"
			action={creating ? '?/create' : '?/update'}
			use:enhance={save.enhance}
			class="flex min-h-0 flex-1 flex-col"
		>
			{#if !creating && editing}
				<input type="hidden" name="id" value={editing.id} />
			{/if}

			<div class="min-h-0 flex-1 overflow-y-auto border-t pt-4">
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="grid gap-1.5 sm:col-span-2">
						<label for="i-name" class="text-sm font-medium"
							>Name <span class="text-destructive" aria-hidden="true">*</span></label
						>
						<input
							id="i-name"
							name="name"
							value={editing?.name ?? ''}
							required
							maxlength="120"
							class={inputClass}
						/>
					</div>

					<div class="grid gap-1.5">
						<label for="i-category" class="text-sm font-medium">Category</label>
						<input
							id="i-category"
							name="category"
							list="categories"
							value={editing?.category ?? ''}
							maxlength="60"
							class={inputClass}
						/>
					</div>

					<div class="grid grid-cols-[1fr_6rem] gap-3">
						<div class="grid gap-1.5">
							<label for="i-qty" class="text-sm font-medium">Quantity</label>
							<input
								id="i-qty"
								name="quantity"
								type="number"
								min="0"
								value={editing?.quantity ?? 1}
								class="{inputClass} text-right tabular-nums"
							/>
						</div>
						<div class="grid gap-1.5">
							<label for="i-unit" class="text-sm font-medium">Unit</label>
							<input
								id="i-unit"
								name="unit"
								value={editing?.unit ?? ''}
								maxlength="20"
								class={inputClass}
							/>
						</div>
					</div>

					<div class="grid gap-1.5">
						<label for="i-location" class="text-sm font-medium">Location</label>
						<input
							id="i-location"
							name="location"
							value={editing?.location ?? ''}
							maxlength="120"
							class={inputClass}
						/>
					</div>

					<div class="grid gap-1.5">
						<label for="i-serial" class="text-sm font-medium">Serial / tag</label>
						<input
							id="i-serial"
							name="serialNumber"
							value={editing?.serialNumber ?? ''}
							maxlength="120"
							class="{inputClass} tabular-nums"
						/>
					</div>

					<div class="grid gap-1.5">
						<label for="i-status" class="text-sm font-medium">Status</label>
						<select id="i-status" name="status" aria-describedby="i-status-hint" class={inputClass}>
							{#each Object.entries(INVENTORY_STATUS_LABELS) as [val, label] (val)}
								<option value={val} selected={editing?.status === val}>{label}</option>
							{/each}
						</select>
						<p id="i-status-hint" class="text-xs text-muted-foreground">
							Assigned needs an employee below. Any other status clears the holder.
						</p>
					</div>

					<div class="grid gap-1.5">
						<label for="i-assigned" class="text-sm font-medium">Assigned to</label>
						<select id="i-assigned" name="assignedToId" class={inputClass}>
							<option value="">— unassigned —</option>
							{#each data.employees as e (e.id)}
								<option value={e.id} selected={editing?.assignedToId === e.id}>{empName(e)}</option>
							{/each}
							{#if editing?.assignedTo && !data.employees.some((e) => e.id === editing?.assignedToId)}
								<!-- Assignee is inactive/offboarded but keep them selectable so a save
								     doesn't silently drop the assignment. -->
								<option value={editing.assignedToId} selected>{empName(editing.assignedTo)}</option>
							{/if}
						</select>
					</div>

					<div class="grid gap-1.5">
						<label for="i-value" class="text-sm font-medium">Value (₱)</label>
						<input
							id="i-value"
							name="value"
							type="number"
							min="0"
							step="0.01"
							value={editing?.value == null ? '' : Number(editing.value)}
							class="{inputClass} text-right tabular-nums"
						/>
					</div>

					<div class="grid gap-1.5 sm:col-span-2">
						<label for="i-notes" class="text-sm font-medium">Notes</label>
						<textarea
							id="i-notes"
							name="notes"
							rows="2"
							maxlength="2000"
							class="rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>{editing?.notes ?? ''}</textarea
						>
					</div>
				</div>
			</div>

			<div class="mt-4 flex items-center justify-end gap-2 border-t pt-4">
				<button
					type="button"
					onclick={() => {
						editingId = null
						creating = false
					}}
					class="h-9 rounded-md border px-4 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>Cancel</button
				>
				<button
					type="submit"
					disabled={save.busy}
					class="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
					>{save.busy ? 'Saving…' : creating ? 'Create item' : 'Save'}</button
				>
			</div>
		</form>
	</Dialog>
{/if}
