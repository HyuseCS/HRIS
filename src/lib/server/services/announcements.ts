import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { notifyMany } from './notifications'
import type { AuditContext } from './types'

/**
 * Recent announcements with a ready-to-render `authorName` (#141).
 *
 * The byline is resolved here rather than in the component: the name lives on Employee, not
 * User, so it needs a two-hop join the client has no business knowing about — and this keeps
 * the raw author record (including the email) off the wire.
 */
export async function listRecentAnnouncements(organizationId: string, limit = 5) {
	const rows = await db.announcement.findMany({
		where: { organizationId },
		orderBy: { createdAt: 'desc' },
		take: limit,
		select: {
			id: true,
			title: true,
			body: true,
			createdAt: true,
			author: {
				select: { email: true, employee: { select: { firstName: true, lastName: true } } }
			}
		}
	})

	return rows.map(({ author, ...a }) => ({ ...a, authorName: announcementAuthorName(author) }))
}

/**
 * Byline for an announcement author: "Hannah HR", falling back to the email local-part when
 * the account has no employee record (the seeded CEO has none), and to null when there is no
 * author at all — callers omit the line rather than printing a dangling dash.
 */
export function announcementAuthorName(
	author: { email: string; employee: { firstName: string; lastName: string } | null } | null
): string | null {
	if (!author) return null
	if (author.employee) return `${author.employee.firstName} ${author.employee.lastName}`
	return author.email.split('@')[0] || null
}

// Post an announcement and fan out a notification to every user in the org so it
// pops as a toast on their next load.
export async function createAnnouncement(
	organizationId: string,
	input: { title: string; body: string },
	ctx: AuditContext
) {
	// The recipient list is an org-wide scan, and only a read — gathering it before the
	// transaction opens keeps the transaction short instead of holding it across the whole
	// user table for no atomicity gain. The notification write itself stays INSIDE: it is a
	// plain `createMany`, and notifications must not survive an announcement that rolled back.
	const users = await db.user.findMany({
		where: { organizationId, isActive: true },
		select: { id: true }
	})

	return await db.$transaction(async (tx) => {
		const created = await tx.announcement.create({
			data: {
				organizationId,
				authorId: ctx.actorId,
				title: input.title.trim(),
				body: input.body.trim()
			}
		})

		await notifyMany(
			users.map((u) => u.id),
			created.title,
			'/dashboard',
			'ANNOUNCEMENT',
			tx
		)

		await writeAuditLog(
			ctx,
			{
				action: 'CREATE',
				entityType: 'Announcement',
				entityId: created.id,
				newValue: { title: created.title }
			},
			tx
		)
		return created
	})
}
