<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte'
	import Monogram from './Monogram.svelte'
	import type { Person } from './people'

	let {
		people,
		unitLabel,
		hrefFor
	}: { people: Person[]; unitLabel: string; hrefFor: (_person: Person) => string } = $props()

	const th = 'px-4 py-3 text-left font-medium text-muted-foreground'
</script>

<table class="w-full table-fixed text-sm">
	<thead class="border-b bg-muted/50">
		<tr>
			<th scope="col" class="{th} w-[45%] md:w-auto">Name</th>
			<th scope="col" class={th}>Job title</th>
			<th scope="col" class="{th} hidden md:table-cell">{unitLabel}</th>
			<th scope="col" class="{th} hidden w-32 lg:table-cell">Employee #</th>
			<th scope="col" class="{th} hidden lg:table-cell">Email</th>
			<th scope="col" class="{th} w-28">Status</th>
		</tr>
	</thead>
	<tbody class="divide-y">
		{#each people as person (person.id)}
			<tr class="transition-colors hover:bg-muted/30">
				<td class="px-4 py-2.5">
					<a
						href={hrefFor(person)}
						class="flex min-w-0 items-center gap-2.5 rounded-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<Monogram firstName={person.firstName} lastName={person.lastName} size="sm" />
						<span class="min-w-0 break-words">{person.lastName}, {person.firstName}</span>
					</a>
				</td>
				<td class="break-words px-4 py-2.5 text-muted-foreground">{person.jobTitle}</td>
				<td class="hidden truncate px-4 py-2.5 text-muted-foreground md:table-cell"
					>{person.unit ?? '—'}</td
				>
				<td class="hidden truncate px-4 py-2.5 tabular-nums text-muted-foreground lg:table-cell"
					>{person.employeeNumber}</td
				>
				<td
					class="hidden truncate px-4 py-2.5 text-muted-foreground lg:table-cell"
					title={person.companyEmail ?? undefined}>{person.companyEmail ?? '—'}</td
				>
				<td class="px-4 py-2.5"><Badge status={person.employmentStatus} domain="employment" /></td>
			</tr>
		{/each}
	</tbody>
</table>
