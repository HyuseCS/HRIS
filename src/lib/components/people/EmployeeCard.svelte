<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte'
	import { EMPLOYMENT_STATUS_LABELS, labelFor } from '$lib/labels'
	import Monogram from './Monogram.svelte'
	import type { Person } from './people'

	let { person, href }: { person: Person; href: string } = $props()
</script>

<a
	{href}
	class="flex min-w-0 items-start gap-3 rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
>
	<Monogram firstName={person.firstName} lastName={person.lastName} />
	<div class="min-w-0 flex-1 space-y-0.5">
		<div class="flex items-start justify-between gap-2">
			<div class="min-w-0">
				<p class="truncate text-sm font-medium text-foreground">
					{person.firstName}
					{person.lastName}
				</p>
				<p class="truncate text-sm text-muted-foreground">{person.jobTitle}</p>
				<p
					class="truncate text-xs text-muted-foreground"
					aria-hidden={person.companyEmail ? undefined : 'true'}
				>
					{person.companyEmail ?? '—'}
				</p>
			</div>
			<span class="shrink-0 whitespace-nowrap">
				<span class="sr-only">Today:</span>
				{#if person.todayStatus}
					<Badge status={person.todayStatus} domain="attendance" />
				{:else}
					<Badge status="" tone="gray" label="No record" />
				{/if}
			</span>
		</div>
		<p class="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
			{#if person.unit}
				<span class="max-w-[40%] shrink-0 truncate">{person.unit}</span>
				<span aria-hidden="true">·</span>
			{/if}
			<span class="shrink-0 tabular-nums">{person.employeeNumber}</span>
			{#if person.employmentStatus !== 'ACTIVE'}
				<span aria-hidden="true">·</span>
				<span class="shrink-0">{labelFor(EMPLOYMENT_STATUS_LABELS, person.employmentStatus)}</span>
			{/if}
		</p>
	</div>
</a>
