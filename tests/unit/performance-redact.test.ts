import { describe, it, expect } from 'vitest'
import { redactForSubject } from '../../src/lib/server/services/performance'

/**
 * #178 AC6 (item 155) — THE RELEASE GATE, field by field.
 *
 * The employee sees NOTHING the evaluator or HR authored until HR releases the review.
 * `releasedAt` is the only thing the gate reads: null means withheld, set means visible. The
 * employee-authored columns (`selfAssessment`, `employeeComments`) and the shared header
 * (employee, department, period, evaluator, date) are visible in BOTH states — an employee who
 * cannot see their own name and period cannot tell a withheld review from a broken page.
 *
 * Rewritten from the #179 two-field version, which asserted an unconditional null and would have
 * passed unchanged after the gate was added — it could not tell "withheld" from "gated".
 */

const ANSWERS = {
	version: 1,
	criteria: { crit_quality: { rating: 4, remark: 'Hit target in 5 of 6 months.' } },
	sectionSubtotals: { sec_core: 26 },
	totalScore: 88,
	interpretationBandId: 'band_outstanding',
	narratives: { nb_strengths: 'Closes hard deals.' },
	recommendationIds: ['rec_regular']
}

// Every evaluator-authored token, including the ones nested inside the JSON column. A partial
// leak — `answers` nulled but a rating echoed under another key — has to fail THIS list, not just
// an `answers === null` check. That exact mutation passed a naive assertion earlier in #178.
const EVALUATOR_TOKENS = [
	'crit_quality',
	'Hit target in 5 of 6 months.',
	'sec_core',
	'88',
	'band_outstanding',
	'Closes hard deals.',
	'rec_regular',
	'Exceeds expectations; promote next cycle.'
]

// The shared header the SUBJECT is entitled to in both states.
const HEADER = {
	id: 'r1',
	employee: { id: 'emp1', firstName: 'Jose', lastName: 'Cruz' },
	department: { id: 'dep1', name: 'Sales' },
	reviewer: { id: 'mgr1', firstName: 'Maria', lastName: 'Santos' },
	cycle: { id: 'c1', name: 'H1 2026', startDate: '2026-01-01', endDate: '2026-06-30' },
	createdAt: '2026-07-01T00:00:00.000Z',
	status: 'COMPLETED'
}

const base = {
	...HEADER,
	// employee-authored — theirs in both states
	selfAssessment: 'I shipped the payroll module.',
	employeeComments: 'Noted, thank you.',
	// evaluator/HR-authored — gated
	managerComments: 'Exceeds expectations; promote next cycle.',
	overallRating: 5,
	answers: ANSWERS
}

const unreleased = { ...base, releasedAt: null }
const released = { ...base, releasedAt: new Date('2026-08-27T02:00:00Z') }

describe('redactForSubject — UNRELEASED withholds everything evaluator-authored (#178 AC6)', () => {
	it('nulls the whole answers blob', () => {
		expect(redactForSubject(unreleased).answers).toBeNull()
	})

	it('nulls the pre-#178 manager comments and rating columns too', () => {
		const r = redactForSubject(unreleased)
		expect(r.managerComments).toBeNull()
		expect(r.overallRating).toBeNull()
	})

	it('leaves no evaluator-typed value anywhere in the returned object', () => {
		const serialized = JSON.stringify(redactForSubject(unreleased))
		for (const token of EVALUATOR_TOKENS) {
			expect(serialized).not.toContain(token)
		}
	})
})

describe('redactForSubject — RELEASED hands the evaluation over (#178 AC6/AC7)', () => {
	it('returns answers intact', () => {
		expect(redactForSubject(released).answers).toEqual(ANSWERS)
	})

	it('returns the manager comments and rating intact', () => {
		const r = redactForSubject(released)
		expect(r.managerComments).toBe('Exceeds expectations; promote next cycle.')
		expect(r.overallRating).toBe(5)
	})

	it('every withheld token is now present — the negative control for the block above', () => {
		// Without this, the unreleased assertions would still pass if the function nulled
		// unconditionally, which is exactly the bug the gate replaces.
		const serialized = JSON.stringify(redactForSubject(released))
		for (const token of EVALUATOR_TOKENS) {
			expect(serialized).toContain(token)
		}
	})
})

describe('redactForSubject — what the subject keeps in BOTH states', () => {
	for (const [label, review] of [
		['unreleased', unreleased],
		['released', released]
	] as const) {
		it(`${label}: the employee-authored columns are theirs`, () => {
			const r = redactForSubject(review)
			expect(r.selfAssessment).toBe('I shipped the payroll module.')
			expect(r.employeeComments).toBe('Noted, thank you.')
		})

		it(`${label}: the shared header survives`, () => {
			const r = redactForSubject(review)
			expect(r.employee).toEqual(HEADER.employee)
			expect(r.department).toEqual(HEADER.department)
			expect(r.cycle).toEqual(HEADER.cycle)
			expect(r.reviewer).toEqual(HEADER.reviewer)
			expect(r.createdAt).toBe(HEADER.createdAt)
			expect(r.status).toBe('COMPLETED')
		})
	}
})

describe('redactForSubject — withheld by default, and never mutates its input', () => {
	it('redacts a review whose releasedAt was never selected (undefined, not null)', () => {
		// A caller that forgets the column must get the SAFE answer. `undefined` is falsy, so the
		// gate closes — the failure mode is "the employee sees nothing", not "the employee sees all".
		const { releasedAt: _omitted, ...noColumn } = unreleased
		expect(redactForSubject(noColumn as typeof unreleased).answers).toBeNull()
	})

	it('does not mutate the original review', () => {
		redactForSubject(unreleased)
		redactForSubject(released)
		for (const review of [unreleased, released]) {
			expect(review.managerComments).toBe('Exceeds expectations; promote next cycle.')
			expect(review.overallRating).toBe(5)
			expect(review.answers).toEqual(ANSWERS)
		}
	})
})
