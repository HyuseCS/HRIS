// One-off: seed TimeLog punches (IN/OUT pairs) for every active employee in every
// organization, across the last ~2 weeks of weekdays, with a deliberate mix of shift
// shapes so attendance derivation has realistic raw data to work from.
//
//   bunx tsx scripts/seed-punches-demo.ts            # seed 12 weekdays, all orgs
//   bunx tsx scripts/seed-punches-demo.ts --days=20  # a longer window
//   bunx tsx scripts/seed-punches-demo.ts --org=Veent
//   bunx tsx scripts/seed-punches-demo.ts --clear    # remove previously seeded punches
//
// This is the companion to seed-attendance-demo.ts, which writes AttendanceDay rows
// directly. That script's own caveat is that its employees have no punches, so clicking
// "Refresh" on /attendance re-derives them to ABSENT. Punches are the upstream truth:
// seed these and the derived days survive a Refresh, aggregate into timesheets, and feed
// payroll — the same path a real Discord /in /out takes.
//
// Nothing derives here. /attendance and /team auto-derive on load (non-destructive: they
// skip locked and manually-corrected days), so the rows appear the first time you open
// the page. Use "Refresh" for a full re-derive of a range.
//
// ─── Interaction with the E2E suite ──────────────────────────────────────────
// tests/e2e/timesheet-punch.spec.ts punches employee@veent.ph on a day in the PREVIOUS
// PHT week and asserts the week aggregates to exactly "7.00 hrs across 1 day". Demo
// punches in that window make the week total more than that and the spec fails. Run
// `--clear` before `bun run test:e2e` to take the seeded punches back out.

import { PrismaClient, type PunchType } from '@prisma/client'

const db = new PrismaClient()

// Marks every row this script writes, so --clear (and a re-run) can find them again
// without touching real punches or the ones the E2E suite creates.
const SEED_NOTE = 'seed:demo-punches'

/**
 * Shift shapes as Manila wall-clock times. `out: null` leaves the day with an IN and no
 * OUT — the INCOMPLETE case. `null` entirely means no punches at all, which derives to
 * ABSENT and is what the team view's "didn't time in" exception reads.
 *
 * Schedule is Mon–Fri 08:00–17:00 with a 60-minute unpaid break (prisma/seed-core.ts), and
 * derivation flags LATE on any minute past 08:00 — there is no grace window.
 *
 * Time worked past 17:00 lands in `rawOvertimeHours`, but PAID `overtimeHours` stays 0.00
 * until an OVERTIME request is approved for that day (T169: derivation pays
 * min(rawOvertime, approvedOtHours)). So the long shift below shows as 8.00 with an amber
 * "(+3.0)" unapproved-OT marker on /attendance, not as paid overtime — which is the point:
 * it exercises that indicator. Approve an OT request for the day to see it become payable.
 */
const SHIFTS: ({ label: string; in: string; out: string | null } | null)[] = [
	{ label: 'on time', in: '08:00', out: '17:00' }, // 8.00 paid
	{ label: 'on time', in: '07:52', out: '17:04' }, // 8.00 paid, 0.20 raw OT
	{ label: 'late', in: '08:35', out: '17:00' }, // LATE 35 min, 7.42 paid
	{ label: 'on time', in: '08:00', out: '17:00' },
	{ label: 'long day', in: '08:00', out: '20:00' }, // 8.00 paid + 3.00 unapproved OT
	{ label: 'on time', in: '07:58', out: '17:12' },
	{ label: 'no out', in: '08:00', out: null }, // INCOMPLETE
	{ label: 'on time', in: '08:00', out: '17:00' },
	null, // ABSENT — no punches
	{ label: 'undertime', in: '08:04', out: '15:20' } // left early
]

/** Last `count` weekdays (Mon–Fri) ending today inclusive, oldest first, reckoned in PHT. */
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

function arg(name: string): string | undefined {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
	return hit?.split('=').slice(1).join('=')
}

async function main() {
	const clearOnly = process.argv.includes('--clear')
	const days = Number(arg('days') ?? 12)
	if (!Number.isInteger(days) || days < 1) throw new Error('--days must be a positive integer')
	const orgName = arg('org')

	const orgs = await db.organization.findMany({
		where: orgName ? { name: orgName } : {},
		select: { id: true, name: true },
		orderBy: { name: 'asc' }
	})
	if (orgs.length === 0) {
		throw new Error(
			orgName
				? `No organization named "${orgName}".`
				: 'No organizations — run `bun run db:seed` first.'
		)
	}

	const employees = await db.employee.findMany({
		where: { organizationId: { in: orgs.map((o) => o.id) }, employmentStatus: 'ACTIVE' },
		orderBy: [{ organizationId: 'asc' }, { employeeNumber: 'asc' }],
		select: {
			id: true,
			employeeNumber: true,
			firstName: true,
			lastName: true,
			organizationId: true
		}
	})
	if (employees.length === 0) throw new Error('No active employees to seed punches for.')

	// Only ever removes rows this script wrote (matched on note), so real punches and the
	// E2E suite's HMAC-signed ones are never touched.
	const removed = await db.timeLog.deleteMany({
		where: { note: SEED_NOTE, employeeId: { in: employees.map((e) => e.id) } }
	})
	if (clearOnly) {
		console.log(`✔ Cleared ${removed.count} seeded punch(es). Real punches were left alone.`)
		console.log('  Derived AttendanceDay rows remain — open /attendance and hit "Refresh"')
		console.log('  to re-derive the range now that the punches are gone.')
		return
	}
	if (removed.count > 0) console.log(`  Replacing ${removed.count} punch(es) from a previous run.`)

	const keys = recentWeekdays(days)
	const rows: { employeeId: string; punchType: PunchType; timestamp: Date; note: string }[] = []
	const tally = { pairs: 0, incomplete: 0, absent: 0 }

	for (let ei = 0; ei < employees.length; ei++) {
		for (let di = 0; di < keys.length; di++) {
			// Index by (employee + day) so exceptions land on different people each day
			// rather than everyone being absent on the same one.
			const shift = SHIFTS[(ei + di) % SHIFTS.length]
			if (!shift) {
				tally.absent++
				continue
			}
			const key = keys[di]
			const at = (hm: string) => new Date(`${key}T${hm}:00+08:00`) // Manila wall-clock

			rows.push({
				employeeId: employees[ei].id,
				punchType: 'IN',
				timestamp: at(shift.in),
				note: SEED_NOTE
			})
			if (shift.out === null) {
				tally.incomplete++
				continue
			}
			rows.push({
				employeeId: employees[ei].id,
				punchType: 'OUT',
				timestamp: at(shift.out),
				note: SEED_NOTE
			})
			tally.pairs++
		}
	}

	// MANUAL rather than DISCORD: these did not come from the bot, and the source is what
	// distinguishes a backfilled punch from a real one in the audit trail.
	await db.timeLog.createMany({ data: rows.map((r) => ({ ...r, source: 'MANUAL' as const })) })

	console.log(
		`✔ Seeded ${rows.length} punches for ${employees.length} active employees ` +
			`across ${keys.length} weekdays (${keys[0]} → ${keys[keys.length - 1]}).`
	)
	console.log(
		`  ${tally.pairs} complete IN/OUT days, ${tally.incomplete} missing an OUT (INCOMPLETE), ` +
			`${tally.absent} with no punches (ABSENT).`
	)
	for (const o of orgs) {
		const n = employees.filter((e) => e.organizationId === o.id).length
		if (n) console.log(`    ${o.name}: ${n} employee(s)`)
	}
	console.log('  Open /attendance (or /team) to derive them — no manual step needed.')
	console.log(
		'  Run with --clear before `bun run test:e2e` (see the note at the top of this file).'
	)
}

main()
	.then(() => db.$disconnect())
	.catch(async (e) => {
		console.error(e)
		await db.$disconnect()
		process.exit(1)
	})
