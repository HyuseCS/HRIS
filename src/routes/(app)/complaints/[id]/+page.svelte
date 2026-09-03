<script lang="ts">
	import { enhance } from '$app/forms'
	import { formatShortDate } from '$lib/utils/format'
	import { manilaDateTime } from '$lib/utils/dates'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
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

	const complaint = $derived(data.complaint)
	const employeeUserId = $derived(complaint.employee.user.id)
	const resolved = $derived(complaint.status === 'RESOLVED')

	const reply = createSubmitGuard()
	const resolveGuard = createSubmitGuard()

	// A message is "from the employee" when its author is the inquiry's subject; everything
	// else is an HR/staff reply. Drives the left/right bubble alignment.
	const authorLabel = (authorId: string, email: string) =>
		authorId === employeeUserId
			? `${complaint.employee.firstName} ${complaint.employee.lastName}`
			: email
</script>

<svelte:head>
	<title>{complaint.subject} — Inquiries — Veent HRIS</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6">
	<div>
		<a href="/complaints" class="text-sm text-muted-foreground hover:text-foreground"
			>← Back to inquiries</a
		>
	</div>

	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">{complaint.subject}</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				{CATEGORY_LABELS[complaint.category] ?? complaint.category}
				· For {complaint.employee.firstName}
				{complaint.employee.lastName} ({complaint.employee.employeeNumber}) · Opened {formatShortDate(
					complaint.createdAt
				)}
			</p>
		</div>
		<Badge status={complaint.status} domain="complaint" />
	</div>

	{#if form?.message}
		<div
			class="rounded-md border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-400"
		>
			{form.message}
		</div>
	{/if}
	{#if form?.error}
		<div
			class="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive"
		>
			{form.error}
		</div>
	{/if}

	<!-- Thread -->
	<div class="space-y-3">
		{#each complaint.messages as m (m.id)}
			{@const mine = m.author.id === employeeUserId}
			<div class="flex {mine ? 'justify-start' : 'justify-end'}">
				<div
					class="max-w-[85%] rounded-lg border p-3 {mine
						? 'bg-card'
						: 'border-primary/30 bg-primary/5'}"
				>
					<div class="mb-1 flex items-baseline gap-2">
						<span class="text-xs font-semibold">{authorLabel(m.author.id, m.author.email)}</span>
						<span class="text-[11px] text-muted-foreground">{manilaDateTime(m.createdAt)}</span>
					</div>
					<p class="whitespace-pre-wrap text-sm">{m.body}</p>
				</div>
			</div>
		{/each}
	</div>

	<!-- Reply -->
	{#if resolved}
		<p class="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
			This inquiry is resolved. No further replies can be added.
		</p>
	{:else if data.isHr || data.isSubject}
		<!-- Reply and Resolve are separate (sibling) forms — never nest one form in another. -->
		<form method="POST" action="?/reply" use:enhance={reply.enhance} class="space-y-3">
			<label for="body" class="text-sm font-medium">
				{data.isSubject ? 'Your response' : 'Reply'}
			</label>
			<textarea
				id="body"
				name="body"
				required
				rows="3"
				placeholder={data.isSubject ? 'Write your response to HR…' : 'Reply to the employee…'}
				class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			></textarea>
			<div class="flex justify-end">
				<button
					type="submit"
					disabled={reply.busy}
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
				>
					{reply.busy ? 'Sending…' : 'Send'}
				</button>
			</div>
		</form>

		{#if data.isHr}
			<form
				method="POST"
				action="?/resolve"
				use:enhance={resolveGuard.enhance}
				class="border-t pt-3"
			>
				<button
					type="submit"
					disabled={resolveGuard.busy}
					class="rounded-md border border-green-500/30 px-4 py-2 text-sm font-medium text-green-600 hover:bg-green-500/10 disabled:pointer-events-none disabled:opacity-50 dark:text-green-400"
				>
					{resolveGuard.busy ? 'Resolving…' : 'Mark resolved'}
				</button>
			</form>
		{/if}
	{/if}
</div>
