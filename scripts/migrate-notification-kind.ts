// One-off: backfill Notification.kind, and strip the 📢 that announcements used to prefix onto
// their message text.
//
//   bunx tsx scripts/migrate-notification-kind.ts
//
// Run this AFTER `prisma db push` adds the column — every existing row lands on the GENERAL
// default, which would show a bell against a payslip release. The kind is recovered from the
// link the notification was written with, which is the only signal those rows carry.
//
// Idempotent: re-running it finds nothing left on GENERAL that matches, and no message left
// with the emoji.

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
	// `/dashboard` is deliberately absent: announcements, awards, Discord invites and posting
	// approvals all point there, so the link cannot tell them apart. They keep GENERAL.
	const byLink = [
		{ prefix: '/payslips', kind: 'PAYSLIP' as const },
		{ prefix: '/requests/', kind: 'REQUEST' as const },
		{ prefix: '/recruitment', kind: 'RECRUITMENT' as const }
	]

	for (const { prefix, kind } of byLink) {
		const { count } = await db.notification.updateMany({
			where: { kind: 'GENERAL', link: { startsWith: prefix } },
			data: { kind }
		})
		console.log(`  ${prefix} → ${kind}: ${count}`)
	}

	// The emoji prefix is what identifies the old announcement rows; stripping it and setting
	// the kind is the same pass.
	const stale = await db.notification.findMany({
		where: { message: { startsWith: '📢 ' } },
		select: { id: true, message: true }
	})
	for (const n of stale) {
		await db.notification.update({
			where: { id: n.id },
			data: { message: n.message.slice(2).trim(), kind: 'ANNOUNCEMENT' }
		})
	}
	console.log(`  announcements de-emojified: ${stale.length}`)

	// Awards are recoverable from their wording — the only notification that opens this way.
	const { count: awards } = await db.notification.updateMany({
		where: { kind: 'GENERAL', message: { startsWith: 'You received an award:' } },
		data: { kind: 'AWARD' }
	})
	console.log(`  awards: ${awards}`)
}

main()
	.then(() => console.log('✔ Notification kinds backfilled.'))
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(() => db.$disconnect())
