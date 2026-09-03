import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

/**
 * RETIRED — phase 6 of the UI/UX overhaul (S2, `phase-06-surface-consolidation_PLAN_03-09-26.md`).
 *
 * There were two live leave-filing forms of different quality; `/requests` is the canonical one and
 * is the single choke point the role-context and approval-chain tests now drive. This route is kept
 * as a permanent redirect rather than deleted so bookmarks and any external link keep working — the
 * umbrella plan's Public Contracts section is binding: every retired route keeps a redirect.
 */
export const load: PageServerLoad = async () => {
	redirect(308, '/requests?new=leave')
}
