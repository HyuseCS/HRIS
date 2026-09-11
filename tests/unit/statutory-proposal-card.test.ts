import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'

vi.mock('$app/forms', () => ({ enhance: () => ({}) }))
vi.mock('$app/navigation', () => ({ beforeNavigate: () => {}, goto: () => {} }))

const Page = (await import('../../src/routes/(app)/payroll/statutory-rates/+page.svelte')).default

const live = {
	philhealthRate: 0.05,
	philhealthFloor: 10000,
	philhealthCeiling: 100000,
	pagibigRate: 0.02,
	pagibigCap: 200,
	sssBrackets: [],
	taxBrackets: []
}

const renderPending = (changes: string[]) =>
	render(Page, {
		props: {
			data: {
				live,
				canManage: true,
				canPropose: false,
				pending: [
					{
						id: 'p1',
						proposer: 'hr@veent.ph',
						createdAt: new Date('2026-09-11T09:00:00Z'),
						changes
					}
				]
			},
			form: null
		} as never
	}).body

const THREE = [
	'Pag-IBIG cap: ₱200 → ₱300',
	'PhilHealth rate: 5% → 6%',
	'SSS contribution table changed'
]

describe('pending statutory proposal card', () => {
	it('renders a single change inline, with no disclosure', () => {
		const body = renderPending(['Pag-IBIG cap: ₱200 → ₱300'])
		expect(body).toContain('Pag-IBIG cap: ₱200 → ₱300')
		expect(body).not.toContain('<details')
	})

	it('summarises 2+ changes behind a disclosure that still carries every line', () => {
		const body = renderPending(THREE)
		expect(body).toContain('3 changes')
		expect(body).toContain('<details')
		for (const c of THREE) expect(body).toContain(c)
	})

	it('names an empty proposal as a reject candidate, with no disclosure', () => {
		const body = renderPending(['No effective change vs the live rates.'])
		expect(body).toContain('nothing to apply, reject it')
		expect(body).not.toContain('<details')
	})
})
