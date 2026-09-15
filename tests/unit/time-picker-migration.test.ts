import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(import.meta.dirname, '../../src')

const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8')

const sourceFiles = () =>
	readdirSync(SRC, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && /\.(ts|svelte)$/.test(entry.name))
		.map((entry) => join(entry.parentPath, entry.name))

const stripComments = (source: string) =>
	source
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('F11a — every native type="time" input is migrated to TimePicker', () => {
	it('src/ has zero comment-stripped occurrences of type="time"', () => {
		const offenders: string[] = []

		for (const path of sourceFiles()) {
			const lines = stripComments(readFileSync(path, 'utf8')).split('\n')
			lines.forEach((line, i) => {
				if (line.includes('type="time"')) {
					offenders.push(`${path.slice(SRC.length + 1)}:${i + 1}: ${line.trim()}`)
				}
			})
		}

		expect(offenders, `native type="time" input found:\n${offenders.join('\n')}`).toEqual([])
	})

	it('is not blind: the scan reaches every source file including the 4 call sites', () => {
		const files = sourceFiles().map((path) => path.slice(SRC.length + 1))

		expect(files.length).toBeGreaterThan(100)
		expect(files).toContain('routes/(app)/attendance/+page.svelte')
		expect(files).toContain('lib/components/timesheets/TimesheetModal.svelte')
		expect(files).toContain('routes/(app)/settings/schedules/+page.svelte')
		expect(files).toContain('routes/(app)/recruitment/applicant/[applicantId]/+page.svelte')
	})

	const CALL_SITES: { file: string; count: number }[] = [
		{ file: 'routes/(app)/attendance/+page.svelte', count: 4 },
		{ file: 'lib/components/timesheets/TimesheetModal.svelte', count: 2 },
		{ file: 'routes/(app)/settings/schedules/+page.svelte', count: 2 },
		{ file: 'routes/(app)/recruitment/applicant/[applicantId]/+page.svelte', count: 1 }
	]

	for (const { file, count } of CALL_SITES) {
		it(`${file} renders <TimePicker exactly ${count} times`, () => {
			const source = stripComments(read(file))
			const matches = source.match(/<TimePicker/g) ?? []

			expect(matches.length).toBe(count)
		})
	}

	it('package.json has no bits-ui dependency', () => {
		const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '../../package.json'), 'utf8'))

		expect(Object.keys(pkg.dependencies ?? {})).not.toContain('bits-ui')
		expect(Object.keys(pkg.devDependencies ?? {})).not.toContain('bits-ui')
	})
})
