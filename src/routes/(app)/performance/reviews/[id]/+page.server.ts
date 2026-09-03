import { fail, isHttpError } from '@sveltejs/kit'
import { db } from '$lib/server/db'
import { canAny, requireAnyCapability } from '$lib/server/rbac'
import { assertCanTouchEmployee } from '$lib/server/services/employee-access'
import {
	answersSchemaFor,
	employeeCommentsSchema,
	templateStructureSchema
} from '$lib/server/performance/schemas'
import {
	getReview,
	redactForSubject,
	saveSelfAssessment,
	saveEmployeeComments,
	submitScores,
	acknowledgeReview,
	attestSignoff,
	releaseReview,
	resolveSlotHolders
} from '$lib/server/services/performance'
import { nextSignatorySlot } from '$lib/server/performance/signoff-plan'
import type { Actions, PageServerLoad } from './$types'

function issuesOf(error: { issues: { path: (string | number)[]; message: string }[] }) {
	return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
}

/** The review's own snapshotted form, or `null` when it is missing/unreadable (#178 item 130). */
function structureOf(templateSnapshot: unknown) {
	const snapshot = templateSnapshot as { structure?: unknown } | null
	const parsed = templateStructureSchema.safeParse(snapshot?.structure)
	return parsed.success ? parsed.data : null
}

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = locals.user!
	const review = await getReview(params.id, user.organizationId)
	const meId = await myEmployeeId(user)

	const isSubject = meId === review.employee.id
	const isReviewer = meId === review.reviewer.id

	// A review is private to its two participants. Org scoping alone let any colleague
	// read someone's self-assessment, manager comments and rating by walking ids —
	// isSubject/isReviewer only drove the UI.
	//
	// #282: this was `requireAnyMinRole(user.roles,'HR_ADMIN')`, which MANAGER clears (#133), so
	// every manager read every review. Object-scoped instead: org-wide HR still reads any review,
	// and a manager reads their own people's. Note this also WIDENS — an EMPLOYEE-role supervisor
	// or branch manager now reaches their own people's reviews, matching /employees/[id].
	if (!isSubject && !isReviewer) {
		await assertCanTouchEmployee(user, review.employee.id)
	}

	// #178 AC6 (was #179): the reviewed employee never sees the evaluator-authored review — the
	// manager comments, the rating and the whole `answers` blob — UNTIL HR releases it. The gate
	// is `releasedAt`, read inside `redactForSubject`; this line only decides who it applies to.
	// The reviewer and HR always get the whole thing.
	const visibleReview = isSubject && !isReviewer ? redactForSubject(review) : review

	// #178 item 130 — DEFENSIVE READ. Postgres validates nothing inside the JSON, so a snapshot
	// that is missing or stored in a shape this code cannot read must render an error banner, NOT
	// a half-built evaluation form. A silently empty form would be signed as if it were complete.
	//
	// The banner text is fixed on purpose: the zod issue can name criterion ids from the form, and
	// this page is also served to the review's subject.
	const structure = structureOf(review.templateSnapshot)

	// #178 item 143 — the signature block's data.
	//
	// The ORDER comes from THIS review's own snapshot (`structure.signatoryOrder`), never from the
	// live `PerformanceTemplate.structure`: reordering a template must leave work already in
	// progress exactly as it was.
	//
	// WHOSE TURN IT IS comes from `nextSignatorySlot` — the SAME function `attestSignoff` calls.
	// A page that decided the turn its own way would eventually show an Attest button the service
	// refuses, or hide one it would have accepted.
	//
	// The relations `resolveSlotHolders` reads are not on `getReview`'s include, so they are
	// fetched here. Scoped through `cycle.organizationId` like every other reader.
	const signoffContext = await db.performanceReview.findFirst({
		where: { id: params.id, cycle: { organizationId: user.organizationId } },
		select: {
			cycle: { select: { organizationId: true } },
			employee: {
				select: { userId: true, department: { select: { head: { select: { userId: true } } } } }
			},
			reviewer: { select: { userId: true } },
			signoffs: {
				select: { slotId: true, roleLabel: true, typedName: true, attestedAt: true },
				orderBy: { order: 'asc' }
			}
		}
	})

	const signatoryOrder = structure?.signatoryOrder ?? []
	const signoffs = signoffContext?.signoffs ?? []
	const nextSlot = signoffContext ? nextSignatorySlot(signatoryOrder, signoffs) : null

	// Holders for EVERY slot, not just the next one, so a slot that nobody can ever sign is named
	// as stalled where it sits instead of looking like it is merely waiting its turn. Only
	// HR_REPRESENTATIVE costs a query; the other three roles are field reads on the row above.
	const holders = signoffContext
		? await Promise.all(signatoryOrder.map((slot) => resolveSlotHolders(slot, signoffContext)))
		: []
	const unstaffedSlotIds = signatoryOrder
		.filter((_, i) => holders[i].length === 0)
		.map((slot) => slot.id)

	// The affordance, and ONLY the affordance. The service re-runs both checks itself, because a
	// direct POST never passes through this page.
	const nextSlotIndex = nextSlot ? signatoryOrder.findIndex((s) => s.id === nextSlot.id) : -1
	const mayIAttest = nextSlotIndex >= 0 && holders[nextSlotIndex].includes(user.id)

	// #178 item 153 — the affordance for the Release button, and ONLY the affordance. The
	// `release` action re-runs the identical capability check, because a direct POST never passes
	// through this page. ADMINISTER_HR_ORGWIDE, never MANAGE_HR: MANAGE_HR holds MANAGER (#133),
	// and a team lead must not be able to release an evaluation to the person they evaluated.
	const canRelease = canAny(user.roles, 'ADMINISTER_HR_ORGWIDE')

	return {
		review: visibleReview,
		isSubject,
		isReviewer,
		canRelease,
		structure,
		structureError: structure
			? null
			: 'This review has no readable evaluation form — its stored template is missing or in an unreadable shape. Ask HR to reopen the review.',
		signatoryOrder,
		signoffs,
		nextSlot,
		unstaffedSlotIds,
		mayIAttest
	}
}

function ctxOf(locals: App.Locals, ip: string) {
	return {
		organizationId: locals.user!.organizationId,
		actorId: locals.user!.id,
		actorRoles: locals.user!.roles,
		ipAddress: ip
	}
}
/**
 * The caller's employee row IN THE ACTIVE ORG, or `null` when they have none there (#6).
 *
 * Takes the user object rather than a bare id so the org value is in the signature, matching
 * `findSelfEmployee(user)` at `punch/+page.server.ts:40`.
 *
 * Returns `null`, never `''`: an empty string type-checks as a valid employee id and reads as a
 * person who does not exist. The services already reject it (they compare it against the review's
 * own participants and throw 409), so this is a message-quality fix — the caller now gets "No
 * employee profile found." instead of "Only the review subject can submit a self-assessment".
 */
async function myEmployeeId(user: { id: string; organizationId: string }) {
	const me = await db.employee.findFirst({
		where: { userId: user.id, organizationId: user.organizationId },
		select: { id: true }
	})
	return me?.id ?? null
}
async function run(fn: () => Promise<unknown>) {
	try {
		await fn()
		return { success: true }
	} catch (e: unknown) {
		if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
		throw e
	}
}

export const actions: Actions = {
	saveSelf: async ({ request, locals, params, getClientAddress }) => {
		const text = (await request.formData()).get('selfAssessment') as string
		if (!text?.trim()) return fail(422, { error: 'Self-assessment cannot be empty' })
		const employeeId = await myEmployeeId(locals.user!)
		if (!employeeId) return fail(400, { error: 'No employee profile found.' })
		return run(() =>
			saveSelfAssessment(params.id, employeeId, text, ctxOf(locals, getClientAddress()))
		)
	},

	/**
	 * The evaluator submits what they TYPED (#178 item 128). CAPTURE ONLY — plan §0: nothing here
	 * sums criteria into a subtotal, weights subtotals into a total, or derives a band. It parses
	 * and hands the object to the service verbatim.
	 *
	 * ONE form field, `answers`, carrying the whole §4.2 object as a JSON string — the same
	 * decision as the template builder's single `structure` field (plan §8.2): one field, one
	 * parse, one failure mode, instead of index-encoded names and a bespoke parser.
	 *
	 * Parsed against THIS review's own snapshot, never the live template — the snapshot is the
	 * form the review was opened against. The service re-runs the identical parse: this copy is
	 * for the form's error messages, and a direct POST that skipped the page would skip it, so
	 * neither copy replaces the other.
	 */
	submitScores: async ({ request, locals, params, getClientAddress }) => {
		const data = await request.formData()
		const reviewerId = await myEmployeeId(locals.user!)
		if (!reviewerId) return fail(400, { error: 'No employee profile found.' })
		const review = await getReview(params.id, locals.user!.organizationId)

		// IDENTITY BEFORE CONTENT, matching the service's own guard order: a non-reviewer never
		// learns whether their payload would have been valid, and never learns the shape of
		// someone else's form. The service re-checks this independently.
		if (review.reviewer.id !== reviewerId) {
			return fail(409, { error: 'Only the assigned reviewer can submit scores' })
		}

		const structure = structureOf(review.templateSnapshot)
		if (!structure) return fail(409, { error: 'This review has no readable form template' })

		let raw: unknown
		try {
			raw = JSON.parse(String(data.get('answers') ?? ''))
		} catch {
			return fail(422, { error: 'The submitted scores are not valid JSON', issues: [] })
		}

		const parsed = answersSchemaFor(structure).safeParse(raw)
		if (!parsed.success) {
			return fail(422, {
				error: parsed.error.issues[0]?.message ?? 'Invalid scores',
				issues: issuesOf(parsed.error)
			})
		}

		return run(() =>
			submitScores(params.id, reviewerId, parsed.data, ctxOf(locals, getClientAddress()))
		)
	},

	/** The paper form's "Employee Comments" (#178 item 129) — employee-authored, always theirs. */
	saveEmployeeComments: async ({ request, locals, params, getClientAddress }) => {
		const parsed = employeeCommentsSchema.safeParse(Object.fromEntries(await request.formData()))
		if (!parsed.success) {
			return fail(422, { error: parsed.error.issues[0]?.message ?? 'Comments cannot be empty' })
		}
		const employeeId = await myEmployeeId(locals.user!)
		if (!employeeId) return fail(400, { error: 'No employee profile found.' })
		return run(() =>
			saveEmployeeComments(
				params.id,
				employeeId,
				parsed.data.employeeComments,
				ctxOf(locals, getClientAddress())
			)
		)
	},

	acknowledge: async ({ locals, params, getClientAddress }) => {
		const employeeId = await myEmployeeId(locals.user!)
		if (!employeeId) return fail(400, { error: 'No employee profile found.' })
		return run(() => acknowledgeReview(params.id, employeeId, ctxOf(locals, getClientAddress())))
	},

	/**
	 * One signatory signs one slot (#178 item 143).
	 *
	 * Deliberately thin: the turn check, the holder check, the range check on the typed name and
	 * the duplicate-row race all live in `attestSignoff`, where a direct POST cannot skip them.
	 * Re-checking any of them here would be a second answer that can drift from the first.
	 */
	/**
	 * HR releases the review to its subject (#178 item 152, SPEC AC7).
	 *
	 * THE CAPABILITY CHECK IS THE FIRST LINE, before any form read or parse. There is no form body
	 * to read here, and there must never be one added above this line: a caller who is refused
	 * must be refused before anything they sent is touched.
	 *
	 * It THROWS rather than returning `fail(403)`, matching every other capability guard in this
	 * feature (`performance/templates/[id]/+page.server.ts:57`): a 403 is not a form error the
	 * user can correct.
	 */
	release: async ({ locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'ADMINISTER_HR_ORGWIDE')
		return run(() =>
			releaseReview(
				params.id,
				locals.user!.organizationId,
				locals.user!.id,
				ctxOf(locals, getClientAddress())
			)
		)
	},

	attest: async ({ request, locals, params, getClientAddress }) => {
		const typedName = String((await request.formData()).get('typedName') ?? '')
		return run(() =>
			attestSignoff(
				params.id,
				locals.user!.organizationId,
				locals.user!.id,
				typedName,
				ctxOf(locals, getClientAddress())
			)
		)
	}
}
