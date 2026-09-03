<script lang="ts">
	import Banner from '$lib/components/ui/Banner.svelte'
	import { enhance } from '$app/forms'
	import ConfirmButton from '$lib/components/ui/ConfirmButton.svelte'
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { ActionData, PageData } from './$types'

	/**
	 * The evaluation-template list (#178).
	 *
	 * Create posts a name only — the server starts the new template from the shared blank, so the
	 * builder never opens on a void.
	 *
	 * DUPLICATE LIVES IN THE BUILDER, NOT HERE. This page's `load` deliberately does not carry each
	 * template's `structure` (it is the largest field in the row and no list cell shows it), so
	 * there is nothing on this page to copy. Open the template and duplicate it from there.
	 */

	let { data, form }: { data: PageData; form: ActionData } = $props()

	const create = createSubmitGuard()

	// Forms inside {#each} need one guard per row; a shared one would disable every row at once.
	const toggleGuards: Record<string, ReturnType<typeof createSubmitGuard>> = {}
	const toggleGuard = (id: string) => (toggleGuards[id] ??= createSubmitGuard())

	const formError = $derived(form && 'error' in form ? String(form.error) : null)

	/**
	 * Deleting a template SET NULLs `Employee.assignedTemplateId`, so anyone assigned to it is
	 * quietly left with no template. HR is told the number BEFORE confirming rather than
	 * discovering it on the readiness banner afterwards.
	 */
	const deleteMessage = (t: PageData['templates'][number]) =>
		`“${t.name}” will be permanently removed. No review has used it, so nothing already opened is affected.` +
		(t.assignedCount > 0
			? ` ${t.assignedCount} ${t.assignedCount === 1 ? 'employee is' : 'employees are'} assigned to it and will be left with no template.`
			: '')
</script>

<svelte:head>
	<title>Evaluation Templates — Veent HRIS</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6">
	<PageHeader
		title="Evaluation Templates"
		description="The evaluation forms HR issues. Each one prints the categories, criteria, rating scale and signing order you compose here."
	/>

	{#if formError}
		<div class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
			{formError}
		</div>
	{/if}

	{#if data.backfillCount > 0}
		<Banner kind="warning">
			{data.backfillCount} active
			{data.backfillCount === 1 ? 'employee has' : 'employees have'} no assigned template. This is a readiness
			note, not a blocker.
		</Banner>
	{/if}

	<!-- Create -->
	<section class="space-y-3 rounded-lg border bg-card p-4">
		<h2 class="font-semibold">Create a template</h2>
		<form
			method="POST"
			action="?/createTemplate"
			use:enhance={create.enhance}
			class="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
		>
			<div>
				<label for="new-template-name" class="text-xs font-medium text-muted-foreground">
					Template name
				</label>
				<input
					id="new-template-name"
					name="name"
					required
					maxlength="200"
					placeholder="e.g. Account Executive"
					class="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
			</div>
			<button
				type="submit"
				disabled={create.busy}
				class="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
				>{create.busy ? 'Creating…' : 'Create template'}</button
			>
		</form>
		<p class="text-xs text-muted-foreground">
			A new template opens with the standard rating scale, interpretation bands, narrative blocks
			and signing order already filled in, and one category to start from.
		</p>
	</section>

	<!-- List -->
	<section class="rounded-lg border bg-card">
		<h2 class="border-b px-4 py-3 font-semibold">Templates</h2>
		{#if data.templates.length === 0}
			<EmptyState
				variant="empty"
				title="No evaluation templates yet"
				description="Create the first one above, then compose its categories and criteria."
			/>
		{:else}
			<ul class="divide-y">
				{#each data.templates as template (template.id)}
					{@const toggle = toggleGuard(template.id)}
					<li class="flex flex-wrap items-center gap-3 px-4 py-3">
						<div class="min-w-[10rem] flex-1">
							<a
								href="/performance/templates/{template.id}"
								class="font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>{template.name}</a
							>
							<p class="text-xs text-muted-foreground">
								{template.sectionCount}
								{template.sectionCount === 1 ? 'category' : 'categories'}
							</p>
						</div>
						<span
							class="rounded-full px-2 py-0.5 text-[10px] font-medium {template.isActive
								? 'bg-green-500/15 text-green-500'
								: 'bg-muted text-muted-foreground'}"
							>{template.isActive ? 'Active' : 'Inactive'}</span
						>
						<a
							href="/performance/templates/{template.id}"
							class="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent">Open</a
						>
						<form method="POST" action="?/setActive" use:enhance={toggle.enhance}>
							<input type="hidden" name="id" value={template.id} />
							<input type="hidden" name="isActive" value={template.isActive ? 'false' : 'true'} />
							<button
								type="submit"
								disabled={toggle.busy}
								class="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
								>{toggle.busy ? '…' : template.isActive ? 'Deactivate' : 'Activate'}</button
							>
						</form>
						{#if template.reviewCount > 0}
							<!--
								No disabled Delete button here. A used template can never become deletable, so a
								greyed-out control would be a permanently dead affordance HR keeps retrying; the
								reason and the alternative are written out instead.
							-->
							<span class="px-3 py-1.5 text-xs text-muted-foreground">
								Used by {template.reviewCount}
								{template.reviewCount === 1 ? 'review' : 'reviews'} — deactivate instead of deleting
							</span>
						{:else}
							<ConfirmButton
								action="?/deleteTemplate"
								title="Delete template?"
								message={deleteMessage(template)}
								triggerClass="rounded-md border border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400"
							>
								<input type="hidden" name="id" value={template.id} />
							</ConfirmButton>
						{/if}
					</li>
				{/each}
			</ul>
			<p class="border-t px-4 py-3 text-xs text-muted-foreground">
				To build a second form from an existing one, open it and press
				<span class="font-medium">Duplicate</span>. Only active templates can be assigned to
				employees; deactivating one leaves every review already opened against it untouched. Delete
				is only for a template no review has ever used — once one has, deactivating is the only way
				to retire it.
			</p>
		{/if}
	</section>
</div>
