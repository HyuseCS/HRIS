<script lang="ts">
	import { enhance } from '$app/forms'
	import { fade, scale } from 'svelte/transition'
	import BackButton from '$lib/components/ui/BackButton.svelte'
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { ROLE_DESCRIPTIONS, ROLE_GROUPS, ROLE_LABELS, canAny } from '$lib/rbac'
	import Check from 'lucide-svelte/icons/check'
	import Info from 'lucide-svelte/icons/info'
	import Pencil from 'lucide-svelte/icons/pencil'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { Role } from '@prisma/client'
	import type { PageData, ActionData } from './$types'
	import Badge from '$lib/components/ui/Badge.svelte'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	// CEO manages roles; Super Admin manages account status. The page opens for either,
	// so each control is shown only to the capability that owns it (#132).
	const canManageRoles = $derived(data.canManageRoles)
	const canManageActive = $derived(data.canManageActive)

	// #108: every user row has its own `?/setActive` form, so each gets its own guard — a shared
	// one would disable the whole table while one row is in flight. Plain objects, not `$state`:
	// each guard holds its own reactive `busy`, the maps only memoise identity.
	const setActiveGuards: Record<string, ReturnType<typeof createSubmitGuard>> = {}
	const setActiveGuard = (id: string) => (setActiveGuards[id] ??= createSubmitGuard())
	const setRoleGuards: Record<string, ReturnType<typeof createSubmitGuard>> = {}
	// #283: a rejected save keeps the dialog OPEN, with the attempted selection intact and the
	// server's reason inline beside it.
	//
	// This is why `update()` is skipped on failure. `update()` would publish the error into the
	// page-level `form` prop, which renders the banner at the top of the page — behind the dialog,
	// where the person who just pressed Save cannot see it. It would also reset the checkboxes to
	// their `checked` ATTRIBUTE (a checkbox's live state is a DOM property that re-rendering does
	// not touch), throwing away the selection the user must now correct. Neither is wanted here:
	// nothing was written, so the attempt is still the honest thing to show.
	//
	// The 409 ("Cannot remove the last active …") is the case that makes this matter — it depends
	// on org-wide state, so no client check can predict it, and closing the dialog on it would
	// leave "did that save?" unanswered on the screen that assigns system authority.
	const setRoleGuard = (id: string) =>
		(setRoleGuards[id] ??= createSubmitGuard(() => async ({ update, result }) => {
			if (result.type === 'failure') {
				// `error` is the 409's message and the 400's generic line; the 400's precise one
				// ("A user must keep at least one role.") is the zod message under fieldErrors.
				const d = result.data as
					{ error?: string; fieldErrors?: Record<string, string[] | undefined> } | undefined
				saveError = d?.fieldErrors?.roles?.[0] ?? d?.error ?? 'Those roles could not be saved.'
				// Pull focus back into the dialog. Save is `disabled` while the submit is in flight,
				// and disabling the focused element hands focus to <body> — so by the time the refusal
				// arrives the keyboard is OUTSIDE the modal: Escape no longer closes it and Tab walks
				// the table underneath. Caught by the batched inspection round on the 409 path.
				panelEl?.focus()
				return
			}
			await update()
			closeEditor()
		}))

	// #283: the picker's live selection, per user row.
	//
	// The control this replaces was a native <select multiple>, and the reason it had to go is one
	// gesture: a PLAIN click on a multi-select REPLACES the whole selection. On a user holding
	// [VERIFIER, APPROVER], clicking "CEO" silently dropped both — the likeliest gesture was the
	// destructive one, no warning, and the service cannot catch it because one role is a legal set.
	// Ctrl-click is the only safe interaction and nothing on screen taught it.
	//
	// Checkboxes have no modifier-key mode, so every click means exactly what it looks like. They
	// are still plain platform controls posting a repeated `roles` key — the server contract and
	// the AC-3 prefill are unchanged, and no picker library arrives.
	//
	// `draft` mirrors the checkboxes only to drive the dialog's summary line, its Save button and
	// the advisory note below; the inputs remain the source of truth for what is posted.
	//
	// It holds an entry ONLY for rows the user has touched — seeding it from data.users would
	// snapshot the initial load, and any row that arrived afterwards would read as having no roles
	// at all. Clearing a row's entry is how "follow the server again" is expressed, which is what
	// closing the dialog does: an abandoned selection must not linger in the table behind it.
	let draft = $state<Record<string, string[]>>({})
	type Row = { id: string; roles: string[] }
	const rolesOf = (u: Row) => draft[u.id] ?? u.roles
	const toggle = (u: Row, role: string) => {
		const now = rolesOf(u)
		draft[u.id] = now.includes(role) ? now.filter((r) => r !== role) : [...now, role]
		// A refusal describes the selection that was submitted. Once that selection changes the
		// message is about something no longer on screen, so it goes.
		saveError = ''
	}
	// Order-independent set equality — the same comparison the server makes.
	const isDirty = (u: Row) => {
		const now = rolesOf(u)
		return now.length !== u.roles.length || now.some((r) => !u.roles.includes(r))
	}
	const label = (r: string) => ROLE_LABELS[r as keyof typeof ROLE_LABELS] ?? r

	// ─── The editor dialog ──────────────────────────────────────────────────────
	// #283: the picker moved off the table. Nine checkboxes and a Save button per row put ~81
	// controls on a page whose job is reading a user list; the roles cell is now a read display
	// and editing is one labelled button away, in a dialog with room to say what each role does.

	// Held by id, not by object: `data.users` is replaced wholesale when the save invalidates the
	// load, and a captured row would go stale mid-flight.
	let editingId = $state<string | null>(null)
	const editing = $derived(data.users.find((u) => u.id === editingId) ?? null)
	let saveError = $state('')
	let panelEl = $state<HTMLElement>()
	// The control that opened the dialog, so focus can go back to exactly where it left.
	let triggerEl: HTMLElement | null = null

	function openEditor(id: string, trigger: HTMLElement) {
		editingId = id
		triggerEl = trigger
		saveError = ''
	}
	function closeEditor() {
		// Discard the unsaved selection: the table behind the dialog shows assigned roles, and it
		// must not start showing roles nobody saved.
		if (editingId) delete draft[editingId]
		editingId = null
		saveError = ''
		triggerEl?.focus()
		triggerEl = null
	}

	$effect(() => {
		if (editingId) panelEl?.focus()
	})

	// The advisory note, computed from CAPABILITY membership rather than from role names, so it
	// still fires the day some other role is granted APPROVE_SIGNOFF.
	const sodOverlap = $derived.by(() => {
		if (!editing) return false
		const sel = rolesOf(editing) as Role[]
		return canAny(sel, 'VERIFY_REQUESTS') && canAny(sel, 'APPROVE_SIGNOFF')
	})

	const FOCUSABLE =
		'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation()
			closeEditor()
			return
		}
		if (e.key !== 'Tab' || !panelEl) return
		// Keep Tab inside the dialog. Neither ConfirmDialog nor ReasonDialog does this; a modal
		// that lets Tab walk into the table underneath is only visually modal.
		const items = [...panelEl.querySelectorAll<HTMLElement>(FOCUSABLE)]
		if (items.length === 0) return
		const first = items[0]
		const last = items[items.length - 1]
		if (e.shiftKey && (document.activeElement === first || document.activeElement === panelEl)) {
			e.preventDefault()
			last.focus()
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault()
			first.focus()
		}
	}

	// How many role pills the read display shows before collapsing the rest.
	const PILL_CAP = 3
	const PILL =
		'inline-flex items-center rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground'
</script>

<svelte:head>
	<title>Roles &amp; Permissions — Veent HRIS</title>
</svelte:head>

<div class="space-y-6">
	<PageHeader
		title="Roles & Permissions"
		description="Manage each user's access level and account status. You cannot change your own role or deactivate yourself, and the last active super admin and CEO are protected. Assigning a role replaces the user's full role set."
	>
		{#snippet back()}
			<BackButton fallback="/settings" label="Settings" preferFallback />
		{/snippet}
	</PageHeader>

	<!-- `?/setActive` errors only: a rejected role save renders inside the dialog, where the person
	     who pressed Save is looking. -->
	{#if form?.error}
		<div
			class="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
		>
			{form.error}
		</div>
	{/if}

	<div class="overflow-x-auto rounded-lg border">
		<table class="w-full min-w-max text-sm">
			<thead class="border-b bg-muted/50">
				<tr>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Employee</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
					<th class="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
					<th class="px-4 py-3"><span class="sr-only">Actions</span></th>
				</tr>
			</thead>
			<tbody class="divide-y">
				{#each data.users as u (u.id)}
					{@const setActive = setActiveGuard(u.id)}
					{@const editable = canManageRoles && u.id !== data.user.id}
					<tr class="hover:bg-muted/30">
						<td class="px-4 py-3 font-medium">{u.email}</td>
						<td class="px-4 py-3 text-muted-foreground">{u.employeeName ?? '—'}</td>
						<td class="px-4 py-3">
							<div class="flex items-center gap-2">
								<Badge
									status={u.isActive ? 'ACTIVE' : 'INACTIVE'}
									tone={u.isActive ? 'green' : 'gray'}
								/>
								{#if canManageActive}
									<form method="POST" action="?/setActive" use:enhance={setActive.enhance}>
										<input type="hidden" name="userId" value={u.id} />
										<input type="hidden" name="isActive" value={u.isActive ? 'false' : 'true'} />
										<button
											type="submit"
											disabled={setActive.busy}
											class="rounded-md border px-2 py-0.5 text-xs hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
										>
											{setActive.busy ? 'Saving…' : u.isActive ? 'Deactivate' : 'Activate'}
										</button>
									</form>
								{/if}
							</div>
						</td>
						<!-- Read display, for every caller. The pills carry no checkbox, no hover and no
						     focus ring, because nothing here is a control.

						     #248: `editable` gates on the rule the service actually enforces (no
						     self-role-change), not on the target being a CEO. The old CEO block was UI-only
						     — the v1 PATCH twin never had it — and it made CEO a role that could be granted
						     but never revoked. A CEO row is editable; setUserRoles refuses to remove the
						     last active one (409). -->
						<td class="px-4 py-3">
							<div class="flex w-[17rem] flex-wrap gap-1.5 sm:w-[26rem]">
								<!-- Truncation only where the overflow is recoverable. An editable row hides the
								     tail behind a pill that opens the dialog; a read-only row has no dialog to
								     open, so hiding roles there would just be data the reader cannot get back. -->
								{#each editable ? u.roles.slice(0, PILL_CAP) : u.roles as r (r)}
									<span class={PILL}>{label(r)}</span>
								{/each}
								{#if editable && u.roles.length > PILL_CAP}
									<button
										type="button"
										onclick={(e) => openEditor(u.id, e.currentTarget)}
										class="{PILL} cursor-pointer transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
									>
										+{u.roles.length - PILL_CAP} more
									</button>
								{/if}
							</div>
						</td>
						<td class="px-4 py-3 text-right">
							{#if editable}
								<button
									type="button"
									onclick={(e) => openEditor(u.id, e.currentTarget)}
									class="btn-row min-h-11 gap-1.5 sm:min-h-0"
								>
									<Pencil class="h-3 w-3 shrink-0" aria-hidden="true" />
									Edit roles
								</button>
							{/if}
						</td>
					</tr>
				{:else}
					<tr>
						<td colspan="5" class="px-4 py-8 text-center text-muted-foreground">No users found</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

{#if editing}
	{@const eu = editing}
	{@const setRole = setRoleGuard(eu.id)}
	{@const chosen = rolesOf(eu)}
	<div
		class="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
		onclick={closeEditor}
		role="presentation"
		transition:fade={{ duration: 100 }}
	>
		<div
			bind:this={panelEl}
			class="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border bg-card shadow-2xl focus:outline-none sm:max-w-2xl lg:max-w-4xl"
			onclick={(e) => e.stopPropagation()}
			onkeydown={onKeydown}
			role="dialog"
			aria-modal="true"
			aria-labelledby="role-editor-title"
			tabindex="-1"
			transition:scale={{ duration: 120, start: 0.96 }}
		>
			<div class="border-b px-6 py-5">
				<h2 id="role-editor-title" class="text-lg font-semibold">Edit roles</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					{eu.employeeName ? `${eu.employeeName} · ${eu.email}` : eu.email}
				</p>
			</div>

			<form
				method="POST"
				action="?/setRole"
				use:enhance={setRole.enhance}
				class="flex min-h-0 flex-1 flex-col"
			>
				<input type="hidden" name="userId" value={eu.id} />

				<div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
					{#each ROLE_GROUPS as group (group.label)}
						<fieldset>
							<legend
								class="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
							>
								{group.label}
							</legend>
							<div class="grid gap-2 sm:grid-cols-2">
								{#each group.roles as r (r)}
									{@const on = chosen.includes(r)}
									<label
										class="flex min-h-11 cursor-pointer select-none items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors {on
											? 'border-primary/50'
											: 'border-border hover:border-foreground/30'} focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-background"
									>
										<input
											type="checkbox"
											name="roles"
											value={r}
											checked={eu.roles.includes(r)}
											onchange={() => toggle(eu, r)}
											class="sr-only"
										/>
										<span
											class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border {on
												? 'border-primary bg-primary text-primary-foreground'
												: 'border-border'}"
										>
											{#if on}
												<Check class="h-3 w-3" aria-hidden="true" />
											{/if}
										</span>
										<span class="min-w-0">
											<span class="block text-sm font-medium">{ROLE_LABELS[r]}</span>
											<span class="mt-0.5 block text-xs leading-relaxed text-muted-foreground"
												>{ROLE_DESCRIPTIONS[r]}</span
											>
										</span>
									</label>
								{/each}
							</div>
						</fieldset>
					{/each}
				</div>

				<div class="space-y-3 border-t px-6 py-4">
					{#if saveError}
						<div
							role="alert"
							class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
						>
							{saveError}
						</div>
					{/if}
					<!-- ADVISORY ONLY. Holding both hats is legal and this note never blocks the save —
					     what is barred is one person acting twice on the SAME request, and that is
					     enforced server-side by `canActOnStage` in services/approvals.ts, at the moment
					     of the decision. Do not wire this to `disabled`: role assignment is not where the
					     rule lives, and making it refuse here would forbid a set the system allows. -->
					{#if sodOverlap}
						<p
							class="flex items-start gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground"
						>
							<Info class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
							<span>
								This user won't be able to verify and approve the same request — the system blocks
								that automatically.
							</span>
						</p>
					{/if}
					<div class="flex items-center justify-between gap-3">
						<p class="text-xs {chosen.length === 0 ? 'text-destructive' : 'text-muted-foreground'}">
							{#if chosen.length === 0}
								Pick at least one role.
							{:else}
								{chosen.length}
								{chosen.length === 1 ? 'role' : 'roles'}{isDirty(eu) ? ' · unsaved' : ''}
							{/if}
						</p>
						<div class="flex shrink-0 gap-2">
							<button
								type="button"
								onclick={closeEditor}
								class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
								>Cancel</button
							>
							<button
								type="submit"
								disabled={setRole.busy || !isDirty(eu) || chosen.length === 0}
								class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
							>
								{setRole.busy ? 'Saving…' : 'Save roles'}
							</button>
						</div>
					</div>
				</div>
			</form>
		</div>
	</div>
{/if}
