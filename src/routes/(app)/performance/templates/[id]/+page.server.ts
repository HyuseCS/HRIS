import { fail, isHttpError } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import { templateMetaSchema, templateStructureSchema } from '$lib/server/performance/schemas'
import {
	getTemplate,
	updateTemplate,
	countReviewsUsingTemplate
} from '$lib/server/services/performance-templates'
import type { Actions, PageServerLoad } from './$types'

/**
 * `/performance/templates/[id]` — the template builder (#178).
 *
 * ADMINISTER_HR_ORGWIDE as the literal first statement of the load and of the action; the service
 * independently re-checks `template.organizationId`, so a guessed id from another tenant 404s
 * even if the capability check passed.
 *
 * The whole template is edited as ONE client-side draft and committed by a single Save: the
 * builder POSTs the entire structure as one JSON field. This deliberately diverges from
 * `settings/onboarding`'s per-row `?/move` / `?/save` actions — it is a decision, not an
 * inconsistency: composing a five-category form through per-row actions is ~40 round-trips, and
 * the structure is stored as one JSON column anyway, so one field means one parse and one failure
 * mode.
 */

function issuesOf(error: { issues: { path: (string | number)[]; message: string }[] }) {
	return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
}

export const load: PageServerLoad = async ({ locals, params }) => {
	requireAnyCapability(locals.user!.roles, 'ADMINISTER_HR_ORGWIDE')
	const template = await getTemplate(params.id, locals.user!.organizationId)
	const openReviewCount = await countReviewsUsingTemplate(template.id)

	// Defensive read: Postgres cannot validate the JSON, so a structure written before a shape
	// change (or by hand) must render an error banner, never a half-built form.
	const parsed = templateStructureSchema.safeParse(template.structure)

	return {
		template: {
			id: template.id,
			name: template.name,
			isActive: template.isActive,
			createdAt: template.createdAt,
			updatedAt: template.updatedAt
		},
		structure: parsed.success ? parsed.data : null,
		structureError: parsed.success
			? null
			: (parsed.error.issues[0]?.message ?? 'This template is stored in an unreadable shape'),
		openReviewCount
	}
}

export const actions: Actions = {
	updateTemplate: async ({ request, locals, params, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'ADMINISTER_HR_ORGWIDE')
		const data = Object.fromEntries(await request.formData())

		const meta = templateMetaSchema.safeParse({
			name: data.name,
			isActive: data.isActive === 'true' || data.isActive === 'on'
		})
		if (!meta.success)
			return fail(422, { error: 'Give the template a name', issues: issuesOf(meta.error) })

		let raw: unknown
		try {
			raw = JSON.parse(String(data.structure ?? ''))
		} catch {
			return fail(422, { error: 'The template structure is not valid JSON', issues: [] })
		}

		// ID STABILITY: the builder sends every row's id back with the draft, and this action stores
		// them verbatim. Ids are minted once, when a row is first added, and NEVER regenerated on
		// edit — regenerating one would orphan every answer keyed to it in every already-open review
		// that snapshotted the old id. A row arriving with no id is a NEW row and the builder gives
		// it one before it ever reaches here.
		const structure = templateStructureSchema.safeParse(raw)
		if (!structure.success)
			return fail(422, {
				error: structure.error.issues[0]?.message ?? 'Invalid template structure',
				issues: issuesOf(structure.error)
			})

		try {
			await updateTemplate(
				params.id,
				locals.user!.organizationId,
				{ name: meta.data.name, isActive: meta.data.isActive, structure: structure.data },
				{
					organizationId: locals.user!.organizationId,
					actorId: locals.user!.id,
					actorRoles: locals.user!.roles,
					ipAddress: getClientAddress()
				}
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message), issues: [] })
			throw e
		}
		return { saved: true }
	}
}
