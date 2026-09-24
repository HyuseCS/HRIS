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
	password: z.string().min(1)
})

const DUMMY_HASH = '$2b$12$Zk.FRyDrUxKCnZx/bFGiIO4y.2eAjBetoJQLGTHPAvKRpwH26Wpwe'

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) redirect(302, '/dashboard')
	return { accountDisabled: url.searchParams.get('error') === 'account_disabled' }
}

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const formData = Object.fromEntries(await request.formData())
		const parsed = loginSchema.safeParse(formData)

		if (!parsed.success) {
			return fail(400, { error: 'Invalid email or password' })
		}

		const { email, password } = parsed.data
		const ip = getClientAddress()
		const rateKey = `${ip}:${email.toLowerCase()}`

		const gate = checkRateLimit(rateKey)
		if (!gate.allowed) {
			const minutes = Math.ceil(gate.retryAfterMs / 60000)
			return fail(429, {
				error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
			})
		}

		const user = await db.user.findFirst({
			where: { email: { equals: email, mode: 'insensitive' } }
		})

		const validPassword = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)

		if (!user) {
			recordFailure(rateKey)
			return fail(401, { error: 'Invalid email or password' })
		}

		if (!user.isActive || !validPassword) {
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

		// Land the session in the user's own org (drives currentOrgId; a multi-org user
		// starts in their home org, then switches).
		const session = await lucia.createSession(user.id, { currentOrgId: user.organizationId })
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
					organizationId: user.organizationId,
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
