import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

// The page is called Inquiries now. The old URL stays alive so stored links and any notification
// written before the rename still land. Same shape as /approvals → /requests/approvals.
export const load: PageServerLoad = () => {
	redirect(308, '/inquiries')
}
