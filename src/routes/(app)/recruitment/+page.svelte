<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import Container from '$lib/components/ui/Container.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import JobPostingCreateDialog from '$lib/components/recruitment/JobPostingCreateDialog.svelte'
	import { enhance } from '$app/forms'
	import { goto } from '$app/navigation'
	import { formatShortDate } from '$lib/utils/format'
	import Pagination from '$lib/components/Pagination.svelte'
	import type { PageData, ActionData } from './$types'
	import Badge from '$lib/components/ui/Badge.svelte'

	let { data, form }: { data: PageData; form: ActionData } = $props()
	let showCreate = $state(false)
	let publishing = $state(false)
	let selectedIds = $state<string[]>([])

	const draftIds = $derived(
		data.postings.filter((p: { status: string }) => p.status === 'DRAFT').map((p) => p.id)
	)
	const selectedDraftIds = $derived(selectedIds.filter((id) => draftIds.includes(id)))
	const allDraftsSelected = $derived(
		draftIds.length > 0 && draftIds.every((id) => selectedIds.includes(id))
	)

	function toggle(id: string) {
		selectedIds = selectedIds.includes(id)
			? selectedIds.filter((x) => x !== id)
			: [...selectedIds, id]
	}
	function toggleAllDrafts() {
		selectedIds = allDraftsSelected
			? selectedIds.filter((id) => !draftIds.includes(id))
			: [...draftIds]
	}
</script>

<svelte:head>
	<title>Recruitment — Veent HRIS</title>
</svelte:head>

{#snippet notices()}
	<!-- The posting actions sit above the list they publish into, not on the title row. -->
	<div class="flex flex-wrap items-center justify-end gap-2">
		<div class="flex items-center gap-2">
			{#if selectedDraftIds.length}
				<form
					method="POST"
					action="?/submitMany"
					use:enhance={() => {
						publishing = true
						return async ({ update }) => {
							selectedIds = []
							await update()
							publishing = false
						}
					}}
				>
					{#each selectedDraftIds as id (id)}
						<input type="hidden" name="ids" value={id} />
					{/each}
					<button
						type="submit"
						disabled={publishing}
						class="rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
					>
						{publishing
							? 'Submitting…'
							: `Submit selected for approval (${selectedDraftIds.length})`}
					</button>
				</form>
			{/if}
			<button
				onclick={() => (showCreate = true)}
				class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
			>
				New Job Posting
			</button>
		</div>
	</div>

	{#if form?.success && form.message}
		<div
			role="status"
			class="rounded-md border border-green-500/20 bg-green-500/10 px-4 py-2 text-sm text-green-600 dark:text-green-400"
		>
			{form.message}
		</div>
	{/if}
	{#if form?.error && !showCreate}
		<div
			role="alert"
			class="rounded-md border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400"
		>
			{form.error}
		</div>
	{/if}
{/snippet}

<div class="flex min-h-[calc(100dvh-6rem)] flex-col gap-6 lg:h-[calc(100dvh-4rem)] lg:min-h-0">
	<PageHeader title="Recruitment" />

	<div class="flex shrink-0 flex-col gap-3">
		{@render notices()}
	</div>

	<Container tone="card" flush empty={data.postings.length === 0}>
		<div class="overflow-x-auto">
			<table class="w-full min-w-[52rem] table-fixed text-sm">
				<thead class="border-b bg-muted/50">
					<tr>
						<th class="w-12 px-4 py-3">
							{#if draftIds.length}
								<input
									type="checkbox"
									checked={allDraftsSelected}
									onchange={toggleAllDrafts}
									title="Select all drafts"
									class="h-4 w-4 rounded border-input"
								/>
							{/if}
						</th>
						<th class="px-4 py-3 text-left font-medium text-muted-foreground">Position</th>
						<th class="w-48 px-4 py-3 text-left font-medium text-muted-foreground">Department</th>
						<th class="w-28 px-4 py-3 text-left font-medium text-muted-foreground">Applicants</th>
						<th class="w-44 px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
						<th class="w-32 px-4 py-3 text-left font-medium text-muted-foreground">Posted</th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each data.postings as jp (jp.id)}
						<tr
							class="cursor-pointer hover:bg-muted/30"
							role="link"
							tabindex="0"
							onclick={() => goto(`/recruitment/${jp.id}`)}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault()
									goto(`/recruitment/${jp.id}`)
								}
							}}
						>
							<td class="px-4 py-3" onclick={(e) => e.stopPropagation()}>
								{#if jp.status === 'DRAFT'}
									<input
										type="checkbox"
										checked={selectedIds.includes(jp.id)}
										onchange={() => toggle(jp.id)}
										class="h-4 w-4 rounded border-input"
									/>
								{/if}
							</td>
							<td class="break-words px-4 py-3 font-medium">
								{jp.title}
								{#if jp.status === 'DRAFT' && jp.rejectionReason}
									<span class="block text-xs font-normal text-red-400"
										>Sent back: {jp.rejectionReason}</span
									>
								{/if}
							</td>
							<td class="break-words px-4 py-3 text-muted-foreground">{jp.department.name}</td>
							<td class="px-4 py-3">{jp._count.applicants}</td>
							<td class="px-4 py-3">
								<Badge status={jp.status} domain="jobPosting" />
							</td>
							<td class="px-4 py-3 text-muted-foreground"
								>{jp.postedAt ? formatShortDate(jp.postedAt) : '—'}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#snippet emptyState()}
			<EmptyState title="No job postings yet" />
		{/snippet}

		{#snippet footer()}
			<Pagination meta={data.pagination} />
		{/snippet}
	</Container>
</div>

<JobPostingCreateDialog bind:open={showCreate} departments={data.departments} {form} />
