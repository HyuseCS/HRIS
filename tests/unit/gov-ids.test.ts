import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
	normalizeGovId,
	isValidGovId,
	govIdError,
	govIdSchema,
	GOV_ID_FORMATS,
	type GovIdField
} from '../../src/lib/utils/gov-ids'

/**
 * #191 statutory ID formats. Entry accepts whatever HR types; storage is canonical.
 */

describe('normalizeGovId — canonical output', () => {
	const cases: [GovIdField, string, string][] = [
		['sssNumber', '3412345678', '34-1234567-8'],
		['sssNumber', '34-1234567-8', '34-1234567-8'],
		['sssNumber', '34 1234567 8', '34-1234567-8'],
		['philhealthNumber', '123456789012', '12-345678901-2'],
		['pagibigNumber', '123456789012', '1234-5678-9012'],
		// 9-digit TIN is the base number; 12 adds the branch code.
		['tinNumber', '123456789', '123-456-789'],
		['tinNumber', '123456789000', '123-456-789-000'],
		// No grouping for these two — the value is the digits.
		['gcashNumber', '0917 123 4567', '09171234567'],
		['bankAccountNumber', '1234-567890', '1234567890']
	]

	for (const [field, input, expected] of cases) {
		it(`${field}: "${input}" → "${expected}"`, () => {
			expect(normalizeGovId(field, input)).toBe(expected)
		})
	}

	it('is idempotent — re-saving an already-canonical value does not change it', () => {
		for (const field of Object.keys(GOV_ID_FORMATS) as GovIdField[]) {
			const canonical = normalizeGovId(field, GOV_ID_FORMATS[field].example)
			expect(canonical, field).not.toBeNull()
			expect(normalizeGovId(field, canonical as string), field).toBe(canonical)
		}
	})

	it('every documented example is itself valid', () => {
		// Guards the table against a typo'd example that the form would then suggest.
		for (const field of Object.keys(GOV_ID_FORMATS) as GovIdField[]) {
			expect(isValidGovId(field, GOV_ID_FORMATS[field].example), field).toBe(true)
		}
	})
})

describe('normalizeGovId — rejection', () => {
	it('rejects the wrong digit count', () => {
		expect(normalizeGovId('sssNumber', '341234567')).toBeNull() // 9
		expect(normalizeGovId('sssNumber', '34123456789')).toBeNull() // 11
		expect(normalizeGovId('philhealthNumber', '12345678901')).toBeNull() // 11
	})

	it('rejects letters rather than stripping them', () => {
		// "SSS 34-1234567-8" must fail, not quietly become the number — otherwise a pasted
		// label would be stored as a valid ID.
		expect(normalizeGovId('sssNumber', 'SSS 34-1234567-8')).toBeNull()
		expect(normalizeGovId('tinNumber', '12345678X')).toBeNull()
	})

	it('rejects a TIN of 10 or 11 digits — only 9 or 12 exist', () => {
		expect(normalizeGovId('tinNumber', '1234567890')).toBeNull()
		expect(normalizeGovId('tinNumber', '12345678901')).toBeNull()
	})

	it('requires the GCash 09 prefix', () => {
		expect(normalizeGovId('gcashNumber', '19171234567')).toBeNull()
		expect(normalizeGovId('gcashNumber', '63917123456')).toBeNull()
		expect(normalizeGovId('gcashNumber', '09171234567')).toBe('09171234567')
	})

	it('rejects a bank account outside the accepted length range', () => {
		expect(normalizeGovId('bankAccountNumber', '123456789')).toBeNull() // 9
		expect(normalizeGovId('bankAccountNumber', '12345678901234567')).toBeNull() // 17
	})
})

describe('isValidGovId', () => {
	it('treats empty as valid — the field is optional, not malformed', () => {
		expect(isValidGovId('sssNumber', '')).toBe(true)
		expect(isValidGovId('sssNumber', '   ')).toBe(true)
		expect(isValidGovId('sssNumber', null)).toBe(true)
		expect(isValidGovId('sssNumber', undefined)).toBe(true)
	})

	it('flags a malformed stored value — this is what the employee page warns on', () => {
		expect(isValidGovId('sssNumber', '1234')).toBe(false)
	})
})

describe('govIdError', () => {
	it('names the field, the rule and an example', () => {
		expect(govIdError('sssNumber')).toBe('SSS must be 10 digits (e.g. 34-1234567-8)')
		expect(govIdError('tinNumber')).toBe('TIN must be 9 or 12 digits (e.g. 123-456-789-000)')
	})
})

describe('govIdSchema — absent, empty and value are three different things (#267)', () => {
	const S = z.object({ sssNumber: govIdSchema('sssNumber') })

	it('leaves an absent key absent — it is not part of the request', () => {
		expect('sssNumber' in S.parse({})).toBe(false)
	})

	it('maps an explicit empty string to null — that is the "clear it" instruction', () => {
		expect(S.parse({ sssNumber: '' }).sssNumber).toBeNull()
	})

	it('still canonicalises a value', () => {
		expect(S.parse({ sssNumber: '3412345678' }).sssNumber).toBe('34-1234567-8')
	})

	it('still rejects a malformed value', () => {
		const result = S.safeParse({ sssNumber: '1234' })
		expect(result.success).toBe(false)
		expect(result.error?.issues[0].message).toBe(govIdError('sssNumber'))
	})
})
