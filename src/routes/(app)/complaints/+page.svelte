<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import { page } from '$app/stores'
	import { goto } from '$app/navigation'
	import { formatShortDate } from '$lib/utils/format'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import Pagination from '$lib/components/Pagination.svelte'
	import type { PageData, ActionData } from './$types'
	import Badge from '$lib/components/ui/Badge.svelte'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	const CATEGORY_LABELS: Record<string, string> = {
		CLASSIFICATION: 'Employment classification',
		ATTENDANCE: 'Attendance',
		CONDUCT: 'Conduct',
		PERFORMANCE: 'Performance',
		OTHER: 'Other'
	}

	const open = createSubmitGuard()
	let showForm = $state(false)

	// Red-border the specific field(s) the server rejected, and repopulate the values a failed
	// submit sent back (#142). `values`/`fieldErrors` only ride along on the fail() branch.
	const invalid = (name: string) =>
		(form as { fieldErrors?: Record<string, string[]> } | null)?.fieldErrors?.[name]
			? true
			: undefined
	const values = $derived((form as { values?: Record<string, string> } | null)?.values)

	function setStatus(value: string) {
		const url = new URL($page.url)
		if (value) url.searchParams.set('status', value)
		else url.searchParams.delete('status')
		url.searchParams.delete('page')
		goto(url, { keepFocus: true })
	}
</script>

<svelte:head>
	<title>Inquiries — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader
		title={data.isHr ? 'HR Inquiries' : 'HR Inquiries about you'}
		description={data.isHr
			? 'Raise a question or concern to an employee and track their response.'
			: 'Questions HR has raised with you. Open one to reply.'}
	/>

	<!-- The raise action sits directly above the form it opens, not on the title row. -->
	{#if data.isHr}
		<div class="flex justify-end">
			<button
				type="button"
				onclick={() => (showForm = !showForm)}
				class="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
			>
				{showForm ? 'Close' : 'New inquiry'}
			</button>
		</div>
	{/if}

	{#if form?.message}
		<Banner kind="success" message={form.message} />
	{/if}
	{#if form?.error}
		<div
			class="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive"
		>
			{form.error}
		</div>
	{/if}

	<!-- HR: new-inquiry form -->
	{#if data.isHr && showForm}
		<form
			method="POST"
			action="?/open"
			use:enhance={open.enhance}
			class="space-y-4 rounded-lg border p-6"
		>
			<h2 class="font-semibold">Open a new inquiry</h2>
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label for="employeeId" class="text-sm font-medium"
						>Employee <span class="text-destructive">*</span></label
					>
					<select
						id="employeeId"
						name="employeeId"
						aria-invalid={invalid('employeeId')}
						required
						class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="">Select employee…</option>
						{#each data.employees ?? [] as emp (emp.id)}
							<option value={emp.id} selected={values?.employeeId === emp.id}>
								{emp.lastName}, {emp.firstName} ({emp.employeeNumber})
							</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="category" class="text-sm font-medium"
						>Category <span class="text-destructive">*</span></label
					>
					<select
						id="category"
						name="category"
						class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{#each data.categories ?? [] as cat (cat)}
							<option value={cat} selected={(values?.category ?? 'OTHER') === cat}>
								{CATEGORY_LABELS[cat] ?? cat}
							</option>
						{/each}
					</select>
				</div>
			</div>
			<div>
				<label for="subject" class="text-sm font-medium"
					>Subject <span class="text-destructive">*</span></label
				>
				<input
					id="subject"
					name="subject"
					aria-invalid={invalid('subject')}
					required
					maxlength="200"
					value={values?.subject ?? ''}
					placeholder="e.g. Confirm your employment classification"
					class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</div>
			<div>
				<label for="message" class="text-sm font-medium"
					>Message <span class="text-destructive">*</span></label
				>
				<textarea
					id="message"
					name="message"
					aria-invalid={invalid('message')}
					required
					rows="4"
					value={values?.message ?? ''}
					placeholder="Describe the question or concern for the employee to respond to."
					class="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				></textarea>
			</div>
			<div class="flex justify-end">
				<button
					type="submit"
					disabled={open.busy}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
				>
					{open.busy ? 'Opening…' : 'Open inquiry'}
				</button>
			</div>
		</form>
	{/if}

	<!-- HR: status filter -->
	{#if data.isHr}
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-sm text-muted-foreground">Filter:</span>
			{#each [['', 'All'], ['OPEN', 'Awaiting employee'], ['RESPONDED', 'Awaiting HR'], ['RESOLVED', 'Resolved']] as [val, label] (val)}
				<button
					type="button"
					onclick={() => setStatus(val)}
					class="rounded-full border px-3 py-1 text-xs font-medium {(data.statusFilter ?? '') ===
					val
						? 'border-primary bg-primary/10 text-primary'
						: 'hover:bg-accent'}"
				>
					{label}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Thread list -->
	{#if data.complaints.length}
		<div class="overflow-hidden rounded-md border">
			<table class="w-full text-sm">
				<thead class="border-b bg-muted/50">
					<tr>
						{#if data.isHr}
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Employee</th>
						{/if}
						<th class="px-3 py-2 text-left font-medium text-muted-foreground">Subject</th>
						<th class="px-3 py-2 text-left font-medium text-muted-foreground">Category</th>
						<th class="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
						<th class="px-3 py-2 text-left font-medium text-muted-foreground">Updated</th>
						<th class="px-3 py-2"></th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each data.complaints as c (c.id)}
						<tr class="hover:bg-muted/30">
							{#if data.isHr}
								<td class="px-3 py-2 font-medium">
									{c.employee.lastName}, {c.employee.firstName}
								</td>
							{/if}
							<td class="px-3 py-2">{c.subject}</td>
							<td class="px-3 py-2 text-muted-foreground">
								{CATEGORY_LABELS[c.category] ?? c.category}
							</td>
							<td class="px-3 py-2">
								<Badge status={c.status} domain="complaint" />
							</td>
							<td class="px-3 py-2 text-muted-foreground">{formatShortDate(c.updatedAt)}</td>
							<td class="px-3 py-2 text-right">
								<a
									href="/complaints/{c.id}"
									class="rounded-md border px-3 py-1 text-xs font-medium hover:bg-accent"
								>
									Open
								</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if data.isHr && data.pagination}
			<Pagination meta={data.pagination} />
		{/if}
	{:else}
		<div class="rounded-md border border-dashed">
			<EmptyState
				title="No inquiries yet"
				description={data.isHr
					? 'Open one to ask an employee about an issue.'
					: 'HR has not raised anything with you.'}
			/>
		</div>
	{/if}
</div>
