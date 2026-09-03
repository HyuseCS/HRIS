import { fail, redirect } from '@sveltejs/kit'
import { lucia } from '$lib/server/auth'
import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { checkRateLimit, recordFailure, recordSuccess } from '$lib/server/rate-limit'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import type { Actions, PageServerLoad } from './$types'

// Deliberate non-enumeration: one answer for a wrong password, an unknown email and a
// valid credential paired with an org the account does not belong to.
const GENERIC = 'Invalid email or password'

const resolveSchema = z.object({ email: z.string().email() })

const signinSchema = z.object({
	email: z.string().email(),
	password: z.string().min(1),
	// Optional. Posted only by the multi-org picker; when it is absent the server uses the
	// org it resolved itself. A posted value is never trusted — see the membership check.
	selectedOrg: z.string().min(1).optional()
})

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(302, '/dashboard')
}

/**
 * Resolve which orgs an email belongs to, for step 1 (`?/resolve`) and for the org the
 * session lands in (`?/signin`).
 *
 * The query shape is identical for every email — one `findUnique`, then branching in
 * memory, with no early return before the read — so the response cannot differ by input.
 * `orgs` is returned ONLY when the set has two or more entries: unknown, malformed,
 * inactive, zero-membership and single-org emails all yield `[]`, which is what keeps a
 * zero-org email byte-indistinguishable from a single-org one.
 *
 * `email` is passed through exactly as submitted, matching the non-lowercased
 * `findUnique` in `?/signin` so the two lookups always agree. See backlog note
 * `login-timing-parity_NOTE_03-09-26.md` (D4).
 */
async function resolveLoginOrgs(email: string) {
	const user = await db.user.findUnique({
		where: { email },
		select: {
			id: true,
			isActive: true,
			organizationId: true,
			organization: { select: { id: true, name: true } },
			memberships: { select: { organization: { select: { id: true, name: true } } } }
		}
	})

	// A deactivated account discloses no membership. Without this, a disabled multi-org
	// account would still have its whole org list returned at `?/resolve` while being
	// unable to sign in.
	if (!user || !user.isActive) return { userId: null, orgs: [], soleOrgId: null }

	const byId = new Map<string, { id: string; name: string }>()
	byId.set(user.organization.id, user.organization)
	for (const m of user.memberships) byId.set(m.organization.id, m.organization)
	const all = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))

	return {
		userId: user.id,
		orgs: all.length >= 2 ? all : [],
		soleOrgId: all.length === 1 ? all[0].id : null
	}
}

export const actions: Actions = {
	// Step 1. Exactly one response shape for every input, forever — `{ email, orgs }`, never
	// a `fail()`. A malformed email does no read at all and still returns that same object,
	// so step 1 can never tell a known email from an unknown one.
	resolve: async ({ request }) => {
		const formData = Object.fromEntries(await request.formData())
		const parsed = resolveSchema.safeParse(formData)

		if (!parsed.success) return { email: String(formData.email ?? ''), orgs: [] }

		const r = await resolveLoginOrgs(parsed.data.email)
		return { email: parsed.data.email, orgs: r.orgs }
	},

	// Step 2. Every failure carries `email` and `orgs` back so the page re-renders step 2
	// with the typed email retained instead of collapsing to step 1.
	signin: async ({ request, cookies, getClientAddress }) => {
		const formData = Object.fromEntries(await request.formData())
		const parsed = signinSchema.safeParse(formData)

		if (!parsed.success) {
			return fail(400, { error: GENERIC, email: String(formData.email ?? ''), orgs: [] })
		}

		const { email, password, selectedOrg } = parsed.data
		const ip = getClientAddress()
		const rateKey = `${ip}:${email.toLowerCase()}`

		const gate = checkRateLimit(rateKey)
		if (!gate.allowed) {
			const minutes = Math.ceil(gate.retryAfterMs / 60000)
			// No DB read on a lockout: a locked-out account does no resolution work. A
			// multi-org user loses their picker on this re-render; that is the safer trade.
			return fail(429, {
				error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
				email,
				orgs: []
			})
		}

		const r = await resolveLoginOrgs(email)
		// Kept as a second read so the password hash and roles are fetched exactly as before:
		// `resolveLoginOrgs` deliberately never selects `passwordHash`.
		const user = await db.user.findUnique({ where: { email } })

		if (!user || !user.isActive) {
			recordFailure(rateKey)
			return fail(401, { error: GENERIC, email, orgs: r.orgs })
		}

		const validPassword = await bcrypt.compare(password, user.passwordHash)

		// The two-step Veent HRIS login (#135) now resolves the org server-side. A
		// `selectedOrg` is posted only by the multi-org picker, and a posted value is
		// attacker-controlled, so it is checked against the account's real memberships
		// (primary org or a UserOrganization row) exactly as before — same tenant-isolation
		// boundary the org switcher enforces. When nothing is posted the org came from the
		// server's own resolution and cannot have been forged, so the check is skipped and a
		// user with no single org fails generically.
		const resolvedOrgId = selectedOrg ?? r.soleOrgId
		const isMember = selectedOrg
			? user.organizationId === selectedOrg ||
				(await db.userOrganization.findUnique({
					where: { userId_organizationId: { userId: user.id, organizationId: selectedOrg } }
				})) !== null
			: r.soleOrgId !== null

		if (!validPassword || !isMember || !resolvedOrgId) {
			recordFailure(rateKey)
			// #5: deliberately NOT transactional — `db`, not a `tx`. No mutation happens on a failed
			// login, so there is nothing to roll back with; the audit row IS the event.
			await writeAuditLog(
				{
					organizationId: user.organizationId,
					actorId: user.id,
					actorRoles: user.roles,
					ipAddress: ip
				},
				{ action: 'LOGIN_FAILED', entityType: 'User', entityId: user.id },
				db
			)
			return fail(401, { error: GENERIC, email, orgs: r.orgs })
		}

		recordSuccess(rateKey)

		// Land the session in the resolved tenant (drives currentOrgId; a CEO who belongs to
		// every org starts in the one they picked, then switches). Never null — the guard
		// above returns first.
		const session = await lucia.createSession(user.id, { currentOrgId: resolvedOrgId })
		const sessionCookie = lucia.createSessionCookie(session.id)

		cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		})

		// #5: deliberately NOT transactional — `db`, not a `tx`. The session cookie is already set
		// above, so the login has happened; pairing this with `lastLoginAt` in one transaction would
		// let a bookkeeping write failure erase the record of a session that exists.
		await Promise.all([
			db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
			writeAuditLog(
				{
					organizationId: resolvedOrgId,
					actorId: user.id,
					actorRoles: user.roles,
					ipAddress: ip
				},
				{ action: 'LOGIN', entityType: 'User', entityId: user.id },
				db
			)
		])

		redirect(302, '/dashboard')
	}
}
