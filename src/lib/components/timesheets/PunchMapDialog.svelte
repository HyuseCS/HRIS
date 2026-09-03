<script lang="ts">
	import Dialog from '$lib/components/ui/Dialog.svelte'
	// Stylesheet only — no `window` access, so unlike the library itself this is SSR-safe at
	// module scope. The pin is an SVG circleMarker, so Leaflet's marker PNGs are never needed
	// and their broken-default-path problem never arises.
	import 'leaflet/dist/leaflet.css'

	/**
	 * The map for one punch, shown in a modal instead of a new tab to openstreetmap.org (#177).
	 *
	 * Note what the modal does and does not buy: the reader never leaves the app, but the tiles are
	 * still fetched from a third party by their browser, so that host still sees the coordinate.
	 * Removing that means proxying tiles through our own server, which the tile usage policies
	 * discourage.
	 *
	 * Leaflet is loaded DYNAMICALLY inside onMount, never at module scope. It touches `window` as it
	 * initialises, so a static import crashes the SSR render of this page — the same class of break
	 * papaparse caused on /attendance.
	 */
	interface Props {
		/** The punch to map, or null when closed. Bound so the modal can close itself. */
		punch: {
			at: string
			latitude: number
			longitude: number
			locationAccuracyM: number | null
		} | null
	}

	let { punch = $bindable() }: Props = $props()

	// CARTO's label-light basemaps: streets and water, no shop/church/POI clutter, and a dark
	// variant that does not glare inside a dark app. Plain OSM 'mapnik' was too busy to read.
	const TILES = {
		light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
		dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
	}
	// Attribution is a licence condition of both CARTO and OSM, not decoration. OSM's map data is
	// ODbL, and its guidelines ask for "© OpenStreetMap contributors" LINKED to the copyright
	// page — plain text does not satisfy it. Leaflet renders this string as HTML.
	const ATTRIBUTION =
		'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">CARTO</a>'
	// Fallback only, for a reading with no accuracy figure: ≈ a few streets around the pin.
	const ZOOM = 16
	// With an accuracy figure the view FRAMES the margin circle instead. A fixed zoom made a
	// ±2 km reading paint its circle over the whole viewport — it read as a tinted map, not as a
	// margin. Capped so a ±5 m reading does not slam to maximum zoom on a single doorway.
	const MAX_FIT_ZOOM = 17

	let mapEl = $state<HTMLDivElement>()
	let tilesFailed = $state(false)

	// Focusing the panel on open and handing focus back to the "View on map" trigger on close are
	// both Dialog's job now.
	function close() {
		punch = null
	}

	/**
	 * Build the map once the container exists, and tear it down when the modal closes — Leaflet
	 * holds listeners on window, so leaking an instance per open would pile them up.
	 */
	$effect(() => {
		if (!punch || !mapEl) return
		const { latitude, longitude, locationAccuracyM } = punch
		const container = mapEl
		// Per-open state: a tile failure on an earlier punch must not caption this one as broken.
		tilesFailed = false
		let map: import('leaflet').Map | undefined
		let cancelled = false

		;(async () => {
			const L = (await import('leaflet')).default
			if (cancelled) return

			map = L.map(container, {
				center: [latitude, longitude],
				zoom: ZOOM,
				// A single reading is not something to explore: no scroll-hijack, no clutter.
				zoomControl: false,
				attributionControl: true,
				scrollWheelZoom: false
			})

			const dark = document.documentElement.classList.contains('dark')
			const layer = L.tileLayer(dark ? TILES.dark : TILES.light, {
				attribution: ATTRIBUTION,
				maxZoom: 19
			})
			// Offline or a blocked CDN must not leave a blank grey box with no explanation.
			layer.on('tileerror', () => (tilesFailed = true))
			layer.addTo(map)

			// The accuracy circle IS the reading — the pin alone overstates how exact it is.
			L.circleMarker([latitude, longitude], {
				radius: 6,
				color: '#ef4444',
				fillColor: '#ef4444',
				fillOpacity: 1,
				weight: 2
			}).addTo(map)
			if (locationAccuracyM !== null) {
				const margin = L.circle([latitude, longitude], {
					radius: locationAccuracyM,
					color: '#ef4444',
					fillColor: '#ef4444',
					fillOpacity: 0.12,
					weight: 1
				}).addTo(map)
				map.fitBounds(margin.getBounds(), { padding: [12, 12], maxZoom: MAX_FIT_ZOOM })
			}
		})()

		return () => {
			cancelled = true
			map?.remove()
		}
	})
</script>

{#if punch}
	<Dialog open onclose={close} title="Punch location" size="lg" padding="sm" zIndex={60}>
		<div class="flex items-start justify-between gap-4">
			<div>
				<h2 class="text-base font-semibold">Punch location</h2>
				<p class="text-xs text-muted-foreground">{punch.at}</p>
			</div>
			<button
				type="button"
				onclick={close}
				class="rounded-md border px-3 py-1 text-sm hover:bg-accent">Close</button
			>
		</div>

		<div
			bind:this={mapEl}
			data-testid="punch-map"
			data-lat={punch.latitude}
			data-lon={punch.longitude}
			class="mt-3 h-72 w-full overflow-hidden rounded-md border border-border bg-muted"
		></div>

		{#if tilesFailed}
			<p class="mt-2 text-xs text-muted-foreground">
				The map could not load. The reading is still recorded.
			</p>
		{/if}

		<!-- The accuracy qualifier stays with the reading — a pin is not an exact position. -->
		<p class="mt-2 text-xs text-muted-foreground">
			{punch.locationAccuracyM === null
				? 'Accuracy unknown — the pin may be off.'
				: `Accurate to about ±${Math.round(punch.locationAccuracyM)} m — the shaded circle is that margin.`}
		</p>
	</Dialog>
{/if}
