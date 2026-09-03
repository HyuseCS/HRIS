import { describe, it, expect } from 'vitest'
import { buildReviewNotice } from '../../src/lib/server/notifications'

// #178 item 166 — the wording of the two email-carrying reminder kinds. `due-soon` and
// `awaiting-ack` are in-app only and deliberately have no message here; `ReviewNoticeKind`
// admits only 'opened' and 'overdue', so adding one is a compile error, not a silent email.
describe('buildReviewNotice (#178)', () => {
	const base = {
		recipientName: 'Robin Santos',
		cycleName: 'Aug–Sep 2026',
		reviewUrl: '/performance/reviews/rev-1'
	}

	it('names the cycle and links the review when the review opens', () => {
		const { subject, body } = buildReviewNotice('opened', base)
		expect(subject).toContain('Aug–Sep 2026')
		expect(subject).not.toMatch(/overdue/i)
		expect(body).toContain('Hi Robin Santos,')
		expect(body).toContain('is open')
		expect(body).toContain('/performance/reviews/rev-1')
	})

	it('says overdue in the subject and body when the review is past due', () => {
		const { subject, body } = buildReviewNotice('overdue', base)
		expect(subject).toMatch(/^Overdue: /)
		expect(subject).toContain('Aug–Sep 2026')
		expect(body).toContain('Hi Robin Santos,')
		expect(body).toContain('is now overdue')
		expect(body).toContain('/performance/reviews/rev-1')
	})
})
