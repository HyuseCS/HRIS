<script lang="ts">
	import { autoDismiss } from '$lib/actions/autoDismiss'
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import Container from '$lib/components/ui/Container.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import Banner from '$lib/components/ui/Banner.svelte'
	import ComplaintCreateDialog, {
		CATEGORY_LABELS
	} from '$lib/components/complaints/ComplaintCreateDialog.svelte'
	import { page } from '$app/stores'
	import { goto } from '$app/navigation'
	import { formatShortDate } from '$lib/utils/format'
	import Pagination from '$lib/components/Pagination.svelte'
	import type { PageData, ActionData } from './$types'
	import Badge from '$lib/components/ui/Badge.svelte'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	let showForm = $state(false)

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

{#snippet actions()}
	<!-- The raise action sits on the title row. -->
	<button
		type="button"
		onclick={() => (showForm = true)}
		class="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
	>
		New inquiry
	</button>
{/snippet}

{#snippet notices()}
	{#if form?.message}
		<Banner kind="success" message={form.message} />
	{/if}
	{#if form?.error && !showForm}
		<div
			class="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive"
		>
			{form.error}
		</div>
	{/if}
{/snippet}

<!-- HR: status filter -->
{#snippet statusFilter()}
	<div class="flex flex-wrap items-center gap-2">
		<span class="text-sm text-muted-foreground">Filter:</span>
		{#each [['', 'All'], ['OPEN', 'Awaiting employee'], ['RESPONDED', 'Awaiting HR'], ['RESOLVED', 'Resolved']] as [val, label] (val)}
			<button
				type="button"
				onclick={() => setStatus(val)}
				class="rounded-full border px-3 py-1 text-xs font-medium {(data.statusFilter ?? '') === val
					? 'border-primary bg-primary/10 text-primary'
					: 'hover:bg-accent'}"
			>
				{label}
			</button>
		{/each}
	</div>
{/snippet}

<div class="flex min-h-[calc(100dvh-6rem)] flex-col gap-6 lg:h-[calc(100dvh-4rem)] lg:min-h-0">
	{#if data.isHr}
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div class="min-w-0 flex-1">
				<PageHeader
					title="HR Inquiries"
					description="Raise a question or concern to an employee and track their response."
				/>
			</div>
			<div class="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:pt-1">
				{@render actions()}
			</div>
		</div>
	{:else}
		<PageHeader
			title="HR Inquiries about you"
			description="Questions HR has raised with you. Open one to reply."
		/>
	{/if}

	{#if form?.message || (form?.error && !showForm)}
		<div use:autoDismiss class="flex shrink-0 flex-col gap-3">
			{@render notices()}
		</div>
	{/if}

	<Container
		tone="card"
		flush
		toolbar={data.isHr ? statusFilter : undefined}
		empty={data.complaints.length === 0}
	>
		<!-- Thread list -->
		<div class="overflow-x-auto">
			<table class="w-full {data.isHr ? 'min-w-[52rem]' : 'min-w-[40rem]'} table-fixed text-sm">
				<thead class="border-b bg-muted/50">
					<tr>
						{#if data.isHr}
							<th class="w-44 px-3 py-2 text-left font-medium text-muted-foreground">Employee</th>
						{/if}
						<th class="px-3 py-2 text-left font-medium text-muted-foreground">Subject</th>
						<th class="w-44 px-3 py-2 text-left font-medium text-muted-foreground">Category</th>
						<th class="w-44 px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
						<th class="w-32 px-3 py-2 text-left font-medium text-muted-foreground">Updated</th>
						<th class="w-24 px-3 py-2"></th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each data.complaints as c (c.id)}
						<tr class="hover:bg-muted/30">
							{#if data.isHr}
								<td class="break-words px-3 py-2 font-medium">
									{c.employee.lastName}, {c.employee.firstName}
								</td>
							{/if}
							<td class="break-words px-3 py-2">{c.subject}</td>
							<td class="break-words px-3 py-2 text-muted-foreground">
								{CATEGORY_LABELS[c.category] ?? c.category}
							</td>
							<td class="px-3 py-2">
								<Badge status={c.status} domain="complaint" />
							</td>
							<td class="px-3 py-2 text-muted-foreground">{formatShortDate(c.updatedAt)}</td>
							<td class="px-3 py-2 text-right">
								<a
									href="/inquiries/{c.id}"
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

		{#snippet emptyState()}
			<EmptyState
				title="No inquiries yet"
				description={data.isHr
					? 'Open one to ask an employee about an issue.'
					: 'HR has not raised anything with you.'}
			/>
		{/snippet}

		{#snippet footer()}
			{#if data.complaints.length && data.isHr && data.pagination}
				<Pagination meta={data.pagination} />
			{:else if data.complaints.length && !data.isHr && data.myPagination}
				<!-- Own key and `myPage` param so the two branches' pagers cannot read each other's page. -->
				<Pagination meta={data.myPagination} />
			{/if}
		{/snippet}
	</Container>
</div>

<!-- HR: new-inquiry form -->
{#if data.isHr}
	<ComplaintCreateDialog
		bind:open={showForm}
		employees={data.employees ?? []}
		categories={data.categories ?? []}
		{form}
	/>
{/if}
