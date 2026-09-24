<script lang="ts">
	import { enhance } from '$app/forms'
	import Dialog from '$lib/components/ui/Dialog.svelte'
	import Banner from '$lib/components/ui/Banner.svelte'

	type Department = { id: string; name: string }
	type CreateForm = { error?: string } | null | undefined

	let {
		open = $bindable(),
		departments,
		form
	}: { open: boolean; departments: Department[]; form: CreateForm } = $props()

	let creating = $state(false)
	let submitted = $state(false)
	$effect(() => {
		if (open) submitted = false
	})
</script>

<Dialog bind:open title="Create Job Posting" size="lg" scroll>
	<form
		method="POST"
		action="?/create"
		use:enhance={() => {
			creating = true
			submitted = true
			return async ({ update, result }) => {
				await update()
				creating = false
				if (result.type === 'success') open = false
			}
		}}
		class="flex min-h-0 flex-1 flex-col gap-3"
	>
		<h2 class="font-semibold">Create Job Posting</h2>
		<div class="-m-1 min-h-0 flex-1 overflow-y-auto p-1">
			<div class="grid items-start gap-3 sm:grid-cols-2">
				<div>
					<label for="title" class="text-sm font-medium">Job Title</label>
					<input
						id="title"
						name="title"
						required
						class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<div>
					<label for="departmentId" class="text-sm font-medium">Department</label>
					<select
						id="departmentId"
						name="departmentId"
						required
						class="mt-1 flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						{#each departments as dept (dept.id)}
							<option value={dept.id}>{dept.name}</option>
						{/each}
					</select>
				</div>
				<div class="sm:col-span-2">
					<label for="description" class="text-sm font-medium">Description</label>
					<textarea
						id="description"
						name="description"
						required
						rows="4"
						class="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					></textarea>
				</div>
			</div>
		</div>
		<div class="flex flex-wrap items-center justify-end gap-2">
			{#if submitted && form?.error}
				<Banner kind="error" message={form.error} class="min-w-48 flex-1" autoDismiss />
			{/if}
			<button
				type="button"
				onclick={() => (open = false)}
				class="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancel</button
			>
			<button
				type="submit"
				disabled={creating}
				class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
				>{creating ? 'Creating…' : 'Create Draft'}</button
			>
		</div>
	</form>
</Dialog>
