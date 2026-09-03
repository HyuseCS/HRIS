<script lang="ts">
	import PageHeader from '$lib/components/ui/PageHeader.svelte'
	import { onMount, tick } from 'svelte'
	import { enhance } from '$app/forms'
	import PunchMapDialog from '$lib/components/timesheets/PunchMapDialog.svelte'
	import { createSubmitGuard } from '$lib/utils/submit-guard.svelte'
	import type { PageData, ActionData } from './$types'

	let { data, form }: { data: PageData; form: ActionData } = $props()

	// #108: punching writes a row — a double-tap must not write two.
	const punch = createSubmitGuard()

	/**
	 * The tap lock. `punch.busy` only goes up when the form is SUBMITTED, and the submit does not
	 * happen until the location request settles — up to WATCHDOG_MS later. So `punch.busy` alone
	 * left the whole capture window unguarded: both buttons stayed bright, and a second tap
	 * re-entered `requestLocationThenPunch` and reassigned `punchType`, so a tap of In followed by
	 * a tap of Out recorded an OUT (the first request settles, `requestSubmit()` sends no submitter
	 * value, and the hidden field — now 'OUT' — wins). Lock at the moment of the TAP instead.
	 */
	let capturing = $state(false)
	const locked = $derived(capturing || punch.busy)

	// Whether the click handler below is live yet. Until it is, a click submits the form the way
	// the browser always would — a punch with no location, which is a supported outcome, not a
	// failure. Surfaced as `data-ready` because it is a real, observable difference in what a
	// click does, and the e2e spec has to wait for it before asserting on a captured location.
	let ready = $state(false)
	onMount(() => {
		ready = true
	})

	/**
	 * #177 — the geolocation outcomes, as NAMED states.
	 *
	 * They are deliberately separate branches rather than conditions woven through the markup:
	 * each one is reached by exactly one named function below, each one's copy lives in exactly
	 * one place (locationCopy), and the markup reads the state instead of re-deriving it. A
	 * later UX pass can change what any state RENDERS without rewiring how it is REACHED.
	 *
	 *  idle        — nothing asked for yet (initial state)
	 *  requesting  — asked, still waiting. A real state, not a gap: with the permission already
	 *                granted there is no browser sheet to look at, and `enableHighAccuracy` takes
	 *                seconds, so without this the page said "not requested yet" — untrue — while
	 *                nothing appeared to happen.
	 *  granted     — permission granted and a usable fix arrived
	 *  denied      — the user (or a policy) refused the permission
	 *  nofix       — permission was not the problem: timeout, position unavailable, or a browser
	 *                that never called back at all (the watchdog)
	 *  unsupported — navigator.geolocation does not exist: an insecure origin (plain http) or an
	 *                old browser. Not an error the employee can fix, and not their problem.
	 *
	 * Every non-`granted` state still punches. A location failure must never cost the employee
	 * their punch — that is the rule the whole flow is built around.
	 */
	type LocationState = 'idle' | 'requesting' | 'granted' | 'denied' | 'nofix' | 'unsupported'

	let locationState = $state<LocationState>('idle')
	let accuracyM = $state<number | null>(null)

	// Every state's copy, in one place. A UX pass edits this table and nothing else.
	const locationCopy: Record<LocationState, string> = $derived({
		idle: 'Location has not been requested yet.',
		requesting: 'Finding your location… your punch will be saved either way.',
		// Never a bare coordinate pair: an accuracy figure always rides along, and when the device
		// does not report one we say so rather than implying the reading is exact.
		//
		// "reading", not "captured": this line survives on screen next to a FAILED punch (a 409, a
		// 404), and "captured" reads as "stored" — claiming a record that does not exist. It
		// describes what the phone did, never what the server kept.
		granted:
			accuracyM === null
				? 'Got a location reading (accuracy unknown).'
				: `Got a location reading (±${accuracyM} m).`,
		denied: 'Location permission denied — punching without it.',
		nofix: 'Could not get a location in time — punching without it.',
		unsupported: 'Location is not available on this device or connection — punching without it.'
	})
	const locationMessage = $derived(locationCopy[locationState])

	// Hidden fields. Empty string = "no reading"; the server discards anything unparseable and
	// records the punch regardless, so an empty field is never an error.
	let punchType = $state('')
	let latitude = $state('')
	let longitude = $state('')
	let accuracyField = $state('')

	// The API's own timeout is 8 s. This watchdog is deliberately LONGER, so the normal
	// no-fix path is the API's error callback and this only catches a browser that never
	// calls back at all.
	const WATCHDOG_MS = 9000
	const GEOLOCATION_TIMEOUT_MS = 8000

	// `$state` because the form now lives inside the `linked` branch, so this binding is written
	// conditionally rather than once on mount. The buttons live in that same branch, so by the time
	// anything can call `requestSubmit` the ref is set.
	let formEl = $state<HTMLFormElement | null>(null)

	function clearReading() {
		latitude = ''
		longitude = ''
		accuracyField = ''
		accuracyM = null
	}

	/**
	 * Ask for a position, then submit — whatever the answer. `settled` makes the submit
	 * happen exactly once no matter which branch gets there first.
	 */
	function requestLocationThenPunch(type: 'IN' | 'OUT') {
		punchType = type
		clearReading()
		locationState = 'requesting'
		let settled = false
		let watchdog: ReturnType<typeof setTimeout> | undefined

		const settle = async (state: LocationState) => {
			if (settled) return
			settled = true
			clearTimeout(watchdog)
			locationState = state
			// Svelte flushes state into the DOM on the NEXT tick, so the hidden inputs still hold
			// their old (empty) values at this point. Submitting now would serialise those and the
			// reading we just captured would be silently lost — the punch would land, with no
			// location, and nothing would say why. Wait for the flush first.
			await tick()
			formEl?.requestSubmit()
			// Released only here, and only after the submit: `requestSubmit()` runs the enhance
			// handler synchronously, so `punch.busy` is already up and the lock never has a gap.
			capturing = false
		}

		// Branch 4 — the API is absent entirely (insecure origin or an old browser).
		if (!('geolocation' in navigator)) {
			settle('unsupported')
			return
		}

		// Branch 3a — nothing came back at all.
		watchdog = setTimeout(() => settle('nofix'), WATCHDOG_MS)

		navigator.geolocation.getCurrentPosition(
			// Branch 1 — permission granted, usable fix.
			(position) => {
				latitude = String(position.coords.latitude)
				longitude = String(position.coords.longitude)
				accuracyM =
					typeof position.coords.accuracy === 'number' && Number.isFinite(position.coords.accuracy)
						? Math.round(position.coords.accuracy)
						: null
				accuracyField = accuracyM === null ? '' : String(accuracyM)
				settle('granted')
			},
			// Branch 2 — refused; Branch 3b — timeout or no fix available.
			(err) => {
				clearReading()
				settle(err.code === err.PERMISSION_DENIED ? 'denied' : 'nofix')
			},
			{ enableHighAccuracy: true, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 0 }
		)
	}

	// Intercepts the click so the location request can run first. Without JavaScript this handler
	// never runs, the browser submits the form natively, and the punch is recorded with no
	// location — which is a supported outcome, not a failure.
	function onPunchClick(event: MouseEvent, type: 'IN' | 'OUT') {
		if (locked) return
		event.preventDefault()
		capturing = true
		requestLocationThenPunch(type)
	}

	// #177 M-4 — which punch the page expects next. It only changes which button LOOKS like the
	// primary action; both stay enabled, because a wrong-looking punch is still a punch the
	// employee is entitled to make.
	const expected = $derived(data.since ? 'OUT' : 'IN')

	const btnBase =
		'flex-1 rounded-md px-4 py-3 font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50'
	const btnPrimary = `${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`
	const btnMuted = `${btnBase} border border-border hover:bg-accent hover:text-accent-foreground`

	// A coordinate pair is unreadable and unverifiable to the person it belongs to, and it is the
	// most sensitive string on the page. Show a map instead, with the accuracy in the LABEL so
	// the qualifier is never separated from the reading. The map itself lives in PunchMapDialog.
	//
	// The punch whose map is open, or null. Holds the row itself so the modal can label the reading
	// with the same accuracy qualifier the trigger showed.
	let mapFor = $state<{
		at: string
		latitude: number
		longitude: number
		locationAccuracyM: number | null
	} | null>(null)
</script>

<svelte:head><title>Punch — Veent HRIS</title></svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<PageHeader title="Punch" description={data.linked ? data.employeeName : undefined} />

	{#if !data.linked}
		<!-- #177 M-7 — rendered inside the app shell, so the nav is still there. -->
		<p class="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
			Punching is for staff with an employee record. Ask HR to link your account.
		</p>
	{:else}
		<form
			method="POST"
			action="?/punch"
			use:enhance={punch.enhance}
			bind:this={formEl}
			data-ready={ready}
			data-busy={locked}
			class="space-y-4 rounded-lg border border-border bg-card p-4"
		>
			<!-- The first question a worker arriving at a shift has, answered before anything else. -->
			<p class="text-lg font-medium">
				{data.since ? `Clocked in since ${data.since}` : 'Not clocked in'}
			</p>

			<!-- The disclosure sits BEFORE the buttons because it has to be read before the data is
			     taken, not after. It also carries the promise that a location failure costs nothing,
			     which was previously only visible once a failure had already happened.

			     It says what is RECORDED and never what is PROVEN. The old copy said the location let
			     the branch "confirm the shift"; nothing here confirms anything — the coordinates are
			     whatever the phone reports, posted as an ordinary form field (see the note on the
			     parse in +page.server.ts). Promising evidentiary weight the data does not have is
			     exactly the claim that would be leaned on when someone is accused of not being where
			     they said they were. -->
			<p class="text-sm text-muted-foreground">
				Punching sends the location your phone reports, and your branch can see it with the punch.
				If you say no, or your phone cannot find you, your punch is still saved.
			</p>

			<!-- Set by the click handler before requestSubmit(). Placed BEFORE the buttons so that in
			     the no-JavaScript case the submitting button's own value comes later in the form and
			     wins. -->
			<input type="hidden" name="punchType" bind:value={punchType} />
			<input type="hidden" name="latitude" bind:value={latitude} />
			<input type="hidden" name="longitude" bind:value={longitude} />
			<input type="hidden" name="accuracyM" bind:value={accuracyField} />

			<div class="flex gap-3">
				<button
					type="submit"
					name="punchType"
					value="IN"
					disabled={locked}
					onclick={(e) => onPunchClick(e, 'IN')}
					class={expected === 'IN' ? btnPrimary : btnMuted}
				>
					{locked && punchType === 'IN' ? 'Punching in…' : 'Punch In'}
				</button>
				<button
					type="submit"
					name="punchType"
					value="OUT"
					disabled={locked}
					onclick={(e) => onPunchClick(e, 'OUT')}
					class={expected === 'OUT' ? btnPrimary : btnMuted}
				>
					{locked && punchType === 'OUT' ? 'Punching out…' : 'Punch Out'}
				</button>
			</div>

			<!-- Two regions, not one. The location line is a status; the punch outcome is the ANSWER,
			     and a screen-reader user was hearing all three sentences in one polite breath with
			     nothing marking which was the result. -->
			<div role="status" aria-live="polite" class="text-sm text-muted-foreground">
				<!-- Suppressed next to a failure: "got a reading" beside "could not record the punch"
				     reads as though something was stored. -->
				{#if !form?.error}
					<p>{locationMessage}</p>
				{/if}
			</div>

			<div role="alert" class="text-sm">
				{#if form?.punched}
					<p class="font-medium text-foreground">
						Punched {form.punched === 'IN' ? 'in' : 'out'}{form.hadLocation
							? ' with your location.'
							: ' without a location.'}
					</p>
				{:else if form?.error}
					<!-- "Not punched." first, so the outcome survives greyscale, sunlight and a colour
					     the reader cannot see. `text-destructive` fails AA on the dark card (3.44:1);
					     the red-600/red-400 pair is what the rest of the app already uses. -->
					<p
						class="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 font-medium text-red-600 dark:text-red-400"
					>
						Not punched. {form.error}
					</p>
				{/if}
			</div>
		</form>

		<section class="space-y-2">
			<h2 class="text-lg font-medium">Your last {data.historyDays} days</h2>
			{#if data.punches.length === 0}
				<p class="text-sm text-muted-foreground">No punches recorded in this window.</p>
			{:else}
				<ul class="divide-y divide-border rounded-lg border border-border">
					{#each data.punches as p (p.id)}
						<li class="flex flex-wrap items-baseline justify-between gap-2 p-3 text-sm">
							<span class="font-medium">{p.punchType === 'IN' ? 'Clock in' : 'Clock out'}</span>
							<span class="text-muted-foreground">{p.at}</span>
							<span class="w-full text-xs text-muted-foreground">
								{#if p.latitude !== null && p.longitude !== null}
									<!-- An accuracy qualifier ALWAYS accompanies the reading — it is never
									     presented as if it were exact. -->
									<button
										type="button"
										onclick={() =>
											(mapFor = {
												at: p.at,
												latitude: p.latitude!,
												longitude: p.longitude!,
												locationAccuracyM: p.locationAccuracyM
											})}
										class="underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
									>
										View on map {p.locationAccuracyM === null
											? '(accuracy unknown)'
											: `(±${Math.round(p.locationAccuracyM)} m)`}
									</button>
								{:else}
									No location recorded
								{/if}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>

<PunchMapDialog bind:punch={mapFor} />
