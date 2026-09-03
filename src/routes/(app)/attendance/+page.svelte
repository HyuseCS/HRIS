<script lang="ts">
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import type { SubmitFunction } from '@sveltejs/kit'
	import Pagination from '$lib/components/Pagination.svelte'
	import Badge from '$lib/components/ui/Badge.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import { periodOf, toPeriodInputValue, type PeriodKind } from '$lib/utils/pay-periods'
	import type { PageData, ActionData } from './$types'

	// Don't reset the form on success: enhance's default form.reset() clears the cross-cell
	// (form=…) inputs, and Svelte only re-syncs inputs whose value changed — so untouched
	// Reg/OT/times would blank out. Keep values; invalidateAll refreshes them from the server.
	const keepValues: SubmitFunction =
		() =>
		async ({ update }) =>
			update({ reset: false })

	// Reset discards the manual correction and re-derives from punches — confirm first.
	const confirmReset: SubmitFunction = ({ cancel }) => {
		if (!confirm('Discard the manual edit for this day and re-derive it from punches?')) cancel()
		return async ({ update }) => update({ reset: false })
	}

	// #108: these bulk actions rewrite whole ranges/days — a double-click re-runs the derive or
	// re-locks mid-flight. One guard per singleton form.
	const derive = createSubmitGuard()
	const lock = createSubmitGuard()
	const unlock = createSubmitGuard()
	const saveTimesheet = createSubmitGuard()
	const deriveTeam = createSubmitGuard()
	const lockTeam = createSubmitGuard()
	const unlockTeam = createSubmitGuard()
	// #200: the backlog import writes punches for a whole file — a double-submit would re-run it.
	const importBacklog = createSubmitGuard()

	// Per-row forms live inside {#each}, so they need a guard per row — a shared one would grey out
	// every row's button at once. Created lazily and cached by record id.
	const rowGuards = new Map<string, ReturnType<typeof createSubmitGuard>>()
	function rowGuard(key: string, inner?: SubmitFunction) {
		let g = rowGuards.get(key)
		if (!g) {
			g = createSubmitGuard(inner)
			rowGuards.set(key, g)
		}
		return g
	}

	let { data, form }: { data: PageData; form: ActionData } = $props()

	// #163: the range stays free-form and "Save as timesheet" now accepts any same-month span —
	// createTimesheet validates it server-side and refuses an overlap with a 409. Quick-picks still
	// snap to a standard pay period. from/to are YYYY-MM-DD (UTC-midnight days).

	// Set the From/To inputs to a range and re-run the GET filter (same path the date inputs use).
	function applyRange(from: string, to: string) {
		const f = document.getElementById('from') as HTMLInputElement | null
		const t = document.getElementById('to') as HTMLInputElement | null
		if (!f || !t) return
		f.value = from
		t.value = to
		f.form?.requestSubmit()
	}
	function pickPeriod(kind: PeriodKind, monthsBack = 0) {
		const now = new Date()
		let y = now.getFullYear()
		let m = now.getMonth() - monthsBack
		while (m < 0) {
			m += 12
			y--
		}
		const p = periodOf(kind, y, m)
		applyRange(toPeriodInputValue(p.periodStart), toPeriodInputValue(p.periodEnd))
	}
	const QUICK_PICKS: { label: string; kind: PeriodKind; monthsBack?: number }[] = [
		{ label: 'First half', kind: 'FIRST_HALF' },
		{ label: 'Second half', kind: 'SECOND_HALF' },
		{ label: 'This month', kind: 'WHOLE_MONTH' },
		{ label: 'Prev month', kind: 'WHOLE_MONTH', monthsBack: 1 }
	]

	const STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'INCOMPLETE', 'ON_LEAVE', 'HOLIDAY', 'REST_DAY']

	function fmtDate(d: string | Date) {
		return new Date(d).toLocaleDateString('en-PH', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			timeZone: 'Asia/Manila'
		})
	}
	function fmtTime(d: string | Date | null) {
		if (!d) return '—'
		return new Date(d).toLocaleTimeString('en-PH', {
			hour: '2-digit',
			minute: '2-digit',
			timeZone: 'Asia/Manila'
		})
	}
	const n = (x: unknown) => Number(x)

	// When In/Out are entered manually, auto-fill Reg (and OT overflow) to mirror the derive
	// engine: worked = (Out − In) − 1h break past 5h; Reg = min(worked, 8), OT = the rest.
	// HR can still override the numbers afterward.
	function recalcHours(e: Event) {
		const el = e.currentTarget as HTMLInputElement
		const fid = el.getAttribute('form')
		if (!fid) return
		const q = (name: string) =>
			document.querySelector<HTMLInputElement>(`input[name="${name}"][form="${fid}"]`)
		const tin = q('timeIn')?.value
		const tout = q('timeOut')?.value
		const reg = q('regularHours')
		const ot = q('overtimeHours')
		if (!tin || !tout || !reg || !ot) return
		const [ih, im] = tin.split(':').map(Number)
		const [oh, om] = tout.split(':').map(Number)
		let mins = oh * 60 + om - (ih * 60 + im)
		if (mins < 0) mins += 1440 // overnight out
		const gross = mins / 60
		const worked = Math.max(0, gross - (gross > 5 ? 1 : 0))
		reg.value = Math.min(worked, 8).toFixed(2)
		ot.value = Math.max(0, worked - 8).toFixed(2)
	}

	// 24h HH:MM for a <input type="time">, in Manila time; '' when no punch.
	function toTimeInput(d: string | Date | null) {
		if (!d) return ''
		return new Date(d).toLocaleTimeString('en-GB', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
			timeZone: 'Asia/Manila'
		})
	}
	// YYYY-MM-DD (Manila) for the row's date, sent so the server can rebuild edited timestamps.
	function toDateKey(d: string | Date) {
		return new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
	}

	// Editable cells that read as plain text until focused, then reveal an input affordance.
	// Content-sized (not w-full) so the table columns spread evenly instead of one ballooning.
	const CELL =
		'h-7 rounded border border-transparent bg-transparent px-1 text-xs hover:bg-muted/40 focus:border-input focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring'
	const CELL_NUM =
		CELL +
		' w-16 text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
	const CELL_SEL = CELL + ' appearance-none'
	const CELL_TIME = CELL + ' w-24'

	const exportHref = $derived(
		data.view === 'team'
			? `/attendance/export?view=team&date=${data.date}`
			: `/attendance/export?view=employee&employeeId=${data.selectedEmployeeId ?? ''}&from=${data.from}&to=${data.to}`
	)

	// "Exceptions only" — surface the rows that need HR action (failed to time in,
	// incomplete logs, tardiness) so the morning fail-check doesn't mean scrolling the
	// whole sheet. A missing team record counts as an exception (no punch = didn't time in).
	let exceptionsOnly = $state(false)
	const isException = (s: string) => s === 'ABSENT' || s === 'INCOMPLETE' || s === 'LATE'
	const teamRows = $derived(
		exceptionsOnly ? data.team.filter((t) => !t.day || isException(t.day.status)) : data.team
	)
	const dayRows = $derived(
		exceptionsOnly ? data.days.filter((d) => isException(d.status)) : data.days
	)

	// Heroicons (outline, 24×24) — match the inline-SVG convention used in the app nav.
	const IC = {
		refresh:
			'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99',
		lock: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
		lockOpen:
			'M13.5 10.5V6.75a4.5 4.5 0 119 0v3.75M3.75 21.75h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H3.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
		download:
			'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3',
		document:
			'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z'
	}
</script>

<svelte:head>
	<title>Attendance — Veent HRIS</title>
</svelte:head>

{#snippet icon(d: string, cls = 'h-4 w-4 shrink-0')}
	<svg
		xmlns="http://www.w3.org/2000/svg"
		class={cls}
		fill="none"
		viewBox="0 0 24 24"
		stroke="currentColor"
		stroke-width="1.75"
		aria-hidden="true"
	>
		<path stroke-linecap="round" stroke-linejoin="round" {d} />
	</svg>
{/snippet}

<div class="space-y-6">
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Attendance</h1>
			{#if data.canManage}
				<p class="text-sm text-muted-foreground">
					Daily records &amp; corrections. For a multi-day team matrix, see Team Attendance.
				</p>
			{/if}
		</div>
		{#if data.canManage && data.view === 'team'}
			<a
				href="/team"
				class="whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
				>Multi-day matrix →</a
			>
		{/if}
	</div>

	{#if form?.error}
		<div
			class="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-red-400"
		>
			{form.error}
		</div>
	{/if}
	{#if form?.saved}
		<Banner kind="success" message={form.saved} />
	{/if}

	{#if data.canManage}
		<!-- View toggle: one employee's range vs the whole team on a day -->
		<div class="inline-flex rounded-lg border p-1 text-sm">
			<a
				href="?view=employee&employeeId={data.selectedEmployeeId ??
					''}&from={data.from}&to={data.to}"
				class="rounded-md px-3 py-1.5 font-medium {data.view === 'employee'
					? 'bg-primary text-primary-foreground'
					: 'text-muted-foreground hover:bg-accent'}"
			>
				By employee
			</a>
			<a
				href="?view=team&date={data.date}"
				class="rounded-md px-3 py-1.5 font-medium {data.view === 'team'
					? 'bg-primary text-primary-foreground'
					: 'text-muted-foreground hover:bg-accent'}"
			>
				Whole team (day)
			</a>
		</div>
	{/if}

	<!-- Filters -->
	{#if data.view === 'team'}
		<form method="GET" class="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
			<input type="hidden" name="view" value="team" />
			<div class="flex flex-col gap-1">
				<label for="date" class="text-xs font-medium text-muted-foreground">Day</label>
				<input
					id="date"
					name="date"
					type="date"
					value={data.date}
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
					class="h-9 rounded-md border border-input bg-background px-3 text-sm"
				/>
			</div>
		</form>
	{:else}
		<form method="GET" class="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
			{#if data.canManage}
				<input type="hidden" name="view" value="employee" />
				<div class="flex flex-col gap-1">
					<label for="employeeId" class="text-xs font-medium text-muted-foreground">Employee</label>
					<select
						id="employeeId"
						name="employeeId"
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
						class="h-9 rounded-md border border-input bg-background px-3 text-sm"
					>
						{#each data.employees as e (e.id)}
							<option value={e.id} selected={e.id === data.selectedEmployeeId}
								>{e.lastName}, {e.firstName} ({e.employeeNumber})</option
							>
						{/each}
					</select>
				</div>
			{/if}
			<div class="flex flex-col gap-1">
				<label for="from" class="text-xs font-medium text-muted-foreground">From</label>
				<input
					id="from"
					name="from"
					type="date"
					value={data.from}
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
					class="h-9 rounded-md border border-input bg-background px-3 text-sm"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<label for="to" class="text-xs font-medium text-muted-foreground">To</label>
				<input
					id="to"
					name="to"
					type="date"
					value={data.to}
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
					class="h-9 rounded-md border border-input bg-background px-3 text-sm"
				/>
			</div>
			<div class="flex w-full flex-wrap items-center gap-1.5">
				<span class="text-xs font-medium text-muted-foreground">Quick pick:</span>
				{#each QUICK_PICKS as q (q.label)}
					<button
						type="button"
						onclick={() => pickPeriod(q.kind, q.monthsBack)}
						class="rounded-full border px-3 py-1 text-xs font-medium hover:bg-accent"
						>{q.label}</button
					>
				{/each}
			</div>
			<p class="w-full text-xs text-muted-foreground">
				Range is capped at {data.maxRangeDays} days (~2 months); longer spans are trimmed automatically.
			</p>
		</form>
	{/if}

	<!-- Bulk actions -->
	{#if data.canManage && data.view === 'employee' && data.selectedEmployeeId}
		<div class="flex flex-wrap gap-2">
			<form method="POST" action="?/derive" use:enhance={derive.enhance}>
				<input type="hidden" name="employeeId" value={data.selectedEmployeeId} />
				<input type="hidden" name="from" value={data.from} />
				<input type="hidden" name="to" value={data.to} />
				<button
					title="Re-pull from punches (updates unlocked days)"
					disabled={derive.busy}
					class="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
					>{@render icon(IC.refresh)}Refresh</button
				>
			</form>
			<form method="POST" action="?/lock" use:enhance={lock.enhance}>
				<input type="hidden" name="employeeId" value={data.selectedEmployeeId} />
				<input type="hidden" name="from" value={data.from} />
				<input type="hidden" name="to" value={data.to} />
				<button
					disabled={lock.busy}
					class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
					>{lock.busy ? 'Locking…' : 'Lock range'}</button
				>
			</form>
			{#if data.canUnlock}
				<form method="POST" action="?/unlock" use:enhance={unlock.enhance}>
					<input type="hidden" name="employeeId" value={data.selectedEmployeeId} />
					<input type="hidden" name="from" value={data.from} />
					<input type="hidden" name="to" value={data.to} />
					<button
						title="Reopen locked days (super admin)"
						disabled={unlock.busy}
						class="inline-flex items-center gap-1.5 rounded-md border border-amber-500/20 px-4 py-2 text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 disabled:pointer-events-none disabled:opacity-50"
						>{@render icon(IC.lockOpen)}Unlock range</button
					>
				</form>
			{/if}
			<a
				href={exportHref}
				class="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
				>{@render icon(IC.download)}Export CSV</a
			>
			<form method="POST" action="?/saveTimesheet" use:enhance={saveTimesheet.enhance}>
				<input type="hidden" name="employeeId" value={data.selectedEmployeeId} />
				<input type="hidden" name="from" value={data.from} />
				<input type="hidden" name="to" value={data.to} />
				<button
					title="Persist this range as a Timesheet record"
					disabled={saveTimesheet.busy}
					class="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
					>{@render icon(IC.document)}Save as timesheet</button
				>
			</form>
		</div>
	{:else if data.canManage && data.view === 'team'}
		<div class="flex flex-wrap gap-2">
			<form method="POST" action="?/deriveTeam" use:enhance={deriveTeam.enhance}>
				<input type="hidden" name="date" value={data.date} />
				<button
					title="Re-pull from punches (updates unlocked days)"
					disabled={deriveTeam.busy}
					class="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
					>{@render icon(IC.refresh)}Refresh</button
				>
			</form>
			<form method="POST" action="?/lockTeam" use:enhance={lockTeam.enhance}>
				<input type="hidden" name="date" value={data.date} />
				<button
					disabled={lockTeam.busy}
					class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
					>{lockTeam.busy ? 'Locking…' : 'Lock day'}</button
				>
			</form>
			{#if data.canUnlock}
				<form method="POST" action="?/unlockTeam" use:enhance={unlockTeam.enhance}>
					<input type="hidden" name="date" value={data.date} />
					<button
						title="Reopen locked days (super admin)"
						disabled={unlockTeam.busy}
						class="inline-flex items-center gap-1.5 rounded-md border border-amber-500/20 px-4 py-2 text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 disabled:pointer-events-none disabled:opacity-50"
						>{@render icon(IC.lockOpen)}Unlock day</button
					>
				</form>
			{/if}
			<a
				href={exportHref}
				class="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
				>{@render icon(IC.download)}Export CSV</a
			>
		</div>
	{:else}
		<!-- Employees can export their own timesheet -->
		<div class="flex gap-2">
			<a
				href={exportHref}
				class="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
				>{@render icon(IC.download)}Export CSV</a
			>
		</div>
	{/if}

	<!-- #200: CSV backlog import. Food-service tenants only; the action re-checks both gates. -->
	{#if data.canManage && data.showAmPm}
		<div class="space-y-3 rounded-lg border bg-card p-4">
			<div>
				<p class="text-sm font-medium">Import backlog CSV</p>
				<p class="text-xs text-muted-foreground">
					Columns: employeeNumber, date (YYYY-MM-DD), amIn, amOut, pmIn, pmOut (HH:MM, Manila time).
					Locked and hand-corrected days are refused.
				</p>
				<!-- m-4: state the caps here — the operator otherwise meets them as a 413/400 that renders
				     in the page-top banner, off-screen. `load` passes the real MAX_IMPORT_BYTES and
				     MAX_IMPORT_ROWS through, so the copy cannot drift from the caps that enforce them. -->
				<p class="text-xs text-muted-foreground">
					Limits: {data.maxImportBytes / 1024 / 1024} MB per file, {data.maxImportRows.toLocaleString()}
					rows, and a {data.maxRangeDays}-day span.
				</p>
			</div>
			<form
				method="POST"
				action="?/importBacklog"
				enctype="multipart/form-data"
				use:enhance={importBacklog.enhance}
				class="flex flex-wrap items-center gap-2"
			>
				<label for="backlog" class="sr-only">Backlog CSV file</label>
				<input
					id="backlog"
					name="backlog"
					type="file"
					accept=".csv,text/csv"
					required
					class="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium"
				/>
				<button
					disabled={importBacklog.busy}
					class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
					>{importBacklog.busy ? 'Importing…' : 'Import backlog CSV'}</button
				>
				<!-- m-5: this action writes punches for a whole roster. The reassurance belongs beside the
				     button, not at the end of the column list. -->
				<span class="text-xs text-muted-foreground"
					>Re-uploading the same file changes nothing.</span
				>
			</form>
			<!-- M-9: `fail(400/413/415)` from this action lands in `form.error`, which renders in the
			     page-top banner — several screens above this card. Repeat it here so the operator sees
			     why the button did nothing. The duplicate with the top banner is deliberate.
			     Gated on `importError`, NOT on `error`: every action on this page sets `error`, so the
			     bare check echoed a Save-as-timesheet or Derive failure under the upload heading. -->
			{#if form?.importError}
				<div
					role="alert"
					class="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-red-400"
				>
					{form.error}
				</div>
			{/if}
			{#if form?.imported}
				{@const res = form.imported}
				<!-- M-10: a totally failed import used to look exactly like a totally successful one —
				     same neutral box, four counts to parse. Colour and a lead sentence say the outcome
				     first; `role="status"` makes it reach a screen reader at all. -->
				<!-- A re-upload applies nothing and rejects nothing: every row was already here. That is
				     the card's own promise ("re-uploading changes nothing") working, so it must not
				     read as the failure bucket. It gets neutral wording, not red. -->
				{@const alreadyImported =
					res.applied === 0 && res.rejected.length === 0 && res.skippedDuplicate > 0}
				{@const nothing = res.applied === 0 && !alreadyImported}
				{@const partial = res.applied > 0 && res.rejected.length > 0}
				<div
					role="status"
					class="rounded-md border px-3 py-2 text-sm {nothing
						? 'border-destructive/20 bg-destructive/10 text-red-400'
						: alreadyImported
							? 'border-border bg-background text-muted-foreground'
							: partial
								? 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400'
								: 'border-green-500/20 bg-green-500/10 text-green-600'}"
				>
					<p class="font-medium">
						{#if alreadyImported}Already imported — every row in this file was here already.{:else if nothing}Nothing
							was imported — no rows were applied.{:else if partial}Partly imported — {res.applied}
							{res.applied === 1 ? 'row' : 'rows'} applied, {res.rejected.length} rejected.{:else}Import
							complete — {res.applied}
							{res.applied === 1 ? 'row' : 'rows'} applied.{/if}
					</p>
					<p class="mt-0.5 text-xs">
						Applied {res.applied}
						{res.applied === 1 ? 'row' : 'rows'} ({res.punchesWritten} punches), skipped {res.skippedDuplicate}
						duplicates, rejected {res.rejected.length}
						{res.rejected.length === 1 ? 'row' : 'rows'}.
					</p>
					{#if res.rejected.length > 0}
						<!-- Open when nothing landed: the reasons are then the only useful content. -->
						<details class="mt-1" open={nothing}>
							<summary class="cursor-pointer text-xs font-medium">Why rows were rejected</summary>
							<ul class="mt-1 space-y-0.5 text-xs">
								{#each res.rejected as r (r.line)}
									<li>Line {r.line} ({r.employeeNumber || '—'}, {r.date || '—'}): {r.reason}</li>
								{/each}
							</ul>
						</details>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	{#if data.canManage}
		<!-- Exceptions filter for the daily fail-check / incomplete-log review -->
		<div class="flex items-center justify-between gap-3">
			<label class="inline-flex cursor-pointer items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={exceptionsOnly} class="h-4 w-4 rounded border-input" />
				<span class="font-medium">Exceptions only</span>
				<span class="text-xs text-muted-foreground">absent, incomplete &amp; late</span>
			</label>
			<span class="text-xs text-muted-foreground"
				>{data.view === 'team' ? teamRows.length : dayRows.length} shown</span
			>
		</div>
	{/if}

	{#if data.showAmPm && data.canManage}
		<!-- m-6: the AM/PM split is read-only by design (#162). Without saying so, an HR user in edit
		     mode clicks an AM In cell and nothing happens. Gated on canManage: an employee has no
		     correction door, so the second sentence would be a false instruction. -->
		<p class="text-xs text-muted-foreground">
			AM/PM columns are worked out from the punches and cannot be typed in. Correct a day by editing
			its In and Out.
		</p>
	{/if}

	{#if data.view === 'team'}
		<!-- Team-for-a-day table -->
		<div class="overflow-x-auto rounded-lg border">
			<table class="w-full text-sm">
				<thead class="border-b bg-muted/50">
					<tr>
						<th class="px-3 py-3 text-left font-medium text-muted-foreground">Employee</th>
						<th class="px-3 py-3 text-left font-medium text-muted-foreground">Department</th>
						<th class="px-3 py-3 text-left font-medium text-muted-foreground">Status</th>
						<th class="px-3 py-3 text-left font-medium text-muted-foreground">In</th>
						<th class="px-3 py-3 text-left font-medium text-muted-foreground">Out</th>
						<th class="px-3 py-3 text-right font-medium text-muted-foreground">Reg</th>
						<th class="px-3 py-3 text-right font-medium text-muted-foreground">OT</th>
						{#if data.showAmPm}
							<!-- #162: read-only display split. The In/Out inputs stay the only correction door.
							     M-15: kept AFTER Reg/OT — these four read-only columns pushed the two numbers HR
							     reconciles off the right edge of the scroller when they sat before them. -->
							<th class="px-3 py-3 text-left font-medium text-muted-foreground">AM In</th>
							<th class="px-3 py-3 text-left font-medium text-muted-foreground">AM Out</th>
							<th class="px-3 py-3 text-left font-medium text-muted-foreground">PM In</th>
							<th class="px-3 py-3 text-left font-medium text-muted-foreground">PM Out</th>
						{/if}
						<th class="w-[1%] whitespace-nowrap px-3 py-3"></th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each teamRows as t (t.id)}
						{@const d = t.day}
						{@const editable = data.canManage && d && !d.isLocked}
						<tr
							class="hover:bg-muted/30 {d && (d.status === 'ABSENT' || d.status === 'INCOMPLETE')
								? 'bg-red-500/5'
								: ''}"
						>
							<td class="px-3 py-2 font-medium whitespace-nowrap"
								>{t.name}
								<span class="text-xs text-muted-foreground">({t.employeeNumber})</span></td
							>
							<td class="px-3 py-2 text-muted-foreground">{t.departmentName ?? '—'}</td>
							<td class="px-3 py-2">
								{#if editable && d}
									<select name="status" form="c-{d.id}" class={CELL_SEL}>
										{#each STATUSES as s (s)}<option value={s} selected={s === d.status}>{s}</option
											>{/each}
									</select>
								{:else if d}
									<Badge status={d.status} domain="attendance" />
									{#if d.isLocked}<span
											title="locked"
											class="ml-1 inline-flex align-middle text-muted-foreground"
											>{@render icon(IC.lock, 'h-3.5 w-3.5')}</span
										>{/if}
								{:else}
									<span class="text-xs text-muted-foreground">no record</span>
								{/if}
							</td>
							<td class="px-3 py-2 text-muted-foreground"
								>{#if editable && d}<input
										name="timeIn"
										form="c-{d.id}"
										type="time"
										value={toTimeInput(d.timeIn)}
										oninput={recalcHours}
										class={CELL_TIME}
									/>{:else}{fmtTime(d?.timeIn ?? null)}{/if}</td
							>
							<td class="px-3 py-2 text-muted-foreground"
								>{#if editable && d}<input
										name="timeOut"
										form="c-{d.id}"
										type="time"
										value={toTimeInput(d.timeOut)}
										oninput={recalcHours}
										class={CELL_TIME}
									/>{:else}{fmtTime(d?.timeOut ?? null)}{/if}</td
							>
							<td class="px-3 py-2 text-right font-mono"
								>{#if editable && d}<input
										name="regularHours"
										form="c-{d.id}"
										type="number"
										step="0.25"
										min="0"
										value={n(d.regularHours)}
										class={CELL_NUM}
									/>{:else}{d ? n(d.regularHours).toFixed(2) : '—'}{/if}</td
							>
							<td class="px-3 py-2 text-right font-mono"
								>{#if editable && d}<input
										name="overtimeHours"
										form="c-{d.id}"
										type="number"
										step="0.25"
										min="0"
										value={n(d.overtimeHours)}
										class={CELL_NUM}
									/>{:else}{d ? n(d.overtimeHours).toFixed(2) : '—'}{/if}</td
							>
							{#if data.showAmPm}
								<!-- M-15: after Reg/OT, mirroring the header order. -->
								<td class="px-3 py-2 text-muted-foreground">{fmtTime(d?.amTimeIn ?? null)}</td>
								<td class="px-3 py-2 text-muted-foreground">{fmtTime(d?.amTimeOut ?? null)}</td>
								<td class="px-3 py-2 text-muted-foreground">{fmtTime(d?.pmTimeIn ?? null)}</td>
								<td class="px-3 py-2 text-muted-foreground">{fmtTime(d?.pmTimeOut ?? null)}</td>
							{/if}
							<td class="w-[1%] whitespace-nowrap px-3 py-2">
								{#if editable && d}
									{@const save = rowGuard(`correct:${d.id}`, keepValues)}
									{@const reset = rowGuard(`resetDay:${d.id}`, confirmReset)}
									<div class="flex items-center gap-1">
										<form id="c-{d.id}" method="POST" action="?/correct" use:enhance={save.enhance}>
											<input type="hidden" name="id" value={d.id} />
											<input type="hidden" name="date" value={toDateKey(d.date)} />
											<button
												disabled={save.busy}
												class="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
												>{save.busy ? 'Saving…' : 'Save'}</button
											>
										</form>
										{#if d.manuallyEdited}
											<form method="POST" action="?/resetDay" use:enhance={reset.enhance}>
												<input type="hidden" name="id" value={d.id} />
												<button
													type="submit"
													title="Discard manual edit and re-derive from punches"
													disabled={reset.busy}
													class="rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
													>{reset.busy ? 'Resetting…' : 'Reset'}</button
												>
											</form>
										{/if}
									</div>
								{:else if d?.isLocked}
									<span class="inline-flex h-7 items-center text-xs text-muted-foreground"
										>locked</span
									>
								{/if}
							</td>
						</tr>
					{:else}
						<tr
							><td
								colspan={data.showAmPm ? 12 : 8}
								class="px-3 py-8 text-center text-muted-foreground"
								>{exceptionsOnly
									? 'No exceptions — everyone is accounted for.'
									: 'No active employees.'}</td
							></tr
						>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<!-- Single-employee range table -->
		<div class="overflow-x-auto rounded-lg border">
			<table class="w-full text-sm">
				<thead class="border-b bg-muted/50">
					<tr>
						<th class="px-3 py-3 text-left font-medium text-muted-foreground">Date</th>
						<th class="px-3 py-3 text-left font-medium text-muted-foreground">Status</th>
						<th class="px-3 py-3 text-left font-medium text-muted-foreground">In</th>
						<th class="px-3 py-3 text-left font-medium text-muted-foreground">Out</th>
						<th class="px-3 py-3 text-right font-medium text-muted-foreground">Reg</th>
						<th class="px-3 py-3 text-right font-medium text-muted-foreground">OT</th>
						<th class="px-3 py-3 text-right font-medium text-muted-foreground">Night</th>
						<th class="px-3 py-3 text-right font-medium text-muted-foreground">Late/UT</th>
						{#if data.showAmPm}
							<!-- #162: read-only display split. The In/Out inputs stay the only correction door.
							     M-15: kept AFTER the reconciled numbers — see the team header. -->
							<th class="px-3 py-3 text-left font-medium text-muted-foreground">AM In</th>
							<th class="px-3 py-3 text-left font-medium text-muted-foreground">AM Out</th>
							<th class="px-3 py-3 text-left font-medium text-muted-foreground">PM In</th>
							<th class="px-3 py-3 text-left font-medium text-muted-foreground">PM Out</th>
						{/if}
						{#if data.canManage}<th class="w-[1%] whitespace-nowrap px-3 py-3"></th>{/if}
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each dayRows as d (d.id)}
						{@const editable = data.canManage && !d.isLocked}
						<tr
							class="hover:bg-muted/30 {d.status === 'ABSENT' || d.status === 'INCOMPLETE'
								? 'bg-red-500/5'
								: ''}"
						>
							<td class="px-3 py-2 whitespace-nowrap"
								>{fmtDate(d.date)}
								{#if d.isLocked}<span
										title="locked"
										class="inline-flex align-middle text-muted-foreground"
										>{@render icon(IC.lock, 'h-3.5 w-3.5')}</span
									>{/if}</td
							>
							<td class="px-3 py-2">
								{#if editable}
									<select name="status" form="c-{d.id}" class={CELL_SEL}>
										{#each STATUSES as s (s)}<option value={s} selected={s === d.status}>{s}</option
											>{/each}
									</select>
								{:else}
									<Badge status={d.status} domain="attendance" />
								{/if}
							</td>
							<td class="px-3 py-2 text-muted-foreground"
								>{#if editable}<input
										name="timeIn"
										form="c-{d.id}"
										type="time"
										value={toTimeInput(d.timeIn)}
										oninput={recalcHours}
										class={CELL_TIME}
									/>{:else}{fmtTime(d.timeIn)}{/if}</td
							>
							<td class="px-3 py-2 text-muted-foreground"
								>{#if editable}<input
										name="timeOut"
										form="c-{d.id}"
										type="time"
										value={toTimeInput(d.timeOut)}
										oninput={recalcHours}
										class={CELL_TIME}
									/>{:else}{fmtTime(d.timeOut)}{/if}</td
							>
							<td class="px-3 py-2 text-right font-mono">
								{#if editable}
									<input
										name="regularHours"
										form="c-{d.id}"
										type="number"
										step="0.25"
										min="0"
										value={n(d.regularHours)}
										class={CELL_NUM}
									/>
								{:else}{n(d.regularHours).toFixed(2)}{/if}
							</td>
							<td class="px-3 py-2 text-right font-mono">
								{#if editable}
									<input
										name="overtimeHours"
										form="c-{d.id}"
										type="number"
										step="0.25"
										min="0"
										value={n(d.overtimeHours)}
										class={CELL_NUM}
									/>
								{:else}{n(d.overtimeHours).toFixed(
										2
									)}{#if n(d.rawOvertimeHours) > n(d.overtimeHours)}<span
											class="ml-1 text-xs text-amber-600 dark:text-amber-400"
											title="unapproved OT"
											>(+{(n(d.rawOvertimeHours) - n(d.overtimeHours)).toFixed(1)})</span
										>{/if}{/if}
							</td>
							<td class="px-3 py-2 text-right font-mono">{n(d.nightDiffHours).toFixed(2)}</td>
							<td class="px-3 py-2 text-right font-mono text-muted-foreground"
								>{d.lateMinutes}/{d.undertimeMinutes}</td
							>
							{#if data.showAmPm}
								<!-- M-15: after Reg/OT/Night/Late-UT, mirroring the header order. -->
								<td class="px-3 py-2 text-muted-foreground">{fmtTime(d?.amTimeIn ?? null)}</td>
								<td class="px-3 py-2 text-muted-foreground">{fmtTime(d?.amTimeOut ?? null)}</td>
								<td class="px-3 py-2 text-muted-foreground">{fmtTime(d?.pmTimeIn ?? null)}</td>
								<td class="px-3 py-2 text-muted-foreground">{fmtTime(d?.pmTimeOut ?? null)}</td>
							{/if}
							{#if data.canManage}
								<td class="w-[1%] whitespace-nowrap px-3 py-2">
									{#if d.isLocked}
										<span class="inline-flex h-7 items-center text-xs text-muted-foreground"
											>locked</span
										>
									{:else}
										{@const save = rowGuard(`correct:${d.id}`, keepValues)}
										{@const reset = rowGuard(`resetDay:${d.id}`, confirmReset)}
										<div class="flex items-center gap-1">
											<form
												id="c-{d.id}"
												method="POST"
												action="?/correct"
												use:enhance={save.enhance}
											>
												<input type="hidden" name="id" value={d.id} />
												<input type="hidden" name="date" value={toDateKey(d.date)} />
												<button
													disabled={save.busy}
													class="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
													>{save.busy ? 'Saving…' : 'Save'}</button
												>
											</form>
											{#if d.manuallyEdited}
												<form method="POST" action="?/resetDay" use:enhance={reset.enhance}>
													<input type="hidden" name="id" value={d.id} />
													<button
														type="submit"
														title="Discard manual edit and re-derive from punches"
														disabled={reset.busy}
														class="rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
														>{reset.busy ? 'Resetting…' : 'Reset'}</button
													>
												</form>
											{/if}
										</div>
									{/if}
								</td>
							{/if}
						</tr>
					{:else}
						<tr
							><td
								colspan={(data.canManage ? 9 : 8) + (data.showAmPm ? 4 : 0)}
								class="px-3 py-8 text-center text-muted-foreground"
								>{#if exceptionsOnly}No exceptions in this range.{:else}No attendance for this range{#if data.canManage}
										— no punches yet, or use Refresh{/if}.{/if}</td
							></tr
						>
					{/each}
				</tbody>
			</table>
		</div>

		<Pagination meta={data.pagination} />
	{/if}
</div>
