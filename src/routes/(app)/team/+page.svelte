<script lang="ts">
	import { formatShortDate } from '$lib/utils/format'
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()

	// svelte-ignore state_referenced_locally
	let startValue = $state(data.startDate)
	// svelte-ignore state_referenced_locally
	let endValue = $state(data.endDate)

	// AttendanceDay.status → calendar cell (short code, colour, legend label). Order drives the
	// legend. These stay one-or-two-letter cells rather than <Badge>: the grid sizes on the code,
	// and a full label would not fit. Only the colours are theme-paired here — the `-400` step
	// alone is below AA on the light card, which is the same defect the badge tokens had.
	const STATUS: Record<string, { code: string; label: string; class: string }> = {
		PRESENT: {
			code: 'P',
			label: 'Present',
			class: 'bg-green-500/15 text-green-800 dark:text-green-400'
		},
		LATE: {
			code: 'LT',
			label: 'Late',
			class: 'bg-amber-500/15 text-amber-800 dark:text-amber-400'
		},
		INCOMPLETE: {
			code: 'IN',
			label: 'Incomplete',
			class: 'bg-orange-500/15 text-orange-800 dark:text-orange-400'
		},
		ABSENT: { code: 'A', label: 'Absent', class: 'bg-red-500/15 text-red-700 dark:text-red-400' },
		ON_LEAVE: {
			code: 'LV',
			label: 'On Leave',
			class: 'bg-blue-500/15 text-blue-700 dark:text-blue-400'
		},
		HOLIDAY: {
			code: 'H',
			label: 'Holiday',
			class: 'bg-purple-500/15 text-purple-800 dark:text-purple-400'
		},
		REST_DAY: { code: 'R', label: 'Rest Day', class: 'bg-muted text-muted-foreground' }
	}
	// The dash cell = no AttendanceDay record for that day (no punch / not yet derived).
	const NO_DATA = { code: '–', label: 'No data', class: 'bg-muted text-muted-foreground' }
	const legend = [...Object.values(STATUS), NO_DATA]
</script>

<svelte:head>
	<title>{data.isFoodService ? 'Branches' : 'Team'} — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">
				{data.isFoodService ? 'Branch Attendance' : 'Team Attendance'}
			</h1>
			<p class="text-sm text-muted-foreground">
				Multi-day overview — present, late, absent, incomplete, on leave, holiday, or rest day
				across a date range.
			</p>
		</div>
		<a
			href="/attendance?view=team"
			class="whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent"
			>Daily roster &amp; corrections →</a
		>
	</div>

	<!-- Date range filter -->
	<form method="GET" class="flex flex-wrap items-end gap-3 rounded-md border p-4">
		<div>
			<label for="start" class="block text-sm font-medium mb-1">Start Date</label>
			<input
				id="start"
				name="start"
				type="date"
				bind:value={startValue}
				max={endValue || undefined}
				onchange={(e) => e.currentTarget.form?.requestSubmit()}
				class="flex h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
		</div>
		<div>
			<label for="end" class="block text-sm font-medium mb-1">End Date</label>
			<input
				id="end"
				name="end"
				type="date"
				bind:value={endValue}
				min={startValue || undefined}
				onchange={(e) => e.currentTarget.form?.requestSubmit()}
				class="flex h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
		</div>
	</form>

	<!-- Legend -->
	<div class="flex flex-wrap gap-4 text-xs text-muted-foreground">
		{#each legend as item (item.code)}
			<span class="flex items-center gap-1.5">
				<span
					class="inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold {item.class}"
					>{item.code}</span
				>
				{item.label}
			</span>
		{/each}
	</div>

	<!-- Attendance table -->
	{#if data.members.length === 0}
		<div class="rounded-md border bg-muted/50 px-6 py-12 text-center text-muted-foreground text-sm">
			No team members found.
		</div>
	{:else}
		<div class="overflow-x-auto rounded-md border">
			<table class="w-full text-sm">
				<thead class="border-b bg-muted/50">
					<tr>
						<th
							class="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap sticky left-0 bg-muted/50 z-10"
						>
							Employee
						</th>
						{#each data.dates as date (date)}
							<th
								class="px-2 py-3 text-center font-medium text-muted-foreground whitespace-nowrap min-w-[64px]"
							>
								{formatShortDate(date)}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each data.members as member (member.id)}
						<tr class="hover:bg-muted/30">
							<td class="px-4 py-3 font-medium whitespace-nowrap sticky left-0 bg-background z-10">
								<!-- ?from so the shared employee page's Back returns here, not the role-based
							     /employees fallback, even on reload/direct entry (#113). -->
								<a href="/employees/{member.id}?from=/team" class="text-primary hover:underline">
									{member.lastName}, {member.firstName}
								</a>
							</td>
							{#each data.dates as date (date)}
								{@const badge = STATUS[data.attendanceMap[member.id]?.[date]] ?? NO_DATA}
								<td class="px-2 py-3 text-center">
									<span
										class="inline-flex h-6 min-w-6 items-center justify-center rounded px-1 text-xs font-bold {badge.class}"
										title={badge.label}
										aria-label={badge.label}
									>
										{badge.code}
									</span>
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
