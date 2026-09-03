<script lang="ts">
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import { formatShortDate } from '$lib/utils/format'
	import type { PageData, ActionData } from './$types'
	import Badge from '$lib/components/ui/Badge.svelte'

	let { data, form }: { data: PageData; form: ActionData } = $props()
	let showForm = $state(false)
	let submitting = $state(false)

	const fieldErrors = $derived(
		(form as { fieldErrors?: Record<string, string[]> } | null)?.fieldErrors
	)
	const fe = (name: string) => fieldErrors?.[name]?.[0]
	// Red-border the specific field(s) the server rejected (#142).
	const invalid = (name: string) => (fe(name) ? true : undefined)

	function clearedCount(items: { status: string }[]) {
		return items.filter((i) => i.status === 'CLEARED').length
	}
</script>

<svelte:head>
	<title>Separations — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Separations</h1>
			<p class="text-sm text-muted-foreground">
				Record resignations and terminations, run clearance, and settle final pay.
			</p>
		</div>
		<button
			onclick={() => (showForm = !showForm)}
			class="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
		>
			{showForm ? 'Close' : 'New Separation'}
		</button>
	</div>

	{#if form?.error}
		<Banner kind="error" message={form.error} />
	{/if}

	{#if showForm}
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				submitting = true
				return async ({ update }) => {
					await update()
					submitting = false
				}
			}}
			class="space-y-4 rounded-lg border bg-card p-4"
		>
			<div class="grid gap-3 sm:grid-cols-2">
				<div class="grid gap-1.5">
					<label for="employeeId" class="text-sm font-medium"
						>Employee <span class="text-red-500" aria-hidden="true">*</span></label
					>
					<select
						id="employeeId"
						name="employeeId"
						aria-invalid={invalid('employeeId')}
						required
						class="h-9 rounded-md border border-input bg-background px-3 text-sm"
					>
						<option value="" disabled selected>Select an employee…</option>
						{#each data.employees as e (e.id)}
							<option value={e.id}>{e.lastName}, {e.firstName} ({e.employeeNumber})</option>
						{/each}
					</select>
					{#if fe('employeeId')}<p class="text-xs text-red-600">{fe('employeeId')}</p>{/if}
				</div>
				<div class="grid gap-1.5">
					<label for="type" class="text-sm font-medium"
						>Type <span class="text-red-500" aria-hidden="true">*</span></label
					>
					<select
						id="type"
						name="type"
						aria-invalid={invalid('type')}
						required
						class="h-9 rounded-md border border-input bg-background px-3 text-sm"
					>
						<option value="RESIGNATION">Resignation</option>
						<option value="TERMINATION">Termination</option>
					</select>
				</div>
				<div class="grid gap-1.5">
					<label for="effectiveDate" class="text-sm font-medium"
						>Effective date <span class="text-red-500" aria-hidden="true">*</span></label
					>
					<input
						id="effectiveDate"
						name="effectiveDate"
						aria-invalid={invalid('effectiveDate')}
						type="date"
						required
						class="h-9 rounded-md border border-input bg-background px-3 text-sm"
					/>
					{#if fe('effectiveDate')}<p class="text-xs text-red-600">{fe('effectiveDate')}</p>{/if}
				</div>
			</div>
			<div class="grid gap-1.5">
				<label for="reason" class="text-sm font-medium"
					>Reason <span class="text-muted-foreground">(optional)</span></label
				>
				<textarea
					id="reason"
					name="reason"
					aria-invalid={invalid('reason')}
					rows="2"
					class="rounded-md border border-input bg-background px-3 py-2 text-sm"
				></textarea>
			</div>
			<button
				type="submit"
				disabled={submitting}
				class="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
				>{submitting ? 'Creating…' : 'Start separation'}</button
			>
		</form>
	{/if}

	<div class="rounded-lg border">
		<table class="w-full text-sm">
			<thead class="border-b bg-muted/50">
				<tr>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Employee</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Effective</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Clearance</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
					<th class="px-4 py-3"></th>
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each data.separations as s (s.id)}
					<tr class="hover:bg-muted/30">
						<td class="px-4 py-3 font-medium">
							<a href="/separations/{s.id}" class="hover:underline"
								>{s.employee.lastName}, {s.employee.firstName}</a
							>
							<span class="text-xs text-muted-foreground">({s.employee.employeeNumber})</span>
						</td>
						<td class="px-4 py-3 text-muted-foreground">{s.type}</td>
						<td class="px-4 py-3 text-muted-foreground">{formatShortDate(s.effectiveDate)}</td>
						<td class="px-4 py-3 text-muted-foreground"
							>{clearedCount(s.clearanceItems)}/{s.clearanceItems.length}</td
						>
						<td class="px-4 py-3">
							<Badge status={s.status} domain="separation" />
						</td>
						<td class="px-4 py-3 text-right">
							<a href="/separations/{s.id}" class="btn-row">Open</a>
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="6" class="px-4 py-8 text-center text-muted-foreground"
							>No separation cases yet.</td
						>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
