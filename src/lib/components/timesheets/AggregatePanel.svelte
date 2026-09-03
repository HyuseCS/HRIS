<script lang="ts">
	import { enhance } from '$app/forms'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
	import type { SubmitFunction } from '@sveltejs/kit'
	import { slide } from 'svelte/transition'
	import { formatShortDate } from '$lib/utils/format'

	type Employee = { id: string; firstName: string; lastName: string; employeeNumber: string }
	type Preview = {
		periodStart: string | Date
		periodEnd: string | Date
		hoursByDay: Record<string, number>
		otByDay: Record<string, number>
		totalHours: number
		totalOt: number
		warnings: string[]
		employeeId: string
		weekOf: string
	}

	let { employees }: { employees: Employee[] } = $props()

	let employeeId = $state('')
	let weekOf = $state('')
	let busy = $state(false)
	// Held in local state so the preview survives unrelated `form` updates (e.g. the modal).
	let preview = $state<Preview | null>(null)

	// Sorted PHT-day rows for the punch table, split into regular / OT (reg = total − OT).
	const dayRows = $derived(
		preview
			? Object.entries(preview.hoursByDay)
					.sort(([a], [b]) => a.localeCompare(b))
					.map(([day, hours]) => {
						const ot = preview!.otByDay[day] ?? 0
						return { day, total: hours, ot, reg: +(hours - ot).toFixed(2) }
					})
			: []
	)

	function weekdayOf(dayKey: string) {
		return new Date(`${dayKey}T00:00:00+08:00`).toLocaleDateString('en-PH', {
			weekday: 'short',
			timeZone: 'Asia/Manila'
		})
	}

	// A preview only describes the employee+week it was generated for; drop it whenever the
	// selection changes so a stale preview can't be shown or committed.
	function clearPreview() {
		preview = null
	}

	// Capture the preview payload into local state on success; clear it on failure. Keep inputs.
	const capturePreviewInner: SubmitFunction = () => {
		busy = true
		return async ({ result, update }) => {
			await update({ reset: false })
			busy = false
			preview = result.type === 'success' ? ((result.data?.preview as Preview) ?? null) : null
		}
	}
	const keepInputsInner: SubmitFunction = () => {
		busy = true
		return async ({ update }) => {
			await update({ reset: false })
			busy = false
		}
	}
	// Both callbacks swallowed `result.type === 'error'` entirely — the panel just sat there.
	const capturePreview = submitFeedback({ success: null, inner: capturePreviewInner })
	const keepInputs = submitFeedback({ inner: keepInputsInner })

	const canRun = $derived(Boolean(employeeId) && Boolean(weekOf))
	// Only commit what was actually previewed: the preview must match the current selection.
	const canAggregate = $derived(
		preview != null && preview.employeeId === employeeId && preview.weekOf === weekOf
	)
	const inputClass =
		'h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
</script>

<section class="space-y-3 rounded-lg border bg-muted/20 p-4">
	<div>
		<!-- The period shape is named on the control itself, not only in the page intro: this door
		     takes ONE week, while the New Timesheet door beside it takes a pay period. -->
		<h3 class="text-base font-semibold">Aggregate from time logs — one week</h3>
		<p class="text-sm text-muted-foreground">
			Preview one whole week (Monday to Sunday, Manila time) of an employee's Discord punches, then
			roll them into a draft timesheet. Pick any day in the week you want.
		</p>
	</div>

	<div class="flex flex-wrap items-end gap-3">
		<div class="min-w-56 flex-1">
			<label for="agg-employee" class="text-sm font-medium">Employee</label>
			<select
				id="agg-employee"
				bind:value={employeeId}
				onchange={clearPreview}
				class="mt-1 {inputClass}"
			>
				<option value="" disabled>Select an employee…</option>
				{#each employees as e (e.id)}
					<option value={e.id}>{e.lastName}, {e.firstName} ({e.employeeNumber})</option>
				{/each}
			</select>
		</div>
		<div>
			<label for="agg-week" class="text-sm font-medium">Week (any day in it)</label>
			<input
				id="agg-week"
				type="date"
				bind:value={weekOf}
				oninput={clearPreview}
				class="mt-1 {inputClass}"
			/>
		</div>

		<form method="POST" action="?/previewAggregate" use:enhance={capturePreview.enhance}>
			<input type="hidden" name="employeeId" value={employeeId} />
			<input type="hidden" name="weekOf" value={weekOf} />
			<button
				disabled={busy || !canRun}
				class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
				>Preview</button
			>
		</form>
		<form method="POST" action="?/aggregate" use:enhance={keepInputs.enhance}>
			<input type="hidden" name="employeeId" value={employeeId} />
			<input type="hidden" name="weekOf" value={weekOf} />
			<button
				disabled={busy || !canAggregate}
				title={canAggregate ? undefined : 'Preview this employee and week first'}
				class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
				>Aggregate week</button
			>
		</form>
	</div>

	{#if preview}
		<div class="space-y-3 pt-1" transition:slide={{ duration: 120 }}>
			<div class="flex flex-wrap items-center justify-between gap-2">
				<p class="text-sm font-medium">
					Week of {formatShortDate(preview.periodStart)} – {formatShortDate(preview.periodEnd)}
				</p>
				<p class="text-sm text-muted-foreground">
					OT <span class="font-mono font-semibold text-amber-600">{preview.totalOt.toFixed(2)}</span
					>
					· Total
					<span class="font-mono font-semibold text-foreground"
						>{preview.totalHours.toFixed(2)}</span
					> hrs
				</p>
			</div>

			<div class="overflow-x-auto rounded-lg border bg-background">
				<table class="w-full text-sm">
					<thead class="border-b bg-muted/50">
						<tr>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Day (PHT)</th>
							<th class="px-3 py-2 text-right font-medium text-muted-foreground">Reg</th>
							<th class="px-3 py-2 text-right font-medium text-muted-foreground">OT</th>
							<th class="px-3 py-2 text-right font-medium text-muted-foreground">Total</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each dayRows as row (row.day)}
							<tr>
								<td class="px-3 py-1.5 whitespace-nowrap">{weekdayOf(row.day)} · {row.day}</td>
								<td class="px-3 py-1.5 text-right font-mono">{row.reg.toFixed(2)}</td>
								<td class="px-3 py-1.5 text-right font-mono text-amber-600">{row.ot.toFixed(2)}</td>
								<td class="px-3 py-1.5 text-right font-mono font-semibold"
									>{row.total.toFixed(2)}</td
								>
							</tr>
						{:else}
							<tr
								><td colspan="4" class="px-3 py-6 text-center text-muted-foreground"
									>No paired punches in this week.</td
								></tr
							>
						{/each}
					</tbody>
				</table>
			</div>

			{#if preview.warnings.length}
				<div class="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-sm">
					<p class="font-medium text-amber-600 dark:text-amber-400">
						{preview.warnings.length} warning{preview.warnings.length === 1 ? '' : 's'}
					</p>
					<ul class="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
						{#each preview.warnings as w (w)}
							<li>{w}</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	{/if}
</section>
