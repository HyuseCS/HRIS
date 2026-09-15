<script lang="ts">
	import { enhance } from '$app/forms'
	import Dialog from '$lib/components/ui/Dialog.svelte'
	import PeriodPicker from '$lib/components/ui/PeriodPicker.svelte'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'

	let { open = $bindable() }: { open: boolean } = $props()

	const openPeriod = submitFeedback({
		onSuccess: () => {
			open = false
		}
	})
</script>

<Dialog bind:open labelledBy="open-period-title" size="wide">
	<h2 id="open-period-title" class="text-lg font-semibold">Open a Payroll Period</h2>
	<form method="POST" action="?/open" use:enhance={openPeriod.enhance} class="mt-4 space-y-4">
		<div class="max-w-sm space-y-1.5">
			<label for="name" class="block text-sm font-medium">Name</label>
			<input
				id="name"
				name="name"
				required
				placeholder="Jul 1–15 2026"
				class="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
		</div>
		<PeriodPicker startName="start" endName="end">
			{#snippet actions()}
				<div class="flex gap-2">
					<button
						type="button"
						onclick={() => (open = false)}
						class="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancel</button
					>
					<button
						type="submit"
						disabled={openPeriod.busy}
						class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
						>{openPeriod.busy ? 'Opening…' : 'Open'}</button
					>
				</div>
			{/snippet}
		</PeriodPicker>
	</form>
</Dialog>
