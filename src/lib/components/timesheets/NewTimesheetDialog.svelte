<script lang="ts">
	import { enhance } from '$app/forms'
	import { goto } from '$app/navigation'
	import Dialog from '$lib/components/ui/Dialog.svelte'
	import PeriodPicker from '$lib/components/ui/PeriodPicker.svelte'

	type Employee = { id: string; firstName: string; lastName: string; employeeNumber: string }

	// "New Timesheet" popup, opened from the /timesheets header. Posts to the create
	// action, which seeds a DRAFT from the chosen employee's punches and redirects back.
	// The period is locked to the standard 1-15 / 16-EOM / whole-month shapes (#129).
	//
	// HR names the employee here rather than the sheet implicitly belonging to whoever is
	// signed in: since #165 employees no longer create their own, so every sheet made here
	// is HR acting on someone's behalf. `employees` is the same org-wide active list the
	// aggregate panel uses.
	let { open = $bindable(), employees }: { open: boolean; employees: Employee[] } = $props()

	let error = $state('')
	let submitting = $state(false)
	// No default: an unlabelled preselection is how you create a sheet for the wrong person.
	let employeeId = $state('')

	function close() {
		open = false
	}
	// Fresh state on open. Escape, the backdrop click and the focus trap are Dialog's.
	$effect(() => {
		if (open) {
			error = ''
			submitting = false
			employeeId = ''
		}
	})
</script>

<Dialog bind:open title="New timesheet" size="lg" padding="lg" zIndex={70}>
	<div class="space-y-2 text-center">
		<div
			class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"
		>
			<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
				/>
			</svg>
		</div>
		<h2 class="text-xl font-bold tracking-tight">New Timesheet</h2>
		<p class="mx-auto max-w-md text-sm text-muted-foreground">
			Pick an employee and a standard pay period. Hours are seeded from that employee's recorded
			attendance punches — adjust them afterward from the timesheet's row. The sheet is saved as a
			draft; submit it for review separately.
		</p>
	</div>

	{#if error}
		<div
			class="mt-4 rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
		>
			{error}
		</div>
	{/if}

	<form
		method="POST"
		action="/timesheets?/create"
		use:enhance={() => {
			submitting = true
			error = ''
			return async ({ result }) => {
				submitting = false
				if (result.type === 'redirect') {
					open = false
					await goto(result.location, { invalidateAll: true })
				} else if (result.type === 'failure') {
					error = String(result.data?.error ?? 'Failed to create timesheet.')
				} else if (result.type === 'error') {
					error = 'Something went wrong. Please try again.'
				}
			}
		}}
		class="mt-6 space-y-5"
	>
		<div>
			<label for="nt-employee" class="text-sm font-medium">Employee</label>
			<select
				id="nt-employee"
				name="employeeId"
				bind:value={employeeId}
				class="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				<option value="" disabled>Select an employee…</option>
				{#each employees as e (e.id)}
					<option value={e.id}>{e.lastName}, {e.firstName} ({e.employeeNumber})</option>
				{/each}
			</select>
		</div>
		<PeriodPicker />
		<div class="flex gap-3">
			<button
				type="button"
				onclick={close}
				class="flex-1 rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-accent"
				>Cancel</button
			>
			<button
				type="submit"
				disabled={submitting || !employeeId}
				class="flex-1 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
				>{submitting ? 'Creating…' : 'Create timesheet'}</button
			>
		</div>
	</form>
</Dialog>
