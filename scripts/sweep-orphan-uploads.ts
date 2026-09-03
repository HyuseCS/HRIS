// Orphan-file sweep (#74). A crash between saveFile() (disk write) and the Prisma
// create leaves a file under UPLOAD_DIR with no document row. This diffs the files on
// disk against the storageKeys in employee_documents + request_documents and removes
// the strays. The reverse (row without file) is already tolerated by deleteStoredFile.
//
//   pnpm tsx scripts/sweep-orphan-uploads.ts                 # dry run (lists orphans)
//   pnpm tsx scripts/sweep-orphan-uploads.ts --delete        # actually remove them
//   pnpm tsx scripts/sweep-orphan-uploads.ts --delete --grace-minutes=15
//
// A grace period (default 60 min) skips very recent files so a sweep can't race an
// in-flight upload whose row hasn't committed yet.

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { listStoredKeys, deleteStoredFile } from '../src/lib/server/storage'

const args = process.argv.slice(2)
const doDelete = args.includes('--delete')
const graceArg = args.find((a) => a.startsWith('--grace-minutes='))
const graceMinutes = graceArg ? Number(graceArg.split('=')[1]) : 60
const graceMs = Math.max(0, graceMinutes) * 60_000

const db = new PrismaClient()

async function main() {
	const [stored, empDocs, reqDocs] = await Promise.all([
		listStoredKeys(),
		db.employeeDocument.findMany({ select: { storageKey: true } }),
		db.requestDocument.findMany({ select: { storageKey: true } })
	])

	// #299/AC-7: the requestDocument query above is deliberately UNFILTERED. A tombstoned document
	// whose bytes have not been evicted yet still owns its file, and dropping it from the known-set
	// would make this sweep delete a file that still has a row pointing at it. The null filter is
	// the already-evicted case — that row correctly no longer claims any file — and it is not
	// cosmetic: `storageKey` is `String?` since #299 and nothing typechecks this directory.
	const known = new Set(
		[...empDocs, ...reqDocs].map((d) => d.storageKey).filter((k): k is string => k !== null)
	)
	const now = Date.now()
	const orphans = stored.filter((s) => !known.has(s.key))
	const recent = orphans.filter((o) => now - o.mtimeMs < graceMs)
	const stale = orphans.filter((o) => now - o.mtimeMs >= graceMs)

	console.log(`Files on disk: ${stored.length} | document rows: ${known.size}`)
	console.log(
		`Orphans: ${orphans.length} (${recent.length} within ${graceMinutes}m grace — skipped)`
	)
	for (const o of stale) console.log(`  orphan: ${o.key}`)

	if (!stale.length) {
		console.log('Nothing to remove.')
		return
	}
	if (!doDelete) {
		console.log(`\nDry run — re-run with --delete to remove the ${stale.length} file(s) above.`)
		return
	}
	for (const o of stale) await deleteStoredFile(o.key)
	console.log(`\nDeleted ${stale.length} orphan file(s).`)
}

main()
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(() => db.$disconnect())
