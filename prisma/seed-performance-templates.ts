import { PrismaClient } from '@prisma/client'
import { pathToFileURL } from 'node:url'
import {
	blankTemplateStructure,
	newId,
	templateStructureSchema
} from '../src/lib/server/performance/schemas'
import type { TemplateStructure } from '../src/lib/server/performance/types'

/**
 * Seeds the two evaluation templates HR supplied (#178, plan §9), for every organization.
 *
 * Source: `docs/references/Copy of Veent Tix Performance Evaluation_{AE,Admin Staff}.md`.
 * STRUCTURE ONLY. The AE document arrived carrying a real employee's name, immediate head and
 * evaluation period; none of that is seeded here, and none of it may ever be.
 *
 * Seeded verbatim, INCLUDING the documents' own inconsistencies — the AE form's Section 3 which
 * prints no subtotal line at all (`maximum: null`), the Admin Staff form's duplicate
 * "Professional communication" criterion, and its Section 5 with four criteria against a printed
 * `/25`. Nothing computes against any of these; they are printed labels, and HR fixes them in the
 * builder in seconds. Inventing a "corrected" value here would be the app making an HR judgement
 * it was explicitly told not to make. The one exception is the Admin Staff weights, which the
 * owner confirmed as 30/20/20/15/15 — the document contradicts itself between its section headers
 * and its summary table.
 *
 * Idempotent: `update: {}`. A re-run never overwrites a template HR has since edited.
 */

function section(
	name: string,
	weightLabel: string,
	maximum: number | null,
	criteria: string[]
): TemplateStructure['sections'][number] {
	return {
		id: newId('sec'),
		name,
		weightLabel,
		maximum,
		criteria: criteria.map((text) => ({ id: newId('crit'), text }))
	}
}

/** Account Executive — 6 categories. Section 3 has no printed subtotal line in the source. */
export function accountExecutive(): TemplateStructure {
	return {
		...blankTemplateStructure(),
		sections: [
			section('SALES PERFORMANCE', '35%', 30, [
				'Achieves monthly sales target',
				'Number of new Event Organizers acquired',
				'Conversion rate from qualified leads',
				'Successfully closes partnership agreements',
				'Revenue contribution',
				'Pipeline management and follow-ups'
			]),
			section('CLIENT RELATIONSHIP MANAGEMENT', '20%', 25, [
				'Builds strong client relationships',
				'Maintains regular communication with organizers',
				'Handles client concerns professionally',
				'Client retention and repeat business',
				'Customer satisfaction'
			]),
			section('PRODUCT KNOWLEDGE & PRESENTATION', '15%', null, [
				'Knowledge of Veent Tix platform',
				'Explains platform features confidently',
				'Conducts effective product demonstrations',
				'Handles objections effectively',
				'Presents solutions based on client needs'
			]),
			section('COMMUNICATION & PROFESSIONALISM', '10%', 25, [
				'Professional communication',
				'Negotiation skills',
				'Timely responses',
				'Represents Veent positively',
				'Proper business etiquette'
			]),
			section('TEAMWORK & COLLABORATION', '10%', 25, [
				'Coordinates with Marketing',
				'Coordinates with Devs & Operations',
				'Shares market insights',
				'Supports team objectives',
				'Demonstrates accountability'
			]),
			section('ADMINISTRATIVE COMPLIANCE', '10%', 25, [
				'CRM updates are accurate and timely',
				'Sales reports submitted on time',
				'Complete client documentation',
				'Follows company policies',
				'Attendance and punctuality'
			])
		]
	}
}

/** Admin Staff — 5 categories plus the eight operational KPIs. */
export function adminStaff(): TemplateStructure {
	return {
		...blankTemplateStructure(),
		sections: [
			section('ADMINISTRATIVE OPERATIONS', '30%', 30, [
				'Completes assigned administrative tasks accurately and on time',
				'Maintains organized filing systems (physical and digital)',
				'Prepares correspondence, memoranda, reports, and other documents accurately',
				'Manages office schedules, meetings, and appointments efficiently',
				'Demonstrates strong attention to detail in all administrative work',
				'Handles confidential company information professionally'
			]),
			section('DOCUMENTATION & RECORDS MANAGEMENT', '20%', 25, [
				'Maintains accurate employee and company records',
				'Ensures proper filing and document retrieval',
				'Updates databases and trackers promptly',
				'Completes reports with minimal errors',
				'Maintains confidentiality of sensitive documents'
			]),
			section('OFFICE SUPPORT & COORDINATION', '20%', 25, [
				'Coordinates effectively with different departments',
				'Assists employees and visitors professionally',
				'Monitors office supplies and initiates replenishment requests',
				'Supports company events, meetings, and administrative activities',
				'Responds promptly to administrative requests'
			]),
			// Six criteria, verbatim — the sixth repeats the first in the source document.
			section('COMMUNICATION & PROFESSIONALISM', '15%', 25, [
				'Communicates professionally (oral and written)',
				'Demonstrates professionalism and courtesy',
				'Shows initiative in solving administrative concerns',
				'Works well under pressure and meets deadlines',
				'Demonstrates accountability and reliability',
				'Professional communication'
			]),
			section('POLICY COMPLIANCE & WORK ETHICS', '15%', 25, [
				'Attendance and punctuality',
				'Demonstrates integrity and confidentiality',
				'Maintains a positive attitude and teamwork',
				'Accepts feedback and continuously improves'
			])
		],
		// `target` is free text, verbatim, and is never compared to anything.
		kpiRows: [
			{ id: newId('kpi'), indicator: 'Employee document completion', target: '100%' },
			{ id: newId('kpi'), indicator: 'Payroll and HR document accuracy', target: '≥99%' },
			{
				id: newId('kpi'),
				indicator: 'Memo, contract, and correspondence turnaround',
				target: 'Within 24 hours'
			},
			{
				id: newId('kpi'),
				indicator: 'Filing and document retrieval requests',
				target: 'Same business day'
			},
			{
				id: newId('kpi'),
				indicator: 'Office supply replenishment',
				target: 'Before reaching minimum stock level'
			},
			{
				id: newId('kpi'),
				indicator: 'Meeting minutes released',
				target: 'Within 24 hours after meeting'
			},
			{
				id: newId('kpi'),
				indicator: 'Employee concerns acknowledged',
				target: 'Within 1 business day'
			},
			{
				id: newId('kpi'),
				indicator: 'Compliance with internal administrative processes',
				target: '100%'
			}
		]
	}
}

async function seed(db: PrismaClient) {
	const orgs = await db.organization.findMany({ select: { id: true, name: true } })
	if (orgs.length === 0) {
		console.error('No organizations found — run `pnpm db:seed` first.')
		process.exitCode = 1
		return
	}

	for (const org of orgs) {
		for (const [name, build] of [
			['Account Executive', accountExecutive],
			['Admin Staff', adminStaff]
		] as const) {
			// A bad seed is the likeliest source of a malformed structure, and Postgres validates
			// none of this JSON — so the seed runs the same gate every write boundary runs.
			const parsed = templateStructureSchema.safeParse(build())
			if (!parsed.success) {
				console.error(`"${name}" failed templateStructureSchema:`)
				console.error(parsed.error.issues)
				process.exitCode = 1
				return
			}
			const template = await db.performanceTemplate.upsert({
				where: { organizationId_name: { organizationId: org.id, name } },
				update: {},
				create: { organizationId: org.id, name, structure: parsed.data }
			})
			console.log(`  ${org.name}: ${name} → ${template.id}`)
		}
	}
	console.log('Performance template seed complete.')
}

async function main() {
	const db = new PrismaClient()
	try {
		await seed(db)
	} finally {
		await db.$disconnect()
	}
}

// Only when run as a script. The unit tests import the two builders above to prove the seeded
// structures parse, and importing this file must not open a database connection.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((e) => {
		console.error(e)
		process.exitCode = 1
	})
}
