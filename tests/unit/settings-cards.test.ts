import { describe, it, expect } from 'vitest'
import type { Role } from '@prisma/client'
import { load } from '../../src/routes/(app)/settings/+page.server'
import { visibleSettings } from '../../src/lib/settings-destinations'

/**
 * #237 — the Settings index decides which destinations are shown. Two things are pinned here.
 *
 * 1. /settings admits the whole MANAGE_HR set. That is the premise of the Holiday Calendar fix:
 *    reaching this page AT ALL requires MANAGE_HR, so an ungated destination is already
 *    MANAGE_HR-gated — which is exactly what the holidays page enforces. If this guard ever
 *    narrows, the destination's gate silently narrows with it.
 * 2. Roles & Access mirrors the OR that /settings/roles guards on, instead of piggybacking on
 *    ADMINISTER_SYSTEM. Identical sets today; the point is that widening MANAGE_USER_ROLES (#248)
 *    can no longer leave the card behind while the page opens.
 *
 * The four `can*` load flags are gone (phase 07 SC-3): the hub, the settings sub-nav and the
 * sidebar all read `visibleSettings()` from `$lib/settings-destinations` instead, so per-role
 * visibility is pinned on that one function here.
 *
 * The markup itself is Svelte and is covered by tests/e2e/settings-visibility.spec.ts —
 * this repo has no component-test harness and #237 does not justify introducing one.
 */
const run = (role: Role) =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(load as any)({ locals: { user: { id: 'u1', organizationId: 'org1', roles: [role] } } })

const hrefs = (role: Role) => visibleSettings([role]).map((d) => d.href)

// Longhand, not derived from CAPABILITIES — recomputing the table from the table proves nothing.
// toEqual and fully written out: a silently-added destination, a re-ordered group, or a widened
// capability all go red here.
const SUPER_ADMIN_HREFS = [
	'/settings/company',
	'/settings/org',
	'/settings/org-chart',
	'/settings/roles',
	'/settings/schedules',
	'/settings/holidays',
	'/settings/leave-types',
	'/payroll/config',
	'/payroll/statutory-rates',
	'/settings/pay-codes',
	'/settings/salary-grades',
	'/settings/onboarding',
	'/settings/offboarding',
	'/settings/posting-approvers',
	'/settings/job-boards',
	'/settings/performance',
	'/settings/backup'
]

const CEO_HREFS = [
	'/settings/company',
	'/settings/org',
	'/settings/org-chart',
	'/settings/roles',
	'/settings/schedules',
	'/settings/holidays',
	'/settings/leave-types',
	'/payroll/config',
	'/payroll/statutory-rates',
	'/settings/pay-codes',
	'/settings/salary-grades',
	'/settings/onboarding',
	'/settings/offboarding',
	'/settings/posting-approvers',
	'/settings/job-boards',
	'/settings/performance',
	'/settings/backup'
]

// HR Admin proposes statutory rates and administers HR org-wide, but is neither a system admin
// nor a role-changer: no Roles & Access, no Payroll Config, no Document Backup.
const HR_ADMIN_HREFS = [
	'/settings/company',
	'/settings/org',
	'/settings/org-chart',
	'/settings/schedules',
	'/settings/holidays',
	'/settings/leave-types',
	'/payroll/statutory-rates',
	'/settings/pay-codes',
	'/settings/salary-grades',
	'/settings/onboarding',
	'/settings/offboarding',
	'/settings/posting-approvers',
	'/settings/job-boards',
	'/settings/performance'
]

// The whole point of the ADMINISTER_HR_ORGWIDE gate (#178): MANAGER clears the MANAGE_HR guard on
// this surface but NOT /settings/performance's ADMINISTER_HR_ORGWIDE, so Review Schedule must stay
// hidden. Gate it on anything wider and this list goes red — as do Payroll Config, Statutory Rates,
// Roles & Access and Document Backup.
const MANAGER_HREFS = [
	'/settings/company',
	'/settings/org',
	'/settings/org-chart',
	'/settings/schedules',
	'/settings/holidays',
	'/settings/leave-types',
	'/settings/pay-codes',
	'/settings/salary-grades',
	'/settings/onboarding',
	'/settings/offboarding',
	'/settings/posting-approvers',
	'/settings/job-boards'
]

describe('/settings destinations (#237)', () => {
	it('SUPER_ADMIN sees the exact ordered destination list', () => {
		expect(hrefs('SUPER_ADMIN')).toEqual(SUPER_ADMIN_HREFS)
	})

	it('CEO sees the exact ordered destination list', () => {
		expect(hrefs('CEO')).toEqual(CEO_HREFS)
	})

	it('HR_ADMIN sees the exact ordered destination list', () => {
		expect(hrefs('HR_ADMIN')).toEqual(HR_ADMIN_HREFS)
	})

	it('MANAGER sees the exact ordered destination list', () => {
		expect(hrefs('MANAGER')).toEqual(MANAGER_HREFS)
	})

	// The premise of the Holiday Calendar fix (#237): an ungated destination IS a MANAGE_HR-gated
	// destination, because the page guard is what admits the role in the first place.
	it.each<Role>(['MANAGER', 'HR_ADMIN', 'SUPER_ADMIN', 'CEO'])('opens for %s', async (role) => {
		await expect(run(role)).resolves.toBeUndefined()
	})

	it.each<Role>(['EMPLOYEE', 'FINANCE', 'PAYROLL_OFFICER', 'VERIFIER', 'APPROVER'])(
		'stays closed to %s',
		async (role) => {
			await expect(run(role)).rejects.toMatchObject({ status: 403 })
		}
	)
})
