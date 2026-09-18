// One-off: seed AttendanceDay rows for all active employees across the last ~2 weeks
// of weekdays, with a deliberate mix of statuses so the Attendance views — and the
// "Exceptions only" filter (#55) — have realistic data to show.
//
//   bunx tsx scripts/seed-attendance-demo.ts
//
// Statuses are scattered so that on any given day the team view has a mix (some
// PRESENT, some LATE/INCOMPLETE/ABSENT/ON_LEAVE) and each employee's range does too.
// One employee is left with NO record on the most recent day to exercise the
// "no punch = didn't time in" exception case in the team view.
//
// Note: the Attendance page auto-derives only MISSING days on load, so these rows
// survive a normal visit. Clicking "Refresh" does a full re-derive from punches —
// and these demo employees have none — so it would reset them to ABSENT.

import { PrismaClient, type AttendanceStatus } from '@prisma/client'

const db = new PrismaClient()

// Repeating pattern; index by (employeeIndex + dayIndex) so exceptions land on
// different employees on different days.
const CYCLE: AttendanceStatus[] = [
	'PRESENT',
	'PRESENT',
	'LATE',
	'PRESENT',
	'INCOMPLETE',
	'PRESENT',
	'ABSENT',
	'PRESENT',
	'ON_LEAVE',
	'PRESENT'
]

// Last `count` weekdays (Mon–Fri) ending today (inclusive), oldest first. Days are
// reckoned in Asia/Manila (+08:00) — matching fieldsFor's wall-clock interpretation —
// by shifting the clock +8h and reading it with UTC getters.
function recentWeekdays(count: number): string[] {
	const keys: string[] = []
	const d = new Date(Date.now() + 8 * 60 * 60 * 1000)
	while (keys.length < count) {
		const dow = d.getUTCDay()
		if (dow !== 0 && dow !== 6) keys.push(d.toISOString().slice(0, 10))
		d.setUTCDate(d.getUTCDate() - 1)
	}
	return keys.reverse()
}

function fieldsFor(status: AttendanceStatus, key: string) {
	const at = (hm: string) => new Date(`${key}T${hm}:00+08:00`) // Manila wall-clock
	switch (status) {
		case 'PRESENT':
			return {
				timeIn: at('08:00'),
				timeOut: at('17:00'),
				regularHours: 8,
				workedHours: 8,
				lateMinutes: 0
			}
		case 'LATE':
			return {
				timeIn: at('08:35'),
				timeOut: at('17:00'),
				regularHours: 8,
				workedHours: 8,
				lateMinutes: 35
			}
		case 'INCOMPLETE':
			return { timeIn: at('08:00'), timeOut: null, regularHours: 0, workedHours: 0, lateMinutes: 0 }
		default: // ABSENT, ON_LEAVE, HOLIDAY, REST_DAY
			return { timeIn: null, timeOut: null, regularHours: 0, workedHours: 0, lateMinutes: 0 }
	}
}

async function main() {
	const org = await db.organization.findFirst()
	if (!org) throw new Error('No organization — run `bun run db:seed` first.')

	const employees = await db.employee.findMany({
		where: { organizationId: org.id, employmentStatus: 'ACTIVE' },
		orderBy: { employeeNumber: 'asc' },
		select: { id: true, employeeNumber: true, firstName: true, lastName: true }
	})
	if (employees.length === 0) throw new Error('No active employees to seed attendance for.')

	const days = recentWeekdays(12)
	const latest = days[days.length - 1]
	const skipEmpId = employees[employees.length - 1].id // this one gets no row on `latest`

	let created = 0
	for (let ei = 0; ei < employees.length; ei++) {
		const emp = employees[ei]
		for (let di = 0; di < days.length; di++) {
			const key = days[di]
			if (emp.id === skipEmpId && key === latest) continue // leave a "no record" hole

			const status = CYCLE[(ei + di) % CYCLE.length]
			const f = fieldsFor(status, key)
			const date = new Date(`${key}T00:00:00.000Z`)

			await db.attendanceDay.upsert({
				where: { employeeId_date: { employeeId: emp.id, date } },
				update: { status, ...f },
				create: { employeeId: emp.id, date, status, ...f }
			})
			created++
		}
	}

	const skip = employees[employees.length - 1]
	console.log(
		`✔ Seeded ${created} attendance days for ${employees.length} employees across ${days.length} weekdays (${days[0]} → ${latest}).`
	)
	console.log(
		`  Team view for ${latest} has a status mix; ${skip.lastName}, ${skip.firstName} (${skip.employeeNumber}) has NO record that day (no-punch exception).`
	)
	console.log('  Try /attendance (team + by-employee) with "Exceptions only" toggled on.')
}

main()
	.then(() => db.$disconnect())
	.catch(async (e) => {
		console.error(e)
		await db.$disconnect()
		process.exit(1)
	})
