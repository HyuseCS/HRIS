import { describe, it, expect } from 'vitest'
import { isValidPhone, phoneError } from '$lib/utils/phone'

/**
 * #24 — the shared phone rule itself. The entry-point wiring is pinned separately in
 * phone-entry-points.test.ts; this file only pins what the rule accepts and rejects.
 *
 * The accepted list is the point of the test: the rule must NOT be a strict PH pattern. Real
 * numbers are already stored in every one of these shapes, so a rule that rejects any of them
 * would block editing records that are fine today.
 */

const ACCEPTED = [
	'09171234567', // PH mobile, bare
	'+639171234567', // PH mobile, E.164
	'0917 123 4567', // spaces
	'(02) 8123 4567', // brackets + area code
	'02-8123-4567', // dashes
	'02.8123.4567', // dots
	'8123456', // 7 digits — shortest accepted
	'+1 (415) 555-2671', // international
	'+441234567890123' // 15 digits — longest accepted
]

const REJECTED = [
	'abc', // the defect this rule exists for
	'0917abc4567', // letters mixed in
	'phone: 09171234567', // a label pasted in with the number
	'123456', // 6 digits — too short
	'+4412345678901234', // 16 digits — too long
	'++639171234567', // two plus signs
	'0917+1234567', // plus not at the front
	'0917_123_4567', // underscore is not a separator we strip
	'09/17/1234567' // slash is not a separator we strip
]

describe('isValidPhone (#24)', () => {
	it.each(ACCEPTED)('accepts %s', (value) => {
		expect(isValidPhone(value)).toBe(true)
	})

	it.each(REJECTED)('rejects %s', (value) => {
		expect(isValidPhone(value)).toBe(false)
	})

	// Empty is "no value", not a format failure — required fields pair this with their own
	// .min(1), so treating blank as invalid here would produce two errors for one mistake.
	it.each([undefined, null, '', '   '])('treats %s as nothing to check', (value) => {
		expect(isValidPhone(value)).toBe(true)
	})
})

describe('phoneError (#24)', () => {
	it('names the field and shows a correct example', () => {
		expect(phoneError('Emergency contact phone')).toContain('Emergency contact phone')
		expect(phoneError('Emergency contact phone')).toContain('09171234567')
	})

	it('defaults to a generic label', () => {
		expect(phoneError()).toMatch(/^Phone number must be/)
	})
})
