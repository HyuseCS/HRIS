<script lang="ts">
	import { enhance } from '$app/forms'
	// DEV ONLY — dev-gated (dev && !navigator.webdriver), never ships enabled; remove after the
	// program's owner test pass
	import DevLoginSwitcher from '$lib/components/dev/DevLoginSwitcher.svelte'
	import type { ActionData } from './$types'

	let { form }: { form: ActionData } = $props()
	let loading = $state(false)

	// Email-first Veent HRIS login (#135): step 1 posts the email to `?/resolve`, the server
	// resolves the org(s) and re-renders. The step is derived from the server's answer alone —
	// there is no client step state, so both steps work with JavaScript disabled.
	let pwEl = $state<HTMLInputElement | null>(null)
	// A server round-trip re-renders the whole card, so a keyboard or screen-reader user would
	// otherwise land back at the top of the document. `autofocus` trips the a11y lint rule.
	$effect(() => {
		pwEl?.focus()
	})
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
		{#if !form?.email}
			<!-- Step 1: email -->
			<div class="mb-5">
				<h1 class="text-base font-semibold">Sign in</h1>
				<p class="mt-1 text-xs text-muted-foreground">Enter your work email to continue</p>
			</div>

			<form
				method="POST"
				action="?/resolve"
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

				<button
					type="submit"
					disabled={loading}
					class="btn-primary w-full h-10 disabled:opacity-60"
				>
					{loading ? 'Checking…' : 'Continue'}
				</button>
			</form>
		{:else}
			<!-- Step 2: password. The heading is generic on purpose — naming the resolved org would
			     make a single-org email distinguishable from an unknown one. -->
			<div class="mb-5 flex items-start justify-between gap-2">
				<div>
					<h1 class="text-base font-semibold">Enter your password</h1>
					<p class="mt-1 text-xs text-muted-foreground">{form.email}</p>
				</div>
				<a
					href="/login"
					class="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground"
				>
					Change
				</a>
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
				action="?/signin"
				class="space-y-4"
				use:enhance={() => {
					loading = true
					return async ({ update }) => {
						loading = false
						update()
					}
				}}
			>
				<input type="hidden" name="email" value={form.email} />

				{#if form.orgs && form.orgs.length > 1}
					<fieldset class="space-y-2">
						<legend class="text-sm font-medium">Choose your company</legend>
						{#each form.orgs as org, i (org.id)}
							<div class="flex items-center gap-2">
								<input
									type="radio"
									name="selectedOrg"
									value={org.id}
									checked={i === 0}
									id="org-{org.id}"
								/>
								<label for="org-{org.id}" class="text-sm">{org.name}</label>
							</div>
						{/each}
					</fieldset>
				{/if}

				<div class="space-y-1.5">
					<label for="password" class="text-sm font-medium">Password</label>
					<input
						bind:this={pwEl}
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
