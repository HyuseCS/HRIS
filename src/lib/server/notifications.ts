// Outbound email. `build*` assembles subject/body and is the unit-tested part; `send*`
// hands that to `deliver`, the single delivery point in $lib/server/mailer (#178 item 162).
// Every `send*` here is deliberately a synchronous `void` function called WITHOUT `await`:
// delivery is fire-and-forget and can never fail the request that triggered it.
//
// Passwords never appear in logs OR IN AN EMAIL BODY (#96): even a "development-only"
// console line ends up in log aggregators and container stdout captures, and the text now
// leaves the process entirely, so the constraint is stricter than before, not looser. The
// parameter is kept so callers still hand the credential through the seam, but it must be
// delivered out-of-band.
import { deliver } from './mailer'

export function sendWelcomeEmail(email: string, _tempPassword: string): void {
	// `_tempPassword` is INTENTIONALLY not interpolated anywhere below. Do not "improve" this.
	deliver(
		email,
		'Your Veent HRIS account is ready',
		[
			'Hello,',
			'',
			'Your Veent HRIS account has been created.',
			'Your temporary password is provided separately by your HR contact — it is never sent by email.',
			'',
			'Please sign in and change it as soon as you can.'
		].join('\n')
	)
}

// ─── Onboarding Discord invitation (#186) ─────────────────────────────────────
// New hires are emailed an invitation to the company's Discord server. Sent to their
// working email (company-email provisioning is deferred). Body assembled here so a real
// mailer only delivers subject/body, and the wording is unit-tested.
export function buildDiscordInvite(d: { firstName: string; orgName: string; inviteUrl: string }): {
	subject: string
	body: string
} {
	return {
		subject: `Join the ${d.orgName} Discord server`,
		body: [
			`Hi ${d.firstName},`,
			'',
			`Welcome to ${d.orgName}! Join our Discord server to connect with the team:`,
			d.inviteUrl,
			'',
			'See you there!'
		].join('\n')
	}
}

export function sendDiscordInviteEmail(
	recipient: string,
	details: { firstName: string; orgName: string; inviteUrl: string }
): void {
	const { subject, body } = buildDiscordInvite(details)
	deliver(recipient, subject, body)
}

export function sendTimesheetStatusEmail(email: string, status: string): void {
	deliver(email, `Timesheet ${status}`, `Your timesheet has been ${status}.`)
}

export function sendLeaveStatusEmail(email: string, status: string, reason?: string): void {
	deliver(
		email,
		`Leave request ${status}`,
		[`Your leave request has been ${status}.`, ...(reason ? ['', `Reason: ${reason}`] : [])].join(
			'\n'
		)
	)
}

import { manilaDateTime, formatDateDisplay } from '$lib/utils/dates'
import { CLEARANCE_AREA_LABELS } from '$lib/utils/clearance-area'
import type { ClearanceArea, InterviewMode } from '@prisma/client'

// ─── Interview scheduling (#196) ──────────────────────────────────────────────
// When an interview is booked, both the applicant and HR get an email with the
// full details. The message body is assembled here (not at the call site) so a
// real mailer only has to deliver `subject`/`body`, and the wording is unit-tested.

export interface InterviewEmailDetails {
	applicantName: string
	jobTitle: string
	scheduledAt: Date
	mode: InterviewMode
	interviewer: string
	/** Room / address for ONSITE, meeting link for VIDEO, number for PHONE. */
	location: string | null
}

const MODE_LABEL: Record<InterviewMode, string> = {
	ONSITE: 'On-site',
	VIDEO: 'Video call',
	PHONE: 'Phone call'
}

// The label for the `location` line depends on the mode — an address for on-site,
// a link for video, a number for phone.
const MODE_LOCATION_LABEL: Record<InterviewMode, string> = {
	ONSITE: 'Location',
	VIDEO: 'Meeting link',
	PHONE: 'Phone number'
}

/**
 * Build the subject and body for an interview-scheduled email. `audience` tailors the
 * greeting: the applicant is addressed directly, HR gets a heads-up about the candidate.
 */
export function buildInterviewEmail(
	audience: 'applicant' | 'hr',
	d: InterviewEmailDetails
): { subject: string; body: string } {
	const when = manilaDateTime(d.scheduledAt)
	const lines = [
		`Position: ${d.jobTitle}`,
		`When: ${when}`,
		`Mode: ${MODE_LABEL[d.mode]}`,
		`Interviewer: ${d.interviewer}`
	]
	if (d.location) lines.push(`${MODE_LOCATION_LABEL[d.mode]}: ${d.location}`)

	if (audience === 'applicant') {
		return {
			subject: `Interview scheduled — ${d.jobTitle}`,
			body: [
				`Hi ${d.applicantName},`,
				'',
				'Your interview has been scheduled. Details:',
				'',
				...lines,
				'',
				'Please reply to this email if you need to reschedule. Good luck!'
			].join('\n')
		}
	}
	return {
		subject: `Interview scheduled — ${d.applicantName} (${d.jobTitle})`,
		body: [`An interview with ${d.applicantName} has been scheduled. Details:`, '', ...lines].join(
			'\n'
		)
	}
}

// ─── Offboarding transition notice (#185) ─────────────────────────────────────
// When a separation is opened, the departing employee gets a due-diligence /
// transition-period notice by email: their effective date and the clearance
// checklist they must complete before it. The body is assembled here (not at the
// call site) so a real mailer only delivers subject/body, and the wording is tested.
export interface OffboardingNoticeDetails {
	employeeName: string
	effectiveDate: Date
	/** Clearance tasks the employee must complete, each with the owning clearance area. */
	checklist: { label: string; area: ClearanceArea }[]
}

/** Build the subject and body for the transition-period due-diligence notice. */
export function buildOffboardingNotice(d: OffboardingNoticeDetails): {
	subject: string
	body: string
} {
	const when = formatDateDisplay(d.effectiveDate)
	const tasks = d.checklist.length
		? d.checklist.map((c) => `  • ${c.label} (${CLEARANCE_AREA_LABELS[c.area]})`)
		: ['  • (No clearance items configured — HR will advise.)']
	return {
		subject: `Transition & clearance details — effective ${when}`,
		body: [
			`Hi ${d.employeeName},`,
			'',
			`This is a due-diligence notice regarding your transition, effective ${when}.`,
			'During the transition period, please complete the following clearance items:',
			'',
			...tasks,
			'',
			'HR will sign each item off as it is completed. Reach out to your HR contact with any questions.'
		].join('\n')
	}
}

export function sendInterviewScheduledEmail(
	recipient: string,
	audience: 'applicant' | 'hr',
	details: InterviewEmailDetails
): void {
	const { subject, body } = buildInterviewEmail(audience, details)
	deliver(recipient, subject, body)
}

export function sendOffboardingNoticeEmail(
	recipient: string,
	details: OffboardingNoticeDetails
): void {
	const { subject, body } = buildOffboardingNotice(details)
	deliver(recipient, subject, body)
}

// ─── Performance review reminders (#178, plan item 163) ───────────────────────
// Only the two email-carrying reminder kinds have a message here. `due-soon` and
// `awaiting-ack` are in-app only by design — see `remindersDue` in
// src/lib/server/performance/reminder-plan.ts, which owns that channel split.
export type ReviewNoticeKind = 'opened' | 'overdue'

export interface ReviewNoticeDetails {
	recipientName: string
	/** The review cycle's generated label, e.g. "Aug–Sep 2026". */
	cycleName: string
	/** Absolute or app-relative link to the review. */
	reviewUrl: string
}

/** Build the subject and body for a review reminder. Wording is unit-tested. */
export function buildReviewNotice(
	kind: ReviewNoticeKind,
	d: ReviewNoticeDetails
): { subject: string; body: string } {
	if (kind === 'overdue') {
		return {
			subject: `Overdue: performance review for ${d.cycleName}`,
			body: [
				`Hi ${d.recipientName},`,
				'',
				`The performance review for ${d.cycleName} is now overdue.`,
				'Please complete it as soon as you can:',
				d.reviewUrl
			].join('\n')
		}
	}
	return {
		subject: `Performance review open — ${d.cycleName}`,
		body: [
			`Hi ${d.recipientName},`,
			'',
			`The performance review for ${d.cycleName} is open.`,
			'You can open it here:',
			d.reviewUrl
		].join('\n')
	}
}

export function sendReviewNoticeEmail(
	recipient: string,
	kind: ReviewNoticeKind,
	details: ReviewNoticeDetails
): void {
	const { subject, body } = buildReviewNotice(kind, details)
	deliver(recipient, subject, body)
}
