<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	const guards: Record<string, ReturnType<typeof createSubmitGuard>> = {}
	const guard = (id: string) => (guards[id] ??= createSubmitGuard())
</script>

<svelte:head>
	<title>Posting Approvers — Veent HRIS</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<PageHeader
		title="Posting Approvers"
		description="Job postings must be approved before they go live. Choose who signs off each department's postings (for example, the Senior Developer for Software Developers). Departments left unset fall back to HR."
	>
		{#snippet back()}
			<BackButton fallback="/settings" label="Settings" preferFallback />
		{/snippet}
	</PageHeader>

	{#if form?.error}
		<Banner kind="error" message={form.error} />
	{/if}

	<div class="card-scroll overflow-x-auto rounded-lg border">
		<table class="w-full text-sm">
			<thead class="border-b bg-muted/50">
				<tr>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Department</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Approver</th>
					<th class="px-4 py-3"></th>
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each data.rows as row (row.departmentId)}
					{@const g = guard(row.departmentId)}
					<tr>
						<td class="px-4 py-3 font-medium">{row.departmentName}</td>
						<td class="px-4 py-3" colspan="2">
							<form
								method="POST"
								action="?/set"
								use:enhance={g.enhance}
								class="flex items-center gap-2"
							>
								<input type="hidden" name="departmentId" value={row.departmentId} />
								<select
									name="approverId"
									class="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
								>
									<option value="">— HR (fallback) —</option>
									{#each data.employees as e (e.id)}
										<option value={e.id} selected={e.id === row.approverId}
											>{e.lastName}, {e.firstName} · {e.jobTitle}</option
										>
									{/each}
								</select>
								<button
									type="submit"
									disabled={g.busy}
									class="h-9 rounded-md border px-3 text-xs font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
									>{g.busy ? 'Saving…' : 'Save'}</button
								>
							</form>
						</td>
					</tr>
				{:else}
					<tr><td colspan="3" class="p-0"><EmptyState title="No departments yet" /></td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
