<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import DatePicker from '$lib/components/ui/DatePicker.svelte'
	import Container from '$lib/components/ui/Container.svelte'
	import Field from '$lib/components/ui/Field.svelte'
	import { enhance } from '$app/forms'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import {
		rateBasisOptionsFor,
		rateBasisCopy,
		isRateBasisAllowed,
		type RateBasis
	} from '$lib/utils/rate-basis'
	import { EMPLOYMENT_TYPE_OPTIONS } from '$lib/utils/employment-type'
	// Placeholders come from the same table the server validates against, so the example HR
	// sees can never disagree with what is accepted (#191).
	import { GOV_ID_FORMATS } from '$lib/utils/gov-ids'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	// #108: a double-click here would create a duplicate employee + user + welcome email.
	const create = createSubmitGuard()

	// PROBATIONARY first so it is the browser's default selection (#136). Shared with the promote
	// form (#222) so the labels cannot drift apart.
	const EMPLOYMENT_TYPES = EMPLOYMENT_TYPE_OPTIONS

	// #120: the amount field means different things per basis, so its label follows the selection.
	// Re-seeded from `form` so a failed submit redisplays the basis HR actually chose.
	let rateType = $state<RateBasis>('MONTHLY')
	$effect(() => {
		rateType = (form?.values?.rateType as RateBasis) ?? 'MONTHLY'
	})
	const rate = $derived(rateBasisCopy(rateType))

	// Red-border the specific field(s) the server rejected (#142).
	const invalid = (name: string) =>
		(form as { fieldErrors?: Record<string, string[]> } | null)?.fieldErrors?.[name]
			? true
			: undefined

	// The "Complete later" disclosure hides 11 optional fields, so a server rejection inside it
	// would otherwise render in a collapsed container — a silent failure. Open it in that case.
	const OPTIONAL_FIELDS = [
		'sssNumber',
		'philhealthNumber',
		'pagibigNumber',
		'tinNumber',
		'emergencyContactName',
		'emergencyContactRelation',
		'emergencyContactPhone',
		'bankName',
		'bankAccountName',
		'bankAccountNumber',
		'gcashNumber'
	]
	const optionalHasError = $derived(OPTIONAL_FIELDS.some((f) => invalid(f)))
	const FIELD_ORDER = [
		'firstName',
		'lastName',
		'middleName',
		'contactPhone',
		'contactAddress',
		'email',
		'password',
		'role',
		'discordId',
		'departmentId',
		'jobTitle',
		'employmentType',
		'startDate',
		'rateType',
		'basicMonthlySalary',
		'reportsToId',
		'positionId',
		'workScheduleId',
		...OPTIONAL_FIELDS
	]
	const errorCount = $derived(
		Object.keys((form as { fieldErrors?: Record<string, string[]> } | null)?.fieldErrors ?? {})
			.length
	)
	const firstErrorField = $derived(FIELD_ORDER.find((f) => invalid(f)))

	// #188: new hires start on probation.
	let employmentType = $state('PROBATIONARY')
	$effect(() => {
		employmentType = (form?.values?.employmentType as string) ?? 'PROBATIONARY'
	})

	// #189: hourly applies only to part-time and on-call, so the list follows the employment
	// type. The server refuses the pairing too — this only keeps HR from picking a combination
	// that would bounce back.
	const rateOptions = $derived(rateBasisOptionsFor(employmentType))
	// Switching to a type that cannot be hourly must not leave a now-invalid basis selected.
	$effect(() => {
		if (!isRateBasisAllowed(rateType, employmentType)) rateType = 'MONTHLY'
	})
</script>

<svelte:head>
	<title>New Employee — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader title="Onboard New Employee">
		{#snippet back()}
			<a href="/employees" class="rounded-md border px-4 py-2 text-sm hover:bg-accent">Cancel</a>
		{/snippet}
	</PageHeader>

	{#if form?.error}
		<div
			class="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive"
		>
			{typeof form.error === 'string' ? form.error : 'Please fix the errors below.'}
		</div>
	{/if}

	<!-- Remount the whole form when the active org changes (org switcher). Otherwise the
	     org-scoped selects reload for the new tenant while the typed fields linger, silently
	     blanking the required Department field and wedging submit (#ceo-switch). -->
	{#key data.organizationId}
		<form
			method="POST"
			action="?/create"
			use:enhance={create.enhance}
			class="grid items-start gap-8 2xl:grid-cols-[minmax(0,1fr)_16rem]"
		>
			<div class="space-y-8">
				<h2 class="text-sm font-semibold text-muted-foreground">Required to hire</h2>

				<!-- Personal Information -->
				<fieldset
					id="sec-personal"
					class="scroll-mt-8 rounded-lg border bg-card p-6 space-y-4 [&>legend+*]:clear-left"
				>
					<legend class="float-left mb-4 w-full font-semibold">Personal Information</legend>
					<div class="grid gap-4 sm:grid-cols-3">
						<Field
							label="First Name"
							id="firstName"
							required
							error={form?.fieldErrors?.firstName?.[0]}
						>
							{#snippet children(a)}
								<input
									{...a}
									id="firstName"
									name="firstName"
									required
									value={form?.values?.firstName ?? ''}
									class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								/>
							{/snippet}
						</Field>
						<Field
							label="Last Name"
							id="lastName"
							required
							error={form?.fieldErrors?.lastName?.[0]}
						>
							{#snippet children(a)}
								<input
									{...a}
									id="lastName"
									name="lastName"
									required
									value={form?.values?.lastName ?? ''}
									class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								/>
							{/snippet}
						</Field>
						<Field label="Middle Name" id="middleName" error={form?.fieldErrors?.middleName?.[0]}>
							{#snippet children(a)}
								<input
									{...a}
									id="middleName"
									name="middleName"
									value={form?.values?.middleName ?? ''}
									class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								/>
							{/snippet}
						</Field>
					</div>
				</fieldset>

				<!-- Contact Information -->
				<fieldset
					id="sec-contact"
					class="scroll-mt-8 rounded-lg border bg-card p-6 space-y-4 [&>legend+*]:clear-left"
				>
					<legend class="float-left mb-4 w-full font-semibold">Contact Information</legend>
					<div class="grid gap-4 sm:grid-cols-2">
						<Field label="Phone" id="contactPhone" error={form?.fieldErrors?.contactPhone?.[0]}>
							{#snippet children(a)}
								<input
									{...a}
									id="contactPhone"
									name="contactPhone"
									type="tel"
									value={form?.values?.contactPhone ?? ''}
									class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								/>
							{/snippet}
						</Field>
						<Field
							label="Address"
							id="contactAddress"
							error={form?.fieldErrors?.contactAddress?.[0]}
						>
							{#snippet children(a)}
								<input
									{...a}
									id="contactAddress"
									name="contactAddress"
									value={form?.values?.contactAddress ?? ''}
									class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								/>
							{/snippet}
						</Field>
					</div>
				</fieldset>

				<!-- Account -->
				<fieldset
					id="sec-account"
					class="scroll-mt-8 rounded-lg border bg-card p-6 space-y-4 [&>legend+*]:clear-left"
				>
					<legend class="float-left mb-4 w-full font-semibold">Account</legend>
					<div class="grid gap-4 sm:grid-cols-2">
						<Field label="Email" id="email" required error={form?.fieldErrors?.email?.[0]}>
							{#snippet children(a)}
								<input
									{...a}
									id="email"
									name="email"
									type="email"
									required
									value={form?.values?.email ?? ''}
									class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								/>
							{/snippet}
						</Field>
						<Field
							label="Password"
							id="password"
							hint="If left blank, a temporary password will be generated and emailed."
							error={form?.fieldErrors?.password?.[0]}
						>
							{#snippet children(a)}
								<input
									{...a}
									id="password"
									name="password"
									type="password"
									placeholder="Leave blank to auto-generate"
									class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								/>
							{/snippet}
						</Field>
						<Field label="Role" id="role" required error={form?.fieldErrors?.role?.[0]}>
							{#snippet children(a)}
								<select
									{...a}
									id="role"
									name="role"
									class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<!-- Mirrors HIRE_ROLES in $lib/rbac — the server rejects anything else (#248). -->
									<option value="EMPLOYEE">Employee</option>
									<option value="MANAGER">Manager</option>
									<option value="HR_ADMIN">HR Admin</option>
								</select>
							{/snippet}
						</Field>
						<Field
							label="Discord ID"
							id="discordId"
							hint="Links this employee to the Discord time-tracking bot. In Discord: Developer Mode → right-click the user → Copy User ID. Optional — can be set later."
							error={form?.fieldErrors?.discordId?.[0]}
						>
							{#snippet children(a)}
								<input
									{...a}
									id="discordId"
									name="discordId"
									value={form?.values?.discordId ?? ''}
									class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								/>
							{/snippet}
						</Field>
					</div>
				</fieldset>

				<!-- Employment -->
				<fieldset
					id="sec-employment"
					class="scroll-mt-8 rounded-lg border bg-card p-6 space-y-4 [&>legend+*]:clear-left"
				>
					<legend class="float-left mb-4 w-full font-semibold">Employment Details</legend>
					<div class="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
						<Field
							label="Department"
							id="departmentId"
							required
							error={form?.fieldErrors?.departmentId?.[0]}
						>
							{#snippet children(a)}
								<select
									{...a}
									id="departmentId"
									name="departmentId"
									required
									class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<option value="">Select department…</option>
									{#each data.departments as dept (dept.id)}
										<option value={dept.id}>{dept.name}</option>
									{/each}
								</select>
							{/snippet}
						</Field>
						<Field
							label="Job Title"
							id="jobTitle"
							required
							error={form?.fieldErrors?.jobTitle?.[0]}
						>
							{#snippet children(a)}
								<input
									{...a}
									id="jobTitle"
									name="jobTitle"
									required
									value={form?.values?.jobTitle ?? ''}
									class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								/>
							{/snippet}
						</Field>
						<Field
							label="Employment Type"
							id="employmentType"
							required
							error={form?.fieldErrors?.employmentType?.[0]}
						>
							{#snippet children(a)}
								<select
									{...a}
									id="employmentType"
									name="employmentType"
									bind:value={employmentType}
									class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<!-- New hires start probationary (#136); regularization is automatic at 6 months.
								     `selected` also repopulates the choice after a failed submit, which the bare
								     options did not do. -->
									{#each EMPLOYMENT_TYPES as [val, label] (val)}
										<option
											value={val}
											selected={(form?.values?.employmentType ?? 'PROBATIONARY') === val}
											>{label}</option
										>
									{/each}
								</select>
							{/snippet}
						</Field>
						<Field
							label="Start Date"
							id="startDate"
							required
							error={form?.fieldErrors?.startDate?.[0]}
						>
							{#snippet children(a)}
								<DatePicker
									{...a}
									id="startDate"
									name="startDate"
									required
									value={form?.values?.startDate ?? ''}
									class="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								/>
							{/snippet}
						</Field>
						<Field
							label="Rate Basis"
							id="rateType"
							required
							error={form?.fieldErrors?.rateType?.[0]}
						>
							{#snippet children(a)}
								<select
									{...a}
									id="rateType"
									name="rateType"
									bind:value={rateType}
									class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									{#each rateOptions as opt (opt.value)}
										<option value={opt.value}>{opt.label}</option>
									{/each}
								</select>
							{/snippet}
						</Field>
						<Field
							label={rate.label}
							id="basicMonthlySalary"
							required
							hint={rate.hint}
							error={form?.fieldErrors?.basicMonthlySalary?.[0]}
						>
							{#snippet children(a)}
								<input
									{...a}
									id="basicMonthlySalary"
									name="basicMonthlySalary"
									type="number"
									min="0"
									step={rate.step}
									required
									value={form?.values?.basicMonthlySalary ?? ''}
									class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								/>
							{/snippet}
						</Field>
						<Field label="Reports To" id="reportsToId" error={form?.fieldErrors?.reportsToId?.[0]}>
							{#snippet children(a)}
								<select
									{...a}
									id="reportsToId"
									name="reportsToId"
									class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<option value="">None</option>
									{#each data.employees as emp (emp.id)}
										<option value={emp.id}>{emp.lastName}, {emp.firstName}</option>
									{/each}
								</select>
							{/snippet}
						</Field>
						<Field label="Position" id="positionId" error={form?.fieldErrors?.positionId?.[0]}>
							{#snippet children(a)}
								<select
									{...a}
									id="positionId"
									name="positionId"
									class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<option value="">None</option>
									{#each data.positions as pos (pos.id)}
										<option value={pos.id} selected={form?.values?.positionId === pos.id}
											>{pos.title}</option
										>
									{/each}
								</select>
							{/snippet}
						</Field>
						<Field
							label="Work Schedule"
							id="workScheduleId"
							hint="Attendance derivation uses this schedule — set it now or the new hire's days won't compute until it's assigned."
							error={form?.fieldErrors?.workScheduleId?.[0]}
						>
							{#snippet children(a)}
								<select
									{...a}
									id="workScheduleId"
									name="workScheduleId"
									class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<option value="">None</option>
									{#each data.workSchedules as ws (ws.id)}
										<option
											value={ws.id}
											selected={form?.values?.workScheduleId
												? form.values.workScheduleId === ws.id
												: ws.isDefault}>{ws.name}</option
										>
									{/each}
								</select>
							{/snippet}
						</Field>
					</div>
				</fieldset>

				<Container tone="card" fill={false} flush>
					<details open={optionalHasError}>
						<summary class="cursor-pointer px-4 py-3 text-sm font-semibold"
							>Complete later — 11 optional fields</summary
						>
						<div class="space-y-8 border-t p-4">
							<p class="text-sm text-muted-foreground">
								You can save these now or add them to the 201 file after the employee is created.
							</p>

							<!-- Government IDs -->
							<fieldset class="rounded-lg border bg-card p-6 space-y-4 [&>legend+*]:clear-left">
								<legend class="float-left mb-4 w-full font-semibold">Government IDs</legend>
								<div class="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
									<Field
										label="SSS Number"
										id="sssNumber"
										error={form?.fieldErrors?.sssNumber?.[0]}
									>
										{#snippet children(a)}
											<input
												{...a}
												id="sssNumber"
												name="sssNumber"
												value={form?.values?.sssNumber ?? ''}
												placeholder={GOV_ID_FORMATS.sssNumber.example}
												class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											/>
										{/snippet}
									</Field>
									<Field
										label="PhilHealth Number"
										id="philhealthNumber"
										error={form?.fieldErrors?.philhealthNumber?.[0]}
									>
										{#snippet children(a)}
											<input
												{...a}
												id="philhealthNumber"
												name="philhealthNumber"
												value={form?.values?.philhealthNumber ?? ''}
												placeholder={GOV_ID_FORMATS.philhealthNumber.example}
												class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											/>
										{/snippet}
									</Field>
									<Field
										label="Pag-IBIG Number"
										id="pagibigNumber"
										error={form?.fieldErrors?.pagibigNumber?.[0]}
									>
										{#snippet children(a)}
											<input
												{...a}
												id="pagibigNumber"
												name="pagibigNumber"
												value={form?.values?.pagibigNumber ?? ''}
												placeholder={GOV_ID_FORMATS.pagibigNumber.example}
												class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											/>
										{/snippet}
									</Field>
									<Field
										label="TIN Number"
										id="tinNumber"
										error={form?.fieldErrors?.tinNumber?.[0]}
									>
										{#snippet children(a)}
											<input
												{...a}
												id="tinNumber"
												name="tinNumber"
												value={form?.values?.tinNumber ?? ''}
												placeholder={GOV_ID_FORMATS.tinNumber.example}
												class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											/>
										{/snippet}
									</Field>
								</div>
							</fieldset>

							<!-- Emergency Contact -->
							<fieldset class="rounded-lg border bg-card p-6 space-y-4 [&>legend+*]:clear-left">
								<legend class="float-left mb-4 w-full font-semibold">Emergency Contact</legend>
								<div class="grid gap-4 sm:grid-cols-3">
									<Field
										label="Contact Name"
										id="emergencyContactName"
										error={form?.fieldErrors?.emergencyContactName?.[0]}
									>
										{#snippet children(a)}
											<input
												{...a}
												id="emergencyContactName"
												name="emergencyContactName"
												value={form?.values?.emergencyContactName ?? ''}
												class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											/>
										{/snippet}
									</Field>
									<Field
										label="Relationship"
										id="emergencyContactRelation"
										error={form?.fieldErrors?.emergencyContactRelation?.[0]}
									>
										{#snippet children(a)}
											<input
												{...a}
												id="emergencyContactRelation"
												name="emergencyContactRelation"
												value={form?.values?.emergencyContactRelation ?? ''}
												placeholder="e.g. Spouse, Parent"
												class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											/>
										{/snippet}
									</Field>
									<Field
										label="Contact Phone"
										id="emergencyContactPhone"
										error={form?.fieldErrors?.emergencyContactPhone?.[0]}
									>
										{#snippet children(a)}
											<input
												{...a}
												id="emergencyContactPhone"
												name="emergencyContactPhone"
												value={form?.values?.emergencyContactPhone ?? ''}
												class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											/>
										{/snippet}
									</Field>
								</div>
							</fieldset>

							<!-- Bank / GCash Details -->
							<fieldset class="rounded-lg border bg-card p-6 space-y-4 [&>legend+*]:clear-left">
								<legend class="float-left mb-4 w-full font-semibold">Bank / GCash Details</legend>
								<div class="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
									<Field label="Bank" id="bankName" error={form?.fieldErrors?.bankName?.[0]}>
										{#snippet children(a)}
											<input
												{...a}
												id="bankName"
												name="bankName"
												value={form?.values?.bankName ?? ''}
												placeholder="e.g. BDO, BPI"
												class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											/>
										{/snippet}
									</Field>
									<Field
										label="Account Name"
										id="bankAccountName"
										error={form?.fieldErrors?.bankAccountName?.[0]}
									>
										{#snippet children(a)}
											<input
												{...a}
												id="bankAccountName"
												name="bankAccountName"
												value={form?.values?.bankAccountName ?? ''}
												class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											/>
										{/snippet}
									</Field>
									<Field
										label="Account Number"
										id="bankAccountNumber"
										error={form?.fieldErrors?.bankAccountNumber?.[0]}
									>
										{#snippet children(a)}
											<input
												{...a}
												id="bankAccountNumber"
												name="bankAccountNumber"
												value={form?.values?.bankAccountNumber ?? ''}
												placeholder={GOV_ID_FORMATS.bankAccountNumber.example}
												class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											/>
										{/snippet}
									</Field>
									<Field
										label="GCash Number"
										id="gcashNumber"
										error={form?.fieldErrors?.gcashNumber?.[0]}
									>
										{#snippet children(a)}
											<input
												{...a}
												id="gcashNumber"
												name="gcashNumber"
												value={form?.values?.gcashNumber ?? ''}
												placeholder={GOV_ID_FORMATS.gcashNumber.example}
												class="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
											/>
										{/snippet}
									</Field>
								</div>
							</fieldset>
						</div>
					</details>
				</Container>
			</div>

			<aside class="space-y-4 2xl:sticky 2xl:top-8">
				{#if errorCount > 0 && firstErrorField}
					<div class="rounded-lg border border-destructive bg-destructive/10 p-3">
						<p class="text-sm font-medium text-destructive">
							{errorCount} field{errorCount === 1 ? '' : 's'} need attention
						</p>
						<a
							href="#{firstErrorField}"
							onclick={(e) => {
								e.preventDefault()
								const el = document.getElementById(firstErrorField)
								el?.scrollIntoView({ block: 'center' })
								el?.focus()
							}}
							class="mt-1 inline-block rounded text-xs text-destructive underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						>
							Go to the first one
						</a>
					</div>
				{/if}

				<nav aria-label="Form sections" class="rounded-lg border bg-card p-2">
					<ul class="flex flex-wrap gap-1 text-sm 2xl:block 2xl:space-y-0.5">
						<li>
							<a
								href="#sec-personal"
								class="block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>Personal Information</a
							>
						</li>
						<li>
							<a
								href="#sec-contact"
								class="block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>Contact Information</a
							>
						</li>
						<li>
							<a
								href="#sec-account"
								class="block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>Account</a
							>
						</li>
						<li>
							<a
								href="#sec-employment"
								class="block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>Employment Details</a
							>
						</li>
					</ul>
				</nav>

				<button
					type="submit"
					disabled={create.busy}
					class="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
				>
					{create.busy ? 'Creating…' : 'Create Employee'}
				</button>
			</aside>
		</form>
	{/key}
</div>
