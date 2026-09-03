import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * #242 — /reports/audit-log rendered every entry's `oldValue` / `newValue` to anyone holding
 * ADMINISTER_SYSTEM and recorded nothing about the read. Those payloads are the before/after
 * salary of every compensation change and promotion — the same fields #111 masks behind an
 * audited reveal on the 201 file. The audit-log page was a second door to that data with no
 * such record, so "who read this employee's salary change, and when?" had no answer.
 *
 * The fix mirrors #111: the list masks unconditionally, and a `reveal` form action returns one
 * entry's payload after writing a VIEW row naming the actor and the entry.
 *
 * Deliberate departure from the filed issue: there is NO self-reveal exemption here. The issue
 * suggests one by analogy with `revealEmployeeSensitive`, but an audit row is about an actor,
 * not an employee, and "my own row" has no meaning for it — every reveal is recorded.
 *
 * The three fail-open shapes this pins, each of which would leave the page looking correct:
 *   - the reveal fetching by `id` alone and checking the organization afterwards (a cross-tenant
 *     read that merely declines to print),
 *   - the action trusting the page's `load` gate — SvelteKit does not run `load` for a form
 *     action, so an ungated action is reachable by any authenticated caller who can POST,
 *   - the audit write happening after, or independently of, the payload being returned.
 */

const { dbMock, writeAuditLog } = vi.hoisted(() => ({
	writeAuditLog: vi.fn(),
	dbMock: {
		auditLog: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
		user: { findMany: vi.fn() }
	}
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog }))

const { load, actions } = await import('../../src/routes/(app)/reports/audit-log/+page.server')

const ORG_A = 'orgA'
const ORG_B = 'orgB'
const ACTOR = 'user-actor'

const OLD_SALARY = 41234
const NEW_SALARY = 57891

const ENTRY = {
	id: 'log1',
	organizationId: ORG_A,
	action: 'UPDATE',
	entityType: 'Employee',
	entityId: 'empA1',
	oldValue: { basicMonthlySalary: OLD_SALARY, rateType: 'MONTHLY' },
	newValue: { basicMonthlySalary: NEW_SALARY, rateType: 'MONTHLY', effectiveDate: '2026-01-01' },
	createdAt: new Date('2026-01-01T00:00:00Z'),
	actorRoles: ['HR_ADMIN'],
	actor: { email: 'hr@orga.test' },
	// Present on the fixture on purpose: the loader spreads the row, so an unprojected query
	// ships these to the client. They must not survive the load. See NEVER_SHIPPED below.
	ipAddress: '203.0.113.7',
	userAgent: 'Mozilla/5.0 (audit-log-reveal fixture)'
}

/** Columns the client must never receive, whatever the caller's capabilities. */
const NEVER_SHIPPED = ['ipAddress', 'userAgent'] as const

/**
 * Emulates Prisma's projection so the fixture narrows only when the query asks it to: a `select`
 * returns its listed fields, a bare `include` returns every scalar. Mirrors the helper in
 * dashboard-org-scoping.test.ts, added there for the same reason.
 */
const project = (row: Record<string, unknown>, args: Record<string, unknown>) => {
	const select = args.select as Record<string, unknown> | undefined
	if (!select) return { ...row }
	const out: Record<string, unknown> = {}
	for (const [key, spec] of Object.entries(select)) {
		if (spec === true) out[key] = row[key]
		else if (spec && typeof spec === 'object')
			out[key] = project(row[key] as Record<string, unknown>, spec as Record<string, unknown>)
	}
	return out
}

/** An entry with no payload at all — a LOGIN row. The reveal control must not offer itself here. */
const BARE_ENTRY = {
	...ENTRY,
	id: 'log2',
	action: 'LOGIN',
	entityType: 'User',
	oldValue: null,
	newValue: null
}

const loadEvent = (roles: Role[]) =>
	({
		locals: { user: { id: ACTOR, organizationId: ORG_A, roles } },
		url: new URL('http://localhost/reports/audit-log')
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

/** `PageServerLoad` widens its return to `void | …`; every case here wants the object. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loadData = (roles: Role[]) => load(loadEvent(roles)) as Promise<any>

const revealEvent = (roles: Role[], id: string | null = 'log1') => {
	const body = new FormData()
	if (id !== null) body.set('id', id)
	return {
		locals: { user: { id: ACTOR, organizationId: ORG_A, roles } },
		request: Object.assign(new Request('http://localhost/reports/audit-log?/reveal'), {
			formData: async () => body
		}),
		getClientAddress: () => '203.0.113.7'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any
}

beforeEach(() => {
	vi.clearAllMocks()
	dbMock.auditLog.count.mockResolvedValue(2)
	// Projected, not a flat resolve: the loader spreads each row, so a bare `include` would ship
	// every scalar. Handing back the whole fixture regardless of the query would make the
	// NEVER_SHIPPED assertions below pass even with the leak restored.
	dbMock.auditLog.findMany.mockImplementation(async (args: Record<string, unknown>) =>
		[ENTRY, BARE_ENTRY].map((row) => project(row as Record<string, unknown>, args))
	)
	dbMock.user.findMany.mockResolvedValue([])
	// Scoped like the real query: an entry outside the caller's organization is simply not found.
	dbMock.auditLog.findFirst.mockImplementation(
		async ({ where }: { where: { id: string; organizationId?: string } }) =>
			where.id === ENTRY.id && where.organizationId === ORG_A ? ENTRY : null
	)
	writeAuditLog.mockResolvedValue(undefined)
})

describe('/reports/audit-log load — the list never carries the payload (#242)', () => {
	// The regression this issue is about: ADMINISTER_SYSTEM used to get it in cleartext, untraced.
	it('masks old and new values for a SUPER_ADMIN', async () => {
		const data = await loadData(['SUPER_ADMIN'])

		expect(data.logs[0]).toMatchObject({ oldValue: null, newValue: null })
		expect(JSON.stringify(data.logs)).not.toContain(String(OLD_SALARY))
		expect(JSON.stringify(data.logs)).not.toContain(String(NEW_SALARY))
	})

	it('masks old and new values for a CEO', async () => {
		const data = await loadData(['CEO'])

		expect(JSON.stringify(data.logs)).not.toContain(String(NEW_SALARY))
	})

	// The pre-existing HR_ADMIN masking must survive the change.
	it('keeps masking for an HR_ADMIN', async () => {
		const data = await loadData(['HR_ADMIN'])

		expect(data.logs[0]).toMatchObject({ oldValue: null, newValue: null })
	})

	// The payload is not the only thing a bare `include` leaks: the row also carries the actor's
	// IP and user agent. SUPER_ADMIN is the strongest caller, so if these are absent here they are
	// absent for everyone.
	it('never ships the actor IP or user agent, even to a SUPER_ADMIN', async () => {
		const data = await loadData(['SUPER_ADMIN'])

		for (const column of NEVER_SHIPPED) {
			expect(data.logs[0]).not.toHaveProperty(column)
		}
		expect(JSON.stringify(data.logs)).not.toContain(ENTRY.ipAddress)
		expect(JSON.stringify(data.logs)).not.toContain(ENTRY.userAgent)

		// The query itself must ask for a projection — the assertions above only bite because the
		// mock honours it, so pin the shape too.
		const args = dbMock.auditLog.findMany.mock.calls[0][0]
		expect(args.include).toBeUndefined()
		expect(args.select).toBeDefined()
		for (const column of NEVER_SHIPPED) {
			expect(args.select).not.toHaveProperty(column)
		}
	})

	it('tells the page which entries have a payload to reveal', async () => {
		const data = await loadData(['SUPER_ADMIN'])

		expect(data.logs[0].hasChanges).toBe(true)
		expect(data.logs[1].hasChanges).toBe(false)
	})

	// So a caller who cannot reveal is not shown a button that will 403 (Constitution P2 — the
	// flag is cosmetic; the action re-checks).
	it('offers the reveal control only to ADMINISTER_SYSTEM holders', async () => {
		expect((await loadData(['SUPER_ADMIN'])).canReveal).toBe(true)
		expect((await loadData(['CEO'])).canReveal).toBe(true)
		expect((await loadData(['HR_ADMIN'])).canReveal).toBe(false)
	})

	/**
	 * N16 (#112) — the `entityTypes` filter list is hand-maintained and no type-checker validates
	 * it, so an entity can be audited while being unfilterable in the report. `PayrollPeriod` was
	 * missing until #298; the complaints service writes three `HrComplaint` rows.
	 */
	it('lists HrComplaint among the filterable entity types', async () => {
		const data = await loadData(['SUPER_ADMIN'])

		expect(data.entityTypes).toContain('HrComplaint')
	})

	it('still refuses the page to a caller without MANAGE_HR', async () => {
		await expect(load(loadEvent(['EMPLOYEE']))).rejects.toMatchObject({ status: 403 })
	})
})

describe('?/reveal — reaching a payload is itself audited (#242)', () => {
	it('returns the entry’s values to a SUPER_ADMIN', async () => {
		const result = await actions.reveal(revealEvent(['SUPER_ADMIN']))

		expect(result).toMatchObject({
			revealed: { id: 'log1', oldValue: ENTRY.oldValue, newValue: ENTRY.newValue }
		})
	})

	it('writes a VIEW row naming the actor and the entry', async () => {
		await actions.reveal(revealEvent(['SUPER_ADMIN']))

		expect(writeAuditLog).toHaveBeenCalledTimes(1)
		const [ctx, payload, client] = writeAuditLog.mock.calls[0]
		expect(ctx).toMatchObject({
			organizationId: ORG_A,
			actorId: ACTOR,
			actorRoles: ['SUPER_ADMIN'],
			ipAddress: '203.0.113.7'
		})
		expect(payload).toMatchObject({
			action: 'VIEW',
			entityType: 'AuditLog',
			entityId: 'log1'
		})
		// #5: class D — this audits a READ, so it takes `db`, never a transaction client. Wrapping
		// it would let an unrelated rollback erase the record of a payload already returned.
		expect(client).toBe(dbMock)
	})

	// No self-reveal exemption — see the header note. A CEO reading a row they themselves wrote
	// is still recorded.
	it('records the reveal even when the actor wrote the entry', async () => {
		dbMock.auditLog.findFirst.mockResolvedValue({ ...ENTRY, actorId: ACTOR })

		await actions.reveal(revealEvent(['CEO']))

		expect(writeAuditLog).toHaveBeenCalledTimes(1)
	})

	// The whole point: the payload must not outlive a failed audit write.
	it('does not return the payload if the audit write fails', async () => {
		writeAuditLog.mockRejectedValue(new Error('audit down'))

		await expect(actions.reveal(revealEvent(['SUPER_ADMIN']))).rejects.toThrow('audit down')
	})

	// Fail-open #1: org scoping must be IN the where, not a comparison after the fetch.
	it('cannot reach another tenant’s entry', async () => {
		dbMock.auditLog.findFirst.mockImplementation(
			async ({ where }: { where: { id: string; organizationId?: string } }) =>
				where.organizationId === undefined ? { ...ENTRY, organizationId: ORG_B } : null
		)

		await expect(actions.reveal(revealEvent(['SUPER_ADMIN']))).rejects.toMatchObject({
			status: 404
		})
		expect(writeAuditLog).not.toHaveBeenCalled()
	})

	it('scopes the lookup by organization in the query itself', async () => {
		await actions.reveal(revealEvent(['SUPER_ADMIN']))

		expect(dbMock.auditLog.findFirst.mock.calls[0][0].where).toMatchObject({
			id: 'log1',
			organizationId: ORG_A
		})
	})

	// Fail-open #2: SvelteKit does not run `load` for a form action, so both gates live here.
	it('refuses an HR_ADMIN — MANAGE_HR alone is not enough', async () => {
		await expect(actions.reveal(revealEvent(['HR_ADMIN']))).rejects.toMatchObject({ status: 403 })
		expect(dbMock.auditLog.findFirst).not.toHaveBeenCalled()
	})

	it('refuses a plain EMPLOYEE', async () => {
		await expect(actions.reveal(revealEvent(['EMPLOYEE']))).rejects.toMatchObject({ status: 403 })
		expect(dbMock.auditLog.findFirst).not.toHaveBeenCalled()
	})

	it('honours a secondary role carrying ADMINISTER_SYSTEM (#133)', async () => {
		const result = await actions.reveal(revealEvent(['HR_ADMIN', 'CEO']))

		expect(result).toMatchObject({ revealed: { id: 'log1' } })
	})

	it('rejects a request with no id', async () => {
		const result = await actions.reveal(revealEvent(['SUPER_ADMIN'], null))

		expect(result).toMatchObject({ status: 400 })
		expect(dbMock.auditLog.findFirst).not.toHaveBeenCalled()
	})

	it('rejects an empty id rather than matching the first row', async () => {
		const result = await actions.reveal(revealEvent(['SUPER_ADMIN'], ''))

		expect(result).toMatchObject({ status: 400 })
		expect(dbMock.auditLog.findFirst).not.toHaveBeenCalled()
	})
})
