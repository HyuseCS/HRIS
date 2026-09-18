// One-off: seed a baseline EmployeeCompensation row for every existing employee (#170/#171).
//
//   bunx dotenv -e .env.dev -- tsx scripts/migrate-employee-compensation-baseline.ts
//
// Run AFTER `bun run db:push` adds the `employee_compensation_history` table. The mid-period payroll
// resolver reads comp "as of date X" from this table; a baseline row (the current salary/rateType,
// effective since the hire's startDate) gives it a floor so unfinalized past runs resolve correctly.
//
// Guarded on "employee has no history rows", so it only touches employees the backfill hasn't seeded.
// Idempotent: a no-op once every employee has at least one row. New hires get their baseline inside
// `createEmployee`, so this is strictly for the pre-existing roster.

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
	const employees = await db.employee.findMany({
		where: { compensationHistory: { none: {} } },
		select: { id: true, basicMonthlySalary: true, rateType: true, startDate: true }
	})

	if (employees.length > 0) {
		await db.employeeCompensation.createMany({
			data: employees.map((e) => ({
				employeeId: e.id,
				basicMonthlySalary: e.basicMonthlySalary,
				rateType: e.rateType,
				effectiveDate: e.startDate,
				changedById: 'system',
				note: 'baseline'
			}))
		})
	}

	console.log(`✔ Seeded baseline compensation for ${employees.length} employee(s).`)
}

main()
	.then(() => db.$disconnect())
	.catch(async (e) => {
		console.error(e)
		await db.$disconnect()
		process.exit(1)
	})
