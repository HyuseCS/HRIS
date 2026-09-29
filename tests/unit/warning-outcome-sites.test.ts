import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

function returnWith(src: string, marker: string): string {
	const at = src.indexOf(marker)
	if (at === -1) return ''
	const start = src.lastIndexOf('return {', at)
	const end = src.indexOf('\n\t}', at)
	return start === -1 || end === -1 ? '' : src.slice(start, end)
}

describe('rejections, returns and send-backs toast as warnings', () => {
	it('dashboard decidePosting returns success for approve and warning for a send-back', () => {
		const ret = returnWith(
			read('src/routes/(app)/dashboard/+page.server.ts'),
			"'Posting approved.'"
		)
		expect(ret).toContain("kind: approve ? 'success' : 'warning'")
	})

	it('statutory-rates rejectProposal returns kind warning', () => {
		const ret = returnWith(
			read('src/routes/(app)/payroll/statutory-rates/+page.server.ts'),
			"'Proposal rejected.'"
		)
		expect(ret).toContain("kind: 'warning'")
	})

	it('statutory-rates confirm does not return a warning', () => {
		const ret = returnWith(
			read('src/routes/(app)/payroll/statutory-rates/+page.server.ts'),
			"'Proposal applied to the live rates.'"
		)
		expect(ret).toContain('saved:')
		expect(ret).not.toContain('warning')
	})

	it('recruitment advanceStage returns warning only for a move to REJECTED', () => {
		const ret = returnWith(
			read('src/routes/(app)/recruitment/[id]/+page.server.ts'),
			"'Applicant moved.'"
		)
		expect(ret).toContain("kind: parsed.data.stage === 'REJECTED' ? 'warning' : 'success'")
	})

	it('approvals rejectMany returns kind warning', () => {
		const ret = returnWith(
			read('src/routes/(app)/requests/approvals/+page.server.ts'),
			'`Rejected ${done}'
		)
		expect(ret).toContain("kind: 'warning'")
	})
})
