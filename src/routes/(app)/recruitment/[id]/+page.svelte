<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import ApplicantKanban from '$lib/components/recruitment/ApplicantKanban.svelte'
	import { formatShortDate } from '$lib/utils/format'
	import { canAny } from '$lib/rbac'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	// #108: the three status forms are mutually exclusive branches, so only one is ever
	// mounted — a guard each is enough to stop a double-click re-firing the same transition.
	const closePosting = submitFeedback()
	const publishPosting = submitFeedback()
	const reopenPosting = submitFeedback()

	// #108: each hired applicant row is its own `?/convert` form and a double-click here creates a
	// duplicate employee. A shared guard would disable the whole list while any one row is in
	// flight, so create one lazily per applicant id. Plain object, not `$state` — each guard owns
	// its own reactive `busy`, this map only memoises identity.
	const convertGuards: Record<string, ReturnType<typeof submitFeedback>> = {}
	const convertGuard = (id: string) => (convertGuards[id] ??= submitFeedback())

	// One guard per board row (#117) so saving one channel doesn't freeze the others.
	const channelGuards: Record<string, ReturnType<typeof submitFeedback>> = {}
	const channelGuard = (id: string) => (channelGuards[id] ??= submitFeedback())

	const { posting, applicants, userRoles, boards, postedCount, boardCount, stillLive } =
		$derived(data)

	const channelInputClass =
		'h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

	// Mirror the server guard (MANAGE_HR) so promoted Managers (#133) see the HR controls
	// they're actually allowed to use, not just HR_ADMIN/SUPER_ADMIN.
	const isHrAdmin = $derived(canAny(userRoles, 'MANAGE_HR'))

	const hiredApplicants = $derived(
		applicants.filter((a: { currentStage: string }) => a.currentStage === 'HIRED')
	)

	function statusBadgeClass(status: string) {
		if (status === 'OPEN') return 'bg-green-500/15 text-green-400'
		if (status === 'CLOSED') return 'bg-gray-500/15 text-gray-400'
		return 'bg-yellow-500/15 text-yellow-400'
	}
</script>

<svelte:head>
	<title>{posting.title} — Recruitment — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<!-- Posting Header -->
	<div class="rounded-lg border p-6 space-y-4">
		<div class="space-y-2">
			<PageHeader title={posting.title}>
				{#snippet back()}
					<span
						class="rounded-full px-2.5 py-0.5 text-xs font-medium {statusBadgeClass(
							posting.status
						)}"
					>
						{posting.status}
					</span>
				{/snippet}
			</PageHeader>
			<div class="space-y-1">
				<div class="flex flex-wrap gap-4 text-sm text-muted-foreground">
					{#if posting.department}
						<span>{posting.department.name}</span>
					{/if}
					{#if posting.postedAt}
						<span>Posted {formatShortDate(posting.postedAt)}</span>
					{/if}
					{#if boardCount > 0}
						<span>Posted on {postedCount} of {boardCount} boards</span>
					{/if}
				</div>
			</div>

			<!-- Only `setChannel` errors used to render (down in the boards list), so a publish or
			     a stage move that a server rule refused read as a no-op. -->
			{#if (form?.action === 'updateStatus' || form?.action === 'advanceStage') && form?.error}
				<Banner kind="error" message={form.error} />
			{/if}

			<!-- The posting actions sit under the summary they act on, not on the title row. -->
			<div class="flex flex-wrap justify-end gap-2">
				{#if posting.status === 'OPEN'}
					<a
						href="/recruitment/{posting.id}/apply"
						class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
					>
						Add Applicant
					</a>
				{/if}
				{#if isHrAdmin}
					{#if posting.status === 'OPEN'}
						<form method="POST" action="?/updateStatus" use:enhance={closePosting.enhance}>
							<input type="hidden" name="status" value="CLOSED" />
							<button
								type="submit"
								disabled={closePosting.busy}
								class="rounded-md border px-4 py-2 text-sm font-medium text-destructive border-destructive/30 hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
							>
								{closePosting.busy ? 'Closing…' : 'Close Posting'}
							</button>
						</form>
					{:else if posting.status === 'DRAFT'}
						<form method="POST" action="?/updateStatus" use:enhance={publishPosting.enhance}>
							<input type="hidden" name="status" value="OPEN" />
							<button
								type="submit"
								disabled={publishPosting.busy}
								class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
							>
								{publishPosting.busy ? 'Publishing…' : 'Publish'}
							</button>
						</form>
					{:else if posting.status === 'CLOSED'}
						<form method="POST" action="?/updateStatus" use:enhance={reopenPosting.enhance}>
							<input type="hidden" name="status" value="OPEN" />
							<button
								type="submit"
								disabled={reopenPosting.busy}
								class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
							>
								{reopenPosting.busy ? 'Reopening…' : 'Reopen'}
							</button>
						</form>
					{/if}
					<a href="/recruitment" class="rounded-md border px-4 py-2 text-sm hover:bg-accent">
						Back
					</a>
				{/if}
			</div>
		</div>

		{#if posting.description}
			<div class="prose prose-sm max-w-none border-t pt-4">
				<p class="text-sm text-muted-foreground whitespace-pre-wrap">{posting.description}</p>
			</div>
		{/if}
	</div>

	<!-- Posted on — manual job-board tracking (#117) -->
	{#if isHrAdmin}
		<div class="rounded-lg border p-4 space-y-3">
			<div class="flex items-center justify-between gap-2">
				<h2 class="text-sm font-semibold">Posted on</h2>
				<a href="/settings/job-boards" class="text-xs text-muted-foreground hover:underline"
					>Manage boards</a
				>
			</div>

			<!-- Close-the-loop: a CLOSED role still live somewhere needs a takedown. -->
			{#if stillLive.length > 0}
				<Banner kind="warning">
					This posting is <span class="font-medium">closed</span> but still live on
					{stillLive.map((b) => b.name).join(', ')}. Take it down there so a filled role stops
					collecting applicants.
				</Banner>
			{/if}

			{#if boards.length === 0}
				<p class="text-sm text-muted-foreground">
					No job boards yet — <a href="/settings/job-boards" class="underline"
						>add some in Settings</a
					>.
				</p>
			{:else}
				<ul class="space-y-2">
					{#each boards as b (b.boardId)}
						{@const guard = channelGuard(b.boardId)}
						<li>
							<form method="POST" action="?/setChannel" use:enhance={guard.enhance}>
								<input type="hidden" name="boardId" value={b.boardId} />
								<div class="flex flex-wrap items-center gap-2">
									<input
										id="ch-{b.boardId}"
										type="checkbox"
										name="posted"
										checked={b.live}
										class="peer align-middle"
									/>
									<label for="ch-{b.boardId}" class="text-sm font-medium">{b.name}</label>
									{#if b.live && b.postedAt}
										<span class="text-xs text-muted-foreground"
											>· posted {formatShortDate(b.postedAt)}</span
										>
									{:else if b.status === 'TAKEN_DOWN'}
										<span class="text-xs text-muted-foreground">· taken down</span>
									{/if}
									<!-- URL field: a following sibling of the checkbox, revealed once ticked. -->
									<input
										name="url"
										value={b.url ?? ''}
										placeholder="https://…"
										class="order-last hidden w-full flex-1 peer-checked:block sm:order-none sm:w-auto {channelInputClass}"
									/>
									<button
										type="submit"
										disabled={guard.busy}
										class="rounded-md border px-3 py-1 text-xs font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
										>{guard.busy ? '…' : 'Save'}</button
									>
								</div>
								{#if form && 'channelBoardId' in form && form.channelBoardId === b.boardId}
									<p class="mt-1 text-xs text-red-600 dark:text-red-400">{form.error}</p>
								{/if}
							</form>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	<!-- Hired Applicants — Convert to Employee -->
	{#if isHrAdmin && hiredApplicants.length > 0}
		<div class="rounded-lg border p-4 space-y-3">
			<h2 class="text-sm font-semibold">Hired Applicants — Convert to Employee</h2>
			{#if form?.action === 'convert' && form?.error}
				<Banner kind="error" message={form.error} />
			{/if}
			<div class="space-y-2">
				{#each hiredApplicants as applicant (applicant.id)}
					<div class="flex items-center justify-between rounded-md border px-4 py-2">
						<div>
							<p class="text-sm font-medium">{applicant.firstName} {applicant.lastName}</p>
							<p class="text-xs text-muted-foreground">{applicant.email}</p>
						</div>
						{#if !applicant.convertedToEmployeeId}
							{@const convert = convertGuard(applicant.id)}
							<form method="POST" action="?/convert" use:enhance={convert.enhance}>
								<input type="hidden" name="applicantId" value={applicant.id} />
								<button
									type="submit"
									disabled={convert.busy}
									class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
								>
									{convert.busy ? 'Converting…' : 'Convert to Employee'}
								</button>
							</form>
						{:else}
							<span class="text-xs text-green-600 font-medium">Already converted</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Applicant Kanban -->
	<div class="space-y-2">
		<h2 class="text-lg font-semibold">Applicants ({applicants.length})</h2>
		<ApplicantKanban {applicants} readonly={!isHrAdmin} />
	</div>
</div>
