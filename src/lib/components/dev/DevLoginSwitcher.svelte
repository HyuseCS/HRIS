<script lang="ts">
	// ───────────────────────────────────────────────────────────────────────────
	// TEMP DEV ONLY — remove before merge.
	// Floating account switcher: one click logs you in as any seeded user (no
	// password). Only renders under `dev`; the backing endpoint is also dev-gated.
	// Pairs with /api/v1/_dev/login-as. Rendered in (app)/+layout.svelte and the
	// login page so you can hop roles mid-flow (maker → verifier → approver).
	// ───────────────────────────────────────────────────────────────────────────
	import { dev } from '$app/environment'
	import { onMount } from 'svelte'

	let open = $state(false)
	let busy = $state<string | null>(null)

	// Render only in a real dev browser — never in the Playwright/WebDriver session,
	// where this fixed bottom-right pill overlaps app controls (e.g. the /employees
	// "Next →" pagination link) and intercepts their clicks. onMount keeps it off the
	// server render, so there's no hydration flash of the switcher.
	let show = $state(false)
	onMount(() => {
		if (dev && !navigator.webdriver) show = true
	})

	// Every seeded account, grouped by org (mirrors prisma/seed.ts).
	const GROUPS: { org: string; accounts: { label: string; email: string }[] }[] = [
		{ org: 'Cross-org', accounts: [{ label: 'CEO', email: 'ceo@veent.ph' }] },
		{
			org: 'Veent',
			accounts: [
				{ label: 'Super Admin', email: 'admin@veent.ph' },
				{ label: 'HR Admin', email: 'hr@veent.ph' },
				{ label: 'Manager (HR)', email: 'manager@veent.ph' },
				{ label: 'Verifier', email: 'verifier@veent.ph' },
				{ label: 'Approver', email: 'approver@veent.ph' },
				{ label: 'Payroll Officer', email: 'payroll@veent.ph' },
				{ label: 'Finance', email: 'finance@veent.ph' },
				{ label: 'Employee', email: 'employee@veent.ph' }
			]
		},
		{
			org: 'JoJo Potato',
			accounts: [
				{ label: 'HR / Manager', email: 'manager@jojo.ph' },
				{ label: 'Verifier', email: 'verifier@jojo.ph' },
				{ label: 'Approver', email: 'approver@jojo.ph' },
				{ label: 'Employee', email: 'benjie@jojo.ph' }
			]
		},
		{
			org: 'Sweetleaf',
			accounts: [
				{ label: 'HR / Manager', email: 'manager@sweetleaf.ph' },
				{ label: 'Verifier', email: 'verifier@sweetleaf.ph' },
				{ label: 'Approver', email: 'approver@sweetleaf.ph' },
				{ label: 'Employee', email: 'ella@sweetleaf.ph' }
			]
		}
	]

	async function loginAs(email: string) {
		busy = email
		try {
			const res = await fetch('/api/v1/_dev/login-as', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email })
			})
			if (res.ok) {
				// Hard navigation so every server load re-reads the new session.
				window.location.href = '/dashboard'
				return
			}
		} catch {
			// fall through
		}
		busy = null
	}
</script>

{#if show}
	<div class="fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2">
		{#if open}
			<div class="w-60 overflow-hidden rounded-lg border border-border bg-card shadow-xl">
				<p class="border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
					Dev login as…
				</p>
				<div class="max-h-96 overflow-y-auto py-1">
					{#each GROUPS as group (group.org)}
						<p
							class="bg-muted/40 px-3 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
						>
							{group.org}
						</p>
						{#each group.accounts as acct (acct.email)}
							<button
								type="button"
								disabled={busy !== null}
								onclick={() => loginAs(acct.email)}
								class="flex w-full flex-col items-start px-3 py-1.5 text-left transition-colors hover:bg-accent disabled:opacity-50"
							>
								<span class="text-sm font-medium">{acct.label}</span>
								<span class="text-[11px] text-muted-foreground">
									{busy === acct.email ? 'Switching…' : acct.email}
								</span>
							</button>
						{/each}
					{/each}
				</div>
			</div>
		{/if}

		<button
			type="button"
			onclick={() => (open = !open)}
			title="Dev: switch login"
			class="flex h-11 items-center gap-2 rounded-full border border-amber-500/60 bg-amber-500/15 px-4 text-sm font-semibold text-amber-700 shadow-lg backdrop-blur transition-colors hover:bg-amber-500/25 dark:text-amber-400"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
				/>
			</svg>
			Dev login
		</button>
	</div>
{/if}
