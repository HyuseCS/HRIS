<script lang="ts">
	import { enhance } from '$app/forms'
	import { goto } from '$app/navigation'
	import { fade, scale } from 'svelte/transition'
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
	// Fresh state on open. Escape (which bubbles to the dialog's handler) closes it.
	$effect(() => {
		if (open) {
			error = ''
			submitting = false
			employeeId = ''
		}
	})
	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation()
			close()
		}
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
		onclick={close}
		role="presentation"
		transition:fade={{ duration: 100 }}
	>
		<div
			class="relative w-full max-w-lg rounded-xl border bg-card p-8 shadow-2xl"
			onclick={(e) => e.stopPropagation()}
			onkeydown={onKeydown}
			role="dialog"
			aria-modal="true"
			aria-label="New timesheet"
			tabindex="-1"
			transition:scale={{ duration: 120, start: 0.96 }}
		>
			<!-- The detail that used to sit under the heading as three lines of prose. Hover OR
			     keyboard focus reveals it, and `aria-describedby` keeps it on the button for a
			     screen reader whether or not it is visible. -->
			<div class="group absolute right-4 top-4">
				<button
					type="button"
					aria-describedby="nt-help"
					aria-label="About new timesheets"
					class="flex h-6 w-6 items-center justify-center rounded-full border text-xs font-medium text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					?
				</button>
				<p
					id="nt-help"
					role="tooltip"
					class="pointer-events-none absolute right-0 top-8 z-10 w-72 rounded-md border bg-card p-3 text-left text-xs text-muted-foreground opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
				>
					Hours are seeded from the employee's recorded attendance punches — adjust them afterward
					from the timesheet's row. The sheet is saved as a draft; submit it for review separately.
				</p>
			</div>

			<div class="space-y-2 text-center">
				<div
					class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"
				>
					<svg
						class="h-6 w-6"
						fill="none"
						viewBox="0 0 24 24"
						stroke-width="1.8"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
						/>
					</svg>
				</div>
				<h2 class="text-xl font-bold tracking-tight">New Timesheet</h2>
				<p class="mx-auto max-w-md text-sm text-muted-foreground">
					Pick an employee and a standard pay period.
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
				<PeriodPicker compact />
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
		</div>
	</div>
{/if}
