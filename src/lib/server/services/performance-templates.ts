import { error } from '@sveltejs/kit'
import { Prisma } from '@prisma/client'
import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import type { TemplateStructure } from '$lib/server/performance/types'
import type { AuditContext } from './types'

/**
 * Evaluation-template CRUD (#178).
 *
 * A NEW service file rather than an addition to `performance.ts`: that module's export list is
 * mocked VERBATIM by `tests/unit/review-privacy.test.ts`, so every export added to it breaks an
 * unrelated test. Keeping templates here also keeps the review lifecycle and the form definition
 * apart, which is the whole point of the JSON template design.
 *
 * Two repo-wide defect classes this file deliberately avoids adding an instance of:
 *   • #323 — every query org-scopes on the model's OWN `organizationId` column, never through a
 *     `where: { organization: { … } }` join.
 *   • #324 — every audit write happens INSIDE the `$transaction` that carries the mutation and is
 *     passed the `tx` client, so the audit row commits or rolls back with the write it records.
 *
 * NO ARITHMETIC ON SCORES lives here or anywhere in this feature. `sectionCount` below counts
 * array entries; it is not a score and nothing derived from a template's weights, maxima or bands
 * is ever computed.
 */

const ENTITY = 'PerformanceTemplate'

/** Array length only — never a sum. Malformed JSON reports 0 rather than throwing on a list page. */
function sectionCountOf(structure: Prisma.JsonValue): number {
	const sections = (structure as { sections?: unknown } | null)?.sections
	return Array.isArray(sections) ? sections.length : 0
}

/**
 * Prisma types a Json column's input as an index-signature object, which a named interface never
 * satisfies. The value has already been through `templateStructureSchema` by the time it reaches
 * here, so this widens a proven-valid structure rather than hiding an unchecked one.
 */
function asJson(structure: TemplateStructure): Prisma.InputJsonValue {
	return structure as unknown as Prisma.InputJsonValue
}

export async function listTemplates(organizationId: string) {
	const rows = await db.performanceTemplate.findMany({
		where: { organizationId },
		orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
		select: {
			id: true,
			name: true,
			isActive: true,
			structure: true,
			// Deleting a template SET NULLs this FK (see `deleteTemplate`), so the list has to be
			// able to say how many employees a delete would unassign before HR confirms it.
			_count: { select: { assignedEmployees: true } }
		}
	})
	if (rows.length === 0) return []

	// `PerformanceReview.templateId` is a plain column, not a Prisma relation — the snapshot is the
	// record of the form, so the schema deliberately keeps no back-relation to edit through. That
	// puts the review tally out of `_count`'s reach, so it is ONE grouped query for the whole list
	// rather than a count per row.
	const reviewCounts = await db.performanceReview.groupBy({
		by: ['templateId'],
		where: { templateId: { in: rows.map((r) => r.id) } },
		_count: { _all: true }
	})
	const used = new Map(reviewCounts.map((g) => [g.templateId, g._count._all]))

	return rows.map(({ structure, _count, ...t }) => ({
		...t,
		sectionCount: sectionCountOf(structure),
		assignedCount: _count.assignedEmployees,
		reviewCount: used.get(t.id) ?? 0
	}))
}

export async function getTemplate(id: string, organizationId: string) {
	const template = await db.performanceTemplate.findFirst({ where: { id, organizationId } })
	if (!template) error(404, 'Template not found')
	return template
}

export async function createTemplate(
	organizationId: string,
	data: { name: string; structure: TemplateStructure },
	ctx: AuditContext
) {
	try {
		return await db.$transaction(async (tx) => {
			const template = await tx.performanceTemplate.create({
				data: { organizationId, name: data.name, structure: asJson(data.structure) }
			})
			await writeAuditLog(
				ctx,
				{
					action: 'CREATE',
					entityType: ENTITY,
					entityId: template.id,
					// The structure itself is deliberately not copied into the audit row: it is a
					// multi-kilobyte document, and the template row is the record of it.
					newValue: {
						name: template.name,
						isActive: template.isActive,
						sectionCount: sectionCountOf(template.structure)
					}
				},
				tx
			)
			return template
		})
	} catch (e) {
		if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
			error(409, 'A template with that name already exists')
		throw e
	}
}

export async function updateTemplate(
	id: string,
	organizationId: string,
	data: { name: string; isActive: boolean; structure: TemplateStructure },
	ctx: AuditContext
) {
	const before = await getTemplate(id, organizationId)
	try {
		return await db.$transaction(async (tx) => {
			const template = await tx.performanceTemplate.update({
				where: { id: before.id },
				data: { name: data.name, isActive: data.isActive, structure: asJson(data.structure) }
			})
			await writeAuditLog(
				ctx,
				{
					action: 'UPDATE',
					entityType: ENTITY,
					entityId: template.id,
					oldValue: {
						name: before.name,
						isActive: before.isActive,
						sectionCount: sectionCountOf(before.structure)
					},
					newValue: {
						name: template.name,
						isActive: template.isActive,
						sectionCount: sectionCountOf(template.structure)
					}
				},
				tx
			)
			return template
		})
	} catch (e) {
		if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
			error(409, 'A template with that name already exists')
		throw e
	}
}

export async function setTemplateActive(
	id: string,
	organizationId: string,
	isActive: boolean,
	ctx: AuditContext
) {
	const before = await getTemplate(id, organizationId)
	return db.$transaction(async (tx) => {
		const template = await tx.performanceTemplate.update({
			where: { id: before.id },
			data: { isActive }
		})
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: ENTITY,
				entityId: template.id,
				oldValue: { isActive: before.isActive },
				newValue: { isActive: template.isActive }
			},
			tx
		)
		return template
	})
}

/**
 * Permanently remove a template, allowed ONLY while no review has ever referenced it.
 *
 * A template a review has touched is undeletable forever, by design. `templateId` is the review's
 * provenance record for a snapshot it already holds, and there is no FK to stop the row going
 * away — deleting the template would leave that provenance pointing at nothing, silently. HR's
 * answer for a template that has been used is `setTemplateActive(false)`, which retires it from
 * new assignments and leaves every opened review untouched.
 *
 * The count runs INSIDE the delete's own transaction and against the tx client, so the two
 * statements see one snapshot and the delete rolls back with the refusal. Residual, stated
 * plainly: under Postgres READ COMMITTED this does not lock out a review inserted concurrently
 * between the count and the commit. Closing that would need row locks the rest of this feature
 * does not take; the exposure is one HR-initiated click racing a cycle being opened in the same
 * second, and the loser is a provenance id, not a snapshot.
 *
 * The employees assigned to this template are NOT blocked, and are NOT silently ignored either:
 * `employees.assignedTemplateId` is ON DELETE SET NULL, so they are simply unassigned. The list
 * page shows that count in the confirmation before HR agrees to it.
 */
export async function deleteTemplate(id: string, organizationId: string, ctx: AuditContext) {
	// Same org scoping as every other mutation here (#323): the row is resolved by id AND
	// organizationId first, and the write below can only ever name that proven row.
	const before = await getTemplate(id, organizationId)
	await db.$transaction(async (tx) => {
		const used = await tx.performanceReview.count({ where: { templateId: before.id } })
		if (used > 0)
			error(
				409,
				`${used} review${used === 1 ? ' uses' : 's use'} this template, so it cannot be deleted. Deactivate it instead — that retires it from new assignments and leaves those reviews untouched.`
			)

		await tx.performanceTemplate.delete({ where: { id: before.id } })

		// Inside the transaction, on the tx client (#324): the audit row commits with the delete
		// it records, or neither happens.
		await writeAuditLog(
			ctx,
			{
				action: 'DELETE',
				entityType: ENTITY,
				entityId: before.id,
				oldValue: {
					name: before.name,
					isActive: before.isActive,
					sectionCount: sectionCountOf(before.structure)
				}
			},
			tx
		)
	})
}

/**
 * SPEC AC3 readiness count: how many ACTIVE employees still have no template assigned. Purely
 * informational — nothing gates on it.
 */
export async function countEmployeesWithoutTemplate(organizationId: string) {
	return db.employee.count({
		where: { organizationId, employmentStatus: 'ACTIVE', assignedTemplateId: null }
	})
}

/**
 * How many reviews already snapshotted this template. The builder uses it to warn that opened
 * reviews are unaffected by an edit. Scoped by `templateId` alone on purpose — the caller has
 * already proven the template belongs to the org, and `PerformanceReview` has no direct
 * `organizationId` column to scope on without a join (#323).
 */
export async function countReviewsUsingTemplate(templateId: string) {
	return db.performanceReview.count({ where: { templateId } })
}
