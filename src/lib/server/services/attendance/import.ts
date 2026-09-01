import { error } from '@sveltejs/kit'
// Default import, not `{ parse }`. papaparse is CommonJS, and Vite's SSR transform refuses a named
// import from one — the dev server 500s on the whole /attendance route. Vitest's interop is more
// forgiving, so the unit suite stayed green while the page was dead; only loading the page catches
// this.
import Papa from 'papaparse'
import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { deriveRange } from './index'
import type { AuditContext } from '../types'

/**
 * CSV backlog import (#200). HR uploads a file of historical punches; each non-empty time cell
 * becomes one `TimeLog` row, and the days are then materialised through `deriveRange` — the one
 * authoritative engine — so backlog punches pick up AM/PM (#162) exactly like live ones.
 *
 * Two properties this file exists to hold:
 *  - It is idempotent. Every punch carries a deterministic `dedupKey`, checked in one bulk query
 *    and backed by `@@unique([dedupKey, employeeId])` for the concurrent case.
 *  - It never writes into a locked or hand-corrected day. That check runs BEFORE any `TimeLog`
 *    write, because `TimeLog` is append-only: a punch written under a lock would silently
 *    resurrect on the next unlock.
 *
 * The file never touches disk, so `storage.ts` (`ALLOWED_MIME`, `sniffMime`, `MAX_UPLOAD_BYTES`)
 * is deliberately not involved. Capability + org gating is the CALLER's job (the form action).
 */

/** 2 MB — ~40k rows of this shape. Deliberately NOT `MAX_UPLOAD_BYTES` (10 MB), which is sized
 *  for PDFs and images that hit disk. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024
/** One HR batch. Bounds the parse (papaparse `preview`) and the three bulk queries. */
export const MAX_IMPORT_ROWS = 2000
/** Same 2-month cap the attendance page actions enforce, so one upload cannot trigger an
 *  unbounded `deriveRange`. */
const MAX_SPAN_DAYS = 62
const DAY_MS = 86_400_000
/** Bound on the audit row: one bad file must not write a megabyte of JSON into `newValue`. */
const MAX_REJECTED_SAMPLE = 20

const SLOTS = [
	{ column: 'amin', slot: 'amIn', type: 'IN' },
	{ column: 'amout', slot: 'amOut', type: 'OUT' },
	{ column: 'pmin', slot: 'pmIn', type: 'IN' },
	{ column: 'pmout', slot: 'pmOut', type: 'OUT' }
] as const

/** The six accepted headers, lower-cased. Any other column rejects the whole file: a stray column
 *  means the operator uploaded the wrong export, and guessing which one they meant is worse than
 *  saying so. */
const HEADERS = ['employeenumber', 'date', ...SLOTS.map((s) => s.column)]

/**
 * Read-side formula-injection rejection.
 *
 * This is NOT a mirror of `reports.ts`'s `FORMULA_PREFIX` — that constant is module-private, so
 * importing it is not possible without widening that module's surface, and this is a different
 * job anyway: `reports.ts` NEUTRALISES what we write (prepends a tab), this REJECTS what we read.
 * The character class is copied verbatim (`=`, `+`, `-`, `@`, tab, CR) so the two cannot disagree
 * about what looks like a formula. Tab and CR stay in the class even though `sanitizeCell` trims
 * first: the class is then still correct if the trim is ever removed.
 *
 * Honest scope: none of our six columns can legitimately start with one of these characters, and
 * the cells become timestamps and employee-number lookups rather than re-exported strings. This
 * is cheap garbage rejection, not a load-bearing control.
 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/

function sanitizeCell(raw: string): { value: string } | { reject: string } {
	// Strip our own exporter's neutraliser (`\t=HYPERLINK(…)`) before testing, so a round-tripped
	// export is rejected on its real first character rather than on the tab.
	const value = raw.replace(/^\t+/, '').trim()
	if (FORMULA_PREFIX.test(value)) return { reject: 'cell looks like a spreadsheet formula' }
	return { value }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export interface BacklogPunch {
	slot: string
	punchType: 'IN' | 'OUT'
	timestamp: Date
}

export interface BacklogRow {
	line: number
	employeeNumber: string
	date: string
	punches: BacklogPunch[]
}

export interface BacklogRejection {
	line: number
	employeeNumber: string
	date: string
	reason: string
}

export interface ImportResult {
	applied: number
	skippedDuplicate: number
	rejected: BacklogRejection[]
	punchesWritten: number
}

/**
 * Pure: text → validated rows + per-row rejections. No DB, exported for unit testing.
 *
 * File-level problems (binary content, a missing or unexpected column, more rows than the cap)
 * throw — one bad header means every row is untrustworthy. Row-level problems are collected so a
 * single bad line never costs the operator the rest of the file.
 */
export function parseBacklogCsv(text: string): {
	rows: BacklogRow[]
	rejected: BacklogRejection[]
} {
	// A NUL byte is the cheap, dependency-free signal that an XLSX (or any binary) was renamed
	// `.csv`. Checked before parsing so we never walk a megabyte of noise.
	if (text.includes('\u0000'))
		error(400, 'This file is not text — it looks like a spreadsheet or binary file')

	// papaparse handles quoted fields, embedded newlines, CRLF and the UTF-8 BOM. The BOM is the
	// reason we do NOT strip one ourselves: papaparse already removes it before the first header
	// name is produced (verified on 5.6.0 \u2014 a leading U+FEFF never reaches `transformHeader`), so a
	// strip of our own would be dead code that no mutation could turn red. The `valid.csv` fixture
	// carries a real BOM so the behaviour stays pinned if the library ever changes.
	//
	// `preview` bounds the PARSE itself (verified: with `header: true` it counts data rows), so the
	// row cap costs nothing on an oversized file instead of being checked after the work is done.
	// +1 so we can tell "exactly at the cap" from "over it".
	const parsed = Papa.parse<Record<string, string>>(text, {
		header: true,
		skipEmptyLines: true,
		preview: MAX_IMPORT_ROWS + 1,
		transformHeader: (h) => h.trim().toLowerCase()
	})

	const fields = parsed.meta.fields ?? []
	const unknown = fields.filter((f) => !HEADERS.includes(f))
	if (unknown.length > 0) error(400, `Unexpected column in the header: ${unknown.join(', ')}`)
	for (const required of ['employeenumber', 'date', 'amin'])
		if (!fields.includes(required)) error(400, `The header is missing the "${required}" column`)

	if (parsed.data.length > MAX_IMPORT_ROWS)
		error(400, `This file has more than ${MAX_IMPORT_ROWS} rows`)

	const rows: BacklogRow[] = []
	const rejected: BacklogRejection[] = []

	parsed.data.forEach((raw, i) => {
		// +2: papaparse strips the header row, and spreadsheet line numbers are 1-based.
		const line = i + 2
		const cells: Record<string, string> = {}
		let bad: string | null = null
		for (const key of HEADERS) {
			const cell = sanitizeCell(raw[key] ?? '')
			if ('reject' in cell) {
				bad = cell.reject
				break
			}
			cells[key] = cell.value
		}

		const employeeNumber = cells.employeenumber ?? ''
		const date = cells.date ?? ''
		const reject = (reason: string) => rejected.push({ line, employeeNumber, date, reason })

		if (bad) return reject(bad)
		if (!employeeNumber) return reject('employee number is missing')
		if (!DATE_RE.test(date)) return reject('date must be YYYY-MM-DD')
		// Rejects 2026-02-30 and friends: Date normalises them to a different day.
		if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)
			return reject('date is not a real calendar day')
		if (!cells.amin) return reject('amIn is required')

		const punches: BacklogPunch[] = []
		for (const { column, slot, type } of SLOTS) {
			const hhmm = cells[column]
			if (!hhmm) continue
			if (!TIME_RE.test(hhmm)) return reject(`${slot} must be HH:MM (24-hour)`)
			// Identical construction to the `correct` action (`attendance/+page.server.ts:193`):
			// the CSV's times are PHT, and +08:00 is what makes that explicit.
			punches.push({ slot, punchType: type, timestamp: new Date(`${date}T${hhmm}:00+08:00`) })
		}

		rows.push({ line, employeeNumber, date, punches })
	})

	return { rows, rejected }
}

/**
 * The write path. Capability (`MANAGE_HR`) and the food-service org gate are the CALLER's job —
 * see the `importBacklog` action in `attendance/+page.server.ts`.
 *
 * Named `importBacklogCsv` so it stays distinct from that action, which is named for the form.
 */
export async function importBacklogCsv(
	organizationId: string,
	file: { name: string; size: number; text: string },
	ctx: AuditContext
): Promise<ImportResult> {
	// Second layer only. The action checks both of these BEFORE reading the file body, which is
	// what actually bounds the work; these repeat the check for any future caller that does not.
	if (file.size > MAX_IMPORT_BYTES) error(413, 'Backlog file exceeds the 2 MB limit')
	if (!file.name.toLowerCase().endsWith('.csv')) error(415, 'Only .csv files are accepted')

	const { rows, rejected } = parseBacklogCsv(file.text)
	const rowsParsed = rows.length + rejected.length
	if (rowsParsed > MAX_IMPORT_ROWS) error(400, `This file has more than ${MAX_IMPORT_ROWS} rows`)
	if (rows.length === 0) error(400, 'No usable rows in this file')

	// Span guard before any DB work: `deriveRange` at the end walks every day in the range for
	// every employee the file touched, so an accidental 10-year file must not reach it.
	const dayKeys = rows.map((r) => r.date).sort()
	const minDate = new Date(dayKeys[0])
	const maxDate = new Date(dayKeys[dayKeys.length - 1])
	if (maxDate.getTime() - minDate.getTime() > MAX_SPAN_DAYS * DAY_MS)
		error(400, 'Range exceeds the 2-month limit.')

	// One employee query. Org-scoped on the Employee's own `organizationId` column — without
	// that filter, an employee number from another tenant resolves.
	const employees = await db.employee.findMany({
		where: {
			employeeNumber: { in: [...new Set(rows.map((r) => r.employeeNumber))] },
			organizationId,
			employmentStatus: 'ACTIVE'
		},
		select: { id: true, employeeNumber: true }
	})
	const employeeIdByNumber = new Map(employees.map((e) => [e.employeeNumber, e.id]))

	// One attendance query for the lock guard, over exactly the employee/day pairs in the file.
	const existingDays = await db.attendanceDay.findMany({
		where: {
			employeeId: { in: [...employeeIdByNumber.values()] },
			date: { in: [...new Set(dayKeys)].map((d) => new Date(d)) }
		},
		select: { employeeId: true, date: true, isLocked: true, manuallyEdited: true }
	})
	const dayStateOf = new Map(
		existingDays.map((d) => [`${d.employeeId}:${d.date.toISOString().slice(0, 10)}`, d])
	)

	const survivors: { row: BacklogRow; employeeId: string }[] = []
	for (const row of rows) {
		const employeeId = employeeIdByNumber.get(row.employeeNumber)
		const push = (reason: string) =>
			rejected.push({ line: row.line, employeeNumber: row.employeeNumber, date: row.date, reason })
		if (!employeeId) {
			push('employee number not found in your organization')
			continue
		}
		const day = dayStateOf.get(`${employeeId}:${row.date}`)
		// Refused BEFORE any TimeLog write. TimeLog is append-only, so a punch written under a lock
		// would resurrect the moment the day is unlocked — the "quietly undo real work" failure.
		if (day?.isLocked) {
			push('this day is locked')
			continue
		}
		if (day?.manuallyEdited) {
			push('this day was hand-corrected by HR')
			continue
		}
		survivors.push({ row, employeeId })
	}

	// `line` rides alongside the record rather than inside it, so what reaches `createMany` is
	// exactly the row shape Prisma accepts and nothing has to be stripped back out.
	const candidates = survivors.flatMap(({ row, employeeId }) =>
		row.punches.map((p) => ({
			line: row.line,
			record: {
				employeeId,
				punchType: p.punchType,
				source: 'MANUAL' as const,
				timestamp: p.timestamp,
				dedupKey: `backlog:${row.employeeNumber}:${row.date}:${p.slot}`,
				note: 'Backlog CSV import (#200)'
			}
		}))
	)

	// The constraint is `@@unique([dedupKey, employeeId])` — a PAIR. Everything below keys on the
	// pair, never on `dedupKey` alone: employee numbers are unique per organization, so two tenants
	// sharing a prefix produce the same key for different people, and a key-only check would report
	// one tenant's legitimate punch as an already-imported duplicate.
	// `dedupKey` is nullable on the model — every Discord punch carries NULL — so the rows Prisma
	// hands back are typed that way even though this query filters `in` a list of strings and can
	// never actually return one. Accept the null rather than asserting it away: a NULL key pairs to
	// a string no candidate can produce, so it simply never matches.
	const pairOf = (r: { employeeId: string; dedupKey: string | null }) =>
		`${r.employeeId}|${r.dedupKey}`

	// Collapse pairs repeated INSIDE one upload first. Two identical (employeeNumber, date, slot)
	// lines would otherwise become two inserts racing the unique index, and the counts the operator
	// reads would not be the counts that happened.
	const inFile = new Set<string>()
	const unique = candidates.filter((c) => {
		const pair = pairOf(c.record)
		if (inFile.has(pair)) return false
		inFile.add(pair)
		return true
	})

	// One duplicate query, scoped to the employees actually involved — without that filter it scans
	// `time_logs` by dedupKey across every employee in every organization. The DB unique index is
	// the second layer for the concurrent case.
	const seen =
		unique.length === 0
			? []
			: await db.timeLog.findMany({
					where: {
						employeeId: { in: [...new Set(unique.map((c) => c.record.employeeId))] },
						dedupKey: { in: [...new Set(unique.map((c) => c.record.dedupKey))] }
					},
					select: { employeeId: true, dedupKey: true }
				})
	// The two `in` lists are a cross product, so a returned row may be a pair no candidate holds;
	// matching on the pair discards those.
	const seenPairs = new Set(seen.map(pairOf))
	const fresh = unique.filter((c) => !seenPairs.has(pairOf(c.record)))

	const freshLines = new Set(fresh.map((c) => c.line))
	const applied = survivors.filter(({ row }) => freshLines.has(row.line)).length
	const skippedDuplicate = survivors.length - applied

	// One audit row per import, always — an upload where every row was refused is exactly the one
	// an investigator wants on the record.
	await db.$transaction(async (tx) => {
		if (fresh.length > 0)
			await tx.timeLog.createMany({
				data: fresh.map((c) => c.record),
				// Absorbs a concurrent double-submit that raced past the query above — the same role
				// the P2002 catch plays for a Discord punch (`timelog.ts`).
				skipDuplicates: true
			})
		await writeAuditLog(
			ctx,
			{
				action: 'CREATE',
				entityType: 'AttendanceDay',
				entityId: organizationId,
				newValue: {
					source: 'backlog_csv',
					fileName: file.name,
					rowsParsed,
					applied,
					skippedDuplicate,
					rejected: rejected.length,
					rejectedSample: rejected.slice(0, MAX_REJECTED_SAMPLE)
				}
			},
			tx
		)
	})

	// After the transaction: materialise the days through the one authoritative engine, which
	// independently skips locked and hand-edited days — so the guard above is doubled. Skipped
	// when nothing was written; there is no new punch for it to re-pair.
	//
	// Once per employee we actually wrote for. `deriveRange` takes ONE optional `employeeId`, and
	// unscoped it re-derives every active employee in the organization across the span — a
	// three-employee backlog in a 200-person tenant would do ~12,400 day derivations for ~186 days
	// of real work.
	for (const employeeId of new Set(fresh.map((c) => c.record.employeeId)))
		await deriveRange(organizationId, { from: minDate, to: maxDate, employeeId }, ctx)

	return { applied, skippedDuplicate, rejected, punchesWritten: fresh.length }
}
