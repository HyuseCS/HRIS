import { redirect } from '@sveltejs/kit'
import { db } from '$lib/server/db'
import { listUnread } from '$lib/server/services/notifications'
import { countPendingApprovals } from '$lib/server/services/approvals'
import { countWaitingInquiries } from '$lib/server/services/complaints'
import { takeFlash } from '$lib/server/flash'
import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	if (!locals.user) {
		redirect(302, '/login')
	}

	const user = locals.user
	// Read AND clear before the awaits below: a redirect-after-success parked its message here
	// because the redirect threw its `form` payload away.
	const flash = takeFlash(cookies)

	const [notifications, pendingApprovals, waitingInquiries, memberships, currentOrg] =
		await Promise.all([
			listUnread(user.id),
			countPendingApprovals({
				id: user.id,
				roles: user.roles,
				organizationId: user.organizationId
			}),
			// #112 — inquiry threads waiting on this actor, scoped exactly like the list they link to.
			countWaitingInquiries({
				id: user.id,
				roles: user.roles,
				organizationId: user.organizationId
			}),
			db.userOrganization.findMany({
				where: { userId: user.id },
				select: { organization: { select: { id: true, name: true } } },
				orderBy: { organization: { name: 'asc' } }
			}),
			// The active org (session currentOrgId already folded into user.organizationId
			// by hooks) — drives the header logo/branding for the tenant in view.
			db.organization.findUnique({
				where: { id: user.organizationId },
				select: { id: true, name: true, logoUrl: true, themePrimary: true }
			})
		])

	// Only cross-org members get a switcher; the layout hides it when length <= 1.
	const memberOrgs = memberships.map((m) => m.organization)

	return {
		org: currentOrg,
		user: {
			id: user.id,
			email: user.email,
			roles: user.roles,
			organizationId: user.organizationId
		},
		memberOrgs,
		notifications,
		pendingApprovals,
		waitingInquiries,
		flash
	}
}
