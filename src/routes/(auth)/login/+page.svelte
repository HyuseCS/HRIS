<script lang="ts">
	import { enhance } from '$app/forms'
	// DEV ONLY — dev-gated (dev && !navigator.webdriver), never ships enabled; remove after the
	// program's owner test pass
	import DevLoginSwitcher from '$lib/components/dev/DevLoginSwitcher.svelte'
	import type { ActionData, PageData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()
	let loading = $state(false)

	// Two-step Veent HRIS login (#135): pick a tenant, then enter credentials. The chosen
	// org is posted as `selectedOrg`; the server scopes the credential to it.
	let selectedOrg = $state<{ id: string; name: string } | null>(null)
</script>

<svelte:head>
	<title>Sign In — Veent HRIS</title>
</svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center bg-background px-4">
	<!-- Veent HRIS brand -->
	<div class="mb-8 flex flex-col items-center gap-3">
		<img src="/veent-logo.png" alt="Veent" class="h-16 w-auto" />
		<p class="text-sm text-muted-foreground">Log in to your company</p>
	</div>

	<!-- Card -->
	<div class="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-xl">
		{#if !selectedOrg}
			<!-- Step 1: tenant selector -->
			<div class="mb-5">
				<h1 class="text-base font-semibold">Choose your company</h1>
				<p class="mt-1 text-xs text-muted-foreground">Select a workspace to continue</p>
			</div>

			<div class="space-y-2">
				{#each data.orgs as org (org.id)}
					<button
						type="button"
						onclick={() => (selectedOrg = org)}
						class="btn-row flex w-full items-center justify-between px-4 py-3 text-left"
					>
						<span class="text-sm font-medium">{org.name}</span>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4 w-4 text-muted-foreground"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
						</svg>
					</button>
				{/each}
			</div>
		{:else}
			<!-- Step 2: credentials, scoped to the chosen tenant -->
			<div class="mb-5 flex items-start justify-between gap-2">
				<div>
					<h1 class="text-base font-semibold">Sign in to {selectedOrg.name}</h1>
					<p class="mt-1 text-xs text-muted-foreground">Enter your work credentials to continue</p>
				</div>
				<button
					type="button"
					onclick={() => (selectedOrg = null)}
					class="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground"
				>
					Change
				</button>
			</div>

			{#if form?.error}
				<!-- Item 40. Two fixes. `role="alert"` because a failed sign-in re-renders in place:
				     without it a screen-reader user presses Sign in and hears nothing at all. And
				     `text-red-400` is a dark-mode colour used unconditionally — on the light theme it
				     was pale red on near-white. Now phase 03's Banner pair. Not the Banner component
				     itself: this is the (auth) group, which does not carry the app shell. -->
				<div
					role="alert"
					class="mb-4 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"
				>
					{form.error}
				</div>
			{/if}

			<form
				method="POST"
				class="space-y-4"
				use:enhance={() => {
					loading = true
					return async ({ update }) => {
						loading = false
						update()
					}
				}}
			>
				<input type="hidden" name="selectedOrg" value={selectedOrg.id} />

				<div class="space-y-1.5">
					<label for="email" class="text-sm font-medium">Email</label>
					<input
						id="email"
						name="email"
						type="email"
						autocomplete="email"
						required
						placeholder="you@company.com"
						class="input"
					/>
				</div>

				<div class="space-y-1.5">
					<label for="password" class="text-sm font-medium">Password</label>
					<input
						id="password"
						name="password"
						type="password"
						autocomplete="current-password"
						required
						placeholder="••••••••"
						class="input"
					/>
				</div>

				<button
					type="submit"
					disabled={loading}
					class="btn-primary w-full h-10 disabled:opacity-60"
				>
					{loading ? 'Signing in…' : 'Sign In'}
				</button>
			</form>
		{/if}
	</div>

	<p class="mt-6 text-xs text-muted-foreground">Veent HRIS · {new Date().getFullYear()}</p>
</div>

<DevLoginSwitcher />
<!-- DEV ONLY — dev-gated (dev && !navigator.webdriver), never ships enabled; remove after the
     program's owner test pass -->
