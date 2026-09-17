// One-off: move every seeded StatutoryRateConfig from the 2018 TRAIN withholding table to the one
// in force since 1 Jan 2023.
//
//   pnpm exec dotenv -e .env.dev -- tsx scripts/migrate-bir-tax-table-2023.ts
//
// The engine default and the seed are already the 2023 table; existing rows are not, because the
// seed upsert leaves existing rows untouched (`update: {}`). A row still on the 2018 rates
// over-deducts every employee above the exempt threshold.
//
// Guarded on the 2018 RATE + FLOOR vectors, never on baseTax: a drifted baseTax is exactly the
// symptom this migration exists to clear, so a full-table equality guard would skip the rows that
// most need moving. Any org whose rates differ is deliberately customized — it is left alone and
// reported by id. Idempotent: a no-op once every stale row has moved.

import { PrismaClient } from '@prisma/client'
import {
	BIR_MONTHLY_TAX_TABLE,
	taxBracketsToWire
} from '../src/lib/server/services/payroll/ph-statutory'

const db = new PrismaClient()

const RATES_2018 = [0, 0.2, 0.25, 0.3, 0.32, 0.35]
const RATES_2023 = BIR_MONTHLY_TAX_TABLE.map((b) => b.rate)
const FLOORS = [0, 20833, 33333, 66667, 166667, 666667]

const matches = (brackets: unknown, rates: number[]) =>
	Array.isArray(brackets) &&
	brackets.length === rates.length &&
	brackets.every(
		(b, i) =>
			b !== null &&
			typeof b === 'object' &&
			(b as Record<string, unknown>).rate === rates[i] &&
			(b as Record<string, unknown>).floor === FLOORS[i]
	)

async function main() {
	const rows = await db.statutoryRateConfig.findMany({
		select: { id: true, organizationId: true, taxBrackets: true }
	})

	const stale = rows.filter((r) => matches(r.taxBrackets, RATES_2018))
	const customized = rows.filter(
		(r) => !matches(r.taxBrackets, RATES_2018) && !matches(r.taxBrackets, RATES_2023)
	)

	for (const row of stale) {
		await db.statutoryRateConfig.update({
			where: { id: row.id },
			data: { taxBrackets: taxBracketsToWire(BIR_MONTHLY_TAX_TABLE) }
		})
	}

	console.log(`✔ Moved the BIR table 2018 → 2023 on ${stale.length} config row(s).`)
	for (const row of customized) {
		console.log(`  • skipped ${row.organizationId} (${row.id}) — rates are not the 2018 vector.`)
	}
}

main()
	.then(() => db.$disconnect())
	.catch(async (e) => {
		console.error(e)
		await db.$disconnect()
		process.exit(1)
	})
