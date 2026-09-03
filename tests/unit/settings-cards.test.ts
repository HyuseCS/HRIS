import { describe, it, expect } from 'vitest'
import type { Role } from '@prisma/client'
import { load } from '../../src/routes/(app)/settings/+page.server'

/**
 * #237 — the Settings index decides which cards are shown. Two things are pinned here.
 *
 * 1. /settings admits the whole MANAGE_HR set. That is the premise of the Holiday Calendar fix:
 *    reaching this page AT ALL requires MANAGE_HR, so an ungated card is already MANAGE_HR-gated —
 *    which is exactly what the holidays page enforces. If this guard ever narrows, the card's
 *    gate silently narrows with it.
 * 2. `canRoles` mirrors the OR that /settings/roles guards on, instead of piggybacking on
 *    ADMINISTER_SYSTEM. Identical sets today; the point is that widening MANAGE_USER_ROLES (#248)
 *    can no longer leave the card behind while the page opens.
 *
 * The card markup itself is Svelte and is covered by tests/e2e/settings-visibility.spec.ts —
 * this repo has no component-test harness and #237 does not justify introducing one.
 */
const run = (role: Role) =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(load as any)({ locals: { user: { id: 'u1', organizationId: 'org1', roles: [role] } } })

describe('/settings index (#237)', () => {
	// Longhand, not derived from CAPABILITIES — recomputing the table from the table proves nothing.
	it.each<[Role, boolean, boolean, boolean, boolean]>([
		// role,            isSuperAdmin, canRoles, canStatutory, canHrOrgwide
		['SUPER_ADMIN', true, true, true, true],
		['CEO', true, true, true, true],
		['HR_ADMIN', false, false, true, true],
		// The whole point of `canHrOrgwide` (#178): MANAGER clears this page's MANAGE_HR guard but
		// NOT /settings/performance's ADMINISTER_HR_ORGWIDE, so the card must stay hidden. Gate the
		// Review Schedule card on anything wider and this row goes red.
		['MANAGER', false, false, false, false]
	])(
		'%s gets the expected card flags',
		async (role, isSuperAdmin, canRoles, canStatutory, canHrOrgwide) => {
			// toEqual, not toMatchObject: a new flag must be added to this table, never slip in unseen.
			await expect(run(role)).resolves.toEqual({
				isSuperAdmin,
				canRoles,
				canStatutory,
				canHrOrgwide
			})
		}
	)

	// The premise of the Holiday Calendar fix (#237): an ungated card IS a MANAGE_HR-gated card.
	it.each<Role>(['MANAGER', 'HR_ADMIN', 'SUPER_ADMIN', 'CEO'])('opens for %s', async (role) => {
		await expect(run(role)).resolves.toBeDefined()
	})

	it.each<Role>(['EMPLOYEE', 'FINANCE', 'PAYROLL_OFFICER', 'VERIFIER', 'APPROVER'])(
		'stays closed to %s',
		async (role) => {
			await expect(run(role)).rejects.toMatchObject({ status: 403 })
		}
	)
})
