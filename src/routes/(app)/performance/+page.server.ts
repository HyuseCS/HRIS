import { canAny } from '$lib/server/rbac'
import {
	listReviewsForEmployee,
	listReviewsForReviewer,
	redactForSubject,
	listReviewCycles,
	listStalledSignoffs
} from '$lib/server/services/performance'
import { countEmployeesWithoutTemplate } from '$lib/server/services/performance-templates'
import { db } from '$lib/server/db'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!
	const isAdmin = canAny(user.roles, 'MANAGE_HR')

	const cycles = isAdmin ? await listReviewCycles(user.organizationId) : []

	// #178: the template-readiness count is org-wide configuration, so it reads
	// ADMINISTER_HR_ORGWIDE — not MANAGE_HR, which includes MANAGER (#133). A manager or an
	// employee never runs the query, and reads 0. Informational only: nothing gates on it.
	// #178 item 145: the stalled sign-off list is org-wide HR work, so it reads the same
	// ADMINISTER_HR_ORGWIDE. The gate holds twice, on purpose: the query never runs for anyone
	// without the capability, AND `canHrOrgwide` goes to the page so the section is not rendered
	// for them. The empty list is a legitimate state for HR (nothing is stalled), so emptiness
	// cannot double as the visibility test — the flag has to be its own answer.
	const canHrOrgwide = canAny(user.roles, 'ADMINISTER_HR_ORGWIDE')

	const templateBackfill = canHrOrgwide
		? await countEmployeesWithoutTemplate(user.organizationId)
		: 0
	const stalledSignoffs = canHrOrgwide ? await listStalledSignoffs(user.organizationId) : []

	// #6: the ACTIVE org, not the home tenant — a multi-org account must not see the other
	// tenant's reviews here. Only `.id` is read below, so the select stays narrow.
	const myEmployee = await db.employee.findFirst({
		where: { userId: user.id, organizationId: user.organizationId },
		select: { id: true }
	})
	if (!myEmployee) {
		return {
			myReviews: [],
			reviewsToGive: [],
			isAdmin,
			cycles,
			templateBackfill,
			canHrOrgwide,
			stalledSignoffs
		}
	}

	const [myReviews, reviewsToGive] = await Promise.all([
		listReviewsForEmployee(myEmployee.id),
		listReviewsForReviewer(myEmployee.id)
	])

	// #179: My Reviews are the viewer's own reviews as the subject — strip the HR-authored
	// comments and rating so the confidential review never reaches the reviewed employee.
	return {
		myReviews: myReviews.map(redactForSubject),
		reviewsToGive,
		isAdmin,
		cycles,
		templateBackfill,
		canHrOrgwide,
		stalledSignoffs
	}
}
