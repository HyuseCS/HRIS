<script lang="ts">
	import type { ComponentProps } from 'svelte'
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import Container from '$lib/components/ui/Container.svelte'
	import DatePicker from '$lib/components/ui/DatePicker.svelte'
	import HelpTip from '$lib/components/ui/HelpTip.svelte'
	import Pagination from '$lib/components/Pagination.svelte'
	import { formatShortDate } from '$lib/utils/format'

	let {
		matrix
	}: {
		matrix: {
			members: { id: string; firstName: string; lastName: string }[]
			pagination: ComponentProps<typeof Pagination>['meta']
			dates: string[]
			attendanceMap: Record<string, Record<string, string>>
			startDate: string
			endDate: string
		}
	} = $props()

	// svelte-ignore state_referenced_locally
	let startValue = $state(matrix.startDate)
	// svelte-ignore state_referenced_locally
	let endValue = $state(matrix.endDate)

	let rangeForm: HTMLFormElement | undefined = $state()

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
	const fill = $derived(matrix.members.length >= matrix.pagination.pageSize)
</script>

{#snippet toolbar()}
	<div class="relative flex items-center gap-2">
		<!-- Owner ruling 03-09-26 (#182): a physical location is a "Store" on every surface, and the
		     people roster is "Team" for every tenant. The old food-service branch, which called the
		     roster "Branches" and the store registry "Stores", is the inversion being killed. -->
		<h2 class="text-base font-semibold">Team Attendance</h2>
		<HelpTip label="About team attendance">
			Multi-day overview — present, late, absent, incomplete, on leave, holiday, or rest day across
			a date range.
		</HelpTip>
	</div>
	<!-- Date range filter -->
	<form bind:this={rangeForm} method="GET" class="flex flex-wrap items-center gap-3">
		<div class="flex items-center gap-2">
			<label for="start" class="text-sm font-medium">Start</label>
			<DatePicker
				id="start"
				name="start"
				bind:value={startValue}
				max={endValue || undefined}
				onchange={() => rangeForm?.requestSubmit()}
				class="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
		</div>
		<div class="flex items-center gap-2">
			<label for="end" class="text-sm font-medium">End</label>
			<DatePicker
				id="end"
				name="end"
				bind:value={endValue}
				min={startValue || undefined}
				onchange={() => rangeForm?.requestSubmit()}
				class="h-9 w-40 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
		</div>
	</form>
{/snippet}

{#snippet emptyState()}
	<EmptyState title="No team members found" />
{/snippet}

<Container tone="card" flush {toolbar} empty={matrix.members.length === 0} {emptyState}>
	<!-- Legend -->
	<div class="flex flex-wrap gap-4 border-b px-4 py-2 text-xs text-muted-foreground">
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
	{#if matrix.members.length > 0}
		<div class="phone-scroll min-h-0 flex-1 overflow-auto">
			<table class="w-full text-sm {fill ? 'lg:h-full' : ''}">
				<thead class="sticky top-0 z-20 border-b bg-card">
					<tr class="bg-muted/50 {fill ? 'lg:h-[37px]' : ''}">
						<th
							class="px-4 py-2 text-left font-medium text-muted-foreground whitespace-nowrap sticky left-0 bg-muted/50 z-10"
						>
							Employee
						</th>
						{#each matrix.dates as date (date)}
							<th
								class="px-2 py-2 text-center font-medium text-muted-foreground whitespace-nowrap min-w-[64px]"
							>
								{formatShortDate(date)}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each matrix.members as member (member.id)}
						<tr class="h-10 hover:bg-muted/30 {fill ? 'lg:h-auto' : ''}">
							<td
								class="px-4 py-1.5 font-medium whitespace-nowrap sticky left-0 bg-background z-10"
							>
								<!-- ?from so the shared employee page's Back returns here, not the role-based
								     /employees fallback, even on reload/direct entry (#113). -->
								<a
									href="/employees/{member.id}?from=/attendance"
									class="text-primary hover:underline"
								>
									{member.lastName}, {member.firstName}
								</a>
							</td>
							{#each matrix.dates as date (date)}
								{@const badge = STATUS[matrix.attendanceMap[member.id]?.[date]] ?? NO_DATA}
								<td class="px-2 py-1.5 text-center">
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

	{#snippet footer()}
		<Pagination meta={matrix.pagination} />
	{/snippet}
</Container>
