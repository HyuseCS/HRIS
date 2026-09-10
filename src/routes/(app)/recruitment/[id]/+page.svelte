<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import ApplicantKanban from '$lib/components/recruitment/ApplicantKanban.svelte'
	import ConfirmButton from '$lib/components/ui/ConfirmButton.svelte'
	import Dialog from '$lib/components/ui/Dialog.svelte'
	import Trash2 from 'lucide-svelte/icons/trash-2'
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
	const channelGuard = (id: string) => (channelGuards[id] ??= submitFeedback({ error: null }))

	const { posting, applicants, userRoles, boards, postedCount, stillLive } = $derived(data)

	const channelInputClass =
		'h-8 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

	// A board is on this posting only when it has a channel row — `status` is null when it
	// has none, which is what makes the tile grid a per-posting list rather than the catalog.
	const channels = $derived(boards.filter((b) => b.status !== null))
	const addable = $derived(boards.filter((b) => b.status === null))

	let addOpen = $state(false)
	const addBoard = submitFeedback({
		onSuccess: () => {
			addOpen = false
		}
	})

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

{#snippet trashGlyph()}
	<Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
{/snippet}

<div class="space-y-6">
	<!-- Posting Header -->
	<div class="rounded-lg border p-6 space-y-4">
		<div class="space-y-2">
			<PageHeader title={posting.title}>
				{#snippet badge()}
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
					{#if channels.length > 0}
						<span>Posted on {postedCount} of {channels.length} boards</span>
					{/if}
				</div>
			</div>

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
			<h2 class="text-sm font-semibold">Posted on</h2>

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
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
					{#if addable.length === 0}
						<div
							class="flex min-h-[6rem] flex-col items-center justify-center rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground"
						>
							All boards added
						</div>
					{:else}
						<button
							type="button"
							onclick={() => (addOpen = true)}
							class="flex min-h-[6rem] flex-col items-center justify-center gap-1 rounded-lg border border-dashed p-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						>
							<span aria-hidden="true" class="text-xl leading-none">+</span>
							Add board
						</button>
					{/if}

					{#each channels as b (b.boardId)}
						{@const guard = channelGuard(b.boardId)}
						<div data-board={b.name} class="space-y-2 rounded-lg border p-3">
							<div class="flex items-center gap-2">
								<span class="text-sm font-medium">{b.name}</span>
								{#if b.status === 'TAKEN_DOWN'}
									<span class="badge-yellow">Taken down</span>
								{/if}
								<div class="ml-auto flex items-center">
									<ConfirmButton
										action="?/removeChannel"
										title={b.live ? 'Take this posting down?' : 'Remove this board?'}
										message={b.live
											? `${b.name} will be marked taken down and this role stops being advertised there.`
											: `The ${b.name} tile and its saved web address go for good.`}
										confirmText="Remove"
										triggerLabel={trashGlyph}
										triggerAriaLabel="Remove {b.name}"
										triggerClass="inline-flex items-center justify-center rounded-md border border-red-500/20 p-1.5 text-red-600 transition-colors hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 dark:text-red-400"
									>
										<input type="hidden" name="boardId" value={b.boardId} />
									</ConfirmButton>
								</div>
							</div>

							{#if b.live && b.postedAt}
								<p class="text-xs text-muted-foreground">Posted {formatShortDate(b.postedAt)}</p>
							{/if}

							<form method="POST" action="?/setChannel" use:enhance={guard.enhance}>
								<input type="hidden" name="boardId" value={b.boardId} />
								<input type="hidden" name="posted" value="true" />
								<div class="flex items-center gap-2">
									<label class="sr-only" for="url-{b.boardId}">{b.name} listing web address</label>
									<input
										id="url-{b.boardId}"
										name="url"
										value={b.url ?? ''}
										placeholder="https://…"
										class="w-full min-w-0 {channelInputClass}"
									/>
									<button type="submit" disabled={guard.busy} class="btn-row shrink-0"
										>{guard.busy ? '…' : 'Save'}</button
									>
								</div>
								{#if form && 'channelBoardId' in form && form.channelBoardId === b.boardId}
									<p class="mt-1 text-xs text-red-600 dark:text-red-400">{form.error}</p>
								{/if}
							</form>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<Dialog bind:open={addOpen} title="Add job board" size="sm">
			<h2 class="text-lg font-semibold">Add job board</h2>
			<p class="mt-1 text-sm text-muted-foreground">
				The board is marked as posted straight away. Add the listing web address after.
			</p>
			<form
				method="POST"
				action="?/addChannel"
				use:enhance={addBoard.enhance}
				class="mt-4 space-y-4"
			>
				<div>
					<label for="add-board" class="text-sm font-medium">Board</label>
					<select id="add-board" name="boardId" class="mt-1 w-full {channelInputClass}">
						{#each addable as b (b.boardId)}
							<option value={b.boardId}>{b.name}</option>
						{/each}
					</select>
				</div>
				<div class="flex justify-end gap-2">
					<button
						type="button"
						onclick={() => (addOpen = false)}
						class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">Cancel</button
					>
					<button
						type="submit"
						disabled={addBoard.busy}
						class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
						>{addBoard.busy ? 'Adding…' : 'Add'}</button
					>
				</div>
			</form>
		</Dialog>
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
