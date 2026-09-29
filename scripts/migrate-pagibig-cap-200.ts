// One-off: bump the Pag-IBIG EE/ER cap from the stale ₱100 to ₱200 (#220).
//
//   bunx tsx scripts/migrate-pagibig-cap-200.ts
//
// ₱200 = 2% of the ₱10,000 monthly-compensation ceiling (HDMF Circular 460, effective Feb 2024).
// The old ₱100 encoded the pre-2024 ₱5,000 ceiling, under-deducting everyone earning over ₱5,000/mo.
// The seed and the engine fallback are already ₱200; existing StatutoryRateConfig rows are not,
// because the seed upsert leaves existing rows untouched (`update: {}`).
//
// Guarded on `= 100` so any org that deliberately customized its cap is left alone. Idempotent:
// a no-op once every stale row has moved.

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
	const moved = await db.statutoryRateConfig.updateMany({
		where: { pagibigCap: 100 },
		data: { pagibigCap: 200 }
	})
	console.log(`✔ Bumped Pag-IBIG cap ₱100 → ₱200 on ${moved.count} config row(s).`)
}

main()
	.then(() => db.$disconnect())
	.catch(async (e) => {
		console.error(e)
		await db.$disconnect()
		process.exit(1)
	})
