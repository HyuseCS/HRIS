import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * #178 — HR may permanently DELETE an evaluation template, but only one that no review has ever
 * referenced. A template a review has touched is undeletable forever; deactivating it is the
 * answer there, and that path is unchanged.
 *
 * Three claims are pinned, against the real service export:
 *
 *  1. **The guard.** A template with reviews is refused, and the delete is never reached — the
 *     count runs INSIDE the delete's transaction, on the tx client, so a review opened between
 *     the page render and the POST still stops it.
 *  2. **The audit row.** It is written on the SAME tx client as the delete (#324), so it commits
 *     or rolls back with the row it records.
 *  3. **The org scope.** `getTemplate(id, organizationId)` resolves the row by BOTH columns
 *     (#323), so another tenant's template id is a 404 and never enters a transaction.
 *
 * The db is faked the way `performance-template-assignment.test.ts` fakes it: `findFirst` honours
 * its where-clause the way SQL does — an absent filter is no filter — so dropping the org column
 * from the service changes this mock's answer rather than being invisible to it.
 *
 * MUTATION-CHECKED: with the `if (used > 0) error(409, …)` guard deleted, the two refusal cases
 * below go red. Recorded in the session report.
 */

const ORG = 'org_seed'
const OTHER_ORG = 'org_other'

const { findFirst, deleteTemplateRow, countReviews, writeAuditLog } = vi.hoisted(() => ({
	findFirst: vi.fn(),
	deleteTemplateRow: vi.fn(),
	countReviews: vi.fn(),
	writeAuditLog: vi.fn()
}))

// The one transaction client. Every call the service makes inside `$transaction` must land here,
// which is what makes "audited on the tx client" assertable rather than asserted-by-eye.
const tx = {
	performanceTemplate: { delete: deleteTemplateRow },
	performanceReview: { count: countReviews }
}
vi.mock('$lib/server/db', () => ({
	db: {
		$transaction: (fn: (c: typeof tx) => unknown) => fn(tx),
		performanceTemplate: { findFirst }
	}
}))
vi.mock('$lib/server/audit', () => ({ writeAuditLog }))

const { deleteTemplate } = await import('$lib/server/services/performance-templates')

// Two sections, so the audit row's `sectionCount` is a number the test can tell apart from 0.
const ROW = {
	id: 't_ae',
	organizationId: ORG,
	name: 'Account Executive',
	isActive: true,
	structure: { sections: [{ id: 's1' }, { id: 's2' }] }
}

const ctx = { organizationId: ORG, actorId: 'user1', actorRoles: [], ipAddress: 'test' } as never

beforeEach(() => {
	vi.clearAllMocks()
	findFirst.mockImplementation(
		async ({ where }: { where: { id: string; organizationId: string } }) =>
			where.id === ROW.id && where.organizationId === ROW.organizationId ? ROW : null
	)
	countReviews.mockResolvedValue(0)
	deleteTemplateRow.mockResolvedValue(ROW)
})

describe('deleteTemplate', () => {
	it('removes a template no review has used, and audits it inside the same transaction', async () => {
		await deleteTemplate('t_ae', ORG, ctx)

		expect(countReviews).toHaveBeenCalledWith({ where: { templateId: 't_ae' } })
		expect(deleteTemplateRow).toHaveBeenCalledWith({ where: { id: 't_ae' } })

		expect(writeAuditLog).toHaveBeenCalledTimes(1)
		const [auditCtx, payload, client] = writeAuditLog.mock.calls[0]
		expect(auditCtx).toBe(ctx)
		expect(payload).toMatchObject({
			action: 'DELETE',
			entityType: 'PerformanceTemplate',
			entityId: 't_ae',
			oldValue: { name: 'Account Executive', isActive: true, sectionCount: 2 }
		})
		// #324: the tx client, not the shared db. An audit row that can outlive a rolled-back
		// delete is the defect this argument position exists to prevent.
		expect(client).toBe(tx)
	})

	it('refuses a template a review has used, and deletes nothing', async () => {
		countReviews.mockResolvedValue(3)

		await expect(deleteTemplate('t_ae', ORG, ctx)).rejects.toMatchObject({ status: 409 })

		expect(deleteTemplateRow).not.toHaveBeenCalled()
		expect(writeAuditLog).not.toHaveBeenCalled()
	})

	it('names the count and points at deactivate in the refusal', async () => {
		countReviews.mockResolvedValue(1)

		await expect(deleteTemplate('t_ae', ORG, ctx)).rejects.toMatchObject({
			status: 409,
			body: { message: expect.stringContaining('Deactivate') }
		})
		expect(deleteTemplateRow).not.toHaveBeenCalled()
	})

	it('counts reviews inside the transaction, not before it', async () => {
		// The count is the tx client's, so a review inserted before this transaction's snapshot is
		// seen by it. A count taken on the shared db outside the transaction would not be this mock.
		await deleteTemplate('t_ae', ORG, ctx)
		expect(countReviews).toHaveBeenCalledTimes(1)
		expect(countReviews.mock.instances[0]).toBe(tx.performanceReview)
	})

	it("404s another organization's template and never opens a transaction", async () => {
		await expect(deleteTemplate('t_ae', OTHER_ORG, ctx)).rejects.toMatchObject({ status: 404 })

		expect(countReviews).not.toHaveBeenCalled()
		expect(deleteTemplateRow).not.toHaveBeenCalled()
		expect(writeAuditLog).not.toHaveBeenCalled()
	})

	it('404s an id that does not exist', async () => {
		await expect(deleteTemplate('t_missing', ORG, ctx)).rejects.toMatchObject({ status: 404 })
		expect(deleteTemplateRow).not.toHaveBeenCalled()
	})
})
