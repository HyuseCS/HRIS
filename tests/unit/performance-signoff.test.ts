import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Prisma } from '@prisma/client'
import type { AuditContext } from '$lib/server/services/types'
import { blankTemplateStructure } from '$lib/server/performance/schemas'
import type { SignatorySlot, TemplateStructure } from '$lib/server/performance/types'

/**
 * #178 plan item 147 — the sign-off SERVICE, at SPEC AC10, AC12 and AC13.
 *
 * The mocks below behave like a tiny database rather than returning canned values: signoff rows
 * are kept in a real array, `create` honours `@@unique([reviewId, slotId])` by throwing a real
 * P2002, and `findMany` reads the array back. That is what makes these tests able to go red.
 * A `create` that recorded nothing would let `attestSignoff` compute "fully signed" from a
 * stale pre-insert list and still pass — which is exactly the drift `signoff-plan.ts` exists to
 * prevent, so the harness must be able to observe it.
 */

const { dbMock, writeAuditLog } = vi.hoisted(() => ({
	dbMock: {
		performanceReview: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
		user: { findMany: vi.fn() },
		$transaction: vi.fn()
	},
	writeAuditLog: vi.fn()
}))
vi.mock('$lib/server/db', () => ({ db: dbMock }))
vi.mock('$lib/server/audit', () => ({ writeAuditLog }))

const { attestSignoff, listStalledSignoffs, resolveSlotHolders } =
	await import('$lib/server/services/performance')

const ORG = 'org_1'
const REVIEW_ID = 'rev_1'
const USR_SUPERVISOR = 'usr_supervisor'
const USR_HR = 'usr_hr'
const USR_HEAD = 'usr_head'
const USR_EMPLOYEE = 'usr_employee'

const ORDER: SignatorySlot[] = [
	{ id: 'sig_1', role: 'IMMEDIATE_SUPERVISOR', label: 'Immediate Supervisor' },
	{ id: 'sig_2', role: 'HR_REPRESENTATIVE', label: 'HR Representative' },
	{ id: 'sig_3', role: 'DEPARTMENT_HEAD', label: 'Department Head' },
	{ id: 'sig_4', role: 'EMPLOYEE', label: 'Employee' }
]

/** A real, schema-valid structure — the snapshot must parse or the service refuses it. */
const structureWith = (signatoryOrder: SignatorySlot[]): TemplateStructure => ({
	...blankTemplateStructure(),
	signatoryOrder
})

const snapshotOf = (signatoryOrder: SignatorySlot[]) => ({
	version: 1,
	templateId: 'tmpl_1',
	templateName: 'Admin Staff',
	snapshotAt: '2026-08-01T00:00:00.000Z',
	structure: structureWith(signatoryOrder)
})

const ctx: AuditContext = { organizationId: ORG, actorId: USR_HR, actorRoles: ['HR_ADMIN'] }

/** The signoff rows that "exist". Reset per test; mutated by the fake `create`. */
let rows: { reviewId: string; slotId: string; typedName: string }[] = []

/** What the fake `performanceReview.update` last wrote, plus the row's starting state. */
let reviewState: { status: string; completedAt: Date | null }

function reviewRow(opts: {
	id?: string
	snapshot?: unknown
	headUserId?: string | null
	employeeUserId?: string | null
	reviewerUserId?: string | null
	status?: string
}) {
	const id = opts.id ?? REVIEW_ID
	return {
		id,
		status: opts.status ?? reviewState.status,
		templateSnapshot: opts.snapshot ?? snapshotOf(ORDER),
		cycle: { organizationId: ORG, name: 'Jul-Aug 2026' },
		employee: {
			id: 'emp_subject',
			firstName: 'Ana',
			lastName: 'Reyes',
			userId: opts.employeeUserId === undefined ? USR_EMPLOYEE : opts.employeeUserId,
			department: {
				name: 'Operations',
				head:
					opts.headUserId === undefined
						? { userId: USR_HEAD }
						: opts.headUserId === null
							? null
							: { userId: opts.headUserId }
			}
		},
		reviewer: { userId: opts.reviewerUserId === undefined ? USR_SUPERVISOR : opts.reviewerUserId },
		signoffs: rows.filter((r) => r.reviewId === id).map((r) => ({ slotId: r.slotId }))
	}
}

const tx = {
	reviewSignoff: { create: vi.fn(), findMany: vi.fn() },
	performanceReview: { update: vi.fn() }
}

beforeEach(() => {
	vi.clearAllMocks()
	rows = []
	reviewState = { status: 'SCORED', completedAt: null }

	dbMock.$transaction.mockImplementation((fn: (client: typeof tx) => unknown) => fn(tx))
	dbMock.user.findMany.mockResolvedValue([{ id: USR_HR }])
	// Honours the org scope too — `attestSignoff` reads through `cycle.organizationId`, so a
	// mock that ignored it could not tell a scoped lookup from an unscoped one.
	dbMock.performanceReview.findFirst.mockImplementation(
		({ where }: { where: { id: string; cycle: { organizationId: string } } }) =>
			Promise.resolve(
				where.id === REVIEW_ID && where.cycle.organizationId === ORG ? reviewRow({}) : null
			)
	)

	// Honours @@unique([reviewId, slotId]) — the constraint IS the arbiter of the race.
	tx.reviewSignoff.create.mockImplementation(
		({ data }: { data: { reviewId: string; slotId: string; typedName: string } }) => {
			if (rows.some((r) => r.reviewId === data.reviewId && r.slotId === data.slotId)) {
				throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
					code: 'P2002',
					clientVersion: '5'
				})
			}
			rows.push(data)
			return Promise.resolve({ id: `so_${data.slotId}` })
		}
	)
	tx.reviewSignoff.findMany.mockImplementation(({ where }: { where: { reviewId: string } }) =>
		Promise.resolve(
			rows.filter((r) => r.reviewId === where.reviewId).map((r) => ({ slotId: r.slotId }))
		)
	)
	tx.performanceReview.update.mockImplementation(
		({ data }: { data: { status: string; completedAt?: Date } }) => {
			reviewState = {
				status: data.status,
				completedAt: data.completedAt ?? reviewState.completedAt
			}
			return Promise.resolve({ id: REVIEW_ID, ...reviewState })
		}
	)
})

describe('AC10 — COMPLETED is blocked while any required signatory is missing', () => {
	it('stays SIGNING through every slot but the last, then flips to COMPLETED on it', async () => {
		await attestSignoff(REVIEW_ID, ORG, USR_SUPERVISOR, 'Sup Ervisor', ctx)
		expect(reviewState.status).toBe('SIGNING')
		expect(reviewState.completedAt).toBeNull()

		await attestSignoff(REVIEW_ID, ORG, USR_HR, 'H R Admin', ctx)
		expect(reviewState.status).toBe('SIGNING')

		await attestSignoff(REVIEW_ID, ORG, USR_HEAD, 'Dept Head', ctx)
		expect(reviewState.status).toBe('SIGNING')
		expect(reviewState.completedAt).toBeNull()

		// THE LAST SIGNATURE. This only flips if `isFullySigned` is recomputed from the rows that
		// exist AFTER the insert — on the pre-insert list, slot 4 is still unsigned here.
		await attestSignoff(REVIEW_ID, ORG, USR_EMPLOYEE, 'Ana Reyes', ctx)
		expect(reviewState.status).toBe('COMPLETED')
		expect(reviewState.completedAt).toBeInstanceOf(Date)
		expect(rows).toHaveLength(4)
	})

	it('cannot reach COMPLETED when the department head slot has no holder', async () => {
		dbMock.performanceReview.findFirst.mockImplementation(() =>
			Promise.resolve(reviewRow({ headUserId: null }))
		)

		await attestSignoff(REVIEW_ID, ORG, USR_SUPERVISOR, 'Sup Ervisor', ctx)
		await attestSignoff(REVIEW_ID, ORG, USR_HR, 'H R Admin', ctx)
		expect(reviewState.status).toBe('SIGNING')

		// Nobody holds slot 3, so nobody can pass the holder check — not even the employee whose
		// own slot is next in the list. The queue does not skip the hole.
		await expect(
			attestSignoff(REVIEW_ID, ORG, USR_EMPLOYEE, 'Ana Reyes', ctx)
		).rejects.toMatchObject({
			status: 409
		})
		await expect(attestSignoff(REVIEW_ID, ORG, USR_HEAD, 'Dept Head', ctx)).rejects.toMatchObject({
			status: 409
		})

		// Negative control: the review is still SIGNING and only the two valid rows exist.
		expect(reviewState.status).toBe('SIGNING')
		expect(reviewState.completedAt).toBeNull()
		expect(rows.map((r) => r.slotId)).toEqual(['sig_1', 'sig_2'])
	})

	it('refuses a further attestation once every slot is signed', async () => {
		await attestSignoff(REVIEW_ID, ORG, USR_SUPERVISOR, 'Sup Ervisor', ctx)
		await attestSignoff(REVIEW_ID, ORG, USR_HR, 'H R Admin', ctx)
		await attestSignoff(REVIEW_ID, ORG, USR_HEAD, 'Dept Head', ctx)
		await attestSignoff(REVIEW_ID, ORG, USR_EMPLOYEE, 'Ana Reyes', ctx)

		await expect(attestSignoff(REVIEW_ID, ORG, USR_HR, 'H R Admin', ctx)).rejects.toMatchObject({
			status: 400
		})
		expect(rows).toHaveLength(4)
	})

	it('reports the P2002 race as a 409 rather than a 500', async () => {
		// Two valid holders of one slot attesting at the same instant: both pass the turn check
		// against the same pre-insert view, and the unique constraint decides.
		dbMock.performanceReview.findFirst.mockImplementation(() =>
			// The supervisor is also the department head here, so both reads see slot 1 unsigned.
			Promise.resolve(reviewRow({ headUserId: USR_SUPERVISOR }))
		)
		const stale = reviewRow({ headUserId: USR_SUPERVISOR })
		await attestSignoff(REVIEW_ID, ORG, USR_SUPERVISOR, 'Sup Ervisor', ctx)
		// Replay the FIRST caller's stale read — slot 1 still looks unsigned to it.
		dbMock.performanceReview.findFirst.mockResolvedValueOnce(stale)

		await expect(
			attestSignoff(REVIEW_ID, ORG, USR_SUPERVISOR, 'Sup Ervisor', ctx)
		).rejects.toMatchObject({ status: 409 })
		expect(rows).toHaveLength(1)
	})
})

describe('AC13 — the snapshot is what orders the signatures, not the live template', () => {
	it('leaves an already-open review on its OWN order when the template is reordered', async () => {
		// The live template now puts the Employee first. This review was snapshotted before that.
		const reordered = [ORDER[3], ORDER[0], ORDER[1], ORDER[2]]
		expect(reordered[0].id).toBe('sig_4')

		// The review still carries the ORIGINAL order in its immutable snapshot.
		dbMock.performanceReview.findFirst.mockImplementation(() =>
			Promise.resolve(reviewRow({ snapshot: snapshotOf(ORDER) }))
		)

		await expect(
			attestSignoff(REVIEW_ID, ORG, USR_EMPLOYEE, 'Ana Reyes', ctx)
		).rejects.toMatchObject({
			status: 409
		})
		expect(rows).toEqual([])

		// The supervisor — first in the SNAPSHOT's order — still signs first.
		await attestSignoff(REVIEW_ID, ORG, USR_SUPERVISOR, 'Sup Ervisor', ctx)
		expect(rows.map((r) => r.slotId)).toEqual(['sig_1'])
	})

	it('applies the new order to a review opened AFTER the reorder', async () => {
		const reordered = [ORDER[3], ORDER[0], ORDER[1], ORDER[2]]
		dbMock.performanceReview.findFirst.mockImplementation(() =>
			Promise.resolve(reviewRow({ snapshot: snapshotOf(reordered) }))
		)

		// Positive control for the test above: same actor, same service, different snapshot.
		await attestSignoff(REVIEW_ID, ORG, USR_EMPLOYEE, 'Ana Reyes', ctx)
		expect(rows.map((r) => r.slotId)).toEqual(['sig_4'])

		// And the supervisor, who signed first under the old order, is now second.
		await attestSignoff(REVIEW_ID, ORG, USR_SUPERVISOR, 'Sup Ervisor', ctx)
		expect(rows.map((r) => r.slotId)).toEqual(['sig_4', 'sig_1'])
	})
})

describe('the attest lookup is org-scoped (#323)', () => {
	// Cross-tenant WRITING was already closed by the holder check — holders are derived from the
	// review's own relations. What was open was DISCLOSURE: an unscoped lookup answered a caller
	// in another org with 409 ("not your turn") for a review that exists and 404 for one that
	// does not, which is an existence oracle over every review id in the product.
	it('returns 404, not 409, for a caller in another organisation', async () => {
		await expect(
			attestSignoff(REVIEW_ID, 'org_other', USR_SUPERVISOR, 'Sup Ervisor', {
				...ctx,
				organizationId: 'org_other'
			})
		).rejects.toMatchObject({ status: 404 })
		expect(rows).toEqual([])
	})

	// POSITIVE CONTROL: the same call from the owning org still succeeds, so the test above is
	// not passing because the id is simply wrong.
	it('still accepts the same signatory from the owning organisation', async () => {
		await attestSignoff(REVIEW_ID, ORG, USR_SUPERVISOR, 'Sup Ervisor', ctx)
		expect(rows.map((r) => r.slotId)).toEqual(['sig_1'])
	})
})

describe('AC12 — the stalled list, recomputed on read', () => {
	const stalledReview = (headUserId: string | null) => ({
		...reviewRow({ headUserId, status: 'SIGNING' }),
		// Slots 1 and 2 are signed; the Department Head is next.
		signoffs: [{ slotId: 'sig_1' }, { slotId: 'sig_2' }]
	})

	it('names a review whose next slot has no holder, and drops it once a head is assigned', async () => {
		dbMock.performanceReview.findMany.mockResolvedValueOnce([stalledReview(null)])
		const before = await listStalledSignoffs(ORG)

		expect(before).toHaveLength(1)
		expect(before[0]).toMatchObject({
			reviewId: REVIEW_ID,
			employeeName: 'Ana Reyes',
			departmentName: 'Operations',
			cycleName: 'Jul-Aug 2026'
		})
		expect(before[0].slot.role).toBe('DEPARTMENT_HEAD')

		// HR assigns a head. NOTHING about the review row changed — the list is recomputed, so
		// the same review must now be absent. A stored flag would still be naming it.
		dbMock.performanceReview.findMany.mockResolvedValueOnce([stalledReview(USR_HEAD)])
		expect(await listStalledSignoffs(ORG)).toEqual([])
	})

	it('does not name a review whose next slot has a holder', async () => {
		// Negative control: nothing signed yet, so the Immediate Supervisor is next — and exists.
		dbMock.performanceReview.findMany.mockResolvedValueOnce([reviewRow({ status: 'SIGNING' })])
		expect(await listStalledSignoffs(ORG)).toEqual([])
	})

	it('scopes to the organisation and to the two in-progress statuses', async () => {
		dbMock.performanceReview.findMany.mockResolvedValueOnce([])
		await listStalledSignoffs(ORG)

		expect(dbMock.performanceReview.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { status: { in: ['SCORED', 'SIGNING'] }, cycle: { organizationId: ORG } }
			})
		)
	})
})

describe('resolveSlotHolders — an empty array means stalled, never a throw', () => {
	const review = {
		cycle: { organizationId: ORG },
		employee: { userId: USR_EMPLOYEE, department: { head: { userId: USR_HEAD } } },
		reviewer: { userId: USR_SUPERVISOR }
	}

	it('resolves each role from the review', async () => {
		expect(await resolveSlotHolders(ORDER[0], review)).toEqual([USR_SUPERVISOR])
		expect(await resolveSlotHolders(ORDER[2], review)).toEqual([USR_HEAD])
		expect(await resolveSlotHolders(ORDER[3], review)).toEqual([USR_EMPLOYEE])
	})

	it('reads HR from the capability table, not role literals', async () => {
		dbMock.user.findMany.mockResolvedValueOnce([{ id: USR_HR }, { id: 'usr_hr2' }])
		expect(await resolveSlotHolders(ORDER[1], review)).toEqual([USR_HR, 'usr_hr2'])

		expect(dbMock.user.findMany).toHaveBeenCalledWith({
			where: {
				organizationId: ORG,
				isActive: true,
				// The capability's roles, so a role added to rbac.ts later is picked up here for free.
				roles: { hasSome: ['HR_ADMIN', 'SUPER_ADMIN'] }
			},
			select: { id: true }
		})
	})

	it('returns [] — not [null] — for a department with no head', async () => {
		const holders = await resolveSlotHolders(ORDER[2], {
			...review,
			employee: { userId: USR_EMPLOYEE, department: { head: null } }
		})
		expect(holders).toEqual([])
		// The trap this guards: [null] has length 1, so a stalled slot would look staffed.
		expect(holders).not.toContain(null)
	})

	it('returns [] for an employee with no login', async () => {
		expect(
			await resolveSlotHolders(ORDER[3], {
				...review,
				employee: { userId: null, department: { head: { userId: USR_HEAD } } }
			})
		).toEqual([])
	})
})

describe('AC13 — the attestation row is a typed name and a timestamp, nothing more', () => {
	it('writes exactly the six columns, and no signature blob', async () => {
		await attestSignoff(REVIEW_ID, ORG, USR_SUPERVISOR, '  Sup Ervisor  ', ctx)

		const { data } = tx.reviewSignoff.create.mock.calls[0][0]
		expect(Object.keys(data).sort()).toEqual([
			'attestedByUserId',
			'order',
			'reviewId',
			'roleLabel',
			'slotId',
			'typedName'
		])
		// Trimmed at the trust boundary. `attestedAt` is the column default — the service does
		// not invent its own clock for it.
		expect(data.typedName).toBe('Sup Ervisor')
		expect(data).toMatchObject({ slotId: 'sig_1', roleLabel: 'Immediate Supervisor', order: 0 })
	})

	it('rejects an empty or oversized typed name before touching the database', async () => {
		await expect(attestSignoff(REVIEW_ID, ORG, USR_SUPERVISOR, '   ', ctx)).rejects.toMatchObject({
			status: 400
		})
		await expect(
			attestSignoff(REVIEW_ID, ORG, USR_SUPERVISOR, 'x'.repeat(201), ctx)
		).rejects.toMatchObject({ status: 400 })
		// The column is VarChar(200): 200 is the boundary that must still be accepted.
		await attestSignoff(REVIEW_ID, ORG, USR_SUPERVISOR, 'x'.repeat(200), ctx)
		expect(rows).toHaveLength(1)
	})

	it('has no signature-blob column on ReviewSignoff in the schema', () => {
		const schema = readFileSync(join(import.meta.dirname, '../../prisma/schema.prisma'), 'utf8')
		const model = schema.match(/^model ReviewSignoff \{$([\s\S]*?)^\}$/m)?.[1]

		// Non-vacuity: the model this gate watches must actually be there.
		expect(
			model,
			'model ReviewSignoff is missing from schema.prisma — this gate is blind'
		).toBeTruthy()

		// What the row IS.
		expect(model).toMatch(/^\s*typedName\s+String\s+@db\.VarChar\(200\)$/m)
		expect(model).toMatch(/^\s*attestedAt\s+DateTime\s+@default\(now\(\)\)$/m)

		// What it must not become. A drawn-signature column is a scope and compliance decision
		// nobody has made.
		const offenders = model!
			.split('\n')
			.filter((line) => !/^\s*\/\//.test(line))
			.filter((line) => /\bBytes\b|signatureImage|signatureData|signatureBlob/i.test(line))
		expect(offenders, 'ReviewSignoff captures a typed name, not a drawn signature').toEqual([])
	})
})
