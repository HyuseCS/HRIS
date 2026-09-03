import { fail, redirect } from '@sveltejs/kit'
import { lucia } from '$lib/server/auth'
import { db } from '$lib/server/db'
import { writeAuditLog } from '$lib/server/audit'
import { checkRateLimit, recordFailure, recordSuccess } from '$lib/server/rate-limit'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import type { Actions, PageServerLoad } from './$types'

const loginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(1),
	// The tenant chosen on the Avipa login (#135). Credentials are resolved against
	// this org: a valid email/password for an org the user doesn't belong to fails
	// with the same generic message, so login never reveals which tenant an account
	// lives in.
	selectedOrg: z.string().min(1)
})

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(302, '/dashboard')

	// Tenant selector options — every org is a login target under the Veent HRIS brand.
	// The owner has ruled that this list moves to an email-first step 1 in a later, auth-scoped
	// plan; until that plan ships, this query, `loginSchema` and the two-step flow stay as they
	// are. See process/features/ui-ux-overhaul/backlog/login-email-first-tenant-privacy_NOTE_03-09-26.md
	const orgs = await db.organization.findMany({
		select: { id: true, name: true },
		orderBy: { name: 'asc' }
	})
	return { orgs }
}

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const formData = Object.fromEntries(await request.formData())
		const parsed = loginSchema.safeParse(formData)

		if (!parsed.success) {
			return fail(400, { error: 'Invalid email or password' })
		}

		const { email, password, selectedOrg } = parsed.data
		const ip = getClientAddress()
		const rateKey = `${ip}:${email.toLowerCase()}`

		const gate = checkRateLimit(rateKey)
		if (!gate.allowed) {
			const minutes = Math.ceil(gate.retryAfterMs / 60000)
			return fail(429, {
				error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
			})
		}

		const user = await db.user.findUnique({ where: { email } })

		if (!user || !user.isActive) {
			recordFailure(rateKey)
			return fail(401, { error: 'Invalid email or password' })
		}

		const validPassword = await bcrypt.compare(password, user.passwordHash)

		// Membership is checked alongside the password so a correct credential paired
		// with the wrong tenant fails identically to a bad password — the selected org
		// must be one the user actually belongs to (primary org or a UserOrganization
		// row). This is the same tenant-isolation boundary the org switcher enforces.
		const isMember =
			user.organizationId === selectedOrg ||
			(await db.userOrganization.findUnique({
				where: { userId_organizationId: { userId: user.id, organizationId: selectedOrg } }
			})) !== null

		if (!validPassword || !isMember) {
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
			return fail(401, { error: 'Invalid email or password' })
		}

		recordSuccess(rateKey)

		// Land the session in the tenant the user picked (drives currentOrgId; a CEO
		// who belongs to every org starts in their selected tenant, then switches).
		const session = await lucia.createSession(user.id, { currentOrgId: selectedOrg })
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
					organizationId: selectedOrg,
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
