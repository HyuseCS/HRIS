<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import { formatDate, formatCurrency } from '$lib/utils/format'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { PageData, ActionData } from './$types'
	import Badge from '$lib/components/ui/Badge.svelte'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	// #108: double-submitting the profile update fires redundant writes for the same record.
	const update = createSubmitGuard()

	const emp = $derived(data.employee)

	const CAT_LABELS: Record<string, string> = {
		CONTRACT: 'Contract',
		GOVERNMENT_ID: 'Government ID',
		RESUME: 'Résumé',
		PAYROLL_FORM: 'Payroll Form',
		EXIT_DOCUMENT: 'Exit Document',
		OTHER: 'Other'
	}
	const fmtSize = (b: number) =>
		b < 1024 * 1024
			? `${Math.max(1, Math.round(b / 1024))} KB`
			: `${(b / 1024 / 1024).toFixed(1)} MB`
</script>

<svelte:head>
	<title>My Profile — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader title="My Profile" />

	{#if form?.success}
		<Banner kind="success" message="Profile updated successfully." />
	{/if}

	{#if form?.error}
		<div
			class="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-red-400"
		>
			{form.error}
		</div>
	{/if}

	<div class="grid gap-6 lg:grid-cols-2">
		<!-- Employment Details (read-only) -->
		<section class="card space-y-5">
			<h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
				Employment Details
			</h2>
			<dl class="space-y-4">
				<div class="grid grid-cols-2 gap-4">
					<div>
						<dt class="text-xs text-muted-foreground">Employee Number</dt>
						<dd class="mt-0.5 text-sm font-medium">{emp.employeeNumber}</dd>
					</div>
					<div>
						<dt class="text-xs text-muted-foreground">Job Title</dt>
						<dd class="mt-0.5 text-sm font-medium">{emp.jobTitle}</dd>
					</div>
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div>
						<dt class="text-xs text-muted-foreground">Department</dt>
						<dd class="mt-0.5 text-sm font-medium">{emp.department?.name ?? '—'}</dd>
					</div>
					<div>
						<dt class="text-xs text-muted-foreground">Employment Type</dt>
						<dd class="mt-0.5 text-sm font-medium">{emp.employmentType.replace(/_/g, ' ')}</dd>
					</div>
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div>
						<dt class="text-xs text-muted-foreground">Start Date</dt>
						<dd class="mt-0.5 text-sm font-medium">{formatDate(emp.startDate)}</dd>
					</div>
					<div>
						<dt class="text-xs text-muted-foreground">Reports To</dt>
						<dd class="mt-0.5 text-sm font-medium">
							{#if emp.reportsTo}
								{emp.reportsTo.lastName}, {emp.reportsTo.firstName}
							{:else}
								—
							{/if}
						</dd>
					</div>
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div>
						<dt class="text-xs text-muted-foreground">Email</dt>
						<dd class="mt-0.5 text-sm font-medium">{emp.user.email}</dd>
					</div>
					<div>
						<dt class="text-xs text-muted-foreground">Status</dt>
						<dd class="mt-0.5">
							<Badge status={emp.employmentStatus} domain="employment" />
						</dd>
					</div>
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div>
						<dt class="text-xs text-muted-foreground">Discord</dt>
						<dd class="mt-0.5 text-sm font-medium">
							{#if emp.discordId}
								<span class="badge-green">Linked</span>
							{:else}
								<span class="text-muted-foreground">Not linked — ask HR to add your Discord ID</span
								>
							{/if}
						</dd>
					</div>
				</div>
			</dl>
		</section>

		<!-- Personal & Contact — editable by HR only (#175); read-only for everyone else. -->
		<section class="card space-y-5">
			<h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
				Personal &amp; Contact
			</h2>
			{#if !data.canManage}
				<dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
					<div class="space-y-0.5">
						<dt class="text-xs font-medium text-muted-foreground">First Name</dt>
						<dd>{emp.firstName}</dd>
					</div>
					<div class="space-y-0.5">
						<dt class="text-xs font-medium text-muted-foreground">Last Name</dt>
						<dd>{emp.lastName}</dd>
					</div>
					<div class="space-y-0.5">
						<dt class="text-xs font-medium text-muted-foreground">Phone</dt>
						<dd>{emp.contactPhone ?? '—'}</dd>
					</div>
					<div class="space-y-0.5">
						<dt class="text-xs font-medium text-muted-foreground">Date of Birth</dt>
						<dd>
							{emp.dateOfBirth ? new Date(emp.dateOfBirth).toISOString().slice(0, 10) : '—'}
						</dd>
					</div>
					<div class="col-span-2 space-y-0.5">
						<dt class="text-xs font-medium text-muted-foreground">Address</dt>
						<dd class="whitespace-pre-wrap">{emp.contactAddress ?? '—'}</dd>
					</div>
				</dl>
				<p class="text-xs text-muted-foreground">
					Need a correction? Contact HR — employee details are HR-managed.
				</p>
			{:else}
				<form method="POST" action="?/update" use:enhance={update.enhance} class="space-y-4">
					<div class="grid grid-cols-2 gap-4">
						<div class="space-y-1.5">
							<label for="firstName" class="text-xs font-medium text-muted-foreground"
								>First Name</label
							>
							<input
								id="firstName"
								name="firstName"
								type="text"
								value={emp.firstName}
								class="input"
							/>
						</div>
						<div class="space-y-1.5">
							<label for="lastName" class="text-xs font-medium text-muted-foreground"
								>Last Name</label
							>
							<input id="lastName" name="lastName" type="text" value={emp.lastName} class="input" />
						</div>
					</div>

					<div class="space-y-1.5">
						<label for="contactPhone" class="text-xs font-medium text-muted-foreground">Phone</label
						>
						<input
							id="contactPhone"
							name="contactPhone"
							type="tel"
							value={emp.contactPhone ?? ''}
							class="input"
						/>
					</div>

					<div class="space-y-1.5">
						<label for="contactAddress" class="text-xs font-medium text-muted-foreground"
							>Address</label
						>
						<textarea
							id="contactAddress"
							name="contactAddress"
							rows="2"
							class="input h-auto resize-none py-2">{emp.contactAddress ?? ''}</textarea
						>
					</div>

					<div class="space-y-1.5">
						<label for="dateOfBirth" class="text-xs font-medium text-muted-foreground"
							>Date of Birth</label
						>
						<input
							id="dateOfBirth"
							name="dateOfBirth"
							type="date"
							value={emp.dateOfBirth ? new Date(emp.dateOfBirth).toISOString().slice(0, 10) : ''}
							class="input"
						/>
					</div>

					<div class="pt-2">
						<button
							type="submit"
							disabled={update.busy}
							class="btn-primary disabled:pointer-events-none disabled:opacity-50"
							>{update.busy ? 'Saving…' : 'Save Changes'}</button
						>
					</div>
				</form>
			{/if}
		</section>
	</div>

	<!-- My Time Punches (read-only; recorded via the Discord bot) -->
	<section class="card space-y-4">
		<div class="flex items-baseline justify-between">
			<h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
				My Time Punches
			</h2>
			<span class="text-xs text-muted-foreground">Last {data.punchWindowDays} days</span>
		</div>
		{#if data.punches.length}
			<!-- Punches are already windowed to 14 days by the loader, so this is a ceiling only. -->
			<div class="card-scroll overflow-x-auto rounded-md border">
				<table class="w-full text-sm">
					<thead class="border-b bg-muted/50">
						<tr>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">When (PHT)</th>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Punch</th>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Source</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each data.punches as p (p.id)}
							<tr class="hover:bg-muted/30">
								<td class="px-3 py-2 text-muted-foreground">{p.at}</td>
								<td class="px-3 py-2 font-medium">{p.label}</td>
								<td class="px-3 py-2 text-muted-foreground">{p.source}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="text-xs text-muted-foreground">
				These are your raw clock in/out and break punches. HR aggregates them into your timesheet;
				if something looks wrong, contact HR.
			</p>
		{:else}
			<p class="text-xs text-muted-foreground">
				No punches in the last {data.punchWindowDays} days. Use the Discord bot's <code>/in</code>,
				<code>/out</code>, and <code>/break</code> commands to clock in and out.
			</p>
		{/if}
	</section>

	<!-- My Documents (read-only; HR maintains the 201 file) -->
	<section class="card space-y-4">
		<h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
			My Documents
		</h2>
		{#if data.documents.length}
			<!-- Ceiling only; a person's own documents are few but not bounded. -->
			<div class="card-scroll overflow-x-auto rounded-md border">
				<table class="w-full text-sm">
					<thead class="border-b bg-muted/50">
						<tr>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Category</th>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Document</th>
							<th class="px-3 py-2 text-right font-medium text-muted-foreground">Size</th>
							<th class="px-3 py-2 text-right font-medium text-muted-foreground">Uploaded</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each data.documents as doc (doc.id)}
							<tr class="hover:bg-muted/30">
								<td class="px-3 py-2">{CAT_LABELS[doc.category] ?? doc.category}</td>
								<td class="px-3 py-2">
									<a
										href="/api/v1/employees/{emp.id}/documents/{doc.id}"
										class="font-medium text-primary hover:underline">{doc.label}</a
									>
									<span class="block text-xs text-muted-foreground">{doc.fileName}</span>
								</td>
								<td class="px-3 py-2 text-right text-muted-foreground">{fmtSize(doc.size)}</td>
								<td class="px-3 py-2 text-right text-muted-foreground"
									>{formatDate(doc.uploadedAt)}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p class="text-xs text-muted-foreground">
				No documents on file. HR uploads contracts, IDs, and other records here.
			</p>
		{/if}
	</section>

	<!-- My Benefits (read-only) -->
	<section class="card space-y-4">
		<h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
			My Benefits
		</h2>
		{#if data.benefits.length}
			<!-- Ceiling only; enrolments are config-scale. -->
			<div class="card-scroll overflow-x-auto rounded-md border">
				<table class="w-full text-sm">
					<thead class="border-b bg-muted/50">
						<tr>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Plan</th>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Coverage</th>
							<th class="px-3 py-2 text-right font-medium text-muted-foreground">My Cost</th>
							<th class="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
						</tr>
					</thead>
					<tbody class="divide-y">
						{#each data.benefits as b (b.id)}
							<tr class="hover:bg-muted/30 {b.status === 'ACTIVE' ? '' : 'opacity-60'}">
								<td class="px-3 py-2 font-medium">{b.plan.name}</td>
								<td class="px-3 py-2 text-muted-foreground">{b.plan.type.replace('_', ' ')}</td>
								<td class="px-3 py-2 text-muted-foreground">{b.coverageLevel ?? '—'}</td>
								<td class="px-3 py-2 text-right"
									>{b.plan.employeeCost != null
										? formatCurrency(Number(b.plan.employeeCost))
										: '—'}</td
								>
								<td class="px-3 py-2">
									<Badge status={b.status} domain="benefitEnrollment" />
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<p class="text-xs text-muted-foreground">
				You have no benefit enrollments. HR manages enrollments.
			</p>
		{/if}
	</section>
</div>
