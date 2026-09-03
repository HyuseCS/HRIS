import { describe, it, expect } from 'vitest'
import { templateStructureSchema } from '../../src/lib/server/performance/schemas'
import { accountExecutive, adminStaff } from '../../prisma/seed-performance-templates'
import type { TemplateStructure } from '../../src/lib/server/performance/types'

/**
 * #178 — `templateStructureSchema` is the ONLY gate on `PerformanceTemplate.structure`: Postgres
 * validates nothing inside a Json column, so a malformation that gets past this schema is
 * permanent silent corruption.
 *
 * The accept cases are the two SEEDED structures themselves, imported from the seed rather than
 * retyped, so a drift between the seed and the schema fails here instead of at seed time on the
 * user's database.
 */
describe('templateStructureSchema accepts the two seeded templates', () => {
	it('accepts the Account Executive structure verbatim', () => {
		expect(templateStructureSchema.safeParse(accountExecutive()).success).toBe(true)
	})

	it('accepts the Admin Staff structure verbatim', () => {
		expect(templateStructureSchema.safeParse(adminStaff()).success).toBe(true)
	})

	it('accepts a section with maximum: null — the AE form prints no subtotal for Section 3', () => {
		const ae = accountExecutive()
		const noSubtotal = ae.sections.filter((s) => s.maximum === null)
		expect(noSubtotal).toHaveLength(1)
		expect(noSubtotal[0].name).toBe('PRODUCT KNOWLEDGE & PRESENTATION')
	})
})

/** Each case mutates a known-good structure by exactly one field, so the rejection has one cause. */
function broken(mutate: (s: TemplateStructure) => void) {
	const structure = accountExecutive()
	mutate(structure)
	return templateStructureSchema.safeParse(structure)
}

describe('templateStructureSchema rejects a malformed structure', () => {
	it('rejects a section with no id — answers key off section ids', () => {
		const res = broken((s) => {
			s.sections[0].id = ''
		})
		expect(res.success).toBe(false)
	})

	it('rejects a duplicate criterion id — two rows would share one answer', () => {
		const res = broken((s) => {
			s.sections[1].criteria[0].id = s.sections[0].criteria[0].id
		})
		expect(res.success).toBe(false)
		expect(res.error?.issues[0].message).toMatch(/Duplicate id/)
	})

	it('rejects a negative section maximum', () => {
		const res = broken((s) => {
			s.sections[0].maximum = -1
		})
		expect(res.success).toBe(false)
	})

	it('rejects a missing totalCeiling', () => {
		const res = broken((s) => {
			delete (s as Partial<TemplateStructure>).totalCeiling
		})
		expect(res.success).toBe(false)
	})

	it('rejects an empty signatoryOrder — nobody could ever sign the review', () => {
		const res = broken((s) => {
			s.signatoryOrder = []
		})
		expect(res.success).toBe(false)
	})

	it('rejects an unknown signatory role', () => {
		const res = broken((s) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			s.signatoryOrder[0].role = 'CEO' as any
		})
		expect(res.success).toBe(false)
	})

	it('rejects an unknown top-level key rather than silently dropping it', () => {
		const res = broken((s) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			;(s as any).computedTotal = 88
		})
		expect(res.success).toBe(false)
	})
})
