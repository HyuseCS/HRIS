<script lang="ts">
	import type { Snippet } from 'svelte'
	import { enhance } from '$app/forms'
	import { submitFeedback } from '$lib/utils/submit-feedback.svelte'
	import type { EmployeeDetailData } from './shared'

	let { data, actionError }: { data: EmployeeDetailData; actionError: Snippet<[string[]]> } =
		$props()

	// Shared by every onboarding row: the rows submit one at a time, same as the per-row forms above.
	const toggleOnboardingStep = submitFeedback({ error: null })
</script>

{#if data.onboarding}
	<section
		class="rounded-lg border p-6 space-y-4 lg:col-span-2 {data.onboarding.complete
			? 'border-green-500/30 bg-green-500/5'
			: 'border-amber-500/30 bg-amber-500/5'}"
	>
		{@render actionError(['toggleOnboardingStep'])}
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h2 class="font-semibold">
				Onboarding
				{#if data.onboarding.complete}
					<span class="ml-1 text-sm font-normal text-green-600">✓ Complete</span>
				{/if}
			</h2>
			<span class="text-sm text-muted-foreground">
				{data.onboarding.doneCount} / {data.onboarding.total} steps
			</span>
		</div>

		{#if !data.onboarding.complete}
			<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
				<div
					class="h-full rounded-full bg-primary transition-all"
					style="width: {(data.onboarding.doneCount / data.onboarding.total) * 100}%"
				></div>
			</div>
			<div class="card-scroll">
				<ul class="columns-1 gap-x-8 sm:columns-2">
					{#each data.onboarding.steps as step (step.id)}
						<li class="mb-2.5 flex items-start gap-2 break-inside-avoid text-sm">
							{#if step.manual}
								<!-- Manual step: HR ticks it off (equipment issued, NDA signed, …). #116 -->
								<form
									method="POST"
									action="?/toggleOnboardingStep"
									use:enhance={toggleOnboardingStep.enhance}
								>
									<input type="hidden" name="itemId" value={step.id} />
									<input type="hidden" name="done" value={(!step.done).toString()} />
									<!-- Item 34, the plan's fallback path. The target was 16px, under the 24px
								     minimum, so it is raised to h-6 w-6. It stays a submit <button> rather
								     than becoming a real <input type="checkbox">: a checkbox could only
								     submit via an onchange requestSubmit(), so it would stop working
								     entirely with JavaScript off, which this form does not do today.
								     aria-pressed already carries the toggle state. The app.css
								     coarse-pointer 44px floor deliberately excludes checkboxes, so this
								     is a desktop-size fix, not a change to that floor. -->
									<button
										type="submit"
										disabled={toggleOnboardingStep.busy}
										aria-pressed={step.done}
										aria-label="{step.done ? 'Uncheck' : 'Check'} {step.label}"
										class="flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold transition-colors disabled:pointer-events-none disabled:opacity-50 {step.done
											? 'bg-green-500 text-white hover:bg-green-600'
											: 'border border-muted-foreground/40 text-transparent hover:border-primary hover:text-muted-foreground'}"
									>
										✓
									</button>
								</form>
							{:else}
								<!-- Not interactive (a derived step), but sized to match the manual one above so
							     the list does not become a ragged column of two different dots. -->
								<span
									class="flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold {step.done
										? 'bg-green-500 text-white'
										: 'border border-muted-foreground/40 text-transparent'}"
								>
									✓
								</span>
							{/if}
							<span>
								<span class={step.done ? 'text-foreground' : 'font-medium text-foreground'}>
									{step.label}
								</span>
								{#if step.manual}
									<span
										class="ml-1 rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground"
										>manual</span
									>
								{/if}
								{#if !step.done}
									<span class="block text-xs text-muted-foreground">{step.hint}</span>
								{/if}
							</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</section>
{/if}
