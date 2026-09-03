// Remove employees left behind by E2E runs.
//
//   pnpm tsx scripts/clean-e2e-employees.ts           # list what would go
//   pnpm tsx scripts/clean-e2e-employees.ts --apply   # delete it
//
// The suite onboards a real employee on each run and its teardown is deliberately best-effort:
// payroll compute in a concurrently running spec attaches a payroll entry to whatever is ACTIVE,
// and those FKs are RESTRICT, so a teardown delete can legitimately lose the race. Rather than
// fail a run on cleanup, the leftovers are swept here.
//
// Matching is on the seeded-account email prefixes the specs use, never on names — a real
// employee called "Testcase" would be safe, and no real account uses these prefixes.

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

/** Email prefixes owned by the test suite and the throwaway probe scripts. */
const PREFIXES = ['e2e_', 'probe_', 'zzpagetest']

async function main() {
	const apply = process.argv.includes('--apply')

	const employees = await db.employee.findMany({
		where: { user: { OR: PREFIXES.map((p) => ({ email: { startsWith: p } })) } },
		select: {
			id: true,
			employeeNumber: true,
			firstName: true,
			lastName: true,
			user: { select: { id: true, email: true } }
		},
		orderBy: { employeeNumber: 'asc' }
	})

	if (employees.length === 0) {
		console.log('✔ No E2E leftovers found.')
		return
	}

	console.log(`${employees.length} test employee(s):`)
	for (const e of employees) {
		console.log(`  ${e.employeeNumber.padEnd(10)} ${e.lastName}, ${e.firstName}  <${e.user.email}>`)
	}

	if (!apply) {
		console.log('\nDry run. Re-run with --apply to delete these and their dependent rows.')
		return
	}

	const employeeIds = employees.map((e) => e.id)
	const userIds = employees.map((e) => e.user.id)
	const where = { employeeId: { in: employeeIds } }

	// Children first — every one of these FKs is RESTRICT, so the employee row cannot go until
	// nothing points at it. Ordered so a table's own children are cleared before it.
	const removed: Record<string, number> = {}
	const step = async (name: string, run: () => Promise<{ count: number }>) => {
		removed[name] = (await run()).count
	}

	await step('payrollEntry', () => db.payrollEntry.deleteMany({ where }))
	await step('timeLog', () => db.timeLog.deleteMany({ where }))
	await step('timesheet', () => db.timesheet.deleteMany({ where }))
	await step('attendanceDay', () => db.attendanceDay.deleteMany({ where }))
	await step('request', () => db.request.deleteMany({ where }))
	await step('leaveRequest', () => db.leaveRequest.deleteMany({ where }))
	await step('leaveBalance', () => db.leaveBalance.deleteMany({ where }))
	await step('loan', () => db.loan.deleteMany({ where }))
	await step('cashAdvance', () => db.cashAdvance.deleteMany({ where }))
	// Four models grew a RESTRICT FK to Employee after this script was written, and each one
	// blocked the delete below. The full list of restricting tables comes from
	// information_schema.referential_constraints — re-check it when a new employee child appears.
	await step('employeeCompensation', () => db.employeeCompensation.deleteMany({ where }))
	await step('employeeEmploymentType', () => db.employeeEmploymentType.deleteMany({ where }))
	await step('onboardingCompletion', () => db.onboardingCompletion.deleteMany({ where }))
	// ActionProposal names its FK `targetEmployeeId`, not `employeeId`.
	await step('actionProposal', () =>
		db.actionProposal.deleteMany({ where: { targetEmployeeId: { in: employeeIds } } })
	)
	await step('employeeEarning', () => db.employeeEarning.deleteMany({ where }))
	await step('employeeDeduction', () => db.employeeDeduction.deleteMany({ where }))
	await step('employeeDocument', () => db.employeeDocument.deleteMany({ where }))
	await step('emergencyContact', () => db.emergencyContact.deleteMany({ where }))
	await step('benefitEnrollment', () => db.benefitEnrollment.deleteMany({ where }))
	await step('separationRecord', () => db.separationRecord.deleteMany({ where }))
	await step('performanceReview', () =>
		db.performanceReview.deleteMany({
			where: { OR: [{ employeeId: { in: employeeIds } }, { reviewerId: { in: employeeIds } }] }
		})
	)
	// Self-reference and the recruitment back-link: null them rather than delete the other side,
	// which may well be a real record.
	await step('applicant.convertedToEmployeeId', () =>
		db.applicant.updateMany({
			where: { convertedToEmployeeId: { in: employeeIds } },
			data: { convertedToEmployeeId: null }
		})
	)
	await step('employee.reportsToId', () =>
		db.employee.updateMany({
			where: { reportsToId: { in: employeeIds } },
			data: { reportsToId: null }
		})
	)

	await step('employee', () => db.employee.deleteMany({ where: { id: { in: employeeIds } } }))
	// Audit rows point at the user, and dropping them would rewrite history — the user goes last
	// and only if nothing else holds it.
	await step('auditLog', () => db.auditLog.deleteMany({ where: { actorId: { in: userIds } } }))
	await step('notification', () =>
		db.notification.deleteMany({ where: { userId: { in: userIds } } })
	)
	await step('userOrganization', () =>
		db.userOrganization.deleteMany({ where: { userId: { in: userIds } } })
	)
	await step('session', () => db.session.deleteMany({ where: { userId: { in: userIds } } }))
	await step('user', () => db.user.deleteMany({ where: { id: { in: userIds } } }))

	console.log('\n✔ Deleted:')
	for (const [table, count] of Object.entries(removed)) {
		if (count > 0) console.log(`  ${count.toString().padStart(4)}  ${table}`)
	}
}

main()
	.then(() => db.$disconnect())
	.catch(async (e) => {
		console.error(e)
		await db.$disconnect()
		process.exit(1)
	})
