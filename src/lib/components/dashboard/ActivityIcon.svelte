<script lang="ts">
	import type { NotificationKind } from '@prisma/client'

	// The activity feed used to carry a 📢 baked into the announcement's message text, which
	// rendered at whatever the OS felt like and could not be styled, aligned or tinted. The kind
	// now travels on the notification itself and the icon is drawn here — 24×24 outline paths,
	// the same convention as the nav and EmptyState.
	let { kind }: { kind: NotificationKind } = $props()

	// Tints are stated per theme rather than reused from the badge scale: those are tuned for the
	// dark default and a `-400` on white washes out.
	const ICONS: Record<NotificationKind, { tint: string; paths: string[] }> = {
		ANNOUNCEMENT: {
			tint: 'bg-primary/10 text-primary',
			paths: ['m3 11 18-5v12L3 14v-3z', 'M11.6 16.8a3 3 0 1 1-5.8-1.6']
		},
		AWARD: {
			tint: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
			paths: ['M12 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12z', 'M15.5 12.9 17 22l-5-3-5 3 1.5-9.1']
		},
		PAYSLIP: {
			tint: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
			paths: ['M2 6h20v12H2z', 'M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z', 'M6 12h.01', 'M18 12h.01']
		},
		REQUEST: {
			tint: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
			paths: [
				'M22 12h-6l-2 3h-4l-2-3H2',
				'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'
			]
		},
		RECRUITMENT: {
			tint: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
			paths: [
				'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
				'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
				'M19 8v6',
				'M22 11h-6'
			]
		},
		PERFORMANCE: {
			tint: 'bg-indigo-500/12 text-indigo-600 dark:text-indigo-400',
			paths: [
				'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
				'M9 2h6a1 1 0 0 1 1 1v2H8V3a1 1 0 0 1 1-1z',
				'm9 14 2 2 4-4'
			]
		},
		GENERAL: {
			tint: 'bg-muted text-muted-foreground',
			paths: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.9 1.9 0 0 0 3.4 0']
		}
	}

	// Falls back rather than indexes blindly: a row written before this enum existed, or by a
	// future kind the client hasn't shipped yet, still gets an icon instead of a blank square.
	const icon = $derived(ICONS[kind] ?? ICONS.GENERAL)
</script>

<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full {icon.tint}">
	<svg
		class="h-4 w-4"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.6"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		{#each icon.paths as d (d)}
			<path {d} />
		{/each}
	</svg>
</span>
