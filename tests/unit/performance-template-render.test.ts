import { describe, it, expect, vi, beforeEach } from 'vitest'
import { accountExecutive, adminStaff } from '../../prisma/seed-performance-templates'

/**
 * SPEC AC1 — two different templates must produce two visibly different forms, and every
 * configured number must reach the form as a LABEL.
 *
 * The service layer is where the two would converge if anything normalized, defaulted or —
 * worst — computed. So this asserts on what `listTemplates` / `getTemplate` actually hand back:
 * the AE and Admin Staff section and criterion lists differ, and the stored structure comes out
 * byte-identical to what went in. A structure that survives a deep-equal cannot have had a
 * subtotal, total, percentage or weighted average injected into it.
 */

const { dbMock } = vi.hoisted(() => ({
	dbMock: {
		performanceTemplate: { findMany: vi.fn(), findFirst: vi.fn() },
		// `listTemplates` tallies reviews per template with ONE grouped query — there is no
		// PerformanceTemplate→PerformanceReview relation for `_count` to walk.
		performanceReview: { count: vi.fn(), groupBy: vi.fn() },
		employee: { count: vi.fn() },
		$transaction: vi.fn()
	}
}))
vi.mock('$lib/server/db', () => ({ db: dbMock }))

const { listTemplates, getTemplate } =
	await import('../../src/lib/server/services/performance-templates')

const AE = accountExecutive()
const ADMIN = adminStaff()
const ORG = 'org_seed'

const row = (id: string, name: string, structure: unknown) => ({
	id,
	organizationId: ORG,
	name,
	isActive: true,
	structure,
	createdAt: new Date('2026-08-01'),
	updatedAt: new Date('2026-08-01')
})

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.performanceReview.groupBy.mockResolvedValue([])
})

describe('two templates render as two different forms (AC1)', () => {
	it('reports each template’s own category count, not a shared default', async () => {
		dbMock.performanceTemplate.findMany.mockResolvedValue([
			{
				id: 't_ae',
				name: 'Account Executive',
				isActive: true,
				structure: AE,
				_count: { assignedEmployees: 3 }
			},
			{
				id: 't_admin',
				name: 'Admin Staff',
				isActive: true,
				structure: ADMIN,
				_count: { assignedEmployees: 0 }
			}
		])
		dbMock.performanceReview.groupBy.mockResolvedValue([
			{ templateId: 't_ae', _count: { _all: 2 } }
		])
		const list = await listTemplates(ORG)
		expect(list.map((t) => t.sectionCount)).toEqual([6, 5])
		// Each row carries its OWN delete-affordance counts — the used template is the one that
		// reports reviews, and the untallied one reports 0 rather than inheriting its neighbour's.
		expect(list.map((t) => t.reviewCount)).toEqual([2, 0])
		expect(list.map((t) => t.assignedCount)).toEqual([3, 0])
		// The list page must never receive the whole document.
		expect(list[0]).not.toHaveProperty('structure')
		expect(list[0]).not.toHaveProperty('_count')
	})

	it('hands back each template’s own categories and criteria', async () => {
		dbMock.performanceTemplate.findFirst.mockResolvedValueOnce(row('t_ae', 'Account Executive', AE))
		const ae = await getTemplate('t_ae', ORG)
		dbMock.performanceTemplate.findFirst.mockResolvedValueOnce(row('t_admin', 'Admin Staff', ADMIN))
		const admin = await getTemplate('t_admin', ORG)

		const names = (t: { structure: unknown }) =>
			(t.structure as unknown as typeof AE).sections.map((s) => s.name)
		expect(names(ae)).toContain('SALES PERFORMANCE')
		expect(names(admin)).toContain('ADMINISTRATIVE OPERATIONS')
		expect(names(ae)).not.toEqual(names(admin))

		const firstCriterion = (t: { structure: unknown }) =>
			(t.structure as unknown as typeof AE).sections[0].criteria[0].text
		expect(firstCriterion(ae)).toBe('Achieves monthly sales target')
		expect(firstCriterion(admin)).toBe(
			'Completes assigned administrative tasks accurately and on time'
		)
	})
})

describe('weights, maxima and bands are carried through as labels — nothing is computed', () => {
	it('returns the stored structure unchanged, field for field', async () => {
		dbMock.performanceTemplate.findFirst.mockResolvedValue(row('t_ae', 'Account Executive', AE))
		const ae = await getTemplate('t_ae', ORG)
		// Deep equality is the whole assertion: no derived key was added and no stored value was
		// rewritten on the way out.
		expect(ae.structure).toEqual(AE)
	})

	it('keeps weightLabel as text, keeps a null maximum null, and adds no total', async () => {
		dbMock.performanceTemplate.findFirst.mockResolvedValue(row('t_ae', 'Account Executive', AE))
		const structure = (await getTemplate('t_ae', ORG)).structure as unknown as typeof AE

		expect(structure.sections.map((s) => s.weightLabel)).toEqual([
			'35%',
			'20%',
			'15%',
			'10%',
			'10%',
			'10%'
		])
		expect(structure.sections.map((s) => s.maximum)).toEqual([30, 25, null, 25, 25, 25])
		expect(structure.totalCeiling).toBe(100)
		// The AE weights print as 35+20+15+10+10+10 = 100 and the maxima as 130 against a ceiling of
		// 100. Neither number exists anywhere in the returned document, because the app never
		// derives one — HR does the arithmetic.
		const asText = JSON.stringify(structure)
		// `totalCeiling` is configuration and is expected; a derived value would not be.
		expect(asText).not.toMatch(/"(totalScore|sectionSubtotals|weightedTotal|computed[A-Za-z]*)":/)
		expect(structure).not.toHaveProperty('sectionSubtotals')
	})

	it('keeps the interpretation bands as free-text ranges, not parsed numbers', async () => {
		dbMock.performanceTemplate.findFirst.mockResolvedValue(row('t_admin', 'Admin Staff', ADMIN))
		const structure = (await getTemplate('t_admin', ORG)).structure as unknown as typeof ADMIN
		expect(structure.interpretationBands.map((b) => b.rangeLabel)).toEqual([
			'95-100',
			'90-94',
			'85-89',
			'80-84',
			'75-79',
			'Below 75'
		])
		for (const band of structure.interpretationBands) {
			expect(typeof band.rangeLabel).toBe('string')
			expect(band).not.toHaveProperty('min')
			expect(band).not.toHaveProperty('max')
		}
	})

	it('carries the Admin Staff KPI targets as free text, and AE carries none', async () => {
		dbMock.performanceTemplate.findFirst.mockResolvedValue(row('t_admin', 'Admin Staff', ADMIN))
		const admin = (await getTemplate('t_admin', ORG)).structure as unknown as typeof ADMIN
		expect(admin.kpiRows?.map((k) => k.target)).toContain('Within 24 hours')
		expect(AE.kpiRows).toBeUndefined()
	})
})
