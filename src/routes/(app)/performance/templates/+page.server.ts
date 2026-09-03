import { fail, isHttpError, redirect } from '@sveltejs/kit'
import { requireAnyCapability } from '$lib/server/rbac'
import {
	blankTemplateStructure,
	templateMetaSchema,
	templateStructureSchema
} from '$lib/server/performance/schemas'
import {
	listTemplates,
	createTemplate,
	setTemplateActive,
	deleteTemplate,
	countEmployeesWithoutTemplate
} from '$lib/server/services/performance-templates'
import type { Actions, PageServerLoad } from './$types'

/**
 * `/performance/templates` — the evaluation-template list (#178).
 *
 * ADMINISTER_HR_ORGWIDE, not MANAGE_HR: MANAGE_HR includes MANAGER (#133 made managers on-branch
 * HR), and templates are org-wide configuration. The guard is the literal FIRST statement of the
 * load and of every action rather than a shared wrapper — #290 was misread because a reviewer
 * read a handler body instead of the `actions` export, and a literal first line is what makes
 * that reading correct.
 */

export const load: PageServerLoad = async ({ locals }) => {
	requireAnyCapability(locals.user!.roles, 'ADMINISTER_HR_ORGWIDE')
	const organizationId = locals.user!.organizationId
	const [templates, backfillCount] = await Promise.all([
		listTemplates(organizationId),
		countEmployeesWithoutTemplate(organizationId)
	])
	return { templates, backfillCount }
}

function ctxOf(locals: App.Locals, ip: string) {
	return {
		organizationId: locals.user!.organizationId,
		actorId: locals.user!.id,
		actorRoles: locals.user!.roles,
		ipAddress: ip
	}
}

/** Zod issues flattened for the builder, which shows each error on its offending row. */
function issuesOf(error: { issues: { path: (string | number)[]; message: string }[] }) {
	return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
}

export const actions: Actions = {
	createTemplate: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'ADMINISTER_HR_ORGWIDE')
		const data = Object.fromEntries(await request.formData())

		const meta = templateMetaSchema.pick({ name: true }).safeParse(data)
		if (!meta.success)
			return fail(422, { error: 'Give the template a name', issues: issuesOf(meta.error) })

		// A brand-new template starts from the shared blank (rating scale, bands, narratives,
		// recommendations, signing order) so the builder never opens on a void. "Duplicate" posts
		// the source template's structure through this same field.
		let raw: unknown = blankTemplateStructure()
		if (typeof data.structure === 'string' && data.structure.trim() !== '') {
			try {
				raw = JSON.parse(data.structure)
			} catch {
				return fail(422, { error: 'The template structure is not valid JSON', issues: [] })
			}
		}
		const structure = templateStructureSchema.safeParse(raw)
		if (!structure.success)
			return fail(422, {
				error: structure.error.issues[0]?.message ?? 'Invalid template structure',
				issues: issuesOf(structure.error)
			})

		let id: string
		try {
			const template = await createTemplate(
				locals.user!.organizationId,
				{ name: meta.data.name, structure: structure.data },
				ctxOf(locals, getClientAddress())
			)
			id = template.id
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message), issues: [] })
			throw e
		}
		redirect(303, `/performance/templates/${id}`)
	},

	setActive: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'ADMINISTER_HR_ORGWIDE')
		const data = await request.formData()
		const id = data.get('id')
		const isActive = data.get('isActive')
		if (typeof id !== 'string' || !id || (isActive !== 'true' && isActive !== 'false'))
			return fail(400, { error: 'Missing template id or state' })
		try {
			await setTemplateActive(
				id,
				locals.user!.organizationId,
				isActive === 'true',
				ctxOf(locals, getClientAddress())
			)
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { updated: true }
	},

	/**
	 * Permanent removal, for a template no review has ever used. Same `ADMINISTER_HR_ORGWIDE`
	 * literal-first-statement guard as `setActive` above — this is the more destructive of the two
	 * and may not be the weaker-guarded one.
	 *
	 * The service, not this action, decides whether the template is deletable: it counts the
	 * referencing reviews inside the delete's own transaction, so a template that became used
	 * between the page render and this POST is refused with a 409 the banner shows.
	 */
	deleteTemplate: async ({ request, locals, getClientAddress }) => {
		requireAnyCapability(locals.user!.roles, 'ADMINISTER_HR_ORGWIDE')
		const id = (await request.formData()).get('id')
		if (typeof id !== 'string' || !id) return fail(400, { error: 'Missing template id' })
		try {
			await deleteTemplate(id, locals.user!.organizationId, ctxOf(locals, getClientAddress()))
		} catch (e: unknown) {
			if (isHttpError(e)) return fail(e.status, { error: String(e.body.message) })
			throw e
		}
		return { deleted: true }
	}
}
