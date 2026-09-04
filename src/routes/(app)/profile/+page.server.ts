import { fail, redirect } from '@sveltejs/kit'
import { z } from 'zod'
import { canAny } from '$lib/server/rbac'
import { db } from '$lib/server/db'
import { getEmployee, updateEmployee } from '$lib/server/services/employees'
import { listEmployeeDocuments } from '$lib/server/services/documents'
import { listEnrollmentsForEmployee } from '$lib/server/services/benefits'
import { listPunches } from '$lib/server/services/timelog'
import { manilaDateTime, manilaDayKey } from '$lib/utils/dates'
import { isValidPhone, phoneError } from '$lib/utils/phone'
import type { Actions, PageServerLoad } from './$types'

// How far back the read-only punch view looks. Discord punches accumulate quickly, so a
// two-week window keeps the list useful without paging.
const PUNCH_WINDOW_DAYS = 14

const PUNCH_LABELS: Record<string, string> = {
	IN: 'Clock in',
	OUT: 'Clock out',
	BREAK_START: 'Break start',
	BREAK_END: 'Break end'
}

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user!

	// Scope to the active org: a cross-org account (the CEO) carries one profile in its home
	// tenant only, so in the others this finds nothing and we guard cleanly to the dashboard
	// rather than letting getEmployee 404 on an org mismatch.
	const employeeRecord = await db.employee.findFirst({
		where: { userId: user.id, organizationId: user.organizationId },
		select: { id: true }
	})

	if (!employeeRecord) redirect(303, '/dashboard')

	const from = new Date(Date.now() - PUNCH_WINDOW_DAYS * 24 * 60 * 60 * 1000)

	const [employee, documents, benefits, rawPunches] = await Promise.all([
		// #111: mask sensitive fields in the payload even for one's own record — the profile page
		// renders none of them, so this only stops the raw values shipping in the load JSON.
		getEmployee(employeeRecord.id, user.organizationId, { isSelf: true }),
		listEmployeeDocuments(employeeRecord.id, user.organizationId),
		listEnrollmentsForEmployee(employeeRecord.id),
		listPunches(employeeRecord.id, { from })
	])

	// Format PHT date/time server-side (newest first) so the read-only view is timezone-safe.
	const punches = rawPunches
		.map((p) => ({
			id: p.id,
			type: p.punchType,
			label: PUNCH_LABELS[p.punchType] ?? p.punchType,
			source: p.source,
			dayKey: manilaDayKey(p.timestamp),
			at: manilaDateTime(p.timestamp)
		}))
		.reverse()

	// Only HR may change employee details (#175); everyone else sees their profile read-only.
	const canManage = canAny(user.roles, 'MANAGE_HR')

	return { employee, documents, benefits, punches, punchWindowDays: PUNCH_WINDOW_DAYS, canManage }
}

const updateSchema = z.object({
	firstName: z.string().min(1).optional(),
	lastName: z.string().min(1).optional(),
	// #24: format-checked. The refine sits after the transform, so a blank field arrives as
	// undefined and is treated as "not submitted" rather than as a bad number.
	contactPhone: z
		.string()
		.optional()
		.transform((v) => v || undefined)
		.refine(isValidPhone, phoneError('Phone')),
	contactAddress: z
		.string()
		.optional()
		.transform((v) => v || undefined),
	dateOfBirth: z
		.string()
		.optional()
		.transform((v) => (v ? new Date(v) : undefined))
})

export const actions: Actions = {
	update: async ({ request, locals }) => {
		const user = locals.user!

		// Employee details are HR-managed (#175); block self-service edits even if the form is
		// bypassed. HR edits any record (including their own) here or on /employees/[id].
		if (!canAny(user.roles, 'MANAGE_HR')) {
			return fail(403, { error: 'Only HR can change employee details.' })
		}

		const employeeRecord = await db.employee.findFirst({
			where: { userId: user.id, organizationId: user.organizationId },
			select: { id: true }
		})

		if (!employeeRecord) {
			return fail(400, { error: 'No employee profile found.' })
		}

		const formData = await request.formData()
		const result = updateSchema.safeParse({
			firstName: formData.get('firstName') || undefined,
			lastName: formData.get('lastName') || undefined,
			contactPhone: formData.get('contactPhone') || undefined,
			contactAddress: formData.get('contactAddress') || undefined,
			dateOfBirth: formData.get('dateOfBirth') || undefined
		})

		if (!result.success) {
			const firstError = result.error.errors[0]
			return fail(400, { error: firstError?.message ?? 'Validation error.' })
		}

		const ctx = {
			organizationId: user.organizationId,
			actorId: user.id,
			actorRoles: user.roles
		}

		try {
			await updateEmployee(employeeRecord.id, user.organizationId, result.data, ctx)
		} catch (err: unknown) {
			const e = err as { body?: { message?: string }; message?: string }
			return fail(400, { error: e?.body?.message ?? e?.message ?? 'Failed to update profile.' })
		}

		return { success: true }
	}
}
