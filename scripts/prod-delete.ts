// Hard-delete a single record and everything hanging off it. Built for production
// clean-ups (a duplicate employee, a payroll run created against the wrong period)
// where soft-delete/offboarding is not enough and the rows must actually leave the DB.
//
// Run it ON THE DROPLET, inside the app container — Postgres publishes no host port, so
// there is no route to the prod database from a laptop:
//
//   ssh <droplet> && cd ~/repos/Veent_HRIS
//   docker compose exec app pnpm prod-delete employee <employeeId>
//
// Locally it works the same way against whatever DATABASE_URL is set (dev DB, a restored
// dump); `pnpm prod-delete …` is the local form.
//
//   pnpm prod-delete employee <employeeId>          # dry run — counts every row it would delete
//   pnpm prod-delete employee <employeeId> --execute --confirm=EMP-0042 --actor=hr@veent.ph
//   pnpm prod-delete payroll-run <runId>
//   pnpm prod-delete payroll-run <runId> --execute --confirm=2026-07-01..2026-07-15 --actor=hr@veent.ph
//
// Rails, in the order you meet them:
//   1. Dry run is the default. Nothing is written without --execute.
//   2. --execute demands --confirm=<token> matching the target exactly (the employee
//      number, or the run's period). The dry run prints the token. Passing the wrong
//      target's id then pasting a stale token cannot line up.
//   3. --actor=<email> names a real user; the deletion is written to audit_logs as a
//      DELETE row (inside the transaction) before anything is removed.
//   4. Every delete runs in ONE interactive transaction. Any error rolls back the lot.
//
// What it refuses to do: delete payroll entries that have loan_payments recorded
// against them. Those rows are the record of money actually collected at period lock,
// and the loan balances were decremented to match. Void the period first (that path
// credits the balances back and clears the payments), then delete the run.
//
// Uploaded files are removed from disk AFTER the transaction commits — a failed
// rollback must not leave rows pointing at bytes that are already gone.
//
// Unlike the db:* scripts this one does NOT point itself at .env.dev — it reads whatever
// DATABASE_URL is already in the environment (inside the app container, that is prod), so
// it can never silently hit the wrong database because of a hard-coded env file.

import 'dotenv/config'
import { PrismaClient, type Prisma } from '@prisma/client'
import { unlink } from 'node:fs/promises'
// Namespace import, not a default one: scripts/ sits outside the tsconfig `include`, so an
// editor typechecks this file with default settings (no esModuleInterop) and `import path
// from` reports TS1259 there. This form is correct under both.
import * as path from 'node:path'

const db = new PrismaClient()

// Deliberately NOT imported from src/lib/server/storage: the runtime image ships only
// build/, prisma/, scripts/ and node_modules (see Dockerfile), so anything reaching into
// src/ crashes on the droplet — the one place this script is meant to run. Kept in step
// with storage.ts: same UPLOAD_DIR resolution, same containment check, same "a missing
// file is fine, the row was the source of truth".
const UPLOAD_DIR = process.env.UPLOAD_DIR
	? path.resolve(process.env.UPLOAD_DIR)
	: path.resolve(process.cwd(), 'uploads')

async function deleteStoredFile(storageKey: string): Promise<void> {
	const abs = path.resolve(UPLOAD_DIR, storageKey)
	if (abs !== UPLOAD_DIR && !abs.startsWith(UPLOAD_DIR + path.sep))
		throw new Error(`Invalid storage key: ${storageKey}`)
	try {
		await unlink(abs)
	} catch (e: unknown) {
		if ((e as NodeJS.ErrnoException)?.code !== 'ENOENT') throw e
	}
}

const [kind, targetId, ...rest] = process.argv.slice(2)
const execute = rest.includes('--execute')
const flag = (name: string) =>
	rest
		.find((a) => a.startsWith(`--${name}=`))
		?.split('=')
		.slice(1)
		.join('=')
const confirm = flag('confirm')
const actorEmail = flag('actor')

const USAGE = `Usage:
  pnpm prod-delete employee <employeeId> [--execute --confirm=<employeeNumber> --actor=<email>]
  pnpm prod-delete payroll-run <runId>   [--execute --confirm=<periodStart..periodEnd> --actor=<email>]`

function die(message: string): never {
	console.error(`\n✗ ${message}\n`)
	process.exit(1)
}

/** Row counts, printed as the plan. Zero-count tables are hidden to keep it readable. */
function printPlan(title: string, counts: Record<string, number>) {
	console.log(`\n${title}`)
	const rows = Object.entries(counts).filter(([, n]) => n > 0)
	if (!rows.length) {
		console.log('  (no child rows)')
		return
	}
	const width = Math.max(...rows.map(([t]) => t.length))
	for (const [table, n] of rows) console.log(`  ${table.padEnd(width)}  ${n}`)
	console.log(`  ${'─'.repeat(width)}  ${rows.reduce((s, [, n]) => s + n, 0)} rows total`)
}

const iso = (d: Date) => d.toISOString().slice(0, 10)

/** The actor whose name goes on the audit row. Never the user being deleted. */
async function resolveActor(organizationId: string, forbiddenUserId?: string) {
	if (!actorEmail) die(`--actor=<email> is required with --execute.\n${USAGE}`)
	const actor = await db.user.findUnique({
		where: { email: actorEmail },
		select: { id: true, roles: true, organizationId: true, isActive: true }
	})
	if (!actor) die(`No user with email ${actorEmail}.`)
	if (actor.id === forbiddenUserId)
		die('The actor cannot be the user being deleted — name someone else.')
	if (!actor.isActive)
		console.warn(`  ! ${actorEmail} is deactivated — recording it as the actor anyway.`)
	if (actor.organizationId !== organizationId)
		console.warn(`  ! ${actorEmail} belongs to a different organization than the target.`)
	return actor
}

function requireConfirmation(expected: string) {
	if (confirm !== expected)
		die(
			`--confirm did not match. Re-run with --confirm=${expected} once you are sure this is the right target.`
		)
}

/**
 * Loan payments are written at period lock, one per (loan, payroll entry), and the loan
 * balance is decremented to match. Deleting the entry would strand the payment row
 * (payrollEntryId is a plain column, no FK) and leave the borrower short.
 */
async function assertNoCollectedLoanPayments(entryIds: string[]) {
	if (!entryIds.length) return
	const payments = await db.loanPayment.count({ where: { payrollEntryId: { in: entryIds } } })
	if (payments > 0)
		die(
			`${payments} loan payment(s) were collected against these payroll entries.\n` +
				`  Void the period first (Payroll → Periods → Void) — that credits the balances back and\n` +
				`  clears the payment rows — then re-run this script.`
		)
}

async function deleteEmployee(employeeId: string) {
	const employee = await db.employee.findUnique({
		where: { id: employeeId },
		select: {
			id: true,
			userId: true,
			organizationId: true,
			employeeNumber: true,
			firstName: true,
			lastName: true,
			employmentStatus: true,
			user: { select: { email: true } }
		}
	})
	if (!employee) die(`No employee with id ${employeeId}.`)

	const [timesheets, requests, separations, loans, entries] = await Promise.all([
		db.timesheet.findMany({ where: { employeeId }, select: { id: true } }),
		db.request.findMany({ where: { employeeId }, select: { id: true } }),
		db.separationRecord.findMany({ where: { employeeId }, select: { id: true } }),
		db.loan.findMany({ where: { employeeId }, select: { id: true } }),
		db.payrollEntry.findMany({ where: { employeeId }, select: { id: true } })
	])
	const timesheetIds = timesheets.map((t) => t.id)
	const requestIds = requests.map((r) => r.id)
	const loanIds = loans.map((l) => l.id)
	const entryIds = entries.map((e) => e.id)

	// Collected before the transaction: the rows carry the only pointer to the bytes.
	const [employeeDocs, requestDocs] = await Promise.all([
		db.employeeDocument.findMany({ where: { employeeId }, select: { storageKey: true } }),
		db.requestDocument.findMany({
			where: { requestId: { in: requestIds } },
			select: { storageKey: true }
		})
	])
	// #299/AC-9: the requestDocument query above stays UNFILTERED — every byte of a purged employee
	// must go, tombstoned or not. The null filter is NOT cosmetic here: removeFiles() is typed
	// `string[]` and the private deleteStoredFile above calls path.resolve(UPLOAD_DIR, storageKey),
	// which throws `TypeError: The "path" argument must be of type string` on a null — mid-purge, on
	// the droplet. `pnpm check` does not read scripts/, so nothing in the pipeline would flag it.
	const storageKeys = [...employeeDocs, ...requestDocs]
		.map((d) => d.storageKey)
		.filter((k): k is string => k !== null)

	const [
		timesheetEntries,
		timeLogs,
		leaveRequests,
		leaveBalances,
		onboarding,
		attendanceDays,
		benefitEnrollments,
		reviewsAbout,
		reviewsGiven,
		cashAdvances,
		loanPayments,
		emergencyContacts,
		recurringEarnings,
		recurringDeductions,
		auditLogs,
		sessions,
		notifications,
		memberships,
		directReports,
		assignedInventory,
		managedBranches
	] = await Promise.all([
		db.timesheetEntry.count({ where: { timesheetId: { in: timesheetIds } } }),
		db.timeLog.count({ where: { employeeId } }),
		db.leaveRequest.count({ where: { employeeId } }),
		db.leaveBalance.count({ where: { employeeId } }),
		db.onboardingCompletion.count({ where: { employeeId } }),
		db.attendanceDay.count({ where: { employeeId } }),
		db.benefitEnrollment.count({ where: { employeeId } }),
		db.performanceReview.count({ where: { employeeId } }),
		db.performanceReview.count({ where: { reviewerId: employeeId } }),
		db.cashAdvance.count({ where: { employeeId } }),
		db.loanPayment.count({ where: { loanId: { in: loanIds } } }),
		db.emergencyContact.count({ where: { employeeId } }),
		db.employeeEarning.count({ where: { employeeId } }),
		db.employeeDeduction.count({ where: { employeeId } }),
		db.auditLog.count({ where: { actorId: employee.userId } }),
		db.session.count({ where: { userId: employee.userId } }),
		db.notification.count({ where: { userId: employee.userId } }),
		db.userOrganization.count({ where: { userId: employee.userId } }),
		db.employee.count({ where: { reportsToId: employeeId } }),
		db.inventoryItem.count({ where: { assignedToId: employeeId } }),
		db.branch.count({ where: { managerId: employeeId } })
	])

	console.log(
		`\nTarget: ${employee.lastName}, ${employee.firstName} (${employee.employeeNumber}) — ` +
			`${employee.user.email}, status ${employee.employmentStatus}`
	)
	printPlan('Rows to delete:', {
		employees: 1,
		users: 1,
		timesheets: timesheetIds.length,
		timesheet_entries: timesheetEntries,
		time_logs: timeLogs,
		attendance_days: attendanceDays,
		requests: requestIds.length,
		request_documents: requestDocs.length,
		leave_requests: leaveRequests,
		leave_balances: leaveBalances,
		onboarding_completions: onboarding,
		separation_records: separations.length,
		payroll_entries: entryIds.length,
		loans: loanIds.length,
		loan_payments: loanPayments,
		cash_advances: cashAdvances,
		employee_earnings: recurringEarnings,
		employee_deductions: recurringDeductions,
		employee_documents: employeeDocs.length,
		emergency_contacts: emergencyContacts,
		benefit_enrollments: benefitEnrollments,
		performance_reviews: reviewsAbout + reviewsGiven,
		audit_logs: auditLogs,
		sessions,
		notifications,
		user_organizations: memberships
	})

	if (employee.employmentStatus === 'ACTIVE')
		console.warn(
			'\n  ! This employee is ACTIVE — offboarding, not deletion, is usually what you want.'
		)
	if (reviewsGiven)
		console.warn(
			`  ! ${reviewsGiven} performance review(s) they wrote about OTHER employees will be deleted too.`
		)
	if (auditLogs)
		console.warn(
			`  ! ${auditLogs} audit_log row(s) they authored will be deleted — that history is unrecoverable.`
		)
	if (directReports)
		console.warn(`  ! ${directReports} direct report(s) will have reportsTo cleared.`)
	if (assignedInventory)
		console.warn(`  ! ${assignedInventory} inventory item(s) will be left unassigned.`)
	if (managedBranches)
		console.warn(`  ! ${managedBranches} branch(es) will be left without a manager.`)
	if (storageKeys.length)
		console.log(
			`\n  ${storageKeys.length} uploaded file(s) will be removed from disk after commit.`
		)

	await assertNoCollectedLoanPayments(entryIds)

	if (!execute) {
		console.log(
			`\nDry run — nothing was deleted. To go ahead:\n` +
				`  pnpm prod-delete employee ${employeeId} --execute --confirm=${employee.employeeNumber} --actor=<email>\n`
		)
		return
	}
	requireConfirmation(employee.employeeNumber)
	const actor = await resolveActor(employee.organizationId, employee.userId)

	await db.$transaction(
		async (tx) => {
			await tx.auditLog.create({
				data: {
					organizationId: employee.organizationId,
					actorId: actor.id,
					actorRoles: actor.roles,
					action: 'DELETE',
					entityType: 'Employee',
					entityId: employee.id,
					oldValue: {
						employeeNumber: employee.employeeNumber,
						name: `${employee.lastName}, ${employee.firstName}`,
						email: employee.user.email,
						employmentStatus: employee.employmentStatus,
						deletedVia: 'scripts/prod-delete.ts'
					} satisfies Prisma.InputJsonObject
				}
			})

			// Children with a Restrict FK to the employee, deepest first. Anything marked
			// Cascade in the schema (timesheet_entries, approval_steps, request_documents,
			// clearance_items, payroll_earnings/deductions, loan_payments, emergency_contacts,
			// employee_documents, employee_earnings/deductions, sessions, notifications,
			// user_organizations) rides along with its parent and is not listed here.
			await tx.payrollEntry.deleteMany({ where: { employeeId } })
			await tx.loan.deleteMany({ where: { employeeId } })
			await tx.cashAdvance.deleteMany({ where: { employeeId } })
			await tx.performanceReview.deleteMany({
				where: { OR: [{ employeeId }, { reviewerId: employeeId }] }
			})
			await tx.benefitEnrollment.deleteMany({ where: { employeeId } })
			await tx.attendanceDay.deleteMany({ where: { employeeId } })
			await tx.timeLog.deleteMany({ where: { employeeId } })
			await tx.leaveBalance.deleteMany({ where: { employeeId } })
			await tx.leaveRequest.deleteMany({ where: { employeeId } })
			await tx.onboardingCompletion.deleteMany({ where: { employeeId } })
			await tx.separationRecord.deleteMany({ where: { employeeId } })
			await tx.request.deleteMany({ where: { employeeId } })
			await tx.timesheet.deleteMany({ where: { employeeId } })

			await tx.employee.delete({ where: { id: employeeId } })

			// audit_logs.actorId is a required FK to users, so their own audit trail has to
			// go before the user row can. The DELETE row written above survives: its actor
			// is someone else.
			await tx.auditLog.deleteMany({ where: { actorId: employee.userId } })
			await tx.user.delete({ where: { id: employee.userId } })
		},
		{ maxWait: 10_000, timeout: 120_000 }
	)

	console.log(
		`\n✓ Deleted ${employee.employeeNumber} (${employee.lastName}, ${employee.firstName}).`
	)
	await removeFiles(storageKeys)
}

async function deletePayrollRun(runId: string) {
	const run = await db.payrollRun.findUnique({
		where: { id: runId },
		select: {
			id: true,
			organizationId: true,
			periodStart: true,
			periodEnd: true,
			status: true,
			totalNet: true,
			periodId: true
		}
	})
	if (!run) die(`No payroll run with id ${runId}.`)

	const entries = await db.payrollEntry.findMany({
		where: { payrollRunId: runId },
		select: { id: true }
	})
	const entryIds = entries.map((e) => e.id)

	const [earnings, deductions, steps] = await Promise.all([
		db.payrollEarning.count({ where: { payrollEntryId: { in: entryIds } } }),
		db.payrollDeduction.count({ where: { payrollEntryId: { in: entryIds } } }),
		db.approvalStep.count({ where: { payrollRunId: runId } })
	])

	const token = `${iso(run.periodStart)}..${iso(run.periodEnd)}`
	console.log(`\nTarget: payroll run ${token} — status ${run.status}, net ${run.totalNet}`)
	printPlan('Rows to delete:', {
		payroll_runs: 1,
		payroll_entries: entryIds.length,
		payroll_earnings: earnings,
		payroll_deductions: deductions,
		approval_steps: steps
	})

	if (run.status === 'APPROVED')
		console.warn(
			'\n  ! This run is APPROVED — it has been signed off and payslips may already be out.'
		)
	if (run.periodId)
		console.warn(
			'  ! The PayrollPeriod stays behind; generating again will build a fresh run for it.'
		)

	await assertNoCollectedLoanPayments(entryIds)

	if (!execute) {
		console.log(
			`\nDry run — nothing was deleted. To go ahead:\n` +
				`  pnpm prod-delete payroll-run ${runId} --execute --confirm=${token} --actor=<email>\n`
		)
		return
	}
	requireConfirmation(token)
	const actor = await resolveActor(run.organizationId)

	await db.$transaction(
		async (tx) => {
			await tx.auditLog.create({
				data: {
					organizationId: run.organizationId,
					actorId: actor.id,
					actorRoles: actor.roles,
					action: 'DELETE',
					entityType: 'PayrollRun',
					entityId: run.id,
					oldValue: {
						period: token,
						status: run.status,
						totalNet: String(run.totalNet),
						entries: entryIds.length,
						deletedVia: 'scripts/prod-delete.ts'
					} satisfies Prisma.InputJsonObject
				}
			})
			// payroll_earnings/deductions cascade from the entry, approval_steps from the run.
			await tx.payrollEntry.deleteMany({ where: { payrollRunId: runId } })
			await tx.payrollRun.delete({ where: { id: runId } })
		},
		{ maxWait: 10_000, timeout: 120_000 }
	)

	console.log(`\n✓ Deleted payroll run ${token}.`)
}

/** Post-commit, best effort: the rows are already gone, so a missing file is not fatal. */
async function removeFiles(storageKeys: string[]) {
	if (!storageKeys.length) return
	let failed = 0
	for (const key of storageKeys) {
		try {
			await deleteStoredFile(key)
		} catch {
			failed++
			console.warn(
				`  ! could not remove ${key} — sweep it later with scripts/sweep-orphan-uploads.ts`
			)
		}
	}
	console.log(`  Removed ${storageKeys.length - failed}/${storageKeys.length} uploaded file(s).`)
}

async function main() {
	if (!targetId) die(USAGE)
	if (kind === 'employee') await deleteEmployee(targetId)
	else if (kind === 'payroll-run') await deletePayrollRun(targetId)
	else die(`Unknown target "${kind}".\n${USAGE}`)
}

main()
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(() => db.$disconnect())
