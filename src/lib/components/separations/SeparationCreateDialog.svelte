<script lang="ts">
	import { enhance } from '$app/forms'
	import Dialog from '$lib/components/ui/Dialog.svelte'
	import DatePicker from '$lib/components/ui/DatePicker.svelte'
	import Banner from '$lib/components/ui/Banner.svelte'

	type Employee = { id: string; firstName: string; lastName: string; employeeNumber: string }
	type CreateForm = { error?: string; fieldErrors?: Record<string, string[]> } | null | undefined

	let {
		open = $bindable(),
		employees,
		form
	}: { open: boolean; employees: Employee[]; form: CreateForm } = $props()

	let submitting = $state(false)

	const fieldErrors = $derived(form?.fieldErrors)
	const fe = (name: string) => fieldErrors?.[name]?.[0]
	// Red-border the specific field(s) the server rejected (#142).
	const invalid = (name: string) => (fe(name) ? true : undefined)
</script>

<Dialog bind:open title="New Separation" size="lg">
	<form
		method="POST"
		action="/separations?/create"
		use:enhance={() => {
			submitting = true
			return async ({ update }) => {
				await update()
				submitting = false
			}
		}}
		class="space-y-4"
	>
		<h2 class="font-semibold">New Separation</h2>

		<div class="grid items-start gap-3 sm:grid-cols-2">
			<div class="grid gap-1.5 sm:col-span-2">
				<label for="employeeId" class="text-sm font-medium"
					>Employee <span class="text-red-500" aria-hidden="true">*</span></label
				>
				<select
					id="employeeId"
					name="employeeId"
					aria-invalid={invalid('employeeId')}
					required
					class="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
				>
					<option value="" disabled selected>Select an employee…</option>
					{#each employees as e (e.id)}
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
				{#if fe('type')}<p class="text-xs text-red-600">{fe('type')}</p>{/if}
			</div>
			<div class="grid gap-1.5">
				<label for="effectiveDate" class="text-sm font-medium"
					>Effective date <span class="text-red-500" aria-hidden="true">*</span></label
				>
				<DatePicker
					id="effectiveDate"
					name="effectiveDate"
					aria-invalid={invalid('effectiveDate')}
					value=""
					required
					class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
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
				maxlength="1000"
				class="rounded-md border border-input bg-background px-3 py-2 text-sm"
			></textarea>
			{#if fe('reason')}<p class="text-xs text-red-600">{fe('reason')}</p>{/if}
		</div>
		<div class="flex flex-wrap items-center gap-3">
			<button
				type="submit"
				disabled={submitting}
				class="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
				>{submitting ? 'Creating…' : 'Start separation'}</button
			>
			{#if form?.error}
				<Banner kind="error" message={form.error} class="min-w-48 flex-1" autoDismiss />
			{/if}
		</div>
	</form>
</Dialog>
