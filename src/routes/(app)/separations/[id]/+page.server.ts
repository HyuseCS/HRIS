import { fail, isHttpError } from '@sveltejs/kit'
import { canAny, requireAnyCapability } from '$lib/server/rbac'
import {
	getSeparation,
	computeFinalPay,
	setClearanceItem,
	finalizeSeparation,
	finalizeBarFor,
	undoSeparation,
	aggregateWriteOff,
	type FinalPayResult
} from '$lib/server/services/separation'
import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = locals.user!
	requireAnyCapability(user.roles, 'MANAGE_HR')

	const record = await getSeparation(params.id, user.organizationId)

	// #304/D-4 — derived HERE, not carried on the action return, because the banner has to
	// survive a page reload. ALL THREE terms are required (B-1): a fully restored record keeps
	// its `preFinalizeState`, so the first term is what tells it apart from a pre-#304 one.
	// Without it, every undone record would claim "could not be restored automatically" on every
	// reload — a money lie. The status test is `!== 'FINALIZED'` rather than `=== 'CLEARED'`
	// because a re-opened case is now OPEN (B-4) and must still show the banner.
	//
	// Computed BEFORE the strip below, which removes the very field the first term reads.
	const partiallyRestored =
		record.preFinalizeState === null &&
		record.finalPayBreakdown !== null &&
		record.status !== 'FINALIZED'
	const writeOff = partiallyRestored ? aggregateWriteOff(record.finalPayBreakdown) : null

	// `getSeparation` uses `include`, so every scalar ships to the client otherwise — and this
	// one holds loan ids and balances. Two prior leaks (#111, #290) came from exactly this.
	const { preFinalizeState: _drop, ...separation } = record

	// Finalized cases show the snapshot persisted at finalization; open cases get a
	// live preview of what final pay would be if finalized now.
	const finalPay =
		separation.status === 'FINALIZED' && separation.finalPayBreakdown
			? (separation.finalPayBreakdown as unknown as FinalPayResult)
			: await computeFinalPay(params.id, user.organizationId)

	// Cosmetic affordance only — finalizeSeparation is the enforcement (house rule: a UI check is
	// never enforcement). Same helper, so the button and the guard cannot drift.
	const finalizeBar =
		separation.status === 'FINALIZED' ? null : await finalizeBarFor(separation, user.id)

	// Cosmetic affordance only, same house rule as `finalizeBar` above — `undoSeparation`
	// enforces OVERRIDE_FINALIZED in the service, and that is the only enforcement.
	const canUndo = separation.status === 'FINALIZED' && canAny(user.roles, 'OVERRIDE_FINALIZED')

	return { separation, finalPay, finalizeBar, canUndo, partiallyRestored, writeOff }
}

export const actions: Actions = {
	toggleClearance: async ({ request, locals, getClientAddress }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'MANAGE_HR')

		const data = await request.formData()
		const itemId = data.get('itemId') as string
		const cleared = data.get('cleared') === 'true'
		if (!itemId) return fail(400, { error: 'Missing clearance item.' })

		try {
			await setClearanceItem(itemId, user.organizationId, cleared, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			if (e instanceof Error) return fail(400, { error: e.message })
			throw e
		}
		return { ok: true }
	},

	finalize: async ({ locals, params, getClientAddress }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'MANAGE_HR')

		try {
			await finalizeSeparation(params.id, user.organizationId, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			if (e instanceof Error) return fail(400, { error: e.message })
			throw e
		}
		return { finalized: true }
	},

	// #304. MANAGE_HR is the coarse page gate only; the break-glass capability
	// (OVERRIDE_FINALIZED) is enforced inside `undoSeparation`, and this action deliberately
	// does not duplicate it. There is no /api/v1/separations endpoint, so this is the only door.
	undo: async ({ request, locals, params, getClientAddress }) => {
		const user = locals.user!
		requireAnyCapability(user.roles, 'MANAGE_HR')

		const data = await request.formData()
		const reopenClearance = data.get('reopenClearance') === 'true'

		try {
			const result = await undoSeparation(params.id, user.organizationId, reopenClearance, {
				organizationId: user.organizationId,
				actorId: user.id,
				actorRoles: user.roles,
				ipAddress: getClientAddress()
			})
			return { undone: true, ...result }
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			if (e instanceof Error) return fail(400, { error: e.message })
			throw e
		}
	}
}
