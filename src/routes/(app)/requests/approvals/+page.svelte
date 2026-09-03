<script lang="ts">
	import { enhance } from '$app/forms'
	import type { SubmitFunction } from '@sveltejs/kit'
	import { tick } from 'svelte'
	import { slide } from 'svelte/transition'
	import { formatDateRange } from '$lib/utils/format'
	import Pagination from '$lib/components/Pagination.svelte'
	import ReasonDialog from '$lib/components/ui/ReasonDialog.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	// ─── Bulk selection ───────────────────────────────────────────────────────
	// Reject many pending requests at once with one shared note (reject requires a note).
	let selected = $state<string[]>([])
	let bulkNote = $state('')
	let busy = $state(false)
	const allIds = $derived(data.pendingRequests.map((r) => r.id))
	const allSelected = $derived(allIds.length > 0 && allIds.every((id) => selected.includes(id)))
	function toggle(id: string) {
		selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]
	}
	function toggleAll(on: boolean) {
		selected = on ? allIds : []
	}
	const clearOnSuccess: SubmitFunction = () => {
		busy = true
		return async ({ result, update }) => {
			await update()
			busy = false
			if (result.type === 'success') {
				selected = []
				bulkNote = ''
			}
		}
	}

	const typeLabels: Record<string, string> = {
		LEAVE: 'Leave',
		OVERTIME: 'Overtime',
		UNDERTIME: 'Undertime',
		OFFICIAL_BUSINESS: 'Official Business',
		REST_DAY_WORK: 'Work on Rest Day',
		HOLIDAY_WORK: 'Holiday Work',
		INFO_UPDATE: 'Info Update'
	}
	const typeLabel = (t: string) => typeLabels[t] ?? t

	// A colour per request type so a queue of mixed requests is scannable at a glance
	// rather than a wall of identical grey cards.
	const typeAccents: Record<string, string> = {
		LEAVE: 'bg-sky-500/15 text-sky-500',
		OVERTIME: 'bg-violet-500/15 text-violet-500',
		UNDERTIME: 'bg-amber-500/15 text-amber-500',
		OFFICIAL_BUSINESS: 'bg-teal-500/15 text-teal-500',
		REST_DAY_WORK: 'bg-indigo-500/15 text-indigo-500',
		HOLIDAY_WORK: 'bg-rose-500/15 text-rose-500',
		INFO_UPDATE: 'bg-slate-500/15 text-slate-400'
	}
	const typeAccent = (t: string) => typeAccents[t] ?? 'bg-muted text-muted-foreground'

	const initials = (first: string, last: string) =>
		`${first.charAt(0)}${last.charAt(0)}`.toUpperCase()

	// How long a request has been waiting. Approvers work oldest-first, and a request
	// sitting for a week is the one worth surfacing.
	function waitingFor(createdAt: Date | string): string {
		const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000)
		if (days < 1) return 'today'
		if (days === 1) return '1 day'
		return `${days} days`
	}
	const isStale = (createdAt: Date | string) =>
		Date.now() - new Date(createdAt).getTime() >= 3 * 86_400_000

	// Roles reach the template as raw enum values (HR_ADMIN), which read as database
	// internals on a card an HR user looks at all day.
	const roleLabels: Record<string, string> = {
		HR_ADMIN: 'HR',
		SUPER_ADMIN: 'Admin',
		MANAGER: 'Manager',
		VERIFIER: 'Verifier',
		APPROVER: 'Approver',
		CEO: 'CEO',
		PAYROLL_OFFICER: 'Payroll'
	}
	const roleLabel = (r: string) =>
		roleLabels[r] ??
		r
			.toLowerCase()
			.replace(/_/g, ' ')
			.replace(/^\w/, (c) => c.toUpperCase())

	function currentStageLabel(r: {
		steps: { stageIndex: number; stageKind: string; role: string | null }[]
		currentStage: number
	}) {
		const step = r.steps.find((s) => s.stageIndex === r.currentStage)
		if (!step) return ''
		return step.stageKind === 'SUPERVISOR' ? 'Supervisor' : roleLabel(step.role ?? 'APPROVER')
	}

	// Decision notes are collected in a popup (#70 follow-up) instead of inline
	// textareas, so cards keep a fixed, tidy layout. Confirming the popup fills
	// the hidden decide/bulk form and submits it.
	let noteDialogOpen = $state(false)
	let noteTarget = $state<
		{ kind: 'decide'; id: string; decision: 'RETURNED' | 'REJECTED' } | { kind: 'bulk' } | null
	>(null)
	let decideForm = $state<HTMLFormElement>()
	let bulkForm = $state<HTMLFormElement>()
	let decideId = $state('')
	let decideDecision = $state('')
	let decideNote = $state('')

	function askNote(target: NonNullable<typeof noteTarget>) {
		noteTarget = target
		noteDialogOpen = true
	}
	// Write values straight onto the inputs too — belt and braces against a
	// reactive-flush race leaving a hidden field empty at submit time.
	function forceInput(form: HTMLFormElement | undefined, name: string, value: string) {
		const el = form?.elements.namedItem(name)
		if (el instanceof HTMLInputElement) el.value = value
	}
	async function submitWithNote(reason: string) {
		if (!noteTarget) return
		if (noteTarget.kind === 'decide') {
			decideId = noteTarget.id
			decideDecision = noteTarget.decision
			decideNote = reason
			await tick()
			forceInput(decideForm, 'id', noteTarget.id)
			forceInput(decideForm, 'decision', noteTarget.decision)
			forceInput(decideForm, 'note', reason)
			decideForm?.requestSubmit()
		} else {
			bulkNote = reason
			await tick()
			forceInput(bulkForm, 'note', reason)
			bulkForm?.requestSubmit()
		}
	}

	// #108: a double-click on Approve would post the same decision twice. Each card gets its own
	// guard — a shared one would disable every row's Approve button while any single row is in
	// flight. Guards are created lazily per request id, so a card keeps its guard across re-renders.
	const approveGuards = new Map<string, ReturnType<typeof createSubmitGuard>>()
	function approveGuard(id: string) {
		let g = approveGuards.get(id)
		if (!g) {
			g = createSubmitGuard()
			approveGuards.set(id, g)
		}
		return g
	}

	// The popup-driven Return/Reject path submits this hidden form via `requestSubmit()`, which
	// bypasses any button `disabled` — the guard's `cancel()` is what actually stops the double post.
	const decide = createSubmitGuard()

	const unverifiedCount = (docs: { verifiedAt: Date | string | null }[]) =>
		docs.filter((d) => !d.verifiedAt).length
</script>

<svelte:head>
	<title>Request Approvals — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Request Approvals</h1>
			<p class="text-sm text-muted-foreground">Review requests awaiting your decision.</p>
		</div>
		{#if data.pagination.total > 0}
			<span class="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
				{data.pagination.total} awaiting you
			</span>
		{/if}
	</div>

	{#if form?.error}
		<div
			class="rounded-md border border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400"
		>
			{form.error}
		</div>
	{/if}

	{#if form?.saved}
		<div
			class="rounded-md border border-green-500/20 bg-green-500/10 px-4 py-2 text-sm text-green-600"
		>
			{form.saved}
		</div>
	{/if}

	{#if data.pendingRequests.length > 0}
		<label class="flex w-fit items-center gap-2 text-sm text-muted-foreground">
			<input
				type="checkbox"
				checked={allSelected}
				onchange={(e) => toggleAll(e.currentTarget.checked)}
				class="align-middle"
			/>
			Select all
		</label>
	{/if}

	{#if selected.length}
		<div
			class="flex flex-wrap items-end justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3"
			transition:slide={{ duration: 120 }}
		>
			<span class="text-sm font-medium">{selected.length} selected</span>
			<div class="flex items-center gap-2">
				<button
					onclick={() => (selected = [])}
					class="text-sm text-muted-foreground hover:underline">Clear</button
				>
				<form bind:this={bulkForm} method="POST" action="?/rejectMany" use:enhance={clearOnSuccess}>
					<input type="hidden" name="ids" value={selected.join(',')} />
					<input type="hidden" name="note" value={bulkNote} />
					<button
						type="button"
						disabled={busy}
						onclick={() => askNote({ kind: 'bulk' })}
						class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
						>Reject selected…</button
					>
				</form>
			</div>
		</div>
	{/if}

	{#if data.pendingRequests.length === 0}
		<div class="rounded-md border bg-muted/50 px-6 py-12 text-center text-muted-foreground text-sm">
			No requests awaiting your decision.
		</div>
	{:else}
		<!-- A real grid, so cards align in columns and share a row height instead of each
		     being pinned to a hardcoded h-72. Details clip inside (reason is clamped, full
		     text lives on the detail page) and the decision buttons pin to the bottom. -->
		<div class="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
			{#each data.pendingRequests as req (req.id)}
				{@const approve = approveGuard(req.id)}
				{@const leave = data.leaveContext[req.id]}
				{@const picked = selected.includes(req.id)}
				<div
					class="flex flex-col rounded-lg border bg-card transition-colors {picked
						? 'border-primary ring-1 ring-primary'
						: 'hover:border-muted-foreground/30'}"
				>
					<div class="flex min-h-0 flex-1 flex-col gap-3 p-4">
						<!-- Person first: approvers scan by who, then by what. -->
						<div class="flex items-start gap-3">
							<input
								type="checkbox"
								checked={picked}
								onchange={() => toggle(req.id)}
								aria-label="Select request"
								class="mt-1 align-middle"
							/>
							<div
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold {typeAccent(
									req.type
								)}"
								aria-hidden="true"
							>
								{initials(req.employee.firstName, req.employee.lastName)}
							</div>
							<div class="min-w-0 flex-1">
								<!-- The full name gets the header width to itself; the type badge sits in the
								     meta row below, where truncating it costs nothing. -->
								<p class="font-medium leading-tight break-words">
									{req.employee.lastName}, {req.employee.firstName}
								</p>
								<p class="mt-0.5 text-xs text-muted-foreground">
									Waiting {waitingFor(req.createdAt)}
									{#if isStale(req.createdAt)}
										<span class="ml-1 font-medium text-amber-500">· overdue</span>
									{/if}
								</p>
							</div>
						</div>

						<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
							<span class="rounded-full px-2 py-0.5 text-xs font-medium {typeAccent(req.type)}"
								>{leave?.typeName ?? typeLabel(req.type)}</span
							>
							{#if req.dateFrom}<span>{formatDateRange(req.dateFrom, req.dateTo)}</span>{/if}
							{#if leave?.totalDays != null}
								<span class="rounded bg-muted px-1.5 py-0.5 text-xs font-medium"
									>{leave.totalDays}
									{leave.totalDays === 1 ? 'day' : 'days'}</span
								>
							{/if}
							{#if req.hours}
								<span class="rounded bg-muted px-1.5 py-0.5 text-xs font-medium"
									>{req.hours} hrs</span
								>
							{/if}
						</div>

						<!-- The decision-critical number: can this request actually be covered? -->
						{#if leave && leave.remaining != null}
							{@const short = leave.totalDays != null && leave.remaining < leave.totalDays}
							<p
								class="rounded-md px-2 py-1 text-xs {short
									? 'bg-red-500/10 font-medium text-red-500'
									: 'bg-muted/60 text-muted-foreground'}"
							>
								{leave.remaining.toFixed(1)} of {leave.typeName} remaining
								{#if short}· not enough to cover this request{/if}
							</p>
						{/if}

						{#if req.reason}
							<p class="line-clamp-2 text-xs text-muted-foreground">{req.reason}</p>
						{/if}

						<!-- #299/AC-8: liveDocuments, not documents. The server splits the two (P-5) because
						`documents` still carries tombstones for the F3 bar; this chip counts what the
						approver can actually open. -->
						{#if req.liveDocuments.length}
							{@const unverified = unverifiedCount(req.liveDocuments)}
							<p class="text-xs">
								<span class="text-muted-foreground"
									>📎 {req.liveDocuments.length} document{req.liveDocuments.length === 1
										? ''
										: 's'}</span
								>
								{#if unverified}
									<span
										class="ml-1 rounded-full bg-yellow-500/15 px-2 py-0.5 font-medium text-yellow-400"
										>{unverified} unverified</span
									>
								{:else}
									<span
										class="ml-1 rounded-full bg-green-500/15 px-2 py-0.5 font-medium text-green-400"
										>all verified</span
									>
								{/if}
							</p>
						{/if}

						<div class="mt-auto flex items-center justify-between gap-2 pt-1">
							<span class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
								>Stage: {currentStageLabel(req)}</span
							>
							<a href="/requests/{req.id}?from=/requests/approvals" class="btn-row">View detail</a>
						</div>
					</div>
					<!-- Approve posts directly; Return/Reject collect their required note in
					     a popup (ReasonDialog) and submit through the hidden decide form. -->
					<form
						method="POST"
						action="?/decideRequest"
						use:enhance={approve.enhance}
						class="flex shrink-0 gap-2 border-t bg-muted/20 p-3"
					>
						<input type="hidden" name="id" value={req.id} />
						<button
							type="submit"
							name="decision"
							value="APPROVED"
							disabled={approve.busy}
							class="flex-1 rounded-md bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:pointer-events-none disabled:opacity-50"
							>{approve.busy ? 'Approving…' : 'Approve'}</button
						>
						<button
							type="button"
							disabled={decide.busy}
							onclick={() => askNote({ kind: 'decide', id: req.id, decision: 'RETURNED' })}
							class="flex-1 rounded-md bg-orange-500 px-2 py-1 text-xs font-medium text-white hover:bg-orange-600 disabled:pointer-events-none disabled:opacity-50"
							>Return…</button
						>
						<button
							type="button"
							disabled={decide.busy}
							onclick={() => askNote({ kind: 'decide', id: req.id, decision: 'REJECTED' })}
							class="flex-1 rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:pointer-events-none disabled:opacity-50"
							>Reject…</button
						>
					</form>
				</div>
			{/each}
		</div>

		<Pagination meta={data.pagination} />
	{/if}
</div>

<!-- Submission target for popup-collected Return/Reject notes. -->
<form
	bind:this={decideForm}
	method="POST"
	action="?/decideRequest"
	use:enhance={decide.enhance}
	class="hidden"
>
	<input type="hidden" name="id" value={decideId} />
	<input type="hidden" name="decision" value={decideDecision} />
	<input type="hidden" name="note" value={decideNote} />
</form>

<ReasonDialog
	bind:open={noteDialogOpen}
	title={noteTarget?.kind === 'bulk'
		? `Reject ${selected.length} selected request${selected.length === 1 ? '' : 's'}`
		: noteTarget?.decision === 'RETURNED'
			? 'Return request'
			: 'Reject request'}
	message={noteTarget?.kind === 'bulk'
		? 'The note below is applied to every selected request.'
		: noteTarget?.decision === 'RETURNED'
			? 'Tell the employee what to fix before resubmitting.'
			: 'Tell the employee why this request is rejected.'}
	placeholder="Write the note…"
	confirmText={noteTarget?.kind !== 'bulk' && noteTarget?.decision === 'RETURNED'
		? 'Return'
		: 'Reject'}
	confirmClass={noteTarget?.kind !== 'bulk' && noteTarget?.decision === 'RETURNED'
		? 'bg-orange-500 text-white hover:bg-orange-600'
		: 'bg-red-600 text-white hover:bg-red-700'}
	onconfirm={submitWithNote}
/>
