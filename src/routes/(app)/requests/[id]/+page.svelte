<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import { formatDateRange, formatShortDate, formatDate } from '$lib/utils/format'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { PageData, ActionData } from './$types'
	import Badge from '$lib/components/ui/Badge.svelte'

	let { data, form }: { data: PageData; form: ActionData } = $props()
	const req = $derived(data.request)

	// Balances are per year, and the server loads the year the leave falls in — not today's,
	// which differs for a December filing against January leave.
	const leaveYear = $derived((req.dateFrom ? new Date(req.dateFrom) : new Date()).getFullYear())

	// #108: double-submits here would double-upload attachments or fire duplicate verify/delete
	// posts. The per-document forms sit in an `{#each}`, so each row gets its own guard — a shared
	// one would disable every document's button at once.
	const uploadDocs = createSubmitGuard()
	function docGuards() {
		const map = new Map<string, ReturnType<typeof createSubmitGuard>>()
		return (id: string) => {
			let g = map.get(id)
			if (!g) {
				g = createSubmitGuard()
				map.set(id, g)
			}
			return g
		}
	}
	const verifyGuard = docGuards()
	const deleteGuard = docGuards()

	// Owner can add/remove documents only while the request can still change.
	const docsEditable = $derived(
		data.isOwner && (req.status === 'PENDING' || req.status === 'RETURNED')
	)
	const fmtSize = (b: number) =>
		b < 1024 * 1024
			? `${Math.max(1, Math.round(b / 1024))} KB`
			: `${(b / 1024 / 1024).toFixed(1)} MB`

	const typeLabels: Record<string, string> = {
		LEAVE: 'Leave',
		OVERTIME: 'Overtime',
		UNDERTIME: 'Undertime',
		OFFICIAL_BUSINESS: 'Official Business',
		REST_DAY_WORK: 'Work on Rest Day',
		HOLIDAY_WORK: 'Holiday Work',
		INFO_UPDATE: 'Info Update'
	}

	// payload is Json; show only the type-specific extras. Fields already surfaced in
	// their own rows (dates, hours, reason) or that are internal ids are hidden so they
	// don't get dumped raw (e.g. startDate/endDate/leaveTypeId).
	const HIDDEN_PAYLOAD_KEYS = new Set([
		'type',
		'startDate',
		'endDate',
		'date',
		'hours',
		'reason',
		'leaveTypeId'
	])
	const humanize = (k: string) => k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
	const payloadEntries = $derived(
		Object.entries((req.payload ?? {}) as Record<string, unknown>).filter(
			([k, v]) => !HIDDEN_PAYLOAD_KEYS.has(k) && v != null && v !== ''
		)
	)
	// For Official Business, `reason` mirrors `purpose` (already shown) — don't repeat it.
	const shownPayloadValues = $derived(new Set(payloadEntries.map(([, v]) => String(v))))
	const showReason = $derived(Boolean(req.reason) && !shownPayloadValues.has(String(req.reason)))
	// Maker-checker chain (#134): each attempt is MAKE → VERIFY → APPROVE. Group the
	// append-only steps by attempt so a refiled request shows its full history.
	type Step = (typeof req.steps)[number]
	// Role-facing stage names: the maker stage is branch HR, then the Verifier and Approver.
	const stageName: Record<string, string> = { MAKE: 'HR', VERIFY: 'Verifier', APPROVE: 'Approver' }
	const latestAttempt = $derived(Math.max(1, ...req.steps.map((s) => s.attempt)))
	const attempts = $derived.by(() => {
		const groups = new Map<number, Step[]>()
		for (const s of req.steps) {
			const list = groups.get(s.attempt) ?? []
			list.push(s)
			groups.set(s.attempt, list)
		}
		return [...groups.entries()]
			.sort((a, b) => a[0] - b[0])
			.map(([attempt, steps]) => ({
				attempt,
				steps: [...steps].sort((a, b) => a.stageIndex - b.stageIndex)
			}))
	})

	// The verb shown for a decided step (past tense), or the pending stage's own name.
	function stepLabel(step: Step): string {
		if (step.decision === 'APPROVED') {
			return step.stage === 'MAKE' ? 'Filed' : step.stage === 'VERIFY' ? 'Verified' : 'Approved'
		}
		if (step.decision === 'REJECTED') return 'Rejected'
		if (step.decision === 'RETURNED') return 'Returned'
		return stageName[step.stage] ?? 'Pending'
	}

	function isActive(step: Step): boolean {
		return (
			req.status === 'PENDING' &&
			step.attempt === latestAttempt &&
			step.stageIndex === req.currentStage
		)
	}
</script>

<svelte:head>
	<title>Request — Veent HRIS</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<PageHeader title={typeLabels[req.type] ?? req.type}>
		{#snippet badge()}
			<Badge status={req.status} domain="request" />
		{/snippet}
		{#snippet back()}
			<BackButton fallback="/requests" label="Requests" />
		{/snippet}
	</PageHeader>

	<div class="rounded-lg border bg-card p-4">
		<dl class="grid grid-cols-3 gap-y-2 text-sm">
			<dt class="text-muted-foreground">Employee</dt>
			<dd class="col-span-2">{req.employee.firstName} {req.employee.lastName}</dd>
			{#if data.leaveTypeName}
				<dt class="text-muted-foreground">Leave type</dt>
				<dd class="col-span-2">{data.leaveTypeName}</dd>
			{/if}
			{#if req.dateFrom}
				<dt class="text-muted-foreground">Dates</dt>
				<dd class="col-span-2">{formatDateRange(req.dateFrom, req.dateTo)}</dd>
			{/if}
			{#if req.hours}
				<dt class="text-muted-foreground">Hours</dt>
				<dd class="col-span-2">{req.hours}</dd>
			{/if}
			{#each payloadEntries as [k, v] (k)}
				<dt class="text-muted-foreground">{humanize(k)}</dt>
				<dd class="col-span-2 break-words">{String(v)}</dd>
			{/each}
			{#if showReason}
				<dt class="text-muted-foreground">Reason</dt>
				<dd class="col-span-2">{req.reason}</dd>
			{/if}
			<dt class="text-muted-foreground">Filed</dt>
			<dd class="col-span-2">{formatDate(req.createdAt)}</dd>
		</dl>
	</div>

	<!-- Leave ledger (#137): so a reviewer can see whether the days are actually there
	     without opening the filer's 201 file. Balances deduct on final approval, so these
	     are the numbers this request will draw against. -->
	{#if data.leaveBalances.length}
		<div class="rounded-lg border bg-card p-4 space-y-3">
			<h2 class="text-sm font-semibold">
				{req.employee.firstName}'s leave balances
				<span class="font-normal text-muted-foreground">
					({leaveYear}, days remaining)
				</span>
			</h2>
			<div class="flex flex-wrap gap-2">
				{#each data.leaveBalances as bal (bal.id)}
					<div
						class="min-w-[130px] rounded-md border p-3 {bal.isRequested
							? 'border-primary bg-primary/5'
							: 'bg-background'}"
						data-leave-type={bal.name}
					>
						<p class="text-xs font-medium text-muted-foreground">{bal.name}</p>
						<p class="mt-0.5 text-xl font-bold">{bal.remaining.toFixed(1)}</p>
						<p class="text-xs text-muted-foreground">of {bal.allocated.toFixed(0)} allocated</p>
						{#if bal.isRequested}
							<p class="mt-1 text-xs font-medium text-primary">This request</p>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<div class="space-y-3">
		<h2 class="text-lg font-semibold">Supporting documents</h2>

		{#if form?.error}
			<Banner kind="error" message={form.error} />
		{/if}
		{#if form?.message}
			<Banner kind="success" message={form.message} />
		{/if}

		{#if req.documents.length === 0}
			<p class="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
				No documents attached.
			</p>
		{:else}
			<ul class="space-y-2">
				{#each req.documents as doc (doc.id)}
					<li class="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
						<div class="min-w-0 flex-1">
							<a
								href="/api/v1/requests/{req.id}/documents/{doc.id}"
								class="break-words text-sm font-medium text-primary hover:underline"
								download>{doc.label}</a
							>
							<p class="text-xs text-muted-foreground">
								{fmtSize(doc.size)} · uploaded {formatShortDate(doc.uploadedAt)}
							</p>
							{#if doc.verifiedAt}
								<p class="text-xs text-green-600 dark:text-green-400">
									Verified{#if doc.verifiedBy}{' '}by {doc.verifiedBy.email}{/if} · {formatShortDate(
										doc.verifiedAt
									)}
								</p>
							{/if}
						</div>
						<div class="flex shrink-0 items-center gap-3">
							<Badge
								status={doc.verifiedAt ? 'Verified' : 'Unverified'}
								tone={doc.verifiedAt ? 'green' : 'yellow'}
							/>
							{#if data.canReview}
								{@const verify = verifyGuard(doc.id)}
								<form method="POST" action="?/verifyDoc" use:enhance={verify.enhance}>
									<input type="hidden" name="docId" value={doc.id} />
									<input type="hidden" name="verified" value={doc.verifiedAt ? 'false' : 'true'} />
									<button
										type="submit"
										disabled={verify.busy}
										class="rounded-md border border-primary/40 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:pointer-events-none disabled:opacity-50"
									>
										{doc.verifiedAt ? 'Unverify' : 'Mark verified'}
									</button>
								</form>
							{/if}
							{#if docsEditable && !doc.verifiedAt}
								{@const remove = deleteGuard(doc.id)}
								<form method="POST" action="?/deleteDoc" use:enhance={remove.enhance}>
									<input type="hidden" name="docId" value={doc.id} />
									<button
										type="submit"
										disabled={remove.busy}
										class="rounded-md border border-red-500/20 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-500/10 disabled:pointer-events-none disabled:opacity-50"
										>{remove.busy ? 'Removing…' : 'Remove'}</button
									>
								</form>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}

		{#if docsEditable}
			<form
				method="POST"
				action="?/uploadDocs"
				enctype="multipart/form-data"
				use:enhance={uploadDocs.enhance}
				class="space-y-2 rounded-lg border bg-muted/30 p-3"
			>
				<label for="documents" class="text-xs font-medium">Add documents</label>
				<div class="flex flex-wrap items-center gap-2">
					<input
						id="documents"
						name="documents"
						type="file"
						multiple
						accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
						class="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm file:font-medium"
					/>
					<button
						type="submit"
						disabled={uploadDocs.busy}
						class="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
						>{uploadDocs.busy ? 'Uploading…' : 'Upload'}</button
					>
				</div>
				<p class="text-xs text-muted-foreground">
					Up to 5 files per request — PDF, PNG, JPEG or WEBP, max 10 MB each.
				</p>
			</form>
		{/if}

		<!-- #299/AC-5: the audit view. Removed documents are never deleted — the row, its filename
		     and above all its signer are kept forever, because that signer is what the #283/F3 bar
		     reads. Read-only by construction: no Remove and no Verify control here, and the download
		     link exists only while the bytes survive the FIFO cap (D-3/D-4). -->
		{#if req.documentHistory.some((d) => d.deletedAt)}
			<div class="space-y-2">
				<h3 class="text-sm font-semibold text-muted-foreground">Removed documents</h3>
				<ul class="space-y-2">
					{#each req.documentHistory.filter((d): d is typeof d & { deletedAt: Date } => d.deletedAt !== null) as doc (doc.id)}
						<li
							class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-3 opacity-80"
						>
							<div class="min-w-0 flex-1">
								<p class="break-words text-sm font-medium text-muted-foreground">{doc.label}</p>
								<p class="text-xs text-muted-foreground">
									uploaded {formatShortDate(doc.uploadedAt)} · removed {formatShortDate(
										doc.deletedAt
									)}
								</p>
								{#if doc.verifiedBy}
									<p class="text-xs text-muted-foreground">
										Signed off by {doc.verifiedBy.email}
									</p>
								{/if}
							</div>
							<!-- No download CONTROL here, by AC-5: this panel is an audit record, not a file
							     list. That is a UI choice and deliberately NOT a route rule — the v1 download
							     URL still serves a tombstone while its bytes survive (D-3), because the bytes
							     and the row are separate facts. Once the FIFO cap evicts them, say so plainly
							     rather than leaving a blank. -->
							<div class="shrink-0 text-xs text-muted-foreground">
								{#if !doc.storageKey}File removed{/if}
							</div>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>

	<div class="space-y-3">
		<h2 class="text-lg font-semibold">Approval chain</h2>
		<p class="text-xs text-muted-foreground">Requester → HR → Verifier → Approver</p>

		<!-- #283/D12: an approver barred by separation of duties finds this request missing from
		     their queue by design (AC-15/AC-21/US-8). This page is where they come to ask why, and
		     it has no decide control to disable, so the explanation stands on its own. -->
		{#if data.actBlockedReason}
			<Banner kind="warning" message={data.actBlockedReason} />
		{/if}

		<!-- Origin: the employee's own submission, so "HR pending" doesn't read as if
		     nothing has happened yet. -->
		<ol class="space-y-2">
			<li class="flex items-start gap-3 rounded-lg border p-3">
				<div
					class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-xs font-medium text-green-700 dark:text-green-400"
				>
					✓
				</div>
				<div class="min-w-0 flex-1">
					<p class="text-sm font-medium">
						Submitted <span class="font-normal text-muted-foreground">· requester</span>
					</p>
					<p class="text-xs text-muted-foreground">
						by {req.employee.firstName}
						{req.employee.lastName} · {formatShortDate(req.createdAt)}
					</p>
				</div>
			</li>
		</ol>

		{#each attempts as group (group.attempt)}
			{#if attempts.length > 1}
				<p class="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					Attempt {group.attempt}
				</p>
			{/if}
			<ol class="space-y-2">
				{#each group.steps as step, i (step.id)}
					{@const active = isActive(step)}
					<li
						class="flex items-start gap-3 rounded-lg border p-3 {active
							? 'border-primary/50 bg-primary/5'
							: ''}"
					>
						<div
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium
							{step.decision === 'APPROVED'
								? 'bg-green-500/15 text-green-700 dark:text-green-400'
								: step.decision === 'REJECTED'
									? 'bg-red-500/15 text-red-700 dark:text-red-400'
									: step.decision === 'RETURNED'
										? 'bg-orange-500/15 text-orange-800 dark:text-orange-400'
										: 'bg-muted text-muted-foreground'}"
						>
							{i + 1}
						</div>
						<div class="min-w-0 flex-1">
							<p class="text-sm font-medium">
								{stepLabel(step)}
								<span class="font-normal text-muted-foreground"
									>· {stageName[step.stage]} stage</span
								>
							</p>
							<p class="text-xs text-muted-foreground">
								{#if step.decision}
									{#if step.actor}by {step.actor.email}{/if}{#if step.decidedAt}{' '}
										· {formatShortDate(step.decidedAt)}{/if}
								{:else if active}
									Pending — awaiting {stageName[step.stage].toLowerCase()}
								{:else}
									Not yet reached
								{/if}
							</p>
							{#if step.note}<p class="mt-1 text-xs text-muted-foreground">“{step.note}”</p>{/if}
						</div>
					</li>
				{/each}
			</ol>
		{/each}
	</div>
</div>
