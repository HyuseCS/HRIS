<script lang="ts">
	import { enhance } from '$app/forms'
	import type { SubmitFunction } from '@sveltejs/kit'
	import { tick } from 'svelte'
	import { formatShortDate } from '$lib/utils/format'
	import Dialog from '$lib/components/ui/Dialog.svelte'
	import ConfirmButton from '$lib/components/ui/ConfirmButton.svelte'
	import ReasonDialog from '$lib/components/ui/ReasonDialog.svelte'
	import Badge from '$lib/components/ui/Badge.svelte'

	// Fields the modal reads. Both the /timesheets list rows and the /requests/timesheets
	// approvals-load rows satisfy this shape. Decimal columns are typed loosely (they arrive
	// serialized at runtime and are always read through Number(...)); Date columns as-is.
	type Numeric = number | string | { toString(): string }
	type Entry = {
		id: string
		date: string | Date
		timeIn: string | Date | null
		timeOut: string | Date | null
		hoursWorked: Numeric
		otHours: Numeric
		notes: string | null
	}
	export type TimesheetLike = {
		id: string
		status: string
		employeeId: string
		periodStart: string | Date
		periodEnd: string | Date
		rejectionReason?: string | null
		employee: { firstName: string; lastName: string }
		entries: Entry[]
	}

	interface Props {
		ts: TimesheetLike | null
		mode: 'edit' | 'review'
		isManager: boolean
		isHrAdmin?: boolean
		/** #165: false makes the edit surface strictly read-only (Employee role on /timesheets). */
		canModify?: boolean
		myEmployeeId?: string | null
		form?: { error?: string } | null
	}

	let {
		ts = $bindable(),
		mode,
		isManager,
		isHrAdmin = false,
		canModify = true,
		myEmployeeId = null,
		form = null
	}: Props = $props()

	type Row = {
		date: string
		timeIn: string
		timeOut: string
		reg: number
		ot: number
		notes: string
	}
	let entries = $state<Row[]>([])
	// Reject reason is collected in a ReasonDialog popup; confirming fills the
	// hidden review form and submits it.
	let rejecting = $state(false)
	let rejectReason = $state('')
	let rejectFormEl = $state<HTMLFormElement>()
	let busy = $state(false)

	async function confirmReject(reason: string) {
		rejectReason = reason
		await tick()
		// Write the value straight onto the input too — belt and braces against a
		// reactive-flush race leaving the hidden field empty at submit time.
		const el = rejectFormEl?.elements.namedItem('rejectionReason')
		if (el instanceof HTMLInputElement) el.value = reason
		rejectFormEl?.requestSubmit()
	}

	// Capabilities are gated by mode: edit surface can modify/delete/submit but never
	// approve; review surface can only approve/reject and is read-only.
	const isOwner = $derived(ts != null && ts.employeeId === myEmployeeId)
	// #165: canModify gates the whole edit surface, so a read-only viewer keeps the summary
	// and entry table but loses every mutating control.
	const canEdit = $derived(
		mode === 'edit' && canModify && isManager && ts != null && ts.status !== 'APPROVED'
	)
	const canReview = $derived(mode === 'review' && ts != null && ts.status === 'SUBMITTED')
	// Managers/HR may delete any of their scope; the owner may delete only their own draft/rejected.
	const canDelete = $derived(
		mode === 'edit' &&
			canModify &&
			ts != null &&
			(isManager || (isOwner && (ts.status === 'DRAFT' || ts.status === 'REJECTED')))
	)
	const canSubmit = $derived(
		mode === 'edit' && canModify && isOwner && ts != null && ts.status === 'DRAFT'
	)
	// Repopulate a draft's entries from attendance — owner (own draft) or a manager/HR.
	const canSync = $derived(
		mode === 'edit' && canModify && ts != null && ts.status === 'DRAFT' && (isOwner || isManager)
	)
	// HR can submit someone else's aggregated draft on their behalf (canSubmit is
	// owner-only). It lands in the review queue — the edit surface never approves.
	const canSubmitForEmployee = $derived(
		mode === 'edit' && canModify && isHrAdmin && !isOwner && ts != null && ts.status === 'DRAFT'
	)

	const totalReg = $derived(entries.reduce((s, e) => s + (Number(e.reg) || 0), 0))
	const totalOt = $derived(entries.reduce((s, e) => s + (Number(e.ot) || 0), 0))
	const total = $derived(totalReg + totalOt)
	// Payload sent to the server: total hoursWorked = reg + ot; otHours = ot.
	const entriesPayload = $derived(
		entries.map((e) => ({
			date: e.date,
			timeIn: e.timeIn,
			timeOut: e.timeOut,
			hoursWorked: +(Number(e.reg) + Number(e.ot)).toFixed(2),
			otHours: +Number(e.ot).toFixed(2),
			notes: e.notes
		}))
	)

	function toDateKey(d: string | Date) {
		return new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
	}
	function toTimeInput(d: string | Date | null) {
		if (!d) return ''
		return new Date(d).toLocaleTimeString('en-GB', {
			hour: '2-digit',
			minute: '2-digit',
			hour12: false,
			timeZone: 'Asia/Manila'
		})
	}

	// Populate the local (always-built) entry rows whenever a timesheet opens; the summary
	// totals derive from them in both edit and read-only modes.
	$effect(() => {
		if (!ts) return
		rejecting = false
		entries = ts.entries.map((e) => ({
			date: toDateKey(e.date),
			timeIn: toTimeInput(e.timeIn),
			timeOut: toTimeInput(e.timeOut),
			reg: Number(e.hoursWorked) - Number(e.otHours),
			ot: Number(e.otHours),
			notes: e.notes ?? ''
		}))
	})

	function close() {
		ts = null
	}

	// Lock background scroll while the modal is open. Focusing the panel, trapping Tab and
	// restoring focus on close are Dialog's.
	$effect(() => {
		if (!ts) return
		document.body.style.overflow = 'hidden'
		return () => {
			document.body.style.overflow = ''
		}
	})

	// Regular window is 08:00–17:00; time worked outside it is OT. The 12:00–13:00 lunch
	// break is unpaid, so any of it worked is subtracted from regular hours (not OT).
	const REG_START = 8 * 60
	const REG_END = 17 * 60
	const LUNCH_START = 12 * 60
	const LUNCH_END = 13 * 60
	const overlapMin = (a1: number, a2: number, b1: number, b2: number) =>
		Math.max(0, Math.min(a2, b2) - Math.max(a1, b1))
	function recalcRow(row: Row) {
		if (!row.timeIn || !row.timeOut) return
		const [ih, im] = row.timeIn.split(':').map(Number)
		const [oh, om] = row.timeOut.split(':').map(Number)
		const inM = ih * 60 + im
		let outM = oh * 60 + om
		if (outM <= inM) outM += 1440 // overnight → next day
		const worked = outM - inM
		// Regular window and lunch on each day the shift touches (day 0 and, for an overnight
		// shift, the next day) so next-day morning hours stay regular instead of counting as OT.
		const regWindow =
			overlapMin(inM, outM, REG_START, REG_END) +
			overlapMin(inM, outM, REG_START + 1440, REG_END + 1440)
		const lunch =
			overlapMin(inM, outM, LUNCH_START, LUNCH_END) +
			overlapMin(inM, outM, LUNCH_START + 1440, LUNCH_END + 1440)
		row.reg = +((regWindow - lunch) / 60).toFixed(2)
		row.ot = +((worked - regWindow) / 60).toFixed(2)
	}
	function addRow() {
		const last = entries.at(-1)
		entries = [
			...entries,
			{
				date: last?.date ?? toDateKey(new Date()),
				timeIn: '',
				timeOut: '',
				reg: 0,
				ot: 0,
				notes: ''
			}
		]
	}
	function removeRow(i: number) {
		entries = entries.filter((_, idx) => idx !== i)
	}

	// Spreadsheet-style keyboard nav across the entry grid.
	// Up/Down (and Enter / Shift+Enter) move between rows; Left/Right jump columns at the
	// text boundary. Date/Time inputs keep their native arrow behaviour (segment editing).
	function selStart(el: HTMLInputElement): number | null {
		try {
			return el.selectionStart
		} catch {
			return null
		}
	}
	function atStart(el: HTMLInputElement) {
		const s = selStart(el)
		return s === null || (s === 0 && el.selectionEnd === 0)
	}
	function atEnd(el: HTMLInputElement) {
		const s = selStart(el)
		return s === null || s === el.value.length
	}
	function cellKeydown(e: KeyboardEvent, r: number, c: number) {
		const el = e.currentTarget as HTMLInputElement
		const focusCell = (rr: number, cc: number) => {
			const t = document.querySelector<HTMLInputElement>(`[data-r="${rr}"][data-c="${cc}"]`)
			if (t) {
				e.preventDefault()
				t.focus()
				try {
					t.select()
				} catch {
					/* date/time inputs don't support select() */
				}
			}
		}
		if (e.key === 'ArrowDown' || (e.key === 'Enter' && !e.shiftKey)) return focusCell(r + 1, c)
		if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) return focusCell(r - 1, c)
		if (el.type === 'date' || el.type === 'time') return // keep native segment arrows
		if (e.key === 'ArrowRight' && atEnd(el)) return focusCell(r, c + 1)
		if (e.key === 'ArrowLeft' && atStart(el)) return focusCell(r, c - 1)
	}

	// Keep the modal's local entry state on save; close it after a review/submit succeeds.
	const keepOpen: SubmitFunction = () => {
		busy = true
		return async ({ update }) => {
			await update({ reset: false })
			busy = false
		}
	}
	const closeOnSuccess: SubmitFunction = () => {
		busy = true
		return async ({ result, update }) => {
			await update({ reset: false })
			busy = false
			if (result.type === 'success') close()
		}
	}

	// Theme-aware status pills (dark-mode safe) — see the .badge-* classes in app.css.
	const inputClass =
		'h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
	const btnGhost =
		'rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50'
</script>

{#if ts}
	<Dialog
		open
		onclose={close}
		title="Timesheet review"
		size="full"
		padding="none"
		scroll
		zIndex={50}
	>
		<!-- Header -->
		<div class="flex items-start justify-between gap-4 border-b px-6 py-4">
			<div class="min-w-0">
				<div class="flex flex-wrap items-center gap-2">
					<h2 class="truncate text-lg font-bold tracking-tight">
						{ts.employee.lastName}, {ts.employee.firstName}
					</h2>
					<Badge status={ts.status} domain="timesheet" />
				</div>
				<p class="mt-0.5 text-sm text-muted-foreground">
					{formatShortDate(ts.periodStart)} – {formatShortDate(ts.periodEnd)}
				</p>
			</div>
			<button
				onclick={close}
				aria-label="Close"
				class="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="1.75"
					aria-hidden="true"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Body (scrollable) -->
		<div class="flex-1 space-y-4 overflow-y-auto px-6 py-4">
			<!-- Summary -->
			<div class="grid grid-cols-1 gap-3 sm:max-w-lg sm:grid-cols-2 md:grid-cols-4">
				<div class="rounded-lg border bg-muted/30 px-4 py-2">
					<p class="text-xs text-muted-foreground">Total</p>
					<p class="font-mono text-lg font-semibold">{total.toFixed(2)}</p>
				</div>
				<div class="rounded-lg border bg-muted/30 px-4 py-2">
					<p class="text-xs text-muted-foreground">Regular</p>
					<p class="font-mono text-lg font-semibold">{totalReg.toFixed(2)}</p>
				</div>
				<div class="rounded-lg border bg-muted/30 px-4 py-2">
					<p class="text-xs text-muted-foreground">Overtime</p>
					<p class="font-mono text-lg font-semibold text-amber-600">{totalOt.toFixed(2)}</p>
				</div>
				<div class="rounded-lg border bg-muted/30 px-4 py-2">
					<p class="text-xs text-muted-foreground">Entries</p>
					<p class="text-lg font-semibold">{canEdit ? entries.length : ts.entries.length}</p>
				</div>
			</div>

			{#if form?.error}
				<div
					class="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
				>
					{form.error}
				</div>
			{/if}

			{#if ts.status === 'REJECTED' && ts.rejectionReason}
				<div class="rounded-md border border-red-500/20 bg-red-500/5 px-4 py-2 text-sm">
					<span class="font-medium text-red-600">Rejection reason:</span>
					{ts.rejectionReason}
				</div>
			{/if}

			<!-- Entries table -->
			<p class="text-xs text-muted-foreground">
				Reg and OT are computed from In/Out: regular hours are 8:00 AM–5:00 PM less the unpaid
				12:00–1:00 PM lunch; time worked outside that window is overtime.
			</p>
			<div class="overflow-x-auto rounded-lg border">
				<table class="w-full text-sm">
					<thead class="border-b bg-muted/50">
						<tr>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">In</th>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Out</th>
							<th class="px-3 py-2 text-right font-medium text-muted-foreground">Reg</th>
							<th class="px-3 py-2 text-right font-medium text-muted-foreground">OT</th>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Notes</th>
							{#if canEdit}<th class="w-[1%] px-3 py-2"></th>{/if}
						</tr>
					</thead>
					<tbody class="divide-y">
						{#if canEdit}
							{#each entries as row, i (i)}
								<tr>
									<td class="px-3 py-1.5"
										><input
											type="date"
											bind:value={row.date}
											data-r={i}
											data-c={0}
											onkeydown={(e) => cellKeydown(e, i, 0)}
											class={inputClass}
										/></td
									>
									<td class="px-3 py-1.5"
										><input
											type="time"
											bind:value={row.timeIn}
											oninput={() => recalcRow(row)}
											data-r={i}
											data-c={1}
											onkeydown={(e) => cellKeydown(e, i, 1)}
											class={inputClass}
										/></td
									>
									<td class="px-3 py-1.5"
										><input
											type="time"
											bind:value={row.timeOut}
											oninput={() => recalcRow(row)}
											data-r={i}
											data-c={2}
											onkeydown={(e) => cellKeydown(e, i, 2)}
											class={inputClass}
										/></td
									>
									<!-- Reg/OT are derived from In/Out (read-only); edit the times to change them. -->
									<td class="px-3 py-1.5 text-right font-mono tabular-nums">
										{(Number(row.reg) || 0).toFixed(2)}
									</td>
									<td class="px-3 py-1.5 text-right font-mono tabular-nums text-amber-600">
										{(Number(row.ot) || 0).toFixed(2)}
									</td>
									<td class="px-3 py-1.5 min-w-36"
										><input
											type="text"
											bind:value={row.notes}
											placeholder="—"
											data-r={i}
											data-c={3}
											onkeydown={(e) => cellKeydown(e, i, 3)}
											class={inputClass}
										/></td
									>
									<td class="px-3 py-1.5 text-right">
										<button
											type="button"
											onclick={() => removeRow(i)}
											aria-label="Remove row"
											class="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-4 w-4"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
												stroke-width="1.75"
												aria-hidden="true"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
												/>
											</svg>
										</button>
									</td>
								</tr>
							{:else}
								<tr
									><td colspan="7" class="px-3 py-6 text-center text-muted-foreground"
										>No entries yet — add a row below.</td
									></tr
								>
							{/each}
						{:else}
							{#each ts.entries as e (e.id)}
								<tr>
									<td class="px-3 py-1.5 whitespace-nowrap">{formatShortDate(e.date)}</td>
									<td class="px-3 py-1.5 text-muted-foreground"
										>{e.timeIn ? toTimeInput(e.timeIn) : '—'}</td
									>
									<td class="px-3 py-1.5 text-muted-foreground"
										>{e.timeOut ? toTimeInput(e.timeOut) : '—'}</td
									>
									<td class="px-3 py-1.5 text-right font-mono"
										>{(Number(e.hoursWorked) - Number(e.otHours)).toFixed(2)}</td
									>
									<td class="px-3 py-1.5 text-right font-mono">{Number(e.otHours).toFixed(2)}</td>
									<td class="px-3 py-1.5 text-muted-foreground">{e.notes ?? '—'}</td>
								</tr>
							{:else}
								<tr
									><td colspan="6" class="px-3 py-6 text-center text-muted-foreground"
										>No entries recorded.</td
									></tr
								>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>

			{#if canEdit}
				<button
					type="button"
					onclick={addRow}
					class="w-full rounded-lg border border-dashed py-2 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
					>+ Add row</button
				>
			{/if}
		</div>

		<!-- Reject reason is collected in a ReasonDialog popup; this hidden form
			     is its submission target. -->
		{#if canReview}
			<form
				bind:this={rejectFormEl}
				method="POST"
				action="?/review"
				use:enhance={closeOnSuccess}
				class="hidden"
			>
				<input type="hidden" name="id" value={ts.id} />
				<input type="hidden" name="approved" value="false" />
				<input type="hidden" name="rejectionReason" value={rejectReason} />
			</form>
			<ReasonDialog
				bind:open={rejecting}
				title="Reject timesheet"
				message="Tell the employee what needs to change before resubmitting."
				placeholder="Explain what needs to change…"
				confirmText="Reject"
				onconfirm={confirmReject}
			/>
		{/if}

		<!-- Footer -->
		<div class="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-6 py-3">
			<div>
				{#if canDelete}
					<ConfirmButton
						action="?/delete"
						title="Delete timesheet?"
						message="This permanently deletes the timesheet and all its entries."
						triggerClass="rounded-md border border-red-500/20 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-500/10"
						disabled={busy}
						submit={closeOnSuccess}
					>
						<input type="hidden" name="id" value={ts.id} />
					</ConfirmButton>
				{/if}
			</div>

			<div class="flex flex-wrap items-center gap-2">
				{#if canEdit}
					<form method="POST" action="?/saveEntries" use:enhance={keepOpen}>
						<input type="hidden" name="id" value={ts.id} />
						<input type="hidden" name="entries" value={JSON.stringify(entriesPayload)} />
						<button disabled={busy} class={btnGhost}>Save entries</button>
					</form>
				{/if}
				{#if canReview}
					<button
						type="button"
						disabled={busy}
						onclick={() => (rejecting = true)}
						class="rounded-md border border-red-500/20 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50"
						>Reject…</button
					>
					<form method="POST" action="?/review" use:enhance={closeOnSuccess}>
						<input type="hidden" name="id" value={ts.id} />
						<input type="hidden" name="approved" value="true" />
						<button
							disabled={busy}
							class="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
							>Approve</button
						>
					</form>
				{/if}
				{#if canSync}
					<form method="POST" action="?/syncAttendance" use:enhance={closeOnSuccess}>
						<input type="hidden" name="id" value={ts.id} />
						<button
							disabled={busy}
							class={btnGhost}
							title="Replace entries with this period's attendance">Sync from attendance</button
						>
					</form>
				{/if}
				{#if canSubmit}
					<form method="POST" action="?/submit" use:enhance={closeOnSuccess}>
						<input type="hidden" name="id" value={ts.id} />
						<button
							disabled={busy}
							class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
							>Submit for review</button
						>
					</form>
				{/if}
				{#if canSubmitForEmployee}
					<form method="POST" action="?/submitDraft" use:enhance={closeOnSuccess}>
						<input type="hidden" name="id" value={ts.id} />
						<button
							disabled={busy}
							class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
							>Submit for review</button
						>
					</form>
				{/if}
			</div>
		</div>
	</Dialog>
{/if}
