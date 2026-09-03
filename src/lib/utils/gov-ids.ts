/**
 * Philippine statutory ID and disbursement-credential formats (#191).
 *
 * Shared (not `$lib/server`) because the same rules drive three things: the zod schemas that
 * reject bad input, the placeholder/hint on each form field, and the warning the employee page
 * shows next to a stored value that predates this validation. One table so those cannot drift.
 *
 * Entry accepts whatever HR types — bare digits, dashes, spaces — and the stored value is
 * normalised to one canonical shape, so the same ID does not end up in three forms across
 * records and exports.
 */

import { z } from 'zod'

export type GovIdField =
	| 'sssNumber'
	| 'philhealthNumber'
	| 'pagibigNumber'
	| 'tinNumber'
	| 'gcashNumber'
	| 'bankAccountNumber'

interface GovIdFormat {
	label: string
	/** Exact digit counts accepted. TIN takes 9 (base) or 12 (with branch code). */
	lengths: number[]
	/** Digits per dash-separated group, chosen by total length. Null → no grouping. */
	groups: Record<number, number[]> | null
	/** Required leading digits, if any. */
	prefix?: string
	example: string
	hint: string
}

export const GOV_ID_FORMATS: Record<GovIdField, GovIdFormat> = {
	sssNumber: {
		label: 'SSS',
		lengths: [10],
		groups: { 10: [2, 7, 1] },
		example: '34-1234567-8',
		hint: '10 digits'
	},
	philhealthNumber: {
		label: 'PhilHealth',
		lengths: [12],
		groups: { 12: [2, 9, 1] },
		example: '12-345678901-2',
		hint: '12 digits'
	},
	pagibigNumber: {
		label: 'Pag-IBIG',
		lengths: [12],
		groups: { 12: [4, 4, 4] },
		example: '1234-5678-9012',
		hint: '12 digits'
	},
	tinNumber: {
		// 9 digits is the base TIN; the extra 3 are the branch code (000 for head office).
		label: 'TIN',
		lengths: [9, 12],
		groups: { 9: [3, 3, 3], 12: [3, 3, 3, 3] },
		example: '123-456-789-000',
		hint: '9 or 12 digits'
	},
	gcashNumber: {
		// A Philippine mobile number — the wallet is keyed by it, so a wrong one pays a stranger.
		label: 'GCash',
		lengths: [11],
		groups: null,
		prefix: '09',
		example: '09171234567',
		hint: '11 digits starting 09'
	},
	bankAccountNumber: {
		// Deliberately loose: PH banks agree on no single length, so this only catches obvious
		// typos (letters, a truncated paste) rather than asserting a real format.
		label: 'Bank account',
		lengths: [10, 11, 12, 13, 14, 15, 16],
		groups: null,
		example: '1234567890',
		hint: '10–16 digits'
	}
}

/** Digits only — separators are input conveniences, never part of the value. */
function digitsOf(raw: string): string {
	return raw.replace(/\D/g, '')
}

/**
 * Canonical form of `raw`, or null when it does not match the field's format.
 * An empty/whitespace-only input is not a validation failure — it means "no value" — so
 * callers check for empty before calling this.
 */
export function normalizeGovId(field: GovIdField, raw: string): string | null {
	const format = GOV_ID_FORMATS[field]
	// Reject anything with characters that are neither digits nor separators, rather than
	// silently discarding them: "SSS 34-1234567-8" should fail, not become the number.
	if (!/^[\d\s-]*$/.test(raw)) return null

	const digits = digitsOf(raw)
	if (!format.lengths.includes(digits.length)) return null
	if (format.prefix && !digits.startsWith(format.prefix)) return null

	const groups = format.groups?.[digits.length]
	if (!groups) return digits

	const parts: string[] = []
	let at = 0
	for (const size of groups) {
		parts.push(digits.slice(at, at + size))
		at += size
	}
	return parts.join('-')
}

/** True when `value` is empty (nothing to check) or already a well-formed ID. */
export function isValidGovId(field: GovIdField, value: string | null | undefined): boolean {
	if (!value || !value.trim()) return true
	return normalizeGovId(field, value.trim()) !== null
}

/** Message shown when input is rejected, e.g. "SSS must be 10 digits (e.g. 34-1234567-8)". */
export function govIdError(field: GovIdField): string {
	const { label, hint, example } = GOV_ID_FORMATS[field]
	return `${label} must be ${hint} (e.g. ${example})`
}

/**
 * Zod field for a government ID / credential: trims, requires a well-formed value, and stores it
 * canonically. Three-way by design — absent stays `undefined` ("not part of this request"), an
 * explicit empty string becomes `null` ("clear it"), anything else is validated and canonicalised.
 *
 * #267: absent used to collapse to `null`. `.optional()` does not short-circuit a downstream
 * transform — it runs on `undefined` and its output is written back — so the key survived parsing
 * on every request, and a partial PATCH that never mentioned these fields wiped all four. Callers
 * that treat `null` as "leave unchanged" (the edit form) decide that themselves; the schema must
 * not decide it for them, or the API loses its only way to clear a stored ID.
 *
 * Lives here rather than in a server schema module so the create form, the edit form and the
 * API all validate through the same definition as the UI hints.
 */
export function govIdSchema(field: GovIdField) {
	return z
		.string()
		.trim()
		.optional()
		.transform((v) => (v === undefined ? undefined : v || null))
		.refine((v) => v == null || normalizeGovId(field, v) !== null, { message: govIdError(field) })
		.transform((v) => (v == null ? v : (normalizeGovId(field, v) as string)))
}
