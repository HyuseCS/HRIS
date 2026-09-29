import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import {
	MARKER,
	createOrgFixture,
	createEmployeeFixture,
	cleanupFixtures,
	disconnectAll,
	verifyDb
} from './audit-tx-harness'

// Same module substitution as the rest of this tier: a REAL PrismaClient against real Postgres,
// audit failure injection left OFF. It has to be real here — the whole claim under test is what
// Postgres does with a tie, and a mocked findMany returns fixture order and cannot disagree with
// itself between two calls.
vi.mock('$lib/server/db', () => import('./audit-tx-harness').then((m) => m.makeInjectedDb()))

const { listTimesheets } = await import('$lib/server/services/timesheets')
const { listRequests } = await import('$lib/server/services/requests')
const { listEmployees } = await import('$lib/server/services/employees')
const { listJobPostings } = await import('$lib/server/services/recruitment')
const { listAssignableEmployees } = await import('$lib/server/services/settings/org')
const { listActionableProposals } = await import('$lib/server/services/action-proposals')
const { listPendingRequestsForApprover } = await import('$lib/server/services/approvals')
const { load: payslipsLoad } = await import('../../src/routes/(app)/payslips/+page.server')
const { load: auditLogLoad } = await import('../../src/routes/(app)/reports/audit-log/+page.server')
const { load: timesheetQueueLoad } =
	await import('../../src/routes/(app)/requests/timesheets/+page.server')

/**
 * The behavioural guard for the ten paginated lists of
 * `process/general-plans/active/paginated-list-tiebreakers_21-09-26/` (F1–F10).
 *
 * WHAT IS PROVEN, and why only this tier can prove it. A list that sorts on a single non-unique
 * column has no total order. Each page is a separate request that re-runs the sort, so Postgres
 * may legally hand back tied rows in a different relative order per request — one row lands on two
 * pages, another becomes unreachable. The unit tier asserts the query ASKS for `{ id: … }` last;
 * it cannot observe what the database answers. Only a real client against real Postgres can.
 *
 * WHY THE FIXTURES TIE THE SORT KEY, everywhere and deliberately. A fixture with distinct
 * `createdAt` / `periodStart` / `submittedAt` / names cannot see this defect at all: the sort is
 * already total, the tiebreaker never engages, and the assertion is green with or without the fix.
 * Every seed below therefore writes ONE value across all its rows for the column its site sorts on.
 * A future edit that varies any of them turns this file vacuous while leaving it green.
 *
 * WHY THE ROW COUNTS ARE 60 AND 300 FOR THE SKIP/TAKE SITES. Measured against these queries, not
 * reasoned: Postgres only reorders the ties once `LIMIT + OFFSET` is small enough relative to the
 * table that the planner picks a top-N heapsort, and the heap it builds for page 1 (N = pageSize)
 * is a different heap from page 2's (N = 2 × pageSize). Below that the plan is one plain sort for
 * every page and the pages agree whether or not a tiebreaker exists. Sweeping the row count showed
 * the first overlap at 50 rows for a 10-row page and at 250 for the audit log's 50-row page; 60 and
 * 300 sit just past those with margin, and at 2 × pageSize every site here passed with its
 * tiebreaker removed.
 *
 * Those two numbers are properties of THESE queries, not of Postgres. A different shape has a
 * different threshold — the e2e `/timesheets` walk reddens at 20 rows where this file's plain
 * `timesheets` read does not. Do not carry 50 and 250 to another test; measure that test.
 *
 * THE FETCH-EVERYTHING SITES: NONE ARE GUARDED (F7, F8, F9, F10). These four have no `LIMIT` —
 * they read the whole set and slice in JS — so the top-N mechanism above cannot reach them. With
 * no LIMIT the planner does one full sort of the heap, and two back-to-back calls sort an
 * identical input and return an identical order. Measured: with all four tiebreakers removed
 * these walks passed 5/5.
 *
 * The only thing that moves a tied row in a no-LIMIT query is a WRITE that RELOCATES the tuple,
 * which changes the sort's input order. And that is where all four die: Postgres usually applies
 * the update in place (a HOT update), which leaves the tuple at its original scan position and
 * changes nothing. It relocates only when the new row version cannot fit back on its heap page.
 * So whether the guard fires is decided by free space, which no test controls and which differs
 * per machine and per run. Measured over 5 runs with the tiebreaker removed, and again
 * independently on a second machine over 3:
 *
 *     F7  1/5 red (and 1/3 elsewhere)   F8  3/5 (0/3)   F9  5/5 (0/3)   F10  5/5 (3/3)
 *
 * F10 was believed to be the exception: a `requests` row carries a Json `payload`, so growing
 * `reason` from null was measured never fitting back on the page on two local machines, forcing a
 * relocation every time. CI's Postgres proved that wrong — 0/3 there, same code, same fixture.
 * "Wide enough to always relocate" was a property of the machines it was measured on, not of
 * Postgres in general, exactly like F7-F9. A guard that fires on some machines and not others is
 * worse than none, so F10's between-pages write was removed along with F7-F9's. Their tests
 * remain, renamed to what they actually check — that the filters and slice arithmetic return every
 * row — and all four are listed under "WHAT THIS FILE DOES NOT PROVE".
 *
 * WHY THE WHOLE LIST IS WALKED rather than just pages 1 and 2. Once the fixture has to be larger
 * than two pages, "page 1 ∪ page 2 covers the seeded set" is arithmetically false. Walking every
 * page and asserting each seeded row appears exactly once is the same claim generalised, and it
 * also catches a row lost between pages 4 and 5 rather than only at the first boundary. Pages 1 and
 * 2 are still asserted disjoint on their own, because that is the boundary the probe reddens first.
 *
 * HOW EACH SITE IS DRIVEN. Seven are exported services and are called directly. Three are route
 * loaders (F1 payslips, F4 audit log, F9 timesheet queue) and are invoked as real loaders with a
 * minimal event — `locals.user`, a `url` carrying `?page=`, and for F1 a `cookies` stub whose
 * absent `vp` makes `fitPageSize` fall back to 10. No loader is re-implemented as a hand-written
 * query; re-writing the query would test the test.
 *
 * F7, F8, F9 and F10 fetch the whole set and slice per request rather than using `skip`/`take`.
 * Each page is a fresh, independent call — never one call sliced twice, which would be consistent
 * by construction and could not fail.
 *
 * WHAT THIS FILE DOES NOT PROVE. F7 (`listAssignableEmployees`), F8 (`listActionableProposals`),
 * F9 (`/requests/timesheets`) and F10 (`listPendingRequestsForApprover`) have NO behavioural proof
 * that their order is total. Their only guard is the query-contract assertion in
 * `tests/unit/list-order-totality.test.ts`, which proves the query ASKS for a tiebreaker and
 * nothing about what the database returns. The defect is real at all four; it is the reproduction
 * that is not available at this tier, for the reason set out above. Behaviourally proven here:
 * F1–F6.
 *
 * FIXTURE HYGIENE. Every row hangs off a `MARKER`-named organization and is swept in `beforeAll`
 * as well as `afterAll`, because this tier has no global sweep and a killed run leaves residue.
 * Names and numbers are opaque codes, never English words, so no other spec's text locator can
 * match them.
 */

const PAGE = 10
const ROWS = 60

// The audit log is the one site that does not paginate at 10 — `paginate(url, total, { pageSize: 50 })`.
const AUDIT_PAGE = 50
const AUDIT_ROWS = 300

// Opaque fixture codes — an English word here would answer another spec's `getByRole` name filter.
const TIED_LAST = 'Qzx7k4'
const TIED_FIRST = 'Vhm2r9'
const CODE = 'Qzx7k4'

// One value per sort key, shared by every row of its site. This is the whole point of the file.
const TIED_PERIOD_START = new Date('2031-04-01T00:00:00Z')
const TIED_SUBMITTED_AT = new Date('2000-01-01T00:00:00Z')
const TIED_CREATED_AT = new Date('2031-04-01T09:00:00.000Z')

/**
 * Delete the models this file adds before handing the rest to the shared harness sweep.
 *
 * The payroll lines are load-bearing and not redundant: `cleanupFixtures` deletes employees BEFORE
 * payroll runs, so a PayrollEntry pointing at a fixture employee makes the employee delete throw a
 * RESTRICT violation — which strands this file's rows AND breaks every other file in the tier,
 * since they all sweep by the same marker.
 */
async function sweep() {
	const orgs = await verifyDb.organization.findMany({
		where: { name: { startsWith: MARKER } },
		select: { id: true }
	})
	if (orgs.length > 0) {
		const organizationId = { in: orgs.map((o) => o.id) }
		await verifyDb.actionProposal.deleteMany({ where: { organizationId } })
		await verifyDb.jobPosting.deleteMany({ where: { organizationId } })
		// ApprovalStep and RequestDocument cascade with the request, so neither needs a line.
		await verifyDb.request.deleteMany({ where: { employee: { organizationId } } })
		const runs = await verifyDb.payrollRun.findMany({
			where: { organizationId },
			select: { id: true }
		})
		if (runs.length > 0) {
			const payrollRunId = { in: runs.map((r) => r.id) }
			await verifyDb.payrollEntry.deleteMany({ where: { payrollRunId } })
			await verifyDb.payrollRun.deleteMany({ where: { id: payrollRunId } })
		}
	}
	await cleanupFixtures()
}

let organizationId: string
let actorId: string
let queueUserId: string
let initiatorUserId: string
let employeeIds: string[]
let timesheetIds: string[]
let requestIds: string[]
let payrollEntryIds: string[]
let jobPostingIds: string[]
let proposalIds: string[]
let auditLogIds: string[]

const evt = (user: Record<string, unknown>, page: number, extra: Record<string, unknown> = {}) =>
	({
		locals: { user },
		url: new URL(`http://itest.invalid/?page=${page}`),
		...extra
	}) as never

/**
 * Walk every page of a list and assert the pages partition the seeded set.
 *
 * A repeated row is the defect's fingerprint: it means two requests sorted the tied rows
 * differently. The coverage assertion catches the same event from the other side — the row that
 * became unreachable.
 *
 * `perturb` is required for the four fetch-everything sites and must NOT be passed by the
 * skip/take ones — see "THE FETCH-EVERYTHING SITES NEED A WRITE BETWEEN PAGES" in the header.
 */
async function expectPagesPartition(
	seeded: string[],
	pageSize: number,
	read: (skip: number, take: number) => Promise<string[]>,
	perturb?: (id: string) => Promise<void>
) {
	const pages: string[][] = []
	for (let skip = 0; skip < seeded.length; skip += pageSize) {
		pages.push(await read(skip, pageSize))
		if (perturb && skip + pageSize < seeded.length) await perturb(seeded[pages.length - 1])
	}

	expect(pages.map((p) => p.length)).toEqual(pages.map(() => pageSize))

	expect(
		pages[0].filter((id) => pages[1].includes(id)),
		'ordering is not total: page 2 repeated a row from page 1, so the two requests sorted the tied rows differently'
	).toEqual([])

	const walked = pages.flat()
	expect(
		walked.filter((id, i) => walked.indexOf(id) !== i),
		'ordering is not total: a row was served on two different pages of the same walk'
	).toEqual([])

	expect(
		walked.sort(),
		'ordering is not total: the page walk did not cover every seeded row, so a row is unreachable'
	).toEqual([...seeded].sort())
}

describe('every paginated list orders totally against real Postgres', () => {
	beforeAll(async () => {
		await sweep()

		const fixture = await createOrgFixture()
		organizationId = fixture.organizationId
		actorId = fixture.ctx.actorId

		// The actor's own employee — F1 reads payslips through `where: { userId: user.id }`, so the
		// payslip owner has to be this user's employee, and has to be one of the seeded rows or
		// F5/F7 would be walking one more employee than this file seeded.
		const first = await createEmployeeFixture(organizationId, actorId)
		const { departmentId } = await verifyDb.employee.findUniqueOrThrow({
			where: { id: first },
			select: { departmentId: true }
		})
		await verifyDb.employee.update({
			where: { id: first },
			data: { firstName: TIED_FIRST, lastName: TIED_LAST }
		})
		employeeIds = [first]

		for (let i = 1; i < ROWS; i++) {
			// One User per Employee: `Employee.userId` is unique, so the harness's single actor
			// cannot carry the whole roster.
			const user = await verifyDb.user.create({
				data: {
					organizationId,
					email: `${MARKER}-${organizationId}-${i}@example.invalid`,
					passwordHash: 'x',
					roles: ['EMPLOYEE']
				},
				select: { id: true }
			})
			const employee = await verifyDb.employee.create({
				data: {
					userId: user.id,
					organizationId,
					departmentId,
					employeeNumber: `${MARKER}-${organizationId}-${i}`,
					// Identical first AND last name on every row — the tie F5 and F7 sort on.
					firstName: TIED_FIRST,
					lastName: TIED_LAST,
					jobTitle: CODE,
					employmentType: 'REGULAR',
					startDate: new Date('2019-01-01T00:00:00Z'),
					basicMonthlySalary: 20000
				},
				select: { id: true }
			})
			employeeIds.push(employee.id)
		}

		// F4, F8, F9 and F10 act as someone who is NOT one of the roster: F9 excludes the actor's
		// own timesheet, which would drop a seeded row for a reason that is not about ordering.
		queueUserId = (
			await verifyDb.user.create({
				data: {
					organizationId,
					email: `${MARKER}-${organizationId}-queue@example.invalid`,
					passwordHash: 'x',
					roles: ['HR_ADMIN']
				},
				select: { id: true }
			})
		).id

		initiatorUserId = (
			await verifyDb.user.create({
				data: {
					organizationId,
					email: `${MARKER}-${organizationId}-initiator@example.invalid`,
					passwordHash: 'x',
					roles: ['HR_ADMIN']
				},
				select: { id: true }
			})
		).id

		// F2 + F9. `@@unique([employeeId, periodStart])` is why the roster has to be this large: one
		// employee cannot hold many rows tied on periodStart.
		timesheetIds = []
		for (const employeeId of employeeIds) {
			const sheet = await verifyDb.timesheet.create({
				data: {
					employeeId,
					periodStart: TIED_PERIOD_START,
					periodEnd: new Date('2031-04-15T00:00:00Z'),
					status: 'SUBMITTED',
					submittedAt: TIED_SUBMITTED_AT
				},
				select: { id: true }
			})
			timesheetIds.push(sheet.id)
		}

		// F3 + F10. The step is for F10 only: stage MAKE maps to MANAGE_HR, which HR_ADMIN holds, so
		// the queue user can act on every row and none is filtered out.
		requestIds = []
		for (let i = 0; i < ROWS; i++) {
			const req = await verifyDb.request.create({
				data: {
					employeeId: employeeIds[0],
					type: 'LEAVE',
					status: 'PENDING',
					currentStage: 0,
					payload: {},
					createdAt: TIED_CREATED_AT,
					steps: {
						create: { attempt: 1, stageIndex: 0, stageKind: 'ROLE', stage: 'MAKE' }
					}
				},
				select: { id: true }
			})
			requestIds.push(req.id)
		}

		// F1. The tie is payroll runs sharing a periodStart; `@@unique([organizationId, periodStart,
		// periodEnd])` is satisfied by varying the END, which this list never sorts on.
		payrollEntryIds = []
		for (let i = 0; i < ROWS; i++) {
			const run = await verifyDb.payrollRun.create({
				data: {
					organizationId,
					periodStart: TIED_PERIOD_START,
					periodEnd: new Date(Date.UTC(2031, 3, 15, 0, 0, i)),
					status: 'APPROVED'
				},
				select: { id: true }
			})
			const entry = await verifyDb.payrollEntry.create({
				data: {
					payrollRunId: run.id,
					employeeId: employeeIds[0],
					hoursWorked: 0,
					basicPay: 0,
					grossPay: 0,
					sssEe: 0,
					sssEr: 0,
					philhealthEe: 0,
					philhealthEr: 0,
					pagibigEe: 0,
					pagibigEr: 0,
					withholdingTax: 0,
					totalDeductions: 0,
					netPay: 0
				},
				select: { id: true }
			})
			payrollEntryIds.push(entry.id)
		}

		// F6.
		jobPostingIds = []
		for (let i = 0; i < ROWS; i++) {
			const posting = await verifyDb.jobPosting.create({
				data: {
					organizationId,
					departmentId,
					title: `${CODE}-${i}`,
					description: CODE,
					createdById: actorId,
					createdAt: TIED_CREATED_AT
				},
				select: { id: true }
			})
			jobPostingIds.push(posting.id)
		}

		// F8. Filed by a user with no employee of their own. A proposal whose target IS the
		// initiator is a self-action and routes to APPROVE_FINANCE, which HR_ADMIN does not hold —
		// seeding one would silently drop a row and fail the coverage half for the wrong reason.
		proposalIds = []
		for (let i = 0; i < ROWS; i++) {
			const proposal = await verifyDb.actionProposal.create({
				data: {
					organizationId,
					initiatorId: initiatorUserId,
					targetEmployeeId: employeeIds[i],
					domain: 'COMPENSATION',
					payload: {},
					status: 'PENDING',
					createdAt: TIED_CREATED_AT
				},
				select: { id: true }
			})
			proposalIds.push(proposal.id)
		}

		// F4. Batch writes inside one transaction share createdAt to the millisecond, so the tie
		// here is the realistic case rather than a contrived one.
		await verifyDb.auditLog.createMany({
			data: Array.from({ length: AUDIT_ROWS }, (_, i) => ({
				organizationId,
				actorId,
				action: 'VIEW' as const,
				entityType: CODE,
				entityId: `${CODE}-${i}`,
				createdAt: TIED_CREATED_AT
			}))
		})
		auditLogIds = (
			await verifyDb.auditLog.findMany({ where: { organizationId }, select: { id: true } })
		).map((l) => l.id)
		expect(auditLogIds).toHaveLength(AUDIT_ROWS)
	}, 300_000)

	afterAll(async () => {
		await sweep()
		await disconnectAll()
	})

	/**
	 * The negative control, and the reason the ten guards below mean anything.
	 *
	 * It runs F2's own query against F2's own fixture with the `{ id: 'desc' }` term REMOVED, and
	 * asserts the walk breaks. Ten green tests over a tied fixture look identical to ten green tests
	 * over a fixture Postgres happens to order consistently, and this file has already been in the
	 * second state once: at 2 × pageSize every site passed, tiebreaker or not. This control is what
	 * tells those two states apart.
	 *
	 * If it ever fails, the guards above have stopped being able to detect the defect — raise ROWS
	 * until it reddens again. Do NOT delete it, and do not "fix" it by adding the id term.
	 */
	it('control — the same walk without the id term loses or repeats a row', async () => {
		const pages: string[][] = []
		for (let skip = 0; skip < ROWS; skip += PAGE) {
			const rows = await verifyDb.timesheet.findMany({
				where: { employee: { organizationId } },
				orderBy: { periodStart: 'desc' },
				skip,
				take: PAGE
			})
			pages.push(rows.map((r) => r.id))
		}
		const walked = pages.flat()

		expect(
			new Set(walked).size,
			'the fixture no longer reproduces the defect: Postgres returned a stable order for tied rows even without a tiebreaker, so every guard in this file is vacuous'
		).toBeLessThan(ROWS)
	})

	it('F1 — /payslips, payroll runs tied on periodStart', async () => {
		const user = { id: actorId, organizationId }
		await expectPagesPartition(payrollEntryIds, PAGE, async (skip) => {
			const res = (await payslipsLoad(
				evt(user, skip / PAGE + 1, { cookies: { get: () => undefined } })
			)) as { payslips: { id: string }[] }
			return res.payslips.map((p) => p.id)
		})
	})

	it('F2 — listTimesheets, sheets tied on periodStart', async () => {
		await expectPagesPartition(timesheetIds, PAGE, async (skip, take) => {
			const rows = await listTimesheets({ organizationId }, { skip, take })
			return rows.map((r) => r.id)
		})
	})

	it('F3 — listRequests, requests tied on createdAt', async () => {
		await expectPagesPartition(requestIds, PAGE, async (skip, take) => {
			const rows = await listRequests({ organizationId }, { skip, take })
			return rows.map((r) => r.id)
		})
	})

	it('F4 — /reports/audit-log, entries tied on createdAt', async () => {
		const user = { id: queueUserId, organizationId, roles: ['HR_ADMIN'] }
		await expectPagesPartition(auditLogIds, AUDIT_PAGE, async (skip) => {
			const res = (await auditLogLoad(evt(user, skip / AUDIT_PAGE + 1))) as {
				logs: { id: string }[]
			}
			return res.logs.map((l) => l.id)
		})
	})

	it('F5 — listEmployees, employees tied on lastName and firstName', async () => {
		await expectPagesPartition(employeeIds, PAGE, async (skip, take) => {
			const rows = await listEmployees(organizationId, undefined, { skip, take })
			return rows.map((r) => r.id)
		})
	})

	it('F6 — listJobPostings, postings tied on createdAt', async () => {
		await expectPagesPartition(jobPostingIds, PAGE, async (skip, take) => {
			const rows = await listJobPostings(organizationId, undefined, { skip, take })
			return rows.map((r) => r.id)
		})
	})

	// NOT an ordering guard — see "WHAT THIS FILE DOES NOT PROVE". It covers the slice arithmetic
	// and the service's filters, nothing about tie order.
	it('F7 — listAssignableEmployees returns every row across its slices', async () => {
		await expectPagesPartition(employeeIds, PAGE, async (skip, take) => {
			const rows = await listAssignableEmployees(organizationId)
			return rows.slice(skip, skip + take).map((r) => r.id)
		})
	})

	// NOT an ordering guard — see "WHAT THIS FILE DOES NOT PROVE". What it does cover is the
	// self-action filter, which silently drops a row when the fixture gets the initiator wrong.
	it('F8 — listActionableProposals returns every row across its slices', async () => {
		const actor = { actorId: queueUserId, roles: ['HR_ADMIN' as const] }
		await expectPagesPartition(proposalIds, PAGE, async (skip, take) => {
			const rows = await listActionableProposals(organizationId, actor)
			return rows.slice(skip, skip + take).map((r) => r.id)
		})
	})

	// NOT an ordering guard — see "WHAT THIS FILE DOES NOT PROVE". It covers the loader's actor
	// exclusion and its stage filter, which are the things that drop a row from this queue.
	it('F9 — /requests/timesheets returns every row across its pages', async () => {
		const user = { id: queueUserId, organizationId, roles: ['HR_ADMIN'] }
		await expectPagesPartition(timesheetIds, PAGE, async (skip) => {
			const res = (await timesheetQueueLoad(evt(user, skip / PAGE + 1))) as {
				pendingTimesheets: { id: string }[]
			}
			return res.pendingTimesheets.map((t) => t.id)
		})
	})

	// NOT an ordering guard — see "WHAT THIS FILE DOES NOT PROVE". It covers the approver's queue
	// filter and stage arithmetic, nothing about tie order.
	it('F10 — listPendingRequestsForApprover, requests tied on createdAt', async () => {
		await expectPagesPartition(requestIds, PAGE, async (skip, take) => {
			const rows = await listPendingRequestsForApprover(
				organizationId,
				['HR_ADMIN'],
				null,
				queueUserId
			)
			return rows.slice(skip, skip + take).map((r) => r.id)
		})
	})
})
