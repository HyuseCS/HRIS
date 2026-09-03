import { apiError } from '$lib/server/api-error'
import { fetchPayslipDocument } from '$lib/server/services/payroll/payslip-fetch'
import { renderPayslipPdf } from '$lib/server/services/payroll/payslip-pdf'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) return apiError(401, 'Unauthorized')

	const result = await fetchPayslipDocument(params.id, {
		userId: locals.user.id,
		roles: locals.user.roles,
		organizationId: locals.user.organizationId
	})

	if (!result.ok) return apiError(result.status, result.message)

	const pdf = await renderPayslipPdf(result.document)

	// Convert Node Buffer → Uint8Array so it matches Response's BodyInit type.
	return new Response(new Uint8Array(pdf), {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `inline; filename="payslip-${params.id}.pdf"`,
			'Cache-Control': 'private, no-store',
			'X-Content-Type-Options': 'nosniff'
		}
	})
}
