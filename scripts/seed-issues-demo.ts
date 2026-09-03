// One-off: seed demo data for verifying issues #66, #70, #71, #72, #73.
//
//   pnpm tsx scripts/seed-issues-demo.ts
//
// Idempotent — safe to re-run. Seeds:
//   #66  custom deduction codes (UNIFORM, HMO_DEP) + a recurring UNIFORM ₱500/mo
//        assignment on Elena Employee (EMP-003), plus a recurring ₱2,000/mo meal
//        allowance so the calculator prefill has something to show
//   #70  three PENDING requests routed to HR (one with a long reason) and a
//        SUBMITTED timesheet for Elena — cards for both approval pages
//   #71  Engineering + Finance departments with one employee each, so the
//        Members panel has people to list and transfer
//   #73  Diego hired this year and Olivia offboarded this year, so the
//        Workforce cards have non-zero hired/offboarded counts
//
// Logins for seeded people all use password Demo@1234.

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const db = new PrismaClient()

async function main() {
	const org = await db.organization.findFirst()
	if (!org) throw new Error('No organization — run `pnpm db:seed` first.')

	// ── #71/#73: departments + employees across them ─────────────────────────
	const engineering = await db.department.upsert({
		where: { organizationId_name: { organizationId: org.id, name: 'Engineering' } },
		update: {},
		create: { organizationId: org.id, name: 'Engineering' }
	})
	const finance = await db.department.upsert({
		where: { organizationId_name: { organizationId: org.id, name: 'Finance' } },
		update: {},
		create: { organizationId: org.id, name: 'Finance' }
	})

	const passwordHash = await bcrypt.hash('Demo@1234', 12)
	const year = new Date().getFullYear()

	async function seedEmployee(opts: {
		email: string
		employeeNumber: string
		firstName: string
		lastName: string
		departmentId: string
		jobTitle: string
		startDate: Date
		salary: number
		offboarded?: boolean
	}) {
		const user = await db.user.upsert({
			where: { email: opts.email },
			update: {},
			create: {
				organizationId: org!.id,
				email: opts.email,
				passwordHash,
				roles: ['EMPLOYEE'],
				isActive: !opts.offboarded
			}
		})
		return db.employee.upsert({
			where: { userId: user.id },
			update: {},
			create: {
				userId: user.id,
				organizationId: org!.id,
				employeeNumber: opts.employeeNumber,
				firstName: opts.firstName,
				lastName: opts.lastName,
				departmentId: opts.departmentId,
				jobTitle: opts.jobTitle,
				employmentType: 'REGULAR',
				startDate: opts.startDate,
				basicMonthlySalary: opts.salary,
				rateType: 'MONTHLY',
				...(opts.offboarded
					? { employmentStatus: 'OFFBOARDED' as const, endDate: new Date(`${year}-05-31`) }
					: {})
			}
		})
	}

	// Hired this year → shows in "Hired in <year>" (#73); no supervisor, so their
	// requests route straight to HR (#70).
	const diego = await seedEmployee({
		email: 'diego@veent.ph',
		employeeNumber: 'EMP-910',
		firstName: 'Diego',
		lastName: 'Dela Cruz',
		departmentId: engineering.id,
		jobTitle: 'Backend Engineer',
		startDate: new Date(`${year}-03-01`),
		salary: 38000
	})
	const fiona = await seedEmployee({
		email: 'fiona@veent.ph',
		employeeNumber: 'EMP-911',
		firstName: 'Fiona',
		lastName: 'Flores',
		departmentId: finance.id,
		jobTitle: 'Accounting Analyst',
		startDate: new Date(`${year - 1}-08-15`),
		salary: 32000
	})
	// Offboarded this year → shows in "Offboarded in <year>" (#73).
	await seedEmployee({
		email: 'olivia@veent.ph',
		employeeNumber: 'EMP-912',
		firstName: 'Olivia',
		lastName: 'Old',
		departmentId: finance.id,
		jobTitle: 'Office Assistant',
		startDate: new Date(`${year - 2}-01-10`),
		salary: 25000,
		offboarded: true
	})

	// ── #66: custom deduction codes + a recurring assignment ─────────────────
	for (const dt of [
		{ code: 'UNIFORM', label: 'Uniform fee' },
		{ code: 'HMO_DEP', label: 'HMO dependent' }
	]) {
		await db.deductionType.upsert({
			where: { organizationId_code: { organizationId: org.id, code: dt.code } },
			update: { isActive: true },
			create: { organizationId: org.id, ...dt, isStatutory: false }
		})
	}

	const elena = await db.employee.findFirst({
		where: { organizationId: org.id, employeeNumber: 'EMP-003' }
	})
	if (elena) {
		const uniform = await db.deductionType.findUniqueOrThrow({
			where: { organizationId_code: { organizationId: org.id, code: 'UNIFORM' } }
		})
		const hasDeduction = await db.employeeDeduction.findFirst({
			where: { employeeId: elena.id, deductionTypeId: uniform.id, isActive: true }
		})
		if (!hasDeduction) {
			await db.employeeDeduction.create({
				data: { employeeId: elena.id, deductionTypeId: uniform.id, monthlyAmount: 500 }
			})
		}
		// Recurring allowance so the calculator prefill (#65 QoL, checked with #72) shows.
		const hasAllowance = await db.employeeEarning.findFirst({
			where: { employeeId: elena.id, kind: 'ALLOWANCE', isActive: true }
		})
		if (!hasAllowance) {
			await db.employeeEarning.create({
				data: {
					employeeId: elena.id,
					kind: 'ALLOWANCE',
					label: 'Meal allowance',
					monthlyAmount: 2000
				}
			})
		}
	}

	// ── #70: pending requests (HR is stage 0) + a submitted timesheet ────────
	const longReason =
		'Requesting overtime for the quarter-end closing activities. The reconciliation ' +
		'of the subsidiary ledgers took far longer than expected because of the migration, ' +
		'and the external auditors need the schedules before Friday morning, so I stayed ' +
		'late to finish the accruals, the amortization table, and the final trial balance.'
	const pendingSeeds = [
		{
			employeeId: diego.id,
			type: 'OVERTIME' as const,
			dateFrom: new Date(`${year}-07-10`),
			hours: 3,
			reason: longReason,
			payload: { type: 'OVERTIME', date: `${year}-07-10`, hours: 3, reason: longReason }
		},
		{
			employeeId: fiona.id,
			type: 'UNDERTIME' as const,
			dateFrom: new Date(`${year}-07-14`),
			hours: 2,
			reason: 'Doctor appointment in the afternoon.',
			payload: {
				type: 'UNDERTIME',
				date: `${year}-07-14`,
				hours: 2,
				reason: 'Doctor appointment in the afternoon.'
			}
		},
		{
			employeeId: diego.id,
			type: 'OFFICIAL_BUSINESS' as const,
			dateFrom: new Date(`${year}-07-21`),
			dateTo: new Date(`${year}-07-22`),
			reason: null,
			payload: {
				type: 'OFFICIAL_BUSINESS',
				startDate: `${year}-07-21`,
				endDate: `${year}-07-22`,
				location: 'Client office, BGC',
				purpose: 'On-site deployment support'
			}
		}
	]
	for (const r of pendingSeeds) {
		const exists = await db.request.findFirst({
			where: { employeeId: r.employeeId, type: r.type, status: 'PENDING' }
		})
		if (exists) continue
		// Both employees have no supervisor, so the chain starts at the HR role
		// stage — the cards show up for HR_ADMIN/SUPER_ADMIN immediately.
		await db.request.create({
			data: {
				employeeId: r.employeeId,
				type: r.type,
				status: 'PENDING',
				dateFrom: r.dateFrom,
				dateTo: 'dateTo' in r ? r.dateTo : null,
				hours: 'hours' in r ? r.hours : null,
				reason: r.reason,
				payload: r.payload,
				currentStage: 0,
				steps: {
					create: [
						{ stageIndex: 0, stageKind: 'ROLE', role: 'HR_ADMIN' },
						...(r.type === 'OVERTIME'
							? [{ stageIndex: 1, stageKind: 'ROLE' as const, role: 'PAYROLL_OFFICER' as const }]
							: [])
					]
				}
			}
		})
	}

	if (elena) {
		const periodStart = new Date(`${year}-07-01`)
		await db.timesheet.upsert({
			where: { employeeId_periodStart: { employeeId: elena.id, periodStart } },
			update: { status: 'SUBMITTED', submittedAt: new Date() },
			create: {
				employeeId: elena.id,
				periodStart,
				periodEnd: new Date(`${year}-07-15`),
				status: 'SUBMITTED',
				submittedAt: new Date(),
				totalHours: 16,
				entries: {
					create: [
						{
							date: new Date(`${year}-07-06`),
							hoursWorked: 8,
							notes: 'Sprint work'
						},
						{
							date: new Date(`${year}-07-07`),
							hoursWorked: 8,
							notes: 'Sprint work'
						}
					]
				}
			}
		})
	}

	console.log(`Seeded demo data for issues #66/#70/#71/#72/#73:
  Departments: Engineering, Finance
  Employees:   EMP-910 Diego Dela Cruz (Engineering, hired ${year}-03-01)
               EMP-911 Fiona Flores (Finance)
               EMP-912 Olivia Old (Finance, OFFBOARDED ${year}-05-31)
  Pay codes:   UNIFORM, HMO_DEP (non-statutory)
  Recurring:   EMP-003 Elena — UNIFORM ₱500/mo deduction, Meal allowance ₱2,000/mo
  Approvals:   3 pending requests (stage 0 = HR) + 1 submitted timesheet (Elena)
  Logins:      diego@veent.ph / fiona@veent.ph — Demo@1234`)
}

main()
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(() => db.$disconnect())
