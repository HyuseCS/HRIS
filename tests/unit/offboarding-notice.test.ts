import { describe, it, expect } from 'vitest'
import { buildOffboardingNotice } from '../../src/lib/server/notifications'

// #185 — the departing employee receives a due-diligence / transition-period notice by
// email, listing their effective date and the clearance checklist. buildOffboardingNotice
// assembles the message so a real mailer only delivers subject/body.
describe('buildOffboardingNotice (#185)', () => {
	const base = {
		employeeName: 'Robin Santos',
		effectiveDate: new Date('2026-08-31T00:00:00Z'),
		checklist: [
			{ label: 'Return company equipment', area: 'IT' as const },
			{ label: 'Settle outstanding loans', area: 'FINANCE' as const }
		]
	}

	it('names the effective date in the subject and body', () => {
		const { subject, body } = buildOffboardingNotice(base)
		expect(subject).toContain('August 31, 2026')
		expect(body).toContain('Hi Robin Santos,')
		expect(body).toContain('effective August 31, 2026')
	})

	// The fixture carries the raw enum values; the assertions below are the display labels —
	// so this also proves the CLEARANCE_AREA_LABELS round-trip (#306).
	it('lists every clearance item with its clearance area', () => {
		const { body } = buildOffboardingNotice(base)
		expect(body).toContain('Return company equipment (IT)')
		expect(body).toContain('Settle outstanding loans (Finance)')
	})

	it('degrades gracefully when the checklist is empty', () => {
		const { body } = buildOffboardingNotice({ ...base, checklist: [] })
		expect(body).toContain('No clearance items configured')
	})
})
