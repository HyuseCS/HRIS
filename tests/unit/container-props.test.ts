import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(import.meta.dirname, '../../src')
const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8')
const container = read('lib/components/ui/Container.svelte')

const EXISTING_USERS: [string, number][] = [
	['lib/components/attendance/TeamMatrix.svelte', 1],
	['routes/(app)/employees/+page.svelte', 1],
	['routes/(app)/inquiries/+page.svelte', 1],
	['routes/(app)/leave/+page.svelte', 1],
	['routes/(app)/leave/balances/+page.svelte', 1],
	['routes/(app)/payslips/+page.svelte', 1],
	['routes/(app)/performance/+page.svelte', 6],
	['routes/(app)/recruitment/+page.svelte', 1],
	['routes/(app)/reports/audit-log/+page.svelte', 1],
	['routes/(app)/requests/+page.svelte', 1],
	['routes/(app)/requests/approvals/+page.svelte', 1],
	['routes/(app)/requests/proposals/+page.svelte', 1],
	['routes/(app)/requests/timesheets/+page.svelte', 1],
	['routes/(app)/settings/holidays/+page.svelte', 1],
	['routes/(app)/settings/roles/+page.svelte', 1],
	['routes/(app)/timesheets/+page.svelte', 1]
]

describe('Container props', () => {
	it('keeps the page-filling outer class literal', () => {
		expect(container).toContain("'flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border'")
	})

	it('keeps the grey default tone', () => {
		expect(container).toContain("tone = 'muted'")
	})

	it('Container keeps fill default true and wires bodyClass', () => {
		expect(container).toContain('fill = true')
		expect(container).toContain('fill?: boolean')
		expect(container).toContain('bodyClass?: string')
		expect(container).toContain("'flex flex-col overflow-hidden rounded-lg border'")
		expect(container).toContain("{bodyClass ?? ''}")
	})

	it.each(EXISTING_USERS)(
		'%s keeps its %i Container call sites without the new props',
		(file, count) => {
			const tags = read(file).match(/<Container\b[^>]*>/g) ?? []
			expect(tags).toHaveLength(count)
			for (const tag of tags) {
				expect(tag).not.toContain('fill=')
				expect(tag).not.toContain('bodyClass')
			}
		}
	)
})
