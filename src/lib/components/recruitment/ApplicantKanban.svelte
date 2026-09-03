<script lang="ts">
	import { enhance } from '$app/forms'
	import Dialog from '$lib/components/ui/Dialog.svelte'

	interface Applicant {
		id: string
		firstName: string
		lastName: string
		email: string
		currentStage: string
		createdAt: Date
	}

	let {
		applicants,
		readonly = false
	}: {
		applicants: Applicant[]
		readonly?: boolean
	} = $props()

	// #52: stage moves confirm through a small dialog with an optional note that
	// lands in the applicant's stage history.
	let pending = $state<{ applicant: Applicant; from: Stage; to: Stage } | null>(null)

	const STAGES = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'] as const
	type Stage = (typeof STAGES)[number]

	const STAGE_LABELS: Record<Stage, string> = {
		APPLIED: 'Applied',
		SCREENING: 'Screening',
		INTERVIEW: 'Interview',
		OFFER: 'Offer',
		HIRED: 'Hired',
		REJECTED: 'Rejected'
	}

	// Left-border accent per stage — keeps cards on the theme surface (bg-card) so
	// they stay readable in dark mode instead of a hardcoded white background.
	const STAGE_COLORS: Record<Stage, string> = {
		APPLIED: 'border-l-blue-400',
		SCREENING: 'border-l-yellow-400',
		INTERVIEW: 'border-l-purple-400',
		OFFER: 'border-l-orange-400',
		HIRED: 'border-l-green-400',
		REJECTED: 'border-l-red-400'
	}

	const STAGE_HEADER_COLORS: Record<Stage, string> = {
		APPLIED: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
		SCREENING: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
		INTERVIEW: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
		OFFER: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
		HIRED: 'bg-green-500/10 text-green-600 dark:text-green-400',
		REJECTED: 'bg-red-500/10 text-red-600 dark:text-red-400'
	}

	function getNextStage(stage: Stage): Stage | null {
		const idx = STAGES.indexOf(stage)
		// REJECTED has no next; HIRED is terminal (but REJECTED is also reachable from any)
		if (stage === 'HIRED' || stage === 'REJECTED') return null
		return STAGES[idx + 1] ?? null
	}

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('en-PH', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		})
	}

	function applicantsInStage(stage: Stage) {
		return applicants.filter((a) => a.currentStage === stage)
	}
</script>

<div class="overflow-x-auto pb-4">
	<div class="flex gap-4 min-w-max">
		{#each STAGES as stage}
			{@const stageApplicants = applicantsInStage(stage)}
			<div class="w-64 flex-shrink-0">
				<!-- Column Header -->
				<div
					class="mb-2 flex items-center justify-between rounded-md px-3 py-2 {STAGE_HEADER_COLORS[
						stage
					]}"
				>
					<span class="text-sm font-semibold">{STAGE_LABELS[stage]}</span>
					<span
						class="rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-medium text-foreground"
					>
						{stageApplicants.length}
					</span>
				</div>

				<!-- Cards -->
				<div class="space-y-2">
					{#each stageApplicants as applicant (applicant.id)}
						<div class="rounded-md border border-l-4 p-3 shadow-sm {STAGE_COLORS[stage]} bg-card">
							{#if readonly}
								<p class="text-sm font-medium text-foreground">
									{applicant.firstName}
									{applicant.lastName}
								</p>
							{:else}
								<a
									href="/recruitment/applicant/{applicant.id}"
									class="text-sm font-medium text-primary hover:underline"
								>
									{applicant.firstName}
									{applicant.lastName}
								</a>
							{/if}
							<p class="mt-0.5 truncate text-xs text-muted-foreground">{applicant.email}</p>
							<p class="mt-1 text-xs text-muted-foreground">
								Applied {formatDate(applicant.createdAt)}
							</p>

							{#if !readonly}
								{@const nextStage = getNextStage(stage as Stage)}
								<div class="mt-2 flex flex-wrap gap-1">
									{#if nextStage === 'INTERVIEW'}
										<!-- Advancing to Interview means scheduling one — open that form. -->
										<a
											href="/recruitment/applicant/{applicant.id}#schedule"
											class="rounded px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
										>
											Schedule interview →
										</a>
									{:else if nextStage === 'OFFER'}
										<!-- Advancing to Offer means issuing one — open that form. -->
										<a
											href="/recruitment/applicant/{applicant.id}#offer"
											class="rounded px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
										>
											Give offer →
										</a>
									{:else if nextStage}
										<button
											type="button"
											onclick={() => (pending = { applicant, from: stage, to: nextStage })}
											class="rounded px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
										>
											Move to {STAGE_LABELS[nextStage]}
										</button>
									{/if}
									{#if stage !== 'REJECTED' && stage !== 'HIRED'}
										<button
											type="button"
											onclick={() => (pending = { applicant, from: stage, to: 'REJECTED' })}
											class="rounded px-2 py-0.5 text-xs font-medium border text-destructive border-destructive/30 hover:bg-destructive/10"
										>
											Reject
										</button>
									{/if}
								</div>
							{/if}
						</div>
					{:else}
						<div
							class="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground"
						>
							No applicants
						</div>
					{/each}
				</div>
			</div>
		{/each}
	</div>
</div>

<!-- Stage-move confirmation dialog (#52): target summary + optional note -->
{#if pending}
	{@const target = pending}
	<Dialog open onclose={() => (pending = null)} title="Confirm stage move" size="md" zIndex={60}>
		<h2 class="text-lg font-semibold">
			{target.to === 'REJECTED' ? 'Reject applicant' : `Move to ${STAGE_LABELS[target.to]}`}
		</h2>
		<p class="mt-2 text-sm text-muted-foreground">
			{target.applicant.firstName}
			{target.applicant.lastName}: {STAGE_LABELS[target.from]} → {STAGE_LABELS[target.to]}
		</p>
		<form
			method="POST"
			action="?/advanceStage"
			use:enhance={() =>
				async ({ update }) => {
					await update()
					pending = null
				}}
			class="mt-4 space-y-4"
		>
			<input type="hidden" name="applicantId" value={target.applicant.id} />
			<input type="hidden" name="stage" value={target.to} />
			<div>
				<label for="stage-move-notes" class="text-sm font-medium">
					Note <span class="font-normal text-muted-foreground"
						>(optional — shown in the applicant's stage history)</span
					>
				</label>
				<textarea
					id="stage-move-notes"
					name="notes"
					rows="3"
					placeholder="e.g. Strong portfolio — fast-tracking"
					class="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				></textarea>
			</div>
			<div class="flex justify-end gap-2">
				<button
					type="button"
					onclick={() => (pending = null)}
					class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent">Cancel</button
				>
				<button
					type="submit"
					class="rounded-md px-4 py-2 text-sm font-medium {target.to === 'REJECTED'
						? 'bg-red-600 text-white hover:bg-red-700'
						: 'bg-primary text-primary-foreground hover:bg-primary/90'}"
				>
					{target.to === 'REJECTED' ? 'Reject' : 'Confirm move'}
				</button>
			</div>
		</form>
	</Dialog>
{/if}
