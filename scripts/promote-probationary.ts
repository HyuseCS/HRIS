// Automatic regularization (#136). PH probation caps at 6 months; this flips ACTIVE
// PROBATIONARY employees to REGULAR once 6 whole calendar months of service have
// elapsed, and notifies that org's HR.
//
//   pnpm tsx scripts/promote-probationary.ts --dry-run   # list who would be promoted
//   pnpm tsx scripts/promote-probationary.ts             # promote + notify
//
// Runs nightly from the droplet crontab (see scripts/README.md) — it is NOT scheduled
// from inside the app, which has no scheduler.
//
// Two deliberate choices:
//   • It delegates to promoteEmployee() rather than writing the row itself, so the audit
//     entry is byte-identical to a manual HR promotion and therefore renders correctly in the
//     201 file's Employment History timeline. Hand-rolling the write (as offboardEmployee
//     does) omits oldValue and the timeline degrades to "— → REGULAR". Since #222 the
//     employment type is effective-dated, and promoteEmployee is the only writer that records
//     the snapshot the as-of read needs.
//   • It runs as the seeded system@veent.ph user. AuditLog.actorId is a non-nullable FK to
//     User, so an automated actor is not optional — see seedProd in prisma/seed-core.ts.
//
// Idempotent: the query only matches PROBATIONARY, so a second run in the same night is a
// no-op.

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { promoteEmployee } from '../src/lib/server/services/employees'
import { notifyMany } from '../src/lib/server/services/notifications'
import { monthsOfService, regularizationStatus, tenureLabel } from '../src/lib/utils/dates'

const PROBATION_MONTHS = 6
const SYSTEM_EMAIL = 'system@veent.ph'

const dryRun = process.argv.slice(2).includes('--dry-run')
const db = new PrismaClient()

async function main() {
	const systemUser = await db.user.findUnique({
		where: { email: SYSTEM_EMAIL },
		select: { id: true, roles: true }
	})
	if (!systemUser) {
		console.error(
			`No ${SYSTEM_EMAIL} user found — the audit trail needs it. Run \`pnpm db:seed\` first.`
		)
		process.exit(1)
	}

	// Small set, so the calendar-month test runs in JS rather than as SQL date arithmetic —
	// it must use the exact same helper as the tenure shown in the UI, or an employee reading
	// "5 months" could be promoted.
	const probationary = await db.employee.findMany({
		where: { employmentType: 'PROBATIONARY', employmentStatus: 'ACTIVE' },
		select: {
			id: true,
			organizationId: true,
			employeeNumber: true,
			firstName: true,
			lastName: true,
			startDate: true
		},
		orderBy: [{ organizationId: 'asc' }, { employeeNumber: 'asc' }]
	})

	const due = probationary.filter((e) => monthsOfService(e.startDate) >= PROBATION_MONTHS)

	if (due.length === 0) {
		console.log(`Nothing to regularize (${probationary.length} probationary employee(s) checked).`)
		return
	}

	console.log(
		`${due.length} of ${probationary.length} probationary employee(s) reached ${PROBATION_MONTHS} months:`
	)
	for (const e of due) {
		console.log(
			`  ${e.employeeNumber}  ${e.lastName}, ${e.firstName}  (${tenureLabel(e.startDate)})`
		)
	}
	if (dryRun) {
		console.log('\nDry run — nothing written.')
		return
	}

	// Group by org: HR is notified per tenant, and the audit ctx is org-scoped.
	const byOrg = new Map<string, typeof due>()
	for (const e of due) {
		const list = byOrg.get(e.organizationId) ?? []
		list.push(e)
		byOrg.set(e.organizationId, list)
	}

	let promoted = 0
	for (const [organizationId, employees] of byOrg) {
		const ctx = {
			organizationId,
			actorId: systemUser.id,
			actorRoles: systemUser.roles
		}

		const done: typeof employees = []
		// #222: promoteEmployee enforces the rate/type pairing, so a legacy PROBATIONARY employee on an
		// hourly rate now fails to regularize instead of quietly landing an illegal pairing. That needs
		// a human, so failures are notified alongside the successes rather than only logged.
		const failed: { employee: (typeof employees)[number]; reason: string }[] = []
		for (const e of employees) {
			try {
				// Effective on the day probation actually ended, not the night the sweep happened to
				// run — the snapshot is effective-dated, so a late cron backdates correctly.
				await promoteEmployee(
					e.id,
					organizationId,
					{
						employmentType: 'REGULAR',
						effectiveDate: regularizationStatus(e.startDate).date,
						note: 'automatic regularization'
					},
					ctx
				)
				done.push(e)
				promoted++
			} catch (err) {
				// One bad row must not abort the whole sweep.
				const reason = ((err as { body?: { message?: string } })?.body?.message ??
					(err as Error).message) as string
				console.error(`  ! ${e.employeeNumber} ${e.lastName}: ${reason}`)
				failed.push({ employee: e, reason })
			}
		}
		if (done.length === 0 && failed.length === 0) continue

		// Notify that org's HR so a status change nobody clicked is still visible to a human.
		const hr = await db.user.findMany({
			where: { organizationId, isActive: true, roles: { hasSome: ['HR_ADMIN', 'SUPER_ADMIN'] } },
			select: { id: true }
		})
		if (hr.length === 0) {
			console.warn(`  (org ${organizationId}: no active HR to notify)`)
			continue
		}
		for (const e of done) {
			await notifyMany(
				hr.map((u) => u.id),
				`${e.firstName} ${e.lastName} completed ${PROBATION_MONTHS} months and was regularized to Regular.`,
				`/employees/${e.id}`
			)
		}
		for (const { employee: e, reason } of failed) {
			await notifyMany(
				hr.map((u) => u.id),
				`${e.firstName} ${e.lastName} (${e.employeeNumber}) completed ${PROBATION_MONTHS} months but could NOT be regularized automatically: ${reason}`,
				`/employees/${e.id}`
			)
		}
		console.log(
			`  org ${organizationId}: ${done.length} promoted, ${failed.length} failed, ${hr.length} HR notified`
		)
	}

	console.log(`\nRegularized ${promoted} employee(s).`)
}

main()
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(() => db.$disconnect())
