import { describe, it, expect } from 'vitest'
import { exportToCSV } from '../../src/lib/server/services/reports'

// Formula-injection defense (#98): user-controlled cell content (employee
// names, department names, etc.) flows into these CSVs, so any cell starting
// with a spreadsheet-formula trigger must be neutralized before HR opens the
// file in Excel/Google Sheets.

describe('exportToCSV — formula-injection defense', () => {
	it('prefixes a `=`-leading cell with a tab so it renders as text', () => {
		const csv = exportToCSV([{ Name: '=HYPERLINK("http://evil","x")' }])
		// Cell is quoted because it now contains a tab AND double-quotes.
		expect(csv).toContain('"\t=HYPERLINK(""http://evil"",""x"")"')
	})

	it('neutralizes `+`, `-`, `@`, `\\t`, and `\\r` leading cells too', () => {
		const cases = ['+cmd', '-2+cmd', '@SUM(A1)', '\ttab', '\rcarriage']
		for (const input of cases) {
			const csv = exportToCSV([{ Field: input }])
			// The tab prefix appears at position after the header row + `,`-less first col.
			expect(
				csv.split('\r\n')[1]?.startsWith('"\t') || csv.split('\r\n')[1]?.startsWith('\t')
			).toBe(true)
		}
	})

	it('leaves benign cells alone (no formula trigger, no comma/quote/newline)', () => {
		const csv = exportToCSV([{ Name: 'Manzano, Lanie', No: '0005' }])
		// The comma inside "Manzano, Lanie" still triggers quoting, but nothing else.
		expect(csv).toBe('Name,No\r\n"Manzano, Lanie",0005')
	})

	it('does not prefix a cell where the trigger char is not first', () => {
		const csv = exportToCSV([{ Note: 'x=1' }])
		expect(csv).toBe('Note\r\nx=1')
	})

	it('returns empty string for zero rows', () => {
		expect(exportToCSV([])).toBe('')
	})

	it('still escapes embedded double-quotes and commas as before', () => {
		const csv = exportToCSV([{ Note: 'a "b", c' }])
		expect(csv).toBe('Note\r\n"a ""b"", c"')
	})
})

// #162 (contract instruction E2): the header list comes from `rows[0]` alone, so a conditional
// key must be spread onto EVERY row or the file silently loses columns. The attendance export's
// `amPmCols()` helper is the first conditional key set in the app; this pins the rule it obeys,
// and `tests/unit/attendance-export-am-pm.test.ts` pins the route that applies it.
describe('exportToCSV — the header set comes from the first row only', () => {
	it('drops a key that only later rows carry', () => {
		const csv = exportToCSV([{ A: '1' }, { A: '2', 'AM In': '08:00' }])
		expect(csv.split('\r\n')[0]).toBe('A')
		expect(csv).not.toContain('08:00')
	})

	it('keeps every line at the same field count when the key set is uniform', () => {
		const uniform = [
			{ A: '1', 'AM In': '' },
			{ A: '2', 'AM In': '08:00' },
			{ A: '3', 'AM In': '' }
		]
		const out = exportToCSV(uniform).split('\r\n')
		expect(out[0]).toBe('A,AM In')
		expect(new Set(out.map((l) => l.split(',').length)).size).toBe(1)
	})
})
