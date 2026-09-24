<script lang="ts">
	import type { Snippet } from 'svelte'
	import { enhance } from '$app/forms'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
	import { formatShortDate } from '$lib/utils/format'
	import ConfirmButton from '$lib/components/ui/ConfirmButton.svelte'
	import Container from '$lib/components/ui/Container.svelte'
	import type { EmployeeDetailData } from './shared'

	let { data, actionError }: { data: EmployeeDetailData; actionError: Snippet<[string[]]> } =
		$props()

	const employee = $derived(data.employee)

	const DOC_CATEGORIES = [
		{ value: 'CONTRACT', label: 'Contract' },
		{ value: 'GOVERNMENT_ID', label: 'Government ID' },
		{ value: 'RESUME', label: 'Résumé' },
		{ value: 'PAYROLL_FORM', label: 'Payroll Form' },
		{ value: 'EXIT_DOCUMENT', label: 'Exit Document' },
		{ value: 'OTHER', label: 'Other' }
	]
	const catLabel = (v: string) => DOC_CATEGORIES.find((c) => c.value === v)?.label ?? v
	const fmtSize = (b: number) =>
		b < 1024 * 1024
			? `${Math.max(1, Math.round(b / 1024))} KB`
			: `${(b / 1024 / 1024).toFixed(1)} MB`
	const uploadDocument = submitFeedback({ error: null })
</script>

<section class="rounded-lg border bg-card p-6 space-y-4 lg:col-span-2">
	<h2 class="font-semibold">
		Documents <span class="text-xs font-normal text-muted-foreground"
			>(201 file — contracts, IDs, exit docs)</span
		>
	</h2>
	{@render actionError(['uploadDocument', 'deleteDocument'])}

	{#if data.documents.length}
		<Container tone="card" fill={false} flush bodyClass="card-scroll">
			<table class="w-full text-sm">
				<thead class="border-b bg-muted/50">
					<tr>
						<th class="px-3 py-2 text-left font-medium text-muted-foreground">Category</th>
						<th class="px-3 py-2 text-left font-medium text-muted-foreground">Document</th>
						<th class="px-3 py-2 text-right font-medium text-muted-foreground">Size</th>
						<th class="px-3 py-2 text-right font-medium text-muted-foreground">Uploaded</th>
						<th class="px-3 py-2"></th>
					</tr>
				</thead>
				<tbody class="divide-y">
					{#each data.documents as doc (doc.id)}
						<tr class="hover:bg-muted/30">
							<td class="px-3 py-2">{catLabel(doc.category)}</td>
							<td class="px-3 py-2">
								<a
									href="/api/v1/employees/{employee.id}/documents/{doc.id}"
									class="font-medium text-primary hover:underline">{doc.label}</a
								>
								<span class="block text-xs text-muted-foreground">{doc.fileName}</span>
							</td>
							<td class="px-3 py-2 text-right text-muted-foreground">{fmtSize(doc.size)}</td>
							<td class="px-3 py-2 text-right text-muted-foreground"
								>{formatShortDate(doc.uploadedAt)}</td
							>
							<td class="px-3 py-2 text-right">
								<ConfirmButton
									action="?/deleteDocument"
									title="Delete document?"
									message="“{doc.label}” will be permanently removed."
									triggerClass="rounded-md border border-red-500/20 px-3 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10"
								>
									<input type="hidden" name="docId" value={doc.id} />
								</ConfirmButton>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</Container>
	{:else}
		<p class="text-xs text-muted-foreground">No documents uploaded yet.</p>
	{/if}

	<form
		method="POST"
		action="?/uploadDocument"
		enctype="multipart/form-data"
		use:enhance={uploadDocument.enhance}
		class="flex flex-wrap items-end gap-2 border-t pt-3"
	>
		<div class="grid gap-1">
			<label for="doc-category" class="text-xs font-medium text-muted-foreground">Category</label>
			<select
				id="doc-category"
				name="category"
				class="h-8 rounded-md border border-input bg-background px-2 text-xs"
			>
				{#each DOC_CATEGORIES as c (c.value)}<option value={c.value}>{c.label}</option>{/each}
			</select>
		</div>
		<div class="grid gap-1">
			<label for="doc-label" class="text-xs font-medium text-muted-foreground"
				>Label <span class="text-muted-foreground/70">(optional)</span></label
			>
			<input
				id="doc-label"
				name="label"
				type="text"
				placeholder="e.g. 2026 Contract"
				class="h-8 w-44 rounded-md border border-input bg-background px-2 text-xs"
			/>
		</div>
		<div class="grid gap-1">
			<label for="doc-file" class="text-xs font-medium text-muted-foreground"
				>File <span class="text-muted-foreground/70">(PDF/PNG/JPEG, ≤10 MB)</span></label
			>
			<input
				id="doc-file"
				name="file"
				type="file"
				accept="application/pdf,image/png,image/jpeg,image/webp"
				required
				class="text-xs"
			/>
		</div>
		<button
			disabled={uploadDocument.busy}
			class="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
			>{uploadDocument.busy ? 'Uploading…' : 'Upload'}</button
		>
	</form>
</section>
