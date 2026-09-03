import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import type { Role } from '@prisma/client'
import { buildNavSections, isNavItemActive, type NavContext, type NavItem } from '$lib/nav'
import { CAPABILITIES, type Capability } from '$lib/rbac'

const NO_PENDING = { timesheets: 0, requests: 0, proposals: 0, payrollRuns: 0, total: 0 }

function ctx(roles: Role[], overrides: Partial<NavContext> = {}): NavContext {
	return {
		roles,
		hasBranches: false,
		pendingApprovals: NO_PENDING,
		waitingInquiries: 0,
		...overrides
	}
}

/** Every href a role can reach from the sidebar, group children included. */
function hrefsFor(c: NavContext): string[] {
	return buildNavSections(c)
		.flatMap((s) => s.items)
		.flatMap((i) => [i.href, ...(i.children ?? []).map((ch) => ch.href)])
}

function itemsFor(c: NavContext): NavItem[] {
	return buildNavSections(c).flatMap((s) => s.items)
}

const ALL_ROLES: Role[] = [
	'EMPLOYEE',
	'MANAGER',
	'HR_ADMIN',
	'SUPER_ADMIN',
	'PAYROLL_OFFICER',
	'FINANCE',
	'CEO',
	'VERIFIER',
	'APPROVER'
]

describe('buildNavSections — sections (N1)', () => {
	it('returns sections in order My Work, Time, People, Pay, Performance, Organization for HR_ADMIN', () => {
		const labels = buildNavSections(ctx(['HR_ADMIN'])).map((s) => s.label)
		expect(labels).toEqual(['My Work', 'Time', 'People', 'Pay', 'Performance', 'Organization'])
	})

	it('never emits an empty section for any role', () => {
		for (const role of ALL_ROLES) {
			for (const hasBranches of [false, true]) {
				const sections = buildNavSections(ctx([role], { hasBranches }))
				for (const s of sections) {
					expect(s.items.length, `${role} / ${s.label}`).toBeGreaterThan(0)
				}
			}
		}
	})

	it('drops People, Pay and Organization for EMPLOYEE', () => {
		const labels = buildNavSections(ctx(['EMPLOYEE'])).map((s) => s.label)
		expect(labels).toEqual(['My Work', 'Time', 'Performance'])
	})

	it('gives EMPLOYEE no admin destination', () => {
		const hrefs = hrefsFor(ctx(['EMPLOYEE'], { hasBranches: true }))
		for (const href of [
			'/employees',
			'/departments',
			'/branches',
			'/separations',
			'/recruitment',
			'/benefits',
			'/inventory',
			'/payroll',
			'/reports',
			'/reports/audit-log',
			'/team',
			'/performance/templates'
		]) {
			expect(hrefs, href).not.toContain(href)
		}
	})
})

describe('buildNavSections — labels (N2)', () => {
	it('names the approval children by task', () => {
		const requests = itemsFor(ctx(['CEO'])).find((i) => i.href === '/requests')
		expect(requests?.children?.map((c) => c.label)).toEqual([
			'My Requests',
			'Approve timesheets',
			'Approve requests',
			'Pay changes',
			'Payroll runs'
		])
	})

	it('keeps the /requests anchor item for approvers (E3 — the group renders from it)', () => {
		expect(hrefsFor(ctx(['MANAGER']))).toContain('/requests')
		expect(hrefsFor(ctx(['EMPLOYEE']))).toContain('/requests')
	})

	it('gives a non-approver no approval children', () => {
		const requests = itemsFor(ctx(['EMPLOYEE'])).find((i) => i.href === '/requests')
		expect(requests?.children ?? []).toEqual([])
	})
})

/**
 * Nav ⊆ guard parity (N3).
 *
 * `capabilities` is the OR-set the route's LOAD guard admits, read off the named file on
 * 03-09-26. The staleness canary below re-reads each file so the fixture cannot rot into a
 * self-fulfilling assertion — without it this suite proves only nav ⊆ fixture.
 */
const ROUTE_GUARDS: Record<string, { file: string; capabilities: Capability[] }> = {
	'/employees': { file: 'src/routes/(app)/employees/+page.server.ts', capabilities: ['VIEW_TEAM'] },
	'/departments': {
		file: 'src/routes/(app)/departments/+page.server.ts',
		capabilities: ['MANAGE_HR']
	},
	'/branches': { file: 'src/routes/(app)/branches/+page.server.ts', capabilities: ['MANAGE_HR'] },
	'/separations': {
		file: 'src/routes/(app)/separations/+page.server.ts',
		capabilities: ['MANAGE_HR']
	},
	'/recruitment': {
		file: 'src/routes/(app)/recruitment/+page.server.ts',
		capabilities: ['MANAGE_HR']
	},
	'/benefits': { file: 'src/routes/(app)/benefits/+page.server.ts', capabilities: ['MANAGE_HR'] },
	'/inventory': { file: 'src/routes/(app)/inventory/+page.server.ts', capabilities: ['MANAGE_HR'] },
	'/team': { file: 'src/routes/(app)/team/+page.server.ts', capabilities: ['VIEW_TEAM'] },
	'/reports': {
		file: 'src/routes/(app)/reports/+page.server.ts',
		capabilities: ['MANAGE_HR', 'VIEW_PAYROLL_REPORTS']
	},
	'/reports/audit-log': {
		file: 'src/routes/(app)/reports/audit-log/+page.server.ts',
		capabilities: ['MANAGE_HR']
	},
	'/performance/templates': {
		file: 'src/routes/(app)/performance/templates/+page.server.ts',
		capabilities: ['ADMINISTER_HR_ORGWIDE']
	},
	// Phase 06 moved payroll's predicates out of the layout and into `$lib/payroll-tabs`, which the
	// layout's 403 gate and its tab bar both read. The gate is unchanged; only its text moved.
	'/payroll': {
		file: 'src/lib/payroll-tabs.ts',
		capabilities: ['MANAGE_PAYROLL', 'VERIFY_REQUESTS', 'APPROVE_FINANCE']
	}
}

describe('nav/guard parity (N3)', () => {
	it('keeps every nav gate equal-or-narrower than its route guard', () => {
		for (const role of ALL_ROLES) {
			const hrefs = hrefsFor(ctx([role], { hasBranches: true }))
			for (const [href, guard] of Object.entries(ROUTE_GUARDS)) {
				if (!hrefs.includes(href)) continue
				const admitted = guard.capabilities.some((c) =>
					(CAPABILITIES[c] as readonly Role[]).includes(role)
				)
				expect(admitted, `${role} sees ${href} but the route guard rejects them`).toBe(true)
			}
		}
	})

	it('fixture staleness canary — each recorded capability still appears in its guard file', () => {
		for (const [href, guard] of Object.entries(ROUTE_GUARDS)) {
			const source = readFileSync(guard.file, 'utf8')
			for (const capability of guard.capabilities) {
				expect(
					source.includes(capability),
					`${href}: ${capability} missing from ${guard.file}`
				).toBe(true)
			}
		}
	})
})

describe('no role gains reach (N4)', () => {
	// Snapshot of MANAGER's destinations taken from the pre-change sidebar. Any diff here is a
	// capability change smuggled in as an IA change.
	const MANAGER_HREFS = [
		'/attendance',
		'/complaints',
		'/dashboard',
		'/departments',
		'/employees',
		'/leave',
		'/payroll',
		'/payslips',
		'/performance',
		'/profile',
		'/recruitment',
		'/reports',
		'/reports/audit-log',
		'/requests',
		'/requests/approvals',
		'/requests/timesheets',
		'/separations',
		'/team',
		'/timesheets',
		'/benefits',
		'/inventory'
	].sort()

	it('leaves MANAGER byte-identical to the pre-change set', () => {
		expect([...new Set(hrefsFor(ctx(['MANAGER'])))].sort()).toEqual(MANAGER_HREFS)
	})
})

describe('the duplicate payroll row (N5)', () => {
	it('gives a canSignOff-only role no top-level /payroll item', () => {
		const items = itemsFor(ctx(['VERIFIER']))
		expect(items.map((i) => i.href)).not.toContain('/payroll')
	})

	it('still gives that role the Payroll runs child', () => {
		const requests = itemsFor(ctx(['VERIFIER'])).find((i) => i.href === '/requests')
		expect(requests?.children?.map((c) => c.href)).toContain('/payroll')
	})

	it('pins the pre-existing CEO duplicate: /payroll appears top-level AND as a child', () => {
		const items = itemsFor(ctx(['CEO']))
		expect(items.map((i) => i.href)).toContain('/payroll')
		const requests = items.find((i) => i.href === '/requests')
		expect(requests?.children?.map((c) => c.href)).toContain('/payroll')
	})
})

describe('isNavItemActive — longest prefix wins (N6)', () => {
	// Exactly what the layout passes as `allNavHrefs`: section items only. Group children are
	// deliberately absent — they match exactly, never by prefix.
	const hrefs = itemsFor(ctx(['CEO'], { hasBranches: true })).map((i) => i.href)

	it('marks only the longest matching href active', () => {
		expect(isNavItemActive('/performance/templates', '/performance', hrefs)).toBe(false)
		expect(isNavItemActive('/performance/templates', '/performance/templates', hrefs)).toBe(true)
		expect(isNavItemActive('/reports/audit-log', '/reports', hrefs)).toBe(false)
		expect(isNavItemActive('/reports/audit-log', '/reports/audit-log', hrefs)).toBe(true)
	})

	it('keeps a sub-route on its only matching parent', () => {
		expect(isNavItemActive('/performance/reviews', '/performance', hrefs)).toBe(true)
		expect(isNavItemActive('/dashboard', '/dashboard', hrefs)).toBe(true)
		expect(isNavItemActive('/payroll/periods', '/payroll', hrefs)).toBe(true)
		expect(isNavItemActive('/requests/approvals', '/requests', hrefs)).toBe(true)
	})

	it('does not match on a shared path prefix that is not a segment boundary', () => {
		expect(isNavItemActive('/reports-archive', '/reports', hrefs)).toBe(false)
	})
})

describe('tenant conditionals (N8)', () => {
	it('hides /punch and /branches for a non-food-service org', () => {
		const hrefs = hrefsFor(ctx(['HR_ADMIN'], { hasBranches: false }))
		expect(hrefs).not.toContain('/punch')
		expect(hrefs).not.toContain('/branches')
		expect(itemsFor(ctx(['HR_ADMIN'])).find((i) => i.href === '/team')?.label).toBe('Team')
	})

	it('shows both and relabels the roster for a food-service org', () => {
		const c = ctx(['HR_ADMIN'], { hasBranches: true })
		const hrefs = hrefsFor(c)
		expect(hrefs).toContain('/punch')
		expect(hrefs).toContain('/branches')
		expect(itemsFor(c).find((i) => i.href === '/team')?.label).toBe('Branches')
	})
})

describe('phase 01 carry-forward (C-1)', () => {
	it('keeps the Audit Log reachable for MANAGE_HR holders, as an indented child', () => {
		const auditLog = itemsFor(ctx(['HR_ADMIN'])).find((i) => i.href === '/reports/audit-log')
		expect(auditLog?.label).toBe('Audit Log')
		expect(auditLog?.child).toBe(true)
		expect(auditLog?.icon).toBeUndefined()
	})

	it('hides it from a role without MANAGE_HR (negative control)', () => {
		expect(hrefsFor(ctx(['FINANCE']))).not.toContain('/reports/audit-log')
	})
})

describe('icons (N7)', () => {
	it('renders Eval Templates as a child row with no icon (E5)', () => {
		const templates = itemsFor(ctx(['HR_ADMIN'])).find((i) => i.href === '/performance/templates')
		expect(templates?.child).toBe(true)
		expect(templates?.icon).toBeUndefined()
	})

	it('leaves no two nav entries sharing one glyph', () => {
		const icons = itemsFor(ctx(['CEO'], { hasBranches: true }))
			.map((i) => i.icon)
			.filter((i): i is string => !!i)
		expect(new Set(icons).size).toBe(icons.length)
	})
})

describe('badges', () => {
	it('carries the inquiry count onto /complaints and the pending counts onto the children', () => {
		const c = ctx(['CEO'], {
			waitingInquiries: 3,
			pendingApprovals: { timesheets: 1, requests: 2, proposals: 4, payrollRuns: 5, total: 12 }
		})
		expect(itemsFor(c).find((i) => i.href === '/complaints')?.badge).toBe(3)
		const children = itemsFor(c).find((i) => i.href === '/requests')?.children ?? []
		expect(children.map((ch) => ch.badge)).toEqual([0, 1, 2, 4, 5])
	})
})
