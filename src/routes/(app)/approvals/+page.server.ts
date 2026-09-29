import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

// The approval inbox lives at /requests/approvals; /requests is the user's own filings.
export const load: PageServerLoad = () => {
	redirect(308, '/requests/approvals')
}
