<script lang="ts">
	import Badge from '$lib/components/ui/Badge.svelte'
	import Monogram from './Monogram.svelte'
	import type { Person } from './people'

	let {
		people,
		unitLabel,
		hrefFor
	}: { people: Person[]; unitLabel: string; hrefFor: (_person: Person) => string } = $props()

	const th = 'px-4 py-2 text-left font-medium text-muted-foreground'
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
			<tr
				class="relative h-[39.8px] transition-colors hover:bg-accent/40 has-[a:focus-visible]:outline has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2 has-[a:focus-visible]:outline-ring"
			>
				<td class="whitespace-nowrap px-4 py-1">
					<a
						href={hrefFor(person)}
						title="{person.lastName}, {person.firstName}"
						class="flex min-w-0 items-center gap-2.5 font-medium text-foreground after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none"
					>
						<Monogram firstName={person.firstName} lastName={person.lastName} size="sm" />
						<span class="min-w-0 truncate">{person.lastName}, {person.firstName}</span>
					</a>
				</td>
				<td class="truncate px-4 py-1 text-muted-foreground">{person.jobTitle}</td>
				<td class="hidden truncate px-4 py-1 text-muted-foreground md:table-cell"
					>{person.unit ?? '—'}</td
				>
				<td class="hidden truncate px-4 py-1 tabular-nums text-muted-foreground lg:table-cell"
					>{person.employeeNumber}</td
				>
				<td
					class="hidden truncate px-4 py-1 text-muted-foreground lg:table-cell"
					title={person.companyEmail ?? undefined}>{person.companyEmail ?? '—'}</td
				>
				<td class="px-4 py-1"><Badge status={person.employmentStatus} domain="employment" /></td>
			</tr>
		{/each}
	</tbody>
</table>
