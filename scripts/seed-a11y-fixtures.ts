// Screen-reader spot-check fixtures for the Veent org (#uiux phase 8 a11y pass).
//
//   dotenv -e .env.dev -- tsx scripts/seed-a11y-fixtures.ts
//
// Three states the seed data never reaches, each needed to OBSERVE one announcement:
//   A  a review in SELF_ASSESSMENT  -> /performance renders "Employee self-assessment"
//   B  a payroll run with hasOverride -> /payroll renders the asterisk + ", has a manual override"
//   C  a pending request with 2 live documents -> /requests/approvals renders "2 documents"
//
// Additive and idempotent: every fixture carries a fixed id (or is detected by its flag) and a
// second run creates nothing. The ONE exception is B — creating a payroll run means running the
// whole payroll computation, so if no run already carries the flag this sets it on an existing
// run and prints the before-values for a hand revert.

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const ORG = 'org_seed'
const REVIEW_ID = 'a11y_fx_review'
const REQUEST_ID = 'a11y_fx_request'

async function hrEmployee() {
	const emp = await db.employee.findFirst({
		where: { organizationId: ORG, user: { email: 'hr@veent.ph' } },
		select: { id: true, firstName: true, lastName: true }
	})
	if (!emp) throw new Error(`No employee row for hr@veent.ph in ${ORG} — seed the org first.`)
	return emp
}

// Fixture A — a review the HR user gives, parked at the self-assessment stage.
async function fixtureA(hrEmployeeId: string) {
	if (await db.performanceReview.findUnique({ where: { id: REVIEW_ID } })) {
		console.log(`✔ A: review ${REVIEW_ID} already exists — skipped.`)
		return
	}

	const cycle = await db.reviewCycle.findFirst({
		where: { organizationId: ORG, status: 'ACTIVE' },
		orderBy: { startDate: 'desc' },
		select: { id: true, name: true }
	})
	if (!cycle) throw new Error(`A: no ACTIVE review cycle in ${ORG}.`)

	// The oldest employee that is neither the reviewer nor already reviewed in this cycle — the
	// unique key is (cycleId, employeeId), and the seed employees sort first.
	const subject = await db.employee.findFirst({
		where: {
			organizationId: ORG,
			id: { not: hrEmployeeId },
			performanceReviews: { none: { cycleId: cycle.id } }
		},
		orderBy: { createdAt: 'asc' },
		select: { id: true, firstName: true, lastName: true }
	})
	if (!subject) throw new Error(`A: no eligible subject employee in ${ORG}.`)

	await db.performanceReview.create({
		data: {
			id: REVIEW_ID,
			cycleId: cycle.id,
			employeeId: subject.id,
			reviewerId: hrEmployeeId,
			status: 'SELF_ASSESSMENT'
		}
	})
	console.log(
		`✔ A: created review ${REVIEW_ID} — ${subject.firstName} ${subject.lastName}, ${cycle.name}, SELF_ASSESSMENT.`
	)
}

// Fixture B — one payroll run flagged as manually overridden.
async function fixtureB() {
	const flagged = await db.payrollRun.findFirst({
		where: { organizationId: ORG, hasOverride: true },
		select: { id: true }
	})
	if (flagged) {
		console.log(`✔ B: payroll run ${flagged.id} already has hasOverride — skipped.`)
		return
	}

	const run = await db.payrollRun.findFirst({
		where: { organizationId: ORG },
		orderBy: { periodStart: 'desc' },
		select: { id: true, hasOverride: true, overrideNote: true }
	})
	if (!run) throw new Error(`B: no payroll run in ${ORG} to flag, and creating one runs payroll.`)

	console.log(
		`  B: MUTATING an existing run. Revert by hand with these before-values:\n` +
			`     id=${run.id} hasOverride=${run.hasOverride} overrideNote=${JSON.stringify(run.overrideNote)}`
	)
	await db.payrollRun.update({
		where: { id: run.id },
		data: { hasOverride: true, overrideNote: 'Accessibility fixture — manual override.' }
	})
	console.log(`✔ B: set hasOverride on payroll run ${run.id}.`)
}

// Fixture C — a request sitting at the HR user's stage with two live supporting documents.
async function fixtureC(hrEmployeeId: string) {
	if (await db.request.findUnique({ where: { id: REQUEST_ID } })) {
		console.log(`✔ C: request ${REQUEST_ID} already exists — skipped.`)
		return
	}

	// Not the HR user's own request: the approvals queue bars an approver from their own filing.
	const filer = await db.employee.findFirst({
		where: { organizationId: ORG, id: { not: hrEmployeeId } },
		orderBy: { createdAt: 'asc' },
		select: { id: true, firstName: true, lastName: true }
	})
	if (!filer) throw new Error(`C: no eligible filer employee in ${ORG}.`)

	// MAKE is the stage HR_ADMIN holds (MANAGE_HR), and currentStage must equal the pending
	// step's stageIndex or the queue filter finds no live step and drops the request.
	await db.request.create({
		data: {
			id: REQUEST_ID,
			employeeId: filer.id,
			type: 'OVERTIME',
			status: 'PENDING',
			dateFrom: new Date('2026-09-18T00:00:00Z'),
			dateTo: new Date('2026-09-18T00:00:00Z'),
			hours: 3,
			reason: 'Accessibility fixture — request carrying supporting documents.',
			payload: {},
			currentStage: 0,
			steps: {
				create: {
					attempt: 1,
					stageIndex: 0,
					stageKind: 'ROLE',
					stage: 'MAKE',
					role: 'HR_ADMIN',
					requiredRole: 'HR_ADMIN'
				}
			},
			// storageKey points at no real bytes; these exist to be counted, not downloaded.
			documents: {
				create: [
					{
						label: 'Overtime authorization',
						fileName: 'a11y-fixture-authorization.pdf',
						mimeType: 'application/pdf',
						size: 1024,
						storageKey: 'a11y-fixtures/a11y-fixture-authorization.pdf'
					},
					{
						label: 'Approved schedule',
						fileName: 'a11y-fixture-schedule.pdf',
						mimeType: 'application/pdf',
						size: 2048,
						storageKey: 'a11y-fixtures/a11y-fixture-schedule.pdf'
					}
				]
			}
		}
	})
	console.log(
		`✔ C: created request ${REQUEST_ID} — ${filer.firstName} ${filer.lastName}, 2 live documents.`
	)
}

async function main() {
	const hr = await hrEmployee()
	await fixtureA(hr.id)
	await fixtureB()
	await fixtureC(hr.id)
}

main()
	.then(() => db.$disconnect())
	.catch(async (e) => {
		console.error(e)
		await db.$disconnect()
		process.exit(1)
	})
