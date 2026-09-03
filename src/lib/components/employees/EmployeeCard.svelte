<script lang="ts">
	interface Employee {
		id: string
		firstName: string
		lastName: string
		employeeNumber: string
		jobTitle: string
		department: { name: string }
		employmentStatus: string
		user: { email: string }
	}

	import Badge from '$lib/components/ui/Badge.svelte'

	let { employee }: { employee: Employee } = $props()

	const initials = $derived(
		`${employee.firstName.charAt(0)}${employee.lastName.charAt(0)}`.toUpperCase()
	)
</script>

<a
	href="/employees/{employee.id}"
	class="block rounded-md border p-4 hover:bg-accent transition-colors"
>
	<div class="flex items-start gap-3">
		<!-- Avatar placeholder -->
		<div
			class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold"
		>
			{initials}
		</div>

		<div class="min-w-0 flex-1">
			<!-- Name and employee number -->
			<div class="flex items-center gap-2 flex-wrap">
				<span class="font-bold text-sm">{employee.firstName} {employee.lastName}</span>
				<span class="text-xs text-muted-foreground">{employee.employeeNumber}</span>
			</div>

			<!-- Job title and department -->
			<div class="text-sm text-muted-foreground mt-0.5">
				{employee.jobTitle}
				{#if employee.department?.name}
					&middot; {employee.department.name}
				{/if}
			</div>

			<!-- Email -->
			<div class="text-xs text-muted-foreground mt-0.5">{employee.user.email}</div>
		</div>

		<!-- Status badge. The wrapper keeps the flex-child `shrink-0` the pill carried before. -->
		<span class="shrink-0">
			<Badge status={employee.employmentStatus} domain="employment" />
		</span>
	</div>
</a>
