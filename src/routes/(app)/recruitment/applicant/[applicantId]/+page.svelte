<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import { page } from '$app/stores'
	import { tick } from 'svelte'
	import { formatCurrency, formatShortDate } from '$lib/utils/format'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { PageData, ActionData } from './$types'
	import Badge from '$lib/components/ui/Badge.svelte'

	let { data, form }: { data: PageData; form: ActionData } = $props()
	const applicant = $derived(data.applicant)
	const offer = $derived(data.applicant.offer)

	// Stage-gated entry forms (#76): existing interviews/offers always render; only
	// the forms that *create* new ones depend on the applicant's stage. Interviews
	// are scheduled from SCREENING (scheduleInterview then advances to INTERVIEW);
	// offers can be issued from INTERVIEW onward.
	const STAGE_ORDER = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED']
	const canScheduleInterview = $derived(applicant.currentStage === 'SCREENING')
	const canIssueOffer = $derived(
		STAGE_ORDER.indexOf(applicant.currentStage) >= STAGE_ORDER.indexOf('INTERVIEW')
	)

	// Arriving from the Kanban's "Schedule interview" / "Give offer" links opens
	// the matching form: scroll it into view and focus its first field.
	$effect(() => {
		const hash = $page.url.hash
		const sel = hash === '#schedule' ? '#iv-date' : hash === '#offer' ? '#of-title' : null
		if (!sel) return
		tick().then(() => {
			const el = document.querySelector<HTMLElement>(sel)
			el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
			el?.focus()
		})
	})

	const STAGE_LABELS: Record<string, string> = {
		APPLIED: 'Applied',
		SCREENING: 'Screening',
		INTERVIEW: 'Interview',
		OFFER: 'Offer',
		HIRED: 'Hired',
		REJECTED: 'Rejected'
	}
	const MODE_LABELS: Record<string, string> = {
		ONSITE: 'On-site',
		VIDEO: 'Video',
		PHONE: 'Phone'
	}
	const fmtDateTime = (d: Date | string) =>
		new Date(d).toLocaleString('en-PH', {
			dateStyle: 'medium',
			timeStyle: 'short'
		})

	let feedbackOpen = $state<string | null>(null)

	// #108: double-submit guards. Each of these actions is state-mutating and a double-click
	// would duplicate an interview/offer, or convert the applicant to an employee twice.
	// Only one feedback form is rendered at a time (feedbackOpen is a single id), so a single
	// guard is safe here; the same is true for the offer forms (one offer per applicant).
	const recordFeedback = createSubmitGuard()
	const scheduleInterview = createSubmitGuard()
	const acceptOffer = createSubmitGuard()
	const declineOffer = createSubmitGuard()
	const deleteOffer = createSubmitGuard()
	const convertApplicant = createSubmitGuard()
	const issueOffer = createSubmitGuard()

	// `?/deleteInterview` is the exception: one form per interview row, so it needs a guard per
	// row — a shared one would disable every Remove button while any single one is in flight.
	// Plain object, not `$state`: each guard owns its own reactive `busy`.
	const deleteInterviewGuards: Record<string, ReturnType<typeof createSubmitGuard>> = {}
	const deleteInterviewGuard = (id: string) => (deleteInterviewGuards[id] ??= createSubmitGuard())
</script>

<svelte:head>
	<title>{applicant.firstName} {applicant.lastName} — Recruitment — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<PageHeader title="{applicant.firstName} {applicant.lastName}">
		{#snippet back()}
			<span class="rounded-full bg-foreground/15 px-2.5 py-1 text-xs font-medium">
				{STAGE_LABELS[applicant.currentStage] ?? applicant.currentStage}
			</span>
			<BackButton
				fallback={'/recruitment/' + applicant.jobPosting.id}
				label={applicant.jobPosting.title}
			/>
		{/snippet}
	</PageHeader>

	{#if form?.error}
		<div
			class="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-red-500"
		>
			{form.error}
		</div>
	{/if}

	<!-- Two columns from lg up: the work (contact, interviews, offer) on the left, the read-only
	     record on the right, filling the column's full height. -->
	<div class="grid gap-6 lg:grid-cols-3">
		<div class="space-y-6 lg:col-span-2">
			<div class="rounded-lg border bg-card p-6">
				<dl class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
					<dt class="text-muted-foreground">Email</dt>
					<dd class="sm:col-span-3">{applicant.email}</dd>
					<dt class="text-muted-foreground">Phone</dt>
					<dd class="sm:col-span-3">{applicant.phone ?? '—'}</dd>
				</dl>
				{#if applicant.convertedEmployee}
					<div class="mt-4 rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2 text-sm">
						✓ Converted to employee —
						<a
							href="/employees/{applicant.convertedEmployee.id}"
							class="text-primary hover:underline">open 201 file</a
						>
					</div>
				{/if}
			</div>

			<!-- Interviews -->
			<section class="rounded-lg border bg-card p-6 space-y-4">
				<h2 class="font-semibold">Interviews</h2>

				{#if applicant.interviews.length}
					<div class="space-y-3">
						{#each applicant.interviews as iv (iv.id)}
							{@const removeInterview = deleteInterviewGuard(iv.id)}
							<div class="rounded-md border p-3">
								<div class="flex flex-wrap items-center justify-between gap-2">
									<div class="text-sm">
										<span class="font-medium">{fmtDateTime(iv.scheduledAt)}</span>
										<span class="ml-2 rounded-full bg-foreground/15 px-2 py-0.5 text-xs"
											>{MODE_LABELS[iv.mode]}</span
										>
									</div>
									<form
										method="POST"
										action="?/deleteInterview"
										use:enhance={removeInterview.enhance}
									>
										<input type="hidden" name="interviewId" value={iv.id} />
										<button
											type="submit"
											disabled={removeInterview.busy}
											class="rounded-md border border-destructive/30 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
											>{removeInterview.busy ? 'Removing…' : 'Remove'}</button
										>
									</form>
								</div>
								<p class="mt-1 text-sm text-muted-foreground">
									{iv.interviewer}{#if iv.location}
										· {iv.location}{/if}
								</p>
								{#if iv.feedback}
									<p class="mt-2 whitespace-pre-wrap rounded bg-muted/50 p-2 text-sm">
										{iv.feedback}
									</p>
								{/if}
								{#if feedbackOpen === iv.id}
									<form
										method="POST"
										action="?/recordFeedback"
										use:enhance={recordFeedback.enhance}
										class="mt-2 space-y-2"
									>
										<input type="hidden" name="interviewId" value={iv.id} />
										<textarea
											name="feedback"
											rows="3"
											placeholder="Interview notes / feedback…"
											class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
											>{iv.feedback ?? ''}</textarea
										>
										<div class="flex gap-2">
											<button
												type="submit"
												disabled={recordFeedback.busy}
												class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
												>{recordFeedback.busy ? 'Saving…' : 'Save feedback'}</button
											>
											<button
												type="button"
												onclick={() => (feedbackOpen = null)}
												class="rounded-md border px-3 py-1.5 text-xs hover:bg-accent">Cancel</button
											>
										</div>
									</form>
								{:else}
									<button
										type="button"
										onclick={() => (feedbackOpen = iv.id)}
										class="mt-2 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-accent"
										>{iv.feedback ? 'Edit feedback' : 'Add feedback'}</button
									>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<p class="text-xs text-muted-foreground">No interviews scheduled yet.</p>
				{/if}

				<!-- Schedule form — only while the applicant is in Screening (#76). -->
				{#if canScheduleInterview}
					<form
						id="schedule"
						method="POST"
						action="?/scheduleInterview"
						use:enhance={scheduleInterview.enhance}
						class="grid scroll-mt-20 gap-2 border-t pt-3 sm:grid-cols-2"
					>
						<div class="grid gap-1">
							<label for="iv-date" class="text-xs font-medium text-muted-foreground">Date</label>
							<input
								id="iv-date"
								name="scheduledDate"
								type="date"
								required
								class="h-9 rounded-md border border-input bg-background px-2 text-sm"
							/>
						</div>
						<div class="grid gap-1">
							<label for="iv-time" class="text-xs font-medium text-muted-foreground">Time</label>
							<input
								id="iv-time"
								name="scheduledTime"
								type="time"
								required
								class="h-9 rounded-md border border-input bg-background px-2 text-sm"
							/>
						</div>
						<div class="grid gap-1">
							<label for="iv-mode" class="text-xs font-medium text-muted-foreground">Mode</label>
							<select
								id="iv-mode"
								name="mode"
								class="h-9 rounded-md border border-input bg-background px-2 text-sm"
							>
								<option value="ONSITE">On-site</option>
								<option value="VIDEO">Video</option>
								<option value="PHONE">Phone</option>
							</select>
						</div>
						<div class="grid gap-1">
							<label for="iv-who" class="text-xs font-medium text-muted-foreground"
								>Interviewer</label
							>
							<input
								id="iv-who"
								name="interviewer"
								type="text"
								required
								placeholder="e.g. Jane Cruz"
								class="h-9 rounded-md border border-input bg-background px-2 text-sm"
							/>
						</div>
						<div class="grid gap-1">
							<label for="iv-loc" class="text-xs font-medium text-muted-foreground"
								>Location / link <span class="text-muted-foreground/70">(optional)</span></label
							>
							<input
								id="iv-loc"
								name="location"
								type="text"
								placeholder="Room 4 or meet.google.com/…"
								class="h-9 rounded-md border border-input bg-background px-2 text-sm"
							/>
						</div>
						<div class="sm:col-span-2">
							<button
								type="submit"
								disabled={scheduleInterview.busy}
								class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
								>{scheduleInterview.busy ? 'Scheduling…' : 'Schedule interview'}</button
							>
						</div>
					</form>
				{/if}
			</section>

			<!-- Offer -->
			<section id="offer" class="scroll-mt-20 rounded-lg border bg-card p-6 space-y-4">
				<h2 class="font-semibold">Job Offer</h2>

				{#if offer}
					<div class="rounded-md border p-4 space-y-3">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<span class="text-sm font-medium">{offer.jobTitle}</span>
							<Badge status={offer.status} domain="offer" />
						</div>
						<dl class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
							<dt class="text-muted-foreground">Salary</dt>
							<dd>{formatCurrency(Number(offer.monthlySalary))}/mo</dd>
							<dt class="text-muted-foreground">Start date</dt>
							<dd>{formatShortDate(offer.startDate)}</dd>
							<dt class="text-muted-foreground">Department</dt>
							<dd class="sm:col-span-3">{offer.department?.name ?? '—'}</dd>
						</dl>
						{#if offer.notes}
							<p class="whitespace-pre-wrap rounded bg-muted/50 p-2 text-sm">{offer.notes}</p>
						{/if}

						{#if offer.status === 'SENT'}
							<div class="flex gap-2 border-t pt-3">
								<form method="POST" action="?/respondOffer" use:enhance={acceptOffer.enhance}>
									<input type="hidden" name="offerId" value={offer.id} />
									<input type="hidden" name="accepted" value="true" />
									<button
										type="submit"
										disabled={acceptOffer.busy}
										class="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:pointer-events-none disabled:opacity-50"
										>{acceptOffer.busy ? 'Saving…' : 'Mark accepted'}</button
									>
								</form>
								<form method="POST" action="?/respondOffer" use:enhance={declineOffer.enhance}>
									<input type="hidden" name="offerId" value={offer.id} />
									<input type="hidden" name="accepted" value="false" />
									<button
										type="submit"
										disabled={declineOffer.busy}
										class="rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
										>{declineOffer.busy ? 'Saving…' : 'Mark declined'}</button
									>
								</form>
							</div>
						{/if}

						{#if !applicant.convertedEmployee}
							<form
								method="POST"
								action="?/deleteOffer"
								use:enhance={deleteOffer.enhance}
								class="border-t pt-3"
							>
								<input type="hidden" name="offerId" value={offer.id} />
								<button
									type="submit"
									disabled={deleteOffer.busy}
									class="rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
									>{deleteOffer.busy ? 'Withdrawing…' : 'Withdraw offer'}</button
								>
							</form>
						{/if}
					</div>

					{#if offer.status === 'ACCEPTED' && !applicant.convertedEmployee}
						<form method="POST" action="?/convert" use:enhance={convertApplicant.enhance}>
							<button
								type="submit"
								disabled={convertApplicant.busy}
								class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
								>{convertApplicant.busy
									? 'Converting…'
									: 'Convert to employee → onboarding'}</button
							>
							<p class="mt-1 text-xs text-muted-foreground">
								Creates the 201 file with this offer’s job title, salary, start date, and
								department.
							</p>
						</form>
					{/if}
				{:else if applicant.convertedEmployee}
					<p class="text-xs text-muted-foreground">Already converted to an employee.</p>
				{:else if canIssueOffer}
					<!-- Issue offer form — only from the Interview stage onward (#76). -->
					<form
						method="POST"
						action="?/issueOffer"
						use:enhance={issueOffer.enhance}
						class="grid gap-2 sm:grid-cols-2"
					>
						<div class="grid gap-1">
							<label for="of-title" class="text-xs font-medium text-muted-foreground"
								>Job title</label
							>
							<input
								id="of-title"
								name="jobTitle"
								type="text"
								required
								value={applicant.jobPosting.title}
								class="h-9 rounded-md border border-input bg-background px-2 text-sm"
							/>
						</div>
						<div class="grid gap-1">
							<label for="of-dept" class="text-xs font-medium text-muted-foreground"
								>Department</label
							>
							<select
								id="of-dept"
								name="departmentId"
								class="h-9 rounded-md border border-input bg-background px-2 text-sm"
							>
								<option value="">— Select —</option>
								{#each data.departments as d (d.id)}
									<option value={d.id} selected={d.id === applicant.jobPosting.departmentId}
										>{d.name}</option
									>
								{/each}
							</select>
						</div>
						<div class="grid gap-1">
							<label for="of-salary" class="text-xs font-medium text-muted-foreground"
								>Monthly salary (PHP)</label
							>
							<input
								id="of-salary"
								name="monthlySalary"
								type="number"
								min="0"
								step="1000"
								required
								class="h-9 rounded-md border border-input bg-background px-2 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
							/>
						</div>
						<div class="grid gap-1">
							<label for="of-start" class="text-xs font-medium text-muted-foreground"
								>Start date</label
							>
							<input
								id="of-start"
								name="startDate"
								type="date"
								required
								class="h-9 rounded-md border border-input bg-background px-2 text-sm"
							/>
						</div>
						<div class="grid gap-1 sm:col-span-2">
							<label for="of-notes" class="text-xs font-medium text-muted-foreground"
								>Notes <span class="text-muted-foreground/70">(optional)</span></label
							>
							<textarea
								id="of-notes"
								name="notes"
								rows="2"
								class="rounded-md border border-input bg-background px-3 py-2 text-sm"
							></textarea>
						</div>
						<div class="sm:col-span-2">
							<button
								type="submit"
								disabled={issueOffer.busy}
								class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
								>{issueOffer.busy ? 'Issuing…' : 'Issue offer'}</button
							>
						</div>
					</form>
				{:else}
					<p class="text-xs text-muted-foreground">
						An offer can be issued once the applicant reaches the Interview stage.
					</p>
				{/if}
			</section>
		</div>

		<div class="space-y-6 lg:h-full">
			<!-- Stage history (#52: who moved the applicant, when, and why) -->
			{#if applicant.stageHistory.length}
				<section class="rounded-lg border bg-card p-6 space-y-3 lg:h-full">
					<h2 class="font-semibold">Stage History</h2>
					<ol class="space-y-2 text-sm">
						{#each applicant.stageHistory as h (h.id)}
							<li
								class="flex flex-wrap items-baseline justify-between gap-2 border-b pb-1 last:border-0"
							>
								<span>
									<span class="font-medium">{STAGE_LABELS[h.stage] ?? h.stage}</span>
									{#if h.notes}<span class="text-muted-foreground"> — {h.notes}</span>{/if}
								</span>
								<span class="text-xs text-muted-foreground">
									{#if h.changedById && data.stageActors[h.changedById]}
										{data.stageActors[h.changedById]} ·
									{/if}
									{fmtDateTime(h.changedAt)}
								</span>
							</li>
						{/each}
					</ol>
				</section>
			{/if}
		</div>
	</div>
</div>
