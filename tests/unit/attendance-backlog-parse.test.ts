import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseBacklogCsv, MAX_IMPORT_ROWS } from '$lib/server/services/attendance/import'

/**
 * #200 — the pure half of the CSV backlog importer. No DB, no mocks: `parseBacklogCsv` is text in,
 * rows + rejections out.
 *
 * Fixtures live in `tests/fixtures/backlog/` (created by this phase; the repo had no shared upload
 * fixture directory before). They carry the byte-level shapes a hand-rolled split gets wrong — a
 * UTF-8 BOM, CRLF line endings, Excel-style quoting — which is the whole justification for taking
 * `papaparse` as a production dependency.
 */

const fixture = (name: string) => readFileSync(`tests/fixtures/backlog/${name}`, 'utf8')

/** The PHT instant a `date` + `HH:MM` pair must land on. Written out longhand so the assertion
 *  fails if the `+08:00` in the implementation is ever dropped or changed to `Z`. */
const pht = (iso: string) => new Date(iso).toISOString()

describe('B1 — a well-formed file with a BOM, CRLF and quoted fields', () => {
	const { rows, rejected } = parseBacklogCsv(fixture('valid.csv'))

	it('parses every row and rejects none', () => {
		expect(rejected).toEqual([])
		expect(rows).toHaveLength(3)
		expect(rows.map((r) => r.employeeNumber)).toEqual(['JJ-001', 'JJ-002', 'JJ-001'])
		// The BOM must not survive into the first header name, or every employee number reads as
		// empty. papaparse removes it — this pins that, so a library change is caught here rather
		// than in production.
		expect(rows[0].employeeNumber).toBe('JJ-001')
	})

	it('converts each time cell to a PHT instant with the right punch type', () => {
		expect(rows[0].punches.map((p) => [p.slot, p.punchType, p.timestamp.toISOString()])).toEqual([
			['amIn', 'IN', pht('2026-08-10T08:00:00+08:00')],
			['amOut', 'OUT', pht('2026-08-10T11:00:00+08:00')],
			['pmIn', 'IN', pht('2026-08-10T13:00:00+08:00')],
			['pmOut', 'OUT', pht('2026-08-10T17:00:00+08:00')]
		])
		// 08:00 PHT is 00:00 UTC — spelled out so a silent UTC interpretation cannot pass.
		expect(rows[0].punches[0].timestamp.toISOString()).toBe('2026-08-10T00:00:00.000Z')
	})

	it('keeps an AM-only row at two punches rather than inventing empty PM ones', () => {
		expect(rows[1].punches.map((p) => p.slot)).toEqual(['amIn', 'amOut'])
	})
})

describe('B2/B3 — formula-injection rejection is per row, not per file', () => {
	const { rows, rejected } = parseBacklogCsv(fixture('formula-injection.csv'))

	it('rejects a bare =HYPERLINK cell and keeps the clean row', () => {
		expect(rows).toHaveLength(1)
		expect(rows[0].employeeNumber).toBe('JJ-001')
		expect(rejected[0]).toMatchObject({
			line: 3,
			reason: 'cell looks like a spreadsheet formula'
		})
	})

	it('B3 rejects our own exporter’s tab-neutralised form — the tab is stripped before the test', () => {
		expect(rejected[1]).toMatchObject({
			line: 4,
			reason: 'cell looks like a spreadsheet formula'
		})
		expect(rejected).toHaveLength(2)
	})
})

describe('B4 — each malformed row gets its own reason and line number', () => {
	const { rows, rejected } = parseBacklogCsv(fixture('malformed.csv'))

	it('keeps the one good row', () => {
		expect(rows).toHaveLength(1)
		expect(rows[0].line).toBe(2)
	})

	it('names the defect and the line for every bad row', () => {
		expect(rejected).toEqual([
			{ line: 3, employeeNumber: 'JJ-002', date: '2026-08-10', reason: 'amIn is required' },
			{ line: 4, employeeNumber: 'JJ-003', date: '10/08/2026', reason: 'date must be YYYY-MM-DD' },
			{
				line: 5,
				employeeNumber: 'JJ-004',
				date: '2026-02-30',
				reason: 'date is not a real calendar day'
			},
			{
				line: 6,
				employeeNumber: 'JJ-005',
				date: '2026-08-10',
				reason: 'amIn must be HH:MM (24-hour)'
			},
			{ line: 7, employeeNumber: '', date: '2026-08-10', reason: 'employee number is missing' }
		])
	})

	it('rejects the whole file when the header carries a column we do not accept', () => {
		// A header defect is file-level on purpose: a stray column means the operator uploaded the
		// wrong export, and guessing which column they meant is worse than refusing.
		expect(() =>
			parseBacklogCsv('employeeNumber,date,amIn,supervisorNote\nJJ-001,2026-08-10,08:00,x\n')
		).toThrowError(expect.objectContaining({ status: 400 }))
		expect(() => parseBacklogCsv('date,amIn\n2026-08-10,08:00\n')).toThrowError(
			expect.objectContaining({ status: 400 })
		)
	})
})

describe('B5 — a binary file renamed .csv is refused whole', () => {
	it('rejects on the NUL byte before parsing anything', () => {
		// Assert the NUL-specific MESSAGE, not just "a 400". Delete the NUL check and papaparse
		// still throws — on the mangled header — so a status-only assertion passes for the wrong
		// reason and the guard is never proved.
		expect(() => parseBacklogCsv(fixture('binary.csv'))).toThrowError(
			expect.objectContaining({
				status: 400,
				body: { message: 'This file is not text — it looks like a spreadsheet or binary file' }
			})
		)
	})
})

describe('the row cap bounds the parse itself (E4)', () => {
	const header = 'employeeNumber,date,amIn,amOut,pmIn,pmOut\n'
	const row = (i: number) => `JJ-${i},2026-08-10,08:00,11:00,,\n`
	// Deliberately LITERAL, not `MAX_IMPORT_ROWS ± n`. A fixture sized off the constant moves both
	// sides of the comparison together, so raising the cap keeps the test green and proves nothing.
	const build = (n: number) => header + Array.from({ length: n }, (_, i) => row(i)).join('')

	it('the documented cap is 2000 rows', () => {
		expect(MAX_IMPORT_ROWS).toBe(2000)
	})

	it('accepts exactly 2000 rows', () => {
		expect(parseBacklogCsv(build(2000)).rows).toHaveLength(2000)
	})

	it('refuses 2500 rows', () => {
		expect(() => parseBacklogCsv(build(2500))).toThrowError(
			expect.objectContaining({ status: 400 })
		)
	})
})
