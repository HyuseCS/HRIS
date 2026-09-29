/**
 * One-off migration: copy legacy `leave_requests` rows into the unified `requests`
 * table (type = LEAVE). Idempotent — skips a leave row if a matching Request already
 * exists (same employee, dates, and leaveTypeId in payload). The legacy table is left
 * intact (dormant) so this is reversible; drop it in a later cleanup after QA.
 *
 * Run: bunx tsx scripts/migrate-leave-to-request.ts
 */
import { PrismaClient, type Prisma } from '@prisma/client'

const db = new PrismaClient()

// Legacy LeaveRequestStatus -> RequestStatus (CANCELLED/PENDING/APPROVED/REJECTED map 1:1).
const STATUS_MAP: Record<string, 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'> = {
	PENDING: 'PENDING',
	APPROVED: 'APPROVED',
	REJECTED: 'REJECTED',
	CANCELLED: 'CANCELLED'
}

async function main() {
	const legacy = await db.leaveRequest.findMany({
		include: { employee: { select: { reportsToId: true } } }
	})
	console.log(`Found ${legacy.length} legacy leave requests.`)

	let created = 0
	let skipped = 0

	for (const lr of legacy) {
		const existing = await db.request.findFirst({
			where: {
				employeeId: lr.employeeId,
				type: 'LEAVE',
				dateFrom: lr.startDate,
				dateTo: lr.endDate
			}
		})
		if (existing) {
			skipped++
			continue
		}

		const status = STATUS_MAP[lr.status] ?? 'PENDING'
		const payload = {
			type: 'LEAVE',
			leaveTypeId: lr.leaveTypeId,
			startDate: lr.startDate.toISOString(),
			endDate: lr.endDate.toISOString(),
			totalDays: Number(lr.totalDays),
			reason: lr.reason ?? undefined
		}

		// Rebuild the chain: Supervisor (if any) -> HR. For already-decided leave,
		// stamp the resolved outcome onto the terminal (HR) step so history reads true.
		const hasSupervisor = Boolean(lr.employee.reportsToId)
		const steps: Prisma.ApprovalStepCreateWithoutRequestInput[] = []
		let idx = 0
		if (hasSupervisor) {
			steps.push({
				stageIndex: idx++,
				stageKind: 'SUPERVISOR',
				role: null,
				decision: status === 'PENDING' ? null : 'APPROVED',
				decidedAt: status === 'PENDING' ? null : lr.reviewedAt
			})
		}
		steps.push({
			stageIndex: idx,
			stageKind: 'ROLE',
			role: 'HR_ADMIN',
			decision:
				status === 'PENDING'
					? null
					: status === 'REJECTED'
						? 'REJECTED'
						: status === 'APPROVED'
							? 'APPROVED'
							: null,
			actorId: lr.reviewedById ?? null,
			note: lr.rejectionReason ?? null,
			decidedAt: lr.reviewedAt ?? null
		})

		// currentStage: terminal for decided rows, else 0.
		const currentStage = status === 'PENDING' ? 0 : idx

		await db.request.create({
			data: {
				employeeId: lr.employeeId,
				type: 'LEAVE',
				status,
				dateFrom: lr.startDate,
				dateTo: lr.endDate,
				hours: null,
				reason: lr.reason,
				payload: payload as unknown as Prisma.InputJsonValue,
				currentStage,
				createdAt: lr.createdAt,
				steps: { create: steps }
			}
		})
		created++
	}

	console.log(`Migration complete: ${created} created, ${skipped} skipped (already present).`)
}

main()
	.catch((e) => {
		console.error('Migration failed:', e)
		process.exitCode = 1
	})
	.finally(() => db.$disconnect())
