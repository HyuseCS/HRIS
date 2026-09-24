<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { enhance } from '$app/forms'
	import Banner from '$lib/components/ui/Banner.svelte'
	import { scrollToError } from '$lib/actions/scrollToError'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import DatePicker from '$lib/components/ui/DatePicker.svelte'
	import type { PageData, ActionData } from './$types'
	import Badge from '$lib/components/ui/Badge.svelte'
	import { page } from '$app/stores'
	import EmployeeTabs from '$lib/components/employees/EmployeeTabs.svelte'
	import { resolveTab } from '$lib/components/employees/employee-tabs'
	import { LIST_RENDER_CAP } from '$lib/components/employees/detail/shared'
	import DocumentsCard from '$lib/components/employees/detail/DocumentsCard.svelte'
	import PromoteCard from '$lib/components/employees/detail/PromoteCard.svelte'
	import ChangeSalaryCard from '$lib/components/employees/detail/ChangeSalaryCard.svelte'
	import DeductionsCard from '$lib/components/employees/detail/DeductionsCard.svelte'
	import AllowancesCard from '$lib/components/employees/detail/AllowancesCard.svelte'
	import LoansCard from '$lib/components/employees/detail/LoansCard.svelte'
	import EmergencyContactsCard from '$lib/components/employees/detail/EmergencyContactsCard.svelte'
	import UpdateProfileCard from '$lib/components/employees/detail/UpdateProfileCard.svelte'
	import DisbursementCard from '$lib/components/employees/detail/DisbursementCard.svelte'
	import GovIdsCard from '$lib/components/employees/detail/GovIdsCard.svelte'
	import ProfileCard from '$lib/components/employees/detail/ProfileCard.svelte'
	import OnboardingCard from '$lib/components/employees/detail/OnboardingCard.svelte'
	import EvalTemplateCard from '$lib/components/employees/detail/EvalTemplateCard.svelte'
	import SupervisorsCard from '$lib/components/employees/detail/SupervisorsCard.svelte'
	import EmploymentHistoryCard from '$lib/components/employees/detail/EmploymentHistoryCard.svelte'
	import BenefitsCard from '$lib/components/employees/detail/BenefitsCard.svelte'
	import LeaveBalancesCard from '$lib/components/employees/detail/LeaveBalancesCard.svelte'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	// The five sections of the 201 file are URL-backed (`?tab=`), so a deep link and the browser's
	// Back button both work. Panels are always rendered and hidden with the attribute AND the
	// class — never `{#if}`, which would discard anything typed into an inactive tab's form.
	const activeTab = $derived(resolveTab($page.state.tab ?? $page.url.searchParams.get('tab')))

	// Reactive: after a form action re-runs `load`, these must reflect the fresh data
	// (a plain destructure would stay stale until a full page refresh).
	const employee = $derived(data.employee)
	const canManage = $derived(data.canManage)
	// #111: every sensitive field (gov IDs, salary, bank/GCash) arrives masked from the load.
	// The full values exist client-side only after the audited ?/reveal action.
	//
	// Phase 07 (owner-accepted): a reveal now HOLDS across a save instead of dropping back to
	// masked on the next action result — HR had to re-reveal (and re-audit) after every edit.
	// The exposure window is wider by design, and bounded: the cache lives until a reload or a
	// navigation, and it is KEYED TO THE EMPLOYEE. That key is not cosmetic. SvelteKit reuses
	// this component across employees/A → employees/B, so an unkeyed cache would paint A's
	// plaintext IDs, bank number and salary into B's editable inputs — and a save on B would
	// write A's data onto B. Never write this cache from a non-reveal payload, and never put it
	// in sessionStorage/localStorage/$page.state (shallow-routing state lands in browser history).
	// No second reveal call and no second audit row: this only holds what ?/reveal already returned.
	type FormResult = NonNullable<ActionData>
	let revealCache = $state<{
		id: string
		revealed: FormResult['revealed']
		history: PageData['history']
	} | null>(null)
	$effect(() => {
		const f = form as FormResult | null
		if (f?.action === 'reveal' && f.revealed)
			revealCache = {
				id: data.employee.id,
				revealed: f.revealed,
				history: f.history ?? data.history
			}
	})
	const revealed = $derived(
		revealCache && revealCache.id === data.employee.id ? revealCache.revealed : null
	)
	// #290: the Employment History panel's salary figures arrive masked from the load and are
	// released by the same ?/reveal, which returns the unmasked timeline alongside `revealed`.
	const history = $derived(
		revealCache && revealCache.id === data.employee.id ? revealCache.history : data.history
	)

	// Effective date is lower-bounded at the hire date; today is the default. Backdating and
	// future-dating are both allowed (the cache heals on read — no scheduler).
	const todayInput = new Date().toISOString().slice(0, 10)
	const hireInput = $derived(new Date(employee.startDate).toISOString().slice(0, 10))

	// #108: every mutating form here is a duplicate-row risk on a double-click — duplicate
	// contacts, loans, cash advances, recurring earnings/deductions, uploaded documents, or a
	// second offboard/reveal. One guard per form; the per-row forms share the guard for their
	// action, which is fine because those rows submit one at a time.
	//
	// `error: null`: each card renders its own failure, so an error toast would repeat it. Other
	// pages keep the toast — theirs can sit below the fold. Success toasts are unaffected.
	const reveal = submitFeedback({ error: null })
	const offboard = submitFeedback({ error: null, success: null })
	// P0-7: this page has 24 actions and used to have ONE ungated error slot, itself inside a card
	// that is hidden for an offboarded employee — so a failed document upload or loan add rendered
	// nowhere at all. Every card now answers only for its own actions.
	function errorFor(names: string[]): string | null {
		const f = form as { action?: string; error?: unknown } | null
		return f && names.includes(f.action ?? '') && typeof f.error === 'string' ? f.error : null
	}

	const DONE: Record<string, string> = {
		setSupervisors: 'Supervisors saved.',
		addLoan: 'Loan added.',
		addCashAdvance: 'Cash advance added.',
		addEarning: 'Earning added.',
		endEarning: 'Earning ended.',
		addDeduction: 'Deduction added.',
		endDeduction: 'Deduction ended.',
		toggleStatutoryExemption: 'Statutory exemption updated.',
		toggleEmployerShareExternal: 'Employer share updated.',
		setStatutoryAllocation: 'Statutory allocation saved.',
		addEmergencyContact: 'Emergency contact added.',
		deleteEmergencyContact: 'Emergency contact removed.',
		uploadDocument: 'Document uploaded.',
		deleteDocument: 'Document deleted.',
		toggleOnboardingStep: 'Onboarding step updated.'
	}
	// Success feedback for the actions that render no success of their own. Errors are
	// handled per card by `actionError`; this is only the success half, kept from the
	// phase 03 remediation because most of these actions return `success: true` with no
	// message for submitFeedback's toast to read.
	const savedNotice = $derived(form?.success ? (DONE[form.action as string] ?? null) : null)

	// Offboarding disables a person's employment record and their login, so it confirms first. The
	// form keeps its own `use:enhance` and busy gating: the Last Day field is typed by the user and
	// cannot move into ConfirmButton's own form. `reportValidity()` runs before the dialog opens so
	// a missing Last Day is refused where the user is looking, not after they confirm.
	let offboardFormEl = $state<HTMLFormElement>()
	let offboardConfirm = $state(false)
	function openOffboardConfirm() {
		if (offboardFormEl?.reportValidity()) offboardConfirm = true
	}
</script>

{#snippet truncated(total: number)}
	{#if total > LIST_RENDER_CAP}
		<p class="text-xs text-muted-foreground">
			Showing the first {LIST_RENDER_CAP} of {total}.
		</p>
	{/if}
{/snippet}

{#snippet actionError(names: string[])}
	{@const message = errorFor(names)}
	{#if message}
		<!-- Addendum §F. This file is the longest page in the app, so a scoped error can land
		     several screens away from wherever the person pressed Save. The wrapper exists only to
		     carry the action — Banner is phase 03's component and this phase does not edit it. -->
		<div use:scrollToError>
			<Banner kind="error" {message} />
		</div>
	{/if}
{/snippet}

<svelte:head>
	<title>{employee.lastName}, {employee.firstName} — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader title="{employee.lastName}, {employee.firstName}">
		{#snippet badge()}
			<Badge status={employee.employmentStatus} domain="employment" />
		{/snippet}
		{#snippet back()}
			<BackButton
				fallback={canManage ? '/employees' : '/team'}
				label={canManage ? 'Employees' : 'Team'}
			/>
		{/snippet}
	</PageHeader>

	{#if savedNotice}
		<Banner kind="success" message={savedNotice} />
	{/if}

	<EmployeeTabs active={activeTab} />

	<div
		id="panel-overview"
		role="tabpanel"
		aria-labelledby="tab-overview"
		tabindex="-1"
		hidden={activeTab !== 'overview'}
		class:hidden={activeTab !== 'overview'}
	>
		<div class="grid gap-6 lg:grid-cols-2">
			<!-- Onboarding checklist (HR-only, T178) -->
			{#if canManage && data.onboarding}
				<OnboardingCard {data} {actionError} />
			{/if}

			<!-- Profile Card -->
			<ProfileCard {data} {revealed} {reveal} />

			<!-- Government IDs Card (HR-only) -->
			{#if canManage}
				<GovIdsCard {data} {revealed} {reveal} />

				<!-- Disbursement details Card (sensitive, HR-only; numbers masked — #54) -->
				<DisbursementCard {data} {revealed} {reveal} />
			{/if}

			<!-- Supervisors (#176): primary manager + additional superiors -->
			<SupervisorsCard {data} {actionError} />

			<!-- Evaluation template (#178): the explicit assignment is the ONLY source of an
		     employee's template — it is never inferred from department, position or role (SPEC AC2). -->
			{#if data.canAssignTemplate}
				<EvalTemplateCard {data} {form} />
			{/if}

			<!-- Edit Form (HR-only; the update/offboard actions require HR_ADMIN) -->
			{#if canManage && employee.employmentStatus === 'ACTIVE'}
				<UpdateProfileCard {data} {form} {revealed} />
			{/if}

			<!-- Leave Balances (#137). Read-only: allocations come from the org's leave-type
		     defaults at onboarding, and deductions from approved leave requests. -->
			<LeaveBalancesCard {data} />

			<!-- Emergency Contacts (visible to any viewer of the 201 file; HR manages) -->
			<EmergencyContactsCard {data} {actionError} />
		</div>
	</div>

	<div
		id="panel-compensation"
		role="tabpanel"
		aria-labelledby="tab-compensation"
		tabindex="-1"
		hidden={activeTab !== 'compensation'}
		class:hidden={activeTab !== 'compensation'}
	>
		<div class="grid gap-6 lg:grid-cols-2">
			<!-- Benefits (#198): enrollments on the 201 file, read-only here. HR manages them under
		     the Benefits section; this just surfaces them alongside the employee's record. -->
			<BenefitsCard {data} />

			{#if canManage}
				<LoansCard {data} {actionError} {truncated} />
			{/if}

			{#if canManage}
				<AllowancesCard {data} {actionError} />
			{/if}

			{#if canManage}
				<DeductionsCard {data} {actionError} />
			{/if}

			<!-- #170: effective-dated salary / pay-type change. HR_ADMIN and up; records a history snapshot
		     and re-derives the current cache. Salary is masked (reveal above to edit). -->
			{#if canManage && employee.employmentStatus === 'ACTIVE'}
				<ChangeSalaryCard {data} {form} {revealed} {todayInput} {hireInput} />
			{/if}

			<!-- #222: promotion — position, title, reporting line, employment type and pay recorded as ONE
		     audited career event. Pay and type are effective-dated, so a promotion dated ahead applies
		     on its date. Empty fields mean "not part of this promotion", never "clear". -->
			{#if canManage && employee.employmentStatus === 'ACTIVE'}
				<PromoteCard {data} {form} {revealed} {todayInput} {hireInput} />
			{/if}
		</div>
	</div>

	<div
		id="panel-documents"
		role="tabpanel"
		aria-labelledby="tab-documents"
		tabindex="-1"
		hidden={activeTab !== 'documents'}
		class:hidden={activeTab !== 'documents'}
	>
		<div class="grid gap-6 lg:grid-cols-2">
			{#if canManage}
				<DocumentsCard {data} {actionError} />
			{/if}
		</div>
	</div>

	<div
		id="panel-history"
		role="tabpanel"
		aria-labelledby="tab-history"
		tabindex="-1"
		hidden={activeTab !== 'history'}
		class:hidden={activeTab !== 'history'}
	>
		<div class="grid gap-6 lg:grid-cols-2">
			{#if canManage}
				<EmploymentHistoryCard {history} {truncated} />
			{/if}
		</div>
	</div>

	<div
		id="panel-actions"
		role="tabpanel"
		aria-labelledby="tab-actions"
		tabindex="-1"
		hidden={activeTab !== 'actions'}
		class:hidden={activeTab !== 'actions'}
	>
		<div class="grid gap-6 lg:grid-cols-2">
			<!--
			OUTSIDE the ACTIVE block on purpose: a successful offboard flips employmentStatus to
			OFFBOARDED, which unmounts the block below — a message placed inside it could never be
			read. Gated on form.action so it only answers the offboard form.
		-->
			{#if form?.action === 'offboard' && form?.saved}
				<Banner kind="success" class="lg:col-span-2" message={form.saved} />
			{:else if form?.action === 'offboard' && form?.error}
				<div
					class="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-red-400 lg:col-span-2"
				>
					{form.error}
				</div>
			{/if}
			{#if canManage && employee.employmentStatus === 'ACTIVE'}
				<!--
					The Actions tab holds this one form and nothing else: reaching the only irreversible
					thing on the 201 file should take a deliberate move, not a scroll past it. The
					confirm dialog and its reportValidity() gate are phase 05's — left exactly as they are.
				-->
				<section class="rounded-lg border border-destructive p-6 space-y-4 lg:col-span-2">
					<h2 class="font-semibold text-destructive">Danger zone</h2>
					<p class="text-sm text-muted-foreground">
						Offboarding ends this employment record and disables the login. Reversing it needs a
						Super Admin.
					</p>
					<form
						bind:this={offboardFormEl}
						method="POST"
						action="?/offboard"
						use:enhance={offboard.enhance}
						class="space-y-4"
					>
						<h3 class="font-semibold text-destructive">Offboard Employee</h3>
						<div class="flex items-end gap-4">
							<div>
								<label for="endDate" class="text-sm font-medium">Last Day</label>
								<DatePicker
									id="endDate"
									value=""
									name="endDate"
									required
									class="mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								/>
							</div>
							<button
								type="button"
								disabled={offboard.busy}
								onclick={openOffboardConfirm}
								class="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:pointer-events-none disabled:opacity-50"
								>{offboard.busy ? 'Offboarding…' : 'Offboard'}</button
							>
						</div>
					</form>
				</section>
			{/if}
		</div>
	</div>
</div>

<ConfirmDialog
	bind:open={offboardConfirm}
	title="Offboard this employee?"
	message="{employee.firstName} {employee.lastName} is marked OFFBOARDED as of the last day you entered, their login is disabled, and they stop appearing in active-employee lists and payroll runs. Reversing this needs a Super Admin."
	confirmText="Offboard"
	onconfirm={() => offboardFormEl?.requestSubmit()}
/>
