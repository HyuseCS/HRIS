// One-off demo: seed a **COMPUTED (not-yet-approved) payroll run** driven by
// real AttendanceDay hours for every active employee, so the admin can approve
// the run and then click Payslip on any row to view the PDF (#124).
//
//   pnpm tsx scripts/seed-payslip-demo.ts
//
// This script deliberately does NOT touch Organization.name / address / logoUrl —
// whatever is set in /settings/company stands, and the PDF renders from there.
//
// Flow after seeding:
//   1. Log in as admin@veent.ph / Admin@1234
//   2. /payroll → find the 5/11/2022 to 5/25/2022 run (COMPUTED) → Approve
//   3. Click the run → each row has a "Payslip" link that opens the PDF page

import { PrismaClient } from '@prisma/client'
import { createPayrollRun } from '../src/lib/server/services/payroll/index'

const db = new PrismaClient()

const PERIOD_START = new Date('2022-05-11T00:00:00Z')
const PERIOD_END = new Date('2022-05-25T00:00:00Z')

// Per-day attendance shape used for everyone. Skip Sundays inside the period
// so we land 13 working days across the 15-day span (matches the paper template).
const DAILY_REG_HOURS = 8
const DAILY_OT_HOURS = 2

async function main() {
	const org = await db.organization.findFirst({ orderBy: { createdAt: 'asc' } })
	if (!org) {
		throw new Error('No Organization found — run `pnpm db:seed` first for the base seed.')
	}

	const employees = await db.employee.findMany({
		where: { organizationId: org.id, employmentStatus: 'ACTIVE' },
		select: { id: true, firstName: true, lastName: true, employeeNumber: true }
	})
	if (employees.length === 0) {
		throw new Error('No active employees in the org — run `pnpm db:seed` first.')
	}

	// Build the weekday list once (Mon-Sat, skipping Sundays, capped at 13).
	const weekdays: Date[] = []
	for (let ms = PERIOD_START.getTime(); ms <= PERIOD_END.getTime(); ms += 86_400_000) {
		const d = new Date(ms)
		if (d.getUTCDay() === 0) continue
		if (weekdays.length === 13) break
		weekdays.push(d)
	}

	// Wipe & reseed AttendanceDay for every active employee across the period.
	await db.attendanceDay.deleteMany({
		where: {
			employeeId: { in: employees.map((e) => e.id) },
			date: { gte: PERIOD_START, lte: PERIOD_END }
		}
	})
	await db.attendanceDay.createMany({
		data: employees.flatMap((emp) =>
			weekdays.map((date) => ({
				employeeId: emp.id,
				date,
				status: 'PRESENT' as const,
				workedHours: DAILY_REG_HOURS + DAILY_OT_HOURS,
				regularHours: DAILY_REG_HOURS,
				overtimeHours: DAILY_OT_HOURS,
				isLocked: true
			}))
		)
	})

	// Wipe any prior run for this period (entries first — FK is RESTRICT), then
	// create a fresh run — `createPayrollRun` computes it in the same call (#138).
	const prior = await db.payrollRun.findMany({
		where: { organizationId: org.id, periodStart: PERIOD_START, periodEnd: PERIOD_END },
		select: { id: true }
	})
	if (prior.length) {
		const runIds = prior.map((r) => r.id)
		await db.payrollEarning.deleteMany({ where: { entry: { payrollRunId: { in: runIds } } } })
		await db.payrollDeduction.deleteMany({ where: { entry: { payrollRunId: { in: runIds } } } })
		await db.payrollEntry.deleteMany({ where: { payrollRunId: { in: runIds } } })
		await db.payrollRun.deleteMany({ where: { id: { in: runIds } } })
	}
	const admin = await db.user.findFirst({
		where: { organizationId: org.id, roles: { has: 'SUPER_ADMIN' } }
	})
	if (!admin) {
		throw new Error('No SUPER_ADMIN user in the org — run `pnpm db:seed` first for the base seed.')
	}
	// 5/11–5/25 is not a standard pay period, but it is a legal custom same-month range (#163),
	// so it no longer needs an escape hatch. It keeps the paper template's dates.
	await createPayrollRun(org.id, PERIOD_START, PERIOD_END, {
		organizationId: org.id,
		actorId: admin.id,
		actorRoles: admin.roles,
		ipAddress: '127.0.0.1'
	})

	console.log('')
	console.log('✓ Payroll demo seeded (status: COMPUTED — awaiting admin approval).')
	console.log('')
	console.log(`  ${employees.length} employees seeded with 13 attendance days each`)
	console.log(`  ${DAILY_REG_HOURS}h regular + ${DAILY_OT_HOURS}h OT per day`)
	console.log('')
	console.log('  Next steps:')
	console.log('    1. Log in: admin@veent.ph / Admin@1234')
	console.log('    2. Go to /payroll → find the 5/11/22 – 5/25/22 run → Approve')
	console.log('    3. Click into the run → any row has a "Payslip" link')
	console.log('')
	console.log('  Company name / address / logo on the PDF come from /settings/company')
	console.log('  (edit them there before printing).')
	console.log('')
}

main()
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(() => db.$disconnect())
