// One-off: seed a baseline EmployeeEmploymentType row for every existing employee (#222).
//
//   bunx dotenv -e .env.dev -- tsx scripts/migrate-employee-employment-type-baseline.ts
//
// Run AFTER `bun run db:push` adds the `employee_employment_type_history` table. Promotions record the
// employment type as an effective-dated snapshot; a baseline row (the current type, effective since
// the hire's startDate) gives the as-of read a floor.
//
// Guarded on "employee has no history rows", so it only touches employees the backfill hasn't seeded.
// Idempotent: a no-op once every employee has at least one row. New hires get their baseline inside
// `createEmployee`, so this is strictly for the pre-existing roster.

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
	const employees = await db.employee.findMany({
		where: { employmentTypeHistory: { none: {} } },
		select: { id: true, employmentType: true, startDate: true }
	})

	if (employees.length > 0) {
		await db.employeeEmploymentType.createMany({
			data: employees.map((e) => ({
				employeeId: e.id,
				employmentType: e.employmentType,
				effectiveDate: e.startDate,
				changedById: 'system',
				note: 'baseline'
			}))
		})
	}

	console.log(`✔ Seeded baseline employment type for ${employees.length} employee(s).`)
}

main()
	.then(() => db.$disconnect())
	.catch(async (e) => {
		console.error(e)
		await db.$disconnect()
		process.exit(1)
	})
