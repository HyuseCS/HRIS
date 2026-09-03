<script lang="ts">
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import Pagination from '$lib/components/Pagination.svelte'
	import Badge from '$lib/components/ui/Badge.svelte'
	import Icon from './Icon.svelte'
	import { IC, QUICK_PICKS, fmtDate, fmtTime, n, pickPeriod, type AttendanceData } from './shared'

	/**
	 * An employee looking at their own attendance — the `data.canManage === false` persona
	 * (phase 07 §S5). No correction door, no team view, no bulk actions: `load` only ever gives
	 * this persona `view: 'employee'` on their own record, so those branches are gone rather
	 * than gated.
	 */
	let { data, exportHref }: { data: AttendanceData; exportHref: string } = $props()
</script>

<!-- Filters -->
<form method="GET" class="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
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
				class="rounded-full border px-3 py-1 text-xs font-medium hover:bg-accent">{q.label}</button
			>
		{/each}
	</div>
	<p class="w-full text-xs text-muted-foreground">
		Range is capped at {data.maxRangeDays} days (~2 months); longer spans are trimmed automatically.
	</p>
</form>

<!-- Employees can export their own timesheet -->
<div class="flex gap-2">
	<a
		href={exportHref}
		class="inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
		><Icon d={IC.download} />Export CSV</a
	>
</div>

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
					<!-- #162: read-only display split.
					     M-15: kept AFTER the reconciled numbers — see the HR grid header. -->
					<th class="px-3 py-3 text-left font-medium text-muted-foreground">AM In</th>
					<th class="px-3 py-3 text-left font-medium text-muted-foreground">AM Out</th>
					<th class="px-3 py-3 text-left font-medium text-muted-foreground">PM In</th>
					<th class="px-3 py-3 text-left font-medium text-muted-foreground">PM Out</th>
				{/if}
			</tr>
		</thead>
		<tbody class="divide-y">
			{#each data.days as d (d.id)}
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
					<td class="px-3 py-2"><Badge status={d.status} domain="attendance" /></td>
					<td class="px-3 py-2 text-muted-foreground">{fmtTime(d.timeIn)}</td>
					<td class="px-3 py-2 text-muted-foreground">{fmtTime(d.timeOut)}</td>
					<td class="px-3 py-2 text-right font-mono">{n(d.regularHours).toFixed(2)}</td>
					<td class="px-3 py-2 text-right font-mono"
						>{n(d.overtimeHours).toFixed(2)}{#if n(d.rawOvertimeHours) > n(d.overtimeHours)}<span
								class="ml-1 text-xs text-amber-600 dark:text-amber-400"
								title="unapproved OT"
								>(+{(n(d.rawOvertimeHours) - n(d.overtimeHours)).toFixed(1)})</span
							>{/if}</td
					>
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
				</tr>
			{:else}
				<tr
					><td colspan={8 + (data.showAmPm ? 4 : 0)} class="p-0"
						><EmptyState variant="empty" title="No attendance for this range" /></td
					></tr
				>
			{/each}
		</tbody>
	</table>
</div>

<Pagination meta={data.pagination} />
