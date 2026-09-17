<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte'
	import Monogram from './Monogram.svelte'
	import type { Person } from './people'

	let { person, href }: { person: Person; href: string } = $props()
</script>

<a
	{href}
	class="flex min-w-0 items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
>
	<Monogram firstName={person.firstName} lastName={person.lastName} />
	<div class="min-w-0 flex-1 space-y-1">
		<div class="flex items-start justify-between gap-2">
			<div class="min-w-0">
				<p class="truncate text-sm font-medium text-foreground">
					{person.firstName}
					{person.lastName}
				</p>
				<p class="truncate text-sm text-muted-foreground">{person.jobTitle}</p>
			</div>
			<Badge status={person.employmentStatus} domain="employment" />
		</div>
		<p class="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
			{#if person.unit}
				<span class="max-w-[40%] shrink-0 truncate">{person.unit}</span>
				<span aria-hidden="true">·</span>
			{/if}
			<span class="shrink-0 tabular-nums">{person.employeeNumber}</span>
			{#if person.companyEmail}
				<span aria-hidden="true">·</span>
				<span class="min-w-0 truncate">{person.companyEmail}</span>
			{/if}
		</p>
	</div>
</a>
