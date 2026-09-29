import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// hooks.server.ts pulls in Lucia (and through it the Prisma adapter) purely for the `handle`
// hook; only `handleError` is under test here, so the auth module is stubbed out.
vi.mock('$lib/server/auth', () => ({ lucia: { sessionCookieName: 'session' } }))
vi.mock('$lib/server/access-guard', () => ({ isSessionBlocked: () => false }))

const { handleError } = await import('../../src/hooks.server')

/**
 * Phase 04 — without this hook SvelteKit hands the client the raw thrown message, which for a
 * Prisma failure is an invocation dump naming tables and columns. These tests pin that nothing
 * from the error itself reaches the client, and that the reference the user is shown is the same
 * one written to the log.
 */

const PRISMA_DUMP =
	'Invalid `db.employee.findUnique()` invocation:\n\n{ where: { id: "emp-1", ssn: "123-45-6789" } }'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (error: unknown, status = 500, message = 'Internal Error'): any =>
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(handleError as any)({
		error,
		status,
		message,
		event: { url: new URL('http://x/payroll/p1'), locals: { user: { id: 'u1' } } }
	})

describe('handleError', () => {
	let log: ReturnType<typeof vi.spyOn>

	beforeEach(() => {
		log = vi.spyOn(console, 'error').mockImplementation(() => {})
	})
	afterEach(() => log.mockRestore())

	it('returns a friendly string carrying a reference', () => {
		const out = call(new Error(PRISMA_DUMP))
		expect(out.message).toMatch(/^Something went wrong\. \(Ref: [0-9a-f]{8}\)$/)
	})

	it('never returns the error message or the stack', () => {
		const err = new Error(PRISMA_DUMP)
		const out = call(err)

		expect(out.message).not.toContain('invocation')
		expect(out.message).not.toContain('db.employee')
		expect(out.message).not.toContain('123-45-6789')
		const frame = err.stack!.split('\n').find((l) => l.trim().startsWith('at '))!
		expect(out.message).not.toContain(frame.trim())
		expect(JSON.stringify(out)).not.toContain('stack')
	})

	it('logs the same reference the user is shown, with the detail', () => {
		const out = call(new Error(PRISMA_DUMP))
		const ref = out.message.match(/Ref: ([0-9a-f]{8})/)![1]

		expect(log).toHaveBeenCalledOnce()
		const logged = log.mock.calls[0][1] as Record<string, unknown>
		expect(logged.ref).toBe(ref)
		expect(logged.message).toBe(PRISMA_DUMP)
		expect(logged.stack).toBeTypeOf('string')
		expect(logged.url).toBe('/payroll/p1')
		expect(logged.userId).toBe('u1')
	})

	it('gives every error its own reference', () => {
		expect(call(new Error('a')).message).not.toBe(call(new Error('b')).message)
	})

	it('handles a non-Error throw without leaking it', () => {
		const out = call('bare string with a secret')
		expect(out.message).not.toContain('secret')
		expect(log.mock.calls[0][1]).toMatchObject({ message: 'bare string with a secret' })
	})

	it('leaves a 404 alone — that is not a bug and needs no reference', () => {
		expect(call(new Error('Not found'), 404, 'Not Found')).toEqual({ message: 'Not Found' })
		expect(log).not.toHaveBeenCalled()
	})

	it('records a null userId for a signed-out visitor', () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		;(handleError as any)({
			error: new Error('boom'),
			status: 500,
			message: 'Internal Error',
			event: { url: new URL('http://x/login'), locals: {} }
		})
		expect(log.mock.calls[0][1]).toMatchObject({ userId: null })
	})
})
