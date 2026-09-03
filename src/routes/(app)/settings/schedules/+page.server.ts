import { fail } from '@sveltejs/kit'
import { db } from '$lib/server/db'
import { requireAnyCapability, requireFoodServiceOrg } from '$lib/server/rbac'
import { isFoodServiceOrg } from '$lib/orgs'
import {
	listSchedules,
	createSchedule,
	setScheduleTardiness,
	setOrgTardiness,
	setOrgAmPmMinGap
} from '$lib/server/services/attendance/schedules'
import {
	AM_PM_MIN_GAP_CEILING,
	AM_PM_MIN_GAP_FLOOR,
	DEFAULT_AM_PM_MIN_GAP_MINUTES
} from '$lib/server/services/attendance/derive'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
	requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
	const organizationId = locals.user!.organizationId
	const [schedules, org] = await Promise.all([
		listSchedules(organizationId),
		db.organization.findUnique({
			where: { id: organizationId },
			select: { trackTardiness: true, amPmMinGapMinutes: true }
		})
	])
	// #190: the org master switch greys out the per-schedule toggles when it's off.
	return {
		schedules,
		orgTracksTardiness: org?.trackTardiness ?? true,
		// #162 — the threshold control renders only for food-service tenants. Cosmetic; the
		// action's requireFoodServiceOrg is the enforcement.
		showAmPmGap: isFoodServiceOrg(organizationId),
		amPmMinGapMinutes: org?.amPmMinGapMinutes ?? null,
		amPmMinGapDefault: DEFAULT_AM_PM_MIN_GAP_MINUTES
	}
}

function hhmmToMin(s: string): number | null {
	const m = /^(\d{1,2}):(\d{2})$/.exec(s ?? '')
	if (!m) return null
	return Number(m[1]) * 60 + Number(m[2])
}

export const actions: Actions = {
	create: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const fd = await request.formData()
		const name = String(fd.get('name') ?? '').trim()
		const startMinutes = hhmmToMin(String(fd.get('start') ?? ''))
		const endMinutes = hhmmToMin(String(fd.get('end') ?? ''))
		const breakMinutes = Number(fd.get('breakMinutes') ?? 0)
		const isDefault = fd.get('isDefault') === 'on'
		const trackTardiness = fd.get('trackTardiness') === 'on'
		const weekdays = fd
			.getAll('weekday')
			.map((v) => Number(v))
			.filter((n) => n >= 0 && n <= 6)

		if (!name || startMinutes === null || endMinutes === null) {
			return fail(400, { error: 'Name, start and end times are required.' })
		}
		try {
			await createSchedule(
				locals.user!.organizationId,
				{ name, isDefault, trackTardiness, startMinutes, endMinutes, breakMinutes, weekdays },
				{
					organizationId: locals.user!.organizationId,
					actorId: locals.user!.id,
					actorRoles: locals.user!.roles,
					ipAddress: getClientAddress()
				}
			)
		} catch (e: unknown) {
			const err = e as { status?: number; body?: { message?: string } }
			if (err?.status === 400) return fail(400, { error: err.body?.message ?? 'Invalid schedule' })
			throw e
		}
		return { success: true }
	},

	toggleOrgTardiness: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const enabled = (await request.formData()).get('enabled') === 'true'
		await setOrgTardiness(locals.user!.organizationId, enabled, {
			organizationId: locals.user!.organizationId,
			actorId: locals.user!.id,
			actorRoles: locals.user!.roles,
			ipAddress: getClientAddress()
		})
		return { success: true }
	},

	setAmPmMinGap: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		// Twin-door rule: the control is only RENDERED for food-service orgs, but a rendering
		// condition is not a gate — a direct POST bypasses it. 404, same as every other
		// food-service-only surface.
		requireFoodServiceOrg(locals.user!.organizationId)

		const raw = String((await request.formData()).get('minutes') ?? '').trim()
		// Empty clears back to NULL, which means "use the built-in default". NULL is a meaningful
		// value here, not a missing one, so the operator must be able to return to it without
		// having to know and retype the default.
		let minutes: number | null = null
		if (raw !== '') {
			// `Number('')` is 0 and `Number('12abc')` is NaN, so coercion alone is not a parse. The
			// bounds check plus `Number.isInteger` in `isValidAmPmMinGap` is what actually stands
			// between a bad value and the database; this regex only adds the notations that WOULD
			// coerce to a valid in-range integer — '1e2', '0x1E', '+45' — which no operator types
			// on purpose and which we would rather reject than silently accept as 100/30/45.
			// `field` names the control the message belongs to, so the page can attach it to the
			// input (aria-invalid + aria-describedby) instead of dropping it in the page-top banner
			// where it is indistinguishable from a tardiness-toggle error. Convention from #142.
			if (!/^\d+$/.test(raw))
				return fail(400, { field: 'minutes', error: 'Enter a whole number of minutes.' })
			minutes = Number(raw)
			if (minutes < AM_PM_MIN_GAP_FLOOR || minutes > AM_PM_MIN_GAP_CEILING)
				return fail(400, {
					field: 'minutes',
					error: `The AM/PM gap must be between ${AM_PM_MIN_GAP_FLOOR} and ${AM_PM_MIN_GAP_CEILING} minutes.`
				})
		}
		try {
			// Always the session's own org — a form-supplied organization id is never read.
			await setOrgAmPmMinGap(locals.user!.organizationId, minutes, {
				organizationId: locals.user!.organizationId,
				actorId: locals.user!.id,
				actorRoles: locals.user!.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			const err = e as { status?: number; body?: { message?: string } }
			if (err?.status)
				return fail(err.status, {
					field: 'minutes',
					error: err.body?.message ?? 'Update failed'
				})
			throw e
		}
		// `saved` is the success confirmation the card renders next to the control. Without it a
		// saved value looks exactly like an unsubmitted one — the number just sits in the box.
		return {
			success: true,
			saved: minutes === null ? 'Cleared — using the default.' : `Saved — ${minutes} minutes.`
		}
	},

	toggleTardiness: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'MANAGE_HR')
		const fd = await request.formData()
		const id = String(fd.get('id') ?? '')
		const enabled = fd.get('enabled') === 'true'
		if (!id) return fail(400, { error: 'Missing schedule id' })
		try {
			await setScheduleTardiness(locals.user!.organizationId, id, enabled, {
				organizationId: locals.user!.organizationId,
				actorId: locals.user!.id,
				actorRoles: locals.user!.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			const err = e as { status?: number; body?: { message?: string } }
			if (err?.status) return fail(err.status, { error: err.body?.message ?? 'Update failed' })
			throw e
		}
		return { success: true }
	}
}
