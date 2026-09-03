<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import { formatCurrency, formatShortDate } from '$lib/utils/format'
	import { regularizationStatus, tenureLabel } from '$lib/utils/dates'
	import { employmentTypeLabel, contractRenewalStatus } from '$lib/utils/employment'
	import AnnouncementItem from '$lib/components/dashboard/AnnouncementItem.svelte'
	import ActivityIcon from '$lib/components/dashboard/ActivityIcon.svelte'
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	// Upcoming Events: the day keys arrive as YYYY-MM-DD already resolved to PHT, so they are
	// split rather than parsed — `new Date('2026-08-21')` then formatted locally would shift the
	// day for anyone west of UTC.
	const MONTHS = [
		'JAN',
		'FEB',
		'MAR',
		'APR',
		'MAY',
		'JUN',
		'JUL',
		'AUG',
		'SEP',
		'OCT',
		'NOV',
		'DEC'
	]
	const monthOf = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1]
	const dayOf = (key: string) => String(Number(key.slice(8, 10)))
	// Categorical, not decorative: the dot is how you tell a holiday from a contract ending at a
	// glance. Fixed hues rather than the tenant accent, which is red, amber or green per org.
	const EVENT_DOT: Record<string, string> = {
		holiday: 'bg-blue-400',
		birthday: 'bg-pink-400',
		anniversary: 'bg-violet-400',
		regularization: 'bg-amber-400',
		contract: 'bg-orange-400',
		payroll: 'bg-emerald-400',
		leave: 'bg-sky-400'
	}
	const metrics = $derived(data.metrics)
	let showPost = $state(false)

	// Per-posting guards + a reject-note toggle for the approval card (#195).
	const decideGuards: Record<string, ReturnType<typeof createSubmitGuard>> = {}
	const decideGuard = (id: string) => (decideGuards[id] ??= createSubmitGuard())
	let rejectingId = $state<string | null>(null)

	// Today's birthday greeting, rendered at the top of the announcements feed (#167).
	const birthdayBody = $derived.by(() => {
		const names = data.birthdays
		if (!names.length) return ''
		const verb = names.length === 1 ? 'celebrates' : 'celebrate'
		const list =
			names.length === 1
				? names[0]
				: `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
		return `${list} ${verb} their birthday today. Wishing you the best!`
	})
	const hasFeed = $derived(
		data.announcements.length > 0 || data.birthdays.length > 0 || data.awards.length > 0
	)

	// The viewer's own employment standing for the status card (#167).
	const status = $derived(data.myStatus)
	const renewal = $derived(
		status?.employmentType === 'CONTRACTUAL' && status.endDate
			? contractRenewalStatus(new Date(status.endDate))
			: null
	)
	// Probation as elapsed-of-six-months. Clamped at both ends: a start date in the future
	// (a pre-dated hire) would otherwise give a negative bar, and an overdue review a bar
	// past 100%.
	const probation = $derived.by(() => {
		if (status?.employmentType !== 'PROBATIONARY') return null
		const start = new Date(status.startDate)
		const s = regularizationStatus(start)
		const total = (s.date.getTime() - start.getTime()) / 86_400_000
		const elapsed = total - s.daysUntil
		return {
			...s,
			percent: Math.round(Math.min(100, Math.max(0, (elapsed / total) * 100)))
		}
	})
	// #108: a double-click posts the announcement twice to the whole organisation.
	const postAnnouncement = createSubmitGuard(() => async ({ update }) => {
		await update()
		showPost = false
	})
	// Give-award form (#180).
	let showAward = $state(false)
	const giveAward = createSubmitGuard(() => async ({ update }) => {
		await update()
		showAward = false
	})
</script>

<svelte:head>
	<title>Dashboard — Veent HRIS</title>
</svelte:head>

<div class="flex flex-1 flex-col gap-6">
	<PageHeader title="Dashboard" />

	<!-- Attendance and the metric cards stack in the left two thirds; Upcoming Events fills the
	     right third across both of their rows. Keeping attendance narrower than full width stops
	     four short numbers from spanning the whole page.

	     `grid-cols-1` is load-bearing, not decoration: without an explicit template the single
	     column is sized `auto`, so a `truncate`d line (whitespace-nowrap) sets a min-content
	     floor and the whole card pushes past a 390px viewport. Tailwind's numbered variants
	     emit `minmax(0, 1fr)`, which lets the column shrink and the text ellipsize as intended. -->
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
		<div class="space-y-4 lg:col-span-2">
			<!-- Attendance summary (today) -->
			<div class="card space-y-3">
				<div class="flex items-center justify-between">
					<p class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
						Attendance Today
					</p>
					<a href="/attendance" class="btn-row">Open attendance</a>
				</div>
				{#if metrics.attendance.derived > 0}
					<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
						<div>
							<p class="text-3xl font-bold text-green-500">{metrics.attendance.present}</p>
							<p class="text-xs text-muted-foreground">Present</p>
						</div>
						<div>
							<p class="text-3xl font-bold text-yellow-400">{metrics.attendance.late}</p>
							<p class="text-xs text-muted-foreground">Late</p>
						</div>
						<div>
							<p class="text-3xl font-bold text-red-400">{metrics.attendance.absent}</p>
							<p class="text-xs text-muted-foreground">Absent</p>
						</div>
						<div>
							<p class="text-3xl font-bold text-blue-400">{metrics.attendance.onLeave}</p>
							<p class="text-xs text-muted-foreground">On Leave</p>
						</div>
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">
						No attendance derived for today yet. Derive it from the <a
							href="/attendance"
							class="text-primary hover:underline">Attendance</a
						> page.
					</p>
				{/if}
			</div>

			<!-- Metric cards — each one drills down to its module page (#53) -->
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
				<a
					href="/employees"
					class="card flex flex-col gap-3 transition-colors hover:border-primary/40 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<p class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
						Active Employees
					</p>
					<p class="text-4xl font-bold text-foreground">{metrics.headcount}</p>
					<p class="text-xs text-muted-foreground">across your organisation</p>
				</a>

				<a
					href="/requests"
					class="card flex flex-col gap-3 transition-colors hover:border-primary/40 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<p class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
						Pending Approvals
					</p>
					<p
						class="text-4xl font-bold {metrics.pendingApprovals > 0
							? 'text-blue-400'
							: 'text-foreground'}"
					>
						{metrics.pendingApprovals}
					</p>
					<p class="text-xs text-muted-foreground">
						{metrics.pendingRequests} requests · {metrics.pendingTimesheets} timesheets · {metrics.pendingPayrollRuns}
						payroll
					</p>
				</a>

				{#if data.canViewPayroll}
					<a
						href="/payroll"
						class="card flex flex-col gap-3 transition-colors hover:border-primary/40 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<p class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
							Last Payroll
						</p>
						{#if metrics.lastPayrollRun}
							<p class="text-3xl font-bold text-foreground">
								{formatCurrency(Number(metrics.lastPayrollRun.totalNet))}
							</p>
							<p class="flex items-center gap-2 text-xs text-muted-foreground">
								<span>{formatShortDate(metrics.lastPayrollRun.periodEnd)}</span>
								<span
									class="badge-{metrics.lastPayrollRun.status === 'APPROVED' ? 'green' : 'yellow'}"
								>
									{metrics.lastPayrollRun.status}
								</span>
							</p>
						{:else}
							<p class="text-2xl font-semibold text-muted-foreground/60">—</p>
							<p class="text-xs text-muted-foreground">no payroll runs yet</p>
						{/if}
					</a>
				{/if}
			</div>
		</div>

		<!-- Next 14 days: holidays, birthdays and anniversaries for everyone; probation reviews,
		     contract ends and other people's leave only for the HR ladder, which the server
		     enforces rather than this template hiding rows. -->
		<div class="card flex h-full flex-col gap-3">
			<p class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
				Upcoming Events
			</p>
			{#if data.upcomingEvents.length}
				<ul class="divide-y divide-border/40">
					{#each data.upcomingEvents as event (event.kind + event.date + event.title)}
						<li class="flex items-start gap-3 py-2">
							<div class="w-11 shrink-0 text-center">
								<p class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
									{monthOf(event.date)}
								</p>
								<p class="text-base font-semibold leading-none">{dayOf(event.date)}</p>
							</div>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm {event.mine ? 'font-medium text-foreground' : ''}">
									{event.title}
								</p>
								{#if event.detail}
									<p class="flex items-center gap-1.5 text-xs text-muted-foreground">
										<span class="h-1.5 w-1.5 shrink-0 rounded-full {EVENT_DOT[event.kind]}"></span>
										{event.detail}
									</p>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{:else}
				<!-- The card spans two rows, so an empty one is a tall void. A centred empty state
				     fills it deliberately instead of leaving a lone sentence at the top. -->
				<div class="flex flex-1 items-center justify-center">
					<EmptyState
						title="Nothing in the next 14 days"
						description="Holidays, birthdays and work anniversaries appear here as they approach."
					/>
				</div>
			{/if}
		</div>
	</div>

	<!-- Recent activity, announcements and personal status sit in one row: each is a glance,
	     not a task, so they read side by side and none of them pushes the others below the
	     fold. They collapse to a single column below lg, and the row simply carries fewer
	     cards when a viewer has no activity yet or no employee record. -->
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
		<!-- Recent activity — payslips, request outcomes, etc. (#169) -->
		{#if data.recentActivity.length}
			<div class="card space-y-3">
				<p class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
					Recent Activity
				</p>
				<!-- One card per item rather than a divided list: the icon needs room beside the text,
				     and a hairline rule between two-line rows reads as clutter where a tile edge
				     reads as grouping. Unread rows carry the accent ring, so "new" survives without
				     a separate dot competing with the icon. -->
				<ul class="max-h-96 space-y-2 overflow-y-auto">
					{#each data.recentActivity as n (n.id)}
						{@const unread = !n.readAt}
						<li>
							<svelte:element
								this={n.link ? 'a' : 'div'}
								href={n.link ?? undefined}
								class="flex items-start gap-3 rounded-lg border p-3 transition-colors {unread
									? 'border-primary/60 bg-primary/[0.04]'
									: 'border-foreground/15 bg-muted/30'} {n.link ? 'hover:bg-accent/40' : ''}"
							>
								<ActivityIcon kind={n.kind} />
								<div class="min-w-0 flex-1">
									<p class="text-sm leading-snug text-foreground">{n.message}</p>
									<p class="mt-0.5 text-xs text-muted-foreground">
										{formatShortDate(n.createdAt)}
										{#if unread}<span class="text-primary">· New</span>{/if}
									</p>
								</div>
							</svelte:element>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<!-- Announcements -->
		<div class="card flex h-full flex-col gap-3">
			<div class="flex items-center justify-between">
				<p class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
					Announcements
				</p>
				{#if data.canPost}
					<div class="flex items-center gap-2">
						<button
							type="button"
							onclick={() => (showAward = !showAward)}
							class="rounded-md border border-amber-500/40 px-3 py-1 text-xs font-medium text-amber-500 hover:bg-amber-500/10"
							>{showAward ? 'Cancel' : 'Give award'}</button
						>
						<button
							type="button"
							onclick={() => (showPost = !showPost)}
							class="rounded-md border border-primary/40 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10"
							>{showPost ? 'Cancel' : 'Post'}</button
						>
					</div>
				{/if}
			</div>

			{#if form?.posted}
				<Banner kind="success" message="Announcement posted." />
			{/if}
			{#if form?.awarded}
				<Banner kind="success" message="Award given." />
			{/if}

			{#if showAward && data.canPost}
				<form
					method="POST"
					action="?/giveAward"
					use:enhance={giveAward.enhance}
					class="space-y-2 rounded-md border p-3"
				>
					{#if form?.error}<p class="text-xs text-red-400">{form.error}</p>{/if}
					<div class="grid gap-2 sm:grid-cols-2">
						<select name="employeeId" required class="input h-9">
							<option value="">Select employee…</option>
							{#each data.awardEmployees as e (e.id)}
								<option value={e.id}>{e.lastName}, {e.firstName}</option>
							{/each}
						</select>
						<input
							name="title"
							placeholder="Award (e.g. Employee of the Month)"
							required
							class="input h-9"
						/>
					</div>
					<input name="note" placeholder="Note (optional)" class="input h-9" />
					<button
						type="submit"
						disabled={giveAward.busy}
						class="btn-primary text-sm disabled:pointer-events-none disabled:opacity-50"
						>{giveAward.busy ? 'Giving…' : 'Give award'}</button
					>
				</form>
			{/if}

			{#if showPost && data.canPost}
				<form
					method="POST"
					action="?/postAnnouncement"
					use:enhance={postAnnouncement.enhance}
					class="space-y-2 rounded-md border p-3"
				>
					{#if form?.error}<p class="text-xs text-red-400">{form.error}</p>{/if}
					<input name="title" placeholder="Title" required class="input h-9" />
					<textarea
						name="body"
						rows="2"
						placeholder="Message to the whole organisation…"
						required
						class="input h-auto resize-none py-2"
					></textarea>
					<button
						type="submit"
						disabled={postAnnouncement.busy}
						class="btn-primary text-sm disabled:pointer-events-none disabled:opacity-50"
						>{postAnnouncement.busy ? 'Posting…' : 'Post announcement'}</button
					>
				</form>
			{/if}

			{#if hasFeed}
				<ul class="divide-y">
					{#if data.birthdays.length}
						<AnnouncementItem variant="birthday" title="Happy Birthday!" body={birthdayBody} />
					{/if}
					{#each data.awards as aw (aw.id)}
						<AnnouncementItem
							variant="award"
							title={`${aw.employeeName} — ${aw.title}`}
							body={aw.note ?? undefined}
							timestamp={aw.createdAt}
						/>
					{/each}
					{#each data.announcements as a (a.id)}
						<AnnouncementItem
							title={a.title}
							body={a.body}
							timestamp={a.createdAt}
							author={a.authorName}
						/>
					{/each}
				</ul>
			{:else}
				<div class="flex flex-1 items-center justify-center">
					<EmptyState
						title="No announcements yet"
						description={data.canPost
							? 'Post one to reach everyone in your organisation.'
							: 'Company-wide notices from HR show up here.'}
					/>
				</div>
			{/if}
		</div>

		<!-- Employee's own status: employment, leave left, open items, work setup (#167) -->
		{#if status}
			<div class="card space-y-4">
				<p class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
					My Status
				</p>

				<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
					<span
						class="inline-block rounded-full px-2.5 py-0.5 text-sm font-medium {status.employmentType ===
						'REGULAR'
							? 'bg-green-500/15 text-green-400'
							: status.employmentType === 'PROBATIONARY'
								? 'bg-yellow-500/15 text-yellow-400'
								: status.employmentType === 'CONTRACTUAL'
									? 'bg-blue-500/15 text-blue-400'
									: 'bg-gray-500/15 text-gray-300'}"
					>
						{employmentTypeLabel(status.employmentType)}
					</span>
					<span class="text-xs text-muted-foreground">
						{tenureLabel(new Date(status.startDate))} · since {formatShortDate(status.startDate)}
					</span>
				</div>

				<!-- Probation runs from a known start to a known date, so it reads as progress; a
				     contract's end has no comparable origin to measure from, so it stays a date. -->
				{#if probation}
					<div class="space-y-1.5">
						<div class="flex items-baseline justify-between gap-2 text-xs">
							<span class="text-muted-foreground">Probation</span>
							<span
								class={probation.overdue ? 'font-medium text-amber-500' : 'text-muted-foreground'}
							>
								{probation.overdue
									? 'Review overdue'
									: `${probation.daysUntil} day${probation.daysUntil === 1 ? '' : 's'} left`}
							</span>
						</div>
						<div class="h-1.5 overflow-hidden rounded-full bg-muted">
							<div
								class="h-full rounded-full {probation.overdue ? 'bg-amber-500' : 'bg-primary'}"
								style="width: {probation.percent}%"
							></div>
						</div>
						<p class="text-xs text-muted-foreground">
							Regularizes {formatShortDate(probation.date)}
						</p>
					</div>
				{:else if renewal}
					<div class="flex items-baseline justify-between gap-2 text-xs">
						<span class="text-muted-foreground">Contract</span>
						<span
							class="font-medium {renewal.expired
								? 'text-red-400'
								: renewal.dueForRenewal
									? 'text-amber-500'
									: 'text-foreground'}"
						>
							{renewal.expired
								? `Expired ${formatShortDate(status.endDate!)}`
								: `Ends ${formatShortDate(status.endDate!)} · ${renewal.daysUntil} day${renewal.daysUntil === 1 ? '' : 's'}`}
						</span>
					</div>
				{/if}

				{#if status.leave.length}
					<div class="space-y-1.5 border-t border-border/60 pt-3">
						<p class="text-xs text-muted-foreground">Leave left this year</p>
						{#each status.leave as bal (bal.name)}
							<div class="flex items-baseline justify-between gap-3 text-sm">
								<span class="min-w-0 truncate text-muted-foreground">{bal.name}</span>
								<span class="shrink-0 tabular-nums">
									<span class={bal.remaining <= 0 ? 'text-muted-foreground' : 'font-medium'}
										>{bal.remaining}</span
									>
									<span class="text-xs text-muted-foreground">/ {bal.allocated}</span>
								</span>
							</div>
						{/each}
					</div>
				{/if}

				<!-- Only the viewer's own open items, and only when there are any: a row reading
				     "0 pending" is noise on a card whose job is to say what needs doing. -->
				{#if status.pendingRequests || status.openTimesheets}
					<div class="space-y-1 border-t border-border/60 pt-3">
						{#if status.pendingRequests}
							<a
								href="/requests"
								class="flex items-center justify-between gap-3 text-sm transition-colors hover:text-primary"
							>
								<span
									>{status.pendingRequests} request{status.pendingRequests === 1 ? '' : 's'} awaiting
									approval</span
								>
								<span aria-hidden="true" class="text-muted-foreground">→</span>
							</a>
						{/if}
						{#if status.openTimesheets}
							<a
								href="/timesheets"
								class="flex items-center justify-between gap-3 text-sm transition-colors hover:text-primary"
							>
								<span
									>{status.openTimesheets} timesheet{status.openTimesheets === 1 ? '' : 's'} not submitted</span
								>
								<span aria-hidden="true" class="text-muted-foreground">→</span>
							</a>
						{/if}
					</div>
				{/if}

				{#if status.schedule || status.managerName || status.departmentName}
					<dl class="space-y-1.5 border-t border-border/60 pt-3 text-sm">
						{#if status.schedule}
							<div class="flex items-baseline justify-between gap-3">
								<dt class="shrink-0 text-muted-foreground">Schedule</dt>
								<dd class="min-w-0 text-right">
									{#if status.schedule.daysLabel && status.schedule.hoursLabel}
										{status.schedule.daysLabel}, {status.schedule.hoursLabel}
									{:else if status.schedule.daysLabel}
										{status.schedule.daysLabel} · {status.schedule.name}
									{:else}
										{status.schedule.name}
									{/if}
								</dd>
							</div>
						{/if}
						{#if status.managerName}
							<div class="flex items-baseline justify-between gap-3">
								<dt class="shrink-0 text-muted-foreground">Reports to</dt>
								<dd class="min-w-0 truncate text-right">{status.managerName}</dd>
							</div>
						{/if}
						{#if status.departmentName}
							<div class="flex items-baseline justify-between gap-3">
								<dt class="shrink-0 text-muted-foreground">Department</dt>
								<dd class="min-w-0 truncate text-right">{status.departmentName}</dd>
							</div>
						{/if}
					</dl>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Upcoming regularizations — HR's advance warning (#168) -->
	{#if data.canPost && data.regularizations.length}
		<div class="card space-y-3 border-amber-500/30 bg-amber-500/5">
			<div class="flex items-center gap-2">
				<svg
					class="h-4 w-4 text-amber-500"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.7"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path
						d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
					/>
				</svg>
				<p class="text-xs font-semibold uppercase tracking-widest text-amber-500">
					Upcoming Regularizations
				</p>
			</div>
			<p class="text-xs text-muted-foreground">
				Probationary staff becoming regular within the next three weeks — decide before the date
				lands.
			</p>
			<ul class="divide-y divide-border/60">
				{#each data.regularizations as r (r.id)}
					<li class="flex items-center justify-between gap-3 py-2">
						<div class="min-w-0">
							<a href="/employees/{r.id}" class="font-medium hover:underline">{r.name}</a>
							<p class="truncate text-xs text-muted-foreground">{r.jobTitle} · {r.department}</p>
						</div>
						<div class="shrink-0 text-right">
							<p class="text-sm">{formatShortDate(r.regularizationDate)}</p>
							<p class="text-xs font-medium {r.overdue ? 'text-red-400' : 'text-amber-500'}">
								{r.overdue
									? `Overdue by ${-r.daysUntil} day${r.daysUntil === -1 ? '' : 's'}`
									: r.daysUntil === 0
										? 'Regularizes today'
										: `in ${r.daysUntil} day${r.daysUntil === 1 ? '' : 's'}`}
							</p>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Job postings awaiting your approval (#195) -->
	{#if data.postingsToApprove.length}
		<div class="card space-y-3 border-blue-500/30 bg-blue-500/5">
			<p class="text-xs font-semibold uppercase tracking-widest text-blue-400">
				Postings awaiting your approval
			</p>
			<ul class="divide-y divide-border/60">
				{#each data.postingsToApprove as p (p.id)}
					{@const g = decideGuard(p.id)}
					<li class="space-y-2 py-2">
						<div class="flex items-center justify-between gap-3">
							<div class="min-w-0">
								<p class="font-medium">{p.title}</p>
								<p class="truncate text-xs text-muted-foreground">{p.department}</p>
							</div>
							<div class="flex shrink-0 items-center gap-2">
								<form method="POST" action="?/decidePosting" use:enhance={g.enhance}>
									<input type="hidden" name="id" value={p.id} />
									<input type="hidden" name="action" value="approve" />
									<button
										type="submit"
										disabled={g.busy}
										class="rounded-md border border-green-500/30 px-3 py-1 text-xs font-medium text-green-400 hover:bg-green-500/10 disabled:pointer-events-none disabled:opacity-50"
										>{g.busy ? '…' : 'Approve'}</button
									>
								</form>
								<button
									type="button"
									onclick={() => (rejectingId = rejectingId === p.id ? null : p.id)}
									class="rounded-md border px-3 py-1 text-xs font-medium hover:bg-accent"
									>Send back</button
								>
							</div>
						</div>
						{#if rejectingId === p.id}
							<form
								method="POST"
								action="?/decidePosting"
								use:enhance={g.enhance}
								class="flex items-center gap-2"
							>
								<input type="hidden" name="id" value={p.id} />
								<input type="hidden" name="action" value="reject" />
								<input
									name="note"
									required
									placeholder="Reason to send back to draft…"
									class="h-8 flex-1 rounded border border-input bg-background px-2 text-xs"
								/>
								<button
									type="submit"
									disabled={g.busy}
									class="rounded-md border px-3 py-1 text-xs font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
									>Confirm</button
								>
							</form>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	<!-- Quick actions. `mt-auto` rather than stretching the feed row: the buttons still land at
	     the bottom of a tall screen, but the slack becomes page background instead of empty card
	     interiors — a short card reads as fine, a hollow one reads as broken. -->
	<div class="mt-auto grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
		<a
			href="/employees/new"
			class="card group flex items-center gap-4 transition-colors hover:border-primary/40 hover:bg-card/80"
		>
			<div
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z"
					/>
				</svg>
			</div>
			<div>
				<p class="text-sm font-medium text-foreground">Onboard Employee</p>
				<p class="text-xs text-muted-foreground">Add a new team member</p>
			</div>
		</a>

		<!-- Links rather than opening the dialog: creating a sheet now names its employee, and
		     the picker's roster is loaded by /timesheets, not here. -->
		{#if data.canCreateTimesheet}
			<a
				href="/timesheets"
				class="card group flex items-center gap-4 transition-colors hover:border-primary/40 hover:bg-card/80"
			>
				<div
					class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="1.5"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
						/>
					</svg>
				</div>
				<div>
					<p class="text-sm font-medium text-foreground">New Timesheet</p>
					<p class="text-xs text-muted-foreground">Create a sheet for an employee</p>
				</div>
			</a>
		{/if}

		<a
			href="/leave/new"
			class="card group flex items-center gap-4 transition-colors hover:border-primary/40 hover:bg-card/80"
		>
			<div
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-yellow-500/10 text-yellow-400 group-hover:bg-yellow-500/20"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
					/>
				</svg>
			</div>
			<div>
				<p class="text-sm font-medium text-foreground">File Leave</p>
				<p class="text-xs text-muted-foreground">Submit a leave request</p>
			</div>
		</a>
	</div>
</div>
