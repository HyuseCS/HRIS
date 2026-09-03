import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

// See ../+page.server.ts. Notification rows written before the rename hold /complaints/{id}.
export const load: PageServerLoad = ({ params }) => {
	redirect(308, `/inquiries/${params.id}`)
}
