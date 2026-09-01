import { db } from '$lib/server/db'
import { error } from '@sveltejs/kit'
import { Prisma, type JobChannelStatus } from '@prisma/client'
import { writeAuditLog } from '$lib/server/audit'
import type { AuditContext } from './types'

// ─── Job-board tracking (#117) ──────────────────────────────────────────────────
//
// A manual checklist of where a posting was published — NOT an API integration. Mirrors
// the DeductionType/EmployeeDeduction split: JobBoard is the org catalog (managed in
// Settings), JobPostingChannel is the per-posting assignment. Boards are deactivated,
// never deleted, so historical postings keep their context.

// Common PH boards materialized for a fresh org so the checklist works out of the box.
export const DEFAULT_BOARDS = [
	'JobStreet',
	'Indeed',
	'LinkedIn',
	'Facebook',
	'Company Website',
	'Referral'
]

// ─── Board catalog (Settings) ────────────────────────────────────────────────────

export async function listJobBoards(organizationId: string) {
	return db.jobBoard.findMany({
		where: { organizationId },
		orderBy: [{ isActive: 'desc' }, { name: 'asc' }]
	})
}

/** Materialize the default boards on first visit to the editor. Idempotent. */
export async function ensureSeededBoards(organizationId: string) {
	const count = await db.jobBoard.count({ where: { organizationId } })
	if (count > 0) return
	await db.jobBoard.createMany({
		data: DEFAULT_BOARDS.map((name) => ({ organizationId, name })),
		skipDuplicates: true
	})
}

export async function createJobBoard(organizationId: string, name: string, ctx: AuditContext) {
	const clean = name.trim()
	if (!clean) error(400, 'Board name is required')
	try {
		return await db.$transaction(async (tx) => {
			const created = await tx.jobBoard.create({ data: { organizationId, name: clean } })
			await writeAuditLog(
				ctx,
				{
					action: 'CREATE',
					entityType: 'JobBoard',
					entityId: created.id,
					newValue: { name: clean }
				},
				tx
			)
			return created
		})
	} catch (e) {
		if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
			error(409, `Board "${clean}" already exists`)
		throw e
	}
}

export async function updateJobBoard(
	organizationId: string,
	id: string,
	name: string,
	ctx: AuditContext
) {
	const existing = await db.jobBoard.findFirst({
		where: { id, organizationId },
		select: { id: true }
	})
	if (!existing) error(404, 'Job board not found')
	const clean = name.trim()
	if (!clean) error(400, 'Board name is required')
	try {
		return await db.$transaction(async (tx) => {
			const updated = await tx.jobBoard.update({ where: { id }, data: { name: clean } })
			await writeAuditLog(
				ctx,
				{ action: 'UPDATE', entityType: 'JobBoard', entityId: id, newValue: { name: clean } },
				tx
			)
			return updated
		})
	} catch (e) {
		if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
			error(409, `Board "${clean}" already exists`)
		throw e
	}
}

/** Soft delete: boards are referenced by historical channels, so toggle active. */
export async function toggleJobBoard(organizationId: string, id: string, ctx: AuditContext) {
	const existing = await db.jobBoard.findFirst({
		where: { id, organizationId },
		select: { id: true, isActive: true }
	})
	if (!existing) error(404, 'Job board not found')
	return db.$transaction(async (tx) => {
		const updated = await tx.jobBoard.update({
			where: { id },
			data: { isActive: !existing.isActive }
		})
		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'JobBoard',
				entityId: id,
				newValue: { isActive: updated.isActive }
			},
			tx
		)
		return updated
	})
}

// ─── Per-posting channels ─────────────────────────────────────────────────────

export type BoardChannelView = {
	boardId: string
	name: string
	// Currently advertised there (status POSTED) — drives the checkbox.
	live: boolean
	url: string | null
	postedAt: Date | null
	status: JobChannelStatus | null
}

function viewOf(
	board: { id: string; name: string },
	channel: { status: JobChannelStatus; url: string | null; postedAt: Date | null } | undefined
): BoardChannelView {
	return {
		boardId: board.id,
		name: board.name,
		live: channel?.status === 'POSTED',
		url: channel?.url ?? null,
		postedAt: channel?.postedAt ?? null,
		status: channel?.status ?? null
	}
}

/**
 * The checklist rows for a posting: every active board, plus any inactive board that
 * still carries a channel for this posting (so deactivating a board never hides where a
 * role was already advertised).
 */
export async function getPostingBoards(
	organizationId: string,
	jobPostingId: string
): Promise<BoardChannelView[]> {
	const [boards, channels] = await Promise.all([
		db.jobBoard.findMany({
			where: { organizationId, isActive: true },
			orderBy: { name: 'asc' }
		}),
		db.jobPostingChannel.findMany({
			where: { jobPostingId, jobBoard: { organizationId } },
			include: { jobBoard: { select: { id: true, name: true, isActive: true } } }
		})
	])
	const byBoard = new Map(channels.map((c) => [c.jobBoardId, c]))
	const views = boards.map((b) => viewOf(b, byBoard.get(b.id)))
	// Append channels whose board is no longer active so their history stays visible.
	const activeIds = new Set(boards.map((b) => b.id))
	for (const c of channels) {
		if (!activeIds.has(c.jobBoardId)) views.push(viewOf(c.jobBoard, c))
	}
	return views
}

/** Boards a CLOSED posting is still live on — the takedown to-do list (#117). */
export function liveChannels(boards: BoardChannelView[]) {
	return boards.filter((b) => b.live)
}

export interface SetChannelInput {
	posted: boolean
	url: string | null
}

/**
 * Tick/untick a board for a posting. Ticking creates or reactivates a POSTED row (and
 * records the URL + posted date); unticking flips it to TAKEN_DOWN with a takedown date
 * rather than deleting, so the advertising history survives.
 */
export async function setChannel(
	organizationId: string,
	jobPostingId: string,
	jobBoardId: string,
	input: SetChannelInput,
	ctx: AuditContext
) {
	const posting = await db.jobPosting.findFirst({
		where: { id: jobPostingId, organizationId },
		select: { id: true }
	})
	if (!posting) error(404, 'Job posting not found')
	const board = await db.jobBoard.findFirst({
		where: { id: jobBoardId, organizationId },
		select: { id: true }
	})
	if (!board) error(404, 'Job board not found')

	const cleanUrl = input.url?.trim() || null

	// One transaction: a failed audit write must not leave the channel change standing unrecorded.
	// The existing-row read sits inside it too — both branches decide what to write from it.
	await db.$transaction(async (tx) => {
		const existing = await tx.jobPostingChannel.findUnique({
			where: { jobPostingId_jobBoardId: { jobPostingId, jobBoardId } },
			select: { id: true, status: true }
		})

		if (input.posted) {
			await tx.jobPostingChannel.upsert({
				where: { jobPostingId_jobBoardId: { jobPostingId, jobBoardId } },
				create: {
					jobPostingId,
					jobBoardId,
					status: 'POSTED',
					url: cleanUrl,
					postedAt: new Date(),
					postedById: ctx.actorId
				},
				update: {
					status: 'POSTED',
					url: cleanUrl,
					takenDownAt: null,
					postedById: ctx.actorId,
					// Keep the original posted date when it was already live (a mere URL edit);
					// stamp a fresh one when (re)posting a new or taken-down board.
					...(existing?.status === 'POSTED' ? {} : { postedAt: new Date() })
				}
			})
		} else {
			// Nothing to take down if it was never posted.
			if (!existing) return
			await tx.jobPostingChannel.update({
				where: { id: existing.id },
				data: { status: 'TAKEN_DOWN', takenDownAt: new Date() }
			})
		}

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'JobPostingChannel',
				entityId: `${jobPostingId}:${jobBoardId}`,
				newValue: { posted: input.posted, url: cleanUrl }
			},
			tx
		)
	})
}
