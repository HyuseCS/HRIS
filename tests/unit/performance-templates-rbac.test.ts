import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'
import { accountExecutive } from '../../prisma/seed-performance-templates'

/**
 * #178 — the guard on every evaluation-template surface is `ADMINISTER_HR_ORGWIDE`, NOT
 * `MANAGE_HR`.
 *
 * MANAGE_HR includes MANAGER (#133 made managers on-branch HR), so a MANAGE_HR guard here would
 * let a team lead rewrite the organization's evaluation forms. `ADMINISTER_HR_ORGWIDE` is the
 * capability that actually excludes MANAGER.
 *
 * These assert against the `load` and `actions` EXPORTS, not a copy of a handler body — the
 * export is the only thing SvelteKit ever calls, and #290 was shipped on an assertion that read
 * the handler body instead. The service is mocked so a refusal is provably "never reached the
 * service", not "the service happened to reject it too".
 *
 * MUTATION-CHECKED (plan §11.2 check 1): with the guard temporarily swapped to `MANAGE_HR`, the
 * three MANAGER cases below go red. Recorded in the Phase 3 report.
 */

const { svc } = vi.hoisted(() => ({
	svc: {
		listTemplates: vi.fn().mockResolvedValue([]),
		getTemplate: vi.fn(),
		createTemplate: vi.fn(),
		updateTemplate: vi.fn(),
		setTemplateActive: vi.fn(),
		countEmployeesWithoutTemplate: vi.fn().mockResolvedValue(0),
		countReviewsUsingTemplate: vi.fn().mockResolvedValue(0)
	}
}))
vi.mock('$lib/server/services/performance-templates', () => svc)

const list = await import('../../src/routes/(app)/performance/templates/+page.server')
const builder = await import('../../src/routes/(app)/performance/templates/[id]/+page.server')

const ORG = 'org_seed'
const STRUCTURE = JSON.stringify(accountExecutive())

const event = (roles: Role[], fields: Record<string, string> = {}) =>
	({
		request: {
			formData: async () => {
				const fd = new FormData()
				for (const [k, v] of Object.entries(fields)) fd.set(k, v)
				return fd
			}
		},
		locals: { user: { id: 'user1', organizationId: ORG, roles } },
		params: { id: 't_ae' },
		getClientAddress: () => 'test'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

beforeEach(() => {
	vi.clearAllMocks()
	svc.listTemplates.mockResolvedValue([])
	svc.countEmployeesWithoutTemplate.mockResolvedValue(0)
	svc.countReviewsUsingTemplate.mockResolvedValue(0)
	svc.getTemplate.mockResolvedValue({
		id: 't_ae',
		organizationId: ORG,
		name: 'Account Executive',
		isActive: true,
		structure: accountExecutive(),
		createdAt: new Date('2026-08-01'),
		updatedAt: new Date('2026-08-01')
	})
	svc.createTemplate.mockResolvedValue({ id: 't_new' })
	svc.updateTemplate.mockResolvedValue({ id: 't_ae' })
	svc.setTemplateActive.mockResolvedValue({ id: 't_ae' })
})

describe('a MANAGER is refused every template surface', () => {
	it('403s the list load and never reads a template', async () => {
		await expect(list.load(event(['MANAGER']))).rejects.toMatchObject({ status: 403 })
		expect(svc.listTemplates).not.toHaveBeenCalled()
	})

	it('403s createTemplate before the form body is read', async () => {
		await expect(
			list.actions.createTemplate!(event(['MANAGER'], { name: 'Sneaky', structure: STRUCTURE }))
		).rejects.toMatchObject({ status: 403 })
		expect(svc.createTemplate).not.toHaveBeenCalled()
	})

	it('403s setActive', async () => {
		await expect(
			list.actions.setActive!(event(['MANAGER'], { id: 't_ae', isActive: 'false' }))
		).rejects.toMatchObject({ status: 403 })
		expect(svc.setTemplateActive).not.toHaveBeenCalled()
	})

	it('403s the builder load and never reads the template', async () => {
		await expect(builder.load(event(['MANAGER']))).rejects.toMatchObject({ status: 403 })
		expect(svc.getTemplate).not.toHaveBeenCalled()
	})

	it('403s updateTemplate and never reaches the write', async () => {
		await expect(
			builder.actions.updateTemplate!(
				event(['MANAGER'], { name: 'Rewritten', isActive: 'true', structure: STRUCTURE })
			)
		).rejects.toMatchObject({ status: 403 })
		expect(svc.updateTemplate).not.toHaveBeenCalled()
	})
})

describe('an HR_ADMIN reaches every template surface', () => {
	it('loads the list with the backfill readiness count', async () => {
		svc.listTemplates.mockResolvedValue([
			{ id: 't_ae', name: 'Account Executive', isActive: true, sectionCount: 6 }
		])
		svc.countEmployeesWithoutTemplate.mockResolvedValue(4)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = (await list.load(event(['HR_ADMIN']))) as any
		expect(res.templates).toHaveLength(1)
		expect(res.backfillCount).toBe(4)
	})

	it('creates a template and redirects to its builder', async () => {
		await expect(
			list.actions.createTemplate!(event(['HR_ADMIN'], { name: 'Account Executive' }))
		).rejects.toMatchObject({ status: 303, location: '/performance/templates/t_new' })
		expect(svc.createTemplate).toHaveBeenCalledTimes(1)
		const [org, data] = svc.createTemplate.mock.calls[0]
		expect(org).toBe(ORG)
		expect(data.name).toBe('Account Executive')
		// No structure posted → the shared blank, ready for the builder to fill.
		expect(data.structure.sections).toHaveLength(1)
		expect(data.structure.signatoryOrder.map((s: { role: string }) => s.role)).toEqual([
			'IMMEDIATE_SUPERVISOR',
			'HR_REPRESENTATIVE',
			'DEPARTMENT_HEAD',
			'EMPLOYEE'
		])
	})

	it('loads the builder with the parsed structure and the open-review count', async () => {
		svc.countReviewsUsingTemplate.mockResolvedValue(3)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = (await builder.load(event(['HR_ADMIN']))) as any
		expect(res.template.name).toBe('Account Executive')
		expect(res.structure.sections).toHaveLength(6)
		expect(res.structureError).toBeNull()
		expect(res.openReviewCount).toBe(3)
	})

	it('saves an edited template', async () => {
		const res = await builder.actions.updateTemplate!(
			event(['HR_ADMIN'], { name: 'Account Executive', isActive: 'true', structure: STRUCTURE })
		)
		expect(res).toEqual({ saved: true })
		expect(svc.updateTemplate).toHaveBeenCalledTimes(1)
	})

	it('422s a structure that fails the schema, and writes nothing', async () => {
		const bad = accountExecutive()
		bad.sections[0].id = ''
		const res = await builder.actions.updateTemplate!(
			event(['HR_ADMIN'], {
				name: 'Account Executive',
				isActive: 'true',
				structure: JSON.stringify(bad)
			})
		)
		expect(res).toMatchObject({ status: 422 })
		expect(svc.updateTemplate).not.toHaveBeenCalled()
	})

	it('surfaces a broken stored structure as an error banner, never a half-form', async () => {
		svc.getTemplate.mockResolvedValue({
			id: 't_ae',
			organizationId: ORG,
			name: 'Account Executive',
			isActive: true,
			structure: { version: 1 },
			createdAt: new Date('2026-08-01'),
			updatedAt: new Date('2026-08-01')
		})
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const res = (await builder.load(event(['HR_ADMIN']))) as any
		expect(res.structure).toBeNull()
		expect(res.structureError).toBeTruthy()
	})
})
