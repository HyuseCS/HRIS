<script lang="ts">
	import { enhance } from '$app/forms'
	// DEV ONLY — dev-gated (dev && !navigator.webdriver), never ships enabled; remove after the
	// program's owner test pass
	import DevLoginSwitcher from '$lib/components/dev/DevLoginSwitcher.svelte'
	import type { ActionData } from './$types'

	let { form }: { form: ActionData } = $props()
	let loading = $state(false)
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
		<div class="mb-5">
			<h1 class="text-base font-semibold">Sign in</h1>
			<p class="mt-1 text-xs text-muted-foreground">Enter your work credentials to continue</p>
		</div>

		{#if form?.error}
			<!-- Item 40. Two fixes. `role="alert"` because a failed sign-in re-renders in place:
			     without it a screen-reader user presses Sign in and hears nothing at all. And
			     `text-red-400` is a dark-mode colour used unconditionally — on the light theme it
			     was pale red on near-white. Now phase 03's Banner pair. Not the Banner component
			     itself: this is the (auth) group, which does not carry the app shell. -->
			<div
				role="alert"
				class="mb-4 rounded border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
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

			<button type="submit" disabled={loading} class="btn-primary w-full h-10 disabled:opacity-60">
				{loading ? 'Signing in…' : 'Sign In'}
			</button>
		</form>
	</div>

	<p class="mt-6 text-xs text-muted-foreground">Veent HRIS · {new Date().getFullYear()}</p>
</div>

<DevLoginSwitcher />
<!-- DEV ONLY — dev-gated (dev && !navigator.webdriver), never ships enabled; remove after the
     program's owner test pass -->
