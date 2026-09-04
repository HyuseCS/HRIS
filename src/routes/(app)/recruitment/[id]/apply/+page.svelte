<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	// #108: a double-click here would add the same applicant to the posting twice.
	const apply = createSubmitGuard()
</script>

<svelte:head>
	<title>Add applicant — {data.posting.title} — Veent HRIS</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6 py-8">
	<PageHeader
		title="Add applicant to {data.posting.title}"
		description={data.posting.department?.name}
	/>

	<!-- HR-only form: a successful add redirects to the posting board (see the
	     action), so there is no applicant-facing success panel here. -->
	{#if form?.error}
		<div
			class="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive"
		>
			{form.error}
		</div>
	{/if}

	<form method="POST" action="?/apply" use:enhance={apply.enhance} class="space-y-6">
		<fieldset class="rounded-md border p-4 space-y-4">
			<legend class="px-1 text-sm font-semibold">Personal Information</legend>
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label for="firstName" class="text-sm font-medium">
						First Name <span class="text-destructive">*</span>
					</label>
					<input
						id="firstName"
						name="firstName"
						required
						value={form?.values?.firstName ?? ''}
						class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<div>
					<label for="lastName" class="text-sm font-medium">
						Last Name <span class="text-destructive">*</span>
					</label>
					<input
						id="lastName"
						name="lastName"
						required
						value={form?.values?.lastName ?? ''}
						class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<div>
					<label for="email" class="text-sm font-medium">
						Email Address <span class="text-destructive">*</span>
					</label>
					<input
						id="email"
						name="email"
						type="email"
						required
						value={form?.values?.email ?? ''}
						class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<div>
					<label for="phone" class="text-sm font-medium">Phone Number</label>
					<input
						id="phone"
						name="phone"
						type="tel"
						value={form?.values?.phone ?? ''}
						class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
			</div>
		</fieldset>

		<fieldset class="rounded-md border p-4 space-y-4">
			<legend class="px-1 text-sm font-semibold">Application Details</legend>
			<div class="space-y-4">
				<div>
					<label for="resumeUrl" class="text-sm font-medium">Resume URL</label>
					<input
						id="resumeUrl"
						name="resumeUrl"
						type="url"
						placeholder="https://drive.google.com/..."
						value={form?.values?.resumeUrl ?? ''}
						class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
					<p class="mt-1 text-xs text-muted-foreground">
						Link to your resume (Google Drive, Dropbox, etc.)
					</p>
				</div>
				<div>
					<label for="coverLetter" class="text-sm font-medium">Cover Letter</label>
					<textarea
						id="coverLetter"
						name="coverLetter"
						rows="6"
						class="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>{form?.values?.coverLetter ?? ''}</textarea
					>
				</div>
			</div>
		</fieldset>

		<div class="flex justify-end gap-3">
			<a
				href="/recruitment/{data.posting.id}"
				class="rounded-md border px-4 py-2 text-sm hover:bg-accent"
			>
				Cancel
			</a>
			<button
				type="submit"
				disabled={apply.busy}
				class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
			>
				{apply.busy ? 'Adding…' : 'Add applicant'}
			</button>
		</div>
	</form>
</div>
