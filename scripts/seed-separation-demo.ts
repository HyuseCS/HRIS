// One-off: seed a fully-detailed employee with leave balance, an active loan, and an
// active cash advance so the Separation → final-pay computation has data to show.
//
//   pnpm tsx scripts/seed-separation-demo.ts
//
// Numbers are chosen to be trivially checkable:
//   basic monthly 44,000 → daily rate 44,000 / 22 = 2,000.00
//   unused leave    10 days × 2,000               = +20,000.00
//   outstanding loan balance                       =  −8,000.00
//   outstanding cash-advance balance               =  −3,000.00
//   ─────────────────────────────────────────────────────────
//   net final pay                                  =   9,000.00
//
// Start a separation for EMP-900 with an effective date in the CURRENT year
// (final pay reads leave balances for effectiveDate's year).

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const db = new PrismaClient()

async function main() {
	const org = await db.organization.findFirst()
	if (!org) throw new Error('No organization — run `pnpm db:seed` first.')

	const dept = await db.department.findFirst({ where: { organizationId: org.id } })
	if (!dept) throw new Error('No department found for the organization.')

	const leaveType = await db.leaveType.findFirst({ where: { organizationId: org.id } })
	if (!leaveType) throw new Error('No leave type found for the organization.')

	const year = new Date().getFullYear()

	const passwordHash = await bcrypt.hash('Demo@1234', 12)
	const user = await db.user.upsert({
		where: { email: 'departing@veent.ph' },
		update: { isActive: true, roles: ['EMPLOYEE'] },
		create: {
			organizationId: org.id,
			email: 'departing@veent.ph',
			passwordHash,
			roles: ['EMPLOYEE']
		}
	})

	const employee = await db.employee.upsert({
		where: { userId: user.id },
		update: {
			employmentStatus: 'ACTIVE',
			endDate: null,
			basicMonthlySalary: 44000
		},
		create: {
			userId: user.id,
			organizationId: org.id,
			employeeNumber: 'EMP-900',
			firstName: 'Dexter',
			lastName: 'Departing',
			middleName: 'D',
			dateOfBirth: new Date('1992-05-14'),
			gender: 'MALE',
			contactPhone: '+63 917 555 0900',
			contactAddress: '900 Exit St, Makati City',
			departmentId: dept.id,
			jobTitle: 'Senior Analyst',
			employmentType: 'REGULAR',
			employmentStatus: 'ACTIVE',
			startDate: new Date('2023-03-01'),
			basicMonthlySalary: 44000,
			rateType: 'MONTHLY',
			sssNumber: '34-1234567-8',
			philhealthNumber: '12-345678901-2',
			pagibigNumber: '1234-5678-9012',
			tinNumber: '123-456-789-000',
			emergencyContactName: 'Dana Departing',
			emergencyContactRelation: 'Spouse',
			emergencyContactPhone: '+63 917 555 0901',
			bankName: 'BDO',
			bankAccountName: 'Dexter D. Departing',
			bankAccountNumber: '001234567890',
			gcashNumber: '0917 555 0900'
		}
	})

	// Unused leave: 10 days remaining (allocated 15, used 5) for the current year.
	await db.leaveBalance.upsert({
		where: {
			employeeId_leaveTypeId_year: { employeeId: employee.id, leaveTypeId: leaveType.id, year }
		},
		update: { allocated: 15, used: 5, remaining: 10 },
		create: {
			employeeId: employee.id,
			leaveTypeId: leaveType.id,
			year,
			allocated: 15,
			used: 5,
			remaining: 10
		}
	})

	// Active loan — 8,000 remaining.
	const existingLoan = await db.loan.findFirst({
		where: { employeeId: employee.id, type: 'Salary Loan' }
	})
	if (existingLoan) {
		await db.loan.update({
			where: { id: existingLoan.id },
			data: { balance: 8000, status: 'ACTIVE' }
		})
	} else {
		await db.loan.create({
			data: {
				employeeId: employee.id,
				type: 'Salary Loan',
				principal: 20000,
				balance: 8000,
				installment: 2000,
				status: 'ACTIVE'
			}
		})
	}

	// Active cash advance — 3,000 remaining.
	const existingCA = await db.cashAdvance.findFirst({
		where: { employeeId: employee.id, status: 'ACTIVE' }
	})
	if (existingCA) {
		await db.cashAdvance.update({ where: { id: existingCA.id }, data: { balance: 3000 } })
	} else {
		await db.cashAdvance.create({
			data: {
				employeeId: employee.id,
				amount: 5000,
				balance: 3000,
				installment: 1000,
				status: 'ACTIVE'
			}
		})
	}

	console.log(
		'✔ Seeded demo employee EMP-900 — Dexter Departing (login departing@veent.ph / Demo@1234)'
	)
	console.log(
		`  Leave balances are for year ${year}; start the separation with an effective date in ${year}.`
	)
	console.log('  Expected final pay:  +20,000 (leave)  −8,000 (loan)  −3,000 (CA)  =  9,000.00')
}

main()
	.then(() => db.$disconnect())
	.catch(async (e) => {
		console.error(e)
		await db.$disconnect()
		process.exit(1)
	})
