/**
 * Shared phone-number format rule (#24).
 *
 * `abc` used to be an acceptable phone number at every entry point: the server rules only checked
 * length, and `type="tel"` on an input validates nothing in any browser — it only picks a keyboard.
 *
 * Deliberately LENIENT. Real numbers are already stored, in every shape HR has ever typed, and a
 * strict `09XXXXXXXXX` pattern would reject them and block an otherwise-fine edit. The job here is
 * to catch letters and obvious garbage, not to assert a national format. Seven to fifteen digits
 * covers a PH mobile (11), a PH landline with area code (9-10) and international numbers, and the
 * optional leading `+` covers E.164 entry.
 *
 * Shared (not `$lib/server`) for the same reason as `gov-ids`: one definition behind the form
 * schemas, the API schemas and any hint text, so they cannot drift apart.
 */

/** Separators are entry conveniences, never part of the number. */
const SEPARATORS = /[\s().-]/g

const PHONE = /^\+?\d{7,15}$/

/**
 * True when `value` is empty (nothing to check — "no value" is not a format failure, so callers
 * that require a phone pair this with their own `.min(1)`) or is a plausible phone number.
 */
export function isValidPhone(value: string | null | undefined): boolean {
	if (!value || !value.trim()) return true
	return PHONE.test(value.replace(SEPARATORS, ''))
}

/** Message shown when input is rejected, e.g. "Phone must be 7-15 digits ...". */
export function phoneError(label = 'Phone number'): string {
	return `${label} must be 7-15 digits and may start with + (e.g. 09171234567). Spaces, dashes, dots and brackets are fine; letters are not.`
}
