import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Role } from '@prisma/client'

/**
 * Phase 04 S6 — the audit's §B/§E high-stakes actions. Voiding a payroll run, releasing or
 * voiding a period, signing off a run, locking attendance and deactivating a login all ran their
 * service and returned `undefined`. Nothing was rendered, so the most consequential clicks in the
 * app were indistinguishable from a click that did nothing.
 *
 * These tests pin the SUCCESS PAYLOAD SHAPE only: `{ action, saved }`, where `action` names the
 * form action (that is what routes a message to the right card on a multi-action page) and `saved`
 * is a non-empty string (the `saved: true | string` contract — a string IS the message, and
 * `submitFeedback` toasts it with no per-site wiring).
 *
 * They do NOT prove the browser renders any of it. That is the Hybrid live gate.
 */

const svc = vi.hoisted(() => ({
	voidRun: vi.fn(),
	decidePayrollRun: vi.fn(),
	release: vi.fn(),
	voidPeriod: vi.fn(),
	setUserActive: vi.fn(),
	lockRange: vi.fn(),
	unlockRange: vi.fn(),
	resetDayToDerived: vi.fn()
}))

vi.mock('$lib/server/db', () => ({ db: {} }))
vi.mock('$lib/server/services/payroll/index', () => ({
	listPayrollRuns: vi.fn(),
	createPayrollRun: vi.fn(),
	computePayroll: vi.fn(),
	getPayrollRun: vi.fn(),
	overridePayrollEntry: vi.fn()
}))
vi.mock('$lib/server/services/payroll/runs', () => ({
	voidRun: svc.voidRun,
	isPayslipVisible: vi.fn()
}))
vi.mock('$lib/server/services/payroll/periods', () => ({
	listPeriods: vi.fn(),
	openPeriod: vi.fn(),
	importAttendance: vi.fn(),
	generate: vi.fn(),
	lock: vi.fn(),
	release: svc.release,
	voidPeriod: svc.voidPeriod
}))
vi.mock('$lib/server/services/approvals', () => ({
	livePayrollStage: vi.fn(),
	decidePayrollRun: svc.decidePayrollRun,
	canActOnPayrollStage: vi.fn(),
	decidedActorIds: vi.fn()
}))
vi.mock('$lib/server/services/employee-access', () => ({ listVisiblePayEmployeeIds: vi.fn() }))
vi.mock('$lib/server/services/settings/org', () => ({
	listOrgUsers: vi.fn(),
	setUserRoles: vi.fn(),
	setUserActive: svc.setUserActive
}))
vi.mock('$lib/server/services/attendance', () => ({
	countAttendanceDays: vi.fn(),
	listAttendanceDays: vi.fn(),
	listTeamDay: vi.fn(),
	deriveRange: vi.fn(),
	autoDeriveFromPunches: vi.fn(),
	correctDay: vi.fn(),
	lockRange: svc.lockRange,
	unlockRange: svc.unlockRange,
	resetDayToDerived: svc.resetDayToDerived,
	createTimesheetFromAttendance: vi.fn()
}))
vi.mock('$lib/server/services/attendance/import', () => ({
	importBacklogCsv: vi.fn(),
	MAX_IMPORT_BYTES: 1,
	MAX_IMPORT_ROWS: 1
}))

const payroll = await import('../../src/routes/(app)/payroll/+page.server')
const payrollRun = await import('../../src/routes/(app)/payroll/[id]/+page.server')
const periods = await import('../../src/routes/(app)/payroll/periods/+page.server')
const roles = await import('../../src/routes/(app)/settings/roles/+page.server')
const attendance = await import('../../src/routes/(app)/attendance/+page.server')

const SUPER: Role[] = ['SUPER_ADMIN']

const event = (fields: Record<string, string>, actorRoles: Role[] = SUPER) => {
	const body = new FormData()
	for (const [k, v] of Object.entries(fields)) body.set(k, v)
	return {
		request: { formData: async () => body },
		params: { id: 'run1' },
		locals: { user: { id: 'actor', organizationId: 'org1', roles: actorRoles } },
		getClientAddress: () => '127.0.0.1'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (action: any, fields: Record<string, string>) =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	action(event(fields)) as Promise<any>

beforeEach(() => {
	vi.clearAllMocks()
	for (const fn of Object.values(svc)) fn.mockResolvedValue(undefined)
})

/** The `saved: true | string` contract as an assertion. */
function expectFeedback(res: unknown, action: string) {
	const r = res as { action?: string; saved?: unknown }
	expect(r?.action).toBe(action)
	expect(typeof r?.saved).toBe('string')
	expect(String(r?.saved).length).toBeGreaterThan(0)
}

describe('money-adjacent actions report their outcome', () => {
	it('payroll ?/void names itself and says the run was voided', async () => {
		expectFeedback(await run(payroll.actions.void, { id: 'run1' }), 'void')
		expect(svc.voidRun).toHaveBeenCalledOnce()
	})

	it('payroll/periods ?/release and ?/void each report', async () => {
		expectFeedback(await run(periods.actions.release, { id: 'p1' }), 'release')
		expectFeedback(await run(periods.actions.void, { id: 'p1' }), 'void')
	})

	it('payroll/[id] ?/decide distinguishes a sign-off from a return', async () => {
		const approved = await run(payrollRun.actions.decide, { action: 'approve' })
		const returned = await run(payrollRun.actions.decide, { action: 'return', note: 'redo' })
		expectFeedback(approved, 'decide')
		expectFeedback(returned, 'decide')
		// A single generic "Done." would pass a weaker assertion while leaving the approver unable
		// to tell which way the run went.
		expect(approved.saved).not.toBe(returned.saved)
	})
})

describe('permission-adjacent and destructive actions report their outcome', () => {
	it('settings/roles ?/setActive distinguishes activate from deactivate', async () => {
		const on = await run(roles.actions.setActive, { userId: 'u1', isActive: 'true' })
		const off = await run(roles.actions.setActive, { userId: 'u1', isActive: 'false' })
		expectFeedback(on, 'setActive')
		expectFeedback(off, 'setActive')
		expect(on.saved).not.toBe(off.saved)
	})

	it('attendance lock / unlock / lockTeam / unlockTeam / resetDay each report', async () => {
		const range = { employeeId: 'e1', from: '2026-09-01', to: '2026-09-15' }
		expectFeedback(await run(attendance.actions.lock, range), 'lock')
		expectFeedback(await run(attendance.actions.unlock, range), 'unlock')
		expectFeedback(await run(attendance.actions.lockTeam, { date: '2026-09-01' }), 'lockTeam')
		expectFeedback(await run(attendance.actions.unlockTeam, { date: '2026-09-01' }), 'unlockTeam')
		expectFeedback(await run(attendance.actions.resetDay, { id: 'day1' }), 'resetDay')
	})
})
