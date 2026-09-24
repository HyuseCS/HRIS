<script module lang="ts">
	export const CATEGORY_LABELS: Record<string, string> = {
		CLASSIFICATION: 'Employment classification',
		ATTENDANCE: 'Attendance',
		CONDUCT: 'Conduct',
		PERFORMANCE: 'Performance',
		OTHER: 'Other'
	}
</script>

<script lang="ts">
	import { enhance } from '$app/forms'
	import Dialog from '$lib/components/ui/Dialog.svelte'
	import Banner from '$lib/components/ui/Banner.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'

	type Employee = { id: string; firstName: string; lastName: string; employeeNumber: string }
	type CreateForm =
		| {
				error?: string
				fieldErrors?: Record<string, string[]>
				values?: Record<string, string>
		  }
		| null
		| undefined

	let {
		open = $bindable(),
		employees,
		categories,
		form
	}: { open: boolean; employees: Employee[]; categories: string[]; form: CreateForm } = $props()

	let submitted = $state(false)
	$effect(() => {
		if (open) submitted = false
	})

	const guard = createSubmitGuard(() => {
		submitted = true
		return async ({ update, result }) => {
			await update()
			if (result.type === 'success') open = false
		}
	})

	// Red-border the specific field(s) the server rejected, and repopulate the values a failed
	// submit sent back (#142). `values`/`fieldErrors` only ride along on the fail() branch.
	const fe = (name: string) => (submitted ? form?.fieldErrors?.[name]?.[0] : undefined)
	const invalid = (name: string) => (fe(name) ? true : undefined)
	const values = $derived(form?.values)
</script>

<Dialog bind:open title="Open a new inquiry" size="lg" scroll>
	<form
		method="POST"
		action="?/open"
		use:enhance={guard.enhance}
		class="flex min-h-0 flex-1 flex-col gap-4"
	>
		<h2 class="font-semibold">Open a new inquiry</h2>
		<div class="-m-1 min-h-0 flex-1 space-y-4 overflow-y-auto p-1">
			<div class="grid items-start gap-4 sm:grid-cols-2">
				<div>
					<label for="employeeId" class="text-sm font-medium"
						>Employee <span class="text-destructive">*</span></label
					>
					<select
						id="employeeId"
						name="employeeId"
						aria-invalid={invalid('employeeId')}
						required
						class="mt-1 flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<option value="">Select employee…</option>
						{#each employees as emp (emp.id)}
							<option value={emp.id} selected={values?.employeeId === emp.id}>
								{emp.lastName}, {emp.firstName} ({emp.employeeNumber})
							</option>
						{/each}
					</select>
					{#if fe('employeeId')}<p class="mt-1 text-xs text-red-600">{fe('employeeId')}</p>{/if}
				</div>
				<div>
					<label for="category" class="text-sm font-medium"
						>Category <span class="text-destructive">*</span></label
					>
					<select
						id="category"
						name="category"
						class="mt-1 flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{#each categories as cat (cat)}
							<option value={cat} selected={(values?.category ?? 'OTHER') === cat}>
								{CATEGORY_LABELS[cat] ?? cat}
							</option>
						{/each}
					</select>
					{#if fe('category')}<p class="mt-1 text-xs text-red-600">{fe('category')}</p>{/if}
				</div>
			</div>
			<div>
				<label for="subject" class="text-sm font-medium"
					>Subject <span class="text-destructive">*</span></label
				>
				<input
					id="subject"
					name="subject"
					aria-invalid={invalid('subject')}
					required
					maxlength="200"
					value={values?.subject ?? ''}
					placeholder="e.g. Confirm your employment classification"
					class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				/>
				{#if fe('subject')}<p class="mt-1 text-xs text-red-600">{fe('subject')}</p>{/if}
			</div>
			<div>
				<label for="message" class="text-sm font-medium"
					>Message <span class="text-destructive">*</span></label
				>
				<textarea
					id="message"
					name="message"
					aria-invalid={invalid('message')}
					required
					rows="4"
					value={values?.message ?? ''}
					placeholder="Describe the question or concern for the employee to respond to."
					class="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				></textarea>
				{#if fe('message')}<p class="mt-1 text-xs text-red-600">{fe('message')}</p>{/if}
			</div>
		</div>
		<div class="flex flex-wrap items-center gap-3">
			<button
				type="submit"
				disabled={guard.busy}
				class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
			>
				{guard.busy ? 'Opening…' : 'Open inquiry'}
			</button>
			{#if submitted && form?.error}
				<Banner kind="error" message={form.error} class="min-w-48 flex-1" autoDismiss />
			{/if}
		</div>
	</form>
</Dialog>
