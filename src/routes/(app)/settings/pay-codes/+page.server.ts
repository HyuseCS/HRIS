import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

// The pay masters moved under /payroll; this keeps old bookmarks and links working.
export const load: PageServerLoad = () => {
	redirect(308, '/payroll/pay-codes')
}
