<script lang="ts">
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	// #108: a double-click would fire two redundant writes of the company row.
	const save = createSubmitGuard()

	// Bind the form to local reactive state so the inputs stay in sync with what
	// the user is typing AND with fresh server data after a save. Using plain
	// `value={data.company.…}` was flaky: after `use:enhance` invalidated the
	// page, the un-edited inputs briefly reflected an intermediate empty state.
	// svelte-ignore state_referenced_locally
	let nameValue = $state(data.company.name)
	// svelte-ignore state_referenced_locally
	let addressValue = $state(data.company.address ?? '')
	// svelte-ignore state_referenced_locally
	let logoUrlValue = $state(data.company.logoUrl ?? '')
	// svelte-ignore state_referenced_locally
	let discordInviteValue = $state(data.company.discordInviteUrl ?? '')

	// After a save the server returns the persisted row; re-sync local state so
	// the inputs show what actually got written (in case anything was normalized).
	$effect(() => {
		nameValue = data.company.name
		addressValue = data.company.address ?? ''
		logoUrlValue = data.company.logoUrl ?? ''
		discordInviteValue = data.company.discordInviteUrl ?? ''
	})
</script>

<svelte:head>
	<title>Company Info — Veent HRIS</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<PageHeader
		title="Company Information"
		description="Appears on payslips, reports, and the org header."
	>
		{#snippet back()}
			<BackButton fallback="/settings" label="Settings" preferFallback />
		{/snippet}
	</PageHeader>

	{#if form?.success}
		<Banner kind="success" message="Company info saved." />
	{/if}
	{#if form?.error}
		<Banner kind="error" message={form.error} />
	{/if}

	<form
		method="POST"
		action="?/save"
		use:enhance={save.enhance}
		class="space-y-4 rounded-lg border bg-card p-6"
	>
		<div class="grid gap-1.5">
			<label for="name" class="text-sm font-medium">Company name</label>
			<input
				id="name"
				name="name"
				type="text"
				bind:value={nameValue}
				required
				class="h-9 rounded-md border border-input bg-background px-3 text-sm"
			/>
		</div>
		<div class="grid gap-1.5">
			<label for="address" class="text-sm font-medium"
				>Address <span class="text-muted-foreground">(optional)</span></label
			>
			<textarea
				id="address"
				name="address"
				rows="2"
				bind:value={addressValue}
				class="rounded-md border border-input bg-background px-3 py-2 text-sm"
			></textarea>
		</div>
		<div class="grid gap-1.5">
			<label for="logoUrl" class="text-sm font-medium"
				>Logo URL <span class="text-muted-foreground">(optional)</span></label
			>
			<input
				id="logoUrl"
				name="logoUrl"
				type="url"
				bind:value={logoUrlValue}
				placeholder="https://…"
				class="h-9 rounded-md border border-input bg-background px-3 text-sm"
			/>
			{#if logoUrlValue}
				<img
					src={logoUrlValue}
					alt="Company logo preview"
					class="mt-2 h-12 w-auto rounded border object-contain"
				/>
			{/if}
		</div>
		<div class="grid gap-1.5">
			<label for="discordInviteUrl" class="text-sm font-medium"
				>Discord invite URL <span class="text-muted-foreground">(optional)</span></label
			>
			<input
				id="discordInviteUrl"
				name="discordInviteUrl"
				type="url"
				bind:value={discordInviteValue}
				placeholder="https://discord.gg/…"
				class="h-9 rounded-md border border-input bg-background px-3 text-sm"
			/>
			<p class="text-xs text-muted-foreground">
				When set, new hires are emailed an invitation to this Discord server during onboarding.
			</p>
		</div>
		<button
			type="submit"
			disabled={save.busy}
			class="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
			>{save.busy ? 'Saving…' : 'Save'}</button
		>
	</form>
</div>
