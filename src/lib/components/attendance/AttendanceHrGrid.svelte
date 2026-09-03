<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import { enhance } from '$app/forms'
	import Pagination from '$lib/components/Pagination.svelte'
	import Badge from '$lib/components/ui/Badge.svelte'
	import ConfirmButton from '$lib/components/ui/ConfirmButton.svelte'
	import Icon from './Icon.svelte'
	import {
		CELL_NUM,
		CELL_SEL,
		CELL_TIME,
		IC,
		QUICK_PICKS,
		STATUSES,
		fmtDate,
		fmtTime,
		keepValues,
		n,
		pickPeriod,
		recalcHours,
		toDateKey,
		toTimeInput,
		type AttendanceData,
		type AttendanceForm,
		type AttendanceGuards,
		type DayRow,
		type RowGuard,
		type TeamRow
	} from './shared'

	/**
	 * The HR correction grid — the `data.canManage === true` persona (phase 07 §S5).
	 *
	 * Every piece of shared state is threaded in from `+page.svelte`: re-creating a submit guard
	 * or the exceptions filter here would give this component its own copy and silently re-open
	 * the double-submit hole (#108) the guards exist to close.
	 */
	let {
		data,
		form,
		exportHref,
		teamRows,
		dayRows,
		guards,
		rowGuard,
		exceptionsOnly = $bindable()
	}: {
		data: AttendanceData
		form: AttendanceForm
		exportHref: string
		teamRows: TeamRow[]
		dayRows: DayRow[]
		guards: AttendanceGuards
		rowGuard: RowGuard
		exceptionsOnly: boolean
	} = $props()
</script>

<!-- View toggle: one employee's range vs the whole team on a day. The cross-link to the
     multi-day matrix sits here, level with the control it relates to, not on the title row. -->
<div class="flex flex-wrap items-center justify-between gap-3">
	<div class="inline-flex rounded-lg border p-1 text-sm">
		<a
			href="?view=employee&employeeId={data.selectedEmployeeId ?? ''}&from={data.from}&to={data.to}"
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
	{#if data.view === 'team'}
		<a
			href="/team"
			class="ml-auto whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
			>Multi-day matrix →</a
		>
	{/if}
</div>

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
{#if data.view === 'employee' && data.selectedEmployeeId}
	<div class="flex flex-wrap gap-2">
		<form method="POST" action="?/derive" use:enhance={guards.derive.enhance}>
			<input type="hidden" name="employeeId" value={data.selectedEmployeeId} />
			<input type="hidden" name="from" value={data.from} />
			<input type="hidden" name="to" value={data.to} />
			<button
				title="Re-pull from punches (updates unlocked days)"
				disabled={guards.derive.busy}
				class="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
				><Icon d={IC.refresh} />Refresh</button
			>
		</form>
		<form method="POST" action="?/lock" use:enhance={guards.lock.enhance}>
			<input type="hidden" name="employeeId" value={data.selectedEmployeeId} />
			<input type="hidden" name="from" value={data.from} />
			<input type="hidden" name="to" value={data.to} />
			<button
				disabled={guards.lock.busy}
				class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
				>{guards.lock.busy ? 'Locking…' : 'Lock range'}</button
			>
		</form>
		{#if data.canUnlock}
			<form method="POST" action="?/unlock" use:enhance={guards.unlock.enhance}>
				<input type="hidden" name="employeeId" value={data.selectedEmployeeId} />
				<input type="hidden" name="from" value={data.from} />
				<input type="hidden" name="to" value={data.to} />
				<button
					title="Reopen locked days (super admin)"
					disabled={guards.unlock.busy}
					class="inline-flex items-center gap-1.5 rounded-md border border-amber-500/20 px-4 py-2 text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 disabled:pointer-events-none disabled:opacity-50"
					><Icon d={IC.lockOpen} />Unlock range</button
				>
			</form>
		{/if}
		<a
			href={exportHref}
			class="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
			><Icon d={IC.download} />Export CSV</a
		>
		<form method="POST" action="?/saveTimesheet" use:enhance={guards.saveTimesheet.enhance}>
			<input type="hidden" name="employeeId" value={data.selectedEmployeeId} />
			<input type="hidden" name="from" value={data.from} />
			<input type="hidden" name="to" value={data.to} />
			<button
				disabled={guards.saveTimesheet.busy}
				class="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
				><Icon d={IC.document} />Save as timesheet</button
			>
		</form>
	</div>
	<!-- Phase 6 / T5: this is the third timesheet-creation door. What it takes was only in a
	     hover `title`, which no touch user and no screen reader user ever saw. -->
	<p class="text-xs text-muted-foreground">
		Saves the selected range (must be within one month) as a timesheet.
		<a href="/timesheets" class="underline underline-offset-2 hover:text-foreground"
			>All timesheets</a
		>
	</p>
{:else if data.view === 'team'}
	<div class="flex flex-wrap gap-2">
		<form method="POST" action="?/deriveTeam" use:enhance={guards.deriveTeam.enhance}>
			<input type="hidden" name="date" value={data.date} />
			<button
				title="Re-pull from punches (updates unlocked days)"
				disabled={guards.deriveTeam.busy}
				class="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
				><Icon d={IC.refresh} />Refresh</button
			>
		</form>
		<form method="POST" action="?/lockTeam" use:enhance={guards.lockTeam.enhance}>
			<input type="hidden" name="date" value={data.date} />
			<button
				disabled={guards.lockTeam.busy}
				class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
				>{guards.lockTeam.busy ? 'Locking…' : 'Lock day'}</button
			>
		</form>
		{#if data.canUnlock}
			<form method="POST" action="?/unlockTeam" use:enhance={guards.unlockTeam.enhance}>
				<input type="hidden" name="date" value={data.date} />
				<button
					title="Reopen locked days (super admin)"
					disabled={guards.unlockTeam.busy}
					class="inline-flex items-center gap-1.5 rounded-md border border-amber-500/20 px-4 py-2 text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 disabled:pointer-events-none disabled:opacity-50"
					><Icon d={IC.lockOpen} />Unlock day</button
				>
			</form>
		{/if}
		<a
			href={exportHref}
			class="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
			><Icon d={IC.download} />Export CSV</a
		>
	</div>
{:else}
	<!-- Employee view with no employee to act on: the export link is all that applies. -->
	<div class="flex gap-2">
		<a
			href={exportHref}
			class="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
			><Icon d={IC.download} />Export CSV</a
		>
	</div>
{/if}

<!-- #200: CSV backlog import. Food-service tenants only; the action re-checks both gates. -->
{#if data.showAmPm}
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
			use:enhance={guards.importBacklog.enhance}
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
				disabled={guards.importBacklog.busy}
				class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
				>{guards.importBacklog.busy ? 'Importing…' : 'Import backlog CSV'}</button
			>
			<!-- m-5: this action writes punches for a whole roster. The reassurance belongs beside the
			     button, not at the end of the column list. -->
			<span class="text-xs text-muted-foreground">Re-uploading the same file changes nothing.</span>
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

{#if data.showAmPm}
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
					{@const editable = d && !d.isLocked}
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
										><Icon d={IC.lock} class="h-3.5 w-3.5" /></span
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
										<!-- #108: ConfirmButton's own per-instance busy state replaces this row's
										     `rowGuard`, and the dialog now gates the submit. `keepValues` still
										     rides through `submit` so untouched Reg/OT/time cells do not blank. -->
										<ConfirmButton
											action="?/resetDay"
											title="Discard this manual edit?"
											message="The hours you corrected for this day are thrown away and re-derived from the raw punches. Anything typed by hand is lost."
											confirmText="Discard and re-derive"
											triggerLabel="Reset"
											triggerTitle="Discard manual edit and re-derive from punches"
											triggerClass="rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
											submit={keepValues}
										>
											<input type="hidden" name="id" value={d.id} />
										</ConfirmButton>
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
						><td colspan={data.showAmPm ? 12 : 8} class="p-0"
							><EmptyState
								variant={exceptionsOnly ? 'no-results' : 'empty'}
								title={exceptionsOnly ? 'No exceptions today' : 'No active employees'}
								description={exceptionsOnly
									? 'Everyone is accounted for. Clear the exceptions filter to see the whole roster.'
									: undefined}
							/></td
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
					<th class="w-[1%] whitespace-nowrap px-3 py-3"></th>
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each dayRows as d (d.id)}
					{@const editable = !d.isLocked}
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
									><Icon d={IC.lock} class="h-3.5 w-3.5" /></span
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
						<td class="w-[1%] whitespace-nowrap px-3 py-2">
							{#if d.isLocked}
								<span class="inline-flex h-7 items-center text-xs text-muted-foreground"
									>locked</span
								>
							{:else}
								{@const save = rowGuard(`correct:${d.id}`, keepValues)}
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
										<!-- #108: ConfirmButton's own per-instance busy state replaces this row's
										     `rowGuard`, and the dialog now gates the submit. `keepValues` still
										     rides through `submit` so untouched Reg/OT/time cells do not blank. -->
										<ConfirmButton
											action="?/resetDay"
											title="Discard this manual edit?"
											message="The hours you corrected for this day are thrown away and re-derived from the raw punches. Anything typed by hand is lost."
											confirmText="Discard and re-derive"
											triggerLabel="Reset"
											triggerTitle="Discard manual edit and re-derive from punches"
											triggerClass="rounded border px-2 py-1 text-xs text-muted-foreground hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
											submit={keepValues}
										>
											<input type="hidden" name="id" value={d.id} />
										</ConfirmButton>
									{/if}
								</div>
							{/if}
						</td>
					</tr>
				{:else}
					<tr
						><td colspan={9 + (data.showAmPm ? 4 : 0)} class="p-0"
							><EmptyState
								variant={exceptionsOnly ? 'no-results' : 'empty'}
								title={exceptionsOnly
									? 'No exceptions in this range'
									: 'No attendance for this range'}
								description={exceptionsOnly
									? 'Everyone in this range is accounted for. Clear the exceptions filter to see every day.'
									: 'No punches yet, or use Refresh.'}
							/></td
						></tr
					>
				{/each}
			</tbody>
		</table>
	</div>

	<Pagination meta={data.pagination} />
{/if}
