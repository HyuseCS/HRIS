import { describe, it, expect } from 'vitest'
import {
	SETTINGS_DESTINATIONS,
	SETTINGS_GROUP_ORDER,
	visibleSettings
} from '../../src/lib/settings-destinations'

/**
 * The shared destination array is what makes "one name per destination" structural instead of
 * hand-maintained (phase 07 D7). These pin the properties the three consuming surfaces — the hub,
 * the settings sub-nav and the sidebar's Settings children — rely on.
 *
 * Per-role visibility parity (AC-15) is pinned longhand in tests/unit/settings-cards.test.ts,
 * which is the file the #237/#178 reasoning already lives in.
 */
describe('settings destinations', () => {
	it('gives every destination exactly one href and one canonical label', () => {
		const hrefs = SETTINGS_DESTINATIONS.map((d) => d.href)
		const labels = SETTINGS_DESTINATIONS.map((d) => d.label)
		expect(new Set(hrefs).size).toBe(hrefs.length)
		// Two destinations sharing a label is the bug this array exists to prevent, read backwards.
		expect(new Set(labels).size).toBe(labels.length)
	})

	it('puts every destination in a group the render order knows about', () => {
		for (const d of SETTINGS_DESTINATIONS) {
			expect(SETTINGS_GROUP_ORDER).toContain(d.group)
		}
	})

	it('keeps the sidebar Settings group to the curated seven (OD-2)', () => {
		// The sidebar shows a subset, not all 17 — growing it is a navigation-IA change that belongs
		// to the nav phase, not to whoever adds a settings page.
		expect(SETTINGS_DESTINATIONS.filter((d) => d.inSidebar).map((d) => d.href)).toEqual([
			'/settings/company',
			'/settings/org',
			'/settings/roles',
			'/settings/schedules',
			'/settings/holidays',
			'/settings/pay-codes',
			'/settings/salary-grades'
		])
	})

	it('never shows a sidebar row the role cannot open', () => {
		// The sidebar derives from visibleSettings(...).filter(inSidebar), so every curated row must
		// still be capability-filtered — MANAGER must not get Roles & Access.
		const managerSidebar = visibleSettings(['MANAGER'])
			.filter((d) => d.inSidebar)
			.map((d) => d.href)
		expect(managerSidebar).not.toContain('/settings/roles')
	})
})
