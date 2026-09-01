import { db } from '$lib/server/db'
import type { Prisma } from '@prisma/client'
import { createRequest } from './requests'
import { decide } from './approvals'
import type { AuditContext } from './types'

// Leave is now a Request of type LEAVE (T168/T169). These wrappers keep the legacy
// service surface so existing leave routes/templates work: list rows are mapped back
// to the old {startDate, endDate, totalDays, leaveType} shape.

type LeaveRow = {
	id: string
	employeeId: string
	startDate: Date
	endDate: Date
	totalDays: number | null
	status: string
	reason: string | null
	employee: { id: string; firstName: string; lastName: string }
	leaveType: { name: string; isPaid: boolean }
}

export async function listLeaveRequests(params: {
	organizationId: string
	employeeId?: string
	status?: string
}): Promise<LeaveRow[]> {
	const rows = await db.request.findMany({
		where: {
			type: 'LEAVE',
			employee: { organizationId: params.organizationId },
			...(params.employeeId && { employeeId: params.employeeId }),
			...(params.status && { status: params.status as never })
		},
		include: { employee: { select: { id: true, firstName: true, lastName: true } } },
		orderBy: { createdAt: 'desc' }
	})

	const typeIds = [
		...new Set(
			rows
				.map((r) => (r.payload as { leaveTypeId?: string })?.leaveTypeId)
				.filter(Boolean) as string[]
		)
	]
	const types = typeIds.length
		? await db.leaveType.findMany({
				where: { id: { in: typeIds } },
				select: { id: true, name: true, isPaid: true }
			})
		: []
	const typeMap = new Map(types.map((t) => [t.id, t]))

	return rows.map((r) => {
		const payload = (r.payload ?? {}) as { leaveTypeId?: string; totalDays?: number }
		const lt = payload.leaveTypeId ? typeMap.get(payload.leaveTypeId) : undefined
		return {
			id: r.id,
			employeeId: r.employeeId,
			startDate: r.dateFrom as Date,
			endDate: r.dateTo as Date,
			totalDays: payload.totalDays ?? null,
			status: r.status,
			reason: r.reason,
			employee: r.employee,
			leaveType: { name: lt?.name ?? '—', isPaid: lt?.isPaid ?? false }
		}
	})
}

export async function requestLeave(
	employeeId: string,
	organizationId: string,
	input: { leaveTypeId: string; startDate: Date; endDate: Date; reason?: string },
	ctx: AuditContext
) {
	return createRequest(
		employeeId,
		organizationId,
		{
			type: 'LEAVE',
			leaveTypeId: input.leaveTypeId,
			startDate: input.startDate,
			endDate: input.endDate,
			reason: input.reason
		},
		ctx
	)
}

// Decide the current stage of a leave request. Multi-stage now: a manager approves
// the supervisor stage, HR the HR stage. Balance is deducted on final approval.
export async function reviewLeaveRequest(
	id: string,
	organizationId: string,
	approved: boolean,
	rejectionReason: string | undefined,
	ctx: AuditContext
) {
	const actor = await db.employee.findUnique({
		where: { userId: ctx.actorId },
		select: { id: true }
	})
	return decide(id, approved ? 'APPROVED' : 'REJECTED', rejectionReason, ctx, actor?.id ?? null)
}

export async function getLeaveBalances(employeeId: string, year: number) {
	return db.leaveBalance.findMany({
		where: { employeeId, year },
		include: {
			leaveType: { select: { name: true, isPaid: true, minMonthsOfService: true } }
		},
		orderBy: { leaveType: { name: 'asc' } }
	})
}

/**
 * Allocate the org's default leave entitlement to an employee for `year` (#137).
 *
 * Until now only the seed created LeaveBalance rows, so anyone onboarded through the UI
 * had none — and `assertLeaveBalance` treats a missing row as zero (#105), which turned
 * every first leave filing into "No leave balance on record. Contact HR". Onboarding now
 * allocates, which is what makes the 5/5/5 defaults actually reach a new hire.
 *
 * Idempotent: existing rows are left alone, so re-running never resets a partly-used
 * balance back to full. Pass `client` to enrol inside the caller's transaction.
 *
 * A tenure-gated type (SIL) is still allocated up front — the ledger stays uniform and
 * the gate lives at filing time, so nothing has to top the balance up on the anniversary.
 */
export async function ensureLeaveBalances(
	employeeId: string,
	organizationId: string,
	year: number = new Date().getFullYear(),
	client: Prisma.TransactionClient | typeof db = db
): Promise<number> {
	const [leaveTypes, existing] = await Promise.all([
		client.leaveType.findMany({
			where: { organizationId, isActive: true },
			select: { id: true, defaultDaysPerYear: true }
		}),
		client.leaveBalance.findMany({ where: { employeeId, year }, select: { leaveTypeId: true } })
	])

	const have = new Set(existing.map((b) => b.leaveTypeId))
	const missing = leaveTypes.filter((lt) => !have.has(lt.id))
	if (missing.length === 0) return 0

	// skipDuplicates covers the race where two onboarding writes land at once; the
	// (employeeId, leaveTypeId, year) unique index is the real backstop.
	const { count } = await client.leaveBalance.createMany({
		data: missing.map((lt) => ({
			employeeId,
			leaveTypeId: lt.id,
			year,
			allocated: lt.defaultDaysPerYear,
			used: 0,
			remaining: lt.defaultDaysPerYear
		})),
		skipDuplicates: true
	})
	return count
}

export interface OrgBalanceFilters {
	organizationId: string
	year: number
	departmentId?: string
	search?: string
}

/**
 * Every employee's balances for the HR-facing view (#137/#150), one row per employee with
 * their types nested. Active employees only — an offboarded 201 file keeps its ledger, but
 * it is noise on a page HR uses to answer "who can still take leave".
 */
export async function listOrgLeaveBalances(filters: OrgBalanceFilters) {
	const { organizationId, year, departmentId, search } = filters
	const term = search?.trim()

	return db.employee.findMany({
		where: {
			organizationId,
			employmentStatus: 'ACTIVE',
			...(departmentId && { departmentId }),
			...(term && {
				OR: [
					{ firstName: { contains: term, mode: 'insensitive' as const } },
					{ lastName: { contains: term, mode: 'insensitive' as const } },
					{ employeeNumber: { contains: term, mode: 'insensitive' as const } }
				]
			})
		},
		select: {
			id: true,
			employeeNumber: true,
			firstName: true,
			lastName: true,
			startDate: true,
			department: { select: { name: true } },
			leaveBalances: {
				where: { year },
				select: {
					id: true,
					allocated: true,
					used: true,
					remaining: true,
					leaveType: { select: { id: true, name: true, minMonthsOfService: true } }
				}
			}
		},
		orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
	})
}
