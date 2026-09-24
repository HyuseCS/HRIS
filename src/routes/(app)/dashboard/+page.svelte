<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import { formatCurrency, formatShortDate } from '$lib/utils/format'
	import { regularizationStatus, tenureLabel } from '$lib/utils/dates'
	import { employmentTypeLabel, contractRenewalStatus } from '$lib/utils/employment'
	import { labelFor, PAYROLL_RUN_STATUS_LABELS } from '$lib/labels'
	import AnnouncementItem from '$lib/components/dashboard/AnnouncementItem.svelte'
	import ActivityIcon from '$lib/components/dashboard/ActivityIcon.svelte'
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import Monogram from '$lib/components/people/Monogram.svelte'
	import HelpTip from '$lib/components/ui/HelpTip.svelte'
	import Container from '$lib/components/ui/Container.svelte'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
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

	const cols = (n: number) =>
		n >= 4
			? 'lg:grid-cols-4'
			: n === 3
				? 'lg:grid-cols-3'
				: n === 2
					? 'lg:grid-cols-2'
					: 'lg:grid-cols-1'

	let showPost = $state(false)

	// Per-posting guards + a reject-note toggle for the approval card (#195).
	const decideGuards: Record<string, ReturnType<typeof submitFeedback>> = {}
	const decideGuard = (id: string) => (decideGuards[id] ??= submitFeedback({ error: null }))
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
	const postAnnouncement = submitFeedback({
		error: null,
		onSuccess: () => {
			showPost = false
		}
	})
	// Give-award form (#180).
	let showAward = $state(false)
	const giveAward = submitFeedback({
		error: null,
		onSuccess: () => {
			showAward = false
		}
	})
	let openPanel = $state<'regularizations' | 'postings' | 'awaiting' | null>(null)
	let cluster = $state<HTMLElement>()
	const glanceCount = $derived(data.canViewPayroll ? 3 : 2)
	const feedCount = $derived(
		[data.recentActivity.length, true, !!status, true].filter(Boolean).length
	)
	const doorCount = $derived(data.canCreateTimesheet ? 3 : 2)
</script>

<svelte:window
	onkeydown={(e) => e.key === 'Escape' && (openPanel = null)}
	onclick={(e) => cluster && !cluster.contains(e.target as Node) && (openPanel = null)}
/>

<svelte:head>
	<title>Dashboard — Veent HRIS</title>
</svelte:head>

<div class="flex flex-1 flex-col gap-6">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div class="min-w-0 flex-1">
			<PageHeader title="Dashboard" />
		</div>
		<div bind:this={cluster} class="relative flex shrink-0 items-center gap-2 sm:pt-1">
			{#if data.canPost}
				<button
					type="button"
					onclick={() => (openPanel = openPanel === 'regularizations' ? null : 'regularizations')}
					aria-expanded={openPanel === 'regularizations'}
					aria-controls="panel-regularizations"
					aria-haspopup="true"
					aria-label="{data.regularizationsTotal} upcoming regularizations"
					class="relative flex h-9 w-9 items-center justify-center rounded-md border hover:bg-accent"
				>
					<svg
						class="h-5 w-5 text-amber-500"
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
					{#if data.regularizationsTotal > 0}
						<span
							aria-hidden="true"
							class="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-primary-foreground"
							>{data.regularizationsTotal}</span
						>
					{/if}
				</button>
			{/if}

			{#if data.canDecidePostings}
				<button
					type="button"
					onclick={() => (openPanel = openPanel === 'postings' ? null : 'postings')}
					aria-expanded={openPanel === 'postings'}
					aria-controls="panel-postings"
					aria-haspopup="true"
					aria-label="{data.postingsToApproveTotal} postings awaiting your approval"
					class="relative flex h-9 w-9 items-center justify-center rounded-md border hover:bg-accent"
				>
					<svg
						class="h-5 w-5 text-muted-foreground"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path
							d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 6.006a2.18 2.18 0 0 1-.75.402m0 0a48.108 48.108 0 0 1-15 0m15 0a2.18 2.18 0 0 0 .75-.402M3.75 14.15a2.18 2.18 0 0 1-.75-1.661V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z"
						/>
					</svg>
					{#if data.postingsToApproveTotal > 0}
						<span
							aria-hidden="true"
							class="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-primary-foreground"
							>{data.postingsToApproveTotal}</span
						>
					{/if}
				</button>
			{/if}

			{#if data.canApprove}
				<button
					type="button"
					onclick={() => (openPanel = openPanel === 'awaiting' ? null : 'awaiting')}
					aria-expanded={openPanel === 'awaiting'}
					aria-controls="panel-awaiting"
					aria-haspopup="true"
					aria-label="{metrics.pendingApprovals} awaiting your decision"
					class="relative flex h-9 w-9 items-center justify-center rounded-md border hover:bg-accent"
				>
					<svg
						class="h-5 w-5 text-muted-foreground"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path
							d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z"
						/>
					</svg>
					{#if metrics.pendingApprovals > 0}
						<span
							aria-hidden="true"
							class="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-primary-foreground"
							>{metrics.pendingApprovals}</span
						>
					{/if}
				</button>
			{/if}

			<!-- Upcoming regularizations — HR's advance warning (#168) -->
			{#if openPanel === 'regularizations'}
				<div
					id="panel-regularizations"
					role="region"
					aria-label="Upcoming Regularizations"
					class="absolute right-0 top-full z-50 mt-2 flex max-h-[calc(100dvh-9rem)] w-[calc(100vw-2rem)] flex-col gap-3 overflow-visible rounded-xl border bg-card p-4 shadow-2xl sm:w-96"
				>
					<div class="relative flex items-center gap-2">
						<h2 class="text-sm font-semibold">Upcoming Regularizations</h2>
						<HelpTip label="About upcoming regularizations"
							>Probationary staff becoming regular within the next three weeks — decide before the
							date lands.</HelpTip
						>
					</div>
					{#if data.regularizations.length === 0}
						<p class="text-sm text-muted-foreground">Nothing pending.</p>
					{:else}
						<ul class="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto">
							{#each data.regularizations as r (r.id)}
								<li class="flex items-center justify-between gap-3 py-2">
									<div class="min-w-0">
										<a href="/employees/{r.id}" class="font-medium hover:underline">{r.name}</a>
										<p class="truncate text-xs text-muted-foreground">
											{r.jobTitle} · {r.department}
										</p>
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
						<a href="/employees" class="btn-row self-start">View all employees</a>
					{/if}
				</div>
				<!-- Job postings awaiting your approval (#195) -->
			{:else if openPanel === 'postings'}
				<div
					id="panel-postings"
					role="region"
					aria-label="Postings awaiting your approval"
					class="absolute right-0 top-full z-50 mt-2 flex max-h-[calc(100dvh-9rem)] w-[calc(100vw-2rem)] flex-col gap-3 overflow-hidden rounded-xl border bg-card p-4 shadow-2xl sm:w-96"
				>
					<h2 class="text-sm font-semibold">Postings awaiting your approval</h2>
					<!-- Scoped: with the award panel open, a posting failure used to render under
					     "Give award", where nothing had gone wrong. -->
					{#if form?.action === 'decidePosting' && form?.error}
						<Banner kind="error" message={form.error} />
					{/if}
					{#if data.postingsToApprove.length === 0}
						<p class="text-sm text-muted-foreground">Nothing pending.</p>
					{:else}
						<ul class="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto">
							{#each data.postingsToApprove as p (p.id)}
								{@const g = decideGuard(p.id)}
								<li class="space-y-2 py-2">
									<div class="flex items-center justify-between gap-3">
										<div class="min-w-0">
											<a href="/recruitment/{p.id}" class="font-medium hover:underline">{p.title}</a
											>
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
						{#if data.canPost}
							<a href="/recruitment" class="btn-row self-start">View all postings</a>
						{:else if data.postingsToApproveTotal > data.postingsToApprove.length}
							<a href="/dashboard?postings=all" class="btn-row self-start">Show all postings</a>
						{/if}
					{/if}
				</div>
				<!-- Awaiting you — one door to the four approval inboxes. Hidden entirely at zero, matching the
			     status card's rule that "0 pending" is noise on a surface whose job is to say what needs
			     doing. -->
			{:else if openPanel === 'awaiting'}
				<div
					id="panel-awaiting"
					role="region"
					aria-label="Awaiting you"
					class="absolute right-0 top-full z-50 mt-2 flex max-h-[calc(100dvh-9rem)] w-[calc(100vw-2rem)] flex-col gap-3 overflow-hidden rounded-xl border bg-card p-4 shadow-2xl sm:w-96"
				>
					<h2 class="text-sm font-semibold">Awaiting you</h2>
					{#if data.pendingItems.length === 0}
						<p class="text-sm text-muted-foreground">Nothing pending.</p>
					{:else}
						<ul class="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto">
							{#each data.pendingItems as item (item.href + item.id)}
								<li>
									<a href={item.href} class="flex items-center gap-3 py-2 hover:text-primary">
										{#if item.person}
											<Monogram
												firstName={item.person.firstName}
												lastName={item.person.lastName}
												size="sm"
											/>
										{:else}
											<span aria-hidden="true" class="h-7 w-7 shrink-0"></span>
										{/if}
										<span class="min-w-0">
											<span class="block truncate font-medium">{item.label}</span>
											<span class="block truncate text-xs text-muted-foreground">{item.sub}</span>
										</span>
									</a>
								</li>
							{/each}
						</ul>
						{#if metrics.pendingApprovals > data.pendingItems.length}
							<a href="/requests/approvals" class="block pt-2 text-xs text-primary hover:underline"
								>View all {metrics.pendingApprovals}</a
							>
						{/if}
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- Zones in priority order: what needs a decision, then the numbers, then the feed, then the
	     doors. Each zone's lg column count is derived from the cards that role actually sees, so no
	     row ends with a lone stretched card.

	     `grid-cols-1` is load-bearing, not decoration: without an explicit template the single
	     column is sized `auto`, so a `truncate`d line (whitespace-nowrap) sets a min-content
	     floor and the whole card pushes past a 390px viewport. Tailwind's numbered variants
	     emit `minmax(0, 1fr)`, which lets the column shrink and the text ellipsize as intended. -->

	<section class="space-y-3">
		<h2 class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
			AT A GLANCE
		</h2>
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
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 {cols(glanceCount)}" data-zone="glance">
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
					payroll · {metrics.pendingProposals} pay changes
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
								class={metrics.lastPayrollRun.status === 'APPROVED'
									? 'badge-green'
									: 'badge-yellow'}
							>
								{labelFor(PAYROLL_RUN_STATUS_LABELS, metrics.lastPayrollRun.status)}
							</span>
						</p>
					{:else}
						<p class="text-2xl font-semibold text-muted-foreground/60">—</p>
						<p class="text-xs text-muted-foreground">no payroll runs yet</p>
					{/if}
				</a>
			{/if}
		</div>
	</section>

	<!-- Recent activity, announcements, personal status and upcoming events are each a glance, not a
	     task, so they read side by side. Four cards go 2x2 rather than 3+1, and the row simply
	     carries fewer when a viewer has no activity yet or no employee record. -->
	<section class="space-y-3">
		<h2 class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">FEED</h2>
		<div class="grid grid-cols-1 gap-4 {cols(feedCount === 4 ? 2 : feedCount)}" data-zone="feed">
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

				{#if showAward && data.canPost}
					<Container tone="card" fill={false} flush>
						<form
							method="POST"
							action="?/giveAward"
							use:enhance={giveAward.enhance}
							class="space-y-2 p-3"
						>
							{#if form?.action === 'giveAward' && form?.error}<p class="text-xs text-red-400">
									{form.error}
								</p>{/if}
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
					</Container>
				{/if}

				{#if showPost && data.canPost}
					<Container tone="card" fill={false} flush>
						<form
							method="POST"
							action="?/postAnnouncement"
							use:enhance={postAnnouncement.enhance}
							class="space-y-2 p-3"
						>
							{#if form?.action === 'postAnnouncement' && form?.error}<p
									class="text-xs text-red-400"
								>
									{form.error}
								</p>{/if}
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
					</Container>
				{/if}

				{#if hasFeed}
					<ul class="max-h-80 divide-y overflow-y-auto">
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
						<div class="max-h-80 space-y-1.5 overflow-y-auto border-t border-border/60 pt-3">
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

			<!-- Next 14 days: holidays, birthdays and anniversaries for everyone; probation reviews,
			     contract ends and other people's leave only for the HR ladder, which the server
			     enforces rather than this template hiding rows. -->
			<div class="card flex h-full flex-col gap-3">
				<p class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
					Upcoming Events
				</p>
				{#if data.upcomingEvents.length}
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<div
						tabindex="0"
						role="region"
						aria-label="Upcoming events"
						class="max-h-80 overflow-y-auto"
					>
						<ul class="divide-y divide-border/40">
							{#each data.upcomingEvents as event (event.kind + event.date + event.title)}
								<li class="flex items-start gap-3 py-2">
									<div class="w-11 shrink-0 text-center">
										<p
											class="text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
										>
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
												<span class="h-1.5 w-1.5 shrink-0 rounded-full {EVENT_DOT[event.kind]}"
												></span>
												{event.detail}
											</p>
										{/if}
									</div>
								</li>
							{/each}
						</ul>
					</div>
				{:else}
					<!-- An empty card beside full siblings is a void. A centred empty state fills it deliberately
					     instead of leaving a lone sentence at the top. -->
					<div class="flex flex-1 items-center justify-center">
						<EmptyState
							title="Nothing in the next 14 days"
							description="Holidays, birthdays and work anniversaries appear here as they approach."
						/>
					</div>
				{/if}
			</div>
		</div>
	</section>

	<section class="mt-auto space-y-3">
		<h2 class="text-xs font-semibold uppercase tracking-widest text-muted-foreground">DOORS</h2>
		<!-- Quick actions. `mt-auto` rather than stretching the feed row: the buttons still land at
		     the bottom of a tall screen, but the slack becomes page background instead of empty card
		     interiors — a short card reads as fine, a hollow one reads as broken. -->
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 {cols(doorCount)}" data-zone="doors">
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
				href="/requests?new=leave"
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
	</section>
</div>
