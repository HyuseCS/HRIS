import { lucia } from '$lib/server/auth'
import { redirect } from '@sveltejs/kit'
import { isSessionBlocked } from '$lib/server/access-guard'
import type { Handle, HandleServerError } from '@sveltejs/kit'

export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get(lucia.sessionCookieName)

	if (!sessionId) {
		event.locals.user = null
		event.locals.session = null
		return resolve(event)
	}

	const { session, user } = await lucia.validateSession(sessionId)

	if (session && session.fresh) {
		const sessionCookie = lucia.createSessionCookie(session.id)
		event.cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		})
	}

	if (!session) {
		const blankCookie = lucia.createBlankSessionCookie()
		event.cookies.set(blankCookie.name, blankCookie.value, {
			path: '.',
			...blankCookie.attributes
		})
	}

	// Cross-org members (#131) carry an active org on the session. Everything
	// downstream reads locals.user.organizationId for tenant isolation, so resolve
	// the effective org here: session.currentOrgId when set, else the primary org.
	event.locals.user =
		user && session
			? { ...user, organizationId: session.currentOrgId ?? user.organizationId }
			: user
	event.locals.session = session

	// #193: an offboarded employee's login is deactivated, so any session they still hold
	// is blocked here and bounced to the disabled-account screen.
	if (isSessionBlocked(user)) {
		redirect(302, '/login?error=account_disabled')
	}

	return resolve(event)
}

/**
 * Last line of defence for an unexpected error (phase 04).
 *
 * Without this hook SvelteKit hands the client the raw thrown message, which for a Prisma failure
 * is a multi-line invocation dump naming tables and columns. The user gets a short reference
 * instead; the detail stays in the server log, where the same ref ties the two together.
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	// A 404 is not a bug — "Not Found" is the honest message and needs no reference.
	if (status === 404) return { message }

	const ref = crypto.randomUUID().slice(0, 8)
	console.error('[error]', {
		ref,
		message: error instanceof Error ? error.message : String(error),
		stack: error instanceof Error ? error.stack : undefined,
		url: event.url.pathname,
		userId: event.locals.user?.id ?? null
	})

	return { message: `Something went wrong. (Ref: ${ref})` }
}
