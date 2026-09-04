// One-off: make two UI/UX phase-3 test-pass dialogs reachable in the dev database.
//
//   pnpm tsx scripts/seed-uiux-demo.ts            # seed
//   pnpm tsx scripts/seed-uiux-demo.ts --clear    # remove what this script wrote
//
// Punch map dialog: PunchMapDialog.svelte only ever needs a punch's own
// { at, latitude, longitude, locationAccuracyM } — it never reads `source`, and it only
// ever maps ONE punch at a time (no second point needed). This script gives the existing
// TimeLog row cmtict1wz002bwtcblf760d8f (dino@jojo.ph, OUT) a real Manila coordinate so
// /punch's "View on map" trigger appears for it.
//
// Applicant stage-move dialog: ApplicantKanban.svelte shows a "Move to X" / "Reject" pair
// on any card whose stage is not HIRED/REJECTED. jp_seed_demo (from prisma/seed-core.ts) is
// CLOSED with zero applicants, so the board has nothing to click. This script reopens it and
// adds one applicant each at APPLIED, SCREENING, and INTERVIEW.
//
// Nothing here is destructive to real data: the punch update only ever touches the one named
// row's location fields, and --clear nulls them back out rather than deleting the punch.

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const PUNCH_ID = 'cmtict1wz002bwtcblf760d8f'
const JOB_POSTING_ID = 'jp_seed_demo'
// ponytail: hardcoded revert value — this is a known fixture whose seed-core.ts default is
// CLOSED, so --clear does not need to record the prior value separately.
const JOB_POSTING_CLEAR_STATUS = 'CLOSED' as const

// Marks every applicant this script writes, so --clear can find them again without
// touching any real applicant.
const SEED_EMAIL_DOMAIN = '@uiux-demo.invalid'

const APPLICANTS = [
	{ firstName: 'Aya', lastName: 'Bautista', stage: 'APPLIED' as const },
	{ firstName: 'Bea', lastName: 'Cruz', stage: 'SCREENING' as const },
	{ firstName: 'Carlo', lastName: 'Dizon', stage: 'INTERVIEW' as const }
]

async function main() {
	const clearOnly = process.argv.includes('--clear')

	if (clearOnly) {
		const seededIds = (
			await db.applicant.findMany({
				where: { email: { endsWith: SEED_EMAIL_DOMAIN } },
				select: { id: true }
			})
		).map((a) => a.id)
		await db.applicantStageHistory.deleteMany({ where: { applicantId: { in: seededIds } } })
		const removedApplicants = await db.applicant.deleteMany({
			where: { id: { in: seededIds } }
		})
		await db.jobPosting.update({
			where: { id: JOB_POSTING_ID },
			data: { status: JOB_POSTING_CLEAR_STATUS }
		})
		await db.timeLog.update({
			where: { id: PUNCH_ID },
			data: { latitude: null, longitude: null, locationAccuracyM: null, locationCapturedAt: null }
		})
		console.log(`✔ Cleared ${removedApplicants.count} seeded applicant(s).`)
		console.log(`✔ Reset ${JOB_POSTING_ID} status to ${JOB_POSTING_CLEAR_STATUS}.`)
		console.log(`✔ Cleared location on punch ${PUNCH_ID}.`)
		return
	}

	// Applicant stage histories reference a User id with no FK, so use a real HR_ADMIN user
	// in org Veent rather than inventing one.
	const veentOrg = await db.organization.findFirstOrThrow({
		where: { name: 'Veent' },
		select: { id: true }
	})
	const hrUser = await db.user.findFirst({
		where: {
			roles: { has: 'HR_ADMIN' },
			employee: { organizationId: veentOrg.id }
		},
		select: { id: true }
	})
	if (!hrUser) throw new Error('No HR_ADMIN user found in org Veent — run `pnpm db:seed` first.')

	const existingPunch = await db.timeLog.findUniqueOrThrow({
		where: { id: PUNCH_ID },
		select: { timestamp: true }
	})
	await db.timeLog.update({
		where: { id: PUNCH_ID },
		data: {
			latitude: 14.5995,
			longitude: 120.9842,
			locationAccuracyM: 12,
			locationCapturedAt: existingPunch.timestamp
		}
	})

	await db.jobPosting.update({ where: { id: JOB_POSTING_ID }, data: { status: 'OPEN' } })

	// Remove any prior run's applicants (and their stage history) before re-creating, so
	// re-running the seed is safe.
	const priorIds = (
		await db.applicant.findMany({
			where: { email: { endsWith: SEED_EMAIL_DOMAIN } },
			select: { id: true }
		})
	).map((a) => a.id)
	await db.applicantStageHistory.deleteMany({ where: { applicantId: { in: priorIds } } })
	await db.applicant.deleteMany({ where: { id: { in: priorIds } } })

	for (const a of APPLICANTS) {
		const email = `${a.firstName}.${a.lastName}${SEED_EMAIL_DOMAIN}`.toLowerCase()
		const applicant = await db.applicant.create({
			data: {
				jobPostingId: JOB_POSTING_ID,
				firstName: a.firstName,
				lastName: a.lastName,
				email,
				currentStage: a.stage
			}
		})
		await db.applicantStageHistory.create({
			data: { applicantId: applicant.id, stage: a.stage, changedById: hrUser.id }
		})
	}

	console.log(`✔ Set punch ${PUNCH_ID} location to 14.5995, 120.9842 (±12m).`)
	console.log(`✔ Set ${JOB_POSTING_ID} status to OPEN.`)
	console.log(`✔ Seeded ${APPLICANTS.length} applicant(s) at APPLIED / SCREENING / INTERVIEW.`)
	console.log('  Open /punch and /recruitment to see both dialogs.')
	console.log('  Run with --clear when the UI/UX test pass is done.')
}

main()
	.then(() => db.$disconnect())
	.catch(async (e) => {
		console.error(e)
		await db.$disconnect()
		process.exit(1)
	})
