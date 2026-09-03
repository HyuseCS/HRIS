import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextSignatorySlot, isFullySigned } from '$lib/server/performance/signoff-plan'
import type { SignatorySlot } from '$lib/server/performance/types'
import type { AuditContext } from '$lib/server/services/types'

// #178 plan item 139 — the pure sign-off order module. SPEC AC11: signing is sequential, and
// the same function answers "whose turn is it" for the UI affordance AND for the server's
// out-of-turn rejection, so the two cannot disagree.
//
// The module reads no clock and no database, so these tests need no fake timers, no ambient
// timezone and no fixtures: they are the same on any machine.
//
// There is deliberately NO stored current-signatory pointer — the turn is DERIVED from
// `signatoryOrder` plus the rows that exist. The last two describes below are the ones that
// hold that derivation honest.

const ORDER: SignatorySlot[] = [
	{ id: 'sig_1', role: 'IMMEDIATE_SUPERVISOR', label: 'Immediate Supervisor' },
	{ id: 'sig_2', role: 'HR_REPRESENTATIVE', label: 'HR Representative' },
	{ id: 'sig_3', role: 'DEPARTMENT_HEAD', label: 'Department Head' },
	{ id: 'sig_4', role: 'EMPLOYEE', label: 'Employee' }
]

const signed = (...slotIds: string[]) => slotIds.map((slotId) => ({ slotId }))

describe('nextSignatorySlot — the in-order walk (AC11)', () => {
	it('returns slot 0 when nothing has been signed yet', () => {
		expect(nextSignatorySlot(ORDER, [])?.id).toBe('sig_1')
	})

	it('advances one slot at a time as each signature is recorded, in order', () => {
		expect(nextSignatorySlot(ORDER, signed('sig_1'))?.id).toBe('sig_2')
		expect(nextSignatorySlot(ORDER, signed('sig_1', 'sig_2'))?.id).toBe('sig_3')
		expect(nextSignatorySlot(ORDER, signed('sig_1', 'sig_2', 'sig_3'))?.id).toBe('sig_4')
	})

	it('returns null once every slot in the order is signed', () => {
		expect(nextSignatorySlot(ORDER, signed('sig_1', 'sig_2', 'sig_3', 'sig_4'))).toBeNull()
	})

	// THE OUT-OF-TURN CASE. The function does not reject — it hands back the slot whose turn it
	// genuinely is, and the caller turns "that is not the slot you asked for" into the 409 the
	// server-side rejection needs. The Department Head trying to jump the queue is told the turn
	// belongs to the Immediate Supervisor.
	it('hands back the WRONG slot for a signatory trying to sign out of turn', () => {
		const wanted = ORDER[2] // Department Head
		const turn = nextSignatorySlot(ORDER, [])
		expect(turn?.id).toBe('sig_1')
		expect(turn?.id).not.toBe(wanted.id)
	})

	it('still refuses to skip a gap when a later slot was somehow signed first', () => {
		// Only slot 2 has a row. The turn is still slot 1 — the walk never skips a hole.
		expect(nextSignatorySlot(ORDER, signed('sig_2'))?.id).toBe('sig_1')
	})

	// Impossible against an immutable templateSnapshot, but a stray row must not throw and must
	// not be counted as progress against any real slot.
	it('ignores a signoff for a slot that is not in the order, without crashing', () => {
		expect(nextSignatorySlot(ORDER, signed('sig_deleted'))?.id).toBe('sig_1')
		expect(
			nextSignatorySlot(ORDER, signed('sig_1', 'sig_2', 'sig_3', 'sig_4', 'sig_deleted'))
		).toBeNull()
	})

	// One person may hold several slots on the same review (the immediate supervisor is often
	// also the department head in a small org). There is no same-signer check anywhere — the
	// order is by SLOT, and the same human simply signs twice.
	it('walks slot by slot even when one person would hold several of them', () => {
		expect(nextSignatorySlot(ORDER, signed('sig_1'))?.id).toBe('sig_2')
		expect(nextSignatorySlot(ORDER, signed('sig_1', 'sig_2'))?.id).toBe('sig_3')
	})
})

describe('nextSignatorySlot — the derivation must not depend on the rows themselves', () => {
	// @@unique([reviewId, slotId]) should make this impossible, but a miscount here would
	// advance the turn past a slot nobody signed, so it is proven rather than assumed.
	it('does not miscount when duplicate rows exist for the same slot', () => {
		expect(nextSignatorySlot(ORDER, signed('sig_1', 'sig_1', 'sig_1'))?.id).toBe('sig_2')
		expect(isFullySigned(ORDER, signed('sig_1', 'sig_1', 'sig_1'))).toBe(false)
		// Three duplicates of slot 1 plus slot 2 is FOUR rows against a four-slot order. A
		// length comparison would call this fully signed; two slots are still unsigned.
		expect(nextSignatorySlot(ORDER, signed('sig_1', 'sig_1', 'sig_1', 'sig_2'))?.id).toBe('sig_3')
		expect(isFullySigned(ORDER, signed('sig_1', 'sig_1', 'sig_1', 'sig_2'))).toBe(false)
	})

	// ORDER IS THE DATA: `signatoryOrder`'s positions, never the arrival order of the rows.
	// Prisma returns signoffs in whatever order the query gave. Anything reading the array
	// position of `existingSignoffs` fails here.
	it('is unaffected by signoff rows arriving out of order', () => {
		expect(nextSignatorySlot(ORDER, signed('sig_2', 'sig_1'))?.id).toBe('sig_3')
		expect(nextSignatorySlot(ORDER, signed('sig_3', 'sig_1', 'sig_2'))?.id).toBe('sig_4')
		expect(nextSignatorySlot(ORDER, signed('sig_4', 'sig_3', 'sig_2', 'sig_1'))).toBeNull()
	})

	it('follows a template whose declared order is different', () => {
		// The employee signs FIRST on this template. The answer must come from the order given,
		// not from any fixed idea of who signs when.
		const employeeFirst = [ORDER[3], ORDER[0], ORDER[1]]
		expect(nextSignatorySlot(employeeFirst, [])?.id).toBe('sig_4')
		expect(nextSignatorySlot(employeeFirst, signed('sig_4'))?.id).toBe('sig_1')
	})
})

describe('isFullySigned', () => {
	it('is false while any slot is unsigned', () => {
		expect(isFullySigned(ORDER, [])).toBe(false)
		expect(isFullySigned(ORDER, signed('sig_1', 'sig_2', 'sig_3'))).toBe(false)
	})

	it('is true only when every slot in the order has a signature', () => {
		expect(isFullySigned(ORDER, signed('sig_1', 'sig_2', 'sig_3', 'sig_4'))).toBe(true)
	})

	it('is not fooled by a stray row for a slot outside the order', () => {
		// Four rows against a four-slot order, but one of them belongs to no slot.
		expect(isFullySigned(ORDER, signed('sig_1', 'sig_2', 'sig_3', 'sig_gone'))).toBe(false)
	})
})

// ── The same rule, at the SERVICE level (#178 plan item 148) ─────────────────
//
// Everything above proves the pure function. This proves the SERVER ENFORCES it: SPEC AC11's
// out-of-turn rejection has to live in `attestSignoff`, because the page's Attest button is a
// convenience and a direct POST skips the page entirely. A UI-only check is not a guard.
//
// The negative control is the point of this block. Asserting only that the call throws would
// still pass if the row had been written first and the throw came afterwards — so the review's
// status must be unchanged AND no ReviewSignoff row may exist.

const { dbMock, writeAuditLog } = vi.hoisted(() => ({
	dbMock: {
		performanceReview: { findFirst: vi.fn(), update: vi.fn() },
		user: { findMany: vi.fn() },
		$transaction: vi.fn()
	},
	writeAuditLog: vi.fn()
}))
vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog }))

const { attestSignoff } = await import('$lib/server/services/performance')
const { blankTemplateStructure } = await import('$lib/server/performance/schemas')

const SERVICE_ORG = 'org_1'
const SERVICE_REVIEW = 'rev_1'
const SUPERVISOR = 'usr_supervisor'
const HR = 'usr_hr'
const HEAD = 'usr_head'
const EMPLOYEE = 'usr_employee'

const serviceCtx: AuditContext = {
	organizationId: SERVICE_ORG,
	actorId: HEAD,
	actorRoles: ['HR_ADMIN']
}

const REVIEW = {
	id: SERVICE_REVIEW,
	status: 'SCORED',
	templateSnapshot: {
		version: 1,
		templateId: 'tmpl_1',
		templateName: 'Admin Staff',
		snapshotAt: '2026-08-01T00:00:00.000Z',
		structure: { ...blankTemplateStructure(), signatoryOrder: ORDER }
	},
	cycle: { organizationId: SERVICE_ORG, name: 'Jul-Aug 2026' },
	employee: {
		id: 'emp_subject',
		firstName: 'Ana',
		lastName: 'Reyes',
		userId: EMPLOYEE,
		department: { name: 'Operations', head: { userId: HEAD } }
	},
	reviewer: { userId: SUPERVISOR },
	// NOTHING signed: the turn belongs to slot 0, the Immediate Supervisor.
	signoffs: [] as { slotId: string }[]
}

const serviceTx = {
	reviewSignoff: { create: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
	performanceReview: { update: vi.fn() }
}

describe('attestSignoff — the server rejects an out-of-turn signature (AC11)', () => {
	beforeEach(() => {
		vi.clearAllMocks()
		dbMock.$transaction.mockImplementation((fn: (client: typeof serviceTx) => unknown) =>
			fn(serviceTx)
		)
		dbMock.user.findMany.mockResolvedValue([{ id: HR }])
		dbMock.performanceReview.findFirst.mockResolvedValue(REVIEW)
		serviceTx.reviewSignoff.create.mockResolvedValue({ id: 'so_1' })
		serviceTx.reviewSignoff.findMany.mockResolvedValue([])
		serviceTx.performanceReview.update.mockResolvedValue({ id: SERVICE_REVIEW, status: 'SIGNING' })
	})

	// Each of these three is a legitimate signatory on this review — just not yet.
	it.each([
		['the Department Head', HEAD],
		['HR', HR],
		['the Employee', EMPLOYEE]
	])('throws 409 when %s tries to jump ahead of the Immediate Supervisor', async (_who, userId) => {
		await expect(
			attestSignoff(SERVICE_REVIEW, SERVICE_ORG, userId, 'Jumped The Queue', serviceCtx)
		).rejects.toMatchObject({ status: 409 })

		// THE NEGATIVE CONTROL — no row, no status change, no audit entry.
		expect(serviceTx.reviewSignoff.create).not.toHaveBeenCalled()
		expect(serviceTx.performanceReview.update).not.toHaveBeenCalled()
		expect(dbMock.performanceReview.update).not.toHaveBeenCalled()
		expect(writeAuditLog).not.toHaveBeenCalled()
		// The transaction is never even opened: the rejection happens before any write.
		expect(dbMock.$transaction).not.toHaveBeenCalled()
	})

	// POSITIVE CONTROL. Without this, dropping the whole `attestSignoff` body would still make
	// the three cases above pass.
	it('accepts the signatory whose turn it actually is', async () => {
		await attestSignoff(SERVICE_REVIEW, SERVICE_ORG, SUPERVISOR, 'Sup Ervisor', serviceCtx)

		expect(serviceTx.reviewSignoff.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ slotId: 'sig_1', attestedByUserId: SUPERVISOR })
			})
		)
		expect(serviceTx.performanceReview.update).toHaveBeenCalledWith(
			expect.objectContaining({ data: { status: 'SIGNING' } })
		)
	})
})
