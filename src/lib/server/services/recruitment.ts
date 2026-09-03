import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { error } from '@sveltejs/kit'
import { Prisma } from '@prisma/client'
import { createEmployee } from './employees'
import { generateTempPassword } from '$lib/server/password'
import { sendInterviewScheduledEmail } from '$lib/server/notifications'
import { notify } from './notifications'
import { resolvePostingApproverId } from './posting-approvers'
import { canAny } from '$lib/rbac'
import type { AuditContext } from './types'
import type { JobPostingStatus, ApplicantStage, InterviewMode, Role } from '@prisma/client'

export async function countJobPostings(organizationId: string, status?: JobPostingStatus) {
	return db.jobPosting.count({ where: { organizationId, ...(status && { status }) } })
}

export async function listJobPostings(
	organizationId: string,
	status?: JobPostingStatus,
	pageArgs?: { skip: number; take: number }
) {
	return db.jobPosting.findMany({
		where: { organizationId, ...(status && { status }) },
		include: {
			department: { select: { name: true } },
			_count: { select: { applicants: true } }
		},
		orderBy: { createdAt: 'desc' },
		...(pageArgs && { skip: pageArgs.skip, take: pageArgs.take })
	})
}

export async function getJobPosting(id: string, organizationId: string) {
	const jp = await db.jobPosting.findFirst({
		where: { id, organizationId },
		include: {
			department: true,
			applicants: {
				include: { stageHistory: { orderBy: { changedAt: 'desc' }, take: 1 } },
				orderBy: { createdAt: 'desc' }
			}
		}
	})
	if (!jp) error(404, 'Job posting not found')
	return jp
}

export async function createJobPosting(
	organizationId: string,
	input: { departmentId: string; title: string; description: string },
	ctx: AuditContext
) {
	// One transaction: a failed audit write must not leave the new posting standing unrecorded.
	return await db.$transaction(async (tx) => {
		const jp = await tx.jobPosting.create({
			data: { organizationId, ...input, createdById: ctx.actorId }
		})

		await writeAuditLog(
			ctx,
			{
				action: 'CREATE',
				entityType: 'JobPosting',
				entityId: jp.id,
				newValue: { title: input.title }
			},
			tx
		)

		return jp
	})
}

// A posting must be approved before it goes OPEN (#195). Submitting sends a DRAFT to
// PENDING_APPROVAL and pings the department's approver (or HR when none is mapped).
export async function submitJobPostingForApproval(
	id: string,
	organizationId: string,
	ctx: AuditContext
) {
	const jp = await db.jobPosting.findFirst({ where: { id, organizationId } })
	if (!jp) error(404, 'Job posting not found')
	if (jp.status !== 'DRAFT') error(400, 'Only draft postings can be submitted for approval')

	// One transaction: a failed audit write must not leave the status change standing unrecorded.
	const updated = await db.$transaction(async (tx) => {
		const u = await tx.jobPosting.update({
			where: { id },
			data: { status: 'PENDING_APPROVAL', submittedById: ctx.actorId, rejectionReason: null }
		})

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'JobPosting',
				entityId: id,
				newValue: { status: 'PENDING_APPROVAL' }
			},
			tx
		)

		return u
	})

	// Notify the resolved approver so it lands on their dashboard; HR-fallback postings are
	// picked up by any HR admin from their own pending-approvals view.
	const approverEmployeeId = await resolvePostingApproverId(organizationId, jp.departmentId)
	if (approverEmployeeId) {
		const approver = await db.employee.findUnique({
			where: { id: approverEmployeeId },
			select: { userId: true }
		})
		// Not when the resolved approver IS the submitter (D9): they are barred from deciding it, so
		// the notification would only invite a 403. The 403's own message carries the way out.
		if (approver && approver.userId !== ctx.actorId) {
			await notify(
				approver.userId,
				`A job posting “${jp.title}” is awaiting your approval.`,
				'/dashboard',
				'RECRUITMENT'
			)
		}
	}

	return updated
}

// Whether `actor` may decide the posting: the department's designated approver, or — only when
// no approver is mapped — any HR admin.
export function canApprovePosting(
	resolvedApproverEmployeeId: string | null,
	actorEmployeeId: string | null,
	actorRoles: Role[]
): boolean {
	if (resolvedApproverEmployeeId && actorEmployeeId === resolvedApproverEmployeeId) return true
	// #283/D8: HR is the FALLBACK, not an override. `return canAny(actorRoles, 'MANAGE_HR')` used
	// to sit below this line and answered the same question unconditionally, which made this branch
	// unreachable and the department mapping decorative. A mapped department is now decidable only
	// by its designated approver; only an UNMAPPED one falls back to HR — which is what this
	// function's comment and posting-approvers.ts:6-11 always claimed.
	return !resolvedApproverEmployeeId && canAny(actorRoles, 'MANAGE_HR')
}

// Approve (→ OPEN) or reject (→ back to DRAFT with a reason) a pending posting. `actor`
// carries the deciding user's employee id + roles for the authorization check.
export async function decideJobPosting(
	id: string,
	organizationId: string,
	decision: { approve: boolean; note?: string },
	actor: { employeeId: string | null; roles: Role[] },
	ctx: AuditContext
) {
	const jp = await db.jobPosting.findFirst({ where: { id, organizationId } })
	if (!jp) error(404, 'Job posting not found')
	if (jp.status !== 'PENDING_APPROVAL') error(400, 'This posting is not awaiting approval')

	const approverEmployeeId = await resolvePostingApproverId(organizationId, jp.departmentId)
	if (!canApprovePosting(approverEmployeeId, actor.employeeId, actor.roles)) {
		error(403, 'You are not the approver for this posting')
	}
	// #283/F4: submitJobPostingForApproval records submittedById and nothing has ever read it back
	// at decision time. One person could submit and approve the same posting.
	//
	// D9: there is deliberately NO HR-steps-in fallback. If a department's designated approver
	// submits a posting for their own department, that posting is undecidable until HR remaps or
	// unmaps the department — so the message must NAME that route, or the user is stranded with a
	// 403 and no next action. (submittedById and ctx.actorId are both USER ids; approverEmployeeId
	// and actor.employeeId are EMPLOYEE ids — the two families are never compared.)
	if (jp.submittedById && jp.submittedById === ctx.actorId) {
		// The next action depends on which branch of canApprovePosting let this actor through. Only
		// a MAPPED department is stuck behind a remap; an UNMAPPED one falls back to HR, so any
		// OTHER MANAGE_HR holder can simply decide it — telling them to remap would send them to
		// change a mapping that does not exist.
		error(
			403,
			approverEmployeeId
				? 'You submitted this posting, so you cannot decide it. Ask HR to reassign this department’s posting approver in Settings → Posting approvers.'
				: 'You submitted this posting, so you cannot decide it. Another HR admin must decide it.'
		)
	}
	if (!decision.approve && !decision.note?.trim()) {
		error(400, 'A reason is required to send a posting back to draft')
	}

	// One transaction: a failed audit write must not leave the decision standing unrecorded.
	const updated = await db.$transaction(async (tx) => {
		const u = await tx.jobPosting.update({
			where: { id },
			data: decision.approve
				? { status: 'OPEN', postedAt: new Date(), approvedById: ctx.actorId, rejectionReason: null }
				: { status: 'DRAFT', rejectionReason: decision.note!.trim() }
		})

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'JobPosting',
				entityId: id,
				newValue: { status: u.status, ...(decision.approve ? {} : { rejected: true }) }
			},
			tx
		)

		return u
	})

	// Tell whoever submitted it the outcome.
	if (jp.submittedById) {
		await notify(
			jp.submittedById,
			decision.approve
				? `Your job posting “${jp.title}” was approved and is now open.`
				: `Your job posting “${jp.title}” was sent back to draft: ${decision.note!.trim()}`,
			'/recruitment',
			'RECRUITMENT'
		)
	}

	return updated
}

// Pending postings this user may act on — the departments they're the approver for, plus
// (for HR) any posting whose department has no approver mapped, minus anything they submitted
// themselves. Feeds the dashboard card. `actorUserId` is a USER id (it is matched against
// submittedById); `actorEmployeeId` is an EMPLOYEE id.
export async function listPostingsAwaitingApprover(
	organizationId: string,
	actorEmployeeId: string | null,
	actorRoles: Role[],
	actorUserId: string,
	limit?: number
) {
	const pending = await db.jobPosting.findMany({
		where: { organizationId, status: 'PENDING_APPROVAL' },
		include: { department: { select: { name: true } } },
		orderBy: { updatedAt: 'asc' }
	})
	if (!pending.length) return []

	const mappings = await db.postingApprover.findMany({
		where: { organizationId },
		select: { departmentId: true, approverId: true }
	})
	const approverByDept = new Map(mappings.map((m) => [m.departmentId, m.approverId]))

	const approvable = pending.filter((p) => {
		const approver = approverByDept.get(p.departmentId) ?? null
		// The trailing `&& (approver != null || isHr)` that used to live here existed only
		// because canApprovePosting said yes to every HR admin. With the mapping bound it can
		// never change the result — see plan DECISION-8 for the branch-by-branch proof.
		// The submitter filter mirrors the service guard so the card never offers a posting
		// the action would refuse (same discipline as AC-15 for requests).
		return (
			canApprovePosting(approver, actorEmployeeId, actorRoles) && p.submittedById !== actorUserId
		)
	})

	// The cut goes on the APPROVABLE set, never as a query `take`. The filter above drops postings
	// this actor cannot decide and postings they submitted themselves, so a take would cap the
	// pending queue first and hand back fewer approvable rows than the cap asked for — five
	// unapprovable rows at the front would eat half a cap of ten. The query's
	// `orderBy: { updatedAt: 'asc' }` is already oldest-first, which is the right order to keep
	// under a cap: the longest-waiting postings stay visible.
	return approvable.slice(0, limit ?? approvable.length).map((p) => ({
		id: p.id,
		title: p.title,
		department: p.department.name,
		submittedAt: p.updatedAt
	}))
}

export async function applyToPosting(
	jobPostingId: string,
	organizationId: string,
	input: {
		firstName: string
		lastName: string
		email: string
		phone?: string
		coverLetter?: string
	}
) {
	// Org-scoped: this is the HR-facing "add applicant" flow, so the posting must belong
	// to the caller's organization. Existence and OPEN status were already re-checked
	// here, but without the scope an HR admin could write an applicant onto another
	// organization's posting by id.
	const jp = await db.jobPosting.findFirst({ where: { id: jobPostingId, organizationId } })
	if (!jp || jp.status !== 'OPEN') error(400, 'This position is not accepting applications')

	return db.applicant.create({
		data: { jobPostingId, ...input }
	})
}

export async function advanceApplicant(
	applicantId: string,
	organizationId: string,
	stage: ApplicantStage,
	notes: string | undefined,
	ctx: AuditContext
) {
	const applicant = await db.applicant.findFirst({
		where: { id: applicantId, jobPosting: { organizationId } }
	})
	if (!applicant) error(404, 'Applicant not found')

	const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
		const a = await tx.applicant.update({
			where: { id: applicantId },
			data: { currentStage: stage }
		})

		await tx.applicantStageHistory.create({
			data: { applicantId, stage, notes, changedById: ctx.actorId }
		})

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'Applicant',
				entityId: applicantId,
				newValue: { stage }
			},
			tx
		)

		return a
	})

	return updated
}

// ─── Interviews & Offers (T177 / FR-068, FR-069) ─────────────────────────────

// Ensures the applicant exists within the actor's organization.
async function requireApplicant(applicantId: string, organizationId: string) {
	const applicant = await db.applicant.findFirst({
		where: { id: applicantId, jobPosting: { organizationId } }
	})
	if (!applicant) error(404, 'Applicant not found')
	return applicant
}

export async function getApplicant(applicantId: string, organizationId: string) {
	const applicant = await db.applicant.findFirst({
		where: { id: applicantId, jobPosting: { organizationId } },
		include: {
			jobPosting: { include: { department: true } },
			interviews: { orderBy: { scheduledAt: 'desc' } },
			offer: { include: { department: true } },
			stageHistory: { orderBy: { changedAt: 'desc' } },
			convertedEmployee: { select: { id: true } }
		}
	})
	if (!applicant) error(404, 'Applicant not found')
	return applicant
}

export async function scheduleInterview(
	applicantId: string,
	organizationId: string,
	input: { scheduledAt: Date; mode: InterviewMode; interviewer: string; location?: string | null },
	ctx: AuditContext
) {
	const applicant = await requireApplicant(applicantId, organizationId)

	// One transaction: the interview, the stage nudge and the audit row commit together, so a
	// failed audit write cannot leave a booked interview standing unrecorded.
	const interview = await db.$transaction(async (tx) => {
		const created = await tx.interview.create({
			data: {
				applicantId,
				scheduledAt: input.scheduledAt,
				mode: input.mode,
				interviewer: input.interviewer,
				location: input.location ?? null,
				createdById: ctx.actorId
			}
		})

		// Nudge the applicant into the INTERVIEW stage if they're still earlier.
		if (applicant.currentStage === 'APPLIED' || applicant.currentStage === 'SCREENING') {
			await tx.applicant.update({ where: { id: applicantId }, data: { currentStage: 'INTERVIEW' } })
			await tx.applicantStageHistory.create({
				data: {
					applicantId,
					stage: 'INTERVIEW',
					notes: 'Interview scheduled',
					changedById: ctx.actorId
				}
			})
		}

		await writeAuditLog(
			ctx,
			{
				action: 'CREATE',
				entityType: 'Interview',
				entityId: created.id,
				newValue: { applicantId, scheduledAt: input.scheduledAt.toISOString(), mode: input.mode }
			},
			tx
		)

		return created
	})

	// Email the details to the applicant and to HR (#196). The applicant row carries their
	// name/email; HR is every active HR admin in the org. Best-effort: a notifier hiccup must
	// not roll back a booked interview, so failures are logged, not thrown.
	try {
		const [jobPosting, hrUsers] = await Promise.all([
			db.jobPosting.findUnique({
				where: { id: applicant.jobPostingId },
				select: { title: true }
			}),
			db.user.findMany({
				where: {
					organizationId,
					isActive: true,
					roles: { has: 'HR_ADMIN' }
				},
				select: { email: true }
			})
		])

		const details = {
			applicantName: `${applicant.firstName} ${applicant.lastName}`,
			jobTitle: jobPosting?.title ?? 'the role',
			scheduledAt: input.scheduledAt,
			mode: input.mode,
			interviewer: input.interviewer,
			location: input.location ?? null
		}

		sendInterviewScheduledEmail(applicant.email, 'applicant', details)
		for (const hr of hrUsers) sendInterviewScheduledEmail(hr.email, 'hr', details)
	} catch (e) {
		console.error('[NOTIFY] Failed to email interview details for', interview.id, e)
	}

	return interview
}

export async function recordInterviewFeedback(
	interviewId: string,
	organizationId: string,
	feedback: string,
	ctx: AuditContext
) {
	const interview = await db.interview.findFirst({
		where: { id: interviewId, applicant: { jobPosting: { organizationId } } },
		include: { applicant: { select: { currentStage: true } } }
	})
	if (!interview) error(404, 'Interview not found')

	// One transaction: the feedback, its timeline entry and the audit row commit together.
	const updated = await db.$transaction(async (tx) => {
		const u = await tx.interview.update({ where: { id: interviewId }, data: { feedback } })

		// Surface the feedback in the stage-history timeline (keeps the current stage).
		await tx.applicantStageHistory.create({
			data: {
				applicantId: interview.applicantId,
				stage: interview.applicant.currentStage,
				notes: 'Interview feedback recorded',
				changedById: ctx.actorId
			}
		})

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'Interview',
				entityId: interviewId,
				newValue: { feedbackRecorded: true }
			},
			tx
		)

		return u
	})
	return updated
}

export async function deleteInterview(
	interviewId: string,
	organizationId: string,
	ctx: AuditContext
) {
	const interview = await db.interview.findFirst({
		where: { id: interviewId, applicant: { jobPosting: { organizationId } } },
		include: { applicant: { select: { currentStage: true } } }
	})
	if (!interview) error(404, 'Interview not found')

	// One transaction: the delete, the roll-back-to-SCREENING it may trigger and the audit row
	// commit together. The remaining-interview count reads inside it too — the decision below
	// depends on it, so two concurrent deletes must not both see the same count.
	await db.$transaction(async (tx) => {
		await tx.interview.delete({ where: { id: interviewId } })

		// If that was the last interview and the applicant is still at the INTERVIEW
		// stage (scheduling had auto-advanced them), send them back to SCREENING.
		const remaining = await tx.interview.count({ where: { applicantId: interview.applicantId } })
		if (remaining === 0 && interview.applicant.currentStage === 'INTERVIEW') {
			await tx.applicant.update({
				where: { id: interview.applicantId },
				data: { currentStage: 'SCREENING' }
			})
			await tx.applicantStageHistory.create({
				data: {
					applicantId: interview.applicantId,
					stage: 'SCREENING',
					notes: 'Interview removed',
					changedById: ctx.actorId
				}
			})
		}

		await writeAuditLog(
			ctx,
			{ action: 'DELETE', entityType: 'Interview', entityId: interviewId },
			tx
		)
	})
}

export async function issueOffer(
	applicantId: string,
	organizationId: string,
	input: {
		jobTitle: string
		departmentId?: string | null
		monthlySalary: number
		startDate: Date
		notes?: string | null
	},
	ctx: AuditContext
) {
	const applicant = await db.applicant.findFirst({
		where: { id: applicantId, jobPosting: { organizationId } },
		include: { offer: true }
	})
	if (!applicant) error(404, 'Applicant not found')
	if (applicant.convertedToEmployeeId) error(409, 'Applicant already converted to an employee')
	if (applicant.offer?.status === 'ACCEPTED') error(409, 'This offer has already been accepted')

	// Re-issuing replaces a prior sent/declined offer (one offer per applicant).
	const data = {
		jobTitle: input.jobTitle,
		departmentId: input.departmentId ?? null,
		monthlySalary: input.monthlySalary,
		startDate: input.startDate,
		notes: input.notes ?? null
	}
	// One transaction: the offer, the stage move and the audit row commit together.
	const offer = await db.$transaction(async (tx) => {
		const o = await tx.offer.upsert({
			where: { applicantId },
			create: { applicantId, ...data, status: 'SENT', createdById: ctx.actorId },
			update: { ...data, status: 'SENT', respondedAt: null }
		})

		if (applicant.currentStage !== 'OFFER' && applicant.currentStage !== 'HIRED') {
			await tx.applicant.update({ where: { id: applicantId }, data: { currentStage: 'OFFER' } })
			await tx.applicantStageHistory.create({
				data: { applicantId, stage: 'OFFER', notes: 'Offer issued', changedById: ctx.actorId }
			})
		}

		await writeAuditLog(
			ctx,
			{
				action: 'CREATE',
				entityType: 'Offer',
				entityId: o.id,
				newValue: { jobTitle: input.jobTitle, monthlySalary: input.monthlySalary }
			},
			tx
		)

		return o
	})
	return offer
}

export async function respondToOffer(
	offerId: string,
	organizationId: string,
	accepted: boolean,
	ctx: AuditContext
) {
	const offer = await db.offer.findFirst({
		where: { id: offerId, applicant: { jobPosting: { organizationId } } }
	})
	if (!offer) error(404, 'Offer not found')
	if (offer.status !== 'SENT') error(400, 'This offer has already been responded to')

	const status = accepted ? 'ACCEPTED' : 'DECLINED'
	const newStage = accepted ? 'HIRED' : 'REJECTED'

	const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
		const o = await tx.offer.update({
			where: { id: offerId },
			data: { status, respondedAt: new Date() }
		})
		await tx.applicant.update({
			where: { id: offer.applicantId },
			data: { currentStage: newStage }
		})
		await tx.applicantStageHistory.create({
			data: {
				applicantId: offer.applicantId,
				stage: newStage,
				notes: accepted ? 'Offer accepted' : 'Offer declined',
				changedById: ctx.actorId
			}
		})

		await writeAuditLog(
			ctx,
			{
				action: 'UPDATE',
				entityType: 'Offer',
				entityId: offerId,
				newValue: { status }
			},
			tx
		)

		return o
	})
	return updated
}

// Withdraw a job offer and roll the applicant back to their prior stage.
export async function deleteOffer(offerId: string, organizationId: string, ctx: AuditContext) {
	const offer = await db.offer.findFirst({
		where: { id: offerId, applicant: { jobPosting: { organizationId } } },
		include: {
			applicant: { select: { id: true, currentStage: true, convertedToEmployeeId: true } }
		}
	})
	if (!offer) error(404, 'Offer not found')
	if (offer.applicant.convertedToEmployeeId)
		error(409, 'Cannot withdraw — the applicant has already been converted to an employee.')

	// One transaction: the withdrawal, the stage roll-back and the audit row commit together. The
	// interview count reads inside it too — the stage it picks depends on that count.
	await db.$transaction(async (tx) => {
		await tx.offer.delete({ where: { id: offerId } })

		// Roll back from OFFER/HIRED to the most recent meaningful stage.
		if (offer.applicant.currentStage === 'OFFER' || offer.applicant.currentStage === 'HIRED') {
			const hasInterviews =
				(await tx.interview.count({ where: { applicantId: offer.applicantId } })) > 0
			const stage = hasInterviews ? 'INTERVIEW' : 'SCREENING'
			await tx.applicant.update({ where: { id: offer.applicantId }, data: { currentStage: stage } })
			await tx.applicantStageHistory.create({
				data: {
					applicantId: offer.applicantId,
					stage,
					notes: 'Offer withdrawn',
					changedById: ctx.actorId
				}
			})
		}

		await writeAuditLog(ctx, { action: 'DELETE', entityType: 'Offer', entityId: offerId }, tx)
	})
}

// Transition an applicant into an employee record (onboarding). When an accepted
// offer exists, its terms (job title, salary, start date, department) flow straight
// in — no manual re-entry (FR-069). Falls back to defaults otherwise.
export async function convertApplicantToEmployee(
	applicantId: string,
	organizationId: string,
	ctx: AuditContext
) {
	const applicant = await db.applicant.findFirst({
		where: { id: applicantId, jobPosting: { organizationId } },
		include: { offer: true, jobPosting: { select: { title: true, departmentId: true } } }
	})
	if (!applicant) error(404, 'Applicant not found')
	if (applicant.convertedToEmployeeId) error(409, 'Applicant already converted to an employee')

	// An accepted offer carries the real job title, department, salary, and start date. Without one
	// there is no salary source (a job posting has none), so refuse rather than hire at ₱0.
	const offer = applicant.offer?.status === 'ACCEPTED' ? applicant.offer : null
	if (!offer) {
		error(
			400,
			'This applicant has no accepted offer. Create and accept an offer — it sets the job title, salary, and start date — before converting.'
		)
	}

	// Offer department is optional; fall back to the posting's department (always set).
	const departmentId = offer.departmentId ?? applicant.jobPosting.departmentId

	const employee = await createEmployee(
		organizationId,
		{
			email: applicant.email,
			password: generateTempPassword(),
			role: 'EMPLOYEE',
			firstName: applicant.firstName,
			lastName: applicant.lastName,
			departmentId,
			jobTitle: offer.jobTitle,
			employmentType: 'PROBATIONARY',
			startDate: offer.startDate,
			basicMonthlySalary: Number(offer.monthlySalary),
			contactPhone: applicant.phone ?? undefined
		},
		ctx
	)

	await db.applicant.update({
		where: { id: applicantId },
		data: { convertedToEmployeeId: employee.id, currentStage: 'HIRED' }
	})

	return employee
}

/**
 * #197 — the Recruitment row mapper for the Detailed Reports section. One row per job POSTING:
 * its funnel counts plus how long it stayed open.
 *
 * Only postings that were actually published appear. The range filters on `postedAt`, so DRAFT
 * and PENDING_APPROVAL postings are out by construction — they have no `postedAt`. A posting
 * nobody published is not recruitment activity, and including it would put blank Posted and
 * DaysOpen cells in a CSV that is meant to be summed.
 *
 * TitleCase keys: the report table renders `row[column]` and the CSV export uses the keys as its
 * headers, matching every other report generator. A renamed key is a silently broken export, not
 * a type error.
 */
export async function generateRecruitmentReport(
	organizationId: string,
	range: { startDate: Date; endDate: Date; departmentId?: string }
) {
	const postings = await db.jobPosting.findMany({
		where: {
			organizationId,
			postedAt: { gte: range.startDate, lte: range.endDate },
			...(range.departmentId && { departmentId: range.departmentId })
		},
		orderBy: { postedAt: 'desc' },
		include: {
			department: { select: { name: true } },
			applicants: { select: { currentStage: true, stageHistory: { select: { stage: true } } } }
		}
	})

	const DAY_MS = 86_400_000
	const now = Date.now()

	return postings.map((p) => {
		// REACHED interview, not sitting at it: someone interviewed and then rejected still counts,
		// and `currentStage` has already moved on by then. `stageHistory` is the only record that
		// survives the move, so the funnel has to be read from there.
		const interviewed = p.applicants.filter((a) =>
			a.stageHistory.some((h) => h.stage === 'INTERVIEW')
		).length
		// `currentStage` is right for HIRED — it is terminal, so there is nothing to move on to.
		const hired = p.applicants.filter((a) => a.currentStage === 'HIRED').length
		// An OPEN posting is still accruing days, so it measures against today, not against a
		// close date it does not have yet.
		const until = p.closedAt ? p.closedAt.getTime() : now
		return {
			Title: p.title,
			Department: p.department?.name ?? '',
			Status: p.status,
			Posted: p.postedAt ? p.postedAt.toISOString().slice(0, 10) : '',
			Closed: p.closedAt ? p.closedAt.toISOString().slice(0, 10) : '',
			Applicants: p.applicants.length,
			Interviewed: interviewed,
			Hired: hired,
			DaysOpen: p.postedAt ? Math.max(0, Math.round((until - p.postedAt.getTime()) / DAY_MS)) : 0
		}
	})
}
