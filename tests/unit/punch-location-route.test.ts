import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * #177 — the gates on `/punch`.
 *
 * Asserted against the `actions` and `load` EXPORTS, not a copy of the handler body: #290 shipped
 * on an assertion that read a handler body while the real export was a different function. The
 * export is the only thing SvelteKit calls.
 *
 * `recordPunch` is mocked on purpose — this file proves what the ROUTE decides (who is punching,
 * whether a location survives parsing, whether a refusal happens before the write). What
 * `recordPunch` then persists is `punch-location-capture.test.ts`'s job.
 *
 * The employee mock branches on the `where` shape. A flat `mockResolvedValue` would return the
 * same employee for every query, so the org-scoping spec below — which is the whole point of E3 —
 * could not fail.
 */

const { dbMock, recordPunch, listPunches } = vi.hoisted(() => ({
	recordPunch: vi.fn().mockResolvedValue({ timeLog: { id: 'tl1' } }),
	listPunches: vi.fn().mockResolvedValue([]),
	dbMock: { employee: { findFirst: vi.fn(), findUnique: vi.fn() } }
}))

vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/services/timelog', () => ({ recordPunch, listPunches }))

const { actions, load } = await import('../../src/routes/(app)/punch/+page.server')

const JOJO = 'org_jojo'
const VEENT = 'org_veent' // not food-service
const USER_ID = 'user-benjie'
const JOJO_EMP = 'emp-benjie-jojo'
const HOME_EMP = 'emp-ceo-veent'

/**
 * The cross-tenant fixture. One user id owns TWO employee rows in two orgs — which is the CEO's
 * real shape (#224, `org_veent` + `org_jojo` + `org_sweetleaf`). An unscoped
 * `findUnique({ where: { userId } })` returns whichever row exists regardless of the active org.
 */
const employeesByUser: Record<string, { id: string; organizationId: string }[]> = {
	[USER_ID]: [
		{ id: HOME_EMP, organizationId: VEENT },
		{ id: JOJO_EMP, organizationId: JOJO }
	]
}

const event = (org: string, fields: Record<string, string> = {}, userId = USER_ID) =>
	({
		request: {
			formData: async () => {
				const fd = new FormData()
				for (const [k, v] of Object.entries(fields)) fd.set(k, v)
				return fd
			}
		},
		locals: { user: { id: userId, organizationId: org, roles: ['EMPLOYEE'] } },
		getClientAddress: () => 'test'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	}) as any

/** The `input` object the last `recordPunch` call received. */
const punchInput = () => recordPunch.mock.calls.at(-1)![0]

beforeEach(() => {
	vi.clearAllMocks()
	recordPunch.mockResolvedValue({ timeLog: { id: 'tl1' } })
	listPunches.mockResolvedValue([])
	// Honour BOTH scoping keys. A query that dropped `organizationId` would match the first row
	// for that user, which is the defect E3 exists to prevent.
	dbMock.employee.findFirst.mockImplementation(({ where }) =>
		Promise.resolve(
			(employeesByUser[where.userId] ?? []).find(
				(e) => where.organizationId === undefined || e.organizationId === where.organizationId
			) ?? null
		)
	)
})

describe('C7 — no reading in the form still records the punch', () => {
	it('passes location: null and returns success, not a fail', async () => {
		const res = await actions.punch!(event(JOJO, { punchType: 'IN' }))
		expect(recordPunch).toHaveBeenCalledTimes(1)
		expect(punchInput().location).toBeNull()
		expect(res).toMatchObject({ punched: 'IN', hadLocation: false })
		// A `fail()` carries a status; a success return does not.
		expect(res).not.toHaveProperty('status')
	})
})

describe('C8 — a bad reading is discarded, never turned into a 400', () => {
	it.each([
		['out of range', { latitude: '999', longitude: '124.6' }],
		['not a number', { latitude: 'abc', longitude: '124.6' }],
		['longitude out of range', { latitude: '8.4', longitude: '999' }],
		['half a reading', { latitude: '8.4' }],
		['empty strings', { latitude: '', longitude: '' }]
	])('%s → location: null, punch still succeeds', async (_label, loc) => {
		const res = await actions.punch!(event(JOJO, { punchType: 'IN', ...loc }))
		expect(punchInput().location).toBeNull()
		expect(res).toMatchObject({ punched: 'IN', hadLocation: false })
	})
})

describe('C9 — a valid reading is forwarded, accuracy optional', () => {
	it('forwards coordinates with accuracy', async () => {
		const res = await actions.punch!(
			event(JOJO, {
				punchType: 'IN',
				latitude: '8.4772',
				longitude: '124.6459',
				accuracyM: '12'
			})
		)
		expect(punchInput().location).toEqual({
			latitude: 8.4772,
			longitude: 124.6459,
			accuracyM: 12
		})
		expect(res).toMatchObject({ hadLocation: true })
	})

	it('forwards coordinates with accuracy absent rather than dropping them', async () => {
		await actions.punch!(
			event(JOJO, { punchType: 'IN', latitude: '8.4772', longitude: '124.6459' })
		)
		expect(punchInput().location).toEqual({
			latitude: 8.4772,
			longitude: 124.6459,
			accuracyM: undefined
		})
	})

	it('marks the punch WEB and gives it a per-minute dedup key', async () => {
		await actions.punch!(event(JOJO, { punchType: 'OUT' }))
		expect(punchInput().source).toBe('WEB')
		expect(punchInput().dedupKey).toMatch(
			new RegExp(`^web:${JOJO_EMP}:OUT:\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$`)
		)
	})
})

describe('C10 — the employee comes from the session, never from the form', () => {
	it('ignores a form-supplied employeeId entirely', async () => {
		await actions.punch!(
			event(JOJO, { punchType: 'IN', employeeId: 'emp-somebody-else', userId: 'someone-else' })
		)
		expect(punchInput().employeeId).toBe(JOJO_EMP)
		// The lookup is keyed on the SESSION user id, so a form field could not have reached it.
		expect(dbMock.employee.findFirst.mock.calls.at(-1)![0].where.userId).toBe(USER_ID)
	})

	it('never resolves the employee with findUnique — that form is not org-scoped (E3)', async () => {
		await actions.punch!(event(JOJO, { punchType: 'IN' }))
		expect(dbMock.employee.findUnique).not.toHaveBeenCalled()
	})
})

describe('E3 — the punch is written into the ACTIVE org, not the account’s home org', () => {
	it('a cross-org user punching in JoJo writes the JoJo employee', async () => {
		await actions.punch!(event(JOJO, { punchType: 'IN' }))
		expect(punchInput().employeeId).toBe(JOJO_EMP)
		expect(dbMock.employee.findFirst.mock.calls.at(-1)![0].where).toEqual({
			userId: USER_ID,
			organizationId: JOJO
		})
	})

	it('the same user in Sweetleaf, where they have no employee row, is refused — not silently filed into JoJo', async () => {
		const res = await actions.punch!(event('org_sweetleaf', { punchType: 'IN' }))
		expect(res).toMatchObject({ status: 404 })
		expect(recordPunch).not.toHaveBeenCalled()
	})

	it('load is org-scoped too — a load-only or action-only fix is half a fix', async () => {
		await load!(event(JOJO))
		expect(dbMock.employee.findFirst.mock.calls.at(-1)![0].where).toEqual({
			userId: USER_ID,
			organizationId: JOJO
		})
		expect(dbMock.employee.findUnique).not.toHaveBeenCalled()
	})
})

describe('C11 — Veent is untouched (negative control, criterion 20)', () => {
	it('the ACTION 404s for a non-food-service org and never reaches the service', async () => {
		// The nav link and the page are gated cosmetically; a direct POST lands here. This is the
		// twin door — a load-only guard would leave it wide open.
		await expect(actions.punch!(event(VEENT, { punchType: 'IN' }))).rejects.toMatchObject({
			status: 404
		})
		expect(recordPunch).not.toHaveBeenCalled()
	})

	it('the LOAD 404s for a non-food-service org', async () => {
		await expect(load!(event(VEENT))).rejects.toMatchObject({ status: 404 })
		expect(listPunches).not.toHaveBeenCalled()
	})
})

describe('C12 — a food-service user with no employee record', () => {
	it('fails 404 without throwing and never reaches the service', async () => {
		const res = await actions.punch!(event(JOJO, { punchType: 'IN' }, 'user-with-no-employee'))
		expect(res).toMatchObject({ status: 404 })
		expect(recordPunch).not.toHaveBeenCalled()
	})

	it('load renders an empty state rather than throwing a bare 404 (M-7)', async () => {
		// The nav link is shown to the whole food-service tenant, so an HR admin — or the cross-org
		// CEO, whose profile lives only in the home tenant — lands here. A thrown 404 drops them on
		// the bare error page, outside the app shell, with no nav and no way back. The ACTION's
		// `fail(404, …)` above is the security boundary and stays; this one was only ever a UI state.
		const res = await load!(event(JOJO, {}, 'user-with-no-employee'))
		expect(res).toMatchObject({ linked: false, punches: [], since: null })
		expect(listPunches).not.toHaveBeenCalled()
	})
})

describe('M-4 — the page answers "am I clocked in?" without reading the list', () => {
	const punchRow = (punchType: 'IN' | 'OUT', iso: string) => ({
		id: `tl-${punchType}-${iso}`,
		punchType,
		source: 'WEB',
		timestamp: new Date(iso),
		latitude: null,
		longitude: null,
		locationAccuracyM: null
	})

	it('reports the time when the NEWEST punch is an IN', async () => {
		// `listPunches` returns oldest-first; `load` reverses. Two rows, so a bug that read the
		// oldest instead of the newest gives the opposite answer rather than the same one.
		listPunches.mockResolvedValue([
			punchRow('OUT', '2026-08-16T09:00:00Z'),
			punchRow('IN', '2026-08-17T00:03:00Z')
		])
		const res = (await load!(event(JOJO))) as { since: string | null; punches: { at: string }[] }
		expect(res.since).toBe(res.punches[0].at)
		expect(res.since).toContain('8:03 AM PHT')
	})

	it('reports null when the newest punch is an OUT', async () => {
		listPunches.mockResolvedValue([
			punchRow('IN', '2026-08-17T00:03:00Z'),
			punchRow('OUT', '2026-08-17T09:00:00Z')
		])
		const res = (await load!(event(JOJO))) as { since: string | null }
		expect(res.since).toBeNull()
	})

	it('reports null when there are no punches at all', async () => {
		listPunches.mockResolvedValue([])
		const res = (await load!(event(JOJO))) as { since: string | null }
		expect(res.since).toBeNull()
	})
})

describe('the punch type is the only required field', () => {
	it('a missing punchType fails 400 before any employee write', async () => {
		const res = await actions.punch!(event(JOJO, {}))
		expect(res).toMatchObject({ status: 400 })
		expect(recordPunch).not.toHaveBeenCalled()
	})

	it('a garbage punchType fails 400', async () => {
		const res = await actions.punch!(event(JOJO, { punchType: 'BREAK_START' }))
		expect(res).toMatchObject({ status: 400 })
		expect(recordPunch).not.toHaveBeenCalled()
	})
})

describe('a service refusal reaches the operator as a form message, not a 500', () => {
	it('maps a 409 double-submit onto fail(409)', async () => {
		recordPunch.mockRejectedValue({
			status: 409,
			body: { message: 'This punch has already been recorded' }
		})
		const res = await actions.punch!(event(JOJO, { punchType: 'IN' }))
		expect(res).toMatchObject({ status: 409 })
	})

	it('rethrows anything that is not a mapped refusal', async () => {
		recordPunch.mockRejectedValue(new Error('database is on fire'))
		await expect(actions.punch!(event(JOJO, { punchType: 'IN' }))).rejects.toThrow(
			'database is on fire'
		)
	})
})

describe('the page ships only the employee’s own punches, projected', () => {
	it('reads its own id and returns named fields only', async () => {
		listPunches.mockResolvedValue([
			{
				id: 'tl1',
				punchType: 'IN',
				source: 'WEB',
				timestamp: new Date('2026-08-17T01:00:00Z'),
				latitude: 8.4772,
				longitude: 124.6459,
				locationAccuracyM: 12,
				dedupKey: 'web:secret',
				note: 'internal',
				timesheetId: 'ts1'
			}
		])
		// `load`'s declared return type is a union with `void`; this file is the only place that
		// reads the payload, so narrow here rather than loosening the route's types.
		const res = (await load!(event(JOJO))) as { punches: Record<string, unknown>[] }
		expect(listPunches).toHaveBeenCalledWith(JOJO_EMP, expect.anything())
		expect(Object.keys(res.punches[0]).sort()).toEqual([
			'at',
			'dayKey',
			'id',
			'latitude',
			'locationAccuracyM',
			'longitude',
			'punchType',
			'source'
		])
	})
})
